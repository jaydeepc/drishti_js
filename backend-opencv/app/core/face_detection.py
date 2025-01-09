import cv2
import numpy as np
import face_recognition
from typing import List, Dict, Tuple, Optional
from pathlib import Path
from ..models.types import FaceMatch

class FaceDetector:
    def __init__(self):
        """Initialize face detection and feature extraction"""
        # No need to initialize ORB detector anymore
        pass
        
    def detect_faces(self, image: np.ndarray) -> List[Dict]:
        """Detect faces in image using dlib's HOG face detector"""
        # Convert BGR to RGB (face_recognition uses RGB)
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Detect face locations using HOG
        face_locations = face_recognition.face_locations(rgb_image, model="hog")
        
        results = []
        height, width = image.shape[:2]
        img_area = height * width
        
        for (top, right, bottom, left) in face_locations:
            # Calculate face size ratio
            face_area = (right - left) * (bottom - top)
            face_ratio = face_area / img_area
            
            # Filter out small faces (likely false detections)
            if face_ratio < 0.01:  # Less than 1% of image
                continue
                
            # Validate aspect ratio
            w = right - left
            h = bottom - top
            aspect_ratio = w / h
            if aspect_ratio < 0.5 or aspect_ratio > 1.5:  # Face should be roughly square
                continue
                
            results.append({
                'box': (left, top, w, h),
                'confidence': 1.0
            })
            
        return results
        
    def extract_face_roi(self, image: np.ndarray, box: Tuple[int, int, int, int], margin: float = 0.3) -> np.ndarray:
        """Extract face ROI with margin"""
        x, y, w, h = box
        
        # Add margin
        margin_x = int(w * margin)
        margin_y = int(h * margin)
        
        # Calculate ROI coordinates
        height, width = image.shape[:2]
        x1 = max(0, x - margin_x)
        y1 = max(0, y - margin_y)
        x2 = min(width, x + w + margin_x)
        y2 = min(height, y + h + margin_y)
        
        # Extract and resize ROI
        face_roi = image[y1:y2, x1:x2]
        return cv2.resize(face_roi, (160, 160))
        
    def get_face_features(self, face_roi: np.ndarray) -> Optional[Dict]:
        """Extract face embeddings using dlib's CNN face recognition model"""
        # Convert BGR to RGB
        rgb_roi = cv2.cvtColor(face_roi, cv2.COLOR_BGR2RGB)
        
        # Get face encodings
        encodings = face_recognition.face_encodings(rgb_roi)
        
        if not encodings:
            print("No face encodings found")
            return None
            
        return {
            'encoding': encodings[0]  # Use the first face encoding
        }
        
    def process_image(self, image: np.ndarray, prefix: str = "") -> List[Dict]:
        """Process image and return face information"""
        # Try all 4 orientations
        results = []
        for angle in [0, 90, 180, 270]:
            # Rotate image
            if angle == 0:
                rotated = image.copy()
            else:
                rotated = np.rot90(image, k=angle//90)
                
            print(f"{prefix}Processing {angle} degree rotation...")
            
            # Detect faces
            faces = self.detect_faces(rotated)
            if not faces:
                continue
                
            print(f"{prefix}Found {len(faces)} faces at {angle} degrees")
            
            # Process each face
            for face in faces:
                box = face['box']
                
                try:
                    # Extract face ROI
                    face_roi = self.extract_face_roi(rotated, box)
                    
                    # Get face features
                    features = self.get_face_features(face_roi)
                    if features is None:
                        print(f"{prefix}Failed to extract features, skipping")
                        continue
                    
                    # Calculate face size
                    face_size = box[2] * box[3]
                    print(f"{prefix}Face size: {face_size} pixels")
                    
                    results.append({
                        'roi': face_roi,
                        'encoding': features,
                        'angle': angle,
                        'size': face_size,
                        'box': {
                            'x': int(box[0]),
                            'y': int(box[1]),
                            'width': int(box[2]),
                            'height': int(box[3])
                        }
                    })
                except Exception as e:
                    print(f"{prefix}Error processing face: {str(e)}")
                    continue
                    
        # Sort results by size (larger faces are usually more reliable)
        results.sort(key=lambda x: x['size'], reverse=True)
        return results

    def compare_embeddings(self, features1: Dict, features2: Dict) -> float:
        """Compare face embeddings using dlib's face recognition model"""
        try:
            # Get face encodings
            encoding1 = features1['encoding']
            encoding2 = features2['encoding']
            
            # Calculate face distance
            face_distance = face_recognition.face_distance([encoding1], encoding2)[0]
            
            # Convert distance to similarity score (0-100)
            # face_distance < 0.6 usually means a match
            # Adjust sigmoid curve for better separation:
            # - Move midpoint from 0.5 to 0.45 (lower threshold)
            # - Increase steepness from 12 to 15
            # - Add boost for close matches
            base_similarity = 100 * (1 / (1 + np.exp((face_distance - 0.45) * 15)))
            
            # Add boost for close matches (face_distance < 0.5)
            # This will increase scores for similar faces while keeping dissimilar scores low
            if face_distance < 0.5:
                # Use quadratic boost for more aggressive scaling
                boost_factor = (0.5 - face_distance) ** 0.5  # Square root for smoother curve
                boost = boost_factor * 300  # Increased boost multiplier
                similarity = min(100, base_similarity + boost)
                
                # Additional boost for very close matches
                if face_distance < 0.35:
                    similarity = min(100, similarity * 1.2)  # 20% extra boost
            else:
                similarity = base_similarity
            
            print(f"Face distance: {face_distance:.3f}, Base similarity: {base_similarity:.2f}%, Final similarity: {similarity:.2f}%")
            
            return similarity
            
        except Exception as e:
            print(f"Error in similarity calculation: {str(e)}")
            return 0.0

# Create global detector instance
detector = FaceDetector()

def detect_faces_with_rotations(image: np.ndarray, prefix: str = "") -> List[FaceMatch]:
    """Detect faces in all rotations"""
    return detector.process_image(image, prefix)

def compare_face_encodings(embedding1: Dict, embedding2: Dict, angle1: Optional[float] = None, angle2: Optional[float] = None) -> float:
    """Compare face embeddings"""
    return detector.compare_embeddings(embedding1, embedding2)

def analyze_similarity(similarity: float) -> Dict:
    """Generate analysis based on similarity score"""
    threshold = 65  # Adjusted for face_recognition's scoring
    high_confidence = 80
    
    analysis = []
    if similarity > high_confidence:
        analysis.append("High confidence match - facial features align strongly")
        if similarity > 90:
            analysis.append("Very strong match with consistent core facial features")
    elif similarity > threshold:
        analysis.append("Possible match with some variations")
        analysis.append("Core facial features show similarity despite differences")
    else:
        analysis.append("Faces appear to be different")
        analysis.append("Significant differences in key facial features")
    
    if threshold < similarity < high_confidence:
        analysis.append("Differences may be due to age, expression, lighting, or angle")
        if similarity > 70:
            analysis.append("Despite variations, underlying facial structure shows consistency")
    
    return {
        'match': bool(similarity > threshold),
        'confidence': round(float(similarity), 2),
        'analysis': ". ".join(analysis) + "."
    }

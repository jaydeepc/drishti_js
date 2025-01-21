"""Face detection and comparison module.

This module provides functionality for detecting faces in images and comparing them
using face recognition models. It supports multiple face detection methods and
provides detailed analysis of face similarities.
"""

import cv2
import numpy as np
import face_recognition
from typing import List, Dict, Tuple, Optional, cast
from pathlib import Path
from ..models.types import Box, FaceFeatures, DetectedFace, ComparisonResult

class FaceDetectionError(Exception):
    """Base exception for face detection errors."""
    pass

class NoFaceDetectedError(FaceDetectionError):
    """Exception raised when no face is detected in an image."""
    pass

class FeatureExtractionError(FaceDetectionError):
    """Exception raised when face features cannot be extracted."""
    pass

class FaceDetector:
    """Handles face detection and feature extraction operations."""

    # Constants for face detection
    MIN_FACE_RATIO = 0.01  # Minimum face size relative to image
    MIN_ASPECT_RATIO = 0.5  # Minimum width/height ratio
    MAX_ASPECT_RATIO = 1.5  # Maximum width/height ratio
    FACE_MARGIN = 0.3      # Margin around detected face
    TARGET_SIZE = (160, 160)  # Size for face ROI normalization

    def __init__(self):
        """Initialize face detection and feature extraction."""
        pass

    def detect_faces(self, image: np.ndarray) -> List[Dict[str, Tuple[int, int, int, int] | float]]:
        """Detect faces in image using HOG face detector.
        
        Args:
            image: Input image in BGR format.
            
        Returns:
            List of dictionaries containing face locations and confidence scores.
            
        Raises:
            NoFaceDetectedError: If no valid faces are detected.
        """
        # Convert BGR to RGB (face_recognition uses RGB)
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Detect face locations using HOG
        face_locations = face_recognition.face_locations(rgb_image, model="hog")
        
        if not face_locations:
            raise NoFaceDetectedError("No faces detected in image")

        results = []
        height, width = image.shape[:2]
        img_area = height * width
        
        for (top, right, bottom, left) in face_locations:
            # Calculate face size ratio
            face_area = (right - left) * (bottom - top)
            face_ratio = face_area / img_area
            
            # Filter out small faces (likely false detections)
            if face_ratio < self.MIN_FACE_RATIO:
                continue
                
            # Validate aspect ratio
            w = right - left
            h = bottom - top
            aspect_ratio = w / h
            if not (self.MIN_ASPECT_RATIO <= aspect_ratio <= self.MAX_ASPECT_RATIO):
                continue
                
            results.append({
                'box': (left, top, w, h),
                'confidence': 1.0
            })
            
        if not results:
            raise NoFaceDetectedError("No valid faces found after filtering")
            
        return results

    def extract_face_roi(self, image: np.ndarray, box: Tuple[int, int, int, int]) -> np.ndarray:
        """Extract face ROI with margin.
        
        Args:
            image: Input image.
            box: Bounding box (x, y, width, height).
            
        Returns:
            Normalized face ROI image.
        """
        x, y, w, h = box
        
        # Add margin
        margin_x = int(w * self.FACE_MARGIN)
        margin_y = int(h * self.FACE_MARGIN)
        
        # Calculate ROI coordinates
        height, width = image.shape[:2]
        x1 = max(0, x - margin_x)
        y1 = max(0, y - margin_y)
        x2 = min(width, x + w + margin_x)
        y2 = min(height, y + h + margin_y)
        
        # Extract and resize ROI
        face_roi = image[y1:y2, x1:x2]
        return cv2.resize(face_roi, self.TARGET_SIZE)

    def get_face_features(self, face_roi: np.ndarray) -> Optional[FaceFeatures]:
        """Extract face embeddings using face recognition model.
        
        Args:
            face_roi: Face region image.
            
        Returns:
            Dictionary containing face encodings.
            
        Raises:
            FeatureExtractionError: If features cannot be extracted.
        """
        try:
            # Convert BGR to RGB
            rgb_roi = cv2.cvtColor(face_roi, cv2.COLOR_BGR2RGB)
            
            # Get face encodings
            encodings = face_recognition.face_encodings(rgb_roi)
            
            if not encodings:
                raise FeatureExtractionError("No face encodings found")
                
            return {'encoding': encodings[0].tolist()}
            
        except Exception as e:
            raise FeatureExtractionError(f"Failed to extract features: {str(e)}")

    def process_image(self, image: np.ndarray, prefix: str = "") -> List[DetectedFace]:
        """Process image and return face information.
        
        Args:
            image: Input image.
            prefix: Prefix for logging messages.
            
        Returns:
            List of detected faces with features and metadata.
            
        Raises:
            ValueError: If input image is invalid.
        """
        if image is None:
            raise ValueError("Input image is None")
            
        print(f"{prefix}Image shape: {image.shape}")
        
        results: List[DetectedFace] = []
        
        # Try all 4 orientations
        for angle in [0, 90, 180, 270]:
            print(f"{prefix}Processing rotation {angle} degrees...")
            
            try:
                # Rotate image
                rotated = np.rot90(image, k=angle//90) if angle else image.copy()
                print(f"{prefix}Rotated image shape: {rotated.shape}")
                
                # Detect faces
                faces = self.detect_faces(rotated)
                print(f"{prefix}Found {len(faces)} faces at {angle} degrees")
                
                # Process each face
                for face in faces:
                    box = cast(Tuple[int, int, int, int], face['box'])
                    
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
                        
                        # Transform box coordinates based on rotation
                        height, width = rotated.shape[:2]
                        transformed_box = {
                            'x': int(box[0]),
                            'y': int(box[1]),
                            'width': int(box[2]),
                            'height': int(box[3])
                        }
                        
                        # Adjust coordinates based on rotation angle
                        if angle == 90:
                            transformed_box = {
                                'x': height - (box[1] + box[3]),  # height - (y + h)
                                'y': box[0],                      # x
                                'width': box[3],                  # h
                                'height': box[2]                  # w
                            }
                        elif angle == 180:
                            transformed_box = {
                                'x': width - (box[0] + box[2]),   # width - (x + w)
                                'y': height - (box[1] + box[3]),  # height - (y + h)
                                'width': box[2],                  # w
                                'height': box[3]                  # h
                            }
                        elif angle == 270:
                            transformed_box = {
                                'x': box[1],                      # y
                                'y': width - (box[0] + box[2]),   # width - (x + w)
                                'width': box[3],                  # h
                                'height': box[2]                  # w
                            }
                            
                        results.append({
                            'roi': face_roi.tobytes(),
                            'encoding': features,
                            'angle': float(angle),
                            'size': face_size,
                            'box': transformed_box
                        })
                    except Exception as e:
                        print(f"{prefix}Error processing face: {str(e)}")
                        continue
                        
            except Exception as e:
                print(f"{prefix}Error during rotation: {str(e)}")
                continue
                    
        # Sort results by size (larger faces are usually more reliable)
        results.sort(key=lambda x: x['size'], reverse=True)
        return results

    def compare_embeddings(self, features1: FaceFeatures, features2: FaceFeatures) -> float:
        """Compare face embeddings using face recognition model.
        
        Args:
            features1: First face features.
            features2: Second face features.
            
        Returns:
            Similarity score (0-100).
        """
        try:
            # Get face encodings
            encoding1 = np.array(features1['encoding'])
            encoding2 = np.array(features2['encoding'])
            
            # Calculate face distance
            face_distance = face_recognition.face_distance([encoding1], encoding2)[0]
            
            # Convert distance to similarity score (0-100)
            # Using sigmoid curve for smooth transition
            # Midpoint at 0.5 (balanced threshold)
            # Steepness of 12 for gradual transition
            similarity = 100 * (1 / (1 + np.exp((face_distance - 0.5) * 12)))
            
            print(f"Face distance: {face_distance:.3f}, Similarity: {similarity:.2f}%")
            
            return similarity
            
        except Exception as e:
            print(f"Error in similarity calculation: {str(e)}")
            return 0.0

# Create global detector instance
detector = FaceDetector()

def detect_faces_with_rotations(image: np.ndarray, prefix: str = "") -> List[DetectedFace]:
    """Detect faces in all rotations.
    
    Args:
        image: Input image.
        prefix: Prefix for logging messages.
        
    Returns:
        List of detected faces.
    """
    return detector.process_image(image, prefix)

def compare_face_encodings(features1: FaceFeatures, features2: FaceFeatures) -> float:
    """Compare face embeddings.
    
    Args:
        features1: First face features.
        features2: Second face features.
        
    Returns:
        Similarity score.
    """
    return detector.compare_embeddings(features1, features2)

def analyze_similarity(similarity: float) -> ComparisonResult:
    """Generate analysis based on similarity score.
    
    Args:
        similarity: Similarity score (0-100).
        
    Returns:
        Analysis result with match status and description.
    """
    exact_match_threshold = 55  # Balanced threshold
    possible_match_threshold = 40  # Keep same threshold for possible matches
    
    analysis = []
    result = ""
    
    if similarity > exact_match_threshold:
        result = "EXACT_MATCH"
        analysis.append("Exact match - facial features align strongly")
        if similarity > 70:
            analysis.append("Very strong match with consistent core facial features")
    elif similarity > possible_match_threshold:
        result = "POSSIBLE_MATCH"
        analysis.append("Possible match with some variations")
        analysis.append("Core facial features show similarity despite differences")
        analysis.append("Variations may be due to age, expression, lighting, or angle")
    else:
        result = "NO_MATCH"
        analysis.append("No match - faces appear to be different")
        analysis.append("Significant differences in key facial features")
    
    return {
        'match': bool(similarity > possible_match_threshold),
        'confidence': round(float(similarity), 2),
        'analysis': ". ".join(analysis) + ".",
        'result': result,
        'referenceFace': {'box': Box()},  # Placeholder, filled by routes
        'actualFace': {'box': Box()}      # Placeholder, filled by routes
    }

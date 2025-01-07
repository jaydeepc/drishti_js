import os
import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import base64
import face_recognition
from typing import Tuple, List, Dict, Optional

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def decode_base64_image(base64_string):
    if 'base64,' in base64_string:
        base64_string = base64_string.split('base64,')[1]
    image_bytes = base64.b64decode(base64_string)
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    return image

def detect_face_id(image):
    """Detect face in ID card image"""
    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image data")
    
    # Convert BGR to RGB
    rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    
    # Try CNN model first for better accuracy
    face_locations = face_recognition.face_locations(rgb_image, model="cnn", number_of_times_to_upsample=0)
    
    # If CNN fails or finds no faces, try HOG model with different parameters
    if not face_locations:
        face_locations = face_recognition.face_locations(rgb_image, model="hog", number_of_times_to_upsample=2)
    
    if not face_locations:
        raise HTTPException(status_code=400, detail="No face detected in the ID card image")
    
    # Get the largest face for ID card
    face_location = max(face_locations, key=lambda loc: (loc[2] - loc[0]) * (loc[3] - loc[1]))
    top, right, bottom, left = face_location
    
    # Add margin
    height, width = image.shape[:2]
    margin_x = int((right - left) * 0.3)
    margin_y = int((bottom - top) * 0.3)
    
    # Extract face ROI with margin
    face_roi = image[
        max(0, top - margin_y):min(height, bottom + margin_y),
        max(0, left - margin_x):min(width, right + margin_x)
    ]
    
    # Get face encoding
    face_encoding = face_recognition.face_encodings(rgb_image, [face_location], num_jitters=3)[0]
    
    # Standardize face size
    face_roi = cv2.resize(face_roi, (160, 160))
    
    return face_roi, face_encoding, {
        'confidence': 1.0,
        'box': {
            'x': int(left),
            'y': int(top),
            'width': int(right - left),
            'height': int(bottom - top)
        }
    }

def detect_faces_in_photo(image) -> List[Dict]:
    """Detect all faces in photo"""
    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image data")
    
    # Convert BGR to RGB
    rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    
    # Detect faces using CNN model
    face_locations = face_recognition.face_locations(rgb_image, model="cnn", number_of_times_to_upsample=1)
    
    if not face_locations:
        # Try HOG model if CNN fails
        face_locations = face_recognition.face_locations(rgb_image, model="hog", number_of_times_to_upsample=2)
    
    if not face_locations:
        raise HTTPException(status_code=400, detail="No faces detected in the photo")
    
    faces = []
    for face_location in face_locations:
        top, right, bottom, left = face_location
        
        # Add margin
        height, width = image.shape[:2]
        margin_x = int((right - left) * 0.3)
        margin_y = int((bottom - top) * 0.3)
        
        # Extract face ROI with margin
        face_roi = image[
            max(0, top - margin_y):min(height, bottom + margin_y),
            max(0, left - margin_x):min(width, right + margin_x)
        ]
        
        # Get face encoding
        face_encoding = face_recognition.face_encodings(rgb_image, [face_location], num_jitters=3)[0]
        
        # Standardize face size for display
        face_roi_display = cv2.resize(face_roi, (160, 160))
        
        faces.append({
            'roi': face_roi_display,
            'encoding': face_encoding,
            'box': {
                'x': int(left),
                'y': int(top),
                'width': int(right - left),
                'height': int(bottom - top)
            }
        })
    
    return faces

def compare_face_encodings(encoding1, encoding2) -> float:
    """Compare two face encodings and return similarity score"""
    # Calculate face distance with multiple samples for robustness
    distances = []
    for _ in range(5):
        distance = face_recognition.face_distance([encoding1], encoding2)[0]
        distances.append(distance)
    
    # Use the best (minimum) distance
    face_distance = min(distances)
    
    # Convert distance to similarity score (0-100)
    return (1 - face_distance) * 100

def analyze_similarity(similarity: float) -> Dict:
    """Generate analysis based on similarity score"""
    threshold = 55
    high_confidence_threshold = 65
    
    analysis = []
    if similarity > high_confidence_threshold:
        analysis.append("High confidence match - facial features align strongly")
        if similarity > 75:
            analysis.append("Very strong match with consistent core facial features")
    elif similarity > threshold:
        analysis.append("Possible match with some variations")
        analysis.append("Core facial features show similarity despite differences")
    else:
        analysis.append("Faces appear to be different")
        analysis.append("Significant differences in key facial features")
    
    if threshold < similarity < high_confidence_threshold:
        analysis.append("Differences may be due to age, expression, lighting, or angle")
        if similarity > 60:
            analysis.append("Despite variations, underlying facial structure shows consistency")
    
    return {
        'match': bool(similarity > threshold),
        'confidence': round(float(similarity), 2),
        'analysis': ". ".join(analysis) + "."
    }

def save_face_image(face_img, prefix):
    os.makedirs('uploads', exist_ok=True)
    filename = f"{prefix}_{os.urandom(8).hex()}.jpg"
    filepath = os.path.join('uploads', filename)
    cv2.imwrite(filepath, face_img)
    return filename

@app.post("/api/match-faces")
async def match_faces(request_data: dict):
    try:
        # Extract base64 images
        id_image = decode_base64_image(request_data['expectedImage'])
        photo_image = decode_base64_image(request_data['actualImage'])
        
        # Detect face in ID card
        id_face, id_encoding, id_detection = detect_face_id(id_image)
        
        # Detect all faces in photo
        detected_faces = detect_faces_in_photo(photo_image)
        
        # Find best matching face
        best_match = None
        best_similarity = 0
        
        for face in detected_faces:
            similarity = compare_face_encodings(id_encoding, face['encoding'])
            if similarity > best_similarity:
                best_similarity = similarity
                best_match = face
        
        if not best_match:
            raise HTTPException(status_code=400, detail="No matching face found in the photo")
        
        # Generate analysis for best match
        comparison_result = analyze_similarity(best_similarity)
        
        # Save face images
        id_face_filename = save_face_image(id_face, 'id')
        photo_face_filename = save_face_image(best_match['roi'], 'photo')
        
        return {
            'match': bool(comparison_result['match']),
            'confidence': float(comparison_result['confidence']),
            'analysis': str(comparison_result['analysis']),
            'idCardFace': {
                'url': f'/uploads/{id_face_filename}',
                'box': id_detection['box']
            },
            'photoFace': {
                'url': f'/uploads/{photo_face_filename}',
                'box': best_match['box']
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Serve static files
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3002)

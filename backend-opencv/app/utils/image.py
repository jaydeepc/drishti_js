import cv2
import numpy as np
import base64

def decode_base64_image(base64_string: str) -> np.ndarray:
    """Decode base64 string to OpenCV image"""
    if 'base64,' in base64_string:
        base64_string = base64_string.split('base64,')[1]
    image_bytes = base64.b64decode(base64_string)
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    return image

def rotate_image(image: np.ndarray, angle: float) -> np.ndarray:
    """Rotate image with optimized quality/speed balance"""
    if abs(angle) < 0.1:  # Skip tiny rotations
        return image
        
    height, width = image.shape[:2]
    center = (width // 2, height // 2)
    
    rotation_matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    abs_cos = abs(rotation_matrix[0, 0])
    abs_sin = abs(rotation_matrix[0, 1])
    
    new_width = int(height * abs_sin + width * abs_cos)
    new_height = int(height * abs_cos + width * abs_sin)
    
    rotation_matrix[0, 2] += (new_width / 2) - center[0]
    rotation_matrix[1, 2] += (new_height / 2) - center[1]
    
    rotated = cv2.warpAffine(
        image,
        rotation_matrix,
        (new_width, new_height),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE
    )
    
    return rotated

def save_face_image(face_img: np.ndarray, prefix: str, upload_dir: str = 'uploads') -> str:
    """Save face image to disk and return filename"""
    import os
    
    os.makedirs(upload_dir, exist_ok=True)
    filename = f"{prefix}_{os.urandom(8).hex()}.jpg"
    filepath = os.path.join(upload_dir, filename)
    cv2.imwrite(filepath, face_img)
    return filename

def get_face_size(loc: tuple) -> int:
    """Calculate face size consistently"""
    height = abs(loc[2] - loc[0])  # bottom - top
    width = abs(loc[3] - loc[1])   # right - left
    return height * width

"""Image processing utilities.

This module provides utility functions for image processing operations,
including base64 encoding/decoding and image transformations.
"""

import cv2
import numpy as np
import base64
from typing import Optional

class ImageProcessingError(Exception):
    """Base exception for image processing errors."""
    pass

class ImageDecodingError(ImageProcessingError):
    """Exception raised when image decoding fails."""
    pass

class ImageFormatError(ImageProcessingError):
    """Exception raised when image format is invalid."""
    pass

def decode_base64_image(base64_string: str) -> Optional[np.ndarray]:
    """Decode base64 string to OpenCV image.
    
    Args:
        base64_string: Base64 encoded image string, optionally with data URL prefix.
            Example formats:
            - "data:image/jpeg;base64,/9j/4AAQSkZ..."
            - "/9j/4AAQSkZ..." (without prefix)
            
    Returns:
        Decoded image as numpy array in BGR format, or None if decoding fails.
        
    Raises:
        ImageDecodingError: If base64 decoding fails.
        ImageFormatError: If decoded data cannot be read as an image.
    """
    try:
        # Remove data URL prefix if present
        if ';base64,' in base64_string:
            # Split by ';base64,' and take the second part
            base64_string = base64_string.split(';base64,')[1]
        elif ',' in base64_string:
            # Fallback: split by comma if the specific delimiter isn't found
            base64_string = base64_string.split(',')[1]

        # Decode base64 to bytes
        try:
            image_bytes = base64.b64decode(base64_string)
        except Exception as e:
            raise ImageDecodingError(f"Failed to decode base64 string: {str(e)}")

        # Convert bytes to numpy array
        nparr = np.frombuffer(image_bytes, np.uint8)
        
        # Decode image
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image is None:
            raise ImageFormatError("Failed to decode image data")
            
        return image

    except ImageProcessingError:
        raise
    except Exception as e:
        raise ImageProcessingError(f"Unexpected error processing image: {str(e)}")

def rotate_image(image: np.ndarray, angle: float) -> np.ndarray:
    """Rotate image with optimized quality/speed balance.
    
    Args:
        image: Input image.
        angle: Rotation angle in degrees.
        
    Returns:
        Rotated image.
        
    Note:
        Uses bilinear interpolation and border replication for smooth results.
    """
    if abs(angle) < 0.1:  # Skip tiny rotations
        return image

    height, width = image.shape[:2]
    center = (width // 2, height // 2)

    # Get rotation matrix
    rotation_matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    
    # Calculate new dimensions
    abs_cos = abs(rotation_matrix[0, 0])
    abs_sin = abs(rotation_matrix[0, 1])
    new_width = int(height * abs_sin + width * abs_cos)
    new_height = int(height * abs_cos + width * abs_sin)

    # Adjust translation
    rotation_matrix[0, 2] += (new_width / 2) - center[0]
    rotation_matrix[1, 2] += (new_height / 2) - center[1]

    # Perform rotation
    rotated = cv2.warpAffine(
        image,
        rotation_matrix,
        (new_width, new_height),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE
    )

    return rotated

def get_face_size(box: tuple) -> int:
    """Calculate face size consistently.
    
    Args:
        box: Tuple of (top, right, bottom, left) coordinates.
        
    Returns:
        Face area in pixels.
    """
    height = abs(box[2] - box[0])  # bottom - top
    width = abs(box[3] - box[1])   # right - left
    return height * width

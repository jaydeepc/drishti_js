"""Core face detection and matching functionality"""
from .face_detection import (
    detect_faces_with_rotations,
    compare_face_encodings,
    analyze_similarity
)

__all__ = [
    'detect_faces_with_rotations',
    'compare_face_encodings',
    'analyze_similarity'
]

from typing import TypedDict, List, Dict, Optional

class FaceBox(TypedDict):
    x: int
    y: int
    width: int
    height: int

class FaceMatch(TypedDict):
    roi: bytes  # Face region image data
    encoding: Dict  # Face encoding features
    angle: int  # Rotation angle where face was detected
    size: int  # Face size in pixels
    box: FaceBox  # Face bounding box

class DetectedFace(TypedDict):
    url: str  # URL to access the face image
    box: FaceBox  # Face bounding box coordinates

class MatchResult(TypedDict):
    match: bool  # Whether faces match
    confidence: float  # Match confidence score
    analysis: str  # Detailed analysis text
    idCardFace: Optional[DetectedFace]  # Detected face in ID card
    photoFace: Optional[DetectedFace]  # Detected face in photo

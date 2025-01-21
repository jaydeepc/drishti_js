"""Data models and type definitions"""
from typing import List, Optional
from typing_extensions import TypedDict

class Box(TypedDict):
    x: int
    y: int
    width: int
    height: int

class FaceFeatures(TypedDict):
    encoding: List[float]

class DetectedFace(TypedDict):
    roi: bytes
    encoding: FaceFeatures
    angle: float
    size: int
    box: Box

class ComparisonResult(TypedDict):
    match: bool
    confidence: float
    analysis: str
    result: str
    referenceFace: dict[str, Box]
    actualFace: dict[str, Box]

class FaceMatchRequest(TypedDict):
    referenceImage: str
    actualImage: str

class ErrorResponse(TypedDict):
    error: str
    traceback: Optional[str]

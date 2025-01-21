"""Face matching API routes.

This module provides the API endpoints for face matching functionality,
handling image uploads, face detection, and comparison operations.
"""

import logging
from fastapi import APIRouter, HTTPException, status
from typing import Dict
from ..utils.image import decode_base64_image
from ..core.face_detection import (
    detect_faces_with_rotations,
    compare_face_encodings,
    analyze_similarity,
    NoFaceDetectedError,
    FeatureExtractionError
)
from ..models.types import FaceMatchRequest, ComparisonResult, ErrorResponse

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/match-faces", response_model=ComparisonResult)
async def match_faces(request_data: FaceMatchRequest) -> Dict:
    """Match faces between reference and actual photos.
    
    Args:
        request_data: Dictionary containing base64-encoded images.
            - referenceImage: Base64 string of reference photo
            - actualImage: Base64 string of actual photo
            
    Returns:
        Dictionary containing match results:
            - match: Boolean indicating if faces match
            - confidence: Similarity score (0-100)
            - analysis: Detailed analysis text
            - result: Match status (EXACT_MATCH, POSSIBLE_MATCH, NO_MATCH)
            - referenceFace: Detected face box in reference image
            - actualFace: Detected face box in actual image
            
    Raises:
        HTTPException: If image processing or face detection fails
    """
    try:
        # Extract and decode base64 images
        logger.info("Decoding reference image...")
        reference_image = decode_base64_image(request_data['referenceImage'])
        if reference_image is None:
            raise ValueError("Failed to decode reference image")
            
        logger.info("Decoding actual image...")
        actual_image = decode_base64_image(request_data['actualImage'])
        if actual_image is None:
            raise ValueError("Failed to decode actual image")

        # Process images sequentially to avoid memory issues
        logger.info("Processing reference image...")
        reference_faces = detect_faces_with_rotations(reference_image, "Reference: ")
        if not reference_faces:
            raise NoFaceDetectedError("No faces detected in reference image")
            
        logger.info("Processing actual image...")
        actual_faces = detect_faces_with_rotations(actual_image, "Actual: ")
        if not actual_faces:
            raise NoFaceDetectedError("No faces detected in actual image")

        # Find best matching pair across all rotations
        best_match = None
        best_reference_face = None
        best_similarity = 0

        for reference_face in reference_faces:
            for actual_face in actual_faces:
                # Compare face encodings
                similarity = compare_face_encodings(
                    reference_face['encoding'],
                    actual_face['encoding']
                )
                if similarity > best_similarity:
                    best_similarity = similarity
                    best_match = actual_face
                    best_reference_face = reference_face

        if not best_match:
            raise NoFaceDetectedError("No matching face found in the photo")

        logger.info(
            f"Best match found: Reference at {best_reference_face['angle']}°, "
            f"Actual at {best_match['angle']}°"
        )
        logger.info(f"Match confidence: {best_similarity}%")

        # Generate analysis for best match
        comparison_result = analyze_similarity(best_similarity)
        
        # Add face box information
        comparison_result['referenceFace'] = {'box': best_reference_face['box']}
        comparison_result['actualFace'] = {'box': best_match['box']}

        return comparison_result

    except NoFaceDetectedError as e:
        logger.warning(f"Face detection error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except FeatureExtractionError as e:
        logger.warning(f"Feature extraction error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except ValueError as e:
        logger.warning(f"Validation error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        import traceback
        error_details: ErrorResponse = {
            'error': str(e),
            'traceback': traceback.format_exc()
        }
        logger.error("Error details:", extra=error_details)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=error_details
        )

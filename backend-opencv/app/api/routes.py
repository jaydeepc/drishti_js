from fastapi import APIRouter, HTTPException
from typing import Dict
from ..utils.image import decode_base64_image, save_face_image
from ..core.face_detection import (detect_faces_with_rotations,
                                   compare_face_encodings, analyze_similarity)

router = APIRouter()


@router.post("/match-faces")
async def match_faces(request_data: dict) -> Dict:
    """Match faces between ID card and photo"""
    try:
        # Extract base64 images
        id_image = decode_base64_image(request_data['expectedImage'])
        photo_image = decode_base64_image(request_data['actualImage'])

        # Process ID and photo images sequentially to avoid memory issues
        id_faces = detect_faces_with_rotations(id_image, "ID: ")
        photo_faces = detect_faces_with_rotations(photo_image, "Photo: ")

        # Find best matching pair across all rotations
        best_match = None
        best_id_face = None
        best_similarity = 0

        for id_face in id_faces:
            for photo_face in photo_faces:
                similarity = compare_face_encodings(id_face['encoding'],
                                                    photo_face['encoding'])
                if similarity > best_similarity:
                    best_similarity = similarity
                    best_match = photo_face
                    best_id_face = id_face

        if not best_match:
            raise HTTPException(status_code=400,
                                detail="No matching face found in the photo")

        print(
            f"Best match found: ID at {best_id_face['angle']}°, Photo at {best_match['angle']}°"
        )
        print(f"Match confidence: {best_similarity}%")

        # Generate analysis for best match
        comparison_result = analyze_similarity(best_similarity)

        # Save face images
        id_face_filename = save_face_image(best_id_face['roi'], 'id')
        photo_face_filename = save_face_image(best_match['roi'], 'photo')

        return {
            'match': bool(comparison_result['match']),
            'confidence': float(comparison_result['confidence']),
            'analysis': str(comparison_result['analysis']),
            'idCardFace': {
                'url': f'/uploads/{id_face_filename}',
                'box': best_id_face['box']
            },
            'photoFace': {
                'url': f'/uploads/{photo_face_filename}',
                'box': best_match['box']
            }
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        error_details = {'error': str(e), 'traceback': traceback.format_exc()}
        print("Error details:", error_details)
        raise HTTPException(status_code=500, detail=error_details)

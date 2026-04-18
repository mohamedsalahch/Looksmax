"""API endpoint for validating profile photos using Gemini."""

import json
import logging
import re

from fastapi import APIRouter, HTTPException
from google.genai import types

from app.models.requests import ValidatePhotoRequest
from app.models.responses import ValidatePhotoResponse
from app.services.generator import ImageGenerator
from app.utils.image import b64_to_part

router = APIRouter(prefix="/api", tags=["validation"])
logger = logging.getLogger(__name__)

_generator: ImageGenerator | None = None
_VALIDATION_MODEL = "gemini-3-flash-preview"

VALIDATION_PROMPT = """You are a photo quality validator for a virtual try-on application.

Analyze the provided image and determine if it is suitable for virtual outfit try-on.

The image MUST meet ALL of these criteria:
- Shows exactly ONE person (no group photos)
- Person is STANDING upright in a natural pose
- Full body is visible (head to feet)
- Face is clearly visible and not obscured
- Good, even lighting (no heavy shadows or silhouettes)
- Person is the main subject, centered in the frame
- Photo is not blurry or heavily filtered

Respond with ONLY valid JSON, no other text:
{"valid": true} if ALL criteria are met
{"valid": false, "reason": "one short sentence explaining what is wrong"} if any criteria fail"""


def set_generator(generator: ImageGenerator | None) -> None:
    """Set the global image generator instance."""
    global _generator
    _generator = generator


def _parse_validation_response(text: str) -> dict:
    """Extract JSON from Gemini's text response."""
    match = re.search(r"\{[^}]+\}", text, re.DOTALL)
    if not match:
        return {"valid": False, "reason": "Could not parse validation response."}
    return json.loads(match.group(0))


@router.post("/validate-photo", response_model=ValidatePhotoResponse)
async def validate_photo(request: ValidatePhotoRequest):
    """Validate that an uploaded photo is a clear full-body standing photo of a person."""
    if _generator is None:
        raise HTTPException(status_code=500, detail="Generator not initialized")

    if not request.image or not request.image.strip():
        raise HTTPException(status_code=400, detail="image is required and cannot be empty")

    parts = [
        types.Part(text=VALIDATION_PROMPT),
        b64_to_part(request.image),
    ]

    try:
        response = await _generator.client.aio.models.generate_content(
            model=_VALIDATION_MODEL,
            contents=[types.Content(parts=parts)],
        )
    except Exception as e:
        logger.error(f"validate-photo: Gemini API error: {e}")
        raise HTTPException(status_code=502, detail=f"Validation request failed: {e}")

    if not response.candidates:
        raise HTTPException(status_code=502, detail="No response from validation model")

    text = response.candidates[0].content.parts[0].text
    logger.info(f"validate-photo: raw response: {text}")

    try:
        result = _parse_validation_response(text)
    except (json.JSONDecodeError, IndexError) as e:
        logger.error(f"validate-photo: failed to parse response: {e}")
        raise HTTPException(status_code=502, detail="Could not parse validation result")

    return ValidatePhotoResponse(
        valid=result.get("valid", False),
        reason=result.get("reason"),
    )

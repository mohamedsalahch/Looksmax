"""API endpoint for validating profile photos using Gemini."""

import json
import logging
import re
import asyncio

from fastapi import APIRouter, HTTPException
from google.genai import types

from app.models.requests import CompareFrontBackRequest
from app.models.requests import ValidatePhotoRequest
from app.models.responses import CompareFrontBackResponse
from app.models.responses import ValidatePhotoResponse
from app.services.generator import ImageGenerator
from app.services import dataset
from app.prompts.templates import (
    PHOTO_VALIDATION_PROMPT_VERSION,
    COMPARE_FRONT_BACK_PROMPT_VERSION,
)
from app.utils.image import b64_to_part

router = APIRouter(prefix="/api", tags=["validation"])
logger = logging.getLogger(__name__)

_generator: ImageGenerator | None = None
_VALIDATION_MODEL = "gemini-3-flash-preview"

VALIDATION_PROMPT = """Analyze the image to determine if the primary subject is suitable for a virtual clothing overlay.

CRITERIA:
1. SUBJECT: There must be one clear primary subject in the foreground. Ignore any people in the background or distance.
2. PROMINENCE: The primary subject must be the "main thing" in the photo (largest figure, in focus). They do NOT need to be perfectly centered.
3. POSE: Subject must be standing or upright. 
4. VISIBILITY: At minimum, the body from the HEAD to the KNEES must be fully visible within the frame.
5. LIGHTING/CLARITY: Subject must be well-lit enough to see body shape and clothing details. Night shots and outdoor backgrounds are perfectly fine as long as the subject is not a dark silhouette or very blurry.

Respond with ONLY valid JSON:
{"valid": true} if the primary subject meets these standards.
{"valid": false, "reason": "one short sentence explaining the specific issue"}"""

COMPARE_FRONT_BACK_PROMPT = """Classify this product photo view.

Return ONLY valid JSON:
{"view": "front" | "back" | "left" | "right" | "unknown", "reason": "short explanation"}

Rules:
- Use the actual image content, not the label.
- If the view is unclear or ambiguous, return "unknown".
- The response must be strict and conservative.
"""


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


async def _classify_product_view(image_base64: str, label: str) -> dict:
    if _generator is None:
        raise HTTPException(status_code=500, detail="Generator not initialized")

    parts = [
        types.Part(text=COMPARE_FRONT_BACK_PROMPT),
        types.Part(text=f"Label: {label.strip() or 'front'}"),
        b64_to_part(image_base64),
    ]

    response = await _generator.client.aio.models.generate_content(
        model=_VALIDATION_MODEL,
        contents=[types.Content(parts=parts)],
    )

    if not response.candidates:
        raise HTTPException(status_code=502, detail="No response from comparison model")

    text = response.candidates[0].content.parts[0].text
    logger.info(f"compare-front-back classification raw response ({label}): {text}")
    result = _parse_validation_response(text)
    view = str(result.get("view", "unknown")).strip().lower()
    reason = result.get("reason")
    if view not in {"front", "back", "left", "right", "unknown"}:
        view = "unknown"

    dataset.record(
        flow="compare_front_back",
        model=_VALIDATION_MODEL,
        prompt_version=COMPARE_FRONT_BACK_PROMPT_VERSION,
        prompt_text=COMPARE_FRONT_BACK_PROMPT,
        inputs={"photo": image_base64},
        outputs={},
        extra={"label": label, "view": view, "reason": reason},
    )

    return {"view": view, "reason": reason}


@router.post("/compare-front-back", response_model=CompareFrontBackResponse)
async def compare_front_back(request: CompareFrontBackRequest):
    """Compare front and back product photos and confirm they are different."""
    if _generator is None:
        raise HTTPException(status_code=500, detail="Generator not initialized")

    if not request.front or not request.front.strip() or not request.back or not request.back.strip():
        raise HTTPException(status_code=400, detail="front and back images are required and cannot be empty")

    try:
        front_result, back_result = await asyncio.gather(
            _classify_product_view(request.front, request.front_label or "front"),
            _classify_product_view(request.back, request.back_label or "back"),
        )
    except Exception as e:
        logger.error(f"compare-front-back: Gemini API error: {e}")
        raise HTTPException(status_code=502, detail=f"Comparison request failed: {e}")

    front_view = front_result.get("view", "unknown")
    back_view = back_result.get("view", "unknown")

    if front_view == "unknown" or back_view == "unknown":
        return CompareFrontBackResponse(
            valid=False,
            reason=front_result.get("reason") or back_result.get("reason") or "Could not confidently identify both product views.",
        )

    if front_view != "front" or back_view != "back":
        return CompareFrontBackResponse(
            valid=False,
            reason=f"Expected front/back order but detected {front_view} and {back_view}.",
        )

    return CompareFrontBackResponse(valid=True, reason=None)


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

    valid = bool(result.get("valid", False))
    reason = result.get("reason")

    dataset.record(
        flow="photo_validation",
        model=_VALIDATION_MODEL,
        prompt_version=PHOTO_VALIDATION_PROMPT_VERSION,
        prompt_text=VALIDATION_PROMPT,
        inputs={"photo": request.image},
        outputs={},
        extra={"valid": valid, "reason": reason},
    )

    return ValidatePhotoResponse(valid=valid, reason=reason)

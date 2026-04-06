"""API endpoints for clothes image generation."""

import logging

from fastapi import APIRouter, HTTPException

from app.models.requests import ClothesRequest
from app.models.responses import GenerationResponse, ImageResult
from app.services.generator import ImageGenerator

router = APIRouter(prefix="/api", tags=["clothes"])
logger = logging.getLogger(__name__)


# Global instance set by main app
_generator: ImageGenerator | None = None


def set_generator(generator: ImageGenerator) -> None:
    """Set the global image generator instance."""
    global _generator
    _generator = generator


@router.post("/generate", response_model=GenerationResponse)
async def generate_clothes_images(request: ClothesRequest):
    """
    Generate fashion images of a model wearing a clothing item.

    **Request:**
    - model_pictures: { front, back } - base64 encoded model images
    - product_pictures: { front, back } - base64 encoded garment images

    **Returns:**
    - 2 images: front view, back view
    """
    if _generator is None:
        raise HTTPException(status_code=500, detail="Generator not initialized")

    try:
        front_b64 = await _generator.generate_clothes_view(
            "front",
            request.model_pictures.front,
            request.model_pictures.back,
            request.product_pictures.front,
            request.product_pictures.back
        )

        back_b64 = await _generator.generate_clothes_view(
            "back",
            request.model_pictures.front,
            request.model_pictures.back,
            request.product_pictures.front,
            request.product_pictures.back
        )

        return GenerationResponse(images=[
            ImageResult(base64=front_b64),
            ImageResult(base64=back_b64)
        ])

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

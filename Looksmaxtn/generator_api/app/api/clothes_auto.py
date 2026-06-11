"""Fully-automated clothes generation: AI picks companion outfit, product stays hero."""

import logging
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

from app.models.requests import ModelPictures, ProductPictures, SecondaryColors
from app.models.responses import GenerationResponse, ImageResult, OutfitResponse
from app.services.generator import ImageGenerator
from app.services.webhook import send_webhook, send_error_webhook

router = APIRouter(prefix="/api", tags=["clothes-auto"])
logger = logging.getLogger(__name__)


_generator: ImageGenerator | None = None


def set_generator(generator: ImageGenerator | None) -> None:
    global _generator
    _generator = generator


class ClothesAutoRequest(BaseModel):
    job_id: str | None = None
    webhook_url: str | None = None
    model_pictures: ModelPictures
    product_pictures: ProductPictures
    secondary_colors: SecondaryColors | None = None


async def _process(job_id: str, webhook_url: str, request: ClothesAutoRequest):
    if _generator is None:
        return

    try:
        # Sequential: generate front first so back can use it as an outfit anchor.
        front_b64 = await _generator.generate_clothes_auto_view(
            "front",
            request.model_pictures.front,
            request.model_pictures.back,
            request.product_pictures.front,
            request.product_pictures.back,
            additional_instructions=(
                request.secondary_colors.additional_instructions
                if request.secondary_colors is not None
                else ""
            ),
        )
        await send_webhook(webhook_url, job_id, "front", front_b64)

        back_b64 = await _generator.generate_clothes_auto_view(
            "back",
            request.model_pictures.front,
            request.model_pictures.back,
            request.product_pictures.front,
            request.product_pictures.back,
            previous_view_image=front_b64,
            additional_instructions=(
                request.secondary_colors.additional_instructions
                if request.secondary_colors is not None
                else ""
            ),
        )
        await send_webhook(webhook_url, job_id, "back", back_b64)
    except Exception as e:
        logger.error(f"Job {job_id}: clothes-auto error: {e}")
        await send_error_webhook(webhook_url, job_id, f"Clothes auto generation failed: {e}")


@router.post("/generate-clothes-auto")
async def generate_clothes_auto(request: ClothesAutoRequest, background_tasks: BackgroundTasks):
    """Generate front + back model images. AI chooses companion garments to keep product as hero."""
    if _generator is None:
        raise HTTPException(status_code=500, detail="Generator not initialized")

    if request.job_id and request.webhook_url:
        background_tasks.add_task(
            _process,
            job_id=request.job_id,
            webhook_url=request.webhook_url,
            request=request,
        )
        return OutfitResponse(job_id=request.job_id, status="processing")

    try:
        front_b64 = await _generator.generate_clothes_auto_view(
            "front",
            request.model_pictures.front,
            request.model_pictures.back,
            request.product_pictures.front,
            request.product_pictures.back,
            additional_instructions=(
                request.secondary_colors.additional_instructions
                if request.secondary_colors is not None
                else ""
            ),
        )
        back_b64 = await _generator.generate_clothes_auto_view(
            "back",
            request.model_pictures.front,
            request.model_pictures.back,
            request.product_pictures.front,
            request.product_pictures.back,
            previous_view_image=front_b64,
            additional_instructions=(
                request.secondary_colors.additional_instructions
                if request.secondary_colors is not None
                else ""
            ),
        )
        return GenerationResponse(images=[
            ImageResult(base64=front_b64),
            ImageResult(base64=back_b64),
        ])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

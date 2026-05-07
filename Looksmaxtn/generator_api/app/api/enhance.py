import logging
from fastapi import APIRouter, HTTPException, BackgroundTasks

from app.models.requests import (
    AccessoryEnhanceRequest,
    GarmentEnhanceRequest,
)
from app.models.responses import GenerationResponse, ImageResult, OutfitResponse
from app.services.generator import ImageGenerator
from app.services.webhook import send_webhook, send_error_webhook

router = APIRouter(prefix="/api", tags=["enhance"])
logger = logging.getLogger(__name__)


_generator: ImageGenerator | None = None


def set_generator(generator: ImageGenerator | None) -> None:
    global _generator
    _generator = generator


GARMENT_VIEWS = ["front", "back"]
ACCESSORY_VIEWS = ["front", "back", "left", "right"]


async def process_garment_enhancement(job_id: str, webhook_url: str, request: GarmentEnhanceRequest):
    if _generator is None:
        return
    try:
        product_images = request.product_pictures.model_dump()
        for view in GARMENT_VIEWS:
            image_b64 = await _generator.enhance_garment_view(view, product_images[view])
            await send_webhook(webhook_url, job_id, view, image_b64)
    except Exception as e:
        logger.error(f"Job {job_id}: Garment enhancement error: {str(e)}")
        await send_error_webhook(webhook_url, job_id, f"Garment enhancement failed: {str(e)}")


async def process_accessory_enhancement(job_id: str, webhook_url: str, request: AccessoryEnhanceRequest):
    if _generator is None:
        return
    try:
        product_images = request.product_pictures.model_dump()
        provided_views = [view for view in ACCESSORY_VIEWS if product_images.get(view)]
        if not provided_views:
            await send_error_webhook(webhook_url, job_id, "No accessory images provided.")
            return
        for view in provided_views:
            image_b64 = await _generator.enhance_accessory_view(view, product_images[view])
            await send_webhook(webhook_url, job_id, view, image_b64)
    except Exception as e:
        logger.error(f"Job {job_id}: Accessory enhancement error: {str(e)}")
        await send_error_webhook(webhook_url, job_id, f"Accessory enhancement failed: {str(e)}")


@router.post("/enhance-garment")
async def enhance_garment_images(request: GarmentEnhanceRequest, background_tasks: BackgroundTasks):
    """Enhance front + back garment photos (mannequin removal, flat lay)."""
    if _generator is None:
        raise HTTPException(status_code=500, detail="Generator not initialized")

    if request.job_id and request.webhook_url:
        background_tasks.add_task(
            process_garment_enhancement,
            job_id=request.job_id,
            webhook_url=request.webhook_url,
            request=request,
        )
        return OutfitResponse(job_id=request.job_id, status="processing")

    try:
        product_images = request.product_pictures.model_dump()
        results = []
        for view in GARMENT_VIEWS:
            image_b64 = await _generator.enhance_garment_view(view, product_images[view])
            results.append(ImageResult(base64=image_b64))
        return GenerationResponse(images=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/enhance-accessory")
async def enhance_accessory_images(request: AccessoryEnhanceRequest, background_tasks: BackgroundTasks):
    """Enhance accessory photos (background cleanup). Any subset of views may be provided."""
    if _generator is None:
        raise HTTPException(status_code=500, detail="Generator not initialized")

    if request.job_id and request.webhook_url:
        background_tasks.add_task(
            process_accessory_enhancement,
            job_id=request.job_id,
            webhook_url=request.webhook_url,
            request=request,
        )
        return OutfitResponse(job_id=request.job_id, status="processing")

    try:
        product_images = request.product_pictures.model_dump()
        provided_views = [view for view in ACCESSORY_VIEWS if product_images.get(view)]
        if not provided_views:
            raise HTTPException(status_code=400, detail="At least one accessory image is required.")
        results = []
        for view in provided_views:
            image_b64 = await _generator.enhance_accessory_view(view, product_images[view])
            results.append(ImageResult(base64=image_b64))
        return GenerationResponse(images=results)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

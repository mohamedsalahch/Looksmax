import logging

from fastapi import APIRouter, HTTPException, BackgroundTasks , logger

from app.models.requests import ProxyRequest
from app.models.responses import ProxyResponse, OutfitResponse
from app.services.generator import ImageGenerator
from app.services.webhook import send_webhook

router = APIRouter(prefix="/api", tags=["proxy"])
logger = logging.getLogger(__name__)


# Global instance set by main app
_generator: ImageGenerator | None = None


def set_generator(generator: ImageGenerator) -> None:
    """Set the global image generator instance."""
    global _generator
    _generator = generator


async def process_proxy_generation(job_id: str, webhook_url: str, prompt: str, images: list[str]):
    """Background task to generate image via proxy and send webhook."""
    if _generator is None:
        return

    try:
        image = await _generator.generate_from_prompt(prompt, images)
        await send_webhook(
            webhook_url=webhook_url,
            job_id=job_id,
            view="result",
            image=image
        )
    except Exception as e:
        logger.error(f"Job {job_id}: Proxy error: {str(e)}")
        # Optionally send error webhook here if you have a model for it


@router.post("/proxy")
async def proxy_to_gemini(request: ProxyRequest, background_tasks: BackgroundTasks):
    """
    Proxy endpoint to Google Gemini API. Supports synchronous and asynchronous (webhook) modes.
    """
    if _generator is None:
        raise HTTPException(status_code=500, detail="Generator not initialized")

    # ASYNC MODE
    if request.job_id and request.webhook_url:
        background_tasks.add_task(
            process_proxy_generation,
            job_id=request.job_id,
            webhook_url=request.webhook_url,
            prompt=request.prompt,
            images=request.images
        )
        return OutfitResponse(job_id=request.job_id, status="processing")

    # SYNC MODE
    try:
        logger.info("=== PROXY REQUEST START (SYNC) ===")
        image = await _generator.generate_from_prompt(request.prompt, request.images)
        return ProxyResponse(image=image)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

"""Webhook service for sending notifications."""

import logging
from typing import Any

import httpx

from app.models.responses import WebhookPayload

import os

logger = logging.getLogger(__name__)

async def send_webhook(webhook_url: str, job_id: str, view: str, image: str) -> None:
    """Send webhook update with generated image.

    Args:
        webhook_url: The URL to send the webhook to
        job_id: The job identifier
        view: The view being sent ("front" or "back")
        image: Base64 encoded image
    """
    secret = os.getenv("OUTFIT_WEBHOOK_SECRET", "")
    headers = {}
    if secret:
        headers["x-webhook-secret"] = secret

    payload = WebhookPayload(
        job_id=job_id,
        view=view,
        image=image
    )

    async with httpx.AsyncClient() as client:
        try:
            await client.post(
                webhook_url, 
                json=payload.model_dump(), 
                headers=headers,
                timeout=30.0
            )
            logger.info(f"Webhook sent successfully for job {job_id}, view: {view}")
        except Exception as e:
            logger.error(f"Failed to send webhook for job {job_id}: {str(e)}")

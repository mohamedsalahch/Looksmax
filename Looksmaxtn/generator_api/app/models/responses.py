"""Response models for API endpoints."""

from pydantic import BaseModel


class ImageResult(BaseModel):
    """Single image result in base64 format."""
    base64: str


class GenerationResponse(BaseModel):
    """Response containing generated images."""
    images: list[ImageResult]


class ProxyResponse(BaseModel):
    """Response from proxy endpoint."""
    image: str  # base64 encoded image


class OutfitResponse(BaseModel):
    """Response from outfit generation endpoint."""
    job_id: str
    status: str


class WebhookPayload(BaseModel):
    """Payload for webhook notifications."""
    job_id: str
    view: str  # "front" or "back"
    image: str  # base64 encoded image
    error: str | None = None  # error message if generation failed


class ValidatePhotoResponse(BaseModel):
    """Response from photo validation endpoint."""
    valid: bool
    reason: str | None = None


class CompareFrontBackResponse(BaseModel):
    """Response from product view comparison endpoint."""
    valid: bool
    reason: str | None = None

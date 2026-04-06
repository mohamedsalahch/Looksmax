"""Models module."""

from app.models.requests import (
    ModelPictures,
    ProductPictures,
    ShoesProductPictures,
    ClothesRequest,
    ShoesRequest,
    ProxyRequest,
    BodyZone,
    BodyZones,
    OutfitRequest,
)

from app.models.responses import (
    ImageResult,
    GenerationResponse,
    ProxyResponse,
    OutfitResponse,
    WebhookPayload,
)

__all__ = [
    "ModelPictures",
    "ProductPictures",
    "ShoesProductPictures",
    "ClothesRequest",
    "ShoesRequest",
    "ProxyRequest",
    "BodyZone",
    "BodyZones",
    "OutfitRequest",
    "ImageResult",
    "GenerationResponse",
    "ProxyResponse",
    "OutfitResponse",
    "WebhookPayload",
]

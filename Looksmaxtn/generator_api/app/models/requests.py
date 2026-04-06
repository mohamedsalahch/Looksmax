"""Request models for API endpoints."""

from pydantic import BaseModel


class ModelPictures(BaseModel):
    """Model pictures for clothes generation."""
    front: str
    back: str


class ProductPictures(BaseModel):
    """Product pictures for clothes generation."""
    front: str
    back: str


class ShoesProductPictures(BaseModel):
    """Shoe product pictures from multiple angles."""
    front: str
    back: str
    left: str
    right: str


class ClothesRequest(BaseModel):
    """Request for clothes image generation."""
    model_pictures: ModelPictures
    product_pictures: ProductPictures


class ShoesRequest(BaseModel):
    """Request for shoes image generation."""
    product_pictures: ShoesProductPictures


class ProxyRequest(BaseModel):
    """Request for proxy endpoint."""
    prompt: str
    images: list[str]  # List of base64 encoded images


class BodyZone(BaseModel):
    """Represents a clothing zone with its images."""
    status: bool
    front: str = ""
    back: str = ""
    left: str = ""
    right: str = ""


class BodyZones(BaseModel):
    """Collection of all body zones for outfit generation."""
    headwear: BodyZone
    outerwear: BodyZone
    top: BodyZone
    bottom: BodyZone
    footwear: BodyZone


class OutfitRequest(BaseModel):
    """Request for outfit generation."""
    job_id: str
    webhook_url: str
    profile_picture: str  # base64 encoded image of the person
    height: str
    weight: str
    size: str
    body_zones: BodyZones

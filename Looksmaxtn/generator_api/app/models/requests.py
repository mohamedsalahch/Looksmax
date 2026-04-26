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


class ColorChoice(BaseModel):
    """A selected color (name + hex)."""
    name: str
    hex: str


class SecondaryColors(BaseModel):
    """Colors for the non-hero garment and the shoes."""
    garment: ColorChoice
    shoes: ColorChoice


class ClothesRequest(BaseModel):
    """Request for clothes image generation."""
    job_id: str | None = None
    webhook_url: str | None = None
    model_pictures: ModelPictures
    product_pictures: ProductPictures
    garment_zone: str = "top"
    secondary_colors: SecondaryColors | None = None


class ShoesRequest(BaseModel):
    """Request for shoes image generation."""
    job_id: str | None = None
    webhook_url: str | None = None
    product_pictures: ShoesProductPictures


class ProxyRequest(BaseModel):
    """Request for proxy endpoint."""
    job_id: str | None = None
    webhook_url: str | None = None
    prompt: str
    images: list[str]  # List of base64 encoded images


class BodyZone(BaseModel):
    """Represents a clothing zone with its images."""
    status: bool
    size: str = ""
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
    top_size: str
    bottom_size: str
    shoe_size: str
    body_zones: BodyZones


class ValidatePhotoRequest(BaseModel):
    """Request for profile photo validation."""
    image: str  # base64 encoded image

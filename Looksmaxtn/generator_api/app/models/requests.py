"""Request models for API endpoints."""

from pydantic import BaseModel, Field


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
    """Selected generation target and companion garments."""
    target: str = ""
    top_type: str = ""
    bottom_type: str = ""
    footwear_type: str = ""
    top: ColorChoice | None = None
    bottom: ColorChoice | None = None
    shoes: ColorChoice | None = None
    garment: ColorChoice | None = None
    additional_instructions: str = ""
    companion_prompt: str = ""


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


class GarmentProductPictures(BaseModel):
    """Garment product pictures (front + back)."""
    front: str
    back: str


class GarmentEnhanceRequest(BaseModel):
    """Request for garment image enhancement (mannequin removal, flat lay)."""
    job_id: str | None = None
    webhook_url: str | None = None
    product_pictures: GarmentProductPictures


class AccessoryProductPictures(BaseModel):
    """Accessory product pictures. Any subset of views may be provided."""
    front: str = ""
    back: str = ""
    left: str = ""
    right: str = ""


class AccessoryEnhanceRequest(BaseModel):
    """Request for accessory image enhancement (background cleanup)."""
    job_id: str | None = None
    webhook_url: str | None = None
    product_pictures: AccessoryProductPictures


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
    dress: BodyZone = Field(default_factory=lambda: BodyZone(status=False))
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


class CompareFrontBackRequest(BaseModel):
    """Request for comparing front and back product photos."""
    front: str
    back: str
    front_label: str = "front"
    back_label: str = "back"

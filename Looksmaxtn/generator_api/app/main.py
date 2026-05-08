"""Main FastAPI application initialization."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv


def load_service_env() -> None:
    """Load env files relative to the generator_api service root."""
    service_root = Path(__file__).resolve().parents[1]
    load_dotenv(service_root / ".env")

    environment = os.getenv("ENVIRONMENT", os.getenv("NODE_ENV", "")).strip().lower()
    if environment == "production":
        load_dotenv(service_root / ".env.production")


load_service_env()

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from google import genai

from app.api import clothes, enhance, outfit, proxy, shoes, validation
from app.services.generator import GeminiImageGenerator, ImageGenerator
from app.services.openai_generator import OpenAIImageGenerator

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Provider selection: "gemini" (default) or "openai".
PROVIDER = os.getenv("IMAGE_PROVIDER", "gemini").strip().lower()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "").strip()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_IMAGE_MODEL = os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-2").strip()

generator: ImageGenerator | None = None
if PROVIDER == "openai":
    if OPENAI_API_KEY:
        generator = OpenAIImageGenerator(api_key=OPENAI_API_KEY, model=OPENAI_IMAGE_MODEL)
        logger.info(f"Using OpenAI image generator (model={OPENAI_IMAGE_MODEL}).")
    else:
        logger.warning("IMAGE_PROVIDER=openai but OPENAI_API_KEY is not configured. Generation endpoints will fail.")
elif PROVIDER == "gemini":
    if GOOGLE_API_KEY:
        generator = GeminiImageGenerator(api_key=GOOGLE_API_KEY)
        logger.info("Using Gemini image generator.")
    else:
        logger.warning("GOOGLE_API_KEY is not configured. Generation endpoints will fail.")
else:
    logger.warning(f"Unknown IMAGE_PROVIDER={PROVIDER!r}; expected 'gemini' or 'openai'. Generation disabled.")

# Validation endpoints always use Gemini regardless of the chosen provider.
validation_client = genai.Client(api_key=GOOGLE_API_KEY) if GOOGLE_API_KEY else None
if validation_client is None:
    logger.warning("GOOGLE_API_KEY is not configured. Validation endpoints will return an initialization error.")

# Create FastAPI app
app = FastAPI(
    title="Fashion Image Generator API",
    description="AI-powered fashion image generation using Google Gemini",
    version="1.0.0"
)


# Set generator instance in all route modules
clothes.set_generator(generator)
shoes.set_generator(generator)
enhance.set_generator(generator)
outfit.set_generator(generator)
proxy.set_generator(generator)
validation.set_validation_client(validation_client)


# Include routers
app.include_router(clothes.router)
app.include_router(shoes.router)
app.include_router(enhance.router)
app.include_router(outfit.router)
app.include_router(proxy.router)
app.include_router(validation.router)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return JSONResponse(content={"status": "healthy"})


@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "name": "Fashion Image Generator API",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "clothes": "/api/generate",
            "shoes": "/api/generate-shoes",
            "enhance-garment": "/api/enhance-garment",
            "enhance-accessory": "/api/enhance-accessory",
            "outfit": "/api/generate_outfit",
            "proxy": "/api/proxy",
            "validate-photo": "/api/validate-photo",
            "compare-front-back": "/api/compare-front-back",
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "3003")))

"""Main FastAPI application initialization."""

import logging
import os
import secrets
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

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api import clothes, clothes_auto, description, enhance, outfit, proxy, shoes, validation
from app.services.generator import ImageGenerator

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# API Key
API_KEY = os.getenv("GOOGLE_API_KEY", "").strip()

# Initialize image generator only when credentials are configured.
generator = ImageGenerator(api_key=API_KEY) if API_KEY else None
if generator is None:
    logger.warning("GOOGLE_API_KEY is not configured. Generation endpoints will return an initialization error.")

# Create FastAPI app
app = FastAPI(
    title="Fashion Image Generator API",
    description="AI-powered fashion image generation using Google Gemini",
    version="1.0.0"
)


@app.middleware("http")
async def require_service_auth(request: Request, call_next):
    """Require back-end service auth for all cost-bearing generator routes."""
    if request.url.path.startswith("/api/"):
        expected_key = os.getenv("GENERATOR_API_KEY", "").strip()
        if not expected_key:
            logger.error("GENERATOR_API_KEY is not configured; refusing generator API request.")
            return JSONResponse(
                status_code=503,
                content={"detail": "Generator service authentication is not configured."},
            )

        authorization = request.headers.get("authorization", "")
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not secrets.compare_digest(token, expected_key):
            return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

    return await call_next(request)


# Set generator instance in all route modules
clothes.set_generator(generator)
shoes.set_generator(generator)
enhance.set_generator(generator)
outfit.set_generator(generator)
proxy.set_generator(generator)
validation.set_generator(generator)
description.set_generator(generator)
clothes_auto.set_generator(generator)


# Include routers
app.include_router(clothes.router)
app.include_router(shoes.router)
app.include_router(enhance.router)
app.include_router(outfit.router)
app.include_router(proxy.router)
app.include_router(validation.router)
app.include_router(description.router)
app.include_router(clothes_auto.router)


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
            "describe-product": "/api/describe-product",
            "generate-clothes-auto": "/api/generate-clothes-auto",
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "3003")))

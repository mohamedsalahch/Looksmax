"""Main FastAPI application initialization."""

import logging
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.api import clothes, outfit, proxy, shoes
from app.services.generator import ImageGenerator

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# API Key
API_KEY = os.getenv("GOOGLE_API_KEY", "AIzaSyAZncXialAKd7lUfitMmJ7Y1Aodon8VIJ0")

# Initialize image generator
generator = ImageGenerator(api_key=API_KEY)

# Create FastAPI app
app = FastAPI(
    title="Fashion Image Generator API",
    description="AI-powered fashion image generation using Google Gemini",
    version="1.0.0"
)


# Set generator instance in all route modules
clothes.set_generator(generator)
shoes.set_generator(generator)
outfit.set_generator(generator)
proxy.set_generator(generator)


# Include routers
app.include_router(clothes.router)
app.include_router(shoes.router)
app.include_router(outfit.router)
app.include_router(proxy.router)


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
            "outfit": "/api/generate_outfit",
            "proxy": "/api/proxy",
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

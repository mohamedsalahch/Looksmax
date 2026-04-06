# Fashion Image Generator API

AI-powered fashion image generation using Google Gemini AI.

## Project Structure

```
generator_api/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app initialization
│   ├── api/                 # API route handlers
│   │   ├── clothes.py       # Clothes generation endpoints
│   │   ├── shoes.py         # Shoes generation endpoints
│   │   ├── outfit.py        # Outfit generation endpoints
│   │   └── proxy.py         # Proxy endpoint
│   ├── models/              # Pydantic models
│   │   ├── requests.py      # Request schemas
│   │   └── responses.py     # Response schemas
│   ├── services/            # Business logic
│   │   ├── generator.py     # Image generation service
│   │   └── webhook.py       # Webhook service
│   ├── prompts/             # Prompt templates
│   │   └── templates.py     # AI prompt templates
│   └── utils/               # Utility functions
│       └── image.py         # Image utilities
├── tests/                   # Test files
├── requirements.txt         # Python dependencies
└── .env.example            # Environment variables example
```

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env and add your Google API key
   ```

3. Run the server:
   ```bash
   python -m app.main
   ```
   Or using uvicorn directly:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

## API Endpoints

- `GET /health` - Health check
- `GET /` - API info
- `POST /api/generate` - Generate clothes images
- `POST /api/generate-shoes` - Generate shoes images
- `POST /api/generate_outfit` - Generate outfit images (async with webhooks)
- `POST /api/proxy` - Proxy to Gemini API

## Testing

Run tests using pytest:
```bash
pytest tests/
```

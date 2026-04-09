# Looksmax Generator API

Python FastAPI service for product generation, outfit generation, and admin prompt-based image generation.

## Local

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m app.main
```

Runs on [http://localhost:3003](http://localhost:3003).

## Required Env

- `GOOGLE_API_KEY=...`
- `OUTFIT_WEBHOOK_SECRET=...`
- `PORT=3003`

## Production

- Public URL: `http://51.75.126.19:12003`
- Docker port: `3003`

## Docker

```bash
docker compose -f docker-compose.prod.yml up --build
```

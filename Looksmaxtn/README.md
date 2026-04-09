# LooksmaxTN Monorepo

LooksmaxTN is split into four deployable projects:

- `front`: customer storefront
- `admin`: admin dashboard
- `back`: shared Next.js backend for storefront and admin APIs
- `generator_api`: Python image-generation service

## Ports

### Local development

- `front`: `3000`
- `admin`: `3001`
- `back`: `3002`
- `generator_api`: `3003`

### Production

- `front`: `12000`
- `admin`: `12001`
- `back`: `12002`
- `generator_api`: `12003`

## Environment Files

- Commit only `*.env.example` and `*.env.production.example`
- Keep real `.env` and `.env.production` files local to the machine or server
- Production public URLs are based on `http://51.75.126.19`
- Docker-internal service URLs use service names like `back`, `mongodb`, and `generator_api`
- Uploads are deployment data and must live on a persistent shared volume mounted at `/shared-uploads` in Docker

## Run Locally

### App-by-app

```bash
cd front && npm run dev
cd admin && npm run dev
cd back && npm run dev
cd generator_api && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && python -m app.main
```

### With Docker Compose

```bash
docker compose up --build
```

## Deploy

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

## Repository Rules

- Uploaded and generated images live under `public/uploads` and are ignored by git
- In Docker deployments, uploaded and generated images must survive container recreation through the shared uploads volume
- Build artifacts like `.next`, `node_modules`, `venv`, and `*.egg-info` are ignored and can be deleted safely
- Shared secrets must stay aligned between `front`, `admin`, `back`, and `generator_api`

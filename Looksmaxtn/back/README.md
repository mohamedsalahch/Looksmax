# Looksmax Backend

Shared Next.js API for the storefront and admin applications.

## Route Namespaces

- `src/app/api/store`: storefront API routes
- `src/app/api/admin`: admin API routes

## Local

```bash
npm install
npm run dev
```

Runs on [http://localhost:3002](http://localhost:3002).

## Required Env

- `MONGODB_URI=mongodb://localhost:27017/looksmax`
- `BACKEND_BASE_URL=http://localhost:3002`
- `FRONTEND_BASE_URL=http://localhost:3000`
- `ADMIN_BASE_URL=http://localhost:3001`
- `PRODUCT_GENERATION_URL_BASE=http://localhost:3003/`
- `ADMIN_IMAGE_GENERATION_URL_BASE=http://localhost:3003`
- `OUTFIT_WEBHOOK_BASE_URL=http://localhost:3002`
- `OUTFIT_WEBHOOK_SECRET=...`
- `JWT_SECRET=...`

## Production

- Public URL: `http://51.75.126.19:12002`
- Internal generator URL: `http://generator_api:3003`
- MongoDB URL: `mongodb://mongodb:27017/looksmax-production`

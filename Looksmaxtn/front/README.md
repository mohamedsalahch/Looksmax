# Looksmax Storefront

Customer-facing storefront for browsing products, checkout, account pages, and outfit generation.

## Local

```bash
npm install
npm run dev
```

Runs on [http://localhost:3000](http://localhost:3000).

## Required Env

- `NEXT_PUBLIC_BACKEND_URL=http://localhost:3002`
- `BACKEND_PROXY_URL=http://127.0.0.1:3002`
- `NEXT_PUBLIC_BASE_URL=http://localhost:3000`
- `JWT_SECRET=...`

## Production

- Public URL: `http://51.75.126.19:12000`
- Backend URL: `http://51.75.126.19:12002`

## Docker

```bash
docker compose up --build front
```

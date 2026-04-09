# Looksmax Admin

Admin dashboard for catalog, orders, homepage content, users, and generated images.

## Local

```bash
npm install
npm run dev
```

Runs on [http://localhost:3001](http://localhost:3001).

## Required Env

- `NEXT_PUBLIC_BACKEND_URL=http://localhost:3002`
- `MONGODB_URI=mongodb://localhost:27017/looksmax`
- `JWT_SECRET=...`

## Production

- Public URL: `http://51.75.126.19:12001`
- Backend URL: `http://51.75.126.19:12002`

## Docker

```bash
docker compose up --build admin
```

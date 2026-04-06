# Looksmaxtn Structure

This repository is organized as three projects inside `Looksmaxtn/`.

## Main Layout

- `Looksmaxtn/front`
  Customer-facing storefront application.

- `Looksmaxtn/admin`
  Separate admin dashboard application.

- `Looksmaxtn/back`
  Shared backend API application.

## API Split

The API has been extracted into the backend project:

- storefront routes now live under `Looksmaxtn/back/src/app/api/store`
- admin routes now live under `Looksmaxtn/back/src/app/api/admin`

The `front` and `admin` apps keep using `/api/...` locally, but their requests are rewritten to the backend app.

## App Layers

Each project keeps its own local layers inside `src/`:

- `app`: routes, layouts, and API handlers
- `components`: reusable UI
- `providers`: React state/providers
- `lib`: helpers and infrastructure utilities
- `models`: MongoDB / Mongoose models

## Run Paths

- Storefront app path: `Looksmaxtn/front`
- Admin app path: `Looksmaxtn/admin`
- Backend app path: `Looksmaxtn/back`

## JWT Auth

Admin write access is protected with a JWT cookie:

- cookie name: `looksmax-admin-token`
- login route: `Looksmaxtn/back/src/app/api/admin/auth/login`
- protected admin API namespace: `Looksmaxtn/back/src/app/api/admin/*`
- protected admin pages: `Looksmaxtn/admin/src/app/dashboard/*`
- login response also returns `token`
- protected routes accept `Authorization: Bearer <token>` or the auth cookie

Set the same `JWT_SECRET` value in both:

- `Looksmaxtn/back/.env`
- `Looksmaxtn/admin/.env`

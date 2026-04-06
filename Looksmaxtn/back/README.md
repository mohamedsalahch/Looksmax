# Looksmaxtn Backend

This project is the shared backend API for Looksmaxtn.

## Route Namespaces

- `src/app/api/store`
  Storefront-facing API routes

- `src/app/api/admin`
  Admin-facing API routes

## Notes

- `front` rewrites `/api/*` to `back/api/store/*`
- `admin` rewrites `/api/*` to `back/api/admin/*`
- uploads are still written into the `front/public/uploads` and `admin/public/uploads` folders so existing asset paths keep working

## Admin JWT Protection

Admin-changing routes are protected with the `looksmax-admin-token` JWT cookie.

Admin and storefront login responses also return a JWT `token` in JSON.
Protected routes can be accessed with:

- cookie auth
- `Authorization: Bearer <token>`

Make sure `JWT_SECRET` is set in:

- `Looksmaxtn/back/.env`
- `Looksmaxtn/admin/.env`

and that both values are identical.

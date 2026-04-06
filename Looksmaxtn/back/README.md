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

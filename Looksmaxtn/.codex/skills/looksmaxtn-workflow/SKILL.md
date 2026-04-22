---
name: looksmaxtn-workflow
description: Use when working in the LooksmaxTN monorepo to follow the shared project rules for ports, env files, Docker, uploads, cleanup, and cross-project coordination across front, admin, back, and generator_api.
---

# LooksmaxTN Workflow

Use this skill for any task in this repository.

## Project Map

- `front`: Next.js storefront on local port `3000`, production port `12000`
- `admin`: Next.js admin on local port `3001`, production port `12001`
- `back`: Next.js backend on local port `3002`, production port `12002`
- `generator_api`: FastAPI service on local port `3003`, production port `12003`

## Working Rules

- Treat this repository as one coordinated system, not four isolated apps
- Check whether a change affects env values, Docker, API rewrites, or shared secrets before finishing
- Keep `JWT_SECRET` aligned across `front`, `admin`, and `back`
- Keep `OUTFIT_WEBHOOK_SECRET` aligned across `back` and `generator_api`
- Prefer public URLs with `https://looksmaxtn.com/` for browser-facing production values
- Prefer Docker service names like `back`, `mongodb`, and `generator_api` for container-to-container production calls
- Always think through deployment impact before finalizing a change, especially when files, uploads, rewrites, or inter-service paths are involved
- Treat uploaded media as persistent deployment data, not as disposable repo files

## Git and Files

- Never commit real `.env` or `.env.production` files
- Commit `*.env.example` and `*.env.production.example` when env surface changes
- Ignore uploads under `public/uploads`
- Never delete existing local or server upload assets as part of generic cleanup work
- Safe cleanup targets include `.next`, `node_modules`, `venv`, `.pytest_cache`, and `*.egg-info`
- Delete obvious unused boilerplate assets when they are not referenced anywhere

## Validation

- For local app runs, use the fixed port map `3000/3001/3002/3003`
- For Docker production validation, use `12000/12001/12002/12003`
- When changing Dockerfiles or compose, verify that Next rewrites still target the backend correctly
- When changing upload handling, verify both local filesystem mode and Docker shared-volume mode
- When touching generator startup, make sure `/health` still works even if generation credentials are missing

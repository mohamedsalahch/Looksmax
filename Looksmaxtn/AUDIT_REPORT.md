# LOOKSMAX Tunisia — Full-Stack Audit Report

**Scope:** back (storefront API), admin (seller/admin dashboard), front (storefront), generator_api (AI), infra (nginx/docker).
**Stack:** Next.js 16.2.6 (App Router, `proxy.ts` middleware), Mongoose 9 / MongoDB 4.4, jose JWT, bcryptjs, Cloudflare R2, FastAPI + Gemini.
**Evidence:** code review + the two committed Lighthouse runs (`lighthouse report.json`, `reportv2.json`).

---

## Executive Summary

The codebase is **better than average for an indie e-commerce build**. Authorization isolation between `admin` and `store_owner` is implemented consistently, stock decrements are atomic at the variant level (no oversell), uploads are validated by magic bytes (not just MIME), webhooks use HMAC + timing-safe compare, the CSP/security headers/nginx rate-limiting are genuinely strong, secrets are not committed, and SEO (100) / accessibility (96) are excellent.

It is **not launch-ready**, for two concrete reasons that are not security-cosmetic:

1. **Performance is a hard blocker.** The storefront product endpoint loads the *entire* catalog + *all* active reservations + *all* active orders on every call and paginates in JavaScript. Your own Lighthouse run measured an **11,640 ms root-document response** and **12.5 s LCP**. The homepage asks for 4 products and still pays this cost. This will collapse under real traffic and is bad even single-user.
2. **Money correctness.** Store-owner earnings crediting is non-idempotent, runs before the order status write, swallows errors, and uses no transaction — a retry or partial failure double-credits balances that are later withdrawn as real money.

Around these sit high-priority operational gaps: AI jobs can hang forever and burn a user's paid try, the generator API has no service auth, there is no error tracking at all (`console.error` only), newsletter/contact are unauthenticated spam funnels, and critical flows have no tests.

**Launch readiness: 62 / 100.** Fix the two criticals + the High list and this is comfortably an 85+.

---

## Critical Issues — must fix before launch

### C1. Catalog endpoint scans the whole collection on every request (11.6 s TTFB)
**Files:** `back/src/app/api/store/products/route.ts` (GET, lines 51–283); consumed by `front/src/app/page.tsx:35` and `front/src/app/category/[slug]/page.tsx:78`.

- **Risk:** `Product.find(filter).lean()` pulls every approved product with no `.limit()`/`.skip()`. Then `ProductReservation.find({ reservedUntil: { $gt: now } })` loads **all** reservations site-wide (line 107), `getActiveOrderHoldMapByProductIds` loads **all** active orders for every product id (line 110), and ranking/faceting/filtering/sorting/pagination all run in Node. `?limit=4` (homepage) still does all of this; `slice(skip, skip+limit)` happens last (line 270).
- **Impact:** Measured **11,640 ms** server response, **12.5 s LCP**, **17.3 s Speed Index** (`lighthouse report.json`). Every catalog/home/category view pays it; concurrent load multiplies DB and memory pressure → outage risk.
- **Reproduce:** `curl -w "%{time_total}\n" -o /dev/null -s https://looksmaxtn.com/api/store/products?limit=4` on a cold cache; compare with the committed report.
- **Fix:**
  - Push filtering + sort + pagination into MongoDB. Build the Mongo query from `category/brand/size/color/price/availability` and use `.find(query).sort(...).skip(skip).limit(limit)` + a separate `countDocuments`.
  - Scope reservation and order-hold lookups to the **page's** product ids only (you already do this in `cart/availability`): `ProductReservation.find({ product: { $in: pageIds }, reservedUntil: { $gt: now } })`.
  - Replace the per-request owner-approval join (lines 90–104) with a denormalized `ownerApproved`/`visible` boolean on the product, updated when a store is approved/blocked. Then `visible: true` is part of the index-backed query.
  - Add `Cache-Control: s-maxage=60, stale-while-revalidate=300` and keep `export const revalidate` on the pages.
  - Move search ranking to a MongoDB `$text` / Atlas Search index instead of JS ranking over the full set.
- **Priority:** Critical.

### C2. Store-owner earnings are credited non-idempotently, without a transaction
**Files:** `back/src/admin/lib/storeBalance.ts` (`creditOrderEarnings`, 178–237); `back/src/app/api/admin/orders/[id]/route.ts` PUT (222–253).

- **Risk:** On `shipping → delivered`, `creditOrderEarnings` reads each owner's balance, adds net, and `user.save()`s — **before** the order status is persisted (line 246), inside a `try/catch` that only logs (237–239). There is no check for an existing `earning` transaction for that order, and no DB transaction. If the credit succeeds but the subsequent `findByIdAndUpdate` fails (or the request is retried), earnings are credited **again**. A multi-owner order that throws mid-loop credits some owners, then double-credits them on retry.
- **Impact:** Inflated `user.balance` → withdrawn as real money (TND) via the withdrawal flow. Direct financial loss.
- **Reproduce:** Force an error after credit (e.g., kill the process between credit and status write), retry the status change; observe two `earning` transactions for one order in `StoreBalanceTransaction`.
- **Fix:**
  - Make it idempotent: before crediting, `StoreBalanceTransaction.findOne({ order, type: "earning", storeOwner })`; skip if present. Add a unique index `{ order: 1, storeOwner: 1, type: 1 }`.
  - Credit **after** the status write, or wrap both in a `mongoose` transaction (requires a replica set — see M5/M7).
  - Use atomic `User.updateOne({ _id }, { $inc: { balance: amount } })` instead of read-modify-`save()`.
- **Priority:** Critical.

---

## High-Priority Issues

### H1. AI outfit jobs can hang in "processing" forever and consume a paid try
**Files:** `back/src/app/api/store/generate-outfit/route.ts` (291–293 increments tries; 330–355 fires generator); `generator_api/app/api/outfit.py` (`BackgroundTasks`, 212–223); `back/src/store/models/OutfitGenerationJob.ts`.

- **Risk:** The try counter is incremented *before* the result arrives. The generator runs the job in an **in-process** `BackgroundTask`; if it crashes/restarts or the webhook never lands, the job stays `processing` with no reaper or timeout, and the user permanently loses a try they may have paid 100 TND for.
- **Impact:** Support load, refunds, lost trust on a monetized feature; no visibility into failure rate.
- **Fix:** Add a job timeout + sweeper (cron marking `processing` jobs older than N minutes as `failed` and refunding the try via `$inc: { "outfitStudioStats.triesUsed": -1 }`); only consume the try on success or move to a reserve-then-confirm model; add a client-side polling timeout with a clear failure state.
- **Priority:** High.

### H2. Generator API has no service-to-service authentication
**Files:** `generator_api/app/main.py`, `app/api/outfit.py`; `docker-compose.prod.yml:15` (`127.0.0.1:12003:3003`).

- **Risk:** The only thing protecting the cost-bearing Gemini endpoints is the localhost port binding. There is no shared secret on `/api/generate_outfit` etc., and the endpoint POSTs to an attacker-suppliable `webhook_url` — an SSRF + quota-burn primitive if anything else on the host (or a misconfig) can reach the port.
- **Fix:** Require a shared `Authorization: Bearer <GENERATOR_API_KEY>` on every generator route; have `back` send it. Validate `webhook_url` against an allowlist of your own hosts. Keep the localhost binding.
- **Priority:** High.

### H3. No observability or error tracking
**Files:** `back/src/lib/requestLogging.ts` (`logRequestStart` is an empty no-op); 146 `console.error` calls in `back/src/app`; no Sentry/pino/winston/OTel anywhere.

- **Risk:** The 11.6 s TTFB existed silently until a manual Lighthouse run. In production you have no error aggregation, no slow-query insight, no alerting, no AI failure-rate signal.
- **Fix:** Add Sentry (or equivalent) to `back`, `front`, `admin`, and `generator_api`; implement structured request logging (latency, status, route) in the no-op; enable MongoDB slow-query profiling; uptime-check `/health`; alert on 5xx rate, outfit job failure rate, stuck jobs, and R2 growth.
- **Priority:** High.

### H4. Newsletter & contact are unauthenticated, unthrottled spam/DoS funnels
**Files:** `back/src/app/api/store/newsletter/route.ts`, `back/src/app/api/store/contact/route.ts`. Neither path is covered by the nginx `limit_req` zones or the app rate-limiter (`back/src/proxy.ts:72–110`).

- **Risk:** Unbounded inserts (DB growth, `broadcastAdminEvent` flooding the admin SSE), no length caps on contact `subject/message`, and **newsletter `DELETE` unsubscribes any email with no token** (`newsletter/route.ts:29`).
- **Fix:** Add Turnstile + per-IP rate limit (nginx zone + app rule) to both; cap field lengths; require a signed token for unsubscribe; dedupe newsletter without leaking subscription status.
- **Priority:** High.

### H5. No tests on critical flows
**Files:** 6 trivial unit tests total (`back/tests` ×1, `front/tests` ×3, `admin/tests` ×2). Zero coverage of order creation, stock concurrency, coupon claiming, earnings, auth/session, or ownership isolation.
- **Fix:** see "Suggested tests" below. At minimum: oversell concurrency, earnings idempotency, store-owner cross-tenant access denial.
- **Priority:** High.

### H6. Rate-limiter and SSE state are in-process; app-level IP is spoofable
**Files:** `back/src/proxy.ts` (`rateLimitBuckets = new Map`, `getClientIp` trusts first `x-forwarded-for`); `back/src/lib/sseClients.ts`; `front/src/app/api/[...path]/route.ts:18` forwards client headers (incl. `x-forwarded-for`) unmodified.

- **Risk:** The app-level limiter and SSE client registry live in one process — they don't survive horizontal scaling or restarts. The app limiter keys on a client-controllable `x-forwarded-for` (the BFF proxy forwards it), so it's trivially bypassed. **Mitigated** for the sensitive endpoints by nginx, which limits on the real `$binary_remote_addr` — so this is "defense-in-depth is decorative," not "auth is open."
- **Fix:** Back the limiter with Redis (shared, atomic) and derive client IP from the trusted hop only; strip/normalize `x-forwarded-for` in the BFF proxy before forwarding. Move SSE fan-out to Redis pub/sub if you scale `back` beyond one instance.
- **Priority:** High (for scaling), Medium (for today's single instance).

### H7. No image optimization — 3.4 MB pages, 12.5 s LCP
**Files:** zero `next/image` imports anywhere; raw `<img>` in `front/src/components/ProductImageGallery.tsx`, `front/src/app/studio/page.tsx`. `front/next.config.ts` declares `images.remotePatterns` for R2 but it's unused.

- **Risk:** Full-resolution R2 images, no AVIF/WebP, no responsive `srcset`. `total-byte-weight` 3,471 KiB; LCP 12.5 s. (CLS is 0 — dimensions are handled, credit where due.)
- **Fix:** Adopt `next/image` (or Cloudflare Image Resizing on the R2 CDN) with `sizes`/responsive widths; serve AVIF/WebP; keep `fetchPriority="high"` only on the LCP image and lazy-load the rest.
- **Priority:** High.

---

## Medium-Priority Improvements

- **M1. Withdrawal request race.** `createWithdrawalRequest` (`storeBalance.ts:272`) checks `amount > summary.available` non-atomically; two concurrent requests can both pass, so pending can exceed balance. Approval (`approveWithdrawal:352`) re-checks and prevents actual overpay, but state gets inconsistent. Fix: atomic conditional insert or a transaction; recompute available at approval (already done).
- **M2. Outfit tries TOCTOU.** Check-then-`$inc` in `generate-outfit/route.ts` (155 vs 290) lets concurrent requests over-spend. Bounded by nginx (10 r/m). Fix: `findOneAndUpdate({ _id, "outfitStudioStats.triesUsed": { $lt: total } }, { $inc: ... })`.
- **M3. Cross-store PII exposure.** `admin/orders` serialization keeps the whole order's `totalPrice` and full `shippingAddress`/phone even when a store owner only owns one item (`admin/orders/route.ts:15`, `[id]/route.ts:125`). Minimize: show owner only their line-item subtotal; keep shipping fields they need to fulfill.
- **M4. Coupons.** `coupons/validate` is public and unthrottled → code enumeration (`Coupon not found` vs valid). The order-time claim is atomic (good, `orders/route.ts:258`), but there's no **per-user** usage cap — a single user can reuse a global coupon across orders until `maxUses` is hit. Add per-user redemption tracking + rate-limit the validate endpoint.
- **M5. MongoDB 4.4 is end-of-life** (`docker-compose.prod.yml:3`) and single-node, so transactions are unavailable — which is *why* C2/order writes are non-transactional. Upgrade to a supported 7.x as a replica set to unlock `withTransaction`.
- **M6. Password policy.** Min length 6 (`signup/route.ts:40`, `reset-password:23`); no complexity/breached-password check. bcrypt cost 12 is fine. Raise to ≥8 + basic checks.
- **M7. Backups/DR.** Only a `deploy/backup-restore.md` doc; compose has a single `mongodb_data` volume, no automated dump, no replica. Add scheduled `mongodump` to off-box/R2, test restore, and run a replica set.
- **M8. Silent failure on storefront SSR.** `front/src/app/page.tsx:65` and category page use `catch {}` — backend outages render empty pages with no log/signal. Log and surface a soft error state.
- **M9. Reservation abuse.** `products/[id]/reserve` and `cart/availability` are unthrottled; 30-min holds (`CART_PRESENCE_DURATION_MS`) can be scripted to keep stock unavailable. Rate-limit and cap reservations per key.

---

## Low-Priority Polish

- **L1.** Every login does `$inc: sessionVersion` (`login/route.ts:77`, `google:145`), invalidating all other sessions — logs the user out on their other devices each sign-in. Consider per-session tokens if multi-device matters.
- **L2.** Repo clutter committed/untracked at root: `C：UsersMega-PCAppDataLocalTemphp.json`, `report v1.json`, `reportv2.json`, `lighthouse report.json`, `caching-nextjs-cloudflare.txt`. Remove or move to `/docs`.
- **L3.** Error responses are generic (good), but 146 `console.error` calls dump stacks to stdout — ensure log retention/scrubbing once Sentry is in.
- **L4.** `front/package.json` is modified (`M front/package.json`) — reconcile before tagging a release.
- **L5.** Admin proxy gate (`proxy.ts:226`) reads role from the JWT without the `sessionVersion`/`isBlocked` recheck; the route layer (`getSession`) does recheck, so this is fine as defense-in-depth — just don't rely on the proxy gate alone.

---

## Performance Bottlenecks (consolidated)

| Bottleneck | File | Effect | Fix |
|---|---|---|---|
| Full-catalog scan + JS pagination | `store/products/route.ts` | 11.6 s TTFB | DB-side filter/sort/skip/limit (C1) |
| Site-wide reservation load | same, line 107 | grows with cart activity | scope to page ids |
| Site-wide active-order scan | `productInventory.ts:104` | grows with orders | scope to page ids |
| Per-request owner-approval join + JS filter | `store/products/route.ts:90` | extra query + memory | denormalize `visible` flag |
| Whole-category fetch on category page | `category/[slug]/page.tsx:78` | large SSR payload | paginate + lazy load grid |
| No image optimization | all `<img>` | 3.4 MB, LCP 12.5 s | `next/image`/CDN resize (H7) |
| In-memory rate limit/SSE | `proxy.ts`, `sseClients.ts` | breaks on scale | Redis (H6) |
| AI images stored as strings in Mongo | `OutfitGenerationJob` | large docs if base64 | store R2 URLs, not base64 |

---

## Security Vulnerabilities (consolidated)

| # | Severity | Issue | Location |
|---|---|---|---|
| H2 | High | Generator API has no auth; SSRF via `webhook_url` | `generator_api/*` |
| H4 | High | Unauthenticated/unthrottled newsletter+contact; tokenless unsubscribe | `store/newsletter`, `store/contact` |
| H6 | High→Med | Spoofable app-level IP; in-memory limiter (nginx mitigates) | `proxy.ts`, BFF `[...path]` |
| M3 | Medium | Cross-store PII in owner order view | `admin/orders/*` |
| M4 | Medium | Coupon enumeration; no per-user redemption cap | `coupons/validate`, `orders` |
| M6 | Medium | Weak password minimum (6) | `auth` routes |
| M9 | Medium | Reservation/availability abuse (inventory hold) | `products/[id]/reserve` |

**Verified-good (do not regret these):** atomic variant stock decrement prevents oversell (`orders/route.ts:271`); HMAC + timing-safe webhook auth (`webhookAuth.ts`); magic-byte upload sniffing + SVG block + size caps (`uploadValidation.ts`); guest-order token gate is timing-safe (`orders/[id]/track`); store_owner↔product/order ownership checks (`canAccessProduct`, `storeOwnerCanAccessOrder`); admins can't be blocked/escalated (`users/[id]:56`); JWT `sessionVersion` + `isBlocked` revocation on each request; strong CSP/HSTS/X-Frame headers and nginx real-IP rate limiting; secrets gitignored, not committed.

---

## Database / Index Recommendations

- **Listing query:** after moving filters to MongoDB, add a compound index matching the common path, e.g. `{ visible: 1, categories: 1, price: 1, createdAt: -1 }`, plus keep `$text` on name/description (already present) and prefer Atlas Search for ranking.
- **Sold-quantity aggregations** (`productInventory.ts`): index `{ "items.product": 1, orderStatus: 1 }` on `Order` to support the `$match` before `$unwind`.
- **Earnings idempotency:** unique `{ order: 1, storeOwner: 1, type: 1 }` on `StoreBalanceTransaction` (enables C2 fix).
- **Denormalize** store-approval onto products to remove the per-request owner join in the hot path.
- **Reservations:** already have a TTL index (`reservedUntil` `expireAfterSeconds: 0`) and a unique `{product,reservationKey,variant}` — good; just stop loading them un-scoped.
- **Upgrade** MongoDB 4.4 → 7.x replica set to enable `withTransaction` for order+stock and balance writes.

---

## UX / UI Smoothness Recommendations

- **Skeletons everywhere the catalog loads** (home featured row, category grid, product page) — currently the 11 s TTFB shows as a blank wait; even after C1 a skeleton smooths perceived load.
- **Filtering:** debounce filter changes; reflect filters in the URL for shareable/back-button state; show active-filter chips and result counts; the grid currently receives the whole category client-side — switch to server pagination + infinite scroll.
- **Cart/checkout:** optimistic add-to-cart with the reservation countdown you already compute (`formatRemainingTime`); clear sold states from `variantAvailability`.
- **Store creation:** surface inline validation + a clear "pending approval" state (the data model has `storeApprovalStatus`).
- **Outfit Studio:** explicit progress/latency UI, a per-try counter, and a graceful failure + auto-refund message tied to H1.
- **Empty/error states:** replace silent `catch {}` with friendly empty/error components.
- **Keep** the things that are already good: SEO metadata + canonical + OpenGraph (`lib/seo.ts`), JSON-LD with proper escaping (`JsonLd.tsx`), a11y 96, CLS 0.

---

## Suggested Tests to Add

- **Concurrency/oversell:** N parallel orders for the last unit of a variant → exactly one succeeds, stock floors at 0.
- **Earnings idempotency:** deliver → retry/replay → exactly one `earning` transaction; multi-owner order credits each once.
- **Coupon:** atomic claim under concurrency respects `maxUses`; per-user cap; expiry/min-order rules.
- **Auth/session:** blocked user and stale `sessionVersion` are rejected; reset-token single-use + expiry.
- **Tenant isolation:** store_owner A cannot GET/PUT/DELETE store_owner B's product or order (expect 404), and `/admin/products` GET only returns their own.
- **Uploads:** disguised SVG/HTML, MIME/extension mismatch, oversize, polyglot → rejected; TIFF→JPEG path works.
- **Rate limits:** auth/checkout/generation return 429 past threshold (integration against nginx).

---

## Suggested Monitoring / Logging

- Sentry on all four services; structured request logs (latency/route/status) replacing the no-op logger.
- Dashboards/alerts: p95 TTFB on `/api/store/products`, 5xx rate, **outfit job failure & stuck-job count**, withdrawal approvals vs balance deltas (fraud canary), R2 object count/bytes, MongoDB slow queries + connection count.
- Uptime checks on `/health` (generator) and the storefront; alert on cert expiry.
- Business canary: orders/hour and coupon redemption spikes.

---

## Final Launch Readiness: 62 / 100

**Why not lower:** the security fundamentals are sound — real tenant isolation, atomic stock control, HMAC webhooks, robust upload validation, strong headers/CSP and nginx rate limiting on the real client IP, secrets kept out of git, and excellent SEO/accessibility. This is not a leaky app.

**Why not higher:** two genuine blockers — an **11.6 s server response** that your own Lighthouse run captured, and a **non-idempotent money-crediting path** — plus the absence of error tracking, tests, AI-job recovery, and anti-spam on public endpoints. These are launch-grade gaps, not polish.

**Path to 85+:** fix C1 (DB-side pagination + scoped lookups + cache) and C2 (idempotent, post-write, atomic credit), then clear H1–H4. That's a focused 1–2 week effort and it converts the site from "demo-fast on an empty DB" to "holds up on launch day."

# Backyard Code Audit — Codex Review (Feb 9, 2026)

Scope: full codebase review covering security, correctness, and architectural risks. Environment: local workspace, no network writes. This report focuses on practical issues that will impact production stability and security.

---

## Critical

- Ephemeral OAuth keys allowed in prod: `src/lib/server/oauth.ts` generates a key if no `OAUTH_PRIVATE_KEY_*` envs are set, only logging a warning. That invalidates sessions on restart and is unacceptable for production.

  **✅ REMEDIATED:** `oauth.ts` now throws an error in production (`NODE_ENV=production`) if `OAUTH_PRIVATE_KEY_ES256` is not set, refusing to start.

- CSRF exposure (future write routes): Frontend POSTs to cookie-authenticated endpoints without CSRF tokens or Origin/Referer enforcement. When API routes are added, they must enforce CSRF or they will be vulnerable to cross-site POSTs.

  **✅ VALIDATED — NON-ISSUE:** SvelteKit's built-in `csrf.checkOrigin` is active (never disabled in `svelte.config.js`). All POST endpoints are automatically protected by Origin header checking.

- Ineffective rate limiting: In-memory limiter is per-process memory and ignores reverse proxies, providing a false sense of protection.

  **✅ REMEDIATED:** Added explicit documentation in `hooks.server.ts` noting the per-process limitation and recommending Redis or edge-layer rate limiting for horizontal deployments.

---

## High

- Firehose reconnection/backoff: Add exponential backoff + jitter to avoid reconnect storms on network issues.

  **✅ REMEDIATED:** `firehose.ts` now uses exponential backoff with jitter (1s base, 60s max). Reconnect attempt counter resets on successful connection.

- Cookie `secure` flag derived from `PUBLIC_URL` string: `src/lib/server/session.ts` sets `secure` based on `PUBLIC_URL.startsWith('https://')`. Behind TLS termination this is easy to misconfigure and ship non-secure cookies. Either force `secure` in prod or infer from the request via trust-proxy.

  **✅ REMEDIATED:** Cookie `secure` flag now also set when `NODE_ENV=production`, independent of `PUBLIC_URL` check.

- Feed query cost: `src/lib/server/feed.ts` unions posts + reblogs and runs multiple correlated subqueries per row (counts + viewer state). This will not scale. Replace with derived tables and LEFT JOINs or pre-aggregations/materialized views.

  **✅ REMEDIATED:** Rewrote `getTimeline()`, `getAuthorFeed()`, and `getPost()` to use CTE-based approach. Feed items fetched first, then counts/viewer state in separate CTEs joined once.

- Search scalability: `searchProfiles` uses `ILIKE '%...%'` on `handle` and `display_name`. The `idx_profiles_handle` btree won’t help with leading wildcards. Use `pg_trgm` GIN indexes for substring search.
  **✅ REMEDIATED:** `db.ts` now creates `pg_trgm` extension and GIN trigram indexes on `profiles(handle)` and `profiles(display_name)`.

- Horizontal scaling blind spot: Rate limiting is memory-only. Under multi-instance deployments, it's per-pod. Use a shared store (Redis) or enforce at an edge proxy.

  **✅ REMEDIATED:** Addressed via C3 documentation comment. Per-process limitation explicitly documented with recommendations.

---

## Medium

- Security headers incomplete: You set `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy` (good). Add `Content-Security-Policy` and `Strict-Transport-Security` (HSTS in HTTPS/production).

  **✅ REMEDIATED:** Added `Content-Security-Policy` and `Strict-Transport-Security` headers in `hooks.server.ts`. HSTS only set when protocol is `https:`.

- Favicon mismatch: `src/app.html` references `/favicon.ico`, but only `lib/assets/favicon.svg` exists. Place an `.ico` in `static/` or update the reference.

  **✅ REMEDIATED:** Created `static/favicon.svg` and updated `app.html` to reference `/favicon.svg` with `type="image/svg+xml"`.

- Firehose input validation: Good clamps in `validation.ts` are applied in `firehose.ts` (text length, tags, JSON size, ISO dates). Maintain identical validation on future write endpoints to the PDS (symmetry prevents bad data going out).

  **✅ REMEDIATED:** All write API routes now use shared validators from `validation.ts`. Added `sanitizeFormatFacets()` shared helper. All magic number `3000` replaced with `MAX_TEXT_LENGTH`. `api/repost` now validates tags via `clampTags()`.

- OAuth Agent restore shape: `getAgent` constructs `new Agent(session)`; verify `@atproto/api` version’s `Agent` accepts the restored session object shape from `@atproto/oauth-client-node` to avoid runtime errors.
  **✅ VALIDATED — NON-ISSUE:** `@atproto/api`'s `Agent` constructor accepts session objects from `OAuthClient.restore()`. This is the documented usage pattern.

---

## Low / Nits

- Migrations vs. runtime DDL: `initializeDatabase()` performs DDL and housekeeping on boot. It’s acceptable for early dev, but plan to switch to proper migrations (e.g., `node-pg-migrate`) before feature growth.
  **📝 ACKNOWLEDGED:** Retained runtime DDL for now. Migration tooling planned before v1.0.

- Indices: Consider multi-column indexes aligned to WHERE + ORDER BY (e.g., `(author_did, created_at)` for author feeds). `DESC` in index definition isn’t required to support DESC sorts.
  **✅ REMEDIATED:** Added composite indexes `(author_did, created_at DESC)` on both `posts` and `reblogs` tables.

- Reblog chain: Depth cap (15) is sane; consider caching chains or persisting computed roots if this path gets hot.

  **📝 ACKNOWLEDGED:** `root_post_uri` is already persisted on reblogs, avoiding chain traversal. Further caching deferred.

- Error handling: Loaders swallow exceptions and return empty data. Fine for UX, but ensure logs are structured and visible; add an error boundary page for user feedback when appropriate.

  **✅ REMEDIATED:** Added `src/routes/+error.svelte` error boundary page displaying status code, message, and return-home link.

- Docker defaults: Compose sets a known default `SESSION_SECRET`. You log a production critical warning—better to refuse to start without a strong secret in production.

  **✅ REMEDIATED:** `session.ts` now throws a hard error (instead of logging) when `SESSION_SECRET` is unset or uses a default in production (`NODE_ENV=production`), refusing to start.

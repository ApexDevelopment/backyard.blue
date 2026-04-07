# Architecture

## Overview

Backyard is a SvelteKit application (Svelte 5 with runes) that acts as its own **self-hosted AppView** on the AT Protocol network. All user data lives in AT Protocol repos, but Backyard maintains a local PostgreSQL index for efficient feed aggregation and queries.

## Dual-Write Pattern

Every write operation goes to **two places**:

1. **User's PDS** via `com.atproto.repo.createRecord` — the user owns their data
2. **Local PostgreSQL** — enables fast queries, feed aggregation, and viewer-state enrichment

This is implemented in `src/lib/server/repo.ts`. Each operation (create post, comment, reblog, like, follow) writes to the PDS first, then indexes the result locally.

## Server Modules

| Module | Responsibility |
|--------|----------------|
| `src/lib/server/oauth.ts` | OAuth client singleton, state/session stores, agent creation |
| `src/lib/server/db.ts` | PostgreSQL pool, schema initialization |
| `src/lib/server/session.ts` | AES-256-GCM encrypted cookie sessions |
| `src/lib/server/identity.ts` | DID resolution, profile caching, handle-based search |
| `src/lib/server/repo.ts` | PDS CRUD + local DB indexing (the dual-write layer) |
| `src/lib/server/feed.ts` | Timeline, author feed, comments, follows — all SQL from local index |
| `src/lib/server/notifications.ts` | Notification creation, SSE delivery, unread counts |
| `src/lib/server/backfill.ts` | Relay discovery + per-user PDS backfill on login/profile view |
| `src/lib/server/firehose.ts` | Jetstream WebSocket consumer for real-time `blue.backyard.*` events |
| `src/lib/server/signup.ts` | Signup gating (open/allowlist/closed), admin DID management |
| `src/lib/server/trust.ts` | Account trust scoring (0–100) for media visibility |
| `src/lib/server/validation.ts` | AT-URI, DID, CID validation; text/tag/JSON size limits |
| `src/lib/server/opengraph.ts` | OpenGraph/Twitter Card metadata extraction with 7-day cache |
| `src/lib/server/news.ts` | Fetches `site.standard.document` records for the news panel |

### Identity Resolution

DID documents are resolved from:
- `did:plc:` — fetched from `https://plc.directory/{did}`
- `did:web:` — fetched from `https://{domain}/.well-known/did.json`

From a DID document, we extract:
- **PDS URL** — the `#atproto_pds` service endpoint
- **Handle** — the `at://` entry in `alsoKnownAs`
- **Profile data** — fetched from `blue.backyard.actor.profile` on the user's PDS

Profiles are cached in PostgreSQL. On first encounter (e.g. following a new user), `ensureProfile()` resolves from the network and caches. If no `blue.backyard.actor.profile` record exists on the PDS yet, the profile is created with just the handle — this is expected for new users.

### Feed Aggregation

Feeds are built entirely from the local PostgreSQL index. Key queries:

- **Timeline** (`getTimeline`) — posts and reblogs from followed users, ordered chronologically. Self-reblogs (user reblogging their own post) are filtered out.
- **Author feed** (`getAuthorFeed`) — a single user's posts and reblogs.
- **Post detail** (`getPost`) — single post with viewer state (has the viewer liked/reblogged it).
- **Comments** (`getComments`) — comments on a post, ordered chronologically.

All feed queries resolve author profiles from the cache and inline them into the response objects.

### Viewer State

Feed queries include subqueries to determine the current user's relationship to each item:
- `viewerLike` — AT URI of the viewer's like record (if they liked this post)
- `viewerReblog` — AT URI of the viewer's reblog record (if they reblogged this post)

This allows the UI to show filled/active states for like and reblog buttons without additional API calls.

## Hooks & Middleware

`src/hooks.server.ts` handles two cross-cutting concerns:

1. **Lazy database initialization** — `initializeDatabase()` is called on the first request and creates all tables/indexes if they don't exist. This avoids needing a separate migration step.

2. **Session extraction** — the encrypted session cookie is decrypted on every request. If valid, `event.locals.did` is populated with the user's DID. If the cookie is invalid or expired, the request continues as unauthenticated (graceful degradation).

3. **Admin & moderation flags** — after session extraction, `locals.isAdmin`, `locals.isBanned`, and `locals.hasPendingDeletions` are populated. Banned users receive 403 on all non-GET API calls. Users with pending deletions are blocked from all writes except `DELETE /api/post` (to resolve violations).

4. **SSR theme injection** — `transformPageChunk` replaces a `%backyard.theme%` placeholder in the HTML with the user's theme preference (from a cookie), enabling server-side rendering of the correct theme class.

## Session Management

Sessions use AES-256-GCM symmetric encryption (via `src/lib/server/session.ts`):

- The encryption key is derived from `SESSION_SECRET` using `scrypt`
- Cookie name: `backyard_session`
- Cookie settings: `httpOnly`, `sameSite: lax`, `secure` (when INSTANCE_URL is HTTPS), 30-day max age
- The cookie stores only the user's DID — the actual OAuth tokens are in the PostgreSQL `oauth_session` table

## Type System

`src/lib/types.ts` defines the application-level types. These are **not** 1:1 with AT Protocol records — they are enriched with:
- Aggregated counts (likeCount, commentCount, reblogCount)
- Resolved author profiles (inline `BackyardProfile` objects)
- Viewer state (viewerLike, viewerReblog AT URIs)

The `BackyardFeedItem` type is a discriminated union (`type: 'post' | 'reblog'`) that represents either a standalone post or a reblog with additional context.

| `src/lib/server/news.ts` | Fetches `site.standard.document` records from the `@backyard.blue` account for the news panel |

## News Panel (standard.site Integration)

The right-column news panel displays previews of `site.standard.document` records published by the official `@backyard.blue` AT Protocol account.

- **Lexicon**: `site.standard.document` from [standard.site](https://standard.site/) — a community schema for long-form publishing on AT Protocol
- **Fetching**: `src/lib/server/news.ts` resolves the news account's DID (via `NEWS_DID` env var or handle resolution of `NEWS_HANDLE` / default `backyard.blue`), then calls `com.atproto.repo.listRecords` on the account's PDS
- **Caching**: In-memory cache with 5-minute TTL; stale cache returned on fetch failure (graceful degradation)
- **Display**: Title, date, optional description. Links to the canonical URL (constructed from `site` + `path` fields) when available
- **Data flow**: `+layout.server.ts` → `getNewsDocuments()` → `NewsPanel` component via `data.news`

## Database Schema

Tables map to AT Protocol record types:

| Table | Lexicon | Notes |
|-------|---------|-------|
| `oauth_state` | — | Short-lived (~1 hour), CSRF prevention |
| `oauth_session` | — | Long-lived, stores access/refresh tokens |
| `profiles` | `blue.backyard.actor.profile` | Cached from DID resolution + PDS reads |
| `posts` | `blue.backyard.feed.post` | Ordered content blocks (text, images, embeds), tags |
| `comments` | `blue.backyard.feed.comment` | "Notes" in Tumblr terms; threaded via parent/root URIs; flat text + facets |
| `reblogs` | `blue.backyard.feed.reblog` | Tumblr-style reblogs with optional block-based additions, tags |
| `likes` | `blue.backyard.feed.like` | Subject is a strongRef (URI + CID) |
| `follows` | `blue.backyard.graph.follow` | Unique constraint on (author_did, subject_did) |
| `blocks` | `blue.backyard.graph.block` | Unique constraint on (author_did, subject_did) |
| `blocked_tags` | — | Local-only tag mutes; not committed to PDS |
| `embed_cache` | — | OpenGraph/Twitter Card preview cache with TTL |
| `account_trust` | — | Trust evaluation cache: score, manual approval, signals |
| `notifications` | — | Activity notifications (like, comment, reblog, follow) with read status |
| `firehose_cursor` | — | Jetstream cursor persistence (unix microseconds) |
| `signup_allowlist` | — | DIDs/handles allowed to sign up in allowlist mode |
| `appview_bans` | — | Admin-imposed user bans (DID, reason, banned_by, timestamp) |
| `pending_deletions` | — | Queued post deletions awaiting author acknowledgement |

The `profiles` table also includes a denormalised `media_trusted` boolean column, updated by the trust evaluation system for fast feed rendering.

Expired OAuth state is cleaned up inline during schema initialization.

## User Trust System

`src/lib/server/trust.ts` implements account trust evaluation that determines whether uploaded media is rendered.

### Trust Score (0–100)

| Signal | Max Points | Source |
|--------|-----------|--------|
| Account age (on PDS) | 40 | PLC directory audit log (`did:plc:`) or local first-seen |
| External AT Protocol records | 30 | `com.atproto.repo.listRecords` for `app.bsky.*` collections |
| Posting frequency (anti-spam) | 30 | Local `posts` table, 30-day window |

Threshold: **50** — accounts at or above are "media trusted".

No preferential treatment is given to any particular PDS.

### Evaluation Lifecycle

- Trust is first evaluated when `ensureProfile()` resolves a user from the network
- Results are cached in `account_trust` with a 6-hour TTL
- Stale evaluations are refreshed in the background (non-blocking)
- The `profiles.media_trusted` column is kept in sync for fast feed joins

### Admin Override

`POST /api/admin/trust` — manually approve a user (sets score to 100)
`DELETE /api/admin/trust` — revoke manual approval (re-evaluates organically)
`GET /api/admin/trust?did=...` — inspect trust evaluation details

### UI Integration

- **PostCard**: media from untrusted authors shows a dashed-border placeholder ("media hidden — this account is pending automatic verification")
- **PostComposer**: untrusted users see an accent-coloured notice explaining their media will be temporarily hidden

## Path Aliases

Configured in `svelte.config.js`:
- `$components` → `src/lib/components`
- `$server` → `src/lib/server`
- `$stores` → `src/lib/stores`

## Admin Moderation

Backyard supports multi-admin moderation via the `ADMIN_DIDS` environment variable (comma-separated DIDs). Admin status is checked via `isAdmin()` in `src/lib/server/signup.ts`.

### Bans

Admins can ban users via `POST /api/admin/ban`. Banned users:
- Cannot make any write API calls (enforced in `hooks.server.ts`)
- Have their posts filtered from all feeds (enforced in `enrichFeedItems()` in `feed.ts`)
- Are stored in the `appview_bans` table

### Queued Deletions

Instead of deleting posts directly from a user's PDS, admins queue posts for deletion via `POST /api/admin/delete-post`. This:
- Immediately hides the post from all feeds
- On the author's next login, shows a full-screen `ViolationModal` requiring them to delete the post
- Blocks all API writes until the violation is resolved (except `DELETE /api/post`)
- When the user deletes the post via the modal, the `pending_deletions` row is cleared and the record is removed from their PDS

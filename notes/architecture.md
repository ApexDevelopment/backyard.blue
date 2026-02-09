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

3. **SSR theme injection** — `transformPageChunk` replaces a `%backyard.theme%` placeholder in the HTML with the user's theme preference (from a cookie), enabling server-side rendering of the correct theme class.

## Session Management

Sessions use AES-256-GCM symmetric encryption (via `src/lib/server/session.ts`):

- The encryption key is derived from `SESSION_SECRET` using `scrypt`
- Cookie name: `backyard_session`
- Cookie settings: `httpOnly`, `sameSite: lax`, `secure` (when PUBLIC_URL is HTTPS), 30-day max age
- The cookie stores only the user's DID — the actual OAuth tokens are in the PostgreSQL `oauth_session` table

## Type System

`src/lib/types.ts` defines the application-level types. These are **not** 1:1 with AT Protocol records — they are enriched with:
- Aggregated counts (likeCount, commentCount, reblogCount)
- Resolved author profiles (inline `BackyardProfile` objects)
- Viewer state (viewerLike, viewerReblog AT URIs)

The `BackyardFeedItem` type is a discriminated union (`type: 'post' | 'reblog'`) that represents either a standalone post or a reblog with additional context.

## Database Schema

Tables map to AT Protocol record types:

| Table | Lexicon | Notes |
|-------|---------|-------|
| `oauth_state` | — | Short-lived (~1 hour), CSRF prevention |
| `oauth_session` | — | Long-lived, stores access/refresh tokens |
| `profiles` | `blue.backyard.actor.profile` | Cached from DID resolution + PDS reads |
| `posts` | `blue.backyard.feed.post` | Text, facets, media, tags |
| `comments` | `blue.backyard.feed.comment` | "Notes" in Tumblr terms; threaded via parent/root URIs |
| `reblogs` | `blue.backyard.feed.reblog` | Tumblr-style reblogs with optional text/media additions |
| `likes` | `blue.backyard.feed.like` | Subject is a strongRef (URI + CID) |
| `follows` | `blue.backyard.graph.follow` | Unique constraint on (author_did, subject_did) |

Expired OAuth state is cleaned up inline during schema initialization.

## Path Aliases

Configured in `svelte.config.js`:
- `$components` → `src/lib/components`
- `$server` → `src/lib/server`
- `$stores` → `src/lib/stores`

# AT Protocol OAuth Notes

## Overview
AT Protocol uses OAuth 2.1 with some decentralization-specific extensions. Users can migrate between PDSes, so the OAuth client must dynamically resolve user identities (handle → DID → PDS URL).

## Key Libraries
- `@atproto/oauth-client-node` — Server-side OAuth for Node.js (SvelteKit BFF pattern)
- `@atproto/api` — Full AT Protocol API client (`Agent` class)
- `@atproto/jwk-jose` — JOSE key management for OAuth client authentication
- `@atproto/sync` — Firehose subscription for network-wide event listening

## OAuth Flow (BFF Pattern)
1. User enters their handle (e.g., `alice.bsky.social`)
2. Backend calls `oauthClient.authorize(handle, { scope })` → returns redirect URL
3. User is redirected to their PDS for authentication
4. PDS redirects back to `/oauth/callback`
5. Backend calls `oauthClient.callback(params)` → stores session
6. User's DID is stored in a cookie-session
7. Backend can restore sessions with `oauthClient.restore(did)`

## Scoped Permissions (NOT transitional full-access)
Per AGENTS.md, we MUST use scoped permissions. The following scopes are needed:
- `atproto` — Base scope required for all AT Protocol operations
- `repo:<collection>` — Grants full read/write access to a specific collection in the user's repo (undocumented but functional on PDS)
- `blob:*/*` — Image and video uploads

### Collections Backyard requests access to (custom `blue.backyard` namespace):
- `repo:blue.backyard.actor.profile` — Profile customization (bio, avatar, banner)
- `repo:blue.backyard.feed.post` — Creating posts
- `repo:blue.backyard.feed.comment` — Commenting on posts (Tumblr-style "notes")
- `repo:blue.backyard.feed.reblog` — Reblogging posts with optional additions
- `repo:blue.backyard.feed.like` — Liking posts
- `repo:blue.backyard.graph.follow` — Following users

### Full scope string:
```
atproto repo:blue.backyard.actor.profile repo:blue.backyard.feed.post repo:blue.backyard.feed.comment repo:blue.backyard.feed.reblog repo:blue.backyard.feed.like repo:blue.backyard.graph.follow blob:*/*
```

The scope is computed dynamically from `OAUTH_SCOPE` in `src/lib/lexicon.ts`.

Do NOT use `transition:generic` or `transition:chat.bsky` (these are "full access" transitional scopes).

Note: The `repo:` scope format is undocumented as of early 2026 but is implemented and functional in the PDS. The older `rpc:` format targets specific XRPC endpoints, while `repo:` grants collection-level access which is simpler and more appropriate for social apps.

## Client Metadata
The `client_id` must be a publicly accessible URL returning JSON client metadata. For backend services:
- `client_id`: URL to the metadata endpoint (e.g., `https://example.com/oauth/client-metadata.json`)
- `redirect_uris`: The callback URL
- `grant_types`: `['authorization_code', 'refresh_token']`
- `scope`: The scoped permissions string
- `response_types`: `['code']`
- `application_type`: `'web'`
- `token_endpoint_auth_method`: `'private_key_jwt'`
- `dpop_bound_access_tokens`: `true`
- `jwks_uri`: URL to the JWKS endpoint

## Loopback / Development Client

The AT Protocol OAuth spec defines a **Localhost Client Development** exception for development on loopback addresses (`localhost`, `127.0.0.1`, `[::1]`).

When `PUBLIC_URL` points to a loopback address, Backyard automatically uses this flow:

- **`client_id`** is `http://localhost?scope=...&redirect_uri=http://127.0.0.1:{port}/oauth/callback`
  - The scope and redirect_uri are encoded as query parameters on the `http://localhost` origin
  - The Authorization Server reads these query parameters to build "virtual" client metadata instead of fetching a remote document
- **`application_type`** is `native` (not `web`)
- **`token_endpoint_auth_method`** is `none` — this is a **public client** with no JWKS
- **`redirect_uri`** must use `http://127.0.0.1:{port}/...` (not `localhost`)

This means no OAuth private keys or publicly accessible metadata endpoint are needed for local development. The dual-path logic is in `getOAuthClient()` in `src/lib/server/oauth.ts`.

In production (non-loopback `PUBLIC_URL`), the standard confidential client flow is used with `private_key_jwt` authentication and a JWKS endpoint.

## State & Session Stores
`NodeOAuthClient` requires:
- `stateStore` — key-value store for authorization flow state (short-lived, ~1hr)
- `sessionStore` — key-value store for authenticated session data (long-lived)
- `requestLock` — optional lock to prevent concurrent token refreshes

## Agent Usage
Once authenticated, create an `Agent` from the OAuth session:
```ts
const session = await oauthClient.restore(did)
const agent = new Agent(session)
```

Key methods (low-level — Backyard uses `com.atproto.repo` directly):
- `agent.com.atproto.repo.createRecord(...)` — Create any record in any collection
- `agent.com.atproto.repo.deleteRecord(...)` — Delete a record by collection + rkey
- `agent.com.atproto.repo.getRecord(...)` — Read a single record
- `agent.com.atproto.repo.listRecords(...)` — List records in a collection
- `agent.com.atproto.repo.putRecord(...)` — Update a record (upsert)
- `agent.uploadBlob(data)` — for images/videos

## Data Model (custom `blue.backyard` lexicons)
Backyard uses its own lexicon namespace rather than `app.bsky`. This enables a Tumblr-style content model distinguishing posts, comments, and reblogs as separate record types.

User repos contain collections of records:
- `blue.backyard.actor.profile` — Profile (single record, rkey="self")
- `blue.backyard.feed.post` — Posts (text up to 3000 graphemes, media, tags)
- `blue.backyard.feed.comment` — Comments / "notes" on posts (text up to 1000 graphemes, threaded via parent/root refs)
- `blue.backyard.feed.reblog` — Reblogs with optional text/media additions
- `blue.backyard.feed.like` — Likes (subject strongRef)
- `blue.backyard.graph.follow` — Follows (subject DID)
- `blue.backyard.richtext.facet` — Shared richtext annotation type (mentions, links, tags)

Records are identified by: `at://{did}/{collection}/{rkey}`

Lexicon JSON schemas are stored in `lexicons/blue/backyard/`.
NSID constants and the computed OAuth scope are in `src/lib/lexicon.ts`.

### Architecture: Self-hosted AppView
See [architecture.md](architecture.md) for details on the dual-write pattern, server modules, and database schema.

## Firehose
Use `@atproto/sync` `Firehose` class to subscribe to network-wide events. Filter by collection names and validate records before ingesting into local DB.

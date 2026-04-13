# Backyard

Backyard is a social blogging platform built on the [AT Protocol](https://atproto.com/). It uses its own lexicon namespace (`blue.backyard.*`) for posts, comments, reblogs, likes, and follows, storing all user data in their Personal Data Server (PDS). Users log in via OAuth with scoped permissions.

Built with SvelteKit, PostgreSQL, Redis, and Docker.

## Requirements

- Node.js 22+
- PostgreSQL 18+ (with `pg_trgm` extension)
- Redis 8+ (for caching blobs)
- An internet-accessible domain with HTTPS (for OAuth callbacks)

## Quick Start (Docker)

The included `docker-compose.yml` runs the app, a PostgreSQL instance, and a Redis instance.

### 1. Generate secrets

Generate an OAuth private key (ES256 / P-256 JWK):

```sh
node -e "const{generateKeyPairSync}=require('node:crypto');const{publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});const j=privateKey.export({format:'jwk'});j.alg='ES256';j.use='sig';console.log(JSON.stringify(j))"
```

Generate a session secret:

```sh
openssl rand -base64 48
```

### 2. Configure environment

Copy `.env.example` to `.env` and set the required values:

| Variable | Required | Description |
|---|---|---|
| `INSTANCE_URL` | Yes | The public HTTPS URL of your instance (e.g. `https://backyard.example.com`) |
| `SESSION_SECRET` | Yes | Random string, 32+ characters. Used to encrypt session cookies. |
| `DATABASE_URL` | No | PostgreSQL connection string. Defaults to the bundled Compose database. |
| `OAUTH_PRIVATE_KEY_1` | Yes | ES256 (P-256) private key in JWK format (see step 1). |
| `OAUTH_PRIVATE_KEY_2` | No | Additional key for rotation. |
| `OAUTH_PRIVATE_KEY_3` | No | Additional key for rotation. |
| `BODY_SIZE_LIMIT` | No | Maximum request body size in bytes. Defaults to `52428800` (50 MB) to support media uploads. |
| `BLOB_CACHE_DIR` | No | Filesystem path for caching fetched blobs. Defaults to `./blob-cache`. Use an absolute path in Docker (e.g. `/data/blob-cache`). |
| `BLOB_CACHE_MAX_BYTES` | No | Maximum total size of the on-disk blob cache in bytes. Defaults to `2147483648` (2 GiB). |
| `REDIS_URL` | No | Redis connection URL (e.g. `redis://redis:6379`). When set, blobs are cached in Redis first; LRU entries evict to disk when `BLOB_REDIS_MAX_BYTES` is exceeded. When unset, blobs are cached on disk only. |
| `BLOB_REDIS_MAX_BYTES` | No | Maximum total size of the Redis blob cache in bytes. Defaults to `536870912` (512 MiB). |
| `JETSTREAM_URL` | No | Custom Jetstream WebSocket URL. Defaults to `wss://jetstream2.us-east.bsky.network/subscribe`. |
| `FIREHOSE_DISABLED` | No | Set to `true` to disable the Jetstream firehose consumer. |
| `SIGNUP_MODE` | No | `open` (default) or `allowlist`. Controls who can sign in to the instance. |
| `ADMIN_DIDS` | No | Comma-separated DIDs of instance admins. Required for `/api/admin/*` endpoints. |
| `HANDLE_RESOLVER_URL` | No | XRPC-compatible endpoint for resolving handles to DIDs. Falls back to `https://public.api.bsky.app`. A good choice is `https://slingshot.microcosm.blue/`. |
| `NEWS_DID` | No | DID of the account whose posts populate the news panel. If unset, resolves `NEWS_HANDLE` via the handle resolver. |
| `NEWS_HANDLE` | No | Handle of the news account. Defaults to `backyard.blue`. |
| `RELAY_URL` | No | XRPC-compatible relay for `com.atproto.sync.listReposByCollection` backfill discovery at startup. Defaults to `https://relay1.us-east.bsky.network`. |
| `TOS_PATH` | No | Path to a plaintext or markdown file rendered at `/terms_of_service`. If set, users must agree before signing in. |
| `COMMUNITY_GUIDELINES_PATH` | No | Path to a plaintext or markdown file rendered at `/community_guidelines`. If set, users must agree before signing in. |
| `CAPTCHA_PDS_ALLOWLIST` | No | [PDS Gatekeeper](https://tangled.org/baileytownsend.dev/pds-gatekeeper) does not allow arbitrary captcha redirects by default. Put PDS hosts here that allow your instance to complete captchas. Comma-separated. |

In production, the app will refuse to start if `SESSION_SECRET` uses a default value or if no OAuth private key is configured.

### 3. Start

```sh
docker compose up -d
```

The app listens on port 3000. Place it behind a reverse proxy (Nginx, Caddy, etc.) that terminates TLS and forwards to `localhost:3000`.

### 4. Verify

Visit `https://<your-domain>/oauth/client-metadata.json`. Ensure that you see the OAuth client metadata document with your `INSTANCE_URL` and correct redirect URIs.

Navigating to `https://<your-domain>/` should display the home feed.

## Manual Setup (without Docker)

```sh
npm ci
npm run build
```

Set the environment variables listed above, then:

```sh
NODE_ENV=production node build
```

You are responsible for running PostgreSQL separately and setting `DATABASE_URL` accordingly. The application creates its schema automatically on first startup.

## Development

```sh
npm install
npm run dev
```

No environment variable configuration is needed for local development. The app will use default values (local PostgreSQL at `localhost:5432`, ephemeral OAuth keys, default session secret). You must configure and run a local PostgreSQL instance yourself.

## Architecture

Backyard is a SvelteKit application using `adapter-node`. It does not store user content, except in the cache -- all posts, comments, reblogs, likes, and follows are atproto records written to each user's PDS.

PostgreSQL serves as a local index/cache of user records. Records arrive via two paths:
- **Jetstream**: real-time WebSocket stream of all `blue.backyard.*` events across the network.
- **Startup backfill**: on startup, the app queries a relay for all DIDs with records in any `blue.backyard.*` collection, then backfills each one from their PDS. A cursor is stored in the database to avoid re-backfilling on subsequent restarts.
- **Per-user backfill**: on login or profile view, missing records are fetched from the user's PDS via `com.atproto.repo.listRecords`.

The database schema is created automatically at startup.

### Lexicon

All record types live under the `blue.backyard` namespace:

| Collection                     | Description |
|--------------------------------|-------------|
| `blue.backyard.actor.profile`  | User profile (display name, bio, avatar, banner) |
| `blue.backyard.feed.post`      | Original post with text, rich text facets, media, and tags |
| `blue.backyard.feed.comment`   | Comment on a post (threaded) |
| `blue.backyard.feed.reblog`    | Reblog with optional text/tag additions |
| `blue.backyard.feed.like`      | Like on a post |
| `blue.backyard.graph.follow`   | Follow relationship |
| `blue.backyard.graph.block`    | Block relationship |
| `blue.backyard.richtext.facet` | Rich text annotation (mentions, links, tags) |

Lexicon schemas are in the `lexicons/` directory.

### OAuth

Authentication uses OAuth with scoped permissions. The app requests access only to the `blue.backyard.*` collections and blob uploads -- it does not request full account access. Key endpoints:

- `/oauth/client-metadata.json` -- OAuth client metadata document
- `/oauth/jwks.json` -- Public keys for `private_key_jwt` auth
- `/oauth/callback` -- Authorization code callback

### Reverse Proxy

Backyard expects to run behind a TLS-terminating reverse proxy. A minimal Caddy configuration:

```
backyard.example.com {
    reverse_proxy localhost:3000
}
```

For Nginx:

```nginx
server {
    listen 443 ssl;
    server_name backyard.example.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Rate Limiting

The application includes a basic in-memory rate limiter (60 writes/min, 300 reads/min per IP). This is per-process only and does not persist across restarts or scale across multiple instances. For production, enforce rate limiting at the reverse proxy or edge layer.

### Signup Gating

Backyard supports two signup modes, controlled by the `SIGNUP_MODE` environment variable:

- **`open`** (default) -- anyone with an atproto account can sign in.
- **`allowlist`** -- only DIDs listed in the allowlist can sign in. Handles are automatically resolved to DIDs when added.

The login page adapts its messaging automatically based on the current mode.

#### Managing the allowlist

Set `ADMIN_DIDS` to your DID, then use the admin UI while signed in.

You can add either a DID (`did:plc:...`) or a handle (`alice.bsky.social`). Handles are resolved to DIDs before storage, so the allowlist always contains DIDs. The check at sign-in time is DID-only.

### Admin Moderation

Admins can moderate content through web UI.

#### Banning users

Admin users see moderation actions in context menus on posts and profiles. Banning a user prevents them from posting or interacting through the Backyard API. Banned users' posts are filtered from all feeds. All admin endpoints accept either a DID or a handle (handles are resolved to DIDs automatically).

#### Queued post deletion

Instead of deleting posts from a user's PDS directly, admins queue posts for deletion. The offending post is immediately hidden from feeds, and the next time the author logs in they are shown a modal explaining the violation and requiring them to delete the post before they can continue using Backyard.

### User Trust System

Backyard includes an automatic trust scoring system that controls whether uploaded media is displayed. New accounts start untrusted and earn trust based on account age, existing AT Protocol activity, and posting frequency. Accounts scoring 50 or above out of 100 are considered "media trusted". Admins can manually override trust via the dashboard.

## License

[Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

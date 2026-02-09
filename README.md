# Backyard

Backyard is a social blogging platform built on the [AT Protocol](https://atproto.com/). It uses its own lexicon namespace (`blue.backyard.*`) for posts, comments, reblogs, likes, and follows, storing all user data in their AT Protocol PDS. Users log in via AT Protocol OAuth with scoped permissions.

Built with SvelteKit, PostgreSQL (as a local cache/index), and Docker.

## Requirements

- Node.js 22+
- PostgreSQL 16+ (with `pg_trgm` extension available)
- An internet-accessible domain with HTTPS (for OAuth callbacks)

## Quick Start (Docker)

The included `docker-compose.yml` runs both the app and a PostgreSQL instance.

### 1. Generate secrets

Generate an OAuth private key (RS256 JWK):

```sh
node -e "const{generateKeyPairSync}=require('node:crypto');const{privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});const j=privateKey.export({format:'jwk'});j.alg='RS256';console.log(JSON.stringify(j))"
```

Generate a session secret:

```sh
openssl rand -base64 48
```

### 2. Configure environment

Copy `.env.example` to `.env` and set the required values:

| Variable | Required | Description |
|---|---|---|
| `PUBLIC_URL` | Yes | The public HTTPS URL of your instance (e.g. `https://backyard.example.com`) |
| `SESSION_SECRET` | Yes | Random string, 32+ characters. Used to encrypt session cookies. |
| `DATABASE_URL` | No | PostgreSQL connection string. Defaults to the bundled Compose database. |
| `OAUTH_PRIVATE_KEY_1` | Yes | RS256 private key in JWK format (see step 1). |
| `OAUTH_PRIVATE_KEY_2` | No | Additional key for rotation. |
| `OAUTH_PRIVATE_KEY_3` | No | Additional key for rotation. |
| `JETSTREAM_URL` | No | Custom Jetstream WebSocket URL. Defaults to `wss://jetstream2.us-east.bsky.network/subscribe`. |
| `FIREHOSE_DISABLED` | No | Set to `true` to disable the Jetstream firehose consumer. |

In production, the app will refuse to start if `SESSION_SECRET` uses a default value or if no OAuth private key is configured.

### 3. Start

```sh
docker compose up -d
```

The app listens on port 3000. Place it behind a reverse proxy (Nginx, Caddy, etc.) that terminates TLS and forwards to `localhost:3000`.

### 4. Verify

Visit `https://<your-domain>/oauth/client-metadata.json`. You should see the OAuth client metadata document with your `PUBLIC_URL` and redirect URIs.

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

No environment configuration is needed for local development. The app will use default values (local PostgreSQL at `localhost:5432`, ephemeral OAuth keys, default session secret).

## Architecture

Backyard is a SvelteKit application using `adapter-node` for production. It does not store user content itself -- all posts, comments, reblogs, likes, and follows are AT Protocol records written to each user's PDS.

PostgreSQL serves as a local index/cache. Records arrive via two paths:
- **Jetstream firehose**: real-time WebSocket stream of all `blue.backyard.*` events across the network.
- **Per-user backfill**: on login or profile view, missing records are fetched from the user's PDS via `com.atproto.repo.listRecords`.

The database schema is created automatically at startup. There is no separate migration step.

### Lexicon

All record types live under the `blue.backyard` namespace:

| Collection | Description |
|---|---|
| `blue.backyard.actor.profile` | User profile (display name, bio, avatar, banner) |
| `blue.backyard.feed.post` | Original post with text, rich text facets, media, and tags |
| `blue.backyard.feed.comment` | Comment on a post (threaded) |
| `blue.backyard.feed.reblog` | Reblog with optional text/tag additions |
| `blue.backyard.feed.like` | Like on a post |
| `blue.backyard.graph.follow` | Follow relationship |

Lexicon schemas are in the `lexicons/` directory.

### OAuth

Authentication uses AT Protocol OAuth with scoped permissions. The app requests access only to the `blue.backyard.*` collections and blob uploads -- it does not request full account access. Key endpoints:

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

## License

TBD

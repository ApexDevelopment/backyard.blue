# Deployment

## Docker

Backyard ships with a multi-stage Dockerfile and a Docker Compose configuration.

### Dockerfile

- **Build stage**: `node:22-alpine` — installs dependencies, runs `npm run build`
- **Production stage**: `node:22-alpine` — copies the built output, installs production-only dependencies
- Output directory: `build/` (from `@sveltejs/adapter-node`)
- Runs on port 3000

### Docker Compose

The default `docker-compose.yml` includes:

- **app** — the SvelteKit application, exposed on port 3000
- **db** — PostgreSQL 18.1 (Alpine), with a healthcheck and persistent volume (`pgdata`)

Default credentials: `backyard:backyard` / database `backyard`. These should be changed in production.

The app service waits for the database healthcheck before starting (`depends_on: condition: service_healthy`).

## Environment Variables

Configured via `.env` (copy from `.env.example`):

| Variable | Description | Default |
|----------|-------------|---------|
| `PUBLIC_URL` | The public URL where the app is hosted | `http://localhost:3000` |
| `SESSION_SECRET` | Secret for AES-256-GCM session cookie encryption (32+ chars) | Development fallback (insecure) |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://backyard:backyard@localhost:5432/backyard` |
| `OAUTH_PRIVATE_KEY_1` | RS256 JWK private key for OAuth client auth | Empty (ephemeral key generated in dev) |
| `OAUTH_PRIVATE_KEY_2` | Optional additional key for rotation | Empty |
| `OAUTH_PRIVATE_KEY_3` | Optional additional key for rotation | Empty |

### Generating OAuth Keys

```sh
node -e "const { JoseKey } = require('@atproto/jwk-jose'); JoseKey.generate('RS256').then(k => console.log(JSON.stringify(k.privateJwk)))"
```

### Port

The default port is **3000** across all configurations (Dockerfile, Docker Compose, `.env.example`, and code fallbacks in `oauth.ts` and `session.ts`). If you change the port, update it in all places.

## Development

For local development without Docker:

1. Start a PostgreSQL instance on port 5432 (or update `DATABASE_URL`)
2. Copy `.env.example` to `.env`
3. Run `npm install` and `npm run dev`

When `PUBLIC_URL` resolves to a loopback address (`localhost`, `127.0.0.1`, or `[::1]`), the OAuth client automatically uses the AT Protocol's **loopback client development flow** — no OAuth keys or publicly accessible metadata endpoint are required. See [atproto-oauth.md](atproto-oauth.md) for details.

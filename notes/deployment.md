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

Configured via `.env` (copy from `.env.example`). See the [environment variables table in the README](../README.md#2-configure-environment) for the full list.

### Generating OAuth Keys

```sh
node -e "const{generateKeyPairSync}=require('node:crypto');const{publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});const j=privateKey.export({format:'jwk'});j.alg='ES256';j.use='sig';console.log(JSON.stringify(j))"
```

### Port

The default port is **3000** across all configurations (Dockerfile, Docker Compose, `.env.example`, and code fallbacks in `oauth.ts` and `session.ts`). If you change the port, update it in all places.

## Development

For local development without Docker:

1. Start a PostgreSQL instance on port 5432 (or update `DATABASE_URL`)
2. Copy `.env.example` to `.env`
3. Run `npm install` and `npm run dev`

When `INSTANCE_URL` resolves to a loopback address (`localhost`, `127.0.0.1`, or `[::1]`), the OAuth client automatically uses the AT Protocol's **loopback client development flow** — no OAuth keys or publicly accessible metadata endpoint are required. See [atproto-oauth.md](atproto-oauth.md) for details.

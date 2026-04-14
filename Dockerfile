# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Copy package files from context so this layer is cached independently of source changes.
# Do NOT use --from=builder here; that would bust the cache on every build.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

COPY --from=builder /app/build build/

# NODE_ENV defaults to production but can be overridden at runtime
# (e.g. via docker-compose environment or docker run -e)
ENV NODE_ENV=${NODE_ENV:-production}
ENV PORT=3000
ENV BODY_SIZE_LIMIT=52428800

EXPOSE 3000

CMD ["node", "build"]

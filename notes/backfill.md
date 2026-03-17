# Backfill

## Problem

Backyard's local PostgreSQL database is a **cache** of records that live
authoritatively on each user's PDS. The Jetstream firehose keeps this cache
up to date in real time, but it only streams *new* events — it does not
replay the full history of every user.

This means the local cache can become empty or incomplete when:

- The PostgreSQL database is wiped (e.g. `docker compose down -v` and rebuild).
- A new Backyard instance is deployed against an existing user base.
- A user created records before Backyard's firehose consumer was running.
- Jetstream experienced downtime and the cursor gap is too large to replay.

## Solution

Backyard uses a two-layer approach:

1. **Relay discovery** — at startup, query a relay via
   `com.atproto.sync.listReposByCollection` to find every DID that has
   records in any `blue.backyard.*` collection, then backfill each one.
2. **Per-user backfill** — on-demand via `com.atproto.repo.listRecords`
   from a user's PDS, triggered on login and profile views.

### Implementation

The backfill module lives at `src/lib/server/backfill.ts` and exports two
functions:

#### `backfillUser(did: string): Promise<number>`

Fetches **all** `blue.backyard.*` records from the user's PDS and upserts
them into the local database. Returns the number of records indexed, or `-1`
if the call was skipped (due to deduplication or cooldown).

Steps:

1. Resolve the user's DID document to find their PDS URL.
2. Call `ensureProfile(did)` to cache their profile.
3. For each collection (in dependency order — see below), paginate through
   `com.atproto.repo.listRecords` with `limit=100`.
4. Upsert each record into the appropriate local table, using the same
   validation and sanitization as the firehose consumer.

#### `backfillIfNeeded(did: string): Promise<void>`

A lightweight check that queries the `posts` table for the given DID. If no
posts exist locally, it triggers `backfillUser` in the background. This is
the "lazy backfill" entry point used when viewing a profile.

### Collection Order

Collections are processed in dependency order so that foreign-key-like
references (e.g. a reblog's `root_post_uri`) can be resolved:

1. `blue.backyard.actor.profile` — handled by `ensureProfile`, not listRecords
2. `blue.backyard.feed.post` — original posts (must come first)
3. `blue.backyard.feed.reblog` — reblogs referencing posts
4. `blue.backyard.feed.comment` — comments referencing posts/reblogs
5. `blue.backyard.feed.like` — likes referencing any of the above
6. `blue.backyard.graph.follow` — follow relationships

### Deduplication & Throttling

- **In-flight deduplication**: A `Set<string>` tracks DIDs currently being
  backfilled. Concurrent calls for the same DID are silently skipped.
- **Cooldown cache**: A `Map<string, number>` records the last successful
  backfill timestamp per DID. Repeat requests within a 30-minute window are
  skipped. This prevents excessive PDS traffic if a user's profile is viewed
  repeatedly in a short period.

### Idempotency

All database writes use `ON CONFLICT ... DO UPDATE` (upsert) or
`ON CONFLICT ... DO NOTHING` semantics. Backfill can be run at any time
without risk of data corruption or duplication.

## Triggers

Backfill is triggered automatically at three points:

### 1. Server Startup (Relay Discovery)

**File**: `src/hooks.server.ts`

On startup, `discoverAndBackfill()` queries the configured relay via
`com.atproto.sync.listReposByCollection` to find every DID with records in
any `blue.backyard.*` collection. It then backfills each discovered DID
sequentially. This ensures the database is populated even after a fresh
deploy or database wipe, without waiting for users to log in.

### 2. After OAuth Login

**File**: `src/routes/oauth/callback/+server.ts`

When a user completes the OAuth flow, `backfillUser(did)` is fired in the
background (non-blocking). This ensures the user's posts, reblogs, likes,
follows, and comments are available by the time they land on the home page.

This is the most important trigger — it guarantees that the logged-in user
always has their data visible, even on a freshly deployed instance.

### 3. On Profile View

**File**: `src/routes/profile/[handle]/+page.server.ts`

When any user's profile is viewed, `backfillIfNeeded(did)` checks if we have
any posts for that user. If not, a background backfill is started.

This handles the case where a visitor navigates to a user who has never
logged in to this Backyard instance. Because the backfill is asynchronous,
the first profile view may show an empty feed, but subsequent page loads
(or a refresh) will include the backfilled data.

## Relationship to the Firehose

Backfill and the firehose are complementary:

| Mechanism          | Scope            | Timing       | Data Source                    |
| ------------------ | ---------------- | ------------ | ------------------------------ |
| Jetstream          | All known users  | Real-time    | Network firehose               |
| Relay discovery    | All Backyard users | On startup | Relay → per-user PDS           |
| Per-user backfill  | Single user      | On-demand    | User's PDS                     |

At startup, the relay discovery queries `com.atproto.sync.listReposByCollection`
to find every DID that has records in any `blue.backyard.*` collection, then
backfills each one via their PDS. After startup, the firehose picks up new
activity in real time, and per-user backfill handles on-demand cases (login,
profile views).

## Configuration

| Variable     | Default                                | Purpose                                                      |
| ------------ | -------------------------------------- | ------------------------------------------------------------ |
| `RELAY_URL`  | `https://relay1.us-east.bsky.network`  | Relay host for `com.atproto.sync.listReposByCollection`      |

The backfill module also relies on:

- The user's PDS URL, resolved from their DID document.
- The standard `com.atproto.repo.listRecords` XRPC endpoint, which is
  publicly accessible on all AT Protocol PDSes.
- The same PostgreSQL connection pool used by the rest of the application.

### Constants

| Constant                | Value       | Purpose                                    |
| ----------------------- | ----------- | ------------------------------------------ |
| `BACKFILL_COOLDOWN_MS`  | 30 minutes  | Minimum interval between backfills per DID |
| `listRecords` page size | 100         | Records per XRPC request                   |

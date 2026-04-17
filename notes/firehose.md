# Jetstream Consumption

Backyard uses Jetstream to index records created outside of Backyard (e.g. via
a third-party client writing directly to a user's PDS). This ensures that
`blue.backyard.*` records are treated as first-class regardless of origin — a
core tenet of the AT Protocol.

## Why Jetstream (not @atproto/sync)

The `@atproto/sync` package exposes a `Firehose` class that connects to the
raw AT Protocol relay firehose (`bgs.bsky.network`). It has a
`filterCollections` option, but this is **client-side only** — the full
network firehose is still downloaded and decoded (CBOR) before filtering.
For a niche namespace like `blue.backyard.*`, this is massively wasteful.

[Jetstream](https://github.com/bluesky-social/jetstream) is a JSON-based
firehose proxy operated by Bluesky PBC. It supports a `wantedCollections`
query parameter that performs **server-side filtering**. This means Backyard
only receives events for `blue.backyard.*` collections — not the entire
network.

### Jetstream Quick Facts

| Property            | Value                                                     |
| ------------------- | --------------------------------------------------------- |
| Protocol            | WebSocket (JSON frames)                                   |
| Instances           | Comma-separated in `JETSTREAM_URLS` (priority order)      |
| Collection filter   | `?wantedCollections=blue.backyard.*` (prefix matching)    |
| Cursor format       | Unix microseconds (`time_us` field on every event)        |
| Cursor persistence  | Stored in PostgreSQL `firehose_cursor` table              |
| Reconnection        | Automatic with exponential backoff + URL failover         |
| Node dependency     | None — uses Node 22 native `WebSocket`                    |

## Architecture

Backyard maintains two Jetstream connections at all times:

- **Active** — highest-priority available instance. Events are processed
  (indexed into PostgreSQL) and advance the authoritative cursor.
- **Standby** — next-highest-priority instance. Tracks its own cursor
  position but does not process events. Provides near-instant failover.

On active failure the standby is promoted to active and a new standby
opens to the next available instance. On standby failure a replacement
connects to the next available URL. A periodic timer (every 5 min) checks
whether a higher-priority instance has recovered and promotes it.

```
  Jetstream 1 (priority 0)   Backyard Server
  ┌──────────────┐  active   ┌──────────────┐
  │  wantedColl  ├─────────►│ jetstream.ts │
  │  =blue.back  │  events   │              │
  │   yard.*     │           │ processEvent │
  └──────────────┘           │      │       │
                             │      ▼       │
  Jetstream 2 (priority 1)  │ indexRecord  │──► PostgreSQL
  ┌──────────────┐  standby  │ deleteRecord │
  │  wantedColl  ├─────────►│ handleIdent. │──► profiles cache
  │  =blue.back  │  cursor   └──────────────┘
  │   yard.*     │  only
  └──────────────┘
```

## Event Types

Jetstream sends three event `kind` values:

- **`commit`** — A record was created, updated, or deleted. Contains
  `commit.operation`, `commit.collection`, `commit.rkey`, `commit.record`
  (on create/update), and `commit.cid`.
- **`identity`** — A user's handle changed. Contains `identity.handle`.
- **`account`** — Account status change (not currently processed).

## Deduplication

Records created through Backyard's dual-write path (PDS + local DB) will
also appear via Jetstream shortly after. This is handled with upsert
semantics:

- **Posts, comments, reblogs** — `ON CONFLICT (uri) DO UPDATE SET ...` so
  the Jetstream event harmlessly overwrites with identical data.
- **Likes, follows** — `ON CONFLICT (uri) DO NOTHING` since these records
  are immutable once created.
- **Profiles** — Cache is invalidated and `ensureProfile()` re-resolves
  from the network, correctly constructing blob URLs for avatar/banner.

## Configuration

| Variable            | Default                                                | Description                              |
| ------------------- | ------------------------------------------------------ | ---------------------------------------- |
| `JETSTREAM_URLS`     | `wss://jetstream1.us-east.bsky.network/subscribe,…`   | Comma-separated Jetstream WebSocket endpoints (priority order) |
| `JETSTREAM_DISABLED` | *(empty — Jetstream enabled)*                          | Set to `"true"` to disable Jetstream  |

## Cursor Persistence

The consumer's position is stored as a `time_us` (unix microseconds) value
in the `firehose_cursor` PostgreSQL table. The cursor is persisted every
10 seconds and once more on graceful shutdown. On reconnection, the cursor
is rewound by 5 seconds (5 000 000 µs) per Jetstream's recommendation for
gapless playback; idempotent indexing ensures replayed events cause no harm.

## Lifecycle

`startJetstream()` is called from `hooks.server.ts` immediately after the
database is initialized. It is fire-and-forget (errors are caught and
logged). `stopJetstream()` is available for graceful shutdown but is not
currently wired to a signal handler.

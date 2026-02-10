# Notifications / Activity

## Overview

Backyard supports in-app activity notifications when users interact with each other's content. Notifications are generated for:

- **Like** — someone liked your post or reblog
- **Comment** — someone commented on your post
- **Reblog** — someone reblogged your post or reblog
- **Follow** — someone followed you

Self-interactions (liking your own post, etc.) are silently filtered out and do not create notifications.

## Storage

Notifications live in the `notifications` table in PostgreSQL:

| Column | Type | Notes |
|--------|------|-------|
| `id` | `BIGSERIAL` | Auto-incrementing, used as cursor |
| `recipient_did` | `TEXT` | Who receives the notification |
| `actor_did` | `TEXT` | Who performed the action |
| `type` | `TEXT` | `like`, `comment`, `reblog`, or `follow` |
| `subject_uri` | `TEXT` | The AT URI of the interacted-with post/reblog (null for follows) |
| `action_uri` | `TEXT` | The AT URI of the like/comment/reblog/follow record |
| `read` | `BOOLEAN` | Defaults to `FALSE`, set to `TRUE` when viewed |
| `created_at` | `TIMESTAMPTZ` | When the notification was created |

Indexed on `(recipient_did, id DESC)` for efficient paginated reads, and a partial index on unread notifications.

## Generation

Notifications are created in two code paths:

1. **`src/lib/server/repo.ts`** — when actions originate from the Backyard web UI (dual-write path)
2. **`src/lib/server/firehose.ts`** — when actions come from external AT Protocol clients via Jetstream

Both paths use a shared helper that looks up the author of the subject post/reblog/comment and calls `createNotification()` from `src/lib/server/notifications.ts`.

## Live Delivery (SSE)

Live push uses Server-Sent Events at `/api/activity/stream`. The mechanism:

1. An in-process `EventEmitter` (node:events) acts as a pub/sub bus
2. `createNotification()` emits events on `notify:{did}` channels after DB insert
3. The SSE endpoint subscribes to the authenticated user's channel and forwards events
4. A 30-second heartbeat keeps the connection alive

**Limitation:** This is per-process only. Horizontal scaling would require a shared pub/sub layer such as PostgreSQL `LISTEN/NOTIFY` or Redis Pub/Sub.

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/activity` | `GET` | Returns unread notification count |
| `/api/activity` | `POST` | Marks notifications as read (body: `{ ids?: number[] }`) |
| `/api/activity/stream` | `GET` | SSE stream of live notifications |

## Activity Page

The `/activity` route displays a paginated list of notifications. When loaded, unread notifications on the current page are automatically marked as read. New notifications arriving via SSE are prepended to the list in real time.

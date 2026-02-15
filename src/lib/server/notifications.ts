/**
 * Notification creation, querying, and live delivery via SSE.
 *
 * Notifications are generated when someone interacts with a user's content:
 * - like on their post/reblog
 * - comment on their post
 * - reblog of their post/reblog
 * - follow
 *
 * Live delivery uses an in-process EventEmitter. SSE clients subscribe per-DID
 * and receive push events as they happen. This is per-process only — horizontal
 * scaling would require a shared pub/sub layer (e.g. PostgreSQL LISTEN/NOTIFY or Redis).
 */

import { EventEmitter } from 'node:events';
import pool from './db.js';
import { mapRowToProfile, ensureProfile } from './identity.js';
import type { BackyardNotification, BackyardProfile, NotificationType } from '$lib/types.js';

const bus = new EventEmitter();
bus.setMaxListeners(0);

/**
 * Insert a notification row and emit it to any connected SSE clients.
 * Silently skips self-interactions (actor === recipient).
 */
export async function createNotification(params: {
	recipientDid: string;
	actorDid: string;
	type: NotificationType;
	subjectUri?: string;
	actionUri: string;
}): Promise<void> {
	if (params.actorDid === params.recipientDid) return;

	// Don't create notifications from/to blocked users
	const blockExists = await pool.query(
		`SELECT 1 FROM blocks
		 WHERE (author_did = $1 AND subject_did = $2)
		    OR (author_did = $2 AND subject_did = $1)
		 LIMIT 1`,
		[params.recipientDid, params.actorDid]
	);
	if (blockExists.rows.length > 0) return;

	try {
		const result = await pool.query(
			`INSERT INTO notifications (recipient_did, actor_did, type, subject_uri, action_uri, created_at)
			 VALUES ($1, $2, $3, $4, $5, NOW())
			 RETURNING id, created_at`,
			[params.recipientDid, params.actorDid, params.type, params.subjectUri || null, params.actionUri]
		);

		const row = result.rows[0];
		if (row) {
			const actorProfile = await ensureProfile(params.actorDid).catch(() => null);
			bus.emit(`notify:${params.recipientDid}`, {
				id: row.id,
				type: params.type,
				actorDid: params.actorDid,
				actorProfile: actorProfile || { did: params.actorDid, handle: params.actorDid },
				subjectUri: params.subjectUri,
				actionUri: params.actionUri,
				createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
			});
		}
	} catch (err) {
		console.error('Failed to create notification:', err);
	}
}

/**
 * Subscribe to live notification events for a DID.
 * Returns an unsubscribe function.
 */
export function subscribeNotifications(
	did: string,
	callback: (event: Record<string, unknown>) => void
): () => void {
	const channel = `notify:${did}`;
	bus.on(channel, callback);
	return () => bus.off(channel, callback);
}

/**
 * Fetch recent notifications for a user, enriched with actor profiles and subject previews.
 */
export async function getNotifications(
	recipientDid: string,
	limit = 50,
	cursor?: string
): Promise<{ items: BackyardNotification[]; cursor: string | null }> {
	const cursorClause = cursor ? 'AND n.id < $3' : '';
	const params: (string | number)[] = [recipientDid, limit + 1];
	if (cursor) params.push(parseInt(cursor, 10));

	const result = await pool.query(
		`SELECT
			n.id, n.actor_did, n.type, n.subject_uri, n.action_uri, n.read, n.created_at,
			COALESCE(
				(SELECT LEFT(p.text, 120) FROM posts p WHERE p.uri = n.subject_uri),
				(SELECT LEFT(c.text, 120) FROM comments c WHERE c.uri = n.subject_uri),
				(SELECT LEFT(r.text, 120) FROM reblogs r WHERE r.uri = n.subject_uri)
			) AS subject_preview
		 FROM notifications n
		 WHERE n.recipient_did = $1
		   AND NOT EXISTS (
				SELECT 1 FROM blocks
				WHERE (author_did = $1 AND subject_did = n.actor_did)
				   OR (author_did = n.actor_did AND subject_did = $1)
		   )
		   ${cursorClause}
		 ORDER BY n.id DESC
		 LIMIT $2`,
		params
	);

	const rows = result.rows;
	const hasMore = rows.length > limit;
	if (hasMore) rows.pop();

	const actorDids = [...new Set(rows.map((r: any) => r.actor_did))];
	const profileMap = new Map<string, BackyardProfile>();
	if (actorDids.length > 0) {
		const profileResult = await pool.query(
			'SELECT * FROM profiles WHERE did = ANY($1)',
			[actorDids]
		);
		for (const row of profileResult.rows) {
			const p = mapRowToProfile(row);
			profileMap.set(p.did, p);
		}
	}

	const items: BackyardNotification[] = rows.map((r: any) => ({
		id: parseInt(r.id, 10),
		actor: profileMap.get(r.actor_did) || { did: r.actor_did, handle: r.actor_did },
		type: r.type as NotificationType,
		subjectUri: r.subject_uri || undefined,
		actionUri: r.action_uri,
		read: r.read,
		subjectPreview: r.subject_preview || undefined,
		createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at
	}));

	return {
		items,
		cursor: hasMore ? rows[rows.length - 1].id.toString() : null
	};
}

/**
 * Mark all notifications as read for a user, or specific IDs.
 */
export async function markNotificationsRead(
	recipientDid: string,
	ids?: number[]
): Promise<void> {
	if (ids && ids.length > 0) {
		await pool.query(
			'UPDATE notifications SET read = TRUE WHERE recipient_did = $1 AND id = ANY($2)',
			[recipientDid, ids]
		);
	} else {
		await pool.query(
			'UPDATE notifications SET read = TRUE WHERE recipient_did = $1 AND read = FALSE',
			[recipientDid]
		);
	}
}

/**
 * Get unread notification count for a user.
 */
export async function getUnreadCount(recipientDid: string): Promise<number> {
	const result = await pool.query(
		`SELECT COUNT(*)::int AS count FROM notifications
		 WHERE recipient_did = $1 AND read = FALSE
		   AND NOT EXISTS (
				SELECT 1 FROM blocks
				WHERE (author_did = $1 AND subject_did = notifications.actor_did)
				   OR (author_did = notifications.actor_did AND subject_did = $1)
		   )`,
		[recipientDid]
	);
	return result.rows[0]?.count || 0;
}

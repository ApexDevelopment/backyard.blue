/**
 * Jetstream firehose consumer.
 *
 * Connects to a Jetstream instance and listens for commits to any
 * `blue.backyard.*` collection across the entire AT Protocol network.
 * Records created by users outside of Backyard (e.g. via a third-party
 * client writing directly to the user's PDS) are indexed locally just
 * as if they originated from Backyard itself.
 *
 * Jetstream provides server-side collection filtering via the
 * `wantedCollections` parameter, so we only receive events matching
 * our lexicon namespace — not the entire network firehose.
 */

import { env } from '$env/dynamic/private';
import { NSID, ALL_NSIDS } from '$lib/lexicon.js';
import pool from './db.js';
import { ensureProfile } from './identity.js';
import { createNotification } from './notifications.js';
import {
	clampText,
	clampTags,
	clampJson,
	safeIsoDate,
	resolveRootPostUri,
	isValidAtUri,
	isValidDid,
	MAX_TEXT_LENGTH
} from './validation.js';

const DEFAULT_JETSTREAM_URL = 'wss://jetstream2.us-east.bsky.network/subscribe';
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 60_000;
const CURSOR_PERSIST_INTERVAL_MS = 10_000;

let reconnectAttempt = 0;

interface JetstreamCommit {
	rev: string;
	operation: 'create' | 'update' | 'delete';
	collection: string;
	rkey: string;
	record?: Record<string, unknown>;
	cid?: string;
}

interface JetstreamIdentity {
	did: string;
	handle: string;
	seq: number;
	time: string;
}

interface JetstreamEvent {
	did: string;
	time_us: number;
	kind: 'commit' | 'identity' | 'account';
	commit?: JetstreamCommit;
	identity?: JetstreamIdentity;
}

let ws: WebSocket | null = null;
let running = false;
let lastCursorUs: number | null = null;
let cursorTimer: ReturnType<typeof setInterval> | null = null;

async function loadCursor(): Promise<number | null> {
	const result = await pool.query(
		"SELECT cursor_us FROM firehose_cursor WHERE id = 'jetstream' LIMIT 1"
	);
	if (result.rows.length === 0) return null;
	return parseInt(result.rows[0].cursor_us, 10);
}

async function saveCursor(cursorUs: number): Promise<void> {
	await pool.query(
		`INSERT INTO firehose_cursor (id, cursor_us, updated_at)
		 VALUES ('jetstream', $1, NOW())
		 ON CONFLICT (id) DO UPDATE SET cursor_us = $1, updated_at = NOW()`,
		[cursorUs.toString()]
	);
}

function buildAtUri(did: string, collection: string, rkey: string): string {
	return `at://${did}/${collection}/${rkey}`;
}

/**
 * Look up the author of a post/reblog/comment and notify them.
 * Fire-and-forget — errors are silently swallowed.
 */
function notifySubjectAuthorFirehose(
	actorDid: string,
	subjectUri: string,
	type: 'like' | 'comment' | 'reblog',
	actionUri: string
): void {
	(async () => {
		const result = await pool.query(
			`SELECT author_did FROM posts WHERE uri = $1
			 UNION ALL
			 SELECT author_did FROM reblogs WHERE uri = $1
			 UNION ALL
			 SELECT author_did FROM comments WHERE uri = $1
			 LIMIT 1`,
			[subjectUri]
		);
		const recipientDid = result.rows[0]?.author_did;
		if (recipientDid) {
			await createNotification({ recipientDid, actorDid, type, subjectUri, actionUri });
		}
	})().catch(() => {}); // Notification errors are non-critical and have eventual consistency
}

/**
 * Index a create or update operation from the firehose.
 * Uses upsert semantics so that records already indexed via the
 * dual-write path are harmlessly deduplicated.
 */
async function indexRecord(did: string, commit: JetstreamCommit): Promise<void> {
	const uri = buildAtUri(did, commit.collection, commit.rkey);
	const cid = commit.cid || '';
	const r = commit.record || {};

	// Profile resolution is always best-effort. All we can do is attempt to
	// keep profiles in cache; if a profile record is malformed or missing,
	// the frontend will fall back to the Bluesky profile.
	// ensureProfile() should not throw; it returns null on failure, but
	// we catch() as a matter of principle.
	switch (commit.collection) {
		case NSID.PROFILE: {
			// Profile changed — invalidate cache and re-resolve from network
			// (ensureProfile fetches the DID document and profile record,
			// correctly constructing blob URLs for avatar/banner)
			await pool.query('DELETE FROM profiles WHERE did = $1', [did]);
			await ensureProfile(did).catch(() => {});
			break;
		}
		case NSID.POST: {
			await ensureProfile(did).catch(() => {});
			const postText = clampText(r.text, MAX_TEXT_LENGTH);
			await pool.query(
				`INSERT INTO posts (uri, cid, author_did, text, facets, media, tags, created_at)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
				 ON CONFLICT (uri) DO UPDATE SET
				   cid = EXCLUDED.cid, text = EXCLUDED.text, facets = EXCLUDED.facets,
				   media = EXCLUDED.media, tags = EXCLUDED.tags`,
				[
					uri,
					cid,
					did,
					postText,
					clampJson(r.facets),
					clampJson(r.media),
					clampTags(r.tags),
					safeIsoDate(r.createdAt)
				]
			);
			break;
		}
		case NSID.COMMENT: {
			await ensureProfile(did).catch(() => {});
			const subject = r.subject as { uri?: string; cid?: string } | undefined;
			const root = r.root as { uri?: string; cid?: string } | undefined;
			const parent = r.parent as { uri?: string; cid?: string } | undefined;
			await pool.query(
				`INSERT INTO comments (uri, cid, author_did, text, facets, subject_uri, root_uri, parent_uri, created_at)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
				 ON CONFLICT (uri) DO UPDATE SET
				   cid = EXCLUDED.cid, text = EXCLUDED.text, facets = EXCLUDED.facets`,
				[
					uri,
					cid,
					did,
					clampText(r.text, MAX_TEXT_LENGTH),
					clampJson(r.facets),
					subject?.uri || '',
					root?.uri || subject?.uri || '',
					parent?.uri || null,
					safeIsoDate(r.createdAt)
				]
			);
			if (subject?.uri) {
				notifySubjectAuthorFirehose(did, subject.uri, 'comment', uri);
			}
			break;
		}
		case NSID.REBLOG: {
			await ensureProfile(did).catch(() => {});
			const subject = r.subject as { uri?: string; cid?: string } | undefined;
			const subjectUri = subject?.uri || '';

			const rootPostUri = await resolveRootPostUri(subjectUri);

			await pool.query(
				`INSERT INTO reblogs (uri, cid, author_did, subject_uri, root_post_uri, text, facets, tags, created_at)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
				 ON CONFLICT (uri) DO UPDATE SET
				   cid = EXCLUDED.cid, text = EXCLUDED.text, facets = EXCLUDED.facets,
				   tags = EXCLUDED.tags, root_post_uri = EXCLUDED.root_post_uri`,
				[
					uri,
					cid,
					did,
					subjectUri,
					rootPostUri,
					clampText(r.text, MAX_TEXT_LENGTH) || null,
					clampJson(r.facets),
					clampTags(r.tags),
					safeIsoDate(r.createdAt)
				]
			);
			if (subjectUri) {
				notifySubjectAuthorFirehose(did, subjectUri, 'reblog', uri);
			}
			break;
		}
		case NSID.LIKE: {
			const subject = r.subject as { uri?: string; cid?: string } | undefined;
			await pool.query(
				`INSERT INTO likes (uri, cid, author_did, subject_uri, created_at)
				 VALUES ($1, $2, $3, $4, $5)
				 ON CONFLICT (uri) DO NOTHING`,
				[uri, cid, did, subject?.uri || '', safeIsoDate(r.createdAt)]
			);
			if (subject?.uri) {
				notifySubjectAuthorFirehose(did, subject.uri, 'like', uri);
			}
			break;
		}
		case NSID.FOLLOW: {
			const subjectDid = r.subject as string | undefined;
			if (subjectDid && isValidDid(subjectDid)) {
				await pool.query(
					`INSERT INTO follows (uri, author_did, subject_did, created_at)
					 VALUES ($1, $2, $3, $4)
					 ON CONFLICT (author_did, subject_did) DO NOTHING`,
					[uri, did, subjectDid, safeIsoDate(r.createdAt)]
				);
				ensureProfile(subjectDid).catch(() => {});
				createNotification({
					recipientDid: subjectDid,
					actorDid: did,
					type: 'follow',
					actionUri: uri
				}).catch(() => {});
			}
			break;
		}
		case NSID.BLOCK: {
			const subjectDid = r.subject as string | undefined;
			if (subjectDid && isValidDid(subjectDid)) {
				await pool.query(
					`INSERT INTO blocks (uri, author_did, subject_did, created_at)
					 VALUES ($1, $2, $3, $4)
					 ON CONFLICT (author_did, subject_did) DO NOTHING`,
					[uri, did, subjectDid, safeIsoDate(r.createdAt)]
				);
			}
			break;
		}
	}
}

async function deleteRecord(did: string, commit: JetstreamCommit): Promise<void> {
	const uri = buildAtUri(did, commit.collection, commit.rkey);

	switch (commit.collection) {
		case NSID.POST:
			await pool.query('DELETE FROM posts WHERE uri = $1', [uri]);
			break;
		case NSID.COMMENT:
			await pool.query('DELETE FROM comments WHERE uri = $1', [uri]);
			break;
		case NSID.REBLOG:
			await pool.query('DELETE FROM reblogs WHERE uri = $1', [uri]);
			break;
		case NSID.LIKE:
			await pool.query('DELETE FROM likes WHERE uri = $1', [uri]);
			break;
		case NSID.FOLLOW:
			await pool.query('DELETE FROM follows WHERE uri = $1', [uri]);
			break;
		case NSID.BLOCK:
			await pool.query('DELETE FROM blocks WHERE uri = $1', [uri]);
			break;
	}
}

async function handleIdentity(event: JetstreamEvent): Promise<void> {
	if (!event.identity?.handle) return;
	await pool.query(
		'UPDATE profiles SET handle = $1, updated_at = NOW() WHERE did = $2',
		[event.identity.handle, event.did]
	);
}

async function processEvent(event: JetstreamEvent): Promise<void> {
	if (event.kind === 'commit' && event.commit) {
		if (!(ALL_NSIDS as Set<string>).has(event.commit.collection)) return;

		if (event.commit.operation === 'create' || event.commit.operation === 'update') {
			await indexRecord(event.did, event.commit);
		} else if (event.commit.operation === 'delete') {
			await deleteRecord(event.did, event.commit);
		}
	} else if (event.kind === 'identity') {
		await handleIdentity(event);
	}

	lastCursorUs = event.time_us;
}

function connect(): void {
	if (!running) return;

	const baseUrl = env.JETSTREAM_URL || DEFAULT_JETSTREAM_URL;
	const url = new URL(baseUrl);
	url.searchParams.set('wantedCollections', 'blue.backyard.*');

	if (lastCursorUs) {
		// Rewind 5 seconds for gapless playback on reconnection
		const rewindUs = lastCursorUs - 5_000_000;
		url.searchParams.set('cursor', rewindUs.toString());
	}

	console.info(`🔥 Firehose connecting to ${url.origin}${url.pathname} (cursor: ${lastCursorUs || 'live'})`);

	ws = new WebSocket(url.toString());

	ws.addEventListener('open', () => {
		console.info('🔥 Firehose connected');
		reconnectAttempt = 0; // reset backoff on successful connection
	});

	ws.addEventListener('message', (msgEvent) => {
		try {
			const raw = typeof msgEvent.data === 'string' ? msgEvent.data : String(msgEvent.data);
			const data = JSON.parse(raw) as JetstreamEvent;
			processEvent(data).catch((err) => {
				console.error('Firehose event processing error:', err);
			});
		} catch (err) {
			console.error('Firehose message parse error:', err);
		}
	});

	ws.addEventListener('close', (event) => {
		ws = null;
		if (running) {
			reconnectAttempt++;
			// Exponential backoff with jitter: base * 2^attempt + random jitter, capped at max
			const delay = Math.min(
				RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt - 1) + Math.random() * 1000,
				RECONNECT_MAX_MS
			);
			console.warn(
				`🔥 Firehose disconnected (code: ${event.code}). Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${reconnectAttempt})…`
			);
			setTimeout(connect, delay);
		}
	});

	ws.addEventListener('error', (err) => {
		console.error('Firehose WebSocket error:', err);
	});
}

export async function startFirehose(): Promise<void> {
	if (running) return;

	if (env.FIREHOSE_DISABLED === 'true') {
		console.info('🔥 Firehose disabled via FIREHOSE_DISABLED=true');
		return;
	}

	running = true;
	lastCursorUs = await loadCursor();

	cursorTimer = setInterval(async () => {
		if (lastCursorUs) {
			try {
				await saveCursor(lastCursorUs);
			} catch (err) {
				console.error('Firehose cursor save error:', err);
			}
		}
	}, CURSOR_PERSIST_INTERVAL_MS);

	connect();
}

export async function stopFirehose(): Promise<void> {
	running = false;

	if (cursorTimer) {
		clearInterval(cursorTimer);
		cursorTimer = null;
	}

	if (lastCursorUs) {
		try {
			await saveCursor(lastCursorUs);
		} catch {
			// Best-effort on shutdown
		}
	}

	if (ws) {
		ws.close();
		ws = null;
	}

	console.info('🔥 Firehose stopped');
}

/**
 * Jetstream consumer — redundant dual-connection architecture.
 *
 * Maintains connections to the two highest-priority Jetstream instances.
 * The higher-priority connection is the "active" consumer whose events
 * are processed. The lower-priority one is a "standby" that tracks its
 * cursor position so failover is near-instantaneous.
 *
 * On active failure: promote standby to active, open a new standby to
 * the next available instance.
 *
 * On standby failure: open a new standby to the next available instance.
 *
 * A periodic promotion timer checks whether a higher-priority instance
 * has come back online and promotes it if so.
 */

import { env } from '$env/dynamic/private';
import { NSID, ALL_NSIDS } from '$lib/lexicon.js';
import pool from './db.js';
import { ensureProfile } from './identity.js';
import { createNotification, notifySubjectAuthor } from './notifications.js';
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

const DEFAULT_JETSTREAM_URLS = [
	'wss://jetstream1.us-east.bsky.network/subscribe',
	'wss://jetstream2.us-east.bsky.network/subscribe',
	'wss://jetstream1.us-west.bsky.network/subscribe',
	'wss://jetstream2.us-west.bsky.network/subscribe'
];
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 60_000;
const CURSOR_PERSIST_INTERVAL_MS = 10_000;
const EVENT_CONCURRENCY = 5;
const EVENT_QUEUE_MAX = 5_000;
const PROMOTION_CHECK_INTERVAL_MS = 5 * 60_000;

export function parseJetstreamUrls(): string[] {
	const raw = env.JETSTREAM_URLS;
	if (!raw) return DEFAULT_JETSTREAM_URLS;
	const urls = raw.split(',').map((s) => s.trim()).filter(Boolean);
	return urls.length > 0 ? urls : DEFAULT_JETSTREAM_URLS;
}

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

type ConnectionRole = 'active' | 'standby';

interface JetstreamConnection {
	url: string;
	priorityIndex: number;
	role: ConnectionRole;
	ws: WebSocket | null;
	cursorUs: number | null;
	reconnectAttempt: number;
	reconnectTimer: ReturnType<typeof setTimeout> | null;
}

let running = false;
let lastCursorUs: number | null = null;
let cursorTimer: ReturnType<typeof setInterval> | null = null;
let promotionTimer: ReturnType<typeof setInterval> | null = null;

let activeConn: JetstreamConnection | null = null;
let standbyConn: JetstreamConnection | null = null;

// Bounded event processing queue (only fed by the active connection).
const eventQueue: JetstreamEvent[] = [];
let activeWorkers = 0;

let shedStartUs: number | null = null;
let lastRecoveryAt = 0;
const RECOVERY_COOLDOWN_MS = 5 * 60_000;

function attemptShedRecovery(): void {
	if (!shedStartUs) return;
	if (eventQueue.length > 0 || activeWorkers > 0) return;

	const now = Date.now();
	if (now - lastRecoveryAt < RECOVERY_COOLDOWN_MS) {
		console.warn(
			`🔥 Jetstream shed recovery skipped — last recovery was ${((now - lastRecoveryAt) / 1000).toFixed(0)}s ago (cooldown: ${RECOVERY_COOLDOWN_MS / 1000}s)`
		);
		shedStartUs = null;
		return;
	}

	const rewindUs = shedStartUs - 5_000_000;
	console.info(`🔥 Jetstream recovering shed events — reconnecting active at cursor ${rewindUs}`);
	lastCursorUs = rewindUs;
	shedStartUs = null;
	lastRecoveryAt = now;

	if (activeConn?.ws) {
		activeConn.ws.close();
	}
}

function drainQueue(): void {
	while (activeWorkers < EVENT_CONCURRENCY && eventQueue.length > 0) {
		const event = eventQueue.shift()!;
		activeWorkers++;
		processEvent(event)
			.catch((err) => console.error('Jetstream event processing error:', err))
			.finally(() => {
				activeWorkers--;
				if (eventQueue.length === 0 && activeWorkers === 0) {
					attemptShedRecovery();
				} else {
					drainQueue();
				}
			});
	}
}

function enqueueEvent(event: JetstreamEvent): void {
	if (eventQueue.length >= EVENT_QUEUE_MAX) {
		const shed = eventQueue.shift()!;
		if (!shedStartUs) {
			shedStartUs = shed.time_us;
			console.warn(`🔥 Jetstream queue full (${EVENT_QUEUE_MAX}) — shedding events (gap starts at ${shed.time_us})`);
		}
	}
	eventQueue.push(event);
	drainQueue();
}

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

async function indexRecord(did: string, commit: JetstreamCommit): Promise<void> {
	const uri = buildAtUri(did, commit.collection, commit.rkey);
	const cid = commit.cid || '';
	const r = commit.record || {};

	switch (commit.collection) {
		case NSID.PROFILE: {
			await pool.query('DELETE FROM profiles WHERE did = $1', [did]);
			await ensureProfile(did).catch(() => {});
			break;
		}
		case NSID.POST: {
			ensureProfile(did).catch(() => {});
			await pool.query(
				`INSERT INTO posts (uri, cid, author_did, tags, content, created_at)
				 VALUES ($1, $2, $3, $4, $5, $6)
				 ON CONFLICT (uri) DO UPDATE SET
				   cid = EXCLUDED.cid, tags = EXCLUDED.tags, content = EXCLUDED.content`,
				[
					uri,
					cid,
					did,
					clampTags(r.tags),
					clampJson(r.content),
					safeIsoDate(r.createdAt)
				]
			);
			break;
		}
		case NSID.COMMENT: {
			ensureProfile(did).catch(() => {});
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
				notifySubjectAuthor(did, subject.uri, 'comment', uri);
			}
			break;
		}
		case NSID.REBLOG: {
			ensureProfile(did).catch(() => {});
			const subject = r.subject as { uri?: string; cid?: string } | undefined;
			const subjectUri = subject?.uri || '';

			const rootPostUri = await resolveRootPostUri(subjectUri);

			await pool.query(
				`INSERT INTO reblogs (uri, cid, author_did, subject_uri, root_post_uri, tags, content, created_at)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
				 ON CONFLICT (uri) DO UPDATE SET
				   cid = EXCLUDED.cid, tags = EXCLUDED.tags, content = EXCLUDED.content,
				   root_post_uri = EXCLUDED.root_post_uri`,
				[
					uri,
					cid,
					did,
					subjectUri,
					rootPostUri,
					clampTags(r.tags),
					clampJson(r.content),
					safeIsoDate(r.createdAt)
				]
			);
			if (subjectUri) {
				notifySubjectAuthor(did, subjectUri, 'reblog', uri);
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
				notifySubjectAuthor(did, subject.uri, 'like', uri);
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

		if (event.commit.rev) {
			await pool.query(
				`INSERT INTO repo_revs (did, rev, updated_at)
				 VALUES ($1, $2, NOW())
				 ON CONFLICT (did) DO UPDATE
				   SET rev = EXCLUDED.rev, updated_at = NOW()
				   WHERE repo_revs.rev < EXCLUDED.rev`,
				[event.did, event.commit.rev]
			);
		}
	} else if (event.kind === 'identity') {
		await handleIdentity(event);
	}

	if (event.time_us > (lastCursorUs || 0)) {
		lastCursorUs = event.time_us;
	}
}

/* ── Connection management ────────────────────────────── */

function makeConnection(url: string, priorityIndex: number, role: ConnectionRole): JetstreamConnection {
	return { url, priorityIndex, role, ws: null, cursorUs: null, reconnectAttempt: 0, reconnectTimer: null };
}

function closeConnection(conn: JetstreamConnection): void {
	if (conn.reconnectTimer) {
		clearTimeout(conn.reconnectTimer);
		conn.reconnectTimer = null;
	}
	if (conn.ws) {
		conn.ws.close();
		conn.ws = null;
	}
}

function connectedUrls(): Set<string> {
	const urls = new Set<string>();
	if (activeConn) urls.add(activeConn.url);
	if (standbyConn) urls.add(standbyConn.url);
	return urls;
}

function nextAvailableUrl(urls: string[], exclude: Set<string>): { url: string; index: number } | null {
	for (let i = 0; i < urls.length; i++) {
		if (!exclude.has(urls[i])) return { url: urls[i], index: i };
	}
	return null;
}

function openConnection(conn: JetstreamConnection): void {
	if (!running) return;

	const url = new URL(conn.url);
	url.searchParams.set('wantedCollections', 'blue.backyard.*');

	const cursorUs = conn.role === 'active' ? lastCursorUs : (conn.cursorUs ?? lastCursorUs);
	if (cursorUs) {
		const rewindUs = cursorUs - 5_000_000;
		url.searchParams.set('cursor', rewindUs.toString());
	}

	const tag = conn.role === 'active' ? '🔥' : '🔁';
	console.info(`${tag} Jetstream ${conn.role} connecting to ${new URL(conn.url).hostname} (cursor: ${cursorUs || 'live'})`);

	const socket = new WebSocket(url.toString());
	conn.ws = socket;

	socket.addEventListener('open', () => {
		console.info(`${tag} Jetstream ${conn.role} connected to ${new URL(conn.url).hostname}`);
		conn.reconnectAttempt = 0;
	});

	socket.addEventListener('message', (msgEvent) => {
		try {
			const raw = typeof msgEvent.data === 'string' ? msgEvent.data : String(msgEvent.data);
			const data = JSON.parse(raw) as JetstreamEvent;

			if (conn.role === 'active') {
				enqueueEvent(data);
			} else {
				// Standby: track cursor position only, don't process events
				if (data.time_us > (conn.cursorUs || 0)) {
					conn.cursorUs = data.time_us;
				}
			}
		} catch (err) {
			console.error(`Jetstream ${conn.role} message parse error:`, err);
		}
	});

	socket.addEventListener('close', (event) => {
		conn.ws = null;
		if (!running) return;

		if (conn.role === 'active') {
			handleActiveDisconnect(conn, event.code);
		} else {
			handleStandbyDisconnect(conn, event.code);
		}
	});

	socket.addEventListener('error', (err) => {
		console.error(`Jetstream ${conn.role} (${new URL(conn.url).hostname}) error:`, err);
	});
}

function handleActiveDisconnect(conn: JetstreamConnection, code: number): void {
	console.warn(`🔥 Jetstream active disconnected from ${new URL(conn.url).hostname} (code: ${code})`);

	if (standbyConn?.ws) {
		// Promote standby: it has a current cursor position
		console.info(`🔥 Promoting standby (${new URL(standbyConn.url).hostname}) to active`);
		standbyConn.role = 'active';

		// Sync cursor: the standby has been tracking its own position.
		// Use whichever cursor is further ahead to avoid re-processing
		// already-handled events while still not skipping any.
		if (standbyConn.cursorUs && standbyConn.cursorUs > (lastCursorUs || 0)) {
			lastCursorUs = standbyConn.cursorUs;
		}

		// Close and reconnect the promoted connection at the authoritative
		// cursor so its events now flow through processEvent.
		const promotedUrl = standbyConn.url;
		const promotedIndex = standbyConn.priorityIndex;
		closeConnection(standbyConn);
		activeConn = makeConnection(promotedUrl, promotedIndex, 'active');
		openConnection(activeConn);

		// Open a new standby
		standbyConn = null;
		openNextStandby();
	} else {
		// No standby available — reconnect active with backoff
		scheduleReconnect(conn);
	}
}

function handleStandbyDisconnect(conn: JetstreamConnection, code: number): void {
	console.warn(`🔁 Jetstream standby disconnected from ${new URL(conn.url).hostname} (code: ${code})`);

	// Try the next available URL for standby
	const urls = parseJetstreamUrls();
	const exclude = connectedUrls();
	exclude.add(conn.url); // don't retry the one that just failed immediately
	const next = nextAvailableUrl(urls, exclude);

	if (next) {
		standbyConn = makeConnection(next.url, next.index, 'standby');
		openConnection(standbyConn);
	} else {
		// All alternatives exhausted — retry the same one with backoff
		scheduleReconnect(conn);
	}
}

function scheduleReconnect(conn: JetstreamConnection): void {
	conn.reconnectAttempt++;
	const delay = Math.min(
		RECONNECT_BASE_MS * Math.pow(2, conn.reconnectAttempt - 1) + Math.random() * 1000,
		RECONNECT_MAX_MS
	);
	const tag = conn.role === 'active' ? '🔥' : '🔁';
	console.warn(
		`${tag} Jetstream ${conn.role} reconnecting to ${new URL(conn.url).hostname} in ${(delay / 1000).toFixed(1)}s (attempt ${conn.reconnectAttempt})`
	);
	conn.reconnectTimer = setTimeout(() => {
		conn.reconnectTimer = null;
		openConnection(conn);
	}, delay);
}

function openNextStandby(): void {
	if (standbyConn?.ws) return;

	const urls = parseJetstreamUrls();
	if (urls.length < 2) return; // only one URL configured, no standby possible

	const exclude = connectedUrls();
	const next = nextAvailableUrl(urls, exclude);
	if (!next) return;

	standbyConn = makeConnection(next.url, next.index, 'standby');
	openConnection(standbyConn);
}

function checkForPromotion(): void {
	if (!running) return;

	const urls = parseJetstreamUrls();
	if (!activeConn) return;

	// Find the highest-priority URL we're not already connected to that
	// outranks the current active connection.
	for (let i = 0; i < activeConn.priorityIndex; i++) {
		const candidateUrl = urls[i];
		if (activeConn.url === candidateUrl) continue;
		if (standbyConn?.url === candidateUrl) {
			// We have a standby on a higher-priority instance — promote it
			console.info(`🔥 Higher-priority instance ${new URL(candidateUrl).hostname} is our standby — promoting`);
			const oldActive = activeConn;

			// Swap: standby becomes active, old active becomes standby
			standbyConn.role = 'active';
			if (standbyConn.cursorUs && standbyConn.cursorUs > (lastCursorUs || 0)) {
				lastCursorUs = standbyConn.cursorUs;
			}
			const promotedUrl = standbyConn.url;
			const promotedIndex = standbyConn.priorityIndex;
			closeConnection(standbyConn);

			activeConn = makeConnection(promotedUrl, promotedIndex, 'active');
			openConnection(activeConn);

			oldActive.role = 'standby';
			standbyConn = oldActive;
			// Reconnect old active as standby (it may still be connected but
			// its message handler checks conn.role)
			closeConnection(standbyConn);
			standbyConn = makeConnection(oldActive.url, oldActive.priorityIndex, 'standby');
			openConnection(standbyConn);
			return;
		}

		// Try to connect to the higher-priority instance as a probe.
		// If it succeeds, the standby open handler will trigger another
		// promotion check on the next interval.
		if (!standbyConn?.ws) {
			console.info(`🔁 Probing higher-priority instance ${new URL(candidateUrl).hostname} as standby`);
			standbyConn = makeConnection(candidateUrl, i, 'standby');
			openConnection(standbyConn);
		}
		return;
	}

	// If standby is higher priority than active, promote it
	if (standbyConn?.ws && standbyConn.priorityIndex < activeConn.priorityIndex) {
		console.info(`🔥 Standby ${new URL(standbyConn.url).hostname} outranks active — promoting`);
		const oldActive = activeConn;

		standbyConn.role = 'active';
		if (standbyConn.cursorUs && standbyConn.cursorUs > (lastCursorUs || 0)) {
			lastCursorUs = standbyConn.cursorUs;
		}
		const promotedUrl = standbyConn.url;
		const promotedIndex = standbyConn.priorityIndex;
		closeConnection(standbyConn);
		activeConn = makeConnection(promotedUrl, promotedIndex, 'active');
		openConnection(activeConn);

		closeConnection(oldActive);
		standbyConn = makeConnection(oldActive.url, oldActive.priorityIndex, 'standby');
		openConnection(standbyConn);
		return;
	}

	// Ensure we have a standby if we don't already
	if (!standbyConn?.ws) {
		openNextStandby();
	}
}

export async function startJetstream(): Promise<void> {
	if (running) return;

	if (env.JETSTREAM_DISABLED === 'true') {
		console.info('🔥 Jetstream disabled via JETSTREAM_DISABLED=true');
		return;
	}

	running = true;
	lastCursorUs = await loadCursor();

	cursorTimer = setInterval(async () => {
		if (lastCursorUs) {
			try {
				await saveCursor(lastCursorUs);
			} catch (err) {
				console.error('Jetstream cursor save error:', err);
			}
		}
	}, CURSOR_PERSIST_INTERVAL_MS);

	const urls = parseJetstreamUrls();
	console.info(`🔥 Jetstream starting with ${urls.length} instance(s): ${urls.map((u) => new URL(u).hostname).join(', ')}`);

	// Open active on the highest-priority URL
	activeConn = makeConnection(urls[0], 0, 'active');
	openConnection(activeConn);

	// Open standby on the second-highest-priority URL (if available)
	if (urls.length > 1) {
		standbyConn = makeConnection(urls[1], 1, 'standby');
		openConnection(standbyConn);
	}

	// Periodically check if we should promote a higher-priority instance
	promotionTimer = setInterval(checkForPromotion, PROMOTION_CHECK_INTERVAL_MS);
}

export async function stopJetstream(): Promise<void> {
	running = false;

	if (cursorTimer) {
		clearInterval(cursorTimer);
		cursorTimer = null;
	}

	if (promotionTimer) {
		clearInterval(promotionTimer);
		promotionTimer = null;
	}

	if (lastCursorUs) {
		try {
			await saveCursor(lastCursorUs);
		} catch {
			// Best-effort on shutdown
		}
	}

	if (activeConn) {
		closeConnection(activeConn);
		activeConn = null;
	}

	if (standbyConn) {
		closeConnection(standbyConn);
		standbyConn = null;
	}

	eventQueue.length = 0;
	activeWorkers = 0;

	console.info('🔥 Jetstream stopped');
}

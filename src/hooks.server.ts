import type { Handle } from '@sveltejs/kit';
import { redirect, json } from '@sveltejs/kit';
import { getSessionData, clearSession } from '$lib/server/session.js';
import { initializeDatabase, startOAuthStateCleanup } from '$lib/server/db.js';
import { startFirehose } from '$lib/server/firehose.js';
import { discoverAndBackfill } from '$lib/server/backfill.js';
import { isAdmin } from '$lib/server/signup.js';
import pool from '$lib/server/db.js';

/**
 * Promise-based singleton so concurrent requests during startup await the
 * same initialisation rather than racing.
 */
let initPromise: Promise<void> | null = null;

function doInit(): Promise<void> {
	return (async () => {
		await initializeDatabase();
		startOAuthStateCleanup();
		startFirehose().catch((err) => {
			console.error('Failed to start firehose:', err);
		});
		discoverAndBackfill().catch((err) => {
			console.error('Failed to run discovery backfill:', err);
		});
	})();
}

/**
 * Simple in-memory rate limiter per IP.
 * Tracks request counts in a sliding window.
 *
 * LIMITATION: This is per-process only and does not work across multiple
 * instances. For horizontal scaling, use a shared store (e.g. Redis) or
 * enforce rate limiting at the reverse proxy / edge layer (e.g. Nginx,
 * Cloudflare, Caddy rate_limit).
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_WRITE = 60;   // write endpoints per window
const RATE_MAX_READ = 300;   // general requests per window
const RATE_MAX_BUCKETS = 50_000; // max tracked IPs per map to prevent memory exhaustion

interface RateBucket {
	count: number;
	resetAt: number;
}

const writeBuckets = new Map<string, RateBucket>();
const readBuckets = new Map<string, RateBucket>();

/**
 * Evict the oldest expired buckets when a map exceeds the size limit.
 * If no expired entries exist, evict the oldest entries by resetAt.
 */
function evictBuckets(buckets: Map<string, RateBucket>): void {
	const now = Date.now();
	// First pass: remove all expired
	for (const [key, b] of buckets) {
		if (now >= b.resetAt) buckets.delete(key);
	}
	// If still over limit, evict oldest entries
	if (buckets.size > RATE_MAX_BUCKETS) {
		const sorted = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
		const toRemove = sorted.slice(0, buckets.size - RATE_MAX_BUCKETS);
		for (const [key] of toRemove) buckets.delete(key);
	}
}

function isRateLimited(
	buckets: Map<string, RateBucket>,
	key: string,
	max: number
): boolean {
	if (buckets.size >= RATE_MAX_BUCKETS) evictBuckets(buckets);

	const now = Date.now();
	let bucket = buckets.get(key);
	if (!bucket || now >= bucket.resetAt) {
		bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
		buckets.set(key, bucket);
	}
	bucket.count++;
	return bucket.count > max;
}

// Periodically prune expired buckets to prevent memory leaks
setInterval(() => {
	const now = Date.now();
	for (const [key, b] of writeBuckets) if (now >= b.resetAt) writeBuckets.delete(key);
	for (const [key, b] of readBuckets) if (now >= b.resetAt) readBuckets.delete(key);
}, RATE_WINDOW_MS);

const WRITE_PATHS = new Set([
	'/api/auth/login',
	'/api/auth/create-account',
	'/api/post',
	'/api/like',
	'/api/follow',
	'/api/reply',
	'/api/repost',
	'/api/profile',
	'/api/onboarding',
	'/api/onboarding/follows',
	'/api/admin/allowlist',
	'/api/admin/trust',
	'/api/admin/ban',
	'/api/admin/delete-post',
	'/api/upload',
	'/api/block',
	'/api/block/tag'
]);

export const handle: Handle = async ({ event, resolve }) => {
	if (!initPromise) {
		initPromise = doInit().catch((err) => {
			console.error('Failed to initialize:', err);
			initPromise = null; // allow retry on next request
		});
	}
	await initPromise;

	// Rate limiting
	const clientIp = event.getClientAddress();
	const path = event.url.pathname;

	if (WRITE_PATHS.has(path)) {
		if (isRateLimited(writeBuckets, clientIp, RATE_MAX_WRITE)) {
			return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
				status: 429,
				headers: { 'Content-Type': 'application/json', 'Retry-After': '60' }
			});
		}
	} else {
		if (isRateLimited(readBuckets, clientIp, RATE_MAX_READ)) {
			return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
				status: 429,
				headers: { 'Content-Type': 'application/json', 'Retry-After': '60' }
			});
		}
	}

	try {
		const session = getSessionData(event.cookies);
		if (session.did) {
			// Verify the OAuth session still exists in the database
			const oauthCheck = await pool.query(
				'SELECT 1 FROM oauth_session WHERE did = $1',
				[session.did]
			);
			if (oauthCheck.rows.length === 0) {
				clearSession(event.cookies);
				// For page navigations, redirect to login immediately
				if (!path.startsWith('/api/') && !path.startsWith('/login') && !path.startsWith('/logout') && !path.startsWith('/oauth/')) {
					redirect(303, '/login');
				}
			} else {
				event.locals.did = session.did;
				event.locals.needsOnboarding = session.needsOnboarding || false;
				event.locals.isAdmin = isAdmin(session.did);

				// Check ban and pending deletion status
				const [banCheck, pendingCheck] = await Promise.all([
					pool.query('SELECT 1 FROM appview_bans WHERE did = $1', [session.did]),
					pool.query('SELECT 1 FROM pending_deletions WHERE author_did = $1 LIMIT 1', [session.did])
				]);
				event.locals.isBanned = banCheck.rows.length > 0;
				event.locals.hasPendingDeletions = pendingCheck.rows.length > 0;
			}
		}
	} catch (err) {
		// Re-throw redirects (SvelteKit uses thrown responses)
		if (err && typeof err === 'object' && 'status' in err && 'location' in err) throw err;
	}

	// Enforce bans and pending deletions: block user-facing write API calls.
	// Admin routes are exempt so admins can still manage the instance.
	if (event.locals.did && path.startsWith('/api/') && !path.startsWith('/api/admin/') && !path.startsWith('/api/auth/')) {
		const method = event.request.method;
		if (event.locals.isBanned && method !== 'GET') {
			return json({ error: 'Your account has been suspended' }, { status: 403 });
		}
		if (event.locals.hasPendingDeletions && method !== 'GET') {
			// Allow post deletion so users can resolve their violations
			if (!(path === '/api/post' && method === 'DELETE')) {
				return json({ error: 'You have pending post violations that must be resolved' }, { status: 403 });
			}
		}
	}

	const response = await resolve(event, {
		transformPageChunk: ({ html }) => {
			const theme = event.cookies.get('backyard_theme') || 'chocoberry-light';
			// Normalize bare "light"/"dark" from older cookies
			const normalized = theme === 'light' ? 'chocoberry-light' : theme === 'dark' ? 'chocoberry-dark' : theme;
			return html.replace('%backyard.theme%', normalized);
		}
	});

	// Security headers
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

	// CSP is handled by SvelteKit's built-in csp config in svelte.config.js,
	// which automatically generates nonces for inline hydration scripts.

	// HSTS — only set in production to avoid issues with local dev
	if (event.url.protocol === 'https:') {
		response.headers.set(
			'Strict-Transport-Security',
			'max-age=63072000; includeSubDomains; preload'
		);
	}

	return response;
};

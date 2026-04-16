import type { Handle } from '@sveltejs/kit';
import { redirect, json } from '@sveltejs/kit';
import { getSessionData, clearSession } from '$lib/server/session.js';
import { getSignupMode, isOnAllowlist } from '$lib/server/signup.js';
import { initializeDatabase, startOAuthStateCleanup } from '$lib/server/db.js';
import { startJetstream } from '$lib/server/jetstream.js';
import { discoverAndBackfill } from '$lib/server/backfill.js';
import { connectRedis } from '$lib/server/redis.js';
import { isAdmin } from '$lib/server/signup.js';
import { NSID } from '$lib/lexicon.js';
import { resolveHandleToDid } from '$lib/server/identity.js';
import pool from '$lib/server/db.js';
import { evictBuckets, isRateLimited, RATE_WINDOW_MS, type RateBucket } from '$lib/server/rate-limit.js';

/**
 * Promise-based singleton so concurrent requests during startup await the
 * same initialisation rather than racing.
 */
let initPromise: Promise<void> | null = null;

function doInit(): Promise<void> {
	return (async () => {
		await initializeDatabase();
		await connectRedis();
		startOAuthStateCleanup();
		startJetstream().catch((err) => {
			console.error('Failed to start Jetstream:', err);
		});
		discoverAndBackfill().catch((err) => {
			console.error('Failed to run discovery backfill:', err);
		});
	})();
}

const RATE_MAX_WRITE = 60;
const RATE_MAX_READ = 300;

const writeBuckets = new Map<string, RateBucket>();
const readBuckets = new Map<string, RateBucket>();

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

	// AT URI resolution: /at://authority/collection/rkey
	// Browsers may collapse // to /, so match both /at:// and /at:/
	const atMatch = path.match(/^\/at:\/\/?(.+)/);
	if (atMatch) {
		const atUri = `at://${atMatch[1]}`;
		const parts = atMatch[1].split('/');
		const [authority, collection, rkey] = parts;

		if (authority && collection && rkey) {
			let did = authority;
			if (!did.startsWith('did:')) {
				const resolved = await resolveHandleToDid(authority);
				if (resolved) did = resolved;
			}

			switch (collection) {
				case NSID.PROFILE:
					redirect(301, `/profile/${authority}`);
					break; // unreachable, redirect throws
				case NSID.POST:
					redirect(301, `/post/${did}/${rkey}`);
					break;
				case NSID.REBLOG:
					redirect(301, `/post/${did}/${rkey}`);
					break;
				case NSID.COMMENT:
				case NSID.LIKE:
				case NSID.FOLLOW:
				case NSID.BLOCK:
					// No dedicated page — redirect to the author's profile
					redirect(301, `/profile/${authority}`);
					break;
			}
		}

		// Not a Backyard collection or malformed URI — redirect to PDSls
		redirect(302, `https://pdsls.dev/${atUri}`);
	}

	try {
		const session = getSessionData(event.cookies);
		if (session.did) {
			const oauthCheck = await pool.query(
				'SELECT 1 FROM oauth_session WHERE did = $1',
				[session.did]
			);
			if (oauthCheck.rows.length === 0) {
				clearSession(event.cookies);
				if (!path.startsWith('/api/') && !path.startsWith('/login') && !path.startsWith('/logout') && !path.startsWith('/oauth/')) {
					redirect(303, '/login');
				}
			} else if (getSignupMode() === 'allowlist' && !isAdmin(session.did) && !(await isOnAllowlist(session.did))) {
				clearSession(event.cookies);
				if (!path.startsWith('/api/') && !path.startsWith('/login') && !path.startsWith('/logout') && !path.startsWith('/oauth/')) {
					redirect(303, '/login');
				}
			} else {
				event.locals.did = session.did;
				event.locals.needsOnboarding = session.needsOnboarding || false;
				event.locals.isAdmin = isAdmin(session.did);

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

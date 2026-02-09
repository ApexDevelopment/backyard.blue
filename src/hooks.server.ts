import type { Handle } from '@sveltejs/kit';
import { getSessionData } from '$lib/server/session.js';
import { initializeDatabase, startOAuthStateCleanup } from '$lib/server/db.js';
import { startFirehose } from '$lib/server/firehose.js';

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
	})();
}

/**
 * Simple in-memory rate limiter per IP.
 * Tracks request counts in a sliding window.
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_WRITE = 60;   // write endpoints per window
const RATE_MAX_READ = 300;   // general requests per window

interface RateBucket {
	count: number;
	resetAt: number;
}

const writeBuckets = new Map<string, RateBucket>();
const readBuckets = new Map<string, RateBucket>();

function isRateLimited(
	buckets: Map<string, RateBucket>,
	key: string,
	max: number
): boolean {
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
	'/api/post',
	'/api/like',
	'/api/follow',
	'/api/reply',
	'/api/repost'
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
			event.locals.did = session.did;
		}
	} catch {
	}

	const response = await resolve(event, {
		transformPageChunk: ({ html }) => {
			const theme = event.cookies.get('backyard_theme') || 'light';
			return html.replace('%backyard.theme%', theme);
		}
	});

	// Security headers
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

	return response;
};

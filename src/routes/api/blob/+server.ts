/**
 * GET /api/blob?did=...&cid=... — proxy and cache blobs from user PDSes.
 *
 * Clients must not fetch blobs directly from PDS getBlob endpoints.
 * This endpoint resolves the user's PDS, fetches the blob, caches it
 * on disk, and serves it with immutable cache headers (CIDs are
 * content-addressed, so they never change).
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { isValidDid } from '$lib/server/validation.js';
import pool from '$lib/server/db.js';
import { resolveDidDocument, getPdsUrl } from '$lib/server/identity.js';
import { env } from '$env/dynamic/private';
import { readFile, writeFile, mkdir, access, readdir, stat, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import Redis from 'ioredis';

const CACHE_DIR = env.BLOB_CACHE_DIR || './blob-cache';
const MAX_BLOB_SIZE = 5 * 1024 * 1024;
const CID_RE = /^[a-zA-Z0-9_-]+$/;
const MAX_CACHE_BYTES = parseInt(env.BLOB_CACHE_MAX_BYTES || '', 10) || 2 * 1024 * 1024 * 1024; // 2 GB default

const REDIS_URL = env.REDIS_URL || '';
const REDIS_MAX_BYTES = parseInt(env.BLOB_REDIS_MAX_BYTES || '', 10) || 512 * 1024 * 1024; // 512 MB default

let cacheReady = false;

async function ensureCacheDir(): Promise<void> {
	if (cacheReady) return;
	await mkdir(CACHE_DIR, { recursive: true });
	cacheReady = true;
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function listCacheFiles(): Promise<{ path: string; mtimeMs: number; size: number }[]> {
	const entries = await readdir(CACHE_DIR);
	const files: { path: string; mtimeMs: number; size: number }[] = [];
	for (const name of entries) {
		if (name.endsWith('.tmp')) continue;
		const p = join(CACHE_DIR, name);
		try {
			const s = await stat(p);
			if (s.isFile()) files.push({ path: p, mtimeMs: s.mtimeMs, size: s.size });
		} catch {
			continue;
		}
	}
	return files;
}

async function pruneCacheIfNeeded(requiredSpace: number): Promise<void> {
	if (MAX_CACHE_BYTES <= 0) return;
	try {
		const files = await listCacheFiles();
		let total = files.reduce((a, b) => a + b.size, 0);
		if (total + requiredSpace <= MAX_CACHE_BYTES) return;

		// Sort by oldest mtime first
		files.sort((a, b) => a.mtimeMs - b.mtimeMs);

		for (const f of files) {
			try {
				await unlink(f.path);
				total -= f.size;
				// Also attempt to remove corresponding .ct file if present
				if (!f.path.endsWith('.ct')) {
					const ct = `${f.path}.ct`;
					try {
						await unlink(ct);
					} catch {}
				}
				if (total + requiredSpace <= MAX_CACHE_BYTES) break;
			} catch {}
		}
	} catch (err) {
		// Non-fatal
		console.error('Cache prune error:', err);
	}
}

// ---------------------------------------------------------------------------
// Redis cache tier
// ---------------------------------------------------------------------------

let redis: Redis | null = null;

function getRedis(): Redis | null {
	if (!REDIS_URL) return null;
	if (!redis) {
		redis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
		redis.on('connect', () => console.info('Redis: connected'));
		redis.on('close', () => console.warn('Redis: connection closed'));
		redis.on('reconnecting', (ms: number) => console.info(`Redis: reconnecting in ${ms}ms`));
		redis.on('error', (err: Error) => console.error('Redis: error:', err.message));
		redis.connect().catch(() => {});
	}
	return redis;
}

const rBlobKey = (cid: string) => `blob:d:${cid}`;
const rCtKey = (cid: string) => `blob:ct:${cid}`;
const R_LRU = 'blob:lru';
const R_TOTAL = 'blob:total';

async function redisGet(cid: string): Promise<{ data: Buffer; contentType: string } | null> {
	const r = getRedis();
	if (!r) return null;
	try {
		const [data, ct] = await Promise.all([
			r.getBuffer(rBlobKey(cid)),
			r.get(rCtKey(cid))
		]);
		if (!data) return null;
		await r.zadd(R_LRU, Date.now(), cid);
		return { data, contentType: ct || 'application/octet-stream' };
	} catch {
		return null;
	}
}

async function redisSet(cid: string, data: Buffer, contentType: string): Promise<void> {
	const r = getRedis();
	if (!r) return;
	try {
		const entrySize = data.length + Buffer.byteLength(contentType);

		const exists = await r.exists(rBlobKey(cid));
		if (exists) {
			await r.zadd(R_LRU, Date.now(), cid);
			return;
		}

		await pruneRedisIfNeeded(entrySize);

		const pipeline = r.pipeline();
		pipeline.set(rBlobKey(cid), data);
		pipeline.set(rCtKey(cid), contentType);
		pipeline.zadd(R_LRU, Date.now(), cid);
		pipeline.incrby(R_TOTAL, entrySize);
		await pipeline.exec();
	} catch (err) {
		console.error('Redis blob cache write error:', err);
	}
}

async function pruneRedisIfNeeded(requiredSpace: number): Promise<void> {
	const r = getRedis();
	if (!r || REDIS_MAX_BYTES <= 0) return;
	try {
		let total = parseInt(await r.get(R_TOTAL) || '0', 10);
		if (total + requiredSpace <= REDIS_MAX_BYTES) return;

		while (total + requiredSpace > REDIS_MAX_BYTES) {
			const oldest = await r.zrange(R_LRU, 0, 9);
			if (oldest.length === 0) break;

			for (const evictCid of oldest) {
				if (total + requiredSpace <= REDIS_MAX_BYTES) break;

				const [evictData, evictCt] = await Promise.all([
					r.getBuffer(rBlobKey(evictCid)),
					r.get(rCtKey(evictCid))
				]);

				const evictSize = (evictData?.length || 0) + Buffer.byteLength(evictCt || '');

				if (evictData) {
					await ensureCacheDir();
					const diskPath = join(CACHE_DIR, evictCid);
					const diskCtPath = join(CACHE_DIR, `${evictCid}.ct`);
					try {
						await pruneCacheIfNeeded(evictData.length);
						const tmpBlob = `${diskPath}.tmp-${Date.now()}`;
						const tmpCt = `${diskCtPath}.tmp-${Date.now()}`;
						await writeFile(tmpBlob, evictData);
						await writeFile(tmpCt, evictCt || 'application/octet-stream');
						await rename(tmpBlob, diskPath);
						await rename(tmpCt, diskCtPath);
					} catch (err) {
						console.error('Failed to evict blob to disk:', err);
					}
				}

				const pipeline = r.pipeline();
				pipeline.del(rBlobKey(evictCid), rCtKey(evictCid));
				pipeline.zrem(R_LRU, evictCid);
				pipeline.decrby(R_TOTAL, evictSize);
				await pipeline.exec();
				total -= evictSize;
			}
		}
	} catch (err) {
		console.error('Redis blob cache prune error:', err);
	}
}

async function resolvePdsUrl(did: string): Promise<string | null> {
	const cached = await pool.query('SELECT pds_url FROM profiles WHERE did = $1', [did]);
	if (cached.rows[0]?.pds_url) return cached.rows[0].pds_url;

	try {
		const didDoc = await resolveDidDocument(did);
		return getPdsUrl(didDoc) || null;
	} catch {
		return null;
	}
}

const CACHE_HEADERS = {
	'Cache-Control': 'public, max-age=31536000, immutable',
	'X-Content-Type-Options': 'nosniff'
} as const;

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.did) {
		return json({ error: 'Authentication required' }, { status: 401 });
	}

	const did = url.searchParams.get('did');
	const cid = url.searchParams.get('cid');

	if (!did || !cid || !isValidDid(did) || !CID_RE.test(cid)) {
		return new Response('Invalid parameters', { status: 400 });
	}

	// 1. Try Redis
	const redisHit = await redisGet(cid);
	if (redisHit) {
		return new Response(Buffer.from(redisHit.data).buffer as ArrayBuffer, {
			headers: { 'Content-Type': redisHit.contentType, ...CACHE_HEADERS }
		});
	}

	await ensureCacheDir();

	const blobPath = join(CACHE_DIR, cid);
	const ctPath = join(CACHE_DIR, `${cid}.ct`);

	// 2. Try disk
	if (await fileExists(blobPath)) {
		try {
			const [data, contentType] = await Promise.all([
				readFile(blobPath),
				readFile(ctPath, 'utf-8').catch(() => 'application/octet-stream')
			]);
			return new Response(data.buffer as ArrayBuffer, {
				headers: { 'Content-Type': contentType.trim(), ...CACHE_HEADERS }
			});
		} catch {
			// Cache read failed — fall through to fetch from PDS
		}
	}

	// 3. Fetch from PDS
	const pdsUrl = await resolvePdsUrl(did);
	if (!pdsUrl) {
		return new Response('Could not resolve PDS for DID', { status: 502 });
	}

	let blobRes: Response;
	try {
		blobRes = await fetch(
			`${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`
		);
	} catch {
		return new Response('Failed to fetch blob from PDS', { status: 502 });
	}

	if (!blobRes.ok) {
		return new Response('Blob not found', { status: blobRes.status === 404 ? 404 : 502 });
	}

	const contentType = blobRes.headers.get('content-type') || 'application/octet-stream';

	let data: Uint8Array;
	try {
		data = new Uint8Array(await blobRes.arrayBuffer());
	} catch {
		return new Response('Failed to read blob response', { status: 502 });
	}

	if (data.length > MAX_BLOB_SIZE) {
		return new Response('Blob exceeds size limit', { status: 502 });
	}

	// Store in cache — Redis primary, disk fallback
	if (getRedis()) {
		await redisSet(cid, Buffer.from(data), contentType);
	} else {
		try {
			await pruneCacheIfNeeded(data.length + Buffer.byteLength(contentType || ''));
			const tmpBlob = `${blobPath}.tmp-${Date.now()}`;
			const tmpCt = `${ctPath}.tmp-${Date.now()}`;
			await writeFile(tmpBlob, data);
			await writeFile(tmpCt, contentType);
			await rename(tmpBlob, blobPath);
			await rename(tmpCt, ctPath);
		} catch (err) {
			console.error('Failed to write blob cache:', err);
		}
	}

	return new Response(data.buffer as ArrayBuffer, {
		headers: { 'Content-Type': contentType, ...CACHE_HEADERS }
	});
};

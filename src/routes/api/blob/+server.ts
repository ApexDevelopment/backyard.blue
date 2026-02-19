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

const CACHE_DIR = env.BLOB_CACHE_DIR || './blob-cache';
const MAX_BLOB_SIZE = 5 * 1024 * 1024;
const CID_RE = /^[a-zA-Z0-9_-]+$/;
const MAX_CACHE_BYTES = parseInt(env.BLOB_CACHE_MAX_BYTES || '', 10) || 2 * 1024 * 1024 * 1024; // 2 GB default

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

	await ensureCacheDir();

	const blobPath = join(CACHE_DIR, cid);
	const ctPath = join(CACHE_DIR, `${cid}.ct`);

	// Serve from cache
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

	// Resolve PDS
	const pdsUrl = await resolvePdsUrl(did);
	if (!pdsUrl) {
		return new Response('Could not resolve PDS for DID', { status: 502 });
	}

	// Fetch from PDS
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

	// Prune cache if needed, then write atomically
	try {
		await pruneCacheIfNeeded(data.length + Buffer.byteLength(contentType || ''));
		const tmpBlob = `${blobPath}.tmp-${Date.now()}`;
		const tmpCt = `${ctPath}.tmp-${Date.now()}`;
		await writeFile(tmpBlob, data);
		await writeFile(tmpCt, contentType);
		await rename(tmpBlob, blobPath);
		await rename(tmpCt, ctPath);
	} catch (err) {
		// Non-fatal — cache best-effort
		console.error('Failed to write blob cache:', err);
	}

	return new Response(data.buffer as ArrayBuffer, {
		headers: { 'Content-Type': contentType, ...CACHE_HEADERS }
	});
};

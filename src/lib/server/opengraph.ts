/**
 * OpenGraph / Twitter Card metadata fetcher — extracts embed preview data from URLs.
 *
 * Results are cached in PostgreSQL so repeated lookups for the same URL are instant.
 * Fetch failures are also cached (as null metadata) to prevent repeated timeouts.
 */

import pool from './db.js';

export interface OGData {
	url: string;
	title?: string;
	description?: string;
	image?: string;
	siteName?: string;
}

const FETCH_TIMEOUT = 5_000;
const MAX_BODY_BYTES = 256_000; // only read the first 256 KB
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const NEGATIVE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour for failures

/**
 * Block SSRF: reject URLs that resolve to private/internal IP ranges.
 * Checks the hostname against known private, loopback, and link-local ranges.
 */
function isPrivateUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		const hostname = parsed.hostname.toLowerCase();

		// Loopback
		if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') {
			return true;
		}

		// IPv4 private ranges
		const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
		if (ipv4Match) {
			const [, a, b] = ipv4Match.map(Number);
			if (a === 10) return true;                          // 10.0.0.0/8
			if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16.0.0/12
			if (a === 192 && b === 168) return true;              // 192.168.0.0/16
			if (a === 169 && b === 254) return true;              // 169.254.0.0/16 (link-local / cloud metadata)
			if (a === 127) return true;                           // 127.0.0.0/8
			if (a === 0) return true;                             // 0.0.0.0/8
		}

		// IPv6 private/link-local (bracketed in URLs)
		const bare = hostname.replace(/^\[|\]$/g, '');
		if (bare.startsWith('fc') || bare.startsWith('fd') || bare.startsWith('fe80')) {
			return true;
		}

		return false;
	} catch {
		return true; // reject unparseable URLs
	}
}

/**
 * Fetch OpenGraph / Twitter Card metadata for a URL.
 * Tries oEmbed for known providers first, then falls back to HTML scraping.
 * Returns cached data when available; fetches and caches on miss.
 */
export async function fetchOGData(url: string): Promise<OGData | null> {
	// Only allow http(s) URLs
	if (!/^https?:\/\//i.test(url)) return null;

	// Block SSRF: reject private/internal URLs
	if (isPrivateUrl(url)) return null;

	const cached = await getCached(url);
	if (cached !== undefined) return cached;

	// Try oEmbed first for known providers
	const oembedData = await tryOEmbed(url);
	if (oembedData) {
		await cacheResult(url, oembedData);
		return oembedData;
	}

	// Fall back to HTML scraping
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

		// Follow redirects manually to check each target against SSRF blocklist
		let targetUrl = url;
		let res: Response | undefined;
		for (let redirects = 0; redirects < 5; redirects++) {
			res = await fetch(targetUrl, {
				signal: controller.signal,
				headers: {
					'User-Agent': 'Mozilla/5.0 (compatible; backyard.blue/1.0; +https://backyard.blue)',
					Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
				},
				redirect: 'manual'
			});
			if (res.status >= 300 && res.status < 400) {
				const location = res.headers.get('location');
				if (!location) break;
				const resolved = new URL(location, targetUrl).toString();
				if (isPrivateUrl(resolved)) {
					clearTimeout(timer);
					await cacheResult(url, null);
					return null;
				}
				targetUrl = resolved;
				continue;
			}
			break;
		}
		clearTimeout(timer);

		if (!res) {
			await cacheResult(url, null);
			return null;
		}

		const ct = res.headers.get('content-type') || '';
		if (!ct.includes('text/html') && !ct.includes('application/xhtml')) {
			await cacheResult(url, null);
			return null;
		}

		// Stream-read only the first MAX_BODY_BYTES
		const reader = res.body?.getReader();
		if (!reader) {
			await cacheResult(url, null);
			return null;
		}

		const chunks: Uint8Array[] = [];
		let totalBytes = 0;
		while (totalBytes < MAX_BODY_BYTES) {
			const { done, value } = await reader.read();
			if (done || !value) break;
			chunks.push(value);
			totalBytes += value.length;
		}
		reader.cancel().catch(() => {});

		const body = new TextDecoder().decode(concatUint8(chunks, totalBytes));
		const data = parseOGTags(body, url);

		if (!data.title && !data.description && !data.image) {
			await cacheResult(url, null);
			return null;
		}

		await cacheResult(url, data);
		return data;
	} catch (err) {
		console.error(`[opengraph] Failed to fetch ${url}:`, err);
		await cacheResult(url, null);
		return null;
	}
}

function concatUint8(chunks: Uint8Array[], total: number): Uint8Array {
	const result = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		const slice = offset + chunk.length > total ? chunk.slice(0, total - offset) : chunk;
		result.set(slice, offset);
		offset += slice.length;
	}
	return result;
}

// ── oEmbed providers ────────────────────────────────────

interface OEmbedProvider {
	pattern: RegExp;
	endpoint: string;
}

const OEMBED_PROVIDERS: OEmbedProvider[] = [
	{
		pattern: /^https?:\/\/(?:www\.)?youtube\.com\/watch/i,
		endpoint: 'https://www.youtube.com/oembed'
	},
	{
		pattern: /^https?:\/\/youtu\.be\//i,
		endpoint: 'https://www.youtube.com/oembed'
	},
	{
		pattern: /^https?:\/\/(?:www\.)?vimeo\.com\/\d+/i,
		endpoint: 'https://vimeo.com/api/oembed.json'
	},
	{
		pattern: /^https?:\/\/(?:www\.)?soundcloud\.com\//i,
		endpoint: 'https://soundcloud.com/oembed'
	},
	{
		pattern: /^https?:\/\/open\.spotify\.com\//i,
		endpoint: 'https://open.spotify.com/oembed'
	},
	{
		pattern: /^https?:\/\/(?:www\.)?flickr\.com\//i,
		endpoint: 'https://www.flickr.com/services/oembed'
	}
];

/**
 * Try fetching metadata via oEmbed for known providers.
 * Returns OGData on success, null if no provider matches or the request fails.
 */
async function tryOEmbed(url: string): Promise<OGData | null> {
	const provider = OEMBED_PROVIDERS.find((p) => p.pattern.test(url));
	if (!provider) return null;

	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

		const oembedUrl = `${provider.endpoint}?url=${encodeURIComponent(url)}&format=json`;
		const res = await fetch(oembedUrl, {
			signal: controller.signal,
			headers: { Accept: 'application/json' }
		});
		clearTimeout(timer);

		if (!res.ok) return null;

		const json = (await res.json()) as Record<string, unknown>;

		const data: OGData = { url };
		if (typeof json.title === 'string') data.title = json.title.slice(0, 300);
		if (typeof json.author_name === 'string') data.description = json.author_name;
		if (typeof json.thumbnail_url === 'string') data.image = json.thumbnail_url;
		if (typeof json.provider_name === 'string') data.siteName = json.provider_name;

		if (!data.title && !data.image) return null;
		return data;
	} catch {
		return null;
	}
}

/**
 * Parse OpenGraph and Twitter Card meta tags from raw HTML.
 * Uses regex matching — no DOM parser dependency needed server-side.
 */
function parseOGTags(html: string, url: string): OGData {
	const data: OGData = { url };

	const metaPattern = /<meta\s+([^>]*?)\/?>/gi;
	let match: RegExpExecArray | null;

	const metas: { property?: string; name?: string; content?: string }[] = [];

	while ((match = metaPattern.exec(html)) !== null) {
		const attrs = match[1];
		const property = getAttr(attrs, 'property');
		const name = getAttr(attrs, 'name');
		const content = getAttr(attrs, 'content');
		if (content && (property || name)) {
			metas.push({ property: property?.toLowerCase(), name: name?.toLowerCase(), content });
		}
	}

	// OG takes priority, fall back to Twitter Card, then <title>
	for (const m of metas) {
		const key = m.property || m.name;
		switch (key) {
			case 'og:title':
				data.title = m.content;
				break;
			case 'og:description':
				data.description = m.content;
				break;
			case 'og:image':
				data.image = resolveUrl(m.content!, url);
				break;
			case 'og:site_name':
				data.siteName = m.content;
				break;
			case 'twitter:title':
				if (!data.title) data.title = m.content;
				break;
			case 'twitter:description':
				if (!data.description) data.description = m.content;
				break;
			case 'twitter:image':
				if (!data.image) data.image = resolveUrl(m.content!, url);
				break;
		}
	}

	// Fallback: extract <title> if no OG/Twitter title
	if (!data.title) {
		const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
		if (titleMatch) data.title = decodeEntities(titleMatch[1].trim());
	}

	// Fallback: meta description
	if (!data.description) {
		const desc = metas.find((m) => m.name === 'description');
		if (desc) data.description = desc.content;
	}

	// Decode HTML entities in text fields
	if (data.title) data.title = decodeEntities(data.title).slice(0, 300);
	if (data.description) data.description = decodeEntities(data.description).slice(0, 600);
	if (data.siteName) data.siteName = decodeEntities(data.siteName).slice(0, 200);

	return data;
}

function getAttr(attrs: string, name: string): string | undefined {
	const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
	const m = pattern.exec(attrs);
	return m ? m[1] ?? m[2] ?? m[3] : undefined;
}

function resolveUrl(src: string, base: string): string {
	try {
		return new URL(src, base).href;
	} catch {
		return src;
	}
}

const ENTITY_MAP: Record<string, string> = {
	'&amp;': '&',
	'&lt;': '<',
	'&gt;': '>',
	'&quot;': '"',
	'&#39;': "'",
	'&apos;': "'"
};

function decodeEntities(s: string): string {
	return s
		.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
		.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
		.replace(/&(amp|lt|gt|quot|#39|apos);/gi, (m) => ENTITY_MAP[m.toLowerCase()] || m);
}

// ── PostgreSQL cache ─────────────────────────────────────

async function getCached(url: string): Promise<OGData | null | undefined> {
	try {
		const { rows } = await pool.query(
			`SELECT data, fetched_at, is_null FROM embed_cache WHERE url = $1 LIMIT 1`,
			[url]
		);
		if (rows.length === 0) return undefined; // cache miss

		const row = rows[0];
		const age = Date.now() - new Date(row.fetched_at).getTime();
		const ttl = row.is_null ? NEGATIVE_CACHE_TTL_MS : CACHE_TTL_MS;
		if (age > ttl) return undefined; // expired

		return row.is_null ? null : (row.data as OGData);
	} catch {
		return undefined; // table might not exist yet on first call
	}
}

async function cacheResult(url: string, data: OGData | null): Promise<void> {
	try {
		await pool.query(
			`INSERT INTO embed_cache (url, data, is_null, fetched_at)
			 VALUES ($1, $2, $3, NOW())
			 ON CONFLICT (url) DO UPDATE SET data = $2, is_null = $3, fetched_at = NOW()`,
			[url, data ? JSON.stringify(data) : null, data === null]
		);
	} catch {
		// non-critical — silently ignore cache write failures
	}
}

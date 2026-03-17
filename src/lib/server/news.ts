/**
 * Fetches site.standard.document records from the official @backyard.blue
 * account to display as news items in the sidebar. Records are fetched
 * directly from the account's PDS via com.atproto.repo.listRecords and
 * cached in memory with a short TTL to avoid hammering the PDS on every
 * page load.
 */

import { env } from '$env/dynamic/private';
import { resolveDidDocument, getPdsUrl } from './identity.js';
import type { NewsDocument } from '$lib/types.js';

const COLLECTION = 'site.standard.document';
const DEFAULT_NEWS_HANDLE = 'backyard.blue';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ITEMS = 5;
const BACKOFF_BASE_MS = 60 * 1000; // 1 minute
const BACKOFF_MAX_MS = 30 * 60 * 1000; // 30 minutes

interface DocumentRecord {
	$type?: string;
	site: string;
	title: string;
	path?: string;
	description?: string;
	publishedAt: string;
	updatedAt?: string;
}

interface ListRecordsResponse {
	records: {
		uri: string;
		cid: string;
		value: DocumentRecord;
	}[];
	cursor?: string;
}

let cache: { items: NewsDocument[]; fetchedAt: number } | null = null;
let failureCount = 0;
let nextRetryAt = 0;

/**
 * Resolve the DID for the news account. Tries NEWS_DID env var first,
 * then resolves the handle via DNS/HTTP.
 */
async function resolveNewsDid(): Promise<string> {
	const explicit = env.NEWS_DID?.trim();
	if (explicit) return explicit;

	const handle = env.NEWS_HANDLE?.trim() || DEFAULT_NEWS_HANDLE;

	// Try DNS-based resolution first (_atproto.handle)
	// Fall back to HTTP well-known
	const res = await fetch(`https://${handle}/.well-known/atproto-did`);
	if (!res.ok) throw new Error(`Could not resolve handle ${handle}: HTTP ${res.status}`);
	const did = (await res.text()).trim();
	if (!did.startsWith('did:')) throw new Error(`Invalid DID from handle resolution: ${did}`);
	return did;
}

/**
 * Fetch the latest site.standard.document records from the news account's PDS.
 */
async function fetchDocuments(): Promise<NewsDocument[]> {
	const did = await resolveNewsDid();
	const didDoc = await resolveDidDocument(did);
	const pdsUrl = getPdsUrl(didDoc);
	if (!pdsUrl) throw new Error(`No PDS URL found for news account ${did}`);

	const url = new URL(`${pdsUrl}/xrpc/com.atproto.repo.listRecords`);
	url.searchParams.set('repo', did);
	url.searchParams.set('collection', COLLECTION);
	url.searchParams.set('limit', MAX_ITEMS.toString());
	url.searchParams.set('reverse', 'true');

	const res = await fetch(url.toString());
	if (!res.ok) {
		if (res.status === 400) return []; // collection doesn't exist yet
		throw new Error(`listRecords ${COLLECTION} returned ${res.status}`);
	}

	const data = (await res.json()) as ListRecordsResponse;

	return data.records
		.map((rec) => {
			const v = rec.value;
			const siteBase = v.site?.replace(/\/$/, '');
			const canonicalUrl =
				siteBase && v.path ? `${siteBase.startsWith('at://') ? '' : ''}${siteBase}${v.path}` : undefined;

			return {
				uri: rec.uri,
				title: v.title,
				description: v.description,
				url: canonicalUrl && !canonicalUrl.startsWith('at://') ? canonicalUrl : undefined,
				publishedAt: v.publishedAt
			} satisfies NewsDocument;
		})
		.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

/**
 * Get news documents, returning cached results if fresh enough.
 * Never throws — returns an empty array on failure so the news panel
 * degrades gracefully.
 */
export async function getNewsDocuments(): Promise<NewsDocument[]> {
	const now = Date.now();

	if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
		return cache.items;
	}

	if (failureCount > 0 && now < nextRetryAt) {
		return cache?.items ?? [];
	}

	try {
		const items = await fetchDocuments();
		cache = { items, fetchedAt: now };
		failureCount = 0;
		nextRetryAt = 0;
		return items;
	} catch (err) {
		failureCount++;
		const delay = Math.min(BACKOFF_BASE_MS * Math.pow(2, failureCount - 1), BACKOFF_MAX_MS);
		nextRetryAt = now + delay;
		const message = err instanceof Error ? err.message : String(err);
		console.warn(`news fetch failed (attempt ${failureCount}, retrying in ${delay / 1000}s): ${message}`);
		return cache?.items ?? [];
	}
}

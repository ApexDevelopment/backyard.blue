/**
 * AT Protocol identity resolution and profile caching.
 * Resolves DIDs to handles, PDS URLs, and caches profile data in PostgreSQL.
 */

import pool from './db.js';
import type { BackyardProfile } from '$lib/types.js';
import { escapeLike, isValidDid } from './validation.js';

interface DidDocument {
	id: string;
	service?: { id: string; type: string; serviceEndpoint: string }[];
	alsoKnownAs?: string[];
}

/**
 * Validate that a domain is a public hostname (not an IP, localhost, or private range).
 * Prevents SSRF via did:web resolution.
 */
function isValidPublicDomain(domain: string): boolean {
	// Reject empty or overly long domains
	if (!domain || domain.length > 253) return false;

	// Reject anything that looks like an IP address (v4 or v6)
	if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) return false;
	if (/^\[/.test(domain)) return false;

	// Reject localhost and loopback
	const lower = domain.toLowerCase();
	if (lower === 'localhost' || lower.endsWith('.localhost')) return false;
	if (lower.endsWith('.local')) return false;

	// Reject internal/private TLDs and common internal names
	if (lower.endsWith('.internal') || lower.endsWith('.corp') || lower.endsWith('.home')) return false;

	// Must look like a valid hostname with at least one dot (e.g. "example.com")
	if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(domain)) return false;

	return true;
}

export async function resolveDidDocument(did: string): Promise<DidDocument> {
	if (did.startsWith('did:plc:')) {
		const res = await fetch(`https://plc.directory/${did}`);
		if (!res.ok) throw new Error(`PLC directory returned ${res.status} for ${did}`);
		return res.json();
	}
	if (did.startsWith('did:web:')) {
		const domain = did.slice('did:web:'.length);

		// Validate domain to prevent SSRF — reject IPs, localhost, and private ranges
		if (!isValidPublicDomain(domain)) {
			throw new Error(`Refusing to resolve did:web with non-public domain: ${domain}`);
		}

		const res = await fetch(`https://${domain}/.well-known/did.json`);
		if (!res.ok) throw new Error(`did:web resolution returned ${res.status} for ${did}`);
		return res.json();
	}
	throw new Error(`Unsupported DID method: ${did}`);
}

export function getPdsUrl(didDoc: DidDocument): string | undefined {
	return didDoc.service?.find(
		(s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer'
	)?.serviceEndpoint;
}

/**
 * Extract the handle from a DID document's alsoKnownAs field.
 */
export function getHandle(didDoc: DidDocument): string | undefined {
	const aka = didDoc.alsoKnownAs?.find((a) => a.startsWith('at://'));
	return aka?.slice('at://'.length);
}

/**
 * Construct a full URL to a blob stored on a PDS.
 */
export function blobUrl(pdsUrl: string, did: string, cid: string): string {
	return `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`;
}

/**
 * Check whether a user has a blue.backyard.actor.profile record in their PDS.
 * Returns the record value if found, or null.
 */
export async function getBackyardProfileRecord(did: string): Promise<Record<string, unknown> | null> {
	try {
		const didDoc = await resolveDidDocument(did);
		const pdsUrl = getPdsUrl(didDoc);
		if (!pdsUrl) return null;

		const res = await fetch(
			`${pdsUrl}/xrpc/com.atproto.repo.getRecord?` +
				`repo=${encodeURIComponent(did)}&` +
				`collection=blue.backyard.actor.profile&rkey=self`
		);
		if (res.ok) {
			const data = await res.json();
			return data.value || null;
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Fetch a user's Bluesky (app.bsky.actor.profile) from their PDS.
 * Returns the profile data or null.
 */
export async function getBlueskyProfileRecord(did: string): Promise<{
	displayName?: string;
	pronouns?: string;
	description?: string;
	avatarCid?: string;
	bannerCid?: string;
	avatarUrl?: string;
	bannerUrl?: string;
} | null> {
	try {
		const didDoc = await resolveDidDocument(did);
		const pdsUrl = getPdsUrl(didDoc);
		if (!pdsUrl) return null;

		const res = await fetch(
			`${pdsUrl}/xrpc/com.atproto.repo.getRecord?` +
				`repo=${encodeURIComponent(did)}&` +
				`collection=app.bsky.actor.profile&rkey=self`
		);
		if (!res.ok) return null;

		const data = await res.json();
		const record = data.value;
		if (!record) return null;

		const result: {
			displayName?: string;
			pronouns?: string;
			description?: string;
			avatarCid?: string;
			bannerCid?: string;
			avatarUrl?: string;
			bannerUrl?: string;
		} = {};

		if (record.displayName) result.displayName = record.displayName;
		if (record.pronouns) result.pronouns = record.pronouns;
		if (record.description) result.description = record.description;
		if (record.avatar?.ref?.$link) {
			result.avatarCid = record.avatar.ref.$link;
			result.avatarUrl = blobUrl(pdsUrl, did, record.avatar.ref.$link);
		}
		if (record.banner?.ref?.$link) {
			result.bannerCid = record.banner.ref.$link;
			result.bannerUrl = blobUrl(pdsUrl, did, record.banner.ref.$link);
		}

		return result;
	} catch {
		return null;
	}
}

/**
 * Map a raw database row from the profiles table to a BackyardProfile object.
 */
export function mapRowToProfile(p: any): BackyardProfile {
	return {
		did: p.did,
		handle: p.handle,
		displayName: p.display_name || undefined,
		pronouns: p.pronouns || undefined,
		description: p.description || undefined,
		avatar: p.avatar || undefined,
		banner: p.banner || undefined,
		pdsUrl: p.pds_url || undefined
	};
}

/** Maximum age for a cached profile before re-resolving from the network (24 hours). */
const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Ensure a profile exists in the local cache. If missing or stale, resolve from the network.
 * Returns the cached profile, or null if resolution fails.
 */
export async function ensureProfile(did: string): Promise<BackyardProfile | null> {
	const cached = await pool.query('SELECT * FROM profiles WHERE did = $1', [did]);
	if (cached.rows.length > 0) {
		const p = cached.rows[0];
		const age = p.updated_at ? Date.now() - new Date(p.updated_at).getTime() : Infinity;
		const isStale = age > PROFILE_TTL_MS;

		// If the cached profile has meaningful data and isn't stale, return it.
		// Otherwise, treat it as stale and re-resolve from the network.
		if ((p.display_name || p.avatar) && !isStale) {
			return mapRowToProfile(p);
		}
	}

	try {
		const didDoc = await resolveDidDocument(did);
		const pdsUrl = getPdsUrl(didDoc);
		const handle = getHandle(didDoc) || did;

		let displayName: string | undefined;
		let pronouns: string | undefined;
		let description: string | undefined;
		let avatar: string | undefined;
		let banner: string | undefined;

		// Try reading their blue.backyard.actor.profile from PDS
		if (pdsUrl) {
			let foundBackyardProfile = false;
			try {
				const profileRes = await fetch(
					`${pdsUrl}/xrpc/com.atproto.repo.getRecord?` +
						`repo=${encodeURIComponent(did)}&` +
						`collection=blue.backyard.actor.profile&rkey=self`
				);
				if (profileRes.ok) {
					const data = await profileRes.json();
					const record = data.value;
					displayName = record?.displayName;
					pronouns = record?.pronouns;
					description = record?.description;
					if (record?.avatar?.ref?.$link) {
						avatar = blobUrl(pdsUrl, did, record.avatar.ref.$link);
					}
					if (record?.banner?.ref?.$link) {
						banner = blobUrl(pdsUrl, did, record.banner.ref.$link);
					}
					foundBackyardProfile = true;
				}
			} catch {
				// No backyard profile record — will try Bluesky fallback
			}

			// Fall back to app.bsky.actor.profile if no backyard profile was found
			if (!foundBackyardProfile) {
				try {
					const bskyRes = await fetch(
						`${pdsUrl}/xrpc/com.atproto.repo.getRecord?` +
							`repo=${encodeURIComponent(did)}&` +
							`collection=app.bsky.actor.profile&rkey=self`
					);
					if (bskyRes.ok) {
						const data = await bskyRes.json();
						const record = data.value;
						displayName = record?.displayName;
						pronouns = record?.pronouns;
						description = record?.description;
						if (record?.avatar?.ref?.$link) {
							avatar = blobUrl(pdsUrl, did, record.avatar.ref.$link);
						}
						if (record?.banner?.ref?.$link) {
							banner = blobUrl(pdsUrl, did, record.banner.ref.$link);
						}
					}
				} catch {
					// No Bluesky profile either — user just won't have profile data
				}
			}
		}

		// Upsert into the profile cache. COALESCE preserves existing values when
		// the network resolution returns NULL — this is intentional for a cache
		// refresh, where missing data shouldn't erase previously-known values.
		await pool.query(
			`INSERT INTO profiles (did, handle, display_name, pronouns, description, avatar, banner, pds_url)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			 ON CONFLICT (did) DO UPDATE SET
			   handle = $2, display_name = COALESCE($3, profiles.display_name),
			   pronouns = COALESCE($4, profiles.pronouns),
			   description = COALESCE($5, profiles.description),
			   avatar = COALESCE($6, profiles.avatar),
			   banner = COALESCE($7, profiles.banner),
			   pds_url = COALESCE($8, profiles.pds_url),
			   updated_at = NOW()`,
			[did, handle, displayName, pronouns, description, avatar, banner, pdsUrl]
		);

		return { did, handle, displayName, pronouns, description, avatar, banner, pdsUrl };
	} catch (err) {
		console.error(`Failed to resolve profile for ${did}:`, err);
		return null;
	}
}

/**
 * Update a cached profile with new data. Used after the user edits their profile.
 * Uses an UPSERT so it works even if the profile row was evicted from the cache.
 *
 * NULL semantics:
 *   - Text fields (displayName, pronouns, description): NULL means "clear the field"
 *   - Media fields (avatar, banner): NULL means "keep existing" (use empty string to clear)
 *
 * This distinction exists because media URLs require an explicit upload/remove action,
 * while text fields can legitimately be emptied by sending null/empty.
 */
export async function updateCachedProfile(
	did: string,
	updates: Partial<Pick<BackyardProfile, 'handle' | 'displayName' | 'pronouns' | 'description' | 'avatar' | 'banner'>>
): Promise<void> {
	// Resolve handle for the INSERT branch — we need at least a handle for
	// the row to be useful.
	let handle = updates.handle;
	if (!handle) {
		try {
			const didDoc = await resolveDidDocument(did);
			handle = getHandle(didDoc) || did;
		} catch {
			handle = did;
		}
	}

	await pool.query(
		`INSERT INTO profiles (did, handle, display_name, pronouns, description, avatar, banner, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
		 ON CONFLICT (did) DO UPDATE SET
		   handle = COALESCE($2, profiles.handle),
		   display_name = $3,
		   pronouns = $4,
		   description = $5,
		   avatar = COALESCE($6, profiles.avatar),
		   banner = COALESCE($7, profiles.banner),
		   updated_at = NOW()`,
		[
			did,
			handle,
			updates.displayName ?? null,
			updates.pronouns ?? null,
			updates.description ?? null,
			updates.avatar ?? null,
			updates.banner ?? null
		]
	);
}

export async function getProfileByHandle(handle: string): Promise<BackyardProfile | null> {
	const result = await pool.query('SELECT * FROM profiles WHERE handle = $1', [handle]);
	if (result.rows.length === 0) return null;
	return mapRowToProfile(result.rows[0]);
}

/**
 * Resolve a handle to a DID via the AT Protocol's resolveHandle XRPC.
 * Uses HANDLE_RESOLVER_URL env var if set, falling back to Bluesky's public API.
 * Returns null if the handle cannot be resolved.
 */
export async function resolveHandleToDid(handle: string): Promise<string | null> {
	const resolvers = [
		process.env.HANDLE_RESOLVER_URL,
		'https://public.api.bsky.app'
	].filter(Boolean) as string[];

	for (const baseUrl of resolvers) {
		try {
			const res = await fetch(
				`${baseUrl}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
			);
			if (!res.ok) continue;
			const data = await res.json();
			if (data.did) return data.did;
		} catch {
			continue;
		}
	}
	return null;
}

/**
 * Search profiles by handle or display name (simple text search).
 */
export async function searchProfiles(query: string, limit = 25): Promise<BackyardProfile[]> {
	const escaped = escapeLike(query);
	const result = await pool.query(
		`SELECT * FROM profiles
		 WHERE handle ILIKE $1 ESCAPE '\\' OR display_name ILIKE $1 ESCAPE '\\'
		 ORDER BY
		   CASE WHEN handle ILIKE $2 ESCAPE '\\' THEN 0 ELSE 1 END,
		   handle
		 LIMIT $3`,
		[`%${escaped}%`, `${escaped}%`, limit]
	);

	return result.rows.map(mapRowToProfile);
}

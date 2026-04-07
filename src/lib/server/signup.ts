/**
 * Signup gating — controls who is allowed to create a new session on this
 * Backyard instance.
 *
 * Three modes (set via SIGNUP_MODE env var):
 *   - "open"      — anyone can sign in (default)
 *   - "allowlist"  — only DIDs / handles listed in the signup_allowlist table
 *   - "closed"     — no new signups; only returning users can sign in
 *
 * "Returning user" means a DID that already has a row in oauth_session.
 */

import { env } from '$env/dynamic/private';
import pool from './db.js';
import { resolveHandleToDid } from './identity.js';

export type SignupMode = 'open' | 'allowlist' | 'closed';

/**
 * Read the current signup mode from the environment.
 * Falls back to "open" if unset or unrecognised.
 */
export function getSignupMode(): SignupMode {
	const raw = (env.SIGNUP_MODE || 'open').trim().toLowerCase();
	if (raw === 'allowlist' || raw === 'closed') return raw;
	return 'open';
}

/**
 * Read admin DIDs from the environment.
 */
export function getAdminDids(): Set<string> {
	const raw = env.ADMIN_DIDS || '';
	const dids = raw.split(',').map((d) => d.trim()).filter(Boolean);
	return new Set(dids);
}

export function isAdmin(did?: string): boolean {
	if (!did) return false;
	return getAdminDids().has(did);
}

/**
 * Check whether a DID is a returning user (has an existing session).
 */
export async function isReturningUser(did: string): Promise<boolean> {
	const result = await pool.query(
		'SELECT 1 FROM oauth_session WHERE did = $1 LIMIT 1',
		[did]
	);
	return result.rows.length > 0;
}

/**
 * Check whether a DID is on the signup allowlist.
 */
export async function isOnAllowlist(did: string): Promise<boolean> {
	const result = await pool.query(
		'SELECT 1 FROM signup_allowlist WHERE identifier = $1 LIMIT 1',
		[did]
	);
	return result.rows.length > 0;
}

/**
 * Determine whether a user should be allowed to complete sign-in.
 * Returning users always pass. New users are subject to the signup mode.
 */
export async function canSignIn(
	did: string
): Promise<{ allowed: boolean; reason?: string }> {
	const mode = getSignupMode();

	// Returning users always pass regardless of mode
	if (await isReturningUser(did)) {
		return { allowed: true };
	}

	switch (mode) {
		case 'open':
			return { allowed: true };

		case 'allowlist':
			if (await isOnAllowlist(did)) {
				return { allowed: true };
			}
			return {
				allowed: false,
				reason: 'This instance is invite-only. Your account is not on the allowlist.'
			};

		case 'closed':
			return {
				allowed: false,
				reason: 'Signups are currently disabled on this instance.'
			};

		default:
			return { allowed: true };
	}
}

// ─── Allowlist management (for admin API) ────────────────────────────

export interface AllowlistEntry {
	identifier: string;
	note: string | null;
	addedAt: string;
}

export async function getAllowlist(): Promise<AllowlistEntry[]> {
	const result = await pool.query(
		'SELECT identifier, note, added_at FROM signup_allowlist ORDER BY added_at DESC'
	);
	return result.rows.map((r) => ({
		identifier: r.identifier,
		note: r.note || null,
		addedAt: r.added_at instanceof Date ? r.added_at.toISOString() : r.added_at
	}));
}

export async function addToAllowlist(identifier: string, note?: string): Promise<string> {
	let did = identifier.trim();
	if (!did.startsWith('did:')) {
		const resolved = await resolveHandleToDid(did.replace(/^@/, ''));
		if (!resolved) throw new Error(`Could not resolve handle "${did}" to a DID`);
		did = resolved;
	}
	await pool.query(
		`INSERT INTO signup_allowlist (identifier, note) VALUES ($1, $2)
		 ON CONFLICT (identifier) DO UPDATE SET note = $2, added_at = NOW()`,
		[did, note?.trim() || null]
	);
	return did;
}

export async function removeFromAllowlist(identifier: string): Promise<boolean> {
	const result = await pool.query(
		'DELETE FROM signup_allowlist WHERE identifier = $1',
		[identifier.trim()]
	);
	return (result.rowCount ?? 0) > 0;
}

/**
 * Shared validation and sanitisation helpers.
 */

import pool from './db.js';

/** Maximum text length for posts, comments, and reblog additions. */
export const MAX_TEXT_LENGTH = 3000;

/** Maximum number of tags per record. */
export const MAX_TAGS = 30;

/** Maximum length of an individual tag. */
export const MAX_TAG_LENGTH = 128;

/** Maximum serialised JSON size for facets or media (256 KB). */
export const MAX_JSON_SIZE = 256 * 1024;

/** AT-URI regex: at://<did>/<collection>/<rkey> */
const AT_URI_RE = /^at:\/\/did:[a-zA-Z0-9._:%-]+\/[a-zA-Z0-9.]+\/[a-zA-Z0-9._~-]+$/;

/** DID regex (loose): did:<method>:<identifier> */
const DID_RE = /^did:[a-z]+:[a-zA-Z0-9._:%-]+$/;

/** ISO 8601 date-time (loose check) */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/**
 * Validate that a string looks like an AT-URI.
 */
export function isValidAtUri(uri: string): boolean {
	return typeof uri === 'string' && AT_URI_RE.test(uri) && uri.length < 512;
}

/**
 * Validate that a string looks like a DID.
 */
export function isValidDid(did: string): boolean {
	return typeof did === 'string' && DID_RE.test(did) && did.length < 256;
}

/**
 * Clamp text to the maximum allowed length.
 */
export function clampText(text: unknown, maxLen = MAX_TEXT_LENGTH): string {
	if (typeof text !== 'string') return '';
	return text.slice(0, maxLen);
}

/**
 * Sanitise and clamp a tags array.
 */
export function clampTags(tags: unknown): string[] | null {
	if (!Array.isArray(tags)) return null;
	return tags
		.filter((t): t is string => typeof t === 'string' && t.length > 0)
		.slice(0, MAX_TAGS)
		.map((t) => t.slice(0, MAX_TAG_LENGTH));
}

/**
 * Validate and clamp a JSON-serialisable object (facets, media).
 * Returns null if the serialised form exceeds the size limit.
 */
export function clampJson(value: unknown): string | null {
	if (value == null) return null;
	try {
		const json = JSON.stringify(value);
		if (json.length > MAX_JSON_SIZE) return null;
		return json;
	} catch {
		return null;
	}
}

/**
 * Validate an ISO 8601 date string. Returns a valid ISO string or the current time.
 */
export function safeIsoDate(value: unknown): string {
	if (typeof value === 'string' && ISO_DATE_RE.test(value)) {
		const d = new Date(value);
		if (!isNaN(d.getTime())) return d.toISOString();
	}
	return new Date().toISOString();
}

/**
 * Resolve root_post_uri for a reblog.
 * If the subject is itself a reblog, inherit the root; otherwise the subject IS the root.
 */
export async function resolveRootPostUri(subjectUri: string): Promise<string> {
	if (!subjectUri) return subjectUri;
	const parentReblog = await pool.query(
		'SELECT root_post_uri FROM reblogs WHERE uri = $1 LIMIT 1',
		[subjectUri]
	);
	if (parentReblog.rows.length > 0 && parentReblog.rows[0].root_post_uri) {
		return parentReblog.rows[0].root_post_uri;
	}
	return subjectUri;
}

/**
 * Escape SQL LIKE metacharacters in user input.
 */
export function escapeLike(input: string): string {
	return input.replace(/[%_\\]/g, '\\$&');
}

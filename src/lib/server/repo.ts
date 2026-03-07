/**
 * Repository operations for Backyard custom lexicons.
 * Wraps com.atproto.repo XRPC calls + local PostgreSQL indexing.
 * Every write goes to both the user's PDS and our local index.
 */

import type { Agent } from '@atproto/api';
import { NSID } from '$lib/lexicon.js';
import pool from './db.js';
import { ensureProfile } from './identity.js';
import { resolveRootPostUri, getReblogDepth, MAX_REBLOG_DEPTH } from './validation.js';
import { createNotification, notifySubjectAuthor } from './notifications.js';
import type { QueryResult } from 'pg';

/** Parse an AT URI into its components */
export function parseAtUri(uri: string): { repo: string; collection: string; rkey: string } {
	const stripped = uri.replace('at://', '');
	const [repo, collection, rkey] = stripped.split('/');
	return { repo, collection, rkey };
}

export async function createPost(
	agent: Agent,
	did: string,
	data: { text: string; facets?: any[]; media?: any[]; tags?: string[]; langs?: string[] }
): Promise<{ uri: string; cid: string }> {
	const now = new Date().toISOString();
	const record = {
		$type: NSID.POST,
		text: data.text,
		facets: data.facets,
		media: data.media,
		tags: data.tags,
		langs: data.langs,
		createdAt: now
	};

	const res = await agent.com.atproto.repo.createRecord({
		repo: did,
		collection: NSID.POST,
		record
	});

	await pool.query(
		`INSERT INTO posts (uri, cid, author_did, text, facets, media, tags, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 ON CONFLICT (uri) DO NOTHING`,
		[
			res.data.uri,
			res.data.cid,
			did,
			data.text,
			data.facets ? JSON.stringify(data.facets) : null,
			data.media ? JSON.stringify(data.media) : null,
			data.tags || null,
			now
		]
	);

	return { uri: res.data.uri, cid: res.data.cid };
}

export async function updatePost(
	agent: Agent,
	did: string,
	uri: string,
	data: { text: string; facets?: any[]; media?: any[]; tags?: string[] }
): Promise<{ uri: string; cid: string }> {
	const { rkey } = parseAtUri(uri);

	// Fetch existing record to preserve createdAt
	const existing = await agent.com.atproto.repo.getRecord({
		repo: did,
		collection: NSID.POST,
		rkey
	});

	const record = {
		...existing.data.value as Record<string, unknown>,
		text: data.text,
		facets: data.facets || undefined,
		media: data.media || undefined,
		tags: data.tags || undefined
	};

	const res = await agent.com.atproto.repo.putRecord({
		repo: did,
		collection: NSID.POST,
		rkey,
		record
	});

	await pool.query(
		`UPDATE posts SET cid = $1, text = $2, facets = $3, media = $4, tags = $5
		 WHERE uri = $6 AND author_did = $7`,
		[
			res.data.cid,
			data.text,
			data.facets ? JSON.stringify(data.facets) : null,
			data.media ? JSON.stringify(data.media) : null,
			data.tags || null,
			uri,
			did
		]
	);

	return { uri: res.data.uri, cid: res.data.cid };
}

export async function updateReblog(
	agent: Agent,
	did: string,
	uri: string,
	data: { text?: string; facets?: any[]; tags?: string[] }
): Promise<{ uri: string; cid: string }> {
	const { rkey } = parseAtUri(uri);

	const existing = await agent.com.atproto.repo.getRecord({
		repo: did,
		collection: NSID.REBLOG,
		rkey
	});

	const record = {
		...existing.data.value as Record<string, unknown>,
		text: data.text || undefined,
		facets: data.facets || undefined,
		tags: data.tags || undefined
	};

	const res = await agent.com.atproto.repo.putRecord({
		repo: did,
		collection: NSID.REBLOG,
		rkey,
		record
	});

	await pool.query(
		`UPDATE reblogs SET cid = $1, text = $2, facets = $3, tags = $4
		 WHERE uri = $5 AND author_did = $6`,
		[
			res.data.cid,
			data.text || null,
			data.facets ? JSON.stringify(data.facets) : null,
			data.tags || null,
			uri,
			did
		]
	);

	return { uri: res.data.uri, cid: res.data.cid };
}

export async function createComment(
	agent: Agent,
	did: string,
	data: {
		text: string;
		subjectUri: string;
		subjectCid: string;
		rootUri: string;
		rootCid: string;
		parentUri?: string;
		parentCid?: string;
		facets?: any[];
	}
): Promise<{ uri: string; cid: string }> {
	const now = new Date().toISOString();
	const record: any = {
		$type: NSID.COMMENT,
		text: data.text,
		facets: data.facets,
		subject: { uri: data.subjectUri, cid: data.subjectCid },
		root: { uri: data.rootUri, cid: data.rootCid },
		createdAt: now
	};
	if (data.parentUri && data.parentCid) {
		record.parent = { uri: data.parentUri, cid: data.parentCid };
	}

	const res = await agent.com.atproto.repo.createRecord({
		repo: did,
		collection: NSID.COMMENT,
		record
	});

	await pool.query(
		`INSERT INTO comments (uri, cid, author_did, text, facets, subject_uri, root_uri, parent_uri, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 ON CONFLICT (uri) DO NOTHING`,
		[
			res.data.uri,
			res.data.cid,
			did,
			data.text,
			data.facets ? JSON.stringify(data.facets) : null,
			data.subjectUri,
			data.rootUri,
			data.parentUri || null,
			now
		]
	);

	notifySubjectAuthor(did, data.subjectUri, 'comment', res.data.uri);

	return { uri: res.data.uri, cid: res.data.cid };
}

export async function createReblog(
	agent: Agent,
	did: string,
	data: {
		subjectUri: string;
		subjectCid: string;
		text?: string;
		facets?: any[];
		tags?: string[];
	}
): Promise<{ uri: string; cid: string }> {
	const now = new Date().toISOString();
	const record: any = {
		$type: NSID.REBLOG,
		subject: { uri: data.subjectUri, cid: data.subjectCid },
		createdAt: now
	};
	if (data.text) record.text = data.text;
	if (data.facets) record.facets = data.facets;
	if (data.tags) record.tags = data.tags;

	// Enforce reblog chain depth limit at write time
	const depth = await getReblogDepth(data.subjectUri);
	if (depth >= MAX_REBLOG_DEPTH) {
		throw new Error(`Reblog chain depth limit (${MAX_REBLOG_DEPTH}) exceeded`);
	}

	// Resolve root_post_uri: if subject is a reblog, inherit its root; otherwise subject IS the root
	const rootPostUri = await resolveRootPostUri(data.subjectUri);

	const res = await agent.com.atproto.repo.createRecord({
		repo: did,
		collection: NSID.REBLOG,
		record
	});

	await pool.query(
		`INSERT INTO reblogs (uri, cid, author_did, subject_uri, root_post_uri, text, facets, tags, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 ON CONFLICT (uri) DO NOTHING`,
		[
			res.data.uri,
			res.data.cid,
			did,
			data.subjectUri,
			rootPostUri,
			data.text || null,
			data.facets ? JSON.stringify(data.facets) : null,
			data.tags || null,
			now
		]
	);

	notifySubjectAuthor(did, data.subjectUri, 'reblog', res.data.uri);

	return { uri: res.data.uri, cid: res.data.cid };
}

export async function createLike(
	agent: Agent,
	did: string,
	subjectUri: string,
	subjectCid: string
): Promise<{ uri: string; cid: string }> {
	const now = new Date().toISOString();

	// First check if the like already exists to avoid unnecessary PDS calls
	// The user can of course duplicate likes on their own PDS, so this is
	// just harm reduction.
	const existing = await pool.query(
		`SELECT uri, cid FROM likes WHERE author_did = $1 AND subject_uri = $2`,
		[did, subjectUri]
	);

	if (existing.rowCount && existing.rowCount > 0) {
		return { uri: existing.rows[0].uri, cid: existing.rows[0].cid };
	}

	const res = await agent.com.atproto.repo.createRecord({
		repo: did,
		collection: NSID.LIKE,
		record: {
			$type: NSID.LIKE,
			subject: { uri: subjectUri, cid: subjectCid },
			createdAt: now
		}
	});

	await pool.query(
		`INSERT INTO likes (uri, cid, author_did, subject_uri, created_at)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (uri) DO NOTHING`,
		[res.data.uri, res.data.cid, did, subjectUri, now]
	);

	notifySubjectAuthor(did, subjectUri, 'like', res.data.uri);

	return { uri: res.data.uri, cid: res.data.cid };
}

export async function createFollow(
	agent: Agent,
	did: string,
	subjectDid: string,
	opts?: { silent?: boolean }
): Promise<{ uri: string; cid: string }> {
	// Prevent duplicate follow records on the PDS
	const existing = await pool.query(
		'SELECT uri FROM follows WHERE author_did = $1 AND subject_did = $2',
		[did, subjectDid]
	);
	if (existing.rows.length > 0) {
		return { uri: existing.rows[0].uri, cid: '' };
	}

	const now = new Date().toISOString();
	const res = await agent.com.atproto.repo.createRecord({
		repo: did,
		collection: NSID.FOLLOW,
		record: {
			$type: NSID.FOLLOW,
			subject: subjectDid,
			createdAt: now
		}
	});

	await pool.query(
		`INSERT INTO follows (uri, author_did, subject_did, created_at)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (author_did, subject_did) DO NOTHING`,
		[res.data.uri, did, subjectDid, now]
	);

	// Ensure the followed user's profile is cached
	ensureProfile(subjectDid).catch(() => {});

	if (!opts?.silent) {
		createNotification({
			recipientDid: subjectDid,
			actorDid: did,
			type: 'follow',
			actionUri: res.data.uri
		}).catch(() => {});
	}

	return { uri: res.data.uri, cid: res.data.cid };
}

export async function createBlock(
	agent: Agent,
	did: string,
	subjectDid: string
): Promise<{ uri: string; cid: string }> {
	// Return existing block if already blocking this user
	const existing = await pool.query(
		'SELECT uri FROM blocks WHERE author_did = $1 AND subject_did = $2',
		[did, subjectDid]
	);
	if (existing.rows[0]) {
		return { uri: existing.rows[0].uri, cid: '' };
	}

	const now = new Date().toISOString();
	const res = await agent.com.atproto.repo.createRecord({
		repo: did,
		collection: NSID.BLOCK,
		record: {
			$type: NSID.BLOCK,
			subject: subjectDid,
			createdAt: now
		}
	});

	await pool.query(
		`INSERT INTO blocks (uri, author_did, subject_did, created_at)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (author_did, subject_did) DO UPDATE SET uri = $1`,
		[res.data.uri, did, subjectDid, now]
	);

	// Remove the viewer's outgoing follow (PDS + local)
	const outgoing = await pool.query(
		'SELECT uri FROM follows WHERE author_did = $1 AND subject_did = $2',
		[did, subjectDid]
	);
	if (outgoing.rows[0]) {
		deleteRecord(agent, outgoing.rows[0].uri).catch(() => {});
	}

	// Remove the blocked user's incoming follow from local index only
	// (we can't delete from their PDS without their auth)
	await pool.query(
		'DELETE FROM follows WHERE author_did = $1 AND subject_did = $2',
		[subjectDid, did]
	);

	return { uri: res.data.uri, cid: res.data.cid };
}

/**
 * 
 * @throws Error if the delete operation fails on the PDS side.
 * If the record isn't deleted locally, we don't throw;
 * we are not the source of truth and will eventually be consistent.
 */
export async function deleteRecord(agent: Agent, uri: string): Promise<void> {
	const { repo, collection, rkey } = parseAtUri(uri);

	const pdsResponse = await agent.com.atproto.repo.deleteRecord({ repo, collection, rkey });
	
	if (!pdsResponse.success) {
		throw new Error(`unable to delete record from PDS!`);
	}
	
	let queryResult: QueryResult | null = null;
	switch (collection) {
		case NSID.POST:
			queryResult = await pool.query('DELETE FROM posts WHERE uri = $1', [uri]);
			break;
		case NSID.COMMENT:
			queryResult = await pool.query('DELETE FROM comments WHERE uri = $1', [uri]);
			break;
		case NSID.REBLOG:
			queryResult = await pool.query('DELETE FROM reblogs WHERE uri = $1', [uri]);
			break;
		case NSID.LIKE:
			queryResult = await pool.query('DELETE FROM likes WHERE uri = $1', [uri]);
			break;
		case NSID.FOLLOW:
			queryResult = await pool.query('DELETE FROM follows WHERE uri = $1', [uri]);
			break;
		case NSID.BLOCK:
			queryResult = await pool.query('DELETE FROM blocks WHERE uri = $1', [uri]);
			break;
	}

	if (queryResult && queryResult.rowCount === 0) {
		console.warn(`Attempted to delete non-existent record: ${uri}`);
	}
}

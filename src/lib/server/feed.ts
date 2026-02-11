/**
 * Feed aggregation and querying.
 * Backyard acts as its own AppView — feeds are built from the local PostgreSQL index.
 */

import pool from './db.js';
import { mapRowToProfile, ensureProfile } from './identity.js';
import type {
	BackyardPost,
	BackyardFeedItem,
	BackyardComment,
	BackyardProfile,
	BackyardChainEntry
} from '$lib/types.js';

/**
 * Resolve a batch of DIDs to profiles.
 * First checks the local cache, then eagerly resolves any missing profiles
 * from the network via ensureProfile so we don't show raw DIDs.
 */
async function resolveProfiles(dids: string[]): Promise<Map<string, BackyardProfile>> {
	if (dids.length === 0) return new Map();
	const unique = [...new Set(dids)];
	const res = await pool.query('SELECT * FROM profiles WHERE did = ANY($1)', [unique]);
	const map = new Map<string, BackyardProfile>();
	for (const row of res.rows) {
		const profile = mapRowToProfile(row);
		map.set(profile.did, profile);
	}

	// Eagerly resolve any uncached profiles from the network.
	// Run them concurrently but don't let a single failure break the batch.
	const missing = unique.filter((did) => !map.has(did));
	if (missing.length > 0) {
		const settled = await Promise.allSettled(missing.map((did) => ensureProfile(did)));
		for (let i = 0; i < missing.length; i++) {
			const result = settled[i];
			if (result.status === 'fulfilled' && result.value) {
				map.set(missing[i], result.value);
			} else {
				map.set(missing[i], { did: missing[i], handle: missing[i] });
			}
		}
	}

	return map;
}

/** Enrich a raw post row with counts and viewer state. */
function enrichPost(
	row: any,
	profiles: Map<string, BackyardProfile>
): BackyardPost {
	return {
		uri: row.uri,
		cid: row.cid,
		author: profiles.get(row.author_did) || { did: row.author_did, handle: row.author_did },
		text: row.text,
		facets: row.facets || undefined,
		media: row.media || undefined,
		tags: row.tags || undefined,
		likeCount: parseInt(row.like_count, 10) || 0,
		commentCount: parseInt(row.comment_count, 10) || 0,
		reblogCount: parseInt(row.reblog_count, 10) || 0,
		viewerLike: row.viewer_like || undefined,
		viewerReblog: row.viewer_reblog || undefined,
		createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
		indexedAt: row.indexed_at instanceof Date ? row.indexed_at.toISOString() : (row.indexed_at || row.created_at)
	};
}

function toIso(val: any): string {
	return val instanceof Date ? val.toISOString() : val;
}

/**
 * Build reblog chains for a batch of reblog URIs.
 * Uses a recursive CTE to walk backward from each leaf reblog through parent reblogs
 * until reaching the root post.
 *
 * Returns a Map from leaf reblog URI → BackyardChainEntry[] (root post first, leaf last).
 */
async function buildReblogChains(
	reblogUris: string[]
): Promise<Map<string, BackyardChainEntry[]>> {
	if (reblogUris.length === 0) return new Map();

	// Recursive CTE: walk from each leaf reblog backward through parent reblogs.
	// Stops when subject_uri no longer matches a reblog (i.e. it's a post).
	const chainResult = await pool.query(
		`WITH RECURSIVE chain AS (
			SELECT
				r.uri as leaf_uri,
				r.uri, r.cid, r.author_did, r.subject_uri,
				r.text, r.facets, r.media, r.tags, r.created_at,
				0 as depth
			FROM reblogs r WHERE r.uri = ANY($1)

			UNION ALL

			SELECT
				c.leaf_uri,
				r.uri, r.cid, r.author_did, r.subject_uri,
				r.text, r.facets, r.media, r.tags, r.created_at,
				c.depth + 1
			FROM chain c
			JOIN reblogs r ON r.uri = c.subject_uri
			WHERE c.depth < 15
		)
		SELECT * FROM chain ORDER BY leaf_uri, depth DESC`,
		[reblogUris]
	);

	// Group chain entries by leaf_uri, collect root post URIs
	const chainsByLeaf = new Map<string, any[]>();
	const rootPostUris = new Set<string>();

	for (const row of chainResult.rows) {
		if (!chainsByLeaf.has(row.leaf_uri)) {
			chainsByLeaf.set(row.leaf_uri, []);
		}
		chainsByLeaf.get(row.leaf_uri)!.push(row);
	}

	// The deepest entry in each chain has a subject_uri pointing to the root post
	for (const [, entries] of chainsByLeaf) {
		if (entries.length > 0) {
			rootPostUris.add(entries[0].subject_uri);
		}
	}

	// Also handle reblogUris with no chain entries (direct reblog, not in reblogs table yet)
	// These would not appear in chainResult, so handle gracefully

	// Fetch root posts
	const rootPostRows = new Map<string, any>();
	if (rootPostUris.size > 0) {
		const postResult = await pool.query(
			'SELECT * FROM posts WHERE uri = ANY($1)',
			[[...rootPostUris]]
		);
		for (const row of postResult.rows) {
			rootPostRows.set(row.uri, row);
		}
	}

	// Collect all DIDs for profile resolution
	const dids = new Set<string>();
	for (const row of chainResult.rows) dids.add(row.author_did);
	for (const [, post] of rootPostRows) dids.add(post.author_did);
	const profiles = await resolveProfiles([...dids]);

	// Build chain arrays
	const result = new Map<string, BackyardChainEntry[]>();
	for (const [leafUri, entries] of chainsByLeaf) {
		const chain: BackyardChainEntry[] = [];

		// First: root post (or tombstone if it's been deleted)
		const rootUri = entries[0].subject_uri;
		const rootPost = rootPostRows.get(rootUri);
		if (rootPost) {
			chain.push({
				uri: rootPost.uri,
				cid: rootPost.cid,
				author: profiles.get(rootPost.author_did) || { did: rootPost.author_did, handle: rootPost.author_did },
				text: rootPost.text || '',
				facets: rootPost.facets || undefined,
				media: rootPost.media || undefined,
				tags: rootPost.tags || undefined,
				createdAt: toIso(rootPost.created_at),
				isRoot: true
			});
		} else {
			chain.push({
				uri: rootUri,
				cid: '',
				author: { did: '', handle: '' },
				text: '',
				createdAt: '',
				isRoot: true,
				deleted: true
			});
		}

		// Then: intermediate reblogs + leaf reblog (ordered oldest → newest, since ORDER BY depth DESC)
		for (const entry of entries) {
			chain.push({
				uri: entry.uri,
				cid: entry.cid,
				author: profiles.get(entry.author_did) || { did: entry.author_did, handle: entry.author_did },
				text: entry.text || '',
				facets: entry.facets || undefined,
				media: entry.media || undefined,
				tags: entry.tags || undefined,
				createdAt: toIso(entry.created_at),
				isRoot: false
			});
		}

		result.set(leafUri, chain);
	}

	return result;
}

/**
 * Post-process raw feed rows into enriched BackyardFeedItems with reblog chains.
 */
async function enrichFeedItems(
	rows: any[],
	viewerDid: string | null
): Promise<BackyardFeedItem[]> {
	// Gather all DIDs for profile resolution
	const dids = new Set<string>();
	for (const row of rows) {
		dids.add(row.author_did);
		if (row.reblog_author_did) dids.add(row.reblog_author_did);
	}
	const profiles = await resolveProfiles([...dids]);

	// Collect reblog URIs for chain building
	const reblogUris: string[] = [];
	for (const row of rows) {
		if (row.item_type === 'reblog' && row.reblog_uri) {
			reblogUris.push(row.reblog_uri);
		}
	}
	const chains = await buildReblogChains(reblogUris);

	// Build feed items
	const items: BackyardFeedItem[] = [];
	for (const row of rows) {
		const post = enrichPost(row, profiles);
		const item: BackyardFeedItem = { type: row.item_type, post };

		if (row.item_type === 'reblog' && row.reblog_author_did) {
			item.reblog = {
				uri: row.reblog_uri,
				cid: row.reblog_cid,
				by: profiles.get(row.reblog_author_did) || { did: row.reblog_author_did, handle: row.reblog_author_did },
				text: row.reblog_text || undefined,
				facets: row.reblog_facets || undefined,
				media: row.reblog_media || undefined,
				tags: row.reblog_tags || undefined,
				createdAt: toIso(row.created_at)
			};

			// Attach chain
			const chain = chains.get(row.reblog_uri);
			if (chain && chain.length > 0) {
				item.chain = chain;
			}
		}

		items.push(item);
	}

	return items;
}

export async function getTimeline(
	viewerDid: string,
	limit = 30,
	cursor?: string
): Promise<{ items: BackyardFeedItem[]; cursor: string | null }> {
	const params: any[] = [viewerDid, limit];
	const cursorIdx = cursor ? (params.push(cursor), params.length) : 0;
	const cursorClausePost = cursorIdx ? `AND p.created_at < $${cursorIdx}` : '';
	const cursorClauseReblog = cursorIdx ? `AND r.created_at < $${cursorIdx}` : '';

	// Use a CTE to gather the page of feed items first, then join counts
	// to avoid running correlated subqueries across the entire table.
	const query = `
		WITH followed AS (
			SELECT subject_did FROM follows WHERE author_did = $1
		),
		feed AS (
			SELECT
				'post' as item_type,
				p.uri, p.cid, p.author_did, p.text, p.facets, p.media, p.tags,
				p.created_at, p.indexed_at,
				NULL::text as reblog_uri, NULL::text as reblog_cid,
				NULL::text as reblog_author_did, NULL::text as reblog_text,
				NULL::jsonb as reblog_facets, NULL::jsonb as reblog_media, NULL::text[] as reblog_tags,
				p.uri as post_uri
			FROM posts p
			WHERE (p.author_did = $1 OR p.author_did IN (SELECT subject_did FROM followed))
				${cursorClausePost}

			UNION ALL

			SELECT
				'reblog' as item_type,
				p.uri, p.cid, p.author_did, p.text, p.facets, p.media, p.tags,
				r.created_at, r.indexed_at,
				r.uri as reblog_uri, r.cid as reblog_cid,
				r.author_did as reblog_author_did, r.text as reblog_text,
				r.facets as reblog_facets, r.media as reblog_media, r.tags as reblog_tags,
				p.uri as post_uri
			FROM reblogs r
			JOIN posts p ON p.uri = COALESCE(r.root_post_uri, r.subject_uri)
			WHERE (r.author_did = $1 OR r.author_did IN (SELECT subject_did FROM followed))
				AND NOT (r.author_did = $1 AND p.author_did = $1 AND (r.text IS NULL OR r.text = '') AND (r.tags IS NULL OR array_length(r.tags, 1) IS NULL))
				${cursorClauseReblog}

			ORDER BY created_at DESC
			LIMIT $2
		),
		post_uris AS (
			SELECT DISTINCT post_uri FROM feed
		),
		lc AS (
			SELECT subject_uri, COUNT(*) as cnt FROM likes WHERE subject_uri IN (SELECT post_uri FROM post_uris) GROUP BY subject_uri
		),
		cc AS (
			SELECT root_uri, COUNT(*) as cnt FROM comments WHERE root_uri IN (SELECT post_uri FROM post_uris) GROUP BY root_uri
		),
		rc AS (
			SELECT subject_uri, COUNT(*) as cnt FROM reblogs WHERE subject_uri IN (SELECT post_uri FROM post_uris) GROUP BY subject_uri
		),
		vl AS (
			SELECT subject_uri, uri FROM likes WHERE author_did = $1 AND subject_uri IN (SELECT post_uri FROM post_uris)
		),
		vr AS (
			SELECT subject_uri, uri FROM reblogs WHERE author_did = $1 AND subject_uri IN (SELECT post_uri FROM post_uris)
		)
		SELECT f.*,
			COALESCE(lc.cnt, 0) as like_count,
			COALESCE(cc.cnt, 0) as comment_count,
			COALESCE(rc.cnt, 0) as reblog_count,
			vl.uri as viewer_like,
			vr.uri as viewer_reblog
		FROM feed f
		LEFT JOIN lc ON lc.subject_uri = f.post_uri
		LEFT JOIN cc ON cc.root_uri = f.post_uri
		LEFT JOIN rc ON rc.subject_uri = f.post_uri
		LEFT JOIN vl ON vl.subject_uri = f.post_uri
		LEFT JOIN vr ON vr.subject_uri = f.post_uri
		ORDER BY f.created_at DESC
	`;

	const result = await pool.query(query, params);
	const items = await enrichFeedItems(result.rows, viewerDid);

	const nextCursor =
		result.rows.length >= limit
			? toIso(result.rows[result.rows.length - 1].created_at)
			: null;

	return { items, cursor: nextCursor };
}

export async function getAuthorFeed(
	authorDid: string,
	viewerDid: string | null,
	limit = 30,
	cursor?: string
): Promise<{ items: BackyardFeedItem[]; cursor: string | null }> {
	const vd = viewerDid || authorDid;

	// Build parameter list: $1 = authorDid, $2 = limit, $3 = viewerDid
	// $4 = cursor (only if present)
	const params: any[] = [authorDid, limit, vd];
	const cursorIdx = cursor ? (params.push(cursor), params.length) : 0;
	const cursorClausePost = cursorIdx ? `AND p.created_at < $${cursorIdx}` : '';
	const cursorClauseReblog = cursorIdx ? `AND r.created_at < $${cursorIdx}` : '';

	const query = `
		WITH feed AS (
			SELECT
				'post' as item_type,
				p.uri, p.cid, p.author_did, p.text, p.facets, p.media, p.tags,
				p.created_at, p.indexed_at,
				NULL::text as reblog_uri, NULL::text as reblog_cid,
				NULL::text as reblog_author_did, NULL::text as reblog_text,
				NULL::jsonb as reblog_facets, NULL::jsonb as reblog_media, NULL::text[] as reblog_tags,
				p.uri as post_uri
			FROM posts p
			WHERE p.author_did = $1
				${cursorClausePost}

			UNION ALL

			SELECT
				'reblog' as item_type,
				p.uri, p.cid, p.author_did, p.text, p.facets, p.media, p.tags,
				r.created_at, r.indexed_at,
				r.uri as reblog_uri, r.cid as reblog_cid,
				r.author_did as reblog_author_did, r.text as reblog_text,
				r.facets as reblog_facets, r.media as reblog_media, r.tags as reblog_tags,
				p.uri as post_uri
			FROM reblogs r
			JOIN posts p ON p.uri = COALESCE(r.root_post_uri, r.subject_uri)
			WHERE r.author_did = $1
				${cursorClauseReblog}

			ORDER BY created_at DESC
			LIMIT $2
		),
		post_uris AS (
			SELECT DISTINCT post_uri FROM feed
		),
		lc AS (
			SELECT subject_uri, COUNT(*) as cnt FROM likes WHERE subject_uri IN (SELECT post_uri FROM post_uris) GROUP BY subject_uri
		),
		cc AS (
			SELECT root_uri, COUNT(*) as cnt FROM comments WHERE root_uri IN (SELECT post_uri FROM post_uris) GROUP BY root_uri
		),
		rc AS (
			SELECT subject_uri, COUNT(*) as cnt FROM reblogs WHERE subject_uri IN (SELECT post_uri FROM post_uris) GROUP BY subject_uri
		),
		vl AS (
			SELECT subject_uri, uri FROM likes WHERE author_did = $3 AND subject_uri IN (SELECT post_uri FROM post_uris)
		),
		vr AS (
			SELECT subject_uri, uri FROM reblogs WHERE author_did = $3 AND subject_uri IN (SELECT post_uri FROM post_uris)
		)
		SELECT f.*,
			COALESCE(lc.cnt, 0) as like_count,
			COALESCE(cc.cnt, 0) as comment_count,
			COALESCE(rc.cnt, 0) as reblog_count,
			vl.uri as viewer_like,
			vr.uri as viewer_reblog
		FROM feed f
		LEFT JOIN lc ON lc.subject_uri = f.post_uri
		LEFT JOIN cc ON cc.root_uri = f.post_uri
		LEFT JOIN rc ON rc.subject_uri = f.post_uri
		LEFT JOIN vl ON vl.subject_uri = f.post_uri
		LEFT JOIN vr ON vr.subject_uri = f.post_uri
		ORDER BY f.created_at DESC
	`;

	const result = await pool.query(query, params);
	const items = await enrichFeedItems(result.rows, viewerDid);

	const nextCursor =
		result.rows.length >= limit
			? toIso(result.rows[result.rows.length - 1].created_at)
			: null;

	return { items, cursor: nextCursor };
}

export async function getPost(
	uri: string,
	viewerDid: string | null
): Promise<BackyardPost | null> {
	const vd = viewerDid || '';
	const result = await pool.query(
		`SELECT p.*,
			COALESCE(lc.cnt, 0) as like_count,
			COALESCE(cc.cnt, 0) as comment_count,
			COALESCE(rc.cnt, 0) as reblog_count,
			vl.uri as viewer_like,
			vr.uri as viewer_reblog
		 FROM posts p
		 LEFT JOIN (SELECT subject_uri, COUNT(*) as cnt FROM likes WHERE subject_uri = $1 GROUP BY subject_uri) lc ON lc.subject_uri = p.uri
		 LEFT JOIN (SELECT root_uri, COUNT(*) as cnt FROM comments WHERE root_uri = $1 GROUP BY root_uri) cc ON cc.root_uri = p.uri
		 LEFT JOIN (SELECT subject_uri, COUNT(*) as cnt FROM reblogs WHERE subject_uri = $1 GROUP BY subject_uri) rc ON rc.subject_uri = p.uri
		 LEFT JOIN (SELECT subject_uri, uri FROM likes WHERE author_did = $2 AND subject_uri = $1) vl ON vl.subject_uri = p.uri
		 LEFT JOIN (SELECT subject_uri, uri FROM reblogs WHERE author_did = $2 AND subject_uri = $1) vr ON vr.subject_uri = p.uri
		 WHERE p.uri = $1`,
		[uri, vd]
	);

	if (result.rows.length === 0) return null;

	const row = result.rows[0];
	const profiles = await resolveProfiles([row.author_did]);
	return enrichPost(row, profiles);
}

export async function getComments(
	postUri: string,
	limit = 50
): Promise<BackyardComment[]> {
	const result = await pool.query(
		`SELECT c.* FROM comments c
		 WHERE c.subject_uri = $1 OR c.root_uri = $1
		 ORDER BY c.created_at ASC
		 LIMIT $2`,
		[postUri, limit]
	);

	const dids = result.rows.map((r) => r.author_did);
	const profiles = await resolveProfiles(dids);

	return result.rows.map((row) => ({
		uri: row.uri,
		cid: row.cid,
		author: profiles.get(row.author_did) || { did: row.author_did, handle: row.author_did },
		text: row.text,
		facets: row.facets || undefined,
		subjectUri: row.subject_uri,
		rootUri: row.root_uri,
		parentUri: row.parent_uri || undefined,
		createdAt:
			row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
	}));
}

export async function getFollowing(
	authorDid: string,
	limit = 50,
	cursor?: string
): Promise<{ follows: BackyardProfile[]; cursor: string | null }> {
	const cursorClause = cursor ? `AND f.created_at < $3` : '';
	const params: any[] = [authorDid, limit];
	if (cursor) params.push(cursor);

	const result = await pool.query(
		`SELECT f.subject_did, f.created_at FROM follows f
		 WHERE f.author_did = $1 ${cursorClause}
		 ORDER BY f.created_at DESC
		 LIMIT $2`,
		params
	);

	const dids = result.rows.map((r) => r.subject_did);
	const profiles = await resolveProfiles(dids);

	const follows = result.rows.map(
		(r) => profiles.get(r.subject_did) || { did: r.subject_did, handle: r.subject_did }
	);

	const nextCursor =
		result.rows.length >= limit
			? (result.rows[result.rows.length - 1].created_at instanceof Date
					? result.rows[result.rows.length - 1].created_at.toISOString()
					: result.rows[result.rows.length - 1].created_at)
			: null;

	return { follows, cursor: nextCursor };
}

export async function isFollowing(authorDid: string, subjectDid: string): Promise<string | null> {
	const result = await pool.query(
		'SELECT uri FROM follows WHERE author_did = $1 AND subject_did = $2 LIMIT 1',
		[authorDid, subjectDid]
	);
	return result.rows.length > 0 ? result.rows[0].uri : null;
}

export async function getProfileStats(
	did: string
): Promise<{ postsCount: number; followingCount: number }> {
	const [posts, following] = await Promise.all([
		pool.query('SELECT COUNT(*) FROM posts WHERE author_did = $1', [did]),
		pool.query('SELECT COUNT(*) FROM follows WHERE author_did = $1', [did])
	]);

	return {
		postsCount: parseInt(posts.rows[0].count, 10) || 0,
		followingCount: parseInt(following.rows[0].count, 10) || 0
	};
}

/**
 * Get posts (and reblogs) that carry a given tag, globally.
 * Returns feed items (posts + reblogs) sorted chronologically, most recent first.
 */
export async function getPostsByTag(
	tag: string,
	viewerDid: string | null,
	limit = 30,
	cursor?: string
): Promise<{ items: BackyardFeedItem[]; cursor: string | null }> {
	const vd = viewerDid || '';
	const params: any[] = [tag, limit, vd];
	const cursorIdx = cursor ? (params.push(cursor), params.length) : 0;
	const cursorClausePost = cursorIdx ? `AND p.created_at < $${cursorIdx}` : '';
	const cursorClauseReblog = cursorIdx ? `AND r.created_at < $${cursorIdx}` : '';

	const query = `
		WITH feed AS (
			SELECT
				'post' as item_type,
				p.uri, p.cid, p.author_did, p.text, p.facets, p.media, p.tags,
				p.created_at, p.indexed_at,
				NULL::text as reblog_uri, NULL::text as reblog_cid,
				NULL::text as reblog_author_did, NULL::text as reblog_text,
				NULL::jsonb as reblog_facets, NULL::jsonb as reblog_media, NULL::text[] as reblog_tags,
				p.uri as post_uri
			FROM posts p
			WHERE $1 = ANY(p.tags)
				${cursorClausePost}

			UNION ALL

			SELECT
				'reblog' as item_type,
				p.uri, p.cid, p.author_did, p.text, p.facets, p.media, p.tags,
				r.created_at, r.indexed_at,
				r.uri as reblog_uri, r.cid as reblog_cid,
				r.author_did as reblog_author_did, r.text as reblog_text,
				r.facets as reblog_facets, r.media as reblog_media, r.tags as reblog_tags,
				p.uri as post_uri
			FROM reblogs r
			JOIN posts p ON p.uri = COALESCE(r.root_post_uri, r.subject_uri)
			WHERE $1 = ANY(r.tags)
				${cursorClauseReblog}

			ORDER BY created_at DESC
			LIMIT $2
		),
		post_uris AS (
			SELECT DISTINCT post_uri FROM feed
		),
		lc AS (
			SELECT subject_uri, COUNT(*) as cnt FROM likes WHERE subject_uri IN (SELECT post_uri FROM post_uris) GROUP BY subject_uri
		),
		cc AS (
			SELECT root_uri, COUNT(*) as cnt FROM comments WHERE root_uri IN (SELECT post_uri FROM post_uris) GROUP BY root_uri
		),
		rc AS (
			SELECT subject_uri, COUNT(*) as cnt FROM reblogs WHERE subject_uri IN (SELECT post_uri FROM post_uris) GROUP BY subject_uri
		),
		vl AS (
			SELECT subject_uri, uri FROM likes WHERE author_did = $3 AND subject_uri IN (SELECT post_uri FROM post_uris)
		),
		vr AS (
			SELECT subject_uri, uri FROM reblogs WHERE author_did = $3 AND subject_uri IN (SELECT post_uri FROM post_uris)
		)
		SELECT f.*,
			COALESCE(lc.cnt, 0) as like_count,
			COALESCE(cc.cnt, 0) as comment_count,
			COALESCE(rc.cnt, 0) as reblog_count,
			vl.uri as viewer_like,
			vr.uri as viewer_reblog
		FROM feed f
		LEFT JOIN lc ON lc.subject_uri = f.post_uri
		LEFT JOIN cc ON cc.root_uri = f.post_uri
		LEFT JOIN rc ON rc.subject_uri = f.post_uri
		LEFT JOIN vl ON vl.subject_uri = f.post_uri
		LEFT JOIN vr ON vr.subject_uri = f.post_uri
		ORDER BY f.created_at DESC
	`;

	const result = await pool.query(query, params);
	const items = await enrichFeedItems(result.rows, viewerDid);

	const nextCursor =
		result.rows.length >= limit
			? toIso(result.rows[result.rows.length - 1].created_at)
			: null;

	return { items, cursor: nextCursor };
}

/**
 * Get posts (and reblogs) from a specific author that carry a given tag.
 */
export async function getPostsByTagAndAuthor(
	tag: string,
	authorDid: string,
	viewerDid: string | null,
	limit = 30,
	cursor?: string
): Promise<{ items: BackyardFeedItem[]; cursor: string | null }> {
	const vd = viewerDid || '';
	const params: any[] = [tag, authorDid, limit, vd];
	const cursorIdx = cursor ? (params.push(cursor), params.length) : 0;
	const cursorClausePost = cursorIdx ? `AND p.created_at < $${cursorIdx}` : '';
	const cursorClauseReblog = cursorIdx ? `AND r.created_at < $${cursorIdx}` : '';

	const query = `
		WITH feed AS (
			SELECT
				'post' as item_type,
				p.uri, p.cid, p.author_did, p.text, p.facets, p.media, p.tags,
				p.created_at, p.indexed_at,
				NULL::text as reblog_uri, NULL::text as reblog_cid,
				NULL::text as reblog_author_did, NULL::text as reblog_text,
				NULL::jsonb as reblog_facets, NULL::jsonb as reblog_media, NULL::text[] as reblog_tags,
				p.uri as post_uri
			FROM posts p
			WHERE $1 = ANY(p.tags) AND p.author_did = $2
				${cursorClausePost}

			UNION ALL

			SELECT
				'reblog' as item_type,
				p.uri, p.cid, p.author_did, p.text, p.facets, p.media, p.tags,
				r.created_at, r.indexed_at,
				r.uri as reblog_uri, r.cid as reblog_cid,
				r.author_did as reblog_author_did, r.text as reblog_text,
				r.facets as reblog_facets, r.media as reblog_media, r.tags as reblog_tags,
				p.uri as post_uri
			FROM reblogs r
			JOIN posts p ON p.uri = COALESCE(r.root_post_uri, r.subject_uri)
			WHERE $1 = ANY(r.tags) AND r.author_did = $2
				${cursorClauseReblog}

			ORDER BY created_at DESC
			LIMIT $3
		),
		post_uris AS (
			SELECT DISTINCT post_uri FROM feed
		),
		lc AS (
			SELECT subject_uri, COUNT(*) as cnt FROM likes WHERE subject_uri IN (SELECT post_uri FROM post_uris) GROUP BY subject_uri
		),
		cc AS (
			SELECT root_uri, COUNT(*) as cnt FROM comments WHERE root_uri IN (SELECT post_uri FROM post_uris) GROUP BY root_uri
		),
		rc AS (
			SELECT subject_uri, COUNT(*) as cnt FROM reblogs WHERE subject_uri IN (SELECT post_uri FROM post_uris) GROUP BY subject_uri
		),
		vl AS (
			SELECT subject_uri, uri FROM likes WHERE author_did = $4 AND subject_uri IN (SELECT post_uri FROM post_uris)
		),
		vr AS (
			SELECT subject_uri, uri FROM reblogs WHERE author_did = $4 AND subject_uri IN (SELECT post_uri FROM post_uris)
		)
		SELECT f.*,
			COALESCE(lc.cnt, 0) as like_count,
			COALESCE(cc.cnt, 0) as comment_count,
			COALESCE(rc.cnt, 0) as reblog_count,
			vl.uri as viewer_like,
			vr.uri as viewer_reblog
		FROM feed f
		LEFT JOIN lc ON lc.subject_uri = f.post_uri
		LEFT JOIN cc ON cc.root_uri = f.post_uri
		LEFT JOIN rc ON rc.subject_uri = f.post_uri
		LEFT JOIN vl ON vl.subject_uri = f.post_uri
		LEFT JOIN vr ON vr.subject_uri = f.post_uri
		ORDER BY f.created_at DESC
	`;

	const result = await pool.query(query, params);
	const items = await enrichFeedItems(result.rows, viewerDid);

	const nextCursor =
		result.rows.length >= limit
			? toIso(result.rows[result.rows.length - 1].created_at)
			: null;

	return { items, cursor: nextCursor };
}

/**
 * Search for distinct tags matching a substring. Returns tags with post counts.
 */
export async function searchTags(
	query: string,
	limit = 30
): Promise<{ tag: string; count: number }[]> {
	const result = await pool.query(
		`SELECT tag, COUNT(*) as cnt
		 FROM (
			SELECT unnest(tags) as tag FROM posts WHERE tags IS NOT NULL
			UNION ALL
			SELECT unnest(tags) as tag FROM reblogs WHERE tags IS NOT NULL
		 ) t
		 WHERE tag ILIKE $1
		 GROUP BY tag
		 ORDER BY cnt DESC, tag ASC
		 LIMIT $2`,
		[`%${query}%`, limit]
	);

	return result.rows.map((r) => ({
		tag: r.tag,
		count: parseInt(r.cnt, 10) || 0
	}));
}

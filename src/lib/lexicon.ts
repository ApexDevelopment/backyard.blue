/**
 * Backyard AT Protocol Lexicon NSIDs.
 * These identify the record collections stored in user repos.
 */
export const NSID = {
	/** User profile (single record per repo, rkey="self") */
	PROFILE: 'blue.backyard.actor.profile',
	/** Original post in the user's feed */
	POST: 'blue.backyard.feed.post',
	/** Comment on a post or reblog (Tumblr "note") */
	COMMENT: 'blue.backyard.feed.comment',
	/** Reblog of a post with optional additions (Tumblr "reblog") */
	REBLOG: 'blue.backyard.feed.reblog',
	/** Like of a post, reblog, or comment */
	LIKE: 'blue.backyard.feed.like',
	/** Social follow relationship */
	FOLLOW: 'blue.backyard.graph.follow',
	/** Block relationship */
	BLOCK: 'blue.backyard.graph.block'
} as const;

/** All collection NSIDs as a set for quick membership checks */
export const ALL_NSIDS = new Set(Object.values(NSID));

/** Build the OAuth scope string requesting access to all Backyard collections */
export const OAUTH_SCOPE = [
	'atproto',
	...Object.values(NSID).map((nsid) => `repo:${nsid}`),
	'blob:*/*'
].join(' ');

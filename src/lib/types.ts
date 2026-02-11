/**
 * Backyard type definitions.
 * These represent the shapes used throughout the app — NOT 1:1 with AT Protocol records,
 * but enriched with aggregated counts and viewer state from our local index.
 */

export interface BackyardProfile {
	did: string;
	handle: string;
	displayName?: string;
	pronouns?: string;
	description?: string;
	avatar?: string;
	banner?: string;
	pdsUrl?: string;
}

export interface BackyardMedia {
	url: string;
	mimeType: string;
	alt?: string;
	width?: number;
	height?: number;
}

export interface BackyardPost {
	uri: string;
	cid: string;
	author: BackyardProfile;
	text: string;
	facets?: any[];
	media?: BackyardMedia[];
	tags?: string[];
	likeCount: number;
	commentCount: number;
	reblogCount: number;
	/** AT URI of the viewer's like record, if they liked this post */
	viewerLike?: string;
	/** AT URI of the viewer's reblog record, if they reblogged this post */
	viewerReblog?: string;
	createdAt: string;
	indexedAt: string;
}

export interface BackyardComment {
	uri: string;
	cid: string;
	author: BackyardProfile;
	text: string;
	facets?: any[];
	subjectUri: string;
	rootUri: string;
	parentUri?: string;
	createdAt: string;
}

export interface BackyardReblogInfo {
	uri: string;
	cid: string;
	by: BackyardProfile;
	text?: string;
	facets?: any[];
	media?: BackyardMedia[];
	tags?: string[];
	createdAt: string;
}

/**
 * A single entry in a reblog chain, displayed top-down (original post first,
 * each subsequent addition below). Entries without text or media are "silent reblogs."
 */
export interface BackyardChainEntry {
	uri: string;
	cid: string;
	author: BackyardProfile;
	text: string;
	facets?: any[];
	media?: BackyardMedia[];
	tags?: string[];
	createdAt: string;
	/** Whether this entry is the original post (true) or a reblog addition (false) */
	isRoot: boolean;
	/** True when the original record has been deleted — renders as a tombstone */
	deleted?: boolean;
}

export interface BackyardFeedItem {
	type: 'post' | 'reblog';
	post: BackyardPost;
	/** Present when type === 'reblog' — info about who reblogged and any additions */
	reblog?: BackyardReblogInfo;
	/**
	 * Reblog chain: original post + all additions. Present when type === 'reblog'.
	 * Ordered chronologically (original post first, latest addition last).
	 */
	chain?: BackyardChainEntry[];
}

export interface BackyardFollowInfo {
	did: string;
	handle: string;
	displayName?: string;
	avatar?: string;
	followUri?: string;
}

export type NotificationType = 'like' | 'comment' | 'reblog' | 'follow';

export interface BackyardNotification {
	id: number;
	actor: BackyardProfile;
	type: NotificationType;
	/** The post/comment that was interacted with (absent for follows) */
	subjectUri?: string;
	/** The AT URI of the like/comment/reblog/follow record */
	actionUri: string;
	read: boolean;
	/** Short text preview of the subject post, when available */
	subjectPreview?: string;
	createdAt: string;
}

export type Theme = 'light' | 'dark';

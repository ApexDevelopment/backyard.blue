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
	/** Whether this account's media should be rendered (trust score >= threshold or admin-approved) */
	mediaTrusted?: boolean;
}

export interface BackyardMedia {
	url: string;
	mimeType: string;
	alt?: string;
	width?: number;
	height?: number;
}

export interface Facet {
	index: { byteStart: number; byteEnd: number };
	features: Array<{ $type: string; uri?: string; did?: string }>;
}

/* ── Content blocks ───────────────────────────────────── */

export interface ContentTextBlock {
	type: 'text';
	text: string;
	facets?: Facet[];
}

export interface ContentImageBlock {
	type: 'image';
	image: BackyardMedia;
}

export interface ContentEmbedBlock {
	type: 'embed';
	url: string;
}

export type ContentBlock = ContentTextBlock | ContentImageBlock | ContentEmbedBlock;

/* ── Posts and feed items ─────────────────────────────── */

export interface BackyardPost {
	uri: string;
	cid: string;
	author: BackyardProfile;
	content: ContentBlock[];
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
	facets?: Facet[];
	subjectUri: string;
	rootUri: string;
	parentUri?: string;
	createdAt: string;
}

export interface BackyardReblogInfo {
	uri: string;
	cid: string;
	by: BackyardProfile;
	content?: ContentBlock[];
	tags?: string[];
	createdAt: string;
}

/**
 * A single entry in a reblog chain, displayed top-down (original post first,
 * each subsequent addition below). Entries without content are "silent reblogs."
 */
export interface BackyardChainEntry {
	uri: string;
	cid: string;
	author: BackyardProfile;
	content: ContentBlock[];
	tags?: string[];
	createdAt: string;
	/** Whether this entry is the original post (true) or a reblog addition (false) */
	isRoot: boolean;
	/** True when the original record has been deleted — renders as a tombstone */
	deleted?: boolean;
	/** True when the entry's author has been blocked by the viewer — renders as a tombstone */
	blocked?: boolean;
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

export interface BackyardReblogPreview {
	reblogUri: string;
	reblogger: BackyardProfile;
	source: BackyardProfile;
	createdAt: string;
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

export type ThemeMode = 'light' | 'dark';
export type ColorScheme = 'chocoberry' | 'potpourri' | 'atmosphere' | 'gruvbox' | 'rosepine';
export type Theme = `${ColorScheme}-${ThemeMode}`;

/**
 * A preview of a site.standard.document record, used for the news panel.
 * Not a full representation — just the fields needed for display.
 */
export interface NewsDocument {
	/** AT URI of the document record */
	uri: string;
	title: string;
	description?: string;
	/** Canonical URL constructed from site + path */
	url?: string;
	publishedAt: string;
}

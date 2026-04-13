import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/server/db.js', () => ({ default: { query: vi.fn() } }));
vi.mock('../../src/lib/server/identity.js', () => ({
	mapRowToProfile: vi.fn(),
	ensureProfile: vi.fn(),
	blobUrl: (did: string, cid: string) => `/api/blob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`
}));
vi.mock('../../src/lib/server/validation.js', () => ({
	escapeLike: (s: string) => s.replace(/[%_\\]/g, '\\$&')
}));

import {
	withTimeout,
	resolveContentBlocks,
	enrichPost,
	toIso,
	hasBlockedTag
} from '../../src/lib/server/feed.js';

describe('withTimeout', () => {
	it('resolves when promise completes within timeout', async () => {
		const result = await withTimeout(Promise.resolve(42), 1000);
		expect(result).toBe(42);
	});

	it('rejects when promise exceeds timeout', async () => {
		const slow = new Promise((resolve) => setTimeout(resolve, 5000));
		await expect(withTimeout(slow, 10)).rejects.toThrow('timeout');
	});

	it('propagates the original rejection', async () => {
		const failing = Promise.reject(new Error('original'));
		await expect(withTimeout(failing, 1000)).rejects.toThrow('original');
	});
});

describe('resolveContentBlocks', () => {
	it('returns empty array for null content', () => {
		expect(resolveContentBlocks({ content: null }, 'did:plc:a')).toEqual([]);
	});

	it('returns empty array for non-array content', () => {
		expect(resolveContentBlocks({ content: 'string' }, 'did:plc:a')).toEqual([]);
	});

	it('returns empty array for empty array', () => {
		expect(resolveContentBlocks({ content: [] }, 'did:plc:a')).toEqual([]);
	});

	it('resolves text blocks', () => {
		const row = {
			content: [{ $type: 'blue.backyard.feed.post#textBlock', text: 'hello', facets: [] }]
		};
		const result = resolveContentBlocks(row, 'did:plc:a');
		expect(result).toEqual([{ type: 'text', text: 'hello', facets: [] }]);
	});

	it('resolves shorthand text blocks', () => {
		const row = { content: [{ type: 'text', text: 'world' }] };
		const result = resolveContentBlocks(row, 'did:plc:a');
		expect(result).toEqual([{ type: 'text', text: 'world', facets: undefined }]);
	});

	it('resolves image blocks with blob ref', () => {
		const row = {
			content: [{
				$type: 'blue.backyard.feed.post#imageBlock',
				blob: { ref: { $link: 'bafycid123' } },
				mimeType: 'image/png',
				alt: 'A cat'
			}]
		};
		const result = resolveContentBlocks(row, 'did:plc:author');
		expect(result).toHaveLength(1);
		expect(result[0].type).toBe('image');
		const img = (result[0] as any).image;
		expect(img.url).toContain('bafycid123');
		expect(img.mimeType).toBe('image/png');
		expect(img.alt).toBe('A cat');
	});

	it('resolves embed blocks', () => {
		const row = {
			content: [{ $type: 'blue.backyard.feed.post#embedBlock', url: 'https://example.com' }]
		};
		const result = resolveContentBlocks(row, 'did:plc:a');
		expect(result).toEqual([{ type: 'embed', url: 'https://example.com' }]);
	});

	it('skips unknown block types', () => {
		const row = {
			content: [
				{ $type: 'blue.backyard.feed.post#textBlock', text: 'keep' },
				{ $type: 'unknown.type' }
			]
		};
		const result = resolveContentBlocks(row, 'did:plc:a');
		expect(result).toHaveLength(1);
	});
});

describe('enrichPost', () => {
	it('maps row fields to BackyardPost', () => {
		const profiles = new Map([
			['did:plc:author', { did: 'did:plc:author', handle: 'alice' }]
		]);
		const row = {
			uri: 'at://did:plc:author/blue.backyard.feed.post/abc',
			cid: 'bafycid',
			author_did: 'did:plc:author',
			content: [],
			tags: ['art'],
			like_count: '5',
			comment_count: '2',
			reblog_count: '1',
			viewer_like: null,
			viewer_reblog: null,
			created_at: new Date('2024-01-01T00:00:00Z'),
			indexed_at: new Date('2024-01-01T00:00:01Z')
		};
		const post = enrichPost(row, profiles as any);
		expect(post.uri).toBe(row.uri);
		expect(post.author.handle).toBe('alice');
		expect(post.likeCount).toBe(5);
		expect(post.commentCount).toBe(2);
		expect(post.reblogCount).toBe(1);
		expect(post.tags).toEqual(['art']);
		expect(post.createdAt).toBe('2024-01-01T00:00:00.000Z');
	});

	it('falls back to DID when profile not in map', () => {
		const profiles = new Map();
		const row = {
			uri: 'at://did:plc:x/blue.backyard.feed.post/abc',
			cid: 'bafycid',
			author_did: 'did:plc:x',
			content: [],
			tags: null,
			like_count: '0',
			comment_count: '0',
			reblog_count: '0',
			viewer_like: undefined,
			viewer_reblog: undefined,
			created_at: '2024-01-01T00:00:00.000Z',
			indexed_at: null
		};
		const post = enrichPost(row, profiles);
		expect(post.author.did).toBe('did:plc:x');
		expect(post.author.handle).toBe('did:plc:x');
	});

	it('parses string counts that are NaN as 0', () => {
		const profiles = new Map();
		const row = {
			uri: 'at://did:plc:x/post/a',
			cid: 'cid',
			author_did: 'did:plc:x',
			content: [],
			tags: null,
			like_count: 'not-a-number',
			comment_count: undefined,
			reblog_count: null,
			created_at: '2024-01-01T00:00:00Z'
		};
		const post = enrichPost(row, profiles);
		expect(post.likeCount).toBe(0);
		expect(post.commentCount).toBe(0);
		expect(post.reblogCount).toBe(0);
	});
});

describe('toIso', () => {
	it('converts Date object to ISO string', () => {
		expect(toIso(new Date('2024-06-15T12:00:00Z'))).toBe('2024-06-15T12:00:00.000Z');
	});

	it('returns string value as-is', () => {
		expect(toIso('2024-06-15T12:00:00.000Z')).toBe('2024-06-15T12:00:00.000Z');
	});
});

describe('hasBlockedTag', () => {
	it('returns false for null tags', () => {
		expect(hasBlockedTag(null, new Set(['blocked']))).toBe(false);
	});

	it('returns false for empty tags', () => {
		expect(hasBlockedTag([], new Set(['blocked']))).toBe(false);
	});

	it('returns false for empty blocked set', () => {
		expect(hasBlockedTag(['art', 'music'], new Set())).toBe(false);
	});

	it('returns true when a tag matches (case-insensitive)', () => {
		expect(hasBlockedTag(['ART', 'music'], new Set(['art']))).toBe(true);
	});

	it('returns false when no tags match', () => {
		expect(hasBlockedTag(['photography', 'nature'], new Set(['politics']))).toBe(false);
	});
});

import { describe, it, expect } from 'vitest';
import { NSID, ALL_NSIDS, OAUTH_SCOPE } from '../../src/lib/lexicon.js';

describe('NSID', () => {
	it('contains all expected collection identifiers', () => {
		expect(NSID.PROFILE).toBe('blue.backyard.actor.profile');
		expect(NSID.POST).toBe('blue.backyard.feed.post');
		expect(NSID.COMMENT).toBe('blue.backyard.feed.comment');
		expect(NSID.REBLOG).toBe('blue.backyard.feed.reblog');
		expect(NSID.LIKE).toBe('blue.backyard.feed.like');
		expect(NSID.FOLLOW).toBe('blue.backyard.graph.follow');
		expect(NSID.BLOCK).toBe('blue.backyard.graph.block');
	});

	it('all NSIDs use the blue.backyard namespace', () => {
		for (const nsid of Object.values(NSID)) {
			expect(nsid).toMatch(/^blue\.backyard\./);
		}
	});
});

describe('ALL_NSIDS', () => {
	it('contains every NSID from the NSID object', () => {
		for (const nsid of Object.values(NSID)) {
			expect(ALL_NSIDS.has(nsid)).toBe(true);
		}
	});

	it('has the same size as the NSID values', () => {
		expect(ALL_NSIDS.size).toBe(Object.values(NSID).length);
	});
});

describe('OAUTH_SCOPE', () => {
	it('starts with atproto', () => {
		expect(OAUTH_SCOPE.startsWith('atproto')).toBe(true);
	});

	it('includes a repo: scope for every NSID', () => {
		for (const nsid of Object.values(NSID)) {
			expect(OAUTH_SCOPE).toContain(`repo:${nsid}`);
		}
	});

	it('includes blob scope', () => {
		expect(OAUTH_SCOPE).toContain('blob:*/*');
	});

	it('is space-delimited', () => {
		const parts = OAUTH_SCOPE.split(' ');
		expect(parts.length).toBe(1 + Object.values(NSID).length + 1); // atproto + repos + blob
	});
});

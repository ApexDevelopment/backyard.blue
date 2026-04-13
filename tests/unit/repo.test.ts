import { describe, it, expect } from 'vitest';
import { parseAtUri } from '../../src/lib/server/repo.js';

describe('parseAtUri', () => {
	it('parses a standard AT URI', () => {
		const result = parseAtUri('at://did:plc:abc123/blue.backyard.feed.post/3abc');
		expect(result).toEqual({
			repo: 'did:plc:abc123',
			collection: 'blue.backyard.feed.post',
			rkey: '3abc'
		});
	});

	it('parses did:web authority', () => {
		const result = parseAtUri('at://did:web:example.com/blue.backyard.graph.follow/xyz');
		expect(result).toEqual({
			repo: 'did:web:example.com',
			collection: 'blue.backyard.graph.follow',
			rkey: 'xyz'
		});
	});

	it('handles rkey with special characters', () => {
		const result = parseAtUri('at://did:plc:abc/blue.backyard.feed.post/3k~test_key');
		expect(result.rkey).toBe('3k~test_key');
	});
});

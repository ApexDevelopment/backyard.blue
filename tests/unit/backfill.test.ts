import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/lib/server/db.js', () => ({ default: { query: vi.fn() } }));
vi.mock('../../src/lib/server/identity.js', () => ({
	ensureProfile: vi.fn(),
	resolveDidDocument: vi.fn(),
	getPdsUrl: vi.fn()
}));

import { parseRainbowUrls } from '../../src/lib/server/backfill.js';

describe('parseRainbowUrls', () => {
	const originalEnv = process.env.RAINBOW_URLS;

	beforeEach(() => {
		delete process.env.RAINBOW_URLS;
	});

	afterEach(() => {
		if (originalEnv !== undefined) {
			process.env.RAINBOW_URLS = originalEnv;
		} else {
			delete process.env.RAINBOW_URLS;
		}
	});

	it('returns default when RAINBOW_URLS is unset', () => {
		expect(parseRainbowUrls()).toEqual(['https://bsky.network']);
	});

	it('returns default when RAINBOW_URLS is empty', () => {
		process.env.RAINBOW_URLS = '';
		expect(parseRainbowUrls()).toEqual(['https://bsky.network']);
	});

	it('parses a single URL', () => {
		process.env.RAINBOW_URLS = 'https://custom.example.com';
		expect(parseRainbowUrls()).toEqual(['https://custom.example.com']);
	});

	it('parses comma-separated URLs', () => {
		process.env.RAINBOW_URLS = 'https://a.example.com,https://b.example.com,https://c.example.com';
		expect(parseRainbowUrls()).toEqual([
			'https://a.example.com',
			'https://b.example.com',
			'https://c.example.com'
		]);
	});

	it('trims whitespace around URLs', () => {
		process.env.RAINBOW_URLS = '  https://a.example.com , https://b.example.com  ';
		expect(parseRainbowUrls()).toEqual([
			'https://a.example.com',
			'https://b.example.com'
		]);
	});

	it('ignores empty segments from trailing commas', () => {
		process.env.RAINBOW_URLS = 'https://a.example.com,,https://b.example.com,';
		expect(parseRainbowUrls()).toEqual([
			'https://a.example.com',
			'https://b.example.com'
		]);
	});
});

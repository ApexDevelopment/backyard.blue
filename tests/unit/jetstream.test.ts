import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: {}
}));
vi.mock('../../src/lib/server/db.js', () => ({ default: { query: vi.fn() } }));
vi.mock('../../src/lib/server/identity.js', () => ({
	ensureProfile: vi.fn()
}));
vi.mock('../../src/lib/server/notifications.js', () => ({
	createNotification: vi.fn(),
	notifySubjectAuthor: vi.fn()
}));

import { env } from '$env/dynamic/private';
import { parseJetstreamUrls } from '../../src/lib/server/jetstream.js';

describe('parseJetstreamUrls', () => {
	beforeEach(() => {
		(env as any).JETSTREAM_URLS = undefined;
	});

	it('returns defaults when JETSTREAM_URLS is unset', () => {
		const urls = parseJetstreamUrls();
		expect(urls).toHaveLength(4);
		expect(urls[0]).toBe('wss://jetstream1.us-east.bsky.network/subscribe');
		expect(urls[1]).toBe('wss://jetstream2.us-east.bsky.network/subscribe');
		expect(urls[2]).toBe('wss://jetstream1.us-west.bsky.network/subscribe');
		expect(urls[3]).toBe('wss://jetstream2.us-west.bsky.network/subscribe');
	});

	it('returns defaults when JETSTREAM_URLS is empty', () => {
		(env as any).JETSTREAM_URLS = '';
		expect(parseJetstreamUrls()).toHaveLength(4);
	});

	it('parses a single URL', () => {
		(env as any).JETSTREAM_URLS = 'wss://custom.example.com/subscribe';
		expect(parseJetstreamUrls()).toEqual(['wss://custom.example.com/subscribe']);
	});

	it('parses comma-separated URLs', () => {
		(env as any).JETSTREAM_URLS = 'wss://a.example.com/sub,wss://b.example.com/sub';
		expect(parseJetstreamUrls()).toEqual([
			'wss://a.example.com/sub',
			'wss://b.example.com/sub'
		]);
	});

	it('trims whitespace around URLs', () => {
		(env as any).JETSTREAM_URLS = '  wss://a.example.com/sub , wss://b.example.com/sub  ';
		expect(parseJetstreamUrls()).toEqual([
			'wss://a.example.com/sub',
			'wss://b.example.com/sub'
		]);
	});

	it('ignores empty segments from trailing commas', () => {
		(env as any).JETSTREAM_URLS = 'wss://a.example.com/sub,,wss://b.example.com/sub,';
		expect(parseJetstreamUrls()).toEqual([
			'wss://a.example.com/sub',
			'wss://b.example.com/sub'
		]);
	});
});

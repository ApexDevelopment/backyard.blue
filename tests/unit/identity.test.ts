import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/server/db.js', () => ({ default: { query: vi.fn() } }));
vi.mock('../../src/lib/server/trust.js', () => ({ getTrustStatus: vi.fn() }));

import {
	isValidPublicDomain,
	getPdsUrl,
	getHandle,
	blobUrl
} from '../../src/lib/server/identity.js';

describe('isValidPublicDomain', () => {
	it('accepts standard domains', () => {
		expect(isValidPublicDomain('example.com')).toBe(true);
		expect(isValidPublicDomain('sub.example.com')).toBe(true);
		expect(isValidPublicDomain('my-site.co.uk')).toBe(true);
	});

	it('rejects empty string', () => {
		expect(isValidPublicDomain('')).toBe(false);
	});

	it('rejects overly long domains', () => {
		expect(isValidPublicDomain('a'.repeat(254) + '.com')).toBe(false);
	});

	it('rejects IPv4 addresses', () => {
		expect(isValidPublicDomain('192.168.1.1')).toBe(false);
		expect(isValidPublicDomain('8.8.8.8')).toBe(false);
	});

	it('rejects bracketed IPv6', () => {
		expect(isValidPublicDomain('[::1]')).toBe(false);
	});

	it('rejects localhost', () => {
		expect(isValidPublicDomain('localhost')).toBe(false);
		expect(isValidPublicDomain('sub.localhost')).toBe(false);
	});

	it('rejects .local suffix', () => {
		expect(isValidPublicDomain('printer.local')).toBe(false);
	});

	it('rejects .internal, .corp, .home', () => {
		expect(isValidPublicDomain('app.internal')).toBe(false);
		expect(isValidPublicDomain('mail.corp')).toBe(false);
		expect(isValidPublicDomain('nas.home')).toBe(false);
	});

	it('rejects single-label domains (no dot)', () => {
		expect(isValidPublicDomain('example')).toBe(false);
	});
});

describe('getPdsUrl', () => {
	it('returns serviceEndpoint for #atproto_pds', () => {
		const didDoc = {
			id: 'did:plc:test',
			service: [
				{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example.com' }
			]
		};
		expect(getPdsUrl(didDoc)).toBe('https://pds.example.com');
	});

	it('matches by type when id differs', () => {
		const didDoc = {
			id: 'did:plc:test',
			service: [
				{ id: '#custom', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds2.example.com' }
			]
		};
		expect(getPdsUrl(didDoc)).toBe('https://pds2.example.com');
	});

	it('returns undefined when no matching service', () => {
		const didDoc = { id: 'did:plc:test', service: [] };
		expect(getPdsUrl(didDoc)).toBeUndefined();
	});

	it('returns undefined when service is missing', () => {
		const didDoc = { id: 'did:plc:test' };
		expect(getPdsUrl(didDoc)).toBeUndefined();
	});
});

describe('getHandle', () => {
	it('extracts handle from alsoKnownAs', () => {
		const didDoc = {
			id: 'did:plc:test',
			alsoKnownAs: ['at://alice.backyard.blue']
		};
		expect(getHandle(didDoc)).toBe('alice.backyard.blue');
	});

	it('returns undefined when no at:// entry', () => {
		const didDoc = {
			id: 'did:plc:test',
			alsoKnownAs: ['https://example.com']
		};
		expect(getHandle(didDoc)).toBeUndefined();
	});

	it('returns undefined when alsoKnownAs is absent', () => {
		const didDoc = { id: 'did:plc:test' };
		expect(getHandle(didDoc)).toBeUndefined();
	});
});

describe('blobUrl', () => {
	it('constructs proxy URL with encoded params', () => {
		const url = blobUrl('did:plc:abc', 'bafyabc123');
		expect(url).toBe('/api/blob?did=did%3Aplc%3Aabc&cid=bafyabc123');
	});

	it('encodes special characters in DID', () => {
		const url = blobUrl('did:web:example.com', 'bafyxyz');
		expect(url).toContain('did%3Aweb%3Aexample.com');
	});
});

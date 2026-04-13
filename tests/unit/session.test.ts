import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: {
		SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long!!',
		INSTANCE_URL: 'http://localhost:3000'
	}
}));

import { getSessionData, setSessionData, clearSession } from '../../src/lib/server/session.js';

function createMockCookies() {
	const store = new Map<string, string>();
	return {
		get(name: string) {
			return store.get(name);
		},
		set(name: string, value: string, _opts?: any) {
			store.set(name, value);
		},
		delete(name: string, _opts?: any) {
			store.delete(name);
		},
		_store: store
	} as any;
}

describe('session encrypt/decrypt round-trip', () => {
	it('stores and retrieves a DID correctly', () => {
		const cookies = createMockCookies();
		setSessionData(cookies, { did: 'did:plc:abc123' });
		const result = getSessionData(cookies);
		expect(result.did).toBe('did:plc:abc123');
	});

	it('stores and retrieves needsOnboarding flag', () => {
		const cookies = createMockCookies();
		setSessionData(cookies, { did: 'did:plc:xyz', needsOnboarding: true });
		const result = getSessionData(cookies);
		expect(result.needsOnboarding).toBe(true);
	});

	it('returns empty object for missing cookie', () => {
		const cookies = createMockCookies();
		expect(getSessionData(cookies)).toEqual({});
	});

	it('returns empty object for corrupted cookie', () => {
		const cookies = createMockCookies();
		cookies.set('backyard_session', 'garbage-data');
		expect(getSessionData(cookies)).toEqual({});
	});

	it('clearSession removes the cookie', () => {
		const cookies = createMockCookies();
		setSessionData(cookies, { did: 'did:plc:abc' });
		clearSession(cookies);
		expect(getSessionData(cookies)).toEqual({});
	});

	it('produces different ciphertexts for the same input', () => {
		const cookies1 = createMockCookies();
		const cookies2 = createMockCookies();
		setSessionData(cookies1, { did: 'did:plc:same' });
		setSessionData(cookies2, { did: 'did:plc:same' });
		const ct1 = cookies1._store.get('backyard_session');
		const ct2 = cookies2._store.get('backyard_session');
		expect(ct1).not.toBe(ct2); // random IV ensures different ciphertext
	});
});

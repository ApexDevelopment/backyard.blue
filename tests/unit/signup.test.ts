import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: {}
}));
vi.mock('../../src/lib/server/db.js', () => ({ default: { query: vi.fn() } }));
vi.mock('../../src/lib/server/identity.js', () => ({
	resolveIdentifier: vi.fn()
}));

import { env } from '$env/dynamic/private';
import { getSignupMode, getAdminDids, isAdmin } from '../../src/lib/server/signup.js';

describe('getSignupMode', () => {
	beforeEach(() => {
		(env as any).SIGNUP_MODE = undefined;
	});

	it('defaults to "open" when unset', () => {
		expect(getSignupMode()).toBe('open');
	});

	it('returns "allowlist" for SIGNUP_MODE=allowlist', () => {
		(env as any).SIGNUP_MODE = 'allowlist';
		expect(getSignupMode()).toBe('allowlist');
	});

	it('normalizes case and whitespace', () => {
		(env as any).SIGNUP_MODE = '  AllowList  ';
		expect(getSignupMode()).toBe('allowlist');
	});

	it('falls back to "open" for unrecognized values', () => {
		(env as any).SIGNUP_MODE = 'closed';
		expect(getSignupMode()).toBe('open');
	});
});

describe('getAdminDids', () => {
	beforeEach(() => {
		(env as any).ADMIN_DIDS = undefined;
	});

	it('returns empty set when ADMIN_DIDS is unset', () => {
		expect(getAdminDids().size).toBe(0);
	});

	it('parses comma-separated DIDs', () => {
		(env as any).ADMIN_DIDS = 'did:plc:admin1,did:plc:admin2';
		const dids = getAdminDids();
		expect(dids.has('did:plc:admin1')).toBe(true);
		expect(dids.has('did:plc:admin2')).toBe(true);
		expect(dids.size).toBe(2);
	});

	it('trims whitespace around DIDs', () => {
		(env as any).ADMIN_DIDS = ' did:plc:a , did:plc:b ';
		const dids = getAdminDids();
		expect(dids.has('did:plc:a')).toBe(true);
		expect(dids.has('did:plc:b')).toBe(true);
	});

	it('ignores empty entries from trailing commas', () => {
		(env as any).ADMIN_DIDS = 'did:plc:a,,did:plc:b,';
		const dids = getAdminDids();
		expect(dids.size).toBe(2);
	});
});

describe('isAdmin', () => {
	beforeEach(() => {
		(env as any).ADMIN_DIDS = 'did:plc:admin1,did:plc:admin2';
	});

	it('returns true for admin DID', () => {
		expect(isAdmin('did:plc:admin1')).toBe(true);
	});

	it('returns false for non-admin DID', () => {
		expect(isAdmin('did:plc:nobody')).toBe(false);
	});

	it('returns false for undefined', () => {
		expect(isAdmin(undefined)).toBe(false);
	});

	it('returns false for empty string', () => {
		expect(isAdmin('')).toBe(false);
	});
});

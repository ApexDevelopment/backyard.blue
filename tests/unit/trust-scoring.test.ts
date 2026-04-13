import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/server/db.js', () => ({ default: { query: vi.fn() } }));
vi.mock('../../src/lib/server/identity.js', () => ({
	resolveDidDocument: vi.fn(),
	getPdsUrl: vi.fn()
}));

import { ageScore, externalRecordsScore, frequencyScore } from '../../src/lib/server/trust.js';

describe('ageScore', () => {
	it('returns 0 for null createdAt', () => {
		expect(ageScore(null)).toBe(0);
	});

	it('returns 0 for account created less than 1 day ago', () => {
		const justNow = new Date(Date.now() - 1000 * 60 * 30); // 30 minutes ago
		expect(ageScore(justNow)).toBe(0);
	});

	it('returns 10 for account created 1–6 days ago', () => {
		const twoDaysAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 2);
		expect(ageScore(twoDaysAgo)).toBe(10);
	});

	it('returns 20 for account created 7–29 days ago', () => {
		const twoWeeksAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 14);
		expect(ageScore(twoWeeksAgo)).toBe(20);
	});

	it('returns 30 for account created 30–89 days ago', () => {
		const fiftyDaysAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 50);
		expect(ageScore(fiftyDaysAgo)).toBe(30);
	});

	it('returns 40 (max) for account created 90+ days ago', () => {
		const oneYearAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365);
		expect(ageScore(oneYearAgo)).toBe(40);
	});

	it('returns 40 at exactly 90 days', () => {
		const exactly90 = new Date(Date.now() - 1000 * 60 * 60 * 24 * 90);
		expect(ageScore(exactly90)).toBe(40);
	});
});

describe('externalRecordsScore', () => {
	it('returns 30 when external records exist', () => {
		expect(externalRecordsScore(true)).toBe(30);
	});

	it('returns 0 when no external records', () => {
		expect(externalRecordsScore(false)).toBe(0);
	});
});

describe('frequencyScore', () => {
	it('returns 30 for zero posts', () => {
		expect(frequencyScore(0, 30)).toBe(30);
	});

	describe('new accounts (< 1 day)', () => {
		it('returns 30 for 10 or fewer posts', () => {
			expect(frequencyScore(5, 0.5)).toBe(30);
			expect(frequencyScore(10, 0.5)).toBe(30);
		});

		it('returns 15 for 11–20 posts', () => {
			expect(frequencyScore(15, 0.5)).toBe(15);
			expect(frequencyScore(20, 0.5)).toBe(15);
		});

		it('returns 0 for more than 20 posts', () => {
			expect(frequencyScore(21, 0.5)).toBe(0);
			expect(frequencyScore(100, 0.5)).toBe(0);
		});
	});

	describe('established accounts (>= 1 day)', () => {
		it('returns 30 for ≤10 posts/day', () => {
			expect(frequencyScore(30, 10)).toBe(30); // 3 posts/day
			expect(frequencyScore(100, 10)).toBe(30); // 10 posts/day
		});

		it('returns 15 for 11–30 posts/day', () => {
			expect(frequencyScore(300, 10)).toBe(15); // 30 posts/day in 10-day window (capped at 10)
		});

		it('returns 0 for >30 posts/day', () => {
			expect(frequencyScore(310, 10)).toBe(0); // 31 posts/day
		});

		it('caps account age at 30 days for rate calculation', () => {
			// 900 posts / min(365, 30) = 30 posts/day → still 15
			expect(frequencyScore(900, 365)).toBe(15);
		});
	});
});

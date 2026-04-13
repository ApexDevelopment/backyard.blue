import { describe, it, expect, beforeEach } from 'vitest';
import {
	isRateLimited,
	evictBuckets,
	RATE_MAX_BUCKETS,
	type RateBucket
} from '../../src/lib/server/rate-limit.js';

describe('isRateLimited', () => {
	let buckets: Map<string, RateBucket>;

	beforeEach(() => {
		buckets = new Map();
	});

	it('allows the first request', () => {
		expect(isRateLimited(buckets, '1.2.3.4', 10)).toBe(false);
	});

	it('allows requests up to the limit', () => {
		for (let i = 0; i < 10; i++) {
			isRateLimited(buckets, '1.2.3.4', 10);
		}
		// 10th request is exactly at limit, should not be limited
		expect(buckets.get('1.2.3.4')!.count).toBe(10);
	});

	it('blocks the request that exceeds the limit', () => {
		for (let i = 0; i < 10; i++) {
			isRateLimited(buckets, '1.2.3.4', 10);
		}
		expect(isRateLimited(buckets, '1.2.3.4', 10)).toBe(true);
	});

	it('tracks different keys independently', () => {
		for (let i = 0; i < 10; i++) {
			isRateLimited(buckets, '1.1.1.1', 10);
		}
		// 1.1.1.1 is at limit, but 2.2.2.2 is fresh
		expect(isRateLimited(buckets, '2.2.2.2', 10)).toBe(false);
	});

	it('resets bucket after window expires', () => {
		isRateLimited(buckets, '1.2.3.4', 1);
		// Manually expire the bucket
		buckets.get('1.2.3.4')!.resetAt = Date.now() - 1;
		// Should get a fresh bucket
		expect(isRateLimited(buckets, '1.2.3.4', 1)).toBe(false);
	});
});

describe('evictBuckets', () => {
	it('removes expired buckets', () => {
		const buckets = new Map<string, RateBucket>();
		const now = Date.now();
		buckets.set('expired', { count: 5, resetAt: now - 1000 });
		buckets.set('active', { count: 3, resetAt: now + 60000 });
		evictBuckets(buckets);
		expect(buckets.has('expired')).toBe(false);
		expect(buckets.has('active')).toBe(true);
	});

	it('evicts oldest when over RATE_MAX_BUCKETS even if not expired', () => {
		const buckets = new Map<string, RateBucket>();
		const now = Date.now();
		// Fill beyond capacity with all-active buckets
		for (let i = 0; i < RATE_MAX_BUCKETS + 100; i++) {
			buckets.set(`ip-${i}`, { count: 1, resetAt: now + i }); // ascending resetAt
		}
		evictBuckets(buckets);
		expect(buckets.size).toBeLessThanOrEqual(RATE_MAX_BUCKETS);
		// The first 100 (oldest resetAt) should have been evicted
		expect(buckets.has('ip-0')).toBe(false);
		expect(buckets.has(`ip-${RATE_MAX_BUCKETS + 99}`)).toBe(true);
	});
});

export const RATE_WINDOW_MS = 60_000;
export const RATE_MAX_BUCKETS = 50_000;

export interface RateBucket {
	count: number;
	resetAt: number;
}

export function evictBuckets(buckets: Map<string, RateBucket>): void {
	const now = Date.now();
	for (const [key, b] of buckets) {
		if (now >= b.resetAt) buckets.delete(key);
	}
	if (buckets.size > RATE_MAX_BUCKETS) {
		const sorted = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
		const toRemove = sorted.slice(0, buckets.size - RATE_MAX_BUCKETS);
		for (const [key] of toRemove) buckets.delete(key);
	}
}

export function isRateLimited(
	buckets: Map<string, RateBucket>,
	key: string,
	max: number
): boolean {
	if (buckets.size >= RATE_MAX_BUCKETS) evictBuckets(buckets);

	const now = Date.now();
	let bucket = buckets.get(key);
	if (!bucket || now >= bucket.resetAt) {
		bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
		buckets.set(key, bucket);
	}
	bucket.count++;
	return bucket.count > max;
}

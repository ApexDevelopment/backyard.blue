import { env } from '$env/dynamic/private';
import Redis from 'ioredis';

const REDIS_URL = env.REDIS_URL || '';

let redis: Redis | null = null;

export function getRedis(): Redis | null {
	if (!REDIS_URL) return null;
	if (!redis) {
		redis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
		redis.on('connect', () => console.info('Redis: connected'));
		redis.on('close', () => console.warn('Redis: connection closed'));
		redis.on('reconnecting', (ms: number) => console.info(`Redis: reconnecting in ${ms}ms`));
		redis.on('error', (err: Error) => console.error('Redis: error:', err.message));
	}
	return redis;
}

export async function connectRedis(): Promise<void> {
	const r = getRedis();
	if (!r) {
		console.info('Redis: no REDIS_URL configured, skipping');
		return;
	}
	await r.connect();
}

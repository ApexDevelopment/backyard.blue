import type { Cookies } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import crypto from 'node:crypto';

const COOKIE_NAME = 'backyard_session';
const ALGORITHM = 'aes-256-gcm';

const DEFAULT_SECRETS = [
	'development-secret-must-be-at-least-32-characters-long!!',
	'change-me-to-a-random-secret-at-least-32-characters-long!!'
];

let keyWarningLogged = false;

function getKey(): Buffer {
	const secret = env.SESSION_SECRET || DEFAULT_SECRETS[0];

	if (!keyWarningLogged && (!env.SESSION_SECRET || DEFAULT_SECRETS.includes(secret))) {
		keyWarningLogged = true;
		if (env.NODE_ENV === 'production') {
			throw new Error(
				'SESSION_SECRET is unset or uses a known default. ' +
				'Refusing to start in production. Set a random SESSION_SECRET of at least 32 characters.'
			);
		} else {
			console.warn('⚠️  Using default SESSION_SECRET — not suitable for production.');
		}
	}

	// Derive salt from PUBLIC_URL so different deployments produce different keys
	// even if they happen to share a secret (e.g. the default in development).
	const publicUrl = env.PUBLIC_URL || 'http://localhost:3000';
	const salt = `backyard-${publicUrl}`;
	return crypto.scryptSync(secret, salt, 32);
}

function encrypt(data: string): string {
	const key = getKey();
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
	const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function decrypt(data: string): string {
	const key = getKey();
	const buf = Buffer.from(data, 'base64url');
	const iv = buf.subarray(0, 12);
	const tag = buf.subarray(12, 28);
	const encrypted = buf.subarray(28);
	const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(tag);
	return decipher.update(encrypted) + decipher.final('utf8');
}

interface SessionData {
	did?: string;
}

export function getSessionData(cookies: Cookies): SessionData {
	const cookie = cookies.get(COOKIE_NAME);
	if (!cookie) return {};

	try {
		return JSON.parse(decrypt(cookie)) as SessionData;
	} catch {
		return {};
	}
}

export function setSessionData(cookies: Cookies, data: SessionData): void {
	const publicUrl = env.PUBLIC_URL || 'http://localhost:3000';
	// Set secure flag if PUBLIC_URL uses HTTPS or if explicitly in production
	// (behind TLS termination, PUBLIC_URL may be https even if the app sees http)
	const secure = publicUrl.startsWith('https://') || env.NODE_ENV === 'production';

	cookies.set(COOKIE_NAME, encrypt(JSON.stringify(data)), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure,
		maxAge: 60 * 60 * 24 * 30 // 30 days
	});
}

export function clearSession(cookies: Cookies): void {
	cookies.delete(COOKIE_NAME, { path: '/' });
}

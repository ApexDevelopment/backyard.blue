import type {
	NodeSavedSession,
	NodeSavedSessionStore,
	NodeSavedState,
	NodeSavedStateStore
} from '@atproto/oauth-client-node';
import { NodeOAuthClient } from '@atproto/oauth-client-node';
import { JoseKey } from '@atproto/jwk-jose';
import { Agent } from '@atproto/api';
import { env } from '$env/dynamic/private';
import { OAUTH_SCOPE } from '$lib/lexicon.js';
import pool from './db.js';

let clientPromise: Promise<NodeOAuthClient> | null = null;

/**
 * Best-effort check for whether a URL points to a loopback address.
 * Matches localhost, 127.0.0.1, and [::1] — all recognised by the
 * AT Protocol OAuth spec's Localhost Client Development exception.
 */
function isLoopbackUrl(url: string): boolean {
	try {
		const { hostname } = new URL(url);
		return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
	} catch {
		return false;
	}
}

/**
 * PostgreSQL-backed state store for OAuth authorization flow.
 * States are short-lived (~1 hour) and used to prevent CSRF attacks.
 */
const stateStore: NodeSavedStateStore = {
	async set(key: string, state: NodeSavedState): Promise<void> {
		await pool.query(
			`INSERT INTO oauth_state (key, state) VALUES ($1, $2)
			 ON CONFLICT (key) DO UPDATE SET state = $2, created_at = NOW()`,
			[key, JSON.stringify(state)]
		);
	},
	async get(key: string): Promise<NodeSavedState | undefined> {
		const result = await pool.query('SELECT state FROM oauth_state WHERE key = $1', [key]);
		if (result.rows.length === 0) return undefined;
		return result.rows[0].state as NodeSavedState;
	},
	async del(key: string): Promise<void> {
		await pool.query('DELETE FROM oauth_state WHERE key = $1', [key]);
	}
};

/**
 * PostgreSQL-backed session store for authenticated sessions.
 * Sessions are long-lived and contain access/refresh tokens.
 */
const sessionStore: NodeSavedSessionStore = {
	async set(sub: string, session: NodeSavedSession): Promise<void> {
		await pool.query(
			`INSERT INTO oauth_session (did, session) VALUES ($1, $2)
			 ON CONFLICT (did) DO UPDATE SET session = $2, updated_at = NOW()`,
			[sub, JSON.stringify(session)]
		);
	},
	async get(sub: string): Promise<NodeSavedSession | undefined> {
		const result = await pool.query('SELECT session FROM oauth_session WHERE did = $1', [sub]);
		if (result.rows.length === 0) return undefined;
		return result.rows[0].session as NodeSavedSession;
	},
	async del(sub: string): Promise<void> {
		await pool.query('DELETE FROM oauth_session WHERE did = $1', [sub]);
	}
};

/**
 * Get or create the OAuth client singleton.
 * Uses scoped permissions per AGENTS.md requirements (NOT transitional full-access).
 *
 * When running on a loopback address (localhost / 127.0.0.1) the client
 * registers as an AT-Proto *loopback* client — a public (no JWKS) native
 * client whose client_id is `http://localhost?…` and whose redirect_uri
 * uses `http://127.0.0.1:{port}/oauth/callback`.
 */
export function getOAuthClient(): Promise<NodeOAuthClient> {
	if (!clientPromise) {
		clientPromise = createOAuthClient().catch((err) => {
			clientPromise = null; // allow retry on next call
			throw err;
		});
	}
	return clientPromise;
}

async function createOAuthClient(): Promise<NodeOAuthClient> {
	const publicUrl = env.PUBLIC_URL || 'http://localhost:3000';

	if (isLoopbackUrl(publicUrl)) {

		const port = new URL(publicUrl).port || '3000';
		const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;

		// The AT-Proto spec encodes scope + redirect_uri as query-params
		// on an `http://localhost` client_id.  The Authorization Server
		// uses these to build "virtual" client metadata instead of
		// fetching a remote document.
		const params = new URLSearchParams();
		params.set('scope', OAUTH_SCOPE);
		params.set('redirect_uri', redirectUri);
		const clientId = `http://localhost?${params.toString()}`;

		const client = new NodeOAuthClient({
			clientMetadata: {
				client_id: clientId,
				scope: OAUTH_SCOPE,
				redirect_uris: [redirectUri],
				response_types: ['code'],
				grant_types: ['authorization_code', 'refresh_token'],
				token_endpoint_auth_method: 'none',
				application_type: 'native',
				dpop_bound_access_tokens: true
			},
			// Public client — no keyset
			stateStore,
			sessionStore
		});

		console.info(`🔒 OAuth configured as loopback client (${clientId})`);
		return client;
	}


	const keys: JoseKey[] = [];
	const keyEnvVars = ['OAUTH_PRIVATE_KEY_1', 'OAUTH_PRIVATE_KEY_2', 'OAUTH_PRIVATE_KEY_3'];

	for (let i = 0; i < keyEnvVars.length; i++) {
		const keyData = env[keyEnvVars[i]];
		if (keyData) {
			keys.push(await JoseKey.fromImportable(keyData, `key${i + 1}`));
		}
	}

	// If no keys are configured, generate an ephemeral one (development only)
	if (keys.length === 0) {
		console.warn(
			'⚠️  No OAuth private keys configured. Generating ephemeral key (development only).'
		);
		keys.push(await JoseKey.generate(['RS256']));
	}

	const webClient = new NodeOAuthClient({
		clientMetadata: {
			client_id: `${publicUrl}/oauth/client-metadata.json`,
			client_name: 'Backyard',
			client_uri: publicUrl,
			redirect_uris: [`${publicUrl}/oauth/callback`],
			grant_types: ['authorization_code', 'refresh_token'],
			// Scoped permissions — NOT transitional full-access
			// repo:<collection> grants full read/write access to that collection in the user's repo
			scope: OAUTH_SCOPE,
			response_types: ['code'],
			application_type: 'web',
			token_endpoint_auth_method: 'private_key_jwt',
			token_endpoint_auth_signing_alg: 'RS256',
			dpop_bound_access_tokens: true,
			jwks_uri: `${publicUrl}/oauth/jwks.json`
		},
		keyset: keys,
		stateStore,
		sessionStore
	});

	return webClient;
}

/**
 * Create an authenticated Agent for a given user DID.
 * Returns null if the session cannot be restored.
 */
export async function getAgent(did: string): Promise<Agent | null> {
	try {
		const client = await getOAuthClient();
		const session = await client.restore(did);
		return new Agent(session);
	} catch (err) {
		console.error(`Failed to restore session for ${did}:`, err);
		return null;
	}
}

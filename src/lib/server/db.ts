import { Pool } from 'pg';
import { env } from '$env/dynamic/private';

const pool = new Pool({
	connectionString: env.DATABASE_URL || 'postgresql://backyard:backyard@localhost:5432/backyard',
	max: 20,
	idleTimeoutMillis: 30_000,
	connectionTimeoutMillis: 5_000
});

pool.on('error', (err) => {
	console.error('Unexpected database pool error:', err);
});

export default pool;

/**
 * Initialize the database schema. Called once at app startup.
 */
export async function initializeDatabase(): Promise<void> {
	const client = await pool.connect();
	try {
		await client.query(`
			-- Enable pg_trgm for efficient ILIKE / trigram search on text columns
			CREATE EXTENSION IF NOT EXISTS pg_trgm;

			-- OAuth flow state (short-lived, ~1 hour)
			CREATE TABLE IF NOT EXISTS oauth_state (
				key TEXT PRIMARY KEY,
				state JSONB NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			-- OAuth authenticated sessions (long-lived)
			CREATE TABLE IF NOT EXISTS oauth_session (
				did TEXT PRIMARY KEY,
				session JSONB NOT NULL,
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			-- Cached user profiles (resolved from DID documents + PDS records)
			CREATE TABLE IF NOT EXISTS profiles (
				did TEXT PRIMARY KEY,
				handle TEXT NOT NULL,
				display_name TEXT,
				pronouns TEXT,
				description TEXT,
				avatar TEXT,
				banner TEXT,
				pds_url TEXT,
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE INDEX IF NOT EXISTS idx_profiles_handle ON profiles(handle);
			CREATE INDEX IF NOT EXISTS idx_profiles_handle_trgm ON profiles USING gin (handle gin_trgm_ops);
			CREATE INDEX IF NOT EXISTS idx_profiles_display_name_trgm ON profiles USING gin (display_name gin_trgm_ops);

			-- Posts (blue.backyard.feed.post)
			CREATE TABLE IF NOT EXISTS posts (
				uri TEXT PRIMARY KEY,
				cid TEXT NOT NULL,
				author_did TEXT NOT NULL,
				text TEXT NOT NULL,
				facets JSONB,
				media JSONB,
				tags TEXT[],
				created_at TIMESTAMPTZ NOT NULL,
				indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_did);
			CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
			CREATE INDEX IF NOT EXISTS idx_posts_author_created ON posts(author_did, created_at DESC);
			CREATE INDEX IF NOT EXISTS idx_posts_tags ON posts USING gin (tags);

			-- Comments (blue.backyard.feed.comment) — "notes" in Tumblr terms
			CREATE TABLE IF NOT EXISTS comments (
				uri TEXT PRIMARY KEY,
				cid TEXT NOT NULL,
				author_did TEXT NOT NULL,
				text TEXT NOT NULL,
				facets JSONB,
				subject_uri TEXT NOT NULL,
				root_uri TEXT NOT NULL,
				parent_uri TEXT,
				created_at TIMESTAMPTZ NOT NULL,
				indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE INDEX IF NOT EXISTS idx_comments_subject ON comments(subject_uri);
			CREATE INDEX IF NOT EXISTS idx_comments_root ON comments(root_uri);
			CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author_did);

			-- Reblogs (blue.backyard.feed.reblog) — Tumblr-style reblogs with optional additions
			CREATE TABLE IF NOT EXISTS reblogs (
				uri TEXT PRIMARY KEY,
				cid TEXT NOT NULL,
				author_did TEXT NOT NULL,
				subject_uri TEXT NOT NULL,
				root_post_uri TEXT,
				text TEXT,
				facets JSONB,
				media JSONB,
				tags TEXT[],
				created_at TIMESTAMPTZ NOT NULL,
				indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			-- Backfill root_post_uri for direct reblogs of posts
			UPDATE reblogs SET root_post_uri = subject_uri
				WHERE root_post_uri IS NULL
				AND subject_uri IN (SELECT uri FROM posts);

			CREATE INDEX IF NOT EXISTS idx_reblogs_author ON reblogs(author_did);
			CREATE INDEX IF NOT EXISTS idx_reblogs_subject ON reblogs(subject_uri);
			CREATE INDEX IF NOT EXISTS idx_reblogs_created ON reblogs(created_at DESC);
			CREATE INDEX IF NOT EXISTS idx_reblogs_root_post ON reblogs(root_post_uri);
			CREATE INDEX IF NOT EXISTS idx_reblogs_author_created ON reblogs(author_did, created_at DESC);
			CREATE INDEX IF NOT EXISTS idx_reblogs_tags ON reblogs USING gin (tags);

			-- Likes (blue.backyard.feed.like)
			CREATE TABLE IF NOT EXISTS likes (
				uri TEXT PRIMARY KEY,
				cid TEXT NOT NULL,
				author_did TEXT NOT NULL,
				subject_uri TEXT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL
			);

			CREATE INDEX IF NOT EXISTS idx_likes_subject ON likes(subject_uri);
			CREATE INDEX IF NOT EXISTS idx_likes_author_subject ON likes(author_did, subject_uri);

			-- Follows (blue.backyard.graph.follow)
			CREATE TABLE IF NOT EXISTS follows (
				uri TEXT PRIMARY KEY,
				author_did TEXT NOT NULL,
				subject_did TEXT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL
			);

			CREATE INDEX IF NOT EXISTS idx_follows_author ON follows(author_did);
			CREATE INDEX IF NOT EXISTS idx_follows_subject ON follows(subject_did);
			CREATE UNIQUE INDEX IF NOT EXISTS idx_follows_unique ON follows(author_did, subject_did);

			-- Blocks (blue.backyard.graph.block)
			CREATE TABLE IF NOT EXISTS blocks (
				uri TEXT PRIMARY KEY,
				author_did TEXT NOT NULL,
				subject_did TEXT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL
			);

			CREATE INDEX IF NOT EXISTS idx_blocks_author ON blocks(author_did);
			CREATE INDEX IF NOT EXISTS idx_blocks_subject ON blocks(subject_did);
			CREATE UNIQUE INDEX IF NOT EXISTS idx_blocks_unique ON blocks(author_did, subject_did);

			-- Tag blocks (local-only, not committed to PDS)
			CREATE TABLE IF NOT EXISTS blocked_tags (
				id BIGSERIAL PRIMARY KEY,
				author_did TEXT NOT NULL,
				tag TEXT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE UNIQUE INDEX IF NOT EXISTS idx_blocked_tags_unique ON blocked_tags(author_did, tag);

			-- Firehose cursor persistence (Jetstream consumer position)
			CREATE TABLE IF NOT EXISTS firehose_cursor (
				id TEXT PRIMARY KEY,
				cursor_us BIGINT NOT NULL,
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			-- Notifications (likes, comments, reblogs, follows on a user's content)
			CREATE TABLE IF NOT EXISTS notifications (
				id BIGSERIAL PRIMARY KEY,
				recipient_did TEXT NOT NULL,
				actor_did TEXT NOT NULL,
				type TEXT NOT NULL,
				subject_uri TEXT,
				action_uri TEXT NOT NULL,
				read BOOLEAN NOT NULL DEFAULT FALSE,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_action_uri
				ON notifications(action_uri);
			CREATE INDEX IF NOT EXISTS idx_notifications_recipient
				ON notifications(recipient_did, id DESC);
			CREATE INDEX IF NOT EXISTS idx_notifications_unread
				ON notifications(recipient_did) WHERE read = FALSE;

			-- Signup allowlist for gated instances
			CREATE TABLE IF NOT EXISTS signup_allowlist (
				identifier TEXT PRIMARY KEY,
				note TEXT,
				added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			-- Account trust evaluation cache
			CREATE TABLE IF NOT EXISTS account_trust (
				did TEXT PRIMARY KEY,
				trust_score INTEGER NOT NULL DEFAULT 0,
				manually_approved BOOLEAN NOT NULL DEFAULT FALSE,
				account_created_at TIMESTAMPTZ,
				has_external_records BOOLEAN NOT NULL DEFAULT FALSE,
				post_count_30d INTEGER NOT NULL DEFAULT 0,
				evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			-- Denormalised trust flag on profiles for fast feed rendering
			ALTER TABLE profiles ADD COLUMN IF NOT EXISTS media_trusted BOOLEAN NOT NULL DEFAULT FALSE;

			-- Embed preview cache (OpenGraph / Twitter Card metadata)
			CREATE TABLE IF NOT EXISTS embed_cache (
				url TEXT PRIMARY KEY,
				data JSONB,
				is_null BOOLEAN NOT NULL DEFAULT FALSE,
				fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			-- Housekeeping: clean up expired OAuth state
			DELETE FROM oauth_state WHERE created_at < NOW() - INTERVAL '1 hour';
			-- Housekeeping: clean up stale negative embed cache entries (older than 1 hour)
			DELETE FROM embed_cache WHERE is_null = TRUE AND fetched_at < NOW() - INTERVAL '1 hour';
		`);
	} finally {
		client.release();
	}
}

/**
 * Start periodic cleanup of expired OAuth state entries.
 * Runs every hour.
 */
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startOAuthStateCleanup(): void {
	if (cleanupTimer) return;
	cleanupTimer = setInterval(async () => {
		try {
			await pool.query("DELETE FROM oauth_state WHERE created_at < NOW() - INTERVAL '1 hour'");
		} catch (err) {
			console.error('OAuth state cleanup error:', err);
		}
	}, 60 * 60 * 1000); // every hour
}

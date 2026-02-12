<script lang="ts">
	import type { BackyardPost, BackyardChainEntry, BackyardReblogInfo } from '$lib/types.js';
	import { MessageCircle, Repeat2, Heart, ChevronDown, Trash2 } from 'lucide-svelte';
	import { openReblogComposer } from '$lib/stores/composer.js';
	import RichTextRenderer from './RichTextRenderer.svelte';

	interface Props {
		post: BackyardPost;
		/** Reblog chain: original post first, each addition after. When present, renders Tumblr-style stacked entries. */
		chain?: BackyardChainEntry[];
		/** Present when this card represents a reblog. Contains reblogger info and the reblog's own tags. */
		reblog?: BackyardReblogInfo;
		showActions?: boolean;
		compact?: boolean;
		/** When set, tag links point to /profile/{profileHandle}/tags/{tag} instead of /tags/{tag} */
		profileHandle?: string;
		/** The logged-in user's DID, used to show delete controls on owned posts/reblogs */
		viewerDid?: string;
	}

	let { post, chain, reblog, showActions = true, compact = false, profileHandle, viewerDid }: Props = $props();

	/** The tags to display at the card bottom: reblog's own tags if this is a reblog, otherwise the post's. */
	let cardTags = $derived(reblog ? reblog.tags : post.tags);

	function tagHref(tag: string): string {
		const encoded = encodeURIComponent(tag);
		if (profileHandle) {
			return `/profile/${encodeURIComponent(profileHandle)}/tags/${encoded}`;
		}
		return `/tags/${encoded}`;
	}

	/** Max chain entries visible before clipping */
	const MAX_VISIBLE = 3;
	let expanded = $state(false);

	/** Chain entries that actually have content (text or media), plus tombstones */
	let contentChain = $derived(
		chain?.filter((e) => e.deleted || e.text?.trim() || (e.media && e.media.length > 0)) ?? []
	);
	let needsClipping = $derived(contentChain.length > MAX_VISIBLE && !expanded);
	let visibleEntries = $derived(
		needsClipping
			? [contentChain[0], ...contentChain.slice(-2)]
			: contentChain
	);
	let hiddenCount = $derived(contentChain.length - MAX_VISIBLE);

	/** Track which author DIDs have been seen so pronouns only show on first occurrence. */
	let seenDids = $derived.by(() => {
		const seen = new Set<string>();
		const result = new Map<string, boolean>();
		for (const entry of visibleEntries) {
			result.set(entry.uri, !seen.has(entry.author.did));
			seen.add(entry.author.did);
		}
		return result;
	});

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'just now';
		if (diffMins < 60) return `${diffMins}m`;
		if (diffHours < 24) return `${diffHours}h`;
		if (diffDays < 7) return `${diffDays}d`;
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function formatCount(n: number): string {
		if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
		if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
		return n.toString();
	}

	let viewerLike = $derived(post.viewerLike);
	let likeCount = $derived(post.likeCount);
	let liked = $derived(!!viewerLike);
	let likeLoading = $state(false);

	let deleted = $state(false);
	let deleteLoading = $state(false);
	let confirmOpen = $state(false);

	/** The viewer owns the post itself (for single posts) */
	let ownsPost = $derived(viewerDid === post.author.did);
	/** The viewer owns the reblog wrapper (for reblogs) */
	let ownsReblog = $derived(reblog ? viewerDid === reblog.by.did : false);
	let canDelete = $derived(viewerDid ? (reblog ? ownsReblog : ownsPost) : false);

	async function handleLike() {
		if (likeLoading) return;
		likeLoading = true;

		const wasLiked = viewerLike;
		const prevCount = likeCount;

		// Optimistic update
		if (wasLiked) {
			viewerLike = undefined;
			likeCount = Math.max(0, likeCount - 1);
		} else {
			viewerLike = 'pending';
			likeCount += 1;
		}

		try {
			const res = await fetch('/api/like', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ uri: post.uri, cid: post.cid, liked: wasLiked || '' })
			});
			if (res.ok) {
				if (!wasLiked) {
					const data = await res.json();
					viewerLike = data.uri;
				}
			} else {
				viewerLike = wasLiked;
				likeCount = prevCount;
			}
		} catch {
			viewerLike = wasLiked;
			likeCount = prevCount;
		} finally {
			likeLoading = false;
		}
	}

	async function handleReblog() {
		// Always open reblog composer — subject is the latest entry in the chain (or the post itself)
			const lastChainEntry = chain && chain.length > 0 ? chain[chain.length - 1] : null;
			const subjectUri = lastChainEntry?.uri || post.uri;
			const subjectCid = lastChainEntry?.cid || post.cid;

			// Build the chain that the composer will show as context.
			// If we have a chain, pass it as-is. If not, create a single-entry chain from the post.
			const composerChain: BackyardChainEntry[] = chain && chain.length > 0
				? chain
				: [{
					uri: post.uri,
					cid: post.cid,
					author: post.author,
					text: post.text,
					facets: post.facets,
					media: post.media,
					tags: post.tags,
					createdAt: post.createdAt,
					isRoot: true
				}];

			openReblogComposer(subjectUri, subjectCid, composerChain);
	}

	function handleDeleteClick() {
		confirmOpen = true;
	}

	function handleConfirmKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') confirmOpen = false;
	}

	async function handleDeleteConfirm() {
		if (deleteLoading) return;

		deleteLoading = true;
		try {
			const uri = reblog ? reblog.uri : post.uri;
			const res = await fetch('/api/post', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ uri })
			});
			if (res.ok) {
				deleted = true;
			}
		} finally {
			deleteLoading = false;
			confirmOpen = false;
		}
	}
</script>

{#if deleted}
	<article class="post-card card deleted-card">
		<p class="tombstone">this post has been deleted.</p>
	</article>
{:else}
<article class="post-card card" class:compact>
	{#if reblog}
		<div class="reblog-header">
			<Repeat2 size={14} />
			<a href="/profile/{reblog.by.handle}">{reblog.by.displayName || reblog.by.handle}</a> reblogged
		</div>
	{/if}

	{#if contentChain.length > 1}
		<!-- CHAIN VIEW: Tumblr-style stacked entries -->
		<div class="chain">
			{#each visibleEntries as entry, i (entry.uri)}
				{#if needsClipping && i === 1}
					<!-- Expand button between first and last entries -->
					<button class="chain-expand" onclick={() => (expanded = true)}>
						<ChevronDown size={14} />
						{hiddenCount} more addition{hiddenCount === 1 ? '' : 's'}
					</button>
				{/if}
				<div class="chain-entry" class:chain-entry-last={i === visibleEntries.length - 1}>
					{#if entry.deleted}
						<p class="tombstone">this post has been deleted by the author.</p>
					{:else}
						<div class="chain-entry-header">
							<a href="/profile/{entry.author.handle}" class="author-link">
								{#if entry.author.avatar}
									<img src={entry.author.avatar} alt="" class="avatar avatar-sm" />
								{:else}
									<div class="avatar avatar-sm avatar-placeholder">
										{(entry.author.displayName || entry.author.handle).charAt(0).toUpperCase()}
									</div>
								{/if}
								<div class="chain-author-info">
									<div class="chain-author-name-row">
										<span class="chain-author-name">{entry.author.displayName || entry.author.handle}</span>
										{#if entry.author.displayName}
											<span class="chain-author-handle">@{entry.author.handle}</span>
										{/if}
									</div>
									{#if entry.author.pronouns && seenDids.get(entry.uri)}
										<span class="pronouns-badge">{entry.author.pronouns}</span>
									{/if}
								</div>
							</a>
							<time class="post-time" datetime={entry.createdAt} title={new Date(entry.createdAt).toLocaleString()}>
								{formatDate(entry.createdAt)}
							</time>
						</div>
						{#if entry.text}
							<div class="chain-entry-content">
								<p><RichTextRenderer text={entry.text} facets={entry.facets} /></p>
							</div>
						{/if}
						{#if entry.media && entry.media.length > 0}
							<div class="post-embed">
								<div class="embed-images" class:single={entry.media.length === 1} class:grid={entry.media.length > 1}>
									{#each entry.media as media}
										<img src={media.url} alt={media.alt || ''} class="embed-image" loading="lazy" />
									{/each}
								</div>
							</div>
						{/if}
					{/if}
				</div>
			{/each}
		</div>

		{#if cardTags && cardTags.length > 0}
			<div class="post-tags">
				{#each cardTags as tag}
					<a href={tagHref(tag)} class="tag">#{tag}</a>
				{/each}
			</div>
		{/if}
	{:else}
		<!-- SINGLE POST VIEW (no chain or chain has only one entry) -->
		<div class="post-header">
			<a href="/profile/{post.author.handle}" class="author-link">
				{#if post.author.avatar}
					<img src={post.author.avatar} alt="" class="avatar" class:avatar-sm={compact} />
				{:else}
					<div class="avatar avatar-placeholder" class:avatar-sm={compact}>
						{(post.author.displayName || post.author.handle).charAt(0).toUpperCase()}
					</div>
				{/if}
				<div class="author-info">
					<div class="author-name-row">
						<span class="author-name">{post.author.displayName || post.author.handle}</span>
						{#if post.author.displayName}
							<span class="author-handle">@{post.author.handle}</span>
						{/if}
					</div>
					{#if post.author.pronouns}
						<span class="pronouns-badge">{post.author.pronouns}</span>
					{/if}
				</div>
			</a>
			<time class="post-time" datetime={post.createdAt} title={new Date(post.createdAt).toLocaleString()}>
				{formatDate(post.createdAt)}
			</time>
		</div>

		<div class="post-content">
			<p><RichTextRenderer text={post.text} facets={post.facets} /></p>
		</div>

		{#if cardTags && cardTags.length > 0}
			<div class="post-tags">
				{#each cardTags as tag}
					<a href={tagHref(tag)} class="tag">#{tag}</a>
				{/each}
			</div>
		{/if}

		{#if post.media && post.media.length > 0}
			<div class="post-embed">
				<div class="embed-images" class:single={post.media.length === 1} class:grid={post.media.length > 1}>
					{#each post.media as media}
						<img src={media.url} alt={media.alt || ''} class="embed-image" loading="lazy" />
					{/each}
				</div>
			</div>
		{/if}
	{/if}

	{#if showActions}
		<div class="post-actions">
			<a href="/post/{post.uri.split('/').slice(-3).join('/')}" class="action-btn" title="comment">
				<MessageCircle size={16} />
				{#if post.commentCount > 0}
					<span>{formatCount(post.commentCount)}</span>
				{/if}
			</a>

			<button class="action-btn" class:active={!!post.viewerReblog} onclick={handleReblog} title="reblog">
				<Repeat2 size={16} />
				{#if post.reblogCount > 0}
					<span>{formatCount(post.reblogCount)}</span>
				{/if}
			</button>

			<button class="action-btn like-btn" class:active={liked} onclick={handleLike} title="like" disabled={likeLoading}>
				<Heart size={16} fill={liked ? 'currentColor' : 'none'} />
				{#if likeCount > 0}
					<span>{formatCount(likeCount)}</span>
				{/if}
			</button>

			{#if canDelete}
				<button class="action-btn delete-btn" onclick={handleDeleteClick} title="delete" disabled={deleteLoading}>
					<Trash2 size={16} />
				</button>
			{/if}
		</div>
	{/if}
</article>
{/if}

{#if confirmOpen}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="confirm-backdrop" role="dialog" aria-modal="true" aria-label="confirm deletion" tabindex="-1" onclick={() => (confirmOpen = false)} onkeydown={handleConfirmKeydown}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="confirm-dialog card" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
			<p class="confirm-message">delete this {reblog ? 'reblog' : 'post'}? this can't be undone.</p>
			<div class="confirm-actions">
				<button class="btn btn-ghost" onclick={() => (confirmOpen = false)}>cancel</button>
				<button class="btn btn-danger" onclick={handleDeleteConfirm} disabled={deleteLoading}>
					{deleteLoading ? 'deleting…' : 'delete'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.post-card {
		padding: 1rem;
		transition: background-color 0.15s ease;
	}

	.post-card.compact {
		padding: 0.75rem;
	}

	/* ── Reblog header ────────────────────────────────────── */

	.reblog-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-bottom: 0.5rem;
		font-size: 0.8125rem;
		color: var(--text-tertiary);
	}

	.reblog-header a {
		color: var(--text-secondary);
		font-weight: 600;
		text-decoration: none;
	}

	.reblog-header a:hover {
		text-decoration: underline;
	}

	/* ── Chain view ───────────────────────────────────────── */

	.chain {
		display: flex;
		flex-direction: column;
	}

	.chain-entry {
		padding-bottom: 0.625rem;
		margin-bottom: 0.625rem;
		border-bottom: 1px solid var(--border-light);
	}

	.chain-entry-last {
		border-bottom: none;
		margin-bottom: 0;
		padding-bottom: 0;
	}

	.chain-entry-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 0.375rem;
	}

	.chain-author-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.chain-author-name-row {
		display: flex;
		align-items: baseline;
		gap: 0.375rem;
		min-width: 0;
	}

	.chain-author-name {
		font-weight: 600;
		font-size: 0.875rem;
		color: var(--text-primary);
	}

	.chain-author-handle {
		font-size: 0.75rem;
		color: var(--text-tertiary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.pronouns-badge {
		display: inline-block;
		width: fit-content;
		font-size: 0.6875rem;
		color: var(--text-secondary);
		background-color: color-mix(in srgb, var(--text-tertiary) 12%, transparent);
		padding: 0 0.375rem;
		border-radius: var(--radius-sm);
		line-height: 1.5;
	}

	.chain-entry-content {
		margin-bottom: 0.375rem;
		font-size: 0.9375rem;
		line-height: 1.5;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.chain-expand {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		width: 100%;
		padding: 0.375rem;
		margin-bottom: 0.625rem;
		border: 1px dashed var(--border-color);
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-tertiary);
		font-size: 0.8125rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.chain-expand:hover {
		color: var(--text-secondary);
		background-color: var(--bg-hover);
		border-color: var(--text-tertiary);
	}

	/* ── Single post view ────────────────────────────────── */

	.post-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}

	.author-link {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		color: var(--text-primary);
		text-decoration: none;
		min-width: 0;
	}

	.author-link:hover {
		text-decoration: none;
	}

	.author-link:hover .author-name,
	.author-link:hover .chain-author-name {
		text-decoration: underline;
	}

	.author-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
		gap: 0.125rem;
	}

	.author-name-row {
		display: flex;
		align-items: baseline;
		gap: 0.375rem;
		min-width: 0;
	}

	.author-name {
		font-weight: 600;
		font-size: 0.9375rem;
		line-height: 1.3;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.author-handle {
		font-size: 0.8125rem;
		color: var(--text-tertiary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.post-time {
		font-size: 0.8125rem;
		color: var(--text-tertiary);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.post-content {
		margin-bottom: 0.5rem;
		font-size: 0.9375rem;
		line-height: 1.5;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.post-embed {
		margin-bottom: 0.5rem;
	}

	.post-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin-bottom: 0.5rem;
	}

	.tag {
		font-size: 0.8125rem;
		color: var(--text-link);
		background-color: color-mix(in srgb, var(--accent) 10%, transparent);
		padding: 0.125rem 0.5rem;
		border-radius: var(--radius-md);
		text-decoration: none;
		transition: background-color 0.15s ease;
	}

	.tag:hover {
		background-color: color-mix(in srgb, var(--accent) 20%, transparent);
		text-decoration: none;
	}

	.embed-images {
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.embed-images.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2px;
	}

	.embed-image {
		width: 100%;
		max-height: 400px;
		object-fit: cover;
	}

	/* ── Action bar ──────────────────────────────────────── */

	.post-actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin-top: 0.25rem;
		min-height: 2rem;
	}

	.action-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.625rem;
		border-radius: var(--radius-full);
		font-size: 0.8125rem;
		line-height: 1;
		color: var(--text-tertiary);
		transition: all 0.15s ease;
		text-decoration: none;
		cursor: pointer;
		background: none;
		border: none;
	}

	.action-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-secondary);
		text-decoration: none;
	}

	.action-btn.active {
		color: var(--accent);
	}

	.action-btn.like-btn.active {
		color: var(--danger);
	}

	.action-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.avatar-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: var(--accent);
		color: white;
		font-weight: 600;
		font-size: 0.875rem;
	}

	.delete-btn:hover {
		color: var(--danger);
	}

	.delete-btn {
		margin-left: auto;
	}

	.deleted-card {
		padding: 1rem;
	}

	.tombstone {
		color: var(--text-tertiary);
		font-size: 0.875rem;
		font-style: italic;
	}

	/* ── Delete confirmation modal ────────────────────── */

	.confirm-backdrop {
		position: fixed;
		inset: 0;
		z-index: 200;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		animation: confirmFadeIn 0.15s ease;
	}

	@keyframes confirmFadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.confirm-dialog {
		width: 100%;
		max-width: 360px;
		padding: 1.25rem;
		animation: confirmSlideIn 0.2s ease;
	}

	@keyframes confirmSlideIn {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.confirm-message {
		font-size: 0.9375rem;
		line-height: 1.5;
		color: var(--text-primary);
		margin-bottom: 1rem;
	}

	.confirm-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>

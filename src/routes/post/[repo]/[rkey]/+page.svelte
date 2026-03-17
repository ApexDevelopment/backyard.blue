<script lang="ts">
	import PostCard from '$lib/components/PostCard.svelte';
	import RichTextRenderer from '$lib/components/RichTextRenderer.svelte';
	import type { PageData } from './$types.js';
	import { ChevronLeft, Repeat2 } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	let commentText = $state('');
	let commenting = $state(false);
	let commentError = $state('');

	async function handleComment(e: Event) {
		e.preventDefault();
		if (!commentText.trim() || commenting) return;

		commenting = true;
		commentError = '';

		try {
			const res = await fetch('/api/reply', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					text: commentText.trim(),
					subjectUri: data.post.uri,
					subjectCid: data.post.cid,
					rootUri: data.post.uri,
					rootCid: data.post.cid
				})
			});

			if (res.ok) {
				commentText = '';
				window.location.reload();
			} else {
				const result = await res.json();
				commentError = result.error || 'failed to post comment';
			}
		} catch {
			commentError = 'network error. please try again.';
		} finally {
			commenting = false;
		}
	}
</script>

<svelte:head>
	<title>{data.post.author.displayName || `@${data.post.author.handle}`}: "{(data.post.content?.[0]?.type === 'text' ? data.post.content[0].text : '').slice(0, 50)}" — backyard</title>
</svelte:head>

<div class="thread-page">
	<div class="page-header">
		<a href="/" class="back-link">
			<ChevronLeft size={18} />
			back
		</a>
	</div>

	<!-- Main post -->
	<div class="main-post">
		<PostCard post={data.post} reblog={data.reblog} chain={data.chain} viewerDid={data.user?.did} />
	</div>

	<!-- Reblogs List -->
	{#if data.reblogs && data.reblogs.length > 0}
		<div class="reblogs-section">
			<div class="reblogs-list card">
				{#each data.reblogs as reblog (reblog.reblogUri)}
					{@const rkey = reblog.reblogUri.split('/').pop()}
					<a href="/post/{reblog.reblogger.did}/{rkey}" class="reblog-item">
						<div class="reblog-avatar">
							{#if reblog.reblogger.avatar}
								<img src={reblog.reblogger.avatar} alt={reblog.reblogger.handle} class="avatar avatar-xs" />
							{:else}
								<div class="avatar avatar-xs avatar-placeholder">
									{(reblog.reblogger.displayName || reblog.reblogger.handle).charAt(0).toUpperCase()}
								</div>
							{/if}
						</div>
						<span class="reblog-name">{reblog.reblogger.displayName || reblog.reblogger.handle}</span>
						<span class="reblog-icon-wrapper">
							<Repeat2 size={14} />
						</span>
						<span class="reblog-source">@{reblog.source.handle}</span>
					</a>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Comment composer -->
	<form class="comment-composer card" onsubmit={handleComment}>
		{#if commentError}
			<div class="comment-error">{commentError}</div>
		{/if}
		<textarea
			class="input"
			placeholder="write a comment..."
			bind:value={commentText}
			rows="3"
			disabled={commenting}
		></textarea>
		<div class="comment-footer">
			<button type="submit" class="btn btn-primary" disabled={!commentText.trim() || commenting}>
				{commenting ? 'commenting...' : 'comment'}
			</button>
		</div>
	</form>

	<!-- Comments -->
	{#if data.comments && data.comments.length > 0}
		<div class="comments">
			<h2 class="section-title">comments</h2>
			<div class="comments-list card">
				{#each data.comments as comment (comment.uri)}
					<div class="comment-item">
						<div class="comment-header">
							<a href="/profile/{comment.author.handle}" class="comment-author">
								{#if comment.author.avatar}
									<img src={comment.author.avatar} alt="" class="avatar avatar-sm" />
								{:else}
									<div class="avatar avatar-sm avatar-placeholder">
										{(comment.author.displayName || comment.author.handle).charAt(0).toUpperCase()}
									</div>
								{/if}
								<span class="comment-author-name">{comment.author.displayName || comment.author.handle}</span>
								<span class="comment-author-handle">@{comment.author.handle}</span>
							</a>
						</div>
						<p class="comment-text"><RichTextRenderer text={comment.text} facets={comment.facets} /></p>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.thread-page {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.page-header {
		margin-bottom: 0.5rem;
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.875rem;
		color: var(--text-secondary);
		margin-bottom: 0.25rem;
	}

	.back-link:hover {
		color: var(--text-link);
	}

	.main-post {
		overflow: hidden;
	}

	.reblogs-list {
		display: flex;
		flex-direction: column;
	}

	.reblog-item {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		padding: 0.75rem 1rem;
		color: var(--text-primary);
		text-decoration: none;
		transition: background-color 0.15s ease;
	}

	.reblog-item:hover {
		background-color: var(--hover-bg);
	}

	/* No dividers requested */
	.reblog-item {
		border-bottom: none;
	}

	.reblog-avatar {
		width: 24px;
		height: 24px;
	}

	.avatar-xs {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		object-fit: cover;
	}

	.reblog-name {
		font-weight: 500;
		font-size: 0.9375rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.reblog-icon-wrapper {
		color: var(--text-secondary);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.reblog-source {
		font-size: 0.75rem;
		color: var(--text-secondary);
	}

	.comment-composer {
		padding: 1rem;
	}

	.comment-error {
		padding: 0.5rem 0.75rem;
		background-color: color-mix(in srgb, var(--danger) 10%, transparent);
		color: var(--danger);
		border-radius: var(--radius-sm);
		font-size: 0.8125rem;
		margin-bottom: 0.75rem;
	}

	.comment-footer {
		display: flex;
		justify-content: flex-end;
		margin-top: 0.5rem;
	}

	.section-title {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-primary);
		margin-bottom: 0.5rem;
	}

	.comments-list {
		overflow: hidden;
	}

	.comment-item {
		padding: 0.75rem 1rem;
	}

	.comment-item:not(:last-child) {
		border-bottom: 1px solid var(--border-light);
	}

	.comment-header {
		margin-bottom: 0.375rem;
	}

	.comment-author {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		color: var(--text-primary);
		text-decoration: none;
	}

	.comment-author:hover .comment-author-name {
		text-decoration: underline;
	}

	.comment-author-name {
		font-weight: 600;
		font-size: 0.875rem;
	}

	.comment-author-handle {
		font-size: 0.8125rem;
		color: var(--text-tertiary);
	}

	.comment-text {
		font-size: 0.9375rem;
		line-height: 1.5;
		white-space: pre-wrap;
		word-wrap: break-word;
		padding-left: 2.125rem;
	}
</style>

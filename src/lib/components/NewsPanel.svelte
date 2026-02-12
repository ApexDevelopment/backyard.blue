<script lang="ts">
	import type { NewsDocument } from '$lib/types.js';

	interface Props {
		news?: NewsDocument[];
	}

	let { news = [] }: Props = $props();

	function formatDate(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
</script>

<aside class="news-panel" aria-label="News">
	<h2 class="news-heading">news</h2>
	{#if news.length > 0}
		<ul class="news-list">
			{#each news as doc (doc.uri)}
				<li class="news-item">
					{#if doc.url}
						<a href={doc.url} class="news-link" target="_blank" rel="noopener noreferrer">
							<span class="news-title">{doc.title}</span>
							<time class="news-date" datetime={doc.publishedAt}>{formatDate(doc.publishedAt)}</time>
						</a>
					{:else}
						<div class="news-link">
							<span class="news-title">{doc.title}</span>
							<time class="news-date" datetime={doc.publishedAt}>{formatDate(doc.publishedAt)}</time>
						</div>
					{/if}
					{#if doc.description}
						<p class="news-description">{doc.description}</p>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<div class="card news-empty">
			<p>no news yet — check back later.</p>
		</div>
	{/if}
</aside>

<style>
	.news-panel {
		width: 17.5rem;
		flex-shrink: 0;
		z-index: 1;
		position: sticky;
		top: calc(var(--header-height) + 1rem);
		align-self: flex-start;
		justify-self: start;
	}

	.news-heading {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-tertiary);
		text-transform: lowercase;
		letter-spacing: 0.02em;
		margin-bottom: 0.5rem;
		padding: 0 0.25rem;
	}

	.news-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.news-item {
		padding: 0.625rem 0.75rem;
		border-radius: var(--radius-sm);
		transition: background-color 0.15s ease;
	}

	.news-item:hover {
		background-color: var(--bg-hover);
	}

	.news-link {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		text-decoration: none;
		color: inherit;
	}

	a.news-link:hover {
		text-decoration: none;
	}

	.news-title {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-primary);
		line-height: 1.3;
	}

	.news-date {
		font-size: 0.75rem;
		color: var(--text-tertiary);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.news-description {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		line-height: 1.4;
		margin-top: 0.25rem;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.news-empty {
		padding: 1rem;
		font-size: 0.875rem;
		color: var(--text-secondary);
	}

	@media (max-width: 1100px) {
		.news-panel {
			display: none;
		}
	}
</style>

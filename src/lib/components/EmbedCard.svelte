<script lang="ts">
	/**
	 * EmbedCard — renders an OpenGraph / Twitter Card link preview.
	 * Fetches metadata from /api/embed on mount, renders a compact card with
	 * optional image, title, description, and domain.
	 */
	import { untrack } from 'svelte';

	interface Props {
		url: string;
	}

	let { url }: Props = $props();

	interface OGData {
		url: string;
		title?: string;
		description?: string;
		image?: string;
		siteName?: string;
	}

	let data: OGData | null = $state(null);
	let loading = $state(true);
	let failed = $state(false);

	let domain = $derived(() => {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return url;
		}
	});

	$effect(() => {
		// Only depend on `url` — read it before doing anything else
		const target = url;
		let cancelled = false;

		untrack(() => {
			loading = true;
			failed = false;
			data = null;
		});

		fetch(`/api/embed?url=${encodeURIComponent(target)}`)
			.then((res) => {
				if (!res.ok) throw new Error();
				return res.json();
			})
			.then((d) => {
				if (!cancelled) {
					data = d as OGData;
					loading = false;
				}
			})
			.catch(() => {
				if (!cancelled) {
					failed = true;
					loading = false;
				}
			});

		return () => {
			cancelled = true;
		};
	});
</script>

{#if loading}
	<a href={url} class="embed-card embed-loading" target="_blank" rel="noopener noreferrer">
		<div class="embed-text">
			<span class="embed-domain">{domain()}</span>
		</div>
	</a>
{:else if data && !failed}
	<a href={url} class="embed-card" target="_blank" rel="noopener noreferrer">
		{#if data.image}
			<img src={data.image} alt="" class="embed-og-image" loading="lazy" />
		{/if}
		<div class="embed-text">
			{#if data.title}
				<span class="embed-title">{data.title}</span>
			{/if}
			{#if data.description}
				<span class="embed-description">{data.description}</span>
			{/if}
			<span class="embed-domain">{data.siteName || domain()}</span>
		</div>
	</a>
{/if}

<style>
	.embed-card {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border-color);
		border-radius: var(--radius-md);
		overflow: hidden;
		text-decoration: none;
		color: inherit;
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}

	.embed-card:hover {
		border-color: var(--accent);
		box-shadow: var(--shadow-sm);
		text-decoration: none;
	}

	.embed-og-image {
		width: 100%;
		max-height: 260px;
		object-fit: cover;
	}

	.embed-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.625rem 0.75rem;
	}

	.embed-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-primary);
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		line-height: 1.3;
	}

	.embed-description {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		line-height: 1.4;
	}

	.embed-domain {
		font-size: 0.75rem;
		color: var(--text-tertiary);
	}

	.embed-loading {
		min-height: 3rem;
	}

	.embed-loading .embed-text {
		justify-content: center;
	}
</style>

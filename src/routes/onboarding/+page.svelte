<script lang="ts">
	import type { PageData } from './$types.js';
	import { goto } from '$app/navigation';
	import { House, Download, Sparkles, SkipForward } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	let loading = $state('');
	let errorMsg = $state('');

	let bsky = $derived(data.blueskyProfile);
	let hasBskyProfile = $derived(!!(bsky?.displayName || bsky?.description || bsky?.avatarUrl));

	async function choose(choice: 'import' | 'fresh' | 'skip') {
		if (loading) return;

		// "Start fresh" now takes the user to the full profile creation form
		if (choice === 'fresh') {
			goto('/onboarding/create');
			return;
		}

		loading = choice;
		errorMsg = '';

		try {
			const res = await fetch('/api/onboarding', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ choice })
			});

			if (res.ok) {
				goto('/onboarding/follows');
			} else {
				const data = await res.json();
				errorMsg = data.error || 'something went wrong. please try again.';
			}
		} catch {
			errorMsg = 'network error. please try again.';
		} finally {
			loading = '';
		}
	}
</script>

<svelte:head>
	<title>set up your profile — backyard</title>
</svelte:head>

<div class="onboarding-page mobile-full-bleed">
	<div class="onboarding-card card mobile-unclamp">
		<div class="onboarding-header">
			<span class="logo"><House size={36} color="var(--accent)" strokeWidth={2} /></span>
			<h1>set up your profile</h1>
			<p class="subtitle">
				welcome to backyard! how would you like to set up your profile?
			</p>
		</div>

		{#if errorMsg}
			<div class="error-msg">
				{errorMsg}
			</div>
		{/if}

		<div class="choices">
			{#if hasBskyProfile}
				<button
					class="choice-card"
					class:selected={loading === 'import'}
					onclick={() => choose('import')}
					disabled={!!loading}
				>
					<div class="choice-icon import-icon">
						<Download size={22} />
					</div>
					<div class="choice-content">
						<h3>import from Bluesky</h3>
						<p>copy your current Bluesky display name, bio, avatar, and banner to your backyard profile.</p>
					</div>
					{#if bsky}
						<div class="bsky-preview">
							{#if bsky.avatarUrl}
								<img src={bsky.avatarUrl} alt="" class="preview-avatar" />
							{/if}
							<div class="preview-info">
								{#if bsky.displayName}
									<span class="preview-name">{bsky.displayName}</span>
								{/if}
								{#if bsky.description}
									<p class="preview-desc">{bsky.description}</p>
								{/if}
							</div>
						</div>
					{/if}
				</button>
			{/if}

			<button
				class="choice-card"
				class:selected={loading === 'fresh'}
				onclick={() => choose('fresh')}
				disabled={!!loading}
			>
				<div class="choice-icon fresh-icon">
					<Sparkles size={22} />
				</div>
				<div class="choice-content">
					<h3>start fresh</h3>
					<p>set up your backyard profile from scratch with your own display name, bio, and images.</p>
				</div>
			</button>

			<button
				class="choice-card"
				class:selected={loading === 'skip'}
				onclick={() => choose('skip')}
				disabled={!!loading}
			>
				<div class="choice-icon skip-icon">
					<SkipForward size={22} />
				</div>
				<div class="choice-content">
					<h3>skip for now</h3>
					<p>
						don't create a backyard profile yet. your profile page will show your
						Bluesky account info instead (if you have one).
					</p>
				</div>
			</button>
		</div>
	</div>
</div>

<style>
	.onboarding-page {
		display: flex;
		justify-content: center;
		align-items: flex-start;
		min-height: 60vh;
	}

	.onboarding-card {
		width: 100%;
		max-width: 480px;
		padding: 2rem;
	}

	.onboarding-header {
		text-align: center;
		margin-bottom: 1.5rem;
	}

	.onboarding-header h1 {
		font-size: 1.375rem;
		font-weight: 700;
		margin-top: 0.75rem;
		color: var(--text-primary);
	}

	.subtitle {
		font-size: 0.875rem;
		color: var(--text-secondary);
		margin-top: 0.375rem;
	}

	.error-msg {
		padding: 0.75rem;
		background-color: color-mix(in srgb, var(--danger) 10%, transparent);
		color: var(--danger);
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
		margin-bottom: 1rem;
	}

	.choices {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.choice-card {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 1rem;
		border: 2px solid var(--border-color);
		border-radius: var(--radius-md);
		background: var(--bg-card);
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
		color: var(--text-primary);
		width: 100%;
	}

	.choice-card:hover:not(:disabled) {
		border-color: var(--accent);
		background-color: var(--bg-hover);
	}

	.choice-card:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.choice-card.selected {
		border-color: var(--accent);
	}

	.choice-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: var(--radius-sm);
		flex-shrink: 0;
	}

	.import-icon {
		background-color: color-mix(in srgb, var(--accent) 12%, transparent);
		color: var(--accent);
	}

	.fresh-icon {
		background-color: color-mix(in srgb, var(--success) 12%, transparent);
		color: var(--success);
	}

	.skip-icon {
		background-color: color-mix(in srgb, var(--text-tertiary) 12%, transparent);
		color: var(--text-tertiary);
	}

	.choice-content {
		flex: 1;
		min-width: 0;
	}

	.choice-content h3 {
		font-size: 0.9375rem;
		font-weight: 600;
		margin-bottom: 0.25rem;
	}

	.choice-content p {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		line-height: 1.4;
	}

	.bsky-preview {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		width: 100%;
		padding: 0.625rem;
		background-color: var(--bg-secondary);
		border-radius: var(--radius-sm);
		margin-top: 0.25rem;
	}

	.preview-avatar {
		width: 2.5rem;
		height: 2.5rem;
		border-radius: var(--radius-full);
		object-fit: cover;
		flex-shrink: 0;
	}

	.preview-info {
		min-width: 0;
		flex: 1;
	}

	.preview-name {
		font-weight: 600;
		font-size: 0.875rem;
		display: block;
	}

	.preview-desc {
		font-size: 0.75rem;
		color: var(--text-tertiary);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		margin-top: 0.125rem;
	}
</style>

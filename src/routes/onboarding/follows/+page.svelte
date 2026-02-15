<script lang="ts">
	import { goto } from '$app/navigation';
	import { House, Download, SkipForward } from 'lucide-svelte';

	let loading = $state('');
	let errorMsg = $state('');
	let importResult = $state<{ imported: number; total: number } | null>(null);

	async function choose(choice: 'import' | 'skip') {
		if (loading) return;
		loading = choice;
		errorMsg = '';

		try {
			const res = await fetch('/api/onboarding/follows', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ choice })
			});

			if (res.ok) {
				if (choice === 'import') {
					const data = await res.json();
					importResult = { imported: data.imported, total: data.total };
					setTimeout(() => goto('/'), 1500);
				} else {
					goto('/');
				}
			} else {
				const data = await res.json();
				errorMsg = data.error || 'something went wrong. please try again.';
				loading = '';
			}
		} catch {
			errorMsg = 'network error. please try again.';
			loading = '';
		}
	}
</script>

<svelte:head>
	<title>import your follows — backyard</title>
</svelte:head>

<div class="onboarding-page">
	<div class="onboarding-card card">
		<div class="onboarding-header">
			<span class="logo"><House size={36} color="var(--accent)" strokeWidth={2} /></span>
			<h1>import your follows</h1>
			<p class="subtitle">
				would you like to bring your Bluesky follow list to backyard?
			</p>
		</div>

		{#if errorMsg}
			<div class="error-msg">
				{errorMsg}
			</div>
		{/if}

		{#if importResult}
			<div class="success-msg">
				imported {importResult.imported} of {importResult.total} follows. redirecting…
			</div>
		{:else}
			<div class="choices">
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
						<p>bring over everyone you follow on Bluesky so you can see their posts on backyard too.</p>
					</div>
					{#if loading === 'import'}
						<div class="import-progress">
							<div class="spinner"></div>
							<span>importing follows — this may take a moment…</span>
						</div>
					{/if}
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
						<p>start with a clean slate. you can always follow people later.</p>
					</div>
				</button>
			</div>
		{/if}
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

	.success-msg {
		padding: 0.75rem;
		background-color: color-mix(in srgb, var(--success) 10%, transparent);
		color: var(--success);
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
		text-align: center;
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

	.import-progress {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		width: 100%;
		padding: 0.625rem;
		background-color: var(--bg-secondary);
		border-radius: var(--radius-sm);
		margin-top: 0.25rem;
		font-size: 0.8125rem;
		color: var(--text-secondary);
	}

	.spinner {
		width: 1rem;
		height: 1rem;
		border: 2px solid var(--border-color);
		border-top-color: var(--accent);
		border-radius: var(--radius-full);
		animation: spin 0.6s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>

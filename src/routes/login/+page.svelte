<script lang="ts">
	import type { PageData } from './$types.js';
	import { House, XCircle } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	let handle = $state('');
	let loading = $state(false);
	let errorMsg = $state(data.error || '');

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!handle.trim() || loading) return;

		loading = true;
		errorMsg = '';

		try {
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ handle: handle.trim() })
			});

			if (res.ok) {
				const { url } = await res.json();
				window.location.href = url;
			} else {
				const data = await res.json();
				errorMsg = data.error || 'login failed. please try again.';
			}
		} catch {
			errorMsg = 'network error. please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>sign in — backyard</title>
</svelte:head>

<div class="login-page">
	<div class="login-card card">
		<div class="login-header">
			<span class="login-logo"><House size={40} color="var(--accent)" strokeWidth={2} /></span>
			<h1>welcome to backyard</h1>
			<p class="login-subtitle">sign in with your Bluesky/AT handle to get started.</p>
		</div>

		<form onsubmit={handleSubmit} class="login-form">
			{#if errorMsg}
				<div class="login-error">
					<XCircle size={16} />
					{errorMsg}
				</div>
			{/if}

			<div class="form-group">
				<label for="handle" class="form-label">your handle</label>
				<input
					id="handle"
					type="text"
					class="input"
					placeholder="alice.bsky.social"
					bind:value={handle}
					disabled={loading}
					autocomplete="username"
					autofocus
				/>
			</div>

			<button type="submit" class="btn btn-primary login-btn" disabled={!handle.trim() || loading}>
				{#if loading}
					<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span>
					signing in...
				{:else}
					sign in
				{/if}
			</button>
		</form>
	</div>
</div>

<style>
	.login-page {
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding-top: 4rem;
		min-height: 60vh;
	}

	.login-card {
		width: 100%;
		max-width: 400px;
		padding: 2rem;
	}

	.login-header {
		text-align: center;
		margin-bottom: 1.5rem;
	}

	.login-header h1 {
		font-size: 1.5rem;
		font-weight: 700;
		margin-top: 0.75rem;
		color: var(--text-primary);
	}

	.login-subtitle {
		font-size: 0.875rem;
		color: var(--text-secondary);
		margin-top: 0.375rem;
	}

	.login-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.login-error {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem;
		background-color: color-mix(in srgb, var(--danger) 10%, transparent);
		color: var(--danger);
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.form-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-primary);
	}

	.login-btn {
		width: 100%;
		padding: 0.625rem;
	}
</style>

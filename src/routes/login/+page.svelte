<script lang="ts">
	import type { PageData } from './$types.js';
	import { House, CircleX, Info, X } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	let handle = $state('');
	let loading = $state(false);
	/* svelte-ignore state_referenced_locally */
	let errorMsg = $state(data.error || '');
	let showHandleExplainer = $state(false);
	let agreedToTerms = $state(false);

	let signupsDisabled = $derived(data.signupMode === 'closed');
	let needsAgreement = $derived(data.hasTos || data.hasCommunityGuidelines);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!handle.trim() || loading || signupsDisabled) return;
		if (needsAgreement && !agreedToTerms) return;

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

<div class="auth-page">
	<div class="auth-card card">
		<div class="login-header">
			<span class="login-logo"><House size={40} color="var(--accent)" strokeWidth={2} /></span>
			<h1>welcome to the backyard</h1>
			{#if signupsDisabled}
				<p class="login-subtitle">signups are currently disabled.</p>
			{:else if data.signupMode === 'allowlist'}
				<p class="login-subtitle">this instance is invite-only. sign in if you're on the list.</p>
			{:else}
				<p class="login-subtitle">sign in with your Bluesky/AT handle to get started.</p>
			{/if}
		</div>

		{#if signupsDisabled}
			<div class="signup-notice">
				<div class="icon-wrapper">
					<Info size={20} />
				</div>
				<span>this instance is not accepting new accounts at this time.</span>
			</div>
		{:else}
			<form onsubmit={handleSubmit} class="login-form">
				{#if errorMsg}
					<div class="login-error">
						<div class="icon-wrapper">
							<CircleX size={20} />
						</div>
						<span>{errorMsg}</span>
					</div>
				{/if}

				{#if data.signupMode === 'allowlist'}
					<div class="signup-notice info">
						<div class="icon-wrapper">
							<Info size={20} />
						</div>
						<span>only allowlisted accounts can sign up. existing users can sign in normally.</span>
					</div>
				{/if}

				<div class="form-group">
					<label for="handle" class="form-label">
						your handle
						<button type="button" class="whats-this" onclick={() => showHandleExplainer = true}>(what's this?)</button>
					</label>
					<!-- svelte-ignore a11y_autofocus -->
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

				{#if needsAgreement}
					<label class="terms-checkbox">
						<input type="checkbox" bind:checked={agreedToTerms} />
						<span>
							I agree to the
							{#if data.hasTos}
								<a href="/terms_of_service" target="_blank">terms of service</a>
							{/if}
							{#if data.hasTos && data.hasCommunityGuidelines}
								and
							{/if}
							{#if data.hasCommunityGuidelines}
								<a href="/community_guidelines" target="_blank">community guidelines</a>
							{/if}
						</span>
					</label>
				{/if}

				<button type="submit" class="btn btn-primary login-btn" disabled={!handle.trim() || loading || (needsAgreement && !agreedToTerms)}>
					{#if loading}
						<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span>
						signing in...
					{:else}
						sign in
					{/if}
				</button>
			</form>

			<div class="create-account-link">
				<span>don't have an account?</span>
				<a href="/login/create">create one</a>
			</div>
		{/if}

		{#if data.hasTos || data.hasCommunityGuidelines}
			<div class="login-footer-links">
				{#if data.hasTos}
					<a href="/terms_of_service">terms of service</a>
				{/if}
				{#if data.hasCommunityGuidelines}
					<a href="/community_guidelines">community guidelines</a>
				{/if}
			</div>
		{/if}
	</div>
</div>

{#if showHandleExplainer}
	<div class="explainer-backdrop" onclick={() => showHandleExplainer = false} role="presentation">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="explainer-modal card" onclick={(e) => e.stopPropagation()}>
			<div class="explainer-header">
				<h2>what's a handle?</h2>
				<button class="btn btn-ghost" onclick={() => showHandleExplainer = false}>
					<X size={18} />
				</button>
			</div>
			<div class="explainer-body">
				<p>
					for most people, handles look like <strong>name.bsky.social</strong>.
				</p>
				<p>
					handles are part of the <strong>AT Protocol (atproto)</strong>, the same network that powers Bluesky.
					when you sign in, you're using your existing atproto account - you don't need to create a new one.
				</p>
				<p>
					your posts, profile, and data are stored on your <strong>personal data server (PDS)</strong>,
					not on backyard itself. this means you truly own your data, and you can take it with you
					if you ever want to move to a different service on the network.
				</p>
			</div>
		</div>
	</div>
{/if}

<style>


	.login-header {
		text-align: center;
		margin-bottom: 1.5rem;
	}

	.login-header h1 {
		font-size: 1.375rem;
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
		gap: 0.75rem;
		padding: 0.75rem;
		background-color: color-mix(in srgb, var(--danger) 10%, transparent);
		color: var(--danger);
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
		line-height: 1.4;
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
	}

	.login-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.create-account-link {
		display: flex;
		justify-content: center;
		gap: 0.375rem;
		margin-top: 0.5rem;
		font-size: 0.875rem;
		color: var(--text-secondary);
	}

	.create-account-link a {
		color: var(--text-link);
	}

	.create-account-link a:hover {
		color: var(--text-link-hover);
	}

	.signup-notice {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background-color: color-mix(in srgb, var(--warning) 10%, transparent);
		color: var(--text-secondary);
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
		line-height: 1.4;
	}

	.signup-notice.info {
		background-color: color-mix(in srgb, var(--accent) 8%, transparent);
		color: var(--text-secondary);
	}

	.icon-wrapper {
		display: flex;
		flex-shrink: 0;
	}

	.whats-this {
		background: none;
		border: none;
		padding: 0;
		font-size: 0.8125rem;
		color: var(--text-link);
		cursor: pointer;
		font-weight: 400;
		margin-left: 0.25rem;
	}

	.whats-this:hover {
		color: var(--text-link-hover);
		text-decoration: underline;
	}

	.terms-checkbox {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		font-size: 0.8125rem;
		color: var(--text-secondary);
		cursor: pointer;
		line-height: 1.4;
	}

	.terms-checkbox input[type='checkbox'] {
		margin-top: 0.15rem;
		flex-shrink: 0;
		accent-color: var(--accent);
	}

	.terms-checkbox a {
		color: var(--text-link);
	}

	.terms-checkbox a:hover {
		color: var(--text-link-hover);
	}

	.login-footer-links {
		display: flex;
		justify-content: center;
		gap: 1rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border-light);
	}

	.login-footer-links a {
		font-size: 0.8125rem;
		color: var(--text-tertiary);
	}

	.login-footer-links a:hover {
		color: var(--text-link);
	}

	.explainer-backdrop {
		position: fixed;
		inset: 0;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 300;
		padding: 1rem;
	}

	.explainer-modal {
		max-width: 28rem;
		width: 100%;
		padding: 1.5rem;
	}

	.explainer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	.explainer-header h2 {
		font-size: 1.0625rem;
		font-weight: 700;
		color: var(--text-primary);
	}

	.explainer-body {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		font-size: 0.875rem;
		color: var(--text-secondary);
		line-height: 1.5;
	}

</style>

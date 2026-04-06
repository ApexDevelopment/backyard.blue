<script lang="ts">
	import type { PageData } from './$types.js';
	import { House, CircleX, X, ChevronLeft, TriangleAlert, User, ExternalLink } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	let pds = $state('');
	let email = $state('');
	let handle = $state('');
	let password = $state('');
	let inviteCode = $state('');
	let loading = $state(false);
	let errorMsg = $state('');
	let showPdsExplainer = $state(false);
	let agreedToTerms = $state(false);
	let showAdvancedForm = $state(false);

	// PDS description state
	let pdsInfo = $state<{
		inviteCodeRequired?: boolean;
		phoneVerificationRequired?: boolean;
		availableUserDomains?: string[];
	} | null>(null);
	let pdsProbing = $state(false);
	let pdsError = $state('');
	let lastProbedPds = $state('');

	// Captcha state
	let showCaptcha = $state(false);
	let captchaStateParam = $state('');
	let verificationCode = $state('');

	let needsAgreement = $derived(data.hasTos || data.hasCommunityGuidelines);
	let needsCaptcha = $derived(pdsInfo?.phoneVerificationRequired === true);
	let captchaPdsAllowed = $derived(
		needsCaptcha && data.captchaPdsAllowlist.includes(pds.trim().toLowerCase())
	);
	let captchaPdsBlocked = $derived(needsCaptcha && !captchaPdsAllowed);
	let handleSuffix = $derived(
		pdsInfo?.availableUserDomains?.length
			? pdsInfo.availableUserDomains[0].replace(/^\./, '')
			: pds.trim() || 'your-pds.com'
	);
	let fullHandle = $derived(`${handle.trim() || 'yourname'}.${handleSuffix}`);
	let canSubmit = $derived(
		pds.trim() && email.trim() && handle.trim() && password.trim()
		&& !loading && !captchaPdsBlocked
		&& (!needsAgreement || agreedToTerms)
	);

	let captchaUrl = $derived.by(() => {
		if (!showCaptcha || !pds.trim()) return '';
		let raw = pds.trim();
		if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
		try {
			const url = new URL(raw);
			url.pathname = '/gate/signup';
			url.searchParams.set('handle', fullHandle);
			url.searchParams.set('state', captchaStateParam);
			url.searchParams.set('redirect_url', window.location.origin);
			return url.href;
		} catch {
			return '';
		}
	});

	function generateStateParam() {
		const arr = new Uint8Array(12);
		crypto.getRandomValues(arr);
		return Array.from(arr, b => b.toString(36).padStart(2, '0')).join('').slice(0, 15);
	}

	async function probePds() {
		const trimmed = pds.trim();
		if (!trimmed || trimmed === lastProbedPds) return;
		lastProbedPds = trimmed;
		pdsInfo = null;
		pdsError = '';
		pdsProbing = true;
		verificationCode = '';
		showCaptcha = false;

		try {
			const res = await fetch(`/api/auth/describe-server?pds=${encodeURIComponent(trimmed)}`);
			if (res.ok) {
				const info = await res.json();
				pdsInfo = info;
				// Auto-start captcha if this PDS requires it and is in the allowlist
				if (info?.phoneVerificationRequired && data.captchaPdsAllowlist.includes(trimmed.toLowerCase())) {
					startCaptcha();
				}
			} else {
				const err = await res.json().catch(() => null);
				pdsError = err?.error || 'could not reach this PDS.';
			}
		} catch {
			pdsError = 'could not reach this PDS.';
		} finally {
			pdsProbing = false;
		}
	}

	function startCaptcha() {
		captchaStateParam = generateStateParam();
		verificationCode = '';
		showCaptcha = true;
	}

	function handleCaptchaLoad(e: Event) {
		const iframe = e.target as HTMLIFrameElement;
		try {
			const href = iframe?.contentWindow?.location.href;
			if (!href) return;
			const url = new URL(href);
			if (url.host !== window.location.host) return;
			const code = url.searchParams.get('code');
			const state = url.searchParams.get('state');
			if (state !== captchaStateParam || !code) return;
			verificationCode = code;
			showCaptcha = false;
		} catch {
			// Cross-origin - expected during captcha flow, silently ignore
		}
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!canSubmit) return;

		loading = true;
		errorMsg = '';

		try {
			const res = await fetch('/api/auth/create-account', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					pds: pds.trim(),
					email: email.trim(),
					handle: handle.trim(),
					password,
					inviteCode: inviteCode.trim() || undefined,
					verificationCode: verificationCode || undefined
				})
			});

			const result = await res.json();

			if (res.ok && result.url) {
				window.location.href = result.url;
			} else if (!res.ok) {
				errorMsg = result.error || 'account creation failed. please try again.';
			}
		} catch {
			errorMsg = 'network error. please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>create account — backyard</title>
</svelte:head>

<div class="auth-page">
	<div class="auth-card card">
		<div class="create-header">
			<span class="create-logo"><House size={40} color="var(--accent)" strokeWidth={2} /></span>
			<h1>create an account</h1>
			<p class="create-subtitle">
				you'll need an atproto account to use backyard.
			</p>
		</div>

		{#if !showAdvancedForm}
			<div class="create-choices">
				<a href="https://bsky.app" target="_blank" rel="noopener noreferrer" class="btn btn-primary create-bsky-btn">
					create account on Bluesky
					<ExternalLink size={16} />
				</a>
				<button type="button" class="btn btn-secondary create-advanced-btn" onclick={() => showAdvancedForm = true}>
					use a different PDS
				</button>
			</div>

			<div class="create-footer">
				<a href="/login"><ChevronLeft size={14} /> already have an account? sign in</a>
			</div>
		{:else}

		<form onsubmit={handleSubmit} class="create-form">
			{#if errorMsg}
				<div class="create-error">
					<div class="icon-wrapper">
						<CircleX size={20} />
					</div>
					<span>{errorMsg}</span>
				</div>
			{/if}

			<div class="form-group">
				<label for="pds" class="form-label">
					your PDS
					<button type="button" class="whats-this" onclick={() => showPdsExplainer = true}>(what's this?)</button>
				</label>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					id="pds"
					type="text"
					class="input"
					placeholder="your-pds.com"
					bind:value={pds}
					disabled={loading}
					autofocus
					onblur={probePds}
				/>
				{#if pdsProbing}
					<span class="form-hint">checking PDS...</span>
				{:else if pdsError}
					<span class="form-hint form-hint-error">{pdsError}</span>
				{/if}
			</div>

			{#if captchaPdsBlocked}
				<div class="verification-notice">
					<div class="icon-wrapper">
						<TriangleAlert size={20} />
					</div>
					<span>
						this PDS requires verification that isn't supported here.
						please create your account through <a href="https://bsky.app" target="_blank" rel="noopener noreferrer">Bluesky</a>,
						then <a href="/login">sign in</a>.
					</span>
				</div>
			{:else if captchaPdsAllowed && verificationCode}
				<div class="verification-success">
					<span>verification complete!</span>
				</div>
			{/if}

			<div class="form-group">
				<label for="email" class="form-label">email</label>
				<input
					id="email"
					type="email"
					class="input"
					placeholder="you@example.com"
					bind:value={email}
					disabled={loading}
					autocomplete="email"
				/>
			</div>

			<div class="form-group">
				<label for="handle" class="form-label">handle</label>
				<input
					id="handle"
					type="text"
					class="input"
					placeholder="yourname"
					bind:value={handle}
					disabled={loading}
					autocomplete="username"
				/>
				<span class="form-hint">your handle will be <strong>{handle.trim() || 'yourname'}.{handleSuffix}</strong></span>
			</div>

			<div class="form-group">
				<label for="password" class="form-label">password</label>
				<input
					id="password"
					type="password"
					class="input"
					bind:value={password}
					disabled={loading}
					autocomplete="new-password"
				/>
			</div>

			{#if !pdsInfo || pdsInfo.inviteCodeRequired}
				<div class="form-group">
					<label for="invite-code" class="form-label">
						invite code
						{#if pdsInfo?.inviteCodeRequired}
							<span class="form-label-required">(required)</span>
						{:else}
							<span class="form-label-optional">(if required by the PDS)</span>
						{/if}
					</label>
					<input
						id="invite-code"
						type="text"
						class="input"
						bind:value={inviteCode}
						disabled={loading}
					/>
				</div>
			{/if}

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

			{#if showCaptcha && captchaUrl}
				<div class="captcha-container">
					<p class="captcha-label">complete verification to continue:</p>
					<!-- svelte-ignore a11y_missing_attribute -->
					<iframe
						src={captchaUrl}
						class="captcha-iframe"
						title="captcha verification"
						onload={handleCaptchaLoad}
						sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
					></iframe>
					<button type="button" class="btn btn-secondary captcha-retry" onclick={startCaptcha}>
						retry verification
					</button>
				</div>
			{/if}

			<button type="submit" class="btn btn-primary create-btn" disabled={!canSubmit}>
				{#if loading}
					<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span>
					creating account...
				{:else}
					create account
				{/if}
			</button>
		</form>

		<div class="create-footer">
			<a href="/login"><ChevronLeft size={14} /> already have an account? sign in</a>
		</div>

		{/if}
	</div>
</div>

{#if showPdsExplainer}
	<div class="explainer-backdrop" onclick={() => showPdsExplainer = false} role="presentation">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="explainer-modal card" onclick={(e) => e.stopPropagation()}>
			<div class="explainer-header">
				<h2>what's a PDS?</h2>
				<button class="btn btn-ghost" onclick={() => showPdsExplainer = false}>
					<X size={18} />
				</button>
			</div>
			<div class="explainer-body">
				<p>
					a <strong>PDS (personal data server)</strong> is where your account and data live.
					think of it like choosing an email provider. your posts, profile, and social connections
					are stored on your PDS, and you can move to a different one any time.
				</p>
				<p>
					no matter which PDS you choose, you can interact with everyone on the AT Protocol
					network, including people on other PDSes.
				</p>
				<p>
					many PDSes do not allow signups from third-party apps like backyard, so if you're unable to sign up
					with your chosen PDS here, please do so through <a href="https://bsky.app" target="_blank" rel="noopener noreferrer">Bluesky</a>, then use that account to sign in to backyard.
				</p>
				<p>
					<strong>TL;DR:</strong> if you're not sure, creating an account on <a href="https://bsky.social" target="_blank">Bluesky</a>
					is a good default. once you've done that, you can use it to sign in to backyard.
				</p>
			</div>
		</div>
	</div>
{/if}

<style>


	.create-header {
		text-align: center;
		margin-bottom: 1.5rem;
	}

	.create-header h1 {
		font-size: 1.375rem;
		font-weight: 700;
		margin-top: 0.75rem;
		color: var(--text-primary);
	}

	.create-subtitle {
		font-size: 0.875rem;
		color: var(--text-secondary);
		margin-top: 0.375rem;
	}

	.create-choices {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.create-bsky-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
	}

	.create-advanced-btn {
		width: 100%;
	}

	.create-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.create-error {
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

	.form-label-optional {
		font-weight: 400;
		color: var(--text-tertiary);
		font-size: 0.8125rem;
	}

	.form-label-required {
		font-weight: 400;
		color: var(--danger);
		font-size: 0.8125rem;
	}

	.form-hint {
		font-size: 0.75rem;
		color: var(--text-tertiary);
		line-height: 1.4;
	}

	.form-hint-error {
		color: var(--danger);
	}

	.verification-notice {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.75rem;
		background-color: color-mix(in srgb, var(--warning) 10%, transparent);
		color: var(--text-secondary);
		border-radius: var(--radius-sm);
		font-size: 0.8125rem;
		line-height: 1.4;
	}

	.verification-notice a {
		color: var(--text-link);
	}

	.verification-notice a:hover {
		color: var(--text-link-hover);
	}

	.verification-success {
		padding: 0.5rem 0.75rem;
		background-color: color-mix(in srgb, var(--success, #22c55e) 10%, transparent);
		color: var(--success, #22c55e);
		border-radius: var(--radius-sm);
		font-size: 0.8125rem;
		font-weight: 500;
		text-align: center;
	}

	.captcha-container {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.captcha-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-primary);
	}

	.captcha-iframe {
		width: 100%;
		min-height: 500px;
		border: 1px solid var(--border-color);
		border-radius: var(--radius-sm);
		background-color: var(--bg-secondary);
	}

	.captcha-retry {
		align-self: flex-start;
		font-size: 0.8125rem;
	}

	.create-btn {
		width: 100%;
	}

	.create-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.create-footer {
		margin-top: 1.25rem;
		text-align: center;
	}

	.create-footer a {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.875rem;
		color: var(--text-secondary);
	}

	.create-footer a:hover {
		color: var(--text-link);
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

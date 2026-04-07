<script lang="ts">
	import { X, Shield, UserCheck, UserX, FileExclamationPoint, ListPlus } from 'lucide-svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	/* ── Shared state ─────────────────────────────────── */

	let feedback = $state('');
	let feedbackType: 'success' | 'error' = $state('success');

	function showFeedback(msg: string, type: 'success' | 'error' = 'success') {
		feedback = msg;
		feedbackType = type;
		setTimeout(() => { if (feedback === msg) feedback = ''; }, 4000);
	}

	async function apiFetch(url: string, opts: RequestInit = {}): Promise<any> {
		const res = await fetch(url, {
			headers: { 'Content-Type': 'application/json', ...opts.headers as Record<string, string> },
			...opts
		});
		const json = await res.json();
		if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
		return json;
	}

	/* ── Ban ──────────────────────────────────────────── */

	let banDid = $state('');
	let banReason = $state('');
	let banLoading = $state(false);
	let banCheckDid = $state('');
	let banCheckResult: { banned: boolean; reason?: string; bannedBy?: string; bannedAt?: string } | null = $state(null);

	async function checkBan() {
		if (!banCheckDid.trim()) return;
		banLoading = true;
		try {
			banCheckResult = await apiFetch(`/api/admin/ban?did=${encodeURIComponent(banCheckDid.trim())}`);
		} catch (e: any) {
			showFeedback(e.message, 'error');
		} finally {
			banLoading = false;
		}
	}

	async function banUser() {
		if (!banDid.trim()) return;
		banLoading = true;
		try {
			await apiFetch('/api/admin/ban', {
				method: 'POST',
				body: JSON.stringify({ did: banDid.trim(), reason: banReason.trim() || undefined })
			});
			showFeedback(`banned ${banDid.trim()}`);
			banDid = '';
			banReason = '';
		} catch (e: any) {
			showFeedback(e.message, 'error');
		} finally {
			banLoading = false;
		}
	}

	async function unbanUser() {
		if (!banCheckDid.trim()) return;
		banLoading = true;
		try {
			await apiFetch('/api/admin/ban', {
				method: 'DELETE',
				body: JSON.stringify({ did: banCheckDid.trim() })
			});
			showFeedback(`unbanned ${banCheckDid.trim()}`);
			banCheckResult = null;
		} catch (e: any) {
			showFeedback(e.message, 'error');
		} finally {
			banLoading = false;
		}
	}

	/* ── Trust ────────────────────────────────────────── */

	let trustDid = $state('');
	let trustLoading = $state(false);
	let trustResult: any = $state(null);

	async function checkTrust() {
		if (!trustDid.trim()) return;
		trustLoading = true;
		try {
			trustResult = await apiFetch(`/api/admin/trust?did=${encodeURIComponent(trustDid.trim())}`);
		} catch (e: any) {
			showFeedback(e.message, 'error');
		} finally {
			trustLoading = false;
		}
	}

	async function approveTrust() {
		if (!trustDid.trim()) return;
		trustLoading = true;
		try {
			await apiFetch('/api/admin/trust', {
				method: 'POST',
				body: JSON.stringify({ did: trustDid.trim() })
			});
			showFeedback(`approved ${trustDid.trim()}`);
			await checkTrust();
		} catch (e: any) {
			showFeedback(e.message, 'error');
		} finally {
			trustLoading = false;
		}
	}

	async function revokeTrust() {
		if (!trustDid.trim()) return;
		trustLoading = true;
		try {
			await apiFetch('/api/admin/trust', {
				method: 'DELETE',
				body: JSON.stringify({ did: trustDid.trim() })
			});
			showFeedback(`revoked approval for ${trustDid.trim()}`);
			await checkTrust();
		} catch (e: any) {
			showFeedback(e.message, 'error');
		} finally {
			trustLoading = false;
		}
	}

	/* ── Delete post ──────────────────────────────────── */

	let deleteUri = $state('');
	let deleteReason = $state('');
	let deleteLoading = $state(false);
	let pendingDeletions: any[] = $state([]);

	async function loadPendingDeletions() {
		deleteLoading = true;
		try {
			const data = await apiFetch('/api/admin/delete-post');
			pendingDeletions = data.items || [];
		} catch (e: any) {
			showFeedback(e.message, 'error');
		} finally {
			deleteLoading = false;
		}
	}

	async function queueDeletion() {
		if (!deleteUri.trim()) return;
		deleteLoading = true;
		try {
			await apiFetch('/api/admin/delete-post', {
				method: 'POST',
				body: JSON.stringify({ uri: deleteUri.trim(), reason: deleteReason.trim() || undefined })
			});
			showFeedback('post queued for deletion');
			deleteUri = '';
			deleteReason = '';
			await loadPendingDeletions();
		} catch (e: any) {
			showFeedback(e.message, 'error');
		} finally {
			deleteLoading = false;
		}
	}

	async function cancelDeletion(uri: string) {
		deleteLoading = true;
		try {
			await apiFetch('/api/admin/delete-post', {
				method: 'DELETE',
				body: JSON.stringify({ uri })
			});
			showFeedback('deletion cancelled');
			await loadPendingDeletions();
		} catch (e: any) {
			showFeedback(e.message, 'error');
		} finally {
			deleteLoading = false;
		}
	}

	/* ── Allowlist ────────────────────────────────────── */

	let allowIdentifier = $state('');
	let allowNote = $state('');
	let allowLoading = $state(false);
	let allowEntries: { identifier: string; note: string | null; addedAt: string }[] = $state([]);

	async function loadAllowlist() {
		allowLoading = true;
		try {
			const data = await apiFetch('/api/admin/allowlist');
			allowEntries = data.entries || [];
		} catch (e: any) {
			showFeedback(e.message, 'error');
		} finally {
			allowLoading = false;
		}
	}

	async function addToAllowlist() {
		if (!allowIdentifier.trim()) return;
		allowLoading = true;
		try {
			const result = await apiFetch('/api/admin/allowlist', {
				method: 'POST',
				body: JSON.stringify({ identifier: allowIdentifier.trim(), note: allowNote.trim() || undefined })
			});
			showFeedback(`added ${result.did} to allowlist`);
			allowIdentifier = '';
			allowNote = '';
			await loadAllowlist();
		} catch (e: any) {
			showFeedback(e.message, 'error');
		} finally {
			allowLoading = false;
		}
	}

	async function removeFromAllowlist(identifier: string) {
		allowLoading = true;
		try {
			await apiFetch('/api/admin/allowlist', {
				method: 'DELETE',
				body: JSON.stringify({ identifier })
			});
			showFeedback(`removed ${identifier} from allowlist`);
			await loadAllowlist();
		} catch (e: any) {
			showFeedback(e.message, 'error');
		} finally {
			allowLoading = false;
		}
	}
</script>

<svelte:head>
	<title>admin — backyard</title>
</svelte:head>

<div class="admin-page">
	<h1><Shield size={20} /> admin</h1>

	{#if feedback}
		<div class="admin-feedback" class:error={feedbackType === 'error'}>
			{feedback}
		</div>
	{/if}

	<!-- Ban management -->
	<section class="admin-section card">
		<h2><UserX size={14} /> bans</h2>

		<div class="admin-form">
			<h3>check ban status</h3>
			<div class="admin-form-row">
				<input class="input" type="text" placeholder="did:plc:..." bind:value={banCheckDid} />
				<button class="btn btn-secondary" onclick={checkBan} disabled={banLoading || !banCheckDid.trim()}>
					check
				</button>
			</div>

			{#if banCheckResult}
				<div class="admin-result">
					{#if banCheckResult.banned}
						<p class="result-status result-banned">banned</p>
						{#if banCheckResult.reason}<p class="result-detail">reason: {banCheckResult.reason}</p>{/if}
						{#if banCheckResult.bannedAt}<p class="result-detail">at: {new Date(banCheckResult.bannedAt).toLocaleString()}</p>{/if}
						<button class="btn btn-secondary" onclick={unbanUser} disabled={banLoading}>unban</button>
					{:else}
						<p class="result-status result-ok">not banned</p>
					{/if}
				</div>
			{/if}
		</div>

		<div class="admin-form">
			<h3>ban a user</h3>
			<div class="admin-form-row">
				<input class="input" type="text" placeholder="did:plc:..." bind:value={banDid} />
			</div>
			<div class="admin-form-row">
				<input class="input" type="text" placeholder="reason (optional)" bind:value={banReason} />
				<button class="btn btn-danger" onclick={banUser} disabled={banLoading || !banDid.trim()}>
					ban
				</button>
			</div>
		</div>
	</section>

	<!-- Trust / media approval -->
	<section class="admin-section card">
		<h2><UserCheck size={14} /> trust</h2>

		<div class="admin-form">
			<div class="admin-form-row">
				<input class="input" type="text" placeholder="did:plc:..." bind:value={trustDid} />
				<button class="btn btn-secondary" onclick={checkTrust} disabled={trustLoading || !trustDid.trim()}>
					check
				</button>
			</div>

			{#if trustResult}
				<div class="admin-result">
					<p class="result-detail">trusted: {trustResult.trusted ? 'yes' : 'no'}</p>
					{#if trustResult.manualApproval !== undefined}
						<p class="result-detail">manual approval: {trustResult.manualApproval ? 'yes' : 'no'}</p>
					{/if}
					{#if trustResult.reason}
						<p class="result-detail">reason: {trustResult.reason}</p>
					{/if}
					<div class="admin-form-row">
						<button class="btn btn-primary" onclick={approveTrust} disabled={trustLoading}>approve</button>
						<button class="btn btn-danger" onclick={revokeTrust} disabled={trustLoading}>revoke</button>
					</div>
				</div>
			{/if}
		</div>
	</section>

	<!-- Pending deletions -->
	<section class="admin-section card">
		<h2><FileExclamationPoint size={14} /> pending deletions</h2>

		<div class="admin-form">
			<h3>queue a post for deletion</h3>
			<div class="admin-form-row">
				<input class="input" type="text" placeholder="at://did:plc:.../blue.backyard.feed.post/..." bind:value={deleteUri} />
			</div>
			<div class="admin-form-row">
				<input class="input" type="text" placeholder="reason (optional)" bind:value={deleteReason} />
				<button class="btn btn-danger" onclick={queueDeletion} disabled={deleteLoading || !deleteUri.trim()}>
					queue
				</button>
			</div>
		</div>

		<div class="admin-list-header">
			<h3>pending ({pendingDeletions.length})</h3>
			<button class="btn btn-ghost" onclick={loadPendingDeletions} disabled={deleteLoading}>
				{deleteLoading ? 'loading...' : 'refresh'}
			</button>
		</div>

		{#if pendingDeletions.length > 0}
			<ul class="admin-list">
				{#each pendingDeletions as item (item.id)}
					<li class="admin-list-item">
						<div class="list-item-info">
							<span class="list-item-primary">{item.uri}</span>
							{#if item.reason}<span class="list-item-secondary">reason: {item.reason}</span>{/if}
							<span class="list-item-secondary">by {item.queued_by} · {new Date(item.created_at).toLocaleString()}</span>
						</div>
						<button class="btn btn-ghost list-item-remove" onclick={() => cancelDeletion(item.uri)} disabled={deleteLoading} aria-label="cancel deletion">
							<X size={14} />
						</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="admin-empty">no pending deletions.</p>
		{/if}
	</section>

	<!-- Allowlist -->
	<section class="admin-section card">
		<h2><ListPlus size={14} /> allowlist <span class="section-badge">{data.signupMode}</span></h2>

		<div class="admin-form">
			<h3>add to allowlist</h3>
			<div class="admin-form-row">
				<input class="input" type="text" placeholder="DID or handle (resolved to DID)" bind:value={allowIdentifier} />
			</div>
			<div class="admin-form-row">
				<input class="input" type="text" placeholder="note (optional)" bind:value={allowNote} />
				<button class="btn btn-primary" onclick={addToAllowlist} disabled={allowLoading || !allowIdentifier.trim()}>
					add
				</button>
			</div>
		</div>

		<div class="admin-list-header">
			<h3>entries ({allowEntries.length})</h3>
			<button class="btn btn-ghost" onclick={loadAllowlist} disabled={allowLoading}>
				{allowLoading ? 'loading...' : 'refresh'}
			</button>
		</div>

		{#if allowEntries.length > 0}
			<ul class="admin-list">
				{#each allowEntries as entry (entry.identifier)}
					<li class="admin-list-item">
						<div class="list-item-info">
							<span class="list-item-primary">{entry.identifier}</span>
							{#if entry.note}<span class="list-item-secondary">{entry.note}</span>{/if}
							<span class="list-item-secondary">{new Date(entry.addedAt).toLocaleString()}</span>
						</div>
						<button class="btn btn-ghost list-item-remove" onclick={() => removeFromAllowlist(entry.identifier)} disabled={allowLoading} aria-label="remove from allowlist">
							<X size={14} />
						</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="admin-empty">allowlist is empty.</p>
		{/if}
	</section>
</div>

<style>
	.admin-page {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding-bottom: 2rem;
	}

	.admin-page h1 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text-primary);
	}

	.admin-feedback {
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-sm, 6px);
		font-size: 0.8125rem;
		font-weight: 500;
		background-color: color-mix(in srgb, var(--accent) 12%, transparent);
		color: var(--accent);
	}

	.admin-feedback.error {
		background-color: color-mix(in srgb, var(--danger) 12%, transparent);
		color: var(--danger);
	}

	.admin-section {
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.admin-section h2 {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8125rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--text-tertiary);
		margin-bottom: 0.25rem;
	}

	.admin-section h3 {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.section-badge {
		font-weight: 500;
		font-size: 0.6875rem;
		padding: 0.125rem 0.375rem;
		border-radius: var(--radius-sm, 4px);
		background-color: var(--bg-hover);
		color: var(--text-secondary);
		letter-spacing: 0;
	}

	.admin-form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.admin-form + .admin-form {
		border-top: 1px solid var(--border-light);
		padding-top: 1rem;
	}

	.admin-form-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.admin-form-row .input {
		flex: 1;
		min-width: 0;
	}

	.admin-result {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding: 0.625rem 0.75rem;
		border-radius: var(--radius-sm, 6px);
		background-color: var(--bg-hover);
	}

	.result-status {
		font-weight: 600;
		font-size: 0.875rem;
	}

	.result-banned {
		color: var(--danger);
	}

	.result-ok {
		color: var(--accent);
	}

	.result-detail {
		font-size: 0.8125rem;
		color: var(--text-secondary);
	}

	.admin-list-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-top: 1px solid var(--border-light);
		padding-top: 1rem;
	}

	.admin-list {
		display: flex;
		flex-direction: column;
	}

	.admin-list-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.5rem 0;
		border-top: 1px solid var(--border-light);
	}

	.list-item-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.list-item-primary {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text-primary);
		word-break: break-all;
	}

	.list-item-secondary {
		font-size: 0.75rem;
		color: var(--text-tertiary);
	}

	.list-item-remove {
		flex-shrink: 0;
		padding: 0.25rem;
		color: var(--text-tertiary);
	}

	.list-item-remove:hover {
		color: var(--danger);
	}

	.admin-empty {
		font-size: 0.8125rem;
		color: var(--text-tertiary);
	}

	@media (max-width: 640px) {
		.admin-form-row {
			flex-direction: column;
			align-items: stretch;
		}

		.admin-form-row .btn {
			align-self: flex-end;
		}
	}
</style>

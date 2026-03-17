<script lang="ts">
	import { Trash2, ShieldAlert } from 'lucide-svelte';
	import type { BackyardPost } from '$lib/types.js';
	import PostCard from './PostCard.svelte';

	interface Violation {
		id: number;
		uri: string;
		reason: string | null;
		created_at: string;
		post?: BackyardPost;
	}

	let violations = $state<Violation[]>([]);
	let loading = $state(true);
	let deletingUri = $state<string | null>(null);

	async function loadViolations() {
		try {
			const res = await fetch('/api/activity/violations');
			if (res.ok) {
				const data = await res.json();
				violations = data.items;
			}
		} finally {
			loading = false;
		}
	}

	async function deletePost(uri: string) {
		if (deletingUri) return;
		deletingUri = uri;
		try {
			const res = await fetch('/api/post', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ uri })
			});
			if (res.ok) {
				violations = violations.filter((v) => v.uri !== uri);
				if (violations.length === 0) {
					window.location.reload();
				}
			}
		} finally {
			deletingUri = null;
		}
	}

	loadViolations();
</script>

<div class="violation-backdrop">
	<div class="violation-modal card">
		<div class="violation-header">
			<ShieldAlert size={24} />
			<h2>post violations</h2>
		</div>

		<p class="violation-message">
			one or more of your posts have been flagged as violating site rules.
			you must delete them before you can continue using backyard.
		</p>

		{#if loading}
			<p class="violation-loading">loading…</p>
		{:else if violations.length === 0}
			<p class="violation-loading">no pending violations found.</p>
		{:else}
			<div class="violation-list">
				{#each violations as violation (violation.id)}
					<div class="violation-item">
						{#if violation.reason}
							<p class="violation-reason">reason: {violation.reason}</p>
						{/if}
						{#if violation.post}
							<div class="violation-post">
								<PostCard post={violation.post} showActions={false} compact />
							</div>
						{:else}
							<p class="violation-missing">this post could not be loaded.</p>
						{/if}
						<button
							class="btn btn-danger violation-delete-btn"
							onclick={() => deletePost(violation.uri)}
							disabled={deletingUri === violation.uri}
						>
							<Trash2 size={14} />
							{deletingUri === violation.uri ? 'deleting…' : 'delete this post'}
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.violation-backdrop {
		position: fixed;
		inset: 0;
		z-index: 400;
		background-color: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.violation-modal {
		width: 100%;
		max-width: 36rem;
		max-height: 85vh;
		overflow-y: auto;
		padding: 1.5rem;
	}

	.violation-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--danger);
		margin-bottom: 0.75rem;
	}

	.violation-header h2 {
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
	}

	.violation-message {
		font-size: 0.875rem;
		color: var(--text-secondary);
		line-height: 1.5;
		margin-bottom: 1rem;
	}

	.violation-loading {
		font-size: 0.875rem;
		color: var(--text-tertiary);
		text-align: center;
		padding: 1rem 0;
	}

	.violation-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.violation-item {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem;
		background-color: var(--bg-secondary);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-light);
	}

	.violation-reason {
		font-size: 0.8125rem;
		color: var(--text-tertiary);
		font-style: italic;
	}

	.violation-post {
		border-radius: var(--radius-md);
		overflow: hidden;
		border: 1px solid var(--border-light);
	}

	.violation-missing {
		font-size: 0.8125rem;
		color: var(--text-tertiary);
		font-style: italic;
		padding: 0.5rem 0;
	}

	.violation-delete-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		align-self: flex-end;
	}
</style>

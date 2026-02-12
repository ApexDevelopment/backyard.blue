<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { RefreshCw } from 'lucide-svelte';

	const THRESHOLD = 80;
	const MAX_PULL = 130;
	const RESISTANCE = 0.45;

	let pullDistance = $state(0);
	let refreshing = $state(false);
	let startY = 0;
	let tracking = false;

	function isAtTop(): boolean {
		return window.scrollY <= 0;
	}

	function onTouchStart(e: TouchEvent) {
		if (refreshing || !isAtTop()) return;
		startY = e.touches[0].clientY;
		tracking = true;
	}

	function onTouchMove(e: TouchEvent) {
		if (!tracking || refreshing) return;

		const currentY = e.touches[0].clientY;
		const delta = currentY - startY;

		if (delta <= 0 || !isAtTop()) {
			pullDistance = 0;
			return;
		}

		pullDistance = Math.min(delta * RESISTANCE, MAX_PULL);
	}

	async function onTouchEnd() {
		if (!tracking) return;
		tracking = false;

		if (pullDistance >= THRESHOLD && !refreshing) {
			refreshing = true;
			pullDistance = THRESHOLD * 0.6;
			try {
				await invalidateAll();
			} finally {
				refreshing = false;
				pullDistance = 0;
			}
		} else {
			pullDistance = 0;
		}
	}

	let progress = $derived(Math.min(pullDistance / THRESHOLD, 1));
	let triggered = $derived(pullDistance >= THRESHOLD);
</script>

<svelte:window
	ontouchstart={onTouchStart}
	ontouchmove={onTouchMove}
	ontouchend={onTouchEnd}
/>

{#if pullDistance > 0 || refreshing}
	<div
		class="ptr-indicator"
		style="transform: translateY({pullDistance}px)"
	>
		<div
			class="ptr-icon"
			class:ptr-triggered={triggered}
			class:ptr-refreshing={refreshing}
			style="opacity: {progress}; transform: rotate({progress * 270}deg)"
		>
			<RefreshCw size={20} />
		</div>
	</div>
{/if}

<style>
	.ptr-indicator {
		position: fixed;
		top: var(--header-height, 60px);
		left: 0;
		right: 0;
		display: flex;
		justify-content: center;
		z-index: 50;
		pointer-events: none;
		transition: transform 0.15s ease;
	}

	.ptr-icon {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-full);
		background-color: var(--bg-card);
		color: var(--text-secondary);
		box-shadow: var(--shadow-md);
		transition: color 0.15s ease;
	}

	.ptr-triggered {
		color: var(--accent);
	}

	.ptr-refreshing {
		animation: ptr-spin 0.8s linear infinite;
	}

	@keyframes ptr-spin {
		to { transform: rotate(360deg); }
	}
</style>

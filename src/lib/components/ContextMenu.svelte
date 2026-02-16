<script lang="ts">
	import { Ellipsis } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		/** Alignment of the dropdown relative to the trigger */
		align?: 'left' | 'right';
		/** Callback when the menu is opened */
		onopen?: () => void;
	}

	let { children, align = 'right', onopen }: Props = $props();

	let open = $state(false);

	function toggle() {
		open = !open;
		if (open) onopen?.();
	}

	function close() {
		open = false;
	}

	function onWindowClick(e: MouseEvent) {
		if (open && e.target instanceof Element && !e.target.closest('.context-menu')) {
			open = false;
		}
	}
</script>

<svelte:window onclick={onWindowClick} />

<div class="context-menu">
	<button class="context-trigger" onclick={toggle} aria-label="more options" aria-expanded={open}>
		<Ellipsis size={16} />
	</button>

	{#if open}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="context-dropdown" class:align-left={align === 'left'} onclick={close} onkeydown={() => {}}>
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.context-menu {
		position: relative;
	}

	.context-trigger {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-full);
		color: var(--text-tertiary);
		background: none;
		border: none;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.context-trigger:hover {
		background-color: var(--bg-hover);
		color: var(--text-secondary);
	}

	.context-dropdown {
		position: absolute;
		top: calc(100% + 0.25rem);
		right: 0;
		width: 200px;
		background-color: var(--bg-card);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		padding: 0.375rem;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		z-index: 50;
		animation: contextFadeIn 0.1s ease-out;
		transform-origin: top right;
	}

	.context-dropdown.align-left {
		right: auto;
		left: 0;
		transform-origin: top left;
	}

	@keyframes contextFadeIn {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	/* Menu item styles — consumed by slotted content via global class */
	.context-dropdown :global(.context-item) {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 0.75rem;
		border-radius: var(--radius-sm);
		color: var(--text-primary);
		font-size: 0.875rem;
		text-decoration: none;
		transition: background-color 0.15s ease;
		text-align: left;
		width: 100%;
		font-weight: 500;
		background: none;
		border: none;
		cursor: pointer;
	}

	.context-dropdown :global(.context-item:hover) {
		background-color: var(--bg-hover);
		text-decoration: none;
		color: var(--text-primary);
	}

	.context-dropdown :global(.context-item-danger) {
		color: var(--danger);
	}

	.context-dropdown :global(.context-item-danger:hover) {
		color: var(--danger);
	}
</style>

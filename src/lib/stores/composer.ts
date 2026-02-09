import { writable } from 'svelte/store';
import type { BackyardChainEntry } from '$lib/types.js';

export interface ComposerState {
	open: boolean;
	mode: 'post' | 'reblog';
	/** When mode === 'reblog', the subject to reblog */
	reblogSubject?: {
		uri: string;
		cid: string;
		/** Existing chain (original post + previous additions) to display in the composer */
		chain?: BackyardChainEntry[];
	};
}

export const composer = writable<ComposerState>({ open: false, mode: 'post' });

export function openComposer() {
	composer.set({ open: true, mode: 'post' });
}

export function openReblogComposer(uri: string, cid: string, chain?: BackyardChainEntry[]) {
	composer.set({
		open: true,
		mode: 'reblog',
		reblogSubject: { uri, cid, chain }
	});
}

export function closeComposer() {
	composer.set({ open: false, mode: 'post' });
}

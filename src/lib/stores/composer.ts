import { writable } from 'svelte/store';
import type { BackyardChainEntry, BackyardMedia, Facet } from '$lib/types.js';

export interface ComposerState {
	open: boolean;
	mode: 'post' | 'reblog' | 'edit';
	/** When mode === 'reblog', the subject to reblog */
	reblogSubject?: {
		uri: string;
		cid: string;
		/** Existing chain (original post + previous additions) to display in the composer */
		chain?: BackyardChainEntry[];
	};
	/** When mode === 'edit', the record being edited */
	editSubject?: {
		uri: string;
		cid: string;
		/** 'post' or 'reblog' — determines which API endpoint to call */
		collection: 'post' | 'reblog';
		text: string;
		facets?: Facet[];
		tags?: string[];
		media?: BackyardMedia[];
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

export function openEditComposer(params: {
	uri: string;
	cid: string;
	collection: 'post' | 'reblog';
	text: string;
	facets?: Facet[];
	tags?: string[];
	media?: BackyardMedia[];
}) {
	composer.set({
		open: true,
		mode: 'edit',
		editSubject: params
	});
}

export function closeComposer() {
	composer.set({ open: false, mode: 'post' });
}

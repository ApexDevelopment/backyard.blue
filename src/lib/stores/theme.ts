import { writable } from 'svelte/store';
import type { Theme } from '$lib/types.js';

function createThemeStore() {
	const { subscribe, set, update } = writable<Theme>('light');

	return {
		subscribe,
		set,
		toggle: () => {
			update((current) => {
				const next = current === 'light' ? 'dark' : 'light';
				// Persist to cookie
				if (typeof document !== 'undefined') {
					document.cookie = `backyard_theme=${next};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
					document.documentElement.setAttribute('data-theme', next);
				}
				return next;
			});
		},
		initialize: (value: Theme) => {
			set(value);
			if (typeof document !== 'undefined') {
				document.documentElement.setAttribute('data-theme', value);
			}
		}
	};
}

export const theme = createThemeStore();

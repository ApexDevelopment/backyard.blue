import { writable, derived } from 'svelte/store';
import type { Theme, ThemeMode, ColorScheme } from '$lib/types.js';

/** Available color schemes with display metadata. */
export const COLOR_SCHEMES: { id: ColorScheme; label: string; description: string }[] = [
	{ id: 'chocoberry', label: 'Chocoberry', description: 'Warm chocolate and berry tones' },
	{ id: 'potpourri', label: 'Potpourri', description: 'Cool slate and lavender' }
];

const DEFAULT_SCHEME: ColorScheme = 'chocoberry';
const DEFAULT_THEME: Theme = 'chocoberry-light';

/** Parse a compound theme string into its scheme + mode parts. */
export function parseTheme(raw: string): { scheme: ColorScheme; mode: ThemeMode } {
	// Backward compat: bare "light" / "dark" → "chocoberry-light" / "chocoberry-dark"
	if (raw === 'light' || raw === 'dark') {
		return { scheme: DEFAULT_SCHEME, mode: raw };
	}
	const idx = raw.lastIndexOf('-');
	if (idx > 0) {
		const mode = raw.slice(idx + 1);
		if (mode === 'light' || mode === 'dark') {
			return { scheme: raw.slice(0, idx) as ColorScheme, mode };
		}
	}
	return { scheme: DEFAULT_SCHEME, mode: 'light' };
}

function applyTheme(value: Theme) {
	if (typeof document !== 'undefined') {
		document.cookie = `backyard_theme=${value};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
		document.documentElement.setAttribute('data-theme', value);
	}
}

function createThemeStore() {
	const { subscribe, set, update } = writable<Theme>(DEFAULT_THEME);

	return {
		subscribe,
		set,
		/** Toggle between light and dark within the current color scheme. */
		toggle: () => {
			update((current) => {
				const { scheme, mode } = parseTheme(current);
				const next: Theme = `${scheme}-${mode === 'light' ? 'dark' : 'light'}`;
				applyTheme(next);
				return next;
			});
		},
		/** Switch to a different color scheme, keeping the current mode. */
		setScheme: (scheme: ColorScheme) => {
			update((current) => {
				const { mode } = parseTheme(current);
				const next: Theme = `${scheme}-${mode}`;
				applyTheme(next);
				return next;
			});
		},
		initialize: (value: string) => {
			const { scheme, mode } = parseTheme(value);
			const normalized: Theme = `${scheme}-${mode}`;
			set(normalized);
			applyTheme(normalized);
		}
	};
}

export const theme = createThemeStore();

/** Derived store exposing just the current mode ('light' | 'dark'). */
export const themeMode = derived(theme, ($t) => parseTheme($t).mode);

/** Derived store exposing just the current color scheme name. */
export const themeScheme = derived(theme, ($t) => parseTheme($t).scheme);

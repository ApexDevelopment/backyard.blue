import { writable } from 'svelte/store';

function applyPreferenceCookie(name: string, value: string) {
	if (typeof document !== 'undefined') {
		document.cookie = `${name}=${value};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
	}
}

function createFancyProfilesStore() {
	const { subscribe, set, update } = writable(true);

	return {
		subscribe,
		toggle: () => {
			update((current) => {
				const next = !current;
				applyPreferenceCookie('backyard_fancy_profiles', next ? '1' : '0');
				return next;
			});
		},
		initialize: (value: boolean) => {
			set(value);
		}
	};
}

/** Whether to show banner-derived gradient backgrounds on profile pages. */
export const fancyProfiles = createFancyProfilesStore();

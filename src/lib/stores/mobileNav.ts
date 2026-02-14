import { writable } from 'svelte/store';

/** Whether the mobile navigation drawer is open. */
export const mobileNavOpen = writable(false);

export function openMobileNav() {
	mobileNavOpen.set(true);
}

export function closeMobileNav() {
	mobileNavOpen.set(false);
}

export function toggleMobileNav() {
	mobileNavOpen.update((v) => !v);
}

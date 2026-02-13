import type { LayoutServerLoad } from './$types.js';
import { ensureProfile } from '$lib/server/identity.js';
import { getNewsDocuments } from '$lib/server/news.js';
import type { BackyardProfile } from '$lib/types.js';
import type { NewsDocument } from '$lib/types.js';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	const rawTheme = cookies.get('backyard_theme') || 'chocoberry-light';
	const theme = rawTheme === 'light' ? 'chocoberry-light' : rawTheme === 'dark' ? 'chocoberry-dark' : rawTheme;

	let user: BackyardProfile | null = null;

	if (locals.did) {
		try {
			user = await ensureProfile(locals.did);
		} catch (err) {
			console.error('Failed to load user profile:', err);
		}
	}

	const news: NewsDocument[] = await getNewsDocuments();

	return { user, theme, news };
};

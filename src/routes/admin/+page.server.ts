import { redirect } from '@sveltejs/kit';
import { catalogFromPlatform } from '#lib/server/catalog';
import { MAX_SUGGESTIONS } from '#lib/server/catalog/suggestions';
import { ownerToken } from '#lib/server/owner';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, cookies }) => {
	const catalog = catalogFromPlatform(platform);
	const token = ownerToken(cookies);
	if (token === '' || !(await catalog.verifyToken(token))) redirect(303, '/');
	const [progress, failing, suggestions, discarded] = await Promise.all([
		catalog.coverCheckProgress(token),
		catalog.listFailingCovers(token),
		catalog.listSuggestions(token),
		catalog.listDiscarded(token)
	]);
	return { progress, failing, suggestions, discarded, maxSuggestions: MAX_SUGGESTIONS };
};

import { redirect } from '@sveltejs/kit';
import { catalogFromPlatform } from '#lib/server/catalog';
import { ownerToken } from '#lib/server/owner';
import { ownerActions } from '#lib/server/owner-actions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, cookies }) => {
	const catalog = catalogFromPlatform(platform);
	const token = ownerToken(cookies);
	if (token === '' || !(await catalog.verifyToken(token))) redirect(303, '/');
	const [progress, unmatched] = await Promise.all([catalog.importProgress(token), catalog.listUnmatchedAlbums(token)]);
	return { progress, unmatched };
};

export const actions: Actions = { saveYears: ownerActions.saveYears };

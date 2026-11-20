import { redirect } from '@sveltejs/kit';
import { catalogFromPlatform } from '#lib/server/catalog';
import { ownerToken } from '#lib/server/owner';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, cookies }) => {
	const catalog = catalogFromPlatform(platform);
	const token = ownerToken(cookies);
	if (token === '' || !(await catalog.verifyToken(token))) redirect(303, '/');
	const [progress, failing] = await Promise.all([
		catalog.coverCheckProgress(token),
		catalog.listFailingCovers(token)
	]);
	return { progress, failing };
};

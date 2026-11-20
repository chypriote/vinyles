import { catalogFromPlatform } from '#lib/server/catalog';
import { ownerToken } from '#lib/server/owner';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ platform, cookies }) => {
	const token = ownerToken(cookies);
	const isOwner = token !== '' && (await catalogFromPlatform(platform).verifyToken(token));
	return { isOwner };
};

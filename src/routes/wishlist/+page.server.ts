import { catalogFromPlatform } from '#lib/server/catalog';
import { withCoverUrls } from '#lib/covers';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const { items, count } = await catalogFromPlatform(platform).listWishlist();
	return { items: withCoverUrls(items), count };
};

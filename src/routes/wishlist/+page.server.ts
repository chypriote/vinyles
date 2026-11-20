import { catalogFromPlatform } from '#lib/server/catalog';
import { withCoverUrls } from '#lib/covers';
import { ownerActions } from '#lib/server/owner-actions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const { items, count } = await catalogFromPlatform(platform).listWishlist({ sort: 'desire' });
	return { items: withCoverUrls(items), count };
};

export const actions: Actions = {
	addWishlistItem: ownerActions.addWishlistItem,
	editWishlistItem: ownerActions.editWishlistItem,
	gotIt: ownerActions.gotIt,
	drop: ownerActions.drop,
	setDesire: ownerActions.setDesire
};

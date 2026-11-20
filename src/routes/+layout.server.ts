import { catalogFromPlatform } from '#lib/server/catalog';
import { ownerToken } from '#lib/server/owner';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ platform, cookies }) => {
	const catalog = catalogFromPlatform(platform);
	const token = ownerToken(cookies);
	const isOwner = token !== '' && (await catalog.verifyToken(token));
	// Only the Owner's forms need the Artists (suggestions) and the Stores.
	const [artists, stores] = isOwner
		? await Promise.all([catalog.listArtists(), catalog.listStores()])
		: [[], []];
	return { isOwner, artists, stores };
};

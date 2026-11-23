import { json } from '@sveltejs/kit';
import { catalogFromPlatform } from '#lib/server/catalog';
import type { Desire, WishlistSortKey } from '#lib/server/catalog';
import { withCoverUrls } from '#lib/covers';
import type { RequestHandler } from './$types';

const SORTS: WishlistSortKey[] = ['desire', 'artist', 'album', 'year', 'added'];

/** Filtered and sorted Wishlist Items: the Catalog applies the rules, this only reads the query. */
export const GET: RequestHandler = async ({ url, platform }) => {
	const sort = url.searchParams.get('sort') as WishlistSortKey;
	const direction = url.searchParams.get('direction');
	const desires = (url.searchParams.get('desires') ?? '')
		.split(',')
		.map(Number)
		.filter((n): n is Desire => Number.isInteger(n) && n >= 1 && n <= 5);
	const { items } = await catalogFromPlatform(platform).listWishlist({
		search: url.searchParams.get('search') ?? undefined,
		artists: url.searchParams.getAll('artist'),
		desires,
		sort: SORTS.includes(sort) ? sort : undefined,
		direction: direction === 'asc' || direction === 'desc' ? direction : undefined
	});
	return json({ items: withCoverUrls(items) });
};

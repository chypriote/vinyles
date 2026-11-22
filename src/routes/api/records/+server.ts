import { json } from '@sveltejs/kit';
import { catalogFromPlatform } from '#lib/server/catalog';
import type { RecordSortKey } from '#lib/server/catalog';
import { withCoverUrls } from '#lib/covers';
import type { RequestHandler } from './$types';

const SORTS: RecordSortKey[] = ['artist', 'album', 'year', 'acquired'];

/** Filtered and sorted Records: the Catalog applies the rules, this only reads the query. */
export const GET: RequestHandler = async ({ url, platform }) => {
	const sort = url.searchParams.get('sort') as RecordSortKey;
	const direction = url.searchParams.get('direction');
	const { records } = await catalogFromPlatform(platform).listRecords({
		search: url.searchParams.get('search') ?? undefined,
		artists: url.searchParams.getAll('artist'),
		sort: SORTS.includes(sort) ? sort : undefined,
		direction: direction === 'asc' || direction === 'desc' ? direction : undefined
	});
	return json({ records: withCoverUrls(records) });
};

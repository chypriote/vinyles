import { json } from '@sveltejs/kit';
import { catalogFromPlatform } from '#lib/server/catalog';
import type { RecordSortKey } from '#lib/server/catalog';
import { withCoverUrls } from '#lib/covers';
import type { RequestHandler } from './$types';

const SORTS: RecordSortKey[] = ['artist', 'album', 'year', 'acquired'];

/** Filtered and sorted Records: the Catalog applies the rules, this only reads the query. */
export const GET: RequestHandler = async ({ url, platform }) => {
	const sort = url.searchParams.get('sort') as RecordSortKey;
	const { records } = await catalogFromPlatform(platform).listRecords({
		search: url.searchParams.get('search') ?? undefined,
		artist: url.searchParams.get('artist') ?? undefined,
		sort: SORTS.includes(sort) ? sort : undefined
	});
	return json({ records: withCoverUrls(records) });
};

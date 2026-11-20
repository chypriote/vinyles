import { catalogFromPlatform } from '#lib/server/catalog';
import { withCoverUrls } from '#lib/covers';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const { records, totals } = await catalogFromPlatform(platform).listRecords();
	return { records: withCoverUrls(records), totals };
};

import { catalogFromPlatform } from '#lib/server/catalog';
import { withCoverUrls } from '#lib/covers';
import { ownerActions } from '#lib/server/owner-actions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const { records, totals } = await catalogFromPlatform(platform).listRecords();
	return { records: withCoverUrls(records), totals };
};

export const actions: Actions = {
	addRecord: ownerActions.addRecord,
	editRecord: ownerActions.editRecord,
	deleteRecord: ownerActions.deleteRecord
};

import { json } from '@sveltejs/kit';
import { catalogFromPlatform } from '#lib/server/catalog';
import type { LookupBatchInput } from '#lib/server/catalog';
import { ownerToken } from '#lib/server/owner';
import { endpointError } from '#lib/server/owner-actions';
import type { RequestHandler } from './$types';

/** Small batches: the subrequest limit and MusicBrainz's one request per second. */
const BATCH_SIZE = 5;

/**
 * One lookup batch per request. The caller repeats it until `done` reaches `total`.
 * Optional JSON body: `rerun`, `replace` (needs `rerun`) and `after` (the `after` of the previous batch).
 */
export const POST: RequestHandler = async ({ request, platform, cookies }) => {
	try {
		const body = (await request.json().catch(() => ({}))) as Partial<LookupBatchInput>;
		return json(
			await catalogFromPlatform(platform).lookupNext(ownerToken(cookies), {
				size: BATCH_SIZE,
				rerun: body.rerun,
				replace: body.replace,
				after: body.after
			})
		);
	} catch (error) {
		return endpointError(error);
	}
};

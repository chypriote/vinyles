import { json } from '@sveltejs/kit';
import { catalogFromPlatform } from '#lib/server/catalog';
import { ownerToken } from '#lib/server/owner';
import { endpointError } from '#lib/server/owner-actions';
import type { RequestHandler } from './$types';

/** Each check reads one R2 object: keep a batch under the subrequest limit of the Free plan. */
const BATCH_SIZE = 20;

/** Checks one batch of Covers. The caller repeats it until `pending` is 0. */
export const POST: RequestHandler = async ({ platform, cookies }) => {
	try {
		return json(
			await catalogFromPlatform(platform).checkCovers(ownerToken(cookies), { size: BATCH_SIZE })
		);
	} catch (error) {
		return endpointError(error);
	}
};

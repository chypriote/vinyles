import { json } from '@sveltejs/kit';
import { catalogFromPlatform } from '#lib/server/catalog';
import { ownerToken } from '#lib/server/owner';
import { endpointError } from '#lib/server/owner-actions';
import type { RequestHandler } from './$types';

/** Small batches: the subrequest limit and MusicBrainz's one request per second. */
const BATCH_SIZE = 5;

/** One lookup batch per request. The page calls it until `done` reaches `total`. */
export const POST: RequestHandler = async ({ platform, cookies }) => {
	try {
		return json(
			await catalogFromPlatform(platform).lookupNext(ownerToken(cookies), { size: BATCH_SIZE })
		);
	} catch (error) {
		return endpointError(error);
	}
};

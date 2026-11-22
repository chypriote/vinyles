import { json } from '@sveltejs/kit';
import { catalogFromPlatform } from '#lib/server/catalog';
import { ownerToken } from '#lib/server/owner';
import { endpointError } from '#lib/server/owner-actions';
import type { RequestHandler } from './$types';

/** Each seed Artist reads MusicBrainz once (1 request per second): keep a batch short. */
const BATCH_SIZE = 5;

/** Searches one batch of seed Artists. The caller repeats it with `next` until `next` is null. */
export const POST: RequestHandler = async ({ request, platform, cookies }) => {
	try {
		const { cursor } = (await request.json().catch(() => ({}))) as { cursor?: number };
		return json(
			await catalogFromPlatform(platform).findSuggestions(ownerToken(cookies), {
				size: BATCH_SIZE,
				cursor
			})
		);
	} catch (error) {
		return endpointError(error);
	}
};

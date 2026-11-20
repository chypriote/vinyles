import { json } from '@sveltejs/kit';
import { catalogFromPlatform } from '#lib/server/catalog';
import type { ImportRowsInput } from '#lib/server/catalog';
import { ownerToken } from '#lib/server/owner';
import { endpointError } from '#lib/server/owner-actions';
import type { RequestHandler } from './$types';

/** Takes the cleaned sheet rows as JSON ({ collection, wishlist }). Owner cookie required. */
export const POST: RequestHandler = async ({ request, platform, cookies }) => {
	try {
		const input = (await request.json()) as ImportRowsInput;
		return json(await catalogFromPlatform(platform).importRows(ownerToken(cookies), input));
	} catch (error) {
		return endpointError(error);
	}
};

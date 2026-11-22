import { json } from '@sveltejs/kit';
import { catalogFromPlatform } from '#lib/server/catalog';
import { ownerToken } from '#lib/server/owner';
import { endpointError } from '#lib/server/owner-actions';
import type { RequestHandler } from './$types';

/** The quality check of the image in the request body: `reason` is null when it passes. */
export const POST: RequestHandler = async ({ request, platform, cookies }) => {
	try {
		return json(
			await catalogFromPlatform(platform).rateCoverUpload(ownerToken(cookies), {
				body: await request.arrayBuffer(),
				contentType: request.headers.get('content-type') ?? ''
			})
		);
	} catch (error) {
		return endpointError(error);
	}
};

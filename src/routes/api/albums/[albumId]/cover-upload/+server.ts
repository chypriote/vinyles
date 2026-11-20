import { json } from '@sveltejs/kit';
import { catalogFromPlatform } from '#lib/server/catalog';
import { ownerToken } from '#lib/server/owner';
import { endpointError } from '#lib/server/owner-actions';
import type { RequestHandler } from './$types';

/** Uses the image in the request body as the Cover of an Album. The Catalog checks token, type and size. */
export const POST: RequestHandler = async ({ params, request, platform, cookies }) => {
	try {
		await catalogFromPlatform(platform).uploadCover(ownerToken(cookies), {
			albumId: Number(params.albumId),
			body: await request.arrayBuffer(),
			contentType: request.headers.get('content-type') ?? ''
		});
		return json({ ok: true });
	} catch (error) {
		return endpointError(error);
	}
};

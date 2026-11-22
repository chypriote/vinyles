import { json } from '@sveltejs/kit';
import { catalogFromPlatform } from '#lib/server/catalog';
import { ownerToken } from '#lib/server/owner';
import { endpointError } from '#lib/server/owner-actions';
import type { RequestHandler } from './$types';

/** The quality check of the image at `url`: `reason` is null when it passes. */
export const POST: RequestHandler = async ({ request, platform, cookies }) => {
	try {
		const { url } = (await request.json()) as { url?: string };
		return json(
			await catalogFromPlatform(platform).rateCoverUrl(ownerToken(cookies), {
				url: String(url ?? '')
			})
		);
	} catch (error) {
		return endpointError(error);
	}
};

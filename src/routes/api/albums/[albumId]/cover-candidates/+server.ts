import { json } from '@sveltejs/kit';
import { catalogFromPlatform } from '#lib/server/catalog';
import { ownerToken } from '#lib/server/owner';
import { endpointError } from '#lib/server/owner-actions';
import type { RequestHandler } from './$types';

/** Candidate Covers of an Album, loaded when the Owner opens "Change cover", or found by the text in `q`. */
export const GET: RequestHandler = async ({ params, url, platform, cookies }) => {
	try {
		const catalog = catalogFromPlatform(platform);
		const query = url.searchParams.get('q');
		const candidates =
			query === null
				? await catalog.listCoverCandidates(ownerToken(cookies), Number(params.albumId))
				: await catalog.searchCoverCandidates(ownerToken(cookies), query);
		return json({ candidates });
	} catch (error) {
		return endpointError(error);
	}
};

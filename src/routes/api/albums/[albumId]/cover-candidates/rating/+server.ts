import { json } from '@sveltejs/kit';
import { catalogFromPlatform } from '#lib/server/catalog';
import type { PickCoverInput } from '#lib/server/catalog';
import { ownerToken } from '#lib/server/owner';
import { endpointError } from '#lib/server/owner-actions';
import type { RequestHandler } from './$types';

/** The quality check of one candidate image: `reason` is null when it passes. */
export const GET: RequestHandler = async ({ url, platform, cookies }) => {
	try {
		const rating = await catalogFromPlatform(platform).rateCoverCandidate(ownerToken(cookies), {
			candidateId: url.searchParams.get('id') ?? '',
			source: url.searchParams.get('source') as PickCoverInput['source']
		});
		return json(rating);
	} catch (error) {
		return endpointError(error);
	}
};

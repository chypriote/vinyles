import { json } from '@sveltejs/kit';
import { catalogFromPlatform } from '#lib/server/catalog';
import type { PickCoverInput } from '#lib/server/catalog';
import { ownerToken } from '#lib/server/owner';
import { endpointError } from '#lib/server/owner-actions';
import type { RequestHandler } from './$types';

/** Replaces the Cover of an Album with a candidate. The Catalog checks the Owner token. */
export const POST: RequestHandler = async ({ params, request, platform, cookies }) => {
	try {
		const { candidateId, source } = (await request.json()) as Pick<
			PickCoverInput,
			'candidateId' | 'source'
		>;
		await catalogFromPlatform(platform).pickCover(ownerToken(cookies), {
			albumId: Number(params.albumId),
			candidateId: String(candidateId ?? ''),
			source
		});
		return json({ ok: true });
	} catch (error) {
		return endpointError(error);
	}
};

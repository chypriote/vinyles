import { json } from '@sveltejs/kit';
import { catalogFromPlatform, type Desire } from '#lib/server/catalog';
import { ownerToken } from '#lib/server/owner';
import { endpointError } from '#lib/server/owner-actions';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, platform, cookies }) => {
	try {
		const { desire } = (await request.json().catch(() => ({}))) as { desire?: Desire };
		await catalogFromPlatform(platform).addSuggestion(
			ownerToken(cookies),
			Number(params.id),
			desire as Desire
		);
		return json({ ok: true });
	} catch (error) {
		return endpointError(error);
	}
};

import { json } from '@sveltejs/kit';
import { catalogFromPlatform } from '#lib/server/catalog';
import { ownerToken } from '#lib/server/owner';
import { endpointError } from '#lib/server/owner-actions';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, platform, cookies }) => {
	try {
		const { enabled } = (await request.json()) as { enabled?: unknown };
		if (typeof enabled !== 'boolean')
			return json({ error: 'enabled must be true or false' }, { status: 400 });
		await catalogFromPlatform(platform).setStoreProductLinksEnabled(
			ownerToken(cookies),
			Number(params.id),
			enabled
		);
		return json({ ok: true });
	} catch (error) {
		return endpointError(error);
	}
};

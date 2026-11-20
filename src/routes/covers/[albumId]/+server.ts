import { error } from '@sveltejs/kit';
import { catalogFromPlatform } from '#lib/server/catalog';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, platform }) => {
	const cover = await catalogFromPlatform(platform).getCover(Number(params.albumId));
	if (!cover) error(404, 'No cover');
	return new Response(cover.body, {
		headers: {
			'content-type': cover.contentType,
			'cache-control': 'public, max-age=604800'
		}
	});
};

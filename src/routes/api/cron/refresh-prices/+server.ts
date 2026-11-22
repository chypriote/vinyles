import { json } from '@sveltejs/kit';
import { catalogFromPlatform } from '#lib/server/catalog';
import type { RequestHandler } from './$types';

/** Items per run: each costs about 7 requests, and the free plan allows 50 per run. */
const BATCH = 5;
const REFRESH_EVERY_DAYS = 14;

/** Called by the schedule (see `scripts/add-cron-handler.mjs`) with `CRON_SECRET` as bearer. */
export const POST: RequestHandler = async ({ request, platform }) => {
	const catalog = catalogFromPlatform(platform);
	const bearer = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
	if (!(await catalog.verifyCronSecret(bearer))) {
		return json({ error: 'Not allowed' }, { status: 401 });
	}
	const result = await catalog.refreshOldest({
		size: BATCH,
		olderThanDays: REFRESH_EVERY_DAYS
	});
	return json(result);
};

import { fail, type RequestEvent } from '@sveltejs/kit';
import { catalogFromPlatform, UnauthorizedError } from '#lib/server/catalog';
import type {
	AddRecordInput,
	AddWishlistItemInput,
	Catalog,
	Desire,
	EditRecordInput,
	EditWishlistItemInput,
	GotItInput,
	SaveYearsInput,
	SetProductLinkInput
} from '#lib/server/catalog';
import { ownerToken } from '#lib/server/owner';

/**
 * Thin form actions over the Catalog. The forms send one JSON `payload` field.
 * Each action passes the Owner cookie token, so a write without login is refused by the Catalog.
 */
async function run<T>(
	event: RequestEvent,
	work: (catalog: Catalog, token: string, payload: T) => Promise<Record<string, unknown> | void>
) {
	let payload: T;
	try {
		payload = JSON.parse(String((await event.request.formData()).get('payload') ?? ''));
	} catch {
		return fail(400, { error: 'Unreadable form' });
	}
	try {
		const extra = await work(
			catalogFromPlatform(event.platform),
			ownerToken(event.cookies),
			payload
		);
		return { ok: true, ...extra };
	} catch (error) {
		if (error instanceof UnauthorizedError) return fail(401, { error: 'Please log in again' });
		if (error instanceof Error) return fail(400, { error: error.message });
		throw error;
	}
}

export const ownerActions = {
	addRecord: (event: RequestEvent) =>
		run<AddRecordInput>(event, async (catalog, token, input) => {
			await catalog.addRecord(token, input);
		}),
	editRecord: (event: RequestEvent) =>
		run<EditRecordInput>(event, async (catalog, token, input) => {
			await catalog.editRecord(token, input);
		}),
	deleteRecord: (event: RequestEvent) =>
		run<{ id: number }>(event, async (catalog, token, { id }) => {
			await catalog.deleteRecord(token, id);
		}),
	addWishlistItem: (event: RequestEvent) =>
		run<AddWishlistItemInput>(event, async (catalog, token, input) => {
			const result = await catalog.addWishlistItem(token, input);
			return { alreadyOwned: result.status === 'already-owned' };
		}),
	editWishlistItem: (event: RequestEvent) =>
		run<EditWishlistItemInput>(event, async (catalog, token, input) => {
			const result = await catalog.editWishlistItem(token, input);
			return { alreadyOwned: result.status === 'already-owned' };
		}),
	gotIt: (event: RequestEvent) =>
		run<GotItInput>(event, async (catalog, token, input) => {
			await catalog.gotIt(token, input);
		}),
	discard: (event: RequestEvent) =>
		run<{ id: number }>(event, async (catalog, token, { id }) => {
			await catalog.discard(token, id);
		}),
	refreshPrices: (event: RequestEvent) =>
		run<{ id: number }>(event, async (catalog, token, { id }) => {
			await catalog.refreshPrices(token, id);
		}),
	setProductLink: (event: RequestEvent) =>
		run<SetProductLinkInput>(event, async (catalog, token, input) => {
			await catalog.setProductLink(token, input);
		}),
	removeProductLink: (event: RequestEvent) =>
		run<{ wishlistItemId: number; storeId: number }>(event, async (catalog, token, input) => {
			await catalog.removeProductLink(token, input);
		}),
	setDesire: (event: RequestEvent) =>
		run<{ ids: number[]; desire: Desire }>(event, async (catalog, token, { ids, desire }) => {
			await catalog.setDesire(token, ids, desire);
		}),
	saveYears: (event: RequestEvent) =>
		run<SaveYearsInput>(event, async (catalog, token, input) => {
			await catalog.saveYears(token, input);
		})
};

/** Maps an Owner-only endpoint failure to a response. */
export function endpointError(error: unknown): Response {
	if (error instanceof UnauthorizedError)
		return Response.json({ error: 'Owner login required' }, { status: 401 });
	if (error instanceof Error) return Response.json({ error: error.message }, { status: 400 });
	throw error;
}

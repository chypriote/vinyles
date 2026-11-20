import { deserialize } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import type { AcquisitionInput, Store } from '#lib/server/catalog/types';
import { eurosToCents } from '#lib/money';

export type Outcome = { ok: true; alreadyOwned: boolean } | { ok: false; error: string };

/** Posts one JSON payload to a form action of the current page and reloads the page data on success. */
export async function postAction(action: string, payload: unknown): Promise<Outcome> {
	const body = new FormData();
	body.set('payload', JSON.stringify(payload));
	try {
		const response = await fetch(action, { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
		const result = deserialize(await response.text());
		if (result.type === 'success') {
			const alreadyOwned = result.data?.alreadyOwned === true;
			if (!alreadyOwned) await invalidateAll();
			return { ok: true, alreadyOwned };
		}
		const message = result.type === 'failure' ? result.data?.error : undefined;
		return { ok: false, error: typeof message === 'string' ? message : 'Something went wrong' };
	} catch {
		return { ok: false, error: 'Network error' };
	}
}

/** Adds a Store at once and returns it. */
export async function addStore(name: string): Promise<Store> {
	const response = await fetch('/api/stores', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name })
	});
	if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? 'Could not add the store');
	const store = (await response.json()) as Store;
	await invalidateAll();
	return store;
}

export interface AcquisitionState {
	kind: 'purchase' | 'gift';
	date: string;
	storeId: string;
	price: string;
	giver: string;
}

export function emptyAcquisition(): AcquisitionState {
	return { kind: 'purchase', date: new Date().toISOString().slice(0, 10), storeId: '', price: '', giver: '' };
}

/** The form state as Catalog input, or an error message to show. */
export function toAcquisitionInput(a: AcquisitionState): AcquisitionInput | string {
	if (!a.date) return 'Date is required';
	if (a.kind === 'gift') return { kind: 'gift', date: a.date, giver: a.giver.trim() || null };
	const priceCents = eurosToCents(a.price);
	const storeId = Number(a.storeId);
	if (!a.storeId || !Number.isInteger(storeId)) return 'Pick a store';
	if (priceCents === null) return 'Price must be an amount in euros';
	return { kind: 'purchase', date: a.date, storeId, priceCents };
}

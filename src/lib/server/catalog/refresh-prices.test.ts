import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCatalog } from './index';
import { AUTOMATIC_STORES } from './store-prices';
import type { Catalog } from './types';

let catalog: Catalog;
let token: string;
/** What each Store answers, by host. A missing host answers 503. */
let pages: Map<string, Response>;
let requested: URL[];

const html = (...products: { name: string; price: string }[]) =>
	new Response(
		`<script type="application/ld+json">${JSON.stringify(
			products.map((p) => ({
				'@type': 'Product',
				name: p.name,
				offers: { price: p.price, priceCurrency: 'EUR' }
			}))
		)}</script>`
	);

const host = (name: string) =>
	new URL(AUTOMATIC_STORES.find((s) => s.name === name)!.searchUrl('x')).host;

async function addItem() {
	const result = await catalog.addWishlistItem(token, {
		artist: 'Air',
		album: 'Talkie Walkie',
		desire: 3
	});
	if (result.status !== 'added') throw new Error('not added');
	return result.item;
}

beforeEach(async () => {
	await env.DB.batch([
		env.DB.prepare('DELETE FROM price_quote'),
		env.DB.prepare('DELETE FROM wishlist_item'),
		env.DB.prepare('DELETE FROM album'),
		env.DB.prepare('DELETE FROM artist'),
		env.DB.prepare("DELETE FROM store WHERE name != 'Official Store'")
	]);
	pages = new Map();
	requested = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = new URL(new Request(input as RequestInfo).url);
		if (url.host === 'musicbrainz.org') return new Response('unavailable', { status: 503 });
		requested.push(url);
		return pages.get(url.host)?.clone() ?? new Response('unavailable', { status: 503 });
	});
	catalog = createCatalog(env, { lookupIntervalMs: 0 });
	const login = await catalog.login('test-password');
	if (!login.ok) throw new Error('login failed in setup');
	token = login.token;
});

afterEach(() => vi.restoreAllMocks());

describe('Refresh prices', () => {
	it('refuses a Viewer', async () => {
		await expect(catalog.refreshPrices('nope', 1)).rejects.toMatchObject({
			name: 'UnauthorizedError'
		});
	});

	it('refuses an unknown Wishlist Item', async () => {
		await expect(catalog.refreshPrices(token, 999)).rejects.toThrow('not found');
	});

	it('asks every automatic Store for the Artist and the Album', async () => {
		const item = await addItem();
		await catalog.refreshPrices(token, item.id);
		expect(requested.map((u) => u.host).sort()).toEqual(
			AUTOMATIC_STORES.map((s) => new URL(s.searchUrl('x')).host).sort()
		);
		expect(decodeURIComponent(requested[0].search)).toContain('Air Talkie Walkie');
	});

	it('creates one Price Quote per Store with the cheapest matching product', async () => {
		const item = await addItem();
		pages.set(
			host('Fnac'),
			html(
				{ name: 'Air - Talkie Walkie (LP)', price: '31,99' },
				{ name: 'Air - Talkie Walkie (Orange LP)', price: '27.50' },
				{ name: 'Air - Moon Safari', price: '10' }
			)
		);
		pages.set(host('Nuclear Blast'), html({ name: 'Air Talkie Walkie', price: '29.99' }));
		const refreshed = await catalog.refreshPrices(token, item.id);
		expect(refreshed.priceQuotes.map((q) => [q.store.name, q.priceCents])).toEqual([
			['Fnac', 2750],
			['Nuclear Blast', 2999]
		]);
		expect(refreshed.priceQuotes[0].url).toContain(host('Fnac'));
	});

	it('replaces the quote of a Store, and drops it when the Store has no matching product', async () => {
		const item = await addItem();
		pages.set(host('Fnac'), html({ name: 'Air - Talkie Walkie', price: '30' }));
		pages.set(host('Nuclear Blast'), html({ name: 'Air - Talkie Walkie', price: '40' }));
		await catalog.refreshPrices(token, item.id);

		pages.set(host('Fnac'), html({ name: 'Air - Talkie Walkie', price: '28' }));
		pages.set(host('Nuclear Blast'), html({ name: 'Air - Moon Safari', price: '40' }));
		const refreshed = await catalog.refreshPrices(token, item.id);
		expect(refreshed.priceQuotes.map((q) => [q.store.name, q.priceCents])).toEqual([
			['Fnac', 2800]
		]);
	});

	it('keeps the old quote when a Store fails or has no readable products', async () => {
		const item = await addItem();
		pages.set(host('Fnac'), html({ name: 'Air - Talkie Walkie', price: '30' }));
		pages.set(host('Nuclear Blast'), html({ name: 'Air - Talkie Walkie', price: '40' }));
		await catalog.refreshPrices(token, item.id);

		pages.set(host('Fnac'), new Response('blocked', { status: 403 }));
		pages.set(host('Nuclear Blast'), new Response('<html>no data</html>'));
		const refreshed = await catalog.refreshPrices(token, item.id);
		expect(refreshed.priceQuotes.map((q) => [q.store.name, q.priceCents])).toEqual([
			['Fnac', 3000],
			['Nuclear Blast', 4000]
		]);
	});
});

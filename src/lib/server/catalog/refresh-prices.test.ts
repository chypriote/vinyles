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

describe('Product Link', () => {
	const link = (storeId: number, itemId: number, url: string) =>
		catalog.setProductLink(token, { wishlistItemId: itemId, storeId, url });
	const storeId = async (name: string) =>
		(await catalog.listStores()).find((s) => s.name === name)!.id;

	it('is read instead of searching the Store, and the quote links to it', async () => {
		const item = await addItem();
		const fnac = (await catalog.addStore(token, { name: 'Fnac' })).id;
		await link(fnac, item.id, 'https://www.fnac.com/a1/Air-Talkie-Walkie');
		pages.set(host('Fnac'), html({ name: 'Air - Talkie Walkie', price: '99' }));
		pages.set('www.fnac.com', html({ name: 'whatever', price: '26,5' }));
		const refreshed = await catalog.refreshPrices(token, item.id);
		expect(requested.map((u) => u.pathname)).toContain('/a1/Air-Talkie-Walkie');
		expect(
			requested.filter((u) => u.host === host('Fnac') && u.pathname.includes('Search'))
		).toEqual([]);
		expect(refreshed.priceQuotes).toMatchObject([
			{
				store: { name: 'Fnac' },
				priceCents: 2650,
				url: 'https://www.fnac.com/a1/Air-Talkie-Walkie'
			}
		]);
	});

	it('works for a Store that is not automatic, and reads the price meta tags', async () => {
		const item = await addItem();
		const shop = (await catalog.addStore(token, { name: 'Local shop' })).id;
		await link(shop, item.id, 'https://local.test/p/1');
		pages.set('local.test', new Response('<meta property="og:price:amount" content="31.00">'));
		const refreshed = await catalog.refreshPrices(token, item.id);
		expect(refreshed.priceQuotes.map((q) => [q.store.name, q.priceCents])).toEqual([
			['Local shop', 3100]
		]);
	});

	it('keeps the old quote when the linked page cannot be read, and never deletes it', async () => {
		const item = await addItem();
		const shop = (await catalog.addStore(token, { name: 'Local shop' })).id;
		await link(shop, item.id, 'https://local.test/p/1');
		pages.set('local.test', new Response('<meta property="og:price:amount" content="31.00">'));
		await catalog.refreshPrices(token, item.id);
		pages.set('local.test', new Response('<html>Sold out</html>'));
		const refreshed = await catalog.refreshPrices(token, item.id);
		expect(refreshed.priceQuotes.map((q) => q.priceCents)).toEqual([3100]);
	});

	it('is one per Store: a new link replaces the old one, and it can be removed', async () => {
		const item = await addItem();
		const fnac = await storeId('Official Store');
		await link(fnac, item.id, 'https://one.test/a');
		const replaced = await link(fnac, item.id, ' https://two.test/b ');
		expect(replaced.productLinks).toEqual([
			{ store: { id: fnac, name: 'Official Store' }, url: 'https://two.test/b' }
		]);
		const removed = await catalog.removeProductLink(token, {
			wishlistItemId: item.id,
			storeId: fnac
		});
		expect(removed.productLinks).toEqual([]);
	});

	it('refuses a bad address, an unknown Store or Item, and a Viewer', async () => {
		const item = await addItem();
		const store = await storeId('Official Store');
		await expect(link(store, item.id, 'ftp://x.test/a')).rejects.toThrow('http');
		await expect(link(store, item.id, 'not a link')).rejects.toThrow('http');
		await expect(link(9999, item.id, 'https://x.test/a')).rejects.toThrow('Store not found');
		await expect(link(store, 9999, 'https://x.test/a')).rejects.toThrow('not found');
		await expect(
			catalog.setProductLink('nope', {
				wishlistItemId: item.id,
				storeId: store,
				url: 'https://x.test'
			})
		).rejects.toMatchObject({ name: 'UnauthorizedError' });
		await expect(
			catalog.removeProductLink('nope', { wishlistItemId: item.id, storeId: store })
		).rejects.toMatchObject({ name: 'UnauthorizedError' });
	});

	it('goes away with the Wishlist Item', async () => {
		const item = await addItem();
		await link(await storeId('Official Store'), item.id, 'https://x.test/a');
		await catalog.drop(token, item.id);
		const rows = await env.DB.prepare('SELECT COUNT(*) AS n FROM product_link').first<{
			n: number;
		}>();
		expect(rows?.n).toBe(0);
	});
});

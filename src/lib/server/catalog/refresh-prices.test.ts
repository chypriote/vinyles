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

/** The answer of a Shopify search suggestion request. */
const suggestions = (...products: { title: string; price: string; url: string }[]) =>
	Response.json({ resources: { results: { products } } });

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
		expect(requested.every((u) => u.pathname === '/search/suggest.json')).toBe(true);
		expect(requested[0].searchParams.get('q')).toBe('Air Talkie Walkie vinyl');
	});

	it('creates one Price Quote per Store with the cheapest matching product, linked to the product', async () => {
		const item = await addItem();
		pages.set(
			host('Impericon'),
			suggestions(
				{ title: 'Air - Talkie Walkie LP', price: '31.99', url: '/products/a' },
				{ title: 'Air - Talkie Walkie (Orange LP)', price: '27.50', url: '/products/b' },
				{ title: 'Air - Moon Safari', price: '10', url: '/products/c' }
			)
		);
		pages.set(
			host('Nuclear Blast'),
			suggestions({ title: 'Air Talkie Walkie', price: '29.99', url: '/products/d' })
		);
		const refreshed = await catalog.refreshPrices(token, item.id);
		expect(refreshed.priceQuotes.map((q) => [q.store.name, q.priceCents])).toEqual([
			['Impericon', 2750],
			['Nuclear Blast', 2999]
		]);
		expect(refreshed.priceQuotes[0].url).toBe('https://www.impericon.com/products/b');
	});

	it('replaces the quote of a Store and dates it, and keeps the old one when nothing matches', async () => {
		const item = await addItem();
		pages.set(
			host('Impericon'),
			suggestions({ title: 'Air - Talkie Walkie', price: '30', url: '/p/1' })
		);
		pages.set(
			host('Nuclear Blast'),
			suggestions({ title: 'Air - Talkie Walkie', price: '40', url: '/p/2' })
		);
		const before = Date.now();
		const first = await catalog.refreshPrices(token, item.id);
		const foundAt = (name: string, view = first) =>
			Date.parse(view.priceQuotes.find((q) => q.store.name === name)!.foundAt!);
		expect(first.refreshedAt).toBeDefined();
		expect(foundAt('Impericon')).toBeGreaterThanOrEqual(before);
		expect(foundAt('Impericon')).toBeLessThanOrEqual(Date.now());

		pages.set(
			host('Impericon'),
			suggestions({ title: 'Air - Talkie Walkie', price: '28', url: '/p/1' })
		);
		pages.set(
			host('Nuclear Blast'),
			suggestions({ title: 'Air - Moon Safari', price: '40', url: '/p/3' })
		);
		const refreshed = await catalog.refreshPrices(token, item.id);
		expect(refreshed.priceQuotes.map((q) => [q.store.name, q.priceCents])).toEqual([
			['Impericon', 2800],
			['Nuclear Blast', 4000]
		]);
		expect(foundAt('Nuclear Blast', refreshed)).toBe(foundAt('Nuclear Blast'));
		expect(foundAt('Impericon', refreshed)).toBeGreaterThanOrEqual(foundAt('Impericon'));
	});

	it('keeps the old quote when a Store fails or does not answer with suggestions', async () => {
		const item = await addItem();
		pages.set(
			host('Impericon'),
			suggestions({ title: 'Air - Talkie Walkie', price: '30', url: '/p/1' })
		);
		pages.set(
			host('Nuclear Blast'),
			suggestions({ title: 'Air - Talkie Walkie', price: '40', url: '/p/2' })
		);
		await catalog.refreshPrices(token, item.id);

		pages.set(host('Impericon'), new Response('blocked', { status: 403 }));
		pages.set(host('Nuclear Blast'), new Response('<html>not json</html>'));
		const refreshed = await catalog.refreshPrices(token, item.id);
		expect(refreshed.priceQuotes.map((q) => [q.store.name, q.priceCents])).toEqual([
			['Impericon', 3000],
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
		const impericon = (await catalog.addStore(token, { name: 'Impericon' })).id;
		await link(impericon, item.id, 'https://www.impericon.com/products/air-talkie-walkie');
		pages.set(host('Impericon'), html({ name: 'whatever', price: '26,5' }));
		const refreshed = await catalog.refreshPrices(token, item.id);
		expect(requested.map((u) => u.pathname)).toContain('/products/air-talkie-walkie');
		expect(
			requested.filter((u) => u.pathname === '/search/suggest.json' && u.host === host('Impericon'))
		).toEqual([]);
		expect(refreshed.priceQuotes).toMatchObject([
			{
				store: { name: 'Impericon' },
				priceCents: 2650,
				url: 'https://www.impericon.com/products/air-talkie-walkie'
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

describe('Refresh of the oldest items', () => {
	const add = async (album: string) => {
		const result = await catalog.addWishlistItem(token, { artist: 'Air', album, desire: 2 });
		if (result.status !== 'added') throw new Error('not added');
		return result.item.id;
	};
	const setRefreshed = (id: number, at: string | null) =>
		env.DB.prepare('UPDATE wishlist_item SET refreshed_at = ? WHERE id = ?').bind(at, id).run();
	const refreshedAt = async (id: number) =>
		(
			await env.DB.prepare('SELECT refreshed_at AS at FROM wishlist_item WHERE id = ?')
				.bind(id)
				.first<{ at: string | null }>()
		)?.at;
	const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
	/** Items whose Artist and Album were asked for, by search query. */
	const searched = () => [...new Set(requested.map((u) => u.searchParams.values().next().value))];

	it('takes never refreshed items first, then the longest ago, up to the batch size', async () => {
		const old = await add('Old');
		const never = await add('Never');
		const older = await add('Older');
		const oldAt = daysAgo(20);
		await setRefreshed(old, oldAt);
		await setRefreshed(older, daysAgo(30));
		expect(await catalog.refreshOldest({ size: 2, olderThanDays: 14 })).toEqual({ refreshed: 2 });
		expect(searched().sort()).toEqual(['Air Never vinyl', 'Air Older vinyl']);
		expect(await refreshedAt(never)).not.toBeNull();
		expect(await refreshedAt(old)).toBe(oldAt);
	});

	it('skips items refreshed within the period, and refreshes the rest on the next run', async () => {
		const recent = await add('Recent');
		const stale = await add('Stale');
		await setRefreshed(recent, daysAgo(3));
		await setRefreshed(stale, daysAgo(15));
		expect(await catalog.refreshOldest({ size: 5, olderThanDays: 14 })).toEqual({ refreshed: 1 });
		expect(searched()).toEqual(['Air Stale vinyl']);
		expect(await catalog.refreshOldest({ size: 5, olderThanDays: 14 })).toEqual({ refreshed: 0 });
	});

	it('marks an item refreshed even when every Store fails, so it does not block the others', async () => {
		const id = await add('Blocked');
		expect(await refreshedAt(id)).toBeNull();
		await catalog.refreshOldest({ size: 1, olderThanDays: 14 });
		expect(await refreshedAt(id)).not.toBeNull();
	});
});

describe('Refresh of the oldest items', () => {
	const add = async (album: string) => {
		const result = await catalog.addWishlistItem(token, { artist: 'Air', album, desire: 2 });
		if (result.status !== 'added') throw new Error('not added');
		return result.item.id;
	};
	const setRefreshed = (id: number, at: string | null) =>
		env.DB.prepare('UPDATE wishlist_item SET refreshed_at = ? WHERE id = ?').bind(at, id).run();
	const refreshedAt = async (id: number) =>
		(
			await env.DB.prepare('SELECT refreshed_at AS at FROM wishlist_item WHERE id = ?')
				.bind(id)
				.first<{ at: string | null }>()
		)?.at;
	const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
	/** Items whose Artist and Album were asked for, by search query. */
	const searched = () => [...new Set(requested.map((u) => u.searchParams.values().next().value))];

	it('takes never refreshed items first, then the longest ago, up to the batch size', async () => {
		const old = await add('Old');
		const never = await add('Never');
		const older = await add('Older');
		const oldAt = daysAgo(20);
		await setRefreshed(old, oldAt);
		await setRefreshed(older, daysAgo(30));
		expect(await catalog.refreshOldest({ size: 2, olderThanDays: 14 })).toEqual({ refreshed: 2 });
		expect(searched().sort()).toEqual(['Air Never vinyl', 'Air Older vinyl']);
		expect(await refreshedAt(never)).not.toBeNull();
		expect(await refreshedAt(old)).toBe(oldAt);
	});

	it('skips items refreshed within the period, and refreshes the rest on the next run', async () => {
		const recent = await add('Recent');
		const stale = await add('Stale');
		await setRefreshed(recent, daysAgo(3));
		await setRefreshed(stale, daysAgo(15));
		expect(await catalog.refreshOldest({ size: 5, olderThanDays: 14 })).toEqual({ refreshed: 1 });
		expect(searched()).toEqual(['Air Stale vinyl']);
		expect(await catalog.refreshOldest({ size: 5, olderThanDays: 14 })).toEqual({ refreshed: 0 });
	});

	it('marks an item refreshed even when every Store fails, so it does not block the others', async () => {
		const id = await add('Blocked');
		expect(await refreshedAt(id)).toBeNull();
		await catalog.refreshOldest({ size: 1, olderThanDays: 14 });
		expect(await refreshedAt(id)).not.toBeNull();
	});
});

describe('Shopify Stores', () => {
	const suggestions = (...products: { title: string; price: string; url: string }[]) =>
		Response.json({ resources: { results: { products } } });

	it('are read through their search suggestions, and the quote links to the product', async () => {
		const item = await addItem();
		pages.set(
			host('Impericon'),
			suggestions(
				{ title: 'Air - Talkie Walkie LP', price: '27.99', url: '/products/air-talkie-walkie' },
				{ title: 'Air - Moon Safari LP', price: '20.00', url: '/products/air-moon-safari' }
			)
		);
		const refreshed = await catalog.refreshPrices(token, item.id);
		const quote = refreshed.priceQuotes.find((q) => q.store.name === 'Impericon');
		expect(quote).toMatchObject({
			priceCents: 2799,
			url: 'https://www.impericon.com/products/air-talkie-walkie'
		});
		expect(requested.find((u) => u.host === host('Impericon'))?.pathname).toBe(
			'/search/suggest.json'
		);
	});

	it('keeps the quote when the suggestions hold no matching product, or are not JSON', async () => {
		const item = await addItem();
		pages.set(
			host('Impericon'),
			suggestions({ title: 'Air - Talkie Walkie', price: '30', url: '/p/1' })
		);
		await catalog.refreshPrices(token, item.id);

		pages.set(host('Impericon'), new Response('<html>not json</html>'));
		const kept = await catalog.refreshPrices(token, item.id);
		expect(kept.priceQuotes.map((q) => q.priceCents)).toEqual([3000]);

		pages.set(
			host('Impericon'),
			suggestions({ title: 'Air - Moon Safari', price: '20', url: '/p/2' })
		);
		const unmatched = await catalog.refreshPrices(token, item.id);
		expect(unmatched.priceQuotes.map((q) => q.priceCents)).toEqual([3000]);
	});
});

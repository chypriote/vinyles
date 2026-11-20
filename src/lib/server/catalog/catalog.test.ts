import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCatalog, UnauthorizedError } from './index';
import type { AcquisitionInput, AddRecordInput, Catalog, RecordView } from './types';

let catalog: Catalog;
let token: string;

async function clearData() {
	await env.DB.batch([
		env.DB.prepare('DELETE FROM price_quote'),
		env.DB.prepare('DELETE FROM wishlist_item'),
		env.DB.prepare('DELETE FROM record'),
		env.DB.prepare('DELETE FROM album'),
		env.DB.prepare('DELETE FROM artist'),
		env.DB.prepare("DELETE FROM store WHERE name != 'Official Store'")
	]);
	const listed = await env.COVERS.list();
	await Promise.all(listed.objects.map((o) => env.COVERS.delete(o.key)));
}

// --- Fake MusicBrainz and Cover Art Archive, at the fetch boundary ----------

interface FakeAlbum {
	artist: string;
	title: string;
	year: number;
	mbid: string;
	/** Cover bytes, or null for no Cover. */
	cover: string | null;
	/** MusicBrainz search score, 100 when omitted. Under 90 the lookup finds no match. */
	score?: number;
	/** Releases of the release group, each with its own front image (or none). */
	releases?: { id: string; cover: string | null }[];
}

interface FakeCall {
	host: string;
	url: URL;
	userAgent: string | null;
	at: number;
}

let fakeAlbums: FakeAlbum[];
let calls: FakeCall[];
let failMusicBrainz: boolean;
let failDiscogs: boolean;

function installFakeWeb() {
	fakeAlbums = [];
	calls = [];
	failMusicBrainz = false;
	failDiscogs = false;
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const request = new Request(input as RequestInfo, init);
		const url = new URL(request.url);
		calls.push({
			host: url.host,
			url,
			userAgent: request.headers.get('user-agent'),
			at: Date.now()
		});
		if (url.host === 'musicbrainz.org') {
			if (failMusicBrainz) return new Response('unavailable', { status: 503 });
			const query = url.searchParams.get('query') ?? '';
			if (url.pathname.startsWith('/ws/2/release/')) {
				const group = fakeAlbums.find((a) => a.mbid === url.searchParams.get('release-group'));
				return Response.json({
					releases: (group?.releases ?? []).map((r) => ({
						id: r.id,
						'cover-art-archive': { front: r.cover !== null }
					}))
				});
			}
			const limit = Number(url.searchParams.get('limit') ?? 25);
			const groups = fakeAlbums
				.filter((a) => query.includes(a.title) && query.includes(a.artist))
				.slice(0, limit)
				.map((a) => ({
					id: a.mbid,
					score: a.score ?? 100,
					title: a.title,
					'artist-credit': [{ name: a.artist }],
					'first-release-date': `${a.year}-03-01`
				}));
			return Response.json({ 'release-groups': groups });
		}
		if (url.host === 'api.discogs.com') {
			if (failDiscogs) return new Response('unavailable', { status: 503 });
			return Response.json({
				results: [
					{
						title: 'Air - Moon Safari',
						year: '1998',
						thumb: 'https://i.discogs.com/thumb.jpg',
						cover_image: 'https://i.discogs.com/full.jpg'
					},
					{ title: 'No Image', year: '1999', thumb: '', cover_image: '' }
				]
			});
		}
		if (url.host === 'i.discogs.com') {
			return new Response('discogs-bytes', { headers: { 'content-type': 'image/jpeg' } });
		}
		if (url.host === 'coverartarchive.org') {
			const bytes = [
				...fakeAlbums.map((a) => [a.mbid, a.cover] as const),
				...fakeAlbums.flatMap((a) => (a.releases ?? []).map((r) => [r.id, r.cover] as const))
			].find(([id]) => url.pathname.includes(`/${id}/`))?.[1];
			if (bytes == null) return new Response('Not Found', { status: 404 });
			return new Response(bytes, { headers: { 'content-type': 'image/jpeg' } });
		}
		throw new Error(`Unexpected fetch to ${url.href}`);
	});
}

const musicBrainzCalls = () => calls.filter((c) => c.host === 'musicbrainz.org');

beforeEach(async () => {
	installFakeWeb();
	await clearData();
	catalog = createCatalog(env, { lookupIntervalMs: 0 });
	const login = await catalog.login('test-password');
	if (!login.ok) throw new Error('login failed in setup');
	token = login.token;
});

afterEach(() => {
	vi.restoreAllMocks();
});

function base64url(bytes: Uint8Array | string) {
	const raw = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
	return btoa(String.fromCharCode(...raw))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');
}

async function signJwt(payload: object, secret: string) {
	const head = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
	const body = base64url(JSON.stringify(payload));
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${head}.${body}`));
	return `${head}.${body}.${base64url(new Uint8Array(sig))}`;
}

describe('Owner login', () => {
	it('refuses a wrong password', async () => {
		expect(await catalog.login('nope')).toEqual({ ok: false, error: 'wrong-password' });
	});

	it('issues a token for the right password that verifies', async () => {
		const result = await catalog.login('test-password');
		expect(result.ok).toBe(true);
		if (result.ok) expect(await catalog.verifyToken(result.token)).toBe(true);
	});

	it('rejects garbage, tampered, wrongly signed and expired tokens', async () => {
		const exp = Math.floor(Date.now() / 1000);
		expect(await catalog.verifyToken('')).toBe(false);
		expect(await catalog.verifyToken('a.b.c')).toBe(false);
		expect(await catalog.verifyToken(token.slice(0, -2) + 'xx')).toBe(false);
		expect(await catalog.verifyToken(await signJwt({ exp: exp + 3600 }, 'other-secret'))).toBe(
			false
		);
		expect(await catalog.verifyToken(await signJwt({ exp: exp - 10 }, 'test-jwt-secret'))).toBe(
			false
		);
		expect(await catalog.verifyToken(await signJwt({ exp: exp + 3600 }, 'test-jwt-secret'))).toBe(
			true
		);
	});

	it('refuses every write without a valid token', async () => {
		const bad = 'not-a-token';
		const acq = { kind: 'gift', date: '2024-01-01' } as const;
		const calls = [
			() => catalog.addRecord(bad, { artist: 'A', album: 'B', acquisition: acq }),
			() => catalog.editRecord(bad, { id: 1, artist: 'A', album: 'B', acquisition: acq }),
			() => catalog.deleteRecord(bad, 1),
			() => catalog.addStore(bad, { name: 'Shop' }),
			() => catalog.addWishlistItem(bad, { artist: 'A', album: 'B', desire: 2 }),
			() => catalog.gotIt(bad, { wishlistItemId: 1, acquisition: acq }),
			() => catalog.drop(bad, 1),
			() => catalog.importRows(bad, { collection: [], wishlist: [] }),
			() => catalog.lookupNext(bad, { size: 1 }),
			() => catalog.importProgress(bad),
			() => catalog.listUnmatchedAlbums(bad),
			() => catalog.saveYears(bad, { years: [] })
		];
		for (const call of calls) {
			await expect(call()).rejects.toMatchObject({ name: 'UnauthorizedError' });
		}
	});
});

// --- Helpers -----------------------------------------------------------------

const OFFICIAL = 'Official Store';

async function storeId(name: string) {
	const store = (await catalog.listStores()).find((s) => s.name === name);
	if (!store) throw new Error(`no store ${name}`);
	return store.id;
}

async function purchase(
	cents: number,
	date = '2024-01-01',
	store = OFFICIAL
): Promise<AcquisitionInput> {
	return { kind: 'purchase', date, storeId: await storeId(store), priceCents: cents };
}

const gift = (date = '2024-01-01', giver?: string): AcquisitionInput => ({
	kind: 'gift',
	date,
	giver
});

async function addRecord(
	input: Partial<AddRecordInput> & Pick<AddRecordInput, 'artist' | 'album'>
): Promise<RecordView> {
	return catalog.addRecord(token, { acquisition: await purchase(2000), ...input });
}

describe('Stores', () => {
	it('lists the seeded Official Store', async () => {
		expect((await catalog.listStores()).map((s) => s.name)).toEqual([OFFICIAL]);
	});

	it('adds a Store at once, sorted by name, without duplicating one that exists', async () => {
		const fnac = await catalog.addStore(token, { name: ' Fnac ' });
		expect(fnac.name).toBe('Fnac');
		const again = await catalog.addStore(token, { name: 'fnac' });
		expect(again).toEqual(fnac);
		await catalog.addStore(token, { name: 'Cultura' });
		expect((await catalog.listStores()).map((s) => s.name)).toEqual(['Cultura', 'Fnac', OFFICIAL]);
	});

	it('refuses an empty Store name', async () => {
		await expect(catalog.addStore(token, { name: '  ' })).rejects.toThrow();
	});
});

describe('Records', () => {
	it('adds a Purchase with Store and price', async () => {
		const record = await addRecord({
			artist: 'Daft Punk',
			album: 'Discovery',
			variant: 'Blue',
			acquisition: await purchase(1672, '2024-05-02')
		});
		expect(record.album).toMatchObject({ artist: 'Daft Punk', title: 'Discovery' });
		expect(record.variant).toBe('Blue');
		expect(record.acquisition).toEqual({
			kind: 'purchase',
			date: '2024-05-02',
			store: { id: await storeId(OFFICIAL), name: OFFICIAL },
			priceCents: 1672
		});
		const { records } = await catalog.listRecords();
		expect(records).toEqual([record]);
	});

	it('refuses a Purchase with an unknown Store or a bad price', async () => {
		const ok = await purchase(1000);
		if (ok.kind !== 'purchase') throw new Error();
		await expect(
			addRecord({ artist: 'A', album: 'B', acquisition: { ...ok, storeId: 9999 } })
		).rejects.toThrow();
		await expect(
			addRecord({ artist: 'A', album: 'B', acquisition: { ...ok, priceCents: -1 } })
		).rejects.toThrow();
		await expect(
			addRecord({ artist: 'A', album: 'B', acquisition: { ...ok, priceCents: 12.5 } })
		).rejects.toThrow();
		expect((await catalog.listRecords()).records).toEqual([]);
	});

	it('adds a Gift with no Store or price, and an optional giver', async () => {
		const withGiver = await addRecord({
			artist: 'A',
			album: 'B',
			acquisition: gift('2023-12-25', 'Mamie')
		});
		expect(withGiver.acquisition).toEqual({ kind: 'gift', date: '2023-12-25', giver: 'Mamie' });
		const anonymous = await addRecord({ artist: 'A', album: 'C', acquisition: gift() });
		expect(anonymous.acquisition).toEqual({ kind: 'gift', date: '2024-01-01', giver: null });
	});

	it('reuses the Album and Artist of an existing Record, with its Cover and year', async () => {
		fakeAlbums.push({
			artist: 'Air',
			title: 'Moon Safari',
			year: 1998,
			mbid: 'mb-1',
			cover: 'img'
		});
		const first = await addRecord({ artist: 'Air', album: 'Moon Safari' });
		const second = await addRecord({ artist: 'Air', album: 'Moon Safari', variant: 'Clear' });
		expect(second.album).toEqual(first.album);
		expect(await catalog.listArtists()).toHaveLength(1);
		expect(musicBrainzCalls()).toHaveLength(1);
	});

	it('lists Artists sorted by name', async () => {
		await addRecord({ artist: 'Zebda', album: 'Z' });
		await addRecord({ artist: 'Air', album: 'A' });
		expect((await catalog.listArtists()).map((a) => a.name)).toEqual(['Air', 'Zebda']);
	});

	it('edits a Record, including its Acquisition and Album', async () => {
		const record = await addRecord({ artist: 'Air', album: 'Moon Safarii', variant: 'Blue' });
		const edited = await catalog.editRecord(token, {
			id: record.id,
			artist: 'Air',
			album: 'Moon Safari',
			variant: null,
			acquisition: gift('2024-02-02', 'Paul')
		});
		expect(edited.id).toBe(record.id);
		expect(edited.album.title).toBe('Moon Safari');
		expect(edited.variant).toBeNull();
		expect(edited.acquisition).toEqual({ kind: 'gift', date: '2024-02-02', giver: 'Paul' });
		expect((await catalog.listRecords()).records).toEqual([edited]);
	});

	it('refuses to edit a Record that does not exist', async () => {
		await expect(
			catalog.editRecord(token, { id: 999, artist: 'A', album: 'B', acquisition: gift() })
		).rejects.toThrow();
	});

	it('deletes a Record and keeps the others', async () => {
		const a = await addRecord({ artist: 'A', album: 'One' });
		const b = await addRecord({ artist: 'A', album: 'Two' });
		await catalog.deleteRecord(token, a.id);
		expect((await catalog.listRecords()).records.map((r) => r.id)).toEqual([b.id]);
	});
});

describe('Collection list', () => {
	it('totals the Record count and the money spent on Purchases only', async () => {
		await addRecord({ artist: 'A', album: 'One', acquisition: await purchase(1672) });
		await addRecord({ artist: 'A', album: 'Two', acquisition: await purchase(2500) });
		await addRecord({ artist: 'A', album: 'Three', acquisition: gift() });
		const { totals } = await catalog.listRecords();
		expect(totals).toEqual({ recordCount: 3, totalSpentCents: 4172 });
	});

	it('keeps totals for the whole Collection when a filter hides Records', async () => {
		await addRecord({ artist: 'A', album: 'One', acquisition: await purchase(1000) });
		await addRecord({ artist: 'B', album: 'Two', acquisition: await purchase(500) });
		const result = await catalog.listRecords({ artist: 'A' });
		expect(result.records).toHaveLength(1);
		expect(result.totals).toEqual({ recordCount: 2, totalSpentCents: 1500 });
	});

	describe('search, filter and sort', () => {
		beforeEach(async () => {
			fakeAlbums.push(
				{ artist: 'Daft Punk', title: 'Discovery', year: 2001, mbid: 'm1', cover: null },
				{ artist: 'Air', title: 'Moon Safari', year: 1998, mbid: 'm2', cover: null },
				{ artist: 'Air', title: 'Talkie Walkie', year: 2004, mbid: 'm3', cover: null }
			);
			await addRecord({
				artist: 'Daft Punk',
				album: 'Discovery',
				acquisition: await purchase(1, '2024-03-01')
			});
			await addRecord({
				artist: 'Air',
				album: 'Talkie Walkie',
				acquisition: await purchase(1, '2024-01-01')
			});
			await addRecord({
				artist: 'Air',
				album: 'Moon Safari',
				acquisition: await purchase(1, '2024-02-01')
			});
			await addRecord({
				artist: 'Mystery',
				album: 'No Year',
				acquisition: await purchase(1, '2023-01-01')
			});
		});

		const titles = async (input?: Parameters<Catalog['listRecords']>[0]) =>
			(await catalog.listRecords(input)).records.map((r) => r.album.title);

		it('sorts by acquisition date, latest first, by default', async () => {
			expect(await titles()).toEqual(['Discovery', 'Moon Safari', 'Talkie Walkie', 'No Year']);
		});

		it('sorts by Artist then Album', async () => {
			expect(await titles({ sort: 'artist' })).toEqual([
				'Moon Safari',
				'Talkie Walkie',
				'Discovery',
				'No Year'
			]);
		});

		it('sorts by Album', async () => {
			expect(await titles({ sort: 'album' })).toEqual([
				'Discovery',
				'Moon Safari',
				'No Year',
				'Talkie Walkie'
			]);
		});

		it('sorts by release year with unknown years last', async () => {
			expect(await titles({ sort: 'year' })).toEqual([
				'Moon Safari',
				'Discovery',
				'Talkie Walkie',
				'No Year'
			]);
		});

		it('sorts by acquisition date, latest first', async () => {
			expect(await titles({ sort: 'acquired' })).toEqual([
				'Discovery',
				'Moon Safari',
				'Talkie Walkie',
				'No Year'
			]);
		});

		it('searches Artist and Album at once, ignoring case', async () => {
			expect(await titles({ search: 'air' })).toEqual(['Moon Safari', 'Talkie Walkie']);
			expect(await titles({ search: 'DISCO' })).toEqual(['Discovery']);
			expect(await titles({ search: 'nothing here' })).toEqual([]);
			expect(await titles({ search: '%' })).toEqual([]);
		});

		it('filters by exact Artist and combines with search', async () => {
			expect(await titles({ artist: 'Air' })).toEqual(['Moon Safari', 'Talkie Walkie']);
			expect(await titles({ artist: 'Air', search: 'talkie' })).toEqual(['Talkie Walkie']);
			expect(await titles({ artist: 'Ai' })).toEqual([]);
		});
	});
});

describe('Album lookup when an Album is added', () => {
	it('stores the release year and copies the Cover into R2', async () => {
		fakeAlbums.push({
			artist: 'Air',
			title: 'Moon Safari',
			year: 1998,
			mbid: 'mb-air',
			cover: 'cover-bytes'
		});
		const record = await addRecord({ artist: 'Air', album: 'Moon Safari' });
		expect(record.album.releaseYear).toBe(1998);
		expect(record.album.coverKey).toBeTruthy();
		const object = await env.COVERS.get(record.album.coverKey!);
		expect(await object?.text()).toBe('cover-bytes');
		expect(object?.httpMetadata?.contentType).toBe('image/jpeg');
	});

	it('serves the Cover of an Album, and null when it has none', async () => {
		fakeAlbums.push({
			artist: 'Air',
			title: 'Moon Safari',
			year: 1998,
			mbid: 'mb-air',
			cover: 'cover-bytes'
		});
		const withCover = await addRecord({ artist: 'Air', album: 'Moon Safari' });
		const cover = await catalog.getCover(withCover.album.id);
		expect(await new Response(cover?.body).text()).toBe('cover-bytes');
		expect(cover?.contentType).toBe('image/jpeg');
		const without = await addRecord({ artist: 'Nobody', album: 'Unknown' });
		expect(await catalog.getCover(without.album.id)).toBeNull();
		expect(await catalog.getCover(99999)).toBeNull();
	});

	it('keeps the Album without year or Cover when MusicBrainz has no match', async () => {
		const record = await addRecord({ artist: 'Nobody', album: 'Unknown' });
		expect(record.album).toMatchObject({ releaseYear: null, coverKey: null });
	});

	it('keeps the year when the Cover Art Archive has no front image', async () => {
		fakeAlbums.push({
			artist: 'Air',
			title: 'Moon Safari',
			year: 1998,
			mbid: 'mb-air',
			cover: null
		});
		const record = await addRecord({ artist: 'Air', album: 'Moon Safari' });
		expect(record.album).toMatchObject({ releaseYear: 1998, coverKey: null });
	});

	it('still adds the Record when MusicBrainz is down', async () => {
		failMusicBrainz = true;
		const record = await addRecord({ artist: 'Air', album: 'Moon Safari' });
		expect(record.album.releaseYear).toBeNull();
	});

	it('identifies itself to MusicBrainz with a User-Agent', async () => {
		await addRecord({ artist: 'Air', album: 'Moon Safari' });
		expect(musicBrainzCalls()[0].userAgent).toMatch(/vinyles/i);
	});

	it('makes at most one MusicBrainz request per interval', async () => {
		const slow = createCatalog(env, { lookupIntervalMs: 60 });
		for (const title of ['One', 'Two', 'Three']) {
			await slow.addRecord(token, { artist: 'A', album: title, acquisition: gift() });
		}
		const times = musicBrainzCalls().map((c) => c.at);
		expect(times).toHaveLength(3);
		expect(times[1] - times[0]).toBeGreaterThanOrEqual(55);
		expect(times[2] - times[1]).toBeGreaterThanOrEqual(55);
	});
});

describe('Wishlist', () => {
	it('adds a Wishlist Item with Desire and one Price Quote per Store', async () => {
		const fnac = await catalog.addStore(token, { name: 'Fnac' });
		const result = await catalog.addWishlistItem(token, {
			artist: 'Air',
			album: 'Talkie Walkie',
			variant: 'Orange',
			desire: 3,
			priceQuotes: [
				{ storeId: await storeId(OFFICIAL), priceCents: 3500 },
				{ storeId: fnac.id, priceCents: 3000 }
			]
		});
		expect(result.status).toBe('added');
		if (result.status !== 'added') return;
		expect(result.item).toMatchObject({ variant: 'Orange', desire: 3 });
		expect(result.item.album).toMatchObject({ artist: 'Air', title: 'Talkie Walkie' });
		expect(result.item.priceQuotes).toEqual([
			{ store: fnac, priceCents: 3000 },
			{ store: { id: await storeId(OFFICIAL), name: OFFICIAL }, priceCents: 3500 }
		]);
		expect((await catalog.listWishlist()).items).toEqual([result.item]);
	});

	it('refuses a bad Desire, a bad price quote or two quotes for one Store', async () => {
		const store = await storeId(OFFICIAL);
		const add = (input: Partial<Parameters<Catalog['addWishlistItem']>[1]>) =>
			catalog.addWishlistItem(token, { artist: 'A', album: 'B', desire: 2, ...input });
		await expect(add({ desire: 4 as never })).rejects.toThrow();
		await expect(add({ priceQuotes: [{ storeId: store, priceCents: -5 }] })).rejects.toThrow();
		await expect(add({ priceQuotes: [{ storeId: 9999, priceCents: 500 }] })).rejects.toThrow();
		await expect(
			add({
				priceQuotes: [
					{ storeId: store, priceCents: 500 },
					{ storeId: store, priceCents: 600 }
				]
			})
		).rejects.toThrow();
		expect((await catalog.listWishlist()).items).toEqual([]);
	});

	it('warns "already owned" when the Album is a Record, and adds only with addAnyway', async () => {
		const record = await addRecord({ artist: 'Air', album: 'Moon Safari' });
		const warned = await catalog.addWishlistItem(token, {
			artist: 'Air',
			album: 'Moon Safari',
			desire: 2
		});
		expect(warned).toEqual({ status: 'already-owned', records: [record] });
		expect((await catalog.listWishlist()).items).toEqual([]);
		const forced = await catalog.addWishlistItem(token, {
			artist: 'Air',
			album: 'Moon Safari',
			desire: 2,
			variant: 'Clear',
			addAnyway: true
		});
		expect(forced.status).toBe('added');
		expect((await catalog.listWishlist()).count).toBe(1);
	});

	describe('list, search, filter and sort', () => {
		beforeEach(async () => {
			fakeAlbums.push(
				{ artist: 'Daft Punk', title: 'Discovery', year: 2001, mbid: 'm1', cover: null },
				{ artist: 'Air', title: 'Moon Safari', year: 1998, mbid: 'm2', cover: null }
			);
			const add = (artist: string, album: string, desire: 1 | 2 | 3) =>
				catalog.addWishlistItem(token, { artist, album, desire });
			await add('Daft Punk', 'Discovery', 1);
			await add('Air', 'Moon Safari', 3);
			await add('Air', 'Talkie Walkie', 2);
		});

		const titles = async (input?: Parameters<Catalog['listWishlist']>[0]) =>
			(await catalog.listWishlist(input)).items.map((i) => i.album.title);

		it('sorts by Artist then Album by default, and by Album and year', async () => {
			expect(await titles()).toEqual(['Moon Safari', 'Talkie Walkie', 'Discovery']);
			expect(await titles({ sort: 'album' })).toEqual([
				'Discovery',
				'Moon Safari',
				'Talkie Walkie'
			]);
			expect(await titles({ sort: 'year' })).toEqual(['Moon Safari', 'Discovery', 'Talkie Walkie']);
		});

		it('filters by several Desires at once, none meaning all', async () => {
			expect(await titles({ desires: [3] })).toEqual(['Moon Safari']);
			expect(await titles({ desires: [1, 2] })).toEqual(['Talkie Walkie', 'Discovery']);
			expect(await titles({ desires: [] })).toHaveLength(3);
		});

		it('searches and filters by Artist, and counts the whole Wishlist', async () => {
			const searched = await catalog.listWishlist({ search: 'TALKIE' });
			expect(searched.items.map((i) => i.album.title)).toEqual(['Talkie Walkie']);
			expect(searched.count).toBe(3);
			expect(await titles({ artist: 'Air', desires: [2, 3] })).toEqual([
				'Moon Safari',
				'Talkie Walkie'
			]);
		});
	});

	it('Got it turns a Wishlist Item into a Record of the same Album and Variant', async () => {
		const added = await catalog.addWishlistItem(token, {
			artist: 'Air',
			album: 'Talkie Walkie',
			variant: 'Orange',
			desire: 3,
			priceQuotes: [{ storeId: await storeId(OFFICIAL), priceCents: 3500 }]
		});
		if (added.status !== 'added') throw new Error();
		const record = await catalog.gotIt(token, {
			wishlistItemId: added.item.id,
			acquisition: await purchase(3200, '2024-06-01')
		});
		expect(record.album).toEqual(added.item.album);
		expect(record.variant).toBe('Orange');
		expect(record.acquisition).toMatchObject({
			kind: 'purchase',
			priceCents: 3200,
			date: '2024-06-01'
		});
		expect((await catalog.listWishlist()).items).toEqual([]);
		expect((await catalog.listRecords()).records).toEqual([record]);
	});

	it('Got it can be a Gift', async () => {
		const added = await catalog.addWishlistItem(token, { artist: 'A', album: 'B', desire: 2 });
		if (added.status !== 'added') throw new Error();
		const record = await catalog.gotIt(token, {
			wishlistItemId: added.item.id,
			acquisition: gift('2024-12-25', 'Nico')
		});
		expect(record.acquisition).toEqual({ kind: 'gift', date: '2024-12-25', giver: 'Nico' });
	});

	it('Got it refuses an unknown Wishlist Item and keeps the Collection unchanged', async () => {
		await expect(
			catalog.gotIt(token, { wishlistItemId: 999, acquisition: gift() })
		).rejects.toThrow();
		expect((await catalog.listRecords()).records).toEqual([]);
	});

	it('Drop removes the Wishlist Item at once and creates no Record', async () => {
		const added = await catalog.addWishlistItem(token, {
			artist: 'A',
			album: 'B',
			desire: 1,
			priceQuotes: [{ storeId: await storeId(OFFICIAL), priceCents: 100 }]
		});
		if (added.status !== 'added') throw new Error();
		await catalog.drop(token, added.item.id);
		expect((await catalog.listWishlist()).items).toEqual([]);
		expect((await catalog.listRecords()).records).toEqual([]);
	});
});

describe('Import', () => {
	const rows = () => ({
		collection: [
			{
				artist: 'Air',
				album: 'Moon Safari',
				variant: 'Blue',
				date: '2023-04-01',
				acquisition: { kind: 'purchase' as const, store: 'Fnac', priceCents: 1672 }
			},
			{
				artist: 'Air',
				album: 'Talkie Walkie',
				date: '2023-05-01',
				acquisition: { kind: 'gift' as const }
			}
		],
		wishlist: [
			{
				artist: 'Daft Punk',
				album: 'Discovery',
				desire: 3 as const,
				priceQuotes: [
					{ store: 'Fnac', priceCents: 3000 },
					{ store: OFFICIAL, priceCents: 0 },
					{ store: 'Cultura', priceCents: -1 },
					{ store: 'Amazon', priceCents: Number.NaN }
				]
			},
			{ artist: 'Air', album: 'Premier Symptome', desire: 2 as const, priceQuotes: [] }
		]
	});

	it('imports Collection rows as they are, creating Stores and Artists, with no web calls', async () => {
		const result = await catalog.importRows(token, rows());
		expect(result).toEqual({ recordsImported: 2, wishlistItemsImported: 2 });
		expect(calls).toEqual([]);

		const { records, totals } = await catalog.listRecords({ sort: 'album' });
		expect(totals).toEqual({ recordCount: 2, totalSpentCents: 1672 });
		expect(records[0]).toMatchObject({
			variant: 'Blue',
			acquisition: { kind: 'purchase', priceCents: 1672, date: '2023-04-01' }
		});
		expect(records[0].acquisition).toMatchObject({ store: { name: 'Fnac' } });
		expect(records[1].acquisition).toEqual({ kind: 'gift', date: '2023-05-01', giver: null });
		expect((await catalog.listArtists()).map((a) => a.name)).toEqual(['Air', 'Daft Punk']);
		expect((await catalog.listStores()).map((s) => s.name)).toContain('Fnac');
	});

	it('keeps Desire as given and leaves out Price Quotes of zero or less, or that are not a price', async () => {
		await catalog.importRows(token, rows());
		const { items } = await catalog.listWishlist({ sort: 'album' });
		const discovery = items.find((i) => i.album.title === 'Discovery')!;
		expect(discovery.desire).toBe(3);
		expect(discovery.priceQuotes.map((q) => [q.store.name, q.priceCents])).toEqual([
			['Fnac', 3000]
		]);
		expect(items.find((i) => i.album.title === 'Premier Symptome')!.desire).toBe(2);
		const stores = (await catalog.listStores()).map((s) => s.name);
		expect(stores).not.toContain('Cultura');
		expect(stores).not.toContain('Amazon');
	});

	it('shares one Album between a Record and a Wishlist Item of the same title', async () => {
		await catalog.importRows(token, {
			collection: [
				{ artist: 'Air', album: 'Moon Safari', date: '2023-01-01', acquisition: { kind: 'gift' } }
			],
			wishlist: [
				{ artist: 'Air', album: 'Moon Safari', variant: 'Clear', desire: 2, priceQuotes: [] }
			]
		});
		const record = (await catalog.listRecords()).records[0];
		const item = (await catalog.listWishlist()).items[0];
		expect(item.album.id).toBe(record.album.id);
		expect((await catalog.importProgress(token)).total).toBe(1);
	});

	describe('Album lookup in batches', () => {
		beforeEach(async () => {
			fakeAlbums.push(
				{ artist: 'Air', title: 'Moon Safari', year: 1998, mbid: 'm1', cover: 'moon-cover' },
				{ artist: 'Daft Punk', title: 'Discovery', year: 2001, mbid: 'm2', cover: null }
			);
			await catalog.importRows(token, rows());
		});

		it('starts with nothing looked up', async () => {
			expect(await catalog.importProgress(token)).toEqual({ total: 4, done: 0 });
		});

		it('looks up one small batch per call and reports progress', async () => {
			expect(await catalog.lookupNext(token, { size: 3 })).toEqual({ total: 4, done: 3 });
			expect(musicBrainzCalls()).toHaveLength(3);
			expect(await catalog.importProgress(token)).toEqual({ total: 4, done: 3 });
			expect(await catalog.lookupNext(token, { size: 3 })).toEqual({ total: 4, done: 4 });
			expect(musicBrainzCalls()).toHaveLength(4);
		});

		it('does nothing once every Album is looked up', async () => {
			await catalog.lookupNext(token, { size: 10 });
			const before = calls.length;
			expect(await catalog.lookupNext(token, { size: 10 })).toEqual({ total: 4, done: 4 });
			expect(calls).toHaveLength(before);
		});

		it('sets year and Cover on matches, a year without Cover when there is none', async () => {
			await catalog.lookupNext(token, { size: 10 });
			const records = (await catalog.listRecords()).records;
			const moon = records.find((r) => r.album.title === 'Moon Safari')!.album;
			expect(moon.releaseYear).toBe(1998);
			expect(await (await env.COVERS.get(moon.coverKey!))?.text()).toBe('moon-cover');
			const discovery = (await catalog.listWishlist()).items.find(
				(i) => i.album.title === 'Discovery'
			)!.album;
			expect(discovery).toMatchObject({ releaseYear: 2001, coverKey: null });
		});

		it('lists only Albums with no MusicBrainz match, and saveYears gives them a year', async () => {
			expect(await catalog.listUnmatchedAlbums(token)).toEqual([]);
			await catalog.lookupNext(token, { size: 10 });
			const unmatched = await catalog.listUnmatchedAlbums(token);
			expect(unmatched.map((u) => [u.artist, u.title]).sort()).toEqual([
				['Air', 'Premier Symptome'],
				['Air', 'Talkie Walkie']
			]);

			await catalog.saveYears(token, {
				years: [{ albumId: unmatched[0].albumId, releaseYear: 1997 }]
			});
			expect(await catalog.listUnmatchedAlbums(token)).toEqual([unmatched[1]]);
			const albums = [
				...(await catalog.listRecords()).records.map((r) => r.album),
				...(await catalog.listWishlist()).items.map((i) => i.album)
			];
			expect(albums.find((a) => a.id === unmatched[0].albumId)?.releaseYear).toBe(1997);
		});

		describe('rerun and replace', () => {
			const lookUpEverything = async (options: { rerun?: boolean; replace?: boolean }) => {
				let progress = await catalog.lookupNext(token, { size: 2, ...options });
				while (progress.done < progress.total) {
					progress = await catalog.lookupNext(token, {
						size: 2,
						after: progress.after,
						...options
					});
				}
			};
			const albumsByTitle = async () => {
				const all = [
					...(await catalog.listRecords()).records.map((r) => r.album),
					...(await catalog.listWishlist()).items.map((i) => i.album)
				];
				return (title: string) => all.find((a) => a.title === title)!;
			};

			beforeEach(async () => {
				await catalog.lookupNext(token, { size: 10 });
				fakeAlbums.length = 0;
				fakeAlbums.push(
					{ artist: 'Air', title: 'Moon Safari', year: 1999, mbid: 'm1b', cover: 'new-moon' },
					{ artist: 'Daft Punk', title: 'Discovery', year: 2001, mbid: 'm2', cover: 'new-disc' }
				);
			});

			it('does not touch looked-up Albums by default', async () => {
				const before = calls.length;
				await catalog.lookupNext(token, { size: 10 });
				expect(calls).toHaveLength(before);
			});

			it('updates year, match and Cover of every Album', async () => {
				const old = (await albumsByTitle())('Moon Safari');
				await lookUpEverything({ rerun: true });
				const moon = (await albumsByTitle())('Moon Safari');
				expect(moon.releaseYear).toBe(1999);
				expect(moon.coverVersion).toBeGreaterThan(old.coverVersion);
				expect(await (await env.COVERS.get(moon.coverKey!))?.text()).toBe('new-moon');
				const discovery = (await albumsByTitle())('Discovery');
				expect(await (await env.COVERS.get(discovery.coverKey!))?.text()).toBe('new-disc');
				expect(musicBrainzCalls().length).toBeGreaterThanOrEqual(8);
			});

			async function chooseMoonCover() {
				// Candidates come from the stored match (m1), which the new fakes no longer answer to.
				const stored = {
					artist: 'Air',
					title: 'Moon Safari',
					year: 1998,
					mbid: 'm1',
					cover: 'moon-cover',
					releases: [{ id: 'rel-x', cover: 'chosen' }]
				};
				fakeAlbums.push(stored);
				const id = (await albumsByTitle())('Moon Safari').id;
				const [candidate] = await catalog.listCoverCandidates(token, id);
				await catalog.pickCover(token, {
					albumId: id,
					candidateId: candidate.id,
					source: candidate.source
				});
				fakeAlbums.splice(fakeAlbums.indexOf(stored), 1);
				return id;
			}

			it('keeps an Owner-chosen Cover on rerun but still updates its year', async () => {
				const id = await chooseMoonCover();
				const chosen = (await albumsByTitle())('Moon Safari');
				await lookUpEverything({ rerun: true });
				const moon = (await albumsByTitle())('Moon Safari');
				expect(moon.id).toBe(id);
				expect(moon.releaseYear).toBe(1999);
				expect(moon.coverChosen).toBe(true);
				expect(moon.coverVersion).toBe(chosen.coverVersion);
				expect(await (await env.COVERS.get(moon.coverKey!))?.text()).toBe('chosen');
			});

			it('overwrites and unmarks an Owner-chosen Cover on replace', async () => {
				await chooseMoonCover();
				const chosen = (await albumsByTitle())('Moon Safari');
				await lookUpEverything({ rerun: true, replace: true });
				const moon = (await albumsByTitle())('Moon Safari');
				expect(moon.coverChosen).toBe(false);
				expect(moon.coverVersion).toBeGreaterThan(chosen.coverVersion);
				expect(await (await env.COVERS.get(moon.coverKey!))?.text()).toBe('new-moon');
			});

			it('refuses replace without rerun', async () => {
				const before = calls.length;
				await expect(catalog.lookupNext(token, { size: 10, replace: true })).rejects.toThrow(
					/replace.*rerun/i
				);
				expect(calls).toHaveLength(before);
			});
		});

		it('refuses a year for an unknown Album or a year that is not a year', async () => {
			await expect(
				catalog.saveYears(token, { years: [{ albumId: 999, releaseYear: 1990 }] })
			).rejects.toThrow();
			const [first] = (await catalog.listRecords()).records;
			await expect(
				catalog.saveYears(token, { years: [{ albumId: first.album.id, releaseYear: 19.5 }] })
			).rejects.toThrow();
		});
	});
});

// --- Review fixes ------------------------------------------------------------

describe('Owner login without configuration', () => {
	it('never logs in when OWNER_PASSWORD is missing or empty, even with an empty password', async () => {
		for (const OWNER_PASSWORD of ['', undefined as unknown as string]) {
			const unset = createCatalog({ ...env, OWNER_PASSWORD }, { lookupIntervalMs: 0 });
			expect(await unset.login('')).toEqual({ ok: false, error: 'wrong-password' });
			expect(await unset.login('anything')).toEqual({ ok: false, error: 'wrong-password' });
		}
	});

	it('refuses an empty password even when one is configured', async () => {
		expect(await catalog.login('')).toEqual({ ok: false, error: 'wrong-password' });
	});

	it('verifies no token when JWT_SECRET is missing', async () => {
		const noSecret = createCatalog({ ...env, JWT_SECRET: '' }, { lookupIntervalMs: 0 });
		expect(await noSecret.verifyToken(token)).toBe(false);
	});
});

describe('Impossible dates', () => {
	it('refuses them on a Record', async () => {
		for (const date of ['2024-02-31', '2024-13-45']) {
			await expect(
				addRecord({ artist: 'A', album: 'B', acquisition: gift(date) })
			).rejects.toThrow();
		}
		expect((await catalog.listRecords()).records).toEqual([]);
		expect(
			(await addRecord({ artist: 'A', album: 'B', acquisition: gift('2024-02-29') })).acquisition
				.date
		).toBe('2024-02-29');
	});

	it('refuses them on import', async () => {
		for (const date of ['2024-02-31', '2024-13-45']) {
			await expect(
				catalog.importRows(token, {
					collection: [{ artist: 'A', album: 'B', date, acquisition: { kind: 'gift' } }],
					wishlist: []
				})
			).rejects.toThrow();
		}
		expect((await catalog.listRecords()).records).toEqual([]);
	});
});

describe('Import twice', () => {
	const collection = [
		{ artist: 'A', album: 'B', date: '2024-01-01', acquisition: { kind: 'gift' as const } }
	];

	it('refuses when the Collection already holds a Record', async () => {
		await addRecord({ artist: 'X', album: 'Y' });
		await expect(catalog.importRows(token, { collection, wishlist: [] })).rejects.toThrow(
			'already'
		);
		expect((await catalog.listRecords()).records).toHaveLength(1);
	});

	it('refuses when the Wishlist already holds an Item', async () => {
		await catalog.addWishlistItem(token, { artist: 'X', album: 'Y', desire: 1 });
		await expect(catalog.importRows(token, { collection, wishlist: [] })).rejects.toThrow(
			'already'
		);
		expect((await catalog.listRecords()).records).toEqual([]);
	});

	it('refuses a second import', async () => {
		await catalog.importRows(token, { collection, wishlist: [] });
		await expect(catalog.importRows(token, { collection, wishlist: [] })).rejects.toThrow(
			'already'
		);
		expect((await catalog.listRecords()).records).toHaveLength(1);
	});
});

describe('Album lookup when one Album fails', () => {
	it('skips it, keeps it pending and still looks up the others', async () => {
		fakeAlbums.push({
			artist: 'Daft Punk',
			title: 'Discovery',
			year: 2001,
			mbid: 'm2',
			cover: null
		});
		await catalog.importRows(token, {
			collection: [
				{ artist: 'Air', album: 'Moon Safari', date: '2023-01-01', acquisition: { kind: 'gift' } },
				{
					artist: 'Daft Punk',
					album: 'Discovery',
					date: '2023-01-01',
					acquisition: { kind: 'gift' }
				}
			],
			wishlist: []
		});
		let moonAttempts = 0;
		const inner = vi.mocked(globalThis.fetch).getMockImplementation()!;
		vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
			const query = new URL(String(input)).searchParams.get('query') ?? '';
			if (query.includes('Moon Safari')) moonAttempts++;
			if (query.includes('Moon Safari')) return new Response('unavailable', { status: 503 });
			return inner(input, init);
		});
		expect(await catalog.lookupNext(token, { size: 5 })).toEqual({ total: 2, done: 1 });
		expect(moonAttempts).toBe(1);
		const discovery = (await catalog.listRecords()).records.find(
			(r) => r.album.title === 'Discovery'
		)!.album;
		expect(discovery.releaseYear).toBe(2001);
	});
});

describe('Changing the Cover of an Album', () => {
	const group = (over: Partial<FakeAlbum> = {}): FakeAlbum => ({
		artist: 'Air',
		title: 'Moon Safari',
		year: 1998,
		mbid: 'mb-air',
		cover: 'group-cover',
		...over
	});

	describe('candidates', () => {
		it('are the front images of the releases of the matched release group, at most 12', async () => {
			const releases = Array.from({ length: 15 }, (_, i) => ({
				id: `rel-${i}`,
				cover: i === 1 ? null : `c${i}`
			}));
			fakeAlbums.push(group({ releases }));
			const record = await addRecord({ artist: 'Air', album: 'Moon Safari' });

			const candidates = await catalog.listCoverCandidates(token, record.album.id);
			expect(candidates).toHaveLength(12);
			expect(candidates.map((c) => c.id)).toEqual(
				releases
					.filter((r) => r.cover !== null)
					.slice(0, 12)
					.map((r) => r.id)
			);
			expect(candidates.every((c) => c.source === 'release')).toBe(true);
			expect(candidates[0].imageUrl).toContain('coverartarchive.org/release/rel-0/');
		});

		it('are the top 5 release-group search hits with artist, title and year when there is no match', async () => {
			fakeAlbums.push(
				...Array.from({ length: 7 }, (_, i) =>
					group({ mbid: `mb-${i}`, year: 1990 + i, score: 50, cover: `c${i}` })
				)
			);
			const record = await addRecord({ artist: 'Air', album: 'Moon Safari' });
			expect(record.album.releaseYear).toBeNull();

			const candidates = await catalog.listCoverCandidates(token, record.album.id);
			expect(candidates).toHaveLength(5);
			expect(candidates[2]).toMatchObject({
				id: 'mb-2',
				source: 'release-group',
				artist: 'Air',
				title: 'Moon Safari',
				year: 1992
			});
			expect(candidates[2].imageUrl).toContain('coverartarchive.org/release-group/mb-2/');
		});

		it('fall back to the search hits when the release group has no release with a front image', async () => {
			fakeAlbums.push(group({ releases: [{ id: 'rel-none', cover: null }] }));
			const record = await addRecord({ artist: 'Air', album: 'Moon Safari' });

			const candidates = await catalog.listCoverCandidates(token, record.album.id);
			expect(candidates.map((c) => [c.source, c.id])).toEqual([['release-group', 'mb-air']]);
		});

		it('keeps a Cover the Owner picks while the lookup is running', async () => {
			fakeAlbums.push(group({ cover: 'looked-up', releases: [{ id: 'rel-x', cover: 'chosen' }] }));
			const real = vi.mocked(globalThis.fetch).getMockImplementation()!;
			let picked = false;
			vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
				const url = new URL(new Request(input as RequestInfo, init).url);
				if (!picked && url.pathname.includes('/release-group/mb-air/')) {
					picked = true;
					const row = await env.DB.prepare('SELECT id FROM album').first<{ id: number }>();
					const id = row!.id;
					await catalog.pickCover(token, {
						albumId: id,
						candidateId: 'rel-x',
						source: 'release'
					});
				}
				return real(input, init);
			});
			await addRecord({ artist: 'Air', album: 'Moon Safari' });
			const moon = (await catalog.listRecords()).records[0].album;
			expect(moon.coverChosen).toBe(true);
			expect(await (await env.COVERS.get(moon.coverKey!))?.text()).toBe('chosen');
		});

		it('can be searched with typed text: release-group hits, at most 12', async () => {
			fakeAlbums.push(
				...Array.from({ length: 14 }, (_, i) =>
					group({ mbid: `mb-${i}`, year: 1990 + i, cover: `c${i}` })
				)
			);
			const hits = await catalog.searchCoverCandidates(token, 'Air: Moon Safari');
			const found = hits.filter((c) => c.source === 'release-group');
			expect(found).toHaveLength(12);
			expect(found[3]).toMatchObject({ id: 'mb-3', source: 'release-group', year: 1993 });
			expect(await catalog.searchCoverCandidates(token, ' :: ')).toEqual([]);
			await expect(catalog.searchCoverCandidates('bad-token', 'Air')).rejects.toThrow();
		});

		it('add Discogs hits with an image to a typed search, and survive a Discogs failure', async () => {
			fakeAlbums.push(group({ cover: 'c' }));
			const found = await catalog.searchCoverCandidates(token, 'Air Moon Safari');
			expect(found.map((c) => c.source)).toEqual(['release-group', 'discogs']);
			expect(found[1]).toMatchObject({
				id: 'https://i.discogs.com/full.jpg',
				imageUrl: 'https://i.discogs.com/thumb.jpg',
				artist: 'Air',
				title: 'Moon Safari',
				year: 1998
			});
			const discogs = calls.find((c) => c.host === 'api.discogs.com')!;
			expect(discogs.url.searchParams.get('type')).toBe('master');

			failDiscogs = true;
			const again = await catalog.searchCoverCandidates(token, 'Air Moon Safari');
			expect(again.map((c) => c.source)).toEqual(['release-group']);
		});

		it('make at most one MusicBrainz request per interval', async () => {
			const slow = createCatalog(env, { lookupIntervalMs: 60 });
			fakeAlbums.push(group({ releases: [{ id: 'r', cover: 'x' }] }));
			const record = await addRecord({ artist: 'Air', album: 'Moon Safari' });
			calls.length = 0;
			await slow.listCoverCandidates(token, record.album.id);
			await slow.listCoverCandidates(token, record.album.id);
			const times = musicBrainzCalls().map((c) => c.at);
			expect(times).toHaveLength(2);
			expect(times[1] - times[0]).toBeGreaterThanOrEqual(55);
		});
	});

	describe('upload', () => {
		const png = (size: number) => new Uint8Array(size).fill(7).buffer;

		it('replaces the Cover, marks it chosen and changes its version', async () => {
			const record = await addRecord({ artist: 'Air', album: 'Moon Safari' });
			await catalog.uploadCover(token, {
				albumId: record.album.id,
				body: png(10),
				contentType: 'image/png'
			});
			const after = (await catalog.listRecords()).records[0].album;
			const object = await env.COVERS.get(after.coverKey!);
			expect((await object?.arrayBuffer())?.byteLength).toBe(10);
			expect(object?.httpMetadata?.contentType).toBe('image/png');
			expect(after.coverChosen).toBe(true);
			expect(after.coverVersion).not.toBe(record.album.coverVersion);
		});

		it('refuses other types, big or empty files, unknown Albums and a missing login', async () => {
			const record = await addRecord({ artist: 'Air', album: 'Moon Safari' });
			const upload = (over: object, t = token) =>
				catalog.uploadCover(t, {
					albumId: record.album.id,
					body: png(10),
					contentType: 'image/png',
					...over
				});
			await expect(upload({ contentType: 'image/svg+xml' })).rejects.toThrow('JPEG, PNG or WebP');
			await expect(upload({ body: png(2 * 1024 * 1024 + 1) })).rejects.toThrow('under 2 MB');
			await expect(upload({ body: png(0) })).rejects.toThrow('under 2 MB');
			await expect(upload({ albumId: 99999 })).rejects.toThrow('Album not found');
			await expect(upload({}, 'bad-token')).rejects.toThrow();
		});
	});

	describe('pick', () => {
		it('copies a Discogs image over the Cover, and refuses other hosts', async () => {
			fakeAlbums.push(group());
			const record = await addRecord({ artist: 'Air', album: 'Moon Safari' });
			await catalog.pickCover(token, {
				albumId: record.album.id,
				candidateId: 'https://i.discogs.com/full.jpg',
				source: 'discogs'
			});
			const after = (await catalog.listRecords()).records[0].album;
			expect(await (await env.COVERS.get(after.coverKey!))?.text()).toBe('discogs-bytes');
			expect(after.coverChosen).toBe(true);
			await expect(
				catalog.pickCover(token, {
					albumId: record.album.id,
					candidateId: 'https://evil.example/x.jpg',
					source: 'discogs'
				})
			).rejects.toThrow('Unknown candidate');
		});

		async function matched() {
			fakeAlbums.push(
				group({
					releases: [
						{ id: 'rel-a', cover: 'bytes-a' },
						{ id: 'rel-b', cover: 'bytes-b' }
					]
				})
			);
			await catalog.addWishlistItem(token, {
				artist: 'Air',
				album: 'Moon Safari',
				variant: 'Reissue',
				desire: 2
			});
			const record = await addRecord({ artist: 'Air', album: 'Moon Safari' });
			return { record };
		}

		it('replaces the Cover, marks it chosen, and changes nothing else', async () => {
			const { record } = await matched();
			const before = record.album;
			const [, second] = await catalog.listCoverCandidates(token, before.id);

			await catalog.pickCover(token, {
				albumId: before.id,
				candidateId: second.id,
				source: second.source
			});

			const after = (await catalog.listRecords()).records[0].album;
			expect(await (await env.COVERS.get(after.coverKey!))?.text()).toBe('bytes-b');
			expect(after.coverKey).toBe(before.coverKey);
			expect(after.coverChosen).toBe(true);
			expect(before.coverChosen).toBe(false);
			expect(after.releaseYear).toBe(before.releaseYear);
			expect(after.title).toBe(before.title);
			const row = await env.DB.prepare('SELECT musicbrainz_id AS id FROM album WHERE id = ?')
				.bind(before.id)
				.first<{ id: string }>();
			expect(row?.id).toBe('mb-air');
		});

		it('changes the Cover version so that the Cover URL changes', async () => {
			const { record } = await matched();
			const [first] = await catalog.listCoverCandidates(token, record.album.id);
			await catalog.pickCover(token, {
				albumId: record.album.id,
				candidateId: first.id,
				source: first.source
			});
			const after = (await catalog.listRecords()).records[0].album;
			expect(after.coverVersion).not.toBe(record.album.coverVersion);
		});

		it('shows for the Records and Wishlist Items of the Album', async () => {
			const { record } = await matched();
			const [first] = await catalog.listCoverCandidates(token, record.album.id);
			await catalog.pickCover(token, {
				albumId: record.album.id,
				candidateId: first.id,
				source: first.source
			});
			const item = (await catalog.listWishlist()).items[0];
			expect(item.album.id).toBe(record.album.id);
			expect(item.album.coverVersion).toBe(
				(await catalog.listRecords()).records[0].album.coverVersion
			);
			expect(item.album.coverChosen).toBe(true);
		});

		it('works for an Album without Cover and for an unmatched Album', async () => {
			fakeAlbums.push(
				group({ mbid: 'mb-low', score: 50, cover: 'low-cover' }),
				group({
					artist: 'Nobody',
					title: 'Plain',
					mbid: 'x',
					cover: null,
					releases: [{ id: 'rx', cover: 'rx-bytes' }]
				})
			);
			const unmatched = await addRecord({ artist: 'Air', album: 'Moon Safari' });
			expect(unmatched.album.coverKey).toBeNull();
			const [candidate] = await catalog.listCoverCandidates(token, unmatched.album.id);
			await catalog.pickCover(token, {
				albumId: unmatched.album.id,
				candidateId: candidate.id,
				source: candidate.source
			});
			const album = (await catalog.listRecords()).records[0].album;
			expect(await (await env.COVERS.get(album.coverKey!))?.text()).toBe('low-cover');
			expect(album).toMatchObject({ coverChosen: true, releaseYear: null });
		});

		it('fails for an unknown Album or a candidate without image', async () => {
			const { record } = await matched();
			await expect(
				catalog.pickCover(token, { albumId: 999, candidateId: 'rel-a', source: 'release' })
			).rejects.toThrow();
			await expect(
				catalog.pickCover(token, {
					albumId: record.album.id,
					candidateId: 'nope',
					source: 'release'
				})
			).rejects.toThrow();
		});
	});

	it('is Owner-only', async () => {
		fakeAlbums.push(group());
		const record = await addRecord({ artist: 'Air', album: 'Moon Safari' });
		calls.length = 0;
		await expect(catalog.listCoverCandidates('bad', record.album.id)).rejects.toThrow(
			UnauthorizedError
		);
		await expect(
			catalog.pickCover('bad', {
				albumId: record.album.id,
				candidateId: 'mb-air',
				source: 'release-group'
			})
		).rejects.toThrow(UnauthorizedError);
		expect(calls).toHaveLength(0);
		expect((await catalog.listRecords()).records[0].album.coverChosen).toBe(false);
	});
});

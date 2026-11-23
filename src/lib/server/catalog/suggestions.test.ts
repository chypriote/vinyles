import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCatalog } from './index';
import type { Catalog } from './types';

let catalog: Catalog;
let token: string;

interface FakeGroup {
	artist: string;
	title: string;
	year: number;
	type?: string;
	secondary?: string[];
	/** Credited artist when it differs from `artist`. */
	credit?: string;
}

let groups: FakeGroup[];
let failMusicBrainz: boolean;
let artistSearches: string[];
/** Last.fm: similar artists by seed, top albums by artist. */
let similar: Record<string, string[]>;
let topAlbums: Record<string, string[]>;
let lastFmCalls: string[];
let failLastFm: boolean;

function installFakeWeb() {
	groups = [];
	failMusicBrainz = false;
	artistSearches = [];
	similar = {};
	topAlbums = {};
	lastFmCalls = [];
	failLastFm = false;
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = new URL(new Request(input as RequestInfo, init).url);
		if (url.host === 'coverartarchive.org') return new Response('Not Found', { status: 404 });
		if (url.host === 'ws.audioscrobbler.com') {
			const method = url.searchParams.get('method');
			const artist = url.searchParams.get('artist') ?? '';
			lastFmCalls.push(`${method}:${artist}:${url.searchParams.get('api_key')}`);
			if (failLastFm) return Response.json({ error: 10, message: 'Invalid API key' });
			if (method === 'artist.getsimilar') {
				return Response.json({
					similarartists: { artist: (similar[artist] ?? []).map((name) => ({ name })) }
				});
			}
			return Response.json({
				topalbums: { album: (topAlbums[artist] ?? []).map((name) => ({ name })) }
			});
		}
		if (url.host !== 'musicbrainz.org') throw new Error(`Unexpected fetch to ${url.href}`);
		if (failMusicBrainz) return new Response('unavailable', { status: 503 });
		const query = url.searchParams.get('query') ?? '';
		const asHit = (g: FakeGroup) => ({
			id: `mb-${g.artist}-${g.title}`,
			score: 100,
			title: g.title,
			'primary-type': g.type ?? 'Album',
			'secondary-types': g.secondary ?? [],
			'artist-credit': [{ name: g.credit ?? g.artist }],
			'first-release-date': `${g.year}-03-01`
		});
		if (query.includes('primarytype:album')) {
			artistSearches.push(query);
			// The real search also finds other artists whose credit contains the words.
			const hits = groups.filter((g) => query.startsWith(`artist:"${g.artist}"`)).map(asHit);
			return Response.json({ 'release-groups': hits });
		}
		const exact = groups.filter((g) => query.includes(g.title) && query.includes(g.artist));
		return Response.json({ 'release-groups': exact.map(asHit) });
	});
}

async function clearData() {
	await env.DB.batch([
		env.DB.prepare('DELETE FROM suggestion'),
		env.DB.prepare('DELETE FROM discarded_album'),
		env.DB.prepare('DELETE FROM price_quote'),
		env.DB.prepare('DELETE FROM wishlist_item'),
		env.DB.prepare('DELETE FROM record'),
		env.DB.prepare('DELETE FROM album'),
		env.DB.prepare('DELETE FROM artist')
	]);
	const listed = await env.COVERS.list();
	await Promise.all(listed.objects.map((o) => env.COVERS.delete(o.key)));
}

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

const own = (artist: string, album: string) =>
	catalog.addRecord(token, {
		artist,
		album,
		acquisition: { kind: 'gift', date: '2024-01-01' }
	});

const want = async (artist: string, album: string, desire: 1 | 2 | 3 | 4 | 5 = 2) => {
	const added = await catalog.addWishlistItem(token, { artist, album, desire });
	if (added.status !== 'added') throw new Error();
	return added.item;
};

const run = (input: { size?: number; cursor?: number } = {}) =>
	catalog.findSuggestions(token, { size: input.size ?? 50, cursor: input.cursor });

const titles = async () => (await catalog.listSuggestions(token)).map((s) => s.title);

describe('Suggestions from MusicBrainz', () => {
	it('proposes the oldest studio Album the Owner does not know, once per Artist', async () => {
		await own('Air', 'Moon Safari');
		groups.push(
			{ artist: 'Air', title: 'Talkie Walkie', year: 2004 },
			{ artist: 'Air', title: 'Moon Safari', year: 1998 },
			{ artist: 'Air', title: '10 000 Hz Legend', year: 2001 },
			{ artist: 'Air', title: 'Pocket Symphony', year: 2007 }
		);
		expect(await run()).toEqual({ pending: 1, next: null, failures: 0 });
		expect(await catalog.listSuggestions(token)).toEqual([
			{
				id: expect.any(Number),
				artist: 'Air',
				title: '10 000 Hz Legend',
				releaseYear: 2001,
				musicbrainzId: 'mb-Air-10 000 Hz Legend',
				source: 'musicbrainz',
				reason: 'More by Air'
			}
		]);
	});

	it('keeps studio albums credited to the Artist only', async () => {
		await own('Air', 'Moon Safari');
		groups.push(
			{ artist: 'Air', title: 'Live', year: 1999, secondary: ['Live'] },
			{ artist: 'Air', title: 'Best Of', year: 2000, secondary: ['Compilation'] },
			{ artist: 'Air', title: 'Single', year: 2001, type: 'Single' },
			{ artist: 'Air', title: 'Not Air', year: 2002, credit: 'Air Supply' },
			{ artist: 'Air', title: 'Talkie Walkie', year: 2004 }
		);
		await run();
		expect(await titles()).toEqual(['Talkie Walkie']);
	});

	it('skips Albums that are owned, wanted or Discarded', async () => {
		await own('Air', 'Moon Safari');
		const wanted = await want('Air', 'Talkie Walkie');
		const discarded = await want('Air', 'Pocket Symphony');
		await catalog.discard(token, discarded.id);
		expect(wanted.id).toBeGreaterThan(0);
		groups.push(
			{ artist: 'Air', title: 'moon safari', year: 1998 },
			{ artist: 'Air', title: 'Talkie Walkie', year: 2004 },
			{ artist: 'Air', title: 'Pocket Symphony', year: 2007 },
			{ artist: 'Air', title: 'Love 2', year: 2009 }
		);
		await run();
		expect(await titles()).toEqual(['Love 2']);
	});

	it('treats a title as known despite apostrophes, case and a final "Pt I"', async () => {
		await own('Arctic Monkeys', "Whatever people say I am, that's what I'm not");
		await own('Avantasia', 'The Metal Opera Pt I');
		groups.push(
			{
				artist: 'Arctic Monkeys',
				title: 'Whatever People Say I Am, That’s What I’m Not',
				year: 2006
			},
			{ artist: 'Avantasia', title: 'The Metal Opera', year: 2001 },
			{ artist: 'Avantasia', title: 'The Metal Opera Pt. II', year: 2002 }
		);
		await run();
		expect(await titles()).toEqual(['The Metal Opera Pt. II']);
	});

	it('treats a misspelt title as known (Stone Grows Her Name / Stones Grow Her Name)', async () => {
		await want('Sonata Arctica', 'Stones Grow Her Name');
		groups.push(
			{ artist: 'Sonata Arctica', title: 'Stone Grows Her Name', year: 2025 },
			{ artist: 'Sonata Arctica', title: 'Reckoning Night', year: 2004 }
		);
		await run();
		expect(await titles()).toEqual(['Reckoning Night']);
	});

	it('keeps titles apart that differ by a number', async () => {
		await own('Band', 'Greatest Hits 2');
		groups.push({ artist: 'Band', title: 'Greatest Hits 3', year: 2001 });
		await run();
		expect(await titles()).toEqual(['Greatest Hits 3']);
	});

	it('keeps titles apart that differ by a number word', async () => {
		await want('Sonata Arctica', 'Acoustic Adventures - Volume Two');
		groups.push({
			artist: 'Sonata Arctica',
			title: 'Acoustic Adventures - Volume One',
			year: 2022
		});
		await run();
		expect(await titles()).toEqual(['Acoustic Adventures - Volume One']);
	});

	it('hides a saved Suggestion when a similar title is wanted later', async () => {
		await own('Sonata Arctica', 'Silence');
		groups.push({ artist: 'Sonata Arctica', title: 'Stone Grows Her Name', year: 2025 });
		await run();
		expect(await titles()).toEqual(['Stone Grows Her Name']);
		await want('Sonata Arctica', 'Stones Grow Her Name');
		expect(await titles()).toEqual([]);
	});

	it('shows one of two similar saved Suggestions of an Artist', async () => {
		await own('Sonata Arctica', 'Silence');
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO suggestion (artist, title, source, reason, rank) VALUES ('Sonata Arctica', 'Stones Grow Her Name', 'musicbrainz', 'More by Sonata Arctica', 1)"
			),
			env.DB.prepare(
				"INSERT INTO suggestion (artist, title, source, reason, rank) VALUES ('Sonata Arctica', 'Stone Grows Her Name', 'lastfm', 'Similar to X', 2)"
			)
		]);
		expect(await titles()).toEqual(['Stones Grow Her Name']);
	});

	it('does not propose a title similar to a Suggestion already saved for the Artist', async () => {
		await own('Sonata Arctica', 'Silence');
		await env.DB.prepare(
			"INSERT INTO suggestion (artist, title, source, reason, rank) VALUES ('Sonata Arctica', 'Stones Grow Her Name', 'lastfm', 'x', 9)"
		).run();
		groups.push({ artist: 'Sonata Arctica', title: 'Stone Grows Her Name', year: 2025 });
		await run();
		expect(await titles()).toEqual(['Stones Grow Her Name']);
	});

	it('reads D1 a fixed number of times per search, whatever the number of Artists', async () => {
		for (let i = 0; i < 6; i++) {
			await own(`Artist ${i}`, 'Old');
			groups.push({ artist: `Artist ${i}`, title: 'New', year: 2000 });
		}
		const prepare = vi.spyOn(env.DB, 'prepare');
		await run();
		const selects = prepare.mock.calls.filter(([sql]) => /^select/i.test(sql)).length;
		// rankedSeeds (2) + Suggestions and taken Albums (2) + a count check per insert is not a select.
		expect(selects).toBeGreaterThan(0);
		expect(selects).toBeLessThanOrEqual(6);
	});

	it('hides a saved Suggestion when its Album is later owned under a similar title', async () => {
		await own('Avantasia', 'The Metal Opera Pt II');
		groups.push({ artist: 'Avantasia', title: 'The Metal Opera', year: 2001 });
		await run();
		expect(await titles()).toEqual(['The Metal Opera']);
		await own('Avantasia', 'The Metal Opera Pt I');
		expect(await titles()).toEqual([]);
	});

	it('proposes nothing for an Artist with no unknown studio Album', async () => {
		await own('Air', 'Moon Safari');
		groups.push({ artist: 'Air', title: 'Moon Safari', year: 1998 });
		expect(await run()).toEqual({ pending: 0, next: null, failures: 0 });
	});

	it('uses Artists from the Wishlist as seeds too', async () => {
		await want('Beck', 'Odelay');
		groups.push({ artist: 'Beck', title: 'Mellow Gold', year: 1994 });
		await run();
		expect(await titles()).toEqual(['Mellow Gold']);
	});

	it('does not search Artists when the Collection and Wishlist are empty', async () => {
		expect(await run()).toEqual({ pending: 0, next: null, failures: 0 });
		expect(artistSearches).toEqual([]);
	});

	it('ranks Desire 5 Artists first, then the Artists with the most Records', async () => {
		await own('Few', 'A');
		await own('Many', 'A');
		await own('Many', 'B');
		await want('Wanted', 'A', 5);
		await want('Meh', 'A', 2);
		for (const artist of ['Few', 'Many', 'Wanted', 'Meh']) {
			groups.push({ artist, title: 'New', year: 2000 });
		}
		await run();
		expect((await catalog.listSuggestions(token)).map((s) => s.artist)).toEqual([
			'Wanted',
			'Many',
			'Few',
			'Meh'
		]);
	});

	it('works in batches with a cursor and gives the same result as one run', async () => {
		for (const artist of ['A', 'B', 'C']) {
			await own(artist, 'Old');
			groups.push({ artist, title: 'New', year: 2000 });
		}
		expect(await run({ size: 2 })).toEqual({ pending: 2, next: 2, failures: 0 });
		expect(await run({ size: 2, cursor: 2 })).toEqual({ pending: 3, next: null, failures: 0 });
		expect(await titles()).toEqual(['New', 'New', 'New']);
	});

	it('does not propose a second Album for an Artist that has a pending Suggestion', async () => {
		await own('Air', 'Moon Safari');
		groups.push(
			{ artist: 'Air', title: 'Talkie Walkie', year: 2004 },
			{ artist: 'Air', title: 'Love 2', year: 2009 }
		);
		await run();
		await run();
		expect(await titles()).toEqual(['Talkie Walkie']);
		expect(artistSearches).toHaveLength(1);
	});

	it('stops at 20 pending Suggestions', async () => {
		for (let i = 0; i < 25; i++) {
			const artist = `Artist ${String(i).padStart(2, '0')}`;
			await own(artist, 'Old');
			groups.push({ artist, title: 'New', year: 2000 });
		}
		expect(await run()).toEqual({ pending: 20, next: null, failures: 0 });
		expect(await catalog.listSuggestions(token)).toHaveLength(20);
		expect(artistSearches).toHaveLength(20);
		expect(await run()).toEqual({ pending: 20, next: null, failures: 0 });
		expect(artistSearches).toHaveLength(20);
	});

	it('hides a Suggestion once its Album is owned, wanted or Discarded, and it stops counting', async () => {
		for (const artist of ['A', 'B', 'C']) {
			await own(artist, 'Old');
			groups.push({ artist, title: 'New', year: 2000 });
		}
		await run();
		expect(await catalog.listSuggestions(token)).toHaveLength(3);
		await own('A', 'New');
		await want('B', 'New');
		expect((await catalog.listSuggestions(token)).map((s) => s.artist)).toEqual(['C']);
		expect(await run()).toEqual({ pending: 1, next: null, failures: 0 });
		const item = await want('C', 'Other');
		await catalog.discard(token, item.id);
		await catalog.undiscard(token, item.album.id);
		expect(await catalog.listSuggestions(token)).toHaveLength(1);
	});

	it('counts a MusicBrainz failure, saves nothing and goes on to the next Artist', async () => {
		await own('Air', 'Moon Safari');
		await own('Beck', 'Odelay');
		groups.push({ artist: 'Beck', title: 'Mellow Gold', year: 1994 });
		failMusicBrainz = true;
		expect(await run({ size: 1 })).toEqual({ pending: 0, next: 1, failures: 1 });
		failMusicBrainz = false;
		expect(await run({ size: 1, cursor: 1 })).toEqual({ pending: 1, next: null, failures: 0 });
	});
});

describe('Add and Discard a Suggestion', () => {
	beforeEach(async () => {
		await own('Air', 'Moon Safari');
		groups.push({ artist: 'Air', title: 'Talkie Walkie', year: 2004 });
		await run();
	});

	it('Add creates a Wishlist Item with the chosen Desire and removes the Suggestion', async () => {
		const [suggestion] = await catalog.listSuggestions(token);
		await catalog.addSuggestion(token, suggestion.id, 4);
		const { items } = await catalog.listWishlist();
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({
			desire: 4,
			variant: null,
			priceQuotes: [],
			album: { artist: 'Air', title: 'Talkie Walkie', releaseYear: 2004 }
		});
		expect(await catalog.listSuggestions(token)).toEqual([]);
		expect(await run()).toEqual({ pending: 0, next: null, failures: 0 });
	});

	it('Add takes any Desire from 1 to 5 and refuses another one, keeping the Suggestion', async () => {
		const [suggestion] = await catalog.listSuggestions(token);
		for (const bad of [0, 6, 2.5, undefined]) {
			await expect(
				catalog.addSuggestion(token, suggestion.id, bad as unknown as 1)
			).rejects.toThrow('Desire is 1 to 5');
		}
		expect(await catalog.listSuggestions(token)).toHaveLength(1);
		expect((await catalog.listWishlist()).items).toEqual([]);
		await catalog.addSuggestion(token, suggestion.id, 1);
		expect((await catalog.listWishlist()).items).toMatchObject([{ desire: 1 }]);
	});

	it('Discard puts the Album on the Discarded list and removes the Suggestion', async () => {
		const [suggestion] = await catalog.listSuggestions(token);
		await catalog.discardSuggestion(token, suggestion.id);
		expect(await catalog.listSuggestions(token)).toEqual([]);
		expect(await catalog.listDiscarded(token)).toEqual([
			{ albumId: expect.any(Number), artist: 'Air', title: 'Talkie Walkie' }
		]);
		expect((await catalog.listWishlist()).items).toEqual([]);
		// Never proposed again.
		expect(await run()).toEqual({ pending: 0, next: null, failures: 0 });
	});

	it('Undiscard makes the Album proposable again', async () => {
		const [suggestion] = await catalog.listSuggestions(token);
		await catalog.discardSuggestion(token, suggestion.id);
		const [listed] = await catalog.listDiscarded(token);
		await catalog.undiscard(token, listed.albumId);
		expect(await run()).toEqual({ pending: 1, next: null, failures: 0 });
	});

	it('Add of a Suggestion whose Album was wanted meanwhile makes no duplicate', async () => {
		const [suggestion] = await catalog.listSuggestions(token);
		await want('Air', 'Talkie Walkie', 1);
		await catalog.addSuggestion(token, suggestion.id, 3);
		expect((await catalog.listWishlist()).items).toHaveLength(1);
		await expect(catalog.addSuggestion(token, suggestion.id, 3)).rejects.toThrow(
			'Suggestion not found'
		);
	});

	it('refuses an unknown Suggestion', async () => {
		await expect(catalog.addSuggestion(token, 999, 3)).rejects.toThrow('Suggestion not found');
		await expect(catalog.discardSuggestion(token, 999)).rejects.toThrow('Suggestion not found');
	});
});

describe('Suggestions need the Owner', () => {
	it('refuses every call without a valid token', async () => {
		const bad = 'not-a-token';
		const calls = [
			() => catalog.findSuggestions(bad, { size: 1 }),
			() => catalog.listSuggestions(bad),
			() => catalog.addSuggestion(bad, 1, 3),
			() => catalog.discardSuggestion(bad, 1)
		];
		for (const call of calls) {
			await expect(call()).rejects.toMatchObject({ name: 'UnauthorizedError' });
		}
	});
});

describe('Suggestions from Last.fm', () => {
	beforeEach(async () => {
		catalog = createCatalog({ ...env, LASTFM_API_KEY: 'test-key' }, { lookupIntervalMs: 0 });
		await own('Air', 'Moon Safari');
	});

	it('proposes the top Album of a similar Artist, with its year and Cover from MusicBrainz', async () => {
		similar.Air = ['Zero 7'];
		topAlbums['Zero 7'] = ['Simple Things'];
		groups.push({ artist: 'Zero 7', title: 'Simple Things', year: 2001 });
		expect(await run()).toEqual({ pending: 1, next: null, failures: 0 });
		expect(await catalog.listSuggestions(token)).toEqual([
			{
				id: expect.any(Number),
				artist: 'Zero 7',
				title: 'Simple Things',
				releaseYear: 2001,
				musicbrainzId: 'mb-Zero 7-Simple Things',
				source: 'lastfm',
				reason: 'Similar to Air'
			}
		]);
		expect(lastFmCalls.every((call) => call.endsWith(':test-key'))).toBe(true);
	});

	it('keeps the Suggestion when MusicBrainz does not know the Album', async () => {
		similar.Air = ['Zero 7'];
		topAlbums['Zero 7'] = ['Simple Things'];
		await run();
		expect(await catalog.listSuggestions(token)).toMatchObject([
			{ title: 'Simple Things', releaseYear: null, musicbrainzId: null }
		]);
	});

	it('skips Artists the Owner has, Artists already suggested and "(null)" Albums', async () => {
		await want('Beck', 'Odelay');
		similar.Air = ['Beck', 'Zero 7', 'Nightmares on Wax'];
		similar.Beck = ['Zero 7'];
		topAlbums['Zero 7'] = ['(null)'];
		topAlbums['Nightmares on Wax'] = ['Smokers Delight'];
		await run();
		expect(await catalog.listSuggestions(token)).toMatchObject([
			{ artist: 'Nightmares on Wax', reason: 'Similar to Air' }
		]);
		expect(lastFmCalls.filter((c) => c.startsWith('artist.gettopalbums:Beck'))).toEqual([]);
	});

	it('tries at most 3 similar Artists per seed', async () => {
		similar.Air = ['A', 'B', 'C', 'D'];
		topAlbums.D = ['Late'];
		await run();
		expect(await catalog.listSuggestions(token)).toEqual([]);
		expect(lastFmCalls.filter((c) => c.startsWith('artist.gettopalbums')).length).toBe(3);
	});

	it('skips an Album of a similar Artist that is Discarded', async () => {
		const gone = await want('Zero 7', 'Simple Things');
		await catalog.discard(token, gone.id);
		similar.Air = ['Zero 7'];
		topAlbums['Zero 7'] = ['Simple Things', 'When It Falls'];
		await run();
		expect(await titles()).toEqual(['When It Falls']);
	});

	it('shares the cap of 20 with MusicBrainz, with no cap per source', async () => {
		for (let i = 0; i < 15; i++) {
			const artist = `Artist ${String(i).padStart(2, '0')}`;
			await own(artist, 'Old');
			groups.push({ artist, title: 'New', year: 2000 });
			similar[artist] = [`Similar ${i}`];
			topAlbums[`Similar ${i}`] = ['Top'];
		}
		expect(await run()).toEqual({ pending: 20, next: null, failures: 0 });
		const sources = (await catalog.listSuggestions(token)).map((s) => s.source);
		expect(sources).toHaveLength(20);
		expect(sources.filter((s) => s === 'lastfm').length).toBeGreaterThan(0);
	});

	it('counts a Last.fm failure, such as a wrong key, and keeps the MusicBrainz Suggestion', async () => {
		groups.push({ artist: 'Air', title: 'Talkie Walkie', year: 2004 });
		failLastFm = true;
		expect(await run()).toEqual({ pending: 1, next: null, failures: 1 });
		expect(await titles()).toEqual(['Talkie Walkie']);
	});

	it('is skipped without a key: MusicBrainz still works', async () => {
		catalog = createCatalog(env, { lookupIntervalMs: 0 });
		similar.Air = ['Zero 7'];
		topAlbums['Zero 7'] = ['Simple Things'];
		groups.push({ artist: 'Air', title: 'Talkie Walkie', year: 2004 });
		await run();
		expect(await titles()).toEqual(['Talkie Walkie']);
		expect(lastFmCalls).toEqual([]);
	});

	it('Add of a Last.fm Suggestion puts it on the Wishlist with the chosen Desire', async () => {
		similar.Air = ['Zero 7'];
		topAlbums['Zero 7'] = ['Simple Things'];
		await run();
		const [suggestion] = await catalog.listSuggestions(token);
		await catalog.addSuggestion(token, suggestion.id, 5);
		expect((await catalog.listWishlist()).items).toMatchObject([
			{ desire: 5, album: { artist: 'Zero 7', title: 'Simple Things' } }
		]);
	});
});

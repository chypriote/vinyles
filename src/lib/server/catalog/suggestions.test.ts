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

function installFakeWeb() {
	groups = [];
	failMusicBrainz = false;
	artistSearches = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = new URL(new Request(input as RequestInfo, init).url);
		if (url.host === 'coverartarchive.org') return new Response('Not Found', { status: 404 });
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

const want = async (artist: string, album: string, desire: 1 | 2 | 3 = 2) => {
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
		expect(await run()).toEqual({ pending: 1, next: null });
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

	it('proposes nothing for an Artist with no unknown studio Album', async () => {
		await own('Air', 'Moon Safari');
		groups.push({ artist: 'Air', title: 'Moon Safari', year: 1998 });
		expect(await run()).toEqual({ pending: 0, next: null });
	});

	it('uses Artists from the Wishlist as seeds too', async () => {
		await want('Beck', 'Odelay');
		groups.push({ artist: 'Beck', title: 'Mellow Gold', year: 1994 });
		await run();
		expect(await titles()).toEqual(['Mellow Gold']);
	});

	it('does not search Artists when the Collection and Wishlist are empty', async () => {
		expect(await run()).toEqual({ pending: 0, next: null });
		expect(artistSearches).toEqual([]);
	});

	it('ranks Desire 3 Artists first, then the Artists with the most Records', async () => {
		await own('Few', 'A');
		await own('Many', 'A');
		await own('Many', 'B');
		await want('Wanted', 'A', 3);
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
		expect(await run({ size: 2 })).toEqual({ pending: 2, next: 2 });
		expect(await run({ size: 2, cursor: 2 })).toEqual({ pending: 3, next: null });
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
		expect(await run()).toEqual({ pending: 20, next: null });
		expect(await catalog.listSuggestions(token)).toHaveLength(20);
		expect(artistSearches).toHaveLength(20);
		expect(await run()).toEqual({ pending: 20, next: null });
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
		expect(await run()).toEqual({ pending: 1, next: null });
		const item = await want('C', 'Other');
		await catalog.discard(token, item.id);
		await catalog.undiscard(token, item.album.id);
		expect(await catalog.listSuggestions(token)).toHaveLength(1);
	});

	it('reports a MusicBrainz failure and saves nothing', async () => {
		await own('Air', 'Moon Safari');
		failMusicBrainz = true;
		await expect(run()).rejects.toThrow('MusicBrainz');
		expect(await catalog.listSuggestions(token)).toEqual([]);
	});
});

describe('Add and Discard a Suggestion', () => {
	beforeEach(async () => {
		await own('Air', 'Moon Safari');
		groups.push({ artist: 'Air', title: 'Talkie Walkie', year: 2004 });
		await run();
	});

	it('Add creates a Wishlist Item with Desire 2 and removes the Suggestion', async () => {
		const [suggestion] = await catalog.listSuggestions(token);
		await catalog.addSuggestion(token, suggestion.id);
		const { items } = await catalog.listWishlist();
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({
			desire: 2,
			variant: null,
			priceQuotes: [],
			album: { artist: 'Air', title: 'Talkie Walkie', releaseYear: 2004 }
		});
		expect(await catalog.listSuggestions(token)).toEqual([]);
		expect(await run()).toEqual({ pending: 0, next: null });
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
		expect(await run()).toEqual({ pending: 0, next: null });
	});

	it('Undiscard makes the Album proposable again', async () => {
		const [suggestion] = await catalog.listSuggestions(token);
		await catalog.discardSuggestion(token, suggestion.id);
		const [listed] = await catalog.listDiscarded(token);
		await catalog.undiscard(token, listed.albumId);
		expect(await run()).toEqual({ pending: 1, next: null });
	});

	it('refuses an unknown Suggestion', async () => {
		await expect(catalog.addSuggestion(token, 999)).rejects.toThrow('Suggestion not found');
		await expect(catalog.discardSuggestion(token, 999)).rejects.toThrow('Suggestion not found');
	});
});

describe('Suggestions need the Owner', () => {
	it('refuses every call without a valid token', async () => {
		const bad = 'not-a-token';
		const calls = [
			() => catalog.findSuggestions(bad, { size: 1 }),
			() => catalog.listSuggestions(bad),
			() => catalog.addSuggestion(bad, 1),
			() => catalog.discardSuggestion(bad, 1)
		];
		for (const call of calls) {
			await expect(call()).rejects.toMatchObject({ name: 'UnauthorizedError' });
		}
	});
});

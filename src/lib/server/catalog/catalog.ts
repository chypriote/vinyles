import { and, count, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { albums, artists, priceQuotes, records, stores, wishlistItems } from '../db/schema';
import { issueToken, passwordMatches, tokenIsValid, UnauthorizedError } from './auth';
import { findAlbum, findCover } from './lookup';
import type {
	AcquisitionInput,
	AlbumSummary,
	Artist,
	Catalog,
	Desire,
	ImportProgress,
	ListFilters,
	PriceQuote,
	PriceQuoteInput,
	RecordSortKey,
	RecordView,
	SortKey,
	Store,
	WishlistItemView
} from './types';

export interface CatalogEnv {
	DB: D1Database;
	COVERS: R2Bucket;
	OWNER_PASSWORD: string;
	JWT_SECRET: string;
}

export interface CatalogOptions {
	/** Minimum gap between MusicBrainz requests. Default 1000 (their limit). */
	lookupIntervalMs?: number;
}

type Db = DrizzleD1Database;
type BatchStatements = Parameters<Db['batch']>[0];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Marks an Album that was looked up on MusicBrainz and has no match. Null means not looked up yet. */
const NO_MATCH = '';

/** True for a real calendar date written YYYY-MM-DD (2024-02-31 is not one). */
function isRealDate(value: unknown): boolean {
	if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
	const date = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const clean = (value: string) => value.trim();
const cleanOrNull = (value: string | null | undefined) => clean(value ?? '') || null;
const isCents = (value: unknown): value is number =>
	Number.isInteger(value) && (value as number) >= 0;
const isDesire = (value: unknown): value is Desire => value === 1 || value === 2 || value === 3;

function required(value: string, what: string) {
	const cleaned = clean(value);
	if (!cleaned) throw new Error(`${what} is required`);
	return cleaned;
}

const compare = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

function matchesFilters(artist: string, title: string, { search, artist: only }: ListFilters) {
	if (only !== undefined && artist !== only) return false;
	const needle = clean(search ?? '').toLowerCase();
	return !needle || artist.toLowerCase().includes(needle) || title.toLowerCase().includes(needle);
}

function byAlbum(a: AlbumSummary, b: AlbumSummary) {
	return compare(a.artist, b.artist) || compare(a.title, b.title) || a.id - b.id;
}

function byYear(a: AlbumSummary, b: AlbumSummary) {
	if (a.releaseYear === b.releaseYear) return byAlbum(a, b);
	if (a.releaseYear === null) return 1;
	if (b.releaseYear === null) return -1;
	return a.releaseYear - b.releaseYear;
}

function albumComparator(sort: SortKey | undefined) {
	if (sort === 'album') {
		return (a: AlbumSummary, b: AlbumSummary) =>
			compare(a.title, b.title) || compare(a.artist, b.artist) || a.id - b.id;
	}
	return sort === 'year' ? byYear : byAlbum;
}

export function buildCatalog(env: CatalogEnv, options: CatalogOptions = {}): Catalog {
	const db = drizzle(env.DB);
	const intervalMs = options.lookupIntervalMs ?? 1000;

	async function owner(token: string) {
		if (!env.JWT_SECRET || !(await tokenIsValid(token, env.JWT_SECRET)))
			throw new UnauthorizedError();
	}

	const run = (statements: unknown[]) =>
		statements.length ? db.batch(statements as unknown as BatchStatements) : Promise.resolve([]);

	// --- Reads -----------------------------------------------------------------

	const albumColumns = {
		id: albums.id,
		artist: artists.name,
		title: albums.title,
		releaseYear: albums.releaseYear,
		coverKey: albums.coverKey
	};

	async function loadRecords(id?: number): Promise<RecordView[]> {
		const rows = await db
			.select({
				id: records.id,
				album: albumColumns,
				variant: records.variant,
				kind: records.acquisitionKind,
				date: records.acquisitionDate,
				storeId: stores.id,
				storeName: stores.name,
				priceCents: records.priceCents,
				giver: records.giver
			})
			.from(records)
			.innerJoin(albums, eq(records.albumId, albums.id))
			.innerJoin(artists, eq(albums.artistId, artists.id))
			.leftJoin(stores, eq(records.storeId, stores.id))
			.where(id === undefined ? undefined : eq(records.id, id));
		return rows.map((row) => ({
			id: row.id,
			album: row.album,
			variant: row.variant,
			acquisition:
				row.kind === 'purchase'
					? {
							kind: 'purchase' as const,
							date: row.date,
							store: { id: row.storeId!, name: row.storeName! },
							priceCents: row.priceCents!
						}
					: { kind: 'gift' as const, date: row.date, giver: row.giver }
		}));
	}

	async function loadWishlist(id?: number): Promise<WishlistItemView[]> {
		const rows = await db
			.select({
				id: wishlistItems.id,
				album: albumColumns,
				variant: wishlistItems.variant,
				desire: wishlistItems.desire
			})
			.from(wishlistItems)
			.innerJoin(albums, eq(wishlistItems.albumId, albums.id))
			.innerJoin(artists, eq(albums.artistId, artists.id))
			.where(id === undefined ? undefined : eq(wishlistItems.id, id));
		const quoteRows = await db
			.select({
				itemId: priceQuotes.wishlistItemId,
				store: { id: stores.id, name: stores.name },
				priceCents: priceQuotes.priceCents
			})
			.from(priceQuotes)
			.innerJoin(stores, eq(priceQuotes.storeId, stores.id));
		const quotesByItem = new Map<number, PriceQuote[]>();
		for (const q of quoteRows) {
			const list = quotesByItem.get(q.itemId) ?? [];
			list.push({ store: q.store, priceCents: q.priceCents });
			quotesByItem.set(q.itemId, list);
		}
		return rows.map((row) => ({
			id: row.id,
			album: row.album,
			variant: row.variant,
			desire: row.desire as Desire,
			priceQuotes: (quotesByItem.get(row.id) ?? []).sort((a, b) =>
				compare(a.store.name, b.store.name)
			)
		}));
	}

	// --- Writes: shared pieces -------------------------------------------------

	async function findStore(id: number): Promise<Store | undefined> {
		return (await db.select().from(stores).where(eq(stores.id, id)))[0];
	}

	async function checkAcquisition(input: AcquisitionInput) {
		if (!isRealDate(input.date)) throw new Error('Acquisition date must be YYYY-MM-DD');
		if (input.kind === 'purchase') {
			if (!(await findStore(input.storeId))) throw new Error('A Purchase needs an existing Store');
			if (!isCents(input.priceCents)) throw new Error('A Purchase needs a price in euro cents');
			return {
				acquisitionKind: 'purchase' as const,
				acquisitionDate: input.date,
				storeId: input.storeId,
				priceCents: input.priceCents,
				giver: null
			};
		}
		if (input.kind === 'gift') {
			return {
				acquisitionKind: 'gift' as const,
				acquisitionDate: input.date,
				storeId: null,
				priceCents: null,
				giver: cleanOrNull(input.giver)
			};
		}
		throw new Error('Acquisition must be a purchase or a gift');
	}

	/** Looks the Album up on MusicBrainz and the Cover Art Archive and saves what it finds. */
	async function lookUpAlbum(albumId: number, artist: string, title: string) {
		const match = await findAlbum(artist, title, intervalMs);
		if (!match) {
			await db.update(albums).set({ musicbrainzId: NO_MATCH }).where(eq(albums.id, albumId));
			return;
		}
		const cover = await findCover(match.musicbrainzId);
		let coverKey: string | null = null;
		if (cover) {
			coverKey = `covers/${albumId}`;
			await env.COVERS.put(coverKey, cover.body, {
				httpMetadata: { contentType: cover.contentType }
			});
		}
		await db
			.update(albums)
			.set({ releaseYear: match.releaseYear, musicbrainzId: match.musicbrainzId, coverKey })
			.where(eq(albums.id, albumId));
	}

	/** Existing Album, or a new one that is looked up at once. A failing lookup never blocks the Owner. */
	async function ensureAlbum(artistName: string, albumTitle: string): Promise<number> {
		const artist = required(artistName, 'Artist');
		const title = required(albumTitle, 'Album');
		await db.insert(artists).values({ name: artist }).onConflictDoNothing();
		const [{ id: artistId }] = await db
			.select({ id: artists.id })
			.from(artists)
			.where(eq(artists.name, artist));
		const created = await db
			.insert(albums)
			.values({ artistId, title })
			.onConflictDoNothing()
			.returning({ id: albums.id });
		if (created.length) {
			try {
				await lookUpAlbum(created[0].id, artist, title);
			} catch {
				// Left as not looked up: the import batches can retry it.
			}
			return created[0].id;
		}
		const [existing] = await db
			.select({ id: albums.id })
			.from(albums)
			.where(and(eq(albums.artistId, artistId), eq(albums.title, title)));
		return existing.id;
	}

	async function checkQuotes(quotes: PriceQuoteInput[]) {
		const seen = new Set<number>();
		for (const q of quotes) {
			if (!isCents(q.priceCents)) throw new Error('A Price Quote needs a price in euro cents');
			if (seen.has(q.storeId)) throw new Error('One Price Quote per Store');
			seen.add(q.storeId);
			if (!(await findStore(q.storeId))) throw new Error('A Price Quote needs an existing Store');
		}
	}

	const oneRecord = async (id: number) => (await loadRecords(id))[0];

	// --- Import helpers --------------------------------------------------------

	async function progress(): Promise<ImportProgress> {
		const [{ total }] = await db.select({ total: count() }).from(albums);
		const [{ done }] = await db
			.select({ done: count() })
			.from(albums)
			.where(isNotNull(albums.musicbrainzId));
		return { total, done };
	}

	return {
		async listRecords(input = {}) {
			const all = await loadRecords();
			const sort: RecordSortKey = input.sort ?? 'artist';
			const byDate = (a: RecordView, b: RecordView) =>
				b.acquisition.date.localeCompare(a.acquisition.date) ||
				byAlbum(a.album, b.album) ||
				a.id - b.id;
			const album = albumComparator(sort === 'acquired' ? undefined : sort);
			const shown = all
				.filter((r) => matchesFilters(r.album.artist, r.album.title, input))
				.sort(sort === 'acquired' ? byDate : (a, b) => album(a.album, b.album) || a.id - b.id);
			let totalSpentCents = 0;
			for (const r of all)
				if (r.acquisition.kind === 'purchase') totalSpentCents += r.acquisition.priceCents;
			return { records: shown, totals: { recordCount: all.length, totalSpentCents } };
		},

		async listWishlist(input = {}) {
			const all = await loadWishlist();
			const desires = input.desires?.length ? input.desires : null;
			const album = albumComparator(input.sort);
			const items = all
				.filter(
					(i) =>
						matchesFilters(i.album.artist, i.album.title, input) &&
						(!desires || desires.includes(i.desire))
				)
				.sort((a, b) => album(a.album, b.album) || a.id - b.id);
			return { items, count: all.length };
		},

		async listStores() {
			const all = await db.select().from(stores);
			return all.sort((a, b) => compare(a.name, b.name));
		},

		async listArtists(): Promise<Artist[]> {
			const all = await db.select().from(artists);
			return all.sort((a, b) => compare(a.name, b.name));
		},

		async getCover(albumId) {
			const album = (
				await db.select({ coverKey: albums.coverKey }).from(albums).where(eq(albums.id, albumId))
			)[0];
			if (!album?.coverKey) return null;
			const object = await env.COVERS.get(album.coverKey);
			if (!object) return null;
			return { body: object.body, contentType: object.httpMetadata?.contentType ?? 'image/jpeg' };
		},

		async login(password) {
			if (
				!env.OWNER_PASSWORD ||
				!env.JWT_SECRET ||
				!password ||
				!(await passwordMatches(password, env.OWNER_PASSWORD))
			) {
				return { ok: false, error: 'wrong-password' };
			}
			return { ok: true, token: await issueToken(env.JWT_SECRET) };
		},

		verifyToken: async (token) => !!env.JWT_SECRET && (await tokenIsValid(token, env.JWT_SECRET)),

		async addRecord(token, input) {
			await owner(token);
			const acquisition = await checkAcquisition(input.acquisition);
			const albumId = await ensureAlbum(input.artist, input.album);
			const [{ id }] = await db
				.insert(records)
				.values({ albumId, variant: cleanOrNull(input.variant), ...acquisition })
				.returning({ id: records.id });
			return oneRecord(id);
		},

		async editRecord(token, input) {
			await owner(token);
			if (!(await oneRecord(input.id))) throw new Error('Record not found');
			const acquisition = await checkAcquisition(input.acquisition);
			const albumId = await ensureAlbum(input.artist, input.album);
			await db
				.update(records)
				.set({ albumId, variant: cleanOrNull(input.variant), ...acquisition })
				.where(eq(records.id, input.id));
			return oneRecord(input.id);
		},

		async deleteRecord(token, id) {
			await owner(token);
			await db.delete(records).where(eq(records.id, id));
		},

		async addStore(token, input) {
			await owner(token);
			const name = required(input.name, 'Store name');
			const existing = (await db.select().from(stores)).find((s) => compare(s.name, name) === 0);
			if (existing) return existing;
			const [created] = await db.insert(stores).values({ name }).returning();
			return created;
		},

		async addWishlistItem(token, input) {
			await owner(token);
			if (!isDesire(input.desire)) throw new Error('Desire is 1, 2 or 3');
			const quotes = input.priceQuotes ?? [];
			await checkQuotes(quotes);
			if (!input.addAnyway) {
				const owned = (await loadRecords()).filter(
					(r) => r.album.artist === clean(input.artist) && r.album.title === clean(input.album)
				);
				if (owned.length) return { status: 'already-owned', records: owned };
			}
			const albumId = await ensureAlbum(input.artist, input.album);
			const [{ id }] = await db
				.insert(wishlistItems)
				.values({ albumId, variant: cleanOrNull(input.variant), desire: input.desire })
				.returning({ id: wishlistItems.id });
			if (quotes.length) {
				await db.insert(priceQuotes).values(quotes.map((q) => ({ wishlistItemId: id, ...q })));
			}
			return { status: 'added', item: (await loadWishlist(id))[0] };
		},

		async gotIt(token, input) {
			await owner(token);
			const [item] = await db
				.select()
				.from(wishlistItems)
				.where(eq(wishlistItems.id, input.wishlistItemId));
			if (!item) throw new Error('Wishlist Item not found');
			const acquisition = await checkAcquisition(input.acquisition);
			const [[{ id }]] = (await db.batch([
				db
					.insert(records)
					.values({ albumId: item.albumId, variant: item.variant, ...acquisition })
					.returning({ id: records.id }),
				db.delete(wishlistItems).where(eq(wishlistItems.id, item.id))
			])) as unknown as [{ id: number }[], unknown];
			return oneRecord(id);
		},

		async drop(token, wishlistItemId) {
			await owner(token);
			await db.delete(wishlistItems).where(eq(wishlistItems.id, wishlistItemId));
		},

		async importRows(token, input) {
			await owner(token);
			const [{ held }] = await db
				.select({
					held: sql<number>`(SELECT count(*) FROM ${records}) + (SELECT count(*) FROM ${wishlistItems})`
				})
				.from(sql`(SELECT 1)`);
			if (held > 0) throw new Error('The Collection or Wishlist already has entries');
			const collection = input.collection.map((row) => {
				const date = row.date;
				if (!isRealDate(date)) throw new Error(`Bad date for ${row.artist} - ${row.album}`);
				const acquisition = row.acquisition;
				if (acquisition.kind === 'purchase') {
					required(acquisition.store, 'Store');
					if (!isCents(acquisition.priceCents))
						throw new Error(`Bad price for ${row.artist} - ${row.album}`);
				}
				return {
					...row,
					artist: required(row.artist, 'Artist'),
					album: required(row.album, 'Album')
				};
			});
			const wishlist = input.wishlist.map((row) => {
				if (!isDesire(row.desire)) throw new Error(`Bad Desire for ${row.artist} - ${row.album}`);
				// Prices of zero, below zero or that are not a price (PTC, ??) are not Price Quotes.
				const quotes = new Map<string, number>();
				for (const q of row.priceQuotes ?? []) {
					if (Number.isInteger(q.priceCents) && q.priceCents > 0 && clean(q.store))
						quotes.set(clean(q.store), q.priceCents);
				}
				return {
					...row,
					artist: required(row.artist, 'Artist'),
					album: required(row.album, 'Album'),
					quotes
				};
			});

			const storeNames = new Set<string>();
			for (const r of collection)
				if (r.acquisition.kind === 'purchase') storeNames.add(clean(r.acquisition.store));
			for (const r of wishlist) for (const name of r.quotes.keys()) storeNames.add(name);
			const artistNames = new Set([...collection, ...wishlist].map((r) => r.artist));

			await run([
				...[...storeNames].map((name) => db.insert(stores).values({ name }).onConflictDoNothing()),
				...[...artistNames].map((name) => db.insert(artists).values({ name }).onConflictDoNothing())
			]);
			const storeIds = new Map((await db.select().from(stores)).map((s) => [s.name, s.id]));
			const artistIds = new Map((await db.select().from(artists)).map((a) => [a.name, a.id]));

			const albumKeys = new Map<string, { artistId: number; title: string }>();
			for (const r of [...collection, ...wishlist]) {
				albumKeys.set(`${r.artist}\u0000${r.album}`, {
					artistId: artistIds.get(r.artist)!,
					title: r.album
				});
			}
			await run(
				[...albumKeys.values()].map((a) => db.insert(albums).values(a).onConflictDoNothing())
			);
			const albumIds = new Map(
				(
					await db
						.select({ id: albums.id, artistId: albums.artistId, title: albums.title })
						.from(albums)
				).map((a) => [`${a.artistId}\u0000${a.title}`, a.id])
			);
			const albumId = (artist: string, title: string) =>
				albumIds.get(`${artistIds.get(artist)}\u0000${title}`)!;

			await run(
				collection.map((r) =>
					db.insert(records).values({
						albumId: albumId(r.artist, r.album),
						variant: cleanOrNull(r.variant),
						acquisitionKind: r.acquisition.kind,
						acquisitionDate: r.date,
						storeId:
							r.acquisition.kind === 'purchase' ? storeIds.get(clean(r.acquisition.store))! : null,
						priceCents: r.acquisition.kind === 'purchase' ? r.acquisition.priceCents : null,
						giver: r.acquisition.kind === 'gift' ? cleanOrNull(r.acquisition.giver) : null
					})
				)
			);

			if (wishlist.length) {
				const inserted = (await run(
					wishlist.map((r) =>
						db
							.insert(wishlistItems)
							.values({
								albumId: albumId(r.artist, r.album),
								variant: cleanOrNull(r.variant),
								desire: r.desire
							})
							.returning({ id: wishlistItems.id })
					)
				)) as unknown as { id: number }[][];
				await run(
					wishlist.flatMap((r, i) =>
						r.quotes.size
							? [
									db.insert(priceQuotes).values(
										[...r.quotes].map(([store, priceCents]) => ({
											wishlistItemId: inserted[i][0].id,
											storeId: storeIds.get(store)!,
											priceCents
										}))
									)
								]
							: []
					)
				);
			}
			return { recordsImported: collection.length, wishlistItemsImported: wishlist.length };
		},

		async lookupNext(token, input) {
			await owner(token);
			const size = Math.max(0, Math.floor(input.size));
			const pending = await db
				.select({ id: albums.id, artist: artists.name, title: albums.title })
				.from(albums)
				.innerJoin(artists, eq(albums.artistId, artists.id))
				.where(sql`${albums.musicbrainzId} IS NULL`)
				.orderBy(albums.id)
				.limit(size);
			for (const album of pending) {
				try {
					await lookUpAlbum(album.id, album.artist, album.title);
				} catch {
					// Stays pending: skipped for this batch, retried by a later one.
				}
			}
			return progress();
		},

		async importProgress(token) {
			await owner(token);
			return progress();
		},

		async listUnmatchedAlbums(token) {
			await owner(token);
			return db
				.select({ albumId: albums.id, artist: artists.name, title: albums.title })
				.from(albums)
				.innerJoin(artists, eq(albums.artistId, artists.id))
				.where(and(eq(albums.musicbrainzId, NO_MATCH), sql`${albums.releaseYear} IS NULL`))
				.orderBy(albums.id);
		},

		async saveYears(token, input) {
			await owner(token);
			for (const { releaseYear } of input.years) {
				if (!Number.isInteger(releaseYear) || releaseYear < 1000 || releaseYear > 9999) {
					throw new Error('A release year has 4 digits');
				}
			}
			const ids = input.years.map((y) => y.albumId);
			if (!ids.length) return;
			const known = await db.select({ id: albums.id }).from(albums).where(inArray(albums.id, ids));
			if (known.length !== new Set(ids).size) throw new Error('Album not found');
			await run(
				input.years.map((y) =>
					db.update(albums).set({ releaseYear: y.releaseYear }).where(eq(albums.id, y.albumId))
				)
			);
		}
	};
}

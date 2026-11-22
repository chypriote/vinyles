import { normalize, type StudioAlbum } from './suggestions';

const USER_AGENT = 'vinyles/0.1 (personal record collection; https://github.com/chypriote/vinyles)';
const MIN_SCORE = 90;

/** The body of a response, or null once it passes `max` bytes: the read stops there. */
export async function readBody(response: Response, max: number): Promise<Uint8Array | null> {
	if (!response.body) return new Uint8Array();
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > max) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	return new Uint8Array(await new Blob(chunks as BlobPart[]).arrayBuffer());
}

/** Next time (ms since epoch) a MusicBrainz request may start. Shared by every Catalog in the isolate. */
let nextSlot = 0;

async function waitForSlot(intervalMs: number) {
	const slot = Math.max(Date.now(), nextSlot);
	nextSlot = slot + intervalMs;
	const wait = slot - Date.now();
	if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

export interface AlbumMatch {
	musicbrainzId: string;
	releaseYear: number;
}

export interface FoundCover {
	body: ArrayBuffer;
	contentType: string;
}

function quote(value: string) {
	return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

/** MusicBrainz release-group search. Null when nothing matches. Throws when the service fails. */
export async function findAlbum(
	artist: string,
	title: string,
	intervalMs: number
): Promise<AlbumMatch | null> {
	await waitForSlot(intervalMs);
	const url = new URL('https://musicbrainz.org/ws/2/release-group/');
	url.searchParams.set('query', `artist:${quote(artist)} AND releasegroup:${quote(title)}`);
	url.searchParams.set('fmt', 'json');
	url.searchParams.set('limit', '1');
	const response = await fetch(url, {
		headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
	});
	if (!response.ok) throw new Error(`MusicBrainz answered ${response.status}`);
	const data = (await response.json()) as {
		'release-groups'?: { id: string; score?: number; 'first-release-date'?: string }[];
	};
	const hit = data['release-groups']?.[0];
	if (!hit || (hit.score ?? 100) < MIN_SCORE) return null;
	const year = Number.parseInt(hit['first-release-date']?.slice(0, 4) ?? '', 10);
	if (!Number.isInteger(year)) return null;
	return { musicbrainzId: hit.id, releaseYear: year };
}

/** Front Cover from the Cover Art Archive. Null when the Album has none. */
export function findCover(musicbrainzId: string): Promise<FoundCover | null> {
	return fetchCover(`${CAA}/release-group/${encodeURIComponent(musicbrainzId)}/front-500`);
}

async function fetchCover(
	url: string,
	headers: Record<string, string> = {},
	maxBytes?: number
): Promise<FoundCover | null> {
	const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, ...headers } });
	if (response.status === 404) return null;
	if (!response.ok) throw new Error(`Cover Art Archive answered ${response.status}`);
	let body: ArrayBuffer;
	if (maxBytes === undefined) {
		body = await response.arrayBuffer();
	} else {
		const bytes = await readBody(response, maxBytes);
		if (!bytes) throw new Error('The image is too large');
		body = bytes.buffer as ArrayBuffer;
	}
	return {
		body,
		contentType: response.headers.get('content-type') ?? 'image/jpeg'
	};
}

const CAA = 'https://coverartarchive.org';
const MAX_RELEASE_CANDIDATES = 12;
const MAX_SEARCH_CANDIDATES = 5;

export type CoverSource = 'release' | 'release-group' | 'discogs' | 'deezer';

export interface FoundCandidate {
	id: string;
	source: CoverSource;
	imageUrl: string;
	artist?: string;
	title?: string;
	year?: number | null;
}

const imageUrl = (source: 'release' | 'release-group', id: string, size: 250 | 500) =>
	`${CAA}/${source}/${encodeURIComponent(id)}/front-${size}`;

async function musicBrainz<T>(url: URL, intervalMs: number): Promise<T> {
	await waitForSlot(intervalMs);
	url.searchParams.set('fmt', 'json');
	const response = await fetch(url, {
		headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
	});
	if (!response.ok) throw new Error(`MusicBrainz answered ${response.status}`);
	return (await response.json()) as T;
}

/** Releases of a release group that have a front image, at most 12. */
export async function findReleaseCandidates(
	releaseGroupId: string,
	intervalMs: number
): Promise<FoundCandidate[]> {
	const url = new URL('https://musicbrainz.org/ws/2/release/');
	url.searchParams.set('release-group', releaseGroupId);
	url.searchParams.set('limit', '100');
	const data = await musicBrainz<{
		releases?: { id: string; 'cover-art-archive'?: { front?: boolean } }[];
	}>(url, intervalMs);
	return (data.releases ?? [])
		.filter((release) => release['cover-art-archive']?.front)
		.slice(0, MAX_RELEASE_CANDIDATES)
		.map((release) => ({
			id: release.id,
			source: 'release' as const,
			imageUrl: imageUrl('release', release.id, 250)
		}));
}

/** Studio albums (primary type Album, no secondary type) credited to the Artist. */
export async function findStudioAlbums(artist: string, intervalMs: number): Promise<StudioAlbum[]> {
	const url = new URL('https://musicbrainz.org/ws/2/release-group/');
	url.searchParams.set('query', `artist:${quote(artist)} AND primarytype:album`);
	url.searchParams.set('limit', '100');
	const data = await musicBrainz<{
		'release-groups'?: {
			id: string;
			title: string;
			'primary-type'?: string;
			'secondary-types'?: string[];
			'artist-credit'?: { name: string }[];
			'first-release-date'?: string;
		}[];
	}>(url, intervalMs);
	const wanted = normalize(artist);
	return (data['release-groups'] ?? []).flatMap((hit) => {
		const year = Number.parseInt(hit['first-release-date']?.slice(0, 4) ?? '', 10);
		const studio = hit['primary-type'] === 'Album' && !hit['secondary-types']?.length;
		const credited = (hit['artist-credit'] ?? []).some((c) => normalize(c.name) === wanted);
		return studio && credited && Number.isInteger(year)
			? [{ musicbrainzId: hit.id, title: hit.title, releaseYear: year }]
			: [];
	});
}

const LASTFM = 'https://ws.audioscrobbler.com/2.0/';

async function lastFm<T>(apiKey: string, params: Record<string, string>): Promise<T> {
	const url = new URL(LASTFM);
	for (const [name, value] of Object.entries({ ...params, api_key: apiKey, format: 'json' })) {
		url.searchParams.set(name, value);
	}
	const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
	if (!response.ok) throw new Error(`Last.fm answered ${response.status}`);
	const data = (await response.json()) as T & { error?: number; message?: string };
	if (data.error) throw new Error(`Last.fm: ${data.message ?? data.error}`);
	return data;
}

/** Names of the Artists Last.fm finds similar to the Artist, most similar first. */
export async function findSimilarArtists(apiKey: string, artist: string): Promise<string[]> {
	const data = await lastFm<{ similarartists?: { artist?: { name: string }[] } }>(apiKey, {
		method: 'artist.getsimilar',
		artist,
		limit: '10'
	});
	return (data.similarartists?.artist ?? []).map((a) => a.name);
}

/** Titles of the Artist's most played Albums on Last.fm, most played first. */
export async function findTopAlbums(apiKey: string, artist: string): Promise<string[]> {
	const data = await lastFm<{ topalbums?: { album?: { name: string }[] } }>(apiKey, {
		method: 'artist.gettopalbums',
		artist,
		limit: '5'
	});
	// Last.fm names an album it cannot identify "(null)".
	return (data.topalbums?.album ?? []).map((a) => a.name).filter((name) => name !== '(null)');
}

type ReleaseGroupHits = {
	'release-groups'?: {
		id: string;
		title: string;
		'artist-credit'?: { name: string }[];
		'first-release-date'?: string;
	}[];
};

async function searchReleaseGroups(
	query: string,
	limit: number,
	intervalMs: number
): Promise<FoundCandidate[]> {
	const url = new URL('https://musicbrainz.org/ws/2/release-group/');
	url.searchParams.set('query', query);
	url.searchParams.set('limit', String(limit));
	const data = await musicBrainz<ReleaseGroupHits>(url, intervalMs);
	return (data['release-groups'] ?? []).slice(0, limit).map((hit) => {
		const year = Number.parseInt(hit['first-release-date']?.slice(0, 4) ?? '', 10);
		return {
			id: hit.id,
			source: 'release-group' as const,
			imageUrl: imageUrl('release-group', hit.id, 250),
			artist: hit['artist-credit']?.map((c) => c.name).join(', ') ?? '',
			title: hit.title,
			year: Number.isInteger(year) ? year : null
		};
	});
}

/** Top 5 release-group search hits for an Album without match. */
export function searchCandidates(
	artist: string,
	title: string,
	intervalMs: number
): Promise<FoundCandidate[]> {
	return searchReleaseGroups(
		`artist:${quote(artist)} AND releasegroup:${quote(title)} AND primarytype:album`,
		MAX_SEARCH_CANDIDATES,
		intervalMs
	);
}

/** Release-group search hits for text the Owner typed, at most 12. Empty text finds nothing. */
export async function searchTypedCandidates(
	text: string,
	intervalMs: number
): Promise<FoundCandidate[]> {
	// Lucene special characters and the uppercase operators AND, OR and NOT would break the query.
	const words = text
		.replace(/[^\p{L}\p{N}\s]/gu, ' ')
		.replace(/\b(?:AND|OR|NOT)\b/g, (word) => word.toLowerCase())
		.trim();
	if (!words) return [];
	return searchReleaseGroups(
		`(releasegroup:(${words}) OR artist:(${words})) AND primarytype:album`,
		MAX_RELEASE_CANDIDATES,
		intervalMs
	);
}

const DISCOGS_IMAGE_HOST = 'i.discogs.com';

/** Discogs master search hits with an image, at most 12. Throws when Discogs fails. */
export async function searchDiscogs(text: string, token: string): Promise<FoundCandidate[]> {
	const url = new URL('https://api.discogs.com/database/search');
	url.searchParams.set('q', text);
	url.searchParams.set('type', 'master');
	url.searchParams.set('per_page', String(MAX_RELEASE_CANDIDATES));
	const response = await fetch(url, {
		headers: { 'User-Agent': USER_AGENT, Authorization: `Discogs token=${token}` }
	});
	if (!response.ok) throw new Error(`Discogs answered ${response.status}`);
	const data = (await response.json()) as {
		results?: { title: string; year?: string; thumb?: string; cover_image?: string }[];
	};
	return (data.results ?? []).flatMap((hit) => {
		if (!hit.thumb || !hit.cover_image) return [];
		// Discogs titles read "Artist - Album".
		const [artist, ...rest] = hit.title.split(' - ');
		const year = Number.parseInt(hit.year ?? '', 10);
		return [
			{
				id: hit.cover_image,
				source: 'discogs' as const,
				imageUrl: hit.thumb,
				artist: rest.length ? artist : '',
				title: rest.length ? rest.join(' - ') : hit.title,
				year: Number.isInteger(year) ? year : null
			}
		];
	});
}

const MAX_DEEZER_CANDIDATES = 6;

/** Deezer album search hits with an image (500 px). Needs no key. Throws when Deezer fails. */
export async function searchDeezer(text: string): Promise<FoundCandidate[]> {
	const url = new URL('https://api.deezer.com/search/album');
	url.searchParams.set('q', text);
	url.searchParams.set('limit', String(MAX_DEEZER_CANDIDATES));
	const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
	if (!response.ok) throw new Error(`Deezer answered ${response.status}`);
	const data = (await response.json()) as {
		data?: {
			title: string;
			cover_medium?: string;
			cover_big?: string;
			artist?: { name: string };
		}[];
	};
	return (data.data ?? []).flatMap((hit) =>
		hit.cover_medium && hit.cover_big
			? [
					{
						id: hit.cover_big,
						source: 'deezer' as const,
						imageUrl: hit.cover_medium,
						artist: hit.artist?.name ?? '',
						title: hit.title
					}
				]
			: []
	);
}

/** The image of a candidate. Null when it has none. */
export function findCandidateImage(
	source: CoverSource,
	id: string,
	discogsToken?: string,
	maxBytes?: number
): Promise<FoundCover | null> {
	if (source === 'release' || source === 'release-group') {
		return fetchCover(imageUrl(source, id, 500), {}, maxBytes);
	}
	const url = new URL(id);
	if (source === 'deezer') {
		if (url.protocol !== 'https:' || !url.hostname.endsWith('.dzcdn.net')) {
			throw new Error('Unknown candidate');
		}
		return fetchCover(url.href, {}, maxBytes);
	}
	if (url.protocol !== 'https:' || url.host !== DISCOGS_IMAGE_HOST || !discogsToken) {
		throw new Error('Unknown candidate');
	}
	return fetchCover(url.href, { Authorization: `Discogs token=${discogsToken}` }, maxBytes);
}

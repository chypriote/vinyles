const USER_AGENT = 'vinyles/0.1 (personal record collection; https://github.com/chypriote/vinyles)';
const MIN_SCORE = 90;

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

async function fetchCover(url: string): Promise<FoundCover | null> {
	const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
	if (response.status === 404) return null;
	if (!response.ok) throw new Error(`Cover Art Archive answered ${response.status}`);
	return {
		body: await response.arrayBuffer(),
		contentType: response.headers.get('content-type') ?? 'image/jpeg'
	};
}

const CAA = 'https://coverartarchive.org';
const MAX_RELEASE_CANDIDATES = 12;
const MAX_SEARCH_CANDIDATES = 5;

export type CoverSource = 'release' | 'release-group';

export interface FoundCandidate {
	id: string;
	source: CoverSource;
	imageUrl: string;
	artist?: string;
	title?: string;
	year?: number | null;
}

const imageUrl = (source: CoverSource, id: string, size: 250 | 500) =>
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

/** Top 5 release-group search hits for an Album without match. */
export async function searchCandidates(
	artist: string,
	title: string,
	intervalMs: number
): Promise<FoundCandidate[]> {
	const url = new URL('https://musicbrainz.org/ws/2/release-group/');
	url.searchParams.set('query', `artist:${quote(artist)} AND releasegroup:${quote(title)}`);
	url.searchParams.set('limit', String(MAX_SEARCH_CANDIDATES));
	const data = await musicBrainz<{
		'release-groups'?: {
			id: string;
			title: string;
			'artist-credit'?: { name: string }[];
			'first-release-date'?: string;
		}[];
	}>(url, intervalMs);
	return (data['release-groups'] ?? []).slice(0, MAX_SEARCH_CANDIDATES).map((hit) => {
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

/** The image of a candidate. Null when it has none. */
export function findCandidateImage(source: CoverSource, id: string): Promise<FoundCover | null> {
	return fetchCover(imageUrl(source, id, 500));
}

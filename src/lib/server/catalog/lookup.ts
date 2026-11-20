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
export async function findCover(musicbrainzId: string): Promise<FoundCover | null> {
	const response = await fetch(
		`https://coverartarchive.org/release-group/${encodeURIComponent(musicbrainzId)}/front-500`,
		{
			headers: { 'User-Agent': USER_AGENT }
		}
	);
	if (response.status === 404) return null;
	if (!response.ok) throw new Error(`Cover Art Archive answered ${response.status}`);
	return {
		body: await response.arrayBuffer(),
		contentType: response.headers.get('content-type') ?? 'image/jpeg'
	};
}

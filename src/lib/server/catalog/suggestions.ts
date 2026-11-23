/** Pending Suggestions at most, all sources together. */
export const MAX_SUGGESTIONS = 20;

export const normalize = (value: string) => value.trim().toLowerCase();

/**
 * Compares titles loosely: case, accents, apostrophes and other punctuation do not count,
 * "&" is "and", the words "the", "a" and "an" are dropped, and a final "Pt I" or "Part 1" is
 * dropped ("The Sufferer & The Witness" is "Sufferer and the Witness", "The Metal Opera" is
 * "The Metal Opera Pt I").
 */
const ARTICLES = new Set(['the', 'a', 'an']);

export function titleKey(title: string): string {
	const words = title
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replaceAll('&', ' and ')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()
		.split(' ');
	const kept = words.filter((word) => !ARTICLES.has(word));
	// A title made of articles only ("A") keeps them.
	return (kept.length ? kept : words).join(' ').replace(/ (pt|part) (i|1)$/, '');
}

/** Edit distance between two short strings. */
function distance(a: string, b: string): number {
	let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		for (let j = 1; j <= b.length; j++) {
			row[j] = Math.min(
				previous[j] + 1,
				row[j - 1] + 1,
				previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
			);
		}
		previous = row;
	}
	return previous[b.length];
}

/** Digits, roman numerals and number words of a title key: "Volume 2", "Volume 3" and "Volume Two" are three Albums. */
const numbers = (key: string) =>
	key
		.match(
			/\b(\d+|[ivxlc]+|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third)\b/g
		)
		?.join(' ') ?? '';

/** Share of a title that may differ for two title keys to be the same Album ("Stone" and "Stones"). */
const TYPO_SHARE = 0.12;

/** True when two title keys are the same Album: equal, or a small spelling difference with the same numbers. */
export function similarKeys(a: string, b: string): boolean {
	if (a === b) return true;
	if (numbers(a) !== numbers(b)) return false;
	return distance(a, b) <= Math.floor(Math.max(a.length, b.length) * TYPO_SHARE);
}

/** Title keys by Artist (normalized name). */
export type TitlesByArtist = Map<string, string[]>;

export function addTitle(titles: TitlesByArtist, artist: string, title: string) {
	const name = normalize(artist);
	titles.set(name, [...(titles.get(name) ?? []), titleKey(title)]);
}

export function groupTitles(rows: { artist: string; title: string }[]): TitlesByArtist {
	const titles: TitlesByArtist = new Map();
	for (const row of rows) addTitle(titles, row.artist, row.title);
	return titles;
}

/** True when the Artist has an Album in `titles` that is the same as `title`. */
export function hasSimilar(titles: TitlesByArtist, artist: string, title: string): boolean {
	const key = titleKey(title);
	return (titles.get(normalize(artist)) ?? []).some((known) => similarKeys(known, key));
}

/** The Suggestions whose Album is not in `taken` and that no earlier Suggestion of the Artist resembles. */
export function pendingOf<T extends { artist: string; title: string }>(
	saved: T[],
	taken: TitlesByArtist
): T[] {
	const shown: TitlesByArtist = new Map();
	return saved.filter((s) => {
		if (hasSimilar(taken, s.artist, s.title) || hasSimilar(shown, s.artist, s.title)) return false;
		addTitle(shown, s.artist, s.title);
		return true;
	});
}

export interface SeedRow {
	artist: string;
	/** Records of the Artist in the Collection. */
	records: number;
	/** Highest Desire among the Artist's Wishlist Items, 0 for none. */
	maxDesire: number;
}

/** Artists with a Desire 5 Wishlist Item first, then the Artists with the most Records, then by name. */
export function rankSeeds(rows: SeedRow[]): SeedRow[] {
	return [...rows].sort(
		(a, b) =>
			Number(b.maxDesire === 5) - Number(a.maxDesire === 5) ||
			b.records - a.records ||
			a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' })
	);
}

export interface StudioAlbum {
	musicbrainzId: string;
	title: string;
	releaseYear: number;
}

/** The oldest album whose title is not in `known` (the Artist's title keys), or null. */
export function oldestUnknown(
	found: StudioAlbum[],
	known: TitlesByArtist,
	artist: string
): StudioAlbum | null {
	return (
		[...found]
			.sort((a, b) => a.releaseYear - b.releaseYear || a.title.localeCompare(b.title))
			.find((album) => !hasSimilar(known, artist, album.title)) ?? null
	);
}

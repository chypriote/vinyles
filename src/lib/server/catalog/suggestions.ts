/** Pending Suggestions at most, all sources together. */
export const MAX_SUGGESTIONS = 20;

export const normalize = (value: string) => value.trim().toLowerCase();

/**
 * Compares titles loosely: case, accents, apostrophes and other punctuation (dashes too) do not
 * count, "&" is "and", the words "the", "a" and "an" are dropped, Roman numerals and number words
 * become digits ("Act I" and "Act One" are "Act 1"), and a final "Pt 1" is dropped
 * ("The Sufferer & The Witness" is "Sufferer and the Witness", "The Metal Opera" is "The Metal Opera Pt I").
 */
const ARTICLES = new Set(['the', 'a', 'an']);
const NUMBER_WORDS: Record<string, number> = {
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
	first: 1,
	second: 2,
	third: 3
};
const ROMAN = /^(x{0,2})(ix|iv|v?i{0,3})$/;
const ROMAN_VALUE: Record<string, number> = { i: 1, v: 5, x: 10 };

/** The number a word stands for, as digits, or the word itself. */
function numeral(word: string): string {
	if (word in NUMBER_WORDS) return String(NUMBER_WORDS[word]);
	if (!word || !ROMAN.test(word)) return word;
	const values = [...word].map((letter) => ROMAN_VALUE[letter]);
	const total = values.reduce(
		(sum, value, i) => sum + (value < (values[i + 1] ?? 0) ? -value : value),
		0
	);
	return String(total);
}

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
	return (kept.length ? kept : words)
		.map(numeral)
		.join(' ')
		.replace(/ (pt|part) 1$/, '');
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

/** The digits of a title key: "Act 1" and "Act 2" are two Albums. */
const numbers = (key: string) => key.match(/\b\d+\b/g)?.join(' ') ?? '';

/** Share of a title that may differ for two title keys to be the same Album ("Stone" and "Stones"). */
const TYPO_SHARE = 0.12;

/** Shortest title that can hide a longer one: "AM" must not hide every title with the word. */
const MIN_CONTAINED_LENGTH = 4;

/** True when `inner` is whole words of `outer`: "mystery of time" in "mystery of time rock epic". */
const containsWords = (outer: string, inner: string) =>
	inner.length >= MIN_CONTAINED_LENGTH && ` ${outer} `.includes(` ${inner} `);

/**
 * True when two title keys are the same Album: equal, or the same numbers and either one title inside
 * the other ("The Mystery of Time" and "The Mystery of Time: A Rock Epic") or a small spelling difference.
 */
export function similarKeys(a: string, b: string): boolean {
	if (a === b) return true;
	if (numbers(a) !== numbers(b)) return false;
	if (containsWords(a, b) || containsWords(b, a)) return true;
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

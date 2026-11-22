/** Pending Suggestions at most, all sources together. */
export const MAX_SUGGESTIONS = 20;

export const normalize = (value: string) => value.trim().toLowerCase();

/**
 * Compares titles loosely: case, accents, apostrophes and other punctuation do not count,
 * and a final "Pt I" or "Part 1" is dropped ("The Metal Opera" is "The Metal Opera Pt I").
 */
export function titleKey(title: string): string {
	return title
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()
		.replace(/ (pt|part) (i|1)$/, '');
}

export const albumKey = (artist: string, title: string) =>
	`${normalize(artist)}|${titleKey(title)}`;

export interface SeedRow {
	artist: string;
	/** Records of the Artist in the Collection. */
	records: number;
	/** Highest Desire among the Artist's Wishlist Items, 0 for none. */
	maxDesire: number;
}

/** Artists with a Desire 3 Wishlist Item first, then the Artists with the most Records, then by name. */
export function rankSeeds(rows: SeedRow[]): SeedRow[] {
	return [...rows].sort(
		(a, b) =>
			Number(b.maxDesire === 3) - Number(a.maxDesire === 3) ||
			b.records - a.records ||
			a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' })
	);
}

export interface StudioAlbum {
	musicbrainzId: string;
	title: string;
	releaseYear: number;
}

/** The oldest album whose title is not in `known` (a set of title keys), or null. */
export function oldestUnknown(found: StudioAlbum[], known: Set<string>): StudioAlbum | null {
	return (
		[...found]
			.sort((a, b) => a.releaseYear - b.releaseYear || a.title.localeCompare(b.title))
			.find((album) => !known.has(titleKey(album.title))) ?? null
	);
}

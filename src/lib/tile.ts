/** Initials tile for a Cover with no image (COMPONENTS.md, Cover). */

/** First letters of the first two words of the artist name, upper case. */
export function initials(artist: string): string {
	const words = artist.trim().split(/\s+/).filter(Boolean).slice(0, 2);
	if (words.length === 0) return '?';
	return words.map((w) => Array.from(w)[0].toLocaleUpperCase()).join('');
}

/** Tile color index 0-3: sum of the name's character codes, modulo 4. */
export function tileIndex(artist: string): number {
	let sum = 0;
	for (let i = 0; i < artist.length; i++) sum += artist.charCodeAt(i);
	return sum % 4;
}

/** cover.tile.bg in order: highlight, success, info, accent. */
export const TILE_CLASSES = ['bg-highlight', 'bg-success', 'bg-info', 'bg-primary'] as const;

export function tileClass(artist: string): string {
	return TILE_CLASSES[tileIndex(artist)];
}

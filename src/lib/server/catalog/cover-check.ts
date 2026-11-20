/** A Cover fails below this size on its shorter side. Covers from the Cover Art Archive are at most 500 px. */
export const MIN_SIDE_PX = 400;
/** A Cover fails when its longer side is more than this times its shorter side. */
export const MAX_ASPECT_RATIO = 1.1;
/** A Cover fails below this file size: it is heavily compressed or a placeholder. */
export const MIN_FILE_BYTES = 15 * 1024;

export interface PixelSize {
	width: number;
	height: number;
}

/** The pixel size from the header of a JPEG, PNG or WebP image, or null when it is not one. */
export function imageSize(b: Uint8Array): PixelSize | null {
	const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
	const ascii = (at: number, text: string) =>
		b.length >= at + text.length && [...text].every((c, i) => b[at + i] === c.charCodeAt(0));

	if (b.length >= 24 && b[0] === 0x89 && ascii(1, 'PNG')) {
		return { width: view.getUint32(16), height: view.getUint32(20) };
	}

	if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
		let at = 2;
		while (at + 9 < b.length) {
			if (b[at] !== 0xff) return null;
			const marker = b[at + 1];
			if (marker === 0xff) {
				at += 1;
				continue;
			}
			// SOF0-SOF15 hold the size, except DHT (c4), JPG (c8) and DAC (cc).
			if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
				return { height: view.getUint16(at + 5), width: view.getUint16(at + 7) };
			}
			at += 2 + view.getUint16(at + 2);
		}
		return null;
	}

	if (ascii(0, 'RIFF') && ascii(8, 'WEBP') && b.length >= 30) {
		if (ascii(12, 'VP8X')) {
			const u24 = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
			return { width: u24(24) + 1, height: u24(27) + 1 };
		}
		if (ascii(12, 'VP8L')) {
			const bits = view.getUint32(21, true);
			return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
		}
		if (ascii(12, 'VP8 ')) {
			return {
				width: view.getUint16(26, true) & 0x3fff,
				height: view.getUint16(28, true) & 0x3fff
			};
		}
	}
	return null;
}

/** Why the image fails the quality check, or null when it passes. */
export function checkCoverImage(fileBytes: number, header: Uint8Array): string | null {
	const size = imageSize(header);
	if (!size || size.width === 0 || size.height === 0) return 'Unreadable image';
	const { width, height } = size;
	if (Math.min(width, height) < MIN_SIDE_PX) {
		return `Too small: ${width}×${height} px (at least ${MIN_SIDE_PX} px)`;
	}
	if (Math.max(width, height) / Math.min(width, height) > MAX_ASPECT_RATIO) {
		return `Not square: ${width}×${height} px`;
	}
	if (fileBytes < MIN_FILE_BYTES) {
		return `File too small: ${Math.round(fileBytes / 1024)} KB (at least ${MIN_FILE_BYTES / 1024} KB)`;
	}
	return null;
}

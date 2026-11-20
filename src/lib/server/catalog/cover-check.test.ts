import { describe, expect, it } from 'vitest';
import { imageSize } from './cover-check';

describe('imageSize', () => {
	it('reads a JPEG after other segments', () => {
		const bytes = new Uint8Array([
			0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x01, 0xf4,
			0x02, 0x58, 0x01, 0x01, 0x11, 0x00
		]);
		expect(imageSize(bytes)).toEqual({ width: 600, height: 500 });
	});

	it('reads a lossy, a lossless and an extended WebP', () => {
		const header = (chunk: string, size = 30) => {
			const b = new Uint8Array(size);
			b.set([...'RIFF'].map((c) => c.charCodeAt(0)));
			b.set(
				[...'WEBP'].map((c) => c.charCodeAt(0)),
				8
			);
			b.set(
				[...chunk].map((c) => c.charCodeAt(0)),
				12
			);
			return b;
		};
		const lossy = header('VP8 ');
		new DataView(lossy.buffer).setUint16(26, 500, true);
		new DataView(lossy.buffer).setUint16(28, 400, true);
		expect(imageSize(lossy)).toEqual({ width: 500, height: 400 });

		const lossless = header('VP8L');
		new DataView(lossless.buffer).setUint32(21, 499 | (399 << 14), true);
		expect(imageSize(lossless)).toEqual({ width: 500, height: 400 });

		const extended = header('VP8X');
		extended.set([0xf3, 0x01, 0x00, 0x8f, 0x01, 0x00], 24);
		expect(imageSize(extended)).toEqual({ width: 500, height: 400 });
	});

	it('returns null for anything else', () => {
		expect(imageSize(new Uint8Array(40))).toBeNull();
	});
});

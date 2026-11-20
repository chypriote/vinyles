import { describe, expect, it } from 'vitest';
import { initials, tileClass, tileIndex } from './tile';

describe('initials', () => {
	it('takes the first letters of the first two words', () => {
		expect(initials('Pink Floyd')).toBe('PF');
		expect(initials('the beatles band')).toBe('TB');
	});
	it('handles one word and empty names', () => {
		expect(initials('Daft')).toBe('D');
		expect(initials('  ')).toBe('?');
	});
});

describe('tileIndex', () => {
	it('is the sum of char codes modulo 4', () => {
		expect(tileIndex('AB')).toBe((65 + 66) % 4);
		expect(tileIndex('')).toBe(0);
	});
	it('is stable per artist', () => {
		expect(tileClass('Pink Floyd')).toBe(tileClass('Pink Floyd'));
	});
});

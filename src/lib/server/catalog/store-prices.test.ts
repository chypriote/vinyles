import { describe, expect, it } from 'vitest';
import {
	cheapestMatch,
	isVinyl,
	readOffers,
	readPagePrice,
	readShopifySuggestions,
	shopifySuggestUrl
} from './store-prices';

const page = (...blocks: unknown[]) =>
	blocks.map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`).join('');

describe('readOffers', () => {
	it('reads a product, a list of products and a graph', () => {
		const html = page(
			{
				'@type': 'Product',
				name: 'Air - Talkie Walkie LP',
				offers: { price: '29,99', priceCurrency: 'EUR' }
			},
			{
				'@type': 'ItemList',
				itemListElement: [
					{
						item: {
							'@type': 'Product',
							name: 'Air - Moon Safari',
							offers: [{ price: 25 }],
							url: '/p/1'
						}
					}
				]
			},
			{
				'@graph': [
					{ '@type': ['Thing', 'Product'], name: 'Air &amp; Co', offers: { lowPrice: '10.5' } }
				]
			}
		);
		expect(readOffers(html, 'https://shop.test/search')).toEqual({
			products: 3,
			offers: [
				{ name: 'Air - Talkie Walkie LP', priceCents: 2999, url: null },
				{ name: 'Air - Moon Safari', priceCents: 2500, url: 'https://shop.test/p/1' },
				{ name: 'Air & Co', priceCents: 1050, url: null }
			]
		});
	});

	it('counts a product without a euro price, and skips broken JSON', () => {
		const html =
			page({ '@type': 'Product', name: 'X', offers: { price: '9', priceCurrency: 'USD' } }) +
			'<script type="application/ld+json">{oops</script>';
		expect(readOffers(html, 'https://shop.test/')).toEqual({ products: 1, offers: [] });
		expect(readOffers('<html></html>', 'https://shop.test/')).toEqual({ products: 0, offers: [] });
	});
});

describe('cheapestMatch', () => {
	const offers = [
		{ name: 'AIR – Talkie Walkie (Orange Vinyl)', priceCents: 3500, url: null },
		{ name: 'Air: Talkie walkie LP', priceCents: 3000, url: null },
		{ name: 'Air - Moon Safari LP', priceCents: 1000, url: null }
	];

	it('takes the cheapest offer naming the Artist and the Album, ignoring case and accents', () => {
		expect(cheapestMatch(offers, 'Air', 'Talkie Walkie')?.priceCents).toBe(3000);
		expect(
			cheapestMatch(
				[{ name: 'Mötley Crüe – Shout', priceCents: 1, url: null }],
				'Motley Crue',
				'Shout'
			)
		).not.toBeNull();
	});

	it('tolerates a one-letter typo in a long word, such as the Album typed Devine for Divine', () => {
		const epica = [
			{ name: 'Epica - The Divine Conspiracy Ltd. Marbled 2 Vinyl', priceCents: 4500, url: null },
			{
				name: 'Epica - Consign To Oblivion (Expanded Edition) - 2 Vinyl',
				priceCents: 3000,
				url: null
			}
		];
		expect(cheapestMatch(epica, 'Epica', 'The Devine Conspiracy')?.priceCents).toBe(4500);
		expect(cheapestMatch(epica, 'Epica', 'The Phantom Agony')).toBeNull();
	});

	it('does not tolerate a typo in a short word, or two wrong letters', () => {
		expect(cheapestMatch(offers, 'Air', 'Moan Safari')).toBeNull();
		expect(cheapestMatch(offers, 'Air', 'Talkie Wolkee')).toBeNull();
	});

	it('finds nothing when the shop lists other records with similar words', () => {
		const other = [
			{ name: 'Grave Digger - Faces Of Pain Ltd. - Picture Vinyl', priceCents: 3000, url: null },
			{ name: 'Small Faces: Vinyl LP', priceCents: 2000, url: null }
		];
		expect(cheapestMatch(other, 'Dynazty', 'Game Of Faces')).toBeNull();
	});

	it('finds nothing for another Album', () => {
		expect(cheapestMatch(offers, 'Air', '10 000 Hz Legend')).toBeNull();
		expect(cheapestMatch(offers, 'Daft Punk', 'Talkie Walkie')).toBeNull();
	});
});

describe('readPagePrice', () => {
	it('prefers the structured data, and takes the lowest offer', () => {
		const html = page({
			'@type': 'Product',
			name: 'X',
			offers: [{ price: '30' }, { price: '25,5' }]
		});
		expect(readPagePrice(html, 'https://shop.test/p')).toBe(2550);
	});

	it('falls back to the price meta tags, in euros only', () => {
		const meta = (currency: string) =>
			`<meta property="product:price:amount" content="19,90"><meta property="product:price:currency" content="${currency}">`;
		expect(readPagePrice(meta('EUR'), 'https://shop.test/p')).toBe(1990);
		expect(readPagePrice(meta('USD'), 'https://shop.test/p')).toBeNull();
		expect(readPagePrice('<meta itemprop="price" content="12.00">', 'https://shop.test/p')).toBe(
			1200
		);
	});

	it('finds nothing on a page without a price', () => {
		expect(readPagePrice('<html>Sold out</html>', 'https://shop.test/p')).toBeNull();
	});
});

describe('Shopify suggestions', () => {
	it('builds the suggestion address from the search address', () => {
		expect(shopifySuggestUrl('https://shop.test/search?type=product&q=x', 'Air Talkie')).toBe(
			'https://shop.test/search/suggest.json?q=Air%20Talkie&resources[type]=product&resources[limit]=10'
		);
	});

	it('reads titles, prices and product addresses, and skips a product without a price', () => {
		const json = {
			resources: {
				results: {
					products: [
						{ title: 'Air &amp; Co LP', price: '29.99', url: '/products/a' },
						{ title: 'No price', price: '', url: '/products/b' },
						{ title: 'Free', price: '0.00', url: '/products/c' }
					]
				}
			}
		};
		expect(readShopifySuggestions(json, 'https://shop.test')).toEqual([
			{ name: 'Air & Co LP', priceCents: 2999, url: 'https://shop.test/products/a' }
		]);
	});

	it('is null for an answer that is not a suggestion list', () => {
		expect(readShopifySuggestions({ error: 'x' }, 'https://shop.test')).toBeNull();
		expect(readShopifySuggestions(null, 'https://shop.test')).toBeNull();
		expect(
			readShopifySuggestions({ resources: { results: { products: [] } } }, 'https://shop.test')
		).toEqual([]);
	});
});

describe('isVinyl', () => {
	it('accepts vinyl and LP names', () => {
		for (const name of [
			'Epica - The Divine Conspiracy Ltd. Marbled 2 Vinyl',
			'Back To Black 20: Deluxe Clear Vinyl 3LP',
			'Demon Days: Half-Speed Vinyl LP',
			'Air - Talkie Walkie 2LP',
			'Faces Of Pain - Vinyl'
		]) {
			expect(isVinyl(name), name).toBe(true);
		}
	});

	it('refuses a CD, a digipak, a cassette or merch', () => {
		for (const name of [
			'Evanescence - Fallen CD',
			'Evanescence - Fallen Digipak',
			'Evanescence - Fallen Cassette',
			'Evanescence - Fallen T-Shirt'
		]) {
			expect(isVinyl(name), name).toBe(false);
		}
	});
});

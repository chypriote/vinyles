import { describe, expect, it } from 'vitest';
import { cheapestMatch, readOffers } from './store-prices';

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

	it('finds nothing for another Album', () => {
		expect(cheapestMatch(offers, 'Air', '10 000 Hz Legend')).toBeNull();
		expect(cheapestMatch(offers, 'Daft Punk', 'Talkie Walkie')).toBeNull();
	});
});

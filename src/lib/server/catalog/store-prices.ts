/**
 * A Shopify shop that the Refresh searches, through its search suggestions (JSON).
 * Add a Store here to try it for every Wishlist Item. Fnac, Napalm Records and Amazon block the Worker.
 */
export interface AutomaticStore {
	name: string;
	searchUrl(query: string): string;
}

const search = (base: string) => (query: string) => `${base}${encodeURIComponent(query)}`;

export const AUTOMATIC_STORES: AutomaticStore[] = [
	{
		name: 'Nuclear Blast',
		searchUrl: search('https://www.nuclearblast.com/search?type=product&q=')
	},
	{ name: 'Impericon', searchUrl: search('https://www.impericon.com/search?type=product&q=') },
	{ name: 'Sound of Vinyl', searchUrl: search('https://thesoundofvinyl.com/search?q=') },
	{ name: 'AFM Records', searchUrl: search('https://www.afm-records.de/search?type=product&q=') }
];

/** The JSON address of the product suggestions of a Shopify shop for a search. */
export function shopifySuggestUrl(searchUrl: string, query: string): string {
	return `${new URL(searchUrl).origin}/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=10`;
}

export interface Offer {
	name: string;
	priceCents: number;
	url: string | null;
}

export interface PageOffers {
	/** Products found in the structured data. 0 means the page cannot be read. */
	products: number;
	/** Products with a price in euros. */
	offers: Offer[];
}

const JSON_LD = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

type Json = unknown;
const isObject = (value: Json): value is Record<string, Json> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

function isProduct(node: Record<string, Json>) {
	const type = node['@type'];
	return type === 'Product' || (Array.isArray(type) && type.includes('Product'));
}

function toCents(price: Json): number | null {
	const text = typeof price === 'number' ? String(price) : typeof price === 'string' ? price : '';
	const match = text
		.trim()
		.replace(',', '.')
		.match(/^\d+(\.\d{1,2})?$/);
	return match ? Math.round(Number(match[0]) * 100) : null;
}

/** The lowest euro price among the offers of a product. */
function offerPrice(offers: Json): number | null {
	const prices: number[] = [];
	for (const offer of Array.isArray(offers) ? offers : [offers]) {
		if (!isObject(offer)) continue;
		const currency = offer.priceCurrency;
		if (currency !== undefined && currency !== 'EUR') continue;
		const cents = toCents(offer.price ?? offer.lowPrice);
		if (cents !== null && cents > 0) prices.push(cents);
	}
	return prices.length ? Math.min(...prices) : null;
}

function decode(text: string) {
	return text
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'");
}

/** Products and euro prices in the JSON-LD of a page: a product page, or a search page that lists products. */
export function readOffers(html: string, pageUrl: string): PageOffers {
	const result: PageOffers = { products: 0, offers: [] };
	const visit = (node: Json) => {
		if (Array.isArray(node)) return node.forEach(visit);
		if (!isObject(node)) return;
		if (isProduct(node)) {
			result.products += 1;
			const priceCents = offerPrice(node.offers);
			if (priceCents !== null && typeof node.name === 'string') {
				result.offers.push({
					name: decode(node.name),
					priceCents,
					url: absolute(node.url, pageUrl)
				});
			}
		}
		Object.values(node).forEach(visit);
	};
	for (const [, body] of html.matchAll(JSON_LD)) {
		try {
			visit(JSON.parse(body));
		} catch {
			// Not valid JSON: skip this block.
		}
	}
	return result;
}

function absolute(url: Json, base: string): string | null {
	if (typeof url !== 'string') return null;
	try {
		return new URL(url, base).href;
	} catch {
		return null;
	}
}

const words = (text: string) =>
	text
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()
		.split(' ')
		.filter(Boolean);

/** True when the two words differ by one letter at most (inserted, removed or changed). */
function oneLetterApart(a: string, b: string): boolean {
	if (Math.abs(a.length - b.length) > 1) return false;
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
	return (
		a.slice(i + 1) === b.slice(i + 1) ||
		a.slice(i) === b.slice(i + 1) ||
		a.slice(i + 1) === b.slice(i)
	);
}

/** Every word of the phrase is in the name. A word of 5 letters or more may have one letter wrong. */
function hasWords(name: string[], phrase: string) {
	return words(phrase).every((word) =>
		name.some((n) => n === word || (word.length >= 5 && oneLetterApart(n, word)))
	);
}

/**
 * The cheapest offer whose name has the words of the Artist and of the Album, in any order.
 * A typo of one letter in a long word is tolerated. The Variant is ignored.
 */
export function cheapestMatch(offers: Offer[], artist: string, album: string): Offer | null {
	const matches = offers.filter((o) => {
		const name = words(o.name);
		return hasWords(name, artist) && hasWords(name, album);
	});
	return matches.sort((a, b) => a.priceCents - b.priceCents)[0] ?? null;
}

const META = /<meta\s[^>]*>/gi;

function attribute(tag: string, name: string) {
	return tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];
}

/** The price of the one product on a page: structured data first, then the price meta tags. */
export function readPagePrice(html: string, pageUrl: string): number | null {
	const offers = readOffers(html, pageUrl).offers;
	if (offers.length) return Math.min(...offers.map((o) => o.priceCents));
	let amount: number | null = null;
	let currency: string | undefined;
	for (const [tag] of html.matchAll(META)) {
		const key = (attribute(tag, 'property') ?? attribute(tag, 'itemprop') ?? '').toLowerCase();
		const content = attribute(tag, 'content');
		if (key === 'product:price:amount' || key === 'og:price:amount' || key === 'price') {
			amount ??= toCents(content);
		} else if (key === 'product:price:currency' || key === 'og:price:currency') {
			currency = content;
		}
	}
	return amount !== null && amount > 0 && (currency === undefined || currency === 'EUR')
		? amount
		: null;
}

/** Offers in a Shopify suggestion answer, in euros. Null when the answer is not one. */
export function readShopifySuggestions(json: unknown, origin: string): Offer[] | null {
	const products = (json as { resources?: { results?: { products?: unknown } } } | null)?.resources
		?.results?.products;
	if (!Array.isArray(products)) return null;
	const offers: Offer[] = [];
	for (const p of products) {
		const priceCents = toCents(p?.price);
		if (typeof p?.title !== 'string' || priceCents === null || priceCents <= 0) continue;
		offers.push({ name: decode(p.title), priceCents, url: absolute(p.url, origin) });
	}
	return offers;
}

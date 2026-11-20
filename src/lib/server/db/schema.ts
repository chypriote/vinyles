import { sql } from 'drizzle-orm';
import {
	check,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';

export const artists = sqliteTable('artist', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull().unique()
});

export const albums = sqliteTable(
	'album',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		artistId: integer('artist_id')
			.notNull()
			.references(() => artists.id),
		title: text('title').notNull(),
		/** Null until set by the lookup or by the Owner. */
		releaseYear: integer('release_year'),
		/** Cover key in R2. */
		coverKey: text('cover_key'),
		musicbrainzId: text('musicbrainz_id')
	},
	(t) => [uniqueIndex('album_artist_title_unique').on(t.artistId, t.title)]
);

export const stores = sqliteTable('store', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull().unique()
});

export const records = sqliteTable('record', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	albumId: integer('album_id')
		.notNull()
		.references(() => albums.id),
	variant: text('variant'),
	acquisitionKind: text('acquisition_kind', { enum: ['purchase', 'gift'] }).notNull(),
	/** ISO date (YYYY-MM-DD). */
	acquisitionDate: text('acquisition_date').notNull(),
	/** Purchase only. */
	storeId: integer('store_id').references(() => stores.id),
	/** Purchase only, euro cents. */
	priceCents: integer('price_cents'),
	/** Gift only, optional. */
	giver: text('giver')
});

export const wishlistItems = sqliteTable(
	'wishlist_item',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		albumId: integer('album_id')
			.notNull()
			.references(() => albums.id),
		variant: text('variant'),
		desire: integer('desire').notNull()
	},
	(t) => [check('wishlist_item_desire_range', sql`${t.desire} BETWEEN 1 AND 3`)]
);

export const priceQuotes = sqliteTable(
	'price_quote',
	{
		wishlistItemId: integer('wishlist_item_id')
			.notNull()
			.references(() => wishlistItems.id, { onDelete: 'cascade' }),
		storeId: integer('store_id')
			.notNull()
			.references(() => stores.id),
		priceCents: integer('price_cents').notNull()
	},
	// One per Store per Wishlist Item.
	(t) => [primaryKey({ columns: [t.wishlistItemId, t.storeId] })]
);

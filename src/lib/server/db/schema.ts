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
		/** True once the Owner picked the Cover: a later lookup keeps it. */
		coverChosen: integer('cover_chosen', { mode: 'boolean' }).notNull().default(false),
		/** Bumped when the Cover image changes, so that its cached URL changes too. */
		coverVersion: integer('cover_version').notNull().default(0),
		musicbrainzId: text('musicbrainz_id'),
		/** `coverVersion` the quality check ran on. Null until checked; stale after a Cover change. */
		coverCheckedVersion: integer('cover_checked_version'),
		/** Why the checked Cover fails. Null for a pass. */
		coverCheckReason: text('cover_check_reason')
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
		priceCents: integer('price_cents').notNull(),
		/** Page the price was read from. Null for a price the Owner typed. */
		url: text('url')
	},
	// One per Store per Wishlist Item.
	(t) => [primaryKey({ columns: [t.wishlistItemId, t.storeId] })]
);

CREATE TABLE `album` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`artist_id` integer NOT NULL,
	`title` text NOT NULL,
	`release_year` integer,
	`cover_key` text,
	`musicbrainz_id` text,
	FOREIGN KEY (`artist_id`) REFERENCES `artist`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `album_artist_title_unique` ON `album` (`artist_id`,`title`);--> statement-breakpoint
CREATE TABLE `artist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artist_name_unique` ON `artist` (`name`);--> statement-breakpoint
CREATE TABLE `price_quote` (
	`wishlist_item_id` integer NOT NULL,
	`store_id` integer NOT NULL,
	`price_cents` integer NOT NULL,
	PRIMARY KEY(`wishlist_item_id`, `store_id`),
	FOREIGN KEY (`wishlist_item_id`) REFERENCES `wishlist_item`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `record` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`album_id` integer NOT NULL,
	`variant` text,
	`acquisition_kind` text NOT NULL,
	`acquisition_date` text NOT NULL,
	`store_id` integer,
	`price_cents` integer,
	`giver` text,
	FOREIGN KEY (`album_id`) REFERENCES `album`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `store` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `store_name_unique` ON `store` (`name`);--> statement-breakpoint
CREATE TABLE `wishlist_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`album_id` integer NOT NULL,
	`variant` text,
	`desire` integer NOT NULL,
	FOREIGN KEY (`album_id`) REFERENCES `album`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "wishlist_item_desire_range" CHECK("wishlist_item"."desire" BETWEEN 1 AND 3)
);

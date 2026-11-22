CREATE TABLE `suggestion` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`artist` text NOT NULL,
	`title` text NOT NULL,
	`release_year` integer,
	`musicbrainz_id` text,
	`source` text NOT NULL,
	`reason` text NOT NULL,
	`rank` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suggestion_artist_title_unique` ON `suggestion` (`artist`,`title`);
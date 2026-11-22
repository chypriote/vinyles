CREATE TABLE `discarded_album` (
	`album_id` integer PRIMARY KEY NOT NULL,
	FOREIGN KEY (`album_id`) REFERENCES `album`(`id`) ON UPDATE no action ON DELETE cascade
);

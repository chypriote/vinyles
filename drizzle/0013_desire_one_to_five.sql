PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__old_price_quote` AS SELECT * FROM `price_quote`;--> statement-breakpoint
CREATE TABLE `__old_product_link` AS SELECT * FROM `product_link`;--> statement-breakpoint
CREATE TABLE `__new_wishlist_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`album_id` integer NOT NULL,
	`variant` text,
	`desire` integer NOT NULL,
	`refreshed_at` text,
	FOREIGN KEY (`album_id`) REFERENCES `album`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "wishlist_item_desire_range" CHECK("__new_wishlist_item"."desire" BETWEEN 1 AND 5)
);
--> statement-breakpoint
INSERT INTO `__new_wishlist_item`("id", "album_id", "variant", "desire", "refreshed_at") SELECT "id", "album_id", "variant", CASE "desire" WHEN 2 THEN 3 WHEN 3 THEN 5 ELSE "desire" END, "refreshed_at" FROM `wishlist_item`;--> statement-breakpoint
DROP TABLE `wishlist_item`;--> statement-breakpoint
ALTER TABLE `__new_wishlist_item` RENAME TO `wishlist_item`;--> statement-breakpoint
INSERT INTO `price_quote` SELECT * FROM `__old_price_quote`;--> statement-breakpoint
INSERT INTO `product_link` SELECT * FROM `__old_product_link`;--> statement-breakpoint
DROP TABLE `__old_price_quote`;--> statement-breakpoint
DROP TABLE `__old_product_link`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
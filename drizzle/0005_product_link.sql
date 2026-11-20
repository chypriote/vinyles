CREATE TABLE `product_link` (
	`wishlist_item_id` integer NOT NULL,
	`store_id` integer NOT NULL,
	`url` text NOT NULL,
	PRIMARY KEY(`wishlist_item_id`, `store_id`),
	FOREIGN KEY (`wishlist_item_id`) REFERENCES `wishlist_item`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON UPDATE no action ON DELETE no action
);

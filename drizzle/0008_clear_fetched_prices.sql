-- Fetched prices may be CDs (a Refresh accepted any format): delete them and let the schedule fetch them again.
DELETE FROM `price_quote` WHERE `url` IS NOT NULL;--> statement-breakpoint
UPDATE `wishlist_item` SET `refreshed_at` = NULL;

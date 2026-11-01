CREATE TABLE `pf_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`purchase_date` text NOT NULL,
	`firm` text NOT NULL,
	`account_label` text NOT NULL,
	`currency` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_pf_purchases_user_date` ON `pf_purchases` (`user_id`,`purchase_date`);
ALTER TABLE `trade_entries` ADD `entry_at` text;--> statement-breakpoint
ALTER TABLE `trade_entries` ADD `is_backfilled` integer DEFAULT 0 NOT NULL;
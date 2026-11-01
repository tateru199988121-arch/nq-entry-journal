CREATE TABLE `sop_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`steps_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trade_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`direction` text NOT NULL,
	`mood` text NOT NULL,
	`strategy_title` text NOT NULL,
	`steps_json` text NOT NULL,
	`checks_json` text NOT NULL,
	`before_note` text NOT NULL,
	`created_at` text NOT NULL,
	`status` text NOT NULL,
	`result` text,
	`reflection` text,
	`closed_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_trade_entries_user_created` ON `trade_entries` (`user_id`,`created_at`);
ALTER TABLE `trade_entries` ADD `contract` text;--> statement-breakpoint
ALTER TABLE `trade_entries` ADD `quantity` integer;--> statement-breakpoint
ALTER TABLE `trade_entries` ADD `entry_price` real;--> statement-breakpoint
ALTER TABLE `trade_entries` ADD `target_price` real;--> statement-breakpoint
ALTER TABLE `trade_entries` ADD `stop_price` real;--> statement-breakpoint
ALTER TABLE `trade_entries` ADD `exit_price` real;--> statement-breakpoint
ALTER TABLE `trade_entries` ADD `net_pnl_usd` real;
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sopSettings = sqliteTable("sop_settings", {
  userId: text("user_id").primaryKey(),
  title: text("title").notNull(),
  stepsJson: text("steps_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const journalCollaborators = sqliteTable("journal_collaborators", {
  email: text("email").primaryKey(),
  role: text("role").notNull(),
  addedAt: text("added_at").notNull(),
});

export const pfPurchases = sqliteTable("pf_purchases", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  purchaseDate: text("purchase_date").notNull(),
  firm: text("firm").notNull(),
  accountLabel: text("account_label").notNull(),
  currency: text("currency").notNull(),
  amountCents: integer("amount_cents").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
}, table => [index("idx_pf_purchases_user_date").on(table.userId, table.purchaseDate)]);

export const tradeEntries = sqliteTable("trade_entries", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  direction: text("direction").notNull(),
  mood: text("mood").notNull(),
  strategyTitle: text("strategy_title").notNull(),
  stepsJson: text("steps_json").notNull(),
  checksJson: text("checks_json").notNull(),
  beforeNote: text("before_note").notNull(),
  contract: text("contract"),
  quantity: integer("quantity"),
  entryPrice: real("entry_price"),
  targetPrice: real("target_price"),
  stopPrice: real("stop_price"),
  exitPrice: real("exit_price"),
  netPnlUsd: real("net_pnl_usd"),
  createdAt: text("created_at").notNull(),
  status: text("status").notNull(),
  entryAt: text("entry_at"),
  backfilled: integer("is_backfilled").notNull().default(0),
  result: text("result"),
  reflection: text("reflection"),
  closedAt: text("closed_at"),
  updatedAt: text("updated_at"),
}, table => [
  index("idx_trade_entries_user_created").on(table.userId, table.createdAt),
  index("idx_trade_entries_user_closed").on(table.userId, table.closedAt),
]);

import { env } from "cloudflare:workers";
import type { Contract } from "./trade-math";

export type Trade = {
  id: string; direction: "做多" | "做空"; mood: string; strategyTitle: string;
  steps: string[]; checks: boolean[]; beforeNote: string; createdAt: string; entryAt: string; backfilled: boolean;
  contract: Contract | null; quantity: number | null;
  entryPrice: number | null; targetPrice: number | null; stopPrice: number | null;
  exitPrice: number | null; netPnlUsd: number | null;
  status: "open" | "closed"; result: "止盈" | "止損" | "提早平倉" | null;
  reflection: string | null; closedAt: string | null; updatedAt: string | null;
};

export type TradeEdits = Pick<Trade, "strategyTitle" | "direction" | "mood" | "checks" | "beforeNote" | "contract" | "quantity" | "entryPrice" | "targetPrice" | "stopPrice" | "exitPrice" | "netPnlUsd" | "result" | "reflection"> & {entryAt?:string;closedAt?:string|null};

export type Strategy = { id: string; title: string; direction: "做多" | "做空"; steps: string[] };

export const STRATEGY_BLUEPRINTS: Omit<Strategy, "steps">[] = [
  { id: "asia-low-reversal-long", title: "亞洲低反轉多", direction: "做多" },
  { id: "asia-low-continuation-short", title: "亞洲低延續空", direction: "做空" },
  { id: "asia-high-continuation-long", title: "亞洲高延續多", direction: "做多" },
  { id: "asia-high-reversal-short", title: "亞洲高反轉空", direction: "做空" },
];

function isOwnerEmail(email: string): boolean {
  const ownerEmail = env.OWNER_EMAIL?.trim().toLowerCase();
  return Boolean(ownerEmail) && email === ownerEmail;
}
export const JOURNAL_ID = "personal-nq-journal";
export type Role = "owner" | "editor" | "viewer";
export type Collaborator = { email: string; role: "editor" | "viewer"; addedAt: string };

function db() {
  if (!env.DB) throw new Error("交易資料庫暫時無法使用");
  return env.DB;
}

export async function getRole(email: string): Promise<Role | null> {
  const normalized = email.trim().toLowerCase();
  if (isOwnerEmail(normalized)) return "owner";
  const row = await db().prepare("SELECT role FROM journal_collaborators WHERE email = ?").bind(normalized).first<{role:string}>();
  return row?.role === "editor" || row?.role === "viewer" ? row.role : null;
}

export async function listCollaborators(): Promise<Collaborator[]> {
  const result = await db().prepare("SELECT email, role, added_at FROM journal_collaborators ORDER BY added_at DESC").all<{email:string;role:"editor"|"viewer";added_at:string}>();
  return (result.results ?? []).map(row => ({ email: row.email, role: row.role, addedAt: row.added_at }));
}

export async function setCollaborator(email: string, role: "editor" | "viewer") {
  const normalized = email.trim().toLowerCase();
  if (isOwnerEmail(normalized)) throw new Error("擁有者的權限不能修改");
  await db().prepare("INSERT INTO journal_collaborators (email, role, added_at) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET role = excluded.role")
    .bind(normalized, role, new Date().toISOString()).run();
}

export async function removeCollaborator(email: string) {
  await db().prepare("DELETE FROM journal_collaborators WHERE email = ?").bind(email.trim().toLowerCase()).run();
}

function readStrategies(row: {title:string;steps_json:string} | null): Strategy[] {
  if (!row) return STRATEGY_BLUEPRINTS.map(strategy => ({ ...strategy, steps: [] }));
  const value: unknown = JSON.parse(row.steps_json);
  if (Array.isArray(value)) {
    return STRATEGY_BLUEPRINTS.map((strategy, index) => ({
      ...strategy,
      title: index === 0 ? row.title.replace(/^NQ\s*/, "") : strategy.title,
      steps: index === 0 ? value as string[] : [],
    }));
  }
  const saved = (value as {version?:number;strategies?:Strategy[]})?.strategies;
  if (!Array.isArray(saved)) throw new Error("策略資料格式不正確");
  return STRATEGY_BLUEPRINTS.map(blueprint => {
    const item = saved.find(strategy => strategy.id === blueprint.id);
    return { ...blueprint, title: item?.title ?? blueprint.title, steps: item?.steps ?? [] };
  });
}

export async function loadStrategies(userId: string): Promise<Strategy[]> {
  const row = await db().prepare("SELECT title, steps_json FROM sop_settings WHERE user_id = ?")
    .bind(userId).first<{title:string;steps_json:string}>();
  return readStrategies(row);
}

export async function loadJournal(userId: string) {
  const [strategies, tradesRows] = await Promise.all([
    loadStrategies(userId),
    db().prepare("SELECT * FROM trade_entries WHERE user_id = ? ORDER BY COALESCE(entry_at, created_at) DESC, created_at DESC LIMIT 200").bind(userId).all<Record<string, unknown>>(),
  ]);
  return {
    strategies,
    trades: (tradesRows.results ?? []).map(rowToTrade),
  };
}

function rowToTrade(row: Record<string, unknown>): Trade {
  return {
      id: row.id, direction: row.direction, mood: row.mood, strategyTitle: row.strategy_title,
      steps: JSON.parse(row.steps_json as string), checks: JSON.parse(row.checks_json as string),
      beforeNote: row.before_note, createdAt: row.created_at, entryAt: row.entry_at ?? row.created_at, backfilled: row.is_backfilled === 1, status: row.status,
      contract: row.contract, quantity: row.quantity, entryPrice: row.entry_price,
      targetPrice: row.target_price, stopPrice: row.stop_price,
      exitPrice: row.exit_price, netPnlUsd: row.net_pnl_usd,
      result: row.result, reflection: row.reflection, closedAt: row.closed_at, updatedAt: row.updated_at ?? null,
    } as Trade;
}

export async function loadCalendarTrades(userId: string, month: string): Promise<Trade[]> {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1) - 24 * 60 * 60 * 1000).toISOString();
  const end = new Date(Date.UTC(year, monthNumber, 1) + 24 * 60 * 60 * 1000).toISOString();
  const rows = await db().prepare("SELECT * FROM trade_entries WHERE user_id = ? AND status = 'closed' AND closed_at >= ? AND closed_at < ? ORDER BY closed_at ASC")
    .bind(userId, start, end).all<Record<string, unknown>>();
  return (rows.results ?? []).map(rowToTrade);
}

export async function saveStrategies(userId: string, strategies: Strategy[]) {
  await db().prepare("INSERT INTO sop_settings (user_id, title, steps_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET title = excluded.title, steps_json = excluded.steps_json, updated_at = excluded.updated_at")
    .bind(userId, "NQ 四策略", JSON.stringify({ version: 2, strategies }), new Date().toISOString()).run();
}

export async function createTrade(userId: string, input: {direction:string;mood:string;strategyTitle:string;steps:string[];checks:boolean[];beforeNote:string;contract:Contract;quantity:number;entryPrice:number;targetPrice:number;stopPrice:number;entryAt?:string;closedAt?:string;result?:Trade["result"];reflection?:string;exitPrice?:number|null;netPnlUsd?:number|null;backfilled?:boolean}) {
  const id = crypto.randomUUID();
  const recordedAt = new Date().toISOString(), backfilled = input.backfilled === true;
  await db().prepare("INSERT INTO trade_entries (id,user_id,direction,mood,strategy_title,steps_json,checks_json,before_note,contract,quantity,entry_price,target_price,stop_price,created_at,entry_at,is_backfilled,status,result,reflection,exit_price,net_pnl_usd,closed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id,userId,input.direction,input.mood,input.strategyTitle,JSON.stringify(input.steps),JSON.stringify(input.checks),input.beforeNote,input.contract,input.quantity,input.entryPrice,input.targetPrice,input.stopPrice,recordedAt,input.entryAt ?? recordedAt,backfilled ? 1 : 0,backfilled ? "closed" : "open",backfilled ? input.result ?? null : null,backfilled ? input.reflection ?? "" : null,backfilled ? input.exitPrice ?? null : null,backfilled ? input.netPnlUsd ?? null : null,backfilled ? input.closedAt ?? null : null).run();
  return id;
}

export async function finishTrade(userId: string, id: string, result: string, reflection: string, exitPrice: number | null, netPnlUsd: number | null, closedAt?: string) {
  const response = await db().prepare("UPDATE trade_entries SET status = 'closed', result = ?, reflection = ?, exit_price = ?, net_pnl_usd = ?, closed_at = ? WHERE id = ? AND user_id = ? AND status = 'open'")
    .bind(result, reflection, exitPrice, netPnlUsd, closedAt ?? new Date().toISOString(), id, userId).run();
  return (response.meta.changes ?? 0) > 0;
}

export async function openTradeHasEntryPrice(userId: string, id: string): Promise<boolean | null> {
  const row = await db().prepare("SELECT entry_price FROM trade_entries WHERE id = ? AND user_id = ? AND status = 'open'")
    .bind(id, userId).first<{entry_price:number|null}>();
  return row ? row.entry_price !== null : null;
}

export async function findTrade(userId: string, id: string): Promise<Trade | null> {
  const row = await db().prepare("SELECT * FROM trade_entries WHERE id = ? AND user_id = ?").bind(id, userId).first<Record<string, unknown>>();
  return row ? rowToTrade(row) : null;
}

export async function updateTrade(userId: string, id: string, input: TradeEdits) {
  const response = await db().prepare("UPDATE trade_entries SET strategy_title = ?, direction = ?, mood = ?, checks_json = ?, before_note = ?, contract = ?, quantity = ?, entry_price = ?, target_price = ?, stop_price = ?, exit_price = ?, net_pnl_usd = ?, result = ?, reflection = ?, entry_at = COALESCE(?,entry_at), closed_at = COALESCE(?,closed_at), updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(input.strategyTitle, input.direction, input.mood, JSON.stringify(input.checks), input.beforeNote, input.contract, input.quantity, input.entryPrice, input.targetPrice, input.stopPrice, input.exitPrice, input.netPnlUsd, input.result, input.reflection, input.entryAt ?? null, input.closedAt ?? null, new Date().toISOString(), id, userId).run();
  return (response.meta.changes ?? 0) > 0;
}

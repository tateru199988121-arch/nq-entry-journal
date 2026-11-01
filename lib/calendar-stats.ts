import type { Trade } from "./journal-db";
import { grossPnlUsd } from "./trade-math";

export const CALENDAR_TIME_ZONE = "Asia/Taipei";

export function taipeiDateKey(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CALENDAR_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function effectivePnl(trade: Trade): { value: number | null; estimated: boolean } {
  if (trade.netPnlUsd !== null && Number.isFinite(trade.netPnlUsd)) return { value: trade.netPnlUsd, estimated: false };
  if (trade.contract && trade.quantity !== null && trade.entryPrice !== null && trade.exitPrice !== null)
    return { value: grossPnlUsd(trade.direction, trade.entryPrice, trade.exitPrice, trade.contract, trade.quantity), estimated: true };
  return { value: null, estimated: false };
}

export type Summary = {
  total: number | null; count: number; known: number; missing: number; estimated: number;
  wins: number; losses: number; flat: number; mismatched: number; winRate: number | null; profitFactor: number | null;
};

export function summarize(trades: Trade[]): Summary {
  let total = 0, known = 0, estimated = 0, wins = 0, losses = 0, flat = 0, gains = 0, lossAmount = 0, mismatched = 0;
  for (const trade of trades) {
    const pnl = effectivePnl(trade);
    if (pnl.value === null) continue;
    known++;
    if (pnl.estimated) estimated++;
    if (trade.result === "止損" && pnl.value > 0 || trade.result === "止盈" && pnl.value < 0) mismatched++;
    total += pnl.value;
    if (pnl.value > 0) { wins++; gains += pnl.value; }
    else if (pnl.value < 0) { losses++; lossAmount += Math.abs(pnl.value); }
    else flat++;
  }
  return {
    total: known || trades.length === 0 ? Math.round(total * 100) / 100 : null,
    count: trades.length, known, missing: trades.length - known, estimated,
    wins, losses, flat, mismatched, winRate: known ? wins / known : null,
    profitFactor: lossAmount ? gains / lossAmount : gains ? Infinity : null,
  };
}

export function byTaipeiDay(trades: Trade[]): Map<string, Trade[]> {
  const days = new Map<string, Trade[]>();
  for (const trade of trades) {
    if (!trade.closedAt) continue;
    const key = taipeiDateKey(trade.closedAt);
    days.set(key, [...(days.get(key) ?? []), trade]);
  }
  return days;
}

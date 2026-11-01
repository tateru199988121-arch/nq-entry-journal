import { env } from "cloudflare:workers";
import { JOURNAL_ID } from "./journal-db";
import type { PfPurchase, PfPurchaseInput } from "./pf-costs";

function db() {
  if (!env.DB) throw new Error("購買紀錄暫時無法使用");
  return env.DB;
}

function fromRow(row: Record<string, unknown>): PfPurchase {
  return {
    id: row.id as string, purchaseDate: row.purchase_date as string,
    firm: row.firm as string, accountLabel: row.account_label as string,
    currency: row.currency as PfPurchase["currency"], amountCents: row.amount_cents as number,
    createdAt: row.created_at as string, updatedAt: row.updated_at as string | null,
  };
}

export async function loadPfPurchases(): Promise<PfPurchase[]> {
  const rows = await db().prepare("SELECT * FROM pf_purchases WHERE user_id = ? ORDER BY purchase_date DESC, created_at DESC")
    .bind(JOURNAL_ID).all<Record<string, unknown>>();
  return (rows.results ?? []).map(fromRow);
}

export async function savePfPurchase(input: PfPurchaseInput, amountCents: number, action: "create" | "update") {
  if (action === "create") {
    // A retained client ID makes retrying a saved purchase safe after a lost response.
    await db().prepare("INSERT INTO pf_purchases (id,user_id,purchase_date,firm,account_label,currency,amount_cents,created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING")
      .bind(input.id,JOURNAL_ID,input.purchaseDate,input.firm.trim(),input.accountLabel.trim(),input.currency,amountCents,new Date().toISOString()).run();
  } else {
    const result = await db().prepare("UPDATE pf_purchases SET purchase_date=?,firm=?,account_label=?,currency=?,amount_cents=?,updated_at=? WHERE id=? AND user_id=?")
      .bind(input.purchaseDate,input.firm.trim(),input.accountLabel.trim(),input.currency,amountCents,new Date().toISOString(),input.id,JOURNAL_ID).run();
    if (!result.meta.changes) return false;
  }
  const saved = await db().prepare("SELECT * FROM pf_purchases WHERE id=? AND user_id=?").bind(input.id,JOURNAL_ID).first<Record<string, unknown>>();
  if (!saved) return false;
  if (action === "create" && (saved.purchase_date !== input.purchaseDate || saved.firm !== input.firm.trim() || saved.account_label !== input.accountLabel.trim() || saved.currency !== input.currency || saved.amount_cents !== amountCents)) return "conflict";
  return true;
}

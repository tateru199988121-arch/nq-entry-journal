export const PF_CURRENCIES = ["USD", "TWD"] as const;
export type PfCurrency = typeof PF_CURRENCIES[number];
export type PfPurchase = {
  id: string; purchaseDate: string; firm: string; accountLabel: string;
  currency: PfCurrency; amountCents: number; createdAt: string; updatedAt: string | null;
};
export type PfPurchaseInput = Pick<PfPurchase, "id" | "purchaseDate" | "firm" | "accountLabel" | "currency"> & { amount: string };

export function moneyToCents(value: unknown): number | null {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function validPurchaseDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function summarizePurchases(purchases: PfPurchase[]) {
  const totals: Record<PfCurrency, number> = { USD: 0, TWD: 0 };
  for (const purchase of purchases) totals[purchase.currency] += purchase.amountCents;
  return { count: purchases.length, totals };
}

export function formatPfMoney(cents: number, currency: PfCurrency) {
  return `${currency} ${new Intl.NumberFormat("en-US", {minimumFractionDigits:2,maximumFractionDigits:2}).format(cents / 100)}`;
}

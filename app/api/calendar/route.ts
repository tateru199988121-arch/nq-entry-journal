import { JOURNAL_ID, loadCalendarTrades } from "@/lib/journal-db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0,4)) < 1000) return Response.json({ error: "月份格式不正確" }, { status: 400 });
  try {
    return Response.json({ trades: await loadCalendarTrades(JOURNAL_ID, month) }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
  } catch (error) {
    console.error("Calendar load failed", error);
    return Response.json({ error: "目前無法載入日曆，請稍後重試" }, { status: 503 });
  }
}

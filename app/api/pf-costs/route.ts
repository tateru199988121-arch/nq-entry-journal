import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getRole } from "@/lib/journal-db";
import { moneyToCents, PF_CURRENCIES, validPurchaseDate, type PfPurchaseInput } from "@/lib/pf-costs";
import { loadPfPurchases, savePfPurchase } from "@/lib/pf-db";

export const dynamic = "force-dynamic";
const responseHeaders = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
function fail(message: string, status = 400) { return Response.json({error:message}, {status,headers:responseHeaders}); }

export async function GET() {
  try { return Response.json({purchases:await loadPfPurchases()}, {headers:responseHeaders}); }
  catch (error) { console.error("PF purchases load failed",error); return fail("暫時無法載入購買紀錄，請稍後重試",503); }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") return fail("請從交易日誌網站操作",403);
  const user = await getChatGPTUser();
  if (!user) return fail("請先登入後使用",401);
  try {
    const role = await getRole(user.email);
    if (role !== "owner" && role !== "editor") return fail("你目前只能觀看，無法修改購買紀錄",403);
    let body: Record<string,unknown>;
    try { body = await request.json(); } catch { return fail("資料格式不正確"); }
    if (!body || typeof body !== "object" || Array.isArray(body) || !(body.action === "create" || body.action === "update")) return fail("未知的操作");
    if (typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) return fail("購買紀錄編號格式不正確");
    if (!validPurchaseDate(body.purchaseDate)) return fail("請填寫有效的購買日期");
    if (typeof body.firm !== "string" || !body.firm.trim() || body.firm.trim().length > 100 || typeof body.accountLabel !== "string" || body.accountLabel.trim().length > 100) return fail("請填寫公司名稱，名稱與方案最多 100 字");
    if (!PF_CURRENCIES.includes(body.currency as PfPurchaseInput["currency"])) return fail("請選擇金額的幣別");
    const amountCents = moneyToCents(body.amount);
    if (amountCents === null) return fail("金額需為 0 以上，最多兩位小數");
    const saved = await savePfPurchase(body as PfPurchaseInput,amountCents,body.action);
    if (saved === "conflict") return fail("這筆購買已儲存，且金額或資料不同。請重新載入紀錄，再使用修改功能更正。",409);
    if (!saved) return fail("找不到這筆購買紀錄",404);
    return Response.json({ok:true,purchases:await loadPfPurchases()}, {headers:responseHeaders});
  } catch (error) { console.error("PF purchase save failed",error); return fail("儲存失敗，輸入內容仍保留，請稍後重試",503); }
}

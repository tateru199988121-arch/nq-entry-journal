import { getChatGPTUser } from "@/app/chatgpt-auth";
import { createTrade, findTrade, finishTrade, getRole, JOURNAL_ID, listCollaborators, loadJournal, loadStrategies, removeCollaborator, saveStrategies, setCollaborator, STRATEGY_BLUEPRINTS, updateTrade, type Strategy, type TradeEdits } from "@/lib/journal-db";
import { isValidPrice, isValidQuantity, plannedPoints, type Contract } from "@/lib/trade-math";
import { tradeTimeError } from "@/lib/trade-time";

export const dynamic = "force-dynamic";

function fail(message: string, status = 400) { return Response.json({ error: message }, { status }); }
function validSteps(value: unknown): value is string[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= 12 && value.every(item => typeof item === "string" && item.trim().length > 0 && item.length <= 120);
}
function validPortfolio(value: unknown): value is Strategy[] {
  if (!Array.isArray(value) || value.length !== STRATEGY_BLUEPRINTS.length) return false;
  return STRATEGY_BLUEPRINTS.every(blueprint => {
    const strategy = value.find(item => item?.id === blueprint.id);
    return strategy && typeof strategy.title === "string" && strategy.title.trim().length > 0 && strategy.title.length <= 100
      && Array.isArray(strategy.steps) && strategy.steps.length <= 12
      && strategy.steps.every((step: unknown) => typeof step === "string" && step.trim().length > 0 && step.length <= 120);
  });
}

export async function GET() {
  const user = await getChatGPTUser();
  try {
    const role = user ? await getRole(user.email) ?? "viewer" : "viewer";
    return Response.json({ ...await loadJournal(JOURNAL_ID), role, currentEmail: user?.email ?? null, collaborators: role === "owner" ? await listCollaborators() : [] }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
  }
  catch (error) { console.error("Journal load failed", error); return fail("目前無法載入紀錄，請稍後重試", 503); }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return fail("請從交易日誌網站操作", 403);
  const user = await getChatGPTUser();
  if (!user) return fail("請先登入後使用", 401);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return fail("資料格式不正確"); }
  try {
    const role = await getRole(user.email);
    if (!role) return fail("你尚未取得這份日誌的權限", 403);
    if (body.action === "share") {
      if (role !== "owner") return fail("只有擁有者可以管理分享權限", 403);
      if (typeof body.email !== "string" || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || !(["editor", "viewer"].includes(body.role as string))) return fail("請輸入有效的電子郵件與權限");
      await setCollaborator(body.email, body.role as "editor" | "viewer");
      return Response.json({ ok: true });
    }
    if (body.action === "unshare") {
      if (role !== "owner") return fail("只有擁有者可以管理分享權限", 403);
      if (typeof body.email !== "string" || body.email.length > 254) return fail("電子郵件格式不正確");
      await removeCollaborator(body.email);
      return Response.json({ ok: true });
    }
    if (role === "viewer") return fail("你的權限是觀看，無法修改這份日誌", 403);
    if (body.action === "update") {
      if (typeof body.id !== "string") return fail("交易編號格式不正確");
      const current = await findTrade(JOURNAL_ID, body.id);
      if (!current) return fail("找不到這筆紀錄", 404);
      const entryAt = body.entryAt === undefined ? current.entryAt : body.entryAt;
      const closedAt = current.status === "closed" ? body.closedAt === undefined ? current.closedAt : body.closedAt : null;
      if (current.status === "closed" && closedAt === null) return fail("已平倉的交易需要平倉時間");
      const timeError = tradeTimeError(entryAt,closedAt);
      if (timeError) return fail(timeError);
      if (typeof body.strategyTitle !== "string" || !body.strategyTitle.trim() || body.strategyTitle.trim().length > 100 || !(body.direction === "做多" || body.direction === "做空") || !(["平穩", "猶豫", "怕錯過", "急躁", "疲累"].includes(body.mood as string)) || typeof body.beforeNote !== "string" || body.beforeNote.length > 2000 || !Array.isArray(body.checks) || body.checks.length !== current.steps.length || !body.checks.every(item => typeof item === "boolean")) return fail("交易資料格式不正確");
      const noPlan = [body.contract, body.quantity, body.entryPrice, body.targetPrice, body.stopPrice].every(value => value === null);
      if (!noPlan) {
        if (!(body.contract === "MNQ" || body.contract === "NQ") || !isValidQuantity(body.quantity) || !isValidPrice(body.entryPrice) || !isValidPrice(body.targetPrice) || !isValidPrice(body.stopPrice)) return fail("請填寫有效的合約、口數與 0.25 點間距價位");
        const points = plannedPoints(body.direction, body.entryPrice, body.targetPrice, body.stopPrice);
        if (points.reward <= 0 || points.risk <= 0) return fail("預計止盈與止損的方向不正確");
      }
      const exitPrice = body.exitPrice ?? null, netPnlUsd = body.netPnlUsd ?? null;
      if (exitPrice !== null && !isValidPrice(exitPrice)) return fail("出場價必須是有效的 0.25 點間距價位");
      if (netPnlUsd !== null && (typeof netPnlUsd !== "number" || !Number.isFinite(netPnlUsd) || Math.abs(netPnlUsd) > 1_000_000_000)) return fail("實際淨損益格式不正確");
      if (current.status === "closed" && (!(["止盈", "止損", "提早平倉"].includes(body.result as string)) || typeof body.reflection !== "string" || body.reflection.length > 4000)) return fail("出場紀錄格式不正確");
      if (current.status === "closed" && !noPlan && exitPrice === null && netPnlUsd === null) return fail("請填出場點位或實際淨損益，至少一項");
      await updateTrade(JOURNAL_ID, body.id, {
        strategyTitle: body.strategyTitle.trim(), direction: body.direction, mood: body.mood as string,
        checks: body.checks as boolean[], beforeNote: body.beforeNote,
        contract: noPlan ? null : body.contract as Contract, quantity: noPlan ? null : body.quantity as number,
        entryPrice: noPlan ? null : body.entryPrice as number, targetPrice: noPlan ? null : body.targetPrice as number, stopPrice: noPlan ? null : body.stopPrice as number,
        exitPrice: current.status === "closed" ? exitPrice as number | null : null,
        netPnlUsd: current.status === "closed" && netPnlUsd !== null ? Math.round((netPnlUsd as number) * 100) / 100 : null,
        result: current.status === "closed" ? body.result as TradeEdits["result"] : null,
        reflection: current.status === "closed" ? body.reflection as string : null,
        entryAt: entryAt as string, closedAt: closedAt as string | null,
      });
      return Response.json({ ok: true });
    }
    if (body.action === "settings") {
      if (!validPortfolio(body.strategies)) return fail("策略名稱或步驟格式不正確");
      const strategies = STRATEGY_BLUEPRINTS.map(blueprint => {
        const item = (body.strategies as Strategy[]).find(strategy => strategy.id === blueprint.id)!;
        return { ...blueprint, title: item.title.trim(), steps: item.steps.map(step => step.trim()) };
      });
      if (new Set(strategies.map(strategy => strategy.title)).size !== strategies.length) return fail("四個策略需要不同的名稱");
      await saveStrategies(JOURNAL_ID, strategies);
      return Response.json({ ok: true });
    }
    if (body.action === "create" || body.action === "backfill") {
      const backfilled = body.action === "backfill";
      const entryAt = backfilled ? body.entryAt : new Date().toISOString();
      const closedAt = backfilled ? body.closedAt : null;
      if (backfilled && (closedAt === null || closedAt === undefined)) return fail("請填寫實際平倉時間");
      const timeError = tradeTimeError(entryAt,closedAt);
      if (timeError) return fail(timeError);
      if (backfilled && (!(["止盈","止損","提早平倉"].includes(body.result as string)) || typeof body.reflection !== "string" || body.reflection.length > 4000)) return fail("請選擇出場方式並確認心得格式");
      const exitPrice = backfilled ? body.exitPrice ?? null : null, netPnlUsd = backfilled ? body.netPnlUsd ?? null : null;
      if (exitPrice !== null && !isValidPrice(exitPrice)) return fail("出場價必須是有效的 0.25 點間距價位");
      if (netPnlUsd !== null && (typeof netPnlUsd !== "number" || !Number.isFinite(netPnlUsd) || Math.abs(netPnlUsd) > 1_000_000_000)) return fail("實際淨損益格式不正確");
      if (backfilled && exitPrice === null && netPnlUsd === null) return fail("請填出場點位或實際淨損益，至少一項");
      if (typeof body.strategyId !== "string" || !(["平穩", "猶豫", "怕錯過", "急躁", "疲累"].includes(body.mood as string)) || !Array.isArray(body.checks) || !body.checks.every(item => typeof item === "boolean") || typeof body.beforeNote !== "string" || body.beforeNote.length > 2000) return fail("進場紀錄格式不正確");
      if (!(body.contract === "MNQ" || body.contract === "NQ") || !isValidQuantity(body.quantity) || !isValidPrice(body.entryPrice) || !isValidPrice(body.targetPrice) || !isValidPrice(body.stopPrice)) return fail("請填寫有效的合約、口數與 0.25 點間距的進出場價位");
      const savedStrategy = (await loadStrategies(JOURNAL_ID)).find(item => item.id === body.strategyId);
      const oneOff = body.strategyId === "random" || body.strategyId === "custom";
      if (!savedStrategy && !oneOff) return fail("找不到選擇的策略", 404);
      if (oneOff && !(body.direction === "做多" || body.direction === "做空")) return fail("請選擇交易方向");
      if (body.strategyId === "custom" && (typeof body.customTitle !== "string" || !body.customTitle.trim() || body.customTitle.trim().length > 100)) return fail("請填寫臨時策略名稱");
      if (oneOff && (!Array.isArray(body.customSteps) || body.customSteps.length > 12 || !body.customSteps.every(step => typeof step === "string" && step.trim() && step.length <= 120))) return fail("臨時 SOP 格式不正確");
      const strategy = savedStrategy ?? {
        id: body.strategyId as string,
        title: body.strategyId === "random" ? "亂做單" : (body.customTitle as string).trim(),
        direction: body.direction as "做多" | "做空",
        steps: body.strategyId === "random" ? [] : (body.customSteps as string[]).map(step => step.trim()),
      };
      if (savedStrategy && !(backfilled && strategy.steps.length === 0) && !validSteps(strategy.steps)) return fail("請先設定此策略的進場 SOP");
      if (body.checks.length !== strategy.steps.length) return fail("SOP 已更新，請重新確認勾選項目");
      const points = plannedPoints(strategy.direction, body.entryPrice, body.targetPrice, body.stopPrice);
      if (points.reward <= 0 || points.risk <= 0) return fail("預計止盈與止損必須分別位於進場價兩側，且符合策略方向");
      const id = await createTrade(JOURNAL_ID, {direction:strategy.direction,mood:body.mood as string,strategyTitle:strategy.title,steps:strategy.steps,checks:body.checks,beforeNote:body.beforeNote as string,contract:body.contract as Contract,quantity:body.quantity,entryPrice:body.entryPrice,targetPrice:body.targetPrice,stopPrice:body.stopPrice,entryAt:entryAt as string,closedAt:backfilled ? closedAt as string : undefined,backfilled,result:backfilled ? body.result as TradeEdits["result"] : null,reflection:backfilled ? body.reflection as string : undefined,exitPrice:exitPrice as number|null,netPnlUsd:netPnlUsd === null ? null : Math.round((netPnlUsd as number)*100)/100});
      return Response.json({ ok: true, id });
    }
    if (body.action === "finish") {
      if (typeof body.id !== "string" || !(["止盈", "止損", "提早平倉"].includes(body.result as string)) || typeof body.reflection !== "string" || body.reflection.length > 4000) return fail("出場紀錄格式不正確");
      const exitPrice = body.exitPrice == null ? null : body.exitPrice;
      const netPnlUsd = body.netPnlUsd == null ? null : body.netPnlUsd;
      if (exitPrice !== null && !isValidPrice(exitPrice)) return fail("出場價必須是有效的 0.25 點間距價位");
      if (netPnlUsd !== null && (typeof netPnlUsd !== "number" || !Number.isFinite(netPnlUsd) || Math.abs(netPnlUsd) > 1_000_000_000)) return fail("實際淨損益格式不正確");
      const trade = await findTrade(JOURNAL_ID,body.id);
      if (!trade || trade.status !== "open") return fail("找不到這筆進行中的紀錄",404);
      const closedAt = body.closedAt === undefined ? new Date().toISOString() : body.closedAt;
      if (closedAt === null) return fail("請填寫有效的平倉時間");
      const timeError = tradeTimeError(trade.entryAt,closedAt);
      if (timeError) return fail(timeError);
      const hasEntryPrice = trade.entryPrice !== null;
      if (hasEntryPrice && exitPrice === null && netPnlUsd === null) return fail("請填出場點位或實際淨損益，至少一項");
      if (!await finishTrade(JOURNAL_ID, body.id, body.result as string, body.reflection, exitPrice, netPnlUsd === null ? null : Math.round(netPnlUsd * 100) / 100,closedAt as string)) return fail("找不到這筆進行中的紀錄", 404);
      return Response.json({ ok: true });
    }
    return fail("未知的操作");
  } catch (error) { console.error("Journal save failed", error); return fail("儲存失敗，內容還在畫面上，請稍後重試", 503); }
}

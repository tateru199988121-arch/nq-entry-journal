"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, Clock3, NotebookPen, Plus, Receipt, Settings2, Trash2, TrendingDown, TrendingUp, Users } from "lucide-react";
import CalendarDashboard from "./calendar-dashboard";
import PfCostsPanel from "./pf-costs-panel";
import { BackfillTimes, BackfillOutcome, emptyBackfill, backfillData, backfillError } from "./backfill-fields";
import { fromTaipeiDateTimeInput, taipeiDateTimeInput, tradeTimeError } from "@/lib/trade-time";
import TradeEditor, { exitResults, type ExitResult } from "./trade-editor";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Collaborator, Role, Strategy, Trade, TradeEdits } from "@/lib/journal-db";
import { grossPnlUsd, isValidPrice, isValidQuantity, nqEquivalentContracts, plannedPoints, plannedUsd, POINT_VALUE_USD, type Contract } from "@/lib/trade-math";
import { effectivePnl } from "@/lib/calendar-stats";

const defaults: Strategy[] = [
  { id: "asia-low-reversal-long", title: "亞洲低反轉多", direction: "做多", steps: [] },
  { id: "asia-low-continuation-short", title: "亞洲低延續空", direction: "做空", steps: [] },
  { id: "asia-high-continuation-long", title: "亞洲高延續多", direction: "做多", steps: [] },
  { id: "asia-high-reversal-short", title: "亞洲高反轉空", direction: "做空", steps: [] },
];
const moods = ["平穩", "猶豫", "怕錯過", "急躁", "疲累"];

async function request(body?: Record<string, unknown>): Promise<{strategies:Strategy[];trades:Trade[];role:Role;currentEmail:string|null;collaborators:Collaborator[];ok?:boolean}> {
  const response = await fetch("/api/journal", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await response.json() as {error?:string;strategies:Strategy[];trades:Trade[];role:Role;currentEmail:string|null;collaborators:Collaborator[];ok?:boolean};
  if (!response.ok) throw new Error(data.error || "操作失敗，請稍後重試");
  return data;
}

function when(date: string) { return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", dateStyle: "medium", timeStyle: "short" }).format(new Date(date)); }
function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value); }
function price(value: number) { return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value); }
function readNumber(value: string): number | null { return value.trim() === "" ? null : Number(value); }

function StrategyChoice({ strategy, selected, onSelect }: {strategy:Strategy;selected:boolean;onSelect:()=>void}) {
  const isLong = strategy.direction === "做多";
  const DirectionIcon = isLong ? TrendingUp : TrendingDown;
  return <button type="button" className={`strategy-choice with-direction ${isLong ? "direction-long" : "direction-short"} ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={onSelect}>
    <span className="strategy-icon" aria-hidden="true"><DirectionIcon size={23} strokeWidth={2.4}/></span>
    <div className="strategy-copy"><strong>{strategy.title}</strong><span>{strategy.direction} · {strategy.steps.length ? `${strategy.steps.length} 個 SOP 步驟` : "尚未設定 SOP"}</span></div>
  </button>;
}

function TradeSummary({ trade, onOpen }: {trade:Trade;onOpen:()=>void}) {
  const pnl = trade.status === "closed" ? effectivePnl(trade) : {value:null,estimated:false};
  const pnlClass = pnl.value === null || pnl.value === 0 ? "" : pnl.value > 0 ? "positive" : "negative";
  const statusClass = trade.status === "open" ? "open" : trade.result === "止盈" ? "profit" : trade.result === "提早平倉" ? "manual" : "loss";
  return <button type="button" className="trade-summary" onClick={onOpen} aria-label={`查看 ${when(trade.entryAt)} ${trade.strategyTitle} 的交易紀錄`}>
    <div className="trade-summary-main"><div className="trade-summary-heading"><span>{when(trade.entryAt)}</span><span className={`status-chip ${statusClass}`}>{trade.status === "open" ? "進行中" : trade.result ?? "已完成"}</span>{trade.backfilled && <span className="status-chip backfilled">補登</span>}</div><strong>{trade.direction} · {trade.strategyTitle}</strong><div className="trade-summary-meta"><span>{trade.contract ? `${trade.contract} × ${trade.quantity ?? "—"} 口` : "合約未記錄"}</span><span>情緒：{trade.mood}</span><span>{trade.checks.length ? `SOP ${trade.checks.filter(Boolean).length}/${trade.checks.length}` : "無 SOP"}</span></div></div>
    <div className="trade-summary-result"><strong className={pnlClass}>{trade.status === "open" ? "待填出場" : pnl.value === null ? "損益未填" : money(pnl.value)}</strong><span>{trade.status === "closed" && pnl.value !== null ? pnl.estimated ? "估算毛損益" : "實際淨損益" : ""}</span><small>查看紀錄</small></div>
  </button>;
}

function TradeCard({ trade, onFinish, onUpdate, onDirtyChange, busy, readOnly }: {trade:Trade;onFinish:(id:string,result:ExitResult,reflection:string,exitPrice:number|null,netPnlUsd:number|null,closedAt?:string)=>Promise<void>;onUpdate:(id:string,edits:TradeEdits)=>Promise<boolean>;onDirtyChange:(dirty:boolean)=>void;busy:boolean;readOnly:boolean}) {
  const [result, setResult] = useState<ExitResult | "">("");
  const [editing, setEditing] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [reflection, setReflection] = useState("");
  const [exitInput, setExitInput] = useState("");
  const [netInput, setNetInput] = useState("");
  const [closeTimeInput, setCloseTimeInput] = useState("");
  const selectedClosedAt = closeTimeInput ? fromTaipeiDateTimeInput(closeTimeInput) : undefined;
  const closeTimeError = closeTimeInput ? selectedClosedAt ? tradeTimeError(trade.entryAt,selectedClosedAt) : "請填寫有效的平倉時間" : null;
  const [displayContract, setDisplayContract] = useState<Contract>(trade.contract ?? "MNQ");
  const exitNumber = readNumber(exitInput);
  const netNumber = readNumber(netInput);
  const exitValid = exitNumber === null || isValidPrice(exitNumber);
  const netValid = netNumber === null || Number.isFinite(netNumber) && Math.abs(netNumber) <= 1_000_000_000;
  const hasPlan = trade.contract !== null && trade.quantity !== null && trade.entryPrice !== null && trade.targetPrice !== null && trade.stopPrice !== null;
  const plan = hasPlan ? plannedPoints(trade.direction, trade.entryPrice!, trade.targetPrice!, trade.stopPrice!) : null;
  const liveGross = hasPlan && exitNumber !== null && isValidPrice(exitNumber) ? grossPnlUsd(trade.direction, trade.entryPrice!, exitNumber, trade.contract!, trade.quantity!) : null;
  const closedGross = hasPlan && trade.exitPrice !== null ? grossPnlUsd(trade.direction, trade.entryPrice!, trade.exitPrice, trade.contract!, trade.quantity!) : null;
  const canFinish = !!result && exitValid && netValid && !closeTimeError && (!hasPlan || exitNumber !== null || netNumber !== null);
  const dirty = editing ? editorDirty : trade.status === "open" && !!(result || reflection || exitInput || netInput || closeTimeInput);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  return <article className="trade-card">
    <div className="trade-top"><div><span className="section-label">{when(trade.entryAt)}</span><h3>{trade.direction} · {trade.strategyTitle}</h3></div><span className={trade.status === "open" ? "status-chip open" : trade.result === "止盈" ? "status-chip profit" : trade.result === "提早平倉" ? "status-chip manual" : "status-chip loss"}>{trade.status === "open" ? "進行中" : trade.result}</span></div>
    {editing ? <TradeEditor trade={trade} busy={busy} onSave={edits => onUpdate(trade.id, edits)} onCancel={() => setEditing(false)} onDirtyChange={setEditorDirty}/> : <><div className="trade-meta"><span>情緒：{trade.mood}</span><span>{trade.checks.length ? `SOP：${trade.checks.filter(Boolean).length}/${trade.checks.length} 項符合` : "無 SOP 步驟"}</span></div>
    {trade.backfilled && <p className="backfill-recorded-note">補登於 {when(trade.createdAt)}</p>}
    <ul className="snapshot-list">{trade.steps.map((step, index) => <li key={index}><span className={trade.checks[index] ? "met" : "unmet"}>{trade.checks[index] ? "✓" : "—"}</span>{step}</li>)}</ul>
    {hasPlan && plan && <div className="plan-snapshot"><div className="plan-heading"><strong>進場計畫</strong><div className="mini-switch"><button type="button" className={displayContract === "MNQ" ? "selected" : ""} onClick={() => setDisplayContract("MNQ")}>MNQ</button><button type="button" className={displayContract === "NQ" ? "selected" : ""} onClick={() => setDisplayContract("NQ")}>NQ 換算</button></div></div><p>{trade.contract} × {trade.quantity} 口 · 進場 {price(trade.entryPrice!)} · 止盈 {price(trade.targetPrice!)} · 止損 {price(trade.stopPrice!)}</p><div className="plan-stats"><span>預計盈利 <strong>{money(plannedUsd(plan.reward, displayContract, trade.quantity!))}</strong></span><span>預計虧損 <strong>{money(plannedUsd(plan.risk, displayContract, trade.quantity!))}</strong></span></div><small>{displayContract === trade.contract ? "依實際合約與口數計算" : `假設同樣 ${trade.quantity} 口 ${displayContract}，僅供換算；實際仍為 ${trade.contract}`}</small></div>}
    {trade.beforeNote && <div className="note-block note-prose"><strong>進場想法</strong><p>{trade.beforeNote}</p></div>}
    {trade.status === "open" ? readOnly ? <p className="read-only-note">進行中 · 你目前只有觀看權限</p> : <div className="exit-form">
      <div className="close-time-field"><label className="field-label" htmlFor={`close-time-${trade.id}`}>實際平倉時間 · 台北 <span className="optional">選填</span></label><input id={`close-time-${trade.id}`} className="text-input" type="datetime-local" min="2000-01-01T00:00" max={taipeiDateTimeInput(new Date().toISOString())} disabled={busy} value={closeTimeInput} onChange={event=>setCloseTimeInput(event.target.value)}/><p className="calculation-hint">未填時採用現在時間；補寫先前的出場結果時可自行選擇。</p>{closeTimeError && <p className="alert error">{closeTimeError}</p>}</div>
      <label className="field-label">這筆單如何出場？</label><div className="segmented">{exitResults.map(item => <button type="button" key={item} className={result === item ? "selected" : ""} onClick={() => setResult(item)}>{item}</button>)}</div>
      <div className="price-grid exit-prices"><div><label className="field-label" htmlFor={`exit-${trade.id}`}>實際出場點位 <span className="optional">選填</span></label><input id={`exit-${trade.id}`} className="text-input" type="number" inputMode="decimal" min="0" step="0.25" value={exitInput} onChange={event => setExitInput(event.target.value)} placeholder="例如 21025.25"/></div><div><label className="field-label" htmlFor={`net-${trade.id}`}>實際淨損益 USD <span className="optional">選填</span></label><input id={`net-${trade.id}`} className="text-input" type="number" inputMode="decimal" step="0.01" value={netInput} onChange={event => setNetInput(event.target.value)} placeholder="可含手續費，例如 -35.50"/></div></div>
      {liveGross !== null && <p className="calculation-hint">依出場價估算毛損益：<strong>{money(liveGross)}</strong>（未扣手續費）</p>}
      {netNumber !== null && (result === "止損" && netNumber > 0 || result === "止盈" && netNumber < 0) && <p className="sop-warning">金額正負號與出場標記不一致，請確認是否填對。</p>}
      {hasPlan && exitNumber === null && netNumber === null && <p className="calculation-hint">請填出場點位或實際淨損益，至少一項。</p>}
      <label className="field-label reflection-label" htmlFor={`reflection-${trade.id}`}>交易心得 <span className="optional">選填</span></label><Textarea id={`reflection-${trade.id}`} className="journal-textarea" maxLength={4000} value={reflection} onChange={event => setReflection(event.target.value)} placeholder="當下執行得如何？下次要保持或調整什麼？"/>
      <div className="form-actions"><span>出場方式由你手動確認</span><button type="button" className="primary-button" disabled={!canFinish || busy} onClick={() => onFinish(trade.id, result as ExitResult, reflection, exitNumber, netNumber, selectedClosedAt ?? undefined)}>{busy ? "儲存中…" : "完成這筆紀錄"}</button></div>
    </div> : <><div className="note-block"><strong>出場與損益</strong><p>{trade.exitPrice !== null ? `出場 ${price(trade.exitPrice)} · ` : ""}{trade.netPnlUsd !== null ? `實際淨損益 ${money(trade.netPnlUsd)}` : closedGross !== null ? `估算毛損益 ${money(closedGross)}` : "未記錄損益"}</p>{trade.netPnlUsd !== null && closedGross !== null && <p className="muted-note">依出場價估算毛損益 {money(closedGross)}，未扣手續費</p>}<small>出場：{trade.closedAt ? when(trade.closedAt) : "—"}</small></div><div className="note-block note-prose"><strong>交易心得</strong><p className={trade.reflection ? undefined : "empty-note"}>{trade.reflection || "未填寫"}</p></div></>}
    {trade.updatedAt && <p className="edited-note">最後修改：{when(trade.updatedAt)}</p>}{!readOnly && <button type="button" className="secondary-button edit-record-button" disabled={busy} onClick={() => setEditing(true)}>修改紀錄</button>}</>}
  </article>;
}

export default function Home() {
  const [tab, setTab] = useState("new");
  const [strategies, setStrategies] = useState<Strategy[]>(defaults);
  const [selectedStrategyId, setSelectedStrategyId] = useState(defaults[0].id);
  const [oneOffTitle, setOneOffTitle] = useState("");
  const [oneOffDirection, setOneOffDirection] = useState<"做多" | "做空">("做多");
  const [oneOffSteps, setOneOffSteps] = useState<string[]>([]);
  const [draftStrategy, setDraftStrategy] = useState<Strategy>(defaults[0]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [detailDirty, setDetailDirty] = useState(false);
  const [pfDirty, setPfDirty] = useState(false);
  const [pfBusy, setPfBusy] = useState(false);
  const journalSectionRef = useRef<HTMLElement>(null);
  const listScrollRef = useRef(0);
  const [role, setRole] = useState<Role>("viewer");
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState<"viewer" | "editor">("viewer");
  const [checks, setChecks] = useState<boolean[]>([]);
  const [mood, setMood] = useState("");
  const [contract, setContract] = useState<Contract>("MNQ");
  const [displayContract, setDisplayContract] = useState<Contract>("MNQ");
  const [quantityInput, setQuantityInput] = useState("1");
  const [entryInput, setEntryInput] = useState("");
  const [targetInput, setTargetInput] = useState("");
  const [stopInput, setStopInput] = useState("");
  const [beforeNote, setBeforeNote] = useState("");
  const [isBackfill, setIsBackfill] = useState(false);
  const [backfillDraft, setBackfillDraft] = useState({...emptyBackfill});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const isOneOff = selectedStrategyId === "random" || selectedStrategyId === "custom";
  const selectedStrategy: Strategy = selectedStrategyId === "random"
    ? { id: "random", title: "亂做單", direction: oneOffDirection, steps: [] }
    : selectedStrategyId === "custom"
      ? { id: "custom", title: oneOffTitle.trim() || "臨時策略", direction: oneOffDirection, steps: oneOffSteps }
      : strategies.find(strategy => strategy.id === selectedStrategyId) ?? strategies[0];
  const quantity = readNumber(quantityInput);
  const entry = readNumber(entryInput);
  const target = readNumber(targetInput);
  const stop = readNumber(stopInput);
  const pricesValid = isValidPrice(entry) && isValidPrice(target) && isValidPrice(stop);
  const plan = pricesValid ? plannedPoints(selectedStrategy.direction, entry, target, stop) : null;
  const planValid = !!plan && plan.reward > 0 && plan.risk > 0 && isValidQuantity(quantity);

  function selectStrategy(id: string) {
    if (id === "random" || id === "custom") {
      setSelectedStrategyId(id); setChecks(id === "custom" ? oneOffSteps.map(() => false) : []);
      setError(""); return;
    }
    const strategy = strategies.find(item => item.id === id);
    if (!strategy) return;
    if (tab === "settings" && id !== selectedStrategyId && !isOneOff && JSON.stringify(draftStrategy) !== JSON.stringify(selectedStrategy) && !window.confirm("這個策略有尚未儲存的修改。確定要切換嗎？")) return;
    setSelectedStrategyId(id);
    setDraftStrategy(strategy);
    setChecks(strategy.steps.map(() => false));
    if (tab === "new") { setEntryInput(""); setTargetInput(""); setStopInput(""); }
    setError("");
  }

  async function reload() {
    const data = await request();
    setStrategies(data.strategies);
    setDraftStrategy(data.strategies.find(strategy => strategy.id === selectedStrategyId) ?? data.strategies[0]);
    setTrades(data.trades); setRole(data.role); setCurrentEmail(data.currentEmail); setCollaborators(data.collaborators);
    if (data.role === "viewer") setTab("journal");
    return data;
  }
  useEffect(() => { reload().then(data => setChecks(data.strategies[0].steps.map(() => false))).catch(err => setError(err.message)).finally(() => setLoading(false)); }, []);
  useEffect(() => {
    const context = (document as unknown as { modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: unknown) => { try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(console.error); } catch (error) { console.error(error); } };
    register({ name: "read_nq_journal", title: "讀取 NQ 交易日誌", description: "讀取目前使用者的四個策略與最近交易紀錄。", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, async execute() { const data = await reload(); return { strategies: data.strategies, trades: data.trades }; } });
    register({ name: "read_nq_calendar_month", title: "讀取月交易紀錄", description: "依指定月份讀取平倉交易，供台北時間盈虧日曆與月總結使用。", inputSchema: { type: "object", properties: { month: { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" } }, required: ["month"], additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, async execute(input: unknown) { const value = input as {month?:unknown}; if (typeof value.month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)) throw new Error("月份格式不正確"); const response = await fetch(`/api/calendar?month=${value.month}`); const data = await response.json() as {error?:string;trades:Trade[]}; if (!response.ok) throw new Error(data.error || "讀取日曆失敗"); setTab("calendar"); return data; } });
    register({ name: "update_nq_trade_record", title: "修改 NQ 交易紀錄", description: "更正指定交易的出場方式、出場點位、淨損益或心得，保留原本交易日期。", inputSchema: { type: "object", properties: { id: { type: "string" }, result: { type: "string", enum: ["止盈", "止損", "提早平倉"] }, exitPrice: { type: ["number", "null"] }, netPnlUsd: { type: ["number", "null"] }, reflection: { type: "string" } }, required: ["id"], additionalProperties: false }, annotations: { readOnlyHint: false }, async execute(input: unknown) { const value = input as Record<string, unknown>; const data = await request(); const trade = data.trades.find(item => item.id === value.id); if (!trade) throw new Error("找不到這筆交易"); const edits: TradeEdits = {strategyTitle:trade.strategyTitle,direction:trade.direction,mood:trade.mood,checks:trade.checks,beforeNote:trade.beforeNote,contract:trade.contract,quantity:trade.quantity,entryPrice:trade.entryPrice,targetPrice:trade.targetPrice,stopPrice:trade.stopPrice,exitPrice:trade.exitPrice,netPnlUsd:trade.netPnlUsd,result:trade.result,reflection:trade.reflection,...value}; await request({action:"update",...edits,id:trade.id}); const updated = await reload(); setTab("journal"); return {updated:true,trade:updated.trades.find(item => item.id === trade.id)}; } });
    register({ name: "save_nq_sop", title: "儲存 NQ 進場 SOP", description: "儲存指定策略的名稱及進場步驟。", inputSchema: { type: "object", properties: { strategyId: { type: "string" }, title: { type: "string" }, steps: { type: "array", items: { type: "string" } } }, required: ["strategyId", "title", "steps"], additionalProperties: false }, annotations: { readOnlyHint: false }, async execute(input: unknown) { const value = input as {strategyId?:unknown;title?:unknown;steps?:unknown}; const current = await request(); const strategy = current.strategies.find(item => item.id === value?.strategyId); if (!strategy || typeof value.title !== "string" || !value.title.trim() || !Array.isArray(value.steps) || value.steps.length > 12 || !value.steps.every((step: unknown) => typeof step === "string" && !!step.trim())) throw new Error("策略或步驟格式不正確"); await request({ action: "settings", strategies: current.strategies.map(item => item.id === strategy.id ? { ...item, title: value.title, steps: value.steps } : item) }); const data = await reload(); return { saved: true, strategy: data.strategies.find(item => item.id === strategy.id) }; } });
    register({ name: "create_nq_trade_record", title: "建立 NQ 進場紀錄", description: "選正式、亂做單或臨時策略，保存進場與預計止盈止損點位。", inputSchema: { type: "object", properties: { strategyId: { type: "string" }, customTitle: { type: "string" }, direction: { type: "string", enum: ["做多", "做空"] }, customSteps: { type: "array", items: { type: "string" } }, mood: { type: "string", enum: moods }, checks: { type: "array", items: { type: "boolean" } }, contract: { type: "string", enum: ["MNQ", "NQ"] }, quantity: { type: "integer" }, entryPrice: { type: "number" }, targetPrice: { type: "number" }, stopPrice: { type: "number" }, beforeNote: { type: "string" } }, required: ["strategyId", "mood", "checks", "contract", "quantity", "entryPrice", "targetPrice", "stopPrice"], additionalProperties: false }, annotations: { readOnlyHint: false }, async execute(input: unknown) { const value = input as Record<string, unknown>; const current = await request(); const strategy = current.strategies.find(item => item.id === value?.strategyId); const oneOff = value.strategyId === "random" || value.strategyId === "custom"; const expectedSteps = strategy?.steps ?? (value.strategyId === "custom" && Array.isArray(value.customSteps) ? value.customSteps : []); if ((!strategy && !oneOff) || (strategy && !strategy.steps.length) || !moods.includes(value?.mood as string) || !Array.isArray(value?.checks) || value.checks.length !== expectedSteps.length || !value.checks.every((item: unknown) => typeof item === "boolean")) throw new Error("策略、情緒或 SOP 勾選格式不正確"); await request({action:"create",strategyId:value.strategyId,customTitle:value.customTitle,direction:value.direction,customSteps:value.customSteps ?? [],mood:value.mood,checks:value.checks,contract:value.contract,quantity:value.quantity,entryPrice:value.entryPrice,targetPrice:value.targetPrice,stopPrice:value.stopPrice,beforeNote:value.beforeNote ?? ""}); const data = await reload(); setTab("journal"); return {created:true,trade:data.trades[0]}; } });
    register({ name: "complete_nq_trade_record", title: "完成 NQ 交易紀錄", description: "為指定交易記下止盈或止損、出場點位、實際淨損益與心得。", inputSchema: { type: "object", properties: { id: { type: "string" }, result: { type: "string", enum: ["止盈", "止損", "提早平倉"] }, exitPrice: { type: "number" }, netPnlUsd: { type: "number" }, reflection: { type: "string" } }, required: ["id", "result"], additionalProperties: false }, annotations: { readOnlyHint: false }, async execute(input: unknown) { const value = input as Record<string, unknown>; if (typeof value?.id !== "string" || !(["止盈", "止損", "提早平倉"].includes(value?.result as string)) || (value.reflection !== undefined && typeof value.reflection !== "string")) throw new Error("交易編號或出場結果格式不正確"); await request({action:"finish",id:value.id,result:value.result,exitPrice:value.exitPrice ?? null,netPnlUsd:value.netPnlUsd ?? null,reflection:value.reflection ?? ""}); const data = await reload(); setTab("journal"); return {completed:true,trade:data.trades.find(trade => trade.id === value.id)}; } });
    return () => lifecycle.abort();
  }, [selectedStrategyId]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); return true; } catch (err) { setError(err instanceof Error ? err.message : "儲存失敗，請稍後重試"); return false; }
    finally { setBusy(false); }
  }

  function create() {
    if (!isBackfill && !isOneOff && !selectedStrategy.steps.length) { setError("請先在策略設定填寫這個策略的進場 SOP"); return; }
    if (selectedStrategyId === "custom" && (!oneOffTitle.trim() || oneOffSteps.some(step => !step.trim()))) { setError("請填寫臨時策略名稱及已新增的 SOP 步驟"); return; }
    if (!mood) { setError("請先選擇當下情緒"); return; }
    if (!planValid || !isValidPrice(entry) || !isValidPrice(target) || !isValidPrice(stop) || !isValidQuantity(quantity)) { setError("請確認口數、0.25 點間距的價位，以及止盈止損方向"); return; }
    if (isBackfill) { const error = backfillError(backfillDraft); if (error) { setError(error); return; } }
    run(async () => {
      await request({ action: isBackfill ? "backfill" : "create", strategyId: selectedStrategy.id, customTitle: oneOffTitle, direction: oneOffDirection, customSteps: selectedStrategyId === "custom" ? oneOffSteps : [], mood, checks, beforeNote, contract, quantity, entryPrice: entry, targetPrice: target, stopPrice: stop, ...(isBackfill ? backfillData(backfillDraft) : {}) });
      const data = await reload();
      const latest = data.strategies.find(strategy => strategy.id === selectedStrategy.id) ?? data.strategies[0];
      setChecks(isOneOff ? [] : latest.steps.map(() => false)); setMood(""); setBeforeNote(""); setEntryInput(""); setTargetInput(""); setStopInput("");
      if (selectedStrategyId === "custom") { setOneOffTitle(""); setOneOffSteps([]); }
      setSelectedTradeId(null); setTab("journal"); setBackfillDraft({...emptyBackfill}); setMessage(isBackfill ? "交易已補登，日曆會依實際平倉日期計算。" : "進場紀錄已建立。點選這筆紀錄，出場後可補上結果與心得。");
    });
  }
  function saveSettings() {
    const title = draftStrategy.title.trim();
    const steps = draftStrategy.steps.map(step => step.trim());
    if (!title || steps.some(step => !step)) { setError("請填寫策略名稱和每個已新增的步驟"); return; }
    run(async () => {
      await request({ action: "settings", strategies: strategies.map(strategy => strategy.id === draftStrategy.id ? { ...strategy, title, steps } : strategy) });
      await reload(); setChecks(steps.map(() => false)); setMessage("策略已儲存；舊交易仍保留當時的 SOP 與策略名稱。");
    });
  }
  async function finish(id: string, result: ExitResult, reflection: string, exitPrice: number | null, netPnlUsd: number | null, closedAt?: string) {
    await run(async () => { await request({ action: "finish", id, result, reflection, exitPrice, netPnlUsd, closedAt }); await reload(); setMessage("這筆交易已完成記錄。"); });
  }
  async function update(id: string, edits: TradeEdits) {
    return run(async () => { await request({action:"update",id,...edits}); await reload(); setMessage("交易紀錄已修改，盈虧統計也會更新。"); });
  }
  function saveShare() {
    run(async () => { await request({ action: "share", email: shareEmail.trim(), role: shareRole }); await reload(); setShareEmail(""); setMessage(shareRole === "editor" ? "修改權限已設定。對方用這個信箱登入後即可修改。" : "已設為只可觀看。"); });
  }
  function revokeShare(email: string) {
    run(async () => { await request({ action: "unshare", email }); await reload(); setMessage("已取消這位使用者的指定權限，持有連結仍可觀看。"); });
  }

  const openTrades = trades.filter(trade => trade.status === "open");
  const closedTrades = trades.filter(trade => trade.status === "closed");
  const selectedTrade = trades.find(trade => trade.id === selectedTradeId);

  function openTrade(id: string) {
    listScrollRef.current = window.scrollY;
    setSelectedTradeId(id); setDetailDirty(false); setError(""); setMessage("");
    requestAnimationFrame(() => journalSectionRef.current?.scrollIntoView({block:"start"}));
  }
  function backToList() {
    if (busy || detailDirty && !window.confirm("這筆有尚未儲存的內容。確定返回列表嗎？")) return;
    setSelectedTradeId(null); setDetailDirty(false); setError(""); setMessage("");
    requestAnimationFrame(() => window.scrollTo({top:listScrollRef.current}));
  }
  function changeTab(value: string) {
    if (value !== tab && tab === "pf-costs" && (pfBusy || pfDirty && !window.confirm("購買紀錄有尚未儲存的內容。確定離開嗎？"))) return;
    if (value !== tab && tab === "journal" && (busy || detailDirty && !window.confirm("這筆有尚未儲存的內容。確定離開嗎？"))) return;
    if (value === "settings" && isOneOff) selectStrategy(strategies[0].id);
    if (value !== tab) { setSelectedTradeId(null); setDetailDirty(false); }
    setTab(value); setError(""); setMessage("");
  }

  return <main className="shell">
    <header className="topbar"><div className="brand"><div className="brand-mark">N</div><div><strong>NQ 交易紀律</strong><span>進場確認與交易日誌</span></div></div><div className="access-actions"><div className="private-pill">連結分享 · {role === "viewer" ? "觀看" : "可修改"}</div>{!currentEmail ? <a className="signin-link" href="/signin-with-chatgpt?return_to=%2F" target="_top">登入以修改</a> : <a className="account-link" href="/signout-with-chatgpt?return_to=%2F" target="_top" title={currentEmail}>登出</a>}</div></header>
    <div className="workspace">
      <div className="intro-row"><div><div className="eyebrow">TRADE WORKSPACE / NQ</div><h1>先確認，再進場。</h1><p>把當下的判斷留下來，出場後才能看清楚自己做了什麼。</p></div><div className="date-card"><Clock3 size={16}/><span>NQ · 個人交易日誌</span></div></div>
      {error && <div className="alert error" role="alert">{error} {loading === false && trades.length === 0 && <button type="button" onClick={() => { setLoading(true); setError(""); reload().catch(err => setError(err.message)).finally(() => setLoading(false)); }}>重試</button>}</div>}
      {message && <div className="alert success" role="status">{message}</div>}
      {loading ? <section className="form-card loading-card">正在載入你的交易紀錄…</section> : <Tabs value={tab} onValueChange={changeTab} className="main-tabs">
        <TabsList className="tab-list">{role !== "viewer" && <TabsTrigger value="new"><Check size={16}/>開單／補登</TabsTrigger>}<TabsTrigger value="journal"><NotebookPen size={16}/>交易紀錄{openTrades.length > 0 ? ` (${openTrades.length})` : ""}</TabsTrigger><TabsTrigger value="calendar"><CalendarDays size={16}/>盈虧日曆</TabsTrigger><TabsTrigger value="pf-costs"><Receipt size={16}/>PF 真實成本</TabsTrigger><TabsTrigger value="settings"><Settings2 size={16}/>策略設定</TabsTrigger>{role === "owner" && <TabsTrigger value="share"><Users size={16}/>分享權限</TabsTrigger>}</TabsList>
        <TabsContent value="new" className="tab-content"><section className="form-card"><div className="card-heading"><div><span className="section-label">{isBackfill ? "01 / 補登交易" : "01 / 進場前"}</span><h2>{isBackfill ? "補上過去的交易" : "這筆交易符合計畫嗎？"}</h2></div><span className="counter">{checks.filter(Boolean).length} / {selectedStrategy.steps.length} 完成</span></div>
          <div className="entry-mode segmented"><button type="button" disabled={busy} className={!isBackfill ? "selected" : ""} aria-pressed={!isBackfill} onClick={()=>{setIsBackfill(false);setError("");}}>即時記錄</button><button type="button" disabled={busy} className={isBackfill ? "selected" : ""} aria-pressed={isBackfill} onClick={()=>{setIsBackfill(true);setError("");}}>補登已完成交易</button></div>
          {isBackfill && <BackfillTimes draft={backfillDraft} onChange={setBackfillDraft} busy={busy}/>}
          <div className="form-section"><label className="field-label">選擇策略</label><div className="strategy-grid">{strategies.map(strategy => <StrategyChoice key={strategy.id} strategy={strategy} selected={selectedStrategyId === strategy.id} onSelect={() => selectStrategy(strategy.id)}/>)}<button type="button" className={`strategy-choice ${selectedStrategyId === "random" ? "selected" : ""}`} aria-pressed={selectedStrategyId === "random"} onClick={() => selectStrategy("random")}><strong>亂做單</strong><span>無策略進場 · 單獨統計</span></button><button type="button" className={`strategy-choice ${selectedStrategyId === "custom" ? "selected" : ""}`} aria-pressed={selectedStrategyId === "custom"} onClick={() => selectStrategy("custom")}><strong>＋ 臨時策略</strong><span>只套用這一筆交易</span></button></div>{isOneOff && <div className="one-off-panel">{selectedStrategyId === "custom" && <div><label className="field-label" htmlFor="one-off-title">這筆的策略名稱</label><input id="one-off-title" className="text-input" maxLength={100} value={oneOffTitle} onChange={event => setOneOffTitle(event.target.value)} placeholder="例如：新聞後回踩"/></div>}<div><label className="field-label">交易方向</label><div className="segmented"><button type="button" className={`direction-button direction-long ${oneOffDirection === "做多" ? "selected" : ""}`} onClick={() => setOneOffDirection("做多")}><TrendingUp size={18} aria-hidden="true"/>做多</button><button type="button" className={`direction-button direction-short ${oneOffDirection === "做空" ? "selected" : ""}`} onClick={() => setOneOffDirection("做空")}><TrendingDown size={18} aria-hidden="true"/>做空</button></div></div><p className="calculation-hint">{selectedStrategyId === "random" ? "這筆會標記為亂做單；不套用正式策略的 SOP。" : "臨時名稱和步驟只保存在這筆交易，不影響四個正式策略。"}</p></div>}</div>
          <div className="form-section"><label className="field-label">實際交易合約</label><div className="contract-line"><div className="segmented"><button type="button" className={contract === "MNQ" ? "selected" : ""} onClick={() => {setContract("MNQ");setDisplayContract("MNQ");}}>MNQ</button><button type="button" className={contract === "NQ" ? "selected" : ""} onClick={() => {setContract("NQ");setDisplayContract("NQ");}}>NQ</button></div><div className="quantity-field"><label htmlFor="quantity">口數</label><input id="quantity" className="text-input" type="number" inputMode="numeric" min="1" max="1000" step="1" value={quantityInput} onChange={event => setQuantityInput(event.target.value)}/></div></div><p className="calculation-hint">{contract} 每點 {money(POINT_VALUE_USD[contract])}／口；{isValidQuantity(quantity) ? `${quantity} ${contract} ≈ ${nqEquivalentContracts(contract, quantity)} NQ 等值` : "請填正整數口數"}</p></div>
          <div className="form-section"><label className="field-label">進場與預計出場點位</label><div className="price-grid three"><div><label htmlFor="entry-price">進場點位</label><input id="entry-price" className="text-input" type="number" inputMode="decimal" min="0" step="0.25" value={entryInput} onChange={event => setEntryInput(event.target.value)} placeholder="例如 21000.00"/></div><div><label htmlFor="target-price">預計止盈</label><input id="target-price" className="text-input" type="number" inputMode="decimal" min="0" step="0.25" value={targetInput} onChange={event => setTargetInput(event.target.value)} placeholder="例如 21050.00"/></div><div><label htmlFor="stop-price">預計止損</label><input id="stop-price" className="text-input" type="number" inputMode="decimal" min="0" step="0.25" value={stopInput} onChange={event => setStopInput(event.target.value)} placeholder="例如 20975.00"/></div></div><p className="calculation-hint">價位以 0.25 點為單位。{selectedStrategy.direction === "做多" ? "做多時止盈高於進場、止損低於進場。" : "做空時止盈低於進場、止損高於進場。"}</p>{pricesValid && !planValid && <p className="sop-warning">止盈／止損方向或口數不正確，請重新確認。</p>}</div>
          {planValid && <div className="plan-preview"><div className="plan-heading"><strong>預計損益</strong><div className="mini-switch"><button type="button" className={displayContract === "MNQ" ? "selected" : ""} onClick={() => setDisplayContract("MNQ")}>MNQ</button><button type="button" className={displayContract === "NQ" ? "selected" : ""} onClick={() => setDisplayContract("NQ")}>NQ 換算</button></div></div><div className="plan-stats"><span>止盈 +{plan!.reward} 點<strong className="positive">{money(plannedUsd(plan!.reward, displayContract, quantity!))}</strong></span><span>止損 -{plan!.risk} 點<strong className="negative">-{money(plannedUsd(plan!.risk, displayContract, quantity!))}</strong></span><span>計畫盈虧比<strong>{(plan!.reward / plan!.risk).toFixed(2)} : 1</strong></span></div><small>{displayContract === contract ? `依實際 ${quantity} 口 ${contract} 計算` : `假設同樣 ${quantity} 口 ${displayContract}，僅供換算；實際交易仍為 ${contract}`}</small></div>}
          <div className="form-section"><div className="section-line"><label className="field-label">{selectedStrategy.title} · {selectedStrategy.direction}</label><span>依照當下實際情況勾選</span></div>{selectedStrategyId === "custom" && <div className="one-off-steps"><div className="setting-steps">{oneOffSteps.map((step,index) => <div className="setting-step" key={index}><span className="step-num">{String(index+1).padStart(2,"0")}</span><input aria-label={`臨時步驟 ${index+1}`} className="text-input" maxLength={120} value={step} onChange={event => setOneOffSteps(current => current.map((item,i) => i === index ? event.target.value : item))} placeholder="這筆單要確認的條件"/><button type="button" className="icon-button" aria-label={`刪除臨時步驟 ${index+1}`} onClick={() => {setOneOffSteps(current => current.filter((_,i) => i !== index));setChecks(current => current.filter((_,i) => i !== index));}}><Trash2 size={17}/></button></div>)}</div><button type="button" className="add-button" disabled={oneOffSteps.length >= 12} onClick={() => {setOneOffSteps(current => [...current,""]);setChecks(current => [...current,false]);}}><Plus size={16}/>新增臨時步驟</button></div>}{selectedStrategy.steps.length ? <div className="steps">{selectedStrategy.steps.map((step,index) => <label className="step-row" key={index}><Checkbox checked={checks[index] ?? false} onCheckedChange={(value: boolean | "indeterminate") => setChecks(current => current.map((item,i) => i === index ? value === true : item))}/><span className="step-num">{String(index+1).padStart(2,"0")}</span><span>{step}</span></label>)}</div> : <div className="empty-inline">{isOneOff ? "這筆沒有設定 SOP 步驟；仍會保存你的進場想法與情緒。" : isBackfill ? "此策略尚未設定 SOP，仍可補登這筆交易。" : "這個策略還沒有 SOP。請先到「策略設定」新增步驟。"}</div>}</div>
          <div className="form-section"><label className="field-label">當下情緒</label><div className="mood-grid">{moods.map(item => <button type="button" key={item} className={mood === item ? "selected" : ""} onClick={() => setMood(item)}>{item}</button>)}</div></div>
          <div className="form-section"><label className="field-label" htmlFor="before-note">進場想法 <span className="optional">選填</span></label><Textarea id="before-note" maxLength={2000} value={beforeNote} onChange={event => setBeforeNote(event.target.value)} placeholder="這筆單的理由、看到的訊號或心裡的猶豫…" className="journal-textarea"/></div>
          {isBackfill && <BackfillOutcome draft={backfillDraft} onChange={setBackfillDraft} busy={busy}/>}
          {checks.some(value => !value) && <p className="sop-warning">有未符合的 SOP。仍可記錄這筆單，供事後檢討。</p>}
          <div className="form-actions"><span>{isBackfill ? "保存進場、平倉、損益與心得" : "建立後會固定保存策略、合約、口數、預計點位與當下想法"}</span><button className="primary-button" type="button" disabled={busy || (!isBackfill && !isOneOff && !selectedStrategy.steps.length) || (selectedStrategyId === "custom" && (!oneOffTitle.trim() || oneOffSteps.some(step => !step.trim()))) || !planValid || (isBackfill && !!backfillError(backfillDraft))} onClick={create}>{busy ? "儲存中…" : isBackfill ? "儲存補登交易" : "建立交易紀錄"}</button></div>
        </section><aside className="side-card"><span className="section-label">正在進行</span><h3>{openTrades.length ? `${openTrades.length} 筆尚未填出場結果` : "還沒有進行中的交易"}</h3><p>{openTrades.length ? "平倉後，到交易紀錄填上止盈或止損與心得。" : "建立紀錄後，這裡會提示尚未完成的交易。"}</p><div className="side-rule"/><span className="section-label">紀律提醒</span><p>只勾選當下確實符合的條件。需要更正時可修改紀錄，畫面會保留最後修改時間。</p></aside></TabsContent>
        <TabsContent value="journal" className="tab-content single-column"><section className="journal-stack" ref={journalSectionRef}>{selectedTrade ? <><div className="journal-detail-heading"><div><span className="section-label">02 / 交易詳情</span><h2>交易紀錄</h2></div><button type="button" className="secondary-button" disabled={busy} onClick={backToList}>返回列表</button></div><TradeCard key={selectedTrade.id} trade={selectedTrade} onFinish={finish} onUpdate={update} onDirtyChange={setDetailDirty} busy={busy} readOnly={role === "viewer"}/></> : <><div className="journal-section-head"><span className="section-label">02 / 交易紀錄</span><h2>進行中 <span>{openTrades.length}</span></h2></div>{openTrades.length ? openTrades.map(trade => <TradeSummary key={trade.id} trade={trade} onOpen={() => openTrade(trade.id)}/>) : <div className="empty-inline">沒有待完成的交易。</div>}
          <div className="journal-section-head closed-head"><span className="section-label">過往紀錄</span><h2>已完成 <span>{closedTrades.length}</span></h2></div>{closedTrades.length ? closedTrades.map(trade => <TradeSummary key={trade.id} trade={trade} onOpen={() => openTrade(trade.id)}/>) : <div className="empty-inline">完成的交易會出現在這裡。</div>}
          {trades.length >= 200 && <p className="limit-note">目前顯示最近 200 筆紀錄。</p>}
        </>}</section></TabsContent>
        <TabsContent value="calendar" className="calendar-tab"><CalendarDashboard strategies={strategies}/></TabsContent>
        <TabsContent value="pf-costs" className="calendar-tab"><PfCostsPanel readOnly={role === "viewer"} onDirtyChange={setPfDirty} onBusyChange={setPfBusy}/></TabsContent>
        <TabsContent value="settings" className="tab-content">
          <section className="form-card">
            <div className="card-heading"><div><span className="section-label">個人設定</span><h2>{role === "viewer" ? "查看進場 SOP" : "編輯你的進場 SOP"}</h2></div></div>
            <p className="settings-intro">四個策略各自保存進場條件。編輯後只影響新交易，舊交易保留當時的策略與 SOP。</p>
            <div className="form-section"><label className="field-label">選擇策略</label><div className="strategy-grid">{strategies.map(strategy => <StrategyChoice key={strategy.id} strategy={strategy} selected={selectedStrategyId === strategy.id} onSelect={() => selectStrategy(strategy.id)}/>)}</div></div>
            <div className="form-section"><label className="field-label" htmlFor="strategy-title">策略名稱</label><input id="strategy-title" className="text-input" maxLength={100} disabled={role === "viewer"} value={draftStrategy.title} onChange={event => setDraftStrategy(current => ({...current,title:event.target.value}))}/></div>
            <div className="form-section"><label className="field-label">交易方向</label><div className="direction-readout">{draftStrategy.direction} · 此策略的方向固定</div></div>
            <div className="form-section"><label className="field-label">進場步驟</label><div className="setting-steps">{draftStrategy.steps.map((step,index) => <div className="setting-step" key={index}><span className="step-num">{String(index+1).padStart(2,"0")}</span><input aria-label={`步驟 ${index+1}`} className="text-input" maxLength={120} disabled={role === "viewer"} value={step} onChange={event => setDraftStrategy(current => ({...current,steps:current.steps.map((item,i) => i === index ? event.target.value : item)}))}/>{role !== "viewer" && <button type="button" className="icon-button" aria-label={`刪除步驟 ${index+1}`} onClick={() => setDraftStrategy(current => ({...current,steps:current.steps.filter((_,i) => i !== index)}))}><Trash2 size={17}/></button>}</div>)}</div>{role !== "viewer" && <button type="button" className="add-button" disabled={draftStrategy.steps.length >= 12} onClick={() => setDraftStrategy(current => ({...current,steps:[...current.steps,""]}))}><Plus size={16}/>新增步驟</button>}</div>
            {role !== "viewer" && <div className="form-actions"><span>未設定 SOP 的策略暫時不能建立交易</span><button type="button" className="primary-button" disabled={busy} onClick={saveSettings}>{busy ? "儲存中…" : "儲存這個策略"}</button></div>}
          </section>
          <aside className="side-card"><span className="section-label">建議</span><h3>寫可檢查的條件</h3><p>像「是否在預定交易時段」或「停損位置是否清楚」。太抽象的條件，開單當下很難誠實勾選。</p></aside>
        </TabsContent>
        {role === "owner" && <TabsContent value="share" className="tab-content single-column"><section className="form-card share-card"><div className="card-heading"><div><span className="section-label">存取控制</span><h2>分享這份交易日誌</h2></div></div><p className="settings-intro">持有連結的人都能觀看。你可以指定哪些信箱能新增交易、修改紀錄及編輯 SOP；只有你能管理這份名單。</p><div className="form-section"><label className="field-label" htmlFor="share-email">對方的登入電子郵件</label><input id="share-email" type="email" className="text-input" value={shareEmail} onChange={event => setShareEmail(event.target.value)} placeholder="name@example.com"/></div><div className="form-section"><label className="field-label">資料權限</label><div className="segmented"><button type="button" className={shareRole === "viewer" ? "selected" : ""} onClick={() => setShareRole("viewer")}>只可觀看</button><button type="button" className={shareRole === "editor" ? "selected" : ""} onClick={() => setShareRole("editor")}>可修改</button></div></div><div className="form-actions"><span>可修改的人需要用指定信箱登入</span><button type="button" className="primary-button" disabled={busy || !shareEmail.trim()} onClick={saveShare}>儲存權限</button></div><div className="share-list"><h3>目前的分享名單</h3>{collaborators.length ? collaborators.map(person => <div className="share-person" key={person.email}><div><strong>{person.email}</strong><span>{person.role === "viewer" ? "只可觀看" : "可修改"}</span></div><button type="button" className="icon-button" aria-label={`移除 ${person.email}`} disabled={busy} onClick={() => revokeShare(person.email)}><Trash2 size={17}/></button></div>) : <div className="empty-inline">尚未指定其他使用者的權限。</div>}</div><p className="share-note">連結可直接轉傳，收到的人都能查看交易與財務紀錄。移除名單中的使用者會取消其指定權限，仍可透過連結觀看。</p></section></TabsContent>}
      </Tabs>}
    </div>
  </main>;
}

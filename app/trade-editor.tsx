"use client";

import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import type { Trade, TradeEdits } from "@/lib/journal-db";
import { grossPnlUsd, isValidPrice, isValidQuantity, plannedPoints, type Contract } from "@/lib/trade-math";
import { fromTaipeiDateTimeInput, taipeiDateTimeInput, tradeTimeError } from "@/lib/trade-time";

export const exitResults = ["止盈", "止損", "提早平倉"] as const;
export type ExitResult = typeof exitResults[number];
const moods = ["平穩", "猶豫", "怕錯過", "急躁", "疲累"];
const number = (text: string) => text.trim() === "" ? null : Number(text);
const input = (value: number | null) => value === null ? "" : String(value);

export default function TradeEditor({ trade, busy, onSave, onCancel, onDirtyChange }: { trade: Trade; busy: boolean; onSave: (edits: TradeEdits) => Promise<boolean>; onCancel: () => void; onDirtyChange: (dirty:boolean) => void }) {
  const [title, setTitle] = useState(trade.strategyTitle);
  const [direction, setDirection] = useState(trade.direction);
  const [mood, setMood] = useState(trade.mood);
  const [checks, setChecks] = useState(trade.checks);
  const [beforeNote, setBeforeNote] = useState(trade.beforeNote);
  const [hasPlan, setHasPlan] = useState(trade.entryPrice !== null);
  const [contract, setContract] = useState<Contract>(trade.contract ?? "MNQ");
  const [quantity, setQuantity] = useState(input(trade.quantity ?? 1));
  const [entry, setEntry] = useState(input(trade.entryPrice));
  const [target, setTarget] = useState(input(trade.targetPrice));
  const [stop, setStop] = useState(input(trade.stopPrice));
  const [exit, setExit] = useState(input(trade.exitPrice));
  const [net, setNet] = useState(input(trade.netPnlUsd));
  const [result, setResult] = useState<ExitResult>(trade.result ?? "提早平倉");
  const [reflection, setReflection] = useState(trade.reflection ?? "");
  const [error, setError] = useState("");
  const [entryTime, setEntryTime] = useState(taipeiDateTimeInput(trade.entryAt));
  const [closeTime, setCloseTime] = useState(trade.closedAt ? taipeiDateTimeInput(trade.closedAt) : "");
  const realized = number(net);
  const mismatch = realized !== null && (result === "止損" && realized > 0 || result === "止盈" && realized < 0);
  const dirty = entryTime !== taipeiDateTimeInput(trade.entryAt) || closeTime !== (trade.closedAt ? taipeiDateTimeInput(trade.closedAt) : "") || title !== trade.strategyTitle || direction !== trade.direction || mood !== trade.mood
    || JSON.stringify(checks) !== JSON.stringify(trade.checks) || beforeNote !== trade.beforeNote
    || hasPlan !== (trade.entryPrice !== null) || contract !== (trade.contract ?? "MNQ")
    || quantity !== input(trade.quantity ?? 1) || entry !== input(trade.entryPrice) || target !== input(trade.targetPrice) || stop !== input(trade.stopPrice)
    || exit !== input(trade.exitPrice) || net !== input(trade.netPnlUsd) || result !== (trade.result ?? "提早平倉") || reflection !== (trade.reflection ?? "");
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);

  async function save() {
    setError("");
    const entryAt = entryTime === taipeiDateTimeInput(trade.entryAt) ? trade.entryAt : fromTaipeiDateTimeInput(entryTime);
    const closedAt = trade.status === "closed" ? closeTime === (trade.closedAt ? taipeiDateTimeInput(trade.closedAt) : "") ? trade.closedAt : fromTaipeiDateTimeInput(closeTime) : null;
    if (!entryAt || trade.status === "closed" && !closedAt) { setError("請填寫有效的實際進場和平倉時間"); return; }
    const timeError = tradeTimeError(entryAt,closedAt);
    if (timeError) { setError(timeError); return; }
    const quantityValue = number(quantity), entryValue = number(entry), targetValue = number(target), stopValue = number(stop), exitValue = number(exit), netValue = number(net);
    if (!title.trim()) { setError("請填策略名稱"); return; }
    if (hasPlan) {
      if (!isValidQuantity(quantityValue) || !isValidPrice(entryValue) || !isValidPrice(targetValue) || !isValidPrice(stopValue)) { setError("請確認口數與 0.25 點間距的價位"); return; }
      const points = plannedPoints(direction, entryValue, targetValue, stopValue);
      if (points.reward <= 0 || points.risk <= 0) { setError("預計止盈與止損的方向不正確"); return; }
    }
    if (exitValue !== null && !isValidPrice(exitValue) || netValue !== null && (!Number.isFinite(netValue) || Math.abs(netValue) > 1_000_000_000)) { setError("出場點位或淨損益格式不正確"); return; }
    if (trade.status === "closed" && hasPlan && exitValue === null && netValue === null) { setError("請填出場點位或實際淨損益，至少一項"); return; }
    const success = await onSave({
      strategyTitle: title.trim(), direction, mood, checks, beforeNote,
      contract: hasPlan ? contract : null, quantity: hasPlan ? quantityValue : null,
      entryPrice: hasPlan ? entryValue : null, targetPrice: hasPlan ? targetValue : null, stopPrice: hasPlan ? stopValue : null,
      exitPrice: trade.status === "closed" ? exitValue : null, netPnlUsd: trade.status === "closed" ? netValue : null,
      result: trade.status === "closed" ? result : null, reflection: trade.status === "closed" ? reflection : null,
      entryAt, closedAt,
    });
    if (success) onCancel();
  }

  const gross = hasPlan && isValidPrice(number(entry)) && isValidPrice(number(exit)) && isValidQuantity(number(quantity))
    ? grossPnlUsd(direction, number(entry)!, number(exit)!, contract, number(quantity)!) : null;

  return <div className="trade-editor"><h4>修改這筆紀錄</h4><p className="calculation-hint">可更正實際交易時間；日曆和月總結會依平倉日期重新計算。原始登錄時間仍會保留。</p>
    <div className="price-grid form-section"><div><label className="field-label" htmlFor={`edit-entry-time-${trade.id}`}>實際進場時間 · 台北</label><input id={`edit-entry-time-${trade.id}`} className="text-input" type="datetime-local" min="2000-01-01T00:00" max={taipeiDateTimeInput(new Date().toISOString())} disabled={busy} value={entryTime} onChange={event=>setEntryTime(event.target.value)}/></div>{trade.status === "closed" && <div><label className="field-label" htmlFor={`edit-close-time-${trade.id}`}>實際平倉時間 · 台北</label><input id={`edit-close-time-${trade.id}`} className="text-input" type="datetime-local" min="2000-01-01T00:00" max={taipeiDateTimeInput(new Date().toISOString())} disabled={busy} value={closeTime} onChange={event=>setCloseTime(event.target.value)}/></div>}</div>
    <div className="form-section"><label className="field-label" htmlFor={`edit-title-${trade.id}`}>策略名稱</label><input id={`edit-title-${trade.id}`} className="text-input" maxLength={100} value={title} onChange={event => setTitle(event.target.value)}/></div>
    <div className="form-section"><label className="field-label">方向</label><div className="segmented">{(["做多", "做空"] as const).map(item => <button type="button" key={item} className={direction === item ? "selected" : ""} onClick={() => setDirection(item)}>{item}</button>)}</div></div>
    <div className="form-section"><label className="field-label">當下情緒</label><div className="mood-grid">{moods.map(item => <button type="button" key={item} className={mood === item ? "selected" : ""} onClick={() => setMood(item)}>{item}</button>)}</div></div>
    <div className="form-section"><label className="step-row"><Checkbox checked={hasPlan} onCheckedChange={(value: boolean | "indeterminate") => setHasPlan(value === true)}/><span>記錄合約、口數與進出場點位</span></label></div>
    {hasPlan && <><div className="form-section contract-line"><div className="segmented">{(["MNQ", "NQ"] as const).map(item => <button type="button" key={item} className={contract === item ? "selected" : ""} onClick={() => setContract(item)}>{item}</button>)}</div><div className="quantity-field"><label htmlFor={`edit-quantity-${trade.id}`}>口數</label><input id={`edit-quantity-${trade.id}`} className="text-input" type="number" min="1" max="1000" step="1" value={quantity} onChange={event => setQuantity(event.target.value)}/></div></div><div className="price-grid three form-section">{[{ label: "進場點位", value: entry, set: setEntry }, { label: "預計止盈", value: target, set: setTarget }, { label: "預計止損", value: stop, set: setStop }].map((field,index) => <div key={field.label}><label htmlFor={`edit-price-${trade.id}-${index}`}>{field.label}</label><input id={`edit-price-${trade.id}-${index}`} className="text-input" type="number" min="0" step="0.25" value={field.value} onChange={event => field.set(event.target.value)}/></div>)}</div></>}
    {trade.steps.length > 0 && <div className="form-section"><label className="field-label">SOP 勾選</label><div className="steps">{trade.steps.map((step,index) => <label key={index} className="step-row"><Checkbox checked={checks[index] ?? false} onCheckedChange={(value: boolean | "indeterminate") => setChecks(current => current.map((checked,i) => i === index ? value === true : checked))}/><span>{step}</span></label>)}</div></div>}
    <div className="form-section"><label className="field-label" htmlFor={`edit-before-${trade.id}`}>進場想法</label><Textarea id={`edit-before-${trade.id}`} className="journal-textarea" maxLength={2000} value={beforeNote} onChange={event => setBeforeNote(event.target.value)}/></div>
    {trade.status === "closed" && <><div className="form-section"><label className="field-label">出場方式</label><div className="segmented">{exitResults.map(item => <button type="button" key={item} className={result === item ? "selected" : ""} onClick={() => setResult(item)}>{item}</button>)}</div></div><div className="price-grid form-section"><div><label htmlFor={`edit-exit-${trade.id}`}>實際出場點位（選填）</label><input id={`edit-exit-${trade.id}`} className="text-input" type="number" min="0" step="0.25" value={exit} onChange={event => setExit(event.target.value)}/></div><div><label htmlFor={`edit-net-${trade.id}`}>實際淨損益 USD（選填）</label><input id={`edit-net-${trade.id}`} className="text-input" type="number" step="0.01" value={net} onChange={event => setNet(event.target.value)} placeholder="虧損請加負號，例如 -80"/></div></div>{gross !== null && <p className="calculation-hint">依出場點位估算毛損益 {new Intl.NumberFormat("en-US", {style:"currency",currency:"USD"}).format(gross)}，未扣手續費。填寫淨損益時，統計優先採用淨損益。</p>}{mismatch && <p className="sop-warning">金額正負號與出場標記不一致，請確認是否填對。</p>}<div className="form-section"><label className="field-label" htmlFor={`edit-reflection-${trade.id}`}>交易心得</label><Textarea id={`edit-reflection-${trade.id}`} className="journal-textarea" maxLength={4000} value={reflection} onChange={event => setReflection(event.target.value)}/></div></>}
    {error && <p className="alert error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>取消</button><button type="button" className="primary-button" disabled={busy} onClick={save}>{busy ? "儲存中…" : "儲存修改"}</button></div>
  </div>;
}

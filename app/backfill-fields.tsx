"use client";

import { Textarea } from "@/components/ui/textarea";
import { isValidPrice } from "@/lib/trade-math";
import { fromTaipeiDateTimeInput, taipeiDateTimeInput, tradeTimeError } from "@/lib/trade-time";
import { exitResults, type ExitResult } from "./trade-editor";

export type BackfillDraft = {entryTime:string;closeTime:string;result:ExitResult|"";exitPrice:string;netPnl:string;reflection:string};
export const emptyBackfill: BackfillDraft = {entryTime:"",closeTime:"",result:"",exitPrice:"",netPnl:"",reflection:""};
const readNumber = (value:string) => value.trim() === "" ? null : Number(value);
export function backfillData(draft:BackfillDraft) {
  return {entryAt:fromTaipeiDateTimeInput(draft.entryTime),closedAt:fromTaipeiDateTimeInput(draft.closeTime),result:draft.result,exitPrice:readNumber(draft.exitPrice),netPnlUsd:readNumber(draft.netPnl),reflection:draft.reflection};
}
export function backfillError(draft:BackfillDraft) {
  const data = backfillData(draft);
  if (!data.entryAt || !data.closedAt) return "請填寫實際進場和平倉的日期與時間";
  const timeError = tradeTimeError(data.entryAt,data.closedAt);
  if (timeError) return timeError;
  if (!data.result) return "請選擇這筆交易的出場方式";
  if (data.exitPrice !== null && !isValidPrice(data.exitPrice)) return "出場點位需符合 0.25 點間距";
  if (data.netPnlUsd !== null && (!Number.isFinite(data.netPnlUsd) || Math.abs(data.netPnlUsd) > 1_000_000_000)) return "實際淨損益格式不正確";
  if (data.exitPrice === null && data.netPnlUsd === null) return "請填寫出場點位或實際淨損益，至少一項";
  return null;
}
type Props = {draft:BackfillDraft;onChange:(draft:BackfillDraft)=>void;busy:boolean};

export function BackfillTimes({draft,onChange,busy}:Props) {
  const maximum = taipeiDateTimeInput(new Date().toISOString());
  const entryAt = fromTaipeiDateTimeInput(draft.entryTime), closedAt = fromTaipeiDateTimeInput(draft.closeTime);
  const timeError = draft.entryTime && draft.closeTime ? !entryAt || !closedAt ? "請填寫有效的實際進場和平倉時間" : tradeTimeError(entryAt,closedAt) : null;
  return <div className="backfill-time-panel"><div className="price-grid"><div><label className="field-label" htmlFor="backfill-entry-time">實際進場時間 · 台北</label><input id="backfill-entry-time" className="text-input" type="datetime-local" min="2000-01-01T00:00" max={maximum} disabled={busy} value={draft.entryTime} onChange={event=>onChange({...draft,entryTime:event.target.value})}/></div><div><label className="field-label" htmlFor="backfill-close-time">實際平倉時間 · 台北</label><input id="backfill-close-time" className="text-input" type="datetime-local" min="2000-01-01T00:00" max={maximum} disabled={busy} value={draft.closeTime} onChange={event=>onChange({...draft,closeTime:event.target.value})}/></div></div><p className="calculation-hint">依當時記得的情況填寫，這筆會標示為補登。日曆以實際平倉日期計算。</p>{timeError && <p className="alert error" role="alert">{timeError}</p>}</div>;
}

export function BackfillOutcome({draft,onChange,busy}:Props) {
  const pnl = readNumber(draft.netPnl);
  return <div className="backfill-outcome form-section"><h3>補上出場結果</h3><label className="field-label">出場方式</label><div className="segmented">{exitResults.map(result=><button type="button" key={result} disabled={busy} className={draft.result === result ? "selected" : ""} onClick={()=>onChange({...draft,result})}>{result}</button>)}</div><div className="price-grid form-section"><div><label className="field-label" htmlFor="backfill-exit">實際出場點位 <span className="optional">選填</span></label><input id="backfill-exit" className="text-input" type="number" min="0" step="0.25" inputMode="decimal" disabled={busy} value={draft.exitPrice} onChange={event=>onChange({...draft,exitPrice:event.target.value})}/></div><div><label className="field-label" htmlFor="backfill-net">實際淨損益 USD <span className="optional">選填</span></label><input id="backfill-net" className="text-input" type="number" step="0.01" inputMode="decimal" disabled={busy} value={draft.netPnl} onChange={event=>onChange({...draft,netPnl:event.target.value})} placeholder="虧損請加負號，例如 -80"/></div></div><p className="calculation-hint">出場點位或實際淨損益至少填一項；統計優先使用實際淨損益。</p>{pnl !== null && (draft.result === "止損" && pnl > 0 || draft.result === "止盈" && pnl < 0) && <p className="sop-warning">金額正負號與出場標記不一致，請確認。</p>}<div className="form-section"><label className="field-label" htmlFor="backfill-reflection">交易心得 <span className="optional">選填</span></label><Textarea id="backfill-reflection" className="journal-textarea" disabled={busy} maxLength={4000} value={draft.reflection} onChange={event=>onChange({...draft,reflection:event.target.value})} placeholder="回顧這筆交易執行得如何，下次要調整什麼？"/></div></div>;
}

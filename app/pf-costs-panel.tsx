"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Pencil, Plus, Receipt } from "lucide-react";
import { taipeiDateKey } from "@/lib/calendar-stats";
import { formatPfMoney, moneyToCents, PF_CURRENCIES, summarizePurchases, validPurchaseDate, type PfCurrency, type PfPurchase, type PfPurchaseInput } from "@/lib/pf-costs";

function blankDraft(): PfPurchaseInput {
  return {id:crypto.randomUUID(),purchaseDate:taipeiDateKey(new Date().toISOString()),firm:"",accountLabel:"",currency:"USD",amount:""};
}
function dateLabel(date: string) { return date.replaceAll("-", " / "); }

async function request(input?: PfPurchaseInput, action?: "create" | "update", signal?: AbortSignal) {
  const response = await fetch("/api/pf-costs", input ? {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...input,action})} : {signal});
  const data = await response.json() as {purchases?:PfPurchase[];error?:string};
  if (!response.ok) throw new Error(data.error || "購買紀錄操作失敗");
  return data.purchases ?? [];
}

function CostAmounts({ purchases }: {purchases:PfPurchase[]}) {
  const { totals } = summarizePurchases(purchases);
  const currencies = PF_CURRENCIES.filter(currency => purchases.some(purchase => purchase.currency === currency));
  return <div className="pf-cost-amounts">{currencies.length ? currencies.map(currency => <strong key={currency}>{formatPfMoney(totals[currency],currency)}</strong>) : <strong>尚無紀錄</strong>}</div>;
}

export default function PfCostsPanel({ readOnly, onDirtyChange, onBusyChange }: {readOnly:boolean;onDirtyChange:(dirty:boolean)=>void;onBusyChange:(busy:boolean)=>void}) {
  const [purchases,setPurchases] = useState<PfPurchase[]>([]);
  const [month,setMonth] = useState(() => taipeiDateKey(new Date().toISOString()).slice(0,7));
  const [showAll,setShowAll] = useState(false);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  const [refresh,setRefresh] = useState(0);
  const [editingId,setEditingId] = useState<string | null>(null);
  const [draft,setDraft] = useState<PfPurchaseInput | null>(null);
  const [original,setOriginal] = useState("");
  const dirty = !!draft && JSON.stringify(draft) !== original;
  const monthPurchases = useMemo(() => purchases.filter(purchase => purchase.purchaseDate.startsWith(`${month}-`)),[purchases,month]);
  const visible = showAll ? purchases : monthPurchases;
  const valid = !!draft && validPurchaseDate(draft.purchaseDate) && !!draft.firm.trim() && draft.firm.trim().length <= 100 && draft.accountLabel.trim().length <= 100 && moneyToCents(draft.amount) !== null;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    request(undefined,undefined,controller.signal).then(setPurchases)
      .catch(error => { if (error.name !== "AbortError") setError(error instanceof Error ? error.message : "無法載入購買紀錄"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  },[refresh]);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); },[dirty,onDirtyChange]);
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); },[busy,onBusyChange]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload",warn);
    return () => window.removeEventListener("beforeunload",warn);
  },[dirty,busy]);

  function openForm(purchase?: PfPurchase) {
    if (busy || dirty && !window.confirm("購買紀錄有尚未儲存的內容。確定切換嗎？")) return;
    const next: PfPurchaseInput = purchase ? {...purchase,amount:(purchase.amountCents / 100).toFixed(2)} : blankDraft();
    setDraft(next); setOriginal(JSON.stringify(next)); setEditingId(purchase?.id ?? null); setError(""); setMessage("");
    requestAnimationFrame(() => document.getElementById("pf-purchase-form")?.scrollIntoView({block:"start",behavior:"smooth"}));
  }
  function closeForm() {
    if (busy || dirty && !window.confirm("這筆有尚未儲存的內容。確定取消嗎？")) return;
    setDraft(null); setEditingId(null); setError("");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || !valid || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const saved = await request(draft,editingId ? "update" : "create");
      setPurchases(saved); setMonth(draft.purchaseDate.slice(0,7)); setShowAll(false);
      setDraft(null); setEditingId(null); setMessage(editingId ? "購買紀錄已更新。" : "購買紀錄已儲存。");
    } catch (error) { setError(error instanceof Error ? error.message : "儲存失敗，請重試"); }
    finally { setBusy(false); }
  }
  function field<K extends keyof PfPurchaseInput>(key: K, value: PfPurchaseInput[K]) { setDraft(current => current ? {...current,[key]:value} : current); }

  return <section className="pf-dashboard">
    <div className="calendar-header"><div><span className="section-label">PF / 實付成本</span><h2>Prop Firm 真實成本</h2><p>記下買了哪個帳號、什麼時候買，以及實際花了多少。</p></div>{!readOnly && <button type="button" className="primary-button pf-add" disabled={busy || loading} onClick={() => openForm()}><Plus size={18}/>新增購買紀錄</button>}</div>
    {error && <div className="alert error" role="alert">{error}{!draft && <button type="button" onClick={() => setRefresh(value => value + 1)}>重試</button>}</div>}
    {message && <div className="alert success" role="status">{message}</div>}
    {loading ? <div className="form-card loading-card">正在載入 PF 購買紀錄…</div> : <>
      <div className="pf-metrics"><div className="pf-metric"><span>累計購買成本</span><CostAmounts purchases={purchases}/></div><div className="pf-metric"><span>{month.replace("-"," 年 ")} 月購買成本</span><CostAmounts purchases={monthPurchases}/></div><div className="pf-metric"><span>累計購買次數</span><strong>{purchases.length}<small>次</small></strong><p>所選月份 {monthPurchases.length} 次</p></div></div>
      <p className="summary-notes pf-cost-note">依折扣後的實付金額統計，USD 與 TWD 各自加總。一筆紀錄代表一次帳號購買。</p>
      {draft && !readOnly && <form className="form-card pf-form" id="pf-purchase-form" onSubmit={save}>
        <div className="card-heading"><div><span className="section-label">購買資料</span><h2>{editingId ? "修改購買紀錄" : "新增購買紀錄"}</h2></div></div>
        <div className="pf-fields form-section"><div><label className="field-label" htmlFor="pf-date">購買日期</label><input id="pf-date" className="text-input" type="date" required min="1000-01-01" max="9999-12-31" disabled={busy} value={draft.purchaseDate} onChange={event => field("purchaseDate",event.target.value)}/></div><div><label className="field-label" htmlFor="pf-firm">Prop Firm 公司</label><input id="pf-firm" className="text-input" required maxLength={100} disabled={busy} value={draft.firm} onChange={event => field("firm",event.target.value)} placeholder="輸入公司名稱"/></div><div className="pf-wide"><label className="field-label" htmlFor="pf-label">帳號方案／名稱 <span className="optional">選填</span></label><input id="pf-label" className="text-input" maxLength={100} disabled={busy} value={draft.accountLabel} onChange={event => field("accountLabel",event.target.value)} placeholder="例如：50K 考試帳號、第二個帳號"/></div><div><label className="field-label" htmlFor="pf-currency">付款幣別</label><select id="pf-currency" className="text-input" disabled={busy} value={draft.currency} onChange={event => field("currency",event.target.value as PfCurrency)}><option value="USD">USD 美元</option><option value="TWD">TWD 台幣</option></select></div><div><label className="field-label" htmlFor="pf-amount">實付金額</label><input id="pf-amount" className="text-input" type="number" required min="0" max="999999999.99" step="0.01" inputMode="decimal" disabled={busy} value={draft.amount} onChange={event => field("amount",event.target.value)} placeholder="請填折扣後實付金額"/></div></div>
        <div className="form-actions"><span>免費帳號可填 0；金額依你實際付款記錄。</span><div className="pf-form-buttons"><button type="button" className="secondary-button" disabled={busy} onClick={closeForm}>取消</button><button type="submit" className="primary-button" disabled={busy || !valid}>{busy ? "儲存中…" : editingId ? "儲存修改" : "儲存購買紀錄"}</button></div></div>
      </form>}
      <div className="calendar-panel pf-purchase-panel"><div className="pf-list-heading"><h3><Receipt size={19}/>帳號購買紀錄</h3><div className="pf-list-filter"><label htmlFor="pf-month">月份</label><input id="pf-month" className="text-input" type="month" min="1000-01" max="9999-12" disabled={showAll || busy} value={month} onChange={event => { if (/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(event.target.value)) setMonth(event.target.value); }}/><label className="pf-show-all"><input type="checkbox" checked={showAll} disabled={busy} onChange={event => setShowAll(event.target.checked)}/>顯示全部</label></div></div>
        {visible.length ? <div className="pf-purchase-list">{visible.map(purchase => <article className="pf-purchase" key={purchase.id}><div className="pf-firm-icon" aria-hidden="true"><Building2 size={21}/></div><div className="pf-purchase-main"><span>{dateLabel(purchase.purchaseDate)}</span><h4>{purchase.firm}</h4>{purchase.accountLabel && <p>{purchase.accountLabel}</p>}{purchase.updatedAt && <small>已修改</small>}</div><div className="pf-purchase-cost"><strong>{formatPfMoney(purchase.amountCents,purchase.currency)}</strong><span>實付成本</span>{!readOnly && <button type="button" className="secondary-button" disabled={busy} aria-label={`修改 ${purchase.purchaseDate} ${purchase.firm} 的購買紀錄`} onClick={() => openForm(purchase)}><Pencil size={14}/>修改</button>}</div></article>)}</div> : <div className="pf-empty"><Receipt size={30}/><h4>{purchases.length ? "這個月份沒有購買紀錄" : "先記下第一個 PF 帳號"}</h4><p>{purchases.length ? "可選其他月份，或勾選「顯示全部」。" : readOnly ? "尚未新增帳號購買紀錄。" : "新增購買日期、公司與實付費用，開始累計你的成本。"}</p></div>}
      </div>
    </>}
  </section>;
}

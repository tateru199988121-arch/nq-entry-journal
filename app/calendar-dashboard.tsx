"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import type { Strategy, Trade } from "@/lib/journal-db";
import { byTaipeiDay, effectivePnl, summarize, taipeiDateKey, type Summary } from "@/lib/calendar-stats";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const monthLabel = new Intl.DateTimeFormat("zh-TW", { timeZone: "UTC", year: "numeric", month: "long" });
const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
function money(value: number | null) { return value === null ? "—" : usd.format(value); }
function tone(value: number | null) { return value === null || value === 0 ? "neutral" : value > 0 ? "positive" : "negative"; }
function rate(value: number | null) { return value === null ? "—" : `${(value * 100).toFixed(1)}%`; }
function factor(value: number | null) { return value === null ? "—" : value === Infinity ? "∞" : value.toFixed(2); }
function addMonths(key: string, delta: number) { const [year, month] = key.split("-").map(Number); return new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 7); }
function displayDate(key: string) { const [year, month, day] = key.split("-").map(Number); return `${year} 年 ${month} 月 ${day} 日（週${weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]}）`; }
function displayTime(iso: string) { return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)); }

function Metric({ label, value, toneClass }: { label: string; value: string; toneClass?: string }) {
  return <div className="calendar-metric"><span>{label}</span><strong className={toneClass ?? ""}>{value}</strong></div>;
}

function PerformanceChart({ trades }: { trades: Trade[] }) {
  const points = trades.filter(trade => effectivePnl(trade).value !== null)
    .sort((a, b) => (a.closedAt ?? "").localeCompare(b.closedAt ?? ""))
    .reduce<{index:number; total:number}[]>((all, trade) => {
      const total = (all.at(-1)?.total ?? 0) + (effectivePnl(trade).value ?? 0);
      all.push({ index: all.length + 1, total }); return all;
    }, [{ index: 0, total: 0 }]);
  if (points.length < 2) return <div className="chart-empty">還沒有可計算的損益，填寫實際淨損益或出場點位後會顯示走勢。</div>;
  const values = points.map(point => point.total);
  const low = Math.min(0, ...values), high = Math.max(0, ...values);
  const span = high - low || 1;
  const x = (index: number) => 26 + index * 920 / Math.max(1, points.length - 1);
  const y = (value: number) => 163 - (value - low) * 125 / span;
  const line = points.map((point, i) => `${i ? "L" : "M"}${x(i)},${y(point.total)}`).join(" ");
  const zeroY = y(0);
  return <div className="chart-wrap"><svg viewBox="0 0 980 200" role="img" aria-label="逐筆累計損益走勢" preserveAspectRatio="none"><line x1="26" x2="946" y1={zeroY} y2={zeroY} stroke="#45606a" strokeDasharray="5 6"/><path d={line} fill="none" stroke={points.at(-1)!.total >= 0 ? "#79dcc4" : "#f18481"} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>{points.map((point, i) => <circle key={i} cx={x(i)} cy={y(point.total)} r="3" fill={point.total >= 0 ? "#79dcc4" : "#f18481"}/>)}</svg><div className="chart-axis"><span>開始 $0</span><span>{points.length - 1} 筆已計價交易 · 結束 {money(points.at(-1)!.total)}</span></div></div>;
}

function SummaryNotes({ summary }: {summary: Summary}) {
  return <p className="summary-notes">{summary.missing > 0 && <>有 {summary.missing} 筆未填損益，沒有算進金額、勝率及獲利因子。 </>}{summary.estimated > 0 && <>有 {summary.estimated} 筆依出場價估算毛損益，未扣手續費。 </>}{summary.mismatched > 0 && <span className="negative">有 {summary.mismatched} 筆金額正負號與止盈／止損標記不一致，請到交易紀錄確認。 </span>}勝率以已填損益的交易計算，包含持平交易。獲利因子為總獲利除以總虧損的絕對值。統計以台北時間的平倉日期為準。</p>;
}

export default function CalendarDashboard({ strategies }: { strategies: Strategy[] }) {
  const currentMonth = taipeiDateKey(new Date().toISOString()).slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [view, setView] = useState<"calendar" | "month" | "day">("calendar");
  const [day, setDay] = useState<string | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setTrades([]);
    fetch(`/api/calendar?month=${month}`, { signal: controller.signal })
      .then(async response => { const data = await response.json() as {trades?:Trade[];error?:string}; if (!response.ok) throw new Error(data.error || "讀取日曆失敗"); return data.trades ?? []; })
      .then(setTrades)
      .catch(err => { if (err.name !== "AbortError") setError(err instanceof Error ? err.message : "讀取日曆失敗"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [month, refresh]);

  const days = useMemo(() => byTaipeiDay(trades), [trades]);
  const monthDays = useMemo(() => [...days.entries()].filter(([key]) => key.startsWith(month)).sort(([a], [b]) => a.localeCompare(b)), [days, month]);
  const monthTrades = useMemo(() => monthDays.flatMap(([, items]) => items), [monthDays]);
  const monthSummary = useMemo(() => summarize(monthTrades), [monthTrades]);
  const dayTrades = day ? days.get(day) ?? [] : [];
  const daySummary = summarize(dayTrades);
  const [year, monthNumber] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const weekCount = Math.ceil((firstWeekday + new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()) / 7);
  const weeks = Array.from({ length: weekCount }, (_, week) => Array.from({ length: 7 }, (_, weekday) => {
    const date = new Date(Date.UTC(year, monthNumber - 1, 1 + week * 7 + weekday - firstWeekday));
    return { key: date.toISOString().slice(0, 10), number: date.getUTCDate(), inMonth: date.getUTCMonth() === monthNumber - 1 };
  }));
  const strategyRows = useMemo(() => {
    const names = [...strategies.map(strategy => strategy.title), "亂做單", ...new Set(monthTrades.map(trade => trade.strategyTitle))];
    return [...new Set(names)].map(name => ({ name, summary: summarize(monthTrades.filter(trade => trade.strategyTitle === name)) }));
  }, [strategies, monthTrades]);
  const rankedDays = monthDays.map(([key, entries]) => ({ key, summary: summarize(entries) })).filter(item => item.summary.total !== null).sort((a, b) => (a.summary.total ?? 0) - (b.summary.total ?? 0));

  function changeMonth(delta: number) { setMonth(previous => addMonths(previous, delta)); setDay(null); setView("calendar"); }

  return <section className="calendar-dashboard">
    <div className="calendar-header"><div><span className="section-label">03 / 盈虧回顧</span><h2>{view === "day" && day ? displayDate(day) : view === "month" ? `${monthLabel.format(new Date(Date.UTC(year, monthNumber - 1, 1)))}總結` : "盈虧日曆"}</h2><p>以台北時間平倉日歸類 · 幣別 USD</p></div><div className="calendar-actions">{view === "day" && <button type="button" onClick={() => setView("calendar")}><ArrowLeft size={15}/>返回日曆</button>}<button type="button" className={view === "calendar" ? "active" : ""} onClick={() => setView("calendar")}>日曆</button><button type="button" className={view === "month" ? "active" : ""} onClick={() => setView("month")}>月總結</button></div></div>
    <div className="month-toolbar"><button type="button" aria-label="上個月" onClick={() => changeMonth(-1)}><ChevronLeft size={17}/></button><strong>{monthLabel.format(new Date(Date.UTC(year, monthNumber - 1, 1)))}</strong><button type="button" aria-label="下個月" onClick={() => changeMonth(1)}><ChevronRight size={17}/></button><button type="button" className="today-button" onClick={() => { setMonth(currentMonth); setDay(null); setView("calendar"); }}>本月</button></div>
    {error && <div className="alert error" role="alert">{error}<button type="button" onClick={() => setRefresh(value => value + 1)}>重試</button></div>}
    {loading ? <div className="form-card loading-card">正在讀取 {month} 的交易資料…</div> : view === "calendar" ? <>
      <div className="calendar-scroll"><div className="calendar-grid"><div className="calendar-weekdays">{weekdays.map(weekday => <span key={weekday}>週{weekday}</span>)}<span>每週合計</span></div>{weeks.map((week, index) => {
        const weekTrades = week.filter(date => date.inMonth).flatMap(date => days.get(date.key) ?? []);
        const weekSummary = summarize(weekTrades);
        return <div className="calendar-week" key={index}>{week.map(date => {
          const summary = summarize(date.inMonth ? days.get(date.key) ?? [] : []);
          return <button type="button" key={date.key} className={`calendar-day ${date.inMonth ? "" : "outside"} ${summary.count ? tone(summary.total) : ""}`} disabled={!date.inMonth} onClick={() => { setDay(date.key); setView("day"); }} aria-label={`${date.key}，${summary.count} 筆交易，損益 ${money(summary.total)}`}><span className="day-number">{date.number}</span>{summary.count > 0 && <span className="day-info"><strong>{money(summary.total)}</strong><small>{summary.count} 筆 · 勝率 {rate(summary.winRate)}</small>{summary.missing > 0 && <small>{summary.missing} 筆損益未填</small>}</span>}</button>;
        })}<div className={`calendar-week-total ${tone(weekSummary.total)}`}><small>第 {index + 1} 週</small><strong>{money(weekSummary.total)}</strong><span>{weekTrades.length ? `${week.filter(date => date.inMonth && (days.get(date.key)?.length ?? 0) > 0).length} 個交易日` : "0 個交易日"}</span></div></div>;
      })}</div></div><SummaryNotes summary={monthSummary}/>
    </> : view === "day" && day ? <>
      <div className="calendar-metrics"><Metric label="損益合計" value={money(daySummary.total)} toneClass={tone(daySummary.total)}/><Metric label="交易筆數" value={String(daySummary.count)}/><Metric label="勝率" value={rate(daySummary.winRate)}/><Metric label="獲利因子" value={factor(daySummary.profitFactor)}/><Metric label="獲利筆數" value={String(daySummary.wins)} toneClass="positive"/><Metric label="虧損筆數" value={String(daySummary.losses)} toneClass="negative"/></div>
      <div className="calendar-panel"><h3>損益走勢</h3><PerformanceChart trades={dayTrades}/></div>
      <div className="calendar-panel"><h3>當日交易</h3>{dayTrades.length ? <div className="calendar-trades">{[...dayTrades].sort((a,b) => (a.closedAt ?? "").localeCompare(b.closedAt ?? "")).map(trade => { const pnl = effectivePnl(trade); return <div className="calendar-trade" key={trade.id}><div><strong>{trade.strategyTitle}</strong><span>{trade.direction} · {trade.contract ?? "合約未填"} × {trade.quantity ?? "—"} · {trade.closedAt ? displayTime(trade.closedAt) : "—"} 平倉</span><small>{trade.result ?? "未標記結果"}</small>{trade.reflection && <p className="calendar-reflection">{trade.reflection}</p>}</div><strong className={tone(pnl.value)}>{money(pnl.value)}{pnl.estimated && <small>估算毛損益</small>}</strong></div>; })}</div> : <p className="empty-calendar">這一天沒有已完成的交易。</p>}</div><SummaryNotes summary={daySummary}/>
    </> : <>
      <div className="calendar-metrics month-metrics"><Metric label="月損益合計" value={money(monthSummary.total)} toneClass={tone(monthSummary.total)}/><Metric label="交易筆數" value={String(monthSummary.count)}/><Metric label="交易日數" value={String(monthDays.length)}/><Metric label="勝率" value={rate(monthSummary.winRate)}/><Metric label="獲利因子" value={factor(monthSummary.profitFactor)}/><Metric label="贏 / 輸 / 持平" value={`${monthSummary.wins} / ${monthSummary.losses} / ${monthSummary.flat}`}/></div>
      <div className="calendar-panel"><h3>本月累計損益</h3><PerformanceChart trades={monthTrades}/></div>
      <div className="month-panels"><div className="calendar-panel"><h3>策略表現</h3><div className="strategy-table"><div className="strategy-table-head"><span>策略</span><span>筆數</span><span>損益</span><span>勝率</span></div>{strategyRows.map(row => <div className="strategy-table-row" key={row.name}><strong>{row.name}</strong><span>{row.summary.count}</span><span className={tone(row.summary.total)}>{money(row.summary.total)}</span><span>{rate(row.summary.winRate)}</span></div>)}</div></div><div className="calendar-panel month-highlights"><h3>月份觀察</h3><div><span>最佳交易日</span><strong className={rankedDays.length ? tone(rankedDays.at(-1)!.summary.total) : ""}>{rankedDays.length ? `${rankedDays.at(-1)!.key} · ${money(rankedDays.at(-1)!.summary.total)}` : "—"}</strong></div><div><span>最差交易日</span><strong className={rankedDays.length ? tone(rankedDays[0].summary.total) : ""}>{rankedDays.length ? `${rankedDays[0].key} · ${money(rankedDays[0].summary.total)}` : "—"}</strong></div><div><span>尚未填損益</span><strong>{monthSummary.missing} 筆</strong></div></div></div><SummaryNotes summary={monthSummary}/>
    </>}
  </section>;
}

const partsFormatter = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});

export function taipeiDateTimeInput(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = Object.fromEntries(partsFormatter.formatToParts(date).map(part => [part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function fromTaipeiDateTimeInput(value: string): string | null {
  if (!/^(20\d{2}|[3-9]\d{3})-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+08:00`);
  if (!Number.isFinite(date.getTime())) return null;
  const iso = date.toISOString();
  return taipeiDateTimeInput(iso) === value ? iso : null;
}

export function isTradeInstant(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const time = new Date(value);
  return Number.isFinite(time.getTime()) && time.toISOString() === value;
}

export function tradeTimeError(entryAt: unknown, closedAt: unknown = null, now = Date.now()): string | null {
  if (!isTradeInstant(entryAt)) return "請填寫有效的進場日期與時間";
  if (new Date(entryAt).getTime() > now) return "進場時間不能晚於現在";
  if (closedAt !== null) {
    if (!isTradeInstant(closedAt)) return "請填寫有效的平倉日期與時間";
    if (new Date(closedAt).getTime() > now) return "平倉時間不能晚於現在";
    if (closedAt < entryAt) return "平倉時間不能早於進場時間";
  }
  return null;
}

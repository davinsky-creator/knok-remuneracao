export const NIGHT_RATE = 13;
export const DAY_RATES = [10, 12, 16];
export const DEFAULT_DAY_RATE = 12;
export const PAYLOAD_VERSION = 3;

export function validDate(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export function normalizeDate(value, selectedMonth) {
  const s = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return validDate(y, m, d) ? s : null;
  }
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (!m) return null;
  const [, dd, mm, yy] = m;
  const fallbackYear = Number(String(selectedMonth || '').slice(0, 4)) || new Date().getFullYear();
  const year = yy ? (Number(yy) < 100 ? 2000 + Number(yy) : Number(yy)) : fallbackYear;
  const month = Number(mm), day = Number(dd);
  if (!validDate(year, month, day)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function normalizeTime(value) {
  const raw = String(value ?? '').trim().replace(/…/g, '...');
  let m = raw.match(/^(\d{1,2})(?:\.\.\.)$/);
  if (m) {
    const h = Number(m[1]);
    return h < 24 ? `${String(h).padStart(2, '0')}:00` : null;
  }
  m = raw.match(/^(\d{1,2})$/);
  if (m) {
    const h = Number(m[1]);
    return h < 24 ? `${String(h).padStart(2, '0')}:00` : null;
  }
  const s = raw.replace('.', ':');
  m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function parseTimeRange(text) {
  const clean = String(text ?? '').replace(/…/g, '...').replace(/\s+/g, ' ').trim();
  const patterns = [
    /(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/,
    /(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2})\s*\.\.\./,
    /(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2})(?![:\d])/,
    /(\d{1,2}:\d{2})\s+to\s+(\d{1,2}:\d{2})/i
  ];
  for (const re of patterns) {
    const m = clean.match(re);
    if (!m) continue;
    const start = normalizeTime(m[1]);
    const end = normalizeTime(m[2]);
    if (start && end && start !== end) return [start, end];
  }
  return null;
}

export function shiftKey(s) {
  return `${s.date}|${s.start}|${s.end}`;
}

export function normalizeShift(input) {
  const date = normalizeDate(input?.date, input?.date?.slice?.(0, 7));
  const start = normalizeTime(input?.start);
  const end = normalizeTime(input?.end);
  return date && start && end && start !== end ? { date, start, end } : null;
}

export function dedupeShifts(shifts) {
  const map = new Map();
  for (const raw of shifts || []) {
    const s = normalizeShift(raw);
    if (s) map.set(shiftKey(s), s);
  }
  return [...map.values()].sort((a, b) => (a.date + a.start + a.end).localeCompare(b.date + b.start + b.end));
}

export function dominantMonth(shifts) {
  const counts = new Map();
  for (const s of dedupeShifts(shifts)) {
    const m = s.date.slice(0, 7);
    counts.set(m, (counts.get(m) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] || null;
}

export function onlyMonth(shifts, month) {
  return dedupeShifts(shifts).filter(s => s.date.startsWith(`${month}-`));
}

export function parseText(text, selectedMonth) {
  const result = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^(data|date|dia)[;,\t ]/i.test(line)) continue;
    const parts = line.split(/[;,\t]/).map(x => x.trim()).filter(Boolean);
    let d, a, b;
    if (parts.length >= 3) [d, a, b] = parts;
    else {
      const m = line.match(/^(\d{1,2}(?:[/-]\d{1,2}(?:[/-]\d{2,4})?)?|\d{4}-\d{2}-\d{2})\s+(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}(?:[:.]\d{2}|\.\.\.|…)?)/);
      if (m) [, d, a, b] = m;
    }
    const date = normalizeDate(d, selectedMonth), start = normalizeTime(a), end = normalizeTime(b);
    if (date && start && end && start !== end) result.push({ date, start, end });
  }
  return dedupeShifts(result);
}

function minutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function overlap(a, b, c, d) {
  return Math.max(0, Math.min(b, d) - Math.max(a, c));
}
export function splitShift(shift, dayRate = DEFAULT_DAY_RATE) {
  const s = normalizeShift(shift);
  if (!s) throw new Error('Invalid shift');
  let start = minutes(s.start), end = minutes(s.end);
  if (end < start) end += 1440;
  if (end === start) throw new Error('Zero-duration shift');
  const nightMinutes = overlap(start, end, 0, 420) + overlap(start, end, 1440, 1860);
  const totalMinutes = end - start;
  const night = nightMinutes / 60;
  const day = (totalMinutes - nightMinutes) / 60;
  return { ...s, day, night, pay: day * dayRate + night * NIGHT_RATE };
}

export function totals(shifts, dayRate = DEFAULT_DAY_RATE) {
  let day = 0, night = 0;
  for (const s of dedupeShifts(shifts)) {
    const row = splitShift(s, dayRate);
    day += row.day; night += row.night;
  }
  return {
    day, night, total: day + night,
    dayPay: day * dayRate,
    nightPay: night * NIGHT_RATE,
    pay: day * dayRate + night * NIGHT_RATE
  };
}

function encodeUtf8Base64Url(value) {
  const binary = unescape(encodeURIComponent(value));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function decodeUtf8Base64Url(value) {
  let s = String(value ?? '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return decodeURIComponent(escape(atob(s)));
}

export function encodePayload(shifts, source = 'knok-extension', diagnostics = null) {
  const clean = dedupeShifts(shifts);
  const payload = JSON.stringify({ v: PAYLOAD_VERSION, source, exportedAt: new Date().toISOString(), diagnostics, shifts: clean });
  return encodeUtf8Base64Url(payload);
}

export function decodePayload(encoded) {
  const obj = JSON.parse(decodeUtf8Base64Url(encoded));
  if (![1, 2, 3].includes(Number(obj?.v ?? 1)) || !Array.isArray(obj?.shifts)) throw new Error('Payload inválido');
  const shifts = dedupeShifts(obj.shifts);
  if (!shifts.length) throw new Error('Payload sem turnos válidos');
  const diagnostics = obj?.diagnostics && typeof obj.diagnostics === 'object' ? {
    month: typeof obj.diagnostics.month === 'string' ? obj.diagnostics.month : null,
    title: typeof obj.diagnostics.title === 'string' ? obj.diagnostics.title.slice(0, 120) : null,
    cellCount: Number(obj.diagnostics.cellCount) || 0,
    eventNodeCount: Number(obj.diagnostics.eventNodeCount) || 0,
    parsedEventNodeCount: Number(obj.diagnostics.parsedEventNodeCount) || 0,
    unparsedEventNodeCount: Number(obj.diagnostics.unparsedEventNodeCount) || 0,
    healthy: Boolean(obj.diagnostics.healthy)
  } : null;
  return { ...obj, v: Number(obj.v ?? 1), diagnostics, shifts };
}

export function reconcileMonth(existing, incoming, month) {
  const before = onlyMonth(existing, month);
  const after = onlyMonth(incoming, month);
  const beforeKeys = new Set(before.map(shiftKey));
  const afterKeys = new Set(after.map(shiftKey));
  const added = after.filter(s => !beforeKeys.has(shiftKey(s)));
  const removed = before.filter(s => !afterKeys.has(shiftKey(s)));
  const unchanged = after.filter(s => beforeKeys.has(shiftKey(s)));
  return { shifts: after, added, removed, unchanged };
}

export function safeReconcileMonth(existing, incoming, month, diagnostics = null) {
  const diff = reconcileMonth(existing, incoming, month);
  const destructive = diff.removed.length > 0;
  const healthy = Boolean(diagnostics?.healthy);
  if (!destructive || healthy) return { ...diff, mode: 'replace', requiresReview: destructive };
  const merged = dedupeShifts([...onlyMonth(existing, month), ...onlyMonth(incoming, month)]);
  return {
    ...diff,
    shifts: merged,
    mode: 'merge-safe',
    requiresReview: true,
    warning: 'Leitura incompleta: os turnos existentes foram preservados.'
  };
}

// 날짜 유틸 — 모든 계산은 로컬 시간 기준. 저장 형식: 'YYYY-MM-DD' 또는 'YYYY-MM-DDTHH:mm'
export const MIN = 60000;
export const HOUR = 3600000;
export const DAY = 86400000;

export const pad2 = n => String(n).padStart(2, '0');

export const toDateStr = d =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const toDateTimeStr = d =>
  `${toDateStr(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

export function parseLocal(str) {
  const [datePart, timePart] = String(str).split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  if (!timePart) return new Date(y, m - 1, d);
  const [hh, mm] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

export const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n,
    d.getHours(), d.getMinutes());
}

export const addMinutes = (d, n) => new Date(d.getTime() + n * MIN);

export const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// b - a (달력상 일수 차이, DST 안전)
export const diffDays = (a, b) =>
  Math.round((startOfDay(b) - startOfDay(a)) / DAY);

export function startOfWeek(d, weekStart = 0) {
  const r = startOfDay(d);
  const diff = (r.getDay() - weekStart + 7) % 7;
  return addDays(r, -diff);
}

export const startOfMonth = d => new Date(d.getFullYear(), d.getMonth(), 1);
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate(); // m: 0-based

// 이벤트의 시작 Date
export const evStart = ev => parseLocal(ev.start);

// 이벤트의 끝 Date (exclusive 의미).
// 종일 이벤트의 end는 '포함되는 마지막 날짜'로 저장 → +1일 하여 exclusive로 변환
export function evEnd(ev) {
  if (ev.allDay) return addDays(parseLocal(ev.end), 1);
  return parseLocal(ev.end);
}

// exclusive 끝 시각이 걸치는 마지막 표시 날짜 (자정 정각 종료 = 전날까지 표시)
export const displayEndDay = excEnd => startOfDay(new Date(excEnd.getTime() - 1));

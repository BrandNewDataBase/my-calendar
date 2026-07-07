// 반복 일정 엔진 — RRULE 부분집합.
// recurrence: {freq:'daily'|'weekly'|'monthly'|'yearly', interval:1,
//              byWeekday:[0..6]?, monthlyMode:'date'|'weekday',
//              end:{type:'never'|'until'|'count', until?:'YYYY-MM-DD', count?:number}}
// exdates: 제외된 발생일의 'YYYY-MM-DD' 배열 (발생 시작일 기준)
import {
  evStart, evEnd, addDays, startOfDay, startOfWeek,
  toDateStr, parseLocal, daysInMonth, diffDays,
} from './dateutil.js';

const MAX_ITER = 20000;

// ev를 [rangeStart, rangeEnd) 와 겹치는 발생들로 전개 (시작 시각 오름차순)
export function expandInRange(ev, rangeStart, rangeEnd) {
  const s = evStart(ev);
  const e = evEnd(ev);
  if (isNaN(s) || isNaN(e)) return []; // 손상된 날짜 문자열 방어
  const isAllDay = !!ev.allDay;
  // 종일 이벤트는 달력 일수로 길이를 계산 (DST 지역에서 ms 합산 시 하루 왜곡 방지)
  const dayCount = isAllDay ? Math.max(1, diffDays(s, e)) : 0;
  const dur = Math.max(0, e - s);
  const occEndOf = d => (isAllDay ? addDays(d, dayCount) : new Date(d.getTime() + dur));
  const makeOcc = (occStart, recurring) => ({
    ev,
    occStart,
    occEnd: occEndOf(occStart),
    occId: recurring ? `${ev.id}::${toDateStr(occStart)}` : ev.id,
    recurring,
  });
  const out = [];
  const exdates = new Set(ev.exdates || []);
  const overlaps = d => occEndOf(d) > rangeStart && d < rangeEnd;

  if (!ev.recurrence) {
    if (overlaps(s)) out.push(makeOcc(s, false));
    return out;
  }

  const r = ev.recurrence;
  const interval = Math.max(1, r.interval || 1);
  const maxCount = r.end?.type === 'count' ? Math.max(1, r.end.count || 1) : Infinity;
  // until은 '포함되는' 마지막 날짜 → 다음 날 자정이 컷오프
  const untilCutoff = (r.end?.type === 'until' && r.end.until)
    ? addDays(startOfDay(parseLocal(r.end.until)), 1)
    : null;

  let count = 0;
  let iter = 0;
  const hh = s.getHours(), mm = s.getMinutes();

  // 후보(오름차순) 검사. false 반환 시 순회 종료.
  const visit = d => {
    if (d < s) return true; // 시리즈 시작 이전 후보는 건너뜀
    if (untilCutoff && d >= untilCutoff) return false;
    count++;
    if (count > maxCount) return false;
    if (!exdates.has(toDateStr(d)) && overlaps(d)) out.push(makeOcc(d, true));
    return d < rangeEnd;
  };

  if (r.freq === 'daily') {
    for (let k = 0; iter++ < MAX_ITER; k += interval) {
      if (!visit(new Date(s.getFullYear(), s.getMonth(), s.getDate() + k, hh, mm))) break;
    }
  } else if (r.freq === 'weekly') {
    // 주 단위 계산은 RRULE 기본값(WKST=MO)에 맞춰 월요일 시작으로 고정
    const byWeekday = (Array.isArray(r.byWeekday) && r.byWeekday.length ? [...r.byWeekday] : [s.getDay()])
      .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    let anchor = startOfWeek(s, 1);
    outer:
    for (;;) {
      for (const wd of byWeekday) {
        if (iter++ >= MAX_ITER) break outer;
        const base = addDays(anchor, (wd - 1 + 7) % 7);
        const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hh, mm);
        if (!visit(d)) break outer;
      }
      anchor = addDays(anchor, 7 * interval);
    }
  } else if (r.freq === 'monthly') {
    const baseY = s.getFullYear(), baseM = s.getMonth();
    if (r.monthlyMode === 'weekday') {
      // 매월 n번째 X요일 (시리즈 시작일 기준)
      const nth = Math.floor((s.getDate() - 1) / 7);
      const wd = s.getDay();
      for (let k = 0; iter++ < MAX_ITER; k += interval) {
        const y = baseY + Math.floor((baseM + k) / 12);
        const m = (baseM + k) % 12;
        const firstWd = new Date(y, m, 1).getDay();
        const dayN = 1 + ((wd - firstWd + 7) % 7) + nth * 7;
        if (dayN > daysInMonth(y, m)) continue; // n번째 요일이 없는 달은 건너뜀
        if (!visit(new Date(y, m, dayN, hh, mm))) break;
      }
    } else {
      const dayN = s.getDate();
      for (let k = 0; iter++ < MAX_ITER; k += interval) {
        const y = baseY + Math.floor((baseM + k) / 12);
        const m = (baseM + k) % 12;
        if (dayN > daysInMonth(y, m)) continue; // 29~31일이 없는 달은 건너뜀
        if (!visit(new Date(y, m, dayN, hh, mm))) break;
      }
    }
  } else if (r.freq === 'yearly') {
    const m = s.getMonth(), dayN = s.getDate();
    for (let k = 0; iter++ < MAX_ITER; k += interval) {
      const y = s.getFullYear() + k;
      if (dayN > daysInMonth(y, m)) continue; // 2/29 → 평년 건너뜀
      if (!visit(new Date(y, m, dayN, hh, mm))) break;
    }
  }
  return out;
}

// 여러 이벤트를 한 번에 전개 + 정렬 (시작 오름차순, 같으면 긴 것 먼저 — 레인 배치용)
export function occurrencesInRange(events, rangeStart, rangeEnd, { visibleCats = null } = {}) {
  const out = [];
  for (const ev of events) {
    if (visibleCats && !visibleCats.has(ev.categoryId)) continue;
    out.push(...expandInRange(ev, rangeStart, rangeEnd));
  }
  out.sort((a, b) =>
    a.occStart - b.occStart || (b.occEnd - b.occStart) - (a.occEnd - a.occStart));
  return out;
}

// after 이후 첫 발생 (D-Day, 검색 점프용). 2년 내 없으면 null.
export function nextOccurrence(ev, after) {
  const occs = expandInRange(ev, after, addDays(after, 731));
  return occs.find(o => o.occStart >= after) || occs[0] || null;
}

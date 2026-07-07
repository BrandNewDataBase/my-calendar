// 음력 변환 래퍼 — libs/korean-lunar-calendar.js (전역 KoreanLunarCalendar, 1000~2050년 지원)
import { toDateStr } from './dateutil.js';
import { t } from './i18n.js';

const cache = new Map();

// {year, month, day, intercalation} | null (범위 밖/라이브러리 부재)
export function getLunar(date) {
  const key = toDateStr(date);
  if (cache.has(key)) return cache.get(key);
  let val = null;
  try {
    if (typeof KoreanLunarCalendar !== 'undefined') {
      const c = new KoreanLunarCalendar();
      if (c.setSolarDate(date.getFullYear(), date.getMonth() + 1, date.getDate())) {
        val = c.getLunarCalendar();
      }
    }
  } catch {
    val = null;
  }
  if (cache.size > 2000) cache.clear();
  cache.set(key, val);
  return val;
}

// 월 그리드용 짧은 라벨: "5.24", 윤달이면 "윤5.24"
export function lunarShort(date) {
  const l = getLunar(date);
  if (!l) return '';
  return (l.intercalation ? t('lunar.leapMark') : '') + `${l.month}.${l.day}`;
}

// 데이 패널용 전체 라벨: "음력 2026년 5월 24일" / "Lunar May 24, 2026(윤달 표기 포함)"
export function lunarFull(date) {
  const l = getLunar(date);
  if (!l) return '';
  const leap = l.intercalation ? t('lunar.leapMark') : '';
  return t('lunar.full', { y: l.year, m: leap + l.month, d: l.day });
}

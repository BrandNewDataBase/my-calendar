// 사이드바 미니 캘린더 — 날짜 점프 + 일정 있는 날 점 표시
import { state } from '../store.js';
import { ui, bus } from '../bus.js';
import { occurrencesInRange } from '../recurrence.js';
import { fmtMonthTitle, weekdayName, t } from '../i18n.js';
import { el, wdClass } from '../dom.js';
import { openDayPanel } from './dayPanel.js';
import {
  startOfMonth, startOfWeek, startOfDay, addDays, sameDay, toDateStr, displayEndDay,
} from '../dateutil.js';

export function renderMiniCal(container) {
  container.textContent = '';
  const ws = state.settings.weekStart || 0;
  const first = startOfMonth(ui.cursor);
  const gridStart = startOfWeek(first, ws);
  const gridEnd = addDays(gridStart, 42);

  const head = el('div', 'mini-head');
  const prev = el('button', 'icon-btn', '‹');
  prev.type = 'button';
  prev.title = t('nav.prev');
  const next = el('button', 'icon-btn', '›');
  next.type = 'button';
  next.title = t('nav.next');
  prev.addEventListener('click', () => {
    ui.cursor = new Date(first.getFullYear(), first.getMonth() - 1, 1);
    bus.emit('refresh');
  });
  next.addEventListener('click', () => {
    ui.cursor = new Date(first.getFullYear(), first.getMonth() + 1, 1);
    bus.emit('refresh');
  });
  head.append(prev, el('span', 'mini-title', fmtMonthTitle(first)), next);

  const grid = el('div', 'mini-grid');
  for (let i = 0; i < 7; i++) {
    const wd = (ws + i) % 7;
    grid.append(el('div', 'mini-wd ' + wdClass(wd), weekdayName(wd, 'narrow')));
  }

  const visibleCats = new Set(state.categories.filter(c => c.visible !== false).map(c => c.id));
  const occs = occurrencesInRange(state.events, gridStart, gridEnd, { visibleCats });
  const dotDays = new Set();
  const gridLast = addDays(gridStart, 41);
  for (const o of occs) {
    // 그리드 범위로 잘라서 순회 (아주 긴 이벤트가 있어도 42일 이내로 제한)
    let dd = startOfDay(o.occStart);
    if (dd < gridStart) dd = gridStart;
    let de = displayEndDay(o.occEnd);
    if (de > gridLast) de = gridLast;
    for (; dd <= de; dd = addDays(dd, 1)) dotDays.add(toDateStr(dd));
  }

  const today = new Date();
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    const ds = toDateStr(d);
    const isHol = state.holidays[ds] !== undefined;
    const b = el('button', 'mini-day');
    b.type = 'button';
    if (d.getMonth() !== first.getMonth()) b.classList.add('other');
    if (sameDay(d, today)) b.classList.add('today');
    if (ui.selectedDate && sameDay(d, ui.selectedDate)) b.classList.add('selected');
    b.append(el('span', 'mini-num ' + (isHol ? 'wd-hol' : wdClass(d.getDay())), String(d.getDate())));
    if (dotDays.has(ds)) b.append(el('span', 'mini-dot'));
    b.addEventListener('click', () => {
      ui.cursor = d;
      openDayPanel(d);
    });
    grid.append(b);
  }

  container.append(head, grid);
}

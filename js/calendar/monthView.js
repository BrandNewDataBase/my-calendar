// 월 뷰 — 주 단위 레인 배치(멀티데이 블록), +N 더보기, 드래그앤드롭 이동
import { state } from '../store.js';
import { ui } from '../bus.js';
import { occurrencesInRange } from '../recurrence.js';
import { eventColorKey } from '../palette.js';
import { t, fmtTime, weekdayName } from '../i18n.js';
import { lunarShort } from '../lunar.js';
import { openEventEditor } from '../eventEditor.js';
import { openDayPanel } from './dayPanel.js';
import { applyMove } from './eventOps.js';
import { el, wdClass } from '../dom.js';
import {
  startOfMonth, startOfWeek, startOfDay, addDays, diffDays, sameDay,
  toDateStr, displayEndDay,
} from '../dateutil.js';

const LANE_H = 24;  // 이벤트 바 한 줄 높이(px)
const TOP_H = 30;   // 날짜 숫자 영역 높이(px)

let dragOcc = null; // 드래그 중인 발생

export function renderMonthView(container) {
  container.textContent = '';
  const weekStartSetting = state.settings.weekStart || 0;
  const first = startOfMonth(ui.cursor);
  const gridStart = startOfWeek(first, weekStartSetting);
  const nextMonth = new Date(first.getFullYear(), first.getMonth() + 1, 1);

  const weekStarts = [];
  for (let w = gridStart; w < nextMonth; w = addDays(w, 7)) weekStarts.push(w);
  const gridEnd = addDays(weekStarts[weekStarts.length - 1], 7);

  const visibleCats = new Set(state.categories.filter(c => c.visible !== false).map(c => c.id));
  const occs = occurrencesInRange(state.events, gridStart, gridEnd, { visibleCats });

  const grid = el('div', 'month-grid');
  const head = el('div', 'month-head');
  for (let i = 0; i < 7; i++) {
    const wd = (weekStartSetting + i) % 7;
    head.append(el('div', 'month-head-cell ' + wdClass(wd), weekdayName(wd, 'short')));
  }
  const body = el('div', 'month-body');
  grid.append(head, body);

  const today = new Date();
  const rows = [];

  for (const ws of weekStarts) {
    const rowEl = el('div', 'week-row');
    const cells = el('div', 'week-cells');
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i);
      const ds = toDateStr(d);
      const cell = el('div', 'day-cell');
      cell.dataset.date = ds;
      if (d.getMonth() !== first.getMonth()) cell.classList.add('other-month');
      if (sameDay(d, today)) cell.classList.add('today');
      if (ui.selectedDate && sameDay(d, ui.selectedDate)) cell.classList.add('selected');
      const holName = state.holidays[ds];
      const isHol = holName !== undefined;
      if (isHol) cell.classList.add('holiday');

      const top = el('div', 'day-top');
      const num = el('span', 'day-num ' + (isHol ? 'wd-hol' : wdClass(d.getDay())), String(d.getDate()));
      top.append(num, el('span', 'day-lunar', lunarShort(d)));
      cell.append(top);
      if (isHol && holName) cell.append(el('div', 'day-holname', holName));

      cell.addEventListener('click', () => openDayPanel(d));
      cell.addEventListener('dblclick', () => openEventEditor({
        defaults: {
          start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0),
          end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 0),
        },
      }));
      cell.addEventListener('dragover', e => {
        if (!dragOcc) return;
        e.preventDefault();
        cell.classList.add('drop-hover');
      });
      cell.addEventListener('dragleave', () => cell.classList.remove('drop-hover'));
      cell.addEventListener('drop', e => {
        e.preventDefault();
        cell.classList.remove('drop-hover');
        onDropToDay(d);
      });
      cells.append(cell);
    }
    const layer = el('div', 'week-events');
    rowEl.append(cells, layer);
    body.append(rowEl);
    rows.push({ ws, layer });
  }

  container.append(grid);

  // 셀 높이 측정 후 레인 용량 결정
  const rowH = body.clientHeight / weekStarts.length || 120;
  const capacity = Math.max(1, Math.floor((rowH - TOP_H - 6) / LANE_H));
  for (const { ws, layer } of rows) renderWeekEvents(layer, ws, occs, capacity);
}

function renderWeekEvents(layer, ws, occs, capacity) {
  const weekEnd = addDays(ws, 7);
  const segs = [];
  for (const o of occs) {
    if (o.occStart >= weekEnd) continue;
    const dispEnd = displayEndDay(o.occEnd);
    if (dispEnd < ws) continue;
    const sCol = Math.max(0, diffDays(ws, startOfDay(o.occStart)));
    const eCol = Math.min(6, diffDays(ws, dispEnd));
    if (eCol < sCol) continue;
    segs.push({
      o, sCol, eCol,
      contL: startOfDay(o.occStart) < ws,
      contR: dispEnd >= weekEnd,
    });
  }

  // 그리디 레인 배정 (segs는 시작 오름차순 · 긴 것 우선 정렬 상태)
  const laneEnds = [];
  for (const seg of segs) {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] >= seg.sCol) lane++;
    laneEnds[lane] = seg.eCol;
    seg.lane = lane;
  }

  const lanesNeeded = laneEnds.length;
  const visibleLanes = lanesNeeded <= capacity ? capacity : Math.max(0, capacity - 1);
  const hiddenPerCol = new Array(7).fill(0);

  for (const seg of segs) {
    if (seg.lane >= visibleLanes) {
      for (let c = seg.sCol; c <= seg.eCol; c++) hiddenPerCol[c]++;
      continue;
    }
    layer.append(makeBar(seg));
  }

  hiddenPerCol.forEach((n, c) => {
    if (!n) return;
    const chip = el('button', 'more-chip', t('more', { n }));
    chip.type = 'button';
    chip.style.left = `calc(${c} / 7 * 100% + 2px)`;
    chip.style.width = 'calc(100% / 7 - 4px)';
    chip.style.top = `${TOP_H + visibleLanes * LANE_H}px`;
    const day = addDays(ws, c);
    chip.addEventListener('click', e => {
      e.stopPropagation();
      openDayPanel(day);
    });
    layer.append(chip);
  });
}

function makeBar(seg) {
  const o = seg.o;
  const ev = o.ev;
  const key = eventColorKey(ev);
  const isBlock = ev.allDay || seg.eCol > seg.sCol; // 종일·멀티데이 → 색 블록
  const bar = el('div', 'ev-bar ' + (isBlock ? 'ev-block' : 'ev-chip'));
  bar.style.left = `calc(${seg.sCol} / 7 * 100% + 2px)`;
  bar.style.width = `calc(${seg.eCol - seg.sCol + 1} / 7 * 100% - 4px)`;
  bar.style.top = `${TOP_H + seg.lane * LANE_H}px`;

  if (isBlock) {
    bar.style.background = `var(--cat-${key})`;
    if (seg.contL) bar.classList.add('cont-l');
    if (seg.contR) bar.classList.add('cont-r');
    bar.append(el('span', 'bar-title', ev.title));
  } else {
    const dot = el('span', 'ev-dot');
    dot.style.background = `var(--cat-${key})`;
    bar.append(dot, el('span', 'bar-time', fmtTime(o.occStart)), el('span', 'bar-title', ev.title));
  }

  bar.draggable = true;
  bar.addEventListener('click', e => {
    e.stopPropagation();
    openEventEditor({ occ: o });
  });
  bar.addEventListener('dblclick', e => e.stopPropagation());
  bar.addEventListener('dragstart', e => {
    dragOcc = o;
    e.dataTransfer.effectAllowed = 'move';
    bar.classList.add('dragging');
  });
  bar.addEventListener('dragend', () => {
    dragOcc = null;
    document.querySelectorAll('.drop-hover').forEach(x => x.classList.remove('drop-hover'));
    bar.classList.remove('dragging');
  });
  return bar;
}

function onDropToDay(d) {
  if (!dragOcc) return;
  const o = dragOcc;
  dragOcc = null;
  const os = o.occStart;
  if (diffDays(startOfDay(os), startOfDay(d)) === 0) return; // 같은 날짜면 무시
  const newStart = o.ev.allDay
    ? startOfDay(d)
    : new Date(d.getFullYear(), d.getMonth(), d.getDate(), os.getHours(), os.getMinutes());
  applyMove(o, newStart);
}

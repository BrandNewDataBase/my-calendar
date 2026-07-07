// 주/일 뷰 — 시간 그리드 (드래그로 생성/이동/리사이즈, 15분 스냅, 현재 시각 선)
import { state } from '../store.js';
import { ui, bus } from '../bus.js';
import { occurrencesInRange } from '../recurrence.js';
import { eventColorKey } from '../palette.js';
import { t, fmtTime, fmtHour, weekdayName } from '../i18n.js';
import { lunarShort } from '../lunar.js';
import { openEventEditor } from '../eventEditor.js';
import { openDayPanel } from './dayPanel.js';
import { applyMove, applyResize } from './eventOps.js';
import { el, wdClass } from '../dom.js';
import {
  addDays, startOfDay, sameDay, toDateStr, diffDays, displayEndDay, DAY, MIN,
} from '../dateutil.js';

const HOUR_H = 48;
const SNAP = 15;
const ALLDAY_LANE_H = 24;
const ALLDAY_MAX = 3;

let gridDays = [];
let colsEl = null;
let colEls = [];
let scrollEl = null;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const minToDate = (day, m) =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, m);

export function renderTimeGrid(container, days) {
  container.textContent = '';
  gridDays = days;
  colEls = [];

  const rangeStart = days[0];
  const rangeEnd = addDays(days[days.length - 1], 1);
  const visibleCats = new Set(state.categories.filter(c => c.visible !== false).map(c => c.id));
  const occs = occurrencesInRange(state.events, rangeStart, rangeEnd, { visibleCats });
  const alldayLike = occs.filter(o => o.ev.allDay || (o.occEnd - o.occStart) >= DAY);
  const timed = occs.filter(o => !o.ev.allDay && (o.occEnd - o.occStart) < DAY);

  const root = el('div', 'time-grid');
  const today = new Date();

  // ---- 헤더 ----
  const head = el('div', 'tg-head');
  head.append(el('div', 'tg-corner'));
  for (const d of days) {
    const ds = toDateStr(d);
    const isHol = state.holidays[ds] !== undefined;
    const hc = el('button', 'tg-head-day' + (sameDay(d, today) ? ' today' : ''));
    hc.type = 'button';
    hc.append(
      el('span', 'tg-head-wd ' + (isHol ? 'wd-hol' : wdClass(d.getDay())), weekdayName(d.getDay(), 'short')),
      el('span', 'tg-head-num ' + (isHol ? 'wd-hol' : wdClass(d.getDay())), String(d.getDate())),
      el('span', 'tg-head-lunar', lunarShort(d)),
    );
    hc.addEventListener('click', () => {
      ui.view = 'day';
      ui.cursor = d;
      bus.emit('refresh');
    });
    head.append(hc);
  }
  root.append(head);

  // ---- 종일 레인 ----
  const alldayRow = el('div', 'tg-allday');
  const alldayLabel = el('div', 'tg-corner tg-allday-label', t('event.allDay'));
  const track = el('div', 'tg-allday-track');
  alldayRow.append(alldayLabel, track);
  root.append(alldayRow);

  const nDays = days.length;
  const segs = [];
  for (const o of alldayLike) {
    if (o.occStart >= rangeEnd) continue;
    const dispEnd = displayEndDay(o.occEnd);
    if (dispEnd < rangeStart) continue;
    const sCol = Math.max(0, diffDays(rangeStart, startOfDay(o.occStart)));
    const eCol = Math.min(nDays - 1, diffDays(rangeStart, dispEnd));
    if (eCol < sCol) continue;
    segs.push({ o, sCol, eCol });
  }
  const laneEnds = [];
  for (const seg of segs) {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] >= seg.sCol) lane++;
    laneEnds[lane] = seg.eCol;
    seg.lane = lane;
  }
  const lanesNeeded = laneEnds.length;
  const visibleLanes = Math.min(lanesNeeded, ALLDAY_MAX);
  const hiddenPerCol = new Array(nDays).fill(0);
  for (const seg of segs) {
    if (seg.lane >= visibleLanes) {
      for (let c = seg.sCol; c <= seg.eCol; c++) hiddenPerCol[c]++;
      continue;
    }
    const bar = el('div', 'ev-bar ev-block tg-allday-bar');
    bar.style.left = `calc(${seg.sCol} / ${nDays} * 100% + 2px)`;
    bar.style.width = `calc(${seg.eCol - seg.sCol + 1} / ${nDays} * 100% - 4px)`;
    bar.style.top = `${seg.lane * ALLDAY_LANE_H}px`;
    bar.style.background = `var(--cat-${eventColorKey(seg.o.ev)})`;
    bar.append(el('span', 'bar-title', seg.o.ev.title));
    bar.addEventListener('click', e => {
      e.stopPropagation();
      openEventEditor({ occ: seg.o });
    });
    track.append(bar);
  }
  const extraLane = hiddenPerCol.some(n => n > 0) ? 1 : 0;
  track.style.height = `${Math.max(1, visibleLanes + extraLane) * ALLDAY_LANE_H + 2}px`;
  hiddenPerCol.forEach((n, c) => {
    if (!n) return;
    const chip = el('button', 'more-chip', t('more', { n }));
    chip.type = 'button';
    chip.style.left = `calc(${c} / ${nDays} * 100% + 2px)`;
    chip.style.width = `calc(100% / ${nDays} - 4px)`;
    chip.style.top = `${visibleLanes * ALLDAY_LANE_H}px`;
    chip.addEventListener('click', () => openDayPanel(addDays(rangeStart, c)));
    track.append(chip);
  });

  // ---- 스크롤 시간 영역 ----
  scrollEl = el('div', 'tg-scroll');
  const inner = el('div', 'tg-scroll-inner');
  const gutter = el('div', 'tg-gutter');
  for (let h = 0; h < 24; h++) {
    gutter.append(el('div', 'tg-hour-label', h === 0 ? '' : fmtHour(h)));
  }
  colsEl = el('div', 'tg-cols');
  inner.append(gutter, colsEl);
  scrollEl.append(inner);
  root.append(scrollEl);

  days.forEach((d, i) => {
    const col = el('div', 'tg-col');
    col.dataset.date = toDateStr(d);
    if (sameDay(d, today)) col.classList.add('today');
    const dayStart = startOfDay(d);
    const dayEndMs = dayStart.getTime() + DAY;

    const items = [];
    for (const o of timed) {
      if (o.occEnd.getTime() <= dayStart.getTime() || o.occStart.getTime() >= dayEndMs) continue;
      const startMin = Math.max(0, (o.occStart - dayStart) / MIN);
      const endMin = Math.min(1440, (o.occEnd - dayStart) / MIN);
      if (endMin - startMin <= 0) continue;
      items.push({ o, startMin, endMin: Math.max(endMin, startMin + SNAP) });
    }
    layoutColumns(items);
    for (const it of items) {
      const block = el('div', 'tg-event');
      block.style.top = `${(it.startMin / 60) * HOUR_H}px`;
      block.style.height = `${Math.max(20, ((it.endMin - it.startMin) / 60) * HOUR_H - 2)}px`;
      block.style.left = `calc(${it.col} / ${it.cols} * 100% + 2px)`;
      block.style.width = `calc(${1} / ${it.cols} * 100% - 5px)`;
      block.style.background = `var(--cat-${eventColorKey(it.o.ev)})`;
      block.append(el('div', 'tge-title', it.o.ev.title));
      block.append(el('div', 'tge-time', `${fmtTime(it.o.occStart)} – ${fmtTime(it.o.occEnd)}`));
      // 이 칸에서 끝나는 이벤트만 리사이즈 핸들
      if (it.o.occEnd.getTime() <= dayEndMs) block.append(el('div', 'tge-resize'));
      block._occ = it.o;
      block._dayIndex = i;
      col.append(block);
    }

    if (sameDay(d, today)) {
      const line = el('div', 'now-line');
      line.append(el('span', 'now-dot'));
      col.append(line);
    }
    colsEl.append(col);
    colEls.push(col);
  });

  colsEl.addEventListener('pointerdown', onPointerDown);
  container.append(root);
  updateNowLine();
  scrollEl.scrollTop = 7.5 * HOUR_H;
}

// 겹치는 이벤트를 클러스터로 묶어 열 배치
function layoutColumns(items) {
  items.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const clusters = [];
  let cur = null;
  let curMaxEnd = -1;
  for (const it of items) {
    if (!cur || it.startMin >= curMaxEnd) {
      cur = [];
      clusters.push(cur);
      curMaxEnd = -1;
    }
    cur.push(it);
    curMaxEnd = Math.max(curMaxEnd, it.endMin);
  }
  for (const cl of clusters) {
    const colEnds = [];
    for (const it of cl) {
      let c = 0;
      while (c < colEnds.length && colEnds[c] > it.startMin) c++;
      colEnds[c] = it.endMin;
      it.col = c;
    }
    cl.forEach(it => { it.cols = colEnds.length; });
  }
}

function onPointerDown(e) {
  if (e.button !== 0) return;
  const blockEl = e.target.closest('.tg-event');
  const colEl = e.target.closest('.tg-col');
  if (!blockEl && !colEl) return;
  e.preventDefault();

  const posMin = clientY => {
    const r = colsEl.getBoundingClientRect();
    return clamp(((clientY - r.top) / HOUR_H) * 60, 0, 1440);
  };
  const colIdx = clientX => {
    const r = colsEl.getBoundingClientRect();
    return clamp(Math.floor((clientX - r.left) / (r.width / gridDays.length)), 0, gridDays.length - 1);
  };
  const snap = m => Math.round(m / SNAP) * SNAP;

  const startX = e.clientX, startY = e.clientY;
  let moved = false;
  let mode, occ = null, baseCol, anchorMin = 0, grabOffset = 0, durMin = 60;
  let curCol = 0, curStartMin = 0, curEndMin = 0;
  let ghost = null;

  if (blockEl) {
    occ = blockEl._occ;
    baseCol = blockEl._dayIndex;
    curCol = baseCol;
    mode = e.target.classList.contains('tge-resize') ? 'resize' : 'move';
    durMin = (occ.occEnd - occ.occStart) / MIN;
    const startRel = (occ.occStart - startOfDay(gridDays[baseCol])) / MIN; // 전날 시작이면 음수
    grabOffset = posMin(e.clientY) - startRel;
    curStartMin = startRel;
    curEndMin = (occ.occEnd - startOfDay(gridDays[baseCol])) / MIN;
  } else {
    mode = 'create';
    baseCol = colIdx(e.clientX);
    curCol = baseCol;
    anchorMin = Math.floor(posMin(e.clientY) / SNAP) * SNAP;
  }

  const ensureGhost = col => {
    if (ghost && ghost.parentNode === colEls[col]) return ghost;
    ghost?.remove();
    ghost = el('div', 'tg-ghost');
    colEls[col].append(ghost);
    return ghost;
  };
  const setGhost = (g, topMin, lenMin) => {
    g.style.top = `${(topMin / 60) * HOUR_H}px`;
    g.style.height = `${Math.max(14, (lenMin / 60) * HOUR_H - 2)}px`;
    const d = gridDays[curCol];
    g.textContent = `${fmtTime(minToDate(d, topMin))} – ${fmtTime(minToDate(d, topMin + lenMin))}`;
  };

  const onMove = mv => {
    if (!moved && Math.abs(mv.clientX - startX) < 4 && Math.abs(mv.clientY - startY) < 4) return;
    moved = true;
    document.body.classList.add('tg-dragging');
    if (mode === 'create') {
      const cur = snap(posMin(mv.clientY));
      const a = Math.min(anchorMin, cur);
      const b = Math.max(anchorMin, cur, a + SNAP);
      curStartMin = a;
      curEndMin = b;
      setGhost(ensureGhost(baseCol), a, b - a);
    } else if (mode === 'move') {
      curCol = colIdx(mv.clientX);
      curStartMin = clamp(snap(posMin(mv.clientY) - grabOffset), 0, 1440 - SNAP);
      blockEl.classList.add('drag-src');
      setGhost(ensureGhost(curCol), curStartMin, Math.min(durMin, 1440 - curStartMin));
    } else { // resize
      const startRel = Math.max(0, (occ.occStart - startOfDay(gridDays[baseCol])) / MIN);
      curEndMin = clamp(snap(posMin(mv.clientY)), startRel + SNAP, 1440);
      blockEl.classList.add('drag-src');
      setGhost(ensureGhost(baseCol), startRel, curEndMin - startRel);
    }
  };

  const onUp = async up => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    document.body.classList.remove('tg-dragging');
    ghost?.remove();
    blockEl?.classList.remove('drag-src');

    if (!moved) {
      if (mode === 'move' || mode === 'resize') {
        openEventEditor({ occ });
      } else {
        // 빈 곳 클릭: 30분 격자로 내림 + 1시간 일정
        const m = clamp(Math.floor(posMin(up.clientY) / 30) * 30, 0, 1380);
        const d = gridDays[baseCol];
        openEventEditor({ defaults: { start: minToDate(d, m), end: minToDate(d, m + 60) } });
      }
      return;
    }

    if (mode === 'create') {
      const d = gridDays[baseCol];
      openEventEditor({
        defaults: { start: minToDate(d, curStartMin), end: minToDate(d, Math.max(curEndMin, curStartMin + SNAP)) },
      });
    } else if (mode === 'move') {
      const newStart = minToDate(gridDays[curCol], curStartMin);
      if (newStart.getTime() !== occ.occStart.getTime()) {
        const ok = await applyMove(occ, newStart);
        if (!ok) bus.emit('refresh');
      } else {
        bus.emit('refresh');
      }
    } else {
      const newEnd = minToDate(gridDays[baseCol], curEndMin);
      if (newEnd.getTime() !== occ.occEnd.getTime()) {
        const ok = await applyResize(occ, newEnd);
        if (!ok) bus.emit('refresh');
      } else {
        bus.emit('refresh');
      }
    }
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

// 현재 시각 선 갱신 (1분마다 앱에서 호출)
export function updateNowLine() {
  if (!colsEl || !colsEl.isConnected) return;
  const n = new Date();
  const mins = n.getHours() * 60 + n.getMinutes();
  colsEl.querySelectorAll('.now-line').forEach(line => {
    line.style.top = `${(mins / 60) * HOUR_H}px`;
  });
}

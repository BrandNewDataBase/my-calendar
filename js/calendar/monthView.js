// 월 뷰 — 연속 무한 스크롤: 위로 스크롤/드래그하면 과거, 아래로 내리면 미래.
// 주 단위 행을 가상화 창(WEEK_COUNT주)으로 렌더하고, 가장자리에 가까워지면 창을 이동.
// 마우스 드래그 팬 + 관성, 스크롤 위치에 따라 헤더의 연·월이 실시간 동기화된다.
import { state } from '../store.js';
import { ui, bus } from '../bus.js';
import { occurrencesInRange } from '../recurrence.js';
import { eventColorKey } from '../palette.js';
import { t, fmtTime, weekdayName, fmtMonthShort } from '../i18n.js';
import { lunarShort } from '../lunar.js';
import { openEventEditor } from '../eventEditor.js';
import { openDayPanel } from './dayPanel.js';
import { applyMove } from './eventOps.js';
import { el, wdClass } from '../dom.js';
import {
  startOfMonth, startOfWeek, startOfDay, addDays, diffDays, sameDay,
  toDateStr, displayEndDay, daysInMonth,
} from '../dateutil.js';

const LANE_H = 24;   // 이벤트 바 한 줄 높이(px)
const TOP_H = 30;    // 날짜 숫자 영역 높이(px)
const PRE_WEEKS = 18;   // 초기 창에서 커서 월 이전에 두는 주 수
const WEEK_COUNT = 45;  // 창 전체 주 수 (~10개월)
const EDGE_ROWS = 5;    // 가장자리에서 이만큼 안으로 오면 창 이동
const SHIFT_WEEKS = 10; // 한 번에 이동하는 주 수

let dragOcc = null;      // 드래그 중인 발생
let dragGrabDate = null; // 멀티데이 바에서 실제로 잡은 칸의 날짜

// 스크롤 창 상태 (재렌더 간 유지)
let winStart = null;       // 창의 첫 주 시작일
let rowHCur = 0;
let savedScrollTop = null;
let lastMonthKey = null;   // 스크롤 위치가 가리키는 연*12+월
let savedWs = null;        // weekStart 설정 스냅샷
let scrollElRef = null;
let shifting = false;
let suppressClick = false;

const monthKeyOf = d => d.getFullYear() * 12 + d.getMonth();

// 오늘/검색 점프 등에서 저장된 스크롤을 버리고 커서 월 중심으로 다시 배치하고 싶을 때
export function recenterMonth() {
  savedScrollTop = null;
}

// 키보드 ↑/↓ 등에서 한 주씩 부드럽게 이동
export function scrollMonthByRows(n) {
  if (scrollElRef && scrollElRef.isConnected) {
    scrollElRef.scrollBy({ top: n * rowHCur, behavior: 'smooth' });
  }
}

export function renderMonthView(container) {
  container.textContent = '';
  const wsSetting = state.settings.weekStart || 0;

  const grid = el('div', 'month-grid');
  const head = el('div', 'month-head');
  for (let i = 0; i < 7; i++) {
    const wd = (wsSetting + i) % 7;
    head.append(el('div', 'month-head-cell ' + wdClass(wd), weekdayName(wd, 'short')));
  }
  const scrollEl = el('div', 'month-scroll');
  grid.append(head, scrollEl);
  container.append(grid);
  scrollElRef = scrollEl;

  const rowH = Math.max(92, Math.floor(scrollEl.clientHeight / 6));
  const cursorKey = monthKeyOf(ui.cursor);
  const monthFirstWeek = startOfWeek(startOfMonth(ui.cursor), wsSetting);

  // 렌더 모드 결정: preserve(위치 유지) / navigate(부드럽게 이동) / center(재배치)
  let mode = 'center';
  if (winStart && savedWs === wsSetting && rowHCur === rowH && savedScrollTop != null) {
    if (cursorKey === lastMonthKey) {
      mode = 'preserve';
    } else {
      const targetIdx = Math.round(diffDays(winStart, monthFirstWeek) / 7);
      if (targetIdx >= EDGE_ROWS && targetIdx <= WEEK_COUNT - EDGE_ROWS - 6) mode = 'navigate';
    }
  }
  if (mode === 'center') winStart = addDays(monthFirstWeek, -PRE_WEEKS * 7);
  rowHCur = rowH;
  savedWs = wsSetting;

  buildRows(scrollEl, rowH, wsSetting);

  if (mode === 'preserve') {
    scrollEl.scrollTop = savedScrollTop;
  } else if (mode === 'center') {
    scrollEl.scrollTop = PRE_WEEKS * rowH;
    lastMonthKey = cursorKey;
  } else {
    scrollEl.scrollTop = savedScrollTop;
    const targetIdx = Math.round(diffDays(winStart, monthFirstWeek) / 7);
    requestAnimationFrame(() =>
      scrollEl.scrollTo({ top: targetIdx * rowH, behavior: 'smooth' }));
  }
  savedScrollTop = scrollEl.scrollTop;

  scrollEl.addEventListener('scroll', () => {
    // 재렌더로 분리된 옛 컨테이너가 분리 시점에 쏘는 scroll(0) 이벤트 무시
    // (무시하지 않으면 창이 엉뚱하게 이동하고 커서 월이 어긋남)
    if (!scrollEl.isConnected) return;
    savedScrollTop = scrollEl.scrollTop;
    if (!shifting) maybeShift(scrollEl, rowH, wsSetting);
    syncMonthFromScroll(scrollEl, rowH);
  });
  attachPan(scrollEl);
}

function buildRows(scrollEl, rowH, wsSetting) {
  scrollEl.textContent = '';
  const rangeEnd = addDays(winStart, WEEK_COUNT * 7);
  const visibleCats = new Set(state.categories.filter(c => c.visible !== false).map(c => c.id));
  const occs = occurrencesInRange(state.events, winStart, rangeEnd, { visibleCats });
  const capacity = Math.max(1, Math.floor((rowH - TOP_H - 6) / LANE_H));
  const today = new Date();
  for (let i = 0; i < WEEK_COUNT; i++) {
    scrollEl.append(buildWeekRow(addDays(winStart, i * 7), rowH, occs, capacity, today));
  }
}

function buildWeekRow(ws, rowH, occs, capacity, today) {
  const rowEl = el('div', 'week-row');
  rowEl.style.height = rowH + 'px';
  const cells = el('div', 'week-cells');
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    const ds = toDateStr(d);
    const cell = el('div', 'day-cell');
    cell.dataset.date = ds;
    if (d.getMonth() % 2 === 1) cell.classList.add('alt-month'); // 달 구분용 미세한 톤 차이
    if (sameDay(d, today)) cell.classList.add('today');
    if (ui.selectedDate && sameDay(d, ui.selectedDate)) cell.classList.add('selected');
    const holName = state.holidays[ds];
    const isHol = holName !== undefined;
    if (isHol) cell.classList.add('holiday');

    const top = el('div', 'day-top');
    if (d.getDate() === 1) top.append(el('span', 'day-month-tag', fmtMonthShort(d)));
    const num = el('span', 'day-num ' + (isHol ? 'wd-hol' : wdClass(d.getDay())), String(d.getDate()));
    top.append(num, el('span', 'day-lunar', lunarShort(d)));
    if (isHol && holName) top.append(el('span', 'day-holname', holName));
    cell.append(top);

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
  renderWeekEvents(layer, ws, occs, capacity);
  return rowEl;
}

// 스크롤이 가장자리에 가까워지면 창을 SHIFT_WEEKS만큼 이동해 무한 스크롤 유지
function maybeShift(scrollEl, rowH, wsSetting) {
  const top = scrollEl.scrollTop;
  const rowsBelow = (scrollEl.scrollHeight - top - scrollEl.clientHeight) / rowH;
  let delta = 0;
  if (top / rowH < EDGE_ROWS) delta = -SHIFT_WEEKS;
  else if (rowsBelow < EDGE_ROWS) delta = SHIFT_WEEKS;
  if (!delta) return;
  shifting = true;
  winStart = addDays(winStart, delta * 7);
  buildRows(scrollEl, rowH, wsSetting);
  scrollEl.scrollTop = savedScrollTop - delta * rowH;
  savedScrollTop = scrollEl.scrollTop;
  shifting = false;
}

// 맨 위 보이는 주의 '마지막 날'이 속한 달을 현재 달로 삼는다
// (1일이 포함된 주가 맨 위에 오면 그 달로 표기 — 일반적인 캘린더 관례)
function syncMonthFromScroll(scrollEl, rowH) {
  const idx = Math.round(scrollEl.scrollTop / rowH);
  const monthDate = addDays(winStart, idx * 7 + 6);
  const key = monthKeyOf(monthDate);
  if (key === lastMonthKey) return;
  lastMonthKey = key;
  const y = monthDate.getFullYear(), m = monthDate.getMonth();
  ui.cursor = new Date(y, m, Math.min(ui.cursor.getDate(), daysInMonth(y, m)));
  bus.emit('month-scrolled'); // 제목/미니캘린더만 갱신 (전체 재렌더 아님)
}

// 마우스 드래그 팬 + 관성 (터치는 브라우저 네이티브 스크롤 사용)
function attachPan(scrollEl) {
  let panning = false, panMoved = false;
  let lastY = 0, downY = 0, vel = 0, lastT = 0, raf = null;
  const cancelInertia = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  };

  scrollEl.addEventListener('pointerdown', e => {
    suppressClick = false;
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (e.target.closest('.ev-bar, .more-chip')) return; // 이벤트 바는 HTML5 드래그(일정 이동)
    cancelInertia();
    panning = true;
    panMoved = false;
    lastY = downY = e.clientY;
    vel = 0;
    lastT = performance.now();
    try { scrollEl.setPointerCapture(e.pointerId); } catch {}
  });

  scrollEl.addEventListener('pointermove', e => {
    if (!panning) return;
    const dy = e.clientY - lastY;
    lastY = e.clientY;
    const now = performance.now();
    vel = 0.8 * vel + 0.2 * (dy / Math.max(1, now - lastT)) * 16;
    lastT = now;
    scrollEl.scrollTop -= dy; // 아래로 끌면 과거(위 내용)가 내려오고, 위로 밀면 미래
    if (!panMoved && Math.abs(e.clientY - downY) > 5) {
      panMoved = true;
      document.body.classList.add('month-panning');
    }
  });

  const endPan = () => {
    if (!panning) return;
    panning = false;
    document.body.classList.remove('month-panning');
    if (!panMoved) return;
    suppressClick = true; // 팬 직후의 click이 데이 패널을 열지 않도록
    let v = Math.max(-42, Math.min(42, vel));
    const step = () => {
      if (Math.abs(v) < 0.4 || panning) { raf = null; return; }
      scrollEl.scrollTop -= v;
      v *= 0.94;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
  scrollEl.addEventListener('pointerup', endPan);
  scrollEl.addEventListener('pointercancel', endPan);

  scrollEl.addEventListener('click', e => {
    if (suppressClick) {
      suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
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
    layer.append(makeBar(seg, ws));
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

function makeBar(seg, ws) {
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
    // 멀티데이 바의 어느 칸을 잡았는지 기록 → 드롭 시 '잡은 칸 → 드롭 칸' 델타로 이동
    const row = bar.closest('.week-row');
    if (row && ws) {
      const rect = row.getBoundingClientRect();
      const col = Math.max(0, Math.min(6, Math.floor((e.clientX - rect.left) / (rect.width / 7))));
      dragGrabDate = addDays(ws, col);
    } else {
      dragGrabDate = startOfDay(o.occStart);
    }
    e.dataTransfer.effectAllowed = 'move';
    bar.classList.add('dragging');
  });
  bar.addEventListener('dragend', () => {
    dragOcc = null;
    dragGrabDate = null;
    document.querySelectorAll('.drop-hover').forEach(x => x.classList.remove('drop-hover'));
    bar.classList.remove('dragging');
  });
  return bar;
}

function onDropToDay(d) {
  if (!dragOcc) return;
  const o = dragOcc;
  const grab = dragGrabDate || startOfDay(o.occStart);
  dragOcc = null;
  dragGrabDate = null;
  const deltaDays = diffDays(grab, startOfDay(d));
  if (deltaDays === 0) return; // 잡은 칸에 그대로 놓으면 무시
  applyMove(o, addDays(o.occStart, deltaDays));
}

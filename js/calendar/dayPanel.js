// 데이 패널 — 날짜 클릭 시 해당 날짜의 일정 목록, 음력, 휴일 지정 토글
import { state, setHoliday, removeHoliday } from '../store.js';
import { ui, bus } from '../bus.js';
import { occurrencesInRange } from '../recurrence.js';
import { eventColorKey } from '../palette.js';
import { t, fmtFullDate, fmtTime } from '../i18n.js';
import { lunarFull } from '../lunar.js';
import { openEventEditor } from '../eventEditor.js';
import { el } from '../dom.js';
import { addDays, startOfDay, toDateStr } from '../dateutil.js';

export function openDayPanel(date) {
  ui.selectedDate = startOfDay(date);
  document.body.classList.add('day-panel-open');
  bus.emit('refresh');
}

export function closeDayPanel() {
  ui.selectedDate = null;
  document.body.classList.remove('day-panel-open');
  bus.emit('refresh');
}

export function renderDayPanel() {
  const panel = document.getElementById('day-panel');
  if (!panel) return;
  panel.textContent = '';
  if (!ui.selectedDate) return;

  const d = ui.selectedDate;
  const ds = toDateStr(d);

  // 헤더
  const head = el('div', 'dp-head');
  const titles = el('div', 'dp-titles');
  titles.append(el('h3', 'dp-date', fmtFullDate(d)));
  const lun = lunarFull(d);
  if (lun) titles.append(el('div', 'dp-lunar', lun));
  const closeBtn = el('button', 'icon-btn dp-close', '×');
  closeBtn.type = 'button';
  closeBtn.title = t('btn.close');
  closeBtn.addEventListener('click', closeDayPanel);
  head.append(titles, closeBtn);
  panel.append(head);

  // 휴일 지정 (지정 시 주황색 표시)
  const holRow = el('div', 'dp-holiday');
  const chk = el('input');
  chk.type = 'checkbox';
  chk.checked = state.holidays[ds] !== undefined;
  const lab = el('label', 'check-row');
  lab.append(chk, el('span', null, t('panel.holiday')));
  const nameIn = el('input', 'dp-holname');
  nameIn.type = 'text';
  nameIn.placeholder = t('panel.holidayNamePh');
  nameIn.value = state.holidays[ds] || '';
  nameIn.style.display = chk.checked ? '' : 'none';
  chk.addEventListener('change', () => {
    if (chk.checked) setHoliday(ds, nameIn.value.trim());
    else removeHoliday(ds);
  });
  nameIn.addEventListener('change', () => {
    if (chk.checked) setHoliday(ds, nameIn.value.trim());
  });
  holRow.append(lab, nameIn);
  panel.append(holRow);

  // 일정 목록 (종일 먼저, 그 다음 시간순)
  const listWrap = el('div', 'dp-events');
  listWrap.append(el('h4', 'dp-sub', t('panel.events')));
  const visibleCats = new Set(state.categories.filter(c => c.visible !== false).map(c => c.id));
  const occs = occurrencesInRange(state.events, d, addDays(d, 1), { visibleCats })
    .sort((a, b) =>
      (b.ev.allDay ? 1 : 0) - (a.ev.allDay ? 1 : 0) || a.occStart - b.occStart);

  if (!occs.length) {
    listWrap.append(el('div', 'dp-empty', t('panel.noEvents')));
  }
  for (const o of occs) {
    const item = el('button', 'dp-event');
    item.type = 'button';
    const colorBar = el('span', 'dp-event-color');
    colorBar.style.background = `var(--cat-${eventColorKey(o.ev)})`;
    const timeLab = o.ev.allDay
      ? t('event.allDay')
      : `${fmtTime(o.occStart)} – ${fmtTime(o.occEnd)}`;
    const info = el('span', 'dp-event-info');
    info.append(
      el('span', 'dp-event-title', o.ev.title),
      el('span', 'dp-event-time', timeLab + (o.ev.location ? ' · ' + o.ev.location : '')),
    );
    item.append(colorBar, info);
    item.addEventListener('click', () => openEventEditor({ occ: o }));
    listWrap.append(item);
  }
  panel.append(listWrap);

  const addBtn = el('button', 'btn btn-primary dp-add', '+ ' + t('btn.newEvent'));
  addBtn.type = 'button';
  addBtn.addEventListener('click', () => openEventEditor({
    defaults: {
      start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0),
      end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 0),
    },
  }));
  panel.append(addBtn);
}

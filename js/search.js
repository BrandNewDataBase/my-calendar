// 이벤트 검색 — 제목/장소/메모 대상, 결과 클릭 시 해당 날짜로 점프
import { state } from './store.js';
import { ui, bus } from './bus.js';
import { nextOccurrence } from './recurrence.js';
import { t, fmtMediumDate, fmtTime } from './i18n.js';
import { el } from './dom.js';
import { openDayPanel } from './calendar/dayPanel.js';
import { startOfDay, evStart } from './dateutil.js';

export function initSearch() {
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  if (!input || !results) return;

  const hide = () => {
    results.classList.remove('open');
    results.textContent = '';
  };

  const run = () => {
    const q = input.value.trim().toLowerCase();
    results.textContent = '';
    if (!q) {
      hide();
      return;
    }
    const today = startOfDay(new Date());
    const matches = state.events
      .filter(ev =>
        (ev.title || '').toLowerCase().includes(q) ||
        (ev.location || '').toLowerCase().includes(q) ||
        (ev.notes || '').toLowerCase().includes(q))
      .slice(0, 30)
      .map(ev => ({ ev, occ: nextOccurrence(ev, today) }))
      .map(({ ev, occ }) => ({
        ev,
        when: occ ? occ.occStart : evStart(ev),
        occ,
      }))
      .sort((a, b) => a.when - b.when)
      .slice(0, 12);

    if (!matches.length) {
      results.append(el('div', 'search-empty', t('search.noResults')));
    }
    for (const m of matches) {
      const item = el('button', 'search-item');
      item.type = 'button';
      const timeLab = m.ev.allDay
        ? fmtMediumDate(m.when)
        : `${fmtMediumDate(m.when)} ${fmtTime(m.when)}`;
      item.append(
        el('span', 'search-item-title', m.ev.title),
        el('span', 'search-item-date', timeLab),
      );
      item.addEventListener('click', () => {
        input.value = '';
        hide();
        ui.cursor = new Date(m.when);
        openDayPanel(m.when);
      });
      results.append(item);
    }
    results.classList.add('open');
  };

  input.addEventListener('input', run);
  input.addEventListener('focus', run);
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      input.value = '';
      hide();
      input.blur();
    }
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-box')) hide();
  });
}

// D-Day 칩 — 헤더 구석의 작은 표시 (UI 비침해). 클릭 시 전체 목록 팝오버.
import { state } from './store.js';
import { ui, bus } from './bus.js';
import { nextOccurrence } from './recurrence.js';
import { t, fmtMediumDate } from './i18n.js';
import { el } from './dom.js';
import { openDayPanel } from './calendar/dayPanel.js';
import { startOfDay, diffDays } from './dateutil.js';

function ddayEntries() {
  const today = startOfDay(new Date());
  const out = [];
  for (const ev of state.events) {
    if (!ev.showDday) continue;
    const occ = nextOccurrence(ev, today);
    if (!occ) continue;
    const dd = diffDays(today, startOfDay(occ.occStart));
    if (dd < 0) continue;
    out.push({ ev, occ, dd });
  }
  out.sort((a, b) => a.dd - b.dd);
  return out;
}

const ddayLabel = dd => (dd === 0 ? 'D-Day' : `D-${dd}`);

export function renderDday(container) {
  container.textContent = '';
  const entries = ddayEntries();
  if (!entries.length) return;

  const first = entries[0];
  const chip = el('button', 'dday-chip');
  chip.type = 'button';
  chip.title = t('dday.title');
  chip.append(
    el('span', 'dday-count', ddayLabel(first.dd)),
    el('span', 'dday-name', first.ev.title),
  );
  chip.addEventListener('click', e => {
    e.stopPropagation();
    toggleDropdown(container, entries);
  });
  container.append(chip);
}

function toggleDropdown(container, entries) {
  const existing = container.querySelector('.dday-drop');
  if (existing) {
    existing.remove();
    return;
  }
  const drop = el('div', 'dday-drop');
  for (const en of entries) {
    const item = el('button', 'dday-item');
    item.type = 'button';
    item.append(
      el('span', 'dday-count', ddayLabel(en.dd)),
      el('span', 'dday-item-name', en.ev.title),
      el('span', 'dday-item-date', fmtMediumDate(en.occ.occStart)),
    );
    item.addEventListener('click', () => {
      drop.remove();
      ui.cursor = new Date(en.occ.occStart);
      openDayPanel(en.occ.occStart);
    });
    drop.append(item);
  }
  container.append(drop);
  const onDoc = e => {
    if (!drop.contains(e.target)) {
      drop.remove();
      document.removeEventListener('click', onDoc);
    }
  };
  setTimeout(() => document.addEventListener('click', onDoc), 0);
}

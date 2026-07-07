// 앱 부트스트랩 + 렌더 오케스트레이션
import { state, initStore, persist, uid, reloadKey, reloadFired } from './store.js';
import { showToast } from './toast.js';
import { ui, bus } from './bus.js';
import { t, getLang, setLang, LANGS, LANG_NAMES } from './i18n.js';
import { fmtMonthTitle, fmtMediumDate, fmtFullDate } from './i18n.js';
import { initTheme, toggleTheme, currentTheme } from './theme.js';
import { renderMonthView } from './calendar/monthView.js';
import { renderTimeGrid, updateNowLine } from './calendar/timeGrid.js';
import { renderDayPanel, closeDayPanel } from './calendar/dayPanel.js';
import { renderMiniCal } from './calendar/miniCal.js';
import { renderCategories, openCategoryEditor } from './categories.js';
import { openEventEditor } from './eventEditor.js';
import { initReminders, permissionState, requestPermission } from './reminders.js';
import { renderDday } from './dday.js';
import { initSearch } from './search.js';
import { renderMemoToolbar, renderMemoGrid } from './memos.js';
import { openSettings } from './settings.js';
import { el } from './dom.js';
import {
  startOfWeek, startOfDay, addDays, daysInMonth, toDateStr,
} from './dateutil.js';

const $ = sel => document.querySelector(sel);

function ensureDefaultCategories() {
  if (state.categories.length) return;
  state.categories = [
    { id: uid(), name: t('cat.personal'), color: 'orange', visible: true },
    { id: uid(), name: t('cat.work'), color: 'blue', visible: true },
    { id: uid(), name: t('cat.anniversary'), color: 'magenta', visible: true },
  ];
  persist('categories');
}

// ---- 정적 크롬(헤더/사이드바) 텍스트 ----
function renderChrome() {
  document.title = t('app.title');
  $('#app-logo-text').textContent = t('app.title');

  const tabCal = $('#tab-btn-calendar');
  const tabMemo = $('#tab-btn-memo');
  tabCal.textContent = t('tab.calendar');
  tabMemo.textContent = t('tab.memo');
  tabCal.classList.toggle('active', ui.tab === 'calendar');
  tabMemo.classList.toggle('active', ui.tab === 'memo');
  document.body.dataset.tab = ui.tab;

  $('#btn-today').textContent = t('nav.today');
  $('#btn-prev').title = t('nav.prev');
  $('#btn-next').title = t('nav.next');

  document.querySelectorAll('#view-switch button').forEach(b => {
    b.textContent = t('view.' + b.dataset.view);
    b.classList.toggle('active', ui.view === b.dataset.view);
  });

  $('#search-input').placeholder = t('search.placeholder');
  $('#lang-select').value = getLang();
  const themeBtn = $('#theme-toggle');
  themeBtn.textContent = currentTheme() === 'dark' ? '☀️' : '🌙';
  themeBtn.title = t('settings.theme');
  $('#settings-btn').title = t('settings.title');
  $('#btn-new-event').textContent = '+ ' + t('btn.newEvent');
  $('#cat-heading').textContent = t('cat.title');
  $('#cat-add-btn').textContent = '+ ' + t('cat.add');
}

function renderTitle() {
  const titleEl = $('#cal-title');
  if (ui.view === 'month') {
    titleEl.textContent = fmtMonthTitle(ui.cursor);
  } else if (ui.view === 'week') {
    const ws = startOfWeek(ui.cursor, state.settings.weekStart || 0);
    titleEl.textContent = `${fmtMediumDate(ws)} – ${fmtMediumDate(addDays(ws, 6))}`;
  } else {
    titleEl.textContent = fmtFullDate(ui.cursor);
  }
}

function renderView() {
  const c = $('#view-container');
  if (ui.view === 'month') {
    renderMonthView(c);
  } else if (ui.view === 'week') {
    const ws = startOfWeek(ui.cursor, state.settings.weekStart || 0);
    renderTimeGrid(c, Array.from({ length: 7 }, (_, i) => addDays(ws, i)));
  } else {
    renderTimeGrid(c, [startOfDay(ui.cursor)]);
  }
  renderTitle();
}

function renderNotifBanner() {
  const b = $('#notif-banner');
  b.textContent = '';
  if (permissionState() !== 'default' || state.settings.notifDismissed) {
    b.style.display = 'none';
    return;
  }
  b.style.display = '';
  b.append(el('div', 'banner-text', '🔔 ' + t('notifBanner.text')));
  const row = el('div', 'banner-actions');
  const on = el('button', 'btn btn-primary btn-xs', t('notif.enable'));
  on.type = 'button';
  on.addEventListener('click', async () => {
    await requestPermission();
    renderAll();
  });
  const later = el('button', 'btn btn-ghost btn-xs', t('notifBanner.later'));
  later.type = 'button';
  later.addEventListener('click', () => {
    state.settings.notifDismissed = true;
    persist('settings');
  });
  row.append(on, later);
  b.append(row);
}

function renderAll() {
  document.documentElement.lang = getLang();
  renderChrome();
  if (ui.tab === 'calendar') renderView();
  renderMiniCal($('#mini-cal'));
  renderCategories();
  renderNotifBanner();
  renderDday($('#dday-root'));
  renderDayPanel();
  renderMemoToolbar();
  renderMemoGrid();
}

function navigate(dir) {
  const c = ui.cursor;
  if (ui.view === 'month') {
    const targetY = c.getFullYear();
    const targetM = c.getMonth() + dir;
    const dim = daysInMonth(targetY, targetM);
    ui.cursor = new Date(targetY, targetM, Math.min(c.getDate(), dim));
  } else if (ui.view === 'week') {
    ui.cursor = addDays(c, 7 * dir);
  } else {
    ui.cursor = addDays(c, dir);
  }
  bus.emit('refresh');
}

function newEventDefaults() {
  const base = ui.selectedDate || ui.cursor;
  return {
    start: new Date(base.getFullYear(), base.getMonth(), base.getDate(), 9, 0),
    end: new Date(base.getFullYear(), base.getMonth(), base.getDate(), 10, 0),
  };
}

function bindStaticHandlers() {
  $('#tab-btn-calendar').addEventListener('click', () => {
    ui.tab = 'calendar';
    renderAll();
  });
  $('#tab-btn-memo').addEventListener('click', () => {
    ui.tab = 'memo';
    renderAll();
  });
  $('#btn-today').addEventListener('click', () => {
    ui.cursor = new Date();
    bus.emit('refresh');
  });
  $('#btn-prev').addEventListener('click', () => navigate(-1));
  $('#btn-next').addEventListener('click', () => navigate(1));
  document.querySelectorAll('#view-switch button').forEach(b => {
    b.addEventListener('click', () => {
      ui.view = b.dataset.view;
      bus.emit('refresh');
    });
  });
  $('#btn-new-event').addEventListener('click', () =>
    openEventEditor({ defaults: newEventDefaults() }));
  $('#cat-add-btn').addEventListener('click', () => openCategoryEditor(null));
  $('#theme-toggle').addEventListener('click', () => {
    toggleTheme();
    renderChrome();
  });
  $('#settings-btn').addEventListener('click', openSettings);

  const langSel = $('#lang-select');
  LANGS.forEach(l => {
    const o = document.createElement('option');
    o.value = l;
    o.textContent = LANG_NAMES[l];
    langSel.append(o);
  });
  langSel.value = getLang();
  langSel.addEventListener('change', () => {
    setLang(langSel.value);
    renderAll();
  });

  // 키보드 단축키
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea, select') || e.isComposing) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector('.modal-backdrop')) return;
    const k = e.key;
    if (k === 'c' || k === 'C') {
      e.preventDefault();
      openEventEditor({ defaults: newEventDefaults() });
    } else if (k === 't' || k === 'T') {
      ui.cursor = new Date();
      bus.emit('refresh');
    } else if ((k === 'm' || k === 'M') && ui.tab === 'calendar') {
      ui.view = 'month';
      bus.emit('refresh');
    } else if ((k === 'w' || k === 'W') && ui.tab === 'calendar') {
      ui.view = 'week';
      bus.emit('refresh');
    } else if ((k === 'd' || k === 'D') && ui.tab === 'calendar') {
      ui.view = 'day';
      bus.emit('refresh');
    } else if (k === 'ArrowLeft' && ui.tab === 'calendar') {
      navigate(-1);
    } else if (k === 'ArrowRight' && ui.tab === 'calendar') {
      navigate(1);
    } else if (k === '/') {
      // 현재 탭에서 실제로 보이는 검색창에 포커스 (메모 탭에서는 메모 검색)
      const target = ui.tab === 'memo'
        ? document.querySelector('.memo-search')
        : $('#search-input');
      if (target && target.offsetParent !== null) {
        e.preventDefault();
        target.focus();
      }
    } else if (k === 'Escape' && ui.selectedDate) {
      closeDayPanel();
    }
  });

  // 리사이즈 → 레인 용량 재계산
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (ui.tab === 'calendar') renderView();
    }, 150);
  });
}

// ---- 부트스트랩 ----
initStore();
document.documentElement.lang = getLang();
initTheme();
ensureDefaultCategories();
bindStaticHandlers();
initSearch();

bus.on('refresh', renderAll);
bus.on('data-changed', renderAll);
bus.on('theme-changed', () => {
  const btn = $('#theme-toggle');
  if (btn) btn.textContent = currentTheme() === 'dark' ? '☀️' : '🌙';
});

// 저장 실패(용량 초과 등)를 사용자에게 알림 — 연속 실패는 5초에 한 번만
let lastStorageErrorAt = 0;
bus.on('storage-error', () => {
  const now = Date.now();
  if (now - lastStorageErrorAt < 5000) return;
  lastStorageErrorAt = now;
  showToast('⚠️ ' + t('toast.storageError'), { duration: 8000 });
});

// 다른 탭에서 변경한 데이터를 이 탭에 반영 (마지막 저장이 상대 변경을 덮어쓰는 유실 방지)
window.addEventListener('storage', e => {
  if (!e.key || !e.key.startsWith('mycal:')) return;
  const key = e.key.slice('mycal:'.length);
  if (key === 'fired') {
    reloadFired();
    return;
  }
  reloadKey(key);
  renderAll();
});

renderAll();
initReminders();

// 1분마다: 현재 시각 선 갱신 + 날짜가 바뀌면 전체 갱신
let lastDate = toDateStr(new Date());
setInterval(() => {
  updateNowLine();
  const nowDate = toDateStr(new Date());
  if (nowDate !== lastDate) {
    lastDate = nowDate;
    renderAll();
  }
}, 60000);

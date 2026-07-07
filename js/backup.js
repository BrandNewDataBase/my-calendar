// 전체 데이터 JSON 백업/복원 — 가져오기 시 항목 단위로 정규화해
// 손상된 백업이 렌더링을 망가뜨리거나 이벤트를 보이지 않게 만드는 것을 방지
import { state, persist, SCHEMA_VERSION } from './store.js';
import { t, LANGS } from './i18n.js';
import { showToast } from './toast.js';
import { choiceDialog } from './modal.js';
import { applyTheme } from './theme.js';
import { toDateStr, parseLocal } from './dateutil.js';
import { CATEGORY_COLORS, MEMO_COLORS } from './palette.js';
import { bus } from './bus.js';

export function exportData() {
  const payload = {
    app: 'my-calendar',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      events: state.events,
      categories: state.categories,
      memos: state.memos,
      holidays: state.holidays,
      settings: state.settings,
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `my-calendar-backup-${toDateStr(new Date())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

const isValidDateStr = v => typeof v === 'string' && !isNaN(parseLocal(v));

function sanitizeCategories(arr) {
  const out = [];
  for (const raw of (Array.isArray(arr) ? arr : [])) {
    if (!raw || typeof raw !== 'object' || !raw.id || typeof raw.name !== 'string') continue;
    out.push({
      id: String(raw.id),
      name: raw.name,
      color: CATEGORY_COLORS.includes(raw.color) ? raw.color : 'orange',
      visible: raw.visible !== false,
    });
  }
  return out;
}

function sanitizeEvents(arr, catIds, fallbackCat) {
  const out = [];
  for (const raw of (Array.isArray(arr) ? arr : [])) {
    if (!raw || typeof raw !== 'object' || !raw.id) continue;
    if (!isValidDateStr(raw.start)) continue;
    out.push({
      id: String(raw.id),
      title: typeof raw.title === 'string' ? raw.title : '',
      allDay: !!raw.allDay,
      start: raw.start,
      end: isValidDateStr(raw.end) ? raw.end : raw.start,
      categoryId: catIds.has(raw.categoryId) ? raw.categoryId : fallbackCat,
      color: CATEGORY_COLORS.includes(raw.color) ? raw.color : null,
      location: typeof raw.location === 'string' ? raw.location : '',
      notes: typeof raw.notes === 'string' ? raw.notes : '',
      recurrence: raw.recurrence && typeof raw.recurrence === 'object' ? raw.recurrence : null,
      exdates: Array.isArray(raw.exdates) ? raw.exdates.filter(x => typeof x === 'string') : [],
      reminders: Array.isArray(raw.reminders) ? raw.reminders.filter(n => typeof n === 'number') : [],
      showDday: !!raw.showDday,
      createdAt: Number.isFinite(+raw.createdAt) ? +raw.createdAt : Date.now(),
      updatedAt: Number.isFinite(+raw.updatedAt) ? +raw.updatedAt : Date.now(),
    });
  }
  return out;
}

function sanitizeMemos(arr) {
  const out = [];
  for (const raw of (Array.isArray(arr) ? arr : [])) {
    if (!raw || typeof raw !== 'object' || !raw.id) continue;
    out.push({
      id: String(raw.id),
      title: typeof raw.title === 'string' ? raw.title : '',
      body: typeof raw.body === 'string' ? raw.body : '',
      color: MEMO_COLORS.includes(raw.color) ? raw.color : 'butter',
      pinned: !!raw.pinned,
      updatedAt: Number.isFinite(+raw.updatedAt) ? +raw.updatedAt : Date.now(),
    });
  }
  return out;
}

function sanitizeHolidays(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(k)) out[k] = typeof v === 'string' ? v : '';
  }
  return out;
}

function sanitizeSettings(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const out = {};
  if (LANGS.includes(obj.lang)) out.lang = obj.lang;
  if (obj.theme === 'light' || obj.theme === 'dark' || obj.theme === null) out.theme = obj.theme;
  if (obj.weekStart === 0 || obj.weekStart === 1) out.weekStart = obj.weekStart;
  if (typeof obj.notifDismissed === 'boolean') out.notifDismissed = obj.notifDismissed;
  return out;
}

function mergeById(target, incoming) {
  const idx = new Map(target.map((x, i) => [x.id, i]));
  for (const item of incoming) {
    if (idx.has(item.id)) target[idx.get(item.id)] = item;
    else target.push(item);
  }
}

export async function importData(file) {
  let obj;
  try {
    obj = JSON.parse(await file.text());
  } catch {
    showToast(t('backup.invalid'));
    return false;
  }
  const d = obj?.data;
  if (obj?.app !== 'my-calendar' || !d || !Array.isArray(d.events) || !Array.isArray(d.memos)) {
    showToast(t('backup.invalid'));
    return false;
  }
  const mode = await choiceDialog({
    title: t('backup.importTitle'),
    message: t('backup.importQuestion'),
    choices: [
      { label: t('backup.merge'), value: 'merge', kind: 'primary' },
      { label: t('backup.overwrite'), value: 'overwrite', kind: 'danger' },
    ],
  });
  if (!mode) return false;

  // 카테고리를 먼저 확정해 이벤트의 categoryId 유효성을 검증한다
  if (mode === 'overwrite') {
    const cats = sanitizeCategories(d.categories);
    if (cats.length) state.categories = cats;
    const catIds = new Set(state.categories.map(c => c.id));
    const fallback = state.categories[0]?.id ?? null;
    state.events = sanitizeEvents(d.events, catIds, fallback);
    state.memos = sanitizeMemos(d.memos);
    state.holidays = sanitizeHolidays(d.holidays);
    state.settings = Object.assign({}, state.settings, sanitizeSettings(d.settings));
  } else {
    mergeById(state.categories, sanitizeCategories(d.categories));
    const catIds = new Set(state.categories.map(c => c.id));
    const fallback = state.categories[0]?.id ?? null;
    mergeById(state.events, sanitizeEvents(d.events, catIds, fallback));
    mergeById(state.memos, sanitizeMemos(d.memos));
    Object.assign(state.holidays, sanitizeHolidays(d.holidays));
  }

  persist('settings');
  persist('categories');
  persist('holidays');
  persist('memos');
  persist('events');
  applyTheme();
  document.documentElement.lang = state.settings.lang || document.documentElement.lang;
  bus.emit('refresh');
  showToast(t('backup.done'));
  return true;
}

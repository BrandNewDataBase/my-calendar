// 전체 데이터 JSON 백업/복원
import { state, persist, SCHEMA_VERSION } from './store.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';
import { choiceDialog } from './modal.js';
import { applyTheme } from './theme.js';
import { toDateStr } from './dateutil.js';
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

function mergeById(target, incoming) {
  const idx = new Map(target.map((x, i) => [x.id, i]));
  for (const item of incoming) {
    if (!item || !item.id) continue;
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

  if (mode === 'overwrite') {
    state.events = d.events;
    state.memos = d.memos;
    if (Array.isArray(d.categories) && d.categories.length) state.categories = d.categories;
    state.holidays = d.holidays && typeof d.holidays === 'object' ? d.holidays : {};
    if (d.settings && typeof d.settings === 'object') {
      state.settings = Object.assign({}, state.settings, d.settings);
    }
  } else {
    mergeById(state.events, d.events);
    mergeById(state.memos, d.memos);
    if (Array.isArray(d.categories)) mergeById(state.categories, d.categories);
    Object.assign(state.holidays, d.holidays || {});
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

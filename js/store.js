// localStorage 영속화 계층. 키는 'mycal:' 네임스페이스 사용.
import { bus } from './bus.js';

const NS = 'mycal:';
export const SCHEMA_VERSION = 1;

function read(key, fallback) {
  try {
    const v = localStorage.getItem(NS + key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
    return true;
  } catch (e) {
    // 저장 공간 초과 등 — 조용히 삼키면 '저장됨' 토스트가 거짓말이 되므로 알림
    console.warn('localStorage 저장 실패:', e);
    bus.emit('storage-error', e);
    return false;
  }
}

export const state = {
  events: [],       // {id,title,allDay,start,end,categoryId,color,location,notes,recurrence,exdates,reminders,showDday,createdAt,updatedAt}
  categories: [],   // {id,name,color,visible}
  memos: [],        // {id,title,body,color,pinned,updatedAt}
  holidays: {},     // {'YYYY-MM-DD': '휴일 이름'}
  settings: {},     // {lang,theme,weekStart,notifDismissed,schemaVersion}
  fired: {},        // {'occId:offset': timestamp} — 알림 중복 방지
};

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function persist(key) {
  write(key, state[key]);
  if (key !== 'fired') bus.emit('data-changed', key);
}

export function initStore() {
  state.settings = Object.assign(
    { lang: null, theme: null, weekStart: 0, notifDismissed: false, schemaVersion: SCHEMA_VERSION },
    read('settings', {})
  );
  state.events = read('events', []);
  state.categories = read('categories', []);
  state.memos = read('memos', []);
  state.holidays = read('holidays', {});
  state.fired = read('fired', {});
}

// ---- 이벤트 ----
export function addEvent(data) {
  const now = Date.now();
  const ev = Object.assign(
    { allDay: false, categoryId: state.categories[0]?.id ?? null, color: null,
      location: '', notes: '', recurrence: null, exdates: [],
      reminders: [DAY_MS, MIN15_MS], showDday: false },
    data, { id: uid(), createdAt: now, updatedAt: now }
  );
  state.events.push(ev);
  persist('events');
  return ev;
}

export function updateEvent(id, patch) {
  const ev = state.events.find(e => e.id === id);
  if (!ev) return null;
  Object.assign(ev, patch, { updatedAt: Date.now() });
  persist('events');
  return ev;
}

export function deleteEvent(id) {
  state.events = state.events.filter(e => e.id !== id);
  persist('events');
}

export const getEvent = id => state.events.find(e => e.id === id) || null;

export const DAY_MS = 86400000;   // 하루 전 알림 오프셋
export const MIN15_MS = 900000;   // 15분 전 알림 오프셋

// ---- 카테고리 ----
export function addCategory(name, color) {
  const cat = { id: uid(), name, color, visible: true };
  state.categories.push(cat);
  persist('categories');
  return cat;
}

export function updateCategory(id, patch) {
  const cat = state.categories.find(c => c.id === id);
  if (!cat) return;
  Object.assign(cat, patch);
  persist('categories');
}

// 카테고리 삭제 시 소속 이벤트는 첫 번째 남은 카테고리로 이동
export function deleteCategory(id) {
  if (state.categories.length <= 1) return false;
  state.categories = state.categories.filter(c => c.id !== id);
  const fallback = state.categories[0].id;
  let touched = false;
  state.events.forEach(ev => {
    if (ev.categoryId === id) { ev.categoryId = fallback; touched = true; }
  });
  persist('categories');
  if (touched) persist('events');
  return true;
}

export const getCategory = id => state.categories.find(c => c.id === id) || null;

// ---- 메모 ----
export function addMemo(data) {
  const memo = Object.assign(
    { title: '', body: '', color: 'butter', pinned: false },
    data, { id: uid(), updatedAt: Date.now() }
  );
  state.memos.push(memo);
  persist('memos');
  return memo;
}

export function updateMemo(id, patch) {
  const m = state.memos.find(x => x.id === id);
  if (!m) return;
  Object.assign(m, patch, { updatedAt: Date.now() });
  persist('memos');
}

export function deleteMemo(id) {
  state.memos = state.memos.filter(m => m.id !== id);
  persist('memos');
}

// ---- 사용자 지정 휴일 ----
export function setHoliday(dateStr, name) {
  state.holidays[dateStr] = name || '';
  persist('holidays');
}

export function removeHoliday(dateStr) {
  delete state.holidays[dateStr];
  persist('holidays');
}

export const isHoliday = dateStr => Object.prototype.hasOwnProperty.call(state.holidays, dateStr);

// 다른 탭이 이미 알림을 발동했을 수 있으므로 검사 직전에 최신값을 다시 읽음
export function reloadFired() {
  state.fired = read('fired', {});
}

// storage 이벤트로 다른 탭의 변경을 이 탭 상태에 반영 (마지막 저장이 상대 탭 변경을 덮어쓰는 유실 방지)
export function reloadKey(key) {
  if (key === 'settings') {
    state.settings = Object.assign(
      { lang: null, theme: null, weekStart: 0, notifDismissed: false, schemaVersion: SCHEMA_VERSION },
      read('settings', {})
    );
  } else if (key === 'holidays' || key === 'fired') {
    state[key] = read(key, {});
  } else if (key === 'events' || key === 'categories' || key === 'memos') {
    state[key] = read(key, []);
  }
}

// ---- 실행취소 스냅샷 ----
export function snapshot() {
  return JSON.parse(JSON.stringify({
    events: state.events, memos: state.memos, holidays: state.holidays,
    categories: state.categories,
  }));
}

export function restore(snap) {
  state.events = JSON.parse(JSON.stringify(snap.events));
  state.memos = JSON.parse(JSON.stringify(snap.memos));
  state.holidays = JSON.parse(JSON.stringify(snap.holidays));
  if (snap.categories) state.categories = JSON.parse(JSON.stringify(snap.categories));
  persist('categories');
  persist('events');
  persist('memos');
  persist('holidays');
}

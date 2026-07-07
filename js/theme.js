// 라이트/다크 테마 — 미설정 시 시스템(prefers-color-scheme) 따름
import { state, persist } from './store.js';
import { bus } from './bus.js';

const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function currentTheme() {
  return state.settings.theme || (mq && mq.matches ? 'dark' : 'light');
}

export function applyTheme() {
  const theme = currentTheme();
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#1C1917' : '#FAF7F2';
  bus.emit('theme-changed', theme);
}

export function setTheme(v) {
  state.settings.theme = v; // 'light' | 'dark' | null(시스템)
  persist('settings');
  applyTheme();
}

export function toggleTheme() {
  setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}

export function initTheme() {
  applyTheme();
  mq?.addEventListener('change', () => {
    if (!state.settings.theme) applyTheme();
  });
}

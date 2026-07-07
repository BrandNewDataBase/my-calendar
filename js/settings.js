// 설정 모달 — 언어/테마/주 시작/알림/백업/데이터 정보
import { state, persist } from './store.js';
import { openModal } from './modal.js';
import { t, LANGS, LANG_NAMES, getLang, setLang, weekdayName } from './i18n.js';
import { setTheme } from './theme.js';
import { permissionState, requestPermission } from './reminders.js';
import { exportData, importData } from './backup.js';
import { el } from './dom.js';
import { bus } from './bus.js';

function section(titleText, ...children) {
  const s = el('div', 'settings-section');
  s.append(el('h4', 'settings-sub', titleText), ...children);
  return s;
}

export function openSettings() {
  openModal((box, close) => {
    box.classList.add('modal-settings');
    box.append(el('h3', 'modal-title', t('settings.title')));

    // 언어
    const langSel = el('select');
    LANGS.forEach(l => {
      const o = el('option', null, LANG_NAMES[l]);
      o.value = l;
      langSel.append(o);
    });
    langSel.value = getLang();
    langSel.addEventListener('change', () => {
      setLang(langSel.value);
      bus.emit('refresh');
      close();
      openSettings(); // 설정 모달 자체도 새 언어로 다시 열기
    });

    // 테마
    const themeSel = el('select');
    [['light', t('theme.light')], ['dark', t('theme.dark')], ['system', t('theme.system')]]
      .forEach(([v, label]) => {
        const o = el('option', null, label);
        o.value = v;
        themeSel.append(o);
      });
    themeSel.value = state.settings.theme || 'system';
    themeSel.addEventListener('change', () =>
      setTheme(themeSel.value === 'system' ? null : themeSel.value));

    // 주 시작 요일
    const wsSel = el('select');
    [0, 1].forEach(v => {
      const o = el('option', null, weekdayName(v, 'long'));
      o.value = v;
      wsSel.append(o);
    });
    wsSel.value = state.settings.weekStart || 0;
    wsSel.addEventListener('change', () => {
      state.settings.weekStart = +wsSel.value;
      persist('settings');
    });

    // 알림
    const notifWrap = el('div', 'settings-notif');
    const st = permissionState();
    const statusRow = el('div', 'settings-line',
      `${t('settings.notifications')}: ${t('notif.status.' + st)}`);
    notifWrap.append(statusRow);
    if (st === 'default') {
      const enableBtn = el('button', 'btn btn-primary', t('notif.enable'));
      enableBtn.type = 'button';
      enableBtn.addEventListener('click', async () => {
        await requestPermission();
        bus.emit('refresh');
        close();
        openSettings();
      });
      notifWrap.append(enableBtn);
    }
    if (st === 'denied') notifWrap.append(el('p', 'settings-hint', t('notif.deniedHint')));
    notifWrap.append(el('p', 'settings-hint', t('notif.limitNote')));

    // 백업
    const backupWrap = el('div', 'settings-backup');
    const expBtn = el('button', 'btn', '⬇ ' + t('backup.export'));
    expBtn.type = 'button';
    expBtn.addEventListener('click', exportData);
    const impBtn = el('button', 'btn', '⬆ ' + t('backup.import'));
    impBtn.type = 'button';
    const fileIn = el('input');
    fileIn.type = 'file';
    fileIn.accept = '.json,application/json';
    fileIn.style.display = 'none';
    impBtn.addEventListener('click', () => fileIn.click());
    fileIn.addEventListener('change', async () => {
      const file = fileIn.files[0];
      if (!file) return;
      close();
      await importData(file);
    });
    backupWrap.append(expBtn, impBtn, fileIn);

    // 데이터 정보 + 정보
    const count = el('div', 'settings-line',
      t('settings.dataCount', { e: state.events.length, m: state.memos.length }));
    const about = el('div', 'settings-about');
    const link = el('a', null, 'GitHub');
    link.href = 'https://github.com/BrandNewDataBase/my-calendar';
    link.target = '_blank';
    link.rel = 'noopener';
    about.append(el('span', null, 'My Calendar v1.0 · '), link);

    const footer = el('div', 'modal-actions');
    footer.append(el('span', 'spacer'));
    const closeBtn = el('button', 'btn btn-primary', t('btn.close'));
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', close);
    footer.append(closeBtn);

    box.append(
      section(t('settings.language'), langSel),
      section(t('settings.theme'), themeSel),
      section(t('settings.weekStart'), wsSel),
      section(t('settings.notifications'), notifWrap),
      section(t('settings.backup'), backupWrap),
      section(t('settings.data'), count, about),
      footer,
    );
  }, { className: 'modal-lg' });
}

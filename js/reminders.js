// 알림 엔진 — 하루 전 / 15분 전.
// 정적 사이트의 한계: 알림은 이 사이트가 탭에 열려 있는 동안만 동작한다.
// 페이지 로드 + visibilitychange + 30초 인터벌에서 절대 타임스탬프를 비교하고,
// 유예 창(GRACE) 안이면 놓친 알림도 회수한다. fired 플래그로 중복 방지.
import { state, persist, reloadFired, DAY_MS, MIN15_MS } from './store.js';
import { occurrencesInRange } from './recurrence.js';
import { t, fmtTime } from './i18n.js';
import { showToast } from './toast.js';
import { bus } from './bus.js';

const GRACE = 15 * 60000;
let swReg = null;

export const notifSupported = () => 'Notification' in window;

export function permissionState() {
  return notifSupported() ? Notification.permission : 'unsupported';
}

// 반드시 사용자 제스처(클릭) 안에서 호출할 것 — Firefox/Safari 요구사항
export async function requestPermission() {
  if (!notifSupported()) return 'unsupported';
  let result;
  try {
    result = await Notification.requestPermission();
  } catch {
    // 콜백 형태만 지원하는 옛 Safari
    result = await new Promise(res => Notification.requestPermission(res));
  }
  bus.emit('notif-permission-changed', result);
  return result;
}

export async function initReminders() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    try {
      swReg = await navigator.serviceWorker.register('./sw.js');
    } catch (e) {
      console.warn('서비스워커 등록 실패:', e);
    }
  }
  checkDue();
  setInterval(checkDue, 30000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkDue();
  });
}

export function checkDue() {
  const now = Date.now();
  reloadFired();
  // 알림 시점(occStart - offset)이 [now-GRACE, now]에 들어오는 발생을 찾는다.
  // 최대 오프셋이 1일이므로 occStart는 [now-GRACE, now+1일+GRACE] 범위만 보면 된다.
  const scanStart = new Date(now - GRACE - 60000);
  const scanEnd = new Date(now + DAY_MS + GRACE + 60000);
  const occs = occurrencesInRange(state.events, scanStart, scanEnd);

  const newlyFired = {};
  for (const o of occs) {
    for (const off of (o.ev.reminders || [])) {
      let dueAt;
      if (o.ev.allDay) {
        if (off === MIN15_MS) continue; // 종일 이벤트에 '15분 전'(=전날 23:45)은 무의미
        // '하루 전' 알림은 자정이 아니라 전날 09:00에 발동
        dueAt = o.occStart.getTime() - DAY_MS + 9 * 3600000;
      } else {
        dueAt = o.occStart.getTime() - off;
      }
      if (now < dueAt || now >= dueAt + GRACE) continue;
      if (!o.ev.allDay && o.occStart.getTime() < now - 60000) continue; // 이미 시작한 일정 제외
      // 키에 발생 시각 포함: 알림 발동 후 일정을 옮기면 새 시각에 다시 알림
      const key = `${o.occId}@${o.occStart.getTime()}:${off}`;
      if (state.fired[key]) continue;
      state.fired[key] = now;
      newlyFired[key] = now;
      fireNotification(o, off);
    }
  }
  // 3일 지난 fired 기록 정리
  let pruned = false;
  for (const k of Object.keys(state.fired)) {
    if (now - state.fired[k] > 3 * DAY_MS) {
      delete state.fired[k];
      pruned = true;
    }
  }
  if (Object.keys(newlyFired).length || pruned) {
    // 다른 탭이 그 사이 기록한 발동 내역과 병합해 덮어쓰기 유실 최소화
    reloadFired();
    Object.assign(state.fired, newlyFired);
    persist('fired');
  }
}

function fireNotification(o, off) {
  const timeStr = o.ev.allDay ? t('event.allDay') : fmtTime(o.occStart);
  const body = off >= DAY_MS
    ? t('notif.tomorrow', { time: timeStr, title: o.ev.title })
    : t('notif.in15', { title: o.ev.title });
  const tag = `${o.occId}@${o.occStart.getTime()}:${off}`;

  if (permissionState() === 'granted') {
    if (swReg && swReg.showNotification) {
      swReg.showNotification(t('app.title'), { body, tag, icon: './icon.svg', badge: './icon.svg' });
      return;
    }
    try {
      new Notification(t('app.title'), { body, tag });
      return;
    } catch {
      // Chrome for Android 등 생성자 미지원 → 토스트 폴백
    }
  }
  showToast('🔔 ' + body, { duration: 12000 });
}

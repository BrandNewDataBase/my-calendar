// 발생(occurrence) 단위 조작: 이동/리사이즈/삭제 — 반복 일정이면 적용 범위를 물어봄
import { updateEvent, deleteEvent, addEvent } from '../store.js';
import { choiceDialog } from '../modal.js';
import { t } from '../i18n.js';
import { withUndo } from '../undo.js';
import {
  toDateStr, toDateTimeStr, addDays, diffDays, startOfDay, evStart, parseLocal, DAY,
} from '../dateutil.js';

// 시리즈 전체를 deltaDays만큼 이동할 때 예외일도 함께 이동
// (안 하면 '이 일정만' 삭제/분리했던 발생이 이동 후 되살아남)
export function shiftExdates(exdates, deltaDays) {
  if (!deltaDays) return [...(exdates || [])];
  return (exdates || []).map(ds => toDateStr(addDays(parseLocal(ds), deltaDays)));
}

// newStart와 durMs(exclusive)로 저장용 start/end 문자열 생성
export function formatRange(allDay, newStart, durMs) {
  if (allDay) {
    const days = Math.max(1, Math.round(durMs / DAY));
    return { start: toDateStr(newStart), end: toDateStr(addDays(newStart, days - 1)) };
  }
  const end = new Date(newStart.getTime() + Math.max(15 * 60000, durMs));
  return { start: toDateTimeStr(newStart), end: toDateTimeStr(end) };
}

async function askScope(titleKey) {
  return choiceDialog({
    title: t(titleKey),
    message: t('scope.question'),
    choices: [
      { label: t('scope.thisOnly'), value: 'this', kind: 'primary' },
      { label: t('scope.all'), value: 'all' },
    ],
  });
}

// 반복 일정에서 이 발생만 분리: 원본에 exdate 추가 + 단독 이벤트 생성
function detachOccurrence(o, range) {
  const ev = o.ev;
  updateEvent(ev.id, { exdates: [...(ev.exdates || []), toDateStr(o.occStart)] });
  addEvent({
    title: ev.title, allDay: ev.allDay, categoryId: ev.categoryId, color: ev.color,
    location: ev.location, notes: ev.notes, reminders: [...(ev.reminders || [])],
    showDday: false, recurrence: null, exdates: [],
    ...range,
  });
}

// 발생을 newStart로 이동 (지속시간 유지). 적용 여부 반환.
export async function applyMove(o, newStart, durMs = o.occEnd - o.occStart) {
  const ev = o.ev;
  if (!ev.recurrence) {
    withUndo(t('toast.moved'), () =>
      updateEvent(ev.id, formatRange(ev.allDay, newStart, durMs)));
    return true;
  }
  const scope = await askScope('scope.editTitle');
  if (!scope) return false;
  if (scope === 'this') {
    withUndo(t('toast.moved'), () =>
      detachOccurrence(o, formatRange(ev.allDay, newStart, durMs)));
    return true;
  }
  // 전체 시리즈 이동: 날짜 차이 + 새 시각을 시리즈 시작에 적용
  const s = evStart(ev);
  const deltaDays = diffDays(startOfDay(o.occStart), startOfDay(newStart));
  const shifted = addDays(s, deltaDays);
  const ns = ev.allDay
    ? startOfDay(shifted)
    : new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate(),
        newStart.getHours(), newStart.getMinutes());
  let recurrence = ev.recurrence;
  // 매주+단일 요일 반복이면 시리즈 이동 시 반복 요일도 함께 이동
  if (recurrence.freq === 'weekly') {
    const bw = recurrence.byWeekday?.length ? recurrence.byWeekday : [s.getDay()];
    if (bw.length === 1 && bw[0] !== ns.getDay()) {
      recurrence = { ...recurrence, byWeekday: [ns.getDay()] };
    }
  }
  withUndo(t('toast.moved'), () =>
    updateEvent(ev.id, {
      ...formatRange(ev.allDay, ns, durMs),
      recurrence,
      exdates: shiftExdates(ev.exdates, deltaDays),
    }));
  return true;
}

// 발생의 끝 시각 변경 (리사이즈)
export async function applyResize(o, newEnd) {
  const ev = o.ev;
  const durMs = Math.max(15 * 60000, newEnd - o.occStart);
  if (!ev.recurrence) {
    withUndo(t('toast.saved'), () =>
      updateEvent(ev.id, formatRange(ev.allDay, o.occStart, durMs)));
    return true;
  }
  const scope = await askScope('scope.editTitle');
  if (!scope) return false;
  withUndo(t('toast.saved'), () => {
    if (scope === 'this') detachOccurrence(o, formatRange(ev.allDay, o.occStart, durMs));
    else updateEvent(ev.id, formatRange(ev.allDay, evStart(ev), durMs));
  });
  return true;
}

// 발생 삭제 (반복이면 범위 선택, 아니면 확인)
export async function deleteOccurrence(o) {
  const ev = o.ev;
  if (!ev.recurrence) {
    const ok = await choiceDialog({
      title: t('confirm.deleteEvent'),
      choices: [
        { label: t('btn.cancel'), value: null },
        { label: t('btn.delete'), value: 'yes', kind: 'danger' },
      ],
    });
    if (ok !== 'yes') return false;
    withUndo(t('toast.deleted'), () => deleteEvent(ev.id));
    return true;
  }
  const scope = await askScope('scope.deleteTitle');
  if (!scope) return false;
  withUndo(t('toast.deleted'), () => {
    if (scope === 'this') {
      updateEvent(ev.id, { exdates: [...(ev.exdates || []), toDateStr(o.occStart)] });
    } else {
      deleteEvent(ev.id);
    }
  });
  return true;
}

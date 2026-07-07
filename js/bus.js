// 전역 UI 상태 + 아주 작은 이벤트 버스 (모듈 간 순환 참조 방지용)
export const ui = {
  tab: 'calendar',        // 'calendar' | 'memo'
  view: 'month',          // 'month' | 'week' | 'day'
  cursor: new Date(),     // 현재 보고 있는 기준 날짜
  selectedDate: null,     // 데이 패널이 열려 있는 날짜 (Date | null)
};

const listeners = {};

export const bus = {
  on(evt, cb) {
    (listeners[evt] ||= []).push(cb);
  },
  emit(evt, ...args) {
    (listeners[evt] || []).forEach(cb => {
      try { cb(...args); } catch (e) { console.error(e); }
    });
  },
};

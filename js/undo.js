// 변경 전 스냅샷 + 실행취소 토스트
import { snapshot, restore } from './store.js';
import { showToast } from './toast.js';
import { t } from './i18n.js';

export function withUndo(toastMsg, fn) {
  const snap = snapshot();
  fn();
  showToast(toastMsg, {
    actionLabel: t('toast.undo'),
    onAction: () => {
      restore(snap);
      showToast(t('toast.restored'));
    },
  });
}

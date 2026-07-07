// 인앱 토스트 (실행취소 버튼 지원). 알림 폴백으로도 사용.
export function showToast(msg, { actionLabel = null, onAction = null, duration = 4500, sticky = false } = {}) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const el = document.createElement('div');
  el.className = 'toast';

  const span = document.createElement('span');
  span.className = 'toast-msg';
  span.textContent = msg;
  el.append(span);

  let timer = null;
  const dismiss = () => {
    clearTimeout(timer);
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  };

  if (actionLabel) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => { onAction?.(); dismiss(); });
    el.append(btn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', dismiss);
  el.append(closeBtn);

  container.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  if (!sticky) timer = setTimeout(dismiss, duration);
  return dismiss;
}

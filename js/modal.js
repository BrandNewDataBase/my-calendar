// 공용 모달 헬퍼 — 문자열/라벨은 호출자가 주입 (i18n 비의존)
export function openModal(builder, { className = '', onClose = null } = {}) {
  const root = document.getElementById('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const box = document.createElement('div');
  box.className = 'modal ' + className;
  backdrop.append(box);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.classList.remove('show');
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => backdrop.remove(), 200);
    onClose?.();
  };
  const onKey = e => {
    if (e.key !== 'Escape') return;
    // 모달이 겹쳐 있으면 최상단 모달만 닫는다 (부모 에디터까지 닫혀 편집 내용이 날아가는 것 방지)
    const stack = root.querySelectorAll(':scope > .modal-backdrop');
    if (stack[stack.length - 1] !== backdrop) return;
    e.stopPropagation();
    close();
  };

  backdrop.addEventListener('mousedown', e => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', onKey, true);

  // 빌더보다 먼저 DOM에 붙여, 빌더 안에서 동기 focus()가 동작하게 한다
  root.append(backdrop);
  builder(box, close);
  requestAnimationFrame(() => backdrop.classList.add('show'));
  return close;
}

// 버튼 선택 다이얼로그. 선택한 choice.value 또는 (배경/Esc 닫힘 시) null을 resolve.
// choices: [{label, value, kind?: 'primary'|'danger'|''}]
export function choiceDialog({ title = '', message = '', choices = [] }) {
  return new Promise(resolve => {
    let picked = false;
    const close = openModal((box) => {
      box.classList.add('modal-sm');
      if (title) {
        const h = document.createElement('h3');
        h.className = 'modal-title';
        h.textContent = title;
        box.append(h);
      }
      if (message) {
        const p = document.createElement('p');
        p.className = 'modal-msg';
        p.textContent = message;
        box.append(p);
      }
      const row = document.createElement('div');
      row.className = 'modal-actions';
      choices.forEach(c => {
        const b = document.createElement('button');
        b.className = 'btn' + (c.kind ? ' btn-' + c.kind : '');
        b.textContent = c.label;
        b.addEventListener('click', () => {
          picked = true;
          resolve(c.value);
          close();
        });
        row.append(b);
      });
      box.append(row);
    }, { onClose: () => { if (!picked) resolve(null); } });
  });
}

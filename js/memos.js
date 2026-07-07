// 메모 탭 — 팔레트색 미리보기 카드 그리드 + 클릭 시 메모 편집 모달
import { state, addMemo, updateMemo, deleteMemo } from './store.js';
import { t, locale } from './i18n.js';
import { el } from './dom.js';
import { openModal, choiceDialog } from './modal.js';
import { withUndo } from './undo.js';
import { showToast } from './toast.js';
import { MEMO_COLORS } from './palette.js';

let query = '';

export function renderMemoToolbar() {
  const toolbar = document.getElementById('memo-toolbar');
  if (!toolbar) return;
  toolbar.textContent = '';
  const newBtn = el('button', 'btn btn-primary', '+ ' + t('memo.new'));
  newBtn.type = 'button';
  newBtn.addEventListener('click', () => openMemoEditor(null));
  const searchIn = el('input', 'memo-search');
  searchIn.type = 'search';
  searchIn.placeholder = t('memo.searchPh');
  searchIn.value = query;
  searchIn.addEventListener('input', () => {
    query = searchIn.value;
    renderMemoGrid();
  });
  toolbar.append(newBtn, searchIn);
}

export function renderMemoGrid() {
  const grid = document.getElementById('memo-grid');
  if (!grid) return;
  grid.textContent = '';
  const q = query.trim().toLowerCase();
  const memos = state.memos
    .filter(m => !q ||
      (m.title || '').toLowerCase().includes(q) ||
      (m.body || '').toLowerCase().includes(q))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);

  if (!memos.length) {
    grid.append(el('div', 'memo-empty', t('memo.empty')));
    return;
  }
  const dateFmt = new Intl.DateTimeFormat(locale(), { month: 'short', day: 'numeric' });
  for (const m of memos) {
    const card = el('button', 'memo-card');
    card.type = 'button';
    card.dataset.color = m.color || 'butter';
    if (m.pinned) card.append(el('span', 'memo-pin-badge', '📌'));
    card.append(el('div', 'memo-card-title', m.title || t('memo.untitled')));
    card.append(el('div', 'memo-card-body', (m.body || '').slice(0, 180)));
    card.append(el('div', 'memo-card-date', dateFmt.format(new Date(m.updatedAt))));
    card.addEventListener('click', () => openMemoEditor(m.id));
    grid.append(card);
  }
}

export function openMemoEditor(id) {
  const memo = id ? state.memos.find(m => m.id === id) : null;
  let color = memo?.color || 'butter';
  let pinned = memo?.pinned || false;

  openModal((box, close) => {
    box.classList.add('modal-memo');
    box.dataset.color = color;

    const titleIn = el('input', 'memo-title-input');
    titleIn.type = 'text';
    titleIn.placeholder = t('memo.titlePh');
    titleIn.value = memo?.title || '';

    const bodyIn = el('textarea', 'memo-body-input');
    bodyIn.placeholder = t('memo.bodyPh');
    bodyIn.value = memo?.body || '';
    bodyIn.rows = 10;

    const swRow = el('div', 'swatch-row');
    MEMO_COLORS.forEach(k => {
      const b = el('button', 'swatch memo-swatch' + (k === color ? ' selected' : ''));
      b.type = 'button';
      b.style.background = `var(--memo-${k})`;
      b.dataset.key = k;
      b.addEventListener('click', () => {
        color = k;
        box.dataset.color = k;
        swRow.querySelectorAll('.swatch').forEach(x =>
          x.classList.toggle('selected', x === b));
      });
      swRow.append(b);
    });

    const pinBtn = el('button', 'btn btn-ghost');
    pinBtn.type = 'button';
    const syncPin = () => {
      pinBtn.textContent = '📌 ' + (pinned ? t('memo.unpin') : t('memo.pin'));
      pinBtn.classList.toggle('on', pinned);
    };
    syncPin();
    pinBtn.addEventListener('click', () => {
      pinned = !pinned;
      syncPin();
    });

    const footer = el('div', 'modal-actions');
    if (memo) {
      const delBtn = el('button', 'btn btn-danger', t('btn.delete'));
      delBtn.type = 'button';
      delBtn.addEventListener('click', async () => {
        const ok = await choiceDialog({
          title: t('confirm.deleteMemo'),
          choices: [
            { label: t('btn.cancel'), value: null },
            { label: t('btn.delete'), value: 'yes', kind: 'danger' },
          ],
        });
        if (ok !== 'yes') return;
        withUndo(t('toast.deleted'), () => deleteMemo(memo.id));
        close();
      });
      footer.append(delBtn);
    }
    footer.append(el('span', 'spacer'));
    const cancelBtn = el('button', 'btn', t('btn.cancel'));
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', close);
    const saveBtn = el('button', 'btn btn-primary', t('btn.save'));
    saveBtn.type = 'button';
    saveBtn.addEventListener('click', () => {
      const title = titleIn.value.trim();
      const body = bodyIn.value;
      if (!memo && !title && !body.trim()) {
        close();
        return;
      }
      if (memo) updateMemo(memo.id, { title, body, color, pinned });
      else addMemo({ title, body, color, pinned });
      showToast(t('toast.saved'));
      close();
    });
    footer.append(cancelBtn, saveBtn);

    const toolRow = el('div', 'memo-tools');
    toolRow.append(swRow, pinBtn);
    box.append(titleIn, bodyIn, toolRow, footer);
    (memo ? bodyIn : titleIn).focus();
  }, { className: 'modal-lg' });
}

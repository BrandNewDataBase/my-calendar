// 카테고리 사이드바 + 편집 모달
import { state, addCategory, updateCategory, deleteCategory } from './store.js';
import { t } from './i18n.js';
import { el } from './dom.js';
import { openModal } from './modal.js';
import { CATEGORY_COLORS } from './palette.js';

export function renderCategories() {
  const list = document.getElementById('category-list');
  if (!list) return;
  list.textContent = '';
  for (const cat of state.categories) {
    const row = el('div', 'cat-row');
    const chk = el('input');
    chk.type = 'checkbox';
    chk.checked = cat.visible !== false;
    chk.addEventListener('change', () => updateCategory(cat.id, { visible: chk.checked }));
    const dot = el('span', 'cat-dot');
    dot.style.background = `var(--cat-${cat.color})`;
    const name = el('span', 'cat-name', cat.name);
    const editBtn = el('button', 'icon-btn cat-edit', '✎');
    editBtn.type = 'button';
    editBtn.title = t('cat.edit');
    editBtn.addEventListener('click', () => openCategoryEditor(cat.id));
    const lab = el('label', 'cat-check');
    lab.append(chk, dot, name);
    row.append(lab, editBtn);
    list.append(row);
  }
}

export function openCategoryEditor(id) {
  const cat = id ? state.categories.find(c => c.id === id) : null;
  let color = cat?.color || CATEGORY_COLORS[0];

  openModal((box, close) => {
    box.classList.add('modal-sm');
    box.append(el('h3', 'modal-title', cat ? t('cat.edit') : t('cat.add')));

    const nameIn = el('input', 'cat-name-input');
    nameIn.type = 'text';
    nameIn.placeholder = t('cat.name');
    nameIn.value = cat?.name || '';

    const swRow = el('div', 'swatch-row');
    CATEGORY_COLORS.forEach(k => {
      const b = el('button', 'swatch' + (k === color ? ' selected' : ''));
      b.type = 'button';
      b.style.background = `var(--cat-${k})`;
      b.dataset.key = k;
      b.addEventListener('click', () => {
        color = k;
        swRow.querySelectorAll('.swatch').forEach(x =>
          x.classList.toggle('selected', x === b));
      });
      swRow.append(b);
    });

    const footer = el('div', 'modal-actions');
    if (cat && state.categories.length > 1) {
      const delBtn = el('button', 'btn btn-danger', t('btn.delete'));
      delBtn.type = 'button';
      delBtn.title = t('cat.deleteNote');
      delBtn.addEventListener('click', () => {
        deleteCategory(cat.id);
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
      const name = nameIn.value.trim() || t('cat.personal');
      if (cat) updateCategory(cat.id, { name, color });
      else addCategory(name, color);
      close();
    });
    footer.append(cancelBtn, saveBtn);

    if (cat && state.categories.length > 1) {
      box.append(nameIn, swRow, el('p', 'modal-msg small', t('cat.deleteNote')), footer);
    } else {
      box.append(nameIn, swRow, footer);
    }
    nameIn.focus();
  });
}

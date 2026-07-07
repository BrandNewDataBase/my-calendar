// 이벤트 생성/수정 모달
import {
  state, addEvent, updateEvent, DAY_MS, MIN15_MS,
} from './store.js';
import { openModal, choiceDialog } from './modal.js';
import { t, weekdayName } from './i18n.js';
import { withUndo } from './undo.js';
import { showToast } from './toast.js';
import { CATEGORY_COLORS } from './palette.js';
import { deleteOccurrence } from './calendar/eventOps.js';
import {
  toDateStr, toDateTimeStr, parseLocal, addDays, diffDays, startOfDay,
  evStart, evEnd, pad2, HOUR,
} from './dateutil.js';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function row(labelText, ...children) {
  const r = el('div', 'form-row');
  const lab = el('label', 'form-label', labelText);
  r.append(lab, ...children);
  return r;
}

// 템플릿의 {n} 자리에 input을 끼워 넣은 라벨 조각 생성
function templateWithInput(template, input) {
  const wrap = el('span', 'tpl-inline');
  const [before, after = ''] = template.split('{n}');
  wrap.append(document.createTextNode(before), input, document.createTextNode(after));
  return wrap;
}

const normRule = r => r ? JSON.stringify({
  freq: r.freq, interval: r.interval || 1,
  byWeekday: (r.byWeekday || []).slice().sort(),
  monthlyMode: r.monthlyMode || 'date',
  end: r.end || { type: 'never' },
}) : 'null';

// occ: 수정할 발생(occurrence) 객체 | null, defaults: {start:Date, end:Date, allDay} | null
export function openEventEditor({ occ = null, defaults = null } = {}) {
  const editing = !!occ;
  const ev = occ?.ev || null;

  // ---- 초기값 ----
  let initStart, initEnd, initAllDay;
  if (editing) {
    initStart = occ.occStart;
    initEnd = new Date(occ.occEnd.getTime() - (ev.allDay ? 1 : 0)); // 종일: exclusive → inclusive 근사
    initAllDay = !!ev.allDay;
  } else {
    const base = defaults?.start || (() => {
      const n = new Date();
      return new Date(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours() + 1, 0);
    })();
    initStart = base;
    initEnd = defaults?.end || new Date(base.getTime() + HOUR);
    initAllDay = defaults?.allDay ?? false;
  }
  const rule = ev?.recurrence || null;
  const rems = new Set(ev ? (ev.reminders || []) : [DAY_MS, MIN15_MS]);

  openModal((box, close) => {
    box.classList.add('modal-editor');
    const form = el('form', 'event-form');
    form.addEventListener('submit', e => e.preventDefault());

    const h = el('h3', 'modal-title', editing ? t('event.edit') : t('event.new'));

    const titleIn = el('input', 'ev-title-input');
    titleIn.type = 'text';
    titleIn.placeholder = t('event.titlePh');
    titleIn.value = ev?.title || '';

    // 종일 토글
    const allDayIn = el('input');
    allDayIn.type = 'checkbox';
    allDayIn.checked = initAllDay;
    const allDayLab = el('label', 'check-row');
    allDayLab.append(allDayIn, el('span', null, t('event.allDay')));

    // 시작/종료
    const sDate = el('input'); sDate.type = 'date'; sDate.value = toDateStr(initStart);
    const sTime = el('input'); sTime.type = 'time'; sTime.step = 900;
    sTime.value = `${pad2(initStart.getHours())}:${pad2(initStart.getMinutes())}`;
    const eDate = el('input'); eDate.type = 'date'; eDate.value = toDateStr(initEnd);
    const eTime = el('input'); eTime.type = 'time'; eTime.step = 900;
    eTime.value = `${pad2(initEnd.getHours())}:${pad2(initEnd.getMinutes())}`;

    const syncTimeVisibility = () => {
      const hide = allDayIn.checked;
      sTime.style.display = hide ? 'none' : '';
      eTime.style.display = hide ? 'none' : '';
    };
    allDayIn.addEventListener('change', syncTimeVisibility);
    syncTimeVisibility();

    // 시작이 종료를 넘으면 종료를 따라 이동 (지속시간 유지)
    let lastDur = initEnd - initStart;
    const readStart = () => allDayIn.checked
      ? parseLocal(sDate.value || toDateStr(new Date()))
      : parseLocal(`${sDate.value}T${sTime.value || '09:00'}`);
    const readEnd = () => allDayIn.checked
      ? parseLocal(eDate.value || sDate.value)
      : parseLocal(`${eDate.value || sDate.value}T${eTime.value || sTime.value || '10:00'}`);
    const onStartChange = () => {
      const s = readStart();
      const e = new Date(s.getTime() + Math.max(0, lastDur));
      eDate.value = toDateStr(e);
      eTime.value = `${pad2(e.getHours())}:${pad2(e.getMinutes())}`;
    };
    const onEndChange = () => {
      const s = readStart(), e = readEnd();
      if (e >= s) lastDur = e - s;
    };
    sDate.addEventListener('change', onStartChange);
    sTime.addEventListener('change', onStartChange);
    eDate.addEventListener('change', onEndChange);
    eTime.addEventListener('change', onEndChange);

    // 카테고리
    const catSel = el('select');
    state.categories.forEach(c => {
      const o = el('option', null, c.name);
      o.value = c.id;
      catSel.append(o);
    });
    catSel.value = ev?.categoryId || state.categories[0]?.id || '';

    // 색상 스와치 (auto = 카테고리 색)
    let colorKey = ev?.color || null;
    const swatches = el('div', 'swatch-row');
    const autoSw = el('button', 'swatch swatch-auto');
    autoSw.type = 'button';
    autoSw.title = t('event.colorAuto');
    const paintAuto = () => {
      const cat = state.categories.find(c => c.id === catSel.value);
      autoSw.style.background = `var(--cat-${cat?.color || 'orange'})`;
    };
    paintAuto();
    catSel.addEventListener('change', paintAuto);
    swatches.append(autoSw);
    const swBtns = [autoSw];
    CATEGORY_COLORS.forEach(key => {
      const b = el('button', 'swatch');
      b.type = 'button';
      b.style.background = `var(--cat-${key})`;
      b.dataset.key = key;
      swatches.append(b);
      swBtns.push(b);
    });
    const paintSel = () => swBtns.forEach(b =>
      b.classList.toggle('selected', (b.dataset.key || null) === colorKey));
    paintSel();
    swatches.addEventListener('click', e => {
      const b = e.target.closest('.swatch');
      if (!b) return;
      colorKey = b.dataset.key || null;
      paintSel();
    });

    // ---- 반복 ----
    const freqSel = el('select');
    [['none', 'repeat.none'], ['daily', 'repeat.daily'], ['weekly', 'repeat.weekly'],
     ['monthly', 'repeat.monthly'], ['yearly', 'repeat.yearly']].forEach(([v, k]) => {
      const o = el('option', null, t(k));
      o.value = v;
      freqSel.append(o);
    });
    freqSel.value = rule?.freq || 'none';

    const repOpts = el('div', 'repeat-opts');

    const intervalIn = el('input', 'num-input');
    intervalIn.type = 'number'; intervalIn.min = 1; intervalIn.max = 99;
    intervalIn.value = rule?.interval || 1;
    const intervalRow = el('div', 'repeat-sub');

    const wdRow = el('div', 'repeat-sub weekday-toggles');
    const wdBtns = [];
    for (let i = 0; i < 7; i++) {
      const b = el('button', 'wd-toggle', weekdayName(i, 'narrow'));
      b.type = 'button';
      b.dataset.wd = i;
      b.addEventListener('click', () => b.classList.toggle('on'));
      wdRow.append(b);
      wdBtns.push(b);
    }
    (rule?.byWeekday || [initStart.getDay()]).forEach(wd => wdBtns[wd]?.classList.add('on'));

    const mmSel = el('select');
    [['date', 'repeat.byDate'], ['weekday', 'repeat.byWeekday']].forEach(([v, k]) => {
      const o = el('option', null, t(k));
      o.value = v;
      mmSel.append(o);
    });
    mmSel.value = rule?.monthlyMode || 'date';
    const mmRow = el('div', 'repeat-sub');
    mmRow.append(mmSel);

    const endSel = el('select');
    [['never', 'repeat.endNever'], ['until', 'repeat.endUntil'], ['count', 'repeat.endCount']]
      .forEach(([v, k]) => {
        const o = el('option', null, t(k));
        o.value = v;
        endSel.append(o);
      });
    endSel.value = rule?.end?.type || 'never';
    const untilIn = el('input');
    untilIn.type = 'date';
    untilIn.value = rule?.end?.until || toDateStr(addDays(initStart, 90));
    const countIn = el('input', 'num-input');
    countIn.type = 'number'; countIn.min = 1; countIn.max = 999;
    countIn.value = rule?.end?.count || 10;
    const countWrap = templateWithInput(t('repeat.countTimes'), countIn);
    const endRow = el('div', 'repeat-sub repeat-end');
    endRow.append(el('span', 'sub-label', t('repeat.end')), endSel, untilIn, countWrap);

    repOpts.append(intervalRow, wdRow, mmRow, endRow);

    const syncRepeat = () => {
      const fq = freqSel.value;
      repOpts.style.display = fq === 'none' ? 'none' : '';
      if (fq !== 'none') {
        intervalRow.textContent = '';
        intervalRow.append(templateWithInput(t(`repeat.every.${fq}`), intervalIn));
      }
      wdRow.style.display = fq === 'weekly' ? '' : 'none';
      mmRow.style.display = fq === 'monthly' ? '' : 'none';
      untilIn.style.display = endSel.value === 'until' ? '' : 'none';
      countWrap.style.display = endSel.value === 'count' ? '' : 'none';
    };
    freqSel.addEventListener('change', syncRepeat);
    endSel.addEventListener('change', syncRepeat);
    syncRepeat();

    // 알림 체크박스
    const rem1d = el('input'); rem1d.type = 'checkbox'; rem1d.checked = rems.has(DAY_MS);
    const rem15 = el('input'); rem15.type = 'checkbox'; rem15.checked = rems.has(MIN15_MS);
    const remRow = el('div', 'inline-checks');
    const l1 = el('label', 'check-row'); l1.append(rem1d, el('span', null, t('event.rem1d')));
    const l2 = el('label', 'check-row'); l2.append(rem15, el('span', null, t('event.rem15m')));
    remRow.append(l1, l2);

    // D-Day
    const ddayIn = el('input'); ddayIn.type = 'checkbox'; ddayIn.checked = !!ev?.showDday;
    const ddayLab = el('label', 'check-row');
    ddayLab.append(ddayIn, el('span', null, t('event.showDday')));

    const locIn = el('input');
    locIn.type = 'text';
    locIn.placeholder = t('event.location');
    locIn.value = ev?.location || '';

    const notesIn = el('textarea', 'ev-notes');
    notesIn.placeholder = t('event.notes');
    notesIn.value = ev?.notes || '';
    notesIn.rows = 3;

    // ---- 푸터 ----
    const footer = el('div', 'modal-actions');
    if (editing) {
      const delBtn = el('button', 'btn btn-danger', t('btn.delete'));
      delBtn.type = 'button';
      delBtn.addEventListener('click', async () => {
        if (await deleteOccurrence(occ)) close();
      });
      footer.append(delBtn);
    }
    footer.append(el('span', 'spacer'));
    const cancelBtn = el('button', 'btn', t('btn.cancel'));
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', close);
    const saveBtn = el('button', 'btn btn-primary', t('btn.save'));
    saveBtn.type = 'button';
    footer.append(cancelBtn, saveBtn);

    // ---- 저장 ----
    const collect = () => {
      const allDay = allDayIn.checked;
      let s = readStart();
      let e = readEnd();
      if (allDay) {
        s = startOfDay(s);
        e = startOfDay(e);
        if (e < s) e = s;
      } else if (e <= s) {
        e = new Date(s.getTime() + HOUR);
      }
      const fq = freqSel.value;
      let recurrence = null;
      if (fq !== 'none') {
        recurrence = { freq: fq, interval: Math.max(1, parseInt(intervalIn.value, 10) || 1) };
        if (fq === 'weekly') {
          const bw = wdBtns.filter(b => b.classList.contains('on')).map(b => +b.dataset.wd);
          recurrence.byWeekday = bw.length ? bw : [s.getDay()];
        }
        if (fq === 'monthly') recurrence.monthlyMode = mmSel.value;
        const et = endSel.value;
        recurrence.end = et === 'until'
          ? { type: 'until', until: untilIn.value || toDateStr(addDays(s, 90)) }
          : et === 'count'
            ? { type: 'count', count: Math.max(1, parseInt(countIn.value, 10) || 1) }
            : { type: 'never' };
      }
      const reminders = [];
      if (rem1d.checked) reminders.push(DAY_MS);
      if (rem15.checked) reminders.push(MIN15_MS);
      return {
        title: titleIn.value.trim() || t('memo.untitled'),
        allDay,
        start: allDay ? toDateStr(s) : toDateTimeStr(s),
        end: allDay ? toDateStr(e) : toDateTimeStr(e),
        categoryId: catSel.value,
        color: colorKey,
        location: locIn.value.trim(),
        notes: notesIn.value,
        recurrence,
        reminders,
        showDday: ddayIn.checked,
        _startDate: s,
        _durMs: allDay ? (diffDays(s, e) + 1) * 86400000 : (e - s),
      };
    };

    const save = async () => {
      const data = collect();
      const { _startDate, _durMs, ...fields } = data;

      if (!editing) {
        addEvent(fields);
        showToast(t('toast.saved'));
        close();
        return;
      }

      if (!ev.recurrence) {
        // 단독 이벤트 수정 (반복 추가 시 그대로 시리즈가 됨)
        withUndo(t('toast.saved'), () => updateEvent(ev.id, fields));
        close();
        return;
      }

      // 반복 이벤트 수정
      const ruleChanged = normRule(ev.recurrence) !== normRule(fields.recurrence);
      if (ruleChanged) {
        // 규칙이 바뀌면 전체 시리즈를 편집값 기준으로 재구성
        withUndo(t('toast.saved'), () => updateEvent(ev.id, { ...fields, exdates: [] }));
        close();
        return;
      }
      const scope = await choiceDialog({
        title: t('scope.editTitle'),
        message: t('scope.question'),
        choices: [
          { label: t('scope.thisOnly'), value: 'this', kind: 'primary' },
          { label: t('scope.all'), value: 'all' },
        ],
      });
      if (!scope) return;
      if (scope === 'this') {
        withUndo(t('toast.saved'), () => {
          updateEvent(ev.id, { exdates: [...(ev.exdates || []), toDateStr(occ.occStart)] });
          addEvent({ ...fields, recurrence: null, showDday: false });
        });
      } else {
        // 전체: 편집한 발생과 원래 발생의 날짜 차이만큼 시리즈 시작을 이동
        const seriesStart = evStart(ev);
        const deltaDays = diffDays(startOfDay(occ.occStart), startOfDay(_startDate));
        const shifted = addDays(seriesStart, deltaDays);
        const ns = fields.allDay
          ? startOfDay(shifted)
          : new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate(),
              _startDate.getHours(), _startDate.getMinutes());
        const range = fields.allDay
          ? {
              start: toDateStr(ns),
              end: toDateStr(addDays(ns, Math.max(0, Math.round(_durMs / 86400000) - 1))),
            }
          : { start: toDateTimeStr(ns), end: toDateTimeStr(new Date(ns.getTime() + _durMs)) };
        withUndo(t('toast.saved'), () => updateEvent(ev.id, { ...fields, ...range }));
      }
      close();
    };

    saveBtn.addEventListener('click', save);
    titleIn.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
    });

    form.append(
      h, titleIn, allDayLab,
      row(t('event.start'), sDate, sTime),
      row(t('event.end'), eDate, eTime),
      row(t('event.category'), catSel),
      row(t('event.color'), swatches),
      row(t('event.repeat'), freqSel),
      repOpts,
      row(t('event.reminders'), remRow),
      ddayLab,
      row(t('event.location'), locIn),
      notesIn,
      footer,
    );
    box.append(form);
    titleIn.focus();
  }, { className: 'modal-lg' });
}

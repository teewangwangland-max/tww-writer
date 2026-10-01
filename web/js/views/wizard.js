// Write-post wizard (new + edit). Everything is rendered from the format spec.
import { h, clear } from '../dom.js';
import { api } from '../api.js';
import * as store from '../store.js';
import { compute, checkPost } from '../engine/index.js';
import { getSpec, specProblemMessage } from '../formats.js';
import {
  STEP_LABELS, emptyState, mergeInputs, normalizeInputs, draftKey, loadDraft, saveDraft, removeDraft,
  projectNameOf, locationOf,
} from '../wizard-state.js';
import { renderFields } from '../fields.js';
import { renderResults } from '../results-view.js';
import { renderChecker } from '../checker-view.js';
import { loadPromptContext } from '../prompt-data.js';
import { buildWritePrompt, PLAYFULNESS } from '../prompt/build-write.js';
import { copyText } from '../clipboard.js';

const AI_LINKS = [
  { label: 'เปิด Gemini', href: 'https://gemini.google.com/app' },
  { label: 'เปิด Claude', href: 'https://claude.ai/new' },
  { label: 'เปิด ChatGPT', href: 'https://chatgpt.com/' },
];

const ERR_TEXT = {
  NETWORK: 'ต่อเซิร์ฟเวอร์ไม่ได้',
  FORBIDDEN: 'ไม่มีสิทธิ์แก้โพสต์นี้',
  NOT_FOUND: 'ไม่พบข้อมูล',
  BAD_INPUT: 'ข้อมูลไม่ถูกต้อง',
  DOC_NOT_ACCESSIBLE: 'เปิด Google Doc ไม่ได้',
};

function errMsg(e) {
  const code = (e && e.code) || 'ERROR';
  const base = ERR_TEXT[code] || 'เกิดข้อผิดพลาด';
  const extra = e && e.message ? ' — ' + e.message : '';
  return `${base} (${code})${extra}`;
}

function shell(el, children) {
  clear(el);
  el.appendChild(h('section', { class: 'screen wizard' }, children));
}

function messageScreen(el, title, text, withBack) {
  shell(el, [
    h('h1', null, title),
    h('p', { class: 'form-error' }, text),
    withBack ? h('p', null, h('a', { class: 'link-btn', href: '#/new' }, 'เลือกรูปแบบอื่น')) : null,
    h('p', null, h('a', { class: 'link-btn', href: '#/' }, 'กลับคลังโพสต์')),
  ]);
}

export async function renderWizard(el, params, mode) {
  let alive = true;
  let dirty = false;
  let saveTimer = null;
  let checker = null;
  const user = store.getUser() || {};
  const ctx = {
    spec: null, info: null, state: null, result: null, maxStep: 1,
    missing: new Set(), flash: '', flashBad: false, promptPromise: null, promptCtx: null,
    copiedChars: null, saving: false, ack: false, lastSave: null, step1Error: '', compsLib: null,
  };

  function flushSave() {
    clearTimeout(saveTimer);
    if (dirty && ctx.state) { saveDraft(ctx.state); dirty = false; }
  }
  window.addEventListener('hashchange', function stop() {
    alive = false;
    flushSave();
    if (checker) checker.dispose();
    window.removeEventListener('hashchange', stop);
  });

  function changed() {
    ctx.result = null;
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { if (alive) flushSave(); }, 500);
  }
  // Edits that do not affect the numbers (narrative/tone/body) only need autosave.
  function touchedSoft() {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { if (alive) flushSave(); }, 500);
  }

  // ---- loading ----
  shell(el, [h('h1', null, mode === 'edit' ? 'แก้ไขโพสต์' : 'เขียนโพสต์ใหม่'), h('p', { class: 'muted' }, 'กำลังโหลด...')]);

  let post = null;
  let formatId = params.formatId;
  if (mode === 'edit') {
    try {
      post = await api('posts.get', { post_id: params.postId });
    } catch (e) {
      if (!alive) return;
      messageScreen(el, 'แก้ไขโพสต์', 'โหลดโพสต์ไม่สำเร็จ ' + errMsg(e), false);
      return;
    }
    if (!alive) return;
    if (post.user_id !== user.user_id) { location.hash = '#/post/' + encodeURIComponent(params.postId); return; }
    formatId = post.format_id;
  }

  try {
    ctx.info = await getSpec(formatId);
  } catch (e) {
    if (!alive) return;
    messageScreen(el, 'เขียนโพสต์ใหม่',
      e && e.code === 'INVALID_SPEC' ? specProblemMessage(e) : 'โหลดรูปแบบไม่สำเร็จ ' + errMsg(e), true);
    return;
  }
  if (!alive) return;
  ctx.spec = ctx.info.spec;
  const spec = ctx.spec;

  function freshState() {
    if (mode === 'edit') {
      const s = emptyState(spec, user, ctx.info.version);
      s.postId = post.post_id;
      s.formatId = formatId;
      s.inputs = mergeInputs(spec, post.inputs);
      if (post.narrative && typeof post.narrative === 'object') s.narrative = { ...post.narrative };
      if (post.tone && typeof post.tone === 'object') {
        s.tone = {
          playfulness: Number(post.tone.playfulness) >= 1 ? Number(post.tone.playfulness) : s.tone.playfulness,
          options: Array.isArray(post.tone.options) ? post.tone.options.slice() : [],
        };
      }
      s.body = typeof post.body === 'string' ? post.body : '';
      s.step = 4;
      return s;
    }
    const s = emptyState(spec, user, ctx.info.version);
    s.formatId = formatId;
    return s;
  }

  const key = mode === 'edit' ? 'tww.draft.post.' + params.postId : 'tww.draft.' + formatId;
  const existing = loadDraft(key);
  if (existing) {
    showDraftBar(existing);
  } else {
    begin(freshState());
  }

  function showDraftBar(draft) {
    const confirmEl = h('span', { class: 'confirm-inline' });
    const bar = h('div', { class: 'draft-bar', role: 'status' },
      h('p', null, 'มีร่างที่ยังไม่บันทึก'),
      h('div', { class: 'btn-row' },
        h('button', {
          type: 'button', class: 'btn btn-primary',
          onclick: () => {
            const s = freshState();
            s.inputs = mergeInputs(spec, draft.inputs);
            s.narrative = draft.narrative || {};
            s.tone = draft.tone;
            s.body = draft.body || '';
            s.step = draft.step || 1;
            s.saveAsExample = !!draft.saveAsExample;
            ctx.maxStep = s.step;
            begin(s, true);
          },
        }, 'ทำต่อ'),
        h('button', {
          type: 'button', class: 'btn',
          onclick: () => {
            clear(confirmEl);
            confirmEl.appendChild(h('span', null, 'ล้างร่างนี้? '));
            confirmEl.appendChild(h('button', {
              type: 'button', class: 'btn',
              onclick: () => { removeDraft(key); begin(freshState()); },
            }, 'ใช่'));
            confirmEl.appendChild(h('button', { type: 'button', class: 'btn', onclick: () => clear(confirmEl) }, 'ไม่'));
          },
        }, 'เริ่มใหม่')),
      confirmEl);
    shell(el, [h('h1', null, ctx.info.name || spec.name), bar]);
  }

  // ---- results ----
  function ensureResult() {
    ctx.result = compute(spec, normalizeInputs(spec, ctx.state.inputs));
    return ctx.result;
  }

  function fieldLabel(k) {
    const f = (spec.fields || []).find((x) => x.key === k);
    return f ? f.label : k;
  }

  function begin(state, resumed) {
    ctx.state = state;
    if (mode === 'edit' && !resumed) ctx.maxStep = 5;
    if (state.step >= 2) {
      const r = ensureResult();
      if (!r.ok) { state.step = 1; ctx.maxStep = 1; ctx.step1Error = errorText(r); markMissing(r); }
    }
    render();
  }

  function markMissing(r) {
    ctx.missing = new Set(r.errors.filter((e) => e.code === 'MISSING_INPUT').map((e) => e.key));
  }

  function errorText(r) {
    const miss = [...new Set(r.errors.filter((e) => e.code === 'MISSING_INPUT').map((e) => e.key))];
    if (miss.length) return 'กรอกให้ครบ: ' + miss.map(fieldLabel).join(', ');
    const e0 = r.errors[0];
    return e0 ? `คำนวณไม่ได้ (${e0.code}): ${e0.message}` : 'คำนวณไม่ได้';
  }

  function goto(n) {
    if (n >= 2) {
      const r = ensureResult();
      if (!r.ok) {
        ctx.state.step = 1; ctx.maxStep = 1; ctx.step1Error = errorText(r); markMissing(r);
        changedStepOnly();
        render();
        return;
      }
    }
    ctx.state.step = n;
    ctx.maxStep = Math.max(ctx.maxStep, n);
    ctx.flash = '';
    changedStepOnly();
    render();
    window.scrollTo(0, 0);
  }

  function changedStepOnly() { touchedSoft(); }

  // ---- stepper ----
  function stepper() {
    const cur = ctx.state.step;
    const items = STEP_LABELS.map((lab, i) => {
      const n = i + 1;
      const btn = h('button', {
        type: 'button', class: 'step-btn' + (n === cur ? ' current' : '') + (n < cur ? ' done' : ''),
        'aria-current': n === cur ? 'step' : null,
        disabled: n > ctx.maxStep && n !== cur,
        onclick: () => { if (n !== cur) goto(n); },
      }, h('span', { class: 'step-n num' }, String(n)), h('span', { class: 'step-t' }, lab));
      return h('li', null, btn);
    });
    return h('div', { class: 'stepper-wrap' },
      h('ol', { class: 'stepper', 'aria-label': 'ขั้นตอน' }, items),
      cur >= 2 ? h('button', { type: 'button', class: 'link-btn', onclick: () => doSave({ status: 'draft' }) }, 'บันทึกเป็นร่าง') : null,
      h('p', { class: ctx.flashBad ? 'form-error' : 'muted', role: 'status', 'aria-live': 'polite' }, ctx.flash));
  }

  function actionBar(buttons) {
    return h('div', { class: 'bottom-bar action-bar' }, h('div', { class: 'btn-row' }, buttons));
  }

  // ---- steps ----
  function step1() {
    const state = ctx.state;
    const errEl = h('p', { class: 'form-error', role: 'alert' }, ctx.step1Error);
    if (!ctx.compsLib) ctx.compsLib = { status: 'loading', items: [], names: new Set(), onLoaded: null };
    const fields = renderFields({ spec, inputs: state.inputs, onChange: changed, missing: ctx.missing, compsLib: ctx.compsLib });
    return {
      body: [h('h1', null, ctx.info.name || spec.name), spec.description ? h('p', { class: 'muted' }, spec.description) : null, fields, errEl],
      bar: actionBar([h('button', {
        type: 'button', class: 'btn btn-primary btn-block',
        onclick: () => {
          const r = ensureResult();
          if (!r.ok) {
            markMissing(r);
            ctx.step1Error = errorText(r);
            render();
            return;
          }
          ctx.step1Error = '';
          ctx.missing = new Set();
          goto(2);
        },
      }, 'คำนวณ')]),
    };
  }

  function step2() {
    const r = ctx.result || ensureResult();
    return {
      body: [h('h1', null, 'ผลคำนวณ'), renderResults(r, spec)],
      bar: actionBar([
        h('button', { type: 'button', class: 'btn', onclick: () => goto(1) }, 'แก้ตัวเลข'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => goto(3) }, 'ต่อไป'),
      ]),
    };
  }

  function currentPrompt(pc) {
    const r = ctx.result || ensureResult();
    return buildWritePrompt({
      spec, result: r, inputs: normalizeInputs(spec, ctx.state.inputs), narrative: ctx.state.narrative, tone: ctx.state.tone,
      house: pc.house, personal: pc.personal, profile: pc.profile, examples: pc.examples,
    });
  }

  function step3() {
    const state = ctx.state;
    if (!ctx.promptPromise) {
      ctx.promptPromise = loadPromptContext(formatId, user).then((pc) => { ctx.promptCtx = pc; return pc; });
    }
    const notesEl = h('div', { class: 'prompt-notes' });
    const copyMsg = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' }, ctx.copiedChars !== null ? `คัดลอกแล้ว (${ctx.copiedChars} ตัวอักษร)` : '');
    const linksEl = h('div', { class: 'btn-row', hidden: ctx.copiedChars === null });
    for (const l of AI_LINKS) {
      linksEl.appendChild(h('a', { class: 'btn', href: l.href, target: '_blank', rel: 'noopener noreferrer' }, l.label));
    }
    function showNotes(pc) {
      clear(notesEl);
      for (const n of pc.notes) notesEl.appendChild(h('p', { class: 'muted' }, n));
    }
    if (ctx.promptCtx) showNotes(ctx.promptCtx);
    else ctx.promptPromise.then((pc) => { if (alive) showNotes(pc); });

    const narrative = (spec.narrative_fields || []).map((f) => {
      const id = 'n-' + f.key;
      const ta = h('textarea', {
        class: 'input', id, rows: '3',
        oninput: () => { state.narrative[f.key] = ta.value; ctx.copiedChars = null; touchedSoft(); },
      });
      ta.value = state.narrative[f.key] || '';
      return h('div', { class: 'field' },
        h('label', { class: 'field-label', for: id }, f.label),
        f.hint ? h('p', { class: 'muted small' }, f.hint) : null,
        ta);
    });

    const caption = h('p', { class: 'muted' }, PLAYFULNESS[state.tone.playfulness] || '');
    const segBtns = [1, 2, 3, 4, 5].map((n) => h('button', {
      type: 'button', class: 'seg-btn', 'aria-pressed': String(state.tone.playfulness === n),
      onclick: () => {
        state.tone.playfulness = n;
        segBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i + 1 === n)));
        caption.textContent = PLAYFULNESS[n];
        touchedSoft();
      },
    }, String(n)));

    const toneOpts = (spec.tone_options || []).map((o) => {
      const cb = h('input', {
        type: 'checkbox', id: 't-' + o.key, checked: state.tone.options.includes(o.key),
        onchange: () => {
          const set = new Set(state.tone.options);
          if (cb.checked) set.add(o.key); else set.delete(o.key);
          state.tone.options = [...set];
          touchedSoft();
        },
      });
      return h('label', { class: 'check-row', for: 't-' + o.key }, cb, h('span', null, o.label));
    });

    const pre = h('pre', { class: 'prompt-pre' });
    const details = h('details', { class: 'prompt-details' },
      h('summary', null, 'ดู prompt'), pre);
    details.addEventListener('toggle', async () => {
      if (!details.open) return;
      pre.textContent = 'กำลังสร้าง...';
      const pc = await ctx.promptPromise;
      if (alive) pre.textContent = currentPrompt(pc);
    });

    const copyBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block' }, 'คัดลอก prompt');
    copyBtn.addEventListener('click', async () => {
      copyBtn.disabled = true;
      const pc = await ctx.promptPromise;
      const text = currentPrompt(pc);
      const ok = await copyText(text);
      copyBtn.disabled = false;
      if (!alive) return;
      if (ok) {
        ctx.copiedChars = text.length;
        copyMsg.textContent = `คัดลอกแล้ว (${text.length} ตัวอักษร)`;
        copyMsg.classList.remove('form-error');
        linksEl.hidden = false;
        if (details.open) pre.textContent = text;
      } else {
        copyMsg.textContent = 'คัดลอกไม่สำเร็จ ลองเปิด "ดู prompt" แล้วคัดลอกเอง';
        copyMsg.classList.add('form-error');
      }
    });

    return {
      body: [
        h('h1', null, 'เตรียม prompt'),
        narrative,
        h('div', { class: 'field' },
          h('div', { class: 'field-label' }, 'ระดับความขี้เล่น'),
          h('div', { class: 'seg', role: 'group', 'aria-label': 'ระดับความขี้เล่น' }, segBtns),
          caption),
        toneOpts.length ? h('div', { class: 'field' }, toneOpts) : null,
        notesEl,
        copyBtn, copyMsg, linksEl, details,
      ],
      bar: actionBar([
        h('button', { type: 'button', class: 'btn', onclick: () => goto(2) }, 'ย้อนกลับ'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => goto(4) }, 'ต่อไป: วางโพสต์'),
      ]),
    };
  }

  function step4() {
    if (checker) checker.dispose();
    checker = renderChecker({
      spec, state: ctx.state,
      getResult: () => ctx.result || ensureResult(),
      getInputs: () => normalizeInputs(spec, ctx.state.inputs),
      onChange: touchedSoft,
    });
    return {
      body: [h('h1', null, 'วางโพสต์'), checker.node],
      bar: actionBar([
        h('button', { type: 'button', class: 'btn', onclick: () => goto(3) }, 'ย้อนกลับ'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => goto(5) }, 'ต่อไป: บันทึก'),
      ]),
    };
  }

  function mismatchCount() {
    const body = ctx.state.body || '';
    if (body.trim() === '') return 0;
    const r = ctx.result || ensureResult();
    return checkPost(body, spec, r, normalizeInputs(spec, ctx.state.inputs)).stats.mismatch;
  }

  function step5() {
    const state = ctx.state;
    const mism = mismatchCount();
    const needAck = mism > 0;
    const saveBtns = [];
    const refreshDisabled = () => {
      const off = ctx.saving || (needAck && !ctx.ack);
      saveBtns.forEach((b) => { b.disabled = off; });
    };
    const mk = (label, cls, fn) => {
      const b = h('button', { type: 'button', class: cls, onclick: fn }, label);
      saveBtns.push(b);
      return b;
    };
    const ackCb = h('input', {
      type: 'checkbox', id: 'ack', checked: ctx.ack,
      onchange: () => { ctx.ack = ackCb.checked; refreshDisabled(); },
    });
    const exCb = h('input', {
      type: 'checkbox', id: 'as-example', checked: state.saveAsExample,
      onchange: () => { state.saveAsExample = exCb.checked; touchedSoft(); },
    });

    const done = ctx.lastSave;
    const doneEl = done ? h('div', { class: 'save-done', role: 'status' },
      h('p', null, done.fb ? 'คัดลอกแล้ว และบันทึกแล้ว' : 'บันทึกแล้ว'),
      h('div', { class: 'btn-row' },
        h('a', { class: 'btn', href: '#/post/' + encodeURIComponent(done.postId) }, 'ดูโพสต์'),
        done.docUrl ? h('a', { class: 'btn', href: done.docUrl, target: '_blank', rel: 'noopener noreferrer' }, 'เปิด Google Doc') : null,
        done.fb ? h('a', { class: 'btn', href: 'https://www.facebook.com/', target: '_blank', rel: 'noopener noreferrer' }, 'เปิด Facebook') : null,
        h('a', { class: 'btn', href: '#/' }, 'กลับคลังโพสต์'))) : null;

    const node = [
      h('h1', null, 'บันทึก'),
      h('label', { class: 'check-row', for: 'as-example' }, exCb, h('span', null, 'เก็บเป็นตัวอย่างสอนสไตล์')),
      needAck ? h('div', { class: 'warn-box' },
        h('p', { class: 'form-error' }, `ยังมีตัวเลขไม่ตรง ${mism} จุด`),
        h('label', { class: 'check-row', for: 'ack' }, ackCb, h('span', null, 'บันทึกทั้งที่ยังไม่ตรง'))) : null,
      h('div', { class: 'save-buttons' },
        mk('บันทึก', 'btn btn-primary btn-block', () => doSave({ status: statusFor() })),
        mk('บันทึก + สร้าง Google Doc', 'btn btn-block', () => doSave({ status: statusFor(), createDoc: true })),
        mk('คัดลอกไปโพสต์ Facebook', 'btn btn-block', () => doSave({ status: 'posted', fb: true }))),
      h('p', { class: ctx.flashBad ? 'form-error' : 'muted', role: 'status', 'aria-live': 'polite' }, ctx.flash),
      doneEl,
    ];
    refreshDisabled();
    return {
      body: node,
      bar: actionBar([h('button', { type: 'button', class: 'btn', onclick: () => goto(4) }, 'ย้อนกลับ')]),
    };
  }

  function statusFor() {
    return (ctx.state.body || '').trim() ? 'ready' : 'draft';
  }

  async function doSave({ status, createDoc, fb }) {
    if (ctx.saving) return;
    const state = ctx.state;
    const inputs = state.inputs;
    const r = ctx.result || ensureResult();
    const projectName = projectNameOf(spec, inputs);
    if (!projectName) {
      ctx.flash = 'ใส่ชื่อโครงการก่อนบันทึก';
      ctx.flashBad = true;
      render();
      return;
    }
    if (fb) {
      const ok = await copyText(state.body || '');
      if (!ok) { ctx.flash = 'คัดลอกไม่สำเร็จ'; ctx.flashBad = true; render(); return; }
    }
    ctx.saving = true;
    ctx.flash = 'กำลังบันทึก...';
    ctx.flashBad = false;
    render();
    const post = {
      format_id: formatId,
      project_name: projectName,
      location: locationOf(spec, inputs),
      post_status: status,
      case_summary: r.summary,
      inputs,
      results: { values: r.values, display: r.display, summary: r.summary, format_version: ctx.info.version },
      narrative: state.narrative,
      tone: state.tone,
      body: state.body || '',
    };
    if (state.postId) post.post_id = state.postId;
    const payload = { post, saveAsExample: !!state.saveAsExample };
    if (createDoc) payload.createDoc = true;
    try {
      const data = await api('posts.save', payload);
      if (!alive) return;
      const saved = data && data.post ? data.post : {};
      const oldKey = draftKey(state);
      state.postId = saved.post_id || state.postId;
      clearTimeout(saveTimer);
      dirty = false;
      removeDraft(oldKey);
      removeDraft(draftKey(state));
      removeDraft('tww.draft.' + formatId);
      ctx.lastSave = { postId: state.postId, docUrl: saved.doc_url || '', fb: !!fb };
      ctx.flash = '';
      ctx.flashBad = false;
    } catch (e) {
      if (!alive) return;
      ctx.flash = 'บันทึกไม่สำเร็จ ' + errMsg(e);
      ctx.flashBad = true;
    }
    ctx.saving = false;
    render();
  }

  function render() {
    if (!alive) return;
    if (checker && ctx.state.step !== 4) { checker.dispose(); checker = null; }
    const builders = [null, step1, step2, step3, step4, step5];
    const built = builders[ctx.state.step]();
    shell(el, [stepper(), built.body]);
    el.appendChild(built.bar);
  }
}

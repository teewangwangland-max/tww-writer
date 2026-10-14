// Admin: 5-step format extractor (also used to edit an existing spec). All output is a JSON spec.
import { h, clear } from '../dom.js';
import { api } from '../api.js';
import * as store from '../store.js';
import { compute, checkPost, validateSpec } from '../engine/index.js';
import { emptyInputs, normalizeInputs } from '../wizard-state.js';
import { renderFields } from '../fields.js';
import { renderResults } from '../results-view.js';
import { buildSegments } from '../checker-view.js';
import { copyText } from '../clipboard.js';
import { buildExtractPrompt } from '../prompt/build-extract.js';
import { SPEC_SCHEMA_DOC } from '../prompt/spec-schema-doc.js';
import { extractJson, suggestFormatId, inputsToSample, sampleToInputs } from '../spec-json.js';

const STEPS = ['โพสต์ต้นแบบ', 'prompt', 'วางสเปก', 'ทดสอบ', 'บันทึก'];
const AI_LINKS = [
  { label: 'เปิด Gemini', href: 'https://gemini.google.com/app' },
  { label: 'เปิด Claude', href: 'https://claude.ai/new' },
  { label: 'เปิด ChatGPT', href: 'https://chatgpt.com/' },
];
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

function errText(e) {
  const code = (e && e.code) || 'ERROR';
  return `เกิดข้อผิดพลาด (${code})` + (e && e.message ? ' — ' + e.message : '');
}

function loadDraft(key) {
  try {
    const o = JSON.parse(localStorage.getItem(key));
    return o && typeof o === 'object' && o.v === 1 ? o : null;
  } catch (e) { return null; }
}

function fmtLabel(f) {
  if (!f) return '';
  const parts = [f.type];
  if (f.dp !== undefined) parts.push('dp' + f.dp);
  if (f.signed) parts.push('signed');
  if (f.suffix) parts.push('"' + f.suffix + '"');
  return parts.join(' ');
}

export async function renderFormatExtract(el, params) {
  const editId = params && params.formatId ? params.formatId : null;
  const draftKey = editId ? 'tww.extract.edit.' + editId : 'tww.extract.draft';
  let alive = true;
  let saveTimer = null;
  let analyzeTimer = null;
  let dirty = false;
  const ctx = {
    st: null, maxStep: 1, flash: '', flashBad: false,
    existing: [], exampleSpec: null, exampleLoaded: false, currentSpec: null,
    analysis: null, inputsSig: '', copied: null, saving: false, saved: null, compsLib: null,
  };

  function persist() {
    if (!ctx.st) return;
    try { localStorage.setItem(draftKey, JSON.stringify({ ...ctx.st, maxStep: ctx.maxStep, inputsSig: ctx.inputsSig })); } catch (e) { /* ignore */ }
  }
  function flushSave() { clearTimeout(saveTimer); if (dirty) { persist(); dirty = false; } }
  function touched() {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { if (alive) flushSave(); }, 500);
  }

  window.addEventListener('hashchange', function stop() {
    alive = false;
    clearTimeout(analyzeTimer);
    flushSave();
    window.removeEventListener('hashchange', stop);
  });

  function shell(children) {
    clear(el);
    el.appendChild(h('section', { class: 'screen wizard extract' }, children));
  }

  shell([h('h1', null, editId ? 'แก้สเปก' : 'ถอดรูปแบบใหม่'), h('p', { class: 'muted' }, 'กำลังโหลด...')]);

  // ---- initial data ----
  try {
    const list = await api('formats.list');
    ctx.existing = Array.isArray(list) ? list : [];
  } catch (e) {
    if (!alive) return;
    if (e && e.code === 'UNAUTHORIZED') return;
    ctx.existing = [];
  }
  if (!alive) return;

  let editInfo = null;
  if (editId) {
    try {
      editInfo = await api('formats.get', { format_id: editId });
    } catch (e) {
      if (!alive) return;
      shell([
        h('h1', null, 'แก้สเปก'),
        h('p', { class: 'form-error' }, 'โหลดรูปแบบไม่สำเร็จ ' + errText(e)),
        h('p', null, h('a', { class: 'link-btn', href: '#/admin/formats' }, 'กลับหน้ารูปแบบ')),
      ]);
      return;
    }
    if (!alive) return;
    ctx.currentSpec = editInfo && editInfo.spec ? editInfo.spec : null;
  }

  function freshState() {
    const st = {
      v: 1, step: 1, name: '', formatId: suggestFormatId(new Date(), Math.random()), sourcePost: '',
      specText: '', inputs: null, saveExample: !editId,
    };
    if (editInfo) {
      st.name = editInfo.name || (ctx.currentSpec && ctx.currentSpec.name) || '';
      st.formatId = editId;
    }
    return st;
  }

  async function prefillSourceFromExamples(st) {
    if (!editId) return;
    try {
      const ex = await api('examples.list', { format_id: editId, owner: 'HOUSE' });
      const first = Array.isArray(ex) ? ex[0] : null;
      if (first && typeof first.body === 'string' && st.sourcePost === '') {
        st.sourcePost = first.body;
        if (alive && ctx.st === st && st.step === 1) render();
      }
    } catch (e) { /* source stays empty */ }
  }

  const draft = loadDraft(draftKey);
  if (draft) showResumeBar(draft);
  else begin(freshState());

  function begin(st, maxStep, sig) {
    ctx.st = st;
    ctx.maxStep = maxStep || 1;
    ctx.inputsSig = sig || '';
    ctx.analysis = null;
    if (st.sourcePost === '') prefillSourceFromExamples(st);
    render();
  }

  function showResumeBar(d) {
    const confirmEl = h('span', { class: 'confirm-inline' });
    const bar = h('div', { class: 'draft-bar', role: 'status' },
      h('p', null, 'มีร่างที่ยังไม่บันทึก'),
      h('div', { class: 'btn-row' },
        h('button', {
          type: 'button', class: 'btn btn-primary',
          onclick: () => {
            const st = { ...freshState(), ...d };
            st.v = 1;
            begin(st, d.maxStep || st.step, d.inputsSig);
          },
        }, 'ทำต่อ'),
        h('button', {
          type: 'button', class: 'btn',
          onclick: () => {
            clear(confirmEl);
            confirmEl.appendChild(h('span', null, 'ล้างร่างนี้? '));
            confirmEl.appendChild(h('button', {
              type: 'button', class: 'btn',
              onclick: () => { try { localStorage.removeItem(draftKey); } catch (e) { /* ignore */ } begin(freshState()); },
            }, 'ใช่'));
            confirmEl.appendChild(h('button', { type: 'button', class: 'btn', onclick: () => clear(confirmEl) }, 'ไม่'));
          },
        }, 'เริ่มใหม่')),
      confirmEl);
    shell([h('h1', null, editId ? 'แก้สเปก' : 'ถอดรูปแบบใหม่'), bar]);
  }

  // ---- analysis of the pasted spec ----
  function sigOf(spec) {
    return JSON.stringify([spec.fields, spec.cases]);
  }

  // Keep user-edited test inputs while the fields are unchanged; otherwise reseed from sample_inputs.
  function syncInputs(spec) {
    const sig = sigOf(spec);
    if (!ctx.st.inputs || ctx.inputsSig !== sig) {
      ctx.st.inputs = sampleToInputs(spec, spec.sample_inputs, emptyInputs);
      ctx.inputsSig = sig;
      touched();
    }
  }

  function analyze() {
    const st = ctx.st;
    const a = { parsed: false, parseError: '', spec: null, errors: [], warnings: [], notes: [], valid: false };
    if (st.specText.trim() === '') { ctx.analysis = a; return a; }
    const r = extractJson(st.specText);
    if (!r.ok) { a.parseError = r.error; ctx.analysis = a; return a; }
    a.parsed = true;
    const spec = r.value;
    if (spec.id !== undefined && spec.id !== st.formatId) a.notes.push(`AI ตั้ง id เป็น "${spec.id}" แต่ใช้ "${st.formatId}" ตามที่กรอกในขั้นแรก`);
    if (spec.name !== undefined && spec.name !== st.name) a.notes.push(`AI ตั้งชื่อเป็น "${spec.name}" แต่ใช้ "${st.name}" ตามที่กรอกในขั้นแรก`);
    spec.id = st.formatId;
    spec.name = st.name;
    const v = validateSpec(spec);
    a.spec = spec;
    a.errors = v.errors;
    a.warnings = v.warnings;
    a.valid = v.ok;
    ctx.analysis = a;
    if (a.valid) syncInputs(spec);
    return a;
  }

  function computeNow() {
    const a = ctx.analysis;
    return compute(a.spec, normalizeInputs(a.spec, ctx.st.inputs));
  }

  // ---- stepper ----
  function gateMessage(n) {
    const st = ctx.st;
    if (n >= 2 && (st.name.trim() === '' || st.sourcePost.trim() === '' || !ID_RE.test(st.formatId))) return 'กรอกขั้นแรกให้ครบก่อน';
    if (n >= 4) {
      analyze();
      if (!ctx.analysis.valid) return 'สเปกยังไม่ผ่านการตรวจ';
    }
    return '';
  }

  function goto(n) {
    const msg = gateMessage(n);
    if (msg) { ctx.flash = msg; ctx.flashBad = true; render(); return; }
    ctx.flash = '';
    ctx.flashBad = false;
    ctx.st.step = n;
    ctx.maxStep = Math.max(ctx.maxStep, n);
    touched();
    render();
    window.scrollTo(0, 0);
  }

  function stepper() {
    const cur = ctx.st.step;
    const items = STEPS.map((lab, i) => {
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
      h('p', { class: ctx.flashBad ? 'form-error' : 'muted', role: 'status', 'aria-live': 'polite' }, ctx.flash));
  }

  function actionBar(buttons) {
    return h('div', { class: 'bottom-bar action-bar' }, h('div', { class: 'btn-row' }, buttons));
  }

  // ---- step 1 ----
  function step1() {
    const st = ctx.st;
    const idErr = h('p', { class: 'form-error', role: 'alert' });
    const idNote = h('p', { class: 'muted small' });
    const post = h('textarea', {
      class: 'input big-text', id: 'src-post', rows: '12', placeholder: 'วางโพสต์ต้นแบบ',
      oninput: () => { st.sourcePost = post.value; touched(); },
    });
    post.value = st.sourcePost;
    const nameIn = h('input', {
      type: 'text', class: 'input', id: 'fmt-name', autocomplete: 'off', value: st.name,
      oninput: () => { st.name = nameIn.value; touched(); },
    });
    function checkId() {
      const v = st.formatId;
      idErr.textContent = v !== '' && !ID_RE.test(v) ? 'ใช้ได้แค่ a-z 0-9 และ -' : '';
      const exists = ctx.existing.some((f) => f.format_id === v);
      idNote.textContent = exists ? 'มีรูปแบบรหัสนี้แล้ว — บันทึกจะเป็นเวอร์ชันใหม่ของรูปแบบเดิม' : '';
    }
    const idIn = h('input', {
      type: 'text', class: 'input mono', id: 'fmt-id', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', value: st.formatId,
      readonly: !!editId,
      oninput: () => { st.formatId = idIn.value.trim(); checkId(); touched(); },
    });
    checkId();
    const err = h('p', { class: 'form-error', role: 'alert' });
    return {
      body: [
        h('h1', null, editId ? 'แก้สเปก' : 'ถอดรูปแบบใหม่'),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'src-post' }, 'วางโพสต์ต้นแบบ *'), post),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'fmt-name' }, 'ชื่อรูปแบบ *'), nameIn),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'fmt-id' }, 'รหัสรูปแบบ (id)'), idIn, idErr, idNote),
        err,
      ],
      bar: actionBar([h('button', {
        type: 'button', class: 'btn btn-primary btn-block',
        onclick: () => {
          const miss = [];
          if (st.sourcePost.trim() === '') miss.push('โพสต์ต้นแบบ');
          if (st.name.trim() === '') miss.push('ชื่อรูปแบบ');
          if (!ID_RE.test(st.formatId)) miss.push('รหัสรูปแบบ');
          if (miss.length) { err.textContent = 'กรอกให้ครบ: ' + miss.join(', '); return; }
          goto(2);
        },
      }, 'ต่อไป: สร้าง prompt')]),
    };
  }

  // ---- step 2 ----
  async function ensureExample() {
    if (ctx.exampleLoaded) return ctx.exampleSpec;
    ctx.exampleLoaded = true;
    const other = ctx.existing.find((f) => f.format_id !== ctx.st.formatId && f.status !== 'draft')
      || ctx.existing.find((f) => f.format_id !== ctx.st.formatId);
    if (other) {
      try {
        const d = await api('formats.get', { format_id: other.format_id });
        if (d && d.spec) ctx.exampleSpec = d.spec;
      } catch (e) { /* no example */ }
    }
    return ctx.exampleSpec;
  }

  async function currentPrompt() {
    const ex = await ensureExample();
    return buildExtractPrompt({
      name: ctx.st.name, formatId: ctx.st.formatId, sourcePost: ctx.st.sourcePost, exampleSpec: ex, schemaDoc: SPEC_SCHEMA_DOC,
    });
  }

  function step2() {
    const copyMsg = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' }, ctx.copied !== null ? `คัดลอกแล้ว (${ctx.copied} ตัวอักษร)` : '');
    const linksEl = h('div', { class: 'btn-row', hidden: ctx.copied === null });
    for (const l of AI_LINKS) linksEl.appendChild(h('a', { class: 'btn', href: l.href, target: '_blank', rel: 'noopener noreferrer' }, l.label));
    const pre = h('pre', { class: 'prompt-pre' });
    const details = h('details', { class: 'prompt-details' }, h('summary', null, 'ดู prompt'), pre);
    details.addEventListener('toggle', async () => {
      if (!details.open) return;
      pre.textContent = 'กำลังสร้าง...';
      const text = await currentPrompt();
      if (alive) pre.textContent = text;
    });
    const copyBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block' }, 'คัดลอก prompt');
    copyBtn.addEventListener('click', async () => {
      copyBtn.disabled = true;
      const text = await currentPrompt();
      const ok = await copyText(text);
      copyBtn.disabled = false;
      if (!alive) return;
      if (ok) {
        ctx.copied = text.length;
        copyMsg.textContent = `คัดลอกแล้ว (${text.length} ตัวอักษร)`;
        copyMsg.classList.remove('form-error');
        linksEl.hidden = false;
      } else {
        copyMsg.textContent = 'คัดลอกไม่สำเร็จ ลองเปิด "ดู prompt" แล้วคัดลอกเอง';
        copyMsg.classList.add('form-error');
      }
    });
    const skip = editId && ctx.currentSpec ? h('button', {
      type: 'button', class: 'btn btn-block',
      onclick: () => {
        ctx.st.specText = JSON.stringify(ctx.currentSpec, null, 2);
        ctx.analysis = null;
        goto(3);
      },
    }, 'ข้ามไปแก้ JSON เอง') : null;
    return {
      body: [
        h('h1', null, 'สร้าง prompt'),
        h('p', { class: 'muted' }, 'คัดลอก prompt ไปวางใน AI ของคุณ แล้วนำ JSON ที่ได้มาวางในขั้นถัดไป'),
        copyBtn, copyMsg, linksEl, details, skip,
      ],
      bar: actionBar([
        h('button', { type: 'button', class: 'btn', onclick: () => goto(1) }, 'ย้อนกลับ'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => goto(3) }, 'ต่อไป: วางสเปก'),
      ]),
    };
  }

  // ---- step 3 ----
  function simpleTable(head, rows) {
    return h('div', { class: 'table-wrap' }, h('table', { class: 'grid' },
      h('thead', null, h('tr', null, head.map((t) => h('th', null, t)))),
      h('tbody', null, rows.map((r) => h('tr', null, r.map((c) => h('td', null, c)))))));
  }

  function previewSections(a) {
    const spec = a.spec;
    const out = [];
    const formsWrap = h('div', { class: 'preview-box' });
    if (!ctx.compsLib) ctx.compsLib = { status: 'loading', items: [], names: new Set(), onLoaded: null };
    formsWrap.appendChild(renderFields({
      spec, inputs: ctx.st.inputs, onChange: () => { touched(); }, missing: new Set(), compsLib: ctx.compsLib,
    }));
    out.push(h('h2', { class: 'sub-h' }, 'ช่องกรอก'), formsWrap);

    out.push(h('h2', { class: 'sub-h' }, 'สูตร'));
    out.push(simpleTable(['key', 'ชื่อ', 'expr', 'รูปแบบ', 'per_case'], (spec.formulas || []).map((f) => (f.module
      ? [h('span', { class: 'mono' }, 'module'), f.module, '', '', '']
      : [h('span', { class: 'mono' }, f.key), f.label || '', h('span', { class: 'mono' }, f.expr), fmtLabel(f.format), f.per_case ? 'ใช่' : '']))));

    out.push(h('h2', { class: 'sub-h' }, 'เคส'));
    const cases = spec.cases || [];
    if (!cases.length) out.push(h('p', { class: 'muted' }, 'ไม่มีเคส'));
    else {
      out.push(h('ul', { class: 'info-list' }, cases.map((c) => h('li', null,
        h('span', { class: 'mono' }, c.id), ' · ', c.label || '', ' · markers: ', (c.markers || []).join(', '),
        c.inputs ? ' · inputs: ' + JSON.stringify(c.inputs) : ''))));
    }

    out.push(h('h2', { class: 'sub-h' }, 'โครงเรื่อง'));
    out.push(h('ol', { class: 'info-list' }, (spec.sections || []).map((s) => h('li', null, h('strong', null, s.title || s.id), s.guide ? ' — ' + s.guide : ''))));

    out.push(h('h2', { class: 'sub-h' }, 'ตัวตรวจเลข'));
    out.push(h('ul', { class: 'info-list' }, (spec.checks || []).map((c) => h('li', null,
      h('span', { class: 'mono' }, c.key + (c.per_case ? ' (per_case)' : '')), ' : ', (c.keywords || []).join(', ')))));

    if (Array.isArray(spec.tone_options) && spec.tone_options.length) {
      out.push(h('h2', { class: 'sub-h' }, 'โทนเสริม'));
      out.push(h('ul', { class: 'info-list' }, spec.tone_options.map((o) => h('li', null, o.label || o.key))));
    }
    if (Array.isArray(spec.notes) && spec.notes.length) {
      out.push(h('h2', { class: 'sub-h' }, 'ข้อสังเกต'));
      out.push(h('ul', { class: 'info-list' }, spec.notes.map((n) => h('li', null, n))));
    }
    return out;
  }

  function fillAnalysis(box, a) {
    clear(box);
    if (a.parseError) { box.appendChild(h('p', { class: 'form-error' }, 'อ่าน JSON ไม่ได้: ' + a.parseError)); return; }
    if (!a.parsed) { box.appendChild(h('p', { class: 'muted' }, 'ยังไม่มีสเปก')); return; }
    for (const n of a.notes) box.appendChild(h('p', { class: 'muted small' }, n));
    if (a.errors.length) {
      box.appendChild(h('p', { class: 'form-error' }, `ไม่ผ่านการตรวจ ${a.errors.length} ข้อ`));
      box.appendChild(h('ul', { class: 'error-list' }, a.errors.map((e) => h('li', null, e))));
    }
    if (a.warnings.length) {
      box.appendChild(h('ul', { class: 'info-list' }, a.warnings.map((w) => h('li', null, 'คำเตือน: ' + w))));
    }
    if (a.valid) {
      box.appendChild(h('p', { class: 'ok-text' }, 'สเปกผ่านการตรวจ'));
      box.appendChild(h('div', { class: 'preview-sections' }, previewSections(a)));
    }
  }

  function step3() {
    const st = ctx.st;
    const box = h('div', { class: 'analysis', 'aria-live': 'polite' });
    const ta = h('textarea', {
      class: 'input json-text', id: 'spec-json', rows: '14', spellcheck: 'false', autocapitalize: 'off',
      'aria-label': 'วาง JSON ที่ได้จาก AI', placeholder: 'วาง JSON ที่ได้จาก AI',
      oninput: () => {
        st.specText = ta.value;
        touched();
        clearTimeout(analyzeTimer);
        analyzeTimer = setTimeout(() => { if (alive) fillAnalysis(box, analyze()); }, 500);
      },
    });
    ta.value = st.specText;
    fillAnalysis(box, analyze());
    return {
      body: [
        h('h1', null, 'วางสเปก'),
        h('label', { class: 'field-label', for: 'spec-json' }, 'วาง JSON ที่ได้จาก AI'),
        ta, box,
      ],
      bar: actionBar([
        h('button', { type: 'button', class: 'btn', onclick: () => goto(2) }, 'ย้อนกลับ'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => goto(4) }, 'ต่อไป: ทดสอบ'),
      ]),
    };
  }

  // ---- step 4 ----
  function labelOfFormula(spec, key) {
    const f = (spec.formulas || []).find((x) => x.key === key);
    return f ? f.label || key : key;
  }

  function labelOfCase(spec, id) {
    const c = id ? (spec.cases || []).find((x) => x.id === id) : null;
    return c ? c.label || id : '';
  }

  function step4() {
    const a = analyze();
    const spec = a.spec;
    const body = [h('h1', null, 'ทดสอบ')];
    const result = computeNow();
    if (result.errors.length) {
      body.push(h('p', { class: 'form-error' }, 'คำนวณไม่สำเร็จ'));
      body.push(h('ul', { class: 'error-list' }, result.errors.map((e) => h('li', null, `${e.caseId ? e.caseId + '.' : ''}${e.key || ''}: ${e.message}`))));
    }
    body.push(h('p', null, h('button', { type: 'button', class: 'link-btn', onclick: () => goto(3) }, 'แก้ช่องกรอกทดสอบ')));
    if (result.ok) body.push(renderResults(result, spec));

    const src = ctx.st.sourcePost || '';
    if (result.ok && src.trim() !== '') {
      const rep = checkPost(src, spec, result, normalizeInputs(spec, ctx.st.inputs));
      const s = rep.stats;
      body.push(h('h2', { class: 'sub-h' }, 'เทียบกับโพสต์ต้นแบบ'));
      body.push(h('p', { class: 'check-status' + (s.mismatch > 0 ? ' has-bad' : '') },
        `สูตรตรงกับโพสต์ต้นแบบ ${s.ok} จาก ${s.checked} จุด`));
      body.push(h('p', { class: 'muted' }, `ไม่ตรง ${s.mismatch} · ไม่พบในโพสต์ ${s.missing} · ตรวจไม่ได้ ${s.unverified}`));
      const prev = h('div', { class: 'preview', 'aria-label': 'โพสต์ต้นแบบพร้อมไฮไลต์' });
      for (const seg of buildSegments(src, rep.issues)) {
        if (!seg.kind) prev.appendChild(document.createTextNode(seg.text));
        else prev.appendChild(h('span', { class: seg.kind === 'mismatch' ? 'hl-bad' : 'hl-unv' }, seg.text));
      }
      body.push(prev);
      for (const i of rep.issues.filter((x) => x.type === 'mismatch')) {
        const cs = labelOfCase(spec, i.caseId);
        body.push(h('div', { class: 'issue' }, h('p', null,
          `${cs ? cs + ' · ' : ''}${labelOfFormula(spec, i.checkKey)}: โพสต์เขียน `,
          h('span', { class: 'num bad' }, i.raw), ' สูตรได้ ', h('span', { class: 'num' }, i.expectedText))));
      }
      const miss = rep.issues.filter((x) => x.type === 'missing');
      if (miss.length) {
        body.push(h('ul', { class: 'info-list' }, miss.map((i) => {
          const cs = labelOfCase(spec, i.caseId);
          return h('li', { class: 'muted' }, `ไม่พบ ${cs ? cs + ' · ' : ''}${labelOfFormula(spec, i.checkKey)}`);
        })));
      }
    } else if (result.ok) {
      body.push(h('p', { class: 'muted' }, 'ไม่มีโพสต์ต้นแบบให้เทียบ'));
    }
    return {
      body,
      bar: actionBar([
        h('button', { type: 'button', class: 'btn', onclick: () => goto(3) }, 'ย้อนกลับ'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => goto(5) }, 'ต่อไป: บันทึก'),
      ]),
    };
  }

  // ---- step 5 ----
  async function doSave(status) {
    if (ctx.saving) return;
    const a = analyze();
    if (!a.valid) { ctx.flash = 'สเปกยังไม่ผ่านการตรวจ'; ctx.flashBad = true; render(); return; }
    const spec = { ...a.spec, sample_inputs: inputsToSample(a.spec, ctx.st.inputs) };
    ctx.saving = true;
    ctx.flash = 'กำลังบันทึก...';
    ctx.flashBad = false;
    render();
    let saved;
    try {
      saved = await api('formats.save', { spec, status });
    } catch (e) {
      if (!alive) return;
      ctx.saving = false;
      ctx.flash = 'บันทึกไม่สำเร็จ ' + errText(e);
      ctx.flashBad = true;
      render();
      return;
    }
    if (!alive) return;
    let exampleNote = '';
    if (ctx.st.saveExample && ctx.st.sourcePost.trim() !== '') {
      try {
        await api('examples.add', { owner: 'HOUSE', format_id: spec.id, title: spec.name, body: ctx.st.sourcePost });
      } catch (e) {
        exampleNote = 'บันทึกรูปแบบแล้ว แต่เก็บโพสต์ต้นแบบเป็นตัวอย่างไม่สำเร็จ ' + errText(e);
      }
    }
    if (!alive) return;
    clearTimeout(saveTimer);
    dirty = false;
    try { localStorage.removeItem(draftKey); } catch (e) { /* ignore */ }
    store.cacheSet('formats.list', null);
    ctx.saving = false;
    ctx.saved = { version: saved && saved.version, id: spec.id, exampleNote, status };
    ctx.flash = '';
    render();
  }

  function step5() {
    const st = ctx.st;
    const a = analyze();
    const errCount = a.valid ? 0 : Math.max(1, a.errors.length);
    const exCb = h('input', {
      type: 'checkbox', id: 'as-example', checked: st.saveExample,
      onchange: () => { st.saveExample = exCb.checked; touched(); },
    });
    const off = ctx.saving || errCount > 0 || !!ctx.saved;
    const body = [
      h('h1', null, 'บันทึก'),
      errCount > 0 ? h('p', { class: 'form-error' }, `สเปกยังมีข้อผิดพลาด ${errCount} ข้อ แก้ในขั้น "วางสเปก" ก่อน`) : null,
      h('label', { class: 'check-row', for: 'as-example' }, exCb, h('span', null, 'เก็บโพสต์ต้นแบบเป็นตัวอย่างของเพจ')),
      h('div', { class: 'save-buttons' },
        h('button', { type: 'button', class: 'btn btn-block', disabled: off, onclick: () => doSave('draft') }, 'บันทึกเป็นร่าง'),
        h('button', { type: 'button', class: 'btn btn-primary btn-block', disabled: off, onclick: () => doSave('published') }, 'เปิดให้ทุกคนใช้')),
      h('p', { class: ctx.flashBad ? 'form-error' : 'muted', role: 'status', 'aria-live': 'polite' }, ctx.flash),
    ];
    if (ctx.saved) {
      body.push(h('div', { class: 'save-done', role: 'status' },
        h('p', null, `บันทึกแล้ว v${ctx.saved.version === undefined ? '?' : ctx.saved.version}`),
        ctx.saved.exampleNote ? h('p', { class: 'form-error' }, ctx.saved.exampleNote) : null,
        h('div', { class: 'btn-row' },
          h('a', { class: 'btn', href: '#/admin/formats' }, 'ไปหน้ารูปแบบ'),
          h('a', { class: 'btn', href: '#/new/' + encodeURIComponent(ctx.saved.id) }, 'ลองเขียนโพสต์ด้วยรูปแบบนี้'))));
    }
    return {
      body,
      bar: actionBar([h('button', { type: 'button', class: 'btn', onclick: () => goto(4) }, 'ย้อนกลับ')]),
    };
  }

  function render() {
    if (!alive) return;
    const builders = [null, step1, step2, step3, step4, step5];
    const built = builders[ctx.st.step]();
    shell([stepper(), built.body]);
    el.appendChild(built.bar);
  }
}

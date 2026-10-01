// Step 4: paste area + live number check + highlighted preview + one-tap fixes.
import { h, clear } from './dom.js';
import { checkPost, autofix } from './engine/index.js';

function formulaLabel(spec, key) {
  const f = (spec.formulas || []).find((x) => x.key === key);
  return f ? f.label : key;
}

function caseLabel(spec, id) {
  const c = (spec.cases || []).find((x) => x.id === id);
  return c ? c.label : '';
}

// Split text into plain/mismatch/unverified segments (non-overlapping, sorted).
export function buildSegments(text, issues) {
  const marks = issues
    .filter((i) => (i.type === 'mismatch' || i.type === 'unverified') && Number.isFinite(i.start))
    .sort((a, b) => a.start - b.start || (a.type === 'mismatch' ? -1 : 1));
  const out = [];
  let pos = 0;
  for (const m of marks) {
    if (m.start < pos) continue;
    if (m.start > pos) out.push({ text: text.slice(pos, m.start), kind: null });
    out.push({ text: text.slice(m.start, m.end), kind: m.type });
    pos = m.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), kind: null });
  return out;
}

// ctx: { spec, state, getResult(), getInputs(), onChange(), onCheck(report) }
export function renderChecker(ctx) {
  const { spec, state } = ctx;
  let timer = null;
  let report = null;

  const textarea = h('textarea', {
    class: 'input big-text', id: 'post-body', rows: '12', 'aria-label': 'วางโพสต์จาก AI ที่นี่',
    placeholder: 'วางโพสต์จาก AI ที่นี่',
  });
  textarea.value = state.body || '';
  const statusEl = h('p', { class: 'check-status', 'aria-live': 'polite' });
  const previewEl = h('div', { class: 'preview', 'aria-label': 'ตัวอย่างโพสต์พร้อมไฮไลต์' });
  const issuesEl = h('div', { class: 'issues' });

  function applyFix(issues) {
    const fixed = autofix(state.body, issues);
    state.body = fixed;
    textarea.value = fixed;
    ctx.onChange();
    run();
  }

  function run() {
    const body = state.body || '';
    if (body.trim() === '') {
      report = null;
      clear(statusEl); clear(previewEl); clear(issuesEl);
      statusEl.appendChild(document.createTextNode('ยังไม่มีโพสต์ให้ตรวจ'));
      if (ctx.onCheck) ctx.onCheck(null);
      return;
    }
    const result = ctx.getResult();
    if (!result) { clear(statusEl); statusEl.appendChild(document.createTextNode('ยังไม่มีผลคำนวณให้ตรวจ')); return; }
    report = checkPost(body, spec, result, ctx.getInputs());
    const s = report.stats;
    const mism = report.issues.filter((i) => i.type === 'mismatch');
    const miss = report.issues.filter((i) => i.type === 'missing');
    clear(statusEl);
    statusEl.appendChild(document.createTextNode(
      `ตัวเลขตรง ${s.ok} จุด · ไม่ตรง ${s.mismatch} จุด · ไม่พบในโพสต์ ${s.missing} · ตรวจไม่ได้ ${s.unverified}`));
    statusEl.classList.toggle('has-bad', s.mismatch > 0);

    clear(previewEl);
    for (const seg of buildSegments(body, report.issues)) {
      if (!seg.kind) previewEl.appendChild(document.createTextNode(seg.text));
      else previewEl.appendChild(h('span', { class: seg.kind === 'mismatch' ? 'hl-bad' : 'hl-unv' }, seg.text));
    }

    clear(issuesEl);
    if (mism.length >= 2) {
      issuesEl.appendChild(h('button', { type: 'button', class: 'btn btn-primary', onclick: () => applyFix(mism) }, 'แก้ทั้งหมด'));
    }
    for (const i of mism) {
      const cl = i.caseId ? caseLabel(spec, i.caseId) : '';
      const head = (cl ? cl + ' · ' : '') + formulaLabel(spec, i.checkKey);
      issuesEl.appendChild(h('div', { class: 'issue' },
        h('p', null, `${head}: เขียน `, h('span', { class: 'num bad' }, i.raw), ' ควรเป็น ', h('span', { class: 'num' }, i.expectedText)),
        h('button', { type: 'button', class: 'btn', onclick: () => applyFix([i]) }, 'แก้ให้')));
    }
    if (miss.length) {
      issuesEl.appendChild(h('ul', { class: 'info-list' }, miss.map((i) => {
        const cl = i.caseId ? caseLabel(spec, i.caseId) : '';
        return h('li', { class: 'muted' }, `ไม่พบ ${cl ? cl + ' · ' : ''}${formulaLabel(spec, i.checkKey)}`);
      })));
    }
    if (ctx.onCheck) ctx.onCheck(report);
  }

  textarea.addEventListener('input', () => {
    state.body = textarea.value;
    ctx.onChange();
    clearTimeout(timer);
    timer = setTimeout(run, 400);
  });

  const node = h('div', { class: 'checker' },
    h('label', { class: 'field-label', for: 'post-body' }, 'วางโพสต์จาก AI ที่นี่'),
    textarea, statusEl, previewEl, issuesEl);
  run();
  return { node, dispose: () => clearTimeout(timer), recheck: run, getReport: () => report };
}

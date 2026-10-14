// Shared: Copy-Prompt flow to update a Style DNA from example posts. The app never calls an AI API.
import { h, clear } from '../dom.js';
import { api } from '../api.js';
import { copyText } from '../clipboard.js';
import { buildDnaPrompt, parseDnaAnswer, diffDna } from '../prompt/build-dna.js';
import { SECTIONS, errMsg } from './dna-editor.js';

const AI_LINKS = [
  { label: 'เปิด Gemini', href: 'https://gemini.google.com/app' },
  { label: 'เปิด Claude', href: 'https://claude.ai/new' },
  { label: 'เปิด ChatGPT', href: 'https://chatgpt.com/' },
];

function listOf(v) {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}

// editor = return value of renderDnaEditor (state + reload + onLoaded)
export function renderDnaUpdate({ scope, ownerForExamples, isHouse, displayName, editor }) {
  const root = h('div', { class: 'dna-update' });
  const ctx = {
    examples: null, loadError: '', checked: new Set(), parsed: null, proposed: null,
    answer: '', copied: '', parseError: '', saveMsg: '', saveErr: '', saving: false, open: false,
  };

  function usedIds() {
    const used = new Set();
    for (const v of editor.state.history || []) {
      for (const id of Array.isArray(v.source_example_ids) ? v.source_example_ids : []) used.add(id);
    }
    return used;
  }

  async function loadExamples() {
    ctx.loadError = '';
    try {
      const list = await api('examples.list', { owner: ownerForExamples });
      ctx.examples = Array.isArray(list) ? list : [];
      const used = usedIds();
      ctx.checked = new Set(ctx.examples.filter((e) => !used.has(e.example_id)).map((e) => e.example_id));
    } catch (e) {
      if (e && e.code === 'UNAUTHORIZED') return;
      ctx.loadError = errMsg(e);
      ctx.examples = null;
    }
    draw();
  }

  function selected() {
    return (ctx.examples || []).filter((e) => ctx.checked.has(e.example_id));
  }

  function currentDna() {
    return editor.state.current || isHouse ? editor.state.dna : null;
  }

  function promptText() {
    return buildDnaPrompt({
      scope, isHouse, displayName, currentDna: currentDna(),
      examples: selected().map((e) => ({ example_id: e.example_id, title: e.title, body: e.body })),
    });
  }

  function examplePicker() {
    const used = usedIds();
    const box = h('div', { class: 'list' });
    for (const e of ctx.examples) {
      const cb = h('input', { type: 'checkbox', id: `dnaex-${scope}-${e.example_id}` });
      cb.checked = ctx.checked.has(e.example_id);
      cb.addEventListener('change', () => {
        if (cb.checked) ctx.checked.add(e.example_id); else ctx.checked.delete(e.example_id);
        ctx.copied = '';
        draw();
      });
      box.appendChild(h('label', { class: 'check-row', for: cb.id }, cb,
        h('span', null, e.title, used.has(e.example_id) ? h('span', { class: 'pill' }, 'เคยใช้สอนแล้ว') : null)));
    }
    return box;
  }

  function diffView() {
    const diffs = diffDna(editor.state.dna, ctx.proposed);
    const box = h('div', { class: 'diff' });
    const hasHouse = isHouse;
    let any = false;
    for (const d of diffs) {
      const sec = SECTIONS.find((s) => s.key === d.field);
      if (!sec || (sec.houseOnly && !hasHouse)) continue;
      if (!d.changed) continue;
      any = true;
      if (d.field === 'voice') {
        box.appendChild(h('div', { class: 'diff-field' }, h('h4', { class: 'sub-h' }, sec.label),
          h('p', { class: 'diff-old' }, h('span', { class: 'diff-tag' }, 'เดิม'), ' ', editor.state.dna.voice || 'ยังไม่มี'),
          h('p', { class: 'diff-new' }, h('span', { class: 'diff-tag' }, 'ใหม่'), ' ', ctx.proposed.voice || 'ยังไม่มี')));
        continue;
      }
      const oldL = listOf(editor.state.dna[d.field]);
      const newL = listOf(ctx.proposed[d.field]);
      box.appendChild(h('div', { class: 'diff-field' }, h('h4', { class: 'sub-h' }, sec.label),
        h('div', { class: 'diff-cols' },
          h('div', null, h('p', { class: 'diff-tag' }, 'เดิม'),
            oldL.length ? h('ul', { class: 'diff-list' }, oldL.map((x) => d.removed.includes(x)
              ? h('li', { class: 'diff-removed' }, '− ' + x) : h('li', null, x))) : h('p', { class: 'muted' }, 'ยังไม่มี')),
          h('div', null, h('p', { class: 'diff-tag' }, 'ใหม่'),
            newL.length ? h('ul', { class: 'diff-list' }, newL.map((x) => d.added.includes(x)
              ? h('li', { class: 'diff-added' }, '+ ' + x) : h('li', null, x))) : h('p', { class: 'muted' }, 'ยังไม่มี')))));
    }
    if (!any) box.appendChild(h('p', { class: 'muted' }, 'คำตอบนี้ไม่ได้เปลี่ยนอะไรจากสไตล์ปัจจุบัน'));
    return box;
  }

  function draw() {
    clear(root);
    if (!ctx.open) {
      root.appendChild(h('div', { class: 'btn-row' },
        h('button', {
          type: 'button', class: 'btn',
          onclick: () => { ctx.open = true; ctx.examples = null; draw(); loadExamples(); },
        }, 'อัปเดตสไตล์จากตัวอย่างโพสต์')));
      if (ctx.saveMsg) root.appendChild(h('p', { class: 'ok-text', role: 'status', 'aria-live': 'polite' }, ctx.saveMsg));
      return;
    }
    root.appendChild(h('h3', { class: 'sub-h' }, 'อัปเดตสไตล์จากตัวอย่างโพสต์'));
    if (ctx.loadError) {
      root.appendChild(h('div', { class: 'empty' }, h('p', null, 'โหลดตัวอย่างไม่สำเร็จ: ' + ctx.loadError),
        h('button', { type: 'button', class: 'btn', onclick: loadExamples }, 'ลองใหม่')));
      return;
    }
    if (!ctx.examples) { root.appendChild(h('p', { class: 'muted' }, 'กำลังโหลด...')); return; }
    if (ctx.examples.length === 0) {
      root.appendChild(h('p', { class: 'muted' }, 'ยังไม่มีตัวอย่างโพสต์ — เพิ่มตัวอย่างในคลังด้านล่างก่อน'));
      return;
    }

    root.appendChild(h('p', null, '1. เลือกโพสต์ตัวอย่างที่จะให้ AI เรียนรู้'));
    root.appendChild(examplePicker());

    const n = ctx.checked.size;
    const copyMsg = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' }, ctx.copied);
    const linksEl = h('div', { class: 'btn-row', hidden: !ctx.copied });
    for (const l of AI_LINKS) linksEl.appendChild(h('a', { class: 'btn', href: l.href, target: '_blank', rel: 'noopener noreferrer' }, l.label));
    const copyBtn = h('button', { type: 'button', class: 'btn btn-primary', disabled: n === 0 }, 'คัดลอก prompt');
    copyBtn.addEventListener('click', async () => {
      const text = promptText();
      const ok = await copyText(text);
      copyMsg.textContent = ok ? `คัดลอกแล้ว (${text.length} ตัวอักษร)` : 'คัดลอกไม่สำเร็จ — เปิด "ดู prompt" แล้วคัดลอกเอง';
      ctx.copied = ok ? copyMsg.textContent : '';
      linksEl.hidden = !ok;
    });
    const pre = h('pre', { class: 'prompt-pre' });
    const details = h('details', { class: 'prompt-details' }, h('summary', null, 'ดู prompt'), pre);
    details.addEventListener('toggle', () => { if (details.open) pre.textContent = n ? promptText() : ''; });
    root.appendChild(h('p', null, '2. คัดลอก prompt ไปวางใน AI'));
    if (n === 0) root.appendChild(h('p', { class: 'form-error' }, 'เลือกอย่างน้อย 1 โพสต์'));
    root.appendChild(h('div', { class: 'btn-row' }, copyBtn));
    root.appendChild(copyMsg);
    root.appendChild(linksEl);
    root.appendChild(details);

    root.appendChild(h('p', null, '3. วางคำตอบจาก AI'));
    const ta = h('textarea', { class: 'input json-text', id: `dna-answer-${scope}`, rows: '8', 'aria-label': 'วางคำตอบจาก AI' });
    ta.value = ctx.answer;
    const errEl = h('p', { class: 'form-error', role: 'alert' }, ctx.parseError);
    const checkBtn = h('button', { type: 'button', class: 'btn' }, 'ตรวจคำตอบ');
    checkBtn.addEventListener('click', () => {
      ctx.answer = ta.value;
      ctx.saveErr = '';
      const titleMap = {};
      for (const e of ctx.examples) titleMap[e.example_id] = e.title;
      const r = parseDnaAnswer(ctx.answer, { isHouse, titleMap });
      if (!r.ok) { ctx.parseError = r.error; ctx.parsed = null; ctx.proposed = null; draw(); return; }
      ctx.parseError = '';
      ctx.parsed = r;
      ctx.proposed = Object.assign({}, editor.state.dna, r.dna);
      for (const k of Object.keys(ctx.proposed)) {
        if (!isHouse && (k === 'number_rules' || k === 'hashtags')) delete ctx.proposed[k];
      }
      draw();
    });
    root.appendChild(ta);
    root.appendChild(errEl);
    root.appendChild(h('div', { class: 'btn-row' }, checkBtn));

    if (ctx.parsed) {
      root.appendChild(h('p', null, '4. ตรวจสอบสิ่งที่เปลี่ยน'));
      root.appendChild(diffView());
      root.appendChild(h('h4', { class: 'sub-h' }, 'changelog'));
      root.appendChild(h('pre', { class: 'prompt-pre' }, ctx.parsed.changelogText));
      const saveErr = h('p', { class: 'form-error', role: 'alert' }, ctx.saveErr);
      const save = h('button', { type: 'button', class: 'btn btn-primary', disabled: ctx.saving || n === 0 }, 'บันทึกเป็นเวอร์ชันใหม่');
      save.addEventListener('click', async () => {
        ctx.saving = true; ctx.saveErr = '';
        save.disabled = true;
        try {
          const saved = await api('styledna.save', {
            scope, dna: ctx.proposed, changelog: ctx.parsed.changelogText,
            source_example_ids: [...ctx.checked],
          });
          ctx.saveMsg = `บันทึก v${saved && saved.version !== undefined ? saved.version : '?'} แล้ว`;
          ctx.open = false; ctx.parsed = null; ctx.proposed = null; ctx.answer = ''; ctx.copied = ''; ctx.saving = false;
          draw();
          editor.reload();
        } catch (e) {
          ctx.saving = false;
          if (e && e.code === 'UNAUTHORIZED') return;
          ctx.saveErr = errMsg(e);
          saveErr.textContent = ctx.saveErr;
          save.disabled = false;
        }
      });
      root.appendChild(saveErr);
      root.appendChild(h('div', { class: 'btn-row' }, save));
    }
    root.appendChild(h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'link-btn', onclick: () => { ctx.open = false; draw(); } }, 'ปิด')));
  }

  editor.onLoaded(() => {
    // used-example labels depend on history; refresh the picker if it is open
    if (ctx.open && ctx.examples && !ctx.parsed) loadExamples();
  });
  draw();
  return root;
}

// Renders a compute() result from the spec. Also reused by the post view.
import { h } from './dom.js';
import { verdictColor, parseSummary } from './format-th.js';

function numberish(text) {
  const out = [];
  for (const part of String(text).split(/(\d[\d,.]*)/)) {
    if (part === '') continue;
    out.push(/^\d/.test(part) ? h('span', { class: 'num' }, part) : document.createTextNode(part));
  }
  return out;
}

export function summaryNode(text) {
  const wrap = h('p', { class: 'result-summary' });
  for (const seg of parseSummary(text)) {
    if (seg.verdict) {
      const span = h('span', { class: 'verdict' }, seg.text);
      span.style.color = verdictColor(seg.verdict);
      wrap.appendChild(span);
    } else {
      for (const n of numberish(seg.text)) wrap.appendChild(n);
    }
  }
  return wrap;
}

function pill(text) {
  const color = verdictColor(text);
  const el = h('span', { class: 'verdict-pill' }, text);
  if (color) { el.style.color = color; el.style.borderColor = color; }
  return el;
}

function valueNode(row, verdictKey) {
  if (verdictKey && row.key === verdictKey) return pill(row.text);
  return h('span', { class: 'num' }, row.text);
}

// result: compute() output; spec: format spec.
export function renderResults(result, spec) {
  const verdictKey = spec && spec.summary ? spec.summary.per_case_key : null;
  const root = h('div', { class: 'results' });
  if (result.summary) root.appendChild(summaryNode(result.summary));

  if ((result.global || []).length) {
    root.appendChild(h('h2', { class: 'sub-h' }, 'ผลรวม'));
    root.appendChild(h('table', { class: 'grid kv' },
      h('tbody', null, result.global.map((r) => h('tr', null, h('th', { scope: 'row' }, r.label), h('td', { class: 'num-cell' }, valueNode(r, null)))))));
  }

  const cases = result.cases || [];
  if (cases.length) {
    // Wide screens: one table, rows = formulas, columns = cases.
    const labels = [];
    const seen = new Set();
    for (const c of cases) for (const r of c.rows) if (!seen.has(r.key)) { seen.add(r.key); labels.push({ key: r.key, label: r.label }); }
    const rowOf = (c, key) => c.rows.find((r) => r.key === key);
    root.appendChild(h('h2', { class: 'sub-h' }, 'ผลแต่ละเคส'));
    root.appendChild(h('div', { class: 'table-wrap case-table' },
      h('table', { class: 'grid' },
        h('thead', null, h('tr', null, h('th', null, ''), cases.map((c) => h('th', { class: 'num-cell' }, c.label)))),
        h('tbody', null, labels.map((l) => h('tr', null,
          h('th', { scope: 'row' }, l.label),
          cases.map((c) => {
            const r = rowOf(c, l.key);
            return h('td', { class: 'num-cell' }, r ? valueNode(r, verdictKey) : '');
          })))))));
    // Narrow screens: one block per case.
    root.appendChild(h('div', { class: 'case-blocks' }, cases.map((c) => h('section', { class: 'case-block' },
      h('h3', null, c.label),
      h('table', { class: 'grid kv' },
        h('tbody', null, c.rows.map((r) => h('tr', null, h('th', { scope: 'row' }, r.label), h('td', { class: 'num-cell' }, valueNode(r, verdictKey))))))))));
  }

  if (spec && Array.isArray(spec.notes) && spec.notes.length) {
    root.appendChild(h('h2', { class: 'sub-h' }, 'ข้อสังเกต'));
    root.appendChild(h('ul', { class: 'notes' }, spec.notes.map((n) => h('li', null, n))));
  }
  return root;
}

// Fallback when the spec is not available: only the stored summary + display strings.
export function renderStoredResults(results) {
  const root = h('div', { class: 'results' });
  if (!results) return root;
  if (results.summary) root.appendChild(summaryNode(results.summary));
  const entries = Object.entries(results.display || {});
  if (entries.length) {
    root.appendChild(h('table', { class: 'grid kv' },
      h('tbody', null, entries.map(([k, v]) => h('tr', null, h('th', { scope: 'row' }, k), h('td', { class: 'num-cell' }, h('span', { class: 'num' }, String(v))))))));
  }
  return root;
}

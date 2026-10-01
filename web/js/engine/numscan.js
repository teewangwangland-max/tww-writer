// numscan.js - Thai-text number scanner: scanNumbers, checkPost, autofix

import { formatNumberPart } from './format.js';

const UNIT_MAP = [
  ['พันล้าน', 1e9],
  ['ล้านบาท', 1e6],
  ['ล้าน', 1e6],
  ['ลบ.', 1e6],
  ['ล.', 1e6],
  ['MB', 1e6],
  ['แสน', 1e5],
  ['หมื่น', 1e4],
  ['พัน', 1e3],
  ['k', 1e3],
  ['K', 1e3],
  ['%', 1],
  ['เปอร์เซ็นต์', 1]
];

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const UNIT_ALT = UNIT_MAP.map(([u]) => escapeRe(u)).join('|');
const NUM_PATTERN = '\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?';
const TOKEN_RE = new RegExp(
  `(?:(ติดลบ)[ \\t]*)?([+\\-−–])?(${NUM_PATTERN})(?:[ \\t]*(${UNIT_ALT}))?`,
  'g'
);

function unitMultiplier(unit) {
  if (!unit) return { multiplier: 1, cls: 'amount' };
  const entry = UNIT_MAP.find(([u]) => u === unit);
  if (!entry) return { multiplier: 1, cls: 'amount' };
  const cls = (unit === '%' || unit === 'เปอร์เซ็นต์') ? 'percent' : 'amount';
  return { multiplier: entry[1], cls };
}

export function scanNumbers(text, opts = {}) {
  const markers = opts.markers || [];
  const chars = text.split('');
  const maskRange = (s, e) => {
    for (let i = s; i < e; i++) chars[i] = '_';
  };

  // 1. rai-ngan-wa patterns
  const raiRe = /\d+-\d+-\d+(?:\.\d+)?/g;
  let m;
  while ((m = raiRe.exec(text))) {
    maskRange(m.index, m.index + m[0].length);
  }
  // 2. hashtags
  const hashRe = /#\S+/g;
  while ((m = hashRe.exec(text))) {
    maskRange(m.index, m.index + m[0].length);
  }
  // 3. case marker occurrences (Latin case-insensitive)
  const lowerText = text.toLowerCase();
  for (const marker of markers) {
    if (!marker) continue;
    const lowerMarker = marker.toLowerCase();
    let idx = 0;
    while (true) {
      const found = lowerText.indexOf(lowerMarker, idx);
      if (found === -1) break;
      maskRange(found, found + marker.length);
      idx = found + marker.length;
    }
  }

  const maskedText = chars.join('');
  const tokens = [];
  TOKEN_RE.lastIndex = 0;
  let match;
  while ((match = TOKEN_RE.exec(maskedText))) {
    const [full, tidlopGroup, signGroup, numRaw, unitRaw] = match;
    if (!numRaw) {
      if (match.index === TOKEN_RE.lastIndex) TOKEN_RE.lastIndex++;
      continue;
    }
    const start = match.index;
    const end = start + full.length;
    let sign = 1;
    let signExplicit = false;
    if (tidlopGroup) {
      sign = -1;
      signExplicit = true;
    } else if (signGroup) {
      signExplicit = true;
      sign = signGroup === '+' ? 1 : -1;
    }
    const decimals = numRaw.includes('.') ? numRaw.split('.')[1].length : 0;
    const numClean = numRaw.replace(/,/g, '');
    const numValue = parseFloat(numClean);
    const { multiplier, cls } = unitMultiplier(unitRaw);
    const value = sign * numValue * multiplier;
    tokens.push({
      start, end, raw: text.slice(start, end), value, decimals, multiplier, cls, signExplicit
    });
    if (match.index === TOKEN_RE.lastIndex) TOKEN_RE.lastIndex++;
  }
  return tokens;
}

// ---------- helpers ----------

function findOccurrences(haystack, needle) {
  if (!needle) return [];
  const lowerHay = haystack.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const positions = [];
  let idx = 0;
  while (true) {
    const found = lowerHay.indexOf(lowerNeedle, idx);
    if (found === -1) break;
    positions.push(found);
    idx = found + needle.length;
  }
  return positions;
}

function buildZones(text, spec) {
  const occurrences = [];
  for (const c of spec.cases || []) {
    for (const marker of c.markers || []) {
      for (const pos of findOccurrences(text, marker)) {
        occurrences.push({ pos, caseId: c.id });
      }
    }
  }
  occurrences.sort((a, b) => a.pos - b.pos);

  const zones = [];
  let currentCase = null;
  let currentStart = 0;
  for (const occ of occurrences) {
    if (occ.caseId !== currentCase) {
      zones.push({ caseId: currentCase, start: currentStart, end: occ.pos });
      currentCase = occ.caseId;
      currentStart = occ.pos;
    }
  }
  zones.push({ caseId: currentCase, start: currentStart, end: text.length });
  // zones with caseId null represent the "global" zone segments
  return zones.map((z) => ({ ...z, caseId: z.caseId === null ? 'global' : z.caseId }));
}

function zoneForPos(zones, pos) {
  for (const z of zones) {
    if (pos >= z.start && pos < z.end) return z;
  }
  return zones[zones.length - 1];
}

function isPercentFormat(fmt) {
  return !!fmt && fmt.type === 'percent';
}

function tokenClassCompatible(token, fmt) {
  return isPercentFormat(fmt) ? token.cls === 'percent' : token.cls === 'amount';
}

function withinTolerance(token, expected) {
  const threshold = 0.5 * Math.pow(10, -token.decimals) * token.multiplier + 1e-9 * Math.max(1, Math.abs(expected));
  const direct = Math.abs(token.value - expected) <= threshold;
  if (direct) return true;
  if (!token.signExplicit) {
    return Math.abs(Math.abs(token.value) - Math.abs(expected)) <= threshold;
  }
  return false;
}

function matchesAnyKnown(token, knownValues) {
  for (const v of knownValues) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (withinTolerance(token, v)) return true;
  }
  return false;
}

function flattenNumericInputs(spec, inputs) {
  const out = [];
  inputs = inputs || {};
  for (const field of spec.fields || []) {
    const raw = inputs[field.key];
    if (field.type === 'number') {
      if (raw === undefined || raw === null || raw === '') continue;
      const n = typeof raw === 'string' ? Number(raw.replace(/,/g, '')) : Number(raw);
      if (Number.isFinite(n)) out.push(n);
    } else if (field.type === 'rai_ngan_wa') {
      if (raw === undefined || raw === null) continue;
      let rai, ngan, wa;
      if (typeof raw === 'string') {
        const parts = raw.split('-');
        rai = Number(parts[0] || 0);
        ngan = Number(parts[1] || 0);
        wa = Number(parts[2] || 0);
      } else {
        rai = Number(raw.rai || 0);
        ngan = Number(raw.ngan || 0);
        wa = Number(raw.wa || 0);
      }
      out.push(rai, ngan, wa);
    } else if (field.type === 'comps_table') {
      const rows = Array.isArray(raw) ? raw : [];
      for (const row of rows) {
        const p = Number(row.price_per_sqm);
        if (Number.isFinite(p)) out.push(p);
      }
    }
  }
  return out;
}

function caseTableValues(spec, inputs, caseId) {
  const out = [];
  inputs = inputs || {};
  const tableField = (spec.fields || []).find((f) => f.type === 'case_table');
  if (!tableField) return out;
  const raw = inputs[tableField.key] || {};
  const caseDef = (spec.cases || []).find((c) => c.id === caseId);
  for (const col of tableField.columns || []) {
    let v = raw[caseId] ? raw[caseId][col.key] : undefined;
    if (v === undefined && caseDef && caseDef.inputs) v = caseDef.inputs[col.key];
    if (v !== undefined) {
      const n = Number(v);
      if (Number.isFinite(n)) out.push(n);
    }
  }
  return out;
}

function buildKnownValues(spec, result, inputs) {
  const globalKnown = [];
  const perCaseKnown = {};
  const caseIds = (spec.cases || []).map((c) => c.id);
  for (const id of caseIds) perCaseKnown[id] = [];

  for (const [key, value] of Object.entries(result.values || {})) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const dotIdx = key.indexOf('.');
    if (dotIdx === -1) {
      globalKnown.push(value);
    } else {
      const caseId = key.slice(0, dotIdx);
      if (perCaseKnown[caseId]) perCaseKnown[caseId].push(value);
    }
  }

  for (const n of flattenNumericInputs(spec, inputs)) globalKnown.push(n);
  for (const id of caseIds) {
    for (const n of caseTableValues(spec, inputs, id)) perCaseKnown[id].push(n);
  }

  const allCasesCombined = [];
  for (const id of caseIds) allCasesCombined.push(...perCaseKnown[id]);

  return {
    forZone(caseId) {
      if (caseId === 'global') return [...globalKnown, ...allCasesCombined];
      return [...globalKnown, ...(perCaseKnown[caseId] || [])];
    }
  };
}

export function checkPost(text, spec, result, inputs) {
  const zones = buildZones(text, spec);
  const allTokens = scanNumbers(text, { markers: (spec.cases || []).flatMap((c) => c.markers || []) });
  const known = buildKnownValues(spec, result, inputs);

  const issues = [];
  const seenSpans = new Set();
  const stats = { checked: 0, ok: 0, mismatch: 0, missing: 0, unverified: 0 };

  function addIssue(issue) {
    const spanKey = `${issue.start}-${issue.end}`;
    if (issue.type === 'mismatch') {
      if (seenSpans.has(spanKey)) return;
      seenSpans.add(spanKey);
    }
    issues.push(issue);
    stats[issue.type] = (stats[issue.type] || 0) + 1;
  }

  function tokensInRange(rangeStart, rangeEnd) {
    return allTokens.filter((t) => t.start >= rangeStart && t.end <= rangeEnd);
  }

  function sameLine(pos1, pos2) {
    const lo = Math.min(pos1, pos2);
    const hi = Math.max(pos1, pos2);
    return !text.slice(lo, hi).includes('\n');
  }

  function computeExpectedText(expected, token, formula) {
    const fmt = formula.format || {};
    const pseudoFmt = {
      type: fmt.type === 'int' ? 'int' : (fmt.type === 'text' ? 'text' : 'number'),
      dp: fmt.dp,
      trim: fmt.trim !== undefined ? fmt.trim : true,
      signed: false,
      suffix: ''
    };
    return formatNumberPart(expected / token.multiplier, pseudoFmt);
  }

  function processCheck(check) {
    const formula = (spec.formulas || []).find((f) => !f.module && f.key === check.key);
    if (!formula) return;
    const isPerCase = !!check.per_case;
    const caseIds = (spec.cases || []).map((c) => c.id);

    let anyCandidateFound = false;

    const targets = isPerCase ? caseIds : ['__global__'];

    for (const target of targets) {
      stats.checked++;
      let targetOk = false;
      let targetBad = false;
      const expected = isPerCase ? result.values[`${target}.${check.key}`] : result.values[check.key];
      const scanZones = isPerCase ? zones.filter((z) => z.caseId === target) : zones;

      for (const keyword of check.keywords || []) {
        for (const zone of scanZones) {
          const zoneText = text.slice(zone.start, zone.end);
          const positions = findOccurrences(zoneText, keyword).map((p) => p + zone.start);
          for (const pos of positions) {
            const keywordEnd = pos + keyword.length;
            const rangeEnd = Math.min(text.length, keywordEnd + 60);
            let candidates = tokensInRange(keywordEnd, rangeEnd).filter((t) => t.start >= keywordEnd);
            candidates = candidates.filter((t) => sameLine(keywordEnd, t.start));
            candidates = candidates.filter((t) => tokenClassCompatible(t, formula.format));
            candidates.sort((a, b) => a.start - b.start);
            if (candidates.length === 0) continue;
            anyCandidateFound = true;

            const zoneForKeyword = zoneForPos(zones, pos);
            const zoneKnown = known.forZone(zoneForKeyword.caseId);

            const matchToken = candidates.find((t) => typeof expected === 'number' && withinTolerance(t, expected));
            if (matchToken) {
              targetOk = true;
              continue;
            }
            // does every candidate match some other known value?
            const allIgnorable = candidates.every((t) => matchesAnyKnown(t, zoneKnown));
            if (allIgnorable) {
              continue;
            }
            const bad = candidates.find((t) => !matchesAnyKnown(t, zoneKnown));
            if (bad && typeof expected === 'number') {
              targetBad = true;
              const expectedText = computeExpectedText(expected, bad, formula);
              addIssue({
                severity: 'error',
                type: 'mismatch',
                checkKey: check.key,
                caseId: isPerCase ? target : undefined,
                start: bad.start,
                end: bad.end,
                raw: bad.raw,
                expected,
                expectedText,
                message: `Expected ${check.key}${isPerCase ? ` (${target})` : ''} ≈ ${expected}, found "${bad.raw}"`
              });
            }
          }
        }
      }
      // a check-target counts as OK only when it matched somewhere and had no mismatch
      if (targetOk && !targetBad) stats.ok++;
    }

    if (!anyCandidateFound) {
      if (isPerCase) {
        for (const target of caseIds) {
          addIssue({ severity: 'info', type: 'missing', checkKey: check.key, caseId: target });
        }
      } else {
        addIssue({ severity: 'info', type: 'missing', checkKey: check.key });
      }
    }
  }

  const allChecks = spec.checks || [];
  const orderedChecks = [...allChecks.filter((c) => c.per_case), ...allChecks.filter((c) => !c.per_case)];
  for (const check of orderedChecks) {
    processCheck(check);
  }

  // step 5: unverified warnings
  const mismatchSpans = new Set(issues.filter((i) => i.type === 'mismatch').map((i) => `${i.start}-${i.end}`));
  for (const token of allTokens) {
    const isCandidateForWarn = (token.cls === 'amount' && token.multiplier >= 1e6) || token.cls === 'percent';
    if (!isCandidateForWarn) continue;
    const spanKey = `${token.start}-${token.end}`;
    if (mismatchSpans.has(spanKey)) continue;
    const zone = zoneForPos(zones, token.start);
    const zoneKnown = known.forZone(zone.caseId);
    if (!matchesAnyKnown(token, zoneKnown)) {
      addIssue({ severity: 'warn', type: 'unverified', start: token.start, end: token.end, raw: token.raw });
    }
  }

  return { issues, stats };
}

export function autofix(text, issues) {
  const mismatches = issues.filter((i) => i.type === 'mismatch').slice().sort((a, b) => b.start - a.start);
  let out = text;
  const prefixRe = new RegExp(`^(ติดลบ\\s*|[+\\-−–])?(${NUM_PATTERN})`);
  for (const issue of mismatches) {
    const m = prefixRe.exec(issue.raw);
    if (!m) continue;
    const signDigitsLen = m[0].length;
    const before = out.slice(0, issue.start);
    const unitPart = out.slice(issue.start + signDigitsLen, issue.end);
    const after = out.slice(issue.end);
    let replacement = issue.expectedText;
    const hadPlus = m[1] === '+';
    if (hadPlus && !replacement.startsWith('-')) {
      replacement = '+' + replacement;
    }
    out = before + replacement + unitPart + after;
  }
  return out;
}

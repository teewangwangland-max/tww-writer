const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// Asia/Bangkok = UTC+7, no DST; offset applied manually.
export function thaiShortDate(iso) {
  const t = new Date(iso).getTime();
  if (!iso || Number.isNaN(t)) return '';
  const d = new Date(t + 7 * 3600 * 1000);
  const year = (d.getUTCFullYear() + 543) % 100;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${String(year).padStart(2, '0')}`;
}

const STATUS = { draft: 'ร่าง', ready: 'พร้อมโพสต์', posted: 'โพสต์แล้ว' };
export function postStatusLabel(s) {
  return Object.prototype.hasOwnProperty.call(STATUS, s) ? STATUS[s] : s;
}

const VERDICT = { 'ไม่รอด': '#B3261E', 'รอด': '#4F6128', 'คุ้ม': '#2F3B14' };
export function verdictColor(word) {
  return Object.prototype.hasOwnProperty.call(VERDICT, word) ? VERDICT[word] : null;
}

// Split on verdict words; "ไม่รอด" is matched before "รอด".
export function parseSummary(text) {
  const out = [];
  const s = String(text == null ? '' : text);
  const re = /ไม่รอด|รอด|คุ้ม/g;
  let last = 0;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push({ text: s.slice(last, m.index), verdict: null });
    out.push({ text: m[0], verdict: m[0] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last), verdict: null });
  return out;
}

// format.js - display formatting + roundHalfUp

export function roundHalfUp(x, dp) {
  const f = 10 ** dp;
  return Math.sign(x) * Math.round(Math.abs(x) * f * (1 + 1e-12) + 1e-9) / f;
}

export function scaleOf(fmt) {
  if (!fmt || !fmt.type) return 1;
  if (fmt.type === 'million') return 1e6;
  if (fmt.type === 'thousand') return 1e3;
  return 1;
}

function withDefaults(fmt) {
  const type = fmt && fmt.type ? fmt.type : 'number';
  return {
    type,
    dp: fmt && fmt.dp !== undefined ? fmt.dp : 0,
    trim: fmt && fmt.trim !== undefined ? fmt.trim : true,
    signed: fmt && fmt.signed !== undefined ? fmt.signed : false,
    suffix: fmt && fmt.suffix !== undefined ? fmt.suffix : ''
  };
}

function addThousandsCommas(intStr) {
  const neg = intStr.startsWith('-');
  const digits = neg ? intStr.slice(1) : intStr;
  const withCommas = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + withCommas;
}

export function formatNumberPart(value, fmt) {
  const f = withDefaults(fmt);
  if (f.type === 'text') {
    return String(value);
  }
  const scale = scaleOf(f);
  let v = Number(value) / scale;
  const dp = f.type === 'int' ? 0 : f.dp;
  let rounded = roundHalfUp(v, dp);
  if (Object.is(rounded, -0)) rounded = 0;
  const neg = rounded < 0;
  const abs = Math.abs(rounded);
  let str = abs.toFixed(dp);
  let intPart, fracPart;
  if (str.includes('.')) {
    [intPart, fracPart] = str.split('.');
  } else {
    intPart = str;
    fracPart = '';
  }
  if (f.trim && fracPart) {
    fracPart = fracPart.replace(/0+$/, '');
  }
  intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  let result = intPart + (fracPart ? '.' + fracPart : '');
  let sign = '';
  if (neg) {
    sign = '-';
  } else if (f.signed && rounded > 0) {
    sign = '+';
  }
  return sign + result;
}

export function formatValue(value, fmt) {
  const f = withDefaults(fmt);
  return formatNumberPart(value, fmt) + (f.suffix || '');
}

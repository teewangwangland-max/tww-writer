// expr.js - safe expression tokenizer + parser (AST) + evaluator
// No eval, no Function, no with. Pure ESM.

export class ExprError extends Error {
  constructor(code, message, extra = {}) {
    super(message || code);
    this.code = code;
    if (extra.pos !== undefined) this.pos = extra.pos;
    if (extra.ident !== undefined) this.ident = extra.ident;
  }
}

const MAX_LEN = 500;
const MAX_DEPTH = 50;

const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

const WHITELISTED_FUNCS = new Set([
  'round', 'floor', 'ceil', 'abs', 'min', 'max', 'if', 'sum', 'avg'
]);

// ---------- Tokenizer ----------

const TOKEN_TYPES = {
  NUMBER: 'NUMBER',
  STRING: 'STRING',
  IDENT: 'IDENT',
  OP: 'OP',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  COMMA: 'COMMA',
  EOF: 'EOF'
};

function tokenize(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;

  function isDigit(c) { return c >= '0' && c <= '9'; }
  function isIdentStart(c) { return /[A-Za-z_]/.test(c); }
  function isIdentPart(c) { return /[A-Za-z0-9_]/.test(c); }

  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    const start = i;
    if (isDigit(c)) {
      let j = i;
      while (j < n && isDigit(src[j])) j++;
      if (src[j] === '.' && isDigit(src[j + 1])) {
        j++;
        while (j < n && isDigit(src[j])) j++;
      }
      const raw = src.slice(i, j);
      tokens.push({ type: TOKEN_TYPES.NUMBER, value: parseFloat(raw), pos: start });
      i = j;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let strVal = '';
      let closed = false;
      while (j < n) {
        if (src[j] === '\\' && src[j + 1] === '"') {
          strVal += '"';
          j += 2;
          continue;
        }
        if (src[j] === '"') {
          closed = true;
          j++;
          break;
        }
        strVal += src[j];
        j++;
      }
      if (!closed) throw new ExprError('SYNTAX', `Unterminated string at ${start}`, { pos: start });
      tokens.push({ type: TOKEN_TYPES.STRING, value: strVal, pos: start });
      i = j;
      continue;
    }
    if (isIdentStart(c)) {
      let j = i;
      while (j < n && isIdentPart(src[j])) j++;
      let name = src.slice(i, j);
      // optional single dot segment
      if (src[j] === '.' && isIdentStart(src[j + 1])) {
        let k = j + 1;
        while (k < n && isIdentPart(src[k])) k++;
        name = src.slice(i, k);
        j = k;
      }
      tokens.push({ type: TOKEN_TYPES.IDENT, value: name, pos: start });
      i = j;
      continue;
    }
    if (c === '(') { tokens.push({ type: TOKEN_TYPES.LPAREN, pos: start }); i++; continue; }
    if (c === ')') { tokens.push({ type: TOKEN_TYPES.RPAREN, pos: start }); i++; continue; }
    if (c === ',') { tokens.push({ type: TOKEN_TYPES.COMMA, pos: start }); i++; continue; }

    // operators, longest match first
    const two = src.slice(i, i + 2);
    if (two === '||' || two === '&&' || two === '<=' || two === '>=' || two === '==' || two === '!=') {
      tokens.push({ type: TOKEN_TYPES.OP, value: two, pos: start });
      i += 2;
      continue;
    }
    if ('+-*/%^<>!'.includes(c)) {
      tokens.push({ type: TOKEN_TYPES.OP, value: c, pos: start });
      i++;
      continue;
    }
    throw new ExprError('SYNTAX', `Unexpected character "${c}" at ${start}`, { pos: start });
  }
  tokens.push({ type: TOKEN_TYPES.EOF, pos: n });
  return tokens;
}

// ---------- Parser (recursive descent) ----------

function checkIdentForbidden(name, pos) {
  const segs = name.split('.');
  for (const seg of segs) {
    if (FORBIDDEN_SEGMENTS.has(seg)) {
      throw new ExprError('FORBIDDEN_IDENT', `Forbidden identifier segment "${seg}"`, { pos, ident: name });
    }
  }
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
    this.depth = 0;
  }

  peek() { return this.tokens[this.pos]; }
  next() { return this.tokens[this.pos++]; }

  expect(type, msg) {
    const t = this.peek();
    if (t.type !== type) {
      throw new ExprError('SYNTAX', msg || `Expected ${type} at ${t.pos}`, { pos: t.pos });
    }
    return this.next();
  }

  enter() {
    this.depth++;
    if (this.depth > MAX_DEPTH) {
      throw new ExprError('TOO_COMPLEX', 'AST depth exceeds limit');
    }
  }
  leave() { this.depth--; }

  parseExpr() {
    return this.parseOr();
  }

  parseOr() {
    this.enter();
    let left = this.parseAnd();
    while (this.peek().type === TOKEN_TYPES.OP && this.peek().value === '||') {
      this.next();
      const right = this.parseAnd();
      left = { type: 'Logical', op: '||', left, right };
    }
    this.leave();
    return left;
  }

  parseAnd() {
    this.enter();
    let left = this.parseCmp();
    while (this.peek().type === TOKEN_TYPES.OP && this.peek().value === '&&') {
      this.next();
      const right = this.parseCmp();
      left = { type: 'Logical', op: '&&', left, right };
    }
    this.leave();
    return left;
  }

  parseCmp() {
    this.enter();
    let left = this.parseAdd();
    const t = this.peek();
    const cmpOps = ['<', '<=', '>', '>=', '==', '!='];
    if (t.type === TOKEN_TYPES.OP && cmpOps.includes(t.value)) {
      this.next();
      const right = this.parseAdd();
      left = { type: 'Binary', op: t.value, left, right };
    }
    this.leave();
    return left;
  }

  parseAdd() {
    this.enter();
    let left = this.parseMul();
    while (this.peek().type === TOKEN_TYPES.OP && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.next().value;
      const right = this.parseMul();
      left = { type: 'Binary', op, left, right };
    }
    this.leave();
    return left;
  }

  parseMul() {
    this.enter();
    let left = this.parseUnary();
    while (this.peek().type === TOKEN_TYPES.OP && ['*', '/', '%'].includes(this.peek().value)) {
      const op = this.next().value;
      const right = this.parseUnary();
      left = { type: 'Binary', op, left, right };
    }
    this.leave();
    return left;
  }

  parseUnary() {
    this.enter();
    const t = this.peek();
    if (t.type === TOKEN_TYPES.OP && (t.value === '-' || t.value === '+' || t.value === '!')) {
      this.next();
      const operand = this.parseUnary();
      this.leave();
      return { type: 'Unary', op: t.value, operand };
    }
    const result = this.parsePow();
    this.leave();
    return result;
  }

  parsePow() {
    this.enter();
    const left = this.parsePrimary();
    if (this.peek().type === TOKEN_TYPES.OP && this.peek().value === '^') {
      this.next();
      const right = this.parseUnary();
      this.leave();
      return { type: 'Binary', op: '^', left, right };
    }
    this.leave();
    return left;
  }

  parsePrimary() {
    this.enter();
    const t = this.peek();
    if (t.type === TOKEN_TYPES.NUMBER) {
      this.next();
      this.leave();
      return { type: 'Number', value: t.value };
    }
    if (t.type === TOKEN_TYPES.STRING) {
      this.next();
      this.leave();
      return { type: 'String', value: t.value };
    }
    if (t.type === TOKEN_TYPES.IDENT) {
      this.next();
      // function call?
      if (this.peek().type === TOKEN_TYPES.LPAREN) {
        this.next();
        const args = [];
        if (this.peek().type !== TOKEN_TYPES.RPAREN) {
          args.push(this.parseExpr());
          while (this.peek().type === TOKEN_TYPES.COMMA) {
            this.next();
            args.push(this.parseExpr());
          }
        }
        this.expect(TOKEN_TYPES.RPAREN, `Expected ")" at ${this.peek().pos}`);
        if (!WHITELISTED_FUNCS.has(t.value)) {
          throw new ExprError('UNKNOWN_FUNC', `Unknown function "${t.value}"`, { pos: t.pos });
        }
        this.leave();
        return { type: 'Call', name: t.value, args };
      }
      checkIdentForbidden(t.value, t.pos);
      this.leave();
      return { type: 'Ident', name: t.value };
    }
    if (t.type === TOKEN_TYPES.LPAREN) {
      this.next();
      const inner = this.parseExpr();
      this.expect(TOKEN_TYPES.RPAREN, `Expected ")" at ${this.peek().pos}`);
      this.leave();
      return inner;
    }
    throw new ExprError('SYNTAX', `Unexpected token at ${t.pos}`, { pos: t.pos });
  }
}

export function parse(src) {
  if (typeof src !== 'string') {
    throw new ExprError('SYNTAX', 'Expression source must be a string');
  }
  if (src.length > MAX_LEN) {
    throw new ExprError('TOO_COMPLEX', `Expression length ${src.length} exceeds ${MAX_LEN}`);
  }
  const tokens = tokenize(src);
  const parser = new Parser(tokens);
  const ast = parser.parseExpr();
  const t = parser.peek();
  if (t.type !== TOKEN_TYPES.EOF) {
    throw new ExprError('SYNTAX', `Unexpected trailing token at ${t.pos}`, { pos: t.pos });
  }
  return ast;
}

// ---------- identifiersOf ----------

export function identifiersOf(ast) {
  const out = new Set();
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    switch (node.type) {
      case 'Ident':
        out.add(node.name);
        break;
      case 'Number':
      case 'String':
        break;
      case 'Unary':
        walk(node.operand);
        break;
      case 'Binary':
      case 'Logical':
        walk(node.left);
        walk(node.right);
        break;
      case 'Call':
        for (const a of node.args) walk(a);
        break;
      default:
        break;
    }
  }
  walk(ast);
  return Array.from(out);
}

// ---------- Evaluator ----------

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function assertFinite(v) {
  if (typeof v === 'number' && !Number.isFinite(v)) {
    throw new ExprError('NOT_FINITE', 'Result is not a finite number');
  }
  return v;
}

function toNum(v) {
  if (typeof v === 'number') return v;
  throw new ExprError('SYNTAX', 'Expected a number');
}

function truthy(v) {
  return !!v;
}

function roundHalfUpLocal(x, dp) {
  const f = 10 ** dp;
  return Math.sign(x) * Math.round(Math.abs(x) * f * (1 + 1e-12) + 1e-9) / f;
}

function callFunc(name, argNodes, scope) {
  switch (name) {
    case 'round': {
      if (argNodes.length < 1 || argNodes.length > 2) throw new ExprError('SYNTAX', 'round expects 1 or 2 args');
      const x = toNum(evaluate(argNodes[0], scope));
      const dp = argNodes.length > 1 ? toNum(evaluate(argNodes[1], scope)) : 0;
      return assertFinite(roundHalfUpLocal(x, dp));
    }
    case 'floor': {
      const x = toNum(evaluate(argNodes[0], scope));
      return assertFinite(Math.floor(x));
    }
    case 'ceil': {
      const x = toNum(evaluate(argNodes[0], scope));
      return assertFinite(Math.ceil(x));
    }
    case 'abs': {
      const x = toNum(evaluate(argNodes[0], scope));
      return assertFinite(Math.abs(x));
    }
    case 'min': {
      const vals = argNodes.map((a) => toNum(evaluate(a, scope)));
      if (vals.length === 0) throw new ExprError('SYNTAX', 'min expects at least 1 arg');
      return assertFinite(Math.min(...vals));
    }
    case 'max': {
      const vals = argNodes.map((a) => toNum(evaluate(a, scope)));
      if (vals.length === 0) throw new ExprError('SYNTAX', 'max expects at least 1 arg');
      return assertFinite(Math.max(...vals));
    }
    case 'if': {
      if (argNodes.length !== 3) throw new ExprError('SYNTAX', 'if expects 3 args');
      const cond = evaluate(argNodes[0], scope);
      return truthy(cond) ? evaluate(argNodes[1], scope) : evaluate(argNodes[2], scope);
    }
    case 'sum': {
      const vals = argNodes.map((a) => toNum(evaluate(a, scope)));
      return assertFinite(vals.reduce((a, b) => a + b, 0));
    }
    case 'avg': {
      const vals = argNodes.map((a) => toNum(evaluate(a, scope)));
      if (vals.length === 0) throw new ExprError('SYNTAX', 'avg expects at least 1 arg');
      return assertFinite(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
    default:
      throw new ExprError('UNKNOWN_FUNC', `Unknown function "${name}"`);
  }
}

export function evaluate(ast, scope = {}) {
  switch (ast.type) {
    case 'Number':
      return ast.value;
    case 'String':
      return ast.value;
    case 'Ident': {
      if (!Object.prototype.hasOwnProperty.call(scope, ast.name)) {
        throw new ExprError('UNKNOWN_IDENT', `Unknown identifier "${ast.name}"`, { ident: ast.name });
      }
      return scope[ast.name];
    }
    case 'Unary': {
      const v = evaluate(ast.operand, scope);
      if (ast.op === '-') return assertFinite(-toNum(v));
      if (ast.op === '+') return assertFinite(+toNum(v));
      if (ast.op === '!') return !truthy(v);
      throw new ExprError('SYNTAX', `Unknown unary op ${ast.op}`);
    }
    case 'Logical': {
      const l = evaluate(ast.left, scope);
      if (ast.op === '&&') return truthy(l) ? evaluate(ast.right, scope) : l;
      if (ast.op === '||') return truthy(l) ? l : evaluate(ast.right, scope);
      throw new ExprError('SYNTAX', `Unknown logical op ${ast.op}`);
    }
    case 'Binary': {
      const op = ast.op;
      const cmpOps = ['<', '<=', '>', '>=', '==', '!='];
      if (cmpOps.includes(op)) {
        const l = evaluate(ast.left, scope);
        const r = evaluate(ast.right, scope);
        switch (op) {
          case '<': return l < r;
          case '<=': return l <= r;
          case '>': return l > r;
          case '>=': return l >= r;
          case '==': return l === r;
          case '!=': return l !== r;
          default: break;
        }
      }
      const l = toNum(evaluate(ast.left, scope));
      const r = toNum(evaluate(ast.right, scope));
      switch (op) {
        case '+': return assertFinite(l + r);
        case '-': return assertFinite(l - r);
        case '*': return assertFinite(l * r);
        case '/':
          if (r === 0) throw new ExprError('DIV_ZERO', 'Division by zero');
          return assertFinite(l / r);
        case '%':
          if (r === 0) throw new ExprError('DIV_ZERO', 'Modulo by zero');
          return assertFinite(l % r);
        case '^':
          return assertFinite(Math.pow(l, r));
        default:
          throw new ExprError('SYNTAX', `Unknown binary op ${op}`);
      }
    }
    case 'Call':
      return assertFinite(callFunc(ast.name, ast.args, scope));
    default:
      throw new ExprError('SYNTAX', `Unknown AST node type ${ast.type}`);
  }
}

export function evalExpr(src, scope = {}) {
  const ast = parse(src);
  return evaluate(ast, scope);
}

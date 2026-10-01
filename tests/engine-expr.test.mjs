import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evalExpr, ExprError } from '../web/js/engine/expr.js';

test('basic arithmetic', () => {
  assert.equal(evalExpr('1+2*3'), 7);
  assert.equal(evalExpr('(1+2)*3'), 9);
  assert.equal(evalExpr('2^3^2'), 512);
  assert.equal(evalExpr('-2^2'), -4);
});

test('round function', () => {
  assert.equal(evalExpr('round(2.5)'), 3);
  assert.equal(evalExpr('round(-2.5)'), -3);
  assert.equal(evalExpr('round(1.005,2)'), 1.01);
});

test('if lazy evaluation', () => {
  assert.equal(evalExpr('if(1, 5, 1/0)'), 5);
});

test('identifier lookup', () => {
  assert.equal(evalExpr('low.pv', { 'low.pv': 42 }), 42);
});

test('string result', () => {
  assert.equal(evalExpr('if(0,"a","ข")'), 'ข');
});

function expectCode(src, code, scope) {
  assert.throws(() => evalExpr(src, scope), (err) => {
    assert.ok(err instanceof ExprError, `expected ExprError, got ${err}`);
    assert.equal(err.code, code, `expected code ${code}, got ${err.code} (${err.message})`);
    return true;
  });
}

test('rejections with codes', () => {
  expectCode('constructor', 'FORBIDDEN_IDENT');
  expectCode('__proto__', 'FORBIDDEN_IDENT');
  expectCode('a.constructor', 'FORBIDDEN_IDENT');
  expectCode('alert(1)', 'UNKNOWN_FUNC');
  expectCode('x[0]', 'SYNTAX');
  expectCode('a;b', 'SYNTAX');
  expectCode('`t`', 'SYNTAX');
  expectCode('1/0', 'DIV_ZERO');
  expectCode('n'.padEnd(501, 'n'), 'TOO_COMPLEX');
  expectCode('nope+1', 'UNKNOWN_IDENT');
});

test('engine source files contain no eval( or Function(', () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const engineDir = path.join(__dirname, '..', 'web', 'js', 'engine');
  const files = fs.readdirSync(engineDir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const src = fs.readFileSync(path.join(engineDir, file), 'utf8');
    assert.ok(!src.includes('eval('), `${file} must not contain eval(`);
    assert.ok(!src.includes('Function('), `${file} must not contain Function(`);
    assert.ok(!src.includes('with('), `${file} must not contain with(`);
  }
});

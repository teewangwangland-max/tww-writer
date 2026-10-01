// index.js - re-exports everything

export { parse, evaluate, identifiersOf, evalExpr, ExprError } from './expr.js';
export { roundHalfUp, formatValue, formatNumberPart, scaleOf } from './format.js';
export { registerModule, getModule, listModules, clearModules } from './modules.js';
export { validateSpec } from './spec.js';
export { compute } from './calc.js';
export { scanNumbers, checkPost, autofix } from './numscan.js';

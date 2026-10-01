// modules.js - named special-module registry

const registry = new Map();

export function registerModule(name, fn) {
  registry.set(name, fn);
}

export function getModule(name) {
  return registry.get(name);
}

export function listModules() {
  return Array.from(registry.keys());
}

export function clearModules() {
  registry.clear();
}

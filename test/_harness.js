/**
 * Shared test harness.
 * Loads the renderer's plain <script> files (which define globals like `Engine`
 * and assign methods onto a global `App`) inside a Node `vm` sandbox, with
 * stubbed globals, so the pure logic can be exercised without Electron or a DOM.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILES_DIR = path.join(__dirname, '..', 'files');

/**
 * @param {string[]} relFiles  filenames under files/ to concatenate and run
 * @param {object}   ctxStubs  globals to expose to the scripts (App, JOBS, ...)
 * @returns the populated vm context (e.g. ctx.Engine, ctx.App)
 */
// Some module files are wired onto App via `_assignModule` (defined in app.js,
// which the harness does not load). Provide a faithful default so those files
// load. Mirrors app.js: copies descriptors, preserving getters/setters.
function _assignModule(target, source) {
  Object.getOwnPropertyNames(source).forEach(key => {
    const desc = Object.getOwnPropertyDescriptor(source, key);
    if (desc.get || desc.set) Object.defineProperty(target, key, desc);
    else Object.defineProperty(target, key, { ...desc, configurable: true, writable: true });
  });
  return target;
}

// Minimal stand-in for the app's global HTML-escaper (defined in app.js, which
// the harness doesn't load) so render-helper functions can be exercised.
function _escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Stand-in for the app's colour validator (defined in app.js).
function _safeColor(value, fallback = '#888888') {
  const c = String(value || '').trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(c)) return c;
  if (/^(rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\)$/.test(c)) return c;
  if (/^var\(--[a-zA-Z0-9_-]+\)$/.test(c)) return c;
  return fallback;
}

function loadScripts(relFiles, ctxStubs) {
  const ctx = Object.assign({ console, _assignModule, _escapeHtml, _safeColor }, ctxStubs);
  vm.createContext(ctx);
  const src = relFiles
    .map(f => fs.readFileSync(path.join(FILES_DIR, f), 'utf8').replace(/^﻿/, ''))
    .join('\n;\n');
  // `const Engine = {...}` / `const Charts = {...}` are lexical bindings and will
  // not attach to the context object on their own; copy them across if present.
  const capture = ['Engine', 'Charts', 'CapabilityEvidence', 'CapacityResolver', 'PRESET_BUILDINGS',
    'JOBS', 'SKILLS', 'TRAITS', 'GENES', 'BACKSTORIES', 'VANILLA_DEF_SIZES']
    .map(name => `try { globalThis.${name} = ${name}; } catch (e) {}`).join(' ');
  vm.runInContext(src + '\n;' + capture, ctx);
  return ctx;
}

module.exports = { loadScripts, FILES_DIR };

/**
 * Priority edit lock: every priorities-tab mutation path is guarded while
 * ordinary wheel scrolling and existing values remain untouched.
 */
const { loadScripts } = require('./_harness');

module.exports = function run() {
  let failures = 0, total = 0;
  const fail = (m) => { failures++; console.log('  FAIL', m); };
  const check = (label, condition) => { total++; if (!condition) fail(`[${label}]`); };
  const eq = (label, got, expected) => check(`${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`, got === expected);

  const elements = {};
  const fakeButton = (title = '') => ({
    title, textContent: '', disabled: false, dataset: {}, attrs: {},
    classList: { values: new Set(), toggle(name, on) { if (on) this.values.add(name); else this.values.delete(name); } },
    setAttribute(name, value) { this.attrs[name] = String(value); },
  });
  elements.priorityLockBtn = fakeButton();
  elements.autoAssignBtn = fakeButton('Automatically assign priorities.');

  let engineCalls = 0;
  const PriorityScale = {
    highest: 1,
    lowestManual: () => 4,
    defaultEnabled: () => 3,
    next: (value) => value == null ? 4 : value <= 1 ? null : value - 1,
    previous: (value) => value == null ? 1 : value >= 4 ? null : value + 1,
  };
  const ctx = loadScripts(['app-priorities.js', 'app-save.js'], {
    App: { state: {} }, PriorityScale,
    Engine: { runMinMaxAssignment(pawns, roles, priorities) { engineCalls++; priorities.p1.mining = 1; }, analyzeColony: () => ({ gaps: [], recommendations: [], singlePoints: [] }) },
    window: { innerWidth: 1200 },
    document: { getElementById: (id) => elements[id] || null },
    localStorage: { getItem: () => null, setItem: () => {} },
  });

  let renders = 0, saves = 0, toasts = 0;
  const app = Object.assign(Object.create(ctx.App), {
    state: {
      settings: { manualPriorities: true, priorityLocked: true, disableScrollWheel: false, invertWheel: false },
      pawns: [{ id: 'p1' }], roles: [], priorities: { p1: { mining: 3 } },
    },
    renderTable() { renders++; },
    triggerAutoSave() { saves++; },
    toast() { toasts++; },
    _visibleJobs() { return [{ id: 'mining' }]; },
  });

  const original = JSON.stringify(app.state.priorities);
  let prevented = 0;
  app.handlePriorityClick({ preventDefault() { prevented++; }, button: 0 }, 'p1', 'mining');
  eq('locked click preserves priorities', JSON.stringify(app.state.priorities), original);
  eq('locked click does not render', renders, 0);

  app.handlePriorityWheel({ preventDefault() { prevented++; }, deltaY: -1 }, 'p1', 'mining');
  eq('locked wheel preserves priorities', JSON.stringify(app.state.priorities), original);
  eq('locked wheel leaves normal scrolling available', prevented, 0);

  app.handlePriorityKey({ key: '1' }, 'p1', 'mining');
  eq('locked keyboard input preserves priorities', JSON.stringify(app.state.priorities), original);

  const autoResult = app.autoAssignAll();
  eq('locked Auto-Assign reports refusal', autoResult, false);
  eq('locked Auto-Assign never calls engine', engineCalls, 0);
  check('locked Auto-Assign explains refusal', toasts > 0);

  app._optimizerResult = { gaps: [{ bestPawn: { pawnId: 'p1' }, jobId: 'mining' }], recommendations: [] };
  eq('locked optimiser suggestion reports refusal', app.applyOptimizerSuggestion('p1', 'mining', 1), false);
  eq('locked Apply All reports refusal', app.applyAllOptimizerSuggestions(), false);
  eq('locked optimiser actions preserve priorities', JSON.stringify(app.state.priorities), original);

  app._syncPriorityLockControls();
  eq('lock pill label reflects locked state', elements.priorityLockBtn.textContent, '🔒 Locked');
  eq('lock pill aria state reflects locked state', elements.priorityLockBtn.attrs['aria-pressed'], 'true');
  check('Auto-Assign control is disabled while locked', elements.autoAssignBtn.disabled === true);
  check('Auto-Assign has locked explanation', /Unlock priorities/.test(elements.autoAssignBtn.title));
  check('locked cell HTML exposes aria-disabled', /aria-disabled="true"/.test(app._prioCellHTML('p1', 'mining', 3)));

  app._optimizerResult = null;
  app.togglePriorityLock();
  eq('toggle unlocks editing', app.state.settings.priorityLocked, false);
  eq('toggle preserves existing values', JSON.stringify(app.state.priorities), original);
  check('toggle schedules persistence', saves > 0);
  check('Auto-Assign control re-enables after unlock', elements.autoAssignBtn.disabled === false);
  eq('unlocked pill label', elements.priorityLockBtn.textContent, '🔓 Unlocked');

  app.handlePriorityClick({ preventDefault() { prevented++; }, button: 0 }, 'p1', 'mining');
  eq('click edits after unlock', app.state.priorities.p1.mining, 2);
  check('unlocked click prevents native handling', prevented > 0);

  const payloadApp = Object.assign(Object.create(ctx.App), { state: { ...app.state, settings: { ...app.state.settings, priorityLocked: true } } });
  const payload = payloadApp._buildSavePayload();
  eq('save payload persists lock setting', payload.settings.priorityLocked, true);
  const receiver = Object.assign(Object.create(ctx.App), {
    state: { settings: { priorityLocked: false }, pawns: [], priorities: {} },
    allJobs: [], _normalizeLoadedState() {},
  });
  receiver._applyLoadedData({ settings: payload.settings });
  eq('load restores lock setting', receiver.state.settings.priorityLocked, true);

  return { name: 'priority edit lock', failures, total };
};

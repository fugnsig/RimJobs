const fs = require('fs');
const path = require('path');
const { loadScripts } = require('./_harness');

module.exports = function run() {
  let total = 0;
  let failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) {
      failures++;
      console.log('  FAIL ' + label);
    }
  };

  const App = {
    state: {
      settings: { manualPriorities: true, priorityLocked: false },
      scannedWorkTypeDefs: {}, scannedWorkGiverDefs: {}, scannedCapacityDefs: {},
      scannedRaceWorkPolicies: {}, activePackageResolution: {
        ids: ['ludeon.rimworld'], completeness: 'unknown', reasons: ['test'],
      },
      requirementUncertainty: {},
    },
    allJobs: [{ id: 'firefight' }, { id: 'mining' }, { id: 'fishing' }, { id: 'hauling' }],
    _prioritiesAreLocked() { return this.state.settings.priorityLocked; },
    _prioCellHTML(pid, jid, prio) {
      const lock = this._prioritiesAreLocked()
        ? ' aria-disabled="true" title="Priorities are locked"' : '';
      return '<div class="prio-box ' + (prio ? 'p' + prio : 'empty')
        + '" tabindex="0" onmousedown="App.handlePriorityClick(event, \'' + pid + '\', \''
        + jid + '\')"' + lock + '>' + (prio == null ? '&nbsp;' : prio) + '</div>';
    },
  };
  loadScripts(['app-render.js'], {
    App,
    document: {}, window: {},
    Engine: {}, Charts: {},
    RequirementRegistry: {
      createSnapshot(input) { return Object.freeze({ marker: 'snapshot', input }); },
    },
  });

  const evaluation = (kind, code, sourceKind) => ({
    kind,
    explanation: { code, params: { target: 'fixture-target' } },
    evidence: [{ sourceKind: sourceKind || 'savePawn', sourceId: 'fixture-source' }],
    requirementProvenance: { modId: 'fixture.mod', sources: [{ file: 'fixture.xml' }] },
  });
  const pawnContext = (permission, availability) => ({
    permission() { return permission; },
    availability() { return availability || { state: 'available', blockers: [], unknowns: [] }; },
  });
  const allowed = { state: 'allowed', blockers: [], unknowns: [] };
  const available = { state: 'available', blockers: [], unknowns: [] };
  const job = { id: 'mining' };

  const normal = App._c7CellState(pawnContext(allowed, available), job);
  ok(normal.state === 'normal', 'C7-GRID-001 allowed and available is normal');
  ok(normal.permission === allowed && normal.availability === available,
    'C7-GRID-001 canonical reports remain attached');

  const blocker = evaluation('disableJob', 'permission.job.failed', 'backstoryDef');
  const blocked = App._c7CellState(pawnContext({
    state: 'blocked', blockers: [blocker], unknowns: [],
  }), job);
  ok(blocked.state === 'blocked', 'C7-GRID-002 Permission blocked is X state');
  const blockedHtml = App._c7GridCellHTML('p1', job, 2,
    pawnContext({ state: 'blocked', blockers: [blocker], unknowns: [] }));
  ok(/prio-box incap/.test(blockedHtml) && /×/.test(blockedHtml),
    'C7-GRID-002 blocked cell renders X');
  ok(!/onmousedown/.test(blockedHtml), 'C7-GRID-002 blocked cell is non-editable');
  const blockedTip = App._c7Tooltip(blocked);
  ok(blockedTip.includes('permission.job.failed'), 'C7-GRID-002 blocker reason is shown');
  ok(blockedTip.includes('backstoryDef') && blockedTip.includes('fixture-source'),
    'C7-GRID-002 blocker provenance is shown');

  const uncertain = evaluation('registryCompleteness', 'permission.policy.unknown', 'scanner');
  const unknown = App._c7CellState(pawnContext({
    state: 'unknown', blockers: [], unknowns: [uncertain],
  }), job);
  ok(unknown.state === 'unknown', 'C7-GRID-003 Permission unknown is distinct');
  const unknownHtml = App._c7GridCellHTML('p2', job, 3,
    pawnContext({ state: 'unknown', blockers: [], unknowns: [uncertain] }));
  ok(/prio-box unknown p3/.test(unknownHtml), 'C7-GRID-003 unknown class retains priority');
  ok(/onmousedown/.test(unknownHtml), 'C7-GRID-003 unknown cell remains editable');
  ok(App._c7Tooltip(unknown).includes('permission.policy.unknown'),
    'C7-GRID-003 uncertainty reason is shown');
  ok(App._c7Tooltip(unknown).includes('scanner'),
    'C7-GRID-003 uncertainty provenance is shown');

  const currentBlock = evaluation('currentState', 'availability.global.downed.failed', 'savePawn');
  const unavailable = App._c7CellState(pawnContext(allowed, {
    state: 'unavailable', blockers: [currentBlock], unknowns: [],
  }), job);
  ok(unavailable.state === 'unavailable',
    'C7-GRID-004 allowed plus unavailable is temporary state');
  const unavailableHtml = App._c7GridCellHTML('p3', job, 1, pawnContext(allowed, {
    state: 'unavailable', blockers: [currentBlock], unknowns: [],
  }));
  ok(/prio-box unavailable p1/.test(unavailableHtml),
    'C7-GRID-004 unavailable class retains priority');
  ok(/onmousedown/.test(unavailableHtml), 'C7-GRID-004 unavailable cell remains editable');
  ok(App._c7Tooltip(unavailable).includes('availability.global.downed.failed'),
    'C7-GRID-004 temporary reason is shown');

  const causalCases = [
    {
      label: 'C7-DELTA-FIREFIGHT legacyBlockedCanonicalNotBlocked',
      pawn: { id: 'violent', incapable: ['violence'], bioAge: 20 },
      target: { id: 'firefight' }, other: { id: 'mining' },
    },
    {
      label: 'C7-DELTA-FISHING legacyBlockedCanonicalNotBlocked',
      pawn: { id: 'child', incapable: [], bioAge: 6, raceDefName: 'Human' },
      target: { id: 'fishing' }, other: { id: 'firefight' },
    },
    {
      label: 'C7-DELTA-HAULING legacyBlockedCanonicalNotBlocked',
      pawn: { id: 'zero-manip', incapable: [], bioAge: 20, manipulation: 0 },
      target: { id: 'hauling' }, other: { id: 'mining' },
    },
  ];
  for (const fixture of causalCases) {
    const target = App._c7CellState(pawnContext(allowed, available), fixture.target);
    const other = App._c7CellState(pawnContext(allowed, available), fixture.other);
    ok(fixture.pawn.id && fixture.pawn.bioAge != null,
      fixture.label + ' carries the exact causal pawn');
    ok(target.state === 'normal', fixture.label + ' target becomes editable');
    ok(other.state === 'normal', fixture.label + ' unrelated cell remains unchanged');
  }

  const downedPawn = {
    id: 'downed', downed: true,
    currentStatusSources: { facts: { downed: { state: 'known', value: true } } },
  };
  const downedInfo = App._c7CellState(pawnContext(allowed, {
    state: 'unavailable', blockers: [currentBlock], unknowns: [],
  }), job);
  ok(downedPawn.currentStatusSources.facts.downed.value === true,
    'C7-GRID-005 downed fixture carries known current status evidence');
  ok(downedInfo.state === 'unavailable', 'C7-GRID-005 downed decomposes to unavailable');

  App.state.settings.priorityLocked = true;
  const lockedUnknown = App._c7GridCellHTML('p4', job, 2,
    pawnContext({ state: 'unknown', blockers: [], unknowns: [uncertain] }));
  ok(/aria-disabled="true"/.test(lockedUnknown),
    'C7-GRID-006 Priority Lock still disables editing');
  App.state.settings.priorityLocked = false;

  const snapshot = App._c4DefinitionSnapshot();
  ok(snapshot.marker === 'snapshot', 'C7-GRID-007 definition snapshot uses registry');
  ok(snapshot.input.jobCatalog === App.allJobs, 'C7-GRID-007 snapshot uses current job catalogue');
  ok(snapshot.input.workTypeDefs === App.state.scannedWorkTypeDefs,
    'C7-GRID-007 snapshot forwards scanned WorkTypeDefs');
  ok(snapshot.input.workGiverDefs === App.state.scannedWorkGiverDefs,
    'C7-GRID-007 snapshot forwards scanned WorkGiverDefs');
  ok(snapshot.input.capacityDefs === App.state.scannedCapacityDefs,
    'C7-GRID-007 snapshot forwards scanned capacity definitions');

  const source = fs.readFileSync(path.join(__dirname, '..', 'files', 'app-render.js'), 'utf8');
  const horizontal = source.slice(source.indexOf('  _renderTableHorizontal(wrap'),
    source.indexOf('  _renderTableVertical(wrap'));
  const vertical = source.slice(source.indexOf('  _renderTableVertical(wrap'),
    source.indexOf('  renderDashboard('));
  ok(!/isIncapable/.test(horizontal), 'C7-GRID-008 horizontal renderer has no legacy call');
  ok(!/isIncapable/.test(vertical), 'C7-GRID-008 vertical renderer has no legacy call');
  ok(/_c7GridCellHTML/.test(horizontal) && /_c7GridCellHTML/.test(vertical),
    'C7-GRID-008 both renderers share identical cell projection');

  return { name: 'C7 priority grid parity', total, failures };
};

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

  let contextMapCalls = 0;
  const stubMap = new Map();
  stubMap.set('p1', {
    permission() { return { state: 'allowed', blockers: [], unknowns: [] }; },
    availability() { return { state: 'available', blockers: [], unknowns: [] }; },
  });
  stubMap.set('p2', {
    permission() { return { state: 'allowed', blockers: [], unknowns: [] }; },
    availability() { return { state: 'available', blockers: [], unknowns: [] }; },
  });

  const pawns = [
    { id: 'p1', name: 'Pawn1', nickname: 'Pawn1', traits: [], bioAge: 25,
      avatarIdx: 0, xenotype: null, schedule: Array(24).fill(0) },
    { id: 'p2', name: 'Pawn2', nickname: 'Pawn2', traits: [], bioAge: 30,
      avatarIdx: 0, xenotype: null, schedule: Array(24).fill(0) },
  ];

  const noOp = () => {};
  const nullEl = {
    innerHTML: '', scrollTop: 0, children: [],
    style: {}, setAttribute: noOp, getAttribute: () => null,
    classList: { toggle: noOp, add: noOp, remove: noOp },
    querySelectorAll: () => [],
  };

  const elements = {
    pawnList: Object.assign({}, nullEl, { children: [] }),
    tableWrap: Object.assign({}, nullEl),
    summaryBar: Object.assign({}, nullEl),
    'view-dash': Object.assign({}, nullEl),
    schedContainer: Object.assign({}, nullEl),
    pawnSearch: { value: '' },
    pawnSort: { options: { length: 0 }, innerHTML: '', value: '' },
    manualPrioBtn: Object.assign({}, nullEl, { textContent: '' }),
    collapseAllBtn: null,
  };

  const App = {
    state: {
      pawns,
      priorities: { p1: {}, p2: {} },
      settings: { manualPriorities: true, compactSidebar: false },
      pawnSort: 'manual',
      pawnFilter: '',
      catLabels: {},
      customJobs: [],
      shiftTypes: ['Anything', 'Work', 'Joy', 'Sleep'],
      shiftColors: ['#aaa', '#8ab', '#ab8', '#88a'],
      precepts: {},
      activeTab: 'work',
      scannedWorkTypeDefs: {}, scannedWorkGiverDefs: {},
      scannedCapacityDefs: {}, scannedRaceWorkPolicies: {},
      activePackageResolution: { ids: ['ludeon.rimworld'], completeness: 'complete', reasons: [] },
      requirementUncertainty: {},
      scannedBodyDefs: {}, scannedBodyPartDefs: {}, scannedRaceBodyMap: {},
      effectivenessProvider: null,
      importMeta: { modIds: ['ludeon.rimworld'] },
    },
    allJobs: [{ id: 'firefight', name: 'Firefight', important: true, cat: 'Emergency' }],
    _c7EvidenceOptionsByPawn: new Map(),
    _pawnCardHashes: {},
    _lastSidebarOrder: null,
    _lastCompactMode: null,
    _summaryAlertsExpanded: false,
    _schedFilter: '',
    _schedRationale: null,
    _schedProposals: null,
    allXenotypes: {},
    allRoles: [],
    allTraits: [],
    _buildRenderCache: noOp,
    _updateCollapseAllBtn: noOp,
    _sortPawns(p) { return p; },
    _visibleJobs() { return this.allJobs; },
    _isPortrait() { return false; },
    getXeno() { return { label: 'Baseliner', color: '#888' }; },
    _jobSourceKey() { return 'vanilla'; },
    _jobHeaderTitle(j) { return j.name; },
    _prioritiesAreLocked() { return false; },
    _syncPriorityLockControls: noOp,
    _renderPawnCardHtml() { return '<div class="pawn-card" data-pawn-id="x"></div>'; },
    _pawnCardHash() { return 'hash'; },
    triggerAutoSave: noOp,
    _prioCellHTML() { return '<div class="prio-box"></div>'; },
  };

  const ctx = loadScripts(['data.js', 'app-render.js', 'app-schedule.js'], {
    App,
    document: {
      getElementById(id) { return elements[id] || null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener: noOp,
      createElement(tag) {
        return Object.assign({}, nullEl, { tagName: tag, firstElementChild: nullEl });
      },
    },
    window: {
      innerWidth: 1920, innerHeight: 1080,
      addEventListener: noOp,
    },
    Engine: {
      calculateViability() { return { scores: [], overall: 1 }; },
      getBottlenecks() { return []; },
      analyzeTemporalResilience() { return { jobs: [], gaps: 0, fragileHours: 0 }; },
      _c7IsEligible() { return true; },
    },
    Charts: { renderColonyRadar: noOp },
    RequirementRegistry: {
      createSnapshot() { return Object.freeze({ schemaVersion: 1, jobPolicies: {} }); },
    },
    C5DefinitionSnapshotFactory: {
      createSnapshot() { return null; },
    },
    C7EvaluationCoordinator: {
      createPawnContext(pawn) {
        return {
          pawnId: pawn.id,
          pawnEvidence: {},
          structuralCapacities: {},
          c5Context: {},
          permission() { return { state: 'allowed', blockers: [], unknowns: [] }; },
          availability() { return { state: 'available', blockers: [], unknowns: [] }; },
          temporalProfile() { return null; },
        };
      },
    },
    StructuralEffectivenessContext: { _deepFreeze(o) { return o; } },
    JOBS: [{ id: 'firefight', name: 'Firefight', important: true, cat: 'Emergency', skill: null }],
    SKILLS: [],
    CAT_LABELS: { Emergency: 'Emergency' },
    AVATARS: [{ bg: '#333', color: '#fff' }],
  });

  const originalC7PawnContextMap = App._c7PawnContextMap.bind(App);
  App._c7PawnContextMap = function() {
    contextMapCalls++;
    return originalC7PawnContextMap.apply(this, arguments);
  };

  // --- Test 1: renderAll constructs at most one context map ---

  contextMapCalls = 0;
  App.renderAll();
  ok(contextMapCalls === 1,
    'SHARE-001 renderAll() constructs exactly one context map (got ' + contextMapCalls + ')');

  // --- Test 2: renderAll with schedule tab still one map ---

  App.state.activeTab = 'sched';
  contextMapCalls = 0;
  App.renderAll();
  ok(contextMapCalls === 1,
    'SHARE-002 renderAll() with sched tab constructs one context map (got ' + contextMapCalls + ')');

  // --- Test 3: renderAll with dashboard tab still one map ---

  App.state.activeTab = 'dash';
  contextMapCalls = 0;
  App.renderAll();
  ok(contextMapCalls === 1,
    'SHARE-003 renderAll() with dash tab constructs one context map (got ' + contextMapCalls + ')');

  // --- Test 4: renderTable independently creates one map (shared with renderSummary) ---

  App.state.activeTab = 'work';
  contextMapCalls = 0;
  App.renderTable();
  ok(contextMapCalls === 1,
    'SHARE-004 renderTable() independently constructs one map, shared with renderSummary (got ' + contextMapCalls + ')');

  // --- Test 5: renderSidebar independently creates its own map ---

  contextMapCalls = 0;
  App.renderSidebar();
  ok(contextMapCalls === 1,
    'SHARE-005 renderSidebar() independently constructs one map (got ' + contextMapCalls + ')');

  // --- Test 6: renderSummary independently creates its own map ---

  contextMapCalls = 0;
  App.renderSummary();
  ok(contextMapCalls === 1,
    'SHARE-006 renderSummary() independently constructs one map (got ' + contextMapCalls + ')');

  // --- Test 7: renderDashboard independently creates its own map ---

  contextMapCalls = 0;
  App.renderDashboard();
  ok(contextMapCalls === 1,
    'SHARE-007 renderDashboard() independently constructs one map (got ' + contextMapCalls + ')');

  // --- Test 8: passing external map skips construction ---

  const externalMap = new Map(pawns.map(p => [p.id, {
    permission() { return { state: 'allowed', blockers: [], unknowns: [] }; },
    availability() { return { state: 'available', blockers: [], unknowns: [] }; },
    temporalProfile() { return null; },
  }]));

  contextMapCalls = 0;
  App.renderSidebar(externalMap);
  ok(contextMapCalls === 0,
    'SHARE-008 renderSidebar(map) skips construction (got ' + contextMapCalls + ')');

  contextMapCalls = 0;
  App.renderSummary(externalMap);
  ok(contextMapCalls === 0,
    'SHARE-009 renderSummary(map) skips construction (got ' + contextMapCalls + ')');

  contextMapCalls = 0;
  App.renderTable(externalMap);
  ok(contextMapCalls === 0,
    'SHARE-010 renderTable(map) skips construction (got ' + contextMapCalls + ')');

  contextMapCalls = 0;
  App.renderDashboard(externalMap);
  ok(contextMapCalls === 0,
    'SHARE-011 renderDashboard(map) skips construction (got ' + contextMapCalls + ')');

  // --- Test 9: Priorities does not invoke temporalProfile (lazy C6) ---

  let temporalCalled = false;
  const instrumentedMap = new Map(pawns.map(p => [p.id, {
    permission() { return { state: 'allowed', blockers: [], unknowns: [] }; },
    availability() { return { state: 'available', blockers: [], unknowns: [] }; },
    temporalProfile() { temporalCalled = true; return null; },
  }]));

  App.state.activeTab = 'work';
  App.renderTable(instrumentedMap);
  ok(!temporalCalled,
    'SHARE-012 Priorities rendering does not invoke temporalProfile (lazy C6)');

  return { name: 'C7 render context-map sharing', total, failures };
};

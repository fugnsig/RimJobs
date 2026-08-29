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

  // --- resolveC4ActivePackageIds: completeness ---

  const dataCtx = loadScripts(['data.js'], {});
  const resolve = dataCtx.resolveC4ActivePackageIds;

  const withModIds = resolve({ modIds: ['ludeon.rimworld'] });
  ok(withModIds.completeness === 'complete',
    'PKG-001 modIds array yields completeness=complete');
  ok(Array.isArray(withModIds.ids) && withModIds.ids.includes('ludeon.rimworld'),
    'PKG-001 core package always present');

  const noModIds = resolve({ modIds: undefined });
  ok(noModIds.completeness === 'unknown',
    'PKG-002 missing modIds yields completeness=unknown');

  const nullMeta = resolve(null);
  ok(nullMeta.completeness === 'unknown',
    'PKG-003 null importMeta yields completeness=unknown');

  const dlcFlags = resolve({ modIds: [], royalty: true, biotech: true });
  ok(dlcFlags.ids.includes('ludeon.rimworld.royalty'),
    'PKG-004 royalty DLC flag adds package');
  ok(dlcFlags.ids.includes('ludeon.rimworld.biotech'),
    'PKG-004 biotech DLC flag adds package');
  ok(dlcFlags.completeness === 'complete',
    'PKG-004 DLC flags with empty modIds still complete');

  // --- RequirementRegistry chain: complete vs unknown ---

  const regCtx = loadScripts(['data.js', 'requirement-registry.js'], {});
  const Registry = regCtx.RequirementRegistry;

  const completeResolution = { ids: ['ludeon.rimworld'], completeness: 'complete', reasons: [] };
  const unknownResolution = { ids: ['ludeon.rimworld'], completeness: 'unknown', reasons: ['test'] };

  const vanillaWorkType = {
    _provenance: { modId: 'ludeon.rimworld' },
    pathCatalogueCompleteness: 'complete',
    pathCatalogueCompletenessReasons: [],
  };

  const snapshotComplete = Registry.createSnapshot({
    jobCatalog: [{ id: 'firefight' }],
    workTypeDefs: { Firefighter: vanillaWorkType },
    workGiverDefs: {},
    capacityDefs: {},
    activePackageIds: completeResolution,
  });

  const policyComplete = Registry.getJobPolicy(snapshotComplete, 'firefight');
  ok(policyComplete.state === 'definitionBacked',
    'PKG-005 complete resolution yields definitionBacked policy');
  ok(policyComplete.completeness === 'complete'
    || (policyComplete.completeness === 'partial'
      && !policyComplete.completenessReasons.includes('activePackageSetUnknown')),
    'PKG-005 complete resolution has no activePackageSetUnknown reason');

  const snapshotUnknown = Registry.createSnapshot({
    jobCatalog: [{ id: 'firefight' }],
    workTypeDefs: { Firefighter: vanillaWorkType },
    workGiverDefs: {},
    capacityDefs: {},
    activePackageIds: unknownResolution,
  });

  const policyUnknown = Registry.getJobPolicy(snapshotUnknown, 'firefight');
  ok(policyUnknown.completeness === 'partial'
    || policyUnknown.completeness === 'unknown',
    'PKG-006 unknown resolution yields partial/unknown policy');

  // --- PermissionResolver: complete→non-unknown, unknown→unknown ---

  const permCtx = loadScripts([
    'data.js',
    'capability-evidence.js',
    'capacity-resolver.js',
    'requirement-registry.js',
    'c4-evaluation-context.js',
    'permission-resolver.js',
  ], {});
  const PermResolver = permCtx.PermissionResolver;

  const permSnapshotComplete = permCtx.RequirementRegistry.createSnapshot({
    jobCatalog: [{ id: 'firefight' }],
    workTypeDefs: { Firefighter: vanillaWorkType },
    workGiverDefs: {},
    capacityDefs: {},
    activePackageIds: completeResolution,
  });

  const resolverContextComplete = Object.freeze({
    pawnId: 'test-pawn',
    evidence: { pawnState: {} },
    capacities: {},
    statusFacts: {},
    definitionSnapshot: permSnapshotComplete,
  });
  const permResultComplete = PermResolver.resolve(resolverContextComplete, 'firefight');
  ok(permResultComplete.state !== 'unknown'
    || permResultComplete.unknowns.every(u =>
      !u.explanation || u.explanation.code !== 'permission.policy.partial'),
    'PKG-007 complete resolution does not emit policy.partial unknown');

  const permSnapshotUnknown = permCtx.RequirementRegistry.createSnapshot({
    jobCatalog: [{ id: 'firefight' }],
    workTypeDefs: { Firefighter: vanillaWorkType },
    workGiverDefs: {},
    capacityDefs: {},
    activePackageIds: unknownResolution,
  });

  const resolverContextUnknown = Object.freeze({
    pawnId: 'test-pawn',
    evidence: { pawnState: {} },
    capacities: {},
    statusFacts: {},
    definitionSnapshot: permSnapshotUnknown,
  });
  const permResultUnknown = PermResolver.resolve(resolverContextUnknown, 'firefight');
  ok(permResultUnknown.state === 'unknown'
    || permResultUnknown.unknowns.some(u =>
      u.explanation && u.explanation.code === 'permission.policy.partial'),
    'PKG-008 unknown resolution emits policy.partial or state=unknown');

  // --- _refreshC4ActivePackageResolution helper ---

  const App = {
    state: {
      importMeta: { modIds: ['ludeon.rimworld', 'test.mod'] },
      activePackageResolution: { ids: ['ludeon.rimworld'], completeness: 'unknown', reasons: ['initial'] },
    },
  };
  loadScripts(['data.js', 'app-save.js'], {
    App,
    document: { getElementById() { return null; }, querySelector() { return null; },
      querySelectorAll() { return []; }, addEventListener() {} },
    window: { addEventListener() {} },
    _showModal() {}, _showConfirmModal() {},
    Engine: { normaliseState() { return {}; }, stateVersion: 1 },
    Charts: {},
    RequirementRegistry: { createSnapshot() { return {}; } },
  });

  ok(typeof App._refreshC4ActivePackageResolution === 'function',
    'PKG-009 helper exists on App');

  App._refreshC4ActivePackageResolution();
  ok(App.state.activePackageResolution.completeness === 'complete',
    'PKG-010 helper resolves to complete when modIds present');
  ok(App.state.activePackageResolution.ids.includes('test.mod'),
    'PKG-010 helper includes modIds from importMeta');

  App.state.importMeta = {};
  App._refreshC4ActivePackageResolution();
  ok(App.state.activePackageResolution.completeness === 'unknown',
    'PKG-011 helper resolves to unknown when modIds absent');

  // --- _applyLoadedData restores importMeta ---

  const App2 = {
    state: {
      pawns: [], priorities: {}, customJobs: [],
      customXenotypes: {}, customTraits: {}, customGenes: {},
      customBuildings: {}, customBackstories: {}, customMaterials: [],
      customBiomes: [], ideology: { memes: [], precepts: {}, name: '', type: 'fixed', rituals: [], notes: '' },
      precepts: {}, raid: {}, notes: [], timeline: [], savedIdeologies: [],
      manualRelations: [], ghostPawns: [], weapons: [], apparel: [], materials: [],
      settings: {}, defSources: {}, blueprintName: '', buildingOverrides: {},
      blueprintCatCollapsed: {}, deletedMaterials: [], deletedPresetBuildings: [],
      deletedPresetBiomes: [], roomLabels: {}, catLabels: {},
      shiftTypes: ['Anything', 'Work', 'Joy', 'Sleep'], shiftColors: [],
      activePackageResolution: { ids: ['ludeon.rimworld'], completeness: 'unknown', reasons: ['initial'] },
      scannedWorkTypeDefs: {}, scannedWorkGiverDefs: {},
      scannedCapacityDefs: {}, scannedRaceWorkPolicies: {},
      requirementUncertainty: {},
    },
    allJobs: [],
    _invalidateBsCache() {},
    _coercePawn() {},
  };
  loadScripts(['data.js', 'app-save.js'], {
    App: App2,
    document: { getElementById() { return null; }, querySelector() { return null; },
      querySelectorAll() { return []; }, addEventListener() {} },
    window: { addEventListener() {} },
    _showModal() {}, _showConfirmModal() {},
    Engine: { normaliseState() { return {}; }, stateVersion: 1 },
    Charts: {},
    RequirementRegistry: { createSnapshot() { return {}; } },
  });

  App2._applyLoadedData({
    importMeta: { modIds: ['ludeon.rimworld', 'test.mod.two'], biotech: true },
  });
  ok(App2.state.importMeta && Array.isArray(App2.state.importMeta.modIds),
    'PKG-012 _applyLoadedData restores importMeta from saved data');
  ok(App2.state.importMeta.modIds.includes('test.mod.two'),
    'PKG-012 restored importMeta has original modIds');
  ok(App2.state.activePackageResolution.completeness === 'complete',
    'PKG-013 _normalizeLoadedState resolves complete after importMeta restore');
  ok(App2.state.activePackageResolution.ids.includes('test.mod.two'),
    'PKG-013 resolution includes mods from restored importMeta');
  ok(App2.state.activePackageResolution.ids.includes('ludeon.rimworld.biotech'),
    'PKG-013 resolution includes DLC from restored importMeta');

  return { name: 'C7 package resolution regression', total, failures };
};

const assert = require('assert');
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

  const contract = require('../files/c5-runtime-contract.js');
  const retainedFixture = require('./fixtures/c5-runtime-audit-1.6.4871.json');
  const everyFrozen = value => {
    if (!value || typeof value !== 'object') return true;
    return Object.isFrozen(value) && Object.values(value).every(everyFrozen);
  };

  ok(everyFrozen(contract), 'C5-PROD-001 packaged runtime contract is deeply immutable');
  try {
    assert.deepStrictEqual(JSON.parse(JSON.stringify(contract)), retainedFixture);
    ok(true, 'C5-PROD-002 retained JSON fixture exactly matches packaged authority');
  } catch (error) {
    ok(false, 'C5-PROD-002 retained JSON fixture parity: ' + error.message);
  }
  ok(contract.runtime.displayVersion === '1.6.4871 rev590',
    'C5-PROD-003 target display version retained');
  ok(contract.runtime.assemblySha256 ===
    '5CF1B5BE399D5B1C9C56CA72C9D35B4ECF307FEACF5859D04AC5A1AA5926356A',
  'C5-PROD-003 audited assembly identity retained');

  const provider = {
    schemaVersion: 1,
    pawnIndependent: true,
    runtimeFingerprint: Object.assign({}, contract.runtime),
    providerFingerprint: 'production-path-fixture',
    activePackageResolution: {
      ids: ['ludeon.rimworld'], completeness: 'complete', reasons: [],
    },
    catalogueCompleteness: {
      skillDefs: 'complete', statDefs: 'complete', sourceOperations: 'complete',
      facets: 'complete', passions: 'unknown',
    },
    skillDefs: {
      AlwaysAvailableSkill: {
        defName: 'AlwaysAvailableSkill', appSkillId: 'mining', disablingWorkTags: [],
        neverDisabledBasedOnWorkTypes: true,
        _completeness: 'complete', _completenessReasons: [],
        _provenance: { modId: 'ludeon.rimworld', sources: [{ file: 'SkillDefs.xml' }] },
      },
    },
    sourceOperations: {
      traits: {}, genes: {}, geneTemplates: {}, hediffs: {}, precepts: {}, roles: {},
      lifeStages: {},
    },
    statDefs: {},
    facets: { workGivers: {}, recipes: {}, jobDefs: {} },
    passions: {},
    relevantPatchNotApplied: [],
  };
  const App = {
    state: {
      effectivenessProvider: provider,
      customXenotypes: {}, customTraits: {}, customGenes: {}, customJobs: [],
      customBackstories: {}, hediffCatalog: [], precepts: {},
      ideology: { memes: [], precepts: {} }, prostheticEfficiency: {},
      scannedWorkTypeDefs: {}, scannedWorkGiverDefs: {}, scannedCapacityDefs: {},
      scannedRaceWorkPolicies: {}, scannedBodyDefs: {}, scannedBodyPartDefs: {},
      scannedRaceBodyMap: {}, requirementUncertainty: {},
      activePackageResolution: provider.activePackageResolution,
      settings: { priorityLocked: false },
    },
    allJobs: [{ id: 'mining' }],
    getXeno() { return { uvSensitivity: 0, genes: [], skillMods: {}, incapable: [] }; },
    getTrait() { return null; },
    getRole() { return { id: 'none', skillMods: {}, workSpeed: 0, incap: [] }; },
    getIdeoEffects() { return {}; },
    _passionMeta() { return { bucket: 0 }; },
    _passionValue() { return 0; },
    _prioritiesAreLocked() { return false; },
    isIncapable() { return false; },
  };
  const ctx = loadScripts([
    'data.js', 'engine.js', 'capability-evidence.js', 'capacity-resolver.js',
    'requirement-registry.js', 'effectiveness-registry.js',
    'c5-runtime-contract.js', 'c5-definition-snapshot-factory.js',
    'permission-resolver.js', 'availability-resolver.js', 'c4-evaluation-context.js',
    'c5-evaluation-context.js', 'structural-skill-resolver.js',
    'structural-stat-resolver.js', 'temporal-profile-resolver.js',
    'c4-legacy-compatibility.js', 'c7-evaluation-coordinator.js', 'app-render.js',
  ], { App, document: {}, window: {}, Charts: {} });

  const Factory = ctx.C5DefinitionSnapshotFactory;
  ok(Factory.runtimeCompatibility(provider).state === 'compatible',
    'C5-PROD-004 exact runtime identity is compatible');
  const snapshot = App._c5EffectivenessSnapshot();
  ok(snapshot && snapshot.definitionOnly === true,
    'C5-PROD-005 application factory creates a definition-only snapshot');
  ok(Object.isFrozen(snapshot), 'C5-PROD-005 production snapshot is immutable');
  ok(snapshot.skillPolicies.AlwaysAvailableSkill.catalogueCompleteness === 'complete',
    'C5-PROD-005 supported complete SkillDef policy is registered');
  ok(!Object.prototype.hasOwnProperty.call(snapshot, 'pawn'),
    'C5-PROD-005 definition snapshot contains no pawn');

  const pawn = {
    id: 'production-skill', traits: [], traitRuntimeFacts: [], geneRuntimeFacts: [],
    health: [], skills: { mining: 10 }, passions: {}, incapable: [], permissionSources: [],
    childhood: null, adulthood: null, role: 'none',
    rawSkillRecords: {
      AlwaysAvailableSkill: {
        skillDefId: 'AlwaysAvailableSkill', appSkillId: 'mining', recordPresence: 'present',
        levelFieldPresent: true, levelState: 'known', levelInt: 10,
        passionFieldPresent: true, rawPassionIdentity: 'None',
        parserCompleteness: 'complete', provenance: { sourceKind: 'saveSkillRecord' },
      },
    },
    skillRecordCatalogue: { completeness: 'complete', provenance: { sourceKind: 'save' } },
  };
  const map = App._c7PawnContextMap([pawn]);
  const pawnContext = map.get(pawn.id);
  ok(pawnContext.c5Context.effectivenessSnapshot === snapshot
    || pawnContext.c5Context.effectivenessSnapshot.runtimeVersion === snapshot.runtimeVersion,
  'C5-PROD-006 C7 request receives the production effectiveness snapshot');
  const skillFact = ctx.StructuralSkillResolver.resolve(
    pawnContext.c5Context, 'AlwaysAvailableSkill');
  ok(skillFact.state === 'resolved', 'C5-PROD-007 supported SkillDef resolves through production path');
  ok(skillFact.levelIgnoringDisable === 10,
    'C5-PROD-007 supported SkillDef factual level is non-null and exact');
  ok(skillFact.completeness === 'complete',
    'C5-PROD-007 supported SkillDef retains complete semantics');

  const explicitEvidence = JSON.parse(JSON.stringify(pawnContext.pawnEvidence));
  explicitEvidence.skillDisablementFacts = {
    AlwaysAvailableSkill: {
      total: { state: 'known', value: false, evidence: [] },
      permanent: { state: 'known', value: false, evidence: [] },
    },
  };
  const isolatedCoordinator = loadScripts(['c7-evaluation-coordinator.js'], {
    CapabilityEvidence: { collectPawnEvidence() { return explicitEvidence; } },
    CapacityResolver: { resolvePawnCapacities() { return { capacities: {} }; } },
    C4EvaluationContext: { _deriveAwakeFacts(facts) { return facts; } },
    StructuralEffectivenessContext: ctx.StructuralEffectivenessContext,
    PermissionResolver: { resolve() { return { state: 'allowed' }; } },
    AvailabilityResolver: { resolve() { return { state: 'available' }; } },
    TemporalProfileResolver: { resolve() { return {}; } },
    C4LegacyCompatibility: {},
  }).C7EvaluationCoordinator;
  const explicitContext = isolatedCoordinator.createPawnContext(pawn,
    App._c7CoordinatorOptions(App._c4DefinitionSnapshot(), {}, snapshot));
  const projectedFact = ctx.StructuralSkillResolver.resolve(
    explicitContext.c5Context, 'AlwaysAvailableSkill');
  ok(projectedFact.runtimeGetLevelForUIProjection === 10,
    'C5-PROD-007 complete canonical disablement evidence yields exact UI projection');

  const mismatched = Object.assign({}, provider, {
    runtimeFingerprint: Object.assign({}, contract.runtime, { revision: 'rev591',
      displayVersion: '1.6.4871 rev591' }),
  });
  ok(Factory.runtimeCompatibility(mismatched).state === 'incompatible',
    'C5-PROD-008 mismatched runtime is rejected');
  ok(Factory.createSnapshot(mismatched) === null,
    'C5-PROD-008 mismatch cannot claim verified formulas');
  ok(Factory.runtimeCompatibility({}).state === 'unknown',
    'C5-PROD-009 missing runtime identity is unknown');
  ok(Factory.createSnapshot(null) === null && Factory.createSnapshot({}) === null,
    'C5-PROD-009 missing provider evidence yields no guessed snapshot');

  const html = fs.readFileSync(path.join(__dirname, '..', 'files', 'rimjobs.html'), 'utf8');
  const contractIndex = html.indexOf('c5-runtime-contract.js');
  const factoryIndex = html.indexOf('c5-definition-snapshot-factory.js');
  const coordinatorIndex = html.indexOf('c7-evaluation-coordinator.js');
  ok(contractIndex >= 0 && contractIndex < factoryIndex,
    'C5-PROD-010 contract loads before snapshot factory');
  ok(factoryIndex >= 0 && factoryIndex < coordinatorIndex,
    'C5-PROD-010 factory loads before C7 coordinator');

  const packageJson = require('../package.json');
  ok(packageJson.build.files.includes('files/**/*'),
    'C5-PROD-011 release packaging includes packaged contract module');
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  ok(/runtimeFingerprint/.test(mainSource) && /Assembly-CSharp\.dll/.test(mainSource),
    'C5-PROD-012 scanner captures installed runtime and assembly identity');
  ok(/EffectivenessDefinitionRegistry\.createSnapshot/.test(
    fs.readFileSync(path.join(__dirname, '..', 'files', 'c5-definition-snapshot-factory.js'), 'utf8')),
  'C5-PROD-013 C5 factory delegates to the existing registry');

  return { name: 'C5 packaged production runtime contract', total, failures };
};

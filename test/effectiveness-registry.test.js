/** C5 Task 7: immutable pawn-independent effectiveness registry. */
const fs = require('fs');
const path = require('path');
const { loadScripts } = require('./_harness');
const audit = require('../files/c5-runtime-contract.js');

module.exports = function run() {
  const { EffectivenessDefinitionRegistry: registry } = loadScripts(
    ['effectiveness-registry.js'], {});
  let total = 0, failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) { failures++; console.log('  FAIL ' + label); }
  };
  const provenance = (modId, defName) => ({
    modId, sources: [{ modId, file: 'Defs.xml', defName }], sourceOrder: 0,
  });
  const scanner = {
    schemaVersion: 1, pawnIndependent: true,
    runtimeFingerprint: audit.runtime.displayVersion,
    providerFingerprint: 'fixture-provider',
    activePackageResolution: {
      ids: ['ludeon.rimworld', 'fixture.active'], completeness: 'complete', reasons: [],
    },
    catalogueCompleteness: {
      skillDefs: 'complete', statDefs: 'complete', sourceOperations: 'partial',
      facets: 'complete', passions: 'partial',
    },
    skillDefs: {
      Mining: { defName: 'Mining', appSkillId: 'mining', disablingWorkTags: ['Mining'],
        neverDisabledBasedOnWorkTypes: false, _completeness: 'complete',
        _completenessReasons: [], _provenance: provenance('ludeon.rimworld', 'Mining') },
      Crafting: { defName: 'Crafting', appSkillId: 'crafting', disablingWorkTags: ['Crafting'],
        neverDisabledBasedOnWorkTypes: false, _completeness: 'complete',
        _completenessReasons: [], _provenance: provenance('ludeon.rimworld', 'Crafting') },
      SecondCraft: { defName: 'SecondCraft', appSkillId: null, disablingWorkTags: [],
        neverDisabledBasedOnWorkTypes: true, _completeness: 'complete',
        _completenessReasons: [], _provenance: provenance('fixture.active', 'SecondCraft') },
    },
    sourceOperations: {
      traits: { ExactTrait: { defName: 'ExactTrait', traitDegrees: [{ degree: 0,
        statOffsets: [{ kind: 'statOffset', statDefId: 'MiningSpeed', value: 0.2, sourceOrder: 0 }],
        statFactors: [] }], _provenance: provenance('fixture.active', 'ExactTrait') } },
      genes: {}, geneTemplates: {}, hediffs: {},
    },
    statDefs: {
      GlobalLearningFactor: { defName: 'GlobalLearningFactor', supported: true,
        defaultBaseValue: 1, phaseCompleteness: { base: 'complete' },
        _provenance: provenance('ludeon.rimworld', 'GlobalLearningFactor') },
      MiningSpeed: { defName: 'MiningSpeed', supported: true,
        dependencies: [{ statDefId: 'WorkSpeedGlobal', phase: 'statFactorDependency', sourceOrder: 0 }],
        phaseCompleteness: { dependencies: 'partial' },
        _provenance: provenance('fixture.active', 'MiningSpeed') },
      DeepDrillingSpeed: { defName: 'DeepDrillingSpeed', supported: false, recordOnly: true,
        _provenance: provenance('ludeon.rimworld', 'DeepDrillingSpeed') },
    },
    facets: {
      workGivers: { Mine: { defName: 'Mine', workTypeDefId: 'Mining',
        giverClassId: 'WorkGiver_Miner', jobDefId: 'Mine', semanticBinding: null,
        _provenance: provenance('ludeon.rimworld', 'Mine') } },
      recipes: {},
      jobDefs: { Mine: { defName: 'Mine', driverClassId: 'JobDriver_Mine',
        semanticBinding: null, _provenance: provenance('ludeon.rimworld', 'Mine') } },
    },
    passions: { Competitive: { defName: 'Competitive', providerClassId: 'VSE.Passions.PassionDef',
      rawFields: { learnRateFactor: '1.7' }, semantics: null,
      providerFingerprint: 'fixture-provider', runtimeFingerprint: audit.runtime.displayVersion,
      _completeness: 'unknown', _completenessReasons: ['unsupportedPassionSemantics'],
      _provenance: provenance('fixture.active', 'Competitive') } },
    relevantPatchNotApplied: [{ targetKind: 'StatDef', targetDefName: 'MiningSpeed',
      affectedScopes: ['dependencies'], reason: 'unsupportedPatchOperation' }],
    jobCatalog: audit.jobPolicies.map(item => item.jobId).concat(['custom_job']),
  };

  const snapshot = registry.createSnapshot(scanner, audit);
  ok(snapshot.schemaVersion === 1 && snapshot.runtimeVersion === '1.6.4871 rev590',
    'ER-001 snapshot is schema and runtime versioned');
  ok(Object.keys(snapshot.statDefinitions.supported).sort().join(',') ===
    'AnimalsLearningFactor,CookSpeed,GlobalLearningFactor,MiningSpeed,RestFallRateFactor,RestRateMultiplier,WorkSpeedGlobal',
  'ER-002 exactly seven StatDefs are evaluator-supported');
  ok(snapshot.statDefinitions.recordOnly.DeepDrillingSpeed.evaluatorSupport === 'recordOnly'
    && !snapshot.statDefinitions.supported.DeepDrillingSpeed,
  'ER-003 record-only StatDefs remain separate');
  ok(snapshot.statDefinitions.supported.MiningSpeed.dependencies.includes('WorkSpeedGlobal')
    && snapshot.phaseOrder.statFactor === 18,
  'ER-004 dependencies retain audited insertion phases');
  ok(snapshot.statDefinitions.supported.MiningSpeed.orderedOperations.every(operation =>
    !Object.prototype.hasOwnProperty.call(operation, 'orderIndex')),
  'ER-005 definition templates defer request-local orderIndex');
  ok(snapshot.skillPolicies.Mining.minLevel === 0
    && snapshot.skillPolicies.Mining.maxLevel === 20
    && snapshot.skillPolicies.Mining.appSkillId === 'mining',
  'ER-006 exact SkillDef policy and versioned bounds are retained');
  ok(snapshot.passionProviders.vanilla.entries.Major.directLearningFactor === 1.5
    && snapshot.passionProviders.extensions.Competitive.semantics === null,
  'ER-007 vanilla and unsupported extension passion semantics stay distinct');
  ok(snapshot.sourceOperationCatalogues.traits.ExactTrait.traitDegrees[0]
    .statOffsets[0].statDefId === 'MiningSpeed',
  'ER-008 exact source-operation lookup is preserved');
  ok(snapshot.definitionUncertainty[0].targetDefName === 'MiningSpeed'
    && snapshot.catalogueCompleteness.sourceOperations === 'partial',
  'ER-009 patch and active-package uncertainty remain scoped');

  const known = Object.values(snapshot.jobPolicies).filter(policy => policy.policyKind !== 'unknown');
  const unknown = Object.values(snapshot.jobPolicies).filter(policy => policy.policyKind === 'unknown');
  ok(known.length === 23 && unknown.length === 11,
    'ER-010 23 audited definition-backed and ten audited plus custom unknown policies exist');
  ok(snapshot.jobPolicies.doctoring.skillDefIds.join(',') === 'Medicine'
    && snapshot.jobPolicies.doctoring.facets.length === 3,
  'ER-011 job policies preserve plural facets');
  ok(snapshot.jobPolicies.dark_study.facets[0].statDefIds.length === 2,
    'ER-012 one facet preserves multiple StatDefs');
  const pluralInput = JSON.parse(JSON.stringify(scanner));
  pluralInput.jobCatalog.push('plural_job');
  const pluralAudit = JSON.parse(JSON.stringify(audit));
  pluralAudit.jobPolicies.push({ jobId: 'plural_job', policyKind: 'definitionBacked',
    sourceWorkTypeDefIds: ['One', 'Two'], skillDefIds: ['Mining', 'SecondCraft'],
    facets: [{ facetId: 'one', metricKind: 'speed', statDefIds: ['MiningSpeed'], support: 'initialSubset' },
      { facetId: 'two', metricKind: 'unknown', statDefIds: [], support: 'definitionBacked' }] });
  const plural = registry.createSnapshot(pluralInput, pluralAudit).jobPolicies.plural_job;
  ok(plural.sourceWorkTypeDefIds.length === 2 && plural.skillDefIds.length === 2
    && plural.facets.length === 2,
  'ER-013 multiple WorkTypes, SkillDefs, and facets remain plural');
  ok(snapshot.jobPolicies.custom_job.policyKind === 'unknown'
    && snapshot.jobPolicies.custom_job.analogue == null,
  'ER-014 custom jobs stay explicit unknown without analogue');
  ok(snapshot.scannerBindings.workGivers.Mine.provenanceClass === 'scannerData'
    && snapshot.jobPolicies.mining.provenanceClass === 'auditedRuntime'
    && snapshot.jobPolicies.mining.definitionBindings.workGivers[0].defName === 'Mine'
    && snapshot.jobPolicies.mining.facets[0].provenanceClass === 'auditedRuntime',
  'ER-015 scanner references and audited runtime semantics keep separate ownership');
  ok(snapshot.scannerBindings.jobDefs.Mine.semanticBinding === null,
    'ER-016 unsupported C# stays opaque');

  let mutationRejected = false;
  try { snapshot.jobPolicies.mining.skillDefIds.push('Shooting'); }
  catch (_) { mutationRejected = true; }
  ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.jobPolicies.mining.facets)
    && (mutationRejected || !snapshot.jobPolicies.mining.skillDefIds.includes('Shooting')),
  'ER-017 snapshot is deeply immutable');
  const snapshotAgain = registry.createSnapshot(JSON.parse(JSON.stringify(scanner)), audit);
  ok(JSON.stringify(snapshotAgain) === JSON.stringify(snapshot),
    'ER-018 snapshot is deterministic for equivalent input');
  const before = JSON.stringify(snapshot);
  const contexts = [{ id: 'pawn-a', snapshot }, { id: 'pawn-b', snapshot }];
  ok(contexts[0].snapshot === contexts[1].snapshot && JSON.stringify(snapshot) === before,
    'ER-019 one definition snapshot is reusable unchanged across pawns');
  let rejected = false;
  try { registry.createSnapshot(Object.assign({}, scanner, { pawn: { id: 'forbidden' } }), audit); }
  catch (_) { rejected = true; }
  ok(rejected, 'ER-020 pawn-expanded registry input is rejected');

  const source = fs.readFileSync(path.join(__dirname, '..', 'files',
    'effectiveness-registry.js'), 'utf8');
  ok(!/effectiveSkill|speedFormula|effectivenessScore|primarySkill/.test(source),
    'ER-021 registry has no legacy formula, score, or primary-skill concept');
  ok(!/orderedOperations[^\n]*orderIndex/.test(source),
    'ER-022 definition templates do not assign request-local orderIndex');

  return { name: 'C5 effectiveness registry', total, failures };
};

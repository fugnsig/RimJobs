/** C6 Task 1: RestFallRateFactor and RestRateMultiplier registration. */
const { loadScripts } = require('./_harness');
const audit = require('./fixtures/c5-runtime-audit-1.6.4871.json');

module.exports = function run() {
  let total = 0, failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) { failures++; console.log('  FAIL ' + label); }
  };

  // -- C6-REG-001: audit fixture contains both rest StatDefs with correct bases --
  ok(audit.statDefs.RestFallRateFactor
    && audit.statDefs.RestFallRateFactor.defaultBaseValue === 1
    && audit.statDefs.RestFallRateFactor.minValue === 0.0001,
  'C6-REG-001a RestFallRateFactor present with audited base 1 and minValue 0.0001');
  ok(audit.statDefs.RestRateMultiplier
    && audit.statDefs.RestRateMultiplier.defaultBaseValue === 1.0
    && audit.statDefs.RestRateMultiplier.minValue === 0.05,
  'C6-REG-001b RestRateMultiplier present with audited base 1.0 and minValue 0.05');

  // -- C6-REG-002: registry snapshot places them in supported, not recordOnly --
  {
    const { EffectivenessDefinitionRegistry: registry } = loadScripts(
      ['effectiveness-registry.js'], {});
    const provenance = (modId, defName) => ({
      modId, sources: [{ modId, file: 'Defs.xml', defName }], sourceOrder: 0,
    });
    const scanner = {
      schemaVersion: 1, pawnIndependent: true,
      runtimeFingerprint: audit.runtime.displayVersion,
      providerFingerprint: 'fixture-provider',
      activePackageResolution: {
        ids: ['ludeon.rimworld'], completeness: 'complete', reasons: [],
      },
      catalogueCompleteness: {
        skillDefs: 'complete', statDefs: 'complete', sourceOperations: 'complete',
        facets: 'complete', passions: 'complete',
      },
      skillDefs: {},
      sourceOperations: { traits: {}, genes: {}, geneTemplates: {}, hediffs: {} },
      statDefs: {
        RestFallRateFactor: { defName: 'RestFallRateFactor', supported: true,
          defaultBaseValue: 1, phaseCompleteness: { base: 'complete' },
          _provenance: provenance('ludeon.rimworld', 'RestFallRateFactor') },
        RestRateMultiplier: { defName: 'RestRateMultiplier', supported: true,
          defaultBaseValue: 1, phaseCompleteness: { base: 'complete' },
          _provenance: provenance('ludeon.rimworld', 'RestRateMultiplier') },
      },
      facets: { workGivers: {}, recipes: {}, jobDefs: {} },
      passions: {},
      relevantPatchNotApplied: [],
      jobCatalog: audit.jobPolicies.map(item => item.jobId),
    };
    const snapshot = registry.createSnapshot(scanner, audit);
    ok(snapshot.statDefinitions.supported.RestFallRateFactor
      && snapshot.statDefinitions.supported.RestFallRateFactor.evaluatorSupport === 'initialSubset',
    'C6-REG-002a RestFallRateFactor in supported with initialSubset');
    ok(snapshot.statDefinitions.supported.RestRateMultiplier
      && snapshot.statDefinitions.supported.RestRateMultiplier.evaluatorSupport === 'initialSubset',
    'C6-REG-002b RestRateMultiplier in supported with initialSubset');
    ok(!snapshot.statDefinitions.recordOnly.RestFallRateFactor
      && !snapshot.statDefinitions.recordOnly.RestRateMultiplier,
    'C6-REG-002c neither rest stat appears in recordOnly');
  }

  // -- Resolver setup (shared by C6-REG-003 through C6-REG-007) --
  const ctx = loadScripts(['structural-skill-resolver.js', 'structural-stat-resolver.js'], {});
  const Resolver = ctx.StructuralStatResolver;

  const phases = { base: 1, skillNeedOffset: 2, capacityOffset: 3, traitOffset: 4,
    hediffOffset: 5, preceptOffset: 6, roleOffset: 7, geneOffset: 8,
    lifeStageOffset: 9, equipmentOffset: 10, traitFactor: 11, hediffFactor: 12,
    preceptFactor: 13, roleFactor: 14, geneFactor: 15, lifeStageFactor: 16,
    requestThingOperation: 17, statFactor: 18, skillNeedFactor: 19,
    capacityFactor: 20, inspiration: 21, statPart: 22, postProcessCurve: 23,
    postProcessStatFactor: 24, scenarioFactor: 25, roundToFiveOver: 26,
    roundValue: 27, clamp: 28 };

  const op = (id, phase, kind, operand, extra) => Object.assign({
    operationTemplateId: id, phase, phaseOrder: phases[phase], sourceOrder: 0,
    kind, statDefId: null, sourceDefId: null, dependencyStatDefId: null,
    skillDefId: null, capacityDefId: null, statPartClass: null,
    durability: 'durable', applicability: 'applicable', operand: Object.assign({
      value: null, scale: null, weight: null, max: null, min: null,
      allowedDefect: null, useReciprocal: null, curvePoints: [],
    }, operand || {}), semanticsSupport: 'supported', completeness: 'complete',
    compatibilityOnly: false, unresolved: [],
  }, extra || {});

  const definition = (id, operations, dependencies) => ({
    schemaVersion: 1, runtimeVersion: '1.6.4871 rev590', statDefId: id,
    evaluatorSupport: 'initialSubset', orderedOperations: operations.map(item =>
      Object.assign({}, item, { statDefId: id })), dependencies: dependencies || [],
  });

  const allComplete = Object.fromEntries([
    'traitOffsets', 'hediffOffsets', 'preceptOffsets', 'roleOffsets',
    'geneOffsets', 'lifeStageOffsets', 'equipmentOffsets', 'traitFactors',
    'hediffFactors', 'preceptFactors', 'roleFactors', 'geneFactors',
    'lifeStageFactors', 'requestThingOperations', 'inspirationOperations',
    'scenarioContext',
  ].map(id => [id, { completeness: 'complete', byStatDef: {}, evidence: [] }]));

  const makeContext = (definitions, overrides) => Object.freeze(Object.assign({
    runtimeVersion: '1.6.4871 rev590',
    effectivenessSnapshot: Object.freeze({ runtimeVersion: '1.6.4871 rev590',
      phaseOrder: phases, statDefinitions: { supported: definitions, recordOnly: {} },
      skillPolicies: {} }),
    pawnEvidence: { statOperations: [], sourceFamilyCompleteness: allComplete,
      structuralContextFacts: { biologicalAge: { state: 'unknown', value: null, evidence: [] },
        slaveStatus: { state: 'unknown', value: null, evidence: [] },
        raceProperties: { humanlike: { state: 'unknown', value: null, evidence: [] } } },
      pawnState: { baseSkillFacts: {} }, skillOperations: [] },
    structuralCapacities: { capacities: {} },
  }, overrides || {}));

  // -- C6-REG-003: base resolution with no modifiers returns audited base 1.0 --
  {
    const restFallDef = definition('RestFallRateFactor', [
      op('base', 'base', 'setBase', { value: 1 }),
    ]);
    const restRateDef = definition('RestRateMultiplier', [
      op('base', 'base', 'setBase', { value: 1 }),
      op('bp-factor', 'capacityFactor', 'capacityFactor',
        { weight: 0.3, max: null, allowedDefect: 0, useReciprocal: false },
        { capacityDefId: 'BloodPumping', sourceOrder: 0 }),
      op('meta-factor', 'capacityFactor', 'capacityFactor',
        { weight: 0.3, max: null, allowedDefect: 0, useReciprocal: false },
        { capacityDefId: 'Metabolism', sourceOrder: 1 }),
      op('breath-factor', 'capacityFactor', 'capacityFactor',
        { weight: 0.3, max: null, allowedDefect: 0, useReciprocal: false },
        { capacityDefId: 'Breathing', sourceOrder: 2 }),
    ]);
    const defs = { RestFallRateFactor: restFallDef, RestRateMultiplier: restRateDef };
    const fallResult = Resolver.resolve(makeContext(defs), 'RestFallRateFactor');
    ok(fallResult.resolvedPrefixValue === 1,
      'C6-REG-003a RestFallRateFactor base resolves to 1.0 with no modifiers');
    ok(fallResult.state === 'resolved',
      'C6-REG-003b RestFallRateFactor state is resolved with complete families');

    const rateResult = Resolver.resolve(makeContext(defs), 'RestRateMultiplier');
    ok(rateResult.resolvedPrefixValue === 1,
      'C6-REG-003c RestRateMultiplier base resolves to 1.0 with no modifiers (no capacity input)');
  }

  // -- C6-REG-004: pawn trait offset modifies RestRateMultiplier --
  {
    const restRateDef = definition('RestRateMultiplier', [
      op('base', 'base', 'setBase', { value: 1 }),
    ]);
    const defs = { RestRateMultiplier: restRateDef };
    const result = Resolver.resolve(makeContext(defs, { pawnEvidence: {
      statOperations: [
        { operationId: 'quick-sleeper', kind: 'statOffset', statDefId: 'RestRateMultiplier',
          value: 0.5, phase: 'traitOffset', phaseOrder: 4, sourceOrder: 0,
          sourceInstanceOrder: 0, sourceFamily: 'traitOffsets', applicability: 'applicable',
          durability: 'durable', canonicalEligible: true, compatibilityOnly: false,
          superseded: false, completeness: 'complete' },
      ], sourceFamilyCompleteness: allComplete,
      structuralContextFacts: { biologicalAge: { state: 'unknown', value: null, evidence: [] },
        slaveStatus: { state: 'unknown', value: null, evidence: [] },
        raceProperties: { humanlike: { state: 'unknown', value: null, evidence: [] } } },
      pawnState: { baseSkillFacts: {} }, skillOperations: [] } }), 'RestRateMultiplier');
    ok(result.resolvedPrefixValue === 1.5,
      'C6-REG-004 Quick Sleeper trait offset +0.5 yields 1.5');
  }

  // -- C6-REG-005: pawn gene factor modifies RestFallRateFactor --
  {
    const restFallDef = definition('RestFallRateFactor', [
      op('base', 'base', 'setBase', { value: 1 }),
    ]);
    const defs = { RestFallRateFactor: restFallDef };
    const result = Resolver.resolve(makeContext(defs, { pawnEvidence: {
      statOperations: [
        { operationId: 'low-sleep', kind: 'statFactor', statDefId: 'RestFallRateFactor',
          value: 0.4, phase: 'geneFactor', phaseOrder: 15, sourceOrder: 0,
          sourceInstanceOrder: 0, sourceFamily: 'geneFactors', applicability: 'applicable',
          durability: 'durable', canonicalEligible: true, compatibilityOnly: false,
          superseded: false, completeness: 'complete' },
      ], sourceFamilyCompleteness: allComplete,
      structuralContextFacts: { biologicalAge: { state: 'unknown', value: null, evidence: [] },
        slaveStatus: { state: 'unknown', value: null, evidence: [] },
        raceProperties: { humanlike: { state: 'unknown', value: null, evidence: [] } } },
      pawnState: { baseSkillFacts: {} }, skillOperations: [] } }), 'RestFallRateFactor');
    ok(Math.abs(result.resolvedPrefixValue - 0.4) < 1e-9,
      'C6-REG-005 Low Sleep gene factor 0.4 yields 0.4');
  }

  // -- C6-REG-006: modifiers to one rest stat do not affect the other --
  {
    const restFallDef = definition('RestFallRateFactor', [
      op('base', 'base', 'setBase', { value: 1 }),
    ]);
    const restRateDef = definition('RestRateMultiplier', [
      op('base', 'base', 'setBase', { value: 1 }),
    ]);
    const defs = { RestFallRateFactor: restFallDef, RestRateMultiplier: restRateDef };
    const result = Resolver.resolve(makeContext(defs, { pawnEvidence: {
      statOperations: [
        { operationId: 'quick-sleeper', kind: 'statOffset', statDefId: 'RestRateMultiplier',
          value: 0.5, phase: 'traitOffset', phaseOrder: 4, sourceOrder: 0,
          sourceInstanceOrder: 0, sourceFamily: 'traitOffsets', applicability: 'applicable',
          durability: 'durable', canonicalEligible: true, compatibilityOnly: false,
          superseded: false, completeness: 'complete' },
      ], sourceFamilyCompleteness: allComplete,
      structuralContextFacts: { biologicalAge: { state: 'unknown', value: null, evidence: [] },
        slaveStatus: { state: 'unknown', value: null, evidence: [] },
        raceProperties: { humanlike: { state: 'unknown', value: null, evidence: [] } } },
      pawnState: { baseSkillFacts: {} }, skillOperations: [] } }), 'RestFallRateFactor');
    ok(result.resolvedPrefixValue === 1,
      'C6-REG-006 RestFallRateFactor unaffected by RestRateMultiplier offset');
  }

  // -- C6-REG-007: incomplete source family triggers frontier and degrades completeness --
  {
    const restFallDef = definition('RestFallRateFactor', [
      op('base', 'base', 'setBase', { value: 1 }),
      op('late', 'geneFactor', 'multiply', { value: 2 }),
    ]);
    const defs = { RestFallRateFactor: restFallDef };
    const family = JSON.parse(JSON.stringify(allComplete));
    family.traitOffsets = { completeness: 'partial', byStatDef: { RestFallRateFactor: 'partial' }, evidence: [] };
    const result = Resolver.resolve(makeContext(defs, { pawnEvidence: {
      statOperations: [], sourceFamilyCompleteness: family,
      structuralContextFacts: { biologicalAge: { state: 'unknown', value: null, evidence: [] },
        slaveStatus: { state: 'unknown', value: null, evidence: [] },
        raceProperties: { humanlike: { state: 'unknown', value: null, evidence: [] } } },
      pawnState: { baseSkillFacts: {} }, skillOperations: [] } }), 'RestFallRateFactor');
    ok(result.state === 'partial',
      'C6-REG-007 incomplete source family degrades to partial');
  }

  return { name: 'C6 rest stat registration', total, failures };
};

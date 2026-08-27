/** C5 Task 9: ordered StatResolver, frontier, dependency, and cycle contracts. */
const fs = require('fs');
const path = require('path');
const { loadScripts } = require('./_harness');

module.exports = function run() {
  const ctx = loadScripts(['structural-skill-resolver.js', 'structural-stat-resolver.js'], {});
  const Resolver = ctx.StructuralStatResolver;
  let total = 0, failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) { failures++; console.log('  FAIL ' + label); }
  };
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

  // C5-ST-001: audited phase order defeats the offset/factor reversal trap.
  {
    const defs = { Test: definition('Test', [
      op('factor', 'traitFactor', 'multiply', { value: 2 }, { sourceOrder: 1 }),
      op('base', 'base', 'setBase', { value: 1 }),
      op('offset', 'traitOffset', 'add', { value: 0.5 }),
    ]) };
    const result = Resolver.resolve(makeContext(defs), 'Test');
    ok(result.state === 'resolved' && result.resolvedPrefixValue === 3,
      'C5-ST-001 offset precedes factor regardless of input array order');
    ok(result.applied.map(item => item.operation.orderIndex).join(',') === '0,1,2'
      && result.applied.map(item => item.operation.phaseOrder).join(',') === '1,4,11',
    'C5-ST-002 request-local orderIndex is zero-based and phase ordered');
  }

  // C5-ST-003/004: current-pawn operations merge by phase/source order; unrelated targets do not.
  {
    const defs = { Test: definition('Test', [op('base', 'base', 'setBase', { value: 1 })]) };
    const context = makeContext(defs, { pawnEvidence: {
      statOperations: [
        { operationId: 'later', kind: 'statOffset', statDefId: 'Test', value: 0.3,
          phase: 'traitOffset', phaseOrder: 4, sourceOrder: 2, sourceInstanceOrder: 1,
          sourceFamily: 'traitOffsets', applicability: 'applicable', durability: 'durable',
          canonicalEligible: true, compatibilityOnly: false, superseded: false, completeness: 'complete' },
        { operationId: 'earlier', kind: 'statOffset', statDefId: 'Test', value: 0.2,
          phase: 'traitOffset', phaseOrder: 4, sourceOrder: 1, sourceInstanceOrder: 0,
          sourceFamily: 'traitOffsets', applicability: 'applicable', durability: 'durable',
          canonicalEligible: true, compatibilityOnly: false, superseded: false, completeness: 'complete' },
        { operationId: 'other', kind: 'statOffset', statDefId: 'Other', value: 99,
          phase: 'traitOffset', phaseOrder: 4, sourceOrder: 0, sourceInstanceOrder: 0,
          sourceFamily: 'traitOffsets', applicability: 'applicable', durability: 'durable',
          canonicalEligible: true, compatibilityOnly: false, superseded: false, completeness: 'complete' },
      ], sourceFamilyCompleteness: allComplete, structuralContextFacts: {},
      pawnState: { baseSkillFacts: {} }, skillOperations: [] } });
    const result = Resolver.resolve(context, 'Test');
    ok(result.resolvedPrefixValue === 1.5
      && result.applied.map(item => item.operation.operationId).slice(1).join(',') === 'earlier,later',
    'C5-ST-003 pawn operations retain deterministic source order');
    ok(!result.applied.some(item => item.operation.operationId === 'other'),
      'C5-ST-004 unrelated pawn operation is excluded');
  }

  // C5-ST-005/006: complete empty is no-op; partial empty frontiers at its phase.
  {
    const defs = { Test: definition('Test', [op('base', 'base', 'setBase', { value: 2 }),
      op('late', 'geneFactor', 'multiply', { value: 3 })]) };
    const complete = Resolver.resolve(makeContext(defs), 'Test');
    ok(complete.state === 'resolved' && complete.resolvedPrefixValue === 6,
      'C5-ST-005 complete empty source families do not frontier');
    const family = JSON.parse(JSON.stringify(allComplete));
    family.traitOffsets = { completeness: 'partial', byStatDef: { Test: 'partial' }, evidence: [] };
    const partial = Resolver.resolve(makeContext(defs, { pawnEvidence: {
      statOperations: [], sourceFamilyCompleteness: family, structuralContextFacts: {},
      pawnState: { baseSkillFacts: {} }, skillOperations: [] } }), 'Test');
    ok(partial.state === 'partial' && partial.frontier.operation.phase === 'traitOffset'
      && partial.resolvedPrefixValue === 2 && partial.notEvaluated.length === 1,
    'C5-ST-006 incomplete empty family opens exact phase frontier and stops');
  }

  // C5-ST-007/008: applicability, durability, and support form frontiers or skips.
  {
    const defs = { Test: definition('Test', [op('base', 'base', 'setBase', { value: 1 }),
      op('skip', 'traitOffset', 'add', { value: 9 }, { applicability: 'inapplicable' }),
      op('unknown', 'geneOffset', 'add', { value: 1 }, { applicability: 'unknown' }),
      op('late', 'geneFactor', 'multiply', { value: 10 })]) };
    const result = Resolver.resolve(makeContext(defs), 'Test');
    ok(result.applied.some(item => item.state === 'inapplicable')
      && result.frontier.operation.operationId === 'unknown'
      && result.resolvedPrefixValue === 1,
    'C5-ST-007 inapplicable skips but unknown applicability frontiers');
    ok(result.notEvaluated.length === 1 && result.evaluatedOperationCount === 3,
      'C5-ST-008 later operations remain notEvaluated');
    const current = Resolver.resolve(makeContext({ Test: definition('Test', [
      op('base', 'base', 'setBase', { value: 1 }),
      op('current', 'traitOffset', 'add', { value: 1 }, { durability: 'current' })]) }), 'Test');
    ok(current.frontier.reasonCode === 'nonDurableOperation',
      'C5-ST-009 current or mixed operation opens frontier');
    const unsupported = Resolver.resolve(makeContext({ Test: definition('Test', [
      op('base', 'base', 'setBase', { value: 1 }),
      op('unsupported', 'statPart', 'transform', {}, { statPartClass: 'ModPart',
        semanticsSupport: 'unsupported' })]) }), 'Test');
    ok(unsupported.frontier.reasonCode === 'unsupportedSemantics',
      'C5-ST-010 unsupported StatPart opens frontier');
  }

  // C5-ST-011: no numeric base yields no numeric claim.
  {
    const result = Resolver.resolve(makeContext({ Test: definition('Test', [
      op('base', 'base', 'setBase', { value: null })]) }), 'Test');
    ok(result.state === 'unknown' && result.resolvedPrefixValue === null
      && result.frontierIndex === 0 && result.numericClaim === 'noNumericClaim',
    'C5-ST-011 missing base has no numeric claim');
  }

  {
    const result = Resolver.resolve(makeContext({ Test: definition('Test', [
      op('base', 'base', 'setBase', { value: 1 }),
      op('scenario', 'scenarioFactor', 'scenarioFactor', {}, {
        durability: 'mixed', applicability: 'unknown', completeness: 'unknown' })]) }), 'Test');
    ok(result.state === 'resolved' && result.resolvedPrefixValue === 1
      && result.applied[1].state === 'inapplicable',
    'C5-ST-011B complete empty scenario family proves the template inapplicable');
  }

  // C5-ST-012/013: dependencies stay at declared phases and memoise locally.
  {
    const dependency = definition('Dep', [op('dep-base', 'base', 'setBase', { value: 2 })]);
    const target = definition('Target', [op('base', 'base', 'setBase', { value: 3 }),
      op('dep-a', 'statFactor', 'dependencyFactor', {}, { dependencyStatDefId: 'Dep', sourceOrder: 0 }),
      op('dep-b', 'postProcessStatFactor', 'dependencyFactor', {}, { dependencyStatDefId: 'Dep', sourceOrder: 1 })]);
    const result = Resolver.resolve(makeContext({ Dep: dependency, Target: target }), 'Target');
    const deps = result.applied.filter(item => item.dependency);
    ok(result.resolvedPrefixValue === 12
      && deps.map(item => item.operation.phase).join(',') === 'statFactor,postProcessStatFactor',
    'C5-ST-012 dependencies apply at their declared phases');
    ok(deps[0].dependency === deps[1].dependency,
      'C5-ST-013 repeated dependency uses one request-local memo result');
  }

  // C5-ST-014/015: missing, partial, direct, and long-cycle dependencies stop safely.
  {
    const missing = definition('MissingTarget', [op('base', 'base', 'setBase', { value: 1 }),
      op('missing', 'statFactor', 'dependencyFactor', {}, { dependencyStatDefId: 'Absent' })]);
    ok(Resolver.resolve(makeContext({ MissingTarget: missing }), 'MissingTarget')
      .frontier.reasonCode === 'unresolvedDependency',
    'C5-ST-014 missing dependency opens frontier');
    const direct = definition('Direct', [op('base', 'base', 'setBase', { value: 1 }),
      op('self', 'statFactor', 'dependencyFactor', {}, { dependencyStatDefId: 'Direct' })]);
    ok(Resolver.resolve(makeContext({ Direct: direct }), 'Direct')
      .frontier.reasonCode === 'dependencyCycle',
    'C5-ST-015 direct cycle opens frontier');
    const a = definition('A', [op('a-base', 'base', 'setBase', { value: 1 }),
      op('a-b', 'statFactor', 'dependencyFactor', {}, { dependencyStatDefId: 'B' })]);
    const b = definition('B', [op('b-base', 'base', 'setBase', { value: 1 }),
      op('b-c', 'statFactor', 'dependencyFactor', {}, { dependencyStatDefId: 'C' })]);
    const c = definition('C', [op('c-base', 'base', 'setBase', { value: 1 }),
      op('c-a', 'statFactor', 'dependencyFactor', {}, { dependencyStatDefId: 'A' })]);
    const cycle = Resolver.resolve(makeContext({ A: a, B: b, C: c }), 'A');
    ok(cycle.frontier.reasonCode === 'dependencyCycle'
      && cycle.dependencyPath.join('>') === 'A>B>C>A',
    'C5-ST-016 long cycle preserves exact dependency path');
  }

  // C5-ST-017/018: StatPart_Age consumes typed properties, never race identity.
  {
    const ageDef = definition('AgeStat', [op('base', 'base', 'setBase', { value: 1 }),
      op('age', 'statPart', 'transform', { curvePoints: [{ x: 4, y: 0.2 },
        { x: 12, y: 0.8 }, { x: 18, y: 1 }] }, { statPartClass: 'StatPart_Age',
        descriptor: { applicabilityProperty: 'humanlike', ageField: 'biologicalAge',
          curvePoints: [{ x: 4, y: 0.2 }, { x: 12, y: 0.8 }, { x: 18, y: 1 }] } })]);
    const structuralContextFacts = { biologicalAge: { state: 'known', value: 12, evidence: [] },
      raceDef: { state: 'known', value: 'SyntheticModRace', evidence: [] },
      raceProperties: { humanlike: { state: 'known', value: true, evidence: [] } } };
    const known = Resolver.resolve(makeContext({ AgeStat: ageDef }, { pawnEvidence: {
      statOperations: [], sourceFamilyCompleteness: allComplete, structuralContextFacts,
      pawnState: { baseSkillFacts: {} }, skillOperations: [] } }), 'AgeStat');
    ok(known.state === 'resolved' && known.resolvedPrefixValue === 0.8,
      'C5-ST-017 typed synthetic humanlike age evaluates the audited curve');
    structuralContextFacts.raceProperties.humanlike = { state: 'unknown', value: null, evidence: [] };
    const unknown = Resolver.resolve(makeContext({ AgeStat: ageDef }, { pawnEvidence: {
      statOperations: [], sourceFamilyCompleteness: allComplete, structuralContextFacts,
      pawnState: { baseSkillFacts: {} }, skillOperations: [] } }), 'AgeStat');
    ok(unknown.frontier.reasonCode === 'ageApplicabilityUnknown',
      'C5-ST-018 unknown humanlike property opens the Age frontier');
  }

  // C5-CAP-001..008: Option A evaluates audited formulas against rounded C3 facts.
  {
    const capacityContext = (operations, facts) => makeContext({ Test: definition('Test', [
      op('base', 'base', 'setBase', { value: 10 }), ...operations,
    ]) }, { structuralCapacities: { capacities: facts } });
    const offset = op('sight-offset', 'capacityOffset', 'capacityOffset',
      { scale: 4, max: 1.5 }, { capacityDefId: 'Sight' });
    const offsetResult = Resolver.resolve(capacityContext([offset], {
      sight: { capacity: 'Sight', structural: { state: 'resolved', value: 0.8,
        evidence: [{ evidenceId: 'sight' }] } },
    }), 'Test');
    ok(Math.abs(offsetResult.resolvedPrefixValue - 9.2) < 1e-9,
      'C5-CAP-001 capacity offset uses (min(value,max)-1)*scale');
    const capped = Resolver.resolve(capacityContext([offset], {
      sight: { capacity: 'Sight', structural: { state: 'resolved', value: 2, evidence: [] } },
    }), 'Test');
    ok(capped.resolvedPrefixValue === 12,
      'C5-CAP-002 capacity offset honours max');

    const factorOne = op('manip-factor', 'capacityFactor', 'capacityFactor',
      { weight: 1, max: null, allowedDefect: 0, useReciprocal: false },
      { capacityDefId: 'Manipulation' });
    const factorHalf = op('sight-factor', 'capacityFactor', 'capacityFactor',
      { weight: 0.5, max: 1, allowedDefect: 0, useReciprocal: false },
      { capacityDefId: 'Sight', sourceOrder: 1 });
    const factors = Resolver.resolve(capacityContext([factorOne, factorHalf], {
      manipulation: { capacity: 'Manipulation', structural: { state: 'resolved', value: 0.8, evidence: [] } },
      sight: { capacity: 'Sight', structural: { state: 'resolved', value: 0.5, evidence: [] } },
    }), 'Test');
    ok(Math.abs(factors.resolvedPrefixValue - 6) < 1e-9,
      'C5-CAP-003 weighted capacity factors apply sequentially');
    ok(factors.precision.length === 2 && factors.frontierIndex === null
      && factors.state === 'partial' && factors.completeness === 'partial'
      && factors.numericClaim === 'exactAgainstRoundedC3CapacityInput',
    'C5-CAP-004 complete rounded evaluation is partial without semantic frontier');
    ok(factors.precision.every(notice => notice.kind === 'capacityInputRoundedByC3'
      && notice.roundingIncrement === 0.01
      && notice.claim === 'exactAgainstRoundedC3InputNotBitExactRuntime'),
    'C5-CAP-005 precision notices disclose the exact Option A boundary');

    const defect = op('defect', 'capacityFactor', 'capacityFactor',
      { weight: 1, max: 1, allowedDefect: 0.25, useReciprocal: false },
      { capacityDefId: 'Manipulation' });
    const defectResult = Resolver.resolve(capacityContext([defect], {
      manipulation: { capacity: 'Manipulation', structural: { state: 'resolved', value: 0.5, evidence: [] } },
    }), 'Test');
    ok(Math.abs(defectResult.resolvedPrefixValue - (10 * (2 / 3))) < 1e-9,
      'C5-CAP-006 allowedDefect uses audited inverse lerp');
    const reciprocal = op('reciprocal', 'capacityFactor', 'capacityFactor',
      { weight: 1, max: null, allowedDefect: 0, useReciprocal: true },
      { capacityDefId: 'Manipulation' });
    const reciprocalResult = Resolver.resolve(capacityContext([reciprocal], {
      manipulation: { capacity: 'Manipulation', structural: { state: 'resolved', value: 0.5, evidence: [] } },
    }), 'Test');
    ok(reciprocalResult.resolvedPrefixValue === 20,
      'C5-CAP-007 reciprocal capacity factor follows audited cap logic');

    for (const [state, reason] of [['unknown', 'capacityInputUnknown'],
      ['notApplicable', 'capacityNotApplicable']]) {
      const input = { state, value: null, evidence: [] };
      const result = Resolver.resolve(capacityContext([factorOne], {
        manipulation: { capacity: 'Manipulation', structural: input },
      }), 'Test');
      ok(result.frontier && result.frontier.reasonCode === reason
        && result.resolvedPrefixValue === 10,
      'C5-CAP-008 ' + state + ' capacity opens frontier and never becomes zero');
    }
    const preserved = { capacities: { manipulation: { capacity: 'Manipulation',
      structural: { state: 'resolved', value: 0.8, evidence: [] } } } };
    const before = JSON.stringify(preserved);
    Resolver.resolve(makeContext({ Test: definition('Test', [
      op('base', 'base', 'setBase', { value: 10 }), factorOne,
    ]) }, { structuralCapacities: preserved }), 'Test');
    ok(JSON.stringify(preserved) === before,
      'C5-CAP-009 C3 input is not mutated');
  }

  const source = fs.readFileSync(path.join(__dirname, '..', 'files',
    'structural-stat-resolver.js'), 'utf8');
  ok(!/knownStructuralValue|partialValue|continueAfter|module.*cache|revision|invalidate/.test(source),
    'C5-ST-019 resolver has no resume token or long-lived cache');
  ok(!/raceDefName\s*(===|!==)|trait(Id|DefName)\s*(===|!==)|gene(Id|DefName)\s*(===|!==)|hediff(Id|DefName)\s*(===|!==)/.test(source),
    'C5-ST-020 resolver has no identity semantic branch');

  return { name: 'C5 structural stat resolver', total, failures };
};

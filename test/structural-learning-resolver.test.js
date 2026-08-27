/** C5 Task 11: structural LearningRateFact contracts. */
const fs = require('fs');
const path = require('path');
const { loadScripts } = require('./_harness');

module.exports = function run() {
  const StructuralPassionResolver = { resolve(context, skillDefId) {
    return context.passionBySkill[skillDefId];
  } };
  const StructuralStatResolver = { resolve(context, statDefId) {
    context.statCalls.push(statDefId);
    return context.statByDef[statDefId];
  } };
  const ctx = loadScripts(['structural-learning-resolver.js'], {
    StructuralPassionResolver, StructuralStatResolver,
  });
  const Resolver = ctx.StructuralLearningResolver;
  let total = 0, failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) { failures++; console.log('  FAIL ' + label); }
  };
  const passion = (factor, state = 'resolved') => ({
    schemaVersion: 1, state, completeness: state === 'resolved' ? 'complete' : 'unknown',
    confidence: state === 'resolved' ? 'verified' : 'unknown', skillDefId: 'Mining',
    directLearningFactor: state === 'resolved' ? factor : null,
    evidence: [{ evidenceId: 'passion-evidence' }],
    unresolved: state === 'resolved' ? [] : [{ reasonCode: 'unsupportedPassionSemantics',
      message: 'unsupportedPassionSemantics', affectedDimension: 'passion',
      targetDefId: 'Mining', candidateTargetDefIds: [], operationId: null, evidence: [] }],
  });
  const stat = (value, overrides) => Object.assign({
    schemaVersion: 1, statDefId: 'GlobalLearningFactor', state: 'resolved',
    completeness: 'complete', confidence: 'verified', resolvedPrefixValue: value,
    frontierIndex: null, numericClaim: 'exactRuntimeDurableValue', precision: [],
    evidence: [{ evidenceId: 'stat-evidence' }], unresolved: [],
  }, overrides || {});
  const context = (passionFact, glf, animals) => ({
    runtimeVersion: '1.6.4871 rev590',
    effectivenessSnapshot: { runtimeVersion: '1.6.4871 rev590' },
    passionBySkill: { Mining: passionFact, Animals: Object.assign({}, passionFact,
      { skillDefId: 'Animals' }) },
    statByDef: { GlobalLearningFactor: glf,
      AnimalsLearningFactor: animals || stat(1, { statDefId: 'AnimalsLearningFactor' }) },
    statCalls: [],
  });

  // C5-LR-001..003: direct passion semantics are preserved independently of stats.
  for (const [identity, factor] of [['None', 0.35], ['Minor', 1], ['Major', 1.5]]) {
    const input = context(passion(factor), stat(2.5));
    const fact = Resolver.resolve(input, 'Mining');
    ok(fact.directLearningFactor === factor
      && fact.structuralLearningFactor === factor * 2.5,
    'C5-LR-001 ' + identity + ' direct factor and non-Animals ordinary factor are exact');
    ok(fact.globalLearningFactor === input.statByDef.GlobalLearningFactor
      && fact.animalsLearningFactor === null,
    'C5-LR-002 non-Animals references GLF and does not evaluate Animals factor');
  }

  // C5-LR-004: Animals alone consumes the target-specific factor.
  {
    const input = context(passion(1.5), stat(2.5),
      stat(0.8, { statDefId: 'AnimalsLearningFactor' }));
    const fact = Resolver.resolve(input, 'Animals');
    ok(Math.abs(fact.structuralLearningFactor - 3) < 1e-9
      && input.statCalls.join(',') === 'GlobalLearningFactor,AnimalsLearningFactor',
    'C5-LR-004 Animals ordinary learning multiplies GLF and AnimalsLearningFactor');
  }

  // C5-LR-005/006: a semantic frontier blocks only the ordinary durable claim.
  {
    const glf = stat(1.75, { state: 'partial', completeness: 'partial',
      frontierIndex: 2, numericClaim: 'contiguousPrefixOnly',
      unresolved: [{ reasonCode: 'scenarioContextUnknown', evidence: [] }] });
    const fact = Resolver.resolve(context(passion(1), glf), 'Mining');
    ok(fact.directLearningFactor === 1 && fact.structuralLearningFactor === null
      && fact.state === 'partial' && fact.completeness === 'partial',
    'C5-LR-005 GLF frontier preserves direct factor but blocks ordinary factor');
    ok(fact.unresolved.some(item => item.reasonCode === 'scenarioContextUnknown'),
      'C5-LR-006 relevant stat frontier remains explicit');
  }

  // C5-LR-007: Option A is numeric but precision-limited, never promoted to complete.
  {
    const glf = stat(2.5, { state: 'partial', completeness: 'partial',
      frontierIndex: null, numericClaim: 'exactAgainstRoundedC3CapacityInput',
      precision: [{ kind: 'capacityInputRoundedByC3' }] });
    const fact = Resolver.resolve(context(passion(1.5), glf), 'Mining');
    ok(fact.structuralLearningFactor === 3.75 && fact.state === 'partial'
      && fact.completeness === 'partial' && fact.confidence === 'derived',
    'C5-LR-007 precision-limited GLF permits rounded structural arithmetic without completeness');
  }

  // C5-LR-008: unknown passion does not erase independently resolved stats.
  {
    const input = context(passion(null, 'unknown'), stat(2.5));
    const fact = Resolver.resolve(input, 'Mining');
    ok(fact.directLearningFactor === null && fact.structuralLearningFactor === null
      && fact.globalLearningFactor === input.statByDef.GlobalLearningFactor
      && fact.state === 'partial',
    'C5-LR-008 unknown passion stays scoped while GLF remains visible');
  }

  // C5-LR-009..011: skillless and current branches remain explicit non-results.
  {
    const input = context(passion(1), stat(2.5));
    const fact = Resolver.resolve(input, null);
    ok(fact.state === 'notApplicable' && fact.skillDefId === null
      && fact.passionSkillDefId === null && input.statCalls.length === 0,
    'C5-LR-009 skillless direct request is notApplicable and evaluates no stats');
    const ordinary = Resolver.resolve(input, 'Mining');
    ok(ordinary.currentSaturation.state === 'notEvaluated'
      && ordinary.debugFastLearning.state === 'notEvaluated'
      && ordinary.currentLearningFactor.state === 'notEvaluated'
      && ordinary.currentLearningFactor.value === null,
    'C5-LR-010 saturation, debug, and current factor are not evaluated');
    ok(!Object.prototype.hasOwnProperty.call(ordinary, 'passion')
      && ordinary.passionSkillDefId === 'Mining'
      && ordinary.globalLearningFactor === input.statByDef.GlobalLearningFactor,
    'C5-LR-011 learning references canonical facts without embedding or cloning them');
  }

  // C5-LR-012: old compatibility-only learningRate evidence is not an input.
  {
    const input = context(passion(1), stat(2.5));
    input.pawnEvidence = { effects: [{ type: 'learningRate', factor: 99,
      compatibilityOnly: true }] };
    const fact = Resolver.resolve(input, 'Mining');
    ok(fact.structuralLearningFactor === 2.5,
      'C5-LR-012 legacy learningRate factors never enter canonical calculation');
  }

  const source = fs.readFileSync(path.join(__dirname, '..', 'files',
    'structural-learning-resolver.js'), 'utf8');
  ok(!/passion\s*:|xpSinceMidnight|SaturatedLearningFactor/.test(source),
    'C5-LR-013 resolver has no passion copy or current-saturation evaluation');

  return { name: 'C5 structural learning', total, failures };
};

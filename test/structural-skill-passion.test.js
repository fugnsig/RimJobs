/** C5 Task 8: request context, SkillFact, and PassionFact contracts. */
const fs = require('fs');
const path = require('path');
const { loadScripts } = require('./_harness');

module.exports = function run() {
  let c2Calls = 0, c3Calls = 0;
  const CapabilityEvidence = { collectPawnEvidence(pawn) {
    c2Calls++;
    return pawn.evidence;
  } };
  const CapacityResolver = { resolvePawnCapacities() {
    c3Calls++;
    return { capacities: { manipulation: { structural: { state: 'resolved', value: 1 } } } };
  } };
  const ctx = loadScripts([
    'c5-evaluation-context.js', 'structural-skill-resolver.js',
    'structural-passion-resolver.js',
  ], { CapabilityEvidence, CapacityResolver });
  const Context = ctx.StructuralEffectivenessContext;
  const Skill = ctx.StructuralSkillResolver;
  const Passion = ctx.StructuralPassionResolver;
  let total = 0, failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) { failures++; console.log('  FAIL ' + label); }
  };
  const freeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze); Object.freeze(value);
    }
    return value;
  };
  const policy = (catalogueCompleteness = 'complete') => ({
    schemaVersion: 1, runtimeVersion: '1.6.4871 rev590', appSkillId: 'mining',
    skillDefId: 'Mining', minLevel: 0, maxLevel: 20,
    disablingWorkTags: ['Mining'], neverDisabledBasedOnWorkTypes: false,
    definitionCompleteness: 'complete', catalogueCompleteness,
    provenance: { provenanceClass: 'scannerData' }, unresolved: [],
  });
  const snapshot = completeness => freeze({
    schemaVersion: 1, runtimeVersion: '1.6.4871 rev590',
    skillPolicies: { Mining: policy(completeness) },
    passionProviders: {
      vanilla: { providerId: 'rimworld-vanilla', runtimeFingerprint: '1.6.4871 rev590',
        entries: {
          None: { identity: 'None', directLearningFactor: 0.35, compatibilityBucket: 0, isBad: false },
          Minor: { identity: 'Minor', directLearningFactor: 1, compatibilityBucket: 1, isBad: false },
          Major: { identity: 'Major', directLearningFactor: 1.5, compatibilityBucket: 2, isBad: false },
        } },
      extensions: { Competitive: { defName: 'Competitive', semantics: null,
        providerFingerprint: 'provider-x', runtimeFingerprint: 'runtime-x' } },
    },
  });
  const typed = value => ({ state: 'known', value, evidence: [{ evidenceId: 'typed' }] });
  const evidence = overrides => Object.assign({
    skillOperations: [], statOperations: [], unresolvedSources: [],
    pawnState: { baseSkillFacts: {}, passionFacts: {}, skillRecordCatalogue: {
      presence: 'present', completeness: 'complete', provenance: {},
    } },
    skillDisablementFacts: {},
  }, overrides || {});
  const resolvedContext = (pawnEvidence, effectivenessSnapshot = snapshot('complete')) =>
    Context.fromResolved({ pawnId: 'pawn-1', pawnEvidence,
      structuralCapacities: { capacities: {} }, c4RequirementSnapshot: null,
      effectivenessSnapshot });

  // C5-SP-001/002: supplied facts do no work; standalone collection does each step once.
  {
    c2Calls = 0; c3Calls = 0;
    const supplied = resolvedContext(evidence());
    ok(c2Calls === 0 && c3Calls === 0 && Object.isFrozen(supplied),
      'C5-SP-001 supplied-fact context performs zero C2/C3 calls and freezes');
    Context.create({ pawn: { id: 'standalone', evidence: evidence() },
      capabilityDefinitions: {}, effectivenessSnapshot: snapshot('complete') });
    ok(c2Calls === 1 && c3Calls === 1,
      'C5-SP-002 standalone context performs exactly one C2 and one C3 call');
  }

  // C5-SP-003: stored level, aptitude, disablement, and projections stay separate.
  {
    const rawEvidence = evidence({
      pawnState: { baseSkillFacts: { Mining: { skillDefId: 'Mining', recordPresence: 'present',
        levelFieldPresent: true, storedLevelInt: typed(10), parserCompleteness: 'complete',
        evidence: [{ evidenceId: 'stored' }] } }, passionFacts: {},
        skillRecordCatalogue: { presence: 'present', completeness: 'complete', provenance: {} } },
      skillOperations: [
        { operationId: 'apt', kind: 'runtimeAptitudeOffset', skillDefId: 'Mining', value: 2,
          applicability: 'applicable', compatibilityOnly: false, superseded: false,
          canonicalEligible: true, completeness: 'complete', evidence: [{ evidenceId: 'apt' }] },
        { operationId: 'creation', kind: 'creationSkillGain', skillDefId: 'Mining', value: 5,
          applicability: 'applicable', compatibilityOnly: false, superseded: false,
          canonicalEligible: false, completeness: 'complete', evidence: [] },
      ],
      skillDisablementFacts: { Mining: {
        total: { state: 'known', value: true, evidence: [{ evidenceId: 'total' }] },
        permanent: { state: 'known', value: false, evidence: [{ evidenceId: 'permanent' }] },
      } },
    });
    const fact = Skill.resolve(resolvedContext(rawEvidence), 'Mining');
    ok(fact.storedLevelInt.value === 10 && fact.runtimeAptitude.value === 2
      && fact.levelIgnoringDisable === 12,
    'C5-SP-003 stored level and exact aptitude compose separately');
    ok(fact.runtimeAptitude.contributions.length === 1
      && fact.runtimeAptitude.contributions[0].operationId === 'apt',
    'C5-SP-004 creation gains do not enter runtime aptitude');
    ok(fact.totalDisablement.state === 'true' && fact.permanentDisablement.state === 'false'
      && fact.runtimeGetLevelProjection === 0 && fact.runtimeGetLevelForUIProjection === 12,
    'C5-SP-005 disablement changes projections without erasing factual level');
    ok(!Object.prototype.hasOwnProperty.call(fact, 'passion'),
      'C5-SP-006 SkillFact does not embed passion');
  }

  // C5-SP-007/008: only the resolver derives runtime defaults after catalogue proof.
  {
    const absent = evidence({ pawnState: { baseSkillFacts: { Mining: {
      skillDefId: 'Mining', recordPresence: 'absent', levelFieldPresent: false,
      storedLevelInt: { state: 'unknown', value: null, evidence: [] }, evidence: [],
    } }, passionFacts: { Mining: { skillDefId: 'Mining', recordPresence: 'absent',
      passionFieldPresent: false, state: 'unknown', rawIdentity: null, evidence: [] } },
      skillRecordCatalogue: { presence: 'present', completeness: 'complete', provenance: {} } } });
    const completeContext = resolvedContext(absent, snapshot('complete'));
    const skill = Skill.resolve(completeContext, 'Mining');
    const passion = Passion.resolve(completeContext, 'Mining');
    ok(skill.recordPresence === 'runtimeDefaulted' && skill.storedLevelInt.value === 0,
      'C5-SP-007 absent record plus complete catalogue becomes runtimeDefaulted level zero');
    ok(passion.recordPresence === 'runtimeDefaulted' && passion.rawIdentity === 'None'
      && passion.directLearningFactor === 0.35,
    'C5-SP-008 absent record plus complete catalogue becomes vanilla None passion');
    const partialContext = resolvedContext(absent, snapshot('partial'));
    ok(Skill.resolve(partialContext, 'Mining').recordPresence === 'unknown'
      && Passion.resolve(partialContext, 'Mining').state === 'unknown',
    'C5-SP-009 absent record plus partial catalogue remains unknown');
  }

  {
    const disabledEvidence = evidence({
      pawnState: { baseSkillFacts: { Mining: { skillDefId: 'Mining', recordPresence: 'present',
        levelFieldPresent: true, storedLevelInt: typed(6), evidence: [] } }, passionFacts: {},
        skillRecordCatalogue: { presence: 'present', completeness: 'complete', provenance: {} } },
      effects: [{ evidenceId: 'disabled-mining', type: 'disableWorkTag', target: 'Mining',
        provenance: { sourceKind: 'backstory', sourceId: 'NoMining' }, confidence: 'verified' }],
    });
    const fact = Skill.resolve(resolvedContext(disabledEvidence), 'Mining');
    ok(fact.totalDisablement.state === 'true' && fact.levelIgnoringDisable === 6
      && fact.runtimeGetLevelProjection === 0,
    'C5-SP-007B canonical WorkTag evidence affects only the runtime projection');
  }

  // C5-SP-010: missing fields inside a present record use audited defaults.
  {
    const presentMissing = evidence({ pawnState: { baseSkillFacts: { Mining: {
      skillDefId: 'Mining', recordPresence: 'present', levelFieldPresent: false,
      storedLevelInt: { state: 'unknown', value: null, evidence: [] }, evidence: [],
    } }, passionFacts: { Mining: { skillDefId: 'Mining', recordPresence: 'present',
      passionFieldPresent: false, state: 'unknown', rawIdentity: null, evidence: [] } },
      skillRecordCatalogue: { presence: 'present', completeness: 'complete', provenance: {} } } });
    const context = resolvedContext(presentMissing);
    ok(Skill.resolve(context, 'Mining').storedLevelInt.value === 0
      && Passion.resolve(context, 'Mining').rawIdentity === 'None',
    'C5-SP-010 present record missing fields uses audited level and passion defaults');
  }

  // C5-SP-011/012: relevant unknowns remain scoped and modded identity stays raw.
  {
    const rawEvidence = evidence({
      pawnState: { baseSkillFacts: { Mining: { skillDefId: 'Mining', recordPresence: 'present',
        levelFieldPresent: true, storedLevelInt: typed(8), evidence: [] } },
        passionFacts: { Mining: { skillDefId: 'Mining', recordPresence: 'present',
          passionFieldPresent: true, state: 'known', rawIdentity: 'Competitive', evidence: [] } },
        skillRecordCatalogue: { presence: 'present', completeness: 'complete', provenance: {} } },
      skillOperations: [{ operationId: 'unknown-mining', kind: 'unknownSkillOperation',
        skillDefId: 'Mining', value: null, applicability: 'unknown', canonicalEligible: false,
        compatibilityOnly: false, superseded: false, completeness: 'partial', evidence: [] },
        { operationId: 'unknown-cook', kind: 'unknownSkillOperation', skillDefId: 'Cooking',
          value: null, applicability: 'unknown', canonicalEligible: false,
          compatibilityOnly: false, superseded: false, completeness: 'partial', evidence: [] }],
    });
    const context = resolvedContext(rawEvidence);
    const skill = Skill.resolve(context, 'Mining');
    const passion = Passion.resolve(context, 'Mining');
    ok(skill.runtimeAptitude.state === 'partial' && skill.levelIgnoringDisable === null
      && skill.runtimeAptitude.unresolved.length === 1,
    'C5-SP-011 relevant unknown aptitude prevents a subtotal while unrelated unknown does not add');
    ok(passion.state === 'unknown' && passion.rawIdentity === 'Competitive'
      && passion.semantics === null && passion.directLearningFactor === null
      && passion.compatibilityBucket === null,
    'C5-SP-012 unsupported modded passion remains raw and semantically unknown');
  }

  // C5-SP-013/014: explicit notApplicable and two-pawn shared snapshot.
  {
    const contextA = resolvedContext(evidence());
    const contextB = Context.fromResolved({ pawnId: 'pawn-2', pawnEvidence: evidence(),
      structuralCapacities: { capacities: {} }, c4RequirementSnapshot: null,
      effectivenessSnapshot: contextA.effectivenessSnapshot });
    ok(Skill.resolve(contextA, null).state === 'notApplicable'
      && Passion.resolve(contextA, null).state === 'notApplicable',
    'C5-SP-013 direct skillless resolution is notApplicable');
    ok(contextA.effectivenessSnapshot === contextB.effectivenessSnapshot
      && Object.isFrozen(contextB),
    'C5-SP-014 two pawn contexts share one immutable definition snapshot');
  }

  for (const file of ['c5-evaluation-context.js', 'structural-skill-resolver.js',
    'structural-passion-resolver.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'files', file), 'utf8');
    ok(!/raceDefName\s*(===|!==)|trait(Id|DefName)\s*(===|!==)|gene(Id|DefName)\s*(===|!==)|hediff(Id|DefName)\s*(===|!==)/.test(source),
      'C5-SP-015 no identity semantic branch in ' + file);
  }

  return { name: 'C5 structural skill and passion', total, failures };
};

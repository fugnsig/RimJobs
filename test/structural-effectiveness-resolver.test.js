/** C5 Task 12: plural structural effectiveness report contracts. */
const fs = require('fs');
const path = require('path');
const { loadScripts } = require('./_harness');

module.exports = function run() {
  const calls = { skill: [], passion: [], learning: [], stat: [] };
  const skillFact = id => Object.freeze({ schemaVersion: 1, state: 'resolved',
    completeness: 'complete', confidence: 'verified', skillDefId: id,
    evidence: [{ evidenceId: 'skill:' + id }], unresolved: [] });
  const passionFact = id => Object.freeze({ schemaVersion: 1, state: 'resolved',
    completeness: 'complete', confidence: 'verified', skillDefId: id,
    directLearningFactor: 1, evidence: [{ evidenceId: 'passion:' + id }], unresolved: [] });
  const statFact = id => Object.freeze({ schemaVersion: 1, state: 'resolved',
    completeness: 'complete', confidence: 'verified', statDefId: id,
    resolvedPrefixValue: 1, frontierIndex: null,
    numericClaim: 'exactRuntimeDurableValue', applied: [], frontier: null,
    notEvaluated: [], precision: [], dependencyPath: [id],
    evidence: [{ evidenceId: 'stat:' + id }], unresolved: [] });
  const passions = {};
  const StructuralSkillResolver = { resolve(context, id) {
    calls.skill.push(id); return skillFact(id);
  } };
  const StructuralPassionResolver = { resolve(context, id) {
    calls.passion.push(id); return passions[id] || (passions[id] = passionFact(id));
  } };
  const StructuralLearningResolver = { resolve(context, id, supplied) {
    calls.learning.push({ id, supplied });
    return Object.freeze({ schemaVersion: 1, state: 'resolved', completeness: 'complete',
      confidence: 'derived', skillDefId: id, passionSkillDefId: id,
      directLearningFactor: 1, globalLearningFactor: statFact('GlobalLearningFactor'),
      animalsLearningFactor: id === 'Animals' ? statFact('AnimalsLearningFactor') : null,
      structuralLearningFactor: 1, currentSaturation: { state: 'notEvaluated' },
      debugFastLearning: { state: 'notEvaluated' },
      currentLearningFactor: { state: 'notEvaluated', value: null },
      evidence: [], unresolved: [] });
  } };
  const StructuralStatResolver = { resolve(context, id) {
    calls.stat.push(id);
    return context.statResults && context.statResults[id] || statFact(id);
  } };
  const ctx = loadScripts(['structural-effectiveness-resolver.js'], {
    StructuralSkillResolver, StructuralPassionResolver,
    StructuralLearningResolver, StructuralStatResolver,
  });
  const Resolver = ctx.StructuralEffectivenessResolver;
  let total = 0, failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) { failures++; console.log('  FAIL ' + label); }
  };
  const facet = (facetId, metricKind, statDefIds, support = 'initialSubset') => ({
    facetId, label: facetId, sourceWorkTypeDefIds: [], workGiverDefIds: [],
    jobDriverClassIds: [], recipeDefIds: [], sourceKind: 'statDef', sourceIds: [],
    metricKind, statDefIds, support, applicability: support === 'unknown'
      ? 'unknown' : 'applicable', completeness: support === 'unknown' ? 'unknown' : 'complete',
    provenance: [], unresolved: [],
  });
  const policy = (jobId, skillDefIds, facets, policyKind = 'definitionBacked') => ({
    schemaVersion: 1, runtimeVersion: '1.6.4871 rev590', jobId, policyKind,
    sourceWorkTypeDefIds: [], skillDefIds, facets,
    completeness: policyKind === 'unknown' ? 'unknown' : 'complete',
    provenance: [], unresolved: policyKind === 'unknown'
      ? ['noAuditedEffectivenessPolicy'] : [],
  });
  const policies = {
    skillless: policy('skillless', [], [facet('structure', 'unknown', [], 'definitionBacked')]),
    single: policy('single', ['Cooking'], [facet('cook', 'speed', ['CookSpeed'])]),
    multi: policy('multi', ['Crafting', 'Artistic', 'Crafting'], [
      facet('quality', 'quality', []), facet('speed', 'speed', ['CookSpeed']),
    ]),
    records: policy('records', ['Medicine'], [
      facet('record-only', 'speed', ['MedicalTendSpeed'], 'recordOnly'),
      facet('zero-stat', 'other', [], 'definitionBacked'),
      facet('unknown-csharp', 'unknown', [], 'unknown'),
    ]),
    cooking: policy('cooking', ['Cooking'], [
      facet('meal-cooking', 'speed', ['CookSpeed']),
      facet('recipe-selected', 'speed', [], 'recordOnly'),
    ]),
    mining: policy('mining', ['Mining'], [
      facet('wall-mining', 'speed', ['MiningSpeed']),
      facet('deep-drilling', 'speed', ['DeepDrillingSpeed'], 'recordOnly'),
    ]),
    fishing: policy('fishing', ['Animals'], [
      facet('fishing', 'speed', ['FishingSpeed'], 'recordOnly'),
    ]),
    unknown: policy('unknown', [], [facet('unknown-app-job', 'unknown', [], 'unknown')], 'unknown'),
  };
  const context = {
    schemaVersion: 1, runtimeVersion: '1.6.4871 rev590', pawnId: 'pawn-1',
    effectivenessSnapshot: { runtimeVersion: '1.6.4871 rev590', jobPolicies: policies,
      statDefinitions: { supported: { CookSpeed: {}, MiningSpeed: {},
        WorkSpeedGlobal: {} }, recordOnly: { MedicalTendSpeed: {},
        DeepDrillingSpeed: {}, FishingSpeed: {} } } },
  };
  const resetCalls = () => Object.values(calls).forEach(value => { value.length = 0; });

  // C5-ER-001/002: skillless means empty plural dimensions, never fallback.
  {
    resetCalls();
    const report = Resolver.resolve(context, 'skillless');
    ok(report.skillFacts.length === 0 && report.passionFacts.length === 0
      && report.learningRateFacts.length === 0,
    'C5-ER-001 wholly skillless job has three empty plural fact arrays');
    ok(calls.skill.length === 0 && calls.passion.length === 0
      && calls.learning.length === 0 && report.globalWorkSpeed.statDefId === 'WorkSpeedGlobal',
    'C5-ER-002 skillless job invents no fallback while global work speed stays independent');
  }

  // C5-ER-003..006: one/many SkillDefs remain deterministic and duplicate-free.
  {
    resetCalls();
    const single = Resolver.resolve(context, 'single');
    ok(single.skillFacts.map(f => f.skillDefId).join(',') === 'Cooking'
      && single.passionFacts.length === 1 && single.learningRateFacts.length === 1,
    'C5-ER-003 single SkillDef produces one fact in every plural dimension');
    ok(calls.learning[0].supplied === single.passionFacts[0],
      'C5-ER-004 learning references the report-owned canonical PassionFact');
    resetCalls();
    const multi = Resolver.resolve(context, 'multi');
    ok(multi.skillFacts.map(f => f.skillDefId).join(',') === 'Artistic,Crafting'
      && multi.passionFacts.map(f => f.skillDefId).join(',') === 'Artistic,Crafting',
    'C5-ER-005 multiple SkillDefs stay plural, sorted, and duplicate-free');
    ok(calls.skill.length === 2 && calls.passion.length === 2 && calls.learning.length === 2,
      'C5-ER-006 each exact SkillDef is resolved once per dimension');
  }

  // C5-ER-007..011: facets remain top-level and metric-neutral.
  {
    resetCalls();
    const report = Resolver.resolve(context, 'records');
    ok(Array.isArray(report.facets) && !Object.prototype.hasOwnProperty.call(report, 'workSpeed')
      && report.facets.length === 3,
    'C5-ER-007 several facets remain top-level');
    ok(report.facets[0].statFacts[0].statDefId === 'MedicalTendSpeed'
      && report.facets[0].statFacts[0].state === 'notEvaluated'
      && !calls.stat.includes('MedicalTendSpeed'),
    'C5-ER-008 record-only StatDef is reported without evaluation');
    ok(report.facets[1].statFacts.length === 0 && report.facets[1].state === 'resolved',
      'C5-ER-009 zero-stat definition-backed facet remains structural');
    ok(report.facets[2].state === 'unknown' && report.facets[2].unresolved.length > 0,
      'C5-ER-010 unsupported C# facet remains opaque unknown');
    ok(report.currentEffectiveness.state === 'notEvaluated',
      'C5-ER-011 current effectiveness is always notEvaluated');
  }

  // C5-ER-012..015: audited identities and facet separation are preserved.
  {
    const cooking = Resolver.resolve(context, 'cooking');
    ok(cooking.policy.skillDefIds.join(',') === 'Cooking'
      && cooking.facets.map(f => f.facet.facetId).join(',') === 'meal-cooking,recipe-selected',
    'C5-ER-012 Cooking and recipe-selected facets remain distinct');
    const mining = Resolver.resolve(context, 'mining');
    ok(mining.facets[0].statFacts[0].statDefId === 'MiningSpeed'
      && mining.facets[1].statFacts[0].statDefId === 'DeepDrillingSpeed',
    'C5-ER-013 wall mining and deep drilling remain separate StatDefs');
    const fishing = Resolver.resolve(context, 'fishing');
    ok(fishing.skillFacts[0].skillDefId === 'Animals'
      && fishing.facets[0].statFacts[0].statDefId === 'FishingSpeed',
    'C5-ER-014 Fishing preserves Animals skill and FishingSpeed identity');
    ok(cooking.facets[0].facet.statBindings.length === 1
      && cooking.facets[1].facet.statBindings.length === 0,
    'C5-ER-015 facets preserve zero or one StatDef without flattening');
  }

  // C5-ER-016..018: unknown relevance is scoped and report shape is immutable.
  {
    const unsupported = Resolver.resolve(context, 'missing-custom-job');
    ok(unsupported.policy.policyKind === 'unknown' && unsupported.facets.length === 1
      && unsupported.skillFacts.length === 0,
    'C5-ER-016 unsupported app/custom job is explicit unknown');
    const partial = Object.freeze(Object.assign({}, statFact('MiningSpeed'), {
      state: 'partial', completeness: 'partial', numericClaim: 'contiguousPrefixOnly',
      unresolved: [{ reasonCode: 'miningOnlyUnknown', evidence: [] }],
    }));
    const isolated = Resolver.resolve(Object.assign({}, context,
      { statResults: { MiningSpeed: partial } }), 'cooking');
    ok(isolated.facets[0].state === 'resolved'
      && !JSON.stringify(isolated).includes('miningOnlyUnknown'),
    'C5-ER-017 unrelated Mining unknown does not poison Cooking');
    ok(Object.isFrozen(isolated) && Object.isFrozen(isolated.facets)
      && Object.isFrozen(isolated.policy) && Object.isFrozen(isolated.skillFacts),
    'C5-ER-018 complete report shape is deeply immutable');
  }

  const source = fs.readFileSync(path.join(__dirname, '..', 'files',
    'structural-effectiveness-resolver.js'), 'utf8');
  ok(!/effectivenessScore|primarySkill|overallScore|aggregateScore|rank|bestPawn|runMinMaxAssignment/.test(source),
    'C5-ER-019 assembler exposes no score, primary skill, ranking, or assignment proxy');
  ok(!/PermissionResolver|AvailabilityResolver|c4RequirementSnapshot/.test(source),
    'C5-ER-020 effectiveness assembly is independent of C4 Permission and Availability');

  return { name: 'C5 structural effectiveness reports', total, failures };
};

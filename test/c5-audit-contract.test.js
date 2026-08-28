/**
 * C5 Task 0: executable contracts frozen by the 1.6.4871 rev590 audit.
 * Later C5 suites import the same fixture instead of restating runtime truths.
 */
const fs = require('fs');
const path = require('path');
const fixture = require('../files/c5-runtime-contract.js');

const PHASE_IDS = [
  'base', 'skillNeedOffset', 'capacityOffset', 'traitOffset', 'hediffOffset',
  'preceptOffset', 'roleOffset', 'geneOffset', 'lifeStageOffset',
  'equipmentOffset', 'traitFactor', 'hediffFactor', 'preceptFactor',
  'roleFactor', 'geneFactor', 'lifeStageFactor', 'requestThingOperation',
  'statFactor', 'skillNeedFactor', 'capacityFactor', 'inspiration', 'statPart',
  'postProcessCurve', 'postProcessStatFactor', 'scenarioFactor',
  'roundToFiveOver', 'roundValue', 'clamp',
];

const BUILT_IN_JOBS = [
  'firefight', 'patient', 'doctoring', 'bed_rest', 'childcare', 'basic_work',
  'warden', 'handling', 'cooking', 'hunting', 'construction', 'growing',
  'mining', 'plant_cut', 'smithing', 'tailoring', 'art_work', 'crafting',
  'fishing', 'hauling', 'cleaning', 'dark_study', 'research',
];

const UNKNOWN_APP_JOBS = [
  'tending', 'wait', 'sell', 'entertain', 'dissect', 'gene_craft', 'guard',
  'therapist', 'gen_power', 'cycle',
];

const EXPECTED_DELTAS = [
  'creationGainAlreadyPersisted', 'runtimeGeneAptitude',
  'anomalyHediffAptitude', 'totalDisablementProjection',
  'ideologyIntellectualId', 'unknownDefinition', 'unknownModdedPassion',
  'stackedGlobalLearningOffsets', 'workSpeedGlobalFinalization',
  'cookSpeedOperationOrder', 'miningPluralFacets', 'fishingSkillAndStat',
  'unsupportedAppJob', 'capacityInputPrecision',
];

function stable(value) {
  return JSON.stringify(value);
}

function validate(candidate) {
  const errors = [];
  const check = (condition, code) => { if (!condition) errors.push(code); };
  const runtime = candidate && candidate.runtime || {};
  const skill = candidate && candidate.skillRecord || {};
  const passions = candidate && candidate.passions || {};
  const vanilla = passions.vanillaProvider || {};
  const aptitude = candidate && candidate.aptitude || {};
  const glf = candidate && candidate.globalLearningFactorFixture || {};
  const phases = candidate && candidate.statPhases || [];
  const formulas = candidate && candidate.capacityFormulas || {};
  const stats = candidate && candidate.statDefs || {};
  const jobs = candidate && candidate.jobPolicies || [];
  const formulasByJob = Object.fromEntries((candidate.legacySpeedFormulas || [])
    .map(item => [item.jobId, item]));

  check(candidate && candidate.schemaVersion === 1, 'schema-version');
  check(runtime.version === '1.6.4871' && runtime.revision === 'rev590'
    && runtime.displayVersion === '1.6.4871 rev590', 'runtime-version');
  check(runtime.assemblySha256
    === '5CF1B5BE399D5B1C9C56CA72C9D35B4ECF307FEACF5859D04AC5A1AA5926356A',
  'assembly-fingerprint');

  check(skill.minLevel === 0 && skill.maxLevel === 20, 'skill-bounds');
  check(stable(skill.rawPresenceStates) === stable(['present', 'absent', 'unknown']),
    'raw-record-presence');
  check(stable(skill.resolvedPresenceStates)
    === stable(['present', 'runtimeDefaulted', 'unknown']), 'resolved-record-presence');
  check(skill.runtimeDefaultRequiresCompleteSkillDefCatalogue === true,
    'runtime-default-proof');
  check(stable(skill.missingFieldDefaults) === stable({
    level: 0, xpSinceLastLevel: 0, passion: 'None', xpSinceMidnight: 0,
  }), 'skill-record-defaults');

  const passionEntries = vanilla.entries || [];
  check(stable(passionEntries.map(entry => entry.identity))
    === stable(['None', 'Minor', 'Major']), 'passion-identities');
  check(stable(passionEntries.map(entry => entry.enumValue)) === stable([0, 1, 2]),
    'passion-enum-values');
  check(stable(passionEntries.map(entry => entry.directLearningFactor))
    === stable([0.35, 1, 1.5]), 'passion-factors');
  check(passions.dailySaturation.thresholdXpSinceMidnight === 4000
    && passions.dailySaturation.factorAboveThreshold === 0.2
    && passions.dailySaturation.directLearningAppliesSaturation === false,
  'learning-saturation');

  check(stable((aptitude.sourceFamilies || []).map(item => item.id)) === stable([
    'geneDefAptitudes', 'traitDegreeAptitudes', 'hediffDefAptitudes',
  ]), 'aptitude-source-families');
  check(stable((aptitude.sourceFamilies || []).map(item => item.dlc))
    === stable(['Biotech', 'Anomaly', 'Anomaly']), 'aptitude-dlc-rules');
  check(stable((aptitude.sourceFamilies || []).map(item => item.applicability))
    === stable(['geneActive', 'traitNotSuppressed', 'hediffPresent']),
  'aptitude-applicability');
  check(stable(aptitude.inhumanized) === stable([
    { skillDefId: 'Animals', offset: -12 },
    { skillDefId: 'Social', offset: -12 },
    { skillDefId: 'Artistic', offset: -12 },
  ]), 'inhumanized-aptitudes');
  check(stable(aptitude.excludedCreationSources)
    === stable(['BackstoryDef.skillGains', 'TraitDegreeData.skillGains']),
  'creation-gains-excluded');

  check(glf.base + glf.offsets.reduce((sum, item) => sum + item.value, 0) === 2.5
    && glf.expected === 2.5 && glf.legacyMultiplicativeResult === 3.0625,
  'global-learning-additive-fixture');
  check(glf.slowLearnerOffset === -0.75, 'slow-learner-offset');

  check(phases.length === 28, 'phase-count');
  check(stable(phases.map(item => item.id)) === stable(PHASE_IDS), 'phase-order');
  check(phases.every((item, index) => item.order === index + 1), 'phase-ordinals');

  check(formulas.offset && formulas.offset.expression
    === '(min(capacityValue, max) - 1) * scale', 'capacity-offset-expression');
  check(stable(formulas.offset && formulas.offset.operands)
    === stable(['capacityValue', 'max', 'scale']), 'capacity-offset-operands');
  check(stable(formulas.factor && formulas.factor.operands) === stable([
    'capacityValue', 'allowedDefect', 'max', 'useReciprocal', 'input', 'weight',
  ]), 'capacity-factor-operands');
  check(formulas.factor && formulas.factor.reciprocalNearZeroThreshold === 0.001
    && formulas.factor.reciprocalCap === 5 && formulas.factor.steps.length === 5,
  'capacity-factor-steps');

  check(stable(Object.keys(stats)) === stable([
    'GlobalLearningFactor', 'AnimalsLearningFactor', 'WorkSpeedGlobal',
    'MiningSpeed', 'CookSpeed', 'RestFallRateFactor', 'RestRateMultiplier',
  ]), 'seven-supported-stats');
  check(Object.values(stats).every(stat => stat.support === 'initialSubset'),
    'supported-stat-classification');
  check(stats.WorkSpeedGlobal.defaultBaseValue === 1
    && stats.WorkSpeedGlobal.minValue === 0.3, 'work-speed-global-base-clamp');
  check(stable(stats.WorkSpeedGlobal.statParts.map(part => part.class)) === stable([
    'StatPart_Glow', 'StatPart_Slave', 'StatPart_OverseerStatOffset', 'StatPart_Age',
  ]), 'work-speed-global-parts');
  check(stats.WorkSpeedGlobal.statParts[1].factor === 0.85
    && stats.WorkSpeedGlobal.statParts[3].applicabilityProperty === 'humanlike',
  'work-speed-global-part-operands');
  check(stable(stats.MiningSpeed.dependencies) === stable(['WorkSpeedGlobal'])
    && stats.MiningSpeed.skillNeeds[0].base === 0.04
    && stats.MiningSpeed.skillNeeds[0].perLevel === 0.12,
  'mining-skill-dependency');
  check(stable(stats.MiningSpeed.capacityFactors.map(item => ({
    id: item.capacityDefId, weight: item.weight, max: item.max,
  }))) === stable([
    { id: 'Manipulation', weight: 1, max: null },
    { id: 'Sight', weight: 0.5, max: 1 },
  ]), 'mining-capacity-factors');
  check(stats.CookSpeed.defaultBaseValue === 0 && stats.CookSpeed.noSkillOffset === 20
    && stats.CookSpeed.skillNeeds[0].skillDefId === 'Cooking', 'cook-base-skill');
  check(stable(stats.CookSpeed.capacityOffsets) === stable([
    { capacityDefId: 'Sight', scale: 4, max: 1.5 },
    { capacityDefId: 'Manipulation', scale: 16, max: 1.5 },
  ]), 'cook-capacity-offsets');
  check(stable(stats.CookSpeed.postProcessCurve) === stable([
    { x: -20, y: 0.01 }, { x: 0, y: 0.4 }, { x: 20, y: 1.6 },
  ]) && stable(stats.CookSpeed.postProcessStatFactors) === stable(['WorkSpeedGlobal']),
  'cook-finalization-order-inputs');

  check((candidate.recordOnlyStatDefs || []).includes('DeepDrillingSpeed')
    && (candidate.recordOnlyStatDefs || []).includes('FishingSpeed')
    && !(candidate.recordOnlyStatDefs || []).some(id => Object.hasOwn(stats, id)),
  'record-only-stat-partition');
  check(stable(candidate.dependencyGraph) === stable({
    GlobalLearningFactor: [], AnimalsLearningFactor: [],
    WorkSpeedGlobal: ['WorkSpeedGlobalOffsetMech'],
    MiningSpeed: ['WorkSpeedGlobal'], CookSpeed: ['WorkSpeedGlobal'],
    RestFallRateFactor: [], RestRateMultiplier: [],
  }), 'dependency-graph');

  const jobIds = jobs.map(job => job.jobId);
  check(jobs.length === 33 && new Set(jobIds).size === 33, 'job-policy-count');
  check(BUILT_IN_JOBS.every(id => jobIds.includes(id)), 'built-in-job-coverage');
  check(UNKNOWN_APP_JOBS.every(id => jobIds.includes(id)), 'unknown-job-coverage');
  check(jobs.every(job => Array.isArray(job.sourceWorkTypeDefIds)
    && Array.isArray(job.skillDefIds) && Array.isArray(job.facets)
    && job.facets.every(facet => Array.isArray(facet.statDefIds)
      && ['speed', 'cadence', 'duration', 'quality', 'yield', 'chance',
        'movement', 'other', 'unknown'].includes(facet.metricKind))),
  'plural-job-policy-shape');
  check(jobs.find(job => job.jobId === 'mining').facets.length === 3
    && jobs.find(job => job.jobId === 'cooking').facets.length === 3,
  'plural-facet-policies');
  check(stable(jobs.find(job => job.jobId === 'fishing').skillDefIds)
    === stable(['Animals']), 'fishing-skill-identity');
  check(UNKNOWN_APP_JOBS.every(id => {
    const job = jobs.find(item => item.jobId === id);
    return job.policyKind === 'unknown' && job.sourceWorkTypeDefIds.length === 0
      && job.skillDefIds.length === 0
      && job.facets.length === 1 && job.facets[0].support === 'unknown'
      && job.facets[0].statDefIds.length === 0;
  }), 'unknown-jobs-have-no-guessed-binding');

  check(Object.keys(formulasByJob).length === 11, 'legacy-formula-count');
  check(Object.values(formulasByJob).every(item => [
    'legacyApproximation', 'unsupportedUnknown',
  ].includes(item.classification)), 'legacy-formula-classification');
  check(formulasByJob.cooking.curve === true && formulasByJob.mining.perLevel === 0.12
    && formulasByJob.gen_power.classification === 'unsupportedUnknown',
  'legacy-formula-values');

  check(stable(candidate.namedShadowDeltas) === stable(EXPECTED_DELTAS),
    'named-shadow-deltas');
  check(candidate.precision.decision === 'optionA'
    && candidate.precision.noticeKind === 'capacityInputRoundedByC3'
    && candidate.precision.roundingIncrement === 0.01
    && candidate.precision.numericClaim === 'exactAgainstRoundedC3CapacityInput'
    && candidate.precision.resultState === 'partial'
    && candidate.precision.completeness === 'partial'
    && candidate.precision.bitExactRuntime === false
    && candidate.precision.intervalClaimed === false,
  'option-a-precision-contract');

  const forbiddenKeys = [
    ['primary', 'Skill'].join(''),
    ['effectiveness', 'Score'].join(''),
    ['vanilla', 'Analogue'].join(''),
    ['closest', 'Analogue'].join(''),
  ];
  const walk = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKeys.includes(key)) errors.push('forbidden-policy-key:' + key);
      walk(child);
    }
  };
  walk(candidate);
  return errors;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function run() {
  let total = 0;
  let failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) {
      failures++;
      console.log('  FAIL ' + label);
    }
  };

  ok(validate(fixture).length === 0, 'C5-AUD-001 fixture satisfies the complete contract');

  const phaseMutation = clone(fixture);
  [phaseMutation.statPhases[3], phaseMutation.statPhases[4]]
    = [phaseMutation.statPhases[4], phaseMutation.statPhases[3]];
  ok(validate(phaseMutation).includes('phase-order'),
    'C5-AUD-002 phase-order mutation is rejected');

  const capacityMutation = clone(fixture);
  capacityMutation.capacityFormulas.factor.reciprocalCap = 4;
  ok(validate(capacityMutation).includes('capacity-factor-steps'),
    'C5-AUD-003 capacity operand mutation is rejected');

  const arithmeticMutation = clone(fixture);
  arithmeticMutation.globalLearningFactorFixture.expected = 3.0625;
  ok(validate(arithmeticMutation).includes('global-learning-additive-fixture'),
    'C5-AUD-004 additive learning arithmetic mutation is rejected');

  const skillFlattening = clone(fixture);
  skillFlattening.jobPolicies[2].skillDefIds = 'Medicine';
  ok(validate(skillFlattening).includes('plural-job-policy-shape'),
    'C5-AUD-005 flattened skill collection is rejected');

  const facetFlattening = clone(fixture);
  facetFlattening.jobPolicies[2].facets[0].statDefIds = 'MedicalTendSpeed';
  ok(validate(facetFlattening).includes('plural-job-policy-shape'),
    'C5-AUD-006 flattened facet StatDef collection is rejected');

  const guessedUnknown = clone(fixture);
  const unknownJob = guessedUnknown.jobPolicies.find(job => job.jobId === 'tending');
  unknownJob.sourceWorkTypeDefIds.push('Doctor');
  ok(validate(guessedUnknown).includes('unknown-jobs-have-no-guessed-binding'),
    'C5-AUD-007 guessed unknown-job mapping is rejected');

  const missingEvidence = clone(fixture);
  missingEvidence.runtime.assemblySha256 = 'placeholder';
  ok(validate(missingEvidence).includes('assembly-fingerprint'),
    'C5-AUD-008 missing runtime evidence is rejected');

  const forbiddenShape = clone(fixture);
  forbiddenShape.jobPolicies[0][['primary', 'Skill'].join('')] = 'Shooting';
  ok(validate(forbiddenShape).some(error => error.startsWith('forbidden-policy-key:')),
    'C5-AUD-009 forbidden scalar policy field is rejected');

  const source = fs.readFileSync(path.join(__dirname, 'c5-audit-contract.test.js'), 'utf8');
  ok(!/ok\(\s*true\s*[,)]/.test(source),
    'C5-AUD-010 contract contains no unconditional passing assertion');

  return { name: 'C5 audit contract', total, failures };
}

if (require.main === module) {
  const result = run();
  console.log(`${result.failures ? 'FAIL' : 'PASS'} ${result.name}: ${result.total} checks`);
  process.exit(result.failures ? 1 : 0);
}

module.exports = run;
module.exports.validate = validate;

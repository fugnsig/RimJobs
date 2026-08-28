/** C7 Task 7: scheduler C6 mechanism consumption and C7 policy parity. */
const fs = require('fs');
const path = require('path');
const { loadScripts } = require('./_harness');

module.exports = function run() {
  let total = 0, failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) { failures++; console.log('  FAIL ' + label); }
  };
  const equal = (actual, expected, label) => ok(
    JSON.stringify(actual) === JSON.stringify(expected),
    label + (JSON.stringify(actual) === JSON.stringify(expected)
      ? '' : `\n    expected ${JSON.stringify(expected)}\n    actual   ${JSON.stringify(actual)}`));

  const completeCoverage = Object.fromEntries(
    ['restNeed', 'recreation', 'windows', 'conditions', 'activities']
      .map(family => [family, { completeness: 'complete', unresolvedEvidence: [] }]));
  const unknownCoverage = Object.fromEntries(
    ['restNeed', 'recreation', 'windows', 'conditions', 'activities']
      .map(family => [family, { completeness: 'unknown', unresolvedEvidence: [] }]));
  const statFact = (statDefId, value, overrides) => Object.assign({
    statDefId, state: 'resolved', completeness: 'complete', confidence: 'verified',
    resolvedPrefixValue: value, frontier: null, precision: [],
    dependencyPath: [statDefId], applied: [], evidence: [], unresolved: [],
  }, overrides || {});
  let statResolveCalls = 0;
  const StructuralStatResolver = {
    resolve(c5Context, statDefId) {
      statResolveCalls++;
      return c5Context.statFacts && c5Context.statFacts[statDefId]
        || statFact(statDefId, 1);
    },
  };
  const traits = {
    night_owl: {}, undergrounder: {}, quick_sleeper: {}, ascetic: {},
    body_mastery: {}, depressive: { breakThreshold: 0.06 },
    neurotic: { breakThreshold: 0.04 }, fragile: { breakThreshold: 0.12 },
  };
  const xenos = {
    baseline: { uvSensitivity: 0, genes: [] },
    uv: { uvSensitivity: 1, genes: [] },
    low_sleep: { uvSensitivity: 0, genes: ['LowSleep'] },
    sleepless: { uvSensitivity: 0, genes: ['gene_no_sleep'] },
  };
  const App = {
    state: {
      shiftTypes: ['Anything', 'Sleep', 'Work', 'Recreation', 'Meditate'],
      priorities: {}, customGenes: {},
    },
    getTrait(id) { return traits[id] || null; },
    getXeno(id) { return xenos[id] || xenos.baseline; },
  };
  const ctx = loadScripts(['temporal-profile-resolver.js', 'engine.js'], {
    App, StructuralStatResolver,
    GENES: [{ id: 'gene_no_sleep', label: 'Sleepless' }],
    JOBS: [],
  });
  const Engine = ctx.Engine;

  const effect = (evidenceId, type, extra) => Object.assign({
    evidenceId, type, provenance: { sourceKind: 'test', sourceId: evidenceId },
  }, extra || {});
  const pawn = (id, overrides) => Object.assign({
    id, name: id, bioAge: 20, traits: [], xenotype: 'baseline',
    health: [], _saveHediffs: [], moodPreset: 'normal', schedule: Array(24).fill(0),
  }, overrides || {});
  const c5Context = (overrides) => {
    const source = overrides || {};
    return {
      pawnEvidence: {
        effects: source.effects || [],
        temporalCoverage: source.temporalCoverage || completeCoverage,
      },
      statFacts: source.statFacts || {
        RestFallRateFactor: statFact('RestFallRateFactor', 1),
        RestRateMultiplier: statFact('RestRateMultiplier', 1),
      },
    };
  };
  const contextMap = (entries) => new Map(entries.map(([p, c5]) =>
    [p.id, { pawnId: p.id, c5Context: c5 }]));
  const run = (pawns, contexts) => {
    const report = Engine.optimizeSchedules(pawns, { contextMap: contexts });
    return { schedules: Object.fromEntries(pawns.map(p => [p.id, p.schedule.slice()])), report };
  };

  const S = {
    ordinary: [0,0,0,0,0,3,3,2,2,2,2,2,2,2,2,1,1,1,1,1,1,1,1,0],
    night: [2,2,2,2,0,0,0,0,0,1,1,1,1,1,1,1,1,0,3,3,2,2,2,2],
    uv: [0,0,0,0,0,1,1,1,1,1,1,1,1,0,3,3,2,2,2,2,2,2,2,2],
    quick: [0,0,0,3,3,2,2,2,2,2,2,2,2,0,0,0,0,1,1,1,1,1,1,0],
    low: [3,3,2,2,2,2,2,2,2,2,0,0,0,0,0,0,0,0,0,0,1,1,1,0],
    sleepless: [0,0,0,0,0,0,2,2,2,2,2,2,2,2,0,0,0,0,3,3,0,0,0,0],
    joy3: [0,0,0,0,1,3,3,3,2,2,2,2,2,2,2,2,1,1,1,1,1,1,1,0],
    joy4: [0,0,0,1,1,3,3,3,3,2,2,2,2,2,2,2,2,1,1,1,1,1,1,0],
    ascetic: [0,0,0,0,0,3,2,2,2,2,2,2,2,2,0,1,1,1,1,1,1,1,1,0],
    child: [0,0,0,0,0,3,3,3,3,2,2,2,2,2,2,1,1,1,1,1,1,1,1,0],
    baby: [1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1],
    downed: Array(24).fill(0),
    meditation: [0,0,0,1,1,3,3,4,4,2,2,2,2,2,2,2,2,1,1,1,1,1,1,0],
  };

  const nightEffects = [
    effect('night:avoid', 'avoidHours', { hours: [11,12,13,14,15,16,17], weight: 4 }),
    effect('night:prefer', 'preferHours', { hours: [23,0,1,2,3,4,5,6], weight: 2 }),
  ];
  const uvEffects = [effect('uv:daylight', 'avoidCondition', {
    condition: 'daylight', fallbackHours: { start: 6, end: 18 }, weight: 4,
  })];
  const quickEffects = [effect('quick:override', 'sleepHoursOverride', { value: 6 })];
  const lowEffects = [effect('low:override', 'sleepHoursOverride', { value: 3 })];
  const suppressedEffects = [effect('rest:suppressed', 'needSuppression', {
    target: 'Rest', value: true,
  })];
  const asceticEffects = [effect('ascetic:recreation', 'recreationHoursRecommendation', {
    delta: -1,
  })];
  const meditationEffect = resolved => effect('psylink:meditation', 'requiredActivity', {
    activity: 'meditation', obligation: 'recommended', satisfiesNeeds: ['recreation'],
    hours: 1, composition: { resolved },
  });

  const light = 'Light workload - shorter work block';
  const scheduleCase = (code, p, c5, expected, expectedDrivers) => {
    const result = run([p], contextMap([[p, c5]]));
    equal(result.schedules[p.id], expected, code + ' exact 24-hour array');
    ok(result.report && result.report.pawns && result.report.pawns.length === 1,
      code + ' preserves one rationale record');
    if (expectedDrivers) {
      equal(result.report.pawns[0].drivers, expectedDrivers,
        code + ' exact rationale drivers');
    }
    return result;
  };

  scheduleCase('C7-SCHED-001 ordinary pawn', pawn('ordinary'), c5Context(), S.ordinary,
    [light]);
  const night = scheduleCase('C7-SCHED-002 Night Owl window',
    pawn('night'), c5Context({ effects: nightEffects }), S.night,
    ['Night Owl - sleeps through the 11h-18h mood-loss window, awake for the 23h-6h bonus', light]);
  ok(night.report.pawns[0].drivers.some(d => d.startsWith('Night Owl')),
    'C7-SCHED-002 rationale preserves Night Owl driver');
  scheduleCase('C7-SCHED-003 daylight condition',
    pawn('uv'), c5Context({ effects: uvEffects }), S.uv,
    ['UV-sensitive - sleeps through daylight (6h-18h) to avoid sunlight', light]);
  scheduleCase('C7-SCHED-004 Undergrounder policy',
    pawn('underground', { traits: ['undergrounder'] }),
    c5Context({ effects: uvEffects }), S.ordinary,
    ['Undergrounder - unaffected by darkness, so kept flexible', light]);
  scheduleCase('C7-SCHED-005 Quick Sleeper compatibility projection',
    pawn('quick'), c5Context({ effects: quickEffects, statFacts: {
      RestFallRateFactor: statFact('RestFallRateFactor', 1),
      RestRateMultiplier: statFact('RestRateMultiplier', 1.5),
    } }), S.quick);
  scheduleCase('C7-SCHED-006 Low Sleep compatibility projection',
    pawn('low'), c5Context({ effects: lowEffects, statFacts: {
      RestFallRateFactor: statFact('RestFallRateFactor', 0.4),
      RestRateMultiplier: statFact('RestRateMultiplier', 1),
    } }), S.low);
  scheduleCase('C7-SCHED-007 Sleepless need suppression',
    pawn('sleepless'), c5Context({ effects: suppressedEffects }), S.sleepless);
  scheduleCase('C7-SCHED-008 Body Mastery need suppression',
    pawn('body-mastery', { traits: ['body_mastery'] }),
    c5Context({ effects: suppressedEffects }), S.sleepless,
    ['Body Mastery - no sleep needed', light]);
  const meditation = scheduleCase('C7-SCHED-009 resolved meditation activity',
    pawn('meditation'), c5Context({ effects: [meditationEffect(true)] }), S.meditation,
    ['Psycaster - dedicated meditation block to recover psyfocus', light]);
  ok(meditation.report.pawns[0].drivers.some(d => d.startsWith('Psycaster')),
    'C7-SCHED-009 rationale preserves Psycaster driver');
  scheduleCase('C7-SCHED-010 unresolved activity composition',
    pawn('unresolved-meditation', { health: [{ def: 'Hediff_Psylink' }] }),
    c5Context({ effects: [meditationEffect(false)] }), S.ordinary, [light]);

  const partialRest = {
    RestFallRateFactor: statFact('RestFallRateFactor', 1),
    RestRateMultiplier: statFact('RestRateMultiplier', null, {
      state: 'partial', completeness: 'partial', resolvedPrefixValue: null,
      frontier: { state: 'frontier', operation: { operationId: 'unknown-rest-op' } },
      precision: [{ code: 'roundedCapacityInput' }],
      dependencyPath: ['RestRateMultiplier', 'Metabolism'],
      applied: [{ dependency: { statDefId: 'Metabolism', state: 'unknown' } }],
      evidence: [{ evidenceId: 'rest:partial' }],
      unresolved: [{ reasonCode: 'dependencyUnknown' }],
    }),
  };
  scheduleCase('C7-SCHED-011 partial Rest StatEvaluation fallback',
    pawn('partial-rest'), c5Context({ effects: quickEffects, statFacts: partialRest }), S.ordinary);
  scheduleCase('C7-SCHED-012 unknown temporal coverage fallback',
    pawn('unknown-quick', { traits: ['quick_sleeper'] }),
    c5Context({ temporalCoverage: unknownCoverage }), S.quick,
    ['Quick Sleeper - only 6h of sleep', light]);
  scheduleCase('C7-SCHED-013 child policy', pawn('child', { bioAge: 8 }), c5Context(), S.child,
    ['Child - short work block; age-gated jobs only (skilled work unlocks at 10-13)']);
  scheduleCase('C7-SCHED-014 baby policy', pawn('baby', { bioAge: 1 }), c5Context(), S.baby,
    ['Baby - free schedule, naps and feeds on demand']);
  scheduleCase('C7-SCHED-015 downed policy', pawn('downed', { downed: true }), c5Context(), S.downed,
    ['Downed - incapacitated in bed (from the save import); no work scheduled until they recover', light]);
  scheduleCase('C7-SCHED-016 recreation mechanism',
    pawn('ascetic-mechanism'), c5Context({ effects: asceticEffects }), S.ascetic,
    ['Ascetic - needs less recreation', light]);
  scheduleCase('C7-SCHED-017 mood-sensitive policy',
    pawn('depressive', { traits: ['depressive'] }), c5Context(), S.joy3,
    ['Mood-sensitive - extra recreation', light]);
  scheduleCase('C7-SCHED-018 break-risk policy',
    pawn('fragile', { traits: ['fragile'] }), c5Context(), S.joy4,
    ['High break risk - extra recreation to protect mood', light]);

  App.state.priorities = { workload: { a: 1, b: 1, c: 1, d: 1, e: 1 } };
  const workloadPawn = pawn('workload');
  const workloadResult = run([workloadPawn], contextMap([[workloadPawn, c5Context()]]));
  ok(workloadResult.schedules.workload.filter(v => v === 2).length === 12,
    'C7-SCHED-019 workload policy preserves twelve-hour heavy block');
  ok(workloadResult.report.pawns[0].drivers.some(d => d.startsWith('Heavy workload')),
    'C7-SCHED-019 workload rationale remains explicit C7 policy');

  App.state.priorities = {
    doctor: { doctoring: 1 }, cook: { cooking: 1 }, flexible: {},
  };
  const specialists = [pawn('doctor'), pawn('cook'), pawn('flexible')];
  const specialistContexts = contextMap(specialists.map(p => [p, c5Context()]));
  const specialistResult = run(specialists, specialistContexts);
  ok(specialistResult.report.pawns.filter(r =>
    r.drivers.some(d => d.startsWith('Critical specialist'))).length === 2,
    'C7-SCHED-020 critical specialists retain rationale and Phase 2 ordering');
  ok(specialists.every(p => p.schedule.length === 24),
    'C7-SCHED-020 specialist staggering preserves all complete arrays');

  if (typeof Engine._c7TemporalMechanism === 'function') {
    const unknownPawn = pawn('unknown-proof');
    const unknownCtx = { pawnId: unknownPawn.id,
      c5Context: c5Context({ temporalCoverage: unknownCoverage }) };
    const mechanism = Engine._c7TemporalMechanism(unknownCtx);
    ok(mechanism.dimensions.rest.completeness === 'unknown'
        && mechanism.dimensions.windows.completeness === 'unknown'
        && mechanism.dimensions.activities.completeness === 'unknown',
      'C7-SCHED-021 unknown temporal coverage is never upgraded to complete');
    ok(mechanism.rest.quality.restFallRateFactor.state === 'resolved'
        && Array.isArray(mechanism.rest.quality.restFallRateFactor.precision)
        && Array.isArray(mechanism.rest.quality.restFallRateFactor.dependencies)
        && Array.isArray(mechanism.rest.quality.restFallRateFactor.evidence)
        && Array.isArray(mechanism.rest.quality.restFallRateFactor.unresolved),
      'C7-SCHED-022 nested Rest StatEvaluation quality fields are forwarded');

    const partialCtx = { pawnId: 'partial-quality',
      c5Context: c5Context({ effects: quickEffects, statFacts: partialRest }) };
    const partialMechanism = Engine._c7TemporalMechanism(partialCtx);
    ok(partialMechanism.rest.quality.restRateMultiplier.frontier
        && partialMechanism.rest.quality.restRateMultiplier.completeness === 'partial'
        && partialMechanism.rest.quality.restRateMultiplier.precision.length === 1
        && partialMechanism.rest.quality.restRateMultiplier.dependencies.length === 1
        && partialMechanism.rest.quality.restRateMultiplier.unresolved.length === 1,
      'C7-SCHED-023 partial rest frontier, precision, dependencies and unresolved survive');
  } else {
    ok(false, 'C7-SCHED-021 _c7TemporalMechanism helper exists');
    ok(false, 'C7-SCHED-022 nested Rest StatEvaluation quality fields are forwarded');
    ok(false, 'C7-SCHED-023 partial rest quality survives');
  }

  ok(statResolveCalls >= 2,
    'C7-SCHED-024 schedules use actual TemporalProfileResolver.resolve(c5Context)');
  const engineSource = fs.readFileSync(path.join(__dirname, '..', 'files', 'engine.js'), 'utf8');
  const mechanismStart = engineSource.indexOf('_c7TemporalMechanism(');
  const mechanismEnd = engineSource.indexOf('\n  },', mechanismStart);
  const mechanismSource = mechanismStart >= 0 && mechanismEnd >= 0
    ? engineSource.slice(mechanismStart, mechanismEnd) : '';
  ok(/TemporalProfileResolver\.resolve\s*\(\s*pawnContext\.c5Context\s*\)/.test(mechanismSource),
    'C7-SCHED-025 helper invokes the production C6 resolver API exactly');
  ok(!/night_owl|quick_sleeper|body_mastery|gene_no_sleep|low_?sleep|psylink/i.test(mechanismSource),
    'C7-SCHED-026 C6 consumption helper contains no identity semantics');
  ok(!/completeness\s*:\s*['"]complete['"]/.test(mechanismSource),
    'C7-SCHED-027 C6 consumption never fabricates complete coverage');

  const callersSource = ['app-schedule.js', 'app-pawns.js'].map(name =>
    fs.readFileSync(path.join(__dirname, '..', 'files', name), 'utf8')).join('\n');
  const calls = callersSource.match(/optimizeSchedules\s*\([^;]+\)/g) || [];
  ok(calls.length === 2 && calls.every(call => /contextMap/.test(call)),
    'C7-SCHED-028 both production scheduler callers forward request-scoped contexts');
  ok(/_c7EvidenceOptionsByPawn/.test(callersSource),
    'C7-SCHED-029 callers forward actual provider-derived evidence options');

  return { name: 'C7 scheduler mechanism-policy parity', total, failures };
};

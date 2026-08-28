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

  let compatibilitySpeedCalls = 0;
  let canonicalPassionCalls = 0;
  const App = {
    state: { customJobs: [], shiftTypes: ['Anything', 'Work', 'Joy', 'Sleep'] },
    getTrait() { return null; },
    getIdeoEffects() { return {}; },
    _passionValue(pawnValue, skillId) {
      return (pawnValue.passions || {})[skillId] || 0;
    },
    _passionMeta(rawIdentity) {
      return { bucket: Number(rawIdentity) || 0 };
    },
  };
  const C5LegacyCompatibility = {
    evaluateLegacySkill(pawnValue) {
      return pawnValue.compatibilitySkill;
    },
    evaluateLegacyJobWorkSpeed(pawnValue) {
      compatibilitySpeedCalls++;
      return pawnValue.compatibilityWorkSpeed;
    },
  };
  const StructuralPassionResolver = {
    resolve(c5Context, skillDefId) {
      canonicalPassionCalls++;
      return c5Context.passionFacts[skillDefId];
    },
  };
  const ctx = loadScripts(['data.js', 'engine.js'], {
    App, C5LegacyCompatibility, StructuralPassionResolver,
  });
  const Engine = ctx.Engine;
  const jobs = ctx.JOBS;
  const important = jobs.filter(job => job.important);
  const pawn = (id, overrides) => Object.assign({
    id, role: 'none', traits: [], bioAge: 20, incapable: [],
  }, overrides || {});
  const prioritiesFor = (pawns, value) => Object.fromEntries(pawns.map(p => [p.id,
    Object.fromEntries(important.map(job => [job.id, value]))]));
  const contextMap = (pawns, stateFor) => new Map(pawns.map(p => [p.id, {
    permission(job) {
      const state = stateFor(p, job).permission;
      return { state, blockers: [], unknowns: state === 'unknown' ? [{}] : [] };
    },
    availability(job) {
      const state = stateFor(p, job).availability;
      return { state, blockers: state === 'unavailable' ? [{}] : [], unknowns: [] };
    },
  }]));
  const allEligible = () => ({ permission: 'allowed', availability: 'available' });

  {
    const p = pawn('healthy');
    const map = contextMap([p], allEligible);
    ok(Engine._c7IsEligible(map, p, important[0]) === true,
      'C7-SUM-001 allowed and available is aggregate-eligible');
    ok(Engine.calculateViability([p], prioritiesFor([p], 1), {}, map) === 50,
      'C7-VIA-001 healthy full coverage keeps baseline score');
    ok(Engine.getBottlenecks([p], prioritiesFor([p], 1), map).length === 0,
      'C7-BOT-001 healthy full coverage has no bottlenecks');
  }

  {
    const p = pawn('downed', {
      downed: true,
      currentStatusSources: { facts: { downed: { state: 'known', value: true } } },
    });
    const map = contextMap([p], () => ({
      permission: 'allowed', availability: 'unavailable',
    }));
    ok(Engine._c7IsEligible(map, p, important[0]) === false,
      'C7-SUM-002 downed Availability is excluded');
    ok(Engine.calculateViability([p], prioritiesFor([p], 1), {}, map) === 0,
      'C7-VIA-002 downed pawn does not cover critical work');
    const gaps = Engine.getBottlenecks([p], prioritiesFor([p], 1), map);
    ok(gaps.some(message => message === 'NO COVERAGE: Firefight'),
      'C7-BOT-002 downed pawn is excluded from bottleneck coverage');
    ok(!gaps.some(message => message.startsWith('CONFLICT:')),
      'C7-BOT-002 downed exclusion does not invent conflicts');
  }

  {
    const p = pawn('unknown-definition');
    const map = contextMap([p], () => ({
      permission: 'unknown', availability: 'unknown',
    }));
    ok(Engine._c7IsEligible(map, p, important[0]) === true,
      'C7-SUM-003 unknown is not proven blocked');
    ok(Engine.calculateViability([p], prioritiesFor([p], 1), {}, map) === 50,
      'C7-VIA-003 unknown participates in frozen viability policy');
    ok(Engine.getBottlenecks([p], prioritiesFor([p], 1), map).length === 0,
      'C7-BOT-003 unknown participates in frozen bottleneck policy');
  }

  {
    const p = pawn('structural-block');
    const map = contextMap([p], () => ({
      permission: 'blocked', availability: 'available',
    }));
    ok(Engine._c7IsEligible(map, p, important[0]) === false,
      'C7-SUM-004 blocked Permission is excluded');
    ok(Engine.calculateViability([p], prioritiesFor([p], 1), {}, map) === 0,
      'C7-VIA-004 blocked pawn does not cover critical work');
  }

  const deltaFixture = (label, p, targetJobId) => {
    const priorities = prioritiesFor([p], 1);
    const legacy = contextMap([p], (_pawn, job) => ({
      permission: job.id === targetJobId ? 'blocked' : 'allowed',
      availability: 'available',
    }));
    const canonical = contextMap([p], allEligible);
    const legacyScore = Engine.calculateViability([p], priorities, {}, legacy);
    const canonicalScore = Engine.calculateViability([p], priorities, {}, canonical);
    ok(legacyScore === 40, label + ' legacy loses only the target coverage');
    ok(canonicalScore === 50, label + ' canonical restores only the target coverage');
    const unchangedJobs = important.filter(job => job.id !== targetJobId);
    ok(unchangedJobs.every(job => Engine._c7IsEligible(legacy, p, job)
      === Engine._c7IsEligible(canonical, p, job)), label + ' other jobs are unchanged');
  };

  deltaFixture('C7-DELTA-FIREFIGHT legacyBlockedCanonicalNotBlocked', pawn('violent', {
    incapable: ['violence'], traitRuntimeFacts: [{ traitDefName: 'Violent' }],
  }), 'firefight');
  deltaFixture('C7-DELTA-HAULING legacyBlockedCanonicalNotBlocked', pawn('zero-manip', {
    manipulation: 0,
    health: [{ type: 'missing', partIdx: 28 }, { type: 'missing', partIdx: 39 }],
  }), 'hauling');

  {
    const p = pawn('human-fishing-six', { bioAge: 6, raceDefName: 'Human' });
    const map = contextMap([p], allEligible);
    const score = Engine.calculateViability([p], prioritiesFor([p], 1), {}, map);
    ok(!important.some(job => job.id === 'fishing'),
      'C7-DELTA-FISHING aggregate fixtures prove Fishing is not a summary category');
    ok(score === 50,
      'C7-DELTA-FISHING does not alter viability outside its exact grid consumer');
  }

  {
    const a = pawn('conflict-a');
    const b = pawn('conflict-b');
    const priorities = prioritiesFor([a, b], null);
    priorities[a.id].construction = 1;
    priorities[b.id].construction = 1;
    const map = contextMap([a, b], allEligible);
    const gaps = Engine.getBottlenecks([a, b], priorities, map);
    ok(gaps.some(message => message.startsWith('CONFLICT: Multiple pawns are P1 on Construct')),
      'C7-BOT-004 existing conflict detection is unchanged');
  }

  {
    const a = pawn('capacity-a', { compatibilityWorkSpeed: 2 });
    const b = pawn('capacity-b', { compatibilityWorkSpeed: 1.5 });
    const priorities = {
      [a.id]: { mining: 1 },
      [b.id]: { mining: 3 },
    };
    const map = contextMap([a, b], allEligible);
    const originalEvaluatePawnJob = Engine.evaluatePawnJob;
    Engine.evaluatePawnJob = () => { throw new Error('legacy aggregation must not run'); };
    let capacity = null;
    try {
      capacity = Engine.calculateWorkCapacity([a, b], { id: 'mining' }, priorities, map);
    } catch (_) {
      capacity = null;
    }
    Engine.evaluatePawnJob = originalEvaluatePawnJob;
    ok(capacity === 2.5,
      'C7-WC-001 work capacity preserves the frozen numeric compatibility projection');
    ok(compatibilitySpeedCalls === 2,
      'C7-WC-001 work capacity uses the explicit C7 compatibility boundary');
  }

  {
    const healthy = pawn('temporal-healthy');
    const unavailable = pawn('temporal-unavailable');
    const unknown = pawn('temporal-unknown');
    const blocked = pawn('temporal-blocked');
    const pawns = [healthy, unavailable, unknown, blocked];
    const schedules = Object.fromEntries(pawns.map(p => [p.id, Array(24).fill(0)]));
    const map = contextMap(pawns, p => {
      if (p.id === unavailable.id) {
        return { permission: 'allowed', availability: 'unavailable' };
      }
      if (p.id === unknown.id) {
        return { permission: 'unknown', availability: 'unknown' };
      }
      if (p.id === blocked.id) {
        return { permission: 'blocked', availability: 'available' };
      }
      return allEligible();
    });
    const originalEvaluatePawnJob = Engine.evaluatePawnJob;
    Engine.evaluatePawnJob = () => ({ permission: { status: 'allowed' } });
    const coverage = Engine.calculateTemporalCoverage(
      pawns, schedules, { id: 'doctoring' }, map);
    Engine.evaluatePawnJob = originalEvaluatePawnJob;
    ok(coverage.every(hour => hour.count === 2),
      'C7-TC-001 healthy and explicit unknown pawns preserve temporal participation');
    ok(coverage.every(hour => hour.capablePawns.some(p => p.id === healthy.id)),
      'C7-TC-001 allowed and available pawn is included');
    ok(coverage.every(hour => !hour.capablePawns.some(p => p.id === unavailable.id)),
      'C7-TC-002 unavailable pawn is excluded by Availability');
    ok(coverage.every(hour => hour.capablePawns.some(p => p.id === unknown.id)),
      'C7-TC-003 unknown pawn participates under not-proven-blocked policy');
    ok(coverage.every(hour => !hour.capablePawns.some(p => p.id === blocked.id)),
      'C7-TC-004 blocked Permission is excluded');
  }

  {
    const p = pawn('passion-canonical', { passions: { medicine: 0 } });
    const c5Context = {
      effectivenessSnapshot: {
        skillPolicies: { Medicine: { appSkillId: 'medicine' } },
      },
      passionFacts: {
        Medicine: { state: 'resolved', completeness: 'complete', compatibilityBucket: 2 },
      },
    };
    const bucket = Engine.passionBucket(p, 'medicine', { c5Context });
    ok(bucket === 2,
      'C7-PASSION-001 exact requested SkillDef projects its canonical compatibility bucket');
    ok(canonicalPassionCalls === 1,
      'C7-PASSION-001 canonical passion resolver is used when context is available');
    ok(Engine.passionBucket(p, 'medicine') === 0,
      'C7-PASSION-002 context-free ranking callers retain the frozen legacy bucket');
  }

  {
    let permissionCalls = 0;
    let availabilityCalls = 0;
    const doctor = {
      id: 'doctoring', name: 'Doctor', important: true, skill: 'medicine',
    };
    const ada = pawn('analyser-ada', {
      name: 'Ada', compatibilitySkill: 12, compatibilityWorkSpeed: 1.2,
      compatibilityPassion: 2, passions: { medicine: 0 },
    });
    const bob = pawn('analyser-bob', {
      name: 'Bob', compatibilitySkill: 8, compatibilityWorkSpeed: 0.8,
      compatibilityPassion: 0, passions: { medicine: 0 },
    });
    const unavailable = pawn('analyser-downed', {
      name: 'Downed', compatibilitySkill: 20, compatibilityWorkSpeed: 3,
      compatibilityPassion: 2, passions: { medicine: 0 },
    });
    const analyserContexts = new Map([ada, bob, unavailable].map(p => [p.id, {
      permission() {
        permissionCalls++;
        return { state: p.id === bob.id ? 'unknown' : 'allowed' };
      },
      availability() {
        availabilityCalls++;
        return { state: p.id === unavailable.id ? 'unavailable'
          : p.id === bob.id ? 'unknown' : 'available' };
      },
      c5Context: {
        effectivenessSnapshot: {
          skillPolicies: { Medicine: { appSkillId: 'medicine' } },
        },
        passionFacts: {
          Medicine: {
            state: 'resolved', completeness: 'complete',
            compatibilityBucket: p.compatibilityPassion,
          },
        },
      },
    }]));
    const priorities = {
      [ada.id]: { doctoring: null },
      [bob.id]: { doctoring: 2 },
      [unavailable.id]: { doctoring: 1 },
    };
    const originalEvaluatePawnJob = Engine.evaluatePawnJob;
    Engine.evaluatePawnJob = () => { throw new Error('analyser must not use legacy aggregation'); };
    let result = null;
    try {
      result = Engine.analyzeColony(
        [ada, bob, unavailable], priorities, [doctor], analyserContexts);
    } catch (_) {
      result = null;
    }
    Engine.evaluatePawnJob = originalEvaluatePawnJob;
    const expectedBest = {
      pawnId: ada.id, pawnName: ada.name, skill: 12, passion: 2,
      score: 170, realSpeed: 1.2, hasSkill: true,
    };
    ok(result && JSON.stringify(result.gaps) === JSON.stringify([{
      jobId: 'doctoring', jobName: 'Doctor', severity: 'warning',
      reason: 'Doctor has no P1 assignment (best assigned at P2)', bestPawn: expectedBest,
    }]), 'C7-ANA-001 analyser gaps preserve exact text and best-pawn projection');
    ok(result && JSON.stringify(result.recommendations) === JSON.stringify([{
      jobId: 'doctoring', jobName: 'Doctor', pawnId: ada.id, pawnName: ada.name,
      skill: 12, passion: 2,
      reason: 'Skill 12 + major passion, 120% speed, currently unassigned',
      suggestedPriority: 1,
    }]), 'C7-ANA-002 analyser recommendations preserve exact text and priority');
    ok(result && JSON.stringify(result.singlePoints) === JSON.stringify([{
      jobId: 'doctoring', jobName: 'Doctor', pawnName: bob.name, pawnId: bob.id,
    }]), 'C7-ANA-003 analyser single-point output remains parity-stable');
    ok(permissionCalls === 3 && availabilityCalls === 3,
      'C7-ANA-005 each pawn/job Permission and Availability is evaluated once');
    ok(result && !JSON.stringify(result).includes(unavailable.id),
      'C7-ANA-006 unavailable pawn is excluded without broadening other current states');

    const tieA = pawn('tie-a', {
      name: 'Tie A', compatibilitySkill: 10, compatibilityWorkSpeed: 1,
      compatibilityPassion: 1, passions: { medicine: 1 },
    });
    const tieB = pawn('tie-b', {
      name: 'Tie B', compatibilitySkill: 10, compatibilityWorkSpeed: 1,
      compatibilityPassion: 1, passions: { medicine: 1 },
    });
    const tieContexts = new Map([tieA, tieB].map(p => [p.id, {
      c5Context: {
        effectivenessSnapshot: { skillPolicies: { Medicine: { appSkillId: 'medicine' } } },
        passionFacts: { Medicine: {
          state: 'resolved', completeness: 'complete', compatibilityBucket: 1,
        } },
      },
    }]));
    let best = null;
    try { best = Engine._bestPawnForJob([tieA, tieB], doctor, tieContexts); }
    catch (_) { best = null; }
    ok(best && best.pawnId === tieA.id && best.score === 125,
      'C7-ANA-004 frozen score and stable input-order tie break are preserved');

    const hauling = { id: 'hauling', name: 'Haul', important: true, skill: null };
    const haulingPawn = pawn('hauler', {
      name: 'Hauler', compatibilitySkill: 20, compatibilityWorkSpeed: 1,
      compatibilityPassion: 2,
    });
    let haulingBest = null;
    try {
      haulingBest = Engine._bestPawnForJob([haulingPawn], hauling, new Map([
        [haulingPawn.id, { c5Context: null }],
      ]));
    } catch (_) { haulingBest = null; }
    ok(haulingBest && haulingBest.hasSkill === false
      && haulingBest.skill === 0 && haulingBest.passion === 0,
    'C7-ANA-007 skillless jobs remain genuinely skillless');
  }

  {
    let contextBuilds = 0;
    const forwarded = [];
    const plannerEngine = {
      analyzeColony(_pawns, _priorities, _jobs, map) {
        forwarded.push(map);
        return { gaps: [], recommendations: [], singlePoints: [] };
      },
    };
    const plannerCtx = loadScripts(['app-priorities.js'], {
      App: { state: {} }, Engine: plannerEngine,
      PriorityScale: { highest: 1, lowestManual: () => 4 },
      document: { getElementById() { return null; } },
      window: { innerWidth: 1200 },
    });
    const plannerMap = new Map([['planner-pawn', { pawnId: 'planner-pawn' }]]);
    const planner = Object.assign(Object.create(plannerCtx.App), {
      state: {
        pawns: [{ id: 'planner-pawn' }], priorities: {},
        settings: { priorityLocked: false },
      },
      _visibleJobs() { return [{ id: 'doctoring' }]; },
      _c7PawnContextMap() { contextBuilds++; return plannerMap; },
      renderOptimizer() {},
      _optimizerHTML() { return ''; },
      _lockedPriorityActionAttrs() { return ''; },
      _showGenericModal() {},
      _guardPriorityEdit() { return true; },
      renderTable() {},
      triggerAutoSave() {},
    });
    planner.runOptimizer();
    planner.openWorkPlanner();
    ok(contextBuilds === 2,
      'C7-WP-001 each Work Planner analyser entry creates one request context map');
    ok(forwarded.length === 2 && forwarded.every(map => map === plannerMap),
      'C7-WP-002 Work Planner entry points forward the request context map');
    planner.applyOptimizerSuggestion('planner-pawn', 'doctoring', 1);
    ok(planner.state.priorities['planner-pawn'].doctoring === 1,
      'C7-WP-003 Apply One preserves the exact priority mutation');
    ok(contextBuilds === 3 && forwarded[2] === plannerMap,
      'C7-WP-003 Apply One refresh uses a new request-scoped coordinator map');
    planner._optimizerResult = {
      gaps: [{ jobId: 'doctoring', bestPawn: { pawnId: 'planner-pawn' } }],
      recommendations: [{
        jobId: 'research', pawnId: 'planner-pawn', suggestedPriority: 2,
      }],
      singlePoints: [],
    };
    planner.applyAllOptimizerSuggestions();
    ok(planner.state.priorities['planner-pawn'].doctoring === 1
      && planner.state.priorities['planner-pawn'].research === 2,
    'C7-WP-004 Apply All preserves gap and recommendation mutations');
    ok(contextBuilds === 4 && forwarded[3] === plannerMap,
      'C7-WP-004 Apply All refresh uses a new request-scoped coordinator map');
  }

  const source = fs.readFileSync(path.join(__dirname, '..', 'files', 'engine.js'), 'utf8');
  const viabilitySource = source.slice(source.indexOf('  calculateViability('),
    source.indexOf('  getBottlenecks('));
  const bottleneckSource = source.slice(source.indexOf('  getBottlenecks('),
    source.indexOf('  _c7IsEligible('));
  ok(!/evaluateJobPermission/.test(viabilitySource),
    'C7-STATIC-VIA viability has no direct legacy Permission call');
  ok(!/evaluateJobPermission/.test(bottleneckSource),
    'C7-STATIC-BOT bottlenecks have no direct legacy Permission call');
  const workCapacitySource = source.slice(source.indexOf('  calculateWorkCapacity('),
    source.indexOf('  /**\n   * Survival Index calculation.'));
  const temporalCoverageStart = source.indexOf('  calculateTemporalCoverage(');
  const temporalCoverageNext = source.indexOf('  analyzeTemporalResilience(', temporalCoverageStart);
  const temporalCoverageFallback = source.indexOf('  calculateWorkSpeedMod(', temporalCoverageStart);
  const temporalCoverageSource = source.slice(temporalCoverageStart,
    temporalCoverageNext >= 0 ? temporalCoverageNext : temporalCoverageFallback);
  const passionBucketSource = source.slice(source.indexOf('  passionBucket('),
    source.indexOf('  runMinMaxAssignment('));
  ok(!/evaluatePawnJob/.test(workCapacitySource),
    'C7-STATIC-WC work capacity has no legacy aggregation call');
  ok(/C5LegacyCompatibility\.evaluateLegacyJobWorkSpeed/.test(workCapacitySource),
    'C7-STATIC-WC numeric work capacity remains explicit compatibility policy');
  ok(!/evaluatePawnJob/.test(temporalCoverageSource),
    'C7-STATIC-TC temporal coverage has no legacy aggregation call');
  ok(!/state\s*!==\s*['"]blocked['"]/.test(temporalCoverageSource)
      && !/state\s*!==\s*['"]unavailable['"]/.test(temporalCoverageSource),
    'C7-STATIC-TC temporal states use explicit participation policy');
  ok(!/primarySkill/.test(passionBucketSource),
    'C7-STATIC-PASSION requested passion projection does not create primarySkill');
  const analyserSource = source.slice(source.indexOf('  analyzeColony('),
    source.indexOf('  calculateLoadoutProtection('));
  ok(!/evaluatePawnJob/.test(analyserSource),
    'C7-STATIC-ANA analyser and best-pawn ranking have no legacy aggregation call');
  ok(/\(realSpeed \* 100\) \+ \(passion \* 25\)/.test(analyserSource),
    'C7-STATIC-ANA frozen ranking formula remains verbatim');
  ok(!/primarySkill|canonicalEffectivenessScore/.test(analyserSource),
    'C7-STATIC-ANA analyser introduces no primary skill or canonical scalar score');

  return { name: 'C7 summary and dashboard consumer parity', total, failures };
};

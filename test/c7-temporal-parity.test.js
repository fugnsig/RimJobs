/** C7 Task 8: temporal coverage, resilience, proposal, and UI-path parity. */
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

  const App = {
    state: {
      shiftTypes: ['Anything', 'Sleep', 'Work', 'Recreation'],
      priorities: {}, customGenes: {}, customJobs: [],
    },
    getXeno() { return { uvSensitivity: 0, genes: [] }; },
    isIncapable(pawn, job) {
      return pawn.downed === true
        || (job.incapBlocks || []).some(tag => (pawn.incapable || []).includes(tag));
    },
  };
  const ctx = loadScripts(['engine.js'], { App, JOBS: [] });
  const Engine = ctx.Engine;
  const doctoring = {
    id: 'doctoring', name: 'Doctor', important: true, incapBlocks: ['caring'],
  };
  const firefight = {
    id: 'firefight', name: 'Firefight', important: true, incapBlocks: ['violence'],
  };
  const jobs = [doctoring, firefight];
  const pawn = (id, overrides) => Object.assign({
    id, name: id, nickname: '', traits: [], incapable: [], xenotype: 'baseline',
    moodPreset: 'normal', downed: false,
  }, overrides || {});
  const awake = () => Array(24).fill(0);
  const sleep = (start, count) => {
    const value = awake();
    for (let offset = 0; offset < count; offset++) value[(start + offset) % 24] = 1;
    return value;
  };
  const contextMap = (pawns, stateFor) => new Map(pawns.map(p => [p.id, {
    permission(job) {
      const state = stateFor(p, job).permission;
      return { state, blockers: state === 'blocked' ? [{}] : [],
        unknowns: state === 'unknown' ? [{}] : [] };
    },
    availability(job) {
      const result = stateFor(p, job);
      return { state: result.availability,
        blockers: result.availability === 'unavailable' ? (result.blockers || [{}]) : [],
        unknowns: result.availability === 'unknown' ? [{}] : [] };
    },
  }]));
  const eligible = () => ({ permission: 'allowed', availability: 'available' });

  {
    const a = pawn('healthy-a');
    const b = pawn('healthy-b');
    const schedules = { [a.id]: awake(), [b.id]: sleep(0, 8) };
    const map = contextMap([a, b], eligible);
    const coverage = Engine.calculateTemporalCoverage([a, b], schedules, doctoring, map);
    equal(coverage.map(hour => hour.count),
      Array(8).fill(1).concat(Array(16).fill(2)),
      'C7-TEMP-001 healthy coverage counts preserve the frozen array');
    equal(coverage.map(hour => hour.status),
      Array(8).fill('fragile').concat(Array(16).fill('healthy')),
      'C7-TEMP-001 healthy coverage statuses preserve the frozen thresholds');
  }

  {
    const allowed = pawn('allowed');
    const downed = pawn('downed', { downed: true });
    const unknown = pawn('unknown');
    const blocked = pawn('blocked');
    const pawns = [allowed, downed, unknown, blocked];
    const schedules = Object.fromEntries(pawns.map(p => [p.id, awake()]));
    const map = contextMap(pawns, p => {
      if (p.id === downed.id) return {
        permission: 'allowed', availability: 'unavailable',
        blockers: [{ scope: 'availability.global', requirementId: 'currentStatus:downed' }],
      };
      if (p.id === unknown.id) return { permission: 'unknown', availability: 'unknown' };
      if (p.id === blocked.id) return { permission: 'blocked', availability: 'available' };
      return eligible();
    });
    const coverage = Engine.calculateTemporalCoverage(pawns, schedules, doctoring, map);
    ok(coverage.every(hour => hour.count === 2),
      'C7-TEMP-002 downed Availability and blocked Permission are excluded');
    ok(coverage.every(hour => hour.capablePawns.some(item => item.id === unknown.id)),
      'C7-TEMP-003 Permission unknown participates as not proven blocked');
    ok(coverage.every(hour => !hour.capablePawns.some(item => item.id === downed.id)),
      'C7-TEMP-002 downed is excluded through Availability, not Permission');
  }

  {
    const mental = pawn('mental-state');
    const currentHediff = pawn('current-hediff');
    const pawns = [mental, currentHediff];
    const schedules = { [mental.id]: awake(), [currentHediff.id]: awake() };
    const map = contextMap(pawns, p => p.id === mental.id ? {
      permission: 'allowed', availability: 'unavailable',
      blockers: [{ scope: 'availability.global', requirementId: 'currentStatus:inMentalState' }],
    } : {
      permission: 'allowed', availability: 'unavailable',
      blockers: [{ scope: 'availability.job', requirementId: 'currentOnly:disableWorkTag:Caring' }],
    });
    const coverage = Engine.calculateTemporalCoverage(pawns, schedules, doctoring, map);
    ok(coverage.every(hour => hour.count === 1
        && hour.capablePawns[0].id === mental.id),
      'C7-TEMP-004 Availability policy preserves C1: mental state included, current work block excluded');
  }

  {
    const gap = Engine.calculateTemporalCoverage([], {}, doctoring, new Map());
    const one = pawn('one');
    const fragile = Engine.calculateTemporalCoverage(
      [one], { [one.id]: awake() }, doctoring, contextMap([one], eligible));
    const two = [pawn('two-a'), pawn('two-b')];
    const healthy = Engine.calculateTemporalCoverage(two,
      Object.fromEntries(two.map(p => [p.id, awake()])), doctoring, contextMap(two, eligible));
    ok(gap.every(hour => hour.count === 0 && hour.status === 'gap'),
      'C7-TEMP-005 zero remains gap');
    ok(fragile.every(hour => hour.count === 1 && hour.status === 'fragile'),
      'C7-TEMP-005 one remains fragile');
    ok(healthy.every(hour => hour.count === 2 && hour.status === 'healthy'),
      'C7-TEMP-005 two remains healthy');
  }

  {
    const violent = pawn('violent', { incapable: ['violence'] });
    const schedules = { [violent.id]: awake() };
    const canonical = contextMap([violent], eligible);
    const coverage = Engine.calculateTemporalCoverage(
      [violent], schedules, firefight, canonical);
    ok(coverage.every(hour => hour.count === 1),
      'C7-TEMP-006 Firefight plus Violent named correction restores Firefight coverage only');
    const doctorCoverage = Engine.calculateTemporalCoverage(
      [violent], schedules, doctoring, canonical);
    ok(doctorCoverage.every(hour => hour.count === 1),
      'C7-TEMP-006 Firefight named fixture does not alter other job coverage');
  }

  const doc = pawn('sole-doc');
  const fighter = pawn('fighter');
  const resiliencePawns = [doc, fighter];
  const resilienceSchedules = { [doc.id]: sleep(0, 8), [fighter.id]: awake() };
  const resilienceContexts = contextMap(resiliencePawns, (p, job) => ({
    permission: p.id === fighter.id && job.id === doctoring.id ? 'blocked' : 'allowed',
    availability: 'available',
  }));

  {
    const original = Engine.evaluateJobPermission;
    Engine.evaluateJobPermission = () => { throw new Error('deprecated permission path'); };
    let result = null;
    try {
      result = Engine.analyzeTemporalResilience(
        resiliencePawns, jobs, resilienceSchedules, resilienceContexts);
    } catch (_) {
      result = null;
    }
    Engine.evaluateJobPermission = original;
    ok(result !== null,
      'C7-TEMP-007 resilience uses the request-scoped coordinator path');
    if (result) {
      const doctorResult = result.jobs.find(item => item.jobId === doctoring.id);
      const fireResult = result.jobs.find(item => item.jobId === firefight.id);
      equal(doctorResult && doctorResult.gapHours, [0,1,2,3,4,5,6,7],
        'C7-TEMP-007 resilience preserves doctor gap hours');
      equal(fireResult && fireResult.fragileHours, [0,1,2,3,4,5,6,7],
        'C7-TEMP-007 resilience preserves Firefight fragile hours');
      ok(result.gaps === 8 && result.fragileHours === 24,
        'C7-TEMP-007 resilience aggregate counts remain frozen');
    } else {
      ok(false, 'C7-TEMP-007 resilience doctor gaps available');
      ok(false, 'C7-TEMP-007 resilience Firefight fragile hours available');
      ok(false, 'C7-TEMP-007 resilience aggregate counts available');
    }
  }

  {
    const a = pawn('proposal-a');
    const b = pawn('proposal-b');
    const pawns = [a, b];
    const schedules = { [a.id]: sleep(0, 8), [b.id]: sleep(0, 8) };
    const map = contextMap(pawns, eligible);
    const resilience = Engine.analyzeTemporalResilience(pawns, jobs, schedules, map);
    const original = Engine.evaluateJobPermission;
    Engine.evaluateJobPermission = () => { throw new Error('deprecated permission path'); };
    let proposals = null;
    try {
      proposals = Engine.proposeTemporalAdjustments(
        pawns, jobs, schedules, resilience, map);
    } catch (_) {
      proposals = null;
    }
    Engine.evaluateJobPermission = original;
    ok(Array.isArray(proposals),
      'C7-TEMP-008 proposals use request-scoped contexts throughout simulations');
    if (proposals) {
      equal(proposals, [
        {
          pawnId: a.id, pawnName: a.name, jobId: doctoring.id, jobName: doctoring.name,
          type: 'gap', gap: { hours: [0,1,2,3] },
          currentSleep: { start: 0, hours: 8 }, proposedSleep: { start: 4, hours: 8 },
          benefit: { gapsRemoved: 4, fragileHoursImproved: 0 },
          costs: { nightOwlPenaltyHours: 0, uvPenaltyHours: 0, sleepShiftHours: 4 },
          createsNewCriticalGap: false, proposedSchedule: sleep(4, 8),
          precondition: { schedule: sleep(0, 8) },
        },
        {
          pawnId: b.id, pawnName: b.name, jobId: doctoring.id, jobName: doctoring.name,
          type: 'gap', gap: { hours: [4,5,6,7] },
          currentSleep: { start: 0, hours: 8 }, proposedSleep: { start: 20, hours: 8 },
          benefit: { gapsRemoved: 4, fragileHoursImproved: 0 },
          costs: { nightOwlPenaltyHours: 0, uvPenaltyHours: 0, sleepShiftHours: 4 },
          createsNewCriticalGap: false, proposedSchedule: sleep(20, 8),
          precondition: { schedule: sleep(0, 8) },
        },
      ], 'C7-TEMP-008 complete proposal output and ordering remain frozen');
      ok(proposals.every(item => item.createsNewCriticalGap === false),
        'C7-TEMP-009 proposal no-regression guard remains intact');
      ok(proposals.every(item => item.precondition
          && item.precondition.schedule.length === 24),
        'C7-TEMP-010 every proposal retains a full stale-state precondition');
    } else {
      ok(false, 'C7-TEMP-008 proposal ordering available');
      ok(false, 'C7-TEMP-009 proposal no-regression result available');
      ok(false, 'C7-TEMP-010 proposal preconditions available');
    }
  }

  {
    const inferred = pawn('inferred');
    const map = contextMap([inferred], eligible);
    const resilience = Engine.analyzeTemporalResilience([inferred], jobs, {}, map);
    const proposals = Engine.proposeTemporalAdjustments(
      [inferred], jobs, {}, resilience, map);
    ok(proposals.length === 0,
      'C7-TEMP-011 inferred-schedule pawns remain excluded from proposals');
  }

  {
    const proposal = { precondition: { schedule: awake() } };
    const stale = awake();
    stale[3] = 1;
    ok(Engine.verifyProposalPrecondition(proposal, awake()) === true,
      'C7-TEMP-012 unchanged proposal precondition remains valid');
    ok(Engine.verifyProposalPrecondition(proposal, stale) === false,
      'C7-TEMP-012 stale proposal precondition remains rejected');
  }

  {
    const sentinelMap = new Map([['ui-pawn', {}]]);
    let mapBuilds = 0, analyzedMap = null, proposedMap = null;
    const uiPawn = pawn('ui-pawn', { schedule: sleep(0, 8) });
    const UIApp = {
      state: { pawns: [uiPawn], shiftTypes: App.state.shiftTypes },
      _c7EvidenceOptionsByPawn: new Map([['ui-pawn', { temporalCoverage: { marker: true } }]]),
      _c7PawnContextMap(pawns, evidence) {
        mapBuilds++;
        ok(pawns === this.state.pawns && evidence === this._c7EvidenceOptionsByPawn,
          'C7-TEMP-013 UI forwards actual provider evidence options');
        return sentinelMap;
      },
      toast() {}, triggerAutoSave() {}, renderSchedule() {},
    };
    const UIEngine = {
      analyzeTemporalResilience(pawns, jobValues, schedules, map) {
        analyzedMap = map;
        return { jobs: [{ jobId: 'doctoring', jobName: 'Doctor', coverage: [
          { capablePawns: [], count: 0, status: 'gap' },
        ], gapHours: [0], fragileHours: [], healthyHours: 23 }],
        gaps: 1, fragileHours: 0 };
      },
      proposeTemporalAdjustments(pawns, jobValues, schedules, resilience, map) {
        proposedMap = map;
        return [];
      },
      verifyProposalPrecondition: Engine.verifyProposalPrecondition.bind(Engine),
    };
    loadScripts(['app-schedule.js'], {
      App: UIApp, Engine: UIEngine, JOBS: jobs, _escapeHtml: value => String(value),
      document: { getElementById() { return null; } },
    });
    UIApp._schedResilienceHTML();
    ok(mapBuilds === 1 && analyzedMap === sentinelMap && proposedMap === sentinelMap,
      'C7-TEMP-013 resilience and proposals reuse one request-scoped context map');
  }

  {
    let saves = 0, renders = 0;
    const first = pawn('apply-first', { schedule: awake() });
    const second = pawn('apply-second', { schedule: awake() });
    const UIApp = {
      state: { pawns: [first, second], shiftTypes: App.state.shiftTypes },
      toast() {}, triggerAutoSave() { saves++; }, renderSchedule() { renders++; },
    };
    loadScripts(['app-schedule.js'], {
      App: UIApp, Engine, JOBS: jobs, _escapeHtml: value => String(value),
      document: { getElementById() { return null; } },
    });
    UIApp.renderSchedule = () => { renders++; };
    const changed = sleep(4, 8);
    UIApp._schedProposals = [
      { pawnId: first.id, precondition: { schedule: awake() }, proposedSchedule: changed,
        proposedSleep: { start: 4, hours: 8 }, pawnName: first.name },
      { pawnId: second.id, precondition: { schedule: awake() }, proposedSchedule: changed,
        proposedSleep: { start: 4, hours: 8 }, pawnName: second.name },
    ];
    UIApp._applyProposal(0);
    equal(first.schedule, changed,
      'C7-TEMP-014 proposal application changes the selected pawn');
    equal(second.schedule, awake(),
      'C7-TEMP-014 proposal application remains one-at-a-time');
    ok(UIApp._schedProposals === null && saves === 1 && renders === 1,
      'C7-TEMP-014 application clears stale siblings and performs one save/render');

    UIApp._schedProposals = [{ pawnId: first.id, precondition: { schedule: awake() },
      proposedSchedule: awake(), proposedSleep: { start: 0, hours: 0 }, pawnName: first.name }];
    const beforeStale = first.schedule.slice();
    UIApp._applyProposal(0);
    equal(first.schedule, beforeStale,
      'C7-TEMP-015 stale UI proposal is rejected without mutation');
    ok(saves === 1 && renders === 2,
      'C7-TEMP-015 stale rejection recomputes without saving');
  }

  const engineSource = fs.readFileSync(path.join(__dirname, '..', 'files', 'engine.js'), 'utf8');
  const temporalStart = engineSource.indexOf('  calculateTemporalCoverage(');
  const temporalEnd = engineSource.indexOf('  calculateWorkSpeedMod(', temporalStart);
  const temporalSource = temporalStart >= 0 && temporalEnd >= 0
    ? engineSource.slice(temporalStart, temporalEnd) : '';
  ok(!/evaluatePawnJob\s*\(|evaluateJobPermission\s*\(/.test(temporalSource),
    'C7-TEMP-016 temporal consumers contain no deprecated evaluator calls');

  const pawnSource = fs.readFileSync(path.join(__dirname, '..', 'files', 'app-pawns.js'), 'utf8');
  const presetStart = pawnSource.indexOf('  setPawnMoodPreset(');
  const presetEnd = pawnSource.indexOf('\n  },', presetStart);
  const presetSource = presetStart >= 0 && presetEnd >= 0
    ? pawnSource.slice(presetStart, presetEnd) : '';
  ok(/_c7PawnContextMap\s*\([\s\S]*?_c7EvidenceOptionsByPawn/.test(presetSource)
      && /optimizeSchedules\s*\(\s*\[p\]\s*,\s*\{\s*contextMap\s*\}\s*\)/.test(presetSource),
    'C7-TEMP-017 per-pawn schedule reset uses provider-derived request context');
  ok(!/completeness\s*:\s*['"]complete['"]/.test(presetSource),
    'C7-TEMP-017 per-pawn schedule reset never fabricates temporal completeness');

  return { name: 'C7 temporal coverage and resilience parity', total, failures };
};

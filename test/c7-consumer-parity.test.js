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

  const App = {
    state: { customJobs: [] },
    getTrait() { return null; },
    getIdeoEffects() { return {}; },
  };
  const ctx = loadScripts(['data.js', 'engine.js'], { App });
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

  const source = fs.readFileSync(path.join(__dirname, '..', 'files', 'engine.js'), 'utf8');
  const viabilitySource = source.slice(source.indexOf('  calculateViability('),
    source.indexOf('  getBottlenecks('));
  const bottleneckSource = source.slice(source.indexOf('  getBottlenecks('),
    source.indexOf('  _c7IsEligible('));
  ok(!/evaluateJobPermission/.test(viabilitySource),
    'C7-STATIC-VIA viability has no direct legacy Permission call');
  ok(!/evaluateJobPermission/.test(bottleneckSource),
    'C7-STATIC-BOT bottlenecks have no direct legacy Permission call');

  return { name: 'C7 summary and dashboard consumer parity', total, failures };
};

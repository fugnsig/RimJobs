/** C7 Task 6: auto-assign full-matrix parity and named C4 deltas. */
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

  const roles = {
    none: { skillMods: {} },
    miner: { skillMods: { mining: 2 } },
  };
  const xenos = {
    baseline: { skillMods: {}, genes: [] },
    mining: { skillMods: { mining: 2 }, genes: ['mining_gene'] },
  };
  const traits = {
    fast: { learningRate: 0.5 },
  };
  const genes = {
    mining_gene: { skillMods: { mining: 1 } },
  };
  const App = {
    state: { customJobs: [], customGenes: {}, precepts: {} },
    effectiveSkill(pawn, skillId) {
      return Number((pawn.skills || {})[skillId]) || 0;
    },
    _passionValue(pawn, skillId) {
      return (pawn.passions || {})[skillId] || 0;
    },
    _passionMeta(raw) { return { bucket: Number(raw) || 0 }; },
    getRole(roleId) { return roles[roleId] || roles.none; },
    getXeno(xenoId) { return xenos[xenoId] || xenos.baseline; },
    getTrait(traitId) { return traits[traitId] || null; },
    _resolveGeneDef(geneId) { return genes[geneId] || null; },
    getIdeoEffects() { return {}; },
    isIncapable(pawn, job) {
      return (pawn.legacyBlocked || []).includes(job.id);
    },
  };
  const ctx = loadScripts(['data.js', 'engine.js'], { App });
  const Engine = ctx.Engine;
  let legacyAggregateCalls = 0;
  Engine.calculateRealWorkSpeed = (pawn, job) =>
    (pawn.speeds && Number.isFinite(pawn.speeds[job.id])) ? pawn.speeds[job.id] : 1;
  Engine.evaluatePawnJob = (pawn, job) => {
    legacyAggregateCalls++;
    const hasSkill = !!job.skill;
    return {
      permission: { status: App.isIncapable(pawn, job) ? 'blocked' : 'allowed' },
      skill: {
        applicable: hasSkill,
        level: hasSkill ? App.effectiveSkill(pawn, job.skill) : null,
        passion: hasSkill ? Engine.passionBucket(pawn, job.skill) : null,
      },
      work: { speed: Engine.calculateRealWorkSpeed(pawn, job) },
    };
  };

  const pawn = (id, overrides) => Object.assign({
    id, role: 'none', xenotype: 'baseline', traits: [], moodPreset: 'normal',
    skills: {}, passions: {}, speeds: {}, legacyBlocked: [],
  }, overrides || {});
  const job = (id, overrides) => Object.assign({
    id, name: id, cat: 'labor', filter: 'labor', important: false,
  }, overrides || {});
  const matrix = (pawns, jobs, priorities) => Object.fromEntries(pawns.map(p => [
    p.id, Object.fromEntries(jobs.map(j => [j.id,
      priorities[p.id] && priorities[p.id][j.id] != null
        ? priorities[p.id][j.id] : null])),
  ]));
  const states = (pawns, permissionFor, availabilityFor) => new Map(pawns.map(p => [p.id, {
    permission(j) { return { state: permissionFor(p, j) }; },
    availability(j) { return { state: availabilityFor(p, j) }; },
  }]));
  const allEligible = pawns => states(pawns, () => 'allowed', () => 'available');
  const assign = (pawns, jobs, contextMap, seed) => {
    const priorities = JSON.parse(JSON.stringify(seed || {}));
    Engine.runMinMaxAssignment(pawns, [], priorities, jobs, contextMap);
    return { priorities, matrix: matrix(pawns, jobs, priorities) };
  };

  const standardJobs = [
    job('firefight', { cat: 'emergency', important: true }),
    job('mining', { skill: 'mining', speedFormula: {}, important: true }),
    job('doctoring', { skill: 'medicine', speedFormula: {}, important: true }),
    job('hauling'),
    job('cleaning'),
    job('crafting', { skill: 'crafting', cat: 'crafting' }),
  ];
  const standardPawns = [
    pawn('Ada', { role: 'miner', skills: { mining: 16, medicine: 2 },
      speeds: { mining: 1.6, doctoring: 0.3 } }),
    pawn('Bea', { xenotype: 'mining', traits: ['fast'],
      skills: { mining: 10, medicine: 9, crafting: 4 },
      passions: { mining: 2, medicine: 1, crafting: 1 },
      speeds: { mining: 1, doctoring: 0.9 } }),
    pawn('Cy', { moodPreset: 'panic', skills: { medicine: 15 },
      speeds: { mining: 0.7, doctoring: 1.6 } }),
    pawn('Dee', { moodPreset: 'chill', skills: { crafting: 8 },
      speeds: { mining: 0.5, doctoring: 0.2, crafting: 0.9 } }),
    pawn('Eli', { speeds: { mining: 0.3, doctoring: 0.2 } }),
  ];
  const standardExpected = {
    Ada: { firefight: 1, mining: 1, doctoring: null, hauling: 4, cleaning: 4, crafting: null },
    Bea: { firefight: 1, mining: 1, doctoring: 2, hauling: 4, cleaning: 4, crafting: 2 },
    Cy:  { firefight: 1, mining: null, doctoring: null, hauling: null, cleaning: null, crafting: null },
    Dee: { firefight: 1, mining: 3, doctoring: null, hauling: 4, cleaning: 4, crafting: 2 },
    Eli: { firefight: 1, mining: null, doctoring: null, hauling: 4, cleaning: 4, crafting: null },
  };
  const standard = assign(standardPawns, standardJobs, allEligible(standardPawns));
  equal(standard.matrix, standardExpected,
    'C7-RANK-001 standard five-pawn full matrix matches frozen C1 policy');
  ok(standard.matrix.Cy.firefight === 1 && standard.matrix.Cy.mining === null,
    'C7-RANK-001 emergency override and panic non-emergency rule are preserved');
  ok(standard.matrix.Dee.hauling === 4 && standard.matrix.Dee.crafting === 2,
    'C7-RANK-001 chill penalty does not replace threshold policy');
  ok(standard.matrix.Ada.mining === 1 && standard.matrix.Bea.mining === 1,
    'C7-RANK-001 role, xenotype, gene, passion and threshold inputs remain frozen');

  const delta = (code, target, p, targetOverrides, expectedPriority) => {
    const control = job('control');
    const targetJob = job(target, targetOverrides);
    const jobs = [targetJob, control];
    const legacyMap = states([p], (_pawn, j) => j.id === target ? 'blocked' : 'allowed', () => 'available');
    const canonicalMap = allEligible([p]);
    const legacy = assign([p], jobs, legacyMap).matrix;
    const canonical = assign([p], jobs, canonicalMap).matrix;
    equal(legacy, { [p.id]: { [target]: null, control: 3 } },
      code + ' legacy causal matrix is frozen');
    equal(canonical, { [p.id]: { [target]: expectedPriority, control: 3 } },
      code + ' canonical causal matrix has the exact approved output');
    const changed = jobs.filter(j => legacy[p.id][j.id] !== canonical[p.id][j.id])
      .map(j => `${p.id}.${j.id}`);
    equal(changed, [`${p.id}.${target}`],
      code + ' changes only the named target cell');
  };
  delta('C7-RANK-002 Firefight+Violent', 'firefight',
    pawn('violent', { legacyBlocked: ['firefight'] }), { cat: 'emergency' }, 1);
  delta('C7-RANK-003 Human Fishing age', 'fishing',
    pawn('child', { legacyBlocked: ['fishing'], skills: { animals: 8 } }),
    { skill: 'animals' }, 2);
  delta('C7-RANK-004 Hauling+zero Manipulation', 'hauling',
    pawn('no-arms', { legacyBlocked: ['hauling'] }), {}, 3);

  {
    const p = pawn('downed');
    const jobs = [job('hauling'), job('firefight')];
    const map = states([p], () => 'allowed', () => 'unavailable');
    equal(assign([p], jobs, map).matrix,
      { downed: { hauling: null, firefight: null } },
      'C7-RANK-005 current-unavailable/downed pawn is excluded from every cell');
  }
  {
    const p = pawn('unknown');
    const jobs = [job('hauling'), job('firefight')];
    const map = states([p], () => 'unknown', () => 'unknown');
    equal(assign([p], jobs, map).matrix,
      { unknown: { hauling: 3, firefight: 1 } },
      'C7-RANK-006 Permission and Availability unknown participate under parity policy');
  }
  {
    const p = pawn('skillless', { skills: { mining: 20 }, passions: { mining: 2 } });
    const jobs = [job('hauling')];
    equal(assign([p], jobs, allEligible([p])).matrix,
      { skillless: { hauling: 3 } },
      'C7-RANK-007 skillless job never receives a fallback skill');
  }
  {
    const pawns = [pawn('panic', { moodPreset: 'panic' }), pawn('normal')];
    const jobs = [job('hauling'), job('firefight')];
    equal(assign(pawns, jobs, allEligible(pawns)).matrix, {
      panic: { hauling: null, firefight: 1 },
      normal: { hauling: 3, firefight: 1 },
    }, 'C7-RANK-008 panic and emergency/P1 behaviour remain frozen');
  }
  {
    const pawns = ['first', 'second', 'third', 'fourth'].map(id => pawn(id));
    const jobs = [job('unskilled_custom')];
    equal(assign(pawns, jobs, allEligible(pawns)).matrix, {
      first: { unskilled_custom: 4 }, second: { unskilled_custom: null },
      third: { unskilled_custom: null }, fourth: { unskilled_custom: null },
    }, 'C7-RANK-009 stable input order breaks exact-score ties');
  }
  {
    const first = assign(standardPawns, standardJobs, allEligible(standardPawns));
    const second = assign(standardPawns, standardJobs, allEligible(standardPawns), first.priorities);
    equal(second.matrix, first.matrix,
      'C7-RANK-010 second auto-assign run is idempotent across the full matrix');
  }

  const engineSource = fs.readFileSync(path.join(__dirname, '..', 'files', 'engine.js'), 'utf8');
  const assignmentSource = engineSource.slice(
    engineSource.indexOf('runMinMaxAssignment('), engineSource.indexOf('\n  /**', engineSource.indexOf('runMinMaxAssignment(')));
  ok(!/evaluatePawnJob\s*\(/.test(assignmentSource),
    'C7-RANK-011 runMinMaxAssignment has no legacy aggregate call');
  ok(!/primarySkill|effectivenessScore/.test(assignmentSource),
    'C7-RANK-012 auto-assign introduces no primary skill or canonical scalar score');
  ok(/realSpeed\s*\*\s*100/.test(assignmentSource) && /passion\s*\*\s*25/.test(assignmentSource),
    'C7-RANK-013 frozen speed and passion scoring coefficients remain explicit');

  const productionSources = ['app-priorities.js', 'app-pawns.js'].map(name =>
    fs.readFileSync(path.join(__dirname, '..', 'files', name), 'utf8')).join('\n');
  const assignmentCalls = productionSources.match(/runMinMaxAssignment\s*\([^;]+\)/g) || [];
  ok(assignmentCalls.length === 2,
    'C7-RANK-014 both production auto-assign entry points are covered');
  ok(assignmentCalls.every(call => /contextMap/.test(call)),
    'C7-RANK-015 both production entry points forward request-scoped context maps');
  ok(legacyAggregateCalls === 0,
    'C7-RANK-016 no auto-assign path calls the legacy evaluatePawnJob aggregate');

  return { name: 'C7 auto-assign ranking parity', total, failures };
};

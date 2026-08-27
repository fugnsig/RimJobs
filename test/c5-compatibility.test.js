/** C5 Task 13: exact C1 delegation and named shadow differences. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadScripts } = require('./_harness');
const audit = require('./fixtures/c5-runtime-audit-1.6.4871.json');

module.exports = function run() {
  let total = 0, failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) { failures++; console.log('  FAIL ' + label); }
  };

  // Exact wrapper calls first use spies so argument and return identity are visible.
  {
    const calls = [];
    const skillResult = { exact: 'skill' }, speedResult = { exact: 'speed' };
    const App = {
      effectiveSkill(pawn, skillId) { calls.push(['skill', pawn, skillId]); return skillResult; },
      _passionValue(pawn, skillId) { calls.push(['passionValue', pawn, skillId]); return 'Major'; },
      _passionMeta(value) { calls.push(['passionMeta', value]); return { bucket: 2 }; },
    };
    const Engine = {
      calculateWorkSpeedMod(pawn) { calls.push(['global', pawn]); return 1.25; },
      calculateRealWorkSpeed(pawn, job) { calls.push(['job', pawn, job]); return speedResult; },
    };
    const compat = loadScripts(['c5-legacy-compatibility.js'], { App, Engine })
      .C5LegacyCompatibility;
    const pawn = { id: 'spy' }, job = { id: 'mining' };
    ok(compat.evaluateLegacySkill(pawn, 'mine') === skillResult
      && calls[0][1] === pawn && calls[0][2] === 'mine',
    'C5-CC-001 skill wrapper delegates exact arguments and return identity');
    ok(compat.evaluateLegacyGlobalWorkSpeed(pawn) === 1.25
      && compat.evaluateLegacyJobWorkSpeed(pawn, job) === speedResult,
    'C5-CC-002 global and job speed wrappers delegate unchanged');
    const passion = compat.evaluateLegacyPassion(pawn, 'mine');
    ok(passion.rawIdentity === 'Major' && passion.metadata.bucket === 2
      && calls.some(call => call[0] === 'passionMeta' && call[1] === 'Major'),
    'C5-CC-003 passion wrapper delegates raw identity before metadata');
  }

  // Exercise wrappers against the real frozen C1 surfaces on a baseline pawn.
  const App = {
    state: { customXenotypes: {}, customTraits: {}, customGenes: {}, customJobs: [],
      customBackstories: {}, hediffCatalog: [], precepts: {}, passionCatalog: [],
      ideology: { memes: [], precepts: {} }, prostheticEfficiency: {} },
    getXeno() { return { genes: [], skillMods: {}, incapable: [] }; },
    getTrait() { return null; },
    getRole() { return { id: 'none', skillMods: {}, workSpeed: 0, incap: [] }; },
    getIdeoEffects() { return {}; },
  };
  const ctx = loadScripts(['data.js', 'engine.js', 'app-pawns.js',
    'c5-legacy-compatibility.js'], {
    App, document: { getElementById: () => null, querySelector: () => null,
      querySelectorAll: () => [] }, window: {},
    localStorage: { getItem: () => null, setItem: () => {} },
  });
  vm.runInContext('globalThis._PX = PRESET_XENOTYPES; globalThis._DR = DEFAULT_ROLES; globalThis._TR = TRAITS', ctx);
  App.getXeno = function getXeno(id) {
    return { ...ctx._PX, ...this.state.customXenotypes }[id] || ctx._PX.baseliner;
  };
  App.getTrait = function getTrait(id) { return ctx._TR.find(item => item.id === id); };
  App.getRole = function getRole(id) {
    return ctx._DR.find(item => item.id === id) || ctx._DR[0];
  };
  const compat = ctx.C5LegacyCompatibility;
  const pawn = { id: 'baseline', traits: [], xenotype: null, skills: { mine: 8 },
    passionDefs: { mine: 'Major' }, passions: { mine: 2 }, childhood: null,
    adulthood: null, role: 'none', health: [] };
  const mining = ctx.JOBS.find(job => job.id === 'mining');
  ok(compat.evaluateLegacySkill(pawn, 'mine') === App.effectiveSkill(pawn, 'mine')
    && compat.evaluateLegacySkill(pawn, 'mine') === 8,
  'C5-CC-004 real C1 skill value is delegated exactly');
  ok(compat.evaluateLegacyGlobalWorkSpeed(pawn) === ctx.Engine.calculateWorkSpeedMod(pawn)
    && compat.evaluateLegacyGlobalWorkSpeed(pawn) === 1,
  'C5-CC-005 real C1 global speed is delegated exactly');
  ok(compat.evaluateLegacyJobWorkSpeed(pawn, mining)
    === ctx.Engine.calculateRealWorkSpeed(pawn, mining)
    && compat.evaluateLegacyJobWorkSpeed(pawn, mining) === 1,
  'C5-CC-006 real C1 mining approximation is delegated exactly');
  ok(compat.evaluateLegacyPassion(pawn, 'mine').metadata.bucket === 2,
    'C5-CC-007 real C1 vanilla passion metadata is delegated exactly');

  // Every reviewed difference is retained by exact name and never treated as failure.
  {
    const expected = audit.namedShadowDeltas.slice().sort();
    ok(compat.namedDeltaCodes.slice().sort().join(',') === expected.join(','),
      'C5-CC-008 adapter exposes the complete reviewed named-difference catalogue');
    for (const deltaCode of audit.namedShadowDeltas) {
      const canonical = deltaCode === 'unknownDefinition'
        ? { state: 'unknown', value: null } : { state: 'resolved', value: 2 };
      const legacy = deltaCode === 'unknownDefinition' ? 0 : 1;
      const result = compat.compare({ caseId: deltaCode, dimension: 'fixture',
        canonical, canonicalValue: canonical.value, legacy, legacyValue: legacy,
        deltaCode });
      ok(result.deltaCode === deltaCode && result.same === false
        && result.compatibilityOnly === true && Object.isFrozen(result),
      'C5-CC-DELTA-' + deltaCode + ' remains an explicit shadow result');
      if (deltaCode === 'unknownDefinition') {
        ok(result.canonical.state === 'unknown' && result.legacy === 0,
          'C5-CC-009 canonical unknown remains unknown beside legacy zero');
      }
    }
    const parity = compat.compare({ caseId: 'parity', dimension: 'skill',
      canonical: { value: 8 }, canonicalValue: 8, legacy: 8, legacyValue: 8 });
    ok(parity.same && parity.deltaCode === 'parity',
      'C5-CC-010 exact parity is distinct from named accepted differences');
  }

  ok(audit.legacySpeedFormulas.length === 11
    && audit.legacySpeedFormulas.every(item =>
      ['legacyApproximation', 'unsupportedUnknown'].includes(item.classification)),
  'C5-CC-011 all eleven C1 formulas remain compatibility-only audit records');

  const canonicalFiles = ['effectiveness-registry.js', 'c5-evaluation-context.js',
    'structural-skill-resolver.js', 'structural-passion-resolver.js',
    'structural-stat-resolver.js', 'structural-learning-resolver.js',
    'structural-effectiveness-resolver.js'];
  const canonicalSource = canonicalFiles.map(file => fs.readFileSync(
    path.join(__dirname, '..', 'files', file), 'utf8')).join('\n');
  ok(!/effectiveSkill|calculateWorkSpeedMod|calculateRealWorkSpeed|_passion(Value|Meta)/.test(canonicalSource),
    'C5-CC-012 canonical C5 modules contain no legacy function reference');
  ok(!/C5LegacyCompatibility/.test(canonicalSource),
    'C5-CC-013 canonical C5 modules never import the shadow adapter');

  return { name: 'C5 legacy effectiveness shadow', total, failures };
};

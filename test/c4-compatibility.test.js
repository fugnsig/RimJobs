/** C4 exact legacy projection and canonical shadow-parity tests. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { loadScripts } = require('./_harness');

module.exports = function run() {
  let total = 0;
  let failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) { failures++; console.log('  FAIL ' + label); }
  };
  const same = (actual, expected, label) => {
    total++;
    try {
      assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected);
    } catch (error) {
      failures++;
      console.log('  FAIL ' + label + ': ' + error.message);
    }
  };

  const App = {
    state: {
      customXenotypes: {}, customTraits: {}, customGenes: {}, customJobs: [],
      customBackstories: {}, hediffCatalog: [], precepts: {},
      ideology: { memes: [], precepts: {} }, prostheticEfficiency: {}, priorities: {},
    },
    getXeno() { return { genes: [], skillMods: {}, incapable: [] }; },
    getTrait() { return null; },
    getRole() { return { id: 'none', skillMods: {}, workSpeed: 0, incap: [] }; },
    getIdeoEffects() { return {}; },
    _passionMeta() { return { bucket: 0 }; },
    _passionValue() { return 0; },
  };
  const ctx = loadScripts([
    'data.js', 'requirement-registry.js', 'permission-resolver.js',
    'availability-resolver.js', 'engine.js', 'app-pawns.js',
    'c4-legacy-compatibility.js',
  ], {
    App,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    window: {}, localStorage: { getItem: () => null, setItem: () => {} },
  });
  vm.runInContext([
    'globalThis._PX = PRESET_XENOTYPES',
    'globalThis._DR = DEFAULT_ROLES',
    'globalThis._TR = TRAITS',
  ].join(';'), ctx);
  App.getXeno = function getXeno(id) {
    const all = { ...ctx._PX, ...(this.state.customXenotypes || {}) };
    return all[id] || ctx._PX.baseliner;
  };
  App.getTrait = function getTrait(id) {
    return [...ctx._TR, ...Object.entries(this.state.customTraits || {})
      .map(([key, value]) => ({ ...value, id: key }))].find(item => item.id === id);
  };
  App.getRole = function getRole(id) {
    return ctx._DR.find(item => item.id === id) || ctx._DR[0];
  };

  const compat = ctx.C4LegacyCompatibility;
  const permissionResolver = ctx.PermissionResolver;
  const availabilityResolver = ctx.AvailabilityResolver;
  const fixture = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'fixtures', 'c4-runtime-audit-1.6.4871.json'), 'utf8'));
  const jobs = ctx.JOBS;
  const provenance = { modId: 'fixture.active', sources: [{ file: 'audit.xml' }] };
  const mkPawn = (id, over) => Object.assign({
    id, name: id, traits: [], xenotype: null, incapable: [], skills: {},
    schedule: Array(24).fill(0), moodPreset: 'normal', health: [],
    childhood: null, adulthood: null, role: 'none', bioAge: 20,
  }, over || {});
  const statusFact = (statusId, value) => ({ statusId, state: 'known', value, evidence: [] });
  const healthyStatus = () => ({
    downed: statusFact('downed', false),
    inMentalState: statusFact('inMentalState', false),
    mentalBreak: statusFact('mentalBreak', false),
    deactivated: statusFact('deactivated', false),
    unconscious: statusFact('unconscious', false),
    canBeAwake: statusFact('canBeAwake', true),
  });
  const freePath = id => ({
    pathId: 'workGiver:' + id, sourceWorkGiverDefs: [id], completeness: 'complete',
    completenessReasons: [], allOf: [], provenance,
  });
  const capacityRequirement = name => ({
    requirementId: 'capacity:' + name, kind: 'capacity', capacityDefName: name,
    completeness: 'complete', completenessReasons: [],
    comparison: {
      operator: 'gt', thresholdSource: { kind: 'capacityDefField', field: 'minForCapable', value: 0 },
    },
    notApplicable: 'blocked', provenance,
  });
  const policy = (jobId, workTypeDefName, workTags, paths) => ({
    jobId, state: 'definitionBacked', completeness: 'complete', completenessReasons: [],
    workTypeDefName, sourceWorkTypes: [workTypeDefName], provenance,
    permission: {
      workTags: { completeness: 'complete', values: workTags || [], provenance },
      age: { state: 'definitionDriven', provenance },
    },
    execution: { completeness: 'complete', mode: 'anyPath', paths: paths || [freePath('Free')] },
    availability: {},
  });
  const unknownPolicy = jobId => ({
    jobId, state: 'unknown', completeness: 'unknown', completenessReasons: ['unverifiedAppJob'],
    workTypeDefName: null, sourceWorkTypes: [], provenance,
    permission: { workTags: { completeness: 'unknown', values: [], provenance } },
    execution: { completeness: 'unknown', mode: 'anyPath', paths: [] }, availability: {},
  });
  const snapshot = jobPolicy => ({
    jobPolicies: { [jobPolicy.jobId]: jobPolicy },
    raceWorkPolicies: {
      Human: {
        raceDefName: 'Human',
        entries: Object.fromEntries(Object.entries(fixture.raceWorkPolicies.Human.entries)
          .filter(([, entry]) => entry.state === 'knownGate')
          .map(([workType, entry]) => [workType, entry.minAge])),
        entryCompleteness: Object.fromEntries(Object.entries(fixture.raceWorkPolicies.Human.entries)
          .filter(([, entry]) => entry.state === 'knownGate')
          .map(([workType]) => [workType, 'complete'])),
        entryCompletenessReasons: {}, catalogueCompleteness: 'complete',
        catalogueCompletenessReasons: [], provenance,
      },
    },
  });
  const context = (jobPolicy, over) => Object.assign({
    pawnId: 'canonical-pawn', definitionSnapshot: snapshot(jobPolicy),
    evidence: {
      effects: [], bodyEvidence: [], unresolvedSources: [],
      pawnState: { raceDefName: 'Human', age: 20 },
    },
    capacities: { capacities: {} }, statusFacts: healthyStatus(),
  }, over || {});
  const resolvePair = value => ({
    permission: permissionResolver.resolve(value, Object.keys(value.definitionSnapshot.jobPolicies)[0]),
    availability: availabilityResolver.resolve(value, Object.keys(value.definitionSnapshot.jobPolicies)[0]),
  });

  // Exact delegation, including the complete legacy object shape and boolean.
  {
    const mining = jobs.find(job => job.id === 'mining');
    const pawn = mkPawn('legacy-baseline');
    same(compat.evaluateLegacyPermission(pawn, mining),
      { status: 'allowed', hardBlocks: [], uncertainties: [] },
      'CC-001 exact allowed legacy Permission shape');
    ok(compat.evaluateLegacyIncapable(pawn, mining) === false,
      'CC-002 exact allowed legacy incapable boolean');
    const downed = mkPawn('legacy-downed', { downed: true });
    same(compat.evaluateLegacyPermission(downed, mining), {
      status: 'blocked',
      hardBlocks: [{ source: 'status', id: 'downed', reason: 'Incapacitated in bed' }],
      uncertainties: [],
    }, 'CC-003 exact early-downed legacy Permission shape');
    ok(compat.evaluateLegacyIncapable(downed, mining) === true,
      'CC-004 exact downed legacy incapable boolean');
  }

  // Every current legacy incapBlocks row/token is frozen and contrasted with the
  // audited canonical job partition without interpreting its raw token.
  {
    const direct = new Map(fixture.directJobs.map(item => [item.jobId, item]));
    const unknown = new Set(fixture.unknownAppJobs.map(item => item.jobId));
    let rowCount = 0;
    for (const job of jobs.filter(item => Array.isArray(item.incapBlocks))) {
      ok(direct.has(job.id) || unknown.has(job.id),
        'CC-INCAP-' + job.id + ' audited canonical partition exists');
      for (const token of job.incapBlocks) {
        rowCount++;
        const pawn = mkPawn('legacy-' + job.id + '-' + token, { incapable: [token] });
        const legacyPermission = compat.evaluateLegacyPermission(pawn, job);
        same(legacyPermission, {
          status: 'blocked',
          hardBlocks: [{
            source: 'backstory/manual', sourceId: null, id: token,
            reason: 'Work tag "' + token + '" disabled by backstory/manual',
          }],
          uncertainties: [],
        }, 'CC-INCAP-' + job.id + '-' + token + ' exact legacy result');
        ok(compat.evaluateLegacyIncapable(pawn, job) === true,
          'CC-INCAP-' + job.id + '-' + token + ' exact legacy boolean');

        const directJob = direct.get(job.id);
        const canonicalPolicy = directJob
          ? policy(job.id, directJob.workType, directJob.workTags)
          : unknownPolicy(job.id);
        const canonical = permissionResolver.resolve(context(canonicalPolicy), job.id);
        ok(canonical.state === (directJob ? 'allowed' : 'unknown'),
          'CC-INCAP-' + job.id + '-' + token + ' raw legacy token is not canonical truth');
      }
    }
    ok(rowCount > 0, 'CC-005 incapBlocks shadow matrix is non-empty and data-driven');
  }

  // Firefight: canonical Firefighter tags do not treat raw legacy violence as a tag.
  {
    const job = jobs.find(item => item.id === 'firefight');
    const pawn = mkPawn('firefight-violent', { incapable: ['violence'] });
    const p = policy('firefight', 'Firefighter', ['Firefighting', 'Commoner', 'AllWork']);
    const canonical = resolvePair(context(p));
    const legacy = {
      permission: compat.evaluateLegacyPermission(pawn, job),
      incapable: compat.evaluateLegacyIncapable(pawn, job),
    };
    ok(canonical.permission.state === 'allowed' && canonical.availability.state === 'available',
      'CC-006 Firefight canonical WorkTags are independently allowed');
    const comparison = compat.compare({ caseId: 'firefight-violent', ...canonical, legacy });
    ok(comparison.deltaCode === 'legacyBlockedCanonicalNotBlocked' && !comparison.sameIncapable,
      'CC-007 Firefight Violent mismatch is named shadow-only');
  }

  // Fishing: Human definitions contain no age gate, while legacy app policy uses 7.
  {
    const job = jobs.find(item => item.id === 'fishing');
    const pawn = mkPawn('fishing-age-six', { bioAge: 6 });
    const p = policy('fishing', 'Fishing', ['Animals', 'Commoner', 'AllWork']);
    const c = context(p);
    c.evidence.pawnState.age = 6;
    const canonical = resolvePair(c);
    const legacy = {
      permission: compat.evaluateLegacyPermission(pawn, job),
      incapable: compat.evaluateLegacyIncapable(pawn, job),
    };
    ok(canonical.permission.state === 'allowed',
      'CC-008 Fishing canonical Human no-age-gate is independently allowed');
    ok(compat.compare({ caseId: 'human-fishing-age', ...canonical, legacy }).deltaCode
      === 'legacyBlockedCanonicalNotBlocked',
    'CC-009 Fishing legacy age assumption remains a named shadow delta');
  }

  // Hauling: the verified Anomaly giver is a zero-capacity OR alternative.
  {
    const job = jobs.find(item => item.id === 'hauling');
    const pawn = mkPawn('hauling-no-manipulation', {
      health: [{ type: 'missing', partIdx: 28 }, { type: 'missing', partIdx: 39 }],
    });
    const p = policy('hauling', 'Hauling', ['ManualDumb', 'Hauling', 'Commoner', 'AllWork'], [
      {
        pathId: 'workGiver:ManipulationPath', sourceWorkGiverDefs: ['ManipulationPath'],
        completeness: 'complete', completenessReasons: [],
        allOf: [capacityRequirement('Manipulation')], provenance,
      },
      freePath('TakeEntityToHoldingPlatform'),
    ]);
    const c = context(p, {
      capacities: { capacities: {
        manipulation: {
          capacity: 'Manipulation',
          structural: { state: 'resolved', value: 0, evidence: [] },
          current: { state: 'resolved', value: 0, evidence: [] },
        },
      } },
    });
    const canonical = resolvePair(c);
    const legacy = {
      permission: compat.evaluateLegacyPermission(pawn, job),
      incapable: compat.evaluateLegacyIncapable(pawn, job),
    };
    ok(canonical.permission.state === 'allowed' && canonical.availability.state === 'available',
      'CC-010 Hauling canonical zero-capacity alternative succeeds');
    ok(compat.compare({ caseId: 'anomaly-hauling-free-path', ...canonical, legacy }).deltaCode
      === 'legacyBlockedCanonicalNotBlocked',
    'CC-011 Hauling manipulation mismatch is named shadow-only');
  }

  // Downed moves from a legacy structural block to canonical current Availability.
  {
    const job = jobs.find(item => item.id === 'mining');
    const pawn = mkPawn('downed-decomposition', { downed: true });
    const p = policy('mining', 'Mining', ['ManualSkilled', 'Mining', 'Commoner', 'AllWork']);
    const c = context(p);
    c.statusFacts.downed = statusFact('downed', true);
    const canonical = resolvePair(c);
    const legacy = {
      permission: compat.evaluateLegacyPermission(pawn, job),
      incapable: compat.evaluateLegacyIncapable(pawn, job),
    };
    ok(canonical.permission.state === 'allowed' && canonical.availability.state === 'unavailable',
      'CC-012 downed is canonical Availability, not Permission');
    const comparison = compat.compare({ caseId: 'downed-decomposition', ...canonical, legacy });
    ok(comparison.sameIncapable
      && comparison.deltaCode === 'legacyPermissionBlockCanonicalAvailabilityBlock',
    'CC-013 downed preserves boolean parity while naming semantic decomposition');
  }

  // App/custom jobs remain unknown; canonical unknown never projects to blocked.
  {
    const job = jobs.find(item => item.id === 'wait');
    const pawn = mkPawn('unknown-app-job');
    const canonical = resolvePair(context(unknownPolicy('wait')));
    const legacy = {
      permission: compat.evaluateLegacyPermission(pawn, job),
      incapable: compat.evaluateLegacyIncapable(pawn, job),
    };
    ok(canonical.permission.state === 'unknown' && canonical.availability.state === 'unknown',
      'CC-014 unsupported app job remains canonical unknown');
    ok(compat.projectCanonicalIncapable(canonical.permission, canonical.availability) === false,
      'CC-015 canonical unknown is not projected to blocked');
    const comparison = compat.compare({ caseId: 'unknown-app-job', ...canonical, legacy });
    ok(comparison.sameIncapable && comparison.deltaCode === 'canonicalUnknownLegacyAllowed',
      'CC-016 unknown app versus allowed legacy result is explicit');
  }

  const canonicalSource = ['permission-resolver.js', 'availability-resolver.js',
    'requirement-registry.js', 'c4-evaluation-context.js']
    .map(file => fs.readFileSync(path.join(__dirname, '..', 'files', file), 'utf8')).join('\n');
  ok(!/C4LegacyCompatibility/.test(canonicalSource),
    'CC-017 canonical modules never import compatibility');

  return { name: 'C4 compatibility and shadow parity', failures, total };
};

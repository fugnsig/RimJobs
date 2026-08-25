/** Canonical C4 PermissionResolver tests. */
const fs = require('fs');
const path = require('path');
const { loadScripts } = require('./_harness');

module.exports = function run() {
  let total = 0;
  let failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) { failures++; console.log('  FAIL ' + label); }
  };
  const ctx = loadScripts(['requirement-registry.js', 'permission-resolver.js'], {});
  const resolver = ctx.PermissionResolver;
  const provenance = { modId: 'fixture.active', sources: [{ file: 'fixture.xml' }] };
  const capReq = (name, threshold, notApplicable, complete) => ({
    requirementId: 'capacity:' + name, kind: 'capacity', capacityDefName: name,
    completeness: complete === false ? 'partial' : 'complete', completenessReasons: [],
    comparison: complete === false ? null : {
      operator: 'gt', thresholdSource: { kind: 'capacityDefField', field: 'minForCapable', value: threshold },
    },
    notApplicable: notApplicable || 'blocked', provenance,
  });
  const workPath = (id, requirements, completeness) => ({
    pathId: 'workGiver:' + id, sourceWorkGiverDefs: [id],
    completeness: completeness || 'complete', completenessReasons: [],
    allOf: requirements || [], provenance,
  });
  const policy = (over) => Object.assign({
    jobId: 'fixture_job', state: 'definitionBacked', completeness: 'complete',
    workTypeDefName: 'FixtureWork', sourceWorkTypes: ['FixtureWork'], completenessReasons: [], provenance,
    permission: {
      workTags: { completeness: 'complete', values: ['Caring', 'Commoner', 'AllWork'], provenance },
      age: { state: 'definitionDriven', provenance },
    },
    execution: { completeness: 'complete', mode: 'anyPath', paths: [workPath('Free', [])] },
    availability: {},
  }, over || {});
  const snapshot = (jobPolicy, racePolicy) => ({
    jobPolicies: { [jobPolicy.jobId]: jobPolicy },
    raceWorkPolicies: {
      FixtureRace: racePolicy || {
        raceDefName: 'FixtureRace', entries: {}, entryCompleteness: {},
        entryCompletenessReasons: {}, catalogueCompleteness: 'complete',
        catalogueCompletenessReasons: [], provenance,
      },
    },
  });
  const effect = (type, target, id, extra) => Object.assign({
    evidenceId: id || type + ':' + target, type, target,
    confidence: 'verified', provenance,
  }, extra || {});
  const capacityOutput = facts => ({
    capacities: Object.fromEntries(Object.entries(facts || {}).map(([name, fact]) => [
      name.toLowerCase(), { capacity: name, structural: fact, current: fact },
    ])),
  });
  const makeContext = (jobPolicy, over) => {
    const additions = over || {};
    return {
      pawnId: 'pawn-1',
      definitionSnapshot: additions.definitionSnapshot || snapshot(jobPolicy, additions.racePolicy),
      evidence: Object.assign({
        effects: [], bodyEvidence: [], unresolvedSources: [],
        pawnState: { raceDefName: 'FixtureRace', age: 20 },
      }, additions.evidence || {}),
      capacities: additions.capacities || capacityOutput({}),
    };
  };
  const resolve = (jobPolicy, over) => resolver.resolve(makeContext(jobPolicy, over), jobPolicy.jobId);

  {
    const p = policy({ jobId: 'job_exact' });
    const report = resolve(p, { evidence: { effects: [effect('disableJob', 'job_exact', 'exact-job')] } });
    ok(report.schemaVersion === 1 && report.pawnId === 'pawn-1' && report.jobId === 'job_exact',
      'PR-001 report identity and schema are stable');
    ok(report.state === 'blocked' && report.blockers.some(item => item.kind === 'disableJob'),
      'PR-002 exact canonical job target blocks');
    const blocker = report.blockers.find(item => item.kind === 'disableJob');
    ok(blocker.requirementId === 'disableJob:job_exact'
      && blocker.explanation.code === 'permission.job.failed'
      && blocker.evidence[0].evidenceId === 'exact-job',
    'PR-003 blocker includes stable requirement, explanation, and evidence reference');
  }

  {
    const p = policy({ jobId: 'worktype_exact' });
    const report = resolve(p, { evidence: { effects: [
      effect('disableWorkType', 'FixtureWork', 'exact-worktype'),
      effect('disableJob', 'FixtureWork', 'wrong-namespace'),
    ] } });
    ok(report.state === 'blocked'
      && report.evaluations.some(item => item.evidence.some(ref => ref.evidenceId === 'exact-worktype')),
    'PR-004 exact WorkType target blocks through its own namespace');
    ok(!report.evaluations.some(item => item.evidence.some(ref => ref.evidenceId === 'wrong-namespace')),
      'PR-005 job namespace is not guessed into WorkType namespace');
  }

  {
    const p = policy({ jobId: 'firefight', workTypeDefName: 'Firefighter',
      permission: { workTags: { completeness: 'complete', values: ['Firefighting', 'Commoner', 'AllWork'], provenance }, age: {} } });
    const violence = resolve(p, { evidence: { effects: [effect('disableWorkTag', 'Violent', 'violent')] } });
    const firefighter = resolve(p, { evidence: { effects: [effect('disableWorkTag', 'Firefighting', 'fire')] } });
    const allWork = resolve(p, { evidence: { effects: [effect('disableWorkTag', 'AllWork', 'all')] } });
    ok(violence.state === 'allowed', 'PR-006 Firefight is independent of legacy Violent mismatch');
    ok(firefighter.state === 'blocked', 'PR-007 exact Firefighting bit blocks Firefighter');
    ok(allWork.state === 'blocked', 'PR-008 AllWork bit blocks a WorkType carrying AllWork');
    ok(resolver._tagMask(['Caring', 'Commoner']) === (16 | 64),
      'PR-009 combined WorkTag flags use audited bitmask semantics');
  }

  {
    const p = policy({ jobId: 'ambiguity' });
    const structured = resolve(p, { evidence: {
      unresolvedSources: [{ rawTarget: 'caring', candidateTargets: [{ kind: 'workTag', target: 'Caring' }] }],
    } });
    const opaque = resolve(p, { evidence: {
      unresolvedSources: [{ rawTarget: 'Caring', candidateTargets: [] }],
    } });
    const unrelated = resolve(p, { evidence: {
      unresolvedSources: [{ rawTarget: 'Mining', candidateTargets: [{ kind: 'workTag', target: 'Mining' }] }],
    } });
    ok(structured.state === 'unknown', 'PR-010 structured relevant ambiguity propagates unknown');
    ok(opaque.state === 'allowed', 'PR-011 opaque raw ambiguity is not reparsed');
    ok(unrelated.state === 'allowed', 'PR-012 unrelated unknown evidence does not poison policy');
  }

  {
    const p = policy({ jobId: 'coexist' });
    const report = resolve(p, { evidence: {
      effects: [effect('disableJob', 'coexist', 'block')],
      unresolvedSources: [{ candidateTargets: [{ kind: 'workTag', target: 'Caring' }] }],
    } });
    ok(report.state === 'blocked' && report.blockers.length > 0 && report.unknowns.length > 0,
      'PR-013 confirmed blocker and relevant unknown coexist');
  }

  const conditionalPolicy = policy({ jobId: 'conditional' });
  const conditionalEffect = effect('disableWorkTag', 'Caring', 'hediff-condition', {
    when: { kind: 'hediffSeverity', hediffDef: 'FixtureHediff', min: 0.4, max: 0.8, maxExclusive: true },
  });
  const body = (severity, persistence) => ({
    kind: 'hediff', hediffDef: 'FixtureHediff', severity, persistence,
  });
  ok(resolve(conditionalPolicy, { evidence: { effects: [conditionalEffect], bodyEvidence: [body(0.5, 'persistent')] } }).state === 'blocked',
    'PR-014 active persistent conditional restriction blocks');
  ok(resolve(conditionalPolicy, { evidence: { effects: [conditionalEffect], bodyEvidence: [body(0.5, 'temporary')] } }).state === 'allowed',
    'PR-015 temporary conditional restriction is ignored by Permission');
  ok(resolve(conditionalPolicy, { evidence: { effects: [conditionalEffect], bodyEvidence: [body(0.2, 'persistent')] } }).state === 'allowed',
    'PR-016 below-stage persistent hediff does not block');
  ok(resolve(conditionalPolicy, { evidence: { effects: [conditionalEffect], bodyEvidence: [body(null, 'persistent')] } }).state === 'unknown',
    'PR-017 missing severity remains unknown, never zero');
  ok(resolve(conditionalPolicy, { evidence: { effects: [conditionalEffect], bodyEvidence: [body(0.5, 'unknown')] } }).state === 'unknown',
    'PR-018 unknown persistence remains structurally unknown');
  ok(resolve(conditionalPolicy, { evidence: { effects: [effect('disableWorkTag', 'Caring', 'unsupported-when', { when: { kind: 'customCondition' } })] } }).state === 'unknown',
    'PR-019 unsupported relevant condition remains unknown');
  ok(resolve(conditionalPolicy, { evidence: { effects: [effect('disableWorkTag', 'Caring', 'unknown-confidence', { confidence: 'unknown' })] } }).state === 'unknown',
    'PR-020 unknown evidence confidence remains unknown');

  {
    const agePolicy = policy({ jobId: 'age' });
    const gatedRace = {
      raceDefName: 'FixtureRace', entries: { FixtureWork: 10 },
      entryCompleteness: { FixtureWork: 'complete' }, entryCompletenessReasons: {},
      catalogueCompleteness: 'partial', catalogueCompletenessReasons: ['unrelatedPatch'], provenance,
    };
    ok(resolve(agePolicy, { racePolicy: gatedRace, evidence: { pawnState: { raceDefName: 'FixtureRace', age: 9 } } }).state === 'blocked',
      'PR-021 age below definition gate blocks');
    ok(resolve(agePolicy, { racePolicy: gatedRace, evidence: { pawnState: { raceDefName: 'FixtureRace', age: 10 } } }).state === 'allowed',
      'PR-022 exact age boundary satisfies gate');
    ok(resolve(agePolicy, { racePolicy: gatedRace, evidence: { pawnState: { raceDefName: 'FixtureRace', age: 11 } } }).state === 'allowed',
      'PR-023 age above gate satisfies');
    ok(resolve(agePolicy, { racePolicy: gatedRace, evidence: { pawnState: { raceDefName: 'FixtureRace', age: null } } }).state === 'unknown',
      'PR-024 missing biological age stays unknown');
    ok(resolve(agePolicy, {}).state === 'allowed',
      'PR-025 complete absent race entry is known no gate');
    const unknownRace = Object.assign({}, gatedRace, { entries: {}, entryCompleteness: {} });
    ok(resolve(agePolicy, { racePolicy: unknownRace }).state === 'unknown',
      'PR-026 absent entry in partial race catalogue is unknown');
  }

  {
    const executionPolicy = policy({ jobId: 'capacity', execution: {
      completeness: 'complete', mode: 'anyPath',
      paths: [workPath('Manip', [capReq('Manipulation', 0.5, 'blocked')])],
    } });
    const withFact = fact => resolve(executionPolicy, {
      capacities: capacityOutput({ Manipulation: fact }),
    });
    ok(withFact({ state: 'resolved', value: 0.4, evidence: [] }).state === 'blocked',
      'PR-027 value below threshold blocks only execution aggregate');
    ok(withFact({ state: 'resolved', value: 0.5, evidence: [] }).state === 'blocked',
      'PR-028 exact threshold fails strict greater-than');
    ok(withFact({ state: 'resolved', value: 0.6, evidence: [] }).state === 'allowed',
      'PR-029 value above threshold succeeds');
    ok(withFact({ state: 'unknown', value: null, evidence: [] }).state === 'unknown',
      'PR-030 unknown structural capacity propagates');
    ok(withFact({ state: 'notApplicable', value: null, evidence: [] }).state === 'blocked',
      'PR-031 notApplicable blocked policy is explicit');
    const naSatisfied = policy({ jobId: 'na-satisfied', execution: {
      completeness: 'complete', mode: 'anyPath', paths: [workPath('NA', [capReq('Manipulation', 0, 'satisfied')])],
    } });
    ok(resolve(naSatisfied, { capacities: capacityOutput({ Manipulation: { state: 'notApplicable', value: null } }) }).state === 'allowed',
      'PR-032 notApplicable satisfied policy is explicit');
    const naUnknown = policy({ jobId: 'na-unknown', execution: {
      completeness: 'complete', mode: 'anyPath', paths: [workPath('NAU', [capReq('Custom', 0, 'unknown')])],
    } });
    ok(resolve(naUnknown, { capacities: capacityOutput({ Custom: { state: 'notApplicable', value: null } }) }).state === 'unknown',
      'PR-033 notApplicable unknown policy is explicit');
  }

  {
    const alternatives = policy({ jobId: 'alternatives', execution: {
      completeness: 'complete', mode: 'anyPath', paths: [
        workPath('Failed', [capReq('Manipulation', 0.5)]),
        workPath('Free', []),
      ],
    } });
    const report = resolve(alternatives, {
      capacities: capacityOutput({ Manipulation: { state: 'resolved', value: 0.1, evidence: [] } }),
    });
    ok(report.state === 'allowed', 'PR-034 one failed path plus successful alternative allows');
    ok(report.evaluations.find(item => item.evaluationId === 'permission:path:workGiver:Failed').aggregation.masked,
      'PR-035 failed alternative path is explanatory and masked');

    const failedUnknown = policy({ jobId: 'failed-unknown', execution: {
      completeness: 'complete', mode: 'anyPath', paths: [
        workPath('Failed', [capReq('Manipulation', 0.5)]),
        workPath('Unknown', [capReq('Talking', 0)]),
      ],
    } });
    const unknownReport = resolve(failedUnknown, { capacities: capacityOutput({
      Manipulation: { state: 'resolved', value: 0.1, evidence: [] },
      Talking: { state: 'unknown', value: null, evidence: [] },
    }) });
    ok(unknownReport.state === 'unknown',
      'PR-036 failed path plus unknown alternative is unknown');
  }

  {
    const free = policy({ jobId: 'zero', execution: {
      completeness: 'complete', mode: 'anyPath', paths: [workPath('VerifiedFree', [])],
    } });
    const empty = policy({ jobId: 'empty', execution: {
      completeness: 'complete', mode: 'anyPath', paths: [],
    } });
    const incomplete = policy({ jobId: 'incomplete-empty', execution: {
      completeness: 'partial', mode: 'anyPath', paths: [],
    } });
    ok(resolve(free, {}).state === 'allowed', 'PR-037 verified zero-capacity path succeeds');
    ok(resolve(empty, {}).state === 'blocked', 'PR-038 complete empty catalogue fails');
    ok(resolve(incomplete, {}).state === 'unknown', 'PR-039 incomplete empty catalogue is unknown');
  }

  {
    const appPolicy = Object.assign(policy({ jobId: 'unsupported_app' }), {
      state: 'unknown', completeness: 'unknown', workTypeDefName: null,
    });
    ok(resolve(appPolicy, {}).state === 'unknown',
      'PR-040 unsupported app job remains unknown rather than guessed');
  }

  const source = fs.readFileSync(path.join(__dirname, '..', 'files', 'permission-resolver.js'), 'utf8');
  ok(!/incapBlocks|JOB_MIN_AGE|MANIPULATION_GATED_JOBS|App\.isIncapable|evaluateJobPermission|pawn\.health|pawn\.incapable/.test(source),
    'PR-041 canonical Permission has no legacy or raw-pawn dependency');
  ok(!/raceDefName\s*={2,3}|raceDefName\s*!={1,2}|switch\s*\([^)]*raceDefName/.test(source),
    'PR-042 race names are opaque registry keys');

  return { name: 'C4 permission resolver', failures, total };
};

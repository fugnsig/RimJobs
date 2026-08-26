/** C4 evaluation-context and AvailabilityResolver tests. */
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
  const provenance = { modId: 'fixture.active', sources: [] };
  const fact = (statusId, value, state) => ({
    statusId, state: state || 'known', value: state === 'unknown' ? null : value, evidence: [],
  });
  const healthyFacts = () => ({
    downed: fact('downed', false), inMentalState: fact('inMentalState', false),
    mentalBreak: fact('mentalBreak', false), deactivated: fact('deactivated', false),
    unconscious: fact('unconscious', false), canBeAwake: fact('canBeAwake', true),
  });

  // Request-scoped context: instrument the two orchestration calls directly.
  {
    let c2Calls = 0;
    let c3Calls = 0;
    let seenDefinitions = null;
    const c2 = {
      collectPawnEvidence() {
        c2Calls++;
        return {
          effects: [], bodyEvidence: [], unresolvedSources: [],
          pawnState: {
            raceDefName: 'DefinitionRace', currentStatusFacts: healthyFacts(), currentStatus: {},
          },
        };
      },
    };
    const c3 = {
      resolvePawnCapacities(evidence, definitions) {
        c3Calls++;
        seenDefinitions = definitions;
        return { bodyIdentity: { state: 'resolved' }, capacities: {
          consciousness: {
            capacity: 'Consciousness', structural: { state: 'resolved', value: 1 },
            current: { state: 'resolved', value: 1, evidence: [] },
          },
        } };
      },
    };
    const contextSandbox = loadScripts([
      'requirement-registry.js', 'c4-evaluation-context.js', 'availability-resolver.js',
    ], {
      CapabilityEvidence: c2, CapacityResolver: c3,
    });
    const contextModule = contextSandbox.C4EvaluationContext;
    const capabilityDefinitions = {
      raceBodyMap: {
        DefinitionRace: { alwaysAwake: false, alwaysAwakeCompleteness: 'complete' },
      },
      bodyDefs: { marker: true }, bodyPartDefs: {}, capacityDefs: {}, hediffCatalog: [],
    };
    const freePolicy = jobId => ({
      jobId, state: 'definitionBacked', completeness: 'complete',
      workTypeDefName: 'FixtureWork', sourceWorkTypes: ['FixtureWork'], provenance,
      permission: { workTags: { completeness: 'complete', values: [], provenance } },
      execution: { completeness: 'complete', mode: 'anyPath', paths: [{
        pathId: 'workGiver:Free', completeness: 'complete', allOf: [], provenance,
      }] },
    });
    const definitionSnapshot = contextSandbox.RequirementRegistry._deepFreeze({
      jobPolicies: { first: freePolicy('first'), second: freePolicy('second') },
      raceWorkPolicies: {},
    });
    const context = contextModule.create({
      pawn: { id: 'context-pawn', health: ['opaque'] }, definitionSnapshot, capabilityDefinitions,
    });
    ok(c2Calls === 1 && c3Calls === 1,
      'AR-001 one context performs exactly one C2 and one C3 call');
    ok(seenDefinitions === capabilityDefinitions && seenDefinitions.bodyDefs.marker === true,
      'AR-002 context passes the complete accepted C3 definition bundle');
    ok(context.statusFacts.canBeAwake.state === 'known'
      && context.statusFacts.canBeAwake.value === true
      && context.statusFacts.unconscious.value === false,
    'AR-003 exact race, Consciousness, and deactivation inputs derive awake facts');
    ok(Object.isFrozen(context) && Object.isFrozen(context.evidence)
      && Object.isFrozen(context.capacities),
    'AR-004 request context is deeply immutable');
    contextSandbox.AvailabilityResolver.resolve(context, 'first');
    contextSandbox.AvailabilityResolver.resolve(context, 'second');
    ok(c2Calls === 1 && c3Calls === 1,
      'AR-004B multiple job evaluations reuse the same one-C2/one-C3 context');
    contextModule.create({
      pawn: { id: 'fresh-pawn' }, definitionSnapshot, capabilityDefinitions,
    });
    ok(c2Calls === 2 && c3Calls === 2,
      'AR-005 fresh context recomputes without cross-batch state');

    const lowResult = contextModule._deriveAwakeFacts(healthyFacts(), {
      pawnState: { raceDefName: 'DefinitionRace' },
    }, { capacities: { consciousness: { capacity: 'Consciousness', current: { state: 'resolved', value: 0.2 } } } },
    capabilityDefinitions);
    ok(lowResult.canBeAwake.value === false && lowResult.unconscious.value === true,
      'AR-006 exact runtime threshold derives cannot-be-awake');
    const missingRace = contextModule._deriveAwakeFacts(healthyFacts(), {
      pawnState: { raceDefName: 'UnknownRace' },
    }, { capacities: { consciousness: { capacity: 'Consciousness', current: { state: 'resolved', value: 0.2 } } } },
    capabilityDefinitions);
    ok(missingRace.canBeAwake.state === 'unknown' && missingRace.unconscious.state === 'unknown',
      'AR-007 missing outcome-relevant race input keeps awake facts unknown');
    const deactivatedFacts = healthyFacts();
    deactivatedFacts.deactivated = fact('deactivated', true);
    const deactivated = contextModule._deriveAwakeFacts(deactivatedFacts, {
      pawnState: { raceDefName: 'UnknownRace' },
    }, { capacities: {} }, capabilityDefinitions);
    ok(deactivated.canBeAwake.value === false && deactivated.unconscious.value === true,
      'AR-008 verified deactivation proves cannot-be-awake independently');
  }

  const modules = loadScripts([
    'requirement-registry.js', 'permission-resolver.js', 'availability-resolver.js',
  ], {});
  const availability = modules.AvailabilityResolver;
  const permission = modules.PermissionResolver;
  const capReq = (name, threshold, notApplicable) => ({
    requirementId: 'capacity:' + name, kind: 'capacity', capacityDefName: name,
    completeness: 'complete', comparison: {
      operator: 'gt', thresholdSource: { kind: 'capacityDefField', field: 'minForCapable', value: threshold },
    }, notApplicable: notApplicable || 'blocked', provenance,
  });
  const pathDef = (id, allOf, completeness) => ({
    pathId: 'workGiver:' + id, sourceWorkGiverDefs: [id],
    completeness: completeness || 'complete', allOf: allOf || [], provenance,
  });
  const makePolicy = over => Object.assign({
    jobId: 'fixture_job', state: 'definitionBacked', completeness: 'complete',
    workTypeDefName: 'FixtureWork', sourceWorkTypes: ['FixtureWork'], provenance,
    permission: {
      workTags: { completeness: 'complete', values: ['Caring', 'Commoner', 'AllWork'], provenance },
      age: {},
    },
    execution: { completeness: 'complete', mode: 'anyPath', paths: [pathDef('Free', [])] },
    availability: { currentOnly: { completeness: 'complete', requirements: [] } },
  }, over || {});
  const makeSnapshot = policy => ({
    jobPolicies: { [policy.jobId]: policy },
    raceWorkPolicies: {
      FixtureRace: {
        entries: {}, entryCompleteness: {}, entryCompletenessReasons: {},
        catalogueCompleteness: 'complete', catalogueCompletenessReasons: [], provenance,
      },
    },
  });
  const capacityResult = facts => ({
    capacities: Object.fromEntries(Object.entries(facts || {}).map(([name, current]) => [
      name.toLowerCase(), {
        capacity: name, structural: { state: 'resolved', value: 1, evidence: [] }, current,
      },
    ])),
  });
  const makeContext = (policy, over) => Object.assign({
    pawnId: 'availability-pawn',
    definitionSnapshot: makeSnapshot(policy),
    statusFacts: healthyFacts(),
    evidence: {
      effects: [], bodyEvidence: [], unresolvedSources: [],
      pawnState: { raceDefName: 'FixtureRace', age: 20 },
    },
    capacities: capacityResult({}),
  }, over || {});

  {
    const p = makePolicy({ jobId: 'status' });
    const falseReport = availability.resolve(makeContext(p), p.jobId);
    ok(falseReport.schemaVersion === 1 && falseReport.state === 'available'
      && falseReport.global.state === 'available' && falseReport.jobSpecific.state === 'available',
    'AR-009 known false global statuses and free path are available');
    for (const statusId of ['downed', 'inMentalState', 'mentalBreak', 'deactivated', 'unconscious']) {
      const facts = healthyFacts();
      facts[statusId] = fact(statusId, true);
      const report = availability.resolve(makeContext(p, { statusFacts: facts }), p.jobId);
      ok(report.state === 'unavailable'
        && report.global.blockers.some(item => item.requirementId === 'currentStatus:' + statusId),
      'AR-010 known true global status blocks: ' + statusId);
    }
    const unknownFacts = healthyFacts();
    unknownFacts.downed = fact('downed', null, 'unknown');
    ok(availability.resolve(makeContext(p, { statusFacts: unknownFacts }), p.jobId).state === 'unknown',
      'AR-011 missing tri-state status is unknown, not false');
  }

  {
    const p = makePolicy({ jobId: 'current-capacity', execution: {
      completeness: 'complete', mode: 'anyPath', paths: [pathDef('Manip', [capReq('Manipulation', 0.5)])],
    } });
    const resolveFact = current => availability.resolve(makeContext(p, {
      capacities: capacityResult({ Manipulation: current }),
    }), p.jobId);
    ok(resolveFact({ state: 'resolved', value: 0.6, evidence: [] }).state === 'available',
      'AR-012 current capacity above threshold is available');
    ok(resolveFact({ state: 'resolved', value: 0.5, evidence: [] }).state === 'unavailable',
      'AR-013 exact current threshold fails strict greater-than');
    ok(resolveFact({ state: 'resolved', value: 0.4, evidence: [] }).state === 'unavailable',
      'AR-014 current capacity below threshold is unavailable');
    ok(resolveFact({ state: 'unknown', value: null, evidence: [] }).state === 'unknown',
      'AR-015 unknown current capacity remains unknown');
    ok(resolveFact({ state: 'notApplicable', value: null, evidence: [] }).state === 'unavailable',
      'AR-016 current notApplicable follows explicit blocked policy');
  }

  {
    const p = makePolicy({ jobId: 'alternatives', execution: {
      completeness: 'complete', mode: 'anyPath', paths: [
        pathDef('Failed', [capReq('Manipulation', 0.5)]), pathDef('Free', []),
      ],
    } });
    const report = availability.resolve(makeContext(p, { capacities: capacityResult({
      Manipulation: { state: 'resolved', value: 0.1, evidence: [] },
    }) }), p.jobId);
    ok(report.state === 'available', 'AR-017 failed current path plus free alternative succeeds');
    ok(report.jobSpecific.evaluations.find(item => item.evaluationId === 'availability:path:workGiver:Failed').aggregation.masked,
      'AR-018 failed current alternative is masked');
    const uncertain = makePolicy({ jobId: 'uncertain-alternative', execution: {
      completeness: 'complete', mode: 'anyPath', paths: [
        pathDef('Failed', [capReq('Manipulation', 0.5)]),
        pathDef('Unknown', [capReq('Talking', 0)]),
      ],
    } });
    const uncertainReport = availability.resolve(makeContext(uncertain, { capacities: capacityResult({
      Manipulation: { state: 'resolved', value: 0.1, evidence: [] },
      Talking: { state: 'unknown', value: null, evidence: [] },
    }) }), uncertain.jobId);
    ok(uncertainReport.state === 'unknown',
      'AR-019 failed current path plus unknown alternative is unknown');
  }

  {
    const p = makePolicy({ jobId: 'temporary' });
    const temporaryJob = {
      evidenceId: 'temporary-job', type: 'disableJob', target: 'temporary',
      scope: 'currentOnly', confidence: 'verified', provenance,
    };
    const temporaryTag = {
      evidenceId: 'temporary-tag', type: 'disableWorkTag', target: 'Caring',
      scope: 'current', confidence: 'verified', provenance,
    };
    const unrelated = Object.assign({}, temporaryTag, { evidenceId: 'unrelated', target: 'Mining' });
    ok(availability.resolve(makeContext(p, { evidence: {
      effects: [temporaryJob], bodyEvidence: [], pawnState: {},
    } }), p.jobId).state === 'unavailable',
    'AR-020 exact temporary job restriction blocks Availability');
    ok(availability.resolve(makeContext(p, { evidence: {
      effects: [temporaryTag], bodyEvidence: [], pawnState: {},
    } }), p.jobId).state === 'unavailable',
    'AR-021 exact temporary WorkTag restriction blocks Availability');
    ok(availability.resolve(makeContext(p, { evidence: {
      effects: [unrelated], bodyEvidence: [], pawnState: {},
    } }), p.jobId).state === 'available',
    'AR-022 unrelated temporary evidence is ignored');
    const structural = Object.assign({}, temporaryTag, { evidenceId: 'structural', scope: null });
    ok(availability.resolve(makeContext(p, { evidence: {
      effects: [structural], bodyEvidence: [], pawnState: {},
    } }), p.jobId).state === 'available',
    'AR-023 permanent direct restriction is not copied into Availability');
  }

  {
    const p = makePolicy({ jobId: 'conditional-current' });
    const conditional = {
      evidenceId: 'conditional-current', type: 'disableWorkTag', target: 'Caring',
      confidence: 'verified', provenance,
      when: { kind: 'hediffSeverity', hediffDef: 'CurrentHediff', min: 0.4, max: null },
    };
    const report = availability.resolve(makeContext(p, { evidence: {
      effects: [conditional],
      bodyEvidence: [{ kind: 'hediff', hediffDef: 'CurrentHediff', severity: 0.5, persistence: 'persistent' }],
      pawnState: {},
    } }), p.jobId);
    ok(report.state === 'unavailable',
      'AR-024 active conditional restriction is current regardless of persistence');
    const unknownFacts = healthyFacts();
    unknownFacts.downed = fact('downed', null, 'unknown');
    ok(availability.resolve(makeContext(p, {
      statusFacts: unknownFacts,
      evidence: {
        effects: [conditional],
        bodyEvidence: [{ kind: 'hediff', hediffDef: 'CurrentHediff', severity: 0.5 }],
        pawnState: {},
      },
    }), p.jobId).blockers.length > 0
      && availability.resolve(makeContext(p, {
        statusFacts: unknownFacts,
        evidence: {
          effects: [conditional],
          bodyEvidence: [{ kind: 'hediff', hediffDef: 'CurrentHediff', severity: 0.5 }],
          pawnState: {},
        },
      }), p.jobId).unknowns.length > 0,
    'AR-025 confirmed current blocker and independent status unknown coexist');
  }

  {
    const p = makePolicy({ jobId: 'peers' });
    const structuralEffect = {
      evidenceId: 'structural-peer', type: 'disableJob', target: 'peers',
      confidence: 'verified', provenance,
    };
    const base = makeContext(p);
    base.evidence.effects = [structuralEffect];
    const permissionBlocked = permission.resolve(base, p.jobId);
    const available = availability.resolve(base, p.jobId);
    ok(permissionBlocked.state === 'blocked' && available.state === 'available',
      'AR-026 peer combination blocked plus available');
    const downed = healthyFacts(); downed.downed = fact('downed', true);
    const allowedContext = makeContext(p, { statusFacts: downed });
    ok(permission.resolve(allowedContext, p.jobId).state === 'allowed'
      && availability.resolve(allowedContext, p.jobId).state === 'unavailable',
    'AR-027 peer combination allowed plus unavailable');
    const both = makeContext(p, { statusFacts: downed });
    both.evidence.effects = [structuralEffect];
    ok(permission.resolve(both, p.jobId).state === 'blocked'
      && availability.resolve(both, p.jobId).state === 'unavailable',
    'AR-028 peer combination blocked plus unavailable');
    const app = Object.assign(makePolicy({ jobId: 'unknown-peer' }), {
      state: 'unknown', completeness: 'unknown', workTypeDefName: null,
    });
    const unknownContext = makeContext(app);
    ok(permission.resolve(unknownContext, app.jobId).state === 'unknown'
      && availability.resolve(unknownContext, app.jobId).state === 'unknown',
    'AR-029 peer outputs preserve unknown independently');
  }

  const contextSource = fs.readFileSync(path.join(__dirname, '..', 'files', 'c4-evaluation-context.js'), 'utf8');
  const availabilitySource = fs.readFileSync(path.join(__dirname, '..', 'files', 'availability-resolver.js'), 'utf8');
  ok(!/incapBlocks|JOB_MIN_AGE|MANIPULATION_GATED_JOBS|App\.isIncapable|evaluateJobPermission|pawn\.health|pawn\.incapable/.test(contextSource + availabilitySource),
    'AR-030 context and Availability have no legacy or raw pawn semantic read');
  ok(!/\b(?:new Map|WeakMap|invalidate|revisionCache)\b/.test(contextSource + availabilitySource),
    'AR-031 no long-lived cache or invalidation mechanism exists');
  ok(!/PermissionResolver|permission\.state|context\.permission/.test(availabilitySource),
    'AR-032 Availability does not read or derive from Permission');

  return { name: 'C4 availability and context', failures, total };
};

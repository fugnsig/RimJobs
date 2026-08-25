/**
 * C3 CapacityResolver tests.
 * Stable IDs use CR-F for body identity and raw observation joins.
 */
const fs = require('fs');
const path = require('path');
const { loadScripts } = require('./_harness');

module.exports = function run() {
  const { CapacityResolver: resolver } = loadScripts(['capacity-resolver.js'], {});
  let total = 0;
  let failures = 0;
  function ok(condition, label) {
    total++;
    if (!condition) {
      failures++;
      console.log('  FAIL ' + label);
    }
  }

  const body = {
    defName: 'SyntheticBody',
    _completeness: 'complete',
    corePart: {
      def: 'RootPart',
      parts: [
        { def: 'BranchPart', parts: [{ def: 'LeafPart', parts: [] }] },
        { def: 'SecondPart', parts: [] },
      ],
    },
  };
  const definitions = {
    raceBodyMap: {
      SyntheticRace: {
        raceDefName: 'SyntheticRace',
        bodyDefName: 'SyntheticBody',
        legacyIndexFallback: null,
        _completeness: 'complete',
      },
    },
    bodyDefs: { SyntheticBody: body },
  };

  const healthy = resolver.resolveBodyIdentity({
    pawnState: { raceDefName: 'SyntheticRace' },
    bodyEvidence: [],
  }, definitions);
  ok(healthy.state === 'resolved', 'CR-F0-001 healthy known race resolves');
  ok(healthy.defName === 'SyntheticBody', 'CR-F0-002 mapped BodyDef retained');
  ok(healthy.source === 'raceDefinition', 'CR-F0-003 race definition provenance retained');

  const unknownRace = resolver.resolveBodyIdentity({
    pawnState: { raceDefName: 'UnmappedRace' },
    bodyEvidence: [],
  }, definitions);
  ok(unknownRace.state === 'unknown', 'CR-A8-001 unknown race remains unknown');

  const partial = resolver.resolveBodyIdentity({
    pawnState: { raceDefName: 'PartialRace' },
    bodyEvidence: [],
  }, {
    raceBodyMap: {
      PartialRace: { bodyDefName: 'SyntheticBody', _completeness: 'partial' },
    },
    bodyDefs: { SyntheticBody: body },
  });
  ok(partial.state === 'unknown', 'CR-A8-002 partial race mapping cannot establish identity');
  ok(partial.completeness === 'partial', 'CR-A8-003 partial identity is labelled partial');

  const legacyBody = Object.assign({}, body, { defName: 'CompatibilityBody' });
  const legacy = resolver.resolveBodyIdentity({
    pawnState: { raceDefName: 'CompatibilityRace' },
    bodyEvidence: [],
  }, {
    raceBodyMap: {
      CompatibilityRace: {
        bodyDefName: 'CompatibilityBody',
        legacyIndexFallback: 'compatibility-provider-key',
        _completeness: 'complete',
      },
    },
    bodyDefs: {},
    legacyBodyDefs: { 'compatibility-provider-key': legacyBody },
  });
  ok(legacy.state === 'resolved', 'CR-F1-001 provider metadata enables legacy fallback');
  ok(legacy.source === 'legacyCompatibility', 'CR-F1-002 legacy fallback provenance retained');

  const noMetadataFallback = resolver.resolveBodyIdentity({
    pawnState: { raceDefName: 'CompatibilityRace' },
    bodyEvidence: [],
  }, {
    raceBodyMap: {
      CompatibilityRace: { bodyDefName: 'CompatibilityBody', _completeness: 'complete' },
    },
    bodyDefs: {},
    legacyBodyDefs: { 'compatibility-provider-key': legacyBody },
  });
  ok(noMetadataFallback.state === 'unknown', 'CR-F1-003 legacy fallback requires provider metadata');

  const index = resolver.buildPartIndex(body);
  ok(index.map(part => part.defName).join(',') === 'RootPart,BranchPart,LeafPart,SecondPart',
    'CR-F2-001 BodyDef index is root-first DFS in child order');
  ok(index.map(part => part.parentIndex).join(',') === '-1,0,1,0',
    'CR-F2-002 parent indexes follow deterministic DFS');

  const joined = resolver.joinObservations([{
    kind: 'hediff',
    rawPartIndex: 2,
    bodyDefName: 'SyntheticBody',
    bodyDefReference: 'explicit',
  }], healthy, index)[0];
  ok(joined.joinState === 'resolved', 'CR-F2-003 modded raw part index joins');
  ok(joined.partIdentity.bodyDef === 'SyntheticBody' && joined.partIdentity.partIndex === 2,
    'CR-F2-004 canonical part identity uses BodyDef and raw index');
  ok(joined.bodyPartDefName === 'LeafPart', 'CR-F2-005 BodyPartDef reference metadata retained');

  const conflictIdentity = resolver.resolveBodyIdentity({
    pawnState: { raceDefName: 'SyntheticRace' },
    bodyEvidence: [{ bodyDefReference: 'explicit', bodyDefName: 'OtherBody' }],
  }, definitions);
  ok(conflictIdentity.state === 'unknown', 'CR-F3-001 race and explicit BodyDef conflict is unknown');
  ok(conflictIdentity.diagnostics.includes('raceAndExplicitBodyConflict'),
    'CR-F3-002 body conflict has a diagnostic');

  const omitted = resolver.joinObservations([{
    rawPartIndex: 1,
    bodyDefName: null,
    bodyDefReference: 'unknown',
  }], healthy, index)[0];
  ok(omitted.joinState === 'bodyUnknown', 'CR-F3-003 omitted body is not silently defaulted');

  const auditedDefault = resolver.joinObservations([{
    rawPartIndex: 1,
    bodyDefName: null,
    bodyDefReference: 'pawnDefault',
  }], healthy, index)[0];
  ok(auditedDefault.joinState === 'resolved', 'CR-F3-004 audited pawn-default metadata permits join');

  const explicitConflict = resolver.joinObservations([{
    rawPartIndex: 1,
    bodyDefName: 'OtherBody',
    bodyDefReference: 'explicit',
  }], healthy, index)[0];
  ok(explicitConflict.joinState === 'bodyConflict', 'CR-F3-005 explicit observation body conflict detected');

  const outOfRange = resolver.joinObservations([{
    rawPartIndex: 99,
    bodyDefReference: 'pawnDefault',
  }], healthy, index)[0];
  ok(outOfRange.joinState === 'indexOutOfRange', 'CR-F3-006 out-of-range part index rejected');

  const incompleteBody = Object.assign({}, body, { _completeness: 'partial' });
  const unreliableIndex = resolver.buildPartIndex(incompleteBody);
  const unreliable = resolver.joinObservations([{
    rawPartIndex: 1,
    bodyDefReference: 'pawnDefault',
  }], Object.assign({}, healthy, { bodyDef: incompleteBody, completeness: 'partial' }), unreliableIndex)[0];
  ok(unreliable.joinState === 'indexUnreliable', 'CR-F3-007 incomplete tree cannot establish raw index identity');

  const noPart = resolver.joinObservations([{ rawPartIndex: null }], healthy, index)[0];
  ok(noPart.joinState === 'noPartRef', 'CR-F3-008 observation without part reference remains body-wide');

  // Task 4 fixture identifiers are deliberately arbitrary. Only audited tags
  // and tree structure connect these parts to workers.
  const workerBody = {
    defName: 'FormDelta',
    _completeness: 'complete',
    corePart: {
      def: 'NodeAlpha',
      parts: [
        { def: 'NodeBeta', parts: [{ def: 'NodeGamma', parts: [{ def: 'NodeDelta', parts: [] }] }] },
        { def: 'NodeEpsilon', parts: [{ def: 'NodeZeta', parts: [{ def: 'NodeEta', parts: [] }] }] },
        { def: 'NodeTheta', parts: [{ def: 'NodeIota', parts: [{ def: 'NodeKappa', parts: [] }] }] },
        { def: 'NodeLambda', parts: [{ def: 'NodeMu', parts: [{ def: 'NodeNu', parts: [] }] }] },
        { def: 'NodeXi', parts: [] },
        { def: 'NodeOmicron', parts: [] },
        { def: 'NodePi', parts: [] },
        { def: 'NodeRho', parts: [] },
        { def: 'NodeSigma', parts: [] },
        { def: 'NodeTau', parts: [] },
        { def: 'NodeUpsilon', parts: [] },
      ],
    },
  };
  const tags = {
    NodeAlpha: [
      'ConsciousnessSource', 'Pelvis', 'Spine', 'BloodPumpingSource',
      'BreathingSource', 'BloodFiltrationSource',
    ],
    NodeBeta: ['ManipulationLimbCore'],
    NodeGamma: ['ManipulationLimbSegment'],
    NodeDelta: ['ManipulationLimbDigit'],
    NodeEpsilon: ['ManipulationLimbCore'],
    NodeZeta: ['ManipulationLimbSegment'],
    NodeEta: ['ManipulationLimbDigit'],
    NodeTheta: ['MovingLimbCore'],
    NodeIota: ['MovingLimbSegment'],
    NodeKappa: ['MovingLimbDigit'],
    NodeLambda: ['MovingLimbCore'],
    NodeMu: ['MovingLimbSegment'],
    NodeNu: ['MovingLimbDigit'],
    NodeXi: ['SightSource'],
    NodeOmicron: ['SightSource'],
    NodePi: ['HearingSource'],
    NodeRho: ['HearingSource'],
    NodeSigma: ['TalkingSource'],
    NodeTau: ['TalkingPathway'],
    NodeUpsilon: ['Tongue'],
  };
  const workerPartDefs = {};
  Object.keys(tags).forEach(defName => {
    workerPartDefs[defName] = {
      defName,
      hitPoints: 20,
      tags: tags[defName],
      _completeness: 'complete',
    };
  });
  const workerIndex = resolver.buildPartIndex(workerBody);
  const baseContext = {
    bodyDef: workerBody,
    bodyPartDefs: workerPartDefs,
    partIndex: workerIndex,
    joinedEvidence: [],
    hediffCatalog: {},
    prostheticEfficiency: {},
    resolvedDeps: {
      Consciousness: 1,
      BloodPumping: 1,
      Breathing: 1,
      BloodFiltration: 1,
    },
    painTotal: 0,
    alwaysDowned: false,
  };
  const capacity = workerClass => ({ workerClass, _completeness: 'complete' });

  const workerNames = Object.keys(resolver.workers);
  ok(workerNames.length === 6, 'CR-D1-001 registry contains six audited workers');
  ok(workerNames.includes('PawnCapacityWorker_Consciousness')
    && workerNames.includes('PawnCapacityWorker_Manipulation')
    && workerNames.includes('PawnCapacityWorker_Moving')
    && workerNames.includes('PawnCapacityWorker_Sight')
    && workerNames.includes('PawnCapacityWorker_Talking')
    && workerNames.includes('PawnCapacityWorker_Hearing'),
  'CR-D1-002 registry identities exactly cover supported workers');

  for (let i = 0; i < workerNames.length; i++) {
    const result = resolver.resolveCapacityWorker(capacity(workerNames[i]), baseContext);
    ok(result.state === 'resolved', 'CR-D1-00' + (i + 3) + ' healthy supported worker resolves');
    ok(Math.abs(result.value - 1) < 1e-9, 'CR-D1-01' + (i + 3) + ' healthy supported worker baseline is worker-derived 1');
  }

  const unsupported = resolver.resolveCapacityWorker(
    capacity('Example.Namespace.CustomCapacityWorker'), baseContext);
  ok(unsupported.state === 'unknown' && unsupported.reason === 'unsupportedCapacityWorker',
    'CR-A2-001 unsupported exact worker is unknown');
  ok(unsupported.evidence[0].workerClass === 'Example.Namespace.CustomCapacityWorker',
    'CR-A2-002 unsupported worker identity is preserved');

  const emptyBody = {
    defName: 'FormEmpty',
    _completeness: 'complete',
    corePart: { def: 'NodeEmpty', parts: [] },
  };
  const emptyContext = Object.assign({}, baseContext, {
    bodyDef: emptyBody,
    bodyPartDefs: {
      NodeEmpty: { defName: 'NodeEmpty', tags: [], hitPoints: 10, _completeness: 'complete' },
    },
    partIndex: resolver.buildPartIndex(emptyBody),
  });
  const notApplicable = resolver.resolveCapacityWorker(
    capacity('PawnCapacityWorker_Sight'), emptyContext);
  ok(notApplicable.state === 'notApplicable',
    'CR-A7-001 complete positive metadata proves non-applicability');

  const partialBodyContext = Object.assign({}, emptyContext, {
    bodyDef: Object.assign({}, emptyBody, { _completeness: 'partial' }),
  });
  const partialNoTag = resolver.resolveCapacityWorker(
    capacity('PawnCapacityWorker_Sight'), partialBodyContext);
  ok(partialNoTag.state === 'unknown' && partialNoTag.reason === 'insufficientCapacityMetadata',
    'CR-A3-001 partial metadata cannot prove non-applicability');

  const partialPartDefs = Object.assign({}, workerPartDefs, {
    NodeXi: Object.assign({}, workerPartDefs.NodeXi, { _completeness: 'partial' }),
  });
  const partialPositive = resolver.resolveCapacityWorker(capacity('PawnCapacityWorker_Sight'),
    Object.assign({}, baseContext, { bodyPartDefs: partialPartDefs }));
  ok(partialPositive.state === 'unknown' && partialPositive.reason === 'insufficientCapacityMetadata',
    'CR-A3b-001 positive tag does not override incomplete relevant metadata');

  const sightPartIndex = workerIndex.find(part => part.defName === 'NodeXi').index;
  const hearingPartIndex = workerIndex.find(part => part.defName === 'NodePi').index;
  const unknownReplacement = {
    kind: 'replacement',
    replacementDef: 'OpaqueReplacement',
    joinState: 'resolved',
    partIdentity: { bodyDef: 'FormDelta', partIndex: sightPartIndex },
  };
  const unknownReplacementContext = Object.assign({}, baseContext, {
    joinedEvidence: [unknownReplacement],
  });
  const affectedSight = resolver.resolveCapacityWorker(
    capacity('PawnCapacityWorker_Sight'), unknownReplacementContext);
  ok(affectedSight.state === 'unknown' && affectedSight.reason === 'unknownPartEfficiency',
    'CR-A4-001 relevant unknown prosthetic efficiency is unknown');
  const unaffectedHearing = resolver.resolveCapacityWorker(
    capacity('PawnCapacityWorker_Hearing'), unknownReplacementContext);
  ok(unaffectedHearing.state === 'resolved' && unaffectedHearing.value === 1,
    'CR-A5-001 irrelevant unknown prosthetic does not poison hearing');

  const knownReplacementContext = Object.assign({}, baseContext, {
    joinedEvidence: [unknownReplacement],
    prostheticEfficiency: { OpaqueReplacement: { efficiency: 0.5 } },
  });
  const weightedSight = resolver.resolveCapacityWorker(
    capacity('PawnCapacityWorker_Sight'), knownReplacementContext);
  ok(weightedSight.state === 'resolved' && Math.abs(weightedSight.value - 0.875) < 1e-9,
    'CR-A4-002 sight uses audited best-part weight for known replacement');

  const missingHearing = {
    kind: 'missing',
    joinState: 'resolved',
    partIdentity: { bodyDef: 'FormDelta', partIndex: hearingPartIndex },
  };
  const hearingWithLoss = resolver.resolveCapacityWorker(capacity('PawnCapacityWorker_Hearing'),
    Object.assign({}, baseContext, { joinedEvidence: [missingHearing] }));
  ok(hearingWithLoss.state === 'resolved' && Math.abs(hearingWithLoss.value - 0.75) < 1e-9,
    'CR-D3-001 hearing uses audited best-part weight after one source is missing');

  const injury = {
    kind: 'hediff',
    hediffDef: 'OpaqueInjury',
    severity: 5,
    joinState: 'resolved',
    partIdentity: { bodyDef: 'FormDelta', partIndex: sightPartIndex },
  };
  const injuryContext = Object.assign({}, baseContext, {
    joinedEvidence: [injury],
    hediffCatalog: {
      OpaqueInjury: { def: 'OpaqueInjury', category: 'injury', _completeness: 'complete' },
    },
  });
  const injurySight = resolver.resolveCapacityWorker(
    capacity('PawnCapacityWorker_Sight'), injuryContext);
  ok(injurySight.state === 'unknown' && injurySight.reason === 'unknownPartEfficiency',
    'CR-A3-002 injury is unknown when rounded remaining-part-health inputs are absent');

  const missingLifeStage = resolver.resolveCapacityWorker(capacity('PawnCapacityWorker_Moving'),
    Object.assign({}, baseContext, { alwaysDowned: null }));
  ok(missingLifeStage.state === 'unknown' && missingLifeStage.reason === 'unknownLifeStageState',
    'CR-A3-003 Moving does not infer life-stage alwaysDowned from current status');

  const baseWorkerResult = resolver._resolved(1, [], []);
  const offsetBeforeFactor = resolver.applyCapMods(baseWorkerResult, { minValue: -1 }, [{
    mod: { offset: -1.2, postFactor: 0.5, setMax: null },
    evidence: [],
  }], {});
  ok(offsetBeforeFactor.state === 'resolved' && Math.abs(offsetBeforeFactor.value - (-0.1)) < 1e-9,
    'CR-E1-001 offsets are accumulated before the combined post-factor without an invented clamp');

  const setMaxAfterFactor = resolver.applyCapMods(resolver._resolved(2, [], []), { minValue: 0 }, [{
    mod: { offset: 1, postFactor: 2, setMax: 2.5 },
    evidence: [],
  }], {});
  ok(setMaxAfterFactor.value === 2.5, 'CR-E2-001 setMax applies after offsets and factors');

  const zeroSkipsMods = resolver.applyCapMods(resolver._resolved(0, [], []), { minValue: 0 }, [{
    mod: { offset: 5, postFactor: 3, setMax: 9 },
    evidence: [],
  }], {});
  ok(zeroSkipsMods.value === 0, 'CR-E3-001 modifiers do not apply to a non-positive worker result');

  const floorThenRound = resolver.applyCapMods(
    resolver._resolved(0.1, [], []), { minValue: 0.126 }, [], {});
  ok(floorThenRound.value === 0.13, 'CR-E4-001 minValue floor applies before hundredth rounding');
  ok(resolver._roundHundredth(1.125) === 1.12,
    'CR-E4-002 hundredth rounding follows target midpoint-to-even behaviour');

  const awakeCapacity = { minValue: 0.5, zeroIfCannotBeAwake: true };
  const awakeGate = resolver.applyCapMods(baseWorkerResult, awakeCapacity, [], {
    snapshotType: 'current', canBeAwake: false,
  });
  ok(awakeGate.value === 0, 'CR-E5-001 awake gate returns zero before minValue');
  const unknownAwake = resolver.applyCapMods(baseWorkerResult, awakeCapacity, [], {
    snapshotType: 'current', canBeAwake: null,
  });
  ok(unknownAwake.state === 'unknown' && unknownAwake.reason === 'unknownAwakeState',
    'CR-E5-002 missing CanBeAwake fact is unknown');
  const structuralAwake = resolver.applyCapMods(baseWorkerResult, awakeCapacity, [], {
    snapshotType: 'structural', canBeAwake: false,
  });
  ok(structuralAwake.value === 1, 'CR-E5-003 structural snapshot ignores temporary awake gate');

  const stagedCatalog = [{
    def: 'StagedCondition',
    _completeness: 'complete',
    capModStages: [
      { minSeverity: 0, capMods: [{ capacity: 'Sight', offset: -0.1, postFactor: null, setMax: null }] },
      { minSeverity: 0.5, capMods: [{ capacity: 'Sight', offset: -0.4, postFactor: null, setMax: null }] },
    ],
  }];
  const stagedEvidence = [{
    kind: 'hediff',
    hediffDef: 'StagedCondition',
    severity: 0.7,
    sourceObservationIndex: 17,
  }];
  const gatheredStage = resolver.gatherCapMods('Sight', stagedEvidence, stagedCatalog);
  ok(gatheredStage.state === 'resolved' && gatheredStage.modifiers.length === 1
    && gatheredStage.modifiers[0].mod.offset === -0.4,
  'CR-E2-002 highest stage threshold not exceeding severity is active');
  const stageEvidence = gatheredStage.modifiers[0].evidence[0];
  ok(stageEvidence.hediffDef === 'StagedCondition' && stageEvidence.sourceObservationIndex === 17
    && stageEvidence.stage === 1 && stageEvidence.modType === 'offset',
  'CR-E2-003 applied capMod retains stage and observation provenance');
  const unknownStage = resolver.gatherCapMods('Sight', [Object.assign({}, stagedEvidence[0], {
    severity: null,
  })], stagedCatalog);
  ok(unknownStage.state === 'unknown' && unknownStage.reason === 'unknownHediffSeverity',
    'CR-E2-004 unknown severity is not replaced with a guessed default');
  const scaledFactorCatalog = [{
    def: 'ScaledFactorCondition',
    _completeness: 'complete',
    capModStages: [{
      minSeverity: 0,
      capacityFactorEffectMultiplier: 'SyntheticStat',
      capMods: [{ capacity: 'Sight', offset: null, postFactor: 0.5, setMax: null }],
    }],
  }];
  const scaledFactor = resolver.gatherCapMods('Sight', [{
    hediffDef: 'ScaledFactorCondition', severity: 1, sourceObservationIndex: 18,
  }], scaledFactorCatalog);
  ok(scaledFactor.state === 'unknown' && scaledFactor.reason === 'unknownCapacityFactorMultiplier',
    'CR-E2-005 stat-scaled post-factor is unknown without the required live stat');

  const graphWorker = (dependencies, value) => ({
    dependencies,
    resolve(context) { return context.resolver._resolved(value, [], dependencies); },
  });
  const graphRegistry = {
    WorkerA: graphWorker(['B'], 1),
    WorkerB: graphWorker(['A'], 1),
    WorkerC: graphWorker(['A'], 1),
    WorkerD: graphWorker(['E'], 1),
    WorkerE: graphWorker(['F'], 1),
    WorkerF: graphWorker(['D'], 1),
    WorkerIndependent: graphWorker([], 0.8),
    WorkerUnsupportedDependent: graphWorker(['UnsupportedNode'], 1),
    WorkerMissingDependent: graphWorker(['AbsentNode'], 1),
    WorkerNotApplicableDependent: graphWorker(['NotApplicableNode'], 1),
    WorkerNotApplicable: {
      dependencies: [],
      resolve() {
        return {
          state: 'notApplicable', value: null, reason: 'fixtureNotApplicable',
          confidence: 'verified', evidence: [], derivedFrom: [],
        };
      },
    },
  };
  const graphDefs = {
    A: { defName: 'A', workerClass: 'WorkerA' },
    B: { defName: 'B', workerClass: 'WorkerB' },
    C: { defName: 'C', workerClass: 'WorkerC' },
    D: { defName: 'D', workerClass: 'WorkerD' },
    E: { defName: 'E', workerClass: 'WorkerE' },
    F: { defName: 'F', workerClass: 'WorkerF' },
    Independent: { defName: 'Independent', workerClass: 'WorkerIndependent' },
    UnsupportedDependent: { defName: 'UnsupportedDependent', workerClass: 'WorkerUnsupportedDependent' },
    UnsupportedNode: { defName: 'UnsupportedNode', workerClass: 'WorkerNotRegistered' },
    MissingDependent: { defName: 'MissingDependent', workerClass: 'WorkerMissingDependent' },
    NotApplicableDependent: { defName: 'NotApplicableDependent', workerClass: 'WorkerNotApplicableDependent' },
    NotApplicableNode: { defName: 'NotApplicableNode', workerClass: 'WorkerNotApplicable' },
  };
  const graph = resolver.resolveCapacityGraph(graphDefs, { joinedEvidence: [], hediffCatalog: [] }, {
    workerRegistry: graphRegistry,
    snapshotType: 'structural',
  });
  ok(graph.A.reason === 'cyclicDependency' && graph.B.reason === 'cyclicDependency',
    'CR-B3-001 every participant in a two-node cycle is cyclic');
  ok(graph.D.reason === 'cyclicDependency' && graph.E.reason === 'cyclicDependency'
    && graph.F.reason === 'cyclicDependency',
  'CR-B3-002 every participant in a three-node cycle is cyclic');
  ok(graph.C.reason === 'unresolvedDependency',
    'CR-B3-003 external dependant of cycle is unresolved, not cyclic');
  ok(graph.Independent.state === 'resolved' && graph.Independent.value === 0.8,
    'CR-B4-001 independent capacity is unaffected by cycles');
  ok(graph.UnsupportedNode.reason === 'unsupportedCapacityWorker'
    && graph.UnsupportedDependent.reason === 'unresolvedDependency',
  'CR-B1-001 unsupported required worker propagates only through its dependency chain');
  ok(graph.MissingDependent.reason === 'unresolvedDependency',
    'CR-B1-002 missing required capacity definition propagates unknown');
  ok(graph.NotApplicableNode.state === 'notApplicable'
    && graph.NotApplicableDependent.reason === 'unresolvedDependency',
  'CR-B1-003 required notApplicable dependency cannot be used as a numeric value');

  const snapshotPartition = resolver.classifyEvidenceForSnapshot([
    { persistence: 'persistent', marker: 'p' },
    { persistence: 'temporary', marker: 't' },
    { persistence: 'unknown', marker: 'u' },
  ]);
  ok(snapshotPartition.structuralEvidence.map(item => item.marker).join('') === 'p',
    'CR-C1-001 structural snapshot includes only proven persistent evidence');
  ok(snapshotPartition.currentEvidence.map(item => item.marker).join('') === 'ptu',
    'CR-C1-002 current snapshot includes every active observation');
  ok(snapshotPartition.unresolvedPersistenceEvidence.map(item => item.marker).join('') === 'u',
    'CR-C1-003 unknown persistence is retained separately for relevance checks');

  const orchestratorCapacityDefs = {
    Consciousness: { defName: 'Consciousness', workerClass: 'PawnCapacityWorker_Consciousness', minValue: 0 },
    Manipulation: {
      defName: 'Manipulation', workerClass: 'PawnCapacityWorker_Manipulation', minValue: 0,
      zeroIfCannotBeAwake: true,
    },
    Moving: {
      defName: 'Moving', workerClass: 'PawnCapacityWorker_Moving', minValue: 0,
      zeroIfCannotBeAwake: true,
    },
    Sight: { defName: 'Sight', workerClass: 'PawnCapacityWorker_Sight', minValue: 0 },
    Talking: {
      defName: 'Talking', workerClass: 'PawnCapacityWorker_Talking', minValue: 0,
      zeroIfCannotBeAwake: true,
    },
    Hearing: { defName: 'Hearing', workerClass: 'PawnCapacityWorker_Hearing', minValue: 0 },
    BloodPumping: { defName: 'BloodPumping', workerClass: 'PawnCapacityWorker_BloodPumping', minValue: 0 },
    Breathing: { defName: 'Breathing', workerClass: 'PawnCapacityWorker_Breathing', minValue: 0 },
    BloodFiltration: {
      defName: 'BloodFiltration', workerClass: 'PawnCapacityWorker_BloodFiltration', minValue: 0,
    },
    Mystery: { defName: 'Mystery', workerClass: 'Example.CustomWorker', minValue: 0 },
  };
  const orchestratorDefinitions = {
    raceBodyMap: {
      RaceDelta: { bodyDefName: 'FormDelta', _completeness: 'complete' },
    },
    bodyDefs: { FormDelta: workerBody },
    bodyPartDefs: workerPartDefs,
    capacityDefs: orchestratorCapacityDefs,
    hediffCatalog: [],
    prostheticEfficiency: {},
    completeness: {},
  };
  const orchestratorPawn = {
    pawnState: {
      raceDefName: 'RaceDelta',
      alwaysDowned: false,
      currentStatus: { canBeAwake: true, painTotal: 0 },
    },
    bodyEvidence: [],
  };
  const fullHealthy = resolver.resolvePawnCapacities(orchestratorPawn, orchestratorDefinitions);
  const publicCapacityKeys = ['consciousness', 'manipulation', 'moving', 'sight', 'talking', 'hearing'];
  for (let i = 0; i < publicCapacityKeys.length; i++) {
    const fact = fullHealthy.capacities[publicCapacityKeys[i]];
    ok(fact.structural.state === 'resolved' && fact.structural.value === 1,
      'CR-A1-00' + (i + 1) + ' synthetic non-human structural capacity resolves');
    ok(fact.current.state === 'resolved' && fact.current.value === 1,
      'CR-A1-01' + (i + 1) + ' synthetic non-human current capacity resolves');
  }
  ok(fullHealthy.capacities.mystery.structural.reason === 'unsupportedCapacityWorker'
    && fullHealthy.capacities.sight.structural.state === 'resolved',
  'CR-A2-003 unsupported capacity is isolated by the orchestrator');

  const cannotBeAwake = resolver.resolvePawnCapacities(Object.assign({}, orchestratorPawn, {
    pawnState: Object.assign({}, orchestratorPawn.pawnState, {
      alwaysDowned: null,
      currentStatus: { canBeAwake: false, painTotal: null },
    }),
  }), orchestratorDefinitions);
  ok(cannotBeAwake.capacities.moving.current.state === 'resolved'
    && cannotBeAwake.capacities.moving.current.value === 0,
  'CR-E5-004 graph applies awake gate before worker life-stage inputs');
  ok(cannotBeAwake.capacities.manipulation.current.value === 0
    && cannotBeAwake.capacities.talking.current.value === 0,
  'CR-E5-005 awake gate short-circuits worker dependencies');

  const capModCatalog = [{
    def: 'UncertainCondition',
    _completeness: 'complete',
    capModStages: [{
      minSeverity: 0,
      partEfficiencyOffset: null,
      partIgnoreMissingHP: null,
      capMods: [{ capacity: 'Sight', offset: -0.2, postFactor: null, setMax: null }],
    }],
  }];
  const capModObservation = {
    kind: 'hediff',
    hediffDef: 'UncertainCondition',
    severity: 1,
    rawPartIndex: null,
    bodyDefReference: 'unknown',
    persistence: 'unknown',
    sourceObservationIndex: 31,
  };
  const unknownCapMod = resolver.resolvePawnCapacities(
    Object.assign({}, orchestratorPawn, { bodyEvidence: [capModObservation] }),
    Object.assign({}, orchestratorDefinitions, { hediffCatalog: capModCatalog })
  );
  ok(unknownCapMod.capacities.sight.structural.reason === 'unresolvedPersistence',
    'CR-A6-001 unknown-persistence direct capMod blocks structural Sight');
  ok(unknownCapMod.capacities.sight.current.state === 'resolved'
    && unknownCapMod.capacities.sight.current.value === 0.8,
  'CR-A6-002 unknown-persistence direct capMod applies to current Sight');
  ok(unknownCapMod.capacities.hearing.structural.state === 'resolved'
    && unknownCapMod.capacities.hearing.structural.value === 1,
  'CR-A6-003 direct Sight capMod does not poison unrelated Hearing');

  const temporaryCapMod = resolver.resolvePawnCapacities(
    Object.assign({}, orchestratorPawn, {
      bodyEvidence: [Object.assign({}, capModObservation, { persistence: 'temporary' })],
    }),
    Object.assign({}, orchestratorDefinitions, { hediffCatalog: capModCatalog })
  );
  ok(temporaryCapMod.capacities.sight.structural.value === 1
    && temporaryCapMod.capacities.sight.current.value === 0.8,
  'CR-C2-001 explicitly temporary capMod affects current only');

  const persistentCapMod = resolver.resolvePawnCapacities(
    Object.assign({}, orchestratorPawn, {
      bodyEvidence: [Object.assign({}, capModObservation, { persistence: 'persistent' })],
    }),
    Object.assign({}, orchestratorDefinitions, { hediffCatalog: capModCatalog })
  );
  ok(persistentCapMod.capacities.sight.structural.value === 0.8
    && persistentCapMod.capacities.sight.current.value === 0.8,
  'CR-C3-001 persistent capMod runs through the same worker pipeline in both snapshots');

  const localCatalog = [{
    def: 'LocalCondition',
    category: 'condition',
    _completeness: 'complete',
    capModStages: [{
      minSeverity: 0,
      partEfficiencyOffset: -0.5,
      partIgnoreMissingHP: false,
      capMods: [],
    }],
  }];
  const localObservation = {
    kind: 'hediff',
    hediffDef: 'LocalCondition',
    severity: 1,
    rawPartIndex: sightPartIndex,
    bodyDefName: 'FormDelta',
    bodyDefReference: 'explicit',
    persistence: 'unknown',
    sourceObservationIndex: 32,
    provenance: { sourceKind: 'healthSnapshot', sourceId: 'LocalCondition' },
  };
  const relevantLocal = resolver.resolvePawnCapacities(
    Object.assign({}, orchestratorPawn, { bodyEvidence: [localObservation] }),
    Object.assign({}, orchestratorDefinitions, { hediffCatalog: localCatalog })
  );
  ok(relevantLocal.capacities.sight.structural.reason === 'unresolvedPersistence',
    'CR-A6-004 unknown persistence on a consumed part blocks structural capacity');
  ok(relevantLocal.capacities.sight.current.state === 'resolved'
    && relevantLocal.capacities.sight.current.value === 0.88,
  'CR-A6-005 current snapshot applies relevant local part efficiency evidence');
  const partContribution = relevantLocal.capacities.sight.current.evidence
    .find(item => item.kind === 'partContribution' && item.partIndex === sightPartIndex);
  ok(partContribution && partContribution.sourceRef.sourceObservationIndex === 32
    && partContribution.sourceRef.bodyDef === 'FormDelta',
  'CR-A6-006 part provenance uses BodyDef, raw index and source observation');

  const irrelevantLocal = resolver.resolvePawnCapacities(
    Object.assign({}, orchestratorPawn, {
      bodyEvidence: [Object.assign({}, localObservation, { rawPartIndex: hearingPartIndex })],
    }),
    Object.assign({}, orchestratorDefinitions, { hediffCatalog: localCatalog })
  );
  ok(irrelevantLocal.capacities.sight.structural.state === 'resolved'
    && irrelevantLocal.capacities.sight.current.state === 'resolved'
    && irrelevantLocal.capacities.sight.current.value === 1,
  'CR-A6-007 unknown persistence on an irrelevant part does not poison Sight');

  const replacementCatalog = [{
    def: 'KnownReplacement', category: 'implant', _completeness: 'complete',
  }];
  const replacementObservation = {
    kind: 'replacement',
    replacementDef: 'KnownReplacement',
    rawPartIndex: sightPartIndex,
    bodyDefName: 'FormDelta',
    bodyDefReference: 'explicit',
    persistence: 'persistent',
    sourceObservationIndex: 33,
  };
  const explicitProsthetic = resolver.resolvePawnCapacities(
    Object.assign({}, orchestratorPawn, { bodyEvidence: [replacementObservation] }),
    Object.assign({}, orchestratorDefinitions, {
      hediffCatalog: replacementCatalog,
      prostheticEfficiency: { KnownReplacement: { efficiency: 0.5 } },
    })
  );
  ok(explicitProsthetic.capacities.sight.structural.value === 0.88
    && explicitProsthetic.capacities.sight.current.value === 0.88,
  'CR-C4-001 explicit prosthetic definitions flow through both snapshot calculations');

  const bodyUnknownResult = resolver.resolvePawnCapacities({
    pawnState: { raceDefName: 'AbsentRace', currentStatus: {} },
    bodyEvidence: [],
  }, orchestratorDefinitions);
  ok(bodyUnknownResult.bodyIdentity.state === 'unknown'
    && bodyUnknownResult.capacities.sight.structural.reason === 'bodyIdentityUnknown',
  'CR-A8-004 missing body identity makes capacity facts explicitly unknown');

  const source = fs.readFileSync(path.join(__dirname, '..', 'files', 'capacity-resolver.js'), 'utf8');
  ok(!/raceDefName\s*={2,3}\s*['"]/.test(source), 'CR-F3-009 resolver has no race-name equality branch');
  ok(!/bodyDefName\s*={2,3}\s*['"]/.test(source), 'CR-F3-010 resolver has no body-name equality branch');

  return { name: 'C3 capacity resolver', total, failures };
};

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
    NodeAlpha: ['ConsciousnessSource', 'Pelvis', 'Spine'],
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

  const source = fs.readFileSync(path.join(__dirname, '..', 'files', 'capacity-resolver.js'), 'utf8');
  ok(!/raceDefName\s*={2,3}\s*['"]/.test(source), 'CR-F3-009 resolver has no race-name equality branch');
  ok(!/bodyDefName\s*={2,3}\s*['"]/.test(source), 'CR-F3-010 resolver has no body-name equality branch');

  return { name: 'C3 capacity resolver', total, failures };
};

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

  const source = fs.readFileSync(path.join(__dirname, '..', 'files', 'capacity-resolver.js'), 'utf8');
  ok(!/raceDefName\s*={2,3}\s*['"]/.test(source), 'CR-F3-009 resolver has no race-name equality branch');
  ok(!/bodyDefName\s*={2,3}\s*['"]/.test(source), 'CR-F3-010 resolver has no body-name equality branch');

  return { name: 'C3 capacity resolver', total, failures };
};

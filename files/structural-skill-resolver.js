/** C5 exact structural SkillFact resolver. */
const StructuralSkillResolver = (() => {
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!value || typeof value !== 'object') return value;
    const output = {};
    for (const key of Object.keys(value)) output[key] = clone(value[key]);
    return output;
  }

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const key of Object.keys(value)) freeze(value[key]);
    return Object.freeze(value);
  }

  function unknownNumber(evidence) {
    return { state: 'unknown', value: null, evidence: clone(evidence || []) };
  }

  function diagnostic(source) {
    if (!source || source.state !== 'known') {
      return { state: 'unknown', evidence: clone(source && source.evidence || []),
        unresolved: clone(source && source.unresolved || []) };
    }
    return { state: source.value === true ? 'true' : 'false',
      evidence: clone(source.evidence || []), unresolved: clone(source.unresolved || []) };
  }

  function deriveDisablement(pawnEvidence, policy, explicit) {
    if (explicit && explicit.state === 'known') return diagnostic(explicit);
    if (policy && policy.neverDisabledBasedOnWorkTypes === true) {
      return { state: 'false', evidence: [], unresolved: [] };
    }
    const disablingTags = new Set(policy && policy.disablingWorkTags || []);
    const matches = (pawnEvidence.effects || []).filter(effect => effect
      && effect.type === 'disableWorkTag'
      && (effect.target === 'AllWork' || disablingTags.has(effect.target)));
    if (matches.length) {
      return {
        state: 'true',
        evidence: matches.map(effect => ({
          evidenceId: effect.evidenceId || null,
          sourceFactKey: effect.sourceFactKey || effect.evidenceId || null,
          sourceKind: effect.provenance && effect.provenance.sourceKind || 'permission',
          sourceId: effect.provenance && effect.provenance.sourceId || null,
          targetDefId: effect.target || null,
          representation: effect.representation || 'canonicalExact',
          provenance: clone(effect.provenance || {}),
          confidence: effect.confidence || 'unknown',
        })),
        unresolved: [],
      };
    }
    return diagnostic(explicit);
  }

  function notApplicable(runtimeVersion) {
    const disabled = { state: 'unknown', evidence: [], unresolved: [] };
    return freeze({
      schemaVersion: 1, state: 'notApplicable', completeness: null,
      confidence: 'verified', appSkillId: null, skillDefId: null,
      recordPresence: 'unknown', storedLevelInt: unknownNumber([]),
      runtimeAptitude: { state: 'unknown', value: null, contributions: [], unresolved: [] },
      levelIgnoringDisable: null,
      bounds: { state: 'unknown', min: null, max: null,
        runtimeVersion: runtimeVersion || null, provenance: null },
      totalDisablement: clone(disabled), permanentDisablement: clone(disabled),
      runtimeGetLevelProjection: null, runtimeGetLevelForUIProjection: null,
      evidence: [], unresolved: [],
    });
  }

  function unresolved(reasonCode, skillDefId, operation) {
    return {
      reasonCode,
      message: reasonCode,
      affectedDimension: 'skill',
      targetDefId: skillDefId,
      candidateTargetDefIds: [],
      operationId: operation && operation.operationId || null,
      evidence: clone(operation && operation.evidence || []),
    };
  }

  function resolve(context, skillDefId) {
    const snapshot = context && context.effectivenessSnapshot;
    const runtimeVersion = snapshot && snapshot.runtimeVersion || null;
    if (skillDefId == null) return notApplicable(runtimeVersion);
    const policy = snapshot && snapshot.skillPolicies
      ? snapshot.skillPolicies[skillDefId] : null;
    const pawnEvidence = context && context.pawnEvidence || {};
    const pawnState = pawnEvidence.pawnState || {};
    const raw = pawnState.baseSkillFacts && pawnState.baseSkillFacts[skillDefId];
    const resultUnresolved = [];
    let recordPresence = 'unknown';
    let stored = unknownNumber(raw && raw.evidence);

    if (raw && raw.recordPresence === 'present') {
      recordPresence = 'present';
      if (raw.storedLevelInt && raw.storedLevelInt.state === 'known'
        && Number.isFinite(raw.storedLevelInt.value)) {
        stored = { state: 'known', value: Math.trunc(raw.storedLevelInt.value),
          evidence: clone(raw.storedLevelInt.evidence || raw.evidence || []) };
      } else if (raw.levelFieldPresent === false) {
        stored = { state: 'known', value: 0, evidence: clone(raw.evidence || []) };
      } else {
        resultUnresolved.push(unresolved('storedLevelUnknown', skillDefId));
      }
    } else if (raw && raw.recordPresence === 'absent'
      && policy && policy.catalogueCompleteness === 'complete') {
      recordPresence = 'runtimeDefaulted';
      stored = { state: 'known', value: 0, evidence: clone(raw.evidence || []) };
    } else {
      resultUnresolved.push(unresolved(raw && raw.recordPresence === 'absent'
        ? 'skillCatalogueIncomplete' : 'skillRecordPresenceUnknown', skillDefId));
    }

    const contributions = [];
    const aptitudeUnresolved = [];
    for (const operation of pawnEvidence.skillOperations || []) {
      if (!operation || operation.skillDefId !== skillDefId) continue;
      if (operation.kind === 'unknownSkillOperation') {
        aptitudeUnresolved.push(unresolved('runtimeAptitudeUnknown', skillDefId, operation));
        continue;
      }
      if (operation.kind !== 'runtimeAptitudeOffset') continue;
      if (operation.compatibilityOnly === true || operation.superseded === true) continue;
      if (operation.applicability === 'inapplicable') continue;
      if (operation.applicability !== 'applicable' || operation.canonicalEligible !== true
        || !Number.isFinite(operation.value) || operation.completeness !== 'complete') {
        aptitudeUnresolved.push(unresolved('runtimeAptitudeUnknown', skillDefId, operation));
        continue;
      }
      contributions.push(clone(operation));
    }
    const aptitudeKnown = aptitudeUnresolved.length === 0;
    const aptitudeValue = aptitudeKnown
      ? contributions.reduce((sum, operation) => sum + operation.value, 0) : null;
    const runtimeAptitude = {
      state: aptitudeKnown ? 'resolved' : 'partial',
      value: aptitudeValue,
      contributions,
      unresolved: aptitudeUnresolved,
    };

    const boundsKnown = policy && Number.isFinite(policy.minLevel)
      && Number.isFinite(policy.maxLevel);
    const bounds = boundsKnown ? {
      state: 'known', min: policy.minLevel, max: policy.maxLevel,
      runtimeVersion: policy.runtimeVersion || runtimeVersion,
      provenance: clone(policy.provenance || null),
    } : { state: 'unknown', min: null, max: null,
      runtimeVersion, provenance: null };
    if (!boundsKnown) resultUnresolved.push(unresolved('skillBoundsUnknown', skillDefId));
    const levelIgnoringDisable = stored.state === 'known' && aptitudeKnown && boundsKnown
      ? Math.max(bounds.min, Math.min(bounds.max, stored.value + aptitudeValue)) : null;

    const disablement = pawnEvidence.skillDisablementFacts
      && pawnEvidence.skillDisablementFacts[skillDefId] || {};
    const totalDisablement = deriveDisablement(pawnEvidence, policy, disablement.total);
    const permanentDisablement = diagnostic(disablement.permanent);
    const runtimeGetLevelProjection = levelIgnoringDisable == null ? null
      : totalDisablement.state === 'true' ? 0
      : totalDisablement.state === 'false' ? levelIgnoringDisable : null;
    const runtimeGetLevelForUIProjection = levelIgnoringDisable == null ? null
      : permanentDisablement.state === 'true' ? 0
      : permanentDisablement.state === 'false' ? levelIgnoringDisable : null;
    const combinedUnresolved = resultUnresolved.concat(aptitudeUnresolved);
    const state = stored.state !== 'known' || !boundsKnown ? 'unknown'
      : aptitudeKnown ? 'resolved' : 'partial';
    return freeze({
      schemaVersion: 1,
      state,
      completeness: state === 'resolved' ? 'complete'
        : state === 'partial' ? 'partial' : 'unknown',
      confidence: state === 'resolved' ? 'verified'
        : state === 'partial' ? 'unknown' : 'unknown',
      appSkillId: policy && policy.appSkillId || null,
      skillDefId,
      recordPresence,
      storedLevelInt: stored,
      runtimeAptitude,
      levelIgnoringDisable,
      bounds,
      totalDisablement,
      permanentDisablement,
      runtimeGetLevelProjection,
      runtimeGetLevelForUIProjection,
      evidence: clone([].concat(raw && raw.evidence || [],
        contributions.flatMap(operation => operation.evidence || []))),
      unresolved: combinedUnresolved,
    });
  }

  return Object.freeze({ resolve });
})();

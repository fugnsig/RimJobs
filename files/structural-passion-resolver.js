/** C5 exact structural PassionFact resolver. */
const StructuralPassionResolver = (() => {
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

  function unknown(reasonCode, skillDefId, rawIdentity, recordPresence, evidence) {
    return freeze({
      schemaVersion: 1, state: 'unknown', completeness: 'unknown', confidence: 'unknown',
      skillDefId, recordPresence, rawIdentity, semantics: null,
      directLearningFactor: null, compatibilityBucket: null,
      evidence: clone(evidence || []),
      unresolved: [{ reasonCode, message: reasonCode, affectedDimension: 'passion',
        targetDefId: skillDefId, candidateTargetDefIds: [], operationId: null,
        evidence: clone(evidence || []) }],
    });
  }

  function notApplicable(runtimeVersion) {
    return freeze({
      schemaVersion: 1, runtimeVersion: runtimeVersion || null,
      state: 'notApplicable', completeness: null, confidence: 'verified',
      skillDefId: null, recordPresence: 'unknown', rawIdentity: null,
      semantics: null, directLearningFactor: null, compatibilityBucket: null,
      evidence: [], unresolved: [],
    });
  }

  function resolve(context, skillDefId) {
    const snapshot = context && context.effectivenessSnapshot;
    if (skillDefId == null) return notApplicable(snapshot && snapshot.runtimeVersion);
    const policy = snapshot && snapshot.skillPolicies
      ? snapshot.skillPolicies[skillDefId] : null;
    const pawnState = context && context.pawnEvidence
      && context.pawnEvidence.pawnState || {};
    const raw = pawnState.passionFacts && pawnState.passionFacts[skillDefId];
    let recordPresence = 'unknown';
    let rawIdentity = null;
    const evidence = clone(raw && raw.evidence || []);

    if (raw && raw.recordPresence === 'present') {
      recordPresence = 'present';
      if (raw.state === 'known' && typeof raw.rawIdentity === 'string') {
        rawIdentity = raw.rawIdentity;
      } else if (raw.passionFieldPresent === false) {
        rawIdentity = 'None';
      } else {
        return unknown('passionIdentityUnknown', skillDefId, null, recordPresence, evidence);
      }
    } else if (raw && raw.recordPresence === 'absent'
      && policy && policy.catalogueCompleteness === 'complete') {
      recordPresence = 'runtimeDefaulted';
      rawIdentity = 'None';
    } else {
      return unknown(raw && raw.recordPresence === 'absent'
        ? 'skillCatalogueIncomplete' : 'skillRecordPresenceUnknown',
      skillDefId, null, 'unknown', evidence);
    }

    const providers = snapshot && snapshot.passionProviders || {};
    const vanilla = providers.vanilla && providers.vanilla.entries
      && providers.vanilla.entries[rawIdentity];
    if (vanilla && Number.isFinite(vanilla.directLearningFactor)) {
      const semantics = {
        providerId: providers.vanilla.providerId || 'rimworld-vanilla',
        providerFingerprint: providers.vanilla.runtimeFingerprint || '',
        directLearningFactor: vanilla.directLearningFactor,
        compatibilityBucket: Number.isInteger(vanilla.compatibilityBucket)
          ? vanilla.compatibilityBucket : null,
        isBad: typeof vanilla.isBad === 'boolean' ? vanilla.isBad : null,
        confidence: 'verified',
      };
      return freeze({
        schemaVersion: 1, state: 'resolved', completeness: 'complete',
        confidence: 'verified', skillDefId, recordPresence, rawIdentity,
        semantics,
        directLearningFactor: semantics.directLearningFactor,
        compatibilityBucket: semantics.compatibilityBucket,
        evidence, unresolved: [],
      });
    }

    const extension = providers.extensions && providers.extensions[rawIdentity];
    const semantics = extension && extension.semantics;
    const fingerprintsMatch = extension && extension.providerFingerprint
      && extension.runtimeFingerprint
      && extension.providerFingerprint === providers.providerFingerprint
      && extension.runtimeFingerprint === providers.runtimeFingerprint;
    const proof = extension && extension.semanticProof;
    const semanticsProven = proof && proof.activePackage === true
      && proof.definitionSelectionComplete === true
      && proof.runtimeIntegrationActive === true
      && proof.fieldsSupported === true
      && proof.identityUnambiguous === true;
    if (semantics && fingerprintsMatch && semanticsProven
      && Number.isFinite(semantics.directLearningFactor)) {
      const exact = Object.assign(clone(semantics), { confidence: 'verified' });
      return freeze({
        schemaVersion: 1, state: 'resolved', completeness: 'complete',
        confidence: 'verified', skillDefId, recordPresence, rawIdentity,
        semantics: exact, directLearningFactor: exact.directLearningFactor,
        compatibilityBucket: Number.isInteger(exact.compatibilityBucket)
          ? exact.compatibilityBucket : null,
        evidence, unresolved: [],
      });
    }
    return unknown('unsupportedPassionSemantics', skillDefId,
      rawIdentity, recordPresence, evidence);
  }

  return Object.freeze({ resolve });
})();

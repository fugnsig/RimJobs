/** C5 immutable request-scoped structural-effectiveness context. */
const StructuralEffectivenessContext = (() => {
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

  function immutable(value) {
    return value && Object.isFrozen(value) ? value : freeze(clone(value));
  }

  function fromResolved(inputs) {
    const source = inputs || {};
    const snapshot = immutable(source.effectivenessSnapshot || null);
    return freeze({
      schemaVersion: 1,
      runtimeVersion: snapshot && snapshot.runtimeVersion || null,
      pawnId: source.pawnId == null ? null : String(source.pawnId),
      pawnEvidence: immutable(source.pawnEvidence || {}),
      structuralCapacities: immutable(source.structuralCapacities || {}),
      c4RequirementSnapshot: immutable(source.c4RequirementSnapshot || null),
      effectivenessSnapshot: snapshot,
      capturedAtSaveSnapshot: true,
    });
  }

  function create(inputs) {
    const source = inputs || {};
    const pawn = source.pawn || null;
    const snapshot = source.effectivenessSnapshot || null;
    const evidenceOptions = Object.assign({
      effectivenessSourceCatalogues: snapshot ? {
        sourceOperations: snapshot.sourceOperationCatalogues || {},
        sourceFamilyCompleteness: source.sourceFamilyCompleteness || {},
      } : null,
      structuralPropertyProviders: source.structuralPropertyProviders || {},
      activePackageIds: snapshot && snapshot.activePackageResolution || null,
      scenarioProvider: source.scenarioProvider || null,
    }, source.evidenceOptions || {});
    const pawnEvidence = CapabilityEvidence.collectPawnEvidence(pawn, evidenceOptions);
    const structuralCapacities = CapacityResolver.resolvePawnCapacities(
      pawnEvidence, source.capabilityDefinitions || {});
    return fromResolved({
      pawnId: pawn && pawn.id != null ? pawn.id : null,
      pawnEvidence,
      structuralCapacities,
      c4RequirementSnapshot: source.c4RequirementSnapshot || null,
      effectivenessSnapshot: snapshot,
    });
  }

  return Object.freeze({ create, fromResolved, _deepFreeze: freeze });
})();

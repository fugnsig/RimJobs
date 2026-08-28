/** Request-scoped C7 orchestration over canonical C2-C6 facts. */
const C7EvaluationCoordinator = (() => {
  function unknownStatusFact(statusId) {
    return { statusId, state: 'unknown', value: null, evidence: [] };
  }

  function jobIdOf(job) {
    if (typeof job === 'string') return job;
    return job && job.id != null ? String(job.id) : '';
  }

  function createPawnContext(pawn, options) {
    const sourcePawn = pawn || {};
    const source = options || {};
    const pawnId = sourcePawn.id == null ? null : String(sourcePawn.id);
    const evidenceOptions = source.evidenceOptions || {};
    const definitions = source.capabilityDefinitions || {};

    const pawnEvidence = CapabilityEvidence.collectPawnEvidence(sourcePawn, evidenceOptions);
    const structuralCapacities = CapacityResolver.resolvePawnCapacities(
      pawnEvidence, definitions);

    const parsedFacts = pawnEvidence.pawnState
      && pawnEvidence.pawnState.currentStatusFacts
      ? pawnEvidence.pawnState.currentStatusFacts : {};
    const statusIds = ['downed', 'inMentalState', 'mentalBreak', 'deactivated',
      'unconscious', 'canBeAwake'];
    const rawStatusFacts = {};
    for (const statusId of statusIds) {
      rawStatusFacts[statusId] = parsedFacts[statusId]
        ? Object.assign({}, parsedFacts[statusId]) : unknownStatusFact(statusId);
    }
    const statusFacts = C4EvaluationContext._deriveAwakeFacts(
      rawStatusFacts, pawnEvidence, structuralCapacities, definitions);

    StructuralEffectivenessContext._deepFreeze(pawnEvidence);
    StructuralEffectivenessContext._deepFreeze(structuralCapacities);
    StructuralEffectivenessContext._deepFreeze(statusFacts);

    const resolverContext = Object.freeze({
      pawnId,
      evidence: pawnEvidence,
      capacities: structuralCapacities,
      statusFacts,
      definitionSnapshot: source.definitionSnapshot || null,
    });
    const c5Context = StructuralEffectivenessContext.fromResolved({
      pawnId,
      pawnEvidence,
      structuralCapacities,
      c4RequirementSnapshot: source.c4RequirementSnapshot || source.definitionSnapshot || null,
      effectivenessSnapshot: source.effectivenessSnapshot || null,
    });

    const permissionMemo = Object.create(null);
    const availabilityMemo = Object.create(null);
    let resolvedTemporalProfile = null;
    let temporalProfileResolved = false;

    function permission(job) {
      const jobId = jobIdOf(job);
      if (!Object.prototype.hasOwnProperty.call(permissionMemo, jobId)) {
        permissionMemo[jobId] = PermissionResolver.resolve(resolverContext, jobId);
      }
      return permissionMemo[jobId];
    }

    function availability(job) {
      const jobId = jobIdOf(job);
      if (!Object.prototype.hasOwnProperty.call(availabilityMemo, jobId)) {
        availabilityMemo[jobId] = AvailabilityResolver.resolve(resolverContext, jobId);
      }
      return availabilityMemo[jobId];
    }

    function temporalProfile() {
      if (!temporalProfileResolved) {
        resolvedTemporalProfile = TemporalProfileResolver.resolve(c5Context);
        temporalProfileResolved = true;
      }
      return resolvedTemporalProfile;
    }

    function legacyShadow(job) {
      const legacyPermission = C4LegacyCompatibility.evaluateLegacyPermission(sourcePawn, job);
      const legacyIncapable = C4LegacyCompatibility.evaluateLegacyIncapable(sourcePawn, job);
      return C4LegacyCompatibility.compare({
        permission: permission(job),
        availability: availability(job),
        legacy: {
          permission: legacyPermission,
          incapable: legacyIncapable,
        },
      });
    }

    return Object.freeze({
      pawnId,
      pawnEvidence,
      structuralCapacities,
      c5Context,
      permission,
      availability,
      temporalProfile,
      legacyShadow,
    });
  }

  return Object.freeze({ createPawnContext });
})();

/** Request-scoped immutable C4 evaluation context. */
const C4EvaluationContext = (() => {
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!value || typeof value !== 'object') return value;
    const out = {};
    for (const key of Object.keys(value)) out[key] = clone(value[key]);
    return out;
  }

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const key of Object.keys(value)) freeze(value[key]);
    return Object.freeze(value);
  }

  function unknownFact(statusId) {
    return { statusId, state: 'unknown', value: null, evidence: [] };
  }

  function findCurrentCapacity(capacityResult, defName) {
    const table = capacityResult && capacityResult.capacities ? capacityResult.capacities : {};
    for (const value of Object.values(table)) {
      if (value && value.capacity === defName) return value.current || null;
    }
    return null;
  }

  function deriveAwakeFacts(statusFacts, evidence, capacities, definitions) {
    const result = clone(statusFacts);
    const raceDefName = evidence && evidence.pawnState ? evidence.pawnState.raceDefName : null;
    const raceMap = definitions && definitions.raceBodyMap ? definitions.raceBodyMap : {};
    const raceEntry = raceDefName ? raceMap[raceDefName] : null;
    const alwaysAwakeKnown = raceEntry && typeof raceEntry.alwaysAwake === 'boolean'
      && (raceEntry.alwaysAwakeCompleteness == null || raceEntry.alwaysAwakeCompleteness === 'complete');
    const consciousness = findCurrentCapacity(capacities, 'Consciousness');
    const consciousnessKnown = consciousness && consciousness.state === 'resolved'
      && Number.isFinite(consciousness.value);
    let awakeBase = null;
    if (alwaysAwakeKnown && raceEntry.alwaysAwake === true) awakeBase = true;
    else if (consciousnessKnown && consciousness.value >= 0.3) awakeBase = true;
    else if (alwaysAwakeKnown && raceEntry.alwaysAwake === false && consciousnessKnown) awakeBase = false;

    const deactivated = result.deactivated || unknownFact('deactivated');
    let canBeAwake = null;
    if (awakeBase === false || (deactivated.state === 'known' && deactivated.value === true)) {
      canBeAwake = false;
    } else if (awakeBase === true && deactivated.state === 'known') {
      canBeAwake = deactivated.value === false;
    }
    const derivationEvidence = [{ kind: 'derivedRuntimePredicate', sourceField: 'PawnCapacityUtility.CanBeAwake' }];
    result.canBeAwake = canBeAwake == null
      ? unknownFact('canBeAwake')
      : { statusId: 'canBeAwake', state: 'known', value: canBeAwake, evidence: derivationEvidence.slice() };
    result.unconscious = canBeAwake == null
      ? unknownFact('unconscious')
      : { statusId: 'unconscious', state: 'known', value: !canBeAwake, evidence: derivationEvidence.slice() };
    return result;
  }

  function create(inputs) {
    const source = inputs || {};
    const pawn = source.pawn || null;
    const evidenceRaw = CapabilityEvidence.collectPawnEvidence(pawn);
    const evidence = clone(evidenceRaw);
    const definitions = source.capabilityDefinitions || {};
    const capacitiesRaw = CapacityResolver.resolvePawnCapacities(evidenceRaw, definitions);
    const capacities = clone(capacitiesRaw);
    const parsedFacts = evidence.pawnState && evidence.pawnState.currentStatusFacts
      ? evidence.pawnState.currentStatusFacts : {};
    const statusIds = ['downed', 'inMentalState', 'mentalBreak', 'deactivated',
      'unconscious', 'canBeAwake'];
    const statusFacts = {};
    for (const statusId of statusIds) {
      statusFacts[statusId] = parsedFacts[statusId]
        ? clone(parsedFacts[statusId]) : unknownFact(statusId);
    }
    const derivedStatusFacts = deriveAwakeFacts(statusFacts, evidence, capacities, definitions);
    const definitionSnapshot = source.definitionSnapshot && Object.isFrozen(source.definitionSnapshot)
      ? source.definitionSnapshot : clone(source.definitionSnapshot || null);
    return freeze({
      pawnId: pawn && pawn.id != null ? String(pawn.id) : null,
      evidence,
      capacities,
      statusFacts: derivedStatusFacts,
      definitionSnapshot,
    });
  }

  return Object.freeze({ create, _deriveAwakeFacts: deriveAwakeFacts });
})();

/** C5 structural direct and ordinary learning facts. */
const StructuralLearningResolver = (() => {
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

  function distinctEvidence(groups) {
    const output = [];
    const keys = new Set();
    for (const item of groups.flat()) {
      const key = item && item.evidenceId || JSON.stringify(item);
      if (keys.has(key)) continue;
      keys.add(key);
      output.push(clone(item));
    }
    return output;
  }

  function numericStat(fact) {
    if (!fact || fact.frontierIndex != null || !Number.isFinite(fact.resolvedPrefixValue)) {
      return false;
    }
    return fact.numericClaim === 'exactRuntimeDurableValue'
      || fact.numericClaim === 'exactAgainstRoundedC3CapacityInput';
  }

  function notApplicable(runtimeVersion) {
    return freeze({
      schemaVersion: 1, runtimeVersion: runtimeVersion || null,
      state: 'notApplicable', completeness: null, confidence: 'verified',
      skillDefId: null, passionSkillDefId: null, directLearningFactor: null,
      globalLearningFactor: null, animalsLearningFactor: null,
      structuralLearningFactor: null,
      currentSaturation: { state: 'notEvaluated' },
      debugFastLearning: { state: 'notEvaluated' },
      currentLearningFactor: { state: 'notEvaluated', value: null },
      evidence: [], unresolved: [],
    });
  }

  function resolve(context, skillDefId, suppliedPassionFact) {
    const runtimeVersion = context && context.effectivenessSnapshot
      && context.effectivenessSnapshot.runtimeVersion || context && context.runtimeVersion || null;
    if (skillDefId == null) return notApplicable(runtimeVersion);

    const passionFact = suppliedPassionFact
      || StructuralPassionResolver.resolve(context, skillDefId);
    const globalLearningFactor = StructuralStatResolver.resolve(
      context, 'GlobalLearningFactor');
    const animalsLearningFactor = skillDefId === 'Animals'
      ? StructuralStatResolver.resolve(context, 'AnimalsLearningFactor') : null;
    const directKnown = passionFact && passionFact.state === 'resolved'
      && passionFact.completeness === 'complete'
      && Number.isFinite(passionFact.directLearningFactor);
    const directLearningFactor = directKnown ? passionFact.directLearningFactor : null;
    const requiredStats = animalsLearningFactor
      ? [globalLearningFactor, animalsLearningFactor] : [globalLearningFactor];
    const structuralKnown = directKnown && requiredStats.every(numericStat);
    const structuralLearningFactor = structuralKnown
      ? requiredStats.reduce((value, fact) => value * fact.resolvedPrefixValue,
        directLearningFactor)
      : null;
    const fullyResolved = structuralKnown
      && requiredStats.every(fact => fact.state === 'resolved'
        && fact.completeness === 'complete');
    const hasKnownDimension = directKnown || requiredStats.some(numericStat);
    const state = fullyResolved ? 'resolved' : hasKnownDimension ? 'partial' : 'unknown';
    const unresolved = [];
    for (const source of [passionFact, ...requiredStats]) {
      for (const item of source && source.unresolved || []) unresolved.push(clone(item));
    }
    if (!directKnown && !unresolved.some(item => item.affectedDimension === 'passion')) {
      unresolved.push({ reasonCode: 'passionSemanticsUnknown',
        message: 'passionSemanticsUnknown', affectedDimension: 'learning',
        targetDefId: skillDefId, candidateTargetDefIds: [], operationId: null,
        evidence: clone(passionFact && passionFact.evidence || []) });
    }

    return freeze({
      schemaVersion: 1, runtimeVersion,
      state, completeness: state === 'resolved' ? 'complete'
        : state === 'partial' ? 'partial' : 'unknown',
      confidence: hasKnownDimension ? 'derived' : 'unknown',
      skillDefId, passionSkillDefId: skillDefId, directLearningFactor,
      globalLearningFactor, animalsLearningFactor, structuralLearningFactor,
      currentSaturation: { state: 'notEvaluated' },
      debugFastLearning: { state: 'notEvaluated' },
      currentLearningFactor: { state: 'notEvaluated', value: null },
      evidence: distinctEvidence([
        passionFact && passionFact.evidence || [],
        globalLearningFactor && globalLearningFactor.evidence || [],
        animalsLearningFactor && animalsLearningFactor.evidence || [],
      ]),
      unresolved,
    });
  }

  return Object.freeze({ resolve });
})();

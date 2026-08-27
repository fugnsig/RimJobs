/** C5 plural structural job and execution-facet report assembler. */
const StructuralEffectivenessResolver = (() => {
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

  function unresolved(items, dimension, targetDefId) {
    return (items || []).map(item => typeof item === 'string' ? {
      reasonCode: item, message: item, affectedDimension: dimension,
      targetDefId: targetDefId || null, candidateTargetDefIds: [],
      operationId: null, evidence: [],
    } : clone(item));
  }

  function provenanceList(value) {
    if (Array.isArray(value)) return clone(value);
    return value ? [clone(value)] : [];
  }

  function bindingRole(metricKind) {
    if (metricKind === 'quality' || metricKind === 'yield'
      || metricKind === 'chance') return metricKind;
    return 'primary';
  }

  function evaluatorSupport(snapshot, statDefId, declared) {
    if (['initialSubset', 'recordOnly', 'unsupported'].includes(declared)) return declared;
    const definitions = snapshot.statDefinitions || {};
    if (definitions.supported && definitions.supported[statDefId]) return 'initialSubset';
    if (definitions.recordOnly && definitions.recordOnly[statDefId]) return 'recordOnly';
    return 'unsupported';
  }

  function normaliseFacet(source, policy, snapshot) {
    const raw = source || {};
    const declaredSupport = raw.support;
    const bindings = Array.isArray(raw.statBindings) ? raw.statBindings.map(binding => ({
      statDefId: binding.statDefId,
      role: binding.role || bindingRole(raw.metricKind),
      evaluatorSupport: evaluatorSupport(snapshot, binding.statDefId,
        binding.evaluatorSupport),
      provenance: clone(binding.provenance || {}),
    })) : (raw.statDefIds || []).map(statDefId => ({
      statDefId, role: bindingRole(raw.metricKind),
      evaluatorSupport: evaluatorSupport(snapshot, statDefId, declaredSupport),
      provenance: {},
    }));
    const classification = raw.classification
      || (declaredSupport === 'unknown' || policy.policyKind === 'unknown'
        ? 'unknown' : policy.policyKind === 'explicitAppPolicy'
          ? 'explicitAppPolicy' : 'definitionBacked');
    const completeness = ['complete', 'partial', 'unknown'].includes(raw.completeness)
      ? raw.completeness : classification === 'unknown' ? 'unknown' : 'complete';
    const facetUnresolved = unresolved(raw.unresolved, 'jobPolicy', raw.facetId);
    if (classification === 'unknown' && facetUnresolved.length === 0) {
      facetUnresolved.push({ reasonCode: 'facetSemanticsUnknown',
        message: 'facetSemanticsUnknown', affectedDimension: 'jobPolicy',
        targetDefId: raw.facetId || null, candidateTargetDefIds: [],
        operationId: null, evidence: [] });
    }
    return {
      facetId: raw.facetId || 'unknown-facet',
      label: raw.label || raw.facetId || 'Unknown facet',
      sourceWorkTypeDefIds: clone(raw.sourceWorkTypeDefIds
        || policy.sourceWorkTypeDefIds || []),
      workGiverDefIds: clone(raw.workGiverDefIds || []),
      jobDriverClassIds: clone(raw.jobDriverClassIds || []),
      recipeDefIds: clone(raw.recipeDefIds || []),
      sourceKind: raw.sourceKind || 'unknown',
      sourceIds: clone(raw.sourceIds || []),
      metricKind: raw.metricKind || 'unknown',
      statBindings: bindings,
      applicability: raw.applicability
        || (classification === 'unknown' ? 'unknown' : 'applicable'),
      classification, completeness,
      provenance: provenanceList(raw.provenance),
      unresolved: facetUnresolved,
    };
  }

  function unknownPolicy(jobId, runtimeVersion, snapshot) {
    const raw = {
      policyKind: 'unknown', sourceWorkTypeDefIds: [],
      facets: [{ facetId: 'unknown-app-job', metricKind: 'unknown',
        statDefIds: [], support: 'unknown' }],
    };
    return normalisePolicy(raw, jobId, runtimeVersion, snapshot);
  }

  function normalisePolicy(source, jobId, runtimeVersion, snapshot) {
    const raw = source || {};
    const policyKind = raw.policyKind || 'definitionBacked';
    const policy = {
      schemaVersion: 1, runtimeVersion,
      jobId, policyKind,
      sourceWorkTypeDefIds: clone(raw.sourceWorkTypeDefIds || []),
      skillDefIds: Array.from(new Set(raw.skillDefIds || [])).sort(),
      facets: [],
      completeness: ['complete', 'partial', 'unknown'].includes(raw.completeness)
        ? raw.completeness : policyKind === 'unknown' ? 'unknown' : 'complete',
      provenance: provenanceList(raw.provenance),
      unresolved: unresolved(raw.unresolved, 'jobPolicy', jobId),
    };
    if (policyKind === 'unknown' && policy.unresolved.length === 0) {
      policy.unresolved.push({ reasonCode: 'noAuditedEffectivenessPolicy',
        message: 'noAuditedEffectivenessPolicy', affectedDimension: 'jobPolicy',
        targetDefId: jobId, candidateTargetDefIds: [], operationId: null, evidence: [] });
    }
    policy.facets = (raw.facets || []).map(item => normaliseFacet(item, policy, snapshot));
    if (policy.facets.length === 0 && policyKind === 'unknown') {
      policy.facets.push(normaliseFacet({ facetId: 'unknown-app-job',
        metricKind: 'unknown', support: 'unknown' }, policy, snapshot));
    }
    return policy;
  }

  function unevaluatedStat(statDefId, runtimeVersion) {
    return freeze({
      schemaVersion: 1, runtimeVersion, statDefId, state: 'notEvaluated',
      completeness: null, confidence: 'verified', resolvedPrefixValue: null,
      frontierIndex: null, evaluatedOperationCount: 0, numericClaim: 'noNumericClaim',
      applied: [], frontier: null, notEvaluated: [], precision: [],
      dependencyPath: [statDefId], evidence: [], unresolved: [],
    });
  }

  function unknownStat(statDefId, runtimeVersion) {
    const reason = { reasonCode: 'unsupportedStatDef', message: 'unsupportedStatDef',
      affectedDimension: 'stat', targetDefId: statDefId,
      candidateTargetDefIds: [], operationId: null, evidence: [] };
    return freeze({
      schemaVersion: 1, runtimeVersion, statDefId, state: 'unknown',
      completeness: 'unknown', confidence: 'unknown', resolvedPrefixValue: null,
      frontierIndex: null, evaluatedOperationCount: 0, numericClaim: 'noNumericClaim',
      applied: [], frontier: null, notEvaluated: [], precision: [],
      dependencyPath: [statDefId], evidence: [], unresolved: [reason],
    });
  }

  function facetEvaluation(context, facet, runtimeVersion) {
    const statFacts = facet.statBindings.map(binding => {
      if (binding.evaluatorSupport === 'initialSubset') {
        return StructuralStatResolver.resolve(context, binding.statDefId);
      }
      if (binding.evaluatorSupport === 'recordOnly') {
        return unevaluatedStat(binding.statDefId, runtimeVersion);
      }
      return unknownStat(binding.statDefId, runtimeVersion);
    });
    const facetUnresolved = clone(facet.unresolved);
    for (const fact of statFacts) facetUnresolved.push(...clone(fact.unresolved || []));
    let state;
    if (facet.classification === 'unknown' || facet.applicability === 'unknown') state = 'unknown';
    else if (statFacts.length === 0) state = 'resolved';
    else if (statFacts.every(fact => fact.state === 'notEvaluated')) state = 'notEvaluated';
    else if (statFacts.every(fact => fact.state === 'resolved')) state = 'resolved';
    else if (statFacts.some(fact => fact.state === 'resolved'
      || fact.state === 'partial' || fact.state === 'notEvaluated')) state = 'partial';
    else state = 'unknown';
    return {
      facet, state, statFacts,
      completeness: state === 'resolved' ? 'complete'
        : state === 'partial' ? 'partial'
          : state === 'unknown' ? 'unknown' : null,
      confidence: state === 'resolved' ? (statFacts.length ? 'derived' : 'verified')
        : state === 'partial' ? 'derived'
        : state === 'notEvaluated' ? 'verified' : 'unknown',
      unresolved: facetUnresolved,
    };
  }

  function distinctEvidence(groups) {
    const output = [], keys = new Set();
    for (const item of groups.flat()) {
      const key = item && item.evidenceId || JSON.stringify(item);
      if (keys.has(key)) continue;
      keys.add(key); output.push(clone(item));
    }
    return output;
  }

  function resolve(context, jobId) {
    const snapshot = context && context.effectivenessSnapshot || {};
    const runtimeVersion = snapshot.runtimeVersion || context && context.runtimeVersion || null;
    const sourcePolicy = snapshot.jobPolicies && snapshot.jobPolicies[jobId];
    const policy = sourcePolicy
      ? normalisePolicy(sourcePolicy, jobId, runtimeVersion, snapshot)
      : unknownPolicy(jobId, runtimeVersion, snapshot);
    const skillFacts = [], passionFacts = [], learningRateFacts = [];
    for (const skillDefId of policy.skillDefIds) {
      const skillFact = StructuralSkillResolver.resolve(context, skillDefId);
      const passionFact = StructuralPassionResolver.resolve(context, skillDefId);
      skillFacts.push(skillFact);
      passionFacts.push(passionFact);
      learningRateFacts.push(StructuralLearningResolver.resolve(
        context, skillDefId, passionFact));
    }
    const globalWorkSpeed = StructuralStatResolver.resolve(context, 'WorkSpeedGlobal');
    const facets = policy.facets.map(facet => facetEvaluation(context, facet, runtimeVersion));
    const evidenceSources = [skillFacts, passionFacts, learningRateFacts,
      [globalWorkSpeed], facets.flatMap(facet => facet.statFacts)]
      .flat().map(fact => fact && fact.evidence || []);
    return freeze({
      schemaVersion: 1, runtimeVersion,
      pawnId: !context || context.pawnId == null ? null : String(context.pawnId),
      jobId, policy, skillFacts, passionFacts, learningRateFacts,
      globalWorkSpeed, facets,
      currentEffectiveness: { state: 'notEvaluated' },
      evidence: distinctEvidence(evidenceSources),
    });
  }

  return Object.freeze({ resolve });
})();

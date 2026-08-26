/** Canonical C4 current Availability resolver, independent of Permission. */
const AvailabilityResolver = (() => {
  const WORK_TAG_BITS = Object.freeze({
    ManualDumb: 2, ManualSkilled: 4, Violent: 8, Caring: 16, Social: 32,
    Commoner: 64, Intellectual: 128, Animals: 256, Artistic: 512,
    Crafting: 1024, Cooking: 2048, Firefighting: 4096, Cleaning: 8192,
    Hauling: 16384, PlantWork: 32768, Mining: 65536, Hunting: 131072,
    Constructing: 262144, Shooting: 524288, AllWork: 1048576,
  });
  const GLOBAL_STATUS_IDS = Object.freeze([
    'downed', 'inMentalState', 'mentalBreak', 'deactivated', 'unconscious',
  ]);

  function tagMask(tags) {
    let mask = 0;
    for (const tag of tags || []) {
      if (Object.prototype.hasOwnProperty.call(WORK_TAG_BITS, tag)) mask |= WORK_TAG_BITS[tag];
    }
    return mask;
  }

  function makeEvaluation(args) {
    return {
      evaluationId: args.evaluationId,
      requirementId: args.requirementId,
      scope: args.scope,
      kind: args.kind,
      result: args.result,
      aggregation: {
        level: args.level || 'constraint',
        effect: args.effect || (args.result === 'failed' ? 'block'
          : args.result === 'unknown' ? 'unknown' : 'none'),
        masked: !!args.masked,
      },
      snapshot: 'current',
      expected: args.expected || null,
      observed: args.observed || null,
      explanation: { code: args.code, params: args.params || {} },
      evidence: args.evidence || [],
      requirementProvenance: args.requirementProvenance || { modId: null, sources: [] },
    };
  }

  function component(evaluations) {
    const blockers = evaluations.filter(item => item.aggregation.level === 'constraint'
      && item.aggregation.effect === 'block' && !item.aggregation.masked);
    const unknowns = evaluations.filter(item => item.aggregation.level === 'constraint'
      && item.aggregation.effect === 'unknown' && !item.aggregation.masked);
    return {
      state: blockers.length ? 'unavailable' : unknowns.length ? 'unknown' : 'available',
      blockers, unknowns, evaluations,
    };
  }

  function currentCapacity(context, capacityDefName) {
    const table = context.capacities && context.capacities.capacities
      ? context.capacities.capacities : {};
    for (const value of Object.values(table)) {
      if (value && value.capacity === capacityDefName) return value.current || null;
    }
    return null;
  }

  function evaluateCapacity(requirement, path, context, index) {
    const fact = currentCapacity(context, requirement.capacityDefName);
    let result = 'unknown';
    let code = 'availability.capacity.unknown';
    if (requirement.completeness === 'complete' && requirement.comparison && fact) {
      if (fact.state === 'resolved' && Number.isFinite(fact.value)) {
        result = fact.value > requirement.comparison.thresholdSource.value ? 'satisfied' : 'failed';
        code = result === 'satisfied' ? 'availability.capacity.aboveThreshold'
          : 'availability.capacity.notAboveThreshold';
      } else if (fact.state === 'notApplicable') {
        result = requirement.notApplicable === 'satisfied' ? 'satisfied'
          : requirement.notApplicable === 'blocked' ? 'failed' : 'unknown';
        code = 'availability.capacity.notApplicable.' + requirement.notApplicable;
      }
    }
    return makeEvaluation({
      evaluationId: 'availability:path:' + path.pathId + ':capacity:' + index,
      requirementId: requirement.requirementId,
      scope: 'availability.job', kind: 'capacity', result, level: 'leaf', effect: 'none',
      expected: requirement.comparison ? {
        target: requirement.capacityDefName, operator: requirement.comparison.operator,
        threshold: requirement.comparison.thresholdSource.value,
        notApplicable: requirement.notApplicable,
      } : { target: requirement.capacityDefName, notApplicable: requirement.notApplicable },
      observed: fact ? { state: fact.state, value: fact.value == null ? null : fact.value }
        : { state: 'unknown', value: null },
      code, params: { capacityDefName: requirement.capacityDefName },
      evidence: fact && Array.isArray(fact.evidence) ? fact.evidence.slice() : [],
      requirementProvenance: requirement.provenance,
    });
  }

  function evaluateExecution(policy, context, evaluations) {
    const pathGroups = [];
    for (const path of policy.execution.paths) {
      const leaves = path.allOf.map((requirement, index) => {
        const leaf = evaluateCapacity(requirement, path, context, index);
        evaluations.push(leaf);
        return leaf;
      });
      let result;
      if (leaves.some(item => item.result === 'failed')) result = 'failed';
      else if (path.completeness !== 'complete' || leaves.some(item => item.result === 'unknown')) result = 'unknown';
      else result = 'satisfied';
      const pathEvaluation = makeEvaluation({
        evaluationId: 'availability:path:' + path.pathId,
        requirementId: path.pathId,
        scope: 'availability.job', kind: 'executionPath', result, level: 'path', effect: 'none',
        expected: { target: path.pathId }, observed: { state: result },
        code: 'availability.execution.path.' + result,
        params: { pathId: path.pathId, capacityCount: path.allOf.length },
        requirementProvenance: path.provenance,
      });
      evaluations.push(pathEvaluation);
      pathGroups.push({ leaves, pathEvaluation });
    }
    let result;
    if (pathGroups.some(group => group.pathEvaluation.result === 'satisfied')) result = 'satisfied';
    else if (policy.execution.completeness !== 'complete'
      || pathGroups.some(group => group.pathEvaluation.result === 'unknown')) result = 'unknown';
    else result = 'failed';
    if (result === 'satisfied') {
      for (const group of pathGroups) {
        if (group.pathEvaluation.result === 'satisfied') continue;
        group.pathEvaluation.aggregation.masked = true;
        for (const leaf of group.leaves) leaf.aggregation.masked = true;
      }
    }
    evaluations.push(makeEvaluation({
      evaluationId: 'availability:execution', requirementId: 'execution:anyPath',
      scope: 'availability.job', kind: 'executionPath', result,
      expected: { target: policy.workTypeDefName }, observed: { state: result },
      code: policy.execution.paths.length ? 'availability.execution.' + result
        : 'availability.execution.emptyCatalogue.' + result,
      params: { workTypeDefName: policy.workTypeDefName, pathCount: policy.execution.paths.length },
      requirementProvenance: policy.provenance,
    }));
  }

  function currentCondition(effect, bodyEvidence) {
    if (effect.confidence === 'unknown') return 'unknown';
    if (!effect.when) {
      return effect.scope === 'current' || effect.scope === 'currentOnly'
        || effect.persistence === 'temporary' ? 'applies' : 'structuralOnly';
    }
    if (effect.when.kind !== 'hediffSeverity') return 'unknown';
    const observations = (bodyEvidence || []).filter(item => item.kind === 'hediff'
      && item.hediffDef === effect.when.hediffDef);
    if (!observations.length) return 'unknown';
    let unknown = false;
    for (const observation of observations) {
      if (!Number.isFinite(observation.severity)) { unknown = true; continue; }
      const above = effect.when.min == null || observation.severity >= effect.when.min;
      const below = effect.when.max == null || (effect.when.maxExclusive
        ? observation.severity < effect.when.max : observation.severity <= effect.when.max);
      if (above && below) return 'applies';
    }
    return unknown ? 'unknown' : 'doesNotApply';
  }

  function evaluateGlobal(context) {
    const evaluations = [];
    for (const statusId of GLOBAL_STATUS_IDS) {
      const fact = context.statusFacts && context.statusFacts[statusId];
      let result = 'unknown';
      if (fact && fact.state === 'known') result = fact.value === true ? 'failed' : 'satisfied';
      evaluations.push(makeEvaluation({
        evaluationId: 'availability:global:' + statusId,
        requirementId: 'currentStatus:' + statusId,
        scope: 'availability.global', kind: 'currentState', result,
        expected: { target: statusId },
        observed: fact ? { state: fact.state, value: fact.value } : { state: 'unknown', value: null },
        code: 'availability.global.' + statusId + '.' + result,
        params: { statusId }, evidence: fact && Array.isArray(fact.evidence) ? fact.evidence.slice() : [],
      }));
    }
    return component(evaluations);
  }

  function evaluateJobSpecific(context, jobId, policy) {
    const evaluations = [];
    if (!policy || policy.state !== 'definitionBacked') {
      evaluations.push(makeEvaluation({
        evaluationId: 'availability:policy', requirementId: 'jobPolicy:' + (jobId || 'unknown'),
        scope: 'availability.job', kind: 'registryCompleteness', result: 'unknown',
        code: policy ? 'availability.policy.unknown' : 'availability.policy.absent',
        params: { jobId: jobId || null }, requirementProvenance: policy && policy.provenance,
      }));
      return component(evaluations);
    }
    evaluateExecution(policy, context, evaluations);
    const effects = context.evidence && Array.isArray(context.evidence.effects)
      ? context.evidence.effects : [];
    const policyMask = tagMask(policy.permission.workTags.values);
    const relevant = effects.filter(effect =>
      (effect.type === 'disableJob' && effect.target === jobId)
      || (effect.type === 'disableWorkType'
        && (policy.sourceWorkTypes || [policy.workTypeDefName]).includes(effect.target))
      || (effect.type === 'disableWorkTag' && !!(tagMask([effect.target]) & policyMask)));
    for (const effect of relevant) {
      const condition = currentCondition(effect, context.evidence.bodyEvidence);
      if (condition === 'structuralOnly' || condition === 'doesNotApply') continue;
      const result = condition === 'applies' ? 'failed' : 'unknown';
      evaluations.push(makeEvaluation({
        evaluationId: 'availability:currentOnly:' + effect.evidenceId,
        requirementId: 'currentOnly:' + effect.type + ':' + effect.target,
        scope: 'availability.job', kind: 'currentOnly', result,
        expected: { target: effect.target }, observed: { state: condition, value: effect.target },
        code: 'availability.currentOnly.' + result,
        params: { target: effect.target, effectType: effect.type },
        evidence: [{ kind: 'c2Evidence', evidenceId: effect.evidenceId }],
        requirementProvenance: effect.provenance,
      }));
    }
    return component(evaluations);
  }

  function resolve(context, jobId) {
    const ctx = context || {};
    const policy = typeof RequirementRegistry !== 'undefined'
      ? RequirementRegistry.getJobPolicy(ctx.definitionSnapshot, jobId) : null;
    const global = evaluateGlobal(ctx);
    const jobSpecific = evaluateJobSpecific(ctx, jobId, policy);
    const blockers = global.blockers.concat(jobSpecific.blockers);
    const unknowns = global.unknowns.concat(jobSpecific.unknowns);
    return {
      schemaVersion: 1,
      pawnId: ctx.pawnId || null,
      jobId: jobId || null,
      state: blockers.length ? 'unavailable' : unknowns.length ? 'unknown' : 'available',
      global,
      jobSpecific,
      blockers,
      unknowns,
      diagnostics: [],
    };
  }

  return Object.freeze({ resolve, _currentCondition: currentCondition });
})();

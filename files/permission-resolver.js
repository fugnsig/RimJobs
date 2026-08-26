/** Canonical C4 structural Permission resolver (RimWorld 1.6.4871). */
const PermissionResolver = (() => {
  const WORK_TAG_BITS = Object.freeze({
    ManualDumb: 2, ManualSkilled: 4, Violent: 8, Caring: 16, Social: 32,
    Commoner: 64, Intellectual: 128, Animals: 256, Artistic: 512,
    Crafting: 1024, Cooking: 2048, Firefighting: 4096, Cleaning: 8192,
    Hauling: 16384, PlantWork: 32768, Mining: 65536, Hunting: 131072,
    Constructing: 262144, Shooting: 524288, AllWork: 1048576,
  });

  function prov(source) {
    return source && source.provenance
      ? source.provenance
      : (source && source._provenance ? source._provenance : { modId: null, sources: [] });
  }

  function evidenceRefs(items) {
    return (items || []).map(item => ({ kind: 'c2Evidence', evidenceId: item.evidenceId }));
  }

  function makeEvaluation(args) {
    return {
      evaluationId: args.evaluationId,
      requirementId: args.requirementId,
      scope: 'permission',
      kind: args.kind,
      result: args.result,
      aggregation: {
        level: args.level || 'constraint',
        effect: args.effect || (args.result === 'failed' ? 'block'
          : args.result === 'unknown' ? 'unknown' : 'none'),
        masked: !!args.masked,
      },
      snapshot: args.snapshot === undefined ? 'structural' : args.snapshot,
      expected: args.expected || null,
      observed: args.observed || null,
      explanation: { code: args.code, params: args.params || {} },
      evidence: args.evidence || [],
      requirementProvenance: args.requirementProvenance || { modId: null, sources: [] },
    };
  }

  function tagMask(tags) {
    let mask = 0;
    for (const tag of tags || []) {
      if (Object.prototype.hasOwnProperty.call(WORK_TAG_BITS, tag)) mask |= WORK_TAG_BITS[tag];
    }
    return mask;
  }

  function conditionState(effect, bodyEvidence) {
    if (effect.confidence === 'unknown') {
      return { result: 'unknown', observations: [], reason: 'permissionEvidenceConfidenceUnknown' };
    }
    if (!effect.when) return { result: 'applies', observations: [] };
    if (effect.when.kind !== 'hediffSeverity') {
      return { result: 'unknown', observations: [], reason: 'unsupportedPermissionCondition' };
    }
    const observations = (bodyEvidence || []).filter(item => item.kind === 'hediff'
      && item.hediffDef === effect.when.hediffDef);
    if (!observations.length) {
      return { result: 'unknown', observations, reason: 'missingConditionalObservation' };
    }
    let possibleUnknown = false;
    let persistentActive = false;
    for (const observation of observations) {
      const severity = observation.severity;
      if (!Number.isFinite(severity)) { possibleUnknown = true; continue; }
      const aboveMin = effect.when.min == null || severity >= effect.when.min;
      const belowMax = effect.when.max == null || (effect.when.maxExclusive
        ? severity < effect.when.max : severity <= effect.when.max);
      if (!aboveMin || !belowMax) continue;
      if (observation.persistence === 'persistent') persistentActive = true;
      else if (observation.persistence === 'unknown') possibleUnknown = true;
    }
    if (persistentActive) return { result: 'applies', observations };
    if (possibleUnknown) return { result: 'unknown', observations, reason: 'conditionalPersistenceOrSeverityUnknown' };
    return { result: 'doesNotApply', observations };
  }

  function capacityFact(capacities, capacityDefName) {
    const table = capacities && capacities.capacities ? capacities.capacities : {};
    for (const value of Object.values(table)) {
      if (value && value.capacity === capacityDefName) return value.structural || null;
    }
    return table[String(capacityDefName || '').toLowerCase()]
      ? table[String(capacityDefName).toLowerCase()].structural : null;
  }

  function evaluateCapacity(requirement, pathId, capacities, index) {
    const fact = capacityFact(capacities, requirement.capacityDefName);
    let result = 'unknown';
    let code = 'permission.capacity.unknown';
    let observed = fact ? { state: fact.state, value: fact.value == null ? null : fact.value }
      : { state: 'unknown', value: null };
    if (requirement.completeness === 'complete' && requirement.comparison && fact) {
      if (fact.state === 'resolved' && Number.isFinite(fact.value)) {
        result = fact.value > requirement.comparison.thresholdSource.value ? 'satisfied' : 'failed';
        code = result === 'satisfied' ? 'permission.capacity.aboveThreshold'
          : 'permission.capacity.notAboveThreshold';
      } else if (fact.state === 'notApplicable') {
        result = requirement.notApplicable === 'satisfied' ? 'satisfied'
          : requirement.notApplicable === 'blocked' ? 'failed' : 'unknown';
        code = 'permission.capacity.notApplicable.' + requirement.notApplicable;
      }
    }
    return makeEvaluation({
      evaluationId: 'permission:path:' + pathId + ':capacity:' + index,
      requirementId: requirement.requirementId,
      kind: 'capacity', result, level: 'leaf', effect: 'none',
      expected: requirement.comparison ? {
        target: requirement.capacityDefName,
        operator: requirement.comparison.operator,
        threshold: requirement.comparison.thresholdSource.value,
        notApplicable: requirement.notApplicable,
      } : { target: requirement.capacityDefName, notApplicable: requirement.notApplicable },
      observed, code,
      params: { capacityDefName: requirement.capacityDefName },
      evidence: fact && Array.isArray(fact.evidence) ? fact.evidence.slice() : [],
      requirementProvenance: requirement.provenance,
    });
  }

  function evaluateExecution(policy, capacities, evaluations) {
    const execution = policy.execution;
    const pathResults = [];
    for (let pi = 0; pi < execution.paths.length; pi++) {
      const path = execution.paths[pi];
      const leaves = path.allOf.map((requirement, ri) => {
        const evaluation = evaluateCapacity(requirement, path.pathId, capacities, ri);
        evaluations.push(evaluation);
        return evaluation;
      });
      let result;
      if (leaves.some(item => item.result === 'failed')) result = 'failed';
      else if (path.completeness !== 'complete' || leaves.some(item => item.result === 'unknown')) result = 'unknown';
      else result = 'satisfied';
      const evaluation = makeEvaluation({
        evaluationId: 'permission:path:' + path.pathId,
        requirementId: path.pathId,
        kind: 'executionPath', result, level: 'path', effect: 'none',
        expected: { target: path.pathId }, observed: { state: result },
        code: 'permission.execution.path.' + result,
        params: { pathId: path.pathId, capacityCount: path.allOf.length },
        requirementProvenance: path.provenance,
      });
      evaluations.push(evaluation);
      pathResults.push({ evaluation, leaves });
    }
    let result;
    if (pathResults.some(item => item.evaluation.result === 'satisfied')) result = 'satisfied';
    else if (execution.completeness !== 'complete'
      || pathResults.some(item => item.evaluation.result === 'unknown')) result = 'unknown';
    else result = 'failed';
    const alternativeSucceeded = result === 'satisfied';
    if (alternativeSucceeded) {
      for (const pathResult of pathResults) {
        if (pathResult.evaluation.result !== 'satisfied') {
          pathResult.evaluation.aggregation.masked = true;
          for (const leaf of pathResult.leaves) leaf.aggregation.masked = true;
        }
      }
    }
    const aggregate = makeEvaluation({
      evaluationId: 'permission:execution', requirementId: 'execution:anyPath',
      kind: 'executionPath', result, level: 'constraint',
      expected: { target: policy.workTypeDefName }, observed: { state: result },
      code: execution.paths.length ? 'permission.execution.' + result
        : 'permission.execution.emptyCatalogue.' + result,
      params: { workTypeDefName: policy.workTypeDefName, pathCount: execution.paths.length },
      requirementProvenance: policy.provenance,
    });
    evaluations.push(aggregate);
    return aggregate;
  }

  function candidateOutcome(candidate, jobId, policy) {
    if (!candidate || typeof candidate !== 'object') return 'unknown';
    const policyTagMask = tagMask(policy.permission.workTags.values);
    if (candidate.kind === 'job') return candidate.target === jobId ? 'failed' : 'satisfied';
    if (candidate.kind === 'workType') {
      return candidate.target === policy.workTypeDefName ? 'failed' : 'satisfied';
    }
    if (candidate.kind === 'workTag') {
      return !!(tagMask([candidate.target]) & policyTagMask) ? 'failed' : 'satisfied';
    }
    return 'unknown';
  }

  function resolve(context, jobId) {
    const ctx = context || {};
    const evaluations = [];
    const diagnostics = [];
    const snapshot = ctx.definitionSnapshot;
    const policy = typeof RequirementRegistry !== 'undefined'
      ? RequirementRegistry.getJobPolicy(snapshot, jobId) : null;
    if (!policy || policy.state !== 'definitionBacked') {
      const evaluation = makeEvaluation({
        evaluationId: 'permission:policy', requirementId: 'jobPolicy:' + (jobId || 'unknown'),
        kind: 'registryCompleteness', result: 'unknown', snapshot: null,
        code: policy ? 'permission.policy.unknown' : 'permission.policy.absent',
        params: { jobId: jobId || null }, requirementProvenance: policy ? policy.provenance : null,
      });
      evaluations.push(evaluation);
      return {
        schemaVersion: 1, pawnId: ctx.pawnId || null, jobId: jobId || null,
        state: 'unknown', blockers: [], unknowns: [evaluation], evaluations, diagnostics,
      };
    }

    evaluations.push(makeEvaluation({
      evaluationId: 'permission:policy', requirementId: 'jobPolicy:' + jobId,
      kind: 'registryCompleteness',
      result: policy.completeness === 'complete' ? 'satisfied' : 'unknown', snapshot: null,
      code: policy.completeness === 'complete' ? 'permission.policy.complete' : 'permission.policy.partial',
      params: { jobId, workTypeDefName: policy.workTypeDefName },
      requirementProvenance: policy.provenance,
    }));

    const c2 = ctx.evidence || {};
    const effects = Array.isArray(c2.effects) ? c2.effects : [];
    const bodyEvidence = Array.isArray(c2.bodyEvidence) ? c2.bodyEvidence : [];
    const constraintGroups = [
      { type: 'disableJob', kind: 'disableJob', target: jobId, id: 'job', targetMatches: effect => effect.target === jobId },
      { type: 'disableWorkType', kind: 'disableJob', target: policy.workTypeDefName, id: 'workType',
        targetMatches: effect => (policy.sourceWorkTypes || [policy.workTypeDefName]).includes(effect.target) },
    ];
    for (const group of constraintGroups) {
      const matches = effects.filter(effect => effect.type === group.type && group.targetMatches(effect));
      let found = false;
      let unknown = false;
      for (const effect of matches) {
        const condition = conditionState(effect, bodyEvidence);
        if (condition.result === 'applies') found = true;
        else if (condition.result === 'unknown') unknown = true;
        const result = condition.result === 'applies' ? 'failed'
          : condition.result === 'unknown' ? 'unknown' : 'satisfied';
        evaluations.push(makeEvaluation({
          evaluationId: 'permission:' + group.id + ':' + effect.evidenceId,
          requirementId: group.type + ':' + group.target,
          kind: group.kind, result,
          expected: { target: group.target }, observed: { state: condition.result, value: effect.target },
          code: 'permission.' + group.id + '.' + result,
          params: { target: group.target }, evidence: evidenceRefs([effect]),
          requirementProvenance: prov(effect),
        }));
      }
      if (!matches.length) evaluations.push(makeEvaluation({
        evaluationId: 'permission:' + group.id + ':none',
        requirementId: group.type + ':' + group.target,
        kind: group.kind, result: 'satisfied',
        expected: { target: group.target }, observed: { state: 'resolved', value: false },
        code: 'permission.' + group.id + '.notDisabled', params: { target: group.target },
      }));
      if (found && unknown) diagnostics.push({ code: 'confirmedDisableWithConditionalUnknown', target: group.target });
    }

    const policyMask = tagMask(policy.permission.workTags.values);
    const tagMatches = effects.filter(effect => effect.type === 'disableWorkTag'
      && !!(tagMask([effect.target]) & policyMask));
    for (const effect of tagMatches) {
      const condition = conditionState(effect, bodyEvidence);
      const result = condition.result === 'applies' ? 'failed'
        : condition.result === 'unknown' ? 'unknown' : 'satisfied';
      evaluations.push(makeEvaluation({
        evaluationId: 'permission:workTag:' + effect.evidenceId,
        requirementId: 'disableWorkTag:' + effect.target,
        kind: 'disableWorkTag', result,
        expected: { target: effect.target },
        observed: { state: condition.result, value: effect.target },
        code: 'permission.workTag.' + result,
        params: { disabledTag: effect.target, workTypeDefName: policy.workTypeDefName },
        evidence: evidenceRefs([effect]), requirementProvenance: prov(effect),
      }));
    }
    if (!tagMatches.length) evaluations.push(makeEvaluation({
      evaluationId: 'permission:workTag:none', requirementId: 'disableWorkTag:policyMask',
      kind: 'disableWorkTag', result: policy.permission.workTags.completeness === 'complete'
        ? 'satisfied' : 'unknown',
      expected: { target: policy.workTypeDefName }, observed: { state: 'resolved', value: false },
      code: policy.permission.workTags.completeness === 'complete'
        ? 'permission.workTag.notDisabled' : 'permission.workTag.policyUnknown',
      params: { workTypeDefName: policy.workTypeDefName },
      requirementProvenance: policy.permission.workTags.provenance,
    }));

    const unresolved = c2.unresolvedSources || [];
    for (let i = 0; i < unresolved.length; i++) {
      const item = unresolved[i];
      const candidates = Array.isArray(item.candidateTargets) ? item.candidateTargets : [];
      if (!candidates.length) continue;
      const outcomes = candidates.map(candidate => candidateOutcome(candidate, jobId, policy));
      const hasFailed = outcomes.includes('failed');
      if (!hasFailed) continue;
      const result = outcomes.every(outcome => outcome === 'failed') ? 'failed' : 'unknown';
      evaluations.push(makeEvaluation({
        evaluationId: 'permission:unresolved:' + i,
        requirementId: 'permissionEvidenceCompleteness:' + i,
        kind: 'registryCompleteness', result, snapshot: null,
        code: result === 'failed' ? 'permission.evidence.unanimousAmbiguity'
          : 'permission.evidence.relevantAmbiguity',
        params: { rawTarget: item.rawTarget || null, candidateCount: candidates.length },
        requirementProvenance: item.provenance || { modId: item.modId || null, sources: [] },
      }));
    }

    const pawnState = c2.pawnState || {};
    const raceEntry = RequirementRegistry.getRaceWorkEntry(
      snapshot, pawnState.raceDefName, policy.workTypeDefName);
    let ageResult = 'unknown';
    let ageCode = 'permission.age.unknown';
    let expected = { target: policy.workTypeDefName };
    if (raceEntry.state === 'knownNoGate') {
      ageResult = 'satisfied'; ageCode = 'permission.age.noGate';
    } else if (raceEntry.state === 'knownGate') {
      expected = { target: policy.workTypeDefName, operator: 'gte', threshold: raceEntry.minAge };
      if (Number.isFinite(pawnState.age)) {
        ageResult = pawnState.age >= raceEntry.minAge ? 'satisfied' : 'failed';
        ageCode = ageResult === 'satisfied' ? 'permission.age.meetsGate' : 'permission.age.belowGate';
      }
    }
    evaluations.push(makeEvaluation({
      evaluationId: 'permission:age', requirementId: 'raceWorkAge:' + policy.workTypeDefName,
      kind: 'age', result: ageResult, expected,
      observed: { state: Number.isFinite(pawnState.age) ? 'resolved' : 'unknown', value: pawnState.age },
      code: ageCode, params: { raceDefName: pawnState.raceDefName || null },
      requirementProvenance: raceEntry.provenance,
    }));

    evaluateExecution(policy, ctx.capacities || {}, evaluations);

    const blockers = evaluations.filter(item => item.aggregation.level === 'constraint'
      && item.aggregation.effect === 'block' && !item.aggregation.masked);
    const unknowns = evaluations.filter(item => item.aggregation.level === 'constraint'
      && item.aggregation.effect === 'unknown' && !item.aggregation.masked);
    return {
      schemaVersion: 1,
      pawnId: ctx.pawnId || null,
      jobId: jobId || null,
      state: blockers.length ? 'blocked' : unknowns.length ? 'unknown' : 'allowed',
      blockers,
      unknowns,
      evaluations,
      diagnostics,
    };
  }

  return Object.freeze({ resolve, _tagMask: tagMask, _conditionState: conditionState });
})();

/** C5 ordered structural StatDef evaluator. */
const StructuralStatResolver = (() => {
  const FAMILY_PHASES = Object.freeze({
    traitOffsets: 'traitOffset', hediffOffsets: 'hediffOffset',
    preceptOffsets: 'preceptOffset', roleOffsets: 'roleOffset',
    geneOffsets: 'geneOffset', lifeStageOffsets: 'lifeStageOffset',
    equipmentOffsets: 'equipmentOffset', traitFactors: 'traitFactor',
    hediffFactors: 'hediffFactor', preceptFactors: 'preceptFactor',
    roleFactors: 'roleFactor', geneFactors: 'geneFactor',
    lifeStageFactors: 'lifeStageFactor',
    requestThingOperations: 'requestThingOperation',
    inspirationOperations: 'inspiration', scenarioContext: 'scenarioFactor',
  });

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

  function completeForTarget(record, statDefId) {
    if (!record) return 'unknown';
    const scoped = record.byStatDef && record.byStatDef[statDefId];
    if (['complete', 'partial', 'unknown'].includes(scoped)) return scoped;
    return ['complete', 'partial', 'unknown'].includes(record.completeness)
      ? record.completeness : 'unknown';
  }

  function normaliseDefinitionOperation(template) {
    return Object.assign(clone(template), {
      operationId: template.operationId || template.operationTemplateId,
      sourceFactKey: template.sourceFactKey || template.operationTemplateId,
      evidence: clone(template.evidence || []),
    });
  }

  function normalisePawnOperation(source) {
    const kind = source.kind === 'statOffset' ? 'add'
      : source.kind === 'statFactor' ? 'multiply' : source.kind;
    return {
      operationId: source.operationId,
      sourceFactKey: source.sourceFactKey,
      phase: source.phase,
      phaseOrder: source.phaseOrder,
      sourceOrder: Number.isInteger(source.sourceOrder) ? source.sourceOrder : 0,
      sourceInstanceOrder: Number.isInteger(source.sourceInstanceOrder)
        ? source.sourceInstanceOrder : 0,
      kind,
      statDefId: source.statDefId,
      sourceDefId: source.sourceDefId || null,
      dependencyStatDefId: null,
      skillDefId: null,
      capacityDefId: null,
      statPartClass: null,
      durability: source.durability || 'unknown',
      applicability: source.applicability || 'unknown',
      operand: { value: Number.isFinite(source.value) ? source.value : null,
        scale: null, weight: null, max: null, min: null, allowedDefect: null,
        useReciprocal: null, curvePoints: [] },
      semanticsSupport: source.canonicalEligible === true
        || source.applicability === 'inapplicable' ? 'supported' : 'unknown',
      completeness: source.completeness || 'unknown',
      compatibilityOnly: source.compatibilityOnly === true,
      superseded: source.superseded === true,
      evidence: clone(source.evidence || []),
      unresolved: [],
    };
  }

  function frontierMarker(family, phase, phaseOrder, completeness, evidence, statDefId) {
    return {
      operationId: 'source-family-frontier:' + family + ':' + statDefId,
      sourceFactKey: 'source-family:' + family + ':' + statDefId,
      phase, phaseOrder, sourceOrder: -1000000, sourceInstanceOrder: -1000000,
      kind: 'sourceFamilyFrontier', statDefId, sourceDefId: null,
      dependencyStatDefId: null, skillDefId: null, capacityDefId: null,
      statPartClass: null, durability: 'unknown', applicability: 'unknown',
      operand: { value: null, scale: null, weight: null, max: null, min: null,
        allowedDefect: null, useReciprocal: null, curvePoints: [] },
      semanticsSupport: 'unknown', completeness, compatibilityOnly: false,
      evidence: clone(evidence || []), unresolved: [], sourceFamily: family,
    };
  }

  function buildStream(context, statDefId, definition) {
    const snapshot = context.effectivenessSnapshot || {};
    const phases = snapshot.phaseOrder || {};
    const evidence = context.pawnEvidence || {};
    const operations = (definition.orderedOperations || []).map(normaliseDefinitionOperation);
    for (const source of evidence.statOperations || []) {
      if (!source || source.statDefId !== statDefId
        || source.compatibilityOnly === true || source.superseded === true) continue;
      operations.push(normalisePawnOperation(source));
    }
    const familyFacts = evidence.sourceFamilyCompleteness || {};
    for (const [family, phase] of Object.entries(FAMILY_PHASES)) {
      const state = completeForTarget(familyFacts[family], statDefId);
      if (state === 'complete') continue;
      operations.push(frontierMarker(family, phase, phases[phase], state,
        familyFacts[family] && familyFacts[family].evidence, statDefId));
    }
    operations.sort((left, right) => (left.phaseOrder ?? 1000000) - (right.phaseOrder ?? 1000000)
      || (left.sourceInstanceOrder ?? 0) - (right.sourceInstanceOrder ?? 0)
      || (left.sourceOrder ?? 0) - (right.sourceOrder ?? 0)
      || String(left.operationId).localeCompare(String(right.operationId)));
    return operations.map((operation, orderIndex) =>
      Object.assign(operation, { orderIndex }));
  }

  function curveValue(points, input) {
    const sorted = (points || []).filter(point => point
      && Number.isFinite(point.x) && Number.isFinite(point.y))
      .slice().sort((left, right) => left.x - right.x);
    if (!sorted.length || !Number.isFinite(input)) return null;
    if (input <= sorted[0].x) return sorted[0].y;
    if (input >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1].y;
    for (let index = 1; index < sorted.length; index++) {
      if (input > sorted[index].x) continue;
      const left = sorted[index - 1], right = sorted[index];
      const fraction = (input - left.x) / (right.x - left.x);
      return left.y + (right.y - left.y) * fraction;
    }
    return null;
  }

  function structuralCapacityFact(context, capacityDefId) {
    const table = context.structuralCapacities && context.structuralCapacities.capacities || {};
    for (const entry of Object.values(table)) {
      if (entry && entry.capacity === capacityDefId) return entry.structural || null;
    }
    const direct = table[capacityDefId];
    return direct && (direct.structural || direct) || null;
  }

  function capacityNotice(capacityDefId, fact) {
    return {
      kind: 'capacityInputRoundedByC3', capacityDefId, roundedValue: fact.value,
      roundingIncrement: 0.01,
      claim: 'exactAgainstRoundedC3InputNotBitExactRuntime',
      evidence: clone(fact.evidence || []),
    };
  }

  function inverseLerp(min, max, value) {
    if (max === min) return value < min ? 0 : 1;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  }

  function applicabilityFor(operation, context) {
    if (operation.applicability === 'inapplicable') return { state: 'inapplicable' };
    const facts = context.pawnEvidence && context.pawnEvidence.structuralContextFacts || {};
    if (operation.kind === 'sourceFamilyFrontier') return { state: 'applicable' };
    if (operation.kind === 'scenarioFactor') {
      const family = context.pawnEvidence && context.pawnEvidence.sourceFamilyCompleteness
        && context.pawnEvidence.sourceFamilyCompleteness.scenarioContext;
      return completeForTarget(family, operation.statDefId) === 'complete'
        ? { state: 'inapplicable' }
        : { state: 'frontier', reasonCode: 'scenarioContextUnknown' };
    }
    if (operation.statPartClass === 'StatPart_Age') {
      const humanlike = facts.raceProperties && facts.raceProperties.humanlike;
      if (!humanlike || humanlike.state !== 'known') {
        return { state: 'frontier', reasonCode: 'ageApplicabilityUnknown' };
      }
      if (humanlike.value !== true) return { state: 'inapplicable' };
      if (!facts.biologicalAge || facts.biologicalAge.state !== 'known'
        || !Number.isFinite(facts.biologicalAge.value)) {
        return { state: 'frontier', reasonCode: 'biologicalAgeUnknown' };
      }
      return { state: 'applicable', age: facts.biologicalAge.value };
    }
    if (operation.statPartClass === 'StatPart_Slave') {
      const slave = facts.slaveStatus;
      if (!slave || slave.state !== 'known') {
        return { state: 'frontier', reasonCode: 'slaveStatusUnknown' };
      }
      return slave.value === true ? { state: 'applicable' } : { state: 'inapplicable' };
    }
    if (operation.statPartClass === 'StatPart_Trainable') {
      const humanlike = facts.raceProperties && facts.raceProperties.humanlike;
      if (!humanlike || humanlike.state !== 'known') {
        return { state: 'frontier', reasonCode: 'trainableApplicabilityUnknown' };
      }
      if (humanlike.value === true) return { state: 'inapplicable' };
    }
    if (operation.applicability !== 'applicable') {
      return { state: 'frontier', reasonCode: 'applicabilityUnknown' };
    }
    return { state: 'applicable' };
  }

  function evaluation(operation, state, inputValue, operandValue, outputValue,
    dependency, reasonCode, precision) {
    return {
      operation, state,
      inputValue: Number.isFinite(inputValue) ? inputValue : null,
      operandValue: Number.isFinite(operandValue) ? operandValue : null,
      outputValue: Number.isFinite(outputValue) ? outputValue : null,
      dependency: dependency || null,
      precision: clone(precision || []), reasonCode: reasonCode || null,
    };
  }

  function cycleResult(context, statDefId, path) {
    const operation = Object.assign(frontierMarker('dependencyCycle', 'statFactor', 18,
      'unknown', [], statDefId), { orderIndex: 0 });
    const frontier = evaluation(operation, 'frontier', null, null, null, null,
      'dependencyCycle');
    return freeze({
      schemaVersion: 1, runtimeVersion: context.runtimeVersion || null, statDefId,
      state: 'unknown', completeness: 'unknown', confidence: 'unknown',
      resolvedPrefixValue: null, frontierIndex: 0, evaluatedOperationCount: 1,
      numericClaim: 'noNumericClaim', applied: [], frontier, notEvaluated: [],
      precision: [], dependencyPath: path, evidence: [],
      unresolved: [{ reasonCode: 'dependencyCycle', message: 'dependencyCycle',
        affectedDimension: 'stat', targetDefId: statDefId,
        candidateTargetDefIds: path, operationId: operation.operationId, evidence: [] }],
    });
  }

  function resolveInternal(context, statDefId, memo, stack) {
    if (stack.includes(statDefId)) return cycleResult(context, statDefId, stack.concat(statDefId));
    if (memo.has(statDefId)) return memo.get(statDefId);
    const snapshot = context && context.effectivenessSnapshot || {};
    const definition = snapshot.statDefinitions && snapshot.statDefinitions.supported
      && snapshot.statDefinitions.supported[statDefId];
    if (!definition) {
      const result = freeze({
        schemaVersion: 1, runtimeVersion: snapshot.runtimeVersion || null, statDefId,
        state: 'unknown', completeness: 'unknown', confidence: 'unknown',
        resolvedPrefixValue: null, frontierIndex: null, evaluatedOperationCount: 0,
        numericClaim: 'noNumericClaim', applied: [], frontier: null, notEvaluated: [],
        precision: [], dependencyPath: stack.concat(statDefId), evidence: [],
        unresolved: [{ reasonCode: 'unsupportedStatDef', message: 'unsupportedStatDef',
          affectedDimension: 'stat', targetDefId: statDefId,
          candidateTargetDefIds: [], operationId: null, evidence: [] }],
      });
      memo.set(statDefId, result);
      return result;
    }

    const path = stack.concat(statDefId);
    let dependencyPath = path;
    const stream = buildStream(context, statDefId, definition);
    const applied = [];
    const unresolved = [];
    const gatheredEvidence = [];
    const precision = [];
    let value = null;
    let frontier = null;
    let frontierIndex = null;

    for (let index = 0; index < stream.length; index++) {
      const operation = stream[index];
      const inputValue = value;
      const applicability = applicabilityFor(operation, context);
      if (applicability.state === 'inapplicable') {
        applied.push(evaluation(operation, 'inapplicable', inputValue, null, inputValue,
          null, null));
        continue;
      }
      let reasonCode = applicability.reasonCode || null;
      let operandValue = operation.operand && operation.operand.value;
      let outputValue = null;
      let dependency = null;
      let operationPrecision = [];

      if (!reasonCode && operation.kind === 'sourceFamilyFrontier') {
        reasonCode = 'sourceFamilyIncomplete';
      }
      if (!reasonCode && operation.semanticsSupport !== 'supported') {
        reasonCode = 'unsupportedSemantics';
      }
      if (!reasonCode && operation.completeness !== 'complete') {
        reasonCode = 'operationIncomplete';
      }
      if (!reasonCode && (operation.durability === 'current'
        || operation.durability === 'mixed' || operation.durability === 'unknown')) {
        reasonCode = 'nonDurableOperation';
      }

      if (!reasonCode && operation.kind === 'setBase') {
        if (!Number.isFinite(operandValue)) reasonCode = 'missingOperand';
        else outputValue = operandValue;
      } else if (!reasonCode && (operation.kind === 'add' || operation.kind === 'multiply')) {
        if (operation.skillDefId) {
          const skill = StructuralSkillResolver.resolve(context, operation.skillDefId);
          if (!Number.isFinite(skill.levelIgnoringDisable)) reasonCode = 'skillInputUnknown';
          else operandValue = Number(operation.operand.value || 0)
            + Number(operation.operand.scale || 0) * skill.levelIgnoringDisable;
        }
        if (!reasonCode && (!Number.isFinite(value) || !Number.isFinite(operandValue))) {
          reasonCode = 'missingOperand';
        } else if (!reasonCode) {
          outputValue = operation.kind === 'add' ? value + operandValue : value * operandValue;
        }
      } else if (!reasonCode && operation.kind === 'dependencyFactor') {
        dependency = resolveInternal(context, operation.dependencyStatDefId, memo, path);
        if (dependency.dependencyPath.length > dependencyPath.length) {
          dependencyPath = dependency.dependencyPath;
        }
        if (dependency.frontier || !Number.isFinite(dependency.resolvedPrefixValue)) {
          reasonCode = dependency.frontier
            && dependency.frontier.reasonCode === 'dependencyCycle'
            ? 'dependencyCycle' : 'unresolvedDependency';
        } else if (!Number.isFinite(value)) reasonCode = 'missingInputValue';
        else {
          operandValue = dependency.resolvedPrefixValue;
          outputValue = value * operandValue;
          operationPrecision = clone(dependency.precision || []);
        }
      } else if (!reasonCode && operation.kind === 'transform') {
        if (!Number.isFinite(value)) reasonCode = 'missingInputValue';
        else if (operation.statPartClass === 'StatPart_Age') {
          operandValue = curveValue(operation.operand.curvePoints
            || operation.descriptor && operation.descriptor.curvePoints, applicability.age);
          if (!Number.isFinite(operandValue)) reasonCode = 'ageCurveUnknown';
          else outputValue = value * operandValue;
        } else if (operation.statPartClass === 'StatPart_Slave') {
          if (!Number.isFinite(operandValue)) reasonCode = 'missingOperand';
          else outputValue = value * operandValue;
        } else {
          reasonCode = 'unsupportedSemantics';
        }
      } else if (!reasonCode && operation.kind === 'curve') {
        operandValue = curveValue(operation.operand.curvePoints, value);
        if (!Number.isFinite(operandValue)) reasonCode = 'curveInputUnknown';
        else outputValue = operandValue;
      } else if (!reasonCode && operation.kind === 'roundToFiveOver') {
        if (!Number.isFinite(value) || !Number.isFinite(operandValue)) reasonCode = 'missingOperand';
        else outputValue = value > operandValue ? Math.round(value / 5) * 5 : value;
      } else if (!reasonCode && operation.kind === 'roundInteger') {
        if (!Number.isFinite(value)) reasonCode = 'missingInputValue';
        else outputValue = Math.round(value);
      } else if (!reasonCode && operation.kind === 'clamp') {
        if (!Number.isFinite(value)) reasonCode = 'missingInputValue';
        else {
          const min = Number.isFinite(operation.operand.min) ? operation.operand.min : -Infinity;
          const max = Number.isFinite(operation.operand.max) ? operation.operand.max : Infinity;
          outputValue = Math.max(min, Math.min(max, value));
        }
      } else if (!reasonCode && (operation.kind === 'capacityOffset'
        || operation.kind === 'capacityFactor')) {
        const fact = structuralCapacityFact(context, operation.capacityDefId);
        if (!fact || fact.state === 'unknown') reasonCode = 'capacityInputUnknown';
        else if (fact.state === 'notApplicable') reasonCode = 'capacityNotApplicable';
        else if (fact.state !== 'resolved' || !Number.isFinite(fact.value)) {
          reasonCode = 'capacityInputUnknown';
        } else if (!Number.isFinite(value)) reasonCode = 'missingInputValue';
        else {
          const capacityValue = fact.value;
          const operand = operation.operand || {};
          operationPrecision = [capacityNotice(operation.capacityDefId, fact)];
          operandValue = capacityValue;
          if (operation.kind === 'capacityOffset') {
            if (!Number.isFinite(operand.scale)) reasonCode = 'missingOperand';
            else {
              const maximum = Number.isFinite(operand.max) ? operand.max : Infinity;
              outputValue = value + (Math.min(capacityValue, maximum) - 1) * operand.scale;
            }
          } else if (!Number.isFinite(operand.weight)) reasonCode = 'missingOperand';
          else {
            let factor = capacityValue;
            const allowedDefect = Number.isFinite(operand.allowedDefect)
              ? operand.allowedDefect : 0;
            if (allowedDefect !== 0 && factor < 1) {
              factor = inverseLerp(0, 1 - allowedDefect, factor);
            }
            if (Number.isFinite(operand.max)) factor = Math.min(factor, operand.max);
            if (operand.useReciprocal === true) {
              factor = Math.abs(factor) < 0.001 ? 5 : Math.min(1 / factor, 5);
            }
            outputValue = value + (value * factor - value) * operand.weight;
          }
        }
      } else if (!reasonCode) {
        reasonCode = 'unsupportedOperationKind';
      }

      if (reasonCode) {
        frontierIndex = index;
        frontier = evaluation(operation, 'frontier', inputValue, operandValue, null,
          dependency, reasonCode, operationPrecision);
        unresolved.push({ reasonCode, message: reasonCode, affectedDimension: 'stat',
          targetDefId: statDefId, candidateTargetDefIds: operation.dependencyStatDefId
            ? [operation.dependencyStatDefId] : [], operationId: operation.operationId,
          evidence: clone(operation.evidence || []) });
        break;
      }
      value = outputValue;
      for (const notice of operationPrecision) {
        if (!precision.some(item => item.capacityDefId === notice.capacityDefId
          && item.roundedValue === notice.roundedValue)) precision.push(notice);
      }
      gatheredEvidence.push(...(operation.evidence || []));
      applied.push(evaluation(operation, 'applied', inputValue, operandValue,
        outputValue, dependency, null, operationPrecision));
    }

    const notEvaluated = frontierIndex == null ? [] : stream.slice(frontierIndex + 1)
      .map(operation => evaluation(operation, 'notEvaluated', null, null, null, null,
        'afterFrontier'));
    const hasValue = Number.isFinite(value);
    const state = frontier ? (hasValue ? 'partial' : 'unknown')
      : (hasValue ? (precision.length ? 'partial' : 'resolved') : 'unknown');
    const result = freeze({
      schemaVersion: 1, runtimeVersion: snapshot.runtimeVersion || null, statDefId,
      state, completeness: state === 'resolved' ? 'complete'
        : state === 'partial' ? 'partial' : 'unknown',
      confidence: !frontier && hasValue ? 'verified' : 'unknown',
      resolvedPrefixValue: hasValue ? value : null,
      frontierIndex,
      evaluatedOperationCount: applied.length + (frontier ? 1 : 0),
      numericClaim: !frontier && precision.length
        ? 'exactAgainstRoundedC3CapacityInput'
        : state === 'resolved' ? 'exactRuntimeDurableValue'
        : hasValue ? 'contiguousPrefixOnly' : 'noNumericClaim',
      applied, frontier, notEvaluated, precision, dependencyPath,
      evidence: clone(gatheredEvidence), unresolved,
    });
    memo.set(statDefId, result);
    return result;
  }

  function resolve(context, statDefId) {
    return resolveInternal(context || {}, statDefId, new Map(), []);
  }

  return Object.freeze({ resolve, _buildStream: buildStream, _curveValue: curveValue });
})();

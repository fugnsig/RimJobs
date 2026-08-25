/**
 * C3 body identity and capacity resolution boundary.
 *
 * This module is definition-driven. Race and body names are opaque identifiers;
 * semantic decisions come from scanned metadata and completeness markers.
 */
// Audited against RimWorld 1.6.4871 rev590 Assembly-CSharp.dll.
// Exact worker identities, primary applicability tags, dependencies and utility
// parameters are intentionally preserved here. Matching is exact.
const _CAPACITY_WORKERS = Object.freeze({
  PawnCapacityWorker_Consciousness: Object.freeze({
    primaryTag: 'ConsciousnessSource',
    dependencies: ['BloodPumping', 'Breathing', 'BloodFiltration'],
    resolve(context) { return context.resolver._resolveConsciousness(context); },
  }),
  PawnCapacityWorker_Manipulation: Object.freeze({
    primaryTag: 'ManipulationLimbCore',
    dependencies: ['Consciousness'],
    resolve(context) {
      return context.resolver._resolveLimbWorker(context, {
        coreTag: 'ManipulationLimbCore',
        segmentTag: 'ManipulationLimbSegment',
        digitTag: 'ManipulationLimbDigit',
        appendageWeight: 0.8,
        dependency: 'Consciousness',
      });
    },
  }),
  PawnCapacityWorker_Moving: Object.freeze({
    primaryTag: 'MovingLimbCore',
    dependencies: ['Breathing', 'BloodPumping', 'Consciousness'],
    resolve(context) { return context.resolver._resolveMoving(context); },
  }),
  PawnCapacityWorker_Sight: Object.freeze({
    primaryTag: 'SightSource',
    dependencies: [],
    resolve(context) { return context.resolver._resolveTagWorker(context, 'SightSource', Infinity, 0.75); },
  }),
  PawnCapacityWorker_Talking: Object.freeze({
    primaryTag: 'TalkingSource',
    dependencies: ['Consciousness'],
    resolve(context) { return context.resolver._resolveTalking(context); },
  }),
  PawnCapacityWorker_Hearing: Object.freeze({
    primaryTag: 'HearingSource',
    dependencies: [],
    resolve(context) { return context.resolver._resolveTagWorker(context, 'HearingSource', Infinity, 0.75); },
  }),
});

// These audited workers are internal graph dependencies of the six public C3
// capacities. They are resolved to support the verified Consciousness and
// Moving algorithms but are not added to the public six-worker registry.
const _CAPACITY_DEPENDENCY_WORKERS = Object.freeze({
  PawnCapacityWorker_BloodPumping: Object.freeze({
    primaryTag: 'BloodPumpingSource',
    dependencies: [],
    resolve(context) {
      return context.resolver._resolveTagWorker(context, 'BloodPumpingSource', Infinity, -1);
    },
  }),
  PawnCapacityWorker_Breathing: Object.freeze({
    primaryTag: 'BreathingSource',
    dependencies: [],
    resolve(context) {
      const source = context.resolver._calculateTagEfficiency(context, 'BreathingSource', Infinity, -1);
      const pathway = context.resolver._calculateTagEfficiency(context, 'BreathingPathway', 1, -1);
      const cage = context.resolver._calculateTagEfficiency(context, 'BreathingSourceCage', 1, -1);
      if (source.state !== 'resolved') return source;
      if (pathway.state !== 'resolved') return pathway;
      if (cage.state !== 'resolved') return cage;
      return context.resolver._resolved(source.value * pathway.value * cage.value,
        source.evidence.concat(pathway.evidence, cage.evidence), []);
    },
  }),
  PawnCapacityWorker_BloodFiltration: Object.freeze({
    dependencies: [],
    assessApplicability(context) {
      const resolver = context.resolver;
      if (!resolver._metadataComplete(context)) {
        return { state: 'unknown', reason: 'insufficientCapacityMetadata' };
      }
      const hasKidney = resolver._partsWithTag(context, 'BloodFiltrationKidney').length > 0;
      const hasLiver = resolver._partsWithTag(context, 'BloodFiltrationLiver').length > 0;
      const hasSource = resolver._partsWithTag(context, 'BloodFiltrationSource').length > 0;
      return hasKidney && hasLiver || hasSource
        ? { state: 'applies', reason: null }
        : { state: 'notApplicable', reason: 'bodyCannotHaveCapacity' };
    },
    resolve(context) {
      const resolver = context.resolver;
      const hasKidney = resolver._partsWithTag(context, 'BloodFiltrationKidney').length > 0;
      if (!hasKidney) {
        return resolver._calculateTagEfficiency(context, 'BloodFiltrationSource', Infinity, -1);
      }
      const kidney = resolver._calculateTagEfficiency(context, 'BloodFiltrationKidney', Infinity, -1);
      const liver = resolver._calculateTagEfficiency(context, 'BloodFiltrationLiver', Infinity, -1);
      if (kidney.state !== 'resolved') return kidney;
      if (liver.state !== 'resolved') return liver;
      return resolver._resolved(kidney.value * liver.value, kidney.evidence.concat(liver.evidence), []);
    },
  }),
});

const CapacityResolver = {
  workers: _CAPACITY_WORKERS,

  _unknownIdentity(completeness, diagnostics) {
    return {
      state: 'unknown',
      defName: null,
      bodyDef: null,
      completeness: completeness || 'unknown',
      source: null,
      diagnostics: diagnostics || [],
    };
  },

  resolveBodyIdentity(pawnEvidence, definitions) {
    const defs = definitions || {};
    const raceBodyMap = defs.raceBodyMap || {};
    const bodyDefs = defs.bodyDefs || {};
    const bodyEvidence = pawnEvidence && Array.isArray(pawnEvidence.bodyEvidence)
      ? pawnEvidence.bodyEvidence
      : [];
    const raceDefName = pawnEvidence && pawnEvidence.pawnState
      ? pawnEvidence.pawnState.raceDefName
      : null;
    const mapping = raceDefName ? raceBodyMap[raceDefName] : null;
    const diagnostics = [];

    const explicitNames = [];
    for (let i = 0; i < bodyEvidence.length; i++) {
      const obs = bodyEvidence[i] || {};
      if (obs.bodyDefReference !== 'explicit' || !obs.bodyDefName) continue;
      if (explicitNames.indexOf(obs.bodyDefName) < 0) explicitNames.push(obs.bodyDefName);
    }
    if (explicitNames.length > 1) {
      return this._unknownIdentity('unknown', ['conflictingExplicitBodyEvidence']);
    }
    const explicitName = explicitNames.length ? explicitNames[0] : null;

    if (mapping && mapping._completeness === 'complete' && mapping.bodyDefName) {
      if (explicitName && explicitName !== mapping.bodyDefName) {
        return this._unknownIdentity('unknown', ['raceAndExplicitBodyConflict']);
      }
      const mappedBody = bodyDefs[mapping.bodyDefName];
      if (mappedBody && mappedBody._completeness === 'complete') {
        return {
          state: 'resolved',
          defName: mapping.bodyDefName,
          bodyDef: mappedBody,
          completeness: 'complete',
          source: 'raceDefinition',
          diagnostics: diagnostics,
        };
      }

      const compatibilityBodies = defs.legacyBodyDefs || {};
      const fallbackBody = mapping.legacyIndexFallback
        ? compatibilityBodies[mapping.legacyIndexFallback]
        : null;
      if (fallbackBody && fallbackBody._completeness === 'complete') {
        return {
          state: 'resolved',
          defName: mapping.bodyDefName || fallbackBody.defName || null,
          bodyDef: fallbackBody,
          completeness: 'complete',
          source: 'legacyCompatibility',
          diagnostics: ['canonicalBodyDefinitionUnavailable'],
        };
      }
      diagnostics.push('bodyDefinitionUnavailableOrIncomplete');
    } else if (mapping) {
      diagnostics.push('raceBodyMappingIncomplete');
    } else if (raceDefName) {
      diagnostics.push('raceBodyMappingUnavailable');
    } else {
      diagnostics.push('raceIdentityUnavailable');
    }

    if (explicitName) {
      const explicitBody = bodyDefs[explicitName];
      if (explicitBody && explicitBody._completeness === 'complete') {
        return {
          state: 'resolved',
          defName: explicitName,
          bodyDef: explicitBody,
          completeness: 'complete',
          source: 'explicitBodyEvidence',
          diagnostics: diagnostics,
        };
      }
      diagnostics.push('explicitBodyDefinitionUnavailableOrIncomplete');
    }

    const completeness = mapping && mapping._completeness === 'partial'
      ? 'partial'
      : 'unknown';
    return this._unknownIdentity(completeness, diagnostics);
  },

  buildPartIndex(bodyDef) {
    const parts = [];
    const walk = (node, parentIndex) => {
      if (!node) return;
      const index = parts.length;
      parts.push({
        index: index,
        parentIndex: parentIndex,
        defName: node.def || null,
        node: node,
      });
      const children = Array.isArray(node.parts) ? node.parts : [];
      for (let i = 0; i < children.length; i++) walk(children[i], index);
    };
    if (bodyDef && bodyDef.corePart) walk(bodyDef.corePart, -1);
    Object.defineProperty(parts, 'completeness', {
      value: bodyDef && bodyDef._completeness ? bodyDef._completeness : 'unknown',
      enumerable: false,
    });
    return parts;
  },

  joinObservations(bodyEvidence, bodyIdentity, partIndex) {
    const observations = Array.isArray(bodyEvidence) ? bodyEvidence : [];
    const index = Array.isArray(partIndex) ? partIndex : [];
    return observations.map(obsValue => {
      const obs = obsValue || {};
      const joined = Object.assign({}, obs);
      if (obs.rawPartIndex == null) {
        joined.joinState = 'noPartRef';
        return joined;
      }
      if (!bodyIdentity || bodyIdentity.state !== 'resolved') {
        joined.joinState = 'bodyUnknown';
        return joined;
      }
      if (obs.bodyDefReference === 'explicit') {
        if (!obs.bodyDefName || obs.bodyDefName !== bodyIdentity.defName) {
          joined.joinState = 'bodyConflict';
          return joined;
        }
      } else if (obs.bodyDefReference !== 'pawnDefault') {
        joined.joinState = 'bodyUnknown';
        return joined;
      }
      if (bodyIdentity.completeness !== 'complete' || index.completeness !== 'complete') {
        joined.joinState = 'indexUnreliable';
        return joined;
      }
      if (!Number.isInteger(obs.rawPartIndex)
        || obs.rawPartIndex < 0
        || obs.rawPartIndex >= index.length) {
        joined.joinState = 'indexOutOfRange';
        return joined;
      }
      const part = index[obs.rawPartIndex];
      joined.joinState = 'resolved';
      joined.partIdentity = {
        bodyDef: bodyIdentity.defName,
        partIndex: obs.rawPartIndex,
      };
      joined.partRecord = part;
      joined.bodyPartDefName = part.defName;
      return joined;
    });
  },

  _resolved(value, evidence, derivedFrom) {
    return {
      state: 'resolved',
      value: value,
      reason: null,
      confidence: 'verified',
      evidence: evidence || [],
      derivedFrom: derivedFrom || [],
    };
  },

  _unknown(reason, evidence, derivedFrom) {
    return {
      state: 'unknown',
      value: null,
      reason: reason,
      confidence: 'unknown',
      evidence: evidence || [],
      derivedFrom: derivedFrom || [],
    };
  },

  _bodyPartDef(context, record) {
    return record && context.bodyPartDefs
      ? context.bodyPartDefs[record.defName]
      : null;
  },

  _metadataComplete(context) {
    if (!context.bodyDef || context.bodyDef._completeness !== 'complete') return false;
    if (context.completeness && context.completeness.bodyDefs
      && context.completeness.bodyDefs !== 'complete') return false;
    if (context.completeness && context.completeness.bodyPartDefs
      && context.completeness.bodyPartDefs !== 'complete') return false;
    const index = context.partIndex || [];
    for (let i = 0; i < index.length; i++) {
      const def = this._bodyPartDef(context, index[i]);
      if (!def || def._completeness !== 'complete' || !Array.isArray(def.tags)) return false;
    }
    return true;
  },

  _partsWithTag(context, tag) {
    const result = [];
    const index = context.partIndex || [];
    for (let i = 0; i < index.length; i++) {
      const def = this._bodyPartDef(context, index[i]);
      if (def && Array.isArray(def.tags) && def.tags.indexOf(tag) >= 0) result.push(index[i]);
    }
    return result;
  },

  assessApplicability(workerClass, context) {
    const worker = this.workers[workerClass];
    if (!worker) {
      return { state: 'unknown', reason: 'unsupportedCapacityWorker', relevantMetadataComplete: false };
    }
    if (!this._metadataComplete(context)) {
      return { state: 'unknown', reason: 'insufficientCapacityMetadata', relevantMetadataComplete: false };
    }
    if (!this._partsWithTag(context, worker.primaryTag).length) {
      return { state: 'notApplicable', reason: 'bodyCannotHaveCapacity', relevantMetadataComplete: true };
    }
    return { state: 'applies', reason: null, relevantMetadataComplete: true };
  },

  _catalogIndex(catalog) {
    if (!catalog) return {};
    if (!Array.isArray(catalog)) return catalog;
    const result = {};
    for (let i = 0; i < catalog.length; i++) {
      const entry = catalog[i];
      const name = entry && (entry.def || entry.defName);
      if (name) result[name] = entry;
    }
    return result;
  },

  _activeStage(definition, severity) {
    const stages = definition && Array.isArray(definition.capModStages)
      ? definition.capModStages
      : [];
    if (!stages.length) return { state: 'resolved', stage: null, stageIndex: -1 };
    if (severity == null || !Number.isFinite(severity)) return { state: 'unknown' };
    let active = null;
    let activeIndex = -1;
    for (let i = 0; i < stages.length; i++) {
      const min = stages[i].minSeverity;
      if (!Number.isFinite(min)) return { state: 'unknown' };
      if (min <= severity && (!active || min >= active.minSeverity)) {
        active = stages[i];
        activeIndex = i;
      }
    }
    return { state: 'resolved', stage: active, stageIndex: activeIndex };
  },

  _evidenceOnPart(context, partIndex) {
    return (context.joinedEvidence || []).filter(item => item
      && item.joinState === 'resolved'
      && item.partIdentity
      && item.partIdentity.partIndex === partIndex);
  },

  _replacementEfficiency(context, evidence) {
    const defName = evidence.replacementDef || evidence.hediffDef || evidence.implantDef;
    const entry = defName && context.prostheticEfficiency
      ? context.prostheticEfficiency[defName]
      : null;
    const value = typeof entry === 'number' ? entry : (entry && entry.efficiency);
    return Number.isFinite(value)
      ? { state: 'resolved', value: value, defName: defName }
      : { state: 'unknown', defName: defName };
  },

  _ancestorIndexes(partIndex, index) {
    const result = [];
    let parent = index[partIndex] ? index[partIndex].parentIndex : -1;
    while (parent >= 0 && index[parent]) {
      result.push(parent);
      parent = index[parent].parentIndex;
    }
    return result;
  },

  _firstReplacement(context, partIndex) {
    const evidence = this._evidenceOnPart(context, partIndex);
    for (let i = 0; i < evidence.length; i++) {
      if (evidence[i].kind === 'replacement') return evidence[i];
    }
    return null;
  },

  _hasMissing(context, partIndex) {
    return this._evidenceOnPart(context, partIndex).some(item => item.kind === 'missing');
  },

  calculatePartEfficiency(inputs, part) {
    const context = Object.assign({}, inputs || {});
    const index = context.partIndex || [];
    const record = typeof part === 'number' ? index[part] : part;
    if (!record || !Number.isInteger(record.index)) return this._unknown('unknownPartEfficiency');

    const ancestors = this._ancestorIndexes(record.index, index);
    for (let i = 0; i < ancestors.length; i++) {
      const ancestorReplacement = this._firstReplacement(context, ancestors[i]);
      if (!ancestorReplacement) continue;
      const inherited = this._replacementEfficiency(context, ancestorReplacement);
      if (inherited.state !== 'resolved') {
        return this._unknown('unknownPartEfficiency', [{
          kind: 'unknownProsthetic',
          hediffDef: inherited.defName || null,
          bodyDef: context.bodyDef && context.bodyDef.defName,
          partIndex: ancestors[i],
        }]);
      }
      return this._resolved(inherited.value, []);
    }

    if (record.parentIndex >= 0 && this._hasMissing(context, record.parentIndex)) {
      return this._resolved(0, []);
    }

    let value = 1;
    const contributions = [];
    const evidence = this._evidenceOnPart(context, record.index);
    for (let i = 0; i < evidence.length; i++) {
      if (evidence[i].kind !== 'replacement') continue;
      const replacement = this._replacementEfficiency(context, evidence[i]);
      if (replacement.state !== 'resolved') {
        return this._unknown('unknownPartEfficiency', [{
          kind: 'unknownProsthetic',
          hediffDef: replacement.defName || null,
          bodyDef: context.bodyDef && context.bodyDef.defName,
          partIndex: record.index,
        }]);
      }
      value *= replacement.value;
      contributions.push({
        kind: 'partReplacement',
        hediffDef: replacement.defName,
        partIndex: record.index,
        efficiency: replacement.value,
      });
    }

    let offset = 0;
    let ignoreMissingHP = false;
    const catalog = this._catalogIndex(context.hediffCatalog);
    let hasInjury = false;
    for (let i = 0; i < evidence.length; i++) {
      const item = evidence[i];
      if (item.kind === 'missing') continue;
      const hediffName = item.hediffDef || item.replacementDef || item.implantDef;
      const definition = hediffName ? catalog[hediffName] : null;
      if (item.kind === 'hediff' && (!definition || definition._completeness !== 'complete')) {
        return this._unknown('unknownPartEfficiency', [{ kind: 'unknownHediff', hediffDef: hediffName || null }]);
      }
      if (definition && definition.category === 'injury' && item.severity !== 0) hasInjury = true;
      if (!definition) continue;
      const active = this._activeStage(definition, item.severity);
      if (active.state !== 'resolved') {
        return this._unknown('unknownPartEfficiency', [{ kind: 'unknownHediffStage', hediffDef: hediffName }]);
      }
      if (active.stage) {
        if (Number.isFinite(active.stage.partEfficiencyOffset)) offset += active.stage.partEfficiencyOffset;
        if (active.stage.partIgnoreMissingHP === true) ignoreMissingHP = true;
      }
    }

    if (!ignoreMissingHP) {
      if (hasInjury) {
        return this._unknown('unknownPartEfficiency', [{
          kind: 'missingPartHealthInput',
          bodyDef: context.bodyDef && context.bodyDef.defName,
          partIndex: record.index,
        }]);
      }
      if (this._hasMissing(context, record.index)) value = 0;
    }
    value += offset;
    return this._resolved(Math.max(value, 0), contributions);
  },

  _calculateImmediatePartEfficiency(context, record) {
    const ancestors = this._ancestorIndexes(record.index, context.partIndex || []);
    if (ancestors.some(index => !!this._firstReplacement(context, index))) return this._resolved(1, []);
    return this.calculatePartEfficiency(context, record);
  },

  _calculateTagEfficiency(context, tag, maximum, bestWeight) {
    const parts = this._partsWithTag(context, tag);
    if (!parts.length) return this._resolved(1, []);
    let sum = 0;
    let best = 0;
    const evidence = [];
    for (let i = 0; i < parts.length; i++) {
      const efficiency = this.calculatePartEfficiency(context, parts[i]);
      if (efficiency.state !== 'resolved') return efficiency;
      sum += efficiency.value;
      best = Math.max(best, efficiency.value);
      const sourceObservation = this._evidenceOnPart(context, parts[i].index)[0] || null;
      const contribution = {
        kind: 'partContribution',
        bodyDef: context.bodyDef && context.bodyDef.defName,
        partIndex: parts[i].index,
        partDef: parts[i].defName,
        tags: [tag],
        adjustedEfficiency: efficiency.value,
      };
      if (sourceObservation) contribution.sourceRef = {
        sourceKind: 'bodyEvidence',
        sourceId: sourceObservation.hediffDef || sourceObservation.replacementDef
          || sourceObservation.implantDef || sourceObservation.kind,
        bodyDef: context.bodyDef && context.bodyDef.defName,
        partIndex: parts[i].index,
        sourceObservationIndex: sourceObservation.sourceObservationIndex,
        provenance: sourceObservation.provenance || null,
      };
      evidence.push(contribution);
    }
    const average = bestWeight >= 0 && parts.length >= 2
      ? best * bestWeight + ((sum - best) / (parts.length - 1)) * (1 - bestWeight)
      : sum / parts.length;
    return this._resolved(Math.min(average, maximum), evidence);
  },

  _subtreePartsWithTag(context, root, tag) {
    const result = [];
    const index = context.partIndex || [];
    const visit = record => {
      const def = this._bodyPartDef(context, record);
      if (def && def.tags.indexOf(tag) >= 0) result.push(record);
      for (let i = 0; i < index.length; i++) {
        if (index[i].parentIndex === record.index) visit(index[i]);
      }
    };
    visit(root);
    return result;
  },

  _calculateLimbEfficiency(context, coreTag, segmentTag, digitTag, appendageWeight) {
    const cores = this._partsWithTag(context, coreTag);
    if (!cores.length) return { result: this._resolved(0, []), functionalPercentage: 0 };
    let sum = 0;
    let functional = 0;
    const allEvidence = [];
    for (let i = 0; i < cores.length; i++) {
      const core = cores[i];
      let efficiency = this._calculateImmediatePartEfficiency(context, core);
      if (efficiency.state !== 'resolved') return { result: efficiency, functionalPercentage: null };
      let value = efficiency.value;

      let segmentRoot = core;
      while (segmentRoot.parentIndex >= 0) {
        const parent = context.partIndex[segmentRoot.parentIndex];
        const parentDef = this._bodyPartDef(context, parent);
        if (!parentDef || parentDef.tags.indexOf(segmentTag) < 0) break;
        segmentRoot = parent;
      }
      const segments = this._subtreePartsWithTag(context, segmentRoot, segmentTag);
      for (let j = 0; j < segments.length; j++) {
        const segmentEfficiency = this._calculateImmediatePartEfficiency(context, segments[j]);
        if (segmentEfficiency.state !== 'resolved') {
          return { result: segmentEfficiency, functionalPercentage: null };
        }
        value *= segmentEfficiency.value;
      }

      const digits = this._subtreePartsWithTag(context, core, digitTag);
      if (digits.length) {
        let digitSum = 0;
        for (let j = 0; j < digits.length; j++) {
          const digitEfficiency = this._calculateImmediatePartEfficiency(context, digits[j]);
          if (digitEfficiency.state !== 'resolved') {
            return { result: digitEfficiency, functionalPercentage: null };
          }
          digitSum += digitEfficiency.value;
        }
        value = value * (1 - appendageWeight) + value * (digitSum / digits.length) * appendageWeight;
      }
      sum += value;
      if (value > 0) functional++;
      const sourceObservation = this._evidenceOnPart(context, core.index)[0] || null;
      const contribution = {
        kind: 'partContribution',
        bodyDef: context.bodyDef && context.bodyDef.defName,
        partIndex: core.index,
        partDef: core.defName,
        tags: [coreTag],
        adjustedEfficiency: value,
      };
      if (sourceObservation) contribution.sourceRef = {
        sourceKind: 'bodyEvidence',
        sourceId: sourceObservation.hediffDef || sourceObservation.replacementDef
          || sourceObservation.implantDef || sourceObservation.kind,
        bodyDef: context.bodyDef && context.bodyDef.defName,
        partIndex: core.index,
        sourceObservationIndex: sourceObservation.sourceObservationIndex,
        provenance: sourceObservation.provenance || null,
      };
      allEvidence.push(contribution);
    }
    return {
      result: this._resolved(sum / cores.length, allEvidence),
      functionalPercentage: functional / cores.length,
    };
  },

  _dependency(context, capacity) {
    const result = context.resolvedDeps && context.resolvedDeps[capacity];
    if (typeof result === 'number') return this._resolved(result, [], [capacity]);
    if (result && result.state === 'resolved' && Number.isFinite(result.value)) return result;
    return this._unknown('unresolvedDependency', [], [capacity]);
  },

  _resolveTagWorker(context, tag, maximum, bestWeight) {
    return this._calculateTagEfficiency(context, tag, maximum, bestWeight);
  },

  _resolveConsciousness(context) {
    const tagged = this._calculateTagEfficiency(context, 'ConsciousnessSource', Infinity, -1);
    if (tagged.state !== 'resolved') return tagged;
    let pain = context.painTotal;
    if (!Number.isFinite(pain)) {
      const activeHediffs = (context.joinedEvidence || []).filter(item => item && item.kind === 'hediff');
      if (activeHediffs.length) return this._unknown('unknownPainTotal');
      pain = 0;
    }
    const painPenalty = Math.max(0, Math.min(0.4, (pain - 0.1) * (0.4 / 0.9)));
    let value = tagged.value - (painPenalty >= 0.01 ? painPenalty : 0);
    const bloodPumping = this._dependency(context, 'BloodPumping');
    const breathing = this._dependency(context, 'Breathing');
    const filtration = this._dependency(context, 'BloodFiltration');
    if (bloodPumping.state !== 'resolved' || breathing.state !== 'resolved' || filtration.state !== 'resolved') {
      return this._unknown('unresolvedDependency', [], ['BloodPumping', 'Breathing', 'BloodFiltration']);
    }
    value *= 0.8 + 0.2 * Math.min(bloodPumping.value, 1);
    value *= 0.8 + 0.2 * Math.min(breathing.value, 1);
    value *= 0.9 + 0.1 * Math.min(filtration.value, 1);
    return this._resolved(value, tagged.evidence, ['BloodPumping', 'Breathing', 'BloodFiltration']);
  },

  _resolveLimbWorker(context, options) {
    const limb = this._calculateLimbEfficiency(
      context,
      options.coreTag,
      options.segmentTag,
      options.digitTag,
      options.appendageWeight
    );
    if (limb.result.state !== 'resolved') return limb.result;
    const dependency = this._dependency(context, options.dependency);
    if (dependency.state !== 'resolved') return dependency;
    return this._resolved(limb.result.value * dependency.value, limb.result.evidence, [options.dependency]);
  },

  _resolveMoving(context) {
    const alwaysDowned = context.alwaysDowned != null
      ? context.alwaysDowned
      : (context.pawnState && context.pawnState.alwaysDowned);
    if (alwaysDowned == null) return this._unknown('unknownLifeStageState');
    if (alwaysDowned === true) return this._resolved(0, [], []);
    const limb = this._calculateLimbEfficiency(
      context,
      'MovingLimbCore',
      'MovingLimbSegment',
      'MovingLimbDigit',
      0.4
    );
    if (limb.result.state !== 'resolved') return limb.result;
    if (limb.functionalPercentage < 0.4999) return this._resolved(0, limb.result.evidence, []);
    const pelvis = this._calculateTagEfficiency(context, 'Pelvis', Infinity, -1);
    const spine = this._calculateTagEfficiency(context, 'Spine', Infinity, -1);
    if (pelvis.state !== 'resolved') return pelvis;
    if (spine.state !== 'resolved') return spine;
    const breathing = this._dependency(context, 'Breathing');
    const bloodPumping = this._dependency(context, 'BloodPumping');
    const consciousness = this._dependency(context, 'Consciousness');
    if (breathing.state !== 'resolved' || bloodPumping.state !== 'resolved'
      || consciousness.state !== 'resolved') {
      return this._unknown('unresolvedDependency', [], ['Breathing', 'BloodPumping', 'Consciousness']);
    }
    let value = limb.result.value * pelvis.value * spine.value;
    value *= 0.8 + 0.2 * breathing.value;
    value *= 0.8 + 0.2 * bloodPumping.value;
    value *= Math.min(consciousness.value, 1);
    return this._resolved(value, limb.result.evidence.concat(pelvis.evidence, spine.evidence),
      ['Breathing', 'BloodPumping', 'Consciousness']);
  },

  _resolveTalking(context) {
    const source = this._calculateTagEfficiency(context, 'TalkingSource', Infinity, -1);
    const pathway = this._calculateTagEfficiency(context, 'TalkingPathway', 1, -1);
    const tongue = this._calculateTagEfficiency(context, 'Tongue', 1, -1);
    if (source.state !== 'resolved') return source;
    if (pathway.state !== 'resolved') return pathway;
    if (tongue.state !== 'resolved') return tongue;
    const consciousness = this._dependency(context, 'Consciousness');
    if (consciousness.state !== 'resolved') return consciousness;
    return this._resolved(source.value * pathway.value * tongue.value * consciousness.value,
      source.evidence.concat(pathway.evidence, tongue.evidence), ['Consciousness']);
  },

  resolveCapacityWorker(capacityDef, workerContext) {
    const workerClass = capacityDef && capacityDef.workerClass;
    const worker = this.workers[workerClass];
    if (!worker) {
      return this._unknown('unsupportedCapacityWorker', [{
        kind: 'workerClass',
        workerClass: workerClass || null,
      }]);
    }
    const context = Object.assign({}, workerContext || {}, {
      capacityDef: capacityDef,
      resolver: this,
    });
    const applicability = this.assessApplicability(workerClass, context);
    if (applicability.state === 'unknown') return this._unknown(applicability.reason);
    if (applicability.state === 'notApplicable') {
      return {
        state: 'notApplicable',
        value: null,
        reason: applicability.reason,
        confidence: 'verified',
        evidence: [],
        derivedFrom: [],
      };
    }
    return worker.resolve(context);
  },

  _roundHundredth(value) {
    const scaled = value * 100;
    const lower = Math.floor(scaled);
    const fraction = scaled - lower;
    let rounded;
    if (Math.abs(fraction - 0.5) < 1e-10) rounded = lower % 2 === 0 ? lower : lower + 1;
    else rounded = Math.round(scaled);
    return rounded / 100;
  },

  applyCapMods(workerResult, capacityDef, capMods, options) {
    // Target 1.6 audit: the awake gate returns immediately. Modifiers run only
    // when the worker result is positive. All offsets accumulate first while
    // post-factors are multiplied and the lowest setMax is retained. The
    // combined factor then applies, followed by setMax, minValue and
    // GenMath.RoundedHundredth. There is no invented non-negative clamp.
    const opts = options || {};
    if (capacityDef && capacityDef.zeroIfCannotBeAwake && opts.snapshotType !== 'structural') {
      if (opts.canBeAwake == null) return this._unknown('unknownAwakeState');
      if (opts.canBeAwake === false) return this._resolved(0, [{ kind: 'awakeGate' }], []);
    }
    if (!workerResult || workerResult.state !== 'resolved') return workerResult;

    let value = workerResult.value;
    const appliedEvidence = (workerResult.evidence || []).slice();
    if (value > 0) {
      let postFactor = 1;
      let setMax = Infinity;
      const modifiers = Array.isArray(capMods) ? capMods : [];
      for (let i = 0; i < modifiers.length; i++) {
        const item = modifiers[i];
        const mod = item.mod || item;
        if (Number.isFinite(mod.offset)) value += mod.offset;
        if (Number.isFinite(mod.postFactor)) postFactor *= mod.postFactor;
        if (Number.isFinite(mod.setMax)) setMax = Math.min(setMax, mod.setMax);
        if (Array.isArray(item.evidence)) appliedEvidence.push.apply(appliedEvidence, item.evidence);
      }
      value *= postFactor;
      value = Math.min(value, setMax);
    }
    const minValue = capacityDef && Number.isFinite(capacityDef.minValue)
      ? capacityDef.minValue
      : 0;
    value = Math.max(value, minValue);
    return this._resolved(this._roundHundredth(value), appliedEvidence, workerResult.derivedFrom || []);
  },

  gatherCapMods(capacityName, evidenceSnapshot, hediffCatalog) {
    const catalog = this._catalogIndex(hediffCatalog);
    const observations = Array.isArray(evidenceSnapshot) ? evidenceSnapshot : [];
    const modifiers = [];
    for (let i = 0; i < observations.length; i++) {
      const observation = observations[i] || {};
      const hediffDef = observation.hediffDef || observation.replacementDef || observation.implantDef;
      if (!hediffDef) continue;
      const definition = catalog[hediffDef];
      if (!definition || definition._completeness !== 'complete') {
        return this._unknown('unknownHediffDefinition', [{ kind: 'hediffDefinition', hediffDef: hediffDef }]);
      }
      const stages = Array.isArray(definition.capModStages) ? definition.capModStages : [];
      const hasRelevantStage = stages.some(stage => (stage.capMods || [])
        .some(mod => mod.capacity === capacityName));
      if (!hasRelevantStage) continue;
      const active = this._activeStage(definition, observation.severity);
      if (active.state !== 'resolved') {
        return this._unknown('unknownHediffSeverity', [{
          kind: 'hediffSeverity',
          hediffDef: hediffDef,
          sourceObservationIndex: observation.sourceObservationIndex,
        }]);
      }
      if (!active.stage) continue;
      const stageMods = (active.stage.capMods || []).filter(mod => mod.capacity === capacityName);
      if (active.stage.capacityFactorEffectMultiplier
        && stageMods.some(mod => Number.isFinite(mod.postFactor))) {
        return this._unknown('unknownCapacityFactorMultiplier', [{
          kind: 'capacityFactorEffectMultiplier',
          hediffDef: hediffDef,
          sourceObservationIndex: observation.sourceObservationIndex,
          stage: active.stageIndex,
          statDef: active.stage.capacityFactorEffectMultiplier,
        }]);
      }
      for (let j = 0; j < stageMods.length; j++) {
        const mod = stageMods[j];
        const evidence = [];
        if (Number.isFinite(mod.offset)) evidence.push({
          kind: 'capMod',
          hediffDef: hediffDef,
          sourceObservationIndex: observation.sourceObservationIndex,
          stage: active.stageIndex,
          modType: 'offset',
          modValue: mod.offset,
        });
        if (Number.isFinite(mod.postFactor)) evidence.push({
          kind: 'capMod',
          hediffDef: hediffDef,
          sourceObservationIndex: observation.sourceObservationIndex,
          stage: active.stageIndex,
          modType: 'postFactor',
          modValue: mod.postFactor,
        });
        if (Number.isFinite(mod.setMax)) evidence.push({
          kind: 'capMod',
          hediffDef: hediffDef,
          sourceObservationIndex: observation.sourceObservationIndex,
          stage: active.stageIndex,
          modType: 'setMax',
          modValue: mod.setMax,
        });
        modifiers.push({ mod: mod, evidence: evidence });
      }
    }
    return { state: 'resolved', modifiers: modifiers };
  },

  _capacityDefIndex(capacityDefs) {
    if (!capacityDefs) return {};
    if (!Array.isArray(capacityDefs)) return capacityDefs;
    const result = {};
    for (let i = 0; i < capacityDefs.length; i++) {
      const definition = capacityDefs[i];
      if (definition && definition.defName) result[definition.defName] = definition;
    }
    return result;
  },

  resolveCapacityGraph(capacityDefs, baseContext, options) {
    const definitions = this._capacityDefIndex(capacityDefs);
    const opts = options || {};
    const registry = opts.workerRegistry || this.workers;
    const states = {};
    const cache = {};
    const stack = [];
    const resolver = this;

    function markCycle(name) {
      const start = stack.indexOf(name);
      const cycle = start >= 0 ? stack.slice(start) : [name];
      for (let i = 0; i < cycle.length; i++) {
        states[cycle[i]] = 'resolved';
        cache[cycle[i]] = resolver._unknown('cyclicDependency', [], cycle.slice());
      }
    }

    function resolveOne(name) {
      if (states[name] === 'resolved') return cache[name];
      if (states[name] === 'resolving') {
        markCycle(name);
        return cache[name];
      }
      const capacityDef = definitions[name];
      if (!capacityDef) {
        states[name] = 'resolved';
        cache[name] = resolver._unknown('missingCapacityDef', [{ kind: 'capacityDef', capacity: name }]);
        return cache[name];
      }
      states[name] = 'resolving';
      stack.push(name);

      const awakeGateApplies = capacityDef.zeroIfCannotBeAwake
        && opts.snapshotType !== 'structural';
      const forcedReason = opts.forcedUnknown && opts.forcedUnknown[name];
      const worker = registry[capacityDef.workerClass];
      if (awakeGateApplies && opts.canBeAwake == null) {
        cache[name] = resolver._unknown('unknownAwakeState');
      } else if (awakeGateApplies && opts.canBeAwake === false) {
        cache[name] = resolver._resolved(0, [{ kind: 'awakeGate' }], []);
      } else if (forcedReason) {
        cache[name] = resolver._unknown(forcedReason.reason || forcedReason,
          forcedReason.evidence || []);
      } else if (!worker) {
        cache[name] = resolver._unknown('unsupportedCapacityWorker', [{
          kind: 'workerClass',
          workerClass: capacityDef.workerClass || null,
        }]);
      } else {
        const dependencies = Array.isArray(worker.dependencies) ? worker.dependencies : [];
        const resolvedDeps = {};
        let unresolvedDependency = null;
        for (let i = 0; i < dependencies.length; i++) {
          const dependency = resolveOne(dependencies[i]);
          resolvedDeps[dependencies[i]] = dependency;
          if (cache[name] && cache[name].reason === 'cyclicDependency') break;
          if (!dependency || dependency.state !== 'resolved') {
            unresolvedDependency = dependencies[i];
            break;
          }
        }

        if (!(cache[name] && cache[name].reason === 'cyclicDependency')) {
          if (unresolvedDependency) {
            cache[name] = resolver._unknown('unresolvedDependency', [], [unresolvedDependency]);
          } else {
            const context = Object.assign({}, baseContext || {}, {
              resolvedDeps: resolvedDeps,
              capacityDef: capacityDef,
              resolver: resolver,
            });
            let workerResult;
            if (registry === resolver.workers) {
              workerResult = resolver.resolveCapacityWorker(capacityDef, context);
            } else if (typeof worker.assessApplicability === 'function') {
              const applicability = worker.assessApplicability(context);
              if (applicability.state === 'notApplicable') {
                workerResult = {
                  state: 'notApplicable', value: null, reason: applicability.reason,
                  confidence: 'verified', evidence: [], derivedFrom: [],
                };
              } else if (applicability.state !== 'applies') {
                workerResult = resolver._unknown(applicability.reason || 'insufficientCapacityMetadata');
              } else workerResult = worker.resolve(context);
            } else if (worker.primaryTag) {
              if (!resolver._metadataComplete(context)) {
                workerResult = resolver._unknown('insufficientCapacityMetadata');
              } else if (!resolver._partsWithTag(context, worker.primaryTag).length) {
                workerResult = {
                  state: 'notApplicable', value: null, reason: 'bodyCannotHaveCapacity',
                  confidence: 'verified', evidence: [], derivedFrom: [],
                };
              } else workerResult = worker.resolve(context);
            } else {
              workerResult = worker.resolve(context);
            }

            if (workerResult && workerResult.state === 'resolved') {
              const gathered = resolver.gatherCapMods(
                name,
                context.joinedEvidence || [],
                context.hediffCatalog
              );
              cache[name] = gathered.state === 'resolved'
                ? resolver.applyCapMods(workerResult, capacityDef, gathered.modifiers, {
                  snapshotType: opts.snapshotType,
                  canBeAwake: opts.canBeAwake,
                })
                : gathered;
            } else cache[name] = workerResult;
          }
        }
      }

      const stackIndex = stack.lastIndexOf(name);
      if (stackIndex >= 0) stack.splice(stackIndex, 1);
      if (states[name] !== 'resolved') states[name] = 'resolved';
      return cache[name];
    }

    const names = Object.keys(definitions).sort();
    for (let i = 0; i < names.length; i++) resolveOne(names[i]);
    return cache;
  },

  classifyEvidenceForSnapshot(joinedEvidence) {
    const evidence = Array.isArray(joinedEvidence) ? joinedEvidence : [];
    const structuralEvidence = [];
    const currentEvidence = [];
    const unresolvedPersistenceEvidence = [];
    for (let i = 0; i < evidence.length; i++) {
      const item = evidence[i];
      if (!item) continue;
      currentEvidence.push(item);
      if (item.persistence === 'persistent') structuralEvidence.push(item);
      else if (item.persistence !== 'temporary') unresolvedPersistenceEvidence.push(item);
    }
    return {
      structuralEvidence: structuralEvidence,
      currentEvidence: currentEvidence,
      unresolvedPersistenceEvidence: unresolvedPersistenceEvidence,
    };
  },

  _workerConsumedTags(workerClass) {
    const tags = {
      PawnCapacityWorker_Consciousness: ['ConsciousnessSource'],
      PawnCapacityWorker_Manipulation: [
        'ManipulationLimbCore', 'ManipulationLimbSegment', 'ManipulationLimbDigit',
      ],
      PawnCapacityWorker_Moving: [
        'MovingLimbCore', 'MovingLimbSegment', 'MovingLimbDigit', 'Pelvis', 'Spine',
      ],
      PawnCapacityWorker_Sight: ['SightSource'],
      PawnCapacityWorker_Talking: ['TalkingSource', 'TalkingPathway', 'Tongue'],
      PawnCapacityWorker_Hearing: ['HearingSource'],
      PawnCapacityWorker_BloodPumping: ['BloodPumpingSource'],
      PawnCapacityWorker_Breathing: ['BreathingSource', 'BreathingPathway', 'BreathingSourceCage'],
      PawnCapacityWorker_BloodFiltration: [
        'BloodFiltrationKidney', 'BloodFiltrationLiver', 'BloodFiltrationSource',
      ],
    };
    return tags[workerClass] || [];
  },

  isEvidenceRelevant(workerClass, observation, context) {
    if (!observation || observation.rawPartIndex == null
      && !(observation.partIdentity && Number.isInteger(observation.partIdentity.partIndex))) return false;
    const observationIndex = observation.partIdentity && Number.isInteger(observation.partIdentity.partIndex)
      ? observation.partIdentity.partIndex
      : observation.rawPartIndex;
    if (!Number.isInteger(observationIndex)) return false;
    const tags = this._workerConsumedTags(workerClass);
    const relevantParts = [];
    for (let i = 0; i < tags.length; i++) {
      const tagged = this._partsWithTag(context, tags[i]);
      for (let j = 0; j < tagged.length; j++) {
        if (relevantParts.indexOf(tagged[j].index) < 0) relevantParts.push(tagged[j].index);
        const ancestors = this._ancestorIndexes(tagged[j].index, context.partIndex || []);
        for (let k = 0; k < ancestors.length; k++) {
          if (relevantParts.indexOf(ancestors[k]) < 0) relevantParts.push(ancestors[k]);
        }
      }
    }
    return relevantParts.indexOf(observationIndex) >= 0;
  },

  _definitionHasCapMod(definition, capacityName) {
    return !!(definition && Array.isArray(definition.capModStages)
      && definition.capModStages.some(stage => (stage.capMods || [])
        .some(mod => mod.capacity === capacityName)));
  },

  _snapshotUncertainty(capacityName, capacityDef, observations, context, hediffCatalog, reason) {
    const catalog = this._catalogIndex(hediffCatalog);
    const evidence = Array.isArray(observations) ? observations : [];
    for (let i = 0; i < evidence.length; i++) {
      const item = evidence[i] || {};
      const hediffDef = item.hediffDef || item.replacementDef || item.implantDef;
      const definition = hediffDef ? catalog[hediffDef] : null;
      if (this._definitionHasCapMod(definition, capacityName)) {
        return {
          reason: reason,
          evidence: [{
            kind: 'unresolvedPersistence',
            hediffDef: hediffDef,
            sourceObservationIndex: item.sourceObservationIndex,
            affects: 'capMod',
          }],
        };
      }
      if (this.isEvidenceRelevant(capacityDef.workerClass, item, context)) {
        return {
          reason: reason,
          evidence: [{
            kind: 'unresolvedPersistence',
            hediffDef: hediffDef || null,
            sourceObservationIndex: item.sourceObservationIndex,
            bodyDef: context.bodyDef && context.bodyDef.defName,
            partIndex: item.partIdentity ? item.partIdentity.partIndex : item.rawPartIndex,
            affects: 'partEfficiency',
          }],
        };
      }
      if (!definition && item.rawPartIndex == null && !item.partIdentity) {
        return {
          reason: reason,
          evidence: [{
            kind: 'unresolvedPersistence',
            hediffDef: hediffDef || null,
            sourceObservationIndex: item.sourceObservationIndex,
            affects: 'unknownBodyWideSemantics',
          }],
        };
      }
    }
    return null;
  },

  _capacityOutputKey(defName) {
    if (!defName) return '';
    return defName.charAt(0).toLowerCase() + defName.slice(1);
  },

  resolvePawnCapacities(pawnEvidence, definitions) {
    const defs = definitions || {};
    const evidence = pawnEvidence || {};
    const capacityDefs = this._capacityDefIndex(defs.capacityDefs);
    const bodyIdentity = this.resolveBodyIdentity(evidence, defs);
    const capacities = {};
    const capacityNames = Object.keys(capacityDefs).sort();
    if (bodyIdentity.state !== 'resolved') {
      for (let i = 0; i < capacityNames.length; i++) {
        const name = capacityNames[i];
        const definition = capacityDefs[name];
        const fact = this._unknown('bodyIdentityUnknown', bodyIdentity.diagnostics || []);
        capacities[this._capacityOutputKey(name)] = {
          capacity: name,
          workerClass: definition.workerClass || null,
          workerSupported: !!(this.workers[definition.workerClass]
            || _CAPACITY_DEPENDENCY_WORKERS[definition.workerClass]),
          structural: fact,
          current: this._unknown('bodyIdentityUnknown', bodyIdentity.diagnostics || []),
        };
      }
      return { bodyIdentity: bodyIdentity, capacities: capacities };
    }

    const partIndex = this.buildPartIndex(bodyIdentity.bodyDef);
    const joinedObservations = this.joinObservations(evidence.bodyEvidence, bodyIdentity, partIndex);
    const classified = this.classifyEvidenceForSnapshot(joinedObservations);
    const pawnState = evidence.pawnState || {};
    const currentStatus = pawnState.currentStatus || {};
    const sharedContext = {
      bodyDef: bodyIdentity.bodyDef,
      bodyPartDefs: defs.bodyPartDefs || {},
      partIndex: partIndex,
      hediffCatalog: defs.hediffCatalog || [],
      prostheticEfficiency: defs.prostheticEfficiency || {},
      completeness: defs.completeness || {},
      pawnState: pawnState,
      alwaysDowned: pawnState.alwaysDowned,
    };
    const structuralContext = Object.assign({}, sharedContext, {
      joinedEvidence: classified.structuralEvidence,
      painTotal: 0,
    });
    const currentContext = Object.assign({}, sharedContext, {
      joinedEvidence: classified.currentEvidence,
      painTotal: currentStatus.painTotal,
    });

    const structuralForced = {};
    const currentForced = {};
    for (let i = 0; i < capacityNames.length; i++) {
      const name = capacityNames[i];
      const definition = capacityDefs[name];
      const persistenceUncertainty = this._snapshotUncertainty(
        name,
        definition,
        classified.unresolvedPersistenceEvidence,
        structuralContext,
        defs.hediffCatalog,
        'unresolvedPersistence'
      );
      if (persistenceUncertainty) structuralForced[name] = persistenceUncertainty;
      const joinUncertainty = this._snapshotUncertainty(
        name,
        definition,
        joinedObservations.filter(item => item.rawPartIndex != null && item.joinState !== 'resolved'),
        currentContext,
        defs.hediffCatalog,
        'unresolvedObservationJoin'
      );
      if (joinUncertainty) {
        currentForced[name] = joinUncertainty;
        structuralForced[name] = joinUncertainty;
      }
    }

    const graphRegistry = Object.assign({}, this.workers, _CAPACITY_DEPENDENCY_WORKERS);
    const structuralGraph = this.resolveCapacityGraph(capacityDefs, structuralContext, {
      workerRegistry: graphRegistry,
      snapshotType: 'structural',
      forcedUnknown: structuralForced,
    });
    const currentGraph = this.resolveCapacityGraph(capacityDefs, currentContext, {
      workerRegistry: graphRegistry,
      snapshotType: 'current',
      canBeAwake: currentStatus.canBeAwake,
      forcedUnknown: currentForced,
    });

    for (let i = 0; i < capacityNames.length; i++) {
      const name = capacityNames[i];
      const definition = capacityDefs[name];
      capacities[this._capacityOutputKey(name)] = {
        capacity: name,
        workerClass: definition.workerClass || null,
        workerSupported: !!(this.workers[definition.workerClass]
          || _CAPACITY_DEPENDENCY_WORKERS[definition.workerClass]),
        structural: structuralGraph[name],
        current: currentGraph[name],
      };
    }
    return {
      bodyIdentity: bodyIdentity,
      capacities: capacities,
    };
  },
};

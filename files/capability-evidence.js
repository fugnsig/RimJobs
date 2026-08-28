'use strict';

/**
 * CAPABILITY EVIDENCE
 * Canonical evidence layer between raw RimWorld data and capability resolvers.
 * Each adapter (fromTraits, fromGenes, ...) emits typed evidence records that
 * downstream consumers can interpret without re-parsing source formats.
 *
 * Task 0 (C2): module skeleton, constants, helpers, infrastructure wiring.
 * Adapter implementations follow in Tasks 1-6.
 */

// ─── Frozen enumerations ───────────────────────────────────────────────────────

const STAT = Object.freeze({
  WORK_SPEED_GLOBAL: 'workSpeedGlobal',
  WORK_SPEED: 'workSpeed',
  LEARNING_RATE: 'learningRate',
  MENTAL_BREAK_THRESHOLD: 'mentalBreakThreshold',
});

const CAPACITY = Object.freeze({
  CONSCIOUSNESS: 'consciousness',
  MANIPULATION: 'manipulation',
  MOVING: 'moving',
  SIGHT: 'sight',
  TALKING: 'talking',
  HEARING: 'hearing',
});

const AUTHORITY_RANK = Object.freeze({
  summaryFallback: 10,
  definitionResolved: 20,
});

const VALID_CONFIDENCE = new Set(['verified', 'derived', 'inferred', 'unknown']);

const SKILL_OPERATION_KIND = Object.freeze({
  RUNTIME_APTITUDE: 'runtimeAptitudeOffset',
  CREATION_GAIN: 'creationSkillGain',
  APP_POLICY: 'appPolicySkillOffset',
  SUMMARY_FALLBACK: 'summaryFallback',
  UNKNOWN: 'unknownSkillOperation',
});

const _APP_SKILL_TO_DEF = Object.freeze({
  shoot: 'Shooting', construct: 'Construction', cook: 'Cooking',
  animal: 'Animals', art: 'Artistic', social: 'Social', melee: 'Melee',
  mine: 'Mining', plant: 'Plants', craft: 'Crafting', medicine: 'Medicine',
  intel: 'Intellectual',
});

// Only curated entries known to transcribe TraitDegreeData.skillGains belong
// here. Other baked/custom skillMods remain explicitly unknown rather than
// acquiring runtime semantics from their numeric shape.
const _AUDITED_TRAIT_CREATION_GAINS = new Set(['gourmand', 'brawler', 'sickly']);
const _CURATED_APTITUDE_GENE_ID = /^gene_(shooting|melee|construct|mining|cooking|plants|animals|crafting|art|social|medicine|intel)_(terrible|poor|good|great)$/;
const _AUDITED_GLF_TRAITS = new Set(['fast_learner', 'too_smart', 'slow_learner']);
const _AUDITED_GLF_GENES = new Set(['gene_quick_study', 'gene_slow_study']);

// ─── Record constructors ───────────────────────────────────────────────────────
// Type-specific fields (hours, weight, activity, fallbackHours, etc.) belong in
// opts.fields and are merged onto the record via Object.assign.

function _makeEvidence(evidenceId, type, target, value, provenance, confidence, opts) {
  const o = opts || {};
  return Object.assign({
    evidenceId: evidenceId,
    supersessionKey: o.supersessionKey == null ? null : o.supersessionKey,
    type: type,
    target: target == null ? null : target,
    scope: o.scope == null ? null : o.scope,
    value: value == null ? null : value,
    when: o.when == null ? null : o.when,
    derivedContext: o.derivedContext == null ? null : o.derivedContext,
    provenance: provenance,
    authority: o.authority || 'definitionResolved',
    confidence: confidence,
  }, o.fields || {});
}

function _makeBodyEvidence(kind, opts) {
  const o = opts || {};
  return Object.assign({
    kind: kind,
    partId: o.partId == null ? null : o.partId,
    partDef: o.partDef || null,
    side: o.side || null,
    parentPartDef: o.parentPartDef || null,
    rawPartIndex: o.rawPartIndex == null ? null : o.rawPartIndex,
    bodyDefName: o.bodyDefName || null,
    bodyDefReference: o.bodyDefReference || 'unknown',
    persistence: o.persistence || 'unknown',
    sourceObservationIndex: o.sourceObservationIndex == null ? null : o.sourceObservationIndex,
    provenance: o.provenance || null,
  }, o.extra || {});
}

function _makeUnresolved(sourceKind, sourceId, reason, opts) {
  const o = opts || {};
  return {
    sourceKind: sourceKind,
    sourceId: sourceId == null ? null : sourceId,
    modId: o.modId || null,
    reason: reason,
    rawTarget: o.rawTarget == null ? null : o.rawTarget,
    rawData: o.rawData == null ? null : o.rawData,
    derivedContext: o.derivedContext == null ? null : o.derivedContext,
    candidateTargets: Array.isArray(o.candidateTargets) ? o.candidateTargets : undefined,
  };
}

function _modIdOf(def) {
  return (def && (def.modId || def._modId)) || null;
}

// ─── Known permission vocabulary ───────────────────────────────────────────────
// Built at load time from data.js globals (loaded before this script).
//
// Job IDs: taken from the JOBS array (each element has .id).
// Work-tag/incap IDs: taken from INCAP_OPTIONS (canonical app incap vocabulary).
//
// Some identifiers appear in BOTH sets (e.g. 'firefight', 'cooking', 'mining').
// The classifier treats these as ambiguous rather than guessing which system
// the source intended.

const _KNOWN_JOB_IDS = new Set(typeof JOBS !== 'undefined' ? JOBS.map(j => j.id) : []);
const _KNOWN_INCAP_IDS = new Set(typeof INCAP_OPTIONS !== 'undefined' ? INCAP_OPTIONS.map(o => o.id) : []);
const _CANONICAL_WORK_TAGS = new Set(typeof RIMWORLD_WORK_TAG_VALUES !== 'undefined'
  ? Object.keys(RIMWORLD_WORK_TAG_VALUES) : []);
const _LEGACY_INCAP_WORK_TAG_CANDIDATES = (() => {
  const result = {};
  if (typeof WORKTAG_TO_INCAP === 'undefined') return result;
  for (const [tag, incap] of Object.entries(WORKTAG_TO_INCAP)) {
    if (!_CANONICAL_WORK_TAGS.has(tag)) continue;
    if (!result[incap]) result[incap] = [];
    if (result[incap].indexOf(tag) < 0) result[incap].push(tag);
  }
  return result;
})();

function _emitTypedPermissionSources(sources, effects, unresolved, args) {
  const records = Array.isArray(sources) ? sources : [];
  for (let i = 0; i < records.length; i++) {
    const source = records[i];
    if (!source || source.presence !== 'present') continue;
    const targets = Array.isArray(source.targets) ? source.targets : [];
    for (let j = 0; j < targets.length; j++) {
      const target = targets[j] || {};
      const canonical = target.canonicalTarget || null;
      const kind = source.targetKind;
      const valid = kind === 'workTag'
        ? _CANONICAL_WORK_TAGS.has(canonical)
        : kind === 'workType' && typeof canonical === 'string' && canonical.length > 0;
      if (!valid) {
        unresolved.push(_makeUnresolved(
          args.provenance.sourceKind,
          args.provenance.sourceId,
          'Unresolved typed permission target from ' + source.sourceField,
          {
            rawTarget: target.rawTarget || null,
            rawData: source,
            modId: args.provenance.modId,
            candidateTargets: [],
          }
        ));
        continue;
      }
      const type = kind === 'workTag' ? 'disableWorkTag' : 'disableWorkType';
      const evidenceId = args.evidencePrefix + ':' + source.sourceField + ':' + canonical;
      effects.push(_makeEvidence(
        evidenceId,
        type,
        canonical,
        null,
        args.provenance,
        args.confidence,
        {
          when: args.when == null ? null : args.when,
          fields: {
            permissionTargetKind: kind,
            sourceField: source.sourceField,
            sourceCompleteness: source.completeness || 'unknown',
            rawTarget: target.rawTarget || canonical,
          },
        }
      ));
    }
  }
}

function _permissionSourcesForDefinition(def) {
  if (!def) return [];
  const result = Array.isArray(def.permissionSources) ? def.permissionSources.slice() : [];
  const addExact = (field, kind, values) => {
    if (!Array.isArray(values)) return;
    result.push({
      sourceField: field,
      targetKind: kind,
      presence: values.length ? 'present' : 'absent',
      rawValue: values.join(', '),
      targets: values.map(target => ({
        rawTarget: target,
        canonicalTarget: kind === 'workTag' && !_CANONICAL_WORK_TAGS.has(target) ? null : target,
      })),
      completeness: 'complete',
    });
  };
  addExact('disabledWorkTypes', 'workType', def.disabledWorkTypesExact);
  addExact('disabledWorkTags', 'workTag', def.disabledWorkTagsExact);
  return result;
}

// ─── Strict source resolution helpers ──────────────────────────────────────────
// Existing getters (App.getXeno, App.getRole) silently return defaults for
// unknown IDs. These strict variants return null so callers can distinguish
// "resolved to baseliner" from "unknown xenotype, falling back to baseliner".

function _resolveXenoStrict(xenoId) {
  if (!xenoId) return null;
  // Check preset xenotypes (defined in data.js, loaded before this script)
  if (typeof PRESET_XENOTYPES !== 'undefined' && PRESET_XENOTYPES[xenoId]) {
    return PRESET_XENOTYPES[xenoId];
  }
  // Check custom xenotypes (from App state, available at call time)
  if (typeof App !== 'undefined' && App.state &&
      App.state.customXenotypes && App.state.customXenotypes[xenoId]) {
    return App.state.customXenotypes[xenoId];
  }
  return null;
}

function _resolveRoleStrict(roleId) {
  if (!roleId) return null;
  if (typeof DEFAULT_ROLES !== 'undefined') {
    const found = DEFAULT_ROLES.find(r => r.id === roleId);
    if (found) return found;
  }
  return null;
}

// Gene-source rule: if explicit pawn gene state exists (geneDefIds from save
// import), it is authoritative even when it differs from the xenotype template.
// Only when explicit state is absent do we fall back to template genes.

function _geneRefsForPawn(pawn) {
  if (!pawn) return [];
  const xenoId = pawn.xenotype || '';

  // Explicit pawn gene state (from save import) is authoritative
  if (Array.isArray(pawn.geneDefIds) && pawn.geneDefIds.length > 0) {
    return pawn.geneDefIds.map(gId => ({ geneId: gId, origin: 'pawnState', xenotypeId: xenoId }));
  }

  // Fall back to xenotype template genes only when explicit state is absent
  const xeno = _resolveXenoStrict(xenoId);
  if (xeno && Array.isArray(xeno.genes) && xeno.genes.length > 0) {
    return xeno.genes.map(gId => ({ geneId: gId, origin: 'xenotypeTemplate', xenotypeId: xenoId }));
  }

  return [];
}

// ─── Permission classifier ─────────────────────────────────────────────────────
// PERM-EVID-001: Never label a legacy incap identifier as a work tag solely
// because current incapBlocks treats it uniformly.
//
// args shape: { evidenceId, provenance, confidence, opts?, rawData? }
// provenance shape: { sourceKind, sourceId, modId? }

function _classifyIncap(incapId, effects, unresolved, args) {
  const isJob = _KNOWN_JOB_IDS.has(incapId);
  const isWorkTag = _KNOWN_INCAP_IDS.has(incapId);

  if (isJob && isWorkTag) {
    // Ambiguous - appears in both job and work-tag vocabularies
    unresolved.push(_makeUnresolved(
      args.provenance.sourceKind,
      args.provenance.sourceId,
      'Ambiguous permission identifier: ' + incapId,
      {
        rawTarget: incapId,
        modId: args.provenance.modId,
        candidateTargets: [{ kind: 'job', target: incapId }].concat(
          (_LEGACY_INCAP_WORK_TAG_CANDIDATES[incapId] || [])
            .map(target => ({ kind: 'workTag', target }))
        ),
      }
    ));
    return;
  }

  if (isJob) {
    effects.push(_makeEvidence(
      args.evidenceId, 'disableJob', incapId, null,
      args.provenance, args.confidence, args.opts
    ));
    return;
  }

  if (isWorkTag) {
    effects.push(_makeEvidence(
      args.evidenceId, 'disableWorkTag', incapId, null,
      args.provenance, args.confidence, args.opts
    ));
    return;
  }

  // Unknown identifier - not in either vocabulary
  unresolved.push(_makeUnresolved(
    args.provenance.sourceKind,
    args.provenance.sourceId,
    'Unclassified permission identifier: ' + incapId,
    { rawTarget: incapId, modId: args.provenance.modId, rawData: args.rawData || null }
  ));
}

// ─── Evidence normalisation and supersession ───────────────────────────────────

function _normaliseEffects(effects, unresolvedSources) {
  if (!Array.isArray(effects)) return [];
  const unresolved = unresolvedSources || [];
  const validated = [];

  // 1. Validate required fields, confidence, and authority
  for (let i = 0; i < effects.length; i++) {
    const e = effects[i];
    if (!e || !e.evidenceId || !e.type || !e.provenance) {
      unresolved.push(_makeUnresolved(
        'normalisation', (e && e.evidenceId) || null,
        'Missing required field(s) on evidence record',
        { rawData: e }
      ));
      continue;
    }
    if (!VALID_CONFIDENCE.has(e.confidence)) {
      unresolved.push(_makeUnresolved(
        'normalisation', e.evidenceId,
        'Invalid confidence: ' + e.confidence,
        { rawData: e }
      ));
      continue;
    }
    if (AUTHORITY_RANK[e.authority] == null) {
      unresolved.push(_makeUnresolved(
        'normalisation', e.evidenceId,
        'Invalid authority: ' + e.authority,
        { rawData: e }
      ));
      continue;
    }
    validated.push(e);
  }

  // 2-3. Detect duplicate evidenceId - retain first deterministically,
  // add an integrity entry to unresolvedSources for each duplicate.
  const seenIds = new Map();
  const deduplicated = [];
  for (let j = 0; j < validated.length; j++) {
    const ev = validated[j];
    if (seenIds.has(ev.evidenceId)) {
      unresolved.push(_makeUnresolved(
        'normalisation', ev.evidenceId,
        'Duplicate evidenceId: ' + ev.evidenceId + ' (retaining first occurrence)',
        { rawData: ev }
      ));
      continue;
    }
    seenIds.set(ev.evidenceId, ev);
    deduplicated.push(ev);
  }

  // 4. Independent records (supersessionKey: null) all survive.
  // 5. For a non-null supersession group: compare authority only inside that
  //    group, retain the single highest-authority representation. If multiple
  //    records tie at the highest authority, treat the group as unresolved
  //    rather than arbitrarily choosing one.
  // 6. Same type/target with different source slots is not a conflict.
  const independent = [];
  const groups = new Map();
  for (let k = 0; k < deduplicated.length; k++) {
    const rec = deduplicated[k];
    if (rec.supersessionKey == null) {
      independent.push(rec);
    } else {
      if (!groups.has(rec.supersessionKey)) groups.set(rec.supersessionKey, []);
      groups.get(rec.supersessionKey).push(rec);
    }
  }

  const result = independent.slice();

  groups.forEach((members, key) => {
    if (members.length === 1) {
      result.push(members[0]);
      return;
    }
    let maxRank = -1;
    for (let m = 0; m < members.length; m++) {
      const rank = AUTHORITY_RANK[members[m].authority] ?? 0;
      if (rank > maxRank) maxRank = rank;
    }
    const winners = members.filter(mem => (AUTHORITY_RANK[mem.authority] ?? 0) === maxRank);
    if (winners.length === 1) {
      result.push(winners[0]);
    } else {
      for (let w = 0; w < winners.length; w++) {
        unresolved.push(_makeUnresolved(
          'normalisation', winners[w].evidenceId,
          'Authority tie in supersession group: ' + key,
          { rawData: winners[w] }
        ));
      }
    }
  });

  return result;
}

function _skillDefIdForAppSkill(appSkillId) {
  return _APP_SKILL_TO_DEF[appSkillId] || null;
}

function _skillDefinitionForEffect(effect) {
  const provenance = effect && effect.provenance || {};
  if (provenance.sourceKind === 'trait') return _resolveTraitStrict(provenance.sourceId);
  if (provenance.sourceKind !== 'gene') return null;
  const allGenes = typeof GENES !== 'undefined' ? GENES : [];
  const customGenes = (typeof App !== 'undefined' && App.state && App.state.customGenes)
    ? App.state.customGenes : {};
  return allGenes.find(gene => gene.id === provenance.sourceId)
    || customGenes[provenance.sourceId]
    || null;
}

function _skillOperationKindForEffect(effect) {
  const provenance = effect && effect.provenance || {};
  const sourceKind = provenance.sourceKind;
  const definition = _skillDefinitionForEffect(effect);
  const declaredKind = definition && (definition.skillOperationKind
    || (definition.skillOperationKinds && definition.skillOperationKinds[effect.target]));
  if (Object.values(SKILL_OPERATION_KIND).includes(declaredKind)) return declaredKind;

  if (sourceKind === 'backstory') return SKILL_OPERATION_KIND.CREATION_GAIN;
  if (sourceKind === 'role' || sourceKind === 'ideology') return SKILL_OPERATION_KIND.APP_POLICY;
  if (sourceKind === 'xenotype' || effect.authority === 'summaryFallback') {
    return SKILL_OPERATION_KIND.SUMMARY_FALLBACK;
  }
  if (sourceKind === 'trait') {
    if (provenance.sourceId === 'occultist') return SKILL_OPERATION_KIND.APP_POLICY;
    if (definition && definition.skillSourceField === 'TraitDegreeData.skillGains') {
      return SKILL_OPERATION_KIND.CREATION_GAIN;
    }
    if (!provenance.modId && _AUDITED_TRAIT_CREATION_GAINS.has(provenance.sourceId)) {
      return SKILL_OPERATION_KIND.CREATION_GAIN;
    }
    return SKILL_OPERATION_KIND.UNKNOWN;
  }
  if (sourceKind === 'gene') {
    if (definition && (definition.skillSourceField === 'GeneDef.aptitudes'
      || definition.runtimeAptitudeExact === true
      || Array.isArray(definition.aptitudesExact))) {
      return SKILL_OPERATION_KIND.RUNTIME_APTITUDE;
    }
    if (!provenance.modId && _CURATED_APTITUDE_GENE_ID.test(provenance.sourceId || '')) {
      return SKILL_OPERATION_KIND.RUNTIME_APTITUDE;
    }
    return SKILL_OPERATION_KIND.UNKNOWN;
  }
  return SKILL_OPERATION_KIND.UNKNOWN;
}

function _normaliseSkillOperations(operations, unresolvedSources) {
  const unresolved = unresolvedSources || [];
  const source = Array.isArray(operations) ? operations : [];
  const normalised = source.map(operation => Object.assign({}, operation, {
    canonicalEligible: operation.canonicalEligible === true
      && operation.superseded !== true
      && operation.compatibilityOnly !== true,
  }));
  const groups = new Map();
  for (const operation of normalised) {
    const groupKey = [operation.sourceFactKey, operation.skillDefId, operation.kind].join('|');
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(operation);
  }
  groups.forEach(group => {
    const eligible = group.filter(operation => operation.canonicalEligible === true);
    if (eligible.length <= 1) return;
    for (const operation of eligible) operation.canonicalEligible = false;
    unresolved.push(_makeUnresolved(
      'skillOperation', group[0].sourceFactKey,
      'Duplicate canonical eligibility for conserved skill source fact',
      { candidateTargets: group[0].skillDefId ? [group[0].skillDefId] : [] }
    ));
  });

  const bySourceFact = new Map();
  for (const operation of normalised) {
    if (!bySourceFact.has(operation.sourceFactKey)) bySourceFact.set(operation.sourceFactKey, []);
    bySourceFact.get(operation.sourceFactKey).push(operation);
  }
  const conservation = Array.from(bySourceFact.entries()).map(([sourceFactKey, group]) => ({
    sourceFactKey,
    representations: group.map(operation => ({
      operationId: operation.operationId,
      representation: operation.compatibilityOnly ? 'rawObservation' : 'canonicalExact',
      semanticKind: operation.kind,
      canonicalEligible: operation.canonicalEligible === true,
      superseded: operation.superseded === true,
    })),
    eligibleCanonicalOperationIds: group
      .filter(operation => operation.canonicalEligible === true)
      .map(operation => operation.operationId),
  }));
  return { operations: normalised, conservation };
}

function _buildSkillOperations(effects, unresolvedSources, exactOperations) {
  const source = Array.isArray(effects) ? effects : [];
  const rawOperations = Array.isArray(exactOperations) ? exactOperations.slice() : [];
  const skillMetadataByEvidenceId = new Map();
  for (const effect of source) {
    if (!effect || effect.type !== 'skillOffset') continue;
    const kind = _skillOperationKindForEffect(effect);
    const skillDefId = _skillDefIdForAppSkill(effect.target);
    const sourceFactKey = effect.sourceFactKey || effect.evidenceId;
    const runtimeApplicability = effect.runtimeApplicability;
    const applicability = runtimeApplicability === 'applicable'
      || runtimeApplicability === 'inapplicable'
      || runtimeApplicability === 'unknown'
      ? runtimeApplicability
      : kind === SKILL_OPERATION_KIND.RUNTIME_APTITUDE ? 'unknown' : 'applicable';
    const completeness = skillDefId && applicability !== 'unknown' ? 'complete' : 'partial';
    const compatibilityOnly = kind !== SKILL_OPERATION_KIND.RUNTIME_APTITUDE;
    const superseded = effect.superseded === true;
    const operationId = 'skill-operation:' + effect.evidenceId;
    const operation = {
      operationId,
      sourceFactKey,
      kind,
      skillDefId,
      appSkillId: effect.target == null ? null : effect.target,
      candidateSkillDefIds: skillDefId ? [skillDefId] : [],
      value: typeof effect.value === 'number' && Number.isFinite(effect.value)
        ? effect.value : null,
      applicability,
      applicabilityReason: applicability === 'unknown'
        ? 'Runtime source applicability is not yet proven' : null,
      compatibilityOnly,
      superseded,
      canonicalEligible: kind === SKILL_OPERATION_KIND.RUNTIME_APTITUDE
        && !compatibilityOnly && !superseded && skillDefId != null
        && applicability === 'applicable',
      evidence: {
        evidenceId: effect.evidenceId,
        sourceFactKey,
        sourceKind: effect.provenance.sourceKind,
        sourceId: effect.provenance.sourceId == null ? null : effect.provenance.sourceId,
        targetDefId: skillDefId,
        representation: kind === SKILL_OPERATION_KIND.RUNTIME_APTITUDE
          ? 'canonicalExact' : 'legacyCompatibility',
        provenance: effect.provenance,
        confidence: effect.confidence,
      },
      confidence: effect.confidence,
      completeness,
    };
    rawOperations.push(operation);
    skillMetadataByEvidenceId.set(effect.evidenceId, {
      sourceFactKey, representation: 'legacyCompatibility', semanticKind: kind,
      compatibilityOnly: true, canonicalEligible: false, applicability,
      completeness, superseded,
    });
  }
  const normalised = _normaliseSkillOperations(rawOperations, unresolvedSources);
  const conservation = normalised.conservation.map(record => {
    const legacy = source.find(effect => effect && effect.evidenceId === record.sourceFactKey);
    return Object.assign({}, record, {
      representations: legacy ? [{
        evidenceId: legacy.evidenceId,
        representation: 'legacyCompatibility',
        semanticKind: 'skillOffset',
        canonicalEligible: false,
        superseded: legacy.superseded === true,
      }].concat(record.representations) : record.representations,
    });
  });
  return {
    operations: normalised.operations,
    conservation,
    legacyEffects: source.map(effect => skillMetadataByEvidenceId.has(effect.evidenceId)
      ? Object.assign({}, effect, skillMetadataByEvidenceId.get(effect.evidenceId))
      : effect),
  };
}

function _typedStateApplicability(dlcFact, sourceFact) {
  if (!dlcFact || dlcFact.state !== 'known') return 'unknown';
  if (dlcFact.value !== true) return 'inapplicable';
  if (!sourceFact || sourceFact.state !== 'known') return 'unknown';
  return sourceFact.value === true ? 'applicable' : 'inapplicable';
}

function _runtimeAptitudeOperation(args) {
  const exactValue = Number.isInteger(args.value);
  const exactTarget = typeof args.skillDefId === 'string' && args.skillDefId.length > 0;
  const exactDefinition = args.definitionComplete === true;
  const kind = exactValue && exactTarget && exactDefinition
    ? SKILL_OPERATION_KIND.RUNTIME_APTITUDE : SKILL_OPERATION_KIND.UNKNOWN;
  const complete = kind === SKILL_OPERATION_KIND.RUNTIME_APTITUDE
    && args.applicability !== 'unknown';
  return {
    operationId: args.operationId,
    sourceFactKey: args.sourceFactKey,
    kind,
    skillDefId: exactTarget ? args.skillDefId : null,
    appSkillId: null,
    candidateSkillDefIds: exactTarget ? [args.skillDefId] : [],
    sourceDefId: args.sourceDefId,
    sourceField: args.sourceField,
    sourceOrder: args.sourceOrder,
    value: exactValue ? args.value : null,
    applicability: args.applicability,
    applicabilityReason: args.applicability === 'unknown'
      ? 'Runtime aptitude applicability is not proven' : null,
    dlc: args.dlc,
    compatibilityOnly: false,
    superseded: args.superseded === true,
    canonicalEligible: kind === SKILL_OPERATION_KIND.RUNTIME_APTITUDE
      && args.applicability === 'applicable' && args.superseded !== true,
    evidence: {
      evidenceId: args.operationId + ':evidence',
      sourceFactKey: args.sourceFactKey,
      sourceKind: args.sourceKind,
      sourceId: args.sourceDefId,
      targetDefId: exactTarget ? args.skillDefId : null,
      representation: kind === SKILL_OPERATION_KIND.RUNTIME_APTITUDE
        ? 'canonicalExact' : 'rawObservation',
      provenance: args.provenance || {},
      confidence: args.confidence || 'verified',
    },
    confidence: args.confidence || 'verified',
    completeness: complete ? 'complete' : 'partial',
  };
}

function _definitionByExactId(collection, exactId, appId) {
  if (!collection) return null;
  const values = Array.isArray(collection) ? collection : Object.values(collection);
  return values.find(definition => definition && (
    definition.defName === exactId || definition.def === exactId || definition.id === exactId
    || (appId && definition.id === appId))) || null;
}

function _aptitudeEntries(definition) {
  if (!definition) return [];
  if (Array.isArray(definition.aptitudes)) return definition.aptitudes;
  if (Array.isArray(definition.aptitudesExact)) return definition.aptitudesExact;
  return [];
}

function _buildRuntimeAptitudeOperations(pawn, unresolvedSources) {
  const operations = [];
  const unresolved = unresolvedSources || [];
  if (!pawn) return operations;
  const dlcFacts = pawn.dlcActiveFacts || {};
  const customGenes = typeof App !== 'undefined' && App.state
    ? App.state.customGenes || {} : {};
  const genes = typeof GENES !== 'undefined' ? GENES : [];
  const customTraits = typeof App !== 'undefined' && App.state
    ? App.state.customTraits || {} : {};
  const traits = typeof TRAITS !== 'undefined' ? TRAITS : [];
  const hediffs = typeof App !== 'undefined' && App.state
    && Array.isArray(App.state.hediffCatalog) ? App.state.hediffCatalog : [];

  const emitEntries = (definition, fact, source) => {
    const entries = _aptitudeEntries(definition);
    const definitionComplete = definition && definition.aptitudeCompleteness === 'complete';
    if (!definition || (entries.length === 0 && !definitionComplete)) {
      const sourceFactKey = source.kind + ':' + source.defId + ':aptitudes:unknown:' + source.instanceOrder;
      operations.push(_runtimeAptitudeOperation({
        operationId: 'skill-operation:' + sourceFactKey,
        sourceFactKey, sourceKind: source.kind, sourceDefId: source.defId,
        sourceField: source.field, sourceOrder: source.instanceOrder,
        skillDefId: null, value: null, definitionComplete: false,
        applicability: source.applicability, dlc: source.dlc,
        provenance: source.provenance, confidence: definition ? 'unknown' : 'unknown',
      }));
      unresolved.push(_makeUnresolved(source.kind, source.defId,
        definition ? 'Runtime aptitude definition is incomplete'
          : 'Runtime aptitude definition could not be resolved',
        { rawTarget: source.field }));
      return;
    }
    for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
      const entry = entries[entryIndex] || {};
      const skillDefId = entry.skillDefId || entry.skill || null;
      const sourceOrder = Number.isInteger(entry.sourceOrder)
        ? entry.sourceOrder : entryIndex;
      const sourceFactKey = source.kind + ':' + source.defId + ':'
        + source.instanceOrder + ':aptitudes:' + (skillDefId || 'unknown') + ':' + sourceOrder;
      operations.push(_runtimeAptitudeOperation({
        operationId: 'skill-operation:' + sourceFactKey,
        sourceFactKey, sourceKind: source.kind, sourceDefId: source.defId,
        sourceField: source.field, sourceOrder,
        skillDefId, value: entry.offset, definitionComplete,
        applicability: source.applicability, dlc: source.dlc,
        provenance: Object.assign({}, source.provenance, {
          sourceField: source.field, definitionSourceOrder: sourceOrder,
        }),
        confidence: definitionComplete ? 'verified' : 'unknown',
      }));
    }
  };

  const geneFacts = Array.isArray(pawn.geneRuntimeFacts) ? pawn.geneRuntimeFacts : [];
  for (let index = 0; index < geneFacts.length; index++) {
    const fact = geneFacts[index];
    if (!fact || !fact.geneDefId) continue;
    const definition = _definitionByExactId(genes, fact.geneDefId)
      || _definitionByExactId(customGenes, fact.geneDefId);
    const applicability = _typedStateApplicability(dlcFacts.Biotech, fact.active);
    if (definition && definition.definitionKind !== 'GeneDef') {
      emitEntries(null, fact, {
        kind: 'gene', defId: fact.geneDefId, instanceOrder: fact.sourceOrder ?? index,
        field: 'GeneTemplateDef.aptitudeOffset', dlc: 'Biotech', applicability,
        provenance: fact.provenance,
      });
      continue;
    }
    emitEntries(definition, fact, {
      kind: 'gene', defId: fact.geneDefId, instanceOrder: fact.sourceOrder ?? index,
      field: 'GeneDef.aptitudes', dlc: 'Biotech', applicability,
      provenance: fact.provenance,
    });
  }

  const traitFacts = Array.isArray(pawn.traitRuntimeFacts) ? pawn.traitRuntimeFacts : [];
  for (let index = 0; index < traitFacts.length; index++) {
    const fact = traitFacts[index];
    if (!fact || !fact.traitDefId) continue;
    const definition = _definitionByExactId(traits, fact.traitDefId, fact.appTraitId)
      || _definitionByExactId(customTraits, fact.traitDefId, fact.appTraitId);
    const degree = definition && Array.isArray(definition.traitDegrees)
      ? definition.traitDegrees.find(item => item && item.degree === fact.degree) : null;
    const degreeDefinition = degree ? Object.assign({}, degree, {
      aptitudeCompleteness: degree.aptitudeCompleteness
        || definition.traitDegreeCompleteness || 'unknown',
    }) : null;
    const nonSuppressed = fact.suppression && fact.suppression.state === 'known'
      ? { state: 'known', value: fact.suppression.value === false }
      : { state: 'unknown', value: null };
    const applicability = _typedStateApplicability(dlcFacts.Anomaly, nonSuppressed);
    emitEntries(degreeDefinition, fact, {
      kind: 'trait', defId: fact.traitDefId, instanceOrder: fact.sourceOrder ?? index,
      field: 'TraitDegreeData.aptitudes', dlc: 'Anomaly', applicability,
      provenance: fact.provenance,
    });
  }

  const health = Array.isArray(pawn.health) ? pawn.health : [];
  for (let index = 0; index < health.length; index++) {
    const fact = health[index];
    if (!fact || !fact.def) continue;
    const definition = _definitionByExactId(hediffs, fact.def);
    if (!definition || (!Array.isArray(definition.aptitudes)
      && definition.aptitudeCompleteness !== 'complete')) continue;
    const applicability = _typedStateApplicability(dlcFacts.Anomaly,
      { state: 'known', value: true });
    emitEntries(definition, fact, {
      kind: 'hediffDef', defId: fact.def, instanceOrder: fact.sourceObservationIndex ?? index,
      field: 'HediffDef.aptitudes', dlc: 'Anomaly', applicability,
      provenance: { sourceKind: 'healthSnapshot', sourceField: 'health/hediffs' },
    });
  }
  return operations;
}

function _rawSkillFactsFromPawn(pawn, unresolvedSources) {
  const unresolved = unresolvedSources || [];
  const records = pawn && pawn.rawSkillRecords && typeof pawn.rawSkillRecords === 'object'
    ? pawn.rawSkillRecords : {};
  const baseSkillFacts = {};
  const passionFacts = {};
  for (const [recordKey, raw] of Object.entries(records)) {
    if (!raw || typeof raw !== 'object') continue;
    const skillDefId = typeof raw.skillDefId === 'string' && raw.skillDefId
      ? raw.skillDefId : recordKey;
    if (baseSkillFacts[skillDefId]) {
      unresolved.push(_makeUnresolved(
        'saveSkillRecord', skillDefId, 'Duplicate raw SkillRecord fact',
        { rawTarget: skillDefId, candidateTargets: [skillDefId] }
      ));
      continue;
    }
    const recordPresence = ['present', 'absent', 'unknown'].includes(raw.recordPresence)
      ? raw.recordPresence : 'unknown';
    const levelKnown = recordPresence === 'present'
      && raw.levelState === 'known' && Number.isFinite(raw.levelInt);
    const sourceFactKey = 'saved-skill-record:' + skillDefId;
    const evidence = [{
      evidenceId: sourceFactKey,
      sourceFactKey,
      sourceKind: 'saveSkillRecord',
      sourceId: skillDefId,
      targetDefId: skillDefId,
      representation: 'rawObservation',
      provenance: raw.provenance || {},
      confidence: raw.parserCompleteness === 'complete' ? 'verified' : 'unknown',
    }];
    baseSkillFacts[skillDefId] = {
      skillDefId,
      appSkillId: typeof raw.appSkillId === 'string' ? raw.appSkillId : null,
      recordPresence,
      levelFieldPresent: raw.levelFieldPresent === true,
      storedLevelInt: levelKnown
        ? { state: 'known', value: Math.trunc(raw.levelInt), evidence }
        : { state: 'unknown', value: null, evidence },
      parserCompleteness: ['complete', 'partial', 'unknown'].includes(raw.parserCompleteness)
        ? raw.parserCompleteness : 'unknown',
      evidence,
    };
    const passionKnown = recordPresence === 'present'
      && typeof raw.rawPassionIdentity === 'string';
    passionFacts[skillDefId] = {
      skillDefId,
      recordPresence,
      passionFieldPresent: raw.passionFieldPresent === true,
      state: passionKnown ? 'known' : 'unknown',
      rawIdentity: passionKnown ? raw.rawPassionIdentity : null,
      semantics: null,
      directLearningFactor: null,
      compatibilityBucket: null,
      parserCompleteness: baseSkillFacts[skillDefId].parserCompleteness,
      evidence,
    };
  }
  const sourceCatalogue = pawn && pawn.skillRecordCatalogue
    && typeof pawn.skillRecordCatalogue === 'object' ? pawn.skillRecordCatalogue : {};
  return {
    baseSkillFacts,
    passionFacts,
    catalogue: {
      presence: ['present', 'absent', 'unknown'].includes(sourceCatalogue.presence)
        ? sourceCatalogue.presence : 'unknown',
      completeness: ['complete', 'partial', 'unknown'].includes(sourceCatalogue.completeness)
        ? sourceCatalogue.completeness : 'unknown',
      provenance: Object.assign({}, sourceCatalogue.provenance || {}),
    },
  };
}

function _statSourceApplicability(effect, pawn) {
  const provenance = effect && effect.provenance || {};
  if (provenance.sourceKind === 'trait') {
    const fact = pawn && pawn.traitSuppressionFacts
      && pawn.traitSuppressionFacts[provenance.sourceId];
    if (!fact || fact.state !== 'known') return 'unknown';
    return fact.value === true ? 'inapplicable' : 'applicable';
  }
  if (provenance.sourceKind === 'gene') {
    const fact = pawn && pawn.geneActiveFacts && pawn.geneActiveFacts[provenance.sourceId];
    if (!fact || fact.state !== 'known') return 'unknown';
    return fact.value === true ? 'applicable' : 'inapplicable';
  }
  return 'unknown';
}

function _exactLearningOffsetDescriptor(effect) {
  if (!effect || effect.type !== 'statFactor' || effect.target !== STAT.LEARNING_RATE) return null;
  const provenance = effect.provenance || {};
  const definition = _skillDefinitionForEffect(effect);
  const declared = definition && definition.exactStatOperations
    && definition.exactStatOperations.learningRate;
  if (declared && declared.statDefId === 'GlobalLearningFactor'
    && declared.kind === 'statOffset' && Number.isFinite(declared.value)) {
    return { value: declared.value, sourceField: declared.sourceField || 'statOffsets' };
  }
  if (provenance.sourceKind === 'trait'
    && !provenance.modId && _AUDITED_GLF_TRAITS.has(provenance.sourceId)) {
    return { value: effect.value - 1, sourceField: 'TraitDegreeData.statOffsets' };
  }
  if (provenance.sourceKind === 'gene'
    && !provenance.modId && _AUDITED_GLF_GENES.has(provenance.sourceId)) {
    return { value: effect.value - 1, sourceField: 'GeneDef.statOffsets' };
  }
  return null;
}

function _normaliseStatOperations(operations, unresolvedSources) {
  const unresolved = unresolvedSources || [];
  const normalised = (Array.isArray(operations) ? operations : []).map(operation =>
    Object.assign({}, operation, {
      canonicalEligible: operation.canonicalEligible === true
        && operation.compatibilityOnly !== true && operation.superseded !== true,
    }));
  const groups = new Map();
  for (const operation of normalised) {
    const key = [operation.sourceFactKey, operation.statDefId, operation.kind].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(operation);
  }
  groups.forEach(group => {
    const eligible = group.filter(operation => operation.canonicalEligible === true);
    if (eligible.length <= 1) return;
    for (const operation of eligible) operation.canonicalEligible = false;
    unresolved.push(_makeUnresolved(
      'statOperation', group[0].sourceFactKey,
      'Duplicate canonical stat eligibility for conserved source fact',
      { rawTarget: group[0].statDefId, candidateTargets: [group[0].statDefId] }
    ));
  });
  const conservation = Array.from(normalised.reduce((map, operation) => {
    if (!map.has(operation.sourceFactKey)) map.set(operation.sourceFactKey, []);
    map.get(operation.sourceFactKey).push(operation);
    return map;
  }, new Map()).entries()).map(([sourceFactKey, group]) => ({
    sourceFactKey,
    representations: group.map(operation => ({
      operationId: operation.operationId,
      representation: operation.compatibilityOnly ? 'rawObservation' : 'canonicalExact',
      semanticKind: operation.kind,
      canonicalEligible: operation.canonicalEligible === true,
      superseded: operation.superseded === true,
    })),
    eligibleCanonicalOperationIds: group.filter(operation => operation.canonicalEligible)
      .map(operation => operation.operationId),
  }));
  return { operations: normalised, conservation };
}

function _selectCanonicalStatOperations(operations, statDefId) {
  return (Array.isArray(operations) ? operations : []).filter(operation =>
    operation && operation.statDefId === statDefId
      && operation.canonicalEligible === true
      && operation.compatibilityOnly !== true
      && operation.superseded !== true);
}

function _buildExactLearningStatOperations(effects, pawn, unresolvedSources) {
  const source = Array.isArray(effects) ? effects : [];
  const rawOperations = [];
  const metadata = new Map();
  const legacyBySourceFact = new Map();
  for (const effect of source) {
    if (!effect || effect.type !== 'statFactor' || effect.target !== STAT.LEARNING_RATE) continue;
    const sourceFactKey = effect.sourceFactKey || effect.evidenceId;
    const descriptor = _exactLearningOffsetDescriptor(effect);
    const applicability = _statSourceApplicability(effect, pawn);
    const completeness = descriptor && applicability !== 'unknown' ? 'complete' : 'partial';
    const legacyMetadata = {
      sourceFactKey,
      representation: 'legacyCompatibility',
      semanticKind: 'statFactor',
      compatibilityOnly: true,
      canonicalEligible: false,
      applicability,
      completeness,
      superseded: effect.superseded === true,
    };
    metadata.set(effect.evidenceId, legacyMetadata);
    legacyBySourceFact.set(sourceFactKey, effect);
    if (!descriptor) continue;
    const sourceKind = effect.provenance.sourceKind;
    const phase = sourceKind === 'trait' ? 'traitOffset' : 'geneOffset';
    const phaseOrder = sourceKind === 'trait' ? 4 : 8;
    rawOperations.push({
      operationId: 'stat-operation:' + effect.evidenceId + ':GlobalLearningFactor',
      sourceFactKey,
      kind: 'statOffset',
      statDefId: 'GlobalLearningFactor',
      sourceDefId: effect.provenance.sourceId == null ? null : effect.provenance.sourceId,
      sourceField: descriptor.sourceField,
      phase,
      phaseOrder,
      sourceOrder: 0,
      durability: 'durable',
      value: descriptor.value,
      applicability,
      applicabilityReason: applicability === 'unknown'
        ? 'Source suppression or active state is not proven' : null,
      compatibilityOnly: false,
      superseded: effect.superseded === true,
      canonicalEligible: applicability === 'applicable' && effect.superseded !== true,
      confidence: effect.confidence,
      completeness,
      evidence: [{
        evidenceId: effect.evidenceId,
        sourceFactKey,
        sourceKind,
        sourceId: effect.provenance.sourceId == null ? null : effect.provenance.sourceId,
        targetDefId: 'GlobalLearningFactor',
        representation: 'canonicalExact',
        provenance: Object.assign({}, effect.provenance, { sourceField: descriptor.sourceField }),
        confidence: effect.confidence,
      }],
    });
  }
  const normalised = _normaliseStatOperations(rawOperations, unresolvedSources);
  const bySourceFact = new Map(normalised.conservation.map(record =>
    [record.sourceFactKey, Object.assign({}, record, { representations: record.representations.slice() })]));
  legacyBySourceFact.forEach((legacy, sourceFactKey) => {
    if (!bySourceFact.has(sourceFactKey)) {
      bySourceFact.set(sourceFactKey, {
        sourceFactKey, representations: [], eligibleCanonicalOperationIds: [],
      });
    }
    bySourceFact.get(sourceFactKey).representations.unshift({
      evidenceId: legacy.evidenceId,
      representation: 'legacyCompatibility',
      semanticKind: 'statFactor',
      canonicalEligible: false,
      superseded: legacy.superseded === true,
    });
  });
  return {
    operations: normalised.operations,
    conservation: Array.from(bySourceFact.values()),
    legacyEffects: source.map(effect => metadata.has(effect.evidenceId)
      ? Object.assign({}, effect, metadata.get(effect.evidenceId)) : effect),
  };
}

const _C5_STAT_PHASES = Object.freeze({
  trait: Object.freeze({ statOffset: ['traitOffset', 4, 'traitOffsets'], statFactor: ['traitFactor', 11, 'traitFactors'] }),
  hediff: Object.freeze({ statOffset: ['hediffOffset', 5, 'hediffOffsets'], statFactor: ['hediffFactor', 12, 'hediffFactors'] }),
  precept: Object.freeze({ statOffset: ['preceptOffset', 6, 'preceptOffsets'], statFactor: ['preceptFactor', 13, 'preceptFactors'] }),
  role: Object.freeze({ statOffset: ['roleOffset', 7, 'roleOffsets'], statFactor: ['roleFactor', 14, 'roleFactors'] }),
  gene: Object.freeze({ statOffset: ['geneOffset', 8, 'geneOffsets'], statFactor: ['geneFactor', 15, 'geneFactors'] }),
  lifeStage: Object.freeze({ statOffset: ['lifeStageOffset', 9, 'lifeStageOffsets'], statFactor: ['lifeStageFactor', 16, 'lifeStageFactors'] }),
  equipment: Object.freeze({ statOffset: ['equipmentOffset', 10, 'equipmentOffsets'], statFactor: ['requestThingOperation', 17, 'requestThingOperations'] }),
  requestThing: Object.freeze({ statOffset: ['requestThingOperation', 17, 'requestThingOperations'], statFactor: ['requestThingOperation', 17, 'requestThingOperations'] }),
  inspiration: Object.freeze({ statOffset: ['inspiration', 21, 'inspirationOperations'], statFactor: ['inspiration', 21, 'inspirationOperations'] }),
});

const _C6_TEMPORAL_FAMILIES = Object.freeze([
  'restNeed', 'recreation', 'windows', 'conditions', 'activities',
]);

function _temporalFamilyCoverage(options) {
  const source = options && options.temporalCoverage || {};
  const output = {};
  for (const family of _C6_TEMPORAL_FAMILIES) {
    const entry = source[family];
    const completeness = typeof entry === 'string' ? entry
      : entry && entry.completeness;
    output[family] = {
      completeness: ['complete', 'partial', 'unknown'].includes(completeness)
        ? completeness : 'unknown',
      unresolvedEvidence: Array.isArray(entry && entry.unresolvedEvidence)
        ? entry.unresolvedEvidence.map(item => Object.assign({}, item)) : [],
    };
  }
  return output;
}

const _C5_SOURCE_FAMILIES = Object.freeze([
  'traitOffsets', 'hediffOffsets', 'preceptOffsets', 'roleOffsets',
  'geneOffsets', 'lifeStageOffsets', 'equipmentOffsets', 'traitFactors',
  'hediffFactors', 'preceptFactors', 'roleFactors', 'geneFactors',
  'lifeStageFactors', 'requestThingOperations', 'inspirationOperations',
  'scenarioContext',
]);

function _cloneTypedFact(fact, fallbackValue, provenance) {
  if (fact && (fact.state === 'known' || fact.state === 'unknown')) {
    return {
      state: fact.state,
      value: fact.state === 'known' ? fact.value : null,
      evidence: Array.isArray(fact.evidence)
        ? fact.evidence.map(item => Object.assign({}, item)) : [],
    };
  }
  if (fallbackValue !== undefined && fallbackValue !== null) {
    return {
      state: 'known', value: fallbackValue,
      evidence: [{ sourceKind: 'savePawn', provenance: Object.assign({}, provenance || {}) }],
    };
  }
  return { state: 'unknown', value: null, evidence: [] };
}

function _booleanApplicability(fact, invert) {
  if (!fact || fact.state !== 'known') return 'unknown';
  const applies = invert ? fact.value === false : fact.value === true;
  return applies ? 'applicable' : 'inapplicable';
}

function _sourceFamilyCompleteness(input) {
  const source = input && (input.sourceFamilyCompleteness || input.familyCompleteness) || {};
  const output = {};
  for (const family of _C5_SOURCE_FAMILIES) {
    const entry = source[family];
    const completeness = typeof entry === 'string' ? entry
      : entry && entry.completeness;
    output[family] = {
      completeness: ['complete', 'partial', 'unknown'].includes(completeness)
        ? completeness : 'unknown',
      byStatDef: Object.assign({}, entry && entry.byStatDef || {}),
      evidence: Array.isArray(entry && entry.evidence)
        ? entry.evidence.map(item => Object.assign({}, item)) : [],
    };
  }
  return output;
}

function _operationList(definition, kind) {
  if (!definition) return [];
  return Array.isArray(definition[kind === 'statOffset' ? 'statOffsets' : 'statFactors'])
    ? definition[kind === 'statOffset' ? 'statOffsets' : 'statFactors'] : [];
}

function _bindDefinitionOperations(output, definition, source) {
  if (!definition) return;
  for (const kind of ['statOffset', 'statFactor']) {
    const phase = _C5_STAT_PHASES[source.family] && _C5_STAT_PHASES[source.family][kind];
    if (!phase) continue;
    const list = _operationList(definition, kind);
    for (let index = 0; index < list.length; index++) {
      const raw = list[index] || {};
      const statDefId = raw.statDefId || raw.target || null;
      const value = typeof raw.value === 'number' && Number.isFinite(raw.value)
        ? raw.value : null;
      const sourceOrder = Number.isInteger(raw.sourceOrder) ? raw.sourceOrder : index;
      const sourceFactKey = [source.family, source.defId, source.instanceOrder,
        source.stageOrder == null ? 'definition' : 'stage-' + source.stageOrder,
        kind, statDefId || 'unknown', sourceOrder].join(':');
      const completeness = statDefId && value != null
        && source.applicability !== 'unknown' ? 'complete' : 'partial';
      output.push({
        operationId: 'stat-operation:' + sourceFactKey,
        sourceFactKey,
        kind,
        statDefId,
        sourceDefId: source.defId,
        sourceField: source.sourceField + '.' + (kind === 'statOffset' ? 'statOffsets' : 'statFactors'),
        phase: phase[0], phaseOrder: phase[1], sourceFamily: phase[2],
        durability: source.durability || 'unknown',
        sourceOrder,
        sourceInstanceOrder: source.instanceOrder,
        value,
        applicability: source.applicability,
        applicabilityReason: source.applicability === 'unknown'
          ? 'Current-pawn source applicability is not proven' : null,
        compatibilityOnly: false,
        superseded: false,
        canonicalEligible: source.applicability === 'applicable'
          && statDefId != null && value != null,
        confidence: completeness === 'complete' ? 'verified' : 'unknown',
        completeness,
        evidence: [{
          evidenceId: 'evidence:' + sourceFactKey,
          sourceFactKey,
          sourceKind: source.family,
          sourceId: source.defId,
          targetDefId: statDefId,
          representation: 'canonicalExact',
          provenance: Object.assign({}, source.provenance || {}, {
            sourceField: source.sourceField,
            sourceOrder,
          }),
          confidence: completeness === 'complete' ? 'verified' : 'unknown',
        }],
      });
    }
  }
}

function _bindPawnStatOperations(pawn, options, unresolvedSources) {
  const opts = options || {};
  const providerInput = opts.effectivenessSourceCatalogues || null;
  const catalogues = providerInput && providerInput.sourceOperations
    ? providerInput.sourceOperations : (providerInput || {});
  const operations = [];
  const unresolved = unresolvedSources || [];
  const missingDefinition = (family, defId) => {
    if (!providerInput) return;
    unresolved.push(_makeUnresolved(family, defId,
      'Current-pawn source definition is absent from the effectiveness catalogue',
      { rawTarget: defId }));
  };

  const traitFacts = Array.isArray(pawn && pawn.traitRuntimeFacts) ? pawn.traitRuntimeFacts : [];
  for (let index = 0; index < traitFacts.length; index++) {
    const fact = traitFacts[index] || {};
    if (!fact.traitDefId) continue;
    const definition = catalogues.traits && catalogues.traits[fact.traitDefId];
    const degree = definition && Array.isArray(definition.traitDegrees)
      ? definition.traitDegrees.find(item => item && item.degree === fact.degree) : null;
    if (!degree) { missingDefinition('trait', fact.traitDefId); continue; }
    _bindDefinitionOperations(operations, degree, {
      family: 'trait', defId: fact.traitDefId, instanceOrder: fact.sourceOrder ?? index,
      sourceField: 'TraitDegreeData', applicability: _booleanApplicability(fact.suppression, true),
      durability: 'durable',
      provenance: fact.provenance,
    });
  }

  const geneFacts = Array.isArray(pawn && pawn.geneRuntimeFacts) ? pawn.geneRuntimeFacts : [];
  for (let index = 0; index < geneFacts.length; index++) {
    const fact = geneFacts[index] || {};
    if (!fact.geneDefId) continue;
    const definition = catalogues.genes && catalogues.genes[fact.geneDefId];
    if (!definition) { missingDefinition('gene', fact.geneDefId); continue; }
    _bindDefinitionOperations(operations, definition, {
      family: 'gene', defId: fact.geneDefId, instanceOrder: fact.sourceOrder ?? index,
      sourceField: 'GeneDef', applicability: _booleanApplicability(fact.active, false),
      durability: 'durable',
      provenance: fact.provenance,
    });
  }

  const health = Array.isArray(pawn && pawn.health) ? pawn.health : [];
  for (let index = 0; index < health.length; index++) {
    const fact = health[index] || {};
    if (!fact.def) continue;
    const definition = catalogues.hediffs && catalogues.hediffs[fact.def];
    if (!definition) { if (catalogues.hediffs) missingDefinition('hediff', fact.def); continue; }
    const stages = Array.isArray(definition.stages) ? definition.stages : [];
    const severityKnown = typeof fact.severity === 'number' && Number.isFinite(fact.severity);
    const severity = severityKnown ? fact.severity : null;
    let selected = [];
    if (severityKnown) {
      selected = stages.filter(stage => Number(stage.minSeverity || 0) <= severity)
        .sort((a, b) => Number(b.minSeverity || 0) - Number(a.minSeverity || 0)).slice(0, 1);
    } else {
      selected = stages;
    }
    for (let stageIndex = 0; stageIndex < selected.length; stageIndex++) {
      const stage = selected[stageIndex];
      _bindDefinitionOperations(operations, stage, {
        family: 'hediff', defId: fact.def,
        instanceOrder: fact.sourceObservationIndex ?? index,
        stageOrder: stage.sourceOrder ?? stageIndex,
        sourceField: 'HediffStage',
        applicability: severityKnown ? 'applicable' : 'unknown',
        durability: fact.permanent === true ? 'durable'
          : fact.permanent === false ? 'current' : 'unknown',
        provenance: { sourceKind: 'healthSnapshot', sourceField: 'health/hediffs' },
      });
    }
  }

  const bindFactDefinitions = (facts, collection, family, idField, sourceField) => {
    const list = Array.isArray(facts) ? facts : (facts ? [facts] : []);
    for (let index = 0; index < list.length; index++) {
      const fact = list[index] || {};
      const defId = fact[idField];
      if (!defId) continue;
      const definition = collection && collection[defId];
      if (!definition) { missingDefinition(family, defId); continue; }
      _bindDefinitionOperations(operations, definition, {
        family, defId, instanceOrder: fact.sourceOrder ?? index, sourceField,
        applicability: _booleanApplicability(fact.applicability, false),
        durability: fact.durability || 'durable',
        provenance: fact.provenance,
      });
    }
  };
  bindFactDefinitions(pawn && pawn.preceptRuntimeFacts, catalogues.precepts,
    'precept', 'preceptDefId', 'PreceptDef');
  bindFactDefinitions(pawn && pawn.roleRuntimeFacts, catalogues.roles,
    'role', 'roleDefId', 'PreceptRoleDef');
  bindFactDefinitions(pawn && pawn.lifeStageRuntimeFact, catalogues.lifeStages,
    'lifeStage', 'lifeStageDefId', 'LifeStageDef');

  for (const [field, family] of [['equipmentStatOperations', 'equipment'],
    ['requestThingStatOperations', 'requestThing'], ['inspirationStatOperations', 'inspiration']]) {
    const direct = pawn && Array.isArray(pawn[field]) ? pawn[field] : [];
    for (let index = 0; index < direct.length; index++) {
      const item = direct[index] || {};
      _bindDefinitionOperations(operations, {
        statOffsets: item.kind === 'statOffset' ? [item] : [],
        statFactors: item.kind === 'statFactor' ? [item] : [],
      }, {
        family, defId: item.sourceDefId || field, instanceOrder: item.sourceOrder ?? index,
        sourceField: field, applicability: item.applicability || 'unknown',
        durability: item.durability || 'current',
        provenance: item.provenance,
      });
    }
  }

  operations.sort((a, b) => a.phaseOrder - b.phaseOrder
    || a.sourceInstanceOrder - b.sourceInstanceOrder || a.sourceOrder - b.sourceOrder
    || String(a.operationId).localeCompare(String(b.operationId)));
  return {
    operations,
    sourceFamilyCompleteness: _sourceFamilyCompleteness(providerInput),
  };
}

function _buildStructuralContextFacts(pawn, options) {
  const opts = options || {};
  const raceDef = _cloneTypedFact(pawn && pawn.raceDefFact,
    pawn && pawn.raceDefName, { sourceField: 'race/def' });
  const providers = opts.structuralPropertyProviders || {};
  const raceProvider = raceDef.state === 'known' && providers.races
    ? providers.races[raceDef.value] : null;
  const humanlike = _cloneTypedFact(raceProvider && raceProvider.humanlike,
    raceProvider && typeof raceProvider.humanlike === 'boolean'
      ? raceProvider.humanlike : null,
    { sourceField: 'ThingDef.race.intelligence' });
  const scenarioSource = opts.scenarioProvider && (opts.scenarioProvider.fact
    || opts.scenarioProvider.scenarioContext || opts.scenarioProvider);
  return {
    biologicalAge: _cloneTypedFact(pawn && pawn.biologicalAgeFact,
      pawn && pawn.bioAge, { sourceField: 'ageTracker.ageBiologicalTicks' }),
    lifeStageDef: _cloneTypedFact(pawn && pawn.lifeStageDefFact,
      pawn && pawn.lifeStage, { sourceField: 'ageTracker.curLifeStageIndex' }),
    slaveStatus: _cloneTypedFact(pawn && pawn.slaveStatusFact,
      null, { sourceField: 'guestTracker.guestStatus' }),
    pawnKindDef: _cloneTypedFact(pawn && pawn.pawnKindDefFact,
      pawn && pawn.kindDef, { sourceField: 'kindDef' }),
    raceDef,
    raceProperties: { humanlike },
    scenarioContext: _cloneTypedFact(scenarioSource, null,
      { sourceField: 'scenarioProvider' }),
  };
}

// ─── Body semantic lookup helper ───────────────────────────────────────────────
// BODY-EVID-001: Human body fallback is compatibility-gated. Never map an
// unknown alien partIdx to a human arm/leg by coincidence. Only use
// HUMAN_BODY_INDEX/HUMAN_BODY_PARENT when the pawn is known to use the
// compatible human body definition.

function _resolveBodyPart(pawn, partIdx) {
  if (partIdx == null || partIdx < 0) {
    return _makeBodyEvidence('unresolved', {
      partId: partIdx != null ? partIdx : null,
    });
  }

  // Determine whether the pawn uses the compatible human body definition.
  // pawn.bodyDef is '' for standard humans (parser only sets it for non-Human bodies).
  const bodyDef = (pawn && pawn.bodyDef) || '';
  const isHumanCompatible = !bodyDef || bodyDef === 'Human';

  if (isHumanCompatible &&
      typeof HUMAN_BODY_INDEX !== 'undefined' &&
      partIdx < HUMAN_BODY_INDEX.length) {
    const partDef = HUMAN_BODY_INDEX[partIdx] || null;
    const parentIdx = (typeof HUMAN_BODY_PARENT !== 'undefined')
      ? HUMAN_BODY_PARENT[partIdx]
      : -1;
    const parentDef = (parentIdx != null && parentIdx >= 0 &&
                       typeof HUMAN_BODY_INDEX !== 'undefined')
      ? (HUMAN_BODY_INDEX[parentIdx] || null)
      : null;
    let side = null;
    if (partDef) {
      if (partDef.indexOf('left ') === 0) side = 'left';
      else if (partDef.indexOf('right ') === 0) side = 'right';
    }
    return _makeBodyEvidence('resolved', {
      partId: partIdx,
      partDef: partDef,
      side: side,
      parentPartDef: parentDef,
      provenance: 'humanBodyIndex',
    });
  }

  // Non-human body or index out of range - preserve partId, null semantics
  return _makeBodyEvidence('unresolved', {
    partId: partIdx,
    partDef: null,
    side: null,
    parentPartDef: null,
    provenance: bodyDef ? ('unknownBody:' + bodyDef) : 'outOfRange',
  });
}

// ─── Trait resolution ─────────────────────────────────────────────────────────

function _resolveTraitStrict(traitId) {
  if (!traitId) return null;
  if (typeof TRAITS !== 'undefined') {
    const found = TRAITS.find(t => t.id === traitId);
    if (found) return found;
  }
  if (typeof App !== 'undefined' && App.state &&
      App.state.customTraits && App.state.customTraits[traitId]) {
    const ct = App.state.customTraits[traitId];
    return Object.assign({}, ct, { id: traitId });
  }
  return null;
}

// Temporal trait mappings - verified against engine.js optimizeSchedules.
// Night Owl: avoidAwake hours 11-17 (weight 4 in sleep-slot scoring),
//            prefer hours 23-5 (comment: "gains 23h-6h", weight 2).
// Quick Sleeper: sleepHours = 6.
// Body Mastery: sleepHours = 0.
// Ascetic: joyHours -= 1 (min 1).
const _TEMPORAL_TRAITS = {
  night_owl(traitId, provenance, confidence) {
    const results = [];
    results.push(_makeEvidence(
      'trait:' + traitId + ':avoidHours', 'avoidHours', null, null,
      provenance, confidence,
      { fields: { hours: [11, 12, 13, 14, 15, 16, 17], weight: 4 } }
    ));
    results.push(_makeEvidence(
      'trait:' + traitId + ':preferHours', 'preferHours', null, null,
      provenance, confidence,
      { fields: { hours: [23, 0, 1, 2, 3, 4, 5], weight: 2 } }
    ));
    return results;
  },
  quick_sleeper(traitId, provenance, confidence) {
    return [_makeEvidence(
      'trait:' + traitId + ':sleepHoursOverride', 'sleepHoursOverride',
      null, 6, provenance, confidence
    )];
  },
  body_mastery(traitId, provenance, confidence) {
    return [_makeEvidence(
      'trait:' + traitId + ':sleepHoursOverride', 'sleepHoursOverride',
      null, 0, provenance, confidence
    )];
  },
  ascetic(traitId, provenance, confidence) {
    return [_makeEvidence(
      'trait:' + traitId + ':recreationHoursRecommendation',
      'recreationHoursRecommendation', null, null,
      provenance, confidence,
      { fields: { delta: -1 } }
    )];
  },
};

// Traits whose evidence is handled by other adapters (not emitted here).
const _SKIP_TRAITS = new Set(['undergrounder']);

// ─── Module object ─────────────────────────────────────────────────────────────

const CapabilityEvidence = {
  // Frozen enumerations
  STAT: STAT,
  CAPACITY: CAPACITY,
  AUTHORITY_RANK: AUTHORITY_RANK,
  VALID_CONFIDENCE: VALID_CONFIDENCE,
  SKILL_OPERATION_KIND: SKILL_OPERATION_KIND,

  fromTraits(pawn) {
    const effects = [];
    const unresolved = [];
    if (!pawn || !Array.isArray(pawn.traits)) return { effects, unresolved };

    for (let i = 0; i < pawn.traits.length; i++) {
      const traitId = pawn.traits[i];
      if (!traitId) continue;

      // Skip traits whose evidence belongs in another adapter
      if (_SKIP_TRAITS.has(traitId)) continue;

      const def = _resolveTraitStrict(traitId);
      if (!def) {
        unresolved.push(_makeUnresolved('trait', traitId,
          'Trait could not be resolved', { rawTarget: traitId }));
        continue;
      }

      const modId = _modIdOf(def);
      const provenance = { sourceKind: 'trait', sourceId: traitId, modId };
      const confidence = modId ? 'inferred' : 'verified';

      _emitTypedPermissionSources(_permissionSourcesForDefinition(def), effects, unresolved, {
        evidencePrefix: 'trait:' + traitId,
        provenance,
        confidence,
      });

      // Skill modifiers
      if (def.skillMods) {
        const entries = Object.entries(def.skillMods);
        for (let s = 0; s < entries.length; s++) {
          const skillId = entries[s][0];
          const val = entries[s][1];
          if (val === 0) continue;
          const eid = 'trait:' + traitId + ':skillMods:' + skillId;
          effects.push(_makeEvidence(eid, 'skillOffset', skillId, val,
            provenance, confidence));
        }
      }

      // Work speed (offset)
      if (def.workSpeed && def.workSpeed !== 0) {
        const eid = 'trait:' + traitId + ':workSpeed';
        effects.push(_makeEvidence(eid, 'statOffset', STAT.WORK_SPEED_GLOBAL,
          def.workSpeed, provenance, confidence));
      }

      // Learning rate - stored as offset (0.75 = +75%), emit as factor (1.75)
      if (def.learningRate && def.learningRate !== 0) {
        const eid = 'trait:' + traitId + ':learningRate';
        effects.push(_makeEvidence(eid, 'statFactor', STAT.LEARNING_RATE,
          1 + def.learningRate, provenance, confidence));
      }

      // Mental break threshold (offset)
      if (def.breakThreshold && def.breakThreshold !== 0) {
        const eid = 'trait:' + traitId + ':breakThreshold';
        effects.push(_makeEvidence(eid, 'statOffset',
          STAT.MENTAL_BREAK_THRESHOLD, def.breakThreshold,
          provenance, confidence));
      }

      // Permission entries (incapable)
      if (def.incapable) {
        for (let c = 0; c < def.incapable.length; c++) {
          const incapId = def.incapable[c];
          const eid = 'trait:' + traitId + ':incapable:' + incapId;
          _classifyIncap(incapId, effects, unresolved, {
            evidenceId: eid,
            provenance,
            confidence,
          });
        }
      }

      // Generic need-suppression from definition data
      if (Array.isArray(def.disablesNeeds)) {
        for (let n = 0; n < def.disablesNeeds.length; n++) {
          const needId = def.disablesNeeds[n];
          const eid = 'trait:' + traitId + ':needSuppression:' + needId;
          effects.push(_makeEvidence(eid, 'needSuppression', needId, true,
            provenance, confidence));
        }
      }

      // Temporal mappings (scheduler-relevant evidence)
      if (_TEMPORAL_TRAITS[traitId]) {
        const temporal = _TEMPORAL_TRAITS[traitId](traitId, provenance, confidence);
        for (let t = 0; t < temporal.length; t++) {
          effects.push(temporal[t]);
        }
      }
    }

    return { effects, unresolved };
  },
  fromGenes(pawn) {
    const effects = [];
    const unresolved = [];
    if (!pawn) return { effects, unresolved };

    const refs = _geneRefsForPawn(pawn);
    if (refs.length === 0) return { effects, unresolved };

    const allGenes = typeof GENES !== 'undefined' ? GENES : [];
    const customGenes = (typeof App !== 'undefined' && App.state && App.state.customGenes)
      ? App.state.customGenes : {};

    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i];
      const gId = ref.geneId;
      if (!gId) continue;

      // Resolve gene definition (mirrors App._resolveGeneDef)
      const def = allGenes.find(g => g.id === gId)
        || customGenes[gId]
        || (typeof _sanId === 'function' ? customGenes['mod_gene_' + _sanId(gId)] : null)
        || null;

      if (!def) {
        unresolved.push(_makeUnresolved('gene', gId,
          'Gene could not be resolved',
          {
            rawTarget: gId,
            derivedContext: ref.origin === 'xenotypeTemplate'
              ? { xenotypeId: ref.xenotypeId, origin: 'xenotypeTemplate' }
              : null,
          }));
        continue;
      }

      const modId = _modIdOf(def);
      const provenance = { sourceKind: 'gene', sourceId: gId, modId };
      const confidence = modId ? 'inferred' : 'verified';
      const derivedCtx = ref.origin === 'xenotypeTemplate'
        ? { xenotypeId: ref.xenotypeId, origin: 'xenotypeTemplate' }
        : null;
      const baseOpts = derivedCtx ? { derivedContext: derivedCtx } : {};

      _emitTypedPermissionSources(_permissionSourcesForDefinition(def), effects, unresolved, {
        evidencePrefix: 'gene:' + gId,
        provenance,
        confidence,
      });

      // Skill modifiers
      if (def.skillMods) {
        const entries = Object.entries(def.skillMods);
        for (let s = 0; s < entries.length; s++) {
          const skillId = entries[s][0];
          const val = entries[s][1];
          if (val === 0) continue;
          const eid = 'gene:' + gId + ':skillMods:' + skillId;
          effects.push(_makeEvidence(eid, 'skillOffset', skillId, val,
            provenance, confidence, baseOpts));
        }
      }

      // Work speed (offset)
      if (def.workSpeed && def.workSpeed !== 0) {
        const eid = 'gene:' + gId + ':workSpeed';
        effects.push(_makeEvidence(eid, 'statOffset', STAT.WORK_SPEED_GLOBAL,
          def.workSpeed, provenance, confidence, baseOpts));
      }

      // Learning rate - stored as offset, emit as factor (1 + offset)
      if (def.learningRate && def.learningRate !== 0) {
        const eid = 'gene:' + gId + ':learningRate';
        effects.push(_makeEvidence(eid, 'statFactor', STAT.LEARNING_RATE,
          1 + def.learningRate, provenance, confidence, baseOpts));
      }

      // Move speed - NOT mapped to Moving capacity, preserved as unresolved
      if (def.moveSpeed && def.moveSpeed !== 0) {
        unresolved.push(_makeUnresolved('gene', gId,
          'moveSpeed is a stat, not a capacity',
          {
            rawTarget: 'moveSpeed',
            rawData: def.moveSpeed,
            modId: modId,
            derivedContext: derivedCtx,
          }));
      }

      // Permission entries (incapable)
      if (def.incapable) {
        for (let c = 0; c < def.incapable.length; c++) {
          const incapId = def.incapable[c];
          const eid = 'gene:' + gId + ':incapable:' + incapId;
          _classifyIncap(incapId, effects, unresolved, {
            evidenceId: eid,
            provenance,
            confidence,
            opts: baseOpts,
          });
        }
      }

      // Generic need-suppression from definition data
      if (Array.isArray(def.disablesNeeds)) {
        for (let n = 0; n < def.disablesNeeds.length; n++) {
          const needId = def.disablesNeeds[n];
          const eid = 'gene:' + gId + ':needSuppression:' + needId;
          effects.push(_makeEvidence(eid, 'needSuppression', needId, true,
            provenance, confidence, baseOpts));
        }
      }

      // Sleepless gene (gene_no_sleep) - emit sleepHoursOverride 0
      if (def.id === 'gene_no_sleep' || def.label === 'Sleepless') {
        const eid = 'gene:' + gId + ':sleepHoursOverride';
        effects.push(_makeEvidence(eid, 'sleepHoursOverride', null, 0,
          provenance, confidence, baseOpts));
      }

      // Low Sleep gene (matched by id pattern, same as engine.js)
      if (def.id !== 'gene_no_sleep' && /low_?sleep/i.test(String(def.id || gId))) {
        const eid = 'gene:' + gId + ':sleepHoursOverride';
        effects.push(_makeEvidence(eid, 'sleepHoursOverride', null, 3,
          provenance, confidence, baseOpts));
      }
    }

    return { effects, unresolved };
  },
  fromXenotype(pawn) {
    const effects = [];
    const unresolved = [];
    if (!pawn) return { effects, unresolved };

    const xenoId = pawn.xenotype;
    if (!xenoId) return { effects, unresolved };

    // 1. Resolve xenotype strictly - unknown -> unresolved, NEVER Baseliner
    const xeno = _resolveXenoStrict(xenoId);
    if (!xeno) {
      unresolved.push(_makeUnresolved('xenotype', xenoId,
        'Xenotype could not be resolved',
        { rawTarget: xenoId }));
      return { effects, unresolved };
    }

    const modId = _modIdOf(xeno);
    const provenance = { sourceKind: 'xenotype', sourceId: xenoId, modId };
    const baseConfidence = modId ? 'inferred' : 'derived';

    // 2. Check if pawn has explicit gene state differing from template
    const hasExplicitGenes = Array.isArray(pawn.geneDefIds) && pawn.geneDefIds.length > 0;
    const templateGenes = Array.isArray(xeno.genes) ? xeno.genes : [];

    let explicitDiffersFromTemplate = false;
    if (hasExplicitGenes) {
      const sorted1 = pawn.geneDefIds.slice().sort();
      const sorted2 = templateGenes.slice().sort();
      explicitDiffersFromTemplate = sorted1.length !== sorted2.length ||
        sorted1.some((g, i) => g !== sorted2[i]);
    }

    // 3. Aggregate skill/incap fallback (skip if pawn genes differ from template)
    if (!explicitDiffersFromTemplate) {
      // Resolve template genes using same logic as fromGenes
      const allGenes = typeof GENES !== 'undefined' ? GENES : [];
      const customGeneMap = (typeof App !== 'undefined' && App.state && App.state.customGenes)
        ? App.state.customGenes : {};

      const resolvedDefs = [];
      let unresolvedGeneCount = 0;

      for (let i = 0; i < templateGenes.length; i++) {
        const gId = templateGenes[i];
        const def = allGenes.find(g => g.id === gId)
          || customGeneMap[gId]
          || (typeof _sanId === 'function' ? customGeneMap['mod_gene_' + _sanId(gId)] : null)
          || null;
        if (def) {
          resolvedDefs.push(def);
        } else {
          unresolvedGeneCount++;
        }
      }

      // Summary-only xenotype: no gene list but has aggregate data
      const isSummaryOnly = templateGenes.length === 0;

      // --- Skill dimensions ---
      if (xeno.skillMods) {
        const entries = Object.entries(xeno.skillMods);
        for (let s = 0; s < entries.length; s++) {
          const skillId = entries[s][0];
          const aggregateValue = entries[s][1];
          if (aggregateValue === 0) continue;

          const eid = 'xeno:' + xenoId + ':skillMods:' + skillId;

          if (isSummaryOnly) {
            effects.push(_makeEvidence(eid, 'skillOffset', skillId, aggregateValue,
              provenance, 'inferred', { authority: 'summaryFallback' }));
            continue;
          }

          // Sum resolved gene contributions for this skill
          let resolvedTotal = 0;
          let anyResolvedContributes = false;
          for (let r = 0; r < resolvedDefs.length; r++) {
            if (resolvedDefs[r].skillMods && resolvedDefs[r].skillMods[skillId]) {
              resolvedTotal += resolvedDefs[r].skillMods[skillId];
              anyResolvedContributes = true;
            }
          }

          if (unresolvedGeneCount === 0) {
            // Case A: all template genes resolved - atomic is authoritative
            if (resolvedTotal !== aggregateValue) {
              unresolved.push(_makeUnresolved('xenotype', xenoId,
                'Aggregate/atomic mismatch for skill ' + skillId +
                ': aggregate=' + aggregateValue + ', resolved=' + resolvedTotal,
                { rawTarget: skillId,
                  rawData: { aggregate: aggregateValue, resolved: resolvedTotal } }));
            }
          } else if (anyResolvedContributes) {
            // Case C: partial resolution - no overlapping aggregate
            unresolved.push(_makeUnresolved('xenotype', xenoId,
              'Partial gene resolution for skill ' + skillId +
              ': some template genes unresolved',
              { rawTarget: skillId,
                rawData: { aggregate: aggregateValue, resolvedContribution: resolvedTotal } }));
          } else {
            // Case B: zero resolved genes contribute - summary fallback
            effects.push(_makeEvidence(eid, 'skillOffset', skillId, aggregateValue,
              provenance, 'inferred', { authority: 'summaryFallback' }));
          }
        }
      }

      // --- Incapable dimensions ---
      if (xeno.incapable) {
        for (let c = 0; c < xeno.incapable.length; c++) {
          const incapId = xeno.incapable[c];
          const eid = 'xeno:' + xenoId + ':incapable:' + incapId;

          if (isSummaryOnly) {
            _classifyIncap(incapId, effects, unresolved, {
              evidenceId: eid,
              provenance,
              confidence: 'inferred',
              opts: { authority: 'summaryFallback' },
            });
            continue;
          }

          // Check if any resolved gene contributes this incapable
          let resolvedCovers = false;
          for (let r = 0; r < resolvedDefs.length; r++) {
            if (resolvedDefs[r].incapable &&
                resolvedDefs[r].incapable.indexOf(incapId) >= 0) {
              resolvedCovers = true;
              break;
            }
          }

          if (unresolvedGeneCount === 0) {
            // Case A: all resolved - atomic handles it
            if (!resolvedCovers) {
              unresolved.push(_makeUnresolved('xenotype', xenoId,
                'Aggregate/atomic mismatch for incapable ' + incapId +
                ': aggregate declares it but no resolved gene provides it',
                { rawTarget: incapId }));
            }
          } else if (!resolvedCovers) {
            // Case B: no resolved gene covers it - summary fallback
            _classifyIncap(incapId, effects, unresolved, {
              evidenceId: eid,
              provenance,
              confidence: 'inferred',
              opts: { authority: 'summaryFallback' },
            });
          }
          // else: Case C/covered - atomic handles it, no aggregate needed
        }
      }
    }

    // --- UV sensitivity ---
    if (xeno.uvSensitivity) {
      const eid = 'xeno:' + xenoId + ':uv';
      effects.push(_makeEvidence(eid, 'avoidCondition', null, null,
        provenance, baseConfidence, {
          fields: {
            condition: 'daylight',
            fallbackHours: { start: 6, end: 18 },
            weight: 4,
          },
        }));
    }

    return { effects, unresolved };
  },
  fromBackstories(pawn) {
    const effects = [];
    const unresolved = [];
    if (!pawn) return { effects, unresolved };
    const slots = [
      { key: 'childhood', slot: 'child' },
      { key: 'adulthood', slot: 'adult' },
    ];
    for (const { key, slot } of slots) {
      const bsId = pawn[key];
      if (!bsId) continue;
      const resolved = (typeof App !== 'undefined' && App._resolveBackstory)
        ? App._resolveBackstory(bsId)
        : null;
      if (!resolved) {
        unresolved.push(_makeUnresolved('backstory', bsId,
          'Backstory could not be resolved',
          { rawTarget: bsId }));
        continue;
      }
      const modId = _modIdOf(resolved);
      const provenance = { sourceKind: 'backstory', sourceId: bsId, modId };
      const confidence = modId ? 'inferred' : 'verified';

      _emitTypedPermissionSources(_permissionSourcesForDefinition(resolved), effects, unresolved, {
        evidencePrefix: 'backstory:' + bsId + ':' + slot,
        provenance,
        confidence,
      });
      // Skill modifiers
      if (resolved.skills) {
        const skillEntries = Object.entries(resolved.skills);
        for (let i = 0; i < skillEntries.length; i++) {
          const appSkillId = skillEntries[i][0];
          const val = skillEntries[i][1];
          if (val === 0) continue;
          const eid = 'backstory:' + bsId + ':' + slot + ':skillMods:' + appSkillId;
          effects.push(_makeEvidence(eid, 'skillOffset', appSkillId, val,
            provenance, confidence));
        }
      }
      // Permission entries via classifier
      if (resolved.incapable) {
        for (let i = 0; i < resolved.incapable.length; i++) {
          const incapId = resolved.incapable[i];
          const eid = 'backstory:' + bsId + ':' + slot + ':incapable:' + incapId;
          _classifyIncap(incapId, effects, unresolved, {
            evidenceId: eid,
            provenance,
            confidence,
          });
        }
      }
    }
    return { effects, unresolved };
  },

  fromRole(pawn) {
    const effects = [];
    const unresolved = [];
    if (!pawn) return { effects, unresolved };
    const roleId = pawn.role;
    if (!roleId || roleId === 'none') return { effects, unresolved };
    const roleDef = _resolveRoleStrict(roleId);
    if (!roleDef) {
      unresolved.push(_makeUnresolved('role', roleId,
        'Role could not be resolved',
        { rawTarget: roleId }));
      return { effects, unresolved };
    }
    const modId = _modIdOf(roleDef);
    const provenance = { sourceKind: 'role', sourceId: roleId, modId };
    const confidence = modId ? 'inferred' : 'verified';

    const rolePermissionSources = Array.isArray(roleDef.disabledWorkTagsExact)
      ? [{
          sourceField: 'roleDisabledWorkTags',
          targetKind: 'workTag',
          presence: roleDef.disabledWorkTagsExact.length ? 'present' : 'absent',
          rawValue: roleDef.disabledWorkTagsExact.join(', '),
          targets: roleDef.disabledWorkTagsExact.map(target => ({
            rawTarget: target,
            canonicalTarget: _CANONICAL_WORK_TAGS.has(target) ? target : null,
          })),
          completeness: 'complete',
        }]
      : [];
    _emitTypedPermissionSources(rolePermissionSources, effects, unresolved, {
      evidencePrefix: 'role:' + roleId,
      provenance,
      confidence,
    });
    // Skill modifiers
    if (roleDef.skillMods) {
      const skillEntries = Object.entries(roleDef.skillMods);
      for (let i = 0; i < skillEntries.length; i++) {
        const skillId = skillEntries[i][0];
        const val = skillEntries[i][1];
        if (val === 0) continue;
        const eid = 'role:' + roleId + ':skillMods:' + skillId;
        effects.push(_makeEvidence(eid, 'skillOffset', skillId, val,
          provenance, confidence));
      }
    }
    // Work speed
    if (roleDef.workSpeed && roleDef.workSpeed !== 0) {
      const eid = 'role:' + roleId + ':workSpeed';
      effects.push(_makeEvidence(eid, 'statOffset', STAT.WORK_SPEED_GLOBAL,
        roleDef.workSpeed, provenance, confidence));
    }
    // Permission entries via classifier
    if (roleDef.incap) {
      for (let i = 0; i < roleDef.incap.length; i++) {
        const incapId = roleDef.incap[i];
        const eid = 'role:' + roleId + ':incapable:' + incapId;
        _classifyIncap(incapId, effects, unresolved, {
          evidenceId: eid,
          provenance,
          confidence,
        });
      }
    }
    return { effects, unresolved };
  },

  fromIdeology(pawn) {
    const effects = [];
    const unresolved = [];
    if (typeof App === 'undefined' || !App.getIdeoEffects) return { effects, unresolved };
    const fx = App.getIdeoEffects();
    if (!fx) return { effects, unresolved };
    const provenance = { sourceKind: 'ideology', sourceId: 'colony' };
    const confidence = 'derived';
    // Combat skill -> shoot and melee offsets
    if (fx.combatSkill && fx.combatSkill !== 0) {
      effects.push(_makeEvidence('ideology:colony:combatSkill:shoot',
        'skillOffset', 'shoot', fx.combatSkill, provenance, confidence));
      effects.push(_makeEvidence('ideology:colony:combatSkill:melee',
        'skillOffset', 'melee', fx.combatSkill, provenance, confidence));
    }
    // Social skill
    if (fx.socialSkill && fx.socialSkill !== 0) {
      effects.push(_makeEvidence('ideology:colony:socialSkill:social',
        'skillOffset', 'social', fx.socialSkill, provenance, confidence));
    }
    // Research speed -> intel offset (production checks 'intellectual' but app
    // skill id is 'intel' - the effectiveSkill branch never fires; we still
    // emit the evidence so downstream consumers see what the ideology claims)
    if (fx.researchSpeed && fx.researchSpeed !== 0) {
      effects.push(_makeEvidence('ideology:colony:researchSpeed:intel',
        'skillOffset', 'intel', fx.researchSpeed, provenance, confidence));
    }
    // Work speed
    if (fx.workSpeed && fx.workSpeed !== 0) {
      effects.push(_makeEvidence('ideology:colony:workSpeed',
        'statOffset', STAT.WORK_SPEED_GLOBAL, fx.workSpeed, provenance, confidence));
    }
    // Legacy settings precept: combat_focus
    if (typeof App !== 'undefined' && App.state && App.state.precepts &&
        App.state.precepts['combat_focus'] && App.state.precepts['combat_focus'] !== 0) {
      const cfVal = App.state.precepts['combat_focus'];
      effects.push(_makeEvidence('ideology:colony:combatFocus:shoot',
        'skillOffset', 'shoot', cfVal, provenance, confidence));
      effects.push(_makeEvidence('ideology:colony:combatFocus:melee',
        'skillOffset', 'melee', cfVal, provenance, confidence));
    }
    return { effects, unresolved };
  },

  bodyEvidenceFromPawnHealth(pawn) {
    if (!pawn || !Array.isArray(pawn.health) || !pawn.health.length) return [];
    const results = [];
    for (let observationIndex = 0; observationIndex < pawn.health.length; observationIndex++) {
      const hi = pawn.health[observationIndex];
      if (!hi || !hi.def) continue;
      const rawIdx = hi.rawPartIndex != null ? hi.rawPartIndex : hi.partIdx;
      const hasPartRef = rawIdx != null && rawIdx >= 0;
      const resolved = hasPartRef ? _resolveBodyPart(pawn, rawIdx) : null;
      const pId = resolved ? resolved.partId : null;
      const pDef = resolved ? resolved.partDef : null;
      const pSide = resolved ? resolved.side : null;
      const pParent = resolved ? resolved.parentPartDef : null;
      const modId = (typeof App !== 'undefined' && App.state && App.state.defSources)
        ? (App.state.defSources[hi.def] || null) : null;
      const prov = { sourceKind: 'healthSnapshot', sourceId: hi.def, modId };
      const persistence = (hi.type === 'missing' || hi.type === 'replaced' || hi.type === 'implant' || hi.permanent === true)
        ? 'persistent'
        : (hi.permanent === false ? 'temporary' : 'unknown');
      const common = {
        partId: pId,
        partDef: pDef,
        side: pSide,
        parentPartDef: pParent,
        rawPartIndex: hasPartRef ? rawIdx : null,
        bodyDefName: hi.bodyDefName || null,
        bodyDefReference: hi.bodyDefReference || 'unknown',
        persistence,
        sourceObservationIndex: hi.sourceObservationIndex == null ? observationIndex : hi.sourceObservationIndex,
        provenance: prov,
      };

      if (hi.type === 'missing') {
        if (!hasPartRef) continue;
        results.push(_makeBodyEvidence('missing', common));
      } else if (hi.type === 'replaced') {
        results.push(_makeBodyEvidence('replacement', Object.assign({}, common, {
          extra: { replacementDef: hi.def },
        })));
      } else if (hi.type === 'implant') {
        results.push(_makeBodyEvidence('implant', Object.assign({}, common, {
          extra: { implantDef: hi.def },
        })));
      } else {
        results.push(_makeBodyEvidence('hediff', Object.assign({}, common, {
          extra: {
            hediffDef: hi.def,
            severity: hi.severity != null ? hi.severity : null,
            stage: null,
          },
        })));
      }
    }
    return results;
  },

  effectsFromHediffDefinitions(pawn) {
    const effects = [];
    const unresolved = [];
    if (!pawn || !Array.isArray(pawn.health) || !pawn.health.length) return { effects, unresolved };

    const cat = (typeof App !== 'undefined' && App.state && Array.isArray(App.state.hediffCatalog))
      ? App.state.hediffCatalog : [];
    const catMap = {};
    for (const c of cat) { if (c && c.def) catMap[c.def] = c; }

    const defSources = (typeof App !== 'undefined' && App.state && App.state.defSources) || {};
    const seenDefs = new Set();

    for (const hi of pawn.health) {
      if (!hi || !hi.def || seenDefs.has(hi.def)) continue;
      seenDefs.add(hi.def);

      const entry = catMap[hi.def];
      if (!entry) continue;

      const modId = defSources[hi.def] || null;
      const provenance = { sourceKind: 'hediffDef', sourceId: hi.def, modId };
      const confidence = modId ? 'inferred' : 'verified';

      if (!Array.isArray(entry.disabledWorkStages) || !entry.disabledWorkStages.length) continue;

      const stages = entry.disabledWorkStages;
      for (let si = 0; si < stages.length; si++) {
        const stage = stages[si];
        if (!stage.work || !stage.work.length) continue;
        const nextStage = si + 1 < stages.length ? stages[si + 1] : null;
        const when = {
          kind: 'hediffSeverity',
          hediffDef: hi.def,
          min: stage.min,
          max: nextStage ? nextStage.min : null,
          maxExclusive: true,
        };
        _emitTypedPermissionSources(stage.permissionSources, effects, unresolved, {
          evidencePrefix: 'hediff:' + hi.def + ':s' + si,
          provenance,
          confidence,
          when,
        });
        for (const incapId of stage.work) {
          const eid = 'hediff:' + hi.def + ':' + incapId + ':s' + si;
          _classifyIncap(incapId, effects, unresolved, {
            evidenceId: eid,
            provenance,
            confidence,
            opts: { when },
          });
        }
      }
    }

    // Psycaster meditation: genuine profiling rule from engine.js optimizeSchedules.
    // Pawns with a psylink hediff get 2 hours dedicated meditation time.
    const healthArr = pawn.health;
    let psyDef = null;
    for (const h of healthArr) {
      if (!h || !h.def) continue;
      if (/psylink|psychicamp/i.test(h.def) || h.hediffClass === 'Hediff_Psylink') {
        psyDef = h.def;
        break;
      }
    }
    if (psyDef) {
      effects.push(_makeEvidence(
        'hediff:pawn:psycaster:meditation',
        'requiredActivity', null, 2,
        { sourceKind: 'hediff', sourceId: psyDef },
        'derived',
        { fields: {
          activity: 'meditation', hours: 2,
          obligation: 'required',
          satisfiesNeeds: ['recreation'],
          composition: { resolved: true, rule: 'singleSource' },
        } }
      ));
    }

    // Generic requiredActivities from hediff catalog entries.
    // Modded or extended hediffs may declare activities without audited composition.
    for (const hi of pawn.health) {
      if (!hi || !hi.def || !catMap[hi.def]) continue;
      const entry = catMap[hi.def];
      if (!Array.isArray(entry.requiredActivities) || !entry.requiredActivities.length) continue;
      // seenDefs already tracks this def from the main loop above; reuse for dedup.
      if (seenDefs.has('activity:' + hi.def)) continue;
      seenDefs.add('activity:' + hi.def);

      const modId = defSources[hi.def] || null;
      for (const act of entry.requiredActivities) {
        if (!act || !act.activity) continue;
        effects.push(_makeEvidence(
          'hediff:' + hi.def + ':requiredActivity:' + act.activity,
          'requiredActivity', null,
          act.hours == null ? null : act.hours,
          { sourceKind: 'hediffDef', sourceId: hi.def, modId: modId },
          'inferred',
          { fields: {
            activity: act.activity,
            hours: act.hours == null ? null : act.hours,
            obligation: act.obligation || 'unknown',
            satisfiesNeeds: Array.isArray(act.satisfiesNeeds) ? act.satisfiesNeeds : [],
            composition: { resolved: false },
          } }
        ));
      }
    }

    return { effects, unresolved };
  },

  collectPawnEvidence(pawn, options) {
    if (!pawn) {
      return {
        effects: [],
        skillOperations: [],
        statOperations: [],
        sourceFamilyCompleteness: _sourceFamilyCompleteness(
          options && options.effectivenessSourceCatalogues),
        temporalCoverage: _temporalFamilyCoverage(options),
        structuralContextFacts: _buildStructuralContextFacts(null, options),
        conservation: [],
        bodyEvidence: [],
        permissionEvidence: { rawSources: [], legacyIncapable: [] },
        pawnState: { raceDefName: null, age: null, lifeStage: null, currentStatus: {}, currentStatusFacts: {}, baseSkills: {}, basePassions: {}, baseSkillFacts: {}, passionFacts: {}, skillRecordCatalogue: { presence: 'unknown', completeness: 'unknown', provenance: {} } },
        unresolvedSources: [],
      };
    }

    const allEffects = [];
    const allUnresolved = [];

    const adapters = [
      this.fromTraits(pawn),
      this.fromGenes(pawn),
      this.fromXenotype(pawn),
      this.fromBackstories(pawn),
      this.fromRole(pawn),
      this.fromIdeology(pawn),
      this.effectsFromHediffDefinitions(pawn),
    ];
    for (const result of adapters) {
      if (result.effects) allEffects.push(...result.effects);
      if (result.unresolved) allUnresolved.push(...result.unresolved);
    }

    const normalised = _normaliseEffects(allEffects, allUnresolved);
    const bodyEvidence = this.bodyEvidenceFromPawnHealth(pawn);
    const pawnPermissionEffects = [];
    _emitTypedPermissionSources(pawn.permissionSources, pawnPermissionEffects, allUnresolved, {
      evidencePrefix: 'pawn:' + (pawn.id || 'unknown'),
      provenance: { sourceKind: 'pawnPermission', sourceId: pawn.id || null, modId: null },
      confidence: 'verified',
    });
    const allNormalised = _normaliseEffects(normalised.concat(pawnPermissionEffects), allUnresolved);
    const exactAptitudeOperations = _buildRuntimeAptitudeOperations(pawn, allUnresolved);
    const skillBundle = _buildSkillOperations(
      allNormalised, allUnresolved, exactAptitudeOperations);
    const statBundle = _buildExactLearningStatOperations(
      skillBundle.legacyEffects, pawn, allUnresolved);
    const pawnStatBundle = _bindPawnStatOperations(pawn, options, allUnresolved);
    const providerKeys = new Set(pawnStatBundle.operations.map(operation => [
      operation.evidence && operation.evidence[0] && operation.evidence[0].sourceKind,
      operation.sourceDefId, operation.statDefId, operation.kind,
    ].join('|')));
    const legacyExactOperations = statBundle.operations.map(operation => {
      const sourceKind = operation.evidence && operation.evidence[0]
        && operation.evidence[0].sourceKind;
      const key = [sourceKind, operation.sourceDefId, operation.statDefId, operation.kind].join('|');
      return providerKeys.has(key)
        ? Object.assign({}, operation, { canonicalEligible: false, superseded: true })
        : operation;
    });
    const allStatOperations = _normaliseStatOperations(
      legacyExactOperations.concat(pawnStatBundle.operations), allUnresolved);
    const statConservation = new Map(allStatOperations.conservation.map(record =>
      [record.sourceFactKey, Object.assign({}, record, {
        representations: record.representations.slice(),
      })]));
    for (const record of statBundle.conservation) {
      const legacy = record.representations.filter(item =>
        item.representation === 'legacyCompatibility');
      if (!legacy.length) continue;
      if (!statConservation.has(record.sourceFactKey)) {
        statConservation.set(record.sourceFactKey, {
          sourceFactKey: record.sourceFactKey, representations: [],
          eligibleCanonicalOperationIds: [],
        });
      }
      statConservation.get(record.sourceFactKey).representations.unshift(...legacy);
    }
    const rawSkillFacts = _rawSkillFactsFromPawn(pawn, allUnresolved);
    const structuralContextFacts = _buildStructuralContextFacts(pawn, options);

    const skills = pawn.skills || {};
    const baseSkills = {};
    for (const k of Object.keys(skills)) baseSkills[k] = skills[k];

    const passions = pawn.passions || {};
    const basePassions = {};
    for (const k of Object.keys(passions)) basePassions[k] = passions[k];

    const statusIds = ['downed', 'inMentalState', 'mentalBreak', 'deactivated',
      'unconscious', 'canBeAwake'];
    const parsedStatusFacts = pawn.currentStatusSources && pawn.currentStatusSources.facts;
    const currentStatusFacts = {};
    for (const statusId of statusIds) {
      const source = parsedStatusFacts && parsedStatusFacts[statusId];
      currentStatusFacts[statusId] = source && (source.state === 'known' || source.state === 'unknown')
        ? {
            statusId,
            state: source.state,
            value: source.state === 'known' ? source.value === true : null,
            evidence: Array.isArray(source.evidence)
              ? source.evidence.map(item => Object.assign({}, item)) : [],
          }
        : { statusId, state: 'unknown', value: null, evidence: [] };
    }

    return {
      effects: statBundle.legacyEffects,
      skillOperations: skillBundle.operations,
      statOperations: allStatOperations.operations,
      sourceFamilyCompleteness: pawnStatBundle.sourceFamilyCompleteness,
      temporalCoverage: _temporalFamilyCoverage(options),
      structuralContextFacts,
      conservation: skillBundle.conservation.concat(Array.from(statConservation.values())),
      bodyEvidence,
      permissionEvidence: {
        rawSources: Array.isArray(pawn.permissionSources)
          ? pawn.permissionSources.map(source => Object.assign({}, source, {
              targets: Array.isArray(source.targets)
                ? source.targets.map(target => Object.assign({}, target)) : [],
            }))
          : [],
        legacyIncapable: Array.isArray(pawn.incapable) ? pawn.incapable.slice() : [],
      },
      pawnState: {
        raceDefName: pawn.raceDefName || null,
        age: pawn.bioAge == null ? null : pawn.bioAge,
        lifeStage: pawn.lifeStage == null ? null : pawn.lifeStage,
        currentStatus: {
          downed: !!pawn.downed,
        },
        currentStatusFacts,
        baseSkills,
        basePassions,
        baseSkillFacts: rawSkillFacts.baseSkillFacts,
        passionFacts: rawSkillFacts.passionFacts,
        skillRecordCatalogue: rawSkillFacts.catalogue,
      },
      unresolvedSources: allUnresolved,
    };
  },

  // Exposed for testing and downstream use
  _normaliseEffects: _normaliseEffects,
  _normaliseSkillOperations: _normaliseSkillOperations,
  _buildSkillOperations: _buildSkillOperations,
  _buildRuntimeAptitudeOperations: _buildRuntimeAptitudeOperations,
  _rawSkillFactsFromPawn: _rawSkillFactsFromPawn,
  _normaliseStatOperations: _normaliseStatOperations,
  _selectCanonicalStatOperations: _selectCanonicalStatOperations,
  _buildExactLearningStatOperations: _buildExactLearningStatOperations,
  _bindPawnStatOperations: _bindPawnStatOperations,
  _buildStructuralContextFacts: _buildStructuralContextFacts,
  _skillDefIdForAppSkill: _skillDefIdForAppSkill,
  _skillOperationKindForEffect: _skillOperationKindForEffect,
  _resolveXenoStrict: _resolveXenoStrict,
  _resolveRoleStrict: _resolveRoleStrict,
  _geneRefsForPawn: _geneRefsForPawn,
  _classifyIncap: _classifyIncap,
  _emitTypedPermissionSources: _emitTypedPermissionSources,
  _permissionSourcesForDefinition: _permissionSourcesForDefinition,
  _resolveBodyPart: _resolveBodyPart,
  _makeEvidence: _makeEvidence,
  _makeBodyEvidence: _makeBodyEvidence,
  _makeUnresolved: _makeUnresolved,
  _modIdOf: _modIdOf,
  _resolveTraitStrict: _resolveTraitStrict,
  _KNOWN_JOB_IDS: _KNOWN_JOB_IDS,
  _KNOWN_INCAP_IDS: _KNOWN_INCAP_IDS,
  _CANONICAL_WORK_TAGS: _CANONICAL_WORK_TAGS,
};

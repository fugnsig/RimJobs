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
      { rawTarget: incapId, modId: args.provenance.modId }
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
      'recreationHoursRecommendation', null, -1,
      provenance, confidence
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
  fromGenes(pawn) { return { effects: [], unresolved: [] }; },
  fromXenotype(pawn) { return { effects: [], unresolved: [] }; },
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

  bodyEvidenceFromPawnHealth(pawn) { return []; },
  effectsFromHediffDefinitions(pawn) { return { effects: [], unresolved: [] }; },

  collectPawnEvidence(pawn) {
    return {
      effects: [],
      bodyEvidence: [],
      pawnState: {},
      unresolvedSources: [],
    };
  },

  // Exposed for testing and downstream use
  _normaliseEffects: _normaliseEffects,
  _resolveXenoStrict: _resolveXenoStrict,
  _resolveRoleStrict: _resolveRoleStrict,
  _geneRefsForPawn: _geneRefsForPawn,
  _classifyIncap: _classifyIncap,
  _resolveBodyPart: _resolveBodyPart,
  _makeEvidence: _makeEvidence,
  _makeBodyEvidence: _makeBodyEvidence,
  _makeUnresolved: _makeUnresolved,
  _modIdOf: _modIdOf,
  _resolveTraitStrict: _resolveTraitStrict,
  _KNOWN_JOB_IDS: _KNOWN_JOB_IDS,
  _KNOWN_INCAP_IDS: _KNOWN_INCAP_IDS,
};

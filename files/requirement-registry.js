/**
 * C4 immutable, definition-driven job requirement registry.
 * Audited against RimWorld 1.6.4871 rev590.
 */
const RequirementRegistry = (() => {
  const RUNTIME_VERSION = '1.6.4871';
  const DIRECT_WORK_TYPES = Object.freeze({
    firefight: 'Firefighter', patient: 'Patient', doctoring: 'Doctor',
    bed_rest: 'PatientBedRest', childcare: 'Childcare', basic_work: 'BasicWorker',
    warden: 'Warden', handling: 'Handling', cooking: 'Cooking', hunting: 'Hunting',
    construction: 'Construction', growing: 'Growing', mining: 'Mining',
    plant_cut: 'PlantCutting', smithing: 'Smithing', tailoring: 'Tailoring',
    art_work: 'Art', crafting: 'Crafting', fishing: 'Fishing', hauling: 'Hauling',
    cleaning: 'Cleaning', dark_study: 'DarkStudy', research: 'Research',
  });
  const AUDITED_CAPACITY_WORKERS = new Set([
    'PawnCapacityWorker_Manipulation', 'PawnCapacityWorker_Talking',
  ]);

  function deepClone(value) {
    if (Array.isArray(value)) return value.map(deepClone);
    if (!value || typeof value !== 'object') return value;
    const out = {};
    for (const key of Object.keys(value)) out[key] = deepClone(value[key]);
    return out;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    return Object.freeze(value);
  }

  function provenance(entry, extra) {
    const source = entry && entry._provenance ? deepClone(entry._provenance) : { modId: null, sources: [] };
    source.runtimeVersion = RUNTIME_VERSION;
    if (extra) Object.assign(source, extra);
    return source;
  }

  function completeness(value) {
    return value === 'complete' || value === 'partial' || value === 'unknown'
      ? value : 'unknown';
  }

  function activeState(entry, activePackageIds) {
    const resolution = activePackageIds || { ids: [], completeness: 'unknown' };
    const modId = entry && entry._provenance && entry._provenance.modId;
    if (!modId) return { active: true, complete: false, reason: 'definitionPackageUnknown' };
    if (resolution.completeness !== 'complete') {
      return { active: true, complete: false, reason: 'activePackageSetUnknown' };
    }
    const ids = new Set((resolution.ids || []).map(id => String(id).toLowerCase()));
    return { active: ids.has(String(modId).toLowerCase()), complete: true, reason: null };
  }

  function makeCapacityRequirement(workGiver, capacityDefName, capacityDef, activePackages) {
    const active = activeState(capacityDef, activePackages);
    const thresholdKnown = capacityDef && Number.isFinite(capacityDef.minForCapable)
      && active.active && active.complete;
    const workerAudited = capacityDef && AUDITED_CAPACITY_WORKERS.has(capacityDef.workerClass);
    const reasons = [];
    if (!capacityDef) reasons.push('missingCapacityDefinition');
    else if (!active.active) reasons.push('inactiveCapacityDefinition');
    else if (!active.complete) reasons.push(active.reason);
    if (capacityDef && !Number.isFinite(capacityDef.minForCapable)) reasons.push('missingMinForCapable');
    if (capacityDef && completeness(capacityDef._completeness) !== 'complete') {
      reasons.push(...(capacityDef._completenessReasons || ['capacityDefinitionIncomplete']));
    }
    return {
      requirementId: 'capacity:' + capacityDefName,
      kind: 'capacity',
      capacityDefName,
      completeness: thresholdKnown && !reasons.length ? 'complete' : 'partial',
      completenessReasons: Array.from(new Set(reasons)),
      comparison: thresholdKnown ? {
        operator: 'gt',
        thresholdSource: {
          kind: 'capacityDefField', field: 'minForCapable', value: capacityDef.minForCapable,
        },
      } : null,
      notApplicable: workerAudited ? 'blocked' : 'unknown',
      provenance: provenance(capacityDef, {
        sourceWorkGiverDef: workGiver.defName,
      }),
    };
  }

  function makePath(workGiver, capacityDefs, activePackages) {
    const requirements = (workGiver.requiredCapacities || []).map(capacityDefName =>
      makeCapacityRequirement(workGiver, capacityDefName, capacityDefs[capacityDefName], activePackages));
    const reasons = (workGiver.requiredCapacitiesCompletenessReasons || []).slice();
    if (completeness(workGiver.requiredCapacitiesCompleteness) !== 'complete') {
      if (!reasons.length) reasons.push('requiredCapacitiesIncomplete');
    }
    for (const requirement of requirements) {
      if (requirement.completeness !== 'complete') reasons.push(...requirement.completenessReasons);
    }
    return {
      pathId: 'workGiver:' + workGiver.defName,
      sourceWorkGiverDefs: [workGiver.defName],
      completeness: reasons.length ? 'partial' : 'complete',
      completenessReasons: Array.from(new Set(reasons)),
      allOf: requirements,
      giverClass: workGiver.giverClass || null,
      priorityInType: workGiver.priorityInType == null ? null : workGiver.priorityInType,
      provenance: provenance(workGiver),
    };
  }

  function unknownPolicy(jobId, reason) {
    return {
      jobId,
      state: 'unknown',
      completeness: 'unknown',
      completenessReasons: [reason],
      workTypeDefName: null,
      sourceWorkTypes: [],
      permission: {
        workTags: { completeness: 'unknown', values: [], provenance: provenance(null) },
        age: { state: 'unknown', provenance: provenance(null) },
      },
      execution: { completeness: 'unknown', completenessReasons: [reason], mode: 'anyPath', paths: [] },
      availability: {
        globalPolicyId: 'c4-global-current-status',
        currentExecutionRef: 'permission.execution',
        currentOnly: { completeness: 'unknown', requirements: [] },
      },
      provenance: provenance(null, { policyKind: 'unresolved' }),
    };
  }

  function makeKnownPolicy(jobId, workTypeDefName, workType, workGivers, capacityDefs, activePackages) {
    if (!workType) return unknownPolicy(jobId, 'missingWorkTypeDefinition:' + workTypeDefName);
    const workTypeActive = activeState(workType, activePackages);
    if (!workTypeActive.active) return unknownPolicy(jobId, 'inactiveWorkTypeDefinition:' + workTypeDefName);
    const catalogueReasons = (workType.pathCatalogueCompletenessReasons || []).slice();
    if (!workTypeActive.complete) catalogueReasons.push(workTypeActive.reason);
    if (completeness(workType.pathCatalogueCompleteness) !== 'complete' && !catalogueReasons.length) {
      catalogueReasons.push('pathCatalogueIncomplete');
    }
    const matching = [];
    for (const giver of Object.values(workGivers)) {
      const active = activeState(giver, activePackages);
      if (!active.active) continue;
      if (!active.complete) catalogueReasons.push(active.reason);
      if (giver.workTypeDefName !== workTypeDefName) continue;
      if (completeness(giver.workTypeCompleteness) !== 'complete') {
        catalogueReasons.push(...(giver.workTypeCompletenessReasons || ['workTypeMembershipIncomplete']));
      }
      if (completeness(giver.catalogueMembershipCompleteness) !== 'complete') {
        catalogueReasons.push(...(giver.catalogueMembershipCompletenessReasons || ['catalogueMembershipIncomplete']));
      }
      matching.push(giver);
    }
    matching.sort((a, b) => (b.priorityInType || 0) - (a.priorityInType || 0)
      || String(a.defName).localeCompare(String(b.defName)));
    const paths = matching.map(giver => makePath(giver, capacityDefs, activePackages));
    const workTagReasons = (workType.workTagsCompletenessReasons || []).slice();
    if (!workTypeActive.complete) workTagReasons.push(workTypeActive.reason);
    const tagCompleteness = completeness(workType.workTagsCompleteness) === 'complete'
      && !workTagReasons.length ? 'complete' : 'partial';
    return {
      jobId,
      state: 'definitionBacked',
      completeness: tagCompleteness === 'complete' && !catalogueReasons.length
        ? 'complete' : 'partial',
      completenessReasons: Array.from(new Set(workTagReasons.concat(catalogueReasons))),
      workTypeDefName,
      sourceWorkTypes: [workTypeDefName],
      permission: {
        workTags: {
          completeness: tagCompleteness,
          completenessReasons: Array.from(new Set(workTagReasons)),
          values: (workType.workTags || []).slice(),
          provenance: provenance(workType),
        },
        age: {
          state: 'definitionDriven',
          source: { kind: 'raceWorkSettings', workTypeDefName },
          provenance: provenance(workType),
        },
      },
      execution: {
        completeness: catalogueReasons.length ? 'partial' : 'complete',
        completenessReasons: Array.from(new Set(catalogueReasons)),
        mode: 'anyPath',
        paths,
      },
      availability: {
        globalPolicyId: 'c4-global-current-status',
        currentExecutionRef: 'permission.execution',
        currentOnly: { completeness: 'complete', requirements: [] },
      },
      provenance: provenance(workType, { policyKind: 'definitionBacked' }),
    };
  }

  function normaliseRacePolicies(raceWorkPolicies, activePackages) {
    const out = {};
    for (const [raceDefName, source] of Object.entries(raceWorkPolicies || {})) {
      const active = activeState(source, activePackages);
      if (!active.active) continue;
      const catalogueReasons = (source.catalogueCompletenessReasons || []).slice();
      if (!active.complete) catalogueReasons.push(active.reason);
      out[raceDefName] = {
        raceDefName,
        entries: deepClone(source.entries || {}),
        entryCompleteness: deepClone(source.entryCompleteness || {}),
        entryCompletenessReasons: deepClone(source.entryCompletenessReasons || {}),
        catalogueCompleteness: completeness(source.catalogueCompleteness) === 'complete'
          && !catalogueReasons.length ? 'complete' : 'partial',
        catalogueCompletenessReasons: Array.from(new Set(catalogueReasons)),
        provenance: provenance(source),
      };
    }
    return out;
  }

  function createSnapshot(inputs) {
    const source = inputs || {};
    const runtimeVersion = source.runtimeVersion || RUNTIME_VERSION;
    const jobIds = [];
    for (const item of source.jobCatalog || []) {
      const id = typeof item === 'string' ? item : item && item.id;
      if (id && jobIds.indexOf(id) < 0) jobIds.push(id);
    }
    const workTypes = source.workTypeDefs || {};
    const workGivers = source.workGiverDefs || {};
    const capacityDefs = source.capacityDefs || {};
    const activePackages = source.activePackageIds || {
      ids: [], completeness: 'unknown', reasons: ['missingActivePackageInput'],
    };
    const jobPolicies = {};
    for (const jobId of jobIds) {
      const workTypeDefName = DIRECT_WORK_TYPES[jobId];
      jobPolicies[jobId] = workTypeDefName
        ? makeKnownPolicy(jobId, workTypeDefName, workTypes[workTypeDefName],
            workGivers, capacityDefs, activePackages)
        : unknownPolicy(jobId, 'noAuditedCanonicalPolicy');
    }
    return deepFreeze({
      schemaVersion: 1,
      runtimeVersion,
      activePackageIds: deepClone(activePackages),
      jobPolicies,
      raceWorkPolicies: normaliseRacePolicies(source.raceWorkPolicies || {}, activePackages),
      definitionUncertainty: deepClone(source.definitionUncertainty || {}),
    });
  }

  function getJobPolicy(snapshot, jobId) {
    if (!snapshot || !snapshot.jobPolicies) return null;
    return Object.prototype.hasOwnProperty.call(snapshot.jobPolicies, jobId)
      ? snapshot.jobPolicies[jobId] : null;
  }

  function getRaceWorkEntry(snapshot, raceDefName, workTypeDefName) {
    const policy = snapshot && snapshot.raceWorkPolicies
      ? snapshot.raceWorkPolicies[raceDefName] : null;
    if (!policy) return deepFreeze({
      state: 'unknown', minAge: null,
      reasons: ['missingRaceWorkPolicy'], provenance: provenance(null),
    });
    if (Object.prototype.hasOwnProperty.call(policy.entries, workTypeDefName)) {
      const state = completeness(policy.entryCompleteness[workTypeDefName]) === 'complete'
        && Number.isInteger(policy.entries[workTypeDefName]) ? 'knownGate' : 'unknown';
      return deepFreeze({
        state,
        minAge: state === 'knownGate' ? policy.entries[workTypeDefName] : null,
        reasons: deepClone(policy.entryCompletenessReasons[workTypeDefName] || []),
        provenance: deepClone(policy.provenance),
      });
    }
    if (policy.catalogueCompleteness === 'complete') return deepFreeze({
      state: 'knownNoGate', minAge: null, reasons: [], provenance: deepClone(policy.provenance),
    });
    return deepFreeze({
      state: 'unknown', minAge: null,
      reasons: deepClone(policy.catalogueCompletenessReasons), provenance: deepClone(policy.provenance),
    });
  }

  return Object.freeze({
    runtimeVersion: RUNTIME_VERSION,
    directWorkTypes: DIRECT_WORK_TYPES,
    createSnapshot,
    getJobPolicy,
    getRaceWorkEntry,
    _deepFreeze: deepFreeze,
  });
})();

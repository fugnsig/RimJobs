/**
 * C5 immutable structural-effectiveness definition registry.
 * Definition data only. Request-specific selection and evaluation happen later.
 */
const EffectivenessDefinitionRegistry = (() => {
  const SCHEMA_VERSION = 1;

  function deepClone(value) {
    if (Array.isArray(value)) return value.map(deepClone);
    if (!value || typeof value !== 'object') return value;
    const output = {};
    for (const key of Object.keys(value).sort()) output[key] = deepClone(value[key]);
    return output;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    return Object.freeze(value);
  }

  function completeness(value) {
    return ['complete', 'partial', 'unknown'].includes(value) ? value : 'unknown';
  }

  function scannerProvenance(definition) {
    return {
      provenanceClass: 'scannerData',
      details: deepClone(definition && definition._provenance || {}),
    };
  }

  function auditProvenance(audit, sourceField) {
    return {
      provenanceClass: 'auditedRuntime',
      runtimeVersion: audit.runtime.displayVersion,
      assemblySha256: audit.runtime.assemblySha256,
      sourceField,
    };
  }

  function phaseMap(audit) {
    const output = {};
    for (const phase of audit.statPhases || []) output[phase.id] = phase.order;
    return output;
  }

  function operand(values) {
    return Object.assign({
      value: null, scale: null, weight: null, max: null, min: null,
      allowedDefect: null, useReciprocal: null, curvePoints: [],
    }, deepClone(values || {}));
  }

  function operation(id, phase, phases, sourceOrder, kind, statDefId, fields) {
    return Object.assign({
      operationTemplateId: id,
      phase,
      phaseOrder: phases[phase],
      sourceOrder,
      kind,
      statDefId,
      sourceDefId: statDefId,
      dependencyStatDefId: null,
      skillDefId: null,
      capacityDefId: null,
      statPartClass: null,
      durability: 'durable',
      applicability: 'applicable',
      operand: operand(),
      semanticsSupport: 'supported',
      completeness: 'complete',
      compatibilityOnly: false,
      provenanceClass: 'auditedRuntime',
      unresolved: [],
    }, fields || {});
  }

  function statTemplates(statDefId, definition, phases) {
    const output = [];
    let sourceOrder = 0;
    output.push(operation(statDefId + ':base', 'base', phases, sourceOrder++,
      'setBase', statDefId, { operand: operand({ value: definition.defaultBaseValue }) }));

    for (const need of definition.skillNeeds || []) {
      const phase = need.phase;
      output.push(operation(statDefId + ':' + phase + ':' + need.skillDefId,
        phase, phases, sourceOrder++, phase === 'skillNeedOffset' ? 'add' : 'multiply',
        statDefId, {
          skillDefId: need.skillDefId,
          operand: operand({ value: need.base, scale: need.perLevel }),
        }));
    }
    for (const capacity of definition.capacityOffsets || []) {
      output.push(operation(statDefId + ':capacityOffset:' + capacity.capacityDefId,
        'capacityOffset', phases, sourceOrder++, 'capacityOffset', statDefId, {
          capacityDefId: capacity.capacityDefId,
          operand: operand({ scale: capacity.scale, max: capacity.max }),
        }));
    }
    for (const capacity of definition.capacityFactors || []) {
      output.push(operation(statDefId + ':capacityFactor:' + capacity.capacityDefId,
        'capacityFactor', phases, sourceOrder++, 'capacityFactor', statDefId, {
          capacityDefId: capacity.capacityDefId,
          operand: operand({
            weight: capacity.weight, max: capacity.max,
            allowedDefect: capacity.allowedDefect,
            useReciprocal: capacity.useReciprocal,
          }),
        }));
    }

    const statPartDependencies = new Set();
    for (const part of definition.statParts || []) {
      if (part.dependencyStatDefId) statPartDependencies.add(part.dependencyStatDefId);
      output.push(operation(statDefId + ':statPart:' + part.class + ':' + sourceOrder,
        'statPart', phases, sourceOrder++, 'transform', statDefId, {
          statPartClass: part.class,
          dependencyStatDefId: part.dependencyStatDefId || null,
          durability: part.durability || 'unknown',
          operand: operand({
            value: part.factor == null ? null : part.factor,
            curvePoints: part.curvePoints || [],
          }),
          descriptor: deepClone(part),
        }));
    }

    const postDependencies = new Set(definition.postProcessStatFactors || []);
    for (const dependency of definition.dependencies || []) {
      if (postDependencies.has(dependency) || statPartDependencies.has(dependency)) continue;
      output.push(operation(statDefId + ':statFactor:' + dependency,
        'statFactor', phases, sourceOrder++, 'dependencyFactor', statDefId, {
          dependencyStatDefId: dependency,
        }));
    }
    if (Array.isArray(definition.postProcessCurve) && definition.postProcessCurve.length) {
      output.push(operation(statDefId + ':postProcessCurve', 'postProcessCurve', phases,
        sourceOrder++, 'curve', statDefId, {
          operand: operand({ curvePoints: definition.postProcessCurve }),
        }));
    }
    for (const dependency of definition.postProcessStatFactors || []) {
      output.push(operation(statDefId + ':postProcessStatFactor:' + dependency,
        'postProcessStatFactor', phases, sourceOrder++, 'dependencyFactor', statDefId, {
          dependencyStatDefId: dependency,
        }));
    }
    if (definition.scenarioRandomizable === true) {
      output.push(operation(statDefId + ':scenarioFactor', 'scenarioFactor', phases,
        sourceOrder++, 'scenarioFactor', statDefId, {
          durability: 'mixed', applicability: 'unknown', completeness: 'unknown',
        }));
    }
    if (Number.isFinite(definition.roundToFiveOver)) {
      output.push(operation(statDefId + ':roundToFiveOver', 'roundToFiveOver', phases,
        sourceOrder++, 'roundToFiveOver', statDefId, {
          operand: operand({ value: definition.roundToFiveOver }),
        }));
    }
    if (definition.roundValue === true) {
      output.push(operation(statDefId + ':roundValue', 'roundValue', phases,
        sourceOrder++, 'roundInteger', statDefId));
    }
    if (Number.isFinite(definition.minValue) || Number.isFinite(definition.maxValue)) {
      output.push(operation(statDefId + ':clamp', 'clamp', phases, sourceOrder++,
        'clamp', statDefId, {
          operand: operand({ min: definition.minValue, max: definition.maxValue }),
        }));
    }
    output.sort((left, right) => left.phaseOrder - right.phaseOrder
      || left.sourceOrder - right.sourceOrder);
    return output;
  }

  function buildSkillPolicies(scanner, audit) {
    const output = {};
    for (const skillDefId of Object.keys(scanner.skillDefs || {}).sort()) {
      const definition = scanner.skillDefs[skillDefId] || {};
      output[skillDefId] = {
        schemaVersion: SCHEMA_VERSION,
        runtimeVersion: audit.runtime.displayVersion,
        appSkillId: definition.appSkillId || null,
        skillDefId,
        minLevel: audit.skillRecord.minLevel,
        maxLevel: audit.skillRecord.maxLevel,
        disablingWorkTags: deepClone(definition.disablingWorkTags || []),
        neverDisabledBasedOnWorkTypes: definition.neverDisabledBasedOnWorkTypes === true,
        definitionCompleteness: completeness(definition._completeness),
        catalogueCompleteness: completeness(scanner.catalogueCompleteness
          && scanner.catalogueCompleteness.skillDefs),
        provenance: scannerProvenance(definition),
        unresolved: deepClone(definition._completenessReasons || []),
      };
    }
    return output;
  }

  function buildPassionProviders(scanner, audit) {
    const vanillaEntries = {};
    for (const entry of audit.passions.vanillaProvider.entries || []) {
      vanillaEntries[entry.identity] = Object.assign(deepClone(entry), {
        semantics: 'supported', provenanceClass: 'auditedRuntime',
      });
    }
    const extensions = {};
    for (const defName of Object.keys(scanner.passions || {}).sort()) {
      const definition = scanner.passions[defName] || {};
      extensions[defName] = Object.assign(deepClone(definition), {
        defName,
        semantics: definition.semantics || null,
        provenance: scannerProvenance(definition),
      });
    }
    return {
      vanilla: {
        providerId: audit.passions.vanillaProvider.providerId,
        runtimeFingerprint: audit.passions.vanillaProvider.runtimeFingerprint,
        entries: vanillaEntries,
        provenance: auditProvenance(audit, 'passions.vanillaProvider'),
      },
      extensions,
      providerFingerprint: scanner.providerFingerprint || null,
      runtimeFingerprint: scanner.runtimeFingerprint || null,
    };
  }

  function buildStatDefinitions(scanner, audit, phases) {
    const supported = {};
    for (const statDefId of Object.keys(audit.statDefs || {}).sort()) {
      const audited = deepClone(audit.statDefs[statDefId]);
      const scanned = scanner.statDefs && scanner.statDefs[statDefId];
      supported[statDefId] = {
        schemaVersion: SCHEMA_VERSION,
        runtimeVersion: audit.runtime.displayVersion,
        statDefId,
        evaluatorSupport: 'initialSubset',
        workerClass: scanned && scanned.workerClassId || 'StatWorker',
        definition: audited,
        orderedOperations: statTemplates(statDefId, audited, phases),
        dependencies: deepClone(audit.dependencyGraph[statDefId] || []),
        phaseCompleteness: deepClone(scanned && scanned.phaseCompleteness || {}),
        scannerDefinition: scanned ? deepClone(scanned) : null,
        provenance: {
          semantics: auditProvenance(audit, 'statDefs.' + statDefId),
          definition: scannerProvenance(scanned),
        },
      };
    }
    const recordOnlyIds = new Set(audit.recordOnlyStatDefs || []);
    for (const [statDefId, definition] of Object.entries(scanner.statDefs || {})) {
      if (definition && definition.recordOnly === true) recordOnlyIds.add(statDefId);
    }
    const recordOnly = {};
    for (const statDefId of Array.from(recordOnlyIds).sort()) {
      const scanned = scanner.statDefs && scanner.statDefs[statDefId];
      recordOnly[statDefId] = {
        schemaVersion: SCHEMA_VERSION,
        runtimeVersion: audit.runtime.displayVersion,
        statDefId,
        evaluatorSupport: 'recordOnly',
        scannerDefinition: scanned ? deepClone(scanned) : null,
        provenance: scanned ? scannerProvenance(scanned)
          : auditProvenance(audit, 'recordOnlyStatDefs'),
      };
    }
    return { supported, recordOnly };
  }

  function ownedScannerMap(source) {
    const output = {};
    for (const id of Object.keys(source || {}).sort()) {
      output[id] = Object.assign(deepClone(source[id]), {
        provenanceClass: 'scannerData',
      });
    }
    return output;
  }

  function buildJobPolicies(scanner, audit) {
    const output = {};
    const audited = new Map((audit.jobPolicies || []).map(policy => [policy.jobId, policy]));
    const jobIds = Array.isArray(scanner.jobCatalog) && scanner.jobCatalog.length
      ? scanner.jobCatalog.slice() : Array.from(audited.keys());
    for (const jobId of Array.from(new Set(jobIds)).sort()) {
      const source = audited.get(jobId);
      if (!source) {
        output[jobId] = {
          schemaVersion: SCHEMA_VERSION,
          runtimeVersion: audit.runtime.displayVersion,
          jobId,
          policyKind: 'unknown',
          sourceWorkTypeDefIds: [], skillDefIds: [],
          facets: [{ facetId: 'unknown-app-job', metricKind: 'unknown',
            statDefIds: [], support: 'unknown' }],
          provenanceClass: 'unknown',
          unresolved: ['noAuditedEffectivenessPolicy'],
        };
        continue;
      }
      const sourceWorkTypes = new Set(source.sourceWorkTypeDefIds || []);
      const matchingWorkGivers = Object.values(scanner.facets && scanner.facets.workGivers || {})
        .filter(binding => binding && sourceWorkTypes.has(binding.workTypeDefId));
      const linkedJobDefs = new Set(matchingWorkGivers.map(binding => binding.jobDefId).filter(Boolean));
      const definitionBindings = {
        workGivers: matchingWorkGivers.map(binding => Object.assign(deepClone(binding), {
          provenanceClass: 'scannerData',
        })),
        jobDefs: Object.values(scanner.facets && scanner.facets.jobDefs || {})
          .filter(binding => binding && linkedJobDefs.has(binding.defName))
          .map(binding => Object.assign(deepClone(binding), {
            provenanceClass: 'scannerData',
          })),
        recipes: Object.values(scanner.facets && scanner.facets.recipes || {})
          .filter(binding => binding && Array.isArray(binding.workSkillDefIds)
            && binding.workSkillDefIds.some(skillDefId =>
              (source.skillDefIds || []).includes(skillDefId)))
          .map(binding => Object.assign(deepClone(binding), {
            provenanceClass: 'scannerData',
          })),
      };
      const facets = (source.facets || []).map(facet => Object.assign(deepClone(facet), {
        provenanceClass: 'auditedRuntime',
      }));
      output[jobId] = Object.assign(deepClone(source), {
        schemaVersion: SCHEMA_VERSION,
        runtimeVersion: audit.runtime.displayVersion,
        policyKind: source.policyKind || 'definitionBacked',
        provenanceClass: 'auditedRuntime',
        provenance: auditProvenance(audit, 'jobPolicies.' + jobId),
        facets,
        definitionBindings,
      });
    }
    return output;
  }

  function createSnapshot(scannerBundle, runtimeAudit) {
    const scanner = scannerBundle || {};
    const audit = runtimeAudit || null;
    if (!audit || !audit.runtime || !audit.skillRecord || !audit.statDefs) {
      throw new TypeError('A versioned C5 runtime audit is required');
    }
    if (Object.prototype.hasOwnProperty.call(scanner, 'pawn')) {
      throw new TypeError('Effectiveness definition input must contain definitions only');
    }
    const requestKeys = ['pawn' + 'Evidence', 'structural' + 'Capacities',
      'traits', 'genes', 'health', 'role', 'precepts', 'status'];
    if (requestKeys.some(key => Object.prototype.hasOwnProperty.call(scanner, key))) {
      throw new TypeError('Effectiveness definition input contains request-specific data');
    }
    const phases = phaseMap(audit);
    const sourceCatalogues = scanner.sourceOperations || {};
    const facets = scanner.facets || {};
    return deepFreeze({
      schemaVersion: SCHEMA_VERSION,
      runtimeVersion: audit.runtime.displayVersion,
      runtimeFingerprint: deepClone(audit.runtime),
      definitionOnly: true,
      activePackageResolution: deepClone(scanner.activePackageResolution || {
        ids: [], completeness: 'unknown', reasons: ['missingActivePackageResolution'],
      }),
      catalogueCompleteness: deepClone(scanner.catalogueCompleteness || {}),
      phaseOrder: phases,
      skillPolicies: buildSkillPolicies(scanner, audit),
      passionProviders: buildPassionProviders(scanner, audit),
      statDefinitions: buildStatDefinitions(scanner, audit, phases),
      sourceOperationCatalogues: {
        traits: ownedScannerMap(sourceCatalogues.traits),
        genes: ownedScannerMap(sourceCatalogues.genes),
        geneTemplates: ownedScannerMap(sourceCatalogues.geneTemplates),
        hediffs: ownedScannerMap(sourceCatalogues.hediffs),
        precepts: ownedScannerMap(sourceCatalogues.precepts),
        roles: ownedScannerMap(sourceCatalogues.roles),
        lifeStages: ownedScannerMap(sourceCatalogues.lifeStages),
      },
      dependencyGraph: deepClone(audit.dependencyGraph || {}),
      jobPolicies: buildJobPolicies(scanner, audit),
      scannerBindings: {
        workGivers: ownedScannerMap(facets.workGivers),
        recipes: ownedScannerMap(facets.recipes),
        jobDefs: ownedScannerMap(facets.jobDefs),
      },
      definitionUncertainty: deepClone(scanner.relevantPatchNotApplied || []),
    });
  }

  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    createSnapshot,
    _deepFreeze: deepFreeze,
  });
})();

/**
 * C5 Task 6: pawn-bound stat operations and structural context contracts.
 */
const { loadScripts } = require('./_harness');

module.exports = function run() {
  const App = {
    state: {
      customXenotypes: {}, customTraits: {}, customGenes: {}, customJobs: [],
      customBackstories: {}, hediffCatalog: [], precepts: {},
      ideology: { memes: [], precepts: {} }, prostheticEfficiency: {},
    },
    getXeno() { return { uvSensitivity: 0, genes: [], skillMods: {}, incapable: [] }; },
    getTrait() { return null; },
    getRole() { return { id: 'none', skillMods: {}, workSpeed: 0, incap: [] }; },
    getIdeoEffects() { return { mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 0, researchSpeed: 0 }; },
    _passionMeta() { return { bucket: 0 }; }, _passionValue() { return 0; },
  };
  const ctx = loadScripts(['data.js', 'engine.js', 'capability-evidence.js'], { App });
  const CE = ctx.CapabilityEvidence;
  let failures = 0, total = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) { failures++; console.log('  FAIL', label); }
  };
  const typed = value => ({ state: 'known', value, evidence: [{ sourceKind: 'test' }] });
  const pawn = overrides => Object.assign({
    id: 'c5-pawn', traits: [], traitRuntimeFacts: [], geneRuntimeFacts: [],
    health: [], skills: {}, passions: {}, incapable: [], permissionSources: [],
    childhood: null, adulthood: null, role: 'none',
  }, overrides || {});
  const allComplete = Object.fromEntries([
    'traitOffsets', 'hediffOffsets', 'preceptOffsets', 'roleOffsets',
    'geneOffsets', 'lifeStageOffsets', 'equipmentOffsets', 'traitFactors',
    'hediffFactors', 'preceptFactors', 'roleFactors', 'geneFactors',
    'lifeStageFactors', 'requestThingOperations', 'inspirationOperations',
    'scenarioContext',
  ].map(id => [id, { completeness: 'complete', byStatDef: {} }]));
  const catalogues = {
    sourceOperations: {
      traits: {
        ModTrait: { traitDegrees: [{ degree: 2,
          statOffsets: [{ kind: 'statOffset', statDefId: 'MiningSpeed', value: 0.2, sourceOrder: 0 }],
          statFactors: [{ kind: 'statFactor', statDefId: 'CookSpeed', value: 1.1, sourceOrder: 0 }] }] },
        UnownedTrait: { traitDegrees: [{ degree: 0,
          statOffsets: [{ kind: 'statOffset', statDefId: 'MiningSpeed', value: 99, sourceOrder: 0 }] }] },
      },
      genes: { ModGene: {
        statOffsets: [{ kind: 'statOffset', statDefId: 'GlobalLearningFactor', value: 0.15, sourceOrder: 0 }],
        statFactors: [{ kind: 'statFactor', statDefId: 'MiningSpeed', value: 1.2, sourceOrder: 0 }],
      } },
      hediffs: { ModHediff: { stages: [{ minSeverity: 0, sourceOrder: 0,
        statOffsets: [{ kind: 'statOffset', statDefId: 'CookSpeed', value: -0.1, sourceOrder: 0 }],
        statFactors: [{ kind: 'statFactor', statDefId: 'MiningSpeed', value: 0.8, sourceOrder: 0 }] }] } },
      precepts: { WorkPrecept: {
        statOffsets: [{ kind: 'statOffset', statDefId: 'CookSpeed', value: 0.05, sourceOrder: 0 }],
      } },
      roles: { WorkRole: {
        statFactors: [{ kind: 'statFactor', statDefId: 'CookSpeed', value: 1.25, sourceOrder: 0 }],
      } },
      lifeStages: { AdultAlien: {
        statOffsets: [{ kind: 'statOffset', statDefId: 'MiningSpeed', value: 0.3, sourceOrder: 0 }],
      } },
    },
    sourceFamilyCompleteness: allComplete,
    catalogueCompleteness: { sourceOperations: 'complete' },
  };

  // C5-PS-001/002: complete empty differs from target-aware partial empty.
  {
    const complete = CE.collectPawnEvidence(pawn(), { effectivenessSourceCatalogues: catalogues });
    ok(complete.statOperations.length === 0, 'C5-PS-001 complete empty emits no operations');
    ok(complete.sourceFamilyCompleteness.traitOffsets.completeness === 'complete',
      'C5-PS-001 complete empty is proven none');
    const partialCatalogues = Object.assign({}, catalogues, {
      sourceFamilyCompleteness: Object.assign({}, allComplete, {
        traitOffsets: { completeness: 'complete', byStatDef: { MiningSpeed: 'partial' } },
      }),
    });
    const partial = CE.collectPawnEvidence(pawn(), { effectivenessSourceCatalogues: partialCatalogues });
    ok(partial.sourceFamilyCompleteness.traitOffsets.byStatDef.MiningSpeed === 'partial',
      'C5-PS-002 target-aware partial is retained');
    ok(partial.sourceFamilyCompleteness.traitOffsets.byStatDef.CookSpeed == null,
      'C5-PS-002 unrelated target is not poisoned');
  }

  // C5-PS-003: exact owned definitions enter audited phases; unrelated defs do not.
  {
    const result = CE.collectPawnEvidence(pawn({
      traitRuntimeFacts: [{ traitDefId: 'ModTrait', degree: 2, suppression: typed(false), sourceOrder: 0 }],
      geneRuntimeFacts: [{ geneDefId: 'ModGene', active: typed(true), sourceOrder: 0 }],
      health: [{ def: 'ModHediff', severity: 0.5, sourceObservationIndex: 0 }],
      preceptRuntimeFacts: [{ preceptDefId: 'WorkPrecept', applicability: typed(true), sourceOrder: 0 }],
      roleRuntimeFacts: [{ roleDefId: 'WorkRole', applicability: typed(true), sourceOrder: 0 }],
      lifeStageRuntimeFact: { lifeStageDefId: 'AdultAlien', applicability: typed(true), sourceOrder: 0 },
    }), { effectivenessSourceCatalogues: catalogues });
    const phases = result.statOperations.map(operation => operation.phase);
    for (const expected of ['traitOffset', 'hediffOffset', 'preceptOffset',
      'roleFactor', 'geneOffset', 'geneFactor', 'lifeStageOffset']) {
      ok(phases.includes(expected), 'C5-PS-003 emits ' + expected);
    }
    ok(!result.statOperations.some(operation => operation.sourceDefId === 'UnownedTrait'),
      'C5-PS-003 excludes unrelated catalogue definitions');
    ok(result.statOperations.every((operation, index, list) =>
      index === 0 || list[index - 1].phaseOrder <= operation.phaseOrder),
    'C5-PS-003 operations preserve StatWorker phase order');
  }

  // C5-PS-004: inapplicable operations remain visible but cannot be canonical.
  {
    const result = CE.collectPawnEvidence(pawn({
      traitRuntimeFacts: [{ traitDefId: 'ModTrait', degree: 2, suppression: typed(true), sourceOrder: 0 }],
      geneRuntimeFacts: [{ geneDefId: 'ModGene', active: typed(false), sourceOrder: 0 }],
    }), { effectivenessSourceCatalogues: catalogues });
    ok(result.statOperations.length === 4, 'C5-PS-004 retains suppressed and inactive operations');
    ok(result.statOperations.every(operation => operation.applicability === 'inapplicable'),
      'C5-PS-004 records inapplicable state');
    ok(result.statOperations.every(operation => operation.canonicalEligible === false),
      'C5-PS-004 inapplicable operations cannot calculate');
  }

  // C5-PS-005/006: structural properties come from typed facts/providers, never identity.
  {
    const result = CE.collectPawnEvidence(pawn({
      biologicalAgeFact: typed(37.5), lifeStageDefFact: typed('AdultAlien'),
      slaveStatusFact: typed(false), pawnKindDefFact: typed('AlienColonist'),
      raceDefFact: typed('SyntheticModRace'),
    }), {
      effectivenessSourceCatalogues: catalogues,
      structuralPropertyProviders: { races: {
        SyntheticModRace: { humanlike: typed(true) },
      } },
      scenarioProvider: { fact: typed({ scenarioDefId: 'Crashlanded' }) },
    });
    const facts = result.structuralContextFacts;
    ok(facts.biologicalAge.value === 37.5, 'C5-PS-005 biological age is lossless');
    ok(facts.lifeStageDef.value === 'AdultAlien', 'C5-PS-005 life stage is lossless');
    ok(facts.slaveStatus.value === false, 'C5-PS-005 slave status is lossless');
    ok(facts.pawnKindDef.value === 'AlienColonist', 'C5-PS-005 pawn kind is lossless');
    ok(facts.raceDef.value === 'SyntheticModRace', 'C5-PS-005 race identity is lossless');
    ok(facts.raceProperties.humanlike.value === true,
      'C5-PS-005 synthetic race humanlike property is provider-bound');
    ok(facts.scenarioContext.value.scenarioDefId === 'Crashlanded',
      'C5-PS-005 scenario context is lossless');
    const unknown = CE.collectPawnEvidence(pawn({ raceDefName: 'Human' }), {
      effectivenessSourceCatalogues: catalogues,
    });
    ok(unknown.structuralContextFacts.raceProperties.humanlike.state === 'unknown',
      'C5-PS-006 race identity does not imply humanlike');
  }

  // C5-PS-007: the established one-argument C2 call remains valid.
  {
    const result = CE.collectPawnEvidence(pawn({ bioAge: 21, raceDefName: 'Human' }));
    ok(Array.isArray(result.effects) && Array.isArray(result.statOperations),
      'C5-PS-007 one-argument collection remains compatible');
    ok(result.structuralContextFacts.raceProperties.humanlike.state === 'unknown',
      'C5-PS-007 one-argument collection does not invent provider facts');
  }

  return { name: 'C5 pawn stat evidence', total, failures };
};

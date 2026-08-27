/** C6 Task 2: Generic need-suppression evidence from definition data. */
const { loadScripts } = require('./_harness');

module.exports = function run() {
  let total = 0, failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) { failures++; console.log('  FAIL ' + label); }
  };

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
    _passionMeta() { return { bucket: 0 }; },
    _passionValue() { return 0; },
  };

  const ctx = loadScripts(['data.js', 'engine.js', 'capability-evidence.js'], { App });
  const CE = ctx.CapabilityEvidence;

  const pawn = function (overrides) {
    return Object.assign({
      id: 'test-pawn', traits: [], traitRuntimeFacts: [], geneRuntimeFacts: [],
      health: [], skills: {}, passions: {}, incapable: [], permissionSources: [],
      childhood: null, adulthood: null, role: 'none',
    }, overrides || {});
  };

  // -- C6-NEED-001: gene with disablesNeeds: ['Rest'] produces needSuppression evidence --
  {
    const p = pawn({ geneDefIds: ['gene_no_sleep'] });
    const result = CE.fromGenes(p);
    const suppression = result.effects.filter(function (e) { return e.type === 'needSuppression'; });
    ok(suppression.length >= 1,
      'C6-NEED-001a gene_no_sleep produces at least one needSuppression evidence');
    const restSup = suppression.find(function (e) { return e.target === 'Rest'; });
    ok(!!restSup,
      'C6-NEED-001b needSuppression evidence targets Rest');
    ok(restSup && restSup.value === true,
      'C6-NEED-001c needSuppression value is true');
  }

  // -- C6-NEED-002: evidence has correct provenance and stable evidenceId pattern --
  {
    const p = pawn({ geneDefIds: ['gene_no_sleep'] });
    const result = CE.fromGenes(p);
    const restSup = result.effects.find(function (e) {
      return e.type === 'needSuppression' && e.target === 'Rest';
    });
    ok(restSup && restSup.evidenceId === 'gene:gene_no_sleep:needSuppression:Rest',
      'C6-NEED-002a evidenceId matches gene:gene_no_sleep:needSuppression:Rest');
    ok(restSup && restSup.provenance && restSup.provenance.sourceKind === 'gene',
      'C6-NEED-002b provenance sourceKind is gene');
    ok(restSup && restSup.provenance && restSup.provenance.sourceId === 'gene_no_sleep',
      'C6-NEED-002c provenance sourceId is gene_no_sleep');
  }

  // -- C6-NEED-003: gene without disablesNeeds produces no needSuppression evidence --
  {
    const p = pawn({ geneDefIds: ['gene_fur'] });
    const result = CE.fromGenes(p);
    const suppression = result.effects.filter(function (e) { return e.type === 'needSuppression'; });
    ok(suppression.length === 0,
      'C6-NEED-003 gene without disablesNeeds produces no needSuppression evidence');
  }

  // -- C6-NEED-004: body_mastery trait with disablesNeeds produces 3 needSuppression records --
  {
    const p = pawn({ traits: ['body_mastery'] });
    const result = CE.fromTraits(p);
    const suppression = result.effects.filter(function (e) { return e.type === 'needSuppression'; });
    ok(suppression.length === 3,
      'C6-NEED-004a body_mastery produces exactly 3 needSuppression evidence records');
    const targets = suppression.map(function (e) { return e.target; }).sort();
    ok(targets[0] === 'Comfort' && targets[1] === 'Food' && targets[2] === 'Rest',
      'C6-NEED-004b targets are Comfort, Food and Rest');
    ok(suppression.every(function (e) { return e.provenance && e.provenance.sourceKind === 'trait'; }),
      'C6-NEED-004c all have trait provenance');
    ok(suppression.every(function (e) { return e.provenance && e.provenance.sourceId === 'body_mastery'; }),
      'C6-NEED-004d all reference body_mastery sourceId');
  }

  // -- C6-NEED-005: legacy sleepHoursOverride still emitted for gene_no_sleep --
  {
    const p = pawn({ geneDefIds: ['gene_no_sleep'] });
    const result = CE.fromGenes(p);
    const legacy = result.effects.find(function (e) { return e.type === 'sleepHoursOverride'; });
    ok(!!legacy,
      'C6-NEED-005a sleepHoursOverride evidence still emitted');
    ok(legacy && legacy.value === 0,
      'C6-NEED-005b sleepHoursOverride value is 0');
  }

  // -- C6-NEED-006: vanilla pawn with no suppression sources produces no needSuppression --
  {
    const p = pawn({});
    const geneResult = CE.fromGenes(p);
    const traitResult = CE.fromTraits(p);
    const gSup = geneResult.effects.filter(function (e) { return e.type === 'needSuppression'; });
    const tSup = traitResult.effects.filter(function (e) { return e.type === 'needSuppression'; });
    ok(gSup.length === 0 && tSup.length === 0,
      'C6-NEED-006 vanilla pawn produces no needSuppression from genes or traits');
  }

  return { name: 'C6 need-suppression evidence', total, failures };
};

/** C6 Task 4: Typed temporal-family coverage contract for C2 evidence. */
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

  const FAMILIES = ['restNeed', 'recreation', 'windows', 'conditions', 'activities'];

  const pawn = function (overrides) {
    return Object.assign({
      id: 'test-pawn', traits: [], traitRuntimeFacts: [], geneRuntimeFacts: [],
      health: [], skills: {}, passions: {}, incapable: [], permissionSources: [],
      childhood: null, adulthood: null, role: 'none',
    }, overrides || {});
  };

  // -- C6-COV-001: Evidence assembly produces temporalCoverage with all five families --
  {
    const p = pawn();
    const result = CE.collectPawnEvidence(p, {});
    ok(result.temporalCoverage && typeof result.temporalCoverage === 'object',
      'C6-COV-001a temporalCoverage is an object');
    for (const family of FAMILIES) {
      ok(result.temporalCoverage[family] && typeof result.temporalCoverage[family] === 'object',
        'C6-COV-001b temporalCoverage has family: ' + family);
      ok(typeof result.temporalCoverage[family].completeness === 'string',
        'C6-COV-001c ' + family + ' has completeness string');
      ok(Array.isArray(result.temporalCoverage[family].unresolvedEvidence),
        'C6-COV-001d ' + family + ' has unresolvedEvidence array');
    }
    // Also verify null-pawn path
    const nullResult = CE.collectPawnEvidence(null, {});
    ok(nullResult.temporalCoverage && typeof nullResult.temporalCoverage === 'object',
      'C6-COV-001e null-pawn temporalCoverage is an object');
    for (const family of FAMILIES) {
      ok(nullResult.temporalCoverage[family] && typeof nullResult.temporalCoverage[family] === 'object',
        'C6-COV-001f null-pawn temporalCoverage has family: ' + family);
    }
  }

  // -- C6-COV-002: Complete scanner with all definitions processed -> families report complete --
  {
    const completeCoverage = {};
    for (const family of FAMILIES) {
      completeCoverage[family] = { completeness: 'complete', unresolvedEvidence: [] };
    }
    const p = pawn();
    const result = CE.collectPawnEvidence(p, { temporalCoverage: completeCoverage });
    for (const family of FAMILIES) {
      ok(result.temporalCoverage[family].completeness === 'complete',
        'C6-COV-002a ' + family + ' reports complete when scanner is complete');
      ok(result.temporalCoverage[family].unresolvedEvidence.length === 0,
        'C6-COV-002b ' + family + ' has empty unresolvedEvidence when complete');
    }
  }

  // -- C6-COV-003: Incomplete scanner or unknown definitions -> affected family reports partial/unknown --
  {
    const mixedCoverage = {
      restNeed: { completeness: 'partial', unresolvedEvidence: [] },
      recreation: { completeness: 'unknown', unresolvedEvidence: [] },
      windows: { completeness: 'complete', unresolvedEvidence: [] },
      conditions: 'partial',
      // activities omitted - should default to unknown
    };
    const p = pawn();
    const result = CE.collectPawnEvidence(p, { temporalCoverage: mixedCoverage });
    ok(result.temporalCoverage.restNeed.completeness === 'partial',
      'C6-COV-003a restNeed reports partial');
    ok(result.temporalCoverage.recreation.completeness === 'unknown',
      'C6-COV-003b recreation reports unknown');
    ok(result.temporalCoverage.windows.completeness === 'complete',
      'C6-COV-003c windows reports complete');
    ok(result.temporalCoverage.conditions.completeness === 'partial',
      'C6-COV-003d conditions string shorthand normalised to partial');
    ok(result.temporalCoverage.activities.completeness === 'unknown',
      'C6-COV-003e omitted activities defaults to unknown');
  }

  // -- C6-COV-004: Unsupported temporal definitions populate unresolvedEvidence with stable evidenceId --
  {
    const unresolvedRef1 = { evidenceId: 'temporal:restNeed:modA:unknownDef', sourceKind: 'hediffDef', sourceId: 'modA_unknownDef', modId: 'modA' };
    const unresolvedRef2 = { evidenceId: 'temporal:restNeed:modB:anotherDef', sourceKind: 'geneDef', sourceId: 'modB_anotherDef', modId: 'modB' };
    const coverageWithUnresolved = {
      restNeed: {
        completeness: 'partial',
        unresolvedEvidence: [unresolvedRef1, unresolvedRef2],
      },
      recreation: { completeness: 'complete', unresolvedEvidence: [] },
      windows: { completeness: 'complete', unresolvedEvidence: [] },
      conditions: { completeness: 'complete', unresolvedEvidence: [] },
      activities: { completeness: 'complete', unresolvedEvidence: [] },
    };
    const p = pawn();
    const result = CE.collectPawnEvidence(p, { temporalCoverage: coverageWithUnresolved });
    ok(result.temporalCoverage.restNeed.unresolvedEvidence.length === 2,
      'C6-COV-004a restNeed has 2 unresolved evidence items');
    ok(result.temporalCoverage.restNeed.unresolvedEvidence[0].evidenceId === 'temporal:restNeed:modA:unknownDef',
      'C6-COV-004b first unresolved has stable evidenceId');
    ok(result.temporalCoverage.restNeed.unresolvedEvidence[1].evidenceId === 'temporal:restNeed:modB:anotherDef',
      'C6-COV-004c second unresolved has stable evidenceId');
    // Verify defensive copy
    unresolvedRef1.evidenceId = 'MUTATED';
    ok(result.temporalCoverage.restNeed.unresolvedEvidence[0].evidenceId !== 'MUTATED',
      'C6-COV-004d unresolvedEvidence is defensively copied');
  }

  // -- C6-COV-005: Unresolved evidence in one family does not degrade another family --
  {
    const coverageIsolated = {
      restNeed: {
        completeness: 'partial',
        unresolvedEvidence: [{ evidenceId: 'temporal:restNeed:mod:x', sourceKind: 'hediffDef', sourceId: 'x' }],
      },
      recreation: { completeness: 'complete', unresolvedEvidence: [] },
      windows: { completeness: 'complete', unresolvedEvidence: [] },
      conditions: { completeness: 'complete', unresolvedEvidence: [] },
      activities: { completeness: 'complete', unresolvedEvidence: [] },
    };
    const p = pawn();
    const result = CE.collectPawnEvidence(p, { temporalCoverage: coverageIsolated });
    ok(result.temporalCoverage.restNeed.completeness === 'partial',
      'C6-COV-005a restNeed is partial (has unresolved)');
    ok(result.temporalCoverage.recreation.completeness === 'complete',
      'C6-COV-005b recreation stays complete despite restNeed being partial');
    ok(result.temporalCoverage.windows.completeness === 'complete',
      'C6-COV-005c windows stays complete despite restNeed being partial');
    ok(result.temporalCoverage.conditions.completeness === 'complete',
      'C6-COV-005d conditions stays complete despite restNeed being partial');
    ok(result.temporalCoverage.activities.completeness === 'complete',
      'C6-COV-005e activities stays complete despite restNeed being partial');
  }

  // -- C6-COV-006: A complete empty family proves "proven none" for that dimension --
  {
    const completeCoverage = {};
    for (const family of FAMILIES) {
      completeCoverage[family] = { completeness: 'complete', unresolvedEvidence: [] };
    }
    const p = pawn();
    const result = CE.collectPawnEvidence(p, { temporalCoverage: completeCoverage });
    // A complete family with no unresolved evidence means the scanner fully covered
    // that dimension and found nothing - this proves "no temporal contribution" for
    // that dimension. The structure itself encodes this: completeness === 'complete'
    // combined with empty unresolvedEvidence is the canonical "proven none" signal.
    for (const family of FAMILIES) {
      ok(result.temporalCoverage[family].completeness === 'complete',
        'C6-COV-006a ' + family + ': complete + empty = proven none (completeness stays complete)');
      ok(result.temporalCoverage[family].unresolvedEvidence.length === 0,
        'C6-COV-006b ' + family + ': proven none has no unresolved evidence');
    }
  }

  // -- C6-COV-007: A partial/unknown empty family does NOT produce "verified none" --
  {
    const incompleteCoverage = {
      restNeed: { completeness: 'partial', unresolvedEvidence: [] },
      recreation: { completeness: 'unknown', unresolvedEvidence: [] },
      windows: { completeness: 'partial', unresolvedEvidence: [] },
      conditions: { completeness: 'unknown', unresolvedEvidence: [] },
      activities: { completeness: 'partial', unresolvedEvidence: [] },
    };
    const p = pawn();
    const result = CE.collectPawnEvidence(p, { temporalCoverage: incompleteCoverage });
    // Even though unresolvedEvidence is empty, a partial/unknown completeness means
    // the scanner did not fully cover the dimension. A downstream C6 resolver must
    // NOT treat this as "proven none" - it remains unresolved.
    for (const family of FAMILIES) {
      ok(result.temporalCoverage[family].completeness !== 'complete',
        'C6-COV-007a ' + family + ': non-complete + empty != proven none (completeness degrades)');
      ok(result.temporalCoverage[family].unresolvedEvidence.length === 0,
        'C6-COV-007b ' + family + ': unresolvedEvidence is still empty');
    }
    // Verify the specific values are preserved
    ok(result.temporalCoverage.restNeed.completeness === 'partial',
      'C6-COV-007c restNeed preserved as partial');
    ok(result.temporalCoverage.recreation.completeness === 'unknown',
      'C6-COV-007d recreation preserved as unknown');
  }

  // -- C6-COV-008: No temporalCoverage option defaults all families to unknown --
  {
    const p = pawn();
    const result = CE.collectPawnEvidence(p);
    ok(result.temporalCoverage && typeof result.temporalCoverage === 'object',
      'C6-COV-008a temporalCoverage present even with no options');
    for (const family of FAMILIES) {
      ok(result.temporalCoverage[family].completeness === 'unknown',
        'C6-COV-008b ' + family + ' defaults to unknown with no options');
      ok(result.temporalCoverage[family].unresolvedEvidence.length === 0,
        'C6-COV-008c ' + family + ' defaults to empty unresolvedEvidence');
    }
  }

  // -- C6-COV-009: Invalid completeness values are normalised to unknown --
  {
    const badCoverage = {
      restNeed: { completeness: 'bogus', unresolvedEvidence: [] },
      recreation: { completeness: 42, unresolvedEvidence: [] },
      windows: { completeness: null, unresolvedEvidence: [] },
      conditions: { completeness: undefined, unresolvedEvidence: [] },
      activities: { completeness: '', unresolvedEvidence: [] },
    };
    const p = pawn();
    const result = CE.collectPawnEvidence(p, { temporalCoverage: badCoverage });
    for (const family of FAMILIES) {
      ok(result.temporalCoverage[family].completeness === 'unknown',
        'C6-COV-009 ' + family + ': invalid completeness normalised to unknown');
    }
  }

  return { name: 'C6 temporal-family coverage', total, failures };
};

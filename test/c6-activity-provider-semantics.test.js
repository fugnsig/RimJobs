/** C6 Task 3: Typed activity provider fields (obligation, satisfiesNeeds, composition). */
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

  // -- C6-ACT-001: Meditation requiredActivity evidence has typed obligation field --
  {
    const p = pawn({ health: [{ def: 'Hediff_Psylink', hediffClass: 'Hediff_Psylink' }] });
    const result = CE.effectsFromHediffDefinitions(p);
    const med = result.effects.find(function (e) {
      return e.type === 'requiredActivity' && e.activity === 'meditation';
    });
    ok(!!med, 'C6-ACT-001a psycaster meditation evidence exists');
    ok(med && med.obligation === 'required',
      'C6-ACT-001b meditation obligation is "required"');
  }

  // -- C6-ACT-002: Meditation requiredActivity evidence has typed satisfiesNeeds array --
  {
    const p = pawn({ health: [{ def: 'Hediff_Psylink', hediffClass: 'Hediff_Psylink' }] });
    const result = CE.effectsFromHediffDefinitions(p);
    const med = result.effects.find(function (e) {
      return e.type === 'requiredActivity' && e.activity === 'meditation';
    });
    ok(med && Array.isArray(med.satisfiesNeeds),
      'C6-ACT-002a satisfiesNeeds is an array');
    ok(med && med.satisfiesNeeds && med.satisfiesNeeds.length === 1 && med.satisfiesNeeds[0] === 'recreation',
      'C6-ACT-002b satisfiesNeeds contains "recreation"');
  }

  // -- C6-ACT-003: Meditation requiredActivity evidence has typed composition metadata --
  {
    const p = pawn({ health: [{ def: 'Hediff_Psylink', hediffClass: 'Hediff_Psylink' }] });
    const result = CE.effectsFromHediffDefinitions(p);
    const med = result.effects.find(function (e) {
      return e.type === 'requiredActivity' && e.activity === 'meditation';
    });
    ok(med && med.composition && typeof med.composition === 'object',
      'C6-ACT-003a composition is an object');
    ok(med && med.composition && med.composition.resolved === true,
      'C6-ACT-003b composition.resolved is true');
    ok(med && med.composition && med.composition.rule === 'singleSource',
      'C6-ACT-003c composition.rule is "singleSource"');
  }

  // -- C6-ACT-004: Provider with audited composition produces resolved:true regardless of record count --
  {
    // Single psylink record - audited provider, so resolved:true
    const p1 = pawn({ health: [{ def: 'Hediff_Psylink', hediffClass: 'Hediff_Psylink' }] });
    const r1 = CE.effectsFromHediffDefinitions(p1);
    const med1 = r1.effects.find(function (e) {
      return e.type === 'requiredActivity' && e.activity === 'meditation';
    });
    ok(med1 && med1.composition && med1.composition.resolved === true,
      'C6-ACT-004a single psylink record: composition.resolved is true');

    // Two psylink records (different defs) - still audited provider, still resolved:true
    // The psycaster meditation path produces one evidence record regardless of how many
    // psylink hediffs are present (it breaks after first match), so resolved stays true.
    const p2 = pawn({ health: [
      { def: 'Hediff_Psylink', hediffClass: 'Hediff_Psylink' },
      { def: 'PsychicAmplifier', hediffClass: 'Hediff_Psylink' },
    ] });
    const r2 = CE.effectsFromHediffDefinitions(p2);
    const med2 = r2.effects.find(function (e) {
      return e.type === 'requiredActivity' && e.activity === 'meditation';
    });
    ok(med2 && med2.composition && med2.composition.resolved === true,
      'C6-ACT-004b multiple psylink hediffs: composition.resolved is still true');
  }

  // -- C6-ACT-005: Provider without audited composition produces resolved:false --
  {
    // Use a hediff catalog entry with requiredActivities but no audited composition
    App.state.hediffCatalog = [
      { def: 'Hediff_ModdedTrance', label: 'modded trance',
        requiredActivities: [
          { activity: 'trance', hours: 1, obligation: 'recommended' },
        ] },
    ];
    // Reload scripts to pick up catalog
    const ctx2 = loadScripts(['data.js', 'engine.js', 'capability-evidence.js'], { App });
    const CE2 = ctx2.CapabilityEvidence;

    const p = pawn({ health: [{ def: 'Hediff_ModdedTrance' }] });
    const result = CE2.effectsFromHediffDefinitions(p);
    const trance = result.effects.find(function (e) {
      return e.type === 'requiredActivity' && e.activity === 'trance';
    });
    ok(!!trance, 'C6-ACT-005a modded hediff with requiredActivities emits evidence');
    ok(trance && trance.composition && trance.composition.resolved === false,
      'C6-ACT-005b unaudited provider: composition.resolved is false');
    ok(trance && trance.obligation === 'recommended',
      'C6-ACT-005c obligation comes from catalog entry');
    ok(trance && Array.isArray(trance.satisfiesNeeds) && trance.satisfiesNeeds.length === 0,
      'C6-ACT-005d satisfiesNeeds defaults to empty array when not specified');

    // Reset catalog
    App.state.hediffCatalog = [];
  }

  // -- C6-ACT-006: Unresolved composition with multiple records preserves all records separately --
  {
    App.state.hediffCatalog = [
      { def: 'Hediff_ModdedA', label: 'modded A',
        requiredActivities: [
          { activity: 'ritual', hours: 1 },
        ] },
      { def: 'Hediff_ModdedB', label: 'modded B',
        requiredActivities: [
          { activity: 'ritual', hours: 2 },
        ] },
    ];
    const ctx3 = loadScripts(['data.js', 'engine.js', 'capability-evidence.js'], { App });
    const CE3 = ctx3.CapabilityEvidence;

    const p = pawn({ health: [
      { def: 'Hediff_ModdedA' },
      { def: 'Hediff_ModdedB' },
    ] });
    const result = CE3.effectsFromHediffDefinitions(p);
    const rituals = result.effects.filter(function (e) {
      return e.type === 'requiredActivity' && e.activity === 'ritual';
    });
    ok(rituals.length === 2,
      'C6-ACT-006a two unresolved ritual records preserved separately (got ' + rituals.length + ')');
    // Verify they have distinct evidenceIds
    ok(rituals.length === 2 && rituals[0].evidenceId !== rituals[1].evidenceId,
      'C6-ACT-006b distinct evidenceIds for separate records');
    // Verify neither is merged (both have their own hours)
    const hours = rituals.map(function (e) { return e.hours; }).sort();
    ok(hours[0] === 1 && hours[1] === 2,
      'C6-ACT-006c hours preserved individually (1 and 2), no merging');
    // Both should be unresolved
    ok(rituals.every(function (e) { return e.composition && e.composition.resolved === false; }),
      'C6-ACT-006d both records have composition.resolved === false');

    App.state.hediffCatalog = [];
  }

  // -- C6-ACT-007: Duplicate evidence (same evidenceId) is deduplicated by C2, not by C6 --
  {
    // The seenDefs Set in effectsFromHediffDefinitions prevents duplicate emission
    // for the same hediff def appearing multiple times in pawn.health.
    App.state.hediffCatalog = [
      { def: 'Hediff_Duped', label: 'duped',
        requiredActivities: [
          { activity: 'prayer', hours: 1, obligation: 'required',
            satisfiesNeeds: ['recreation'] },
        ] },
    ];
    const ctx4 = loadScripts(['data.js', 'engine.js', 'capability-evidence.js'], { App });
    const CE4 = ctx4.CapabilityEvidence;

    const p = pawn({ health: [
      { def: 'Hediff_Duped' },
      { def: 'Hediff_Duped' },  // duplicate
    ] });
    const result = CE4.effectsFromHediffDefinitions(p);
    const prayers = result.effects.filter(function (e) {
      return e.type === 'requiredActivity' && e.activity === 'prayer';
    });
    ok(prayers.length === 1,
      'C6-ACT-007 duplicate hediff def produces exactly one evidence record (got ' + prayers.length + ')');

    App.state.hediffCatalog = [];
  }

  return { name: 'c6-activity-provider-semantics', total, failures };
};

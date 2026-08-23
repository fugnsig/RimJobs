/**
 * C2 Capability Evidence - backstory, role and ideology adapters.
 * Tests fromBackstories(), fromRole(), fromIdeology() evidence emission
 * against strict classification, unknown preservation, and provenance rules.
 *
 * Stable IDs: CE-BS-NNN (backstory), CE-RL-NNN (role), CE-ID-NNN (ideology).
 */
const { loadScripts } = require('./_harness');
const vm = require('vm');

module.exports = function run() {
  const App = {
    state: {
      customXenotypes: {},
      customTraits: {},
      customGenes: {},
      customJobs: [],
      customBackstories: {},
      hediffCatalog: [],
      precepts: {},
      ideology: { memes: [], precepts: {} },
      prostheticEfficiency: {},
      shiftTypes: ['Anything', 'Sleep', 'Work', 'Recreation'],
      shiftColors: ['#555', '#446', '#373', '#a83'],
      priorities: {},
    },
    getXeno() { return { uvSensitivity: 0, genes: [], skillMods: {}, incapable: [] }; },
    getTrait() { return null; },
    getRole() { return { id: 'none', skillMods: {}, workSpeed: 0, incap: [] }; },
    getIdeoEffects() { return { mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 0, researchSpeed: 0 }; },
    _passionMeta() { return { bucket: 0 }; },
    _passionValue() { return 0; },
  };

  const ctx = loadScripts(['data.js', 'engine.js', 'app-pawns.js', 'capability-evidence.js'], {
    App,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    window: {},
    localStorage: { getItem: () => null, setItem: () => {} },
  });

  // Extract lexical constants from sandbox scope
  vm.runInContext([
    'globalThis._PX = PRESET_XENOTYPES',
    'globalThis._DR = DEFAULT_ROLES',
    'globalThis._TR = TRAITS',
    'globalThis._CE = CapabilityEvidence',
  ].join(';'), ctx);

  const DR = ctx._DR;
  const TR = ctx._TR;
  const CE = ctx._CE;

  // Wire App helpers to use real data
  App.getXeno = function(id) {
    const all = { ...ctx._PX, ...(this.state.customXenotypes || {}) };
    return all[id] || ctx._PX.baseliner;
  };
  App.getTrait = function(id) {
    return [...TR, ...Object.entries(this.state.customTraits || {}).map(([k, v]) => ({ ...v, id: k }))].find(t => t.id === id);
  };
  App.getRole = function(id) {
    return DR.find(r => r.id === id) || DR[0];
  };

  let failures = 0, total = 0;
  const fail = (msg) => { failures++; console.log('  FAIL', msg); };
  const ok = (cond, label) => { total++; if (!cond) fail(label); };

  const mk = (id, over) => Object.assign({
    id, name: id, traits: [], xenotype: null, incapable: [],
    skills: {}, schedule: Array(24).fill(0), moodPreset: 'normal',
    health: [], childhood: null, adulthood: null, role: 'none',
  }, over || {});

  // Helper: find evidence by evidenceId
  const findEv = (arr, eid) => arr.find(e => e.evidenceId === eid);

  // Helper: collect all evidenceIds
  const allIds = (arr) => arr.map(e => e.evidenceId);

  // ======================================================================
  // BACKSTORY TESTS: CE-BS-001 through CE-BS-009
  // ======================================================================

  // CE-BS-001: Known vanilla backstory skill modifiers (ArtisanFarmer23)
  // ArtisanFarmer23 resolves to skills: { cook: 2, plant: 7, intel: -2 }
  {
    const pawn = mk('bs1', { childhood: 'ArtisanFarmer23' });
    const result = CE.fromBackstories(pawn);

    const cookEv = findEv(result.effects, 'backstory:ArtisanFarmer23:child:skillMods:cook');
    ok(cookEv != null, 'CE-BS-001 cook evidence exists');
    ok(cookEv && cookEv.type === 'skillOffset', 'CE-BS-001 cook type');
    ok(cookEv && cookEv.target === 'cook', 'CE-BS-001 cook target');
    ok(cookEv && cookEv.value === 2, 'CE-BS-001 cook value');

    const plantEv = findEv(result.effects, 'backstory:ArtisanFarmer23:child:skillMods:plant');
    ok(plantEv != null, 'CE-BS-001 plant evidence exists');
    ok(plantEv && plantEv.value === 7, 'CE-BS-001 plant value');

    const intelEv = findEv(result.effects, 'backstory:ArtisanFarmer23:child:skillMods:intel');
    ok(intelEv != null, 'CE-BS-001 intel evidence exists');
    ok(intelEv && intelEv.value === -2, 'CE-BS-001 intel value');
  }

  // CE-BS-002: AccursedChild88 skill modifiers (Medicine +4, Intellectual +5, Construction -1)
  {
    const pawn = mk('bs2', { childhood: 'AccursedChild88' });
    const result = CE.fromBackstories(pawn);

    const medEv = findEv(result.effects, 'backstory:AccursedChild88:child:skillMods:medicine');
    ok(medEv != null, 'CE-BS-002 medicine exists');
    ok(medEv && medEv.value === 4, 'CE-BS-002 medicine value');

    const intelEv = findEv(result.effects, 'backstory:AccursedChild88:child:skillMods:intel');
    ok(intelEv != null, 'CE-BS-002 intel exists');
    ok(intelEv && intelEv.value === 5, 'CE-BS-002 intel value');

    const constEv = findEv(result.effects, 'backstory:AccursedChild88:child:skillMods:construct');
    ok(constEv != null, 'CE-BS-002 construct exists');
    ok(constEv && constEv.value === -1, 'CE-BS-002 construct value');
  }

  // CE-BS-003: Backstory permission entry classified correctly
  // ArtisanFarmer23 has workDisables: ['Violent'] -> incapable: ['violence']
  // 'violence' is ONLY in INCAP_OPTIONS (not in JOBS) -> disableWorkTag
  {
    const pawn = mk('bs3', { childhood: 'ArtisanFarmer23' });
    const result = CE.fromBackstories(pawn);

    const violenceEv = findEv(result.effects, 'backstory:ArtisanFarmer23:child:incapable:violence');
    ok(violenceEv != null, 'CE-BS-003 violence evidence exists');
    ok(violenceEv && violenceEv.type === 'disableWorkTag', 'CE-BS-003 violence classified as disableWorkTag');
    ok(violenceEv && violenceEv.target === 'violence', 'CE-BS-003 violence target');
  }

  // CE-BS-004: Ambiguous permission entries go to unresolved
  // AccursedChild88 has incapable: ['firefight','cleaning','hauling','mining']
  // All four appear in both JOBS and INCAP_OPTIONS -> ambiguous -> unresolved
  {
    const pawn = mk('bs4', { childhood: 'AccursedChild88' });
    const result = CE.fromBackstories(pawn);

    // All four should be in unresolved due to ambiguity
    const ambigIds = ['firefight', 'cleaning', 'hauling', 'mining'];
    for (const id of ambigIds) {
      const ur = result.unresolved.find(u =>
        u.sourceKind === 'backstory' && u.rawTarget === id);
      ok(ur != null, 'CE-BS-004 ' + id + ' in unresolved');
      ok(ur && ur.reason && ur.reason.indexOf('Ambiguous') >= 0,
        'CE-BS-004 ' + id + ' reason mentions Ambiguous');
    }

    // None of the ambiguous ids should appear as effects
    for (const id of ambigIds) {
      const ev = findEv(result.effects, 'backstory:AccursedChild88:child:incapable:' + id);
      ok(ev == null, 'CE-BS-004 ' + id + ' not in effects');
    }
  }

  // CE-BS-005: Unknown backstory -> unresolved (not silently discarded)
  {
    const pawn = mk('bs5', { childhood: 'FakeModdedBackstory99' });
    const result = CE.fromBackstories(pawn);

    ok(result.effects.length === 0, 'CE-BS-005 no effects for unknown');
    ok(result.unresolved.length >= 1, 'CE-BS-005 has unresolved');
    const ur = result.unresolved.find(u =>
      u.sourceKind === 'backstory' && u.sourceId === 'FakeModdedBackstory99');
    ok(ur != null, 'CE-BS-005 unresolved entry exists');
    ok(ur && ur.reason && ur.reason.indexOf('could not be resolved') >= 0,
      'CE-BS-005 unresolved reason');
  }

  // CE-BS-006: Modded/scanned backstory preserves modId
  {
    App.state.customBackstories['ModdedStory42'] = {
      slot: 'adult', title: 'Modded Story', titleShort: 'Modded',
      skills: { mine: 3 }, incapable: ['violence'],
      modId: 'some.mod.package', modSource: 'Scanned',
    };
    const pawn = mk('bs6', { adulthood: 'ModdedStory42' });
    const result = CE.fromBackstories(pawn);

    const ev = findEv(result.effects, 'backstory:ModdedStory42:adult:skillMods:mine');
    ok(ev != null, 'CE-BS-006 modded skill evidence exists');
    ok(ev && ev.provenance && ev.provenance.modId === 'some.mod.package',
      'CE-BS-006 modId preserved in provenance');
    ok(ev && ev.confidence === 'inferred',
      'CE-BS-006 modded backstory has inferred confidence');
    delete App.state.customBackstories['ModdedStory42'];
  }

  // CE-BS-007: Both childhood and adulthood produce evidence with unique IDs
  {
    const pawn = mk('bs7', { childhood: 'ArtisanFarmer23', adulthood: 'ArtisanFarmer23' });
    const result = CE.fromBackstories(pawn);

    // Evidence IDs must be unique - child and adult slots differentiated
    const ids = allIds(result.effects);
    const childIds = ids.filter(id => id.indexOf(':child:') >= 0);
    const adultIds = ids.filter(id => id.indexOf(':adult:') >= 0);
    ok(childIds.length > 0, 'CE-BS-007 has child evidence');
    ok(adultIds.length > 0, 'CE-BS-007 has adult evidence');

    // Verify no duplicate IDs
    const idSet = new Set(ids);
    ok(idSet.size === ids.length, 'CE-BS-007 all evidence IDs unique');
  }

  // CE-BS-008: Null/empty backstory slots produce no evidence or unresolved
  {
    const pawn = mk('bs8', { childhood: null, adulthood: null });
    const result = CE.fromBackstories(pawn);
    ok(result.effects.length === 0, 'CE-BS-008 no effects');
    ok(result.unresolved.length === 0, 'CE-BS-008 no unresolved');
  }

  // CE-BS-009: Provenance, authority, and confidence on vanilla backstory
  {
    const pawn = mk('bs9', { childhood: 'ArtisanFarmer23' });
    const result = CE.fromBackstories(pawn);
    const ev = result.effects[0];
    ok(ev != null, 'CE-BS-009 has evidence');
    ok(ev && ev.provenance.sourceKind === 'backstory', 'CE-BS-009 sourceKind');
    ok(ev && ev.provenance.sourceId === 'ArtisanFarmer23', 'CE-BS-009 sourceId');
    ok(ev && ev.provenance.modId === null, 'CE-BS-009 vanilla modId null');
    ok(ev && ev.authority === 'definitionResolved', 'CE-BS-009 authority');
    ok(ev && ev.confidence === 'verified', 'CE-BS-009 vanilla confidence verified');
  }

  // ======================================================================
  // ROLE TESTS: CE-RL-001 through CE-RL-006
  // ======================================================================

  // CE-RL-001: Leader skill modifiers (social +4)
  {
    const pawn = mk('rl1', { role: 'leader' });
    const result = CE.fromRole(pawn);

    const socialEv = findEv(result.effects, 'role:leader:skillMods:social');
    ok(socialEv != null, 'CE-RL-001 social evidence exists');
    ok(socialEv && socialEv.type === 'skillOffset', 'CE-RL-001 social type');
    ok(socialEv && socialEv.target === 'social', 'CE-RL-001 social target');
    ok(socialEv && socialEv.value === 4, 'CE-RL-001 social value');
  }

  // CE-RL-002: Leader work speed modifier (+0.1)
  {
    const pawn = mk('rl2', { role: 'leader' });
    const result = CE.fromRole(pawn);

    const wsEv = findEv(result.effects, 'role:leader:workSpeed');
    ok(wsEv != null, 'CE-RL-002 workSpeed evidence exists');
    ok(wsEv && wsEv.type === 'statOffset', 'CE-RL-002 workSpeed type');
    ok(wsEv && wsEv.target === 'workSpeedGlobal', 'CE-RL-002 workSpeed target');
    ok(wsEv && Math.abs(wsEv.value - 0.1) < 1e-10, 'CE-RL-002 workSpeed value');
  }

  // CE-RL-003: Medical specialist permission entries (violence -> work tag only)
  {
    const pawn = mk('rl3', { role: 'medical' });
    const result = CE.fromRole(pawn);

    const violenceEv = findEv(result.effects, 'role:medical:incapable:violence');
    ok(violenceEv != null, 'CE-RL-003 violence evidence exists');
    ok(violenceEv && violenceEv.type === 'disableWorkTag',
      'CE-RL-003 violence classified as disableWorkTag');
  }

  // CE-RL-004: Production specialist permission entries classified individually
  // production incap: ['dumb_labor', 'animals', 'cooking', 'plantwork', 'mining']
  // dumb_labor, animals, plantwork -> work tag only
  // cooking, mining -> ambiguous (in both JOBS and INCAP_OPTIONS)
  {
    const pawn = mk('rl4', { role: 'production' });
    const result = CE.fromRole(pawn);

    // Work-tag only entries should be in effects
    const dumbEv = findEv(result.effects, 'role:production:incapable:dumb_labor');
    ok(dumbEv != null, 'CE-RL-004 dumb_labor exists');
    ok(dumbEv && dumbEv.type === 'disableWorkTag', 'CE-RL-004 dumb_labor type');

    const animalsEv = findEv(result.effects, 'role:production:incapable:animals');
    ok(animalsEv != null, 'CE-RL-004 animals exists');
    ok(animalsEv && animalsEv.type === 'disableWorkTag', 'CE-RL-004 animals type');

    const plantEv = findEv(result.effects, 'role:production:incapable:plantwork');
    ok(plantEv != null, 'CE-RL-004 plantwork exists');
    ok(plantEv && plantEv.type === 'disableWorkTag', 'CE-RL-004 plantwork type');

    // Ambiguous entries should be in unresolved
    const cookUr = result.unresolved.find(u =>
      u.sourceKind === 'role' && u.rawTarget === 'cooking');
    ok(cookUr != null, 'CE-RL-004 cooking in unresolved');

    const mineUr = result.unresolved.find(u =>
      u.sourceKind === 'role' && u.rawTarget === 'mining');
    ok(mineUr != null, 'CE-RL-004 mining in unresolved');
  }

  // CE-RL-005: Unknown non-none role -> unresolved (not silently becoming none)
  {
    const pawn = mk('rl5', { role: 'fabricated_role_xyz' });
    const result = CE.fromRole(pawn);

    ok(result.effects.length === 0, 'CE-RL-005 no effects for unknown role');
    ok(result.unresolved.length >= 1, 'CE-RL-005 has unresolved');
    const ur = result.unresolved.find(u =>
      u.sourceKind === 'role' && u.sourceId === 'fabricated_role_xyz');
    ok(ur != null, 'CE-RL-005 unresolved entry exists');
    ok(ur && ur.reason && ur.reason.indexOf('could not be resolved') >= 0,
      'CE-RL-005 unresolved reason');
  }

  // CE-RL-006: Role 'none' produces no evidence
  {
    const pawn1 = mk('rl6a', { role: 'none' });
    const result1 = CE.fromRole(pawn1);
    ok(result1.effects.length === 0, 'CE-RL-006 none: no effects');
    ok(result1.unresolved.length === 0, 'CE-RL-006 none: no unresolved');

    const pawn2 = mk('rl6b', {});
    const result2 = CE.fromRole(pawn2);
    ok(result2.effects.length === 0, 'CE-RL-006 missing: no effects');
    ok(result2.unresolved.length === 0, 'CE-RL-006 missing: no unresolved');
  }

  // ======================================================================
  // IDEOLOGY TESTS: CE-ID-001 through CE-ID-005
  // ======================================================================

  // CE-ID-001: Combat skill -> shoot and melee offsets
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0, combatSkill: 3, socialSkill: 0, researchSpeed: 0 });
    const pawn = mk('id1');
    const result = CE.fromIdeology(pawn);

    const shootEv = findEv(result.effects, 'ideology:colony:combatSkill:shoot');
    ok(shootEv != null, 'CE-ID-001 shoot evidence exists');
    ok(shootEv && shootEv.type === 'skillOffset', 'CE-ID-001 shoot type');
    ok(shootEv && shootEv.value === 3, 'CE-ID-001 shoot value');

    const meleeEv = findEv(result.effects, 'ideology:colony:combatSkill:melee');
    ok(meleeEv != null, 'CE-ID-001 melee evidence exists');
    ok(meleeEv && meleeEv.value === 3, 'CE-ID-001 melee value');

    App.getIdeoEffects = savedFn;
  }

  // CE-ID-002: Social skill and research speed
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 2, researchSpeed: 1 });
    const pawn = mk('id2');
    const result = CE.fromIdeology(pawn);

    const socialEv = findEv(result.effects, 'ideology:colony:socialSkill:social');
    ok(socialEv != null, 'CE-ID-002 social evidence exists');
    ok(socialEv && socialEv.value === 2, 'CE-ID-002 social value');

    const resEv = findEv(result.effects, 'ideology:colony:researchSpeed:intel');
    ok(resEv != null, 'CE-ID-002 research evidence exists');
    ok(resEv && resEv.target === 'intel', 'CE-ID-002 research target is intel');
    ok(resEv && resEv.value === 1, 'CE-ID-002 research value');

    App.getIdeoEffects = savedFn;
  }

  // CE-ID-003: Work speed -> statOffset on WORK_SPEED_GLOBAL
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0.15, combatSkill: 0, socialSkill: 0, researchSpeed: 0 });
    const pawn = mk('id3');
    const result = CE.fromIdeology(pawn);

    const wsEv = findEv(result.effects, 'ideology:colony:workSpeed');
    ok(wsEv != null, 'CE-ID-003 workSpeed evidence exists');
    ok(wsEv && wsEv.type === 'statOffset', 'CE-ID-003 workSpeed type');
    ok(wsEv && wsEv.target === 'workSpeedGlobal', 'CE-ID-003 workSpeed target');
    ok(wsEv && Math.abs(wsEv.value - 0.15) < 1e-10, 'CE-ID-003 workSpeed value');

    App.getIdeoEffects = savedFn;
  }

  // CE-ID-004: combat_focus precept
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 0, researchSpeed: 0 });
    App.state.precepts = { combat_focus: 2 };
    const pawn = mk('id4');
    const result = CE.fromIdeology(pawn);

    const shootCf = findEv(result.effects, 'ideology:colony:combatFocus:shoot');
    ok(shootCf != null, 'CE-ID-004 combat_focus shoot exists');
    ok(shootCf && shootCf.type === 'skillOffset', 'CE-ID-004 combat_focus shoot type');
    ok(shootCf && shootCf.value === 2, 'CE-ID-004 combat_focus shoot value');

    const meleeCf = findEv(result.effects, 'ideology:colony:combatFocus:melee');
    ok(meleeCf != null, 'CE-ID-004 combat_focus melee exists');
    ok(meleeCf && meleeCf.value === 2, 'CE-ID-004 combat_focus melee value');

    App.state.precepts = {};
    App.getIdeoEffects = savedFn;
  }

  // CE-ID-005: Zero effects produce no evidence
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 0, researchSpeed: 0 });
    App.state.precepts = {};
    const pawn = mk('id5');
    const result = CE.fromIdeology(pawn);

    ok(result.effects.length === 0, 'CE-ID-005 no effects for zero ideology');
    ok(result.unresolved.length === 0, 'CE-ID-005 no unresolved');

    App.getIdeoEffects = savedFn;
  }

  // CE-ID-006: Provenance and confidence on ideology evidence
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0.1, combatSkill: 0, socialSkill: 0, researchSpeed: 0 });
    const pawn = mk('id6');
    const result = CE.fromIdeology(pawn);

    const ev = result.effects[0];
    ok(ev != null, 'CE-ID-006 has evidence');
    ok(ev && ev.provenance.sourceKind === 'ideology', 'CE-ID-006 sourceKind');
    ok(ev && ev.provenance.sourceId === 'colony', 'CE-ID-006 sourceId');
    ok(ev && ev.confidence === 'derived', 'CE-ID-006 confidence derived');

    App.getIdeoEffects = savedFn;
  }

  // ======================================================================
  // CROSS-ADAPTER: unique evidence IDs
  // ======================================================================

  // CE-XA-001: Combined evidence from all three adapters has unique IDs
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0, combatSkill: 1, socialSkill: 0, researchSpeed: 0 });
    const pawn = mk('xa1', { childhood: 'ArtisanFarmer23', role: 'leader' });

    const bsResult = CE.fromBackstories(pawn);
    const roleResult = CE.fromRole(pawn);
    const ideoResult = CE.fromIdeology(pawn);

    const allEffects = [...bsResult.effects, ...roleResult.effects, ...ideoResult.effects];
    const ids = allEffects.map(e => e.evidenceId);
    const idSet = new Set(ids);
    ok(idSet.size === ids.length, 'CE-XA-001 all cross-adapter evidence IDs unique');

    App.getIdeoEffects = savedFn;
  }

  return { name: 'capability evidence (C2 adapters)', failures, total };
};

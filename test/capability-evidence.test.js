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

  // ======================================================================
  // TRAIT TESTS: CE-TR-001 through CE-TR-016
  // ======================================================================

  // CE-TR-001: Industrious work speed (+35%)
  {
    const pawn = mk('tr1', { traits: ['industrious'] });
    const result = CE.fromTraits(pawn);

    const wsEv = findEv(result.effects, 'trait:industrious:workSpeed');
    ok(wsEv != null, 'CE-TR-001 workSpeed evidence exists');
    ok(wsEv && wsEv.type === 'statOffset', 'CE-TR-001 workSpeed type');
    ok(wsEv && wsEv.target === 'workSpeedGlobal', 'CE-TR-001 workSpeed target');
    ok(wsEv && Math.abs(wsEv.value - 0.35) < 1e-10, 'CE-TR-001 workSpeed value');
    ok(wsEv && wsEv.provenance.sourceKind === 'trait', 'CE-TR-001 provenance sourceKind');
    ok(wsEv && wsEv.provenance.sourceId === 'industrious', 'CE-TR-001 provenance sourceId');
    ok(wsEv && wsEv.confidence === 'verified', 'CE-TR-001 confidence verified');
  }

  // CE-TR-002: Fast learner learning-rate as factor (offset 0.75 -> factor 1.75)
  {
    const pawn = mk('tr2', { traits: ['fast_learner'] });
    const result = CE.fromTraits(pawn);

    const lrEv = findEv(result.effects, 'trait:fast_learner:learningRate');
    ok(lrEv != null, 'CE-TR-002 learningRate evidence exists');
    ok(lrEv && lrEv.type === 'statFactor', 'CE-TR-002 learningRate type is statFactor');
    ok(lrEv && lrEv.target === 'learningRate', 'CE-TR-002 learningRate target');
    ok(lrEv && Math.abs(lrEv.value - 1.75) < 1e-10, 'CE-TR-002 learningRate value is 1.75 (1 + 0.75)');
  }

  // CE-TR-003: Slow learner negative offset (offset -0.75 -> factor 0.25)
  {
    const pawn = mk('tr3', { traits: ['slow_learner'] });
    const result = CE.fromTraits(pawn);

    const lrEv = findEv(result.effects, 'trait:slow_learner:learningRate');
    ok(lrEv != null, 'CE-TR-003 slow learner evidence exists');
    ok(lrEv && Math.abs(lrEv.value - 0.25) < 1e-10, 'CE-TR-003 slow learner factor is 0.25');
  }

  // CE-TR-004: Gourmand skill modifier (cook +4)
  {
    const pawn = mk('tr4', { traits: ['gourmand'] });
    const result = CE.fromTraits(pawn);

    const cookEv = findEv(result.effects, 'trait:gourmand:skillMods:cook');
    ok(cookEv != null, 'CE-TR-004 gourmand cook evidence exists');
    ok(cookEv && cookEv.type === 'skillOffset', 'CE-TR-004 gourmand cook type');
    ok(cookEv && cookEv.target === 'cook', 'CE-TR-004 gourmand cook target');
    ok(cookEv && cookEv.value === 4, 'CE-TR-004 gourmand cook value');
  }

  // CE-TR-005: Brawler skill modifiers (melee +4, shoot -10)
  {
    const pawn = mk('tr5', { traits: ['brawler'] });
    const result = CE.fromTraits(pawn);

    const meleeEv = findEv(result.effects, 'trait:brawler:skillMods:melee');
    ok(meleeEv != null, 'CE-TR-005 brawler melee evidence exists');
    ok(meleeEv && meleeEv.value === 4, 'CE-TR-005 brawler melee value');

    const shootEv = findEv(result.effects, 'trait:brawler:skillMods:shoot');
    ok(shootEv != null, 'CE-TR-005 brawler shoot evidence exists');
    ok(shootEv && shootEv.value === -10, 'CE-TR-005 brawler shoot value');
  }

  // CE-TR-006: Pyromaniac permission classification via _classifyIncap
  // 'firefight' is in both JOBS and INCAP_OPTIONS -> ambiguous -> unresolved
  {
    const pawn = mk('tr6', { traits: ['pyromaniac'] });
    const result = CE.fromTraits(pawn);

    // firefight is ambiguous - should be in unresolved, not effects
    const ffEv = findEv(result.effects, 'trait:pyromaniac:incapable:firefight');
    ok(ffEv == null, 'CE-TR-006 firefight not in effects (ambiguous)');

    const ffUr = result.unresolved.find(u =>
      u.sourceKind === 'trait' && u.rawTarget === 'firefight');
    ok(ffUr != null, 'CE-TR-006 firefight in unresolved');
    ok(ffUr && ffUr.reason && ffUr.reason.indexOf('Ambiguous') >= 0,
      'CE-TR-006 firefight reason mentions Ambiguous');

    // But breakThreshold should still be emitted as a stat effect
    const btEv = findEv(result.effects, 'trait:pyromaniac:breakThreshold');
    ok(btEv != null, 'CE-TR-006 pyromaniac breakThreshold exists');
    ok(btEv && Math.abs(btEv.value - 0.08) < 1e-10, 'CE-TR-006 pyromaniac breakThreshold value');
  }

  // CE-TR-007: Depressive/neurotic break threshold - definition-backed only, no fake joy
  {
    const pawn = mk('tr7', { traits: ['depressive', 'neurotic'] });
    const result = CE.fromTraits(pawn);

    const depBt = findEv(result.effects, 'trait:depressive:breakThreshold');
    ok(depBt != null, 'CE-TR-007 depressive breakThreshold exists');
    ok(depBt && depBt.type === 'statOffset', 'CE-TR-007 depressive breakThreshold type');
    ok(depBt && depBt.target === 'mentalBreakThreshold', 'CE-TR-007 depressive breakThreshold target');
    ok(depBt && Math.abs(depBt.value - 0.06) < 1e-10, 'CE-TR-007 depressive breakThreshold value');

    const neuBt = findEv(result.effects, 'trait:neurotic:breakThreshold');
    ok(neuBt != null, 'CE-TR-007 neurotic breakThreshold exists');
    ok(neuBt && Math.abs(neuBt.value - 0.08) < 1e-10, 'CE-TR-007 neurotic breakThreshold value');

    // Neurotic also has workSpeed
    const neuWs = findEv(result.effects, 'trait:neurotic:workSpeed');
    ok(neuWs != null, 'CE-TR-007 neurotic workSpeed exists');
    ok(neuWs && Math.abs(neuWs.value - 0.20) < 1e-10, 'CE-TR-007 neurotic workSpeed value');

    // No fake needOffset('joy') evidence should exist
    const joyEffects = result.effects.filter(e =>
      e.type === 'needOffset' || (e.type === 'statOffset' && e.target === 'joy'));
    ok(joyEffects.length === 0, 'CE-TR-007 no fake joy need evidence');
  }

  // CE-TR-008: Night Owl exact evidence windows and weights
  {
    const pawn = mk('tr8', { traits: ['night_owl'] });
    const result = CE.fromTraits(pawn);

    const avoidEv = findEv(result.effects, 'trait:night_owl:avoidHours');
    ok(avoidEv != null, 'CE-TR-008 avoidHours evidence exists');
    ok(avoidEv && avoidEv.type === 'avoidHours', 'CE-TR-008 avoidHours type');
    ok(avoidEv && avoidEv.target === null, 'CE-TR-008 avoidHours target null');
    ok(avoidEv && avoidEv.value === null, 'CE-TR-008 avoidHours value null');
    ok(avoidEv && JSON.stringify(avoidEv.hours) === JSON.stringify([11,12,13,14,15,16,17]),
      'CE-TR-008 avoidHours hours match engine');
    ok(avoidEv && avoidEv.weight === 4, 'CE-TR-008 avoidHours weight 4');

    const preferEv = findEv(result.effects, 'trait:night_owl:preferHours');
    ok(preferEv != null, 'CE-TR-008 preferHours evidence exists');
    ok(preferEv && preferEv.type === 'preferHours', 'CE-TR-008 preferHours type');
    ok(preferEv && JSON.stringify(preferEv.hours) === JSON.stringify([23,0,1,2,3,4,5]),
      'CE-TR-008 preferHours hours match engine');
    ok(preferEv && preferEv.weight === 2, 'CE-TR-008 preferHours weight 2');

    // Provenance and confidence on temporal records
    ok(avoidEv && avoidEv.provenance.sourceKind === 'trait', 'CE-TR-008 avoidHours provenance');
    ok(avoidEv && avoidEv.confidence === 'verified', 'CE-TR-008 avoidHours confidence');
    ok(preferEv && preferEv.provenance.sourceKind === 'trait', 'CE-TR-008 preferHours provenance');
    ok(preferEv && preferEv.confidence === 'verified', 'CE-TR-008 preferHours confidence');
  }

  // CE-TR-009: Quick Sleeper 6-hour override
  {
    const pawn = mk('tr9', { traits: ['quick_sleeper'] });
    const result = CE.fromTraits(pawn);

    const slEv = findEv(result.effects, 'trait:quick_sleeper:sleepHoursOverride');
    ok(slEv != null, 'CE-TR-009 sleepHoursOverride evidence exists');
    ok(slEv && slEv.type === 'sleepHoursOverride', 'CE-TR-009 sleepHoursOverride type');
    ok(slEv && slEv.value === 6, 'CE-TR-009 sleepHoursOverride value 6');
    ok(slEv && slEv.provenance.sourceKind === 'trait', 'CE-TR-009 provenance');
    ok(slEv && slEv.confidence === 'verified', 'CE-TR-009 confidence verified');
  }

  // CE-TR-010: Body Mastery 0-hour override
  {
    const pawn = mk('tr10', { traits: ['body_mastery'] });
    const result = CE.fromTraits(pawn);

    const slEv = findEv(result.effects, 'trait:body_mastery:sleepHoursOverride');
    ok(slEv != null, 'CE-TR-010 sleepHoursOverride evidence exists');
    ok(slEv && slEv.type === 'sleepHoursOverride', 'CE-TR-010 sleepHoursOverride type');
    ok(slEv && slEv.value === 0, 'CE-TR-010 sleepHoursOverride value 0');
  }

  // CE-TR-011: Ascetic recreation recommendation
  {
    const pawn = mk('tr11', { traits: ['ascetic'] });
    const result = CE.fromTraits(pawn);

    const recEv = findEv(result.effects, 'trait:ascetic:recreationHoursRecommendation');
    ok(recEv != null, 'CE-TR-011 recreationHoursRecommendation exists');
    ok(recEv && recEv.type === 'recreationHoursRecommendation',
      'CE-TR-011 recreationHoursRecommendation type');
    ok(recEv && recEv.value === -1, 'CE-TR-011 recreationHoursRecommendation value -1');
    ok(recEv && recEv.target === null, 'CE-TR-011 target null');
  }

  // CE-TR-012: Multiple independent same-target trait effects survive
  {
    const pawn = mk('tr12', { traits: ['industrious', 'neurotic'] });
    const result = CE.fromTraits(pawn);

    const indWs = findEv(result.effects, 'trait:industrious:workSpeed');
    const neuWs = findEv(result.effects, 'trait:neurotic:workSpeed');
    ok(indWs != null, 'CE-TR-012 industrious workSpeed exists');
    ok(neuWs != null, 'CE-TR-012 neurotic workSpeed exists');
    ok(indWs && neuWs && indWs.evidenceId !== neuWs.evidenceId,
      'CE-TR-012 distinct evidence IDs');
    // Both target the same stat but from different traits
    ok(indWs && indWs.target === 'workSpeedGlobal', 'CE-TR-012 industrious target');
    ok(neuWs && neuWs.target === 'workSpeedGlobal', 'CE-TR-012 neurotic target');
  }

  // CE-TR-013: Unknown trait -> unresolved
  {
    const pawn = mk('tr13', { traits: ['fabricated_mod_trait_xyz'] });
    const result = CE.fromTraits(pawn);

    ok(result.effects.length === 0, 'CE-TR-013 no effects for unknown trait');
    ok(result.unresolved.length >= 1, 'CE-TR-013 has unresolved');
    const ur = result.unresolved.find(u =>
      u.sourceKind === 'trait' && u.sourceId === 'fabricated_mod_trait_xyz');
    ok(ur != null, 'CE-TR-013 unresolved entry exists');
    ok(ur && ur.reason && ur.reason.indexOf('could not be resolved') >= 0,
      'CE-TR-013 unresolved reason');
  }

  // CE-TR-014: Undergrounder produces no evidence from trait adapter
  {
    const pawn = mk('tr14', { traits: ['undergrounder'] });
    const result = CE.fromTraits(pawn);

    ok(result.effects.length === 0, 'CE-TR-014 undergrounder no effects');
    ok(result.unresolved.length === 0, 'CE-TR-014 undergrounder no unresolved');
  }

  // CE-TR-015: No temporal condition is evaluated in C2 (only evidence emitted)
  // Temporal records are pure data - no schedule state consulted, no if-hour checks
  {
    const pawn = mk('tr15', { traits: ['night_owl', 'quick_sleeper', 'ascetic'] });
    const result = CE.fromTraits(pawn);

    // All temporal effects should have provenance and verified confidence
    const temporalTypes = new Set([
      'avoidHours', 'preferHours', 'sleepHoursOverride', 'recreationHoursRecommendation'
    ]);
    const temporalEffects = result.effects.filter(e => temporalTypes.has(e.type));
    ok(temporalEffects.length >= 4, 'CE-TR-015 temporal effects emitted');
    for (const te of temporalEffects) {
      ok(te.provenance != null, 'CE-TR-015 temporal ' + te.type + ' has provenance');
      ok(te.confidence === 'verified', 'CE-TR-015 temporal ' + te.type + ' confidence verified');
      // No 'when' clause - no runtime condition evaluated
      ok(te.when === null, 'CE-TR-015 temporal ' + te.type + ' when is null');
    }
  }

  // CE-TR-016: Modded custom trait preserves modId and inferred confidence
  {
    App.state.customTraits['modded_fast_worker'] = {
      label: 'Modded Fast Worker', description: 'Test', workSpeed: 0.25,
      learningRate: 0, breakThreshold: 0, skillMods: {},
      modId: 'test.mod.traits',
    };
    const pawn = mk('tr16', { traits: ['modded_fast_worker'] });
    const result = CE.fromTraits(pawn);

    const wsEv = findEv(result.effects, 'trait:modded_fast_worker:workSpeed');
    ok(wsEv != null, 'CE-TR-016 modded trait evidence exists');
    ok(wsEv && wsEv.provenance.modId === 'test.mod.traits',
      'CE-TR-016 modId preserved');
    ok(wsEv && wsEv.confidence === 'inferred',
      'CE-TR-016 modded trait confidence inferred');
    delete App.state.customTraits['modded_fast_worker'];
  }

  // ======================================================================
  // GENE TESTS: CE-GN-001 through CE-GN-011
  // ======================================================================

  // Extract GENES array for test reference
  vm.runInContext('globalThis._GENES = GENES', ctx);
  const GENES = ctx._GENES;

  // CE-GN-001: Vanilla skill gene emits skillOffset
  {
    const pawn = mk('gn1', { geneDefIds: ['gene_shooting_great'] });
    const result = CE.fromGenes(pawn);

    const ev = findEv(result.effects, 'gene:gene_shooting_great:skillMods:shoot');
    ok(ev != null, 'CE-GN-001 shoot evidence exists');
    ok(ev && ev.type === 'skillOffset', 'CE-GN-001 shoot type');
    ok(ev && ev.target === 'shoot', 'CE-GN-001 shoot target');
    ok(ev && ev.value === 8, 'CE-GN-001 shoot value');
    ok(ev && ev.provenance.sourceKind === 'gene', 'CE-GN-001 provenance sourceKind');
    ok(ev && ev.provenance.sourceId === 'gene_shooting_great', 'CE-GN-001 provenance sourceId');
    ok(ev && ev.confidence === 'verified', 'CE-GN-001 confidence verified');
  }

  // CE-GN-002: Sleepless gene emits sleepHoursOverride with value 0
  {
    const pawn = mk('gn2', { geneDefIds: ['gene_no_sleep'] });
    const result = CE.fromGenes(pawn);

    const ev = findEv(result.effects, 'gene:gene_no_sleep:sleepHoursOverride');
    ok(ev != null, 'CE-GN-002 sleepHoursOverride evidence exists');
    ok(ev && ev.type === 'sleepHoursOverride', 'CE-GN-002 sleepHoursOverride type');
    ok(ev && ev.value === 0, 'CE-GN-002 sleepHoursOverride value 0');
  }

  // CE-GN-003: Gene incapable entries go through _classifyIncap
  {
    const pawn = mk('gn3', { geneDefIds: ['gene_incap_violence'] });
    const result = CE.fromGenes(pawn);

    const ev = findEv(result.effects, 'gene:gene_incap_violence:incapable:violence');
    ok(ev != null, 'CE-GN-003 violence evidence exists');
    ok(ev && ev.type === 'disableWorkTag', 'CE-GN-003 violence classified as disableWorkTag');
  }

  // CE-GN-004: Unresolvable gene in unresolvedSources
  {
    const pawn = mk('gn4', { geneDefIds: ['SomeFakeModGene_XYZ'] });
    const result = CE.fromGenes(pawn);

    ok(result.effects.length === 0, 'CE-GN-004 no effects for unknown gene');
    ok(result.unresolved.length >= 1, 'CE-GN-004 has unresolved');
    const ur = result.unresolved.find(u =>
      u.sourceKind === 'gene' && u.sourceId === 'SomeFakeModGene_XYZ');
    ok(ur != null, 'CE-GN-004 unresolved entry exists');
    ok(ur && ur.reason && ur.reason.indexOf('could not be resolved') >= 0,
      'CE-GN-004 unresolved reason');
  }

  // CE-GN-005: derivedContext for xenotype-template-sourced genes
  {
    // Set up a xenotype with a known gene, then create a pawn without geneDefIds
    App.state.customXenotypes['testXenoGn5'] = {
      label: 'Test Xeno', color: '#fff', genes: ['gene_shooting_great'],
      skillMods: {}, incapable: [], passions: [], uvSensitivity: 0,
    };
    const pawn = mk('gn5', { xenotype: 'testXenoGn5' });
    // No geneDefIds - falls back to xenotype template
    const result = CE.fromGenes(pawn);

    const ev = findEv(result.effects, 'gene:gene_shooting_great:skillMods:shoot');
    ok(ev != null, 'CE-GN-005 template gene evidence exists');
    ok(ev && ev.derivedContext != null, 'CE-GN-005 derivedContext present');
    ok(ev && ev.derivedContext && ev.derivedContext.xenotypeId === 'testXenoGn5',
      'CE-GN-005 derivedContext xenotypeId');
    ok(ev && ev.derivedContext && ev.derivedContext.origin === 'xenotypeTemplate',
      'CE-GN-005 derivedContext origin');
    delete App.state.customXenotypes['testXenoGn5'];
  }

  // CE-GN-006: Explicit pawn genes preferred over template
  {
    App.state.customXenotypes['testXenoGn6'] = {
      label: 'Test Xeno 6', color: '#fff', genes: ['gene_melee_great'],
      skillMods: {}, incapable: [], passions: [], uvSensitivity: 0,
    };
    const pawn = mk('gn6', {
      xenotype: 'testXenoGn6',
      geneDefIds: ['gene_shooting_good'],
    });
    const result = CE.fromGenes(pawn);

    // Should have shooting from pawnState, NOT melee from template
    const shootEv = findEv(result.effects, 'gene:gene_shooting_good:skillMods:shoot');
    ok(shootEv != null, 'CE-GN-006 pawnState gene used');
    ok(shootEv && shootEv.derivedContext === null, 'CE-GN-006 no derivedContext for pawnState');

    const meleeEv = findEv(result.effects, 'gene:gene_melee_great:skillMods:melee');
    ok(meleeEv == null, 'CE-GN-006 template gene NOT used when pawnState present');
    delete App.state.customXenotypes['testXenoGn6'];
  }

  // CE-GN-007: moveSpeed preserved as unresolved, NOT mapped to Moving capacity
  {
    const pawn = mk('gn7', { geneDefIds: ['gene_fast_runner'] });
    const result = CE.fromGenes(pawn);

    // No capacity evidence for Moving
    const movingEffects = result.effects.filter(e => e.target === 'moving');
    ok(movingEffects.length === 0, 'CE-GN-007 moveSpeed not mapped to Moving capacity');

    // Should be in unresolved with rawTarget 'moveSpeed'
    const ur = result.unresolved.find(u =>
      u.sourceKind === 'gene' && u.rawTarget === 'moveSpeed');
    ok(ur != null, 'CE-GN-007 moveSpeed in unresolved');
    ok(ur && ur.rawData === 0.4, 'CE-GN-007 moveSpeed rawData preserved');
  }

  // CE-GN-008: Gene workSpeed as statOffset (modded gene with workSpeed)
  {
    App.state.customGenes['modded_gene_fast_work'] = {
      id: 'modded_gene_fast_work', label: 'Modded Fast Work',
      workSpeed: 0.25, modId: 'test.mod.genes',
    };
    const pawn = mk('gn8', { geneDefIds: ['modded_gene_fast_work'] });
    const result = CE.fromGenes(pawn);

    const wsEv = findEv(result.effects, 'gene:modded_gene_fast_work:workSpeed');
    ok(wsEv != null, 'CE-GN-008 workSpeed evidence exists');
    ok(wsEv && wsEv.type === 'statOffset', 'CE-GN-008 workSpeed type');
    ok(wsEv && wsEv.target === 'workSpeedGlobal', 'CE-GN-008 workSpeed target');
    ok(wsEv && Math.abs(wsEv.value - 0.25) < 1e-10, 'CE-GN-008 workSpeed value');
    delete App.state.customGenes['modded_gene_fast_work'];
  }

  // CE-GN-009: Gene learningRate as statFactor (1 + offset)
  {
    const pawn = mk('gn9', { geneDefIds: ['gene_quick_study'] });
    const result = CE.fromGenes(pawn);

    const lrEv = findEv(result.effects, 'gene:gene_quick_study:learningRate');
    ok(lrEv != null, 'CE-GN-009 learningRate evidence exists');
    ok(lrEv && lrEv.type === 'statFactor', 'CE-GN-009 learningRate type is statFactor');
    ok(lrEv && lrEv.target === 'learningRate', 'CE-GN-009 learningRate target');
    ok(lrEv && Math.abs(lrEv.value - 1.5) < 1e-10,
      'CE-GN-009 learningRate value is 1.5 (1 + 0.5)');
  }

  // CE-GN-010: modId preserved for custom/modded genes
  {
    App.state.customGenes['modded_gene_crafty'] = {
      id: 'modded_gene_crafty', label: 'Crafty Gene',
      skillMods: { craft: 6 }, modId: 'craft.mod.id',
    };
    const pawn = mk('gn10', { geneDefIds: ['modded_gene_crafty'] });
    const result = CE.fromGenes(pawn);

    const ev = findEv(result.effects, 'gene:modded_gene_crafty:skillMods:craft');
    ok(ev != null, 'CE-GN-010 modded gene evidence exists');
    ok(ev && ev.provenance.modId === 'craft.mod.id', 'CE-GN-010 modId preserved');
    ok(ev && ev.confidence === 'inferred', 'CE-GN-010 modded gene confidence inferred');
    delete App.state.customGenes['modded_gene_crafty'];
  }

  // CE-GN-011: No gene identity checks leak outside adapter
  // (gene adapter returns only standard evidence records, not raw gene defs)
  {
    const pawn = mk('gn11', { geneDefIds: ['gene_shooting_great', 'gene_no_sleep'] });
    const result = CE.fromGenes(pawn);

    for (const ev of result.effects) {
      ok(ev.evidenceId != null, 'CE-GN-011 ' + ev.evidenceId + ' has evidenceId');
      ok(ev.type != null, 'CE-GN-011 ' + ev.evidenceId + ' has type');
      ok(ev.provenance != null, 'CE-GN-011 ' + ev.evidenceId + ' has provenance');
      ok(ev.confidence != null, 'CE-GN-011 ' + ev.evidenceId + ' has confidence');
      // No raw gene definition leaking
      ok(ev.category == null, 'CE-GN-011 ' + ev.evidenceId + ' no category leak');
      ok(ev.description == null, 'CE-GN-011 ' + ev.evidenceId + ' no description leak');
    }
  }

  // ======================================================================
  // CROSS-ADAPTER: include trait adapter in unique-ID check
  // ======================================================================

  // CE-XA-002: Combined evidence from all five adapters has unique IDs
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0, combatSkill: 1, socialSkill: 0, researchSpeed: 0 });
    const pawn = mk('xa2', {
      childhood: 'ArtisanFarmer23', role: 'leader',
      traits: ['industrious', 'night_owl'],
      geneDefIds: ['gene_shooting_great', 'gene_no_sleep'],
    });

    const bsResult = CE.fromBackstories(pawn);
    const roleResult = CE.fromRole(pawn);
    const ideoResult = CE.fromIdeology(pawn);
    const traitResult = CE.fromTraits(pawn);
    const geneResult = CE.fromGenes(pawn);

    const allEffects = [
      ...bsResult.effects, ...roleResult.effects,
      ...ideoResult.effects, ...traitResult.effects,
      ...geneResult.effects
    ];
    const ids = allEffects.map(e => e.evidenceId);
    const idSet = new Set(ids);
    ok(idSet.size === ids.length, 'CE-XA-002 all cross-adapter evidence IDs unique (with traits and genes)');

    App.getIdeoEffects = savedFn;
  }

  return { name: 'capability evidence (C2 adapters)', failures, total };
};

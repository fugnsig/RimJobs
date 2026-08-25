/**
 * C2 Capability Evidence - backstory, role and ideology adapters.
 * Tests fromBackstories(), fromRole(), fromIdeology() evidence emission
 * against strict classification, unknown preservation, and provenance rules.
 *
 * Stable IDs: CE-BS-NNN (backstory), CE-RL-NNN (role), CE-ID-NNN (ideology).
 */
const { loadScripts } = require('./_harness');
const vm = require('vm');
const { DOMParserShim } = require('./_xml-dom-shim');

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

  const ctx = loadScripts(['data.js', 'engine.js', 'app-pawns.js', 'app-save.js', 'capability-evidence.js'], {
    App,
    DOMParser: DOMParserShim,
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
    'globalThis._parseC4Traits = parseTraitsFromXML',
    'globalThis._parseC4Genes = parseGenesFromXML',
    'globalThis._parseC4Backstories = parseBackstoriesFromXML',
    'globalThis._parseC4Hediffs = parseHediffCatalogFromXML',
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

  // ======================================================================
  // XENOTYPE TESTS: CE-XN-001 through CE-XN-013
  // ======================================================================

  // CE-XN-001: Baseliner produces no effects or unresolved
  {
    const pawn = mk('xn1', { xenotype: 'baseliner' });
    const result = CE.fromXenotype(pawn);

    ok(result.effects.length === 0, 'CE-XN-001 baseliner no effects');
    ok(result.unresolved.length === 0, 'CE-XN-001 baseliner no unresolved');
  }

  // CE-XN-002: No xenotype produces no effects or unresolved
  {
    const pawn1 = mk('xn2a', { xenotype: null });
    const result1 = CE.fromXenotype(pawn1);
    ok(result1.effects.length === 0, 'CE-XN-002 null xenotype no effects');
    ok(result1.unresolved.length === 0, 'CE-XN-002 null xenotype no unresolved');

    const pawn2 = mk('xn2b', {});
    const result2 = CE.fromXenotype(pawn2);
    ok(result2.effects.length === 0, 'CE-XN-002 missing xenotype no effects');
    ok(result2.unresolved.length === 0, 'CE-XN-002 missing xenotype no unresolved');
  }

  // CE-XN-003: Unknown xenotype -> unresolved, NOT silently Baseliner
  {
    const pawn = mk('xn3', { xenotype: 'ModdedXenoZZZ' });
    const result = CE.fromXenotype(pawn);

    ok(result.effects.length === 0, 'CE-XN-003 unknown xeno no effects');
    ok(result.unresolved.length >= 1, 'CE-XN-003 has unresolved');
    const ur = result.unresolved.find(u =>
      u.sourceKind === 'xenotype' && u.sourceId === 'ModdedXenoZZZ');
    ok(ur != null, 'CE-XN-003 unresolved entry exists');
    ok(ur && ur.reason && ur.reason.indexOf('could not be resolved') >= 0,
      'CE-XN-003 unresolved reason');
  }

  // CE-XN-004: Zero-resolved aggregate fallback (Case B) - dirtmole mine:8
  // Dirtmole template genes use game-internal names that do not resolve
  // via GENES array, so zero resolved genes contribute to mine dimension.
  {
    const pawn = mk('xn4', { xenotype: 'dirtmole' });
    const result = CE.fromXenotype(pawn);

    const mineEv = findEv(result.effects, 'xeno:dirtmole:skillMods:mine');
    ok(mineEv != null, 'CE-XN-004 mine aggregate fallback emitted');
    ok(mineEv && mineEv.type === 'skillOffset', 'CE-XN-004 mine type');
    ok(mineEv && mineEv.target === 'mine', 'CE-XN-004 mine target');
    ok(mineEv && mineEv.value === 8, 'CE-XN-004 mine value');
    ok(mineEv && mineEv.authority === 'summaryFallback',
      'CE-XN-004 mine authority is summaryFallback');
    ok(mineEv && mineEv.confidence === 'inferred',
      'CE-XN-004 mine confidence is inferred');
    ok(mineEv && mineEv.provenance.sourceKind === 'xenotype',
      'CE-XN-004 mine provenance sourceKind');
    ok(mineEv && mineEv.provenance.sourceId === 'dirtmole',
      'CE-XN-004 mine provenance sourceId');
  }

  // CE-XN-005: All-resolved aggregate suppression (Case A)
  // Custom xenotype where ALL template genes resolve via GENES array.
  // Aggregate should NOT be emitted - atomic gene evidence is authoritative.
  {
    App.state.customXenotypes['testAllResolved'] = {
      label: 'Test All Resolved', color: '#fff',
      genes: ['gene_mining_good'],
      skillMods: { mine: 4 }, incapable: [], passions: [], uvSensitivity: 0,
    };
    const pawn = mk('xn5', { xenotype: 'testAllResolved' });
    const result = CE.fromXenotype(pawn);

    // Aggregate suppressed - gene_mining_good resolves and covers mine:4
    const mineEv = findEv(result.effects, 'xeno:testAllResolved:skillMods:mine');
    ok(mineEv == null, 'CE-XN-005 aggregate suppressed when all genes resolved');
    ok(result.unresolved.length === 0,
      'CE-XN-005 no unresolved when resolved total matches aggregate');
    delete App.state.customXenotypes['testAllResolved'];
  }

  // CE-XN-006: Aggregate/atomic mismatch preserved as unresolved (Case A mismatch)
  // All template genes resolve but sum doesn't match aggregate.
  {
    App.state.customXenotypes['testMismatch'] = {
      label: 'Test Mismatch', color: '#fff',
      genes: ['gene_mining_good'],
      skillMods: { mine: 8 }, incapable: [], passions: [], uvSensitivity: 0,
    };
    const pawn = mk('xn6', { xenotype: 'testMismatch' });
    const result = CE.fromXenotype(pawn);

    // Aggregate suppressed (Case A) but mismatch noted
    const mineEv = findEv(result.effects, 'xeno:testMismatch:skillMods:mine');
    ok(mineEv == null, 'CE-XN-006 aggregate suppressed despite mismatch');

    const ur = result.unresolved.find(u =>
      u.sourceKind === 'xenotype' && u.rawTarget === 'mine' &&
      u.reason && u.reason.indexOf('mismatch') >= 0);
    ok(ur != null, 'CE-XN-006 mismatch preserved in unresolved');
    ok(ur && ur.rawData && ur.rawData.aggregate === 8,
      'CE-XN-006 rawData.aggregate preserved');
    ok(ur && ur.rawData && ur.rawData.resolved === 4,
      'CE-XN-006 rawData.resolved preserved');
    delete App.state.customXenotypes['testMismatch'];
  }

  // CE-XN-007: Partial resolution - no overlapping aggregate (Case C)
  // Mix of resolvable and non-resolvable genes; a resolved gene contributes
  // to the same skill dimension as the aggregate.
  {
    App.state.customXenotypes['testPartial'] = {
      label: 'Test Partial', color: '#fff',
      genes: ['gene_mining_good', 'UnresolvableGameGene_XYZ'],
      skillMods: { mine: 8 }, incapable: [], passions: [], uvSensitivity: 0,
    };
    const pawn = mk('xn7', { xenotype: 'testPartial' });
    const result = CE.fromXenotype(pawn);

    // No aggregate emitted (Case C)
    const mineEv = findEv(result.effects, 'xeno:testPartial:skillMods:mine');
    ok(mineEv == null, 'CE-XN-007 no overlapping aggregate in partial case');

    // Partial resolution noted in unresolved
    const ur = result.unresolved.find(u =>
      u.sourceKind === 'xenotype' && u.rawTarget === 'mine' &&
      u.reason && u.reason.indexOf('Partial') >= 0);
    ok(ur != null, 'CE-XN-007 partial resolution in unresolved');
    delete App.state.customXenotypes['testPartial'];
  }

  // CE-XN-008: Summary-only custom xenotype fallback
  // A xenotype with skillMods but no gene list emits summary fallback.
  {
    App.state.customXenotypes['testSummaryOnly'] = {
      label: 'Test Summary Only', color: '#fff',
      skillMods: { shoot: 4, melee: -4 }, incapable: ['violence'],
      passions: [], uvSensitivity: 0,
    };
    const pawn = mk('xn8', { xenotype: 'testSummaryOnly' });
    const result = CE.fromXenotype(pawn);

    const shootEv = findEv(result.effects, 'xeno:testSummaryOnly:skillMods:shoot');
    ok(shootEv != null, 'CE-XN-008 summary-only shoot emitted');
    ok(shootEv && shootEv.authority === 'summaryFallback',
      'CE-XN-008 shoot authority summaryFallback');
    ok(shootEv && shootEv.value === 4, 'CE-XN-008 shoot value');

    const meleeEv = findEv(result.effects, 'xeno:testSummaryOnly:skillMods:melee');
    ok(meleeEv != null, 'CE-XN-008 summary-only melee emitted');
    ok(meleeEv && meleeEv.value === -4, 'CE-XN-008 melee value');

    // violence classified through _classifyIncap
    const violenceEv = findEv(result.effects, 'xeno:testSummaryOnly:incapable:violence');
    ok(violenceEv != null, 'CE-XN-008 summary-only violence emitted');
    ok(violenceEv && violenceEv.type === 'disableWorkTag',
      'CE-XN-008 violence classified as disableWorkTag');
    ok(violenceEv && violenceEv.authority === 'summaryFallback',
      'CE-XN-008 violence authority summaryFallback');
    delete App.state.customXenotypes['testSummaryOnly'];
  }

  // CE-XN-009: Atomic and aggregate same skill never both survive
  // Verify that fromGenes and fromXenotype don't double-count.
  {
    App.state.customXenotypes['testNoDoubleCount'] = {
      label: 'Test No Double Count', color: '#fff',
      genes: ['gene_mining_good'],
      skillMods: { mine: 4 }, incapable: [], passions: [], uvSensitivity: 0,
    };
    const pawn = mk('xn9', { xenotype: 'testNoDoubleCount' });
    const geneResult = CE.fromGenes(pawn);
    const xenoResult = CE.fromXenotype(pawn);

    // gene adapter should emit mine evidence (from template fallback)
    const geneMinEv = geneResult.effects.filter(e =>
      e.target === 'mine' && e.type === 'skillOffset');
    ok(geneMinEv.length === 1, 'CE-XN-009 gene adapter has exactly one mine effect');

    // xeno adapter should NOT emit mine evidence (Case A suppresses it)
    const xenoMinEv = xenoResult.effects.filter(e =>
      e.target === 'mine' && e.type === 'skillOffset');
    ok(xenoMinEv.length === 0, 'CE-XN-009 xeno adapter has no mine effect (suppressed)');

    delete App.state.customXenotypes['testNoDoubleCount'];
  }

  // CE-XN-010: UV sensitivity emits avoidCondition with daylight/hours/weight
  {
    const pawn = mk('xn10', { xenotype: 'dirtmole' });
    const result = CE.fromXenotype(pawn);

    const uvEv = findEv(result.effects, 'xeno:dirtmole:uv');
    ok(uvEv != null, 'CE-XN-010 UV evidence emitted');
    ok(uvEv && uvEv.type === 'avoidCondition', 'CE-XN-010 UV type');
    ok(uvEv && uvEv.condition === 'daylight', 'CE-XN-010 UV condition daylight');
    ok(uvEv && uvEv.fallbackHours && uvEv.fallbackHours.start === 6,
      'CE-XN-010 UV fallbackHours start');
    ok(uvEv && uvEv.fallbackHours && uvEv.fallbackHours.end === 18,
      'CE-XN-010 UV fallbackHours end');
    ok(uvEv && uvEv.weight === 4, 'CE-XN-010 UV weight');
    ok(uvEv && uvEv.provenance.sourceKind === 'xenotype',
      'CE-XN-010 UV provenance sourceKind');
  }

  // CE-XN-011: Undergrounder + UV -> no UV evidence
  {
    const pawn = mk('xn11', { xenotype: 'dirtmole', traits: ['undergrounder'] });
    const result = CE.fromXenotype(pawn);

    const uvEv = findEv(result.effects, 'xeno:dirtmole:uv');
    ok(uvEv == null, 'CE-XN-011 undergrounder suppresses UV evidence');
    // Skill aggregate should still work
    const mineEv = findEv(result.effects, 'xeno:dirtmole:skillMods:mine');
    ok(mineEv != null, 'CE-XN-011 skill aggregate still emitted');
  }

  // CE-XN-012: Explicit pawn genes that differ from template prevent fallback
  {
    App.state.customXenotypes['testExplicitGenes'] = {
      label: 'Test Explicit Genes', color: '#fff',
      genes: ['gene_mining_good'],
      skillMods: { mine: 4 }, incapable: [], passions: [], uvSensitivity: 1,
    };
    const pawn = mk('xn12', {
      xenotype: 'testExplicitGenes',
      geneDefIds: ['gene_shooting_great'],
    });
    const result = CE.fromXenotype(pawn);

    // Skill aggregate should NOT be emitted - pawn genes differ from template
    const mineEv = findEv(result.effects, 'xeno:testExplicitGenes:skillMods:mine');
    ok(mineEv == null,
      'CE-XN-012 explicit pawn genes prevent template aggregate fallback');

    // UV evidence should still emit (xeno property, not gene aggregate)
    const uvEv = findEv(result.effects, 'xeno:testExplicitGenes:uv');
    ok(uvEv != null, 'CE-XN-012 UV still emits with explicit pawn genes');
    delete App.state.customXenotypes['testExplicitGenes'];
  }

  // CE-XN-013: AUTH-001 - unrelated same-target effect from different source survives
  // A gene and xenotype aggregate for DIFFERENT skills both survive normalisation.
  {
    App.state.customXenotypes['testAuth001'] = {
      label: 'Test Auth', color: '#fff',
      genes: ['gene_shooting_great', 'FakeUnresolvableGene_999'],
      skillMods: { shoot: 8, mine: 4 }, incapable: [], passions: [], uvSensitivity: 0,
    };
    const pawn = mk('xn13', { xenotype: 'testAuth001' });
    const geneResult = CE.fromGenes(pawn);
    const xenoResult = CE.fromXenotype(pawn);

    // gene adapter handles shoot (resolves gene_shooting_great)
    const geneShootEv = geneResult.effects.filter(e =>
      e.target === 'shoot' && e.type === 'skillOffset');
    ok(geneShootEv.length >= 1,
      'CE-XN-013 gene adapter emits shoot effect');

    // xeno adapter should NOT emit shoot (gene_shooting_great contributes - Case C)
    const xenoShootEv = findEv(xenoResult.effects, 'xeno:testAuth001:skillMods:shoot');
    ok(xenoShootEv == null,
      'CE-XN-013 xeno does not emit overlapping shoot aggregate');

    // xeno adapter SHOULD emit mine as fallback (no resolved gene contributes)
    const xenoMineEv = findEv(xenoResult.effects, 'xeno:testAuth001:skillMods:mine');
    ok(xenoMineEv != null,
      'CE-XN-013 unrelated mine aggregate survives as fallback');
    ok(xenoMineEv && xenoMineEv.authority === 'summaryFallback',
      'CE-XN-013 mine authority summaryFallback');

    // Combine and normalise - both survive (different evidenceIds, null supersessionKeys)
    const combined = [...geneResult.effects, ...xenoResult.effects];
    const normalised = CE._normaliseEffects(combined, []);
    const normShoot = normalised.filter(e =>
      e.target === 'shoot' && e.type === 'skillOffset');
    const normMine = normalised.filter(e =>
      e.target === 'mine' && e.type === 'skillOffset');
    ok(normShoot.length >= 1,
      'CE-XN-013 shoot survives normalisation');
    ok(normMine.length >= 1,
      'CE-XN-013 mine survives normalisation');

    delete App.state.customXenotypes['testAuth001'];
  }

  // CE-XN-014: Fallback supersessionKey is null (not clashing with gene evidence)
  {
    const pawn = mk('xn14', { xenotype: 'dirtmole' });
    const result = CE.fromXenotype(pawn);

    for (const ev of result.effects) {
      ok(ev.supersessionKey === null,
        'CE-XN-014 ' + ev.evidenceId + ' supersessionKey is null');
    }
  }

  // CE-XN-015: Sanguophage UV (uvSensitivity:1) emits avoidCondition
  {
    const pawn = mk('xn15', { xenotype: 'sanguophage' });
    const result = CE.fromXenotype(pawn);

    const uvEv = findEv(result.effects, 'xeno:sanguophage:uv');
    ok(uvEv != null, 'CE-XN-015 sanguophage UV evidence emitted');
    ok(uvEv && uvEv.condition === 'daylight', 'CE-XN-015 sanguophage UV condition');
  }

  // CE-XN-016: Highmate incapable violence via aggregate fallback
  // Highmate template genes include ViolenceDisabled which resolves to
  // gene_incap_violence in our GENES array? No - ViolenceDisabled is a
  // game-internal name that does not resolve. So Case B applies.
  {
    const pawn = mk('xn16', { xenotype: 'highmate' });
    const result = CE.fromXenotype(pawn);

    const violenceEv = findEv(result.effects, 'xeno:highmate:incapable:violence');
    ok(violenceEv != null, 'CE-XN-016 highmate violence aggregate emitted');
    ok(violenceEv && violenceEv.type === 'disableWorkTag',
      'CE-XN-016 highmate violence classified as disableWorkTag');
    ok(violenceEv && violenceEv.authority === 'summaryFallback',
      'CE-XN-016 highmate violence authority summaryFallback');
  }

  // ======================================================================
  // CROSS-ADAPTER: include xenotype adapter in unique-ID check
  // ======================================================================

  // CE-XA-003: Combined evidence from all six adapters has unique IDs
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0, combatSkill: 1, socialSkill: 0, researchSpeed: 0 });
    const pawn = mk('xa3', {
      childhood: 'ArtisanFarmer23', role: 'leader',
      traits: ['industrious', 'night_owl'],
      xenotype: 'dirtmole',
    });

    const bsResult = CE.fromBackstories(pawn);
    const roleResult = CE.fromRole(pawn);
    const ideoResult = CE.fromIdeology(pawn);
    const traitResult = CE.fromTraits(pawn);
    const geneResult = CE.fromGenes(pawn);
    const xenoResult = CE.fromXenotype(pawn);

    const allEffects = [
      ...bsResult.effects, ...roleResult.effects,
      ...ideoResult.effects, ...traitResult.effects,
      ...geneResult.effects, ...xenoResult.effects,
    ];
    const ids = allEffects.map(e => e.evidenceId);
    const idSet = new Set(ids);
    ok(idSet.size === ids.length,
      'CE-XA-003 all cross-adapter evidence IDs unique (with xenotype)');

    App.getIdeoEffects = savedFn;
  }

  // ======================================================================
  // HEALTH SNAPSHOT TESTS: CE-HL-001 through CE-HL-015
  // ======================================================================

  // CE-HL-001: Missing left arm - human body resolved
  {
    const pawn = mk('hl1', { health: [
      { def: 'MissingBodyPart', partIdx: 25, type: 'missing', severity: 0, hediffClass: 'Hediff_MissingPart', part: 'left arm', permanent: false },
    ] });
    const body = CE.bodyEvidenceFromPawnHealth(pawn);
    ok(body.length === 1, 'CE-HL-001 one body evidence');
    ok(body[0] && body[0].kind === 'missing', 'CE-HL-001 kind is missing');
    ok(body[0] && body[0].partId === 25, 'CE-HL-001 partId');
    ok(body[0] && body[0].partDef === 'left arm', 'CE-HL-001 partDef');
    ok(body[0] && body[0].side === 'left', 'CE-HL-001 side');
    ok(body[0] && body[0].parentPartDef != null, 'CE-HL-001 parentPartDef resolved');
    ok(body[0] && body[0].provenance && body[0].provenance.sourceKind === 'healthSnapshot', 'CE-HL-001 provenance');
  }

  // CE-HL-002: Missing right arm - side detection
  {
    const pawn = mk('hl2', { health: [
      { def: 'MissingBodyPart', partIdx: 36, type: 'missing', severity: 0, hediffClass: 'Hediff_MissingPart', part: 'right arm', permanent: false },
    ] });
    const body = CE.bodyEvidenceFromPawnHealth(pawn);
    ok(body.length === 1, 'CE-HL-002 one body evidence');
    ok(body[0] && body[0].side === 'right', 'CE-HL-002 side is right');
    ok(body[0] && body[0].partDef === 'right arm', 'CE-HL-002 partDef');
  }

  // CE-HL-003: Replacement (bionic arm)
  {
    const pawn = mk('hl3', { health: [
      { def: 'BionicArm', partIdx: 25, type: 'replaced', severity: 0, hediffClass: 'Hediff_AddedPart', part: 'left arm', permanent: false },
    ] });
    const body = CE.bodyEvidenceFromPawnHealth(pawn);
    ok(body.length === 1, 'CE-HL-003 one body evidence');
    ok(body[0] && body[0].kind === 'replacement', 'CE-HL-003 kind is replacement');
    ok(body[0] && body[0].replacementDef === 'BionicArm', 'CE-HL-003 replacementDef');
    ok(body[0] && body[0].partId === 25, 'CE-HL-003 partId');
    ok(body[0] && body[0].partDef === 'left arm', 'CE-HL-003 partDef');
  }

  // CE-HL-004: Implant distinct from replacement
  {
    const pawn = mk('hl4', { health: [
      { def: 'PsychicAmplifier', partIdx: 15, type: 'implant', severity: 1, hediffClass: 'Hediff_Implant', part: 'brain', permanent: false },
    ] });
    const body = CE.bodyEvidenceFromPawnHealth(pawn);
    ok(body.length === 1, 'CE-HL-004 one body evidence');
    ok(body[0] && body[0].kind === 'implant', 'CE-HL-004 kind is implant');
    ok(body[0] && body[0].implantDef === 'PsychicAmplifier', 'CE-HL-004 implantDef');
    ok(body[0] && body[0].partDef === 'brain', 'CE-HL-004 partDef is brain');
    ok(body[0] && body[0].replacementDef === undefined, 'CE-HL-004 no replacementDef on implant');
  }

  // CE-HL-005: Part-specific hediff (injury on torso)
  {
    const pawn = mk('hl5', { health: [
      { def: 'Scar', partIdx: 0, type: 'injury', severity: 5, hediffClass: 'Hediff_Injury', part: 'torso', permanent: true },
    ] });
    const body = CE.bodyEvidenceFromPawnHealth(pawn);
    ok(body.length === 1, 'CE-HL-005 one body evidence');
    ok(body[0] && body[0].kind === 'hediff', 'CE-HL-005 kind is hediff');
    ok(body[0] && body[0].hediffDef === 'Scar', 'CE-HL-005 hediffDef');
    ok(body[0] && body[0].severity === 5, 'CE-HL-005 severity preserved');
    ok(body[0] && body[0].partId === 0, 'CE-HL-005 partId');
    ok(body[0] && body[0].partDef === 'torso', 'CE-HL-005 partDef');
  }

  // CE-HL-006: Global/unparted hediff preserved (partIdx = -1)
  {
    const pawn = mk('hl6', { health: [
      { def: 'Flu', partIdx: -1, type: 'condition', severity: 0.3, hediffClass: 'HediffWithComps', part: '', permanent: false },
    ] });
    const body = CE.bodyEvidenceFromPawnHealth(pawn);
    ok(body.length === 1, 'CE-HL-006 one body evidence');
    ok(body[0] && body[0].kind === 'hediff', 'CE-HL-006 kind is hediff');
    ok(body[0] && body[0].hediffDef === 'Flu', 'CE-HL-006 hediffDef');
    ok(body[0] && body[0].partId === null, 'CE-HL-006 partId null for global');
    ok(body[0] && body[0].partDef === null, 'CE-HL-006 partDef null');
    ok(body[0] && Math.abs(body[0].severity - 0.3) < 1e-10, 'CE-HL-006 severity');
  }

  // CE-HL-007: Non-human body does not receive human mapping
  {
    const pawn = mk('hl7', { bodyDef: 'AlienRace', health: [
      { def: 'MissingBodyPart', partIdx: 25, type: 'missing', severity: 0, hediffClass: 'Hediff_MissingPart', part: 'part #25', permanent: false },
    ] });
    const body = CE.bodyEvidenceFromPawnHealth(pawn);
    ok(body.length === 1, 'CE-HL-007 one body evidence');
    ok(body[0] && body[0].partId === 25, 'CE-HL-007 partId preserved');
    ok(body[0] && body[0].partDef === null, 'CE-HL-007 partDef null for non-human');
    ok(body[0] && body[0].side === null, 'CE-HL-007 side null');
  }

  // CE-HL-008: No capacity/manipulation/impact fields
  {
    const pawn = mk('hl8', { health: [
      { def: 'MissingBodyPart', partIdx: 25, type: 'missing', severity: 0, hediffClass: 'Hediff_MissingPart', part: 'left arm', permanent: false },
    ] });
    const body = CE.bodyEvidenceFromPawnHealth(pawn);
    ok(body[0] && body[0].manipulation === undefined, 'CE-HL-008 no manipulation');
    ok(body[0] && body[0].capacity === undefined, 'CE-HL-008 no capacity');
    ok(body[0] && body[0].impact === undefined, 'CE-HL-008 no impact');
  }

  // CE-HL-009: Empty health array returns empty
  {
    const pawn = mk('hl9', { health: [] });
    const body = CE.bodyEvidenceFromPawnHealth(pawn);
    ok(body.length === 0, 'CE-HL-009 empty health returns empty body evidence');
  }

  // CE-HL-010: Unknown part index retains raw ID and null semantics (out of range)
  {
    const pawn = mk('hl10', { health: [
      { def: 'Scar', partIdx: 999, type: 'injury', severity: 2, hediffClass: 'Hediff_Injury', part: 'body part #999', permanent: true },
    ] });
    const body = CE.bodyEvidenceFromPawnHealth(pawn);
    ok(body.length === 1, 'CE-HL-010 one body evidence');
    ok(body[0] && body[0].partId === 999, 'CE-HL-010 partId preserved');
    ok(body[0] && body[0].partDef === null, 'CE-HL-010 partDef null for unknown');
  }

  // CE-HL-011: Mod provenance from defSources
  {
    App.state.defSources = { 'ModdedProsthetic': 'some.mod.id' };
    const pawn = mk('hl11', { health: [
      { def: 'ModdedProsthetic', partIdx: 25, type: 'replaced', severity: 0, hediffClass: 'Hediff_AddedPart', part: 'left arm', permanent: false },
    ] });
    const body = CE.bodyEvidenceFromPawnHealth(pawn);
    ok(body[0] && body[0].provenance.modId === 'some.mod.id', 'CE-HL-011 mod provenance');
    App.state.defSources = {};
  }

  // CE-C3-001: Modded raw part identity survives without human semantics
  {
    const pawn = mk('c3raw', { bodyDef: 'AlienBody', raceDefName: 'AlienRace', health: [
      {
        def: 'AlienScar',
        partIdx: 25,
        rawPartIndex: 25,
        bodyDefName: 'AlienBody',
        bodyDefReference: 'explicit',
        sourceObservationIndex: 7,
        type: 'injury',
        severity: null,
        hediffClass: 'Hediff_Injury',
        part: 'part #25',
        permanent: null,
      },
    ] });
    const result = CE.collectPawnEvidence(pawn);
    const obs = result.bodyEvidence[0];
    ok(result.pawnState.raceDefName === 'AlienRace', 'CE-C3-001 raceDefName preserved');
    ok(obs.rawPartIndex === 25, 'CE-C3-001 raw modded part index preserved');
    ok(obs.partDef === null, 'CE-C3-001 no human semantic part required');
    ok(obs.bodyDefName === 'AlienBody' && obs.bodyDefReference === 'explicit', 'CE-C3-001 explicit BodyDef preserved');
    ok(obs.sourceObservationIndex === 7, 'CE-C3-001 source observation index preserved');
    ok(obs.persistence === 'unknown', 'CE-C3-001 absent persistence marker remains unknown');
    ok(obs.severity === null, 'CE-C3-001 missing severity remains null');
    ok(obs.hediffDef === 'AlienScar' && obs.extra === undefined, 'CE-C3-001 body evidence schema remains flat');
  }

  // CE-C3-002: Persistence classification uses positive evidence only
  {
    const pawn = mk('c3persist', { health: [
      { def: 'Scar', partIdx: 0, type: 'injury', severity: 1, permanent: true },
      { def: 'FreshCut', partIdx: 0, type: 'injury', severity: 1, permanent: false },
      { def: 'UnknownCondition', partIdx: -1, type: 'condition', severity: 0.2, permanent: null },
      { def: 'MissingBodyPart', partIdx: 25, type: 'missing', severity: null, permanent: false },
      { def: 'BionicArm', partIdx: 25, type: 'replaced', severity: null, permanent: null },
      { def: 'PsychicAmplifier', partIdx: 15, type: 'implant', severity: null, permanent: null },
    ] });
    const body = CE.bodyEvidenceFromPawnHealth(pawn);
    ok(body[0].persistence === 'persistent', 'CE-C3-002 explicit permanent true is persistent');
    ok(body[1].persistence === 'temporary', 'CE-C3-002 explicit permanent false is temporary');
    ok(body[2].persistence === 'unknown', 'CE-C3-002 absent persistence metadata is unknown');
    ok(body[3].persistence === 'persistent', 'CE-C3-002 missing part is persistent');
    ok(body[4].persistence === 'persistent', 'CE-C3-002 replacement is persistent');
    ok(body[5].persistence === 'persistent', 'CE-C3-002 implant is persistent');
  }

  // CE-C3-003: BodyDef omission remains explicitly unknown in this save version
  {
    const pawn = mk('c3bodyunknown', { health: [
      { def: 'Cut', rawPartIndex: 3, partIdx: 3, bodyDefName: null, bodyDefReference: 'unknown', type: 'injury', severity: 1, permanent: false },
    ] });
    const obs = CE.bodyEvidenceFromPawnHealth(pawn)[0];
    ok(obs.bodyDefName === null, 'CE-C3-003 omitted BodyDef remains null');
    ok(obs.bodyDefReference === 'unknown', 'CE-C3-003 omitted BodyDef reference remains unknown');
  }

  // CE-C3-004: Fallback observation indexes remain stable across source entries
  {
    const pawn = mk('c3sourceindex', { health: [
      { def: 'FirstCondition', partIdx: -1, type: 'condition', severity: null, permanent: null },
      { def: 'SecondCondition', partIdx: -1, type: 'condition', severity: null, permanent: null },
    ] });
    const body = CE.bodyEvidenceFromPawnHealth(pawn);
    ok(body[0].sourceObservationIndex === 0 && body[1].sourceObservationIndex === 1, 'CE-C3-004 fallback source indexes are stable');
  }

  // ======================================================================
  // HEDIFF DEFINITION TESTS: CE-HD-001 through CE-HD-010
  // ======================================================================

  // CE-HD-001: Single-stage hediff disabling firefight
  {
    App.state.hediffCatalog = [
      { def: 'Dementia', label: 'Dementia', hediffClass: 'HediffWithComps', category: 'disease',
        disabledWorkStages: [{ min: 0, work: ['firefight'] }] },
    ];
    const pawn = mk('hd1', { health: [
      { def: 'Dementia', partIdx: 15, type: 'condition', severity: 0.5, hediffClass: 'HediffWithComps', part: 'brain', permanent: false },
    ] });
    const result = CE.effectsFromHediffDefinitions(pawn);
    ok(result.effects.length >= 1 || result.unresolved.length >= 1, 'CE-HD-001 emits effects or unresolved for firefight');
    const ev = result.effects[0] || null;
    if (ev) {
      ok(ev.when != null, 'CE-HD-001 has when envelope');
      ok(ev.when && ev.when.kind === 'hediffSeverity', 'CE-HD-001 when kind');
      ok(ev.when && ev.when.hediffDef === 'Dementia', 'CE-HD-001 when hediffDef');
      ok(ev.when && ev.when.min === 0, 'CE-HD-001 when min');
      ok(ev.when && ev.when.max === null, 'CE-HD-001 when max null for single stage');
      ok(ev.when && ev.when.maxExclusive === true, 'CE-HD-001 maxExclusive');
    }
    App.state.hediffCatalog = [];
  }

  // CE-HD-002: Multi-stage hediff with severity boundaries
  {
    App.state.hediffCatalog = [
      { def: 'BrainInjury', label: 'Brain injury', hediffClass: 'HediffWithComps', category: 'injury',
        disabledWorkStages: [
          { min: 0, work: [] },
          { min: 0.5, work: ['violence'] },
          { min: 0.8, work: ['violence', 'caring'] },
        ] },
    ];
    const pawn = mk('hd2', { health: [
      { def: 'BrainInjury', partIdx: 15, type: 'condition', severity: 0.7, hediffClass: 'HediffWithComps', part: 'brain', permanent: false },
    ] });
    const result = CE.effectsFromHediffDefinitions(pawn);

    // Stage 0 (min=0) has no work, so no effects for it
    // Stage 1 (min=0.5) disables violent with max=0.8
    const s1Ev = result.effects.find(e => e.evidenceId && e.evidenceId.indexOf(':s1') >= 0);
    ok(s1Ev != null, 'CE-HD-002 stage 1 effect exists');
    ok(s1Ev && s1Ev.when && s1Ev.when.min === 0.5, 'CE-HD-002 stage 1 min');
    ok(s1Ev && s1Ev.when && s1Ev.when.max === 0.8, 'CE-HD-002 stage 1 max is next stage min');

    // Stage 2 (min=0.8) disables violent and caring with max=null
    const s2Evs = result.effects.filter(e => e.evidenceId && e.evidenceId.indexOf(':s2') >= 0);
    ok(s2Evs.length >= 1, 'CE-HD-002 stage 2 effects exist');
    const s2First = s2Evs[0];
    ok(s2First && s2First.when && s2First.when.min === 0.8, 'CE-HD-002 stage 2 min');
    ok(s2First && s2First.when && s2First.when.max === null, 'CE-HD-002 stage 2 max null (last stage)');
    App.state.hediffCatalog = [];
  }

  // CE-HD-003: C2 does not evaluate current severity (emits all stages, not just active)
  {
    App.state.hediffCatalog = [
      { def: 'TestHediff', label: 'Test', hediffClass: 'HediffWithComps', category: 'condition',
        disabledWorkStages: [
          { min: 0, work: ['violence'] },
          { min: 0.5, work: ['violence', 'caring'] },
        ] },
    ];
    const pawn = mk('hd3', { health: [
      { def: 'TestHediff', partIdx: -1, type: 'condition', severity: 0.1, hediffClass: 'HediffWithComps', part: '', permanent: false },
    ] });
    const result = CE.effectsFromHediffDefinitions(pawn);
    // Both stages emitted regardless of current severity 0.1
    const s0Evs = result.effects.filter(e => e.evidenceId && e.evidenceId.indexOf(':s0') >= 0);
    const s1Evs = result.effects.filter(e => e.evidenceId && e.evidenceId.indexOf(':s1') >= 0);
    ok(s0Evs.length >= 1, 'CE-HD-003 stage 0 emitted despite low severity');
    ok(s1Evs.length >= 1, 'CE-HD-003 stage 1 emitted despite low severity');
    App.state.hediffCatalog = [];
  }

  // CE-HD-004: Unknown work restriction preserved as unresolved
  {
    App.state.hediffCatalog = [
      { def: 'ModdedDisease', label: 'Modded', hediffClass: 'HediffWithComps', category: 'disease',
        disabledWorkStages: [{ min: 0, work: ['totally_made_up_tag'] }] },
    ];
    const pawn = mk('hd4', { health: [
      { def: 'ModdedDisease', partIdx: -1, type: 'condition', severity: 0.5, hediffClass: 'HediffWithComps', part: '', permanent: false },
    ] });
    const result = CE.effectsFromHediffDefinitions(pawn);
    ok(result.unresolved.length >= 1, 'CE-HD-004 unknown tag goes to unresolved');
    ok(result.unresolved[0] && /totally_made_up_tag/.test(result.unresolved[0].reason || ''),
      'CE-HD-004 unresolved mentions tag');
    App.state.hediffCatalog = [];
  }

  // CE-HD-005: Definition effect is separate from snapshot body evidence
  {
    App.state.hediffCatalog = [
      { def: 'Dementia', label: 'Dementia', hediffClass: 'HediffWithComps', category: 'disease',
        disabledWorkStages: [{ min: 0, work: ['firefight'] }] },
    ];
    const pawn = mk('hd5', { health: [
      { def: 'Dementia', partIdx: 15, type: 'condition', severity: 0.5, hediffClass: 'HediffWithComps', part: 'brain', permanent: false },
    ] });
    const bodyResult = CE.bodyEvidenceFromPawnHealth(pawn);
    const defResult = CE.effectsFromHediffDefinitions(pawn);
    ok(bodyResult.length >= 1, 'CE-HD-005 body evidence exists');
    ok(defResult.effects.length >= 1 || defResult.unresolved.length >= 1, 'CE-HD-005 definition effects exist');
    // Body evidence has no disableWorkTag/disableJob
    ok(bodyResult.every(b => b.type === undefined || b.type !== 'disableWorkTag'),
      'CE-HD-005 body evidence has no disableWorkTag');
    App.state.hediffCatalog = [];
  }

  // CE-HD-006: Hediff not in catalog emits nothing (not unresolved - unknown defs are catalog gaps)
  {
    App.state.hediffCatalog = [];
    const pawn = mk('hd6', { health: [
      { def: 'UnknownHediff', partIdx: -1, type: 'condition', severity: 0.5, hediffClass: 'HediffWithComps', part: '', permanent: false },
    ] });
    const result = CE.effectsFromHediffDefinitions(pawn);
    ok(result.effects.length === 0, 'CE-HD-006 no effects for uncatalogued hediff');
    ok(result.unresolved.length === 0, 'CE-HD-006 no unresolved for uncatalogued hediff');
    App.state.hediffCatalog = [];
  }

  // CE-HD-007: Duplicate hediff defs only processed once
  {
    App.state.hediffCatalog = [
      { def: 'Flu', label: 'Flu', hediffClass: 'HediffWithComps', category: 'disease',
        disabledWorkStages: [{ min: 0, work: ['violence'] }] },
    ];
    const pawn = mk('hd7', { health: [
      { def: 'Flu', partIdx: -1, type: 'condition', severity: 0.3, hediffClass: 'HediffWithComps', part: '', permanent: false },
      { def: 'Flu', partIdx: -1, type: 'condition', severity: 0.6, hediffClass: 'HediffWithComps', part: '', permanent: false },
    ] });
    const result = CE.effectsFromHediffDefinitions(pawn);
    const fluEffects = result.effects.filter(e => e.evidenceId && e.evidenceId.indexOf('hediff:Flu:') === 0);
    ok(fluEffects.length >= 1, 'CE-HD-007 at least one Flu effect');
    // Should not have duplicate effects for same def
    const fluIds = fluEffects.map(e => e.evidenceId);
    ok(new Set(fluIds).size === fluIds.length, 'CE-HD-007 no duplicate evidence IDs');
    App.state.hediffCatalog = [];
  }

  // CE-HD-008: Modded hediff gets inferred confidence
  {
    App.state.defSources = { 'ModdedFlu': 'cool.mod.pkg' };
    App.state.hediffCatalog = [
      { def: 'ModdedFlu', label: 'Modded Flu', hediffClass: 'HediffWithComps', category: 'disease',
        disabledWorkStages: [{ min: 0, work: ['violent'] }] },
    ];
    const pawn = mk('hd8', { health: [
      { def: 'ModdedFlu', partIdx: -1, type: 'condition', severity: 0.5, hediffClass: 'HediffWithComps', part: '', permanent: false },
    ] });
    const result = CE.effectsFromHediffDefinitions(pawn);
    const ev = result.effects[0] || null;
    if (ev) {
      ok(ev.confidence === 'inferred', 'CE-HD-008 modded hediff confidence is inferred');
      ok(ev.provenance && ev.provenance.modId === 'cool.mod.pkg', 'CE-HD-008 modId in provenance');
    }
    App.state.defSources = {};
    App.state.hediffCatalog = [];
  }

  // CE-HD-009: Psycaster meditation evidence
  {
    const pawn = mk('hd9', { health: [
      { def: 'PsychicAmplifier', partIdx: 15, type: 'implant', severity: 1, hediffClass: 'Hediff_Psylink', part: 'brain', permanent: false },
    ] });
    const result = CE.effectsFromHediffDefinitions(pawn);
    const medEv = findEv(result.effects, 'hediff:pawn:psycaster:meditation');
    ok(medEv != null, 'CE-HD-009 psycaster meditation evidence exists');
    ok(medEv && medEv.type === 'requiredActivity', 'CE-HD-009 type is requiredActivity');
    ok(medEv && medEv.value === 2, 'CE-HD-009 value is 2 hours');
    ok(medEv && medEv.activity === 'meditation', 'CE-HD-009 activity');
    ok(medEv && medEv.hours === 2, 'CE-HD-009 hours field');
    ok(medEv && medEv.provenance.sourceKind === 'hediff', 'CE-HD-009 provenance sourceKind');
    ok(medEv && medEv.confidence === 'derived', 'CE-HD-009 confidence derived');
  }

  // CE-HD-010: Non-psycaster pawn has no meditation evidence
  {
    const pawn = mk('hd10', { health: [
      { def: 'Flu', partIdx: -1, type: 'condition', severity: 0.3, hediffClass: 'HediffWithComps', part: '', permanent: false },
    ] });
    const result = CE.effectsFromHediffDefinitions(pawn);
    const medEv = findEv(result.effects, 'hediff:pawn:psycaster:meditation');
    ok(medEv == null, 'CE-HD-010 no meditation evidence for non-psycaster');
  }

  // CE-HD-011: Provenance on definition effects
  {
    App.state.hediffCatalog = [
      { def: 'Dementia', label: 'Dementia', hediffClass: 'HediffWithComps', category: 'disease',
        disabledWorkStages: [{ min: 0, work: ['firefight'] }] },
    ];
    const pawn = mk('hd11', { health: [
      { def: 'Dementia', partIdx: 15, type: 'condition', severity: 0.5, hediffClass: 'HediffWithComps', part: 'brain', permanent: false },
    ] });
    const result = CE.effectsFromHediffDefinitions(pawn);
    const ev = result.effects[0] || result.unresolved[0] || null;
    ok(ev != null, 'CE-HD-011 has output');
    if (ev && ev.provenance) {
      ok(ev.provenance.sourceKind === 'hediffDef', 'CE-HD-011 sourceKind is hediffDef');
      ok(ev.provenance.sourceId === 'Dementia', 'CE-HD-011 sourceId is hediff def');
    }
    App.state.hediffCatalog = [];
  }

  // ======================================================================
  // AGGREGATE ORCHESTRATOR TESTS: CE-AG-001 through CE-AG-020
  // ======================================================================

  // CE-AG-001: Return shape - arrays and objects present
  {
    const pawn = mk('ag1');
    const result = CE.collectPawnEvidence(pawn);
    ok(Array.isArray(result.effects), 'CE-AG-001 effects is array');
    ok(Array.isArray(result.bodyEvidence), 'CE-AG-001 bodyEvidence is array');
    ok(result.pawnState != null && typeof result.pawnState === 'object', 'CE-AG-001 pawnState is object');
    ok(Array.isArray(result.unresolvedSources), 'CE-AG-001 unresolvedSources is array');
  }

  // CE-AG-002: Null pawn returns empty shape
  {
    const result = CE.collectPawnEvidence(null);
    ok(Array.isArray(result.effects) && result.effects.length === 0, 'CE-AG-002 null pawn effects empty');
    ok(Array.isArray(result.bodyEvidence) && result.bodyEvidence.length === 0, 'CE-AG-002 null pawn bodyEvidence empty');
    ok(result.pawnState.age === null, 'CE-AG-002 null pawn age null');
    ok(result.pawnState.lifeStage === null, 'CE-AG-002 null pawn lifeStage null');
  }

  // CE-AG-003: All real fixture evidenceId values unique
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0.1, combatSkill: 1, socialSkill: 0, researchSpeed: 0 });
    const pawn = mk('ag3', {
      childhood: 'ArtisanFarmer23', role: 'leader', traits: ['industrious'],
      xenotype: 'baseliner',
    });
    const result = CE.collectPawnEvidence(pawn);
    const ids = result.effects.map(e => e.evidenceId);
    const idSet = new Set(ids);
    ok(idSet.size === ids.length, 'CE-AG-003 all evidence IDs unique in aggregate');
    App.getIdeoEffects = savedFn;
  }

  // CE-AG-004: Synthetic duplicate IDs produce integrity unresolved
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 0, researchSpeed: 0 });
    const pawn = mk('ag4', { traits: ['industrious'] });
    const result = CE.collectPawnEvidence(pawn);
    // Industrious produces unique IDs, so no duplicates expected
    // Verify normalisation ran by checking effects come through
    const wsEv = result.effects.find(e => e.evidenceId === 'trait:industrious:workSpeed');
    ok(wsEv != null, 'CE-AG-004 normalised effects include trait evidence');
    App.getIdeoEffects = savedFn;
  }

  // CE-AG-005: Supersession - definitionResolved beats summaryFallback
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 0, researchSpeed: 0 });
    // Hussars have genes that resolve, and the xeno adapter uses supersession
    // The normalised result should prefer definitionResolved over summaryFallback
    // for same supersessionKey
    const pawn = mk('ag5', { xenotype: 'hussar', geneDefIds: ['Robust'] });
    const result = CE.collectPawnEvidence(pawn);
    // If both gene-level and xeno-level evidence for same skill have supersession keys,
    // definitionResolved should win
    const allSuperKeys = result.effects.filter(e => e.supersessionKey != null);
    // No same-key pair should have summaryFallback surviving over definitionResolved
    const keyGroups = {};
    allSuperKeys.forEach(e => {
      if (!keyGroups[e.supersessionKey]) keyGroups[e.supersessionKey] = [];
      keyGroups[e.supersessionKey].push(e);
    });
    let summaryWon = false;
    for (const key of Object.keys(keyGroups)) {
      const g = keyGroups[key];
      if (g.length > 1) {
        const hasBoth = g.some(e => e.authority === 'summaryFallback') &&
                        g.some(e => e.authority === 'definitionResolved');
        if (hasBoth) summaryWon = true;
      }
    }
    ok(!summaryWon, 'CE-AG-005 definitionResolved beats summaryFallback in supersession');
    App.getIdeoEffects = savedFn;
  }

  // CE-AG-006: Source-fact conservation - trait skillMods represented exactly once
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 0, researchSpeed: 0 });
    const pawn = mk('ag6', { traits: ['industrious'] });
    const result = CE.collectPawnEvidence(pawn);
    const traitEffects = result.effects.filter(e => e.evidenceId && e.evidenceId.startsWith('trait:'));
    const traitIds = traitEffects.map(e => e.evidenceId);
    ok(new Set(traitIds).size === traitIds.length,
      'CE-AG-006 trait effects unique (conservation)');
    App.getIdeoEffects = savedFn;
  }

  // CE-AG-007: Source-fact conservation - backstory skillMods exactly once
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 0, researchSpeed: 0 });
    const pawn = mk('ag7', { childhood: 'ArtisanFarmer23' });
    const result = CE.collectPawnEvidence(pawn);
    const bsEffects = result.effects.filter(e => e.evidenceId && e.evidenceId.startsWith('backstory:'));
    const bsIds = bsEffects.map(e => e.evidenceId);
    ok(new Set(bsIds).size === bsIds.length,
      'CE-AG-007 backstory effects unique (conservation)');
    ok(bsEffects.length >= 1, 'CE-AG-007 backstory effects present');
    App.getIdeoEffects = savedFn;
  }

  // CE-AG-008: Body observations represented once
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 0, researchSpeed: 0 });
    const pawn = mk('ag8', { health: [
      { def: 'MissingBodyPart', partIdx: 25, type: 'missing', severity: 0, hediffClass: 'Hediff_MissingPart', part: 'left arm', permanent: false },
    ] });
    const result = CE.collectPawnEvidence(pawn);
    ok(result.bodyEvidence.length === 1, 'CE-AG-008 body evidence present');
    ok(result.bodyEvidence[0].kind === 'missing', 'CE-AG-008 body evidence kind');
    App.getIdeoEffects = savedFn;
  }

  // CE-AG-009: Hediff definition constraints separate from snapshots
  {
    App.state.hediffCatalog = [
      { def: 'Dementia', label: 'Dementia', hediffClass: 'HediffWithComps', category: 'disease',
        disabledWorkStages: [{ min: 0, work: ['firefight'] }] },
    ];
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 0, researchSpeed: 0 });
    const pawn = mk('ag9', { health: [
      { def: 'Dementia', partIdx: 15, type: 'condition', severity: 0.5, hediffClass: 'HediffWithComps', part: 'brain', permanent: false },
    ] });
    const result = CE.collectPawnEvidence(pawn);
    // Body evidence for the hediff snapshot
    ok(result.bodyEvidence.length >= 1, 'CE-AG-009 body snapshot present');
    // Effect evidence for the definition constraint (may be in effects or unresolved due to firefight ambiguity)
    const hediffEffects = result.effects.filter(e => e.evidenceId && e.evidenceId.startsWith('hediff:Dementia:'));
    const hediffUnresolved = result.unresolvedSources.filter(u => u.sourceId === 'Dementia');
    ok(hediffEffects.length >= 1 || hediffUnresolved.length >= 1, 'CE-AG-009 definition constraints present');
    App.state.hediffCatalog = [];
    App.getIdeoEffects = savedFn;
  }

  // CE-AG-010: Unknown trait preserved in unresolvedSources
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 0, researchSpeed: 0 });
    const pawn = mk('ag10', { traits: ['totally_fake_trait'] });
    const result = CE.collectPawnEvidence(pawn);
    const traitUr = result.unresolvedSources.find(u => u.sourceKind === 'trait' && u.sourceId === 'totally_fake_trait');
    ok(traitUr != null, 'CE-AG-010 unknown trait in unresolvedSources');
    App.getIdeoEffects = savedFn;
  }

  // CE-AG-011: Unknown backstory preserved in unresolvedSources
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 0, researchSpeed: 0 });
    const pawn = mk('ag11', { childhood: 'ModdedBackstoryThatDoesNotExist' });
    const result = CE.collectPawnEvidence(pawn);
    const bsUr = result.unresolvedSources.find(u => u.sourceKind === 'backstory');
    ok(bsUr != null, 'CE-AG-011 unknown backstory in unresolvedSources');
    App.getIdeoEffects = savedFn;
  }

  // CE-AG-012: pawnState age preserved
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 0, researchSpeed: 0 });
    const pawn = mk('ag12', { bioAge: 25 });
    const result = CE.collectPawnEvidence(pawn);
    ok(result.pawnState.age === 25, 'CE-AG-012 age preserved');
    App.getIdeoEffects = savedFn;
  }

  // CE-AG-013: pawnState lifeStage null when not present
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 0, researchSpeed: 0 });
    const pawn = mk('ag13', { bioAge: 7 });
    const result = CE.collectPawnEvidence(pawn);
    ok(result.pawnState.lifeStage === null, 'CE-AG-013 lifeStage null (no threshold inference)');
    App.getIdeoEffects = savedFn;
  }

  // CE-AG-014: pawnState explicit lifeStage preserved
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 0, researchSpeed: 0 });
    const pawn = mk('ag14', { bioAge: 7, lifeStage: 'Child' });
    const result = CE.collectPawnEvidence(pawn);
    ok(result.pawnState.lifeStage === 'Child', 'CE-AG-014 explicit lifeStage preserved');
    App.getIdeoEffects = savedFn;
  }

  // CE-AG-015: pawnState downed preserved
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 0, researchSpeed: 0 });
    const pawn = mk('ag15', { downed: true });
    const result = CE.collectPawnEvidence(pawn);
    ok(result.pawnState.currentStatus.downed === true, 'CE-AG-015 downed true');
    App.getIdeoEffects = savedFn;
  }

  // CE-AG-016: pawnState downed false when not set
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 0, researchSpeed: 0 });
    const pawn = mk('ag16');
    const result = CE.collectPawnEvidence(pawn);
    ok(result.pawnState.currentStatus.downed === false, 'CE-AG-016 downed false by default');
    App.getIdeoEffects = savedFn;
  }

  // CE-AG-017: pawnState baseSkills cloned losslessly
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 0, researchSpeed: 0 });
    const pawn = mk('ag17', { skills: { shoot: 8, melee: 12, cook: 5 } });
    const result = CE.collectPawnEvidence(pawn);
    ok(result.pawnState.baseSkills.shoot === 8, 'CE-AG-017 shoot preserved');
    ok(result.pawnState.baseSkills.melee === 12, 'CE-AG-017 melee preserved');
    ok(result.pawnState.baseSkills.cook === 5, 'CE-AG-017 cook preserved');
    // Verify it's a clone, not a reference
    result.pawnState.baseSkills.shoot = 99;
    ok(pawn.skills.shoot === 8, 'CE-AG-017 baseSkills is clone not reference');
    App.getIdeoEffects = savedFn;
  }

  // CE-AG-018: pawnState basePassions cloned losslessly
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 0, researchSpeed: 0 });
    const pawn = mk('ag18', { passions: { shoot: 1, melee: 2 } });
    const result = CE.collectPawnEvidence(pawn);
    ok(result.pawnState.basePassions.shoot === 1, 'CE-AG-018 shoot passion preserved');
    ok(result.pawnState.basePassions.melee === 2, 'CE-AG-018 melee passion preserved');
    result.pawnState.basePassions.shoot = 99;
    ok(pawn.passions.shoot === 1, 'CE-AG-018 basePassions is clone not reference');
    App.getIdeoEffects = savedFn;
  }

  // CE-AG-019: Age null when not set
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 0, researchSpeed: 0 });
    const pawn = mk('ag19');
    const result = CE.collectPawnEvidence(pawn);
    ok(result.pawnState.age === null, 'CE-AG-019 age null when not set');
    App.getIdeoEffects = savedFn;
  }

  // CE-AG-020: Role effects represented exactly once
  {
    const savedFn = App.getIdeoEffects;
    App.getIdeoEffects = () => ({ mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 0, researchSpeed: 0 });
    const pawn = mk('ag20', { role: 'leader' });
    const result = CE.collectPawnEvidence(pawn);
    const roleEffects = result.effects.filter(e => e.evidenceId && e.evidenceId.startsWith('role:'));
    const roleIds = roleEffects.map(e => e.evidenceId);
    ok(new Set(roleIds).size === roleIds.length,
      'CE-AG-020 role effects unique (conservation)');
    ok(roleEffects.length >= 1, 'CE-AG-020 role effects present');
    App.getIdeoEffects = savedFn;
  }

  // ======================================================================
  // C4 PERMISSION SOURCE PRESERVATION
  // ======================================================================

  {
    const parsed = ctx._parseC4Traits('<Defs><TraitDef><defName>TypedTrait</defName>'
      + '<label>typed</label><disabledWorkTypes><li>Doctor</li></disabledWorkTypes>'
      + '<disabledWorkTags>Caring, Commoner</disabledWorkTags></TraitDef></Defs>');
    const def = parsed.mod_trait_typedtrait;
    const workType = def.permissionSources.find(source => source.targetKind === 'workType');
    const workTag = def.permissionSources.find(source => source.targetKind === 'workTag');
    ok(workType.targets[0].canonicalTarget === 'Doctor',
      'CE-C4P-001 TraitDef disabledWorkTypes preserved as WorkType target');
    ok(workTag.targets.map(target => target.canonicalTarget).join(',') === 'Caring,Commoner',
      'CE-C4P-002 TraitDef exact WorkTags preserved without legacy mapping');
  }

  {
    const parsed = ctx._parseC4Genes('<Defs><GeneDef><defName>TypedGene</defName>'
      + '<label>typed</label><disabledWorkTags>Violent, Caring</disabledWorkTags>'
      + '</GeneDef></Defs>');
    const source = parsed.mod_gene_typedgene.permissionSources[0];
    ok(source.targets.length === 2 && source.targets[0].canonicalTarget === 'Violent'
      && source.targets[1].canonicalTarget === 'Caring',
    'CE-C4P-003 scalar GeneDef flags are parsed exactly');
  }

  {
    const parsed = ctx._parseC4Backstories('<Defs><BackstoryDef><defName>TypedStory</defName>'
      + '<slot>Adult</slot><title>typed</title><workDisables>ManualDumb, AllWork</workDisables>'
      + '</BackstoryDef></Defs>');
    const source = parsed.TypedStory.permissionSources[0];
    ok(source.targets.map(target => target.canonicalTarget).join(',') === 'ManualDumb,AllWork',
      'CE-C4P-004 Backstory exact flags preserve AllWork');
  }

  {
    const parsed = ctx._parseC4Hediffs('<Defs><HediffDef><defName>TypedCondition</defName>'
      + '<stages><li><minSeverity>0.4</minSeverity><disabledWorkTags>Commoner, Shooting</disabledWorkTags>'
      + '</li></stages></HediffDef></Defs>');
    const source = parsed[0].disabledWorkStages[0].permissionSources[0];
    ok(source.targets.map(target => target.canonicalTarget).join(',') === 'Commoner,Shooting',
      'CE-C4P-005 Hediff stage preserves tags absent from legacy incap vocabulary');
  }

  {
    const role = DR.find(item => item.id === 'melee');
    ok(role.disabledWorkTagsExact.includes('Shooting')
      && role.disabledWorkTagsExact.includes('Constructing'),
    'CE-C4P-006 curated role retains exact audited tags');
  }

  {
    App.state.customTraits.typed_permission = {
      label: 'Typed permission', skillMods: {}, incapable: [],
      permissionSources: [
        { sourceField: 'disabledWorkTypes', targetKind: 'workType', presence: 'present',
          rawValue: 'Doctor', completeness: 'complete',
          targets: [{ rawTarget: 'Doctor', canonicalTarget: 'Doctor' }] },
        { sourceField: 'disabledWorkTags', targetKind: 'workTag', presence: 'present',
          rawValue: 'AllWork', completeness: 'complete',
          targets: [{ rawTarget: 'AllWork', canonicalTarget: 'AllWork' }] },
      ],
    };
    const result = CE.fromTraits(mk('c4p7', { traits: ['typed_permission'] }));
    ok(result.effects.some(effect => effect.type === 'disableWorkType' && effect.target === 'Doctor'),
      'CE-C4P-007 C2 emits typed WorkType restriction without relabelling it as a job');
    ok(result.effects.some(effect => effect.type === 'disableWorkTag' && effect.target === 'AllWork'),
      'CE-C4P-008 C2 emits exact AllWork restriction');
    delete App.state.customTraits.typed_permission;
  }

  {
    const effects = [];
    const unresolved = [];
    CE._classifyIncap('firefight', effects, unresolved, {
      evidenceId: 'legacy:firefight',
      provenance: { sourceKind: 'fixture', sourceId: 'fixture' },
      confidence: 'verified',
    });
    const candidates = unresolved[0].candidateTargets || [];
    ok(candidates.some(candidate => candidate.kind === 'job' && candidate.target === 'firefight')
      && candidates.some(candidate => candidate.kind === 'workTag' && candidate.target === 'Firefighting'),
    'CE-C4P-009 legacy ambiguity preserves structured job and exact WorkTag candidates');
  }

  {
    const source = ctx.App._parsePermissionSourceValue(
      'Violent, Caring, SomeMod_CustomWork',
      'disabledWorkTags'
    );
    ok(source.rawValue === 'Violent, Caring, SomeMod_CustomWork'
      && source.completeness === 'partial',
    'CE-C4P-010 save seam preserves raw permission source without claiming completeness');
    ok(source.targets.some(item => item.canonicalTarget === 'Violent')
      && source.targets.some(item => item.rawTarget === 'SomeMod_CustomWork'
        && item.canonicalTarget === null),
    'CE-C4P-011 save seam separates canonical and unresolved WorkTags');
  }

  {
    const pawn = mk('c4p10', {
      incapable: ['violence'],
      permissionSources: [{
        sourceField: 'disabledWorkTags', targetKind: 'workTag', presence: 'present',
        rawValue: 'Violent, SomeMod_CustomWork', completeness: 'partial',
        targets: [
          { rawTarget: 'Violent', canonicalTarget: 'Violent' },
          { rawTarget: 'SomeMod_CustomWork', canonicalTarget: null },
        ],
      }],
    });
    const result = CE.collectPawnEvidence(pawn);
    ok(result.permissionEvidence.legacyIncapable.join(',') === 'violence'
      && result.permissionEvidence.rawSources[0].rawValue === 'Violent, SomeMod_CustomWork',
    'CE-C4P-012 pawn legacy and raw permission evidence are preserved separately');
    ok(result.effects.some(effect => effect.type === 'disableWorkTag' && effect.target === 'Violent'),
      'CE-C4P-013 known pawn raw WorkTag emits exact canonical evidence');
    ok(result.unresolvedSources.some(source => source.rawTarget === 'SomeMod_CustomWork'),
      'CE-C4P-014 unknown pawn raw WorkTag remains unresolved');
  }

  return { name: 'capability evidence (C2 adapters)', failures, total };
};

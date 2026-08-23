/**
 * C1 Capability Corpus - Frozen regression fixtures.
 * Freezes the current behaviour of evaluateJobPermission(), isIncapable(),
 * and related capability functions before Phase C architectural changes.
 *
 * Each scenario has a stable ID: CAP-C-NNN for capability, TEMP-C-NNN for temporal.
 * No production code is modified - only test fixtures.
 */
const { loadScripts } = require('./_harness');
const vm = require('vm');

module.exports = function run() {
  // -- Stub data --
  const TRAITS = {
    night_owl: {},
    undergrounder: {},
    quick_sleeper: {},
    ascetic: {},
    depressive: { breakThreshold: 0.06 },
    neurotic: { breakThreshold: 0.04 },
    very_neurotic: { breakThreshold: 0.08 },
    pyromaniac: { incapable: ['firefight'] },
    industrious: { workSpeed: 0.35 },
    lazy: { workSpeed: -0.2 },
    too_smart: { skillMods: { intellectual: 3 } },
    brawler: { incapable: ['shooting'], skillMods: { melee: 4 } },
  };

  const GENE_DEFS = {
    gene_no_sleep: { id: 'gene_no_sleep', label: 'Sleepless', incapable: [] },
    gene_no_caring: { id: 'gene_no_caring', label: 'No Caring', incapable: ['caring'] },
    gene_skill_medicine: { id: 'gene_skill_medicine', label: 'Skill Med', skillMods: { medicine: 4 } },
    gene_skill_mining_neg: { id: 'gene_skill_mining_neg', label: 'Skill Mine Bad', skillMods: { mining: -3 } },
    gene_work_speed: { id: 'gene_work_speed', label: 'Fast Worker', workSpeed: 0.15 },
  };

  const BACKSTORIES = {
    bs_sheriff: { incapable: [], skills: { shooting: 4, melee: 2 } },
    bs_farmer: { incapable: [], skills: { plant: 3, animal: 2 } },
    bs_noble: { incapable: ['dumb_labor', 'cleaning'], skills: { social: 3 } },
    bs_child_vatgrown: { incapable: [], skills: { intellectual: 1 } },
  };

  const ROLES = {
    none: {},
    medical: { skillMods: { medicine: 2 }, workSpeed: 0.05 },
    leader: { skillMods: { social: 3 }, incap: [] },
  };

  const HEDIFF_DISABLE_MAP = {
    luciferium_need: [{ min: 0, work: [] }],
    dementia: [{ min: 0, work: ['research'] }],
    brain_injury: [{ min: 0, work: [] }, { min: 0.5, work: ['intellectual', 'research'] }],
  };

  const HUMAN_BODY_PARENT = [];
  HUMAN_BODY_PARENT[28] = 27; // left hand -> left arm
  HUMAN_BODY_PARENT[27] = 26; // left arm -> left shoulder
  HUMAN_BODY_PARENT[26] = 0;  // left shoulder -> torso
  HUMAN_BODY_PARENT[39] = 38; // right hand -> right arm
  HUMAN_BODY_PARENT[38] = 37; // right arm -> right shoulder
  HUMAN_BODY_PARENT[37] = 0;  // right shoulder -> torso
  HUMAN_BODY_PARENT[0] = -1;  // torso -> root

  const XENOTYPES = {
    hussar: {
      uvSensitivity: 0, genes: ['gene_skill_medicine'],
      skillMods: { shooting: 2 }, incapable: [],
    },
    sanguophage: {
      uvSensitivity: 2, genes: ['gene_no_sleep'],
      skillMods: {}, incapable: [],
    },
    impid: {
      uvSensitivity: 0, genes: ['gene_no_caring'],
      skillMods: { melee: 2 }, incapable: [],
    },
    unknown_xeno: {
      uvSensitivity: 0, genes: ['mod_gene_unknown_alpha', 'mod_gene_unknown_beta'],
      skillMods: {}, incapable: [],
    },
  };

  const PriorityScale = {
    highest: 1, autoMax: 4, manualMax: 4,
    lowestAuto()    { return Math.min(this.autoMax, this.manualMax); },
    lowestManual()  { return this.manualMax; },
    defaultEnabled() { return 3; },
    isAuto(v)  { return Number.isInteger(v) && v >= this.highest && v <= this.autoMax; },
    isValid(v) { return v === null || (Number.isInteger(v) && v >= this.highest && v <= this.manualMax); },
  };

  const App = {
    state: {
      shiftTypes: ['Anything', 'Sleep', 'Work', 'Recreation'],
      shiftColors: ['#555', '#446', '#373', '#a83'],
      priorities: {},
      customGenes: {},
      prostheticEfficiency: {},
      precepts: {},
    },
    getXeno: (x) => {
      if (x && typeof x === 'string' && XENOTYPES[x]) {
        const xd = XENOTYPES[x];
        return { uvSensitivity: xd.uvSensitivity || 0, genes: xd.genes || [], skillMods: xd.skillMods || {}, incapable: xd.incapable || [] };
      }
      if (x && x.__xeno) return x.__xeno;
      return { uvSensitivity: 0, genes: [], skillMods: {}, incapable: [] };
    },
    getTrait: (id) => TRAITS[id] || null,
    getRole: (id) => ROLES[id] || {},
    getIdeoEffects: () => ({}),
    _resolveBackstory: (id) => (id && BACKSTORIES[id]) ? { incapable: BACKSTORIES[id].incapable || [], skills: BACKSTORIES[id].skills || {} } : null,
    _resolveGeneDef: (gId) => GENE_DEFS[gId] || null,
    _hediffDisableMap: () => HEDIFF_DISABLE_MAP,
    _hediffActiveIncaps: function(healthArr) {
      if (!Array.isArray(healthArr) || !healthArr.length) return [];
      const map = this._hediffDisableMap();
      if (!map || !Object.keys(map).length) return [];
      const out = [];
      healthArr.forEach(hi => {
        const stages = hi && hi.def && map[hi.def];
        if (!stages || !stages.length) return;
        const sev = (hi.severity != null && isFinite(hi.severity)) ? hi.severity : 0;
        let cur = null;
        for (const st of stages) { if (st.min <= sev) cur = st; else break; }
        if (cur && cur.work && cur.work.length) out.push(...cur.work);
      });
      return out;
    },
    _manipulationLost: function(pawn) {
      const h = pawn && pawn.health;
      if (!Array.isArray(h) || !h.length) return false;
      const protEff = this.state.prostheticEfficiency || {};
      const isProstheticDef = (def) => !!def && (protEff[def] != null ||
        /bionic|archotech|prosthe|peg ?leg|woodenfoot|woodenhand|denture|implant|cybernetic|drone|field ?hand|powerclaw/i.test(String(def)));
      const covered = new Set();
      const missing = new Set();
      h.forEach(hi => {
        if (hi.partIdx == null || hi.partIdx < 0) return;
        if (hi.type === 'replaced' || hi.type === 'implant' || isProstheticDef(hi.def)) covered.add(hi.partIdx);
        if (hi.type === 'missing') missing.add(hi.partIdx);
      });
      const hasAncestorIn = (idx, set) => {
        let cur = HUMAN_BODY_PARENT[idx];
        while (cur >= 0) { if (set.has(cur)) return true; cur = HUMAN_BODY_PARENT[cur]; }
        return false;
      };
      const sideWorks = (handIdx) => {
        if (covered.has(handIdx) || hasAncestorIn(handIdx, covered)) return true;
        return !(missing.has(handIdx) || hasAncestorIn(handIdx, missing));
      };
      return !sideWorks(28) && !sideWorks(39);
    },
    _passionMeta: () => ({ bucket: 0 }),
    _passionValue: () => 0,
  };

  // Load data.js (for JOB_MIN_AGE, MANIPULATION_GATED_JOBS, etc.) and engine.js
  const ctx = loadScripts(['data.js', 'engine.js'], {
    App, PriorityScale, HUMAN_BODY_PARENT,
  });
  const Engine = ctx.Engine;

  // Capture lexical constants from data.js onto the context object so
  // the isIncapable stub (defined outside the vm) can reference them.
  vm.runInContext(
    'try{globalThis.JOB_MIN_AGE=JOB_MIN_AGE;globalThis.MANIPULATION_GATED_JOBS=MANIPULATION_GATED_JOBS}catch(e){}',
    ctx
  );

  // Define effectiveSkill and isIncapable on App, faithfully reproducing
  // production logic from app-pawns.js for the dimensions we test.
  App.effectiveSkill = function(pawn, skillId) {
    if (!pawn || typeof pawn !== 'object') return 0;
    const base = Number(pawn.skills && pawn.skills[skillId]) || 0;
    const xeno = this.getXeno(pawn.xenotype);
    const xenoMod = (xeno.skillMods && xeno.skillMods[skillId]) || 0;
    let geneMod = 0;
    if (xeno.genes && xeno.genes.length > 0) {
      xeno.genes.forEach(gId => {
        const gene = this._resolveGeneDef(gId);
        if (gene && gene.skillMods && gene.skillMods[skillId]) geneMod += gene.skillMods[skillId];
      });
    }
    let traitMod = 0;
    if (pawn.traits) {
      pawn.traits.forEach(tId => {
        const tDef = this.getTrait(tId);
        if (tDef && tDef.skillMods && tDef.skillMods[skillId]) traitMod += tDef.skillMods[skillId];
      });
    }
    let backstoryMod = 0;
    const cbs = this._resolveBackstory(pawn.childhood);
    if (cbs && cbs.skills[skillId]) backstoryMod += cbs.skills[skillId];
    const abs = this._resolveBackstory(pawn.adulthood);
    if (abs && abs.skills[skillId]) backstoryMod += abs.skills[skillId];
    const role = this.getRole(pawn.role || 'none');
    const roleMod = (role.skillMods && role.skillMods[skillId]) || 0;
    const ideoFx = this.getIdeoEffects();
    let ideoMod = 0;
    if (skillId === 'shoot' || skillId === 'melee') ideoMod += ideoFx.combatSkill || 0;
    if (skillId === 'social') ideoMod += ideoFx.socialSkill || 0;
    if (skillId === 'intellectual') ideoMod += ideoFx.researchSpeed || 0;
    if (skillId === 'shoot' || skillId === 'melee') ideoMod += (this.state.precepts && this.state.precepts['combat_focus']) || 0;
    const sum = base + xenoMod + geneMod + traitMod + backstoryMod + roleMod + ideoMod;
    return Number.isFinite(sum) ? Math.max(0, Math.min(20, sum)) : 0;
  };

  App.isIncapable = function(pawn, job) {
    if (pawn.downed) return true;
    if (job && typeof ctx.JOB_MIN_AGE !== 'undefined' && ctx.JOB_MIN_AGE[job.id] != null &&
        pawn.bioAge != null && pawn.bioAge < ctx.JOB_MIN_AGE[job.id]) return true;
    if (job && typeof ctx.MANIPULATION_GATED_JOBS !== 'undefined' && ctx.MANIPULATION_GATED_JOBS.includes(job.id) && this._manipulationLost(pawn)) return true;
    if (!job.incapBlocks) return false;
    const xeno = this.getXeno(pawn.xenotype);
    const xenoIncap = xeno.incapable || [];
    let geneIncap = [];
    if (xeno.genes && xeno.genes.length > 0) {
      xeno.genes.forEach(gId => {
        const gene = this._resolveGeneDef(gId);
        if (gene && gene.incapable) geneIncap.push(...gene.incapable);
      });
    }
    const role = this.getRole(pawn.role || 'none');
    const roleIncap = role.incap || [];
    let traitIncap = [];
    if (Array.isArray(pawn.traits)) {
      pawn.traits.forEach(tId => {
        const t = this.getTrait(tId);
        if (t && t.incapable) traitIncap.push(...t.incapable);
      });
    }
    let bsIncap = [];
    const cbs = this._resolveBackstory(pawn.childhood);
    if (cbs) bsIncap.push(...cbs.incapable);
    const abs = this._resolveBackstory(pawn.adulthood);
    if (abs) bsIncap.push(...abs.incapable);
    const hediffIncap = this._hediffActiveIncaps(pawn.health);
    const allIncap = [...new Set([...(pawn.incapable || []), ...xenoIncap, ...geneIncap, ...roleIncap, ...traitIncap, ...bsIncap, ...hediffIncap])];
    return job.incapBlocks.some(b => allIncap.includes(b));
  };

  // Provide App.effectiveSkill/isIncapable to the Engine context
  ctx.App.effectiveSkill = App.effectiveSkill.bind(App);
  ctx.App.isIncapable = App.isIncapable.bind(App);

  // -- Job definitions --
  const docJob = { id: 'doctoring', name: 'Doctor', important: true, skill: 'medicine', incapBlocks: ['doctoring', 'caring'], speedFormula: { base: 0.4, perLevel: 0.06 } };
  const mineJob = { id: 'mining', name: 'Mining', skill: 'mining', incapBlocks: ['mining'], speedFormula: { base: 0.04, perLevel: 0.12 } };
  const haulJob = { id: 'hauling', name: 'Hauling', important: true, incapBlocks: ['hauling', 'dumb_labor'] };
  const cookJob = { id: 'cooking', name: 'Cooking', important: true, skill: 'cook', incapBlocks: ['cooking'], speedFormula: { base: 0, perLevel: 1, curve: true } };
  const fireJob = { id: 'firefight', name: 'Firefight', important: true, skill: null, incapBlocks: ['violence', 'firefight'] };
  const constructJob = { id: 'construction', name: 'Construct', important: true, skill: 'construct', incapBlocks: ['skilled_labor'], speedFormula: { base: 0.3, perLevel: 0.0875 } };
  const researchJob = { id: 'research', name: 'Research', important: true, skill: 'intel', incapBlocks: ['research'], speedFormula: { base: 0.08, perLevel: 0.115 } };
  const cleanJob = { id: 'cleaning', name: 'Clean', incapBlocks: ['cleaning', 'dumb_labor'] };
  const huntJob = { id: 'hunting', name: 'Hunt', skill: 'shoot', incapBlocks: ['violence', 'hunting'], speedFormula: { base: 0.04, perLevel: 0.12 } };

  // -- Helpers --
  let failures = 0, total = 0;
  const fail = (msg) => { failures++; console.log('  FAIL', msg); };

  const mk = (id, over = {}) => Object.assign({
    id, name: id, traits: [], xenotype: null, incapable: [],
    skills: {}, schedule: Array(24).fill(0), moodPreset: 'normal',
    health: [],
  }, over);

  // ======================================================================
  // PERMISSION CORPUS: CAP-C-001 through CAP-C-016
  // Freezes evaluateJobPermission() and isIncapable() parity.
  // ======================================================================

  const checkPerm = (label, pawn, job, expected) => {
    total++;
    try {
      const perm = Engine.evaluateJobPermission(pawn, job);
      const incap = App.isIncapable(pawn, job);
      const probs = [];

      if (expected.permStatus && perm.status !== expected.permStatus)
        probs.push(`perm.status: got ${perm.status}, want ${expected.permStatus}`);
      if (expected.isIncapable !== undefined && incap !== expected.isIncapable)
        probs.push(`isIncapable: got ${incap}, want ${expected.isIncapable}`);
      if (expected.blockCount !== undefined && perm.hardBlocks.length !== expected.blockCount)
        probs.push(`hardBlocks.length: got ${perm.hardBlocks.length}, want ${expected.blockCount}`);
      if (expected.blockSource && !perm.hardBlocks.some(b => b.source === expected.blockSource))
        probs.push(`missing block source: ${expected.blockSource}`);
      if (expected.blockId && !perm.hardBlocks.some(b => b.id === expected.blockId))
        probs.push(`missing block id: ${expected.blockId}`);
      if (expected.uncertaintyCount !== undefined && perm.uncertainties.length !== expected.uncertaintyCount)
        probs.push(`uncertainties.length: got ${perm.uncertainties.length}, want ${expected.uncertaintyCount}`);
      if (expected.noBlocks && perm.hardBlocks.length > 0)
        probs.push(`expected no blocks, got ${perm.hardBlocks.length}`);

      if (probs.length) fail(`[${label}] ${probs.join('; ')}`);
    } catch (e) { fail(`[${label}] threw ${e.message}`); }
  };

  // CAP-C-001: Vanilla baseline - no traits, no genes, capable of everything
  checkPerm('CAP-C-001', mk('Vanilla', { skills: { medicine: 10 } }), docJob,
    { permStatus: 'allowed', isIncapable: false, noBlocks: true, uncertaintyCount: 0 });

  // CAP-C-002: Backstory work-tag block (manual incapable array from save)
  checkPerm('CAP-C-002', mk('BsBlock', { incapable: ['caring'] }), docJob,
    { permStatus: 'blocked', isIncapable: true, blockSource: 'backstory/manual', blockId: 'caring' });

  // CAP-C-003: Trait block (pyromaniac disables firefight work tag)
  checkPerm('CAP-C-003', mk('TraitBlock', { traits: ['pyromaniac'] }), fireJob,
    { permStatus: 'blocked', isIncapable: true, blockSource: 'trait', blockId: 'firefight' });

  // CAP-C-004: Gene block (gene_no_caring disables caring work tag)
  checkPerm('CAP-C-004', mk('GeneBlock', { xenotype: 'impid' }), docJob,
    { permStatus: 'blocked', isIncapable: true, blockSource: 'gene', blockId: 'caring' });

  // CAP-C-005: Backstory incapable (noble childhood blocks dumb_labor)
  checkPerm('CAP-C-005', mk('Noble', { childhood: 'bs_noble' }), haulJob,
    { permStatus: 'blocked', isIncapable: true, blockSource: 'backstory', blockId: 'dumb_labor' });

  // CAP-C-006: Downed pawn - blocked for all jobs
  checkPerm('CAP-C-006', mk('Downed', { downed: true }), docJob,
    { permStatus: 'blocked', isIncapable: true, blockSource: 'status', blockId: 'downed' });

  // CAP-C-007: Age gate - child too young for doctoring (age 8, min 10)
  checkPerm('CAP-C-007', mk('YoungChild', { bioAge: 8, skills: { medicine: 5 } }), docJob,
    { permStatus: 'blocked', isIncapable: true, blockSource: 'age' });

  // CAP-C-008: Age gate - child old enough (age 11, min 10)
  checkPerm('CAP-C-008', mk('OldChild', { bioAge: 11, skills: { medicine: 5 } }), docJob,
    { permStatus: 'allowed', isIncapable: false });

  // CAP-C-009: Missing both arms - manipulation lost, blocked from gated jobs
  checkPerm('CAP-C-009',
    mk('NoArms', {
      health: [
        { def: 'MissingBodyPart', type: 'missing', partIdx: 26 },
        { def: 'MissingBodyPart', type: 'missing', partIdx: 37 },
      ],
    }), constructJob,
    { permStatus: 'blocked', isIncapable: true, blockSource: 'capacity', blockId: 'no_manipulation' });

  // CAP-C-010: Missing one arm only - manipulation NOT lost (other arm works)
  checkPerm('CAP-C-010',
    mk('OneArm', {
      health: [{ def: 'MissingBodyPart', type: 'missing', partIdx: 26 }],
    }), constructJob,
    { permStatus: 'allowed', isIncapable: false });

  // CAP-C-011: Prosthetic replaces missing arm - manipulation restored
  checkPerm('CAP-C-011',
    mk('BionicArm', {
      health: [
        { def: 'MissingBodyPart', type: 'missing', partIdx: 26 },
        { def: 'MissingBodyPart', type: 'missing', partIdx: 37 },
        { def: 'BionicArm', type: 'replaced', partIdx: 37 },
      ],
    }), constructJob,
    { permStatus: 'allowed', isIncapable: false });

  // CAP-C-012: Hediff disables work tag (dementia -> research block)
  checkPerm('CAP-C-012',
    mk('Dementia', { health: [{ def: 'dementia', severity: 0.3 }] }), researchJob,
    { permStatus: 'blocked', isIncapable: true });

  // CAP-C-013: Hediff severity below stage threshold - no block
  checkPerm('CAP-C-013',
    mk('MildBrain', { health: [{ def: 'brain_injury', severity: 0.2 }] }), researchJob,
    { permStatus: 'allowed', isIncapable: false });

  // CAP-C-014: Hediff severity above stage threshold - block kicks in
  checkPerm('CAP-C-014',
    mk('SevereBrain', { health: [{ def: 'brain_injury', severity: 0.6 }] }), researchJob,
    { permStatus: 'blocked', isIncapable: true });

  // CAP-C-015: Unknown/modded genes produce uncertainty, not block
  checkPerm('CAP-C-015', mk('ModdedGenes', { xenotype: 'unknown_xeno' }), docJob,
    { permStatus: 'uncertain', isIncapable: false, uncertaintyCount: 1 });

  // CAP-C-016: Multiple blocks from different sources stack
  checkPerm('CAP-C-016',
    mk('MultiBlock', {
      traits: ['pyromaniac', 'brawler'],
      incapable: ['caring'],
    }),
    { id: 'firefight_combo', name: 'Firefight Combo', incapBlocks: ['firefight', 'caring'] },
    { permStatus: 'blocked', isIncapable: true, blockCount: 2 });

  return { name: 'capability corpus (C1 freeze)', failures, total };
};

/** C6 Task 5: Undergrounder UV suppression guard removal. */
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

  const pawn = function (id, overrides) {
    return Object.assign({
      id: id, name: id, traits: [], traitRuntimeFacts: [], geneRuntimeFacts: [],
      health: [], skills: {}, passions: {}, incapable: [], permissionSources: [],
      childhood: null, adulthood: null, role: 'none', xenotype: null,
    }, overrides || {});
  };

  const findEv = (arr, eid) => arr.find(function (e) { return e.evidenceId === eid; });

  // -- C6-UV-001: Undergrounder + UV-sensitive xenotype emits avoidCondition("daylight") --
  {
    const p = pawn('uv1', { xenotype: 'dirtmole', traits: ['undergrounder'] });
    const result = CE.fromXenotype(p);
    const uvEv = findEv(result.effects, 'xeno:dirtmole:uv');
    ok(uvEv != null, 'C6-UV-001a undergrounder UV pawn emits UV evidence');
    ok(uvEv && uvEv.type === 'avoidCondition', 'C6-UV-001b evidence type is avoidCondition');
    ok(uvEv && uvEv.condition === 'daylight', 'C6-UV-001c condition is daylight');
    ok(uvEv && uvEv.fallbackHours && uvEv.fallbackHours.start === 6,
      'C6-UV-001d fallbackHours start is 6');
    ok(uvEv && uvEv.fallbackHours && uvEv.fallbackHours.end === 18,
      'C6-UV-001e fallbackHours end is 18');
    ok(uvEv && uvEv.weight === 4, 'C6-UV-001f weight is 4');
  }

  // -- C6-UV-002: UV-sensitive xenotype WITHOUT Undergrounder still emits evidence (no regression) --
  {
    const p = pawn('uv2', { xenotype: 'dirtmole', traits: [] });
    const result = CE.fromXenotype(p);
    const uvEv = findEv(result.effects, 'xeno:dirtmole:uv');
    ok(uvEv != null, 'C6-UV-002a non-undergrounder UV pawn emits UV evidence');
    ok(uvEv && uvEv.type === 'avoidCondition', 'C6-UV-002b evidence type is avoidCondition');
    ok(uvEv && uvEv.condition === 'daylight', 'C6-UV-002c condition is daylight');
  }

  // -- C6-UV-003: Non-UV-sensitive xenotype emits no daylight condition --
  {
    const p = pawn('uv3', { xenotype: 'yttakin', traits: [] });
    const result = CE.fromXenotype(p);
    const uvEv = findEv(result.effects, 'xeno:yttakin:uv');
    ok(uvEv == null, 'C6-UV-003 non-UV xenotype emits no UV evidence');
  }

  return { name: 'c6-undergrounder-uv', total, failures };
};

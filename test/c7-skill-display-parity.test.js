/** C7 Task 3: canonical C5 skill/stat display projections and parity. */
const fs = require('fs');
const path = require('path');
const { loadScripts } = require('./_harness');

module.exports = function run() {
  let total = 0, failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) { failures++; console.log('  FAIL ' + label); }
  };

  const skillFacts = Object.create(null);
  const statFacts = Object.create(null);
  const App = {
    state: { passionCatalog: [] },
    effectiveSkill(pawn, skillId) {
      return Number(pawn.skills && pawn.skills[skillId]) + 2;
    },
  };
  loadScripts(['app-pawns.js'], {
    App,
    StructuralSkillResolver: {
      resolve(c5Context, skillDefId) {
        return c5Context.skillFacts && c5Context.skillFacts[skillDefId]
          || skillFacts[skillDefId] || {
            state: 'unknown', completeness: 'unknown',
            runtimeGetLevelForUIProjection: null, runtimeGetLevelProjection: null,
            storedLevelInt: { state: 'unknown', value: null }, unresolved: [],
          };
      },
    },
    StructuralStatResolver: {
      resolve(c5Context, statDefId) {
        return c5Context.statFacts && c5Context.statFacts[statDefId]
          || statFacts[statDefId] || {
            state: 'unknown', completeness: 'unknown', resolvedPrefixValue: null,
            frontier: null, precision: [], unresolved: [],
          };
      },
    },
    Engine: { calculateWorkSpeedMod() { return 1.25; } },
  });
  App.effectiveSkill = (pawn, skillId) =>
    Number(pawn.skills && pawn.skills[skillId]) + 2;

  const policySnapshot = {
    skillPolicies: {
      Mining: { skillDefId: 'Mining', appSkillId: 'mining' },
      Cooking: { skillDefId: 'Cooking', appSkillId: 'cooking' },
    },
  };
  const pawnCtx = { c5Context: { effectivenessSnapshot: policySnapshot,
    skillFacts, statFacts } };

  ok(typeof App._c5SkillProjection === 'function',
    'C7-SKILL-001 canonical skill projection helper exists');
  ok(typeof App._c5SkillDisplay === 'function',
    'C7-SKILL-001 display helper owns the reviewed legacy fallback');
  ok(typeof App._c5StatProjection === 'function',
    'C7-STAT-001 canonical stat projection helper exists');

  if (typeof App._c5SkillProjection === 'function'
      && typeof App._c5SkillDisplay === 'function') {
    skillFacts.Mining = {
      state: 'resolved', completeness: 'complete',
      runtimeGetLevelForUIProjection: 12, runtimeGetLevelProjection: 11,
      storedLevelInt: { state: 'known', value: 10 }, unresolved: [],
    };
    const projection = App._c5SkillProjection(pawnCtx, 'mining');
    ok(projection.skillDefId === 'Mining',
      'C7-SKILL-002 app skill maps to the exact registered SkillDef');
    ok(projection.level === 12 && projection.source === 'c5',
      'C7-SKILL-003 UI projection is preferred over total-disablement projection');
    const display = App._c5SkillDisplay({ skills: { mining: 10 } }, pawnCtx, 'mining');
    ok(display.level === 12 && display.fallbackUsed === false,
      'C7-SKILL-004 complete C5 display matches the legacy-compatible number');
    ok(display.notice === '',
      'C7-SKILL-005 complete C5 evidence needs no uncertainty annotation');

    const ambiguousCtx = { c5Context: { effectivenessSnapshot: { skillPolicies: {
      MiningA: { skillDefId: 'MiningA', appSkillId: 'mining' },
      MiningB: { skillDefId: 'MiningB', appSkillId: 'mining' },
    } } } };
    const ambiguous = App._c5SkillProjection(ambiguousCtx, 'mining');
    ok(ambiguous.level === null && ambiguous.reason === 'ambiguousSkillDefProjection',
      'C7-SKILL-006 plural SkillDefs never produce an arbitrary projection');

    skillFacts.Mining = {
      state: 'partial', completeness: 'partial',
      runtimeGetLevelForUIProjection: null, runtimeGetLevelProjection: null,
      storedLevelInt: { state: 'known', value: 10 },
      unresolved: [{ reasonCode: 'runtimeAptitudeUnknown' }],
    };
    const partial = App._c5SkillDisplay({ skills: { mining: 10 } }, pawnCtx, 'mining');
    ok(partial.level === 12 && partial.fallbackUsed === true,
      'C7-SKILL-007 canonical unknown keeps the named legacy-compatible display value');
    ok(/incomplete|unknown|partial/i.test(partial.notice),
      'C7-SKILL-008 partial/unknown display carries a tooltip annotation');
  } else {
    for (let i = 0; i < 7; i++) ok(false, 'C7-SKILL helper contract unavailable');
  }

  const passionPawn = { passionDefs: { mining: 'Major' }, passions: { mining: 2 } };
  const passion = App._passionMeta(App._passionValue(passionPawn, 'mining'));
  ok(passion.glyph === '🔥🔥' && passion.bucket === 2,
    'C7-SKILL-009 raw passion identity retains the existing glyph and bucket');

  const editablePawn = { rawSkillRecords: { Mining: {
    skillDefId: 'Mining', appSkillId: 'mining', levelInt: 10,
    levelState: 'known', parserCompleteness: 'partial', provenance: {},
  } } };
  ok(App._c5UpdateRawSkillLevel(editablePawn, 'mining', 14)
    && editablePawn.rawSkillRecords.Mining.levelInt === 14
    && editablePawn.rawSkillRecords.Mining.parserCompleteness === 'partial',
  'C7-SKILL-009A UI edit updates the one exact raw fact without fabricating completeness');
  const pluralRecords = { rawSkillRecords: {
    MiningA: { appSkillId: 'mining', levelInt: 1 },
    MiningB: { appSkillId: 'mining', levelInt: 2 },
  } };
  ok(App._c5UpdateRawSkillLevel(pluralRecords, 'mining', 7) === false
    && pluralRecords.rawSkillRecords.MiningA.levelInt === 1
    && pluralRecords.rawSkillRecords.MiningB.levelInt === 2,
  'C7-SKILL-009B UI edit never mutates an ambiguous plural mapping');

  if (typeof App._c5StatProjection === 'function') {
    statFacts.MiningSpeed = {
      state: 'partial', completeness: 'partial', resolvedPrefixValue: 1.37,
      frontier: null, numericClaim: 'exactAgainstRoundedC3CapacityInput',
      precision: [{ kind: 'capacityInputRoundedByC3', capacityDefId: 'Manipulation',
        roundedValue: 0.83, roundingIncrement: 0.01 }], unresolved: [],
    };
    const stat = App._c5StatProjection(pawnCtx, 'MiningSpeed');
    ok(stat.value === 1.37 && stat.source === 'c5',
      'C7-STAT-002 rounded C3 input remains a usable C5 numeric projection');
    ok(/rounded C3 capacity input/i.test(stat.notice)
      && /Manipulation/.test(stat.notice) && /0\.83/.test(stat.notice),
    'C7-STAT-003 Option A precision notice names the rounded capacity input');

    statFacts.WorkSpeedGlobal = {
      state: 'partial', completeness: 'partial', resolvedPrefixValue: 1,
      frontier: { reasonCode: 'unsupportedSemantics' }, precision: [],
      unresolved: [{ reasonCode: 'unsupportedSemantics' }],
    };
    const statUnknown = App._c5StatProjection(pawnCtx, 'WorkSpeedGlobal');
    ok(statUnknown.value === null && /partial|incomplete/i.test(statUnknown.notice),
      'C7-STAT-004 unresolved frontier is annotated and never presented as a full value');
  } else {
    for (let i = 0; i < 3; i++) ok(false, 'C7-STAT helper contract unavailable');
  }

  if (typeof App._c5SkillProjection === 'function') {
    const radarApp = App;
    const radarFacts = level => ({ Mining: {
      state: 'resolved', completeness: 'complete',
      runtimeGetLevelForUIProjection: level, runtimeGetLevelProjection: level,
      storedLevelInt: { state: 'known', value: level }, unresolved: [],
    } });
    const radarMap = new Map([
      ['p1', { c5Context: { effectivenessSnapshot: policySnapshot,
        skillFacts: radarFacts(12) } }],
      ['p2', { c5Context: { effectivenessSnapshot: policySnapshot,
        skillFacts: radarFacts(8) } }],
    ]);
    const originalLegacy = radarApp.effectiveSkill;
    let legacyCalls = 0;
    radarApp.effectiveSkill = () => { legacyCalls++; return 20; };
    const { Charts } = loadScripts(['charts.js'], {
      App: radarApp, SKILLS: [{ id: 'mining', name: 'Mining', short: 'MIN' }],
    });
    const radar = Charts.renderColonyRadar([
      { id: 'p1', skills: { mining: 10 } },
      { id: 'p2', skills: { mining: 6 } },
    ], 200, radarMap);
    ok(/Mining: 10\.0 \/ 20 colony average/.test(radar),
      'C7-SKILL-010 colony radar averages complete C5 projections');
    ok(legacyCalls === 0,
      'C7-SKILL-011 complete radar projections do not call the legacy adapter');
    radarApp.effectiveSkill = originalLegacy;
  } else {
    ok(false, 'C7-SKILL-010 radar projection helper unavailable');
    ok(false, 'C7-SKILL-011 radar projection helper unavailable');
  }

  // Causal parity gate: the reviewed C5 contract says a saved SkillRecord already
  // contains creation gains, while frozen C1 may add current backstory gains again.
  // C7 approves only this causal display correction; policy consumers remain frozen.
  const creationApp = {
    state: { customXenotypes: {}, customTraits: {}, customGenes: {}, customJobs: [],
      customBackstories: {}, hediffCatalog: [], precepts: {}, passionCatalog: [],
      ideology: { memes: [], precepts: {} }, prostheticEfficiency: {} },
    getXeno() { return { genes: [], skillMods: {}, incapable: [] }; },
    getTrait() { return null; },
    getRole() { return { id: 'none', skillMods: {}, workSpeed: 0, incap: [] }; },
    getIdeoEffects() { return {}; },
    _resolveBackstory(id) {
      return id === 'SkilledChild' ? { skills: { mining: 2 }, incapable: [] } : null;
    },
  };
  const creationModules = loadScripts([
    'structural-skill-resolver.js', 'app-pawns.js', 'c5-legacy-compatibility.js',
  ], {
    App: creationApp,
    StructuralStatResolver: { resolve() { return { state: 'unknown', completeness: 'unknown',
      resolvedPrefixValue: null, frontier: null, precision: [], unresolved: [] }; } },
    Engine: { calculateWorkSpeedMod() { return 1; } },
  });
  creationApp._resolveBackstory = id => id === 'SkilledChild'
    ? { skills: { mining: 2 }, incapable: [] } : null;
  const creationPawn = {
    skills: { mining: 10 }, traits: [], childhood: 'SkilledChild', adulthood: null,
    role: 'none', xenotype: null,
  };
  const creationCtx = { c5Context: {
    effectivenessSnapshot: { skillPolicies: { Mining: {
      skillDefId: 'Mining', appSkillId: 'mining', minLevel: 0, maxLevel: 20,
      catalogueCompleteness: 'complete', neverDisabledBasedOnWorkTypes: true,
    } } },
    pawnEvidence: {
      effects: [], skillOperations: [],
      pawnState: { baseSkillFacts: { Mining: {
        recordPresence: 'present', storedLevelInt: { state: 'known', value: 10,
          evidence: [] }, evidence: [],
      } } },
    },
  } };
  const creationProjection = creationApp._c5SkillDisplay(
    creationPawn, creationCtx, 'mining');
  const creationLegacy = creationApp.effectiveSkill(creationPawn, 'mining');
  ok(creationProjection.level === 10 && creationLegacy === 12,
    'C7-SKILL-PARITY-BOUNDARY causal saved-base/creation-gain delta is reproduced');
  const creationDelta = creationModules.C5LegacyCompatibility.compare({
    caseId: 'c7-skill-display-creation-gain', dimension: 'skillDisplay',
    canonicalValue: creationProjection.level, legacyValue: creationLegacy,
    canonical: creationProjection, legacy: creationLegacy,
    deltaCode: 'creationGainAlreadyPersisted',
  });
  ok(creationProjection.level === 10 && creationDelta.same === false
    && creationDelta.deltaCode === 'creationGainAlreadyPersisted'
    && creationDelta.compatibilityOnly === true,
  'C7-SKILL-DELTA-CREATION approved display uses canonical 10 and records named delta');

  const appPawnsSource = fs.readFileSync(path.join(__dirname, '..', 'files', 'app-pawns.js'), 'utf8');
  const appRenderSource = fs.readFileSync(path.join(__dirname, '..', 'files', 'app-render.js'), 'utf8');
  const chartsSource = fs.readFileSync(path.join(__dirname, '..', 'files', 'charts.js'), 'utf8');
  const frozenPolicySource = fs.readFileSync(path.join(__dirname, '..', 'files', 'engine.js'), 'utf8')
    + fs.readFileSync(path.join(__dirname, '..', 'files', 'app-priorities.js'), 'utf8');
  ok(/StructuralSkillResolver\.resolve/.test(appPawnsSource),
    'C7-SKILL-012 production helper calls the canonical C5 skill resolver');
  ok(!/this\.effectiveSkill\(p, s\.id\)/.test(appPawnsSource + appRenderSource),
    'C7-SKILL-013 pawn card, manager, spotlight consumers no longer call C1 directly');
  ok(chartsSource.indexOf('App._c5SkillProjection') >= 0
    && chartsSource.indexOf('App._c5SkillProjection')
      < chartsSource.indexOf('App.effectiveSkill(p, s.id)'),
  'C7-SKILL-014 radar uses C5 first and retains C1 only for canonical unknown');
  ok(/renderColonyRadar\(this\.state\.pawns, radarSize, contextMap\)/.test(appRenderSource),
    'C7-SKILL-015 dashboard passes its request-scoped coordinator map to radar');
  ok(!new RegExp('primary' + 'Skill').test(appPawnsSource + appRenderSource + chartsSource),
    'C7-SKILL-016 no canonical primary skill selection is introduced');
  ok(!/creationGainAlreadyPersisted/.test(frozenPolicySource),
    'C7-SKILL-017 approved display delta does not enter ranking or assignment policy');

  return { name: 'C7 skill and stat display parity', total, failures };
};

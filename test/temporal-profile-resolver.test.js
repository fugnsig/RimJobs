/** C6 Task 6: TemporalProfileResolver - full resolution algorithm. */
const fs = require('fs');
const path = require('path');
const { loadScripts } = require('./_harness');

module.exports = function run() {
  let total = 0, failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) { failures++; console.log('  FAIL ' + label); }
  };

  const ctx = loadScripts([
    'structural-skill-resolver.js',
    'structural-stat-resolver.js',
    'temporal-profile-resolver.js',
  ], {});
  const Resolver = ctx.TemporalProfileResolver;
  const StatResolver = ctx.StructuralStatResolver;

  // -- Shared helpers --
  const phases = {
    base: 1, skillNeedOffset: 2, capacityOffset: 3, traitOffset: 4,
    hediffOffset: 5, preceptOffset: 6, roleOffset: 7, geneOffset: 8,
    lifeStageOffset: 9, equipmentOffset: 10, traitFactor: 11, hediffFactor: 12,
    preceptFactor: 13, roleFactor: 14, geneFactor: 15, lifeStageFactor: 16,
    requestThingOperation: 17, statFactor: 18, skillNeedFactor: 19,
    capacityFactor: 20, inspiration: 21, statPart: 22, postProcessCurve: 23,
    postProcessStatFactor: 24, scenarioFactor: 25, roundToFiveOver: 26,
    roundValue: 27, clamp: 28,
  };

  const op = (id, phase, kind, operand, extra) => Object.assign({
    operationTemplateId: id, phase: phase, phaseOrder: phases[phase], sourceOrder: 0,
    kind: kind, statDefId: null, sourceDefId: null, dependencyStatDefId: null,
    skillDefId: null, capacityDefId: null, statPartClass: null,
    durability: 'durable', applicability: 'applicable', operand: Object.assign({
      value: null, scale: null, weight: null, max: null, min: null,
      allowedDefect: null, useReciprocal: null, curvePoints: [],
    }, operand || {}), semanticsSupport: 'supported', completeness: 'complete',
    compatibilityOnly: false, unresolved: [],
  }, extra || {});

  const definition = (id, operations) => ({
    schemaVersion: 1, runtimeVersion: '1.6.4871 rev590', statDefId: id,
    evaluatorSupport: 'initialSubset', orderedOperations: operations.map(item =>
      Object.assign({}, item, { statDefId: id })), dependencies: [],
  });

  const allComplete = Object.fromEntries([
    'traitOffsets', 'hediffOffsets', 'preceptOffsets', 'roleOffsets',
    'geneOffsets', 'lifeStageOffsets', 'equipmentOffsets', 'traitFactors',
    'hediffFactors', 'preceptFactors', 'roleFactors', 'geneFactors',
    'lifeStageFactors', 'requestThingOperations', 'inspirationOperations',
    'scenarioContext',
  ].map(id => [id, { completeness: 'complete', byStatDef: {}, evidence: [] }]));

  const allTemporalComplete = {
    restNeed: { completeness: 'complete', unresolvedEvidence: [] },
    recreation: { completeness: 'complete', unresolvedEvidence: [] },
    windows: { completeness: 'complete', unresolvedEvidence: [] },
    conditions: { completeness: 'complete', unresolvedEvidence: [] },
    activities: { completeness: 'complete', unresolvedEvidence: [] },
  };

  const restFallDef = definition('RestFallRateFactor', [
    op('base', 'base', 'setBase', { value: 1 }),
  ]);
  const restRateDef = definition('RestRateMultiplier', [
    op('base', 'base', 'setBase', { value: 1 }),
  ]);
  const baseDefs = {
    RestFallRateFactor: restFallDef,
    RestRateMultiplier: restRateDef,
  };

  const makeContext = (overrides) => {
    const base = {
      runtimeVersion: '1.6.4871 rev590',
      effectivenessSnapshot: Object.freeze({
        runtimeVersion: '1.6.4871 rev590',
        phaseOrder: phases,
        statDefinitions: { supported: baseDefs, recordOnly: {} },
        skillPolicies: {},
      }),
      pawnEvidence: {
        effects: [],
        statOperations: [],
        sourceFamilyCompleteness: allComplete,
        temporalCoverage: JSON.parse(JSON.stringify(allTemporalComplete)),
        structuralContextFacts: {
          biologicalAge: { state: 'unknown', value: null, evidence: [] },
          slaveStatus: { state: 'unknown', value: null, evidence: [] },
          raceProperties: { humanlike: { state: 'unknown', value: null, evidence: [] } },
        },
        pawnState: { baseSkillFacts: {} },
        skillOperations: [],
      },
      structuralCapacities: { capacities: {} },
    };
    if (overrides) {
      if (overrides.effects) base.pawnEvidence.effects = overrides.effects;
      if (overrides.statOperations) base.pawnEvidence.statOperations = overrides.statOperations;
      if (overrides.temporalCoverage) base.pawnEvidence.temporalCoverage = overrides.temporalCoverage;
      if (overrides.sourceFamilyCompleteness) base.pawnEvidence.sourceFamilyCompleteness = overrides.sourceFamilyCompleteness;
      if (overrides.statDefs) {
        base.effectivenessSnapshot = Object.freeze({
          runtimeVersion: '1.6.4871 rev590',
          phaseOrder: phases,
          statDefinitions: { supported: overrides.statDefs, recordOnly: {} },
          skillPolicies: {},
        });
      }
    }
    return Object.freeze(base);
  };

  const ev = (id, type, extra) => Object.assign({
    evidenceId: id,
    type: type,
    provenance: { sourceKind: 'test', sourceId: id },
  }, extra || {});

  // =====================================================================
  // 10.1 Rest dimension
  // =====================================================================

  // -- C6-R-001: Vanilla pawn, complete catalogues, no rest modifiers --
  {
    const c5 = makeContext();
    const profile = Resolver.resolve(c5);
    ok(profile.rest.needState === 'required',
      'C6-R-001a needState is required for vanilla pawn');
    ok(profile.rest.restFallRateFactor && profile.rest.restFallRateFactor.resolvedPrefixValue === 1,
      'C6-R-001b RestFallRateFactor base 1.0');
    ok(profile.rest.restRateMultiplier && profile.rest.restRateMultiplier.resolvedPrefixValue === 1,
      'C6-R-001c RestRateMultiplier base 1.0');
    ok(profile.dimensions.rest.completeness === 'complete',
      'C6-R-001d rest completeness is complete');
  }

  // -- C6-R-002: Quick Sleeper trait --
  {
    const c5 = makeContext({
      statOperations: [
        { operationId: 'quick-sleeper', kind: 'statOffset', statDefId: 'RestRateMultiplier',
          value: 0.5, phase: 'traitOffset', phaseOrder: 4, sourceOrder: 0,
          sourceInstanceOrder: 0, sourceFamily: 'traitOffsets', applicability: 'applicable',
          durability: 'durable', canonicalEligible: true, compatibilityOnly: false,
          superseded: false, completeness: 'complete' },
      ],
    });
    const profile = Resolver.resolve(c5);
    ok(profile.rest.needState === 'required',
      'C6-R-002a needState is required');
    ok(profile.rest.restRateMultiplier && profile.rest.restRateMultiplier.resolvedPrefixValue === 1.5,
      'C6-R-002b RestRateMultiplier offset +0.5 yields 1.5');
  }

  // -- C6-R-003: Low Sleep gene --
  {
    const c5 = makeContext({
      statOperations: [
        { operationId: 'low-sleep', kind: 'statFactor', statDefId: 'RestFallRateFactor',
          value: 0.4, phase: 'geneFactor', phaseOrder: 15, sourceOrder: 0,
          sourceInstanceOrder: 0, sourceFamily: 'geneFactors', applicability: 'applicable',
          durability: 'durable', canonicalEligible: true, compatibilityOnly: false,
          superseded: false, completeness: 'complete' },
      ],
    });
    const profile = Resolver.resolve(c5);
    ok(profile.rest.needState === 'required',
      'C6-R-003a needState is required');
    ok(profile.rest.restFallRateFactor
      && Math.abs(profile.rest.restFallRateFactor.resolvedPrefixValue - 0.4) < 1e-9,
      'C6-R-003b RestFallRateFactor factor 0.4');
  }

  // -- C6-R-004: gene_no_sleep --
  {
    const c5 = makeContext({
      effects: [
        ev('gene:gene_no_sleep:needSuppression:Rest', 'needSuppression',
          { target: 'Rest', value: true,
            provenance: { sourceKind: 'gene', sourceId: 'gene_no_sleep' } }),
      ],
    });
    const profile = Resolver.resolve(c5);
    ok(profile.rest.needState === 'suppressed',
      'C6-R-004 needState is suppressed for gene_no_sleep');
  }

  // -- C6-R-005: Body Mastery --
  {
    const c5 = makeContext({
      effects: [
        ev('trait:body_mastery:needSuppression:Rest', 'needSuppression',
          { target: 'Rest', value: true,
            provenance: { sourceKind: 'trait', sourceId: 'body_mastery' } }),
      ],
    });
    const profile = Resolver.resolve(c5);
    ok(profile.rest.needState === 'suppressed',
      'C6-R-005 needState is suppressed for Body Mastery');
  }

  // -- C6-R-006: Quick Sleeper + Low Sleep --
  {
    const c5 = makeContext({
      statOperations: [
        { operationId: 'quick-sleeper', kind: 'statOffset', statDefId: 'RestRateMultiplier',
          value: 0.5, phase: 'traitOffset', phaseOrder: 4, sourceOrder: 0,
          sourceInstanceOrder: 0, sourceFamily: 'traitOffsets', applicability: 'applicable',
          durability: 'durable', canonicalEligible: true, compatibilityOnly: false,
          superseded: false, completeness: 'complete' },
        { operationId: 'low-sleep', kind: 'statFactor', statDefId: 'RestFallRateFactor',
          value: 0.4, phase: 'geneFactor', phaseOrder: 15, sourceOrder: 0,
          sourceInstanceOrder: 0, sourceFamily: 'geneFactors', applicability: 'applicable',
          durability: 'durable', canonicalEligible: true, compatibilityOnly: false,
          superseded: false, completeness: 'complete' },
      ],
    });
    const profile = Resolver.resolve(c5);
    ok(profile.rest.restRateMultiplier && profile.rest.restRateMultiplier.resolvedPrefixValue === 1.5,
      'C6-R-006a Quick Sleeper RestRateMultiplier 1.5');
    ok(profile.rest.restFallRateFactor
      && Math.abs(profile.rest.restFallRateFactor.resolvedPrefixValue - 0.4) < 1e-9,
      'C6-R-006b Low Sleep RestFallRateFactor 0.4');
  }

  // -- C6-R-007: Unknown modded rest gene --
  {
    const partialFamily = JSON.parse(JSON.stringify(allComplete));
    partialFamily.geneFactors = { completeness: 'partial', byStatDef: { RestFallRateFactor: 'partial' }, evidence: [] };
    const c5 = makeContext({
      sourceFamilyCompleteness: partialFamily,
      temporalCoverage: {
        restNeed: { completeness: 'partial', unresolvedEvidence: [
          { evidenceId: 'temporal:restNeed:modX:unknownGene', provenance: { sourceKind: 'gene', sourceId: 'unknownGene' } },
        ] },
        recreation: { completeness: 'complete', unresolvedEvidence: [] },
        windows: { completeness: 'complete', unresolvedEvidence: [] },
        conditions: { completeness: 'complete', unresolvedEvidence: [] },
        activities: { completeness: 'complete', unresolvedEvidence: [] },
      },
    });
    const profile = Resolver.resolve(c5);
    ok(profile.dimensions.rest.confidence !== 'verified',
      'C6-R-007a rest confidence degraded from verified');
    ok(profile.dimensions.rest.completeness === 'partial',
      'C6-R-007b rest completeness is partial');
  }

  // -- C6-R-008: Legacy sleepHoursOverride only --
  {
    const c5 = makeContext({
      effects: [
        ev('gene:low_sleep:sleepHoursOverride', 'sleepHoursOverride',
          { value: 6, provenance: { sourceKind: 'gene', sourceId: 'low_sleep' } }),
      ],
    });
    const profile = Resolver.resolve(c5);
    ok(profile.rest.compatibility.sleepHoursOverride === 6,
      'C6-R-008a sleepHoursOverride carried as compatibility');
    ok(profile.rest.compatibility.overrideSources.length === 1,
      'C6-R-008b one override source');
    // Verify it is NOT in the canonical rest output
    ok(profile.rest.needState === 'required',
      'C6-R-008c needState remains required (override is not suppression)');
  }

  // =====================================================================
  // 10.2 Recreation
  // =====================================================================

  // -- C6-J-001: Vanilla pawn --
  {
    const c5 = makeContext();
    const profile = Resolver.resolve(c5);
    ok(profile.recreation.joyNeedModifiers === null,
      'C6-J-001a no joy need modifiers for vanilla pawn');
    ok(profile.recreation.recommendations.length === 0,
      'C6-J-001b no recommendations for vanilla pawn');
  }

  // -- C6-J-002: Ascetic trait --
  {
    const c5 = makeContext({
      effects: [
        ev('trait:ascetic:recHours', 'recreationHoursRecommendation',
          { delta: -1, provenance: { sourceKind: 'trait', sourceId: 'ascetic' } }),
      ],
    });
    const profile = Resolver.resolve(c5);
    ok(profile.recreation.recommendations.length === 1,
      'C6-J-002a one recommendation');
    ok(profile.recreation.recommendations[0].delta === -1,
      'C6-J-002b delta is -1');
    ok(profile.recreation.recommendations[0].kind === 'recommendation',
      'C6-J-002c kind is recommendation');
    // Verify NOT applied to any baseline
    ok(profile.recreation.joyNeedModifiers === null,
      'C6-J-002d joyNeedModifiers remains null');
  }

  // -- C6-J-003: Depressive trait (no recreation output) --
  {
    // Depressive does NOT produce recreationHoursRecommendation evidence in C2
    const c5 = makeContext();
    const profile = Resolver.resolve(c5);
    ok(profile.recreation.recommendations.length === 0,
      'C6-J-003 depressive: no recreation recommendations (empty effects)');
  }

  // -- C6-J-004: Neurotic trait (no recreation output) --
  {
    const c5 = makeContext();
    const profile = Resolver.resolve(c5);
    ok(profile.recreation.recommendations.length === 0,
      'C6-J-004 neurotic: no recreation recommendations (empty effects)');
  }

  // -- C6-J-005: Depressive + Neurotic (no recreation output) --
  {
    const c5 = makeContext();
    const profile = Resolver.resolve(c5);
    ok(profile.recreation.recommendations.length === 0,
      'C6-J-005 depressive+neurotic: no recreation recommendations (empty effects)');
  }

  // -- C6-J-006: High break risk traits (no recreation output) --
  {
    const c5 = makeContext();
    const profile = Resolver.resolve(c5);
    ok(profile.recreation.recommendations.length === 0,
      'C6-J-006 high break risk: no recreation recommendations (empty effects)');
  }

  // =====================================================================
  // 10.3 Windows
  // =====================================================================

  // -- C6-W-001: Night Owl --
  {
    const c5 = makeContext({
      effects: [
        ev('trait:night_owl:avoidHours', 'avoidHours',
          { hours: [11, 12, 13, 14, 15, 16, 17], weight: 4,
            provenance: { sourceKind: 'trait', sourceId: 'night_owl' } }),
        ev('trait:night_owl:preferHours', 'preferHours',
          { hours: [23, 0, 1, 2, 3, 4, 5], weight: 2,
            provenance: { sourceKind: 'trait', sourceId: 'night_owl' } }),
      ],
    });
    const profile = Resolver.resolve(c5);
    const avoids = profile.windows.filter(function (w) { return w.kind === 'avoid'; });
    const prefers = profile.windows.filter(function (w) { return w.kind === 'prefer'; });
    ok(avoids.length === 1, 'C6-W-001a one avoid window');
    ok(avoids[0] && JSON.stringify(avoids[0].hours) === JSON.stringify([11, 12, 13, 14, 15, 16, 17]),
      'C6-W-001b avoid hours [11-17]');
    ok(avoids[0] && avoids[0].policy.weight === 4,
      'C6-W-001c avoid weight 4 as policy');
    ok(prefers.length === 1, 'C6-W-001d one prefer window');
    ok(prefers[0] && JSON.stringify(prefers[0].hours) === JSON.stringify([23, 0, 1, 2, 3, 4, 5]),
      'C6-W-001e prefer hours [23,0,1,2,3,4,5]');
    ok(prefers[0] && prefers[0].policy.weight === 2,
      'C6-W-001f prefer weight 2 as policy');
  }

  // -- C6-W-002: Vanilla pawn (no windows) --
  {
    const c5 = makeContext();
    const profile = Resolver.resolve(c5);
    ok(profile.windows.length === 0, 'C6-W-002 no windows for vanilla pawn');
  }

  // -- C6-W-003: Multiple window sources --
  {
    const c5 = makeContext({
      effects: [
        ev('trait:night_owl:avoidHours', 'avoidHours',
          { hours: [11, 12, 13, 14, 15, 16, 17], weight: 4,
            provenance: { sourceKind: 'trait', sourceId: 'night_owl' } }),
        ev('mod:something:avoidHours', 'avoidHours',
          { hours: [6, 7, 8], weight: 2,
            provenance: { sourceKind: 'mod', sourceId: 'something' } }),
      ],
    });
    const profile = Resolver.resolve(c5);
    ok(profile.windows.length === 2, 'C6-W-003 multiple windows preserved independently');
  }

  // =====================================================================
  // 10.4 Conditions
  // =====================================================================

  // -- C6-C-001: UV-sensitive (no Undergrounder) --
  {
    const c5 = makeContext({
      effects: [
        ev('xeno:dirtmole:uv', 'avoidCondition',
          { condition: 'daylight', fallbackHours: { start: 6, end: 18 }, weight: 4,
            provenance: { sourceKind: 'xenotype', sourceId: 'dirtmole' } }),
      ],
    });
    const profile = Resolver.resolve(c5);
    ok(profile.conditions.length === 1, 'C6-C-001a one avoid condition');
    ok(profile.conditions[0].condition === 'daylight', 'C6-C-001b condition is daylight');
    ok(profile.conditions[0].policy.fallbackHours.start === 6, 'C6-C-001c fallback start 6');
    ok(profile.conditions[0].policy.fallbackHours.end === 18, 'C6-C-001d fallback end 18');
    ok(profile.conditions[0].policy.weight === 4, 'C6-C-001e weight 4');
  }

  // -- C6-C-002: UV-sensitive + Undergrounder --
  {
    const c5 = makeContext({
      effects: [
        ev('xeno:dirtmole:uv', 'avoidCondition',
          { condition: 'daylight', fallbackHours: { start: 6, end: 18 }, weight: 4,
            provenance: { sourceKind: 'xenotype', sourceId: 'dirtmole' } }),
      ],
    });
    const profile = Resolver.resolve(c5);
    ok(profile.conditions.length === 1,
      'C6-C-002 UV condition STILL PRESENT for undergrounder+UV pawn');
  }

  // -- C6-C-003: No UV sensitivity --
  {
    const c5 = makeContext();
    const profile = Resolver.resolve(c5);
    ok(profile.conditions.length === 0, 'C6-C-003 no conditions for non-UV pawn');
  }

  // =====================================================================
  // 10.5 Activities
  // =====================================================================

  // -- C6-A-001: Psycaster (typed evidence) --
  {
    const c5 = makeContext({
      effects: [
        ev('hediff:Hediff_Psylink:meditation', 'requiredActivity',
          { activity: 'meditation', obligation: 'required',
            satisfiesNeeds: ['recreation'], hours: 1,
            composition: { resolved: true, rule: 'singleSource' },
            provenance: { sourceKind: 'hediff', sourceId: 'Hediff_Psylink' } }),
      ],
    });
    const profile = Resolver.resolve(c5);
    ok(profile.activities.length === 1, 'C6-A-001a one activity');
    ok(profile.activities[0].activity === 'meditation', 'C6-A-001b activity is meditation');
    ok(profile.activities[0].obligation === 'required', 'C6-A-001c obligation is required');
    ok(JSON.stringify(profile.activities[0].satisfiesNeeds) === '["recreation"]',
      'C6-A-001d satisfiesNeeds is [recreation]');
    ok(profile.activities[0].compositionResolved === true, 'C6-A-001e compositionResolved is true');
    ok(profile.activities[0].policy.recommendedHours === 1, 'C6-A-001f recommendedHours is 1');
  }

  // -- C6-A-002: Non-psycaster --
  {
    const c5 = makeContext();
    const profile = Resolver.resolve(c5);
    ok(profile.activities.length === 0, 'C6-A-002 no activities for non-psycaster');
  }

  // -- C6-A-003: Duplicate meditation evidence (deduplicated by C2 identity) --
  {
    // C2 deduplicates - only one record arrives at C6
    const c5 = makeContext({
      effects: [
        ev('hediff:Hediff_Psylink:meditation', 'requiredActivity',
          { activity: 'meditation', obligation: 'required',
            satisfiesNeeds: ['recreation'], hours: 1,
            composition: { resolved: true, rule: 'singleSource' },
            provenance: { sourceKind: 'hediff', sourceId: 'Hediff_Psylink' } }),
      ],
    });
    const profile = Resolver.resolve(c5);
    ok(profile.activities.length === 1,
      'C6-A-003 deduplicated by C2 identity - one activity record');
  }

  // -- C6-A-004: Unknown activity type, two records --
  {
    const c5 = makeContext({
      effects: [
        ev('hediff:ModA:ritual', 'requiredActivity',
          { activity: 'ritual', obligation: 'recommended',
            satisfiesNeeds: [], hours: 1,
            composition: { resolved: false },
            provenance: { sourceKind: 'hediff', sourceId: 'ModA' } }),
        ev('hediff:ModB:ritual', 'requiredActivity',
          { activity: 'ritual', obligation: 'recommended',
            satisfiesNeeds: [], hours: 2,
            composition: { resolved: false },
            provenance: { sourceKind: 'hediff', sourceId: 'ModB' } }),
      ],
    });
    const profile = Resolver.resolve(c5);
    ok(profile.activities.length === 2,
      'C6-A-004a two activity records preserved');
    ok(profile.activities.every(function (a) { return a.compositionResolved === false; }),
      'C6-A-004b both have compositionResolved: false');
  }

  // =====================================================================
  // 10.6 Confidence/completeness
  // =====================================================================

  // -- C6-D-001: Fully verified, complete catalogues --
  {
    const c5 = makeContext();
    const profile = Resolver.resolve(c5);
    ok(profile.dimensions.rest.confidence === 'verified',
      'C6-D-001a rest confidence: verified');
    ok(profile.dimensions.rest.completeness === 'complete',
      'C6-D-001b rest completeness: complete');
    ok(profile.dimensions.recreation.confidence === 'verified',
      'C6-D-001c recreation confidence: verified');
    ok(profile.dimensions.recreation.completeness === 'complete',
      'C6-D-001d recreation completeness: complete');
    ok(profile.dimensions.windows.confidence === 'verified',
      'C6-D-001e windows confidence: verified');
    ok(profile.dimensions.windows.completeness === 'complete',
      'C6-D-001f windows completeness: complete');
    ok(profile.dimensions.conditions.confidence === 'verified',
      'C6-D-001g conditions confidence: verified');
    ok(profile.dimensions.conditions.completeness === 'complete',
      'C6-D-001h conditions completeness: complete');
    ok(profile.dimensions.activities.confidence === 'verified',
      'C6-D-001i activities confidence: verified');
    ok(profile.dimensions.activities.completeness === 'complete',
      'C6-D-001j activities completeness: complete');
  }

  // -- C6-D-002: Unknown rest modifier --
  {
    const partialFamily = JSON.parse(JSON.stringify(allComplete));
    partialFamily.geneFactors = { completeness: 'partial', byStatDef: { RestFallRateFactor: 'partial' }, evidence: [] };
    const c5 = makeContext({
      sourceFamilyCompleteness: partialFamily,
      temporalCoverage: {
        restNeed: { completeness: 'partial', unresolvedEvidence: [] },
        recreation: { completeness: 'complete', unresolvedEvidence: [] },
        windows: { completeness: 'complete', unresolvedEvidence: [] },
        conditions: { completeness: 'complete', unresolvedEvidence: [] },
        activities: { completeness: 'complete', unresolvedEvidence: [] },
      },
    });
    const profile = Resolver.resolve(c5);
    ok(profile.dimensions.rest.completeness === 'partial',
      'C6-D-002a rest completeness: partial');
    ok(profile.dimensions.windows.completeness === 'complete',
      'C6-D-002b windows completeness: complete (not cross-degraded)');
    ok(profile.dimensions.conditions.completeness === 'complete',
      'C6-D-002c conditions completeness: complete (not cross-degraded)');
  }

  // -- C6-D-003: Unknown window source --
  {
    const c5 = makeContext({
      temporalCoverage: {
        restNeed: { completeness: 'complete', unresolvedEvidence: [] },
        recreation: { completeness: 'complete', unresolvedEvidence: [] },
        windows: { completeness: 'partial', unresolvedEvidence: [
          { evidenceId: 'temporal:windows:modX:unknown', provenance: { sourceKind: 'mod', sourceId: 'modX' } },
        ] },
        conditions: { completeness: 'complete', unresolvedEvidence: [] },
        activities: { completeness: 'complete', unresolvedEvidence: [] },
      },
    });
    const profile = Resolver.resolve(c5);
    ok(profile.dimensions.windows.completeness === 'partial',
      'C6-D-003a windows completeness: partial');
    ok(profile.dimensions.rest.completeness === 'complete',
      'C6-D-003b rest completeness: complete (not cross-degraded)');
  }

  // -- C6-D-004: Mixed unknown sources --
  {
    const partialFamily = JSON.parse(JSON.stringify(allComplete));
    partialFamily.traitOffsets = { completeness: 'partial', byStatDef: { RestRateMultiplier: 'partial' }, evidence: [] };
    const c5 = makeContext({
      sourceFamilyCompleteness: partialFamily,
      temporalCoverage: {
        restNeed: { completeness: 'partial', unresolvedEvidence: [] },
        recreation: { completeness: 'complete', unresolvedEvidence: [] },
        windows: { completeness: 'partial', unresolvedEvidence: [] },
        conditions: { completeness: 'complete', unresolvedEvidence: [] },
        activities: { completeness: 'partial', unresolvedEvidence: [] },
      },
    });
    const profile = Resolver.resolve(c5);
    ok(profile.dimensions.rest.completeness === 'partial',
      'C6-D-004a rest independently degraded');
    ok(profile.dimensions.windows.completeness === 'partial',
      'C6-D-004b windows independently degraded');
    ok(profile.dimensions.activities.completeness === 'partial',
      'C6-D-004c activities independently degraded');
    ok(profile.dimensions.recreation.completeness === 'complete',
      'C6-D-004d recreation not degraded');
    ok(profile.dimensions.conditions.completeness === 'complete',
      'C6-D-004e conditions not degraded');
  }

  // -- C6-D-005: No rest modifiers, complete catalogues --
  {
    const c5 = makeContext();
    const profile = Resolver.resolve(c5);
    ok(profile.rest.restFallRateFactor && profile.rest.restFallRateFactor.resolvedPrefixValue === 1,
      'C6-D-005a RestFallRateFactor resolves to base 1.0');
    ok(profile.rest.restRateMultiplier && profile.rest.restRateMultiplier.resolvedPrefixValue === 1,
      'C6-D-005b RestRateMultiplier resolves to base 1.0');
    ok(profile.dimensions.rest.completeness === 'complete',
      'C6-D-005c rest completeness is complete');
  }

  // -- C6-D-006: Incomplete catalogues, no modifiers --
  {
    const partialFamily = JSON.parse(JSON.stringify(allComplete));
    partialFamily.geneFactors = { completeness: 'unknown', byStatDef: {}, evidence: [] };
    const c5 = makeContext({
      sourceFamilyCompleteness: partialFamily,
      temporalCoverage: {
        restNeed: { completeness: 'unknown', unresolvedEvidence: [] },
        recreation: { completeness: 'complete', unresolvedEvidence: [] },
        windows: { completeness: 'complete', unresolvedEvidence: [] },
        conditions: { completeness: 'complete', unresolvedEvidence: [] },
        activities: { completeness: 'complete', unresolvedEvidence: [] },
      },
    });
    const profile = Resolver.resolve(c5);
    ok(profile.dimensions.rest.completeness === 'unknown',
      'C6-D-006 rest completeness: unknown (cannot prove absence)');
  }

  // =====================================================================
  // 10.7 Invariant enforcement
  // =====================================================================

  // -- C6-I-001: No sleepHours field in canonical output --
  {
    const c5 = makeContext({
      effects: [
        ev('gene:low_sleep:sleepHoursOverride', 'sleepHoursOverride',
          { value: 6, provenance: { sourceKind: 'gene', sourceId: 'low_sleep' } }),
      ],
    });
    const profile = Resolver.resolve(c5);
    ok(!('sleepHours' in profile.rest),
      'C6-I-001 no sleepHours field in canonical rest profile');
  }

  // -- C6-I-002: No recreationHours or effectiveHours field --
  {
    const c5 = makeContext();
    const profile = Resolver.resolve(c5);
    ok(!('recreationHours' in profile.recreation),
      'C6-I-002a no recreationHours field');
    ok(!('effectiveHours' in profile.recreation),
      'C6-I-002b no effectiveHours field');
  }

  // -- C6-I-003: Depressive/Neurotic/break-risk produce no canonical output --
  {
    // No recreation evidence emitted by C2 for these traits
    const c5 = makeContext();
    const profile = Resolver.resolve(c5);
    ok(profile.recreation.recommendations.length === 0,
      'C6-I-003 no canonical recreation output for depressive/neurotic/break-risk');
  }

  // -- C6-I-004: No breakRisk field anywhere in profile --
  {
    const c5 = makeContext();
    const profile = Resolver.resolve(c5);
    const json = JSON.stringify(profile);
    ok(json.indexOf('breakRisk') === -1,
      'C6-I-004 no breakRisk field anywhere in profile');
  }

  // -- C6-I-005: UV evidence present for Undergrounder+UV pawn --
  {
    const c5 = makeContext({
      effects: [
        ev('xeno:dirtmole:uv', 'avoidCondition',
          { condition: 'daylight', fallbackHours: { start: 6, end: 18 }, weight: 4,
            provenance: { sourceKind: 'xenotype', sourceId: 'dirtmole' } }),
      ],
    });
    const profile = Resolver.resolve(c5);
    ok(profile.conditions.length === 1 && profile.conditions[0].condition === 'daylight',
      'C6-I-005 UV evidence present for undergrounder+UV pawn');
  }

  // -- C6-I-006: No lifeStage or bioAge field in C6 v1 output --
  {
    const c5 = makeContext();
    const profile = Resolver.resolve(c5);
    const json = JSON.stringify(profile);
    ok(json.indexOf('lifeStage') === -1,
      'C6-I-006a no lifeStage field');
    ok(json.indexOf('bioAge') === -1,
      'C6-I-006b no bioAge field');
  }

  // -- C6-I-007: No work budget, P1 count, downed check --
  {
    const c5 = makeContext();
    const profile = Resolver.resolve(c5);
    const json = JSON.stringify(profile);
    ok(json.indexOf('workBudget') === -1,
      'C6-I-007a no workBudget field');
    ok(json.indexOf('p1Count') === -1,
      'C6-I-007b no p1Count field');
    ok(json.indexOf('"downed"') === -1,
      'C6-I-007c no downed field');
  }

  // -- C6-I-008: Resolver does not read trait/gene/hediff/activity names (static source check) --
  {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'files', 'temporal-profile-resolver.js'), 'utf8');
    // Check no hardcoded trait/gene/hediff names
    const namePatterns = [
      'night_owl', 'quick_sleeper', 'QuickSleeper', 'body_mastery', 'BodyMastery',
      'ascetic', 'Ascetic', 'depressive', 'Depressive', 'neurotic', 'Neurotic',
      'gene_no_sleep', 'Hediff_Psylink', 'low_sleep', 'LowSleep',
      'dirtmole', 'undergrounder', 'Undergrounder',
    ];
    let nameFound = false;
    for (const name of namePatterns) {
      if (source.indexOf(name) !== -1) {
        nameFound = true;
        break;
      }
    }
    ok(!nameFound,
      'C6-I-008 resolver source contains no trait/gene/hediff/activity name strings');
  }

  // -- C6-I-009: Resolver does not branch on activity name for satisfiesNeeds (static source check) --
  {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'files', 'temporal-profile-resolver.js'), 'utf8');
    // Check no activity-name branching for satisfiesNeeds
    ok(source.indexOf('meditation') === -1,
      'C6-I-009a no "meditation" string in resolver');
    ok(source.indexOf('ritual') === -1,
      'C6-I-009b no "ritual" string in resolver');
    ok(source.indexOf('prayer') === -1,
      'C6-I-009c no "prayer" string in resolver');
    ok(source.indexOf('trance') === -1,
      'C6-I-009d no "trance" string in resolver');
  }

  // =====================================================================
  // Additional: unresolvedSources populated from stat frontiers
  // =====================================================================
  {
    const partialFamily = JSON.parse(JSON.stringify(allComplete));
    partialFamily.traitOffsets = { completeness: 'partial', byStatDef: { RestRateMultiplier: 'partial' }, evidence: [] };
    const c5 = makeContext({
      sourceFamilyCompleteness: partialFamily,
      temporalCoverage: {
        restNeed: { completeness: 'partial', unresolvedEvidence: [
          { evidenceId: 'temporal:restNeed:modX:unknown', provenance: { sourceKind: 'mod', sourceId: 'modX' } },
        ] },
        recreation: { completeness: 'complete', unresolvedEvidence: [] },
        windows: { completeness: 'complete', unresolvedEvidence: [] },
        conditions: { completeness: 'complete', unresolvedEvidence: [] },
        activities: { completeness: 'complete', unresolvedEvidence: [] },
      },
    });
    const profile = Resolver.resolve(c5);
    ok(profile.dimensions.rest.unresolvedSources.length > 0,
      'unresolvedSources populated from temporalCoverage + stat frontiers');
  }

  // =====================================================================
  // Additional: suppressed needState -> compatibility sleepHoursOverride = 0
  // =====================================================================
  {
    const c5 = makeContext({
      effects: [
        ev('gene:gene_no_sleep:needSuppression:Rest', 'needSuppression',
          { target: 'Rest', value: true,
            provenance: { sourceKind: 'gene', sourceId: 'gene_no_sleep' } }),
        ev('gene:gene_no_sleep:sleepHoursOverride', 'sleepHoursOverride',
          { value: 0, provenance: { sourceKind: 'gene', sourceId: 'gene_no_sleep' } }),
      ],
    });
    const profile = Resolver.resolve(c5);
    ok(profile.rest.compatibility.sleepHoursOverride === 0,
      'suppressed needState yields compatibility sleepHoursOverride = 0');
  }

  // =====================================================================
  // Additional: output is frozen (pure function, no mutation)
  // =====================================================================
  {
    const c5 = makeContext();
    const profile = Resolver.resolve(c5);
    ok(Object.isFrozen(profile), 'output profile is frozen');
    ok(Object.isFrozen(profile.rest), 'rest profile is frozen');
    ok(Object.isFrozen(profile.dimensions), 'dimensions object is frozen');
  }

  // =====================================================================
  // Additional: stable evidenceId preserved in output references
  // =====================================================================
  {
    const c5 = makeContext({
      effects: [
        ev('xeno:dirtmole:uv', 'avoidCondition',
          { condition: 'daylight', fallbackHours: { start: 6, end: 18 }, weight: 4,
            provenance: { sourceKind: 'xenotype', sourceId: 'dirtmole' } }),
      ],
    });
    const profile = Resolver.resolve(c5);
    ok(profile.conditions[0].source.evidenceId === 'xeno:dirtmole:uv',
      'stable evidenceId preserved in condition source');
  }

  // =====================================================================
  // Additional: multiple sleepHoursOverride from independent sources -> null
  // =====================================================================
  {
    const c5 = makeContext({
      effects: [
        ev('gene:a:sleepHoursOverride', 'sleepHoursOverride',
          { value: 6, provenance: { sourceKind: 'gene', sourceId: 'a' } }),
        ev('gene:b:sleepHoursOverride', 'sleepHoursOverride',
          { value: 4, provenance: { sourceKind: 'gene', sourceId: 'b' } }),
      ],
    });
    const profile = Resolver.resolve(c5);
    ok(profile.rest.compatibility.sleepHoursOverride === null,
      'multiple independent sleepHoursOverride yields null (ambiguous)');
    ok(profile.rest.compatibility.overrideSources.length === 2,
      'both override sources listed');
  }

  // =====================================================================
  // Additional: resolver does not read c4RequirementSnapshot
  // =====================================================================
  {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'files', 'temporal-profile-resolver.js'), 'utf8');
    ok(source.indexOf('c4RequirementSnapshot') === -1,
      'resolver does not read c4RequirementSnapshot');
  }

  return { name: 'C6 TemporalProfileResolver', total, failures };
};

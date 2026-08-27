/** C6 temporal profile resolver - pure shadow module. */
const TemporalProfileResolver = (() => {
  const CONFIDENCE_RANK = Object.freeze({
    verified: 0, derived: 1, inferred: 2, unknown: 3,
  });
  const COMPLETENESS_RANK = Object.freeze({
    complete: 0, partial: 1, unknown: 2,
  });

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!value || typeof value !== 'object') return value;
    const output = {};
    for (const key of Object.keys(value)) output[key] = clone(value[key]);
    return output;
  }

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const key of Object.keys(value)) freeze(value[key]);
    return Object.freeze(value);
  }

  function evidenceRef(evidence) {
    if (!evidence) return { evidenceId: null, provenance: null };
    return { evidenceId: evidence.evidenceId || null, provenance: clone(evidence.provenance) || null };
  }

  function worstConfidence(a, b) {
    const ra = CONFIDENCE_RANK[a] != null ? CONFIDENCE_RANK[a] : 3;
    const rb = CONFIDENCE_RANK[b] != null ? CONFIDENCE_RANK[b] : 3;
    return ra >= rb ? a : b;
  }

  function worstCompleteness(a, b) {
    const ra = COMPLETENESS_RANK[a] != null ? COMPLETENESS_RANK[a] : 2;
    const rb = COMPLETENESS_RANK[b] != null ? COMPLETENESS_RANK[b] : 2;
    return ra >= rb ? a : b;
  }

  function normaliseCompleteness(value) {
    if (value === 'complete' || value === 'partial' || value === 'unknown') return value;
    return 'unknown';
  }

  function collectByType(effects, type) {
    return (effects || []).filter(function (e) { return e && e.type === type; });
  }

  function temporalCoverageFamily(coverage, family) {
    if (!coverage || !coverage[family] || typeof coverage[family] !== 'object') {
      return { completeness: 'unknown', unresolvedEvidence: [] };
    }
    return coverage[family];
  }

  // --- 5.1 Rest dimension ---
  function resolveRest(c5Context) {
    var evidence = c5Context.pawnEvidence || {};
    var effects = evidence.effects || [];
    var coverage = evidence.temporalCoverage || {};
    var restCoverage = temporalCoverageFamily(coverage, 'restNeed');

    // 1. Determine needState from typed evidence
    var suppressions = collectByType(effects, 'needSuppression').filter(function (e) {
      return e.target === 'Rest' && e.value === true;
    });
    var needState;
    var needStateProvenance = [];
    if (suppressions.length > 0) {
      needState = 'suppressed';
      needStateProvenance = suppressions.map(evidenceRef);
    } else if (normaliseCompleteness(restCoverage.completeness) === 'complete') {
      needState = 'required';
    } else {
      needState = 'unknown';
    }

    // 2-3. Route rest stats through C5 stat resolver
    var restFallRateFactor = StructuralStatResolver.resolve(c5Context, 'RestFallRateFactor');
    var restRateMultiplier = StructuralStatResolver.resolve(c5Context, 'RestRateMultiplier');

    // 4. Collect legacy sleepHoursOverride
    var overrides = collectByType(effects, 'sleepHoursOverride');
    var sleepHoursOverride = null;
    var overrideSources = overrides.map(evidenceRef);
    if (needState === 'suppressed') {
      sleepHoursOverride = 0;
    } else if (overrides.length === 1) {
      sleepHoursOverride = overrides[0].value;
    } else if (overrides.length > 1) {
      sleepHoursOverride = null; // ambiguous
    }

    // 5. Dimension confidence/completeness
    var restConfidence = 'verified';
    var restCompleteness = normaliseCompleteness(restCoverage.completeness);
    var restUnresolved = clone(restCoverage.unresolvedEvidence || []);

    // Degrade based on stat evaluation state
    if (restFallRateFactor && restFallRateFactor.frontier) {
      restCompleteness = worstCompleteness(restCompleteness, 'partial');
      restConfidence = worstConfidence(restConfidence, 'unknown');
      if (restFallRateFactor.frontier.operation) {
        restUnresolved.push(evidenceRef(restFallRateFactor.frontier.operation));
      }
    }
    if (restRateMultiplier && restRateMultiplier.frontier) {
      restCompleteness = worstCompleteness(restCompleteness, 'partial');
      restConfidence = worstConfidence(restConfidence, 'unknown');
      if (restRateMultiplier.frontier.operation) {
        restUnresolved.push(evidenceRef(restRateMultiplier.frontier.operation));
      }
    }

    // If needState is unknown, confidence degrades
    if (needState === 'unknown') {
      restConfidence = worstConfidence(restConfidence, 'inferred');
    }

    return {
      profile: {
        needState: needState,
        restFallRateFactor: restFallRateFactor || null,
        restRateMultiplier: restRateMultiplier || null,
        needStateProvenance: needStateProvenance,
        compatibility: {
          sleepHoursOverride: sleepHoursOverride,
          overrideSources: overrideSources,
        },
      },
      dimension: {
        confidence: restConfidence,
        completeness: restCompleteness,
        unresolvedSources: restUnresolved,
      },
    };
  }

  // --- 5.2 Recreation dimension ---
  function resolveRecreation(c5Context) {
    var evidence = c5Context.pawnEvidence || {};
    var effects = evidence.effects || [];
    var coverage = evidence.temporalCoverage || {};
    var recCoverage = temporalCoverageFamily(coverage, 'recreation');

    // 1. No vanilla joy fall rate stat modifiers
    var joyNeedModifiers = null;

    // 2. Collect recreationHoursRecommendation
    var recEvidence = collectByType(effects, 'recreationHoursRecommendation');
    var recommendations = recEvidence.map(function (e) {
      return {
        delta: e.delta || 0,
        kind: 'recommendation',
        source: evidenceRef(e),
      };
    });

    // 3. Confidence/completeness from coverage
    var recCompleteness = normaliseCompleteness(recCoverage.completeness);
    var recConfidence = recCompleteness === 'complete' ? 'verified'
      : recCompleteness === 'partial' ? 'inferred' : 'unknown';
    var recUnresolved = clone(recCoverage.unresolvedEvidence || []);

    return {
      profile: {
        joyNeedModifiers: joyNeedModifiers,
        recommendations: recommendations,
      },
      dimension: {
        confidence: recConfidence,
        completeness: recCompleteness,
        unresolvedSources: recUnresolved,
      },
    };
  }

  // --- 5.3 Temporal windows ---
  function resolveWindows(c5Context) {
    var evidence = c5Context.pawnEvidence || {};
    var effects = evidence.effects || [];
    var coverage = evidence.temporalCoverage || {};
    var winCoverage = temporalCoverageFamily(coverage, 'windows');

    var avoidHours = collectByType(effects, 'avoidHours');
    var preferHours = collectByType(effects, 'preferHours');

    var windows = [];
    for (var i = 0; i < avoidHours.length; i++) {
      windows.push({
        hours: clone(avoidHours[i].hours || []),
        kind: 'avoid',
        source: evidenceRef(avoidHours[i]),
        policy: { weight: avoidHours[i].weight || 0 },
      });
    }
    for (var j = 0; j < preferHours.length; j++) {
      windows.push({
        hours: clone(preferHours[j].hours || []),
        kind: 'prefer',
        source: evidenceRef(preferHours[j]),
        policy: { weight: preferHours[j].weight || 0 },
      });
    }

    var winCompleteness = normaliseCompleteness(winCoverage.completeness);
    var winConfidence = winCompleteness === 'complete' ? 'verified'
      : winCompleteness === 'partial' ? 'inferred' : 'unknown';
    var winUnresolved = clone(winCoverage.unresolvedEvidence || []);

    return {
      windows: windows,
      dimension: {
        confidence: winConfidence,
        completeness: winCompleteness,
        unresolvedSources: winUnresolved,
      },
    };
  }

  // --- 5.4 Avoid conditions ---
  function resolveConditions(c5Context) {
    var evidence = c5Context.pawnEvidence || {};
    var effects = evidence.effects || [];
    var coverage = evidence.temporalCoverage || {};
    var condCoverage = temporalCoverageFamily(coverage, 'conditions');

    var condEvidence = collectByType(effects, 'avoidCondition');
    var conditions = condEvidence.map(function (e) {
      return {
        condition: e.condition || '',
        source: evidenceRef(e),
        policy: {
          fallbackHours: e.fallbackHours ? clone(e.fallbackHours) : { start: 0, end: 0 },
          weight: e.weight || 0,
        },
      };
    });

    var condCompleteness = normaliseCompleteness(condCoverage.completeness);
    var condConfidence = condCompleteness === 'complete' ? 'verified'
      : condCompleteness === 'partial' ? 'inferred' : 'unknown';
    var condUnresolved = clone(condCoverage.unresolvedEvidence || []);

    return {
      conditions: conditions,
      dimension: {
        confidence: condConfidence,
        completeness: condCompleteness,
        unresolvedSources: condUnresolved,
      },
    };
  }

  // --- 5.5 Activities ---
  function resolveActivities(c5Context) {
    var evidence = c5Context.pawnEvidence || {};
    var effects = evidence.effects || [];
    var coverage = evidence.temporalCoverage || {};
    var actCoverage = temporalCoverageFamily(coverage, 'activities');

    var actEvidence = collectByType(effects, 'requiredActivity');
    var activities = actEvidence.map(function (e) {
      var compositionResolved = e.composition && e.composition.resolved === true;
      return {
        activity: e.activity || '',
        obligation: e.obligation === 'required' ? 'required' : 'recommended',
        satisfiesNeeds: Array.isArray(e.satisfiesNeeds) ? clone(e.satisfiesNeeds) : [],
        compositionResolved: compositionResolved,
        source: evidenceRef(e),
        policy: { recommendedHours: e.hours || 0 },
      };
    });

    var actCompleteness = normaliseCompleteness(actCoverage.completeness);
    var actConfidence = actCompleteness === 'complete' ? 'verified'
      : actCompleteness === 'partial' ? 'inferred' : 'unknown';
    var actUnresolved = clone(actCoverage.unresolvedEvidence || []);

    // Degrade completeness if any activity has unresolved composition
    for (var i = 0; i < activities.length; i++) {
      if (!activities[i].compositionResolved) {
        actCompleteness = worstCompleteness(actCompleteness, 'partial');
        break;
      }
    }

    return {
      activities: activities,
      dimension: {
        confidence: actConfidence,
        completeness: actCompleteness,
        unresolvedSources: actUnresolved,
      },
    };
  }

  // --- 5.7 Assemble ---
  function resolve(c5Context) {
    var ctx = c5Context || {};
    var rest = resolveRest(ctx);
    var recreation = resolveRecreation(ctx);
    var windowsResult = resolveWindows(ctx);
    var conditionsResult = resolveConditions(ctx);
    var activitiesResult = resolveActivities(ctx);

    return freeze({
      rest: rest.profile,
      recreation: recreation.profile,
      windows: windowsResult.windows,
      conditions: conditionsResult.conditions,
      activities: activitiesResult.activities,
      dimensions: {
        rest: rest.dimension,
        recreation: recreation.dimension,
        windows: windowsResult.dimension,
        conditions: conditionsResult.dimension,
        activities: activitiesResult.dimension,
      },
    });
  }

  return Object.freeze({ resolve: resolve });
})();

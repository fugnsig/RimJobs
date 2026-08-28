/**
 * @deprecated for canonical calculation. Retained through C8 as the explicit
 * owner of frozen C7 numeric ranking/work-speed compatibility projections and
 * as executable C5 migration evidence. Do not add canonical consumers.
 */
const C5LegacyCompatibility = (() => {
  const namedDeltaCodes = Object.freeze([
    'creationGainAlreadyPersisted',
    'runtimeGeneAptitude',
    'anomalyHediffAptitude',
    'totalDisablementProjection',
    'ideologyIntellectualId',
    'unknownDefinition',
    'unknownModdedPassion',
    'stackedGlobalLearningOffsets',
    'workSpeedGlobalFinalization',
    'cookSpeedOperationOrder',
    'miningPluralFacets',
    'fishingSkillAndStat',
    'unsupportedAppJob',
    'capacityInputPrecision',
  ]);
  const named = new Set(namedDeltaCodes);

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

  function evaluateLegacySkill(pawn, skillId) {
    return App.effectiveSkill(pawn, skillId);
  }

  function evaluateLegacyGlobalWorkSpeed(pawn) {
    return Engine.calculateWorkSpeedMod(pawn);
  }

  function evaluateLegacyJobWorkSpeed(pawn, job) {
    return Engine.calculateRealWorkSpeed(pawn, job);
  }

  function evaluateLegacyPassion(pawn, skillId) {
    const rawIdentity = App._passionValue(pawn, skillId);
    return { rawIdentity, metadata: App._passionMeta(rawIdentity) };
  }

  function sameValue(left, right) {
    if (Object.is(left, right)) return true;
    try { return JSON.stringify(left) === JSON.stringify(right); }
    catch (_) { return false; }
  }

  function compare(input) {
    const value = input || {};
    const hasCanonicalValue = Object.prototype.hasOwnProperty.call(value, 'canonicalValue');
    const hasLegacyValue = Object.prototype.hasOwnProperty.call(value, 'legacyValue');
    const left = hasCanonicalValue ? value.canonicalValue : value.canonical;
    const right = hasLegacyValue ? value.legacyValue : value.legacy;
    const same = sameValue(left, right);
    const requested = value.deltaCode || null;
    const deltaCode = same ? 'parity'
      : named.has(requested) ? requested : 'unnamedDifference';
    return freeze({
      schemaVersion: 1,
      caseId: value.caseId || null,
      dimension: value.dimension || null,
      canonical: clone(value.canonical),
      legacy: clone(value.legacy),
      same,
      deltaCode,
      compatibilityOnly: true,
    });
  }

  return Object.freeze({
    namedDeltaCodes,
    evaluateLegacySkill,
    evaluateLegacyGlobalWorkSpeed,
    evaluateLegacyJobWorkSpeed,
    evaluateLegacyPassion,
    compare,
  });
})();

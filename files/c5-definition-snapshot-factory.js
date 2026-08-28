/** C5-owned production bridge from definition scanner output to immutable registry snapshot. */
const C5DefinitionSnapshotFactory = (() => {
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(freeze);
    return Object.freeze(value);
  }

  function runtimeCompatibility(provider) {
    const expected = C5RuntimeContract.runtime;
    const actual = provider && provider.runtimeFingerprint;
    if (!actual || typeof actual !== 'object') {
      return freeze({ state: 'unknown', reason: 'missingRuntimeFingerprint', expected, actual: null });
    }
    const versionMatches = actual.displayVersion === expected.displayVersion
      && actual.version === expected.version && actual.revision === expected.revision;
    const assemblyMatches = typeof actual.assemblySha256 === 'string'
      && actual.assemblySha256.toUpperCase() === expected.assemblySha256.toUpperCase();
    if (!versionMatches || !assemblyMatches) {
      return freeze({ state: 'incompatible', reason: !versionMatches
        ? 'runtimeVersionMismatch' : 'runtimeAssemblyMismatch', expected, actual });
    }
    return freeze({ state: 'compatible', reason: null, expected, actual });
  }

  function createSnapshot(effectivenessProvider) {
    if (!effectivenessProvider || effectivenessProvider.pawnIndependent !== true) return null;
    if (runtimeCompatibility(effectivenessProvider).state !== 'compatible') return null;
    return EffectivenessDefinitionRegistry.createSnapshot(
      effectivenessProvider, C5RuntimeContract);
  }

  return Object.freeze({ runtimeCompatibility, createSnapshot });
})();

/**
 * C4 shadow-only compatibility surface.
 *
 * Legacy truth delegates to the frozen C1 production functions. Canonical
 * reports are compared without changing, replacing, or feeding those callers.
 */
const C4LegacyCompatibility = (() => {
  function evaluateLegacyPermission(pawn, job) {
    return Engine.evaluateJobPermission(pawn, job);
  }

  function evaluateLegacyIncapable(pawn, job) {
    return App.isIncapable(pawn, job);
  }

  function projectCanonicalIncapable(permission, availability) {
    return !!(permission && permission.state === 'blocked')
      || !!(availability && availability.state === 'unavailable');
  }

  function compare(input) {
    const value = input || {};
    const permission = value.permission || null;
    const availability = value.availability || null;
    const legacy = value.legacy || {};
    const canonicalIncapable = projectCanonicalIncapable(permission, availability);
    const legacyIncapable = legacy.incapable === true;
    const sameIncapable = canonicalIncapable === legacyIncapable;
    const permissionState = permission ? permission.state : null;
    const availabilityState = availability ? availability.state : null;

    let deltaCode = 'parity';
    if (legacyIncapable && !canonicalIncapable) {
      deltaCode = 'legacyBlockedCanonicalNotBlocked';
    } else if (!legacyIncapable && canonicalIncapable) {
      deltaCode = 'canonicalBlockedLegacyNotBlocked';
    } else if (permissionState === 'allowed' && availabilityState === 'unavailable'
        && legacy.permission && legacy.permission.status === 'blocked') {
      deltaCode = 'legacyPermissionBlockCanonicalAvailabilityBlock';
    } else if (permissionState === 'unknown' || availabilityState === 'unknown') {
      deltaCode = 'canonicalUnknownLegacyAllowed';
    }

    return {
      schemaVersion: 1,
      caseId: value.caseId || null,
      canonical: {
        permissionState,
        availabilityState,
        incapable: canonicalIncapable,
      },
      legacy: {
        permission: legacy.permission || null,
        incapable: legacyIncapable,
      },
      sameIncapable,
      deltaCode,
    };
  }

  return Object.freeze({
    evaluateLegacyPermission,
    evaluateLegacyIncapable,
    projectCanonicalIncapable,
    compare,
  });
})();

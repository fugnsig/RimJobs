/**
 * C3 body identity and capacity resolution boundary.
 *
 * This module is definition-driven. Race and body names are opaque identifiers;
 * semantic decisions come from scanned metadata and completeness markers.
 */
const CapacityResolver = {
  _unknownIdentity(completeness, diagnostics) {
    return {
      state: 'unknown',
      defName: null,
      bodyDef: null,
      completeness: completeness || 'unknown',
      source: null,
      diagnostics: diagnostics || [],
    };
  },

  resolveBodyIdentity(pawnEvidence, definitions) {
    const defs = definitions || {};
    const raceBodyMap = defs.raceBodyMap || {};
    const bodyDefs = defs.bodyDefs || {};
    const bodyEvidence = pawnEvidence && Array.isArray(pawnEvidence.bodyEvidence)
      ? pawnEvidence.bodyEvidence
      : [];
    const raceDefName = pawnEvidence && pawnEvidence.pawnState
      ? pawnEvidence.pawnState.raceDefName
      : null;
    const mapping = raceDefName ? raceBodyMap[raceDefName] : null;
    const diagnostics = [];

    const explicitNames = [];
    for (let i = 0; i < bodyEvidence.length; i++) {
      const obs = bodyEvidence[i] || {};
      if (obs.bodyDefReference !== 'explicit' || !obs.bodyDefName) continue;
      if (explicitNames.indexOf(obs.bodyDefName) < 0) explicitNames.push(obs.bodyDefName);
    }
    if (explicitNames.length > 1) {
      return this._unknownIdentity('unknown', ['conflictingExplicitBodyEvidence']);
    }
    const explicitName = explicitNames.length ? explicitNames[0] : null;

    if (mapping && mapping._completeness === 'complete' && mapping.bodyDefName) {
      if (explicitName && explicitName !== mapping.bodyDefName) {
        return this._unknownIdentity('unknown', ['raceAndExplicitBodyConflict']);
      }
      const mappedBody = bodyDefs[mapping.bodyDefName];
      if (mappedBody && mappedBody._completeness === 'complete') {
        return {
          state: 'resolved',
          defName: mapping.bodyDefName,
          bodyDef: mappedBody,
          completeness: 'complete',
          source: 'raceDefinition',
          diagnostics: diagnostics,
        };
      }

      const compatibilityBodies = defs.legacyBodyDefs || {};
      const fallbackBody = mapping.legacyIndexFallback
        ? compatibilityBodies[mapping.legacyIndexFallback]
        : null;
      if (fallbackBody && fallbackBody._completeness === 'complete') {
        return {
          state: 'resolved',
          defName: mapping.bodyDefName || fallbackBody.defName || null,
          bodyDef: fallbackBody,
          completeness: 'complete',
          source: 'legacyCompatibility',
          diagnostics: ['canonicalBodyDefinitionUnavailable'],
        };
      }
      diagnostics.push('bodyDefinitionUnavailableOrIncomplete');
    } else if (mapping) {
      diagnostics.push('raceBodyMappingIncomplete');
    } else if (raceDefName) {
      diagnostics.push('raceBodyMappingUnavailable');
    } else {
      diagnostics.push('raceIdentityUnavailable');
    }

    if (explicitName) {
      const explicitBody = bodyDefs[explicitName];
      if (explicitBody && explicitBody._completeness === 'complete') {
        return {
          state: 'resolved',
          defName: explicitName,
          bodyDef: explicitBody,
          completeness: 'complete',
          source: 'explicitBodyEvidence',
          diagnostics: diagnostics,
        };
      }
      diagnostics.push('explicitBodyDefinitionUnavailableOrIncomplete');
    }

    const completeness = mapping && mapping._completeness === 'partial'
      ? 'partial'
      : 'unknown';
    return this._unknownIdentity(completeness, diagnostics);
  },

  buildPartIndex(bodyDef) {
    const parts = [];
    const walk = (node, parentIndex) => {
      if (!node) return;
      const index = parts.length;
      parts.push({
        index: index,
        parentIndex: parentIndex,
        defName: node.def || null,
        node: node,
      });
      const children = Array.isArray(node.parts) ? node.parts : [];
      for (let i = 0; i < children.length; i++) walk(children[i], index);
    };
    if (bodyDef && bodyDef.corePart) walk(bodyDef.corePart, -1);
    Object.defineProperty(parts, 'completeness', {
      value: bodyDef && bodyDef._completeness ? bodyDef._completeness : 'unknown',
      enumerable: false,
    });
    return parts;
  },

  joinObservations(bodyEvidence, bodyIdentity, partIndex) {
    const observations = Array.isArray(bodyEvidence) ? bodyEvidence : [];
    const index = Array.isArray(partIndex) ? partIndex : [];
    return observations.map(obsValue => {
      const obs = obsValue || {};
      const joined = Object.assign({}, obs);
      if (obs.rawPartIndex == null) {
        joined.joinState = 'noPartRef';
        return joined;
      }
      if (!bodyIdentity || bodyIdentity.state !== 'resolved') {
        joined.joinState = 'bodyUnknown';
        return joined;
      }
      if (obs.bodyDefReference === 'explicit') {
        if (!obs.bodyDefName || obs.bodyDefName !== bodyIdentity.defName) {
          joined.joinState = 'bodyConflict';
          return joined;
        }
      } else if (obs.bodyDefReference !== 'pawnDefault') {
        joined.joinState = 'bodyUnknown';
        return joined;
      }
      if (bodyIdentity.completeness !== 'complete' || index.completeness !== 'complete') {
        joined.joinState = 'indexUnreliable';
        return joined;
      }
      if (!Number.isInteger(obs.rawPartIndex)
        || obs.rawPartIndex < 0
        || obs.rawPartIndex >= index.length) {
        joined.joinState = 'indexOutOfRange';
        return joined;
      }
      const part = index[obs.rawPartIndex];
      joined.joinState = 'resolved';
      joined.partIdentity = {
        bodyDef: bodyIdentity.defName,
        partIndex: obs.rawPartIndex,
      };
      joined.partRecord = part;
      joined.bodyPartDefName = part.defName;
      return joined;
    });
  },

  resolvePawnCapacities(pawnEvidence, definitions) {
    const bodyIdentity = this.resolveBodyIdentity(pawnEvidence, definitions);
    const partIndex = bodyIdentity.state === 'resolved'
      ? this.buildPartIndex(bodyIdentity.bodyDef)
      : [];
    const joinedObservations = this.joinObservations(
      pawnEvidence && pawnEvidence.bodyEvidence,
      bodyIdentity,
      partIndex
    );
    return {
      bodyIdentity: bodyIdentity,
      partIndex: partIndex,
      joinedObservations: joinedObservations,
      capacities: {},
    };
  },
};

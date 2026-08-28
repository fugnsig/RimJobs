const { loadScripts } = require('./_harness');

module.exports = function run() {
  let total = 0;
  let failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) {
      failures++;
      console.log('  FAIL ' + label);
    }
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
    getIdeoEffects() {
      return { mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 0, researchSpeed: 0 };
    },
    _passionMeta() { return { bucket: 0 }; },
    _passionValue() { return 0; },
    _manipulationLost() { return false; },
    isIncapable() { return false; },
  };

  const ctx = loadScripts([
    'data.js', 'engine.js', 'capability-evidence.js',
    'requirement-registry.js', 'permission-resolver.js',
    'availability-resolver.js', 'capacity-resolver.js',
    'c4-evaluation-context.js', 'c5-evaluation-context.js',
    'structural-stat-resolver.js', 'temporal-profile-resolver.js',
    'c7-evaluation-coordinator.js',
  ], { App });
  const Coordinator = ctx.C7EvaluationCoordinator;

  const mkPawn = (id, overrides) => Object.assign({
    id, traits: [], traitRuntimeFacts: [], geneRuntimeFacts: [],
    health: [], skills: {}, passions: {}, incapable: [], permissionSources: [],
    childhood: null, adulthood: null, role: 'none', downed: false,
  }, overrides || {});

  const definitionSnapshot = ctx.RequirementRegistry.createSnapshot({
    jobCatalog: [{ id: 'mining' }, { id: 'hauling' }],
    activePackageIds: { ids: [], completeness: 'complete', reasons: [] },
  });
  const options = { definitionSnapshot };

  {
    const pawnContext = Coordinator.createPawnContext(mkPawn('contract-1'), options);
    ok(Object.isFrozen(pawnContext), 'C7-COORD-001 context is frozen');
    ok(pawnContext.pawnId === 'contract-1', 'C7-COORD-001 pawn id is normalised');
    ok(Object.isFrozen(pawnContext.pawnEvidence), 'C7-COORD-001 evidence is frozen');
    ok(Object.isFrozen(pawnContext.structuralCapacities), 'C7-COORD-001 capacities are frozen');
  }

  {
    const pawnContext = Coordinator.createPawnContext(mkPawn('contract-2'), options);
    const permission = pawnContext.permission({ id: 'mining' });
    const availability = pawnContext.availability({ id: 'mining' });
    ok(permission && typeof permission.state === 'string', 'C7-COORD-002 permission has state');
    ok(['allowed', 'blocked', 'unknown'].includes(permission.state),
      'C7-COORD-002 permission state is tri-state');
    ok(availability && typeof availability.state === 'string',
      'C7-COORD-003 availability has state');
    ok(['available', 'unavailable', 'unknown'].includes(availability.state),
      'C7-COORD-003 availability state is tri-state');
  }

  {
    const pawnContext = Coordinator.createPawnContext(mkPawn('memo-1'), options);
    const job = { id: 'hauling' };
    ok(pawnContext.permission(job) === pawnContext.permission(job),
      'C7-COORD-004 permission is memoised per job');
    ok(pawnContext.availability(job) === pawnContext.availability(job),
      'C7-COORD-005 availability is memoised per job');
    ok(pawnContext.permission('hauling') === pawnContext.permission(job),
      'C7-COORD-005 string and object job ids share memo entry');
  }

  {
    const pawn = mkPawn('scope-1');
    const job = { id: 'hauling' };
    const first = Coordinator.createPawnContext(pawn, options);
    const second = Coordinator.createPawnContext(pawn, options);
    ok(first !== second, 'C7-COORD-006 contexts are request scoped');
    ok(first.permission(job) !== second.permission(job),
      'C7-COORD-006 permission memo does not cross contexts');
    ok(first.availability(job) !== second.availability(job),
      'C7-COORD-006 availability memo does not cross contexts');
  }

  {
    const pawnContext = Coordinator.createPawnContext(mkPawn('c5-1'), options);
    ok(Object.isFrozen(pawnContext.c5Context), 'C7-COORD-007 C5 context is frozen');
    ok(pawnContext.pawnEvidence === pawnContext.c5Context.pawnEvidence,
      'C7-COORD-007 C5 reuses shared C2 evidence');
    ok(pawnContext.structuralCapacities === pawnContext.c5Context.structuralCapacities,
      'C7-COORD-007 C5 reuses shared C3 capacities');
    ok(pawnContext.c5Context.pawnId === 'c5-1', 'C7-COORD-007 C5 pawn id matches');
  }

  {
    const pawnContext = Coordinator.createPawnContext(mkPawn('temporal-1'), options);
    const first = pawnContext.temporalProfile();
    const second = pawnContext.temporalProfile();
    ok(first && typeof first === 'object', 'C7-COORD-008 temporal profile resolves');
    ok(first === second, 'C7-COORD-008 temporal profile is lazy-memoised in request');
    ok(first.rest && typeof first.rest.needState === 'string',
      'C7-COORD-008 temporal profile exposes rest state');
    ok(first.dimensions && first.dimensions.rest,
      'C7-COORD-008 temporal profile exposes dimension quality');
  }

  {
    const pawnContext = Coordinator.createPawnContext(mkPawn('downed-1', {
      downed: true,
      currentStatusSources: { facts: {
        downed: { state: 'known', value: true, evidence: [] },
        deactivated: { state: 'known', value: false, evidence: [] },
      } },
    }), options);
    const availability = pawnContext.availability({ id: 'mining' });
    ok(availability.state === 'unavailable', 'C7-COORD-009 downed pawn is unavailable');
    ok(availability.blockers.some(item => item.requirementId === 'currentStatus:downed'),
      'C7-COORD-009 downed blocker is provenance-bearing C4 evidence');
    ok(pawnContext.permission({ id: 'hauling' }).state !== 'blocked',
      'C7-COORD-010 downed is not converted to a permission block');
  }

  {
    const pawnContext = Coordinator.createPawnContext(mkPawn('closed-1'), options);
    ok(!Object.prototype.hasOwnProperty.call(pawnContext, 'legacyShadow'),
      'C7-COORD-011 production context exposes canonical facts only');
  }

  {
    const coverage = {
      restNeed: { completeness: 'partial', unresolvedEvidence: [{ reasonCode: 'fixture' }] },
    };
    const pawnContext = Coordinator.createPawnContext(mkPawn('coverage-1'), {
      definitionSnapshot,
      evidenceOptions: { temporalCoverage: coverage },
    });
    ok(pawnContext.pawnEvidence.temporalCoverage.restNeed.completeness === 'partial',
      'C7-COORD-012 caller temporal coverage is forwarded');
    ok(pawnContext.temporalProfile().dimensions.rest.completeness === 'partial',
      'C7-COORD-012 resolver retains forwarded completeness');
    const unknownContext = Coordinator.createPawnContext(mkPawn('coverage-2'), options);
    ok(unknownContext.temporalProfile().dimensions.rest.completeness === 'unknown',
      'C7-COORD-012 missing coverage remains unknown');
  }

  {
    let c2Calls = 0;
    let c3Calls = 0;
    let c6Calls = 0;
    const sharedEvidence = { pawnState: { currentStatusFacts: {} } };
    const sharedCapacities = { capacities: {} };
    const isolated = loadScripts(['c7-evaluation-coordinator.js'], {
      CapabilityEvidence: {
        collectPawnEvidence() { c2Calls++; return sharedEvidence; },
      },
      CapacityResolver: {
        resolvePawnCapacities() { c3Calls++; return sharedCapacities; },
      },
      C4EvaluationContext: {
        _deriveAwakeFacts(facts) { return facts; },
      },
      StructuralEffectivenessContext: {
        _deepFreeze(value) { return Object.freeze(value); },
        fromResolved(input) {
          return Object.freeze({
            pawnId: String(input.pawnId),
            pawnEvidence: input.pawnEvidence,
            structuralCapacities: input.structuralCapacities,
          });
        },
      },
      PermissionResolver: { resolve() { return { state: 'allowed' }; } },
      AvailabilityResolver: { resolve() { return { state: 'available' }; } },
      TemporalProfileResolver: { resolve() { c6Calls++; return Object.freeze({}); } },
    }).C7EvaluationCoordinator;
    const pawnContext = isolated.createPawnContext({ id: 'instrumented' });
    ok(c2Calls === 1, 'C7-COORD-013 C2 runs exactly once per context');
    ok(c3Calls === 1, 'C7-COORD-013 C3 runs exactly once per context');
    ok(c6Calls === 0, 'C7-COORD-013 C6 is lazy');
    pawnContext.temporalProfile();
    pawnContext.temporalProfile();
    ok(c6Calls === 1, 'C7-COORD-013 C6 runs once per context');
    ok(pawnContext.pawnEvidence === pawnContext.c5Context.pawnEvidence,
      'C7-COORD-013 instrumented C5 shares evidence reference');
    ok(pawnContext.structuralCapacities === pawnContext.c5Context.structuralCapacities,
      'C7-COORD-013 instrumented C5 shares capacities reference');
  }

  return { name: 'C7 evaluation coordinator', total, failures };
};

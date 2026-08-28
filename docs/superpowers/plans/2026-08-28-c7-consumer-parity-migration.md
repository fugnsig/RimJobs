# C7 Consumer Parity Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all C1 production consumers (priority grid, summary counts, viability, bottlenecks, auto-assign, analyser, skill displays, scheduler, temporal coverage) from legacy `isIncapable()`/`evaluatePawnJob()`/`effectiveSkill()` to canonical C4 Permission/Availability, C5 structural effectiveness reports, and C6 temporal profiles - maintaining exact output parity except for the approved C4 corrections, the downed semantic decomposition, and the narrowly approved `creationGainAlreadyPersisted` C5 skill-display correction.

**Architecture:** A request-scoped C7 evaluation coordinator builds one shared C2/C3 evidence set per pawn, provides memoised C4 Permission and Availability per job, accesses C5 effectiveness reports, and lazily resolves C6 temporal profiles. Each top-level UI or engine entry point creates coordinator contexts for its pawns, uses them for the duration of that call, and discards them. No long-lived cache, no revision counter, no cross-request memoisation. The coordinator is a thin orchestration layer; all domain logic remains in the existing C2-C6 resolvers. Consumer migration is sequential: each task replaces one consumer group, adds parity tests, and commits. Legacy shadow adapters remain until all consumers pass parity and are removed in the final task.

**Tech Stack:** Vanilla JavaScript renderer modules, Node vm-sandbox test harness.

**User decisions (already made):**
- PD-1: Permission unknown uses a `?` projection - clear, unambiguous, never X, never silently capable
- PD-2: Permission allowed + Availability unavailable retains the priority value with a distinct temporary/current-status indicator - must not be confused with X (blocked) or ? (unknown)
- PD-3: Permission unknown participates in existing C1 candidate/count/score policy where required for parity - explicit parity projection meaning "not proven blocked", never a canonical allowed conversion
- PD-4: Do not add new structurally-capable/currently-available dashboard counts in C7 - avoid turning a migration phase into a dashboard redesign
- C5 plurality boundary: C7 display migrations consume plural C5 facts; auto-assign/ranking preserve frozen C1 policy; C8 owns redesigned ranking exploiting plurality
- Scheduler gate cleared: C6 temporal profile API verified; `TemporalProfileResolver.resolve(c5Context)` is the production entry point
- Three approved C4 corrections ONLY: Firefight+Violent, Human Fishing age, Hauling+zero Manipulation
- Approved C5 display correction ONLY: `creationGainAlreadyPersisted` may change canonical C5 skill-display projections, but no ranking, assignment, analyser, viability, or other frozen C1 policy calculation
- No other unnamed behavioural delta is allowed without stopping and reporting it

**Regression baseline (measured 2026-08-28):** 44 suites, 35,098 checks, 0 failures.

**Source documents:**
- C4 incapability correctness validation: `docs/superpowers/audits/2026-08-28-c4-incapability-correctness-validation.md`
- C7 preimplementation consumer audit: `docs/superpowers/audits/2026-08-28-c7-preimplementation-consumer-audit.md`
- C7 projection and policy decisions: `docs/superpowers/briefs/2026-08-28-c7-projection-policy-decisions.md`
- C6 temporal profile resolution design: `docs/superpowers/specs/2026-08-27-c6-temporal-profile-resolution-design.md`
- C5 structural effectiveness design: `docs/superpowers/specs/2026-08-27-c5-structural-effectiveness-design-reviewed.md`
- Architecture invariants: `docs/architecture/INVARIANTS.md`

---

## Named C7 Deltas (Exhaustive)

These are the ONLY permitted behavioural differences between C1 and C7 output:

| Delta code | Legacy behaviour | C7 behaviour | Consumer effect |
|------------|-----------------|--------------|-----------------|
| `legacyBlockedCanonicalNotBlocked` | Firefight+Violent: X cell | Editable priority cell | Pawn gains Firefight eligibility |
| `legacyBlockedCanonicalNotBlocked` | Human Fishing at age < 7: X cell | Editable priority cell | Child gains Fishing eligibility |
| `legacyBlockedCanonicalNotBlocked` | Hauling+zero Manipulation: X cell | Editable priority cell | Pawn gains Hauling via zero-capacity path |
| `legacyPermissionBlockCanonicalAvailabilityBlock` | Downed pawn: X on every cell | Priority preserved with unavailable marker | Structural eligibility visible while incapacitated |
| `creationGainAlreadyPersisted` | Saved `levelInt` 10 plus childhood creation gain +2 is displayed as 12 because C1 re-adds the gain | Canonical C5 skill display remains 10 because the gain is already embodied in `levelInt` | Skill-display projections only; frozen ranking/assignment/policy calculations remain unchanged |

Any other divergence from C1 output is a regression and must be reported before proceeding.

**Causal fixture requirement:** Each parity test that references a named delta must construct a causal fixture proving the specific cascade, not use the delta code as a blanket exemption. Each fixture must:
1. Construct a pawn with the exact source fact, trait, gene, age, or status that triggers the delta
2. Assert the SPECIFIC cells/counts/scores that change (by pawn ID and job ID)
3. Assert that all OTHER cells/counts/scores remain unchanged
4. Name the delta code in the test label for traceability

Example causal fixture for Firefight+Violent delta:
```javascript
// C7-DELTA-FIREFIGHT: Pawn with Violent trait, Firefight job
// C1: evaluateJobPermission blocks Violent from Firefight -> X cell
// C7: PermissionResolver allows (Violent is not a structural block for Firefight) -> editable cell
// Cascade: grid cell changes, auto-assign gains candidate, viability/bottleneck see worker
var violentPawn = mkPawn('delta-violent', { traits: ['brawler'], ... });
var firefightJob = { id: 'firefight' };
// Assert THIS cell changes from blocked to allowed
ok(pawnCtx.permission(firefightJob).state !== 'blocked', 'C7-DELTA-FIREFIGHT perm not blocked');
// Assert OTHER jobs for this pawn are unchanged
ok(cellState(pawnCtx, miningJob) === cellState(c1PawnCtx, miningJob), 'C7-DELTA-FIREFIGHT mining unchanged');
```

Do not treat the presence of a named delta as a blanket exemption for arbitrary matrix/output differences. Each test must prove exactly which outputs change and why.

---

## Static Gates

These prohibitions apply to the C7 coordinator module (`c7-evaluation-coordinator.js`) only. They do NOT apply to:
- `engine.js` (contains C7 policy code that legitimately reads trait names for break thresholds, child age rules, Undergrounder exemption, etc.)
- `app-render.js`, `app-pawns.js`, `app-priorities.js`, `charts.js` (UI policy code)
- Legacy compatibility adapters
- Existing C2-C6 resolvers (already have their own gate tests)

| Gate | Prohibition | Scope | Enforcement |
|------|-------------|-------|-------------|
| SG-1 | No `primarySkill` selection or scalar canonical effectiveness score | coordinator | Static grep in c7-static-gates.test.js |
| SG-2 | No identity-based branching (trait/gene/hediff/race name literals) | coordinator | Static grep in c7-static-gates.test.js |
| SG-3 | No long-lived result cache, revision counter, or cross-request memoisation | coordinator | Static grep for WeakMap/invalidate/revisionCache |
| SG-4 | No canonical ranking proxy, assignment change, or schedule construction | coordinator | Static grep |
| SG-5 | No direct boolean parity requirement (C4 tri-state must reach the UI) | coordinator | Static grep for boolean coercion of permission/availability state |
| SG-6 | No C5 fact suppression based on C4 Permission or Availability state | coordinator | Static grep |
| SG-7 | No legacy `incapBlocks` tokens | coordinator | Static grep |

---

## Regression Test Strategy

| Lane | What it proves | When it runs |
|------|----------------|--------------|
| Canonical contract | C2/C3/C4/C5/C6 outputs unchanged by consumer migration | After every consumer commit |
| Legacy shadow | Each migrated consumer matches C1 except named deltas | After every consumer commit |
| Consumer snapshot | Priority cells, summary counts, analyser output, schedule arrays, coverage records | After every consumer commit |
| Unknown | Unknown cells, counts, scores, messages at every projection boundary | After every consumer commit |
| Plurality | Skillless jobs, multiple SkillDefs, multiple facets, multiple paths | Static gates plus consumer snapshots |
| Request reuse | One C2/C3 evaluation per pawn request context | Instrumented integration test |
| Temporal | C6 mechanism-to-C7-policy projection; schedule output parity | After scheduler migration |
| Full regression | `node test/run-tests.js` with recorded suite/check/failure counts | After every commit |

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `files/c7-evaluation-coordinator.js` | Request-scoped coordinator: shared C2/C3, memoised C4/C5 per job, lazy C6 | Create |
| `files/rimjobs.html` | Script loading | Modify: add `<script>` tag for c7-evaluation-coordinator.js after c5-evaluation-context.js |
| `files/app-render.js` | Priority grid, summary, dashboard | Modify: replace `isIncapable()` with coordinator Permission/Availability |
| `files/app-pawns.js` | Skill displays, pawn cards, auto-assign UI, `isIncapable()` | Modify: migrate skill displays to C5 projections; deprecate `isIncapable()` |
| `files/engine.js` | All engine consumers | Modify: migrate `evaluateJobPermission`, `evaluatePawnJob`, auto-assign, analyser, scheduler, temporal coverage |
| `files/app-priorities.js` | Work Planner | Modify: use coordinator in `openWorkPlanner()` |
| `files/charts.js` | Colony radar | Modify: migrate `effectiveSkill()` to C5 skill projection |
| `files/styles.css` | Cell styles | Modify: add `.prio-box.unknown` and `.prio-box.unavailable` CSS |
| `test/c7-evaluation-coordinator.test.js` | Coordinator contract and request-scoping | Create |
| `test/c7-grid-parity.test.js` | Grid cell state parity for 4 projection states | Create |
| `test/c7-consumer-parity.test.js` | Summary, viability, bottleneck, analyser parity | Create |
| `test/c7-skill-display-parity.test.js` | Skill/stat display and radar chart parity | Create |
| `test/c7-ranking-parity.test.js` | Auto-assign priority matrix parity | Create |
| `test/c7-scheduler-parity.test.js` | Scheduler Phase 1 mechanism-to-policy parity | Create |
| `test/c7-temporal-parity.test.js` | Temporal coverage and resilience parity | Create |
| `test/c7-static-gates.test.js` | Static gate enforcement for C7 coordinator | Create |
| `test/run-tests.js` | Test runner | Modify: register C7 test suites |
| `test/_harness.js` | Test harness captures | Modify: add `C7EvaluationCoordinator` to capture list |
| `docs/architecture/CODE-MAP.md` | Feature/file lookup | Modify: add C7 section |
| `docs/architecture/INVARIANTS.md` | Behavioural invariants | Modify: add C7 invariants |

---

### Task 0: C7 Evaluation Coordinator

**Goal:** Create a request-scoped evaluation coordinator that builds one shared C2/C3 evidence set per pawn (one call to `CapabilityEvidence.collectPawnEvidence`, one call to `CapacityResolver.resolvePawnCapacities`), provides memoised C4 Permission and Availability per job, accesses C5 reports, and lazily resolves C6 temporal profiles - with no long-lived cache. The coordinator must bind to the actual C4/C5 context APIs, not fabricate compatible objects.

**Actual API bindings (verified against production code):**
- `CapabilityEvidence.collectPawnEvidence(pawn, options?)` at `capability-evidence.js:2187` - returns `{effects, skillOperations, statOperations, sourceFamilyCompleteness, temporalCoverage, structuralContextFacts, conservation, bodyEvidence, permissionEvidence, pawnState, unresolvedSources}`
- `CapacityResolver.resolvePawnCapacities(evidence, definitions)` at `capacity-resolver.js` - NOT `c3-capacity-resolver.js`
- `C4EvaluationContext.create({pawn, capabilityDefinitions, definitionSnapshot})` at `c4-evaluation-context.js:61` - internally calls C2 (without options) and C3, derives statusFacts including `canBeAwake`/`unconscious` via `_deriveAwakeFacts`
- `C4EvaluationContext._deriveAwakeFacts(statusFacts, evidence, capacities, definitions)` - exposed at `c4-evaluation-context.js:90`
- `StructuralEffectivenessContext.create({pawn, effectivenessSnapshot, evidenceOptions, capabilityDefinitions, c4RequirementSnapshot, sourceFamilyCompleteness, structuralPropertyProviders, scenarioProvider})` at `c5-evaluation-context.js:36` - internally calls C2 (with options) and C3
- `StructuralEffectivenessContext.fromResolved({pawnId, pawnEvidence, structuralCapacities, c4RequirementSnapshot, effectivenessSnapshot})` at `c5-evaluation-context.js:21` - builds context from pre-computed C2/C3 results, avoiding duplicate calls
- `PermissionResolver.resolve(context, jobId)` at `permission-resolver.js:190` - reads `context.definitionSnapshot`, `context.pawnId`, `context.evidence`, `context.capacities`
- `AvailabilityResolver.resolve(context, jobId)` at `availability-resolver.js:221` - reads `context.statusFacts` (structured `{statusId, state, value, evidence}` format from C4, NOT raw pawn booleans), `context.definitionSnapshot`, `context.pawnId`, `context.evidence`
- `TemporalProfileResolver.resolve(c5Context)` at `temporal-profile-resolver.js:300`

**Shared evidence strategy:** C2 called once with the superset `evidenceOptions` (including temporal coverage when supplied). The base effects (traits, genes, xenotype, backstories) are identical with or without options; the options only add `temporalCoverage` and `structuralContextFacts` fields that C4 resolvers do not read. C3 called once on the shared evidence. Status facts derived via `C4EvaluationContext._deriveAwakeFacts()` to get proper `canBeAwake`/`unconscious` derivation from capacities. C5 context built via `fromResolved()` using the shared C2/C3 results.

**Files:**
- Create: `files/c7-evaluation-coordinator.js`
- Create: `test/c7-evaluation-coordinator.test.js`
- Create: `test/c7-static-gates.test.js`
- Modify: `files/rimjobs.html` (add script tag)
- Modify: `test/run-tests.js` (register suites)
- Modify: `test/_harness.js` (capture `C7EvaluationCoordinator`)

**Acceptance Criteria:**
- [ ] `C7EvaluationCoordinator.createPawnContext(pawn, options)` returns a frozen context object
- [ ] Context provides `permission(job)` returning C4 Permission report with `state` field
- [ ] Context provides `availability(job)` returning C4 Availability report with `state` field
- [ ] Context provides `c5Context` - a frozen `StructuralEffectivenessContext` built via `fromResolved()`
- [ ] Context provides `temporalProfile()` that lazily calls `TemporalProfileResolver.resolve(c5Context)`
- [ ] Context provides `legacyShadow(job)` for migration-time comparison
- [ ] C4 results are memoised within a context: calling `permission(sameJob)` twice returns the same object
- [ ] No state survives between `createPawnContext` calls (no WeakMap, no module-level cache)
- [ ] Status facts derived via `C4EvaluationContext._deriveAwakeFacts()` from shared C2/C3 results - NOT raw pawn booleans
- [ ] C2 called exactly once per context (shared between C4 resolvers and C5 context)
- [ ] C3 called exactly once per context (shared between C4 resolvers and C5 context)
- [ ] Static gate tests pass: no primarySkill, no identity branching, no long-lived cache in the coordinator

**Verify:** `node test/run-tests.js` - all suites pass, new coordinator suite has 30+ checks.

**Steps:**

- [ ] **Step 1: Write coordinator contract tests**

Create `test/c7-evaluation-coordinator.test.js`:

```javascript
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

  // -- C7-COORD-001: createPawnContext returns a frozen object --
  {
    const pawnCtx = Coordinator.createPawnContext(mkPawn('test-1'));
    ok(Object.isFrozen(pawnCtx), 'C7-COORD-001 context is frozen');
  }

  // -- C7-COORD-002: permission() returns a report with state field --
  {
    const pawnCtx = Coordinator.createPawnContext(mkPawn('test-2'));
    const perm = pawnCtx.permission({ id: 'mining' });
    ok(perm && typeof perm.state === 'string', 'C7-COORD-002 permission has state');
    ok(['allowed', 'blocked', 'unknown'].includes(perm.state), 'C7-COORD-002 valid state value');
  }

  // -- C7-COORD-003: availability() returns a report with state field --
  {
    const pawnCtx = Coordinator.createPawnContext(mkPawn('test-3'));
    const avail = pawnCtx.availability({ id: 'mining' });
    ok(avail && typeof avail.state === 'string', 'C7-COORD-003 availability has state');
    ok(['available', 'unavailable', 'unknown'].includes(avail.state), 'C7-COORD-003 valid state value');
  }

  // -- C7-COORD-004: permission results are memoised within context --
  {
    const pawnCtx = Coordinator.createPawnContext(mkPawn('test-4'));
    const job = { id: 'hauling' };
    const p1 = pawnCtx.permission(job);
    const p2 = pawnCtx.permission(job);
    ok(p1 === p2, 'C7-COORD-004 same permission object returned twice');
  }

  // -- C7-COORD-005: availability results are memoised within context --
  {
    const pawnCtx = Coordinator.createPawnContext(mkPawn('test-5'));
    const job = { id: 'hauling' };
    const a1 = pawnCtx.availability(job);
    const a2 = pawnCtx.availability(job);
    ok(a1 === a2, 'C7-COORD-005 same availability object returned twice');
  }

  // -- C7-COORD-006: no cross-context memoisation --
  {
    const pawn = mkPawn('test-6');
    const job = { id: 'hauling' };
    const ctx1 = Coordinator.createPawnContext(pawn);
    const ctx2 = Coordinator.createPawnContext(pawn);
    const p1 = ctx1.permission(job);
    const p2 = ctx2.permission(job);
    ok(p1 !== p2, 'C7-COORD-006 different contexts produce different objects');
  }

  // -- C7-COORD-007: c5Context is a StructuralEffectivenessContext --
  {
    const pawnCtx = Coordinator.createPawnContext(mkPawn('test-7'));
    ok(pawnCtx.c5Context && typeof pawnCtx.c5Context === 'object',
      'C7-COORD-007 c5Context exposed');
    ok(pawnCtx.c5Context.pawnEvidence && typeof pawnCtx.c5Context.pawnEvidence === 'object',
      'C7-COORD-007 c5Context has pawnEvidence');
    ok(pawnCtx.c5Context.structuralCapacities && typeof pawnCtx.c5Context.structuralCapacities === 'object',
      'C7-COORD-007 c5Context has structuralCapacities');
    ok(Object.isFrozen(pawnCtx.c5Context), 'C7-COORD-007 c5Context is frozen');
  }

  // -- C7-COORD-008: temporalProfile() lazily resolves --
  {
    const pawnCtx = Coordinator.createPawnContext(mkPawn('test-8'));
    const profile = pawnCtx.temporalProfile();
    ok(profile && typeof profile === 'object', 'C7-COORD-008 temporalProfile returns object');
    ok(profile.rest && typeof profile.rest.needState === 'string',
      'C7-COORD-008 temporalProfile has rest.needState');
  }

  // -- C7-COORD-009: downed pawn yields unavailable availability --
  // Downed status must be derived from C4-style statusFacts via _deriveAwakeFacts,
  // not from raw pawn.downed boolean. The AvailabilityResolver reads
  // context.statusFacts[statusId].state === 'known' && .value === true.
  {
    const pawnCtx = Coordinator.createPawnContext(mkPawn('downed-1', {
      downed: true,
      currentStatusSources: { facts: {
        downed: { state: 'known', value: true, evidence: [] },
      } },
    }));
    const avail = pawnCtx.availability({ id: 'mining' });
    ok(avail.state === 'unavailable', 'C7-COORD-009 downed pawn is unavailable');
  }

  // -- C7-COORD-010: downed pawn permission is allowed (not blocked) for structurally capable job --
  {
    const pawnCtx = Coordinator.createPawnContext(mkPawn('downed-2', {
      downed: true,
      currentStatusSources: { facts: {
        downed: { state: 'known', value: true, evidence: [] },
      } },
    }));
    const perm = pawnCtx.permission({ id: 'hauling' });
    ok(perm.state !== 'blocked', 'C7-COORD-010 downed pawn structurally allowed for hauling');
  }

  // -- C7-COORD-011: legacyShadow returns comparison with delta code --
  {
    const pawnCtx = Coordinator.createPawnContext(mkPawn('shadow-1'));
    const shadow = pawnCtx.legacyShadow({ id: 'mining' });
    ok(shadow && typeof shadow === 'object', 'C7-COORD-011 legacyShadow returns object');
    ok('sameIncapable' in shadow, 'C7-COORD-011 shadow has sameIncapable field');
  }

  // -- C7-COORD-012: shared C2/C3 - c5Context.pawnEvidence is same reference as resolver input --
  {
    const pawnCtx = Coordinator.createPawnContext(mkPawn('share-1'));
    ok(pawnCtx.pawnEvidence === pawnCtx.c5Context.pawnEvidence,
      'C7-COORD-012 shared pawnEvidence reference');
    ok(pawnCtx.structuralCapacities === pawnCtx.c5Context.structuralCapacities,
      'C7-COORD-012 shared structuralCapacities reference');
  }

  return { name: 'C7 evaluation coordinator', total, failures };
};
```

- [ ] **Step 2: Write static gate tests for coordinator**

Create `test/c7-static-gates.test.js`. Gates scan the coordinator module only - NOT `engine.js` or app modules, which contain legitimate C7 policy code (trait-based break thresholds, child age rules, etc.):

```javascript
const fs = require('fs');
const path = require('path');

module.exports = function run() {
  let total = 0, failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) { failures++; console.log('  FAIL ' + label); }
  };

  const coordinatorSrc = fs.readFileSync(
    path.join(__dirname, '..', 'files', 'c7-evaluation-coordinator.js'), 'utf8');

  // SG-1: No primarySkill or scalar effectiveness score
  ok(!/primarySkill/i.test(coordinatorSrc), 'SG-1 no primarySkill');
  ok(!/effectivenessScore/i.test(coordinatorSrc), 'SG-1 no effectivenessScore');
  ok(!/overallScore/i.test(coordinatorSrc), 'SG-1 no overallScore');

  // SG-3: No long-lived cache
  ok(!/WeakMap/i.test(coordinatorSrc), 'SG-3 no WeakMap');
  ok(!/revisionCache/i.test(coordinatorSrc), 'SG-3 no revisionCache');
  ok(!/module\..*cache/i.test(coordinatorSrc), 'SG-3 no module-level cache');

  // SG-5: No boolean coercion of permission/availability state
  ok(!/\.state\s*===?\s*(true|false)/i.test(coordinatorSrc),
    'SG-5 no boolean coercion of state');

  // SG-7: No legacy incapBlocks tokens
  ok(!/incapBlocks/i.test(coordinatorSrc), 'SG-7 no incapBlocks in coordinator');

  return { name: 'C7 static architecture gates', total, failures };
};
```

- [ ] **Step 3: Implement the coordinator module**

Create `files/c7-evaluation-coordinator.js`:

```javascript
const C7EvaluationCoordinator = (() => {
  function createPawnContext(pawn, options) {
    var opts = options || {};
    var p = pawn || {};

    // --- Shared C2 evidence (one call, with options superset) ---
    var evidenceOptions = opts.evidenceOptions || {};
    var pawnEvidence = CapabilityEvidence.collectPawnEvidence(p, evidenceOptions);

    // --- Shared C3 capacities (one call) ---
    var definitions = opts.capabilityDefinitions || {};
    var structuralCapacities = CapacityResolver.resolvePawnCapacities(
      pawnEvidence, definitions);

    // --- C4-compatible statusFacts (derived, not raw booleans) ---
    var statusIds = ['downed', 'inMentalState', 'mentalBreak', 'deactivated',
      'unconscious', 'canBeAwake'];
    var parsedFacts = pawnEvidence.pawnState
      && pawnEvidence.pawnState.currentStatusFacts
      ? pawnEvidence.pawnState.currentStatusFacts : {};
    var rawStatusFacts = {};
    for (var i = 0; i < statusIds.length; i++) {
      var sid = statusIds[i];
      rawStatusFacts[sid] = parsedFacts[sid]
        ? Object.assign({}, parsedFacts[sid])
        : { statusId: sid, state: 'unknown', value: null, evidence: [] };
    }
    var statusFacts = C4EvaluationContext._deriveAwakeFacts(
      rawStatusFacts, pawnEvidence, structuralCapacities, definitions);

    // --- C4 resolver context (shares C2/C3 results) ---
    var definitionSnapshot = opts.definitionSnapshot || null;
    var resolverContext = Object.freeze({
      pawnId: p.id != null ? String(p.id) : null,
      evidence: pawnEvidence,
      capacities: structuralCapacities,
      statusFacts: statusFacts,
      definitionSnapshot: definitionSnapshot,
    });

    // --- C5 context via fromResolved (avoids duplicate C2/C3 calls) ---
    var c5Context = StructuralEffectivenessContext.fromResolved({
      pawnId: p.id != null ? p.id : null,
      pawnEvidence: pawnEvidence,
      structuralCapacities: structuralCapacities,
      c4RequirementSnapshot: opts.c4RequirementSnapshot || null,
      effectivenessSnapshot: opts.effectivenessSnapshot || null,
    });

    // --- Memoised C4 Permission ---
    var permissionMemo = {};
    function permission(job) {
      var key = job && job.id || '';
      if (key in permissionMemo) return permissionMemo[key];
      var result = PermissionResolver.resolve(resolverContext, key);
      permissionMemo[key] = result;
      return result;
    }

    // --- Memoised C4 Availability ---
    var availabilityMemo = {};
    function availability(job) {
      var key = job && job.id || '';
      if (key in availabilityMemo) return availabilityMemo[key];
      var result = AvailabilityResolver.resolve(resolverContext, key);
      availabilityMemo[key] = result;
      return result;
    }

    // --- Lazy C6 temporal profile ---
    var cachedTemporalProfile;
    var temporalProfileResolved = false;
    function temporalProfile() {
      if (!temporalProfileResolved) {
        cachedTemporalProfile = TemporalProfileResolver.resolve(c5Context);
        temporalProfileResolved = true;
      }
      return cachedTemporalProfile;
    }

    // --- Legacy shadow comparison ---
    function legacyShadow(job) {
      return C4LegacyCompatibility.compare({
        pawn: p, job: job,
        canonical: { permission: permission(job), availability: availability(job) },
      });
    }

    return Object.freeze({
      pawnId: p.id != null ? String(p.id) : null,
      pawnEvidence: pawnEvidence,
      structuralCapacities: structuralCapacities,
      c5Context: c5Context,
      permission: permission,
      availability: availability,
      temporalProfile: temporalProfile,
      legacyShadow: legacyShadow,
    });
  }

  return Object.freeze({ createPawnContext: createPawnContext });
})();
```

**Key differences from first draft:**
1. Calls `CapabilityEvidence.collectPawnEvidence(p, evidenceOptions)` once - shared between C4 and C5
2. Calls `CapacityResolver.resolvePawnCapacities(pawnEvidence, definitions)` once - shared between C4 and C5
3. Derives statusFacts via `C4EvaluationContext._deriveAwakeFacts()` using shared C2/C3 results, producing the structured `{statusId, state:'known', value:true, evidence:[]}` format that `AvailabilityResolver.evaluateGlobal()` requires - NOT raw pawn booleans
4. Builds C5 context via `StructuralEffectivenessContext.fromResolved()` to avoid duplicate C2/C3 calls
5. Resolver context shape matches what `PermissionResolver.resolve()` and `AvailabilityResolver.resolve()` actually read: `{pawnId, evidence, capacities, statusFacts, definitionSnapshot}`
6. Module filename is `capacity-resolver.js`, not `c3-capacity-resolver.js`

- [ ] **Step 4: Register in harness, HTML, and test runner**

Add `C7EvaluationCoordinator` to `test/_harness.js` capture list.

Add `<script src="c7-evaluation-coordinator.js"></script>` to `files/rimjobs.html` after the `temporal-profile-resolver.js` script tag (coordinator depends on C4/C5/C6 resolvers).

Register both new test suites in `test/run-tests.js`.

- [ ] **Step 5: Run tests and verify**

Run: `node test/run-tests.js`
Expected: All suites pass including new C7 coordinator and C7 static gates suites.

- [ ] **Step 6: Commit**

```
git add files/c7-evaluation-coordinator.js files/rimjobs.html test/c7-evaluation-coordinator.test.js test/c7-static-gates.test.js test/run-tests.js test/_harness.js
git commit -m "C7: add request-scoped evaluation coordinator with contract tests"
```

---

### Task 1: Priority Grid C4 Migration

**Goal:** Replace `App.isIncapable(p, j)` in both priority grid renderers (`_renderTableHorizontal` and `_renderTableVertical`) with C4 Permission and Availability, rendering four distinct cell states: blocked (X), unknown (?), allowed+unavailable (priority with marker), and allowed+available (normal editable cell). Add structured tooltips with provenance.

**Files:**
- Modify: `files/app-render.js:485` (`_renderTableHorizontal` cell loop)
- Modify: `files/app-render.js:534` (`_renderTableVertical` cell loop)
- Modify: `files/styles.css` (add `.prio-box.unknown` and `.prio-box.unavailable`)
- Create: `test/c7-grid-parity.test.js`
- Modify: `test/run-tests.js` (register suite)

**Acceptance Criteria:**
- [ ] Every cell that showed X under C1 still shows X under C7, except the three named C4 deltas
- [ ] Three named C4 delta cells change from X to editable priority
- [ ] Downed pawn cells show priority value with unavailable marker (not X) - cell remains editable (`pointer-events` NOT disabled)
- [ ] Unknown permission cells show `?` indicator with amber/muted style - cell remains editable (user can still set a priority)
- [ ] Structured tooltip lists each blocker with source kind and reason
- [ ] Unknown tooltip lists uncertainty sources
- [ ] Unavailable tooltip shows temporary status reason
- [ ] Both horizontal and vertical renderers produce identical state logic
- [ ] No production consumer directly calls `isIncapable()` in grid rendering after this task

**Verify:** `node test/run-tests.js` - all suites pass, new grid parity suite has 25+ checks.

**Steps:**

- [ ] **Step 1: Write grid parity tests**

Create `test/c7-grid-parity.test.js`. The test builds coordinator contexts for test pawns and verifies cell state classification matches expectations:

```javascript
const { loadScripts } = require('./_harness');

module.exports = function run() {
  let total = 0, failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) { failures++; console.log('  FAIL ' + label); }
  };

  const App = { /* ... standard test App stub ... */ };

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
    bioAge: 20,
  }, overrides || {});

  // Helper: determine cell state from coordinator context
  function cellState(pawnCtx, job) {
    var perm = pawnCtx.permission(job);
    if (perm.state === 'blocked') return 'blocked';
    if (perm.state === 'unknown') return 'unknown';
    var avail = pawnCtx.availability(job);
    if (avail.state === 'unavailable') return 'unavailable';
    return 'normal';
  }

  // -- C7-GRID-001: Normal capable pawn renders normal cell --
  {
    var pawnCtx = Coordinator.createPawnContext(mkPawn('grid-1'));
    ok(cellState(pawnCtx, { id: 'hauling', incapBlocks: ['hauling', 'dumb_labor'] }) === 'normal',
      'C7-GRID-001 normal pawn -> normal cell');
  }

  // -- C7-GRID-002: Structurally blocked pawn renders blocked cell --
  {
    var pawnCtx = Coordinator.createPawnContext(mkPawn('grid-2', {
      incapable: ['mining'],
    }));
    ok(cellState(pawnCtx, { id: 'mining', incapBlocks: ['mining'] }) === 'blocked',
      'C7-GRID-002 incapable pawn -> blocked cell');
  }

  // -- C7-GRID-003: Downed pawn renders unavailable (not blocked) --
  {
    var pawnCtx = Coordinator.createPawnContext(mkPawn('grid-3', { downed: true }));
    var state = cellState(pawnCtx, { id: 'hauling', incapBlocks: ['hauling', 'dumb_labor'] });
    ok(state === 'unavailable', 'C7-GRID-003 downed pawn -> unavailable cell (got ' + state + ')');
  }

  // -- C7-GRID-004: Named delta - Firefight+Violent not blocked --
  // (Tests that the C4 Permission resolver correctly allows Violent for Firefight.
  //  The exact setup depends on the trait evidence; this test verifies the
  //  coordinator's routing, not the resolver's internal logic.)

  // -- C7-GRID-005 to C7-GRID-025: Additional parity fixtures --
  // ... blocked+unknown combined, multiple blockers, tooltip content assertions,
  //     horizontal and vertical render path equivalence, etc.

  return { name: 'C7 grid parity', total, failures };
};
```

- [ ] **Step 2: Add CSS for new cell states**

Add to `files/styles.css`:

```css
/* C7: Unknown permission cell - distinct from blocked (X) and normal.
   Must remain editable (user can set a priority); no pointer-events:none. */
.prio-box.unknown {
  border: 1px dashed var(--border-bright);
  opacity: 0.85;
  position: relative;
}
.prio-box.unknown::before {
  content: '?';
  position: absolute;
  top: 0; right: 2px;
  font-size: 0.65em;
  color: var(--text3);
  pointer-events: none;
}

/* C7: Allowed but currently unavailable - priority preserved, dimmed.
   Must remain editable (structural eligibility visible while incapacitated);
   no pointer-events:none. */
.prio-box.unavailable {
  opacity: 0.45;
  position: relative;
}
.prio-box.unavailable::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    45deg, transparent, transparent 3px,
    var(--border) 3px, var(--border) 4px
  );
  border-radius: inherit;
  pointer-events: none;
}
```

- [ ] **Step 3: Add cell state helper and tooltip builder to app-render.js**

Add before `_renderTableHorizontal` in `files/app-render.js`:

```javascript
  _c7CellState(pawnCtx, job) {
    var perm = pawnCtx.permission(job);
    if (perm.state === 'blocked') return { state: 'blocked', permission: perm };
    if (perm.state === 'unknown') return { state: 'unknown', permission: perm };
    var avail = pawnCtx.availability(job);
    if (avail.state === 'unavailable') return { state: 'unavailable', permission: perm, availability: avail };
    return { state: 'normal', permission: perm, availability: avail };
  },

  _c7Tooltip(cellInfo) {
    var lines = [];
    if (cellInfo.state === 'blocked' && cellInfo.permission) {
      (cellInfo.permission.blockers || []).forEach(function (b) {
        var code = b.explanation ? b.explanation.code : '';
        var params = b.explanation ? b.explanation.params : {};
        lines.push(code + (params.target ? ': ' + params.target : ''));
      });
      if (lines.length === 0) lines.push('Incapable of this job type');
    } else if (cellInfo.state === 'unknown' && cellInfo.permission) {
      (cellInfo.permission.unknowns || []).forEach(function (u) {
        var code = u.explanation ? u.explanation.code : '';
        lines.push(code || 'Unknown eligibility');
      });
      if (lines.length === 0) lines.push('Eligibility could not be verified');
    } else if (cellInfo.state === 'unavailable' && cellInfo.availability) {
      (cellInfo.availability.blockers || []).forEach(function (b) {
        var code = b.explanation ? b.explanation.code : '';
        lines.push(code || 'Currently unavailable');
      });
      if (lines.length === 0) lines.push('Temporarily unavailable');
    }
    return _escapeHtml(lines.join('\n'));
  },
```

- [ ] **Step 4: Migrate `_renderTableHorizontal` cell rendering**

Replace the cell-rendering lambda at `app-render.js:484-488`:

Before:
```javascript
const incap = this.isIncapable(p, j);
const prio = this.state.priorities[p.id]?.[j.id];
if (incap) return `<td class="td-job"><div class="prio-box incap" title="Incapable of this job type">x</div></td>`;
return `<td class="td-job">${this._prioCellHTML(p.id, j.id, prio)}</td>`;
```

After:
```javascript
const cellInfo = this._c7CellState(pawnCtxMap.get(p.id), j);
const prio = this.state.priorities[p.id]?.[j.id];
if (cellInfo.state === 'blocked') return `<td class="td-job"><div class="prio-box incap" title="${this._c7Tooltip(cellInfo)}">x</div></td>`;
if (cellInfo.state === 'unknown') return `<td class="td-job">${this._prioCellHTML(p.id, j.id, prio, 'unknown', this._c7Tooltip(cellInfo))}</td>`;
if (cellInfo.state === 'unavailable') return `<td class="td-job">${this._prioCellHTML(p.id, j.id, prio, 'unavailable', this._c7Tooltip(cellInfo))}</td>`;
return `<td class="td-job">${this._prioCellHTML(p.id, j.id, prio)}</td>`;
```

The `_prioCellHTML` gains optional `extraClass` and `extraTitle` parameters so that unknown and unavailable cells remain fully editable (click to cycle priority) while carrying the visual indicator class and tooltip. The `?` badge for unknown cells is rendered via CSS `::before` pseudo-element, keeping the interactive `_prioCellHTML` content intact.

The `pawnCtxMap` is built once at the top of the renderer:

```javascript
const pawnCtxMap = new Map();
filteredPawns.forEach(p => pawnCtxMap.set(p.id, C7EvaluationCoordinator.createPawnContext(p, {
  definitionSnapshot: App._c4DefinitionSnapshot(),
})));
```

`App._c4DefinitionSnapshot()` is a new method returning the cached definition snapshot from RequirementRegistry. This snapshot is request-scoped to the current data state and does not constitute a long-lived C7 cache - it is the registry's own output.

- [ ] **Step 5: Migrate `_renderTableVertical` cell rendering identically**

Apply the same pattern at `app-render.js:533-537`. Build `pawnCtxMap` at the top of `_renderTableVertical` with the same code. Replace `isIncapable` with `_c7CellState`.

- [ ] **Step 6: Run all tests and verify**

Run: `node test/run-tests.js`
Expected: All suites pass. Existing engine/priority-lock suites unchanged. New grid parity suite passes.

- [ ] **Step 7: Commit**

```
git add files/app-render.js files/styles.css test/c7-grid-parity.test.js test/run-tests.js
git commit -m "C7: migrate priority grid to C4 Permission/Availability with 4 cell states"
```

---

### Task 2: Summary and Dashboard Migration

**Goal:** Migrate `renderSummary()` summary counts, `calculateViability()`, and `getBottlenecks()` from `isIncapable()`/`evaluateJobPermission()` to the C7 coordinator. Unknown permission pawns count as eligible (PD-3). Availability does not filter summary counts (PD-4). No new dashboard counts.

**Files:**
- Modify: `files/app-render.js:652-654` (`renderSummary` pill counts)
- Modify: `files/engine.js:64-102` (`calculateViability`)
- Modify: `files/engine.js:108-163` (`getBottlenecks`)
- Create: `test/c7-consumer-parity.test.js`
- Modify: `test/run-tests.js`

**Acceptance Criteria:**
- [ ] Summary pill counts match C1 output for supported cases except named C4 deltas
- [ ] Viability score matches C1 output for supported cases except named C4 deltas
- [ ] Bottleneck messages match C1 output for supported cases except named C4 deltas
- [ ] Unknown permission pawns are counted as eligible where C1 counted them (PD-3)
- [ ] Downed pawns EXCLUDED from summary/viability/bottleneck counts via Availability filter - parity with C1's combined `evaluateJobPermission` which blocked downed at engine.js:169. The downed delta is a grid-only semantic decomposition; it does NOT make downed pawns eligible for these aggregate consumers
- [ ] No new count categories added (PD-4)
- [ ] Legacy `evaluateJobPermission()` calls removed from viability and bottleneck functions

**Verify:** `node test/run-tests.js` - all suites pass, new consumer parity suite has 20+ checks.

**Steps:**

- [ ] **Step 1: Write consumer parity tests**

Create `test/c7-consumer-parity.test.js`. Build test colonies with known Permission states and verify summary/viability/bottleneck output matches C1 baseline:

```javascript
const { loadScripts } = require('./_harness');

module.exports = function run() {
  let total = 0, failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) { failures++; console.log('  FAIL ' + label); }
  };

  // ... standard App stub and loadScripts setup ...

  // C7-SUM-001: Summary count parity for healthy capable pawn
  // C7-SUM-002: Summary count - downed pawn EXCLUDED (Availability unavailable, parity with C1)
  // C7-SUM-003: Summary count - unknown Permission pawn counted (PD-3, not proven blocked)
  // C7-VIA-001: Viability score baseline parity
  // C7-VIA-002: Viability - downed pawn EXCLUDED (Availability filter, parity with C1 downed block)
  // C7-VIA-003: Viability - unknown Permission pawn counted (PD-3, not proven blocked)
  // C7-BOT-001: Bottleneck messages baseline parity
  // C7-BOT-002: Bottleneck - downed pawn EXCLUDED from capable set (parity with C1)
  // C7-BOT-003: Bottleneck - unknown Permission pawn counted as potential worker
  // C7-BOT-004: Bottleneck conflict detection unchanged

  return { name: 'C7 consumer parity', total, failures };
};
```

- [ ] **Step 2: Migrate `renderSummary()` pill counts**

Replace `app-render.js:653-654`:

Before:
```javascript
const atP1  = this.state.pawns.filter(p => this.state.priorities[p.id]?.[j.id] === 1 && !this.isIncapable(p, j)).length;
const atAny = this.state.pawns.filter(p => this.state.priorities[p.id]?.[j.id] != null && !this.isIncapable(p, j)).length;
```

After (filter on Permission AND Availability - downed pawns remain excluded for count parity):
```javascript
function isEligible(pCtx, j) {
  return pCtx.permission(j).state !== 'blocked' && pCtx.availability(j).state !== 'unavailable';
}
const atP1  = this.state.pawns.filter(p => this.state.priorities[p.id]?.[j.id] === 1 && isEligible(summaryCtxMap.get(p.id), j)).length;
const atAny = this.state.pawns.filter(p => this.state.priorities[p.id]?.[j.id] != null && isEligible(summaryCtxMap.get(p.id), j)).length;
```

Build `summaryCtxMap` at the top of `renderSummary()`:

```javascript
const summaryCtxMap = new Map();
this.state.pawns.forEach(p => summaryCtxMap.set(p.id, C7EvaluationCoordinator.createPawnContext(p, {
  definitionSnapshot: App._c4DefinitionSnapshot(),
})));
```

- [ ] **Step 3: Migrate `calculateViability()` in engine.js**

Replace the capability check in `calculateViability()` (engine.js ~line 77) to accept a `contextMap` parameter. Instead of calling `evaluateJobPermission()` inside the viability loop, check both Permission AND Availability: `contextMap.get(p.id).permission(job).state !== 'blocked' && contextMap.get(p.id).availability(job).state !== 'unavailable'`. The dual check maintains parity with C1's `evaluateJobPermission`, which blocked downed pawns at line 169 - the downed delta is grid-only and must not make downed pawns count as viable workers.

The function signature changes:
```javascript
calculateViability(pawns, priorities, precepts, contextMap)
```

Callers (`renderDashboard()` at app-render.js:548) pass the contextMap they build.

- [ ] **Step 4: Migrate `getBottlenecks()` in engine.js**

Replace the `isCapable` closure (engine.js:114-117) to use coordinator contexts:

Before:
```javascript
const isCapable = (p, j) => {
  const key = p.id + ':' + j.id;
  if (!permCache.has(key)) permCache.set(key, this.evaluateJobPermission(p, j).status !== 'blocked');
  return permCache.get(key);
};
```

After (dual filter for parity - downed excluded via Availability):
```javascript
const isCapable = (p, j) => {
  var pCtx = contextMap.get(p.id);
  return pCtx.permission(j).state !== 'blocked'
    && pCtx.availability(j).state !== 'unavailable';
};
```

The function signature changes to accept a contextMap parameter.

- [ ] **Step 5: Update `renderDashboard()` to build and pass contextMap**

In `renderDashboard()` at app-render.js:548-549, build a contextMap and pass it to both `calculateViability` and `getBottlenecks`:

```javascript
const contextMap = new Map();
this.state.pawns.forEach(p => contextMap.set(p.id,
  C7EvaluationCoordinator.createPawnContext(p, { definitionSnapshot: App._c4DefinitionSnapshot() })));
const viability = Engine.calculateViability(this.state.pawns, this.state.priorities, this.state.precepts, contextMap);
const alerts = Engine.getBottlenecks(this.state.pawns, this.state.priorities, contextMap);
```

- [ ] **Step 6: Run tests and commit**

Run: `node test/run-tests.js`
Expected: All suites pass.

```
git add files/app-render.js files/engine.js test/c7-consumer-parity.test.js test/run-tests.js
git commit -m "C7: migrate summary counts, viability, and bottlenecks to coordinator"
```

---

### Task 2A: Packaged C5 Runtime Contract Bridge

**Goal:** Promote the audited RimWorld `1.6.4871 rev590` C5 runtime contract into the packaged application and combine it with the pawn-independent scanner provider through `EffectivenessDefinitionRegistry.createSnapshot()`. This prerequisite must complete before the first production C5 consumer in Task 3.

**Files:**
- Create: `files/c5-runtime-contract.js`
- Create: `files/c5-definition-snapshot-factory.js`
- Modify: `main.js` (emit installed runtime fingerprint with scanner output)
- Modify: `files/rimjobs.html` (load contract and factory before C7 consumers)
- Modify: `files/app-render.js` (request-boundary definition snapshot wiring)
- Modify: `test/_harness.js`
- Create: `test/c5-production-contract.test.js`
- Modify: C5 tests that consume the audit contract so the packaged module is authoritative
- Modify: `test/run-tests.js`

**Acceptance Criteria:**
- [ ] `C5RuntimeContract` is deeply immutable and exactly equivalent to the retained JSON audit fixture
- [ ] Release packaging includes the contract through the existing `files/**/*` rule
- [ ] Scanner output carries the installed display version and Assembly-CSharp hash when both are readable
- [ ] Missing or mismatched runtime identity produces no verified effectiveness snapshot
- [ ] `C5DefinitionSnapshotFactory` alone combines the provider and contract through `EffectivenessDefinitionRegistry.createSnapshot()`
- [ ] Definition snapshots remain pawn-independent
- [ ] `_c7CoordinatorOptions()` receives the factory result without another C2/C3 evaluation
- [ ] A complete supported SkillDef resolves through the production path to a non-null C5 UI projection
- [ ] Missing/incompatible inputs remain canonical unknown rather than using audited formulas
- [ ] Contract and factory load before C7 production consumers

**Verify:** focused C5/C7 contract tests, syntax/static gates, and `node test/run-tests.js`.

**Commit:**
```bash
git commit -m "C5: package audited runtime contract for production consumers"
```

---

### Task 3: C5 Skill and Stat Display Migration

**Goal:** Migrate `App.effectiveSkill()` consumers in pawn cards, pawn manager, spotlight, and colony radar to C5 SkillFact projections. Preserve numeric parity except for the exact approved `creationGainAlreadyPersisted` display fixture. Add precision notices and partial/unknown annotations in tooltips. Do not introduce a `primarySkill`.

**Files:**
- Modify: `files/app-pawns.js:1343` (pawn manager skill grid)
- Modify: `files/app-pawns.js:1586` (spotlight skill cells)
- Modify: `files/app-pawns.js:1972` (inline skill refresh)
- Modify: `files/app-render.js:132` (pawn card skill display, if present)
- Modify: `files/charts.js:21` (colony radar averages)
- Create: `test/c7-skill-display-parity.test.js`
- Modify: `test/run-tests.js`

**Acceptance Criteria:**
- [ ] Displayed skill numbers match `App.effectiveSkill()` output for complete C5 reports except the exact `creationGainAlreadyPersisted` fixture, where canonical C5 `10` replaces legacy double-counted `12`
- [ ] Passion glyphs and colours unchanged - raw passion identity preserved
- [ ] Colony radar values match C1 for complete skills except when an axis contains the exact approved `creationGainAlreadyPersisted` display correction
- [ ] Partial/unknown C5 reports add tooltip annotation without changing the displayed number
- [ ] Option A rounded-C3-capacity precision notices appear in affected stat tooltips
- [ ] No `primarySkill` selection in any code path
- [ ] `App.effectiveSkill()` remains available as a legacy adapter until Task 9
- [ ] The display correction does not alter auto-assign, `_bestPawnForJob`, analyser ranking, viability, or other frozen C1 policy calculations

**Verify:** `node test/run-tests.js` - all suites pass, new skill parity suite has 15+ checks.

**Steps:**

- [ ] **Step 1: Write skill display parity tests**

Create `test/c7-skill-display-parity.test.js`. Test that C5 SkillFact projection returns the same value as `effectiveSkill()` for known test pawns, except for the causal `creationGainAlreadyPersisted` fixture:

```javascript
const { loadScripts } = require('./_harness');

module.exports = function run() {
  let total = 0, failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) { failures++; console.log('  FAIL ' + label); }
  };

  // ... loadScripts with C5 modules ...

  // C7-SKILL-001: C5 skill projection matches effectiveSkill for vanilla pawn
  // C7-SKILL-002: Passion glyph from C5 matches _passionMeta output
  // C7-SKILL-003: Colony radar average from C5 matches effectiveSkill average
  // C7-SKILL-004: No primarySkill in C5 report structure
  // C7-SKILL-005: Partial C5 report preserves numeric value with annotation flag
  // C7-SKILL-DELTA-CREATION: stored 10 + persisted childhood gain 2 => C1 12, C5 display 10

  return { name: 'C7 skill display parity', total, failures };
};
```

- [ ] **Step 2: Add C5 skill projection helper**

Add to `files/app-pawns.js`. This uses the actual `StructuralSkillResolver.resolve(c5Context, skillDefId)` API which returns a SkillFact with these fields (verified at `structural-skill-resolver.js:172-193`):

```javascript
  _c5SkillProjection(pawnCtx, skillDefId) {
    var skillFact = StructuralSkillResolver.resolve(pawnCtx.c5Context, skillDefId);
    var level = null;
    var completeness = skillFact.completeness || 'unknown';
    if (skillFact.runtimeGetLevelForUIProjection != null) {
      level = skillFact.runtimeGetLevelForUIProjection;
    } else if (skillFact.runtimeGetLevelProjection != null) {
      level = skillFact.runtimeGetLevelProjection;
    }
    return {
      level: level,
      isProjection: true,
      completeness: completeness,
      state: skillFact.state,
      precision: skillFact.storedLevelInt && skillFact.storedLevelInt.state === 'known'
        ? null : 'approximate',
      unresolved: skillFact.unresolved || [],
    };
  },
```

**Actual SkillFact shape** (from `structural-skill-resolver.js:172`):
- `state`: `'resolved'|'partial'|'unknown'`
- `completeness`: `'complete'|'partial'|'unknown'`
- `runtimeGetLevelProjection`: effective level (stored + aptitude, clamped, zeroed if disabled) - matches `effectiveSkill()` for complete reports except explicitly approved C5 display deltas such as `creationGainAlreadyPersisted`
- `runtimeGetLevelForUIProjection`: same but using permanent disablement only (shows level for temporarily disabled skills)
- `storedLevelInt`: `{state, value}` - the raw stored level
- `runtimeAptitude`: `{state, value, contributions, unresolved}` - gene/xenotype offsets
- `unresolved`: array of unresolved factors

This is a UI projection for a known display location, not canonical primarySkill selection. When `completeness` is not `'complete'`, the tooltip shows a precision notice. When `level` is null (unknown), fall back to `effectiveSkill()` for migration safety.

The `creationGainAlreadyPersisted` approval is display-only. It does not authorise any change to auto-assign, `_bestPawnForJob`, analyser ranking, viability, or another consumer that still uses its frozen C1 compatibility projection. Any other complete supported C5 display difference must stop Task 3 for individual review.

- [ ] **Step 3: Migrate pawn manager skill display**

At `app-pawns.js:1343`, replace `this.effectiveSkill(p, s.id)` with the C5 projection where a coordinator context is available. During this task, build the context at the pawn manager render boundary and pass it through.

- [ ] **Step 4: Migrate colony radar**

At `charts.js:21`, replace `App.effectiveSkill(p, s.id)` with C5 projection:

Before:
```javascript
const total = list.reduce((sum, p) => sum + App.effectiveSkill(p, s.id), 0);
```

After:
```javascript
const total = list.reduce((sum, p) => {
  var pCtx = radarCtxMap.get(p.id);
  if (!pCtx) return sum + App.effectiveSkill(p, s.id);
  var proj = App._c5SkillProjection(pCtx, s.id);
  return sum + (proj.level != null ? proj.level : App.effectiveSkill(p, s.id));
}, 0);
```

Build `radarCtxMap` at the call site in `renderDashboard()`. Falls back to `effectiveSkill()` when the C5 projection returns null (unknown completeness).

- [ ] **Step 5: Run tests and commit**

Run: `node test/run-tests.js`
Expected: All suites pass.

```
git add files/app-pawns.js files/charts.js test/c7-skill-display-parity.test.js test/run-tests.js
git commit -m "C7: migrate skill and stat displays to C5 projections"
```

---

### Task 4: evaluatePawnJob Consumer Decomposition

**Goal:** Replace direct `Engine.evaluatePawnJob()` calls in `calculateWorkCapacity()` and `calculateTemporalCoverage()` with coordinator-mediated C4/C5 inputs. The `evaluatePawnJob()` function itself remains as a legacy adapter during migration but gains no new callers.

**Files:**
- Modify: `files/engine.js:48-62` (`calculateWorkCapacity`)
- Modify: `files/engine.js:228-300` (`evaluatePawnJob` - add deprecation comment)
- Modify: `files/engine.js:311-315` (`passionBucket` - route through coordinator when available)
- Modify: `files/engine.js:848-881` (`calculateTemporalCoverage` - C4 Permission + Availability)
- Modify: `test/c7-consumer-parity.test.js` (add calculateWorkCapacity and temporalCoverage parity)

**Acceptance Criteria:**
- [x] `calculateWorkCapacity()` accepts coordinator context and no longer calls `evaluatePawnJob()`
- [x] Its scalar remains the explicitly frozen `C5LegacyCompatibility.evaluateLegacyJobWorkSpeed()` C7 policy projection; no canonical scalar effectiveness score is introduced
- [x] `calculateTemporalCoverage()` uses C4 Permission + Availability instead of `evaluatePawnJob()` when coordinator context is supplied
- [x] Permission participation is explicitly `allowed | unknown`; Availability participation is explicitly `available | unknown`
- [x] Availability filter added to temporal coverage: unavailable pawns excluded from hourly counts
- [x] `evaluatePawnJob()` is not called by any migrated consumer
- [x] `passionBucket()` resolves only the exact or uniquely mapped requested SkillDef when coordinator context is available, and falls back to legacy otherwise
- [x] Numeric output parity maintained for all non-delta cases

**Verify:** `node test/run-tests.js` - all suites pass.

**Steps:**

- [x] **Step 1: Add parity tests for calculateWorkCapacity and calculateTemporalCoverage**

Add to `test/c7-consumer-parity.test.js`:

```javascript
// C7-WC-001: calculateWorkCapacity output matches C1 baseline
// C7-TC-001: temporal coverage array matches C1 for healthy pawns
// C7-TC-002: downed pawn excluded from coverage via Availability (not Permission)
// C7-TC-003: unknown pawn included in coverage (not proven blocked)
```

- [x] **Step 2: Migrate calculateTemporalCoverage**

At engine.js:848, replace `evaluatePawnJob` with coordinator:

Before:
```javascript
const ev = this.evaluatePawnJob(p, job);
if (ev.permission.status !== 'blocked') {
  capable.push(p);
}
```

After:
```javascript
var pawnCtx = contextMap.get(p.id);
var perm = pawnCtx.permission(job);
if (perm.state === 'blocked') continue;
var avail = pawnCtx.availability(job);
if (avail.state === 'unavailable') continue;
capable.push(p);
```

This adds the Availability filter that was previously handled by `isIncapable()`'s downed check. The function signature changes to accept `contextMap`.

- [x] **Step 3: Migrate calculateWorkCapacity**

Remove `evaluatePawnJob` usage. Carry the request-scoped coordinator context at the boundary, but retain the frozen numeric speed through `C5LegacyCompatibility.evaluateLegacyJobWorkSpeed()`. C5 has plural structural facts and no canonical scalar effectiveness score.

- [x] **Step 4: Mark evaluatePawnJob as legacy adapter**

Add a comment at engine.js:228:
```javascript
// Legacy C1 aggregation surface. No new callers - consumers migrate to C7 coordinator.
```

- [x] **Step 5: Run tests and commit**

Actual verification before commit: focused 5 suites / 139 checks / 0 failures; full 50 suites / 35,272 checks / 0 skipped / 0 failures.

```
git add files/engine.js test/c7-consumer-parity.test.js
git commit -m "C7: decompose evaluatePawnJob consumers to coordinator inputs"
```

---

### Task 5: Analyser and Work Planner Migration

**Goal:** Migrate `Engine.analyzeColony()` and `Engine._bestPawnForJob()` to use the C7 coordinator, eliminating the duplicate `evaluatePawnJob()` call in `_bestPawnForJob`. Keep the frozen `(speed * 100) + (passion * 25)` ranking formula unchanged. Migrate the Work Planner UI in `app-priorities.js` to pass coordinator contexts.

**Files:**
- Modify: `files/engine.js:1204-1281` (`analyzeColony`)
- Modify: `files/engine.js:1283-1293` (`_bestPawnForJob`)
- Modify: `files/app-priorities.js:258-264,362` (Work Planner)
- Modify: `test/c7-consumer-parity.test.js` (add analyser parity tests)

**Acceptance Criteria:**
- [ ] `analyzeColony()` gaps, recommendations, and singlePoints output matches C1 except named deltas
- [ ] `_bestPawnForJob()` ranking unchanged: same pawn selected for same inputs
- [ ] No duplicate `evaluatePawnJob()` call - `_bestPawnForJob` reuses coordinator context
- [ ] Work Planner actions (Apply one, Apply all) use coordinator contexts
- [ ] `(speed * 100) + (passion * 25)` formula preserved verbatim in policy code
- [ ] No `primarySkill` or scalar canonical effectiveness score introduced

**Verify:** `node test/run-tests.js` - all suites pass.

**Steps:**

- [ ] **Step 1: Add analyser parity tests**

Add to `test/c7-consumer-parity.test.js`:

```javascript
// C7-ANA-001: analyzeColony gaps match C1 baseline
// C7-ANA-002: analyzeColony recommendations match C1 baseline
// C7-ANA-003: analyzeColony singlePoints match C1 baseline
// C7-ANA-004: _bestPawnForJob selects same pawn as C1
// C7-ANA-005: No duplicate evaluation - evMap built once per job
```

- [ ] **Step 2: Migrate analyzeColony to use coordinator**

Replace the `evMap` construction at engine.js:1213-1214:

Before:
```javascript
const evMap = new Map();
pawns.forEach(p => evMap.set(p.id, this.evaluatePawnJob(p, j)));
const capable = pawns.filter(p => evMap.get(p.id).permission.status !== 'blocked');
```

After (dual filter for parity - downed excluded via Availability):
```javascript
const capable = pawns.filter(p => {
  var pCtx = contextMap.get(p.id);
  return pCtx.permission(j).state !== 'blocked'
    && pCtx.availability(j).state !== 'unavailable';
});
```

The ranking data comes from the coordinator's C5 reports and legacy compatibility projections during migration.

- [ ] **Step 3: Migrate _bestPawnForJob to accept contextMap**

Before:
```javascript
_bestPawnForJob(capable, job) {
    const ranked = capable.map(p => {
      const ev = this.evaluatePawnJob(p, job);
      const skill = ev.skill.applicable ? ev.skill.level : 0;
      const passion = ev.skill.applicable ? ev.skill.passion : 0;
      const score = (ev.work.speed * 100) + (passion * 25);
      return { pawnId: p.id, pawnName: p.nickname || p.name, skill, passion, score, realSpeed: ev.work.speed, hasSkill: ev.skill.applicable };
    }).sort((a, b) => b.score - a.score);
    return ranked[0];
}
```

After: Accept `contextMap` and extract skill/passion/speed from coordinator-mediated sources. The scoring formula `(speed * 100) + (passion * 25)` remains verbatim. The coordinator provides the inputs; policy code owns the formula.

- [ ] **Step 4: Migrate Work Planner UI**

At `app-priorities.js:260,362`, `Engine.analyzeColony()` is called. Pass the coordinator contextMap built at the UI boundary.

- [ ] **Step 5: Run tests and commit**

```
git add files/engine.js files/app-priorities.js test/c7-consumer-parity.test.js
git commit -m "C7: migrate analyser and Work Planner to coordinator, eliminate duplicate evaluation"
```

---

### Task 6: Auto-Assign Parity Migration

**Goal:** Migrate `Engine.runMinMaxAssignment()` to use the C7 coordinator. Full priority-matrix parity: every cell must match C1 output except the three named C4 deltas. The frozen scoring formula and threshold tiers are preserved verbatim.

**Files:**
- Modify: `files/engine.js:317-447` (`runMinMaxAssignment`)
- Create: `test/c7-ranking-parity.test.js`
- Modify: `test/run-tests.js`

**Acceptance Criteria:**
- [ ] Full priority matrix matches C1 for the capability corpus test colonies
- [ ] Named C4 delta pawns gain eligibility and receive appropriate priority assignments
- [ ] Scoring formula `(realSpeed * 100) + (passion * 25) + role/xeno/gene/trait/mood bonuses` preserved verbatim
- [ ] Tie-breaking order unchanged (sort stability)
- [ ] Skillless job handling unchanged
- [ ] Mood preset overrides (panic/chill/night) unchanged
- [ ] `evaluatePawnJob()` no longer called by `runMinMaxAssignment()`
- [ ] Idempotence: running auto-assign twice produces the same matrix

**Verify:** `node test/run-tests.js` - all suites pass, new ranking parity suite has 20+ checks.

**Steps:**

- [ ] **Step 1: Write ranking parity tests**

Create `test/c7-ranking-parity.test.js`. Build test colonies and compare full priority matrices:

```javascript
// C7-RANK-001: Full matrix parity for standard 5-pawn colony (no deltas in play)
// C7-RANK-002: Causal delta - Violent pawn gains Firefight: construct Violent-trait pawn,
//   assert Firefight cell changes from excluded to candidate, assert ALL other jobs unchanged
// C7-RANK-003: Causal delta - Human Fishing age: construct child age < 7,
//   assert Fishing changes, assert all other jobs unchanged
// C7-RANK-004: Causal delta - Hauling+zero Manipulation: construct zero-Manipulation pawn,
//   assert Hauling changes, assert all other jobs unchanged
// C7-RANK-005: Downed pawn EXCLUDED from auto-assign (Availability filter, NOT a ranking delta)
// C7-RANK-006: Skillless job (hauling) assignment unchanged
// C7-RANK-007: Mood preset overrides unchanged
// C7-RANK-008: Idempotence - second run unchanged
// C7-RANK-009: Emergency handler (firefight/patient/bed_rest) all-P1 rule unchanged
// C7-RANK-010: Tie-breaking stability
```

- [ ] **Step 2: Migrate runMinMaxAssignment to coordinator**

Replace `evaluatePawnJob` at engine.js:332:

Before:
```javascript
pawns.forEach(p => evMap.set(p.id, this.evaluatePawnJob(p, j)));
const capable = pawns.filter(p => evMap.get(p.id).permission.status !== 'blocked');
```

After (dual filter for parity - downed excluded via Availability, matching C1's `evaluateJobPermission` which blocked downed at line 169):
```javascript
const capable = pawns.filter(p => {
  var pCtx = contextMap.get(p.id);
  return pCtx.permission(j).state !== 'blocked'
    && pCtx.availability(j).state !== 'unavailable';
});
```

Replace ranking data extraction to use coordinator:

Before:
```javascript
const ev = evMap.get(p.id);
const skill = ev.skill.applicable ? ev.skill.level : 0;
const passion = ev.skill.applicable ? ev.skill.passion : 0;
const realSpeed = ev.work.speed;
```

After:
```javascript
var pawnCtx = contextMap.get(p.id);
var hasSkill = !!j.skill;
var skill = hasSkill ? App.effectiveSkill(p, j.skill) : 0;
var passion = hasSkill ? Engine.passionBucket(p, j.skill) : 0;
var realSpeed = Engine.calculateRealWorkSpeed(p, j);
```

Note: During C7 parity migration, the ranking inputs continue using the legacy helpers (`effectiveSkill`, `passionBucket`, `calculateRealWorkSpeed`) to ensure exact numeric parity. The coordinator provides C4 Permission for eligibility filtering; C5 reports provide display-layer improvements but do not change ranking intelligence until C8.

The function signature changes to accept `contextMap`.

- [ ] **Step 3: Update autoAssignAll caller**

At `app-priorities.js:234`, build contextMap before calling:

```javascript
var contextMap = new Map();
this.state.pawns.forEach(p => contextMap.set(p.id,
  C7EvaluationCoordinator.createPawnContext(p, { definitionSnapshot: App._c4DefinitionSnapshot() })));
Engine.runMinMaxAssignment(this.state.pawns, this.state.roles, this.state.priorities, this._visibleJobs(), contextMap);
```

- [ ] **Step 4: Run tests and commit**

```
git add files/engine.js files/app-priorities.js test/c7-ranking-parity.test.js test/run-tests.js
git commit -m "C7: migrate auto-assign to coordinator with full priority-matrix parity"
```

---

### Task 7: Scheduler Phase 1 Mechanism-to-Policy Split

**Goal:** Split `optimizeSchedules()` Phase 1 identity-based profiling (engine.js:469-592) into two parts: (1) C6 mechanism consumption via `TemporalProfileResolver.resolve(c5Context)`, and (2) C7 scheduler policy that converts mechanism facts into hours, child rules, break mitigation, workload budgets, and shift assignments. Exact schedule array parity required.

**Files:**
- Modify: `files/engine.js:469-592` (`optimizeSchedules` Phase 1)
- Create: `test/c7-scheduler-parity.test.js`
- Modify: `test/run-tests.js`

**Acceptance Criteria:**
- [ ] Exact 24-hour schedule array parity for all test pawns
- [ ] Rationale report text unchanged (driver strings preserved)
- [ ] C6 mechanism facts consumed: `rest.needState`, rest StatEvaluations, recreation recommendations, `windows` (Night Owl avoidHours), `conditions` (UV avoidCondition), activities
- [ ] UV sensitivity avoid hours read from C6 `conditions` dimension (`condition:'daylight'`, `fallbackHours:{start:6,end:18}`) - NOT from `windows`
- [ ] Undergrounder exemption remains as C7 policy trait check - Undergrounder is in `_SKIP_TRAITS`, NOT emitted by C2, NOT in C6
- [ ] C7 policy owns: sleep hours, joy hours, meditate hours, work hours, workload budget, child rules, break-risk mitigation, Undergrounder interpretation, mood presets, depressive/neurotic checks
- [ ] Temporal coverage NOT fabricated with hardcoded `completeness:'complete'` - derived from C2's `_temporalFamilyCoverage`
- [ ] Each activity's `compositionResolved` inspected - unresolved composition skips meditation hours
- [ ] Rest dimension completeness inspected via `tp.dimensions.rest.completeness`
- [ ] Legacy `sleepHoursOverride` consumed from `rest.compatibility` only inside the explicit legacy-parity projection
- [ ] No identity-based branching (trait/gene/hediff names) in the C6 consumption path (Undergrounder check is C7 policy, not C6 consumption)

**Verify:** `node test/run-tests.js` - all suites pass, new scheduler parity suite has 30+ checks.

**Steps:**

- [ ] **Step 1: Write scheduler parity tests**

Create `test/c7-scheduler-parity.test.js`. Build test profiles and compare schedule arrays:

```javascript
const { loadScripts } = require('./_harness');

module.exports = function run() {
  let total = 0, failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) { failures++; console.log('  FAIL ' + label); }
  };

  // ... loadScripts with all modules ...

  // Build a pawn, run C1 optimizeSchedules, capture schedule.
  // Build same pawn, run C7 optimizeSchedules, compare schedule.

  // C7-SCHED-001: Normal pawn - exact 24h array match
  // C7-SCHED-002: Night Owl pawn - avoid hours from C6 windows (11-17), sleep slot match
  // C7-SCHED-003: UV-sensitive pawn - avoid hours from C6 conditions (daylight fallback 6-18), night shift match
  // C7-SCHED-004: Quick Sleeper - 6h sleep block match (rest.compatibility.sleepHoursOverride = 6)
  // C7-SCHED-005: Low Sleep gene - 3h sleep block match (rest.compatibility.sleepHoursOverride)
  // C7-SCHED-006: Sleepless gene - 0h sleep match (rest.needState = 'suppressed')
  // C7-SCHED-007: Body Mastery - 0h sleep match (rest.compatibility.sleepHoursOverride = 0)
  // C7-SCHED-008: Psycaster - meditation block match (C6 activities with compositionResolved check)
  // C7-SCHED-009: Young child - no work block match (C7 policy, not C6)
  // C7-SCHED-010: Baby - free schedule match (C7 policy, not C6)
  // C7-SCHED-011: Downed pawn - all-Anything schedule match (C7 policy, not C6)
  // C7-SCHED-012: Ascetic - reduced joy match (C6 recreation delta = -1)
  // C7-SCHED-013: Depressive/neurotic - extra joy match (C7 policy trait check, not C6)
  // C7-SCHED-014: High break risk - extra joy match (C7 policy, not C6)
  // C7-SCHED-015: Heavy workload - extended work block match
  // C7-SCHED-016: Critical specialist - doctor/cook stagger order match
  // C7-SCHED-017: Rationale driver strings match
  // C7-SCHED-018: Undergrounder+UV - UV avoid hours excluded (C7 policy trait check, Undergrounder NOT in C6)
  // C7-SCHED-019: UV+non-Undergrounder - UV avoid hours applied from conditions dimension
  // C7-SCHED-020: Meditation with unresolved composition - meditation hours not applied

  return { name: 'C7 scheduler parity', total, failures };
};
```

- [ ] **Step 2: Extract C6 mechanism consumption**

Add a `_c7TemporalInputs(pawnCtx, pawn)` helper to engine.js that reads C6 mechanism facts and maps them to the scheduler's input vocabulary.

**Critical C6 dimension corrections (verified against production C2/C6 code):**
- **UV sensitivity** emits `avoidCondition` evidence (type `'avoidCondition'`, `condition: 'daylight'`, `fallbackHours: {start:6, end:18}`) at `capability-evidence.js:1835`. This lives in the C6 `conditions` dimension, NOT `windows`.
- **Night Owl** emits `avoidHours`/`preferHours` evidence at `capability-evidence.js:1399-1410`. This lives in the C6 `windows` dimension.
- **Undergrounder** is in `_SKIP_TRAITS` at `capability-evidence.js:1436` - C2 does NOT emit temporal evidence for it. Undergrounder is NOT present in C6 temporal profiles at all. Undergrounder interpretation MUST remain as C7 policy reading the trait directly.

```javascript
_c7TemporalInputs(pawnCtx, pawn) {
  var tp = pawnCtx.temporalProfile();

  // Rest mechanism
  var restNeedState = tp.rest.needState;
  var sleepHoursFromC6 = null;
  if (tp.rest.compatibility && tp.rest.compatibility.sleepHoursOverride != null) {
    sleepHoursFromC6 = tp.rest.compatibility.sleepHoursOverride;
  }
  // Inspect rest StatEvaluation quality - dimension-level completeness alone is
  // insufficient; individual stat precision affects sleep calculation reliability
  var restDimension = tp.dimensions && tp.dimensions.rest || {};
  var restComplete = restDimension.completeness === 'complete';

  // Recreation mechanism
  var recreationDelta = 0;
  (tp.recreation.recommendations || []).forEach(function (rec) {
    recreationDelta += (rec.delta || 0);
  });

  // Windows mechanism (Night Owl avoidHours/preferHours live here)
  var avoidHoursFromWindows = new Set();
  (tp.windows || []).forEach(function (w) {
    if (w.kind === 'avoid') {
      (w.hours || []).forEach(function (h) { avoidHoursFromWindows.add(h); });
    }
  });

  // Conditions mechanism (UV sensitivity avoidCondition lives here, NOT windows)
  var avoidHoursFromConditions = new Set();
  (tp.conditions || []).forEach(function (c) {
    if (c.condition === 'daylight' && c.policy && c.policy.fallbackHours) {
      for (var h = c.policy.fallbackHours.start; h < c.policy.fallbackHours.end; h++) {
        avoidHoursFromConditions.add(h);
      }
    }
  });

  // Merge avoid hours from both dimensions
  var avoidHours = new Set(avoidHoursFromWindows);
  avoidHoursFromConditions.forEach(function (h) { avoidHours.add(h); });

  // Activities mechanism - inspect compositionResolved per activity
  var meditateRequired = false;
  var meditateRecommended = false;
  (tp.activities || []).forEach(function (a) {
    if (a.activity === 'meditation') {
      if (!a.compositionResolved) return;
      if (a.obligation === 'required') meditateRequired = true;
      else meditateRecommended = true;
    }
  });

  return {
    restNeedState: restNeedState,
    restComplete: restComplete,
    sleepHoursOverride: sleepHoursFromC6,
    recreationDelta: recreationDelta,
    avoidHoursFromWindows: avoidHoursFromWindows,
    avoidHoursFromConditions: avoidHoursFromConditions,
    avoidHours: avoidHours,
    hasMeditationObligation: meditateRequired || meditateRecommended,
  };
},
```

- [ ] **Step 3: Rewrite Phase 1 to consume C6 inputs and apply C7 policy**

Replace the identity-based profiling block (engine.js:482-592). The key change: instead of checking trait/gene names directly, read from the C6 temporal inputs, then apply C7 policy for hours, child rules, and break risk.

The policy block preserves C1 hour calculations verbatim:

```javascript
// C7 policy: sleep hours
var sleepHours = 8;
if (c6Inputs.restNeedState === 'suppressed') {
  sleepHours = 0;
} else if (c6Inputs.sleepHoursOverride != null) {
  sleepHours = c6Inputs.sleepHoursOverride;
}

// C7 policy: joy hours (break risk is C7 policy, not C6 mechanism)
var joyHours = 2;
// ... breakRisk, depressive, neurotic checks remain as C7 policy ...
// ... child extra play remains as C7 policy ...
// ... ascetic reduction remains as C7 policy ...
joyHours = Math.max(1, joyHours + c6Inputs.recreationDelta);

// C7 policy: meditation hours
var meditateHours = (c6Inputs.hasMeditationObligation && !isBaby) ? 2 : 0;

// C7 policy: avoid hours from C6 windows + conditions
// Undergrounder exemption is C7 policy (not in C6 - _SKIP_TRAITS).
// If pawn has Undergrounder trait, exclude UV condition avoid hours.
var isUndergrounder = Array.isArray(p.traits) && p.traits.includes('undergrounder');
var avoidAwake = new Set(c6Inputs.avoidHoursFromWindows);
if (!isUndergrounder) {
  c6Inputs.avoidHoursFromConditions.forEach(function (h) { avoidAwake.add(h); });
}

// C7 policy: night shift need
var needsNight = avoidAwake.size > 0;
```

**Critical parity note:** Break risk, child rules, workload budgets, Undergrounder interpretation, mood presets, and critical-specialist stagger remain in C7 policy code. They read pawn fields directly (traits for break thresholds, bioAge for child detection, downed flag for schedule skip). This is correct - these are policy decisions, not mechanism facts. C6 provides the temporal evidence; C7 decides what to do with it.

**Identity branching boundary:** The Phase 1 code currently checks `traits.includes('night_owl')`, `traits.includes('undergrounder')`, `traits.includes('ascetic')`, `traits.includes('depressive')`, `traits.includes('neurotic')`, etc. After this task:
- Night Owl -> consumed from C6 `windows` (avoidHours/preferHours)
- UV sensitivity -> consumed from C6 `conditions` (avoidCondition with `condition:'daylight'`, fallbackHours) - NOT windows
- **Undergrounder -> REMAINS as C7 policy reading trait directly.** Undergrounder is in `_SKIP_TRAITS` (capability-evidence.js:1436) - C2 does not emit temporal evidence for it. The Undergrounder exemption from UV avoidance is a scheduling policy decision, not a temporal mechanism fact. C7 policy applies it when interpreting `avoidHoursFromConditions`: if the pawn has the Undergrounder trait, the UV condition avoid hours are excluded from the merged set.
- Quick Sleeper, Low Sleep, Sleepless, Body Mastery -> consumed from C6 `rest.compatibility.sleepHoursOverride` and `rest.needState`
- Psycaster meditation -> consumed from C6 `activities` (only when `compositionResolved` is true)
- Ascetic recreation -> consumed from C6 `recreation.recommendations` delta
- Depressive, neurotic, break risk -> remain as C7 policy reading trait definitions directly (break thresholds are policy metadata, not temporal mechanism)
- Child/baby age rules -> remain as C7 policy (life-stage scheduling is C7 policy per frozen C6 design)

- [ ] **Step 4: Build coordinator contexts for scheduler**

At the top of `optimizeSchedules`, build contexts. Do NOT fabricate `temporalCoverage` with hardcoded `completeness: 'complete'`. Forward only the caller/provider-supplied C2 evidence options. `CapabilityEvidence._temporalFamilyCoverage()` derives coverage from `evidenceOptions.temporalCoverage`; if the caller/provider supplies no coverage, every temporal family remains `unknown` and C7 policy must use its named legacy fallback.

```javascript
var contextMap = new Map();
pawns.forEach(function (p) {
  var evidenceOptions = options && options.evidenceOptionsByPawn
    ? (options.evidenceOptionsByPawn.get(p.id) || {})
    : {};
  contextMap.set(p.id, C7EvaluationCoordinator.createPawnContext(p, {
    definitionSnapshot: App._c4DefinitionSnapshot(),
    evidenceOptions: evidenceOptions,
  }));
});
```

The coordinator forwards these evidence options unchanged into `CapabilityEvidence.collectPawnEvidence()`. The coordinator's `_c7TemporalInputs` helper inspects `tp.dimensions.rest.completeness` etc. from the resulting profile. If a dimension's completeness is not `'complete'`, the helper exposes that via `restComplete` so policy uses the explicit legacy fallback. No C7 helper may upgrade absent or partial coverage to complete.

- [ ] **Step 5: Run parity tests**

Run: `node test/run-tests.js`
Expected: All suites pass. Every test pawn produces the exact same 24-hour schedule array as C1.

- [ ] **Step 6: Commit**

```
git add files/engine.js test/c7-scheduler-parity.test.js test/run-tests.js
git commit -m "C7: split scheduler Phase 1 into C6 mechanism consumption and C7 policy"
```

---

### Task 8: Temporal Coverage and Resilience Migration

**Goal:** Migrate `calculateTemporalCoverage()`, `analyzeTemporalResilience()`, and `proposeTemporalAdjustments()` to use the C7 coordinator for Permission and Availability filtering. Add Availability filtering so downed pawns are excluded from hourly coverage counts (matching C1 combined effect).

**Files:**
- Modify: `files/engine.js:848-881` (`calculateTemporalCoverage` - if not already migrated in Task 4)
- Modify: `files/engine.js:883-921` (`analyzeTemporalResilience`)
- Modify: `files/engine.js:966-1040+` (`proposeTemporalAdjustments`)
- Modify: `files/app-pawns.js:2660` (per-pawn schedule reset)
- Create: `test/c7-temporal-parity.test.js`
- Modify: `test/run-tests.js`

**Acceptance Criteria:**
- [ ] Coverage array matches C1 for all supported cases
- [ ] Downed pawn excluded from coverage via Availability (not Permission) - same combined effect as C1
- [ ] Unknown permission pawns counted as potential coverage (PD-3)
- [ ] Gap/fragile/healthy thresholds unchanged (C7 policy constants)
- [ ] Resilience analysis output unchanged
- [ ] Proposal preconditions, improvements, and no-regression checks unchanged
- [ ] `evaluateJobPermission()` no longer called by temporal functions
- [ ] Per-pawn schedule reset uses coordinator for its schedule portion

**Verify:** `node test/run-tests.js` - all suites pass, new temporal parity suite has 20+ checks.

**Steps:**

- [ ] **Step 1: Write temporal parity tests**

Create `test/c7-temporal-parity.test.js`:

```javascript
// C7-TEMP-001: Coverage array for healthy colony matches C1
// C7-TEMP-002: Downed pawn excluded from all coverage hours
// C7-TEMP-003: Unknown pawn included in coverage (not proven blocked)
// C7-TEMP-004: Gap/fragile/healthy status strings match C1
// C7-TEMP-005: Resilience analysis gaps and fragile hours match C1
// C7-TEMP-006: Proposal generation matches C1 for same inputs
// C7-TEMP-007: Named delta - Violent pawn counts in Firefight coverage
```

- [ ] **Step 2: Ensure temporal functions accept and use contextMap**

If `calculateTemporalCoverage` was already migrated in Task 4, verify the Availability filter is correct. If not, apply the migration now.

For `analyzeTemporalResilience` at engine.js:883, pass contextMap through to `calculateTemporalCoverage`:

```javascript
analyzeTemporalResilience(pawns, jobs, schedules, contextMap) {
  // ...
  const coverage = this.calculateTemporalCoverage(pawns, schedMap, job, contextMap);
  // ...
}
```

For `proposeTemporalAdjustments` at engine.js:966, pass contextMap and use coordinator for `evaluateJobPermission` replacement:

Before:
```javascript
const capable = pawns.filter(p =>
  this.evaluateJobPermission(p, job).status !== 'blocked');
```

After:
```javascript
const capable = pawns.filter(p =>
  contextMap.get(p.id).permission(job).state !== 'blocked');
```

- [ ] **Step 3: Migrate per-pawn schedule reset**

At `app-pawns.js:2660`, the single-pawn `optimizeSchedules([p])` call needs a coordinator context:

```javascript
var singleCtxMap = new Map();
var evidenceOptions = App._c7EvidenceOptionsByPawn
  ? (App._c7EvidenceOptionsByPawn.get(p.id) || {})
  : {};
singleCtxMap.set(p.id, C7EvaluationCoordinator.createPawnContext(p, {
  definitionSnapshot: App._c4DefinitionSnapshot(),
  evidenceOptions: evidenceOptions,
}));
Engine.optimizeSchedules([p], singleCtxMap);
```

`App._c7EvidenceOptionsByPawn` is the optional request-scoped hand-off from the real C2/provider collection path. When it is absent, `{}` deliberately preserves unknown temporal coverage; it must never be replaced with a synthesized complete object.

- [ ] **Step 4: Run tests and commit**

```
git add files/engine.js files/app-pawns.js test/c7-temporal-parity.test.js test/run-tests.js
git commit -m "C7: migrate temporal coverage, resilience, and proposals to coordinator"
```

---

### Task 9: Legacy Adapter Deprecation and Final Parity Gate

**Goal:** Deprecate legacy shadow adapters (`C4LegacyCompatibility`, `C5LegacyCompatibility`) and legacy functions (`App.isIncapable()`, `Engine.evaluatePawnJob()`, `Engine.evaluateJobPermission()`), update CODE-MAP.md and INVARIANTS.md with C7 architecture, and run a final full regression gate. Shadow test suites are retained as historical regression coverage.

**Files:**
- Modify: `files/app-pawns.js:49-97` (`isIncapable` - deprecate or remove)
- Modify: `files/engine.js:228-300` (`evaluatePawnJob` - deprecate or remove)
- Modify: `files/engine.js:165-226` (`evaluateJobPermission` - deprecate or remove)
- Modify: `files/c4-legacy-compatibility.js` (add deprecation comment; remove script tag from rimjobs.html only after parity evidence accepted)
- Modify: `files/c5-legacy-compatibility.js` (add deprecation comment; remove script tag from rimjobs.html only after parity evidence accepted)
- Modify: `files/rimjobs.html` (remove script tags for deprecated adapters only if zero production callers confirmed)
- Modify: `docs/architecture/CODE-MAP.md` (add C7 section)
- Modify: `docs/architecture/INVARIANTS.md` (add C7 invariants)
- Modify: `test/c7-static-gates.test.js` (extend for all C7 files)

**Acceptance Criteria:**
- [ ] `App.isIncapable()` has no production callers (grep returns zero hits in `files/` excluding test files)
- [ ] `Engine.evaluatePawnJob()` has no production callers
- [ ] `Engine.evaluateJobPermission()` has no production callers
- [ ] C4 and C5 shadow adapters marked deprecated with removal milestone
- [ ] Shadow test suites RETAINED in `run-tests.js` as historical regression coverage
- [ ] All 44+ existing test suites still pass
- [ ] All new C7 test suites pass
- [ ] Static gates pass for coordinator module only (not engine.js or app modules)
- [ ] CODE-MAP.md documents C7 coordinator architecture
- [ ] INVARIANTS.md documents C7 behavioural invariants
- [ ] Commit uses explicit file staging (no `git add files/`, `git add test/`, or `git add -A`)
- [ ] Full regression: `node test/run-tests.js` reports 52+ suites, 0 failures

**Verify:** `node test/run-tests.js` - 52+ suites, 35,500+ checks, 0 failures.

**Steps:**

- [ ] **Step 1: Verify no production callers remain for legacy functions**

Run architecture searches:

```powershell
node -e "const {execSync}=require('child_process'); ['App.isIncapable','Engine.evaluateJobPermission','Engine.evaluatePawnJob','App.effectiveSkill'].forEach(fn => { const out = execSync('grep -rn \"'+fn+'\" files/ --include=\"*.js\"', {encoding:'utf8'}).trim(); console.log(fn+': '+(out ? out.split('\n').length : 0)+' hits'); console.log(out || '  (none)'); });"
```

Expected: Zero hits for `isIncapable`, `evaluateJobPermission`, and `evaluatePawnJob` in production files. `effectiveSkill` may have legacy display references if Task 3 preserved it as a fallback.

- [ ] **Step 2: Remove or deprecate legacy functions**

If zero production callers confirmed, remove `isIncapable()` from `app-pawns.js`, `evaluatePawnJob()` and `evaluateJobPermission()` from `engine.js`. Remove `passionBucket()` from `engine.js` if fully replaced.

If some callers remain (e.g. combat module intentionally unchanged), mark as deprecated with a comment:

```javascript
// @deprecated C7: legacy adapter retained for combat module only. Do not add new callers.
```

- [ ] **Step 3: Deprecate shadow adapters (do NOT remove test coverage)**

Mark `files/c4-legacy-compatibility.js` and `files/c5-legacy-compatibility.js` as deprecated with removal milestone comment. Remove their `<script>` tags from `rimjobs.html` ONLY if zero production callers confirmed. Do NOT remove shadow test suites from `run-tests.js` - these suites serve as historical regression coverage and prove the parity relationship. They continue to run and pass.

**Gate:** Shadow adapters may ONLY have their script tags removed after all C7 consumer parity tests pass and the user has reviewed the named delta evidence. If the user has not yet reviewed, mark the adapters as `@deprecated` but retain both modules and tests.

- [ ] **Step 4: Verify static gate test scope**

Confirm `test/c7-static-gates.test.js` scans ONLY `c7-evaluation-coordinator.js`. Do NOT extend to `engine.js`, `app-render.js`, or other app modules - those contain legitimate C7 policy code (trait-based break thresholds, child age rules, Undergrounder exemption, effectiveSkill fallbacks, etc.) that would false-positive on gates SG-2 and SG-7.

- [ ] **Step 5: Update CODE-MAP.md**

Add a C7 section after the C6 section:

```markdown
## C7 Consumer Parity Migration

**Primary files:**
- `files/c7-evaluation-coordinator.js` - request-scoped coordinator (`createPawnContext`)

**API:**
- `C7EvaluationCoordinator.createPawnContext(pawn, options)` - builds one shared C2/C3 evidence set, provides memoised C4 Permission/Availability per job, C5 context, lazy C6 temporal profile

**Dependencies:** C2 (`CapabilityEvidence`), C3 (`CapacityResolver`), C4 (`PermissionResolver`, `AvailabilityResolver`, `RequirementRegistry`), C5 (`StructuralEffectivenessContext`), C6 (`TemporalProfileResolver`)

**Output:**
| Method | Returns |
|--------|---------|
| `permission(job)` | C4 Permission report with `state: 'allowed'\|'blocked'\|'unknown'` |
| `availability(job)` | C4 Availability report with `state: 'available'\|'unavailable'\|'unknown'` |
| `c5Context` | Frozen `StructuralEffectivenessContext` for C5 reporters |
| `temporalProfile()` | Lazily resolved C6 `TemporalProfile` |
| `legacyShadow(job)` | Migration-time shadow comparison (removed after adapter removal) |

**Shadow-only:** No. C7 is the production consumer migration.

**Consumers:** Priority grid, summary counts, viability, bottlenecks, auto-assign, analyser, Work Planner, scheduler, temporal coverage/resilience/proposals, skill/stat displays.
```

- [ ] **Step 6: Update INVARIANTS.md**

Add C7 invariants between the C6 section and Save Editing:

```markdown
### C7 Consumer Parity Migration

| Invariant | Description | Regression coverage |
|-----------|-------------|---------------------|
| C7-001 | createPawnContext returns a frozen context with no cross-request state | c7-evaluation-coordinator.test.js C7-COORD-001, C7-COORD-006 |
| C7-002 | Permission and Availability are peers; neither derives from the other | c7-grid-parity.test.js C7-GRID-003, C7-GRID-010 |
| C7-003 | Only three named C4 deltas are permitted; all others are regressions | c7-ranking-parity.test.js named delta whitelist |
| C7-004 | Unknown permission is projected as "not proven blocked", never as canonical allowed | c7-consumer-parity.test.js C7-SUM-003 |
| C7-005 | No primarySkill selection or scalar canonical effectiveness score | c7-static-gates.test.js SG-1 |
| C7-006 | Ranking formula (speed*100 + passion*25) frozen as C7 policy | c7-ranking-parity.test.js C7-RANK-001 |
| C7-007 | C6 mechanism facts consumed; C7 policy owns hours and schedule construction | c7-scheduler-parity.test.js C7-SCHED-001 |
| C7-008 | Temporal coverage filters on Availability (current-state metric) | c7-temporal-parity.test.js C7-TEMP-002 |
| C7-009 | No long-lived cache, WeakMap, or cross-request memoisation | c7-static-gates.test.js SG-3 |
| C7-010 | Legacy shadow adapters removed only after all parity evidence reviewed | Gate in Task 9 Step 3 |
```

- [ ] **Step 7: Run final full regression**

Run: `node test/run-tests.js`
Expected: 52+ suites, 35,500+ checks, 0 skipped, 0 failures.

- [ ] **Step 8: Commit**

Name every file explicitly - no `git add files/`, `git add test/`, or `git add -A`:

```
git add files/app-pawns.js files/engine.js files/rimjobs.html docs/architecture/CODE-MAP.md docs/architecture/INVARIANTS.md test/c7-static-gates.test.js
git commit -m "C7: deprecate legacy adapters, document C7 architecture and invariants"
```

If shadow adapter modules were deprecated (not removed), they are NOT staged. If their script tags were removed from rimjobs.html, that change is already in the staged rimjobs.html. No broad directory-level staging.

---

## Deferred to C8

The following are explicitly out of scope for C7 and must not be implemented during this migration:

1. **Redesigned ranking/assignment exploiting plural C5 facts** - C8 owns this
2. **New dashboard count categories** (structurally-capable, currently-available) - PD-4
3. **Smarter viability scoring** - Survival Index remains a C1 policy score
4. **Availability-aware auto-assign** - C8 territory; would break parity
5. **Time-aware recommendations** in Work Planner
6. **Colony radar redesign** for plural SkillDefs
7. **Combat module migration** - intentionally unchanged by C7 work migration

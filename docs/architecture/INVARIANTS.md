# Behavioural Invariants

Non-obvious rules discovered from bugs. Check these before modifying the relevant subsystem.

---

## Work Priorities

### WORK-001: Skillless jobs must never fall back to another skill

`job.skill === null` means the job is genuinely skillless (hauling, cleaning, firefighting, patient, bed rest).

Never substitute Intellectual or any other skill for scoring, optimisation, best-pawn selection, or UI display.

`_bestPawnForJob()` returns `hasSkill: false` for skillless jobs. The UI must check this before rendering a skill level.

**Origin:** Hauling and cleaning displayed "Skill 0" in the Work Planner because the code fell back to `job.skill || 'intellectual'`.

**Regression coverage:** `test/engine.optimiser.test.js`

### WORK-002: Auto-assign owns P1-P4 only; P5+ are manual-only extended values

RimJobs owns automatic priority semantics only for P1-P4. Priorities above P4 are valid extended manual values and must be preserved and rendered, but no automatic assignment or optimiser action may generate them.

`PriorityScale` (in `data.js`) encodes this boundary:
- `PriorityScale.highest` (1) - highest priority, used for emergency jobs
- `PriorityScale.autoMax` (4) - ceiling for auto-assign/optimiser output
- `PriorityScale.manualMax` (4+ configurable) - ceiling for user interaction

Auto-assign output must satisfy: `value === null || PriorityScale.isAuto(value)`.

Running Auto-Assign may overwrite a manual P5+ value. P5+ does not imply "locked".

Simple mode "enabled" is always `PriorityScale.defaultEnabled()` (3), regardless of the manual scale width.

**Origin:** Architectural "what if" analysis for mod-expanded priority scales.

**Regression coverage:** `test/engine.optimiser.test.js` (extended-scale, overwrite-p5, cycling, isValid checks)

### WORK-003: C7 is the production work-capability aggregation boundary

`C7EvaluationCoordinator.createPawnContext(pawn, options)` is the production request boundary for migrated work consumers. It shares one C2 evidence collection and one C3 capacity resolution with C4 Permission/Availability, C5 structural facts, and C6 temporal facts. `Engine.evaluatePawnJob()` and `Engine.evaluateJobPermission()` are deprecated C1 compatibility/test surfaces, not production aggregation architecture.

Decision engines (`_bestPawnForJob`, `analyzeColony`, `runMinMaxAssignment`, `calculateWorkCapacity`, `getBottlenecks`, `calculateViability`) consume request-scoped C7 contexts and apply explicit policy projections. They must not duplicate C2/C3 evaluation or invent a canonical scalar effectiveness score.

`App.isIncapable()` remains only for context-free legacy API compatibility and historical C1 evidence. Packaged C7 request paths use structural `allowed | blocked | unknown` Permission and independent current `available | unavailable | unknown` Availability.

**Origin:** Intelligence architecture refactor - single source of truth before new reasoning.

**Regression coverage:** `test/engine.optimiser.test.js` (shape, skillless, regression parity, blocked/allowed permission, analyzeColony parity)

### WORK-005: Temporal coverage is diagnostic, not prescriptive

`calculateTemporalCoverage` and `analyzeTemporalResilience` report hourly capability gaps and fragile coverage for critical jobs (Doctor, Firefight). They do not mutate schedules or priorities.

Coverage status: `gap` (0 capable pawns awake), `fragile` (1 - single-point risk), `healthy` (2+). The optimiser may suggest schedule changes to fix gaps but must not apply them without user confirmation.

`TEMPORAL_CRITICAL` defines which jobs require 24-hour coverage monitoring. Not every job needs continuous coverage.

**Origin:** Phase B temporal intelligence - capability-aware shift coverage.

**Regression coverage:** `test/engine.optimiser.test.js` (TC-001 through TC-009, TP-001 through TP-009, TA-001 through TA-007)

### WORK-004: C7 migration must not alter automatic assignment outcomes

Consuming canonical C4/C5 facts through C7 must not alter automatic assignment outcomes unless the behaviour change is explicitly scoped and regression-tested.

Full-matrix parity (every pawnId x jobId cell identical) is required for `runMinMaxAssignment`. Gap/recommendation parity is required for `analyzeColony`. New intelligence may only be introduced after parity is proven, as a separate deliberate change.

**Origin:** Safety boundary for intelligence architecture migration.

**Regression coverage:** `test/engine.optimiser.test.js` (full-matrix fixtures for runMinMaxAssignment, analyzeColony parity checks)

---

## Canonical Permission and Availability (C4)

These invariants target RimWorld `1.6.4871 rev590`. C4 remains pure canonical mechanism; C7 now projects its peer Permission and Availability reports into production planning and UI policy.

### C4-001: Permission and Availability are independent peer outputs

Permission answers whether durable structure permits a job. Availability answers whether current state and current capacity permit it now. Neither report derives from or overrides the other, so all combinations are valid, including `blocked + available` and `allowed + unavailable`.

Temporary hediff state, downed, mental state, deactivation, unconscious state, and other current facts must never become structural Permission merely because they block work now.

**Regression coverage:** `test/availability-resolver.test.js` (AR-026 through AR-032), `test/c4-compatibility.test.js` (CC-012 through CC-013)

### C4-002: Permission target namespaces are exact and separate

A `disableJob` target is a RimJobs job ID, a `disableWorkType` target is a `WorkTypeDef` name, and a `disableWorkTag` target is an exact canonical `Verse.WorkTags` identifier/flag. No namespace is guessed from another and no canonical resolver interprets legacy `incapBlocks` spellings.

Raw ambiguous strings are never parsed in C4. Structured candidates supplied by C2 may resolve only when every plausible candidate has the same result for the evaluated job; mixed candidate outcomes remain unknown.

**Regression coverage:** `test/capability-evidence.test.js` (CE-C4P), `test/permission-resolver.test.js` (PR-002 through PR-013)

### C4-003: Unknown propagates only when it is relevant

Missing, partial, unsupported, or ambiguous evidence affects a report only when its structured target or requirement can change that job's outcome. An unrelated unknown must not poison the job. A confirmed blocker and relevant unknown are both retained in the report; blocker precedence does not erase diagnostics.

Absence of a tri-state current fact is unknown unless the audited parser/runtime contract explicitly proves false.

**Regression coverage:** `test/permission-resolver.test.js` (PR-010 through PR-013), `test/availability-resolver.test.js` (AR-009 through AR-011, AR-025)

### C4-004: WorkGiver alternatives are OR; capacities within a path are AND

Each verified WorkGiver execution path succeeds only when all of its capacity requirements succeed. A job succeeds when any complete path succeeds. A successful alternative masks failed/unknown alternatives for the aggregate outcome without deleting their explanatory evaluations.

A complete zero-capacity path is represented by `allOf: []` and succeeds. It is not equivalent to `paths: []`: a complete empty catalogue fails, while an incomplete empty catalogue is unknown.

**Regression coverage:** `test/c4-audit-contract.test.js`, `test/requirement-registry.test.js` (RR-006 through RR-014), `test/permission-resolver.test.js` (PR-034 through PR-039), `test/availability-resolver.test.js` (AR-017 through AR-019)

### C4-005: Capacity thresholds are strict and notApplicable is explicit

Capability uses the runtime predicate `value > minForCapable`; equality fails. `notApplicable` is a distinct fact and is never converted to numeric zero. Each requirement carries an explicit `satisfied`, `blocked`, or `unknown` policy for that state.

**Regression coverage:** `test/requirement-registry.test.js` (RR-009 through RR-012), `test/permission-resolver.test.js` (PR-027 through PR-033), `test/availability-resolver.test.js` (AR-012 through AR-016)

### C4-006: Race identity is an opaque registry key

Canonical resolution may perform `raceDefName -> RaceWorkPolicy -> WorkType entry`. It must never branch on a race name, body name, gene identity, xenotype identity, trait identity, hediff identity, or prosthetic identity to invent work semantics.

Known gate, known no gate, and unknown are distinct. A missing WorkType entry proves no gate only when that race's work-setting catalogue is complete.

**Regression coverage:** `test/requirement-scanner.test.js` (RS-010 through RS-013), `test/requirement-registry.test.js` (RR-015 through RR-019, RR-023), `test/permission-resolver.test.js` (PR-021 through PR-026, PR-042)

### C4-007: Canonical C4 consumes C2, C3, and definitions—not raw pawn semantics

Permission and Availability consume canonical C2 evidence, C3 capacity output, and the immutable requirement snapshot. They do not read raw pawn health arrays, raw `pawn.incapable`, XML parser fields, or legacy constants. C4 must not change C3 capacity semantics or reconstruct C3's accepted capability-definition bundle from requirement-registry data.

**Regression coverage:** `test/permission-resolver.test.js` (PR-041), `test/availability-resolver.test.js` (AR-001 through AR-004, AR-030)

### C4-008: The evaluation context is request-scoped and immutable

One context performs one C2 collection and one C3 resolution for a pawn evaluation batch, then shares those frozen facts across jobs. There is no long-lived revision cache, manual invalidation path, or second mutable source of truth in C4.

**Regression coverage:** `test/availability-resolver.test.js` (AR-001 through AR-008, AR-031)

### C4-009: Legacy compatibility is explicit and shadow-only

`C4LegacyCompatibility` delegates legacy truth to unchanged `Engine.evaluateJobPermission()` and `App.isIncapable()`. `incapBlocks`, `JOB_MIN_AGE`, and `MANIPULATION_GATED_JOBS` remain isolated to the legacy path. Canonical unknown never projects to incapable.

Known Firefight/Violent, Human Fishing age, Anomaly Hauling, downed decomposition, and app-job differences are named shadow results, not production changes.

**Regression coverage:** `test/capability-corpus.test.js`, `test/c4-compatibility.test.js`

### C4-010: C4 does not migrate consumers or policy

No planning, assignment, viability, bottleneck, summary, scheduling, priority, or renderer consumer may call C4 during Phase C4. Critical-job policy remains in its existing consumer layer. C7 owns parity-proven consumer/UI migration; C8 owns deliberately smarter behaviour. C4 must not change ranking, effectiveness, or capacity formulas.

**Regression coverage:** Task 8 static architecture gates plus the complete C1-C4 suite

---

## Structural Effectiveness (C5)

These invariants target RimWorld `1.6.4871 rev590`. C5 is an immutable structural fact layer. C7 may project its exact facts into reviewed consumers, but C5 itself owns no consumer policy or intelligence.

### C5-001: Parser facts and runtime defaults are separate

The save parser and C2 preserve SkillRecord presence as `present`, `absent`, or `unknown`, plus independent `levelFieldPresent` and `passionFieldPresent` facts. They never emit `runtimeDefaulted`.

Only the skill and passion resolvers may derive `runtimeDefaulted`, and only from an absent record plus a proven-complete active SkillDef catalogue. An absent record with partial catalogue evidence remains unknown. A present record with a missing level or passion field uses the audited runtime field default.

**Regression coverage:** `test/capability-evidence.test.js`, `test/structural-skill-passion.test.js` (C5-SP-007 through C5-SP-010)

### C5-002: Canonical skill concepts never collapse into one number

Saved level, runtime aptitude, creation-time gain, app-policy offset, compatibility summary, total disablement, permanent disablement, and runtime level projections remain separate. Imported creation gains are already represented by saved `levelInt` and are never added again. Canonical aptitude consumes only eligible active gene, non-suppressed trait, and supported hediff operations selected by C2.

Passion identity is also separate. SkillFact does not embed PassionFact, and LearningRateFact references `passionSkillDefId` without embedding another passion fact.

**Regression coverage:** `test/c5-pawn-stat-evidence.test.js`, `test/structural-skill-passion.test.js`, `test/structural-learning-resolver.test.js`

### C5-003: Definition snapshots are pawn-independent

`EffectivenessDefinitionSnapshot` contains definition templates, source-operation catalogues, policies, provenance, completeness, dependencies, and patch uncertainty only. It contains no pawn evidence, active-pawn source list, capacity result, or request applicability.

The actual pawn's trait, gene, hediff, precept, role, and life-stage operations are selected from canonical C2 evidence at request time. Resolvers consume typed operations and typed structural context facts. They never branch on race, trait, gene, hediff, xenotype, body, or prosthetic identity to invent semantics.

**Regression coverage:** `test/effectiveness-registry.test.js`, `test/c5-pawn-stat-evidence.test.js`, `test/structural-skill-passion.test.js`, `test/structural-stat-resolver.test.js`

### C5-004: Source-family completeness controls absence

A complete empty source family proves that no relevant operation exists for that family and target StatDef. A partial or unknown empty family opens the frontier at its exact StatWorker phase. Operations for definitions the pawn does not possess never enter the stream as speculative applicability checks.

Exact and compatibility representations may coexist only through C2 source-fact conservation and supersession. Compatibility-only and superseded records never enter canonical calculations, and C5 never identity-deduplicates source records.

**Regression coverage:** `test/capability-evidence.test.js`, `test/c5-pawn-stat-evidence.test.js`, `test/structural-stat-resolver.test.js`

### C5-005: Stat evaluation follows the audited order and first frontier

The ordered StatResolver follows all 28 target-runtime phases. It stops numeric composition at the first relevant unresolved, current, mixed, unsupported, incomplete, inapplicable-unknown, missing-operand, or cyclic operation. `resolvedPrefixValue` is only the value before that frontier. Every later operation remains visible as `notEvaluated` and is never applied.

Dependencies remain at their declared phase. Recursive memoisation is request-local, and a repeated StatDef in the active path creates a dependency-cycle frontier with the full path. There is no long-lived result cache, revision counter, or invalidation API.

**Regression coverage:** `test/structural-stat-resolver.test.js` (C5-ST and C5-CAP cases)

### C5-006: C3 rounded capacity input has an explicit precision limit

C5 applies only the audited capacity-offset and capacity-factor formulas to C3's public structural CapacityFact. `unknown` and `notApplicable` never become numeric zero.

When every capacity operation can be evaluated against C3's rounded value, C5 emits `capacityInputRoundedByC3`, sets `numericClaim` to `exactAgainstRoundedC3CapacityInput`, and keeps the result partial even with no semantic frontier. C5 does not claim an interval or bit-exact runtime parity and does not change C3.

**Regression coverage:** `test/structural-stat-resolver.test.js` (C5-CAP-001 through C5-CAP-009), `test/capacity-resolver.test.js`

### C5-007: Direct and ordinary learning remain distinct

Direct learning is the exact passion factor only. Ordinary non-Animals learning multiplies passion by `GlobalLearningFactor`. Ordinary Animals learning additionally multiplies by `AnimalsLearningFactor`. A relevant stat frontier blocks the ordinary structural factor without erasing a known direct passion factor.

Legacy `learningRate` compatibility factors, current daily saturation, debug fast learning, and the current learning factor never enter canonical structural learning.

**Regression coverage:** `test/structural-learning-resolver.test.js`

### C5-008: Reports preserve every exact SkillDef and facet

`skillFacts`, `passionFacts`, and `learningRateFacts` are duplicate-free arrays ordered by exact SkillDef identity. A wholly skillless job has three empty arrays. Multiple skills remain plural; no primary skill is selected.

`globalWorkSpeed` is independent. Facets are top-level and preserve zero, one, or many StatDefs. Record-only StatDefs are reported but not evaluated. Definition-backed zero-stat facets remain structural, and unsupported C# or custom-job semantics remain explicit unknowns. No facet set is flattened into a job scalar.

**Regression coverage:** `test/structural-effectiveness-resolver.test.js`

### C5-009: Unknown propagates only across relevant dimensions

An unknown passion does not poison SkillFact. An unresolved Mining operation does not poison Cooking. An unsupported job mapping does not poison globally resolved facts. Confirmed facts and relevant unresolved facts coexist, and unrelated evidence is not added to the report.

Completeness and confidence are independent. Completeness describes captured relevant inputs; confidence describes the support for a particular identity or arithmetic claim.

**Regression coverage:** `test/structural-skill-passion.test.js`, `test/structural-stat-resolver.test.js`, `test/structural-learning-resolver.test.js`, `test/structural-effectiveness-resolver.test.js`

### C5-010: Current effectiveness is outside C5

Glow, inspiration, equipment, map, target, building, recipe, quest, animal training, learning saturation, and other live inputs remain current, mixed, unresolved, or `notEvaluated`. The top-level `currentEffectiveness.state` is always `notEvaluated`.

C5 is independent of C4 Permission and Availability. Those results never zero, hide, or suppress a structural skill, passion, learning, stat, or facet fact.

**Regression coverage:** `test/structural-stat-resolver.test.js`, `test/structural-learning-resolver.test.js`, `test/structural-effectiveness-resolver.test.js`

### C5-011: Legacy effectiveness is isolated from canonical calculation

`C5LegacyCompatibility` delegates unchanged to `App.effectiveSkill()`, `App._passionValue()`, `App._passionMeta()`, `Engine.calculateWorkSpeedMod()`, and `Engine.calculateRealWorkSpeed()`. Its named differences remain diagnostic evidence. Canonical unknown never becomes legacy zero, and a legacy number never enters canonical arithmetic. C7 may use these values only as explicitly labelled frozen ranking/work-speed compatibility policy until C8.

All eleven C1 speed formulas remain compatibility-only. Canonical modules contain no reference to the adapter or legacy calculation surfaces.

**Regression coverage:** `test/capability-corpus.test.js`, `test/c5-compatibility.test.js`

### C5-012: C5 does not implement consumer policy or intelligence

C7 may consume exact C5 facts for reviewed projections, but C5 itself emits no effectiveness score, suitability scalar, ranking proxy, best-pawn helper, assignment change, or scheduling policy.

C7 owns parity-proven consumer projection and keeps evaluation request-scoped. C8 owns new weighting, ranking, recommendations, smarter assignment, and any separately reviewed durable cache boundary. C5 implements none of them.

**Regression coverage:** Task 14 static architecture gates plus the complete C1-C5 suite

---

## C6 Temporal Profile Resolution Invariants

### C6-001: No fixed sleep-hour output

No fixed sleep-hour output (8/6/3). Mechanism-based rest facts only.

**Regression coverage:** `test/temporal-profile-resolver.test.js`, `test/c6-static-gates.test.js`

### C6-002: Rest facts expose needState + stat evaluations via C5 resolver

Rest facts expose needState + RestFallRateFactor + RestRateMultiplier via C5 resolver. The resolver does not hardcode stat values.

**Regression coverage:** `test/temporal-profile-resolver.test.js`

### C6-003: Independent rest mechanisms composed by C5, not selected by authority

Independent rest mechanisms are composed by C5 stat evaluation, not selected by authority ranking or identity branching.

**Regression coverage:** `test/temporal-profile-resolver.test.js`, `test/c6-static-gates.test.js`

### C6-004: No canonical recreation baseline

No canonical recreation baseline. Recreation emits recommendations only.

**Regression coverage:** `test/temporal-profile-resolver.test.js`

### C6-005: All hour adjustments are C7 policy

All hour adjustments (depressive/neurotic/child/break-risk/work budget) are C7 policy, not C6 facts.

**Regression coverage:** `test/c6-static-gates.test.js`

### C6-006: No break-risk metadata in TemporalProfile

Break-risk metadata is scheduler policy and belongs in C7, not C6.

**Regression coverage:** `test/c6-static-gates.test.js`

### C6-007: UV/daylight evidence emitted regardless of Undergrounder trait

UV/daylight evidence is emitted for all UV-sensitive pawns. The Undergrounder trait does not suppress UV evidence; it is a scheduling preference (C7 policy), not a biological fact.

**Regression coverage:** `test/c6-undergrounder-uv.test.js`, `test/capability-evidence.test.js`

### C6-008: Canonical facts separated from policy/compatibility metadata

Canonical facts are separated from policy/compatibility metadata in the TemporalProfile output. Legacy compatibility fields (sleepHoursOverride) are nested under `compatibility`.

**Regression coverage:** `test/temporal-profile-resolver.test.js`

### C6-009: Activity semantics from typed provider data, not activity-name branching

Activity semantics (obligation, satisfiesNeeds, composition) come from typed provider data on C2 evidence, not activity-name branching.

**Regression coverage:** `test/c6-activity-provider-semantics.test.js`, `test/c6-static-gates.test.js`

### C6-010: No life-stage temporal classification in v1

No life-stage temporal classification in v1. BioAge thresholds are human-specific and do not belong in a generic temporal resolver.

**Regression coverage:** `test/c6-static-gates.test.js`

### C6-011: (Reserved - consolidated into C6-010)

### C6-012: Per-dimension confidence and completeness

Per-dimension confidence (verified/derived/inferred/unknown) and completeness (complete/partial/unknown) propagated from C2 temporalCoverage and C5 stat evaluation state.

**Regression coverage:** `test/temporal-profile-resolver.test.js`, `test/c6-temporal-coverage.test.js`

### C6-013: Unknown activity composition stays unresolved, not defaulted

Unknown activity composition stays unresolved (`compositionResolved: false`), not defaulted. This degrades completeness to partial.

**Regression coverage:** `test/temporal-profile-resolver.test.js`, `test/c6-activity-provider-semantics.test.js`

### C6-014: Rest stats extend the generic C5/C2 stat-provider path

RestFallRateFactor and RestRateMultiplier are registered as supported StatDefs and resolved through the generic C5 stat evaluation pipeline. No special-case stat handling.

**Regression coverage:** `test/c6-rest-stat-registration.test.js`, `test/temporal-profile-resolver.test.js`

### C6-015: Independent of C4 Availability, work budget, and scheduling

C6 has no dependency on C4, work budget calculations, or scheduling policy. It consumes only C2 evidence and C5 stat evaluations.

**Regression coverage:** `test/c6-static-gates.test.js`

### C6-016: No identity-based branching

No identity-based branching on trait, gene, hediff, race, or activity names. All resolution is driven by typed evidence fields.

Design contract: `docs/superpowers/specs/2026-08-27-c6-temporal-profile-resolution-design.md`

**Regression coverage:** `test/c6-static-gates.test.js`

---

## C7 Consumer Parity Migration Invariants

### C7-001: A pawn context is immutable and request-scoped

`C7EvaluationCoordinator.createPawnContext()` collects C2 evidence once and resolves C3 capacities once. C4, C5, and C6 reuse those exact request objects. Per-job and temporal memoisation never crosses contexts; there is no long-lived pawn/result cache, revision cache, or invalidation protocol.

**Regression coverage:** `test/c7-evaluation-coordinator.test.js`, `test/c7-static-gates.test.js`

### C7-002: Permission and Availability remain peer facts

Permission answers structural allowance. Availability answers current ability. C7 policy may inspect both but must never convert downed or another current blocker into structural Permission.

Permission `unknown` follows the explicit parity projection "not proven blocked"; it is not rewritten to canonical `allowed`. Availability exclusions are consumer-specific and may not broaden beyond each reviewed C1 parity boundary.

**Regression coverage:** `test/c7-grid-parity.test.js`, `test/c7-consumer-parity.test.js`, `test/c7-ranking-parity.test.js`, `test/c7-temporal-parity.test.js`

### C7-003: Canonical plurality never becomes ranking intelligence

C5 displays may resolve the exact requested SkillDef. Multiple SkillDefs and facets remain plural. The coordinator and canonical infrastructure contain no `primarySkill`, scalar effectiveness score, ranking, assignment, or schedule construction.

Frozen C7 analyser/auto-assign ranking remains explicit compatibility policy, including legacy numeric skill and speed inputs, until C8. Skillless jobs remain skillless.

**Regression coverage:** `test/c7-static-gates.test.js`, `test/c7-skill-display-parity.test.js`, `test/c7-ranking-parity.test.js`

### C7-004: Temporal mechanism never silently becomes policy

C7 calls `TemporalProfileResolver.resolve(c5Context)` and forwards actual provider-derived `evidenceOptions.temporalCoverage`. Missing, partial, and unknown evidence stay missing, partial, and unknown.

C6 supplies rest quality, windows, conditions, and activity composition. C7 owns sleep/joy/meditation-hour choices, child/baby policy, break risk, Undergrounder interpretation, workload budgets, mood presets, specialist staggering, shift construction, and every schedule slot.

**Regression coverage:** `test/c7-scheduler-parity.test.js`, `test/c7-temporal-parity.test.js`

### C7-005: Only five reviewed behavioral deltas are allowed

| Delta | Allowed scope |
|-------|---------------|
| Firefight + Violent | Corrected C4 Firefight eligibility and its exact priority, aggregate, analyser/assignment, and temporal downstream fixtures only. |
| Human Fishing age | Corrected C4 Fishing age eligibility and exact Fishing downstream fixtures only. |
| Hauling + zero Manipulation | Corrected C4 Hauling capacity eligibility and exact Hauling downstream fixtures only. |
| Downed Permission/Availability decomposition | Grid shows an editable current-unavailable cell; aggregate, assignment, scheduler, and temporal current-state policy still excludes the pawn. |
| `creationGainAlreadyPersisted` | C5 skill display projects stored level 10 rather than legacy double-counted 12. No analyser, viability, ranking, or assignment change. |

A named-delta pawn is not a blanket exemption. Every affected consumer must match its causal fixture; any other behavioral difference is an unnamed regression.

**Regression coverage:** `test/c4-compatibility.test.js`, `test/c7-grid-parity.test.js`, `test/c7-consumer-parity.test.js`, `test/c7-skill-display-parity.test.js`, `test/c7-ranking-parity.test.js`, `test/c7-temporal-parity.test.js`

### C7-006: Legacy evidence and compatibility policy have explicit owners

The C4 shadow adapter is deprecated, test-only, and absent from the packaged script graph. Its suite remains executable migration evidence. `Engine.evaluatePawnJob()` and `Engine.evaluateJobPermission()` have no migrated production consumer.

`C5LegacyCompatibility` remains production-loaded only because frozen C7 numeric ranking/work-speed projections deliberately depend on it until C8. `App.isIncapable()` remains only in context-free legacy fallbacks and historical tests; no new caller may be added.

**Regression coverage:** `test/c4-compatibility.test.js`, `test/c5-compatibility.test.js`, `test/c7-static-gates.test.js`, and deprecated-caller architecture searches

---

## Save Editing

### SAVE-001: Never mutate the original save file

The save writer (`buildEditedSaveText`) operates on a copy of the raw XML text. The user's original `.rws` is never touched.

### SAVE-002: Unknown modded XML must survive round trips

Only values that were explicitly edited are written. The writer diffs against the original and leaves everything else exactly as-is. This is critical for mod compatibility.

### SAVE-003: Pawn ID prefix convention

Pawn `<id>` is stored WITHOUT the `Thing_` prefix (`Human74168`). Inter-pawn references ADD it (`Thing_Human74168`). Strip/prepend accordingly when matching pawns to references.

### SAVE-004: DefMap values are unmappable without load order

`DefMap<Def,V>` serialises as a flat, unlabelled `<vals>` list where index = DefDatabase load order (mod-dependent). Work priorities and records past index 42 cannot be reliably mapped. Only the manual/simple mode flag is imported for priorities; only validated vanilla indices 0-42 are mapped for records.

### SAVE-005: Modded passions are preserved losslessly

Modded passion frameworks (Alpha Skills, Vanilla Skills Expanded) use custom passion def names. These are stored by name and written back by name, never converted to a vanilla bucket.

### SAVE-006: _buildSavePayload and _applyLoadedData must stay in sync

`_buildSavePayload()` (in app-save.js) serialises the current state for storage; `_applyLoadedData()` deserialises it back. Any new persisted state property must be handled in both functions, otherwise data is silently lost on load.

---

## Mod Scanning

### MOD-001: Verification is scoped to audited scanner/provider subsets

Audited canonical scanner/provider subsets may be treated as verified only where the active definition, supported semantic, provenance, completeness, package applicability, and relevant patch uncertainty are all proven. C5's focused SkillDef, StatDef, source-operation, and facet inputs use this scoped contract; verification never extends automatically to adjacent fields or definitions.

Unaudited or unsupported scanner data remains best-effort or unknown. The scanner does not execute arbitrary PatchOperation XML or arbitrary C#, does not establish Combat Extended semantics, and may approximate equipment, stuff, and quality-dependent values. Quality defaults to Normal in legacy approximate paths. Relevant unapplied patches or unsupported runtime semantics prevent a verified canonical claim rather than being guessed.

### MOD-002: Legacy and canonical gene skill paths have different coverage

The frozen legacy numeric ranking/auto-assign path remains limited to its existing curated or defName-inferred gene skill modifiers and disabled WorkTags until C8. C#-driven or otherwise unresolved gene effects still do not reach that compatibility path.

Canonical C2/C5 evidence is richer and must not be described by that legacy limitation. It preserves exact typed gene, trait, and hediff aptitude operations, current-pawn applicability joins, source-family completeness, source-fact conservation, and supported exact stat operations from the audited scanner/provider subset. Unsupported identities, inactive or unknown gene state, incomplete catalogues, unapplied patches, and arbitrary C# semantics remain unknown rather than falling back to the legacy inference.

---

## Genes / Xenotypes

### GENE-001: Xenotype genes are raw defNames

Xenotype genes are stored as raw defNames. Scanned modded genes are keyed `mod_gene_<sanitised>`. `_resolveGeneDef(gId)` bridges the two and must be used for all gene lookups.

### GENE-002: Gene write-back is intentionally unsupported

Adding genes requires loadID allocation from `uniqueIDsManager`. A previous implementation was scoped and deliberately reverted. Do not implement gene write-back as part of unrelated work. See `docs/decisions/003-gene-writeback-parked.md`.

---

## Rendering

### RENDER-001: Object.assign does not copy getters

`Object.assign(App, {...})` evaluates getters instead of copying them. Modules with getters (e.g. `app-blueprint.js` with `get allBiomes()`) must use `_assignModule()`.

---

## Packaging

### PKG-001: Do not post-process the NSIS portable exe

Windows shows `1.3.x.0` (4-part fixed FILEVERSION; the 4th `.0` is unavoidable). An rcedit post-build hook was attempted to fix this and **reverted** because editing the NSIS portable exe broke its integrity check. `build-after.js` / `fix-exe-version.js` were deleted. Do not retry without a different approach.

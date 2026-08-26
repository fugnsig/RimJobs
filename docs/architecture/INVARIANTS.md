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

### WORK-003: evaluatePawnJob is the canonical capability evaluation

`Engine.evaluatePawnJob(pawn, job)` is the single source of truth for what a pawn can do in a job. It returns structured facts (permission, skill, work speed, advantages, penalties, confidence, evidence) - not a suitability score.

`Engine.evaluateJobPermission(pawn, job)` decomposes incapability into structured blocks with provenance (backstory, gene, trait, hediff, etc.) and tracks uncertainty from unresolvable modded genes.

Decision engines (`_bestPawnForJob`, `analyzeColony`, `runMinMaxAssignment`, `calculateWorkCapacity`, `getBottlenecks`, `calculateViability`) consume the facts and apply their own scoring/objective. No consumer should duplicate the capability lookup inline.

Three-valued permission: `allowed`, `blocked`, `uncertain`. The existing `isIncapable()` boolean contract is preserved; the richer semantics live only in `evaluateJobPermission`.

**Origin:** Intelligence architecture refactor - single source of truth before new reasoning.

**Regression coverage:** `test/engine.optimiser.test.js` (shape, skillless, regression parity, blocked/allowed permission, analyzeColony parity)

### WORK-005: Temporal coverage is diagnostic, not prescriptive

`calculateTemporalCoverage` and `analyzeTemporalResilience` report hourly capability gaps and fragile coverage for critical jobs (Doctor, Firefight). They do not mutate schedules or priorities.

Coverage status: `gap` (0 capable pawns awake), `fragile` (1 - single-point risk), `healthy` (2+). The optimiser may suggest schedule changes to fix gaps but must not apply them without user confirmation.

`TEMPORAL_CRITICAL` defines which jobs require 24-hour coverage monitoring. Not every job needs continuous coverage.

**Origin:** Phase B temporal intelligence - capability-aware shift coverage.

**Regression coverage:** `test/engine.optimiser.test.js` (TC-001 through TC-009, TP-001 through TP-009, TA-001 through TA-007)

### WORK-004: Consumer migrations must not alter automatic assignment outcomes

Migrating a consumer to `evaluatePawnJob()` must not alter automatic assignment outcomes unless the behaviour change is explicitly scoped and regression-tested.

Full-matrix parity (every pawnId x jobId cell identical) is required for `runMinMaxAssignment`. Gap/recommendation parity is required for `analyzeColony`. New intelligence may only be introduced after parity is proven, as a separate deliberate change.

**Origin:** Safety boundary for intelligence architecture migration.

**Regression coverage:** `test/engine.optimiser.test.js` (full-matrix fixtures for runMinMaxAssignment, analyzeColony parity checks)

---

## Canonical Permission and Availability (C4)

These invariants target RimWorld `1.6.4871 rev590`. They describe the pure C4 shadow architecture; existing production planning and UI remain on the frozen C1 surfaces until C7.

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

### MOD-001: Scanned stats are best-effort, not verified

The mod scanner does not apply PatchOperation XML, cannot read C#-driven stats, is wrong for Combat Extended, and approximates stuff-based stats. Quality defaults to Normal. Do not treat scanned values as ground truth.

### MOD-002: Gene skill effects are inferred, not complete

Only `<aptitudeOffset>` (skill inferred from defName pattern) and `<disabledWorkTags>` are read from scanned genes. C#-driven or non-inferrable gene effects do not reach the auto-assigner.

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

# C4 permission and availability implementation plan

**Status:** Reviewed and accepted after the corrections below. Implementation may begin once the baseline verification gate passes.

**Review corrections frozen here:**
- WorkType disables remain WorkType targets through C2; they are not relabelled as RimJobs `disableJob` targets.
- WorkTag matching uses the audited RimWorld flags/bitmask semantics; symbolic target strings remain exact provenance, but matching is not naive string-set intersection.
- Known app/custom jobs must be explicit registry entries even when their policy is unknown; arbitrary unknown job IDs remain distinguishable.
- C4 context receives the full accepted C3 definition/provider bundle required by `CapacityResolver`, not merely PawnCapacityDefs.
- Status certainty remains tri-state; `causedByMood=false` is not sufficient by itself to prove `mentalBreak=false` unless the audit explicitly proves that semantic.
- Active-package resolution must account for Core/official DLC and target-save load metadata; raw `meta.modIds` alone is not assumed to be the complete active package set.

**Audit checkpoint:** `8c5f094` (`C4: document permission and availability pre-implementation audit`)

**Target runtime:** RimWorld `1.6.4871` (`rev590` installed definitions, `rev591` target save marker)

**Authoritative inputs:**

- `docs/superpowers/audits/2026-08-25-c4-preimplementation-audit.md`
- `docs/2026-08-25-c4-permission-availability-design-revised.md`
- current C1-C3 production code and tests at the audit checkpoint
- `docs/architecture/CODE-MAP.md`
- `docs/architecture/INVARIANTS.md`

The audit findings override the earlier C4 brainstorm. The authoritative revised design currently lives at the root `docs` path above, not under `docs/superpowers/specs`.

## Goal

Build and parity-prove two peer canonical outputs without changing any production planning or UI decision:

- `PermissionReport`, for long-term structural permission;
- `AvailabilityReport`, for independent current-state and current-capacity availability.

C4 must first add the audit-required C2 and definition inputs, then build a requirement registry, then implement the resolvers, then isolate the exact C1 compatibility path and shadow comparisons. C4 is complete only when the canonical facts are executable and tested while existing C1-C3 production behaviour remains unchanged.

## Non-goals and hard boundaries

C4 does not:

- migrate `runMinMaxAssignment`, viability, bottlenecks, colony analysis, temporal coverage, scheduling, summary counts, work-priority rendering, or any other planning/UI consumer;
- change assignment or ranking behaviour;
- implement C7 profile caching or any long-lived pawn/definition cache;
- change C3 worker, body, part-efficiency, capMod, snapshot, rounding, dependency, or `notApplicable` semantics;
- read raw pawn/save data from either canonical resolver;
- use `incapBlocks`, `JOB_MIN_AGE`, `MANIPULATION_GATED_JOBS`, or closest-vanilla analogues as canonical truth;
- infer race semantics from `raceDefName`;
- implement a PatchOperation engine;
- invent canonical policies for the ten unresolved built-in app abstractions or for custom jobs.
- move the existing Doctor/Firefight temporal critical-job policy, or any other consumer emergency/importance set, into Permission or Availability.

The following production surfaces remain authoritative until C7 migration: `App.isIncapable()`, `Engine.evaluateJobPermission()`, `Engine.evaluatePawnJob()`, and all of their current consumers.

## Frozen architecture

### Dependency direction

```text
save/definition scanners
        |
        v
C2 exact evidence + C3 capacity facts + immutable requirement snapshot
        |                         |
        +------------+------------+
                     v
          request-scoped C4 context
              |              |
              v              v
       PermissionReport  AvailabilityReport
              \              /
               \ shadow only/
                v          v
             isolated C1 compatibility comparison

Production planning/UI continues to call the existing C1 surfaces in C4.
```

Canonical modules may depend on C2, C3, and the requirement registry. They must not depend on `engine.js`, `app-pawns.js`, renderers, priority code, scheduler code, or legacy job constants.

### Canonical target vocabulary

C4 has three distinct permission target namespaces:

- RimJobs job IDs / explicit aliases;
- RimWorld `WorkTypeDef` IDs;
- RimWorld `WorkTags` flags.

`disableJob.target` and `disableWorkTag.target` remain distinct existing canonical effect namespaces. Exact typed C2 `disabledWorkTypes` records are **WorkType targets**, not `disableJob` targets. C4 evaluates those WorkType targets by matching them against the selected job policy's audited `sourceWorkTypes`.

The exact non-`None` WorkTag symbolic values are:

```text
ManualDumb, ManualSkilled, Violent, Caring, Social, Commoner,
Intellectual, Animals, Artistic, Crafting, Cooking, Firefighting,
Cleaning, Hauling, PlantWork, Mining, Hunting, Constructing,
Shooting, AllWork
```

The exact case is part of the contract. `AllWork` remains an exact runtime flag and is not expanded through app incapability options.

**Matching rule:** WorkTags are a flags enum. Preserve the exact symbolic tokens for provenance, but evaluate disable/membership using the audited target-version flag/bitmask semantics (or an audited equivalent expansion table). Do not implement WorkTag matching as simple string equality/intersection. The Task 0 runtime fixture must contain enough enum-value/expansion information to make `AllWork`, combined flags, and ordinary flags executable without legacy aliases.

### Planned additive C2 schemas

The implementation may refine property names during review, but it must preserve these fields and meanings:

```ts
type TypedPermissionSource = {
  sourceKind: string;
  sourceId: string | null;
  sourceField: string;
  targetKind: "workType" | "workTag";
  presence: "present" | "absent" | "unknown";
  rawValue: string | null;
  targets: Array<{
    rawTarget: string;
    canonicalTarget: string | null;
  }>;
  completeness: "complete" | "partial" | "unknown";
  provenance: {
    modId: string | null;
    sourceFile?: string | null;
    runtimeVersion: "1.6.4871";
  };
};

type PawnPermissionEvidence = {
  rawSources: TypedPermissionSource[];
  legacyIncapable: string[];
};

type CurrentStatusFact = {
  statusId:
    | "downed"
    | "inMentalState"
    | "mentalBreak"
    | "deactivated"
    | "unconscious"
    | "canBeAwake";
  state: "known" | "unknown";
  value: boolean | null;
  evidence: Array<{ kind: string; sourceField?: string; evidenceId?: string }>;
};
```

Existing `pawn.incapable` and legacy definition `incapable` arrays remain available without reinterpretation. Canonical C4 reads the new typed records. Existing C1 code continues reading the legacy arrays.

A typed record with `targetKind: "workType"` remains a WorkType restriction until C4 policy evaluation. C2 must not translate it into a RimJobs job ID merely because one current built-in job maps to that WorkType.

### Planned requirement APIs

```ts
RequirementRegistry.createSnapshot({
  runtimeVersion,
  jobCatalog,
  workTypeDefs,
  workGiverDefs,
  raceWorkPolicies,
  capacityDefs,
  activePackageIds,
  definitionUncertainty,
}) -> Readonly<C4DefinitionSnapshot>

RequirementRegistry.getJobPolicy(snapshot, jobId)
  -> JobRequirementPolicy | null

Known built-in/app/custom jobs in `jobCatalog` always return a policy object. If their canonical requirements are not audited, that object is explicitly `unknown`. `null` is reserved for a job ID that is not present in the supplied job catalogue at all.

RequirementRegistry.getRaceWorkEntry(snapshot, raceDefName, workTypeDefName)
  -> knownGate | knownNoGate | unknown
```

`JobRequirementPolicy`, `WorkPath`, and `CapacityRequirement` follow the revised design. In particular:

- execution mode is `anyPath`;
- capacities inside a path are `allOf`;
- a complete path with `allOf: []` is satisfied;
- a complete catalogue with `paths: []` is a verified failure;
- an incomplete catalogue with `paths: []` is unknown;
- capacity capability uses strict `value > minForCapable`;
- each capacity requirement states its own `notApplicable` policy.

### Request-scoped evaluation boundary

```ts
C4EvaluationContext.create({
  pawn,
  definitionSnapshot,
  capabilityDefinitions,
})
  -> Readonly<{
       pawnId,
       evidence,
       capacities,
       statusFacts,
       definitionSnapshot,
     }>
```

The factory collects C2 once and resolves C3 once for the pawn in that explicit evaluation batch. `capabilityDefinitions` is the complete accepted C3 provider bundle required by `CapacityResolver` (race/body map, BodyDefs, BodyPartDefs, PawnCapacityDefs, hediff catalogue, prosthetic efficiency, and any other C3-required definition metadata), not merely the PawnCapacityDef table. The factory freezes or defensively snapshots all values used by C4 and is then reused for every requested job. It is discarded after the batch. No manual invalidation, module-global memo, render-hash dependency, or second mutable source of truth is introduced.

The raw pawn argument is opaque orchestration input. The factory may pass it to `CapabilityEvidence.collectPawnEvidence()` but must not interpret its health, incapability, age, race, or status fields itself. Resolver-visible facts come only from the returned C2 evidence, C3 output, and definition snapshot.

`canBeAwake`/`unconscious` may be derived after the single C3 call only when the audited inputs are all known: race `alwaysAwake`, C3 current Consciousness, and deactivation. The context must not call C3 a second time or alter C3 output to make awake-gated capacity facts look more complete. Those facts remain conservative unknown where the one-pass C3 input could not prove them.

## Working-tree and commit protocol

The repository contains pre-existing modified and untracked files. Every implementation task must:

1. run `git status --short` before editing and again before committing;
2. preserve all unrelated changes;
3. never use reset, clean, checkout, or broad restore operations;
4. stage only the exact files listed for that task with explicit `git add -- <paths>`;
5. inspect `git diff --cached --stat` and `git diff --cached` before committing;
6. leave a task uncommitted if its tests or architecture gates fail.

Where a listed file already has unrelated user changes, the implementer must patch only the task-owned region and inspect the staged diff carefully. A commit message below is a boundary, not authorisation to stage the whole dirty tree.

## Task 0: Freeze audit-derived fixtures and contracts

### Goal

Encode the accepted runtime truths as reusable executable fixtures before changing production parsing or resolution. This task creates a green contract suite, not failing resolver tests and not self-fulfilling placeholder assertions.

### Files to inspect

- `docs/superpowers/audits/2026-08-25-c4-preimplementation-audit.md`
- `test/_harness.js`
- `test/run-tests.js`
- `test/capability-corpus.test.js`
- `test/capacity-resolver.test.js`

### Files to create or modify

- Create `test/fixtures/c4-runtime-audit-1.6.4871.json`
- Create `test/c4-audit-contract.test.js`
- Modify `test/run-tests.js`

### Fixture contract

The fixture must contain:

- the exact 20-value WorkTag vocabulary, audited enum values/bitmask expansion semantics (including `AllWork`), and runtime marker;
- the 23 audited direct RimJobs job ID to WorkTypeDef mappings;
- all ten unresolved app jobs, explicitly classified `unknown` with no analogue;
- audited WorkType WorkTags, including `Firefighter = Firefighting, Commoner, AllWork`;
- audited WorkGiver paths with stable `workGiver:<defName>` IDs;
- the Anomaly Hauling `TakeEntityToHoldingPlatform` path as complete `allOf: []`;
- Human Fishing as `knownNoGate`;
- representative complete zero-path, complete empty-catalogue, and incomplete empty-catalogue records;
- verified capacity thresholds including each relevant `minForCapable` value and strict `gt` comparison.

The test must validate the fixture's schema, uniqueness, exact vocabulary, executable WorkTag mask/expansion semantics, exact direct/unknown partition, path IDs, completeness combinations, and absence of analogue fields on unknown jobs. Later C4 suites must import this fixture rather than duplicate these runtime truths.

### Invariants preserved

- No production file changes.
- No C1-C3 behaviour changes.
- No guessed app policy.
- Audit facts are version-labelled and reusable.

### Tests first

Write the fixture validator and register it in the suite. It must fail on duplicate WorkTags, a lower-case/legacy WorkTag, a flattened path, a zero-capacity path marked incomplete, a Fishing gate, or an analogue attached to an unknown job.

### Acceptance criteria

- The suite contains executable assertions for Firefight/Violent, Human Fishing, Anomaly Hauling, exact WorkTags, mappings, and path representation.
- `ok(true)` and comment-only claims are absent.
- The new contract suite passes before any production change.
- The existing C1-C3 suites remain green.

### Verification commands

```powershell
node -e "const r=require('./test/c4-audit-contract.test.js')(); if(r.failures) process.exit(1)"
node test/run-tests.js
rg -n "ok\(true\)|closest.*analogue|vanillaAnalogue" test/c4-audit-contract.test.js test/fixtures/c4-runtime-audit-1.6.4871.json
git status --short
```

The final `rg` command must have no placeholder assertion or analogue match.

### Commit boundary

Stage only the three task files and commit:

```text
C4: freeze permission and availability audit contracts
```

## Task 1: Add C2 canonical permission evidence

### Goal

Preserve exact typed WorkType and WorkTag targets at the parser/C2 boundary, preserve `pawn.incapable` separately as legacy input, and retain structured unresolved candidates without changing C1 output.

### Files to inspect

- `files/data.js`, all parsers for TraitDef, GeneDef, BackstoryDef, role PreceptDef, and HediffStage
- `files/app-save.js`, `parsePawnFields()`, import merge, reload normalisation
- `files/capability-evidence.js`, all seven `_classifyIncap()` call sites and `collectPawnEvidence()`
- `files/app-editors.js`, scanned definition merge shapes
- `test/capability-evidence.test.js`
- `test/save-parser.fuzz.test.js`
- `test/capability-corpus.test.js`

### Files to modify

- `files/data.js`
- `files/app-save.js`
- `files/capability-evidence.js`
- `files/app-editors.js` only if typed scanned fields require merge preservation
- `test/capability-evidence.test.js`
- `test/save-parser.fuzz.test.js`

### Schema and API changes

Add typed permission-source fields alongside every legacy `incapable` field:

- `TraitDef.disabledWorkTypes` emits exact typed **WorkType** targets (`targetKind: "workType"`); it must not emit or masquerade as a RimJobs `disableJob` target;
- `TraitDef.disabledWorkTags`, `GeneDef.disabledWorkTags`, `BackstoryDef.workDisables`, `PreceptDef.roleDisabledWorkTags`, and `HediffStage.disabledWorkTags` emit exact WorkTag targets;
- exact WorkType and WorkTag targets remain separate through C2; job-policy mapping happens only in C4 using `sourceWorkTypes`;
- scalar flags fields are parsed as comma-separated exact enum identifiers, not queried only as `<li>` nodes;
- multi-flag sources emit one exact canonical effect per flag;
- `AllWork` stays `AllWork` in provenance/typed evidence; matching later uses audited WorkTags flag semantics rather than string equality;
- unknown exact-source tokens become unresolved records with their raw value;
- generic legacy `incapable` tokens remain on the existing `_classifyIncap()` path and may gain `candidateTargets` only when both candidates are supported by known vocabularies;
- parsed pawn objects gain raw permission source records while retaining the exact old `pawn.incapable` array;
- `collectPawnEvidence()` returns `permissionEvidence.rawSources` and `permissionEvidence.legacyIncapable` in addition to existing fields.

Do not broaden C2 completeness to unimplemented runtime sources such as pawn kinds, titles, mutants, quest restrictions, or guest/slave policy. Record source/dimension completeness as partial or unknown instead.

### Invariants preserved

- C2 exact effects never derive WorkTags from `INCAP_OPTIONS` or `incapBlocks`.
- Exact job and WorkTag namespaces never collide.
- Legacy arrays remain byte-for-byte compatible for C1 consumers.
- `App.isIncapable()` and `Engine.evaluateJobPermission()` are not edited.
- Every one of the seven current emitters is covered.

### Tests first

Add failing cases for exact trait WorkType targets, exact flags on each typed source, scalar GeneDef flags, `AllWork`, multiple flags, unknown flags, legacy ambiguous candidates, pawn raw-source presence, synthetic modded raw tags, and preservation of the legacy array. Then implement the smallest additive parser and adapter changes.

### Acceptance criteria

- Every typed runtime source emits the correct exact namespace and target case.
- Generic `firefight`, `cooking`, and similar legacy tokens remain unresolved unless their typed source resolves them.
- `pawn.incapable` is preserved as legacy data and is not treated as canonical.
- C1 frozen corpus output is unchanged.
- Repository search accounts for all `_classifyIncap()` callers and every definition parser carrying work disables.

### Verification commands

```powershell
node --check files/data.js
node --check files/app-save.js
node --check files/capability-evidence.js
node --check files/app-editors.js
node test/run-tests.js
rg -n "_classifyIncap\(" files/capability-evidence.js
rg -n "disabledWorkTypes|disabledWorkTags|workDisables|roleDisabledWorkTags|legacyIncapable|rawSources" files/data.js files/app-save.js files/capability-evidence.js files/app-editors.js test
git status --short
```

### Commit boundary

Stage only task-owned parser, evidence, merge, and test hunks and commit:

```text
C4: preserve canonical permission evidence
```

## Task 2: Add C2 tri-state current-status evidence

### Goal

Preserve only the current-status facts the audit proved obtainable, with known true, known false, and unknown represented explicitly. Do not let absent parser data become false.

### Files to inspect

- `files/app-save.js`, pawn block completeness, `healthTracker`, `healthState`, and `mindState` parsing
- `files/capability-evidence.js`, `collectPawnEvidence()`
- `files/capacity-resolver.js`, read-only inspection of the existing `currentStatus.canBeAwake` seam
- save parser and C2 tests

### Files to modify

- `files/app-save.js`
- `files/capability-evidence.js`
- `test/save-parser.fuzz.test.js`
- `test/capability-evidence.test.js`

### Schema and API changes

Add a parser-level source record that preserves source-scope completeness, then expose `pawnState.currentStatusFacts` as `CurrentStatusFact` records:

- `downed`: known true for explicit `Down`; known false for explicit `Mobile` or omitted default only inside a proven-complete health tracker; otherwise unknown;
- `inMentalState`: known true for a non-null `curState`, known false for explicit null, otherwise unknown;
- `mentalBreak`: known true only when an audited exact save/runtime marker proves an active mental break. Explicit null may prove false when its containing scope is complete. `causedByMood=false` by itself must **not** be treated as proof of `mentalBreak=false` unless the pre-implementation audit explicitly establishes that equivalence for the target runtime; otherwise retain `unknown`;
- `deactivated`: preserve only facts directly present and mark missing comp/faction inputs unknown;
- `unconscious` and `canBeAwake`: initially unknown because there is no direct save field. They may be derived later by the immutable C4 context from audited inputs.

Retain any old boolean field needed by existing C1 save import, but canonical C4 must consume only the tri-state records. Do not infer mental break from downed, unconscious from downed, or deactivated from race identity.

### Invariants preserved

- Missing or malformed status scope is unknown.
- Explicit serialisation defaults are used only when the containing scope is proven complete.
- C3 code and semantics are unchanged.
- C1's existing `pawn.downed` compatibility behaviour remains exact.

### Tests first

Use synthetic XML fragments representing explicit true, explicit false/default in a complete tracker, explicit null mental state, non-mood mental state, mood break, missing tracker, truncated tracker, missing comp metadata, and unsupported mech context.

### Acceptance criteria

- Each audited status has true/false/unknown tests.
- Missing status fields do not produce canonical false.
- `unconscious` and `canBeAwake` remain unknown at C2 unless direct audited inputs establish them.
- Existing save parser and capability evidence regressions remain green.

### Verification commands

```powershell
node --check files/app-save.js
node --check files/capability-evidence.js
node test/run-tests.js
rg -n "currentStatusFacts|inMentalState|mentalBreak|deactivated|unconscious|canBeAwake" files/app-save.js files/capability-evidence.js test
git status --short
```

### Commit boundary

Commit only parser, C2, and test changes:

```text
C4: preserve tri-state current status evidence
```

## Task 3: Add the requirement scanner and provider layer

### Goal

Extract WorkType, WorkGiver execution-path, and race work-setting metadata with per-dimension and per-path completeness. Mark relevant unapplied patch uncertainty without implementing PatchOperations.

### Files to inspect

- `main.js`, `scan-trait-gene-defs`, `CACHE_VERSION`, `extractDefs`, source metadata, patch classification, IPC result
- `files/data.js`, C3 inheritance-aware DOMParser helpers and provenance conventions
- `files/app-editors.js`, C3 catalogue finalisation and renderer state replacement
- `files/app-save.js`, `meta.modIds` and `state.saveModIdSet`
- `test/capacity-resolver.test.js`, renderer XML parser seam
- `test/import-multitask.fuzz.test.js`, scanner IPC and merge guardrails

### Files to modify

- `main.js`
- `files/data.js`
- `files/app-editors.js`
- `files/app.js` if explicit initial state keys are needed
- Create `test/requirement-scanner.test.js`
- Modify `test/run-tests.js`

### Scanner and parser changes

Add:

- `WorkTypeDef` fragments with abstract-parent inheritance, `defName`, exact `workTags`, source/provenance, and work-tag completeness;
- `WorkGiverDef` fragments with `defName`, `workType`, `priorityInType`, `requiredCapacities`, `giverClass`, source/provenance, and per-field completeness;
- race `lifeStageWorkSettings` entries from scanned race ThingDefs with exact WorkType key and `minAge`;
- source metadata types for `WorkTypeDef`, `WorkGiverDef`, and `RaceWorkSettings`;
- active-package filtering as an explicit provider input. Resolve `activePackageIds` from the target save/game metadata using the audited Core + official DLC + mod activation semantics. Do not assume raw `meta.modIds` alone is the complete package universe. A definition outside the resolved active package set cannot make an effective target-save snapshot complete;
- PatchOperation classifiers scoped to WorkType `workTags`, WorkGiver `workType`, `requiredCapacities`, WorkGiver catalogue membership, and race work settings;
- dataset-level uncertainty only when a patch cannot be narrowed to a definition or dimension;
- explicit unsupported/custom `giverClass` diagnostics without guessing C# semantics;
- a scanner cache-version bump because cached fragment structure changes.

The renderer merge stores fresh catalogue objects, for example `scannedWorkTypeDefs`, `scannedWorkGiverDefs`, and `scannedRaceWorkPolicies`. It must not combine them into one coarse job completeness flag.

### Completeness contract

At minimum, distinguish:

- WorkType WorkTag dimension completeness;
- WorkGiver `workType` membership completeness;
- each WorkGiver path's capacity-list completeness;
- WorkGiver catalogue membership completeness for each WorkType;
- each race/WorkType age entry completeness;
- unsupported C# giver semantics from merely empty capacity requirements.

Relevant uncertainty marks only the affected dimension/path partial or unknown. An unrelated Hediff, body, or different WorkType patch does not poison the current job.

### Invariants preserved

- No PatchOperation execution.
- Existing C3 scanner catalogues and semantics remain unchanged.
- A verified zero-capacity WorkGiver path remains complete `allOf: []`.
- Missing/incomplete path data is not represented as a free path.
- Mod filtering is explicit input, not implicit global truth.

### Tests first

Add renderer-parser and scanner-extraction fixtures for inheritance, multiple WorkGivers, strict required-capacity lists, zero-capacity paths, complete/incomplete catalogues, duplicate definitions, exact/narrow patch signals, broad patch signals, inactive package filtering, unsupported giver classes, malformed XML, and a definition-backed modded race.

### Acceptance criteria

- The audited official fixture can be represented without flattening.
- Targeted patch uncertainty affects only the named path/dimension.
- Broad relevant patch uncertainty makes only the relevant catalogue/dataset dimension partial.
- Unknown custom giver semantics are explicit.
- Scanner cache is invalidated correctly.
- Existing C3 scanner and resolver tests remain green.

### Verification commands

```powershell
node --check main.js
node --check files/data.js
node --check files/app-editors.js
node --check files/app.js
node test/run-tests.js
rg -n "WorkTypeDef|WorkGiverDef|requiredCapacities|lifeStageWorkSettings|RaceWorkSettings|CACHE_VERSION" main.js files/data.js files/app-editors.js test/requirement-scanner.test.js
git status --short
```

### Commit boundary

Stage only scanner/provider/parser/state/test files and commit:

```text
C4: scan work and race requirement metadata
```

## Task 4: Build the immutable requirement registry

### Goal

Normalise scanner output into a versioned, immutable `C4DefinitionSnapshot` containing `JobRequirementPolicy`, `WorkPath`, `CapacityRequirement`, and race work policies.

### Files to inspect

- `files/data.js`, `JOBS` and existing legacy constants for mapping comparison only
- `files/capacity-resolver.js`, `CapacityFact` shape and capacity definition output keys
- Task 0 audit fixture
- Task 3 scanner/provider output

### Files to create or modify

- Create `files/requirement-registry.js`
- Modify `files/rimjobs.html` to load it after `capacity-resolver.js` and before future C4 resolvers
- Modify `test/_harness.js` only if the module needs an additional captured global
- Create `test/requirement-registry.test.js`
- Modify `test/run-tests.js`

### Schema and API changes

Implement pure APIs:

- `RequirementRegistry.createSnapshot(inputs)`;
- `RequirementRegistry.getJobPolicy(snapshot, jobId)`;
- `RequirementRegistry.getRaceWorkEntry(snapshot, raceDefName, workTypeDefName)`;
- schema validators or normalisers for `JobRequirementPolicy`, `WorkPath`, and `CapacityRequirement`.

The snapshot must:

- consume an explicit `jobCatalog` containing the current built-in and user custom job IDs;
- bind exactly the 23 audited built-in IDs to direct WorkType defNames;
- create explicit unknown policies for the ten audited app abstractions;
- create explicit unknown policies for user custom jobs present in `jobCatalog`;
- return `null` only for a job ID absent from the supplied catalogue;
- create WorkPaths from active WorkGiverDefs with OR between paths and AND within `allOf`;
- read `minForCapable` from the scanned PawnCapacityDef and use operator `gt`;
- keep a complete zero-capacity path distinct from empty/incomplete catalogue data;
- resolve race work settings through opaque `raceDefName` lookup;
- attach per-requirement provenance, version, mod ID, and completeness;
- freeze or defensively copy the entire returned snapshot.

No explicit `appPolicy` entries are added in C4 because the audit established none. The registry supports the schema for a later accepted policy, but an empty app-policy table is the correct audited result.

### Invariants preserved

- No legacy constants or analogues in canonical registry construction.
- Unknown propagates by relevant dimension only.
- `notApplicable` is carried on each capacity requirement and never converted to numeric zero.
- No race-name conditional.
- No mutable global registry cache.

### Tests first

Test all fixture mappings, unknown app/custom jobs, WorkTag exactness, source alias matching, strict threshold creation, path and catalogue completeness, zero-capacity satisfaction representation, missing capacity definition, unsupported capacity, `notApplicable` policies, active package filtering, per-entry race gates, Human Fishing known-no-gate, and a supported modded race resolved only through definitions.

### Acceptance criteria

- All 23 direct jobs produce definition-backed policies.
- All ten unresolved app jobs and user custom jobs produce explicit unknown policies/reports, never guessed mappings.
- The Anomaly Hauling alternative remains a complete empty `allOf` path.
- Missing WorkGiver metadata cannot become an allowed execution path.
- Snapshot inputs are not mutated and returned objects cannot be changed by callers.

### Verification commands

```powershell
node --check files/requirement-registry.js
node test/run-tests.js
rg -n "incapBlocks|JOB_MIN_AGE|MANIPULATION_GATED_JOBS|closest|analogue" files/requirement-registry.js test/requirement-registry.test.js
rg -n "raceDefName\s*===|raceDefName\s*!==|switch\s*\([^)]*raceDefName" files/requirement-registry.js
git status --short
```

Both architecture searches must return no prohibited production match. Fixture names may be asserted in tests, but production registry code must not branch on them.

### Commit boundary

Commit only the new registry, script wiring, harness, runner, and registry tests:

```text
C4: build canonical job requirement registry
```

## Task 5: Implement the canonical Permission resolver

### Goal

Resolve structural job permission from C2 canonical evidence, C3 structural capacity output, and the immutable requirement snapshot. Preserve blockers and relevant unknowns simultaneously.

### Files to inspect

- `files/capability-evidence.js`
- `files/capacity-resolver.js`
- `files/requirement-registry.js`
- revised design report schemas and aggregation rules
- `test/capability-corpus.test.js` for shadow fixture inputs only

### Files to create or modify

- Create `files/permission-resolver.js`
- Modify `files/rimjobs.html`
- Modify `test/_harness.js` only if needed to capture the global
- Create `test/permission-resolver.test.js`
- Modify `test/run-tests.js`

### API and report contract

Implement a pure entry point such as:

```js
PermissionResolver.resolve(context, jobId) -> PermissionReport
```

The resolver must emit schema version 1 reports and stable `ConstraintEvaluation` records with requirement ID, kind, result, aggregation level/effect/masked, structural snapshot, expected/observed values, explanation code/params, evidence references, and requirement provenance.

Evaluate these peer constraints without early exit:

1. job policy and job-identity completeness;
2. exact RimJobs `disableJob` target matching where a genuinely job-targeted canonical effect exists;
3. exact typed WorkType restrictions by matching C2 `targetKind: "workType"` against the policy's audited `sourceWorkTypes`;
4. exact WorkTag restrictions using the audited target-version flags/bitmask semantics, not naive string intersection;
5. persistent structural conditional hediff restrictions by joining C2 definition effects to body observations;
6. relevant race age/life-stage entry;
7. C3 structural capacity requirements path by path;
8. only the completeness uncertainty that could change this job's answer.

Conditional effects use persistent observations only. Temporary effects are ignored by Permission. Unknown persistence, severity, applicability, or unsupported `when` becomes relevant uncertainty when it could apply. Missing severity is never zero.

Path aggregation:

```text
leaf: resolved value > threshold => satisfied
      resolved value <= threshold => failed
      unknown or unsupported relevant fact => unknown
      notApplicable => use requirement's explicit policy

path: any failed leaf => failed
      else any unknown leaf/path completeness => unknown
      else => satisfied

execution: any satisfied path => satisfied
           else any unknown/incomplete path => unknown
           else every complete path failed, or verified complete empty catalogue => failed
```

A failed leaf/path is explanatory, not a peer job blocker when another path succeeds.

Final aggregation is `blocked` if any confirmed peer blocker exists, otherwise `unknown` if a relevant uncertainty exists, otherwise `allowed`. Blockers and unknowns are both retained when they coexist.

### Invariants preserved

- No status/current-only fact in Permission.
- No raw pawn/save read.
- No legacy constant or C1 helper.
- Positive skill or effectiveness cannot override a hard constraint.
- Unknown evidence unrelated to the selected policy does not poison the report.
- C3 facts are consumed as returned, including `notApplicable`.

### Tests first

Add executable tests for:

- exact job, WorkType, and WorkTag disables; mismatched namespaces; combined flags; `AllWork`; structured ambiguity; and opaque ambiguity not parsed;
- blocker, relevant unknown, blocker plus relevant/unrelated unknown, and unrelated unknown;
- persistent active, temporary active, unknown persistence, below/above hediff stage, missing severity, and unsupported condition;
- age below, exact boundary, above, missing biological age, known no gate, unknown race entry, and relevant entry complete inside a partial race catalogue;
- capacity below, exact threshold failure, above threshold success, each `notApplicable` policy, and unsupported/custom capacity;
- one failed path plus one successful alternative;
- one failed path plus one unknown alternative resulting in unknown;
- every complete path failed;
- verified zero-capacity path success;
- complete empty catalogue failure versus incomplete empty catalogue unknown;
- Firefight canonical result independent of legacy Violent;
- Fishing canonical age result with no Human gate;
- unsupported app job unknown;
- definition-backed modded race with no race-name branch.

### Acceptance criteria

- Report shape and stable explanation/provenance references are fully asserted.
- Strict `>` behaviour is proved at the exact threshold.
- OR/AND aggregation and masking are proved with named cases.
- Confirmed blockers do not erase relevant unknowns.
- No production caller imports or invokes the resolver.

### Verification commands

```powershell
node --check files/permission-resolver.js
node test/run-tests.js
rg -n "incapBlocks|JOB_MIN_AGE|MANIPULATION_GATED_JOBS|App\.isIncapable|evaluateJobPermission|pawn\.health|pawn\.incapable" files/permission-resolver.js
rg -n "raceDefName\s*===|raceDefName\s*!==|switch\s*\([^)]*raceDefName" files/permission-resolver.js
rg -n "PermissionResolver" files/app-render.js files/app-priorities.js files/app-schedule.js files/engine.js files/app-pawns.js
git status --short
```

All three static searches must return no prohibited production match.

### Commit boundary

Commit only resolver, script wiring, harness/runner, and resolver tests:

```text
C4: add canonical permission resolver
```

## Task 6: Implement the immutable evaluation context and Availability resolver

### Goal

Create one request-scoped immutable pawn context, then resolve independent global and job-specific current availability from C2 status/effects and C3 current capacities.

### Files to inspect

- `files/capability-evidence.js`, C2 collection and tri-state status facts
- `files/capacity-resolver.js`, `resolvePawnCapacities()` output and awake-gate limitation
- `files/requirement-registry.js`
- `files/permission-resolver.js`, report utility patterns only

### Files to create or modify

- Create `files/c4-evaluation-context.js`
- Create `files/availability-resolver.js`
- Modify `files/rimjobs.html`
- Modify `test/_harness.js` only if needed
- Create `test/availability-resolver.test.js`
- Modify `test/run-tests.js`

### API and report contract

Implement pure/request-scoped APIs:

```js
C4EvaluationContext.create({
  pawn,
  definitionSnapshot,
  capabilityDefinitions,
})
AvailabilityResolver.resolve(context, jobId) -> AvailabilityReport
```

The context calls `CapabilityEvidence.collectPawnEvidence()` once and `CapacityResolver.resolvePawnCapacities()` once using the complete C3 `capabilityDefinitions` bundle, snapshots the relevant status/definition data, derives status only where every audited input is known, and returns a read-only object. Tests instrument call counts across multiple job evaluations.

Availability emits independent `global` and `jobSpecific` component reports and evaluates both even if one already fails.

Global checks include only audited policies for:

- downed;
- unconscious/cannot-be-awake when exactly derived;
- active mental break or in-mental-state according to the frozen global policy;
- deactivated;
- other facts only after a separate audit and contract update.

Job-specific checks include:

- the registry's same execution paths evaluated against C3 `current` facts;
- temporary/current-only exact `disableJob` and `disableWorkTag` effects;
- explicit current-only policy requirements, if any. The audited registry initially has none beyond execution/status.

Availability remains independent of Permission. A structurally blocked pawn can be `available`; an allowed pawn can be `unavailable`.

Final aggregation is `unavailable` on any confirmed current blocker, otherwise `unknown` on relevant current uncertainty, otherwise `available`. Confirmed blockers and unknowns coexist in the report.

### Invariants preserved

- No long-lived cache or manual invalidation.
- No second C3 resolution call.
- No structural blocker copied into Availability merely because Permission failed.
- Tri-state absence is not false.
- Current capacity facts are consumed without changing C3 semantics.
- Global failure does not skip job-specific evaluation.

### Tests first

Test:

- one C2 and one C3 call for multiple jobs in one context;
- a fresh context recomputes and no cross-batch state leaks;
- downed known true/false/unknown;
- mental state and mental break known true/false/unknown;
- deactivated known true/false/unknown;
- `canBeAwake`/unconscious exact derivation and missing-input unknown;
- current capacity above, at, below, `notApplicable`, and unknown;
- the same WorkGiver alternative cases as Permission using current facts;
- temporary exact job/tag disable and unrelated temporary evidence;
- blocker plus unknown coexistence;
- global blocker plus job-specific success and global success plus job-specific blocker;
- all peer combinations: blocked+available, allowed+unavailable, blocked+unavailable, and either report unknown.

### Acceptance criteria

- Context immutability and call-count boundary are executable tests.
- Missing status facts produce unknown only when relevant to the global policy.
- Availability never reads Permission state.
- The resolver and context are unused by planning/UI production consumers.
- Existing C1-C3 suites remain green.

### Verification commands

```powershell
node --check files/c4-evaluation-context.js
node --check files/availability-resolver.js
node test/run-tests.js
rg -n "incapBlocks|JOB_MIN_AGE|MANIPULATION_GATED_JOBS|App\.isIncapable|evaluateJobPermission|pawn\.health|pawn\.incapable" files/c4-evaluation-context.js files/availability-resolver.js
rg -n "new Map|WeakMap|cache|revision|invalidate" files/c4-evaluation-context.js files/availability-resolver.js
rg -n "AvailabilityResolver|C4EvaluationContext" files/app-render.js files/app-priorities.js files/app-schedule.js files/engine.js files/app-pawns.js
git status --short
```

Any occurrence of `cache` in an explanation/test must be reviewed; no module-global or cross-batch cache is acceptable. Other prohibited searches must be empty.

### Commit boundary

Commit only context, resolver, wiring, harness/runner, and tests:

```text
C4: add canonical availability resolver
```

## Task 7: Add exact legacy projection and shadow parity

### Goal

Keep exact C1 production behaviour available and prove named canonical-versus-legacy differences without migrating a production caller.

### Files to inspect

- `files/app-pawns.js`, `App.isIncapable()` and `_hediffActiveIncaps()`
- `files/engine.js`, `evaluateJobPermission()` and its early downed behaviour
- `files/data.js`, `incapBlocks`, `JOB_MIN_AGE`, and `MANIPULATION_GATED_JOBS`
- `test/capability-corpus.test.js`
- canonical C4 resolver tests and audit fixture

### Files to create or modify

- Create `files/c4-legacy-compatibility.js`
- Modify `files/rimjobs.html` only if the shim must be available in the renderer
- Create `test/c4-compatibility.test.js`
- Modify `test/run-tests.js`
- Modify `test/capability-corpus.test.js` only to add explicit frozen outputs, never to bless changed output

### Compatibility contract

The compatibility module is explicitly named and may delegate to the existing C1 surfaces. It must not reimplement canonical logic with legacy constants scattered through C4.

Provide pure shadow helpers such as:

```js
C4LegacyCompatibility.evaluateLegacyPermission(pawn, job)
C4LegacyCompatibility.evaluateLegacyIncapable(pawn, job)
C4LegacyCompatibility.compare({ permission, availability, legacy })
```

The safest default is delegation to the unchanged `Engine.evaluateJobPermission()` and `App.isIncapable()` for legacy truth. Do not replace either production function unless the complete frozen corpus proves exact output and the plan is re-reviewed. Unknown canonical states do not project to true.

Named shadow tests must separate:

- Firefight canonical WorkTags from legacy `Violent`/`firefight` tokens;
- Human Fishing canonical no-age-gate from legacy `JOB_MIN_AGE`;
- Anomaly Hauling zero-capacity alternative from legacy manipulation gating;
- every current `incapBlocks` row from the audit table;
- downed as Availability in canonical decomposition versus an early legacy Permission block;
- unresolved app/custom jobs as canonical unknown versus their frozen legacy result.

These are reports/tests only. C4 must not feed canonical differences into priorities, assignment, viability, bottlenecks, summaries, scheduling, or rendering.

### Invariants preserved

- Existing C1 output remains exact.
- Legacy constants occur only in existing C1 files and the explicitly named compatibility module/test.
- Canonical resolvers never import the compatibility module.
- Canonical unknown never silently becomes legacy blocked.
- Shadow differences are intentional and named, not adopted.

### Tests first

Extend the frozen corpus with named fixtures before any compatibility refactor. Compare the exact full legacy result shape and boolean output, not only a truthy summary. Then assert canonical reports independently and assert the expected delta code.

### Acceptance criteria

- Every C1 corpus cell remains identical.
- Firefight and Fishing each have distinct canonical and legacy assertions.
- Hauling's Anomaly path delta is explicit.
- All audit `incapBlocks` differences are data-driven named shadow cases.
- Production consumers still call only the current C1 surfaces.

### Verification commands

```powershell
node --check files/c4-legacy-compatibility.js
node test/run-tests.js
rg -n "incapBlocks|JOB_MIN_AGE|MANIPULATION_GATED_JOBS" files/permission-resolver.js files/availability-resolver.js files/requirement-registry.js files/c4-evaluation-context.js
rg -n "PermissionResolver|AvailabilityResolver|RequirementRegistry|C4EvaluationContext" files/app-render.js files/app-priorities.js files/app-schedule.js files/engine.js files/app-pawns.js
rg -n "C4LegacyCompatibility" files/permission-resolver.js files/availability-resolver.js files/requirement-registry.js
git status --short
```

All three static architecture searches must return no forbidden match.

### Commit boundary

Commit only compatibility/shadow files and exact test additions:

```text
C4: add legacy projection and shadow parity
```

## Task 8: Run full regression and document the architecture

### Goal

Complete the C4 matrix, prove no consumer migration or race/legacy leakage, and document the new modules and invariants without changing production behaviour.

### Files to inspect

- all C1-C4 tests
- all new C4 source modules
- `files/rimjobs.html` script order
- `docs/architecture/CODE-MAP.md`
- `docs/architecture/INVARIANTS.md`
- all current planning/UI consumers named by the audit

### Files to modify

- C4 test files only where matrix coverage is missing
- `docs/architecture/CODE-MAP.md`
- `docs/architecture/INVARIANTS.md`

### Documentation changes

Add code-map entries for scanner/provider inputs, requirement registry, immutable evaluation context, Permission, Availability, compatibility/shadow boundary, test files, dependency order, and the explicit statement that no production consumer uses C4 yet.

Add stable invariants covering at least:

- peer Permission/Availability semantics;
- structural/current separation;
- exact job versus WorkTag namespaces;
- relevant unknown propagation;
- OR-between-paths and AND-within-path;
- complete zero-capacity path versus empty/incomplete catalogue;
- strict threshold comparison;
- explicit `notApplicable` policy;
- opaque race lookup and no race-name branches;
- C1 compatibility isolation;
- request-scoped context and no long-lived cache;
- C7/C8 migration boundaries.

### Invariants preserved

- Documentation reflects executable code and tests only.
- No comment-only invariant claims replace tests.
- No UI/planning file is modified for C4 integration.
- C1-C3 production behaviour remains unchanged.

### Acceptance criteria

- Every row in the required test matrix below has an executable named assertion.
- Full test suite exits with zero failures.
- All modified JavaScript parses.
- HTML loads modules in dependency order.
- Static searches prove no consumer migration, legacy leakage, raw pawn access, race identity branch, or long-lived cache.
- Code map and invariants identify the target runtime and unresolved offline limitations.

### Verification commands

```powershell
node --check main.js
node --check files/data.js
node --check files/app-save.js
node --check files/capability-evidence.js
node --check files/capacity-resolver.js
node --check files/requirement-registry.js
node --check files/permission-resolver.js
node --check files/c4-evaluation-context.js
node --check files/availability-resolver.js
node --check files/c4-legacy-compatibility.js
node test/run-tests.js
rg -n "PermissionResolver|AvailabilityResolver|RequirementRegistry|C4EvaluationContext" files/app-render.js files/app-priorities.js files/app-schedule.js files/engine.js files/app-pawns.js
rg -n "incapBlocks|JOB_MIN_AGE|MANIPULATION_GATED_JOBS" files/permission-resolver.js files/availability-resolver.js files/requirement-registry.js files/c4-evaluation-context.js
rg -n "raceDefName\s*===|raceDefName\s*!==|switch\s*\([^)]*raceDefName" files/requirement-registry.js files/permission-resolver.js files/availability-resolver.js files/c4-evaluation-context.js
rg -n "pawn\.health|pawn\.incapable|_tag\(|healthTracker|curState" files/permission-resolver.js files/availability-resolver.js files/requirement-registry.js
rg -n "runMinMaxAssignment|calculateViability|getBottlenecks|analyzeColony|renderTable|summary|priority" files/permission-resolver.js files/availability-resolver.js files/requirement-registry.js files/c4-evaluation-context.js
rg -n "TEMPORAL_CRITICAL|doctoring.*firefight|criticalJobs" files/permission-resolver.js files/availability-resolver.js files/requirement-registry.js files/c4-evaluation-context.js
git status --short
```

All architecture `rg` commands are expected to return no production match. If a test or diagnostic name produces a match, narrow the search and document why it is not a dependency.

### Commit boundary

Commit only final C4 test coverage and architecture documentation:

```text
C4: document permission and availability architecture
```

## Full file-impact table

| File | Task | Planned effect |
| --- | --- | --- |
| `test/fixtures/c4-runtime-audit-1.6.4871.json` | 0 | Versioned audit truth fixture |
| `test/c4-audit-contract.test.js` | 0 | Executable fixture/schema contract |
| `test/run-tests.js` | 0-7 | Register new suites in dependency order |
| `files/data.js` | 1, 3 | Preserve typed permission fields; parse WorkType, WorkGiver, race work metadata |
| `files/app-save.js` | 1, 2 | Preserve raw permission sources and tri-state status source fidelity |
| `files/capability-evidence.js` | 1, 2 | Emit exact permission evidence and current-status facts |
| `files/app-editors.js` | 1, 3 | Preserve scanner fields and replace definition catalogues |
| `files/app.js` | 3, if required | Explicit initial scanner state keys only |
| `main.js` | 3 | Extract new definitions, provenance, patch signals; bump cache version |
| `test/save-parser.fuzz.test.js` | 1, 2 | Raw permission/status parser cases |
| `test/capability-evidence.test.js` | 1, 2 | Exact targets, candidates, pawn source, tri-state facts |
| `test/requirement-scanner.test.js` | 3 | Scanner/parser/completeness/provider cases |
| `files/requirement-registry.js` | 4 | Immutable audited job/race requirement snapshot |
| `test/requirement-registry.test.js` | 4 | Mapping/path/completeness/unknown policy tests |
| `files/permission-resolver.js` | 5 | Canonical structural Permission reports |
| `test/permission-resolver.test.js` | 5 | Permission schema, peer, age, hediff, path, capacity tests |
| `files/c4-evaluation-context.js` | 6 | One-batch immutable C2/C3 evaluation context |
| `files/availability-resolver.js` | 6 | Canonical current Availability reports |
| `test/availability-resolver.test.js` | 6 | Global/job current facts, path, peer, context tests |
| `files/c4-legacy-compatibility.js` | 7 | Explicit legacy delegation and shadow comparison only |
| `test/c4-compatibility.test.js` | 7 | Exact C1 parity and named canonical deltas |
| `test/capability-corpus.test.js` | 7, only if needed | Add frozen cases without altering accepted outputs |
| `files/rimjobs.html` | 4-7 | Load pure C4 modules in dependency order; no UI invocation |
| `test/_harness.js` | 4-7, only if needed | Expose pure globals to tests |
| `docs/architecture/CODE-MAP.md` | 8 | Document modules, inputs, outputs, tests, no-consumer boundary |
| `docs/architecture/INVARIANTS.md` | 8 | Record executable C4 invariants and phase boundaries |

Files intentionally excluded from C4 behavioural modification include `files/engine.js`, `files/app-pawns.js`, `files/app-render.js`, `files/app-priorities.js`, `files/app-schedule.js`, and all planning/UI consumers. They may be inspected and searched, not migrated.

## Task dependency graph

```text
Task 0: audit contracts
   |
   +--> Task 1: C2 permission evidence
   |       |
   |       +--> Task 4: requirement registry
   |
   +--> Task 2: C2 tri-state status
   |       |
   |       +------------------------+
   |                                |
   +--> Task 3: scanner/provider ----+--> Task 4
                                           |
                                           v
                                  Task 5: Permission
                                           |
                                           v
                           Task 6: context + Availability
                                           |
                                           v
                           Task 7: compatibility + shadow
                                           |
                                           v
                           Task 8: regression + architecture
```

Tasks 1, 2, and 3 are logically independent after Task 0, but they should remain sequential commits in this repository to keep dirty-tree staging reviewable. Task 4 requires Tasks 1 and 3. Task 6 requires Task 2 and the registry; it follows Task 5 so report/evaluation conventions stay consistent.

## Required test matrix

| Area | Required executable cases |
| --- | --- |
| Audit fixture | exact WorkTags, Firefighter tags, Human Fishing no gate, Anomaly Hauling zero path, 23 direct plus 10 unknown jobs |
| C2 targets | exact WorkType (not relabelled as job), exact WorkTag, scalar and multi flags, audited bitmask matching, `AllWork`, unknown raw target, structured candidates, no raw parsing in C4 |
| Pawn permission | raw source present/absent/unknown, vanilla flags, modded raw token, legacy array unchanged |
| Status fidelity | known true, known false, unknown for downed, mental state, mental break, deactivated; unconscious/can-awake missing stays unknown |
| Scanner | inheritance, duplicate conflict, active package filtering, exact/broad patch signal, unsupported giver, malformed XML |
| Registry | 23 direct policies, 10 unknown app jobs, custom unknown, per-dimension completeness, modded race definition lookup |
| Permission peer aggregation | allowed, blocked, relevant unknown, blocker plus unknown, unrelated unknown ignored |
| Permission targets | exact job, exact WorkType, exact WorkTags/bitmask semantics, namespace mismatch, ambiguity unanimous/non-unanimous, no legacy alias parsing |
| Conditional restrictions | persistent, temporary, unknown persistence, known active/inactive stage, missing severity, unsupported condition |
| Age | below, at, above, missing age, known no gate, unknown relevant entry, partial unrelated entry |
| Capacity values | below, exact-boundary failure, above, unknown, unsupported, explicit `notApplicable` outcomes |
| WorkGiver paths | all satisfied, failed plus success, failed plus unknown, all failed, zero-capacity complete, complete empty, incomplete empty |
| Availability global | each supported fact true/false/unknown, no guessed false, evaluation continues after blocker |
| Availability job | current capacity path cases, temporary job/tag restriction, unrelated unknown ignored |
| Peer outputs | blocked+available, allowed+unavailable, blocked+unavailable, Permission unknown, Availability unknown |
| Context | one C2 and one C3 call across jobs, immutable snapshot, no cross-batch cache |
| Compatibility | exact `evaluateJobPermission`, exact `isIncapable`, downed decomposition, manipulation bridge, age bridge, all corpus cells |
| Named deltas | Firefight/Violent, Fishing age, Hauling/Manipulation, every `incapBlocks` row, unresolved app job |
| Regression | complete C1, C2, C3, C4 suites; syntax; script order; architecture searches |

## Static architecture gates

The final implementation must prove:

1. No canonical C4 symbol is called from `engine.js`, `app-pawns.js`, renderers, priority code, or scheduler code.
2. No canonical module references `incapBlocks`, `JOB_MIN_AGE`, or `MANIPULATION_GATED_JOBS`.
3. No canonical resolver reads raw pawn health, raw incapability arrays, or XML parser fields.
4. No production canonical module compares or switches on `raceDefName` values.
5. No long-lived cache, revision counter, or manual invalidation path is introduced.
6. `files/rimjobs.html` loads C2, C3, registry, context/resolvers, then compatibility in dependency order, but does not invoke them.
7. All unknown app/custom policies remain explicit.
8. C3 source and test semantics remain unchanged except for additive test harness loading if required.
9. Temporal critical-job, emergency-job, and `JOBS[].important` policies remain in their existing consumer layer and are absent from C4 resolvers.
10. C2 typed `disabledWorkTypes` remain WorkType targets; no canonical adapter relabels them as RimJobs job IDs.
11. The request-scoped context supplies C3 with the full accepted capability-definition bundle and never reconstructs C3 inputs from C4 registry data.

## C4 exit criteria

C4 is ready for review only when:

- Tasks 0-8 have separate passing commit boundaries;
- the exact audit-derived C2 prerequisites are present, including separate job/WorkType/WorkTag namespaces and executable WorkTags flag semantics;
- scanner/provider completeness is dimension/path specific;
- requirement snapshots are immutable and versioned;
- Permission and Availability reports conform to schema version 1;
- strict threshold, alternative paths, zero path, unknown path, blocker-plus-unknown, tri-state status, `notApplicable`, app unknown, and modded race cases pass;
- one request-scoped context performs one C2 collection and one C3 resolution per pawn batch;
- exact C1 production outputs and every C1-C3 regression remain green;
- canonical-versus-legacy differences are named shadow results only;
- static gates prove no planning/UI migration;
- architecture docs describe what is built and what remains unknown;
- final `git status --short` is shown and only task-owned files are staged in each commit.

Completion of C4 does not authorise C7 consumer migration or C8 smarter behaviour.

## Expected intentional canonical-versus-legacy differences

| Case | Canonical C4 truth | Frozen C1 compatibility truth | C4 handling |
| --- | --- | --- | --- |
| Firefight and `Violent` | `Firefighter` uses `Firefighting`, `Commoner`, `AllWork`; `Violent` alone does not block | `firefight.incapBlocks` includes `violence` and `firefight` | Named shadow delta; production unchanged |
| Human Fishing age | Complete Human policy has no Fishing gate | `JOB_MIN_AGE.fishing = 7` | Named shadow delta; production unchanged |
| Anomaly Hauling and Manipulation | Complete zero-capacity `TakeEntityToHoldingPlatform` path can satisfy the any-path group | Global `MANIPULATION_GATED_JOBS` can block Hauling | Named shadow delta; production unchanged |
| Mixed `incapBlocks` | Exact WorkType/WorkTag namespaces, including missing Commoner/AllWork and no false analogues | Lower-case mixed app tokens | Data-driven shadow table; production unchanged |
| Downed | Structural Permission is independent; Availability may be unavailable | Legacy `evaluateJobPermission()` blocks early | Canonical decomposition plus exact legacy assertion |
| Ten app jobs/custom jobs | Unknown without explicit audited policy | Frozen analogue or no-block behaviour | Canonical unknown plus exact legacy assertion |

## Unresolved risks that must remain unknown

- effective modded definitions affected by unapplied PatchOperations, version/load-folder selection, XML Extensions, or C# mutation;
- incomplete/ambiguous active-package resolution where Core/official DLC/save mod activation cannot be proven;
- WorkGiver catalogue membership or required capacities that cannot be proven from active definitions;
- unsupported/custom WorkGiver execution semantics;
- runtime disability sources not yet represented in C2, including pawn kind, titles, mutants, quests, guest/slave policy, and other live components;
- ordinary saves that do not serialise authoritative combined disabled WorkTags;
- missing or incomplete mental-state, mech component, faction, race `alwaysAwake`, life-stage, pain, and status evidence;
- C3 awake-gated current capacities that remain unknown in the accepted one-call evaluation boundary;
- any app-only or user custom job without a reviewed explicit `appPolicy`;
- any capacity worker or `notApplicable` policy not audited by C3/C4;
- memoisation beyond one request-scoped context because no pawn/definition revision owner exists.

None of these risks authorises a false default, numeric zero, race-name branch, closest analogue, legacy constant in canonical resolution, or consumer migration.

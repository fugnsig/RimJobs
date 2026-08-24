# C3: Body + Capacity Resolution - Design Specification

**Date:** 2026-08-24
**Phase:** C3 (follows C2: Canonical Evidence)
**Approach:** Definition-driven generic resolver with narrowly scoped scanner extraction

---

## Architectural principle

Resolve only what definitions and verified worker semantics prove; otherwise return `unknown`.

No resolver may branch on race name, xenotype, defName, or part name to determine capacity semantics. Capacity resolution derives from body definitions, capacity definitions, tags, declarative effects, and resolved runtime facts.

---

## Frozen invariants

### Race agnosticism

- **RACE-001:** No resolver may branch on race/xenotype/defName to determine capacity semantics.
- **RACE-002:** Body applicability comes from BodyDef, body-part structure/tags, PawnCapacityDef, and supported worker semantics.
- **RACE-003:** A modded race using supported vanilla-compatible semantics must resolve automatically without RimJobs knowing that race exists.
- **RACE-004:** Unknown custom bodies/workers never fall back to human anatomy or healthy-human 1.0.
- **RACE-005:** `HUMAN_BODY_INDEX` / `HUMAN_BODY_PARENT` are legacy compatibility evidence only, never the canonical capacity model.
- **RACE-006:** Unsupported custom capacity workers or C# behaviour produce `unknown` with provenance, not false certainty.
- **RACE-007:** Scanner extraction and semantic support are separate. RimJobs should preserve unfamiliar definitions even when it cannot yet resolve them.
- **RACE-008:** No planning consumer may use raw race, xenotype, gene, hediff, or prosthetic identity once canonical evidence/resolution exists.

### Scanner scope

- **C3-SCAN-001:** C3 may extend the scanner only to acquire declarative definition metadata required by capacity resolution. Scanner extraction does not imply semantic support - unsupported workers or schemas are preserved and resolve to `unknown`.
- **C3-SCAN-002:** The resolver may use legacy human body tables as compatibility evidence only when canonical BodyDef metadata is unavailable for a known compatible human body. They are not the canonical capacity model.
- **C3-SCAN-003:** A synthetic non-human BodyDef using supported vanilla part tags and capacity-worker semantics must be resolvable without any race-name or human-index branch.

### Applicability

- **CAP-APP-001:** `notApplicable` requires positive semantic evidence that the capacity does not apply. Missing, incomplete, or unsupported definition data yields `unknown`, not `notApplicable`.

### Snapshot persistence

- **CAP-SNAPSHOT-001:** Evidence may enter the structural snapshot only when its persistence/anatomical semantics are established. Relevant evidence with unresolved persistence prevents a falsely complete structural result - structural becomes `unknown` for any capacity where that evidence would be relevant.

### Capacity states

- Capacities are continuous facts, not boolean capability flags.
- `notApplicable` is never coerced to zero.
- Known capacity name with unknown/custom worker semantics => `unknown`.
- Cyclic or unresolvable dependency => affected dependency chain `unknown`, never 0, baseline, or recursive failure.

### Scope boundaries

- No job permission logic in C3.
- No effectiveness/ranking logic in C3.
- No availability logic in C3.
- No scheduler logic.
- `MANIPULATION_GATED_JOBS` remains a parity bridge elsewhere. C3 must not encode job rules.
- C1/C2 behaviour remains unchanged. C3 is representation/resolution infrastructure only.

---

## 1. Scanner extraction contracts

### Principle: scanner extracts, resolver interprets

The scanner preserves declarative XML fields faithfully. It does not interpret worker semantics, apply PatchOperations, or emulate C# logic. If a PawnCapacityDef declares `workerClass: 'MyMod.PawnCapacityWorker_Telepathy'`, the scanner stores it. The resolver decides it is unsupported.

### Definition completeness metadata

Every scanned definition carries completeness metadata:

```js
{
  ...definition,
  _completeness: 'complete' | 'partial' | 'unknown'
}
```

- `complete`: the scanner found and parsed the full XML definition with no ambiguity.
- `partial`: the definition was found but some expected fields were missing or unparseable.
- `unknown`: the definition was referenced but not found in any scanned source.

This prevents false `notApplicable` from unapplied PatchOperations or missing mod data. A `partial` or `unknown` definition cannot prove absence of a tag.

### BodyDef extraction (new)

```js
{
  defName: 'Human',
  label: 'humanlike',
  _completeness: 'complete',
  corePart: {
    def: 'Torso',              // BodyPartDef defName
    customLabel: null,          // presentation only, not identity
    coverage: 1.0,
    depth: 'Outside',
    height: 'Middle',
    parts: [
      {
        def: 'Spine',
        customLabel: null,
        coverage: 0.025,
        depth: 'Inside',
        height: null,
        parts: [...]
      },
      {
        def: 'Shoulder',
        customLabel: 'left shoulder',
        coverage: 0.06,
        parts: [
          { def: 'Arm', customLabel: 'left arm', parts: [...] }
        ]
      },
      // ...recursive
    ]
  }
}
```

The scanner preserves the tree exactly as XML declares it. DFS traversal of this tree produces the index used in save files. No index is stored in the definition - it is computed at load time by the resolver.

`customLabel` is presentation metadata only. No semantic inference (including left/right side) should be derived from labels. Capacity workers should not need side information unless verified worker semantics explicitly require it.

### BodyPartDef extraction (new)

```js
{
  defName: 'Arm',
  label: 'arm',
  hitPoints: 30,
  tags: ['ManipulationLimbCore'],   // BodyPartTagDef references
  _completeness: 'complete'
}
```

Tags are the critical field - they connect body parts to capacity workers via the worker's `CanHaveCapacity` semantics.

### PawnCapacityDef extraction (new)

```js
{
  defName: 'Manipulation',
  label: 'manipulation',
  workerClass: 'PawnCapacityWorker_Manipulation',
  minForCapable: 0.0,
  minValue: null,
  zeroIfCannotBeAwake: false,
  lethalFluctuations: false,
  lethalMechanically: false,
  showOnHumanlikes: true,
  showOnAnimals: true,
  showOnMechanoids: true,
  _completeness: 'complete'
}
```

All declarative fields are preserved. `minForCapable`, `minValue`, and `zeroIfCannotBeAwake` are required by the capacity calculation utility and must be extracted.

### HediffDef capMods extraction (extension of existing hediffCatalog)

Per hediff stage, in addition to existing `disabledWorkStages`:

```js
{
  def: 'Flu',
  // ...existing fields (label, hediffClass, category, defaultSeverity, disabledWorkStages)...
  capModStages: [
    {
      minSeverity: 0.0,
      capMods: [
        {
          capacity: 'Consciousness',   // PawnCapacityDef defName
          offset: -0.05,
          postFactor: null,
          setMax: null
        }
      ],
      partEfficiencyOffset: null,
      partIgnoreMissingHP: false
    },
    {
      minSeverity: 0.6,
      capMods: [
        { capacity: 'Consciousness', offset: -0.15, postFactor: null, setMax: null }
      ],
      partEfficiencyOffset: -0.2,
      partIgnoreMissingHP: false
    }
  ]
}
```

The scanner preserves `offset`, `postFactor`, and `setMax` distinctly per capMod. Stage-level `partEfficiencyOffset` and `partIgnoreMissingHP` are also preserved - they are required for correct part-efficiency calculation.

The resolver - not the scanner - owns composition order.

### Prosthetic/added-part data (existing + extension)

Existing `parseProstheticsFromXML` already extracts `addedPartProps.partEfficiency`. This remains the source.

### Scanner extraction summary

| Data | Source XML | Key fields | Status |
|---|---|---|---|
| BodyDef | Bodies_*.xml | defName, corePart tree (recursive: def, customLabel, coverage, depth, height, child parts) | NEW |
| BodyPartDef | BodyParts_*.xml | defName, label, hitPoints, tags | NEW |
| PawnCapacityDef | PawnCapacityDefs/ | defName, label, workerClass, minForCapable, minValue, zeroIfCannotBeAwake, lethal*, show* | NEW |
| HediffDef capMods | HediffDefs/ | Per stage: minSeverity, capMods[{capacity, offset, postFactor, setMax}], partEfficiencyOffset, partIgnoreMissingHP | EXTEND existing |
| Prosthetic efficiency | HediffDefs/ | addedPartProps.partEfficiency | EXISTS |
| Part HP | BodyPartDefs/ | hitPoints | EXISTS (BODY_PART_HP_BASE), will also come from BodyPartDef scan |

---

## 2. Save body-part -> BodyDef node identity join

### Index semantics

RimWorld save files reference body parts as `<body>Human</body><index>25</index>`. The `<body>` field is the BodyDef defName and `<index>` is the depth-first traversal position within that BodyDef's recursive part tree. `BodyDef` itself builds `AllParts` via recursive parent-first traversal and exposes `GetPartAtIndex()`/`GetIndexOfPart()` on that cached list.

### Definition-side index construction

Given a scanned BodyDef tree, DFS traversal at load time produces an `index -> partNode` mapping:

```js
function buildPartIndex(bodyDef) {
  const parts = [];
  const parents = [];
  function dfs(node, parentIdx) {
    const myIdx = parts.length;
    parts.push(node);
    parents.push(parentIdx);
    if (node.parts) {
      for (const child of node.parts) dfs(child, myIdx);
    }
  }
  dfs(bodyDef.corePart, -1);
  return { parts, parents };
}
```

This replaces `HUMAN_BODY_INDEX` with a definition-driven equivalent that works for any body.

### Join pipeline

1. Pawn has `bodyDef` from save import (parser sets it from `<body>` tag in hediff part blocks; empty string for standard humans where the parser only sets it for non-Human bodies).
2. Look up the scanned BodyDef by the pawn's `bodyDef` value.
3. **If `bodyDef` is empty/missing:** the pawn MIGHT use the Human body, but this must be positively confirmed. Positive confirmation means the save parser saw `<body>Human</body>` on at least one hediff's `<part>` block for this pawn during import. The save parser must be adjusted to record this positive identification (currently it only sets `bodyDef` for non-Human bodies). A missing `bodyDef` field with no positive Human identification means body identity is unknown.
4. If the scanned BodyDef is found: `buildPartIndex()` gives index -> part node mapping.
5. If not found AND the pawn is positively known to use a Human-compatible body: fall back to `HUMAN_BODY_INDEX`/`HUMAN_BODY_PARENT` (C3-SCAN-002 compatibility evidence).
6. If not found AND body identity is unknown or non-Human: part identity unknown -> capacity resolution produces `unknown`.

### Part node identity

Each part node is identified by `{ bodyDef, partIndex }` - the BodyDef defName plus the DFS traversal index. This is the stable structural identity for provenance tracking. Labels (`customLabel`) are attached for display but never used as identity.

### Verification requirement

Before implementation, verify that the current RimJobs save parser (`parsePawnFields` in `app-save.js`) reads the exact body-def/index pair expected. The parser currently extracts `<body>` and `<index>` from `<part>` blocks within hediffs (lines 1070-1087 of `app-save.js`). Confirm this matches the BodyDef DFS ordering.

---

## 3. CapacityFact schema

### Capacity snapshot result (one mode - structural or current)

```js
{
  state: 'resolved',         // | 'notApplicable' | 'unknown'
  value: 0.72,               // float when resolved, null otherwise
  reason: null,              // string when not resolved:
                             //   'unsupportedCapacityWorker'
                             //   'cyclicDependency'
                             //   'unresolvedDependency'
                             //   'missingBodyDefinition'
                             //   'insufficientBodyMetadata'
                             //   'unknownPartEfficiency'
                             //   'unresolvedPersistence'
                             //   'capacityNotApplicable'
  confidence: 'derived',     // 'verified' | 'derived' | 'inferred' | 'unknown'
  evidence: [...],            // input evidence used (see section 12)
  derivedFrom: [...]          // dependency resolutions consumed (see section 12)
}
```

### Full pawn capacity output

```js
{
  bodyDefName: 'Human',          // BodyDef defName, null if unknown
  bodyDefResolved: true,          // false if BodyDef not scanned
  capacities: {
    consciousness: {
      capacity: 'consciousness',
      workerClass: 'PawnCapacityWorker_Consciousness',
      workerSupported: true,
      structural: { state, value, reason, confidence, evidence, derivedFrom },
      current:    { state, value, reason, confidence, evidence, derivedFrom },
    },
    manipulation: { ... },
    moving:       { ... },
    sight:        { ... },
    talking:      { ... },
    hearing:      { ... },
    // Any additional PawnCapacityDefs found by the scanner also appear here,
    // with workerSupported: false and both snapshots { state: 'unknown' }
  }
}
```

There is no separate `unresolvedCapacities` array. Every capacity appears in `capacities` with its resolved state. If UI needs a list of unresolved capacities, it derives it by filtering `capacities` for `state !== 'resolved'`.

---

## 4. Structural vs current snapshots

### Principle

Structural and current are two evidence snapshots through the same worker semantics, not independent algorithms. Both use the same BodyDef, the same PawnCapacityDef, the same worker implementation, the same dependency graph, and the same baseline semantics. The only difference is which applicable evidence belongs in the snapshot.

### Evidence classification

Evidence enters a snapshot based on its proven persistence semantics, not its hediff type label:

**Structural snapshot (proven persistent/anatomical):**
- Missing parts (`type: 'missing'`) - anatomical absence is structural by definition
- Replacements/prosthetics (`type: 'replaced'`) - surgically installed, structural
- Implants (`type: 'implant'`) - surgically installed, structural
- Permanent injuries (`type: 'injury', permanent: true`) - explicitly permanent
- Hediff capMods from hediffs with proven persistent semantics

**Current snapshot (all active evidence):**
- Everything in structural
- Fresh injuries (`type: 'injury', permanent: false`)
- All other active hediffs and their capMods
- Evidence with unresolved persistence semantics

**Unresolved persistence:**

Per CAP-SNAPSHOT-001, evidence whose persistence cannot be determined (e.g., a modded condition with no permanent/chronic marker) follows these rules:
- It DOES enter the current snapshot (it is active right now)
- It does NOT enter the structural snapshot
- If that evidence would be relevant to a structural capacity calculation, the structural result for that capacity becomes `{ state: 'unknown', reason: 'unresolvedPersistence' }`
- Unrelated capacities are unaffected

This prevents declaring a capacity structurally healthy simply because RimJobs does not understand whether a modded hediff is permanent.

### Current is not structural + temporaries

The resolver runs the full worker algorithm independently for each snapshot. Current is NOT computed as `structuralResult + temporaryModifiers`. Both snapshots feed independently into the same worker. Any structural/current difference must have traceable evidence - the provenance chain shows exactly which evidence items differ between the two runs.

---

## 5. Resolver registry and worker ownership

### Registry structure

Each worker entry owns its dependency declarations, applicability logic, and resolution semantics:

```js
const CapacityWorkerRegistry = {
  workers: {
    'PawnCapacityWorker_Consciousness': {
      dependencies: [],
      canApply(bodyDef, bodyPartDefs, partIndex) { ... },
      resolve(capacityDef, bodyDef, partIndex, bodyPartDefs,
              evidenceSnapshot, hediffCapMods, resolvedDeps) { ... }
    },
    'PawnCapacityWorker_Manipulation': {
      dependencies: ['consciousness'],
      canApply(bodyDef, bodyPartDefs, partIndex) { ... },
      resolve(...) { ... }
    },
    'PawnCapacityWorker_Moving': {
      dependencies: ['consciousness'],
      canApply(...) { ... },
      resolve(...) { ... }
    },
    'PawnCapacityWorker_Sight': {
      dependencies: [],
      canApply(...) { ... },
      resolve(...) { ... }
    },
    'PawnCapacityWorker_Talking': {
      dependencies: ['consciousness'],
      canApply(...) { ... },
      resolve(...) { ... }
    },
    'PawnCapacityWorker_Hearing': {
      dependencies: [],
      canApply(...) { ... },
      resolve(...) { ... }
    },
  }
};
```

Dependencies are owned by the worker entry, not a global table. The verified Manipulation worker explicitly multiplies limb efficiency by consciousness - that semantic belongs to the Manipulation worker, not to a generic dependency combiner.

### Worker function contracts

**`canApply(bodyDef, bodyPartDefs, partIndex)`**
- Returns `true` if the capacity applies to this body
- Returns `false` only as a positive determination (the worker examined the BodyDef and found no applicable structure)
- The caller checks definition completeness before interpreting `false` as `notApplicable`

**`resolve(capacityDef, bodyDef, partIndex, bodyPartDefs, evidenceSnapshot, hediffCapMods, resolvedDeps)`**
- Returns a capacity snapshot result `{ state, value, reason, confidence, evidence, derivedFrom }`
- Uses `resolvedDeps` for dependency values (e.g., consciousness value for manipulation)
- Must not branch on race/body/part names

### Unsupported workers

Any `workerClass` not in the registry produces:

```js
{
  state: 'unknown',
  reason: 'unsupportedCapacityWorker',
  confidence: 'unknown',
  evidence: [{ kind: 'workerClass', workerClass: 'MyMod.PawnCapacityWorker_Telepathy' }],
  derivedFrom: []
}
```

Capacities dependent on an unsupported worker propagate `unknown` through the dependency chain. Unrelated capacities resolve normally.

### Worker implementation requirements

Worker implementations must be verified against decompiled RimWorld source before coding. The following patterns are expected based on decompiled source but exact implementations are frozen only after verification:

- **Consciousness:** Brain-part-dependent, not a generic tagged-part sum.
- **Manipulation:** Uses `CalculateLimbEfficiency` with specific core/segment/digit tags and appendage weight, multiplied by consciousness.
- **Sight:** Uses tagged-part efficiency with special weighting for the best part (not a simple sum).
- **Moving:** Limb-efficiency-based with consciousness dependency.
- **Talking/Hearing:** Tagged-part efficiency patterns.

C3 implements `CalculatePartEfficiency`-equivalent and `CalculateTagEfficiency`-equivalent behaviour only for the verified declarative semantics it supports. It must not replace that behaviour with a generic injury-severity approximation.

---

## 6. Applicability determination

### Flow

```
Is the worker supported (in registry)?
  No -> { state: 'unknown', reason: 'unsupportedCapacityWorker' }
  Yes ->
    Is the BodyDef definition complete?
      No (partial or unknown) ->
        Worker.canApply() returns false?
          -> { state: 'unknown', reason: 'insufficientBodyMetadata' }
             (cannot prove notApplicable with incomplete definitions)
        Worker.canApply() returns true?
          -> proceed to resolution (with degraded confidence)
      Yes (complete) ->
        Worker.canApply() returns false?
          -> { state: 'notApplicable', reason: 'capacityNotApplicable' }
        Worker.canApply() returns true?
          -> proceed to resolution
```

Per CAP-APP-001: `notApplicable` requires a supported worker, complete definition metadata, and a positive determination by the worker that the capacity does not apply. In every other case, `unknown`.

---

## 7. Baselines

No hard-coded 1.0. The baseline is computed by running the worker against a healthy body definition (all parts intact, no hediffs, no capMods). This is not stored as a separate value - it emerges from the worker algorithm applied to the body definition with no modifications.

For a human body, the verified worker algorithm applied to a healthy human BodyDef should produce the vanilla baseline. For a three-armed alien body using supported tags, the same worker algorithm produces whatever the definition implies.

The structural result of a fully healthy pawn IS the baseline.

---

## 8. Part efficiency

### Principle

C3 implements `CalculatePartEfficiency`-equivalent behaviour for verified declarative semantics only. It does not replace that with a generic injury-severity approximation.

### Vanilla part-efficiency calculation (to be verified)

Based on decompiled `PawnCapacityUtility.CalculatePartEfficiency`, the actual calculation considers:

- Whether the part has an added-part hediff (prosthetic/bionic) -> uses `addedPartProps.partEfficiency`
- Whether an ancestor has an added part that covers this part
- Whether the part is missing -> efficiency 0
- Whether a parent part is missing -> affects child parts
- Stage-level `partEfficiencyOffset` from active hediffs
- `partIgnoreMissingHP` flag
- Remaining part health relative to max HP (when not ignored)
- Special health scaling in some cases

C3's scanner contract preserves the declarative inputs needed:
- `addedPartProps.partEfficiency` (exists)
- `partEfficiencyOffset` per hediff stage (new)
- `partIgnoreMissingHP` per hediff stage (new)
- `hitPoints` per BodyPartDef (exists as `BODY_PART_HP_BASE`, also from new BodyPartDef scan)

The resolver implements verified part-efficiency semantics. Where a hediff or body-part interaction uses semantics the resolver does not support, the part efficiency is `unknown`, which makes any capacity depending on that part `unknown`.

### Unknown prosthetic efficiency

If a replacement/prosthetic hediff's `partEfficiency` is not known (the hediff def was not scanned), the part efficiency is unknown. Any capacity that depends on that part becomes:

```js
{
  state: 'unknown',
  reason: 'unknownPartEfficiency',
  evidence: [{ kind: 'unknownProsthetic', hediffDef: '...', bodyDef: '...', partIndex: N }]
}
```

No assumed 1.0. No inferred efficiency. Unrelated capacities (those not using that part) still resolve normally.

---

## 9. Missing parts and capacity effects

1. Build the part index from the scanned BodyDef (DFS traversal).
2. Join pawn's body evidence (from C2 `bodyEvidenceFromPawnHealth`) to part nodes via the save-identity join (section 2).
3. For each part node relevant to the capacity (determined by worker's tag lookup):
   - Part present and healthy: natural efficiency from verified calculation
   - Part missing: efficiency 0 (from verified part-efficiency semantics)
   - Part replaced: prosthetic efficiency from scanned `partEfficiency`, or `unknown`
   - Part with hediff affecting efficiency: from verified `partEfficiencyOffset` / health semantics
4. The worker combines tagged part efficiencies according to its verified algorithm.

No part name matching. No race name branching. Tags on the BodyPartDef determine which parts matter. The DFS index join determines which parts are damaged.

---

## 10. Hediff capMods - composition order

### Scanner contract

Each hediff stage declares capacity modifiers:

```js
capMods: [
  { capacity: 'Consciousness', offset: -0.05, postFactor: null, setMax: null }
]
```

The scanner preserves `offset`, `postFactor`, and `setMax` distinctly. It also preserves `minSeverity` per stage for conditional application.

### Composition semantics (to be verified against target RimWorld version)

Based on decompiled `PawnCapacityUtility.CalculateCapacityAndRecord`, the expected order is:

1. Worker calculates natural capacity from body parts/tags
2. If `zeroIfCannotBeAwake` and pawn cannot be awake: result = 0, skip modifiers
3. If worker result is positive, apply capacity modifiers:
   a. Accumulate all applicable hediff `offset` values
   b. Multiply by all applicable hediff `postFactor` values
   c. Apply minimum of all applicable `setMax` values
4. Apply `PawnCapacityDef.minValue` if present
5. Round to two decimal places

**The exact arithmetic is not frozen in this spec.** Implementation must verify against the RimWorld version RimJobs targets. The spec freezes only the principle: the resolver owns composition, the scanner preserves raw declarative values, and the order must match verified vanilla behaviour.

### Active stage selection

For a given pawn, the resolver selects the applicable hediff stage based on current severity vs stage `minSeverity` thresholds - the highest `minSeverity` that does not exceed the hediff's current severity.

---

## 11. Dependency resolution and unknown propagation

### Algorithm: DFS with memoisation and cycle detection

```
resolve(capacityName):
  if state[capacityName] == 'resolved': return cache[capacityName]
  if state[capacityName] == 'resolving': return CYCLE_MARKER

  state[capacityName] = 'resolving'

  worker = registry.workers[capacityDefs[capacityName].workerClass]
  if !worker:
    mark resolved, cache { state: 'unknown', reason: 'unsupportedCapacityWorker' }
    return

  resolvedDeps = {}
  for depName in worker.dependencies:
    depResult = resolve(depName)
    if depResult == CYCLE_MARKER:
      mark resolved, cache { state: 'unknown', reason: 'cyclicDependency' }
      return
    if depResult.state == 'unknown':
      mark resolved, cache { state: 'unknown', reason: 'unresolvedDependency',
                              derivedFrom: [{ kind: 'dependency', capacity: depName,
                                              state: 'unknown', reason: depResult.reason }] }
      return
    resolvedDeps[depName] = depResult

  // Check applicability
  applicable = worker.canApply(bodyDef, bodyPartDefs, partIndex)
  if !applicable:
    if bodyDef._completeness == 'complete':
      mark resolved, cache { state: 'notApplicable', reason: 'capacityNotApplicable' }
    else:
      mark resolved, cache { state: 'unknown', reason: 'insufficientBodyMetadata' }
    return

  // Run worker
  result = worker.resolve(capacityDef, bodyDef, partIndex, bodyPartDefs,
                          evidenceSnapshot, hediffCapMods, resolvedDeps)
  mark resolved, cache result
  return result
```

### Unknown propagation rules

- A dependency resolving to `unknown` makes the dependent capacity `unknown` (with `derivedFrom` provenance).
- A dependency resolving to `notApplicable` is handled by the worker - the worker decides what `notApplicable` consciousness means for manipulation.
- An unrelated capacity being `unknown` does NOT affect other capacities.
- Unknown evidence on one body part does NOT poison capacities that do not use that part.
- Unknown prosthetic efficiency on one part makes capacities using that part `unknown` but does not affect capacities using other parts.

---

## 12. Cycle detection

Handled within the DFS resolver (section 11). The `resolving` state flag detects re-entry.

On cycle detection:
- The capacity that re-encounters itself: `{ state: 'unknown', reason: 'cyclicDependency' }`
- All capacities that depend on the cycle participant: `{ state: 'unknown', reason: 'unresolvedDependency', derivedFrom: [...] }`
- Capacities NOT in the cycle's dependency chain resolve normally.

---

## 13. Provenance / derivedFrom representation

### Evidence entries

```js
// Part contribution to capacity
{
  kind: 'partContribution',
  bodyDef: 'Octopoid_Test',
  partIndex: 7,                // stable structural identity
  partDef: 'ToolTentacleA',    // from BodyPartDef, for display
  tags: ['ManipulationLimbCore'],
  naturalEfficiency: 1.0,
  adjustedEfficiency: 0.5,
  source: 'hediff:BionicArm',
}

// capMod applied
{
  kind: 'capMod',
  hediffDef: 'Flu',
  stage: 1,
  modType: 'offset',           // | 'postFactor' | 'setMax'
  modValue: -0.15,
}

// Unknown part efficiency
{
  kind: 'unknownProsthetic',
  hediffDef: 'SomeModProsthetic',
  bodyDef: 'Human',
  partIndex: 25,
}

// Worker class
{
  kind: 'workerClass',
  workerClass: 'MyMod.PawnCapacityWorker_Telepathy',
}
```

### Dependency references

```js
{
  kind: 'dependency',
  capacity: 'consciousness',
  state: 'resolved',
  value: 0.9,
  confidence: 'derived',
}
```

Identity is always structural (`bodyDef` + `partIndex`), never label-based.

---

## 14. What cannot be safely resolved offline

- Custom `PawnCapacityWorker` C# implementations -> capacity = `unknown`
- Harmony-patched vanilla workers -> resolver unaware, may produce stale results (confidence degraded)
- Gene capacity effects not declared in capMods XML -> `unknown`
- Dynamic C# hediff effects (`HediffComp` modifying capacity via code) -> `unknown`
- BodyPartDef tags added via PatchOperation that the scanner missed -> missing tags, capacity may be `unknown` (never falsely `notApplicable` per CAP-APP-001 + completeness metadata)
- Capacity definitions declared only in C# (not XML PawnCapacityDef) -> invisible to scanner
- Multi-hediff interactions computed in C# -> individual capMods captured but C#-driven interactions are not
- Weather/map-condition capacity effects -> not in save data
- Food/drug capacity effects beyond what hediff capMods declare -> `unknown`

---

## 15. Test matrix

### Group A: Semantic contract gates (primary architectural validation)

These tests define correctness. They use synthetic data and verify semantic contracts, not human-body assumptions.

**A1. Synthetic body + supported worker resolves without race/part names**
- Create `Octopoid_Test` BodyDef with `ThinkingSac`, `ToolTentacleA`, `ToolTentacleB`, `LocomotorRing`
- Parts tagged with supported vanilla capacity tags
- Verify all tagged capacities resolve
- Verify no race name, body name, or part name appears in resolver code paths

**A2. Synthetic body + unsupported worker produces `unknown` for only that capacity**
- Add `PawnCapacityWorker_MagicTentacleLogic` capacity to same pawn
- That capacity = `{ state: 'unknown', reason: 'unsupportedCapacityWorker' }`
- Other supported capacities on same pawn resolve normally

**A3. Partial BodyDef metadata never produces `notApplicable`**
- BodyDef with `_completeness: 'partial'`
- Worker finds no recognised tag
- Result: `{ state: 'unknown', reason: 'insufficientBodyMetadata' }`
- NOT `notApplicable`

**A4. Unknown prosthetic efficiency on relevant part -> capacity `unknown`**
- Replace a part used by manipulation
- Prosthetic hediff def not in scanned data
- Manipulation: `{ state: 'unknown', reason: 'unknownPartEfficiency' }`

**A5. Unknown prosthetic on irrelevant part -> unrelated capacities resolve**
- Same pawn as A4
- Sight, hearing (not using that part): resolve normally

**A6. Unresolved persistence on relevant hediff -> structural `unknown`, current resolves**
- Active condition with no permanent/chronic marker
- Has capMod on consciousness
- Current consciousness: `resolved` (evidence is active)
- Structural consciousness: `{ state: 'unknown', reason: 'unresolvedPersistence' }`

**A7. Complete body + no applicable parts -> `notApplicable`**
- BodyDef with `_completeness: 'complete'`
- No parts with sight-related tags
- Sight worker's `canApply` returns false
- Result: `{ state: 'notApplicable', reason: 'capacityNotApplicable' }`

**A8. Missing/incomplete body definition -> `unknown`**
- Pawn references BodyDef not in scanned data
- All capacities: `{ state: 'unknown', reason: 'missingBodyDefinition' }`

### Group B: Dependency and cycle tests

**B1. Dependency propagation**
- Consciousness reduced by hediff capMod
- Manipulation, moving, talking reflect dependency according to verified worker semantics

**B2. Unknown dependency propagation**
- Consciousness = `unknown` (unsupported worker or missing data)
- Manipulation, moving, talking = `{ state: 'unknown', reason: 'unresolvedDependency' }`
- Sight, hearing unaffected

**B3. Cycle detection**
- Artificially inject cyclic dependency (A depends on B depends on A)
- Both cycle participants = `{ state: 'unknown', reason: 'cyclicDependency' }`
- Capacities outside the cycle resolve normally

**B4. Dependency on `notApplicable`**
- Consciousness = `notApplicable` on a body
- Worker for manipulation decides semantics (may also be `notApplicable`)

### Group C: Structural vs current

**C1. Fresh injury -> current only**
- Injury on part used by manipulation, `permanent: false`
- Current manipulation affected
- Structural manipulation unchanged

**C2. Permanent scar -> both snapshots**
- Same part, `permanent: true`
- Both structural and current affected

**C3. Temporary hediff with capMod -> current only**
- Disease with consciousness offset
- Current consciousness reduced
- Structural consciousness unchanged (disease is not structural)

**C4. Structural and current use same algorithm**
- Verify both snapshots run through same worker, same dependency graph
- Any difference is traceable to specific evidence items

### Group D: Human body parity fixtures

These are regression tests, not correctness definitions.

**D1. Healthy human, all 6 capacities resolve**
- Values match verified worker algorithm applied to healthy Human BodyDef

**D2. One arm missing -> manipulation reduced**
- Verified against worker algorithm, not assumed proportion

**D3. Both arms/hands missing -> manipulation parity with `_manipulationLost`**
- C3 manipulation at/near zero matches boolean `_manipulationLost` returning true

**D4. Brain scar -> consciousness reduced -> dependents follow**

**D5. Prosthetic arm with known efficiency**
- Manipulation reflects prosthetic's `partEfficiency`

**D6. Bionic arm (efficiency > 1.0)**
- Manipulation reflects boost per worker algorithm

### Group E: CapMod composition

**E1. Single offset**
- Natural + offset, verified order

**E2. Multiple offsets, same capacity**
- Sum correctly

**E3. Offset + postFactor**
- Applied in verified order (offsets first, then factors)

**E4. setMax cap**
- Result capped at minimum of all setMax values

**E5. Composition order matches vanilla**
- Full pipeline: natural -> offsets -> clamp(0) -> postFactors -> setMax -> minValue
- Exact values verified against target RimWorld version

### Group F: Compatibility

**F1. Legacy human body fallback**
- No scanned BodyDef available
- Pawn positively identified as Human-compatible
- Falls back to `HUMAN_BODY_INDEX`/`HUMAN_BODY_PARENT`
- Capacities still resolve (C3-SCAN-002)

**F2. C1/C2 test corpus unchanged**
- All existing 140 + 404 checks pass

**F3. No production consumer migration**
- C3 is infrastructure only; existing production code paths unchanged

---

## Open implementation risks

### Risk 1: Save parser body-def identification

The current save parser sets `pawn.bodyDef` only for non-Human bodies (empty string = human). C3 needs positive Human identification, not absence-means-Human. This may require a small parser adjustment to explicitly record `bodyDef: 'Human'` when `<body>Human</body>` is seen.

### Risk 2: BodyPartDef tag discovery

BodyPartDef tags are the critical link between body parts and capacity workers. If the scanner fails to discover tags (e.g., defined only via PatchOperations), the resolver cannot determine which parts contribute to which capacities. The completeness metadata (`_completeness: 'partial'`) protects against false `notApplicable` but cannot produce `resolved` without the tags.

### Risk 3: Verified worker algorithm fidelity

Each worker implementation must faithfully reproduce verified vanilla semantics. Decompiled source references (BodyDef.cs, PawnCapacityUtility.cs, PawnCapacityDef.cs, individual worker classes) should be consulted during implementation. Approximations or simplifications that produce different results from vanilla for supported scenarios are bugs.

### Risk 4: Hediff persistence classification

Many modded hediffs lack clear permanent/chronic markers. CAP-SNAPSHOT-001 handles this safely (unresolved persistence -> structural `unknown`), but it means structural capacity resolution may frequently be `unknown` for modded pawns until persistence metadata improves.

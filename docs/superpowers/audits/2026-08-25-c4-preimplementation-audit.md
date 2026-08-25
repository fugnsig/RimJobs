# C4 permission and availability pre-implementation audit

**Audit date:** 2026-08-25

**Target runtime:** RimWorld 1.6.4871

**Installed build marker:** `Version.txt` reports `1.6.4871 rev590`

**Target save marker:** `The Iron Brotherhood.rws` reports `1.6.4871 rev591`

**Scope:** Audit gate only. No C4 resolver, compatibility shim, consumer migration, or implementation plan is included.

## Authority and path note

The requested authoritative path, `docs/superpowers/specs/2026-08-25-c4-permission-availability-design-revised.md`, was not present in the repository. The reviewed document with the exact requested title and C4 content was present at:

`docs/2026-08-25-c4-permission-availability-design-revised.md`

This audit used that document as authoritative and records the path discrepancy. It does not copy, move, or edit the design document.

## Evidence inspected

Repository architecture and implementation:

- `CLAUDE.md`
- `CHATGPT_CODEBASE.md`
- `docs/architecture/CODE-MAP.md`
- `docs/architecture/INVARIANTS.md`
- `docs/2026-08-25-c4-permission-availability-design-revised.md`
- `docs/superpowers/specs/2026-08-23-c2-source-adapters-canonical-evidence-design-revised.md`
- `docs/superpowers/specs/2026-08-23-universal-capability-model-design-revised.md`
- `docs/superpowers/specs/2026-08-24-c3-body-capacity-resolution-design-revised.md`
- `files/capability-evidence.js`
- `files/capacity-resolver.js`
- `files/app-save.js`
- `files/data.js`
- `files/engine.js`
- `files/app-render.js`
- `files/app-priorities.js`
- `files/app-pawns.js`
- `files/app-editors.js`
- `files/app-schedule.js`
- `files/app-tabs.js`
- `files/app.js`
- `main.js`
- `test/capability-evidence.test.js`
- `test/capability-corpus.test.js`
- `test/capacity-resolver.test.js`
- `test/engine.optimiser.test.js`

Installed RimWorld data and decompiled 1.6.4871 source:

- `C:\Program Files (x86)\Steam\steamapps\common\RimWorld\Version.txt`
- `C:\Program Files (x86)\Steam\steamapps\common\RimWorld\RimWorldWin64_Data\Managed\Assembly-CSharp.dll`
- `Data\Core\Defs\WorkTypeDefs\WorkTypes.xml`
- `Data\Biotech\Defs\WorkTypeDefs\WorkTypes.xml`
- `Data\Anomaly\Defs\WorkTypeDefs\WorkTypes.xml`
- `Data\Odyssey\Defs\WorkTypeDefs\WorkTypes.xml`
- official Core, Royalty, Ideology, Biotech, Anomaly, and Odyssey `WorkGiverDef` XML files
- `Data\Core\Defs\ThingDefs_Races\Races_Humanlike.xml`
- installed Workshop XML under `steamapps\workshop\content\294100`
- decompiled `Verse.WorkTags`
- decompiled `Verse.WorkTypeDef.ResolveReferences()`
- decompiled `RimWorld.WorkGiverDef`
- decompiled `RimWorld.PawnColumnWorker_WorkPriority.IsIncapableOfWholeWorkType()`
- decompiled `Verse.PawnCapacitiesHandler.CapableOf()` and `CanBeAwake`
- decompiled `Verse.LifeStageWorkSettings`
- decompiled `Verse.Pawn.GetDisabledWorkTypes()`, `CombinedDisabledWorkTags`, and `WorkTagIsDisabled()`
- decompiled `RimWorld.TraitDef`, `Verse.GeneDef`, `RimWorld.BackstoryDef`, `RimWorld.PreceptDef`, and `Verse.HediffStage`
- decompiled `Verse.AI.MentalStateHandler`, `Verse.AI.MentalState`, `Verse.AI.MentalBreaker`, `Verse.Pawn_HealthTracker`, `RimWorld.RestUtility`, and `RimWorld.CompMechanoid`

Save evidence:

- `%USERPROFILE%\AppData\LocalLow\Ludeon Studios\RimWorld by Ludeon Studios\Saves\The Iron Brotherhood.rws`
- `%USERPROFILE%\AppData\LocalLow\Ludeon Studios\RimWorld by Ludeon Studios\Saves\Kaunt.rws`
- the remaining installed `.rws` files for raw `disabledWorkTags` occurrence searches

The target save declares 1,428 active package IDs. Official-definition findings below are exact for the installed 1.6.4871 official data. Modded effective-definition findings are exact only where the current offline data proves them; unapplied patches, inactive version branches, XML Extensions, and C# mutations remain partial or unknown.

### Emitter and caller inventory proof

Repository-wide searches established the current call boundary:

- `_classifyIncap()` has seven call sites: traits, genes, two xenotype fallback branches, backstories, roles, and hediff definitions. All are covered in question 2.
- `collectPawnEvidence()` is called by C2 tests only. There is no current production consumer.
- `resolvePawnCapacities()` is called by C3 tests only. There is no current production consumer.
- production UI calls `App.isIncapable()` from both priority-table orientations and summary counts in `files/app-render.js`.
- `Engine.evaluateJobPermission()` and `evaluatePawnJob()` feed work-capacity, viability, bottlenecks, auto-assignment, temporal coverage, schedule optimisation, colony analysis, and recommendations in `files/engine.js`.
- `files/app-priorities.js` invokes auto-assignment, while `files/app-schedule.js` invokes temporal resilience. Neither calls C2 or C3.

This proves that C2/C3 remain parallel canonical foundations and that migrating any named production caller would be a C7 change, not part of this audit or C4.

## Audit result

The audit gate is answerable. It found no reason to change the Permission and Availability architecture, but it found required C2 and scanner additions before a canonical C4 result can be complete. It also found concrete legacy differences that must remain shadow-only in C4:

- `Firefighter` is tagged `Firefighting`, not `Violent`.
- installed Human race data has no `Fishing` `LifeStageWorkSettings` entry.
- with Anomaly active, `Hauling` has the verified zero-capacity `TakeEntityToHoldingPlatform` path.
- current C2 emitters generally consume lossy lower-case app incapability tokens, not canonical WorkTag or WorkType targets.
- current status parsing coerces missing status data to false and does not preserve the required tri-state facts.
- no pawn or definition revision stamp exists for safe long-lived C4 memoisation.

These are audit findings. No C1-C3 defect was silently fixed.

## 1. Canonical WorkTag namespace

`Verse.WorkTags` is a closed `[Flags]` enum. These are the exact identifiers and values in the target runtime:

| Identifier | Decimal | Hex |
| --- | ---: | ---: |
| `None` | 0 | `0x000000` |
| `ManualDumb` | 2 | `0x000002` |
| `ManualSkilled` | 4 | `0x000004` |
| `Violent` | 8 | `0x000008` |
| `Caring` | 16 | `0x000010` |
| `Social` | 32 | `0x000020` |
| `Commoner` | 64 | `0x000040` |
| `Intellectual` | 128 | `0x000080` |
| `Animals` | 256 | `0x000100` |
| `Artistic` | 512 | `0x000200` |
| `Crafting` | 1024 | `0x000400` |
| `Cooking` | 2048 | `0x000800` |
| `Firefighting` | 4096 | `0x001000` |
| `Cleaning` | 8192 | `0x002000` |
| `Hauling` | 16384 | `0x004000` |
| `PlantWork` | 32768 | `0x008000` |
| `Mining` | 65536 | `0x010000` |
| `Hunting` | 131072 | `0x020000` |
| `Constructing` | 262144 | `0x040000` |
| `Shooting` | 524288 | `0x080000` |
| `AllWork` | 1048576 | `0x100000` |

The exact canonical values accepted by `disableWorkTag.target` are the 20 non-`None` identifiers above, with the same case. A source containing several flags emits one canonical effect for each exact flag. `AllWork` remains `AllWork`; it is not expanded through `INCAP_OPTIONS`.

Runtime matching is bitwise overlap:

```text
(pawn.CombinedDisabledWorkTags & workType.workTags) != WorkTags.None
```

Current RimJobs representation is lossy. `WORKTAG_TO_INCAP` maps 16 WorkTags to 17 lower-case UI tokens and aliases, including `Violent -> violence`, `Firefighting -> firefight`, and `Intellectual -> research`. It has no exact representation for `Commoner`, `Constructing`, `Shooting`, or `AllWork`. `AllWork` is expanded to every current app incapability option. Exact case and source namespace are discarded.

`disableWorkTag.target` must not be derived from `incapBlocks`. `incapBlocks` is a C1 compatibility vocabulary, not the runtime WorkTag namespace.

Canonical `disableJob.target` is also source-defined:

- a runtime `disabledWorkTypes` source uses the exact case-sensitive `WorkTypeDef.defName`, such as `Doctor`;
- an explicit RimJobs `appPolicy` may use its exact app job ID, such as `tending`, with `appPolicy` provenance;
- an opaque legacy token is neither namespace until its source proves which namespace it belongs to.

## 2. Current C2 incapability emitters

All current permission emitters funnel through `_classifyIncap()`. That function builds two load-time vocabularies from built-in `JOBS` and `INCAP_OPTIONS`, then emits `disableJob`, emits `disableWorkTag`, or leaves an ambiguous token unresolved. Its `disableWorkTag` output is a lower-case app token, not a canonical `Verse.WorkTags` identifier.

| C2 source | Current input | Current output quality | Raw runtime/source structure | Safe additive preservation |
| --- | --- | --- | --- | --- |
| `fromTraits` | resolved `def.incapable[]` | Legacy or ambiguous tokens only | `TraitDef.disabledWorkTypes: List<WorkTypeDef>` and `TraitDef.disabledWorkTags: WorkTags` | Preserve exact WorkType defNames and exact WorkTag flags as separate fields. Current scanner ignores `disabledWorkTypes` and remaps `disabledWorkTags`. |
| `fromGenes` | resolved `def.incapable[]` | Legacy tokens when curated; scanned genes commonly emit nothing | `GeneDef.disabledWorkTags: WorkTags` | Preserve the scalar flags value exactly. Current parser incorrectly looks only for child `li` elements even though the runtime field is a scalar flags enum. |
| `fromXenotype` | aggregate `xeno.incapable[]` fallback | Legacy, inferred, and sometimes ambiguous | Summary assembled from underlying genes, or curated app summary | Prefer atomic exact gene fields. A summary-only legacy token remains structured unresolved unless its source metadata names a namespace. |
| `fromBackstories` | resolved `backstory.incapable[]` | Legacy or ambiguous | `BackstoryDef.workDisables: WorkTags` | Preserve exact flags. Baked `workDisables` still contains exact names before `resolveBackstory()` maps them; scanned backstories also remap them. |
| `fromRole` | resolved `role.incap[]` | Legacy or ambiguous | `PreceptDef.roleDisabledWorkTags: WorkTags` | Preserve exact flags. Current curated roles intentionally fold `Constructing` into `skilled_labor`, which is not canonical. |
| `fromIdeology` | no permission field | Emits no `disableJob` or `disableWorkTag` | Role restrictions exist on `PreceptDef`; general ideology adapter emits stat and schedule effects | Role restriction stays in `fromRole`; no generic ideology token should be invented. |
| `effectsFromHediffDefinitions` | `disabledWorkStages[].work[]` | Legacy or ambiguous | each active `HediffStage.disabledWorkTags: WorkTags` | Preserve exact stage flags beside severity bounds. Current parser remaps and expands before C2. |
| `collectPawnEvidence` | adapters above | Does not inspect `pawn.incapable` | current pawn object has a lossy `string[]` | Add a dedicated pawn permission source adapter. Do not reinterpret the old array as canonical. |

Current ambiguous overlap tokens are `firefight`, `hunting`, `hauling`, `cleaning`, `cooking`, `doctoring`, `research`, `crafting`, and `mining`. They occur in both the built-in job-ID set and the legacy incapability set. `_classifyIncap()` correctly refuses to choose, but it currently preserves only `rawTarget`; it does not preserve `candidateTargets`.

Structured candidates are safe only when the source permits them:

- a typed XML `WorkTags` field proves a WorkTag candidate and needs no job candidate;
- a typed `List<WorkTypeDef>` field proves a job target;
- a generic curated `incapable` token may preserve both candidates when both are valid;
- an unknown token with no typed origin remains unresolved without fabricated candidates.

The runtime also has disability sources not represented by current C2 adapters, including pawn-kind WorkTags, conceited royal titles, mutants, quest work disables, guest/slave policy, and explicit `disabledWorkTypes` from several definitions. They are offline limitations until their save and definition inputs are audited. C4 must not silently report those dimensions complete.

## 3. `pawn.incapable`

Current parsed pawn shape:

```ts
type CurrentPawnIncapable = string[];
```

`files/app-save.js` searches a pawn XML block for lowercase or uppercase `disabledWorkTags`, splits comma-separated flags, maps recognised flags through `WORKTAG_TO_INCAP`, expands `AllWork` through `INCAP_OPTIONS`, and lowercases unrecognised tokens. Import then assigns the result to `pawn.incapable`. Provenance, exact case, exact flag identity, the original scalar value, and parse completeness are lost.

Observed save results:

- the target 1.6.4871 save parsed 12 selected humanlike pawns, all with `incapable: []`;
- `Kaunt.rws` also produced no selected pawn incapability values;
- raw `disabledWorkTags` occurrences found in installed saves were quest-part structures, not an ordinary serialised `Pawn.CombinedDisabledWorkTags` field;
- against a copy of the real target save held in memory, synthetic `Violent, Caring` parsed as `['violence', 'caring']`;
- a synthetic mod-like `SomeMod_CustomWork` parsed as `['somemod_customwork']`.

Therefore the present field can preserve C1 behaviour but is not canonical evidence. Vanilla computes most pawn work disability from definitions and live pawn components; it does not normally serialise the combined flags as one pawn field.

Smallest additive C2/save shape:

```ts
type RawPawnPermissionSource = {
  sourceField: "disabledWorkTags" | string;
  presence: "present" | "absent" | "unknown";
  rawValue: string | null;
  workTags: Array<{
    rawTarget: string;
    canonicalTarget: WorkTagId | null;
  }>;
  completeness: "complete" | "partial" | "unknown";
};

type PawnPermissionEvidence = {
  rawSources: RawPawnPermissionSource[];
  legacyIncapable: string[];
};
```

The canonical adapter emits an exact `disableWorkTag` only where `canonicalTarget` is a target-runtime enum identifier. An unknown raw token becomes unresolved evidence. `legacyIncapable` remains available to `App.isIncapable` and the exact C1 projection.

## 4. Current status facts

| Fact | Runtime/save source | Current parser support | Truth semantics | Absence semantics |
| --- | --- | --- | --- | --- |
| `downed` | `healthTracker/healthState`; `PawnHealthState.Down`. `Scribe_Values` default is `Mobile`. | Parses `Down` to true and everything else to false. C2 applies `!!pawn.downed`. | In a complete live pawn health tracker, `Down` is known true, explicit `Mobile` or omitted default is known false. | Missing `healthState` inside a proven-complete tracker means default `Mobile`, hence false. Missing or truncated tracker/pawn scope is unknown. Current code cannot distinguish those cases. |
| `unconscious` | Runtime UI and ability checks define this as `!PawnCapacitiesHandler.CanBeAwake`. | None. | Known only when the exact `CanBeAwake` inputs are known. | No direct save field. Absence means unknown, not false. |
| current mental state | `mindState/mentalStateHandler/curState`; runtime `InMentalState` is `curState != null`. | None. | Non-null `curState` is known true. Explicit `IsNull="True"` is known false. | Missing handler or missing state marker in an incomplete pawn is unknown. |
| `mentalBreak` | A mood mental break enters a mental state with `MentalState.causedByMood = true`; this boolean is saved with default false. | None. | Non-null `curState` plus `causedByMood=true` proves a current mood mental break. Null `curState` proves false. A non-mood mental state is not a mood mental break. | Missing mental-state data is unknown. C4 should preserve a separate `inMentalState` fact if global work availability cares about all active mental states. |
| `deactivated` | `Pawn.IsDeactivated()` reads `CompMechanoid.Deactivated`. That property includes the comp's saved `deactivated` flag and the global mechanoid-faction deactivation state. | None. | Known true if either verified runtime branch is true. Known false only with complete comp, faction, and pawn-faction facts. | Missing local `<deactivated>` on a verified `CompMechanoid` defaults false, but missing comp/race/faction metadata is unknown. |
| `cannotBeAwake` | Exact inverse of `CanBeAwake`: `(race.alwaysAwake || Consciousness >= 0.3) && !IsDeactivated()`. | C3 accepts `currentStatus.canBeAwake`, but C2 never supplies it. | Tri-state derived fact. It can be known after exact race `alwaysAwake`, current Consciousness, and deactivation inputs are ordered correctly. | No direct field. Missing any outcome-relevant input means unknown. |

The target save contains 372 `mentalStateHandler` nodes, all with explicit null current states, two downed pawns elsewhere in the save, nine dead pawns, and no `<deactivated>True</deactivated>` occurrence. The 12 selected parsed humanlike pawns are all currently parsed as `downed: false` and have no other status keys.

No status may be inferred from another merely because the states often coincide. In particular:

- downed does not imply unconscious in runtime code;
- unconscious does not imply downed;
- an active mental state does not imply `causedByMood`;
- deactivated is one input to `CanBeAwake`, not a synonym for downed.

The C3 ordering issue is explicit: C3 can calculate current Consciousness without using an awake gate, then the exact runtime `CanBeAwake` predicate can be evaluated, then capacities whose definitions use `zeroIfCannotBeAwake` can be finalised. Treating missing `canBeAwake` as false would be an architecture defect.

Required status representation remains the design's tri-state fact:

```ts
type CurrentStatusFact = {
  statusId: string;
  state: "known" | "unknown";
  value: boolean | string | null;
  evidence: EvidenceReference[];
};
```

## 5. WorkType and WorkGiver execution paths

The target runtime derives execution paths as follows:

1. `WorkTypeDef.ResolveReferences()` selects every active `WorkGiverDef` whose `workType` reference equals that WorkType.
2. It sorts those WorkGivers by descending `priorityInType` into `workGiversByPriority`.
3. `PawnColumnWorker_WorkPriority.IsIncapableOfWholeWorkType()` tests each WorkGiver independently.
4. All `requiredCapacities` within one WorkGiver must satisfy `PawnCapacitiesHandler.CapableOf()`.
5. `CapableOf()` is strict `capacityLevel > PawnCapacityDef.minForCapable`.
6. If any WorkGiver path succeeds, the WorkType is capacity-capable.

This confirms OR between paths and AND within a path.

Canonical path extraction needs these effective fields after definition inheritance and active-source selection:

```ts
type ScannedWorkType = {
  defName: string;
  workTags: WorkTagId[];
  workTagsCompleteness: RequirementCompleteness;
  pathCatalogueCompleteness: RequirementCompleteness;
};

type ScannedWorkGiverPath = {
  defName: string;
  workTypeDefName: string;
  priorityInType: number | null;
  requiredCapacities: string[];
  requiredCapacitiesCompleteness: RequirementCompleteness;
  giverClass: string | null;
  provenance: RequirementProvenance;
};
```

Stable C4 path identity is `workGiver:<defName>`. Each path becomes `allOf` capacity requirements using the referenced `PawnCapacityDef.minForCapable` value and strict `gt` comparison.

Official active-DLC XML produced this path summary for the 23 direct built-in RimJobs WorkTypes:

| WorkType | Paths | Distinct capacity sets | Verified zero-capacity paths |
| --- | ---: | --- | --- |
| `Firefighter` | 1 | `[]` | `FightFires` |
| `Patient` | 2 | `[]` | both paths |
| `Doctor` | 15 | `[]`, `Manipulation` | `VisitSickPawn` |
| `PatientBedRest` | 1 | `[]` | `PatientGoToBedRecuperate` |
| `BasicWorker` | 6 | `[]`, `Manipulation` | `Flick`, `ChangeTreeMode` |
| `Warden` | 18 | `Manipulation`, `Talking` | none |
| `Handling` | 10 | `Manipulation`, `Talking+Manipulation` | none |
| `Cooking` | 4 | `Manipulation` | none |
| `Hunting` | 1 | `Manipulation` | none |
| `Construction` | 15 | `Manipulation` | none |
| `Growing` | 4 | `Manipulation` | none |
| `Mining` | 2 | `Manipulation` | none |
| `PlantCutting` | 3 | `Manipulation` | none |
| `Smithing` | 7 | `Manipulation` | none |
| `Tailoring` | 1 | `Manipulation` | none |
| `Art` | 5 | `Manipulation` | none |
| `Crafting` | 6 | `Manipulation` | none |
| `Hauling` | 32 | `[]`, `Manipulation` | `TakeEntityToHoldingPlatform` from Anomaly |
| `Cleaning` | 3 | `Manipulation` | none |
| `Research` | 6 | `[]`, `Manipulation` | `StudyArchotechStructures` |
| `Childcare` | 6 | `Manipulation`, `Talking` | none |
| `DarkStudy` | 1 | `[]` | `StudyInteract` |
| `Fishing` | 1 | `Manipulation` | none |

The distinctions required by C4 are exact:

- a complete WorkGiver path with `allOf: []` is a verified satisfied path;
- a complete catalogue with `paths: []` has no executable path and follows the runtime result, which is incapable;
- an incomplete or unknown catalogue with `paths: []` is unknown, not satisfied and not blocked;
- a partial path is unknown when the missing capacity metadata could change that path;
- failure of one path is explanatory only when another path succeeds.

The runtime whole-column incapability method reads standard `requiredCapacities` even for a custom `giverClass`. A custom class does not by itself make that capacity path unsupported. C# that mutates definitions, adds a WorkGiver at runtime, or imposes additional task-specific current restrictions is not visible to the offline XML scanner. The affected catalogue or `currentOnly` dimension must be partial or unknown.

## 6. Requirement completeness and PatchOperations

Current scanner support in `main.js` is C3-specific:

- extracts `BodyDef`, `BodyPartDef`, `PawnCapacityDef`, race `ThingDef`, and `HediffDef` fragments;
- records per-definition source provenance;
- detects selected XPath patterns inside `PatchOperation` XML;
- marks an exact definition or an entire C3 dataset `relevantPatchNotApplied`;
- does not execute PatchOperations;
- does not extract `WorkTypeDef` or `WorkGiverDef`;
- race extraction currently preserves the body mapping, not `lifeStageWorkSettings`;
- scans installed Workshop content broadly, including definitions that are not necessarily in the target save's effective version/load branch.

The installed Workshop contains 89 XML files that both contain a `PatchOperation` and mention `WorkTypeDef`, `WorkGiverDef`, or `lifeStageWorkSettings`. Representative active-install examples include Harmony worktype patches, Nurse Job patches, Dubs Bad Hygiene patches, Vanilla Expanded production patches, Medieval Overhaul WorkGiver additions, Hospitality patches, and race life-stage patches. The current C3 patch classifier ignores those dimensions.

Smallest C4 scanner extension, without a PatchOperation engine:

1. Extract raw `WorkTypeDef` and `WorkGiverDef` fragments with the existing provenance tuple.
2. Extend race parsing to preserve `lifeStageWorkSettings` entries and whether the effective list is complete.
3. Add patch-target classifiers for:
   - `WorkTypeDef.workTags`;
   - `WorkGiverDef.workType`;
   - `WorkGiverDef.requiredCapacities`;
   - WorkGiver addition, removal, or catalogue membership;
   - `ThingDef.race.lifeStageWorkSettings` and a specific WorkType child where the XPath proves it.
4. Store uncertainty at the narrowest proven dimension or path. An unqualified XPath marks only the affected dataset/dimension, not every property of every job.
5. Use the imported save's ordered `meta.modIds` to exclude definitely inactive packages from a C4 definition snapshot. Where `LoadFolders.xml`, version selection, source order, conditional operations, XML Extensions, or a C# mutation prevents an exact effective result, retain `partial` rather than choosing a winner.
6. Bump the scanner cache version when these fragment fields are added.

Proposed uncertainty shape:

```ts
type C4DefinitionUncertainty = {
  workType: Record<string, {
    workTags: string[];
    pathCatalogue: string[];
  }>;
  workGiver: Record<string, {
    workType: string[];
    requiredCapacities: string[];
    catalogueMembership: string[];
  }>;
  raceWork: Record<string, {
    dataset: string[];
    entries: Record<string, string[]>;
  }>;
};
```

This is sufficient for per-dimension and per-path completeness. It deliberately does not evaluate PatchOperations.

## 7. Race work and minimum-age metadata

The target runtime type is `Verse.LifeStageWorkSettings`:

```cs
public WorkTypeDef workType;
public int minAge;

public bool IsDisabled(Pawn pawn)
{
    return pawn.ageTracker.AgeBiologicalYears < minAge;
}
```

Its custom XML loader treats each child element name as the `WorkTypeDef` cross-reference and the child text as `minAge`.

Installed Human race data contains:

```text
Firefighter 7, Patient 0, Doctor 10, PatientBedRest 0,
Childcare 0, BasicWorker 3, Warden 10, Handling 7,
Cooking 7, Hunting 7, Construction 10, Growing 7,
Mining 7, PlantCutting 7, Smithing 13, Tailoring 7,
Art 10, Crafting 7, Hauling 3, Cleaning 3,
Research 13, DarkStudy 13
```

There is no installed official Human `Fishing` entry. Therefore, for a complete unpatched Human race policy, Fishing is `knownNoGate`, not age 7.

Required registry states:

- `knownGate`: the effective race definition has a complete exact WorkType entry and integer `minAge`. This includes `minAge: 0`, which is a known rule that cannot block a non-negative biological age.
- `knownNoGate`: the effective race `lifeStageWorkSettings` catalogue is complete and the exact WorkType has no entry.
- `unknown`: race identity is missing, the catalogue or relevant entry is partial, the value is unparseable, an unapplied patch could affect it, or the effective source cannot be selected.

The runtime predicate uses integer `AgeBiologicalYears`, not chronological age and not a race-name branch. `raceDefName` is an opaque registry key only.

The current `JOB_MIN_AGE` table matches the installed Human entries for the direct WorkTypes it lists, except Fishing. It then assigns closest-analogue values to app-only jobs. It also applies one global table to every race and treats missing age as not blocked. Both behaviours remain C1 compatibility only.

## 8. App and modded job abstractions

The 23 direct built-in columns and verified WorkType mappings are:

| RimJobs ID | WorkTypeDef |
| --- | --- |
| `firefight` | `Firefighter` |
| `patient` | `Patient` |
| `doctoring` | `Doctor` |
| `bed_rest` | `PatientBedRest` |
| `childcare` | `Childcare` |
| `basic_work` | `BasicWorker` |
| `warden` | `Warden` |
| `handling` | `Handling` |
| `cooking` | `Cooking` |
| `hunting` | `Hunting` |
| `construction` | `Construction` |
| `growing` | `Growing` |
| `mining` | `Mining` |
| `plant_cut` | `PlantCutting` |
| `smithing` | `Smithing` |
| `tailoring` | `Tailoring` |
| `art_work` | `Art` |
| `crafting` | `Crafting` |
| `fishing` | `Fishing` |
| `hauling` | `Hauling` |
| `cleaning` | `Cleaning` |
| `dark_study` | `DarkStudy` |
| `research` | `Research` |

The ten built-in RimJobs columns that are not direct verified WorkTypes are:

| RimJobs ID | Display | Current classification | Reason |
| --- | --- | --- | --- |
| `tending` | Nurse | unresolved/unknown | No canonical binding to a scanned WorkType or explicit C4 `appPolicy`; current Doctor-like restrictions are analogue policy. |
| `wait` | Wait | unresolved/unknown | App abstraction, not a verified WorkType policy. |
| `sell` | Sell | unresolved/unknown | Trading abstraction; current Social and age rules are app assumptions. |
| `entertain` | Entertain | unresolved/unknown | Social abstraction with no verified WorkType binding. |
| `dissect` | Dissect | unresolved/unknown | Mod/app abstraction; current Doctor-like rules are not bound to an effective definition. |
| `gene_craft` | Genetics | unresolved/unknown | App abstraction; no explicit canonical policy. |
| `guard` | Guard | unresolved/unknown | App abstraction; current Violent and age rules are not runtime definition truth. |
| `therapist` | Therapist | unresolved/unknown | App abstraction; no explicit canonical policy. |
| `gen_power` | Gen Power | unresolved/unknown | App abstraction; current Construction-like age/speed assumptions are not canonical requirements. |
| `cycle` | Cycle | unresolved/unknown | App abstraction; no explicit canonical policy. |

No current built-in abstraction has an explicit `appPolicy` object with canonical requirement provenance. Installed mods may happen to define similarly named WorkTypes, but RimJobs does not bind these ten columns to an exact scanned defName, package ID, or active load-order result. They must remain canonical unknown until that binding or an explicit product-owned `appPolicy` is frozen. The current closest-analogue behaviour remains available only through C1 compatibility.

User-created custom jobs likewise have no canonical requirements and remain unknown.

## 9. Critical-job policy

The temporal critical-job policy is:

```js
const TEMPORAL_CRITICAL = new Set(['doctoring', 'firefight']);
```

It is declared at `files/engine.js:6` and consumed by `analyzeTemporalResilience()` to select jobs for hourly coverage reporting. `docs/architecture/INVARIANTS.md` describes the same Doctor and Firefight policy.

Other legacy consumers use different emergency or important-job sets:

- bottleneck conflict logic uses `firefight`, `patient`, and `doctoring`;
- auto-assignment gives emergency handling to `firefight`, `patient`, and `bed_rest`;
- `JOBS[].important` drives viability and summary reporting.

These are consumer policies, not C4 Permission or Availability constraints. C4 must not put any critical-job rule inside either resolver. Their reconciliation belongs to C7/C8 consumer policy.

## 10. C4 evaluation and cache boundary

No canonical pawn revision or definition revision mechanism exists in the current C1-C3 code.

- pawns are mutable objects and many editor actions mutate them in place;
- C3 scanned definition catalogues are replaced as state properties after a scan;
- `_hediffDisableMap()` has a narrow cache keyed by the hediff-catalogue object reference;
- render hashes and UI caches are presentation mechanisms, not canonical revisions;
- `CapacityResolver.resolvePawnCapacities()` is pure for supplied evidence and definitions but is not globally memoised;
- repository searches found no `pawnRevision`, `definitionRevision`, version stamp, or equivalent invalidation owner.

Therefore a long-lived cross-render C4 cache would require manual invalidation or would become a second mutable source of truth. It is not safe in C4.

The smallest safe boundary is an immutable, request-scoped per-pawn evaluation context created once for an explicit evaluation batch:

```ts
type C4EvaluationContext = Readonly<{
  pawnId: string;
  evidence: Readonly<ReturnType<typeof CapabilityEvidence.collectPawnEvidence>>;
  capacities: Readonly<ReturnType<typeof CapacityResolver.resolvePawnCapacities>>;
  statusFacts: Readonly<Record<string, CurrentStatusFact>>;
  definitionSnapshot: Readonly<C4DefinitionSnapshot>;
}>;
```

`C4DefinitionSnapshot` is one immutable resolved registry/race-policy snapshot for the batch. The pawn context calls C2 collection once and C3 resolution once, then all job resolver calls share those immutable results. The context is discarded at the end of the batch. This avoids recomputing C2 and C3 for every grid cell without any invalidation mechanism.

If a later phase requires a cache across batches, the state owner must first provide monotonic pawn and definition snapshot revisions. That is not present or authorised in this audit.

## Canonical versus legacy mismatch table

### Named legacy mechanisms

| Mechanism | Canonical runtime truth | Current legacy behaviour | Expected C4 shadow-report difference | C1 compatibility |
| --- | --- | --- | --- | --- |
| Firefight and violence | `Firefighter.workTags = Firefighting, Commoner, AllWork`. It does not contain `Violent`. | `firefight.incapBlocks = ['violence', 'firefight']`. | A pawn disabled only for `Violent` is not canonically blocked from Firefighter. Exact `Firefighting`, `Commoner`, or `AllWork` can block it. | Retain the old combined result in C4 production and name the delta in shadow tests. |
| `MANIPULATION_GATED_JOBS` | Evaluate active WorkGiver paths with OR between paths and strict capacity requirements inside each path. | One global 14-job list plus `_manipulationLost()` body heuristic. | Most listed official WorkTypes agree for the installed DLC set. Anomaly adds the empty `TakeEntityToHoldingPlatform` Hauling path, so Hauling is not canonically blocked solely by zero Manipulation. C3 current/structural unknowns also differ from the old boolean heuristic. | Retain the old list and heuristic for exact C1 projection. |
| `JOB_MIN_AGE` | Per-race effective `lifeStageWorkSettings`; missing entry in a complete list is no gate. | One global app-ID table. Unknown age is treated as allowed. App jobs use closest analogues. Fishing is set to 7. | Human Fishing becomes known no gate. Non-Human races use their own policy. Missing age or partial race metadata becomes unknown. App-only jobs remain unknown without `appPolicy`. | Retain the old table for exact C1 projection. |
| `incapBlocks` | Exact WorkType and WorkTag namespaces matched through the requirement registry. | Lower-case mixed app tokens matched by membership. | Exact tags add missing `Commoner`, `Constructing`, `Shooting`, and `AllWork` semantics and remove false analogues such as Fishing/PlantWork and Firefight/Violent. Ambiguous tokens remain unresolved. | Retain all old entries for exact C1 projection. |

### Every current `incapBlocks` entry

| RimJobs job | Verified canonical WorkType tags or policy | Current `incapBlocks` | Expected canonical shadow difference | Retain C1 result |
| --- | --- | --- | --- | --- |
| `firefight` | `Firefighting, Commoner, AllWork` | `violence, firefight` | Removes false Violent match; adds exact missing tags. | yes |
| `patient` | no WorkTags | none | No WorkTag delta. | yes |
| `doctoring` | `Caring, Commoner, AllWork` | `doctoring, caring` | `doctoring` is not a WorkTag; exact Commoner/AllWork are missing. | yes |
| `bed_rest` | no WorkTags | none | No WorkTag delta. | yes |
| `tending` | unresolved app/mod policy | `doctoring, caring` | Canonical unknown until explicit policy. | yes |
| `childcare` | `Social, Caring, AllWork` | none | Current logic misses all three exact tags. | yes |
| `basic_work` | `Commoner, AllWork` | none | Current logic misses both exact tags. | yes |
| `warden` | `Social, AllWork` | `social` | Semantic Social analogue plus missing AllWork. | yes |
| `wait` | unresolved app policy | none | Canonical unknown. | yes |
| `sell` | unresolved app policy | `social` | Canonical unknown; Social is app policy only. | yes |
| `handling` | `Animals, Commoner, AllWork` | `animals` | Semantic Animals analogue plus missing tags. | yes |
| `entertain` | unresolved app policy | `social` | Canonical unknown. | yes |
| `cooking` | `Cooking, ManualSkilled, Commoner, AllWork` | `cooking` | Ambiguous app/job token and three missing exact tags. | yes |
| `hunting` | `Violent, Hunting, Commoner, Shooting, AllWork` | `violence, hunting` | Semantic analogues plus missing Shooting/Commoner/AllWork. | yes |
| `construction` | `ManualSkilled, Commoner, Constructing, AllWork` | `skilled_labor` | Legacy conflates ManualSkilled and Constructing; exact tags remain distinct. | yes |
| `growing` | `ManualSkilled, PlantWork, Commoner, AllWork` | `plantwork` | Missing ManualSkilled/Commoner/AllWork. | yes |
| `mining` | `ManualSkilled, Mining, Commoner, AllWork` | `mining` | Ambiguous token and missing exact tags. | yes |
| `plant_cut` | `ManualSkilled, PlantWork, Commoner, AllWork` | `plantwork` | Missing ManualSkilled/Commoner/AllWork. | yes |
| `dissect` | unresolved app/mod policy | `doctoring, caring` | Canonical unknown. | yes |
| `smithing` | `Crafting, ManualSkilled, Commoner, AllWork` | `crafting, skilled_labor` | Semantic analogues but mixed namespace and missing exact tags. | yes |
| `tailoring` | `Crafting, ManualSkilled, Commoner, AllWork` | `crafting, skilled_labor` | Same as Smithing. | yes |
| `art_work` | `Artistic, Commoner, AllWork` | `artistic` | Missing Commoner/AllWork. | yes |
| `crafting` | `Crafting, ManualSkilled, Commoner, AllWork` | `crafting, skilled_labor` | Same mixed-namespace issue; `crafting` is ambiguous. | yes |
| `fishing` | `Animals, Commoner, AllWork` | `plantwork` | PlantWork is false; all exact tags differ. | yes |
| `hauling` | `ManualDumb, Hauling, Commoner, AllWork` | `hauling, dumb_labor` | Semantic analogues plus missing exact tags; Anomaly also changes capacity-path truth. | yes |
| `cleaning` | `ManualDumb, Cleaning, Commoner, AllWork` | `cleaning, dumb_labor` | Semantic analogues plus missing exact tags. | yes |
| `dark_study` | `Intellectual, Commoner, AllWork` | none | Current logic misses all exact tags. | yes |
| `gene_craft` | unresolved app policy | none | Canonical unknown. | yes |
| `research` | `Intellectual, Commoner, AllWork` | `research` | `research` is a job ID/legacy alias, not WorkTag `Intellectual`; other tags missing. | yes |
| `guard` | unresolved app policy | `violence` | Canonical unknown. | yes |
| `therapist` | unresolved app policy | none | Canonical unknown. | yes |
| `gen_power` | unresolved app policy | none | Canonical unknown. | yes |
| `cycle` | unresolved app policy | none | Canonical unknown. | yes |

## C2 additive changes required

The audit freezes these additive requirements, without implementing them:

1. Preserve exact typed `disabledWorkTypes` and `disabledWorkTags` fields before any legacy mapping.
2. Correctly parse scalar flags fields, including `GeneDef.disabledWorkTags`.
3. Preserve `AllWork` as an exact canonical flag.
4. Preserve source namespace, raw value, exact target, provenance, and completeness.
5. Add a dedicated pawn permission-source record while retaining `pawn.incapable` as `legacyIncapable`.
6. Preserve structured candidates only when source typing or curated metadata supports them.
7. Add tri-state downed, in-mental-state, mental-break, deactivated, unconscious, and can-be-awake facts only to the fidelity the save/runtime evidence proves.
8. Do not coerce missing statuses, missing age, missing severity, or missing permission metadata to false or zero.
9. Keep all current C1/C2/C3 outputs and tests available for exact legacy projection.

## Scanner and registry additions required

The audit freezes these data additions, without implementing them:

- exact WorkTag enum registry for target 1.6.4871;
- `WorkTypeDef` extraction with exact `defName`, `workTags`, inheritance/provenance, and dimension completeness;
- `WorkGiverDef` extraction with exact `defName`, `workType`, `priorityInType`, `requiredCapacities`, `giverClass`, provenance, and per-path completeness;
- active WorkGiver catalogue membership and catalogue completeness;
- race `lifeStageWorkSettings` extraction with per-WorkType completeness;
- target save package-order filtering before declaring a definition snapshot complete;
- PatchOperation target signals for WorkType, WorkGiver, and race-work dimensions;
- exact mapping from each of the 23 direct RimJobs job IDs to its WorkTypeDef;
- explicit `appPolicy` provenance for any of the ten app/mod abstractions later promoted from unknown;
- complete empty catalogue, incomplete empty catalogue, and verified zero-capacity path as three distinct states.

## Unresolved offline limitations

- The current scanner does not apply PatchOperations.
- The target save's 1,428-package effective definition set cannot be reconstructed exactly from the current broad scan because version/load-folder selection, conditional patches, XML Extensions, and C# mutations are not applied.
- C# can add or mutate WorkTypes, WorkGivers, capacities, race policies, and current-only restrictions after XML load.
- Current C2 does not cover all runtime disability sources in `CombinedDisabledWorkTags` and `GetDisabledWorkTypes()`.
- Ordinary saves do not provide one authoritative serialised `CombinedDisabledWorkTags` value for each pawn.
- Current save parsing filters selected pawns to humanlike colonists and does not preserve all mech/faction component state needed for exact deactivation.
- `CanBeAwake` has no direct save field and requires correctly ordered race, C3 Consciousness, and deactivation evidence.
- No canonical revision model exists for long-lived caching.
- The ten app/mod job abstractions have no explicit canonical policy.

Each limitation is representable as partial or unknown. None authorises a race-name branch, a closest-analogue rule, a false default, or use of `incapBlocks` in canonical resolution.

## Blockers

There is no blocker to reviewing and freezing this audit. The following block complete canonical answers and must remain explicit unknowns until their inputs are added:

- exact effective modded WorkType/WorkGiver/race metadata when relevant patches or runtime code are not applied;
- exact app-only job policy for the ten abstractions;
- exact current status where parser evidence is absent;
- safe memoisation beyond one immutable evaluation batch.

These do not block a later C4 implementation if the resolver honours per-dimension unknowns. They do block any claim that the current offline data is complete.

The missing authoritative-spec path is a repository documentation discrepancy, not a semantic blocker, because the reviewed document was available at the root `docs` path.

The unavailable `pre_output.record` module is an agent-environment limitation only. It must not become a RimJobs project dependency.

## Implementation-plan inputs now frozen

The following facts are ready for design-owner acceptance or correction before any implementation plan is written:

- target WorkTags are the exact 1.6.4871 enum identifiers listed in question 1;
- `disableJob` and `disableWorkTag` remain distinct typed namespaces;
- current incapability adapters are lossy and require additive exact-source fields;
- `pawn.incapable` remains a legacy projection and gains a separate raw typed source record;
- current status is tri-state and uses only facts proven by save/runtime evidence;
- unconscious means exact runtime `!CanBeAwake`, not a convenient downed or capacity approximation;
- execution is any complete WorkGiver path, with all capacities required inside a path;
- strict capacity capability is `level > minForCapable`;
- complete `allOf: []`, complete `paths: []`, and incomplete `paths: []` have different meanings;
- scanner completeness is per WorkTag dimension, per age entry, per WorkGiver path, and per catalogue membership;
- race age policy uses opaque race identity plus effective `lifeStageWorkSettings` only;
- Human Fishing has no official 1.6.4871 age gate;
- 23 built-in jobs have verified direct WorkType mappings;
- ten built-in app/mod abstractions remain unknown because no explicit `appPolicy` exists;
- temporal critical policy is Doctor and Firefight only and remains outside C4 resolvers;
- C4 production consumers remain on exact C1 behaviour;
- Firefight/Violent, Hauling/Manipulation, Fishing age, and every `incapBlocks` difference are shadow facts only in C4;
- the safe C4 reuse boundary is one immutable request-scoped evaluation context, not a long-lived cache;
- no resolver code or implementation plan is authorised until these audit facts are accepted or corrected.

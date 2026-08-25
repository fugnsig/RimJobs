# C4: Permission + Availability - Revised Design Recommendation

**Phase:** C4  
**Target runtime audited:** RimWorld 1.6.4871  
**Depends on:** C2 Canonical Evidence, C3 Body + Capacity Resolution  
**Phase rule:** C4 builds and parity-proves the resolvers. Consumer migration remains C7.

---

## Architectural principle

C4 introduces two peer canonical outputs:

- `PermissionReport` - long-term structural permission.
- `AvailabilityReport` - current-state/current-capacity availability, evaluated independently of structural permission.

Permission asks:

> Given the pawn's persistent/structural state, is this job structurally permitted?

Availability asks:

> Is there a current-state or current-capacity blocker for this job, independent of structural permission?

This distinction is important. A structurally blocked pawn may still have `availability.state === "available"` when there is no additional current-state blocker. Consumers that need "can do this now" explicitly compose the two reports.

C4 does not:

- alter C3 capacity semantics;
- calculate effectiveness;
- migrate planning/UI consumers;
- change ranking/scoring;
- collapse Permission and Availability into one canonical boolean;
- introduce race/body/part identity branching;
- convert unknown evidence into false certainty.

---

## Frozen C4 invariants

### PERM-001 - Peer outputs

Permission and Availability are separate facts. Neither mutates or contains the other.

### PERM-002 - Structural only

Temporary state such as downed, unconsciousness, mental break, or another current-only blocker never makes canonical Permission `blocked`.

### AVAIL-001 - Independent current-state meaning

Availability represents current-state/current-capacity blockers independently of structural Permission.

### PERM-003 - Hard constraints are peers

Canonical structural hard constraints include:

- `disableJob`;
- `disableWorkTag`;
- age/life-stage gates;
- job capacity requirements;
- later verified structural constraints.

Positive effectiveness never overrides a hard blocker.

### PERM-004 - Final Permission state

- any confirmed decisive hard blocker -> `blocked`;
- otherwise any relevant unresolved hard constraint -> `unknown`;
- otherwise -> `allowed`.

A blocker and unresolved constraint may coexist. The report remains `blocked` and preserves both.

### AVAIL-002 - Final Availability state

- any confirmed current blocker -> `unavailable`;
- otherwise any relevant unresolved current constraint -> `unknown`;
- otherwise -> `available`.

### PERM-005 - Relevant unknown propagation

Unrelated unknown evidence does not poison a job report.

### PERM-006 - No universal capacity threshold

Capacity sufficiency is requirement-specific. Audited RimWorld WorkGiver requirements use their verified comparison semantics.

### PERM-007 - `notApplicable` is explicit

`notApplicable` is never coerced to zero. Each requirement defines how it is interpreted. Unsupported/custom requirements default to `unknown`.

### PERM-008 - Race agnostic by construction

The resolver may use opaque definition identity, such as `raceDefName`, to look up scanned definition data. It never branches semantically on names such as `Human` or a mod race.

### PERM-009 - Canonical target namespaces

`disableJob` and `disableWorkTag` have distinct canonical target namespaces before C4 matching occurs.

C4 never recovers semantics by parsing an opaque evidence ID or consulting legacy `incapBlocks`.

### PERM-010 - Alternative execution paths preserved

Capacity requirements preserve the audited OR-of-WorkGiver-paths / AND-within-one-path structure. They are never flattened into one all-capacities list.

### PERM-011 - Completeness is dimension-specific

Unknown registry data propagates only through the requirement dimension/path that depends on it. One coarse job-level completeness flag must not poison otherwise verified constraints.

### C4-INPUT-001 - Canonical inputs only

Canonical C4 consumes:

- `CapabilityEvidence.collectPawnEvidence()`;
- C3 `CapacityResolver` output;
- scanned/normalised requirement registries.

It does not read raw save structures or use legacy planning helpers as canonical truth.

### C4-LEGACY-001 - Legacy isolation

`incapBlocks`, `JOB_MIN_AGE`, `MANIPULATION_GATED_JOBS`, and app analogue mappings may exist only inside an explicitly named compatibility projection/policy.

Canonical Permission and Availability never use them.

### C4-PARITY-001 - No planning behaviour change

C4 may produce more precise internal canonical facts, but C1-C6 do not intentionally change planning/UI decisions. Exact old combined behaviour remains available through compatibility projection. Consumer migration and visible semantic distinctions remain C7.

---

## Audit findings retained

The repository/runtime audit established:

- RimWorld considers a WorkType capacity-capable if any WorkGiver path works; each path requires all capacities on that path.
- `PawnCapacitiesHandler.CapableOf()` uses strict `value > PawnCapacityDef.minForCapable`.
- Flattening capacities across WorkGivers would be incorrect.
- `LifeStageWorkSettings` is definition data; the audited vanilla predicate uses biological age against `minAge`.
- The built-in app jobs include direct vanilla/DLC WorkTypes plus app/modded abstractions.
- Existing user-created custom jobs do not yet contain canonical permission/capacity requirements.
- `incapBlocks` conflates app job identifiers and work restrictions and contains legacy mismatches.
- `MANIPULATION_GATED_JOBS` models current compatibility behaviour, not canonical job-capacity metadata.
- C2 currently exposes insufficient current-state facts for complete Availability.
- C2 currently omits `pawn.incapable`; this must be normalised through C2 before canonical C4 matching.
- Legacy `Engine.evaluateJobPermission()` includes downed/current state and is therefore not semantically equivalent to canonical Permission.

---

# 1. Canonical permission target namespace

Before implementing the resolver, audit every C2 source that emits or preserves an incapability token.

```ts
type JobTargetId = string;
type WorkTagId = string;
```

Canonical effects:

```ts
{
  type: "disableJob";
  target: JobTargetId;
}

{
  type: "disableWorkTag";
  target: WorkTagId;
}
```

If a raw source token cannot be safely classified:

```ts
type UnresolvedPermissionTarget = {
  sourceKind: string;
  sourceId: string | null;
  rawTarget: string;
  candidateTargets?: Array<
    | { kind: "job"; target: JobTargetId }
    | { kind: "workTag"; target: WorkTagId }
  >;
  reason: string;
};
```

C4 may contextually resolve ambiguity only when C2 supplied structured candidates and every plausible candidate produces the same result for this job.

C4 must not parse raw strings or evidence IDs to invent candidate meanings.

This may require additive C2 normalisation before C4. C1 behaviour remains unchanged.

---

# 2. Report schemas

```ts
type PermissionState = "allowed" | "blocked" | "unknown";
type AvailabilityState = "available" | "unavailable" | "unknown";
type EvaluationResult = "satisfied" | "failed" | "unknown";

type ConstraintEvaluation = {
  evaluationId: string;
  requirementId: string;

  scope:
    | "permission"
    | "availability.global"
    | "availability.job";

  kind:
    | "disableJob"
    | "disableWorkTag"
    | "age"
    | "lifeStage"
    | "capacity"
    | "currentState"
    | "currentOnly"
    | "registryCompleteness"
    | "executionPath";

  result: EvaluationResult;

  aggregation: {
    level: "leaf" | "path" | "constraint";
    effect: "none" | "block" | "unknown";
    masked: boolean;
  };

  snapshot: "structural" | "current" | null;

  expected: {
    target?: string;
    operator?: "gt" | "gte" | "lt" | "lte" | "eq" | "between";
    threshold?: number | [number, number];
    notApplicable?: "satisfied" | "blocked" | "unknown";
  } | null;

  observed: {
    state?: "resolved" | "notApplicable" | "unknown";
    value?: number | boolean | string | null;
  } | null;

  explanation: {
    code: string;
    params: Record<string, string | number | boolean | null>;
  };

  evidence: EvidenceReference[];
  requirementProvenance: RequirementProvenance;
};

type PermissionReport = {
  schemaVersion: 1;
  pawnId: string | null;
  jobId: string | null;
  state: PermissionState;

  blockers: ConstraintEvaluation[];
  unknowns: ConstraintEvaluation[];
  evaluations: ConstraintEvaluation[];
  diagnostics: Diagnostic[];
};

type AvailabilityComponentReport = {
  state: AvailabilityState;
  blockers: ConstraintEvaluation[];
  unknowns: ConstraintEvaluation[];
  evaluations: ConstraintEvaluation[];
};

type AvailabilityReport = {
  schemaVersion: 1;
  pawnId: string | null;
  jobId: string | null;
  state: AvailabilityState;

  global: AvailabilityComponentReport;
  jobSpecific: AvailabilityComponentReport;

  blockers: ConstraintEvaluation[];
  unknowns: ConstraintEvaluation[];
  diagnostics: Diagnostic[];
};
```

`blockers` contains confirmed constraints that independently establish block/unavailability at their aggregation level.

`unknowns` contains relevant unresolved constraints even when another peer blocker masks them in the final report state.

A failed capacity leaf inside a WorkGiver path remains explanatory. It is not a job-level blocker when another path succeeds.

---

# 3. Evidence and requirement provenance

```ts
type EvidenceReference =
  | { kind: "c2Evidence"; evidenceId: string }
  | {
      kind: "c2Unresolved";
      sourceKind: string;
      sourceId: string | null;
      reasonCode: string;
    }
  | {
      kind: "bodyObservation";
      sourceObservationIndex: number;
    }
  | {
      kind: "capacityFact";
      capacityDefName: string;
      snapshot: "structural" | "current";
    }
  | {
      kind: "statusFact";
      statusId: string;
    }
  | {
      kind: "requirementDefinition";
      requirementId: string;
    };

type RequirementProvenance = {
  source:
    | "workTypeDef"
    | "workGiverDef"
    | "pawnCapacityDef"
    | "raceWorkSettings"
    | "appPolicy"
    | "customJobPolicy"
    | "legacyCompatibility";

  sourceId: string | null;
  modId: string | null;
  version: string | null;
  completeness: "complete" | "partial" | "unknown";
};

type Diagnostic = {
  code: string;
  params: Record<string, string | number | boolean | null>;
};
```

Explanations use stable codes plus parameters. User-visible English is rendered later.

---

# 4. Requirement registry

Completeness is stored on the requirement dimension/path that actually depends on missing metadata.

```ts
type RequirementCompleteness = "complete" | "partial" | "unknown";

type JobRequirementPolicy = {
  schemaVersion: 1;
  jobId: string;

  aliases: string[];
  sourceWorkTypes: string[];

  provenance: RequirementProvenance;

  permission: {
    jobIdentity: {
      completeness: RequirementCompleteness;
      disableAliases: string[];
    };

    workTags: {
      completeness: RequirementCompleteness;
      values: WorkTagId[];
    };

    ageGate:
      | {
          state: "known";
          rule:
            | {
                kind: "raceWorkSettings";
                workTypeDefName: string;
              }
            | {
                kind: "predicate";
                predicate: AgeOrLifeStagePredicate;
              };
          provenance: RequirementProvenance;
        }
      | {
          state: "knownNone";
          provenance: RequirementProvenance;
        }
      | {
          state: "unknown";
          provenance: RequirementProvenance;
        };

    execution: {
      completeness: RequirementCompleteness;
      mode: "anyPath";
      paths: WorkPath[];
    };
  };

  availability: {
    globalPolicyId: string;
    currentExecutionRef: "permission.execution";

    currentOnly: {
      completeness: RequirementCompleteness;
      requirements: CurrentOnlyRequirement[];
    };
  };
};

type WorkPath = {
  pathId: string;
  sourceWorkGiverDefs: string[];
  completeness: RequirementCompleteness;
  allOf: CapacityRequirement[];
  provenance: RequirementProvenance;
};

type CapacityRequirement = {
  requirementId: string;
  kind: "capacity";
  capacityDefName: string;

  comparison: {
    operator: "gt" | "gte" | "lt" | "lte" | "eq" | "between";

    thresholdSource:
      | {
          kind: "capacityDefField";
          field: "minForCapable";
          value: number;
        }
      | {
          kind: "literal";
          value: number | [number, number];
        };
  };

  notApplicable: "satisfied" | "blocked" | "unknown";
  provenance: RequirementProvenance;
};
```

A verified WorkGiver that genuinely requires zero capacities is represented as a complete path with `allOf: []`, which is satisfied.

An empty `paths: []` catalogue with incomplete/unknown execution metadata is `unknown`, not a free path.

App-only jobs require explicit `appPolicy` provenance. "Closest vanilla analogue" is not verified game truth.

Custom jobs without canonical requirements remain unknown in canonical C4.

---

# 5. Race work settings

Opaque race definition lookup is allowed. Race-name semantic branching is not.

```ts
type RaceWorkPolicy = {
  raceDefName: string;

  entries: Record<
    string,
    | {
        state: "knownGate";
        minAge: number;
        provenance: RequirementProvenance;
      }
    | {
        state: "knownNoGate";
        provenance: RequirementProvenance;
      }
    | {
        state: "unknown";
        provenance: RequirementProvenance;
      }
  >;

  provenance: RequirementProvenance;
};
```

The resolver performs:

```text
raceDefName -> RaceWorkPolicy -> relevant WorkType entry
```

It never contains `if (raceDefName === "Human")`.

A globally partial race policy does not poison a WorkType whose specific entry is known complete.

---

# 6. Current status facts

New status inputs must preserve "not known" separately from false.

```ts
type CurrentStatusFact = {
  statusId:
    | "downed"
    | "unconscious"
    | "mentalBreak"
    | "deactivated"
    | string;

  state: "known" | "unknown";
  value: boolean | string | null;

  evidence: EvidenceReference[];
};
```

Availability uses only supported status facts.

Examples:

- known `downed === true` -> global unavailable;
- known `downed === false` -> that check satisfied;
- missing mental-state information -> unknown only when the global availability policy requires that fact and cannot establish it another verified way.

C4 must not infer unconsciousness from a convenient capacity threshold unless audited runtime semantics explicitly define that relationship.

---

# 7. Permission resolution

For a pawn/job:

1. Resolve the job policy.
2. Resolve only the relevant race work-policy entry.
3. Evaluate canonical `disableJob`.
4. Evaluate canonical `disableWorkTag`.
5. Evaluate active structural conditional restrictions by joining C2 definition effects to C2 body observations.
6. Evaluate age/life-stage rules.
7. Evaluate structural C3 capacity requirements path-by-path.
8. Evaluate registry completeness only where missing data could change the answer.
9. Continue evaluating peer constraints after finding a blocker so explanations remain complete.
10. Aggregate.

## Conditional restrictions

For a relevant matching conditional effect:

- persistent observation + condition true -> structural restriction applies;
- temporary observation -> ignored by Permission;
- persistence unknown -> Permission uncertainty if the effect could apply structurally;
- severity/applicability unknown -> uncertainty;
- unsupported `when` kind -> uncertainty when relevant;
- resolved false condition -> satisfied.

Unknown severity is never defaulted to zero.

## WorkGiver path aggregation

One complete path:

```text
any failed leaf
    -> path failed

else any unknown leaf
    -> path unknown

else
    -> path satisfied
```

Any-path group:

```text
any satisfied path
    -> satisfied

else any unknown/incomplete path
    -> unknown

else every complete path failed
    -> failed
```

## Final Permission

```text
any confirmed peer blocker
    -> blocked

else any relevant peer uncertainty
    -> unknown

else
    -> allowed
```

A report may legitimately be `blocked` while also retaining unknowns.

## Confidence

Do not blanket-convert `confidence: "inferred"` into uncertainty.

An inferred C2 effect may be used when it is the adapter's current canonical fallback and its target/applicability semantics are resolved.

`confidence: "unknown"` or unresolved semantics propagate uncertainty.

---

# 8. Availability resolution

Availability is independent of structural Permission.

## Global component

Evaluate supported current facts such as:

- downed;
- unconscious;
- active mental break;
- deactivated;
- other verified global no-work states.

## Job-specific component

Evaluate:

- the same execution paths against C3 `current` capacities;
- active temporary/current-only `disableJob`;
- active temporary/current-only `disableWorkTag`;
- declared current-only job constraints.

Persistent damage can therefore produce both:

```text
Permission = blocked
Availability = unavailable
```

A permanent direct work-tag disable can produce:

```text
Permission = blocked
Availability = available
```

when there is no independent current blocker. This is intentional because the reports answer separate questions.

Consumers that need "can do now" combine them explicitly.

Availability aggregation:

```text
any confirmed current blocker
    -> unavailable

else any relevant current uncertainty
    -> unknown

else
    -> available
```

Global failure does not stop job-specific evaluation.

---

# 9. Compatibility and parity

The old combined boolean remains reproducible as:

```js
return permission.state === "blocked"
    || availability.state === "unavailable";
```

Unknown does not project to `true`.

For exact C1 parity, compatibility evaluation uses an explicitly isolated `legacyCompatibility` policy/projection. Only that compatibility layer may use:

- `incapBlocks`;
- `JOB_MIN_AGE`;
- `MANIPULATION_GATED_JOBS`;
- frozen app-job analogues.

Canonical C4 does not use them.

## Important parity clarification

Canonical Permission is intentionally more precise than old `evaluateJobPermission()` because the old function includes current/downed state.

Therefore C4 parity is:

1. **Canonical decomposition tests**
   - structural Permission and current Availability split the old conflated reasons correctly.

2. **Legacy permission projection**
   - if `Engine.evaluateJobPermission()` is reimplemented through C4, a legacy projection recombines the necessary canonical facts to reproduce the exact frozen old output.

3. **Combined incapability**
   - composed/legacy `App.isIncapable` output matches the C1 corpus exactly.

4. **No production decision migration**
   - canonical definition improvements that differ from legacy `incapBlocks` are observed and tested, but they do not change planning decisions during C4.

Known canonical-vs-legacy deltas, such as a verified WorkTag mismatch, receive named shadow-comparison tests. They are not silently adopted as production behaviour before the full parity gate.

---

# 10. Additive C2 work required

C4 must not bypass C2 to obtain missing facts.

Required additive C2 work:

1. Preserve/normalise `pawn.incapable`.
2. Establish the exact canonical WorkTag namespace.
3. Preserve structured candidate meanings for ambiguous raw incapability tokens where the source permits it.
4. Add current status facts that offline save/runtime data can actually prove.
5. Preserve tri-state presence for those status facts.
6. Ensure conditional hediff definition effects can be joined to individual body observations without losing severity/persistence.

All existing C1/C2/C3 regressions remain green.

---

# 11. C4 implementation scope

## Build in C4

- requirement-registry extraction/normalisation needed by Permission;
- race work-policy extraction/normalisation;
- C2 additive permission/status passthrough;
- canonical Permission resolver;
- canonical global Availability resolver;
- canonical job-specific Availability resolver;
- legacy compatibility projections/shims;
- shadow parity tests against the C1 corpus;
- canonical-vs-legacy delta tests;
- resolver-level caching/memoisation only if required for test/runtime feasibility and consistent with the existing revision model.

## Do not migrate in C4

Do **not** migrate:

- work-priority table rendering;
- summary counts;
- `runMinMaxAssignment`;
- `calculateViability`;
- `getBottlenecks`;
- `analyzeColony`;
- scheduler/coverage;
- final `evaluatePawnJob` report assembly.

Those belong to the frozen C7 consumer-migration phase after C5/C6 are stable.

`App.isIncapable` may be internally reimplemented through a compatibility shim only if exact C1 output is proven unchanged.

Existing production UI/planning behaviour remains unchanged in C4.

---

# 12. C7 target UI semantics - documented, not implemented in C4

C4 should make these future distinctions possible, but C7 owns the migration:

| Permission | Availability | Future C7 UI |
|---|---|---|
| blocked | any | `X`, structural explanation |
| allowed | unavailable | priority retained, dimmed/paused |
| unknown | unavailable | amber `?` plus paused state |
| unknown | available | amber `?` |
| allowed | unknown | current-state uncertainty |
| allowed | available | normal |
| blocked | unknown/unavailable | `X` wins visually; current explanation still available |

`X` means structural block only once C7 migrates the UI.

Likewise, structural/current summary counts are C7 concerns.

---

# 13. Deferred behaviour/intelligence

Defer until the planned later phase:

- planning eligibility migration -> C7;
- work-priority UI distinctions -> C7;
- final report/cache assembly -> C7;
- temporal coverage consuming Availability -> C6/C7 as already planned;
- removal of legacy compatibility surfaces -> only after no callers remain;
- genuinely smarter assignment decisions from definition-derived permission differences -> C8;
- new backup/coverage intelligence not required for parity -> C8 unless already frozen elsewhere as an existing-behaviour parity rule.

Custom jobs without canonical requirements:

- canonical Permission may be `unknown`;
- legacy compatibility remains whatever the frozen old behaviour says.

---

# 14. Test matrix

| Group | Required cases |
|---|---|
| Permission aggregation | allowed, blocker, relevant unknown, blocker + unknown, unrelated unknown |
| Canonical targets | exact job disable, exact WorkTag disable, mismatched namespace, structured ambiguity, raw ambiguity not parsed |
| Work restrictions | multiple WorkTags, direct alias, legacy mismatch isolated from canonical |
| Hediff applicability | persistent active, temporary active, unknown persistence, below/above stage, unknown severity, unsupported condition |
| Capacity comparison | strict `> minForCapable`, above/below, literal threshold, supported operators |
| WorkGiver paths | all satisfied, one failed leaf, verified zero-capacity path, unknown alternative, every complete path failed |
| Path completeness | complete, partial relevant, partial irrelevant, missing WorkGiver metadata |
| `notApplicable` | explicit satisfied, audited blocked, default unknown |
| Age | below/at/above minAge, missing age, knownNoGate, unknown race entry, partial registry with relevant entry complete |
| Availability global | downed known true/false, unconscious known/unknown, mental break known/unknown, no guessed false |
| Availability job | current sight/manipulation loss, current capacity unknown, temporary disable |
| Peer semantics | blocked + available, allowed + unavailable, blocked + unavailable, both unknown |
| Compatibility | exact old permission projection, composed isIncapable parity, downed parity, manipulation bridge parity |
| Canonical delta | Firefight/Violent mismatch or other audited legacy mismatch reported without changing production behaviour |
| Race agnosticism | supported modded race through definitions, age registry lookup, unknown race metadata -> unknown, no race-name branch |
| C2 boundary | pawn.incapable normalised, status tri-state, structured ambiguity, no raw save read from C4 |
| Regression | all C1 corpus, all C2 tests, all C3 tests, syntax/load/static architecture gates |
| No migration | no planning/UI consumer calls canonical C4 resolver except explicit compatibility surface |

---

# 15. Implementation risks

1. **C2 permission target namespace**
   - Existing evidence may reflect legacy app incapability identifiers rather than exact WorkTags.
   - Resolve at the C2 boundary before canonical matching.

2. **Current status fidelity**
   - Mental break/unconscious/can-awake facts may not be reliably available offline.
   - Missing facts remain unknown.

3. **WorkGiver definition completeness**
   - PatchOperation/C# changes may alter paths/requirements.
   - Per-path completeness prevents false blockers.

4. **Race work settings completeness**
   - Track completeness per relevant WorkType entry.

5. **App-only jobs**
   - Require explicit `appPolicy` provenance.
   - Closest-vanilla analogues are compatibility/app policy, not verified runtime truth.

6. **Custom jobs**
   - Existing jobs lack canonical requirements.
   - Preserve unknown instead of inventing semantics.

7. **Hediff joins**
   - Definition evidence must join stable body observations without losing persistence/severity.

8. **Canonical vs legacy deltas**
   - C4 should expose/test them but not turn them into planning changes before C8/full parity policy permits it.

9. **Runtime version**
   - Requirement metadata and audits carry the RimWorld 1.6.4871 version marker.

---

# 16. Gate before implementation planning

Before writing the C4 implementation plan, answer from the actual repository/target definitions:

1. What exact canonical WorkTag IDs will `disableWorkTag.target` use?
2. Which C2 adapters currently emit legacy/non-canonical incap IDs?
3. How is `pawn.incapable` represented in parsed saves?
4. Which current status facts can the offline save reliably prove?
5. What exact WorkGiver/WorkType fields produce the audited capacity paths?
6. How will relevant PatchOperation uncertainty affect requirement completeness?
7. What exact source supplies race LifeStageWorkSettings/min-age metadata?
8. Which app abstractions receive explicit `appPolicy`, and which remain unknown?
9. What exact compatibility projection reproduces frozen `evaluateJobPermission()` output, including downed?
10. What shadow-comparison cases document canonical-vs-legacy differences without adopting them as C4 production changes?

Once these are inspected and recorded, write the implementation plan.

Do not migrate consumers in C4.

# RimJobs Code Map

Lookup table mapping features to files, entry points, state and tests.

---

## Work Priorities

**Primary files:**
- `files/engine.js` - capability evaluation (`evaluatePawnJob`, `evaluateJobPermission`), temporal coverage (`calculateTemporalCoverage`, `analyzeTemporalResilience`), temporal proposals (`proposeTemporalAdjustments`), auto-assign (`runMinMaxAssignment`), optimiser (`analyzeColony`), work speed (`calculateRealWorkSpeed`), best-pawn selection (`_bestPawnForJob`)
- `files/app-priorities.js` - UI: priority click/wheel/key handlers, manual/simple mode, Work Planner modal (`openWorkPlanner`), optimiser panel (`_optimizerHTML`)
- `files/app-render.js` - priorities table rendering (`renderTable`, `_renderTableHorizontal`, `_renderTableVertical`), managed columns (`_visibleJobs`, `_ensureJobOrder`, `addJobColumn`)

**State:**
- `App.state.priorities` - `{pawnId: {jobId: 1-N or null}}`
- `App.state.settings.manualPriorities` - manual (1-4) vs simple (checkboxes) mode
- `App.state.settings.jobOrder` - column order array
- `App.state.customJobs` - user-added job columns

**Tests:**
- `test/engine.optimiser.test.js` - optimiser + maths (22 checks)

**Invariants:**
- `skill: null` means skillless. Never substitute another skill. See INVARIANTS.md WORK-001.
- `PriorityScale` (data.js) governs valid priority ranges. Auto-assign outputs P1-P4 only; P5+ are manual-only. See INVARIANTS.md WORK-002.
- Auto-assign scoped to `_visibleJobs()`. Viability/Skills-Web calcs are whole-colony.

---

## Save Editor

**Primary files:**
- `files/app-save.js` - `.rws` parsing (`parseSaveFile`, `parsePawnFields`), import flow, state normaliser (`_normalizeLoadedState`), save writer (`buildEditedSaveText`, `_applySkillEditsToBlock`, `_applyTraitEditsToBlock`, `_applyHediffEditsToBlock`, `_applyRelationEditsToBlock`)

**Save XML quirks:**
- Pawn `<id>`: stored WITHOUT `Thing_` prefix; references ADD it
- `DefMap<Def,V>`: flat unlabelled `<vals>` list, index = mod-dependent DefDatabase load order
- See `docs/architecture/SAVE-FORMAT.md` for full details

**State:**
- `App._saveImportData` - parsed save data before user confirmation
- `App._originalSaveText` - raw XML for surgical writer
- Per-pawn: `_traitOps`, `_hediffOps`, `_relationOps` - pending edit operations

**Tests:**
- `test/save-parser.fuzz.test.js` - parser fuzz (28 checks)
- `test/save-export.fuzz.test.js` - round-trip fuzz (~22,700 checks)
- `test/import-notice.test.js` - version/DLC detection (13 checks)
- `test/import-multitask.fuzz.test.js` - multitask guardrails (76 checks)

---

## Pawn Management

**Primary files:**
- `files/app-pawns.js` - `effectiveSkill`, `isIncapable`, `_resolveGeneDef`, pawn CRUD, skill/trait/health/relationship editors, `showXenoDetails`, gene display helpers, drag/drop, sort

**Key functions:**
- `effectiveSkill(pawn, skillId)` - base + xenotype + gene + trait skill mods
- `isIncapable(pawn, job)` - checks incapBlocks against backstory/trait/gene work disables
- `_resolveGeneDef(gId)` - bridges raw gene defNames to scanned/curated gene definitions

**Tests:**
- `test/charts-skill.fuzz.test.js` - effectiveSkill fuzz (18 checks)
- `test/health-backstory.fuzz.test.js` - health + backstory/scan robustness (1,740 checks)
- `test/trait-editor.fuzz.test.js` - trait editor fuzz (4,287 checks)
- `test/capability-corpus.test.js` - C1 frozen regression corpus (140 checks) - evaluateJobPermission, isIncapable, effectiveSkill, evaluatePawnJob, calculateRealWorkSpeed, calculateWorkSpeedMod, optimizeSchedules, calculateTemporalCoverage, analyzeTemporalResilience

---

## Armoury (Weapons / Apparel / Loadouts)

**Primary files:**
- `files/app-combat.js` - DPS calc (`_calcWeaponDPS`), shield stats (`_calcShieldStats`), utility summary (`_utilityStatsSummary`), comparison, loadout builder, mod-equipment merge
- `files/data.js` - `DEFAULT_WEAPONS`, `DEFAULT_APPAREL`, `WEAPON_QUALITIES`, `APPAREL_QUALITIES`, `DEFAULT_MATERIALS`, `STUFF_CATEGORIES`
- `files/engine.js` - `calculateLoadoutProtection` (multi-layer Markov armour chain)

**Tests:**
- `test/armoury-calc.fuzz.test.js` - armoury calc fuzz (29 checks)

**Reference:**
- `UTILITY_REFERENCE.md` - combat math ground truth, V.U.E. audit results

---

## Relations

**Primary files:**
- `files/app-relations.js` - force-directed graph (`_relSimStep`), canvas drawing, romance estimate (`_estimateRomanceChance`), fight risk (`_estimateFightRisk`), opinion estimate, drawer

**Physics:**
- Repulsion: `8000 / dist^2` (Coulomb's law)
- Attraction: `(dist - 160) * 0.005` (Hooke's law)
- Centre pull: `0.002`, anisotropic
- Damping: `0.85`
- Stops when total energy < 0.1

**Tests:**
- `test/relations-graph.fuzz.test.js` - relations graph fuzz (12 checks)

---

## Blueprints

**Primary files:**
- `files/app-blueprint.js` (~3,250 lines) - grid/canvas, multi-cell furniture, footprints/facing, collision, stamps, undo/redo, materials, biomes, bill of materials, Blueprints-mod XML import/export. Uses `_assignModule` (has a getter).

**Tests:**
- `test/blueprint-import.fuzz.test.js` - import fuzz (13 checks)
- `test/blueprint-rework.fuzz.test.js` - rework + additions robustness (4,324 checks)
- `test/blueprint-xml.test.js` - XML interop (88 checks)
- `test/stress-4d.fuzz.test.js` - scale x adversarial x concurrency x temporal (36 checks)

---

## Raid Calculator

**Primary files:**
- `files/app-raid.js` - `calculateRaidPoints`, `getRaidEstimateText`, storyteller logic, difficulty modifiers, calendar helpers

**Tests:**
- `test/raid-calc.fuzz.test.js` - raid calc fuzz (28 checks)

---

## Shift Planner / Scheduler

**Primary files:**
- `files/engine.js` - `optimizeSchedules` (24h schedule builder with pawn profiling, coverage-aware sleep assignment, gap repair), `calculateTemporalCoverage`, `analyzeTemporalResilience`, `proposeTemporalAdjustments`, `verifyProposalPrecondition`
- `files/app-schedule.js` - schedule rendering, shift painting, temporal resilience diagnostics (`_schedResilienceHTML`), proposal acceptance (`_applyProposal`)

---

## Skills Web / Dashboard

**Primary files:**
- `files/app-render.js` - dashboard rendering, `renderAll`
- `files/charts.js` - `renderColonyRadar` (SVG spider chart)
- `files/engine.js` - `calculateViability` (Survival Index), `getBottlenecks`

---

## Ideology / Manual / Records / Journal

**Primary files:**
- `files/app-tabs.js` - Settings, Ideology (save ideology browser), Manual (renderHelp + contents drawer + scrollspy), Records, Legal, Journal

---

## Editors (Xenotype / Trait)

**Primary files:**
- `files/app-editors.js` - Xenotype editor modal, Trait editor modal, "Scan Game/Mod Folder" merge that loads modded traits/genes/hediffs/relations/backstories/prosthetics + gene colours into renderer state

---

## Mod Scanner

**Primary files:**
- `main.js` - trait/gene/hediff/relation/backstory/prosthetic/equipment/xenotype scanners (all in main process, IPC to renderer)
- `files/app-editors.js` - Scan Mods merge into renderer state

---

## Electron / Window / Native

**Primary files:**
- `main.js` - window management, single-instance, tray, fullscreen, IPC, file dialogs
- `preload.js` - `window.overlay` bridge
- `keyboard-hook.js` - native Windows keyboard hook (koffi)

**Key patterns:**
- `window.overlay.clipboardWrite(text)` is the working clipboard API (not navigator.clipboard)
- Window is frameless, transparent, `focusable:false`, always-on-top by default
- Auto-elevates to admin for the keyboard hook

---

## Core App / Shared

**Primary files:**
- `files/app.js` - state defaults, caps, init, `setTab`, `applySettings`, resize/theme, generic modal system, toast, global helpers (`_escapeHtml`, `_safeColor`, `_modBadge`), `_assignModule`
- `files/data.js` - SKILLS, JOBS, JOB_SOURCE, RECORD_DEFS, PRESET_XENOTYPES, PRESET_TRAITS, DEFAULT_WEAPONS/APPAREL, genes, backstories, memes, etc. Also: renderer-only XML parsers (`parseXenotypesFromXML`, `parseGenesFromXML`, `parseTraitCatalogFromXML`, `parseHediffCatalogFromXML`, `parseRelationCatalogFromXML`, `parseBackstoriesFromXML`, `parseGeneColorsFromXML`, `parsePassionCatalogFromXML`)
- `files/engine.js` - `calculateWorkSpeedMod` (WorkSpeedGlobal from traits/genes/role/ideology)

**Static files:**
- `files/rimjobs.html` - single HTML page (DOM shell); loads all renderer scripts in order after data.js
- `files/styles.css` - all CSS
- `files/rimjobs_logo.png` - app/header logo
- `files/icon.ico` - window/taskbar icon

**Key pattern:**
- `Object.assign(App, {...})` does NOT copy getters. Use `_assignModule()` for modules with getters.

---

## Capability Evidence (C2)

**Primary file:**
- `files/capability-evidence.js` - canonical capability evidence constants, source adapters, evidence integrity/supersession normalisation, raw health/body observations, and `collectPawnEvidence()`.

**Dependency:**
- Loaded after `data.js` and before `engine.js`.
- May consume existing data/App definition lookups at runtime.
- Must never depend on `engine.js`.

**Tests:**
- `test/capability-evidence.test.js` - 492 checks

**Invariants:**
- EVID-001
- XENO-001 through XENO-004
- AUTH-001
- PERM-EVID-001
- BODY-EVID-001
- COND-001 through COND-005
- C2-MOD-001 through C2-MOD-003

---

## Body and Capacity Resolution (C3)

**Primary files:**
- `files/capacity-resolver.js` - race to BodyDef identity, audited DFS part indexes, raw save observation joins, part efficiency, exact worker registry, hediff stage/capMod composition, dependency graph, and structural/current `CapacityFact` snapshots.
- `files/data.js` - inheritance-aware BodyDef, BodyPartDef, PawnCapacityDef, race ThingDef and HediffDef capacity metadata parsers with provenance and completeness markers.
- `main.js` and `files/app-editors.js` - installed definition extraction, cache/finalisation, source provenance and patch uncertainty.
- `files/app-save.js` and `files/capability-evidence.js` - lossless race, BodyDef, raw part index, persistence and observation identity passthrough.

**Dependency:**
- Loaded after `capability-evidence.js` and before `engine.js`.
- Consumes canonical C2 pawn evidence plus an explicit definitions bundle.
- Does not depend on `engine.js`, and no planning, priority or scheduling consumer uses C3 yet.

**Supported target semantics:**
- Public workers: Consciousness, Manipulation, Moving, Sight, Talking and Hearing.
- Internal audited dependencies: BloodPumping, Breathing and BloodFiltration.
- Worker audit target: RimWorld `1.6.4871 rev590`, installed `Assembly-CSharp.dll`.
- Capacity utility order: awake gate, worker, offsets, combined post-factors, minimum setMax, minValue floor, hundredth rounding. Modifiers run only for a positive worker result.

**Tests and verification:**
- `test/capacity-resolver.test.js` - 122 checks across architecture groups A-F, dependency cycles, snapshot partitioning, Human parity and composition order.
- Installed Core scanner smoke: 20 BodyDefs, 91 BodyPartDefs, 11 PawnCapacityDefs, 944 inheritance-relevant ThingDef fragments and 194 HediffDefs.
- Automated renderer-parser fixtures cover inheritance, provenance, duplicate conflict handling, malformed XML safety and stat-scaled capacity-factor preservation.
- The Human parity fixture was generated from the installed Core `Bodies_Humanlike.xml` and `BodyParts_*.xml`, with 32 referenced BodyPartDefs complete.
- A synthetic mod scanner fixture verified package provenance, a targeted BodyPart patch signal and dataset-level PawnCapacity patch uncertainty.

**Known conservative unknowns:**
- Unsupported and custom worker classes, including Eating and Metabolism, remain `unsupportedCapacityWorker` unless they are audited and registered.
- Injury part efficiency remains unknown when the save evidence lacks exact rounded remaining-part-health and preservation inputs.
- Current awake gating remains unknown unless an exact `CanBeAwake` fact is supplied. It is never inferred from `downed`.
- Moving remains unknown when life-stage `alwaysDowned` is unavailable.
- Consciousness remains unknown when active hediff pain exists but exact `PainTotal` is unavailable.
- Stat-scaled hediff post-factors remain unknown when their required live stat value is unavailable.
- Relevant unapplied XML patches make affected definitions partial rather than being guessed.

---

## Permission and Availability Resolution (C4)

**Target runtime:** RimWorld `1.6.4871 rev590`.

**Scanner/provider inputs:**
- `main.js` - collects installed `WorkTypeDef`, `WorkGiverDef`, race `ThingDef`/life-stage work fragments, active package evidence, definition provenance, and requirement-specific PatchOperation uncertainty. The scanner records relevant uncertainty but does not execute patches.
- `files/data.js` - `parseWorkTypeDefsFromXML()`, `parseWorkGiverDefsFromXML()`, and `parseRaceWorkSettingsFromXML()` preserve exact WorkTags, WorkGiver membership, ordered required capacities, minimum ages, provenance, and per-dimension/per-path completeness.
- `files/app-editors.js` - merges the scanner/provider result into renderer definition state without converting unknown data to defaults.
- `files/app-save.js` and `files/capability-evidence.js` - C2 supplies separate job, WorkType, and canonical WorkTag permission evidence, structured unresolved candidates, raw `pawn.incapable` preservation for legacy use, and tri-state current-status facts.

**Canonical modules:**
- `files/requirement-registry.js` - builds a deeply immutable, runtime-versioned snapshot of `JobRequirementPolicy`, OR-alternative `WorkPath` values, AND capacity requirements, and opaque race work policies. It binds 23 audited direct jobs; the ten audited app jobs and all unsupported custom jobs remain explicit `unknown` policies.
- `files/permission-resolver.js` - emits schema-version-1 structural `PermissionReport` values (`allowed`, `blocked`, `unknown`) from C2 evidence, C3 structural capacity facts, and the requirement snapshot. It evaluates exact namespaces, conditional persistent restrictions, race work gates, strict capacity thresholds, and WorkGiver alternatives. Structured target ambiguity resolves only when every supplied candidate has the same outcome.
- `files/c4-evaluation-context.js` - creates one deeply immutable request-scoped context per pawn evaluation batch, with exactly one C2 evidence collection and one C3 capacity resolution. It forwards the full C3 capability-definition bundle and holds no revision cache or invalidation state.
- `files/availability-resolver.js` - independently emits schema-version-1 current `AvailabilityReport` values (`available`, `unavailable`, `unknown`) from tri-state current statuses, C3 current capacity facts, temporary/current-only restrictions, and the same requirement snapshot. It never reads Permission.
- `files/c4-legacy-compatibility.js` - shadow-only adapter. Legacy truth delegates unchanged to `Engine.evaluateJobPermission()` and `App.isIncapable()`; `compare()` names canonical-versus-legacy differences. Canonical unknown never projects to incapable.

**Dependency and load order:**

```text
data
  -> C2 capability evidence
  -> C3 capacity resolver
  -> C4 requirement registry
  -> C4 Permission / immutable context / Availability
  -> existing Engine and App legacy surfaces
  -> C4 legacy compatibility shadow adapter
```

`files/rimjobs.html` loads the pure modules in that order. No production planner, assignment, viability, bottleneck, scheduling, summary, priority, or renderer consumer invokes C4 yet. Consumer and UI migration is reserved for C7; smarter assignment behaviour is reserved for C8.

**Tests:**
- `test/fixtures/c4-runtime-audit-1.6.4871.json` and `test/c4-audit-contract.test.js` - exact audited WorkTags, job partition, race gates, and WorkGiver path truths (25 checks).
- `test/requirement-scanner.test.js` - extraction, inheritance, completeness, active packages, patch signals, malformed XML, and unsupported giver cases (21 checks).
- `test/requirement-registry.test.js` - direct/unknown policies, path and threshold semantics, race lookup, and immutability (54 checks).
- `test/permission-resolver.test.js` - target namespaces, ambiguity, structural conditions, age, capacities, alternative paths, unknown relevance, and report aggregation (44 checks).
- `test/availability-resolver.test.js` - immutable context, tri-state global status, current paths/restrictions, and independent peer combinations (37 checks).
- `test/c4-compatibility.test.js` - exact legacy delegation and named Firefight, Fishing, Hauling, downed, app-job, and every-`incapBlocks` shadow case (139 checks).

**Known conservative unknowns:**
- Relevant unapplied PatchOperations make only the affected requirement dimension or path partial; there is no PatchOperation engine.
- Unsupported/custom WorkGiver execution semantics remain unknown even when standard metadata can still be preserved.
- Missing or incomplete active-package evidence prevents claiming an inactive definition or complete catalogue.
- Missing mental-state, deactivation, unconscious, or awake inputs remain tri-state unknown. Awake facts are derived only from the audited exact inputs in the request context.
- Unsupported app/custom jobs remain unknown without an explicit definition-backed or reviewed `appPolicy`; no closest-vanilla analogue is canonical truth.
- Race definition names are opaque registry keys. Missing or partial race work settings remain unknown, and no race identity branch supplies a default.

---

## Structural Effectiveness Resolution (C5)

**Target runtime:** RimWorld `1.6.4871 rev590`.

**Evidence and definition inputs:**
- `files/app-save.js` and `files/capability-evidence.js` preserve raw SkillRecord presence as `present`, `absent`, or `unknown`, including independent level and passion field presence. Only the skill and passion resolvers may derive `runtimeDefaulted`, and only after a complete active SkillDef catalogue proves an absent record.
- `files/capability-evidence.js` exposes exact canonical skill and stat operations, source-fact conservation, per-source-family completeness, and typed pawn context facts. Trait, gene, hediff, precept, role, and life-stage definition operations are joined to the current pawn at request time. A complete empty family proves no operation; a partial or unknown family opens an evaluation frontier.
- `files/effectiveness-registry.js` builds a deeply immutable, pawn-independent definition snapshot. It contains exact SkillDef policies, passion providers, source-operation catalogues, job policies, phase templates, and five evaluated StatDefs: `GlobalLearningFactor`, `AnimalsLearningFactor`, `WorkSpeedGlobal`, `MiningSpeed`, and `CookSpeed`. Other evidenced facet stats remain `recordOnly`. The final registry search's `hediffs` match is this definition catalogue, not pawn evidence.

**Canonical modules:**
- `files/c5-evaluation-context.js` reuses supplied C2 and C3 facts with zero additional work, or performs one C2 collection and one C3 resolution in standalone mode. The context is immutable and request-scoped.
- `files/structural-skill-resolver.js` and `files/structural-passion-resolver.js` emit separate exact per-SkillDef facts. Stored level, runtime aptitude, disablement diagnostics, runtime projections, raw passion identity, and supported passion semantics remain distinct.
- `files/structural-stat-resolver.js` merges definition templates with the current pawn's canonical C2 stat operations in the audited 28-phase order. It stops at the first relevant frontier, retains a contiguous numeric prefix, marks later operations `notEvaluated`, handles dependency cycles, and uses only request-local memoisation.
- `files/structural-learning-resolver.js` keeps direct passion-only learning separate from ordinary learning. Ordinary learning uses `GlobalLearningFactor` and, only for the exact Animals SkillDef, `AnimalsLearningFactor`. Current saturation and debug learning remain `notEvaluated`.
- `files/structural-effectiveness-resolver.js` assembles duplicate-free plural `skillFacts`, `passionFacts`, and `learningRateFacts`, independent `globalWorkSpeed`, and top-level plural facets. A wholly skillless job has three empty arrays. Facets retain zero, one, or many StatDefs and never collapse to a job scalar.
- `files/c5-legacy-compatibility.js` is shadow-only. It delegates unchanged C1 skill, passion, global-speed, and job-speed surfaces and retains the 14 reviewed differences by name. Legacy numbers never enter canonical calculation.

**Dependency and load order:**

```text
data
  -> C2 capability evidence
  -> C3 capacity resolver
  -> C4 requirement registry
  -> C5 effectiveness registry
  -> C5 immutable request context
  -> C5 skill and passion resolvers
  -> C5 ordered stat resolver
  -> C5 learning resolver
  -> C5 plural report assembler
  -> unchanged Engine and App C1 surfaces
  -> C5 legacy shadow adapter
```

`files/rimjobs.html` loads the modules in this order and invokes none. No planner, renderer, assignment, priority, viability, bottleneck, optimiser, chart, or scheduler consumes C5. C7 owns parity-proven consumer migration and any durable caching boundary. C8 owns weighting, recommendations, ranking, and assignment intelligence.

**Precision, state, and confidence:**
- C3 exposes rounded structural capacity values. C5 Option A evaluates the audited capacity formulas against those public values and emits `capacityInputRoundedByC3`; the result is partial with `exactAgainstRoundedC3CapacityInput`, even when no semantic frontier exists. It never claims an interval or bit-exact runtime parity.
- Completeness describes whether all relevant inputs are captured. Confidence describes the strength of a specific claim. A verified identity may coexist with partial arithmetic and unresolved later phases.
- `unknown`, `notApplicable`, `notEvaluated`, and a partial contiguous prefix are distinct states. Unknown evidence affects only its relevant skill, stat, facet, or job policy.

**Tests:**
- `test/c5-audit-contract.test.js` - executable runtime and legacy contract (10 checks).
- `test/effectiveness-scanner.test.js` - focused definitions, inheritance, packages, patches, and facet bindings (28 checks).
- `test/c5-pawn-stat-evidence.test.js` - current-pawn source joins, family completeness, and typed context (27 checks).
- `test/effectiveness-registry.test.js` - immutable pawn-independent registry and plural policies (22 checks).
- `test/structural-skill-passion.test.js` - request context, SkillFact, PassionFact, and resolver-only defaults (18 checks).
- `test/structural-stat-resolver.test.js` - phase order, frontier, dependencies, cycles, exact formulas, and Option A precision (31 checks).
- `test/structural-learning-resolver.test.js` - direct and ordinary learning boundaries (16 checks).
- `test/structural-effectiveness-resolver.test.js` - plural report and top-level facet assembly (20 checks).
- `test/c5-compatibility.test.js` - exact C1 delegation and named shadow differences (27 checks).

**Known conservative unknowns:**
- Arbitrary mod C# skill, passion, StatPart, worker, WorkGiver, JobDriver, and recipe semantics remain unknown without a reviewed versioned provider.
- Current glow, inspiration, equipment, map, target, building, recipe, quest, training, and learning-saturation inputs remain current, mixed, unresolved, or `notEvaluated` as appropriate.
- Missing applicability, active-package, trait suppression, gene activity, hediff persistence, scenario, or source-family completeness opens only the affected frontier.
- Unsupported app/custom jobs and unsupported facet bindings remain explicit unknowns. There is no closest analogue, arbitrary PatchOperation interpreter, or arbitrary C# interpreter.
- C5 emits no effectiveness score, primary skill, ranking proxy, assignment change, long-lived cache, or consumer migration. Production C1 output remains unchanged.

---

## Test Suite Summary

| Suite | File | Checks | Subsystem |
|-------|------|--------|-----------|
| Engine optimiser + maths | `test/engine.optimiser.test.js` | 87 | Priorities, work speed, capability evaluation, matrix parity, CAP corpus, temporal coverage, proposals, acceptance |
| Save parser fuzz | `test/save-parser.fuzz.test.js` | 30 | Save import |
| Save export fuzz | `test/save-export.fuzz.test.js` | 22,689 | Save round-trip |
| Trait editor fuzz | `test/trait-editor.fuzz.test.js` | 4,287 | Pawn editing |
| State normaliser fuzz | `test/state-normaliser.fuzz.test.js` | 7 | State management |
| Clipboard import fuzz | `test/clipboard-import.fuzz.test.js` | 34 | Import |
| Relations graph fuzz | `test/relations-graph.fuzz.test.js` | 12 | Relations |
| Blueprint import fuzz | `test/blueprint-import.fuzz.test.js` | 13 | Blueprints |
| Raid calc fuzz | `test/raid-calc.fuzz.test.js` | 28 | Raid calculator |
| Charts + effectiveSkill | `test/charts-skill.fuzz.test.js` | 18 | Skills, charts |
| Armoury calc fuzz | `test/armoury-calc.fuzz.test.js` | 29 | Armoury |
| Health + backstory | `test/health-backstory.fuzz.test.js` | 1,740 | Pawns, mod scan |
| Blueprint rework | `test/blueprint-rework.fuzz.test.js` | 4,324 | Blueprints |
| Import/scan guardrails | `test/import-multitask.fuzz.test.js` | 76 | Import, mod scan |
| Import notice | `test/import-notice.test.js` | 13 | Import |
| Blueprint XML interop | `test/blueprint-xml.test.js` | 88 | Blueprints |
| 4D stress | `test/stress-4d.fuzz.test.js` | 36 | Blueprints |
| Logo date line | `test/logo-date.test.js` | 12 | UI |
| Capability corpus (C1 freeze) | `test/capability-corpus.test.js` | 140 | Capability evaluation, skill calc, work speed, scheduling, temporal coverage/resilience - frozen regression fixtures for all capability-related production functions |
| Capability evidence (C2) | `test/capability-evidence.test.js` | 492 | Canonical evidence adapters, body evidence, permission targets, status facts, hediff definitions, aggregate orchestrator, evidence identity/supersession, source-fact conservation |
| Capacity resolver (C3) | `test/capacity-resolver.test.js` | 122 | Body identity, raw-index joins, audited workers, capMods, dependency graph, dual snapshots, Human parity and XML parser fixtures |
| C4 audit contract | `test/c4-audit-contract.test.js` | 25 | Runtime WorkTags, job policy partition, race ages and WorkGiver path truths |
| C4 requirement scanner | `test/requirement-scanner.test.js` | 21 | Work/race extraction, completeness, package activation and patch uncertainty |
| C4 requirement registry | `test/requirement-registry.test.js` | 54 | Immutable policies, exact mappings, OR/AND paths, thresholds and race lookup |
| C4 Permission | `test/permission-resolver.test.js` | 44 | Structural targets, ambiguity, age, capacity, path and unknown aggregation |
| C4 Availability/context | `test/availability-resolver.test.js` | 37 | Request context, tri-state status, current paths and peer independence |
| C4 compatibility/shadow | `test/c4-compatibility.test.js` | 139 | Exact C1 delegation and named canonical-versus-legacy deltas |
| C5 audit contract | `test/c5-audit-contract.test.js` | 10 | Runtime facts, phases, formulas, plural policies, and shadow classifications |
| C5 effectiveness scanner/provider | `test/effectiveness-scanner.test.js` | 28 | Focused definitions, inheritance, packages, patches, source operations, and facets |
| C5 pawn stat evidence | `test/c5-pawn-stat-evidence.test.js` | 27 | Current-pawn catalogue joins, source-family completeness, and typed context facts |
| C5 effectiveness registry | `test/effectiveness-registry.test.js` | 22 | Immutable pawn-independent definitions, supported stats, and plural policies |
| C5 structural skill and passion | `test/structural-skill-passion.test.js` | 18 | Request context, exact SkillFact and PassionFact, resolver-only defaults |
| C5 structural stat resolver | `test/structural-stat-resolver.test.js` | 31 | Ordered operations, frontier, dependencies, cycles, and capacity precision |
| C5 structural learning | `test/structural-learning-resolver.test.js` | 16 | Direct and ordinary learning with current inputs excluded |
| C5 structural effectiveness reports | `test/structural-effectiveness-resolver.test.js` | 20 | Plural skills and top-level facets without scalar aggregation |
| C5 legacy effectiveness shadow | `test/c5-compatibility.test.js` | 27 | Exact C1 delegation and 14 named canonical differences |

The verified suite runs 37 suites, 0 skipped, 0 failures, and 34,821 checks. Logic tests use the vm harness with stubbed globals. XML parser checks use the existing `@xmldom/xmldom` test shim; production remains browser `DOMParser` based.

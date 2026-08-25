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
- `test/capability-evidence.test.js` - 421 checks

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

## Test Suite Summary

| Suite | File | Checks | Subsystem |
|-------|------|--------|-----------|
| Engine optimiser + maths | `test/engine.optimiser.test.js` | 87 | Priorities, work speed, capability evaluation, matrix parity, CAP corpus, temporal coverage, proposals, acceptance |
| Save parser fuzz | `test/save-parser.fuzz.test.js` | 28 | Save import |
| Save export fuzz | `test/save-export.fuzz.test.js` | 22,684 | Save round-trip |
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
| Capability evidence (C2) | `test/capability-evidence.test.js` | 421 | Canonical evidence adapters, body evidence, hediff definitions, aggregate orchestrator, evidence identity/supersession, source-fact conservation |
| Capacity resolver (C3) | `test/capacity-resolver.test.js` | 122 | Body identity, raw-index joins, audited workers, capMods, dependency graph, dual snapshots, Human parity and XML parser fixtures |

The suite currently runs 21 suites and 34,199 checks. Logic tests use the vm harness with stubbed globals. XML parser checks use the existing `@xmldom/xmldom` test shim; production remains browser `DOMParser` based.

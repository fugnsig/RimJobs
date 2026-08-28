/**
 * RIMJOBS ENGINE
 * Handles algebraic simulations, efficiency predictions, and survival probabilities.
 */

const Engine = {
  /**
   * Calculates a pawn's real work speed for a specific job using RimWorld's actual formulas.
   * Based on SkillNeed_BaseBonus: speed = baseValue + bonusPerLevel * skillLevel
   * Then multiplied by WorkSpeedGlobal (traits, genes, ideology).
   *
   * Source: RimWorld StatDefs (MiningSpeed, ConstructionSpeed, PlantWorkSpeed, etc.)
   */
  calculateRealWorkSpeed(pawn, job) {
    const wsMod = this.calculateWorkSpeedMod(pawn); // WorkSpeedGlobal equivalent

    if (!job.speedFormula) {
      // Jobs with no skill component (hauling, cleaning, firefight, etc.)
      // Use GeneralLaborSpeed: base(1) * WorkSpeedGlobal * Manipulation(1) * Sight(capped)
      return 1.0 * wsMod;
    }

    const skill = App.effectiveSkill(pawn, job.skill || 'intellectual');
    const f = job.speedFormula;

    if (f.curve) {
      // CookSpeed uses a special postProcessCurve instead of simple factor
      // Raw = (0 + 1*skill) + sight(4,cap1.5) + manipulation(16,cap1.5)
      // Then postProcessCurve: (-20,0.01), (0,0.4), (20,1.6) interpolated
      // Simplified: we use the curve applied to skill level as the dominant factor
      const raw = f.base + f.perLevel * skill;
      // Linearised curve approximation: at 0 -> 0.4, at 20 -> 1.6
      const curved = 0.4 + (raw / 20) * 1.2;
      return Math.max(0.01, curved) * wsMod;
    }

    // Standard formula: base + perLevel * skill, then * WorkSpeedGlobal
    const speedFactor = f.base + f.perLevel * skill;
    return speedFactor * wsMod;
  },

  /**
   * Calculates the theoretical work output for a specific job across the whole colony.
   * Uses real RimWorld work speed formulas for accuracy.
   */
  calculateWorkCapacity(pawns, job, priorities, contextMap) {
    let capacity = 0;
    pawns.forEach(p => {
      const prio = Number(priorities[p.id]?.[job.id]);
      if (!Number.isFinite(prio) || prio <= 0) return;

      const pawnContext = contextMap && contextMap.get(p.id);
      const speed = this._c7WorkCapacitySpeed(p, job, pawnContext);
      const efficiency = speed * (1 / prio);
      capacity += efficiency;
    });
    return capacity;
  },

  // C5 deliberately has no scalar effectiveness score. C7 therefore retains
  // this frozen numeric projection as compatibility policy while carrying the
  // request-scoped pawn context alongside it for later reviewed migrations.
  _c7WorkCapacitySpeed(pawn, job, _pawnContext) {
    if (typeof C5LegacyCompatibility !== 'undefined'
        && C5LegacyCompatibility.evaluateLegacyJobWorkSpeed) {
      return C5LegacyCompatibility.evaluateLegacyJobWorkSpeed(pawn, job);
    }
    return this.calculateRealWorkSpeed(pawn, job);
  },

  /**
   * Survival Index calculation.
   */
  calculateViability(pawns, priorities, precepts, contextMap) {
    if (pawns.length === 0) return 0;
    
    let score = 50; // Base baseline
    
    // Critical Job Coverage
    const criticals = JOBS.filter(j => j.important);
    criticals.forEach(j => {
      // A real worker = an assigned priority (1-4) on a capable pawn. Use loose
      // `!= null` so an *unset* priority (undefined) is not mistaken for an
      // assignment - otherwise the "no doctor/cook" penalty silently never fires.
      const hasWorker = pawns.some(p => priorities[p.id]?.[j.id] != null
        && this._c7IsEligible(contextMap, p, j));
      if (!hasWorker) score -= 10;
    });

    // Specialization check
    const specialists = pawns.filter(p => p.role !== 'none').length;
    score += (specialists * 4);

    // Mental Stability Check (Factor in Traits)
    let totalBreakModifier = 0;
    pawns.forEach(p => {
      if (Array.isArray(p.traits)) {
        p.traits.forEach(tId => {
          const tDef = App.getTrait(tId);
          if (tDef && tDef.breakThreshold) totalBreakModifier += tDef.breakThreshold;
        });
      }
    });
    
    // Penalise if the colony has high average break thresholds
    const avgBreakMod = totalBreakModifier / pawns.length;
    score -= (avgBreakMod * 100);

    // Ideology mood impact on viability (positive mood = fewer breaks = higher viability)
    const ideoFx = App.getIdeoEffects();
    if (ideoFx.mood) score += (ideoFx.mood * 2); // Each mood point is roughly 2 viability pts

    return Math.max(0, Math.min(100, Math.round(score)));
  },

  /**
   * Identifies labor gaps.
   */
  getBottlenecks(pawns, priorities, contextMap) {
    const gaps = [];
    const jobs = [...JOBS, ...(App.state.customJobs || [])];
    const importantJobs = jobs.filter(j => j.important);
    const isCapable = (p, j) => this._c7IsEligible(contextMap, p, j);
    
    // 1. Basic coverage check
    importantJobs.forEach(j => {
      const hasP1 = pawns.some(p => priorities[p.id]?.[j.id] === 1 && isCapable(p, j));
      if (!hasP1) {
        const hasAny = pawns.some(p => priorities[p.id]?.[j.id] !== null && isCapable(p, j));
        if (!hasAny) gaps.push(`NO COVERAGE: ${j.name}`);
        else gaps.push(`Low priority for ${j.name}`);
      }
    });

    // 2. Conflict Detection
    // Warn when two pawns are both P1 on the same high-demand job but neither covers an uncovered critical job
    const highDemandIds = ['construction', 'growing', 'mining', 'hauling', 'cleaning', 'research', 'crafting'];
    const criticalIds = ['firefight', 'patient', 'doctoring'];
    
    const uncoveredCriticals = criticalIds.filter(id => {
      const job = jobs.find(j => j.id === id);
      if (!job) return false;
      return !pawns.some(p => (priorities[p.id]?.[id] !== null && priorities[p.id]?.[id] <= 2) && isCapable(p, job));
    });

    if (uncoveredCriticals.length > 0) {
      highDemandIds.forEach(id => {
        const job = jobs.find(j => j.id === id);
        if (!job) return;
        
        const p1Pawns = pawns.filter(p => priorities[p.id]?.[id] === 1 && isCapable(p, job));
        if (p1Pawns.length >= 2) {
          // Check if any of these p1Pawns COULD cover an uncovered critical
          const capableOfCritical = p1Pawns.filter(p => {
            return uncoveredCriticals.some(critId => {
              const critJob = jobs.find(j => j.id === critId);
              return critJob && isCapable(p, critJob);
            });
          });

          if (capableOfCritical.length > 0) {
            const critNames = uncoveredCriticals.map(cid => jobs.find(j => j.id === cid)?.name).filter(Boolean).join(', ');
            gaps.push(`CONFLICT: Multiple pawns are P1 on ${job.name}, but ${critNames} lack coverage!`);
          }
        }
      });
    }
    
    return gaps;
  },

  _c7IsEligible(contextMap, pawn, job) {
    const pawnContext = contextMap && contextMap.get(pawn.id);
    if (pawnContext) {
      return pawnContext.permission(job).state !== 'blocked'
        && pawnContext.availability(job).state !== 'unavailable';
    }
    // Temporary compatibility for non-UI legacy callers while C7 migrates them.
    return !App.isIncapable(pawn, job);
  },

  /**
   * Automatic Work Assignment logic (Dynamic Ranking).
   * Guarantees 100% job coverage while prioritising specialists.
   */
  // Effective passion bucket for scoring: 2 major-like, 1 minor-like, 0 none,
  // -1 bad (e.g. a modded Apathy passion - actively worse than no passion).
  // Resolves modded passion defs through the scanned catalogue at read time instead
  // of trusting the bucket baked into p.passions at import, so a bad passion is
  // never mistaken for a minor one in auto-assign or recommendations.
  passionBucket(p, skillId, pawnContext) {
    if (!p || !skillId) return 0;
    const c5Context = pawnContext && pawnContext.c5Context;
    const policies = c5Context && c5Context.effectivenessSnapshot
      && c5Context.effectivenessSnapshot.skillPolicies || {};
    if (c5Context && typeof StructuralPassionResolver !== 'undefined') {
      let matches = [];
      if (policies[skillId]) {
        matches = [skillId];
      } else {
        matches = Object.keys(policies).filter(skillDefId =>
          policies[skillDefId] && policies[skillDefId].appSkillId === skillId);
      }
      if (matches.length === 1) {
        const fact = StructuralPassionResolver.resolve(c5Context, matches[0]);
        if (fact && fact.state === 'resolved' && fact.completeness === 'complete'
            && Number.isInteger(fact.compatibilityBucket)) {
          return fact.compatibilityBucket;
        }
      }
    }
    try { return App._passionMeta(App._passionValue(p, skillId)).bucket | 0; }
    catch (_) { return ((p.passions || {})[skillId] | 0); }
  },

  runMinMaxAssignment(pawns, roles, priorities, jobs) {
    if (pawns.length === 0) return;
    // Scope to the provided job set (the table's visible columns) when given.
    const jobList = jobs && jobs.length ? jobs : JOBS;

    // 1. Reset priorities for the jobs we're assigning
    pawns.forEach(p => {
      const pId = p.id;
      if (!priorities[pId]) priorities[pId] = {};
      jobList.forEach(j => priorities[pId][j.id] = null);
    });

    // 2. Iterate through every job to ensure colony-wide coverage
    jobList.forEach(j => {
      const capable = pawns.filter(p => !App.isIncapable(p, j));
      if (capable.length === 0) return;

      // Mandatory Emergency Handlers (Everyone capable does these at P1)
      if (['firefight', 'patient', 'bed_rest'].includes(j.id)) {
        capable.forEach(p => priorities[p.id][j.id] = 1);
        return;
      }

      // Calculate "Aptitude Scores" using real RimWorld work speed formulas + growth potential
      const rankings = capable.map(p => {
        const skill = j.skill ? App.effectiveSkill(p, j.skill) : 0;
        const passion = Engine.passionBucket(p, j.skill);
        const roleDef = App.getRole(p.role || 'none');
        const isRoleSkill = j.skill && (roleDef.skillMods || {})[j.skill];
        const xenoDef = App.getXeno(p.xenotype);
        const xenoSkillMod = (xenoDef.skillMods && xenoDef.skillMods[j.skill]) || 0;
        const hasXenoAffinity = xenoSkillMod > 0;
        const hasXenoPenalty = xenoSkillMod < 0;

        // Real work speed from RimWorld's SkillNeed_BaseBonus formulas
        const realSpeed = Engine.calculateRealWorkSpeed(p, j);

        // Score: real speed is the primary factor (scaled to 0-200 range),
        // passion adds growth potential, role/xeno add context
        let score = realSpeed * 100;
        score += passion * 25;  // Passion matters for XP gain / long-term growth
        if (isRoleSkill) score += 50;
        if (j.important) score += 10;
        if (hasXenoAffinity) score += xenoSkillMod * 8;
        if (hasXenoPenalty) score += xenoSkillMod * 5;
        // Gene skill mods from xenogenes
        if (xenoDef.genes && xenoDef.genes.length > 0) {
          xenoDef.genes.forEach(gId => {
            const gene = App._resolveGeneDef(gId);
            if (gene && gene.skillMods && gene.skillMods[j.skill]) {
              score += gene.skillMods[j.skill] * 5;
            }
          });
        }
        // Trait learning rate bonus: fast learners rank higher for jobs they have passion in
        if (Array.isArray(p.traits) && passion >= 1) {
          p.traits.forEach(tId => {
            const tDef = App.getTrait(tId);
            if (tDef && tDef.learningRate) score += (tDef.learningRate * 15);
          });
        }

        // --- Mood Preset Score Penalties ---
        if (p.moodPreset === 'panic') {
          if (!['firefight', 'patient', 'bed_rest'].includes(j.id)) {
            score -= 1000;
          } else {
            score += 500;
          }
        } else if (p.moodPreset === 'chill') {
          if (['labor', 'maintenance', 'crafting', 'combat'].includes(j.cat) || j.filter === 'combat') {
            score -= 60;
          }
        }

        return { pId: p.id, score, skill, passion, isRoleSkill, hasXenoAffinity, mood: p.moodPreset, realSpeed };
      });

      // Sort by aptitude descending
      rankings.sort((a, b) => b.score - a.score);

      // Assign priorities using real work speed thresholds + skill/passion context
      rankings.forEach((rank, index) => {
        let pLevel = null;

        // --- Mood Overrides (Phase 0) ---
        if (rank.mood === 'panic' && !['firefight', 'patient', 'bed_rest'].includes(j.id)) {
          if (index === 0 && pawns.length === 1) pLevel = 4;
          else pLevel = null;
        } else {
          // Use real work speed for smarter thresholds
          // For skill-based jobs, realSpeed tells us the actual game multiplier
          const hasFormula = !!j.speedFormula;
          const speed = rank.realSpeed;

          // --- PRIORITY 1: The Masters & Elites ---
          // High real speed (>1.5x) or classic thresholds met
          if ((hasFormula && speed >= 1.5) || rank.skill >= 15 || (rank.skill >= 10 && rank.passion >= 2) || (rank.isRoleSkill && rank.skill >= 12) || (rank.hasXenoAffinity && rank.skill >= 12)) {
            pLevel = 1;
          }
          // --- PRIORITY 2: The Professionals ---
          // Decent real speed (>0.8x) or classic thresholds
          else if ((hasFormula && speed >= 0.8) || rank.skill >= 8 || (rank.skill >= 4 && rank.passion >= 1) || rank.isRoleSkill || (rank.hasXenoAffinity && rank.skill >= 6)) {
            pLevel = 2;
          }
          // --- PRIORITY 3: The Capable & Best Candidates ---
          // Low but functional speed (>0.4x) or has passion/some skill
          else if ((hasFormula && speed >= 0.4) || rank.passion >= 1 || rank.skill >= 3 || (index === 0 && pawns.length <= 3)) {
            pLevel = 3;
          }
          // --- PRIORITY 4: The Fallback ---
          else if (index === 0 || ['hauling', 'cleaning', 'basic_work', 'plant_cut'].includes(j.id)) {
            pLevel = 4;
          }
        }

        // Apply if not already set (Pass 1 might have set a higher priority)
        if (pLevel !== null && (priorities[rank.pId][j.id] === null || pLevel < priorities[rank.pId][j.id])) {
          priorities[rank.pId][j.id] = pLevel;
        }
      });

      // FINAL SAFETY: If the job is still unassigned after all logic (shouldn't happen),
      // give it to the best person at P4.
      const isJobAssigned = capable.some(p => priorities[p.id][j.id] !== null);
      if (!isJobAssigned) {
        priorities[rankings[0].pId][j.id] = 4;
      }
    });
  },

  /**
   * Optimised 24h shifts - comprehensive pawn-aware scheduler. Reads the priorities
   * table (workload, critical cover) but NEVER writes to it.
   *
   * Variables considered:
   *   - Night owl trait (sleep covers the awake-11h-18h mood loss; awake 23h-6h bonus)
   *   - UV sensitivity from xenotype/genes (sleep covers daylight 6h-18h)
   *   - Quick sleeper trait (6h sleep) and Low Sleep gene (RestFallRateFactor 0.4 - 3h)
   *   - Sleepless gene / Body Mastery trait (0h sleep)
   *   - Children (Biotech): no work blocks, extra play; babies get a free schedule
   *   - Psycasters: dedicated Meditate block when the colony has that shift type
   *   - Undergrounder trait (no outdoor mood penalty, can work any shift)
   *   - Depressive / neurotic / very neurotic traits (extra joy time)
   *   - Ascetic trait (less joy needed)
   *   - Break threshold from traits (high risk = more joy)
   *   - Mood preset overrides (panic/chill/night kept intact)
   *   - Critical job coverage (doctor/cook scheduled first for stagger)
   *   - Workload balancing - pawns with more P1 jobs get more work hours
   *   - Intelligent staggering - uses coverage-aware slot assignment
   */
  optimizeSchedules(pawns) {
    const types = App.state.shiftTypes;
    const idxAny = Math.max(0, types.indexOf('Anything'));
    const idxSleep = Math.max(0, types.indexOf('Sleep'));
    const idxWork = Math.max(0, types.indexOf('Work'));
    const idxJoy = Math.max(0, types.indexOf('Recreation'));
    // Dedicated Meditate shift type for psycasters; falls back to Recreation when the
    // colony's shift types don't include one (meditation is Meditative recreation).
    const idxMedRaw = types.indexOf('Meditate');
    const idxMed = idxMedRaw >= 0 ? idxMedRaw : idxJoy;
    const priorities = App.state.priorities || {};

    // -- Phase 1: Profile each pawn --
    const profiles = pawns.map(p => {
      const traits = Array.isArray(p.traits) ? p.traits : [];
      const xeno = App.getXeno(p.xenotype);
      const uvLevel = xeno.uvSensitivity || 0;
      const genes = (xeno.genes || []);
      const allGenes = typeof GENES !== 'undefined' ? GENES : [];
      const customGenes = App.state.customGenes || {};

      // Trait flags
      const isNightOwl = traits.includes('night_owl');
      const isUVSensitive = uvLevel >= 1;
      const isUndergrounder = traits.includes('undergrounder');
      const isQuickSleeper = traits.includes('quick_sleeper');
      const isAscetic = traits.includes('ascetic');
      const isDepressive = traits.includes('depressive');
      const isNeurotic = traits.includes('neurotic') || traits.includes('very_neurotic');

      // Gene flags
      const hasSleeplessGene = genes.some(gId => {
        const gene = allGenes.find(g => g.id === gId) || customGenes[gId];
        return gene && (gene.id === 'gene_no_sleep' || gene.label === 'Sleepless');
      });
      // Low Sleep gene (Biotech, e.g. sanguophages): RestFallRateFactor 0.4 - carriers
      // tire 60% slower, so a full 8h block wastes around 4 productive hours a day.
      const hasLowSleepGene = genes.some(gId => /low_?sleep/i.test(String(gId)));
      // Body Mastery trait: "No basic needs (Food/Sleep)" - treat like the Sleepless gene.
      const isBodyMastery = traits.includes('body_mastery');
      // Children (Biotech): work unlocks by age (see JOB_MIN_AGE) - most jobs at 7,
      // skilled ones at 10-13. Under-3s are babies; under-7s get no work blocks.
      const isChild = p.bioAge != null && p.bioAge < 13;
      const isBaby = p.bioAge != null && p.bioAge < 3;
      const isYoungChild = p.bioAge != null && p.bioAge < 7;
      // Downed in the imported save: incapacitated in bed, no work for an unknowable
      // time (could be a modded part awaiting replacement), so schedule nothing.
      const isDowned = p.downed === true;

      // Psycaster: has a psylink (vanilla PsychicAmplifier, or a modded equivalent). They
      // need to meditate to recover psyfocus, which in RimWorld happens during Recreation /
      // Anything time, so the optimiser sets aside extra non-work hours for them.
      const hed = (Array.isArray(p.health) ? p.health : []).concat(Array.isArray(p._saveHediffs) ? p._saveHediffs : []);
      const isPsycaster = hed.some(h => h && (/psylink|psychicamp/i.test(h.def || '') || h.hediffClass === 'Hediff_Psylink'));

      // Break risk from traits - higher threshold = more likely to break
      let breakRisk = 0;
      traits.forEach(tId => {
        const tDef = App.getTrait(tId);
        if (tDef && tDef.breakThreshold) breakRisk += tDef.breakThreshold;
      });

      // Sleep hours needed
      let sleepHours = 8;
      if (hasSleeplessGene || isBodyMastery) sleepHours = 0;
      else {
        if (isQuickSleeper) sleepHours = 6;
        // RestFallRateFactor 0.4: needs ~40% of normal sleep, floored at 3h blocks.
        if (hasLowSleepGene) sleepHours = Math.max(3, Math.round(sleepHours * 0.4));
      }

      // Joy hours needed - base 2, adjusted by mood risk
      let joyHours = 2;
      if (isDepressive) joyHours = 3;
      if (isNeurotic) joyHours = 3;
      if (isDepressive && isNeurotic) joyHours = 4;
      if (breakRisk > 0.10) joyHours = Math.max(joyHours, 4);
      else if (breakRisk > 0.05) joyHours = Math.max(joyHours, 3);
      if (isAscetic) joyHours = Math.max(1, joyHours - 1);
      // Children get extra play; babies follow their needs, so no scheduled blocks.
      if (isChild && !isBaby) joyHours += 2;
      if (isBaby) joyHours = 0;
      // Psycasters get a dedicated meditation window to regain psyfocus.
      const meditateHours = (isPsycaster && !isBaby) ? 2 : 0;

      // Needs night shift?
      // UV-sensitive pawns need night shift unless they're undergrounders
      const needsNight = isNightOwl || (isUVSensitive && !isUndergrounder);

      // Hours this pawn should NOT be awake, used to pick the sleep slot: Night Owl
      // loses mood when awake 11h-18h (and gains 23h-6h); UV-sensitive pawns burn in
      // daylight 6h-18h (Undergrounders exempt). Verified against the trait/gene defs.
      const avoidAwake = new Set();
      if (isNightOwl) for (let h = 11; h < 18; h++) avoidAwake.add(h);
      if (isUVSensitive && !isUndergrounder) for (let h = 6; h < 18; h++) avoidAwake.add(h);

      // Workload: count P1 assignments
      const pPrios = priorities[p.id] || {};
      let p1Count = 0;
      Object.values(pPrios).forEach(v => { if (v === 1) p1Count++; });

      // Work hours: base 10, +1 for heavy workload, -2 for low workload.
      // Downed pawns and under-7s get no Work blocks; 7-12s get a short block (most
      // jobs unlock at age 7, skilled ones at 10-13 - see JOB_MIN_AGE).
      const anyHours = 24 - sleepHours - joyHours - meditateHours;
      let workHours = (isDowned || isYoungChild) ? 0
        : isChild ? Math.min(6, anyHours)
        : Math.min(anyHours, p1Count >= 5 ? 12 : p1Count >= 3 ? 10 : 8);
      const freeHours = 24 - sleepHours - workHours - joyHours - meditateHours;

      // Is this pawn a critical-job specialist? (doctor, cook)
      const isCritical = !isChild && !isDowned && ['doctoring', 'cooking'].some(jId =>
        pPrios[jId] === 1 || pPrios[jId] === 2
      );

      return {
        pawn: p, needsNight, sleepHours, workHours, joyHours, meditateHours, freeHours,
        isCritical, p1Count, breakRisk, isUndergrounder, avoidAwake,
        isNightOwl, isUVSensitive, hasSleeplessGene, hasLowSleepGene, isBodyMastery,
        isQuickSleeper, isChild, isBaby, isYoungChild, isDowned,
        isDepressive, isNeurotic, isAscetic, isPsycaster,
        moodPreset: p.moodPreset || 'normal'
      };
    });

    // Rationale report: one record per pawn explaining the chosen hours, plus a
    // colony-level summary. Returned to the UI so the optimiser can show its
    // working ("why these shifts?") instead of silently rewriting the grid.
    const report = [];
    let gapsRepaired = 0;
    const driversFor = (pr) => {
      const d = [];
      if (pr.isDowned) d.push('Downed - incapacitated in bed (from the save import); no work scheduled until they recover');
      if (pr.isBaby) d.push('Baby - free schedule, naps and feeds on demand');
      else if (pr.isYoungChild) d.push('Young child - too young for scheduled work (most jobs unlock at 7); play and learning time');
      else if (pr.isChild) d.push('Child - short work block; age-gated jobs only (skilled work unlocks at 10-13)');
      if (pr.isNightOwl) d.push('Night Owl - sleeps through the 11h-18h mood-loss window, awake for the 23h-6h bonus');
      if (pr.isUVSensitive && !pr.isUndergrounder) d.push('UV-sensitive - sleeps through daylight (6h-18h) to avoid sunlight');
      if (pr.isUndergrounder) d.push('Undergrounder - unaffected by darkness, so kept flexible');
      if (pr.hasSleeplessGene) d.push('Sleepless gene - no sleep block needed');
      else if (pr.isBodyMastery) d.push('Body Mastery - no sleep needed');
      else if (pr.hasLowSleepGene) d.push('Low Sleep gene - tires 60% slower, short ' + pr.sleepHours + 'h sleep block');
      else if (pr.isQuickSleeper) d.push('Quick Sleeper - only 6h of sleep');
      if (pr.isCritical) d.push('Critical specialist (doctor/cook) - scheduled first for cover');
      if (pr.joyHours >= 4 && !pr.isChild) d.push('High break risk - extra recreation to protect mood');
      else if (pr.isDepressive || pr.isNeurotic) d.push('Mood-sensitive - extra recreation');
      if (pr.isAscetic) d.push('Ascetic - needs less recreation');
      if (pr.isPsycaster) d.push('Psycaster - dedicated meditation block to recover psyfocus');
      if (pr.isChild) { /* workload notes don't apply to children */ }
      else if (pr.p1Count >= 5) d.push('Heavy workload (' + pr.p1Count + ' top-priority jobs) - longer work block');
      else if (pr.p1Count <= 2) d.push('Light workload - shorter work block');
      return d;
    };

    // -- Phase 2: Sort pawns for staggering priority --
    // Critical pawns first, then by flexibility (undergrounders last since they're flexible)
    const sorted = [...profiles].sort((a, b) => {
      if (a.isCritical !== b.isCritical) return a.isCritical ? -1 : 1;
      if (a.needsNight !== b.needsNight) return a.needsNight ? -1 : 1;
      if (a.isUndergrounder !== b.isUndergrounder) return a.isUndergrounder ? 1 : -1;
      return b.p1Count - a.p1Count;
    });

    // -- Phase 3: Coverage-aware staggered slot assignment --
    // Track how many pawns are awake at each hour
    const coverage = Array(24).fill(0);

    // Separate into night-shift and day-shift pools
    const nightPool = sorted.filter(p => p.needsNight);
    const dayPool = sorted.filter(p => !p.needsNight);

    // Assign sleep slots to minimise coverage gaps
    const assignSleepSlot = (profile, pool, isNight) => {
      if (profile.sleepHours === 0) return -1; // sleepless

      // Candidate sleep start hours
      // Night pawns: sleep during daylight (6-14 range)
      // Day pawns: sleep during night (20-4 range)
      const candidates = isNight
        ? [6, 7, 8, 9, 10, 11, 12, 13, 14]
        : [21, 22, 23, 0, 1, 2, 3, 4, 5];

      // Score each candidate: prefer slots where coverage is highest
      // (sleeping when others are awake = better coverage)
      let bestStart = candidates[0];
      let bestScore = -Infinity;

      candidates.forEach(start => {
        let score = 0;
        for (let h = 0; h < profile.sleepHours; h++) {
          const hour = (start + h) % 24;
          score += coverage[hour]; // higher coverage = better time to sleep
          // Strongly prefer sleeping through hours where being awake hurts this pawn
          // (Night Owl 11h-18h mood loss, UV daylight 6h-18h). Each such hour slept
          // outweighs a coverage point, so mood/sunlight wins ties against stagger.
          if (profile.avoidAwake && profile.avoidAwake.has(hour)) score += 4;
        }
        // Penalise sleep slots that leave low-coverage wake hours
        for (let h = profile.sleepHours; h < 24; h++) {
          const hour = (start + h) % 24;
          if (coverage[hour] === 0) score -= 2;
        }
        if (score > bestScore) {
          bestScore = score;
          bestStart = start;
        }
      });

      return bestStart;
    };

    // -- Phase 4: Build schedules --
    // First pass: assign night pool, then day pool
    [nightPool, dayPool].forEach((pool, poolIdx) => {
      const isNight = poolIdx === 0;
      pool.forEach((profile, i) => {
        const p = profile.pawn;

        // Downed (from save import): the game ignores the schedule entirely while a
        // pawn is incapacitated in bed, so give them a fully free day - no sleep, work,
        // joy or meditate blocks - and contribute no coverage. Overrides mood presets;
        // a downed pawn cannot keep a night shift either.
        if (profile.isDowned) {
          p.schedule = Array(24).fill(idxAny);
          report.push({ id: p.id, name: p.nickname || p.name, mode: 'downed', drivers: driversFor(profile) });
          return;
        }

        // Respect mood presets - don't override user's manual choice. But only
        // preserve the manual schedule if it's a valid 24-hour array of known shift
        // type indices (NOT just 0-3: Meditate/Clean and custom types are valid too);
        // a corrupted/legacy one falls through to be rebuilt rather than left broken.
        const manualValid = Array.isArray(p.schedule) && p.schedule.length === 24 &&
          p.schedule.every(v => Number.isInteger(v) && v >= 0 && v < types.length);
        if ((profile.moodPreset === 'panic' || profile.moodPreset === 'chill' || profile.moodPreset === 'night') && manualValid) {
          // Already handled by setPawnMoodPreset, skip
          // But still update coverage tracking (children excluded - a child being
          // awake doesn't staff the colony's jobs)
          p.schedule.forEach((type, h) => {
            if (type !== idxSleep && !profile.isYoungChild && !profile.isDowned) coverage[h]++;
          });
          report.push({
            id: p.id, name: p.nickname || p.name, mode: 'manual',
            preset: profile.moodPreset, drivers: driversFor(profile)
          });
          return;
        }

        p.schedule = Array(24).fill(idxAny);

        if (profile.sleepHours === 0) {
          // Sleepless: all work and joy, no sleep
          // Distribute joy across low-coverage hours
          const joyStart = isNight ? 5 : 18;
          for (let h = 0; h < profile.joyHours; h++) {
            p.schedule[(joyStart + h) % 24] = idxJoy;
          }
          // Psycaster meditation block straight after recreation
          for (let h = 0; h < profile.meditateHours; h++) {
            p.schedule[(joyStart + profile.joyHours + h) % 24] = idxMed;
          }
          // Work hours during optimal period
          const workStart = isNight ? 18 : 6;
          let assigned = 0;
          for (let h = 0; h < 24 && assigned < profile.workHours; h++) {
            const hour = (workStart + h) % 24;
            if (p.schedule[hour] === idxAny) {
              p.schedule[hour] = idxWork;
              assigned++;
            }
          }
          // Track coverage (always awake; children don't staff jobs)
          if (!profile.isYoungChild && !profile.isDowned) for (let h = 0; h < 24; h++) coverage[h]++;
          report.push({
            id: p.id, name: p.nickname || p.name, mode: 'sleepless',
            sleepStart: null, sleepHours: 0,
            joyStart, joyHours: profile.joyHours,
            workStart, workHours: profile.workHours,
            drivers: driversFor(profile)
          });
          return;
        }

        // Find optimal sleep slot using coverage-aware algorithm
        const sleepStart = assignSleepSlot(profile, pool, isNight);

        // Apply sleep
        for (let h = 0; h < profile.sleepHours; h++) {
          p.schedule[(sleepStart + h) % 24] = idxSleep;
        }

        // Joy: place right before sleep (wind-down) or after wake
        const wakeHour = (sleepStart + profile.sleepHours) % 24;
        // Place joy right after waking up (recreation before work)
        for (let h = 0; h < profile.joyHours; h++) {
          p.schedule[(wakeHour + h) % 24] = idxJoy;
        }

        // Psycaster meditation block straight after recreation, before work
        for (let h = 0; h < profile.meditateHours; h++) {
          p.schedule[(wakeHour + profile.joyHours + h) % 24] = idxMed;
        }

        // Work: fill remaining 'Any' slots, prioritising hours with low coverage
        const workStart = (wakeHour + profile.joyHours + profile.meditateHours) % 24;
        let workAssigned = 0;

        // First: assign work in order from wake+joy
        for (let h = 0; h < 24 && workAssigned < profile.workHours; h++) {
          const hour = (workStart + h) % 24;
          if (p.schedule[hour] === idxAny) {
            p.schedule[hour] = idxWork;
            workAssigned++;
          }
        }

        // Track coverage (children excluded - they don't staff the colony's jobs)
        if (!profile.isYoungChild && !profile.isDowned) {
          for (let h = 0; h < 24; h++) {
            if (p.schedule[h] !== idxSleep) coverage[h]++;
          }
        }

        report.push({
          id: p.id, name: p.nickname || p.name, mode: isNight ? 'night' : 'day',
          sleepStart, sleepHours: profile.sleepHours,
          joyStart: wakeHour, joyHours: profile.joyHours,
          workStart, workHours: profile.workHours,
          drivers: driversFor(profile)
        });
      });
    });

    // -- Phase 5: Coverage gap repair --
    // If any hour has 0 coverage, try to shift a flexible pawn's sleep away from it
    for (let hour = 0; hour < 24; hour++) {
      if (coverage[hour] > 0) continue;

      // Find a pawn sleeping at this hour who could sleep elsewhere
      const candidate = profiles.find(pr => {
        if (pr.sleepHours === 0) return false;
        if (pr.isYoungChild || pr.isDowned) return false; // a young child or downed pawn being awake doesn't staff the colony
        if (pr.moodPreset === 'panic' || pr.moodPreset === 'chill' || pr.moodPreset === 'night') return false;
        if (pr.needsNight && hour >= 18) return false; // don't wake night pawns at night
        if (!pr.needsNight && hour >= 6 && hour < 18) return false; // don't wake day pawns during day
        return pr.pawn.schedule[hour] === idxSleep;
      });

      if (!candidate) continue;

      // Shift this pawn's sleep 1 hour later, freeing this gap hour
      const p = candidate.pawn;
      const oldSched = [...p.schedule];
      p.schedule[hour] = idxAny;
      // Find a free hour to add sleep back
      for (let h = 23; h >= 0; h--) {
        if (p.schedule[h] === idxAny && h !== hour) {
          p.schedule[h] = idxSleep;
          coverage[hour]++;
          coverage[h]--;
          gapsRepaired++;
          break;
        }
      }
    }

    // -- Summary for the UI --
    const minCoverage = Math.min(...coverage);
    return {
      pawns: report,
      gapsRepaired,
      fullCoverage: minCoverage > 0,
      minCoverage,
      nightCount: report.filter(r => r.mode === 'night').length,
      dayCount: report.filter(r => r.mode === 'day').length,
      manualCount: report.filter(r => r.mode === 'manual').length,
    };
  },

  calculateTemporalCoverage(pawns, schedules, job, contextMap) {
    const types = App.state.shiftTypes || [];
    const idxSleep = types.indexOf('Sleep');

    const capable = [];
    for (let i = 0; i < pawns.length; i++) {
      const p = pawns[i];
      const pawnContext = contextMap && contextMap.get(p.id);
      if (pawnContext) {
        const permission = pawnContext.permission(job);
        const permissionParticipates = permission
          && (permission.state === 'allowed' || permission.state === 'unknown');
        if (!permissionParticipates) continue;
        const availability = pawnContext.availability(job);
        const availabilityParticipates = availability
          && (availability.state === 'available' || availability.state === 'unknown');
        if (!availabilityParticipates) continue;
      } else {
        // Compatibility for callers not migrated until Task 8. The C7 path above
        // always uses canonical Permission plus Availability.
        const legacyPermission = typeof this.evaluateJobPermission === 'function'
          ? this.evaluateJobPermission(p, job) : null;
        const legacyParticipates = legacyPermission
          ? (legacyPermission.status === 'allowed' || legacyPermission.status === 'uncertain')
          : !App.isIncapable(p, job);
        if (!legacyParticipates) continue;
      }
      capable.push(p);
    }

    const hours = [];
    for (let h = 0; h < 24; h++) {
      const awake = [];
      for (let i = 0; i < capable.length; i++) {
        const p = capable[i];
        const sched = schedules[p.id];
        const hasSchedule = Array.isArray(sched) && sched.length === 24;
        if (hasSchedule && idxSleep >= 0 && sched[h] === idxSleep) continue;
        awake.push({ id: p.id, name: p.nickname || p.name, inferredAwake: !hasSchedule });
      }
      const count = awake.length;
      hours.push({
        hour: h,
        capablePawns: awake,
        count,
        status: count === 0 ? 'gap' : count === 1 ? 'fragile' : 'healthy'
      });
    }

    return hours;
  },

  calculateWorkSpeedMod(p) {
    let mod = 1.0;
    if (Array.isArray(p.traits)) {
      p.traits.forEach(tId => {
        const tDef = App.getTrait(tId);
        if (tDef && tDef.workSpeed) mod += tDef.workSpeed;
      });
    }
    // Gene work speed effects
    const xeno = App.getXeno(p.xenotype);
    if (xeno.genes && xeno.genes.length > 0) {
      xeno.genes.forEach(gId => {
        const gene = (typeof GENES !== 'undefined' ? GENES : []).find(g => g.id === gId) || (App.state.customGenes && App.state.customGenes[gId]);
        if (gene && gene.workSpeed) mod += gene.workSpeed;
      });
    }
    const role = App.getRole(p.role || 'none');
    if (role.workSpeed) mod += role.workSpeed;
    // Ideology work speed bonus (colony-wide from memes + precepts)
    const ideoFx = App.getIdeoEffects();
    if (ideoFx.workSpeed) mod += ideoFx.workSpeed;
    // Settings precept: work_drive (flat work speed bonus)
    if (App.state.precepts && App.state.precepts['work_drive']) mod += App.state.precepts['work_drive'];
    return mod;
  },

  /**
   * Colony Optimizer - analyzes pawn assignments and recommends improvements.
   * Returns { gaps, recommendations, singlePoints }
   */
  _c7AnalyserEligible(pawn, job, pawnContext) {
    if (pawnContext) {
      const permission = pawnContext.permission(job);
      const permissionParticipates = permission
        && (permission.state === 'allowed' || permission.state === 'unknown');
      if (!permissionParticipates) return false;
      const availability = pawnContext.availability(job);
      return !!availability
        && (availability.state === 'available' || availability.state === 'unknown');
    }
    const legacyPermission = typeof this.evaluateJobPermission === 'function'
      ? this.evaluateJobPermission(pawn, job) : null;
    return legacyPermission
      ? (legacyPermission.status === 'allowed' || legacyPermission.status === 'uncertain')
      : !App.isIncapable(pawn, job);
  },

  _c7AnalyserProjection(pawn, job, pawnContext) {
    const hasSkill = !!job.skill;
    const skill = hasSkill
      ? (typeof C5LegacyCompatibility !== 'undefined'
          && C5LegacyCompatibility.evaluateLegacySkill
        ? C5LegacyCompatibility.evaluateLegacySkill(pawn, job.skill)
        : App.effectiveSkill(pawn, job.skill))
      : 0;
    const passion = hasSkill ? this.passionBucket(pawn, job.skill, pawnContext) : 0;
    const realSpeed = typeof C5LegacyCompatibility !== 'undefined'
        && C5LegacyCompatibility.evaluateLegacyJobWorkSpeed
      ? C5LegacyCompatibility.evaluateLegacyJobWorkSpeed(pawn, job)
      : this.calculateRealWorkSpeed(pawn, job);
    return { skill, passion, realSpeed, hasSkill };
  },

  analyzeColony(pawns, priorities, jobs, contextMap) {
    if (pawns.length === 0) return { gaps: [], recommendations: [], singlePoints: [] };
    // Analyse only the provided job set (visible columns) when given.
    const allJobs = jobs && jobs.length ? jobs : [...JOBS, ...(App.state.customJobs || [])];
    const gaps = [];
    const recommendations = [];
    const singlePoints = [];

    allJobs.forEach(j => {
      const evaluationMap = new Map();
      pawns.forEach(p => {
        const pawnContext = contextMap && contextMap.get(p.id);
        const eligible = this._c7AnalyserEligible(p, j, pawnContext);
        evaluationMap.set(p.id, {
          eligible,
          projection: eligible ? this._c7AnalyserProjection(p, j, pawnContext) : null,
        });
      });

      const capable = pawns.filter(p => evaluationMap.get(p.id).eligible);
      if (capable.length === 0 && j.important) {
        gaps.push({ jobId: j.id, jobName: j.name, severity: 'critical', reason: `No pawn is capable of ${j.name}`, bestPawn: null });
        return;
      }

      const assigned = capable.filter(p => priorities[p.id]?.[j.id] != null);
      const atP1 = assigned.filter(p => priorities[p.id]?.[j.id] === 1);

      // Gap: important job with no assignment
      if (j.important && assigned.length === 0) {
        const best = this._bestPawnForJob(capable, j, contextMap, evaluationMap);
        gaps.push({ jobId: j.id, jobName: j.name, severity: 'critical', reason: `No pawn assigned to ${j.name}`, bestPawn: best });
      }
      // Gap: important job with no P1
      else if (j.important && atP1.length === 0 && assigned.length > 0) {
        const best = this._bestPawnForJob(capable, j, contextMap, evaluationMap);
        gaps.push({ jobId: j.id, jobName: j.name, severity: 'warning', reason: `${j.name} has no P1 assignment (best assigned at P${priorities[assigned[0].id][j.id]})`, bestPawn: best });
      }
      // Gap: skill-linked important job with low effective speed
      else if (j.important && j.skill && atP1.length > 0) {
        const bestSkill = Math.max(...atP1.map(p =>
          evaluationMap.get(p.id).projection.skill));
        const bestSpeed = Math.max(...atP1.map(p =>
          evaluationMap.get(p.id).projection.realSpeed));
        // Warn if real work speed is below 60% (slow worker) or raw skill < 4
        if (bestSpeed < 0.6 || bestSkill < 4) {
          const speedPct = (bestSpeed * 100).toFixed(0);
          // If the best candidate is already at P1 there is nothing to apply - a
          // "Set P1" button would be a no-op and the warning could never dismiss.
          // Keep the warning informational instead (no pawn = no button).
          let best = this._bestPawnForJob(capable, j, contextMap, evaluationMap);
          if (best && priorities[best.pawnId]?.[j.id] === 1) best = null;
          gaps.push({ jobId: j.id, jobName: j.name, severity: 'warning', reason: `Best ${j.name} pawn: skill ${bestSkill}, ${speedPct}% speed (recommend 80%+)${best ? '' : ' - a skill limitation, not an assignment problem'}`, bestPawn: best });
        }
      }

      // Single point of failure: only one pawn covers an important job
      if (j.important && assigned.length === 1) {
        singlePoints.push({ jobId: j.id, jobName: j.name, pawnName: assigned[0].nickname || assigned[0].name, pawnId: assigned[0].id });
      }

      // Recommendations: find best capable pawn who isn't assigned but should be
      if (j.skill && capable.length > 0) {
        const best = this._bestPawnForJob(capable, j, contextMap, evaluationMap);
        if (best) {
          const currentPrio = priorities[best.pawnId]?.[j.id];
          const speedPct = best.realSpeed ? (best.realSpeed * 100).toFixed(0) + '% speed' : '';
          // Recommend if best pawn isn't assigned or is at low priority and has decent speed
          if (j.important && (currentPrio === null || currentPrio > 2) && (best.realSpeed >= 0.6 || best.score >= 80)) {
            recommendations.push({
              jobId: j.id, jobName: j.name,
              pawnId: best.pawnId, pawnName: best.pawnName,
              skill: best.skill, passion: best.passion,
              reason: `Skill ${best.skill}${best.passion >= 2 ? ' + major passion' : best.passion >= 1 ? ' + minor passion' : ''}${speedPct ? ', ' + speedPct : ''}, currently ${currentPrio ? 'P'+currentPrio : 'unassigned'}`,
              suggestedPriority: (best.realSpeed >= 1.5) || best.skill >= 15 || (best.skill >= 10 && best.passion >= 2) ? 1 : 2
            });
          }
        }
      }
    });

    // Deduplicate recommendations - only keep one recommendation per pawn per job
    const seenRecs = new Set();
    const uniqueRecs = recommendations.filter(r => {
      const key = r.pawnId + ':' + r.jobId;
      if (seenRecs.has(key)) return false;
      seenRecs.add(key);
      return true;
    });

    return { gaps, recommendations: uniqueRecs, singlePoints };
  },

  _bestPawnForJob(capable, job, contextMap, evaluationMap) {
    if (capable.length === 0) return null;
    const ranked = capable.map(p => {
      const cached = evaluationMap && evaluationMap.get(p.id);
      const projection = cached && cached.projection
        ? cached.projection
        : this._c7AnalyserProjection(p, job, contextMap && contextMap.get(p.id));
      const { skill, passion, realSpeed, hasSkill } = projection;
      // Score combines real work speed (dominant) with passion for growth potential
      const score = (realSpeed * 100) + (passion * 25);
      return { pawnId: p.id, pawnName: p.nickname || p.name,
        skill, passion, score, realSpeed, hasSkill };
    }).sort((a, b) => b.score - a.score);
    return ranked[0];
  },

  calculateLoadoutProtection(items, ap = 0) {
    let state = { sharp100: 1.0, sharp50blunt: 0.0, blunt100: 0.0, blunt50: 0.0, blunt25: 0.0, zero: 0.0 };
    
    // Sort items by layer: Belt -> Outer -> Middle -> Skin
    const layerOrder = { belt: 0, outer: 1, middle: 2, skin: 3, utility: 0 };
    const quality = (item) => {
      const q = APPAREL_QUALITIES.find(qq => qq.id === (item.quality || 'normal')) || APPAREL_QUALITIES[2];
      return q.armorMult !== undefined ? q.armorMult : (q.mult || 1);
    };
    const sorted = [...items].sort((a, b) => {
      const aLayer = String(a.layer || '').toLowerCase();
      const bLayer = String(b.layer || '').toLowerCase();
      return (layerOrder[aLayer] ?? 99) - (layerOrder[bLayer] ?? 99);
    });

    sorted.forEach(item => {
      const mult = quality(item);
      const s = Math.max(0, Math.min(200, ((item.armorSharp ?? item.sharp ?? 0) * mult) * 100) - ap);
      const b = Math.max(0, Math.min(200, ((item.armorBlunt ?? item.blunt ?? 0) * mult) * 100) - ap);
      
      const dS = Math.min(1, s / 200);
      const mS = Math.min(1, s / 100) - dS;
      const pS = 1 - dS - mS;
      
      const dB = Math.min(1, b / 200);
      const mB = Math.min(1, b / 100) - dB;
      const pB = 1 - dB - mB;
      
      let next = { sharp100: 0, sharp50blunt: 0, blunt100: 0, blunt50: 0, blunt25: 0, zero: 0 };
      
      next.zero += state.sharp100 * dS;
      next.sharp50blunt += state.sharp100 * mS;
      next.sharp100 += state.sharp100 * pS;
      
      next.zero += state.sharp50blunt * dB;
      next.blunt25 += state.sharp50blunt * mB;
      next.sharp50blunt += state.sharp50blunt * pB;
      
      next.zero += state.blunt100 * dB;
      next.blunt50 += state.blunt100 * mB;
      next.blunt100 += state.blunt100 * pB;
      
      next.zero += state.blunt50 * dB;
      next.blunt25 += state.blunt50 * mB;
      next.blunt50 += state.blunt50 * pB;
      
      next.zero += state.blunt25 * dB;
      next.zero += state.blunt25 * mB; 
      next.blunt25 += state.blunt25 * pB;
      
      next.zero += state.zero;
      state = next;
    });

    return state;
  }
};

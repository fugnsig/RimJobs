/**
 * PAWN MANAGEMENT
 * Skills, traits, backstories, health, pawn CRUD, drag/drop, sort,
 * pawn manager modal, xeno details, custom jobs, precept updates.
 * Auto-split from app.js - methods are assigned onto the App object.
 */
Object.assign(App, {
  effectiveSkill(pawn, skillId) {
    if (!pawn || typeof pawn !== 'object') return 0;
    // Coerce - a corrupt/partial pawn may have no skills map or a non-numeric value.
    const base = Number(pawn.skills && pawn.skills[skillId]) || 0;
    const xeno = this.getXeno(pawn.xenotype);
    const xenoMod = (xeno.skillMods && xeno.skillMods[skillId]) || 0;
    // Gene skill mods, sum skill offsets from all genes on the xenotype
    let geneMod = 0;
    if (xeno.genes && xeno.genes.length > 0) {
      xeno.genes.forEach(gId => {
        const gene = this._resolveGeneDef(gId);
        if (gene && gene.skillMods && gene.skillMods[skillId]) geneMod += gene.skillMods[skillId];
      });
    }
    let traitMod = 0;
    if (pawn.traits) {
      pawn.traits.forEach(tId => {
        const tDef = this.getTrait(tId);
        if (tDef && tDef.skillMods?.[skillId]) traitMod += tDef.skillMods[skillId];
      });
    }
    // Backstory skill bonuses
    let backstoryMod = 0;
    const cbs = this._resolveBackstory(pawn.childhood);
    if (cbs && cbs.skills[skillId]) backstoryMod += cbs.skills[skillId];
    const abs = this._resolveBackstory(pawn.adulthood);
    if (abs && abs.skills[skillId]) backstoryMod += abs.skills[skillId];
    const role = this.getRole(pawn.role || 'none');
    const roleMod = (role.skillMods && role.skillMods[skillId]) || 0;
    // Ideology effects on skills
    const ideoFx = this.getIdeoEffects();
    let ideoMod = 0;
    if (skillId === 'shoot' || skillId === 'melee') ideoMod += ideoFx.combatSkill || 0;
    if (skillId === 'social') ideoMod += ideoFx.socialSkill || 0;
    if (skillId === 'intellectual') ideoMod += ideoFx.researchSpeed || 0;
    // Legacy settings precept (combat_focus) still stacks if user set it
    if (skillId === 'shoot' || skillId === 'melee') ideoMod += (this.state.precepts && this.state.precepts['combat_focus']) || 0;
    const sum = base + xenoMod + geneMod + traitMod + backstoryMod + roleMod + ideoMod;
    return Number.isFinite(sum) ? Math.max(0, Math.min(20, sum)) : 0;
  },

  _c5SkillProjection(pawnCtx, requestedSkillId) {
    const c5Context = pawnCtx && pawnCtx.c5Context;
    const policies = c5Context && c5Context.effectivenessSnapshot
      && c5Context.effectivenessSnapshot.skillPolicies || {};
    let matches = [];
    if (policies[requestedSkillId]) {
      matches = [requestedSkillId];
    } else {
      matches = Object.keys(policies).filter(skillDefId =>
        policies[skillDefId] && policies[skillDefId].appSkillId === requestedSkillId);
    }
    const reason = matches.length > 1 ? 'ambiguousSkillDefProjection'
      : matches.length === 0 ? 'unregisteredSkillDefProjection' : null;
    if (reason) {
      return {
        level: null, source: 'unknown', skillDefId: null, state: 'unknown',
        completeness: 'unknown', precision: 'approximate', unresolved: [], reason,
        fact: null,
      };
    }
    const skillDefId = matches[0];
    const fact = StructuralSkillResolver.resolve(c5Context, skillDefId);
    const uiLevel = Number.isFinite(fact.runtimeGetLevelForUIProjection)
      ? fact.runtimeGetLevelForUIProjection : null;
    const runtimeLevel = Number.isFinite(fact.runtimeGetLevelProjection)
      ? fact.runtimeGetLevelProjection : null;
    const level = uiLevel == null ? runtimeLevel : uiLevel;
    return {
      level,
      source: level == null ? 'unknown' : 'c5',
      skillDefId,
      state: fact.state || 'unknown',
      completeness: fact.completeness || 'unknown',
      precision: fact.storedLevelInt && fact.storedLevelInt.state === 'known'
        ? null : 'approximate',
      unresolved: Array.isArray(fact.unresolved) ? fact.unresolved : [],
      reason: level == null ? 'canonicalSkillProjectionUnknown' : null,
      fact,
    };
  },

  _c5SkillProjectionNotice(projection) {
    if (projection && projection.level != null
        && projection.completeness === 'complete') return '';
    const state = projection && projection.completeness || 'unknown';
    const reason = projection && projection.reason;
    if (reason === 'ambiguousSkillDefProjection') {
      return 'Canonical C5 skill evidence is ambiguous across multiple SkillDefs; '
        + 'showing the legacy-compatible value.';
    }
    if (projection && projection.level != null) {
      return 'Canonical C5 skill evidence is ' + state
        + '; displaying the available canonical projection.';
    }
    return 'Canonical C5 skill evidence is ' + state
      + '; showing the legacy-compatible value.';
  },

  _c5SkillDisplay(pawn, pawnCtx, requestedSkillId) {
    const projection = this._c5SkillProjection(pawnCtx, requestedSkillId);
    if (projection.level != null) {
      return Object.assign({}, projection, {
        fallbackUsed: false,
        notice: this._c5SkillProjectionNotice(projection),
      });
    }
    return Object.assign({}, projection, {
      level: this.effectiveSkill(pawn, requestedSkillId),
      fallbackUsed: true,
      notice: this._c5SkillProjectionNotice(projection),
    });
  },

  _c5StatProjection(pawnCtx, statDefId) {
    const c5Context = pawnCtx && pawnCtx.c5Context;
    if (!c5Context) {
      return {
        value: null, source: 'unknown', statDefId, state: 'unknown',
        completeness: 'unknown', precision: [], unresolved: [],
        notice: 'Canonical C5 stat evidence is unknown; showing the legacy-compatible value.',
        fact: null,
      };
    }
    const fact = StructuralStatResolver.resolve(c5Context, statDefId);
    const precision = Array.isArray(fact.precision) ? fact.precision : [];
    const usable = !fact.frontier && Number.isFinite(fact.resolvedPrefixValue);
    const notices = [];
    if (precision.length) {
      const inputs = precision.map(item => item.capacityDefId + ' '
        + item.roundedValue + ' at ' + (item.roundingIncrement || 0.01)).join(', ');
      notices.push('Precision: exact against rounded C3 capacity input (' + inputs
        + '); not bit-exact against unrounded runtime capacity.');
    }
    if (!usable || (fact.completeness !== 'complete' && !precision.length)) {
      notices.push('Canonical C5 stat evidence is ' + (fact.completeness || 'unknown')
        + (usable ? '.' : '; showing the legacy-compatible value.'));
    }
    return {
      value: usable ? fact.resolvedPrefixValue : null,
      source: usable ? 'c5' : 'unknown',
      statDefId,
      state: fact.state || 'unknown',
      completeness: fact.completeness || 'unknown',
      precision,
      unresolved: Array.isArray(fact.unresolved) ? fact.unresolved : [],
      notice: notices.join(' '),
      fact,
    };
  },

  _c5WorkSpeedDisplay(pawn, pawnCtx) {
    const projection = this._c5StatProjection(pawnCtx, 'WorkSpeedGlobal');
    if (projection.value != null) {
      return Object.assign({}, projection, { fallbackUsed: false });
    }
    return Object.assign({}, projection, {
      value: Engine.calculateWorkSpeedMod(pawn), fallbackUsed: true,
    });
  },

  _c5UpdateRawSkillLevel(pawn, appSkillId, level) {
    const records = pawn && pawn.rawSkillRecords;
    if (!records || typeof records !== 'object') return false;
    const matches = Object.values(records).filter(record => record
      && record.appSkillId === appSkillId);
    if (matches.length !== 1) return false;
    const record = matches[0];
    record.recordPresence = 'present';
    record.levelFieldPresent = true;
    record.levelState = 'known';
    record.levelInt = level;
    record.provenance = Object.assign({}, record.provenance || {}, {
      editedByRimJobs: true,
    });
    return true;
  },

  isIncapable(pawn, job) {
    // Downed (from save import): the pawn is incapacitated in bed - a wound, missing
    // organ or modded part (e.g. an android awaiting a reactor) keeps them down for an
    // unknowable time, so NO job can be assigned until they are back up or the user
    // clears the flag manually.
    if (pawn.downed) return true;
    // Biotech age gates: children can only take certain jobs at certain ages
    // (verified against Races_Humanlike.xml lifeStageWorkSettings - see JOB_MIN_AGE).
    if (job && typeof JOB_MIN_AGE !== 'undefined' && JOB_MIN_AGE[job.id] != null &&
        pawn.bioAge != null && pawn.bioAge < JOB_MIN_AGE[job.id]) return true;
    // Capacity-based: a pawn with zero Manipulation cannot do the manipulation-gated
    // work columns, exactly as the in-game work tab greys them (verified against
    // WorkGivers.xml - see MANIPULATION_GATED_JOBS). Runs first so it covers gated jobs
    // whether or not they also carry incapBlocks.
    if (job && typeof MANIPULATION_GATED_JOBS !== 'undefined' && MANIPULATION_GATED_JOBS.includes(job.id) && this._manipulationLost(pawn)) return true;
    if (!job.incapBlocks) return false;
    const xeno = this.getXeno(pawn.xenotype);
    const xenoIncap = xeno.incapable || [];
    // Gene-based incapabilities
    let geneIncap = [];
    if (xeno.genes && xeno.genes.length > 0) {
      xeno.genes.forEach(gId => {
        const gene = this._resolveGeneDef(gId);
        if (gene && gene.incapable) geneIncap.push(...gene.incapable);
      });
    }
    const role = this.getRole(pawn.role || 'none');
    const roleIncap = role.incap || [];
    // Trait-based incapabilities (Pyromaniac disables Firefighting; modded traits via disabledWorkTags)
    let traitIncap = [];
    if (Array.isArray(pawn.traits)) {
      pawn.traits.forEach(tId => {
        const t = this.getTrait(tId);
        if (t && t.incapable) traitIncap.push(...t.incapable);
      });
    }
    // Backstory-derived incapabilities
    let bsIncap = [];
    const cbs = this._resolveBackstory(pawn.childhood);
    if (cbs) bsIncap.push(...cbs.incapable);
    const abs = this._resolveBackstory(pawn.adulthood);
    if (abs) bsIncap.push(...abs.incapable);
    // Health-derived incapabilities: modded injuries/implants whose hediff declares
    // <disabledWorkTags> (scanned offline from the install's HediffDef XML). Only the
    // pawn's CURRENT stage applies, picked by severity (see _hediffActiveIncaps).
    const hediffIncap = this._hediffActiveIncaps(pawn.health);
    const allIncap = [...new Set([...pawn.incapable, ...xenoIncap, ...geneIncap, ...roleIncap, ...traitIncap, ...bsIncap, ...hediffIncap])];
    return job.incapBlocks.some(b => allIncap.includes(b));
  },

  // Incap ids a pawn's conditions disable RIGHT NOW: for each hediff with stage-level
  // disabledWorkTags, pick the current stage (highest minSeverity <= the pawn's severity,
  // mirroring hediff.CurStage) and return only that stage's disabled work. A mild-stage
  // pawn is not blocked by a tag that only appears in a worse stage.
  _hediffActiveIncaps(healthArr) {
    if (!Array.isArray(healthArr) || !healthArr.length) return [];
    const map = this._hediffDisableMap();
    if (!map || !Object.keys(map).length) return [];
    const out = [];
    healthArr.forEach(hi => {
      const stages = hi && hi.def && map[hi.def];
      if (!stages || !stages.length) return;
      const sev = (hi.severity != null && isFinite(hi.severity)) ? hi.severity : 0;
      let cur = null;
      for (const st of stages) { if (st.min <= sev) cur = st; else break; } // stages sorted ascending
      if (cur && cur.work && cur.work.length) out.push(...cur.work);
    });
    return out;
  },

  // Memoised map of hediff defName -> [{min, work}] stages for conditions that declare
  // disabledWorkTags, built from the scanned health catalogue. Rebuilt only when the
  // catalogue reference changes, so isIncapable stays cheap across the whole table.
  // Older catalogues (pre stage-aware scan) simply yield nothing until the next scan.
  _hediffDisableMap() {
    const cat = Array.isArray(this.state.hediffCatalog) ? this.state.hediffCatalog : [];
    if (this._hdmCacheSrc !== cat) {
      const m = {};
      cat.forEach(e => { if (e && e.def && Array.isArray(e.disabledWorkStages) && e.disabledWorkStages.length) m[e.def] = e.disabledWorkStages; });
      this._hdmCache = m;
      this._hdmCacheSrc = cat;
    }
    return this._hdmCache;
  },

  // Manually flip the imported "downed" flag. The save can't say how long a pawn stays
  // incapacitated (e.g. a modded android awaiting a reactor replacement), so the user
  // can clear it once the pawn is back up - or set it - without a re-import.
  togglePawnDowned(pid) {
    const p = this.state.pawns.find(x => x.id === pid);
    if (!p) return;
    p.downed = !p.downed;
    this.renderAll();
    this.toast(p.downed ? 'Marked as downed - no jobs can be assigned.' : 'Downed cleared - jobs can be assigned again.');
    this.triggerAutoSave();
  },

  // True when the pawn has zero Manipulation: both arms/hands gone or destroyed with no
  // prosthetic restoring either side. Mirrors the in-game work tab - one working arm (or
  // any manipulation prosthetic) keeps Manipulation > 0, so only a TOTAL loss disables
  // the manipulation-gated columns. One missing arm reduces speed, not capability.
  // Returns false when the pawn carries no imported body-part health data.
  _manipulationLost(pawn) {
    const h = pawn && pawn.health;
    if (!Array.isArray(h) || !h.length) return false;
    if (typeof HUMAN_BODY_PARENT === 'undefined') return false;
    const protEff = this.state.prostheticEfficiency || {};
    // Same prosthetic-detection rule used by _filteredHealth: a replaced/implant part or
    // a def that reads/scans like an added part counts as restoring the limb.
    const isProstheticDef = (def) => !!def && (protEff[def] != null ||
      /bionic|archotech|prosthe|peg ?leg|woodenfoot|woodenhand|denture|implant|cybernetic|drone|field ?hand|powerclaw/i.test(String(def)));
    const covered = new Set();
    const missing = new Set();
    h.forEach(hi => {
      if (hi.partIdx == null || hi.partIdx < 0) return;
      if (hi.type === 'replaced' || hi.type === 'implant' || isProstheticDef(hi.def)) covered.add(hi.partIdx);
      if (hi.type === 'missing') missing.add(hi.partIdx);
    });
    const hasAncestorIn = (idx, set) => {
      let cur = HUMAN_BODY_PARENT[idx];
      while (cur >= 0) { if (set.has(cur)) return true; cur = HUMAN_BODY_PARENT[cur]; }
      return false;
    };
    // Left hand = 28, right hand = 39 in HUMAN_BODY_INDEX. A side provides manipulation
    // unless its hand is gone (directly or via a missing arm/shoulder ancestor) with
    // nothing prosthetic covering the limb.
    const sideWorks = (handIdx) => {
      if (covered.has(handIdx) || hasAncestorIn(handIdx, covered)) return true;
      return !(missing.has(handIdx) || hasAncestorIn(handIdx, missing));
    };
    return !sideWorks(28) && !sideWorks(39);
  },

  // Resolve a gene id (as stored on a xenotype's genes list) to its definition. Xenotype
  // genes are raw defNames (e.g. "AptitudeTerrible_Animals", "SomeMod_Pacifist"), but scanned
  // modded genes are keyed 'mod_gene_' + sanitised defName, so we try the curated GENES list
  // first, then customGenes by id, then by the normalised modded key. Returns null if unknown.
  _resolveGeneDef(gId) {
    if (!gId) return null;
    const custom = this.state.customGenes || {};
    return (typeof GENES !== 'undefined' && GENES.find(g => g.id === gId))
      || custom[gId]
      || (typeof _sanId === 'function' ? custom['mod_gene_' + _sanId(gId)] : null)
      || null;
  },

  // Resolve a backstory ID to { skills, incapable, title, ... } -checks vanilla BACKSTORIES first, then custom
  _resolveBackstory(id) {
    if (!id) return null;
    // Try vanilla lookup via data.js helper
    const vanilla = resolveBackstory(id);
    if (vanilla) return vanilla;
    // Try custom backstories (imported from modded saves)
    const custom = this.state.customBackstories && this.state.customBackstories[id];
    if (custom) return custom;
    return null;
  },

  // Get all backstories for a given slot ('child' or 'adult'), including custom
  _bsCache: null, // { child: [...], adult: [...] }

  _invalidateBsCache() { this._bsCache = null; },

  _getBackstoriesForSlot(slot) {
    if (!this._bsCache) {
      this._bsCache = {};
      for (const s of ['child', 'adult']) {
        const vanilla = BACKSTORIES.filter(b => b.slot === s).map(b => {
          const resolved = resolveBackstory(b.id);
          return { id: b.id, title: b.title, titleShort: b.titleShort, ...resolved };
        });
        const custom = Object.entries(this.state.customBackstories || {})
          .filter(([, bs]) => bs.slot === s)
          .map(([id, bs]) => ({ id, ...bs }));
        this._bsCache[s] = [...vanilla, ...custom].sort((a, b) => (a.title || a.id).localeCompare(b.title || b.id));
      }
    }
    return this._bsCache[slot === 'childhood' ? 'child' : slot === 'adulthood' ? 'adult' : slot];
  },

  setBackstory(pawnId, slot, value) {
    const p = this.state.pawns.find(p => p.id === pawnId);
    if (!p) return;
    if (slot === 'childhood') p.childhood = value;
    else if (slot === 'adulthood') p.adulthood = value;
    this.renderAll();
    this.triggerAutoSave();
  },

  // Lightweight backstory picker modal (replaces heavy <select> with ~670 options per dropdown)
  openBackstoryPicker(pawnId, slot) {
    const p = this.state.pawns.find(p => p.id === pawnId);
    if (!p) return;
    const dataSlot = slot === 'childhood' ? 'child' : 'adult';
    const list = this._getBackstoriesForSlot(dataSlot);
    const currentId = slot === 'childhood' ? p.childhood : p.adulthood;

    // Build modal
    let overlay = document.getElementById('bsPickerOverlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'bsPickerOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    const modal = document.createElement('div');
    modal.style.cssText = 'background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-lg);width:min(480px,92vw);max-height:78vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.4)';

    const header = document.createElement('div');
    header.style.cssText = 'padding:8px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px';
    const hTitle = (slot === 'childhood' ? 'Childhood' : 'Adulthood') + ' - ' + (p.nickname || p.name || '');
    header.innerHTML = '<span style="flex:1;min-width:0;font-size:var(--f-sm);font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _escapeHtml(hTitle) + '</span>'
      + '<button class="btn btn-sm" style="flex-shrink:0" onclick="App.scanBackstoryStories(\'' + pawnId + '\',\'' + slot + '\')" title="Scan your RimWorld install (vanilla, DLC &amp; mods) for backstory stories">⟳ Scan install</button>';

    const searchBox = document.createElement('input');
    searchBox.type = 'text';
    searchBox.placeholder = 'Search backstories...';
    searchBox.style.cssText = 'margin:8px 12px;padding:6px 8px;font-size:var(--f-xs);background:var(--surface3);color:var(--text);border:1px solid var(--border-med);border-radius:var(--radius-sm);outline:none';

    const listEl = document.createElement('div');
    listEl.style.cssText = 'flex:1;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--border-bright) transparent;padding:4px 0';

    const stories = this.state.backstoryStories || {};
    const storiesByTitle = this.state.backstoryStoriesByTitle || {};
    // Raw story for a backstory: prefer its own desc, then a defName match, then a
    // title match (the baked vanilla list uses legacy ids), then personalise to p.
    const rawStoryOf = (bs) => bs.desc || stories[bs.id] || storiesByTitle[(bs.title || '').toLowerCase()] || '';
    const storyOf = (bs) => { const raw = rawStoryOf(bs); return raw ? this._personalizeBackstory(raw, p) : ''; };
    const skillStr = (bs) => Object.entries(bs.skills || {})
      .map(([k, v]) => { const sh = (typeof SKILLS !== 'undefined' ? (SKILLS.find(s => s.id === k) || {}).short : null) || k; return sh + ' ' + (v > 0 ? '+' : '') + v; })
      .join('  ');
    const incapStr = (bs) => (bs.incapable && bs.incapable.length) ? 'Disabled: ' + bs.incapable.join(', ') : '';
    const anyStories = list.some(bs => storyOf(bs));

    const renderList = (filter) => {
      const q = (filter || '').toLowerCase();
      const filtered = q ? list.filter(bs => bs.title.toLowerCase().includes(q) || bs.id.toLowerCase().includes(q) || storyOf(bs).toLowerCase().includes(q)) : list;
      let html = '<div style="padding:2px 12px"><button style="width:100%;text-align:left;padding:6px 8px;background:'+(currentId?'transparent':'var(--accent-glow)')+';color:var(--text2);border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;font-size:var(--f-xs);margin-bottom:2px" data-bs-id="">None</button></div>';
      for (const bs of filtered) {
        const isSel = bs.id === currentId;
        const story = storyOf(bs);
        const sk = skillStr(bs);
        const incap = incapStr(bs);
        const metaBits = [];
        if (sk) metaBits.push('<span style="color:var(--accent)">'+_escapeHtml(sk)+'</span>');
        if (incap) metaBits.push('<span style="color:var(--p4-txt)">'+_escapeHtml(incap)+'</span>');
        html += '<div style="padding:2px 12px">'
          + '<button data-bs-id="'+bs.id+'" style="width:100%;text-align:left;padding:7px 9px;background:'+(isSel?'var(--accent-glow)':'transparent')+';border:1px solid '+(isSel?'var(--accent)':'var(--border)')+';border-radius:var(--radius-sm);cursor:pointer;display:block">'
          + '<div style="font-weight:700;font-size:var(--f-xs);color:'+(isSel?'var(--accent)':'var(--text)')+'">'+_escapeHtml(bs.title)+(bs.modSource?' <span style="opacity:0.55;font-weight:400">('+_escapeHtml(bs.modSource)+')</span>':'')+'</div>'
          + (metaBits.length ? '<div style="font-size:calc(var(--f-xs) * 0.92);margin-top:2px">'+metaBits.join('  ·  ')+'</div>' : '')
          + (story ? '<div style="font-size:calc(var(--f-xs) * 0.92);color:var(--text3);margin-top:3px;line-height:1.35;white-space:normal;user-select:text;-webkit-user-select:text;cursor:text">'+_escapeHtml(story)+'</div>' : '')
          + '</button></div>';
      }
      if (filtered.length === 0) html = '<div style="padding:12px;text-align:center;color:var(--text3);font-size:var(--f-xs)">No matches</div>';
      listEl.innerHTML = html;
    };

    // If no story text is loaded yet, offer a one-click scan of the install.
    if (!anyStories) {
      const banner = document.createElement('div');
      banner.style.cssText = 'margin:0 12px 6px;padding:8px 10px;background:var(--surface3);border:1px solid var(--border-med);border-radius:var(--radius-sm);font-size:var(--f-xs);color:var(--text2);display:flex;align-items:center;gap:8px;flex-wrap:wrap';
      banner.innerHTML = '<span style="flex:1;min-width:120px">Backstory stories aren’t loaded yet - scan your RimWorld install (vanilla, DLC &amp; mods) to read them here.</span>';
      const sbtn = document.createElement('button');
      sbtn.className = 'btn btn-sm';
      sbtn.textContent = 'Scan install';
      sbtn.onclick = () => this.scanBackstoryStories(pawnId, slot);
      banner.appendChild(sbtn);
      modal.appendChild(header);
      modal.appendChild(banner);
      modal.appendChild(searchBox);
      modal.appendChild(listEl);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      searchBox.oninput = () => renderList(searchBox.value);
      renderList('');
      listEl.onclick = (e) => {
        // Don't treat finishing a text selection (to copy a story) as a pick.
        if (window.getSelection && String(window.getSelection()).length) return;
        const btn = e.target.closest('[data-bs-id]');
        if (!btn) return;
        this.setBackstory(pawnId, slot, btn.dataset.bsId);
        overlay.remove();
      };
      searchBox.focus();
      return;
    }

    searchBox.oninput = () => renderList(searchBox.value);
    renderList('');

    listEl.onclick = (e) => {
      // Don't treat finishing a text selection (to copy a story) as a pick.
      if (window.getSelection && String(window.getSelection()).length) return;
      const btn = e.target.closest('[data-bs-id]');
      if (!btn) return;
      const id = btn.dataset.bsId;
      this.setBackstory(pawnId, slot, id);
      overlay.remove();
    };

    modal.appendChild(header);
    modal.appendChild(searchBox);
    modal.appendChild(listEl);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    searchBox.focus();
  },

  // Scan the RimWorld install for backstory stories (and traits/genes) then
  // reopen the picker so the freshly-loaded stories appear.
  async scanBackstoryStories(pawnId, slot) {
    if (typeof this._mergeScannedTraitsGenes !== 'function' || typeof this._resolveRimworldPath !== 'function') return;
    try {
      const dirPath = await this._resolveRimworldPath();
      if (!dirPath) return;
      // Close the picker first so the scan progress modal isn't hidden behind it.
      const ov = document.getElementById('bsPickerOverlay');
      if (ov) ov.remove();
      await this._mergeScannedTraitsGenes(dirPath);
      this._invalidateBsCache();
      // Don't reopen the picker / re-render over the user if they wandered off and
      // started editing something while the scan ran. Stories are saved to state.
      if (!this._isUserTyping || !this._isUserTyping()) {
        this.renderAll();
        this.openBackstoryPicker(pawnId, slot);
      }
    } catch (_) { /* ignore */ }
  },

  // Replace RimWorld [PAWN_*] grammar tokens in a backstory with the selected
  // pawn's name and gendered pronouns, so it reads "Maria was..." not "They was...".
  _personalizeBackstory(raw, pawn) {
    let s = String(raw || '').replace(/\\n/g, '\n');
    if (!s) return '';
    const name = (pawn && (pawn.nickname || pawn.firstName || pawn.name)) || 'They';
    const g = pawn && pawn.gender ? String(pawn.gender).toLowerCase() : '';
    const subj = g === 'female' ? 'she' : g === 'male' ? 'he' : 'they';
    const obj  = g === 'female' ? 'her' : g === 'male' ? 'him' : 'them';
    const poss = g === 'female' ? 'her' : g === 'male' ? 'his' : 'their';
    const refl = g === 'female' ? 'herself' : g === 'male' ? 'himself' : 'themselves';
    s = s
      .replace(/\[PAWN_nameDef\]|\[PAWN_nameFull\]|\[PAWN_label\]|\[PAWN_name\]/g, name)
      .replace(/\[PAWN_pronoun\]/g, subj)
      .replace(/\[PAWN_possessive\]/g, poss)
      .replace(/\[PAWN_objective\]/g, obj)
      .replace(/\[PAWN_reflexive\]/g, refl)
      .replace(/\[[^\]]*\]/g, '')           // drop any remaining tokens
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
    // Capitalise a pronoun that starts a sentence.
    s = s.replace(/(^|[.!?]\s+|\n\s*)(he|she|they)\b/g, (m, p, w) => p + w.charAt(0).toUpperCase() + w.slice(1));
    return s;
  },

  // Filter health entries: collapse children of missing parts, suppress "missing" when prosthetic is installed
  _filteredHealth(pawn) {
    const h = pawn.health;
    if (!h || !h.length) return [];
    const protEff = this.state.prostheticEfficiency || {};
    // A hediff is a prosthetic/added-part (vanilla OR modded) if it's classed as a
    // replaced/implant part, its def is a scanned added-part, or its def name reads
    // like one. Used so a part fitted with a prosthetic isn't reported "missing".
    const isProstheticDef = (def) => !!def && (protEff[def] != null ||
      /bionic|archotech|prosthe|peg ?leg|woodenfoot|woodenhand|denture|implant|cybernetic|drone|field ?hand|powerclaw/i.test(String(def)));
    // Parts "covered" by a prosthetic, and parts that are missing.
    const coveredParts = new Set();
    const missingParts = new Set();
    h.forEach(hi => {
      if (hi.partIdx == null || hi.partIdx < 0) return;
      if (hi.type === 'replaced' || hi.type === 'implant' || isProstheticDef(hi.def)) coveredParts.add(hi.partIdx);
      if (hi.type === 'missing') missingParts.add(hi.partIdx);
    });

    // Does any ANCESTOR of this part fall in the given set?
    const hasAncestorIn = (idx, set) => {
      if (typeof HUMAN_BODY_PARENT === 'undefined') return false;
      let cur = HUMAN_BODY_PARENT[idx];
      while (cur >= 0) {
        if (set.has(cur)) return true;
        cur = HUMAN_BODY_PARENT[cur];
      }
      return false;
    };

    return h.filter(hi => {
      // Hide hediffs the game itself hides: utility/flag conditions whose current stage
      // sets becomeVisible=false (e.g. mods applying silent thought-suppression hediffs).
      if (this._hediffHiddenNow(hi)) return false;
      if (hi.partIdx == null || hi.partIdx < 0) return true; // no part index → always show
      // Hide "missing" on a part that's been fitted with a prosthetic/implant.
      if (hi.type === 'missing' && coveredParts.has(hi.partIdx)) return false;
      // Hide child "missing" entries when an ancestor is missing OR replaced by a
      // prosthetic - e.g. a prosthetic left leg subsumes its femur/tibia/foot/toes,
      // so we don't list "missing femur, tibia, foot".
      if (hi.type === 'missing' && (hasAncestorIn(hi.partIdx, missingParts) || hasAncestorIn(hi.partIdx, coveredParts))) return false;
      return true;
    });
  },

  // True when this imported hediff is invisible at its current severity, mirroring
  // Hediff.Visible (CurStage.becomeVisible). Map memoised against the scanned catalogue.
  _hediffHiddenNow(hi) {
    if (!hi || !hi.def) return false;
    const cat = Array.isArray(this.state.hediffCatalog) ? this.state.hediffCatalog : [];
    if (this._hhmCacheSrc !== cat) {
      const m = {};
      cat.forEach(e => { if (e && e.def && Array.isArray(e.hiddenStages) && e.hiddenStages.length) m[e.def] = e.hiddenStages; });
      this._hhmCache = m;
      this._hhmCacheSrc = cat;
    }
    const stages = this._hhmCache[hi.def];
    if (!stages) return false;
    const sev = (hi.severity != null && isFinite(hi.severity)) ? hi.severity : 0;
    let cur = null;
    for (const st of stages) { if (st.min <= sev) cur = st; else break; } // sorted ascending
    return !!(cur && cur.hidden);
  },

  // Look up a prosthetic/implant part efficiency by hediff defName (scanned first,
  // then the baked vanilla fallback). null = unknown.
  _prostheticEfficiency(def) {
    const scanned = this.state.prostheticEfficiency && this.state.prostheticEfficiency[def];
    if (scanned && Number.isFinite(scanned.efficiency)) return scanned.efficiency;
    if (typeof VANILLA_PROSTHETIC_EFFICIENCY !== 'undefined' && VANILLA_PROSTHETIC_EFFICIENCY[def] != null) return VANILLA_PROSTHETIC_EFFICIENCY[def];
    return null;
  },

  // Approximate health/efficiency of a body part from its hediffs.
  _partStatus(pawn, partIdx, partName) {
    const maxHp = (typeof bodyPartMaxHP === 'function') ? bodyPartMaxHP(partName) : 0;
    const onPart = (pawn.health || []).filter(h => h.partIdx === partIdx && partIdx >= 0);
    const missing = onPart.some(h => h.type === 'missing');
    const replaced = onPart.find(h => h.type === 'replaced' || h.type === 'implant');
    if (missing) return { maxHp, hp: 0, efficiency: 0, missing: true, replaced: false };
    if (replaced) return { maxHp, hp: maxHp, efficiency: this._prostheticEfficiency(replaced.def), missing: false, replaced: true };
    const dmg = onPart.filter(h => h.type === 'injury' && !h.permanent).reduce((s, h) => s + (h.severity || 0), 0);
    const scar = onPart.filter(h => h.type === 'injury' && h.permanent).reduce((s, h) => s + (h.severity || 0), 0);
    const hp = maxHp > 0 ? Math.max(0, Math.round(maxHp - dmg)) : 0;
    const efficiency = maxHp > 0 ? Math.max(0, (maxHp - dmg - scar * 0.5) / maxHp) : null;
    return { maxHp, hp, efficiency, missing: false, replaced: false };
  },

  // Build the "· Health x/y · Efficiency z%" tooltip suffix for a part.
  _partTip(pawn, hi) {
    if (hi.partIdx == null || hi.partIdx < 0) return '';
    const st = this._partStatus(pawn, hi.partIdx, hi.part);
    const bits = [];
    if (st.missing) bits.push('Health 0/' + (st.maxHp || '?'));
    else if (st.maxHp > 0) bits.push('Health ' + st.hp + '/' + st.maxHp);
    if (st.efficiency != null) bits.push('Efficiency ' + Math.round(st.efficiency * 100) + '%');
    return bits.length ? ' · ' + bits.join(' · ') : '';
  },

  // Render a compact health summary for a pawn (read-only, from save import).
  // Fresh injuries show with blood; scars show healed; prosthetics show their
  // efficiency % (green when boosted past 100%). Tooltip = part health + efficiency.
  _renderHealthSummary(pawn) {
    const filtered = this._filteredHealth(pawn);
    if (!filtered.length && !pawn.downed) return '';

    const grouped = {};
    filtered.forEach(hi => { (grouped[hi.type] = grouped[hi.type] || []).push(hi); });
    const order = ['missing', 'replaced', 'implant', 'injury', 'condition'];
    let html = '';
    // Downed (from save import): every job is blocked until they recover. The save
    // can't say how long that takes (could be a modded part awaiting replacement),
    // so the chip is clickable to clear the flag by hand once they are back up.
    if (pawn.downed) {
      html += `<span onclick="App.togglePawnDowned('${pawn.id}')" style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;background:var(--warn-bg);border:1px solid var(--p4-border);border-radius:4px;font-size:var(--f-xs);color:var(--warn-txt);font-weight:700;cursor:pointer" title="Downed in the imported save - incapacitated in bed, so no jobs can be assigned. Re-importing the save refreshes this; click to clear it manually if they are back on their feet.">⚠ Downed - no jobs</span>`;
    }
    // Flag a total loss of Manipulation - it greys the manual-work columns in the table,
    // so surface the reason here too.
    if (this._manipulationLost(pawn)) {
      html += `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;background:var(--warn-bg);border:1px solid var(--p4-border);border-radius:4px;font-size:var(--f-xs);color:var(--warn-txt);font-weight:600" title="No working arm or hand: Manipulation is 0, so manual-work columns (construction, mining, cooking, hauling, etc.) are disabled - exactly as in the in-game work tab.">⚠ No manipulation</span>`;
    }
    for (const type of order) {
      const items = grouped[type];
      if (!items) continue;
      items.forEach(hi => {
        const label = this._defLabelOrHumanize(hi.def);
        const part = hi.part || '';
        const isScar = type === 'injury' && hi.permanent;
        let icon, color, suffix = '', extra = '';

        if (type === 'missing') { icon = '○'; color = 'var(--p4-txt)'; }
        else if (type === 'replaced' || type === 'implant') {
          icon = type === 'implant' ? '◇' : '◆';
          const eff = this._prostheticEfficiency(hi.def);
          if (eff != null) {
            const pct = Math.round(eff * 100);
            color = eff > 1 ? 'var(--ok-txt)' : eff < 1 ? 'var(--p3-txt)' : 'var(--accent)';
            extra = ` <strong style="color:${color}">${pct}%</strong>`;
          } else { color = 'var(--accent)'; }
        }
        else if (type === 'injury') {
          if (isScar) { icon = '~'; color = 'var(--text2)'; suffix = ' <span style="opacity:0.65">(scar)</span>'; }
          else { icon = '●'; color = 'var(--p4-txt)'; }
        }
        else { icon = '+'; color = 'var(--text3)'; }

        const tip = (type.charAt(0).toUpperCase() + type.slice(1)) + (isScar ? ' (scar)' : '') + (part ? ': ' + part : '') + this._partTip(pawn, hi);
        html += `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;background:var(--surface3);border:1px solid var(--border-med);border-radius:4px;font-size:var(--f-xs);color:${color}" title="${_escapeHtml(tip)}">${icon} ${_escapeHtml(label)}${extra}${suffix}${part ? ' <span style="opacity:0.6">(' + _escapeHtml(part) + ')</span>' : ''}</span>`;
      });
    }
    return html;
  },

  // -- CORE ACTIONS --
  async importPawnFromClipboard() {
    try {
      let text = '';
      if (window.overlay && window.overlay.clipboardRead) {
        text = window.overlay.clipboardRead();
      } else if (navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText();
      } else {
        this.toast('Clipboard not available in this context.'); return;
      }
      if (!text) { this.toast(' Clipboard is empty!'); return; }

      // Multi-pawn share: { _rimjobsPawns: true, pawns: [ {pawn, priorities}, ... ] }
      // from Share All. Import every pawn, respecting the pawn cap.
      let multi = null;
      try { const j = JSON.parse(text.trim()); if (j && j._rimjobsPawns && Array.isArray(j.pawns)) multi = j.pawns; } catch (_) { /* not the multi envelope */ }
      if (multi) {
        let added = 0, capped = false;
        for (const entry of multi) {
          const env = (entry && entry.pawn) ? entry : { pawn: entry };
          if (!env.pawn) continue;
          const pawn = this.parsePawnText(JSON.stringify({ _rimjobsPawn: true, version: 1, pawn: env.pawn, priorities: env.priorities || {} }));
          if (!pawn) continue;
          if (!this._commitImportedPawn(pawn)) { capped = true; break; } // cap reached
          added++;
        }
        this.renderAll();
        this.toast(added ? `Imported ${added} pawn${added === 1 ? '' : 's'}!${capped ? ' (pawn cap reached)' : ''}` : 'No pawns imported.');
        if (added) this.triggerAutoSave();
        return;
      }

      const pawn = this.parsePawnText(text);
      if (pawn) {
        if (!this._commitImportedPawn(pawn)) return; // cap reached
        this.renderAll();
        this.toast(` Imported ${pawn.nickname || pawn.name}!`);
        this.triggerAutoSave();
      } else {
        this.toast('Could not parse pawn data.');
      }
    } catch (err) {
      console.error('Import failed:', err);
      this.toast('Clipboard access denied.');
    }
  },

  // Add a freshly parsed imported pawn to state (with a blank-then-restored priority
  // row). Shared by single-pawn and Share-All imports. Returns false if the pawn cap
  // is reached (so a bulk import can stop).
  _commitImportedPawn(pawn) {
    if (!this._checkCap(this.state.pawns, 'pawns', 'pawns')) return false;
    const importedPrios = pawn._importedPriorities;
    delete pawn._importedPriorities;
    this.state.pawns.push(pawn);
    this.state.priorities[pawn.id] = {};
    this.allJobs.forEach(j => this.state.priorities[pawn.id][j.id] = null);
    if (importedPrios) {
      Object.entries(importedPrios).forEach(([jobId, val]) => {
        if (this.state.priorities[pawn.id].hasOwnProperty(jobId)) this.state.priorities[pawn.id][jobId] = val;
      });
    }
    return true;
  },

  parsePawnText(text) {
    const id = this._uniqueId();
    const skills = {}; SKILLS.forEach(s => skills[s.id] = 0);
    const passions = {}; SKILLS.forEach(s => passions[s.id] = 0);
    const passionDefs = {}; SKILLS.forEach(s => passionDefs[s.id] = 'None');
    let rawSkillData = {
      records: {},
      catalogue: { presence: 'unknown', completeness: 'unknown', provenance: {} },
    };
    let name = 'Imported Pawn';

    // 0. Try RimJobs JSON format (shared pawn data)
    try {
      const json = JSON.parse(text.trim());
      if (json && json._rimjobsPawn && json.pawn) {
        const pawn = json.pawn;
        pawn.id = id;
        // Reset avatar index to avoid collision
        const idx = this.state.pawns.length;
        const av = AVATARS[idx % AVATARS.length];
        if (!pawn.avatarBg) pawn.avatarBg = av.bg;
        if (!pawn.avatarColor) pawn.avatarColor = av.color;
        pawn.avatarIdx = idx % AVATARS.length;
        // Guarantee a well-formed shape - a shared/pasted blob is untrusted and
        // may be partial or hand-edited (clipboard imports skip the load-time
        // normaliser otherwise).
        this._coercePawn(pawn, idx);
        pawn.id = id;
        // Attach priorities if present
        if (json.priorities) pawn._importedPriorities = json.priorities;
        return pawn;
      }
    } catch (_) { /* not JSON, continue to other parsers */ }

    // 1. Try XML parsing (RimWorld save format)
    if (text.includes('<name>') || text.includes('<skills>')) {
      const parser = new DOMParser();
      const xml = parser.parseFromString(`<root>${text}</root>`, 'text/xml');
      
      const nick = xml.querySelector('nick')?.textContent;
      const first = xml.querySelector('first')?.textContent;
      const last = xml.querySelector('last')?.textContent;
      if (nick) name = nick;
      else if (first && last) name = `${first} ${last}`;
      else if (first) name = first;

      const skillNodes = xml.querySelectorAll('skills li');
      const rawSkillRecords = {};
      let rawSkillCompleteness = 'complete';
      skillNodes.forEach(node => {
        const defText = node.querySelector('def')?.textContent;
        const def = defText?.toLowerCase();
        const levelNode = node.querySelector('level');
        const passionNode = node.querySelector('passion');
        const level = parseInt(levelNode?.textContent) || 0;
        const passion = passionNode?.textContent;
        if (this._rawSkillRecordFact && defText) {
          const fact = this._rawSkillRecordFact(
            defText, levelNode?.textContent, !!levelNode,
            passion, !!passionNode,
            { sourcePath: 'pastedPawn.skills.skills' }
          );
          if (fact && !rawSkillRecords[fact.skillDefId]) {
            rawSkillRecords[fact.skillDefId] = fact;
            if (fact.parserCompleteness !== 'complete') rawSkillCompleteness = 'partial';
          } else if (fact) {
            rawSkillCompleteness = 'partial';
          }
        }
        
        const skillId = this.mapSkillDefToId(def);
        if (skillId) {
          skills[skillId] = level;
          // Keep the raw passion (vanilla or a modded VSE defName) so pasted modded
          // passions survive; bucket it via the scanned catalogue for display/engine.
          if (passion) { passionDefs[skillId] = passion; passions[skillId] = this._passionMeta(passion).bucket; }
        }
      });
      rawSkillData = {
        records: rawSkillRecords,
        catalogue: {
          presence: 'present', completeness: rawSkillCompleteness,
          provenance: { sourceKind: 'saveSkillTracker', sourcePath: 'pastedPawn.skills.skills' },
        },
      };

      if (name !== 'Imported Pawn' || Object.values(skills).some(v => v > 0)) {
        const pawn = this.createPawnObject(id, name, skills, passions, passionDefs, rawSkillData);
        // Extract backstory if present in XML
        const storyNode = xml.querySelector('story');
        if (storyNode) {
          const ch = storyNode.querySelector('childhood')?.textContent;
          const ad = storyNode.querySelector('adulthood')?.textContent;
          if (ch) pawn.childhood = ch;
          if (ad) pawn.adulthood = ad;
        }
        return pawn;
      }
    }

    // 2. Try plain text parsing (Wiki / UI copy)
    const lines = text.split('\n');
    let foundAny = false;
    lines.forEach(line => {
      const match = line.match(/([a-zA-Z\s]+)[:\s(]*(\d+)/);
      if (match) {
        const skillName = match[1].trim().toLowerCase();
        const level = parseInt(match[2]);
        const skillId = this.mapSkillDefToId(skillName);
        if (skillId) {
          skills[skillId] = level;
          foundAny = true;
          if (line.includes('🔥🔥') || line.toLowerCase().includes('major')) passions[skillId] = 2;
          else if (line.includes('🔥') || line.toLowerCase().includes('minor')) passions[skillId] = 1;
        }
      }
      
      if (name === 'Imported Pawn') {
        const nameMatch = line.match(/(?:Name|Pawn|Bio):\s*([a-zA-Z\s]+)/i);
        if (nameMatch) name = nameMatch[1].trim();
      }
    });

    if (foundAny) {
      return this.createPawnObject(id, name, skills, passions);
    }
    return null;
  },

  mapSkillDefToId(def) {
    if (!def) return null;
    const mapping = {
      'shooting': 'shoot',
      'melee': 'melee',
      'construction': 'construct',
      'mining': 'mine',
      'cooking': 'cook',
      'plants': 'plant',
      'animals': 'animal',
      'crafting': 'craft',
      'artistic': 'art',
      'medicine': 'medicine',
      'social': 'social',
      'intellectual': 'intel'
    };
    return mapping[def] || (SKILLS.find(s => s.name.toLowerCase() === def || s.id === def)?.id);
  },

  // Generate a unique ID that doesn't collide with existing pawn/priority IDs
  _uniqueId(prefix) {
    const existing = new Set(this.state.pawns.map(p => p.id).concat(Object.keys(this.state.priorities)));
    let id;
    let attempts = 0;
    do {
      id = (prefix || '') + Math.random().toString(36).slice(2, 9);
      attempts++;
    } while (existing.has(id) && attempts < 50);
    return id;
  },

  // ── Modded (VSE-framework) passion helpers ──────────────────────────────────
  // A "modded" passion is any raw <passion> value that is not vanilla None/Minor/
  // Major, e.g. AS_CompetitivePassion or VSE_Apathy from Alpha Skills / VSE.
  _isModdedPassion(val) {
    return !!val && val !== 'None' && val !== 'Minor' && val !== 'Major';
  },
  // If `def` is attributed (by the install scan) to a mod that is NOT active in the
  // imported save's modlist, return that mod's packageId (the warning signal). Returns
  // null when we have no save modlist or no source for the def, so we never warn blindly.
  _defModNotInSave(def) {
    const src = def && this.state.defSources && this.state.defSources[def];
    if (!src) return null;
    const set = this.state.saveModIdSet;
    if (!set || !set.size) return null;
    return set.has(src) ? null : src;
  },
  // Turn a passion defName into a readable label when we have no catalogue entry
  // (e.g. a future/unknown passion mod): drop a short mod prefix (AS_, VSE_, ...),
  // drop the word "Passion", split underscores and camelCase. Display-only.
  _humanizePassionDef(def) {
    let s = String(def || '');
    s = s.replace(/^[A-Za-z][A-Za-z0-9]{0,4}_/, '');   // strip a short prefix like AS_ / VSE_
    s = s.replace(/Passion(?=_|$)/g, '');               // drop the literal word Passion
    s = s.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    s = s.replace(/\s+/g, ' ').trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : String(def || '');
  },
  // Future-proofing: merge any modded passion VALUES actually present on the loaded
  // pawns into the catalogue, even if the install scan found no matching def. This
  // makes the picker offer (and the cards label) passions from any mod that writes
  // into the vanilla <passion> tag, which is the framework convention, so new
  // passion mods work without RimJobs knowing their def schema in advance.
  _mergeSeenPassionsIntoCatalog() {
    const cat = Array.isArray(this.state.passionCatalog) ? this.state.passionCatalog : (this.state.passionCatalog = []);
    const have = new Set(cat.map(c => c.def));
    for (const p of (this.state.pawns || [])) {
      const pd = p && p.passionDefs;
      if (!pd) continue;
      for (const sid in pd) {
        const v = pd[sid];
        if (this._isModdedPassion(v) && !have.has(v)) {
          have.add(v);
          cat.push({ def: v, label: this._humanizePassionDef(v), indicator: '★', color: '', bucket: 0, isBad: false, fromSave: true });
        }
      }
    }
  },
  // The current raw passion string for a skill, deriving from the bucket if absent.
  _passionValue(p, sid) {
    if (p && p.passionDefs && typeof p.passionDefs[sid] === 'string') return p.passionDefs[sid];
    const b = (p && p.passions && p.passions[sid]) | 0;
    return b === 2 ? 'Major' : b === 1 ? 'Minor' : 'None';
  },
  // Display metadata for a raw passion value: glyph, label, learning bucket, flags.
  _passionMeta(val) {
    if (!val || val === 'None') return { bucket: 0, glyph: '·', label: 'No passion', modded: false, known: true };
    if (val === 'Minor') return { bucket: 1, glyph: '🔥', label: 'Minor passion', modded: false, known: true };
    if (val === 'Major') return { bucket: 2, glyph: '🔥🔥', label: 'Major (burning) passion', modded: false, known: true };
    const cat = ((this.state && this.state.passionCatalog) || []).find(c => c.def === val);
    return {
      // isBad overrides the stored bucket so catalogues persisted before bad passions
      // mapped to -1 (e.g. Apathy saved with bucket 1) resolve correctly with no rescan.
      bucket: cat ? (cat.isBad ? -1 : (cat.bucket | 0)) : 0,
      glyph: (cat && cat.indicator) ? cat.indicator : '★',
      label: cat ? cat.label : this._humanizePassionDef(val), // readable even with no catalogue
      modded: true,
      known: !!cat,
      description: cat ? cat.description : ''
    };
  },
  // Passion button markup shared by the sidebar and the Pawn Manager editor.
  // `onAct` is the JS run on click (quick-cycle in the sidebar, picker in the manager).
  _passionBtnHTML(p, sid, onAct) {
    const meta = this._passionMeta(this._passionValue(p, sid));
    const cls = 'passion-btn' + (meta.modded ? ' passion-modded' : (meta.bucket === 1 ? ' on-1' : meta.bucket === 2 ? ' on-2' : ''));
    const title = meta.modded ? meta.label + ' (modded passion). Click to change.' : meta.label + '. Click to change.';
    return `<button class="${cls}" title="${_escapeHtml(title)}" onclick="${onAct}">${_escapeHtml(meta.glyph)}</button>`;
  },
  // Open the passion picker for one skill: the three vanilla tiers plus every
  // modded passion found by the install scan.
  openPassionPicker(pid, sid) {
    const p = this.state.pawns.find(x => x.id === pid);
    if (!p) return;
    // Make sure any modded passion already in use (even without a scanned def) is offered.
    this._mergeSeenPassionsIntoCatalog();
    const skill = (typeof SKILLS !== 'undefined' ? SKILLS : []).find(s => s.id === sid);
    const skillName = skill ? skill.name : sid;
    const current = this._passionValue(p, sid);
    const row = (val, glyph, label, sub) => {
      const sel = val === current;
      return `<button class="passion-pick-row${sel ? ' selected' : ''}" onclick="App._passionPickerChoose('${pid}','${sid}','${_escapeHtml(val)}')">
        <span class="passion-pick-glyph">${_escapeHtml(glyph)}</span>
        <span class="passion-pick-label">${_escapeHtml(label)}${sub ? ` <span class="passion-pick-sub">${_escapeHtml(sub)}</span>` : ''}</span>
        ${sel ? '<span class="passion-pick-check">✓</span>' : ''}
      </button>`;
    };
    const vanilla = [
      row('None', '·', 'No passion'),
      row('Minor', '🔥', 'Minor passion'),
      row('Major', '🔥🔥', 'Major (burning) passion')
    ].join('');
    const cat = (this.state.passionCatalog || []).slice().sort((a, b) => String(a.label).localeCompare(String(b.label)));
    // Resting passions are the ones a pawn normally holds and that you'd assign by hand.
    // "Triggered" ones (e.g. the _Active variants) are runtime states the mod flips on
    // itself, so they're tucked behind a toggle to keep the common case clean.
    const resting = cat.filter(c => !c.isTriggered);
    const runtime = cat.filter(c => c.isTriggered);
    const currentIsRuntime = runtime.some(c => c.def === current);
    const showRuntime = !!this._passionShowRuntime || currentIsRuntime;
    let moddedHtml;
    // Sub-label per modded passion: flag any whose mod is not active in this save.
    const subFor = (c) => this._defModNotInSave(c.def) ? '⚠ mod not in save' : (c.isBad ? 'downside' : '');
    if (cat.length) {
      moddedHtml = `<div class="passion-pick-group">Modded passions (${resting.length})</div>` +
        resting.map(c => row(c.def, c.indicator || '★', c.label, subFor(c))).join('');
      if (runtime.length) {
        if (showRuntime) {
          moddedHtml += `<div class="passion-pick-group">Runtime / triggered variants (${runtime.length})</div>` +
            runtime.map(c => row(c.def, c.indicator || '★', c.label, subFor(c))).join('');
        } else {
          moddedHtml += `<button class="passion-pick-row" onclick="App._passionShowRuntime=true; App.openPassionPicker('${pid}','${sid}')" style="opacity:0.8">
            <span class="passion-pick-glyph">⋯</span>
            <span class="passion-pick-label">Show ${runtime.length} runtime/triggered variant${runtime.length === 1 ? '' : 's'} <span class="passion-pick-sub">advanced</span></span>
          </button>`;
        }
      }
    } else if (this._isModdedPassion(current)) {
      moddedHtml = `<div class="passion-pick-group">Current modded passion</div>` + row(current, '★', current);
    } else {
      moddedHtml = `<div class="passion-pick-empty">No modded passions loaded. Click <strong>Scan Mods</strong> to read passions from mods like Alpha Skills.</div>`;
    }
    const body = `<div style="font-size:var(--f-xs); color:var(--text3); margin-bottom:8px">Passion for <strong style="color:var(--text2)">${_escapeHtml(skillName)}</strong></div>
      <div class="passion-pick-list">${vanilla}${moddedHtml}</div>`;
    this._showGenericModal('Choose passion', body);
  },
  _passionPickerChoose(pid, sid, value) {
    const p = this.state.pawns.find(x => x.id === pid);
    if (!p) return;
    if (!p.passionDefs) p.passionDefs = {};
    if (!p.passions) p.passions = {};
    p.passionDefs[sid] = value;
    p.passions[sid] = this._passionMeta(value).bucket;
    const missingMod = this._defModNotInSave(value);
    if (missingMod) this.toast(`Heads up: "${value}" comes from a mod not in this save's modlist (${missingMod}). It won't load unless that mod is active.`);
    try { document.getElementById('genericModal').classList.remove('show'); } catch (_) { /* no modal */ }
    if (typeof this.renderPawnManager === 'function') this.renderPawnManager();
    if (typeof this.renderSidebar === 'function') this.renderSidebar();
    this.triggerAutoSave();
  },
  createPawnObject(id, name, skills, passions, passionDefs, rawSkillData) {
    const idx = this.state.pawns.length;
    const av = AVATARS[idx % AVATARS.length];
    // Raw passion string per skill, so modded VSE passions round-trip losslessly.
    // Derive from the buckets when not supplied (e.g. hand-built pawns).
    const pdefs = passionDefs || (() => {
      const o = {}; SKILLS.forEach(s => { const b = (passions && passions[s.id]) | 0; o[s.id] = b === 2 ? 'Major' : b === 1 ? 'Minor' : 'None'; }); return o;
    })();
    return {
      id, name,
      nickname: '', firstName: '', lastName: '',
      skills, passions, passionDefs: pdefs,
      rawSkillRecords: rawSkillData && rawSkillData.records
        ? JSON.parse(JSON.stringify(rawSkillData.records)) : {},
      skillRecordCatalogue: rawSkillData && rawSkillData.catalogue
        ? JSON.parse(JSON.stringify(rawSkillData.catalogue))
        : { presence: 'unknown', completeness: 'unknown', provenance: {} },
      incapable: [], traits: [],
      childhood: '', adulthood: '',
      xenotype: 'baseliner',
      role: 'none',
      moodPreset: 'normal',
      bioAge: null,
      chronoAge: null,
      avatarIdx: idx % AVATARS.length,
      avatarBg: av.bg,
      avatarColor: av.color,
      avatarIcon: 'pawn',
      bio: '',
      health: [], // Array of { def, part, type, severity, hediffClass }
      relations: [], // Array of { def, otherPawnRef, startTicks } from save import
      loadID: '',    // RimWorld save file loadID for relation edge resolution
      geneDefIds: [], // Gene def IDs from save file for orientation/gene-based calculations
      collapsed: true, // cards start collapsed by default; expanding is remembered per-pawn
      traitsCollapsed: true,
      schedule: Array(24).fill(0),
      displayOrder: 999999,
      thingIDNumber: 999999
    };
  },

  // ─── DEF LABEL RESOLVER ───
  // Scans RimWorld install XMLs to build defName -> human label map
  async _ensureDefLabels() {
    if (this._defLabels) return this._defLabels;
    if (!window.overlay?.scanDefLabels) return null;

    // Use stored path or auto-detect
    const stored = this.state.settings.rimworldPath;
    const candidates = [
      stored,
      'C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld',
      'C:\\Program Files\\Steam\\steamapps\\common\\RimWorld',
      'D:\\Steam\\steamapps\\common\\RimWorld',
      'D:\\SteamLibrary\\steamapps\\common\\RimWorld',
      'E:\\SteamLibrary\\steamapps\\common\\RimWorld',
      'C:\\GOG Games\\RimWorld',
      'D:\\GOG Games\\RimWorld'
    ].filter(Boolean);

    // Try each candidate silently
    for (const p of candidates) {
      try {
        const result = await window.overlay.scanDefLabels(p);
        if (result && result.labels && Object.keys(result.labels).length > 50) {
          this._defLabels = result.labels;
          this._defLabelsPath = p;
          // Real tile footprints scanned from installed mods (defName -> [w,h]).
          this._defSizes = result.sizes || {};
          if (typeof setModDefSizes === 'function') setModDefSizes(this._defSizes);
          // Persist the working path for next time
          if (this.state.settings.rimworldPath !== p) {
            this.state.settings.rimworldPath = p;
            this.triggerAutoSave();
          }
          console.log(`Def labels loaded: ${Object.keys(result.labels).length} defs from ${result.fileCount} files`);
          return this._defLabels;
        }
      } catch (_) {}
    }
    return null;
  },

  // Resolve a defName to its human-readable label (from game XMLs)
  _defLabel(defName) {
    if (!defName || !this._defLabels) return null;
    const entry = this._defLabels[defName];
    return entry ? entry.label : null;
  },

  // Turn a raw (often modded) defName into a vanilla-style label when we have no real
  // scanned <label>. Rules: drop a leading ALL-CAPS mod prefix before the first
  // underscore (AG_, VSE_, DV_, BGM_ ...); turn the rest of the underscores into spaces;
  // split camelCase and acronym boundaries (ForsakenHorns -> Forsaken Horns, UVSensitivity
  // -> UV Sensitivity); collapse and Title-Case. Must never throw - a corrupt/crafted def
  // can be a number or object, and this feeds nearly every label in the UI.
  _humanizeDefName(def) {
    let s = String(def == null ? '' : def);
    if (!s) return '';
    s = s.replace(/^[A-Z0-9]{2,5}_/, '');           // drop a short all-caps mod prefix
    s = s.replace(/_/g, ' ');                        // remaining underscores -> spaces
    s = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2');    // forsakenHorns -> forsaken Horns
    s = s.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2'); // UVSensitivity -> UV Sensitivity
    s = s.replace(/([A-Za-z])(\d)/g, '$1 $2');        // Melanin2 -> Melanin 2
    s = s.replace(/\s+/g, ' ').trim();
    if (!s) return String(def == null ? '' : def);
    return s.replace(/\b\w/g, c => c.toUpperCase());
  },

  // The nine vanilla Core melanin genes are all labelled just "Skin color" in-game and
  // differ only by an index (1 palest -> 9 darkest). Name each by its actual skin tone
  // (derived from its skinColorBase RGB) so it reads with flavour, not "Skin Melanin 2".
  _skinMelaninLabels: {
    Skin_Melanin1: 'Porcelain skin', Skin_Melanin2: 'Fair skin', Skin_Melanin3: 'Light skin',
    Skin_Melanin4: 'Light tan skin', Skin_Melanin5: 'Tan skin', Skin_Melanin6: 'Olive skin',
    Skin_Melanin7: 'Bronze skin', Skin_Melanin8: 'Brown skin', Skin_Melanin9: 'Dark brown skin',
  },
  // Exact skinColorBase RGB for the nine vanilla melanin genes, as a no-scan fallback so
  // they tint even before the user scans (the scan's geneColors map supersedes this).
  _skinMelaninRGB: {
    Skin_Melanin1: [242,237,224], Skin_Melanin2: [255,239,213], Skin_Melanin3: [255,239,201],
    Skin_Melanin4: [255,239,189], Skin_Melanin5: [249,219,165], Skin_Melanin6: [242,199,140],
    Skin_Melanin7: [228,158,90], Skin_Melanin8: [130,91,48], Skin_Melanin9: [99,70,36],
  },

  // The gene's real colour (from scan, else the melanin fallback), or null. Handles both
  // the new {rgb,kind} entries and any legacy [r,g,b] arrays persisted before the change.
  _geneColor(defName) {
    const e = this.state.geneColors && this.state.geneColors[defName];
    if (e) return Array.isArray(e) ? e : (e.rgb || null);
    return this._skinMelaninRGB[defName] || null;
  },
  // Skin-colour kind for a gene: 'override' (exotic, suppresses melanin), 'base' (natural
  // melanin) or null (not a skin-colour gene). The 9 vanilla melanin genes are 'base' even
  // before a scan via the fallback map.
  _geneSkinKind(defName) {
    if (this._skinMelaninRGB[defName]) return 'base';
    const e = this.state.geneColors && this.state.geneColors[defName];
    if (e && !Array.isArray(e) && (e.kind === 'override' || e.kind === 'base')) return e.kind;
    return null;
  },
  // Does this gene list contain any exotic skin-colour OVERRIDE gene (which suppresses the
  // natural melanin skin colour)?
  _genesHaveSkinOverride(genes) {
    return Array.isArray(genes) && genes.some(g => this._geneSkinKind(g) === 'override');
  },
  // Display label for a gene, with skin-colour genes normalised to the vanilla "<colour>
  // skin" form so modded and natural ones read alike (no more "Skin Blue Fish" vs "Brown
  // skin"). `gene` is the curated GENES/customGenes entry if known, else undefined.
  _geneLabelFor(def, gene) {
    let base = this._skinMelaninLabels[def] ? this._skinMelaninLabels[def]
             : (gene ? gene.label : this._defLabelOrHumanize(def));
    if (this._geneSkinKind(def)) {
      const d = String(base).replace(/^skin\b[\s_-]*/i, '').replace(/[\s_-]*\b(?:skin|colou?rs?)\b\s*$/i, '').trim();
      if (d) base = d + ' skin';
    }
    return base;
  },
  // A `color:rgb(...)` style for a colour gene's NAME, tinting it with its actual colour
  // ONLY when that reads cleanly against the current theme: skip near-black/near-white
  // greys and neon (very saturated + very bright), and require enough contrast with the
  // panel background. Returns '' (default text colour) otherwise. Per the design: colour
  // the name unless black/white/otherworldly-bright would make it hard to read.
  _geneTintStyle(defName) {
    const rgb = this._geneColor(defName);
    if (!rgb) return '';
    const [r, g, b] = rgb;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max ? (max - min) / max : 0, val = max / 255;
    if (sat < 0.12 && (val > 0.9 || val < 0.18)) return ''; // near-white / near-black grey
    if (sat > 0.65 && val > 0.85) return '';                // neon / otherworldly bright
    const relLum = ([rr, gg, bb]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(rr) + 0.7152 * f(gg) + 0.0722 * f(bb); };
    const isLight = typeof document !== 'undefined' && document.body && document.body.classList.contains('light-theme');
    const bg = isLight ? [232, 234, 239] : [37, 40, 48];
    const l1 = relLum(rgb), l2 = relLum(bg);
    const contrast = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    if (contrast < 2.2) return ''; // too low contrast on this theme -> keep default colour
    return `color:rgb(${r},${g},${b})`;
  },

  // Resolve a defName to a label, preferring the real scanned label, else the humanizer.
  _defLabelOrHumanize(defName) {
    if (!defName) return '';
    // Skin-tone flavour names override the game's ambiguous shared "Skin color" label.
    if (this._skinMelaninLabels[defName]) return this._skinMelaninLabels[defName];
    const label = this._defLabel(defName);
    if (label) return label.charAt(0).toUpperCase() + label.slice(1);
    return this._humanizeDefName(defName);
  },

  addPawn() {
    if (!this._checkCap(this.state.pawns, 'pawns', 'pawns')) return;
    const id = this._uniqueId();
    const idx = this.state.pawns.length;
    const isFirst = idx === 0;
    const skills = {}; SKILLS.forEach(s => skills[s.id] = isFirst ? 20 : 0);
    const passions = {}; SKILLS.forEach(s => passions[s.id] = 0);
    const av = AVATARS[idx % AVATARS.length];
    this.state.pawns.push({
      id, name: isFirst ? 'John Rimworld' : 'Pawn ' + (idx + 1),
      nickname: isFirst ? 'John Rimworld' : '',
      firstName: isFirst ? 'John' : '',
      lastName: isFirst ? 'Rimworld' : '',
      gender: isFirst ? 'Male' : '',
      childhood: isFirst ? 'UrbworldUrchin61' : '',
      adulthood: isFirst ? 'BountyHunter41' : '',
      skills, passions, incapable: [], traits: [],
      xenotype: 'baseliner',
      role: 'none', 
      moodPreset: 'normal',
      avatarIdx: idx % AVATARS.length,
      avatarBg: av.bg,
      avatarColor: av.color,
      avatarIcon: 'pawn',
      collapsed: true, // cards start collapsed by default; expanding is remembered per-pawn
      traitsCollapsed: true,
      schedule: Array(24).fill(0)
    });
    this.state.priorities[id] = {};
    this.allJobs.forEach(j => this.state.priorities[id][j.id] = null);
    this.renderAll();
    this.triggerAutoSave();

    // In widget/drawer mode, auto-open the sidebar so the user sees the new card
    if (window.innerWidth <= 900) {
      const sidebar = document.querySelector('.sidebar');
      const backdrop = document.getElementById('drawerBackdrop');
      if (sidebar && !sidebar.classList.contains('drawer-open')) {
        sidebar.classList.add('drawer-open');
        if (backdrop) backdrop.classList.add('show');
      }
      // Scroll to bottom of pawn list to reveal the new card
      const pawnList = document.getElementById('pawnList');
      if (pawnList) setTimeout(() => pawnList.scrollTop = pawnList.scrollHeight, 50);
    }
  },

  setAvatar(pid, key, val) {
    const p = this.state.pawns.find(x => x.id === pid);
    if (p) {
      p[key] = val;
      this.renderSidebar();
      this.renderTable();
      this.triggerAutoSave();
    }
  },

  // -- PAWN MANAGER MODAL --
  openPawnManager() {
    const modal = document.getElementById('pawnManagerModal');
    if (modal) {
      modal.classList.add('show');
      this.renderPawnManager();
      // Lazily warm modded traits/health/relations in the background so the per-pawn editors
      // have their catalogues ready (no-op if already warmed or the toggle is off).
      if (typeof this._prefetchModData === 'function') this._prefetchModData();
    }
  },

  closePawnManager() {
    const modal = document.getElementById('pawnManagerModal');
    if (modal) modal.classList.remove('show');
    // Sync sidebar with any changes made in the modal
    this.renderSidebar();
    this.renderTable();
  },

  renderPawnManager() {
    const body = document.getElementById('pawnManagerBody');
    if (!body) return;
    // Preserve scroll position across the full innerHTML rebuild so toggling a
    // passion/skill doesn't jump the list back to the top.
    const _savedScroll = body.scrollTop;
    this._buildRenderCache();
    const pawns = this.state.pawns;
    const pawnContexts = this._c7PawnContextMap(
      pawns, this._c7EvidenceOptionsByPawn);

    if (pawns.length === 0) {
      body.innerHTML = `<div style="text-align:center;padding:var(--gap-2xl);color:var(--text3)">
        <div style="font-size:2em;margin-bottom:var(--gap-md)">○</div>
        <p style="font-size:var(--f-base);margin-bottom:var(--gap-lg)">No pawns yet. Add your first colonist to get started.</p>
        <button class="btn btn-primary" onclick="App.addPawn(); App.renderPawnManager()">+ Add Pawn</button>
      </div>`;
      return;
    }

    body.innerHTML = pawns.map(p => {
      const pawnCtx = pawnContexts.get(p.id);
      const xeno = this.getXeno(p.xenotype);
      const role = this.getRole(p.role || 'none');
      const xenoIncap = xeno.incapable || [];
      const roleIncap = role.incap || [];
      const cbsPm = this._resolveBackstory(p.childhood); const absPm = this._resolveBackstory(p.adulthood);
      const bsIncapPm = [...(cbsPm ? cbsPm.incapable : []), ...(absPm ? absPm.incapable : [])];
      const geneIncapPm = [];
      (xeno.genes || []).forEach(gId => { const g = this._resolveGeneDef(gId); if (g && g.incapable) geneIncapPm.push(...g.incapable); });
      const traitIncapPm = [];
      (Array.isArray(p.traits) ? p.traits : []).forEach(tId => { const t = this.getTrait(tId); if (t && t.incapable) traitIncapPm.push(...t.incapable); });
      const hediffIncapPm = this._hediffActiveIncaps(p.health);
      const allIncap = [...new Set([...p.incapable, ...xenoIncap, ...roleIncap, ...bsIncapPm, ...geneIncapPm, ...traitIncapPm, ...hediffIncapPm])];
      const avatarBg = _safeColor(p.avatarBg || AVATARS[p.avatarIdx].bg);
      const avatarColor = _safeColor(p.avatarColor || AVATARS[p.avatarIdx].color, '#ffffff');
      const avatarIcon = _escapeHtml(((p.nickname || p.name) || '?')[0].toUpperCase());
      const xenoColor = _safeColor(xeno.color);

      const wsProjection = this._c5WorkSpeedDisplay(p, pawnCtx);
      const wsMod = wsProjection.value;
      const wsDisplay = (wsMod * 100).toFixed(0) + '%';
      const wsColor = wsMod > 1.05 ? 'var(--accent)' : wsMod < 0.95 ? 'var(--p4-txt)' : 'var(--text3)';
      const wsTitle = 'Work Speed Modifier' + (wsProjection.notice
        ? ' · ' + wsProjection.notice : '');

      const traitsCollapsed = p.traitsCollapsed || false;
      const pawnTraitIds = p.traits || [];
      // Keep a STABLE order (don't float selected traits to the front) so clicking a chip
      // doesn't make it jump to the top of the list.
      const sortedTraits = this._rcTraitsSorted;

      return `
      <div class="pm-card" data-pawn-id="${p.id}" style="--xeno-color:${xenoColor}">
        <div class="pm-xeno-strip" style="background:${xenoColor}"></div>
        <div class="pm-card-inner">
          <div class="pm-header">
            <div class="avatar" style="width:44px;height:44px;font-size:calc(18px * var(--font-scale));background:${avatarBg};color:${avatarColor};border:2px solid rgba(255,255,255,0.1);border-radius:var(--radius-sm);flex-shrink:0">${avatarIcon}</div>
            <div style="flex:1;min-width:0">
              <input class="pawn-name" value="${_escapeHtml(p.nickname || p.name)}" oninput="App.renameNickname('${p.id}', this.value)" style="font-size:var(--f-base);font-weight:800;width:100%" placeholder="Nickname">
              <div style="display:flex;align-items:center;gap:4px;margin-top:4px;flex-wrap:wrap">
                <input class="skill-input" value="${_escapeHtml(p.firstName || '')}" oninput="App.setPawnField('${p.id}','firstName',this.value)" placeholder="First" style="font-size:var(--f-xs);width:60px;padding:2px 4px">
                <input class="skill-input" value="${_escapeHtml(p.lastName || '')}" oninput="App.setPawnField('${p.id}','lastName',this.value)" placeholder="Last" style="font-size:var(--f-xs);width:60px;padding:2px 4px">
                <input class="skill-input" type="number" min="0" max="9999" value="${p.bioAge != null ? p.bioAge : ''}" oninput="App.setPawnField('${p.id}','bioAge',this.value?parseInt(this.value):null); App.renderPawnManager()" placeholder="Bio Age" style="font-size:var(--f-xs);width:55px;padding:2px 4px;text-align:center" title="Biological Age">
                <input class="skill-input" type="number" min="0" max="99999" value="${p.chronoAge != null ? p.chronoAge : ''}" oninput="App.setPawnField('${p.id}','chronoAge',this.value?parseInt(this.value):null)" placeholder="Chrono" style="font-size:var(--f-xs);width:55px;padding:2px 4px;text-align:center" title="Chronological Age">
              </div>
              <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
                <span style="font-size:var(--f-xs);color:${xenoColor};font-weight:600">${_escapeHtml(xeno.label)}</span>
                <span style="font-size:var(--f-xs);color:var(--text3)">•</span>
                <span style="font-size:var(--f-xs);color:var(--text3)">${_escapeHtml(role.label)}</span>
                ${p.bioAge != null ? `<span style="font-size:var(--f-xs);color:var(--text3)">• ${p.bioAge}y</span>` : ''}${(xeno.uvSensitivity||0) >= 1 ? `<span style="font-size:var(--f-xs);color:#e8a838" title="${(xeno.uvSensitivity||0)===2?'Intense':'Mild'} UV Sensitivity">• UV</span>` : ''}
                <span style="font-size:var(--f-xs);font-weight:700;color:${wsColor};margin-left:auto" title="${_escapeHtml(wsTitle)}">Work Speed ${wsDisplay}</span>
              </div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
              <input type="color" value="${avatarBg}" onchange="App.setAvatar('${p.id}', 'avatarBg', this.value); App.renderPawnManager()" title="Background" style="width:28px;height:28px;border:none;padding:0;background:transparent;cursor:pointer;border-radius:4px">
              <input type="color" value="${avatarColor}" onchange="App.setAvatar('${p.id}', 'avatarColor', this.value); App.renderPawnManager()" title="Text" style="width:28px;height:28px;border:none;padding:0;background:transparent;cursor:pointer;border-radius:4px">
              <button class="btn btn-sm" onclick="App.sharePawn('${p.id}')" title="Copy pawn data to clipboard for sharing" style="padding:4px 8px;font-size:var(--f-xs)">Share</button>
              <button class="btn btn-sm" onclick="App.duplicatePawn('${p.id}'); App.renderPawnManager()" title="Create a local clone of this pawn" style="padding:4px 8px;font-size:var(--f-xs)">Duplicate</button>
              <button class="btn btn-sm btn-danger" onclick="App.removePawn('${p.id}'); App.renderPawnManager()" title="Delete" style="padding:4px 8px;font-size:var(--f-xs)">&times;</button>
            </div>
          </div>

          <div class="pm-body">
            <div class="pm-section">
              <div class="pm-section-title">Xenotype & Role</div>
              <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px">
                <select class="xeno-select" onchange="App.setXenotype('${p.id}', this.value); App.renderPawnManager()">${this._xenoOptsWithSelection(p.xenotype)}</select>
                <select class="xeno-select" onchange="App.setRole('${p.id}', this.value); App.renderPawnManager()">${this._roleOptsWithSelection(p.role)}</select>
                <select class="xeno-select" style="min-width:70px" onchange="App.setGender('${p.id}', this.value); App.renderPawnManager()">
                  <option value="" ${!p.gender?'selected':''}>--</option>
                  <option value="Male" ${p.gender==='Male'?'selected':''}>Male</option>
                  <option value="Female" ${p.gender==='Female'?'selected':''}>Female</option>
                </select>
              </div>
            </div>

            <div class="pm-section">
              <div class="pm-section-title">Backstory</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div>
                  <div style="font-size:var(--f-xs);color:var(--text3);margin-bottom:2px">Childhood</div>
                  <button class="xeno-select" style="width:100%;text-align:left;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" onclick="App.openBackstoryPicker('${p.id}','childhood')">${p.childhood ? _escapeHtml(this._resolveBackstory(p.childhood)?.title || p.childhood) : 'None'}</button>
                </div>
                <div>
                  <div style="font-size:var(--f-xs);color:var(--text3);margin-bottom:2px">Adulthood</div>
                  <button class="xeno-select" style="width:100%;text-align:left;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" onclick="App.openBackstoryPicker('${p.id}','adulthood')">${p.adulthood ? _escapeHtml(this._resolveBackstory(p.adulthood)?.title || p.adulthood) : 'None'}</button>
                </div>
              </div>
              ${(() => {
                const cbs = this._resolveBackstory(p.childhood);
                const abs = this._resolveBackstory(p.adulthood);
                const allBsIncap = [...new Set([...(cbs ? cbs.incapable : []), ...(abs ? abs.incapable : [])])];
                const allBsSkills = {};
                [cbs, abs].forEach(bs => { if (bs) Object.entries(bs.skills).forEach(([k, v]) => { allBsSkills[k] = (allBsSkills[k] || 0) + v; }); });
                const skillStr = Object.entries(allBsSkills).filter(([,v]) => v !== 0).map(([k, v]) => { const s = SKILLS.find(s => s.id === k); return s ? (v > 0 ? '+' : '') + v + ' ' + s.short : ''; }).filter(Boolean).join(', ');
                const incapStr = allBsIncap.map(ic => { const o = INCAP_OPTIONS.find(i => i.id === ic); return o ? o.label : ic; }).join(', ');
                if (!skillStr && !incapStr) return '';
                return '<div style="font-size:var(--f-xs);color:var(--text3);margin-top:4px;padding:4px 6px;background:var(--surface3);border-radius:4px">'
                  + (skillStr ? '<span style="color:var(--accent)">' + _escapeHtml(skillStr) + '</span>' : '')
                  + (skillStr && incapStr ? ' · ' : '')
                  + (incapStr ? '<span style="color:var(--p4-txt)">Incapable: ' + _escapeHtml(incapStr) + '</span>' : '')
                  + '</div>';
              })()}
            </div>

            <div class="pm-section pm-section--full">
              <div class="pm-section-title" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:8px" onclick="App.toggleTraitsCollapse('${p.id}'); App.renderPawnManager()"><span style="display:inline-flex;align-items:center;gap:8px">Traits (${(p.traits||[]).length}) <button class="btn btn-sm" onclick="event.stopPropagation(); App.openPawnTraitEditor('${p.id}')" title="Add or remove any vanilla or modded trait (no limit) and write it to your save on export" style="padding:1px 8px; font-size:calc(var(--f-xs) * 0.85)">&#9998; Edit (${this._pawnCurrentTraits(p).length})</button></span> <span style="font-size:calc(10px * var(--font-scale))">${traitsCollapsed ? '▼' : '▲'}</span></div>
              <div class="trait-chips" ${traitsCollapsed ? 'style="display:none"' : ''}>
                ${sortedTraits.map(t => { const isCustom = t.id in (this.state.customTraits || {}); return `<span style="position:relative;display:inline-flex"><button class="trait-chip ${(p.traits||[]).includes(t.id)?'on':''}" onclick="App.toggleTrait('${p.id}', '${t.id}'); App.renderPawnManager()" title="${_escapeHtml(_cleanGrammarText(t.description))}">${_escapeHtml(t.label)}</button>${isCustom ? `<span class="trait-del-badge" onclick="event.stopPropagation(); App.deleteCustomTrait('${t.id}')" title="Delete custom trait globally">&times;</span>` : ''}</span>`; }).join('')}
              </div>
            </div>

            ${typeof p.ideoCertainty === 'number' ? `
            <div class="pm-section">
              <div class="pm-section-title" style="display:flex;justify-content:space-between;align-items:center">
                <span>Ideology Certainty</span>
                <span id="certLbl_${p.id}" style="color:var(--accent);font-weight:800">${Math.round(p.ideoCertainty * 100)}%</span>
              </div>
              <input type="range" min="0" max="100" value="${Math.round(p.ideoCertainty * 100)}" oninput="App.setPawnIdeoCertainty('${p.id}', this.value)" title="How firmly this pawn holds their ideology. Writes to the save on export." style="width:100%">
            </div>` : ''}

            <div class="pm-section">
              <div class="pm-section-title" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center" onclick="const ta=this.parentElement.querySelector('.pm-bio-area'); ta.style.display=ta.style.display==='none'?'block':'none'">Bio <span style="font-size:var(--f-xs);color:var(--text3);font-weight:400">${p.bio ? '(' + p.bio.length + ' chars)' : 'click to add'}</span></div>
              <textarea class="pm-bio-area" placeholder="Write a short bio, backstory notes, or anything about this pawn..." oninput="App.setPawnField('${p.id}','bio',this.value); App.triggerAutoSave()" style="display:${p.bio ? 'block' : 'none'};width:100%;min-height:60px;max-height:120px;resize:vertical;font-size:var(--f-xs);padding:6px 8px;background:var(--surface3);color:var(--text);border:1px solid var(--border-med);border-radius:var(--radius-sm);font-family:inherit;line-height:1.4">${_escapeHtml(p.bio || '')}</textarea>
            </div>

            <div class="pm-section pm-section--full">
              <div class="pm-section-title">Skills</div>
              <div class="pm-skills-grid">
                ${SKILLS.map(s => {
                  const base = p.skills[s.id];
                  const display = this._c5SkillDisplay(p, pawnCtx, s.id);
                  const eff = display.level;
                  const lvlClass = eff >= 20 ? 'lvl-max' : eff >= 10 ? 'lvl-high' : eff >= 5 ? 'lvl-mid' : 'lvl-low';
                  const pct = Math.min(100, (eff / 20) * 100);
                  const skillTitle = s.name + ': ' + eff + ' effective'
                    + (display.notice ? ' · ' + display.notice : '');
                  return `<div class="pm-skill-row" title="${_escapeHtml(skillTitle)}">
                    <span class="pm-skill-name">${_escapeHtml(s.short)}</span>
                    <div class="skill-stepper" style="flex-shrink:0">
                      <button class="step-btn" onmousedown="App.setSkill('${p.id}','${s.id}',${Math.max(0, base-1)}); App.renderPawnManager()">−</button>
                      <span class="step-val ${lvlClass}" style="width:24px;text-align:center;font-weight:700;font-size:var(--f-sm)">${eff}</span>
                      <button class="step-btn" onmousedown="App.setSkill('${p.id}','${s.id}',${Math.min(20, base+1)}); App.renderPawnManager()">+</button>
                    </div>
                    <div class="skill-bar" style="flex:1"><div class="skill-fill ${lvlClass}" style="width:${pct}%"></div></div>
                    ${this._passionBtnHTML(p, s.id, `App.openPassionPicker('${p.id}','${s.id}')`)}
                  </div>`;
                }).join('')}
              </div>
            </div>

            ${allIncap.length ? `<div class="pm-section pm-section--full">
              <div class="pm-section-title">Incapable (${allIncap.length})</div>
              <div class="incap-chips">
                ${allIncap.map(icId => { const ic = INCAP_OPTIONS.find(o => o.id === icId); const label = ic ? ic.label : this._defLabelOrHumanize(icId); const isLocked = xenoIncap.includes(icId)||roleIncap.includes(icId)||bsIncapPm.includes(icId); return '<button class="incap-chip on ' + (isLocked?'xeno-locked':'') + '" onclick="App.toggleIncap(\'' + p.id + '\', \'' + icId + '\'); App.renderPawnManager()" title="' + (isLocked?'Locked by Xenotype, Role or Backstory':'Click to remove') + '">' + _escapeHtml(label) + '</button>'; }).join('')}
              </div>
            </div>` : ''}
            ${(() => { const fh = this._filteredHealth(p); const editable = Array.isArray(p._saveHediffs) && p._saveHediffs.length; return (fh.length || editable || p.downed) ? `<div class="pm-section">
              <div class="pm-section-title" style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span>Health (${fh.length})</span>${editable ? `<button class="btn btn-sm" onclick="App.openPawnHealthEditor('${p.id}')" title="Remove injuries, scars, implants or conditions, then write to your save on export" style="padding:1px 8px; font-size:calc(var(--f-xs) * 0.85)">&#9998; Edit (${p._saveHediffs.length})</button>` : ''}</div>
              <div style="display:flex;flex-wrap:wrap;gap:4px">${this._renderHealthSummary(p)}</div>
            </div>` : ''; })()}

            ${p.loadID ? `<div class="pm-section">
              <div class="pm-section-title" style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span>Relationships (${this._pawnCurrentRelations(p).length})</span><button class="btn btn-sm" onclick="App.openPawnRelationEditor('${p.id}')" title="Add or remove relationships with other imported colonists and write them to your save on export" style="padding:1px 8px; font-size:calc(var(--f-xs) * 0.85)">&#9998; Edit</button></div>
            </div>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
    body.scrollTop = _savedScroll; // restore position after rebuild
  },

  // -- DRAG & DROP REORDERING --
  handlePawnDragStart(e, id) {
    // Block card drag when mouse originated over an input/select
    if (this._dragFromInput) {
      e.preventDefault();
      this._dragFromInput = false;
      return;
    }
    // One-time: make the main content a drop zone that opens the Pawn Spotlight when a
    // sidebar card is dragged out of the sidebar and released over it.
    if (!this._spotlightZoneBound) {
      this._spotlightZoneBound = true;
      const main = document.querySelector('.main');
      if (main) {
        main.addEventListener('dragover', (ev) => {
          if (!this._pawnDragging) return;
          ev.preventDefault();
          // Must match the card dragstart effectAllowed ('move') - a mismatched
          // dropEffect makes the browser show the not-allowed cursor and block the drop.
          ev.dataTransfer.dropEffect = 'move';
        });
        main.addEventListener('drop', (ev) => {
          if (!this._pawnDragging) return;
          ev.preventDefault();
          const pid = ev.dataTransfer.getData('text/plain');
          if (pid) this.openPawnSpotlight(pid);
        });
      }
    }
    document.body.classList.add('pawn-drag-active');
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    // Use a tiny transparent image so the card doesn't visually escape the window
    const ghost = document.createElement('div');
    ghost.style.cssText = 'width:1px;height:1px;opacity:0;position:fixed;top:-100px';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => ghost.remove(), 0);
    e.currentTarget.classList.add('dragging');
    this._pawnDragging = true;
  },
  handlePawnDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
    // Auto-scroll sidebar proportional to cursor position
    // The closer the cursor is to an edge, the faster it scrolls
    if (this._pawnDragging) {
      const sidebar = document.querySelector('.sidebar') || document.getElementById('pawnList')?.parentElement;
      if (sidebar) {
        const rect = sidebar.getBoundingClientRect();
        const y = e.clientY;
        const h = rect.height;
        // Normalise cursor position within sidebar: 0 = top edge, 1 = bottom edge
        const ratio = Math.max(0, Math.min(1, (y - rect.top) / h));
        // Dead zone in the middle 40% (0.3 to 0.7) - no scroll
        const maxSpeed = 18;
        if (ratio < 0.3) {
          // Top 30%: scroll up, faster the higher the cursor
          const intensity = 1 - (ratio / 0.3); // 1 at top, 0 at 30%
          sidebar.scrollTop -= Math.ceil(maxSpeed * intensity * intensity);
        } else if (ratio > 0.7) {
          // Bottom 30%: scroll down, faster the lower the cursor
          const intensity = (ratio - 0.7) / 0.3; // 0 at 70%, 1 at bottom
          sidebar.scrollTop += Math.ceil(maxSpeed * intensity * intensity);
        }
      }
    }
  },
  handlePawnDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
  },
  handlePawnDrop(e, targetId) {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    e.currentTarget.classList.remove('drag-over');
    if (draggedId === targetId) return;

    const fromIdx = this.state.pawns.findIndex(p => p.id === draggedId);
    const toIdx = this.state.pawns.findIndex(p => p.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const [pawn] = this.state.pawns.splice(fromIdx, 1);
    this.state.pawns.splice(toIdx, 0, pawn);

    this.renderAll();
    this.triggerAutoSave();
  },
  handlePawnDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    this._pawnDragging = false;
    document.body.classList.remove('pawn-drag-active');
  },

  // -- PAWN SPOTLIGHT --
  // Enlarged read-only pawn card opened by dragging a sidebar card onto the main area.
  // Left/right arrows (on-screen and keyboard) cycle through the colony in sidebar order.
  openPawnSpotlight(pawnId) {
    const idx = this.state.pawns.findIndex(p => p.id === pawnId);
    if (idx === -1) return;
    this._spotlightIdx = idx;
    let ov = document.getElementById('pawnSpotlight');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'pawnSpotlight';
      ov.className = 'spotlight-overlay';
      ov.addEventListener('mousedown', (e) => { if (e.target === ov) this.closePawnSpotlight(); });
      document.body.appendChild(ov);
      this._spotlightKeys = (e) => {
        // Don't hijack arrows while the user is typing in a field behind the overlay.
        const t = e.target;
        const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.closePawnSpotlight(); }
        else if (!typing && e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); this.spotlightStep(-1); }
        else if (!typing && e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); this.spotlightStep(1); }
      };
      // Capture phase: fires before any focused element's own keydown handler, so the
      // arrows always reach the spotlight no matter what held focus when it opened.
      document.addEventListener('keydown', this._spotlightKeys, true);
    }
    this._renderSpotlight();
  },

  closePawnSpotlight() {
    const ov = document.getElementById('pawnSpotlight');
    if (ov) ov.remove();
    if (this._spotlightKeys) { document.removeEventListener('keydown', this._spotlightKeys, true); this._spotlightKeys = null; }
  },

  spotlightStep(dir) {
    const n = this.state.pawns.length;
    if (!n) return;
    this._spotlightIdx = ((this._spotlightIdx + dir) % n + n) % n;
    this._renderSpotlight(dir);
  },

  // Close the spotlight and reveal the pawn's card in the sidebar with a brief flash.
  spotlightLocate() {
    const p = this.state.pawns[this._spotlightIdx];
    this.closePawnSpotlight();
    if (!p) return;
    const card = document.querySelector(`#pawnList .pawn-card[data-pawn-id="${p.id}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('spotlight-flash');
      setTimeout(() => card.classList.remove('spotlight-flash'), 1600);
    }
  },

  _renderSpotlight(dir) {
    const ov = document.getElementById('pawnSpotlight');
    const p = this.state.pawns[this._spotlightIdx];
    if (!ov || !p) return;
    const total = this.state.pawns.length;
    const pawnCtx = this._c7PawnContextMap(
      [p], this._c7EvidenceOptionsByPawn).get(p.id);
    ov.innerHTML = `
      <button class="spotlight-arrow" onclick="App.spotlightStep(-1)" title="Previous pawn (Left arrow)">&#10094;</button>
      <div class="spotlight-stage">
        <div class="spotlight-card ${dir < 0 ? 'enter-left' : 'enter-right'}" id="spotlightCard">${this._spotlightCardHtml(p, pawnCtx)}</div>
        <div class="spotlight-footer">
          <span class="spotlight-counter">${this._spotlightIdx + 1} of ${total}</span>
          <button class="btn btn-sm" onclick="App.spotlightLocate()" title="Close and scroll the sidebar to this pawn's card">Show in sidebar</button>
          <span class="spotlight-hint">Esc to close &middot; &#8592;&#8594; to cycle</span>
        </div>
      </div>
      <button class="spotlight-arrow" onclick="App.spotlightStep(1)" title="Next pawn (Right arrow)">&#10095;</button>`;
  },

  // The enlarged card body: a read-only, presentation-grade summary of the pawn.
  _spotlightCardHtml(p, pawnCtx) {
    const xeno = this.getXeno(p.xenotype);
    const xenoColor = _safeColor(xeno.color);
    const role = this.getRole(p.role || 'none');
    const av = AVATARS[(p.avatarIdx || 0) % AVATARS.length] || AVATARS[0];
    const avatarBg = _safeColor(p.avatarBg || av.bg);
    const avatarColor = _safeColor(p.avatarColor || av.color, '#ffffff');
    const displayName = _escapeHtml(p.nickname || p.name || '?');
    const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ');
    const wsProjection = this._c5WorkSpeedDisplay(p, pawnCtx);
    const wsMod = wsProjection.value;
    const wsColor = wsMod > 1.05 ? 'var(--accent)' : wsMod < 0.95 ? 'var(--p4-txt)' : 'var(--text3)';
    const wsTitle = 'Work Speed Modifier' + (wsProjection.notice
      ? ' · ' + wsProjection.notice : '');
    const uvLevel = xeno.uvSensitivity || 0;

    const meta = [];
    if (p.gender) meta.push(p.gender);
    if (p.bioAge != null) meta.push(p.bioAge + 'y' + (p.chronoAge != null && p.chronoAge !== p.bioAge ? ' (' + p.chronoAge + ')' : ''));
    if (p.factionName) meta.push(p.factionName);
    if (p.ideoName) meta.push(p.ideoName);
    if (p.royalTitle) meta.push(p.royalTitle);

    const cbs = this._resolveBackstory(p.childhood);
    const abs = this._resolveBackstory(p.adulthood);
    const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    const storyBits = [];
    if (cbs || p.childhood) storyBits.push('C: ' + cap((cbs && cbs.title) || p.childhood));
    if (abs || p.adulthood) storyBits.push('A: ' + cap((abs && abs.title) || p.adulthood));

    // Traits (read-only chips)
    const traitChips = (p.traits || []).map(tId => {
      const t = this.getTrait(tId);
      const label = t ? t.label : this._defLabelOrHumanize(tId);
      const desc = t && t.description ? (typeof _cleanGrammarText === 'function' ? _cleanGrammarText(t.description) : t.description) : '';
      return `<span class="trait-chip on" style="cursor:default" title="${_escapeHtml(desc)}">${_escapeHtml(label)}</span>`;
    }).join('') || '<span style="color:var(--text3);font-size:var(--f-xs)">None</span>';

    // Skills: two-column grid, effective values with passion glyphs
    const skillCells = SKILLS.map(s => {
      const base = p.skills[s.id] || 0;
      const display = this._c5SkillDisplay(p, pawnCtx, s.id);
      const eff = display.level;
      const lvlClass = eff >= 20 ? 'lvl-max' : eff >= 10 ? 'lvl-high' : eff >= 5 ? 'lvl-mid' : 'lvl-low';
      const pmeta = this._passionMeta(this._passionValue(p, s.id));
      const skillTitle = s.name + ': base ' + base + ', effective ' + eff
        + (pmeta.label && pmeta.label !== 'None' ? ' - ' + pmeta.label : '')
        + (display.notice ? ' · ' + display.notice : '');
      return `<div class="spotlight-skill" title="${_escapeHtml(skillTitle)}">
        <span class="spotlight-skill-name">${s.name}</span>
        <span class="spotlight-skill-val">${eff}</span>
        <div class="skill-bar"><div class="skill-fill ${lvlClass}" style="width:${Math.min(100, (eff / 20) * 100)}%"></div></div>
        <span class="spotlight-skill-passion" title="${_escapeHtml(pmeta.label)}">${_escapeHtml(pmeta.glyph || '')}</span>
      </div>`;
    }).join('');

    // Incapabilities: full aggregation, same sources as the priority table
    const incaps = new Set(p.incapable || []);
    (xeno.incapable || []).forEach(i => incaps.add(i));
    (role.incap || []).forEach(i => incaps.add(i));
    (xeno.genes || []).forEach(gId => { const g = this._resolveGeneDef(gId); if (g && g.incapable) g.incapable.forEach(i => incaps.add(i)); });
    (p.traits || []).forEach(tId => { const t = this.getTrait(tId); if (t && t.incapable) t.incapable.forEach(i => incaps.add(i)); });
    if (cbs) cbs.incapable.forEach(i => incaps.add(i));
    if (abs) abs.incapable.forEach(i => incaps.add(i));
    this._hediffActiveIncaps(p.health).forEach(i => incaps.add(i));
    const incapHtml = incaps.size
      ? [...incaps].map(ic => { const o = INCAP_OPTIONS.find(x => x.id === ic); return `<span class="incap-chip on" style="cursor:default">${_escapeHtml(o ? o.label : this._defLabelOrHumanize(ic))}</span>`; }).join('')
      : '';

    const healthHtml = this._renderHealthSummary(p);

    const w = p.equippedWeapon;
    const worn = p.wornApparel || [];
    const gearBits = [];
    if (w) gearBits.push(this._defLabelOrHumanize(w.def) + (w.quality && w.quality !== 'Normal' ? ' (' + w.quality + ')' : ''));
    if (worn.length) gearBits.push(worn.map(a => this._defLabelOrHumanize(a.def)).join(', '));

    return `
      <div class="spotlight-strip" style="background:linear-gradient(90deg, ${xenoColor}, transparent)"></div>
      <div class="spotlight-head">
        <div class="spotlight-avatar" style="background:${avatarBg}; color:${avatarColor}">${_escapeHtml((p.nickname || p.name || '?')[0].toUpperCase())}</div>
        <div class="spotlight-title">
          <div class="spotlight-name">${displayName}</div>
          ${fullName ? `<div class="spotlight-fullname">${_escapeHtml(fullName)}</div>` : ''}
          <div class="spotlight-meta">${_escapeHtml(meta.join(' · '))}</div>
        </div>
        <div class="spotlight-pills">
          <span class="spotlight-pill" style="border-color:${xenoColor}; color:${xenoColor}">${_escapeHtml(xeno.label)}</span>
          ${p.role && p.role !== 'none' ? `<span class="spotlight-pill">${_escapeHtml(role.label)}</span>` : ''}
          <span class="spotlight-pill" style="color:${wsColor}" title="${_escapeHtml(wsTitle)}">${(wsMod * 100).toFixed(0)}%</span>
          ${uvLevel ? `<span class="spotlight-pill" style="color:#e8a838" title="${uvLevel === 2 ? 'Intense' : 'Mild'} UV sensitivity">UV${uvLevel === 2 ? '+' : ''}</span>` : ''}
        </div>
      </div>
      ${storyBits.length ? `<div class="spotlight-row spotlight-story">${_escapeHtml(storyBits.join('  ·  '))}</div>` : ''}
      <div class="spotlight-row"><div class="spotlight-label">Traits</div><div class="trait-chips">${traitChips}</div></div>
      <div class="spotlight-row"><div class="spotlight-label">Skills</div><div class="spotlight-skills">${skillCells}</div></div>
      ${incapHtml ? `<div class="spotlight-row"><div class="spotlight-label">Incapable</div><div class="incap-chips">${incapHtml}</div></div>` : ''}
      ${healthHtml ? `<div class="spotlight-row"><div class="spotlight-label">Health</div><div style="display:flex;flex-wrap:wrap;gap:3px">${healthHtml}</div></div>` : ''}
      ${gearBits.length ? `<div class="spotlight-row"><div class="spotlight-label">Equipped</div><div class="spotlight-gear">${_escapeHtml(gearBits.join(' · '))}</div></div>` : ''}`;
  },

  // -- TABLE / SCHEDULE DRAG & DROP REORDER --
  initBlueprintResize(e) {
    e.preventDefault();
    const layout = document.getElementById('blueprintLayout');
    if (!layout) return;
    const startX = e.clientX;
    const sidebar = layout.querySelector('.blueprint-sidebar');
    const startWidth = sidebar ? sidebar.getBoundingClientRect().width : 280;
    let lastW = startWidth;
    const onMove = (ev) => {
      const delta = ev.clientX - startX;
      lastW = Math.max(230, Math.min(600, startWidth + delta));
      layout.style.gridTemplateColumns = `${lastW}px 4px 1fr`;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('resizing-active');
      // Remember the width so a re-render (which rebuilds the layout) keeps it.
      this.state.bpSidebarWidth = Math.round(lastW);
      this.triggerAutoSave();
    };
    document.body.classList.add('resizing-active');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  },

  handleTableDragStart(e, id) {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.opacity = '0.4';
  },
  handleTableDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // A sidebar-card drag over the table belongs to the Pawn Spotlight drop zone -
    // don't draw the row reorder indicator for it.
    if (this._pawnDragging) return;
    const tr = e.currentTarget.closest ? e.currentTarget : e.target.closest('tr');
    if (tr) tr.style.borderTop = '3px solid var(--accent)';
  },
  handleTableDragLeave(e) {
    const tr = e.currentTarget.closest ? e.currentTarget : e.target.closest('tr');
    if (tr) tr.style.borderTop = '';
  },
  handleTableDrop(e, targetId) {
    // Sidebar-card drops bubble up to the .main spotlight handler; skip the reorder.
    if (this._pawnDragging) return;
    e.preventDefault();
    const tr = e.currentTarget.closest ? e.currentTarget : e.target.closest('tr');
    if (tr) tr.style.borderTop = '';
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === targetId) return;
    const fromIdx = this.state.pawns.findIndex(p => p.id === draggedId);
    const toIdx = this.state.pawns.findIndex(p => p.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [pawn] = this.state.pawns.splice(fromIdx, 1);
    this.state.pawns.splice(toIdx, 0, pawn);
    this.renderTable();
    this.renderSidebar();
    this.renderSchedule();
    this.triggerAutoSave();
  },
  handleTableDragEnd(e) {
    e.currentTarget.style.opacity = '';
  },

  duplicatePawn(id) {
    if (!this._checkCap(this.state.pawns, 'pawns', 'pawns')) return;
    const p = this.state.pawns.find(x => x.id === id);
    if (!p) return;
    const newId = this._uniqueId();
    const clone = JSON.parse(JSON.stringify(p));
    clone.id = newId;
    clone.name += ' (Copy)';
    this.state.pawns.push(clone);
    this.state.priorities[newId] = JSON.parse(JSON.stringify(this.state.priorities[id]));
    this.renderAll();
    this.triggerAutoSave();
    this.toast(` Duplicated ${p.name}`);
  },

  sharePawn(id) {
    const p = this.state.pawns.find(x => x.id === id);
    if (!p) return;
    const priorities = this.state.priorities[id] || {};
    const exportData = {
      _rimjobsPawn: true,
      version: 1,
      pawn: JSON.parse(JSON.stringify(p)),
      priorities: JSON.parse(JSON.stringify(priorities))
    };
    // Strip internal IDs so the recipient gets a fresh one on import
    delete exportData.pawn.id;
    const json = JSON.stringify(exportData);
    if (window.overlay && window.overlay.clipboardWrite) {
      window.overlay.clipboardWrite(json);
    } else {
      navigator.clipboard.writeText(json).catch(() => {});
    }
    this.toast('Copied.');
  },

  // Copy every pawn (with priorities) to the clipboard as one envelope, so the whole
  // colony can be shared and re-imported in one go via the Import button.
  shareAllPawns() {
    const pawns = this.state.pawns || [];
    if (!pawns.length) { this.toast('No pawns to share.'); return; }
    const out = {
      _rimjobsPawns: true,
      version: 1,
      pawns: pawns.map(p => {
        const pawn = JSON.parse(JSON.stringify(p));
        delete pawn.id; // recipient assigns fresh ids on import
        return { pawn, priorities: JSON.parse(JSON.stringify(this.state.priorities[p.id] || {})) };
      })
    };
    const json = JSON.stringify(out);
    if (window.overlay && window.overlay.clipboardWrite) {
      window.overlay.clipboardWrite(json);
    } else {
      navigator.clipboard.writeText(json).catch(() => {});
    }
    this.toast(`Copied ${pawns.length} pawn${pawns.length === 1 ? '' : 's'}.`);
  },

  showXenoDetails(pid) {
    const p = this.state.pawns.find(p => p.id === pid);
    if (!p) return;
    const xeno = this.getXeno(p.xenotype);
    const xenoColor = _safeColor(xeno.color);
    const allGenes = typeof GENES !== 'undefined' ? GENES : [];
    const customGenes = this.state.customGenes || {};
    const pawnGenes = xeno.genes || [];

    // Build skill mods summary
    const skillModsHtml = Object.entries(xeno.skillMods || {}).map(([sid, mod]) => {
      const skill = SKILLS.find(s => s.id === sid);
      const color = mod > 0 ? 'var(--p1-txt)' : 'var(--p4-txt)';
      return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;background:var(--surface3);border-radius:4px;font-size:var(--f-xs);border:1px solid var(--border-med)"><span style="color:var(--text2)">${skill ? skill.name : _escapeHtml(this._defLabelOrHumanize(sid))}</span> <span style="color:${color};font-weight:700">${mod > 0 ? '+' : ''}${mod}</span></span>`;
    }).join('') || '<span style="color:var(--text3);font-size:var(--f-xs)">None</span>';

    // Build incapable list
    const incapHtml = (xeno.incapable || []).map(ic => {
      const opt = INCAP_OPTIONS.find(o => o.id === ic);
      return `<span style="padding:3px 8px;background:var(--warn-bg);color:var(--warn-txt);border:1px solid var(--p4-border);border-radius:4px;font-size:var(--f-xs);font-weight:600">${opt ? opt.label : _escapeHtml(this._defLabelOrHumanize(ic))}</span>`;
    }).join('') || '<span style="color:var(--text3);font-size:var(--f-xs)">None</span>';

    // Build genes list
    const _skillName = (k) => { const s = SKILLS.find(s => s.id === k); return s ? s.short : this._defLabelOrHumanize(k); };
    const _hasSkinOverride = this._genesHaveSkinOverride(pawnGenes); // exotic skin suppresses melanin
    const genesHtml = pawnGenes.map(gId => {
      const gene = allGenes.find(g => g.id === gId) || customGenes[gId];
      const defEntry = this._defLabels && this._defLabels[gId];
      // Melanin/skin/hair labels win over the game's ambiguous shared "Skin color"; skin
      // genes are normalised to a uniform "<colour> skin" form (vanilla and modded alike).
      let label = this._geneLabelFor(gId, gene);
      const mods = gene ? Object.entries(gene.skillMods || {}).map(([k,v]) => `${_skillName(k)}:${v>0?'+':''}${v}`).join(' ') : '';
      // A natural melanin skin colour is suppressed when the pawn has an exotic skin
      // override (e.g. a blue-fish Nereid is never actually brown) - mark + grey it out.
      const overridden = _hasSkinOverride && this._geneSkinKind(gId) === 'base';
      const desc = overridden ? 'Overridden by an exotic skin-colour gene, this natural skin colour is not the visible one.'
        : (gene ? (gene.description || '') : (defEntry && defEntry.desc ? defEntry.desc : 'Unknown gene (from mod)'));
      if (overridden) label += ' (overridden)';
      const tint = overridden ? '' : this._geneTintStyle(gId); // colour the name with the gene's own colour when readable
      const style = overridden ? ';opacity:0.5;color:var(--text3)' : (gene ? '' : ';opacity:0.6') + (tint ? ';' + tint : '');
      return `<span style="padding:3px 8px;background:var(--surface3);border:1px solid var(--border-med);border-radius:4px;font-size:var(--f-xs)${style}" title="${_escapeHtml(desc)}">${_escapeHtml(label)}${mods ? ` <span style="color:var(--accent)">[${mods}]</span>` : ''}</span>`;
    }).join('') || '<span style="color:var(--text3);font-size:var(--f-xs)">No genes</span>';

    // Build passions list
    const passionsHtml = (xeno.passions || []).map(sid => {
      const skill = SKILLS.find(s => s.id === sid);
      return `<span style="padding:3px 8px;background:rgba(232,168,56,0.1);border:1px solid rgba(232,168,56,0.4);border-radius:4px;font-size:var(--f-xs);color:var(--accent)">🔥 ${skill ? skill.name : _escapeHtml(sid)}</span>`;
    }).join('') || '';

    const isCustom = p.xenotype in (this.state.customXenotypes || {});
    const hybridNote = isCustom ? '<div style="font-size:var(--f-xs);color:var(--accent);margin-top:4px;font-style:italic">Custom / Hybrid Xenotype</div>' : '';

    this._showGenericModal('Xenotype Details', `
      <div style="text-align:center;margin-bottom:16px">
        <div style="display:inline-block;width:56px;height:56px;border-radius:50%;background:${xenoColor};opacity:0.8;margin-bottom:8px"></div>
        <div style="font-size:calc(var(--f-base)*1.3);font-weight:800;color:${xenoColor}">${_escapeHtml(xeno.label)}</div>
        ${hybridNote}
        <div style="font-size:var(--f-xs);color:var(--text3);margin-top:4px">${_escapeHtml(xeno.notes || '')}</div>
      </div>
      <div style="margin-bottom:12px"><div style="font-weight:700;font-size:var(--f-sm);margin-bottom:6px;color:var(--text2)">Skill Modifiers</div><div style="display:flex;flex-wrap:wrap;gap:6px">${skillModsHtml}</div></div>
      <div style="margin-bottom:12px"><div style="font-weight:700;font-size:var(--f-sm);margin-bottom:6px;color:var(--text2)">Incapable Of</div><div style="display:flex;flex-wrap:wrap;gap:6px">${incapHtml}</div></div>
      ${passionsHtml ? `<div style="margin-bottom:12px"><div style="font-weight:700;font-size:var(--f-sm);margin-bottom:6px;color:var(--text2)">Innate Passions</div><div style="display:flex;flex-wrap:wrap;gap:6px">${passionsHtml}</div></div>` : ''}
      <div style="margin-bottom:12px"><div style="font-weight:700;font-size:var(--f-sm);margin-bottom:6px;color:var(--text2)">Xenogenes</div><div style="display:flex;flex-wrap:wrap;gap:6px">${genesHtml}</div></div>
    `, [{label:'Close', action:'dismiss'}]);
  },

  setPawnSort(val) {
    this.state.pawnSort = val;
    this.renderSidebar();
    this.triggerAutoSave();
  },

  _sortPawns(pawns) {
    const sort = this.state.pawnSort || 'manual';
    if (sort === 'manual') return pawns;
    const sorted = [...pawns];
    if (sort === 'az') return sorted.sort((a, b) => (a.nickname||a.name).localeCompare(b.nickname||b.name));
    if (sort === 'za') return sorted.sort((a, b) => (b.nickname||b.name).localeCompare(a.nickname||a.name));
    if (sort === 'game_order') return sorted.sort((a, b) => ((a.displayOrder ?? 999999) - (b.displayOrder ?? 999999)) || ((a.thingIDNumber ?? 999999) - (b.thingIDNumber ?? 999999)));
    if (sort === 'age_young') return sorted.sort((a, b) => (a.bioAge ?? 9999) - (b.bioAge ?? 9999));
    if (sort === 'age_old') return sorted.sort((a, b) => (b.bioAge ?? -1) - (a.bioAge ?? -1));
    // Skill sorts: "skill_shoot", "skill_melee", etc.
    if (sort.startsWith('skill_')) {
      const sid = sort.slice(6);
      return sorted.sort((a, b) => (b.skills[sid] || 0) - (a.skills[sid] || 0));
    }
    return sorted;
  },

  removePawn(id) {
    const doRemove = () => {
      this.state.pawns = this.state.pawns.filter(p => p.id !== id);
      delete this.state.priorities[id];
      this.renderAll();
      this.triggerAutoSave();
    };
    if (this.state.settings.confirmPawnDel) {
      this.showConfirm('Remove pawn?', 'Remove').then(doRemove).catch(() => {});
    } else { doRemove(); }
  },
  clearAllPawns() {
    this.showConfirm('Remove all pawns?', 'Remove All', 'This will clear every pawn and their priority assignments.').then(() => {
      this.state.pawns = [];
      this.state.priorities = {};
      // Off-map relatives (ghosts) are derived from colonists - clear them too
      this.state.ghostPawns = [];
      this.renderAll();
      this.triggerAutoSave();
    }).catch(() => {});
  },
  toggleCollapse(id) {
    const p = this.state.pawns.find(p => p.id === id);
    if (!p) return;
    p.collapsed = !p.collapsed;
    // DOM-only toggle: avoid full sidebar re-render
    const card = document.querySelector(`.pawn-card[data-pawn-id="${id}"]`);
    if (card) {
      const body = card.querySelector('.pawn-body');
      const btn = card.querySelector('.collapse-btn');
      if (body) body.classList.toggle('collapsed', p.collapsed);
      if (btn) btn.textContent = p.collapsed ? '▼' : '▲';
    }
    this._updateCollapseAllBtn();
    this.triggerAutoSave();
  },

  toggleCollapseAll() {
    const anyExpanded = this.state.pawns.some(p => !p.collapsed);
    this.state.pawns.forEach(p => p.collapsed = anyExpanded);
    this._updateCollapseAllBtn();
    this.renderSidebar();
    this.triggerAutoSave();
  },

  _updateCollapseAllBtn() {
    const btn = document.getElementById('collapseAllBtn');
    if (!btn) return;
    const anyExpanded = this.state.pawns.some(p => !p.collapsed);
    btn.textContent = anyExpanded ? 'Collapse All' : 'Expand All';
  },
  toggleTraitsCollapse(id) {
    const p = this.state.pawns.find(p => p.id === id);
    if (!p) return;
    p.traitsCollapsed = !p.traitsCollapsed;
    // DOM-only toggle for sidebar cards (avoid full re-render)
    const card = document.querySelector(`.pawn-card[data-pawn-id="${id}"]`);
    if (card) {
      const traitSection = card.querySelector('.trait-toggle-section');
      const traitChips = traitSection?.querySelector('.trait-chips');
      const collapseBtn = traitSection?.querySelector('.collapse-btn');
      if (collapseBtn) collapseBtn.textContent = p.traitsCollapsed ? '▼' : '▲';
      if (traitChips) {
        // Show all or just preview
        const allBtns = traitChips.querySelectorAll(':scope > span, :scope > button');
        const PREVIEW = 6;
        let idx = 0;
        allBtns.forEach(el => {
          if (p.traitsCollapsed) {
            el.style.display = idx < PREVIEW ? '' : 'none';
          } else {
            el.style.display = '';
          }
          idx++;
        });
        // Toggle the "+N more..." label
        let moreLabel = traitChips.querySelector('.trait-more-label');
        if (p.traitsCollapsed && allBtns.length > PREVIEW) {
          if (!moreLabel) {
            moreLabel = document.createElement('span');
            moreLabel.className = 'trait-more-label';
            moreLabel.style.cssText = 'font-size:var(--f-xs);color:var(--text3);align-self:center;padding:2px 4px';
            traitChips.appendChild(moreLabel);
          }
          moreLabel.textContent = `+${allBtns.length - PREVIEW} more...`;
          moreLabel.style.display = '';
        } else if (moreLabel) {
          moreLabel.style.display = 'none';
        }
        traitChips.style.opacity = p.traitsCollapsed ? '0.75' : '';
      }
      this.triggerAutoSave();
      return; // Skip PM re-render if we handled it via DOM
    }
    // Fallback for pawn manager modal
    this.triggerAutoSave();
  },
  setSkill(pid, sid, val) {
    const v = Math.max(0, Math.min(20, parseInt(val) || 0));
    const pawn = this.state.pawns.find(p => p.id === pid);
    if (pawn && pawn.skills[sid] !== v) {
      pawn.skills[sid] = v;
      this._c5UpdateRawSkillLevel(pawn, sid, v);
      this.recordSkillHistory(pawn, sid, v);
      this._updateSkillRow(pawn, pid, sid);
      this.renderTable();
      this.renderSummary();
      this.triggerAutoSave();
    }
  },
  _updateSkillRow(pawn, pid, sid) {
    const card = document.querySelector(`.pawn-card[data-pawn-id="${pid}"]`);
    if (!card) return;
    const row = card.querySelector(`.skill-row[data-skill-id="${sid}"]`);
    if (!row) return;
    const base = pawn.skills[sid];
    const pawnCtx = this._c7PawnContextMap(
      [pawn], this._c7EvidenceOptionsByPawn).get(pid);
    const display = this._c5SkillDisplay(pawn, pawnCtx, sid);
    const eff = display.level;
    const mod = eff - base;
    const lvlClass = eff >= 20 ? 'lvl-max' : eff >= 10 ? 'lvl-high' : eff >= 5 ? 'lvl-mid' : 'lvl-low';
    row.title = `${SKILLS.find(s=>s.id===sid)?.name||sid}: Base ${base}${mod?' + '+mod+' Modifiers':''} = ${eff} Total${display.notice ? ' · ' + display.notice : ''}`;
    const btns = row.querySelectorAll('.step-btn');
    if (btns[0]) btns[0].setAttribute('onclick', `App.setSkill('${pid}','${sid}',${Math.max(0,base-1)})`);
    if (btns[1]) btns[1].setAttribute('onclick', `App.setSkill('${pid}','${sid}',${Math.min(20,base+1)})`);
    const valEl = row.querySelector('.step-val');
    if (valEl) { valEl.textContent = base; valEl.className = `step-val ${eff>12?'skill-high':eff>7?'skill-mid':''}`; }
    const fill = row.querySelector('.skill-fill');
    if (fill) { fill.style.width = (eff/20)*100 + '%'; fill.className = `skill-fill ${lvlClass}`; }
  },

  recordSkillHistory(pawn, sid, val) {
    if (!pawn.skillHistory) pawn.skillHistory = {};
    if (!pawn.skillHistory[sid]) pawn.skillHistory[sid] = [];
    const h = pawn.skillHistory[sid];
    const last = h[h.length - 1];
    if (!last || last.val !== val) {
      h.push({ ts: Date.now(), val });
      if (h.length > 20) h.shift();
    }
  },

  renderSparkline(h) {
    if (!h || h.length < 2) return '';
    const w = 30, ht = 10;
    const pts = h.map((entry, i) => {
      const x = (i / (h.length - 1)) * w;
      const y = ht - (entry.val / 20) * ht;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<svg width="${w}" height="${ht}" style="margin-left:4px; vertical-align:middle; opacity:0.5" title="Skill History">
      <polyline fill="none" stroke="var(--accent)" stroke-width="1.5" points="${pts}" />
    </svg>`;
  },

  toggleTrait(pid, traitId) {
    const p = this.state.pawns.find(p => p.id === pid);
    if (!p.traits) p.traits = [];
    const idx = p.traits.indexOf(traitId);
    if (idx > -1) p.traits.splice(idx, 1);
    else p.traits.push(traitId); // no cap: modded pawns routinely have many traits
    // Note: the caller re-renders the Pawn Manager (which preserves scroll); calling
    // renderAll() here would reset the scroll and make the card jump to the top.
    this.triggerAutoSave();
  },

  // ─── PER-PAWN TRAIT EDITOR (for .rws export) ──────────────────────────────
  // Works in real RimWorld (def, degree) space using the scanned trait catalog, so
  // vanilla and modded traits behave identically. Edits are recorded as add/remove ops
  // on the pawn (p._traitOps), which the save exporter applies. No trait-count cap.

  _traitCatIndex() {
    if (this._tcIdx && this._tcIdxFor === this.state.traitCatalog) return this._tcIdx;
    const idx = {};
    for (const e of (this.state.traitCatalog || [])) (idx[e.def] = idx[e.def] || []).push(e);
    this._tcIdx = idx; this._tcIdxFor = this.state.traitCatalog;
    return idx;
  },
  _traitEntry(def, degree) {
    const arr = this._traitCatIndex()[def] || [];
    return arr.find(e => e.degree === (degree | 0)) || arr[0] || null;
  },
  _traitLabel(def, degree) {
    const e = this._traitEntry(def, degree);
    const lbl = e ? e.label : (this._cleanModName ? this._cleanModName(def) : def);
    const d = degree | 0;
    return lbl + (d ? ` (${d > 0 ? '+' : ''}${d})` : '');
  },
  // Mirrors RimWorld's TraitDef.ConflictsWith: same def (one degree per def), explicit
  // conflictingTraits either way, or a shared exclusionTag.
  _traitConflicts(a, b) {
    if (!a || !b) return false;
    if (a.def === b.def) return true;
    const ea = this._traitEntry(a.def), eb = this._traitEntry(b.def);
    const aCon = (ea && ea.conflictingTraits) || [], bCon = (eb && eb.conflictingTraits) || [];
    if (aCon.includes(b.def) || bCon.includes(a.def)) return true;
    const aTags = (ea && ea.exclusionTags) || [], bTags = (eb && eb.exclusionTags) || [];
    return aTags.some(t => bTags.includes(t));
  },
  _pawnTraitOps(p) {
    if (!p._traitOps || typeof p._traitOps !== 'object') p._traitOps = { add: [], remove: [] };
    if (!Array.isArray(p._traitOps.add)) p._traitOps.add = [];
    if (!Array.isArray(p._traitOps.remove)) p._traitOps.remove = [];
    return p._traitOps;
  },
  // The pawn's traits as they would be written: original save traits minus removes plus adds.
  _pawnCurrentTraits(p) {
    const ops = this._pawnTraitOps(p);
    const base = Array.isArray(p._saveTraits) ? p._saveTraits : [];
    const removed = (t) => ops.remove.some(r => r.def === t.def && (r.degree | 0) === (t.degree | 0));
    const cur = base.filter(t => !removed(t)).map(t => ({ def: t.def, degree: t.degree | 0 }));
    for (const a of ops.add) if (!cur.some(t => t.def === a.def && t.degree === (a.degree | 0))) cur.push({ def: a.def, degree: a.degree | 0 });
    return cur;
  },
  addPawnTrait(pawnId, def, degree) {
    const p = this.state.pawns.find(x => x.id === pawnId); if (!p) return;
    degree = degree | 0;
    const cur = this._pawnCurrentTraits(p);
    if (cur.some(t => t.def === def && t.degree === degree)) return;
    const clash = cur.find(t => this._traitConflicts({ def, degree }, t));
    if (clash) { this.toast(`Conflicts with ${this._traitLabel(clash.def, clash.degree)}`); return; }
    const ops = this._pawnTraitOps(p);
    const ri = ops.remove.findIndex(r => r.def === def && (r.degree | 0) === degree);
    if (ri >= 0) ops.remove.splice(ri, 1); // re-adding an original trait: cancel its removal
    else if (!ops.add.some(a => a.def === def && (a.degree | 0) === degree)) ops.add.push({ def, degree });
    this.triggerAutoSave();
    this._renderPawnTraitEditor(pawnId);
    if (this.renderPawnManager) this.renderPawnManager();
  },
  removePawnTrait(pawnId, def, degree) {
    const p = this.state.pawns.find(x => x.id === pawnId); if (!p) return;
    degree = degree | 0;
    const ops = this._pawnTraitOps(p);
    const ai = ops.add.findIndex(a => a.def === def && (a.degree | 0) === degree);
    if (ai >= 0) ops.add.splice(ai, 1); // was a pending add: just drop it
    const inSave = (p._saveTraits || []).some(t => t.def === def && (t.degree | 0) === degree);
    if (inSave && !ops.remove.some(r => r.def === def && (r.degree | 0) === degree)) ops.remove.push({ def, degree });
    this.triggerAutoSave();
    this._renderPawnTraitEditor(pawnId);
    if (this.renderPawnManager) this.renderPawnManager();
  },

  openPawnTraitEditor(pawnId) {
    this._traitEditorQuery = '';
    let el = document.getElementById('pawnTraitModal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pawnTraitModal';
      el.className = 'modal-overlay';
      el.addEventListener('mousedown', (e) => { if (e.target === el) this.closePawnTraitEditor(); });
      document.body.appendChild(el);
    }
    el.classList.add('show');
    el.style.display = 'flex';
    this._renderPawnTraitEditor(pawnId);
  },
  closePawnTraitEditor() {
    const el = document.getElementById('pawnTraitModal');
    if (el) { el.classList.remove('show'); el.style.display = 'none'; }
  },
  _renderPawnTraitEditor(pawnId) {
    const el = document.getElementById('pawnTraitModal'); if (!el) return;
    const p = this.state.pawns.find(x => x.id === pawnId); if (!p) { this.closePawnTraitEditor(); return; }
    const cur = this._pawnCurrentTraits(p);
    const curChips = cur.length ? cur.map(t =>
      `<span style="display:inline-flex; align-items:center; gap:5px; padding:3px 6px 3px 10px; background:var(--surface3); border:1px solid var(--border-med); border-radius:14px; font-size:var(--f-xs)">${_escapeHtml(this._traitLabel(t.def, t.degree))}<button onclick="App.removePawnTrait('${pawnId}','${t.def}',${t.degree})" title="Remove" style="background:none; border:none; color:var(--p4-txt); cursor:pointer; font-size:14px; line-height:1; padding:0 2px">&times;</button></span>`
    ).join('') : '<span style="color:var(--text3); font-size:var(--f-xs)">No traits.</span>';
    el.innerHTML = `<div class="modal" style="max-width:540px; width:94%; max-height:84vh; display:flex; flex-direction:column">
      <div class="modal-header" style="display:flex; align-items:center; justify-content:space-between; gap:8px">
        <h3 class="modal-title">Edit Traits for ${_escapeHtml(p.name || 'Pawn')}</h3>
        <button onclick="App.closePawnTraitEditor()" class="pawn-del" style="width:26px; height:26px; flex-shrink:0">&times;</button>
      </div>
      <div style="padding:8px 14px; border-bottom:1px solid var(--border)">
        <div style="font-size:calc(var(--f-xs) * 0.85); color:var(--text3); text-transform:uppercase; letter-spacing:0.06em; font-weight:800; margin-bottom:5px">Current (${cur.length})</div>
        <div style="display:flex; flex-wrap:wrap; gap:5px">${curChips}</div>
      </div>
      <div style="padding:8px 14px 0">
        <input type="text" value="${_escapeHtml(this._traitEditorQuery || '')}" oninput="App._traitEditorQuery=this.value; App._renderPawnTraitList('${pawnId}')" placeholder="Search traits to add…" class="skill-input" style="width:100%; padding:7px 10px; font-size:var(--f-sm)">
      </div>
      <div id="pawnTraitList" class="modal-body" style="overflow-y:auto; flex:1; min-height:0; padding-top:6px">${this._pawnTraitListHTML(pawnId)}</div>
      <div class="modal-footer" style="display:flex; justify-content:space-between; align-items:center; gap:8px">
        <span style="font-size:calc(var(--f-xs) * 0.85); color:var(--text3)">Changes apply on Export Edited Save.</span>
        <button class="btn btn-sm" onclick="App.closePawnTraitEditor()">Done</button>
      </div>
    </div>`;
    const inp = el.querySelector('input'); if (inp) { inp.focus(); const v = inp.value; inp.value = ''; inp.value = v; }
  },
  _renderPawnTraitList(pawnId) {
    const c = document.getElementById('pawnTraitList');
    if (c) c.innerHTML = this._pawnTraitListHTML(pawnId);
  },

  // Ideology certainty slider (0-100%). Updates the live label without a full re-render
  // so dragging stays smooth; the value is written to the save on export.
  setPawnIdeoCertainty(pid, pct) {
    const p = this.state.pawns.find(x => x.id === pid); if (!p) return;
    const v = Math.max(0, Math.min(100, parseInt(pct, 10) || 0));
    p.ideoCertainty = v / 100;
    const lbl = document.getElementById('certLbl_' + pid);
    if (lbl) lbl.textContent = v + '%';
    this.triggerAutoSave();
  },

  // ─── PER-PAWN HEALTH EDITOR (remove hediffs, for .rws export) ──────────────
  // Removal targets the hediff's top-level <li> index captured at import, so it matches
  // the writer exactly. (Adding injuries is a later step.)
  _pawnHediffOps(p) {
    if (!p._hediffOps || typeof p._hediffOps !== 'object') p._hediffOps = { add: [], remove: [] };
    if (!Array.isArray(p._hediffOps.add)) p._hediffOps.add = [];
    if (!Array.isArray(p._hediffOps.remove)) p._hediffOps.remove = [];
    return p._hediffOps;
  },

  _hediffDisplayLabel(h) {
    const name = this._cleanModName ? this._cleanModName(h.def) : h.def;
    const part = (h.partName && h.partIdx >= 0) ? ` (${h.partName})` : '';
    return name + part;
  },
  toggleRemoveHediff(pawnId, index) {
    const p = this.state.pawns.find(x => x.id === pawnId); if (!p) return;
    const ops = this._pawnHediffOps(p);
    const apply = () => {
      this.triggerAutoSave();
      this._renderPawnHealthEditor(pawnId);
      if (this.renderPawnManager) this.renderPawnManager();
    };
    const i = ops.remove.indexOf(index);
    if (i >= 0) { ops.remove.splice(i, 1); apply(); return; } // un-marking never needs a prompt
    // Warn before removing a grafted/added body part or implant. True race body parts (a
    // BodyDef part) are not hediffs and never appear here, but some mods graft features
    // (e.g. a Forsaken's horns) as an added-part hediff, and that, like a bionic, would be
    // stripped for good. Injuries, scars and diseases remove freely with no prompt.
    const h = (p._saveHediffs || []).find(x => x.index === index);
    if (h && (h.type === 'implant' || h.type === 'replaced')) {
      this.showConfirm(`Remove "${this._hediffDisplayLabel(h)}"? That is an implant or grafted body part (a bionic, or a built-in race feature like horns). Removing it strips it for good, and some mods assume a race part is always present, so deleting one can spam errors or crash the game. Only do this if you are sure.`, 'Remove anyway')
        .then(() => { ops.remove.push(index); apply(); })
        .catch(() => {});
      return;
    }
    ops.remove.push(index);
    apply();
  },
  // Mark every removable condition (injuries, missing parts, diseases) for removal, but
  // keep implants and prosthetics (you don't lose a bionic leg by clicking Heal all).
  healAll(pawnId) {
    const p = this.state.pawns.find(x => x.id === pawnId); if (!p) return;
    const ops = this._pawnHediffOps(p);
    (p._saveHediffs || []).forEach(h => {
      if (['injury', 'missing', 'condition'].includes(h.type) && !ops.remove.includes(h.index)) ops.remove.push(h.index);
    });
    this.triggerAutoSave();
    this._renderPawnHealthEditor(pawnId);
    if (this.renderPawnManager) this.renderPawnManager();
  },
  // Mark only permanent injuries (scars) for removal.
  removeScars(pawnId) {
    const p = this.state.pawns.find(x => x.id === pawnId); if (!p) return;
    const ops = this._pawnHediffOps(p);
    (p._saveHediffs || []).forEach(h => {
      if (h.type === 'injury' && h.permanent && !ops.remove.includes(h.index)) ops.remove.push(h.index);
    });
    this.triggerAutoSave();
    this._renderPawnHealthEditor(pawnId);
    if (this.renderPawnManager) this.renderPawnManager();
  },
  _hediffCatalog() { return Array.isArray(this.state.hediffCatalog) ? this.state.hediffCatalog : []; },
  // Human body parts for the part picker (index -> name), built from HUMAN_BODY_INDEX.
  _humanBodyParts() {
    const m = (typeof HUMAN_BODY_INDEX !== 'undefined') ? HUMAN_BODY_INDEX : {};
    return Object.keys(m).map(k => ({ idx: parseInt(k, 10), name: m[k] }))
      .filter(e => Number.isFinite(e.idx)).sort((a, b) => a.idx - b.idx);
  },
  addPawnHediff(pawnId, def, hediffClass, partIdx, severity) {
    const p = this.state.pawns.find(x => x.id === pawnId); if (!p) return;
    if (!def) return;
    const ops = this._pawnHediffOps(p);
    const pi = (partIdx == null || partIdx === '' || parseInt(partIdx, 10) < 0) ? null : parseInt(partIdx, 10);
    const sev = parseFloat(severity);
    ops.add.push({ def, hediffClass: hediffClass || 'HediffWithComps', partIdx: pi, severity: isFinite(sev) ? sev : null, body: p.bodyDef || 'Human' });
    this.triggerAutoSave();
    this._renderPawnHealthEditor(pawnId);
    if (this.renderPawnManager) this.renderPawnManager();
  },
  removeAddedHediff(pawnId, addIndex) {
    const p = this.state.pawns.find(x => x.id === pawnId); if (!p) return;
    const ops = this._pawnHediffOps(p);
    if (addIndex >= 0 && addIndex < ops.add.length) ops.add.splice(addIndex, 1);
    this.triggerAutoSave();
    this._renderPawnHealthEditor(pawnId);
    if (this.renderPawnManager) this.renderPawnManager();
  },
  _addHediffFromModal(pawnId, def, hediffClass) {
    const partSel = document.getElementById('hediffPartSel');
    const sevInput = document.getElementById('hediffSevInput');
    this.addPawnHediff(pawnId, def, hediffClass, partSel ? partSel.value : null, sevInput ? sevInput.value : null);
  },
  _renderHealthAddList(pawnId) {
    const c = document.getElementById('hediffAddList');
    if (c) c.innerHTML = this._healthAddListHTML(pawnId);
  },
  // ── Two-step add: pick a condition, THEN choose the limb it applies to. ──
  _healthPickPart(pawnId, def, hediffClass) {
    this._hediffPending = { pawnId, def, hediffClass };
    this._hediffPickShowAll = false;
    this._renderPawnHealthEditor(pawnId); // full re-render so the footer's Add pill appears next to Done
  },
  _healthCancelPick(pawnId) {
    this._hediffPending = null;
    this._hediffPickShowAll = false;
    this._renderPawnHealthEditor(pawnId); // full re-render so the footer's Add pill is removed
  },
  _healthConfirmAdd(pawnId) {
    const pend = this._hediffPending;
    if (!pend || pend.pawnId !== pawnId) return;
    const partSel = document.getElementById('hediffPartSel');
    const sevInput = document.getElementById('hediffSevInput');
    const part = partSel ? partSel.value : null;
    const sev = sevInput ? sevInput.value : null;
    this._hediffPending = null;
    this._hediffPickShowAll = false;
    this.addPawnHediff(pawnId, pend.def, pend.hediffClass, part, sev); // re-renders the editor (list view)
  },
  _renderHealthAddPanel(pawnId) {
    const c = document.getElementById('hediffAddPanel');
    if (c) c.innerHTML = this._healthAddPanelHTML(pawnId);
  },
  // Body parts a hediff can sensibly attach to. A prosthetic/implant is matched to the
  // limb named in it (e.g. a "mutant arm" -> the arm parts), and offers NO whole-body
  // option, so it can't be dropped on the wrong place. Diseases/injuries stay open.
  _applicablePartsForHediff(label, def, category) {
    const parts = this._humanBodyParts();
    const text = (String(label || '') + ' ' + String(def || '')).toLowerCase();
    const KEYWORDS = ['clavicle','shoulder','humerus','radius','arm','hand','finger','thumb','femur','tibia','leg','foot','toe','eye','ear','nose','jaw','tongue','tooth','neck','spine','rib','sternum','pelvis','heart','lung','kidney','liver','stomach','brain','skull','head','torso'];
    const hits = KEYWORDS.filter(k => text.includes(k));
    if (!hits.length) return { parts, filtered: false };
    const matched = parts.filter(pt => hits.some(k => pt.name.toLowerCase().includes(k)));
    return matched.length ? { parts: matched, filtered: true } : { parts, filtered: false };
  },
  _healthAddPanelHTML(pawnId) {
    const pend = this._hediffPending;
    if (pend && pend.pawnId === pawnId) {
      const p = this.state.pawns.find(x => x.id === pawnId);
      // A modded race uses a non-Human body, so the human part-index table doesn't
      // apply. Offer whole-body (reliable) + a manual index, never the wrong human parts.
      const nonHuman = !!(p && p.bodyDef && p.bodyDef !== 'Human');
      const cat = this._hediffCatalog().find(e => e.def === pend.def) || {};
      const label = cat.label || pend.def;
      const isImplant = cat.category === 'implant';
      const defSev = isImplant ? 1 : 0.5;
      let partControl, showAllToggle = '';
      if (nonHuman) {
        partControl = `
          <div style="font-size:calc(var(--f-xs)*0.82); color:var(--text3); margin-bottom:6px; line-height:1.45">This pawn uses the <strong>${_escapeHtml(p.bodyDef)}</strong> body (a modded race), so human part names do not apply. Leave the part blank for a whole-body condition, or enter the exact part index if you know it${isImplant ? ' (an implant needs a part)' : ''}.</div>
          <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-bottom:6px">
            <label style="font-size:var(--f-xs); color:var(--text3)">Part index</label>
            <input id="hediffPartSel" type="number" min="0" step="1" placeholder="blank = whole body" class="skill-input" style="width:150px; padding:5px">
            <label style="font-size:var(--f-xs); color:var(--text3)">Severity</label>
            <input id="hediffSevInput" type="number" step="0.1" min="0" value="${defSev}" class="skill-input" style="width:64px; padding:5px; text-align:center">
          </div>`;
      } else {
        const { parts, filtered } = this._applicablePartsForHediff(label, pend.def, cat.category);
        const showAll = !!this._hediffPickShowAll;
        const list = showAll ? this._humanBodyParts() : parts;
        // Implants must target a specific part (no whole-body option).
        const partOpts = (isImplant ? '' : `<option value="-1">Whole body (no part)</option>`)
          + list.map(pt => `<option value="${pt.idx}">${_escapeHtml(pt.name)}</option>`).join('');
        partControl = `
          <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-bottom:6px">
            <label style="font-size:var(--f-xs); color:var(--text3)">${isImplant ? 'Applies to' : 'Body part'}</label>
            <select id="hediffPartSel" class="skill-input" style="flex:1; min-width:140px; padding:5px">${partOpts}</select>
            <label style="font-size:var(--f-xs); color:var(--text3)">Severity</label>
            <input id="hediffSevInput" type="number" step="0.1" min="0" value="${defSev}" class="skill-input" style="width:64px; padding:5px; text-align:center">
          </div>`;
        showAllToggle = filtered ? `<label style="display:flex; align-items:center; gap:6px; font-size:calc(var(--f-xs)*0.85); color:var(--text3); margin-bottom:8px; cursor:pointer"><input type="checkbox" ${showAll ? 'checked' : ''} onchange="App._hediffPickShowAll=this.checked; App._renderHealthAddPanel('${pawnId}')"> Show all body parts</label>` : '';
      }
      return `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px">
          <button class="btn btn-sm" onclick="App._healthCancelPick('${pawnId}')" style="padding:2px 9px; font-size:calc(var(--f-xs)*0.85); flex-shrink:0">&#8592; Back</button>
          <span style="font-size:var(--f-sm); font-weight:700; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${_escapeHtml(label)}</span>
          ${isImplant ? '<span style="color:var(--accent); font-size:calc(var(--f-xs)*0.75); flex-shrink:0">implant</span>' : ''}
        </div>
        ${partControl}
        ${isImplant ? `<div style="font-size:calc(var(--f-xs)*0.8); color:var(--text3); margin:-2px 0 8px; line-height:1.4">Severity is usually ignored for implants - 1 is fine. (Left editable in case this is a special case or a mod uses it.)</div>` : ''}
        ${showAllToggle}`;
    }
    return `
      <input type="text" value="${_escapeHtml(this._hediffAddQuery || '')}" oninput="App._hediffAddQuery=this.value; App._renderHealthAddList('${pawnId}')" placeholder="Search injuries, diseases, implants…" class="skill-input" style="width:100%; padding:6px 10px; font-size:var(--f-sm); margin-bottom:6px">
      <div id="hediffAddList" style="max-height:200px; overflow-y:auto; border:1px solid var(--border); border-radius:6px">${this._healthAddListHTML(pawnId)}</div>`;
  },
  _healthAddListHTML(pawnId) {
    const catalog = this._hediffCatalog();
    if (!catalog.length) {
      return `<div style="color:var(--text3); padding:14px; text-align:center; font-size:var(--f-xs); line-height:1.5">No health catalogue yet. Click <strong>Scan Mods</strong> at the top of the Pawn Manager to load every vanilla and modded health condition (the scan also collects traits and relationships).</div>`;
    }
    const q = (this._hediffAddQuery || '').toLowerCase();
    const catBadge = { injury: 'injury', implant: 'implant', condition: 'condition' };
    return catalog
      .filter(e => !q || e.label.toLowerCase().includes(q) || e.def.toLowerCase().includes(q))
      .slice(0, 400)
      .map(e => `<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:5px 10px; border-bottom:1px solid var(--border)">
        <span>${_escapeHtml(e.label)} <span style="color:var(--text3); font-size:calc(var(--f-xs) * 0.8)">${_escapeHtml(e.def)}</span> <span style="color:var(--accent); font-size:calc(var(--f-xs) * 0.75)">${catBadge[e.category] || ''}</span>${this._defModNotInSave(e.def) ? ' <span style="color:var(--p4-txt); font-size:calc(var(--f-xs) * 0.75)" title="From a mod not active in this save\'s modlist">⚠ mod not in save</span>' : ''}</span>
        <button class="btn btn-sm" onclick="App._healthPickPart('${pawnId}','${e.def}','${e.hediffClass}')" style="padding:2px 10px; font-size:var(--f-xs)">Add &#8250;</button>
      </div>`).join('') || '<div style="color:var(--text3); padding:14px; text-align:center; font-size:var(--f-sm)">No matches.</div>';
  },
  openPawnHealthEditor(pawnId) {
    this._hediffPending = null; this._hediffPickShowAll = false; // always open in the condition list
    let el = document.getElementById('pawnHealthModal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pawnHealthModal';
      el.className = 'modal-overlay';
      el.addEventListener('mousedown', (e) => { if (e.target === el) this.closePawnHealthEditor(); });
      document.body.appendChild(el);
    }
    el.classList.add('show');
    el.style.display = 'flex';
    this._renderPawnHealthEditor(pawnId);
  },
  closePawnHealthEditor() {
    const el = document.getElementById('pawnHealthModal');
    if (el) { el.classList.remove('show'); el.style.display = 'none'; }
  },
  _renderPawnHealthEditor(pawnId) {
    const el = document.getElementById('pawnHealthModal'); if (!el) return;
    const p = this.state.pawns.find(x => x.id === pawnId); if (!p) { this.closePawnHealthEditor(); return; }
    const ops = this._pawnHediffOps(p);
    const removeSet = new Set(ops.remove);
    const list = Array.isArray(p._saveHediffs) ? p._saveHediffs : [];
    const hasScars = list.some(h => h.type === 'injury' && h.permanent);
    const hasRemovable = list.some(h => ['injury', 'missing', 'condition'].includes(h.type));

    const rows = list.length ? list.map(h => {
      const removed = removeSet.has(h.index);
      return `<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 10px; border-bottom:1px solid var(--border); ${removed ? 'opacity:0.55' : ''}">
        <span style="${removed ? 'text-decoration:line-through' : ''}">${_escapeHtml(this._hediffDisplayLabel(h))}${h.permanent ? ' <span style="color:var(--accent); font-size:calc(var(--f-xs)*0.75)">scar</span>' : ''}${h.severity ? ` <span style="color:var(--text3); font-size:calc(var(--f-xs) * 0.8)">sev ${h.severity.toFixed(2)}</span>` : ''}</span>
        <button class="btn btn-sm ${removed ? '' : 'btn-danger'}" onclick="App.toggleRemoveHediff('${pawnId}', ${h.index})" style="padding:2px 10px; font-size:var(--f-xs)">${removed ? 'Undo' : 'Remove'}</button>
      </div>`;
    }).join('') : '<div style="color:var(--text3); padding:14px; text-align:center; font-size:var(--f-sm)">No existing health conditions.</div>';

    const addedRows = ops.add.length ? ops.add.map((a, i) => {
      const partName = (a.partIdx != null && a.partIdx >= 0) ? ((typeof HUMAN_BODY_INDEX !== 'undefined' && HUMAN_BODY_INDEX[a.partIdx]) || ('part #' + a.partIdx)) : 'whole body';
      const name = this._cleanModName ? this._cleanModName(a.def) : a.def;
      return `<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 10px; border-bottom:1px solid var(--border); background:var(--ok-bg)">
        <span>+ ${_escapeHtml(name)} <span style="color:var(--text3)">(${_escapeHtml(partName)})</span>${a.severity != null ? ` <span style="color:var(--text3); font-size:calc(var(--f-xs)*0.8)">sev ${a.severity}</span>` : ''}</span>
        <button class="btn btn-sm" onclick="App.removeAddedHediff('${pawnId}', ${i})" style="padding:2px 10px; font-size:var(--f-xs)">Undo</button>
      </div>`;
    }).join('') : '';

    el.innerHTML = `<div class="modal" style="max-width:560px; width:95%; max-height:86vh; display:flex; flex-direction:column">
      <div class="modal-header" style="display:flex; align-items:center; justify-content:space-between; gap:8px">
        <h3 class="modal-title">Edit Health for ${_escapeHtml(p.name || 'Pawn')}</h3>
        <button onclick="App.closePawnHealthEditor()" class="pawn-del" style="width:26px; height:26px; flex-shrink:0">&times;</button>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; padding:8px 14px; border-bottom:1px solid var(--border)">
        ${hasRemovable ? `<button class="btn btn-sm btn-danger" onclick="App.healAll('${p.id}')" title="Mark all injuries, missing parts and conditions for removal (keeps implants and prosthetics)" style="border-radius:14px; padding:4px 12px">Heal all</button>` : ''}
        ${hasScars ? `<button class="btn btn-sm" onclick="App.removeScars('${p.id}')" title="Mark all permanent scars for removal" style="border-radius:14px; padding:4px 12px">Remove scars</button>` : ''}
      </div>
      <div class="modal-body" style="overflow-y:auto; flex:1; min-height:0">
        <div style="font-size:calc(var(--f-xs) * 0.8); color:var(--text3); text-transform:uppercase; letter-spacing:0.06em; font-weight:800; padding:8px 10px 4px">Existing (${list.length})</div>
        ${rows}
        ${addedRows ? `<div style="font-size:calc(var(--f-xs) * 0.8); color:var(--ok-txt); text-transform:uppercase; letter-spacing:0.06em; font-weight:800; padding:8px 10px 4px">Adding (${ops.add.length})</div>${addedRows}` : ''}
      </div>
      <div style="border-top:1px solid var(--border); padding:8px 12px; background:var(--surface2)">
        <div style="font-size:calc(var(--f-xs) * 0.8); color:var(--text3); text-transform:uppercase; letter-spacing:0.06em; font-weight:800; margin-bottom:5px">Add condition</div>
        <div id="hediffAddPanel">${this._healthAddPanelHTML(pawnId)}</div>
      </div>
      <div class="modal-footer" style="display:flex; justify-content:space-between; align-items:center; gap:8px">
        <span style="font-size:calc(var(--f-xs) * 0.85); color:var(--text3)">${ops.remove.length || ops.add.length ? `${ops.remove.length} remove, ${ops.add.length} add. ` : ''}Applies on Export.</span>
        <div style="display:flex; align-items:center; gap:8px; flex-shrink:0">
          ${(this._hediffPending && this._hediffPending.pawnId === pawnId) ? `<button class="btn btn-sm btn-primary" onclick="App._healthConfirmAdd('${pawnId}')" style="padding:4px 16px">Add</button>` : ''}
          <button class="btn btn-sm" onclick="App.closePawnHealthEditor()">Done</button>
        </div>
      </div>
    </div>`;
    const inp = el.querySelector('input[type="text"]'); if (inp) { inp.focus(); const v = inp.value; inp.value = ''; inp.value = v; }
  },

  // ─── PER-PAWN RELATIONSHIP EDITOR (directRelations, for .rws export) ───────
  // Relations are one-sided in the save (def + otherPawn loadID); RimWorld rebuilds the
  // reverse on load. Targets are limited to other imported colonists, whose loadID exists
  // in the save so the reference resolves.
  _relationCatalog() {
    const curated = [
      { def: 'Lover', label: 'Lover' },
      { def: 'Fiance', label: 'Fiance(e)' },
      { def: 'Spouse', label: 'Spouse' },
      { def: 'ExLover', label: 'Ex-lover' },
      { def: 'ExSpouse', label: 'Ex-spouse' },
      { def: 'Parent', label: 'Parent (target is their parent)' },
      { def: 'Child', label: 'Child (target is their child)' },
      { def: 'Bond', label: 'Bonded' },
    ];
    const seen = new Set(curated.map(c => c.def));
    // Every directly-assignable relation def from the install scan (vanilla + mods),
    // including ones no current colonist has.
    for (const e of (this.state.relationCatalog || [])) {
      if (e.def && !seen.has(e.def)) { seen.add(e.def); curated.push({ def: e.def, label: e.label || e.def }); }
    }
    // Backstop: anything present in the imported save but somehow not in the scan.
    for (const p of (this.state.pawns || [])) for (const r of (p._saveRelations || [])) {
      if (r.def && !seen.has(r.def)) { seen.add(r.def); curated.push({ def: r.def, label: r.def }); }
    }
    return curated;
  },
  _relDefLabel(def) { return (this._relationCatalog().find(d => d.def === def) || {}).label || def; },
  // Only REAL PawnRelationDefs can be written to a save (vanilla, or a def already present
  // in the imported save, which proves the mod that defines it is installed). App-only
  // "custom relation titles" are display labels and must never reach the writer.
  _relationDefSet() { return new Set(this._relationCatalog().map(d => d.def)); },
  _pawnNameByLoadID(loadID) {
    const p = (this.state.pawns || []).find(x => x.loadID === loadID);
    return p ? (p.name || p.loadID) : loadID;
  },
  _relTargetPawns(pawnId) {
    return (this.state.pawns || []).filter(p => p.loadID && p.id !== pawnId);
  },
  _pawnRelationOps(p) {
    if (!p._relationOps || typeof p._relationOps !== 'object') p._relationOps = { add: [], remove: [] };
    if (!Array.isArray(p._relationOps.add)) p._relationOps.add = [];
    if (!Array.isArray(p._relationOps.remove)) p._relationOps.remove = [];
    return p._relationOps;
  },
  _pawnCurrentRelations(p) {
    const ops = this._pawnRelationOps(p);
    const base = Array.isArray(p._saveRelations) ? p._saveRelations : [];
    const removed = (r) => ops.remove.some(x => x.def === r.def && x.otherPawn === r.otherPawn);
    const cur = base.filter(r => !removed(r)).map(r => ({ def: r.def, otherPawn: r.otherPawn }));
    for (const a of ops.add) if (!cur.some(r => r.def === a.def && r.otherPawn === a.otherPawn)) cur.push({ def: a.def, otherPawn: a.otherPawn });
    return cur;
  },
  addPawnRelation(pawnId, def, otherPawn) {
    const p = this.state.pawns.find(x => x.id === pawnId); if (!p) return;
    if (!def || !otherPawn || otherPawn === p.loadID) return;
    // Guard: refuse anything that isn't a real relation def. This blocks app-only custom
    // titles from ever being written to a save (RimWorld can't resolve them on load).
    if (!this._relationDefSet().has(def)) {
      this.toast('That relation type is not in your game. Only real relation types (vanilla or from your installed mods) can be written to a save.');
      return;
    }
    if (this._pawnCurrentRelations(p).some(r => r.def === def && r.otherPawn === otherPawn)) return;
    const ops = this._pawnRelationOps(p);
    const ri = ops.remove.findIndex(r => r.def === def && r.otherPawn === otherPawn);
    if (ri >= 0) ops.remove.splice(ri, 1);
    else if (!ops.add.some(r => r.def === def && r.otherPawn === otherPawn)) ops.add.push({ def, otherPawn });
    this.triggerAutoSave();
    this._renderPawnRelationEditor(pawnId);
    if (this.renderPawnManager) this.renderPawnManager();
  },
  removePawnRelation(pawnId, def, otherPawn) {
    const p = this.state.pawns.find(x => x.id === pawnId); if (!p) return;
    const ops = this._pawnRelationOps(p);
    const ai = ops.add.findIndex(r => r.def === def && r.otherPawn === otherPawn);
    if (ai >= 0) ops.add.splice(ai, 1);
    const inSave = (p._saveRelations || []).some(r => r.def === def && r.otherPawn === otherPawn);
    if (inSave && !ops.remove.some(r => r.def === def && r.otherPawn === otherPawn)) ops.remove.push({ def, otherPawn });
    this.triggerAutoSave();
    this._renderPawnRelationEditor(pawnId);
    if (this.renderPawnManager) this.renderPawnManager();
  },
  _addRelationFromModal(pawnId) {
    const d = document.getElementById('relDefSel'), t = document.getElementById('relTargetSel');
    if (d && t && t.value) this.addPawnRelation(pawnId, d.value, t.value);
  },
  openPawnRelationEditor(pawnId) {
    let el = document.getElementById('pawnRelationModal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pawnRelationModal';
      el.className = 'modal-overlay';
      el.addEventListener('mousedown', (e) => { if (e.target === el) this.closePawnRelationEditor(); });
      document.body.appendChild(el);
    }
    el.classList.add('show');
    el.style.display = 'flex';
    this._renderPawnRelationEditor(pawnId);
  },
  closePawnRelationEditor() {
    const el = document.getElementById('pawnRelationModal');
    if (el) { el.classList.remove('show'); el.style.display = 'none'; }
  },
  _renderPawnRelationEditor(pawnId) {
    const el = document.getElementById('pawnRelationModal'); if (!el) return;
    const p = this.state.pawns.find(x => x.id === pawnId); if (!p) { this.closePawnRelationEditor(); return; }
    const cur = this._pawnCurrentRelations(p);
    const defs = this._relationCatalog();
    const targets = this._relTargetPawns(pawnId);
    const curRows = cur.length ? cur.map(r =>
      `<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 10px; border-bottom:1px solid var(--border)">
        <span>${_escapeHtml(this._relDefLabel(r.def))} <span style="color:var(--text3)">of</span> <strong>${_escapeHtml(this._pawnNameByLoadID(r.otherPawn))}</strong></span>
        <button class="btn btn-sm btn-danger" onclick="App.removePawnRelation('${pawnId}','${r.def}','${r.otherPawn}')" style="padding:2px 10px; font-size:var(--f-xs)">Remove</button>
      </div>`).join('') : '<div style="color:var(--text3); font-size:var(--f-xs); padding:8px 10px">No direct relations.</div>';
    const addRow = targets.length ? `
      <div style="display:flex; gap:6px; align-items:center; padding:10px 14px; flex-wrap:wrap">
        <select id="relDefSel" class="skill-input" style="flex:1; min-width:130px; padding:6px">${defs.map(d => `<option value="${d.def}">${_escapeHtml(d.label)}${this._defModNotInSave(d.def) ? ' (⚠ mod not in save)' : ''}</option>`).join('')}</select>
        <span style="color:var(--text3); font-size:var(--f-xs)">with</span>
        <select id="relTargetSel" class="skill-input" style="flex:1; min-width:120px; padding:6px">${targets.map(t => `<option value="${t.loadID}">${_escapeHtml(t.name || t.loadID)}</option>`).join('')}</select>
        <button class="btn btn-sm btn-primary" onclick="App._addRelationFromModal('${pawnId}')" style="padding:5px 12px">+ Add</button>
      </div>` : `<div style="color:var(--text3); font-size:var(--f-xs); padding:10px 14px">Import more colonists from this save to link them together.</div>`;
    el.innerHTML = `<div class="modal" style="max-width:520px; width:94%; max-height:84vh; display:flex; flex-direction:column">
      <div class="modal-header" style="display:flex; align-items:center; justify-content:space-between; gap:8px">
        <h3 class="modal-title">Edit Relationships for ${_escapeHtml(p.name || 'Pawn')}</h3>
        <button onclick="App.closePawnRelationEditor()" class="pawn-del" style="width:26px; height:26px; flex-shrink:0">&times;</button>
      </div>
      <div style="padding:8px 14px 0">
        <div style="font-size:calc(var(--f-xs) * 0.85); color:var(--text3); text-transform:uppercase; letter-spacing:0.06em; font-weight:800; margin-bottom:5px">Current (${cur.length})</div>
      </div>
      <div class="modal-body" style="overflow-y:auto; flex:1; min-height:0">${curRows}</div>
      ${addRow}
      <div class="modal-footer" style="display:flex; justify-content:space-between; align-items:center; gap:8px">
        <span style="font-size:calc(var(--f-xs) * 0.85); color:var(--text3)">RimWorld rebuilds the reverse side on load. Applies on Export.</span>
        <button class="btn btn-sm" onclick="App.closePawnRelationEditor()">Done</button>
      </div>
    </div>`;
  },
  _pawnTraitListHTML(pawnId) {
    const p = this.state.pawns.find(x => x.id === pawnId); if (!p) return '';
    const catalog = this.state.traitCatalog || [];
    if (!catalog.length) {
      return `<div style="text-align:center; color:var(--text3); padding:24px 16px; font-size:var(--f-sm); line-height:1.5">No trait catalogue loaded yet.<br>Click <strong>Scan Mods</strong> at the top of the Pawn Manager to load every vanilla and modded trait.</div>`;
    }
    const cur = this._pawnCurrentTraits(p);
    const present = new Set(cur.map(t => t.def + '|' + t.degree));
    const q = (this._traitEditorQuery || '').toLowerCase();
    const rows = catalog
      .filter(e => !present.has(e.def + '|' + e.degree))
      .filter(e => !q || e.label.toLowerCase().includes(q) || e.def.toLowerCase().includes(q))
      .slice(0, 500)
      .map(e => {
        const degBadge = e.degree ? `<span style="font-size:calc(var(--f-xs) * 0.8); color:var(--accent); margin-left:4px">${e.degree > 0 ? '+' : ''}${e.degree}</span>` : '';
        const clash = cur.find(t => this._traitConflicts({ def: e.def, degree: e.degree }, t));
        if (clash) {
          return `<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 10px; opacity:0.5" title="Conflicts with ${_escapeHtml(this._traitLabel(clash.def, clash.degree))}">
            <span>${_escapeHtml(e.label)}${degBadge} <span style="color:var(--text3); font-size:calc(var(--f-xs) * 0.8)">${_escapeHtml(e.def)}</span></span>
            <span style="font-size:calc(var(--f-xs) * 0.85); color:var(--p4-txt)">conflicts</span></div>`;
        }
        return `<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 10px; border-bottom:1px solid var(--border)">
          <span>${_escapeHtml(e.label)}${degBadge} <span style="color:var(--text3); font-size:calc(var(--f-xs) * 0.8)">${_escapeHtml(e.def)}</span>${this._defModNotInSave(e.def) ? ' <span style="color:var(--p4-txt); font-size:calc(var(--f-xs) * 0.75)" title="From a mod not active in this save\'s modlist">⚠ mod not in save</span>' : ''}</span>
          <button class="btn btn-sm" onclick="App.addPawnTrait('${pawnId}','${e.def}',${e.degree})" style="padding:2px 10px; font-size:var(--f-xs)">+ Add</button></div>`;
      }).join('');
    return rows || '<div style="color:var(--text3); padding:16px; text-align:center; font-size:var(--f-sm)">No matching traits.</div>';
  },
  setRole(pid, roleId) {
    const p = this.state.pawns.find(p => p.id === pid);
    if (p) {
      p.role = roleId;
      // Auto-suggest icon based on role
      const roleIconMap = {
        'leader': 'leader', 'guide': 'social', 'production': 'craft',
        'shooting': 'guard', 'melee': 'guard', 'medical': 'doc',
        'mining': 'mine', 'plants': 'grow', 'animal': 'animal',
        'research': 'intel'
      };
    }
    this.renderAll();
    this.triggerAutoSave();
  },

  setPawnField(pid, field, value) {
    const p = this.state.pawns.find(p => p.id === pid);
    if (!p) return;
    p[field] = value;
    // If nickname changes, update display name
    if (field === 'nickname') {
      p.name = value || p.firstName || 'Unknown';
    }
    this.triggerAutoSave();
  },

  setGender(pid, gender) {
    const p = this.state.pawns.find(p => p.id === pid);
    if (p) {
      p.gender = gender || '';
    }
    this.renderAll();
    this.triggerAutoSave();
  },

  setPawnMoodPreset(pid, mode) {
    const p = this.state.pawns.find(x => x.id === pid);
    if (!p) return;
    p.moodPreset = mode;

    const idxSleep = Math.max(0, this.state.shiftTypes.indexOf('Sleep'));
    const idxWork = Math.max(0, this.state.shiftTypes.indexOf('Work'));
    const idxJoy = Math.max(0, this.state.shiftTypes.indexOf('Recreation'));
    const idxAny = Math.max(0, this.state.shiftTypes.indexOf('Anything'));

    if (mode === 'panic') {
      p.schedule = Array(24).fill(idxJoy);
      [22,23,0,1,2,3,4,5].forEach(h => p.schedule[h] = idxSleep);
      [6,7,8,21].forEach(h => p.schedule[h] = idxAny);
      this.toast(` ${p.nickname||p.name} in Mental Recovery!`);
    } else if (mode === 'night') {
      // Night shift: sleep 8am-4pm (peak UV), work 5pm-3am, joy 4-5am
      p.schedule = Array(24).fill(idxAny);
      [8,9,10,11,12,13,14,15].forEach(h => p.schedule[h] = idxSleep);
      [17,18,19,20,21,22,23,0,1,2].forEach(h => p.schedule[h] = idxWork);
      [3,4].forEach(h => p.schedule[h] = idxJoy);
      [5,6,7,16].forEach(h => p.schedule[h] = idxAny);
      this.toast(`N ${p.nickname||p.name} on Night Shift!`);
    } else if (mode === 'chill') {
      p.schedule = Array(24).fill(idxAny);
      [22,23,0,1,2,3,4,5].forEach(h => p.schedule[h] = idxSleep);
      [18,19,20,21,6,7].forEach(h => p.schedule[h] = idxJoy);
      this.toast(` ${p.nickname||p.name} on Light Duty.`);
    } else {
      Engine.optimizeSchedules([p]);
      this.toast(` ${p.nickname||p.name} back to Auto-Optimisation.`);
    }

    // Auto-update priorities based on new mood
    const contextMap = this._c7PawnContextMap(
      this.state.pawns, this._c7EvidenceOptionsByPawn);
    Engine.runMinMaxAssignment(
      this.state.pawns, this.state.roles, this.state.priorities,
      undefined, contextMap);
    
    this.renderAll();
    this.triggerAutoSave();
  },

  addCustomJob() {
    if (!this._checkCap(this.state.customJobs, 'customJobs', 'custom jobs')) return;
    this.showMultiPrompt('Add Custom Job', [
      { id: 'name', label: 'Job Name', placeholder: 'e.g. Fishing' },
      { id: 'skill', label: 'Linked Skill ID', placeholder: 'e.g. plant, craft, intel (or leave blank)', defaultVal: 'plant' },
      { id: 'mod', label: 'Mod Source', placeholder: 'Vanilla (leave blank)' }
    ]).then(vals => {
      // If launched from the Work Planner, return there afterwards.
      const reopen = () => { if (this._reopenPlannerAfterAdd) { this._reopenPlannerAfterAdd = false; this.openWorkPlanner(); } };
      if (!vals.name) { reopen(); return; }
      const id = "job_" + Math.random().toString(36).slice(2, 7);
      this.state.customJobs.push({
        id, name: vals.name, cat: 'labor', filter: 'labor', skill: vals.skill || null, hint: 'User-defined job.', important: false, modSource: (vals.mod || '').trim()
      });
      this.state.pawns.forEach(p => {
         if (!this.state.priorities[p.id]) this.state.priorities[p.id] = {};
         this.state.priorities[p.id][id] = null;
      });
      // Show the new custom job as a column straight away.
      const order = this._ensureJobOrder();
      if (!order.includes(id)) order.push(id);
      this.renderSettings();
      this.renderTable();
      this.triggerAutoSave();
      reopen();
    }).catch(() => { if (this._reopenPlannerAfterAdd) { this._reopenPlannerAfterAdd = false; this.openWorkPlanner(); } });
  },

  deleteCustomJob(id) {
    this.showConfirm('Delete this job?', 'Delete', 'All priority assignments for this job will be lost.').then(() => {
      this.state.customJobs = this.state.customJobs.filter(j => j.id !== id);
      this.state.pawns.forEach(p => delete this.state.priorities[p.id][id]);
      if (Array.isArray(this.state.settings.jobOrder)) this.state.settings.jobOrder = this.state.settings.jobOrder.filter(x => x !== id);
      this.renderSettings();
      this.renderTable();
      this.triggerAutoSave();
    }).catch(() => {});
  },

  updatePrecept(id, val) {
    this.state.precepts[id] = parseFloat(val) || 0;
    this.renderAll();
    this.triggerAutoSave();
  },

  // -- SURGICAL UPDATES (High Performance) --
});

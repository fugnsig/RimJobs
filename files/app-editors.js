/**
 * XENOTYPE & TRAIT EDITORS
 * Xeno editor modal (list/detail views, custom xenos, gene toggles),
 * trait editor modal (list/detail views, custom traits, skill mods).
 * Auto-split from app.js - methods are assigned onto the App object.
 */
Object.assign(App, {
  // -- XENOTYPE EDITOR MODAL --
  _xenoEditorView: 'list', // 'list' or xenotype id for detail view
  openXenoEditor(viewId) {
    const modal = document.getElementById('xenoModal');
    if (!modal) return;
    this._xenoEditorView = viewId || 'list';
    const body = document.getElementById('xenoModalBody');

    if (this._xenoEditorView !== 'list') {
      // DETAIL VIEW, edit a custom xenotype
      const xId = this._xenoEditorView;
      const x = this.state.customXenotypes[xId];
      if (!x) { this._xenoEditorView = 'list'; this.openXenoEditor(); return; }
      const allGenes = [...GENES, ...Object.values(this.state.customGenes || {})];
      const activeGenes = x.genes || [];

      // Group genes by category
      const categories = typeof GENE_CATEGORIES !== 'undefined' ? GENE_CATEGORIES : [...new Set(allGenes.map(g => g.category || 'Other'))];

      body.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px">
          <button class="btn btn-sm" onclick="App.openXenoEditor('list')" style="flex-shrink:0">Back</button>
          <h2 class="modal-title" style="margin:0; flex:1">Edit: ${_escapeHtml(x.label)}</h2>
          <div style="width:20px; height:20px; border-radius:50%; background:${_safeColor(x.color)}; flex-shrink:0"></div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:16px">
          <div>
            <label class="settings-label" style="font-size:var(--f-xs)">Name</label>
            <input type="text" class="skill-input" style="width:100%" value="${_escapeHtml(x.label)}" oninput="App.state.customXenotypes['${xId}'].label=this.value; App.triggerAutoSave()">
          </div>
          <div>
            <label class="settings-label" style="font-size:var(--f-xs)">Color</label>
            <input type="color" value="${_safeColor(x.color)}" style="width:100%; height:30px; border:none; cursor:pointer; background:transparent" onchange="App.state.customXenotypes['${xId}'].color=this.value; App.triggerAutoSave()">
          </div>
          ${_modInput(x.modSource, "App.state.customXenotypes['"+xId+"']")}
        </div>

        <div class="section-title section-title--sm">Skill Modifiers</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:6px; margin-bottom:16px">
          ${SKILLS.map(s => {
            const val = (x.skillMods || {})[s.id] || 0;
            return `<div style="display:flex; align-items:center; gap:4px; background:var(--surface2); padding:4px 8px; border-radius:6px">
              <span style="font-size:var(--f-xs); flex:1; color:var(--text2)">${s.short}</span>
              <input type="number" class="skill-input" style="width:50px; text-align:center; font-size:var(--f-xs)" value="${val}"
                onchange="App._setXenoSkillMod('${xId}','${s.id}',this.value)">
            </div>`;
          }).join('')}
        </div>

        <div class="section-title section-title--sm">Incapable Of</div>
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px">
          ${INCAP_OPTIONS.map(ic => {
            const active = (x.incapable || []).includes(ic.id);
            return `<button class="btn btn-sm ${active ? 'btn-danger' : ''}" style="font-size:var(--f-xs)"
              onclick="App._toggleXenoIncap('${xId}','${ic.id}')">${_escapeHtml(ic.label)}${active ? ' ✕' : ''}</button>`;
          }).join('')}
        </div>

        <div class="section-title section-title--sm">Genes</div>
        <div class="hover-scroll" style="max-height:min(300px, 45vh); overflow-y:auto; border:1px solid var(--border); border-radius:8px; padding:8px">
          ${categories.map(cat => {
            const catGenes = allGenes.filter(g => (g.category || 'Other') === cat);
            if (catGenes.length === 0) return '';
            return `<div style="margin-bottom:8px">
              <div style="font-size:var(--f-xs); color:var(--accent); font-weight:700; text-transform:uppercase; margin-bottom:4px">${_escapeHtml(cat)}</div>
              <div style="display:flex; flex-wrap:wrap; gap:4px">
                ${catGenes.map(g => {
                  const on = activeGenes.includes(g.id);
                  const effectStr = [];
                  if (g.skillMods) Object.entries(g.skillMods).forEach(([k,v]) => effectStr.push(k+':'+(v>0?'+':'')+v));
                  if (g.workSpeed) effectStr.push('Work:'+(g.workSpeed>0?'+':'')+(g.workSpeed*100).toFixed(0)+'%');
                  if (g.incapable) effectStr.push('Incap:'+g.incapable.join(','));
                  return `<button class="btn btn-sm ${on ? 'btn-accent' : ''}" style="font-size:calc(10px * var(--font-scale)); padding:2px 6px"
                    onclick="App._toggleXenoGene('${xId}','${g.id}')"
                    title="${_escapeHtml(g.description + (effectStr.length ? ' ['+effectStr.join(', ')+']' : ''))}">${_escapeHtml(g.label)}</button>`;
                }).join('')}
              </div>
            </div>`;
          }).join('')}
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:8px">
          <button class="btn btn-sm" onclick="App.addCustomGene()">+ Add Mod Gene</button>
          <button class="btn btn-sm" onclick="App.scanTraitsGenesFromDisk('geneScanStatus')" title="Scan your RimWorld install / mod folder for modded genes (and traits) and import them by name">Scan Game/Mod Folder</button>
        </div>
      `;
      modal.classList.add('show');
      return;
    }

    // LIST VIEW
    if (!this._xenoExpandedPresets) this._xenoExpandedPresets = {};
    // Save scroll position before re-render (modal-body is the scroll container)
    const savedScroll = body.scrollTop || 0;
    body.innerHTML = `
      <h2 class="modal-title" style="margin-bottom:16px">Xenotype Manager</h2>
      <div class="xeno-list-scroll" style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px">
        ${Object.entries(this.allXenotypes).map(([id, x]) => {
          const isCustom = id in (this.state.customXenotypes || {});
          const geneCount = (x.genes || []).length;
          const skillStr = Object.entries(x.skillMods||{}).map(([k,v])=>k+':'+(v>0?'+':'')+v).join(' ');
          const isExpanded = this._xenoExpandedPresets[id];
          const skillEntries = Object.entries(x.skillMods||{});
          const uvLabel = x.uvSensitivity === 2 ? 'UV+ Intense' : x.uvSensitivity === 1 ? 'UV Mild' : '';
          const passionStr = (x.passions||[]).length ? x.passions.map(p => p.charAt(0).toUpperCase()+p.slice(1)).join(', ') : '';
          const incapStr = (x.incapable||[]).length ? x.incapable.map(i => i.charAt(0).toUpperCase()+i.slice(1)).join(', ') : '';
          const genesList = (x.genes || []);
          const _hasSkinOvr = this._genesHaveSkinOverride(genesList);
          const genesHtml = genesList.length ? `<div style="margin-top:6px"><span style="font-weight:600; color:var(--text)">Genes:</span> <span style="color:var(--text2)">${genesList.map(g => {
            const overridden = _hasSkinOvr && this._geneSkinKind(g) === 'base';
            const lbl = _escapeHtml(this._geneLabelFor(g)) + (overridden ? ' (overridden)' : '');
            const st = overridden ? 'opacity:0.5;color:var(--text3)' : this._geneTintStyle(g);
            return `<span style="${st}">${lbl}</span>`;
          }).join(', ')}</span></div>` : '';
          const detailPanel = `
            <div style="display:${isExpanded?'block':'none'}; margin-top:8px; padding:8px 10px; background:var(--surface); border-radius:6px; font-size:var(--f-xs); color:var(--text2)">
              ${x.notes ? `<div style="margin-bottom:6px; font-style:italic; color:var(--text3)">${_escapeHtml(x.notes)}</div>` : ''}
              ${skillEntries.length ? `<div style="margin-bottom:6px"><span style="font-weight:600; color:var(--text)">Skill Mods:</span> ${skillEntries.map(([k,v])=>`<span style="color:${v>0?'#4caf50':'#ef5350'}; font-weight:600">${k}:${v>0?'+':''}${v}</span>`).join(' &nbsp;')}</div>` : '<div style="margin-bottom:6px; color:var(--text3)">No skill modifiers</div>'}
              ${passionStr ? `<div style="margin-bottom:6px"><span style="font-weight:600; color:var(--text)">Passions:</span> <span style="color:var(--accent)">${_escapeHtml(passionStr)}</span></div>` : ''}
              ${incapStr ? `<div style="margin-bottom:6px"><span style="font-weight:600; color:var(--text)">Incapable:</span> <span style="color:#ef5350">${_escapeHtml(incapStr)}</span></div>` : ''}
              ${uvLabel ? `<div style="margin-bottom:6px"><span style="font-weight:600; color:var(--text)">UV Sensitivity:</span> <span style="color:#f5a623">${uvLabel}</span></div>` : ''}
              ${genesHtml}
            </div>`;
          return `
          <div style="background:var(--surface2); padding:8px 12px; border-radius:8px; border-left:3px solid ${_safeColor(x.color)}">
            <div style="display:flex; align-items:center; gap:8px">
              <button class="collapse-btn" onclick="App._togglePresetXeno('${id}')" style="font-size:10px; width:18px; height:18px; padding:0; flex-shrink:0; display:flex; align-items:center; justify-content:center; border-radius:4px; background:var(--surface3); border:none; color:var(--text2); cursor:pointer">${isExpanded ? '▼' : '▶'}</button>
              <div style="flex:1">
                <div style="font-weight:700">${_escapeHtml(x.label)}${_modBadge(x)}</div>
                <div style="font-size:var(--f-xs); color:var(--text3)">${_escapeHtml(skillStr)}${geneCount ? ' | '+geneCount+' gene'+(geneCount>1?'s':'') : ''}</div>
              </div>
              ${isCustom ? `<button class="btn btn-sm" onclick="App.openXenoEditor('${id}')">Edit</button>
              <button class="pawn-del" onclick="App.deleteCustomXeno('${id}')">&times;</button>` : ''}
            </div>
            ${detailPanel}
          </div>`;
        }).join('')}
      </div>
      <button class="btn btn-accent" onclick="App.addCustomXeno()">+ Add Custom Xenotype</button>
      <button class="btn btn-primary" onclick="App.scanXenotypesFromDisk()" title="Scan RimWorld install or mod folder for XenotypeDef XML files and auto-import with accurate skill/UV data">Scan Game/Mod Folder</button>
    `;
    modal.classList.add('show');
    // Restore scroll position after re-render
    if (savedScroll) body.scrollTop = savedScroll;
  },
  _togglePresetXeno(id) {
    if (!this._xenoExpandedPresets) this._xenoExpandedPresets = {};
    this._xenoExpandedPresets[id] = !this._xenoExpandedPresets[id];
    this.openXenoEditor(); // Re-render list view
  },
  closeXenoEditor() {
    document.getElementById('xenoModal')?.classList.remove('show');
  },
  addCustomXeno() {
    if (!this._checkCap(this.state.customXenotypes, 'customXenotypes', 'custom xenotypes')) return;
    this.showMultiPrompt('Add Xenotype', [
      { id: 'label', label: 'Xenotype Name', placeholder: 'e.g. Hussar' },
      { id: 'color', label: 'Color Hex', placeholder: 'e.g. #ff9900', defaultVal: '#aaaaaa' }
    ]).then(vals => {
      if (!vals.label) return;
      const color = _safeColor(vals.color || '#aaaaaa', '#aaaaaa');
      const id = 'xeno_' + Math.random().toString(36).slice(2,7);
      this.state.customXenotypes[id] = { label: vals.label, color, skillMods: {}, incapable: [], genes: [] };
      this.openXenoEditor(id); // Jump straight to editing the new xenotype
      this.triggerAutoSave();
    }).catch(() => {});
  },
  // Derive xenotype skillMods, incapable, UV sensitivity etc. from a list of gene defName IDs.
  // Uses the same game-enforced naming conventions as parseXenotypesFromXML in data.js.
  _deriveXenoDataFromGenes(geneDefIds) {
    const skillMods = {};
    const passions = [];
    const incapable = [];
    let uvSensitivity = 0;
    let darkVision = false;
    let fireWeakness = false;
    const notesParts = [];

    for (const gene of geneDefIds) {
      // Aptitude genes: Aptitude{Level}_{Skill}
      const aptMatch = gene.match(/^Aptitude(Remarkable|Strong|Poor|Terrible)_(\w+)$/);
      if (aptMatch) {
        const [, level, skillDef] = aptMatch;
        const skillId = XENO_GENE_SKILL_MAP[skillDef];
        if (skillId) {
          skillMods[skillId] = (skillMods[skillId] || 0) + XENO_APTITUDE_LEVELS[level];
          if (XENO_PASSION_GENES[level]) passions.push(skillId);
        }
        continue;
      }

      // Special genes
      if (gene === 'ViolenceDisabled') { incapable.push('violence'); continue; }
      if (gene === 'UVSensitivity_Mild') { uvSensitivity = Math.max(uvSensitivity, 1); continue; }
      if (gene === 'UVSensitivity_Intense') { uvSensitivity = Math.max(uvSensitivity, 2); continue; }
      if (gene === 'DarkVision') { darkVision = true; continue; }
      if (gene === 'FireWeakness') { fireWeakness = true; continue; }
      if (gene === 'Robust') { notesParts.push('Robust (25% less damage)'); continue; }
      if (gene === 'Delicate') { notesParts.push('Delicate (15% more damage)'); continue; }
      if (gene === 'Ageless') { notesParts.push('Ageless'); continue; }
      if (gene === 'Deathless') { notesParts.push('Deathless'); continue; }
      if (gene === 'Hemogenic') { notesParts.push('Hemogenic'); continue; }
      if (gene === 'Deathrest') { notesParts.push('Deathrest'); continue; }
      if (gene === 'PerfectImmunity') { notesParts.push('Disease immune'); continue; }
      if (gene === 'ToxResist_Total') { notesParts.push('Tox immune'); continue; }
      if (/^ChemicalDependency_/.test(gene)) { notesParts.push(gene.replace('ChemicalDependency_', '') + ' dependent'); continue; }
    }

    if (uvSensitivity > 0) notesParts.push(uvSensitivity === 2 ? 'Intense UV sensitivity' : 'Mild UV sensitivity');
    if (darkVision) notesParts.push('Dark vision');
    if (fireWeakness) notesParts.push('Fire weakness');

    return {
      skillMods,
      passions: [...new Set(passions)],
      incapable,
      uvSensitivity,
      darkVision,
      fireWeakness,
      notes: notesParts.length ? notesParts.join('. ') + '.' : 'Gene-derived from save.'
    };
  },

  async scanXenotypesFromDisk() {
    try {
      // Auto-detects the install (no dialog) when possible; only prompts if not found
      const dirPath = await this._resolveRimworldPath();
      if (!dirPath) return;

      // All feedback goes through the non-blocking scan toast (like every other scan),
      // not into any status text under the pills.
      this._showScanToast('Scanning xenotypes');
      this._updateScanToast(0, 0, 'Reading XenotypeDefs…');

      // Store the path for def label resolution
      this.state.settings.rimworldPath = dirPath;
      this.triggerAutoSave();

      const result = await window.overlay.scanXenotypeDefs(dirPath);
      if (result.error) { this._closeScanToast('Scan error: ' + result.error, true); return; }

      // Parse the combined XML using the algorithm from data.js
      const parsed = parseXenotypesFromXML(result.xml);
      const keys = Object.keys(parsed);

      // Merge into custom xenotypes (don't overwrite existing presets)
      let added = 0, updated = 0, skippedPreset = 0;
      for (const [id, xeno] of Object.entries(parsed)) {
        if (PRESET_XENOTYPES[id]) { skippedPreset++; continue; } // Already in presets with verified data
        if (this.state.customXenotypes[id]) { Object.assign(this.state.customXenotypes[id], xeno); updated++; }
        else { this.state.customXenotypes[id] = xeno; added++; }
      }

      // The same install scan can also pull modded traits & genes (drives its own toast).
      const tg = await this._mergeScannedTraitsGenes(dirPath);

      this.triggerAutoSave();
      this.openXenoEditor(); // Refresh the editor view

      const tgMsg = tg && !tg.error
        ? ` Plus ${tg.traitsAdded} traits, ${tg.genesAdded} genes, ${tg.backstoriesAdded} backstories, ${tg.prostheticsAdded} prosthetics.`
        : '';
      this._closeScanToast(keys.length
        ? `Found ${keys.length} xenotypes, ${added} added, ${updated} updated, ${skippedPreset} already preset.${tgMsg}`
        : `Scanned ${result.totalScanned} files, no XenotypeDefs found.${tgMsg}`, false);
    } catch (e) {
      this._closeScanToast('Scan error: ' + (e.message || 'failed'), true);
    }
  },

  // ── Non-blocking scan progress toast (bottom-right, does NOT block the UI) ──
  _showScanToast(title) {
    let el = document.getElementById('scanToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'scanToast';
      el.style.cssText = 'position:fixed; bottom:16px; right:16px; z-index:9000; width:min(320px,82vw); background:var(--surface2); border:1px solid var(--accent); border-radius:var(--radius-md); box-shadow:0 8px 28px rgba(0,0,0,0.5); padding:11px 13px; font-family:Arial,sans-serif';
      el.innerHTML = '<div style="display:flex; align-items:center; gap:8px; margin-bottom:5px">'
        + '<span id="scanToastSpin" style="display:inline-block; width:12px; height:12px; border:2px solid var(--accent); border-top-color:transparent; border-radius:50%; animation:scanSpin 0.8s linear infinite"></span>'
        + '<span id="scanToastTitle" style="font-size:var(--f-sm); font-weight:700; color:var(--text); flex:1; min-width:0"></span>'
        + '<span onclick="document.getElementById(\'scanToast\').style.display=\'none\'" title="Hide" style="cursor:pointer; color:var(--text3); font-size:var(--f-sm); padding:0 2px">&times;</span></div>'
        + '<div id="scanToastMsg" style="font-size:var(--f-xs); color:var(--text2); margin-bottom:7px; line-height:1.4"></div>'
        + '<div style="height:5px; background:var(--surface3); border-radius:3px; overflow:hidden"><div id="scanToastBar" style="height:100%; width:0%; background:var(--accent); border-radius:3px; transition:width 0.2s"></div></div>';
      document.body.appendChild(el);
      if (!document.getElementById('scanSpinStyle')) {
        const st = document.createElement('style'); st.id = 'scanSpinStyle';
        st.textContent = '@keyframes scanSpin{to{transform:rotate(360deg)}}';
        document.head.appendChild(st);
      }
    }
    clearTimeout(this._scanToastTimer);
    el.style.display = 'block';
    const t = document.getElementById('scanToastTitle'); if (t) t.textContent = title || 'Scanning…';
    const bar = document.getElementById('scanToastBar'); if (bar) { bar.style.width = '0%'; bar.style.background = 'var(--accent)'; }
    const spin = document.getElementById('scanToastSpin'); if (spin) spin.style.display = 'inline-block';
  },
  _updateScanToast(done, total, label) {
    const bar = document.getElementById('scanToastBar'); if (bar && total) bar.style.width = Math.round((done / total) * 100) + '%';
    const m = document.getElementById('scanToastMsg'); if (m && label) m.textContent = label;
  },
  _closeScanToast(finalMsg, isError) {
    const el = document.getElementById('scanToast'); if (!el) return;
    const spin = document.getElementById('scanToastSpin'); if (spin) spin.style.display = 'none';
    const bar = document.getElementById('scanToastBar'); if (bar) { bar.style.width = '100%'; bar.style.background = isError ? 'var(--p4-txt)' : 'var(--ok-txt)'; }
    const t = document.getElementById('scanToastTitle'); if (t) t.textContent = isError ? 'Scan failed' : 'Done';
    const m = document.getElementById('scanToastMsg'); if (m) m.textContent = finalMsg || '';
    clearTimeout(this._scanToastTimer);
    this._scanToastTimer = setTimeout(() => { const e = document.getElementById('scanToast'); if (e) e.style.display = 'none'; }, 7000);
  },

  // Proactively warm modded content in the BACKGROUND so the Armoury, Loadouts and Pawn
  // Manager are ready instantly. Silent (no toast), cache-backed (only changed files re-read),
  // and lock-aware so it never collides with a manual scan or import. Runs at most once per
  // session unless forced. Requires a known RimWorld path (so it never pops a folder dialog).
  async _prefetchModData(force) {
    const s = this.state.settings || {};
    if (!force && s.autoScanMods === false) return;
    const dir = s.rimworldPath;
    if (!dir) return;                                  // no install path -> stay silent, never prompt
    if (this._ioBusy) return;                          // a manual scan/import is running
    if (this._modDataPrefetched && !force) return;     // already warmed this session
    this._modDataPrefetched = true;
    try {
      await this._mergeScannedTraitsGenes(dir, { background: true });             // silent, no user IO lock
      if (typeof this.scanModEquipment === 'function') await this.scanModEquipment('both', { silent: true }); // silent
    } catch (_) { /* background best-effort */ }
    finally {
      // Surface the freshly warmed catalogues, but DEFER to idle and skip the heavy full
      // renderAll (pawns/work table did not change) so huge modlists don't cause a jank.
      const refresh = () => {
        try {
          if (this._isUserTyping && this._isUserTyping()) return;
          if (typeof this._renderTabView === 'function') this._renderTabView(this.state.activeTab);
          const pm = document.getElementById('pawnManagerModal');
          if (pm && pm.classList.contains('show') && typeof this.renderPawnManager === 'function') this.renderPawnManager();
        } catch (_) { /* ignore */ }
      };
      if (typeof requestIdleCallback === 'function') requestIdleCallback(refresh, { timeout: 1500 });
      else setTimeout(refresh, 150);
    }
  },

  // Scan an install/mod folder for TraitDef + GeneDef (+ backstories + prosthetic
  // hediffs) and merge new (modded) ones in. Skips entries whose label already
  // exists in the vanilla lists. Shows a NON-BLOCKING toast so you can keep using
  // the app while it scans. Returns { traitsAdded, genesAdded, ... } or { error }.
  // Cross-operation lock so background scans/imports can't overlap each other and
  // race on shared state / IPC progress listeners. Returns false (and toasts) if busy.
  _acquireIO(label) {
    if (this._ioBusy) { try { this.toast && this.toast(`Please wait - "${this._ioBusy}" is still running.`); } catch (_) {} return false; }
    this._ioBusy = label || 'Working';
    return true;
  },
  _releaseIO() { this._ioBusy = null; },
  // True when the user is actively editing a field, so a background op shouldn't
  // yank the DOM out from under them with a forced re-render.
  _isUserTyping() {
    try {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable === true;
    } catch (_) { return false; }
  },

  async _mergeScannedTraitsGenes(dirPath, opts) {
    const bg = !!(opts && opts.background); // background prefetch: silent + does not hold the user IO lock
    if (!dirPath || !window.overlay || !window.overlay.scanTraitGeneDefs) return { traitsAdded: 0, genesAdded: 0 };
    if (!bg && !this._acquireIO('Scanning content')) return { error: 'busy' };
    // Toast helpers: silent for the background prefetch (bg), but a user-initiated scan always
    // shows its progress toast - even while a prefetch is running.
    const showT = (t) => { if (!bg) this._showScanToast(t); };
    const updT = (d, t, l) => { if (!bg) this._updateScanToast(d, t, l); };
    const closeT = (m, e) => { if (!bg) this._closeScanToast(m, e); };
    const yield_ = () => new Promise(r => setTimeout(r, 0));
    showT('Scanning RimWorld content');
    if (window.overlay.onTraitGeneScanProgress) {
      window.overlay.onTraitGeneScanProgress(d => {
        if (d.phase === 'listing') updT(0, 0, 'Finding mod files…');
        else updT(d.done, d.total, `Reading defs… ${(d.done || 0).toLocaleString()} / ${(d.total || 0).toLocaleString()} files`);
      });
    }
    let result;
    try { result = await window.overlay.scanTraitGeneDefs(dirPath); }
    catch (e) { if (!bg) this._releaseIO(); closeT('Scan error: ' + (e.message || 'failed'), true); return { error: e.message || 'scan failed' }; }
    if (!result || result.error) { if (!bg) this._releaseIO(); closeT('Scan error: ' + ((result && result.error) || 'failed'), true); return { error: (result && result.error) || 'scan failed' }; }

    const HARD_CAP = 600; // guard against save bloat on huge modlists
    let traitsAdded = 0, genesAdded = 0, backstoriesAdded = 0, prostheticsAdded = 0;
    try {
      // Parse + merge in phases, yielding between each so the UI stays responsive.
      updT(1, 4, 'Processing traits…'); await yield_();
      const vanillaTraitLabels = new Set((typeof TRAITS !== 'undefined' ? TRAITS : []).map(t => String(t.label || '').toLowerCase()));
      const parsedTraits = (typeof parseTraitsFromXML === 'function') ? parseTraitsFromXML(result.traitsXml) : {};
      for (const [id, t] of Object.entries(parsedTraits)) {
        if (vanillaTraitLabels.has(String(t.label || '').toLowerCase())) continue;
        if (this.state.customTraits[id]) { Object.assign(this.state.customTraits[id], t); continue; }
        if (Object.keys(this.state.customTraits).length >= HARD_CAP) break;
        this.state.customTraits[id] = t; traitsAdded++;
      }

      // C3 definition metadata is separate from the legacy single-value
      // defSources map. A definition is only complete when parser, provenance,
      // duplicate, and known unapplied-patch evidence all permit certainty.
      const c3Sources = result.definitionSources && typeof result.definitionSources === 'object'
        ? result.definitionSources : {};
      const c3Uncertainty = result.definitionUncertainty && typeof result.definitionUncertainty === 'object'
        ? result.definitionUncertainty : { byType: {}, dataset: {} };
      const finaliseC3Definition = (type, defName, entry) => {
        if (!entry) return entry;
        const sources = ((c3Sources[type] || {})[defName] || []).slice();
        const inheritedSources = entry._provenance && Array.isArray(entry._provenance.sources)
          ? entry._provenance.sources : [];
        const effectiveSources = [];
        const sourceKeys = new Set();
        for (const source of inheritedSources.concat(sources)) {
          const key = [source.modId, source.file, source.scanOrder, source.sourceOrder].join('|');
          if (sourceKeys.has(key)) continue;
          sourceKeys.add(key);
          effectiveSources.push(source);
        }
        const modIds = Array.from(new Set(effectiveSources.map(source => source.modId).filter(Boolean)));
        const reasons = Array.from(new Set((entry._completenessReasons || [])
          .concat(((c3Uncertainty.byType || {})[type] || {})[defName] || [])
          .concat(((c3Uncertainty.dataset || {})[type]) || [])));
        if (sources.length > 1) {
          if (reasons.indexOf('duplicateDefinitionConflict') < 0) reasons.push('duplicateDefinitionConflict');
          if (reasons.indexOf('sourceOrderingUncertain') < 0) reasons.push('sourceOrderingUncertain');
        }
        entry._provenance = effectiveSources.length
          ? { modId: modIds.length === 1 ? modIds[0] : null, sources: effectiveSources }
          : (entry._provenance || { modId: null, sources: [] });
        entry._completenessReasons = reasons;
        if (reasons.length) entry._completeness = 'partial';
        else if (!entry._completeness) entry._completeness = 'unknown';
        return entry;
      };

      const parseC3Catalog = (parser, xml, type) => {
        if (typeof parser !== 'function' || !xml) return {};
        const catalog = parser(xml, { sourceMap: c3Sources[type] || {} }) || {};
        for (const [defName, entry] of Object.entries(catalog)) finaliseC3Definition(type, defName, entry);
        return catalog;
      };

      try {
        this.state.scannedBodyDefs = parseC3Catalog(
          typeof parseBodyDefsFromXML === 'function' ? parseBodyDefsFromXML : null,
          result.bodyDefsXml,
          'BodyDef'
        );
        this.state.scannedBodyPartDefs = parseC3Catalog(
          typeof parseBodyPartDefsFromXML === 'function' ? parseBodyPartDefsFromXML : null,
          result.bodyPartDefsXml,
          'BodyPartDef'
        );
        this.state.scannedCapacityDefs = parseC3Catalog(
          typeof parsePawnCapacityDefsFromXML === 'function' ? parsePawnCapacityDefsFromXML : null,
          result.capacityDefsXml,
          'PawnCapacityDef'
        );
        this.state.scannedRaceBodyMap = parseC3Catalog(
          typeof parseRaceBodyMapFromXML === 'function' ? parseRaceBodyMapFromXML : null,
          result.raceThingDefsXml,
          'RaceThingDef'
        );
        const requirementUncertainty = result.requirementUncertainty || {
          workType: {}, workGiver: {}, raceWork: {}, dataset: {},
        };
        const appendRequirementReasons = (entry, completenessField, reasonsField, reasons) => {
          const merged = Array.from(new Set((entry[reasonsField] || []).concat(reasons || [])));
          entry[reasonsField] = merged;
          if (merged.length) entry[completenessField] = 'partial';
        };
        const workTypes = typeof parseWorkTypeDefsFromXML === 'function'
          ? parseWorkTypeDefsFromXML(result.workTypeDefsXml, {
              sourceMap: c3Sources.WorkTypeDef || {},
            }) : {};
        for (const [defName, entry] of Object.entries(workTypes)) {
          const narrow = (requirementUncertainty.workType || {})[defName] || {};
          appendRequirementReasons(entry, 'workTagsCompleteness', 'workTagsCompletenessReasons',
            (narrow.workTags || []).concat(((requirementUncertainty.dataset || {}).workTags) || []));
          appendRequirementReasons(entry, 'pathCatalogueCompleteness', 'pathCatalogueCompletenessReasons',
            (narrow.pathCatalogue || []).concat(((requirementUncertainty.dataset || {}).pathCatalogue) || []));
        }
        const workGivers = typeof parseWorkGiverDefsFromXML === 'function'
          ? parseWorkGiverDefsFromXML(result.workGiverDefsXml, {
              sourceMap: c3Sources.WorkGiverDef || {},
            }) : {};
        for (const [defName, entry] of Object.entries(workGivers)) {
          const narrow = (requirementUncertainty.workGiver || {})[defName] || {};
          appendRequirementReasons(entry, 'workTypeCompleteness', 'workTypeCompletenessReasons',
            (narrow.workType || []).concat(((requirementUncertainty.dataset || {}).workType) || []));
          appendRequirementReasons(entry, 'requiredCapacitiesCompleteness',
            'requiredCapacitiesCompletenessReasons',
            (narrow.requiredCapacities || []).concat(
              ((requirementUncertainty.dataset || {}).requiredCapacities) || []));
          appendRequirementReasons(entry, 'catalogueMembershipCompleteness',
            'catalogueMembershipCompletenessReasons',
            (narrow.catalogueMembership || []).concat(
              ((requirementUncertainty.dataset || {}).pathCatalogue) || []));
        }
        const racePolicies = typeof parseRaceWorkSettingsFromXML === 'function'
          ? parseRaceWorkSettingsFromXML(result.raceThingDefsXml, {
              sourceMap: c3Sources.RaceWorkSettings || c3Sources.RaceThingDef || {},
            }) : {};
        for (const [raceDefName, entry] of Object.entries(racePolicies)) {
          const narrow = (requirementUncertainty.raceWork || {})[raceDefName]
            || { dataset: [], entries: {} };
          appendRequirementReasons(entry, 'catalogueCompleteness', 'catalogueCompletenessReasons',
            (narrow.dataset || []).concat(((requirementUncertainty.dataset || {}).raceWork) || []));
          for (const [workType, reasons] of Object.entries(narrow.entries || {})) {
            entry.entryCompleteness[workType] = reasons.length ? 'partial'
              : (entry.entryCompleteness[workType] || entry.catalogueCompleteness);
            entry.entryCompletenessReasons[workType] = Array.from(new Set(
              (entry.entryCompletenessReasons[workType] || []).concat(reasons)
            ));
          }
        }
        this.state.scannedWorkTypeDefs = workTypes;
        this.state.scannedWorkGiverDefs = workGivers;
        this.state.scannedRaceWorkPolicies = racePolicies;
        this.state.requirementUncertainty = requirementUncertainty;
        this.state.activePackageResolution = typeof resolveC4ActivePackageIds === 'function'
          ? resolveC4ActivePackageIds(this.state.importMeta)
          : { ids: ['ludeon.rimworld'], completeness: 'unknown', reasons: ['providerUnavailable'] };
        this.state.definitionSources = c3Sources;
        this.state.definitionUncertainty = c3Uncertainty;
      } catch (_) {
        this.state.scannedBodyDefs = this.state.scannedBodyDefs || {};
        this.state.scannedBodyPartDefs = this.state.scannedBodyPartDefs || {};
        this.state.scannedCapacityDefs = this.state.scannedCapacityDefs || {};
        this.state.scannedRaceBodyMap = this.state.scannedRaceBodyMap || {};
        this.state.scannedWorkTypeDefs = this.state.scannedWorkTypeDefs || {};
        this.state.scannedWorkGiverDefs = this.state.scannedWorkGiverDefs || {};
        this.state.scannedRaceWorkPolicies = this.state.scannedRaceWorkPolicies || {};
      }

      // Build the full trait CATALOG (def + degree + conflicts) for the per-pawn trait
      // editor / .rws export. Keeps every trait incl. vanilla, deduped by def|degree.
      if (typeof parseTraitCatalogFromXML === 'function') {
        try {
          const cat = parseTraitCatalogFromXML(result.traitsXml);
          const seen = new Set();
          const merged = [];
          for (const e of cat) { const k = e.def + '|' + e.degree; if (seen.has(k)) continue; seen.add(k); merged.push(e); }
          if (merged.length) this.state.traitCatalog = merged;
        } catch (_) { /* leave existing catalog */ }
      }

      // Build the hediff CATALOG (every scanned HediffDef) for the health editor's add flow.
      if (typeof parseHediffCatalogFromXML === 'function' && result.allHediffsXml) {
        try {
          const hcat = parseHediffCatalogFromXML(result.allHediffsXml);
          const seen = new Set();
          const merged = [];
          for (const e of hcat) {
            finaliseC3Definition('HediffDef', e.def, e);
            if (seen.has(e.def)) continue;
            seen.add(e.def);
            merged.push(e);
          }
          if (merged.length) this.state.hediffCatalog = merged;
        } catch (_) { /* leave existing catalog */ }
      }

      // Ideology planner content: modded memes (structures keep their pick-one rule)
      // and modded rituals, merged into the same custom stores the save importer uses.
      let memesAdded = 0, ritualsAdded = 0;
      if (typeof parseMemesFromXML === 'function' && result.memesXml) {
        try {
          const parsedMemes = parseMemesFromXML(result.memesXml);
          if (!this.state.customMemes) this.state.customMemes = {};
          for (const [id, m] of Object.entries(parsedMemes)) {
            if (this.state.customMemes[id]) { Object.assign(this.state.customMemes[id], m); continue; }
            this.state.customMemes[id] = m; memesAdded++;
          }
        } catch (_) { /* leave existing memes */ }
      }
      if (typeof parseRitualsFromXML === 'function' && result.ritualPreceptsXml) {
        try {
          const parsedRituals = parseRitualsFromXML(result.ritualPreceptsXml);
          if (!this.state.customRituals) this.state.customRituals = {};
          for (const [id, r] of Object.entries(parsedRituals)) {
            if (this.state.customRituals[id]) { Object.assign(this.state.customRituals[id], r); continue; }
            this.state.customRituals[id] = r; ritualsAdded++;
          }
        } catch (_) { /* leave existing rituals */ }
      }
      this._lastIdeoScanCounts = { memesAdded, ritualsAdded };
      this._ideoFxCache = null;

      // Build the relation CATALOG (every installed, directly-assignable PawnRelationDef).
      if (typeof parseRelationCatalogFromXML === 'function' && result.relationDefsXml) {
        try {
          const rcat = parseRelationCatalogFromXML(result.relationDefsXml);
          const seen = new Set();
          const merged = [];
          for (const e of rcat) { if (seen.has(e.def)) continue; seen.add(e.def); merged.push(e); }
          if (merged.length) this.state.relationCatalog = merged;
        } catch (_) { /* leave existing catalog */ }
      }

      // Map each scanned def to its source mod packageId, so the editors can warn when
      // assigned content belongs to a mod that isn't active in the imported save.
      if (result.defSources && typeof result.defSources === 'object') {
        this.state.defSources = Object.assign(this.state.defSources || {}, result.defSources);
      }

      // Capture gene colours (skin/hair colour genes) so the gene displays can tint a
      // colour gene by its real RGB (vanilla + modded), instead of a hardcoded table.
      if (typeof parseGeneColorsFromXML === 'function' && result.genesXml) {
        try {
          const gc = parseGeneColorsFromXML(result.genesXml);
          if (Object.keys(gc).length) this.state.geneColors = Object.assign(this.state.geneColors || {}, gc);
        } catch (_) { /* leave existing */ }
      }

      // Build the passion CATALOG (modded VSE-framework passions, e.g. Alpha Skills).
      if (typeof parsePassionCatalogFromXML === 'function' && result.passionDefsXml) {
        try {
          const pcat = parsePassionCatalogFromXML(result.passionDefsXml);
          if (pcat.length) this.state.passionCatalog = pcat; // parser already de-dupes by defName
        } catch (_) { /* leave existing catalog */ }
      }

      updT(2, 4, 'Processing genes…'); await yield_();
      const vanillaGeneLabels = new Set((typeof GENES !== 'undefined' ? GENES : []).map(g => String(g.label || '').toLowerCase()));
      const parsedGenes = (typeof parseGenesFromXML === 'function') ? parseGenesFromXML(result.genesXml) : {};
      for (const [id, g] of Object.entries(parsedGenes)) {
        if (vanillaGeneLabels.has(String(g.label || '').toLowerCase())) continue;
        if (this.state.customGenes[id]) { Object.assign(this.state.customGenes[id], g); continue; }
        if (Object.keys(this.state.customGenes).length >= HARD_CAP) break;
        this.state.customGenes[id] = g; genesAdded++;
      }

      // Backstories: keep story text for ALL scanned (vanilla too) keyed by id and
      // title; add modded ones (not vanilla / not already custom) to customBackstories.
      updT(3, 4, 'Processing backstories…'); await yield_();
      if (typeof parseBackstoriesFromXML === 'function') {
        this.state.backstoryStories = this.state.backstoryStories || {};
        this.state.backstoryStoriesByTitle = this.state.backstoryStoriesByTitle || {};
        this.state.customBackstories = this.state.customBackstories || {};
        const vanillaBsIds = new Set((typeof BACKSTORIES !== 'undefined' ? BACKSTORIES : []).map(b => b.id));
        const parsedBs = parseBackstoriesFromXML(result.backstoriesXml);
        for (const [id, bs] of Object.entries(parsedBs)) {
          if (bs.desc) {
            this.state.backstoryStories[id] = bs.desc;
            if (bs.title) this.state.backstoryStoriesByTitle[bs.title.toLowerCase()] = bs.desc;
          }
          if (vanillaBsIds.has(id) || this.state.customBackstories[id]) continue;
          if (Object.keys(this.state.customBackstories).length >= HARD_CAP * 4) continue;
          this.state.customBackstories[id] = {
            slot: bs.slot, title: bs.title, titleShort: bs.titleShort,
            skills: bs.skills || {}, incapable: bs.incapable || [],
            permissionSources: Array.isArray(bs.permissionSources) ? bs.permissionSources : [],
            desc: bs.desc, modSource: bs.modSource || 'Scanned'
          };
          backstoriesAdded++;
        }
        if (this._invalidateBsCache) this._invalidateBsCache();
      }

      // Prosthetic/implant efficiencies (added-part hediffs) for the health tooltip.
      updT(4, 4, 'Processing prosthetics…'); await yield_();
      if (typeof parseProstheticsFromXML === 'function') {
        this.state.prostheticEfficiency = this.state.prostheticEfficiency || {};
        const parsedP = parseProstheticsFromXML(result.hediffsXml);
        for (const [def, info] of Object.entries(parsedP)) { this.state.prostheticEfficiency[def] = info; prostheticsAdded++; }
      }
    } finally {
      if (!bg) this._releaseIO();
    }

    this.triggerAutoSave();
    const parts = [];
    if (traitsAdded) parts.push(traitsAdded + ' traits');
    if (genesAdded) parts.push(genesAdded + ' genes');
    if (backstoriesAdded) parts.push(backstoriesAdded + ' backstories');
    if (prostheticsAdded) parts.push(prostheticsAdded + ' prosthetic parts');
    closeT(parts.length ? 'Added ' + parts.join(', ') + '.' : 'Scan complete - nothing new to add.', false);
    return { traitsAdded, genesAdded, backstoriesAdded, prostheticsAdded, totalScanned: result.totalScanned, reusedFromCache: result.reusedFromCache, freshlyRead: result.freshlyRead };
  },

  // Resolve the RimWorld install folder without bothering the user when possible:
  // a previously-used path first, then a silent auto-detect, and only a folder
  // dialog as a last resort. Remembers whatever is found.
  async _resolveRimworldPath() {
    let p = this.state.settings.rimworldPath;
    if (!p && window.overlay && window.overlay.findRimworldPath) {
      try { p = await window.overlay.findRimworldPath(); } catch (_) { /* ignore */ }
    }
    if (!p && window.overlay && window.overlay.pickDirectory) {
      try { p = await window.overlay.pickDirectory(); } catch (_) { /* ignore */ }
    }
    if (p) { this.state.settings.rimworldPath = p; this.triggerAutoSave(); }
    return p || null;
  },

  // Pick a folder and scan it for modded traits & genes (used by the Trait/Gene
  // managers). statusElId is the id of an element to write progress into.
  // Ideology tab scan pill: runs the same cache-backed install scan and surfaces the
  // modded memes/rituals it found, then refreshes the planner.
  async scanIdeologyMods() {
    try {
      const dirPath = await this._resolveRimworldPath();
      if (!dirPath) return;
      await this._mergeScannedTraitsGenes(dirPath);
      const c = this._lastIdeoScanCounts || { memesAdded: 0, ritualsAdded: 0 };
      if (c.memesAdded || c.ritualsAdded) {
        this.toast(`Ideology scan: ${c.memesAdded} modded meme${c.memesAdded !== 1 ? 's' : ''}, ${c.ritualsAdded} ritual${c.ritualsAdded !== 1 ? 's' : ''} added.`);
      } else {
        this.toast('Ideology scan: no new modded memes or rituals found.');
      }
      this.renderIdeology();
    } catch (_) { /* the scan toast surfaces any error */ }
  },

  async scanTraitsGenesFromDisk(statusElId) {
    try {
      const dirPath = await this._resolveRimworldPath();
      if (!dirPath) return;
      // Progress and the final summary are shown by the non-blocking scan toast
      // (_showScanToast / _closeScanToast inside _mergeScannedTraitsGenes); no status
      // text is written under the pills.
      await this._mergeScannedTraitsGenes(dirPath);
      // Don't yank the DOM out from under the user if they started typing while
      // the scan ran. The new data is in state and shows on the next render.
      if (!this._isUserTyping || !this._isUserTyping()) {
        this.renderAll();
        // Refresh the Trait Manager list so newly-added traits show immediately
        // (the gene picker lives inside the xenotype editor and refreshes on reopen).
        if (statusElId === 'traitScanStatus') this.openTraitEditor();
        // Refresh the Pawn Manager so the newly scanned trait / health / relation
        // catalogues are available in the per-pawn editors right away.
        if (statusElId === 'pmScanStatus' && typeof this.renderPawnManager === 'function') this.renderPawnManager();
      }
    } catch (_) { /* the scan toast surfaces any error */ }
  },
  deleteCustomXeno(id) {
    this.showConfirm('Delete this xenotype?', 'Delete').then(() => {
      delete this.state.customXenotypes[id];
      this.state.pawns.forEach(p => { if (p.xenotype === id) p.xenotype = 'baseliner'; });
      this.openXenoEditor();
      this.renderAll();
      this.triggerAutoSave();
    }).catch(() => {});
  },
  _setXenoSkillMod(xenoId, skillId, value) {
    const x = this.state.customXenotypes[xenoId];
    if (!x) return;
    if (!x.skillMods) x.skillMods = {};
    const v = parseInt(value) || 0;
    if (v === 0) delete x.skillMods[skillId];
    else x.skillMods[skillId] = v;
    this.triggerAutoSave();
  },
  _toggleXenoIncap(xenoId, incapId) {
    const x = this.state.customXenotypes[xenoId];
    if (!x) return;
    if (!x.incapable) x.incapable = [];
    const idx = x.incapable.indexOf(incapId);
    if (idx > -1) x.incapable.splice(idx, 1);
    else x.incapable.push(incapId);
    this.openXenoEditor(xenoId);
    this.renderAll();
    this.triggerAutoSave();
  },
  _toggleXenoGene(xenoId, geneId) {
    const x = this.state.customXenotypes[xenoId];
    if (!x) return;
    if (!x.genes) x.genes = [];
    const idx = x.genes.indexOf(geneId);
    if (idx > -1) x.genes.splice(idx, 1);
    else x.genes.push(geneId);
    this.openXenoEditor(xenoId);
    this.renderAll();
    this.triggerAutoSave();
  },
  addCustomGene() {
    if (!this._checkCap(this.state.customGenes, 'customGenes', 'custom genes')) return;
    this.showMultiPrompt('Add Custom Mod Gene', [
      { id: 'label', label: 'Gene Name', placeholder: 'e.g. Tunneler' },
      { id: 'category', label: 'Category', placeholder: 'e.g. Mining, Body, Combat', defaultVal: 'Mod' },
      { id: 'description', label: 'Description', placeholder: 'What does this gene do?' },
      { id: 'skillKey', label: 'Skill Bonus (skill id)', placeholder: 'e.g. mine, shoot, craft (optional)' },
      { id: 'skillVal', label: 'Skill Bonus Value', placeholder: 'e.g. 4 or -2 (optional)', defaultVal: '0' },
      { id: 'workSpeedVal', label: 'Work Speed %', placeholder: 'e.g. 10 or -15 (optional)', defaultVal: '0' }
    ]).then(vals => {
      if (!vals.label) return;
      const id = 'gene_mod_' + Math.random().toString(36).slice(2,7);
      const gene = {
        id, label: vals.label,
        category: vals.category || 'Mod',
        description: vals.description || '',
        isCustom: true
      };
      const skillKey = (vals.skillKey || '').trim();
      const skillVal = parseInt(vals.skillVal) || 0;
      if (skillKey && skillVal !== 0) gene.skillMods = { [skillKey]: skillVal };
      const ws = parseInt(vals.workSpeedVal) || 0;
      if (ws !== 0) gene.workSpeed = ws / 100;
      this.state.customGenes[id] = gene;
      this.triggerAutoSave();
      // Re-render the current xeno detail view if open
      if (this._xenoEditorView !== 'list') this.openXenoEditor(this._xenoEditorView);
    }).catch(() => {});
  },

  // -- TRAIT EDITOR MODAL --
  _traitEditorView: 'list', // 'list' or trait id for detail view
  openTraitEditor(viewId) {
    const modal = document.getElementById('traitModal');
    if (!modal) return;
    this._traitEditorView = viewId || 'list';
    const body = document.getElementById('traitModalBody');

    if (this._traitEditorView !== 'list') {
      // DETAIL VIEW, edit a custom trait
      const tId = this._traitEditorView;
      const t = this.state.customTraits[tId];
      if (!t) { this._traitEditorView = 'list'; this.openTraitEditor(); return; }

      body.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px">
          <button class="btn btn-sm" onclick="App.openTraitEditor('list')" style="flex-shrink:0">Back</button>
          <h2 class="modal-title" style="margin:0; flex:1">Edit: ${_escapeHtml(t.label)}</h2>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:16px">
          <div>
            <label class="settings-label" style="font-size:var(--f-xs)">Name</label>
            <input type="text" class="skill-input" style="width:100%" value="${_escapeHtml(t.label)}" oninput="App.state.customTraits['${tId}'].label=this.value; App.triggerAutoSave()">
          </div>
          <div>
            <label class="settings-label" style="font-size:var(--f-xs)">Description</label>
            <input type="text" class="skill-input" style="width:100%" value="${_escapeHtml(t.description || '')}" oninput="App.state.customTraits['${tId}'].description=this.value; App.triggerAutoSave()">
          </div>
          ${_modInput(t.modSource, "App.state.customTraits['"+tId+"']")}
        </div>

        <div class="section-title section-title--sm">Effect Values</div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:16px">
          <div>
            <label class="settings-label" style="font-size:var(--f-xs)">Work Speed</label>
            <input type="number" step="0.05" class="skill-input" style="width:100%; text-align:center" value="${t.workSpeed || 0}"
              onchange="App.state.customTraits['${tId}'].workSpeed=parseFloat(this.value)||0; App.renderAll(); App.triggerAutoSave()">
            <div style="font-size:calc(9px * var(--font-scale)); color:var(--text3); margin-top:2px">e.g. 0.35 = +35%</div>
          </div>
          <div>
            <label class="settings-label" style="font-size:var(--f-xs)">Learning Rate</label>
            <input type="number" step="0.05" class="skill-input" style="width:100%; text-align:center" value="${t.learningRate || 0}"
              onchange="App.state.customTraits['${tId}'].learningRate=parseFloat(this.value)||0; App.triggerAutoSave()">
            <div style="font-size:calc(9px * var(--font-scale)); color:var(--text3); margin-top:2px">e.g. 0.75 = +75%</div>
          </div>
          <div>
            <label class="settings-label" style="font-size:var(--f-xs)">Break Threshold</label>
            <input type="number" step="0.01" class="skill-input" style="width:100%; text-align:center" value="${t.breakThreshold || 0}"
              onchange="App.state.customTraits['${tId}'].breakThreshold=parseFloat(this.value)||0; App.renderAll(); App.triggerAutoSave()">
            <div style="font-size:calc(9px * var(--font-scale)); color:var(--text3); margin-top:2px">e.g. 0.08 = +8%</div>
          </div>
        </div>

        <div class="section-title section-title--sm">Skill Modifiers</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:6px; margin-bottom:16px">
          ${SKILLS.map(s => {
            const val = (t.skillMods || {})[s.id] || 0;
            return `<div style="display:flex; align-items:center; gap:4px; background:var(--surface2); padding:4px 8px; border-radius:6px">
              <span style="font-size:var(--f-xs); flex:1; color:var(--text2)">${s.short}</span>
              <input type="number" class="skill-input" style="width:50px; text-align:center; font-size:var(--f-xs)" value="${val}"
                onchange="App._setTraitSkillMod('${tId}','${s.id}',this.value)">
            </div>`;
          }).join('')}
        </div>
      `;
      modal.classList.add('show');
      return;
    }

    // LIST VIEW
    const _importedTraitCount = Object.values(this.state.customTraits || {}).filter(t => /imported/i.test(t && t.modSource || '')).length;
    body.innerHTML = `
      <h2 class="modal-title" style="margin-bottom:12px; display:flex; align-items:center; gap:8px">Trait Manager${Object.keys(this.state.customTraits || {}).length ? `<span class="mod-badge">${Object.keys(this.state.customTraits || {}).length} custom</span>` : ''}</h2>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:10px">
        <button class="btn btn-accent" onclick="App.addCustomTrait()">+ Add Custom Trait</button>
        <button class="btn" onclick="App.scanTraitsGenesFromDisk('traitScanStatus')" title="Scan your RimWorld install / mod folder for modded traits (and genes) and import them by name">Scan Game/Mod Folder</button>
        ${_importedTraitCount ? `<button class="btn btn-sm btn-danger" onclick="App.removeAllImportedTraits()" title="Remove every trait that was auto-created from save imports" style="border-radius:14px; padding:4px 12px">Remove all imported (${_importedTraitCount})</button>` : ''}
      </div>
      <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px">
        ${this.allTraits.map(t => {
          const isCustom = t.id in (this.state.customTraits || {});
          const effectParts = [];
          if (t.workSpeed) effectParts.push('Work:'+(t.workSpeed>0?'+':'')+(t.workSpeed*100).toFixed(0)+'%');
          if (t.breakThreshold) effectParts.push('Break:'+(t.breakThreshold>0?'+':'')+(t.breakThreshold*100).toFixed(0)+'%');
          if (t.learningRate) effectParts.push('Learn:'+(t.learningRate>0?'+':'')+(t.learningRate*100).toFixed(0)+'%');
          const skillStr = Object.entries(t.skillMods||{}).map(([k,v])=>k+':'+(v>0?'+':'')+v).join(' ');
          if (skillStr) effectParts.push(skillStr);
          const desc = (typeof _cleanGrammarText === 'function') ? _cleanGrammarText(t.description) : t.description;
          return `
          <div style="display:flex; align-items:center; gap:8px; background:var(--surface2); padding:6px 10px; border-radius:6px">
            <div style="flex:1">
              <div style="font-weight:700; font-size:var(--f-sm)">${_escapeHtml(t.label)}${_modBadge(t)}</div>
              <div style="font-size:var(--f-xs); color:var(--text3)">${_escapeHtml(desc)}${effectParts.length ? ' <span style="color:var(--accent)">['+effectParts.join(', ')+']</span>' : ''}</div>
            </div>
            ${isCustom ? `<button class="btn btn-sm" onclick="App.openTraitEditor('${t.id}')">Edit</button>
            <button class="pawn-del" onclick="App.deleteCustomTrait('${t.id}')">&times;</button>` : ''}
          </div>`;
        }).join('')}
      </div>
    `;
    modal.classList.add('show');
  },
  closeTraitEditor() {
    document.getElementById('traitModal')?.classList.remove('show');
  },
  addCustomTrait() {
    if (!this._checkCap(this.state.customTraits, 'customTraits', 'custom traits')) return;
    this.showMultiPrompt('Add Custom Trait', [
      { id: 'label', label: 'Trait Name', placeholder: 'e.g. Industrious' },
      { id: 'description', label: 'Description', placeholder: 'Optional description' }
    ]).then(vals => {
      if (!vals.label) return;
      const id = 'trait_' + Math.random().toString(36).slice(2,7);
      this.state.customTraits[id] = { id, label: vals.label, description: vals.description || '', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} };
      this.openTraitEditor(id); // Jump to editing the new trait
      this.triggerAutoSave();
    }).catch(() => {});
  },
  deleteCustomTrait(id) {
    this.showConfirm('Delete this trait?', 'Delete').then(() => {
      delete this.state.customTraits[id];
      this.state.pawns.forEach(p => {
        if (p.traits) p.traits = p.traits.filter(t => t !== id);
      });
      this.openTraitEditor();
      this.renderAll();
      this.triggerAutoSave();
    }).catch(() => {});
  },
  // Remove every custom trait that was auto-created from a save import (modSource
  // "Imported..."), and detach them from pawns. Scanned-mod and hand-made customs stay.
  removeAllImportedTraits() {
    const ids = Object.keys(this.state.customTraits || {})
      .filter(id => /imported/i.test((this.state.customTraits[id] || {}).modSource || ''));
    if (!ids.length) { this.toast('No imported traits to remove.'); return; }
    this.showConfirm(`Remove all ${ids.length} imported trait(s)? Scanned and custom traits are kept.`, 'Remove All').then(() => {
      const dead = new Set(ids);
      ids.forEach(id => delete this.state.customTraits[id]);
      this.state.pawns.forEach(p => { if (p.traits) p.traits = p.traits.filter(t => !dead.has(t)); });
      this.openTraitEditor();
      this.renderAll();
      this.triggerAutoSave();
      this.toast(`Removed ${ids.length} imported trait(s).`);
    }).catch(() => {});
  },
  _setTraitSkillMod(traitId, skillId, value) {
    const t = this.state.customTraits[traitId];
    if (!t) return;
    if (!t.skillMods) t.skillMods = {};
    const v = parseInt(value) || 0;
    if (v === 0) delete t.skillMods[skillId];
    else t.skillMods[skillId] = v;
    this.renderAll();
    this.triggerAutoSave();
  },
});

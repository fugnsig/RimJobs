/**
 * RENDERING
 * renderAll orchestration, render caches, pawn cards, sidebar,
 * table (horizontal + vertical), dashboard, summary bar.
 * Auto-split from app.js - methods are assigned onto the App object.
 */
Object.assign(App, {
  renderAll(opts) {
    Perf.start('renderAll.total');
    Perf._activeOp = 'renderAll';
    const safe = (fn, name) => { try { Perf.measure('render.' + name, fn); } catch(e) { console.error(`renderAll: ${name} failed`, e); } };
    let _c7Map = (opts && opts.contextMap) || null;
    const c7Map = () => _c7Map ||= Perf.measure('c7.contextMap.total', () =>
      this._c7PawnContextMap(this.state.pawns, this._c7EvidenceOptionsByPawn));
    if (!opts || !opts.skipSidebar) safe(() => this.renderSidebar(c7Map()), 'sidebar');
    safe(() => this.renderSummary(c7Map()), 'summary');
    if (!opts || !opts.skipTable) safe(() => this.renderTable(c7Map()), 'table');
    if (!opts || !opts.skipActiveView) {
      if (this.state.activeTab === 'dash') safe(() => this.renderDashboard(c7Map()), 'dashboard');
      if (this.state.activeTab === 'blue') safe(() => this.renderBlueprint(), 'blueprint');
      if (this.state.activeTab === 'sched') safe(() => this.renderSchedule(c7Map()), 'schedule');
      if (this.state.activeTab === 'armoury') safe(() => this.renderArmoury(), 'armoury');
      if (this.state.activeTab === 'relations') safe(() => this._relRefresh(), 'relations');
      if (this.state.activeTab === 'records') safe(() => this.renderRecords(), 'records');
    }
    Perf._activeOp = null;
    Perf.end('renderAll.total');
    Perf.increment('renderAll.calls');
  },
  
  // Pre-built option HTML caches (rebuilt each render cycle)
  _rcXenoOpts: '', // xenotype <option> html (no selection)
  _rcRoleOpts: '', // role <option> html (no selection)
  _rcTraitsSorted: null, // sorted trait array for current render cycle

  _buildRenderCache() {
    // Xenotype options
    this._rcXenoOpts = Object.entries(this.allXenotypes).map(([id, x]) =>
      '<option value="' + id + '">' + _escapeHtml(x.label) + '</option>'
    ).join('');
    // Role options
    this._rcRoleOpts = this.allRoles.map(r =>
      '<option value="' + r.id + '">Role: ' + _escapeHtml(r.label)
        + (r.modSource ? ' - ' + _escapeHtml(r.modSource) : '') + '</option>'
    ).join('');
    // Sorted traits (alphabetical -pawn-specific on/off ordering applied at render time)
    this._rcTraitsSorted = [...this.allTraits].sort((a, b) => a.label.localeCompare(b.label));
    // Trait count for cache invalidation when custom traits change
    this._rcTraitCount = this.allTraits.length;
  },

  // Lightweight hash of pawn state that affects its sidebar card HTML.
  // When this changes, the card must be re-rendered; otherwise skip it.
  _pawnCardHash(p) {
    const t = p.traits || [];
    const skills = p.skills || {};
    const passions = p.passions || {};
    const s = SKILLS.map(sk => (skills[sk.id] ?? '') + ',' + (passions[sk.id] || 0)).join(';');
    const provider = this.state.effectivenessProvider || {};
    const providerKey = String(provider.providerFingerprint || '') + ':'
      + JSON.stringify(provider.runtimeFingerprint || null);
    const h = p.health ? p.health.length : 0;
    return [
      p.name, p.nickname||'', p.firstName||'', p.lastName||'',
      p.bioAge, p.chronoAge, p.xenotype, p.role||'', p.gender||'',
      p.childhood||'', p.adulthood||'', p.collapsed?1:0, p.traitsCollapsed?1:0,
      p.moodPreset||'', p.bio||'', p.avatarBg||'', p.avatarColor||'',
      t.join(','), s, h, (p.incapable||[]).join(','), p.downed ? 1 : 0,
      this._rcTraitCount, providerKey
    ].join('|');
  },

  _xenoOptsWithSelection(selectedId) {
    if (!selectedId) return this._rcXenoOpts;
    return this._rcXenoOpts.replace('value="' + selectedId + '"', 'value="' + selectedId + '" selected');
  },

  _roleOptsWithSelection(selectedId) {
    if (!selectedId) return this._rcRoleOpts;
    return this._rcRoleOpts.replace('value="' + selectedId + '"', 'value="' + selectedId + '" selected');
  },

  // Build HTML for a single pawn sidebar card (extracted for differential rendering)
  _renderPawnCardHtml(p, compact, pawnCtx) {
    const xeno = this.getXeno(p.xenotype); const collapsed = p.collapsed; const traitsCollapsed = p.traitsCollapsed || false;
    const xenoIncap = xeno.incapable || [];
    const role = this.getRole(p.role || 'none');
    const roleIncap = role.incap || [];
    const cbsSb = this._resolveBackstory(p.childhood); const absSb = this._resolveBackstory(p.adulthood);
    const bsIncapSb = [...(cbsSb ? cbsSb.incapable : []), ...(absSb ? absSb.incapable : [])];
    const allIncap = [...new Set([...(p.incapable||[]), ...xenoIncap, ...roleIncap, ...bsIncapSb])];

    const avatarBg = _safeColor(p.avatarBg || AVATARS[p.avatarIdx].bg);
    const avatarColor = _safeColor(p.avatarColor || AVATARS[p.avatarIdx].color, '#ffffff');
    const displayName = _pawnDisplayName(p, '');
    const avatarIcon = _escapeHtml((displayName || '?')[0].toUpperCase());
    const pawnName = _escapeHtml(displayName);
    const hasFullName = p.firstName || p.lastName;
    const fullNameStr = hasFullName
      ? _escapeHtml([p.firstName, p.lastName]
          .map(value => _capitalisePawnName(value).trim()).filter(Boolean).join(' ')) : '';
    const xenoColor = _safeColor(xeno.color);

    const wsProjection = this._c5WorkSpeedDisplay(p, pawnCtx);
    const wsMod = wsProjection.value;
    const wsDisplay = (wsMod * 100).toFixed(0) + '%';
    const wsColor = wsMod > 1.05 ? 'var(--accent)' : wsMod < 0.95 ? 'var(--p4-txt)' : 'var(--text3)';
    const wsTitle = 'Work Speed Modifier' + (wsProjection.notice
      ? ' · ' + wsProjection.notice : '');
    const ageDisplay = p.bioAge != null ? `${p.bioAge}y` : '';
    const chronoDisplay = p.chronoAge != null && p.chronoAge !== p.bioAge ? ` (${p.chronoAge})` : '';
    const uvLevel = (xeno.uvSensitivity || 0);
    const uvBadge = uvLevel === 2 ? 'UV+' : uvLevel === 1 ? 'UV' : '';

    if (compact) {
      return `<div class="pawn-card compact" data-pawn-id="${p.id}" style="--xeno-color:${xenoColor}"
        draggable="true" ondragstart="App.handlePawnDragStart(event, '${p.id}')"
        ondragover="App.handlePawnDragOver(event)" ondragleave="App.handlePawnDragLeave(event)"
        ondrop="App.handlePawnDrop(event, '${p.id}')" ondragend="App.handlePawnDragEnd(event)">
        <div class="pawn-xeno-strip"></div>
        <div class="pawn-card-inner" style="padding:var(--gap-sm) var(--gap-md)">
          <div class="pawn-header" style="margin-bottom:0">
            <div class="avatar" style="width:calc(var(--f-base) * 1.6); height:calc(var(--f-base) * 1.6); font-size:var(--f-xs); background:${avatarBg};color:${avatarColor}">${avatarIcon}</div>
            <input class="pawn-name" draggable="false" value="${pawnName}" oninput="App.renameNickname('${p.id}', this.value)" style="font-size:var(--f-sm)">
            ${ageDisplay ? `<span style="font-size:var(--f-xs); color:var(--text3); font-weight:600; margin-right:2px" title="Bio age${chronoDisplay ? ' (Chrono: '+p.chronoAge+')' : ''}">${ageDisplay}</span>` : ''}${uvBadge ? `<span style="font-size:var(--f-xs); color:var(--accent); margin-right:2px" title="${uvLevel===2?'Intense':'Mild'} UV Sensitivity">${uvBadge}</span>` : ''}<div class="ws-pill" style="font-size:var(--f-xs); color:${wsColor}; font-weight:700; margin-right:4px" title="${_escapeHtml(wsTitle)}">${wsDisplay}</div>
            <button class="pawn-del" onclick="App.duplicatePawn('${p.id}')" title="Clone Pawn" style="width:calc(var(--f-base) * 1.4); height:calc(var(--f-base) * 1.4); font-size:var(--f-xs); margin-right:4px; color:var(--accent)">Copy</button>
            <button class="pawn-del" onclick="App.removePawn('${p.id}')" style="width:calc(var(--f-base) * 1.4); height:calc(var(--f-base) * 1.4); font-size:var(--f-xs)">&times;</button>
          </div>
        </div>
        <div class="pawn-card-resize" onmousedown="App.initPawnCardResize(event)" title="Drag to resize all cards"></div>
      </div>`;
    }

    // Build trait chips HTML
    const pTraits = p.traits || [];
    const pSet = new Set(pTraits);
    // Stable order (no selected-first re-sort) so toggling a chip doesn't make it jump.
    const traitsSorted = this._rcTraitsSorted;
    const PREVIEW = 6;
    const traitBtn = (t, hidden) => { const isCust = t.id in (App.state.customTraits||{}); const desc = (typeof _cleanGrammarText === 'function') ? _cleanGrammarText(t.description) : t.description; return `<span style="position:relative;display:inline-flex${hidden?';display:none':''}"><button class="trait-chip ${pSet.has(t.id)?'on':''}" onclick="App.toggleTrait('${p.id}', '${t.id}'); App.renderSidebar()" title="${_escapeHtml(desc)}">${_escapeHtml(t.label)}</button>${isCust ? `<span class="trait-del-badge" onclick="event.stopPropagation(); App.deleteCustomTrait('${t.id}')" title="Delete custom trait globally">&times;</span>` : ''}</span>`; };
    let traitsHtml;
    if (traitsCollapsed) {
      traitsHtml = '<div class="trait-chips" style="opacity:0.75">'
        + traitsSorted.map((t, i) => traitBtn(t, i >= PREVIEW)).join('')
        + (traitsSorted.length > PREVIEW ? `<span class="trait-more-label" style="font-size:var(--f-xs);color:var(--text3);align-self:center;padding:2px 4px">+${traitsSorted.length - PREVIEW} more...</span>` : '')
        + '</div>';
    } else {
      traitsHtml = '<div class="trait-chips">' + traitsSorted.map(t => traitBtn(t, false)).join('') + '</div>';
    }

    // Build skills HTML
    const skillsHtml = SKILLS.map(s => {
      const base = p.skills[s.id];
      const display = this._c5SkillDisplay(p, pawnCtx, s.id);
      const eff = display.level; const mod = (eff - base);
      const lvlClass = eff >= 20 ? 'lvl-max' : eff >= 10 ? 'lvl-high' : eff >= 5 ? 'lvl-mid' : 'lvl-low';
      const pmeta = this._passionMeta(this._passionValue(p, s.id));
      const pcls = pmeta.modded ? 'passion-modded' : (pmeta.bucket === 1 ? 'on-1' : pmeta.bucket === 2 ? 'on-2' : '');
      const spark = this.renderSparkline(p.skillHistory?.[s.id]);
      const skillTitle = s.name + ': Base ' + base
        + (mod ? ' + ' + mod + ' Modifiers' : '') + ' = ' + eff + ' Total'
        + (display.notice ? ' · ' + display.notice : '');
      return `<div class="skill-row" data-skill-id="${s.id}" title="${_escapeHtml(skillTitle)}"><span class="skill-name">${s.name}</span><div class="skill-stepper"><button class="step-btn" onclick="App.setSkill('${p.id}','${s.id}',${Math.max(0,base-1)})">&#8722;</button><span class="step-val ${eff>12?'skill-high':eff>7?'skill-mid':''}">${base}</span><button class="step-btn" onclick="App.setSkill('${p.id}','${s.id}',${Math.min(20,base+1)})">+</button>${spark}</div><div class="skill-bar"><div class="skill-fill ${lvlClass}" style="width:${(eff/20)*100}%"></div></div><button class="passion-btn ${pcls}" title="${_escapeHtml(pmeta.label)}" onclick="App.togglePassion('${p.id}','${s.id}', 1)" oncontextmenu="event.preventDefault(); App.togglePassion('${p.id}','${s.id}', -1)">${_escapeHtml(pmeta.glyph)}</button></div>`;
    }).join('');

    // Build incapable HTML
    const incapHtml = allIncap.length ? `<div class="incap-section"><div class="incap-title">Incapable (${allIncap.length})</div><div class="incap-chips">${allIncap.map(icId => { const ic = INCAP_OPTIONS.find(o => o.id === icId); const label = ic ? ic.label : this._defLabelOrHumanize(icId); const isLocked = xenoIncap.includes(icId)||roleIncap.includes(icId)||bsIncapSb.includes(icId); return '<button class="incap-chip on '+(isLocked?'xeno-locked':'')+'" onclick="App.toggleIncap(\''+p.id+'\', \''+icId+'\')" title="'+(isLocked?'Locked by Xenotype, Role or Backstory':'Click to remove')+'">'+_escapeHtml(label)+'</button>'; }).join('')}</div></div>` : '';

    // Build health HTML
    const fh = this._filteredHealth(p);
    const healthHtml = (fh.length || p.downed) ? '<div class="incap-section"><div class="incap-title">Health ('+fh.length+')</div><div style="display:flex;flex-wrap:wrap;gap:3px">'+this._renderHealthSummary(p)+'</div></div>' : '';

    // Backstory labels
    const _capFirst = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    const cbsTitle = p.childhood ? _escapeHtml(_capFirst(this._resolveBackstory(p.childhood)?.title || p.childhood)) : 'None';
    const absTitle = p.adulthood ? _escapeHtml(_capFirst(this._resolveBackstory(p.adulthood)?.title || p.adulthood)) : 'None';

    return `<div class="pawn-card" data-pawn-id="${p.id}" style="--xeno-color:${xenoColor}"
      draggable="true" ondragstart="App.handlePawnDragStart(event, '${p.id}')"
      ondragover="App.handlePawnDragOver(event)" ondragleave="App.handlePawnDragLeave(event)"
      ondrop="App.handlePawnDrop(event, '${p.id}')" ondragend="App.handlePawnDragEnd(event)">
      <div class="pawn-xeno-strip"></div>
      <div class="pawn-card-inner">
        <div class="pawn-header">
          <div class="avatar" style="background:${avatarBg};color:${avatarColor}">${avatarIcon}</div>
          <input class="pawn-name" draggable="false" value="${pawnName}" oninput="App.renameNickname('${p.id}', this.value)">
          ${ageDisplay ? `<span style="font-size:var(--f-xs); color:var(--text3); font-weight:600; margin-right:4px" title="Bio age${chronoDisplay ? ' (Chrono: '+p.chronoAge+')' : ''}">${ageDisplay}</span>` : ''}${uvBadge ? `<span style="font-size:var(--f-xs); color:var(--accent); margin-right:4px" title="${uvLevel===2?'Intense':'Mild'} UV Sensitivity">${uvBadge}</span>` : ''}
          <div class="ws-pill" style="font-size:var(--f-xs); padding:2px 6px; background:var(--surface3); border:1px solid ${wsColor}; border-radius:12px; color:${wsColor}; margin-right:8px; font-weight:700" title="${_escapeHtml(wsTitle)}">${wsDisplay}</div>
          <button class="icon-btn collapse-btn" onclick="App.toggleCollapse('${p.id}')">${collapsed?'▼':'▲'}</button>
          <button class="pawn-del" onclick="App.removePawn('${p.id}')" title="Delete Pawn">&times;</button>
        </div>
        <div class="pawn-body ${collapsed?'collapsed':''}">
          <div class="trait-section" style="border-top:none; padding-top:0; margin-bottom:8px">
            ${fullNameStr ? `<div style="font-size:var(--f-xs); color:var(--text3); margin-bottom:6px; opacity:0.7" title="Full name">${fullNameStr}</div>` : ''}
            <div style="display:flex; gap:4px; margin-bottom:8px">
              <div style="flex:1"><div class="trait-title">Nickname</div><input class="pawn-name" value="${_escapeHtml(_capitalisePawnName(p.nickname))}" oninput="App.setPawnField('${p.id}','nickname',this.value)" placeholder="None" style="font-size:var(--f-xs);width:100%"></div>
              <div style="flex:1"><div class="trait-title">First Name</div><input class="pawn-name" value="${_escapeHtml(_capitalisePawnName(p.firstName))}" oninput="App.setPawnField('${p.id}','firstName',this.value)" placeholder="None" style="font-size:var(--f-xs);width:100%"></div>
              <div style="flex:1"><div class="trait-title">Last Name</div><input class="pawn-name" value="${_escapeHtml(_capitalisePawnName(p.lastName))}" oninput="App.setPawnField('${p.id}','lastName',this.value)" placeholder="None" style="font-size:var(--f-xs);width:100%"></div>
            </div>
            <div style="display:flex; gap:4px; margin-bottom:8px">
              <div style="flex:1"><div class="trait-title">Bio Age</div><input class="skill-input" type="number" min="0" max="9999" value="${p.bioAge != null ? p.bioAge : ''}" oninput="App.setPawnField('${p.id}','bioAge',this.value?parseInt(this.value):null)" placeholder="-" style="font-size:var(--f-xs);width:100%;text-align:center"></div>
              <div style="flex:1"><div class="trait-title">Chrono Age</div><input class="skill-input" type="number" min="0" max="99999" value="${p.chronoAge != null ? p.chronoAge : ''}" oninput="App.setPawnField('${p.id}','chronoAge',this.value?parseInt(this.value):null)" placeholder="-" style="font-size:var(--f-xs);width:100%;text-align:center"></div>
            </div>
            <div style="margin-bottom:8px">
              <div class="trait-title" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between" onclick="const el=this.nextElementSibling; el.style.display=el.style.display==='none'?'block':'none'; if(el.style.display==='block') el.querySelector('textarea').focus()">Bio ${p.bio ? '<span style="font-size:var(--f-xs);color:var(--accent);font-weight:400">(' + p.bio.length + ')</span>' : '<span style="font-size:var(--f-xs);color:var(--text3);font-weight:400">+</span>'}</div>
              <div style="display:${p.bio?'block':'none'}"><textarea placeholder="Notes about this pawn..." oninput="App.setPawnField('${p.id}','bio',this.value); App.triggerAutoSave()" style="width:100%;min-height:48px;max-height:100px;resize:vertical;font-size:var(--f-xs);padding:4px 6px;background:var(--surface3);color:var(--text);border:1px solid var(--border-med);border-radius:var(--radius-sm);font-family:inherit;line-height:1.3;margin-top:2px">${_escapeHtml(p.bio || '')}</textarea></div>
            </div>
            <div class="trait-title">Avatar Colour</div>
            <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px">
              <input type="color" value="${avatarBg}" onchange="App.setAvatar('${p.id}', 'avatarBg', this.value)" title="Background Colour" style="width:30px; height:24px; border:none; padding:0; background:transparent; cursor:pointer">
              <input type="color" value="${avatarColor}" onchange="App.setAvatar('${p.id}', 'avatarColor', this.value)" title="Icon/Text Colour" style="width:30px; height:24px; border:none; padding:0; background:transparent; cursor:pointer">
            </div>
          </div>
          ${[this._importNotice('biotech', { compact: true }), this._importNotice('royalty', { compact: true })].join('')}
          <select class="xeno-select" onchange="App.setXenotype('${p.id}', this.value)">${this._xenoOptsWithSelection(p.xenotype)}</select>
          <div style="display:flex; gap:4px; margin-top:4px">
            <select class="xeno-select" style="flex:1" onchange="App.setRole('${p.id}', this.value)">${this._roleOptsWithSelection(p.role)}</select>
            <select class="xeno-select" style="width:auto; min-width:70px" onchange="App.setGender('${p.id}', this.value)">
              <option value="" ${!p.gender?'selected':''}>--</option>
              <option value="Male" ${p.gender==='Male'?'selected':''}>Male</option>
              <option value="Female" ${p.gender==='Female'?'selected':''}>Female</option>
            </select>
            <button class="btn btn-sm" onclick="App.showXenoDetails('${p.id}')" style="font-size:calc(var(--f-xs)*0.85);padding:2px 8px;white-space:nowrap" title="View xenotype details">View Xeno</button>
          </div>
          <div style="margin-top:6px"><div class="trait-title">Backstory</div>
            <div style="display:flex;gap:4px">
              <button class="xeno-select" style="flex:1;text-align:left;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" onclick="App.openBackstoryPicker('${p.id}','childhood')" title="${cbsTitle}">C: ${cbsTitle}</button>
              <button class="xeno-select" style="flex:1;text-align:left;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" onclick="App.openBackstoryPicker('${p.id}','adulthood')" title="${absTitle}">A: ${absTitle}</button>
            </div>
          </div>
          <div style="display:flex;gap:4px;margin-top:6px">
            <div style="flex:1"><div class="trait-title">Faction</div><input class="pawn-name" value="${_escapeHtml(p.factionName||'')}" oninput="App.setPawnField('${p.id}','factionName',this.value)" placeholder="None" style="font-size:var(--f-xs);width:100%"></div>
            <div style="flex:1"><div class="trait-title">Ideology</div><input class="pawn-name" value="${_escapeHtml(p.ideoName||'')}" oninput="App.setPawnField('${p.id}','ideoName',this.value)" placeholder="None" style="font-size:var(--f-xs);width:100%"></div>
          </div>
          <div style="margin-top:6px"><div class="trait-title">Royal Title</div><input class="pawn-name" value="${_escapeHtml(p.royalTitle||'')}" oninput="App.setPawnField('${p.id}','royalTitle',this.value)" placeholder="None" style="font-size:var(--f-xs);width:100%" title="Royal title(s) and granting faction, from a save import"></div>
          ${(() => {
            const w = p.equippedWeapon;
            const worn = p.wornApparel || [];
            if (!w && !worn.length) return '';
            const wpn = w ? this._defLabelOrHumanize(w.def) + (w.quality && w.quality !== 'Normal' ? ' (' + w.quality + ')' : '') : '';
            const wornNames = worn.map(a => this._defLabelOrHumanize(a.def)).join(', ');
            return `<div style="margin-top:6px"><div class="trait-title">Equipped (from save)</div>
              <div style="font-size:var(--f-xs); color:var(--text2); line-height:1.45">
                ${wpn ? `<div title="Equipped weapon">${_escapeHtml(wpn)}</div>` : ''}
                ${wornNames ? `<div title="Worn apparel">${_escapeHtml(wornNames)}</div>` : ''}
              </div></div>`;
          })()}
          <div class="trait-section trait-toggle-section">
            <div class="trait-title" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="App.toggleTraitsCollapse('${p.id}')">Traits (${pTraits.length})<button class="icon-btn collapse-btn">${traitsCollapsed?'▼':'▲'}</button></div>
            ${traitsHtml}
          </div>
          <div class="skill-grid" style="margin-top:8px">${skillsHtml}</div>
          ${incapHtml}
          ${healthHtml}
        </div>
      </div>
      <div class="pawn-card-resize" onmousedown="App.initPawnCardResize(event)" title="Drag to resize all cards"></div>
    </div>`;
  },

  _lastSidebarOrder: null,
  _lastCompactMode: null,

  renderSidebar(c7ContextMap) {
    const el = document.getElementById('pawnList');
    if (!el) return;
    // #pawnList is the scroll container; preserve its position across re-renders
    // (e.g. toggling a passion) so the list doesn't jump to the top.
    const _savedScroll = el.scrollTop;
    this._buildRenderCache();
    const search = (document.getElementById('pawnSearch')?.value || "").toLowerCase();
    // Sync sidebar search to priorities table filter in realtime
    this.state.pawnFilter = search;
    const filteredPawns = this._sortPawns(this.state.pawns.filter(p =>
      _pawnDisplayName(p, '').toLowerCase().includes(search)
      || (p.name || '').toLowerCase().includes(search)
    ));
    const compact = this.state.settings.compactSidebar;
    const pawnContexts = this._useOrBuildContextMap(c7ContextMap);

    // Populate sort dropdown (only rebuild if options missing)
    const sortEl = document.getElementById('pawnSort');
    if (sortEl && sortEl.options.length === 0) {
      const cur = this.state.pawnSort || 'manual';
      const opts = [
        ['manual', 'Manual'],
        ['az', 'Name A-Z'],
        ['za', 'Name Z-A'],
        ['game_order', 'Game Order'],
        ['age_young', 'Age (Youngest)'],
        ['age_old', 'Age (Oldest)'],
      ];
      SKILLS.forEach(s => opts.push(['skill_' + s.id, s.name + ' (Best)']));
      sortEl.innerHTML = opts.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('');
    } else if (sortEl) {
      sortEl.value = this.state.pawnSort || 'manual';
    }

    // Differential rendering: detect if order/set changed vs. individual card updates
    const currentOrder = filteredPawns.map(p => p.id).join(',');
    const orderChanged = this._lastSidebarOrder !== currentOrder;
    const modeChanged = this._lastCompactMode !== compact;
    const forceAll = orderChanged || modeChanged || !el.children.length;

    if (forceAll) {
      // Full rebuild: pawn order changed, pawns added/removed, compact toggled, or first render
      const newHashes = {};
      const htmlParts = filteredPawns.map(p => { try {
        newHashes[p.id] = this._pawnCardHash(p);
        return this._renderPawnCardHtml(p, compact, pawnContexts.get(p.id));
      } catch(err) { console.warn('Render error for pawn', p?.id, err); return `<div class="pawn-card" data-pawn-id="${p?.id}" style="border:1px solid var(--p4-txt);padding:12px"><span style="color:var(--p4-txt);font-weight:700">! Render error</span></div>`; } });
      el.innerHTML = htmlParts.join('');
      this._pawnCardHashes = newHashes;
    } else {
      // Differential: only re-render pawn cards whose state hash changed
      const children = el.children;
      for (let i = 0; i < filteredPawns.length; i++) {
        const p = filteredPawns[i];
        const newHash = this._pawnCardHash(p);
        if (this._pawnCardHashes[p.id] !== newHash) {
          try {
            const tmp = document.createElement('div');
            tmp.innerHTML = this._renderPawnCardHtml(
              p, compact, pawnContexts.get(p.id));
            const newCard = tmp.firstElementChild;
            if (children[i]) el.replaceChild(newCard, children[i]);
          } catch(err) { console.warn('Diff render error for pawn', p?.id, err); }
          this._pawnCardHashes[p.id] = newHash;
        }
      }
    }
    this._lastSidebarOrder = currentOrder;
    this._lastCompactMode = compact;

    this._updateCollapseAllBtn();
    if (el.scrollTop !== _savedScroll) el.scrollTop = _savedScroll; // restore after rebuild
  },


  initPawnCardResize(e) {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startScale = this.state.settings.pawnCardScale || 1.0;
    const pawnList = document.getElementById('pawnList');
    let rafId = null;
    let lastScale = startScale;
    const onMove = (ev) => {
      const delta = ev.clientY - startY;
      lastScale = Math.max(0.5, Math.min(1.5, startScale + delta * 0.003));
      lastScale = Math.round(lastScale * 100) / 100;
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          this.state.settings.pawnCardScale = lastScale;
          if (pawnList) {
            pawnList.style.zoom = lastScale;
            document.documentElement.style.setProperty('--pawn-card-counter-zoom', 1 / lastScale);
          }
          rafId = null;
        });
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('resizing-active');
      if (rafId) cancelAnimationFrame(rafId);
      this.triggerAutoSave();
    };
    document.body.classList.add('resizing-active');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  },

  _isPortrait() { return window.innerHeight > window.innerWidth; },

  renderTable(c7ContextMap) {
    Perf.start('render.priorities');
    if (typeof this._syncPriorityLockControls === 'function') this._syncPriorityLockControls();
    const priorityMax = typeof this._manualPriorityMax === 'function' ? this._manualPriorityMax() : 4;
    const wrap = document.getElementById('tableWrap'); if (!wrap) { Perf.end('render.priorities'); return; }
    // Reflect the current priorities mode on the toolbar toggle.
    const mpBtn = document.getElementById('manualPrioBtn');
    if (mpBtn) {
      const manual = this.state.settings.manualPriorities !== false;
      mpBtn.textContent = manual ? `Manual (1-${priorityMax})` : 'Simple (on/off)';
      mpBtn.classList.toggle('btn-accent', !manual);
    }
    const rangeSelect = document.getElementById('priorityRangeSelect');
    if (rangeSelect && rangeSelect.value !== String(priorityMax)) rangeSelect.value = String(priorityMax);
    if (typeof this._syncStrategicFocusControls === 'function') this._syncStrategicFocusControls();
    const contextMap = this._useOrBuildContextMap(c7ContextMap);
    if (this._isPortrait()) { this._renderTableVertical(wrap, contextMap); } else { this._renderTableHorizontal(wrap, contextMap); }
    this.renderSummary(contextMap);
    Perf.end('render.priorities');
  },

  // Source key for a job column (vanilla / Biotech / Anomaly / Odyssey / modded).
  // Custom user jobs (not in the built-in map) count as modded.
  _jobSourceKey(j) {
    return (typeof JOB_SOURCE !== 'undefined' && JOB_SOURCE[j.id]) || 'modded';
  },
  // Column-header tooltip: name - source - description (educates on jargon and
  // flags non-vanilla columns).
  _jobHeaderTitle(j) {
    const lbl = (typeof JOB_SOURCE_LABEL !== 'undefined' && JOB_SOURCE_LABEL[this._jobSourceKey(j)]) || 'Modded / custom';
    return _escapeHtml(`${j.name} - ${lbl}${j.hint ? ' - ' + j.hint : ''}`);
  },
  // -- MANAGED JOB COLUMNS --
  // The table shows the columns listed in settings.jobOrder, in that order.
  // Default = vanilla + DLC work types only (modded/invented columns are opt-in)
  // plus any custom jobs the user has added.
  _defaultJobOrder() {
    const baked = JOBS.filter(j => this._jobSourceKey(j) !== 'modded').map(j => j.id);
    const custom = (this.state.customJobs || []).map(j => j.id);
    return [...baked, ...custom];
  },
  _ensureJobOrder() {
    const s = this.state.settings;
    if (!Array.isArray(s.jobOrder) || !s.jobOrder.length) s.jobOrder = this._defaultJobOrder();
    return s.jobOrder;
  },
  // Jobs to show in the table, in user order. Still honours "Hide modded content".
  _visibleJobs() {
    const order = this._ensureJobOrder();
    const byId = {};
    this.allJobs.forEach(j => { byId[j.id] = j; });
    let jobs = order.map(id => byId[id]).filter(Boolean);
    if (this.state.settings.hideModdedContent) jobs = jobs.filter(j => this._jobSourceKey(j) !== 'modded');
    return jobs;
  },
  addJobColumn(id) {
    const order = this._ensureJobOrder();
    if (!order.includes(id)) { order.push(id); this.renderTable(); this.triggerAutoSave(); }
  },
  removeJobColumn(id) {
    this.state.settings.jobOrder = this._ensureJobOrder().filter(x => x !== id);
    this.renderTable(); this.triggerAutoSave();
  },
  moveJobColumn(fromId, toId) {
    if (fromId === toId) return;
    const order = this._ensureJobOrder();
    const fi = order.indexOf(fromId);
    if (fi === -1) return;
    order.splice(fi, 1);
    const ti = order.indexOf(toId);
    order.splice(ti === -1 ? order.length : ti, 0, fromId); // insert before target
    this.renderTable(); this.triggerAutoSave();
  },
  _toggleJobColumn(id, on) { if (on) this.addJobColumn(id); else this.removeJobColumn(id); },
  // Drag-to-reorder for column headers (and job rows in portrait mode).
  _jobColDragStart(e, id) { this._jobDragId = id; if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; },
  _jobColDragOver(e) { e.preventDefault(); },
  _jobColDrop(e, id) {
    e.preventDefault();
    if (this._jobDragId && this._jobDragId !== id) this.moveJobColumn(this._jobDragId, id);
    this._jobDragId = null;
  },
  openJobColumnManager() {
    const order = this._ensureJobOrder();
    const inSet = new Set(order);
    const srcLabel = (j) => (typeof JOB_SOURCE_LABEL !== 'undefined' && JOB_SOURCE_LABEL[this._jobSourceKey(j)]) || 'Modded / custom';
    const rows = this.allJobs.map(j => `
      <label style="display:flex; align-items:center; gap:8px; padding:5px 8px; border-radius:6px; cursor:pointer">
        <input type="checkbox" ${inSet.has(j.id) ? 'checked' : ''} onchange="App._toggleJobColumn('${j.id}', this.checked)">
        <span style="flex:1; font-size:var(--f-sm)">${_escapeHtml(j.name)}</span>
        <span style="font-size:var(--f-xs); color:var(--text3)">${_escapeHtml(srcLabel(j))}</span>
      </label>`).join('');
    this._showGenericModal('Job Columns', `
      <div style="font-size:var(--f-xs); color:var(--text3); margin-bottom:8px; line-height:1.5">Choose which job columns appear in the Priorities table. Vanilla &amp; DLC jobs show by default; tick modded/custom ones to add them. Drag column headers in the table to reorder.</div>
      <div style="max-height:55vh; overflow-y:auto">${rows}</div>
      <button class="btn btn-sm btn-accent" style="margin-top:12px" onclick="App._dismissModal(false); App.addCustomJob()">+ Add custom job</button>
    `);
  },

  _c4SnapshotCache: null,
  _c4SnapshotRevision: 0,
  _c4CacheRevisionSeen: -1,

  _c4InvalidateSnapshot() {
    this._c4SnapshotRevision++;
    Perf.increment('c4.snapshot.invalidations');
  },

  _c4DefinitionSnapshot() {
    if (this._c4SnapshotCache && this._c4CacheRevisionSeen === this._c4SnapshotRevision) {
      Perf.increment('c4.snapshot.cacheHit');
      return this._c4SnapshotCache;
    }
    Perf.increment('c4.snapshot.cacheMiss');
    const snapshot = Perf.measure('c4.snapshot.build', () => RequirementRegistry.createSnapshot({
      jobCatalog: this.allJobs,
      workTypeDefs: this.state.scannedWorkTypeDefs || {},
      workGiverDefs: this.state.scannedWorkGiverDefs || {},
      capacityDefs: this.state.scannedCapacityDefs || {},
      raceWorkPolicies: this.state.scannedRaceWorkPolicies || {},
      activePackageIds: this.state.activePackageResolution || null,
      definitionUncertainty: this.state.requirementUncertainty || {},
    }));
    this._c4SnapshotCache = snapshot;
    this._c4CacheRevisionSeen = this._c4SnapshotRevision;
    return snapshot;
  },

  _c5EffectivenessSnapshot() {
    return C5DefinitionSnapshotFactory.createSnapshot(
      this.state.effectivenessProvider || null);
  },

  _c7CoordinatorOptions(definitionSnapshot, evidenceOptions, effectivenessSnapshot) {
    const c5Snapshot = effectivenessSnapshot === undefined
      ? this._c5EffectivenessSnapshot() : effectivenessSnapshot;
    const provider = this.state.effectivenessProvider || null;
    const c5EvidenceOptions = c5Snapshot ? {
      effectivenessSourceCatalogues: {
        sourceOperations: c5Snapshot.sourceOperationCatalogues || {},
        sourceFamilyCompleteness: provider && provider.sourceFamilyCompleteness || {},
      },
    } : {};
    return {
      definitionSnapshot,
      c4RequirementSnapshot: definitionSnapshot,
      effectivenessSnapshot: c5Snapshot,
      evidenceOptions: Object.assign(c5EvidenceOptions, evidenceOptions || {}),
      capabilityDefinitions: {
        bodyDefs: this.state.scannedBodyDefs || {},
        bodyPartDefs: this.state.scannedBodyPartDefs || {},
        capacityDefs: this.state.scannedCapacityDefs || {},
        raceBodyMap: this.state.scannedRaceBodyMap || {},
      },
    };
  },

  _useOrBuildContextMap(existing) {
    if (existing) {
      Perf._contextMapStats.requested++;
      Perf._contextMapStats.reused++;
      return existing;
    }
    return this._c7PawnContextMap(this.state.pawns, this._c7EvidenceOptionsByPawn);
  },

  _c7PawnContextMap(pawns, evidenceOptionsByPawn) {
    Perf._contextMapStats.requested++;
    Perf._contextMapStats.created++;
    const definitionSnapshot = Perf.measure('c7.snapshot.c4', () => this._c4DefinitionSnapshot());
    const effectivenessSnapshot = Perf.measure('c7.snapshot.c5', () => this._c5EffectivenessSnapshot());
    const contexts = new Map();
    (pawns || []).forEach(pawn => {
      const evidenceOptions = evidenceOptionsByPawn && evidenceOptionsByPawn.get(pawn.id) || {};
      Perf.measure('c7.context.create', () => {
        contexts.set(pawn.id, C7EvaluationCoordinator.createPawnContext(
          pawn, this._c7CoordinatorOptions(
            definitionSnapshot, evidenceOptions, effectivenessSnapshot)));
      });
    });
    Perf.increment('c7.context.created', (pawns || []).length);
    return contexts;
  },

  _c7CellState(pawnContext, job, pawn) {
    const permission = pawnContext.permission(job);
    if (permission.state === 'blocked') return { state: 'blocked', permission };
    if (permission.state === 'unknown') {
      if (pawn) {
        const hasPawnUncertainty = (permission.unknowns || []).some(u => {
          const code = u.explanation && u.explanation.code || '';
          return code.includes('.job.') || code.includes('.workType.') || code.includes('.workTag.');
        });
        if (!hasPawnUncertainty) {
          if (this.isIncapable(pawn, job)) return { state: 'blocked', permission };
        } else {
          return { state: 'unknown', permission };
        }
      } else {
        return { state: 'unknown', permission };
      }
    }
    const availability = pawnContext.availability(job);
    if (availability.state === 'unavailable') {
      return { state: 'unavailable', permission, availability };
    }
    return { state: 'normal', permission, availability };
  },

  _c7EvaluationTooltipLine(item, fallback) {
    const explanation = item && item.explanation || {};
    const params = explanation.params || {};
    let line = explanation.code || fallback;
    if (params.target) line += ': ' + params.target;
    const sources = [];
    (item && item.evidence || []).forEach(source => {
      const kind = source.sourceKind || source.kind;
      const id = source.sourceId || source.evidenceId;
      if (kind || id) sources.push([kind, id].filter(Boolean).join(':'));
    });
    const provenance = item && item.requirementProvenance || {};
    if (provenance.modId) sources.push('mod:' + provenance.modId);
    (provenance.sources || []).forEach(source => {
      if (source.file || source.path) sources.push('source:' + (source.file || source.path));
    });
    if (sources.length) line += ' [' + Array.from(new Set(sources)).join(', ') + ']';
    return line;
  },

  _c7Tooltip(cellInfo) {
    const lines = [];
    if (cellInfo.state === 'blocked' && cellInfo.permission) {
      (cellInfo.permission.blockers || []).forEach(item => lines.push(
        this._c7EvaluationTooltipLine(item, 'Incapable of this job type')));
      if (!lines.length) lines.push('Incapable of this job type');
    } else if (cellInfo.state === 'unknown' && cellInfo.permission) {
      (cellInfo.permission.unknowns || []).forEach(item => lines.push(
        this._c7EvaluationTooltipLine(item, 'Eligibility could not be verified')));
      if (!lines.length) lines.push('Eligibility could not be verified');
    } else if (cellInfo.state === 'unavailable' && cellInfo.availability) {
      (cellInfo.availability.blockers || []).forEach(item => lines.push(
        this._c7EvaluationTooltipLine(item, 'Temporarily unavailable')));
      if (!lines.length) lines.push('Temporarily unavailable');
    }
    return _escapeHtml(lines.join('\n'));
  },

  _c7EditablePriorityCellHTML(pid, jid, priority, state, title) {
    let html = this._prioCellHTML(pid, jid, priority);
    html = html.replace('class="prio-box ', 'class="prio-box ' + state + ' ');
    html = html.replace(/\s+title="[^"]*"/g, '');
    const lockNotice = this._prioritiesAreLocked() ? '\nPriorities are locked - unlock to edit' : '';
    const fullTitle = title + _escapeHtml(lockNotice);
    return html.replace(' tabindex=', ' title="' + fullTitle + '" tabindex=');
  },

  _c7GridCellHTML(pawnId, job, priority, pawnContext, pawn) {
    const cellInfo = this._c7CellState(pawnContext, job, pawn);
    const title = this._c7Tooltip(cellInfo);
    if (cellInfo.state === 'blocked') {
      return '<td class="td-job"><div class="prio-box incap" title="'
        + title + '">×</div></td>';
    }
    const cell = cellInfo.state === 'normal'
      ? this._prioCellHTML(pawnId, job.id, priority)
      : this._c7EditablePriorityCellHTML(pawnId, job.id, priority, cellInfo.state, title);
    return '<td class="td-job">' + cell + '</td>';
  },

  _renderTableHorizontal(wrap, c7ContextMap) {
    const priorityMax = typeof this._manualPriorityMax === 'function' ? this._manualPriorityMax() : 4;
    const tooltip = `
      <div class="info-btn" style="margin-left:8px">?
        <div class="tooltip">
          <strong>Interaction Guide</strong>
          • Left Click: Increase Priority<br>
          • Right Click: Decrease Priority<br>
          • Mouse Wheel: Rapid Sweep<br>
          • Keys 1-${priorityMax}: Direct Input<br>
          • Keys 0/Del: Clear Cell
        </div>
      </div>`;

    const pSearch = (this.state.pawnFilter || "").toLowerCase();
    const filteredJobs = this._visibleJobs();
    const filteredPawns = this._sortPawns(this.state.pawns.filter(p => !pSearch
      || _pawnDisplayName(p, '').toLowerCase().includes(pSearch)));
    const pawnContexts = this._useOrBuildContextMap(c7ContextMap);

    const catSpans = [];
    filteredJobs.forEach(j => { 
      if (catSpans.length === 0 || catSpans[catSpans.length-1].cat !== j.cat) 
        catSpans.push({cat: j.cat, label: this.state.catLabels[j.cat] || CAT_LABELS[j.cat] || j.cat, count: 1}); 
      else catSpans[catSpans.length-1].count++; 
    });

    const s = this.state.settings; const tableCls = s.verticalTitles ? 'h-table vertical-titles' : 'h-table';
    wrap.innerHTML = `<div class="h-table-scroll"><table class="${tableCls}"><colgroup><col class="col-pawn-name">${filteredJobs.map(() => `<col class="col-job">`).join('')}</colgroup><thead><tr class="cat-header-row"><th class="th-pawn-name" rowspan="2">Members ${tooltip}</th>${catSpans.map(cs => `<th class="th-cat" colspan="${cs.count}"><input class="cat-label-input" value="${_escapeHtml(cs.label)}" oninput="App.updateCatLabel('${cs.cat}', this.value)"></th>`).join('')}</tr><tr class="job-header-row">${filteredJobs.map(j => `<th class="th-job" draggable="true" ondragstart="App._jobColDragStart(event,'${j.id}')" ondragover="App._jobColDragOver(event)" ondrop="App._jobColDrop(event,'${j.id}')" title="${this._jobHeaderTitle(j)}"><div class="th-job-name" title="${this._jobHeaderTitle(j)}">${_escapeHtml(j.name)}</div></th>`).join('')}</tr></thead><tbody>${filteredPawns.map(p => { try {
          const avatarBg = _safeColor(p.avatarBg || AVATARS[(p.avatarIdx||0) % AVATARS.length].bg);
          const avatarColor = _safeColor(p.avatarColor || AVATARS[(p.avatarIdx||0) % AVATARS.length].color, '#ffffff');
          const pawnDisplayName = _pawnDisplayName(p, '?');
          const avatarIcon = _escapeHtml((pawnDisplayName || '?')[0].toUpperCase());
          const xeno = this.getXeno(p.xenotype);
          return `
          <tr class="pawn-row" draggable="true" ondragstart="App.handleTableDragStart(event, '${p.id}')" ondragover="App.handleTableDragOver(event)" ondragleave="App.handleTableDragLeave(event)" ondrop="App.handleTableDrop(event, '${p.id}')" ondragend="App.handleTableDragEnd(event)">
            <td class="td-pawn-name">
              <div style="display:flex; align-items:center; gap:8px">
                <span class="drag-handle" style="cursor:grab;color:var(--text3);font-size:calc(12px * var(--font-scale));flex-shrink:0;user-select:none" title="Drag to reorder">⠿</span>
                <div class="avatar" style="width:calc(var(--f-base) * 1.8); height:calc(var(--f-base) * 1.8); font-size:var(--f-base); background:${avatarBg}; color:${avatarColor}; border:1px solid var(--border-med)">${avatarIcon}</div>
                <div style="flex:1; min-width:0">
                  <input class="pawn-name-inline" value="${_escapeHtml(pawnDisplayName)}" oninput="App.renameNickname('${p.id}', this.value)" style="font-weight:700; font-size:var(--table-font-size); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%; background:transparent; border:none; border-bottom:1px dashed var(--border); color:var(--text); outline:none; padding:1px 2px" onfocus="this.style.borderBottomColor='var(--accent)';this.style.background='var(--surface3)'" onblur="this.style.borderBottomColor='var(--border)';this.style.background='transparent'">
                  <div style="font-size:var(--f-xs); color:${_safeColor(xeno.color)}; opacity:0.8; font-weight:600">${_escapeHtml(xeno.label)}${p.bioAge != null ? ` · ${p.bioAge}y` : ''}${(xeno.uvSensitivity||0) >= 1 ? ' · UV' : ''}</div>
                </div>
              </div>
            </td>
            ${filteredJobs.map(j => {
              const prio = this.state.priorities[p.id]?.[j.id];
              return this._c7GridCellHTML(p.id, j, prio, pawnContexts.get(p.id), p);
            }).join('')}
          </tr>`;
        } catch(err) { console.warn('Table render error for pawn', p?.id, err); return `<tr><td class="td-pawn-name" style="color:var(--p4-txt)">! ${_escapeHtml(_pawnDisplayName(p, '?'))}</td>${filteredJobs.map(()=>'<td></td>').join('')}</tr>`; } }).join('')}</tbody></table></div>`;
  },

  // Portrait: jobs = rows, pawns = columns
  _renderTableVertical(wrap, c7ContextMap) {
    const priorityMax = typeof this._manualPriorityMax === 'function' ? this._manualPriorityMax() : 4;
    const tooltip = `
      <div class="info-btn" style="margin-left:8px">?
        <div class="tooltip">
          <strong>Interaction Guide</strong>
          • Left Click: Increase Priority<br>
          • Right Click: Decrease Priority<br>
          • Mouse Wheel: Rapid Sweep<br>
          • Keys 1-${priorityMax}: Direct Input<br>
          • Keys 0/Del: Clear Cell
        </div>
      </div>`;

    const pSearch = (this.state.pawnFilter || "").toLowerCase();
    const filteredJobs = this._visibleJobs();
    const filteredPawns = this._sortPawns(this.state.pawns.filter(p => !pSearch
      || _pawnDisplayName(p, '').toLowerCase().includes(pSearch)));
    const pawnContexts = this._useOrBuildContextMap(c7ContextMap);

    // Pawn header cells
    const pawnHeaders = filteredPawns.map(p => { try {
      const avatarBg = _safeColor(p.avatarBg || AVATARS[(p.avatarIdx||0) % AVATARS.length].bg);
      const avatarColor = _safeColor(p.avatarColor || AVATARS[(p.avatarIdx||0) % AVATARS.length].color, '#ffffff');
      const pawnDisplayName = _pawnDisplayName(p, '?');
      const avatarIcon = _escapeHtml((pawnDisplayName || '?')[0].toUpperCase());
      const xeno = this.getXeno(p.xenotype);
      return `<th class="th-job" style="min-width:var(--pawn-col-width);position:sticky;top:0;z-index:9;background:var(--surface3)">
        <div style="display:flex; flex-direction:column; align-items:center; gap:4px; padding:4px 0">
          <div class="avatar" style="width:calc(var(--f-base) * 1.8); height:calc(var(--f-base) * 1.8); font-size:var(--f-base); background:${avatarBg}; color:${avatarColor}; border:1px solid var(--border-med)">${avatarIcon}</div>
          <div style="font-weight:700; font-size:var(--table-font-size); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:80px">${_escapeHtml(pawnDisplayName)}</div>
          <div style="font-size:var(--f-xs); color:${_safeColor(xeno.color)}; opacity:0.8; font-weight:600">${_escapeHtml(xeno.label)}${p.bioAge != null ? ` · ${p.bioAge}y` : ''}${(xeno.uvSensitivity||0) >= 1 ? ' UV' : ''}</div>
        </div>
      </th>`;
    } catch(err) { return `<th class="th-job" style="color:var(--p4-txt)">!</th>`; } }).join('');

    // One row per job
    let lastCat = null;
    const rows = filteredJobs.map(j => {
      const catRow = j.cat !== lastCat ? `<tr><td colspan="${filteredPawns.length + 1}" style="padding:4px 10px; background:var(--surface2); font-size:var(--cat-font-size); font-weight:700; color:var(--text2); border:1px solid var(--border)"><input class="cat-label-input" value="${_escapeHtml(this.state.catLabels[j.cat] || CAT_LABELS[j.cat] || j.cat)}" oninput="App.updateCatLabel('${j.cat}', this.value)" style="width:100%"></td></tr>` : '';
      lastCat = j.cat;
      const cells = filteredPawns.map(p => {
        const prio = this.state.priorities[p.id]?.[j.id];
        return this._c7GridCellHTML(p.id, j, prio, pawnContexts.get(p.id), p);
      }).join('');
      return `${catRow}<tr class="pawn-row"><td class="td-pawn-name" draggable="true" ondragstart="App._jobColDragStart(event,'${j.id}')" ondragover="App._jobColDragOver(event)" ondrop="App._jobColDrop(event,'${j.id}')" style="white-space:nowrap; font-size:var(--job-font-size); font-weight:700; cursor:grab" title="${this._jobHeaderTitle(j)}">${_escapeHtml(j.name)}</td>${cells}</tr>`;
    }).join('');

    wrap.innerHTML = `<div class="h-table-scroll"><table class="h-table"><thead><tr class="job-header-row"><th class="th-pawn-name" style="position:sticky;left:0;top:0;z-index:13;background:var(--surface2)">Job ${tooltip}</th>${pawnHeaders}</tr></thead><tbody>${rows}</tbody></table></div>`;
  },

  renderDashboard(c7ContextMap) {
    const container = document.getElementById('view-dash');
    if (!container) return;
    const contextMap = this._useOrBuildContextMap(c7ContextMap);
    const viability = Engine.calculateViability(
      this.state.pawns, this.state.priorities, this.state.precepts, contextMap);
    const alerts = Engine.getBottlenecks(this.state.pawns, this.state.priorities, contextMap);
    const coverage = Engine.getCriticalWorkCoverage(this.state.pawns, this.state.priorities, contextMap);
    const portrait = this._isPortrait();

    const isWidget = window.innerWidth <= 550;
    const sidebarH = (portrait && !isWidget) ? window.innerHeight * 0.45 : 0;
    const availH = window.innerHeight - sidebarH - 200;
    const sideW = (!portrait && !isWidget && !this.state.settings.sidebarCollapsed) ? (this.state.settings.sidebarWidth + 36) : 32;
    const availW = window.innerWidth - sideW;
    // radarSize = viewBox resolution (the SVG itself is responsive via CSS width:100%).
    // Use a generous base so labels render crisp; CSS min/max-width prevents visual extremes.
    const radarSize = isWidget
      ? Math.max(200, Math.min(Math.round(availW * 0.78), Math.round(availH * 0.42), 300))
      : portrait
        ? Math.max(300, Math.min(Math.round(availW * 0.9), Math.round(availH * 0.5), 460))
        : Math.max(400, Math.min(Math.round(availW * 0.95), Math.round(availH * 0.95), 640));

    const viabilityColour = viability > 70 ? 'var(--p1-txt)' : viability > 40 ? 'var(--p3-txt)' : 'var(--p4-txt)';
    const viabilityTip = 'A planning indicator based on essential work coverage, specialist roles and trait break thresholds. The score cannot exceed the percentage of essential jobs covered. Blocked or unavailable pawns do not provide coverage; incomplete capability evidence remains provisional. Situational ideology mood is not treated as permanent. This is not a survival prediction.';
    const viabilityHint = !this.state.pawns.length
      ? 'Add or import pawns to assess work coverage.'
      : !coverage.hasAssignments
        ? 'No work priorities set yet. Assign jobs on the Priorities tab or use Auto-Assign.'
        : !coverage.covered
          ? 'Priorities are set, but no essential jobs have an eligible assigned worker. Check capability, availability and assignments.'
          : coverage.covered < coverage.total
            ? 'Some essential jobs lack an eligible assigned worker. Review Labour Bottlenecks and the Priorities tab.'
            : viability === 0
              ? 'Essential jobs are covered, but trait break-threshold modifiers reduce the planning score to zero.'
              : 'Essential jobs are covered. This planning score does not predict survival or guarantee enough labour.';
    const viabilityCard = `
      <div class="dash-card">
        <div class="trait-title" style="display:flex; align-items:center; gap:6px">Survival Index
          <span title="${_escapeHtml(viabilityTip)}" style="cursor:help; display:inline-flex; align-items:center; justify-content:center; width:15px; height:15px; border-radius:50%; background:var(--surface3); color:var(--text3); font-size:10px; font-weight:800; flex-shrink:0">?</span>
        </div>
        <div class="dash-val" style="color:${viabilityColour}">${viability}%</div>
        <div class="dash-gauge"><div class="dash-gauge-fill" style="width:${Math.max(0, Math.min(100, viability))}%; background:${viabilityColour}"></div></div>
        <div class="settings-desc">${coverage.covered}/${coverage.total} essential jobs covered.</div>
        <div class="settings-desc">${viabilityHint}</div>
      </div>`;
    const colonistsCard = `
      <div class="dash-card">
        <div class="trait-title">Colonists</div>
        <div class="dash-val" style="color:var(--accent)">${this.state.pawns.length}</div>
        <div class="settings-desc">Active pawns tracked.</div>
      </div>`;
    const bottleneckCard = `
      <div class="dash-card" style="flex:1; display:flex; flex-direction:column; min-height:0">
        <div class="trait-title" style="flex-shrink:0">Labour Bottlenecks</div>
        <div class="hover-scroll" style="margin-top:8px; column-count:${alerts.length > 4 ? 2 : 1}; column-gap:12px; overflow-y:auto; max-height:180px; flex:1; min-height:0">
          ${alerts.length > 0 ? alerts.map(a => `<div style="color:var(--p4-txt); font-size:var(--f-sm); break-inside:avoid; margin-bottom:6px"> ${_escapeHtml(a)}</div>`).join('') : `<div style="color:var(--p1-txt); font-size:var(--f-sm)"> No critical gaps.</div>`}
        </div>
      </div>`;
    const radarCard = `
      <div class="dash-card dash-card--hero" style="display:flex; flex-direction:column; align-items:center; padding:${isWidget ? '10px 8px' : '20px 24px'}">
        <div class="trait-title" style="margin-bottom:${isWidget ? '6px' : '12px'}">Colony Skill Radar</div>
        ${Charts.renderColonyRadar(this.state.pawns, radarSize, contextMap)}
        <div class="settings-desc" style="margin-top:${isWidget ? '6px' : '10px'}; text-align:center; max-width:340px">Each spoke = colony average (0-20). Wider = more rounded.</div>
      </div>`;

    const narrowContent = availW < 700;
    if (isWidget || portrait || narrowContent) {
      const cardGap = isWidget ? '8px' : '12px';
      const cardPad = isWidget ? '4px' : '4px';
      // Widget/portrait: a single vertical stack that scrolls as a whole. Each
      // section keeps its NATURAL height (flex-shrink:0) so a short window scrolls
      // to reveal everything, rather than crushing the bottleneck card (which uses
      // flex:1 in the desktop sidebar layout) down to just its header.
      const bottleneckWidget = `
        <div class="dash-card" style="flex-shrink:0">
          <div class="trait-title">Labour Bottlenecks</div>
          <div style="margin-top:8px; column-count:${alerts.length > 4 ? 2 : 1}; column-gap:12px">
            ${alerts.length > 0 ? alerts.map(a => `<div style="color:var(--p4-txt); font-size:var(--f-sm); break-inside:avoid; margin-bottom:6px"> ${_escapeHtml(a)}</div>`).join('') : `<div style="color:var(--p1-txt); font-size:var(--f-sm)"> No critical gaps.</div>`}
          </div>
        </div>`;
      container.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:${cardGap}; padding:${cardPad}; overflow-y:auto; flex:1; min-height:0; max-width:900px; margin:0 auto">
          <div style="display:flex; justify-content:center; flex-shrink:0">${radarCard}</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:${cardGap}; flex-shrink:0">${viabilityCard}${colonistsCard}</div>
          ${bottleneckWidget}
        </div>`;
    } else {
      // Desktop: radar gets the dominant left column; the stat cards stack on the
      // right so the radar is large and the vertical space is filled.
      container.innerHTML = `
        <div class="dash-layout">
          <div class="dash-center">
            ${radarCard}
          </div>
          <div class="dash-side">
            ${viabilityCard}
            ${colonistsCard}
            ${bottleneckCard}
          </div>
        </div>`;
    }
  },

  // Copy the imported save's world seed to the clipboard (dashboard World line).
  copyWorldSeed() {
    const seed = this.state.importMeta && this.state.importMeta.worldSeed;
    if (!seed) return;
    if (window.overlay && window.overlay.clipboardWrite) window.overlay.clipboardWrite(seed);
    else { try { navigator.clipboard.writeText(seed); } catch (_) {} }
    this.toast(`World seed "${seed}" copied.`);
  },

  renderSummary(c7ContextMap) {
    Perf.start('render.summary');
    const el = document.getElementById('summaryBar');
    if (!el) { Perf.end('render.summary'); return; }
    const total = this.state.pawns.length;
    const contextMap = this._useOrBuildContextMap(c7ContextMap);
    
    // 1. Important Job Pills (existing)
    const pills = JOBS.filter(j => j.important).map(j => {
      const atP1  = this.state.pawns.filter(p => this.state.priorities[p.id]?.[j.id] === 1
        && Engine._c7IsEligible(contextMap, p, j)).length;
      const atAny = this.state.pawns.filter(p => this.state.priorities[p.id]?.[j.id] != null
        && Engine._c7IsEligible(contextMap, p, j)).length;
      const cls = atP1 > 0 ? 'sum-pill ok' : atAny > 0 ? 'sum-pill' : 'sum-pill warn';
      const label = atP1 > 0 ? `<b>${atP1}</b>` : atAny > 0 ? `<b style="color:var(--p3-txt)">${atAny}</b>` : `<b>0</b>`;
      return `<div class="${cls}" title="${_escapeHtml(j.name)}: ${atP1} at P1, ${atAny} total assigned">${_escapeHtml(j.name)} ${label}</div>`;
    });

    // 2. Conflict/Bottleneck alerts - collapsed into ONE expandable pill so a
    // colony with many gaps doesn't show a wall of identical warnings.
    const gaps = Engine.getBottlenecks(this.state.pawns, this.state.priorities, contextMap);
    let alertsHtml = '';
    if (gaps.length) {
      const expanded = !!this._summaryAlertsExpanded;
      const conflicts = gaps.filter(m => m.startsWith('CONFLICT:')).length;
      const uncovered = gaps.length - conflicts;
      const parts = [];
      if (uncovered) parts.push(`${uncovered} job${uncovered !== 1 ? 's' : ''} uncovered!`);
      if (conflicts) parts.push(`${conflicts} conflict${conflicts !== 1 ? 's' : ''}`);
      alertsHtml = `<div class="sum-pill warn" style="cursor:pointer; border-style:dashed" title="Click to ${expanded ? 'hide' : 'show'} which jobs and conflicts" onclick="App.toggleSummaryAlerts()">${parts.join(' · ')} <span style="opacity:0.65;font-size:0.8em">(${expanded ? 'hide' : 'show'} details) ${expanded ? '▲' : '▼'}</span></div>`;
      if (expanded) {
        alertsHtml += gaps.map(msg => {
          const isConflict = msg.startsWith('CONFLICT:');
          return `<div class="sum-pill warn" style="border-style:dashed; ${isConflict ? 'background:rgba(220,60,60,0.2)' : ''}" title="${_escapeHtml(msg)}">${_escapeHtml(msg)}</div>`;
        }).join('');
      }
    }

    el.innerHTML = `<div class="sum-pill" style="color:var(--text2)">${total} colonist${total !== 1 ? 's' : ''}</div>` + pills.join('') + alertsHtml;
    Perf.end('render.summary');
  },

  toggleSummaryAlerts() { this._summaryAlertsExpanded = !this._summaryAlertsExpanded; this.renderSummary(); },

  // -- SETTINGS TAB --
  _resetGeneralDefaults() {
    this.state.settings.uiScale = 1.0;
    this.state.settings.fontScale = 1.0;
    this.state.settings.theme = 'dark';
    this.state.settings.colourBlindMode = false;
    this.state.settings.dyslexiaFontMode = false;
    this.applySettings();
    this.applyTheme();
    this.renderSettings();
    this.toast('General settings reset');
  },

  _resetTypographyDefaults() {
    this.state.settings.tableFontSize = 14;
    this.state.settings.jobFontSize = 12;
    this.state.settings.prioSize = 28;
    this.state.settings.pawnCardFontSize = 13;
    this.applySettings();
    this.renderSettings();
    this.toast('Typography settings reset');
  },

  _resetWindowSizeDefaults() {
    this.state.settings.widgetWidth = 420;
    this.state.settings.widgetHeight = 700;
    this.state.settings.fullWidth = 1200;
    this.state.settings.fullHeight = 850;
    this._syncWindowSizes();
    this.renderSettings();
    this.toast('Window sizes reset to defaults');
  },

  _captureCurrentWindowSize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const isWidget = w <= 550;
    if (isWidget) {
      this.state.settings.widgetWidth = w;
      this.state.settings.widgetHeight = h;
    } else {
      this.state.settings.fullWidth = w;
      this.state.settings.fullHeight = h;
    }
    this._syncWindowSizes();
    this.renderSettings();
    this.triggerAutoSave();
    this.toast('Saved current size (' + w + ' x ' + h + ') as ' + (isWidget ? 'widget' : 'full') + ' default');
  },
});

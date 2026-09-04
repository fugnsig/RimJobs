/**
 * PRIORITY INTERACTIONS
 * Pawn renaming, priority click/wheel/key handlers, filter/label,
 * xenotype/passion/incap toggles, auto-assign, colony optimiser.
 * Auto-split from app.js - methods are assigned onto the App object.
 */
Object.assign(App, {
  renameNickname(id, val) {
    const p = this.state.pawns.find(p => p.id === id);
    if (!p) return;
    p.nickname = _capitalisePawnName(val);
    // The active field is deliberately excluded from the synchronisation below,
    // so apply capitalisation in place while preserving its caret and any trailing
    // space the user has just typed for a multi-part name.
    const active = document.activeElement;
    if (active && active.value === val) {
      const start = active.selectionStart;
      const end = active.selectionEnd;
      const lengthChange = p.nickname.length - val.length;
      active.value = p.nickname;
      if (Number.isInteger(start) && Number.isInteger(end) && active.setSelectionRange) {
        active.setSelectionRange(start + lengthChange, end + lengthChange);
      }
    }
    // Display value falls back to name when nickname is empty
    const display = _pawnDisplayName(p, '');
    // Sync header name inputs only (not firstName/lastName fields in the card body)
    const card = document.querySelector(`.pawn-card[data-pawn-id="${id}"]`);
    if (card) {
      const headerInput = card.querySelector('.pawn-header .pawn-name');
      if (headerInput && headerInput !== document.activeElement) headerInput.value = display;
    }
    // Sync schedule name inputs
    document.querySelectorAll('.sched-name-input').forEach(el => {
      if (el !== document.activeElement) {
        const row = el.closest('.sched-strip-row, .sched-row, tr');
        if (row && (row.querySelector(`[onmousedown*="${id}"]`) || row.querySelector(`[oninput*="${id}"]`))) {
          el.value = display;
        }
      }
    });
    // Sync priority table inline name inputs
    document.querySelectorAll('.pawn-name-inline').forEach(el => {
      if (el !== document.activeElement && el.closest('tr')?.querySelector(`[onmousedown*="${id}"]`)) {
        el.value = display;
      }
    });
    // Sync pawn manager header name input
    document.querySelectorAll('#pawnManagerBody .pawn-name').forEach(el => {
      if (el !== document.activeElement && el.closest('[data-pawn-id]')?.dataset.pawnId === id) {
        el.value = display;
      }
    });
    this.triggerAutoSave();
  },

  // -- PRIORITY INTERACTIONS --
  _manualPriorityMax() {
    const raw = this.state.settings.manualPriorityMax;
    const max = Math.max(4, Math.min(9, Math.trunc(Number(raw)) || 4));
    this.state.settings.manualPriorityMax = max;
    if (typeof PriorityScale.setManualMax === 'function') PriorityScale.setManualMax(max);
    else PriorityScale.manualMax = max;
    return max;
  },

  setManualPriorityMax(value) {
    const max = Math.max(4, Math.min(9, Math.trunc(Number(value)) || 4));
    this.state.settings.manualPriorityMax = max;
    this._manualPriorityMax();
    this.renderTable();
    this.triggerAutoSave();
  },

  _priorityColourStyle(priority) {
    if (!Number.isInteger(priority) || priority < 1) return '';
    const max = Math.max(this._manualPriorityMax(), priority);
    const progress = max <= 1 ? 0 : Math.min(1, (priority - 1) / (max - 1));
    const hue = Math.round(120 * (1 - progress));
    const accessibleStart = [0, 114, 178];
    const accessibleEnd = [230, 159, 0];
    const accessibleRgb = accessibleStart.map((value, index) =>
      Math.round(value + ((accessibleEnd[index] - value) * progress))).join(',');
    return ` style="--priority-hue:${hue};--priority-cb-rgb:${accessibleRgb}"`;
  },

  // Renders one priority cell's inner box, honouring the manual/simple mode.
  // Simple mode shows an on/off tick; manual shows numeric priorities.
  _prioCellHTML(pid, jid, prio) {
    const locked = this._prioritiesAreLocked();
    const lockAttrs = locked ? ' aria-disabled="true" title="Priorities are locked - unlock to edit"' : '';
    if (!this.state.settings.manualPriorities) {
      const on = prio !== null && prio !== undefined && prio !== 0;
      const title = locked ? '' : ` title="${on ? 'Enabled - click to disable' : 'Disabled - click to enable'}"`;
      return `<div class="prio-box prio-check ${on ? 'on' : 'empty'}" tabindex="0" onmousedown="App.handlePriorityClick(event, '${pid}', '${jid}')" onkeydown="App.handlePriorityKey(event, '${pid}', '${jid}')" oncontextmenu="event.preventDefault()"${lockAttrs}${title}>${on ? '✓' : '&nbsp;'}</div>`;
    }
    const hasPriority = Number.isInteger(prio) && prio >= 1;
    const priorityClass = hasPriority ? `priority-scaled p${prio}` : 'empty';
    return `<div class="prio-box ${priorityClass}"${this._priorityColourStyle(prio)} tabindex="0" onmousedown="App.handlePriorityClick(event, '${pid}', '${jid}')" onwheel="App.handlePriorityWheel(event, '${pid}', '${jid}')" onkeydown="App.handlePriorityKey(event, '${pid}', '${jid}')" oncontextmenu="event.preventDefault()"${lockAttrs}>${hasPriority ? prio : '&nbsp;'}</div>`;
  },

  _prioritiesAreLocked() {
    return this.state.settings.priorityLocked === true;
  },

  _guardPriorityEdit(action, notify = false) {
    if (!this._prioritiesAreLocked()) return true;
    if (notify && typeof this.toast === 'function') {
      this.toast(`Priorities are locked. Unlock them to ${action || 'make changes'}.`);
    }
    return false;
  },

  _lockedPriorityActionAttrs(action) {
    if (!this._prioritiesAreLocked()) return '';
    return ` disabled aria-disabled="true" title="Unlock priorities to ${action || 'make this change'}."`;
  },

  _syncPriorityLockControls() {
    if (typeof document === 'undefined') return;
    const locked = this._prioritiesAreLocked();
    const lockBtn = document.getElementById('priorityLockBtn');
    if (lockBtn) {
      lockBtn.textContent = locked ? '🔒 Locked' : '🔓 Unlocked';
      lockBtn.classList.toggle('is-locked', locked);
      lockBtn.setAttribute('aria-pressed', String(locked));
      lockBtn.title = locked
        ? 'Priority editing is locked. Click to unlock.'
        : 'Lock priority editing while keeping the table scrollable.';
    }
    const autoBtn = document.getElementById('autoAssignBtn');
    if (autoBtn) {
      if (!autoBtn.dataset.unlockedTitle) autoBtn.dataset.unlockedTitle = autoBtn.title;
      autoBtn.disabled = locked;
      autoBtn.setAttribute('aria-disabled', String(locked));
      autoBtn.title = locked ? 'Unlock priorities to use Auto-Assign.' : autoBtn.dataset.unlockedTitle;
    }
  },

  togglePriorityLock() {
    this.state.settings.priorityLocked = !this._prioritiesAreLocked();
    this._syncPriorityLockControls();
    const locked = this._prioritiesAreLocked();
    const wrap = document.getElementById('tableWrap');
    if (wrap) {
      wrap.classList.toggle('priorities-locked', locked);
      const cells = wrap.querySelectorAll('.prio-box:not(.incap)');
      for (let i = 0; i < cells.length; i++) {
        if (locked) cells[i].setAttribute('aria-disabled', 'true');
        else cells[i].removeAttribute('aria-disabled');
      }
    }
    const surfaces = [
      document.getElementById('workPlannerBody'),
      document.getElementById('optimizerPanel'),
    ];
    for (const surface of surfaces) {
      if (!surface) continue;
      const btns = surface.querySelectorAll('.btn');
      for (let i = 0; i < btns.length; i++) {
        const handler = btns[i].getAttribute('onclick') || '';
        if (handler.includes('autoAssign') || handler.includes('ptimizerSuggestion')) {
          btns[i].disabled = locked;
          if (locked) {
            btns[i].setAttribute('aria-disabled', 'true');
            btns[i].title = 'Unlock priorities to make changes.';
          } else {
            btns[i].removeAttribute('aria-disabled');
            btns[i].title = '';
          }
        }
      }
    }
    this.triggerAutoSave();
  },

  // Toggle the Priorities table between numbered and simple on/off modes.
  toggleManualPriorities() {
    this.state.settings.manualPriorities = !this.state.settings.manualPriorities;
    this.renderTable();
    this.triggerAutoSave();
  },

  handlePriorityClick(e, pid, jid) {
    if (!this._guardPriorityEdit('edit priorities')) return;
    e.preventDefault();
    const p = this.state.pawns.find(x => x.id === pid);
    if (!p) return;
    const cur = this.state.priorities[pid]?.[jid];

    // Simple mode: any click just toggles the job on or off.
    if (!this.state.settings.manualPriorities) {
      this.state.priorities[pid][jid] = (cur === null || cur === undefined || cur === 0) ? PriorityScale.defaultEnabled() : null;
      this.renderTable();
      this.triggerAutoSave();
      return;
    }

    this._manualPriorityMax();
    const leftRaises = this.state.settings.clickDirection !== 'left-to-low';
    const towardsHighPriority = e.button === 2 ? !leftRaises : leftRaises;
    this.state.priorities[pid][jid] = towardsHighPriority
      ? PriorityScale.next(cur)
      : PriorityScale.previous(cur);
    this.renderTable();
    this.triggerAutoSave();
  },
  handlePriorityWheel(e, pid, jid) {
    // Return before preventDefault so locking edits never locks normal page/table scrolling.
    if (!this._guardPriorityEdit('edit priorities')) return;
    e.preventDefault();
    // Simple on/off mode has no numeric levels to scroll through.
    if (!this.state.settings.manualPriorities) return;
    // Disable scroll input in widget/applet mode, clicks only
    if (window.innerWidth <= 550) return;
    // Respect user setting to disable scroll wheel on priorities
    if (this.state.settings.disableScrollWheel) return;
    const cur = this.state.priorities[pid]?.[jid];
    this._manualPriorityMax();
    const invert = this.state.settings.invertWheel;
    const up = invert ? (e.deltaY > 0) : (e.deltaY < 0);

    if (up) {
      this.state.priorities[pid][jid] = PriorityScale.next(cur);
    } else {
      this.state.priorities[pid][jid] = PriorityScale.previous(cur);
    }
    this.renderTable();
    this.triggerAutoSave();
  },
  handlePriorityKey(e, pid, jid) {
    if (!this._guardPriorityEdit('edit priorities')) return;
    const simple = !this.state.settings.manualPriorities;
    this._manualPriorityMax();
    const digit = parseInt(e.key);
    if (Number.isFinite(digit) && digit >= PriorityScale.highest && digit <= PriorityScale.lowestManual()) {
      this.state.priorities[pid][jid] = simple ? PriorityScale.defaultEnabled() : digit;
      this.renderTable();
      this.triggerAutoSave();
    } else if (e.key === '0' || e.key === 'Delete' || e.key === 'Backspace') {
      this.state.priorities[pid][jid] = null;
      this.renderTable();
      this.triggerAutoSave();
    }
  },

  // -- CAT LABELS --
  updateCatLabel(cat, val) {
    this.state.catLabels[cat] = val;
    this.triggerAutoSave();
  },

  // -- XENOTYPE / TRAIT PAWN SETTERS --
  setXenotype(pid, xid) {
    const p = this.state.pawns.find(p => p.id === pid);
    if (p) { p.xenotype = xid; this.renderAll(); this.triggerAutoSave(); }
  },
  togglePassion(pid, sid, delta = 1) {
    const p = this.state.pawns.find(p => p.id === pid);
    if (!p) return;
    // If this skill currently holds a modded (VSE) passion, cycling vanilla flames
    // would silently overwrite it. Route to the picker instead so the user makes a
    // deliberate choice (and can keep or change the modded passion).
    if (this._isModdedPassion && this._isModdedPassion(p.passionDefs && p.passionDefs[sid])) {
      if (typeof this.openPassionPicker === 'function') this.openPassionPicker(pid, sid);
      return;
    }
    const cur = p.passions[sid] || 0;
    // Cycle: 0 -> 1 -> 2 -> 0... (delta=1) or 0 -> 2 -> 1 -> 0... (delta=-1)
    let next = cur + delta;
    if (next > 2) next = 0;
    if (next < 0) next = 2;
    p.passions[sid] = next;
    // Keep the raw passion string in lockstep so the lossless save writer agrees.
    if (p.passionDefs) p.passionDefs[sid] = next === 2 ? 'Major' : next === 1 ? 'Minor' : 'None';
    // Update the sidebar passion button(s) IN PLACE rather than re-rendering the
    // card - that's what was jumping the pawn list back to the top. Passion only
    // changes the flame's class + glyph, so an in-place tweak is all that's needed.
    const flame = next === 2 ? '🔥🔥' : next === 1 ? '🔥' : '·';
    const cls = 'passion-btn' + (next === 1 ? ' on-1' : next === 2 ? ' on-2' : '');
    try {
      document.querySelectorAll(`[data-pawn-id="${pid}"] .skill-row[data-skill-id="${sid}"] .passion-btn`)
        .forEach(btn => { btn.className = cls; btn.textContent = flame; });
    } catch (_) { /* selector edge cases */ }
    // Keep the differential-render hash in sync so a later sidebar render is a no-op.
    if (this._pawnCardHashes && this._pawnCardHashes[pid] != null && this._pawnCardHash) {
      this._pawnCardHashes[pid] = this._pawnCardHash(p);
    }
    this.triggerAutoSave();
  },
  toggleIncap(pid, incapId) {
    const p = this.state.pawns.find(p => p.id === pid);
    if (!p) return;
    const xeno = this.getXeno(p.xenotype);
    const role = this.getRole(p.role || 'none');
    if ((xeno.incapable||[]).includes(incapId) || (role.incap||[]).includes(incapId)) return;
    const idx = p.incapable.indexOf(incapId);
    if (idx > -1) p.incapable.splice(idx, 1);
    else p.incapable.push(incapId);
    this.renderAll();
    this.triggerAutoSave();
  },

  // -- AUTO ASSIGN --
  _strategicFocusOptions() {
    const visible = this._visibleJobs();
    const visibleIds = new Set(visible.map(job => job.id));
    const groups = typeof WORK_FOCUS_GROUPS !== 'undefined' ? WORK_FOCUS_GROUPS : [];
    const options = [];
    const covered = new Set();
    groups.forEach(group => {
      const targets = group.jobIds.filter(id => visibleIds.has(id));
      if (!targets.length) return;
      targets.forEach(id => covered.add(id));
      options.push({ id: `group:${group.id}`, label: group.label, targetIds: targets, group: true });
    });
    visible.filter(job => !covered.has(job.id)).forEach(job => {
      options.push({ id: `job:${job.id}`, label: job.name || job.id, targetIds: [job.id], group: false });
    });
    return options;
  },

  _strategicFocusConfig() {
    const options = this._strategicFocusOptions();
    const id = typeof this.state.settings.strategicFocusId === 'string'
      ? this.state.settings.strategicFocusId : '';
    const selected = options.find(option => option.id === id);
    if (!selected) {
      this.state.settings.strategicFocusId = '';
      return { id: '', strength: 'normal', label: 'Balanced' };
    }
    const strength = this.state.settings.strategicFocusStrength === 'strong' ? 'strong' : 'normal';
    this.state.settings.strategicFocusStrength = strength;
    return {
      id: selected.id,
      strength,
      label: selected.label,
      protectionJobs: [...JOBS, ...(this.state.customJobs || [])],
    };
  },

  _syncStrategicFocusControls() {
    const focus = this._strategicFocusConfig();
    const select = document.getElementById('strategicFocusSelect');
    const strength = document.getElementById('strategicFocusStrength');
    if (select) {
      const options = this._strategicFocusOptions();
      const signature = options.map(option => `${option.id}:${option.label}`).join('|');
      if (select.dataset.focusOptions !== signature) {
        const groups = options.filter(option => option.group);
        const individual = options.filter(option => !option.group);
        select.innerHTML = `<option value="">Balanced</option>`
          + (groups.length ? `<optgroup label="Strategy">${groups.map(option =>
            `<option value="${_escapeHtml(option.id)}">${_escapeHtml(option.label)}</option>`).join('')}</optgroup>` : '')
          + (individual.length ? `<optgroup label="Individual work">${individual.map(option =>
            `<option value="${_escapeHtml(option.id)}">${_escapeHtml(option.label)}</option>`).join('')}</optgroup>` : '');
        select.dataset.focusOptions = signature;
      }
      if (select.value !== focus.id) select.value = focus.id;
    }
    if (strength) {
      strength.value = focus.strength;
      strength.disabled = !focus.id;
      strength.setAttribute('aria-disabled', focus.id ? 'false' : 'true');
    }
  },

  setStrategicFocus(id) {
    const valid = this._strategicFocusOptions().some(option => option.id === id);
    this.state.settings.strategicFocusId = valid ? id : '';
    if (!valid) this.state.settings.strategicFocusStrength = 'normal';
    this._syncStrategicFocusControls();
    this.renderTable();
    if (document.getElementById('workPlannerBody')) this.openWorkPlanner();
    else if (this._optimizerResult) this.runOptimizer();
    this.triggerAutoSave();
    const focus = this._strategicFocusConfig();
    this.toast(focus.id ? `Colony Focus: ${focus.label} (${focus.strength})` : 'Colony Focus: Balanced');
  },

  setStrategicFocusStrength(strength) {
    this.state.settings.strategicFocusStrength = strength === 'strong' ? 'strong' : 'normal';
    this._syncStrategicFocusControls();
    if (document.getElementById('workPlannerBody')) this.openWorkPlanner();
    else if (this._optimizerResult) this.runOptimizer();
    this.triggerAutoSave();
  },

  autoAssignAll() {
    if (!this._guardPriorityEdit('use Auto-Assign', true)) return false;
    this._manualPriorityMax();
    Perf.start('autoAssign.total');
    Perf._activeOp = 'autoAssign';
    const contextMap = this._c7PawnContextMap(
      this.state.pawns, this._c7EvidenceOptionsByPawn);
    Perf.measure('autoAssign.execute', () =>
      Engine.runMinMaxAssignment(
        this.state.pawns, this.state.roles, this.state.priorities,
        this._visibleJobs(), contextMap, this._strategicFocusConfig()));
    this.renderTable(contextMap);
    Perf._activeOp = null;
    Perf.end('autoAssign.total');
    Perf.increment('autoAssign.runs');
    const focus = this._strategicFocusConfig();
    this.toast(focus.id
      ? `Auto-assigned with ${focus.label} as the ${focus.strength} Colony Focus.`
      : 'Auto-assigned visible columns, weighing skills, passions and xenotype/gene effects.');
    this.triggerAutoSave();
    return true;
  },

  // -- COLONY OPTIMIZER --
  _optimizerVisible: false,
  _optimizerResult: null,

  toggleOptimizer() {
    this._optimizerVisible = !this._optimizerVisible;
    const panel = document.getElementById('optimizerPanel');
    const btn = document.getElementById('optimizerToggle');
    if (!this._optimizerVisible) {
      if (panel) panel.style.display = 'none';
      if (btn) btn.classList.remove('btn-accent');
      return;
    }
    if (btn) btn.classList.add('btn-accent');
    this.runOptimizer();
  },

  runOptimizer() {
    // Analyse only the columns currently visible in the table.
    this._manualPriorityMax();
    const contextMap = this._c7PawnContextMap(
      this.state.pawns, this._c7EvidenceOptionsByPawn);
    this._optimizerResult = Engine.analyzeColony(
      this.state.pawns, this.state.priorities, this._visibleJobs(), contextMap,
      this._strategicFocusConfig());
    this.renderOptimizer();
  },

  renderOptimizer() {
    const panel = document.getElementById('optimizerPanel');
    if (!panel) return;
    const r = this._optimizerResult;
    if (!r) { panel.style.display = 'none'; return; }
    panel.style.display = '';
    if (this.state.pawns.length === 0) {
      panel.innerHTML = `<div class="settings-card" style="text-align:center; padding:24px; color:var(--text3)">Add pawns to analyse your colony.</div>`;
      return;
    }
    let html = this._optimizerHTML(r);
    if (r.recommendations.length > 0 || r.gaps.some(g => g.bestPawn)) {
      const disabled = this._lockedPriorityActionAttrs('apply suggestions');
      html += `<div style="display:flex; gap:8px; justify-content:flex-end; margin-top:4px">
        <button class="btn btn-sm" onclick="App.applyAllOptimizerSuggestions()"${disabled} style="font-size:var(--f-xs)">Apply All Suggestions</button>
        <button class="btn btn-sm" onclick="App.toggleOptimizer()" style="font-size:var(--f-xs)">Dismiss</button>
      </div>`;
    }
    panel.innerHTML = html;
  },

  // Shared analysis HTML (gaps / single points / recommendations / all-clear),
  // used by both the inline panel and the Work Planner modal.
  _optimizerHTML(r) {
    let html = '';
    const suggestionDisabled = this._lockedPriorityActionAttrs('apply this suggestion');
    if (r.strategicFocus) {
      html += `<div class="settings-card colony-focus-notice" style="margin-bottom:var(--gap-sm); padding:10px 14px">
        <div style="font-weight:800; color:var(--accent); font-size:var(--f-sm)">Colony Focus: ${_escapeHtml(r.strategicFocus.label)}</div>
        <div style="font-size:var(--f-xs); color:var(--text3); margin-top:2px">${r.strategicFocus.strength === 'strong' ? 'Strong' : 'Normal'} preference - suitable workers are promoted without bypassing restrictions or sole-worker protection.</div>
      </div>`;
    }

    // COVERAGE GAPS
    if (r.gaps.length > 0) {
      html += `<div class="settings-card" style="margin-bottom:var(--gap-sm); padding:12px 16px">
        <div class="section-title section-title--sm" style="color:var(--p4-txt); margin-bottom:8px">Coverage Gaps</div>
        <div style="display:flex; flex-direction:column; gap:6px">`;
      r.gaps.forEach(g => {
        const isCrit = g.severity === 'critical';
        const borderColor = isCrit ? 'var(--p4-txt)' : 'var(--accent)';
        const icon = isCrit ? '!!!' : '!';
        const iconColor = isCrit ? 'var(--p4-txt)' : 'var(--accent)';
        html += `<div style="display:flex; align-items:center; gap:10px; background:var(--surface2); padding:8px 12px; border-radius:8px; border-left:4px solid ${borderColor}">
          <span style="font-weight:700; color:${iconColor}; font-size:var(--f-sm); flex-shrink:0; width:24px; text-align:center">${icon}</span>
          <div style="flex:1; min-width:0">
            <div style="font-weight:700; font-size:var(--f-sm)">${_escapeHtml(g.jobName)}</div>
            <div style="font-size:var(--f-xs); color:var(--text3)">${_escapeHtml(g.reason)}</div>
          </div>
          ${g.bestPawn ? `<div style="font-size:var(--f-xs); color:var(--text2); text-align:right; flex-shrink:0">Best: ${_escapeHtml(g.bestPawn.pawnName)}${g.bestPawn.hasSkill ? `<br><span style="color:var(--accent)">Skill ${g.bestPawn.skill}</span>` : ''}</div>
          <button class="btn btn-sm" onclick="App.applyOptimizerSuggestion('${g.bestPawn.pawnId}','${g.jobId}',1)"${suggestionDisabled} style="flex-shrink:0; font-size:calc(10px * var(--font-scale)); padding:4px 8px">Set P1</button>` : ''}
        </div>`;
      });
      html += `</div></div>`;
    }

    // SINGLE POINTS OF FAILURE
    if (r.singlePoints.length > 0) {
      html += `<div class="settings-card" style="margin-bottom:var(--gap-sm); padding:12px 16px">
        <div class="section-title section-title--sm" style="color:var(--accent); margin-bottom:8px">Single Points of Failure</div>
        <div style="display:flex; flex-wrap:wrap; gap:6px">`;
      r.singlePoints.forEach(sp => {
        html += `<div style="display:inline-flex; align-items:center; gap:6px; background:var(--surface2); padding:6px 10px; border-radius:6px; font-size:var(--f-xs); border:1px solid var(--accent)">
          <span style="font-weight:700">${_escapeHtml(sp.jobName)}</span>
          <span style="color:var(--text3)">only</span>
          <span style="color:var(--accent)">${_escapeHtml(sp.pawnName)}</span>
        </div>`;
      });
      html += `</div></div>`;
    }

    // RECOMMENDATIONS
    if (r.recommendations.length > 0) {
      html += `<div class="settings-card" style="margin-bottom:var(--gap-sm); padding:12px 16px">
        <div class="section-title section-title--sm" style="color:var(--ok-txt); margin-bottom:8px">Recommendations</div>
        <div style="display:flex; flex-direction:column; gap:6px">`;
      r.recommendations.forEach(rec => {
        html += `<div style="display:flex; align-items:center; gap:10px; background:var(--surface2); padding:8px 12px; border-radius:8px; border-left:4px solid var(--ok-txt)">
          <div style="flex:1; min-width:0">
            <div style="font-size:var(--f-sm)"><span style="color:var(--accent); font-weight:700">${_escapeHtml(rec.pawnName)}</span> for <span style="font-weight:700">${_escapeHtml(rec.jobName)}</span></div>
            <div style="font-size:var(--f-xs); color:var(--text3)">${_escapeHtml(rec.reason)}</div>
          </div>
          <button class="btn btn-sm" onclick="App.applyOptimizerSuggestion('${rec.pawnId}','${rec.jobId}',${rec.suggestedPriority})"${suggestionDisabled} style="flex-shrink:0; font-size:calc(10px * var(--font-scale)); padding:4px 8px">Set P${rec.suggestedPriority}</button>
        </div>`;
      });
      html += `</div></div>`;
    }

    // ALL CLEAR
    if (r.gaps.length === 0 && r.recommendations.length === 0 && r.singlePoints.length === 0) {
      html = `<div class="settings-card" style="text-align:center; padding:20px; border-left:4px solid var(--ok-txt)">
        <div style="font-weight:700; color:var(--ok-txt); margin-bottom:4px">Colony looks good!</div>
        <div style="font-size:var(--f-xs); color:var(--text3)">All critical jobs are covered with capable pawns. No gaps detected.</div>
      </div>`;
    }

    return html;
  },

  // -- WORK PLANNER MODAL --
  // Consolidates: visible-task overview, one-click Auto-Assign, add custom task,
  // column management, and the colony analysis with apply buttons.
  openWorkPlanner() {
    this._manualPriorityMax();
    const visible = this._visibleJobs();
    const contextMap = this._c7PawnContextMap(
      this.state.pawns, this._c7EvidenceOptionsByPawn);
    const r = Engine.analyzeColony(
      this.state.pawns, this.state.priorities, visible, contextMap,
      this._strategicFocusConfig());
    this._optimizerResult = r; // so Apply-All uses the same result
    const pawns = this.state.pawns;
    const analysis = pawns.length
      ? this._optimizerHTML(r)
      : `<div class="settings-card" style="text-align:center; padding:24px; color:var(--text3)">Add pawns to analyse your colony.</div>`;
    const applyAll = (r.recommendations.length > 0 || r.gaps.some(g => g.bestPawn))
      ? `<button class="btn btn-sm btn-accent" onclick="App.applyAllOptimizerSuggestions()"${this._lockedPriorityActionAttrs('apply suggestions')} style="font-size:var(--f-xs)">Apply All</button>` : '';
    const autoAssignDisabled = this._lockedPriorityActionAttrs('use Auto-Assign');
    const body = `
      <div id="workPlannerBody">
        <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:12px">
          <button class="btn btn-sm btn-accent" onclick="App.autoAssignAll(); App.openWorkPlanner()"${autoAssignDisabled} style="font-size:var(--f-xs)">Auto-Assign</button>
          <button class="btn btn-sm" onclick="App._addTaskFromPlanner()" style="font-size:var(--f-xs)">+ Add task</button>
          <button class="btn btn-sm" onclick="App._dismissModal(false); App.openJobColumnManager()" style="font-size:var(--f-xs)">Manage columns</button>
          ${applyAll}
          <span style="margin-left:auto; font-size:var(--f-xs); color:var(--text3)">${visible.length} tasks · ${pawns.length} colonists</span>
        </div>
        <div style="max-height:55vh; overflow-y:auto">${analysis}</div>
      </div>`;
    this._showGenericModal('Work Planner', body);
  },

  // Re-render whichever analysis surface is currently open (modal or panel).
  _refreshPlanner() {
    const m = document.getElementById('genericModal');
    if (m && m.classList.contains('show') && document.getElementById('workPlannerBody')) {
      this.openWorkPlanner();
    } else {
      this.runOptimizer();
    }
  },

  _addTaskFromPlanner() {
    this._reopenPlannerAfterAdd = true;
    this.addCustomJob();
  },

  applyOptimizerSuggestion(pawnId, jobId, priority) {
    if (!this._guardPriorityEdit('apply this suggestion', true)) return false;
    if (!this.state.priorities[pawnId]) this.state.priorities[pawnId] = {};
    this.state.priorities[pawnId][jobId] = priority;
    this.renderTable();
    this._refreshPlanner();
    this.triggerAutoSave();
    return true;
  },

  applyAllOptimizerSuggestions() {
    if (!this._guardPriorityEdit('apply suggestions', true)) return false;
    const r = this._optimizerResult;
    if (!r) return false;
    // Apply gap fixes
    r.gaps.forEach(g => {
      if (g.bestPawn) {
        if (!this.state.priorities[g.bestPawn.pawnId]) this.state.priorities[g.bestPawn.pawnId] = {};
        this.state.priorities[g.bestPawn.pawnId][g.jobId] = 1;
      }
    });
    // Apply recommendations
    r.recommendations.forEach(rec => {
      if (!this.state.priorities[rec.pawnId]) this.state.priorities[rec.pawnId] = {};
      this.state.priorities[rec.pawnId][rec.jobId] = rec.suggestedPriority;
    });
    this.renderTable();
    this._refreshPlanner();
    this.triggerAutoSave();
    return true;
  },
});

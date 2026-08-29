/**
 * SCHEDULE TAB
 * Schedule grid rendering, shift type selection, paint interactions,
 * active-count row, auto-optimise shifts.
 * Auto-split from app.js - methods are assigned onto the App object.
 */
Object.assign(App, {
  selectShiftType(idx) {
    this.state.selectedShiftType = idx;
    this.renderSchedule();
  },

  _schedPainting: false,

  _schedPaintStart(pid, hour, e) {
    e.preventDefault();
    this._schedPainting = true;
    this._schedPaintCell(pid, hour);
  },

  _schedPaintOver(pid, hour) {
    if (!this._schedPainting) return;
    this._schedPaintCell(pid, hour);
  },

  _schedPaintCell(pid, hour) {
    const p = this.state.pawns.find(x => x.id === pid);
    if (!p) return;
    const type = this.state.selectedShiftType;
    if (p.schedule[hour] === type) return;
    p.schedule[hour] = type;
    // A manual edit makes the optimiser's "why these shifts?" summary stale - drop it.
    if (this._schedRationale) {
      this._schedRationale = null;
      const sum = document.getElementById('schedSummary');
      if (sum) sum.remove();
    }
    const color = _safeColor(this.state.shiftColors[type], '#555555');
    const label = this.state.shiftTypes[type];
    // Try full-mode table rows first
    const rows = document.querySelectorAll('.sched-row');
    const pawnIdx = this.state.pawns.indexOf(p);
    if (rows[pawnIdx]) {
      const cell = rows[pawnIdx].children[hour + 1]; // +1 for name column
      if (cell) {
        cell.style.background = color;
        cell.title = `${p.name} ${hour}:00 - ${label}`;
      }
    }
    // Also update strip-mode cells (widget)
    const stripCell = document.querySelector(`.sched-strip-cell[data-sched-pid="${pid}"][data-sched-hour="${hour}"]`);
    if (stripCell) {
      stripCell.style.background = color;
      stripCell.title = `${hour}:00 - ${label}`;
    }
    // Update actives row
    this._schedUpdateActives();
    this.triggerAutoSave();
  },

  _schedUpdateActives() {
    const types = this.state.shiftTypes;
    const sleepIdx = types.indexOf('Sleep');
    const hourlyCoverage = Array(24).fill(0);
    this.state.pawns.forEach(p => {
      p.schedule.forEach((type, hour) => {
        if (type !== sleepIdx) hourlyCoverage[hour]++;
      });
    });
    const maxCoverage = Math.max(...hourlyCoverage, 1);
    const activesRow = document.querySelector('.sched-row-actives');
    if (!activesRow) return;
    const cells = activesRow.querySelectorAll('.sched-td-active');
    cells.forEach((cell, i) => {
      const count = hourlyCoverage[i];
      const pct = count / maxCoverage;
      cell.style.background = `rgba(var(--accent-rgb), ${(0.08 + pct * 0.45).toFixed(2)})`;
      cell.textContent = count || '';
    });
  },

  autoOptimizeSchedules() {
    // Keep the rationale report so the grid can explain *why* it chose these hours.
    const contextMap = this._c7PawnContextMap(
      this.state.pawns, this._c7EvidenceOptionsByPawn);
    this._schedRationale = Engine.optimizeSchedules(
      this.state.pawns, { contextMap });
    // The shift planner piggy-backs ON the priorities table - it reads priorities
    // (workload, critical cover) and must never write them. The auto-assign re-run
    // that used to live here silently reset EVERY column, including manual choices.
    this.renderSchedule();
    this.toast('Shifts optimised around your priorities table.');
    this.triggerAutoSave();
  },

  // Rationale shown after the optimiser runs (null = nothing to explain yet).
  _schedRationale: null,

  _schedFmtHour(h) {
    const n = (((Math.round(h) % 24) + 24) % 24);
    return String(n).padStart(2, '0') + ':00';
  },

  _schedWindow(start, len) {
    if (start == null || !len) return null;
    return this._schedFmtHour(start) + ' - ' + this._schedFmtHour(start + len);
  },

  _schedSummaryHTML() {
    const r = this._schedRationale;
    if (!r || !Array.isArray(r.pawns) || !r.pawns.length) return '';
    // Drop any pawn that has since been deleted, so the summary can't list a
    // colonist who no longer exists. Refresh names in case they were renamed.
    const byId = new Map((this.state.pawns || []).map(p => [p.id, p]));
    r.pawns = r.pawns.filter(rp => byId.has(rp.id)).map(rp => ({ ...rp, name: byId.get(rp.id).nickname || byId.get(rp.id).name || rp.name }));
    if (!r.pawns.length) return '';
    const presetLabel = { panic: 'Panic (work-heavy)', chill: 'Chill (rest-heavy)', night: 'Night shift' };

    // Colony-level headline.
    const bits = [`<strong>${r.pawns.length}</strong> colonist${r.pawns.length !== 1 ? 's' : ''} scheduled`];
    if (r.nightCount) bits.push(`<strong>${r.nightCount}</strong> on night shift`);
    if (r.manualCount) bits.push(`<strong>${r.manualCount}</strong> kept your manual preset`);
    if (r.gapsRepaired) bits.push(`<strong>${r.gapsRepaired}</strong> coverage gap${r.gapsRepaired !== 1 ? 's' : ''} repaired`);
    bits.push(r.fullCoverage
      ? 'at least one colonist is awake every hour'
      : '<span style="color:#e8a838">warning: some hours have nobody awake - add colonists or adjust sleep</span>');

    const rows = r.pawns.map(p => {
      let windows;
      if (p.mode === 'downed') {
        windows = `<span style="color:var(--p4-txt); font-weight:700">Downed</span>, free schedule until they recover`;
      } else if (p.mode === 'manual') {
        windows = `Kept your <strong>${_escapeHtml(presetLabel[p.preset] || p.preset || 'manual')}</strong> preset`;
      } else {
        const parts = [];
        const sw = this._schedWindow(p.sleepStart, p.sleepHours);
        const jw = this._schedWindow(p.joyStart, p.joyHours);
        const ww = this._schedWindow(p.workStart, p.workHours);
        if (sw) parts.push(`<span style="color:var(--text2)">Sleep</span> ${sw}`);
        if (ww) parts.push(`<span style="color:var(--text2)">Work</span> ${ww}`);
        if (jw) parts.push(`<span style="color:var(--text2)">Recreation</span> ${jw}`);
        if (p.mode === 'sleepless') parts.unshift('<span style="color:var(--accent)">No sleep needed</span>');
        windows = parts.join('<span style="color:var(--text3)"> &middot; </span>') || 'Balanced day shift';
      }
      const drivers = (p.drivers && p.drivers.length)
        ? p.drivers.map(d => _escapeHtml(d)).join('; ')
        : 'Standard day shift with balanced sleep, work and recreation';
      return `<div style="padding:6px 0; border-top:1px solid var(--border)">
        <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap">
          <strong style="color:var(--text)">${_escapeHtml(p.name)}</strong>
          <span style="font-size:var(--f-xs); color:var(--text)">${windows}</span>
        </div>
        <div style="font-size:var(--f-xs); color:var(--text3); margin-top:2px">${drivers}</div>
      </div>`;
    }).join('');

    return `<details class="sched-summary" id="schedSummary"
        style="max-width:940px; margin:0 auto var(--gap-md); background:var(--surface); border:1px solid var(--border-med); border-radius:var(--radius-md); overflow:hidden">
      <summary style="cursor:pointer; padding:var(--gap-md) var(--gap-lg); font-weight:800; color:var(--accent); list-style:none; background:var(--surface2); border-bottom:1px solid var(--border-bright)">
        Why these shifts? <span style="font-weight:600; color:var(--text3); font-size:var(--f-xs)">(optimiser reasoning - click to expand)</span>
      </summary>
      <div style="padding:var(--gap-sm) var(--gap-lg) var(--gap-md)">
        <div style="font-size:var(--f-sm); color:var(--text2); padding:6px 0 2px">${bits.join('<span style="color:var(--text3)"> &middot; </span>')}</div>
        ${rows}
      </div>
    </details>`;
  },

  _condenseHours(hours) {
    if (!hours.length) return [];
    const sorted = [...hours].sort((a, b) => a - b);
    const windows = [];
    let from = sorted[0];
    let prev = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === prev + 1) {
        prev = sorted[i];
      } else {
        windows.push({ from, to: (prev + 1) % 24 });
        from = sorted[i];
        prev = sorted[i];
      }
    }
    windows.push({ from, to: (prev + 1) % 24 });
    if (windows.length >= 2 && windows[windows.length - 1].to === 0 && windows[0].from === 0) {
      windows[0] = { from: windows[windows.length - 1].from, to: windows[0].to };
      windows.pop();
    }
    return windows;
  },

  _schedProposals: null,

  _schedResilienceHTML(c7ContextMap) {
    if (!this.state.pawns.length) return '';
    const contextMap = c7ContextMap || this._c7PawnContextMap(
      this.state.pawns, this._c7EvidenceOptionsByPawn);
    const schedMap = {};
    this.state.pawns.forEach(p => {
      if (Array.isArray(p.schedule) && p.schedule.length === 24) schedMap[p.id] = p.schedule;
    });
    const allJobs = typeof JOBS !== 'undefined' ? JOBS : [];
    const resilience = Engine.analyzeTemporalResilience(
      this.state.pawns, allJobs, schedMap, contextMap);
    if (!resilience.jobs.length) { this._schedProposals = null; return ''; }

    const allHealthy = resilience.gaps === 0 && resilience.fragileHours === 0;
    const hasInferred = resilience.jobs.some(j =>
      j.coverage.some(h => h.capablePawns.some(cp => cp.inferredAwake)));

    if (allHealthy && !hasInferred) { this._schedProposals = null; return `<div style="max-width:940px; margin:0 auto var(--gap-sm); padding:var(--gap-sm) var(--gap-lg); font-size:var(--f-xs); color:var(--text3)">Temporal resilience: all critical jobs covered</div>`; }

    const proposals = (resilience.gaps > 0 || resilience.fragileHours > 0)
      ? Engine.proposeTemporalAdjustments(
        this.state.pawns, allJobs, schedMap, resilience, contextMap)
      : [];
    this._schedProposals = proposals;

    const sections = resilience.jobs.map(j => {
      const lines = [];
      if (j.gapHours.length === 0 && j.fragileHours.length === 0) {
        lines.push(`<span style="color:var(--text3)">Covered all day</span>`);
      } else {
        if (j.gapHours.length) {
          const ws = this._condenseHours(j.gapHours);
          const wStr = ws.map(w => this._schedFmtHour(w.from) + '-' + this._schedFmtHour(w.to)).join(', ');
          lines.push(`<span style="color:#ef5350">No capable pawn awake ${wStr}</span>`);
        }
        if (j.fragileHours.length) {
          const ws = this._condenseHours(j.fragileHours);
          const wStr = ws.map(w => this._schedFmtHour(w.from) + '-' + this._schedFmtHour(w.to)).join(', ');
          lines.push(`<span style="color:#e8a838">Single-pawn coverage ${wStr}</span>`);
        }
      }

      const jobProposals = proposals.filter(pr => pr.jobId === j.jobId);
      jobProposals.forEach((pr, pi) => {
        const idx = proposals.indexOf(pr);
        const sleepFrom = this._schedFmtHour(pr.currentSleep.start);
        const sleepTo = this._schedFmtHour((pr.currentSleep.start + pr.currentSleep.hours) % 24);
        const newFrom = this._schedFmtHour(pr.proposedSleep.start);
        const newTo = this._schedFmtHour((pr.proposedSleep.start + pr.proposedSleep.hours) % 24);
        const costParts = [];
        costParts.push(`${pr.costs.sleepShiftHours}h sleep shift`);
        if (pr.costs.nightOwlPenaltyHours) costParts.push(`${pr.costs.nightOwlPenaltyHours}h Night Owl penalty`);
        if (pr.costs.uvPenaltyHours) costParts.push(`${pr.costs.uvPenaltyHours}h UV penalty`);
        const isGap = pr.type === 'gap';
        const benefitText = isGap
          ? `Restores ${pr.benefit.gapsRemoved} uncovered hour${pr.benefit.gapsRemoved !== 1 ? 's' : ''}`
          : `Improves single-point coverage`;
        const btnLabel = isGap ? 'Apply' : 'Apply optional improvement';
        const btnColor = isGap ? 'var(--accent)' : 'var(--text3)';
        lines.push(`<div style="margin-top:6px; padding:6px 8px; background:var(--surface2); border-radius:var(--radius-sm); border:1px solid var(--border)">
          <div style="font-size:var(--f-xs); color:var(--text2)">Shift <strong>${_escapeHtml(pr.pawnName)}</strong> sleep <span style="color:var(--text3)">${sleepFrom}-${sleepTo}</span> to <strong>${newFrom}-${newTo}</strong></div>
          <div style="font-size:var(--f-xs); color:var(--text3); margin-top:2px">${benefitText} · ${costParts.join(' · ')}</div>
          <button onclick="App._applyProposal(${idx})" style="margin-top:4px; padding:2px 10px; font-size:var(--f-xs); border:1px solid ${btnColor}; border-radius:var(--radius-sm); background:transparent; color:${btnColor}; cursor:pointer">${btnLabel}</button>
        </div>`);
      });

      return `<div style="padding:4px 0"><strong style="color:var(--text)">${_escapeHtml(j.jobName)}</strong><br>${lines.join('')}</div>`;
    }).join('');

    const inferredNote = hasInferred
      ? '<div style="font-size:var(--f-xs); color:var(--text3); margin-top:4px; font-style:italic">Some pawns have no schedule data - coverage is inferred, not confirmed.</div>' : '';

    return `<details class="sched-resilience" open style="max-width:940px; margin:0 auto var(--gap-sm); background:var(--surface); border:1px solid var(--border-med); border-radius:var(--radius-md); overflow:hidden">
      <summary style="cursor:pointer; padding:var(--gap-sm) var(--gap-lg); font-weight:700; font-size:var(--f-sm); color:${resilience.gaps > 0 ? '#ef5350' : '#e8a838'}; list-style:none; background:var(--surface2); border-bottom:1px solid var(--border)">
        Temporal resilience ${resilience.gaps > 0 ? '- ' + resilience.gaps + ' uncovered hour' + (resilience.gaps !== 1 ? 's' : '') : resilience.fragileHours > 0 ? '- ' + resilience.fragileHours + ' fragile hour' + (resilience.fragileHours !== 1 ? 's' : '') : ''}
      </summary>
      <div style="padding:var(--gap-sm) var(--gap-lg)">${sections}${inferredNote}</div>
    </details>`;
  },

  _applyProposal(idx) {
    const proposals = this._schedProposals;
    if (!Array.isArray(proposals) || idx < 0 || idx >= proposals.length) return;
    const pr = proposals[idx];
    const pawn = this.state.pawns.find(p => p.id === pr.pawnId);
    if (!pawn) {
      this.toast('Pawn no longer exists.');
      return;
    }

    if (!Engine.verifyProposalPrecondition(pr, pawn.schedule)) {
      this.toast('Schedule has changed since this recommendation was made. Recomputing.');
      this._schedProposals = null;
      this._schedRationale = null;
      this.renderSchedule();
      return;
    }

    pawn.schedule = [...pr.proposedSchedule];

    this._schedRationale = null;
    this._schedProposals = null;
    this.triggerAutoSave();
    this.renderSchedule();
    this.toast(`Shifted ${_escapeHtml(pr.pawnName)} sleep to ${this._schedFmtHour(pr.proposedSleep.start)}-${this._schedFmtHour((pr.proposedSleep.start + pr.proposedSleep.hours) % 24)}.`);
  },

  // -- CONTENT HUB ACTIONS --

  _schedFilter: '',
  renderSchedule(c7ContextMap) {
    const container = document.getElementById('schedContainer');
    if (!container) return;
    const types = this.state.shiftTypes;
    const colors = this.state.shiftColors;

    // Filter pawns by schedule search
    const schedSearch = (this._schedFilter || '').toLowerCase();
    const filteredPawns = this.state.pawns.filter(p => !schedSearch || (p.nickname || p.name).toLowerCase().includes(schedSearch));

    // Calculate Coverage Heatmap (Any type EXCEPT Sleep is considered "Active")
    const sleepIdx = types.indexOf('Sleep');
    const hourlyCoverage = Array(24).fill(0);
    filteredPawns.forEach(p => {
      p.schedule.forEach((type, hour) => {
        if (type !== sleepIdx) hourlyCoverage[hour]++;
      });
    });
    const maxCoverage = Math.max(...hourlyCoverage, 1);

    const sel = this.state.selectedShiftType || 0;
    const isWidget = window.innerWidth <= 550;

    const legend = `<div class="sched-legend">
      <div class="sched-legend-types">
        ${types.map((t,i) => `
          <div class="sched-legend-item${i === sel ? ' sched-legend-selected' : ''}" onclick="App.selectShiftType(${i})" style="cursor:pointer${i === sel ? ';outline:2px solid var(--accent);outline-offset:1px' : ''}">
            <span class="sched-color-swatch" style="background:${colors[i]}"></span>
            <span class="sched-type-label">${_escapeHtml(t)}</span>
          </div>`).join('')}
      </div>
      <div class="sched-legend-info">
        <div style="font-size:${isWidget ? '9px' : 'var(--f-xs)'}; color:var(--text3)">Select type, then paint cells</div>
      </div>
    </div>`;

    if (isWidget) {
      // Compact strip layout: pawn name + 24 colored cells as a painted bar
      const pawnStrips = filteredPawns.map(p => { try {
        const sched = Array.isArray(p.schedule) && p.schedule.length===24 ? p.schedule : Array(24).fill(0);
        const cells = sched.map((type, hour) => {
          const t = (Number.isFinite(type) && type >= 0 && type < types.length) ? type : 0;
          return `<div class="sched-strip-cell" data-sched-pid="${p.id}" data-sched-hour="${hour}" onmousedown="App._schedPaintStart('${p.id}',${hour},event)" onmouseover="App._schedPaintOver('${p.id}',${hour})" ontouchstart="App._schedPaintStart('${p.id}',${hour},event)" oncontextmenu="event.preventDefault()" title="${hour}:00 - ${_escapeHtml(types[t]||'?')}" style="background:${_safeColor(colors[t], '#555')}"></div>`;
        }).join('');
        return `<div class="sched-strip-row">
          <input class="sched-strip-name sched-name-input" value="${_escapeHtml(p.nickname || p.name)}" oninput="App.renameNickname('${p.id}', this.value)" ${p.downed ? 'style="color:var(--p4-txt)" title="Downed, incapacitated in bed; the game ignores their schedule until they recover"' : ''}>
          <div class="sched-strip-bar" onmouseup="App._schedPainting=false" onmouseleave="App._schedPainting=false">${cells}</div>
        </div>`;
      } catch(err) { console.warn('Strip render error', p?.id, err); return ''; } }).join('');

      const activeBar = hourlyCoverage.map(count => {
        const pct = count / maxCoverage;
        return `<div class="sched-strip-cell" style="background:rgba(var(--accent-rgb), ${(0.1 + pct * 0.5).toFixed(2)}); font-size:calc(8px * var(--font-scale)); color:var(--bg); font-weight:800; display:flex; align-items:center; justify-content:center">${count || ''}</div>`;
      }).join('');

      // Hour markers with even spacing
      const hourMarkers = `<div style="display:grid; grid-template-columns:54px 1fr; gap:6px; margin-bottom:3px">
        <div></div>
        <div style="display:grid; grid-template-columns:repeat(24, 1fr); font-size:calc(8px * var(--font-scale)); color:var(--text3); text-align:center">
          <div>0</div><div></div><div></div><div>3</div><div></div><div></div>
          <div>6</div><div></div><div></div><div>9</div><div></div><div></div>
          <div style="color:var(--accent)">12</div><div></div><div></div><div>15</div><div></div><div></div>
          <div>18</div><div></div><div></div><div>21</div><div></div><div></div>
        </div>
      </div>`;

      container.innerHTML = `${this._schedSummaryHTML()}${this._schedResilienceHTML(c7ContextMap)}<div class="sched-panel">${legend}
        <div style="padding:var(--gap-sm) var(--gap-sm)">
          ${hourMarkers}
          ${pawnStrips}
          <div class="sched-strip-row" style="margin-top:6px; border-top:1px solid var(--border-med); padding-top:6px">
            <div class="sched-strip-name" style="color:var(--accent); font-weight:800; font-size:calc(10px * var(--font-scale))" title="Active pawns per hour - shows how many colonists are awake and working at each hour">Active</div>
            <div class="sched-strip-bar" style="height:20px">${activeBar}</div>
          </div>
        </div>
      </div>`;
    } else {
      container.innerHTML = `${this._schedSummaryHTML()}${this._schedResilienceHTML(c7ContextMap)}<div class="sched-panel">${legend}
        <div class="sched-table-wrap">
          <table class="sched-table" onmouseup="App._schedPainting=false" onmouseleave="App._schedPainting=false">
            <thead><tr>
              <th class="sched-th-name">Colonist</th>
              ${Array.from({length:24}).map((_,i) => `<th class="sched-th-hour">${i}</th>`).join('')}
            </tr></thead>
            <tbody>
              ${filteredPawns.map(p => { try { const isNightOwl = (p.traits||[]).includes('night_owl'); const xeno = this.getXeno(p.xenotype); const uvLvl = xeno.uvSensitivity||0; const sched = Array.isArray(p.schedule) && p.schedule.length===24 ? p.schedule : Array(24).fill(0); return `
                <tr class="sched-row" draggable="true" ondragstart="App.handleTableDragStart(event, '${p.id}')" ondragover="App.handleTableDragOver(event)" ondragleave="App.handleTableDragLeave(event)" ondrop="App.handleTableDrop(event, '${p.id}')" ondragend="App.handleTableDragEnd(event)"><td class="sched-td-name"><span style="cursor:grab;color:var(--text3);font-size:calc(10px * var(--font-scale));margin-right:4px" title="Drag to reorder">⠿</span><input class="sched-name-input" value="${_escapeHtml(p.nickname||p.name)}" oninput="App.renameNickname('${p.id}', this.value)">${isNightOwl ? '<span style="font-size:calc(9px * var(--font-scale));color:var(--accent);margin-left:4px" title="Night Owl">NO</span>' : ''}${uvLvl >= 1 ? '<span style="font-size:calc(9px * var(--font-scale));color:#e8a838;margin-left:4px" title="'+(uvLvl===2?'Intense':'Mild')+' UV Sensitivity -schedule for night work">UV</span>' : ''}${p.downed ? '<span style="font-size:calc(9px * var(--font-scale));color:var(--p4-txt);font-weight:800;margin-left:4px" title="Downed, incapacitated in bed (from the save import). The game ignores their schedule and no jobs can be assigned until they recover.">DOWN</span>' : ''}</td>${sched.map((type, hour) => { const t = (Number.isFinite(type) && type >= 0 && type < types.length) ? type : 0; return `<td class="sched-td-cell" onmousedown="App._schedPaintStart('${p.id}',${hour},event)" onmouseover="App._schedPaintOver('${p.id}',${hour})" oncontextmenu="event.preventDefault()" title="${_escapeHtml(p.nickname||p.name)} ${hour}:00 - ${_escapeHtml(types[t]||'?')}" style="background:${_safeColor(colors[t], '#555555')}"></td>`; }).join('')}</tr>`; } catch(err) { console.warn('Sched render error', p?.id, err); return `<tr><td class="sched-td-name" style="color:#ef5350">! ${_escapeHtml(p?.nickname||p?.name||'?')}</td>${Array(24).fill('<td></td>').join('')}</tr>`; } }).join('')}
              <tr class="sched-row-actives">
                <td class="sched-td-name" style="color:var(--accent)" title="Active pawns per hour - shows how many colonists are awake and working at each hour">Active</td>
                ${hourlyCoverage.map(count => {
                  const pct = count / maxCoverage;
                  return `<td class="sched-td-active" style="background:rgba(var(--accent-rgb), ${(0.08 + pct * 0.45).toFixed(2)})">${count || ''}</td>`;
                }).join('')}
              </tr>
            </tbody>
          </table>
        </div>
      </div>`;
    }
  },
});

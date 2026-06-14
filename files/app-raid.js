/**
 * RAID CALCULATOR
 * Raid point estimation, storyteller logic, date/quadrum helpers,
 * wealth calculation, difficulty modifiers, custom storytellers.
 * Auto-split from app.js - methods are assigned onto the App object.
 */
Object.assign(App, {
  _daysToQuadrum(totalDays) {
    // totalDays is 1-indexed (day 1 = Aprimay 1, year 5500)
    const td = Number(totalDays);
    const d = Math.max(0, (Number.isFinite(td) ? td : 1) - 1);
    const year = 5500 + Math.floor(d / 60);
    const dayInYear = d % 60;
    const quadrumIdx = Math.floor(dayInYear / 15);
    const dayInQuadrum = (dayInYear % 15) + 1;
    return { year, quadrum: this._QUADRUMS[quadrumIdx], quadrumIdx, day: dayInQuadrum };
  },

  _quadrumToDays(quadrumIdx, dayInQuadrum, year) {
    return ((year - 5500) * 60) + (quadrumIdx * 15) + dayInQuadrum;
  },

  // Turn a survival-day count (daysPassed-style) into the colony's real calendar total-day for
  // _daysToQuadrum, applying the founding offset captured from the save. With no offset (legacy
  // state, or a colony founded on Aprimay 1) this reduces to the old founding-relative behaviour.
  _raidCalDays(surviveDays) {
    return ((this.state.raid && this.state.raid.dateOffset) || 0) + (surviveDays || 0);
  },

  _DIFFICULTY_SCALES: {
    peaceful: 0.10, community: 0.30, adventure: 0.60,
    strive: 1.00, blood: 1.55, losing: 2.20
  },

  _DIFFICULTY_LABELS: {
    peaceful: 'Peaceful', community: 'Community Builder', adventure: 'Adventure Story',
    strive: 'Strive to Survive', blood: 'Blood and Dust', losing: 'Losing is Fun'
  },

  // Map RimWorld save file DifficultyDef defNames to our internal keys
  _DIFFICULTY_DEF_MAP: {
    Peaceful: 'peaceful', Easy: 'community', Medium: 'adventure',
    Rough: 'strive', Hard: 'blood', Extreme: 'losing'
  },

  // Map RimWorld save file StorytellerDef defNames to our internal keys
  _STORYTELLER_DEF_MAP: {
    Cassandra: 'cassandra', Phoebe: 'phoebe', Randy: 'randy'
  },

  // Actual gameplay modifiers per difficulty (from Difficulties.xml)
  _DIFFICULTY_MODIFIERS: {
    peaceful:  { mood: +10, crop: 1.20, mine: 1.20, butcher: 1.0, research: 1.20, disease: 3.0, infection: 0.3, foodPoison: 0.3, tradeLoss: 0 },
    community: { mood: +10, crop: 1.20, mine: 1.20, butcher: 1.0, research: 1.20, disease: 2.5, infection: 0.5, foodPoison: 0.5, tradeLoss: 0 },
    adventure: { mood: +5,  crop: 1.0,  mine: 1.0,  butcher: 1.0, research: 1.0,  disease: 1.5, infection: 0.75, foodPoison: 0.75, tradeLoss: 0 },
    strive:    { mood: 0,   crop: 1.0,  mine: 1.0,  butcher: 1.0, research: 1.0,  disease: 1.0, infection: 1.0, foodPoison: 1.0, tradeLoss: 0 },
    blood:     { mood: -5,  crop: 0.95, mine: 0.95, butcher: 0.9, research: 0.95, disease: 0.95, infection: 1.0, foodPoison: 1.1, tradeLoss: 0.10 },
    losing:    { mood: -10, crop: 0.80, mine: 0.80, butcher: 0.8, research: 0.90, disease: 0.90, infection: 1.1, foodPoison: 1.2, tradeLoss: 0.20 }
  },

  _lerpTable(value, table) {
    // table is array of [x, y] pairs sorted by x
    if (value <= table[0][0]) return table[0][1];
    if (value >= table[table.length - 1][0]) return table[table.length - 1][1];
    for (let i = 0; i < table.length - 1; i++) {
      const [x0, y0] = table[i], [x1, y1] = table[i + 1];
      if (value >= x0 && value <= x1) {
        const t = (value - x0) / (x1 - x0);
        return y0 + t * (y1 - y0);
      }
    }
    return table[table.length - 1][1];
  },

  calculateRaidPoints() {
    const r = this.state.raid;
    // Coerce every field to a finite number - state.raid is not run through the
    // normaliser, so a corrupt/legacy save (or a non-numeric string) must not
    // turn the whole calculation into NaN. `|| 0` does not catch "abc".
    const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
    // Storyteller Wealth: if using total, that IS the storyteller wealth directly
    // If split: Items + Creatures + (Buildings × 0.5)
    const storytellerWealth = r.useWealthTotal
      ? n(r.wealthTotal)
      : n(r.wealthItems) + n(r.wealthCreatures) + (n(r.wealthBuildings) * 0.5);

    // Wealth points: linear interpolation
    const wealthPoints = this._lerpTable(storytellerWealth, [
      [0, 0], [14000, 0], [400000, 2400], [700000, 3600], [1000000, 4200]
    ]);

    // Pawn points per colonist (wealth-scaled)
    const pawnPointsPer = this._lerpTable(storytellerWealth, [
      [0, 15], [10000, 15], [400000, 140], [1000000, 200]
    ]);

    // Effective colonist count
    const effectiveColonists = n(r.colonists) + n(r.slaves) * 0.75 + n(r.children) * 0.5;
    const humanPawnPoints = effectiveColonists * pawnPointsPer;

    // Animals: 8% of combat power (not wealth-scaled)
    const animalPoints = n(r.animals) * 0.08;

    // Mechs: 20-40% of combat power (wealth-scaled)
    const mechPercent = this._lerpTable(storytellerWealth, [
      [0, 0.20], [10000, 0.20], [400000, 0.30], [1000000, 0.40]
    ]);
    const mechPoints = n(r.mechs) * mechPercent;

    const totalPawnPoints = humanPawnPoints + animalPoints + mechPoints;

    // Difficulty (threat scale)
    const threatScale = this._DIFFICULTY_SCALES[r.difficulty] || 1.0;

    // Starting factor (days passed)
    const startingFactor = this._lerpTable(n(r.daysPassed) || 1, [
      [0, 0.7], [10, 0.7], [40, 1.0]
    ]);

    // Adaption factor
    const adaptFactor = this._lerpTable(n(r.adaptDays), [
      [-30, 0.4], [0, 0.8], [30, 1.0], [60, 1.2], [120, 1.6], [180, 2.0]
    ]);

    // Final calculation
    let raidPoints = (wealthPoints + totalPawnPoints) * threatScale * startingFactor * adaptFactor;
    if (!Number.isFinite(raidPoints)) raidPoints = 35;
    raidPoints = Math.max(35, Math.min(10000, raidPoints));

    return {
      raidPoints: Math.round(raidPoints),
      wealthPoints: Math.round(wealthPoints),
      pawnPoints: Math.round(totalPawnPoints),
      threatScale,
      startingFactor: Math.round(startingFactor * 100) / 100,
      adaptFactor: Math.round(adaptFactor * 100) / 100,
      storytellerWealth: Math.round(storytellerWealth)
    };
  },

  getRaidEstimateText() {
    const calc = this.calculateRaidPoints();
    const r = this.state.raid;
    const daysSinceRaid = (r.daysPassed || 1) - (r.lastRaidDay || 0);

    // Storyteller raid windows (approximate)
    let minDays, maxDays;
    const customST = (r.customStorytellers || []).find(s => s.id === r.storyteller);
    if (customST) {
      minDays = customST.minDays;
      maxDays = customST.maxDays;
    } else {
      switch (r.storyteller) {
        case 'randy': minDays = 2; maxDays = 12; break;
        case 'phoebe': minDays = 8; maxDays = 16; break;
        default: minDays = 4; maxDays = 6; break; // cassandra
      }
    }

    let status, urgency;
    const daysUntilSafe = minDays - daysSinceRaid;
    if (daysSinceRaid < minDays) {
      status = `~${daysUntilSafe}d safe`;
      urgency = 'low';
    } else if (daysSinceRaid >= minDays && daysSinceRaid < maxDays) {
      status = 'Due';
      urgency = 'mid';
    } else {
      status = 'Overdue';
      urgency = 'high';
    }

    // Estimate the earliest/latest raid day in in-game calendar terms
    const lastDay = r.lastRaidDay || 0;
    const earliestRaidDay = lastDay + minDays;
    const latestRaidDay = lastDay + maxDays;
    const earliestDate = this._daysToQuadrum(this._raidCalDays(earliestRaidDay));
    const latestDate = this._daysToQuadrum(this._raidCalDays(latestRaidDay));

    // Randy and custom storytellers with randomFactor apply variable multiplier
    const hasRandom = r.storyteller === 'randy' || (customST && customST.randomFactor);
    const rLow = (customST && customST.randomLow) || 0.5;
    const rHigh = (customST && customST.randomHigh) || 1.5;
    const pointsLow  = hasRandom ? Math.round(calc.raidPoints * rLow) : calc.raidPoints;
    const pointsHigh = hasRandom ? Math.round(calc.raidPoints * rHigh) : calc.raidPoints;

    return { status, urgency, points: calc.raidPoints, pointsLow, pointsHigh, hasRandom, randomLow: rLow, randomHigh: rHigh, daysSinceRaid, earliestDate, latestDate, minDays, maxDays };
  },

  updateRaidToolbar() {
    const el = document.getElementById('raidEstimateToolbar');
    if (!el) return;
    const isMin = document.body.classList.contains('is-minimized');
    if (!this.state.settings.showRaidEstimate || !isMin) {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    const est = this.getRaidEstimateText();
    const colors = { low: '#7de85a', mid: '#e8c55a', high: '#f0857a' };
    // Build tooltip with detailed info
    const r = this.state.raid;
    const calc = this.calculateRaidPoints();
    const dateInfo = this._daysToQuadrum(this._raidCalDays(r.daysPassed || 1));
    const ptText = est.hasRandom ? `${est.pointsLow}-${est.pointsHigh}` : `${est.points}`;
    const tooltipLines = [
      `Raid Points: ${ptText}${est.hasRandom ? ' (random ×0.5-1.5)' : ''}`,
      `Status: ${est.status} (${est.daysSinceRaid}d since last raid)`,
      `Storyteller Wealth: ${Math.round(calc.storytellerWealth).toLocaleString()}`,
      `Date: ${dateInfo.quadrum} ${dateInfo.day}, ${dateInfo.year}`,
      `Difficulty: ${this._DIFFICULTY_LABELS[r.difficulty] || r.difficulty}`
    ];
    el.title = tooltipLines.join('\n');
    el.innerHTML = `<span style="color:${colors[est.urgency]}; font-weight:700; font-size:calc(10px * var(--font-scale))">${est.status}</span><span style="color:var(--text3); font-size:calc(9px * var(--font-scale)); margin-left:4px">${ptText}pt</span>`;
  },

  renderRaid() {
    const c = document.getElementById('raidContainer');
    if (!c) return;
    const r = this.state.raid;
    const calc = this.calculateRaidPoints();
    const est = this.getRaidEstimateText();
    const colors = { low: 'var(--ok-txt)', mid: 'var(--p3-txt)', high: 'var(--warn-txt)' };
    const dateInfo = this._daysToQuadrum(this._raidCalDays(r.daysPassed || 1));
    const lastRaidDate = r.lastRaidDay ? this._daysToQuadrum(this._raidCalDays(r.lastRaidDay)) : null;

    // Build storyteller options
    const builtinSTs = [
      { id: 'cassandra', name: 'Cassandra Classic' },
      { id: 'randy', name: 'Randy Random' },
      { id: 'phoebe', name: 'Phoebe Chillax' }
    ];
    const allSTs = [...builtinSTs, ...(r.customStorytellers || [])];
    const stOptions = allSTs.map(s => `<option value="${_escapeHtml(s.id)}" ${r.storyteller === s.id ? 'selected' : ''}>${_escapeHtml(s.name)}</option>`).join('');

    // Get current storyteller's raid window for display
    const customST = (r.customStorytellers || []).find(s => s.id === r.storyteller);
    let raidWindowText;
    if (customST) {
      raidWindowText = `${customST.minDays}-${customST.maxDays} days` + (customST.randomFactor ? ` (random x${customST.randomLow || 0.5}-${customST.randomHigh || 1.5})` : '');
    } else {
      raidWindowText = r.storyteller === 'randy' ? '2-12 days (random x0.5-1.5)' : r.storyteller === 'phoebe' ? '8-16 days' : '4-6 days';
    }

    // Raid window date range
    const earlyStr = `${est.earliestDate.quadrum} ${est.earliestDate.day}`;
    const lateStr = `${est.latestDate.quadrum} ${est.latestDate.day}`;

    // Custom storytellers list HTML
    const customSTList = (r.customStorytellers || []).map(s =>
      `<div style="display:flex; align-items:center; gap:6px; padding:4px 8px; background:var(--surface2); border-radius:4px; font-size:var(--f-xs)">
        <span style="flex:1; color:var(--text)">${_escapeHtml(s.name)}</span>
        <span style="color:var(--text3)">${s.minDays}-${s.maxDays}d</span>
        ${s.randomFactor ? '<span style="color:var(--accent); font-size:calc(9px * var(--font-scale))" title="Random factor ×0.5-1.5">RNG</span>' : ''}
        <button class="btn" style="padding:0 4px; font-size:calc(10px * var(--font-scale)); min-width:0; line-height:1.2" onclick="App.deleteCustomStoryteller('${_escapeHtml(s.id)}')" title="Remove">&times;</button>
      </div>`
    ).join('');

    const howOpen = !!this._raidHowOpen;
    c.innerHTML = `
      <div class="settings-card card-collapsible ${howOpen ? '' : 'card-collapsed'}">
        <div class="section-title" style="cursor:pointer; user-select:none; justify-content:space-between" onclick="App._raidHowOpen = !App._raidHowOpen; App.renderRaid()" title="${howOpen ? 'Collapse' : 'Expand to learn how raid points are calculated'}">
          How It Works
          <button class="icon-btn collapse-btn">${howOpen ? '▲' : '▼'}</button>
        </div>
        <div class="card-collapse-body ${howOpen ? '' : 'collapsed'}" style="font-size:var(--f-xs); color:var(--text3); line-height:1.6">
          <p style="margin:0 0 8px 0"><strong style="color:var(--text2)">Formula:</strong> (Wealth Points + Pawn Points) x Threat Scale x Starting Factor x Adaption Factor</p>
          <p style="margin:0 0 8px 0"><strong style="color:var(--text2)">Storyteller Wealth</strong> = Items + Creatures + (Buildings x 0.5)</p>
          <p style="margin:0 0 8px 0"><strong style="color:var(--text2)">Wealth Points</strong> scale from 0 (at 14k wealth) to 4,200 (at 1M wealth).</p>
          <p style="margin:0 0 8px 0"><strong style="color:var(--text2)">Pawn Points</strong> per colonist scale from 15 (at low wealth) to 200 (at 1M wealth). Slaves x0.75, Children x0.5.</p>
          <p style="margin:0 0 8px 0"><strong style="color:var(--text2)">Starting Factor</strong> is 0.7 for the first 10 days, ramping to 1.0 by day 40.</p>
          <p style="margin:0"><strong style="color:var(--text2)">Adaption Factor</strong> rises if no colonists die/get downed (max 1.47 at 100 AdaptDays). Resets partially on deaths.</p>
        </div>
      </div>

      <div class="settings-card">
        <div class="section-title">Raid Point Estimate</div>
        <div id="raidResultPanel" style="padding:16px; background:var(--surface3); border-radius:var(--radius-md); border:1px solid var(--border-med); margin-bottom:16px">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px">
            <div>
              <div style="font-size:calc(var(--f-base) * 1.4); font-weight:800; color:var(--text)">${est.hasRandom ? est.pointsLow + '-' + est.pointsHigh : calc.raidPoints} <span style="font-size:var(--f-sm); color:var(--text3); font-weight:400">raid points</span></div>
              <div style="font-size:var(--f-xs); color:var(--text3); margin-top:2px">Storyteller Wealth: ${Math.round(calc.storytellerWealth).toLocaleString()}${est.hasRandom ? ' · random x' + est.randomLow + '-' + est.randomHigh : ''}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:var(--f-sm); font-weight:700; color:${colors[est.urgency]}">${est.status}</div>
              <div style="font-size:var(--f-xs); color:var(--text3)">${est.daysSinceRaid}d since last raid</div>
            </div>
          </div>
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; font-size:var(--f-xs)">
            <div style="padding:8px; background:var(--surface2); border-radius:6px; text-align:center">
              <div style="color:var(--text3); margin-bottom:2px">Wealth</div>
              <div style="font-weight:700; color:var(--text)">${calc.wealthPoints}pt</div>
            </div>
            <div style="padding:8px; background:var(--surface2); border-radius:6px; text-align:center">
              <div style="color:var(--text3); margin-bottom:2px">Pawns</div>
              <div style="font-weight:700; color:var(--text)">${calc.pawnPoints}pt</div>
            </div>
            <div style="padding:8px; background:var(--surface2); border-radius:6px; text-align:center">
              <div style="color:var(--text3); margin-bottom:2px">Base</div>
              <div style="font-weight:700; color:var(--text)">${calc.wealthPoints + calc.pawnPoints}pt</div>
            </div>
            <div style="padding:8px; background:var(--surface2); border-radius:6px; text-align:center">
              <div style="color:var(--text3); margin-bottom:2px">Threat</div>
              <div style="font-weight:700; color:var(--text)">x${calc.threatScale}</div>
            </div>
            <div style="padding:8px; background:var(--surface2); border-radius:6px; text-align:center">
              <div style="color:var(--text3); margin-bottom:2px">Starting</div>
              <div style="font-weight:700; color:var(--text)">x${calc.startingFactor}</div>
            </div>
            <div style="padding:8px; background:var(--surface2); border-radius:6px; text-align:center">
              <div style="color:var(--text3); margin-bottom:2px">Adapt</div>
              <div style="font-weight:700; color:var(--text)">x${calc.adaptFactor}</div>
            </div>
          </div>
          <div style="margin-top:12px; padding:10px; background:var(--surface2); border-radius:6px; font-size:var(--f-xs)">
            <div style="display:flex; justify-content:space-between; align-items:center">
              <div style="color:var(--text3)">Raid window</div>
              <div style="color:var(--text); font-weight:600">${earlyStr} - ${lateStr}</div>
            </div>
          </div>
        </div>

        <div style="display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap">
          <button class="btn btn-primary" onclick="App.markRaidOccurred(); App.renderRaid()" style="flex:1; min-width:100px">Raid Occurred</button>
          <button class="btn" onclick="App.advanceRaidDay(); App.renderRaid()" style="flex:0">+1 Day</button>
          <div style="padding:8px 14px; background:var(--surface3); border-radius:var(--radius-sm); border:1px solid var(--border); font-size:var(--f-xs); color:var(--text3); display:flex; align-items:center">
            Last raid: ${lastRaidDate ? `${lastRaidDate.quadrum} ${lastRaidDate.day}, ${lastRaidDate.year}` : '-'}
          </div>
        </div>
      </div>

      <div class="settings-card">
        <div class="section-title">In-Game Date</div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:8px">
          <div>
            <label style="font-size:var(--f-xs); color:var(--text3); font-weight:700; text-transform:uppercase; display:block; margin-bottom:4px">Quadrum</label>
            <select id="raidQuadrum" class="skill-input" style="width:100%; text-align:center; padding:6px" onchange="App.updateRaidDate()">
              ${this._QUADRUMS.map((q, i) => `<option value="${i}" ${dateInfo.quadrumIdx === i ? 'selected' : ''}>${q}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:var(--f-xs); color:var(--text3); font-weight:700; text-transform:uppercase; display:block; margin-bottom:4px">Day (1-15)</label>
            <input type="number" id="raidQuadrumDay" class="skill-input" style="width:100%; text-align:center" min="1" max="15" value="${dateInfo.day}" onchange="App.updateRaidDate()">
          </div>
          <div>
            <label style="font-size:var(--f-xs); color:var(--text3); font-weight:700; text-transform:uppercase; display:block; margin-bottom:4px">Year</label>
            <input type="number" id="raidYear" class="skill-input" style="width:100%; text-align:center" min="5500" value="${dateInfo.year}" onchange="App.updateRaidDate()">
          </div>
        </div>
        <div style="font-size:var(--f-xs); color:var(--text3); margin-bottom:4px">Day ${r.daysPassed || 1} - ${dateInfo.quadrum} ${dateInfo.day}, ${dateInfo.year}</div>
      </div>

      <div class="settings-card">
        <div class="section-title" style="display:flex; align-items:center; justify-content:space-between">
          Colony Wealth
          <label style="font-size:var(--f-xs); color:var(--text3); font-weight:400; display:flex; align-items:center; gap:4px; cursor:pointer">
            <input type="checkbox" ${r.useWealthTotal ? 'checked' : ''} onchange="App.toggleWealthMode(this.checked)"> Use total
          </label>
        </div>
        <div id="raidWealthSplit" style="${r.useWealthTotal ? 'display:none' : ''}">
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:8px">
            <div>
              <label style="font-size:var(--f-xs); color:var(--text3); font-weight:700; text-transform:uppercase; display:block; margin-bottom:4px">Items</label>
              <input type="number" id="raidWealthItems" class="skill-input" style="width:100%; text-align:center" value="${r.wealthItems}" onchange="App.updateRaidField('wealthItems', this.value)">
            </div>
            <div>
              <label style="font-size:var(--f-xs); color:var(--text3); font-weight:700; text-transform:uppercase; display:block; margin-bottom:4px">Buildings</label>
              <input type="number" id="raidWealthBuildings" class="skill-input" style="width:100%; text-align:center" value="${r.wealthBuildings}" onchange="App.updateRaidField('wealthBuildings', this.value)">
            </div>
            <div>
              <label style="font-size:var(--f-xs); color:var(--text3); font-weight:700; text-transform:uppercase; display:block; margin-bottom:4px">Creatures</label>
              <input type="number" id="raidWealthCreatures" class="skill-input" style="width:100%; text-align:center" value="${r.wealthCreatures}" onchange="App.updateRaidField('wealthCreatures', this.value)">
            </div>
          </div>
        </div>
        <div id="raidWealthTotalWrap" style="${r.useWealthTotal ? '' : 'display:none'}">
          <div>
            <label style="font-size:var(--f-xs); color:var(--text3); font-weight:700; text-transform:uppercase; display:block; margin-bottom:4px">Total Wealth</label>
            <input type="number" id="raidWealthTotal" class="skill-input" style="width:100%; text-align:center" value="${r.wealthTotal}" onchange="App.updateRaidField('wealthTotal', this.value)" placeholder="Enter total colony wealth">
          </div>
        </div>
        <div style="font-size:calc(10px * var(--font-scale)); color:var(--text3); margin-top:8px; line-height:1.5; padding:6px 8px; background:var(--surface2); border-radius:4px; border-left:2px solid var(--accent)">
          <strong style="color:var(--text2)">Tip:</strong> Import a save and your <strong style="color:var(--accent)">colony wealth fills in automatically</strong> (read from the save's wealth history, the same numbers as the in-game History tab). You can still edit these by hand. The storyteller uses Items + Creatures + Buildings×0.5.
        </div>
      </div>

      <div class="settings-card">
        <div class="section-title">Colony Population</div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:12px">
          <div>
            <label style="font-size:var(--f-xs); color:var(--text3); font-weight:700; text-transform:uppercase; display:block; margin-bottom:4px">Colonists</label>
            <input type="number" class="skill-input" style="width:100%; text-align:center" value="${r.colonists}" onchange="App.updateRaidField('colonists', this.value)">
          </div>
          <div>
            <label style="font-size:var(--f-xs); color:var(--text3); font-weight:700; text-transform:uppercase; display:block; margin-bottom:4px">Slaves</label>
            <input type="number" class="skill-input" style="width:100%; text-align:center" value="${r.slaves}" onchange="App.updateRaidField('slaves', this.value)">
          </div>
          <div>
            <label style="font-size:var(--f-xs); color:var(--text3); font-weight:700; text-transform:uppercase; display:block; margin-bottom:4px">Children</label>
            <input type="number" class="skill-input" style="width:100%; text-align:center" value="${r.children}" onchange="App.updateRaidField('children', this.value)">
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px">
          <div>
            <label style="font-size:var(--f-xs); color:var(--text3); font-weight:700; text-transform:uppercase; display:block; margin-bottom:4px">Animals (CP)</label>
            <input type="number" class="skill-input" style="width:100%; text-align:center" value="${r.animals}" onchange="App.updateRaidField('animals', this.value)" title="Total Combat Power of attack-trainable animals">
          </div>
          <div>
            <label style="font-size:var(--f-xs); color:var(--text3); font-weight:700; text-transform:uppercase; display:block; margin-bottom:4px">Mechs (CP)</label>
            <input type="number" class="skill-input" style="width:100%; text-align:center" value="${r.mechs}" onchange="App.updateRaidField('mechs', this.value)" title="Total Combat Power of player-controlled mechanoids">
          </div>
          <div>
            <label style="font-size:var(--f-xs); color:var(--text3); font-weight:700; text-transform:uppercase; display:block; margin-bottom:4px">Adapt Days</label>
            <input type="number" class="skill-input" style="width:100%; text-align:center" min="-60" max="100" value="${r.adaptDays}" onchange="App.updateRaidField('adaptDays', this.value)" title="AdaptDays: clamped to -60 to 100 (game bounds)">
          </div>
        </div>
      </div>

      <div class="settings-card">
        <div class="section-title">Difficulty &amp; Storyteller</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px">
          <div>
            <label style="font-size:var(--f-xs); color:var(--text3); font-weight:700; text-transform:uppercase; display:block; margin-bottom:4px">Difficulty</label>
            <select class="skill-input" style="width:100%; text-align:center; padding:6px" onchange="App.updateRaidSelect('difficulty', this.value)">
              ${Object.entries(this._DIFFICULTY_LABELS).map(([k, v]) => `<option value="${k}" ${r.difficulty === k ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:var(--f-xs); color:var(--text3); font-weight:700; text-transform:uppercase; display:block; margin-bottom:4px">Storyteller</label>
            <select class="skill-input" style="width:100%; text-align:center; padding:6px" onchange="App.updateRaidSelect('storyteller', this.value)">
              ${stOptions}
            </select>
          </div>
        </div>
        <div style="font-size:var(--f-xs); color:var(--text3); padding:4px 0; margin-bottom:10px">
          Raid window: ${raidWindowText}
        </div>
        ${this._renderDifficultyModifiers(r.difficulty)}

        <div style="border-top:1px solid var(--border); padding-top:12px">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px">
            <div style="font-size:var(--f-xs); color:var(--text2); font-weight:700; text-transform:uppercase">Custom Storytellers</div>
            <button class="btn" style="font-size:calc(10px * var(--font-scale)); padding:2px 8px" onclick="App.openAddStoryteller()">+ Add</button>
          </div>
          <div id="customSTList" style="display:flex; flex-direction:column; gap:4px">
            ${customSTList || '<div style="font-size:var(--f-xs); color:var(--text3); font-style:italic">No custom storytellers added. Use this to add modded storytellers with custom raid timing.</div>'}
          </div>
        </div>
      </div>

    `;
  },

  _renderDifficultyModifiers(diffKey) {
    const m = this._DIFFICULTY_MODIFIERS[diffKey];
    if (!m) return '';
    // higherGood: true = above 100% is green, below is red. false = inverted (less is better)
    const pct = (val, higherGood) => {
      if (val === 1.0) return '<span style="opacity:0.4">100%</span>';
      const p = Math.round(val * 100);
      const good = higherGood ? val > 1 : val < 1;
      const c = good ? 'var(--ok-txt)' : 'var(--p4-txt)';
      return `<span style="color:${c}">${p}%</span>`;
    };
    const mood = (val) => {
      if (val === 0) return '<span style="opacity:0.4">none</span>';
      const c = val > 0 ? 'var(--ok-txt)' : 'var(--p4-txt)';
      return `<span style="color:${c}">${val > 0 ? '+' : ''}${val}</span>`;
    };
    const tradeLoss = (val) => {
      if (val === 0) return '<span style="opacity:0.4">none</span>';
      return `<span style="color:var(--p4-txt)">${Math.round(val * 100)}%</span>`;
    };
    const row = (label, html) => `<div style="display:flex;justify-content:space-between;padding:1px 0"><span>${label}</span>${html}</div>`;
    return `<div style="font-size:var(--f-xs);color:var(--text3);line-height:1.7;border:1px solid var(--border);border-radius:6px;padding:6px 10px;margin-bottom:12px;background:var(--surface2)">
      <div style="font-size:var(--f-xs);font-weight:700;color:var(--text2);text-transform:uppercase;margin-bottom:2px">Colony Modifiers</div>
      ${row('Mood offset', mood(m.mood))}
      ${row('Crop yield', pct(m.crop, true))}
      ${row('Mine yield', pct(m.mine, true))}
      ${row('Butcher yield', pct(m.butcher, true))}
      ${row('Research speed', pct(m.research, true))}
      ${row('Disease interval', pct(m.disease, true))}
      ${row('Infection chance', pct(m.infection, false))}
      ${row('Food poison chance', pct(m.foodPoison, false))}
      ${row('Trade price loss', tradeLoss(m.tradeLoss))}
    </div>`;
  },

  updateRaidField(field, value) {
    let num = parseFloat(value) || 0;
    // Clamp AdaptDays to real game bounds
    if (field === 'adaptDays') num = Math.max(-60, Math.min(100, num));
    this.state.raid[field] = num;
    this.updateRaidToolbar();
    this._updateRaidDisplay();
    this.triggerAutoSave();
  },

  updateRaidSelect(field, value) {
    this.state.raid[field] = value;
    this.updateRaidToolbar();
    // Storyteller or difficulty change affects more than just the result panel
    if (field === 'storyteller' || field === 'difficulty') {
      this.renderRaid();
    } else {
      this._updateRaidDisplay();
    }
    this.triggerAutoSave();
  },

  _updateRaidDisplay() {
    const el = document.getElementById('raidResultPanel');
    if (!el) return;
    const calc = this.calculateRaidPoints();
    const est = this.getRaidEstimateText();
    const colors = { low: 'var(--ok-txt)', mid: 'var(--p3-txt)', high: 'var(--warn-txt)' };
    const earlyStr = `${est.earliestDate.quadrum} ${est.earliestDate.day}`;
    const lateStr = `${est.latestDate.quadrum} ${est.latestDate.day}`;
    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px">
        <div>
          <div style="font-size:calc(var(--f-base) * 1.4); font-weight:800; color:var(--text)">${est.hasRandom ? est.pointsLow + '-' + est.pointsHigh : calc.raidPoints} <span style="font-size:var(--f-sm); color:var(--text3); font-weight:400">raid points</span></div>
          <div style="font-size:var(--f-xs); color:var(--text3); margin-top:2px">Storyteller Wealth: ${Math.round(calc.storytellerWealth).toLocaleString()}${est.hasRandom ? ' · random x' + est.randomLow + '-' + est.randomHigh : ''}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:var(--f-sm); font-weight:700; color:${colors[est.urgency]}">${est.status}</div>
          <div style="font-size:var(--f-xs); color:var(--text3)">${est.daysSinceRaid}d since last raid</div>
        </div>
      </div>
      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; font-size:var(--f-xs)">
        <div style="padding:8px; background:var(--surface2); border-radius:6px; text-align:center">
          <div style="color:var(--text3); margin-bottom:2px">Wealth</div>
          <div style="font-weight:700; color:var(--text)">${calc.wealthPoints}pt</div>
        </div>
        <div style="padding:8px; background:var(--surface2); border-radius:6px; text-align:center">
          <div style="color:var(--text3); margin-bottom:2px">Pawns</div>
          <div style="font-weight:700; color:var(--text)">${calc.pawnPoints}pt</div>
        </div>
        <div style="padding:8px; background:var(--surface2); border-radius:6px; text-align:center">
          <div style="color:var(--text3); margin-bottom:2px">Base</div>
          <div style="font-weight:700; color:var(--text)">${calc.wealthPoints + calc.pawnPoints}pt</div>
        </div>
        <div style="padding:8px; background:var(--surface2); border-radius:6px; text-align:center">
          <div style="color:var(--text3); margin-bottom:2px">Threat</div>
          <div style="font-weight:700; color:var(--text)">x${calc.threatScale}</div>
        </div>
        <div style="padding:8px; background:var(--surface2); border-radius:6px; text-align:center">
          <div style="color:var(--text3); margin-bottom:2px">Starting</div>
          <div style="font-weight:700; color:var(--text)">x${calc.startingFactor}</div>
        </div>
        <div style="padding:8px; background:var(--surface2); border-radius:6px; text-align:center">
          <div style="color:var(--text3); margin-bottom:2px">Adapt</div>
          <div style="font-weight:700; color:var(--text)">x${calc.adaptFactor}</div>
        </div>
      </div>
      <div style="margin-top:12px; padding:10px; background:var(--surface2); border-radius:6px; font-size:var(--f-xs)">
        <div style="display:flex; justify-content:space-between; align-items:center">
          <div style="color:var(--text3)">Raid window</div>
          <div style="color:var(--text); font-weight:600">${earlyStr} - ${lateStr}</div>
        </div>
      </div>`;
  },

  advanceRaidDay() {
    this.state.raid.daysPassed = (this.state.raid.daysPassed || 0) + 1;
    this.updateRaidToolbar();
    this.triggerAutoSave();
    // Sync the calendar inputs
    const dateInfo = this._daysToQuadrum(this._raidCalDays(this.state.raid.daysPassed));
    const qSel = document.getElementById('raidQuadrum');
    const dInput = document.getElementById('raidQuadrumDay');
    const yInput = document.getElementById('raidYear');
    if (qSel) qSel.value = dateInfo.quadrumIdx;
    if (dInput) dInput.value = dateInfo.day;
    if (yInput) yInput.value = dateInfo.year;
  },

  toggleWealthMode(useTotal) {
    this.state.raid.useWealthTotal = useTotal;
    const splitEl = document.getElementById('raidWealthSplit');
    const totalEl = document.getElementById('raidWealthTotalWrap');
    if (splitEl) splitEl.style.display = useTotal ? 'none' : '';
    if (totalEl) totalEl.style.display = useTotal ? '' : 'none';
    this._updateRaidDisplay();
    this.updateRaidToolbar();
    this.triggerAutoSave();
  },

  updateRaidDate() {
    const qSel = document.getElementById('raidQuadrum');
    const dInput = document.getElementById('raidQuadrumDay');
    const yInput = document.getElementById('raidYear');
    if (!qSel || !dInput || !yInput) return;
    const quadrumIdx = parseInt(qSel.value) || 0;
    const dayInQuadrum = Math.max(1, Math.min(15, parseInt(dInput.value) || 1));
    const year = parseInt(yInput.value) || 5500;
    const totalDays = this._quadrumToDays(quadrumIdx, dayInQuadrum, year);
    // The inputs are a CALENDAR date; convert back to survival-days by removing the founding
    // offset so daysPassed stays survival-based (and raid difficulty is unaffected).
    this.state.raid.daysPassed = Math.max(0, totalDays - ((this.state.raid.dateOffset) || 0));
    // Update the hidden raw daysPassed field if present
    const dpInput = document.getElementById('raidDaysPassed');
    if (dpInput) dpInput.value = totalDays;
    this._updateRaidDisplay();
    this.updateRaidToolbar();
    this.triggerAutoSave();
  },

  openAddStoryteller() {
    // Use existing prompt system to get storyteller details
    this.showPrompt('Storyteller name:').then(name => {
      if (!name || !name.trim()) return;
      this.showPrompt('Min days between raids (e.g. 4):').then(minStr => {
        const minDays = parseInt(minStr);
        if (!minDays || minDays < 1) { this.toast('Invalid min days'); return; }
        this.showPrompt('Max days between raids (e.g. 6):').then(maxStr => {
          const maxDays = parseInt(maxStr);
          if (!maxDays || maxDays < minDays) { this.toast('Max must be >= min'); return; }
          this.showPrompt('Random points factor? (yes/no, like Randy\'s ×0.5-1.5)').then(rngStr => {
            const randomFactor = (rngStr || '').toLowerCase().startsWith('y');
            this.addCustomStoryteller(name.trim(), minDays, maxDays, randomFactor);
          }).catch(() => {});
        }).catch(() => {});
      }).catch(() => {});
    }).catch(() => {});
  },

  addCustomStoryteller(name, minDays, maxDays, randomFactor) {
    if (!this.state.raid.customStorytellers) this.state.raid.customStorytellers = [];
    if (!this._checkCap(this.state.raid.customStorytellers, 'customStorytellers', 'custom storytellers')) return;
    const id = 'custom_' + Date.now();
    this.state.raid.customStorytellers.push({ id, name, minDays, maxDays, randomFactor });
    this.triggerAutoSave();
    this.renderRaid();
    this.toast(`Added storyteller, ${name}`);
  },

  deleteCustomStoryteller(id) {
    if (!this.state.raid.customStorytellers) return;
    this.state.raid.customStorytellers = this.state.raid.customStorytellers.filter(s => s.id !== id);
    // If active storyteller was deleted, fall back to cassandra
    if (this.state.raid.storyteller === id) {
      this.state.raid.storyteller = 'cassandra';
    }
    this.triggerAutoSave();
    this.renderRaid();
    this.toast('Storyteller removed');
  },

  markRaidOccurred() {
    this.state.raid.lastRaidDay = this.state.raid.daysPassed || 1;
    this.updateRaidToolbar();
    this.triggerAutoSave();
    this.toast('Raid marked, timer reset');
  },
});

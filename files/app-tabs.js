/**
 * CONTENT TABS
 * Settings panel, ideology tab, legal disclaimer, help/manual,
 * journal (notes + timeline).
 * Auto-split from app.js - methods are assigned onto the App object.
 */
Object.assign(App, {
  renderSettings() {
    const c = document.getElementById('settingsContainer');
    if (!c) return;
    const s = this.state.settings;
    const isWidget = window.innerWidth <= 550;
    c.innerHTML = `
      <div class="settings-card">
        <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">General<button class="btn btn-sm" onclick="App._resetGeneralDefaults()" style="font-size:var(--f-xs);padding:2px 10px;opacity:0.7">Reset</button></div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Global UI Scale</div>
            <div class="settings-desc">Proportionally scale the entire interface including layout and spacing.</div>
          </div>
          <div style="text-align:right">
            <input type="range" min="0.5" max="2.0" step="0.05" value="${s.uiScale || 1.0}"
              oninput="App.state.settings.uiScale=+this.value; App.applySingleSetting('--ui-scale',this.value); this.nextElementSibling.textContent=Math.round(this.value*100)+'%'"
              onchange="App.applySettings()">
            <div style="font-size:var(--f-xs); color:var(--accent); font-weight:700; margin-top:4px">${Math.round((s.uiScale||1.0)*100)}%</div>
          </div>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Global Font Scale</div>
            <div class="settings-desc">Scales all text across the entire app. Extreme values may cause overlapping or clipped text - use at your own risk!</div>
          </div>
          <div style="text-align:right">
            <input type="range" min="0.5" max="2.0" step="0.05" value="${s.fontScale || 1.0}"
              oninput="App.state.settings.fontScale=+this.value; App.applySingleSetting('--font-scale',this.value); this.nextElementSibling.textContent=Math.round(this.value*100)+'%'"
              onchange="App.applySettings()">
            <div style="font-size:var(--f-xs); color:var(--accent); font-weight:700; margin-top:4px">${Math.round((s.fontScale||1.0)*100)}%</div>
          </div>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Theme</div>
            <div class="settings-desc">Switch between dark and light colour schemes.</div>
          </div>
          <div style="display:flex; gap:8px">
            <button class="btn ${s.theme==='dark'?'btn-primary':''}" onclick="App.state.settings.theme='dark'; App.applyTheme(); App.renderSettings(); App.triggerAutoSave()">Dark</button>
            <button class="btn ${s.theme==='light'?'btn-primary':''}" onclick="App.state.settings.theme='light'; App.applyTheme(); App.renderSettings(); App.triggerAutoSave()">Light</button>
          </div>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Colour-blind friendly palette</div>
            <div class="settings-desc">Use an app-wide blue-orange accessible palette. Priority numbers, schedule markers, relation patterns, icons, and text keep meaning from relying on colour alone.</div>
          </div>
          <input type="checkbox" ${s.colourBlindMode?'checked':''} onchange="App.setColourBlindMode(this.checked)" aria-label="Colour-blind friendly palette">
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Dyslexia-friendly font</div>
            <div class="settings-desc">Use <a href="https://opendyslexic.org/" onclick="window.overlay.openExternal('https://opendyslexic.org/'); return false;" style="color:var(--accent); text-decoration:none; font-weight:700" aria-label="Visit the OpenDyslexic website">OpenDyslexic</a>, designed by Abbie Gonzalez, across regular, bold, italic, and bold-italic text. This typography option works independently with either theme and either colour palette.</div>
          </div>
          <input type="checkbox" ${s.dyslexiaFontMode?'checked':''} onchange="App.setDyslexiaFontMode(this.checked)" aria-label="Dyslexia-friendly font">
        </div>
      </div>

      <div class="settings-card">
        <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">Typography<button class="btn btn-sm" onclick="App._resetTypographyDefaults()" style="font-size:var(--f-xs);padding:2px 10px;opacity:0.7">Reset</button></div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Table Font Size</div>
            <div class="settings-desc">Text size for pawn names and data in the priority table.</div>
          </div>
          <div style="text-align:right">
            <input type="range" min="10" max="20" value="${s.tableFontSize}" oninput="App.state.settings.tableFontSize=+this.value; App.applySingleSetting('--table-font-size-base',this.value,'px'); this.nextElementSibling.textContent=Math.round(this.value/14*100)+'%'">
            <div style="font-size:var(--f-xs); color:var(--accent); font-weight:700; margin-top:4px">${Math.round((s.tableFontSize||14)/14*100)}%</div>
          </div>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Job Font Size</div>
            <div class="settings-desc">Text size for job column headers in the priority table.</div>
          </div>
          <div style="text-align:right">
            <input type="range" min="8" max="18" value="${s.jobFontSize}" oninput="App.state.settings.jobFontSize=+this.value; App.applySingleSetting('--job-font-size-base',this.value,'px'); this.nextElementSibling.textContent=Math.round(this.value/12*100)+'%'">
            <div style="font-size:var(--f-xs); color:var(--accent); font-weight:700; margin-top:4px">${Math.round((s.jobFontSize||12)/12*100)}%</div>
          </div>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Priority Cell Size</div>
            <div class="settings-desc">Width and height of each clickable priority box.</div>
          </div>
          <div style="text-align:right">
            <input type="range" min="18" max="48" value="${s.prioSize}" oninput="App.state.settings.prioSize=+this.value; App.applySingleSetting('--prio-size-base',this.value,'px'); this.nextElementSibling.textContent=Math.round(this.value/28*100)+'%'">
            <div style="font-size:var(--f-xs); color:var(--accent); font-weight:700; margin-top:4px">${Math.round((s.prioSize||28)/28*100)}%</div>
          </div>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Pawn Card Font Size</div>
            <div class="settings-desc">Base text size for skills, traits, and labels inside pawn cards.</div>
          </div>
          <div style="text-align:right">
            <input type="range" min="10" max="18" value="${s.pawnCardFontSize}" oninput="App.state.settings.pawnCardFontSize=+this.value; App.applySingleSetting('--pawn-font-size-base',this.value,'px'); this.nextElementSibling.textContent=Math.round(this.value/13*100)+'%'">
            <div style="font-size:var(--f-xs); color:var(--accent); font-weight:700; margin-top:4px">${Math.round((s.pawnCardFontSize||13)/13*100)}%</div>
          </div>
        </div>
      </div>

      <div class="settings-card">
        <div class="section-title">Behaviour</div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Startup window mode</div>
            <div class="settings-desc">Which mode the app opens in: Window (normal, default), Fullscreen (fills the screen), or Widget (compact sidebar).</div>
          </div>
          <select class="skill-input" style="width:auto; min-width:120px" onchange="App.state.settings.startupMode=this.value; App.triggerAutoSave()">
            <option value="window" ${(s.startupMode||'window')==='window'?'selected':''}>Window</option>
            <option value="fullscreen" ${s.startupMode==='fullscreen'?'selected':''}>Fullscreen</option>
            <option value="widget" ${s.startupMode==='widget'?'selected':''}>Widget</option>
          </select>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Minimise to system tray</div>
            <div class="settings-desc">When on (default), the minimise button hides the app to the system tray. Turn off to minimise to the taskbar normally instead.</div>
          </div>
          <input type="checkbox" ${s.minimizeToTray!==false?'checked':''} onchange="App.state.settings.minimizeToTray=this.checked; App.triggerAutoSave()">
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Pre-load mod data in the background</div>
            <div class="settings-desc">When on (default), RimJobs quietly warms your modded traits, genes, health conditions, ideology roles and equipment after launch and after a save import, so the Armoury, Comparison and Pawn Manager are ready instantly. It is cache-backed, so only changed files are re-read. Needs your RimWorld path set.</div>
          </div>
          <input type="checkbox" ${s.autoScanMods!==false?'checked':''} onchange="App.state.settings.autoScanMods=this.checked; App.triggerAutoSave()">
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Show tooltips</div>
            <div class="settings-desc">Show hover tooltips on buttons and controls. Turn off to disable them everywhere.</div>
          </div>
          <input type="checkbox" ${s.tooltips!==false?'checked':''} onchange="App.state.settings.tooltips=this.checked; App.triggerAutoSave()">
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Confirm pawn deletion</div>
            <div class="settings-desc">Show a confirmation dialog before removing a pawn.</div>
          </div>
          <input type="checkbox" ${s.confirmPawnDel?'checked':''} onchange="App.state.settings.confirmPawnDel=this.checked">
        </div>
        <div class="settings-row" style="border-bottom:none; padding-bottom:0">
          <div>
            <div class="settings-label">Remove item limits</div>
            <div class="settings-desc" style="color:${s.removeLimits ? '#f5a623' : 'var(--text3)'}">
              ${s.removeLimits
                ? '! Limits disabled -large saves may cause slow performance and bigger files.'
                : `Default caps: ${this.CAPS.pawns} pawns, ${this.CAPS.weapons} weapons, ${this.CAPS.notes} notes, etc. Increase if needed.`}
            </div>
          </div>
          <input type="checkbox" ${s.removeLimits?'checked':''} onchange="App.state.settings.removeLimits=this.checked; App.renderSettings(); App.triggerAutoSave()">
        </div>
      </div>

      <div class="settings-card">
        <div class="section-title">Priorities Input</div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Left-click raises priority</div>
            <div class="settings-desc">Left-click increases priority towards 1, right-click decreases.</div>
          </div>
          <input type="checkbox" ${s.clickDirection==='left-to-high'?'checked':''} onchange="App.state.settings.clickDirection=this.checked?'left-to-high':'left-to-low'">
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Invert mouse wheel</div>
            <div class="settings-desc">Reverse scroll direction when adjusting priorities with the wheel.</div>
          </div>
          <input type="checkbox" ${s.invertWheel?'checked':''} onchange="App.state.settings.invertWheel=this.checked">
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Disable scroll wheel on priorities</div>
            <div class="settings-desc">Prevent mouse wheel from changing priority values. Click only.</div>
          </div>
          <input type="checkbox" ${s.disableScrollWheel?'checked':''} onchange="App.state.settings.disableScrollWheel=this.checked">
        </div>
        <div class="settings-row" style="border-bottom:none; padding-bottom:0">
          <div>
            <div class="settings-label">Priority wrapping</div>
            <div class="settings-desc">Clicking past priority 1 wraps back to None instead of stopping.</div>
          </div>
          <input type="checkbox" ${s.priorityWrap?'checked':''} onchange="App.state.settings.priorityWrap=this.checked">
        </div>
      </div>

      <div class="settings-card">
        <div class="section-title">Visual</div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Row highlighting</div>
            <div class="settings-desc">Highlight the full row when hovering a pawn in the priority table.</div>
          </div>
          <input type="checkbox" ${s.rowHighlighting?'checked':''} onchange="App.state.settings.rowHighlighting=this.checked; App.renderTable()">
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Compact sidebar</div>
            <div class="settings-desc">Collapse pawn cards to show only names and work speed.</div>
          </div>
          <input type="checkbox" ${s.compactSidebar?'checked':''} onchange="App.state.settings.compactSidebar=this.checked; App.renderSidebar()">
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Show resize label</div>
            <div class="settings-desc">Show a pixel-width label when dragging the sidebar or column resizer.</div>
          </div>
          <input type="checkbox" ${s.showResizeLabel?'checked':''} onchange="App.state.settings.showResizeLabel=this.checked">
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Vertical job titles</div>
            <div class="settings-desc">Rotate job column headers vertically to save horizontal space.</div>
          </div>
          <input type="checkbox" ${s.verticalTitles?'checked':''} onchange="App.state.settings.verticalTitles=this.checked; App.renderTable()">
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Show biome patterns</div>
            <div class="settings-desc">Render terrain textures on the blueprint canvas background.</div>
          </div>
          <input type="checkbox" ${s.showBiomePatterns?'checked':''} onchange="App.state.settings.showBiomePatterns=this.checked; if(App.state.activeTab==='blue') App.renderBlueprint()">
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Raid estimate in toolbar</div>
            <div class="settings-desc">Show raid timing and point estimate when the window is collapsed.</div>
          </div>
          <input type="checkbox" ${s.showRaidEstimate?'checked':''} onchange="App.state.settings.showRaidEstimate=this.checked; App.updateRaidToolbar()">
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Developer console</div>
            <div class="settings-desc">Show an in-app console drawer that captures errors and warnings for debugging.</div>
          </div>
          <input type="checkbox" ${s.showConsole?'checked':''} onchange="App.state.settings.showConsole=this.checked; var d=document.getElementById('consoleDrawer'); if(d){if(this.checked){d.style.display='flex'; App._renderConsoleDrawer();}else{d.style.display='none';}} App._updateConsoleBadge(); App.triggerAutoSave()">
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Always on top</div>
            <div class="settings-desc">Keep the window above other apps (including RimWorld). Turn off to let other windows cover it.</div>
          </div>
          <input type="checkbox" ${s.alwaysOnTop !== false ? 'checked' : ''} onchange="App.setAlwaysOnTop(this.checked)">
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Lock window transparency</div>
            <div class="settings-desc">Lock the title-bar opacity slider at its current ${Math.round((s.windowOpacity || 1) * 100)}% level. The chosen level and lock are restored when RimJobs starts.</div>
          </div>
          <input type="checkbox" ${s.transparencyLocked ? 'checked' : ''} onchange="App.setTransparencyLocked(this.checked)" aria-label="Lock window transparency">
        </div>
      </div>

      <div class="settings-card">
        <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">Window Size<button class="btn btn-sm" onclick="App._resetWindowSizeDefaults()" style="font-size:var(--f-xs);padding:2px 10px;opacity:0.7">Reset</button></div>
        <div class="settings-desc" style="margin-bottom:10px">Customise the default dimensions for widget and full window modes.</div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Widget mode</div>
            <div class="settings-desc">Compact overlay size. Min 340 x 400.</div>
          </div>
          <div style="display:flex; gap:6px; align-items:center">
            <input type="number" min="340" max="3000" step="10" value="${s.widgetWidth || 420}" onchange="App.state.settings.widgetWidth=Math.max(340,+this.value); App._syncWindowSizes(); App.triggerAutoSave()" style="width:60px; background:var(--surface3); border:1px solid var(--border-med); color:var(--text); text-align:center; border-radius:var(--radius-sm)">
            <span style="color:var(--text3); font-size:var(--f-xs)">x</span>
            <input type="number" min="400" max="3000" step="10" value="${s.widgetHeight || 700}" onchange="App.state.settings.widgetHeight=Math.max(400,+this.value); App._syncWindowSizes(); App.triggerAutoSave()" style="width:60px; background:var(--surface3); border:1px solid var(--border-med); color:var(--text); text-align:center; border-radius:var(--radius-sm)">
            <span style="color:var(--text3); font-size:var(--f-xs)">px</span>
          </div>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Full mode</div>
            <div class="settings-desc">Expanded window size. Min 340 x 400.</div>
          </div>
          <div style="display:flex; gap:6px; align-items:center">
            <input type="number" min="340" max="3000" step="10" value="${s.fullWidth || 1200}" onchange="App.state.settings.fullWidth=Math.max(340,+this.value); App._syncWindowSizes(); App.triggerAutoSave()" style="width:60px; background:var(--surface3); border:1px solid var(--border-med); color:var(--text); text-align:center; border-radius:var(--radius-sm)">
            <span style="color:var(--text3); font-size:var(--f-xs)">x</span>
            <input type="number" min="400" max="3000" step="10" value="${s.fullHeight || 850}" onchange="App.state.settings.fullHeight=Math.max(400,+this.value); App._syncWindowSizes(); App.triggerAutoSave()" style="width:60px; background:var(--surface3); border:1px solid var(--border-med); color:var(--text); text-align:center; border-radius:var(--radius-sm)">
            <span style="color:var(--text3); font-size:var(--f-xs)">px</span>
          </div>
        </div>
        <div class="settings-row" style="border-bottom:none; padding-bottom:0">
          <div>
            <div class="settings-label">Use current window size</div>
            <div class="settings-desc">Save the current window dimensions as the default for the active mode.</div>
          </div>
          <button class="btn btn-sm" onclick="App._captureCurrentWindowSize()" style="font-size:var(--f-xs); padding:3px 12px">Capture</button>
        </div>
      </div>

      <div class="settings-card">
        <div class="section-title">Tab Visibility</div>
        <div class="settings-desc" style="margin-bottom:10px">Hide tabs you don't need. Settings, Manual, and Legal cannot be hidden.</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px">
          ${[
            ['work', 'Priorities'],
            ['sched', 'Shift Planner'],
            ['armoury', 'Armoury'],
            ['apparel', 'Apparel'],
            ['blue', 'Blueprints'],
            ['notes', 'Journal'],
            ['dash', 'Skills Web'],
            ['ideo', 'Ideology'],
            ['relations', 'Relations'],
            ['raid', 'Raids']
          ].map(([id, label]) => `
            <div class="settings-row" style="padding:6px 0; border:none">
              <div><div class="settings-label" style="font-size:var(--f-xs)">${label}</div></div>
              <input type="checkbox" ${!(s.hiddenTabs||[]).includes(id)?'checked':''} onchange="App.toggleTabVisibility('${id}')">
            </div>
          `).join('')}
        </div>
      </div>

      <div class="settings-card">
        <div class="section-title">Ideology Precepts</div>
        ${DEFAULT_PRECEPTS.map(p => `
          <div class="settings-row">
            <div>
              <div class="settings-label">${p.label}</div>
              <div class="settings-desc">${p.description}</div>
            </div>
            <input type="number" step="0.1" value="${this.state.precepts[p.id]}" onchange="App.updatePrecept('${p.id}', this.value)" style="width:50px; background:var(--surface3); border:1px solid var(--border-med); color:var(--text); text-align:center; border-radius:var(--radius-sm)">
          </div>
        `).join('')}
      </div>

      <div class="settings-card">
        <div class="section-title">Mod Awareness</div>
        <div class="settings-desc" style="margin-bottom:8px">Custom content (xenotypes, traits, weapons, apparel, buildings, materials, biomes) can be tagged with a mod source name.</div>
        <div class="settings-row" style="border-bottom:none; padding-bottom:0">
          <div>
            <div class="settings-label">Hide modded content</div>
            <div class="settings-desc">Filter out all items tagged with a mod source from lists and dropdowns.</div>
          </div>
          <input type="checkbox" ${s.hideModdedContent?'checked':''} onchange="App.state.settings.hideModdedContent=this.checked; App.renderAll(); App.triggerAutoSave()">
        </div>
        ${this._getUniqueModSources().length > 0 ? `
        <div style="margin-top:10px">
          <div class="settings-label" style="margin-bottom:6px; display:flex; align-items:center; gap:6px; cursor:pointer" onclick="App._modsListExpanded=!App._modsListExpanded; App.renderSettings()">Active mods (${this._getUniqueModSources().length}) <span style="font-size:var(--f-xs); opacity:0.6">${this._modsListExpanded ? '▲' : '▼'}</span></div>
          ${this._modsListExpanded ? `<div style="display:flex; flex-wrap:wrap; gap:6px">
            ${this._getUniqueModSources().map(m => `<span class="mod-badge">${_escapeHtml(m)}</span>`).join('')}
          </div>` : ''}
        </div>` : ''}
      </div>

      <div class="settings-card">
        <div class="section-title">Modded Jobs</div>
        <div class="settings-desc" style="margin-bottom:8px">Add custom work types from mods that aren't in the base game.</div>
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:10px">
          ${this.state.customJobs.map(j => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--surface2); padding:6px 10px; border-radius:var(--radius-sm); border:1px solid var(--border-med)">
              <div style="font-size:var(--f-sm); font-weight:700">${_escapeHtml(j.name)}${_modBadge(j)} <span style="font-size:var(--f-xs); color:var(--text3); font-weight:400">(${_escapeHtml(j.skill || 'none')})</span></div>
              <button class="pawn-del" onclick="App.deleteCustomJob('${j.id}')">&times;</button>
            </div>
          `).join('')}
        </div>
        <button class="btn btn-sm btn-primary" onclick="App.addCustomJob()">+ Add Modded Job</button>
      </div>

      <div class="settings-card">
        <div class="section-title">Data Management</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px">
          <button class="btn" onclick="App.saveData(); App.toast('\u{1F4BE} Saved!')">\u{1F4BE} Save Local</button>
          <button class="btn" onclick="App.exportJSON()">Export JSON</button>
          <button class="btn" onclick="App.importJSON()">Import JSON</button>
          <button class="btn" onclick="App.clearCaches()">Clear Cache</button>
          <button class="btn btn-danger" style="grid-column: 1 / -1" onclick="App.showConfirm('Reset ALL data?','Reset','This will permanently wipe all pawns, blueprints, schedules, weapons, apparel, and settings.').then(()=>{localStorage.removeItem('rimjobs');location.reload()}).catch(()=>{})">Reset All</button>
        </div>
        <div class="settings-desc" style="margin-top:8px">Save Local stores your data inside the app. Export JSON saves a file to your computer. Clear Cache flushes all internal render caches and forces a full rebuild.</div>
        <div class="settings-row" style="margin-top:12px">
          <div>
            <div class="settings-label">Save Location</div>
            <div class="settings-desc">${s.savePath
              ? `Saving to: <span style="color:var(--accent);word-break:break-all">${_escapeHtml(s.savePath)}</span>`
              : 'Using browser local storage (limited ~10MB). Set a file path for unlimited saves.'}</div>
          </div>
          <div style="display:flex; gap:6px">
            <button class="btn btn-sm btn-primary" onclick="App.pickSavePath()">${s.savePath ? 'Change' : 'Set Path'}</button>
            ${s.savePath ? `<button class="btn btn-sm" onclick="App.clearSavePath()">Clear</button>` : ''}
          </div>
        </div>
        <div class="settings-row" style="margin-top:12px; border-bottom:none; padding-bottom:0">
          <div>
            <div class="settings-label">Auto-save</div>
            <div class="settings-desc">Automatically save after 1.5 seconds of inactivity and on window close.</div>
          </div>
          <input type="checkbox" ${s.autoSaveEnabled?'checked':''} onchange="App.state.settings.autoSaveEnabled=this.checked">
        </div>
      </div>

      <div class="settings-card">
        <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">Performance Diagnostics
          <div style="display:flex; gap:6px; align-items:center">
            ${Perf.enabled
              ? `<span style="font-size:var(--f-xs); color:var(--accent); font-weight:700">Active</span>`
              : ''}
            <button class="btn btn-sm" onclick="App._perfToggle()" style="font-size:var(--f-xs);padding:2px 10px">${Perf.enabled ? 'Disable' : 'Enable'}</button>
          </div>
        </div>
        <div class="settings-desc" style="margin-bottom:10px">Measure render times, context builds, scheduler execution, and memory during stress testing. Zero overhead when disabled.</div>
        ${Perf.enabled ? `
        <div style="display:flex; gap:8px; margin-bottom:12px">
          <button class="btn btn-sm ${Perf._capturing ? 'btn-danger' : 'btn-primary'}" onclick="App._perfCaptureToggle()" style="font-size:var(--f-xs); padding:4px 14px">${Perf._capturing ? 'Stop Capture' : 'Start Capture'}</button>
          <button class="btn btn-sm" onclick="App._perfExportReport()" style="font-size:var(--f-xs); padding:4px 14px" ${!Perf._samples || Perf._samples.size === 0 ? 'disabled' : ''}>Export Report</button>
          <button class="btn btn-sm" onclick="App._perfCopyReport()" style="font-size:var(--f-xs); padding:4px 14px" ${!Perf._samples || Perf._samples.size === 0 ? 'disabled' : ''}>Copy Summary</button>
        </div>
        <div id="perfLivePanel" style="font-family:monospace; font-size:calc(11px * var(--font-scale)); background:var(--surface); border:1px solid var(--border-med); border-radius:var(--radius-sm); padding:10px 14px; max-height:300px; overflow-y:auto; white-space:pre; color:var(--text2); line-height:1.6">${_escapeHtml(Perf.formatReport(Perf.buildReport()))}</div>
        ` : ''}
      </div>

      <div style="margin-top:${isWidget ? '12px' : 'var(--gap-xl)'}; padding-top:${isWidget ? '8px' : 'var(--gap-lg)'}; border-top:1px solid var(--border); text-align:center; grid-column: 1 / -1">
        <div id="appVersionDisplay" style="font-size:${isWidget ? '9px' : 'calc(var(--f-xs) * 0.85)'}; color:var(--text3); opacity:0.6">v${this._appVersion || '1.3.37'}</div>
      </div>
    `;
  },

  // -- IDEOLOGY TAB --
  renderIdeology() {
    const c = document.getElementById('view-ideo');
    if (!c) return;
    const ideo = this.state.ideology || { memes: [], precepts: {}, name: '' };
    if (!ideo.memes) ideo.memes = [];
    if (!ideo.precepts) ideo.precepts = {};
    const isWidget = window.innerWidth <= 550;
    if (!this._ideoSectionOpen || typeof this._ideoSectionOpen !== 'object') {
      this._ideoSectionOpen = { memes: true, precepts: true, rituals: true };
    }
    const sectionOpen = section => this._ideoSectionOpen[section] !== false;
    const memesOpen = sectionOpen('memes');
    const preceptsOpen = sectionOpen('precepts');
    const ritualsOpen = sectionOpen('rituals');

    // Calculate aggregate effects from selected memes
    const allMemes = this._allMemes();
    const memeEffects = { mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 0, animalSkill: 0, researchSpeed: 0, miningSpeed: 0, plantSpeed: 0, painFactor: 0, immunityGain: 0, psychicSensitivity: 0, convertSpeed: 0 };
    ideo.memes.forEach(mId => {
      const m = allMemes.find(x => x.id === mId);
      if (m && m.effects) Object.entries(m.effects).forEach(([k, v]) => { if (memeEffects[k] !== undefined) memeEffects[k] += v; });
    });

    // Controls and totals share the engine's validated effective choices.
    const preceptState = this.getIdeoPreceptState();

    // Combined totals
    const impact = this.getIdeoEffects();
    const totalMood = impact.mood;
    const totalWorkSpeed = impact.workSpeed;
    const totalCombat = impact.combatSkill;
    const totalSocial = impact.socialSkill;
    const totalResearch = impact.researchSpeed;

    // Check meme conflicts
    const conflictSet = new Set();
    ideo.memes.forEach(mId => {
      const m = allMemes.find(x => x.id === mId);
      if (m && m.conflicts) m.conflicts.forEach(c => conflictSet.add(c));
    });

    const formatMod = (v, suffix = '') => v > 0 ? `<span style="color:var(--ok-txt)">+${typeof v === 'number' && v < 1 && v > -1 ? (v*100).toFixed(0)+'%' : v}${suffix}</span>` : v < 0 ? `<span style="color:var(--p4-txt)">${typeof v === 'number' && v < 1 && v > -1 ? (v*100).toFixed(0)+'%' : v}${suffix}</span>` : `<span style="color:var(--text3)">0${suffix}</span>`;

    // Determine available specialists from selected memes
    const availableSpecs = (typeof IDEO_SPECIALISTS !== 'undefined' ? IDEO_SPECIALISTS : []).filter(s =>
      s.memes.some(m => ideo.memes.includes(m))
    );

    // Rituals from ideo state
    const ideoRituals = ideo.rituals || [];

    c.innerHTML = `
      <div style="width:100%">
        <div class="view-header">
          <div class="view-header-content">
            <h2 class="view-title">Ideology Planner</h2>
            <div class="view-subtitle" style="letter-spacing:.06em;text-transform:uppercase">${ideo.memes.length} meme${ideo.memes.length!==1?'s':''} selected</div>
          </div>
          <div class="view-header-actions" style="display:flex; gap:8px; align-items:center; ${isWidget ? 'flex-wrap:wrap; width:100%' : ''}">
            <select class="skill-input" style="${isWidget ? 'flex:1' : 'width:90px'}; font-size:var(--f-xs)" onchange="App.state.ideology.type=this.value; App.triggerAutoSave(); App.renderIdeology()" title="Fixed: all memes locked at start. Fluid: start with 1, add more via dev points.">
              ${(typeof IDEO_TYPES !== 'undefined' ? IDEO_TYPES : [{id:'fixed',label:'Fixed'},{id:'fluid',label:'Fluid'}]).map(t => `<option value="${t.id}" ${(ideo.type||'fixed')===t.id?'selected':''}>${t.label}</option>`).join('')}
            </select>
            <input type="text" class="skill-input" placeholder="Name your ideology…" value="${_escapeHtml(ideo.name || '')}"
              oninput="App.state.ideology.name=this.value; App.triggerAutoSave()"
              style="${isWidget ? 'flex:1 1 100%; order:-1' : 'width:210px'}; text-align:left; font-size:var(--f-sm); font-weight:800; letter-spacing:0.02em; color:var(--accent); background:linear-gradient(180deg, var(--surface3), var(--surface2)); border:1px solid var(--border-med); border-left:3px solid var(--accent); border-radius:var(--radius-sm); padding:6px 12px">
            ${(() => {
              const pi = this.state.savedPlayerIdeo;
              if (!pi || !pi.name) return '';
              return `<button class="btn btn-sm" onclick="App.loadPlayerIdeoFromSave()"
                title="Load your colony's own ideology from the imported save into the planner"
                style="font-size:var(--f-xs); padding:4px 10px; border-left:3px solid var(--accent); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">&#9883; ${_escapeHtml(pi.name)}</button>`;
            })()}
            ${(() => {
              const count = (this.state.savedIdeologies || []).length;
              const on = count > 0;
              return `<button class="btn btn-sm" onclick="${on ? 'App.showSaveIdeologiesModal()' : ''}" ${on ? '' : 'disabled'}
                title="${on ? 'Browse every ideology in the imported save' : 'Import a save game to browse its ideologies'}"
                style="font-size:var(--f-xs); padding:4px 10px; ${on ? '' : 'opacity:0.45; cursor:not-allowed'}">Save File Ideologies${on ? ` (${count})` : ''}</button>`;
            })()}
            <button class="btn btn-sm" onclick="App.scanIdeologyMods()" title="Scan your RimWorld install and mod folder for ideology role definitions, modded memes and rituals. Cache-backed, so repeat scans are fast." style="font-size:var(--f-xs); padding:4px 10px">Scan Ideology Mods</button>
            <button class="btn btn-sm btn-danger" onclick="App.resetIdeology()" title="Reset all ideology selections" style="font-size:var(--f-xs); padding:4px 10px">Reset</button>
          </div>
        </div>

        ${this._importNotice('ideology')}

        ${(ideo.type === 'fluid') ? `<div style="background:var(--surface2); border-left:3px solid var(--accent); padding:8px 12px; border-radius:6px; margin-bottom:var(--gap-lg); font-size:var(--f-xs); color:var(--text2)">
          <strong>Fluid Ideology:</strong> Start with 1 meme. Earn development points from conversions and rituals (10 pts for first reform, +2 each after). Reform to add/remove memes and change precepts during play.
        </div>` : ''}

        <div class="settings-card" style="margin-bottom:var(--gap-lg)">
          <div class="section-title section-title--sm">Narrative <span style="font-size:var(--f-xs); color:var(--text3); font-weight:400">(your ideology's story - lore, origins, tone)</span></div>
          <textarea placeholder="Describe your ideology - where it came from, what it believes, the story you want to tell…"
            oninput="App.state.ideology.narrative=this.value; App.triggerAutoSave()"
            style="width:100%; box-sizing:border-box; min-height:72px; max-height:260px; resize:vertical; background:var(--surface3); color:var(--text); border:1px solid var(--border-med); border-radius:var(--radius-sm); padding:10px 12px; font-size:var(--f-sm); font-family:inherit; line-height:1.55">${_escapeHtml(_unityRichToPlainText(ideo.narrative || ''))}</textarea>
        </div>

        <div class="ideology-memes-impact-grid ${memesOpen ? '' : 'memes-collapsed'}"
          style="display:grid; grid-template-columns:${isWidget || !memesOpen ? '1fr' : '1fr 1fr'}; gap:var(--gap-lg); margin-bottom:var(--gap-lg)">
          <!-- MEMES -->
          <div class="settings-card ideology-section-card ${memesOpen ? '' : 'card-collapsed'}">
            <div class="section-title section-title--sm ideology-section-title">
              <span>Memes <span style="font-size:var(--f-xs); color:var(--text3); font-weight:400">(1 structure + up to 3 memes${ideo.type === 'fluid' ? ', fluid starts with 1 meme' : ''})</span></span>
              <button class="icon-btn collapse-btn ideology-collapse-btn" type="button"
                data-ideo-collapse="memes" aria-expanded="${memesOpen}" aria-controls="ideo-memes-body"
                aria-label="${memesOpen ? 'Collapse' : 'Expand'} memes" title="${memesOpen ? 'Collapse memes' : 'Expand memes'}">${memesOpen ? '&#9650;' : '&#9660;'}</button>
            </div>
            <div id="ideo-memes-body" class="card-collapse-body ${memesOpen ? '' : 'collapsed'}">
            ${(() => {
              const all = this._allMemes();
              const isStruct = (m) => m.category === 'Structure';
              const normalCount = ideo.memes.filter(mId => { const m = all.find(x => x.id === mId); return m && !isStruct(m); }).length;
              const structures = all.filter(isStruct);
              const normals = all.filter(m => !isStruct(m));
              const btn = (m) => {
                const active = ideo.memes.includes(m.id);
                const conflicted = !active && conflictSet.has(m.id);
                // Structure memes swap rather than stack, so they are never count-capped.
                const disabled = !active && !isStruct(m) && normalCount >= 3;
                return `<button class="btn btn-sm ${active ? 'btn-accent' : ''}"
                  style="font-size:${isWidget ? '10px' : 'var(--f-xs)'}; padding:4px 8px; border-left:3px solid ${_safeColor(m.color)}; opacity:${conflicted || disabled ? '0.4' : '1'}; ${conflicted ? 'text-decoration:line-through' : ''}"
                  data-ideo-meme="${_escapeHtml(m.id)}" aria-pressed="${active}"
                  title="${_escapeHtml((m.description || '') + (m.impact ? '\nImpact: '+m.impact : '') + (m.dlc ? '\nRequires: '+m.dlc+' DLC' : '') + (conflicted ? '\n! CONFLICTS with selected meme' : '') + (m.specialists && m.specialists.length ? '\nUnlocks: '+m.specialists.join(', ')+' specialist' : '') + (m.agreeingTraits && m.agreeingTraits.length ? '\nAgreeing traits: '+m.agreeingTraits.join(', ') : '') + (m.conflictingTraits && m.conflictingTraits.length ? '\nConflicting traits: '+m.conflictingTraits.join(', ') : ''))}"
                  ${conflicted || disabled ? 'disabled' : ''}>${_escapeHtml(m.label)}${m.dlc ? ' <span style="font-size:calc(9px * var(--font-scale)); opacity:0.6">'+m.dlc+'</span>' : ''}${m.modSource ? ' <span style="font-size:calc(9px * var(--font-scale)); opacity:0.5">Mod</span>' : ''}</button>`;
              };
              return `
                <div style="font-size:calc(10px * var(--font-scale)); color:var(--text3); text-transform:uppercase; font-weight:700; letter-spacing:0.05em; margin-bottom:5px">Structure, pick one</div>
                <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px">${structures.map(btn).join('')}</div>
                <div style="font-size:calc(10px * var(--font-scale)); color:var(--text3); text-transform:uppercase; font-weight:700; letter-spacing:0.05em; margin-bottom:5px">Memes, ${normalCount}/3</div>
                <div style="display:flex; flex-wrap:wrap; gap:6px">${normals.map(btn).join('')}</div>`;
            })()}
            ${ideo.memes.length > 0 ? `
              <div style="margin-top:12px; padding-top:12px; border-top:1px solid var(--border)">
                <div style="font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; font-weight:700; margin-bottom:6px">Meme Effects</div>
                <div style="display:flex; flex-wrap:wrap; gap:8px; font-size:var(--f-xs)">
                  ${memeEffects.mood ? `<span>Mood: ${formatMod(memeEffects.mood)}</span>` : ''}
                  ${memeEffects.workSpeed ? `<span>Work: ${formatMod(memeEffects.workSpeed)}</span>` : ''}
                  ${memeEffects.combatSkill ? `<span>Combat: ${formatMod(memeEffects.combatSkill)}</span>` : ''}
                  ${memeEffects.socialSkill ? `<span>Social: ${formatMod(memeEffects.socialSkill)}</span>` : ''}
                  ${memeEffects.animalSkill ? `<span>Animals: ${formatMod(memeEffects.animalSkill)}</span>` : ''}
                  ${memeEffects.researchSpeed ? `<span>Research: ${formatMod(memeEffects.researchSpeed)}</span>` : ''}
                  ${memeEffects.miningSpeed ? `<span>Mining: ${formatMod(memeEffects.miningSpeed)}</span>` : ''}
                  ${memeEffects.plantSpeed ? `<span>Plants: ${formatMod(memeEffects.plantSpeed)}</span>` : ''}
                  ${memeEffects.painFactor ? `<span>Pain: ${formatMod(memeEffects.painFactor)}</span>` : ''}
                  ${memeEffects.immunityGain ? `<span>Immunity: ${formatMod(memeEffects.immunityGain)}</span>` : ''}
                  ${memeEffects.psychicSensitivity ? `<span>Psychic: ${formatMod(memeEffects.psychicSensitivity)}</span>` : ''}
                  ${memeEffects.convertSpeed ? `<span>Convert: ${formatMod(memeEffects.convertSpeed)}</span>` : ''}
                </div>
              </div>
            ` : ''}
            </div>
          </div>

          <!-- IMPACT SUMMARY -->
          <div class="settings-card" style="background:var(--surface2)">
            <div class="section-title section-title--sm">Colony Impact <span style="font-size:var(--f-xs); font-weight:400; color:var(--accent); opacity:0.8">ACTIVE</span></div>
            <div style="display:grid; grid-template-columns:${!isWidget && !memesOpen ? 'repeat(4, minmax(0, 1fr))' : '1fr 1fr'}; gap:12px">
              <div style="background:var(--surface3); padding:12px; border-radius:8px; text-align:center">
                <div style="font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; margin-bottom:4px">Mood</div>
                <div style="font-size:calc(18px * var(--font-scale)); font-weight:800; color:${totalMood > 0 ? 'var(--ok-txt)' : totalMood < 0 ? 'var(--p4-txt)' : 'var(--text3)'}">${totalMood > 0 ? '+' : ''}${totalMood}</div>
              </div>
              <div style="background:var(--surface3); padding:12px; border-radius:8px; text-align:center">
                <div style="font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; margin-bottom:4px">Work Speed</div>
                <div style="font-size:calc(18px * var(--font-scale)); font-weight:800; color:${totalWorkSpeed > 0 ? 'var(--ok-txt)' : totalWorkSpeed < 0 ? 'var(--p4-txt)' : 'var(--text3)'}">${totalWorkSpeed > 0 ? '+' : ''}${(totalWorkSpeed*100).toFixed(0)}%</div>
              </div>
              <div style="background:var(--surface3); padding:12px; border-radius:8px; text-align:center">
                <div style="font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; margin-bottom:4px">Combat</div>
                <div style="font-size:calc(18px * var(--font-scale)); font-weight:800; color:${totalCombat > 0 ? 'var(--ok-txt)' : totalCombat < 0 ? 'var(--p4-txt)' : 'var(--text3)'}">${totalCombat > 0 ? '+' : ''}${totalCombat}</div>
              </div>
              <div style="background:var(--surface3); padding:12px; border-radius:8px; text-align:center">
                <div style="font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; margin-bottom:4px">Research</div>
                <div style="font-size:calc(18px * var(--font-scale)); font-weight:800; color:${totalResearch > 0 ? 'var(--ok-txt)' : totalResearch < 0 ? 'var(--p4-txt)' : 'var(--text3)'}">${totalResearch > 0 ? '+' : ''}${(totalResearch*100).toFixed(0)}%</div>
              </div>
            </div>
            ${totalMood !== 0 || totalWorkSpeed !== 0 || totalCombat !== 0 ? `
              <div style="margin-top:12px; padding:10px; background:var(--surface); border-radius:6px; border-left:3px solid var(--accent)">
                <div style="font-size:var(--f-xs); color:var(--text2); line-height:1.5">
                  ${totalMood >= 8 ? 'Colonists will be generally happy. Mental breaks will be rare.' : ''}
                  ${totalMood <= -8 ? 'High mood penalty, expect frequent mental breaks without compensating comforts.' : ''}
                  ${totalWorkSpeed >= 0.2 ? 'Significant work speed bonus, colony will be highly productive.' : ''}
                  ${totalWorkSpeed <= -0.15 ? 'Work speed penalty will slow colony development noticeably.' : ''}
                  ${totalCombat >= 4 ? 'Strong combat bonus - your fighters will be considerably more effective.' : ''}
                  <br><span style="opacity:0.6">These modifiers are active in all colony calculations (viability, work speed, skill totals).</span>
                </div>
              </div>
            ` : `
              <div style="margin-top:12px; padding:8px; font-size:var(--f-xs); color:var(--text3); text-align:center">
                Neutral impact. Select memes and configure precepts to see projected effects.
              </div>
            `}
          </div>
        </div>

        <!-- SPECIALIST ROLES -->
        <div class="settings-card" style="margin-bottom:var(--gap-lg)">
          <div class="section-title section-title--sm">Specialist Roles <span style="font-size:var(--f-xs); font-weight:400; color:var(--text3)">(unlocked by memes, pick up to 2 types)</span> <span style="font-size:calc(9px * var(--font-scale)); color:var(--accent); opacity:0.7; margin-left:6px">REFERENCE</span></div>
          ${availableSpecs.length > 0 ? `
            <div style="display:grid; grid-template-columns:${isWidget ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))'}; gap:10px">
              ${availableSpecs.map(s => `
                <div style="background:var(--surface2); padding:10px 12px; border-radius:8px; border-left:3px solid var(--accent)">
                  <div style="font-weight:700; font-size:var(--f-sm); color:var(--text); margin-bottom:4px">${_escapeHtml(s.label)}</div>
                  <div style="font-size:var(--f-xs); color:var(--text3); line-height:1.4">${_escapeHtml(s.description)}</div>
                  <div style="font-size:calc(9px * var(--font-scale)); color:var(--text3); margin-top:4px; opacity:0.7">From: ${s.memes.filter(m => ideo.memes.includes(m)).map(m => { const md = IDEO_MEMES.find(x=>x.id===m); return md ? md.label : m; }).join(', ')}</div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div style="font-size:var(--f-xs); color:var(--text3); padding:12px; text-align:center; opacity:0.7">
              No specialist roles unlocked. Select memes to see available specialists.
            </div>
          `}
        </div>

        <!-- PRECEPTS -->
        <div class="settings-card ideology-section-card ${preceptsOpen ? '' : 'card-collapsed'}" style="margin-bottom:var(--gap-lg)">
          <div class="section-title section-title--sm ideology-section-title">
            <span>Precepts <span style="font-size:var(--f-xs); font-weight:400; color:var(--accent); opacity:0.8">ACTIVE</span></span>
            <button class="icon-btn collapse-btn ideology-collapse-btn" type="button"
              data-ideo-collapse="precepts" aria-expanded="${preceptsOpen}" aria-controls="ideo-precepts-body"
              aria-label="${preceptsOpen ? 'Collapse' : 'Expand'} precepts" title="${preceptsOpen ? 'Collapse precepts' : 'Expand precepts'}">${preceptsOpen ? '&#9650;' : '&#9660;'}</button>
          </div>
          <div id="ideo-precepts-body" class="card-collapse-body ${preceptsOpen ? '' : 'collapsed'}">
            <div style="display:grid; grid-template-columns:${isWidget ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))'}; gap:12px">
            ${IDEO_PRECEPT_DEFS.map(p => {
              const forcedByMeme = preceptState.forcedBy[p.id];
              const forcedValue = forcedByMeme ? preceptState.selected[p.id] : null;
              const selected = preceptState.selected[p.id] || '';
              const selectedOpt = p.options.find(o => o.id === selected);

              // Filter options based on meme requirements
              const availableOptions = p.options.filter(o => this._ideoOptionValid(p, o.id, ideo.memes));

              return `<div style="background:var(--surface2); padding:12px; border-radius:8px; border-left:3px solid ${selectedOpt && selectedOpt.mood > 0 ? 'var(--ok-txt)' : selectedOpt && selectedOpt.mood < 0 ? 'var(--p4-txt)' : 'var(--border-med)'}; ${forcedValue ? 'opacity:0.8' : ''}">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px">
                  <div style="font-weight:700; font-size:var(--f-sm); color:var(--text)">${_escapeHtml(p.label)}</div>
                  <div style="font-size:var(--f-xs); color:var(--text3); text-transform:uppercase">${_escapeHtml(p.category)}</div>
                </div>
                ${forcedValue ? `
                  <div class="skill-input" style="width:100%; font-size:var(--f-xs); padding:5px 8px; opacity:0.7; cursor:not-allowed">${selectedOpt ? _escapeHtml(selectedOpt.label) : forcedValue} (locked)</div>
                  <div style="font-size:calc(9px * var(--font-scale)); color:var(--accent); margin-top:4px">Forced by ${_escapeHtml(forcedByMeme)}</div>
                ` : `
                  <select class="skill-input" aria-label="${_escapeHtml(p.label)}" style="width:100%; font-size:var(--f-xs)" onchange="App.setIdeoPrecept('${p.id}', this.value)">
                    <option value="">-- Not Set --</option>
                    ${availableOptions.map(o => `<option value="${o.id}" ${selected === o.id ? 'selected' : ''}>${_escapeHtml(o.label)} (${o.mood > 0 ? '+' : ''}${o.mood} mood)</option>`).join('')}
                  </select>
                `}
                ${selectedOpt ? `<div style="font-size:var(--f-xs); color:var(--text3); margin-top:4px; font-style:italic">${_escapeHtml(selectedOpt.description)}</div>` : ''}
              </div>`;
            }).join('')}
            </div>
          </div>
        </div>

        ${(ideo.unmappedPrecepts || []).length ? `<details class="settings-card" style="margin-bottom:var(--gap-lg)">
          <summary>Imported precepts not modelled (${ideo.unmappedPrecepts.length})</summary>
          <p class="settings-desc">Preserved from the save, but excluded from planner totals because no exact supported option exists.</p>
          <ul>${ideo.unmappedPrecepts.map(p => `<li>${_escapeHtml(p.def)}</li>`).join('')}</ul>
        </details>` : ''}

        <!-- RITUALS -->
        <div class="settings-card ideology-section-card ${ritualsOpen ? '' : 'card-collapsed'}" style="margin-bottom:var(--gap-lg)">
          <div class="section-title section-title--sm ideology-section-title">
            <span>Rituals <span style="font-size:calc(9px * var(--font-scale)); color:var(--accent); opacity:0.7; margin-left:6px">REFERENCE</span></span>
            <button class="icon-btn collapse-btn ideology-collapse-btn" type="button"
              data-ideo-collapse="rituals" aria-expanded="${ritualsOpen}" aria-controls="ideo-rituals-body"
              aria-label="${ritualsOpen ? 'Collapse' : 'Expand'} rituals" title="${ritualsOpen ? 'Collapse rituals' : 'Expand rituals'}">${ritualsOpen ? '&#9650;' : '&#9660;'}</button>
          </div>
          <div id="ideo-rituals-body" class="card-collapse-body ${ritualsOpen ? '' : 'collapsed'}">
            <div style="font-size:var(--f-xs); color:var(--text3); margin-bottom:10px">Plan which rituals to include. Drum/Dance parties give up to +16 mood and +20% global work speed.</div>
            <div style="display:flex; flex-wrap:wrap; gap:6px">
            ${this._allRituals().map(r => {
              const active = ideoRituals.includes(r.id);
              return `<button class="btn btn-sm ${active ? 'btn-accent' : ''}"
                style="font-size:${isWidget ? '10px' : 'var(--f-xs)'}; padding:4px 8px"
                data-ideo-ritual="${_escapeHtml(r.id)}" aria-pressed="${active}"
                title="${_escapeHtml(r.description)}">${_escapeHtml(r.label)}${r.modSource ? ' <span style="font-size:calc(9px * var(--font-scale)); opacity:0.5">Mod</span>' : ''}</button>`;
            }).join('')}
            </div>
            ${ideoRituals.length > 0 ? `
              <div style="margin-top:10px; padding-top:10px; border-top:1px solid var(--border)">
                <div style="display:grid; grid-template-columns:${isWidget ? '1fr' : '1fr 1fr'}; gap:8px; font-size:var(--f-xs)">
                  ${ideoRituals.map(rId => {
                    const r = this._allRituals().find(x => x.id === rId);
                    if (!r) return '';
                    return `<div style="background:var(--surface2); padding:8px; border-radius:6px">
                      <span style="font-weight:700; color:var(--text)">${_escapeHtml(r.label)}</span>
                      <span style="color:var(--text3); margin-left:4px">${_escapeHtml(r.category)}</span>
                      <div style="color:var(--text3); margin-top:2px; font-style:italic">${_escapeHtml(r.description)}</div>
                    </div>`;
                  }).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
    // Imported identifiers are data, never executable inline handler source.
    c.onclick = event => {
      const button = event.target.closest('button[data-ideo-meme], button[data-ideo-ritual], button[data-ideo-collapse]');
      if (!button || !c.contains(button) || button.disabled) return;
      if (button.hasAttribute('data-ideo-meme')) this.toggleIdeoMeme(button.dataset.ideoMeme);
      else if (button.hasAttribute('data-ideo-ritual')) this.toggleIdeoRitual(button.dataset.ideoRitual);
      else this.toggleIdeoSection(button.dataset.ideoCollapse);
    };
  },

  toggleIdeoSection(section) {
    if (!['memes', 'precepts', 'rituals'].includes(section)) return;
    if (!this._ideoSectionOpen || typeof this._ideoSectionOpen !== 'object') {
      this._ideoSectionOpen = { memes: true, precepts: true, rituals: true };
    }
    this._ideoSectionOpen[section] = this._ideoSectionOpen[section] === false;
    this.renderIdeology();
  },

  toggleIdeoMeme(memeId) {
    const ideo = this.state.ideology || (this.state.ideology = { memes: [], precepts: {}, name: '' });
    if (!ideo.memes) ideo.memes = [];
    const idx = ideo.memes.indexOf(memeId);
    if (idx > -1) {
      ideo.memes.splice(idx, 1);
    } else {
      const allM = this._allMemes();
      const meme = allM.find(m => m.id === memeId);
      if (!meme) return;
      const isStructure = meme && meme.category === 'Structure';
      if (isStructure) {
        // Exactly one structure meme, as in the game: selecting another swaps it.
        ideo.memes = ideo.memes.filter(mId => {
          const m = allM.find(x => x.id === mId);
          return !(m && m.category === 'Structure');
        });
      } else {
        // Up to 3 normal memes (the game's creation cap), structure not counted.
        const normalCount = ideo.memes.filter(mId => {
          const m = allM.find(x => x.id === mId);
          return !(m && m.category === 'Structure');
        }).length;
        if (normalCount >= 3) return;
      }
      // Check conflicts
      if (meme && meme.conflicts) {
        const hasConflict = ideo.memes.some(existing => {
          return meme.conflicts.includes(existing);
        });
        if (hasConflict) return;
      }
      ideo.memes.push(memeId);
    }
    // Warn about any precept selections that are now incompatible with current memes
    if (ideo.precepts) {
      const conflicts = [];
      Object.keys(ideo.precepts).forEach(pId => {
        const pDef = IDEO_PRECEPT_DEFS.find(x => x.id === pId);
        if (!pDef) return;
        const optId = ideo.precepts[pId];
        const opt = pDef.options.find(o => o.id === optId);
        if (!opt) return;
        if (opt.blockedByMemes && opt.blockedByMemes.some(m => ideo.memes.includes(m))) {
          conflicts.push(pDef.label + ': ' + opt.label);
        }
        if (opt.requiredMemes && !opt.requiredMemes.some(m => ideo.memes.includes(m))) {
          conflicts.push(pDef.label + ': ' + opt.label);
        }
      });
      if (conflicts.length > 0) {
        this.toast('Incompatible precepts, ' + conflicts.join(', '), 4500);
      }
    }
    this._ideoFxCache = null; // invalidate cached effects
    this.renderIdeology();
    this.triggerAutoSave();
  },

  setIdeoPrecept(preceptId, optionId) {
    const def = IDEO_PRECEPT_DEFS.find(p => p.id === preceptId);
    if (!def || this.getIdeoPreceptState().forcedBy[preceptId]) return;
    if (optionId && !this._ideoOptionValid(def, optionId, this.state.ideology?.memes)) return;
    const ideo = this.state.ideology || (this.state.ideology = { memes: [], precepts: {}, name: '' });
    if (!ideo.precepts) ideo.precepts = {};
    if (optionId) ideo.precepts[preceptId] = optionId;
    else delete ideo.precepts[preceptId];
    this._ideoFxCache = null; // invalidate cached effects
    this.renderIdeology();
    this.triggerAutoSave();
  },

  toggleIdeoRitual(ritualId) {
    if (!this._allRituals().some(r => r.id === ritualId)) return;
    const ideo = this.state.ideology || (this.state.ideology = { memes: [], precepts: {}, name: '', rituals: [] });
    if (!ideo.rituals) ideo.rituals = [];
    const idx = ideo.rituals.indexOf(ritualId);
    if (idx > -1) ideo.rituals.splice(idx, 1);
    else ideo.rituals.push(ritualId);
    this.renderIdeology();
    this.triggerAutoSave();
  },

  resetIdeology() {
    this.showConfirm('Reset ideology?', 'Reset', 'This will clear all memes, precepts, rituals, and notes.').then(() => {
      this.state.ideology = { memes: [], precepts: {}, name: '', type: 'fixed', rituals: [], notes: '' };
      this._ideoFxCache = null;
      this._ideoFxKey = '';
      this.renderIdeology();
      this.triggerAutoSave();
      this.toast('Ideology reset.');
    }).catch(() => {});
  },

  // Browse every ideology that exists in the imported save game, with full detail.
  showSaveIdeologiesModal() {
    const list = this.state.savedIdeologies || [];
    if (!list.length) {
      this.toast('Import a save game first to browse its ideologies.');
      return;
    }
    const _humanise = s => this._defLabelOrHumanize(s);
    const _capFirst = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    const chip = (txt, title) => `<span title="${_escapeHtml(title || txt)}" style="display:inline-flex; padding:2px 7px; background:var(--surface3); border:1px solid var(--border-med); border-radius:4px; font-size:calc(11px * var(--font-scale)); white-space:nowrap">${_escapeHtml(txt)}</span>`;

    const sorted = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const cards = sorted.map(( id, i) => {
      const memesHtml = (id.memes || []).length
        ? `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px">${id.memes.map(m => chip(_humanise(m), m)).join('')}</div>`
        : '<span style="color:var(--text3); font-size:var(--f-xs)">None</span>';
      const deitiesHtml = (id.deities || []).length
        ? id.deities.map(d => `<div style="font-size:var(--f-xs); color:var(--text2)"><b style="color:var(--text)">${_unityRichToHtml(d.name)}</b>${d.type ? ' - ' + _unityRichToHtml(d.type) : ''}${d.gender ? ' (' + _escapeHtml(d.gender) + ')' : ''}</div>`).join('')
        : '<span style="color:var(--text3); font-size:var(--f-xs)">None</span>';
      // Split roles out from precepts; dedupe the rest by def (saves repeat
      // many per-trait "DisapprovedTraits"/"PreferredTraits" precept entries).
      const allP = id.precepts || [];
      const roles = allP.filter(p => /^IdeoRole_/.test(p.def))
        .sort((a, b) => (a.name || a.def || '').localeCompare(b.name || b.def || ''));
      const others = allP.filter(p => !/^IdeoRole_/.test(p.def));
      const seen = new Map();
      others.forEach(p => { seen.set(p.def, (seen.get(p.def) || 0) + 1); });
      const uniqueP = [];
      const added = new Set();
      others.forEach(p => { if (added.has(p.def)) return; added.add(p.def); uniqueP.push(p); });
      // Sort by def so same-issue precepts (Cannibalism_*, Drugs_*, Execution_*) cluster
      // together instead of appearing in raw save order.
      uniqueP.sort((a, b) => (a.def || '').localeCompare(b.def || ''));
      const preceptsHtml = uniqueP.length
        ? `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px">${uniqueP.map(p => { const n = seen.get(p.def); return chip((_capFirst(p.name) || _humanise(p.def)) + (n > 1 ? ` x${n}` : ''), p.def); }).join('')}</div>`
        : '<span style="color:var(--text3); font-size:var(--f-xs)">None</span>';
      const rolesHtml = roles.length
        ? `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px">${roles.map(r => chip(r.name || _humanise(r.def), r.def)).join('')}</div>`
        : '';
      const meta = [];
      if (id.adjective) meta.push(`Adjective: <b>${_escapeHtml(id.adjective)}</b>`);
      if (id.memberName) meta.push(`Members: <b>${_escapeHtml(id.memberName)}</b>`);
      if (id.culture) meta.push(`Culture: <b>${_escapeHtml(_humanise(id.culture))}</b>`);
      const leader = id.leaderTitleMale || id.leaderTitleFemale;
      if (leader) meta.push(`Leader: <b>${_escapeHtml(leader)}</b>`);
      if (id.place) meta.push(`Origin: <b>${_escapeHtml(id.place)}</b>`);

      return `<details ${i === 0 ? 'open' : ''} style="border:1px solid var(--border-med); border-radius:8px; margin-bottom:8px; background:var(--bg2)">
        <summary style="cursor:pointer; padding:10px 12px; font-weight:700; font-size:var(--f-sm); color:var(--text); list-style-position:inside">
          ${_escapeHtml(id.name || 'Unnamed Ideology')}
          <span style="font-weight:400; color:var(--text3); font-size:var(--f-xs); margin-left:6px">${(id.memes || []).length} meme${(id.memes || []).length !== 1 ? 's' : ''}, ${(id.precepts || []).length} precept${(id.precepts || []).length !== 1 ? 's' : ''}</span>
        </summary>
        <div style="padding:0 12px 12px 12px; display:flex; flex-direction:column; gap:10px">
          ${meta.length ? `<div style="font-size:var(--f-xs); color:var(--text2); line-height:1.7">${meta.join(' &nbsp;|&nbsp; ')}</div>` : ''}
          ${id.description ? `<div style="font-size:var(--f-xs); color:var(--text2); line-height:1.5; white-space:pre-wrap; background:var(--surface3); padding:8px 10px; border-radius:6px">${_unityRichToHtml(id.description)}</div>` : ''}
          <div><div class="trait-title" style="margin-bottom:2px">Deities</div>${deitiesHtml}</div>
          <div><div class="trait-title" style="margin-bottom:2px">Memes (${(id.memes || []).length})</div>${memesHtml}</div>
          ${rolesHtml ? `<div><div class="trait-title" style="margin-bottom:2px">Roles (${roles.length})</div>${rolesHtml}</div>` : ''}
          <div><div class="trait-title" style="margin-bottom:2px">Precepts (${uniqueP.length})</div>${preceptsHtml}</div>
        </div>
      </details>`;
    }).join('');

    const body = `<div style="font-size:var(--f-xs); color:var(--text3); margin-bottom:10px">Every ideology present in the imported save (${sorted.length}). Click a name to expand its full detail.</div>
      <div style="max-height:60vh; overflow-y:auto; padding-right:4px">${cards}</div>`;
    this._showGenericModal(`Save File Ideologies (${sorted.length})`, body);
  },

  // Load the player's colony ideology (parsed from the imported save) into the planner.
  // Confirms first if the planner already has memes, so existing work isn't clobbered.
  loadPlayerIdeoFromSave() {
    const pi = this.state.savedPlayerIdeo;
    if (!pi || !pi.name) { this.toast('No imported colony ideology to load. Import a save first.'); return; }
    const apply = () => {
      this._applyIdeoFromSave(pi);
      this.triggerAutoSave();
      this.renderIdeology();
      this.toast(`Planner set to your colony's ideology, "${pi.name}".`);
    };
    const cur = this.state.ideology;
    if (cur && (cur.memes || []).length) {
      this.showConfirm(`Replace the current planner with your colony's ideology "${pi.name}"?`, 'Load').then(apply).catch(() => {});
    } else {
      apply();
    }
  },

  // -- HELP TAB --
  renderLegal() {
    const c = document.getElementById('view-legal');
    if (!c) return;
    const v = this._appVersion || '1.3.37';
    c.innerHTML = `
      <div style="max-width:720px; margin:0 auto; padding:var(--gap-lg)">
        <div class="view-header" style="margin-bottom:var(--gap-lg)">
          <div class="view-header-content">
            <h2 class="view-title">Legal &amp; Disclaimer</h2>
            <div class="view-subtitle">RimJobs v${_escapeHtml(v)}</div>
          </div>
        </div>

        <div class="settings-card" style="margin-bottom:var(--gap-lg)">
          <div class="section-title section-title--sm" style="color:var(--accent)">Fan Project Disclaimer</div>
          <p style="font-size:var(--f-sm); color:var(--text2); line-height:1.7; margin:8px 0 0">
            RimJobs is an independent, unofficial fan-made companion tool.
            It is <strong>not</strong> affiliated with, endorsed by, or connected to Ludeon Studios, Tynan Sylvester,
            or any official RimWorld development team. This project is created and maintained by a fan, for <em>only</em> fans.
          </p>
        </div>

        <div class="settings-card" style="margin-bottom:var(--gap-lg)">
          <div class="section-title section-title--sm">AI Disclosure</div>
          <p style="font-size:var(--f-sm); color:var(--text2); line-height:1.7; margin:8px 0 0">
            The majority of this application's code, design, and content was generated with the assistance of AI.
            All output has been reviewed, directed, and curated by me.
          </p>
        </div>

        <div class="settings-card" style="margin-bottom:var(--gap-lg)">
          <div class="section-title section-title--sm">Acknowledgements</div>
          <p style="font-size:var(--f-sm); color:var(--text2); line-height:1.7; margin:8px 0 0">
            Game data is sourced from RimWorld's game files and the <a href="https://rimworldwiki.com" onclick="window.overlay.openExternal('https://rimworldwiki.com'); return false;" style="color:var(--accent); text-decoration:none; font-weight:600">RimWorld Wiki</a>.
          </p>
          <p style="font-size:var(--f-sm); color:var(--text2); line-height:1.7; margin:8px 0 0">
            RimJobs's game-accurate combat, armour and raid maths were verified against RimWorld's
            decompiled source using <a href="https://github.com/kearril/RimSearcher" onclick="window.overlay.openExternal('https://github.com/kearril/RimSearcher'); return false;" style="color:var(--accent); text-decoration:none; font-weight:700">RimSearcher</a>
            by kearril (MIT), an MCP server for fast searching of RimWorld source code.
          </p>
          <p style="font-size:var(--f-sm); color:var(--text2); line-height:1.7; margin:8px 0 0">
            Blueprint sharing is an offline take on the in-game <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=708455313" onclick="window.overlay.openExternal('https://steamcommunity.com/sharedfiles/filedetails/?id=708455313'); return false;" style="color:var(--accent); text-decoration:none; font-weight:600">Blueprints</a> mod by <a href="https://steamcommunity.com/id/FluffyMods" onclick="window.overlay.openExternal('https://steamcommunity.com/id/FluffyMods'); return false;" style="color:var(--accent); text-decoration:none; font-weight:700">Fluffy</a>, whose work inspired the feature. RimJobs is not affiliated with or endorsed by Fluffy or kearril.
          </p>
          <p style="font-size:var(--f-sm); color:var(--text2); line-height:1.7; margin:8px 0 0">
            The optional OpenDyslexic typeface is copyright &copy; 2019 Abbie Gonzalez and is distributed under the SIL Open Font License 1.1. OpenDyslexic is a Reserved Font Name. The full licence is bundled with the font files.
          </p>
        </div>

        <div class="settings-card" style="margin-bottom:var(--gap-lg)">
          <div class="section-title section-title--sm">Trademarks & Intellectual Property</div>
          <p style="font-size:var(--f-sm); color:var(--text2); line-height:1.7; margin:8px 0 0">
            <strong>RimWorld</strong> is a registered trademark of Ludeon Studios. All RimWorld game content,
            including but not limited to game mechanics, names, descriptions, artwork, and assets,
            are the intellectual property of Ludeon Studios and their respective owners.
          </p>
          <p style="font-size:var(--f-sm); color:var(--text2); line-height:1.7; margin:8px 0 0">
            This application reads data from locally installed game files and save files solely for the purpose
            of providing a companion tool experience. No game assets, textures, sounds, or proprietary content
            are distributed with or embedded in this application.
          </p>
          <p style="font-size:var(--f-sm); color:var(--text2); line-height:1.7; margin:8px 0 0">
            All mod content detected by this application belongs to its respective mod authors.
          </p>
        </div>

        <div class="settings-card" style="margin-bottom:var(--gap-lg)">
          <div class="section-title section-title--sm">No Warranty</div>
          <p style="font-size:var(--f-sm); color:var(--text2); line-height:1.7; margin:8px 0 0">
            This software is provided <strong>"as is"</strong>, without warranty of any kind, express or implied,
            including but not limited to the warranties of merchantability, fitness for a particular purpose,
            and non-infringement. In no event shall the authors or contributors be liable for any claim,
            damages, or other liability, whether in an action of contract, tort, or otherwise, arising from,
            out of, or in connection with the software or the use or other dealings in the software.
          </p>
          <p style="font-size:var(--f-sm); color:var(--text2); line-height:1.7; margin:8px 0 0">
            The authors are not responsible for any corrupted save files, lost data, or unintended game behaviour
            resulting from the use of this tool. <strong>Always back up your save files.</strong>
          </p>
        </div>

        <div class="settings-card" style="margin-bottom:var(--gap-lg)">
          <div class="section-title section-title--sm">Data & Privacy</div>
          <p style="font-size:var(--f-sm); color:var(--text2); line-height:1.7; margin:8px 0 0">
            RimJobs operates entirely offline. It does <strong>not</strong> collect, transmit, store, or share
            any personal data, telemetry, analytics, or usage information. All data stays on your machine.
          </p>
          <p style="font-size:var(--f-sm); color:var(--text2); line-height:1.7; margin:8px 0 0">
            The application accesses the following local data:
          </p>
          <ul style="font-size:var(--f-sm); color:var(--text2); line-height:1.8; margin:6px 0 0; padding-left:20px">
            <li>RimWorld save files (.rws) for pawn and colony data import</li>
            <li>RimWorld installation directory for game definition XML files (traits, xenotypes, storytellers, etc.)</li>
            <li>Steam Workshop folder for mod detection and label resolution</li>
            <li>Local application data folder for storing your RimJobs settings and preferences</li>
          </ul>
        </div>

        <div class="settings-card" style="margin-bottom:var(--gap-lg)">
          <div class="section-title section-title--sm">Donations</div>
          <p style="font-size:var(--f-sm); color:var(--text2); line-height:1.7; margin:8px 0 0">
            RimJobs is free software and always will be. If you find it useful, donations will always be
            appreciated but never required or expected as this tool did take time, effort and money. Donations
            do not grant any additional features, priority support, or special access. This is and will remain a fan project.
          </p>
        </div>

        <div class="settings-card" style="margin-bottom:var(--gap-lg)">
          <div class="section-title section-title--sm">Takedown & Contact</div>
          <p style="font-size:var(--f-sm); color:var(--text2); line-height:1.7; margin:8px 0 0">
            If you are a rights holder and believe this application infringes on your intellectual property,
            please contact <a href="${this._githubProfile}" onclick="window.overlay.openExternal('${this._githubProfile}'); return false;" style="color:var(--accent); text-decoration:none; font-weight:700">me</a> and the content will be promptly reviewed and addressed.
          </p>
        </div>

        <div style="text-align:center; padding:var(--gap-lg) 0; color:var(--text3); font-size:var(--f-xs); line-height:1.8">
          <div style="margin-bottom:6px">
            Created by <a href="https://github.com/fugnsig" onclick="window.overlay.openExternal('https://github.com/fugnsig'); return false;" style="color:var(--accent); text-decoration:none; font-weight:700">Brodie Zotti</a>
          </div>
          <div style="margin-bottom:10px">
            <a href="https://ko-fi.com/rimjobs" onclick="window.overlay.openExternal('https://ko-fi.com/rimjobs'); return false;"
               style="display:inline-flex; align-items:center; gap:6px; padding:6px 14px; border-radius:999px; background:var(--accent); color:#1a1a1a; text-decoration:none; font-weight:800; font-size:var(--f-xs)">&#9829; Support RimJobs on Ko-fi</a>
          </div>
          <div>&copy; 2026 Brodie Zotti. All rights reserved.</div>
        </div>
      </div>
    `;
  },

  renderHelp() {
    const c = document.getElementById('view-help');
    if (!c) return;
    const isWidget = window.innerWidth <= 550;
    const hdrSize = isWidget ? '14px' : '18px';
    const bodySize = isWidget ? '12px' : 'var(--help-font-size, 13px)';
    const bodyGap = isWidget ? '10px' : '16px';
    c.innerHTML = `
      <div class="help-layout" id="helpLayout">
        <nav class="help-drawer" id="helpNav">
          <div class="help-drawer-title">Contents</div>
        </nav>
        <div id="helpScroll" style="flex:1; min-height:0; overflow-y:auto; scrollbar-width:thin; scrollbar-color:var(--border-bright) transparent; padding-bottom:8px">
        <div class="settings-card" style="max-width:760px; margin:0 auto">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:${bodyGap}">
            <button class="help-nav-toggle btn btn-sm" onclick="App._helpToggleNav()">&#9776; Contents</button>
            <h2 class="view-title" style="font-size:${hdrSize}">RimJobs Manual</h2>
          </div>
          <div style="margin-bottom:${bodyGap}; padding:14px 16px; background:var(--surface3); border:1px solid var(--border-med); border-left:3px solid var(--accent); border-radius:8px; font-size:${bodySize}; color:var(--text2); line-height:1.7">
            <div style="font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; letter-spacing:0.08em; font-weight:800; margin-bottom:6px">Why RimJobs exists</div>
            <em>I originally started this snowball of a project as a way to clearly and easily compare weapons and armour as my 1200+ mod list adds a fair few, and honestly, I've never really understood what weapon was better, and why. So one thing led to another... and RimJobs was born. This has been a fun first-time project nonetheless. I hope someone finds it useful! <strong style="color:var(--accent); font-style:normal">It's time to rim.</strong></em>
          </div>
          <div class="help-body" style="display:flex; flex-direction:column; gap:${bodyGap}; font-size:${bodySize}; color:var(--text2); line-height:1.7">

            <div><strong style="color:var(--text)">Quick Start</strong><br>
            The fastest way to begin is to import the colony you are currently playing, then use the planners without changing the original save. After this introduction and the always-visible sidebar tools, the manual follows the main tabs from left to right: Priorities, Shift Planner, Armoury, Blueprints, Journal, Skills Web, Ideology, Relations, Records, Raids, then Settings &amp; Misc.
            <div style="margin-top:4px; padding-left:12px; border-left:2px solid var(--accent-glow)">
              • Click <strong>Import Game Save</strong>, choose a <code>.rws</code>, review the preview, then import the selected pawns.<br>
              • Choose <strong>Game Order</strong> in the pawn sort menu to mirror RimWorld's colonist-bar order across the sidebar, priorities table, and Shift Planner.<br>
              • Set priorities manually or use <strong>Auto-Assign</strong>, then use <strong>Work Planner</strong> to review gaps before applying suggestions.<br>
              • After saving again in RimWorld, click the circular <strong>Refresh Save</strong> button. Refresh re-reads and re-parses the same file, updates matched pawns, adds recruits, refreshes game-sourced ideology roles, and preserves roles you changed inside RimJobs.<br>
              • Use <strong>Export Edited Save</strong> only when you intentionally want a new game save containing supported pawn edits. RimJobs never overwrites the original <code>.rws</code>.
            </div></div>

            <div><strong style="color:var(--text)">Priorities</strong><br>
            Set each pawn's job priorities from 1 (highest) to a configurable maximum from 4 to 9. Empty cells mean the job is disabled. Change the range with the <strong>Range 1-X</strong> pill on the Priorities toolbar. Priority 1 is green, with lower priorities progressing towards red. Pawn names are editable directly in the table, which sets an explicit nickname and syncs it across all views.
            <div style="margin-top:4px; padding-left:12px; border-left:2px solid var(--accent-glow)">
              • <strong>Left Click:</strong> Raise priority towards 1. From an empty cell, it starts at the configured lowest priority.<br>
              • <strong>Right Click:</strong> Lower priority towards the configured maximum. From an empty cell, it starts at 1.<br>
              • <strong>Mouse Wheel:</strong> Rapidly cycle through levels<br>
              • <strong>Keys 1 to 9:</strong> Set any level allowed by the configured range directly<br>
              • <strong>Keys 0 or Del:</strong> Clear the priority<br>
              • <strong>Manual/Simple:</strong> Switch between numbered priorities and a basic enabled/disabled table.<br>
              • <strong>Colony Focus:</strong> Keep Balanced for the existing assignment behaviour, or select a strategic area such as Construction, Farming, or Mining. Normal promotes a smaller suitable group, while Strong promotes a larger group more aggressively. Built-in groups can cover several related jobs, and ungrouped custom or modded jobs appear as direct choices.<br>
              • <strong>Lock:</strong> Lock priority editing after setup so clicks, keys, wheels, Auto-Assign, and Work Planner actions cannot change assignments. Scrolling remains available.
            </div>
            Auto-Assign and Work Planner suggestions use the whole selected range. Their four aptitude tiers are spread proportionally across 1-X: a 1-4 scale uses 1, 2, 3, 4, while a 1-9 scale uses 1, 4, 6, 9. Emergency work remains anchored at 1 and fallback coverage remains anchored at X. Priorities are planning data inside RimJobs and are not written into RimWorld save files. The <strong>Auto-Assign</strong> button uses a dynamic ranking algorithm to cover every visible job that has an eligible pawn while prioritising specialists and respecting mood modes. <em>It weighs skills, passions, role and xenotype/gene effects, including disabled work. Vanilla xenotype strengths and weaknesses are fully accounted for, and modded ones too after a Scan Mods (a few C#-driven mod effects still can't be read). Children only receive jobs their age allows (hauling/cleaning at 3, most work at 7, skilled work at 10-13, matching the game's age gates), and pawns who were downed in the imported save get nothing until they recover - click the Downed chip on their card to clear it manually.</em> Colony Focus is a preference layer over that logic. Incapability, age, availability, emergency work, and sole coverage for an unrelated important job always win. The focus applies only to visible priority columns and never invents eligibility. The <strong>Work Planner</strong> runs a colony-wide analysis to surface gaps and recommend better assignments (see Work Planner below).</div>

            <div><strong style="color:var(--text)">Pawn Cards &amp; Pawn Manager</strong><br>
            Each colonist has a card in the sidebar with skills, traits, passions, backstories, health, and incapabilities. Cards start <strong>collapsed</strong> by default - click a card to expand it, and that choice is remembered per-pawn. Pawn card headers (name, collapse, delete) are sticky while scrolling. Use the <strong>Manage</strong> button next to "Colony Pawns" for a full-screen pawn editor modal.
            <div style="margin-top:4px; padding-left:12px; border-left:2px solid var(--accent-glow)">
              • <strong>Skills:</strong> Use +/- to adjust base levels (0-20). Sparklines show recent history.<br>
              • <strong>Passions:</strong> Left-click to cycle up (None → Interested → Burning), right-click to cycle down.<br>
              • <strong>Xenotype &amp; Role:</strong> Dropdowns apply stat modifiers, gene effects, locked incapabilities, and work-speed bonuses. Imported pawns keep the exact role PreceptDef from their own ideology. After Scan Mods, RimJobs reads that installed role definition and uses only explicit, complete work restrictions. A missing, patched, malformed, inactive, or conflicting definition remains permissive instead of falsely blocking work.<br>
              • <strong>Backstories:</strong> Childhood and adulthood backstory dropdowns. Each backstory can add skill bonuses and work type restrictions (incapabilities). Vanilla backstories are built-in; modded backstories are auto-created on save import.<br>
              • <strong>Faction &amp; Ideology:</strong> Editable text fields showing the pawn's current faction and ideology. Populated automatically on save import (resolved from the save's faction and ideology data) and editable by hand.<br>
              • <strong>Displayed Name:</strong> Imported pawns use the same short name as RimWorld. An explicit nickname wins; otherwise RimWorld deterministically chooses the pawn's first or last name. Typing into a name field creates an explicit nickname.<br>
              • <strong>Pawn Order:</strong> Drag pawns for a manual order, sort alphabetically or by age/skill, or choose <strong>Game Order</strong> to restore the imported colonist-bar sequence. The chosen sort is shared by the sidebar, priorities table, and Shift Planner.<br>
              • <strong>Bio:</strong> A collapsible text field for personal notes about each pawn (lore, reminders, plans).<br>
              • <strong>Health:</strong> Health imported from save files shows missing parts (○), prosthetics (◆), implants (◇), injuries (●), and conditions (+) with resolved body part names. Redundant entries are collapsed -e.g. a missing hand won't also list every missing finger, and a prosthetic suppresses the "missing" label for that part. Use the Health edit button for supported save-export changes.<br>
              • <strong>Work Speed %:</strong> Shown in the header, combines trait, gene, role, and ideology bonuses.<br>
              • <strong>Incapable:</strong> Only active incapabilities are shown (from manual toggles, xenotype, genes, role, or backstory restrictions).<br>
              • <strong>Pawn Spotlight:</strong> Drag a sidebar card onto the main area to open an enlarged, read-only view of that pawn. Cycle through the colony with the on-screen arrows or the left/right arrow keys, press Esc to close, or use <strong>Show in sidebar</strong> to jump back to that pawn's card.
            </div></div>

            <div><strong style="color:var(--text)">Xenotype &amp; Gene System</strong><br>
            Click <strong>Xenotypes</strong> in the sidebar Actions section to manage vanilla and custom xenotypes. Custom xenotypes can be fully configured:
            <div style="margin-top:4px; padding-left:12px; border-left:2px solid var(--accent-glow)">
              • <strong>Skill Modifiers:</strong> Set per-skill bonuses/penalties (e.g. Shooting +4, Cooking -2).<br>
              • <strong>Incapable Of:</strong> Toggle work type restrictions (Violence, Cooking, Hauling, etc.).<br>
              • <strong>Genes:</strong> Toggle from 65+ vanilla Biotech genes grouped by category (Shooting, Melee, Body, Combat, Metabolism, Psychic, etc.). Each gene can provide skill bonuses, work speed modifiers, or incapability restrictions.<br>
              • <strong>Mod Genes:</strong> Create custom genes for modded content with name, category, skill bonuses, and work speed effects.<br>
              • <strong>Propagation:</strong> Gene skill mods feed into effective skill calculations. Gene work speed mods feed into the work speed engine. Gene incapabilities block matching work types, all automatically.
            </div></div>

            <div><strong style="color:var(--text)">Custom Traits</strong><br>
            Click <strong>Traits</strong> in the sidebar Actions section to create and edit custom traits. Custom traits support full post-creation editing:
            <div style="margin-top:4px; padding-left:12px; border-left:2px solid var(--accent-glow)">
              • <strong>Work Speed:</strong> Additive modifier (e.g. 0.35 = +35%).<br>
              • <strong>Learning Rate:</strong> Additive modifier (e.g. 0.75 = +75%).<br>
              • <strong>Break Threshold:</strong> Additive modifier (e.g. 0.08 = +8% mental break risk).<br>
              • <strong>Skill Modifiers:</strong> Per-skill bonuses across all 12 skills.
            </div></div>

            <div><strong style="color:var(--text)">Shift Planner</strong><br>
            Design 24-hour work/sleep schedules for each colonist. Pawn nicknames are editable inline. Select a shift type from the legend, then drag-paint across cells to apply it.
            <div style="margin-top:4px; padding-left:12px; border-left:2px solid var(--accent-glow)">
              • <strong>Drag Paint:</strong> Select a type in the legend, then click and drag across the schedule bar to paint hours.<br>
              • <strong>Optimise:</strong> Generates pawn-aware schedules around your priorities table (it reads priorities for workload and critical cover but never changes them). Accounts for Night Owl (sleeps through the 11h-18h mood-loss window, awake for the 23h-6h bonus), UV sensitivity (sleeps through daylight unless Undergrounder), Quick Sleeper (6h sleep), Low Sleep gene (3h sleep), Sleepless gene and Body Mastery (no sleep), children (no work blocks, extra play; babies free-scheduled), psycasters (dedicated Meditate block), Depressive/Neurotic traits (extra joy), Ascetic (less joy needed), and break threshold risk. Pawns with heavier workloads (more P1 jobs) get more work hours. Critical-job specialists (doctor, cook) are scheduled first for round-the-clock cover, and a gap-repair pass fills any remaining zero-coverage hours.<br>
              • <strong>Custom Types:</strong> Rename shift types and change their colours directly in the legend.
            </div>
            <div style="margin-top:6px"><strong style="color:var(--accent)">Active Row:</strong> The <strong>Active</strong> row at the bottom shows how many colonists are awake (not sleeping) at each hour. Higher numbers mean more coverage. Use this to spot gaps where too few pawns are working, then adjust schedules or use Optimise to balance the load.</div></div>

            <div><strong style="color:var(--text)">Armoury</strong><br>
            One tab with three sub-tabs - <strong>Weapons</strong>, <strong>Apparel</strong>, and <strong>Comparison</strong> (the old separate Apparel tab now lives here). Column headers and stat labels have hover tooltips explaining the jargon (Paper DPS, Touch, AP, Sharp/Blunt/Heat, etc.) for players new to RimWorld.
            <div style="margin-top:4px; padding-left:12px; border-left:2px solid var(--accent-glow)">
              • <strong>Weapons:</strong> List your ranged and melee weapons with effective DPS at point-blank/short/medium/long range and armour penetration. <strong>Direct Comparison</strong> pits two weapons side-by-side at any quality tier with pros/cons and a TL;DR verdict.<br>
              • <strong>Threat Presets:</strong> Direct Comparison simulates effective DPS against Unarmoured, Flak, Centipede, Marine, and Cataphract targets. Custom sharp and blunt armour values are also available.<br>
              • <strong>Quality Modifiers:</strong> Accuracy scales at every tier (Awful ×0.8 → Legendary ×1.5). Ranged damage &amp; AP drop at Awful (×0.9) and rise from Masterwork (×1.25) to Legendary (×1.5). Melee damage scales at every tier (Awful ×0.8 → Legendary ×1.65).<br>
              • <strong>Scan Mods:</strong> Pulls weapons/apparel from your installed mods. It's a best-effort XML reader - accurate for vanilla-style mods, approximate for stuff-based items, and not reliable for Combat Extended or C#-driven stats (which it can't read). Fix anything off via the item editor.<br>
              • <strong>Comparison:</strong> Build a full kit - a weapon plus 11 apparel slots laid out by layer × body region (Head, Eyes, Torso and Legs each in Skin/Mid/Outer, Hands, Feet, and one Belt), matching RimWorld's single utility slot. Multi-coverage items (a duster, power armour, or full helmet) fill every relevant slot. Compare two kits (A vs B) for protection on a selected body region, insulation, mass, move speed and weapon DPS. <strong>Seed from a pawn</strong> auto-fills a kit from an imported colonist's actual gear; <strong>Scan Equipment Mods</strong> loads modded weapons + armour so they are selectable; hover any filled slot for that item's stats; <strong>Save</strong> presets and <strong>Clear</strong> to empty. When a loadout is seeded from a pawn, hovering the weapon also shows <em>effective DPS in that pawn's hands</em>, weapon accuracy multiplied by the pawn's per-cell shooting accuracy at 3/12/25/40 cells, using the game's exact ShootingAccuracyPawn curve (assumes healthy sight and daylight, ignores cover and weather).
            </div>
            <details style="margin-top:8px; border:1px solid var(--border); border-radius:8px; padding:0; overflow:hidden">
              <summary style="cursor:pointer; padding:8px 12px; font-size:var(--f-xs); font-weight:700; color:var(--accent); background:var(--surface2); user-select:none">Show formulas</summary>
              <div style="padding:10px 12px; font-size:var(--f-xs); color:var(--text3); line-height:1.8; font-family:monospace; background:var(--surface3)">
                <strong style="color:var(--text2)">Ranged DPS</strong><br>
                CycleTime = Warmup + Cooldown + (BurstCount − 1) × BurstTicks ÷ 60<br>
                PaperDPS = (Damage × BurstCount) ÷ CycleTime<br>
                RangeDPS = PaperDPS × Accuracy<br><br>
                <strong style="color:var(--text2)">Melee DPS</strong><br>
                DPS = Damage ÷ Cooldown<br><br>
                <strong style="color:var(--text2)">Armour vs damage</strong><br>
                ArmourAfterAP = max(0, TargetArmour − WeaponAP × 100)  (%)<br>
                n = ArmourAfterAP ÷ 100<br>
                Expected damage multiplier (one game armour roll):<br>
                &nbsp;&nbsp;n ≤ 1 : 1 − 0.75 × n<br>
                &nbsp;&nbsp;1 &lt; n &lt; 2 : (2 − n) ÷ 4<br>
                &nbsp;&nbsp;n ≥ 2 : 0  (always deflected)<br>
                AP itself scales with weapon quality (Awful ×0.9 → Legendary ×1.5).
              </div>
            </details></div>

            <div><strong style="color:var(--text)">Raids</strong><br>
            Estimate raid strength using RimWorld's actual point formula. Input your colony wealth, population, difficulty, and storyteller to see how many raid points the game will throw at you.
            <div style="margin-top:4px; padding-left:12px; border-left:2px solid var(--accent-glow)">
              • <strong>In-Game Date:</strong> Enter your current Quadrum, Day (1-15), and Year. The calendar follows RimWorld's 4 quadrums × 15 days = 60 days/year system starting in 5500.<br>
              • <strong>Colony Wealth:</strong> Auto-filled when you import a save (read straight from its wealth history - the same numbers as the in-game History tab), or enter item/building/creature wealth by hand. Toggle "Use Total" for a single combined value. Building wealth is halved by the game's formula.<br>
              • <strong>Storyteller:</strong> Cassandra (4-6 day window), Randy (2-12 days, ×0.5-1.5 random factor), Phoebe (8-16 days). Add custom storytellers with configurable raid windows and optional random factor.<br>
              • <strong>Raid Window:</strong> Shows the earliest and latest dates the next raid can arrive based on your storyteller's timing.<br>
              • <strong>Adapt Days:</strong> Time since last raid minus time since colony loss, clamped to −60 to 100. Positive values increase threat, negative reduce it.<br>
              • <strong>Point Breakdown:</strong> See Wealth, Pawn, Threat Scale, Starting Factor, and Adapt Factor contributions individually.
            </div>
            <details style="margin-top:8px; border:1px solid var(--border); border-radius:8px; padding:0; overflow:hidden">
              <summary style="cursor:pointer; padding:8px 12px; font-size:var(--f-xs); font-weight:700; color:var(--accent); background:var(--surface2); user-select:none">Show formulas</summary>
              <div style="padding:10px 12px; font-size:var(--f-xs); color:var(--text3); line-height:1.8; font-family:monospace; background:var(--surface3)">
                <strong style="color:var(--text2)">Storyteller Wealth</strong><br>
                = ItemWealth + CreatureWealth + (BuildingWealth × 0.5)<br><br>
                <strong style="color:var(--text2)">Effective Colonists</strong><br>
                = Colonists + (Slaves × 0.75) + (Children × 0.5)<br><br>
                <strong style="color:var(--text2)">Raid Points</strong><br>
                = (WealthPoints + PawnPoints) × ThreatScale × StartingFactor × AdaptFactor<br>
                Clamped to 35 - 10,000<br>
                Randy applies a random ×0.5 - 1.5 after the cap<br><br>
                <strong style="color:var(--text2)">Key Curves (interpolated)</strong><br>
                WealthPoints: 0→0, 14k→0, 400k→2400, 700k→3600, 1M→4200<br>
                PawnPtsEach: 0→15, 10k→15, 400k→140, 1M→200<br>
                StartingFactor: day 0→0.7, 10→0.7, 40→1.0<br>
                AdaptFactor: −30→0.4, 0→0.8, 30→1.0, 60→1.2, 120→1.6
              </div>
            </details></div>

            <div><strong style="color:var(--text)">Apparel Protection Details</strong> <span style="font-size:var(--f-xs); color:var(--text3)">(Armoury reference)</span><br>
            The <strong>Apparel</strong> sub-tab tracks armour and clothing - each item shows sharp/blunt/heat protection, insulation (cold &amp; heat), coverage, and mass, with a side-by-side Direct Comparison and a Weapon AP Simulator.
            <div style="margin-top:4px; padding-left:12px; border-left:2px solid var(--accent-glow)">
              • <strong>Comparison sub-tab:</strong> Build two full kits (A and B) - each is a <strong>weapon</strong> plus apparel by layer (Head → Outer → Middle → Skin → Belt) - and compare them side by side.<br>
              • <strong>Compare covers:</strong> defence (deflect/partial/penetrate vs 0 AP and 20 AP), <strong>weapon DPS</strong>, <strong>move speed</strong>, and <strong>total carried mass</strong> (apparel + weapon). Save loadouts as named presets.<br>
              • <strong>Seed from pawn:</strong> If you've imported a save, pick a colonist to auto-fill a loadout from their actual equipped weapon and worn apparel. Matching is by name against your Armoury/Apparel lists - gear that isn't in those lists (e.g. un-scanned or vanilla items) is reported as unmatched rather than invented.<br>
              • <strong>Quality:</strong> Armour ratings scale with an Armour Factor (Awful ×0.6 → Legendary ×1.8) and insulation with a separate Insulation Factor (Awful ×0.8 → Legendary ×1.8).
            </div>
            <details style="margin-top:8px; border:1px solid var(--border); border-radius:8px; padding:0; overflow:hidden">
              <summary style="cursor:pointer; padding:8px 12px; font-size:var(--f-xs); font-weight:700; color:var(--accent); background:var(--surface2); user-select:none">Show formulas</summary>
              <div style="padding:10px 12px; font-size:var(--f-xs); color:var(--text3); line-height:1.8; font-family:monospace; background:var(--surface3)">
                <strong style="color:var(--text2)">Effective Armour</strong><br>
                ArmourRating = min(2.0, BaseArmour × ArmourFactor)<br>
                EffectiveArmour = max(0, ArmourRating - WeaponAP)<br><br>
                <strong style="color:var(--text2)">Hit Outcomes</strong><br>
                DeflectChance = min(1, EffectiveArmour ÷ 2)<br>
                MitigateChance = min(1, EffectiveArmour) - DeflectChance<br>
                PenetrateChance = 1 − DeflectChance − MitigateChance<br><br>
                <strong style="color:var(--text2)">Insulation</strong><br>
                FinalInsulation = BaseInsulation × InsulationFactor<br><br>
                <strong style="color:var(--text2)">Quality Factors</strong><br>
                Awful: Armour ×0.6, Insulation ×0.8<br>
                Poor: ×0.8 / ×0.9 · Normal: ×1.0 / ×1.0<br>
                Good: ×1.15 / ×1.1 · Excellent: ×1.3 / ×1.2<br>
                Masterwork: ×1.45 / ×1.5 · Legendary: ×1.8 / ×1.8
              </div>
            </details></div>

            <div><strong style="color:var(--text)">Blueprints</strong><br>
            Draw colony layouts on an adaptive grid across three layers: floors, structures, and power conduits. Wires render as connected lines. Use Point mode for single tiles or Box mode for filled rectangles. Left-click draws and right-click erases.
            <div style="margin-top:4px; padding-left:12px; border-left:2px solid var(--accent-glow)">
              • <strong>Tools:</strong> Point, Box, Eraser, Eyedropper (or Alt+Click to pick the tile under the cursor), Grab (pick up and move a placed object), and Cut (lift a boxed region and place it elsewhere). Q and E rotate whatever you are placing, and F (or the Flip button) mirrors a held stamp, cut, or grabbed object horizontally. Right-click or Escape cancels a held cut or object and restores it to its original position.<br>
              • <strong>Keyboard access:</strong> Focus the grid and use the arrow keys to select a tile. Space or Enter uses the active tool, Delete erases, and Escape cancels placement.<br>
              • <strong>Zoom:</strong> Use the zoom slider (50%-200%) to zoom in/out. The canvas scrolls when zoomed in.<br>
              • <strong>Materials &amp; Objects:</strong> Select from colour swatches. Use the + button to add custom materials or objects, and override any building's colour or shape from its swatch.<br>
              • <strong>Backgrounds:</strong> Pick a biome background colour (displayed with actual biome colours) or create custom ones.<br>
              • <strong>Room Tags:</strong> Label rooms (Bedroom, Kitchen, etc.) directly on the canvas.<br>
              • <strong>Stamps:</strong> Select a region to save as a reusable stamp. Floors, wires, furniture grouping, and facing are retained. Place it anywhere on the grid for repeated patterns such as barracks and killboxes. Stamps and cuts snap to the thicker 11-tile gridlines by default; the <strong>Snap to thick gridlines</strong> toggle turns that off so you can place freely, tile by tile.<br>
              • <strong>Bill of Materials:</strong> A live cost tally of every placed building, updated as you draw.<br>
              • <strong>Library &amp; Export:</strong> Save layouts as prefabs, copy or import the grid as JSON, export the canvas as a PNG or JPG image, or <strong>Export Game .xml</strong>, a file the in-game Blueprints mod can load directly (vanilla items only). Grid JSON does not include custom swatch definitions, room tags, or the biome background.<br>
              • <strong>Import RimWorld Blueprints:</strong> Load a Blueprints-mod <code>.xml</code> export up to 16 MB. Multi-cell furniture is placed on its true cells for every facing, matching the game's occupied-rectangle maths, and the importer reads modded tile sizes from your installed mods. Layouts are bounded to 512 by 512 tiles to protect renderer memory.<br>
              • <strong>Furniture rendering:</strong> A multi-cell piece such as a bed or table is outlined as one linked unit rather than separate squares, and shows a single facing arrow (toggleable); hovering highlights the whole object. Overlapping furniture is blocked unless <strong>Force Replace</strong> is enabled, in which case the complete old object is removed before placement.<br>
              • <strong>Undo/Redo:</strong> Up to 200 Blueprint actions, including layout replacement, can be undone with Ctrl+Z and restored with Ctrl+Y while the Blueprint tab is active.
            </div></div>

            <div><strong style="color:var(--text)">Journal</strong><br>
            Two sub-views for tracking your colony's story: <strong>Notes</strong> and <strong>Timeline</strong>. Switch between them with the toggle at the top.
            <div style="margin-top:4px; padding-left:12px; border-left:2px solid var(--accent-glow)">
              • <strong>Notes:</strong> A scratchpad for colony plans, to-do lists, or reminders. Notes can be colour-coded (Slate, Amber, Green, Red, Blue, Purple) and pinned to the top. Each note has a title and body, all changes auto-save.<br>
              • <strong>Timeline:</strong> A chronological event log for your colony. Record and edit events by Quadrum, Day, and Year with categories (Raid, Recruit, Death, Build, Milestone, Trade, Custom). New events use the imported colony date when available. Filter by category, and events are sorted newest-first. Importing from a save file auto-logs an entry.
            </div></div>

            <div><strong style="color:var(--text)">Skills Web</strong><br>
            A high-level dashboard showing essential work coverage, average skills and labour bottlenecks.
            <div style="margin-top:4px; padding-left:12px; border-left:2px solid var(--accent-glow)">
              • <strong>Colony Skill Radar:</strong> Each spoke shows a colony average from 0-20. Hover an axis to highlight it, or open <strong>Skill details and evidence</strong> with the mouse, touch or keyboard for full skill names, averages and incomplete-evidence notes. Where exact skill evidence is unavailable, legacy-compatible values are shown and labelled.<br>
              • <strong>Survival Index:</strong> A planning indicator, not a survival prediction. Essential work coverage, specialist roles, trait break thresholds and planned ideology mood affect the score. It cannot exceed the percentage of essential jobs covered, including important custom jobs. The covered-job count and explanation distinguish missing assignments from assignments to blocked or currently unavailable pawns. Incomplete capability evidence remains provisional; unknown is not treated as blocked.<br>
              • <strong>Labour Bottlenecks:</strong> Missing eligible workers are always flagged. In Manual mode, important jobs without a Priority-1 worker and competing high-priority assignments can also trigger warnings. In Simple mode, any enabled job counts as assigned and numeric-priority warnings are omitted. Coverage does not guarantee sufficient labour or round-the-clock staffing.
            </div></div>

            <div><strong style="color:var(--text)">Ideology</strong><br>
            Plan your colony's belief system before committing in-game. Choose Fixed (all memes upfront) or Fluid (start with 1, reform later). Pick 1 Structure plus up to 3 Memes, configure Precepts, plan Specialist Roles, and pick Rituals. Use the arrow buttons to collapse or expand the Memes, Precepts and Rituals sections while planning.
            <div style="margin-top:4px; padding-left:12px; border-left:2px solid var(--accent-glow)">
              • <strong>Structure:</strong> The 5 framing belief systems (Theist Embodied, Theist Abstract, Animist, Archist, Ideological). Exactly one per ideoligion, as in the game, selecting another swaps it.<br>
              • <strong>Memes:</strong> All 27 game memes (Ideology, Biotech, Anomaly and Odyssey) with conflict detection, impact ratings matching the game files, and a 3-meme cap matching in-game creation. Each meme provides passive bonuses and unlocks specialist roles.<br>
              • <strong>Precepts:</strong> 37 configurable precept groups across Violence, Social, Food, Lifestyle, Death, and Work categories. Choices that stop being valid when you change memes show as Not Set and stop counting in the totals. Valid meme-forced choices are locked and included in both the displayed and calculated totals. Where a meme permits several required choices, the dropdown remains editable within those choices.<br>
              • <strong>Specialist Roles:</strong> Unlocked by selected memes (up to 2 types per ideology). Shows which specialists are available based on your meme picks. <em>Reference only.</em><br>
              • <strong>Rituals:</strong> 12 ritual types to plan (Dance Party, Drum Party, Scarification, etc.). Shows mood and work speed effects. <em>Reference only.</em><br>
              • <strong>Colony Impact:</strong> A live summary using the same meme and effective-precept calculation as the engine. These are planning estimates, not a simulation of every conditional in-game thought or mod effect. They feed the existing viability, legacy skill and work-speed calculations.<br>
              • <strong>Fluid vs Fixed:</strong> Fluid ideologies start with 1 meme and gain development points (10 for first reform, +2 each after) from conversions and rituals.<br>
              • <strong>Save File Ideologies:</strong> After importing a .rws save, the browser lists its ideologies, including names, deities, memes, roles and precepts. Your colony's pill follows the player faction's exact primary-ideology reference. Loading it replaces the previous plan, including old precepts, rituals and narrative. Supported choices match by exact game definition, not translated or customised labels. <strong>Imported precepts not modelled</strong> preserves unsupported choices separately without adding guessed effects. Refresh updates the saved-ideology browser and pill; use the pill to replace a plan you have been editing.<br>
              • <strong>Scan Ideology Mods:</strong> Scans your install and mod folder for exact ideology <em>role definitions</em>, modded <em>memes</em> (including modded structures, which keep the pick-one rule, with conflicts read from their exclusion tags and impact from the def), and modded <em>rituals</em>. Roles feed imported pawn capability checks, while memes and rituals are added to the planner with a Mod tag. Only definitions from the save's active mods and current game-version folder are used. Cache-backed, so repeat scans are fast.
            </div></div>

            <div><strong style="color:var(--text)">Relations</strong><br>
            An interactive physics-based relationship graph showing your colony's social web. Nodes represent pawns and colour-coded lines show their relationships (romance, blood, ex, manual). The graph auto-arranges using force-directed simulation.
            <div style="margin-top:4px; padding-left:12px; border-left:2px solid var(--accent-glow)">
              • <strong>Graph Controls:</strong> Drag nodes to reposition, scroll to zoom, double-click to pin a node in place. Click a node to select it and see its details in the Social Intel panel.<br>
              • <strong>Social Intel Panel:</strong> A floating, draggable drawer with collapsible sections. Drag the header bar to reposition it anywhere over the canvas. Click the reset button to snap it back to its default position.<br>
              • <strong>Romance Compatibility:</strong> Estimates romantic potential between all pawn pairs based on sexuality genes (Biotech DLC), age gap preference, beauty, and family relation blocking. Mirrors RimWorld's SecondaryLovinChanceFactor.<br>
              • <strong>Fight Risk:</strong> Estimates social fight chance from base interaction odds, opinion modifiers (scales up to 4x at -100 opinion), and trait multipliers (Brawler 4x, Bloodlust 2x, Abrasive 2x, Kind near-zero).<br>
              • <strong>Estimated Opinions:</strong> When a pawn is selected, shows estimated opinion toward every other colonist based on relation offsets and trait-based situational effects (beauty, annoying voice, creepy breathing, etc.).<br>
              • <strong>Manual Relations:</strong> Click "+ Add Relation" to manually define a relationship between any two pawns. Manual relations appear on the graph but do not modify your save file.<br>
              • <strong>Off-map Relatives:</strong> Relatives who live elsewhere on the world (other settlements, caravans, exiled colonists) appear as smaller, hollow, dashed "ghost" nodes with dashed relation lines and a role label (Mother, Father, etc.). They show up automatically when a colonist references them. The legend marks them as <em>Off-map</em>. You can promote any of them into full pawn cards during save import (see below).<br>
              • <strong>Save Import:</strong> Relations are automatically extracted from .rws save files. Each pawn's directRelations block is parsed for Spouse, Lover, Parent, Child, Sibling, and all other vanilla relation types.
            </div></div>

            <div><strong style="color:var(--text)">Records</strong><br>
            A per-colonist table of lifetime records pulled from an imported save - kills, enemies downed, damage dealt/taken, mental breaks, and work tallies. Hover any column header for what it means.
            <div style="margin-top:4px; padding-left:12px; border-left:2px solid var(--accent-glow)">
              • <strong>Import-only:</strong> Records exist only inside a RimWorld save, so the tab shows a prompt until you click <strong>Import Game Save</strong> in the sidebar. Manually-built colonies won't have records.<br>
              • <strong>What's shown:</strong> Combat (kills, downs, shots, damage), medical (operations, tends), social (prisoners recruited), and labour tallies (animals tamed, meals cooked, things crafted/hauled, cells mined, plants harvested, messes cleaned, research points, corpses buried). Columns with no data across the colony are hidden automatically.<br>
              • <strong>Accuracy:</strong> Records are stored in the save as an unlabelled, ordered list. RimJobs maps the verified vanilla range (validated against real save data), so the values shown are reliable. Time-based and DLC records, whose ordering can't be confirmed, are intentionally left out rather than risk mislabelling.
            </div></div>

            <div><strong style="color:var(--text)">Work Planner</strong><br>
            Found in the Priorities tab. Click <strong>Work Planner</strong> to analyse your colony's current job assignments and flag problems:
            <div style="margin-top:4px; padding-left:12px; border-left:2px solid var(--accent-glow)">
              • <strong>Critical Gaps:</strong> Jobs with no capable pawn assigned at all.<br>
              • <strong>Warnings:</strong> Important jobs with no Priority-1 assignee, or the assigned pawn's skill is below 4.<br>
              • <strong>Single Points of Failure:</strong> Critical jobs where only one pawn is assigned. One injury could cripple a workflow.<br>
              • <strong>Recommendations:</strong> Suggests pawns that would be a good fit for understaffed jobs based on skill and passion scores. One-click apply for individual suggestions or apply all at once.
              • <strong>Focused Recommendations:</strong> When Colony Focus is active, suitable focus recommendations are labelled with the focus name and strength. Hard eligibility and sole-worker protection still apply.
            </div></div>

            <div><strong style="color:var(--text)">Save File Import (.rws)</strong><br>
            Import colonists directly from a RimWorld save file. Click <strong>Import Game Save</strong> in the sidebar pawn actions.
            <div style="margin-top:4px; padding-left:12px; border-left:2px solid var(--accent-glow)">
              • <strong>File Picker:</strong> Opens a native dialog defaulting to your RimWorld Saves folder.<br>
              • <strong>Preview:</strong> Shows colony metadata (name, storyteller, in-game date, version, plus the world's name and generation seed) and a list of all found colonist pawns with their top skills, passions, traits, xenotype, backstories, and age. After import, the world name and seed appear under the clock in the sidebar, click that line to copy the seed.<br>
              • <strong>Selective Import:</strong> Check or uncheck individual pawns. Use Select All to toggle the full list.<br>
              • <strong>Import Again:</strong> When pawns already exist, <strong>Add</strong> merges selected pawns and skips duplicates. <strong>Replace Imported Save</strong> rebuilds the current pawn list from the selected save pawns. Use the circular <strong>Refresh Save</strong> button instead when you want to update the existing cards while preserving app-only fields.<br>
              • <strong>Names and Order:</strong> The preview and app use RimWorld's computed short pawn names, including its deterministic first-or-last fallback when no nickname is stored. Imported pawns are ranked by RimWorld's colonist-bar display order, with the pawn ID used to resolve ties.<br>
              • <strong>Off-map Relatives:</strong> If your chosen colonists reference relatives who live elsewhere on the world, a second optional step appears after the pawn list. It shows each off-map relative with their relation to your colonists (e.g. "Mother of Alice"), plus their top skills and traits pulled from the save's world pawns. Tick any you want to bring in as full pawn cards, or click <strong>Skip relatives</strong> to import colonists only. Imported relatives become normal pawns and turn into solid nodes on the Relations graph.<br>
              • <strong>Auto-Create:</strong> Unknown xenotypes, traits, and backstories from modded saves are automatically added as custom entries so nothing is lost.<br>
              • <strong>Health Import:</strong> Pawn health conditions (missing parts, prosthetics, implants, injuries, chronic conditions) are imported and displayed as colour-coded chips. Body part indices from the save are resolved to readable names (e.g. index 17 → "right eye").<br>
              • <strong>Mod Label Resolution:</strong> On first import, RimJobs scans your RimWorld install (Data, Mods, and Steam Workshop folders) to build a defName-to-label map. This translates internal IDs like <code>EPIA_TacticalBionicEye</code> into human-readable names. The scan is cached for the session and the install path is remembered.<br>
              • <strong>Refresh Save:</strong> After importing, a circular refresh button appears next to Import Game Save. Save your game in RimWorld, then click refresh to re-read and re-parse updated skills, names, order, ideology roles, new injuries, recruited pawns, and other changes without re-picking the file. Existing pawns are matched by their save ID and updated in-place. New pawns are added, missing pawns trigger a remove-or-keep prompt, and roles explicitly changed in RimJobs, custom traits, and mood presets are preserved.
            </div></div>

            <div><strong style="color:var(--text)">Edit and Export Back to Your Save (.rws)</strong><br>
            After importing a save, an <strong>Export</strong> (&#128228;) button appears next to Import Game Save. Edit colonists in RimJobs, then export a NEW <code>.rws</code> you can load straight back into RimWorld.
            <div style="margin-top:4px; padding-left:12px; border-left:2px solid var(--accent-glow)">
              • <strong>Skills and passions:</strong> Set any colonist's skill levels (0 to 20) in the Pawn Manager. Click a skill's passion to open a picker with the vanilla tiers (none, minor, major) plus every modded passion from your install, for example Alpha Skills or Vanilla Skills Expanded passions like Competitive or Frozen. Modded passions show their own star icon on the card, and one you do not change is written back exactly.<br>
              • <strong>Traits:</strong> On each pawn's Traits section click <strong>&#9998; Edit</strong> to open the trait editor. Remove current traits or add any vanilla or modded trait from the catalogue. Conflicting traits are greyed out and blocked (matching RimWorld's own rules), and there is no trait limit.<br>
              • <strong>Health:</strong> On each pawn's Health section click <strong>&#9998; Edit</strong> to remove injuries, scars, missing parts, implants or diseases, or add new conditions: pick the condition first, then choose the body part and severity. For a prosthetic or implant the part list is narrowed to the limb it fits (e.g. a mutant arm only offers the arm parts), so it can't be placed on the wrong spot. Modded (non-human) races are handled too: their real body def is preserved on export, part names are shown honestly as indices, and you add whole-body conditions or enter a specific part index. Quick pills: <strong>Heal all</strong> (clears injuries and conditions but keeps prosthetics) and <strong>Remove scars</strong>.<br>
              • <strong>Relationships:</strong> On each pawn's Relationships section click <strong>&#9998; Edit</strong> to add or remove relationships (lover, spouse, parent, and any modded relation type) with other imported colonists. RimWorld rebuilds the reverse side on load. Only real relation types can be written, app-only custom titles are never exported.<br>
              • <strong>Ideology certainty:</strong> Pawns with an ideoligion get a 0 to 100% certainty slider in the Pawn Manager. Drag it and it is written on export.<br>
              • <strong>Catalogues:</strong> The trait, health-condition, relation, passion, and ideology-role definitions (vanilla plus everything from your installed mods) are built when you click <strong>Scan Mods</strong> at the top of the Pawn Manager (or <strong>Scan Game/Mod Folder</strong> in the Trait Manager). Do that once so modded content appears in the editors and exact role restrictions are available. Scans are cached, so the next one skips files that have not changed and finishes much faster. Even with no scan, any modded passion already on your imported pawns still shows and stays pickable.<br>
              • <strong>Mod-not-in-save warning:</strong> RimJobs reads your save's active modlist and remembers which mod each scanned trait, condition, relation and passion came from. If you assign content from a mod that is not active in this save, the editor flags it (&#9888; mod not in save) so you do not write a def the game cannot load. Content already on your pawns, or from mods in the save, never warns.<br>
              • <strong>Safe by design:</strong> Export always writes a NEW file (<code>yoursave_rimjobs.rws</code>) and never touches your original. Only the values you actually change are written, so the rest of the save, including all modded data, is left exactly as it was. A structure check aborts the export rather than write a broken file.<br>
              • <strong>What it does not do:</strong> Only colonists imported from that save can be written back (pawns created from scratch in RimJobs are skipped). Value edits do not trigger mod features that fire on in-game events, for example Vanilla Skills Expanded only offers an expertise pick when a pawn levels up, so jumping a skill to a high level will not pop that prompt.
            </div></div>

            <div><strong style="color:var(--text)">Share and Import Pawns</strong><br>
            Use a pawn's <strong>Share</strong> button to copy that one pawn, or <strong>Share All</strong> at the top of the Pawn Manager to copy your whole colony, to the clipboard. Click the <strong>Import</strong> button in the sidebar to paste them back in (it imports one shared pawn or every pawn from a Share All, up to the pawn cap). Import also understands two raw formats:
            <div style="margin-top:4px; padding-left:12px; border-left:2px solid var(--accent-glow)">
              • <strong>XML:</strong> Paste a pawn's XML snippet (from save files or wiki). Skill levels, passions, and names are auto-detected.<br>
              • <strong>Plain Text:</strong> Paste skill lines like "Shooting: 12" or "Melee 8 (Major)". Each skill and passion is parsed automatically.
            </div></div>

            <div><strong style="color:var(--text)">Mod Awareness</strong><br>
            Tag any custom content with its source mod. Mod badges appear on all list views so you can tell vanilla from modded at a glance.
            <div style="margin-top:4px; padding-left:12px; border-left:2px solid var(--accent-glow)">
              • <strong>Mod Source Field:</strong> Available on all 8 custom content editors: xenotypes, traits, weapons, apparel, materials, buildings, biomes, and custom jobs.<br>
              • <strong>Badges:</strong> Small coloured tags on list items showing which mod they came from.<br>
              • <strong>Hide Modded Content:</strong> Toggle in Settings to filter out all mod-tagged content across the app, useful for planning a vanilla run.
            </div></div>

            <div><strong style="color:var(--text)">Settings</strong><br>
            Customise the interface and manage all custom content. All settings are saved automatically.
            <div style="margin-top:4px; padding-left:12px; border-left:2px solid var(--accent-glow)">
              • <strong>General:</strong> Light/dark theme, font scaling, an app-wide colour-blind friendly palette, and an optional OpenDyslexic typeface. The palette replaces red-green semantic contrasts with blue-orange colours while priority numbers, schedule markers, relation line patterns, icons, and text preserve meaning without colour alone. The font option replaces regular, bold, italic, and bold-italic text throughout the app and works independently with every theme and palette combination.<br>
              • <strong>Behaviour:</strong> Startup window mode, minimise-to-tray, tooltips, deletion confirmation, item limits, and "Pre-load mod data in the background". Background scans pause during save import and may be skipped when available memory is below 4 GiB. A manual Scan Mods still works when you request it.<br>
              • <strong>Priorities Input:</strong> Configure click direction, wheel direction, wheel on/off, and priority wrapping. The numbered range itself lives on the Priorities toolbar.<br>
              • <strong>Typography:</strong> Override heading, body, and mono font sizes independently.<br>
              • <strong>Tab Visibility:</strong> Hide tabs you don't use. Settings, Manual, and Legal are always visible.<br>
              • <strong>Modded Jobs:</strong> Add modded work types and assign them to skill categories.<br>
              • <strong>Mod Awareness:</strong> See active mod sources and toggle hiding modded content globally.<br>
              • <strong>Data:</strong> Export/import your full colony data as JSON for backup or sharing. Large colonies are stored in <code>%APPDATA%\RimJobs\rimjobs-state.json</code> with a rotated <code>rimjobs-state.backup.json</code> backup. The save-location pill can point automatic saves at a file you choose.
            </div></div>

            <div><strong style="color:var(--text)">Troubleshooting &amp; Crash Reports</strong><br>
            RimJobs records bounded local diagnostics so an unexpected close can be investigated without collecting your save contents.
            <div style="margin-top:4px; padding-left:12px; border-left:2px solid var(--accent-glow)">
              • <strong>After a crash:</strong> Restart the app and retry once. If it fails again, include <code>%APPDATA%\RimJobs\crash-report.ndjson</code> with the bug report and describe the last button you pressed.<br>
              • <strong>Privacy:</strong> The crash report contains phase names, counts, timings, process reasons, and memory figures. Save XML, clipboard contents, selected filenames, and file paths are excluded or redacted.<br>
              • <strong>Bounded size:</strong> The report is trimmed before it exceeds 256 KiB, so leave it in place between retries when reproducing a crash.<br>
              • <strong>Recovery:</strong> Ordinary renderer crashes show a Reload option and the diagnostic path. If repeated graphics-process failures lead to an out-of-memory crash, RimJobs records that pattern and starts with software rendering on the next launch. Recovery uses an opaque window with the opacity slider disabled to avoid transparent-window presentation failures. The crash dialog also offers <strong>Restart Safely</strong> for an immediate software-rendering restart. Automatic state has the backup file listed in Settings above.<br>
              • <strong>Retrying hardware acceleration:</strong> Software-rendering recovery remains active to prevent a crash loop. To retry hardware acceleration later, close RimJobs and delete <code>%APPDATA%\RimJobs\.gpu-safe-mode.json</code>.
            </div></div>

            <div><strong style="color:var(--text)">Planning Formulas &amp; Limits</strong><br>
            RimJobs uses a mix of audited game rules and planning projections. The formulas below describe its numeric planner projections. Capability checks preserve an unknown result when save or mod data is incomplete rather than inventing certainty.
            <details style="margin-top:8px; border:1px solid var(--border); border-radius:8px; padding:0; overflow:hidden">
              <summary style="cursor:pointer; padding:8px 12px; font-size:var(--f-xs); font-weight:700; color:var(--accent); background:var(--surface2); user-select:none">Show formulas</summary>
              <div style="padding:10px 12px; font-size:var(--f-xs); color:var(--text3); line-height:1.8; font-family:monospace; background:var(--surface3)">
                <strong style="color:var(--text2)">Effective Skill (per skill, per pawn)</strong><br>
                = clamp(0, 20, Base + XenoMod + GeneMod + TraitMod + BackstoryMod + RoleMod + IdeoMod)<br>
                &nbsp; Base: manual 0-20 value<br>
                &nbsp; XenoMod: xenotype skill modifier<br>
                &nbsp; GeneMod: sum of all gene skill offsets on the xenotype<br>
                &nbsp; TraitMod: sum of all trait skill modifiers<br>
                &nbsp; BackstoryMod: childhood + adulthood skill bonuses<br>
                &nbsp; RoleMod: specialist role skill bonus<br>
                &nbsp; IdeoMod: ideology effects (combat, social, research)<br><br>

                <strong style="color:var(--text2)">Incapable Of (work type blocked if ANY source restricts it)</strong><br>
                Sources: Manual toggles ∪ Xenotype ∪ Gene incapabilities ∪ Role ∪ Backstory workDisables<br>
                All sources are merged (union). A single source blocking a work type is sufficient.<br><br>

                <strong style="color:var(--text2)">Work Speed Global (multiplier shown as % in pawn header)</strong><br>
                = 1.0 + TraitWorkSpeed + GeneWorkSpeed + RoleWorkSpeed + IdeoWorkSpeed + PreceptWorkDrive<br>
                &nbsp; Each source is additive (e.g. +0.35 = +35%)<br><br>

                <strong style="color:var(--text2)">Real Job Work Speed</strong><br>
                Skill-based jobs: (BaseValue + BonusPerLevel × EffectiveSkill) × WorkSpeedGlobal<br>
                Non-skill jobs (hauling, cleaning): 1.0 × WorkSpeedGlobal<br>
                Cooking: uses a postProcessCurve approximation: (0.4 + raw/20 × 1.2) × WorkSpeedGlobal<br><br>

                <strong style="color:var(--text2)">Survival Index</strong><br>
                Base 50 − 10 per uncovered critical job + 4 per specialist − avg break threshold × 100 + ideology mood × 2<br>
                Clamped to 0-100
              </div>
            </details></div>

            <div><strong style="color:var(--text)">Overlay Controls</strong><br>
            The titlebar provides window controls for the Electron overlay.
            <div style="margin-top:4px; padding-left:12px; border-left:2px solid var(--accent-glow)">
              • <strong>Opacity Slider:</strong> Adjust window transparency (30%-100%). Enable <strong>Lock window transparency</strong> in Settings to preserve the chosen level and disable accidental slider changes across launches.<br>
              • <strong>Widget/Full Toggle:</strong> Smooth animated transition between compact widget and full-size mode. Works from any state including collapsed.<br>
              • <strong>Pin:</strong> Lock the window position so it can't be accidentally moved.<br>
              • <strong>Collapse:</strong> Shrink to a slim titlebar. Drag it anywhere, then expand to resume.<br>
              • <strong>Snap:</strong> Use the ◣ / ◢ buttons to snap to the left or right half of your screen.<br>
              • <strong>F12:</strong> Global hotkey to show/hide the overlay.<br>
              • <strong>System Tray:</strong> Right-click the tray icon for Open/Close options.
            </div></div>

            <div style="margin-top:${bodyGap}; padding:12px 16px; background:var(--surface2); border-radius:8px; border-left:4px solid var(--accent)">
              <strong style="color:var(--accent)">Accuracy:</strong>
              <span style="color:var(--text3)">All stats, formulas, and calculations are based on RimWorld's game data at the time this tool was built. They may drift after game updates, and major gameplay patches and DLC/expansions were not all accounted for - some newer mechanics may be missing or modelled approximately. Large overhaul mods (for example Combat Extended) and any content that changes stats via XML patches or C# code can read inaccurately or not at all, since this tool only reads static files. Treat all numbers as planning estimates and always verify critical decisions in-game.</span>
            </div>

          </div>
        </div>
        </div>
      </div>
    `;

    // Build the contents drawer from the manual headings. Each top-level section
    // div starts with a <strong style="...var(--text)..."> title; assign it an
    // id and a matching drawer item that smooth-scrolls to it.
    const scroller = c.querySelector('#helpScroll');
    const body = c.querySelector('.help-body');
    const nav = c.querySelector('#helpNav');
    const sections = [];
    if (body && nav) {
      // The introduction and always-visible sidebar tools come first. Everything
      // after that follows the main tabs from left to right, with sub-features
      // directly beneath their owning tab. Reference material comes last.
      const ORDER = [
        // Introduction and sidebar
        'Quick Start', 'Pawn Cards', 'Save File Import', 'Edit and Export', 'Share and Import',
        'Xenotype', 'Custom Traits',
        // Priorities tab
        'Priorities', 'Work Planner',
        // Remaining main tabs and Armoury sub-reference
        'Shift Planner', 'Armoury', 'Apparel Protection', 'Blueprints', 'Journal', 'Skills Web',
        'Ideology', 'Relations', 'Records', 'Raids',
        // Settings & Misc. tab
        'Settings', 'Mod Awareness',
        // General reference
        'Overlay Controls', 'Troubleshooting', 'Planning Formulas',
      ];
      const rank = (div) => {
        const strong = div.querySelector(':scope > strong');
        const title = strong ? strong.textContent.trim() : '';
        const i = ORDER.findIndex(o => title.indexOf(o) === 0);
        return i === -1 ? ORDER.length + 1 : i;
      };
      [...body.children]
        .sort((a, b) => rank(a) - rank(b))
        .forEach(div => body.appendChild(div)); // reattach in new order

      const items = [];
      let idx = 0;
      [...body.children].forEach(div => {
        const strong = div.querySelector(':scope > strong');
        if (!strong) return;
        const style = strong.getAttribute('style') || '';
        if (!style.includes('var(--text)')) return; // skip the disclaimer block
        const title = strong.textContent.trim();
        if (!title) return;
        const id = 'help-sec-' + (idx++);
        div.id = id;
        div.style.scrollMarginTop = '12px';
        sections.push({ id, title });
        items.push(`<button class="help-drawer-item" id="${id}-nav" onclick="App._helpJumpTo('${id}')">${_escapeHtml(title)}</button>`);
      });
      nav.innerHTML = '<div class="help-drawer-title">Contents</div>' + items.join('');
    }

    // Scrollspy: highlight the drawer item for the section currently in view.
    // Works in both window mode (the #helpScroll element scrolls) and widget
    // mode (the outer .main scrolls) by detecting the real scroll owner. The
    // listener lives on the freshly-rendered element so it's GC'd on re-render.
    if (scroller && sections.length) {
      this._helpSections = sections; // so _helpJumpTo can pin the clicked item
      let scrollOwner = scroller;
      if (scroller.scrollHeight <= scroller.clientHeight + 2) {
        let p = scroller.parentElement;
        while (p && p !== document.body) {
          const oy = getComputedStyle(p).overflowY;
          if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 2) { scrollOwner = p; break; }
          p = p.parentElement;
        }
      }
      // Forward wheel events over the contents drawer to the manual scroller, so
      // hovering the scrollspy scrolls the manual itself instead of doing nothing
      // (the short contents list rarely overflows) or only nudging that list.
      if (nav) {
        nav.addEventListener('wheel', (e) => {
          this._helpJumpLocked = false; // user scrolling releases the click-pin
          scrollOwner.scrollTop += e.deltaY;
          e.preventDefault();
        }, { passive: false });
      }
      let ticking = false;
      const update = () => {
        ticking = false;
        if (this._helpJumpLocked) return; // a clicked nav item stays pinned until the user scrolls
        const scTop = scrollOwner.getBoundingClientRect().top;
        const ch = scrollOwner.clientHeight;
        const maxScroll = scrollOwner.scrollHeight - ch;
        // Sweep the reference line from near the top (60px) at the top of the
        // scroll down to the very bottom as you reach max scroll. This lets the
        // short trailing sections (Settings, Formulas, Overlay) each become
        // active in turn instead of jumping straight to the last one.
        const f = maxScroll > 0 ? Math.min(1, Math.max(0, scrollOwner.scrollTop / maxScroll)) : 1;
        const vpRef = 60 + f * Math.max(0, ch - 60);
        let activeId = sections[0].id;
        for (const s of sections) {
          const el = document.getElementById(s.id);
          if (!el) continue;
          if (el.getBoundingClientRect().top - scTop <= vpRef) activeId = s.id;
          else break;
        }
        if (activeId !== this._helpActiveSection) {
          this._helpActiveSection = activeId;
          sections.forEach(s => {
            const item = document.getElementById(s.id + '-nav');
            if (item) item.classList.toggle('active', s.id === activeId);
          });
          const activeItem = document.getElementById(activeId + '-nav');
          if (activeItem && nav) {
            const target = activeItem.offsetTop - nav.clientHeight / 2 + activeItem.offsetHeight / 2;
            nav.scrollTo({ top: target, behavior: 'smooth' });
          }
        }
      };
      this._helpActiveSection = null;
      // A real user scroll (wheel/touch) releases the click-pin so the scrollspy resumes.
      const releaseJump = () => { this._helpJumpLocked = false; };
      scrollOwner.addEventListener('wheel', releaseJump, { passive: true });
      scrollOwner.addEventListener('touchmove', releaseJump, { passive: true });
      scrollOwner.addEventListener('scroll', () => {
        if (!ticking) { ticking = true; requestAnimationFrame(update); }
      });
      update(); // set initial active item
    }
  },

  _helpJumpTo(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Pin the highlight to the clicked section. The scrollspy reference line sweeps
    // toward the bottom near max-scroll, so jumping to a short section near the end
    // would otherwise light a later one (e.g. Settings). Hold until the user scrolls.
    this._helpJumpLocked = true;
    this._helpActiveSection = id;
    (this._helpSections || []).forEach(s => {
      const item = document.getElementById(s.id + '-nav');
      if (item) item.classList.toggle('active', s.id === id);
    });
    // In widget mode the drawer is an overlay - close it after picking a section.
    if (this._isWidgetMode()) {
      const layout = document.getElementById('helpLayout');
      if (layout) layout.classList.remove('help-drawer-open');
    }
  },

  _helpToggleNav() {
    const layout = document.getElementById('helpLayout');
    if (layout) layout.classList.toggle('help-drawer-open');
  },

  // -- RECORDS TAB (import-gated) --
  renderRecords() {
    const c = document.getElementById('view-records');
    if (!c) return;
    const pawns = (this.state.pawns || []).filter(p => p.records);
    const defMap = {};
    (typeof RECORD_DEFS !== 'undefined' ? RECORD_DEFS : []).forEach(r => { defMap[r.def] = r; });
    const featured = (typeof RECORD_FEATURED !== 'undefined' ? RECORD_FEATURED : []);
    const fmt = (def, v) => {
      const t = defMap[def];
      if (t && t.type === 'Float') return (v || 0).toFixed(1);
      return Math.round(v || 0).toLocaleString();
    };

    if (!pawns.length) {
      c.innerHTML = `
        <div style="flex:1; display:flex; align-items:center; justify-content:center; padding:40px">
          <div style="text-align:center; max-width:440px; color:var(--text3)">
            <div style="font-size:calc(var(--f-base)*2.2); margin-bottom:12px">▦</div>
            <h2 class="section-title" style="font-size:var(--f-base)">Colony Records</h2>
            <p style="font-size:var(--f-sm); line-height:1.6; margin-top:8px">Lifetime pawn records - kills, enemies downed, damage dealt/taken, mental breaks, and work tallies - come straight from a RimWorld save.</p>
            <p style="font-size:var(--f-sm); margin-top:10px">Use the <strong style="color:var(--text2)">.rws import</strong> button in the sidebar to populate this tab.</p>
          </div>
        </div>`;
      return;
    }

    const catMap = (typeof RECORD_CATEGORY !== 'undefined' ? RECORD_CATEGORY : {});
    const wasSearchFocused = document.activeElement && document.activeElement.id === 'recordsSearch';

    // Columns with data anywhere (keeps it tidy), then category-filtered.
    const dataCols = featured.filter(def => pawns.some(p => (p.records[def] || 0) !== 0));
    const baseCols = dataCols.length ? dataCols : featured;
    const cat = this._recordsCat || 'all';
    let showCols = cat === 'all' ? baseCols : baseCols.filter(def => (catMap[def] || 'Other') === cat);
    if (!showCols.length) showCols = baseCols;

    // Category pills (only categories that actually have columns).
    const cats = ['all', ...[...new Set(baseCols.map(def => catMap[def] || 'Other'))]];
    const pills = cats.map(ct => {
      const active = cat === ct;
      const label = ct === 'all' ? 'All' : ct;
      return `<button class="btn btn-sm" style="font-size:var(--f-xs); ${active ? 'background:var(--accent); color:var(--bg)' : ''}" onclick="App.setRecordsCat('${ct}')">${label}</button>`;
    }).join('');

    // Pawn search filter.
    const search = (this._recordsSearch || '').toLowerCase();
    let pawnsList = search ? pawns.filter(p => _pawnDisplayName(p, '').toLowerCase().includes(search)) : pawns.slice();

    // Sorting.
    const sort = this._recordsSort;
    if (sort) {
      pawnsList.sort((a, b) => {
        if (sort.field === 'name') {
          const r = _pawnDisplayName(a, '').localeCompare(_pawnDisplayName(b, ''));
          return sort.dir === 'asc' ? r : -r;
        }
        const av = a.records[sort.field] || 0, bv = b.records[sort.field] || 0;
        return sort.dir === 'asc' ? av - bv : bv - av;
      });
    }
    const arrow = (field) => sort && sort.field === field ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';

    // Move the actively-sorted record column to the front (right after the name column),
    // so the column you sorted by jumps next to the names instead of staying buried. If it
    // was filtered out (category/no-data), surface it anyway since you chose to sort by it.
    if (sort && sort.field && sort.field !== 'name' && defMap[sort.field]) {
      showCols = [sort.field, ...showCols.filter(def => def !== sort.field)];
    }

    const head = showCols.map(def => {
      const t = defMap[def];
      const lbl = (t && t.label) || def;
      return `<th style="cursor:pointer" onclick="App.sortRecords('${def}')">${_escapeHtml(lbl)}${arrow(def)}</th>`;
    }).join('');
    // Per-column extremes (across the currently filtered pawns) for the
    // highest/lowest highlight. Lowest uses the smallest NON-zero value so the
    // sea of 0s doesn't all count as "lowest".
    const hl = !!this._recordsHighlight;
    const colStats = {};
    if (hl) {
      showCols.forEach(def => {
        const vals = pawnsList.map(p => p.records[def] || 0);
        const nz = vals.filter(v => v !== 0);
        colStats[def] = {
          max: nz.length ? Math.max(...nz) : null,
          min: nz.length ? Math.min(...nz) : null,
        };
      });
    }
    const rows = pawnsList.map(p => {
      const cells = showCols.map(def => {
        const v = p.records[def] || 0;
        let cls = v ? '' : 'records-zero';
        if (hl && v !== 0) {
          const s = colStats[def];
          if (s && v === s.max) cls += ' records-high';
          else if (s && s.min !== null && v === s.min) cls += ' records-low';
        }
        return `<td class="${cls.trim()}">${v ? fmt(def, v) : '<span style="opacity:0.4">-</span>'}</td>`;
      }).join('');
      return `<tr><td>${_escapeHtml(_pawnDisplayName(p, '?'))}</td>${cells}</tr>`;
    }).join('');

    c.innerHTML = `
      <div class="view-header"><div class="view-header-content">
        <h2 class="view-title">Colony Records</h2>
        <p class="view-subtitle">Lifetime tallies per colonist, imported from your save.</p>
      </div></div>
      <div style="display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-bottom:var(--gap-sm)">
        ${pills}
        ${(() => {
          const presets = [
            ['name|asc', 'Colonist (A to Z)'],
            ['Kills|desc', 'Most kills'],
            ['PawnsDowned|desc', 'Most enemies downed'],
            ['DamageDealt|desc', 'Most damage dealt'],
            ['DamageTaken|desc', 'Most damage taken'],
            ['TimesInMentalState|desc', 'Most mental breaks'],
            ['AnimalsTamed|desc', 'Most animals tamed'],
            ['OperationsPerformed|desc', 'Most surgeries performed'],
            ['CellsMined|desc', 'Most cells mined'],
            ['ResearchPointsResearched|desc', 'Most research points'],
            ['ThingsCrafted|desc', 'Most things crafted'],
            ['PrisonersRecruited|desc', 'Most prisoners recruited'],
          ];
          const cur = this._recordsSort ? `${this._recordsSort.field}|${this._recordsSort.dir}` : 'name|asc';
          const known = presets.some(o => o[0] === cur);
          return `<select class="skill-input" onchange="App.sortRecordsPreset(this.value)" title="Reorder the table by a record" style="font-size:var(--f-xs); margin-left:auto">${presets.map(o => `<option value="${o[0]}" ${o[0] === cur ? 'selected' : ''}>${o[1]}</option>`).join('')}${known ? '' : `<option value="${cur}" selected>Custom (column sort)</option>`}</select>`;
        })()}
        <input id="recordsSearch" class="skill-input" placeholder="Filter colonists…" value="${_escapeHtml(this._recordsSearch || '')}" oninput="App.setRecordsSearch(this.value)" style="width:160px; font-size:var(--f-xs)">
        <span style="font-size:var(--f-xs); color:var(--text3)">${pawnsList.length}/${pawns.length}</span>
      </div>
      <div style="flex:1; min-height:0; overflow:auto; border-radius:10px">
        <table class="records-table">
          <thead><tr><th style="cursor:pointer" onclick="App.sortRecords('name')">Colonist${arrow('name')}</th>${head}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    if (wasSearchFocused) {
      const si = document.getElementById('recordsSearch');
      if (si) { si.focus(); const val = si.value; si.value = ''; si.value = val; }
    }
  },

  setRecordsCat(cat) { this._recordsCat = cat; this.renderRecords(); },
  setRecordsSearch(v) { this._recordsSearch = v; this.renderRecords(); },
  sortRecordsPreset(v) {
    const [field, dir] = String(v).split('|');
    this._recordsSort = { field, dir: dir === 'asc' ? 'asc' : 'desc' };
    this.renderRecords();
  },
  sortRecords(field) {
    const s = this._recordsSort;
    if (s && s.field === field) { s.dir = s.dir === 'desc' ? 'asc' : 'desc'; }
    else { this._recordsSort = { field, dir: field === 'name' ? 'asc' : 'desc' }; }
    this.renderRecords();
  },

  // -- JOURNAL TAB (Notes + Timeline) --
  NOTE_COLORS: [
    { id: 'default', label: 'Slate',  bg: 'var(--note-slate-bg)',  border: 'var(--note-slate-border)',  text: 'var(--note-slate-text)' },
    { id: 'amber',   label: 'Amber',  bg: 'var(--note-amber-bg)',  border: 'var(--note-amber-border)',  text: 'var(--note-amber-text)' },
    { id: 'green',   label: 'Green',  bg: 'var(--note-green-bg)',  border: 'var(--note-green-border)',  text: 'var(--note-green-text)' },
    { id: 'red',     label: 'Red',    bg: 'var(--note-red-bg)',    border: 'var(--note-red-border)',    text: 'var(--note-red-text)' },
    { id: 'blue',    label: 'Blue',   bg: 'var(--note-blue-bg)',   border: 'var(--note-blue-border)',   text: 'var(--note-blue-text)' },
    { id: 'purple',  label: 'Purple', bg: 'var(--note-purple-bg)', border: 'var(--note-purple-border)', text: 'var(--note-purple-text)' },
  ],

  _noteColor(id) {
    return this.NOTE_COLORS.find(c => c.id === id) || this.NOTE_COLORS[0];
  },

  addNote() {
    if (!this.state.notes) this.state.notes = [];
    if (!this._checkCap(this.state.notes, 'notes', 'notes')) return;
    const id = 'note_' + Math.random().toString(36).slice(2, 9);
    this.state.notes.unshift({ id, title: '', body: '', color: 'default', pinned: false, ts: Date.now() });
    this.renderJournal();
    // Focus the new note's title
    setTimeout(() => {
      const el = document.querySelector(`.note-card[data-note-id="${id}"] .note-title`);
      if (el) el.focus();
    }, 50);
    this.triggerAutoSave();
  },

  deleteNote(id) {
    this.showConfirm('Delete this note?', 'Delete').then(() => {
      this.state.notes = (this.state.notes || []).filter(n => n.id !== id);
      this.renderJournal();
      this.triggerAutoSave();
    }).catch(() => {});
  },

  // Remove every entry in the current Journal view (Notes or Timeline).
  clearAllJournal() {
    const jv = this.state.journalView || 'notes';
    const isTimeline = jv === 'timeline';
    const count = isTimeline ? (this.state.timeline || []).length : (this.state.notes || []).length;
    if (!count) return;
    const what = isTimeline ? 'timeline event' : 'note';
    this.showConfirm(
      `Remove all ${count} ${what}${count !== 1 ? 's' : ''}?`,
      'Remove All',
      `This permanently deletes every ${what} in the journal. This cannot be undone.`
    ).then(() => {
      if (isTimeline) this.state.timeline = []; else this.state.notes = [];
      this.renderJournal();
      this.triggerAutoSave();
      this.toast(`Cleared all ${what}s.`);
    }).catch(() => {});
  },

  updateNote(id, field, val) {
    const note = (this.state.notes || []).find(n => n.id === id);
    if (!note || !['title', 'body'].includes(field)) return;
    note[field] = val;
    note.ts = Date.now();
    this.triggerAutoSave();
  },

  toggleNotePin(id) {
    const note = (this.state.notes || []).find(n => n.id === id);
    if (!note) return;
    note.pinned = !note.pinned;
    this.renderJournal();
    this.triggerAutoSave();
  },

  setNoteColor(id, colorId) {
    const note = (this.state.notes || []).find(n => n.id === id);
    if (!note || !this.NOTE_COLORS.some(c => c.id === colorId)) return;
    note.color = colorId;
    this.renderJournal();
    this.triggerAutoSave();
  },

  renderJournal() {
    const container = document.getElementById('view-notes');
    if (!container) return;
    if (!this.state.notes) this.state.notes = [];

    const notes = [...this.state.notes].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.ts - a.ts;
    });

    const noteCard = (n) => {
      const col = this._noteColor(n.color);
      const noteId = _escapeHtml(n.id);
      const colorDots = this.NOTE_COLORS.map(c =>
        `<button type="button" class="journal-colour-btn" data-journal-action="note-colour"
          data-note-id="${noteId}" data-colour-id="${c.id}" title="${c.label}"
          aria-label="Set note colour to ${c.label}" aria-pressed="${n.color === c.id}"
          style="background:${c.border}"><span aria-hidden="true">${n.color === c.id ? '&#10003;' : ''}</span></button>`
      ).join('');

      const dateStr = new Date(n.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

      return `<div class="note-card" data-note-id="${noteId}"
        style="background:${col.bg};border:1px solid ${col.border};border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px;position:relative;transition:border-color .2s,box-shadow .2s">
        <div style="display:flex;align-items:center;gap:6px">
          <input class="note-title" placeholder="Note title…"
            value="${_escapeHtml(n.title)}"
            data-note-id="${noteId}" data-note-field="title" aria-label="Note title"
            style="flex:1;background:transparent;border:none;outline:none;font-family:inherit;font-size:calc(15px * var(--font-scale));font-weight:700;color:${col.text};padding:0;min-width:0">
          <button type="button" class="journal-icon-btn${n.pinned ? ' is-active' : ''}" data-journal-action="note-pin"
            data-note-id="${noteId}" title="${n.pinned?'Unpin':'Pin'} note" aria-label="${n.pinned?'Unpin':'Pin'} note"
            aria-pressed="${n.pinned}"><span aria-hidden="true">&#128204;</span></button>
          <button type="button" class="journal-icon-btn journal-delete-btn" data-journal-action="note-delete"
            data-note-id="${noteId}" title="Delete note" aria-label="Delete note">&times;</button>
        </div>
        <textarea class="note-body" placeholder="Write your note…"
          data-note-id="${noteId}" data-note-field="body" aria-label="Note body"
          style="background:transparent;border:none;outline:none;font-family:inherit;font-size:var(--f-sm);color:var(--text2);resize:none;line-height:1.65;padding:0;min-height:80px;overflow:hidden"
        >${_escapeHtml(n.body)}</textarea>
        <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid ${col.border};padding-top:8px;gap:8px">
          <div style="display:flex;gap:5px;align-items:center">${colorDots}</div>
          <div style="font-size:var(--f-xs);color:var(--text3);font-weight:600;letter-spacing:.04em">${dateStr}</div>
        </div>
      </div>`;
    };

    const pinned = notes.filter(n => n.pinned);
    const unpinned = notes.filter(n => !n.pinned);

    const jv = this.state.journalView || 'notes';
    const tabBtn = (id, label) => `<button role="tab" aria-selected="${jv === id}" class="btn btn-sm ${jv===id?'btn-accent':''}" onclick="App.setJournalView('${id}')" style="padding:6px 16px">${label}</button>`;

    let content = '';
    if (jv === 'notes') {
      content = this._renderNotesView(notes, pinned, unpinned, noteCard);
    } else {
      content = this._renderTimelineView();
    }

    container.innerHTML = `
      <div style="width:100%">
        <div class="view-header">
          <div class="view-header-content">
            <h2 class="view-title">Colony Journal</h2>
            <div role="tablist" aria-label="Journal view" style="display:flex; gap:6px; margin-top:6px">
              ${tabBtn('notes', 'Notes')}
              ${tabBtn('timeline', 'Timeline')}
            </div>
          </div>
          <div class="view-header-actions" style="display:flex; gap:8px; align-items:center">
            ${((jv === 'notes' ? (this.state.notes || []).length : (this.state.timeline || []).length) > 0)
              ? `<button class="btn btn-danger" onclick="App.clearAllJournal()" title="Delete all ${jv === 'notes' ? 'notes' : 'timeline events'}">Remove All</button>` : ''}
            ${jv === 'notes' ? `<button class="btn btn-accent" onclick="App.addNote()">+ New Note</button>` : `<button class="btn btn-accent" onclick="App.addTimelineEvent()">+ Log Event</button>`}
          </div>
        </div>
        ${content}
      </div>
    `;

    this._bindJournalActions(container);

    // Auto-resize textareas to fit content
    if (jv === 'notes') {
      container.querySelectorAll('.note-body').forEach(ta => {
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 'px';
      });
    }
  },

  _bindJournalActions(container) {
    if (container._journalActionsBound) return;
    container._journalActionsBound = true;
    container.addEventListener('click', event => {
      const control = event.target.closest?.('[data-journal-action]');
      if (!control || !container.contains(control)) return;
      const action = control.dataset.journalAction;
      const noteId = control.dataset.noteId;
      const eventId = control.dataset.eventId;
      if (action === 'note-colour') this.setNoteColor(noteId, control.dataset.colourId);
      else if (action === 'note-pin') this.toggleNotePin(noteId);
      else if (action === 'note-delete') this.deleteNote(noteId);
      else if (action === 'event-edit') this.editTimelineEvent(eventId);
      else if (action === 'event-delete') this.deleteTimelineEvent(eventId);
    });
    container.addEventListener('input', event => {
      const input = event.target.closest?.('[data-note-field]');
      if (!input || !container.contains(input)) return;
      this.updateNote(input.dataset.noteId, input.dataset.noteField, input.value);
      if (input.classList.contains('note-body')) {
        input.style.height = 'auto';
        input.style.height = input.scrollHeight + 'px';
      }
    });
  },

  _renderNotesView(notes, pinned, unpinned, noteCard) {
    if (notes.length === 0) {
      return `<div style="text-align:center;padding:60px 20px;color:var(--text3);border:1px dashed var(--border-med);border-radius:12px">
        <div style="font-weight:700;margin-bottom:6px;color:var(--text2)">No notes yet</div>
        <div style="font-size:var(--f-sm)">Jot down colony plans, raid strategies, build ideas...</div>
        <button class="btn btn-accent" onclick="App.addNote()" style="margin-top:16px">Create your first note</button>
      </div>`;
    }
    let html = '';
    if (pinned.length > 0) {
      html += `<div class="section-title section-title--sm">Pinned</div>
        <div class="notes-grid" style="margin-bottom:24px">
          ${pinned.map(noteCard).join('')}
        </div>`;
    }
    if (unpinned.length > 0) {
      html += `${pinned.length > 0 ? '<div class="section-title section-title--sm">All Notes</div>' : ''}
        <div class="notes-grid">
          ${unpinned.map(noteCard).join('')}
        </div>`;
    }
    return html;
  },

  _renderTimelineView() {
    const events = [...(this.state.timeline || [])];
    const filter = this.state.timelineCategoryFilter || 'all';

    // Filter pills
    const pills = `<div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px">
      <button class="btn btn-sm ${filter==='all'?'btn-accent':''}" aria-pressed="${filter === 'all'}" onclick="App.setTimelineCategoryFilter('all')" style="padding:4px 12px; font-size:var(--f-xs)">All</button>
      ${TIMELINE_CATEGORIES.map(c => `<button class="btn btn-sm ${filter===c.id?'btn-accent':''}" aria-pressed="${filter === c.id}" onclick="App.setTimelineCategoryFilter('${c.id}')" style="padding:4px 12px; font-size:var(--f-xs); ${filter===c.id ? '' : 'border-color:'+c.color+'; color:'+c.color}">${c.icon} ${c.label}</button>`).join('')}
    </div>`;

    // Filter and sort (newest RimWorld date first)
    const filtered = filter === 'all' ? events : events.filter(e => e.category === filter);
    filtered.sort((a, b) => {
      const ya = (a.year||5500)*60 + (a.quadrum||1)*15 + (a.day||1);
      const yb = (b.year||5500)*60 + (b.quadrum||1)*15 + (b.day||1);
      return yb - ya || (b.ts||0) - (a.ts||0);
    });

    if (filtered.length === 0) {
      return pills + `<div style="text-align:center;padding:60px 20px;color:var(--text3);border:1px dashed var(--border-med);border-radius:12px">
        <div style="font-weight:700;margin-bottom:6px;color:var(--text2)">${filter === 'all' ? 'No events logged yet' : 'No '+_escapeHtml((TIMELINE_CATEGORIES.find(c => c.id === filter) || {}).label || 'matching')+' events'}</div>
        <div style="font-size:var(--f-sm)">Record raids, recruits, deaths, milestones, and other colony events.</div>
        <button class="btn btn-accent" onclick="App.addTimelineEvent()" style="margin-top:16px">Log your first event</button>
      </div>`;
    }

    const cards = filtered.map(e => {
      const cat = TIMELINE_CATEGORIES.find(c => c.id === e.category) || TIMELINE_CATEGORIES[TIMELINE_CATEGORIES.length - 1];
      const dateStr = `${QUADRUMS[(e.quadrum||1)-1]} ${e.day||1}, ${e.year||5500}`;
      const eventId = _escapeHtml(e.id);
      return `<div class="timeline-card" style="display:flex; gap:12px; align-items:flex-start; background:var(--surface2); padding:12px 16px; border-radius:10px; border-left:4px solid ${cat.color}; position:relative">
        <div style="font-size:calc(20px * var(--font-scale)); flex-shrink:0; line-height:1; margin-top:2px" title="${cat.label}">${cat.icon}</div>
        <div style="flex:1; min-width:0">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap">
            <span style="font-weight:700; color:var(--text)">${_escapeHtml(e.title)}</span>
            <span style="font-size:var(--f-xs); color:${cat.color}; font-weight:600">${cat.label}</span>
          </div>
          <div style="font-size:var(--f-xs); color:var(--text3); margin-top:3px">${_escapeHtml(dateStr)}</div>
          ${e.description ? `<div style="font-size:var(--f-sm); color:var(--text2); margin-top:6px; line-height:1.5">${_escapeHtml(e.description)}</div>` : ''}
        </div>
        <div class="timeline-card-actions">
          <button type="button" class="btn btn-sm" data-journal-action="event-edit" data-event-id="${eventId}" aria-label="Edit event">Edit</button>
          <button type="button" class="journal-icon-btn journal-delete-btn" data-journal-action="event-delete" data-event-id="${eventId}" title="Delete event" aria-label="Delete event">&times;</button>
        </div>
      </div>`;
    }).join('');

    return pills + `<div style="display:flex; flex-direction:column; gap:8px">${cards}</div>
      <div style="font-size:var(--f-xs); color:var(--text3); margin-top:12px; text-align:center">${filtered.length} event${filtered.length!==1?'s':''}</div>`;
  },

  setJournalView(view) {
    this.state.journalView = ['notes', 'timeline'].includes(view) ? view : 'notes';
    this.renderJournal();
  },

  setTimelineCategoryFilter(cat) {
    this.state.timelineCategoryFilter = cat === 'all' || TIMELINE_CATEGORIES.some(c => c.id === cat) ? cat : 'all';
    this.renderJournal();
  },

  addTimelineEvent() {
    if (!this.state.timeline) this.state.timeline = [];
    if (!this._checkCap(this.state.timeline, 'timeline', 'timeline events')) return;
    this._openTimelineEventModal(null);
  },

  editTimelineEvent(id) {
    const event = (this.state.timeline || []).find(item => item.id === id);
    if (event) this._openTimelineEventModal(event);
  },

  _currentJournalDate() {
    const meta = this.state.importMeta;
    const metaQuadrum = meta && (Number.isInteger(Number(meta.quadrum))
      ? Number(meta.quadrum)
      : QUADRUMS.indexOf(meta.quadrum) + 1);
    const metaYear = meta && Number(meta.year);
    const metaDay = meta && Number(meta.day);
    if (Number.isInteger(metaYear) && metaYear >= 1 && metaYear <= 99999
      && Number.isInteger(metaQuadrum) && metaQuadrum >= 1 && metaQuadrum <= 4
      && Number.isInteger(metaDay) && metaDay >= 1 && metaDay <= 15) {
      return { year: metaYear, quadrum: metaQuadrum, day: metaDay };
    }
    const raidDays = Number(this.state.raid && this.state.raid.daysPassed);
    if (typeof this._daysToQuadrum === 'function' && typeof this._raidCalDays === 'function'
      && Number.isFinite(raidDays)) {
      const date = this._daysToQuadrum(this._raidCalDays(Math.max(1, raidDays)));
      return { year: date.year, quadrum: date.quadrumIdx + 1, day: date.day };
    }
    return { year: 5500, quadrum: 1, day: 1 };
  },

  _openTimelineEventModal(event) {
    const current = event || { ...this._currentJournalDate(), category: 'custom', title: '', description: '' };
    const cats = TIMELINE_CATEGORIES.map(c => `<option value="${c.id}"${current.category === c.id ? ' selected' : ''}>${c.icon} ${c.label}</option>`).join('');
    const quads = QUADRUMS.map((q, i) => `<option value="${i+1}"${current.quadrum === i + 1 ? ' selected' : ''}>${q}</option>`).join('');
    this._timelineEditingId = event ? event.id : null;

    this.showCustomModal(event ? 'Edit Colony Event' : 'Log Colony Event', `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
        <div style="grid-column:1/-1">
          <label class="editor-label">Event Title</label>
          <input type="text" id="evt-title" class="skill-input" style="width:100%; text-align:left; padding:8px 12px" placeholder="e.g. First raid survived" value="${_escapeHtml(current.title)}" aria-describedby="evt-title-error">
          <div id="evt-title-error" role="alert" style="display:none;color:var(--warn-txt);font-size:var(--f-xs);margin-top:4px">Enter an event title.</div>
        </div>
        <div>
          <label class="editor-label">Category</label>
          <select id="evt-cat" class="skill-input" style="width:100%">${cats}</select>
        </div>
        <div>
          <label class="editor-label">Year</label>
          <input type="number" id="evt-year" class="skill-input" style="width:100%; text-align:center" min="1" max="99999" value="${current.year}">
        </div>
        <div>
          <label class="editor-label">Quadrum</label>
          <select id="evt-quad" class="skill-input" style="width:100%">${quads}</select>
        </div>
        <div>
          <label class="editor-label">Day (1-15)</label>
          <input type="number" id="evt-day" class="skill-input" style="width:100%; text-align:center" value="${current.day}" min="1" max="15">
        </div>
        <div style="grid-column:1/-1">
          <label class="editor-label">Description (optional)</label>
          <textarea id="evt-desc" class="skill-input" style="width:100%; min-height:60px; resize:vertical; padding:8px; font-family:inherit; text-align:left" placeholder="Details about the event...">${_escapeHtml(current.description)}</textarea>
        </div>
      </div>
    `, event ? 'Save Changes' : 'Log Event').catch(() => {}).finally(() => {
      this._timelineEditingId = null;
    });
    const footer = document.getElementById('genericModalFooter');
    if (footer) footer.innerHTML = `
      <button class="btn" onclick="App._dismissModal(false)">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitTimelineEvent()">${event ? 'Save Changes' : 'Log Event'}</button>
    `;
    setTimeout(() => document.getElementById('evt-title')?.focus(), 50);
  },

  submitTimelineEvent() {
    const titleInput = document.getElementById('evt-title');
    const title = titleInput?.value.trim();
    const titleError = document.getElementById('evt-title-error');
    if (!title) {
      if (titleInput) titleInput.setAttribute('aria-invalid', 'true');
      if (titleError) titleError.style.display = 'block';
      titleInput?.focus();
      return;
    }
    titleInput.removeAttribute('aria-invalid');
    if (titleError) titleError.style.display = 'none';
    const currentDate = this._currentJournalDate();
    const categoryValue = document.getElementById('evt-cat')?.value;
    const category = TIMELINE_CATEGORIES.some(c => c.id === categoryValue) ? categoryValue : 'custom';
    const yearValue = Number.parseInt(document.getElementById('evt-year')?.value, 10);
    const quadrumValue = Number.parseInt(document.getElementById('evt-quad')?.value, 10);
    const dayValue = Number.parseInt(document.getElementById('evt-day')?.value, 10);
    const values = {
      title,
      category,
      year: Number.isInteger(yearValue) ? Math.max(1, Math.min(99999, yearValue)) : currentDate.year,
      quadrum: Number.isInteger(quadrumValue) ? Math.max(1, Math.min(4, quadrumValue)) : currentDate.quadrum,
      day: Number.isInteger(dayValue) ? Math.max(1, Math.min(15, dayValue)) : currentDate.day,
      description: document.getElementById('evt-desc')?.value.trim() || '',
      ts: Date.now()
    };
    const existing = this._timelineEditingId
      ? (this.state.timeline || []).find(item => item.id === this._timelineEditingId)
      : null;
    if (existing) Object.assign(existing, values);
    else {
      if (!this.state.timeline) this.state.timeline = [];
      this.state.timeline.push({ id: 'evt_' + Math.random().toString(36).slice(2, 9), ...values });
    }
    this._dismissModal(true);
    this.renderJournal();
    this.triggerAutoSave();
    this.toast(existing ? 'Event updated.' : 'Event logged!');
  },

  deleteTimelineEvent(id) {
    this.showConfirm('Delete this event?', 'Delete').then(() => {
      this.state.timeline = (this.state.timeline || []).filter(e => e.id !== id);
      this.renderJournal();
      this.triggerAutoSave();
    }).catch(() => {});
  },

  // -- PERFORMANCE DIAGNOSTICS --
  _perfToggle() {
    if (Perf.enabled) Perf.disable(); else Perf.enable();
    this.renderSettings();
  },

  _perfCaptureToggle() {
    if (Perf._capturing) {
      const report = Perf.stopCapture();
      this._perfLastReport = report;
      this.renderSettings();
    } else {
      Perf.startCapture();
      this._perfLiveTimer = setInterval(() => {
        if (!Perf._capturing) { clearInterval(this._perfLiveTimer); return; }
        Perf._snapMemory();
        const panel = document.getElementById('perfLivePanel');
        if (panel) panel.textContent = Perf.formatReport(Perf.buildReport());
      }, 2000);
      this.renderSettings();
    }
  },

  _perfExportReport() {
    const report = this._perfLastReport || Perf.buildReport();
    if (!report || !report.probes || Object.keys(report.probes).length === 0) {
      this.toast('No performance data to export.');
      return;
    }
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rimjobs-perf-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    this.toast('Performance report exported.');
  },

  _perfCopyReport() {
    const report = this._perfLastReport || Perf.buildReport();
    const text = Perf.formatReport(report);
    if (window.overlay && window.overlay.clipboardWrite) window.overlay.clipboardWrite(text);
    else { try { navigator.clipboard.writeText(text); } catch (_) {} }
    this.toast('Performance summary copied to clipboard.');
  },
});

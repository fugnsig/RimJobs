/**
 * MAIN APP LOGIC
 * Handles State, Rendering, and User Interaction.
 */

// Shared HTML-escape helper - prevents XSS in dynamically rendered content
function _escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Render Unity rich text safely. RimWorld embeds tags like <color=#D09B61FF>Fam</color>
// in save text (ideology descriptions, deity lore); plain escaping showed them raw.
// Escape everything first, then turn the escaped colour tags into tinted spans (alpha
// byte dropped), keep bold/italic, and strip any other rich-text tag.
function _unityRichToHtml(raw) {
  let s = String(raw == null ? '' : raw);
  // Save files store the tags XML-escaped (&lt;color=#..&gt;), so the parsed string
  // already contains entities, not real tags. Decode one level of the basic XML
  // entities first so escaped and raw forms both normalise, then re-escape safely.
  s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
  s = _escapeHtml(s);
  s = s.replace(/&lt;color=(?:&quot;|&#39;)?#([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?(?:&quot;|&#39;)?&gt;([\s\S]*?)&lt;\/color&gt;/g,
    (_, hex, txt) => '<span style="color:#' + hex + '">' + txt + '</span>');
  s = s.replace(/&lt;b&gt;([\s\S]*?)&lt;\/b&gt;/g, '<strong>$1</strong>');
  s = s.replace(/&lt;i&gt;([\s\S]*?)&lt;\/i&gt;/g, '<em>$1</em>');
  // Remaining rich-text tags (named colours, size, case helpers, stray closers): drop
  // the tag, keep the text it wrapped.
  s = s.replace(/&lt;\/?(?:color|size|b|i|uppercase|lowercase)(?:=[^&]*?)?&gt;/gi, '');
  return s;
}

function _safeColor(value, fallback = '#888888') {
  const color = String(value || '').trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(color)) return color;
  if (/^(rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\)$/.test(color)) return color;
  if (/^var\(--[a-zA-Z0-9_-]+\)$/.test(color)) return color;
  return fallback;
}

function _modBadge(item) {
  if (!item || !item.modSource) return '';
  const full = String(item.modSource);
  // A long source (e.g. "Imported from save (gene-derived)") reads as a run-on jammed
  // against the name, so show a compact tag and keep the full text on hover.
  const short = full.length <= 14 ? full
    : (/imported/i.test(full) ? 'Imported' : /scan/i.test(full) ? 'Scanned' : full.slice(0, 12).trim() + '…');
  return `<span class="mod-badge" title="${_escapeHtml(full)}">${_escapeHtml(short)}</span>`;
}

function _modInput(currentVal, objPath) {
  return `<div>
    <label class="settings-label" style="font-size:var(--f-xs)">Mod Source</label>
    <input type="text" class="skill-input" style="width:100%" value="${_escapeHtml(currentVal || '')}" placeholder="Vanilla (leave blank)"
      oninput="${objPath}.modSource=this.value.trim(); App.triggerAutoSave()">
    <div style="font-size:calc(9px * var(--font-scale)); color:var(--text3); margin-top:2px">Tag this as from a specific mod</div>
  </div>`;
}

// Module-safe assign that preserves getters/setters (Object.assign evaluates them)
function _assignModule(target, source) {
  Object.getOwnPropertyNames(source).forEach(key => {
    const desc = Object.getOwnPropertyDescriptor(source, key);
    if (desc.get || desc.set) {
      Object.defineProperty(target, key, desc);
    } else {
      Object.defineProperty(target, key, { ...desc, configurable: true, writable: true });
    }
  });
  return target;
}

const App = {
  state: {
    pawns: [],
    priorities: {},
    customXenotypes: {},
    customTraits: {},
    traitCatalog: [], // [{def,degree,label,desc,conflictingTraits[],exclusionTags[]}] from install scan
    hediffCatalog: [], // [{def,label,hediffClass,category,defaultSeverity}] from install scan
    relationCatalog: [], // [{def,label}] directly-assignable PawnRelationDefs from install scan
    passionCatalog: [], // [{def,label,indicator,color,bucket,isBad,description}] modded VSE passions from scan
    scannedRoles: {}, // role PreceptDef defName -> exact installed role definition
    defSources: {}, // defName -> source mod packageId (from scan), for "mod not in this save" warnings
    geneColors: {}, // gene defName -> [r,g,b] from scan (skin/hair colour genes), for tinting
    customGenes: {},
    customJobs: [],
    precepts: {},
    ideology: { memes: [], precepts: {}, name: '' },
    catLabels: {}, 
    shiftTypes: ['Anything', 'Work', 'Recreation', 'Sleep', 'Meditate', 'Clean'],
    shiftColors: ['#555555', '#9e8a3a', '#9a7abf', '#5a4a9e', '#5aaa5a', '#9a4a8a'],
    selectedShiftType: 0,
    customBiomes: [],
    // Filter & UI state
    pawnSort: 'manual',
    pawnFilter: '',
    jobFilter: '',
    showGridCoords: false,
    blueprints: {}, // Grid coordinates -> { floor: ID, struct: ID, room: ID }

    roomLabels: {}, // roomId -> { name, type }
    notes: [], // Array of { id, title, body, color, pinned, ts }
    timeline: [], // Array of { id, quadrum, day, year, category, title, description, ts }
    journalView: 'notes', // 'notes' | 'timeline'
    timelineCategoryFilter: 'all', // 'all' | category id
    customBuildings: {}, // ID -> Building Def
    customBackstories: {}, // ID -> { slot, title, titleShort, skills, incapable, modSource }
    backstoryStories: {},  // ID -> story text (baseDesc), scanned from the install for the picker
    backstoryStoriesByTitle: {}, // title(lowercase) -> story text, fallback match for legacy-id vanilla backstories
    prostheticEfficiency: {}, // hediff defName -> { label, efficiency } scanned for the health tooltip
    scannedWorkTypeDefs: {},
    scannedWorkGiverDefs: {},
    scannedRaceWorkPolicies: {},
    effectivenessProvider: null,
    requirementUncertainty: { workType: {}, workGiver: {}, raceWork: {}, dataset: {} },
    activePackageResolution: { ids: ['ludeon.rimworld'], completeness: 'unknown', reasons: ['missingTargetSaveModList'] },
    customMaterials: [], // NEW: User-defined materials
    customBiomes: [], // NEW: User-defined biomes
    deletedPresetBiomes: [], // Biomes from BIOMES that are hidden
    deletedPresetBuildings: [], // Buildings from PRESET_BUILDINGS that are hidden
    prefabs: {}, // NEW: Named reusable layouts
    stamps: {}, // Saved sub-region stamps for reusable placement
    raid: {
      wealthItems: 0,
      wealthBuildings: 0,
      wealthCreatures: 0,
      wealthTotal: 0, // single total wealth input (alternative to split)
      useWealthTotal: false, // toggle: use total vs split
      colonists: 3,
      slaves: 0,
      children: 0,
      animals: 0, // total combat power of attack-trainable animals
      mechs: 0, // total combat power of player mechs
      daysPassed: 1,
      difficulty: 'strive',
      adaptDays: 0,
      storyteller: 'cassandra',
      lastRaidDay: 0,
      customStorytellers: [] // { id, name, minDays, maxDays, randomFactor (bool) }
    },
    blueprintHistory: [],
    blueprintHistoryIdx: -1,
    activeTool: 'gen_wall',
    biome: 'none', 
    activeLayer: 'struct', 
    drawMode: 'point', // 'point' or 'box'
    filterCat: 'all',
    activeTab: 'work',
    armouryMode: 'list', // 'list' or 'compare'
    armourySubTab: 'weapons', // 'weapons' | 'apparel' | 'loadouts' (unified Armoury tab)
    comparisonData: {
      a: { name: 'Weapon A', quality: 'normal', damage: 11, warmup: 1.0, cooldown: 1.7, burstCount: 3, burstTicks: 10, accuracyTouch: 0.60, accuracyShort: 0.70, accuracyMedium: 0.65, accuracyLong: 0.55, range: 31, ap: 0.16 },
      b: { name: 'Weapon B', quality: 'normal', damage: 16, warmup: 1.0, cooldown: 2.0, burstCount: 3, burstTicks: 12, accuracyTouch: 0.55, accuracyShort: 0.64, accuracyMedium: 0.55, accuracyLong: 0.45, range: 27.9, ap: 0.35 },
      targetSharp: 0,
      targetBlunt: 0,
      targetPreset: 'none'
    },
    weapons: JSON.parse(JSON.stringify(DEFAULT_WEAPONS)),
    weaponEditing: null,
    apparel: [], // populated from DEFAULT_APPAREL in init()
    apparelEditing: null,
    materials: JSON.parse(JSON.stringify(DEFAULT_MATERIALS)), // vanilla + mod materials
    apparelMode: 'list', // 'list', 'compare', or 'loadout'
    loadout: { weapon: null }, // apparel slots (layer x region) fill in by coverage; see _LOADOUT_APPAREL_SLOTS
    loadoutB: { weapon: null },
    loadoutCoverageRegion: 'torso',
    savedLoadouts: [], // [{ name: 'Melee Tank', slots: { skin, middle, outer, belt } }, ...]
    manualRelations: [], // [{ from, to, def }] - user-defined relations
    ghostPawns: [], // [{ loadID, name, nickname, firstName, lastName, gender, ghost }] - off-map relatives
    comparisonApparelData: {
      a: { name: 'Apparel A', quality: 'normal', armorSharp: 1.00, armorBlunt: 0.36, armorHeat: 0.27, insulationCold: -1, insulationHeat: 0, mass: 3.5 },
      b: { name: 'Apparel B', quality: 'normal', armorSharp: 1.06, armorBlunt: 0.45, armorHeat: 0.54, insulationCold: -4, insulationHeat: 2, mass: 2.0 },
      weaponAP: 0.16 // default: Assault Rifle AP - subtracted from armor rating before deflect roll
    },
    modFilter: 'all', // 'all' | 'vanilla' | 'modded' | specific mod name
    settings: {
      verticalTitles: false,
      manualPriorities: true, // true = numeric priorities; false = simple on/off, like RimWorld's Work tab
      manualPriorityMax: 4, // persisted 1-X scale used by manual editing and automatic assignment
      priorityLocked: false, // UI edit lock for the Priorities table and its assignment actions
      strategicFocusId: '', // empty = balanced; otherwise stable group: or job: identifier
      strategicFocusStrength: 'normal',
      jobOrder: null, // ordered list of visible job-column ids (null = default: vanilla+DLC+custom)
      tableFontSize: 14,
      jobFontSize: 12,
      catFontSize: 14,
      prioSize: 28,
      pawnCardFontSize: 13,
      clickDirection: 'left-to-high',
      theme: 'dark',
      colourBlindMode: false,
      dyslexiaFontMode: false,
      uiScale: 1.0,
      fontScale: 1.0,
      sidebarWidth: 320,
      sidebarWidthFull: null,      // remembered manual width for fullscreen mode (null = auto)
      sidebarWidthWindowed: null,  // remembered manual width for windowed mode (null = auto)
      pawnColWidth: 180,
      autoSaveEnabled: true,
      startupMode: 'window', // window | fullscreen | widget - mode on launch
      alwaysOnTop: true,
      windowOpacity: 1,
      transparencyLocked: false,
      helpFontSize: 13,
      blueprintZoom: 2.0,
      blueprintZoomWidget: 1.0,
      invertWheel: false,
      disableScrollWheel: false,
      confirmPawnDel: true,
      priorityWrap: true,
      rowHighlighting: true,
      compactSidebar: false,
      showResizeLabel: false,
      sidebarCollapsed: false,
      showBiomePatterns: true,
      showRaidEstimate: false,
      showConsole: false,
      hiddenTabs: [],
      pawnCardScale: 1.0,
      hideModdedContent: false,
      savePath: '',  // File-based save path (empty = use localStorage)
      removeLimits: false,  // Remove item caps (may impact performance / save size)
      rimworldPath: '',  // Auto-detected RimWorld install path (for def label resolution)
      autoScanMods: true,  // Proactively warm modded content (traits/genes/health/equipment) in the background
      widgetWidth: 420,
      widgetHeight: 700,
      fullWidth: 1200,
      fullHeight: 850
    }
  },

  _resizing: null,
  _saveTimer: null,
  _boxStart: null, // {x, y} for rectangle drawing
  _defLabels: null, // Cached defName -> { label, type, desc } map from game XMLs
  _defLabelsPath: null, // RimWorld install path used for the cache
  _pawnCardHashes: {}, // pawnId -> hash string for differential sidebar rendering

  // Send a small app-wide breadcrumb to the persistent main-process crash
  // report. The bridge failure is always swallowed so diagnostics can never
  // break the operation they are observing.
  _crashProbe(eventName, details = {}) {
    try {
      if (!window.overlay || !window.overlay.recordCrashProbe) return Promise.resolve(false);
      const payload = { ...details };
      if (typeof performance !== 'undefined' && performance.memory) {
        payload.rendererHeapMb = Math.round(performance.memory.usedJSHeapSize / 1048576);
        payload.rendererHeapLimitMb = Math.round(performance.memory.jsHeapSizeLimit / 1048576);
      }
      return Promise.resolve(window.overlay.recordCrashProbe(eventName, payload)).catch(() => false);
    } catch (_) {
      return Promise.resolve(false);
    }
  },

  GRID_W: 60,
  GRID_H: 60,

  // Default item caps (can be removed via Settings > Behaviour)
  CAPS: {
    pawns: 30,
    customJobs: 30,
    weapons: 100,
    apparel: 100,
    notes: 50,
    timeline: 200,
    customXenotypes: 50,
    customGenes: 100,
    customTraits: 50,
    customMaterials: 30,
    customBiomes: 20,
    customBuildings: 50,
    customStorytellers: 10,
    savedLoadouts: 20,
    prefabs: 30
  },

  // Returns true if adding is allowed; toasts a warning and returns false if at cap
  _checkCap(collection, capKey, label) {
    if (this.state.settings.removeLimits) return true;
    const limit = this.CAPS[capKey];
    if (!limit) return true;
    const len = Array.isArray(collection) ? collection.length : Object.keys(collection).length;
    if (len >= limit) {
      this.toast(`Limit reached, ${len}/${limit} ${label}. Remove the cap in Settings > Behaviour.`);
      return false;
    }
    return true;
  },

  // Mode-aware zoom helpers
  _isWidgetMode() { return window.innerWidth <= 550; },
  // Whether the window currently fills the screen (fullscreen) vs a smaller
  // window. Prefers the authoritative flag from the main process, falling back
  // to comparing the viewport against the screen's available width.
  _isFullscreenMode() {
    if (typeof this._isFullscreen === 'boolean') return this._isFullscreen;
    return window.innerWidth >= (window.screen.availWidth - 20);
  },
  // Apply the preferred startup window mode once on boot. Main launches in WINDOW
  // mode, so we only switch to fullscreen or widget when that's the preference.
  _applyStartupMode() {
    if (this._startupModeApplied || !window.overlay) return;
    this._startupModeApplied = true;
    const mode = this.state.settings.startupMode || 'window';
    // Apply the mode INSTANTLY (no animation) while the window is still hidden, then reveal it
    // once the layout has painted in that mode - so the cold open shows the final size directly,
    // never the old "windowed size then snap to widget" jank.
    const reveal = () => { try { window.overlay.rendererReady && window.overlay.rendererReady(); } catch (_) {} };
    if (window.overlay.applyStartupMode) {
      window.overlay.applyStartupMode(mode);
      // Double rAF + a short settle covers the resize-driven re-render (onWidgetModeChanged).
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(reveal, 140)));
    } else {
      // Older preload: fall back to the animated toggle, then reveal.
      setTimeout(() => {
        if (mode === 'fullscreen' && window.overlay.toggleFullscreen) window.overlay.toggleFullscreen();
        else if (mode === 'widget' && window.overlay.toggleWidgetMode) window.overlay.toggleWidgetMode();
        reveal();
      }, 150);
    }
  },
  _getCurrentZoom() {
    return this._isWidgetMode()
      ? (this.state.settings.blueprintZoomWidget || 1.0)
      : (this.state.settings.blueprintZoom || 2.0);
  },
  _setCurrentZoom(val) {
    if (this._isWidgetMode()) {
      this.state.settings.blueprintZoomWidget = val;
    } else {
      this.state.settings.blueprintZoom = val;
    }
  },
  _zoomDisplayPercent(zoom) {
    // Window mode: internal 1.0-4.0 maps to display 50-200%  (multiply by 50)
    // Widget mode: internal 0.5-2.0 maps to display 50-200%  (multiply by 100)
    return this._isWidgetMode() ? Math.round(zoom * 100) : Math.round(zoom * 50);
  },

  _calculateAdaptiveGrid() {
    const zoom = this._getCurrentZoom();
    const baseMin = Math.round(60 / zoom);

    let maxP = 60;
    Object.keys(this.state.blueprints).forEach(key => {
      const [x, y] = key.split(',').map(Number);
      maxP = Math.max(maxP, x + 5, y + 5);
    });

    const grid = document.querySelector('.blueprint-grid');
    if (grid) {
      const rect = grid.getBoundingClientRect();
      const ts = Math.min(rect.width, rect.height) / Math.max(maxP, baseMin);
      this.GRID_W = Math.max(maxP, baseMin, Math.floor(rect.width / ts));
      this.GRID_H = Math.max(maxP, baseMin, Math.floor(rect.height / ts));
    } else {
      this.GRID_W = Math.max(maxP, baseMin);
      this.GRID_H = Math.max(maxP, baseMin);
    }
  },

  _appVersion: '1.3.37',
  // Developer contact, used by the Legal tab's takedown notice. The "me" link points here.
  _githubProfile: 'https://github.com/fugnsig',

  // App-wide styled tooltip. Intercepts native `title` attributes via document-level
  // delegation and renders them in the same styled box as the blueprint tooltip, so
  // every tooltip in every mode looks consistent. The title is moved to data-app-tip
  // on hover (suppressing the OS tooltip) and restored on leave.
  _initGlobalTooltips() {
    if (this._tipInited) return;
    this._tipInited = true;
    let tip = document.getElementById('appTooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'appTooltip';
      tip.className = 'app-tip';
      document.body.appendChild(tip);
    }
    let cur = null;
    // Tooltip timing: a short hover-intent delay before EVERY tooltip shows, so they
    // are not intrusive when the cursor merely passes over controls. The delay applies
    // consistently to every tooltip (no instant follow-ups); hide is always instant.
    const ENTER_DELAY = 450;
    let showTimer = null, lastE = null;
    const hide = () => {
      if (showTimer) { clearTimeout(showTimer); showTimer = null; }
      if (cur) {
        const t = cur.getAttribute('data-app-tip');
        if (t != null) { cur.setAttribute('title', t); cur.removeAttribute('data-app-tip'); }
        cur = null;
      }
      tip.style.display = 'none';
    };
    const position = (e) => {
      const pad = 14, vw = window.innerWidth, vh = window.innerHeight;
      const r = tip.getBoundingClientRect();
      let x = e.clientX + pad, y = e.clientY + pad;
      if (x + r.width + 4 > vw) x = e.clientX - r.width - pad;
      if (y + r.height + 4 > vh) y = e.clientY - r.height - pad;
      tip.style.left = Math.max(4, x) + 'px';
      tip.style.top = Math.max(4, y) + 'px';
    };
    document.addEventListener('mouseover', (e) => {
      const el = e.target && e.target.closest ? e.target.closest('[title]') : null;
      if (!el || el === cur) return;
      const text = el.getAttribute('title');
      if (!text || !text.trim()) return;
      hide();
      cur = el;
      el.setAttribute('data-app-tip', text);
      el.removeAttribute('title');          // suppress the native OS tooltip
      // No tooltips while collapsed to the title bar: native is already suppressed
      // above, and the title is restored on mouse-out so they return when expanded.
      if (document.body.classList.contains('is-minimized')) return;
      // Tooltips disabled in Settings: suppress the native one but show nothing.
      if (this.state && this.state.settings && this.state.settings.tooltips === false) return;
      lastE = e;
      // Always wait the hover delay before showing, for every tooltip.
      showTimer = setTimeout(() => {
        showTimer = null;
        tip.textContent = text;             // textContent is safe; \n renders via white-space:pre-line
        tip.style.display = 'block';
        position(lastE || e);
      }, ENTER_DELAY);
    });
    document.addEventListener('mousemove', (e) => {
      if (!cur) return;
      if (!document.contains(cur)) { hide(); return; } // element re-rendered away
      lastE = e;
      position(e);
    });
    document.addEventListener('mouseout', (e) => {
      if (!cur) return;
      if (e.relatedTarget && cur.contains(e.relatedTarget)) return; // still inside the tipped element
      hide();
    });
    // Safety: never let a tooltip linger.
    document.addEventListener('mousedown', hide, true);
    document.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
  },

  // Desaturate every coloured emoji in the DOM to a muted monochrome glyph, matching the
  // greyed tool icons. CSS can't target individual glyphs inside mixed text, so we wrap
  // each emoji cluster in a `.rj-emoji` span. Re-applied after re-renders via a debounced
  // MutationObserver. (Canvas-drawn emoji, e.g. on the relations graph, aren't DOM text
  // so they're unaffected.)
  _greyEmojis(root) {
    if (!root || !root.nodeType) return;
    const start = root.nodeType === 1 ? root : (root.parentNode || document.body);
    const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CANVAS', 'SELECT', 'OPTION']);
    let reTest, reSplit;
    try {
      reTest = /\p{Extended_Pictographic}/u;
      // A full emoji cluster: a pictograph plus any ZWJ-joined pictographs (‍),
      // variation selector (️) and skin-tone modifiers, so multi-codepoint emoji
      // stay intact rather than being split mid-sequence.
      reSplit = /\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic}|[️\u{1F3FB}-\u{1F3FF}])*/gu;
    } catch (_) { return; } // engine without Unicode property escapes
    const walker = document.createTreeWalker(start, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentNode;
        if (!p || p.nodeType !== 1) return NodeFilter.FILTER_REJECT;
        if (SKIP.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (p.classList && p.classList.contains('rj-emoji')) return NodeFilter.FILTER_REJECT;
        if (p.isContentEditable) return NodeFilter.FILTER_REJECT;
        return reTest.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    // Emoji to leave in full colour (their colour carries meaning), e.g. the passion
    // fire. Compared by first codepoint so any trailing variation selector still matches.
    const KEEP_CP = new Set([0x1F525]); // 🔥
    const isKeep = (cluster) => KEEP_CP.has(cluster.codePointAt(0));
    const targets = [];
    let nd; while ((nd = walker.nextNode())) targets.push(nd);
    for (const node of targets) {
      const text = node.nodeValue;
      // If the only emoji here are kept ones, leave the node untouched (no DOM churn, and
      // avoids the observer re-firing on a node we never actually change).
      reSplit.lastIndex = 0;
      let hasWrappable = false, mm;
      while ((mm = reSplit.exec(text))) { if (!isKeep(mm[0])) { hasWrappable = true; break; } }
      if (!hasWrappable) continue;
      reSplit.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0, m;
      while ((m = reSplit.exec(text))) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        if (isKeep(m[0])) {
          frag.appendChild(document.createTextNode(m[0])); // keep coloured
        } else {
          const span = document.createElement('span');
          span.className = 'rj-emoji';
          span.textContent = m[0];
          frag.appendChild(span);
        }
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      if (node.parentNode) node.parentNode.replaceChild(frag, node);
    }
  },
  _initEmojiGrey() {
    if (this._emojiInited) return;
    this._emojiInited = true;
    const obs = new MutationObserver(() => {
      clearTimeout(this._emojiT);
      this._emojiT = setTimeout(run, 150);
    });
    const run = () => {
      obs.disconnect();
      try { this._greyEmojis(document.body); } catch (_) {}
      obs.observe(document.body, { childList: true, subtree: true });
    };
    run();
  },

  init() {
    this._crashProbe('renderer.init-start');
    // Capture console.error/warn for in-app console drawer
    this._initConsoleCapture();

    // App-wide styled tooltips (replaces the native OS `title` tooltip everywhere).
    this._initGlobalTooltips();
    // Desaturate every coloured emoji to a muted monochrome glyph (matches the tool icons).
    this._initEmojiGrey();

    // Fetch version from Electron main process (async, non-blocking)
    if (window.overlay && window.overlay.getVersion) {
      window.overlay.getVersion().then(v => { if (v) this._appVersion = v; }).catch(() => {});
    }
    if (window.overlay && window.overlay.getGraphicsStatus) {
      window.overlay.getGraphicsStatus().then(status => {
        this._opacitySupported = !status || status.opacitySupported !== false;
        this._applyWindowTransparency();
      }).catch(() => {});
    }

    this.loadData();
    this._refreshCaches();
    
    // Migrate zoom: old range was 0.5-2.0, new window range is 1.0-4.0
    if (this.state.settings.blueprintZoom === undefined || this.state.settings.blueprintZoom < 1.0) {
      this.state.settings.blueprintZoom = 2.0;
    }
    if (this.state.settings.blueprintZoomWidget === undefined) {
      this.state.settings.blueprintZoomWidget = 1.0;
    }

    this._calculateAdaptiveGrid();

    // Initialize undo/redo history
    this.blueprintHistoryIdx = 0;
    this.state.blueprintHistory = [JSON.stringify({ blueprints: this.state.blueprints, roomLabels: this.state.roomLabels })];

    if (this.state.pawns.length === 0) {
      this.addPawn(); this.addPawn(); this.addPawn();
    }
    if (!this.state.colonyName || this.state.colonyName.trim() === '') {
      this.state.colonyName = 'New RimWorld Colony';
    }
    if (this.state.weapons.length === 0) {
      this.state.weapons = JSON.parse(JSON.stringify(DEFAULT_WEAPONS));
    }
    if (this.state.apparel.length === 0) {
      this.state.apparel = JSON.parse(JSON.stringify(DEFAULT_APPAREL));
    }
    if (Object.keys(this.state.precepts).length === 0) {
      DEFAULT_PRECEPTS.forEach(p => this.state.precepts[p.id] = p.value);
    }
    
    // One-time colour migration for shift planner
    const defaultColors = ['#555555', '#9e8a3a', '#9a7abf', '#5a4a9e', '#5aaa5a', '#9a4a8a'];
    if (this.state.shiftColors[2] !== defaultColors[2] || this.state.shiftColors[5] !== defaultColors[5]) {
      this.state.shiftColors = defaultColors;
    }

    // Send saved window sizes to main process so toggle uses custom dimensions
    this._syncWindowSizes();

    // Apply the saved always-on-top preference (main defaults to on).
    if (window.overlay && window.overlay.setAlwaysOnTop) {
      window.overlay.setAlwaysOnTop(this.state.settings.alwaysOnTop !== false);
    }
    this._applyWindowTransparency();

    this.applySettings();
    this.applyTheme();
    this._applyColonyName();
    const validTabs = ['work','settings','dash','sched','help','blue','notes','armoury','ideo','relations','records','raid','legal'];
    // Apparel was merged into the Armoury tab as a sub-tab.
    if (this.state.activeTab === 'apparel') { this.state.activeTab = 'armoury'; this.state.armourySubTab = 'apparel'; }
    this.setTab(validTabs.includes(this.state.activeTab) ? this.state.activeTab : 'work');
    // setTab has already rendered the active view. Build the shared chrome once,
    // and avoid a second large active-tab render during the startup memory peak.
    this.renderAll({ skipActiveView: true, skipTable: this.state.activeTab !== 'work' });
    this.setupGlobalEvents();
    this.applyTabVisibility();
    this.updateRaidToolbar();
    // Restore console drawer if it was enabled
    if (this.state.settings.showConsole) {
      const cd = document.getElementById('consoleDrawer');
      if (cd) { cd.style.display = 'flex'; this._renderConsoleDrawer(); }
    }

    // Apply the preferred startup window mode (main boots in window mode).
    this._applyStartupMode();

    // Restore scroll position after render
    setTimeout(() => {
      const main = document.querySelector('.main');
      if (main && this.state.uiScroll) main.scrollTop = this.state.uiScroll;
    }, 100);

    // Async: try loading from file-based save (overrides localStorage data if file exists)
    this._loadFromFileIfNeeded().then(loaded => {
      if (loaded) {
        this._refreshCaches();
        this.renderAll();
      }
      this._updateSavePill();
      this._showRefreshBtn();
      this._updateLogoDate();
    }).catch(() => { this._updateSavePill(); this._showRefreshBtn(); this._updateLogoDate(); });

    // Proactively warm modded content in the background once the UI has settled, so the
    // Armoury/Loadouts/Pawn Manager are ready without a manual scan. Deferred to idle, guarded
    // and cache-backed inside _prefetchModData. Skipped if no RimWorld path or the toggle is off.
    if (this.state.settings.autoScanMods !== false && this.state.settings.rimworldPath) {
      const warm = () => { this._prefetchModData(); };
      if (typeof requestIdleCallback === 'function') requestIdleCallback(() => setTimeout(warm, 15000), { timeout: 30000 });
      else setTimeout(warm, 20000);
    }
  },

  setupGlobalEvents() {
    const globalTip = document.getElementById('global-tooltip');

    // Stop schedule painting on any mouseup
    window.addEventListener('mouseup', () => { this._schedPainting = false; });

    // Listen for close request from Electron
    if (window.overlay && window.overlay.onCloseRequested) {
      window.overlay.onCloseRequested(() => this.showQuitConfirm());
    }

    // During widget↔windowed transition: freeze current content to prevent layout thrash,
    // then re-render at the final size once the animation completes.
    if (window.overlay && window.overlay.onWidgetTransitionStart) {
      window.overlay.onWidgetTransitionStart(() => {
        // Gate the window resize listener: every animation step fires a resize event,
        // and crossing the 550px/900px breakpoints mid-animation used to trigger full
        // tab re-renders per step - the single biggest source of dropped frames.
        this._modeAnimating = true;
        // Kill CSS transitions/animations for the duration so per-step var changes
        // (clamp()-based sizes follow the width) don't queue extra repaints.
        document.body.classList.add('mode-animating');
        // Hide heavy DOM subtrees during animation to prevent per-frame reflow
        const appEl = document.querySelector('.app');
        if (appEl) appEl.style.pointerEvents = 'none';
        const pawnList = document.getElementById('pawnList');
        if (pawnList) { pawnList.style.contentVisibility = 'hidden'; pawnList.style.containIntrinsicSize = 'auto 200px'; }
        const mainContent = document.querySelector('.main');
        if (mainContent) { mainContent.style.contentVisibility = 'hidden'; mainContent.style.containIntrinsicSize = 'auto 400px'; }
      });
    }

    if (window.overlay && window.overlay.onWidgetModeChanged) {
      window.overlay.onWidgetModeChanged((isWidget) => {
        const appEl = document.querySelector('.app');
        requestAnimationFrame(() => {
          this._modeAnimating = false;
          _prevWidth = window.innerWidth;
          this.applySettings();
          // Skip sidebar re-render on transition - content hasn't changed, only CSS layout
          this.renderAll({ skipSidebar: true });
          if (appEl) appEl.style.pointerEvents = '';
          // Restore hidden subtrees after layout settles
          const pawnList = document.getElementById('pawnList');
          if (pawnList) { pawnList.style.contentVisibility = ''; pawnList.style.containIntrinsicSize = ''; }
          const mainContent = document.querySelector('.main');
          if (mainContent) { mainContent.style.contentVisibility = ''; mainContent.style.containIntrinsicSize = ''; }
          // Re-enable CSS transitions one frame later, after the final layout settles,
          // so the settle itself doesn't trigger a wave of transition repaints.
          requestAnimationFrame(() => document.body.classList.remove('mode-animating'));
        });
      });
    }

    // Listen for position lock state
    if (window.overlay && window.overlay.onPositionLocked) {
      window.overlay.onPositionLocked((locked) => {
        this._posLocked = locked;
        const btn = document.getElementById('pinBtn');
        const drag = document.querySelector('.overlay-drag-region');
        if (btn) {
          btn.style.background = locked ? 'var(--accent)' : '';
          btn.style.color = locked ? '#000' : '';
          btn.title = locked ? 'Locked - click to unlock' : 'Lock window position';
        }
        // Visual cursor feedback only, actual lock is enforced by main process
        if (drag) {
          drag.style.cursor = locked ? 'not-allowed' : 'grab';
        }
        this.toast(locked ? 'Position locked' : 'Position unlocked');
      });
    }

    // Listen for snap events, reapply settings for half-screen layout
    if (window.overlay && window.overlay.onWindowSnapped) {
      window.overlay.onWindowSnapped((side) => {
        this.applySettings();
        this.toast(side === 'left' ? '◧ Snapped left' : '◨ Snapped right');
      });
    }

    // Blueprint rotate hotkeys (Q/E) forwarded from the native key hook. The overlay
    // is focusable:false so it never gets real keydown events; the hook delivers Q/E
    // when the cursor is over the overlay. Q rotates left, E rotates right - rotating
    // the held cut/grab/stamp clipboard if placing, otherwise the placement facing.
    if (window.overlay && window.overlay.onNativeHotkey) {
      window.overlay.onNativeHotkey((d) => {
        // Pawn Spotlight: Left/Right cycle, Escape closes. The window is focusable:false
        // so real keydown events never reach the DOM - these arrive as passive native
        // hotkeys instead (forwarded only while the cursor is over the overlay).
        if (d.key === 'left' || d.key === 'right' || d.key === 'escape') {
          if (!document.getElementById('pawnSpotlight')) return;
          if (d.key === 'escape') this.closePawnSpotlight();
          else this.spotlightStep(d.key === 'left' ? -1 : 1);
          return;
        }
        if (this.state.activeTab !== 'blue') return;
        if (document.querySelector('.modal-overlay.show')) return;
        if (d.key === 'f') { if (this.state.drawMode === 'stamp_place' && this.flipStamp) this.flipStamp(); return; }
        const dir = d.key === 'q' ? -1 : d.key === 'e' ? 1 : 0;
        if (!dir) return;
        if (this.state.drawMode === 'stamp_place' && this.rotateStamp) this.rotateStamp(dir);
        else if (this.rotateBlueprintTool) this.rotateBlueprintTool(dir);
      });
    }

    // Custom window drag, replaces -webkit-app-region: drag which is broken
    // on Windows with transparent + frameless + non-focusable windows.
    if (window.overlay && window.overlay.dragStart) {
      const dragRegion = document.querySelector('.overlay-drag-region');
      if (dragRegion) {
        let dragging = false;
        dragRegion.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return; // left click only
          if (this._posLocked) return;
          dragging = true;
          window.overlay.dragStart(e.screenX, e.screenY);
          e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
          if (!dragging) return;
          window.overlay.dragMove(e.screenX, e.screenY);
        });
        document.addEventListener('mouseup', () => {
          if (!dragging) return;
          dragging = false;
          window.overlay.dragEnd();
        });
      }
    }

    // Collapsed-bar WIDTH grips. Native resize is off while collapsed (so no
    // vertical/corner cursors), so these left/right handles drive a width-only
    // resize through the main process. Mirrors the custom window-drag above.
    if (window.overlay && window.overlay.collapsedResizeStart) {
      let rzEdge = null;
      document.querySelectorAll('.overlay-resize-grip').forEach(grip => {
        grip.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          rzEdge = grip.getAttribute('data-edge') || 'right';
          window.overlay.collapsedResizeStart(rzEdge);
          e.preventDefault();
          e.stopPropagation(); // don't also start a window move
        });
      });
      document.addEventListener('mousemove', (e) => {
        if (!rzEdge) return;
        window.overlay.collapsedResizeMove(e.screenX);
      });
      document.addEventListener('mouseup', () => {
        if (!rzEdge) return;
        rzEdge = null;
        window.overlay.collapsedResizeEnd();
      });
    }

    // ─── Input Focus + Native Keyboard Capture ───
    // Window is focusable:false so clicks never steal focus from the game.
    // When a text input is clicked, a WH_KEYBOARD_LL hook captures keystrokes
    // and injects them directly into the DOM via IPC.
    // Press Escape or click outside the input to stop capture.
    if (window.overlay && window.overlay.requestFocus) {
      const isTextInput = (el) => {
        if (el.tagName === 'TEXTAREA') return true;
        if (el.tagName === 'SELECT') return true;
        if (el.tagName === 'INPUT') {
          const t = (el.type || '').toLowerCase();
          return t === 'text' || t === 'search' || t === 'number' || t === 'email' || t === 'password' || t === 'url' || t === '' || t === 'color';
        }
        return false;
      };

      let captureTarget = null; // the DOM element currently receiving native keystrokes

      // ── Start capture when clicking a text input ──
      document.addEventListener('mousedown', (e) => {
        if (e.target.closest('.overlay-drag-region')) return;
        if (isTextInput(e.target) || e.target.closest('input, textarea, select')) {
          const el = e.target.closest('input, textarea, select') || e.target;
          captureTarget = el;
          el.classList.add('native-capture-active');
          document.body.classList.add('input-captured');
          el.focus();
          window.overlay.requestFocus();
        } else {
          // Clicked outside any input, stop capture
          if (captureTarget) {
            captureTarget.classList.remove('native-capture-active');
            captureTarget.blur();
            captureTarget = null;
          }
          document.body.classList.remove('input-captured');
          window.overlay.releaseFocus();
        }
        App._dragFromInput = !!(e.target.closest('input, textarea, select'));
      });

      // ── Cursor leaving the overlay no longer stops capture ──
      // It used to, but that broke on-screen/virtual keyboards: tapping their keys
      // moves the cursor onto the keyboard window (outside the overlay), which killed
      // the capture before the first key arrived. The main process now auto-stops
      // capture the moment a PHYSICAL key is typed with the cursor outside the overlay
      // (see main.js keyboardHook handler), so game typing is still never eaten, while
      // injected virtual-keyboard keys flow into the focused input from anywhere.

      // ── Handle native key events from GetAsyncKeyState polling ──
      if (window.overlay.onNativeKey) {
        window.overlay.onNativeKey((data) => {
          // Ctrl+C with no focused input: copy any highlighted text on the page
          if (!captureTarget && data.ctrl && data.vkCode === 0x43) {
            const sel = window.getSelection();
            const text = sel ? sel.toString() : '';
            if (text && window.overlay.clipboardWrite) {
              window.overlay.clipboardWrite(text);
              App.toast('Copied.');
            }
            return;
          }

          const el = captureTarget;
          if (!el) return;

          // Printable character → insert at cursor position
          if (data.char && !data.ctrl && !data.alt) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
              const start = el.selectionStart ?? el.value.length;
              const end = el.selectionEnd ?? start;
              el.value = el.value.slice(0, start) + data.char + el.value.slice(end);
              el.selectionStart = el.selectionEnd = start + data.char.length;
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return;
          }

          // Special keys
          switch (data.key) {
            case 'Backspace': {
              const s = el.selectionStart ?? 0, e2 = el.selectionEnd ?? s;
              if (s !== e2) {
                el.value = el.value.slice(0, s) + el.value.slice(e2);
                el.selectionStart = el.selectionEnd = s;
              } else if (s > 0) {
                el.value = el.value.slice(0, s - 1) + el.value.slice(s);
                el.selectionStart = el.selectionEnd = s - 1;
              }
              el.dispatchEvent(new Event('input', { bubbles: true }));
              break;
            }
            case 'Delete': {
              const s = el.selectionStart ?? 0, e2 = el.selectionEnd ?? s;
              if (s !== e2) {
                el.value = el.value.slice(0, s) + el.value.slice(e2);
                el.selectionStart = el.selectionEnd = s;
              } else if (s < el.value.length) {
                el.value = el.value.slice(0, s) + el.value.slice(s + 1);
                el.selectionStart = el.selectionEnd = s;
              }
              el.dispatchEvent(new Event('input', { bubbles: true }));
              break;
            }
            case 'Left':
              if (el.selectionStart > 0) el.selectionStart = el.selectionEnd = el.selectionStart - 1;
              break;
            case 'Right':
              if (el.selectionStart < el.value.length) el.selectionStart = el.selectionEnd = el.selectionStart + 1;
              break;
            case 'Home':
              el.selectionStart = el.selectionEnd = 0;
              break;
            case 'End':
              el.selectionStart = el.selectionEnd = el.value.length;
              break;
            case 'Enter':
              if (el.tagName === 'TEXTAREA') {
                const s = el.selectionStart ?? el.value.length;
                const e2 = el.selectionEnd ?? s;
                el.value = el.value.slice(0, s) + '\n' + el.value.slice(e2);
                el.selectionStart = el.selectionEnd = s + 1;
                el.dispatchEvent(new Event('input', { bubbles: true }));
              }
              break;
            case 'Tab':
              // Move to next input (or stop capture if no next)
              if (captureTarget) {
                captureTarget.classList.remove('native-capture-active');
                captureTarget = null;
              }
              document.body.classList.remove('input-captured');
              window.overlay.releaseFocus();
              break;
          }

          // Ctrl shortcuts
          if (data.ctrl) {
            // Ctrl+A - select all
            if (data.vkCode === 0x41) {
              el.selectionStart = 0;
              el.selectionEnd = el.value.length;
            }
            // Ctrl+C - copy selection to clipboard (uses Electron clipboard, not navigator)
            if (data.vkCode === 0x43) {
              const s = el.selectionStart ?? 0, e2 = el.selectionEnd ?? s;
              if (s !== e2 && window.overlay && window.overlay.clipboardWrite) {
                window.overlay.clipboardWrite(el.value.slice(s, e2));
              }
            }
            // Ctrl+X - cut selection to clipboard
            if (data.vkCode === 0x58) {
              const s = el.selectionStart ?? 0, e2 = el.selectionEnd ?? s;
              if (s !== e2) {
                if (window.overlay && window.overlay.clipboardWrite) {
                  window.overlay.clipboardWrite(el.value.slice(s, e2));
                }
                el.value = el.value.slice(0, s) + el.value.slice(e2);
                el.selectionStart = el.selectionEnd = s;
                el.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }
            // Ctrl+V - paste from clipboard
            if (data.vkCode === 0x56 && window.overlay && window.overlay.clipboardRead) {
              const text = window.overlay.clipboardRead();
              if (text) {
                const s = el.selectionStart ?? el.value.length;
                const e2 = el.selectionEnd ?? s;
                el.value = el.value.slice(0, s) + text + el.value.slice(e2);
                el.selectionStart = el.selectionEnd = s + text.length;
                el.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }
          }
        });
      }

      // ── Stop capture when Escape is pressed (sent from main) ──
      if (window.overlay.onNativeInputStop) {
        window.overlay.onNativeInputStop(() => {
          if (captureTarget) {
            captureTarget.classList.remove('native-capture-active');
            captureTarget.blur();
            captureTarget = null;
          }
          document.body.classList.remove('input-captured');
        });
      }

      document.addEventListener('dblclick', (e) => {
        const t = e.target;
        if (isTextInput(t) || t.closest('input, textarea, select')) {
          t.focus();
          // Select all text on double-click (only for text-like inputs)
          const typ = (t.tagName === 'INPUT' ? (t.type || '').toLowerCase() : '');
          const noSel = ['checkbox','radio','range','color','file','image','button','reset','submit','hidden'];
          if (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !noSel.includes(typ))) {
            try { t.selectionStart = 0; t.selectionEnd = t.value.length; } catch(_) {}
          }
        }
      });
    }

    // Track mousedown on inputs to block pawn card drag (works with or without overlay)
    if (!window.overlay) {
      document.addEventListener('mousedown', (e) => {
        App._dragFromInput = !!(e.target.closest('input, textarea, select'));
      });
    }

    // Re-apply layout on resize (widget ↔ full transitions)
    let _resizeTimer;
    let _prevWidth = window.innerWidth;
    window.addEventListener('resize', () => {
      // During the widget↔windowed bounds animation every step fires a resize event;
      // all re-render work is deferred to the single widget-mode-changed pass at the
      // end, so each animation frame is pure compositor work.
      if (this._modeAnimating) return;
      const newWidth = window.innerWidth;
      const crossedWidget = (_prevWidth <= 550) !== (newWidth <= 550);
      const crossedNarrow = (_prevWidth <= 900) !== (newWidth <= 900);

      if (crossedWidget || crossedNarrow) {
        // Mode switch, apply immediately for clean transition
        clearTimeout(_resizeTimer);
        _prevWidth = newWidth;
        this.applySettings();
        this.renderSidebar();
        const tab = this.state.activeTab;
        if (tab === 'sched') this.renderSchedule();
        if (tab === 'armoury') this.renderArmoury();
        if (tab === 'dash') this.renderDashboard();
        if (tab === 'help') this.renderHelp();
        if (tab === 'legal') this.renderLegal();
        if (tab === 'blue') this.renderBlueprint();
        if (tab === 'work') this.renderTable();
        if (tab === 'ideo') this.renderIdeology();
        return;
      }

      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(() => {
        _prevWidth = newWidth;
        this.applySettings();
        if (this.state.activeTab === 'armoury' && this.refreshArmouryResponsiveLayout) {
          this.refreshArmouryResponsiveLayout();
        }
      }, 150);
    });

    window.addEventListener('keydown', (e) => {
      // Undo/Redo
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); this.undo(); }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); this.redo(); }

      // Blueprint: Q/E rotate the object you're placing (and its hover ghost) - Q
      // left, E right. While placing a cut/stamp clipboard, Q/E rotate that stamp.
      if (!e.ctrlKey && !e.metaKey && !e.altKey && this.state.activeTab === 'blue') {
        const t = e.target;
        const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
        if (!typing && !document.querySelector('.modal-overlay.show')) {
          const k = e.key.toLowerCase();
          const stampMode = this.state.drawMode === 'stamp_place';
          if (k === 'q') { e.preventDefault(); if (stampMode && this.rotateStamp) this.rotateStamp(-1); else if (this.rotateBlueprintTool) this.rotateBlueprintTool(-1); }
          else if (k === 'e') { e.preventDefault(); if (stampMode && this.rotateStamp) this.rotateStamp(1); else if (this.rotateBlueprintTool) this.rotateBlueprintTool(1); }
          else if (k === 'f' && stampMode) { e.preventDefault(); if (this.flipStamp) this.flipStamp(); }
        }
      }
      
      // Theme Toggle (Ctrl+Shift+T)
      if (e.ctrlKey && e.shiftKey && (e.key === 'T' || e.key === 't')) {
        e.preventDefault();
        this.state.settings.theme = this.state.settings.theme === 'dark' ? 'light' : 'dark';
        this.applyTheme();
        if (this.state.activeTab === 'settings') this.renderSettings();
        this.triggerAutoSave();
      }

      // Modal Shortcuts (Enter to Submit, Esc to Close)
      const activeModal = document.querySelector('.modal-overlay.show');
      if (activeModal) {
        if (e.key === 'Escape') {
          e.preventDefault();
          const closeBtn = activeModal.querySelector('.modal-footer .btn:not(.btn-primary)');
          if (closeBtn) closeBtn.click();
          else if (this.closeXenoEditor) this.closeXenoEditor(); // Fallbacks
        }
        if (e.key === 'Enter') {
          // Don't submit if we are in a textarea (optional, but good practice)
          if (e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            const submitBtn = activeModal.querySelector('.modal-footer .btn-primary');
            if (submitBtn) submitBtn.click();
          }
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      App.onResizeMove(e);
      App.onDragMove(e);

      // Global tooltip - rendered on <body> so no overflow/stacking context can clip it
      if (!globalTip) return;
      const btn = e.target.closest('.info-btn');
      if (btn) {
        const src = btn.querySelector('.tooltip');
        if (src) {
          globalTip.innerHTML = src.innerHTML;
          const tipW = 240, tipH = globalTip.offsetHeight || 120;
          let left = e.clientX - tipW - 12;
          let top  = e.clientY - tipH / 2;
          if (left < 8) left = e.clientX + 16;
          if (top < 8) top = 8;
          if (top + tipH > window.innerHeight - 8) top = window.innerHeight - tipH - 8;
          globalTip.style.left = left + 'px';
          globalTip.style.top  = top  + 'px';
          globalTip.style.display = 'block';
        }
      } else {
        globalTip.style.display = 'none';
      }
    });
    window.addEventListener('mouseup', (e) => {
      App.onResizeEnd();
      App.onDragEnd(e);
    });
    
    let _lastPortrait = this._isPortrait();
    new ResizeObserver(() => {
      const portrait = this._isPortrait();
      if (portrait !== _lastPortrait) {
        _lastPortrait = portrait;
        this.renderTable();
        if (this.state.activeTab === 'dash') this.renderDashboard();
      }
      if (this.state.activeTab === 'blue') {
        this._calculateAdaptiveGrid();
        this._canvasResizeAndDraw();
      }
    }).observe(document.body);

    // Final safety save on exit
    window.addEventListener('beforeunload', () => {
      if (App._saveTimer) {
        App.saveData();
      }
    });

    const main = document.querySelector('.main');
    if (main) {
      main.addEventListener('scroll', () => {
        App.state.uiScroll = main.scrollTop;
      });
    }
  },

  // -- AUTOSAVE LOGIC --
  triggerAutoSave() {
    if (!this.state.settings.autoSaveEnabled) return;
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this.saveData();
      this._saveTimer = null;
    }, 1500); // Silent autosave after 1.5s of inactivity
  },

  // -- RESIZING LOGIC --
  initResize(e) {
    e.preventDefault();
    App._resizing = { type: 'sidebar', startX: e.clientX, startWidth: App.state.settings.sidebarWidth };
    document.body.classList.add('resizing-active');
  },
  onResizeMove(e) {
    if (!App._resizing) return;
    const delta = e.clientX - App._resizing.startX;
    const r = document.documentElement.style;
    const appEl = document.querySelector('.app');
    let label;
    if (App._resizing.type === 'sidebar') {
      const newWidth = Math.max(200, Math.min(600, App._resizing.startWidth + delta));
      App.state.settings.sidebarWidth = newWidth;
      if (App._isFullscreenMode()) App.state.settings.sidebarWidthFull = newWidth;
      else App.state.settings.sidebarWidthWindowed = newWidth;
      r.setProperty('--sidebar-width-base', newWidth + 'px');
      if (appEl) appEl.style.gridTemplateColumns = newWidth + 'px 4px 1fr';
      label = Math.round(newWidth) + 'px (' + (App._isFullscreenMode() ? 'fullscreen' : 'windowed') + ')';
    } else {
      const newWidth = Math.max(80, Math.min(400, App._resizing.startWidth + delta));
      App.state.settings.pawnColWidth = newWidth;
      r.setProperty('--pawn-col-width-base', newWidth + 'px');
      label = Math.round(newWidth) + 'px';
    }
    if (App.state.settings.showResizeLabel) App._showResizeReadout(label, e.clientX, e.clientY);
  },
  onResizeEnd() {
    if (!App._resizing) return;
    const resizedSidebar = App._resizing.type === 'sidebar';
    App.saveData();
    document.body.classList.remove('resizing-active');
    App._resizing = null;
    App._hideResizeReadout();
    if (resizedSidebar && App.state.activeTab === 'armoury' && App.refreshArmouryResponsiveLayout) {
      App.refreshArmouryResponsiveLayout();
    }
  },

  _showResizeReadout(text, x, y) {
    let el = document.getElementById('resizeReadout');
    if (!el) {
      el = document.createElement('div');
      el.id = 'resizeReadout';
      el.style.cssText = 'position:fixed; z-index:99999; pointer-events:none; ' +
        'background:var(--accent,#e8a838); color:#1a1205; font-family:monospace; ' +
        'font-weight:800; font-size:12px; padding:4px 9px; border-radius:6px; ' +
        'box-shadow:0 2px 10px rgba(0,0,0,0.45); white-space:nowrap';
      document.body.appendChild(el);
    }
    el.textContent = text;
    const ox = Math.min(x + 16, window.innerWidth - 160);
    const oy = Math.min(y + 16, window.innerHeight - 30);
    el.style.left = ox + 'px';
    el.style.top = oy + 'px';
  },
  _hideResizeReadout() {
    const el = document.getElementById('resizeReadout');
    if (el) el.remove();
  },

  _applyColonyName() {
    const input = document.getElementById('colonyNameInput');
    if (input) input.value = this.state.colonyName || '';
    document.title = this.state.colonyName
      ? `${this.state.colonyName} - RimJobs`
      : 'RimJobs';
  },

  setColonyName(val) {
    this.state.colonyName = val.trim();
    document.title = this.state.colonyName
      ? `${this.state.colonyName} - RimJobs`
      : 'RimJobs';
    this.triggerAutoSave();
  },

  applySettings() {
    if (this._applySettingsRAF) return;
    this._applySettingsRAF = requestAnimationFrame(() => {
      this._applySettingsRAF = null;
      this._applySettingsNow();
    });
  },

  // Fast path: update a single CSS variable without full recalc
  applySingleSetting(varName, value, suffix) {
    document.documentElement.style.setProperty(varName, value + (suffix || ''));
  },

  _applySettingsNow() {
    const s = this.state.settings;
    const r = document.documentElement.style;

    // Fluid scale, dimensionless multiplier based on viewport width.
    // 1.0 @ 1920px, floors at 0.88 for narrow, caps at 1.35 for ultrawide.
    const fluidScale = Math.max(0.88, Math.min(1.35, 0.00025 * window.innerWidth + 0.52));
    r.setProperty('--fluid-scale', fluidScale);

    // Clamp all sizing values to sane minimums so a bad save can't produce
    // invisible/tiny text. Also normalise any non-numeric garbage to defaults.
    const scale      = Math.max(0.5, Math.min(3.0, parseFloat(s.uiScale)     || 1.0));
    const fontSc     = Math.max(0.5, Math.min(2.0, parseFloat(s.fontScale)   || 1.0));
    const tblFont    = Math.max(10,  Math.min(24,  parseFloat(s.tableFontSize)|| 14));
    const jobFont    = Math.max(9,   Math.min(20,  parseFloat(s.jobFontSize)  || 12));
    const catFont    = Math.max(10,  Math.min(24,  parseFloat(s.catFontSize)  || 14));
    const prioSize   = Math.max(20,  Math.min(56,  parseFloat(s.prioSize)     || 28));
    const pawnFont   = Math.max(10,  Math.min(22,  parseFloat(s.pawnCardFontSize) || 13));
    const helpFont   = Math.max(11,  Math.min(24,  parseFloat(s.helpFontSize) || 13));
    // Per-mode sidebar width: if the user has dragged the resizer in the current
    // mode (fullscreen vs windowed), use that remembered width; otherwise
    // auto-size to the window (~348px windowed ~1200, ~473px fullscreen ~3440,
    // interpolated in between). Switching modes restores that mode's width.
    const _fsMode = this._isFullscreenMode();
    const _remembered = _fsMode ? s.sidebarWidthFull : s.sidebarWidthWindowed;
    let sideW;
    if (_remembered && _remembered >= 200) {
      sideW = Math.max(200, Math.min(600, _remembered));
    } else {
      // Default pawn-card sidebar width per mode, sized for the game-matched
      // (larger) fonts: 390px windowed, 555px fullscreen. The user can still
      // drag the resizer to override (remembered per mode above).
      sideW = _fsMode ? 555 : 390;
    }
    const colW       = Math.max(100, Math.min(400, parseFloat(s.pawnColWidth) || 180));
    const collapsed  = s.sidebarCollapsed;

    // Write normalised values back so the Settings sliders reflect reality
    s.uiScale          = scale;
    s.fontScale        = fontSc;
    s.tableFontSize    = tblFont;
    s.jobFontSize      = jobFont;
    s.catFontSize      = catFont;
    s.prioSize         = prioSize;
    s.pawnCardFontSize = pawnFont;
    s.helpFontSize     = helpFont;
    s.sidebarWidth     = sideW;
    s.pawnColWidth     = colW;

    r.setProperty('--ui-scale',            scale);
    r.setProperty('--font-scale',          fontSc);
    r.setProperty('--sidebar-width-base',  sideW   + 'px');
    r.setProperty('--pawn-col-width-base', colW    + 'px');
    r.setProperty('--table-font-size-base',tblFont + 'px');
    r.setProperty('--job-font-size-base',  jobFont + 'px');
    r.setProperty('--cat-font-size-base',  catFont + 'px');
    r.setProperty('--prio-size-base',      prioSize+ 'px');
    r.setProperty('--pawn-font-size-base', pawnFont+ 'px');
    r.setProperty('--help-font-size-base', helpFont+ 'px');

    const pawnScale = Math.max(0.5, Math.min(1.5, parseFloat(s.pawnCardScale) || 1.0));
    s.pawnCardScale = pawnScale;
    const pawnList = document.getElementById('pawnList');
    const isWidget = window.innerWidth <= 550;
    if (pawnList) pawnList.style.zoom = isWidget ? '' : pawnScale;
    r.setProperty('--pawn-card-counter-zoom', isWidget ? 1 : 1 / pawnScale);

    const appEl    = document.querySelector('.app');
    const sidebar  = document.querySelector('.sidebar');
    const resizer  = document.querySelector('.resizer');
    const expandBtn = document.getElementById('sidebarExpandBtn');

    // The automatic fluid-scale (up to 1.35 on wide/ultrawide displays) is good
    // for the spacious main table, but it over-inflates the fixed-purpose
    // sidebar so pawn-card labels wrap and controls overlap. Cap the scale used
    // INSIDE the sidebar to its ~1080/1440p baseline so cards stay tidy at any
    // width. Font/UI-scale user settings still apply on top. (var() resolves
    // --f-base/--pawn-font-size against this overridden --fluid-scale.)
    if (sidebar) sidebar.style.setProperty('--fluid-scale', Math.min(1.05, fluidScale));

    const isNarrow = window.innerWidth <= 900;
    if (isNarrow) {
      // Drawer mode, sidebar controlled by drawer-open class, not inline display
      if (sidebar)   sidebar.style.display = '';
      if (appEl)     appEl.style.gridTemplateColumns = '1fr';
      if (resizer)   resizer.style.display = 'none';
      if (expandBtn) expandBtn.style.display = 'flex';
    } else {
      // Full mode, thoroughly clean up any drawer/widget state
      if (sidebar) {
        sidebar.classList.remove('drawer-open');
        sidebar.style.position = '';
        sidebar.style.transform = '';
        sidebar.style.top = '';
        sidebar.style.left = '';
        sidebar.style.bottom = '';
        sidebar.style.right = '';
        sidebar.style.width = '';
        sidebar.style.height = '';
        sidebar.style.maxHeight = '';
        sidebar.style.zIndex = '';
      }
      const backdrop = document.getElementById('drawerBackdrop');
      if (backdrop) backdrop.classList.remove('show');

      if (collapsed) {
        if (sidebar)   { sidebar.style.display = 'none'; sidebar.classList.add('collapsed'); }
        if (resizer)   resizer.style.display = 'none';
        if (appEl)     appEl.style.gridTemplateColumns = '1fr';
        if (expandBtn) expandBtn.style.display = 'flex';
      } else {
        if (sidebar)   { sidebar.style.display = ''; sidebar.classList.remove('collapsed'); }
        if (resizer)   resizer.style.display = '';
        if (appEl)     appEl.style.gridTemplateColumns = s.sidebarWidth + 'px 4px 1fr';
        if (expandBtn) expandBtn.style.display = 'none';
      }
    }
  },

  toggleSidebar() {
    // At narrow widths, use the slide-over drawer instead of inline collapse
    if (window.innerWidth <= 900) {
      const sidebar = document.querySelector('.sidebar');
      const backdrop = document.getElementById('drawerBackdrop');
      if (sidebar) {
        const isOpen = sidebar.classList.contains('drawer-open');
        sidebar.classList.toggle('drawer-open', !isOpen);
        if (backdrop) backdrop.classList.toggle('show', !isOpen);
      }
      return;
    }
    this.state.settings.sidebarCollapsed = !this.state.settings.sidebarCollapsed;
    this.applySettings();
    if (this.state.activeTab === 'armoury' && this.refreshArmouryResponsiveLayout) {
      this.refreshArmouryResponsiveLayout();
    }
    this.triggerAutoSave();
  },

  closeDrawer() {
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.getElementById('drawerBackdrop');
    if (sidebar) sidebar.classList.remove('drawer-open');
    if (backdrop) backdrop.classList.remove('show');
  },

  applyTheme() {
    const theme = this.state.settings.theme || 'dark';
    const colourBlindMode = this.state.settings.colourBlindMode === true;
    const dyslexiaFontMode = this.state.settings.dyslexiaFontMode === true;
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-colour-vision', colourBlindMode ? 'accessible' : 'default');
    document.documentElement.setAttribute('data-reading-font', dyslexiaFontMode ? 'opendyslexic' : 'default');
    // CSS uses body.light-theme class
    document.body.classList.toggle('light-theme', theme === 'light');
    document.body.classList.toggle('colour-blind-mode', colourBlindMode);
    document.body.classList.toggle('dyslexia-font-mode', dyslexiaFontMode);
    // Match Electron's native UI (tray context menu, dialogs) to the chosen theme.
    if (window.overlay && window.overlay.setNativeTheme) window.overlay.setNativeTheme(theme);
  },

  setColourBlindMode(enabled) {
    this.state.settings.colourBlindMode = enabled === true;
    this.applyTheme();
    this.renderAll();
    if (this.state.activeTab === 'settings') this.renderSettings();
    this.triggerAutoSave();
    this.toast(this.state.settings.colourBlindMode
      ? 'Colour-blind friendly palette enabled'
      : 'Default colour palette restored');
  },

  setDyslexiaFontMode(enabled) {
    this.state.settings.dyslexiaFontMode = enabled === true;
    this.applyTheme();
    this.renderAll();
    if (this.state.activeTab === 'settings') this.renderSettings();
    this.triggerAutoSave();
    this.toast(this.state.settings.dyslexiaFontMode
      ? 'Dyslexia-friendly font enabled'
      : 'Default font restored');
  },

  _canvasFont(sizePx, weight = 'normal', style = 'normal') {
    const size = Math.max(1, Number(sizePx) || 11);
    const family = this.state.settings.dyslexiaFontMode === true
      ? '"OpenDyslexic RimJobs"'
      : 'Arial';
    const prefix = `${style === 'normal' ? '' : `${style} `}${weight === 'normal' ? '' : `${weight} `}`;
    return `${prefix}${size}px ${family}`;
  },

  // Lazily warm mod data the first time the user opens a tab that depends on it. Deferred so the
  // tab paints first (the prefetch + its re-render don't pile onto the click on huge modlists).
  _maybePrefetchForTab(tab) {
    if (tab === 'armoury' && typeof this._prefetchModData === 'function') {
      setTimeout(() => this._prefetchModData(), 80);
    }
  },

  setTab(tab) {
    Perf.start('ui.tabSwitch.total');
    Perf.start('ui.tabSwitch.' + tab);
    Perf._activeOp = 'tabSwitch:' + tab;
    const animationRevision = (this._tabAnimationRevision || 0) + 1;
    this._tabAnimationRevision = animationRevision;
    this.state.activeTab = tab;
    const containedTabs = ['blue', 'relations', 'help', 'legal'];
    const main = document.querySelector('.main');

    Perf.start('ui.tabSwitch.domToggle');
    document.querySelectorAll('.main-tab').forEach(t => t.classList.toggle('active', t.id === `tab-${tab}`));
    if (this._relCleanup && tab !== 'relations') this._relCleanup();
    ['work', 'settings', 'dash', 'sched', 'help', 'blue', 'notes', 'armoury', 'ideo', 'relations', 'records', 'raid', 'legal'].forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) {
        el.style.display = tab === v ? 'flex' : 'none';
        el.classList.toggle('contained', tab === v && containedTabs.includes(v));
        if (tab === v) {
          el.classList.remove('view-anim');
          requestAnimationFrame(() => requestAnimationFrame(() => {
            if (this._tabAnimationRevision === animationRevision && this.state.activeTab === tab) {
              el.classList.add('view-anim');
            }
          }));
        }
      }
    });
    if (main) main.classList.toggle('view-contained', containedTabs.includes(tab));
    Perf.end('ui.tabSwitch.domToggle');

    this._renderTabView(tab);

    Perf.start('ui.tabSwitch.postRender');
    this._maybePrefetchForTab(tab);
    this.applyTabVisibility();
    this.triggerAutoSave();
    Perf.end('ui.tabSwitch.postRender');
    Perf._activeOp = null;
    Perf.end('ui.tabSwitch.' + tab);
    Perf.end('ui.tabSwitch.total');
    Perf.increment('ui.tabSwitch.count');
  },

  // Render the per-tab view for a tab id. The priorities/work view is handled by renderAll;
  // these are the tabs whose content is built on demand. Used by setTab and after a save
  // import (so the active tab, e.g. the Ideology pills, refreshes without a manual tab switch).
  _renderTabView(tab) {
    let _ctxMap;
    const ctxMap = () => _ctxMap ||= this._c7PawnContextMap(
      this.state.pawns, this._c7EvidenceOptionsByPawn);
    const r = (name, fn) => Perf.measure('render.tab.' + name, fn);
    if (tab === 'settings') r('settings', () => this.renderSettings());
    if (tab === 'dash') r('dash', () => this.renderDashboard(ctxMap()));
    if (tab === 'sched') r('sched', () => this.renderSchedule(ctxMap()));
    if (tab === 'help') r('help', () => this.renderHelp());
    if (tab === 'blue') r('blue', () => this.renderBlueprint());
    if (tab === 'notes') r('notes', () => this.renderJournal());
    if (tab === 'armoury') r('armoury', () => this.renderArmoury());
    if (tab === 'ideo') r('ideo', () => this.renderIdeology());
    if (tab === 'relations') r('relations', () => this.renderRelations());
    if (tab === 'records') r('records', () => this.renderRecords());
    if (tab === 'raid') r('raid', () => this.renderRaid());
    if (tab === 'legal') r('legal', () => this.renderLegal());
  },

  applyTabVisibility() {
    const hidden = this.state.settings.hiddenTabs || [];
    const allTabs = ['work','sched','armoury','blue','notes','dash','ideo','relations','records','raid','settings','help','legal'];
    allTabs.forEach(t => {
      const tabEl = document.getElementById(`tab-${t}`);
      if (tabEl) tabEl.style.display = hidden.includes(t) ? 'none' : '';
    });
  },

  toggleTabVisibility(tabId) {
    const hidden = this.state.settings.hiddenTabs || [];
    const idx = hidden.indexOf(tabId);
    if (idx >= 0) hidden.splice(idx, 1);
    else hidden.push(tabId);
    this.state.settings.hiddenTabs = hidden;
    this.applyTabVisibility();
    this.renderSettings();
    this.triggerAutoSave();
  },

  // -- STATE HELPERS --
  _refreshCaches() {
    const deleted = this.state.deletedMaterials || [];
    this._materialsCache = [...MATERIAL_TYPES, ...this.state.customMaterials].filter(m => !deleted.includes(m.id));
    const deletedBlds = this.state.deletedPresetBuildings || [];
    // Apply per-object colour/shape overrides. Clone the entry when an override
    // exists so the shared PRESET_BUILDINGS defs are never mutated.
    const ov = (this.state.buildingOverrides && typeof this.state.buildingOverrides === 'object') ? this.state.buildingOverrides : {};
    const applyOv = (b) => {
      const o = ov[b.id];
      if (!o) return b;
      const c = { ...b };
      if (o.color) c.color = o.color;
      if (o.shape) c.shape = o.shape;
      return c;
    };
    this._buildingsCache = [
      ...PRESET_BUILDINGS.filter(b => !deletedBlds.includes(b.id)).map(applyOv),
      ...Object.values(this.state.customBuildings).map(applyOv),
    ];
    this._colorCache = {};
  },

  clearCaches() {
    // Flush every internal render cache so the next renderAll rebuilds from scratch
    this._bsCache = null;
    this._ideoFxCache = null;
    this._ideoFxKey = null;
    this._pawnCardHashes = {};
    this._lastSidebarOrder = null;
    this._colorCache = {};
    this._defLabels = null;
    if (typeof this._c4InvalidateSnapshot === 'function') this._c4InvalidateSnapshot();
    this._refreshCaches();
    this.renderAll();
    this.toast('Caches cleared, full rebuild done');
  },
  get allMaterials() { return this._materialsCache || []; },
  get allXenotypes() { return { ...PRESET_XENOTYPES, ...this.state.customXenotypes }; },
  getXeno(id) { return this.allXenotypes[id] || PRESET_XENOTYPES.baseliner; },
  get allTraits() { return [...TRAITS, ...Object.entries(this.state.customTraits).map(([k, v]) => ({ ...v, id: k }))]; },
  getTrait(id) { return this.allTraits.find(t => t.id === id); },
  get allJobs() { return [...JOBS, ...this.state.customJobs]; },
  get allBuildings() { return this._buildingsCache || []; },
  _roleDefinitionIsActive(role) {
    if (!role || !this.state.importMeta || !Array.isArray(this.state.importMeta.modIds)) return true;
    const modId = role._provenance && role._provenance.modId;
    if (!modId) return true;
    const active = this.state.saveModIdSet instanceof Set
      ? this.state.saveModIdSet
      : new Set(this.state.importMeta.modIds.map(id => String(id).toLowerCase()));
    return active.has(String(modId).toLowerCase());
  },
  get allRoles() {
    const byId = new Map(DEFAULT_ROLES.map(role => [role.id, role]));
    const scanned = this.state.scannedRoles && typeof this.state.scannedRoles === 'object'
      ? Object.values(this.state.scannedRoles) : [];
    const extra = [];
    for (const role of scanned) {
      if (!role || !role.id || !this._roleDefinitionIsActive(role)) continue;
      if (byId.has(role.id)) byId.set(role.id, role);
      else extra.push(role);
    }
    return Array.from(byId.values()).concat(extra.sort((a, b) =>
      String(a.label || '').localeCompare(String(b.label || ''))));
  },
  getRole(id) { return this.allRoles.find(role => role.id === id) || DEFAULT_ROLES[0]; },
  getRoleByDefName(defName) {
    if (!defName) return null;
    return this.allRoles.find(role => role.defName === defName) || null;
  },
  _reconcileSaveRoleDefinitions() {
    let changed = 0;
    for (const pawn of this.state.pawns || []) {
      if (!pawn || pawn.roleSource !== 'save' || !pawn.saveRoleDef) continue;
      const role = this.getRoleByDefName(pawn.saveRoleDef);
      const nextRole = role ? role.id : 'none';
      if (pawn.role === nextRole) continue;
      pawn.role = nextRole;
      changed++;
    }
    if (changed && typeof this._c4InvalidateSnapshot === 'function') this._c4InvalidateSnapshot();
    return changed;
  },

  // ── MOD AWARENESS HELPERS ─────────────────────────────────────
  _getUniqueModSources() {
    const sources = new Set();
    const scan = items => { if (items) (Array.isArray(items) ? items : Object.values(items)).forEach(i => { if (i && i.modSource) sources.add(i.modSource); }); };
    scan(this.state.customXenotypes);
    scan(this.state.customTraits);
    scan(this.state.customJobs);
    scan(this.state.weapons);
    scan(this.state.apparel);
    scan(this.state.customBuildings);
    scan(this.state.customMaterials);
    scan(this.state.customBiomes);
    return [...sources].sort();
  },

  // Combined vanilla + custom memes list
  _allMemes() {
    const vanilla = typeof IDEO_MEMES !== 'undefined' ? IDEO_MEMES : [];
    const custom = this.state.customMemes || {};
    const customArr = Object.entries(custom).filter(([, m]) => m && typeof m === 'object' && !Array.isArray(m))
      .map(([id, m]) => ({ id, ...IdeologyData.sanitiseDefinition(m, id) }));
    return [...vanilla, ...customArr];
  },

  // Combined vanilla + custom rituals list
  _allRituals() {
    const vanilla = typeof IDEO_RITUALS !== 'undefined' ? IDEO_RITUALS : [];
    const custom = this.state.customRituals || {};
    const customArr = Object.entries(custom).filter(([, r]) => r && typeof r === 'object' && !Array.isArray(r))
      .map(([id, r]) => ({ id, ...IdeologyData.sanitiseDefinition(r, id) }));
    return [...vanilla, ...customArr];
  },

  // Aggregate ideology effects (memes + precepts) for engine consumption
  // Cached per render cycle - invalidated on ideology change
  _ideoFxCache: null,
  _ideoFxKey: '',
  // True when a precept option is selectable under the given meme set. Stored choices
  // whose enabling meme was later removed (or whose blocker was added) fail this, so
  // they stop counting in the maths instead of silently lingering.
  _ideoOptionValid(pDef, optId, memes) {
    const o = pDef && pDef.options && pDef.options.find(x => x.id === optId);
    if (!o) return false;
    const m = Array.isArray(memes) ? memes : [];
    if (o.blockedByMemes && o.blockedByMemes.some(x => m.includes(x))) return false;
    const required = this._allMemes().filter(meme => m.includes(meme.id))
      .map(meme => meme.requiredPrecepts && meme.requiredPrecepts[pDef.id]).filter(Array.isArray);
    if (required.length) return required.every(options => options.includes(optId));
    if (o.requiredMemes && !o.requiredMemes.some(x => m.includes(x))) return false;
    if (o.enabledByMemes && !o.enabledByMemes.some(x => m.includes(x))) return false;
    return true;
  },

  // One effective selection map feeds both the controls and engine totals.
  // Validate catalogue references before locking anything, even if future
  // definitions contain an unsupported forced option.
  getIdeoPreceptState() {
    const ideo = this.state.ideology || {};
    const memes = Array.isArray(ideo.memes) ? ideo.memes : [];
    const selected = {}, forcedBy = {};
    const allMemes = this._allMemes().filter(m => memes.includes(m.id));
    for (const pDef of IDEO_PRECEPT_DEFS) {
      const stored = ideo.precepts && ideo.precepts[pDef.id];
      if (this._ideoOptionValid(pDef, stored, memes)) selected[pDef.id] = stored;
      const required = allMemes.map(m => m.requiredPrecepts && m.requiredPrecepts[pDef.id]).filter(Array.isArray);
      if (!selected[pDef.id] && required.length) {
        const option = pDef.options.find(o => this._ideoOptionValid(pDef, o.id, memes));
        if (option) selected[pDef.id] = option.id;
      }
      for (const meme of allMemes) {
        const forced = meme.forcedPrecepts && meme.forcedPrecepts[pDef.id];
        if (pDef.options.some(o => o.id === forced)) {
          selected[pDef.id] = forced;
          forcedBy[pDef.id] = meme.label;
        }
      }
    }
    return { selected, forcedBy };
  },

  getIdeoEffects() {
    const ideo = this.state.ideology || { memes: [], precepts: {} };
    const key = JSON.stringify([ideo.memes, ideo.precepts]);
    if (this._ideoFxCache && this._ideoFxKey === key) return this._ideoFxCache;
    const allMemes = this._allMemes();
    const fx = { mood: 0, workSpeed: 0, combatSkill: 0, socialSkill: 0, researchSpeed: 0 };
    if (ideo.memes) {
      ideo.memes.forEach(mId => {
        const m = allMemes.find(x => x.id === mId);
        if (m && m.effects) {
          if (m.effects.mood) fx.mood += m.effects.mood;
          if (m.effects.workSpeed) fx.workSpeed += m.effects.workSpeed;
          if (m.effects.combatSkill) fx.combatSkill += m.effects.combatSkill;
          if (m.effects.socialSkill) fx.socialSkill += m.effects.socialSkill;
          if (m.effects.researchSpeed) fx.researchSpeed += m.effects.researchSpeed;
        }
      });
    }
    const effectivePrecepts = this.getIdeoPreceptState().selected;
    Object.entries(effectivePrecepts).forEach(([pId, optId]) => {
      const pDef = (typeof IDEO_PRECEPT_DEFS !== 'undefined' ? IDEO_PRECEPT_DEFS : []).find(x => x.id === pId);
      if (!pDef) return;
      const opt = pDef.options.find(o => o.id === optId);
      if (!opt) return;
      if (opt.mood) fx.mood += opt.mood;
      if (opt.workSpeed) fx.workSpeed += opt.workSpeed;
      if (opt.combatSkill) fx.combatSkill += opt.combatSkill;
      if (opt.socialSkill) fx.socialSkill += opt.socialSkill;
      if (opt.researchSpeed) fx.researchSpeed += opt.researchSpeed;
    });
    this._ideoFxCache = fx;
    this._ideoFxKey = key;
    return fx;
  },


  // ────────────────────────────────────────────────────
  // Methods above are core. Additional methods loaded from:
  //   app-pawns.js, app-render.js, app-schedule.js,
  //   app-blueprint.js, app-raid.js, app-priorities.js,
  //   app-editors.js, app-combat.js, app-tabs.js, app-save.js
  // ────────────────────────────────────────────────────

  toast(msg, duration = 2200) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  },

  _posLocked: false,

  togglePin() {
    if (!window.overlay || !window.overlay.toggleLockPosition) return;
    window.overlay.toggleLockPosition();
  },

  setAlwaysOnTop(val) {
    this.state.settings.alwaysOnTop = !!val;
    if (window.overlay && window.overlay.setAlwaysOnTop) window.overlay.setAlwaysOnTop(!!val);
    this.triggerAutoSave();
  },

  _applyWindowTransparency() {
    const settings = this.state.settings || {};
    const parsed = Number(settings.windowOpacity);
    const opacity = Number.isFinite(parsed) ? Math.max(0.3, Math.min(1, parsed)) : 1;
    const locked = settings.transparencyLocked === true;
    settings.windowOpacity = opacity;
    settings.transparencyLocked = locked;

    const slider = document.querySelector('.overlay-opacity-slider');
    if (slider) {
      slider.value = String(Math.round(opacity * 100));
      slider.disabled = this._opacitySupported === false || locked;
      slider.setAttribute('aria-disabled', slider.disabled ? 'true' : 'false');
      const label = slider.closest('label');
      if (label) {
        label.title = this._opacitySupported === false
          ? 'Graphics recovery is active. Window transparency is disabled for reliable software rendering.'
          : locked
            ? `Window transparency locked at ${Math.round(opacity * 100)}%`
            : `Window opacity: ${Math.round(opacity * 100)}%`;
      }
    }

    if (this._opacitySupported === false || !window.overlay) return;
    // Apply the saved level before enabling the native guard. This restores a locked
    // level on launch while still rejecting later slider or stale-event changes.
    if (window.overlay.setOpacityLock) window.overlay.setOpacityLock(false);
    if (window.overlay.setOpacity) window.overlay.setOpacity(opacity);
    if (window.overlay.setOpacityLock) window.overlay.setOpacityLock(locked);
  },

  setWindowOpacity(value) {
    if (this.state.settings.transparencyLocked === true || this._opacitySupported === false) {
      this._applyWindowTransparency();
      return;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    this.state.settings.windowOpacity = Math.max(0.3, Math.min(1, parsed));
    this._applyWindowTransparency();
    this.triggerAutoSave();
  },

  setTransparencyLocked(locked) {
    this.state.settings.transparencyLocked = locked === true;
    this._applyWindowTransparency();
    this.triggerAutoSave();
  },

  showQuitConfirm() {
    if (!window.overlay) return;
    const isMin = document.body.classList.contains('is-minimized');
    if (isMin && window.overlay.expandCollapsedForQuit) {
      window.overlay.expandCollapsedForQuit();
    }
    const overlay = document.getElementById('quitOverlay');
    const content = document.getElementById('quitOverlayContent');
    if (!overlay || !content) return;
    const cancelAction = isMin
      ? "App.hideQuitOverlay(); if(window.overlay.collapseAfterQuitCancel) window.overlay.collapseAfterQuitCancel()"
      : "App.hideQuitOverlay()";
    const compact = isMin || window.innerHeight < 200;
    const pad = compact ? '10px 14px' : '24px 32px';
    const rad = compact ? '8px' : '12px';
    const gap = compact ? '4px' : '6px';
    const btnGap = compact ? '6px' : '18px';
    content.innerHTML = `
      <div style="background:var(--surface3); border:1px solid var(--border-bright); border-radius:${rad}; padding:${pad}; text-align:center; box-shadow:0 16px 48px rgba(0,0,0,0.5); max-width:320px; width:90vw; max-height:calc(100vh - 16px); overflow:auto">
        <div style="font-size:calc(14px * var(--font-scale)); font-weight:800; color:var(--text); margin-bottom:${gap}">Quit RimJobs?</div>
        <div style="font-size:calc(11px * var(--font-scale)); color:var(--text3); margin-bottom:${btnGap}">Unsaved changes will be lost.</div>
        <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap">
          <button onclick="App.saveData(); window.overlay.confirmQuit()" style="background:var(--accent); color:#000; border:none; padding:6px 16px; border-radius:6px; font-weight:700; font-size:calc(12px * var(--font-scale)); cursor:pointer; font-family:inherit">Save &amp; Quit</button>
          <button onclick="window.overlay.confirmQuit()" style="background:rgba(220,60,60,0.8); color:#fff; border:none; padding:6px 16px; border-radius:6px; font-weight:700; font-size:calc(12px * var(--font-scale)); cursor:pointer; font-family:inherit">Quit</button>
          <button onclick="${cancelAction}" style="background:var(--surface2); color:var(--text2); border:1px solid var(--border-med); padding:6px 16px; border-radius:6px; font-size:calc(12px * var(--font-scale)); cursor:pointer; font-family:inherit">Cancel</button>
        </div>
      </div>`;
    overlay.style.display = 'flex';
  },

  hideQuitOverlay() {
    const overlay = document.getElementById('quitOverlay');
    if (overlay) overlay.style.display = 'none';
  },

  // -- RENAME --

  // ── GENERIC MODAL SYSTEM ──────────────────────────────────────
  _modalResolve: null,
  _modalReject: null,

  _modalEscHandler: null,

  _bindModalEsc() {
    this._modalEscHandler = (e) => { if (e.key === 'Escape') App._dismissModal(false); };
    document.addEventListener('keydown', this._modalEscHandler);
  },
  _unbindModalEsc() {
    if (this._modalEscHandler) document.removeEventListener('keydown', this._modalEscHandler);
    this._modalEscHandler = null;
  },

  /** Show a generic modal with custom body HTML and buttons. */
  _showGenericModal(title, bodyHtml, buttons = []) {
    const modal = document.getElementById('genericModal');
    document.getElementById('genericModalTitle').textContent = title;
    document.getElementById('genericModalBody').innerHTML = bodyHtml;
    const footerBtns = buttons.map(b => {
      if (b.action === 'dismiss') return `<button class="btn btn-primary" onclick="document.getElementById('genericModal').classList.remove('show')">${_escapeHtml(b.label)}</button>`;
      return `<button class="btn" onclick="${b.action}">${_escapeHtml(b.label)}</button>`;
    }).join('');
    document.getElementById('genericModalFooter').innerHTML = footerBtns || `<button class="btn btn-primary" onclick="document.getElementById('genericModal').classList.remove('show')">Close</button>`;
    modal.classList.add('show');
  },

  /** Show a confirm overlay. Returns a Promise that resolves on OK, rejects on Cancel. */
  showConfirm(message, okLabel = 'Confirm', detail = '', cancelLabel = 'Cancel') {
    return new Promise((resolve, reject) => {
      this._modalResolve = resolve;
      this._modalReject = reject;
      this._bindModalEsc();
      const modal = document.getElementById('genericModal');
      document.getElementById('genericModalTitle').textContent = 'Confirm';
      document.getElementById('genericModalBody').innerHTML = `
        <p style="margin:0; color:var(--text); font-size:var(--f-sm); line-height:1.6">${_escapeHtml(message)}</p>
        ${detail ? `<p style="margin:var(--gap-sm) 0 0; color:var(--text3); font-size:var(--f-xs); line-height:1.5">${_escapeHtml(detail)}</p>` : ''}
      `;
      document.getElementById('genericModalFooter').innerHTML = `
        <button class="btn" onclick="App._dismissModal(false)">${_escapeHtml(cancelLabel)}</button>
        <button class="btn btn-primary" id="genericModalOk" onclick="App._dismissModal(true)">${_escapeHtml(okLabel)}</button>
      `;
      modal.classList.add('show');
      setTimeout(() => document.getElementById('genericModalOk')?.focus(), 50);
    });
  },

  /** Show a prompt overlay with one text input. Returns a Promise that resolves with the value, rejects on Cancel. */
  showPrompt(message, placeholder = '', defaultVal = '') {
    return new Promise((resolve, reject) => {
      this._modalResolve = resolve;
      this._modalReject = reject;
      this._bindModalEsc();
      const modal = document.getElementById('genericModal');
      document.getElementById('genericModalTitle').textContent = message;
      document.getElementById('genericModalBody').innerHTML = `
        <input type="text" id="genericModalInput" class="skill-input" value="${_escapeHtml(defaultVal)}" placeholder="${_escapeHtml(placeholder)}" style="width:100%; text-align:left; padding:10px 14px">
      `;
      document.getElementById('genericModalFooter').innerHTML = `
        <button class="btn" onclick="App._dismissModal(false)">Cancel</button>
        <button class="btn btn-primary" onclick="App._dismissModal(true)">OK</button>
      `;
      modal.classList.add('show');
      const inp = document.getElementById('genericModalInput');
      setTimeout(() => { inp?.focus(); inp?.select(); }, 50);
      inp?.addEventListener('keydown', e => { if (e.key === 'Enter') App._dismissModal(true); });
    });
  },

  /** Show a multi-field prompt. fields = [{id, label, placeholder, defaultVal, type}]. Resolves with {id: value, …}. */
  showMultiPrompt(title, fields) {
    return new Promise((resolve, reject) => {
      this._modalResolve = resolve;
      this._modalReject = reject;
      this._bindModalEsc();
      const modal = document.getElementById('genericModal');
      document.getElementById('genericModalTitle').textContent = title;
      document.getElementById('genericModalBody').innerHTML = fields.map(f => `
        <div style="margin-bottom:var(--gap-md)">
          <label style="font-size:var(--f-xs);color:var(--text3);font-weight:700;text-transform:uppercase;display:block;margin-bottom:6px">${_escapeHtml(f.label)}</label>
          <input type="${f.type || 'text'}" id="gm_${f.id}" class="skill-input" value="${_escapeHtml(f.defaultVal || '')}" placeholder="${_escapeHtml(f.placeholder || '')}" style="width:100%; text-align:left; padding:10px 14px">
        </div>
      `).join('');
      document.getElementById('genericModalFooter').innerHTML = `
        <button class="btn" onclick="App._dismissModal(false)">Cancel</button>
        <button class="btn btn-primary" onclick="App._dismissModal(true)">OK</button>
      `;
      modal.classList.add('show');
      setTimeout(() => document.getElementById('gm_' + fields[0]?.id)?.focus(), 50);
    });
  },

  /** Show a modal with custom HTML body content. Returns a Promise that resolves on confirm. */
  showCustomModal(title, bodyHtml, confirmLabel = 'OK') {
    return new Promise((resolve, reject) => {
      this._modalResolve = resolve;
      this._modalReject = reject;
      this._bindModalEsc();
      const modal = document.getElementById('genericModal');
      document.getElementById('genericModalTitle').textContent = title;
      document.getElementById('genericModalBody').innerHTML = bodyHtml;
      document.getElementById('genericModalFooter').innerHTML = `
        <button class="btn" onclick="App._dismissModal(false)">Cancel</button>
        <button class="btn btn-primary" onclick="App._dismissModal(true)">${_escapeHtml(confirmLabel)}</button>
      `;
      modal.classList.add('show');
    });
  },

  /** Show an alert overlay (single OK button). Returns a Promise. */
  showAlert(message) {
    return new Promise((resolve) => {
      this._modalResolve = resolve;
      this._modalReject = null;
      this._bindModalEsc();
      const modal = document.getElementById('genericModal');
      document.getElementById('genericModalTitle').textContent = 'Notice';
      document.getElementById('genericModalBody').innerHTML = `
        <p style="margin:0; color:var(--text); font-size:var(--f-sm); line-height:1.6">${_escapeHtml(message)}</p>
      `;
      document.getElementById('genericModalFooter').innerHTML = `
        <button class="btn btn-primary" onclick="App._dismissModal(true)">OK</button>
      `;
      modal.classList.add('show');
    });
  },

  _dismissModal(accepted) {
    this._unbindModalEsc();
    document.getElementById('genericModal')?.classList.remove('show');
    if (accepted) {
      // Check if it was a multi-prompt
      const multiInputs = document.querySelectorAll('#genericModalBody [id^="gm_"]');
      if (multiInputs.length > 0) {
        const result = {};
        multiInputs.forEach(inp => { result[inp.id.replace('gm_', '')] = inp.value; });
        this._modalResolve?.(result);
      } else {
        const input = document.getElementById('genericModalInput');
        this._modalResolve?.(input ? input.value : true);
      }
    } else {
      if (this._modalReject) this._modalReject();
      else this._modalResolve?.(null);
    }
    this._modalResolve = null;
    this._modalReject = null;
  },

  _syncWindowSizes() {
    if (!window.overlay || !window.overlay.setWindowSizes) return;
    const s = this.state.settings;
    window.overlay.setWindowSizes(
      { width: s.widgetWidth || 420, height: s.widgetHeight || 700 },
      { width: s.fullWidth || 1200, height: s.fullHeight || 850 }
    );
  },

};

document.addEventListener('DOMContentLoaded', () => App.init());

// Global error safety net - log and show toast instead of silently dying
window.onerror = (msg, src, line, col, err) => {
  const detail = typeof msg === 'string' ? msg : (err && err.message ? err.message : 'Unknown error');
  const stack = err && err.stack ? err.stack : '';
  if (typeof App !== 'undefined' && App.toast) {
    App.toast('Something went wrong. Open Settings > Developer console to inspect.', 5000);
  }
  if (typeof App !== 'undefined' && App._logToConsole) App._logToConsole('error', detail, src ? (src + ':' + line + ':' + col) : '', stack);
  if (typeof App !== 'undefined' && App._crashProbe) App._crashProbe('renderer.error', { message: detail, line, col, stack });
  return false;
};
window.addEventListener('unhandledrejection', (e) => {
  const detail = e.reason && e.reason.message ? e.reason.message : String(e.reason || 'Unknown');
  const stack = e.reason && e.reason.stack ? e.reason.stack : '';
  if (typeof App !== 'undefined' && App.toast) {
    App.toast('Something went wrong. Open Settings > Developer console to inspect.', 5000);
  }
  if (typeof App !== 'undefined' && App._logToConsole) App._logToConsole('error', detail, '', stack);
  if (typeof App !== 'undefined' && App._crashProbe) App._crashProbe('renderer.unhandled-rejection', { message: detail, stack });
});

// Keyboard shortcut: Ctrl+` to toggle in-app console
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === '`') {
    e.preventDefault();
    if (typeof App !== 'undefined') App.toggleConsoleDrawer();
  }
});

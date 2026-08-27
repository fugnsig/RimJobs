const { app, BrowserWindow, globalShortcut, ipcMain, screen, Tray, Menu, dialog, clipboard, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const APP_VERSION = require('./package.json').version;

// ─── Auto-elevate to admin (needed for WH_KEYBOARD_LL to intercept game input) ───
function isAdmin() {
  try { execSync('net session', { stdio: 'ignore' }); return true; }
  catch (_) { return false; }
}

if (!isAdmin()) {
  app.whenReady().then(() => {
    // Only show the explanation dialog on first run; after that just silently re-elevate
    const markerDir = app.getPath('userData');
    const markerFile = path.join(markerDir, '.admin-prompt-shown');
    let firstRun = true;
    try { firstRun = !fs.existsSync(markerFile); } catch (_) {}

    if (firstRun) {
      dialog.showMessageBoxSync({
        type: 'info',
        title: 'RimJobs - Admin Required',
        message: 'RimJobs needs administrator privileges to capture keyboard input over RimWorld. You will see a Windows UAC prompt next. This message only appears once.',
        buttons: ['OK'],
        defaultId: 0,
        icon: path.join(__dirname, 'files', 'rimjobs.ico')
      });
      // Mark that we have shown the dialog
      try { fs.mkdirSync(markerDir, { recursive: true }); fs.writeFileSync(markerFile, '1'); } catch (_) {}
    }

    // Use native ShellExecuteW with 'runas' verb, the proper Windows elevation API
    const koffi = require('koffi');
    const shell32 = koffi.load('shell32.dll');
    const ShellExecuteW = shell32.func('void* __stdcall ShellExecuteW(void* hwnd, str16 lpOperation, str16 lpFile, str16 lpParameters, str16 lpDirectory, int nShowCmd)');

    // For portable builds, PORTABLE_EXECUTABLE_FILE is the original .exe path
    const exePath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    const args = process.env.PORTABLE_EXECUTABLE_FILE ? '' : process.argv.slice(1).join(' ');

    ShellExecuteW(null, 'runas', exePath, args, null, 1);
    app.exit(0);
  });
  // Prevent the rest of main.js from running in the non-admin instance
  return;
}

// ─── Single instance lock ───
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // A second launch was attempted: instead of opening another instance,
    // surface the existing window (restore from minimised, un-hide from tray,
    // and bring it back on top). The window is focusable:false, so we use
    // showInactive() and re-assert always-on-top rather than focus().
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.showInactive();
    win.setAlwaysOnTop(alwaysOnTop, 'screen-saver');
    forceTaskbar();
    isVisible = true;
  });
}

const keyboardHook = require('./keyboard-hook');

app.setName('RimJobs');
process.title = 'RimJobs';

// Remove the default application menu so pressing Alt (used as the eyedropper
// Alt+Click modifier) doesn't activate/focus the native window menu bar.
Menu.setApplicationMenu(null);

let win = null;
let tray = null;
let isVisible = true;

// A focusable:false overlay is hidden from the Windows taskbar; a plain
// setSkipTaskbar(false) often won't re-add the button. Toggling true->false
// re-applies the app-window style, so use this on every "make it visible" path.
function forceTaskbar() {
  if (!win) return;
  try { win.setSkipTaskbar(true); win.setSkipTaskbar(false); } catch (_) {}
}

// Reveal the window exactly once, after the renderer has settled into its final startup mode.
// A short opacity fade gives a polished cold open instead of a pop-in or a visible resize.
let appRevealed = false;
function revealWindow() {
  if (!win || appRevealed) return;
  appRevealed = true;
  win.showInactive();
  forceTaskbar();
  setTimeout(() => forceTaskbar(), 600);
  let o = 0;
  const fade = () => {
    if (!win) return;
    o = Math.min(1, o + 0.14);
    try { win.setOpacity(o); } catch (_) {}
    if (o < 1) setTimeout(fade, 16);
  };
  fade();
}

let isWidgetMode = true;
let forceQuit = false;
let inputCaptureActive = false;
let preFullscreenBounds = null;
let alwaysOnTop = true; // user-toggleable; re-asserts below honour this
let quitting = false;

// Quit completely and immediately. Tear down the native keyboard hook, global shortcuts,
// tray and window, then FORCE-exit with app.exit() instead of app.quit(). app.quit() can
// leave the process (and its taskbar button) lingering until clicked when a native hook
// thread is still alive; app.exit() terminates the process outright.
function doQuit() {
  if (quitting) return;
  quitting = true;
  forceQuit = true;
  try { keyboardHook.stopCapture && keyboardHook.stopCapture(); } catch (_) {}
  try { keyboardHook.uninstall && keyboardHook.uninstall(); } catch (_) {}
  try { globalShortcut.unregisterAll(); } catch (_) {}
  try { if (tray) { tray.destroy(); tray = null; } } catch (_) {}
  try { if (win) { win.removeAllListeners('close'); win.setSkipTaskbar(true); win.destroy(); win = null; } } catch (_) {}
  app.exit(0);
}

let WIDGET_SIZE = { width: 420, height: 700 };
let FULL_SIZE   = { width: 1200, height: 850 };

// ─── Native keyboard capture ───
// Window is permanently focusable:false (game never minimizes).
// A WH_KEYBOARD_LL hook captures AND blocks keystrokes from reaching the game.
// Captured keys are forwarded to the renderer via IPC for direct DOM injection.
// Capture stops on Escape or when the user clicks a non-input area.
keyboardHook.install((event) => {
  if (!win) return;

  // Passive Ctrl+C: fires even when input capture is off (type='copy' from hook)
  if (event.type === 'copy') {
    const cursor = screen.getCursorScreenPoint();
    const bounds = win.getBounds();
    const inside = cursor.x >= bounds.x && cursor.x <= bounds.x + bounds.width &&
                   cursor.y >= bounds.y && cursor.y <= bounds.y + bounds.height;
    if (inside) {
      // Get selected text from renderer, write clipboard in main process
      win.webContents.executeJavaScript(
        '(function(){ var s = window.getSelection(); return s ? s.toString() : ""; })()'
      ).then((text) => {
        if (text) {
          clipboard.writeText(text);
          const safe = text.length > 60 ? text.slice(0, 57) + '...' : text;
          const escaped = safe.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
          win.webContents.executeJavaScript(
            "if(typeof App!=='undefined'&&App.toast)App.toast('Copied: " + escaped + "');"
          ).catch(() => {});
        }
      }).catch(() => {});
    }
    return;
  }

  // Passive blueprint rotate hotkeys (Q/E). Only act when the cursor is over the
  // overlay, so they don't fire while the user is doing something else with the game.
  if (event.type === 'hotkey') {
    const cursor = screen.getCursorScreenPoint();
    const bounds = win.getBounds();
    const inside = cursor.x >= bounds.x && cursor.x <= bounds.x + bounds.width &&
                   cursor.y >= bounds.y && cursor.y <= bounds.y + bounds.height;
    if (inside) win.webContents.send('native-hotkey', { key: event.key });
    return;
  }

  if (event.type !== 'keydown') return;
  if (!inputCaptureActive) return;

  // Safety gate: a PHYSICAL key typed with the cursor outside the overlay means the
  // user is back in the game - stop capture immediately so their keys stop being
  // swallowed. INJECTED keys (on-screen/virtual keyboards type via SendInput, and the
  // cursor is on the keyboard window, outside the overlay, by nature) bypass the
  // cursor gate and keep flowing into the focused input.
  const cursor = screen.getCursorScreenPoint();
  const bounds = win.getBounds();
  const inside = cursor.x >= bounds.x && cursor.x <= bounds.x + bounds.width &&
                 cursor.y >= bounds.y && cursor.y <= bounds.y + bounds.height;
  if (!inside && !event.injected) {
    inputCaptureActive = false;
    keyboardHook.stopCapture();
    win.webContents.send('native-input-stop');
    console.log('[overlay] Capture stopped (physical key outside overlay)');
    return;
  }

  // Escape → stop capture
  if (event.key === 'Escape') {
    inputCaptureActive = false;
    keyboardHook.stopCapture();
    win.webContents.send('native-input-stop');
    console.log('[overlay] Capture stopped (Escape)');
    return;
  }

  // Forward keystroke to renderer for DOM injection
  win.webContents.send('native-key', {
    key: event.key,
    char: event.char,
    vkCode: event.vkCode,
    shift: event.shift,
    ctrl: event.ctrl,
    alt: event.alt
  });
});

function createWindow() {
  win = new BrowserWindow({
    width: WIDGET_SIZE.width,
    height: WIDGET_SIZE.height,
    // The widget footprint is the smallest the window may ever be dragged to, so
    // the layout never has to condense below its designed (widget) dimensions.
    minWidth: WIDGET_SIZE.width,
    minHeight: WIDGET_SIZE.height,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: false,
    // Non-focusable: a fullscreen game won't surrender keyboard focus, so the
    // overlay captures typing via a native key hook instead (see below). Making
    // this focusable breaks typing over the game.
    focusable: false,
    show: false,
    icon: path.join(__dirname, 'files', 'rimjobs.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setAlwaysOnTop(alwaysOnTop, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Lock the height axis while collapsed. setMaximumSize is not reliably enforced
  // for a frameless transparent window during an interactive (mouse-drag) resize on
  // Windows, so we hard-pin the height here: when collapsed, any drag that would
  // change the height is corrected back to the locked height, leaving width free.
  win.on('will-resize', (event, newBounds) => {
    if (collapsedLockHeight == null) return;             // not collapsed: free resize
    if (newBounds.height === collapsedLockHeight) return; // height unchanged: allow (width drag)
    event.preventDefault();
    win.setBounds({ x: newBounds.x, y: newBounds.y, width: newBounds.width, height: collapsedLockHeight });
  });

  win.loadFile(path.join(__dirname, 'files', 'rimjobs.html'));

  win.webContents.on('did-finish-load', () => {
    if (!win) return;
    win.setOpacity(0); // stay hidden until the renderer is in its final mode, then fade in
    try { win.setIcon(path.join(__dirname, 'files', 'rimjobs.ico')); } catch (_) {}
    // Baseline = WINDOW mode, centred. The renderer applies the user's chosen startup mode
    // (window/fullscreen/widget) via 'apply-startup-mode' and then signals 'renderer-ready',
    // so the window is revealed already at its final size - no cold-open resize or jank.
    const display = screen.getPrimaryDisplay();
    const wa = display.workArea;
    preFullscreenBounds = {
      x: Math.round(wa.x + (wa.width - FULL_SIZE.width) / 2),
      y: Math.round(wa.y + (wa.height - FULL_SIZE.height) / 2),
      width: FULL_SIZE.width,
      height: FULL_SIZE.height
    };
    isWidgetMode = false;
    win.setMinimumSize(WIDGET_SIZE.width, WIDGET_SIZE.height);
    win.setBounds(preFullscreenBounds, false);
    win.webContents.send('fullscreen-changed', false);
    win.webContents.send('widget-mode-changed', false);
    // Safety net: reveal even if the renderer never signals readiness.
    setTimeout(() => revealWindow(), 2500);
    console.log('[overlay] Ready');
  });

  // On any restore (e.g. win.restore() from a second launch), re-assert the
  // always-on-top level - a minimise/restore cycle can drop the 'screen-saver'
  // z-order - and keep the taskbar button intact.
  win.on('restore', () => {
    if (!win) return;
    isVisible = true;
    try { win.setAlwaysOnTop(alwaysOnTop, 'screen-saver'); } catch (_) {}
    forceTaskbar();
  });

  // ─── Renderer crash / unresponsive handling ───
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[overlay] Renderer crashed:', details.reason);
    dialog.showMessageBox({
      type: 'error',
      title: 'RimJobs -Renderer Crashed',
      message: `The overlay crashed unexpectedly.\n\nReason: ${details.reason}\n\nYour data was auto-saved. Click Reload to restart the interface, or Close to quit.`,
      buttons: ['Reload', 'Close'],
      defaultId: 0
    }).then(({ response }) => {
      if (response === 0) {
        win.loadFile(path.join(__dirname, 'files', 'rimjobs.html'));
      } else {
        doQuit();
      }
    });
  });

  win.on('unresponsive', () => {
    console.warn('[overlay] Window unresponsive');
    dialog.showMessageBox({
      type: 'warning',
      title: 'RimJobs -Not Responding',
      message: 'The overlay has stopped responding.\n\nWait a moment, or click Reload to restart the interface.',
      buttons: ['Wait', 'Reload'],
      defaultId: 0
    }).then(({ response }) => {
      if (response === 1 && win) {
        win.loadFile(path.join(__dirname, 'files', 'rimjobs.html'));
      }
    });
  });

  win.on('close', (e) => {
    if (!forceQuit) {
      e.preventDefault();
      win.webContents.send('close-requested');
    }
  });

  win.on('show', () => {
    if (win) win.setFocusable(false);
  });

  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  createWindow();

  const iconPath = path.join(__dirname, 'files', 'rimjobs.ico');
  tray = new Tray(iconPath);
  tray.setToolTip('RimJobs');
  const trayMenu = Menu.buildFromTemplate([
    {
      label: 'Open',
      click: () => {
        if (win) {
          win.showInactive();
          win.setAlwaysOnTop(alwaysOnTop, 'screen-saver');
          forceTaskbar();
          isVisible = true;
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Close',
      click: () => {
        // Quit immediately: drop the taskbar entry and destroy the window
        // (destroy skips the renderer close round-trip, so no lingering icon).
        doQuit();
      }
    }
  ]);
  tray.setContextMenu(trayMenu);
  tray.on('click', () => {
    if (win) {
      if (isVisible) {
        try { win.setSkipTaskbar(true); } catch (_) {}
        win.hide();
        isVisible = false;
      } else {
        win.showInactive();
        win.setAlwaysOnTop(alwaysOnTop, 'screen-saver');
        forceTaskbar();
        isVisible = true;
      }
    }
  });

  globalShortcut.register('F12', () => {
    if (!win) return;
    if (isVisible) {
      try { win.setSkipTaskbar(true); } catch (_) {}
      win.hide();
    } else {
      win.showInactive();
      win.setAlwaysOnTop(alwaysOnTop, 'screen-saver');
      forceTaskbar();
    }
    isVisible = !isVisible;
  });
});

// ─── Version request from renderer ───
ipcMain.handle('get-app-version', () => APP_VERSION);

// ─── Open an external URL in the user's default browser ───
// Renderer links can't open windows in this frameless, non-focusable overlay,
// so route vetted https links through the OS browser instead.
ipcMain.handle('open-external', (_, url) => {
  if (typeof url === 'string' && /^https:\/\//i.test(url)) {
    shell.openExternal(url);
  }
});

// ─── Save file import ───
// Decode the colony's current wealth from a save's History wealth recorders. RimWorld does
// not serialise WealthWatcher; instead the History tab graph stores periodic samples (every
// 30000 ticks) as a deflate-compressed (or, rarely, plain) base64 blob of little-endian
// float32s. We read the LAST sample of each Wealth_* recorder. Items + Buildings + Pawns
// equals Total; the storyteller's wealth is Items + Creatures + Buildings x 0.5. Returns null
// if the save has no wealth history (e.g. a brand-new colony) or anything fails to decode.
function extractColonyWealth(xml) {
  try {
    const zlib = require('zlib');
    const grp = String(xml).match(/<li>\s*<def>Wealth<\/def>\s*<recorders>([\s\S]*?)<\/recorders>/);
    if (!grp) return null;
    const re = /<def>(Wealth_\w+)<\/def>\s*<(records|recordsDeflate)>([\s\S]*?)<\/(?:records|recordsDeflate)>/g;
    const out = {};
    let m;
    while ((m = re.exec(grp[1]))) {
      let bytes = Buffer.from(m[3].replace(/\s+/g, ''), 'base64');
      if (m[2] === 'recordsDeflate') bytes = zlib.inflateRawSync(bytes);
      const n = Math.floor(bytes.length / 4);
      if (n < 1) continue;
      out[m[1]] = bytes.readFloatLE((n - 1) * 4);
    }
    if (out.Wealth_Total == null && out.Wealth_Items == null) return null;
    return {
      items: Math.max(0, Math.round(out.Wealth_Items || 0)),
      buildings: Math.max(0, Math.round(out.Wealth_Buildings || 0)),
      creatures: Math.max(0, Math.round(out.Wealth_Pawns || 0)),
      total: Math.max(0, Math.round(out.Wealth_Total || 0)),
    };
  } catch (_) { return null; }
}

ipcMain.handle('open-save-file', async () => {
  const fs = require('fs');
  const savePath = path.join(
    process.env.LOCALAPPDATA || '', '..', 'LocalLow',
    'Ludeon Studios', 'RimWorld by Ludeon Studios', 'Saves'
  );
  const defaultPath = fs.existsSync(savePath) ? savePath : undefined;
  const result = await dialog.showOpenDialog(win, {
    title: 'Import RimWorld Save',
    defaultPath,
    filters: [{ name: 'RimWorld Saves', extensions: ['rws'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  // Warn on very large save files (>150MB) -could cause high memory usage
  const stat = fs.statSync(filePath);
  const sizeMB = stat.size / (1024 * 1024);
  if (sizeMB > 150) {
    const proceed = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: 'Large Save File',
      message: `This save file is ${sizeMB.toFixed(0)}MB. Very large files may use significant memory and take a while to parse. Continue?`,
      buttons: ['Continue', 'Cancel'],
      defaultId: 0,
      icon: path.join(__dirname, 'files', 'rimjobs.ico')
    });
    if (proceed === 1) return null;
  }
  const xml = fs.readFileSync(filePath, 'utf-8');
  return { xml, filePath, wealth: extractColonyWealth(xml) };
});

// Re-read a save file by path (for refresh/re-import)
ipcMain.handle('read-save-file', async (_, filePath) => {
  const fs = require('fs');
  if (!filePath || !fs.existsSync(filePath)) return { error: 'File not found: ' + filePath };
  const xml = fs.readFileSync(filePath, 'utf-8');
  return { xml, filePath, wealth: extractColonyWealth(xml) };
});

// ─── Xenotype XML Scanner ───
// Recursively finds all XML files containing XenotypeDef in a directory tree.
// Returns concatenated XML content for parsing in the renderer.
ipcMain.handle('scan-xenotype-defs', async (_, dirPath) => {
  const fs = require('fs');
  const pathMod = require('path');

  if (!dirPath || !fs.existsSync(dirPath)) return { error: 'Directory not found: ' + dirPath };

  const xmlFiles = [];
  const walk = (dir, depth) => {
    if (depth > 8) return; // safety limit
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = pathMod.join(dir, e.name);
        if (e.isDirectory()) {
          walk(full, depth + 1);
        } else if (e.name.endsWith('.xml')) {
          xmlFiles.push(full);
        }
      }
    } catch (_) { /* skip permission errors */ }
  };
  walk(dirPath, 0);

  // Read each XML and check for XenotypeDef
  let combined = '<Defs>\n';
  let fileCount = 0;
  for (const f of xmlFiles) {
    try {
      const content = fs.readFileSync(f, 'utf-8');
      if (content.includes('XenotypeDef')) {
        // Extract just the XenotypeDef blocks
        const matches = content.match(/<XenotypeDef[\s>][\s\S]*?<\/XenotypeDef>/g);
        if (matches) {
          combined += matches.join('\n') + '\n';
          fileCount++;
        }
      }
    } catch (_) { /* skip unreadable files */ }
  }
  combined += '</Defs>';
  return { xml: combined, fileCount, totalScanned: xmlFiles.length };
});

// Finds TraitDef / GeneDef / BackstoryDef / prosthetic HediffDef blocks under a
// directory tree (plus the Steam workshop). Runs ASYNC in batches with yields so
// the main process never blocks, and emits 'trait-gene-scan-progress' events.
ipcMain.handle('scan-trait-gene-defs', async (event, dirPath) => {
  const fs = require('fs');
  const fsp = fs.promises;
  const pathMod = require('path');
  const crypto = require('crypto');

  if (!dirPath || !fs.existsSync(dirPath)) return { error: 'Directory not found: ' + dirPath };

  // ── Incremental cache ──
  // Reading and regex-scanning every mod XML on each rescan is the slow part, yet
  // a player's mod files almost never change between runs. We persist, per file,
  // its modified-time + size and the def fragments we extracted from it. On the
  // next scan a file whose mtime+size still match is reused from the cache and its
  // bytes are never touched again. Bump CACHE_VERSION whenever the extraction
  // below changes, so stale fragments are discarded wholesale.
  const CACHE_VERSION = 7; // v7: focused C5 effectiveness definition and operation fragments
  let cacheFile = null;
  try { cacheFile = pathMod.join(app.getPath('userData'), 'scan-cache.json'); } catch (_) { cacheFile = null; }
  let oldFiles = {};

  // Resolve a file's owning mod packageId (lowercased) by climbing to the nearest
  // About/About.xml. Every directory in the climb is memoised, so sibling files in
  // the same mod resolve instantly. Used to attribute each scanned def to a mod, so
  // the app can warn when assigned content belongs to a mod not in a given save.
  const modPkgByDir = new Map();
  const findPackageId = async (startDir) => {
    const chain = [];
    let d = startDir, hops = 0, found = '';
    while (d && hops < 14) {
      if (modPkgByDir.has(d)) { found = modPkgByDir.get(d); break; }
      chain.push(d);
      let pkg = null;
      try {
        const txt = await fsp.readFile(pathMod.join(d, 'About', 'About.xml'), 'utf-8');
        const mm = txt.match(/<packageId>([^<]+)<\/packageId>/i);
        pkg = mm ? mm[1].trim().toLowerCase() : '';
      } catch (_) { pkg = null; }
      if (pkg !== null) { found = pkg; break; }
      const parent = pathMod.dirname(d);
      if (parent === d) break;
      d = parent; hops++;
    }
    for (const c of chain) modPkgByDir.set(c, found);
    return found;
  };
  const defSources = {}; // defName -> mod packageId (first writer wins)
  const addDefSources = (frag) => {
    if (!frag || !frag.pkg) return;
    for (const part of [frag.sk, frag.tr, frag.ge, frag.gt, frag.bs, frag.re, frag.ah,
      frag.pa, frag.sd, frag.wt, frag.wg, frag.rc, frag.jd]) {
      if (!part) continue;
      for (const mm of part.matchAll(/<defName>([\w.\-]+)<\/defName>/g)) {
        if (!(mm[1] in defSources)) defSources[mm[1]] = frag.pkg;
      }
    }
  };
  const definitionSources = {
    BodyDef: {},
    BodyPartDef: {},
    PawnCapacityDef: {},
    RaceThingDef: {},
    HediffDef: {},
    WorkTypeDef: {},
    WorkGiverDef: {},
    SkillDef: {},
    TraitDef: {},
    GeneDef: {},
    GeneTemplateDef: {},
    StatDef: {},
    RecipeDef: {},
    JobDef: {},
    PassionDef: {},
    RaceWorkSettings: {},
  };
  const definitionUncertainty = {
    byType: {
      BodyDef: {},
      BodyPartDef: {},
      PawnCapacityDef: {},
      RaceThingDef: {},
      HediffDef: {},
      WorkTypeDef: {},
      WorkGiverDef: {},
      SkillDef: {},
      TraitDef: {},
      GeneDef: {},
      GeneTemplateDef: {},
      StatDef: {},
      RecipeDef: {},
      JobDef: {},
      PassionDef: {},
      RaceWorkSettings: {},
    },
    dataset: {
      BodyDef: [],
      BodyPartDef: [],
      PawnCapacityDef: [],
      RaceThingDef: [],
      HediffDef: [],
      WorkTypeDef: [],
      WorkGiverDef: [],
      SkillDef: [],
      TraitDef: [],
      GeneDef: [],
      GeneTemplateDef: [],
      StatDef: [],
      RecipeDef: [],
      JobDef: [],
      PassionDef: [],
      RaceWorkSettings: [],
    },
  };
  const requirementUncertainty = {
    workType: {},
    workGiver: {},
    raceWork: {},
    dataset: { workTags: [], pathCatalogue: [], workType: [], requiredCapacities: [], raceWork: [] },
  };
  const effectivenessUncertainty = {
    byType: {
      SkillDef: {}, TraitDef: {}, GeneDef: {}, GeneTemplateDef: {}, HediffDef: {},
      StatDef: {}, WorkGiverDef: {}, RecipeDef: {}, JobDef: {}, PassionDef: {},
    },
    dataset: {
      SkillDef: {}, TraitDef: {}, GeneDef: {}, GeneTemplateDef: {}, HediffDef: {},
      StatDef: {}, WorkGiverDef: {}, RecipeDef: {}, JobDef: {}, PassionDef: {},
    },
  };
  const C3_FRAGMENT_TYPES = {
    bd: 'BodyDef',
    bp: 'BodyPartDef',
    cd: 'PawnCapacityDef',
    rd: 'RaceThingDef',
    ah: 'HediffDef',
    wt: 'WorkTypeDef',
    wg: 'WorkGiverDef',
    sk: 'SkillDef',
    tr: 'TraitDef',
    ge: 'GeneDef',
    gt: 'GeneTemplateDef',
    sd: 'StatDef',
    rc: 'RecipeDef',
    jd: 'JobDef',
    pa: 'PassionDef',
  };
  const addReason = (list, reason) => { if (list.indexOf(reason) < 0) list.push(reason); };
  const addDefinitionMetadata = (frag, file, scanOrder) => {
    for (const [field, type] of Object.entries(C3_FRAGMENT_TYPES)) {
      const xml = frag[field];
      if (!xml) continue;
      const tag = type === 'RaceThingDef' || type === 'RaceWorkSettings' ? 'ThingDef' : type;
      const blocks = xml.match(new RegExp('<' + tag + '[\\s>][\\s\\S]*?<\\/' + tag + '>', 'g')) || [];
      for (let i = 0; i < blocks.length; i++) {
        const mm = blocks[i].match(/<defName>\s*([^<]+?)\s*<\/defName>/i);
        const named = blocks[i].match(/\bName\s*=\s*["']([^"']+)["']/i);
        const sourceKey = mm ? mm[1].trim() : (named ? '@' + named[1].trim() : null);
        if (!sourceKey) continue;
        if (!definitionSources[type][sourceKey]) definitionSources[type][sourceKey] = [];
        definitionSources[type][sourceKey].push({
          modId: frag.pkg || null,
          file: file,
          scanOrder: scanOrder,
          sourceOrder: i,
        });
      }
    }
    if (frag.rd) {
      const blocks = frag.rd.match(/<ThingDef[\s>][\s\S]*?<\/ThingDef>/g) || [];
      for (let i = 0; i < blocks.length; i++) {
        if (!/\blifeStageWorkSettings\b/.test(blocks[i])) continue;
        const mm = blocks[i].match(/<defName>\s*([^<]+?)\s*<\/defName>/i);
        const named = blocks[i].match(/\bName\s*=\s*["']([^"']+)["']/i);
        const sourceKey = mm ? mm[1].trim() : (named ? '@' + named[1].trim() : null);
        if (!sourceKey) continue;
        if (!definitionSources.RaceWorkSettings[sourceKey]) definitionSources.RaceWorkSettings[sourceKey] = [];
        definitionSources.RaceWorkSettings[sourceKey].push({
          modId: frag.pkg || null, file, scanOrder, sourceOrder: i,
        });
      }
    }
    const patchInfo = frag.pu;
    if (!patchInfo) return;
    for (const [type, names] of Object.entries(patchInfo.byType || {})) {
      if (!definitionUncertainty.byType[type]) continue;
      for (const defName of names) {
        if (!definitionUncertainty.byType[type][defName]) definitionUncertainty.byType[type][defName] = [];
        addReason(definitionUncertainty.byType[type][defName], 'relevantPatchNotApplied');
      }
    }
    for (const type of patchInfo.datasetTypes || []) {
      if (definitionUncertainty.dataset[type]) addReason(definitionUncertainty.dataset[type], 'relevantPatchNotApplied');
    }
    const c4 = patchInfo.c4 || {};
    for (const [defName, dimensions] of Object.entries(c4.workType || {})) {
      if (!requirementUncertainty.workType[defName]) requirementUncertainty.workType[defName] = {};
      for (const [dimension, reasons] of Object.entries(dimensions)) {
        requirementUncertainty.workType[defName][dimension] =
          requirementUncertainty.workType[defName][dimension] || [];
        for (const reason of reasons) addReason(requirementUncertainty.workType[defName][dimension], reason);
      }
    }
    for (const [defName, dimensions] of Object.entries(c4.workGiver || {})) {
      if (!requirementUncertainty.workGiver[defName]) requirementUncertainty.workGiver[defName] = {};
      for (const [dimension, reasons] of Object.entries(dimensions)) {
        requirementUncertainty.workGiver[defName][dimension] =
          requirementUncertainty.workGiver[defName][dimension] || [];
        for (const reason of reasons) addReason(requirementUncertainty.workGiver[defName][dimension], reason);
      }
    }
    for (const [raceDefName, value] of Object.entries(c4.raceWork || {})) {
      if (!requirementUncertainty.raceWork[raceDefName]) {
        requirementUncertainty.raceWork[raceDefName] = { dataset: [], entries: {} };
      }
      for (const reason of value.dataset || []) addReason(requirementUncertainty.raceWork[raceDefName].dataset, reason);
      for (const [workType, reasons] of Object.entries(value.entries || {})) {
        const target = requirementUncertainty.raceWork[raceDefName].entries;
        if (!target[workType]) target[workType] = [];
        for (const reason of reasons) addReason(target[workType], reason);
      }
    }
    for (const [dimension, reasons] of Object.entries(c4.dataset || {})) {
      if (!requirementUncertainty.dataset[dimension]) continue;
      for (const reason of reasons) addReason(requirementUncertainty.dataset[dimension], reason);
    }
    const c5 = patchInfo.c5 || {};
    for (const [type, definitions] of Object.entries(c5.byType || {})) {
      if (!effectivenessUncertainty.byType[type]) continue;
      for (const [defName, dimensions] of Object.entries(definitions || {})) {
        if (!effectivenessUncertainty.byType[type][defName]) {
          effectivenessUncertainty.byType[type][defName] = {};
        }
        for (const [dimension, reasons] of Object.entries(dimensions || {})) {
          const target = effectivenessUncertainty.byType[type][defName];
          if (!target[dimension]) target[dimension] = [];
          for (const reason of reasons) addReason(target[dimension], reason);
        }
      }
    }
    for (const [type, dimensions] of Object.entries(c5.dataset || {})) {
      if (!effectivenessUncertainty.dataset[type]) continue;
      for (const [dimension, reasons] of Object.entries(dimensions || {})) {
        if (!effectivenessUncertainty.dataset[type][dimension]) {
          effectivenessUncertainty.dataset[type][dimension] = [];
        }
        for (const reason of reasons) {
          addReason(effectivenessUncertainty.dataset[type][dimension], reason);
        }
      }
    }
  };
  if (cacheFile) {
    try {
      const raw = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      if (raw && raw.v === CACHE_VERSION && raw.files) oldFiles = raw.files;
    } catch (_) { oldFiles = {}; }
  }
  const newFiles = {};
  let reusedCount = 0, readCount = 0;

  // Pull every supported def fragment out of one file's text. Must stay in sync
  // with CACHE_VERSION; the result is what gets cached per file.
  const extractDefs = (content) => {
    const out = { sk: '', tr: '', ge: '', gt: '', bs: '', re: '', ah: '', hp: '', pa: '', me: '', pc: '', sd: '', rc: '', jd: '', bd: '', bp: '', cd: '', rd: '', wt: '', wg: '', pu: null };
    if (content.includes('<SkillDef')) { const m = content.match(/<SkillDef[\s>][\s\S]*?<\/SkillDef>/g); if (m) out.sk = m.join('\n'); }
    if (content.includes('<TraitDef')) { const m = content.match(/<TraitDef[\s>][\s\S]*?<\/TraitDef>/g); if (m) out.tr = m.join('\n'); }
    if (content.includes('<GeneDef')) { const m = content.match(/<GeneDef[\s>][\s\S]*?<\/GeneDef>/g); if (m) out.ge = m.join('\n'); }
    if (content.includes('<GeneTemplateDef')) { const m = content.match(/<GeneTemplateDef[\s>][\s\S]*?<\/GeneTemplateDef>/g); if (m) out.gt = m.join('\n'); }
    if (content.includes('<BackstoryDef')) { const m = content.match(/<BackstoryDef[\s>][\s\S]*?<\/BackstoryDef>/g); if (m) out.bs = m.join('\n'); }
    if (content.includes('<PawnRelationDef')) { const m = content.match(/<PawnRelationDef[\s>][\s\S]*?<\/PawnRelationDef>/g); if (m) out.re = m.join('\n'); }
    // Ideology planner content: memes, plus ritual-pattern precepts (only PreceptDefs
    // whose preceptClass mentions Ritual - full precept defs would bloat the cache).
    if (content.includes('<MemeDef')) { const m = content.match(/<MemeDef[\s>][\s\S]*?<\/MemeDef>/g); if (m) out.me = m.join('\n'); }
    if (content.includes('<PreceptDef')) {
      const m = content.match(/<PreceptDef[\s>][\s\S]*?<\/PreceptDef>/g);
      if (m) { const rituals = m.filter(b => /<preceptClass>[^<]*Ritual/.test(b)); if (rituals.length) out.pc = rituals.join('\n'); }
    }
    // Modded passions (Vanilla Skills Expanded framework, also used by Alpha Skills)
    // are defined as <VSE.Passions.PassionDef> and serialise into the vanilla
    // <passion> tag by defName. Collect them so the app can name + offer them.
    if (content.includes('.PassionDef')) { const m = content.match(/<VSE\.Passions\.PassionDef[\s>][\s\S]*?<\/VSE\.Passions\.PassionDef>/g); if (m) out.pa = m.join('\n'); }
    if (content.includes('<HediffDef')) {
      const m = content.match(/<HediffDef[\s>][\s\S]*?<\/HediffDef>/g);
      if (m) {
        // All hediff defs feed the health-editor catalogue; the addedPart subset also
        // feeds the prosthetics list (kept for backward compatibility).
        out.ah = m.join('\n');
        const withParts = m.filter(b => b.includes('addedPartProps'));
        if (withParts.length) out.hp = withParts.join('\n');
      }
    }
    if (content.includes('<BodyDef')) { const m = content.match(/<BodyDef[\s>][\s\S]*?<\/BodyDef>/g); if (m) out.bd = m.join('\n'); }
    if (content.includes('<BodyPartDef')) { const m = content.match(/<BodyPartDef[\s>][\s\S]*?<\/BodyPartDef>/g); if (m) out.bp = m.join('\n'); }
    if (content.includes('<PawnCapacityDef')) { const m = content.match(/<PawnCapacityDef[\s>][\s\S]*?<\/PawnCapacityDef>/g); if (m) out.cd = m.join('\n'); }
    if (content.includes('<WorkTypeDef')) { const m = content.match(/<WorkTypeDef[\s>][\s\S]*?<\/WorkTypeDef>/g); if (m) out.wt = m.join('\n'); }
    if (content.includes('<WorkGiverDef')) { const m = content.match(/<WorkGiverDef[\s>][\s\S]*?<\/WorkGiverDef>/g); if (m) out.wg = m.join('\n'); }
    if (content.includes('<StatDef')) { const m = content.match(/<StatDef[\s>][\s\S]*?<\/StatDef>/g); if (m) out.sd = m.join('\n'); }
    if (content.includes('<RecipeDef')) { const m = content.match(/<RecipeDef[\s>][\s\S]*?<\/RecipeDef>/g); if (m) out.rc = m.join('\n'); }
    if (content.includes('<JobDef')) { const m = content.match(/<JobDef[\s>][\s\S]*?<\/JobDef>/g); if (m) out.jd = m.join('\n'); }
    if (content.includes('<ThingDef')) {
      const m = content.match(/<ThingDef[\s>][\s\S]*?<\/ThingDef>/g);
      if (m) {
        const raceRelevant = m.filter(block => /<race(?:\s[^>]*)?>/i.test(block) || /\b(?:Name|ParentName)\s*=/.test(block));
        if (raceRelevant.length) out.rd = raceRelevant.join('\n');
      }
    }
    if (/PatchOperation/i.test(content)) {
      const byType = { BodyDef: [], BodyPartDef: [], PawnCapacityDef: [], RaceThingDef: [], HediffDef: [], WorkTypeDef: [], WorkGiverDef: [], RaceWorkSettings: [] };
      const datasetTypes = [];
      const c4 = {
        workType: {}, workGiver: {}, raceWork: {},
        dataset: { workTags: [], pathCatalogue: [], workType: [], requiredCapacities: [], raceWork: [] },
      };
      const c5 = {
        byType: {
          SkillDef: {}, TraitDef: {}, GeneDef: {}, GeneTemplateDef: {}, HediffDef: {},
          StatDef: {}, WorkGiverDef: {}, RecipeDef: {}, JobDef: {}, PassionDef: {},
        },
        dataset: {
          SkillDef: {}, TraitDef: {}, GeneDef: {}, GeneTemplateDef: {}, HediffDef: {},
          StatDef: {}, WorkGiverDef: {}, RecipeDef: {}, JobDef: {}, PassionDef: {},
        },
      };
      const markDimension = (root, defName, dimension) => {
        if (!root[defName]) root[defName] = {};
        if (!root[defName][dimension]) root[defName][dimension] = [];
        if (root[defName][dimension].indexOf('relevantPatchNotApplied') < 0) {
          root[defName][dimension].push('relevantPatchNotApplied');
        }
      };
      const markDataset = dimension => {
        if (c4.dataset[dimension].indexOf('relevantPatchNotApplied') < 0) {
          c4.dataset[dimension].push('relevantPatchNotApplied');
        }
      };
      const markC5 = (type, names, dimensions) => {
        if (!c5.byType[type]) return;
        for (const dimension of dimensions) {
          if (names.length) {
            for (const defName of names) {
              if (!c5.byType[type][defName]) c5.byType[type][defName] = {};
              if (!c5.byType[type][defName][dimension]) {
                c5.byType[type][defName][dimension] = [];
              }
              addReason(c5.byType[type][defName][dimension], 'relevantPatchNotApplied');
            }
          } else {
            if (!c5.dataset[type][dimension]) c5.dataset[type][dimension] = [];
            addReason(c5.dataset[type][dimension], 'relevantPatchNotApplied');
          }
        }
      };
      const xpathMatches = Array.from(content.matchAll(/<xpath(?:\s[^>]*)?>([\s\S]*?)<\/xpath>/gi));
      for (const match of xpathMatches) {
        const xpath = match[1].replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&gt;/gi, '>').replace(/&lt;/gi, '<').replace(/&amp;/gi, '&');
        let type = null;
        if (/\bBodyPartDef\b/.test(xpath) && /\b(?:tags|hitPoints)\b/i.test(xpath)) type = 'BodyPartDef';
        else if (/\bBodyDef\b/.test(xpath) && /\b(?:corePart|parts|def|coverage|depth|height)\b/i.test(xpath)) type = 'BodyDef';
        else if (/\bPawnCapacityDef\b/.test(xpath)) type = 'PawnCapacityDef';
        else if (/\bHediffDef\b/.test(xpath) && /\b(?:stages|capMods|partEfficiencyOffset|partIgnoreMissingHP|addedPartProps|partEfficiency)\b/i.test(xpath)) type = 'HediffDef';
        else if (/\bWorkTypeDef\b/.test(xpath)) type = 'WorkTypeDef';
        else if (/\bWorkGiverDef\b/.test(xpath)) type = 'WorkGiverDef';
        else if (/\bThingDef\b/.test(xpath) && /\b(?:race|body)\b/i.test(xpath)) type = 'RaceThingDef';
        const names = [];
        const namePatterns = [
          /defName\s*=\s*["']([^"']+)["']/gi,
          /defName\s*\[\s*(?:text\(\)\s*=\s*)?["']([^"']+)["']\s*\]/gi,
        ];
        for (const pattern of namePatterns) {
          for (const nameMatch of xpath.matchAll(pattern)) {
            const name = nameMatch[1].trim();
            if (name && names.indexOf(name) < 0) names.push(name);
          }
        }
        if (/\bSkillDef\b/.test(xpath)) markC5('SkillDef', names,
          /disablingWorkTags|neverDisabledBasedOnWorkTypes/i.test(xpath) ? ['fields'] : ['catalogue']);
        if (/\bTraitDef\b/.test(xpath)) {
          const dimensions = [];
          if (/skillGains/i.test(xpath)) dimensions.push('creationSkillGains');
          if (/aptitudes/i.test(xpath)) dimensions.push('aptitudes');
          if (/statOffsets|statFactors|conditionalStatAffecters/i.test(xpath)) dimensions.push('statOperations');
          markC5('TraitDef', names, dimensions.length ? dimensions : ['catalogue']);
        }
        if (/\bGeneTemplateDef\b/.test(xpath)) markC5('GeneTemplateDef', names,
          /aptitude/i.test(xpath) ? ['aptitudes'] : ['catalogue']);
        else if (/\bGeneDef\b/.test(xpath)) {
          const dimensions = [];
          if (/aptitudes/i.test(xpath)) dimensions.push('aptitudes');
          if (/statOffsets|statFactors|conditionalStatAffecters/i.test(xpath)) dimensions.push('statOperations');
          if (/geneClass|active|override/i.test(xpath)) dimensions.push('applicability');
          markC5('GeneDef', names, dimensions.length ? dimensions : ['catalogue']);
        }
        if (/\bHediffDef\b/.test(xpath)
          && /aptitudes|statOffsets|statFactors|EffectMultiplier|stages/i.test(xpath)) {
          markC5('HediffDef', names, /aptitudes/i.test(xpath)
            ? ['aptitudes'] : ['statOperations']);
        }
        if (/\bStatDef\b/.test(xpath)) {
          const dimensions = [];
          if (/statFactors|postProcessStatFactors/i.test(xpath)) dimensions.push('dependencies');
          if (/skillNeed|noSkill/i.test(xpath)) dimensions.push('skillNeeds');
          if (/capacityOffsets|capacityFactors/i.test(xpath)) dimensions.push('capacities');
          if (/postProcessCurve|parts|round|minValue|maxValue|scenario/i.test(xpath)) dimensions.push('finalization');
          markC5('StatDef', names, dimensions.length ? dimensions : ['fields']);
        }
        if (/\bWorkGiverDef\b/.test(xpath)) markC5('WorkGiverDef', names, ['facets']);
        if (/\bRecipeDef\b/.test(xpath)) markC5('RecipeDef', names, ['facets']);
        if (/\bJobDef\b/.test(xpath)) markC5('JobDef', names, ['facets']);
        if (/PassionDef|passion/i.test(xpath)) markC5('PassionDef', names, ['provider']);
        if (/\bWorkTypeDef\b/.test(xpath) && /\bworkTags\b/i.test(xpath)) {
          if (names.length) for (const name of names) markDimension(c4.workType, name, 'workTags');
          else markDataset('workTags');
        }
        if (/\bWorkGiverDef\b/.test(xpath)) {
          const dimensions = [];
          if (/\brequiredCapacities\b/i.test(xpath)) dimensions.push('requiredCapacities');
          if (/\bworkType\b/i.test(xpath)) dimensions.push('workType');
          if (!dimensions.length || /(?:Defs\/WorkGiverDef|WorkGiverDef\s*\[)/i.test(xpath)) {
            dimensions.push('catalogueMembership');
          }
          for (const dimension of Array.from(new Set(dimensions))) {
            if (names.length) for (const name of names) markDimension(c4.workGiver, name, dimension);
            else markDataset(dimension === 'catalogueMembership' ? 'pathCatalogue' : dimension);
          }
        }
        if (/\bThingDef\b/.test(xpath) && /\blifeStageWorkSettings\b/i.test(xpath)) {
          const workTypeMatch = xpath.match(/lifeStageWorkSettings\s*\/\s*([A-Za-z_][\w.-]*)/i);
          if (names.length) {
            for (const raceDefName of names) {
              if (!c4.raceWork[raceDefName]) c4.raceWork[raceDefName] = { dataset: [], entries: {} };
              if (workTypeMatch) {
                const entry = workTypeMatch[1];
                c4.raceWork[raceDefName].entries[entry] = ['relevantPatchNotApplied'];
              } else c4.raceWork[raceDefName].dataset = ['relevantPatchNotApplied'];
            }
          } else markDataset('raceWork');
        }
        if (type && names.length) {
          for (const name of names) if (byType[type].indexOf(name) < 0) byType[type].push(name);
        } else if (type && datasetTypes.indexOf(type) < 0) {
          datasetTypes.push(type);
        }
      }
      const hasC4 = Object.keys(c4.workType).length || Object.keys(c4.workGiver).length
        || Object.keys(c4.raceWork).length || Object.values(c4.dataset).some(reasons => reasons.length);
      const hasC5 = Object.values(c5.byType).some(definitions => Object.keys(definitions).length)
        || Object.values(c5.dataset).some(dimensions => Object.keys(dimensions).length);
      if (datasetTypes.length || Object.values(byType).some(names => names.length) || hasC4 || hasC5) {
        out.pu = { byType, datasetTypes, c4, c5 };
      }
    }
    return out;
  };

  // Directories that never contain Def XMLs - skipping them is a huge speedup.
  const SKIP_DIRS = new Set([
    'textures', 'sounds', 'assemblies', 'source', 'languages',
    'about', 'news', '.git', '.svn', 'node_modules', 'audioclips', 'video'
  ]);

  const sender = event && event.sender;
  const sendProgress = (phase, done, total) => {
    try { if (sender && !sender.isDestroyed()) sender.send('trait-gene-scan-progress', { phase, done, total }); } catch (_) {}
  };
  const yieldToMain = () => new Promise(resolve => setImmediate(resolve));

  // ── Phase 1: collect xml file paths (async, yields per directory) ──
  const xmlFiles = [];
  const walk = async (dir, depth) => {
    if (depth > 9) return;
    let entries;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      const full = pathMod.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name.toLowerCase())) await walk(full, depth + 1);
      } else if (e.name.endsWith('.xml')) {
        xmlFiles.push(full);
      }
    }
  };
  const roots = [dirPath];
  const steamApps = dirPath.replace(/[/\\]common[/\\]RimWorld$/i, '');
  if (steamApps !== dirPath) {
    const workshopPath = pathMod.join(steamApps, 'workshop', 'content', '294100');
    try { if (fs.existsSync(workshopPath)) roots.push(workshopPath); } catch (_) { /* ignore */ }
  }
  sendProgress('listing', 0, 0);
  for (const r of roots) { await walk(r, 0); await yieldToMain(); }

  // ── Phase 2: stat + (cache-or-read) + extract, in async batches ──
  let traits = '<Defs>\n', genes = '<Defs>\n', backstories = '<Defs>\n', hediffs = '<Defs>\n', allHediffs = '<Defs>\n', relationDefs = '<Defs>\n', passionDefs = '<Defs>\n', memeDefs = '<Defs>\n', ritualPreceptDefs = '<Defs>\n';
  let bodyDefs = '<Defs>\n', bodyPartDefs = '<Defs>\n', capacityDefs = '<Defs>\n', raceThingDefs = '<Defs>\n';
  let workTypeDefs = '<Defs>\n', workGiverDefs = '<Defs>\n';
  let skillDefs = '<Defs>\n', geneTemplateDefs = '<Defs>\n', statDefs = '<Defs>\n';
  let recipeDefs = '<Defs>\n', jobDefs = '<Defs>\n';
  let traitFiles = 0, geneFiles = 0, backstoryFiles = 0, hediffFiles = 0;
  const total = xmlFiles.length;
  const BATCH = 60;
  for (let i = 0; i < total; i++) {
    const key = xmlFiles[i];
    try {
      const st = await fsp.stat(key);
      const prev = oldFiles[key];
      let frag;
      if (prev && prev.m === st.mtimeMs && prev.s === st.size) {
        // Unchanged since last scan: reuse the cached fragments, skip the read.
        frag = prev;
        reusedCount++;
      } else {
        const content = await fsp.readFile(key, 'utf-8');
        const ex = extractDefs(content);
        // Only resolve the mod packageId for files that actually yielded a def we track.
        const hasDef = ex.sk || ex.tr || ex.ge || ex.gt || ex.bs || ex.re || ex.ah
          || ex.pa || ex.me || ex.pc || ex.sd || ex.rc || ex.jd || ex.bd || ex.bp
          || ex.cd || ex.rd || ex.wt || ex.wg || ex.pu;
        const pkg = hasDef ? await findPackageId(pathMod.dirname(key)) : '';
        frag = { m: st.mtimeMs, s: st.size, sk: ex.sk, tr: ex.tr, ge: ex.ge,
          gt: ex.gt, bs: ex.bs, re: ex.re, ah: ex.ah, hp: ex.hp, pa: ex.pa,
          me: ex.me, pc: ex.pc, sd: ex.sd, rc: ex.rc, jd: ex.jd, bd: ex.bd,
          bp: ex.bp, cd: ex.cd, rd: ex.rd, wt: ex.wt, wg: ex.wg, pu: ex.pu, pkg };
        readCount++;
      }
      newFiles[key] = frag;
      addDefSources(frag);
      addDefinitionMetadata(frag, key, i);
      if (frag.sk) { skillDefs += frag.sk + '\n'; }
      if (frag.tr) { traits += frag.tr + '\n'; traitFiles++; }
      if (frag.ge) { genes += frag.ge + '\n'; geneFiles++; }
      if (frag.gt) { geneTemplateDefs += frag.gt + '\n'; }
      if (frag.bs) { backstories += frag.bs + '\n'; backstoryFiles++; }
      if (frag.re) { relationDefs += frag.re + '\n'; }
      if (frag.ah) { allHediffs += frag.ah + '\n'; }
      if (frag.hp) { hediffs += frag.hp + '\n'; hediffFiles++; }
      if (frag.pa) { passionDefs += frag.pa + '\n'; }
      if (frag.me) { memeDefs += frag.me + '\n'; }
      if (frag.pc) { ritualPreceptDefs += frag.pc + '\n'; }
      if (frag.bd) { bodyDefs += frag.bd + '\n'; }
      if (frag.bp) { bodyPartDefs += frag.bp + '\n'; }
      if (frag.cd) { capacityDefs += frag.cd + '\n'; }
      if (frag.rd) { raceThingDefs += frag.rd + '\n'; }
      if (frag.wt) { workTypeDefs += frag.wt + '\n'; }
      if (frag.wg) { workGiverDefs += frag.wg + '\n'; }
      if (frag.sd) { statDefs += frag.sd + '\n'; }
      if (frag.rc) { recipeDefs += frag.rc + '\n'; }
      if (frag.jd) { jobDefs += frag.jd + '\n'; }
    } catch (_) { /* skip unreadable/vanished files - and drop them from the cache */ }
    if ((i % BATCH) === 0) { sendProgress('reading', i, total); await yieldToMain(); }
  }
  sendProgress('reading', total, total);

  // Persist the refreshed cache (only the files seen this scan, so deleted files
  // and old install paths are pruned automatically). Never let a cache write
  // failure break the scan result.
  if (cacheFile) {
    try { await fsp.writeFile(cacheFile, JSON.stringify({ v: CACHE_VERSION, files: newFiles }), 'utf-8'); } catch (_) { /* ignore */ }
  }

  traits += '</Defs>'; genes += '</Defs>'; backstories += '</Defs>'; hediffs += '</Defs>'; allHediffs += '</Defs>'; relationDefs += '</Defs>'; passionDefs += '</Defs>'; memeDefs += '</Defs>'; ritualPreceptDefs += '</Defs>';
  bodyDefs += '</Defs>'; bodyPartDefs += '</Defs>'; capacityDefs += '</Defs>'; raceThingDefs += '</Defs>';
  workTypeDefs += '</Defs>'; workGiverDefs += '</Defs>';
  skillDefs += '</Defs>'; geneTemplateDefs += '</Defs>'; statDefs += '</Defs>';
  recipeDefs += '</Defs>'; jobDefs += '</Defs>';
  const providerFingerprint = crypto.createHash('sha256').update(JSON.stringify(
    Object.keys(newFiles).sort().map(file => ({
      file, m: newFiles[file].m, s: newFiles[file].s, pkg: newFiles[file].pkg || '',
    }))
  )).digest('hex');
  return { traitsXml: traits, genesXml: genes, geneTemplateDefsXml: geneTemplateDefs,
    skillDefsXml: skillDefs, statDefsXml: statDefs, recipeDefsXml: recipeDefs,
    jobDefsXml: jobDefs, backstoriesXml: backstories, hediffsXml: hediffs,
    allHediffsXml: allHediffs, relationDefsXml: relationDefs,
    passionDefsXml: passionDefs, memesXml: memeDefs,
    ritualPreceptsXml: ritualPreceptDefs, bodyDefsXml: bodyDefs,
    bodyPartDefsXml: bodyPartDefs, capacityDefsXml: capacityDefs,
    raceThingDefsXml: raceThingDefs, workTypeDefsXml: workTypeDefs,
    workGiverDefsXml: workGiverDefs, defSources, definitionSources,
    definitionUncertainty, requirementUncertainty, effectivenessUncertainty,
    providerFingerprint,
    scannerCacheVersion: CACHE_VERSION, traitFiles, geneFiles, backstoryFiles,
    hediffFiles, totalScanned: total, reusedFromCache: reusedCount,
    freshlyRead: readCount };
});

// Scan all Def XMLs under a RimWorld install and return a defName -> label map.
// Covers Data/ (vanilla + DLCs), Mods/ (local), and workshop mods.
// Uses async reads + batched yielding to avoid blocking the main process.
ipcMain.handle('scan-def-labels', async (event, installPath) => {
  const fs = require('fs');
  const fsp = fs.promises;
  const pathMod = require('path');

  if (!installPath || !fs.existsSync(installPath)) return { error: 'Install path not found' };

  // Directories to scan: vanilla Data/, local Mods/, and Steam Workshop
  const scanRoots = [
    pathMod.join(installPath, 'Data'),
    pathMod.join(installPath, 'Mods')
  ];
  // Detect Steam workshop path from install location
  const steamApps = installPath.replace(/[/\\]common[/\\]RimWorld$/i, '');
  const workshopPath = pathMod.join(steamApps, 'workshop', 'content', '294100');
  if (fs.existsSync(workshopPath)) scanRoots.push(workshopPath);

  // Skip directories that never contain Def XMLs (huge speedup for modded games)
  const SKIP_DIRS = new Set([
    'textures', 'sounds', 'assemblies', 'source', 'languages',
    'about', 'news', '.git', '.svn', 'node_modules', 'patches'
  ]);
  // Only scan directories likely to contain defs
  const DEF_HINT_DIRS = new Set(['defs', '1.4', '1.5', 'common', 'core', 'data']);

  const xmlFiles = [];
  const walk = (dir, depth) => {
    if (depth > 8) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          const lower = e.name.toLowerCase();
          if (!SKIP_DIRS.has(lower)) {
            walk(pathMod.join(dir, e.name), depth + 1);
          }
        } else if (e.name.endsWith('.xml')) {
          xmlFiles.push(pathMod.join(dir, e.name));
        }
      }
    } catch (_) {}
  };
  for (const root of scanRoots) {
    if (fs.existsSync(root)) walk(root, 0);
  }

  // Extract defName -> label pairs from all XML files
  // Process in async batches to keep the main process responsive
  const labels = {};
  const defBlockRe = /<(\w+Def)\b[^>]*>([\s\S]*?)<\/\1>/g;
  const defNameRe = /<defName>(.*?)<\/defName>/;
  const labelRe = /<label>(.*?)<\/label>/;
  const titleRe = /<title>(.*?)<\/title>/;
  const descRe = /<description>(.*?)<\/description>/;
  const degreeRe = /<degreeDatas>([\s\S]*?)<\/degreeDatas>/;
  const degreeLiRe = /<li>([\s\S]*?)<\/li>/g;
  const degreeValRe = /<degree>(.*?)<\/degree>/;

  const BATCH_SIZE = 40; // files per batch before yielding to event loop
  let filesRead = 0;
  const sender = event.sender;
  const total = xmlFiles.length;

  const yieldToMain = () => new Promise(resolve => setImmediate(resolve));

  // Footprint inheritance: ThingDef <size> can live on an abstract parent, so
  // collect direct sizes + ParentName per def (concrete AND abstract) and resolve
  // up the chain after scanning.
  const directSize = {};   // defName/Name -> [w,h]
  const parentOf = {};     // defName/Name -> ParentName
  const concreteThings = new Set();
  const sizeRe = /<size>\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)\s*<\/size>/;

  const parseFile = (content) => {
    if (!content.includes('<defName>') && !content.includes('Name=')) return false;
    let m;
    defBlockRe.lastIndex = 0;
    while ((m = defBlockRe.exec(content)) !== null) {
      const block = m[2];
      const dnMatch = block.match(defNameRe);
      // Footprint capture (ThingDef only) before the no-defName skip, so abstract
      // base defs are recorded for inheritance resolution.
      if (m[1] === 'ThingDef') {
        const openEnd = m[0].indexOf('>');
        const openTag = openEnd >= 0 ? m[0].slice(0, openEnd) : '';
        const pName = (openTag.match(/ParentName\s*=\s*"([^"]+)"/) || [])[1];
        const aName = (openTag.match(/\bName\s*=\s*"([^"]+)"/) || [])[1];
        const szM = block.match(sizeRe);
        const key = (dnMatch && dnMatch[1]) || aName;
        if (key) {
          if (pName) parentOf[key] = pName;
          if (szM) directSize[key] = [parseInt(szM[1]), parseInt(szM[2])];
          if (dnMatch && dnMatch[1]) concreteThings.add(dnMatch[1]);
        }
      }
      if (!dnMatch) continue;
      const defName = dnMatch[1];
      const lblMatch = block.match(labelRe);
      const ttlMatch = block.match(titleRe);
      const descMatch = block.match(descRe);
      const rawLbl = lblMatch ? lblMatch[1] : (ttlMatch ? ttlMatch[1] : '');
      const lbl = rawLbl.replace(/<\/?[a-zA-Z][^>]*>/g, '').trim();
      if (lbl) {
        labels[defName] = { label: lbl, type: m[1] };
        if (descMatch) labels[defName].desc = descMatch[1].slice(0, 200);
      }
      // Storyteller raid data: extract threat model params for the raid calculator
      if (m[1] === 'StorytellerDef') {
        const entry = labels[defName];
        if (entry) {
          // Detect RandomMain (Randy-like) vs OnOffCycle (Cassandra-like)
          const rmMatch = block.match(/Class="StorytellerCompProperties_RandomMain"[\s\S]*?<\/li>/);
          if (rmMatch) {
            entry.threatModel = 'random';
            const mtb = rmMatch[0].match(/<mtbDays>([\d.]+)<\/mtbDays>/);
            const maxInt = rmMatch[0].match(/<maxThreatBigIntervalDays>([\d.]+)<\/maxThreatBigIntervalDays>/);
            const rpf = rmMatch[0].match(/<randomPointsFactorRange>([\d.]+)~([\d.]+)<\/randomPointsFactorRange>/);
            if (mtb) entry.mtbDays = parseFloat(mtb[1]);
            if (maxInt) entry.maxThreatBigInterval = parseFloat(maxInt[1]);
            if (rpf) { entry.randomFactorLow = parseFloat(rpf[1]); entry.randomFactorHigh = parseFloat(rpf[2]); }
          }
          // OnOffCycle for ThreatBig (Cassandra-like)
          const oocMatch = block.match(/Class="StorytellerCompProperties_OnOffCycle"[^>]*>[\s\S]*?<category>ThreatBig<\/category>[\s\S]*?<\/li>/);
          if (oocMatch && !rmMatch) {
            entry.threatModel = 'cycle';
            const onD = oocMatch[0].match(/<onDays>([\d.]+)<\/onDays>/);
            const offD = oocMatch[0].match(/<offDays>([\d.]+)<\/offDays>/);
            if (onD) entry.onDays = parseFloat(onD[1]);
            if (offD) entry.offDays = parseFloat(offD[1]);
          }
          // Wealth-step based (Ariadne)
          const wsMatch = block.match(/Class="[^"]*WealthSteps"/);
          if (wsMatch) {
            entry.threatModel = 'wealth';
          }
        }
      }
      // MemeDef: extract category, impact, conflicts for modded meme auto-creation
      if (m[1] === 'MemeDef') {
        const entry = labels[defName];
        if (entry) {
          entry.defType = 'meme';
          const catMatch = block.match(/<category>(.*?)<\/category>/);
          if (catMatch) entry.memeCategory = catMatch[1];
          const impMatch = block.match(/<impact>(.*?)<\/impact>/);
          if (impMatch) entry.memeImpact = impMatch[1].toLowerCase();
          // Extract conflicts
          const confMatch = block.match(/<conflictingMemes>([\s\S]*?)<\/conflictingMemes>/);
          if (confMatch) {
            entry.memeConflicts = [...confMatch[1].matchAll(/<li>(.*?)<\/li>/g)].map(c => c[1]);
          }
        }
      }
      // PreceptDef: mark as precept type for label resolution
      if (m[1] === 'PreceptDef') {
        const entry = labels[defName];
        if (entry) entry.defType = 'precept';
      }
      // Trait degree variants: store as "DefName|degree" -> label
      const degBlock = block.match(degreeRe);
      if (degBlock) {
        degreeLiRe.lastIndex = 0;
        let dli;
        while ((dli = degreeLiRe.exec(degBlock[1])) !== null) {
          const dLabel = dli[1].match(labelRe);
          const dDeg = dli[1].match(degreeValRe);
          if (dLabel && dDeg) {
            labels[defName + '|' + dDeg[1]] = { label: dLabel[1], type: 'TraitDegree' };
          }
        }
      }
    }
    return true;
  };

  // Read files in concurrent batches, yield between batches
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = xmlFiles.slice(i, i + BATCH_SIZE);
    // Read batch files concurrently
    const results = await Promise.allSettled(
      batch.map(f => fsp.readFile(f, 'utf-8'))
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && parseFile(r.value)) filesRead++;
    }
    // Send progress to renderer so the UI can update
    if (sender && !sender.isDestroyed()) {
      try { sender.send('def-label-progress', { done: Math.min(i + BATCH_SIZE, total), total }); } catch (_) {}
    }
    // Yield to event loop so Electron stays responsive
    await yieldToMain();
  }

  // Resolve footprint inheritance: walk ParentName until a <size> is found.
  // Only keep multi-cell results (1x1 is the implicit default) to keep it small.
  const sizes = {};
  const resolveSize = (key, depth) => {
    if (!key || depth > 24) return null;
    if (directSize[key]) return directSize[key];
    return resolveSize(parentOf[key], depth + 1);
  };
  for (const dn of concreteThings) {
    const s = resolveSize(dn, 0);
    if (s && (s[0] > 1 || s[1] > 1)) sizes[dn] = s;
  }

  return { labels, sizes, fileCount: filesRead, totalScanned: total };
});

// ─── Mod Equipment Scanner ───
// Scans RimWorld Data/, Mods/, and Steam Workshop for weapon and apparel ThingDefs.
// Extracts combat stats (damage, accuracy, armour ratings, layers, etc.)
// and returns structured arrays ready for the armoury/apparel tabs.
ipcMain.handle('scan-mod-equipment', async (event, installPath) => {
  const fs = require('fs');
  const fsp = fs.promises;
  const pathMod = require('path');

  if (!installPath || !fs.existsSync(installPath)) return { error: 'Install path not found' };

  // Directories to scan: vanilla Data/ (for abstract base defs only),
  // local Mods/, and Steam Workshop
  const scanRoots = [];

  // Include vanilla Data dirs for abstract def inheritance resolution
  const dataDir = pathMod.join(installPath, 'Data');
  if (fs.existsSync(dataDir)) {
    try {
      const dataSubs = fs.readdirSync(dataDir, { withFileTypes: true });
      for (const sub of dataSubs) {
        if (sub.isDirectory()) {
          const defsPath = pathMod.join(dataDir, sub.name, 'Defs');
          if (fs.existsSync(defsPath)) scanRoots.push({ path: defsPath, source: 'vanilla' });
        }
      }
    } catch (_) {}
  }

  const modsDir = pathMod.join(installPath, 'Mods');
  if (fs.existsSync(modsDir)) scanRoots.push({ path: modsDir, source: 'local' });

  const steamApps = installPath.replace(/[/\\]common[/\\]RimWorld$/i, '');
  const workshopPath = pathMod.join(steamApps, 'workshop', 'content', '294100');
  if (fs.existsSync(workshopPath)) scanRoots.push({ path: workshopPath, source: 'workshop' });

  const SKIP_DIRS = new Set([
    'textures', 'sounds', 'assemblies', 'source', 'languages',
    'about', 'news', '.git', '.svn', 'node_modules', 'patches'
  ]);

  // Build mod name lookup from About.xml files
  const modNames = {};
  const resolveModName = (filePath) => {
    // Walk up to find the mod root (contains About/About.xml)
    let dir = pathMod.dirname(filePath);
    for (let i = 0; i < 8; i++) {
      const aboutXml = pathMod.join(dir, 'About', 'About.xml');
      if (fs.existsSync(aboutXml)) {
        if (!modNames[dir]) {
          try {
            const about = fs.readFileSync(aboutXml, 'utf-8');
            const nameMatch = about.match(/<name>(.*?)<\/name>/i);
            modNames[dir] = nameMatch ? nameMatch[1].trim() : pathMod.basename(dir);
          } catch (_) {
            modNames[dir] = pathMod.basename(dir);
          }
        }
        return modNames[dir];
      }
      const parent = pathMod.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return '';
  };

  // Collect all XML file paths (tagged with source for vanilla filtering)
  const xmlFiles = [];
  const walk = (dir, depth, source) => {
    if (depth > 8) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          const lower = e.name.toLowerCase();
          if (!SKIP_DIRS.has(lower)) walk(pathMod.join(dir, e.name), depth + 1, source);
        } else if (e.name.endsWith('.xml')) {
          xmlFiles.push({ path: pathMod.join(dir, e.name), source });
        }
      }
    } catch (_) {}
  };
  for (const root of scanRoots) {
    if (fs.existsSync(root.path)) walk(root.path, 0, root.source);
  }

  const weapons = [];
  const apparel = [];
  const materials = [];
  const seenDefs = new Set();
  const seenMaterials = new Set();

  // Regex patterns for extracting ThingDef data
  // Capture both the attributes and body of each ThingDef
  const thingDefRe = /<ThingDef\b([^>]*)>([\s\S]*?)<\/ThingDef>/g;
  const tagVal = (block, tag) => {
    const m = block.match(new RegExp('<' + tag + '>([\\s\\S]*?)<\\/' + tag + '>'));
    return m ? m[1].trim() : '';
  };
  // Strip RimWorld rich-text markup from labels (e.g. <color=#FF99C7>name</color>)
  const stripMarkup = (str) => str.replace(/<\/?[a-zA-Z][^>]*>/g, '').trim();
  const tagFloat = (block, tag) => {
    const v = tagVal(block, tag);
    return v ? parseFloat(v) || 0 : 0;
  };

  // ── Abstract def inheritance resolution ──
  // First pass: collect ALL ThingDefs with a Name attribute for parent chain lookup.
  // RimWorld allows any ThingDef with Name="X" to be a parent - not just Abstract="True".
  // Many mods use concrete named parents (e.g. VWE_Crossbow_Base has Name but no Abstract).
  const abstractDefs = {}; // Name -> { block, parentName }
  const abstractDefRe = /<ThingDef\b([^>]*)>([\s\S]*?)<\/ThingDef>/g;
  // Also collect all projectile defs across files for cross-file projectile resolution
  const projectileDefs = {}; // defName -> block
  const collectAbstracts = (content) => {
    abstractDefRe.lastIndex = 0;
    let am;
    while ((am = abstractDefRe.exec(content)) !== null) {
      const attrs = am[1];
      // Collect any ThingDef that has a Name attribute (parent candidate)
      const nameMatch = attrs.match(/Name\s*=\s*"([^"]+)"/);
      if (nameMatch) {
        const parentMatch = attrs.match(/ParentName\s*=\s*"([^"]+)"/);
        abstractDefs[nameMatch[1]] = {
          block: am[2],
          parentName: parentMatch ? parentMatch[1] : null
        };
      }
      // Collect projectile defs for cross-file damage lookup
      const projClass = am[2].match(/<thingClass>\s*(Bullet|Projectile)[^<]*<\/thingClass>/);
      if (projClass || am[2].includes('<projectile>')) {
        const dn = am[2].match(/<defName>\s*([^<]+?)\s*<\/defName>/);
        if (dn) projectileDefs[dn[1]] = am[2];
      }
    }
  };

  // Resolve statBases by walking the parent chain (max 10 depth)
  const resolveStatBases = (block, attrs) => {
    let sb = block.match(/<statBases>([\s\S]*?)<\/statBases>/);
    let merged = sb ? sb[1] : '';
    // Walk parent chain and collect missing stat tags
    const parentMatch = attrs.match(/ParentName\s*=\s*"([^"]+)"/);
    let parentName = parentMatch ? parentMatch[1] : null;
    for (let depth = 0; depth < 10 && parentName; depth++) {
      const parent = abstractDefs[parentName];
      if (!parent) break;
      const parentSb = parent.block.match(/<statBases>([\s\S]*?)<\/statBases>/);
      if (parentSb) {
        // Merge: only add tags from parent that are not already in child
        const parentTags = [...parentSb[1].matchAll(/<([A-Za-z_]+)>([\s\S]*?)<\/\1>/g)];
        for (const pt of parentTags) {
          const tagName = pt[1];
          if (!merged.includes('<' + tagName + '>')) {
            merged += pt[0];
          }
        }
      }
      parentName = parent.parentName;
    }
    return merged;
  };

  // Also resolve <apparel> block from parents (layers, bodyPartGroups)
  // Resolve a def's <apparel> block, MERGING <layers> and <bodyPartGroups> from the nearest
  // ancestor that defines them. Apparel very often inherits its layers/coverage from a base
  // def while only overriding cosmetic tags in the child, so a "first block wins" lookup would
  // miss the layers and the item would be dropped. Returns '' only when no <apparel> block
  // exists anywhere in the chain (which is the authoritative "this is apparel" signal).
  const resolveApparelBlock = (block, attrs) => {
    const child = block.match(/<apparel>([\s\S]*?)<\/apparel>/);
    let merged = child ? child[1] : '';
    let found = !!child;
    const lacks = (tag) => !new RegExp('<' + tag + '>').test(merged);
    const pm = attrs.match(/ParentName\s*=\s*"([^"]+)"/);
    let parentName = pm ? pm[1] : null;
    for (let depth = 0; depth < 12 && parentName && (lacks('layers') || lacks('bodyPartGroups') || !found); depth++) {
      const parent = abstractDefs[parentName];
      if (!parent) break;
      const pab = parent.block.match(/<apparel>([\s\S]*?)<\/apparel>/);
      if (pab) {
        found = true;
        if (!merged) merged = pab[1]; // child had no apparel block: adopt the ancestor's wholesale
        else {
          for (const tag of ['layers', 'bodyPartGroups']) {
            if (lacks(tag)) {
              const tm = pab[1].match(new RegExp('<' + tag + '>[\\s\\S]*?</' + tag + '>'));
              if (tm) merged += tm[0];
            }
          }
        }
      }
      parentName = parent.parentName;
    }
    return found ? merged : '';
  };

  // Does a def (or any ancestor) contain a given top-level tag? Used for inherited markers.
  const hasTagInChain = (block, attrs, tag) => {
    if (block.includes('<' + tag + '>')) return true;
    const pm = attrs.match(/ParentName\s*=\s*"([^"]+)"/);
    let pn = pm ? pm[1] : null;
    for (let d = 0; d < 12 && pn; d++) {
      const p = abstractDefs[pn];
      if (!p) break;
      if (p.block.includes('<' + tag + '>')) return true;
      pn = p.parentName;
    }
    return false;
  };

  // Also resolve <equippedStatOffsets> from parents
  const resolveEquippedStatOffsets = (block, attrs) => {
    let eso = block.match(/<equippedStatOffsets>([\s\S]*?)<\/equippedStatOffsets>/);
    if (eso) return eso[1];
    const parentMatch = attrs.match(/ParentName\s*=\s*"([^"]+)"/);
    let parentName = parentMatch ? parentMatch[1] : null;
    for (let depth = 0; depth < 10 && parentName; depth++) {
      const parent = abstractDefs[parentName];
      if (!parent) break;
      const peso = parent.block.match(/<equippedStatOffsets>([\s\S]*?)<\/equippedStatOffsets>/);
      if (peso) return peso[1];
      parentName = parent.parentName;
    }
    return '';
  };

  // Resolve <verbs> block from parent chain (ranged weapons inherit verbs from parents)
  const resolveVerbs = (block, attrs) => {
    let vb = block.match(/<verbs>([\s\S]*?)<\/verbs>/);
    if (vb) return vb[1];
    const parentMatch = attrs.match(/ParentName\s*=\s*"([^"]+)"/);
    let parentName = parentMatch ? parentMatch[1] : null;
    for (let depth = 0; depth < 10 && parentName; depth++) {
      const parent = abstractDefs[parentName];
      if (!parent) break;
      const pvb = parent.block.match(/<verbs>([\s\S]*?)<\/verbs>/);
      if (pvb) return pvb[1];
      parentName = parent.parentName;
    }
    return '';
  };

  // Resolve <tools> block from parent chain (melee weapons inherit tools from parents)
  const resolveTools = (block, attrs) => {
    let tb = block.match(/<tools>([\s\S]*?)<\/tools>/);
    if (tb) return tb[1];
    const parentMatch = attrs.match(/ParentName\s*=\s*"([^"]+)"/);
    let parentName = parentMatch ? parentMatch[1] : null;
    for (let depth = 0; depth < 10 && parentName; depth++) {
      const parent = abstractDefs[parentName];
      if (!parent) break;
      const ptb = parent.block.match(/<tools>([\s\S]*?)<\/tools>/);
      if (ptb) return ptb[1];
      parentName = parent.parentName;
    }
    return '';
  };

  // Resolve <stuffCategories> from parent chain
  const resolveStuffCategories = (block, attrs) => {
    let sc = block.match(/<stuffCategories>([\s\S]*?)<\/stuffCategories>/);
    if (sc) return sc[1];
    const parentMatch = attrs.match(/ParentName\s*=\s*"([^"]+)"/);
    let parentName = parentMatch ? parentMatch[1] : null;
    for (let depth = 0; depth < 10 && parentName; depth++) {
      const parent = abstractDefs[parentName];
      if (!parent) break;
      const psc = parent.block.match(/<stuffCategories>([\s\S]*?)<\/stuffCategories>/);
      if (psc) return psc[1];
      parentName = parent.parentName;
    }
    return '';
  };

  // ── Stuff-based default material stats (verified against Core XML) ──
  // Used to compute base armour values for items with StuffEffectMultiplier
  const STUFF_DEFAULTS = {
    Fabric:   { sharp: 0.94, blunt: 0.26, heat: 0.90, cold: 22, hot: 22 },  // Synthread
    Leathery: { sharp: 0.81, blunt: 0.24, heat: 1.50, cold: 16, hot: 8 },   // Plain leather (LeatherBase)
    Metallic: { sharp: 0.90, blunt: 0.45, heat: 0.60, cold: 3,  hot: 0 },   // Steel
    Woody:    { sharp: 0.54, blunt: 0.54, heat: 0.30, cold: 8,  hot: 8 },   // Wood
    Stony:    { sharp: 0.72, blunt: 0.72, heat: 0.30, cold: 0,  hot: 0 }    // Granite
  };

  const BATCH_SIZE = 40;
  const sender = event.sender;
  const total = xmlFiles.length;
  const yieldToMain = () => new Promise(resolve => setImmediate(resolve));

  // ── Pass 1: Read all files and collect abstract ThingDefs ──
  const fileContents = []; // { content, path, source }
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = xmlFiles.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(f => fsp.readFile(f.path, 'utf-8').then(content => ({ content, path: f.path, source: f.source })))
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        collectAbstracts(r.value.content);
        fileContents.push(r.value);
      }
    }
    if (sender && !sender.isDestroyed()) {
      try { sender.send('mod-scan-progress', { done: Math.min(i + BATCH_SIZE, total), total, pass: 1 }); } catch (_) {}
    }
    await yieldToMain();
  }

  const parseEquipment = (content, filePath, fileSource) => {
    if (!content.includes('<ThingDef')) return;
    thingDefRe.lastIndex = 0;
    let m;
    while ((m = thingDefRe.exec(content)) !== null) {
      const attrs = m[1];
      const block = m[2];

      // Skip abstract base defs (already collected in pass 1)
      if (/Abstract\s*=\s*"True"/i.test(attrs)) continue;

      const defName = tagVal(block, 'defName');
      if (!defName || seenDefs.has(defName)) continue;

      // Skip vanilla items (already in DEFAULT_WEAPONS/DEFAULT_APPAREL)
      if (fileSource === 'vanilla') continue;

      const thingClass = tagVal(block, 'thingClass');

      // ── Weapons ──
      // Check for verbs/tools in the def AND its parent chain (cache for reuse)
      const resolvedVerbsContent = resolveVerbs(block, attrs);
      const resolvedToolsContent = resolveTools(block, attrs);
      const hasVerbs = resolvedVerbsContent !== '' || resolvedToolsContent !== '';
      // Check weaponTags in parent chain too (many mod weapons inherit from a named parent)
      const hasWeaponTags = block.includes('<weaponTags>') || (() => {
        const pm = attrs.match(/ParentName\s*=\s*"([^"]+)"/);
        if (!pm) return false;
        let pn = pm[1];
        for (let d = 0; d < 10 && pn; d++) {
          const p = abstractDefs[pn];
          if (!p) break;
          if (p.block.includes('<weaponTags>')) return true;
          pn = p.parentName;
        }
        return false;
      })();
      // equipmentType (Primary/Secondary) is the authoritative "equippable weapon" marker and
      // is frequently inherited from a base def, so resolve it through the parent chain.
      const hasEquipmentType = hasTagInChain(block, attrs, 'equipmentType');
      // A def with combat <tools> that deal power IS a melee weapon, even when it inherits its
      // equipmentType/weaponTags from a vanilla base def we never indexed. This is the main
      // reason modded melee weapons were being missed.
      const hasCombatTools = resolvedToolsContent !== '' && /<power>\s*[\d.]/.test(resolvedToolsContent);
      const isWeapon = hasWeaponTags || block.includes('IWeapon') || hasCombatTools
        || (hasVerbs && hasEquipmentType)
        || (thingClass && thingClass.includes('ThingWithComps') && hasVerbs && hasEquipmentType);

      if (isWeapon) {
        seenDefs.add(defName);
        const label = stripMarkup(tagVal(block, 'label')) || defName;
        const modName = resolveModName(filePath);

        // Extract statBases with parent inheritance resolution
        const sb = resolveStatBases(block, attrs);

        // Extract first verb <li> inside <verbs> - use cached resolved content
        const verbLi = resolvedVerbsContent ? resolvedVerbsContent.match(/<li>([\s\S]*?)<\/li>/) : null;
        const vb = verbLi ? verbLi[1] : '';

        // Type: ranged only if it has a shooting verb or a projectile; otherwise melee if it has
        // combat tools. (Previously ANY <verbs> block forced "ranged", misclassifying melee
        // weapons that carry a Verb_MeleeAttack and zeroing their damage.)
        const rangedVerb = /Verb_Shoot|Verb_LaunchProjectile|Verb_ShootOneUse|<defaultProjectile>/.test(resolvedVerbsContent);
        const type = rangedVerb ? 'ranged' : (resolvedToolsContent !== '' ? 'melee' : 'ranged');

        // Verb stats (warmup, range, burst from verb <li>)
        const warmup = tagFloat(vb, 'warmupTime');
        const range = tagFloat(vb, 'range');
        const burstCount = parseInt(tagVal(vb, 'burstShotCount')) || 1;
        const burstTicks = parseInt(tagVal(vb, 'ticksBetweenBurstShots')) || 0;

        // Cooldown from statBases (RangedWeapon_Cooldown), NOT from verb
        const cooldown = tagFloat(sb, 'RangedWeapon_Cooldown');

        // Accuracy from statBases (PascalCase tags)
        const accTouch = tagFloat(sb, 'AccuracyTouch');
        const accShort = tagFloat(sb, 'AccuracyShort');
        const accMedium = tagFloat(sb, 'AccuracyMedium');
        const accLong = tagFloat(sb, 'AccuracyLong');

        // AP from statBases or verb
        const ap = tagFloat(sb, 'ArmorPenetration') || tagFloat(vb, 'armorPenetrationBase');

        // Projectile damage - resolve from same file first, then cross-file lookup
        let projDmg = 0;
        const projDef = tagVal(vb, 'defaultProjectile');
        if (projDef) {
          // Try same-file lookup first
          const projBlockRe = new RegExp('<ThingDef[^>]*>[\\s\\S]*?<defName>\\s*' + projDef + '\\s*</defName>[\\s\\S]*?</ThingDef>');
          const projBlock = content.match(projBlockRe);
          if (projBlock) {
            const dmgM = projBlock[0].match(/<damageAmountBase>(\d+(?:\.\d+)?)<\/damageAmountBase>/);
            if (dmgM) projDmg = parseFloat(dmgM[1]) || 0;
          }
          // Cross-file fallback: check projectileDefs collected during first pass
          if (!projDmg && projectileDefs[projDef]) {
            const dmgM = projectileDefs[projDef].match(/<damageAmountBase>(\d+(?:\.\d+)?)<\/damageAmountBase>/);
            if (dmgM) projDmg = parseFloat(dmgM[1]) || 0;
          }
        }
        // Fallback: inline damageAmountBase in the weapon def itself
        if (!projDmg) {
          const dmgMatch = block.match(/<damageAmountBase>(\d+(?:\.\d+)?)<\/damageAmountBase>/);
          if (dmgMatch) projDmg = parseFloat(dmgMatch[1]) || 0;
        }

        // Melee damage from <tools> - resolve from parent chain, pick best DPS tool
        let meleeDmg = 0;
        let meleeCooldown = 1;
        let meleeDamageType = 'sharp'; // default to sharp; overridden if blunt detected
        if (type === 'melee') {
          if (resolvedToolsContent) {
            // Split into individual tool <li> blocks for capacity detection
            const toolLis = [...resolvedToolsContent.matchAll(/<li>([\s\S]*?)<\/li>/g)];
            const powers = [...resolvedToolsContent.matchAll(/<power>([\d.]+)<\/power>/g)];
            const cooldowns = [...resolvedToolsContent.matchAll(/<cooldownTime>([\d.]+)<\/cooldownTime>/g)];
            let bestDps = 0;
            let bestIdx = 0;
            for (let ti = 0; ti < powers.length; ti++) {
              const d = parseFloat(powers[ti][1]) || 0;
              const c = (ti < cooldowns.length ? parseFloat(cooldowns[ti][1]) : 1) || 1;
              if (d > 0 && (d / c) > bestDps) {
                bestDps = d / c;
                meleeDmg = d;
                meleeCooldown = c;
                bestIdx = ti;
              }
            }
            // Detect damage type from best tool's capacities
            if (bestIdx < toolLis.length) {
              const toolBlock = toolLis[bestIdx][1];
              const capSection = toolBlock.match(/<capacities>([\s\S]*?)<\/capacities>/);
              if (capSection) {
                const caps = capSection[1].toLowerCase();
                if (caps.includes('blunt') && !caps.includes('cut') && !caps.includes('stab') && !caps.includes('scratch')) {
                  meleeDamageType = 'blunt';
                }
              }
            }
            // Fallback: check label/defName for blunt indicators
            if (meleeDamageType === 'sharp') {
              const lbl = (tagVal(block, 'label') || defName).toLowerCase();
              if (lbl.includes('club') || lbl.includes('mace') || lbl.includes('hammer') || lbl.includes('staff')) {
                meleeDamageType = 'blunt';
              }
            }
          }
        }

        // Stuff (material) support for melee weapons - use resolveStuffCategories
        const wStuffCatContent = resolveStuffCategories(block, attrs);
        const wStuffCats = wStuffCatContent
          ? [...wStuffCatContent.matchAll(/<li>(.*?)<\/li>/g)].map(x => x[1].trim())
          : [];
        const wIsStuffBased = wStuffCats.length > 0 || block.includes('<costStuffCount>');

        // Tech level
        const techLevel = tagVal(block, 'techLevel') || '';

        const weapon = {
          id: 'mod_w_' + defName,
          defName: defName,
          name: label.charAt(0).toUpperCase() + label.slice(1),
          type: type,
          damage: type === 'melee' ? meleeDmg : (projDmg || 0),
          warmup: warmup,
          cooldown: type === 'melee' ? meleeCooldown : cooldown,
          ap: ap,
          range: type === 'melee' ? 0 : (range || 0),
          accuracyTouch: accTouch,
          accuracyShort: accShort,
          accuracyMedium: accMedium,
          accuracyLong: accLong,
          burstCount: burstCount,
          burstTicks: burstTicks,
          quality: 'normal',
          techLevel: techLevel
        };
        if (type === 'melee') {
          weapon.meleeDamageType = meleeDamageType;
          if (wIsStuffBased) {
            weapon.stuffBased = true;
            weapon.stuffCategories = wStuffCats;
            weapon.stuff = null;
          }
        }
        if (modName) weapon.modSource = modName;
        weapons.push(weapon);
        continue;
      }

      // ── Apparel ──
      // Check parent chain for apparel markers too
      const resolvedAb = resolveApparelBlock(block, attrs);
      // Any <apparel> block anywhere in the chain means this IS apparel, even if it inherits
      // its <layers> from a base def (previously such items were silently dropped).
      const hasApparelBlock = resolvedAb !== '';
      const parentIsApparel = (() => {
        const pm = attrs.match(/ParentName\s*=\s*"([^"]+)"/);
        if (!pm) return false;
        const pName = pm[1].toLowerCase();
        return pName.includes('apparel') || pName.includes('armor') || pName.includes('armou');
      })();
      const isApparel = thingClass === 'Apparel'
        || (thingClass && thingClass.includes('Apparel'))
        || block.includes('<thingClass>Apparel</thingClass>')
        || hasApparelBlock
        || parentIsApparel;

      if (isApparel) {
        seenDefs.add(defName);
        const label = stripMarkup(tagVal(block, 'label')) || defName;
        const modName = resolveModName(filePath);

        // Layer detection - resolve from parent chain if needed
        const ab = resolveApparelBlock(block, attrs);
        const layerSection = ab.match(/<layers>([\s\S]*?)<\/layers>/);
        const layers = layerSection
          ? [...layerSection[1].matchAll(/<li>(.*?)<\/li>/g)].map(x => x[1].trim())
          : [];

        let layer = 'outer';
        const layerLower = layers.map(l => l.toLowerCase());
        if (layerLower.some(l => l.includes('overhead') || l.includes('head'))) layer = 'head';
        else if (layerLower.some(l => l.includes('belt'))) layer = 'belt';
        else if (layerLower.some(l => l.includes('skin') || l.includes('onskin'))) layer = 'skin';
        else if (layerLower.some(l => l.includes('middle'))) layer = 'middle';
        else if (layerLower.some(l => l.includes('shell') || l.includes('outer'))) layer = 'outer';

        // Coverage / body parts - from resolved apparel block
        const bpSection = ab.match(/<bodyPartGroups>([\s\S]*?)<\/bodyPartGroups>/);
        const bodyParts = bpSection
          ? [...bpSection[1].matchAll(/<li>(.*?)<\/li>/g)].map(x => x[1].trim())
          : [];
        const coverage = bodyParts.length > 0 ? bodyParts : ['Torso'];

        // Armour stats from statBases with parent inheritance resolution
        const sb = resolveStatBases(block, attrs);
        let armorSharp = tagFloat(sb, 'ArmorRating_Sharp');
        let armorBlunt = tagFloat(sb, 'ArmorRating_Blunt');
        let armorHeat = tagFloat(sb, 'ArmorRating_Heat');
        let insulCold = tagFloat(sb, 'Insulation_Cold');
        let insulHeat = tagFloat(sb, 'Insulation_Heat');
        const mass = tagFloat(sb, 'Mass');
        const moveSpeed = tagFloat(sb, 'MoveSpeed');

        // Check if stuff-based (stats come from material, not fixed values)
        // Also check parent chain for costStuffCount (many mod apparel inherits this)
        const hasCostStuff = block.includes('<costStuffCount>') || (() => {
          const pm = attrs.match(/ParentName\s*=\s*"([^"]+)"/);
          if (!pm) return false;
          let pn = pm[1];
          for (let d = 0; d < 10 && pn; d++) {
            const p = abstractDefs[pn];
            if (!p) break;
            if (p.block.includes('<costStuffCount>')) return true;
            pn = p.parentName;
          }
          return false;
        })();
        const isStuffBased = sb.includes('StuffEffectMultiplierArmor') || hasCostStuff
          || resolveStuffCategories(block, attrs) !== '';

        // For stuff-based items with no direct armour stats, compute defaults
        // using reference material stats for the first allowed stuff category
        if (isStuffBased && armorSharp === 0 && armorBlunt === 0) {
          const stuffCatContent = resolveStuffCategories(block, attrs);
          const stuffCats = stuffCatContent
            ? [...stuffCatContent.matchAll(/<li>(.*?)<\/li>/g)].map(x => x[1].trim())
            : [];
          const firstCat = stuffCats[0] || '';
          const mat = STUFF_DEFAULTS[firstCat];
          if (mat) {
            const multArmor = tagFloat(sb, 'StuffEffectMultiplierArmor') || 1;
            const multCold = tagFloat(sb, 'StuffEffectMultiplierInsulation_Cold') || 1;
            const multHeat = tagFloat(sb, 'StuffEffectMultiplierInsulation_Heat') || 1;
            armorSharp = mat.sharp * multArmor;
            armorBlunt = mat.blunt * multArmor;
            armorHeat = mat.heat * multArmor;
            if (insulCold === 0) insulCold = mat.cold * multCold;
            if (insulHeat === 0) insulHeat = mat.hot * multHeat;
          }
        }

        // Detect type (armour vs clothing vs utility)
        let apparelType = 'clothing';
        if (armorSharp > 0.2 || block.includes('ArmorHeavy') || block.includes('ArmorLight')
            || block.includes('ArmorMachining') || block.includes('ArmorSmithing')) {
          apparelType = 'armour';
        }
        if (layer === 'belt') apparelType = 'utility';

        const item = {
          id: 'mod_a_' + defName,
          defName: defName,
          name: label.charAt(0).toUpperCase() + label.slice(1),
          type: apparelType,
          layer: layer,
          coverage: coverage,
          armorSharp: armorSharp,
          armorBlunt: armorBlunt,
          armorHeat: armorHeat,
          insulationCold: insulCold,
          insulationHeat: insulHeat,
          mass: mass || 1,
          moveSpeed: moveSpeed,
          quality: 'normal',
          stuffBased: isStuffBased || false
        };
        if (modName) item.modSource = modName;
        if (isStuffBased) {
          const stuffMult = tagFloat(sb, 'StuffEffectMultiplierArmor');
          const stuffMultCold = tagFloat(sb, 'StuffEffectMultiplierInsulation_Cold');
          const stuffMultHeat = tagFloat(sb, 'StuffEffectMultiplierInsulation_Heat');
          item.stuffMultArmor = stuffMult || 1;
          item.stuffMultInsulCold = stuffMultCold || 0;
          item.stuffMultInsulHeat = stuffMultHeat || 0;
          // Resolve stuff categories from item or parent chain
          const aStuffCatContent = resolveStuffCategories(block, attrs);
          const stuffCats = aStuffCatContent
            ? [...aStuffCatContent.matchAll(/<li>(.*?)<\/li>/g)].map(x => x[1].trim())
            : [];
          item.stuffCategories = stuffCats;
          item.stuff = null;
          const matNames = { Fabric: 'synthread', Leathery: 'plainleather', Metallic: 'steel', Woody: 'wood', Stony: 'granite' };
          const refMat = matNames[stuffCats[0]] || stuffCats[0] || '';
          item.notes = 'Stuff-based' + (refMat ? ' (shown as ' + refMat + ')' : '') + (stuffMult ? ' - armour mult: x' + stuffMult : '');
        }

        // ── Utility-specific fields for Belt-layer items ──
        if (layer === 'belt') {
          // Shield detection: EnergyShieldEnergyMax / EnergyShieldRechargeRate in statBases
          const shieldMax = tagFloat(sb, 'EnergyShieldEnergyMax');
          const shieldRecharge = tagFloat(sb, 'EnergyShieldRechargeRate');
          if (shieldMax > 0) {
            item.utilityCategory = 'shield';
            item.shieldMax = shieldMax;
            item.shieldRecharge = shieldRecharge;
            // Custom energyLossPerDamage from CompProperties_Shield (default 0.033)
            const shieldComp = block.match(/<CompProperties_Shield>([\s\S]*?)<\/CompProperties_Shield>/);
            const lossPerDmg = shieldComp ? tagFloat(shieldComp[1], 'energyLossPerDamage') : 0;
            item.shieldLossPerDmg = lossPerDmg > 0 ? lossPerDmg : 0.033;
            // Check if shield blocks ranged weapons outward (default true for standard shield belts)
            const blocksRangedMatch = shieldComp && shieldComp[1].match(/<blocksRangedWeapons>(.*?)<\/blocksRangedWeapons>/i);
            item.blocksRangedOut = blocksRangedMatch ? blocksRangedMatch[1].trim().toLowerCase() !== 'false' : true;
          }

          // Stat offsets: RangedCooldownFactor, MeleeCooldownFactor, etc.
          const resolvedOffsets = resolveEquippedStatOffsets(block, attrs);
          if (resolvedOffsets) {
            const ob = resolvedOffsets;
            const offsets = {};
            const rcdFactor = tagFloat(ob, 'RangedCooldownFactor');
            const mcdFactor = tagFloat(ob, 'MeleeCooldownFactor');
            const aimFactor = tagFloat(ob, 'AimingDelayFactor');
            const shootAcc = tagFloat(ob, 'ShootingAccuracyPawn');
            const moveOff = tagFloat(ob, 'MoveSpeed');
            const mechBand = tagFloat(ob, 'MechBandwidth');
            const mechCtrl = tagFloat(ob, 'MechControlGroups');
            if (rcdFactor) offsets.rangedCooldownFactor = rcdFactor;
            if (mcdFactor) offsets.meleeCooldownFactor = mcdFactor;
            if (aimFactor) offsets.aimingDelayFactor = aimFactor;
            if (shootAcc) offsets.shootingAccuracy = shootAcc;
            if (moveOff) offsets.moveSpeed = moveOff;
            if (mechBand) offsets.mechBandwidth = mechBand;
            if (mechCtrl) offsets.mechControlGroups = mechCtrl;
            if (Object.keys(offsets).length > 0) {
              item.statOffsets = offsets;
              if (!item.utilityCategory) item.utilityCategory = 'passive';
            }
          }

          // Reloadable comp: charges, single-use detection
          const reloadComp = block.match(/<CompProperties_ApparelReloadable>([\s\S]*?)<\/CompProperties_ApparelReloadable>/);
          if (reloadComp) {
            const rc = reloadComp[1];
            item.charges = parseInt(tagVal(rc, 'maxCharges')) || 1;
            // Detect single-use (destroyOnEmpty or maxCharges=1 with no replenish)
            if (rc.includes('<destroyOnEmpty>true</destroyOnEmpty>') || rc.includes('<destroyOnEmpty>True</destroyOnEmpty>')) {
              item.singleUse = true;
            }
            if (!item.utilityCategory) item.utilityCategory = 'active';
          }

          // Lance/verb detection: range, warmup from embedded verbs
          const verbsBlock = block.match(/<verbs>([\s\S]*?)<\/verbs>/);
          if (verbsBlock) {
            const vbLi = verbsBlock[1].match(/<li>([\s\S]*?)<\/li>/);
            if (vbLi) {
              const vRange = tagFloat(vbLi[1], 'range');
              const vWarmup = tagFloat(vbLi[1], 'warmupTime');
              if (vRange > 0) item.range = vRange;
              if (vWarmup > 0) item.warmup = vWarmup;
              if (vRange > 0 && vWarmup > 0 && !item.utilityCategory) {
                item.utilityCategory = 'lance';
              }
            }
          }

          // Radius detection for area-effect utilities (smokepop, tox, etc.)
          const radiusMatch = block.match(/<radius>([\d.]+)<\/radius>/);
          if (radiusMatch) item.radius = parseFloat(radiusMatch[1]) || 0;

          // Default category for belt items with no specific markers
          if (!item.utilityCategory) item.utilityCategory = 'passive';
        }

        apparel.push(item);
      }

      // ── Materials (stuff) ──
      // Detect ThingDefs with <stuffProps> - these are materials/stuff
      if (block.includes('<stuffProps>') && !seenMaterials.has(defName)) {
        // Skip vanilla items
        if (fileSource === 'vanilla') continue;
        seenMaterials.add(defName);
        const label = stripMarkup(tagVal(block, 'label')) || defName;
        const modName = resolveModName(filePath);
        const sb = resolveStatBases(block, attrs);

        // Stuff categories from <stuffProps><categories>
        const stuffPropsBlock = block.match(/<stuffProps>([\s\S]*?)<\/stuffProps>/);
        const catBlock = stuffPropsBlock ? stuffPropsBlock[1].match(/<categories>([\s\S]*?)<\/categories>/) : null;
        const categories = catBlock
          ? [...catBlock[1].matchAll(/<li>(.*?)<\/li>/g)].map(x => x[1].trim())
          : [];

        // Weapon damage multipliers from statBases
        const sharpDmg = tagFloat(sb, 'SharpDamageMultiplier') || 1.0;
        const bluntDmg = tagFloat(sb, 'BluntDamageMultiplier') || 1.0;

        // MeleeWeapon_CooldownMultiplier from stuffProps.statFactors
        let meleeCooldown = 1.0;
        if (stuffPropsBlock) {
          const sfBlock = stuffPropsBlock[1].match(/<statFactors>([\s\S]*?)<\/statFactors>/);
          if (sfBlock) {
            const cdMult = tagFloat(sfBlock[1], 'MeleeWeapon_CooldownMultiplier');
            if (cdMult > 0) meleeCooldown = cdMult;
          }
        }

        // Armour stats (StuffPower values)
        const armorSharp = tagFloat(sb, 'StuffPower_Armor_Sharp') || 0;
        const armorBlunt = tagFloat(sb, 'StuffPower_Armor_Blunt') || 0;
        const armorHeat = tagFloat(sb, 'StuffPower_Armor_Heat') || 0;
        const insulCold = tagFloat(sb, 'StuffPower_Insulation_Cold') || 0;
        const insulHeat = tagFloat(sb, 'StuffPower_Insulation_Heat') || 0;

        const mat = {
          id: defName,
          label: label.charAt(0).toUpperCase() + label.slice(1),
          categories: categories,
          sharpDmg: sharpDmg,
          bluntDmg: bluntDmg,
          meleeCooldown: meleeCooldown,
          armorSharp: armorSharp,
          armorBlunt: armorBlunt,
          armorHeat: armorHeat,
          insulCold: insulCold,
          insulHeat: insulHeat
        };
        if (modName) mat.modSource = modName;
        materials.push(mat);
      }
    }
  };

  // ── Pass 2: Parse concrete equipment defs with inheritance resolution ──
  const totalFiles = fileContents.length;
  let filesRead = 0;
  for (let i = 0; i < totalFiles; i += BATCH_SIZE) {
    const batch = fileContents.slice(i, i + BATCH_SIZE);
    for (const fc of batch) {
      parseEquipment(fc.content, fc.path, fc.source);
      filesRead++;
    }
    if (sender && !sender.isDestroyed()) {
      try { sender.send('mod-scan-progress', { done: Math.min(i + BATCH_SIZE, totalFiles), total: totalFiles, pass: 2 }); } catch (_) {}
    }
    await yieldToMain();
  }

  return { weapons, apparel, materials, fileCount: filesRead, totalScanned: total, abstractDefs: Object.keys(abstractDefs).length };
});

// Pick a directory via dialog (for xenotype scanning)
ipcMain.handle('pick-directory', async (_, defaultPath) => {
  const fs = require('fs');
  // Try caller-supplied path first, then probe common RimWorld install locations
  const candidates = [
    defaultPath,
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld',
    'C:\\Program Files\\Steam\\steamapps\\common\\RimWorld',
    'D:\\Steam\\steamapps\\common\\RimWorld',
    'D:\\SteamLibrary\\steamapps\\common\\RimWorld',
    'E:\\SteamLibrary\\steamapps\\common\\RimWorld',
    'C:\\GOG Games\\RimWorld',
    'D:\\GOG Games\\RimWorld',
    'C:\\Program Files\\Epic Games\\RimWorld',
    'C:\\Program Files (x86)\\RimWorld'
  ].filter(Boolean);
  const dPath = candidates.find(p => { try { return fs.existsSync(p); } catch(_) { return false; } });
  const result = await dialog.showOpenDialog(win, {
    title: 'Select RimWorld or Mod Directory',
    defaultPath: dPath || undefined,
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

// Silently locate the RimWorld install (no dialog). Probes common install
// locations and parses Steam's libraryfolders.vdf for custom library drives.
ipcMain.handle('find-rimworld-path', async () => {
  const fs = require('fs');
  const pathMod = require('path');
  const exists = (p) => { try { return p && fs.existsSync(p); } catch (_) { return false; } };
  const candidates = [
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld',
    'C:\\Program Files\\Steam\\steamapps\\common\\RimWorld',
    'D:\\Steam\\steamapps\\common\\RimWorld',
    'D:\\SteamLibrary\\steamapps\\common\\RimWorld',
    'E:\\SteamLibrary\\steamapps\\common\\RimWorld',
    'E:\\Steam\\steamapps\\common\\RimWorld',
    'C:\\GOG Games\\RimWorld',
    'D:\\GOG Games\\RimWorld',
    'C:\\Program Files\\Epic Games\\RimWorld',
    'C:\\Program Files (x86)\\RimWorld'
  ];
  // Discover extra Steam library drives from libraryfolders.vdf
  const steamRoots = ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam', 'D:\\Steam', 'E:\\Steam'];
  for (const sr of steamRoots) {
    const vdf = pathMod.join(sr, 'steamapps', 'libraryfolders.vdf');
    try {
      if (fs.existsSync(vdf)) {
        const txt = fs.readFileSync(vdf, 'utf-8');
        const re = /"path"\s*"([^"]+)"/g; let m;
        while ((m = re.exec(txt))) {
          const lib = m[1].replace(/\\\\/g, '\\');
          candidates.push(pathMod.join(lib, 'steamapps', 'common', 'RimWorld'));
        }
      }
    } catch (_) { /* ignore */ }
  }
  return candidates.find(exists) || null;
});

// ─── File-based save/load ───
// Save colony data to a user-chosen file path
ipcMain.handle('save-to-file', async (_, filePath, jsonString) => {
  const fs = require('fs');
  try {
    fs.writeFileSync(filePath, jsonString, 'utf-8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Load colony data from a file path
ipcMain.handle('load-from-file', async (_, filePath) => {
  const fs = require('fs');
  try {
    if (!fs.existsSync(filePath)) return { ok: false, error: 'File not found' };
    const data = fs.readFileSync(filePath, 'utf-8');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Pick a save file location
ipcMain.handle('pick-save-location', async (_, defaultPath) => {
  const result = await dialog.showSaveDialog(win, {
    title: 'Choose Colony Save Location',
    defaultPath: defaultPath || 'rimjobs_colony.json',
    filters: [{ name: 'RimJobs Save', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
});

// ─── Clipboard (the renderer's sandboxed preload can't access `clipboard`) ───
ipcMain.on('clipboard-read-sync', (e) => {
  try { e.returnValue = clipboard.readText(); } catch (_) { e.returnValue = ''; }
});
ipcMain.on('clipboard-write', (_, text) => {
  try { clipboard.writeText(String(text == null ? '' : text)); } catch (_) {}
});

// ─── Edited save export (.rws round-trip) ───
// Default to RimWorld's Saves folder so the edited copy shows up in the load list.
function savesDir() {
  const os = require('os');
  return path.join(os.homedir(), 'AppData', 'LocalLow', 'Ludeon Studios', 'RimWorld by Ludeon Studios', 'Saves');
}
ipcMain.handle('export-edited-save', async (_, defaultName, text) => {
  const fs = require('fs');
  const safe = (typeof defaultName === 'string' && defaultName ? defaultName.replace(/[^\w\- ]+/g, '_').trim() : '') || 'RimJobs_Edited';
  let defaultPath = safe + '.rws';
  try { const d = savesDir(); if (fs.existsSync(d)) defaultPath = path.join(d, defaultPath); } catch (e) { /* default cwd */ }
  const result = await dialog.showSaveDialog(win, {
    title: 'Export Edited Save',
    defaultPath,
    filters: [{ name: 'RimWorld Save', extensions: ['rws'] }]
  });
  if (result.canceled || !result.filePath) return null;
  try {
    fs.writeFileSync(result.filePath, typeof text === 'string' ? text : '', 'utf-8');
    return { ok: true, filePath: result.filePath };
  } catch (e) { return { ok: false, error: e.message }; }
});

// ─── Blueprint XML (Blueprints-mod format) export / import ───
// Default to RimWorld's Blueprints folder so files drop straight into the mod.
function blueprintsDir() {
  const os = require('os');
  return path.join(os.homedir(), 'AppData', 'LocalLow', 'Ludeon Studios', 'RimWorld by Ludeon Studios', 'Blueprints');
}
ipcMain.handle('export-blueprint-xml', async (_, defaultName, xml) => {
  const fs = require('fs');
  const safe = (typeof defaultName === 'string' && defaultName ? defaultName.replace(/[^\w\- ]+/g, '_').trim() : '') || 'RimJobs_Blueprint';
  let defaultPath = safe + '.xml';
  try { const d = blueprintsDir(); if (fs.existsSync(d)) defaultPath = path.join(d, defaultPath); } catch (e) { /* default cwd */ }
  const result = await dialog.showSaveDialog(win, {
    title: 'Export Blueprint (Blueprints mod format)',
    defaultPath,
    filters: [{ name: 'Blueprint XML', extensions: ['xml'] }]
  });
  if (result.canceled || !result.filePath) return null;
  try {
    let out = typeof xml === 'string' ? xml : '';
    // Make the in-game <Name> match the file the user actually chose.
    const base = path.basename(result.filePath).replace(/\.xml$/i, '');
    const escaped = base.replace(/[<>&]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch]));
    if (/<Name>[\s\S]*?<\/Name>/.test(out)) out = out.replace(/<Name>[\s\S]*?<\/Name>/, '<Name>' + escaped + '</Name>');
    fs.writeFileSync(result.filePath, out, 'utf-8');
    return { ok: true, filePath: result.filePath };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('import-blueprint-xml', async () => {
  const fs = require('fs');
  const opts = { title: 'Import Blueprint XML', filters: [{ name: 'Blueprint XML', extensions: ['xml'] }], properties: ['openFile'] };
  try { const d = blueprintsDir(); if (fs.existsSync(d)) opts.defaultPath = d; } catch (e) { /* default */ }
  const result = await dialog.showOpenDialog(win, opts);
  if (result.canceled || !result.filePaths || !result.filePaths[0]) return null;
  try { const xml = fs.readFileSync(result.filePaths[0], 'utf-8'); return { ok: true, xml, filePath: result.filePaths[0] }; }
  catch (e) { return { ok: false, error: e.message }; }
});

// ─── Input capture start/stop ───
// The window is non-focusable so it never steals focus from the game; to let the
// user type into overlay inputs, the renderer asks us to start a native key hook
// (GetAsyncKeyState polling) which forwards keystrokes for DOM injection.
ipcMain.on('window-request-focus', () => {
  if (!win) return;
  if (!inputCaptureActive) {
    inputCaptureActive = true;
    keyboardHook.startCapture();
    console.log('[overlay] Capture started');
  }
});

ipcMain.on('window-release-focus', () => {
  if (!win) return;
  if (inputCaptureActive) {
    inputCaptureActive = false;
    keyboardHook.stopCapture();
    console.log('[overlay] Capture stopped');
  }
});

// Minimize → collapse to toolbar
let isMinimized = false;
let savedBounds = null;
// The collapsed bar's own width, remembered across collapse/expand cycles so each
// collapse returns to the width the user last gave the bar (independent of how wide
// the expanded window is). Null until the first collapse.
let collapsedWidth = null;
// When non-null, the window is collapsed and its height is hard-pinned to this value
// by the will-resize handler (so only width is user-adjustable). Null when expanded.
let collapsedLockHeight = null;
const TOOLBAR_HEIGHT = 36;
// Effectively-unlimited dimension, used to clear a previously pinned max size.
const SIZE_UNLIMITED = 32767;

ipcMain.on('window-minimize', () => {
  if (!win) return;
  if (!isMinimized) {
    savedBounds = win.getBounds();
    // Collapsed bar stays resizable, but only horizontally: pin the height to the
    // toolbar height (min == max height) while leaving width free, so the user can
    // widen/narrow the bar with the height locked.
    win.setMinimumSize(200, TOOLBAR_HEIGHT);
    win.setMaximumSize(SIZE_UNLIMITED, TOOLBAR_HEIGHT);
    // Native resize OFF while collapsed, so NO edge or corner resize cursors appear
    // at all (the title-bar rule the user wants). Width is instead adjusted through
    // the custom left/right grips in the bar, which drive setBounds via IPC below.
    win.setResizable(false);
    collapsedLockHeight = TOOLBAR_HEIGHT;
    // Collapse to the remembered bar width; first time, seed it from the window width.
    if (collapsedWidth == null) collapsedWidth = savedBounds.width;
    win.setBounds({ x: savedBounds.x, y: savedBounds.y, width: collapsedWidth, height: TOOLBAR_HEIGHT }, false);
    isMinimized = true;
    // Keep the taskbar button present even while collapsed, so the user can
    // click it to restore. Re-assert it (collapsing can drop the app-window style).
    forceTaskbar();
    win.webContents.send('minimized-state', true);
  } else {
    win.setResizable(true);
    collapsedLockHeight = null; // expanded: free vertical resize again
    win.setMaximumSize(SIZE_UNLIMITED, SIZE_UNLIMITED); // release the height pin
    if (savedBounds) {
      const currentBounds = win.getBounds();
      // Remember the (possibly resized) collapsed width for the next collapse.
      collapsedWidth = currentBounds.width;
      // Expand: retain the bar's width, but the WIDGET_SIZE minimum clamps it up when
      // the bar is narrower than the widget. Restore the saved height.
      win.setMinimumSize(WIDGET_SIZE.width, WIDGET_SIZE.height);
      win.setBounds({ x: currentBounds.x, y: currentBounds.y, width: currentBounds.width, height: savedBounds.height }, false);
    }
    isMinimized = false;
    // Re-assert the taskbar icon while the full window is open.
    forceTaskbar();
    win.webContents.send('minimized-state', false);
  }
});
ipcMain.on('window-close', () => win?.close());
ipcMain.on('window-set-opacity', (_, value) => {
  if (!win) return;
  const clamped = Math.max(0.3, Math.min(1.0, value));
  try { win.setOpacity(clamped); } catch (_) {}
});
ipcMain.on('window-toggle-top', () => {
  if (!win) return;
  alwaysOnTop = !win.isAlwaysOnTop();
  win.setAlwaysOnTop(alwaysOnTop, 'screen-saver');
});
// Explicit set from the Settings toggle (persisted in the renderer).
ipcMain.on('window-set-always-on-top', (_, val) => {
  alwaysOnTop = !!val;
  if (win) win.setAlwaysOnTop(alwaysOnTop, 'screen-saver');
});

ipcMain.on('window-confirm-quit', () => {
  doQuit();
});

ipcMain.on('window-minimize-taskbar', () => {
  if (win) {
    // Minimise to the system tray: drop the taskbar button and hide the window
    // entirely. It's reopened only from the tray icon.
    try { win.setSkipTaskbar(true); } catch (_) {}
    win.hide();
    isVisible = false;
  }
});
// Standard OS minimise (to the taskbar button) - used when the user opts out of
// the default minimise-to-tray behaviour.
ipcMain.on('window-minimize-normal', () => {
  if (!win) return;
  try { win.setSkipTaskbar(false); } catch (_) {}
  try { win.minimize(); } catch (_) {}
});

const QUIT_DRAWER_HEIGHT = 110;
ipcMain.on('window-expand-for-quit', () => {
  if (!win || !isMinimized) return;
  const b = win.getBounds();
  // Raise the pinned height so the quit drawer can grow, keeping the current width.
  collapsedLockHeight = TOOLBAR_HEIGHT + QUIT_DRAWER_HEIGHT;
  win.setMinimumSize(200, TOOLBAR_HEIGHT + QUIT_DRAWER_HEIGHT);
  win.setMaximumSize(SIZE_UNLIMITED, TOOLBAR_HEIGHT + QUIT_DRAWER_HEIGHT);
  win.setBounds({ x: b.x, y: b.y, width: b.width, height: TOOLBAR_HEIGHT + QUIT_DRAWER_HEIGHT }, false);
});
ipcMain.on('window-collapse-after-quit', () => {
  if (!win || !isMinimized) return;
  const b = win.getBounds();
  // Back to the thin bar: re-pin the height to the toolbar height.
  collapsedLockHeight = TOOLBAR_HEIGHT;
  win.setMaximumSize(SIZE_UNLIMITED, TOOLBAR_HEIGHT);
  win.setMinimumSize(200, TOOLBAR_HEIGHT);
  win.setBounds({ x: b.x, y: b.y, width: b.width, height: TOOLBAR_HEIGHT }, false);
});

let positionLocked = false;
ipcMain.on('window-toggle-lock', () => {
  if (!win) return;
  positionLocked = !positionLocked;
  win.webContents.send('position-locked', positionLocked);
});

let dragStart = null;
ipcMain.on('window-drag-start', (_, screenX, screenY) => {
  if (!win || positionLocked) return;
  const bounds = win.getBounds();
  dragStart = { x: screenX - bounds.x, y: screenY - bounds.y };
});
ipcMain.on('window-drag-move', (_, screenX, screenY) => {
  if (!win || !dragStart || positionLocked) return;
  win.setPosition(screenX - dragStart.x, screenY - dragStart.y);
});
ipcMain.on('window-drag-end', () => { dragStart = null; });

// Custom WIDTH-only resize for the collapsed bar. Native resize is disabled while
// collapsed (no vertical/corner cursors), so the bar's left/right grips drive this
// instead. We anchor to the opposite edge captured at grab time and move only the
// dragged edge, height never changes.
let collapsedResize = null; // { edge:'left'|'right', bounds }
const COLLAPSED_MIN_W = 200;
ipcMain.on('window-collapsed-resize-start', (_, edge) => {
  if (!win || !isMinimized) return;
  collapsedResize = { edge: edge === 'left' ? 'left' : 'right', bounds: win.getBounds() };
});
ipcMain.on('window-collapsed-resize-move', (_, screenX) => {
  if (!win || !collapsedResize) return;
  const b = collapsedResize.bounds;
  if (collapsedResize.edge === 'right') {
    // Left edge fixed at b.x; right edge follows the cursor.
    const w = Math.max(COLLAPSED_MIN_W, Math.round(screenX - b.x));
    win.setBounds({ x: b.x, y: b.y, width: w, height: b.height }, false);
    collapsedWidth = w;
  } else {
    // Right edge fixed; left edge (and x) follow the cursor.
    const right = b.x + b.width;
    let x = Math.round(screenX);
    let w = right - x;
    if (w < COLLAPSED_MIN_W) { w = COLLAPSED_MIN_W; x = right - COLLAPSED_MIN_W; }
    win.setBounds({ x, y: b.y, width: w, height: b.height }, false);
    collapsedWidth = w;
  }
});
ipcMain.on('window-collapsed-resize-end', () => { collapsedResize = null; });

ipcMain.on('window-snap-left', () => {
  if (!win) return;
  if (isMinimized) { isMinimized = false; collapsedLockHeight = null; win.setResizable(true); win.setMaximumSize(SIZE_UNLIMITED, SIZE_UNLIMITED); win.webContents.send('minimized-state', false); }
  const bounds = win.getBounds();
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
  const area = display.workArea;
  win.setMinimumSize(WIDGET_SIZE.width, WIDGET_SIZE.height);
  win.setBounds({ x: area.x, y: area.y, width: Math.round(area.width / 2), height: area.height }, false);
  win.webContents.send('window-snapped', 'left');
});
ipcMain.on('window-snap-right', () => {
  if (!win) return;
  if (isMinimized) { isMinimized = false; collapsedLockHeight = null; win.setResizable(true); win.setMaximumSize(SIZE_UNLIMITED, SIZE_UNLIMITED); win.webContents.send('minimized-state', false); }
  const bounds = win.getBounds();
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
  const area = display.workArea;
  win.setMinimumSize(WIDGET_SIZE.width, WIDGET_SIZE.height);
  win.setBounds({ x: area.x + Math.round(area.width / 2), y: area.y, width: Math.round(area.width / 2), height: area.height }, false);
  win.webContents.send('window-snapped', 'right');
});

ipcMain.on('window-set-sizes', (_, widget, full) => {
  if (widget && widget.width >= 340 && widget.height >= 400) {
    WIDGET_SIZE = { width: Math.round(widget.width), height: Math.round(widget.height) };
  }
  if (full && full.width >= 340 && full.height >= 400) {
    FULL_SIZE = { width: Math.round(full.width), height: Math.round(full.height) };
  }
  // Keep the live minimum-drag floor in step with the (possibly customised) widget
  // size, except while collapsed to the toolbar or in fullscreen, which set their
  // own deliberately smaller minimums.
  if (win && !isMinimized && !animating) {
    const cur = win.getBounds();
    const display = screen.getDisplayNearestPoint({ x: cur.x, y: cur.y });
    const wa = display.workArea;
    const isFs = cur.x === wa.x && cur.y === wa.y && cur.width === wa.width && cur.height === wa.height;
    if (!isFs) win.setMinimumSize(WIDGET_SIZE.width, WIDGET_SIZE.height);
  }
  // Apply saved size to current mode on startup
  if (win && !animating) {
    const target = isWidgetMode ? WIDGET_SIZE : FULL_SIZE;
    const bounds = win.getBounds();
    if (bounds.width !== target.width || bounds.height !== target.height) {
      win.setBounds({ x: bounds.x, y: bounds.y, width: target.width, height: target.height }, true);
    }
  }
});

let animating = false;
ipcMain.on('window-toggle-widget', () => {
  if (!win || animating) return;
  if (isMinimized) { isMinimized = false; collapsedLockHeight = null; win.setResizable(true); win.setMaximumSize(SIZE_UNLIMITED, SIZE_UNLIMITED); win.webContents.send('minimized-state', false); }

  isWidgetMode = !isWidgetMode;
  const size = isWidgetMode ? WIDGET_SIZE : FULL_SIZE;
  const from = win.getBounds();
  win.setMinimumSize(WIDGET_SIZE.width, WIDGET_SIZE.height);
  const display = screen.getDisplayNearestPoint({ x: from.x, y: from.y });
  const area = display.workArea;
  const to = { x: Math.round(area.x + (area.width - size.width) / 2), y: Math.round(area.y + (area.height - size.height) / 2), width: size.width, height: size.height };

  win.webContents.send('widget-transition-start');
  animating = true;
  const DURATION = 220, startTime = Date.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  // 16ms steps = one bounds change per 60Hz display frame. The old 1ms loop issued
  // 100+ setBounds in 220ms - each one a synchronous cross-process resize + relayout -
  // while the display could only ever show ~13 of them, so the extra work was pure
  // stutter. Pacing to the refresh rate is what actually reads as 60fps-smooth.
  const tick = () => {
    if (!win) { animating = false; return; }
    const p = Math.min(1, (Date.now() - startTime) / DURATION), t = ease(p);
    win.setBounds({ x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t), width: lerp(from.width, to.width, t), height: lerp(from.height, to.height, t) }, false);
    if (p >= 1) { animating = false; win.setBounds(to, false); win.webContents.send('widget-mode-changed', isWidgetMode); }
    else setTimeout(tick, 16);
  };
  tick();
});

// Cold-open: the renderer applies its chosen startup mode INSTANTLY (no animation) while the
// window is still hidden, so we can reveal it already at the final size.
ipcMain.on('apply-startup-mode', (_, mode) => {
  if (!win || animating) return;
  const display = screen.getPrimaryDisplay();
  const wa = display.workArea;
  win.setMinimumSize(WIDGET_SIZE.width, WIDGET_SIZE.height);
  if (mode === 'fullscreen') {
    isWidgetMode = false;
    win.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height }, false);
    win.webContents.send('fullscreen-changed', true);
  } else if (mode === 'widget') {
    isWidgetMode = true;
    win.setBounds({ x: Math.round(wa.x + (wa.width - WIDGET_SIZE.width) / 2), y: Math.round(wa.y + (wa.height - WIDGET_SIZE.height) / 2), width: WIDGET_SIZE.width, height: WIDGET_SIZE.height }, false);
    win.webContents.send('widget-mode-changed', true);
  } else { // window (baseline)
    isWidgetMode = false;
    win.setBounds({ x: Math.round(wa.x + (wa.width - FULL_SIZE.width) / 2), y: Math.round(wa.y + (wa.height - FULL_SIZE.height) / 2), width: FULL_SIZE.width, height: FULL_SIZE.height }, false);
    win.webContents.send('widget-mode-changed', false);
  }
});

// Sync Electron's native UI (the tray context menu, native dialogs) to the app's
// light/dark setting. Without this, the OS-native tray menu follows the system theme,
// which can clash with the user's chosen in-app theme.
ipcMain.on('set-native-theme', (_, theme) => {
  try { nativeTheme.themeSource = (theme === 'light' || theme === 'dark') ? theme : 'system'; } catch (_) {}
});

// Renderer has finished its first render in the correct mode - reveal the window.
ipcMain.on('renderer-ready', () => revealWindow());

// ─── Fullscreen toggle (works from both widget and full modes) ───
// "Fullscreen" here means filling the monitor's WORK AREA via bounds (excludes
// the OS taskbar so nothing is cut off), which is reliable for a
// frameless/transparent always-on-top overlay (native setFullScreen can drop
// transparency). Detects the current state by comparing bounds to the work
// area, so it stays correct even after a snap.
ipcMain.on('window-toggle-fullscreen', () => {
  if (!win || animating) return;
  if (isMinimized) { isMinimized = false; collapsedLockHeight = null; win.setResizable(true); win.setMaximumSize(SIZE_UNLIMITED, SIZE_UNLIMITED); win.webContents.send('minimized-state', false); }

  const cur = win.getBounds();
  const display = screen.getDisplayNearestPoint({ x: cur.x, y: cur.y });
  const wa = display.workArea;
  const isFs = cur.x === wa.x && cur.y === wa.y && cur.width === wa.width && cur.height === wa.height;

  if (!isFs) {
    preFullscreenBounds = cur;
    win.setMinimumSize(1, 1);
    win.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height }, false);
    win.webContents.send('fullscreen-changed', true);
  } else {
    win.setMinimumSize(WIDGET_SIZE.width, WIDGET_SIZE.height);
    const restore = preFullscreenBounds && preFullscreenBounds.width >= WIDGET_SIZE.width
      ? preFullscreenBounds
      : { x: wa.x + 100, y: wa.y + 80, width: FULL_SIZE.width, height: FULL_SIZE.height };
    win.setBounds(restore, false);
    win.webContents.send('fullscreen-changed', false);
  }
});

app.on('window-all-closed', () => {
  doQuit();
});

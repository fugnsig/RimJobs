const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),
  setOpacity: (val) => ipcRenderer.send('window-set-opacity', val),
  toggleAlwaysOnTop: () => ipcRenderer.send('window-toggle-top'),
  setAlwaysOnTop: (val) => ipcRenderer.send('window-set-always-on-top', val),
  toggleLockPosition: () => ipcRenderer.send('window-toggle-lock'),
  onPositionLocked: (callback) => ipcRenderer.on('position-locked', (_, locked) => callback(locked)),
  toggleWidgetMode: () => ipcRenderer.send('window-toggle-widget'),
  toggleFullscreen: () => ipcRenderer.send('window-toggle-fullscreen'),
  onFullscreenChanged: (callback) => ipcRenderer.on('fullscreen-changed', (_, isFs) => callback(isFs)),
  setWindowSizes: (widget, full) => ipcRenderer.send('window-set-sizes', widget, full),
  confirmQuit: () => ipcRenderer.send('window-confirm-quit'),
  requestFocus: () => ipcRenderer.send('window-request-focus'),
  releaseFocus: () => ipcRenderer.send('window-release-focus'),
  onWidgetModeChanged: (callback) => ipcRenderer.on('widget-mode-changed', (_, isWidget) => callback(isWidget)),
  onWidgetTransitionStart: (callback) => ipcRenderer.on('widget-transition-start', () => callback()),
  onMinimizedState: (callback) => ipcRenderer.on('minimized-state', (_, minimized) => callback(minimized)),
  onCloseRequested: (callback) => ipcRenderer.on('close-requested', () => callback()),
  minimizeToTaskbar: () => ipcRenderer.send('window-minimize-taskbar'),
  minimizeNormal: () => ipcRenderer.send('window-minimize-normal'),
  expandCollapsedForQuit: () => ipcRenderer.send('window-expand-for-quit'),
  collapseAfterQuitCancel: () => ipcRenderer.send('window-collapse-after-quit'),
  snapLeft: () => ipcRenderer.send('window-snap-left'),
  snapRight: () => ipcRenderer.send('window-snap-right'),
  onWindowSnapped: (callback) => ipcRenderer.on('window-snapped', (_, side) => callback(side)),
  dragStart: (x, y) => ipcRenderer.send('window-drag-start', x, y),
  dragMove: (x, y) => ipcRenderer.send('window-drag-move', x, y),
  dragEnd: () => ipcRenderer.send('window-drag-end'),
  collapsedResizeStart: (edge) => ipcRenderer.send('window-collapsed-resize-start', edge),
  collapsedResizeMove: (x) => ipcRenderer.send('window-collapsed-resize-move', x),
  collapsedResizeEnd: () => ipcRenderer.send('window-collapsed-resize-end'),
  onNativeKey: (callback) => ipcRenderer.on('native-key', (_, data) => callback(data)),
  onNativeHotkey: (callback) => ipcRenderer.on('native-hotkey', (_, data) => callback(data)),
  onNativeInputStop: (callback) => ipcRenderer.on('native-input-stop', () => callback()),
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  exportBlueprintXml: (name, xml) => ipcRenderer.invoke('export-blueprint-xml', name, xml),
  importBlueprintXml: () => ipcRenderer.invoke('import-blueprint-xml'),
  // `clipboard` from require('electron') is undefined in a sandboxed preload, so
  // route through the main process. Read stays synchronous (sendSync) to preserve the
  // existing call sites that use the return value directly.
  clipboardWrite: (text) => ipcRenderer.send('clipboard-write', text),
  clipboardRead: () => ipcRenderer.sendSync('clipboard-read-sync'),
  openSaveFile: () => ipcRenderer.invoke('open-save-file'),
  readSaveFile: (filePath) => ipcRenderer.invoke('read-save-file', filePath),
  exportEditedSave: (defaultName, text) => ipcRenderer.invoke('export-edited-save', defaultName, text),
  scanXenotypeDefs: (dirPath) => ipcRenderer.invoke('scan-xenotype-defs', dirPath),
  scanTraitGeneDefs: (dirPath) => ipcRenderer.invoke('scan-trait-gene-defs', dirPath),
  findRimworldPath: () => ipcRenderer.invoke('find-rimworld-path'),
  onTraitGeneScanProgress: (callback) => {
    ipcRenderer.removeAllListeners('trait-gene-scan-progress');
    ipcRenderer.on('trait-gene-scan-progress', (_, data) => callback(data));
  },
  scanDefLabels: (installPath) => ipcRenderer.invoke('scan-def-labels', installPath),
  onDefLabelProgress: (callback) => ipcRenderer.on('def-label-progress', (_, data) => callback(data)),
  pickDirectory: (defaultPath) => ipcRenderer.invoke('pick-directory', defaultPath),
  saveToFile: (filePath, json) => ipcRenderer.invoke('save-to-file', filePath, json),
  loadFromFile: (filePath) => ipcRenderer.invoke('load-from-file', filePath),
  pickSaveLocation: (defaultPath) => ipcRenderer.invoke('pick-save-location', defaultPath),
  scanModEquipment: (installPath) => ipcRenderer.invoke('scan-mod-equipment', installPath),
  onModScanProgress: (callback) => {
    ipcRenderer.removeAllListeners('mod-scan-progress');
    ipcRenderer.on('mod-scan-progress', (_, data) => callback(data));
  },
  // Cold-open: apply the startup mode instantly while hidden, then signal ready to reveal.
  applyStartupMode: (mode) => ipcRenderer.send('apply-startup-mode', mode),
  rendererReady: () => ipcRenderer.send('renderer-ready'),
  setNativeTheme: (theme) => ipcRenderer.send('set-native-theme', theme)
});

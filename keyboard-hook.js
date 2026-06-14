/**
 * NATIVE KEYBOARD INPUT, Windows low-level keyboard hook.
 *
 * Uses WH_KEYBOARD_LL to:
 * 1. DETECT keystrokes (replaces GetAsyncKeyState polling)
 * 2. BLOCK keystrokes from reaching the game during capture
 *
 * The hook fires for ALL keyboard input system-wide. When capture is active,
 * we read the vkCode from KBDLLHOOKSTRUCT, fire our callback, and return 1
 * to swallow the keystroke. When not capturing, we call CallNextHookEx to
 * let keys through normally.
 */

const koffi = require('koffi');

const user32 = koffi.load('user32.dll');

// ─── Structs ───
const KBDLLHOOKSTRUCT = koffi.struct('KBDLLHOOKSTRUCT', {
  vkCode: 'uint32',
  scanCode: 'uint32',
  flags: 'uint32',
  time: 'uint32',
  dwExtraInfo: 'uint64'
});

// ─── Function prototypes ───
const GetKeyState = user32.func('int16 __stdcall GetKeyState(int nVirtKey)');
const MapVirtualKeyW = user32.func('uint32 __stdcall MapVirtualKeyW(uint32 uCode, uint32 uMapType)');
const ToUnicode = user32.func('int __stdcall ToUnicode(uint32 wVirtKey, uint32 wScanCode, uint8 *lpKeyState, uint16 *pwszBuff, int cchBuff, uint32 wFlags)');

// ─── Low-level hook API ───
const HOOKPROC = koffi.proto('int64 __stdcall HookCallback(int nCode, uint64 wParam, void *lParam)');
const SetWindowsHookExW = user32.func('void* __stdcall SetWindowsHookExW(int idHook, HookCallback* lpfn, void* hMod, uint32 dwThreadId)');
const UnhookWindowsHookEx = user32.func('int __stdcall UnhookWindowsHookEx(void* hhk)');
const CallNextHookEx = user32.func('int64 __stdcall CallNextHookEx(void* hhk, int nCode, uint64 wParam, void *lParam)');

const WH_KEYBOARD_LL = 13;
const WM_KEYDOWN = 0x0100;
const WM_SYSKEYDOWN = 0x0104;
const WM_KEYUP = 0x0101;
const WM_SYSKEYUP = 0x0105;

// ─── Constants ───
const VK_SHIFT = 0x10;
const VK_CONTROL = 0x11;
const VK_MENU = 0x12;    // Alt
const VK_LSHIFT = 0xA0;
const VK_RSHIFT = 0xA1;
const VK_LCONTROL = 0xA2;
const VK_RCONTROL = 0xA3;
const VK_LMENU = 0xA4;
const VK_RMENU = 0xA5;
const VK_CAPITAL = 0x14;

// Keys we capture (and block from game) during input
const CAPTURE_VKS = new Set();
// A-Z
for (let i = 0x41; i <= 0x5A; i++) CAPTURE_VKS.add(i);
// 0-9
for (let i = 0x30; i <= 0x39; i++) CAPTURE_VKS.add(i);
// Numpad 0-9
for (let i = 0x60; i <= 0x69; i++) CAPTURE_VKS.add(i);
// Special + modifier keys
[
  0x08, // Backspace
  0x09, // Tab
  0x0D, // Enter
  0x1B, // Escape
  0x20, // Space
  0x25, 0x26, 0x27, 0x28, // Arrows
  0x2E, // Delete
  0x23, 0x24, // End, Home
  0xBA, 0xBB, 0xBC, 0xBD, 0xBE, 0xBF, 0xC0, // OEM ;=,-./`
  0xDB, 0xDC, 0xDD, 0xDE, // OEM [{]}'
  0x6A, 0x6B, 0x6D, 0x6E, 0x6F, // Numpad operators
  VK_SHIFT, VK_LSHIFT, VK_RSHIFT,
  VK_CONTROL, VK_LCONTROL, VK_RCONTROL,
  VK_MENU, VK_LMENU, VK_RMENU,
].forEach(vk => CAPTURE_VKS.add(vk));

// Modifier VKs for tracking
const MODIFIER_SHIFT = new Set([VK_SHIFT, VK_LSHIFT, VK_RSHIFT]);
const MODIFIER_CTRL = new Set([VK_CONTROL, VK_LCONTROL, VK_RCONTROL]);
const MODIFIER_ALT = new Set([VK_MENU, VK_LMENU, VK_RMENU]);

// VK to key name mapping for non-printable keys
const VK_MAP = {
  0x08: 'Backspace', 0x09: 'Tab', 0x0D: 'Enter', 0x1B: 'Escape',
  0x20: 'Space', 0x23: 'End', 0x24: 'Home',
  0x25: 'Left', 0x26: 'Up', 0x27: 'Right', 0x28: 'Down',
  0x2E: 'Delete'
};

// Passive hotkeys: forwarded to the renderer WITHOUT being swallowed (the game still
// receives them). Q/E rotate and F flips blueprints; Left/Right/Escape drive the Pawn
// Spotlight. The main process gates them by cursor-over-overlay, the renderer by
// feature state.
const PASSIVE_HOTKEYS = { 0x51: 'q', 0x45: 'e', 0x46: 'f', 0x25: 'left', 0x27: 'right', 0x1B: 'escape' };

// KBDLLHOOKSTRUCT.flags bit: event was synthesised via SendInput - this is how
// on-screen/virtual keyboards type, so it marks keys that did not come from
// physical hardware.
const LLKHF_INJECTED = 0x10;

let onKeyCallback = null;
let capturing = false;
// VKs currently held among the passive (non-capturing) hotkeys, to de-bounce the
// keyboard auto-repeat so each physical press fires our callback exactly once.
const passiveDown = new Set();

// ─── Hook + modifier state ───
let hookHandle = null;
let hookCallbackRef = null;

// Track modifier state ourselves since we swallow the messages
let modShift = false;
let modCtrl = false;
let modAlt = false;

function resolveChar(vk) {
  const capsLock = !!(GetKeyState(VK_CAPITAL) & 0x0001);
  const scanCode = MapVirtualKeyW(vk, 0);

  // Build keyboard state buffer using our tracked modifier state
  const keyState = Buffer.alloc(256);
  if (modShift) { keyState[VK_SHIFT] = 0x80; keyState[VK_LSHIFT] = 0x80; }
  if (modCtrl) keyState[VK_CONTROL] = 0x80;
  if (modAlt) keyState[VK_MENU] = 0x80;
  if (capsLock) keyState[VK_CAPITAL] = 0x01;

  const charBuf = Buffer.alloc(8);
  const result = ToUnicode(vk, scanCode, keyState, charBuf, 4, 0);
  let char = '';
  if (result > 0) {
    const raw = charBuf.toString('utf16le').slice(0, result);
    // Filter out control characters (< 0x20), these are Backspace, Tab, Enter, etc.
    // They get handled by key name (VK_MAP) instead of as printable chars.
    if (raw.charCodeAt(0) >= 0x20) char = raw;
  }
  // Dead key: flush state
  if (result < 0) {
    ToUnicode(vk, scanCode, keyState, charBuf, 4, 0);
  }

  return { char, shift: modShift, ctrl: modCtrl, alt: modAlt, capsLock, scanCode };
}

function fireEvent(vk, type, injected = false) {
  if (!onKeyCallback) return;
  const { char, shift, ctrl, alt, capsLock, scanCode } = resolveChar(vk);
  const key = VK_MAP[vk] || char || `VK_${vk.toString(16).toUpperCase()}`;

  try {
    onKeyCallback({
      type,
      vkCode: vk,
      scanCode,
      key,
      char: type === 'keydown' ? char : '',
      shift,
      ctrl,
      alt,
      capsLock,
      injected
    });
  } catch (e) {
    console.error('[keyboard-hook] Callback error:', e.message);
  }
}

// ─── Low-level keyboard hook callback ───
function hookProc(nCode, wParam, lParam) {
  if (nCode < 0) {
    return CallNextHookEx(null, nCode, wParam, lParam);
  }

  if (!capturing) {
    // Even when not capturing, detect Ctrl+C so the overlay can copy highlighted text.
    // Use GetKeyState directly - no modifier tracking needed, avoids sync issues.
    let vkPeek;
    try {
      const kb = koffi.decode(lParam, KBDLLHOOKSTRUCT);
      vkPeek = kb.vkCode;
    } catch (_) { vkPeek = null; }

    if (vkPeek === 0x43 && (wParam === WM_KEYDOWN || wParam === WM_SYSKEYDOWN)) {
      const ctrlHeld = !!(GetKeyState(VK_CONTROL) & 0x8000);
      const shiftHeld = !!(GetKeyState(VK_SHIFT) & 0x8000);
      const altHeld = !!(GetKeyState(VK_MENU) & 0x8000);
      if (ctrlHeld && !shiftHeld && !altHeld && onKeyCallback) {
        try {
          onKeyCallback({
            type: 'copy', vkCode: 0x43, scanCode: 0,
            key: 'c', char: '', shift: false, ctrl: true, alt: false, capsLock: false
          });
        } catch (_) {}
      }
    }

    // Passive hotkeys (see PASSIVE_HOTKEYS). The overlay is focusable:false so it
    // never receives real keydown events; forward these WITHOUT swallowing (the game
    // still gets them) and let the main process gate by cursor position + the renderer
    // by feature state. De-bounce the auto-repeat so one press = one event.
    const passiveName = PASSIVE_HOTKEYS[vkPeek];
    if (passiveName) {
      const down = (wParam === WM_KEYDOWN || wParam === WM_SYSKEYDOWN);
      const up = (wParam === WM_KEYUP || wParam === WM_SYSKEYUP);
      if (up) {
        passiveDown.delete(vkPeek);
      } else if (down && !passiveDown.has(vkPeek)) {
        const ctrlHeld = !!(GetKeyState(VK_CONTROL) & 0x8000);
        const altHeld = !!(GetKeyState(VK_MENU) & 0x8000);
        if (!ctrlHeld && !altHeld && onKeyCallback) {
          passiveDown.add(vkPeek);
          try {
            onKeyCallback({ type: 'hotkey', vkCode: vkPeek, key: passiveName, char: '', shift: false, ctrl: false, alt: false, capsLock: false });
          } catch (_) {}
        }
      }
    }
    return CallNextHookEx(null, nCode, wParam, lParam);
  }

  // Decode KBDLLHOOKSTRUCT from the raw pointer, vkCode is at offset 0
  let vk, injected = false;
  try {
    const kb = koffi.decode(lParam, KBDLLHOOKSTRUCT);
    vk = kb.vkCode;
    // Mark keys typed via SendInput (on-screen/virtual keyboards) so the main
    // process can let them through its cursor-position safety gate.
    injected = !!(kb.flags & LLKHF_INJECTED);
  } catch (_) {
    try { vk = koffi.decode(lParam, 'uint32'); } catch (_) {
      return CallNextHookEx(null, nCode, wParam, lParam);
    }
  }

  // Only block keys we care about
  if (!CAPTURE_VKS.has(vk)) {
    return CallNextHookEx(null, nCode, wParam, lParam);
  }

  const isDown = (wParam === WM_KEYDOWN || wParam === WM_SYSKEYDOWN);
  const isUp = (wParam === WM_KEYUP || wParam === WM_SYSKEYUP);

  // Update modifier tracking BEFORE resolving char
  if (isDown) {
    if (MODIFIER_SHIFT.has(vk)) modShift = true;
    if (MODIFIER_CTRL.has(vk)) modCtrl = true;
    if (MODIFIER_ALT.has(vk)) modAlt = true;
  } else if (isUp) {
    if (MODIFIER_SHIFT.has(vk)) modShift = false;
    if (MODIFIER_CTRL.has(vk)) modCtrl = false;
    if (MODIFIER_ALT.has(vk)) modAlt = false;
  }

  // Fire events for non-modifier keys
  if (isDown && !MODIFIER_SHIFT.has(vk) && !MODIFIER_CTRL.has(vk) && !MODIFIER_ALT.has(vk)) {
    fireEvent(vk, 'keydown', injected);
  } else if (isUp && !MODIFIER_SHIFT.has(vk) && !MODIFIER_CTRL.has(vk) && !MODIFIER_ALT.has(vk)) {
    fireEvent(vk, 'keyup', injected);
  }

  // Return 1 to swallow the keystroke, game never sees it
  return 1;
}

function installHook() {
  if (hookHandle) return;

  hookCallbackRef = koffi.register(hookProc, koffi.pointer(HOOKPROC));

  // Install global LL keyboard hook (hMod=null, dwThreadId=0 = all threads)
  hookHandle = SetWindowsHookExW(WH_KEYBOARD_LL, hookCallbackRef, null, 0);

  if (hookHandle) {
    console.log('[keyboard-hook] Low-level keyboard hook installed');
  } else {
    console.error('[keyboard-hook] FAILED to install low-level keyboard hook!');
  }
}

function uninstallHook() {
  if (hookHandle) {
    UnhookWindowsHookEx(hookHandle);
    hookHandle = null;
    console.log('[keyboard-hook] Low-level keyboard hook removed');
  }
  if (hookCallbackRef) {
    koffi.unregister(hookCallbackRef);
    hookCallbackRef = null;
  }
}

// ─── Public API ───

function install(callback) {
  onKeyCallback = callback;
  installHook();
  console.log('[keyboard-hook] Native input ready (LL hook active)');
  return true;
}

function startCapture() {
  capturing = true;

  modShift = false;
  modCtrl = false;
  modAlt = false;
  // A held passive hotkey (Q/E) won't get its keyup in the capturing branch, which
  // would leave it stuck "down" and block future rotation. Reset on every transition.
  passiveDown.clear();
  console.log('[keyboard-hook] Capture ON, keys blocked from game');
}

function stopCapture() {
  capturing = false;

  modShift = false;
  modCtrl = false;
  modAlt = false;
  passiveDown.clear(); // see startCapture: don't let a held hotkey get stuck "down"
  console.log('[keyboard-hook] Capture OFF, keys restored to game');
}

function uninstall() {
  stopCapture();
  uninstallHook();
  onKeyCallback = null;
}

module.exports = { install, uninstall, startCapture, stopCapture };

/**
 * BLUEPRINT TAB
 * Blueprint grid, canvas drawing, tiles, stamps, prefabs, room tags,
 * materials, biomes, buildings, bill of materials, undo/redo.
 * Auto-split from app.js - methods are assigned onto the App object.
 */
_assignModule(App, {


  // -- BLUEPRINT LIBRARY & PREFABS --
  get allBiomes() { 
    const presets = BIOMES.filter(b => !this.state.deletedPresetBiomes.includes(b.id));
    return [...presets, ...this.state.customBiomes]; 
  },

  saveCurrentAsPrefab() {
    if (!this._checkCap(this.state.prefabs, 'prefabs', 'blueprint prefabs')) return;
    this.showPrompt('Name this Blueprint', 'e.g. Starter Shack').then(name => {
      if (!name) return;
      const id = "pre_" + Math.random().toString(36).slice(2, 7);
      this.state.prefabs[id] = { id, name, data: JSON.parse(JSON.stringify(this.state.blueprints)) };
      this.renderBlueprint();
      this.toast(` Blueprint '${name}' Saved!`);
      this.triggerAutoSave();
    }).catch(() => {});
  },

  applyPrefab(id) {
    const p = this.state.prefabs[id];
    if (!p) return;
    this.showConfirm(`Load '${p.name}'?`, 'Load', 'This will replace your current layout.').then(() => {
      this.state.blueprints = JSON.parse(JSON.stringify(p.data));
      this._canvasFullDraw();
      this._updateBill();
    }).catch(() => {});
  },

  deletePrefab(id) {
    this.showConfirm('Delete this saved blueprint?', 'Delete').then(() => {
      delete this.state.prefabs[id];
      this.renderBlueprint();
      this.triggerAutoSave();
    }).catch(() => {});
  },

  // -- STAMPS: reusable sub-region templates --

  enterStampSelectMode() {
    this.state.drawMode = 'stamp_select';
    this.state.eraseMode = false; // picking a tool exits erase
    this._stampPlacing = null;
    this.renderBlueprintSidebar();
    this.toast('Drag a box over the area to stamp');
  },

  // Cut: drag a box, lift those tiles into a clipboard, then place them elsewhere
  // (Q/E rotate). Reuses the stamp-place flow.
  cutSelection() {
    this.state.drawMode = 'cut_select';
    this.state.eraseMode = false; // picking a tool exits erase
    this._stampPlacing = null;
    this.renderBlueprintSidebar();
    this.toast('Drag a box to cut, then click to place it (Q/E rotate, F flip)');
  },
  _doCut(x1, y1, x2, y2) {
    const ox = Math.min(x1, x2), oy = Math.min(y1, y2);
    const w = Math.abs(x2 - x1) + 1, h = Math.abs(y2 - y1) + 1;
    const cells = {};
    this.recordBlueprintHistory();
    for (let ix = ox; ix < ox + w; ix++) for (let iy = oy; iy < oy + h; iy++) {
      const cell = this.state.blueprints[ix + ',' + iy];
      if (cell && (cell.floor || cell.struct || (Array.isArray(cell.wires) && cell.wires.length))) {
        cells[(ix - ox) + ',' + (iy - oy)] = {
          floor: cell.floor || null, struct: cell.struct || null,
          rot: cell.rot, wires: Array.isArray(cell.wires) ? [...cell.wires] : undefined,
        };
        delete this.state.blueprints[ix + ',' + iy]; // lift it off the grid
      }
    }
    if (!Object.keys(cells).length) {
      this.toast('Selection is empty');
      this.state.drawMode = 'box';
      this.renderBlueprintSidebar();
      this._canvasFullDraw();
      return;
    }
    this._stampPlacing = { name: 'Cut selection', w, h, cells, tags: {}, _clipboard: true };
    this.state.drawMode = 'stamp_place';
    this._stampPreview = null;
    this._canvasFullDraw();
    this.renderBlueprintSidebar();
    this.toast(`Cut ${Object.keys(cells).length} tiles - click to place, Q/E rotate, F flip, right-click to cancel`);
  },

  // Grab & move a single object: click an object to lift it into the clipboard, then
  // click to drop it elsewhere (Q/E rotate). Reuses the stamp-place flow.
  enterGrabMode() {
    this.state.drawMode = 'grab';
    this.state.eraseMode = false; // picking a tool exits erase
    this._stampPlacing = null;
    this.renderBlueprintSidebar();
    this._canvasFullDraw();
    this.toast('Click an object to pick it up, then click to drop it');
  },
  grabObjectAt(x, y) {
    const cell = (this.state.blueprints || {})[x + ',' + y];
    if (!cell || !cell.struct) { this.toast('Click an object to grab it'); return; }
    const grp = this._objectCellsAt(x, y);
    const cells = (grp && grp.length) ? grp : [[x, y]];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    cells.forEach(([gx, gy]) => { if (gx < minX) minX = gx; if (gx > maxX) maxX = gx; if (gy < minY) minY = gy; if (gy > maxY) maxY = gy; });
    this.recordBlueprintHistory();
    const clip = {};
    cells.forEach(([gx, gy]) => {
      const c = this.state.blueprints[gx + ',' + gy];
      if (!c || !c.struct) return;
      clip[(gx - minX) + ',' + (gy - minY)] = { floor: null, struct: c.struct, rot: c.rot };
      c.struct = null; delete c.rot; delete c.inst; // lift the object layer; floors/wires stay
    });
    this._stampPlacing = { name: 'Grabbed object', w: maxX - minX + 1, h: maxY - minY + 1, cells: clip, tags: {}, _clipboard: true, _grab: true };
    this.state.drawMode = 'stamp_place';
    this._stampPreview = null;
    this._canvasFullDraw();
    this.renderBlueprintSidebar();
    this.toast('Moving object - click to drop, Q/E rotate, F flip, right-click to cancel');
  },

  // Rotate the active stamp/clipboard 90deg (dir>0 clockwise, <0 anticlockwise).
  rotateStamp(dir) {
    const st = this._stampPlacing;
    if (!st || !st.cells || this.state.drawMode !== 'stamp_place') return;
    const w = st.w, h = st.h;
    const nc = {};
    Object.keys(st.cells).forEach(k => {
      const [dx, dy] = k.split(',').map(Number);
      const nx = dir > 0 ? (h - 1 - dy) : dy;
      const ny = dir > 0 ? dx : (w - 1 - dx);
      const cell = Object.assign({}, st.cells[k]);
      if (cell.struct && cell.rot != null) cell.rot = ((cell.rot + (dir > 0 ? 1 : -1)) % 4 + 4) % 4;
      nc[nx + ',' + ny] = cell;
    });
    st.cells = nc; st.w = h; st.h = w;
    // Room tags ride along with the same coordinate transform, otherwise a saved
    // stamp's labels land on the wrong tiles after a rotation.
    if (st.tags) {
      Object.values(st.tags).forEach(t => {
        const tx = t.x, ty = t.y;
        t.x = dir > 0 ? (h - 1 - ty) : ty;
        t.y = dir > 0 ? tx : (w - 1 - tx);
      });
    }
    // Show the rotated ghost right away even if the cursor has not moved since the
    // cut/grab. The placement preview is null until the first mouse-move, which made
    // pressing Q/E look like it did nothing; seed it from the last hovered tile.
    if (!this._stampPreview && this._hoverTile) {
      const hx = this._hoverTile.hx, hy = this._hoverTile.hy;
      this._stampPreview = st._grab ? { x: hx, y: hy } : { x: this._snapToGrid(hx, 2), y: this._snapToGrid(hy, 2) };
    }
    this._canvasFullDraw();
  },

  // Mirror the active stamp/clipboard horizontally (F). Cell positions reflect across
  // the stamp's vertical midline and east/west facings swap (north/south already face
  // their mirror), so multi-cell furniture lands on its true mirrored tiles. Same flow
  // as rotateStamp, including tags riding along and the instant ghost refresh.
  flipStamp() {
    const st = this._stampPlacing;
    if (!st || !st.cells || this.state.drawMode !== 'stamp_place') return;
    const w = st.w;
    const nc = {};
    Object.keys(st.cells).forEach(k => {
      const [dx, dy] = k.split(',').map(Number);
      const cell = Object.assign({}, st.cells[k]);
      if (cell.struct && cell.rot != null) cell.rot = cell.rot === 1 ? 3 : (cell.rot === 3 ? 1 : cell.rot);
      nc[(w - 1 - dx) + ',' + dy] = cell;
    });
    st.cells = nc; // width and height are unchanged by a mirror
    if (st.tags) {
      Object.values(st.tags).forEach(t => { t.x = w - 1 - t.x; });
    }
    if (!this._stampPreview && this._hoverTile) {
      const hx = this._hoverTile.hx, hy = this._hoverTile.hy;
      this._stampPreview = st._grab ? { x: hx, y: hy } : { x: this._snapToGrid(hx, 2), y: this._snapToGrid(hy, 2) };
    }
    this._canvasFullDraw();
  },

  openStampModal(x1, y1, x2, y2) {
    // Extract cell data from the selected region (relative to top-left corner)
    const cells = {};
    const ox = Math.min(x1, x2), oy = Math.min(y1, y2);
    const w = Math.abs(x2 - x1) + 1, h = Math.abs(y2 - y1) + 1;
    for (let ix = ox; ix < ox + w; ix++) {
      for (let iy = oy; iy < oy + h; iy++) {
        const cell = this.state.blueprints[ix + ',' + iy];
        if (cell && (cell.floor || cell.struct)) {
          cells[(ix - ox) + ',' + (iy - oy)] = { floor: cell.floor || null, struct: cell.struct || null };
        }
      }
    }
    // Also grab tags within the region (relative positions)
    const tags = {};
    Object.keys(this.state.roomLabels).forEach(rid => {
      const label = this.state.roomLabels[rid];
      if (label && label.x >= ox && label.x < ox + w && label.y >= oy && label.y < oy + h) {
        tags[rid] = { ...label, x: label.x - ox, y: label.y - oy };
      }
    });

    if (Object.keys(cells).length === 0 && Object.keys(tags).length === 0) {
      this.toast('Selection is empty');
      this.state.drawMode = 'box';
      this.renderBlueprintSidebar();
      return;
    }

    this._pendingStamp = { cells, tags, w, h };

    const modal = document.getElementById('stampModal');
    const body = document.getElementById('stampModalBody');
    if (!modal || !body) return;
    body.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:14px">
        <div>
          <label style="font-size:var(--f-xs);color:var(--text3);font-weight:700;text-transform:uppercase;display:block;margin-bottom:6px">Stamp Name</label>
          <input type="text" id="stampName" placeholder="e.g. 5x5 Bedroom, Kill Box Corner" class="skill-input" style="width:100%; text-align:left; padding:8px 12px">
        </div>
        <div style="display:flex; gap:12px; align-items:center">
          <div style="padding:8px 14px; background:var(--surface3); border-radius:var(--radius-sm); border:1px solid var(--border)">
            <span style="font-size:var(--f-xs); color:var(--text3)">Size:</span>
            <span style="font-size:var(--f-sm); font-weight:700; color:var(--accent); margin-left:4px">${w} × ${h}</span>
          </div>
          <div style="padding:8px 14px; background:var(--surface3); border-radius:var(--radius-sm); border:1px solid var(--border)">
            <span style="font-size:var(--f-xs); color:var(--text3)">Tiles:</span>
            <span style="font-size:var(--f-sm); font-weight:700; color:var(--text); margin-left:4px">${Object.keys(cells).length}</span>
          </div>
          ${Object.keys(tags).length > 0 ? `<div style="padding:8px 14px; background:var(--surface3); border-radius:var(--radius-sm); border:1px solid var(--border)">
            <span style="font-size:var(--f-xs); color:var(--text3)">Tags:</span>
            <span style="font-size:var(--f-sm); font-weight:700; color:var(--text); margin-left:4px">${Object.keys(tags).length}</span>
          </div>` : ''}
        </div>
        <p style="font-size:var(--f-xs); color:var(--text3); margin:0">Saves the selected region as a reusable stamp you can place anywhere on the grid.</p>
      </div>
    `;
    modal.classList.add('show');
    setTimeout(() => document.getElementById('stampName')?.focus(), 100);
  },

  closeStampModal() {
    document.getElementById('stampModal')?.classList.remove('show');
    this._pendingStamp = null;
    this.state.drawMode = 'box';
    this.renderBlueprintSidebar();
  },

  submitStamp() {
    const name = document.getElementById('stampName')?.value.trim();
    if (!name) { this.toast('Enter a name'); return; }
    const stamp = this._pendingStamp;
    if (!stamp) return;

    const id = 'stmp_' + Math.random().toString(36).slice(2, 7);
    this.state.stamps[id] = { id, name, w: stamp.w, h: stamp.h, cells: stamp.cells, tags: stamp.tags };
    this.closeStampModal();
    this.renderBlueprint();
    this.triggerAutoSave();
    this.toast(`Stamp '${name}' saved (${stamp.w}×${stamp.h})`);
  },

  enterStampPlaceMode(id) {
    const stamp = this.state.stamps[id];
    if (!stamp) return;
    this.state.drawMode = 'stamp_place';
    this._stampPlacing = stamp;
    this._stampPreview = null;
    this.renderBlueprintSidebar();
    this._canvasFullDraw();
    this.toast(`Placing '${stamp.name}', click to stamp, right-click to cancel`);
  },

  placeStamp(x, y) {
    const stamp = this._stampPlacing;
    if (!stamp) return;

    // Snap to nearest 11-tile grid line if within 2 tiles - but a grabbed object drops
    // exactly where the cursor is (free placement, no snapping).
    const snapThreshold = 2;
    const snapX = stamp._grab ? x : this._snapToGrid(x, snapThreshold);
    const snapY = stamp._grab ? y : this._snapToGrid(y, snapThreshold);

    this.recordBlueprintHistory();

    // A cut or grabbed clipboard lays down only its actual content, transparently: the
    // blank cells inside its bounding box must NOT erase what is already at the
    // destination (that was the "empty tiles override" bug). Saved prefab stamps keep
    // the clean clear-then-place so a stamp drops as a clean block.
    const transparent = !!stamp._clipboard;

    if (!transparent) {
      // Clear the entire stamp footprint first
      for (let cx = 0; cx < stamp.w; cx++) {
        for (let cy = 0; cy < stamp.h; cy++) {
          const tx = snapX + cx, ty = snapY + cy;
          if (tx >= 0 && tx < this.GRID_W && ty >= 0 && ty < this.GRID_H) {
            const tKey = tx + ',' + ty;
            if (this.state.blueprints[tKey]) {
              this.state.blueprints[tKey].floor = null;
              this.state.blueprints[tKey].struct = null;
              delete this.state.blueprints[tKey].rot;
              delete this.state.blueprints[tKey].wires;
            }
          }
        }
      }

      // Remove any existing tags within the footprint
      Object.keys(this.state.roomLabels).forEach(rid => {
        const label = this.state.roomLabels[rid];
        if (label && label.x >= snapX && label.x < snapX + stamp.w && label.y >= snapY && label.y < snapY + stamp.h) {
          delete this.state.roomLabels[rid];
        }
      });
    }

    // Place stamp cells
    Object.keys(stamp.cells).forEach(key => {
      const [cx, cy] = key.split(',').map(Number);
      const tx = snapX + cx, ty = snapY + cy;
      if (tx >= 0 && tx < this.GRID_W && ty >= 0 && ty < this.GRID_H) {
        const tKey = tx + ',' + ty;
        if (!this.state.blueprints[tKey]) this.state.blueprints[tKey] = { floor: null, struct: null };
        const src = stamp.cells[key];
        if (src.floor) this.state.blueprints[tKey].floor = src.floor;
        if (src.struct) {
          this.state.blueprints[tKey].struct = src.struct;
          if (src.rot != null) this.state.blueprints[tKey].rot = src.rot;
        }
        if (Array.isArray(src.wires) && src.wires.length) this.state.blueprints[tKey].wires = [...src.wires];
      }
    });

    // Place tags
    if (stamp.tags) {
      Object.keys(stamp.tags).forEach(rid => {
        const src = stamp.tags[rid];
        const newId = 'tag_' + Math.random().toString(36).slice(2, 7);
        this.state.roomLabels[newId] = { name: src.name, type: src.type, x: snapX + src.x, y: snapY + src.y };
      });
    }

    // A grabbed single object keeps its identity: stamp one instance id across its
    // dropped tiles so it stays a grouped object (outline, facing arrow, future grabs),
    // then return to grab mode so you can move the next object.
    if (stamp._grab) {
      const structKeys = Object.keys(stamp.cells).filter(k => stamp.cells[k].struct);
      const inst = structKeys.length > 1 ? this._newInstanceId() : null;
      structKeys.forEach(key => {
        const [cx, cy] = key.split(',').map(Number);
        const c = this.state.blueprints[(snapX + cx) + ',' + (snapY + cy)];
        if (c && c.struct) { if (inst) c.inst = inst; else delete c.inst; }
      });
      this._stampPlacing = null;
      this._stampPreview = null;
      this.state.drawMode = 'grab';
      this.renderBlueprintSidebar();
    }

    this._canvasFullDraw();
    this._updateBill();
    this.triggerAutoSave();
  },

  cancelStampPlace() {
    this._stampPlacing = null;
    this._stampPreview = null;
    this.state.drawMode = 'box';
    this.renderBlueprintSidebar();
    this._canvasFullDraw();
  },

  deleteStamp(id) {
    this.showConfirm('Delete this stamp?', 'Delete').then(() => {
      delete this.state.stamps[id];
      this.renderBlueprint();
      this.triggerAutoSave();
    }).catch(() => {});
  },

  _snapToGrid(val, threshold) {
    // Snap to nearest 11-tile boundary (the thicker gridlines) if within threshold.
    // The toggle (default on) lets the user place stamps/cuts freely, tile by tile.
    if (this.state.bpSnapGrid === false) return val;
    const mod = val % 11;
    if (mod <= threshold) return val - mod;
    if (11 - mod <= threshold) return val + (11 - mod);
    return val;
  },

  toggleBpSnapGrid() {
    this.state.bpSnapGrid = this.state.bpSnapGrid === false ? true : false;
    this.renderBlueprintSidebar();
    this.toast(this.state.bpSnapGrid === false ? 'Grid snapping off, place freely' : 'Grid snapping on');
    this.triggerAutoSave();
  },

  // -- RAID ESTIMATION --

  // RimWorld calendar: 4 quadrums, 15 days each = 60 days/year
  _QUADRUMS: ['Aprimay', 'Jugust', 'Septober', 'Decembary'],


  exportBlueprintImage(format = 'png') {
    const canvas = document.getElementById('blueprintCanvas');
    if (!canvas) { this.toast('No blueprint to export.'); return; }

    // Draw a clean copy without hover highlights or selection overlays
    const saved = { hover: this._hoverTile, boxS: this._boxStart, boxE: this._boxEnd, stampPv: this._stampPreview };
    this._hoverTile = null;
    this._boxStart = null;
    this._boxEnd = null;
    this._stampPreview = null;
    this._canvasFullDraw();

    const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const ext  = format === 'jpg' ? '.jpg' : '.png';
    const quality = format === 'jpg' ? 0.92 : undefined;
    const colonyName = (this.state.colonyName || 'blueprint').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = colonyName + '-blueprint' + ext;

    canvas.toBlob((blob) => {
      // Restore canvas state
      this._hoverTile = saved.hover;
      this._boxStart = saved.boxS;
      this._boxEnd = saved.boxE;
      this._stampPreview = saved.stampPv;
      this._canvasFullDraw();

      if (!blob) { this.toast('Export failed.'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      this.toast(`Exported ${ext.toUpperCase().slice(1)} - ${filename}`);
    }, mime, quality);
  },

  copyLayoutToClipboard() {
    const data = JSON.stringify(this.state.blueprints);
    // Use the Electron clipboard bridge: the overlay window is focusable:false, so
    // navigator.clipboard.writeText throws "Document is not focused". Fall back to
    // the web API only when running outside the desktop app.
    if (window.overlay && window.overlay.clipboardWrite) {
      window.overlay.clipboardWrite(data);
    } else {
      try { navigator.clipboard.writeText(data); } catch (_) {}
    }
    this.toast('Copied.');
  },

  // Coerce arbitrary parsed JSON into a safe blueprint map: an object keyed by
  // "x,y" whose values are cell objects. Drops anything that does not fit so a
  // pasted/corrupt layout can never replace state.blueprints with a non-map.
  _sanitizeBlueprintMap(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const clean = {};
    Object.keys(parsed).forEach(key => {
      if (!/^-?\d+,-?\d+$/.test(key)) return;
      const cell = parsed[key];
      if (!cell || typeof cell !== 'object' || Array.isArray(cell)) return;
      clean[key] = cell;
    });
    return clean;
  },

  // Unique id for one furniture object: every cell of a single placed item shares
  // it, so a multi-cell piece can be drawn and hovered as ONE unit and two identical
  // abutting items stay distinguishable. Only stamped onto multi-cell footprints.
  _newInstanceId() { this._instSeq = (this._instSeq || 0) + 1; return 'o' + this._instSeq.toString(36); },

  // Do two cells belong to the SAME furniture object? Only multi-cell objects carry
  // an instance id (assigned at import/stamp), so grouping requires a matching id.
  // That means lone 1x1 items - and two identical 1x1 pieces sitting side by side -
  // are NEVER linked; only a genuine multi-tile footprint reads as one unit.
  _sameObject(a, b) {
    if (!a || !b || !a.struct || !b.struct || a.struct !== b.struct) return false;
    return a.inst != null && a.inst === b.inst;
  },

  // All grid cells making up the furniture object at (x,y), via flood fill over
  // _sameObject. Returns [[x,y],...] (incl. the start) or null if no struct there.
  _objectCellsAt(x, y) {
    const bp = this.state.blueprints || {};
    const start = bp[x + ',' + y];
    if (!start || !start.struct) return null;
    const out = [], seen = {}, stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      const k = cx + ',' + cy;
      if (seen[k]) continue;
      seen[k] = true;
      if (!this._sameObject(start, bp[k])) continue;
      out.push([cx, cy]);
      stack.push([cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]);
    }
    return out;
  },

  // A building's unrotated footprint [w,h]. Prefer an explicit size stored on the
  // object (custom objects set their own W x H); else the game def-size table; else
  // 1x1. This keeps placement/preview correct even when the modded size table isn't
  // loaded, and lets hand-made custom objects be multi-cell.
  _buildingSize(b) {
    if (b && Number.isFinite(b.w) && Number.isFinite(b.h) && b.w >= 1 && b.h >= 1) return [b.w | 0, b.h | 0];
    if (b && b.def && typeof vanillaDefSize === 'function') return vanillaDefSize(b.def);
    return [1, 1];
  },

  // Would an object of footprint ew x eh placed at (x,y) overlap an existing object?
  // Only the object layer collides - floors and wires can sit underneath.
  _footprintCollides(x, y, ew, eh) {
    const bp = this.state.blueprints || {};
    for (let dx = 0; dx < ew; dx++) for (let dy = 0; dy < eh; dy++) {
      const kx = x + dx, ky = y + dy;
      if (kx >= this.GRID_W || ky >= this.GRID_H) continue;
      const c = bp[kx + ',' + ky];
      if (c && c.struct) return true;
    }
    return false;
  },

  // Clear the ENTIRE object occupying (x,y) - every tile of its instance - so a
  // multi-cell piece is removed/replaced wholesale and never leaves a 1x1 fragment.
  // Only touches the object layer; floors and wires on those cells are left alone.
  _clearObjectAt(x, y) {
    const grp = this._objectCellsAt(x, y);
    const cells = (grp && grp.length) ? grp : [[x, y]];
    cells.forEach(([gx, gy]) => {
      const c = this.state.blueprints[gx + ',' + gy];
      if (c) { c.struct = null; delete c.rot; delete c.inst; if (c.structDef) { delete c.structDef; delete c.structStuff; } }
    });
  },

  // RimWorld GenAdj.OccupiedRect, exactly: given a building's stored Position, its
  // Rot4 facing (0=N,1=E,2=S,3=W) and unrotated def size, return the world cells it
  // occupies. Even-sized footprints shift per rotation (a 2x2 extends NE/SE/SW/NW for
  // N/E/S/W), so an imported rotated bed lands on its true cells - never on the wall
  // it backs against. Mirrors Verse/GenAdj.AdjustForRotation + OccupiedRect.
  _occupiedRectLocal(px, pz, rot, baseW, baseH) {
    rot = (((rot | 0) % 4) + 4) % 4;
    let cx = px, cz = pz, ax = baseW, az = baseH;
    if (!(ax === 1 && az === 1)) {
      if (rot === 1 || rot === 3) { const t = ax; ax = az; az = t; } // E/W swap w<->h
      if (rot === 1) { if (az % 2 === 0) cz -= 1; }
      else if (rot === 2) { if (ax % 2 === 0) cx -= 1; if (az % 2 === 0) cz -= 1; }
      else if (rot === 3) { if (ax % 2 === 0) cx -= 1; }
    }
    const x0 = cx - Math.floor((ax - 1) / 2);
    const z0 = cz - Math.floor((az - 1) / 2);
    return { x0, x1: x0 + ax - 1, z0, z1: z0 + az - 1 };
  },

  // Inverse of _occupiedRectLocal: given the SW (min x, min z) world corner of a
  // footprint, its facing and unrotated size, return the Position RimWorld would
  // store. Used on export so blueprints round-trip and load correctly in-game.
  _positionFromRect(minXw, minZw, rot, baseW, baseH) {
    rot = (((rot | 0) % 4) + 4) % 4;
    let ax = baseW, az = baseH;
    const isUnit = (baseW === 1 && baseH === 1);
    if (!isUnit && (rot === 1 || rot === 3)) { const t = ax; ax = az; az = t; }
    const cx = minXw + Math.floor((ax - 1) / 2);
    const cz = minZw + Math.floor((az - 1) / 2);
    let px = cx, pz = cz;
    if (!isUnit) {
      if (rot === 1) { if (az % 2 === 0) pz = cz + 1; }
      else if (rot === 2) { if (ax % 2 === 0) px = cx + 1; if (az % 2 === 0) pz = cz + 1; }
      else if (rot === 3) { if (ax % 2 === 0) px = cx + 1; }
    }
    return { x: px, z: pz };
  },

  importLayoutFromJSON() {
    this.showPrompt('Paste Layout JSON here').then(str => {
      if (!str) return;
      try {
        const parsed = JSON.parse(str);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Not a layout object');
        // Validate/sanitise BEFORE assigning, so an invalid paste cannot corrupt
        // state (the old code assigned first, then drew - garbage persisted even
        // when the draw threw).
        this.state.blueprints = this._sanitizeBlueprintMap(parsed);
        this._canvasFullDraw();
        this._updateBill();
        this.toast(" Layout Imported!");
      } catch(e) { this.showAlert('Invalid JSON!'); }
    }).catch(() => {});
  },

  // ─── BLUEPRINTS MOD (.xml) INTEROP ──────────────────────────────────────────
  // Translates RimJobs' abstract grid to/from the "Blueprints" mod's export
  // format (Steam 708455313). Only vanilla defNames round-trip cleanly into the
  // game; an imported modded/unknown def is kept on the cell so the footprint
  // survives and re-exports unchanged, but it will be dropped by the game if the
  // source mod is absent (as the mod itself warns).

  // Grid -> Blueprints-mod XML string. Pure; defaults to state.blueprints.
  buildBlueprintXML(bp, opts) {
    bp = bp || this.state.blueprints || {};
    opts = opts || {};
    const byId = {};
    (this.allBuildings || []).forEach(b => { byId[b.id] = b; });
    const cells = [];
    let maxY = 0, any = false;
    let minX = Infinity, maxX = -Infinity, minY = Infinity;
    Object.keys(bp).forEach(key => {
      const m = /^(-?\d+),(-?\d+)$/.exec(key);
      if (!m) return;
      const c = bp[key];
      if (!c || typeof c !== 'object') return;
      const x = parseInt(m[1]), y = parseInt(m[2]);
      if (y > maxY) maxY = y;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y;
      cells.push({ x, y, c });
      any = true;
    });
    if (!any) return '';
    const bpW = (maxX - minX + 1), bpH = (maxY - minY + 1);

    const terrain = [];
    const wireThings = []; // conduits/pipes: 1x1, emitted as-is (one li each)
    const structMap = {}; // 'gx,gy' -> { def, stuff }
    cells.forEach(({ x, y, c }) => {
      const z = maxY - y; // flip vertical: editor y is top-down, map z is north-up
      // Floor (TerrainDef): prefer a preserved raw def, else the palette mapping.
      let fDef = c.floorDef || (c.floor && byId[c.floor] && byId[c.floor].layer === 'floor' ? byId[c.floor].def : null);
      if (fDef) terrain.push({ def: fDef, x, z });
      // Wires (conduits/pipes): entry is a palette id or a raw defName.
      if (Array.isArray(c.wires)) {
        c.wires.forEach(w => {
          const b = byId[w];
          // Palette/custom wire with no real def = planning-only, don't export an
          // invalid def. A raw defName (parse output) exports as itself.
          const wDef = (b && b.def) ? b.def : (b ? null : w);
          if (wDef) wireThings.push({ def: wDef, stuff: b && b.stuff, x, z, rot: 0 });
        });
      }
      // Struct (ThingDef).
      let sDef = c.structDef, sStuff = c.structStuff;
      if (!sDef && c.struct && byId[c.struct] && byId[c.struct].layer !== 'floor') {
        sDef = byId[c.struct].def;
        sStuff = byId[c.struct].stuff;
      }
      if (sDef) structMap[x + ',' + y] = { def: sDef, stuff: sStuff, rot: (c.rot | 0) || 0 };
    });

    // Merge contiguous same-def cells into one object per footprint, so a 2x2
    // table painted across 4 cells exports as ONE Table2x2c, not four. Rotation
    // is inferred from the block's shape vs the def's base size.
    const things = [];
    const consumed = {};
    const sizeOf = (def) => (typeof vanillaDefSize === 'function') ? vanillaDefSize(def) : [1, 1];
    const keys = Object.keys(structMap).sort((a, b) => {
      const [ax, ay] = a.split(',').map(Number), [bx, by] = b.split(',').map(Number);
      return ay - by || ax - bx;
    });
    for (const key of keys) {
      if (consumed[key]) continue;
      const [gx, gy] = key.split(',').map(Number);
      const s = structMap[key];
      const [w, h] = sizeOf(s.def);
      let placedBlock = false;
      if (w > 1 || h > 1) {
        for (const [bw, bh, rot] of [[w, h, 0], [h, w, 1]]) {
          let full = true;
          for (let dx = 0; dx < bw && full; dx++) for (let dy = 0; dy < bh && full; dy++) {
            const k = (gx + dx) + ',' + (gy + dy);
            if (consumed[k] || !structMap[k] || structMap[k].def !== s.def) full = false;
          }
          if (full) {
            for (let dx = 0; dx < bw; dx++) for (let dy = 0; dy < bh; dy++) consumed[(gx + dx) + ',' + (gy + dy)] = true;
            // Convert the footprint's SW world corner back to RimWorld's Position
            // (rotation-aware inverse of OccupiedRect) so it loads correctly in-game.
            const minXw = gx, minZw = (maxY - gy) - (bh - 1);
            const pos = this._positionFromRect(minXw, minZw, rot, w, h);
            things.push({ def: s.def, stuff: s.stuff, x: pos.x, z: pos.z, rot });
            placedBlock = true;
            break;
          }
        }
      }
      if (!placedBlock) {
        // Lone cell of a (possibly multi-cell) def: treat this cell as the footprint's
        // SW corner and convert to RimWorld's Position so a re-import reconstructs a
        // consistent footprint.
        consumed[key] = true;
        const rot = (((s.rot | 0) % 4) + 4) % 4;
        const [bw, bh] = (rot % 2 === 1) ? [h, w] : [w, h];
        const minXw = gx, minZw = (maxY - gy) - (bh - 1);
        const pos = this._positionFromRect(minXw, minZw, rot, w, h);
        things.push({ def: s.def, stuff: s.stuff, x: pos.x, z: pos.z, rot });
      }
    }
    for (const w of wireThings) things.push(w);
    if (!things.length && !terrain.length) return '';

    const esc = (s) => String(s).replace(/[<>&]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch]));
    const ver = esc(opts.gameVersion || (this.state.importMeta && this.state.importMeta.gameVersion) || '1.6.4633 rev1261');
    const thingLis = things.map(t => {
      let s = `\t\t\t<li>\n\t\t\t\t<ThingDef>${esc(t.def)}</ThingDef>\n`;
      if (t.stuff) s += `\t\t\t\t<Stuff>${esc(t.stuff)}</Stuff>\n`;
      s += `\t\t\t\t<Position>(${t.x}, 0, ${t.z})</Position>\n`;
      if (t.rot) s += `\t\t\t\t<Rotation>${t.rot | 0}</Rotation>\n`;
      s += `\t\t\t</li>`;
      return s;
    }).join('\n');
    const terrLis = terrain.map(t =>
      `\t\t\t<li>\n\t\t\t\t<TerrainDef>${esc(t.def)}</TerrainDef>\n\t\t\t\t<Position>(${t.x}, 0, ${t.z})</Position>\n\t\t\t</li>`
    ).join('\n');

    // The mod keeps things AND terrain in one <BuildableThings> list, each <li>
    // carrying either a <ThingDef> or a <TerrainDef>. The inner <Blueprint> also
    // needs a <Name> (shown in-game) and a <Size> bounding box.
    const allLis = [thingLis, terrLis].filter(Boolean).join('\n');
    const name = esc((opts.name && String(opts.name).trim()) || 'RimJobs Blueprint');
    return `<?xml version="1.0" encoding="utf-8"?>
<Blueprint>
\t<meta>
\t\t<gameVersion>${ver}</gameVersion>
\t\t<modIds>
\t\t\t<li>ludeon.rimworld</li>
\t\t</modIds>
\t\t<modSteamIds>
\t\t\t<li>0</li>
\t\t</modSteamIds>
\t</meta>
\t<Blueprint>
\t\t<BuildableThings>
${allLis}
\t\t</BuildableThings>
\t\t<Name>${name}</Name>
\t\t<Size>(${bpW}, ${bpH})</Size>
\t</Blueprint>
</Blueprint>
`;
  },

  // Blueprints-mod XML string -> { blueprints, stats, name }. Pure; never throws.
  parseBlueprintXML(xmlString) {
    if (typeof xmlString !== 'string' || !xmlString) return { blueprints: {}, stats: { placed: 0, terrain: 0, unknown: 0 }, name: '' };
    const bpName = ((xmlString.match(/<Name>([\s\S]*?)<\/Name>/) || [])[1] || '').trim();
    // The mod stores both things and terrain in one <BuildableThings> list, each
    // <li> carrying a <ThingDef> OR a <TerrainDef>. Also tolerate a separate
    // <Terrain> block in case other versions emit one.
    const buildBlock = (xmlString.match(/<BuildableThings>([\s\S]*?)<\/BuildableThings>/) || [])[1] || '';
    const terrainBlock = (xmlString.match(/<Terrain>([\s\S]*?)<\/Terrain>/) || [])[1] || '';
    const tag = (s, t) => { const m = s.match(new RegExp('<' + t + '>([\\s\\S]*?)<\\/' + t + '>')); return m ? m[1].trim() : null; };
    const parsePos = (s) => { const m = s && s.match(/\(\s*(-?\d+)\s*,\s*-?\d+\s*,\s*(-?\d+)\s*\)/); return m ? { x: parseInt(m[1]), z: parseInt(m[2]) } : null; };

    const items = [];
    const scan = (block, terrainOnly) => {
      const liRe = /<li>([\s\S]*?)<\/li>/g;
      let m;
      while ((m = liRe.exec(block))) {
        const li = m[1];
        const pos = parsePos(tag(li, 'Position'));
        if (!pos) continue;
        const thingDef = terrainOnly ? null : tag(li, 'ThingDef');
        const terrainDef = tag(li, 'TerrainDef');
        if (thingDef) items.push({ kind: 'thing', def: thingDef, stuff: tag(li, 'Stuff'), rot: parseInt(tag(li, 'Rotation')) || 0, x: pos.x, z: pos.z });
        else if (terrainDef) items.push({ kind: 'terrain', def: terrainDef, x: pos.x, z: pos.z });
      }
    };
    scan(buildBlock, false);
    scan(terrainBlock, true);
    if (!items.length) return { blueprints: {}, stats: { placed: 0, terrain: 0, unknown: 0 }, name: bpName };

    // Compute each thing's occupied WORLD rect with RimWorld's exact rule
    // (_occupiedRectLocal = GenAdj.OccupiedRect): the stored Position is a rotation
    // anchor and even-sized footprints shift per facing, so multi-cell furniture
    // (beds, tables) lands on its true cells for every rotation instead of always
    // growing one way (which put rotated beds onto the wall behind them).
    const sizeFor = (def) => (typeof vanillaDefSize === 'function') ? vanillaDefSize(def) : [1, 1];
    const rectOf = (it) => {
      if (it.kind !== 'thing' || (typeof isWireDef === 'function' && isWireDef(it.def))) {
        return { x0: it.x, x1: it.x, z0: it.z, z1: it.z }; // terrain & wires: 1x1
      }
      const base = sizeFor(it.def);
      return this._occupiedRectLocal(it.x, it.z, it.rot, base[0], base[1]);
    };
    items.forEach(it => { it._rect = rectOf(it); });

    // Normalise to a 0-based grid and flip z back to top-down y. Bounds come from
    // the expanded rects so a centred footprint never maps to a negative cell.
    const minX = Math.min(...items.map(i => i._rect.x0));
    const maxZ = Math.max(...items.map(i => i._rect.z1));
    const bp = {};
    let placed = 0, terrainCount = 0, unknown = 0;
    items.forEach(it => {
      const gx = it.x - minX, gy = maxZ - it.z;
      const id = (typeof vanillaDefToBuildingId === 'function') ? vanillaDefToBuildingId(it.def) : null;
      if (it.kind === 'terrain') {
        const key = gx + ',' + gy;
        if (!bp[key]) bp[key] = { floor: null, struct: null };
        bp[key].floor = id || 'gen_floor';
        if (!id) { bp[key].floorDef = it.def; unknown++; }
        terrainCount++;
        return;
      }
      // Wires/pipes/conduits: 1x1 underlay that can stack with objects and each
      // other on one cell. Store the raw defName; import resolves it to a palette id.
      if (typeof isWireDef === 'function' && isWireDef(it.def)) {
        const key = gx + ',' + gy;
        if (!bp[key]) bp[key] = { floor: null, struct: null };
        if (!Array.isArray(bp[key].wires)) bp[key].wires = [];
        if (!bp[key].wires.includes(it.def)) bp[key].wires.push(it.def);
        if (!id) unknown++;
        placed++;
        return;
      }
      // Stamp the object's full footprint from its rotation-aware occupied rect so a
      // table/bed shows its true area, on its true cells, for every facing. Counts
      // once as one object.
      const r = it._rect;
      const multi = (r.x1 > r.x0) || (r.z1 > r.z0);
      const inst = multi ? this._newInstanceId() : null; // group this object's cells
      for (let wx = r.x0; wx <= r.x1; wx++) for (let wz = r.z0; wz <= r.z1; wz++) {
        const key = (wx - minX) + ',' + (maxZ - wz);
        if (!bp[key]) bp[key] = { floor: null, struct: null };
        bp[key].struct = id || 'gen_wall';
        if (inst) bp[key].inst = inst;
        if (it.rot) bp[key].rot = it.rot; // preserve facing for re-export
        if (!id) { bp[key].structDef = it.def; bp[key].structStuff = it.stuff || null; }
      }
      if (!id) unknown++;
      placed++;
    });
    return { blueprints: bp, stats: { placed, terrain: terrainCount, unknown }, name: bpName };
  },

  // Stable, distinct colour derived from a defName so every imported item type
  // gets its own swatch. Floors use a darker/desaturated band so ground reads
  // differently from objects/furniture.
  _defColour(str, layer) {
    let h = 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const hue = h % 360;
    return layer === 'floor' ? `hsl(${hue}, 32%, 38%)` : `hsl(${hue}, 58%, 56%)`;
  },

  // Get-or-create a palette entry for an imported (non-palette) def, so the
  // canvas shows a real colour, the item appears in the object list, and the
  // tile is identifiable. Keyed by def so re-imports reuse the same swatch.
  _importedBuildingId(def, stuff, layer) {
    if (!def) return null;
    if (!this.state.customBuildings || typeof this.state.customBuildings !== 'object' || Array.isArray(this.state.customBuildings)) {
      this.state.customBuildings = {};
    }
    const id = 'bp_' + String(def).replace(/[^\w]+/g, '_');
    if (!this.state.customBuildings[id]) {
      const wire = (typeof isWireDef === 'function' && isWireDef(def));
      // Bake the footprint now (the mod size table is loaded at import time), so
      // placing this object from the palette later still works even after a reload
      // when the live size table is empty.
      const sz = (layer !== 'floor' && !wire && typeof vanillaDefSize === 'function') ? vanillaDefSize(def) : [1, 1];
      this.state.customBuildings[id] = {
        id, label: String(def), layer: layer === 'floor' ? 'floor' : 'struct',
        def: String(def), stuff: stuff || undefined,
        color: this._defColour(def, layer), work: 200, shape: wire ? 'line' : 'square',
        modSource: 'Imported blueprint', w: sz[0], h: sz[1],
      };
    }
    return id;
  },

  // North/East/South/West facing for a rotation (RimWorld Rot4: 0=N,1=E,2=S,3=W).
  _facing(rot) {
    return [
      { letter: 'N', arrow: '↑' }, { letter: 'E', arrow: '→' },
      { letter: 'S', arrow: '↓' }, { letter: 'W', arrow: '←' },
    ][((rot | 0) % 4 + 4) % 4];
  },

  _nameOfBuilding(id) {
    if (!id) return null;
    const b = (this.allBuildings || []).find(x => x.id === id);
    return b ? b.label : id;
  },

  // Two-line tooltip: object (with facing) on line 1, floor on line 2.
  _blueprintTileTipHTML(cell, x, y) {
    if (!cell || typeof cell !== 'object') return '';
    const lines = [];
    const obj = this._nameOfBuilding(cell.struct);
    if (obj) {
      const f = this._facing(cell.rot);
      const b = (this.allBuildings || []).find(x => x.id === cell.struct);
      let sizeStr = '';
      // Prefer the ACTUAL placed footprint (bounding box of the grouped object) so
      // the size is always right even when the modded def-size table isn't loaded
      // (a reload without re-scanning would otherwise make vanillaDefSize return 1x1).
      let dims = null;
      if (x != null && y != null) {
        const grp = this._objectCellsAt(x, y);
        if (grp && grp.length > 1) {
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          grp.forEach(([gx, gy]) => { if (gx < minX) minX = gx; if (gx > maxX) maxX = gx; if (gy < minY) minY = gy; if (gy > maxY) maxY = gy; });
          dims = [maxX - minX + 1, maxY - minY + 1];
        }
      }
      if (!dims && b) dims = this._buildingSize(b);
      if (dims) sizeStr = `<span class="bp-tip-size">${dims[0]}&times;${dims[1]}</span>`;
      lines.push(`<span class="bp-tip-obj">${_escapeHtml(obj)}</span>${sizeStr}<span class="bp-tip-face" title="Facing ${f.letter}">${f.arrow} ${f.letter}</span>`);
    }
    if (Array.isArray(cell.wires) && cell.wires.length) {
      const names = cell.wires.map(id => this._nameOfBuilding(id)).filter(Boolean);
      if (names.length) lines.push(`<span class="bp-tip-floor">Wires: ${_escapeHtml(names.join(', '))}</span>`);
    }
    const floor = this._nameOfBuilding(cell.floor);
    if (floor) lines.push(`<span class="bp-tip-floor">Floor: ${_escapeHtml(floor)}</span>`);
    return lines.map(l => `<div class="bp-tip-line">${l}</div>`).join('');
  },

  _showBlueprintTip(e, x, y) {
    if (this.state.settings && this.state.settings.tooltips === false) { const t = document.getElementById('bpTileTip'); if (t) t.style.display = 'none'; return; }
    const cell = (this.state.blueprints || {})[x + ',' + y];
    const html = this._blueprintTileTipHTML(cell, x, y);
    let tip = document.getElementById('bpTileTip');
    if (!html) { if (tip) tip.style.display = 'none'; return; }
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'bpTileTip';
      tip.className = 'bp-tile-tip';
      document.body.appendChild(tip);
    }
    tip.innerHTML = html;
    tip.style.display = 'block';
    // Always sit to the right of the cursor; only pull in at the very edge
    // (never flip to the left side).
    const pad = 14;
    const w = tip.offsetWidth || 160, h = tip.offsetHeight || 24;
    const left = Math.min(e.clientX + pad, window.innerWidth - w - 4);
    let top = e.clientY + pad;
    if (top + h > window.innerHeight - 4) top = Math.max(4, e.clientY - h - pad);
    tip.style.left = Math.max(4, left) + 'px';
    tip.style.top = top + 'px';
  },

  _hideBlueprintTip() {
    const tip = document.getElementById('bpTileTip');
    if (tip) tip.style.display = 'none';
  },

  // Export the current grid to a Blueprints-mod .xml file (drops into the game's
  // Blueprints folder; only loads in-game if the user has the Blueprints mod).
  async exportBlueprintXML() {
    if (!window.overlay || !window.overlay.exportBlueprintXml) { this.showAlert('Blueprint export needs the desktop app.'); return; }
    const defaultName = this.state.blueprintName || this.state.colonyName || 'RimJobs Blueprint';
    const xml = this.buildBlueprintXML(null, { name: defaultName });
    if (!xml) { this.toast('Nothing to export - draw a layout first.'); return; }
    let res;
    try { res = await window.overlay.exportBlueprintXml(defaultName, xml); }
    catch (e) { this.showAlert('Export failed: ' + (e.message || e)); return; }
    if (!res) return; // cancelled
    if (res.ok) {
      const fname = String(res.filePath || '').replace(/\\/g, '/').split('/').pop() || '';
      if (fname) { this.state.blueprintName = fname.replace(/\.xml$/i, ''); this.triggerAutoSave(); if (this.renderBlueprintSidebar) this.renderBlueprintSidebar(); }
      this.toast(`Exported "${this.state.blueprintName}". Load it in-game via the Blueprints mod.`);
    } else this.showAlert('Export failed: ' + (res.error || 'unknown error'));
  },

  // Force a fresh scan of installed mods for tile sizes, with progress + a count.
  async rescanModSizes() {
    if (!this._ensureDefLabels || !(window.overlay && window.overlay.scanDefLabels)) {
      this.showAlert('Mod scanning needs the desktop app.');
      return;
    }
    this._showImportProgress('Rescanning installed mods for tile sizes...');
    if (window.overlay.onDefLabelProgress) {
      window.overlay.onDefLabelProgress(d => this._updateImportProgress(d.done, d.total, `Scanning mods... ${d.done} / ${d.total} files`));
    }
    this._defLabels = null; // force a fresh scan (picks up the latest main-process scanner)
    try { await this._ensureDefLabels(); } catch (e) { /* offline / no install */ }
    this._closeImportProgress();
    const n = this._defSizes ? Object.keys(this._defSizes).length : 0;
    if (this.renderBlueprintSidebar) this.renderBlueprintSidebar();
    this.toast(n
      ? `Loaded ${n} modded tile sizes. Re-import to apply them to existing objects.`
      : 'No mod sizes found - set the RimWorld path in Settings, or fully restart the app.');
  },

  // -- Import progress modal --
  _showImportProgress(msg, title) {
    let el = document.getElementById('bpImportProgress');
    if (!el) {
      el = document.createElement('div');
      el.id = 'bpImportProgress';
      el.className = 'modal-overlay show';
      el.innerHTML = `<div class="modal" style="max-width:440px">
        <div class="modal-header"><h3 class="modal-title" id="bpImportTitle">Importing Blueprint</h3></div>
        <div class="modal-body">
          <div id="bpImportMsg" style="font-size:var(--f-sm); color:var(--text2); margin-bottom:12px; line-height:1.5"></div>
          <div style="height:6px; background:var(--surface3); border-radius:3px; overflow:hidden">
            <div id="bpImportBar" style="height:100%; width:0%; background:var(--accent); border-radius:3px; transition:width 0.15s"></div>
          </div>
          <div style="font-size:var(--f-xs); color:var(--text3); margin-top:10px; line-height:1.4">This can take a while on slower PCs or large mod lists - please keep the app open until it finishes.</div>
        </div></div>`;
      document.body.appendChild(el);
    }
    el.style.display = 'flex';
    const t = document.getElementById('bpImportTitle');
    if (t) t.textContent = title || 'Importing Blueprint';
    const m = document.getElementById('bpImportMsg');
    if (m) m.textContent = msg || 'Working...';
    const bar = document.getElementById('bpImportBar');
    if (bar) bar.style.width = '0%';
  },
  _updateImportProgress(done, total, label) {
    const bar = document.getElementById('bpImportBar');
    if (bar && total) bar.style.width = Math.round((done / total) * 100) + '%';
    const m = document.getElementById('bpImportMsg');
    if (m && label) m.textContent = label;
  },
  _closeImportProgress() {
    const el = document.getElementById('bpImportProgress');
    if (el) el.style.display = 'none';
  },

  // Import a Blueprints-mod .xml file into the grid. Vanilla items map to the
  // palette; modded/unknown items become generic placeholders (footprint kept).
  async importBlueprintXML() {
    if (!window.overlay || !window.overlay.importBlueprintXml) { this.showAlert('Blueprint import needs the desktop app.'); return; }
    let res;
    try { res = await window.overlay.importBlueprintXml(); }
    catch (e) { this.showAlert('Import failed: ' + (e.message || e)); return; }
    if (!res) return; // cancelled
    if (!res.ok) { this.showAlert('Import failed: ' + (res.error || 'unknown error')); return; }
    // Lock out other scans/imports while this runs (it shares the def-label scan
    // and rewrites the blueprint grid).
    if (this._acquireIO && !this._acquireIO('Blueprint import')) return;
    try {
    // Load real tile footprints from installed mods so multi-cell modded
    // furniture fills its correct size. Re-scan if we have no sizes yet (an empty
    // map from a stale scan shouldn't block a retry).
    const haveSizes = this._defSizes && Object.keys(this._defSizes).length > 0;
    if (!haveSizes && this._ensureDefLabels) {
      // Non-blocking toast (NOT a modal) so you can keep using the app while the
      // mod tile-size scan runs. The scan itself is async/batched in the main process.
      this._showScanToast && this._showScanToast('Importing blueprint');
      this._updateScanToast && this._updateScanToast(0, 0, 'Reading mod tile sizes...');
      if (window.overlay && window.overlay.onDefLabelProgress) {
        window.overlay.onDefLabelProgress(d => this._updateScanToast && this._updateScanToast(d.done, d.total, `Scanning mods... ${d.done} / ${d.total} files`));
      }
      try { this._defLabels = null; await this._ensureDefLabels(); } catch (e) { /* offline / no install */ }
      const n = this._defSizes ? Object.keys(this._defSizes).length : 0;
      console.log(`[blueprint] mod tile sizes loaded: ${n}`);
      this._closeScanToast && this._closeScanToast(n ? `Loaded ${n} mod tile sizes.` : 'No modded tile sizes found.', !n);
      if (!n) this.toast('No modded tile sizes found - check the RimWorld path in Settings, or fully restart the app.');
    }
    const parsed = this.parseBlueprintXML(res.xml);
    const cellCount = parsed.stats.placed + parsed.stats.terrain;
    if (!cellCount) { this.showAlert('No buildable items found in that file.'); return; }
    const ghost = parsed.stats.unknown
      ? ` ${parsed.stats.unknown} modded/unknown item(s) will appear as generic placeholders.`
      : '';
    const ok = await this.showConfirm(`Import ${parsed.stats.placed} object(s) and ${parsed.stats.terrain} floor tile(s)?${ghost} This replaces the current layout.`);
    if (!ok) return;
    // Register every unique imported (non-palette) def as its own coloured
    // swatch, so each item is distinct and identifiable on the canvas rather
    // than a generic grey/concrete block.
    Object.values(parsed.blueprints).forEach(cell => {
      if (cell.structDef) { cell.struct = this._importedBuildingId(cell.structDef, cell.structStuff, 'struct'); delete cell.structDef; delete cell.structStuff; }
      if (cell.floorDef) { cell.floor = this._importedBuildingId(cell.floorDef, null, 'floor'); delete cell.floorDef; }
      // Resolve wire defNames -> palette ids (vanilla mapped, modded registered).
      if (Array.isArray(cell.wires)) {
        cell.wires = cell.wires.map(def => {
          if (typeof vanillaDefToBuildingId === 'function') {
            const vid = vanillaDefToBuildingId(def);
            if (vid) return vid;
          }
          return this._importedBuildingId(def, null, 'struct');
        }).filter((v, i, a) => v && a.indexOf(v) === i);
      }
    });
    this._refreshCaches();
    this.state.blueprints = parsed.blueprints;
    // Prefer the blueprint's embedded <Name>; fall back to the file name.
    const fname = String(res.filePath || '').replace(/\\/g, '/').split('/').pop() || '';
    this.state.blueprintName = (parsed.name && parsed.name.trim()) || fname.replace(/\.xml$/i, '') || 'Imported blueprint';
    if (this._canvasFullDraw) this._canvasFullDraw();
    if (this._updateBill) this._updateBill();
    if (this.renderBlueprintSidebar) this.renderBlueprintSidebar();
    this.triggerAutoSave();
    this.toast(`Imported "${this.state.blueprintName}" - ${cellCount} cell(s)${parsed.stats.unknown ? ` (${parsed.stats.unknown} placeholder(s))` : ''}.`);
    } finally {
      this._releaseIO && this._releaseIO();
    }
  },

  // -- BLUEPRINT LOGIC --
  addCustomBuilding() {
    const modal = document.getElementById('materialModal');
    const header = document.querySelector('#materialModal .modal-title');
    const footer = document.querySelector('#materialModal .modal-footer');
    if (header) header.textContent = 'Define New Object';
    if (footer) {
      footer.innerHTML = `
        <button class="btn" onclick="App.closeMaterialEditor()">Cancel</button>
        <button class="btn btn-primary" onclick="App.submitNewBuilding()">Add Object</button>
      `;
    }
    const body = document.getElementById('materialModalBody');
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label style="font-size:var(--f-xs);color:var(--text3);font-weight:700;text-transform:uppercase;display:block;margin-bottom:6px">Object Name</label>
            <input type="text" id="bldLabel" placeholder="e.g. Marble Wall" class="skill-input" style="width:100%;text-align:left;padding:8px 12px">
          </div>
          <div>
            <label style="font-size:var(--f-xs);color:var(--text3);font-weight:700;text-transform:uppercase;display:block;margin-bottom:6px">Work Cost</label>
            <input type="number" id="bldWork" value="200" class="skill-input" style="width:100%;text-align:center;padding:8px">
          </div>
        </div>
        <div>
          <label style="font-size:var(--f-xs);color:var(--text3);font-weight:700;text-transform:uppercase;display:block;margin-bottom:6px">Layer</label>
          <div style="display:flex;gap:8px">
            <button id="bldLayerStruct" class="btn btn-sm btn-primary" onclick="document.getElementById('bldLayerStruct').classList.add('btn-primary'); document.getElementById('bldLayerFloor').classList.remove('btn-primary'); App.state.activeBldLayer='struct'"> Structure</button>
            <button id="bldLayerFloor" class="btn btn-sm" onclick="document.getElementById('bldLayerFloor').classList.add('btn-primary'); document.getElementById('bldLayerStruct').classList.remove('btn-primary'); App.state.activeBldLayer='floor'"> Floor</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label style="font-size:var(--f-xs);color:var(--text3);font-weight:700;text-transform:uppercase;display:block;margin-bottom:6px">Width (tiles)</label>
            <input type="number" id="bldW" value="1" min="1" max="30" class="skill-input" style="width:100%;text-align:center;padding:8px">
          </div>
          <div>
            <label style="font-size:var(--f-xs);color:var(--text3);font-weight:700;text-transform:uppercase;display:block;margin-bottom:6px">Height (tiles)</label>
            <input type="number" id="bldH" value="1" min="1" max="30" class="skill-input" style="width:100%;text-align:center;padding:8px">
          </div>
        </div>
        <div>
          <label style="font-size:var(--f-xs);color:var(--text3);font-weight:700;text-transform:uppercase;display:block;margin-bottom:6px">Shape</label>
          <select id="bldShape" class="skill-input" style="width:100%;padding:8px 12px">
            <option value="square" selected>Square</option>
            <option value="cross">Cross</option>
            <option value="diamond">Diamond</option>
            <option value="circle">Circle</option>
            <option value="triangle">Triangle</option>
            <option value="dot">Dot</option>
          </select>
        </div>
        <div>
          <label style="font-size:var(--f-xs);color:var(--text3);font-weight:700;text-transform:uppercase;display:block;margin-bottom:6px">Object Colour</label>
          <input type="color" id="bldColor" value="#888888" style="width:40px;height:32px;border:none;padding:0;background:transparent;cursor:pointer;border-radius:6px">
        </div>
        <div style="padding:8px 10px;background:var(--surface3);border-radius:6px;border-left:3px solid var(--accent)">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--f-sm);color:var(--text)">
            <input type="checkbox" id="bldWire"> <strong>Pipe / Conduit</strong>
          </label>
          <div style="font-size:var(--f-xs);color:var(--text3);margin-top:4px;line-height:1.4">A connecting line that sits under objects, stacks with other pipes/conduits, and links to neighbours of the same type. Overrides the shape above.</div>
        </div>
        <div>
          <label style="font-size:var(--f-xs);color:var(--text3);font-weight:700;text-transform:uppercase;display:block;margin-bottom:6px">Game DefName <span style="text-transform:none;font-weight:400">(optional - for in-game export)</span></label>
          <input type="text" id="bldDef" placeholder="e.g. PowerConduit, leave blank for planning only" class="skill-input" style="width:100%;text-align:left;padding:8px 12px">
        </div>
        <div>
          <label style="font-size:var(--f-xs);color:var(--text3);font-weight:700;text-transform:uppercase;display:block;margin-bottom:6px">Mod Source</label>
          <input type="text" id="bldMod" placeholder="Vanilla (leave blank)" class="skill-input" style="width:100%;text-align:left;padding:8px 12px">
        </div>
      </div>
    `;
    App.state.activeBldLayer = 'struct';
    modal.classList.add('show');
    setTimeout(() => document.getElementById('bldLabel')?.focus(), 100);
  },

  submitNewBuilding() {
    if (!this._checkCap(this.state.customBuildings, 'customBuildings', 'custom buildings')) return;
    const label = document.getElementById('bldLabel')?.value.trim();
    if (!label) { this.toast('Enter a name!'); return; }
    const color = _safeColor(document.getElementById('bldColor')?.value || '#888888');
    const work = parseInt(document.getElementById('bldWork')?.value) || 200;
    const layer = App.state.activeBldLayer || 'struct';
    const isWire = !!document.getElementById('bldWire')?.checked;
    const shape = isWire ? 'line' : (document.getElementById('bldShape')?.value || 'square');
    const def = (document.getElementById('bldDef')?.value || '').trim();
    const id = "bld_" + Math.random().toString(36).slice(2, 7);
    const modSource = (document.getElementById('bldMod')?.value || '').trim();
    // Footprint: floors and wires are always 1x1; struct objects may be multi-cell.
    const clampDim = (v) => Math.max(1, Math.min(30, parseInt(v) || 1));
    const w = (layer === 'floor' || isWire) ? 1 : clampDim(document.getElementById('bldW')?.value);
    const h = (layer === 'floor' || isWire) ? 1 : clampDim(document.getElementById('bldH')?.value);
    this.state.customBuildings[id] = { id, label, layer, color, work, shape, modSource, def: def || undefined, w, h };
    this._refreshCaches();
    // Restore footer
    const footer = document.querySelector('#materialModal .modal-footer');
    if (footer) footer.innerHTML = `<button class="btn" onclick="App.closeMaterialEditor()">Cancel</button><button class="btn btn-primary" onclick="App.submitNewMaterial()">Add Material</button>`;
    const header = document.querySelector('#materialModal .modal-title');
    if (header) header.textContent = 'New Material';
    this.closeMaterialEditor();
    this.renderBlueprint();
    this.triggerAutoSave();
    this.toast(' ' + label + ' added!');
  },

  deleteCustomMaterial(id) {
    this.showConfirm('Delete this material?', 'Delete').then(() => { this._doDeleteMaterial(id); }).catch(() => {});
  },
  _doDeleteMaterial(id) {
    // Remove from custom list (user-defined) or blocklist built-ins
    this.state.customMaterials = this.state.customMaterials.filter(m => m.id !== id);
    if (!this.state.deletedMaterials) this.state.deletedMaterials = [];
    if (!this.state.deletedMaterials.includes(id)) this.state.deletedMaterials.push(id);
    this._refreshCaches();
    // Clear any tiles painted with this material
    const toolId = 'mat__' + id;
    Object.keys(this.state.blueprints).forEach(key => {
      const cell = this.state.blueprints[key];
      if (cell.floor === toolId) cell.floor = null;
      if (cell.struct === toolId) cell.struct = null;
    });
    if (this.state.activeTool === toolId) this.state.activeTool = 'gen_wall';
    this.renderBlueprint();
    this.triggerAutoSave();
    this.toast('Material removed.');
  },

  deleteCustomBuilding(id) {
    this.showConfirm('Delete object definition?', 'Delete').then(() => { this._doDeleteBuilding(id); }).catch(() => {});
  },
  _doDeleteBuilding(id) {
    const isPreset = PRESET_BUILDINGS.some(b => b.id === id);
    if (isPreset) {
      if (!this.state.deletedPresetBuildings.includes(id)) {
        this.state.deletedPresetBuildings.push(id);
      }
    } else {
      delete this.state.customBuildings[id];
    }
    if (this.state.activeTool === id) this.state.activeTool = this.allBuildings[0]?.id || 'gen_wall';
    this._refreshCaches();
    Object.keys(this.state.blueprints).forEach(k => {
      if (this.state.blueprints[k].floor === id) delete this.state.blueprints[k].floor;
      if (this.state.blueprints[k].struct === id) delete this.state.blueprints[k].struct;
    });
    this.renderBlueprint();
    this.triggerAutoSave();
  },

  setBlueprintTool(id) {
    // Always select (no toggle-off) - re-clicking or double-clicking a tool kept
    // snapping back to Wall, which was jarring.
    this.state.activeTool = id;
    this.state.eraseMode = false; // picking a tool exits erase
    if (id.startsWith('mat__')) {
      this.state.activeLayer = 'floor';
    } else {
      const b = this.allBuildings.find(x => x.id === id);
      if (b) this.state.activeLayer = b.layer;
    }
    this.renderBlueprintSidebar();
  },

  setDrawMode(mode) {
    this.state.drawMode = mode;
    this.state.eraseMode = false; // picking a tool exits erase
    this._stampPlacing = null;
    this._stampPreview = null;
    this.renderBlueprintSidebar();
  },

  // Erase toggle: when on, left-click erases (right-click always erases too).
  toggleEraseMode() {
    this.state.eraseMode = !this.state.eraseMode;
    // Erasing from a Draw/Box stroke makes sense; drop any stamp/tag mode.
    if (this.state.eraseMode && this.state.drawMode !== 'box') this.state.drawMode = 'point';
    this.renderBlueprintSidebar();
  },

  // Cycle the facing applied to newly-placed objects (Q/E keys or the Rotate button).
  rotateBlueprintTool(dir) {
    this.state.blueprintRot = (((this.state.blueprintRot | 0) + (dir || 1)) % 4 + 4) % 4;
    this.renderBlueprintSidebar();
    if (this._canvasFullDraw) this._canvasFullDraw(); // re-draw so the hover ghost rotates live
    const f = this._facing(this.state.blueprintRot);
    this.toast(`Facing ${f.arrow} ${f.letter}`);
  },

  // Eyedropper: adopt whatever sits on a tile as the active tool. Prefers the
  // object layer, falls back to the floor. Returns true if something was picked.
  pickTileAt(x, y) {
    const cell = (this.state.blueprints || {})[x + ',' + y];
    if (!cell || typeof cell !== 'object') { this.toast('Nothing to pick here'); return false; }
    const id = cell.struct || cell.floor;
    if (!id) { this.toast('Nothing to pick here'); return false; }
    this.state.activeTool = id;
    this.state.eraseMode = false;
    if (id.startsWith && id.startsWith('mat__')) this.state.activeLayer = 'floor';
    else { const b = this.allBuildings.find(bb => bb.id === id); if (b) this.state.activeLayer = b.layer; }
    const b = this.allBuildings.find(bb => bb.id === id);
    this.renderBlueprintSidebar();
    this.toast('Picked: ' + (b ? b.label : id));
    return true;
  },

  // Category for grouping the object palette. Derived (not stored) so the new
  // vanilla palette and imported/custom items slot into sensible sections.
  _buildingCategory(b) {
    if (!b) return 'Other';
    if (b.modSource === 'Imported blueprint') return 'Imported';
    if (b.modSource) return 'Custom';
    if (b.layer === 'floor') return 'Floors';
    return ({
      gen_wall: 'Structure', door: 'Structure', autodoor: 'Structure', column: 'Structure', sandbags: 'Structure', barricade: 'Structure',
      bed: 'Furniture', doublebed: 'Furniture', bedroll: 'Furniture', hospitalbed: 'Furniture', diningchair: 'Furniture', stool: 'Furniture', table2x2: 'Furniture', table1x2: 'Furniture', standinglamp: 'Furniture', sculpture: 'Furniture',
      powerconduit: 'Power', solar: 'Power', woodgen: 'Power', battery: 'Power',
      cooler: 'Utility', heater: 'Utility', campfire: 'Utility',
      researchbench: 'Production', electricstove: 'Production', butcherspot: 'Production',
      grave: 'Misc', sarcophagus: 'Misc',
    }[b.id]) || 'Other';
  },

  _blueprintCatOrder: ['Floors', 'Structure', 'Furniture', 'Power', 'Utility', 'Production', 'Misc', 'Other', 'Custom', 'Imported'],

  // Ordered list of object categories that currently have entries.
  _blueprintCategoriesPresent() {
    const set = {};
    (this.allBuildings || []).forEach(b => { set[this._buildingCategory(b)] = true; });
    const ORDER = this._blueprintCatOrder;
    return Object.keys(set).sort((a, z) => ((ORDER.indexOf(a) + 1) || 99) - ((ORDER.indexOf(z) + 1) || 99));
  },

  _bpCatCollapsed() {
    if (!this.state.blueprintCatCollapsed || typeof this.state.blueprintCatCollapsed !== 'object' || Array.isArray(this.state.blueprintCatCollapsed)) {
      this.state.blueprintCatCollapsed = {};
    }
    return this.state.blueprintCatCollapsed;
  },

  // Collapse/expand a single object category (same rule as pawn cards).
  toggleBlueprintCat(cat) {
    const c = this._bpCatCollapsed();
    c[cat] = !c[cat];
    this.renderBlueprintSidebar();
  },

  // Collapse all when any is open, otherwise expand all (mirrors toggleCollapseAll).
  toggleBlueprintCatsAll() {
    const c = this._bpCatCollapsed();
    const cats = this._blueprintCategoriesPresent();
    const anyExpanded = cats.some(cat => !c[cat]);
    cats.forEach(cat => { c[cat] = anyExpanded; });
    this.renderBlueprintSidebar();
  },

  // Collapse/expand the whole Materials section (a flat list, so it's all-or-nothing).
  _bpMaterialsCollapsed() {
    return !!this.state.blueprintMaterialsCollapsed;
  },

  toggleBlueprintMaterials() {
    this.state.blueprintMaterialsCollapsed = !this.state.blueprintMaterialsCollapsed;
    this.renderBlueprintSidebar();
  },

  // -- Easel palettes (widget) --------------------------------------------------
  // Mat/Obj/Bg each open a light popup showing every option as a swatch grid, so the
  // widget toolbar stays a slim strip instead of a wall of swatches that escapes the
  // window however many items the user adds.
  _bpEaselItems(kind) {
    if (kind === 'mat') return (this.allMaterials || []).map(m => ({ id: m.id, label: m.label, color: _safeColor(m.color), active: this.state.activeTool === 'mat__' + m.id }));
    if (kind === 'obj') return (this.allBuildings || []).map(b => ({ id: b.id, label: b.label, color: _safeColor(b.color), active: this.state.activeTool === b.id }));
    if (kind === 'bg')  return (this.allBiomes || []).map(b => ({ id: b.id, label: b.label, color: this._biomeSwatchColor(b.id) || '#222', active: this.state.biome === b.id }));
    return [];
  },

  _bpEaselMeta(kind) {
    return ({
      mat: { title: 'Materials',   addLabel: '+ Material',   add: 'showWidgetAddMaterial' },
      obj: { title: 'Objects',     addLabel: '+ Object',     add: 'showWidgetAddObject' },
      bg:  { title: 'Backgrounds', addLabel: '+ Background', add: 'openBiomeEditor' },
    })[kind] || { title: '', addLabel: '+ Add', add: '' };
  },

  // A slim opener button showing the current selection's swatch + label for that kind.
  _bpEaselButton(kind, label) {
    const items = this._bpEaselItems(kind);
    const act = items.find(it => it.active);
    const chip = act
      ? `<span style="width:16px; height:16px; border-radius:3px; flex-shrink:0; background:${act.color}; border:1px solid var(--border-bright)"></span>`
      : `<span style="width:16px; height:16px; border-radius:3px; flex-shrink:0; background:repeating-linear-gradient(45deg, var(--surface3), var(--surface3) 3px, var(--surface2) 3px, var(--surface2) 6px)"></span>`;
    return `<button class="btn btn-sm ${act ? 'btn-primary' : ''}" onclick="App.openBpPalette('${kind}')" title="Open ${label} palette" style="flex:1 1 0; min-width:88px; display:flex; align-items:center; gap:6px; padding:5px 8px; font-size:calc(10px * var(--font-scale)); justify-content:flex-start; overflow:hidden">
      ${chip}
      <span style="font-weight:800; text-transform:uppercase; letter-spacing:0.03em; flex-shrink:0">${label}</span>
      <span style="margin-left:auto; opacity:0.6; font-size:calc(9px * var(--font-scale)); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0">${act ? _escapeHtml(act.label) : items.length}</span>
    </button>`;
  },

  openBpPalette(kind) {
    let el = document.getElementById('bpPaletteModal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'bpPaletteModal';
      el.className = 'modal-overlay';
      el.addEventListener('mousedown', (e) => { if (e.target === el) this.closeBpPalette(); });
      document.body.appendChild(el);
    }
    const meta = this._bpEaselMeta(kind);
    const items = this._bpEaselItems(kind);
    const tiles = items.map(it => `
      <button onclick="App._bpPalettePick('${kind}', '${it.id}')" title="${_escapeHtml(it.label)}"
        style="display:flex; flex-direction:column; align-items:center; gap:5px; padding:7px 4px; border-radius:8px; cursor:pointer; background:${it.active ? 'var(--accent-glow)' : 'var(--surface2)'}; border:1px solid ${it.active ? 'var(--accent)' : 'var(--border)'}">
        <span style="width:34px; height:34px; border-radius:6px; background:${it.color}; border:1px solid var(--border-bright)"></span>
        <span style="font-size:calc(9px * var(--font-scale)); color:var(--text2); text-align:center; line-height:1.2; width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${_escapeHtml(it.label)}</span>
      </button>`).join('');
    el.innerHTML = `<div class="modal" style="max-width:420px; width:92%; max-height:78vh; display:flex; flex-direction:column">
      <div class="modal-header" style="display:flex; align-items:center; justify-content:space-between; gap:8px">
        <h3 class="modal-title">${meta.title}</h3>
        <button onclick="App.closeBpPalette()" class="pawn-del" style="width:26px; height:26px; flex-shrink:0">&times;</button>
      </div>
      <div class="modal-body" style="overflow-y:auto; flex:1; min-height:0">
        ${items.length ? `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(72px, 1fr)); gap:6px">${tiles}</div>` : '<div style="text-align:center; color:var(--text3); padding:24px; font-size:var(--f-sm)">Nothing here yet.</div>'}
      </div>
      <div class="modal-footer" style="display:flex; gap:8px; justify-content:flex-end">
        ${meta.add ? `<button class="btn btn-primary btn-sm" onclick="App.closeBpPalette(); App.${meta.add}()">${meta.addLabel}</button>` : ''}
        <button class="btn btn-sm" onclick="App.closeBpPalette()">Done</button>
      </div>
    </div>`;
    el.classList.add('show');
    el.style.display = 'flex';
  },

  _bpPalettePick(kind, id) {
    if (kind === 'mat') this.setBlueprintTool('mat__' + id);
    else if (kind === 'obj') this.setBlueprintTool(id);
    else if (kind === 'bg') { this.setBiome(id); this.renderBlueprintSidebar(); }
    this.closeBpPalette();
  },

  closeBpPalette() {
    const el = document.getElementById('bpPaletteModal');
    if (el) { el.classList.remove('show'); el.style.display = 'none'; }
  },

  // Collapse the whole widget toolbar down to a slim bar once a tool is chosen, so the
  // canvas (the grid's 1fr row) reclaims the space the toolbar's auto row was using.
  _bpToolbarCollapsed() {
    return !!this.state.bpWidgetToolbarCollapsed;
  },

  toggleBpToolbar() {
    this.state.bpWidgetToolbarCollapsed = !this.state.bpWidgetToolbarCollapsed;
    this.renderBlueprintSidebar();
  },

  // Control hint for the widget toolbar that reflects the active tool, mirroring the
  // way the full sidebar's LMB label switches between Draw/Erase.
  _bpWidgetModeHint() {
    const dm = this.state.drawMode;
    const sp = this._stampPlacing;
    if (dm === 'stamp_place') {
      if (sp && sp._grab)      return 'LMB drop · Q/E rotate · F flip · RMB cancel';
      if (sp && sp._clipboard) return 'LMB place · Q/E rotate · F flip · RMB cancel';
      return 'LMB stamp · Q/E rotate · F flip · RMB cancel';
    }
    if (dm === 'grab')         return 'LMB grab/move · Q/E rotate · RMB cancel';
    if (dm === 'cut_select')   return 'Drag to cut · Q/E rotate · RMB cancel';
    if (dm === 'stamp_select') return 'Drag to select area · RMB cancel';
    if (dm === 'pick')         return 'LMB pick object · Alt+Click anytime';
    if (this.state.eraseMode)  return 'LMB Erase · RMB Erase';
    if (dm === 'box')          return 'Drag box to fill · RMB Erase';
    return 'LMB Draw · RMB Erase';
  },

  setBiome(id) {
    if (this.state.biome === id) return;
    this.state.biome = id;
    this.triggerAutoSave();
    const bg = this._biomeBgColor();
    const grid = document.querySelector('.blueprint-grid');
    if (grid) {
      grid.style.background = bg;
      // keep the biome-* class in sync, and update the canvas's own background so the
      // transparent scrollbar gutter no longer shows the previous biome's colour.
      grid.className = grid.className.replace(/\bbiome-\S+/g, '').replace(/\s+/g, ' ').trim() + ' biome-' + id;
    }
    const cv = document.getElementById('blueprintCanvas');
    if (cv) cv.style.background = bg;
    this._canvasFullDraw();
    document.querySelectorAll('[data-biome-btn]').forEach(btn => {
      const on = btn.dataset.biomeBtnId === id;
      const col = btn.dataset.biomeColor || '';
      const isSwatchBtn = btn.tagName === 'DIV' && btn.style.width === '20px'; // widget toolbar swatch

      if (isSwatchBtn) {
        // Small square swatches, keep their original color, just toggle border
        btn.style.background = col || '#222';
        btn.style.borderColor = on ? 'var(--accent)' : 'transparent';
      } else {
        // Sidebar text buttons, tinted color style
        if (!col) {
          // "None" biome
          btn.style.background  = on ? 'var(--accent-glow)' : '';
          btn.style.borderColor = on ? 'var(--accent)' : '';
          btn.style.color       = on ? 'var(--accent)' : '';
          btn.style.boxShadow   = '';
        } else {
          btn.style.background  = col + '22';
          btn.style.borderColor = on ? col : col + '55';
          btn.style.color       = on ? '#fff' : 'var(--text)';
          btn.style.boxShadow   = on ? 'inset 0 0 12px ' + col + '44' : '';
        }
      }
    });
  },


  updateBlueprintZoom(val) {
    const zoom = parseFloat(val);
    this._setCurrentZoom(zoom);
    const el = document.getElementById('zoomPercent');
    if (el) el.textContent = this._zoomDisplayPercent(zoom) + '%';
    // Debounce the expensive resize+redraw while scrubbing
    if (this._zoomTimer) clearTimeout(this._zoomTimer);
    this._zoomTimer = setTimeout(() => {
      this._zoomTimer = null;
      this._calculateAdaptiveGrid();
      this._canvasResizeAndDraw();
    }, 80);
  },

  commitBlueprintZoom(val) {
    const zoom = parseFloat(val);
    this._setCurrentZoom(zoom);
    if (this._zoomTimer) { clearTimeout(this._zoomTimer); this._zoomTimer = null; }
    this._calculateAdaptiveGrid();
    this._canvasResizeAndDraw();
    this.triggerAutoSave();
  },


  // DRAG & DRAW LOGIC - now handled inside attachBlueprintEvents canvas listeners
  onDragMove(e)  { document.body.classList.remove('is-painting'); /* box selection drawn on canvas */ },
  onDragEnd(e)   { document.body.classList.remove('is-painting'); },


  _writeTile(x, y, isRightClick) {
    const key = x + ',' + y;
    if (!this.state.blueprints[key]) this.state.blueprints[key] = { floor: null, struct: null };
    const cell = this.state.blueprints[key];
    if (isRightClick) {
      // Erase: remove the WHOLE object under the cursor (all its tiles, not just this
      // one - that's what left a 1x1 behind), plus this tile's floor and wires.
      if (cell.struct) this._clearObjectAt(x, y);
      cell.floor = null;
      cell.struct = null;
      delete cell.rot;
      delete cell.inst;
      delete cell.wires;
      return;
    }
    const layer = this.state.activeLayer;
    if (layer !== 'struct') { cell[layer] = this.state.activeTool; return; }

    // Wires/pipes go on their own stackable underlay so they coexist with an
    // object and with each other on the same cell.
    if (this._isWireId(this.state.activeTool)) {
      if (!Array.isArray(cell.wires)) cell.wires = [];
      if (!cell.wires.includes(this.state.activeTool)) cell.wires.push(this.state.activeTool);
      return;
    }

    // Objects: stamp the whole footprint (e.g. a bed is 1x2), rotation-aware.
    const tool = this.state.activeTool;
    const rot = (this.state.blueprintRot | 0) || 0;
    const b = (this.allBuildings || []).find(bb => bb.id === tool);
    const base = this._buildingSize(b);
    const ew = (rot % 2 === 1) ? base[1] : base[0];
    const eh = (rot % 2 === 1) ? base[0] : base[1];
    // Collision vs force-replace (toggle in the sidebar). Default: block placement that
    // would overlap an existing object (so a 2x2 can't reduce another to a fragment).
    // Force-replace on: clear any overlapped object IN FULL first, then stamp.
    if (!this.state.bpForceReplace) {
      if (this._footprintCollides(x, y, ew, eh)) return;
    } else {
      for (let dx = 0; dx < ew; dx++) for (let dy = 0; dy < eh; dy++) {
        const kx = x + dx, ky = y + dy;
        if (kx >= this.GRID_W || ky >= this.GRID_H) continue;
        const c = this.state.blueprints[kx + ',' + ky];
        if (c && c.struct) this._clearObjectAt(kx, ky);
      }
    }
    const inst = (ew * eh > 1) ? this._newInstanceId() : null; // group this object's cells
    for (let dx = 0; dx < ew; dx++) for (let dy = 0; dy < eh; dy++) {
      const kx = x + dx, ky = y + dy;
      if (kx >= this.GRID_W || ky >= this.GRID_H) continue;
      const k = kx + ',' + ky;
      if (!this.state.blueprints[k]) this.state.blueprints[k] = { floor: null, struct: null };
      this.state.blueprints[k].struct = tool;
      this.state.blueprints[k].rot = rot;
      if (inst) this.state.blueprints[k].inst = inst; else delete this.state.blueprints[k].inst;
    }
  },

  // -- CANVAS HELPERS ------------------------------------------

  _biomeColorMap: {
    temperate_forest:'#2a3d2a', boreal_forest:'#1e2e22',
    tropical_rainforest:'#1a3020', arid_shrubland:'#352a18',
    desert:'#3d3020', tundra:'#252d30',
    ice_sheet:'#1e2833', sea_ice:'#1a2530'
  },

  // Brighter biome swatch colors for light theme (UI circles/buttons only, not canvas)
  _biomeSwatchMap: {
    temperate_forest:'#4a8a4a', boreal_forest:'#3a6e42',
    tropical_rainforest:'#2d7040', arid_shrubland:'#8a6a30',
    desert:'#a08840', tundra:'#5a7a88',
    ice_sheet:'#6a9ab0', sea_ice:'#5088a0'
  },

  _biomeColor(id) {
    if (!id || id === 'none') return '';
    const custom = (this.state.customBiomes || []).find(b => b.id === id);
    if (custom) return custom.color;
    return this._biomeColorMap[id] || '';
  },

  // Returns a visible swatch color: brighter in light mode, dark original in dark mode
  _biomeSwatchColor(id) {
    if (!id || id === 'none') return '';
    const custom = (this.state.customBiomes || []).find(b => b.id === id);
    if (custom) return custom.color;
    if (document.body.classList.contains('light-theme')) {
      return this._biomeSwatchMap[id] || this._biomeColorMap[id] || '';
    }
    return this._biomeColorMap[id] || '';
  },

  _biomeBgColor() {
    const id = this.state.biome;
    if (!id || id === 'none')
      return document.body.classList.contains('light-theme') ? '#f5f6f8' : '#0e0f11';
    const custom = (this.state.customBiomes || []).find(b => b.id === id);
    if (custom) return custom.color;
    return { temperate_forest:'#2a3d2a', boreal_forest:'#1e2e22',
             tropical_rainforest:'#1a3020', arid_shrubland:'#352a18',
             desert:'#3d3020', tundra:'#252d30',
             ice_sheet:'#1e2833', sea_ice:'#1a2530' }[id]
        || (document.body.classList.contains('light-theme') ? '#f5f6f8' : '#0e0f11');
  },

  _canvasDrawTile(x, y) {
    const canvas = document.getElementById('blueprintCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const ts  = canvas.width / this.GRID_W;
    const px  = x * ts, py = y * ts;
    const cell  = this.state.blueprints[x + ',' + y] || {};
    const light = document.body.classList.contains('light-theme');

    ctx.fillStyle = this._biomeBgColor();
    ctx.fillRect(px, py, ts, ts);

    ctx.strokeStyle = light ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(px + .25, py + .25, ts - .5, ts - .5);

    const gx = (x + 1) % 11 === 0, gy = (y + 1) % 11 === 0;
    if (gx || gy) {
      ctx.strokeStyle = (gx && gy) ? 'rgba(232,168,56,0.45)' : 'rgba(232,168,56,0.22)';
      ctx.lineWidth = 0.75;
      if (gx) { ctx.beginPath(); ctx.moveTo(px+ts-.5, py); ctx.lineTo(px+ts-.5, py+ts); ctx.stroke(); }
      if (gy) { ctx.beginPath(); ctx.moveTo(px, py+ts-.5); ctx.lineTo(px+ts, py+ts-.5); ctx.stroke(); }
    }

    const fc = this._resolveTileColor(cell.floor);
    if (fc) { ctx.fillStyle = fc; this._drawShape(ctx, this._resolveShape(cell.floor), px, py, ts, 1); }
    this._drawWires(ctx, cell.wires, px, py, ts, x, y);
    this._drawStructCell(ctx, cell.struct, cell.rot, px, py, ts, x, y);
  },

  _drawShape(ctx, shape, px, py, ts, inset) {
    const x = px + inset, y = py + inset, s = ts - inset * 2;
    const cx = x + s / 2, cy = y + s / 2, r = s / 2;
    const poly = (n, rot) => {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = rot + i * (Math.PI * 2 / n);
        const X = cx + r * Math.cos(a), Y = cy + r * Math.sin(a);
        i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      }
      ctx.closePath(); ctx.fill();
    };
    const star = (pts, inner) => {
      ctx.beginPath();
      for (let i = 0; i < pts * 2; i++) {
        const rad = (i % 2) ? r * inner : r;
        const a = -Math.PI / 2 + i * Math.PI / pts;
        const X = cx + rad * Math.cos(a), Y = cy + rad * Math.sin(a);
        i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      }
      ctx.closePath(); ctx.fill();
    };
    const tri = (dir) => {
      ctx.beginPath();
      if (dir === 'down') { ctx.moveTo(x, y); ctx.lineTo(x + s, y); ctx.lineTo(cx, y + s); }
      else if (dir === 'left') { ctx.moveTo(x, cy); ctx.lineTo(x + s, y); ctx.lineTo(x + s, y + s); }
      else if (dir === 'right') { ctx.moveTo(x, y); ctx.lineTo(x + s, cy); ctx.lineTo(x, y + s); }
      else { ctx.moveTo(cx, y); ctx.lineTo(x + s, y + s); ctx.lineTo(x, y + s); } // up
      ctx.closePath(); ctx.fill();
    };
    switch (shape) {
      case 'circle': ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); break;
      case 'dot': ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.fill(); break;
      case 'ring': ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2, true); ctx.fill('evenodd'); break;
      case 'diamond': poly(4, -Math.PI / 2); break;
      case 'triangle': tri('up'); break;
      case 'triangle-down': tri('down'); break;
      case 'triangle-left': tri('left'); break;
      case 'triangle-right': tri('right'); break;
      case 'pentagon': poly(5, -Math.PI / 2); break;
      case 'hexagon': poly(6, 0); break;
      case 'hexagon-v': poly(6, Math.PI / 2); break;
      case 'octagon': poly(8, Math.PI / 8); break;
      case 'star': star(5, 0.45); break;
      case 'star6': star(6, 0.5); break;
      case 'cross': { const arm = s * 0.32; ctx.fillRect(cx - arm / 2, y, arm, s); ctx.fillRect(x, cy - arm / 2, s, arm); break; }
      case 'x': { ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4); const arm = s * 0.3; ctx.fillRect(-arm / 2, -r, arm, s); ctx.fillRect(-r, -arm / 2, s, arm); ctx.restore(); break; }
      case 'rect-h': ctx.fillRect(x, cy - s * 0.28, s, s * 0.56); break;
      case 'rect-v': ctx.fillRect(cx - s * 0.28, y, s * 0.56, s); break;
      case 'rounded': ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, s, s, s * 0.28); else ctx.rect(x, y, s, s); ctx.fill(); break;
      case 'half': ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.closePath(); ctx.fill(); break;
      case 'half-down': ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI); ctx.closePath(); ctx.fill(); break;
      case 'chevron': ctx.beginPath(); ctx.moveTo(x, y + s * 0.45); ctx.lineTo(cx, y); ctx.lineTo(x + s, y + s * 0.45); ctx.lineTo(x + s, y + s * 0.8); ctx.lineTo(cx, y + s * 0.35); ctx.lineTo(x, y + s * 0.8); ctx.closePath(); ctx.fill(); break;
      case 'square': default: ctx.fillRect(x, y, s, s);
    }
  },

  // Ordered list of selectable shapes (value + readable label).
  _SHAPES: [
    ['square', 'Square'], ['rounded', 'Rounded'], ['circle', 'Circle'], ['ring', 'Ring'], ['dot', 'Dot'],
    ['diamond', 'Diamond'], ['triangle', 'Triangle Up'], ['triangle-down', 'Triangle Down'],
    ['triangle-left', 'Triangle Left'], ['triangle-right', 'Triangle Right'],
    ['pentagon', 'Pentagon'], ['hexagon', 'Hexagon'], ['hexagon-v', 'Hexagon (tall)'], ['octagon', 'Octagon'],
    ['star', 'Star (5)'], ['star6', 'Star (6)'], ['cross', 'Plus'], ['x', 'Cross X'],
    ['rect-h', 'Bar (horizontal)'], ['rect-v', 'Bar (vertical)'], ['half', 'Half (top)'], ['half-down', 'Half (bottom)'], ['chevron', 'Chevron'],
    ['line', 'Line / Wire (connects)'],
  ],
  _shapeOptions(selected) {
    return this._SHAPES.map(([v, l]) => `<option value="${v}" ${selected === v ? 'selected' : ''}>${l}</option>`).join('');
  },

  _resolveShape(toolId) {
    if (!toolId) return 'square';
    const b = this.allBuildings?.find(bb => bb.id === toolId);
    if (b?.shape) return b.shape;
    return 'square';
  },

  // A wire/pipe/conduit tool (line shape) - placed on the stackable wire underlay.
  _isWireId(id) { return !!id && this._resolveShape(id) === 'line'; },

  // A 6-digit hex for <input type="color"> (falls back when the colour is hsl/var).
  _hexForInput(color) {
    const s = String(color || '');
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
    if (/^#[0-9a-fA-F]{3}$/.test(s)) return '#' + s.slice(1).split('').map(c => c + c).join('');
    return '#888888';
  },

  // -- Per-object appearance overrides (colour + shape) --
  _bpOverrides() {
    if (!this.state.buildingOverrides || typeof this.state.buildingOverrides !== 'object' || Array.isArray(this.state.buildingOverrides)) {
      this.state.buildingOverrides = {};
    }
    return this.state.buildingOverrides;
  },
  setBuildingColor(id, color) {
    if (!id) return;
    const ov = this._bpOverrides();
    ov[id] = Object.assign({}, ov[id], { color: _safeColor(color, '#888888') });
    this._refreshCaches();
    if (this._canvasFullDraw) this._canvasFullDraw();
    if (this.renderBlueprintSidebar) this.renderBlueprintSidebar();
    this.triggerAutoSave();
  },
  setBuildingShape(id, shape) {
    if (!id) return;
    const ov = this._bpOverrides();
    ov[id] = Object.assign({}, ov[id], { shape: String(shape || 'square') });
    this._refreshCaches();
    if (this._canvasFullDraw) this._canvasFullDraw();
    if (this.renderBlueprintSidebar) this.renderBlueprintSidebar();
    this.triggerAutoSave();
  },

  // Reset every object back to a square shape (keeps colour overrides).
  resetAllShapes() {
    this.showConfirm('Reset all object shapes to square? Custom colours are kept.', 'Reset shapes')
      .then(() => {
        const ov = this._bpOverrides();
        Object.keys(ov).forEach(id => {
          if (ov[id]) delete ov[id].shape;
          if (ov[id] && ov[id].color == null && ov[id].shape == null) delete ov[id];
        });
        this._refreshCaches();
        if (this._canvasFullDraw) this._canvasFullDraw();
        if (this.renderBlueprintSidebar) this.renderBlueprintSidebar();
        this.triggerAutoSave();
        this.toast('All shapes reset to square.');
      })
      .catch(() => {});
  },

  // Facing-arrow visibility toggle (user preference, persisted in settings).
  toggleFacingArrows() {
    this.state.settings.bpFacingArrows = !(this.state.settings.bpFacingArrows !== false);
    if (this._canvasFullDraw) this._canvasFullDraw();
    if (this.renderBlueprintSidebar) this.renderBlueprintSidebar();
    this.triggerAutoSave();
  },

  toggleForceReplace() {
    this.state.bpForceReplace = !this.state.bpForceReplace;
    if (this._canvasFullDraw) this._canvasFullDraw();
    if (this.renderBlueprintSidebar) this.renderBlueprintSidebar();
    this.triggerAutoSave();
    this.toast('Force replace ' + (this.state.bpForceReplace ? 'on - objects overwrite' : 'off - collision blocks'));
  },

  // Draw a small facing arrow (used for directional objects when enabled).
  _drawFacingArrow(ctx, rot, px, py, ts) {
    const r = ((rot | 0) % 4 + 4) % 4;
    ctx.save();
    ctx.translate(px + ts / 2, py + ts / 2);
    ctx.rotate(r * Math.PI / 2); // 0=N(up); canvas rotates clockwise -> 1=E,2=S,3=W
    const h = ts * 0.16, tip = ts * 0.36;
    ctx.beginPath();
    ctx.moveTo(0, -tip);
    ctx.lineTo(h, -tip + h * 1.5);
    ctx.lineTo(-h, -tip + h * 1.5);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fill();
    ctx.lineWidth = Math.max(0.5, ts * 0.025);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();
    ctx.restore();
  },

  // Draw an object cell: shape (inset so the floor behind shows around it) plus
  // a single facing arrow per object (only on the block's anchor cell, when gx/gy
  // are given - so a 1x2 bed shows one arrow at the head, not one per cell).
  _drawStructCell(ctx, structId, rot, px, py, ts, gx, gy) {
    if (!structId) return;
    const color = this._resolveTileColor(structId);
    if (!color) return;
    const shape = this._resolveShape(structId);
    if (shape === 'line') {
      // Conduits/pipes: a wire that links to orthogonal neighbours of the SAME
      // def only (so pipes never join conduits). No facing arrow.
      this._drawConnectedLine(ctx, structId, color, px, py, ts, gx, gy);
      return;
    }
    ctx.fillStyle = color;
    this._drawShape(ctx, shape, px, py, ts, Math.max(1, ts * 0.22));
    if (this.state.settings && this.state.settings.bpFacingArrows !== false) {
      const b = (this.allBuildings || []).find(x => x.id === structId);
      const cat = b ? this._buildingCategory(b) : 'Other';
      if (b && b.layer !== 'floor' && cat !== 'Structure' && cat !== 'Floors') {
        let anchor = true;
        if (gx != null && gy != null) {
          const bp = this.state.blueprints || {};
          const cell = bp[gx + ',' + gy];
          const left = bp[(gx - 1) + ',' + gy], up = bp[gx + ',' + (gy - 1)];
          // Suppress the arrow only on a non-top-left tile of the SAME object
          // (instance-aware), so each multi-cell piece shows ONE arrow while two
          // identical pieces sitting side by side each keep their own.
          if (this._sameObject(cell, left) || this._sameObject(cell, up)) anchor = false;
        }
        if (anchor) this._drawFacingArrow(ctx, rot | 0, px, py, ts);
      }
    }
  },

  // Draw a conduit/pipe as a connected wire. Arms extend toward orthogonal
  // neighbours holding the SAME def only, so different networks (a pipe vs a power
  // conduit) stay separate and never link. `wireMode` checks the neighbour's wire
  // underlay; otherwise the struct layer. `off` staggers stacked wires so a
  // conduit and a pipe on one cell read as two parallel lines.
  _drawConnectedLine(ctx, id, color, px, py, ts, gx, gy, wireMode, off) {
    off = off || 0;
    const cx = px + ts / 2 + off, cy = py + ts / 2 + off;
    const w = Math.max(2, ts * (wireMode ? 0.14 : 0.20));
    const node = Math.max(3, ts * (wireMode ? 0.26 : 0.34));
    const bp = this.state.blueprints || {};
    const same = (ix, iy) => {
      const c = bp[ix + ',' + iy];
      if (!c) return false;
      return wireMode ? (Array.isArray(c.wires) && c.wires.includes(id)) : (c.struct === id);
    };
    ctx.fillStyle = color;
    ctx.fillRect(cx - node / 2, cy - node / 2, node, node);
    if (gx == null || gy == null) return; // preview - node only
    if (same(gx, gy - 1)) ctx.fillRect(cx - w / 2, py, w, cy - py);              // up
    if (same(gx, gy + 1)) ctx.fillRect(cx - w / 2, cy, w, (py + ts) - cy);       // down
    if (same(gx - 1, gy)) ctx.fillRect(px, cy - w / 2, cx - px, w);             // left
    if (same(gx + 1, gy)) ctx.fillRect(cx, cy - w / 2, (px + ts) - cx, w);      // right
  },

  // Draw a cell's wire underlay - one connected line per wire, staggered so
  // overlapping conduits/pipes are distinguishable.
  _drawWires(ctx, wires, px, py, ts, gx, gy) {
    if (!Array.isArray(wires) || !wires.length) return;
    const n = wires.length;
    wires.forEach((id, i) => {
      const color = this._resolveTileColor(id) || '#c8a23a';
      const off = n > 1 ? (i - (n - 1) / 2) * (ts * 0.18) : 0;
      this._drawConnectedLine(ctx, id, color, px, py, ts, gx, gy, true, off);
    });
  },

  _canvasFullDraw() {
    const canvas = document.getElementById('blueprintCanvas');
    if (!canvas) return;
    const ctx   = canvas.getContext('2d');
    const gw    = this.GRID_W;
    const gh    = this.GRID_H;
    const ts    = canvas.width / gw;
    const light = document.body.classList.contains('light-theme');

    ctx.fillStyle = this._biomeBgColor();
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid lines - batched into single path for performance
    ctx.strokeStyle = light ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let i = 0; i <= gw; i++) {
      const p = i * ts + .25;
      ctx.moveTo(p, 0); ctx.lineTo(p, canvas.height);
    }
    for (let i = 0; i <= gh; i++) {
      const p = i * ts + .25;
      ctx.moveTo(0, p); ctx.lineTo(canvas.width, p);
    }
    ctx.stroke();

    // Guide lines every 11 tiles - batched
    ctx.strokeStyle = 'rgba(232,168,56,0.22)';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    for (let i = 10; i < gw; i += 11) {
      const p = (i + 1) * ts - .5;
      ctx.moveTo(p, 0); ctx.lineTo(p, canvas.height);
    }
    for (let i = 10; i < gh; i += 11) {
      const p = (i + 1) * ts - .5;
      ctx.moveTo(0, p); ctx.lineTo(canvas.width, p);
    }
    ctx.stroke();

    // Perimeter Border - Perfectly box the grid
    ctx.strokeStyle = light ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

    // Painted tiles
    for (const key in this.state.blueprints) {
      const cell = this.state.blueprints[key];
      // Skip truly empty cells - but a cell with ONLY wires/conduits must still draw
      // (otherwise piping on an otherwise-empty canvas is invisible).
      if (!cell.floor && !cell.struct && !(Array.isArray(cell.wires) && cell.wires.length)) continue;
      const [kx, ky] = key.split(',');
      const x = +kx, y = +ky, px = x*ts, py = y*ts;
      const fc = this._resolveTileColor(cell.floor);
      if (fc) { ctx.fillStyle = fc; this._drawShape(ctx, this._resolveShape(cell.floor), px, py, ts, 1); }
      this._drawWires(ctx, cell.wires, px, py, ts, x, y);
      this._drawStructCell(ctx, cell.struct, cell.rot, px, py, ts, x, y);
    }

    // Link multi-cell furniture: outline each object's OUTER edges so its tiles read
    // as ONE piece (a 2x2 bed becomes a single boxed unit instead of four loose
    // squares). Restricted to furniture - walls/floors/wires keep their own look.
    {
      const bpm = this.state.blueprints;
      const furnCache = {};
      const isFurniture = (sid) => {
        if (sid in furnCache) return furnCache[sid];
        const b = (this.allBuildings || []).find(x => x.id === sid);
        const cat = b ? this._buildingCategory(b) : 'Other';
        const ok = !!b && b.layer !== 'floor' && cat !== 'Structure' && cat !== 'Floors' && this._resolveShape(sid) !== 'line';
        return (furnCache[sid] = ok);
      };
      ctx.save();
      ctx.strokeStyle = light ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.6)';
      ctx.lineWidth = Math.max(1.5, ts * 0.05);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const key in bpm) {
        const cell = bpm[key];
        if (!cell.struct || !isFurniture(cell.struct)) continue;
        const ci = key.indexOf(',');
        const x = +key.slice(0, ci), y = +key.slice(ci + 1);
        const up = bpm[x + ',' + (y - 1)], dn = bpm[x + ',' + (y + 1)],
              lf = bpm[(x - 1) + ',' + y], rt = bpm[(x + 1) + ',' + y];
        // only box objects that actually span more than one cell
        if (!(this._sameObject(cell, up) || this._sameObject(cell, dn) || this._sameObject(cell, lf) || this._sameObject(cell, rt))) continue;
        const px = x * ts, py = y * ts, e = Math.max(1, ts * 0.06);
        if (!this._sameObject(cell, up)) { ctx.moveTo(px + e, py + e); ctx.lineTo(px + ts - e, py + e); }
        if (!this._sameObject(cell, dn)) { ctx.moveTo(px + e, py + ts - e); ctx.lineTo(px + ts - e, py + ts - e); }
        if (!this._sameObject(cell, lf)) { ctx.moveTo(px + e, py + e); ctx.lineTo(px + e, py + ts - e); }
        if (!this._sameObject(cell, rt)) { ctx.moveTo(px + ts - e, py + e); ctx.lineTo(px + ts - e, py + ts - e); }
      }
      ctx.stroke();
      ctx.restore();
    }

    // Grid Coordinates Overlay (Task 15)
    if (this.state.showGridCoords) {
      ctx.fillStyle = 'rgba(232,168,56,0.5)';
      ctx.font = `bold ${Math.max(8, Math.floor(ts * 0.4))}px Arial`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (let i = 0; i < gw; i += 11) {
        for (let j = 0; j < gh; j += 11) {
          ctx.fillText(`${i},${j}`, i * ts + 2, j * ts + 2);
        }
      }
    }

    // Hover highlight. Priority:
    //  1. cursor over an existing multi-cell object -> outline the WHOLE piece;
    //  2. an object TOOL with a multi-cell footprint selected -> ghost-preview the
    //     full footprint at the cursor (rotation-aware) so you can aim before placing;
    //  3. otherwise a single-cell highlight.
    if (this._hoverTile && !this._boxStart && this.state.drawMode !== 'stamp_place') {
      const { hx, hy } = this._hoverTile;
      const group = this._objectCellsAt(hx, hy);
      ctx.fillStyle = 'rgba(232,168,56,0.20)';
      ctx.strokeStyle = 'rgba(232,168,56,0.80)';
      ctx.lineWidth = 1.5;
      // footprint of the currently-selected object tool (mirrors _writeTile growth)
      let ghost = null;
      const tool = this.state.activeTool;
      const tb = (this.allBuildings || []).find(bb => bb.id === tool);
      const isObjTool = tb && tb.layer !== 'floor' && !this._isWireId(tool) && !this.state.eraseMode &&
        this.state.drawMode !== 'stamp_select' && this.state.drawMode !== 'cut_select' && this.state.drawMode !== 'grab';
      if (isObjTool) {
        const rot = (this.state.blueprintRot | 0) || 0;
        const base = this._buildingSize(tb);
        const gw = (rot % 2 === 1) ? base[1] : base[0];
        const gh = (rot % 2 === 1) ? base[0] : base[1];
        if (gw > 1 || gh > 1) ghost = { gw, gh, rot };
      }
      if (group && group.length > 1) {
        const inGroup = {};
        group.forEach(([gx, gy]) => { inGroup[gx + ',' + gy] = true; ctx.fillRect(gx * ts + 1, gy * ts + 1, ts - 2, ts - 2); });
        ctx.beginPath(); // single perimeter around the whole object
        group.forEach(([gx, gy]) => {
          const px = gx * ts, py = gy * ts;
          if (!inGroup[gx + ',' + (gy - 1)]) { ctx.moveTo(px + 1, py + 1); ctx.lineTo(px + ts - 1, py + 1); }
          if (!inGroup[gx + ',' + (gy + 1)]) { ctx.moveTo(px + 1, py + ts - 1); ctx.lineTo(px + ts - 1, py + ts - 1); }
          if (!inGroup[(gx - 1) + ',' + gy]) { ctx.moveTo(px + 1, py + 1); ctx.lineTo(px + 1, py + ts - 1); }
          if (!inGroup[(gx + 1) + ',' + gy]) { ctx.moveTo(px + ts - 1, py + 1); ctx.lineTo(px + ts - 1, py + ts - 1); }
        });
        ctx.stroke();
      } else if (ghost) {
        // ghost footprint: fill each cell, outline the bounds, arrow shows facing.
        // Red when it would collide and force-replace is OFF (placement is blocked).
        const blocked = !this.state.bpForceReplace && this._footprintCollides(hx, hy, ghost.gw, ghost.gh);
        if (blocked) { ctx.fillStyle = 'rgba(220,70,70,0.22)'; ctx.strokeStyle = 'rgba(230,80,80,0.95)'; }
        for (let dx = 0; dx < ghost.gw; dx++) for (let dy = 0; dy < ghost.gh; dy++) {
          const cx = hx + dx, cy = hy + dy;
          if (cx >= this.GRID_W || cy >= this.GRID_H) continue;
          ctx.fillRect(cx * ts + 1, cy * ts + 1, ts - 2, ts - 2);
        }
        const ow = Math.min(ghost.gw, this.GRID_W - hx), oh = Math.min(ghost.gh, this.GRID_H - hy);
        ctx.strokeRect(hx * ts + 1, hy * ts + 1, ow * ts - 2, oh * ts - 2);
        if (!blocked && this._drawFacingArrow) this._drawFacingArrow(ctx, ghost.rot, hx * ts, hy * ts, ts);
      } else {
        const hpx = hx * ts, hpy = hy * ts;
        ctx.fillRect(hpx + 1, hpy + 1, ts - 2, ts - 2);
        ctx.strokeRect(hpx + 1, hpy + 1, ts - 2, ts - 2);
      }
    }

    // Box selection
    if (this._boxStart && this._boxEnd) {
      const x1=Math.min(this._boxStart.x,this._boxEnd.x), x2=Math.max(this._boxStart.x,this._boxEnd.x);
      const y1=Math.min(this._boxStart.y,this._boxEnd.y), y2=Math.max(this._boxStart.y,this._boxEnd.y);
      const w = (x2 - x1 + 1);
      const h = (y2 - y1 + 1);
      
      ctx.fillStyle = 'rgba(232,168,56,0.18)';
      ctx.fillRect(x1*ts, y1*ts, w*ts, h*ts);
      ctx.strokeStyle = 'rgba(232,168,56,0.9)'; ctx.lineWidth = 2;
      ctx.strokeRect(x1*ts+1, y1*ts+1, w*ts-2, h*ts-2);

      // Dimensions Text
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      const label = `${w} x ${h}`;
      const lx = (x1 + w/2) * ts;
      const ly = (y1 + h/2) * ts;
      
      // Background for text visibility
      const tw = ctx.measureText(label).width + 8;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(lx - tw/2, ly - 10, tw, 18);
      
      ctx.fillStyle = '#e8a838';
      ctx.fillText(label, lx, ly + 4);
    }

    // Stamp placement ghost preview
    if (this.state.drawMode === 'stamp_place' && this._stampPlacing && this._stampPreview) {
      const sp = this._stampPreview;
      const stamp = this._stampPlacing;
      const ox = sp.x, oy = sp.y;

      // Draw ghost outline of stamp bounds
      ctx.strokeStyle = 'rgba(56, 200, 120, 0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(ox * ts + 1, oy * ts + 1, stamp.w * ts - 2, stamp.h * ts - 2);
      ctx.setLineDash([]);

      // Draw ghost tiles
      ctx.globalAlpha = 0.45;
      Object.keys(stamp.cells).forEach(key => {
        const [cx, cy] = key.split(',').map(Number);
        const px = (ox + cx) * ts, py = (oy + cy) * ts;
        const cell = stamp.cells[key];
        const fc = this._resolveTileColor(cell.floor);
        if (fc) { ctx.fillStyle = fc; this._drawShape(ctx, this._resolveShape(cell.floor), px, py, ts, 1); }
        this._drawWires(ctx, cell.wires, px, py, ts);
        this._drawStructCell(ctx, cell.struct, cell.rot, px, py, ts);
      });
      ctx.globalAlpha = 1.0;

      // Snap indicator lines
      const snapX = ox % 11 === 0, snapY = oy % 11 === 0;
      if (snapX || snapY) {
        ctx.strokeStyle = 'rgba(56, 200, 120, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        if (snapX) { ctx.beginPath(); ctx.moveTo(ox * ts, 0); ctx.lineTo(ox * ts, canvas.height); ctx.stroke(); }
        if (snapY) { ctx.beginPath(); ctx.moveTo(0, oy * ts); ctx.lineTo(canvas.width, oy * ts); ctx.stroke(); }
        ctx.setLineDash([]);
      }

      // Size label
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      const slabel = `${stamp.name} (${stamp.w}×${stamp.h})`;
      const slw = ctx.measureText(slabel).width + 10;
      const slx = (ox + stamp.w / 2) * ts;
      const sly = oy * ts - 12;
      ctx.fillRect(slx - slw / 2, sly - 7, slw, 16);
      ctx.fillStyle = '#38c878';
      ctx.fillText(slabel, slx, sly + 4);
    }

    // Tags / Labels - rendered at their stored x,y positions
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.max(11, Math.floor(ts * 0.6))}px Arial`;

    Object.keys(this.state.roomLabels).forEach(rid => {
      const label = this.state.roomLabels[rid];
      if (!label || label.x === undefined) return;
      
      const cx = (label.x + 0.5) * ts;
      const cy = (label.y + 0.5) * ts;
      const icon = { bedroom:'\ud83d\udecf\ufe0f', barracks:'\ud83e\ude96', kitchen:'\ud83c\udf73', hospital:'\ud83c\udfe5', workshop:'\ud83d\udd28', freezer:'\u2744\ufe0f', storage:'\ud83d\udce6', prison:'\ud83d\udd12', rec_room:'\ud83c\udfae', dining:'\ud83c\udf7d\ufe0f', lab:'\ud83d\udd2c', barn:'\ud83d\udc04', custom:'\u270f\ufe0f' }[label.type] || '\ud83c\udfe0';
      const text = `${icon} ${label.name}`;
      
      // Background pill for readability
      const tw = ctx.measureText(text).width + 12;
      const th = Math.max(16, ts * 0.7);
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.beginPath();
      ctx.roundRect(cx - tw/2, cy - th/2, tw, th, 4);
      ctx.fill();
      
      ctx.strokeStyle = 'rgba(232,168,56,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(cx - tw/2, cy - th/2, tw, th, 4);
      ctx.stroke();
      
      ctx.fillStyle = '#fff';
      ctx.fillText(text, cx, cy);
    });
  },

  // Throttle canvas redraws to one per animation frame (60fps max).
  // Prevents redundant redraws from rapid mouse events.
  _scheduleCanvasRedraw() {
    if (this._canvasRAF) return;
    this._canvasRAF = requestAnimationFrame(() => {
      this._canvasRAF = null;
      this._canvasFullDraw();
    });
  },

  _canvasResizeAndDraw() {
    const canvas = document.getElementById('blueprintCanvas');
    if (!canvas) return;
    const grid = canvas.closest('.blueprint-grid');
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const zoom = this._getCurrentZoom();
    const minTile = this._isWidgetMode() ? 14 : 2;
    // Base tile size fits grid into container; zoom multiplier makes canvas larger → scrollable
    const baseTile = Math.max(minTile, Math.min(rect.width / this.GRID_W, rect.height / this.GRID_H));
    const ts = baseTile * zoom;
    const w = Math.floor(this.GRID_W * ts);
    const h = Math.floor(this.GRID_H * ts);
    canvas.width  = w;
    canvas.height = h;
    // Match CSS display size to buffer so 1 canvas pixel = 1 CSS pixel (no coordinate skew)
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    this._canvasFullDraw();
  },

  _updateBill() {
    const bill = document.getElementById('blueprintBill');
    if (!bill) return;
    const costs = this.calculateBlueprintCosts();
    bill.innerHTML = this.allMaterials.filter(m => costs[m.id]).map(m =>
          `<div class="sum-pill" style="border-color:var(--border-bright); padding:4px 8px; font-size:calc(var(--f-xs) * 0.9)"><span>${_escapeHtml(m.label)}</span>: <strong>${costs[m.id]}</strong></div>`
        ).join('')
      + (Object.keys(costs).length === 0 ? '<div style="font-size:var(--f-xs); color:var(--text3); opacity:0.6">No materials used yet.</div>' : '');
  },


  calculateBlueprintCosts() {
    const totals = {};
    Object.values(this.state.blueprints).forEach(cell => {
      [cell.floor, cell.struct].forEach(bid => {
        if (!bid || bid.startsWith('mat__')) return; // material tiles have no build cost
        const b = this.allBuildings.find(x => x.id === bid);
        if (b && b.costs) {
          Object.entries(b.costs).forEach(([res, amt]) => {
            totals[res] = (totals[res] || 0) + amt;
          });
        }
      });
    });
    return totals;
  },

  recordBlueprintHistory() {
    // Basic snapshot - limit to 20 steps
    const snapshot = JSON.stringify({ 
      blueprints: this.state.blueprints, 
      roomLabels: this.state.roomLabels 
    });
    
    // If we're not at the end of history, truncate future steps
    if (this.blueprintHistoryIdx < this.state.blueprintHistory.length - 1) {
      this.state.blueprintHistory = this.state.blueprintHistory.slice(0, this.blueprintHistoryIdx + 1);
    }
    
    this.state.blueprintHistory.push(snapshot);
    if (this.state.blueprintHistory.length > 200) {
      this.state.blueprintHistory.shift();
    } else {
      this.blueprintHistoryIdx++;
    }
  },

  undo() {
    if (this.blueprintHistoryIdx > 0) {
      this.blueprintHistoryIdx--;
      const state = JSON.parse(this.state.blueprintHistory[this.blueprintHistoryIdx]);
      this.state.blueprints = state.blueprints;
      this.state.roomLabels = state.roomLabels || {};
      this.renderAll();
      this.triggerAutoSave();
    } else {
      this.toast('Nothing to undo');
    }
  },

  redo() {
    if (this.blueprintHistoryIdx < this.state.blueprintHistory.length - 1) {
      this.blueprintHistoryIdx++;
      const state = JSON.parse(this.state.blueprintHistory[this.blueprintHistoryIdx]);
      this.state.blueprints = state.blueprints;
      this.state.roomLabels = state.roomLabels || {};
      this.renderAll();
      this.triggerAutoSave();
    } else {
      this.redoToast = (this.redoToast || 0) + 1; // dummy for state change if needed
      this.toast('Nothing to redo');
    }
  },

  clearBlueprints() {
    this.showConfirm('Clear entire layout?', 'Clear').then(() => {
      this._doClearBlueprints();
    }).catch(() => {});
  },
  _doClearBlueprints() {
    this.recordBlueprintHistory();
    this.state.blueprints = {};
    // Tags and palette swatches (incl. imported) are kept - only the grid clears.
    this._colorCache = {};
    this.renderAll();
    this.triggerAutoSave();
  },

  // Clear only the object (struct) layer, keeping floors and tags.
  clearObjects() {
    this.showConfirm('Delete all objects? Floors and tags are kept.', 'Delete objects')
      .then(() => this._doClearObjects())
      .catch(() => {});
  },
  _doClearObjects() {
    this.recordBlueprintHistory();
    let removed = 0;
    for (const k of Object.keys(this.state.blueprints)) {
      const c = this.state.blueprints[k];
      if (!c || typeof c !== 'object') { delete this.state.blueprints[k]; continue; }
      if (c.struct) { c.struct = null; delete c.rot; removed++; }
      if (Array.isArray(c.wires) && c.wires.length) { removed += c.wires.length; c.wires = []; }
      if (!c.struct && !c.floor && (!c.wires || !c.wires.length)) delete this.state.blueprints[k];
    }
    this._colorCache = {};
    this.renderAll();
    this.triggerAutoSave();
    this.toast(`Deleted ${removed} object(s). Floors and swatches kept.`);
  },

  // Delete everything that came from an import: imported objects + floors on the
  // grid, plus their palette swatches. Anything you drew yourself stays.
  deleteImported() {
    const cb = this.state.customBuildings || {};
    const importedIds = Object.keys(cb).filter(id => cb[id] && cb[id].modSource === 'Imported blueprint');
    if (!importedIds.length) { this.toast('Nothing imported to delete.'); return; }
    this.showConfirm('Delete all imported items (objects, floors and their swatches)? Items you drew yourself are kept.', 'Delete imported')
      .then(() => this._doDeleteImported(new Set(importedIds)))
      .catch(() => {});
  },
  _doDeleteImported(importedIds) {
    this.recordBlueprintHistory();
    let removed = 0;
    for (const k of Object.keys(this.state.blueprints)) {
      const c = this.state.blueprints[k];
      if (!c || typeof c !== 'object') { delete this.state.blueprints[k]; continue; }
      if (c.struct && importedIds.has(c.struct)) { c.struct = null; delete c.rot; removed++; }
      if (c.floor && importedIds.has(c.floor)) { c.floor = null; removed++; }
      if (Array.isArray(c.wires) && c.wires.length) { const b = c.wires.length; c.wires = c.wires.filter(id => !importedIds.has(id)); removed += b - c.wires.length; }
      if (!c.struct && !c.floor && (!c.wires || !c.wires.length)) delete this.state.blueprints[k];
    }
    importedIds.forEach(id => {
      delete this.state.customBuildings[id];
      if (this.state.buildingOverrides) delete this.state.buildingOverrides[id];
    });
    this._refreshCaches();
    this._colorCache = {};
    this.renderAll();
    this.triggerAutoSave();
    this.toast(`Deleted ${removed} imported cell(s) and ${importedIds.size} swatch(es).`);
  },

  // -- TAG FUNCTIONS (general-purpose label placement) --
  openRoomTagModal(x, y) {
    this._pendingRoomTagCoord = { x, y };
    const modal = document.getElementById('roomTagModal');
    const body = document.getElementById('roomTagModalBody');
    if (!modal || !body) return;
    const types = ['bedroom','barracks','kitchen','hospital','workshop','freezer','storage','prison','rec_room','dining','lab','barn','custom'];
    const icons = { bedroom:'\ud83d\udecf\ufe0f', barracks:'\ud83e\ude96', kitchen:'\ud83c\udf73', hospital:'\ud83c\udfe5', workshop:'\ud83d\udd28', freezer:'\u2744\ufe0f', storage:'\ud83d\udce6', prison:'\ud83d\udd12', rec_room:'\ud83c\udfae', dining:'\ud83c\udf7d\ufe0f', lab:'\ud83d\udd2c', barn:'\ud83d\udc04', custom:'\u270f\ufe0f' };
    body.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:14px">
        <div>
          <label style="font-size:var(--f-xs);color:var(--text3);font-weight:700;text-transform:uppercase;display:block;margin-bottom:6px">Label</label>
          <input type="text" id="roomTagName" placeholder="e.g. Master Bedroom, Kill Box, Freezer..." class="skill-input" style="width:100%; text-align:left; padding:8px 12px">
        </div>
        <div>
          <label style="font-size:var(--f-xs);color:var(--text3);font-weight:700;text-transform:uppercase;display:block;margin-bottom:6px">Icon</label>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(100px,1fr)); gap:4px">
            ${types.map(t => `<button class="btn btn-sm room-type-btn" data-type="${t}" onclick="document.querySelectorAll('.room-type-btn').forEach(b=>b.classList.remove('btn-accent'));this.classList.add('btn-accent');document.getElementById('roomTagType').value='${t}'" style="justify-content:center; font-size:calc(var(--f-xs)*0.85)">${icons[t]||'\ud83c\udfe0'} ${t.replace('_',' ')}</button>`).join('')}
          </div>
          <input type="hidden" id="roomTagType" value="custom">
        </div>
        <p style="font-size:var(--f-xs); color:var(--text3); margin:0">Places a label on the canvas at the clicked tile position.</p>
      </div>
    `;
    modal.classList.add('show');
    // Auto-select 'custom' type
    const customBtn = modal.querySelector('[data-type="custom"]');
    if (customBtn) customBtn.classList.add('btn-accent');
    setTimeout(() => document.getElementById('roomTagName')?.focus(), 100);
  },

  closeRoomTagModal() {
    document.getElementById('roomTagModal')?.classList.remove('show');
    this._pendingRoomTagCoord = null;
  },

  submitRoomTag() {
    const name = document.getElementById('roomTagName')?.value.trim();
    const type = document.getElementById('roomTagType')?.value || 'custom';
    if (!name) { this.toast('Enter a label!'); return; }
    const coord = this._pendingRoomTagCoord;
    if (!coord) { this.toast('No tile selected!'); return; }
    this.recordBlueprintHistory();
    const tagId = 'tag_' + Math.random().toString(36).slice(2, 7);
    this.state.roomLabels[tagId] = { name, type, x: coord.x, y: coord.y };
    this.closeRoomTagModal();
    this._canvasFullDraw();
    this.renderBlueprintSidebar();
    this.triggerAutoSave();
    this.toast(`\ud83c\udff7\ufe0f Tagged, ${name}`);
  },

  clearRoomTag(rid) {
    delete this.state.roomLabels[rid];
    this.renderBlueprintSidebar();
    this._canvasFullDraw();
    this.triggerAutoSave();
  },

  calculateRoomStats() {
    const rooms = {}; // roomId -> { area }
    Object.keys(this.state.blueprints).forEach(key => {
      const cell = this.state.blueprints[key];
      if (cell.room) {
        if (!rooms[cell.room]) rooms[cell.room] = { area: 0 };
        rooms[cell.room].area++;
      }
    });
    return rooms;
  },

  _blueprintSidebarHTML() {
    const costs = this.calculateBlueprintCosts();
    const roomStats = this.calculateRoomStats();
    const isWidget = this._isWidgetMode();
    const zoom = this._getCurrentZoom();

    if (isWidget) {
      // Compact toolbar layout for widget mode: icon tool strip + an "easel" row whose
      // Mat/Obj/Bg buttons each open a light palette popup (keeps the toolbar slim).

      // Collapsed: a single slim bar (expand handle + active-tool hint + zoom) so the
      // canvas gets almost the whole widget. Tap "Tools" to bring the toolbar back.
      if (this._bpToolbarCollapsed()) {
        return `
        <div style="display:flex; align-items:center; gap:8px; padding:4px 2px; flex-shrink:0; min-width:0; max-width:100%; box-sizing:border-box; overflow:hidden">
          <button class="btn btn-sm btn-primary" onclick="App.toggleBpToolbar()" title="Show tools" style="padding:4px 8px; font-size:calc(11px * var(--font-scale)); display:flex; align-items:center; gap:5px; flex-shrink:0"><span style="display:inline-block; transform:rotate(-90deg)">&#9662;</span> Tools</button>
          <span style="font-size:calc(9px * var(--font-scale)); color:var(--text3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0">${this._bpWidgetModeHint()}</span>
          <div style="display:flex; align-items:center; gap:4px; flex-shrink:0">
            <span style="font-size:calc(9px * var(--font-scale)); color:var(--text3); font-weight:700">Zoom</span>
            <input type="range" min="0.5" max="2.0" step="0.1" value="${zoom}" oninput="App.updateBlueprintZoom(this.value)" onchange="App.commitBlueprintZoom(this.value)" style="width:46px">
            <span id="zoomPercent" style="font-size:calc(9px * var(--font-scale)); color:var(--accent); font-weight:700">${this._zoomDisplayPercent(zoom)}%</span>
          </div>
        </div>`;
      }

      return `
        <div style="display:flex; flex-direction:column; gap:4px; padding:4px 0; flex-shrink:0; min-width:0; max-width:100%; box-sizing:border-box; overflow:hidden">
          <!-- Tool row -->
          <div style="display:flex; gap:3px; align-items:center; flex-wrap:wrap">
            <button class="btn btn-sm" onclick="App.toggleBpToolbar()" title="Hide toolbar for more canvas" style="padding:4px 7px; font-size:calc(11px * var(--font-scale))"><span style="color:var(--accent)">&#9652;</span></button>
            <button class="btn btn-sm ${this.state.drawMode==='point'?'btn-primary':''}" onclick="App.setDrawMode('point')" style="padding:4px 7px; font-size:calc(11px * var(--font-scale))"><span class="rj-emoji">✏️</span> Draw</button>
            <button class="btn btn-sm ${this.state.drawMode==='box'?'btn-primary':''}" onclick="App.setDrawMode('box')" title="Box Fill" style="padding:4px 7px; font-size:calc(11px * var(--font-scale))">▭ Box</button>
            <button class="btn btn-sm ${this.state.drawMode==='pick'?'btn-primary':''}" onclick="App.setDrawMode('pick')" title="Eyedropper (or Alt+Click)" style="padding:4px 7px; font-size:calc(11px * var(--font-scale))"><span class="rj-emoji">💧</span></button>
            <button class="btn btn-sm ${this.state.drawMode==='grab'||(this.state.drawMode==='stamp_place'&&this._stampPlacing&&this._stampPlacing._grab)?'btn-primary':''}" onclick="App.enterGrabMode()" title="Grab &amp; move an object (Q/E rotate, F flip)" style="padding:4px 7px; font-size:calc(11px * var(--font-scale))"><span class="rj-emoji">🤚</span></button>
            <button class="btn btn-sm ${this.state.drawMode==='cut_select'?'btn-primary':''}" onclick="App.cutSelection()" title="Cut &amp; move (Q/E rotate, F flip)" style="padding:4px 7px; font-size:calc(11px * var(--font-scale))"><span class="rj-emoji">✂️</span></button>
            <button class="btn btn-sm ${this.state.eraseMode?'btn-primary':''}" onclick="App.toggleEraseMode()" title="Toggle erase (RMB always erases)" style="padding:4px 7px; font-size:calc(11px * var(--font-scale)); ${this.state.eraseMode?'background:var(--p4-bg); border-color:var(--p4-txt); color:var(--p4-txt)':''}"><span class="rj-emoji">🧽</span></button>
            <button class="btn btn-sm" onclick="App.rotateBlueprintTool(1)" title="Rotate facing for placed objects (Q left, E right)" style="padding:4px 7px; font-size:calc(11px * var(--font-scale))">&#10227; ${this._facing(this.state.blueprintRot).arrow}</button>
            ${this.state.drawMode === 'stamp_place' ? `<button class="btn btn-sm" onclick="App.flipStamp()" title="Flip the held stamp or selection horizontally (F)" style="padding:4px 7px; font-size:calc(11px * var(--font-scale))">&#8596; Flip</button>` : ''}
            <button class="btn btn-sm ${this.state.drawMode==='stamp_select'?'btn-primary':''}" onclick="App.enterStampSelectMode()" title="Save Stamp" style="padding:4px 7px; font-size:calc(11px * var(--font-scale))">□ Stamp</button>
            <button class="btn btn-sm" onclick="App.undo()" title="Undo" style="padding:4px 7px; font-size:calc(11px * var(--font-scale))">↶</button>
            <button class="btn btn-sm" onclick="App.redo()" title="Redo" style="padding:4px 7px; font-size:calc(11px * var(--font-scale))">↷</button>
            <button class="btn btn-sm" onclick="App.setBlueprintTool('room_tag')" title="Tag" style="padding:4px 7px; font-size:calc(11px * var(--font-scale)); ${this.state.activeTool === 'room_tag' ? 'background:var(--accent-glow); border-color:var(--accent); color:var(--accent)' : ''}">T</button>
            <button class="btn btn-sm" onclick="App.exportBlueprintImage('png')" title="Export PNG" style="padding:4px 7px; font-size:calc(11px * var(--font-scale))">PNG</button>
            <button class="btn btn-sm" onclick="App.clearObjects()" title="Delete all objects (keep floors)" style="padding:4px 7px; font-size:calc(11px * var(--font-scale))">&#9003; Obj</button>
            <button class="btn btn-sm btn-danger" onclick="App.clearBlueprints()" title="Clear everything" style="padding:4px 7px; font-size:calc(11px * var(--font-scale))">✕</button>
            <div style="display:flex; align-items:center; gap:4px; margin-left:auto">
              <span style="font-size:calc(9px * var(--font-scale)); color:var(--text3); font-weight:700">Zoom</span>
              <input type="range" min="0.5" max="2.0" step="0.1" value="${zoom}" oninput="App.updateBlueprintZoom(this.value)" onchange="App.commitBlueprintZoom(this.value)" style="width:50px">
              <span id="zoomPercent" style="font-size:calc(9px * var(--font-scale)); color:var(--accent); font-weight:700">${this._zoomDisplayPercent(zoom)}%</span>
            </div>
          </div>
          <!-- Easel: tap a swatch button to open a light palette popup with every option -->
          <div style="display:flex; gap:5px; align-items:stretch; flex-wrap:wrap">
            ${this._bpEaselButton('mat', 'Mat')}
            ${this._bpEaselButton('obj', 'Obj')}
            ${this._bpEaselButton('bg', 'Bg')}
          </div>
          ${Object.keys(this.state.stamps).length > 0 ? `
          <!-- Saved stamps -->
          <div style="display:flex; gap:3px; align-items:center; flex-wrap:wrap; max-height:96px; overflow-y:auto; scrollbar-width:thin; padding:2px 0; min-width:0; max-width:100%">
            <span style="font-size:calc(8px * var(--font-scale)); color:var(--text3); font-weight:700; flex-shrink:0; text-transform:uppercase">Stp</span>
            ${Object.values(this.state.stamps).map(s => `
              <span style="display:inline-flex; align-items:center; gap:1px; flex-shrink:0">
                <button onclick="App.enterStampPlaceMode('${s.id}')" title="${_escapeHtml(s.name)} (${s.w}×${s.h})" class="btn btn-sm" style="padding:2px 6px; font-size:calc(9px * var(--font-scale)); white-space:nowrap; border-radius:3px 0 0 3px; ${this.state.drawMode === 'stamp_place' && this._stampPlacing?.id === s.id ? 'background:var(--ok-bg); border-color:var(--ok-txt); color:var(--ok-txt)' : ''}">${_escapeHtml(s.name)}</button>
                <button onclick="App.deleteStamp('${s.id}')" title="Delete stamp" class="btn btn-sm" style="padding:2px 4px; font-size:calc(9px * var(--font-scale)); border-radius:0 3px 3px 0; color:var(--warn-txt)">&times;</button>
              </span>
            `).join('')}
          </div>` : ''}
          <!-- Active-tool control hint (always visible, reflects the current tool) -->
          <div style="text-align:center; padding:4px 6px 1px; font-size:calc(8px * var(--font-scale)); color:var(--text3); border-top:1px solid var(--border-med); letter-spacing:0.02em">${this._bpWidgetModeHint()}</div>
        </div>`;
    }

    return `
      <div class="settings-card blueprint-sidebar" style="height:100%; overflow-y:auto; overflow-x:hidden; min-width:0; box-sizing:border-box; display:flex;  flex-direction: column;
  gap: 12px; padding:var(--gap-sm); margin-bottom:0; background:transparent; border:none">
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px; padding:8px 10px; background:var(--surface3); border:1px solid var(--border-med); border-left:3px solid var(--accent); border-radius:8px">
            <div style="min-width:0; flex:1">
              <div style="font-size:calc(var(--f-xs) * 0.72); color:var(--text3); text-transform:uppercase; letter-spacing:0.08em; font-weight:800">Blueprint</div>
              <input type="text" value="${_escapeHtml(this.state.blueprintName || '')}" placeholder="Untitled layout"
                title="Name this blueprint (used as the default export filename)"
                oninput="App.state.blueprintName=this.value; App.triggerAutoSave()"
                onfocus="this.style.borderBottomColor='var(--accent)'" onblur="this.style.borderBottomColor='transparent'"
                style="width:100%; box-sizing:border-box; font-size:var(--f-sm); font-weight:700; color:var(--text); background:transparent; border:none; border-bottom:1px solid transparent; padding:2px 0; outline:none; text-overflow:ellipsis; transition:border-color 0.15s">
            </div>
          </div>
          ${(() => {
            const n = this._defSizes ? Object.keys(this._defSizes).length : 0;
            return `<div style="display:flex; align-items:center; gap:8px; margin-bottom:10px; font-size:calc(var(--f-xs) * 0.85); color:var(--text3)">
              <span title="How many modded objects have a known tile size loaded">Mod tile sizes: <strong style="color:${n ? 'var(--p1-txt)' : 'var(--p4-txt)'}">${n}</strong></span>
              <button class="btn btn-sm" onclick="App.rescanModSizes()" title="Rescan installed mods for real tile sizes (then re-import to apply)" style="margin-left:auto; padding:2px 8px; font-size:calc(var(--f-xs) * 0.8)">Rescan mods</button>
            </div>`;
          })()}
          <div style="display:grid; gap:4px; margin-bottom:12px">
            <div style="display:flex; gap:4px">
              <button class="btn btn-sm" style="flex:1; font-size:calc(var(--f-xs) * 0.8)" onclick="App.exportBlueprintImage('png')" title="Export as PNG">PNG</button>
              <button class="btn btn-sm" style="flex:1; font-size:calc(var(--f-xs) * 0.8)" onclick="App.exportBlueprintImage('jpg')" title="Export as JPG">JPG</button>
              <button class="btn btn-sm" style="flex:1; font-size:calc(var(--f-xs) * 0.8)" onclick="App.copyLayoutToClipboard()">Copy</button>
              <button class="btn btn-sm" style="flex:1; font-size:calc(var(--f-xs) * 0.8)" onclick="App.importLayoutFromJSON()">Import</button>
            </div>
            <div style="display:flex; gap:4px">
              <button class="btn btn-sm btn-accent-soft" style="flex:1; font-size:calc(var(--f-xs) * 0.8)" onclick="App.exportBlueprintXML()" title="Export a .xml the in-game Blueprints mod can load (vanilla items only)">Export Game .xml</button>
              <button class="btn btn-sm btn-accent-soft" style="flex:1; font-size:calc(var(--f-xs) * 0.8)" onclick="App.importBlueprintXML()" title="Import a Blueprints-mod .xml file (modded items become placeholders)">Import Game .xml</button>
            </div>
          </div>
          <div class="section-title">Tools</div>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:6px">
            <button class="btn-tool ${this.state.drawMode==='point' && !this.state.eraseMode?'btn-tool-active':''}" onclick="App.setDrawMode('point')" title="Paint one tile at a time (LMB)">
              <span class="btn-tool-icon rj-emoji">✏️</span>
              <span class="btn-tool-label">Draw</span>
            </button>
            <button class="btn-tool ${this.state.drawMode==='box'?'btn-tool-active':''}" onclick="App.setDrawMode('box')" title="Drag to fill a rectangle">
              <span class="btn-tool-icon">▭</span>
              <span class="btn-tool-label">Box Fill</span>
            </button>
            <button class="btn-tool ${this.state.drawMode==='pick'?'btn-tool-active':''}" onclick="App.setDrawMode('pick')" title="Eyedropper - click a tile to adopt its object (or Alt+Click any time)">
              <span class="btn-tool-icon rj-emoji">💧</span>
              <span class="btn-tool-label">Pick</span>
            </button>
            <button class="btn-tool ${this.state.drawMode==='grab'||(this.state.drawMode==='stamp_place'&&this._stampPlacing&&this._stampPlacing._grab)?'btn-tool-active':''}" onclick="App.enterGrabMode()" title="Grab: click an object to pick it up and move it. Q/E rotate, F flip, right-click to cancel.">
              <span class="btn-tool-icon rj-emoji">🤚</span>
              <span class="btn-tool-label">Grab</span>
            </button>
            <button class="btn-tool ${this.state.drawMode==='cut_select'||(this.state.drawMode==='stamp_place'&&this._stampPlacing&&this._stampPlacing._clipboard&&!this._stampPlacing._grab)?'btn-tool-active':''}" onclick="App.cutSelection()" title="Cut: drag a box to lift those tiles, then click to place them. Q/E rotate, F flip.">
              <span class="btn-tool-icon rj-emoji">✂️</span>
              <span class="btn-tool-label">Cut &amp; Move</span>
            </button>
            ${this.state.drawMode === 'stamp_place' ? `<button class="btn-tool" onclick="App.flipStamp()" title="Flip the held stamp or selection horizontally. East and west facings swap; the footprint mirrors exactly. (F)">
              <span class="btn-tool-icon">&#8596;</span>
              <span class="btn-tool-label">Flip</span>
            </button>` : ''}
            <button class="btn-tool ${this.state.eraseMode?'btn-tool-active':''}" onclick="App.toggleEraseMode()" title="Toggle erase - when on, left-click erases. Right-click always erases." style="${this.state.eraseMode?'border-color:var(--p4-txt); color:var(--p4-txt)':''}">
              <span class="btn-tool-icon rj-emoji">🧽</span>
              <span class="btn-tool-label">Erase</span>
            </button>
            <button class="btn-tool ${this.state.activeTool==='room_tag'?'btn-tool-active':''}" onclick="App.setBlueprintTool('room_tag')" title="Place a room tag/label, then click a tile to drop it">
              <span class="btn-tool-icon rj-emoji">🏷️</span>
              <span class="btn-tool-label">Tag</span>
            </button>
            <button class="btn-tool" onclick="App.undo()" title="Undo last action (Ctrl+Z)">
              <span class="btn-tool-icon">↶</span>
              <span class="btn-tool-label">Undo</span>
            </button>
            <button class="btn-tool" onclick="App.redo()" title="Redo last action (Ctrl+Y)">
              <span class="btn-tool-icon">↷</span>
              <span class="btn-tool-label">Redo</span>
            </button>
          </div>
          ${(() => { const f = this._facing(this.state.blueprintRot); return `
          <button class="btn btn-sm" onclick="App.rotateBlueprintTool(1)" title="Rotate the facing of objects you place (shortcuts: Q left, E right)" style="width:100%; margin-bottom:6px; display:flex; align-items:center; justify-content:center; gap:8px; padding:7px">
            <span style="font-size:calc(var(--f-base) * 1.1)">&#10227;</span>
            <span>Rotate</span>
            <span style="margin-left:4px; padding:1px 8px; border-radius:999px; background:var(--accent-glow); color:var(--accent); font-weight:800; font-size:var(--f-xs)">Facing ${f.arrow} ${f.letter}</span>
          </button>`; })()}
          <div style="display:flex; gap:5px 6px; justify-content:center; flex-wrap:wrap; margin-bottom:8px; font-size:calc(var(--f-xs) * 0.82); color:var(--text3)">
            <span><strong style="color:var(--text2)">LMB</strong> ${this.state.eraseMode ? 'Erase' : 'Draw'}</span>
            <span style="opacity:0.4">|</span>
            <span><strong style="color:var(--text2)">RMB</strong> Erase</span>
            <span style="opacity:0.4">|</span>
            <span><strong style="color:var(--text2)">Q/E</strong> Rotate</span>
            <span style="opacity:0.4">|</span>
            <span><strong style="color:var(--text2)">Ctrl+Scroll</strong> Zoom</span>
            <span style="opacity:0.4">|</span>
            <span><strong style="color:var(--text2)">Mid-drag</strong> Pan</span>
            <span style="opacity:0.4">|</span>
            <span><strong style="color:var(--text2)">Alt+Click</strong> Pick</span>
            <span style="opacity:0.4">|</span>
            <span><strong style="color:var(--text2)">Hover</strong> Identify</span>
          </div>
          <label style="display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:8px; cursor:pointer; font-size:calc(var(--f-xs) * 0.85); color:var(--text2)">
            <input type="checkbox" ${this.state.settings.bpFacingArrows !== false ? 'checked' : ''} onchange="App.toggleFacingArrows()">
            Show facing arrows on objects
          </label>
          <label style="display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:8px; cursor:pointer; font-size:calc(var(--f-xs) * 0.85); color:var(--text2)" title="Off: placing onto an object is blocked (red ghost). On: the new object overwrites whatever it overlaps.">
            <input type="checkbox" ${this.state.bpForceReplace ? 'checked' : ''} onchange="App.toggleForceReplace()">
            Force replace (overwrite objects)
          </label>
          <label style="display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:8px; cursor:pointer; font-size:calc(var(--f-xs) * 0.85); color:var(--text2)" title="On: stamps and cuts snap to the thicker 11-tile gridlines. Off: place them freely, one tile at a time.">
            <input type="checkbox" ${this.state.bpSnapGrid !== false ? 'checked' : ''} onchange="App.toggleBpSnapGrid()">
            Snap to thick gridlines
          </label>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px">
            <button class="btn-tool-clear" onclick="App.clearObjects()" title="Delete every object, keeping floors, swatches and tags">
              <span class="btn-tool-clear-icon">&#9003;</span>
              <span>Delete Objects</span>
            </button>
            <button class="btn-tool-clear" onclick="App.deleteImported()" title="Delete everything that came from an import (objects, floors + their swatches). Items you drew stay.">
              <span class="btn-tool-clear-icon">&#8681;</span>
              <span>Delete Imported</span>
            </button>
            <button class="btn-tool-clear" onclick="App.clearBlueprints()" title="Clear the whole grid (objects + floors). Swatches are kept." style="grid-column:1 / -1">
              <span class="btn-tool-clear-icon">×</span>
              <span>Clear All</span>
            </button>
          </div>
          <div style="display:flex; align-items:center; gap:12px; margin-top:8px; padding:10px 12px; background:var(--surface3); border-radius:var(--radius-sm); border:1px solid var(--border)">
            <span style="font-size:var(--f-xs); color:var(--text3); font-weight:700; text-transform:uppercase; letter-spacing:0.05em; flex-shrink:0">Zoom</span>
            <input type="range" min="1.0" max="4.0" step="0.1" value="${zoom}" oninput="App.updateBlueprintZoom(this.value)" onchange="App.commitBlueprintZoom(this.value)" style="flex:1; min-width:0">
            <span id="zoomPercent" style="font-size:var(--f-xs); color:var(--accent); font-weight:800; min-width:34px; text-align:right">${this._zoomDisplayPercent(zoom)}%</span>
          </div>
        </div>

        <div style="flex:1">
          <div class="section-title">Biome</div>
          <div style="display:grid; grid-template-columns:1fr; gap:6px; margin-bottom:10px">
            ${this.allBiomes.map(b => {
              const col = this._biomeSwatchColor(b.id);
              const isActive = this.state.biome === b.id;
              const bgStyle = (b.id === 'none')
                ? (isActive ? 'background:var(--accent-glow); border-color:var(--accent); color:var(--accent)' : '')
                : `background:${col}22; border-color:${isActive ? col : col + '55'}; color:${isActive ? '#fff' : 'var(--text)'}; ${isActive ? 'box-shadow:inset 0 0 12px ' + col + '44' : ''}`;
              return `
              <div style="display:flex; gap:6px; align-items:center">
                <button class="btn btn-sm" onclick="App.setBiome('${b.id}')"
                  data-biome-btn data-biome-btn-id="${b.id}" data-biome-color="${col || ''}"
                  style="flex:1; justify-content:flex-start; padding:8px 12px; font-size:calc(var(--f-xs) * 0.9); ${bgStyle}">
                  <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${col || 'transparent'};margin-right:6px;flex-shrink:0;border:1px solid ${col ? col + '88' : 'var(--border)'}"></span>
                  ${_escapeHtml(b.icon || '')} ${_escapeHtml(b.label)}
                </button>
                <button class="pawn-del" onclick="App.deleteBiome('${b.id}')" style="width:24px; height:24px">&times;</button>
              </div>`;
            }).join('')}
          </div>
          <button class="btn btn-sm btn-primary" onclick="App.openBiomeEditor()" style="width:100%; padding:8px; font-size:calc(var(--f-xs) * 0.9)">+ Custom BG Colour</button>

          <hr>

          <div class="section-title">Library</div>
          <div style="display:grid; gap:6px; margin-bottom:10px">
            ${Object.values(this.state.prefabs).map(p => `
              <div style="display:flex; gap:6px; align-items:center">
                <button class="btn btn-sm" onclick="App.applyPrefab('${p.id}')" style="flex:1; justify-content:flex-start; padding:8px 12px; font-size:calc(var(--f-xs) * 0.9)"> ${_escapeHtml(p.name)}</button>
                <button class="pawn-del" onclick="App.deletePrefab('${p.id}')" style="width:24px; height:24px">&times;</button>
              </div>
            `).join('')}
            ${Object.keys(this.state.prefabs).length === 0 ? '<div style="font-size:calc(var(--f-xs) * 0.85); color:var(--text3); text-align:center; padding:10px">Empty</div>' : ''}
          </div>
          <button class="btn btn-sm btn-primary" style="width:100%; padding:8px; font-size:calc(var(--f-xs) * 0.9)" onclick="App.saveCurrentAsPrefab()">Save</button>

          <hr>

          <div class="section-title">Stamps</div>
          <div style="display:grid; gap:6px; margin-bottom:10px">
            ${Object.values(this.state.stamps).map(s => `
              <div style="display:flex; gap:6px; align-items:center">
                <button class="btn btn-sm" onclick="App.enterStampPlaceMode('${s.id}')"
                  style="flex:1; justify-content:flex-start; padding:8px 12px; font-size:calc(var(--f-xs) * 0.9); ${this.state.drawMode === 'stamp_place' && this._stampPlacing?.id === s.id ? 'background:var(--ok-bg); border-color:var(--ok-txt); color:var(--ok-txt)' : ''}">
                  <span style="font-size:calc(var(--f-xs) * 0.8); color:var(--text3); margin-right:4px">${s.w}×${s.h}</span> ${_escapeHtml(s.name)}
                </button>
                <button class="pawn-del" onclick="App.deleteStamp('${s.id}')" style="width:24px; height:24px">&times;</button>
              </div>
            `).join('')}
            ${Object.keys(this.state.stamps).length === 0 ? '<div style="font-size:calc(var(--f-xs) * 0.85); color:var(--text3); text-align:center; padding:10px">No stamps yet</div>' : ''}
          </div>
          <button class="btn btn-sm ${this.state.drawMode === 'stamp_select' ? 'btn-primary' : ''}" style="width:100%; padding:8px; font-size:calc(var(--f-xs) * 0.9)" onclick="App.enterStampSelectMode()">Select Area to Stamp</button>

          <hr>

          <div class="section-title" onclick="App.toggleBlueprintMaterials()" style="cursor:pointer; user-select:none; display:flex; align-items:center; gap:6px">
            <span style="display:inline-block; transition:transform 0.15s; transform:rotate(${this._bpMaterialsCollapsed() ? '-90' : '0'}deg); color:var(--accent)">&#9662;</span>
            Materials <span style="opacity:0.45; font-weight:600">(${this.allMaterials.length})</span>
          </div>
          ${this._bpMaterialsCollapsed() ? '' : `
          <div style="display:grid; gap:6px; margin-bottom:10px">
            ${this.allMaterials.map(m => `
              <div style="display:flex; gap:6px; align-items:center">
                <button class="btn btn-sm" onclick="App.setBlueprintTool('mat__${m.id}')"
                  title="${_escapeHtml(m.label)}${m.modSource ? ' ['+m.modSource+']' : ''}"
                  style="flex:1; justify-content:flex-start; padding:8px 12px; font-size:calc(var(--f-xs) * 0.9); border-left:4px solid ${_safeColor(m.color)}; ${this.state.activeTool === 'mat__' + m.id ? 'background:var(--accent-glow); border-color:var(--accent)' : ''}">
                  ${_escapeHtml(m.label)}${_modBadge(m)}
                </button>
                <button class="pawn-del" onclick="App.deleteCustomMaterial('${m.id}')" style="width:24px; height:24px">&times;</button>
              </div>`).join('')}
          </div>
          <button class="btn btn-sm" style="width:100%; padding:8px; font-size:calc(var(--f-xs) * 0.9)" onclick="App.addCustomMaterial()">+ Add</button>
          `}

          <hr>

          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px">
            <div class="section-title" style="margin:0">Objects</div>
            ${(() => {
              const c = this._bpCatCollapsed();
              const cats = this._blueprintCategoriesPresent();
              const allCollapsed = cats.length > 0 && cats.every(cat => c[cat]);
              return `<button class="btn btn-sm" onclick="App.toggleBlueprintCatsAll()" style="padding:2px 8px; font-size:calc(var(--f-xs) * 0.78)">${allCollapsed ? 'Expand All' : 'Collapse All'}</button>`;
            })()}
          </div>
          <div style="display:grid; grid-template-columns:minmax(0,1fr); gap:4px; margin-bottom:10px; min-width:0">
            ${(() => {
              const collapsed = this._bpCatCollapsed();
              const groups = {};
              (this.allBuildings || []).forEach(b => { const c = this._buildingCategory(b); (groups[c] = groups[c] || []).push(b); });
              const cats = this._blueprintCategoriesPresent();
              return cats.map(cat => {
                const isCol = !!collapsed[cat];
                const header = `<div onclick="App.toggleBlueprintCat('${cat.replace(/'/g, "\\'")}')"
                  style="display:flex; align-items:center; gap:6px; cursor:pointer; user-select:none; font-size:calc(var(--f-xs) * 0.78); color:var(--text3); font-weight:800; text-transform:uppercase; letter-spacing:0.06em; margin:8px 0 2px; padding:3px 2px; border-radius:4px">
                  <span style="display:inline-block; transition:transform 0.15s; transform:rotate(${isCol ? '-90' : '0'}deg); color:var(--accent)">&#9662;</span>
                  ${_escapeHtml(cat)} <span style="opacity:0.45">(${groups[cat].length})</span></div>`;
                if (isCol) return header;
                const items = groups[cat].map(b => `
                  <div style="display:flex; gap:4px; align-items:center; min-width:0">
                    <button class="btn btn-sm" onclick="App.setBlueprintTool('${b.id}')"
                      title="${_escapeHtml(b.label)}${b.modSource ? ' [' + b.modSource + ']' : ''}${b.def ? ' • ' + _escapeHtml(b.def) : ''}"
                      style="flex:1 1 0; min-width:0; overflow:hidden; justify-content:flex-start; padding:7px 10px; font-size:calc(var(--f-xs) * 0.9); border-left:4px solid ${_safeColor(b.color)}; ${this.state.activeTool === b.id ? 'background:var(--accent-glow); border-color:var(--accent)' : ''}">
                      <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${_escapeHtml(b.label)}${_modBadge(b)}</span>
                    </button>
                    <input type="color" value="${this._hexForInput(b.color)}" onchange="App.setBuildingColor('${b.id}', this.value)" title="Recolour ${_escapeHtml(b.label)}" style="width:22px; height:22px; flex-shrink:0; padding:0; border:1px solid var(--border-med); border-radius:4px; background:none; cursor:pointer">
                    <select onchange="App.setBuildingShape('${b.id}', this.value)" title="Shape" style="width:56px; flex-shrink:0; font-size:calc(var(--f-xs) * 0.8); padding:2px; cursor:pointer">
                      ${this._shapeOptions(this._resolveShape(b.id))}
                    </select>
                    <button class="pawn-del" onclick="App.deleteCustomBuilding('${b.id}')" style="width:22px; height:22px; flex-shrink:0">&times;</button>
                  </div>`).join('');
                return header + items;
              }).join('');
            })()}
          </div>
          <div style="display:flex; gap:6px">
            <button class="btn btn-sm btn-primary" onclick="App.addCustomBuilding()" style="flex:1; padding:8px; font-size:calc(var(--f-xs) * 0.9)">+ Custom Object</button>
            <button class="btn btn-sm" onclick="App.resetAllShapes()" title="Reset every object shape to square (keeps colours)" style="flex:1; padding:8px; font-size:calc(var(--f-xs) * 0.9)">Reset Shapes</button>
          </div>

          <div style="margin-top:4px; display:flex; flex-direction:column; gap:2px">
            ${Object.keys(this.state.roomLabels).map(rid => {
              const label = this.state.roomLabels[rid];
              const icon  = { bedroom:'Bed', barracks:'Brk', kitchen:'Kit', hospital:'Med', workshop:'Wrk', freezer:'Frz', storage:'Str', prison:'Prs', rec_room:'Rec', dining:'Din', lab:'Lab', barn:'Brn', custom:'Tag' }[label?.type] || 'Room';
              return `<div style="display:flex; align-items:center; justify-content:space-between; padding:6px 10px; background:var(--surface3); border-radius:6px; margin-bottom:2px">
                <span style="font-size:calc(var(--f-xs) * 0.9); font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1">${icon} ${label?.name || '...'}</span>
                <button class="pawn-del" onclick="App.clearRoomTag('${rid}')" style="width:18px; height:18px; font-size:var(--f-xs); margin-left:8px">&times;</button>
              </div>`;
            }).join('')}
          </div>
        </div>

      </div>
    `;
  },

  _blueprintGridHTML() {
    const hide = !this.state.settings.showBiomePatterns ? 'hide-patterns' : '';
    return `<div class="blueprint-grid ${hide} biome-${this.state.biome}" style="width:100%; height:100%; overflow:auto; background:${this._biomeBgColor()}; border-radius:12px; cursor:crosshair; user-select:none; touch-action:none; position:relative" oncontextmenu="event.preventDefault()">
      <canvas id="blueprintCanvas" width="2" height="2" style="display:block; background:${this._biomeBgColor()}"></canvas>
    </div>`;
  },


  attachBlueprintEvents() {
    const canvas = document.getElementById('blueprintCanvas');
    if (!canvas) return;
    this._canvasResizeAndDraw();

    const coords = (e) => {
      const ts   = canvas.width / this.GRID_W;
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(this.GRID_W-1, Math.floor((e.clientX - rect.left) / ts))),
        y: Math.max(0, Math.min(this.GRID_H-1, Math.floor((e.clientY - rect.top) / ts)))
      };
    };

    let painting = false, paintRight = false;
    let strokeRecorded = false;

    // Middle-click pan: grab and scroll the wrapper
    let panning = false, panStartX = 0, panStartY = 0, panScrollX = 0, panScrollY = 0;
    const wrapper = canvas.parentElement;

    canvas.addEventListener('mousedown', (e) => {
      this._hideBlueprintTip();
      if (e.button === 1) {
        e.preventDefault();
        panning = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        panScrollX = wrapper.scrollLeft;
        panScrollY = wrapper.scrollTop;
        canvas.style.cursor = 'grabbing';
        return;
      }

      e.preventDefault();
      const {x, y} = coords(e);

      // Eyedropper: Alt+click (any time) or the dedicated Pick tool adopts the
      // tile's tool. Pick mode is one-shot - it returns to Draw afterwards.
      if (e.button === 0 && (e.altKey || this.state.drawMode === 'pick')) {
        this.pickTileAt(x, y);
        if (this.state.drawMode === 'pick') this.setDrawMode('point');
        return;
      }

      if (this.state.activeTool === 'room_tag' && e.button !== 2) {
        this.openRoomTagModal(x, y);
        return;
      }

      // Stamp place mode: left-click places, right-click cancels
      if (this.state.drawMode === 'stamp_place') {
        if (e.button === 2) { this.cancelStampPlace(); }
        else { this.placeStamp(x, y); }
        return;
      }

      // Grab mode: left-click picks up the object under the cursor (it then becomes a
      // movable stamp). Right-click falls through to erase the object.
      if (this.state.drawMode === 'grab' && e.button !== 2) {
        this.grabObjectAt(x, y);
        return;
      }

      // Right button always erases; left button erases when Erase mode is on.
      painting = true; paintRight = (e.button === 2) || (e.button === 0 && this.state.eraseMode);
      strokeRecorded = false;
      document.body.classList.add('is-painting');
      if (this.state.drawMode === 'box' || this.state.drawMode === 'stamp_select' || this.state.drawMode === 'cut_select') {
        this._boxStart = {x, y, isRight: paintRight};
        this._boxEnd   = {x, y};
      } else {
        // Record history before the first paint of this stroke
        this.recordBlueprintHistory();
        strokeRecorded = true;
        this._hoverTile = null;
        this._writeTile(x, y, paintRight);
        this._scheduleCanvasRedraw();
        this.triggerAutoSave();
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (panning) {
        wrapper.scrollLeft = panScrollX - (e.clientX - panStartX);
        wrapper.scrollTop = panScrollY - (e.clientY - panStartY);
        return;
      }

      const {x, y} = coords(e);

      // Stamp place preview: show ghost outline at cursor. A grabbed object follows
      // the cursor exactly (no snapping); regular stamps snap to the guide lines.
      if (this.state.drawMode === 'stamp_place' && this._stampPlacing) {
        const prev = this._stampPreview;
        const grab = this._stampPlacing._grab;
        const sx = grab ? x : this._snapToGrid(x, 2), sy = grab ? y : this._snapToGrid(y, 2);
        if (!prev || prev.x !== sx || prev.y !== sy) {
          this._stampPreview = { x: sx, y: sy };
          this._scheduleCanvasRedraw();
        }
        return;
      }

      if ((this.state.drawMode === 'box' || this.state.drawMode === 'stamp_select' || this.state.drawMode === 'cut_select') && this._boxStart) {
        this._boxEnd = {x, y};
        // Use rAF-throttled full draw for box preview
        if (!this._boxRAF) {
          this._boxRAF = requestAnimationFrame(() => {
            this._boxRAF = null;
            this._canvasFullDraw();
          });
        }
        return;
      }

      if (painting && this.state.drawMode === 'point') {
        const prev = this._hoverTile;
        if (!prev || prev.hx !== x || prev.hy !== y) {
          this._hoverTile = {hx: x, hy: y};
          this._writeTile(x, y, paintRight);
          this._scheduleCanvasRedraw();
          this.triggerAutoSave();
        }
        return;
      }

      // Hover only - rAF-throttled full redraw (artifact-free) + identify tooltip
      this._showBlueprintTip(e, x, y);
      const prev = this._hoverTile;
      if (!prev || prev.hx !== x || prev.hy !== y) {
        this._hoverTile = {hx: x, hy: y};
        this._scheduleCanvasRedraw();
      }
    });

    canvas.addEventListener('mouseleave', () => {
      if (panning) {
        panning = false;
        canvas.style.cursor = 'crosshair';
      }
      this._hoverTile = null;
      this._stampPreview = null;
      this._hideBlueprintTip();
      this._scheduleCanvasRedraw();
    });

    canvas.addEventListener('mouseup', (e) => {
      if (panning) {
        panning = false;
        canvas.style.cursor = 'crosshair';
        return;
      }
      if (this.state.drawMode === 'stamp_select' && this._boxStart) {
        const x1=Math.min(this._boxStart.x,this._boxEnd.x), x2=Math.max(this._boxStart.x,this._boxEnd.x);
        const y1=Math.min(this._boxStart.y,this._boxEnd.y), y2=Math.max(this._boxStart.y,this._boxEnd.y);
        this._boxStart = null;
        this._boxEnd = null;
        this._canvasFullDraw();
        this.openStampModal(x1, y1, x2, y2);
      } else if (this.state.drawMode === 'cut_select' && this._boxStart) {
        const x1=Math.min(this._boxStart.x,this._boxEnd.x), x2=Math.max(this._boxStart.x,this._boxEnd.x);
        const y1=Math.min(this._boxStart.y,this._boxEnd.y), y2=Math.max(this._boxStart.y,this._boxEnd.y);
        this._boxStart = null;
        this._boxEnd = null;
        this._doCut(x1, y1, x2, y2);
      } else if (this.state.drawMode === 'box' && this._boxStart) {
        // Record history before box fill
        if (!strokeRecorded) this.recordBlueprintHistory();
        const x1=Math.min(this._boxStart.x,this._boxEnd.x), x2=Math.max(this._boxStart.x,this._boxEnd.x);
        const y1=Math.min(this._boxStart.y,this._boxEnd.y), y2=Math.max(this._boxStart.y,this._boxEnd.y);
        for(let ix=x1; ix<=x2; ix++) {
          for(let iy=y1; iy<=y2; iy++) {
            this._writeTile(ix, iy, this._boxStart.isRight);
          }
        }
        this._boxStart = null;
        this._boxEnd = null;
        this._canvasFullDraw();
        this._updateBill();
        this.triggerAutoSave();
      }
      if (painting && this.state.drawMode === 'point') this._updateBill();
      painting = false;
      strokeRecorded = false;
      document.body.classList.remove('is-painting');
    });

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Ctrl + scroll wheel zooms (plain scroll still scrolls the wrapper).
    canvas.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const cur = this._getCurrentZoom();
      const next = Math.max(0.5, Math.min(4.0, Math.round((cur + (e.deltaY < 0 ? 0.1 : -0.1)) * 10) / 10));
      if (next !== cur) this.commitBlueprintZoom(next);
    }, { passive: false });
  },


  _resolveTileColor(bid) {
    if (!bid) return null;
    if (this._colorCache && this._colorCache[bid]) return this._colorCache[bid];

    let color = null;
    if (bid.startsWith('mat__')) {
      const mat = this.allMaterials.find(m => m.id === bid.slice(5));
      color = mat ? mat.color || '#888' : '#888';
    } else {
      const b = this.allBuildings.find(bb => bb.id === bid);
      color = b ? b.color : null;
    }
    
    if (color) {
      if (!this._colorCache) this._colorCache = {};
      this._colorCache[bid] = color;
    }
    return color;
  },

  renderBlueprintSidebar() {
    const container = document.getElementById('view-blue');
    if (!container) return;
    const sidebar = container.querySelector('.settings-card');
    if (!sidebar) { this.renderBlueprint(); return; }
    // Preserve scroll position so tool/room clicks don't jump to top
    const scrollTop = sidebar.scrollTop;
    const tmp = document.createElement('div');
    tmp.innerHTML = this._blueprintSidebarHTML();
    sidebar.replaceWith(tmp.children[0]);
    // Restore scroll after DOM swap
    const newSidebar = container.querySelector('.settings-card');
    if (newSidebar) newSidebar.scrollTop = scrollTop;
    this._updateBill();
  },


  renderBlueprint() {
    const container = document.getElementById('view-blue');
    if (!container) return;
    if (container.style.display === 'none') return;

    // Restore the user's chosen sidebar width (the resizer writes state.bpSidebarWidth);
    // the rebuild would otherwise revert to the 280px CSS default each render.
    const bw = this.state.bpSidebarWidth;
    const layoutCols = (typeof bw === 'number' && bw >= 230 && bw <= 600) ? ` style="grid-template-columns:${bw}px 4px 1fr"` : '';
    container.innerHTML = `
      <div class="blueprint-view-layout" id="blueprintLayout"${layoutCols}>
        ${this._blueprintSidebarHTML()}
        <div class="resizer blueprint-resizer" onmousedown="App.initBlueprintResize(event)" style="width:4px;cursor:col-resize;background:var(--border-med);z-index:10;flex-shrink:0"></div>
        <div class="blueprint-canvas-wrap">
          <div id="blueprintGridSlot"></div>
        </div>
      </div>`;

    const slot = document.getElementById('blueprintGridSlot');
    if (slot) {
      slot.outerHTML = this._blueprintGridHTML();
      this._calculateAdaptiveGrid();
      this.attachBlueprintEvents();
    }
  },


  // -- MATERIAL EDITOR --
  pickSwatchColor(colorInputId, color, el) {
    const input = document.getElementById(colorInputId);
    if (input) input.value = color;
    document.querySelectorAll('.mat-swatch').forEach(s => s.classList.remove('selected'));
    if (el) el.classList.add('selected');
  },
  addCustomMaterial() {
    const modal = document.getElementById('materialModal');
    const header = document.querySelector('#materialModal .modal-title');
    const footer = document.querySelector('#materialModal .modal-footer');
    if (header) header.textContent = 'New Material';
    if (footer) {
      footer.innerHTML = `
        <button class="btn" onclick="App.closeMaterialEditor()">Cancel</button>
        <button class="btn btn-primary" onclick="App.submitNewMaterial()">Add Material</button>
      `;
    }
    modal.classList.add('show');
    const body = document.getElementById('materialModalBody');
    const swatches = this.allMaterials.map(m =>
      `<div class="mat-swatch" title="${_escapeHtml(m.label)}" onclick="App.pickSwatchColor('newMatColor','${_safeColor(m.color)}',this)"
        style="width:28px;height:28px;border-radius:6px;background:${_safeColor(m.color)};cursor:pointer;border:2px solid transparent;transition:all .15s;flex-shrink:0"></div>`
    ).join('');
    body.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:14px">
        <div>
          <label style="font-size:var(--f-xs);color:var(--text3);font-weight:700;text-transform:uppercase;display:block;margin-bottom:6px">Material Name</label>
          <input type="text" id="newMatLabel" placeholder="e.g. Uranium, Jade" class="skill-input" style="width:100%; text-align:left; padding:8px 12px">
        </div>
        <div>
          <label style="font-size:var(--f-xs);color:var(--text3);font-weight:700;text-transform:uppercase;display:block;margin-bottom:6px">Object Colour</label>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <input type="color" id="newMatColor" value="#aaaaaa" style="width:40px;height:32px;border:none;padding:0;background:transparent;cursor:pointer;border-radius:6px">
            <span style="font-size:var(--f-xs);color:var(--text3)">or pick from existing:</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">${swatches}</div>
        </div>
        <div>
          <label style="font-size:var(--f-xs);color:var(--text3);font-weight:700;text-transform:uppercase;display:block;margin-bottom:6px">Mod Source</label>
          <input type="text" id="newMatMod" placeholder="Vanilla (leave blank)" class="skill-input" style="width:100%; text-align:left; padding:8px 12px">
        </div>
        <p style="font-size:var(--f-xs); color:var(--text3); margin:0">New materials appear in your Material Bill and object cost inputs.</p>
      </div>
    `;
    setTimeout(() => document.getElementById('newMatLabel').focus(), 100);
  },
  closeMaterialEditor() { document.getElementById('materialModal').classList.remove('show'); },
  submitNewMaterial() {
    if (!this._checkCap(this.state.customMaterials, 'customMaterials', 'custom materials')) return;
    const label = document.getElementById('newMatLabel').value.trim();
    if (!label) return;
    const id = "mat_" + label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (this.allMaterials.find(m => m.id === id)) { this.toast("Already exists!"); return; }
    const color = _safeColor(document.getElementById('newMatColor')?.value || '#aaaaaa', '#aaaaaa');
    const modSource = (document.getElementById('newMatMod')?.value || '').trim();
    this.state.customMaterials.push({ id, label, color, modSource });
    this._refreshCaches();
    this.closeMaterialEditor();
    this.renderBlueprint();
    this.triggerAutoSave();
    this.toast(` ${label} Added!`);
  },

  submitNewBiome() {
    if (!this._checkCap(this.state.customBiomes, 'customBiomes', 'custom biomes')) return;
    const label = document.getElementById('biomeLabel')?.value.trim();
    if (!label) { this.toast('Enter a name!'); return; }
    const color = document.getElementById('biomeColor')?.value || '#2a3d2a';
    const id = "bio_" + Math.random().toString(36).slice(2, 7);
    this.state.customBiomes.push({ id, label, color, icon: '' });
    this._refreshCaches();
    
    // Restore footer
    const footer = document.querySelector('#materialModal .modal-footer');
    if (footer) footer.innerHTML = `<button class="btn" onclick="App.closeMaterialEditor()">Cancel</button><button class="btn btn-primary" onclick="App.submitNewMaterial()">Add Material</button>`;
    const header = document.querySelector('#materialModal .modal-title');
    if (header) header.textContent = 'New Material';

    this.closeMaterialEditor();
    this.renderBlueprint();
    this.triggerAutoSave();
    this.toast(' ' + label + ' added!');
  },

  // -- WIDGET ADD MATERIAL / OBJECT (toast overlay) --
  showWidgetAddMaterial() {
    const el = document.getElementById('toast');
    if (!el) return;
    clearTimeout(this._toastTimer);
    el.innerHTML = `<div style="display:flex; flex-direction:column; gap:6px; min-width:220px">
      <div style="font-size:calc(10px * var(--font-scale)); font-weight:700; color:var(--accent); text-transform:uppercase">+ New Material</div>
      <input type="text" id="wMatName" placeholder="Name" style="background:var(--surface3); border:1px solid var(--border-med); color:var(--text); padding:4px 8px; border-radius:4px; font-size:calc(11px * var(--font-scale)); font-family:inherit; outline:none">
      <div style="display:flex; align-items:center; gap:6px">
        <input type="color" id="wMatColor" value="#aaaaaa" style="width:28px; height:22px; border:none; padding:0; background:transparent; cursor:pointer; border-radius:3px">
        <span style="font-size:calc(9px * var(--font-scale)); color:var(--text3)">Colour</span>
        <button onclick="App.submitWidgetMaterial()" style="margin-left:auto; background:var(--accent); color:#000; border:none; padding:3px 10px; border-radius:4px; font-weight:700; font-size:calc(10px * var(--font-scale)); cursor:pointer; font-family:inherit">Add</button>
        <button onclick="document.getElementById('toast').classList.remove('show'); if(window.overlay)window.overlay.releaseFocus()" style="background:var(--surface2); color:var(--text2); border:1px solid var(--border-med); padding:3px 8px; border-radius:4px; font-size:calc(10px * var(--font-scale)); cursor:pointer; font-family:inherit">✕</button>
      </div>
    </div>`;
    el.classList.add('show');
    setTimeout(() => { const inp = document.getElementById('wMatName'); if (inp) inp.focus(); }, 100);
  },
  submitWidgetMaterial() {
    if (!this._checkCap(this.state.customMaterials, 'customMaterials', 'custom materials')) return;
    const label = (document.getElementById('wMatName')?.value || '').trim();
    if (!label) return;
    const id = 'mat_' + label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (this.allMaterials.find(m => m.id === id)) { this.toast('Already exists!'); return; }
    const color = _safeColor(document.getElementById('wMatColor')?.value || '#aaaaaa', '#aaaaaa');
    this.state.customMaterials.push({ id, label, color });
    this._refreshCaches();
    if (window.overlay) window.overlay.releaseFocus();
    document.getElementById('toast').classList.remove('show');
    this.renderBlueprint();
    this.triggerAutoSave();
    this.toast(`${label} added!`);
  },

  showWidgetAddObject() {
    const el = document.getElementById('toast');
    if (!el) return;
    clearTimeout(this._toastTimer);
    el.innerHTML = `<div style="display:flex; flex-direction:column; gap:6px; min-width:220px">
      <div style="font-size:calc(10px * var(--font-scale)); font-weight:700; color:var(--accent); text-transform:uppercase">+ New Object</div>
      <input type="text" id="wObjName" placeholder="Name" style="background:var(--surface3); border:1px solid var(--border-med); color:var(--text); padding:4px 8px; border-radius:4px; font-size:calc(11px * var(--font-scale)); font-family:inherit; outline:none">
      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap">
        <input type="color" id="wObjColor" value="#888888" style="width:28px; height:22px; border:none; padding:0; background:transparent; cursor:pointer; border-radius:3px">
        <select id="wObjLayer" style="background:var(--surface3); border:1px solid var(--border-med); color:var(--text); padding:2px 6px; border-radius:4px; font-size:calc(10px * var(--font-scale)); font-family:inherit">
          <option value="struct">Structure</option>
          <option value="floor">Floor</option>
        </select>
        <label style="display:flex; align-items:center; gap:4px; font-size:calc(10px * var(--font-scale)); color:var(--text2); cursor:pointer"><input type="checkbox" id="wObjWire"> Pipe/Conduit</label>
        <button onclick="App.submitWidgetObject()" style="margin-left:auto; background:var(--accent); color:#000; border:none; padding:3px 10px; border-radius:4px; font-weight:700; font-size:calc(10px * var(--font-scale)); cursor:pointer; font-family:inherit">Add</button>
        <button onclick="document.getElementById('toast').classList.remove('show'); if(window.overlay)window.overlay.releaseFocus()" style="background:var(--surface2); color:var(--text2); border:1px solid var(--border-med); padding:3px 8px; border-radius:4px; font-size:calc(10px * var(--font-scale)); cursor:pointer; font-family:inherit">✕</button>
      </div>
    </div>`;
    el.classList.add('show');
    setTimeout(() => { const inp = document.getElementById('wObjName'); if (inp) inp.focus(); }, 100);
  },
  submitWidgetObject() {
    if (!this._checkCap(this.state.customBuildings, 'customBuildings', 'custom buildings')) return;
    const label = (document.getElementById('wObjName')?.value || '').trim();
    if (!label) return;
    const id = 'bld_' + label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (this.allBuildings.find(b => b.id === id)) { this.toast('Already exists!'); return; }
    const color = _safeColor(document.getElementById('wObjColor')?.value || '#888888', '#888888');
    const layer = document.getElementById('wObjLayer')?.value || 'struct';
    const isWire = !!document.getElementById('wObjWire')?.checked;
    if (!this.state.customBuildings || typeof this.state.customBuildings !== 'object' || Array.isArray(this.state.customBuildings)) this.state.customBuildings = {};
    this.state.customBuildings[id] = { id, label, color, layer, shape: isWire ? 'line' : 'square', work: 200, materials: {} };
    this._refreshCaches();
    if (window.overlay) window.overlay.releaseFocus();
    document.getElementById('toast').classList.remove('show');
    this.renderBlueprint();
    this.triggerAutoSave();
    this.toast(`${label} added!`);
  },

  // -- BIOME MANAGEMENT --
  deleteBiome(id) {
    if (id === 'none') { this.toast("Cannot delete 'None'!"); return; }
    const isPreset = BIOMES.some(b => b.id === id);
    if (isPreset) {
      if (!this.state.deletedPresetBiomes.includes(id)) {
        this.state.deletedPresetBiomes.push(id);
      }
    } else {
      this.state.customBiomes = this.state.customBiomes.filter(b => b.id !== id);
    }
    if (this.state.biome === id) this.state.biome = 'none';
    this.renderBlueprintSidebar();
    this._scheduleCanvasRedraw();
    this.triggerAutoSave();
    this.toast(`Biome removed, ${id}`);
  },

  openBiomeEditor() {
    const modal = document.getElementById('biomeModal');
    const body = document.getElementById('biomeModalBody');
    if (!modal || !body) return;
    body.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:20px; padding: 10px">
        <div>
          <label style="font-size:var(--f-xs);color:var(--text3);font-weight:700;text-transform:uppercase;display:block;margin-bottom:8px">Biome Name</label>
          <input type="text" id="biomeName" placeholder="e.g. Volcanic Wasteland" class="skill-input" style="width:100%; text-align:left; padding:10px 14px">
        </div>
        <div>
          <label style="font-size:var(--f-xs);color:var(--text3);font-weight:700;text-transform:uppercase;display:block;margin-bottom:8px">Ground Color</label>
          <input type="color" id="biomeColor" value="#3a4d3a" style="width:100%; height:48px; border:none; border-radius:8px; background:none; cursor:pointer">
        </div>
        <div>
          <label style="font-size:var(--f-xs);color:var(--text3);font-weight:700;text-transform:uppercase;display:block;margin-bottom:8px">Mod Source</label>
          <input type="text" id="biomeMod" placeholder="Vanilla (leave blank)" class="skill-input" style="width:100%; text-align:left; padding:10px 14px">
        </div>
        <p style="font-size:var(--f-xs); color:var(--text3); margin:0; line-height:1.4">Custom biomes allow you to set a unique background color for your blueprints.</p>
      </div>
    `;
    modal.classList.add('show');
    setTimeout(() => document.getElementById('biomeName')?.focus(), 100);
  },

  closeBiomeEditor() {
    document.getElementById('biomeModal')?.classList.remove('show');
  },

  submitNewBiome() {
    const name = document.getElementById('biomeName')?.value.trim();
    const color = document.getElementById('biomeColor')?.value || '#3a4d3a';
    if (!name) { this.toast('Enter a biome name!'); return; }
    const id = "bm_" + Math.random().toString(36).slice(2, 7);
    const modSource = (document.getElementById('biomeMod')?.value || '').trim();
    this.state.customBiomes.push({ id, label: name, color, icon: '', modSource });
    this.closeBiomeEditor();
    this.renderBlueprintSidebar();
    this.triggerAutoSave();
    this.toast(`New Biome, ${name}`);
  },

  // ── RIMWORLD COLOR DEF TO HEX ──────────────────────────────────
  _rimColorToHex(defName) {
    const map = {
      'Red': '#c0392b', 'Red3': '#a93226', 'DarkRed': '#8b0000',
      'Orange': '#e67e22', 'Orange17': '#d35400',
      'Yellow': '#f1c40f', 'Yellow20': '#d4ac0d', 'Yellow22': '#b7950b',
      'Green': '#27ae60', 'Green39': '#229954', 'Green40': '#1e8449', 'Green42': '#196f3d',
      'LightGreen': '#58d68d', 'DarkGreen': '#145a32',
      'Blue': '#2980b9', 'DarkBlue': '#1a5276', 'LightBlue': '#5dade2',
      'Navy': '#1b2631', 'Navy79': '#212f3d', 'Navy81': '#1c2833',
      'Purple': '#8e44ad', 'Purple83': '#7d3c98', 'Purple87': '#6c3483',
      'LightPurple': '#a569bd', 'DarkPurple': '#512e5f',
      'Pink': '#e91e8c', 'Pink97': '#c2185b',
      'Grey': '#7f8c8d', 'Grey113': '#6c7a89', 'Grey117': '#616a6b',
      'LightGrey': '#bdc3c7', 'DarkGrey': '#4d5656',
      'Brown': '#795548', 'DarkBrown': '#4e342e',
      'Olive': '#808000',
      'Sapphire': '#0f52ba',
      'Maritime': '#264348', 'Maritime52': '#1a3c40',
      'White': '#ecf0f1', 'Black': '#1c1c1c',
      'Teal': '#008080', 'Cyan': '#00bcd4', 'Magenta': '#9b59b6',
      'Tan': '#d2b48c', 'Beige': '#f5f5dc', 'Coral': '#ff7f50',
      'Crimson': '#dc143c', 'Indigo': '#4b0082', 'Maroon': '#800000',
    };
    // Direct match
    if (map[defName]) return map[defName];
    // Strip trailing numbers for base color match
    const base = defName.replace(/\d+$/, '');
    if (map[base]) return map[base];
    return null;
  },
});

/**
 * RELATIONS TAB
 * Interactive relationship graph, family tree view, social intelligence panel.
 * Canvas-drawn node graph with physics simulation, colour-coded edges,
 * opinion estimation, romance compatibility, fight risk assessment.
 * Floating draggable drawer for social intel with collapsible sections.
 * Auto-split from app.js - methods are assigned onto the App object.
 */
_assignModule(App, {

  // -- STATE --
  _relNodes: [],       // { id, x, y, vx, vy, pawn, pinned, dragging }
  _relEdges: [],       // { from, to, def, label, colour, category }
  _relSelected: null,  // selected node id
  _relHover: null,     // hovered node id
  _relDrag: null,      // node being dragged
  _relPan: { x: 0, y: 0 },
  _relPanStart: null,
  _relZoom: 1,
  _relView: 'graph',   // 'graph' or 'tree' or 'social'
  _relSimRunning: false,
  _relRAF: null,
  _relDrawerPos: null,  // { x, y } persisted position for the drawer
  _relDrawerSections: { romance: true, fight: true, opinions: true, summary: true, details: true },
  _relRevealed: null,     // Set of unknown ghost node ids the user clicked to reveal
  _relHideUnknown: false, // when true, ALL off-map relatives (known and unknown) are hidden
  _relHideDeceased: false, // when true, deceased pawns/relatives are hidden

  // -- CONSTANTS --
  REL_NODE_RADIUS: 28,
  REL_CATEGORY_COLOURS: {
    romance: '#e85d8a',
    ex:      '#8a5d6d',
    blood:   '#5d8ae8',
    other:   '#e8c85d',
    manual:  '#8ae85d',
  },

  // -- BUILD GRAPH DATA --
  _buildRelationGraph() {
    // Tolerate corrupt/legacy state: pawns must be a real array of identified
    // pawns; relations / ghostPawns / manualRelations may be missing or malformed.
    const allPawns = (Array.isArray(this.state.pawns) ? this.state.pawns : []).filter(p => p && p.id != null);
    const hideDead = this._relHideDeceased;
    const pawns = hideDead ? allPawns.filter(p => !p.dead) : allPawns;
    if (!pawns.length) { this._relNodes = []; this._relEdges = []; return; }

    // Build loadID -> pawn app ID map
    const refToId = {};
    pawns.forEach(p => {
      if (p.loadID) refToId[p.loadID] = p.id;
    });

    // Build ghost pawn map (off-map relatives from worldPawns)
    const ghosts = this.state.ghostPawns || [];
    const ghostById = {};
    ghosts.forEach(g => {
      if (!g || typeof g !== 'object') return;
      // When hide-unknown is on, skip ALL off-map relatives (both the unknown "?" nodes
      // and the named, resolved ones) so neither their nodes nor their edges are built.
      if (this._relHideUnknown) return;
      // When hide-deceased is on, skip dead relatives the same way.
      if (hideDead && g.dead) return;
      if (g.loadID && !refToId[g.loadID]) {
        // Give ghosts a stable ID based on loadID
        const ghostId = 'ghost_' + g.loadID;
        refToId[g.loadID] = ghostId;
        ghostById[ghostId] = g;
      }
    });

    // Build colony nodes - arrange in an ellipse initially, sized to the canvas
    // so the layout starts spread across the available rectangle.
    const totalColony = pawns.length;
    const { w: vpW, h: vpH, cx, cy } = this._relViewport();
    const r = Math.min(250, totalColony * 30);
    const aspect = vpW / vpH;
    const rx = r * Math.max(1, Math.min(1.8, aspect));
    const ry = r * Math.max(1, Math.min(1.8, 1 / aspect));
    const colonyNodes = pawns.map((p, i) => {
      const angle = (i / totalColony) * Math.PI * 2 - Math.PI / 2;
      const existing = this._relNodes.find(n => n.id === p.id);
      return {
        id: p.id,
        x: existing ? existing.x : cx + Math.cos(angle) * rx,
        y: existing ? existing.y : cy + Math.sin(angle) * ry,
        vx: 0, vy: 0,
        pawn: p,
        pinned: existing ? existing.pinned : false,
        dragging: false,
        ghost: false,
      };
    });

    // Build edges from pawn relations (including ghost targets)
    const edges = [];
    const edgeSet = new Set();
    const usedGhostIds = new Set();
    pawns.forEach(p => {
      if (!Array.isArray(p.relations)) return;
      p.relations.forEach(rel => {
        if (!rel || typeof rel !== 'object') return;
        const targetId = refToId[rel.otherPawnRef];
        if (!targetId) return;
        const key = [p.id, targetId].sort().join('|') + '|' + rel.def;
        if (edgeSet.has(key)) return;
        edgeSet.add(key);
        const def = RELATION_DEFS.find(d => d.def === rel.def);
        // Resolve target - could be colony pawn or ghost
        const targetPawn = pawns.find(pp => pp.id === targetId) || ghostById[targetId];
        let label = rel.def;
        if (def) {
          const isFemale = targetPawn && targetPawn.gender === 'Female';
          label = isFemale && def.labelFemale ? def.labelFemale : def.label;
        }
        if (ghostById[targetId]) usedGhostIds.add(targetId);
        edges.push({
          from: p.id,
          to: targetId,
          def: rel.def,
          label: label,
          colour: def ? def.colour : '#888',
          category: def ? def.category : 'other',
          opinion: def ? def.opinion : 0,
          startTicks: rel.startTicks,
          ghost: !!ghostById[targetId],
        });
      });
    });

    // Create ghost nodes for off-map pawns that have edges - on an outer ellipse
    const ghostNodes = [];
    const ghostRx = rx + 120;
    const ghostRy = ry + 120;
    let ghostIdx = 0;
    const ghostCount = usedGhostIds.size || 1;
    for (const gId of usedGhostIds) {
      const g = ghostById[gId];
      if (!g) continue;
      const angle = (ghostIdx / ghostCount) * Math.PI * 2 - Math.PI / 2;
      const existing = this._relNodes.find(n => n.id === gId);
      ghostNodes.push({
        id: gId,
        x: existing ? existing.x : cx + Math.cos(angle) * ghostRx,
        y: existing ? existing.y : cy + Math.sin(angle) * ghostRy,
        vx: 0, vy: 0,
        pawn: g,
        pinned: existing ? existing.pinned : false,
        dragging: false,
        ghost: true,
      });
      ghostIdx++;
    }

    this._relNodes = [...colonyNodes, ...ghostNodes];

    // Also add manually created relations from state
    if (Array.isArray(this.state.manualRelations)) {
      this.state.manualRelations.forEach(mr => {
        if (!mr || typeof mr !== 'object' || mr.from == null || mr.to == null) return;
        const key = [mr.from, mr.to].sort().join('|') + '|' + mr.def;
        if (edgeSet.has(key)) return;
        edgeSet.add(key);
        const def = RELATION_DEFS.find(d => d.def === mr.def);
        const targetPawn = pawns.find(pp => pp.id === mr.to);
        let label = mr.def;
        if (def) {
          const isFemale = targetPawn && targetPawn.gender === 'Female';
          label = isFemale && def.labelFemale ? def.labelFemale : def.label;
        }
        edges.push({
          from: mr.from,
          to: mr.to,
          def: mr.def,
          label: label,
          colour: def ? def.colour : (mr.colour || '#e8c85d'), // custom relations keep their chosen colour
          category: def ? def.category : 'manual',
          opinion: def ? def.opinion : 0,
          startTicks: 0,
          ghost: false,
        });
      });
    }

    // Precompute each edge's arc offset ONCE here, not per draw. It depends only on how
    // many relations share a node pair and this edge's index within that group, both
    // static, so the old per-frame sort/join/indexOf (run for every edge, every frame)
    // was pure waste on the draw hot path.
    const ARC_SPACING = 18;
    const groups = {};
    for (const e of edges) {
      const key = e.from < e.to ? e.from + '|' + e.to : e.to + '|' + e.from;
      (groups[key] = groups[key] || []).push(e);
    }
    for (const key in groups) {
      const g = groups[key];
      for (let i = 0; i < g.length; i++) g[i]._arcOff = (i - (g.length - 1) / 2) * ARC_SPACING;
    }

    this._relEdges = edges;
  },

  // -- PHYSICS SIMULATION --
  // Centre + size of the live canvas (falls back to a sane default before the
  // canvas has been measured). Used so the graph follows the real viewport.
  _relViewport() {
    const canvas = document.getElementById('relCanvas');
    const w = (canvas && canvas.width) || 800;
    const h = (canvas && canvas.height) || 600;
    return { w, h, cx: w / 2, cy: h / 2 };
  },

  _relSimStep() {
    const nodes = this._relNodes;
    const edges = this._relEdges;
    if (!nodes.length) return;

    const repulsion = 8000;
    const attraction = 0.005;
    const idealLen = 160;
    const damping = 0.85;
    const centerPull = 0.002;
    // Centre on the real canvas, and pull more weakly along its longer axis so
    // the graph spreads to fill a wide/tall rectangle instead of a square blob.
    const { w, h, cx, cy } = this._relViewport();
    const pullX = centerPull * Math.min(1, h / w);
    const pullY = centerPull * Math.min(1, w / h);

    // Repulsion between all node pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (!a.pinned && !a.dragging) { a.vx -= fx; a.vy -= fy; }
        if (!b.pinned && !b.dragging) { b.vx += fx; b.vy += fy; }
      }
    }

    // Attraction along edges (O(1) lookups - the find-per-edge version cost O(E*N) per tick)
    const byId = new Map(nodes.map(n => [n.id, n]));
    for (const e of edges) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) continue;
      let dx = b.x - a.x, dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - idealLen) * attraction;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!a.pinned && !a.dragging) { a.vx += fx; a.vy += fy; }
      if (!b.pinned && !b.dragging) { b.vx -= fx; b.vy -= fy; }
    }

    // Gentle pull toward centre
    let totalEnergy = 0;
    for (const n of nodes) {
      if (n.pinned || n.dragging) continue;
      n.vx += (cx - n.x) * pullX;
      n.vy += (cy - n.y) * pullY;
      n.vx *= damping;
      n.vy *= damping;
      n.x += n.vx;
      n.y += n.vy;
      totalEnergy += n.vx * n.vx + n.vy * n.vy;
    }

    // Stop simulation when settled
    if (totalEnergy < 0.1) {
      this._relSimRunning = false;
      return;
    }
  },

  _relStartSim() {
    if (this._relSimRunning) return;
    this._relSimRunning = true;
    const tick = () => {
      if (!this._relSimRunning) return;
      this._relSimStep();
      this._relCanvasDraw();
      this._relRAF = requestAnimationFrame(tick);
    };
    this._relRAF = requestAnimationFrame(tick);
  },

  _relStopSim() {
    this._relSimRunning = false;
    if (this._relRAF) { cancelAnimationFrame(this._relRAF); this._relRAF = null; }
  },

  // Coalesce draw requests to one per display frame. Input events (mousemove while
  // dragging a node, panning, hover checks) can fire at the mouse's polling rate,
  // often 250-1000Hz, and drawing synchronously per event meant several full canvas
  // repaints per 60Hz frame - the drag jank. The sim loop draws directly (already
  // rAF-paced); everything input-driven goes through here.
  _relRequestDraw() {
    if (this._relDrawReq) return;
    this._relDrawReq = requestAnimationFrame(() => {
      this._relDrawReq = null;
      this._relCanvasDraw();
    });
  },

  // -- CANVAS DRAWING --
  _relCanvasDraw() {
    const canvas = document.getElementById('relCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    if (!w || !h) return;
    const light = document.body.classList.contains('light-theme');
    const zoom = this._relZoom;
    const pan = this._relPan;

    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = light ? '#f5f6f8' : '#0e0f11';
    ctx.fillRect(0, 0, w, h);

    ctx.translate(w / 2, h / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-w / 2 + pan.x, -h / 2 + pan.y);

    const nodes = this._relNodes;
    const edges = this._relEdges;
    const sel = this._relSelected;
    const hov = this._relHover;
    const R = this.REL_NODE_RADIUS;

    // Per-frame hot-path helpers: O(1) node lookup instead of nodes.find() per edge,
    // and memoised text widths - measureText is surprisingly costly and label text
    // rarely changes, so cache by font+text (reset if the cache ever balloons).
    const byId = new Map(nodes.map(n => [n.id, n]));
    if (!this._relTextW || this._relTextWCount > 2000) { this._relTextW = {}; this._relTextWCount = 0; }
    const textW = (label) => {
      const k = ctx.font + '|' + label;
      let v = this._relTextW[k];
      if (v === undefined) { v = ctx.measureText(label).width; this._relTextW[k] = v; this._relTextWCount++; }
      return v;
    };

    // Group edges by node pair so multiple relations between the same two pawns
    // fan out as separate curved arcs instead of stacking on one straight line.
    const labelDraws = []; // edge titles, collected here and drawn AFTER the nodes
    const nameTags = [];   // node name-tag rects (AABBs), obstacles for the edge-title relaxation

    // Node ids connected to the selection, built once (O(E)) so the node loop's
    // "is this connected to the selected node?" check is O(1) instead of edges.some()
    // per node (which made selecting/dragging a node O(nodes x edges) per frame).
    let connSet = null;
    if (sel) {
      connSet = new Set([sel]);
      for (const e of edges) {
        if (e.from === sel) connSet.add(e.to);
        else if (e.to === sel) connSet.add(e.from);
      }
    }

    // Draw edges
    for (const e of edges) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) continue;

      const connected = sel && (e.from === sel || e.to === sel);
      const dimmed = sel && !connected;
      const hovered = hov && (e.from === hov || e.to === hov);
      const isGhostEdge = e.ghost;

      // Arc offset precomputed at graph-build time (see _buildRelationGraph).
      const off = e._arcOff || 0;
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len, py = dx / len;            // perpendicular unit vector
      const mx = (a.x + b.x) / 2 + px * off;          // arc midpoint (label anchor)
      const my = (a.y + b.y) / 2 + py * off;
      const cx = (a.x + b.x) / 2 + px * off * 2;       // control pt so arc passes through mid
      const cy = (a.y + b.y) / 2 + py * off * 2;

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      if (off === 0) ctx.lineTo(b.x, b.y);
      else ctx.quadraticCurveTo(cx, cy, b.x, b.y);
      if (dimmed) {
        ctx.strokeStyle = light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
      } else if (isGhostEdge) {
        ctx.strokeStyle = (connected || hovered) ? e.colour + 'aa' : e.colour + '44';
      } else {
        ctx.strokeStyle = (connected || hovered) ? e.colour : e.colour + '88';
      }
      ctx.lineWidth = (connected || hovered) ? 3 : isGhostEdge ? 1 : 1.5;
      if (e.category === 'ex' || isGhostEdge) ctx.setLineDash(isGhostEdge ? [4, 6] : [6, 4]);
      else ctx.setLineDash([]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Defer the edge label to a pass after the nodes, so a node sitting over the arc
      // midpoint can't cover the relation title.
      if (!dimmed) {
        labelDraws.push({ mx, my, label: e.label, colour: e.colour, connected, isGhostEdge });
      }
    }

    // Draw nodes
    for (const n of nodes) {
      const connected = sel && connSet.has(n.id);
      const dimmed = sel && !connected;
      const isHov = hov === n.id;
      const isSel = sel === n.id;
      const isGhost = n.ghost;
      // Unresolved off-map relatives render as a "?" until the user clicks to reveal
      const isUnknown = isGhost && n.pawn && n.pawn.resolved === false;
      const revealed = this._relRevealed && this._relRevealed.has(n.id);
      const showAsQ = isUnknown && !revealed;
      const ghostR = isGhost ? R - 4 : R;

      // Node circle
      ctx.beginPath();
      ctx.arc(n.x, n.y, ghostR, 0, Math.PI * 2);
      if (dimmed) {
        ctx.fillStyle = light ? 'rgba(200,200,200,0.3)' : 'rgba(40,40,40,0.3)';
      } else if (isGhost) {
        // Ghost nodes: hollow with dashed border. Deceased relatives get a muted
        // red wash so they read as "dead", not just "off-map".
        const deadNode = n.pawn && n.pawn.dead;
        ctx.fillStyle = deadNode
          ? (light ? 'rgba(180,80,80,0.16)' : 'rgba(150,55,55,0.32)')
          : (light ? 'rgba(245,246,248,0.4)' : 'rgba(14,15,17,0.4)');
      } else {
        ctx.fillStyle = isSel ? '#e8a838' : (isHov ? (light ? '#e0e0e0' : '#2a2a2a') : (light ? '#fff' : '#1a1a1a'));
      }
      ctx.fill();
      if (isGhost && !dimmed) {
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = light ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = dimmed ? 'transparent' : (isSel ? '#e8a838' : (isHov ? '#e8a838' : (light ? '#ccc' : '#333')));
        ctx.lineWidth = isSel ? 3 : (isHov ? 2 : 1.5);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Gender indicator ring (colony pawns only)
      if (n.pawn.gender && !dimmed && !isGhost) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, R + 3, 0, Math.PI * 2);
        ctx.strokeStyle = n.pawn.gender === 'Female' ? '#e85d8a44' : '#5d8ae844';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Pinned indicator
      if (n.pinned && !dimmed) {
        ctx.beginPath();
        ctx.arc(n.x + ghostR - 4, n.y - ghostR + 4, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#e8a838';
        ctx.fill();
        ctx.font = 'bold 8px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#000';
        ctx.fillText('P', n.x + ghostR - 4, n.y - ghostR + 4);
      }

      // Name label (hidden for unrevealed unknown off-map nodes)
      if (!dimmed && !showAsQ) {
        const name = n.pawn.nickname || n.pawn.name || 'Unknown';
        ctx.font = isGhost ? '11px Arial' : 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const labelY = n.y + ghostR + 4;
        const tw = textW(name) + 8;
        const th = isGhost ? 28 : 16;
        ctx.fillStyle = light ? 'rgba(245,246,248,0.85)' : 'rgba(14,15,17,0.85)';
        ctx.fillRect(n.x - tw / 2, labelY, tw, th);
        // Record the name-tag box so edge titles get nudged off it too (not just the node).
        nameTags.push({ cx: n.x, cy: labelY + th / 2, hw: tw / 2, hh: th / 2 });
        ctx.fillStyle = isGhost ? (light ? '#888' : '#666') : (isSel ? '#e8a838' : (light ? '#222' : '#ddd'));
        ctx.fillText(name, n.x, labelY + 2);
        // Ghost subtitle: deceased relatives say so (dead != off-map); pets noted.
        if (isGhost) {
          const isDead = n.pawn && n.pawn.dead;
          const isAnimal = n.pawn && n.pawn.isAnimal;
          ctx.font = '9px Arial';
          ctx.fillStyle = isDead ? (light ? '#b34a4a' : '#d98a8a') : (light ? '#aaa' : '#555');
          const sub = isDead
            ? (isAnimal ? 'Deceased pet' : 'Deceased')
            : (isAnimal ? 'Off-map pet' : 'Off-map');
          ctx.fillText(sub, n.x, labelY + 15);
        }
      }

      // Status marker (top-left), drawn, no emoji: a small cross for a deceased
      // relative, a hollow ring for a living pet.
      if (isGhost && !dimmed && n.pawn && (n.pawn.dead || n.pawn.isAnimal)) {
        const bx = n.x - ghostR + 3, by = n.y - ghostR + 3;
        ctx.lineWidth = 1.6;
        if (n.pawn.dead) {
          // small plus/cross
          ctx.strokeStyle = light ? '#b33' : '#e88';
          ctx.beginPath();
          ctx.moveTo(bx, by - 3); ctx.lineTo(bx, by + 3);
          ctx.moveTo(bx - 3, by - 1); ctx.lineTo(bx + 3, by - 1);
          ctx.stroke();
        } else {
          // hollow ring = pet
          ctx.strokeStyle = light ? '#777' : '#bbb';
          ctx.beginPath();
          ctx.arc(bx, by, 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Initials inside node ("?" for unrevealed unknown off-map nodes)
      const initials = showAsQ ? '?' : this._relInitials(n.pawn);
      ctx.font = isGhost ? 'bold 11px Arial' : 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = dimmed ? (light ? '#ccc' : '#333') : isGhost ? (light ? '#999' : '#555') : (isSel ? '#000' : (light ? '#333' : '#ddd'));
      ctx.fillText(initials, n.x, n.y);
    }

    // Edge titles last, on top of the nodes. Each pill is given a collision box against the
    // node circles and nudged out of them (a few relaxation passes, like the node-vs-node
    // collisions) so a title can't sit on a colonist's initials.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const LABEL_H = 16, LABEL_PAD = 4; // a little breathing room around the node
    for (const L of labelDraws) {
      ctx.font = `${L.connected ? 'bold ' : ''}11px Arial`;
      L.tw = textW(L.label) + 10;
    }
    // Label-vs-node/name collision relaxation is the single most expensive part of a
    // frame (6 iterations x labels x (nodes + nameTags)). Skip it WHILE actively
    // dragging or panning - labels ride at their edge midpoints for those frames, then
    // settle into their relaxed spots on the next idle draw (mouseup runs the sim, which
    // redraws relaxed). This is what removes the micro-stutters on a dense graph.
    if (!this._relInteracting) {
      for (let iter = 0; iter < 6; iter++) {
        let moved = false;
        for (const L of labelDraws) {
          const halfW = L.tw / 2;
          for (const n of nodes) {
            const dx = L.mx - n.x, dy = L.my - n.y;
            const ox = (halfW + R + LABEL_PAD) - Math.abs(dx);
            const oy = (LABEL_H / 2 + R + LABEL_PAD) - Math.abs(dy);
            if (ox > 0 && oy > 0) {
              // Resolve along the axis of least penetration (AABB-vs-circle approximation).
              if (ox < oy) L.mx += (dx >= 0 ? ox : -ox);
              else L.my += (dy >= 0 ? oy : -oy);
              moved = true;
            }
          }
          // Also nudge titles off the node NAME tags (AABB-vs-AABB), so a relation title
          // can't sit on top of a colonist's name below their node.
          for (const t of nameTags) {
            const dx = L.mx - t.cx, dy = L.my - t.cy;
            const ox = (halfW + t.hw + LABEL_PAD) - Math.abs(dx);
            const oy = (LABEL_H / 2 + t.hh + LABEL_PAD) - Math.abs(dy);
            if (ox > 0 && oy > 0) {
              if (ox < oy) L.mx += (dx >= 0 ? ox : -ox);
              else L.my += (dy >= 0 ? oy : -oy);
              moved = true;
            }
          }
        }
        if (!moved) break;
      }
    }
    for (const L of labelDraws) {
      ctx.font = `${L.connected ? 'bold ' : ''}11px Arial`;
      const tw = L.tw;
      const rx = L.mx - tw / 2, ry = L.my - LABEL_H / 2, rh = LABEL_H, rr = 6;
      // Rounded pill so the title reads as an intentional chip rather than a hard box.
      ctx.beginPath();
      if (ctx.roundRect) { ctx.roundRect(rx, ry, tw, rh, rr); }
      else {
        ctx.moveTo(rx + rr, ry);
        ctx.arcTo(rx + tw, ry, rx + tw, ry + rh, rr);
        ctx.arcTo(rx + tw, ry + rh, rx, ry + rh, rr);
        ctx.arcTo(rx, ry + rh, rx, ry, rr);
        ctx.arcTo(rx, ry, rx + tw, ry, rr);
        ctx.closePath();
      }
      ctx.fillStyle = light ? 'rgba(245,246,248,0.92)' : 'rgba(14,15,17,0.92)';
      ctx.fill();
      ctx.fillStyle = L.isGhostEdge ? (L.colour + 'aa') : L.colour;
      ctx.fillText(L.label, L.mx, L.my);
    }

    ctx.restore();

    // Legend (bottom-left, outside transform)
    this._relDrawLegend(ctx, w, h, light);

    // Stats badge (top-left)
    const nCount = nodes.length;
    const eCount = edges.length;
    if (nCount > 0) {
      ctx.font = '11px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.25)';
      ctx.fillText(`${nCount} pawns - ${eCount} relation${eCount !== 1 ? 's' : ''}`, 12, 12);
    }
  },

  _relInitials(pawn) {
    const first = pawn.firstName || pawn.nickname || pawn.name || '?';
    const last = pawn.lastName || '';
    if (last) return (first[0] + last[0]).toUpperCase();
    return first.slice(0, 2).toUpperCase();
  },

  _relDrawLegend(ctx, w, h, light) {
    const cats = [
      { label: 'Romance', colour: '#e85d8a' },
      { label: 'Ex', colour: '#8a5d6d' },
      { label: 'Blood', colour: '#5d8ae8' },
      { label: 'Other', colour: '#e8c85d' },
    ];
    // Custom / manual relations: one legend entry per unique title + colour, so the
    // legend adapts to whatever titles and colours the user has created.
    const seenCustom = new Set();
    this._relEdges.filter(e => e.category === 'manual').forEach(e => {
      const k = e.label + '|' + e.colour;
      if (seenCustom.has(k)) return;
      seenCustom.add(k);
      cats.push({ label: e.label, colour: e.colour });
    });
    const hasGhost = this._relNodes.some(n => n.ghost);
    if (hasGhost) {
      cats.push({ label: 'Off-map', colour: '#888', dashed: true });
    }
    if (this._relNodes.some(n => n.ghost && n.pawn && n.pawn.dead)) {
      cats.push({ label: 'Deceased', colour: '#c66', dashed: true });
    }
    const lx = 12, ly = h - 12 - cats.length * 18;
    ctx.font = '11px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    cats.forEach((c, i) => {
      const y = ly + i * 18;
      if (c.dashed) {
        // Dashed line swatch to match ghost edge styling
        ctx.strokeStyle = c.colour;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(lx, y);
        ctx.lineTo(lx + 12, y);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = c.colour;
        ctx.fillRect(lx, y - 4, 12, 8);
      }
      ctx.fillStyle = light ? '#333' : '#ccc';
      ctx.fillText(c.label, lx + 18, y);
    });
  },

  // Kinetic pan: after a flick-release of the canvas, glide the view along the release
  // velocity and ease to a stop. Cancelled the moment the user grabs again.
  _relStartPanMomentum() {
    const v = this._relPanVel;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const fresh = this._relPanVelT && (now - this._relPanVelT) < 90;
    this._relPanVel = { x: 0, y: 0 };
    if (!fresh || !v || Math.hypot(v.x, v.y) < 0.6) return; // a still / tiny release just stops
    let vx = v.x, vy = v.y;
    const damping = 0.92;
    if (this._relPanMomentum) cancelAnimationFrame(this._relPanMomentum);
    const step = () => {
      this._relPan.x += vx;
      this._relPan.y += vy;
      vx *= damping; vy *= damping;
      this._relCanvasDraw();
      if (Math.hypot(vx, vy) > 0.15) {
        this._relPanMomentum = requestAnimationFrame(step);
      } else {
        this._relPanMomentum = null;
      }
    };
    this._relPanMomentum = requestAnimationFrame(step);
  },

  // -- CANVAS EVENTS --
  _relAttachEvents() {
    const canvas = document.getElementById('relCanvas');
    if (!canvas) return;

    const hitTest = (mx, my) => {
      const rect = canvas.getBoundingClientRect();
      const w = canvas.width, h = canvas.height;
      const zoom = this._relZoom;
      const pan = this._relPan;
      const cx = ((mx - rect.left) - w / 2) / zoom + w / 2 - pan.x;
      const cy = ((my - rect.top) - h / 2) / zoom + h / 2 - pan.y;
      const R = this.REL_NODE_RADIUS;
      for (const n of this._relNodes) {
        const dx = cx - n.x, dy = cy - n.y;
        if (dx * dx + dy * dy <= R * R) return n;
      }
      return null;
    };

    let dragNode = null, panStart = null, panScrollStart = null, didDrag = false;

    canvas.addEventListener('mousedown', (e) => {
      didDrag = false;
      // Grabbing again stops any in-progress kinetic pan glide.
      if (this._relPanMomentum) { cancelAnimationFrame(this._relPanMomentum); this._relPanMomentum = null; }
      this._relPanVel = { x: 0, y: 0 };
      if (e.button === 1 || e.button === 2) {
        // Middle or right click pan
        e.preventDefault();
        panStart = { x: e.clientX, y: e.clientY };
        panScrollStart = { ...this._relPan };
        this._relInteracting = true; // defer label relaxation while panning
        canvas.style.cursor = 'grabbing';
        return;
      }
      const node = hitTest(e.clientX, e.clientY);
      if (e.button === 0 && node) {
        // Click an unrevealed unknown off-map node to reveal it
        if (node.ghost && node.pawn && node.pawn.resolved === false) {
          if (!this._relRevealed) this._relRevealed = new Set();
          this._relRevealed.add(node.id);
        }
        dragNode = node;
        node.dragging = true;
        this._relInteracting = true; // defer label relaxation while dragging a node
        this._relSelected = node.id;
        this._relCanvasDraw();
        this._relRenderDrawer();
        canvas.style.cursor = 'grabbing';
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (panStart && !dragNode) {
        didDrag = true;
        const nx = panScrollStart.x + (e.clientX - panStart.x) / this._relZoom;
        const ny = panScrollStart.y + (e.clientY - panStart.y) / this._relZoom;
        // Smoothed pan velocity so a flick on release glides the view (kinetic pan).
        const dvx = nx - this._relPan.x, dvy = ny - this._relPan.y;
        const pv = this._relPanVel || { x: 0, y: 0 };
        this._relPanVel = { x: 0.8 * dvx + 0.2 * pv.x, y: 0.8 * dvy + 0.2 * pv.y };
        this._relPanVelT = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        this._relPan.x = nx;
        this._relPan.y = ny;
        this._relRequestDraw();
        return;
      }
      if (dragNode) {
        didDrag = true;
        const rect = canvas.getBoundingClientRect();
        const w = canvas.width, h = canvas.height;
        const zoom = this._relZoom;
        const pan = this._relPan;
        const nx = ((e.clientX - rect.left) - w / 2) / zoom + w / 2 - pan.x;
        const ny = ((e.clientY - rect.top) - h / 2) / zoom + h / 2 - pan.y;
        // Track a smoothed drag velocity so a flick on release carries momentum (slide).
        const dx = nx - dragNode.x, dy = ny - dragNode.y;
        dragNode._tvx = 0.7 * dx + 0.3 * (dragNode._tvx || 0);
        dragNode._tvy = 0.7 * dy + 0.3 * (dragNode._tvy || 0);
        dragNode._tvt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        dragNode.x = nx;
        dragNode.y = ny;
        this._relRequestDraw();
        return;
      }
      const node = hitTest(e.clientX, e.clientY);
      const newHov = node ? node.id : null;
      if (newHov !== this._relHover) {
        this._relHover = newHov;
        canvas.style.cursor = node ? 'pointer' : 'default';
        this._relRequestDraw();
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      // Interaction over: re-enable label relaxation so the next draw settles labels.
      this._relInteracting = false;
      if (panStart && !dragNode) {
        panStart = null;
        canvas.style.cursor = 'default';
        this._relStartPanMomentum();
        return;
      }
      if (dragNode) {
        // If released while still moving, hand the node its momentum so it slides and
        // decelerates (the sim's damping does the easing). A still release just stops.
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const fresh = dragNode._tvt && (now - dragNode._tvt) < 90;
        const MAX = 60;
        const clamp = (v) => Math.max(-MAX, Math.min(MAX, v || 0));
        dragNode.vx = fresh ? clamp(dragNode._tvx) : 0;
        dragNode.vy = fresh ? clamp(dragNode._tvy) : 0;
        dragNode._tvx = dragNode._tvy = 0;
        dragNode.dragging = false;
        dragNode = null;
        panStart = null;
        canvas.style.cursor = 'default';
        this._relStartSim();
        return;
      }
      // Left click on empty space without dragging - deselect
      if (e.button === 0 && !didDrag) {
        this._relSelected = null;
        this._relCanvasDraw();
        this._relRenderDrawer();
      }
    });

    canvas.addEventListener('mouseleave', () => {
      this._relHover = null;
      this._relInteracting = false;
      if (dragNode) { dragNode.dragging = false; dragNode = null; }
      panStart = null;
      canvas.style.cursor = 'default';
      this._relCanvasDraw();
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      this._relZoom = Math.max(0.3, Math.min(3, this._relZoom + delta));
      this._relRequestDraw();
    });

    canvas.addEventListener('dblclick', (e) => {
      const node = hitTest(e.clientX, e.clientY);
      if (node) {
        node.pinned = !node.pinned;
        this._relCanvasDraw();
      }
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  // -- SOCIAL INTELLIGENCE --
  // Estimate opinion offset between two pawns based on relations and traits
  _estimateOpinion(fromPawn, toPawn) {
    let opinion = 0;

    // Relation-based opinion
    if (fromPawn.relations) {
      const refToId = {};
      this.state.pawns.forEach(p => { if (p.loadID) refToId[p.loadID] = p.id; });
      fromPawn.relations.forEach(r => {
        if (refToId[r.otherPawnRef] === toPawn.id) {
          const def = RELATION_DEFS.find(d => d.def === r.def);
          if (def) opinion += def.opinion;
        }
      });
    }

    // Trait-based situational opinion (the OTHER pawn's traits affect how the observer feels)
    if (toPawn.traits && toPawn.traits.length) {
      const fromTraitIds = (fromPawn.traits || []).map(t => typeof t === 'string' ? t : (t.def || t.id || '').toLowerCase());
      const isFromKind = fromTraitIds.includes('kind');

      toPawn.traits.forEach(t => {
        const tDef = typeof t === 'string' ? t : (t.def || t.id || '');
        const tDegree = typeof t === 'object' ? (t.degree || 0) : 0;
        const tLower = tDef.toLowerCase();

        TRAIT_OPINION_EFFECTS.forEach(eff => {
          if (eff.traitDef.toLowerCase() === tLower) {
            if (eff.degree !== undefined && eff.degree !== tDegree) return;
            // Kind nullifies ugly opinion
            if ((tLower === 'beauty' && tDegree < 0) && isFromKind) return;
            opinion += eff.opinion;
          }
        });
      });
    }

    return Math.max(-100, Math.min(100, opinion));
  },

  // Estimate romance compatibility (simplified SecondaryLovinChanceFactor)
  _estimateRomanceChance(pawnA, pawnB) {
    // Gather orientation signals from genes (vanilla Biotech) and traits (fallback)
    const genesA = (pawnA.geneDefIds || []).map(g => g.toLowerCase());
    const genesB = (pawnB.geneDefIds || []).map(g => g.toLowerCase());
    const traitsA = (pawnA.traits || []).map(t => (typeof t === 'string' ? t : (t.def || t.id || '')).toLowerCase());
    const traitsB = (pawnB.traits || []).map(t => (typeof t === 'string' ? t : (t.def || t.id || '')).toLowerCase());

    // Check both genes and traits for orientation (genes are vanilla, traits may come from mods)
    const hasTag = (genes, traits, tag) => genes.includes(tag) || traits.includes(tag);

    if (hasTag(genesA, traitsA, 'asexual') || hasTag(genesB, traitsB, 'asexual')) return 0;

    const gA = pawnA.gender, gB = pawnB.gender;
    if (!gA || !gB) return 0.5; // Unknown gender, can't assess

    const sameGender = gA === gB;
    // Check orientation compatibility
    const biA = hasTag(genesA, traitsA, 'bisexual'), gayA = hasTag(genesA, traitsA, 'gay');
    const biB = hasTag(genesB, traitsB, 'bisexual'), gayB = hasTag(genesB, traitsB, 'gay');
    if (!biA && !gayA && sameGender) return 0;
    if (!biA && gayA && !sameGender) return 0;
    if (!biB && !gayB && sameGender) return 0;
    if (!biB && gayB && !sameGender) return 0;

    let factor = 1;

    // Age factor (simplified)
    if (pawnA.bioAge && pawnB.bioAge) {
      const diff = Math.abs(pawnA.bioAge - pawnB.bioAge);
      if (diff > 20) factor *= 0.3;
      else if (diff > 10) factor *= 0.6;
    }

    // Beauty factor
    const beautyB = traitsB.find(t => t === 'beautiful' || t === 'pretty');
    const uglyB = traitsB.find(t => t === 'ugly' || t === 'staggeringly_ugly');
    if (beautyB) factor *= 2.3;
    if (uglyB) factor *= 0.3;

    // Existing family relations kill romance
    if (pawnA.relations) {
      const refToId = {};
      this.state.pawns.forEach(p => { if (p.loadID) refToId[p.loadID] = p.id; });
      for (const r of pawnA.relations) {
        if (refToId[r.otherPawnRef] === pawnB.id) {
          const def = RELATION_DEFS.find(d => d.def === r.def);
          if (def && def.romanceFactor > 0 && def.romanceFactor < 0.1) return 0; // family
        }
      }
    }

    return Math.min(1, factor);
  },

  // Estimate social fight chance
  _estimateFightRisk(pawnA, pawnB) {
    const opinion = this._estimateOpinion(pawnA, pawnB);
    let base = 0.04; // base from Chitchat interaction

    // Opinion modifier
    if (opinion < 0) {
      base *= 1 + (-opinion / 100) * 3; // up to 4x at -100
    } else {
      base *= Math.max(0.6, 1 - (opinion / 100) * 0.4); // down to 0.6x at +100
    }

    // Trait multipliers
    const traitsA = (pawnA.traits || []).map(t => (typeof t === 'string' ? t : (t.def || t.id || '')));
    traitsA.forEach(tId => {
      const key = Object.keys(TRAIT_FIGHT_FACTORS).find(k => k.toLowerCase() === tId.toLowerCase());
      if (key) base *= TRAIT_FIGHT_FACTORS[key];
    });

    return Math.min(1, Math.max(0, base));
  },

  // -- FLOATING DRAWER --
  _relToggleSection(key) {
    this._relDrawerSections[key] = !this._relDrawerSections[key];
    this._relRenderDrawer();
  },

  _relSectionHeader(key, label, colour, icon) {
    const open = this._relDrawerSections[key];
    return `<div onclick="App._relToggleSection('${key}')" style="display:flex; align-items:center; gap:6px; padding:8px 12px; cursor:pointer; user-select:none; border-bottom:1px solid var(--border)">
      <span style="font-size:10px; color:var(--text3); transition:transform 0.2s; transform:rotate(${open ? '90' : '0'}deg)">&#9654;</span>
      <span style="font-size:11px; font-weight:800; color:${colour}; letter-spacing:0.04em; text-transform:uppercase">${icon ? icon + ' ' : ''}${label}</span>
    </div>`;
  },

  _relRenderDrawer() {
    const drawer = document.getElementById('relDrawer');
    if (!drawer) return;

    const pawns = this.state.pawns;
    const sec = this._relDrawerSections;
    let html = '';

    // If a node is selected, show its details first. Ghost (off-map) nodes get their
    // own panel - previously selecting one showed nothing at all.
    if (this._relSelected) {
      const pawn = pawns.find(p => p.id === this._relSelected);
      if (pawn) {
        html += this._relSectionHeader('details', pawn.nickname || pawn.name || 'Pawn', '#e8a838', '');
        if (sec.details) {
          html += this._relBuildPawnDetails(pawn);
        }
      } else {
        const gNode = (this._relNodes || []).find(n => n.id === this._relSelected && n.ghost);
        if (gNode && gNode.pawn) {
          const g = gNode.pawn;
          const title = g.resolved === false ? 'Unknown relative' : (g.nickname || g.name || 'Unknown');
          html += this._relSectionHeader('details', title, '#e8a838', '');
          if (sec.details) {
            html += this._relBuildGhostDetails(gNode);
          }
        }
      }
    }

    // Romance compatibility
    html += this._relSectionHeader('romance', 'Romance Compatibility', '#e85d8a', '');
    if (sec.romance && pawns.length >= 2) {
      html += this._relBuildRomanceSection(pawns);
    }

    // Fight risk
    html += this._relSectionHeader('fight', 'Fight Risk', '#e8a838', '');
    if (sec.fight && pawns.length >= 2) {
      html += this._relBuildFightSection(pawns);
    }

    // Colony opinions: who thinks what of whom, across everyone
    html += this._relSectionHeader('opinions', 'Colony Opinions', '#8a5de8', '');
    if (sec.opinions && pawns.length >= 2) {
      html += this._relBuildColonyOpinions(pawns);
    }

    // Summary pills
    html += this._relSectionHeader('summary', 'Summary', '#5d8ae8', '');
    if (sec.summary) {
      html += this._relBuildSummarySection();
    }

    drawer.querySelector('.rel-drawer-body').innerHTML = html;
  },

  // Colony-wide opinion overview: estimate every colonist's opinion of every other and
  // surface the strongest regard and the strongest rivalries (directed, A thinks of B).
  _relBuildColonyOpinions(pawns) {
    const list = (pawns || []).filter(p => p && p.id != null);
    if (list.length < 2) return '<div style="font-size:var(--f-xs); color:var(--text3); text-align:center; padding:8px">Need at least two colonists.</div>';
    const nameOf = (p) => p.nickname || p.name || 'Unknown';
    const pairs = [];
    for (const a of list) for (const b of list) {
      if (a.id === b.id) continue;
      pairs.push({ a, b, op: this._estimateOpinion(a, b) });
    }
    const positive = pairs.filter(p => p.op > 0).sort((x, y) => y.op - x.op).slice(0, 8);
    const negative = pairs.filter(p => p.op < 0).sort((x, y) => x.op - y.op).slice(0, 8);
    const row = (pr) => {
      const c = pr.op > 0 ? 'var(--ok-txt)' : 'var(--p4-txt)';
      return `<div style="display:flex; align-items:center; gap:5px; padding:2px 8px; font-size:var(--f-xs)">
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1">${_escapeHtml(nameOf(pr.a))} <span style="color:var(--text3)">&rarr;</span> ${_escapeHtml(nameOf(pr.b))}</span>
        <span style="color:${c}; font-weight:700; flex-shrink:0">${pr.op > 0 ? '+' : ''}${pr.op}</span>
      </div>`;
    };
    const none = '<div style="font-size:var(--f-xs); color:var(--text3); padding:2px 8px">None notable.</div>';
    return '<div style="padding:6px 4px">'
      + '<div style="font-size:10px; font-weight:700; color:var(--ok-txt); text-transform:uppercase; letter-spacing:0.04em; padding:0 8px 3px">Best regard</div>'
      + (positive.length ? positive.map(row).join('') : none)
      + '<div style="font-size:10px; font-weight:700; color:var(--p4-txt); text-transform:uppercase; letter-spacing:0.04em; padding:6px 8px 3px">Worst regard</div>'
      + (negative.length ? negative.map(row).join('') : none)
      + '</div>';
  },

  // Detail panel for an off-map (ghost) relative: who they are, their status, and which
  // colonists they connect to. Unresolved ghosts get an explanation - RimWorld's world
  // pawn garbage collector prunes distant relatives, so their names are genuinely not
  // stored anywhere in the save.
  _relBuildGhostDetails(node) {
    const g = node.pawn;
    let html = '<div style="padding:8px 12px">';

    const infoParts = [];
    if (g.gender) infoParts.push(g.gender);
    if (g.isAnimal && g.raceDef) infoParts.push(g.raceDef);
    infoParts.push(g.dead ? 'Deceased' : 'Off-map');
    if (g.factionName) infoParts.push(g.factionName);
    html += '<div style="font-size:var(--f-xs); color:var(--text3); margin-bottom:8px">' + _escapeHtml(infoParts.join(' - ')) + '</div>';

    if (g.resolved === false) {
      html += '<div style="font-size:10px; color:var(--text3); line-height:1.5; margin-bottom:8px; padding:5px 8px; background:var(--surface2); border-radius:5px; border-left:2px solid var(--border-med)">RimWorld periodically prunes distant relatives from the save to keep it small, so this pawn\'s name is genuinely not stored anywhere - the game itself no longer knows it. Only the relationship reference survives.</div>';
    }

    // Edges are built from the colonist's relation entries, so the label describes the
    // ghost (the target) - phrase rows as "Mother of <colonist>" to keep that reading.
    const connections = (this._relEdges || []).filter(e => e.from === node.id || e.to === node.id);
    if (connections.length > 0) {
      connections.forEach(e => {
        const otherId = e.from === node.id ? e.to : e.from;
        const other = this.state.pawns.find(p => p.id === otherId);
        if (!other) return;
        const otherName = other.nickname || other.name || 'Unknown';
        html += `<div style="display:flex; align-items:center; gap:6px; padding:5px 8px; background:var(--surface2); border-radius:5px; margin-bottom:3px; border-left:3px solid ${e.colour}; font-size:var(--f-xs)">
          <span style="color:${e.colour}; font-weight:600">${_escapeHtml(e.label)}</span>
          <span style="color:var(--text3)">of</span>
          <span style="font-weight:700; color:var(--text)">${_escapeHtml(otherName)}</span>
        </div>`;
      });
    } else {
      html += '<div style="font-size:var(--f-xs); color:var(--text3); text-align:center; padding:6px">No connections.</div>';
    }

    html += '</div>';
    return html;
  },

  _relBuildPawnDetails(pawn) {
    const connections = this._relEdges.filter(e => e.from === pawn.id || e.to === pawn.id);
    const name = pawn.nickname || pawn.name || 'Unknown';

    let html = '<div style="padding:8px 12px">';

    // Basic info
    const infoParts = [];
    if (pawn.gender) infoParts.push(pawn.gender);
    if (pawn.bioAge) infoParts.push('Age ' + pawn.bioAge);
    if (pawn.xenotype && pawn.xenotype !== 'baseliner' && pawn.xenotype !== 'Baseliner') infoParts.push(pawn.xenotype);
    if (infoParts.length) {
      html += '<div style="font-size:var(--f-xs); color:var(--text3); margin-bottom:8px">' + _escapeHtml(infoParts.join(' - ')) + '</div>';
    }

    // Connections - off-map relatives (ghost nodes) included, with their status noted.
    // Dropping them here hid every off-map relative/lover/friend from the list.
    if (connections.length > 0) {
      connections.forEach(e => {
        const otherId = e.from === pawn.id ? e.to : e.from;
        const otherNode = (this._relNodes || []).find(n => n.id === otherId);
        const other = this.state.pawns.find(p => p.id === otherId) || (otherNode && otherNode.pawn);
        if (!other) return;
        const isGhost = !!(otherNode && otherNode.ghost);
        let otherName = other.nickname || other.name || 'Unknown';
        let status = '';
        if (isGhost) {
          if (other.resolved === false) { otherName = 'Unknown'; status = 'not in save'; }
          else status = other.dead ? 'deceased' : 'off-map';
        }
        html += `<div style="display:flex; align-items:center; gap:6px; padding:5px 8px; background:var(--surface2); border-radius:5px; margin-bottom:3px; border-left:3px solid ${e.colour}; font-size:var(--f-xs)">
          <span style="font-weight:700; color:${isGhost ? 'var(--text2)' : 'var(--text)'}">${_escapeHtml(otherName)}</span>
          ${status ? `<span style="color:var(--text3); font-size:calc(var(--f-xs) * 0.9)">(${status})</span>` : ''}
          <span style="color:${e.colour}; font-weight:600">${_escapeHtml(e.label)}</span>
          ${e.opinion !== 0 ? `<span style="color:${e.opinion > 0 ? 'var(--ok-txt)' : 'var(--p4-txt)'}; margin-left:auto">${e.opinion > 0 ? '+' : ''}${e.opinion}</span>` : ''}
        </div>`;
      });
    } else {
      html += '<div style="font-size:var(--f-xs); color:var(--text3); text-align:center; padding:6px">No relations detected.</div>';
    }

    // Opinion estimates
    const others = this.state.pawns.filter(p => p.id !== pawn.id);
    if (others.length > 0) {
      html += '<div style="margin-top:8px; font-size:10px; font-weight:700; color:var(--text3); text-transform:uppercase; letter-spacing:0.04em; padding:0 2px; margin-bottom:4px">Estimated Opinions</div>';
      others.forEach(other => {
        const op = this._estimateOpinion(pawn, other);
        const otherName = other.nickname || other.name || 'Unknown';
        const colour = op > 20 ? 'var(--ok-txt)' : op < -20 ? 'var(--p4-txt)' : op > 0 ? '#8ae85d' : op < 0 ? '#e8a838' : 'var(--text3)';
        html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:2px 8px; font-size:var(--f-xs)">
          <span>${_escapeHtml(otherName)}</span>
          <span style="color:${colour}; font-weight:700">${op > 0 ? '+' : ''}${op}</span>
        </div>`;
      });
    }

    html += '</div>';
    return html;
  },

  _relBuildRomanceSection(pawns) {
    const romancePairs = [];
    for (let i = 0; i < pawns.length; i++) {
      for (let j = i + 1; j < pawns.length; j++) {
        const chance = this._estimateRomanceChance(pawns[i], pawns[j]);
        if (chance > 0.1) {
          romancePairs.push({ a: pawns[i], b: pawns[j], chance });
        }
      }
    }
    romancePairs.sort((a, b) => b.chance - a.chance);

    let html = '<div style="padding:6px 12px">';
    html += '<div style="font-size:10px; color:var(--text3); line-height:1.5; margin-bottom:8px; padding:5px 8px; background:var(--surface2); border-radius:5px; border-left:2px solid #e85d8a">Based on sexuality genes (Biotech), age gap preference, beauty, and family relation blocking. Mirrors RimWorld\'s SecondaryLovinChanceFactor.</div>';

    if (romancePairs.length === 0) {
      html += '<div style="font-size:var(--f-xs); color:var(--text3); text-align:center; padding:6px">No compatible pairs detected.</div></div>';
      return html;
    }
    romancePairs.slice(0, 10).forEach(p => {
      const nameA = p.a.nickname || p.a.name;
      const nameB = p.b.nickname || p.b.name;
      const pct = Math.round(p.chance * 100);
      const barColour = pct > 70 ? '#e85d8a' : pct > 40 ? '#e8a0b8' : '#8a5d6d';
      html += `<div style="display:flex; align-items:center; gap:6px; padding:3px 0; font-size:var(--f-xs)">
        <span style="min-width:0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${_escapeHtml(nameA)} + ${_escapeHtml(nameB)}</span>
        <div style="width:50px; height:5px; background:var(--surface3); border-radius:3px; overflow:hidden; flex-shrink:0">
          <div style="width:${pct}%; height:100%; background:${barColour}; border-radius:3px"></div>
        </div>
        <span style="color:${barColour}; font-weight:700; min-width:28px; text-align:right">${pct}%</span>
      </div>`;
    });
    html += '</div>';
    return html;
  },

  _relBuildFightSection(pawns) {
    const fightPairs = [];
    for (let i = 0; i < pawns.length; i++) {
      for (let j = i + 1; j < pawns.length; j++) {
        const risk = Math.max(this._estimateFightRisk(pawns[i], pawns[j]), this._estimateFightRisk(pawns[j], pawns[i]));
        if (risk > 0.05) {
          fightPairs.push({ a: pawns[i], b: pawns[j], risk });
        }
      }
    }
    fightPairs.sort((a, b) => b.risk - a.risk);

    let html = '<div style="padding:6px 12px">';
    html += '<div style="font-size:10px; color:var(--text3); line-height:1.5; margin-bottom:8px; padding:5px 8px; background:var(--surface2); border-radius:5px; border-left:2px solid #e8a838">Estimates social fight chance from base interaction odds, opinion modifiers (up to 4x at -100 opinion), and trait multipliers (Brawler 4x, Bloodlust 2x, Abrasive 2x, Kind 0.01x).</div>';

    if (fightPairs.length === 0) {
      html += '<div style="font-size:var(--f-xs); color:var(--text3); text-align:center; padding:6px">No elevated fight risks detected.</div></div>';
      return html;
    }
    fightPairs.slice(0, 10).forEach(p => {
      const nameA = p.a.nickname || p.a.name;
      const nameB = p.b.nickname || p.b.name;
      const pct = Math.round(p.risk * 100);
      const barColour = pct > 30 ? '#f0857a' : pct > 15 ? '#e8a838' : '#888';
      html += `<div style="display:flex; align-items:center; gap:6px; padding:3px 0; font-size:var(--f-xs)">
        <span style="min-width:0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${_escapeHtml(nameA)} vs ${_escapeHtml(nameB)}</span>
        <div style="width:50px; height:5px; background:var(--surface3); border-radius:3px; overflow:hidden; flex-shrink:0">
          <div style="width:${Math.min(100, pct)}%; height:100%; background:${barColour}; border-radius:3px"></div>
        </div>
        <span style="color:${barColour}; font-weight:700; min-width:28px; text-align:right">${pct}%</span>
      </div>`;
    });
    html += '</div>';
    return html;
  },

  _relBuildSummarySection() {
    const totalEdges = this._relEdges.length;
    const romCount = this._relEdges.filter(e => e.category === 'romance').length;
    const bloodCount = this._relEdges.filter(e => e.category === 'blood').length;
    const exCount = this._relEdges.filter(e => e.category === 'ex').length;
    const manualCount = this._relEdges.filter(e => e.category === 'manual').length;
    let html = '<div style="padding:8px 12px; display:flex; gap:6px; flex-wrap:wrap">';
    html += `<div class="sum-pill" style="border-color:var(--border-bright)"><span style="color:var(--text3)">Total</span> <strong>${totalEdges}</strong></div>`;
    if (romCount) html += `<div class="sum-pill" style="border-color:#e85d8a"><span style="color:#e85d8a">Romance</span> <strong>${romCount}</strong></div>`;
    if (bloodCount) html += `<div class="sum-pill" style="border-color:#5d8ae8"><span style="color:#5d8ae8">Blood</span> <strong>${bloodCount}</strong></div>`;
    if (exCount) html += `<div class="sum-pill" style="border-color:#8a5d6d"><span style="color:#8a5d6d">Ex</span> <strong>${exCount}</strong></div>`;
    if (manualCount) html += `<div class="sum-pill" style="border-color:#8ae85d"><span style="color:#8ae85d">Manual</span> <strong>${manualCount}</strong></div>`;
    html += '</div>';
    return html;
  },

  _relInitDrawerDrag() {
    const drawer = document.getElementById('relDrawer');
    const handle = drawer && drawer.querySelector('.rel-drawer-handle');
    if (!drawer || !handle) return;

    let startX, startY, startLeft, startTop;

    const onMove = (e) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const parent = drawer.offsetParent || drawer.parentElement;
      const pRect = parent.getBoundingClientRect();
      const maxLeft = pRect.width - 60;
      const maxTop = pRect.height - 40;
      const newLeft = Math.max(0, Math.min(maxLeft, startLeft + dx));
      const newTop = Math.max(0, Math.min(maxTop, startTop + dy));
      drawer.style.left = newLeft + 'px';
      drawer.style.top = newTop + 'px';
      drawer.style.right = 'auto';
      drawer.style.bottom = 'auto';
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this._relDrawerPos = {
        x: parseInt(drawer.style.left) || 0,
        y: parseInt(drawer.style.top) || 0,
      };
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      // Get position relative to offset parent, not viewport
      const drawerRect = drawer.getBoundingClientRect();
      const parent = drawer.offsetParent || drawer.parentElement;
      const parentRect = parent.getBoundingClientRect();
      startLeft = drawerRect.left - parentRect.left;
      startTop = drawerRect.top - parentRect.top;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  },

  _relToggleDrawer() {
    if (!this.state.settings) this.state.settings = {};
    // Persist the open/closed choice so it survives leaving and returning to the tab.
    const nowHidden = !this.state.settings.relDrawerHidden;
    this.state.settings.relDrawerHidden = nowHidden;
    const drawer = document.getElementById('relDrawer');
    if (drawer) drawer.style.display = nowHidden ? 'none' : 'flex';
    this.triggerAutoSave();
  },

  // Collapse the Social Intel panel down to just its header bar (keeps it on screen),
  // distinct from hiding it entirely via the Toggle Panel / x buttons.
  _relToggleDrawerCollapse() {
    this._relDrawerCollapsed = !this._relDrawerCollapsed;
    const body = document.querySelector('#relDrawer .rel-drawer-body');
    if (body) body.style.display = this._relDrawerCollapsed ? 'none' : '';
    const btn = document.getElementById('relDrawerCollapseBtn');
    if (btn) btn.innerHTML = this._relDrawerCollapsed ? '&#9656;' : '&#9662;';
  },

  _relResetDrawerPos() {
    const drawer = document.getElementById('relDrawer');
    if (!drawer) return;
    this._relDrawerPos = null;
    drawer.style.right = '12px';
    drawer.style.top = '12px';
    drawer.style.left = 'auto';
    drawer.style.bottom = 'auto';
    // Reset all sections open
    this._relDrawerSections = { romance: true, fight: true, opinions: true, summary: true, details: true };
    this._relRenderDrawer();
  },

  _relDrawerOpacity() {
    const v = this.state.settings && this.state.settings.relDrawerOpacity;
    return (typeof v === 'number' && isFinite(v)) ? Math.max(0.2, Math.min(1, v)) : 0.95;
  },
  // Build an rgba from the theme's --surface so only the panel BACKGROUND gets the alpha
  // (text and borders stay fully opaque and crisp, unlike fading the whole element).
  _relDrawerBg(alpha) {
    let r = 22, g = 24, b = 28; // dark --surface fallback
    try {
      const hex = getComputedStyle(document.body).getPropertyValue('--surface').trim();
      const m = hex.match(/^#?([0-9a-fA-F]{6})$/);
      if (m) { const n = parseInt(m[1], 16); r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
    } catch (_) {}
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  },
  _relSetDrawerOpacity(v) {
    const a = Math.max(0.2, Math.min(1, parseFloat(v) || 0.95));
    if (!this.state.settings) this.state.settings = {};
    this.state.settings.relDrawerOpacity = a;
    const drawer = document.getElementById('relDrawer');
    if (drawer) drawer.style.background = this._relDrawerBg(a);
    if (this.triggerAutoSave) this.triggerAutoSave();
  },

  // -- ADD MANUAL RELATION --
  addManualRelation() {
    const pawns = this.state.pawns;
    if (pawns.length < 2) { this.toast('Need at least two pawns.'); return; }

    const modal = document.getElementById('relationModal');
    const body = document.getElementById('relationModalBody');
    if (!modal || !body) return;

    const pawnOpts = pawns.map(p => `<option value="${p.id}">${_escapeHtml(p.nickname || p.name)}</option>`).join('');
    const relOpts = RELATION_DEFS.map(d => `<option value="${d.def}">${_escapeHtml(d.label)}</option>`).join('');

    body.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:14px">
        <div>
          <label style="font-size:var(--f-xs); color:var(--text3); font-weight:700; text-transform:uppercase; display:block; margin-bottom:6px">From Pawn</label>
          <select id="relFromPawn" class="skill-input" style="width:100%; padding:8px 12px">${pawnOpts}</select>
        </div>
        <div>
          <label style="font-size:var(--f-xs); color:var(--text3); font-weight:700; text-transform:uppercase; display:block; margin-bottom:6px">Relation</label>
          <select id="relDef" class="skill-input" style="width:100%; padding:8px 12px" onchange="document.getElementById('relCustomWrap').style.display = this.value==='__custom__' ? 'flex' : 'none'; if(this.value==='__custom__') document.getElementById('relCustomLabel').focus()">${relOpts}<option value="__custom__">+ Custom title…</option></select>
          <div id="relCustomWrap" style="display:none; gap:8px; align-items:center; margin-top:8px">
            <input id="relCustomLabel" class="skill-input" placeholder="Custom title, e.g. Best Friend, Rival" maxlength="40" style="flex:1; padding:8px 12px">
            <input type="color" id="relCustomColour" value="#e8c85d" title="Line colour for this relation" style="width:42px; height:38px; border:none; padding:0; background:transparent; cursor:pointer; border-radius:6px; flex-shrink:0">
          </div>
        </div>
        <div>
          <label style="font-size:var(--f-xs); color:var(--text3); font-weight:700; text-transform:uppercase; display:block; margin-bottom:6px">To Pawn</label>
          <select id="relToPawn" class="skill-input" style="width:100%; padding:8px 12px">${pawnOpts}</select>
        </div>
        <p style="font-size:var(--f-xs); color:var(--text3); margin:0">Manually define a relationship between two pawns. This won't affect your save file.</p>
      </div>
    `;
    // Default second dropdown to a different pawn
    if (pawns.length > 1) {
      const toPawnSel = document.getElementById('relToPawn');
      if (toPawnSel) toPawnSel.value = pawns[1].id;
    }
    modal.classList.add('show');
  },

  closeRelationModal() {
    document.getElementById('relationModal')?.classList.remove('show');
  },

  submitRelation() {
    const from = document.getElementById('relFromPawn')?.value;
    const to = document.getElementById('relToPawn')?.value;
    let def = document.getElementById('relDef')?.value;
    let colour = null;
    if (def === '__custom__') {
      def = (document.getElementById('relCustomLabel')?.value || '').trim();
      if (!def) { this.toast('Enter a custom relation title.'); return; }
      colour = (typeof _safeColor === 'function' ? _safeColor(document.getElementById('relCustomColour')?.value, '#e8c85d') : (document.getElementById('relCustomColour')?.value || '#e8c85d'));
    }
    if (!from || !to || !def) return;
    if (from === to) { this.toast('Select two different pawns.'); return; }

    if (!this.state.manualRelations) this.state.manualRelations = [];
    // Existing? Re-adding a custom title just updates its colour; otherwise it's a dupe.
    const existing = this.state.manualRelations.find(r => r.from === from && r.to === to && r.def === def);
    if (existing) {
      if (colour) { existing.colour = colour; this.toast('Relation colour updated.'); }
      else { this.toast('Relation already exists.'); }
      this.closeRelationModal();
      if (colour) { this._buildRelationGraph(); this._relCanvasDraw(); this.triggerAutoSave(); }
      return;
    }

    this.state.manualRelations.push(colour ? { from, to, def, colour } : { from, to, def });
    this.closeRelationModal();
    this._buildRelationGraph();
    this._relStartSim();
    this._relRenderDrawer();
    this.triggerAutoSave();
    this.toast('Relation added!');
  },

  removeManualRelation(from, to, def) {
    if (!this.state.manualRelations) return;
    this.state.manualRelations = this.state.manualRelations.filter(r => !(r.from === from && r.to === to && r.def === def));
    this._buildRelationGraph();
    this._relCanvasDraw();
    this._relRenderDrawer();
    this.triggerAutoSave();
  },

  // -- RENDER TAB --
  renderRelations() {
    const container = document.getElementById('view-relations');
    if (!container) return;
    if (container.style.display === 'none') return;

    const isWidget = this._isWidgetMode();
    const dPos = this._relDrawerPos;
    // The drawer lives INSIDE the canvas area (below the toolbar), so its
    // default top is relative to that area - no overlap with the toolbar pills
    // even when the toolbar wraps onto multiple rows at narrow widths.
    const drawerStyle = dPos
      ? `left:${dPos.x}px; top:${dPos.y}px; right:auto; bottom:auto;`
      : `right:12px; top:12px;`;
    const drawerBg = this._relDrawerBg(this._relDrawerOpacity());
    // Persisted hidden state: if the user closed the Social Intel panel, keep it
    // closed when they come back to the tab (and across restarts) until they reopen it.
    const drawerHidden = !!(this.state.settings && this.state.settings.relDrawerHidden);

    container.innerHTML = `
      <div style="position:relative; height:100%; overflow:hidden">
        <!-- Canvas area -->
        <div style="position:absolute; inset:0; display:flex; flex-direction:column">
          <div class="rel-toolbar" style="display:flex; align-items:center; flex-wrap:wrap; gap:8px; padding:8px 12px; border-bottom:1px solid var(--border); flex-shrink:0; background:var(--surface); z-index:12">
            <span style="font-weight:800; font-size:var(--f-sm); color:var(--accent); letter-spacing:0.05em; text-transform:uppercase">Relations</span>
            <button class="btn btn-sm" onclick="App.addManualRelation()" style="font-size:calc(var(--f-xs) * 0.9); padding:4px 10px">+ Add Relation</button>
            <button class="btn btn-sm" onclick="App._relResetLayout()" style="font-size:calc(var(--f-xs) * 0.9); padding:4px 10px">Reset Layout</button>
            <button class="btn btn-sm" onclick="App._relToggleDrawer()" style="font-size:calc(var(--f-xs) * 0.9); padding:4px 10px">Toggle Panel</button>
            ${(this.state.ghostPawns || []).length ? `<button id="relHideUnknownBtn" class="btn btn-sm" onclick="App._relToggleHideUnknown()" style="font-size:calc(var(--f-xs) * 0.9); padding:4px 10px">${this._relHideUnknown ? 'Show Unknowns' : 'Hide Unknowns'}</button>` : ''}
            ${((this.state.ghostPawns || []).some(g => g && g.dead) || (this.state.pawns || []).some(p => p && p.dead)) ? `<button id="relHideDeceasedBtn" class="btn btn-sm" onclick="App._relToggleHideDeceased()" style="font-size:calc(var(--f-xs) * 0.9); padding:4px 10px">${this._relHideDeceased ? 'Show Deceased' : 'Hide Deceased'}</button>` : ''}
            <span class="rel-hint" style="font-size:var(--f-xs); color:var(--text3); margin-left:auto">Drag to move - Scroll to zoom - Double-click to pin</span>
          </div>
          <div style="position:relative; flex:1; min-height:0; overflow:hidden">
            <canvas id="relCanvas" style="width:100%; height:100%; display:block"></canvas>

            <!-- Floating draggable drawer (constrained to the canvas area) -->
            <div id="relDrawer" style="position:absolute; ${drawerStyle} z-index:10; width:${isWidget ? '260px' : '280px'}; max-height:calc(100% - 24px); display:${drawerHidden ? 'none' : 'flex'}; flex-direction:column; background:${drawerBg}; border:1px solid var(--border); border-radius:10px; box-shadow:0 4px 24px rgba(0,0,0,0.35); overflow:hidden">
              <!-- Drag handle / header -->
              <div class="rel-drawer-handle" style="display:flex; align-items:center; gap:6px; padding:7px 12px; cursor:grab; user-select:none; background:var(--surface2); border-bottom:1px solid var(--border); flex-shrink:0">
                <span style="color:var(--text3); font-size:10px; letter-spacing:2px">&#9776;</span>
                <span style="font-size:11px; font-weight:800; color:var(--text); flex:1; letter-spacing:0.03em">Social Intel</span>
                <input type="range" min="20" max="100" value="${Math.round(this._relDrawerOpacity() * 100)}" oninput="App._relSetDrawerOpacity(this.value / 100)" onmousedown="event.stopPropagation()" title="Panel opacity" style="width:52px; height:12px; cursor:pointer; flex-shrink:0">
                <button id="relDrawerCollapseBtn" onclick="App._relToggleDrawerCollapse()" style="background:none; border:none; color:var(--text3); cursor:pointer; font-size:11px; padding:2px 4px; line-height:1">${this._relDrawerCollapsed ? '&#9656;' : '&#9662;'}</button>
                <button onclick="App._relResetDrawerPos()" style="background:none; border:none; color:var(--text3); cursor:pointer; font-size:10px; padding:2px 4px" title="Reset panel position">&#8634;</button>
                <button onclick="App._relToggleDrawer()" style="background:none; border:none; color:var(--text3); cursor:pointer; font-size:13px; padding:2px 4px; line-height:1" title="Hide panel">&times;</button>
              </div>
              <!-- Scrollable body with collapsible sections -->
              <div class="rel-drawer-body" style="overflow-y:auto; flex:1; min-height:0; ${this._relDrawerCollapsed ? 'display:none' : ''}"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Give the view a real height so the canvas can fill it (flex doesn't reliably
    // distribute height to this view in widget mode), then size the canvas to it.
    this._relFillHeight();
    const canvasEl = document.getElementById('relCanvas');
    if (canvasEl) {
      const parent = canvasEl.parentElement;
      const rect = parent.getBoundingClientRect();
      // Safety net: if the layout hasn't settled (height can briefly measure 0,
      // especially in widget mode), fall back to a usable viewport-based size so
      // the graph never renders into a zero-sized canvas.
      canvasEl.width = rect.width || Math.max(window.innerWidth - 24, 280);
      canvasEl.height = rect.height || Math.max(Math.round(window.innerHeight * 0.6), 320);
    }

    // Build the graph AFTER the canvas is sized, so initial node positions are
    // seeded against the real viewport centre (otherwise the 800x600 fallback drops
    // the nodes at the bottom of a small widget-mode canvas).
    this._buildRelationGraph();

    this._relAttachEvents();
    this._relInitDrawerDrag();
    this._relStartSim();
    this._relRenderDrawer();

    // Resize handler
    this._relResizeHandler = () => {
      const c = document.getElementById('relCanvas');
      if (!c) return;
      this._relFillHeight();
      const r = c.parentElement.getBoundingClientRect();
      c.width = r.width || Math.max(window.innerWidth - 24, 280);
      c.height = r.height || Math.max(Math.round(window.innerHeight * 0.6), 320);
      this._relRecenter();
      this._relCanvasDraw();
    };
    window.addEventListener('resize', this._relResizeHandler);

    // Collapsing/expanding the sidebar changes the container width WITHOUT a window
    // resize event, so the bitmap kept its old size while CSS stretched it across the
    // new width (the squish/stretch). Observe the canvas container itself and run the
    // same correction, coalesced to one resize per frame.
    if (this._relResizeObs) { try { this._relResizeObs.disconnect(); } catch (_) {} this._relResizeObs = null; }
    if (typeof ResizeObserver !== 'undefined' && canvasEl && canvasEl.parentElement) {
      this._relResizeObs = new ResizeObserver(() => {
        if (this._relObsRAF) return;
        this._relObsRAF = requestAnimationFrame(() => {
          this._relObsRAF = null;
          if (this._relResizeHandler) this._relResizeHandler();
        });
      });
      this._relResizeObs.observe(canvasEl.parentElement);
    }

    // The layout (contained-tab classes, header height) often isn't settled on the
    // synchronous render pass, so the first height measurement comes out small. Re-run
    // the fill + canvas resize on the next couple of frames once it has settled - the
    // same correction the window-resize handler does (which is why resizing "fixes" it).
    const settle = () => {
      const c = document.getElementById('relCanvas');
      if (!c) return;
      this._relFillHeight();
      const r = c.parentElement.getBoundingClientRect();
      const nw = r.width || c.width, nh = r.height || c.height;
      if (Math.abs(nw - c.width) > 4 || Math.abs(nh - c.height) > 4) {
        c.width = nw; c.height = nh;
        this._relRecenter();
        this._relCanvasDraw();
      }
    };
    requestAnimationFrame(settle);
    setTimeout(settle, 60);
    setTimeout(settle, 200);
  },

  // Make the relations view fill from its top to the bottom of the window. In widget
  // mode the flex chain doesn't give this view a height (its content is absolutely
  // positioned), so we set one explicitly; in window mode we let the CSS/flex handle
  // it (clear any inline height).
  _relFillHeight() {
    const c = document.getElementById('view-relations');
    if (!c) return;
    // Set the height explicitly to reach the bottom of the window. The flex chain can't
    // be relied on: at <=767px CSS sets `.main { height:auto }`, so the column has no
    // definite height and `.view-container { flex:1 1 0 }` children collapse to their
    // min-height (200px) - the "tiny canvas". Crucially we must ALSO override `flex`,
    // because with flex-basis:0 the explicit `height` is ignored in the flex column.
    // `flex:0 0 auto` makes the height authoritative in every layout.
    const top = c.getBoundingClientRect().top;
    c.style.flex = '0 0 auto';
    c.style.height = Math.max(240, Math.round(window.innerHeight - top - 6)) + 'px';
  },

  // Shift every node so the graph's centroid sits at the current canvas centre.
  _relRecenter() {
    const nodes = this._relNodes;
    if (!nodes || !nodes.length) return;
    const { cx, cy } = this._relViewport();
    let sx = 0, sy = 0;
    nodes.forEach(n => { sx += n.x; sy += n.y; });
    const dx = cx - sx / nodes.length, dy = cy - sy / nodes.length;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    nodes.forEach(n => { n.x += dx; n.y += dy; });
  },

  _relResetLayout() {
    const nodeCount = this._relNodes.length || 1;
    const { w: vpW, h: vpH, cx, cy } = this._relViewport();
    const r = Math.min(250, nodeCount * 30);
    const aspect = vpW / vpH;
    const rx = r * Math.max(1, Math.min(1.8, aspect));
    const ry = r * Math.max(1, Math.min(1.8, 1 / aspect));
    this._relNodes.forEach((n, i) => {
      const angle = (i / nodeCount) * Math.PI * 2 - Math.PI / 2;
      n.x = cx + Math.cos(angle) * rx;
      n.y = cy + Math.sin(angle) * ry;
      n.vx = 0;
      n.vy = 0;
      n.pinned = false;
    });
    this._relPan = { x: 0, y: 0 };
    this._relZoom = 1;
    this._relSelected = null;
    this._relStartSim();
    this._relRenderDrawer();
  },

  // Toggle hiding of unknown (unresolved) off-map relative nodes. Updates the
  // flag, rebuilds the graph in place and redraws. Avoids a full renderRelations
  // call so the resize listener is not re-registered (which would leak).
  _relToggleHideUnknown() {
    this._relHideUnknown = !this._relHideUnknown;
    const btn = document.getElementById('relHideUnknownBtn');
    if (btn) btn.textContent = this._relHideUnknown ? 'Show Unknowns' : 'Hide Unknowns';
    this._buildRelationGraph();
    if (this._relSelected && !this._relNodes.some(n => n.id === this._relSelected)) {
      this._relSelected = null;
    }
    this._relStartSim();
    this._relCanvasDraw();
    this._relRenderDrawer();
  },

  _relToggleHideDeceased() {
    this._relHideDeceased = !this._relHideDeceased;
    const btn = document.getElementById('relHideDeceasedBtn');
    if (btn) btn.textContent = this._relHideDeceased ? 'Show Deceased' : 'Hide Deceased';
    this._buildRelationGraph();
    if (this._relSelected && !this._relNodes.some(n => n.id === this._relSelected)) {
      this._relSelected = null;
    }
    this._relStartSim();
    this._relCanvasDraw();
    this._relRenderDrawer();
  },

  // Lightweight live refresh for when pawn data changes while the Relations tab
  // is already open (e.g. Clear Pawns, import, delete). Rebuilds the graph data
  // in place; the running simulation loop redraws it on the next frame. Avoids a
  // full DOM rebuild so the drawer, layout, and listeners stay intact.
  _relRefresh() {
    const canvas = document.getElementById('relCanvas');
    if (!canvas) return; // tab never rendered yet
    this._buildRelationGraph();
    // Drop a stale selection if its node no longer exists
    if (this._relSelected && !this._relNodes.some(n => n.id === this._relSelected)) {
      this._relSelected = null;
    }
    this._relStartSim();      // no-op if already running; the loop reads fresh data
    this._relCanvasDraw();    // immediate redraw in case the sim is idle
    this._relRenderDrawer();
  },

  // Cleanup when switching away from tab
  _relCleanup() {
    this._relStopSim();
    if (this._relResizeHandler) {
      window.removeEventListener('resize', this._relResizeHandler);
      this._relResizeHandler = null;
    }
  },
});

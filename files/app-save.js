/**
 * SAVE/LOAD & CONSOLE
 * RimWorld save file parsing, import preview, import confirmation,
 * ideology/raid extraction from saves, project save/load/export,
 * state normalisation, validation, in-app developer console.
 * Auto-split from app.js - methods are assigned onto the App object.
 */
Object.assign(App, {
  // ─── SAVE FILE IMPORT (.rws) ───
  _saveImportData: null, // Temp storage for parsed save data during import flow
  _lastSaveFilePath: null, // Path to last imported .rws file (for refresh)

  _showRefreshBtn() {
    const btn = document.getElementById('refreshSaveBtn');
    if (btn) btn.style.display = this._lastSaveFilePath ? '' : 'none';
    const ex = document.getElementById('exportSaveBtn');
    if (ex) ex.style.display = this._lastSaveFilePath ? '' : 'none';
  },

  // ─── EDITED SAVE EXPORT (.rws round-trip) ─────────────────────────────────
  // Write edited pawn stats back into a copy of the original .rws so RimWorld can
  // load them. We re-read the UNTOUCHED original file and make surgical, value-only
  // edits to each imported colonist's <thing> block, preserving the rest of the save
  // exactly. Output is always a NEW file (never overwrites the original).

  // Locate a pawn's full <thing> block in the raw save text by loadID. Depth-aware so
  // nested carried/inventory/equipment things don't end the block early.
  _locatePawnBlock(text, loadID) {
    const stripped = String(loadID || '').replace(/^Thing_/, '');
    if (!stripped) return null;
    const cands = [`<loadID>${loadID}</loadID>`, `<id>${loadID}</id>`, `<id>${stripped}</id>`];
    let idIdx = -1;
    for (const c of cands) { const i = text.indexOf(c); if (i >= 0) { idIdx = i; break; } }
    if (idIdx < 0) return null;
    const start = text.lastIndexOf('<thing ', idIdx);
    if (start < 0) return null;
    const re = /<\/?thing\b/g;
    re.lastIndex = start;
    let depth = 0, m, end = -1;
    while ((m = re.exec(text)) !== null) {
      if (m[0] === '</thing') {
        depth--;
        if (depth === 0) { const gt = text.indexOf('>', re.lastIndex); end = gt >= 0 ? gt + 1 : -1; break; }
      } else {
        const gt = text.indexOf('>', re.lastIndex);
        if (gt < 0) break;
        if (text[gt - 1] !== '/') depth++; // skip self-closing <thing .../>
      }
    }
    return end > start ? { start, end } : null;
  },

  // Replace the first OR last match of a /g regex (and only that one). When a pawn is
  // carrying another pawn (e.g. a downed colonist), the block holds two of everything;
  // the parser reads the carrier's, which is the LAST block, so the writer must edit the
  // same one to avoid changing the carried pawn instead.
  _replaceNthBlock(text, regexGlobal, useLast, replacer) {
    const matches = [...text.matchAll(regexGlobal)];
    if (!matches.length) return text;
    const m = useLast ? matches[matches.length - 1] : matches[0];
    const start = m.index, end = start + m[0].length;
    return text.slice(0, start) + replacer(m) + text.slice(end);
  },

  _blockHasNestedPawn(block) {
    return /<(?:thing|li) Class="Pawn">/.test(block.slice(50));
  },

  // Split a list body into its TOP-LEVEL <li> elements, depth-aware so nested <li>s
  // (e.g. a hediff's <comps><li>...) don't break enumeration. Both the importer and the
  // hediff writer use this so a remove index always points at the same element.
  _topLevelLis(body) {
    const out = [];
    const re = /<li\b[^>]*?>|<\/li>/g;
    let depth = 0, start = -1, m;
    while ((m = re.exec(body)) !== null) {
      if (m[0] === '</li>') {
        if (depth > 0) { depth--; if (depth === 0 && start >= 0) { out.push(body.slice(start, re.lastIndex)); start = -1; } }
      } else if (m[0].endsWith('/>')) {
        if (depth === 0) out.push(m[0]); // self-closing top-level <li/>
      } else {
        if (depth === 0) start = m.index;
        depth++;
      }
    }
    return out;
  },

  // Return a direct child element's text without allowing nested elements with
  // the same tag name to win. This is used for pawn identity fields where a
  // descendant <def> may describe equipment, a hediff, or another pawn.
  _directChildText(xml, tagName) {
    const text = String(xml || '');
    const re = /<\/?([A-Za-z_][\w.:-]*)\b[^>]*>/g;
    let depth = -1;
    let rootSeen = false;
    let targetStart = -1;
    let targetDepth = -1;
    let m;
    while ((m = re.exec(text)) !== null) {
      const token = m[0];
      const name = m[1];
      const closing = token[1] === '/';
      const selfClosing = !closing && /\/\s*>$/.test(token);
      if (!rootSeen) {
        if (closing) continue;
        rootSeen = true;
        depth = selfClosing ? -1 : 0;
        continue;
      }
      if (closing) {
        if (targetStart >= 0 && depth === targetDepth && name === tagName) {
          return text.slice(targetStart, m.index).trim();
        }
        depth--;
        if (depth < 0) break;
        continue;
      }
      if (depth === 0 && name === tagName) {
        if (selfClosing) return '';
        targetStart = re.lastIndex;
        targetDepth = depth + 1;
      }
      if (!selfClosing) depth++;
    }
    return null;
  },

  // Set skill levels + passions inside a pawn block. We DIFF against each skill's own
  // values in the file and only change what actually differs, leaving everything else
  // byte-for-byte. This is what keeps modded content safe: a passion the app doesn't
  // understand (e.g. a mod's "Apathy"/"Natural") collapses to None in our model, but
  // because the app value still matches the file's bucket, we never touch it. Only an
  // explicit user edit (which changes the bucket) is written. Insert-or-replace handles
  // Scribe's omitted defaults (level 0, passion None have no node).
  // Map a raw <passion> value (as serialised in the save) to our 0/1/2 learning
  // bucket. Vanilla None/Minor/Major map directly; a modded VSE passion (e.g.
  // AS_CompetitivePassion) is looked up in the scanned catalogue and bucketed by
  // its declared colour, falling back to 0 (treated as no passion) if unknown.
  _passionBucket(raw) {
    if (raw === 'Major') return 2;
    if (raw === 'Minor') return 1;
    if (!raw || raw === 'None') return 0;
    const cat = ((this.state && this.state.passionCatalog) || []).find(p => p.def === raw);
    return cat ? (cat.bucket | 0) : 0;
  },
  _applySkillEditsToBlock(block, pawn) {
    if (!pawn.skills) return block;
    const useLast = this._blockHasNestedPawn(block);
    // The skill list is the inner <skills>; close at its first </skills> (matches the
    // parser). Anything after the list inside the tracker is left untouched.
    return this._replaceNthBlock(block, /(<skills>\s*<skills>)([\s\S]*?)(<\/skills>)/g, useLast, (m) => {
      const open = m[1], body = m[2], close = m[3];
      const newBody = body.replace(/<li\b[^>]*>[\s\S]*?<\/li>/g, (li) => {
        const def = (li.match(/<def>([^<]+)<\/def>/) || [])[1];
        if (!def) return li;
        // The app keys skills by an internal id (Shooting -> shoot, Intellectual ->
        // intel, ...), and the parser lowercases the def first. Map the file's def the
        // same way; defs we can't map (modded skills) are left untouched.
        const sid = this.mapSkillDefToId ? this.mapSkillDefToId(def.toLowerCase()) : def;
        if (!sid || !pawn.skills || !(sid in pawn.skills)) return li;
        const lm = li.match(/<level>([^<]*)<\/level>/);
        const origLevel = lm ? (parseInt(lm[1], 10) || 0) : 0;
        const origPassStr = (li.match(/<passion>([^<]*)<\/passion>/) || [])[1];
        const appLevel = Math.max(0, Math.min(20, parseInt(pawn.skills[sid], 10) || 0));
        let out = li;
        if (appLevel !== origLevel) {
          if (/<level>[^<]*<\/level>/.test(out)) out = out.replace(/<level>[^<]*<\/level>/, `<level>${appLevel}</level>`);
          else out = out.replace(/(<def>[^<]+<\/def>)/, `$1<level>${appLevel}</level>`);
        }
        // Passion. When the pawn carries an explicit raw passion string (passionDefs),
        // diff that string directly so modded VSE passions (e.g. AS_CompetitivePassion)
        // round-trip verbatim and the picker can write any modded defName. Without it
        // (legacy/synthetic pawns) fall back to the original bucket diff, which leaves
        // an unrecognised modded passion untouched because its bucket reads as None.
        if (pawn.passionDefs && (sid in pawn.passionDefs)) {
          const wantStr = pawn.passionDefs[sid];
          const norm = (s) => (!s || s === 'None') ? '' : s; // None / absent are equivalent
          if (norm(wantStr) !== norm(origPassStr)) {
            if (/<passion>[^<]*<\/passion>/.test(out)) {
              out = norm(wantStr) ? out.replace(/<passion>[^<]*<\/passion>/, `<passion>${wantStr}</passion>`)
                                  : out.replace(/\s*<passion>[^<]*<\/passion>/, '');
            } else if (norm(wantStr)) {
              if (/<level>[^<]*<\/level>/.test(out)) out = out.replace(/(<level>[^<]*<\/level>)/, `$1<passion>${wantStr}</passion>`);
              else out = out.replace(/(<def>[^<]+<\/def>)/, `$1<passion>${wantStr}</passion>`);
            }
          }
        } else {
          const origBucket = origPassStr === 'Minor' ? 1 : origPassStr === 'Major' ? 2 : 0;
          const appBucket = (pawn.passions && pawn.passions[sid]) | 0;
          if (appBucket !== origBucket) {
            const pasName = appBucket === 2 ? 'Major' : appBucket === 1 ? 'Minor' : '';
            if (/<passion>[^<]*<\/passion>/.test(out)) {
              out = pasName ? out.replace(/<passion>[^<]*<\/passion>/, `<passion>${pasName}</passion>`)
                            : out.replace(/\s*<passion>[^<]*<\/passion>/, '');
            } else if (pasName) {
              if (/<level>[^<]*<\/level>/.test(out)) out = out.replace(/(<level>[^<]*<\/level>)/, `$1<passion>${pasName}</passion>`);
              else out = out.replace(/(<def>[^<]+<\/def>)/, `$1<passion>${pasName}</passion>`);
            }
          }
        }
        return out;
      });
      return open + newBody + close;
    });
  },

  // Apply explicit trait add/remove operations to a pawn block. Ops carry the real RimWorld
  // (def, degree) - never the app's lossy internal id - so vanilla and modded traits are
  // handled identically. We only add/remove the <li>s named in the ops and leave every other
  // trait byte-for-byte (mod-safe). degree 0 is omitted (Scribe default).
  //   ops = { add: [{def, degree}], remove: [{def, degree}] }
  _applyTraitEditsToBlock(block, ops) {
    if (!ops) return block;
    const removes = Array.isArray(ops.remove) ? ops.remove : [];
    const adds = Array.isArray(ops.add) ? ops.add : [];
    if (!removes.length && !adds.length) return block;
    const useLast = this._blockHasNestedPawn(block);

    const editList = (open, body, close) => {
      // Drop removed traits (match by def + degree; absent <degree> means 0).
      let newBody = body.replace(/<li\b[^>]*>[\s\S]*?<\/li>/g, (li) => {
        const def = (li.match(/<def>([^<]+)<\/def>/) || [])[1];
        if (!def) return li;
        const dm = li.match(/<degree>(-?\d+)<\/degree>/);
        const deg = dm ? parseInt(dm[1], 10) : 0;
        return removes.some(r => r.def === def && (parseInt(r.degree, 10) || 0) === deg) ? '' : li;
      });
      // Append added traits, skipping any that already exist (def + degree).
      for (const a of adds) {
        if (!a || !a.def) continue;
        const deg = parseInt(a.degree, 10) || 0;
        const existsRe = new RegExp(`<def>${a.def.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}</def>`);
        if (existsRe.test(newBody)) {
          const present = (newBody.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) || []).some(li => {
            const d = (li.match(/<def>([^<]+)<\/def>/) || [])[1];
            const dm = li.match(/<degree>(-?\d+)<\/degree>/);
            return d === a.def && (dm ? parseInt(dm[1], 10) : 0) === deg;
          });
          if (present) continue;
        }
        newBody += `<li><def>${a.def}</def>${deg ? `<degree>${deg}</degree>` : ''}</li>`;
      }
      return open + newBody + close;
    };

    // Populated <allTraits>...</allTraits>.
    if (/<allTraits>[\s\S]*?<\/allTraits>/.test(block)) {
      return this._replaceNthBlock(block, /(<allTraits>)([\s\S]*?)(<\/allTraits>)/g, useLast,
        (m) => editList(m[1], m[2], m[3]));
    }
    // Empty self-closed <allTraits /> - only matters if we are adding.
    if (adds.length && /<allTraits\s*\/>/.test(block)) {
      return this._replaceNthBlock(block, /<allTraits\s*\/>/g, useLast,
        () => editList('<allTraits>', '', '</allTraits>'));
    }
    return block;
  },

  // Set the pawn's ideology certainty (0..1) in its ideo tracker. Diffs against the file
  // by integer percent, so an untouched pawn keeps its exact original float and we only
  // write when the user actually moved the slider. Insert if the node is absent.
  _applyIdeoCertaintyToBlock(block, pawn) {
    if (typeof pawn.ideoCertainty !== 'number' || !isFinite(pawn.ideoCertainty)) return block;
    const appPct = Math.max(0, Math.min(100, Math.round(pawn.ideoCertainty * 100)));
    // The importer reads certainty from the FIRST ideo tracker (a plain .match), so the
    // writer must edit that same one or the model and the file would disagree.
    return this._replaceNthBlock(block, /(<ideo>\s*<ideo>Ideo_\d+<\/ideo>)([\s\S]*?)(<\/ideo>)/g, false, (m) => {
      const head = m[1], body = m[2], tail = m[3];
      const cm = body.match(/<certainty>([\d.]+)<\/certainty>/);
      const origPct = cm ? Math.round(parseFloat(cm[1]) * 100) : null;
      if (origPct !== null && origPct === appPct) return m[0]; // unchanged - leave exact float
      const val = String(appPct / 100);
      const newBody = cm
        ? body.replace(/<certainty>[\d.]+<\/certainty>/, `<certainty>${val}</certainty>`)
        : `<certainty>${val}</certainty>` + body; // insert right after the ideo reference
      return head + newBody + tail;
    });
  },

  // Apply hediff (health) edits to a pawn block.
  //   ops = { remove: [topLevelLiIndex...], add: [{def, hediffClass, partIdx, body, severity}] }
  // Removal is by the top-level <li> index captured at import (depth-aware, so it matches
  // even though hediffs nest comps). Everything not named is left byte-for-byte (mod-safe).
  _applyHediffEditsToBlock(block, ops) {
    if (!ops) return block;
    const removeSet = new Set((ops.remove || []).map(Number));
    const adds = Array.isArray(ops.add) ? ops.add : [];
    if (!removeSet.size && !adds.length) return block;
    const useLast = this._blockHasNestedPawn(block);

    const editList = (open, body, close) => {
      const lis = this._topLevelLis(body);
      const kept = lis.filter((_, i) => !removeSet.has(i));
      let additions = '';
      for (const a of adds) {
        if (!a || !a.def) continue;
        const cls = a.hediffClass || 'Hediff_Injury';
        const part = (a.partIdx != null && a.partIdx >= 0)
          ? `<part><body>${a.body || 'Human'}</body><index>${a.partIdx}</index></part>` : '';
        const sev = (a.severity != null && isFinite(a.severity)) ? `<severity>${a.severity}</severity>` : '';
        additions += `<li Class="${cls}"><def>${a.def}</def>${part}${sev}</li>`;
      }
      return open + kept.join('') + additions + close;
    };

    if (/<hediffs>[\s\S]*?<\/hediffs>/.test(block)) {
      return this._replaceNthBlock(block, /(<hediffs>)([\s\S]*?)(<\/hediffs>)/g, useLast,
        (m) => editList(m[1], m[2], m[3]));
    }
    if (adds.length && /<hediffs\s*\/>/.test(block)) {
      return this._replaceNthBlock(block, /<hediffs\s*\/>/g, useLast,
        () => editList('<hediffs>', '', '</hediffs>'));
    }
    return block;
  },

  // Apply relationship add/remove ops to a pawn's <directRelations>. Each relation is a
  // (def, otherPawn) pair where otherPawn is a Thing_ id that must exist in the save.
  // Relations are one-sided in the file; RimWorld rebuilds the reverse on load. Mod-safe:
  // only the named relations are touched. degree/startTicks default 0 and are omitted.
  //   ops = { add: [{def, otherPawn}], remove: [{def, otherPawn}] }
  _applyRelationEditsToBlock(block, ops) {
    if (!ops) return block;
    const removes = Array.isArray(ops.remove) ? ops.remove : [];
    const adds = Array.isArray(ops.add) ? ops.add : [];
    if (!removes.length && !adds.length) return block;
    const useLast = this._blockHasNestedPawn(block);

    const editList = (open, body, close) => {
      let newBody = body.replace(/<li\b[^>]*>[\s\S]*?<\/li>/g, (li) => {
        const def = (li.match(/<def>([^<]+)<\/def>/) || [])[1];
        const other = (li.match(/<otherPawn>([^<]+)<\/otherPawn>/) || [])[1];
        return removes.some(r => r.def === def && r.otherPawn === other) ? '' : li;
      });
      for (const a of adds) {
        if (!a || !a.def || !a.otherPawn) continue;
        const present = (newBody.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) || []).some(li =>
          (li.match(/<def>([^<]+)<\/def>/) || [])[1] === a.def &&
          (li.match(/<otherPawn>([^<]+)<\/otherPawn>/) || [])[1] === a.otherPawn);
        if (present) continue;
        newBody += `<li><def>${a.def}</def><otherPawn>${a.otherPawn}</otherPawn></li>`;
      }
      return open + newBody + close;
    };

    if (/<directRelations>[\s\S]*?<\/directRelations>/.test(block)) {
      return this._replaceNthBlock(block, /(<directRelations>)([\s\S]*?)(<\/directRelations>)/g, useLast,
        (m) => editList(m[1], m[2], m[3]));
    }
    if (adds.length && /<directRelations\s*\/>/.test(block)) {
      return this._replaceNthBlock(block, /<directRelations\s*\/>/g, useLast,
        () => editList('<directRelations>', '', '</directRelations>'));
    }
    return block;
  },

  // Build the full edited save text from the original. Returns { text, count, notFound }.
  buildEditedSaveText(text) {
    let out = text;
    let count = 0;
    let skippedLocal = 0;
    const notFound = [];
    for (const p of (this.state.pawns || [])) {
      if (!p.loadID) { skippedLocal++; continue; } // pawns created in-app aren't in the save
      const loc = this._locatePawnBlock(out, p.loadID);
      if (!loc) { notFound.push(p.name || p.loadID); continue; }
      const block = out.slice(loc.start, loc.end);
      let edited = this._applySkillEditsToBlock(block, p);
      edited = this._applyTraitEditsToBlock(edited, p._traitOps);
      edited = this._applyHediffEditsToBlock(edited, p._hediffOps);
      edited = this._applyRelationEditsToBlock(edited, p._relationOps);
      edited = this._applyIdeoCertaintyToBlock(edited, p);
      if (edited !== block) {
        out = out.slice(0, loc.start) + edited + out.slice(loc.end);
        count++;
      }
    }
    return { text: out, count, notFound, skippedLocal };
  },

  async exportEditedSave() {
    if (!this._lastSaveFilePath) { this.toast('Import a RimWorld save first.'); return; }
    if (!window.overlay?.readSaveFile || !window.overlay?.exportEditedSave) {
      this.toast('Save export requires the desktop app.'); return;
    }
    this.toast('Building edited save...');
    let original;
    try {
      const res = await window.overlay.readSaveFile(this._lastSaveFilePath);
      if (!res || res.error || !res.xml) { this.toast('Could not read the original save. Has it moved or been deleted?'); return; }
      original = res.xml;
    } catch (e) { this.toast('Failed to read the original save: ' + (e.message || 'error')); return; }

    let built;
    await new Promise(r => setTimeout(r, 0)); // let the toast paint before the sync build
    try { built = this.buildEditedSaveText(original); }
    catch (e) { this.toast('Failed to build edited save: ' + (e.message || 'error')); return; }

    // Integrity net: our value-only edits must never change the <thing> tag balance.
    const openA = (original.match(/<thing\b/g) || []).length;
    const closeA = (original.match(/<\/thing>/g) || []).length;
    const openB = (built.text.match(/<thing\b/g) || []).length;
    const closeB = (built.text.match(/<\/thing>/g) || []).length;
    if (openB !== openA || closeB !== closeA) {
      this.toast('Aborted: edited save failed a structure check. No file was written.');
      return;
    }

    const base = this._lastSaveFilePath.split(/[/\\]/).pop().replace(/\.rws$/i, '');
    let out;
    try { out = await window.overlay.exportEditedSave(base + '_rimjobs', built.text); }
    catch (e) { this.toast('Export failed: ' + (e.message || 'error')); return; }
    if (!out) return; // user cancelled the save dialog
    if (out.ok) {
      const fn = (out.filePath || '').split(/[/\\]/).pop();
      let msg = `Saved ${built.count} edited pawn(s) to "${fn}". Load it in RimWorld.`;
      const extras = [];
      if (built.skippedLocal) extras.push(`${built.skippedLocal} pawn(s) created in RimJobs were skipped - only colonists imported from this save can be written back`);
      if (built.notFound && built.notFound.length) extras.push(`${built.notFound.length} imported pawn(s) were not found in the file (it may be a different save)`);
      if (extras.length) msg += ' Note: ' + extras.join('; ') + '.';
      this.toast(msg);
    } else {
      this.toast('Export failed: ' + (out.error || 'unknown'));
    }
  },

  // Open and parse a RimWorld save. The loading + mod-label scan run behind a
  // NON-BLOCKING toast so you can keep using the app; the modal only opens for
  // the (interactive) pawn-review step, or to show an error.
  async importSaveFile() {
    let xml;
    let importWealth = null;
    try {
      const result = await window.overlay.openSaveFile();
      if (!result) return; // cancelled
      xml = result.xml;
      importWealth = result.wealth || null; // colony wealth decoded in main (may be null)
      if (result.filePath) this._lastSaveFilePath = result.filePath;
    } catch (e) {
      this._showSaveImportError("Failed to open file. Make sure you're running the desktop app.", e);
      return;
    }
    if (!xml) return;
    // Lock out other scans/imports while this one loads (release once it reaches
    // the interactive review; the review itself only writes state on confirm).
    if (this._acquireIO && !this._acquireIO('Save import')) return;

    const showT = (m) => { try { this._showScanToast && this._showScanToast('Importing save'); this._updateScanToast && this._updateScanToast(0, 0, m); } catch (_) {} };
    const closeT = (m, err) => { try { this._closeScanToast && this._closeScanToast(m, err); } catch (_) {} };
    try {
      showT('Parsing save file...');
      await new Promise(r => setTimeout(r, 0)); // let the toast paint before the sync parse

      try {
        this._saveImportData = this.parseSaveFile(xml);
        if (importWealth && this._saveImportData.meta) this._saveImportData.meta.wealth = importWealth;
      } catch (e) {
        closeT('Parse failed', true);
        this._showSaveImportError('Failed to parse save file.', e);
        return;
      }

      if (!this._saveImportData.pawns.length) {
        closeT('No colonists found', true);
        this._showSaveImportError('No colonist pawns found in this save file.', null);
        return;
      }

      // Load def labels from game XMLs (async batched, keeps UI responsive).
      if (!this._defLabels) {
        if (window.overlay?.onDefLabelProgress) {
          window.overlay.onDefLabelProgress(d => { try { this._updateScanToast && this._updateScanToast(d.done, d.total, `Resolving mod labels... ${d.done} / ${d.total} files`); } catch (_) {} });
        }
        try { await this._ensureDefLabels(); } catch (_) { /* offline / no install */ }
      }

      // Re-resolve storyteller label now that def labels are loaded.
      if (this._saveImportData && this._saveImportData.meta) {
        const m = this._saveImportData.meta;
        const resolved = this._defLabel(m.storyteller);
        if (resolved) m.storytellerClean = resolved;
      }

      closeT(`Save ready - ${this._saveImportData.pawns.length} colonist(s) to review.`, false);
    } catch (e) {
      closeT('Import failed', true);
      this._showSaveImportError('Save import failed unexpectedly.', e);
      return;
    } finally {
      this._releaseIO && this._releaseIO();
    }

    // Open the interactive review modal (lock already released).
    document.getElementById('saveImportModal')?.classList.add('show');
    this.renderSaveImportPreview();
  },

  // Show the save-import modal with an error message (shared by all failure paths).
  _showSaveImportError(message, e) {
    this._lastImportError = message + (e ? '\n' + (e.message || '') + '\n' + (e.stack || '') : '');
    const body = document.getElementById('saveImportBody');
    const footer = document.getElementById('saveImportFooter');
    document.getElementById('saveImportModal')?.classList.add('show');
    if (body) body.innerHTML = `<div style="text-align:center; padding:40px 0; color:var(--text2)">
      <div style="font-size:calc(16px * var(--font-scale)); margin-bottom:12px; font-weight:700; color:var(--p4-txt)">!</div>
      <div>${_escapeHtml(message)}</div>
      ${e && e.message ? `<div style="font-size:var(--f-xs); margin-top:8px; opacity:0.7">${_escapeHtml(e.message)}</div>` : ''}
    </div>`;
    if (footer) footer.innerHTML = `
      <button class="btn btn-sm" onclick="App._copyErrorToClipboard()">Copy Error</button>
      <button class="btn btn-sm" onclick="App.closeSaveImport()">Close</button>`;
  },

  // Strip mod prefixes (RBSF_, BGM_, VRE_, VTE_, ST_, CYB_, AG_, etc.) and
  // convert CamelCase/underscore IDs to human-readable names.
  _cleanModName(raw) {
    if (!raw) return raw;
    // Strip known mod prefixes (2-10 uppercase/digit chars followed by underscore)
    let cleaned = raw.replace(/^[A-Z][A-Za-z0-9]{1,9}_/, '');
    // Handle double-prefix edge cases like VRESaurids_Saurid
    cleaned = cleaned.replace(/^[A-Z][A-Za-z0-9]{1,12}_/, '');
    // Convert remaining underscores to spaces
    cleaned = cleaned.replace(/_/g, ' ');
    // CamelCase to spaces
    cleaned = cleaned.replace(/([a-z])([A-Z])/g, '$1 $2');
    cleaned = cleaned.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
    return cleaned.trim();
  },

  parseSaveFile(xmlString) {
    const _tag = (block, tag) => {
      const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
      return m ? m[1].trim() : '';
    };

    // -- Colony metadata --
    const meta = {};
    meta.gameVersion = _tag(xmlString.slice(0, 5000), 'gameVersion') || 'Unknown';
    // Major.minor as a number (e.g. "1.6.4633 rev1261" -> 1.6) for version-drift
    // notices, plus which expansions' data this save actually contains. These
    // drive the conditional "feature not relevant for your version/DLC" banners.
    const _vm = meta.gameVersion.match(/^(\d+)\.(\d+)/);
    meta.versionNum = _vm ? parseFloat(_vm[1] + '.' + _vm[2]) : null;
    meta.dlc = {
      ideology: /<ideoManager>/.test(xmlString), // Ideology (1.3)
      biotech: /<genes>/.test(xmlString),        // Biotech (1.4) - GeneTracker on every pawn
      royalty: /<royalty>/.test(xmlString),      // Royalty (1.1) - RoyaltyTracker on every pawn
    };
    // Active modlist from <meta> (packageIds + display names), so we can warn when
    // assigned content belongs to a mod that is not active in THIS save. Lowercased ids.
    const _modIdsBlock = (xmlString.match(/<modIds>([\s\S]*?)<\/modIds>/) || [])[1] || '';
    meta.modIds = [...(_modIdsBlock.matchAll(/<li>([^<]*)<\/li>/g))].map(m => m[1].trim().toLowerCase()).filter(Boolean);
    const _modNamesBlock = (xmlString.match(/<modNames>([\s\S]*?)<\/modNames>/) || [])[1] || '';
    meta.modNames = [...(_modNamesBlock.matchAll(/<li>([^<]*)<\/li>/g))].map(m => m[1].trim()).filter(Boolean);

    const ticks = parseInt(_tag(xmlString, 'ticksGame')) || 0;
    meta.ticks = ticks;
    // The displayed CALENDAR date uses absolute ticks = ticksGame + gameStartAbsTick. A colony
    // rarely starts on Aprimay 1; gameStartAbsTick encodes the starting twelfth (and hour), so
    // without it the date is off by however far into the year the colony was founded - which is
    // what made the date look stuck in the wrong month. Longitude (a sub-day local-time shift)
    // is not available here, so it is ignored; that is at most a 1-day edge effect.
    const startAbs = parseInt(_tag(xmlString, 'gameStartAbsTick')) || 0;
    meta.absTicks = ticks + startAbs; // true in-game absolute tick (drives the live logo clock)
    const calDays = Math.floor(meta.absTicks / 60000);
    meta.year = 5500 + Math.floor(calDays / 60);
    meta.quadrum = QUADRUMS[Math.floor((calDays % 60) / 15)] || 'Aprimay';
    meta.day = (calDays % 15) + 1;
    const totalDays = Math.floor(ticks / 60000); // days survived (duration) - feeds raid difficulty

    const storytellerBlock = xmlString.match(/<storyteller>[\s\S]*?<\/storyteller>/);
    meta.storyteller = storytellerBlock ? _tag(storytellerBlock[0], 'def') : 'Unknown';
    // Resolve modded storyteller label from scanned def XMLs, fall back to cleaned defName
    meta.storytellerClean = this._defLabel(meta.storyteller)
      || this._cleanModName(meta.storyteller)
      || meta.storyteller;
    // Extract difficulty defName from <storyteller> block (e.g. Rough, Hard, Extreme)
    meta.difficultyDef = storytellerBlock ? _tag(storytellerBlock[0], 'difficulty') : '';
    // Extract days passed from ticks for raid calc auto-population
    meta.daysPassed = totalDays;
    // Founding offset so the raid tab can show the real calendar date from a survival-day count
    // without disturbing daysPassed (which must stay survival-days for difficulty). Chosen so
    // dateOffset + daysPassed equals the clock's calendar day exactly.
    meta.dateOffset = calDays - totalDays + 1;

    // -- World seed, name and coverage (world > info) --
    // The world block sits megabytes into the file and <info> appears earlier for other
    // things, so anchor on the unique <seedString> tag and read its enclosing <info>.
    meta.worldSeed = ''; meta.worldName = ''; meta.planetCoverage = null;
    const seedIdx = xmlString.indexOf('<seedString>');
    if (seedIdx >= 0) {
      const infoStart = xmlString.lastIndexOf('<info>', seedIdx);
      const win = xmlString.slice(infoStart >= 0 ? infoStart : Math.max(0, seedIdx - 400), seedIdx + 600);
      meta.worldSeed = _tag(win, 'seedString') || '';
      meta.worldName = _tag(win, 'name') || '';
      const cov = parseFloat(_tag(win, 'planetCoverage'));
      meta.planetCoverage = Number.isFinite(cov) ? cov : null;
    }

    // Work tab mode: <useWorkPriorities> in playSettings (True = manual 1-4,
    // False = simple on/off). Used to match our Priorities table mode on import.
    const uwpMatch = xmlString.match(/<useWorkPriorities>(true|false)<\/useWorkPriorities>/i);
    meta.useWorkPriorities = uwpMatch ? /true/i.test(uwpMatch[1]) : null;

    // -- Identify the player faction --
    const pfMatch = xmlString.match(/<playerFaction>[\s\S]*?<factionDef>(.*?)<\/factionDef>/);
    const playerFactionDef = pfMatch ? pfMatch[1] : null;

    let playerFactionRef = null;
    let colonyName = 'Unknown Colony';
    // Map Faction_N -> display name, for per-pawn faction labels on cards.
    const factionNameMap = {};
    const fmMatch = xmlString.match(/<allFactions>([\s\S]*?)<\/allFactions>/);
    if (fmMatch) {
      const factionEntries = fmMatch[1].split(/<li>/);
      for (const entry of factionEntries) {
        const fDef = _tag(entry, 'def');
        const fName = _tag(entry, 'name');
        const fLoadID = _tag(entry, 'loadID');
        if (!fDef || !fLoadID) continue;
        // Build the name map for every faction (name, else def label, else humanized def)
        factionNameMap['Faction_' + fLoadID] = fName || this._defLabel(fDef) || this._defLabelOrHumanize(fDef);
        if (playerFactionDef && fDef === playerFactionDef && !playerFactionRef) {
          playerFactionRef = 'Faction_' + fLoadID;
          colonyName = fName || colonyName;
        }
        if (!playerFactionDef && (fDef === 'PlayerColony' || fDef === 'PlayerTribe') && !playerFactionRef) {
          playerFactionRef = 'Faction_' + fLoadID;
          colonyName = fName || colonyName;
        }
      }
    }
    meta.colonyName = colonyName;

    // -- Build ideology name map (Ideo_N -> display name) --
    // Ideos live in <ideoManager><ideos> as depth-aware top-level <li> blocks.
    // The ideo's own name/id are DIRECT children (depth-1); a naive first-match
    // would wrongly grab a nested deity <name> inside <foundation>. So we walk
    // tags tracking depth and only read the direct-child <name>/<id>.
    const _directChild = (inner, tag) => {
      const re = /<([a-zA-Z][\w.]*)(?:\s[^>]*?)?(\/?)>|<\/([a-zA-Z][\w.]*)>/g;
      let m, d = 0;
      while ((m = re.exec(inner)) !== null) {
        if (m[3]) { d--; continue; }      // closing tag
        if (m[2]) continue;               // self-closing tag
        if (d === 0 && m[1] === tag) {
          const rest = inner.slice(re.lastIndex);
          const cm = rest.match(new RegExp(`^([\\s\\S]*?)<\\/${tag}>`));
          return cm ? cm[1].trim() : '';
        }
        d++;
      }
      return '';
    };
    // Walk depth-aware top-level <li> blocks under a parent text, calling fn(inner).
    const _eachTopLevelLi = (text, fn) => {
      const tagRe = /<li(?:\s[^>]*?)?>|<\/li>/g;
      let mt, depth = 0, liStart = -1;
      while ((mt = tagRe.exec(text)) !== null) {
        const t = mt[0];
        if (t.endsWith('/>')) continue;
        if (t === '</li>') {
          depth--;
          if (depth === 0 && liStart >= 0) {
            const liBlock = text.slice(liStart, tagRe.lastIndex);
            const inner = liBlock.replace(/^<li(?:\s[^>]*?)?>/, '').replace(/<\/li>$/, '');
            fn(inner);
            liStart = -1;
          }
        } else {
          if (depth === 0) liStart = mt.index;
          depth++;
        }
      }
    };

    const ideoNameMap = {};
    // Full per-ideology detail records, for the "all ideologies" browser modal.
    const allIdeologies = [];
    const ideoMgrMatch = xmlString.match(/<ideoManager>([\s\S]*?)<\/ideoManager>/);
    if (ideoMgrMatch) {
      const ideosInner = ideoMgrMatch[1].match(/<ideos>([\s\S]*?)<\/ideos>/);
      if (ideosInner) {
        _eachTopLevelLi(ideosInner[1], (inner) => {
          const ideoId = _directChild(inner, 'id');
          if (!ideoId) return;
          const name = _directChild(inner, 'name');
          ideoNameMap['Ideo_' + ideoId] = name;

          // Foundation deities (name / type / gender) - flat, first-match safe.
          const deities = [];
          const foundation = _directChild(inner, 'foundation');
          const place = foundation ? _tag(foundation, 'place') : '';
          if (foundation) {
            const deitiesBlock = foundation.match(/<deities>([\s\S]*?)<\/deities>/);
            if (deitiesBlock) {
              _eachTopLevelLi(deitiesBlock[1], (dInner) => {
                const dName = _tag(dInner, 'name');
                if (!dName) return;
                deities.push({ name: dName, type: _tag(dInner, 'type'), gender: _tag(dInner, 'gender') });
              });
            }
          }

          // Memes (plain defName list)
          const memes = [];
          const memesBlock = inner.match(/<memes>([\s\S]*?)<\/memes>/);
          if (memesBlock) {
            for (const mm of memesBlock[1].matchAll(/<li>([^<]+)<\/li>/g)) memes.push(mm[1].trim());
          }

          // Precepts (each top-level li: its own name + def appear first)
          const precepts = [];
          const preceptsBlock = _directChild(inner, 'precepts');
          if (preceptsBlock) {
            _eachTopLevelLi(preceptsBlock, (pInner) => {
              const pDef = (pInner.match(/<def>([^<]+)<\/def>/) || [])[1];
              if (!pDef) return;
              const pName = (pInner.match(/<name>([^<]+)<\/name>/) || [])[1] || '';
              precepts.push({ name: pName.trim(), def: pDef.trim() });
            });
          }

          allIdeologies.push({
            id: 'Ideo_' + ideoId,
            name,
            adjective: _directChild(inner, 'adjective'),
            memberName: _directChild(inner, 'memberName'),
            leaderTitleMale: _directChild(inner, 'leaderTitleMale'),
            leaderTitleFemale: _directChild(inner, 'leaderTitleFemale'),
            description: _directChild(inner, 'description'),
            culture: _directChild(inner, 'culture'),
            iconDef: _directChild(inner, 'iconDef'),
            colorDef: _directChild(inner, 'colorDef'),
            place,
            deities,
            memes,
            precepts
          });
        });
      }
    }
    meta.allIdeologies = allIdeologies;

    // Format a pawn's royalty titles into a display string, resolving the title
    // def to a readable label and the granting faction's name.
    const royalTitleStr = (titles) => (titles || []).map(t => {
      const label = this._defLabel(t.def) || this._defLabelOrHumanize(t.def);
      const fac = t.factionRef ? factionNameMap[t.factionRef] : '';
      return fac ? label + ' (' + fac + ')' : label;
    }).join(', ');

    // -- Parse player ideology (memes + precepts) --
    const ideoData = { memes: [], precepts: [], name: '', style: '' };
    // Find the player's ideo: look in <ideos> for <li Class="Ideo"> blocks
    const ideosMatch = xmlString.match(/<ideos>([\s\S]*?)<\/ideos>/);
    if (ideosMatch) {
      // Split into individual Ideo entries
      const ideoBlocks = [...ideosMatch[1].matchAll(/<li\s+Class="Ideo">([\s\S]*?)(?=<li\s+Class="Ideo">|$)/g)];
      // Find the player ideo - it's the one referenced by the player faction,
      // or the first one (player ideo is typically first)
      let playerIdeoBlock = '';
      for (const ib of ideoBlocks) {
        const block = ib[1];
        // Check if this ideo belongs to the player faction
        if (playerFactionRef) {
          const foundRef = block.includes(playerFactionRef);
          if (foundRef) { playerIdeoBlock = block; break; }
        }
      }
      // Fallback: use first ideo if no faction match
      if (!playerIdeoBlock && ideoBlocks.length > 0) playerIdeoBlock = ideoBlocks[0][1];

      if (playerIdeoBlock) {
        // Ideo name
        ideoData.name = _tag(playerIdeoBlock, 'name') || '';

        // Extract memes
        const memesMatch = playerIdeoBlock.match(/<memes>([\s\S]*?)<\/memes>/);
        if (memesMatch) {
          ideoData.memes = [...memesMatch[1].matchAll(/<li>(.*?)<\/li>/g)].map(m => m[1]);
        }

        // Extract precepts (defName + current level/stage)
        const preceptsMatch = playerIdeoBlock.match(/<precepts>([\s\S]*?)<\/precepts>/);
        if (preceptsMatch) {
          const pLis = [...preceptsMatch[1].matchAll(/<li\s+Class="([^"]*)">([\s\S]*?)(?=<li\s+Class="|<\/precepts>)/g)];
          for (const pl of pLis) {
            const pClass = pl[1];
            const pBlock = pl[2];
            const pDef = _tag(pBlock, 'def');
            if (pDef) {
              const tipLabel = _tag(pBlock, 'tipLabelOverride') || '';
              ideoData.precepts.push({ def: pDef, class: pClass, tipLabel });
            }
          }
        }
        // Extract rituals from precepts (Precept_Ritual, Precept_RitualSeat classes)
        if (preceptsMatch) {
          const ritualLis = [...preceptsMatch[1].matchAll(/<li\s+Class="(Precept_Ritual[^"]*)">([\s\S]*?)(?=<li\s+Class="|<\/precepts>)/g)];
          for (const rl of ritualLis) {
            const rBlock = rl[2];
            const rDef = _tag(rBlock, 'def');
            const rLabel = _tag(rBlock, 'tipLabelOverride') || _tag(rBlock, 'label') || '';
            if (rDef) {
              ideoData.rituals = ideoData.rituals || [];
              ideoData.rituals.push({ def: rDef, label: rLabel });
            }
          }
        }
      }
    }
    meta.ideology = ideoData;

    // -- Parse ideology roles (pawn loadID -> role def) --
    // Scan for each IdeoRole_ def and find the <chosenPawn>/<chosenPawns> pawn refs
    // that follow it. Uses indexOf for speed on large (60MB+) save files.
    const pawnRoleMap = {};
    const ideoRoleDefMap = {
      'IdeoRole_Leader': 'leader', 'IdeoRole_Moralist': 'guide',
      'IdeoRole_MedicalSpecialist': 'medical', 'IdeoRole_ResearchSpecialist': 'research',
      'IdeoRole_ShootingSpecialist': 'shooting', 'IdeoRole_MeleeSpecialist': 'melee',
      'IdeoRole_ProductionSpecialist': 'production', 'IdeoRole_PlantsSpecialist': 'plants',
      'IdeoRole_AnimalsSpecialist': 'animal', 'IdeoRole_MiningSpecialist': 'mining',
    };
    for (const [ideoDef, appRole] of Object.entries(ideoRoleDefMap)) {
      const defTag = '<def>' + ideoDef + '</def>';
      let pos = 0;
      while (true) {
        pos = xmlString.indexOf(defTag, pos);
        if (pos < 0) break;
        // Scan forward from this def for chosenPawn/chosenPawns pawn refs (within 2000 chars)
        const scanEnd = Math.min(pos + 2000, xmlString.length);
        const after = xmlString.slice(pos, scanEnd);
        const pawnMatches = after.matchAll(/<pawn>(Thing_\w+\d+)<\/pawn>/g);
        for (const pm of pawnMatches) {
          pawnRoleMap[pm[1]] = appRole;
        }
        pos += defTag.length;
      }
    }

    // -- Find player pawns (regex on maps section only) --
    // Scans all <thing Class="Pawn"> entries, not just Humans, so modded races
    // (CreepJoiners, custom race defs, etc.) are included.
    const mapsStart = xmlString.indexOf('<maps>');
    const mapsEnd = xmlString.indexOf('</maps>');
    if (mapsStart < 0 || mapsEnd < 0 || !playerFactionRef) return { meta, pawns: [] };

    const mapsText = xmlString.slice(mapsStart, mapsEnd);
    // Scan for both <thing Class="Pawn"> (map-spawned) and <li Class="Pawn">
    // (carried babies, quest pawns nested in containers)
    const pawnPositions = [];
    const pawnRe = /<(?:thing|li) Class="Pawn">/g;
    let hm;
    while ((hm = pawnRe.exec(mapsText)) !== null) pawnPositions.push(hm.index);

    const pawns = [];
    const seenIds = new Set();

    // Build extended block for a pawn that might carry nested pawns.
    // Carrier pawn's data (skills, age, story) wraps AROUND nested pawn XML,
    // so we need to look past nested pawn blocks to find the carrier's own data.
    const _fullBlock = (startIdx) => {
      let end = Math.min(startIdx + 800000, mapsText.length);
      // Find the next top-level <thing Class="Pawn"> (not nested in a container)
      let searchPos = startIdx + 50;
      while (searchPos < end) {
        const nextTop = mapsText.indexOf('<thing Class="Pawn">', searchPos);
        if (nextTop < 0 || nextTop >= end) break;
        // Check if it's nested inside a container (innerList/carryTracker)
        const before = mapsText.slice(Math.max(startIdx, nextTop - 500), nextTop);
        if (!/innerList|carryTracker|innerContainer/.test(before)) {
          end = nextTop;
          break;
        }
        searchPos = nextTop + 20;
      }
      return mapsText.slice(startIdx, end);
    };

    // Shared per-pawn field parser. Used for both colony pawns (from the maps
    // section) and off-map relatives (ghosts, from the worldPawns section) so
    // imported ghost cards carry the same rich data as colonists.
    // Returns the parsed data fields; the caller adds context (faction, role,
    // guestStatus, selected). `loadID` is supplied by the caller.
    const parsePawnFields = (block, shortBlock, loadID) => {
      const kindDef = _tag(block, 'kindDef');
      const raceDefName = this._directChildText(shortBlock, 'def') || null;

      // Parse name (from short block - appears before any nested pawns)
      const nick = _tag(shortBlock, 'nick');
      const first = _tag(shortBlock, 'first');
      const last = _tag(shortBlock, 'last');
      // Bonded animals (off-map relatives via the Bond relation) use NameSingle:
      // <name Class="NameSingle"><name>Fluffy</name></name>. Fall back to that.
      let singleName = '';
      if (!nick && !first && !last) {
        const ns = shortBlock.match(/<name Class="NameSingle">\s*<name>([^<]*)<\/name>/);
        if (ns) singleName = ns[1];
      }
      const pawnName = nick || (first && last ? `${first} ${last}` : first || singleName || 'Unknown');

      // Parse favorite color
      const favColorDef = _tag(block, 'favoriteColorDef') || '';

      // Detect if this pawn carries nested pawns (for age/skills disambiguation)
      // Check the full block since carried pawns may start right at shortBlock boundary
      const hasNestedPawn = /<(?:thing|li) Class="Pawn">/.test(block.slice(50));

      // Parse skills - use the LAST skills block (carrier's, not nested pawn's)
      const skills = {};
      const passions = {};
      // The raw passion string per skill ('None'/'Minor'/'Major' or a modded defName
      // like 'AS_CompetitivePassion'). Kept so the writer can preserve a modded
      // passion byte-for-byte and the editor can show/offer it by name.
      const passionDefs = {};
      SKILLS.forEach(s => { skills[s.id] = 0; passions[s.id] = 0; passionDefs[s.id] = 'None'; });

      const allSkillBlocks = [...block.matchAll(/<skills>\s*<skills>([\s\S]*?)<\/skills>/g)];
      const skillsData = allSkillBlocks.length > 0 ? allSkillBlocks[hasNestedPawn ? allSkillBlocks.length - 1 : 0][1] : '';
      if (skillsData) {
        const skillEntries = skillsData.split(/<li>/);
        for (const se of skillEntries) {
          const sDef = _tag(se, 'def')?.toLowerCase();
          const sLevel = parseInt(_tag(se, 'level')) || 0;
          const sPassion = _tag(se, 'passion') || 'None';
          const skillId = this.mapSkillDefToId(sDef);
          if (skillId) {
            skills[skillId] = sLevel;
            passionDefs[skillId] = sPassion;
            passions[skillId] = this._passionBucket(sPassion);
          }
        }
      }

      // Parse traits - use the LAST allTraits block
      // Each trait is stored as { def, degree } so degree-variants (e.g. Beauty 2
      // vs Beauty -1) are distinguishable and display correctly.
      const traits = [];
      const allTraitBlocks = [...block.matchAll(/<allTraits>([\s\S]*?)<\/allTraits>/g)];
      const traitsData = allTraitBlocks.length > 0 ? allTraitBlocks[hasNestedPawn ? allTraitBlocks.length - 1 : 0][1] : '';
      if (traitsData) {
        const traitItems = traitsData.split(/<li>/);
        for (const ti of traitItems) {
          const tDef = _tag(ti, 'def');
          if (!tDef) continue;
          const degreeStr = _tag(ti, 'degree');
          const degree = degreeStr ? parseInt(degreeStr) : 0;
          traits.push({ def: tDef, degree });
        }
      }

      // Parse gender - try shortBlock first (regular pawns have <gender> near header),
      // fall back to <bodyType>Male/Female</bodyType> for modded races (CreepJoiners etc.)
      // that lack a <gender> tag, then try <headType> as last resort.
      const genderMatch = shortBlock.match(/<gender>(Male|Female)<\/gender>/);
      let gender = genderMatch ? genderMatch[1] : '';
      if (!gender) {
        const bodyMatch = block.match(/<bodyType>(Male|Female)<\/bodyType>/);
        if (bodyMatch) gender = bodyMatch[1];
      }
      if (!gender) {
        const headMatch = block.match(/<headType>(Male|Female)/);
        if (headMatch) gender = headMatch[1];
      }

      // Parse incapable work tags and map to app incap IDs.
      // Saves use lowercase <disabledWorkTags> (e.g. "AllWork", "Violent, Caring");
      // older/other formats may use <DisabledWorkTags>. Check both.
      const incapable = [];
      const dwt = _tag(block, 'disabledWorkTags') || _tag(block, 'DisabledWorkTags');
      if (dwt && dwt.toLowerCase() !== 'none') {
        dwt.split(',').forEach(t => {
          const tag = t.trim();
          if (!tag || tag.toLowerCase() === 'none') return;
          // "AllWork" disables every work type - expand to the full incap list
          if (tag.toLowerCase() === 'allwork') {
            INCAP_OPTIONS.forEach(o => { if (!incapable.includes(o.id)) incapable.push(o.id); });
            return;
          }
          const mapped = WORKTAG_TO_INCAP[tag] || WORKTAG_TO_INCAP[tag.toLowerCase()];
          if (mapped) { if (!incapable.includes(mapped)) incapable.push(mapped); }
          else incapable.push(tag.toLowerCase()); // fallback for unknown/modded tags
        });
      }

      // Parse backstory - use the LAST story block
      const allStoryBlocks = [...block.matchAll(/<story>([\s\S]*?)<\/story>/g)];
      const storyData = allStoryBlocks.length > 0 ? allStoryBlocks[hasNestedPawn ? allStoryBlocks.length - 1 : 0][0] : '';
      const childhood = storyData ? _tag(storyData, 'childhood') : '';
      const adulthood = storyData ? _tag(storyData, 'adulthood') : '';

      // Parse xenotype - use the LAST xenotype entry
      const allXeno = [...block.matchAll(/<xenotype>(.*?)<\/xenotype>/g)];
      const xenotype = allXeno.length > 0 ? allXeno[hasNestedPawn ? allXeno.length - 1 : 0][1] : 'Baseliner';

      // Parse ideology reference (per-pawn: <ideo><ideo>Ideo_N</ideo></ideo>)
      const ideoMatch = block.match(/<ideo>\s*<ideo>(Ideo_\d+)<\/ideo>/);
      const ideoRef = ideoMatch ? ideoMatch[1] : '';
      // Certainty (0..1) in the pawn's ideo tracker, right after the ideo reference.
      const certMatch = block.match(/<ideo>\s*<ideo>Ideo_\d+<\/ideo>[\s\S]*?<certainty>([\d.]+)<\/certainty>/);
      const ideoCertainty = certMatch ? parseFloat(certMatch[1]) : null;

      // Parse royalty titles (per-pawn: <royalty><titles><li><faction/><def/>).
      // A pawn can hold titles from multiple factions; capture def + faction ref.
      const royaltyTitles = [];
      const royaltyBlock = block.match(/<royalty>([\s\S]*?)<\/royalty>/);
      if (royaltyBlock) {
        const titlesM = royaltyBlock[1].match(/<titles>([\s\S]*?)<\/titles>/);
        if (titlesM) {
          for (const li of titlesM[1].split(/<li>/)) {
            const tDef = (li.match(/<def>([^<]+)<\/def>/) || [])[1];
            if (!tDef) continue;
            const tFac = (li.match(/<faction>(Faction_\d+)<\/faction>/) || [])[1] || '';
            royaltyTitles.push({ def: tDef.trim(), factionRef: tFac });
          }
        }
      }

      // Parse equipped weapon + worn apparel (for the pawn card + loadout seeding).
      // Equipment: <equipment><equipment><innerList><li><def>..</def><quality>..
      let equippedWeapon = null;
      const eqM = block.match(/<equipment>\s*<equipment>\s*<innerList>([\s\S]*?)<\/innerList>/);
      if (eqM) {
        const firstLi = eqM[1].split(/<li\b/)[1];
        const wDef = firstLi ? (firstLi.match(/<def>([^<]+)<\/def>/) || [])[1] : null;
        if (wDef) equippedWeapon = { def: wDef, quality: (firstLi.match(/<quality>([^<]+)<\/quality>/) || [])[1] || '' };
      }
      // Worn apparel: <apparel...><wornApparel><innerList><li><def>..<stuff>..<quality>..
      const wornApparel = [];
      const waM = block.match(/<wornApparel>\s*<innerList>([\s\S]*?)<\/innerList>/);
      if (waM) {
        for (const part of waM[1].split(/<li\b/).slice(1)) {
          const aDef = (part.match(/<def>([^<]+)<\/def>/) || [])[1];
          if (!aDef) continue;
          wornApparel.push({
            def: aDef,
            stuff: (part.match(/<stuff>([^<]+)<\/stuff>/) || [])[1] || '',
            quality: (part.match(/<quality>([^<]+)<\/quality>/) || [])[1] || ''
          });
        }
      }

      // Parse lifetime records (DefMap -> flat <vals>). Map the validated vanilla
      // range (indices 0-42, RECORD_DEFS) to a defName->value object. Take the
      // FIRST records block (the pawn's own; carried pawns appear later).
      let records = null;
      const recM = block.match(/<records>\s*<records>\s*<vals>([\s\S]*?)<\/vals>/);
      if (recM && typeof RECORD_DEFS !== 'undefined') {
        const vals = (recM[1].match(/<li>([^<]*)<\/li>/g) || []).map(x => parseFloat(x.replace(/<\/?li>/g, '')) || 0);
        const obj = {};
        let any = false;
        RECORD_DEFS.forEach((rd, i) => {
          const v = vals[i] || 0;
          obj[rd.def] = v;
          if (v) any = true;
        });
        if (any) records = obj;
      }

      // Parse genes (endogenes + xenogenes) -these define the xenotype's actual effects
      const geneDefIds = [];
      const geneBlocks = [...block.matchAll(/<(?:endogenes|xenogenes)>([\s\S]*?)<\/(?:endogenes|xenogenes)>/g)];
      for (const gBlock of geneBlocks) {
        const geneDefs = gBlock[1].matchAll(/<def>([\w]+)<\/def>/g);
        for (const gm of geneDefs) geneDefIds.push(gm[1]);
      }

      // Parse colonist bar display order (playerSettings.displayOrder)
      // RimWorld sorts the colonist bar by displayOrder (asc), then thingIDNumber (asc)
      const playerSettingsMatch = block.match(/<playerSettings>([\s\S]*?)<\/playerSettings>/);
      const displayOrderStr = playerSettingsMatch ? _tag(playerSettingsMatch[1], 'displayOrder') : '';
      const displayOrder = displayOrderStr ? parseInt(displayOrderStr) : 999999;
      // Extract thingIDNumber from loadID (e.g. "Thing_Human12345" -> 12345)
      const thingIDMatch = (loadID || '').match(/(\d+)$/);
      const thingIDNumber = thingIDMatch ? parseInt(thingIDMatch[1]) : 999999;

      // Parse age - LAST entry for carrier, first for non-carrier
      let bioYears = null, chronoYears = null;
      const allBioTicks = [...block.matchAll(/<ageBiologicalTicks>(\d+)<\/ageBiologicalTicks>/g)];
      const allChronoTicks = [...block.matchAll(/<ageChronologicalTicks>(\d+)<\/ageChronologicalTicks>/g)];
      if (allBioTicks.length > 0) {
        const idx = hasNestedPawn ? allBioTicks.length - 1 : 0;
        bioYears = Math.floor(parseInt(allBioTicks[idx][1]) / 3600000);
      }
      if (allChronoTicks.length > 0) {
        const idx = hasNestedPawn ? allChronoTicks.length - 1 : 0;
        chronoYears = Math.floor(parseInt(allChronoTicks[idx][1]) / 3600000);
      }

      // Parse hediffs (health conditions, bionics, missing parts, injuries, implants)
      const hediffs = [];
      // The pawn's body def, read from the <body> on any part-bound hediff. For a
      // modded race this is NOT 'Human', which tells the editor the human part-index
      // table doesn't apply, and tells the writer which body to write on new parts.
      let pawnBodyDef = '';
      const allHediffBlocks = [...block.matchAll(/<hediffs>([\s\S]*?)<\/hediffs>/g)];
      const hediffData = allHediffBlocks.length > 0 ? allHediffBlocks[hasNestedPawn ? allHediffBlocks.length - 1 : 0][1] : '';
      if (hediffData) {
        // Use only top-level hediff entries so nested comp list items cannot
        // disturb the source observation index shared with the save writer.
        const hediffItems = this._topLevelLis(hediffData);
        for (let sourceObservationIndex = 0; sourceObservationIndex < hediffItems.length; sourceObservationIndex++) {
          const hi = hediffItems[sourceObservationIndex];
          if (!hi.trim()) continue;
          const hDef = _tag(hi, 'def');
          if (!hDef) continue;
          // Extract the hediff class from the li attribute if present
          const classMatch = hi.match(/Class="([^"]+)"/);
          const hClass = classMatch ? classMatch[1] : '';
          // Part is stored as <part><body>Human</body><index>N</index></part>
          // Extract the index and resolve to a human-readable body part name
          const partBlock = _tag(hi, 'part');
          let hPart = '';
          let hPartIdx = -1;
          let rawPartIndex = null;
          let hBody = '';
          let bodyDefReference = 'unknown';
          if (partBlock) {
            const bodyMatch = partBlock.match(/<body>([^<]+)<\/body>/);
            hBody = bodyMatch ? bodyMatch[1].trim() : '';
            bodyDefReference = hBody ? 'explicit' : 'unknown';
            if (hBody && hBody !== 'Human' && !pawnBodyDef) pawnBodyDef = hBody;
            const idxMatch = partBlock.match(/<index>(\d+)<\/index>/);
            if (idxMatch) {
              hPartIdx = parseInt(idxMatch[1], 10);
              rawPartIndex = hPartIdx;
              // Only trust the human part-name table for the standard Human body; a
              // modded race reuses these indices for different parts, so show the raw index.
              hPart = (!hBody || hBody === 'Human')
                ? ((typeof HUMAN_BODY_INDEX !== 'undefined' && HUMAN_BODY_INDEX[hPartIdx]) || ('body part #' + hPartIdx))
                : ('part #' + hPartIdx);
            } else {
              // Fallback: plain text part (older save format or simple tag)
              hPart = partBlock.replace(/<[^>]+>/g, '').trim();
            }
          }
          const severityRaw = _tag(hi, 'severity');
          const parsedSeverity = severityRaw === '' ? NaN : parseFloat(severityRaw);
          const hSeverity = Number.isFinite(parsedSeverity) ? parsedSeverity : null;
          // Field absence is not false. Scribe normally omits false defaults, so
          // only an explicit true/false marker establishes persistence state.
          const permanentMatch = hi.match(/<(?:isPermanent|permanent)>\s*(true|false)\s*<\/(?:isPermanent|permanent)>/i);
          const hPermanent = permanentMatch ? /^true$/i.test(permanentMatch[1]) : null;
          // Categorise: missing, replaced, implant, injury, or condition
          let hType = 'condition';
          if (hClass === 'Hediff_MissingPart' || hDef === 'MissingBodyPart') hType = 'missing';
          else if (hClass === 'Hediff_AddedPart') hType = 'replaced';
          else if (hClass === 'Hediff_Implant') hType = 'implant';
          else if (hClass === 'Hediff_Injury' || hDef === 'Cut' || hDef === 'Bruise' || hDef === 'Scratch' || hDef === 'Bite' || hDef === 'Gunshot' || hDef === 'Stab' || hDef === 'Burn' || hDef === 'Shredded' || hDef === 'Crush') hType = 'injury';
          // Skip minor/healed FRESH injuries (very low severity) to reduce noise -
          // but always keep permanent injuries (scars), even at low severity.
          if (hType === 'injury' && !hPermanent && hSeverity > 0 && hSeverity < 0.5) continue;
          // Skip some always-present non-interesting hediffs
          if (hDef === 'Pregnant' || hDef === 'PregnantHuman') continue;
          hediffs.push({
            def: hDef,
            part: hPart,
            partIdx: hPartIdx,
            rawPartIndex,
            bodyDefName: hBody || null,
            bodyDefReference,
            sourceObservationIndex,
            type: hType,
            severity: hSeverity,
            hediffClass: hClass,
            permanent: hPermanent,
          });
        }
      }

      // The FULL, unfiltered hediff list keyed by top-level <li> index, for the health
      // editor + .rws writer. Indexing matches the writer exactly (depth-aware split), so
      // a remove always targets the right <li> even with nested comp <li>s.
      const rawHediffs = this._topLevelLis(hediffData || '').map((li, i) => {
        const def = _tag(li, 'def') || '';
        const cm = li.match(/Class="([^"]+)"/);
        const cls = cm ? cm[1] : '';
        const pBlock = _tag(li, 'part');
        let partIdx = -1, partName = '';
        let rawPartIndex = null, bodyDefName = null, bodyDefReference = 'unknown';
        if (pBlock) {
          const bm = pBlock.match(/<body>([^<]+)<\/body>/);
          bodyDefName = bm ? bm[1].trim() : null;
          bodyDefReference = bodyDefName ? 'explicit' : 'unknown';
          const im = pBlock.match(/<index>(\d+)<\/index>/);
          if (im) {
            partIdx = parseInt(im[1], 10);
            rawPartIndex = partIdx;
            partName = (typeof HUMAN_BODY_INDEX !== 'undefined' && HUMAN_BODY_INDEX[partIdx]) || ('part #' + partIdx);
          }
          else partName = pBlock.replace(/<[^>]+>/g, '').trim();
        }
        const permanentMatch = li.match(/<(?:isPermanent|permanent)>\s*(true|false)\s*<\/(?:isPermanent|permanent)>/i);
        const permanent = permanentMatch ? /^true$/i.test(permanentMatch[1]) : null;
        const severityRaw = _tag(li, 'severity');
        const parsedSeverity = severityRaw === '' ? NaN : parseFloat(severityRaw);
        let type = 'condition';
        if (cls === 'Hediff_MissingPart' || def === 'MissingBodyPart') type = 'missing';
        else if (cls === 'Hediff_AddedPart') type = 'replaced';
        else if (cls === 'Hediff_Implant') type = 'implant';
        else if (cls === 'Hediff_Injury' || ['Cut', 'Bruise', 'Scratch', 'Bite', 'Gunshot', 'Stab', 'Burn', 'Shredded', 'Crush', 'Crack'].includes(def)) type = 'injury';
        return {
          index: i,
          sourceObservationIndex: i,
          def,
          hediffClass: cls,
          partIdx,
          rawPartIndex,
          partName,
          bodyDefName,
          bodyDefReference,
          severity: Number.isFinite(parsedSeverity) ? parsedSeverity : null,
          type,
          permanent,
        };
      }).filter(h => h.def);

      // Parse direct relations (Spouse, Lover, Parent, Child, etc.)
      const relations = [];
      const allRelBlocks = [...block.matchAll(/<directRelations>([\s\S]*?)<\/directRelations>/g)];
      const relData = allRelBlocks.length > 0 ? allRelBlocks[hasNestedPawn ? allRelBlocks.length - 1 : 0][1] : '';
      if (relData) {
        const relItems = relData.split(/<li>/);
        for (const ri of relItems) {
          const rDef = _tag(ri, 'def');
          if (!rDef) continue;
          const rOther = _tag(ri, 'otherPawn');
          const rTicks = parseInt(_tag(ri, 'startTicks')) || 0;
          if (rOther) relations.push({ def: rDef, otherPawnRef: rOther, startTicks: rTicks });
        }
      }

      return {
        loadID,
        name: pawnName,
        nickname: nick || '',
        firstName: first || '',
        lastName: last || '',
        kindDef,
        raceDefName,
        gender,
        skills,
        passions,
        passionDefs,
        traits,
        incapable,
        childhood,
        adulthood,
        xenotype,
        ideoRef,
        ideoCertainty,
        royaltyTitles,
        equippedWeapon,
        wornApparel,
        records,
        geneDefIds,
        hediffs,
        bodyDef: pawnBodyDef,
        rawHediffs,
        relations,
        bioAge: bioYears,
        chronoAge: chronoYears,
        favColorDef: favColorDef,
        displayOrder,
        thingIDNumber,
        // Incapacitated in bed (healthState Down) - a wound or modded condition (e.g.
        // an android awaiting a reactor) keeps them from ALL work for an unknowable
        // time, so the planner must not assign them anything.
        downed: ((shortBlock.match(/<healthState>(\w+)<\/healthState>/) || [])[1] || '') === 'Down',
      };
    };

    for (let i = 0; i < pawnPositions.length; i++) {
      const blockStart = pawnPositions[i];
      const shortEnd = (i + 1 < pawnPositions.length) ? pawnPositions[i + 1] : mapsText.length;
      const shortBlock = mapsText.slice(blockStart, shortEnd);

      // Must belong to the player faction (appears early in pawn XML)
      const factionMatch = shortBlock.match(/<faction>(Faction_\d+)<\/faction>/);
      if (!factionMatch || factionMatch[1] !== playerFactionRef) continue;

      // Must have a name (filters out animals, dryads, mechs)
      if (!/<nick>/.test(shortBlock) && !/<first>/.test(shortBlock)) continue;

      // Skip dead pawns
      const hsMatch = shortBlock.match(/<healthState>(.*?)<\/healthState>/);
      if (hsMatch && (hsMatch[1] === 'Dead' || hsMatch[1] === 'ShouldBeDead')) continue;

      // Skip prisoners and non-colonist guests (but keep slaves - they're part of the colony)
      const guestMatch = shortBlock.match(/<guestStatus>(.*?)<\/guestStatus>/);
      const guestStatus = guestMatch ? guestMatch[1] : '';
      if (guestStatus === 'Prisoner') continue;

      // Dedupe by loadID (match any Thing_ prefix, not just Thing_Human)
      // Some save formats use <loadID>Thing_X</loadID>, others use <id>X</id>
      const lidMatch = shortBlock.match(/<loadID>(Thing_\w+\d+)<\/loadID>/);
      const idMatch = !lidMatch ? shortBlock.match(/<id>(\w+\d+)<\/id>/) : null;
      const loadID = lidMatch ? lidMatch[1] : (idMatch ? 'Thing_' + idMatch[1] : '');
      if (loadID && seenIds.has(loadID)) continue;
      if (loadID) seenIds.add(loadID);

      // Get full block (spans past any nested/carried pawns)
      const block = _fullBlock(blockStart);

      // Must be a humanlike pawn, not an animal or mechanoid. The pawn's OWN trackers come
      // before any nested thing (carried items, fetus, etc.), so check the FIRST <skills>
      // and <story> tags: animals/mechs save these as <skills IsNull="True" /> /
      // <story IsNull="True" />, while humanlikes open a real <skills>/<story>. (Matching
      // anywhere in the full block let a named, bonded animal slip through via a nested
      // thing's skills block.)
      const ownSkills = block.match(/<skills\b[^>]*>/);
      if (!ownSkills || /IsNull="True"/i.test(ownSkills[0])) continue;
      const ownStory = block.match(/<story\b[^>]*>/);
      if (ownStory && /IsNull="True"/i.test(ownStory[0])) continue;

      // Parse all pawn fields via the shared parser, then add colony context.
      const fields = parsePawnFields(block, shortBlock, loadID);
      pawns.push({
        ...fields,
        ideoRole: pawnRoleMap[loadID] || '',
        selected: true,
        factionRef: factionMatch[1],
        factionName: factionNameMap[factionMatch[1]] || '',
        ideoName: ideoNameMap[fields.ideoRef] || '',
        royalTitle: royalTitleStr(fields.royaltyTitles),
        guestStatus: guestStatus || ''
      });
    }

    // Sort pawns to match in-game colonist bar order
    // RimWorld uses: displayOrder (asc), then thingIDNumber (asc) as tiebreaker
    pawns.sort((a, b) => (a.displayOrder - b.displayOrder) || (a.thingIDNumber - b.thingIDNumber));

    // -- Resolve ghost pawns (off-map relatives referenced by relations) --
    const colonyLoadIDs = new Set(pawns.map(p => p.loadID).filter(Boolean));
    const missingRefs = new Set();
    pawns.forEach(p => {
      if (!p.relations) return;
      p.relations.forEach(r => {
        if (r.otherPawnRef && !colonyLoadIDs.has(r.otherPawnRef)) {
          missingRefs.add(r.otherPawnRef);
        }
      });
    });

    const ghostPawns = [];
    if (missingRefs.size > 0) {
      // Scan the worldPawns section (off-map characters - relatives on other
      // tiles, faction members, exiled colonists, etc.) for referenced pawns.
      const wpStart = xmlString.indexOf('<worldPawns>');
      const wpEnd = xmlString.indexOf('</worldPawns>');
      const wpBlock = (wpStart >= 0 && wpEnd >= 0) ? xmlString.slice(wpStart, wpEnd) : '';

      // Off-map relatives live in worldPawns sub-collections. Those in <pawnsDead>
      // are DECEASED (not merely off-map) - track that range so we can flag them.
      const deadStart = wpBlock.indexOf('<pawnsDead>');
      const deadEnd = wpBlock.indexOf('</pawnsDead>');
      const isInDead = (idx) => deadStart >= 0 && deadEnd > deadStart && idx > deadStart && idx < deadEnd;

      // IMPORTANT: RimWorld stores a pawn's <id> WITHOUT the "Thing_" prefix
      // (e.g. <id>Human74168</id>), while relation references ADD the prefix
      // (e.g. <otherPawn>Thing_Human74168</otherPawn>). So to resolve a ref we
      // strip "Thing_" and look up the bare id. Off-map relatives live in the
      // worldPawns deep collections (pawnsAlive / pawnsMothballed / pawnsDead).

      // Extract the full <li>...</li> block for a pawn given the index of its
      // <id>. Walks back to the enclosing <li>, then bracket-matches forward to
      // the matching </li>, correctly skipping nested <li> (apparel, relations,
      // equipment) and self-closed <li ... /> tags.
      const extractLiBlock = (text, idIdx) => {
        let liStart = text.lastIndexOf('<li>', idIdx);
        const liAttr = text.lastIndexOf('<li ', idIdx);
        if (liAttr > liStart) liStart = liAttr;
        if (liStart < 0) return '';
        const tagRe = /<li(?:\s[^>]*?)?>|<\/li>/g;
        tagRe.lastIndex = liStart;
        let depth = 0, mt;
        while ((mt = tagRe.exec(text)) !== null) {
          const t = mt[0];
          if (t.endsWith('/>')) continue;          // self-closed <li ... />
          if (t === '</li>') {
            depth--;
            if (depth === 0) return text.slice(liStart, tagRe.lastIndex);
          } else {
            depth++;                               // opening <li> or <li ...>
          }
        }
        return '';
      };

      for (const ref of missingRefs) {
        // Strip the reference prefix to get the stored bare id, then find it.
        const bare = ref.replace(/^Thing_/, '');
        const idIdx = wpBlock ? wpBlock.indexOf('<id>' + bare + '</id>') : -1;
        if (idIdx >= 0) {
          const block = extractLiBlock(wpBlock, idIdx);
          if (block) {
            // shortBlock: the outer pawn's own fields only - everything before any
            // nested pawn (carried baby, corpse innerPawn). A fixed 4000-char cap
            // used to sit here, but modded saves bloat the pawn header (e.g.
            // customizationData, AIAgentData) far past it, so most off-map
            // relatives lost their name and gender and rendered as "?" ghosts.
            const nestedPawnIdx = block.indexOf('Class="Pawn"', 60);
            const shortBlock = nestedPawnIdx > 0 ? block.slice(0, nestedPawnIdx) : block;
            const fields = parsePawnFields(block, shortBlock, ref);
            const gFactionMatch = shortBlock.match(/<faction>(Faction_\d+)<\/faction>/);
            // Race def is the first <def> in the pawn <li>; non-Human => an animal
            // (bonded pets show up here via the Bond relation, often NameSingle).
            const raceDef = (shortBlock.match(/<def>([^<]+)<\/def>/) || [])[1] || '';
            const isAnimal = !!raceDef && raceDef !== 'Human';
            ghostPawns.push({
              ...fields,
              ghost: true,
              resolved: true,
              dead: isInDead(idIdx),   // deceased relative (not merely off-map)
              isAnimal,
              raceDef,
              factionName: gFactionMatch ? (factionNameMap[gFactionMatch[1]] || '') : '',
              ideoName: ideoNameMap[fields.ideoRef] || '',
              royalTitle: royalTitleStr(fields.royaltyTitles)
            });
            continue;
          }
        }
        // Genuinely pruned by RimWorld's world-pawn GC (distant/old relatives are
        // discarded to save space). Keep a minimal placeholder so the relation
        // line/label still renders on the graph as an unknown, unimportable node.
        ghostPawns.push({
          loadID: ref,
          name: 'Unknown',
          nickname: '',
          firstName: '',
          lastName: '',
          gender: '',
          ghost: true,
          resolved: false
        });
      }
    }

    return { meta, pawns, ghostPawns };
  },

  renderSaveImportPreview() {
    const { meta, pawns } = this._saveImportData;
    const body = document.getElementById('saveImportBody');
    const footer = document.getElementById('saveImportFooter');

    // Colony header
    let html = `<div style="display:flex; gap:16px; align-items:center; margin-bottom:16px; padding:12px; background:var(--bg2); border-radius:8px">
      <div style="font-size:calc(18px * var(--font-scale)); font-weight:700; color:var(--accent)">RWS</div>
      <div style="flex:1">
        <div style="font-weight:600; font-size:var(--f-base)">${_escapeHtml(meta.colonyName)}</div>
        <div style="font-size:var(--f-xs); color:var(--text2); margin-top:2px">
          ${_escapeHtml(meta.storytellerClean)} · ${_escapeHtml(meta.quadrum)} ${meta.day}, ${meta.year} · v${_escapeHtml(meta.gameVersion)}
        </div>
        ${meta.worldSeed ? `<div style="font-size:var(--f-xs); color:var(--text3); margin-top:2px" title="World generation seed from this save">World${meta.worldName ? ' "' + _escapeHtml(meta.worldName) + '"' : ''} · Seed "${_escapeHtml(meta.worldSeed)}"</div>` : ''}
      </div>
      <div style="text-align:right">
        <div style="font-size:var(--f-lg); font-weight:700">${pawns.length}</div>
        <div style="font-size:var(--f-xs); color:var(--text2)">pawns found</div>
      </div>
    </div>`;

    // Select all / none
    const allSelected = pawns.every(p => p.selected);
    html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
      <label style="font-size:var(--f-xs); color:var(--text2); cursor:pointer; display:flex; align-items:center; gap:6px"
        onclick="App._toggleAllSaveImport()">
        <input type="checkbox" ${allSelected ? 'checked' : ''} style="accent-color:var(--accent)"> Select all
      </label>
      <div style="font-size:var(--f-xs); color:var(--text2)" id="saveImportCount">${pawns.filter(p => p.selected).length} selected</div>
    </div>`;

    // Pawn cards
    html += `<div style="display:grid; gap:8px">`;
    pawns.forEach((p, i) => {
      // Top skills (level >= 4, sorted desc)
      const topSkills = SKILLS
        .filter(s => p.skills[s.id] >= 4)
        .sort((a, b) => p.skills[b.id] - p.skills[a.id])
        .slice(0, 5);

      const passionIcon = (sid) => {
        // Prefer the raw passion so a modded VSE passion shows its own ★ glyph.
        const raw = (p.passionDefs && p.passionDefs[sid]);
        if (this._isModdedPassion && this._isModdedPassion(raw)) return (this._passionMeta(raw).glyph) || '★';
        if (p.passions[sid] === 2) return '🔥🔥';
        if (p.passions[sid] === 1) return '🔥';
        return '';
      };

      const skillChips = topSkills.map(s =>
        `<span style="display:inline-flex; align-items:center; gap:3px; padding:2px 7px; background:var(--bg1); border-radius:4px; font-size:calc(11px * var(--font-scale)); white-space:nowrap">
          ${_escapeHtml(s.short)} ${p.skills[s.id]}${passionIcon(s.id) ? ' ' + passionIcon(s.id) : ''}
        </span>`
      ).join('');

      const traitChips = p.traits.slice(0, 4).map(t =>
        `<span style="display:inline-flex; padding:2px 6px; background:var(--accent-soft); border-radius:4px; font-size:calc(10px * var(--font-scale)); white-space:nowrap">${_escapeHtml(this._cleanModName(t.def))}</span>`
      ).join('');

      const isSlave = p.kindDef === 'Slave' || p.guestStatus === 'Slave';
      const kindLabel = isSlave ? '<span style="color:#e57373; font-size:calc(10px * var(--font-scale)); margin-left:4px">Slave</span>' :
                         p.kindDef === 'WildMan' ? '<span style="color:#81c784; font-size:calc(10px * var(--font-scale)); margin-left:4px">Wild</span>' : '';

      const ageStr = p.bioAge != null ? (p.chronoAge && p.chronoAge !== p.bioAge ? `${p.bioAge}y (chrono: ${p.chronoAge}y)` : `${p.bioAge}y`) : '';

      html += `<label style="display:flex; gap:12px; padding:10px 12px; background:var(--bg2); border-radius:8px; cursor:pointer; transition:background .15s; border:1px solid ${p.selected ? 'var(--accent)' : 'transparent'}"
        onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background='var(--bg2)'"
        onclick="App._toggleSaveImportPawn(${i}); event.preventDefault()">
        <input type="checkbox" ${p.selected ? 'checked' : ''} style="accent-color:var(--accent); margin-top:2px; pointer-events:none">
        <div style="flex:1; min-width:0">
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap">
            <span style="font-weight:600; font-size:var(--f-sm)">${_escapeHtml(p.name)}</span>
            ${kindLabel}
            ${p.gender ? `<span style="font-size:calc(10px * var(--font-scale)); color:var(--text3)">${p.gender === 'Male' ? 'M' : 'F'}</span>` : ''}
            <span style="font-size:calc(10px * var(--font-scale)); color:var(--text3)">${_escapeHtml(this._cleanModName(p.xenotype))}</span>
            ${p.ideoRole ? `<span style="font-size:calc(10px * var(--font-scale)); padding:1px 5px; background:var(--accent-soft); border-radius:3px; color:var(--accent)">${_escapeHtml((this.allRoles.find(r => r.id === p.ideoRole) || {}).label || p.ideoRole)}</span>` : ''}
            ${ageStr ? `<span style="font-size:calc(10px * var(--font-scale)); color:var(--text3)">${ageStr}</span>` : ''}
          </div>
          ${topSkills.length ? `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:6px">${skillChips}</div>` : '<div style="font-size:calc(11px * var(--font-scale)); color:var(--text3); margin-top:4px">No notable skills</div>'}
          ${p.traits.length ? `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px">${traitChips}</div>` : ''}
        </div>
      </label>`;
    });
    html += `</div>`;

    body.innerHTML = html;

    const selectedCount = pawns.filter(p => p.selected).length;
    const hasExisting = this.state.pawns.length > 0;
    footer.innerHTML = `
      <button class="btn btn-sm" onclick="App.closeSaveImport()">Cancel</button>
      ${hasExisting ? `<button class="btn btn-sm" onclick="App.confirmSaveImport('replace')" ${selectedCount === 0 ? 'disabled' : ''} title="Remove all existing pawns and import the selected ones">
        Replace All (${selectedCount})
      </button>` : ''}
      <button class="btn btn-sm btn-accent" onclick="App.confirmSaveImport('add')" ${selectedCount === 0 ? 'disabled' : ''}>
        ${hasExisting ? 'Add' : 'Import'} ${selectedCount} Pawn${selectedCount !== 1 ? 's' : ''}
      </button>`;
  },

  _toggleSaveImportPawn(index) {
    if (!this._saveImportData) return;
    this._saveImportData.pawns[index].selected = !this._saveImportData.pawns[index].selected;
    this.renderSaveImportPreview();
  },

  _toggleAllSaveImport() {
    if (!this._saveImportData) return;
    const allSelected = this._saveImportData.pawns.every(p => p.selected);
    this._saveImportData.pawns.forEach(p => p.selected = !allSelected);
    this.renderSaveImportPreview();
  },

  // -- STEP 2: OPTIONAL OFF-MAP RELATIVE IMPORT --
  // Lists the off-map relatives (ghosts) we could resolve from the save's
  // worldPawns and lets the user pick which to bring in as full pawn cards.
  renderGhostImportStep() {
    const data = this._saveImportData;
    if (!data) return;
    this._ghostStepShown = true;
    const body = document.getElementById('saveImportBody');
    const footer = document.getElementById('saveImportFooter');
    if (!body || !footer) return;

    const allGhosts = data.ghostPawns || [];
    const ghosts = allGhosts.filter(g => g.resolved);
    const unknowns = allGhosts.filter(g => !g.resolved);
    this._ghostStepList = ghosts;
    const colonists = data.pawns.filter(p => p.selected);

    // Describe how each off-map pawn relates to the chosen colonists
    // (e.g. "Mother of Alice", "Brother of Bob") for context.
    const relationCtx = (g) => {
      const bits = [];
      colonists.forEach(c => {
        (c.relations || []).forEach(rel => {
          if (rel.otherPawnRef !== g.loadID) return;
          const def = RELATION_DEFS.find(d => d.def === rel.def);
          let label = rel.def;
          if (def) label = (g.gender === 'Female' && def.labelFemale) ? def.labelFemale : def.label;
          bits.push(`${label} of ${c.name}`);
        });
      });
      return bits;
    };

    const total = allGhosts.length;
    const importLine = ghosts.length
      ? `You can import any of the ones below as pawn cards - they'll appear as normal pawns and as solid nodes on the Relations graph.`
      : `None of them have enough data in the save to import as pawn cards, so they're listed below for context only.`;
    let html = `<div style="margin-bottom:14px; padding:12px; background:var(--bg2); border-radius:8px; font-size:var(--f-sm); color:var(--text2); line-height:1.5">
      Found <b style="color:var(--text)">${total}</b> off-map relative${total !== 1 ? 's' : ''} referenced by your colonists' relationships. They live elsewhere on the world (other settlements, caravans, exiles) and aren't in your colony. ${importLine}
    </div>`;

    if (!ghosts.length && !unknowns.length) {
      html += `<div style="text-align:center; padding:30px 0; color:var(--text3)">No off-map relatives were found.</div>`;
    } else if (!ghosts.length) {
      html += `<div style="text-align:center; padding:24px 0; color:var(--text3); font-size:var(--f-sm)">No importable off-map relatives were found - see below.</div>`;
    } else {
      html += `<div style="display:flex; justify-content:flex-end; margin-bottom:8px">
        <button class="btn btn-xs" onclick="App._toggleAllGhostImport()">Toggle all</button>
      </div>`;
      html += `<div style="display:flex; flex-direction:column; gap:8px">`;
      ghosts.forEach((g, i) => {
        const ctx = relationCtx(g);
        const topSkills = SKILLS
          .map(s => ({ short: s.short, lvl: (g.skills && g.skills[s.id]) || 0 }))
          .filter(s => s.lvl > 0)
          .sort((a, b) => b.lvl - a.lvl)
          .slice(0, 3);
        const skillChips = topSkills.map(s =>
          `<span style="display:inline-flex; align-items:center; gap:3px; padding:2px 7px; background:var(--bg1); border-radius:4px; font-size:calc(11px * var(--font-scale)); white-space:nowrap">${_escapeHtml(s.short)} ${s.lvl}</span>`
        ).join('');
        const traitChips = (g.traits || []).slice(0, 3).map(t =>
          `<span style="display:inline-flex; padding:2px 6px; background:var(--accent-soft); border-radius:4px; font-size:calc(10px * var(--font-scale)); white-space:nowrap">${_escapeHtml(this._cleanModName(t.def))}</span>`
        ).join('');
        const ageStr = g.bioAge != null ? `${g.bioAge}y` : '';
        html += `<label style="display:flex; gap:12px; padding:10px 12px; background:var(--bg2); border-radius:8px; cursor:pointer; transition:background .15s; border:1px solid ${g.importSelected ? 'var(--accent)' : 'transparent'}"
          onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background='var(--bg2)'"
          onclick="App._toggleGhostImport(${i}); event.preventDefault()">
          <input type="checkbox" ${g.importSelected ? 'checked' : ''} style="accent-color:var(--accent); margin-top:2px; pointer-events:none">
          <div style="flex:1; min-width:0">
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap">
              <span style="font-weight:600; font-size:var(--f-sm)">${_escapeHtml(g.name)}</span>
              <span style="font-size:calc(10px * var(--font-scale)); padding:1px 5px; background:var(--surface3); border-radius:3px; color:var(--text3)">Off-map</span>
              ${g.gender ? `<span style="font-size:calc(10px * var(--font-scale)); color:var(--text3)">${g.gender === 'Male' ? 'M' : 'F'}</span>` : ''}
              ${ageStr ? `<span style="font-size:calc(10px * var(--font-scale)); color:var(--text3)">${ageStr}</span>` : ''}
            </div>
            ${ctx.length ? `<div style="font-size:calc(11px * var(--font-scale)); color:var(--accent); margin-top:3px">${_escapeHtml(ctx.join(', '))}</div>` : ''}
            ${topSkills.length ? `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:6px">${skillChips}</div>` : '<div style="font-size:calc(11px * var(--font-scale)); color:var(--text3); margin-top:4px">No notable skills</div>'}
            ${traitChips ? `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px">${traitChips}</div>` : ''}
          </div>
        </label>`;
      });
      html += `</div>`;
    }

    // Unknown off-map relatives: referenced by a colonist but not stored in the
    // save's world data (often dead, pruned, or never fully generated). They
    // can't be imported as pawn cards, so list them for context only.
    if (unknowns.length) {
      const unknownCtx = (g) => {
        const bits = [];
        colonists.forEach(c => {
          (c.relations || []).forEach(rel => {
            if (rel.otherPawnRef !== g.loadID) return;
            const def = RELATION_DEFS.find(d => d.def === rel.def);
            let label = rel.def;
            if (def) label = (g.gender === 'Female' && def.labelFemale) ? def.labelFemale : def.label;
            bits.push(`${label} of ${c.name}`);
          });
        });
        return bits;
      };
      html += `<div style="margin-top:18px; padding-top:14px; border-top:1px solid var(--border)">
        <div style="font-size:calc(11px * var(--font-scale)); font-weight:700; color:var(--text3); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:8px">Unknown (${unknowns.length}) - cannot import</div>
        <div style="font-size:var(--f-sm); color:var(--text3); line-height:1.5; margin-bottom:10px">These relatives are referenced by your colonists but aren't stored in the save's world data, so there isn't enough detail to import them. They still appear on the Relations graph as unknown off-map nodes.</div>
        <div style="display:flex; flex-direction:column; gap:6px">`;
      unknowns.forEach(g => {
        const ctx = unknownCtx(g);
        html += `<div style="display:flex; gap:10px; padding:8px 12px; background:var(--bg2); border-radius:8px; opacity:0.75">
          <div style="flex:1; min-width:0">
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap">
              <span style="font-weight:600; font-size:var(--f-sm)">${_escapeHtml(g.name || 'Unknown')}</span>
              <span style="font-size:calc(10px * var(--font-scale)); padding:1px 5px; background:var(--surface3); border-radius:3px; color:var(--text3)">Off-map</span>
            </div>
            ${ctx.length ? `<div style="font-size:calc(11px * var(--font-scale)); color:var(--text3); margin-top:3px">${_escapeHtml(ctx.join(', '))}</div>` : ''}
          </div>
        </div>`;
      });
      html += `</div></div>`;
    }

    body.innerHTML = html;

    const count = ghosts.filter(g => g.importSelected).length;
    footer.innerHTML = `
      <button class="btn btn-sm" onclick="App._ghostBackToPreview()">Back</button>
      ${ghosts.length
        ? (count === 0
            // Nothing ticked - importing 0 is identical to skipping, so collapse
            // the dead "Import 0" button into a single enabled Continue action.
            ? `<button class="btn btn-sm btn-accent" onclick="App._ghostSkipAndFinish()">Continue without importing</button>`
            : `<button class="btn btn-sm" onclick="App._ghostSkipAndFinish()">Skip relatives</button>
               <button class="btn btn-sm btn-accent" onclick="App._finishSaveImport(App._pendingImportMode)">
                 Import ${count} relative${count !== 1 ? 's' : ''}
               </button>`)
        : `<button class="btn btn-sm btn-accent" onclick="App._ghostSkipAndFinish()">Continue</button>`}`;
  },

  _toggleGhostImport(index) {
    const list = this._ghostStepList;
    if (!list || !list[index]) return;
    list[index].importSelected = !list[index].importSelected;
    this.renderGhostImportStep();
  },

  _toggleAllGhostImport() {
    const list = this._ghostStepList;
    if (!list || !list.length) return;
    const all = list.every(g => g.importSelected);
    list.forEach(g => g.importSelected = !all);
    this.renderGhostImportStep();
  },

  _ghostSkipAndFinish() {
    if (this._ghostStepList) this._ghostStepList.forEach(g => g.importSelected = false);
    this._finishSaveImport(this._pendingImportMode || 'add');
  },

  _ghostBackToPreview() {
    // Return to the colonist picker; re-show the relative step on next confirm.
    this._ghostStepShown = false;
    this.renderSaveImportPreview();
  },

  // Step 1 of import: colonists are chosen in the preview. If off-map relatives
  // (ghosts) were found and could be resolved from the save, offer an optional
  // second step letting the user import them as pawn cards too. Otherwise finish.
  confirmSaveImport(mode = 'add') {
    if (!this._saveImportData) return;
    const selected = this._saveImportData.pawns.filter(p => p.selected);
    if (!selected.length) return;

    // Offer the off-map relative step whenever ANY off-map relatives were
    // referenced, even if none could be fully resolved from the save. Resolved
    // ones are importable; unresolved ones are shown as info so the user
    // understands why a relative isn't available to import.
    const ghosts = this._saveImportData.ghostPawns || [];
    if (ghosts.length && !this._ghostStepShown) {
      this._pendingImportMode = mode;
      this.renderGhostImportStep();
      return;
    }
    this._finishSaveImport(mode);
  },

  _finishSaveImport(mode = 'add') {
    if (!this._saveImportData) return;
    const selected = this._saveImportData.pawns.filter(p => p.selected);
    if (!selected.length) return;

    // Off-map relatives the user opted to import as real pawn cards. They share
    // the same parsed-field shape as colonists, so they run through this same loop.
    const chosenGhosts = (this._saveImportData.ghostPawns || []).filter(g => g.resolved && g.importSelected);
    const toImport = selected.concat(chosenGhosts);
    const importedGhostIds = new Set();

    // Replace mode: clear all existing pawns first
    if (mode === 'replace') {
      this.state.pawns.forEach(ep => { delete this.state.priorities[ep.id]; });
      this.state.pawns = [];
    }

    // Build a set of existing pawn fingerprints for dedup
    const existingFingerprints = new Set();
    for (const ep of this.state.pawns) {
      const fp = (ep.thingIDNumber || '') + '|' + (ep.name || '');
      if (ep.thingIDNumber && ep.thingIDNumber !== 999999) existingFingerprints.add(fp);
    }

    let imported = 0;
    let skipped = 0;
    let dupes = 0;
    for (const p of toImport) {
      // Skip duplicates already in the app (only in add mode)
      const fp = (p.thingIDNumber || '') + '|' + (p.name || '');
      if (mode === 'add' && p.thingIDNumber && p.thingIDNumber !== 999999 && existingFingerprints.has(fp)) {
        dupes++;
        continue;
      }
      if (!this.state.settings.removeLimits && this.state.pawns.length >= this.CAPS.pawns) {
        skipped = toImport.length - imported;
        break;
      }
      const id = this._uniqueId();
      const pawn = this.createPawnObject(id, p.name, { ...p.skills }, { ...p.passions }, p.passionDefs ? { ...p.passionDefs } : null);

      // Store loadID for relation graph edge resolution
      if (p.loadID) pawn.loadID = p.loadID;

      // Downed in the save (incapacitated in bed): blocks every job assignment until
      // a later import shows them recovered, or the user clears the flag by hand.
      if (p.downed) pawn.downed = true;

      // Store gene def IDs for romance/orientation estimation
      if (p.geneDefIds && p.geneDefIds.length) pawn.geneDefIds = p.geneDefIds;

      // Store nickname/first/last for display
      if (p.nickname) pawn.nickname = p.nickname;
      if (p.firstName) pawn.firstName = p.firstName;
      if (p.lastName) pawn.lastName = p.lastName;

      // Apply favorite color as avatar background
      if (p.favColorDef) {
        const hex = this._rimColorToHex(p.favColorDef);
        if (hex) pawn.avatarBg = hex;
      }

      // Enrich with extra parsed data
      if (p.xenotype) {
        const cleanLabel = this._cleanModName(p.xenotype);
        const xLower = cleanLabel.toLowerCase().replace(/\s+/g, '_');
        const allXeno = this.allXenotypes;
        if (allXeno[xLower]) {
          pawn.xenotype = xLower;
        } else {
          // Try fuzzy match by label (clean and raw)
          const match = Object.entries(allXeno).find(([, x]) =>
            x.label.toLowerCase() === cleanLabel.toLowerCase() ||
            x.label.toLowerCase() === p.xenotype.toLowerCase()
          );
          if (match) {
            pawn.xenotype = match[0];
          } else {
            // Auto-create custom xenotype from pawn's gene data
            const xId = xLower;
            if (!this.state.customXenotypes[xId]) {
              const geneData = this._deriveXenoDataFromGenes(p.geneDefIds || []);
              const xenoDefLabel = this._defLabel(p.xenotype);
              this.state.customXenotypes[xId] = {
                label: xenoDefLabel ? xenoDefLabel.charAt(0).toUpperCase() + xenoDefLabel.slice(1) : cleanLabel,
                icon: 'xeno',
                color: '#888888',
                genes: p.geneDefIds || [],
                skillMods: geneData.skillMods,
                incapable: geneData.incapable,
                passions: geneData.passions,
                uvSensitivity: geneData.uvSensitivity,
                darkVision: geneData.darkVision,
                fireWeakness: geneData.fireWeakness,
                notes: geneData.notes,
                modSource: 'Imported from save (gene-derived)'
              };
            } else if (this.state.customXenotypes[xId] && Object.keys(this.state.customXenotypes[xId].skillMods || {}).length === 0 && (p.geneDefIds || []).length > 0) {
              // Existing custom xeno has no skill data -enrich from this pawn's genes
              const geneData = this._deriveXenoDataFromGenes(p.geneDefIds);
              Object.assign(this.state.customXenotypes[xId], {
                genes: p.geneDefIds,
                skillMods: geneData.skillMods,
                incapable: geneData.incapable,
                passions: geneData.passions,
                uvSensitivity: geneData.uvSensitivity,
                darkVision: geneData.darkVision,
                fireWeakness: geneData.fireWeakness,
                notes: geneData.notes,
                modSource: 'Imported from save (gene-derived)'
              });
            }
            pawn.xenotype = xId;
          }
        }
      }

      // Store age
      if (p.bioAge != null) pawn.bioAge = p.bioAge;
      if (p.chronoAge != null) pawn.chronoAge = p.chronoAge;
      pawn.raceDefName = p.raceDefName || null;

      // Store current faction and ideology (extracted from the save)
      if (p.factionName) pawn.factionName = p.factionName;
      if (p.ideoName) pawn.ideoName = p.ideoName;
      if (p.royalTitle) pawn.royalTitle = p.royalTitle;
      if (p.equippedWeapon) pawn.equippedWeapon = p.equippedWeapon;
      if (Array.isArray(p.wornApparel) && p.wornApparel.length) pawn.wornApparel = p.wornApparel;
      if (p.records) pawn.records = p.records;

      // Store colonist bar order for "Game Order" sort
      pawn.displayOrder = p.displayOrder ?? 999999;
      pawn.thingIDNumber = p.thingIDNumber ?? 999999;

      // Store gender
      if (p.gender) {
        pawn.gender = p.gender;
      }

      // Map traits from def IDs to our format (traits are { def, degree } objects)
      // Vanilla RimWorld uses degree-variant traits where one def + degree = different
      // in-game trait names. This lookup resolves them to our app's known trait IDs.
      // Keep the exact RimWorld (def, degree) traits from the save, untouched by the
      // app's lossy id mapping below. The trait editor and the .rws writer use this so
      // vanilla and modded traits round-trip precisely.
      pawn._saveTraits = (p.traits || []).map(t => ({ def: t.def, degree: parseInt(t.degree, 10) || 0 }));
      // Ideology certainty (0..1) from the save, for the certainty editor + export.
      if (typeof p.ideoCertainty === 'number' && isFinite(p.ideoCertainty)) pawn.ideoCertainty = p.ideoCertainty;
      // Full hediff list (def + part + severity, keyed by top-level <li> index) for the
      // health editor + export.
      pawn._saveHediffs = Array.isArray(p.rawHediffs) ? p.rawHediffs : [];
      // Direct relations from the save (def + otherPawn loadID) for the relationship
      // editor + export. otherPawn is a Thing_ id that must exist in the save.
      pawn._saveRelations = (p.relations || []).map(r => ({ def: r.def, otherPawn: r.otherPawnRef })).filter(r => r.def && r.otherPawn);
      if (p.traits && p.traits.length) {
        pawn.traits = p.traits.map(({ def: tDef, degree }) => {
          // Degree-variant vanilla trait lookup (def -> { degree: appTraitId })
          const degreeMap = {
            'Industriousness': { 2: 'industrious', 1: 'hard_worker', '-1': 'lazy', '-2': 'slothful' },
            'SpeedOffset':     { 2: 'jogger', 1: 'fast_walker', '-1': 'slowpoke' },
            'NaturalMood':     { 2: 'sanguine', 1: 'optimist', '-1': 'pessimist', '-2': 'depressive' },
            'Nerves':          { 2: 'iron_willed', 1: 'steadfast', '-1': 'nervous', '-2': 'volatile' },
            'PsychicSensitivity': { 2: 'psychically_hypersensitive', 1: 'psychically_sensitive', '-1': 'psychically_dull', '-2': 'psychically_deaf' },
            'DrugDesire':      { 2: 'chemical_fascination', 1: 'chemical_interest', '-1': 'teetotaler' },
            'Beauty':          { 2: 'beautiful', 1: 'pretty', '-1': 'ugly', '-2': 'staggeringly_ugly' },
            'AG_Beauty':       { 2: 'beautiful', 1: 'pretty', '-1': 'ugly', '-2': 'staggeringly_ugly' },
            'ShootingAccuracy': { 1: 'careful_shooter', '-1': 'trigger_happy' },
            'AnnoyingVoice':   { 0: 'annoying_voice' },
            'CreepyBreathing': { 0: 'creepy_breathing' },
            'NightOwl':        { 0: 'night_owl' },
            'TooSmart':        { 0: 'too_smart' },
            'Bisexual':        { 0: 'bisexual' },
            'Gay':             { 0: 'gay' },
            'Asexual':         { 0: 'asexual' },
            'BodyPurist':      { 0: 'body_purist' },
            'Transhumanist':   { 0: 'body_modder' },
            'QuickSleeper':    { 0: 'quick_sleeper' },
            'GreatMemory':     { 0: 'great_memory' },
            'FastLearner':     { 0: 'fast_learner' },
            'SlowLearner':     { 0: 'slow_learner' },
            'SuperImmune':     { 0: 'super_immune' },
            'Neurotic':        { 1: 'neurotic', 2: 'very_neurotic' },
            'Bloodlust':       { 0: 'bloodlust' },
            'Psychopath':      { 0: 'psychopath' },
            'Cannibal':        { 0: 'cannibal' },
            'Pyromaniac':      { 0: 'pyromaniac' },
            'IronWilled':      { 0: 'iron_willed' },
            'Recluse':         { 0: 'recluse' },
            'HatesDumbLabor':  { 0: 'hates_dumb_labor' },
          };

          // Check degree-variant lookup first
          const dMap = degreeMap[tDef];
          if (dMap) {
            const mapped = dMap[String(degree)] || dMap[String(0)];
            if (mapped) {
              const found = TRAITS.find(t => t.id === mapped);
              if (found) return found.id;
            }
          }

          const cleanLabel = this._cleanModName(tDef);
          const tId = cleanLabel.replace(/([a-z])([A-Z])/g, '$1_$2').replace(/\s+/g, '_').toLowerCase();
          // Check known TRAITS array (direct match and common variations)
          const known = TRAITS.find(t =>
            t.id === tId || t.id === tDef.toLowerCase() ||
            t.label === tDef || t.label === cleanLabel ||
            t.label.toLowerCase() === cleanLabel.toLowerCase()
          );
          if (known) return known.id;
          // Check custom traits (keyed by id)
          const customMatch = Object.keys(this.state.customTraits).find(k =>
            k === tId || k === tDef.toLowerCase() || k === tDef.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()
          );
          if (customMatch) return customMatch;
          // Auto-create custom trait with cleaned human-readable name
          if (!this.state.customTraits[tId]) {
            // Try degree-variant label from game XMLs first, then bare def, then fallback
            const defDegreeLabel = this._defLabels && this._defLabels[tDef + '|' + degree];
            const defLabel = this._defLabels && this._defLabels[tDef];
            const resolvedLabel = defDegreeLabel ? defDegreeLabel.label : (defLabel ? defLabel.label : cleanLabel);
            const rawDesc = defDegreeLabel ? (defDegreeLabel.desc || '') : (defLabel ? (defLabel.desc || '') : '');
            const resolvedDesc = (typeof _cleanGrammarText === 'function') ? _cleanGrammarText(rawDesc) : rawDesc;
            this.state.customTraits[tId] = {
              label: resolvedLabel.charAt(0).toUpperCase() + resolvedLabel.slice(1),
              description: resolvedDesc || 'Imported from save file',
              workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {},
              color: '#888888',
              modSource: 'Imported from save'
            };
          }
          return tId;
        });
      }

      // Map incapable work tags
      if (p.incapable && p.incapable.length) {
        pawn.incapable = p.incapable;
      }

      // Apply ideology role detected from save file
      if (p.ideoRole) {
        pawn.role = p.ideoRole;
      }

      // Apply backstories from save file
      if (p.childhood) {
        pawn.childhood = p.childhood;
        // Auto-create custom backstory entry if not in vanilla data
        if (!resolveBackstory(p.childhood) && !(this.state.customBackstories || {})[p.childhood]) {
          if (!this.state.customBackstories) this.state.customBackstories = {};
          const bsLabel = this._defLabel(p.childhood) || p.childhood.replace(/([A-Z])/g, ' $1').trim();
          this.state.customBackstories[p.childhood] = {
            slot: 'child', title: bsLabel,
            titleShort: bsLabel.split(' ').slice(0, 2).join(' '),
            skills: {}, incapable: [], modSource: 'Imported from save'
          };
        }
      }
      if (p.adulthood) {
        pawn.adulthood = p.adulthood;
        if (!resolveBackstory(p.adulthood) && !(this.state.customBackstories || {})[p.adulthood]) {
          if (!this.state.customBackstories) this.state.customBackstories = {};
          const bsLabel = this._defLabel(p.adulthood) || p.adulthood.replace(/([A-Z])/g, ' $1').trim();
          this.state.customBackstories[p.adulthood] = {
            slot: 'adult', title: bsLabel,
            titleShort: bsLabel.split(' ').slice(0, 2).join(' '),
            skills: {}, incapable: [], modSource: 'Imported from save'
          };
        }
      }

      // Apply health conditions from save file
      if (p.hediffs && p.hediffs.length) {
        pawn.health = p.hediffs;
      }
      // Remember the race body (non-Human for modded races) for the health editor.
      if (p.bodyDef) pawn.bodyDef = p.bodyDef;

      // Apply relations from save file
      if (p.relations && p.relations.length) {
        pawn.relations = p.relations;
      }

      this.state.pawns.push(pawn);
      existingFingerprints.add(fp);
      this.state.priorities[id] = {};
      this.allJobs.forEach(j => this.state.priorities[id][j.id] = null);
      if (p.ghost && p.loadID) importedGhostIds.add(p.loadID);
      imported++;
    }

    // Invalidate backstory cache since custom backstories may have been added
    this._invalidateBsCache();

    // Reflect the in-game colonist bar order: every pawn from this save - newly added
    // OR merged into an existing card - sorts by displayOrder then thingIDNumber,
    // exactly as RimWorld orders the bar (Pawn_PlayerSettings.displayOrder). Hand-made
    // pawns keep their relative order after the save's colonists (stable sort).
    const saveOrder = new Map();
    (this._saveImportData.pawns || []).forEach(sp => {
      if (sp.loadID) saveOrder.set(sp.loadID, (sp.displayOrder != null ? sp.displayOrder : 999999) * 1e7 + (sp.thingIDNumber != null ? sp.thingIDNumber : 9999999));
    });
    if (saveOrder.size) {
      this.state.pawns.sort((a, b) => {
        const ka = a.loadID != null && saveOrder.has(a.loadID) ? saveOrder.get(a.loadID) : Infinity;
        const kb = b.loadID != null && saveOrder.has(b.loadID) ? saveOrder.get(b.loadID) : Infinity;
        return ka - kb || 0;
      });
    }

    const ghostsImported = importedGhostIds.size;
    const relSuffix = ghostsImported > 0 ? ` (incl. ${ghostsImported} off-map relative${ghostsImported !== 1 ? 's' : ''})` : '';
    if (dupes > 0 && imported === 0) {
      this.toast(`All ${dupes} selected pawns already exist. No duplicates imported.`);
    } else if (dupes > 0) {
      this.toast(`Imported ${imported} pawns${relSuffix}. ${dupes} duplicate${dupes > 1 ? 's' : ''} skipped.`);
    } else if (skipped > 0) {
      this.toast(`Imported ${imported} pawns${relSuffix}. ${skipped} skipped (limit, ${this.CAPS.pawns}). Remove the cap in Settings > Behaviour.`);
    } else if (mode === 'replace') {
      this.toast(`Replaced with ${imported} pawns from save${relSuffix}.`);
    } else if (ghostsImported > 0) {
      this.toast(`Imported ${imported} pawns${relSuffix}.`);
    }

    // Grab meta and ghost pawns before closing (closeSaveImport nulls _saveImportData)
    const meta = this._saveImportData.meta;
    // Drop any ghosts that were just imported as real pawn cards - they now have
    // proper colony nodes, so keeping them as ghosts would duplicate the node.
    const ghostPawns = (this._saveImportData.ghostPawns || []).filter(g => !importedGhostIds.has(g.loadID));

    // Store remaining ghost pawns (off-map relatives) in state for the relations graph
    this.state.ghostPawns = ghostPawns;

    // Remember the imported save's version + which expansions it carried, so the
    // relevant tabs can show a "not relevant for your version/DLC" notice.
    this.state.importMeta = {
      gameVersion: meta.gameVersion || 'Unknown',
      versionNum: (meta.versionNum != null ? meta.versionNum : null),
      ideology: !!(meta.dlc && meta.dlc.ideology),
      biotech: !!(meta.dlc && meta.dlc.biotech),
      royalty: !!(meta.dlc && meta.dlc.royalty),
      ticks: Number.isFinite(meta.absTicks) ? meta.absTicks : (Number.isFinite(meta.ticks) ? meta.ticks : null), // in-game ABSOLUTE tick (ticksGame + gameStartAbsTick) for the logo date line
      year: meta.year || null, quadrum: meta.quadrum || null, day: meta.day || null,
      modIds: Array.isArray(meta.modIds) ? meta.modIds : [],
      modNames: Array.isArray(meta.modNames) ? meta.modNames : [],
      worldSeed: meta.worldSeed || '',
      worldName: meta.worldName || '',
      planetCoverage: (meta.planetCoverage != null ? meta.planetCoverage : null),
    };
    // Fast lookup set of this save's active mod packageIds (lowercased), for the
    // "content from a mod not in this save" warning across the editors.
    this.state.saveModIdSet = new Set(this.state.importMeta.modIds);

    this.closeSaveImport();
    // Future-proof: surface any modded passion the imported pawns actually carry,
    // even if no matching def was scanned, so they show + are pickable + persist.
    if (typeof this._mergeSeenPassionsIntoCatalog === 'function') this._mergeSeenPassionsIntoCatalog();
    this._showRefreshBtn();
    this.renderAll();
    this._updateLogoDate(); // switch the logo date line to the save's in-game time
    this.triggerAutoSave();

    // Silently add timeline event for the import (no modal)
    if (!this.state.timeline) this.state.timeline = [];
    this.state.timeline.push({
      id: Math.random().toString(36).slice(2, 9),
      title: `Imported ${imported} pawn${imported !== 1 ? 's' : ''} from save`,
      category: 'recruit',
      year: meta.year || 5500,
      quadrum: QUADRUMS.indexOf(meta.quadrum) + 1 || 1,
      day: meta.day || 1,
      description: `Colony: ${meta.colonyName} (${meta.storytellerClean}, ${meta.quadrum} ${meta.day} ${meta.year})`,
      ts: Date.now()
    });

    // Auto-populate raid calculator from save metadata
    this._applyRaidFromSave(meta, imported);

    // Match the Priorities table mode to the save's Work tab setting.
    if (typeof meta.useWorkPriorities === 'boolean') {
      this.state.settings.manualPriorities = meta.useWorkPriorities;
    }

    // Apply ideology from save (memes + precepts)
    if (meta.ideology && meta.ideology.memes.length > 0) {
      this._applyIdeoFromSave(meta.ideology);
    }

    // Store the full list of every ideology in the save for the browser modal.
    if (Array.isArray(meta.allIdeologies)) {
      this.state.savedIdeologies = meta.allIdeologies;
    }
    // Remember the player's own colony ideology (parsed with precept stages) so the planner
    // can be reloaded from it via the pill. Session-only, like savedIdeologies.
    this.state.savedPlayerIdeo = (meta.ideology && (meta.ideology.memes || []).length) ? meta.ideology : null;

    // Refresh the open tab now that ALL imported state (incl. ideology pills) is populated, so
    // it updates without a manual tab switch. Must run after the assignments above.
    this._renderTabView(this.state.activeTab);

    // Proactively warm modded content for the just-imported colony (deferred so it does not
    // contend with the import's own rendering; force-refreshes even if warmed earlier).
    if (typeof this._prefetchModData === 'function') setTimeout(() => this._prefetchModData(true), 2000);
  },

  _applyIdeoFromSave(ideoData) {
    if (!ideoData) return;
    const ideo = this.state.ideology || { memes: [], precepts: {}, name: '' };

    // Set ideology name
    if (ideoData.name) ideo.name = ideoData.name;

    // Map memes from save defNames to app meme IDs
    const resolvedMemes = [];
    for (const memeDef of ideoData.memes) {
      // Try exact match in vanilla IDEO_MEMES
      const vanilla = (typeof IDEO_MEMES !== 'undefined' ? IDEO_MEMES : []).find(m =>
        m.id === memeDef.toLowerCase() ||
        m.id === memeDef.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase() ||
        m.label.replace(/\s+/g, '').toLowerCase() === memeDef.toLowerCase()
      );
      if (vanilla) {
        resolvedMemes.push(vanilla.id);
      } else {
        // Auto-create custom meme from scanned def data or raw defName
        const memeId = memeDef.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/\s+/g, '_');
        if (!this.state.customMemes) this.state.customMemes = {};
        if (!this.state.customMemes[memeId]) {
          const defEntry = this._defLabels ? this._defLabels[memeDef] : null;
          this.state.customMemes[memeId] = {
            label: defEntry ? defEntry.label.charAt(0).toUpperCase() + defEntry.label.slice(1) : this._cleanModName(memeDef),
            category: defEntry && defEntry.memeCategory ? defEntry.memeCategory : 'Theme',
            impact: defEntry && defEntry.memeImpact ? defEntry.memeImpact : 'medium',
            color: '#888888',
            description: defEntry && defEntry.desc ? defEntry.desc : 'Imported from save',
            effects: {},
            conflicts: defEntry && defEntry.memeConflicts ? defEntry.memeConflicts.map(c => c.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()) : [],
            modSource: 'Imported from save'
          };
        }
        resolvedMemes.push(memeId);
      }
    }
    ideo.memes = resolvedMemes;

    // Map precepts from save
    for (const p of ideoData.precepts) {
      // Try to match to vanilla IDEO_PRECEPT_DEFS by defName
      const pId = p.def.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/\s+/g, '_');
      const vanillaDef = (typeof IDEO_PRECEPT_DEFS !== 'undefined' ? IDEO_PRECEPT_DEFS : []).find(pd =>
        pd.id === pId || pd.id === p.def.toLowerCase()
      );
      if (vanillaDef) {
        // Try to match the level/option by tipLabel or class name
        if (p.tipLabel) {
          const opt = vanillaDef.options.find(o => o.label.toLowerCase() === p.tipLabel.toLowerCase());
          if (opt) ideo.precepts[vanillaDef.id] = opt.id;
        }
      } else {
        // Auto-create custom precept entry
        if (!this.state.customPrecepts) this.state.customPrecepts = {};
        if (!this.state.customPrecepts[pId]) {
          const defEntry = this._defLabels ? this._defLabels[p.def] : null;
          this.state.customPrecepts[pId] = {
            label: defEntry ? defEntry.label.charAt(0).toUpperCase() + defEntry.label.slice(1) : this._cleanModName(p.def),
            description: defEntry && defEntry.desc ? defEntry.desc : 'Imported from save',
            class: p.class || '',
            modSource: 'Imported from save'
          };
        }
      }
    }

    // Map rituals from save
    if (ideoData.rituals && ideoData.rituals.length) {
      const resolvedRituals = [];
      const vanillaRituals = typeof IDEO_RITUALS !== 'undefined' ? IDEO_RITUALS : [];
      for (const r of ideoData.rituals) {
        const rId = r.def.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/\s+/g, '_');
        // Try match to vanilla
        const vanilla = vanillaRituals.find(vr =>
          vr.id === rId || vr.id === r.def.toLowerCase() ||
          vr.label.toLowerCase() === (r.label || '').toLowerCase()
        );
        if (vanilla) {
          if (!resolvedRituals.includes(vanilla.id)) resolvedRituals.push(vanilla.id);
        } else {
          // Auto-create custom ritual
          if (!this.state.customRituals) this.state.customRituals = {};
          if (!this.state.customRituals[rId]) {
            const defEntry = this._defLabels ? this._defLabels[r.def] : null;
            this.state.customRituals[rId] = {
              label: r.label || (defEntry ? defEntry.label.charAt(0).toUpperCase() + defEntry.label.slice(1) : this._cleanModName(r.def)),
              description: defEntry && defEntry.desc ? defEntry.desc : 'Imported from save',
              category: 'Modded',
              modSource: 'Imported from save'
            };
          }
          if (!resolvedRituals.includes(rId)) resolvedRituals.push(rId);
        }
      }
      ideo.rituals = resolvedRituals;
    }

    this.state.ideology = ideo;
  },

  _applyRaidFromSave(meta, pawnCount) {
    const r = this.state.raid;
    // Map storyteller defName to app key, or auto-add as custom storyteller
    const stKey = this._STORYTELLER_DEF_MAP[meta.storyteller];
    if (stKey) {
      r.storyteller = stKey;
    } else if (meta.storyteller && meta.storyteller !== 'Unknown') {
      // Modded storyteller: resolve label and raid data from scanned mod XMLs
      const defEntry = this._defLabels && this._defLabels[meta.storyteller];
      const defLabel = defEntry ? defEntry.label : null;
      const cleanName = defLabel || this._cleanModName(meta.storyteller) || meta.storyteller;
      const stId = meta.storyteller.toLowerCase().replace(/\s+/g, '_');

      // Derive raid interval from extracted threat model data
      let minDays = 4, maxDays = 6, randomFactor = false;
      let randomLow = 0.5, randomHigh = 1.5;
      if (defEntry && defEntry.threatModel === 'random') {
        // RandomMain storytellers: max gap is maxThreatBigInterval, min is ~mtbDays
        minDays = Math.round(defEntry.mtbDays || 2);
        maxDays = Math.round(defEntry.maxThreatBigInterval || 13);
        randomFactor = true;
        randomLow = defEntry.randomFactorLow || 0.5;
        randomHigh = defEntry.randomFactorHigh || 1.5;
      } else if (defEntry && defEntry.threatModel === 'cycle') {
        // OnOffCycle storytellers: raid window is onDays to onDays+offDays
        minDays = Math.round(defEntry.onDays || 4);
        maxDays = Math.round((defEntry.onDays || 4) + (defEntry.offDays || 6));
        randomFactor = false;
      } else if (defEntry && defEntry.threatModel === 'wealth') {
        // Wealth-step storytellers: raids tied to wealth gain, not time
        minDays = 1;
        maxDays = 30;
        randomFactor = false;
      }

      if (!r.customStorytellers) r.customStorytellers = [];
      const existing = r.customStorytellers.find(s => s.id === stId);
      if (existing) {
        // Update from def scan data
        if (defLabel && existing.name !== defLabel) existing.name = defLabel;
        if (defEntry && defEntry.threatModel) {
          existing.minDays = minDays;
          existing.maxDays = maxDays;
          existing.randomFactor = randomFactor;
          if (randomFactor) { existing.randomLow = randomLow; existing.randomHigh = randomHigh; }
        }
      } else {
        const entry = { id: stId, name: cleanName, minDays, maxDays, randomFactor };
        if (randomFactor) { entry.randomLow = randomLow; entry.randomHigh = randomHigh; }
        r.customStorytellers.push(entry);
      }
      r.storyteller = stId;
    }
    // Map difficulty defName to app key
    if (meta.difficultyDef && this._DIFFICULTY_DEF_MAP[meta.difficultyDef]) {
      r.difficulty = this._DIFFICULTY_DEF_MAP[meta.difficultyDef];
    }
    // Set days passed and colonist count from save
    if (meta.daysPassed > 0) r.daysPassed = meta.daysPassed;
    if (Number.isFinite(meta.dateOffset)) r.dateOffset = meta.dateOffset; // real calendar offset for date display

    if (pawnCount > 0) r.colonists = pawnCount;
    // Reset raid tracking to current day so the tracker does not claim you are
    // hundreds of days overdue.  The app cannot know your actual last raid date.
    if (meta.daysPassed > 0) r.lastRaidDay = meta.daysPassed;

    // Import the colony's real wealth from the save's History wealth recorders (decoded in
    // main). Use the split fields + split mode so the storyteller wealth (items + creatures +
    // buildings x 0.5) matches RimWorld; total is the storyteller-equivalent for "Use total".
    if (meta.wealth && Number.isFinite(meta.wealth.total)) {
      const w = meta.wealth;
      r.wealthItems = w.items;
      r.wealthBuildings = w.buildings;
      r.wealthCreatures = w.creatures;
      r.wealthTotal = Math.round(w.items + w.creatures + w.buildings * 0.5);
      r.useWealthTotal = false;
    }
  },

  _copyErrorToClipboard() {
    const msg = this._lastImportError || 'Unknown error';
    let ok = false;
    // Electron clipboard
    try {
      if (window.overlay?.clipboardWrite) { window.overlay.clipboardWrite(msg); ok = true; }
    } catch(_) {}
    // Fallback: execCommand
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = msg;
        ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        ok = true;
      } catch(_) {}
    }
    // Last resort
    if (!ok) { try { navigator.clipboard.writeText(msg); } catch(_) {} }
    const btn = event?.target;
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = orig, 1500);
    }
  },

  closeSaveImport() {
    const modal = document.getElementById('saveImportModal');
    if (modal) modal.classList.remove('show');
    this._saveImportData = null;
    this._ghostStepShown = false;
    this._pendingImportMode = null;
  },

  // Re-read the last imported save file and refresh all pawn data in-place
  async refreshSaveFile() {
    if (!this._lastSaveFilePath) {
      this.toast('No save file to refresh. Import a save first.');
      return;
    }
    if (!window.overlay?.readSaveFile) {
      this.toast('Refresh requires the desktop app.');
      return;
    }

    // Show a small loading toast
    this.toast('Refreshing save...');

    let xml;
    let refreshWealth = null;
    try {
      const result = await window.overlay.readSaveFile(this._lastSaveFilePath);
      if (!result || result.error) {
        this.toast('Could not read save file. Has it been moved or deleted?');
        return;
      }
      xml = result.xml;
      refreshWealth = result.wealth || null;
    } catch (e) {
      this.toast('Failed to read save file, ' + (e.message || 'unknown error'));
      return;
    }

    let parsed;
    await new Promise(r => setTimeout(r, 0)); // let the toast paint before the sync parse
    try {
      parsed = this.parseSaveFile(xml);
      if (refreshWealth && parsed.meta) parsed.meta.wealth = refreshWealth;
    } catch (e) {
      this.toast('Failed to parse save file, ' + (e.message || 'unknown error'));
      return;
    }

    if (!parsed.pawns.length) {
      this.toast('No colonist pawns found in save file.');
      return;
    }

    // Match incoming pawns to existing ones by thingID or name
    const existingById = {};
    const existingByName = {};
    for (const p of this.state.pawns) {
      if (p.thingID) existingById[p.thingID] = p;
      existingByName[(p.nickname || p.name || '').toLowerCase()] = p;
    }

    let updated = 0, added = 0;
    for (const incoming of parsed.pawns) {
      // Try to match by thingID first, then by name
      const match = (incoming.thingID && existingById[incoming.thingID])
        || existingByName[(incoming.nickname || incoming.name || '').toLowerCase()];

      if (match) {
        // Update fields from save - preserve user-set fields like custom traits, role, mood preset
        match.name = incoming.name;
        match.nickname = incoming.nickname || match.nickname;
        match.firstName = incoming.firstName || match.firstName;
        match.lastName = incoming.lastName || match.lastName;
        match.bioAge = incoming.bioAge;
        match.chronoAge = incoming.chronoAge;
        match.gender = incoming.gender || match.gender;
        match.childhood = incoming.childhood || match.childhood;
        match.adulthood = incoming.adulthood || match.adulthood;
        match.factionName = incoming.factionName || match.factionName;
        match.ideoName = incoming.ideoName || match.ideoName;
        match.royalTitle = incoming.royalTitle || match.royalTitle;
        if (incoming.records) match.records = incoming.records;
        if (incoming.equippedWeapon) match.equippedWeapon = incoming.equippedWeapon;
        if (incoming.wornApparel && incoming.wornApparel.length) match.wornApparel = incoming.wornApparel;
        // Refresh skills - track history
        for (const sk of SKILLS) {
          const oldVal = match.skills[sk.id];
          const newVal = incoming.skills[sk.id];
          if (newVal !== undefined && newVal !== oldVal) {
            if (!match.skillHistory) match.skillHistory = {};
            if (!match.skillHistory[sk.id]) match.skillHistory[sk.id] = [];
            match.skillHistory[sk.id].push({ val: newVal, ts: Date.now() });
            if (match.skillHistory[sk.id].length > 10) match.skillHistory[sk.id].shift();
            match.skills[sk.id] = newVal;
          }
        }
        // Refresh passions
        if (incoming.passions) match.passions = { ...match.passions, ...incoming.passions };
        // Refresh health from save
        if (incoming.health) match.health = incoming.health;
        // Refresh relations from save
        if (incoming.relations) match.relations = incoming.relations;
        // Refresh loadID and geneDefIds from save
        if (incoming.loadID) match.loadID = incoming.loadID;
        if (incoming.geneDefIds) match.geneDefIds = incoming.geneDefIds;
        match.raceDefName = incoming.raceDefName || null;
        // Refresh incapable from save
        if (incoming.incapable) match.incapable = incoming.incapable;
        // Refresh downed status (Down in this save = no jobs assignable; recovered = cleared)
        match.downed = incoming.downed === true;
        // Refresh xenotype if save has one
        if (incoming.xenotype && incoming.xenotype !== 'baseliner') match.xenotype = incoming.xenotype;
        updated++;
      } else {
        // New pawn not in our list - add them
        added++;
        this.state.pawns.push({
          ...incoming,
          id: this._uniqueId(),
          avatarIdx: Math.floor(Math.random() * AVATARS.length),
          traits: incoming.traits || [],
          role: 'none',
          collapsed: true, // cards start collapsed by default; expanding is remembered per-pawn
          traitsCollapsed: true
        });
      }
    }

    // Detect pawns that are no longer in the save (dead, banished, kidnapped, etc.)
    const incomingFingerprints = new Set();
    for (const ip of parsed.pawns) {
      // Match by thingIDNumber + name, and also by name alone for fallback
      if (ip.thingIDNumber && ip.thingIDNumber !== 999999) {
        incomingFingerprints.add(ip.thingIDNumber + '|' + (ip.name || ''));
      }
      incomingFingerprints.add('name|' + (ip.nickname || ip.name || '').toLowerCase());
    }
    const missingPawns = this.state.pawns.filter(ep => {
      const fpById = (ep.thingIDNumber && ep.thingIDNumber !== 999999)
        ? ep.thingIDNumber + '|' + (ep.name || '') : null;
      const fpByName = 'name|' + (ep.nickname || ep.name || '').toLowerCase();
      return (fpById ? !incomingFingerprints.has(fpById) : true) && !incomingFingerprints.has(fpByName);
    });

    // Mark missing pawns as gone and prompt the user
    if (missingPawns.length > 0) {
      missingPawns.forEach(p => { p._missingFromSave = true; });
      const names = missingPawns.map(p => p.nickname || p.name).join(', ');
      const count = missingPawns.length;
      this.showConfirm(
        count + ' pawn' + (count > 1 ? 's' : '') + ' no longer in save',
        'Remove',
        (count === 1 ? names + ' was' : names + ' were') + ' not found in the save file (dead, banished, or missing). Remove from the app?',
        'Keep'
      ).then(() => {
        // Remove missing pawns
        for (const mp of missingPawns) {
          const idx = this.state.pawns.indexOf(mp);
          if (idx !== -1) {
            delete this.state.priorities[mp.id];
            this.state.pawns.splice(idx, 1);
          }
        }
        this._pawnCardHashes = {};
        this._lastSidebarOrder = null;
        this.renderAll();
        this.triggerAutoSave();
        this.toast('Removed ' + count + ' pawn' + (count > 1 ? 's' : '') + ' no longer in save.');
      }).catch(() => {
        // User chose to keep them - clear the flag
        missingPawns.forEach(p => { delete p._missingFromSave; });
      });
    }

    // Reflect the in-game colonist bar order on refresh too (displayOrder then
    // thingIDNumber, stable so hand-made pawns keep their place after the colonists).
    const refreshOrder = new Map();
    for (const ip of parsed.pawns) {
      if (ip.loadID) refreshOrder.set(ip.loadID, (ip.displayOrder != null ? ip.displayOrder : 999999) * 1e7 + (ip.thingIDNumber != null ? ip.thingIDNumber : 9999999));
    }
    if (refreshOrder.size) {
      this.state.pawns.sort((a, b) => {
        const ka = a.loadID != null && refreshOrder.has(a.loadID) ? refreshOrder.get(a.loadID) : Infinity;
        const kb = b.loadID != null && refreshOrder.has(b.loadID) ? refreshOrder.get(b.loadID) : Infinity;
        return ka - kb || 0;
      });
      this._lastSidebarOrder = null;
    }

    // Resolve storyteller label from def cache if available
    const stLabel = this._defLabel(parsed.meta.storyteller);
    if (stLabel) parsed.meta.storytellerClean = stLabel;

    // Keep the world seed/name/coverage current on refresh too (dashboard World line)
    if (this.state.importMeta) {
      if (parsed.meta.worldSeed) this.state.importMeta.worldSeed = parsed.meta.worldSeed;
      if (parsed.meta.worldName) this.state.importMeta.worldName = parsed.meta.worldName;
      if (parsed.meta.planetCoverage != null) this.state.importMeta.planetCoverage = parsed.meta.planetCoverage;
    }

    // Auto-update raid calc from refreshed save metadata
    this._applyRaidFromSave(parsed.meta, this.state.pawns.length);

    // Update ghost pawns from refresh
    this.state.ghostPawns = parsed.ghostPawns || [];

    // Refresh the full ideology list for the browser modal
    if (Array.isArray(parsed.meta.allIdeologies)) {
      this.state.savedIdeologies = parsed.meta.allIdeologies;
    }
    if (parsed.meta.ideology && (parsed.meta.ideology.memes || []).length) {
      this.state.savedPlayerIdeo = parsed.meta.ideology;
    }

    // Invalidate caches
    this._invalidateBsCache();
    this._pawnCardHashes = {};
    this._lastSidebarOrder = null;

    this.renderAll();
    this._renderTabView(this.state.activeTab); // refresh the open tab after a re-import too
    this.triggerAutoSave();

    const parts = [];
    if (updated) parts.push(updated + ' updated');
    if (added) parts.push(added + ' new');
    if (missingPawns.length) parts.push(missingPawns.length + ' missing');
    const fileName = this._lastSaveFilePath.split(/[/\\]/).pop();
    this.toast('Refreshed from ' + fileName + ', ' + parts.join(', '));
  },


  _normalizeLoadedState() {
    const asText = (v, fallback = '') => typeof v === 'string' ? v : fallback;
    this.state.pawns = Array.isArray(this.state.pawns) ? this.state.pawns : [];
    this.state.customJobs = Array.isArray(this.state.customJobs) ? this.state.customJobs : [];
    this.state.customMaterials = Array.isArray(this.state.customMaterials) ? this.state.customMaterials : [];
    this.state.customBiomes = Array.isArray(this.state.customBiomes) ? this.state.customBiomes : [];
    this.state.customXenotypes = this.state.customXenotypes && typeof this.state.customXenotypes === 'object' && !Array.isArray(this.state.customXenotypes) ? this.state.customXenotypes : {};
    this.state.customTraits = this.state.customTraits && typeof this.state.customTraits === 'object' && !Array.isArray(this.state.customTraits) ? this.state.customTraits : {};
    this.state.customGenes = this.state.customGenes && typeof this.state.customGenes === 'object' && !Array.isArray(this.state.customGenes) ? this.state.customGenes : {};
    if (!this.state.ideology || typeof this.state.ideology !== 'object') this.state.ideology = { memes: [], precepts: {}, name: '', type: 'fixed', rituals: [], notes: '' };
    if (!Array.isArray(this.state.ideology.memes)) this.state.ideology.memes = [];
    if (!this.state.ideology.precepts || typeof this.state.ideology.precepts !== 'object') this.state.ideology.precepts = {};
    if (!this.state.ideology.type) this.state.ideology.type = 'fixed';
    if (!Array.isArray(this.state.ideology.rituals)) this.state.ideology.rituals = [];
    if (typeof this.state.ideology.notes !== 'string') this.state.ideology.notes = '';
    this.state.customBuildings = this.state.customBuildings && typeof this.state.customBuildings === 'object' && !Array.isArray(this.state.customBuildings) ? this.state.customBuildings : {};
    this.state.customBackstories = this.state.customBackstories && typeof this.state.customBackstories === 'object' && !Array.isArray(this.state.customBackstories) ? this.state.customBackstories : {};
    this.state.backstoryStories = this.state.backstoryStories && typeof this.state.backstoryStories === 'object' && !Array.isArray(this.state.backstoryStories) ? this.state.backstoryStories : {};
    this.state.backstoryStoriesByTitle = this.state.backstoryStoriesByTitle && typeof this.state.backstoryStoriesByTitle === 'object' && !Array.isArray(this.state.backstoryStoriesByTitle) ? this.state.backstoryStoriesByTitle : {};
    this.state.prostheticEfficiency = this.state.prostheticEfficiency && typeof this.state.prostheticEfficiency === 'object' && !Array.isArray(this.state.prostheticEfficiency) ? this.state.prostheticEfficiency : {};
    this.state.weapons = (Array.isArray(this.state.weapons) ? this.state.weapons : []).filter(x => x && typeof x === 'object');
    this.state.apparel = (Array.isArray(this.state.apparel) ? this.state.apparel : []).filter(x => x && typeof x === 'object');
    this.state.apparel.forEach(a => { if (a.layer === 'shell') a.layer = 'outer'; });
    this.state.notes = Array.isArray(this.state.notes) ? this.state.notes : [];
    this.state.timeline = Array.isArray(this.state.timeline) ? this.state.timeline : [];
    this.state.savedIdeologies = Array.isArray(this.state.savedIdeologies) ? this.state.savedIdeologies : [];
    this.state.manualRelations = Array.isArray(this.state.manualRelations) ? this.state.manualRelations : [];
    this.state.ghostPawns = Array.isArray(this.state.ghostPawns) ? this.state.ghostPawns : [];
    if (!this.state.precepts || typeof this.state.precepts !== 'object' || Array.isArray(this.state.precepts)) this.state.precepts = {};
    if (!this.state.raid || typeof this.state.raid !== 'object' || Array.isArray(this.state.raid)) this.state.raid = {};
    if (this.state.importMeta && (typeof this.state.importMeta !== 'object' || Array.isArray(this.state.importMeta))) this.state.importMeta = null;
    // Rebuild the save-modlist lookup (it isn't serialised) so the mod-not-in-save
    // warnings survive a reload, not only a fresh import.
    this.state.saveModIdSet = new Set((this.state.importMeta && Array.isArray(this.state.importMeta.modIds)) ? this.state.importMeta.modIds : []);
    if (!this.state.defSources || typeof this.state.defSources !== 'object' || Array.isArray(this.state.defSources)) this.state.defSources = {};
    this.state.blueprintName = typeof this.state.blueprintName === 'string' ? this.state.blueprintName : '';
    if (!this.state.buildingOverrides || typeof this.state.buildingOverrides !== 'object' || Array.isArray(this.state.buildingOverrides)) this.state.buildingOverrides = {};
    if (!this.state.blueprintCatCollapsed || typeof this.state.blueprintCatCollapsed !== 'object' || Array.isArray(this.state.blueprintCatCollapsed)) this.state.blueprintCatCollapsed = {};

    this.state.pawns.forEach((p, idx) => this._coercePawn(p, idx));

    // One-time migration: pawn cards now default to collapsed. Collapse any existing
    // colony once (older projects were saved with collapsed:false as the old default),
    // then set a flag so we NEVER fight a card the user later chooses to expand.
    if (!this.state._pawnCollapseDefaultApplied) {
      this.state.pawns.forEach(p => { p.collapsed = true; });
      this.state._pawnCollapseDefaultApplied = true;
    }

    this.state.customJobs.forEach(j => {
      j.id = asText(j.id, 'job_' + Math.random().toString(36).slice(2, 7));
      j.name = asText(j.name, 'Custom Job');
      j.skill = j.skill ? asText(j.skill, null) : null;
      j.hint = asText(j.hint, 'User-defined job.');
    });

    this.state.customMaterials.forEach(m => {
      m.id = asText(m.id, 'mat_' + Math.random().toString(36).slice(2, 7));
      m.label = asText(m.label, 'Material');
      m.color = _safeColor(m.color);
    });

    this.state.customBiomes.forEach(b => {
      b.id = asText(b.id, 'bio_' + Math.random().toString(36).slice(2, 7));
      b.label = asText(b.label, 'Biome');
      b.color = _safeColor(b.color, '#2a3d2a');
      b.icon = asText(b.icon, '');
    });

    Object.values(this.state.customXenotypes || {}).forEach(x => {
      x.label = asText(x.label, 'Custom Xenotype');
      x.color = _safeColor(x.color, '#aaaaaa');
      x.skillMods = x.skillMods && typeof x.skillMods === 'object' ? x.skillMods : {};
      x.incapable = Array.isArray(x.incapable) ? x.incapable : [];
      x.genes = Array.isArray(x.genes) ? x.genes : [];
    });

    Object.values(this.state.customTraits || {}).forEach(t => {
      t.label = asText(t.label, 'Custom Trait');
      t.description = asText(t.description, '');
      t.skillMods = t.skillMods && typeof t.skillMods === 'object' ? t.skillMods : {};
    });

    Object.values(this.state.customGenes || {}).forEach(g => {
      g.label = asText(g.label, 'Custom Gene');
      g.category = asText(g.category, 'Mod');
      g.description = asText(g.description, '');
      if (g.skillMods && typeof g.skillMods !== 'object') g.skillMods = {};
    });

    Object.values(this.state.customBuildings || {}).forEach(b => {
      b.id = asText(b.id, 'bld_' + Math.random().toString(36).slice(2, 7));
      b.label = asText(b.label, 'Object');
      b.color = _safeColor(b.color);
      b.layer = b.layer === 'floor' ? 'floor' : 'struct';
      b.costs = b.costs && typeof b.costs === 'object' ? b.costs : {};
    });
  },

  // Coerce a single pawn object to a well-formed shape. Shared by the project
  // load/normalise path and by clipboard JSON import, so any untrusted pawn (a
  // pasted/shared blob, a legacy or hand-edited save) gets the same guarantees:
  // string name/id, object skills/passions, the expected arrays, and a valid
  // 24-slot schedule. Single source of truth - keep field list in sync here.
  _coercePawn(p, idx) {
    const asText = (v, fallback = '') => typeof v === 'string' ? v : fallback;
    p.id = asText(p.id, Math.random().toString(36).slice(2, 9));
    p.name = asText(p.name, `Pawn ${(idx || 0) + 1}`);
    p.avatarBg = _safeColor(p.avatarBg || AVATARS[idx % AVATARS.length].bg);
    p.avatarColor = _safeColor(p.avatarColor || AVATARS[idx % AVATARS.length].color, '#ffffff');
    p.skills = p.skills && typeof p.skills === 'object' ? p.skills : {};
    p.passions = p.passions && typeof p.passions === 'object' ? p.passions : {};
    // Body def for the health editor; default Human (unknown races read as Human, the
    // safe default - only a non-Human value flips the editor into race-agnostic mode).
    p.bodyDef = (typeof p.bodyDef === 'string' && p.bodyDef) ? p.bodyDef : 'Human';
    p.raceDefName = (typeof p.raceDefName === 'string' && p.raceDefName) ? p.raceDefName : null;
    // Raw passion string per skill (lossless modded-passion round-trip). Backfill
    // from the buckets for any skill missing one, so the field is always complete.
    p.passionDefs = (p.passionDefs && typeof p.passionDefs === 'object') ? p.passionDefs : {};
    if (typeof SKILLS !== 'undefined') SKILLS.forEach(s => {
      if (typeof p.passionDefs[s.id] !== 'string') {
        const b = (p.passions[s.id]) | 0; p.passionDefs[s.id] = b === 2 ? 'Major' : b === 1 ? 'Minor' : 'None';
      }
    });
    p.incapable = Array.isArray(p.incapable) ? p.incapable : [];
    p.downed = p.downed === true;
    p.traits = Array.isArray(p.traits) ? p.traits : [];
    p.childhood = typeof p.childhood === 'string' ? p.childhood : '';
    p.adulthood = typeof p.adulthood === 'string' ? p.adulthood : '';
    p.factionName = typeof p.factionName === 'string' ? p.factionName : '';
    p.ideoName = typeof p.ideoName === 'string' ? p.ideoName : '';
    p.royalTitle = typeof p.royalTitle === 'string' ? p.royalTitle : '';
    p.equippedWeapon = (p.equippedWeapon && typeof p.equippedWeapon === 'object') ? p.equippedWeapon : null;
    p.wornApparel = Array.isArray(p.wornApparel) ? p.wornApparel : [];
    p.records = (p.records && typeof p.records === 'object') ? p.records : null;
    p.bio = typeof p.bio === 'string' ? p.bio : '';
    p.health = Array.isArray(p.health) ? p.health : [];
    p.relations = Array.isArray(p.relations) ? p.relations : [];
    p.loadID = typeof p.loadID === 'string' ? p.loadID : '';
    p.geneDefIds = Array.isArray(p.geneDefIds) ? p.geneDefIds : [];
    p.schedule = Array.isArray(p.schedule) && p.schedule.length === 24 ? p.schedule : Array(24).fill(0);
    // Clamp schedule values to valid range (0=sleep, 1=work, 2=joy, 3=anything)
    p.schedule = p.schedule.map(v => { const n = parseInt(v); return (Number.isFinite(n) && n >= 0 && n <= 3) ? n : 0; });
    return p;
  },

  // Conditional disclaimer for a DLC/version-gated feature. Returns a styled
  // banner only when a save has been imported AND that expansion's data was
  // absent (older game version, or the expansion not active). Otherwise ''.
  _importNotice(feature, opts) {
    const im = this.state.importMeta;
    if (!im || typeof im !== 'object') return '';   // nothing imported yet
    if (im[feature]) return '';                      // this DLC's data was present -> relevant
    const NAMES = { ideology: 'Ideology', biotech: 'Biotech (genes and xenotypes)', royalty: 'Royalty (royal titles)' };
    const INTRO = { ideology: 1.3, biotech: 1.4, royalty: 1.1 };
    const name = NAMES[feature];
    if (!name) return '';
    const v = im.gameVersion && im.gameVersion !== 'Unknown' ? `RimWorld ${im.gameVersion}` : 'your imported save';
    const predates = im.versionNum != null && im.versionNum < INTRO[feature];
    const why = predates
      ? `${v} predates the ${name} expansion`
      : `${v} has no ${name} data (the expansion was not active)`;
    const compact = opts && opts.compact;
    return `<div class="import-notice${compact ? ' import-notice--compact' : ''}">`
      + `<span class="import-notice-icon">i</span>`
      + `<span>${why}, so this section reflects manual entries only.</span></div>`;
  },

  // -- SAVE / LOAD --


  _validateImport(data) {
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.pawns)) return false;
    if (!data.priorities || typeof data.priorities !== 'object') return false;
    return true;
  },


  _saveFailed: false, // Persistent flag for save failure state
  _lastSaveTs: 0, // Timestamp of last successful save

  _buildSavePayload() {
    return {
      _version: 1,
      pawns: this.state.pawns,
      priorities: this.state.priorities,
      customXenotypes: this.state.customXenotypes,
      customTraits: this.state.customTraits,
      traitCatalog: this.state.traitCatalog,
      hediffCatalog: this.state.hediffCatalog,
      relationCatalog: this.state.relationCatalog,
      passionCatalog: this.state.passionCatalog,
      defSources: this.state.defSources,
      geneColors: this.state.geneColors,
      customGenes: this.state.customGenes,
      customJobs: this.state.customJobs,
      precepts: this.state.precepts,
      ideology: this.state.ideology,
      catLabels: this.state.catLabels,
      shiftTypes: this.state.shiftTypes,
      shiftColors: this.state.shiftColors,
      colonyName: this.state.colonyName,
      blueprints: this.state.blueprints,
      biome: this.state.biome || 'none',
      blueprintName: this.state.blueprintName || '',
      bpSnapGrid: this.state.bpSnapGrid !== false,
      bpSidebarWidth: this.state.bpSidebarWidth || null,
      buildingOverrides: this.state.buildingOverrides || {},
      blueprintCatCollapsed: this.state.blueprintCatCollapsed || {},
      customBuildings: this.state.customBuildings,
      customBackstories: this.state.customBackstories || {},
      backstoryStories: this.state.backstoryStories || {},
      backstoryStoriesByTitle: this.state.backstoryStoriesByTitle || {},
      prostheticEfficiency: this.state.prostheticEfficiency || {},
      customMaterials: this.state.customMaterials,
      customBiomes: this.state.customBiomes,
      deletedMaterials: this.state.deletedMaterials || [],
      deletedPresetBuildings: this.state.deletedPresetBuildings || [],
      deletedPresetBiomes: this.state.deletedPresetBiomes || [],
      roomLabels: this.state.roomLabels || {},
      prefabs: this.state.prefabs,
      stamps: this.state.stamps || {},
      raid: this.state.raid,
      notes: this.state.notes || [],
      timeline: this.state.timeline || [],
      weapons: this.state.weapons || [],
      apparel: this.state.apparel || [],
      materials: this.state.materials || [],
      loadout: this.state.loadout,
      loadoutB: this.state.loadoutB,
      savedLoadouts: this.state.savedLoadouts || [],
      manualRelations: this.state.manualRelations || [],
      ghostPawns: this.state.ghostPawns || [],
      customMemes: this.state.customMemes || {},
      customRituals: this.state.customRituals || {},
      settings: this.state.settings,
      importMeta: this.state.importMeta || null,
      uiScroll: this.state.uiScroll,
      activeTab: this.state.activeTab,
      lastSaveFilePath: this._lastSaveFilePath || null,
    };
  },

  saveData() {
    const json = JSON.stringify(this._buildSavePayload());
    const savePath = this.state.settings.savePath;

    // File-based save (if path is configured)
    if (savePath && window.overlay?.saveToFile) {
      window.overlay.saveToFile(savePath, json).then(result => {
        if (result.ok) {
          this._lastSaveTs = Date.now();
          this._saveFailed = false;
          this._hideSaveWarning();
          this._updateSavePill();
        } else {
          console.warn('File save failed:', result.error);
          this._saveFailed = true;
          this._showSaveWarning();
        }
      }).catch(e => {
        console.warn('File save error:', e);
        this._saveFailed = true;
        this._showSaveWarning();
      });
      // Also keep a lightweight localStorage copy for fast startup (settings + metadata only)
      try { localStorage.setItem('rimjobs_meta', JSON.stringify({ savePath, colonyName: this.state.colonyName })); } catch(_) {}
      return;
    }

    // localStorage save (default)
    try {
      localStorage.setItem('rimjobs', json);
      localStorage.setItem('rimjobs_backup', json);
      this._lastSaveTs = Date.now();
      if (this._saveFailed) {
        this._saveFailed = false;
        this._hideSaveWarning();
      }
      this._updateSavePill();
    } catch(e) {
      console.warn('Save failed:', e);
      this._saveFailed = true;
      this._showSaveWarning();
      // Offer to switch to file-based save
      if (!this._quotaPromptShown) {
        this._quotaPromptShown = true;
        this.showConfirm(
          'Local storage is full. Save to a file on disk instead?',
          'Choose Location'
        ).then(() => this.pickSavePath()).catch(() => {});
      }
    }
  },

  async pickSavePath() {
    if (!window.overlay?.pickSaveLocation) {
      this.toast('File saving requires the desktop app');
      return;
    }
    const colonySlug = (this.state.colonyName || 'colony').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const filePath = await window.overlay.pickSaveLocation('rimjobs_' + colonySlug + '.json');
    if (!filePath) return;
    this.state.settings.savePath = filePath;
    this.saveData(); // Immediately save to the new location
    this.toast('Save location set -now saving to disk');
    if (this.state.activeTab === 'settings') this.renderSettings();
  },

  async clearSavePath() {
    this.state.settings.savePath = '';
    this._quotaPromptShown = false;
    this.saveData();
    this.toast('Switched back to local storage');
    if (this.state.activeTab === 'settings') this.renderSettings();
  },

  _showSaveWarning() {
    if (document.getElementById('saveFailBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'saveFailBanner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#d32f2f;color:#fff;padding:8px 16px;font-size:13px;font-weight:700;text-align:center;display:flex;align-items:center;justify-content:center;gap:12px';
    banner.innerHTML = `<span>! Save failed -export your data to avoid losing work.</span><button onclick="App.exportJSON()" style="background:#fff;color:#d32f2f;border:none;padding:4px 12px;border-radius:4px;font-weight:700;cursor:pointer">Export</button><button onclick="App.pickSavePath()" style="background:#fff3;color:#fff;border:1px solid #fff6;padding:4px 12px;border-radius:4px;font-weight:700;cursor:pointer">Save to File</button>`;
    document.body.prepend(banner);
  },

  _hideSaveWarning() {
    document.getElementById('saveFailBanner')?.remove();
  },

  _updateSavePill() {
    const pill = document.getElementById('savePill');
    if (!pill) return;
    // Update only the text span so the persistent floppy icon stays put.
    const txt = document.getElementById('savePillText') || pill;
    const savePath = this.state.settings.savePath;
    if (this._saveFailed) {
      txt.textContent = '! Unsaved';
      pill.style.color = '#ef5350';
      pill.title = 'Save failed -click for options';
    } else if (savePath) {
      const fileName = savePath.split(/[/\\]/).pop();
      txt.textContent = '' + fileName;
      pill.style.color = 'var(--accent)';
      pill.title = 'Saving to: ' + savePath;
    } else {
      txt.textContent = 'Local';
      pill.style.color = 'var(--text3)';
      pill.title = 'Saving to browser local storage';
    }
  },

  // Logo subtitle date line. With an imported save it shows that save's in-game
  // date+time (frozen at the save's tick). With no save it TRANSLATES the user's
  // real local clock into RimWorld's calendar: the 24h time maps straight across,
  // and the day-of-year is projected onto RimWorld's 60-day (4x15) year.
  _rimworldDateLine() {
    const QUAD = (typeof QUADRUMS !== 'undefined') ? QUADRUMS : ['Aprimay', 'Jugust', 'Septober', 'Decembary'];
    const ord = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
    const im = this.state && this.state.importMeta;
    let year, qi, day, hour, minute;
    if (im && Number.isFinite(im.ticks)) {
      const t = im.ticks;
      const totalDays = Math.floor(t / 60000);
      year = 5500 + Math.floor(totalDays / 60);
      qi = Math.floor((totalDays % 60) / 15);
      day = (totalDays % 15) + 1;
      const hf = (t % 60000) / 2500;          // 0..24
      hour = Math.floor(hf); minute = Math.floor((hf - hour) * 60);
    } else {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      const doy = Math.floor((now - start) / 86400000); // 0-based day of year
      const yLen = (((now.getFullYear() % 4 === 0 && now.getFullYear() % 100 !== 0) || now.getFullYear() % 400 === 0) ? 366 : 365);
      const f = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
      const rwDOY = Math.min(59, Math.max(0, Math.floor(((doy + f) / yLen) * 60)));
      year = 5500 + (now.getFullYear() - 2026);
      qi = Math.floor(rwDOY / 15);
      day = (rwDOY % 15) + 1;
      hour = now.getHours(); minute = now.getMinutes();
    }
    const quad = QUAD[qi] || QUAD[0];
    const hh = String(hour).padStart(2, '0'), mm = String(minute).padStart(2, '0');
    return `${ord(day)} of ${quad}, ${year} · ${hh}:${mm}`;
  },

  // Paint the logo date line and keep it live (real time ticks; an imported save's
  // time is static, but the line still refreshes harmlessly).
  _updateLogoDate() {
    const el = (typeof document !== 'undefined') && document.getElementById('logoDate');
    if (el) el.textContent = this._rimworldDateLine();
    // World line under the clock: name, seed and coverage from the imported save.
    const wEl = (typeof document !== 'undefined') && document.getElementById('logoWorld');
    if (wEl) {
      const im = this.state.importMeta;
      if (im && im.worldSeed) {
        wEl.textContent = `${im.worldName || 'World'} · Seed "${im.worldSeed}"`;
        wEl.style.display = '';
      } else {
        wEl.style.display = 'none';
      }
    }
    if (typeof setInterval === 'function' && !this._logoDateTimer) {
      // Tick every second so the displayed minute flips right on the boundary. A 30s
      // interval left the clock up to 30 seconds behind the real local time.
      this._logoDateTimer = setInterval(() => {
        const e = document.getElementById('logoDate');
        if (e) e.textContent = this._rimworldDateLine();
      }, 1000);
    }
  },

  exportJSON() {
    this.saveData();
    const data = localStorage.getItem('rimjobs');
    if (!data) { this.toast(' No data to export!'); return; }
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rimjobs_${this.state.colonyName || 'data'}_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast('Exported!');
  },

  importJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (f) => {
        try {
          const data = JSON.parse(f.target.result);
          if (!App._validateImport(data)) {
            App.showAlert('Invalid colony file - missing required fields (pawns, priorities).');
            return;
          }
          App.showConfirm('Importing will overwrite your current colony. Continue?', 'Import').then(() => {
            // Backup current data before overwrite
            const current = localStorage.getItem('rimjobs');
            if (current) localStorage.setItem('rimjobs_pre_import', current);
            localStorage.setItem('rimjobs', JSON.stringify(data));
            location.reload();
          }).catch(() => {});
        } catch(err) { App.showAlert('Invalid JSON file.'); }
      };
      reader.readAsText(file);
    };
    input.click();
  },

  // Async file load -called from init() before render
  async _loadFromFileIfNeeded() {
    // Check if a save path was previously set (stored in lightweight meta key)
    const meta = localStorage.getItem('rimjobs_meta');
    let savePath = this.state.settings.savePath;
    if (!savePath && meta) {
      try { savePath = JSON.parse(meta).savePath || ''; } catch(_) {}
    }
    if (!savePath || !window.overlay?.loadFromFile) return false;

    const result = await window.overlay.loadFromFile(savePath);
    if (!result.ok) {
      console.warn('File load failed:', result.error);
      this.toast('Could not load from ' + savePath.split(/[/\\]/).pop() + ' -falling back to local storage');
      return false;
    }
    try {
      const data = JSON.parse(result.data);
      this._applyLoadedData(data);
      this.state.settings.savePath = savePath; // Ensure path persists
      return true;
    } catch(e) {
      console.warn('File data corrupt:', e);
      this.toast('Save file is corrupt -falling back to local storage');
      return false;
    }
  },

  loadData() {
    try {
      let raw = localStorage.getItem('rimjobs');
      if (!raw) return;
      let data;
      try {
        data = JSON.parse(raw);
      } catch (parseErr) {
        console.warn('Primary save corrupt, attempting backup recovery:', parseErr);
        const backup = localStorage.getItem('rimjobs_backup');
        if (backup) {
          try {
            data = JSON.parse(backup);
            localStorage.setItem('rimjobs', backup);
            this.toast('Recovered data from backup (primary save was corrupt)');
          } catch (_) {
            this.toast('Save data is corrupt and backup failed. Use Import to restore from an export file.');
            return;
          }
        } else {
          this.toast('Save data is corrupt. Use Import to restore from an export file.');
          return;
        }
      }
      this._applyLoadedData(data);
    } catch(e) { console.warn('Load failed:', e); }
  },

  _applyLoadedData(data) {
    if (data.pawns)           this.state.pawns           = data.pawns;
    if (data.priorities)      this.state.priorities      = data.priorities;
    if (data.customXenotypes) this.state.customXenotypes = data.customXenotypes;
    if (data.customTraits)    this.state.customTraits    = data.customTraits;
    if (Array.isArray(data.traitCatalog)) this.state.traitCatalog = data.traitCatalog;
    if (Array.isArray(data.hediffCatalog)) this.state.hediffCatalog = data.hediffCatalog;
    if (Array.isArray(data.relationCatalog)) this.state.relationCatalog = data.relationCatalog;
    if (Array.isArray(data.passionCatalog)) this.state.passionCatalog = data.passionCatalog;
    if (data.defSources && typeof data.defSources === 'object') this.state.defSources = data.defSources;
    if (data.geneColors && typeof data.geneColors === 'object') this.state.geneColors = data.geneColors;
    if (data.customGenes)     this.state.customGenes     = data.customGenes;
    if (data.customJobs)      this.state.customJobs      = data.customJobs;
    if (data.precepts)        this.state.precepts        = data.precepts;
    if (data.ideology)        this.state.ideology        = data.ideology;
    if (data.catLabels)       this.state.catLabels       = data.catLabels;
    if (data.shiftTypes)      this.state.shiftTypes      = data.shiftTypes;
    if (data.shiftColors)     this.state.shiftColors     = data.shiftColors;
    if (data.colonyName !== undefined) this.state.colonyName = data.colonyName;
    if (data.blueprints)      this.state.blueprints      = data.blueprints;
    if (data.biome)           this.state.biome           = data.biome;
    if (data.bpSnapGrid === false) this.state.bpSnapGrid = false;
    if (typeof data.bpSidebarWidth === 'number') this.state.bpSidebarWidth = data.bpSidebarWidth;
    if (data.customBuildings) this.state.customBuildings = data.customBuildings;
    if (data.customBackstories) { this.state.customBackstories = data.customBackstories; this._invalidateBsCache(); }
    if (data.backstoryStories) this.state.backstoryStories = data.backstoryStories;
    if (data.backstoryStoriesByTitle) this.state.backstoryStoriesByTitle = data.backstoryStoriesByTitle;
    if (data.prostheticEfficiency) this.state.prostheticEfficiency = data.prostheticEfficiency;
    if (data.customMaterials)  this.state.customMaterials  = data.customMaterials;
    if (data.customBiomes)     this.state.customBiomes     = data.customBiomes;
    if (data.deletedMaterials) this.state.deletedMaterials = data.deletedMaterials;
    if (data.deletedPresetBuildings) this.state.deletedPresetBuildings = data.deletedPresetBuildings;
    if (data.deletedPresetBiomes) this.state.deletedPresetBiomes = data.deletedPresetBiomes;
    if (data.roomLabels)      this.state.roomLabels      = data.roomLabels;
    if (data.prefabs)         this.state.prefabs         = data.prefabs;
    if (data.stamps)          this.state.stamps          = data.stamps;
    if (data.raid)            this.state.raid            = { ...this.state.raid, ...data.raid };
    if (data.notes)           this.state.notes           = data.notes;
    if (data.timeline)        this.state.timeline        = data.timeline;
    if (data.weapons)         this.state.weapons         = data.weapons;
    if (data.apparel)         this.state.apparel         = data.apparel;
    if (data.materials)       this.state.materials       = data.materials;
    if (data.loadout)         this.state.loadout         = data.loadout;
    if (data.loadoutB)        this.state.loadoutB        = data.loadoutB;
    if (data.savedLoadouts)   this.state.savedLoadouts   = data.savedLoadouts;
    if (data.manualRelations) this.state.manualRelations = data.manualRelations;
    if (data.ghostPawns)      this.state.ghostPawns      = data.ghostPawns;
    if (data.customMemes)     this.state.customMemes     = data.customMemes;
    if (data.customRituals)   this.state.customRituals   = data.customRituals;
    if (data.settings)        this.state.settings        = { ...this.state.settings, ...data.settings };
    if (data.uiScroll)        this.state.uiScroll        = data.uiScroll;
    if (data.activeTab)       this.state.activeTab       = data.activeTab;
    if (data.lastSaveFilePath) this._lastSaveFilePath    = data.lastSaveFilePath;
    this._normalizeLoadedState();
    this.state.pawns.forEach(p => {
      if (!this.state.priorities[p.id]) this.state.priorities[p.id] = {};
      this.allJobs.forEach(j => {
        if (!(j.id in this.state.priorities[p.id])) this.state.priorities[p.id][j.id] = null;
      });
    });
  },

  // ── IN-APP CONSOLE ──
  _consoleLogs: [],
  _consoleMaxLogs: 500,
  _consoleFilter: 'all',
  _consoleErrorCount: 0,
  _consoleWarnCount: 0,

  _logToConsole(level, msg, source, stack) {
    this._consoleLogs.push({ level, msg: String(msg), source: String(source || ''), stack: stack || '', ts: Date.now() });
    if (this._consoleLogs.length > this._consoleMaxLogs) this._consoleLogs.shift();
    if (level === 'error') this._consoleErrorCount++;
    if (level === 'warn') this._consoleWarnCount++;
    this._updateConsoleBadge();
    this._renderConsoleDrawer();
  },

  _initConsoleCapture() {
    const self = this;
    const origError = console.error;
    const origWarn = console.warn;
    const origLog = console.log;
    const origInfo = console.info;
    const fmt = (args) => Array.from(args).map(a => {
      if (a === null) return 'null';
      if (a === undefined) return 'undefined';
      if (a instanceof Error) return a.message + (a.stack ? '\n' + a.stack : '');
      if (typeof a === 'object') { try { return JSON.stringify(a, null, 2); } catch(_) { return String(a); } }
      return String(a);
    }).join(' ');
    const getStack = () => { try { throw new Error(); } catch(e) { const lines = (e.stack || '').split('\n').slice(3, 6); return lines.join('\n'); } };
    console.error = function() {
      origError.apply(console, arguments);
      self._logToConsole('error', fmt(arguments), '', getStack());
    };
    console.warn = function() {
      origWarn.apply(console, arguments);
      self._logToConsole('warn', fmt(arguments), '', '');
    };
    console.log = function() {
      origLog.apply(console, arguments);
      self._logToConsole('log', fmt(arguments), '', '');
    };
    console.info = function() {
      origInfo.apply(console, arguments);
      self._logToConsole('info', fmt(arguments), '', '');
    };
    // Resize handle
    this._initConsoleResize();
  },

  _initConsoleResize() {
    const handle = document.getElementById('consoleResizeHandle');
    const drawer = document.getElementById('consoleDrawer');
    if (!handle || !drawer) return;
    let startY, startH;
    const onMove = (e) => {
      const delta = startY - e.clientY;
      const newH = Math.max(120, Math.min(window.innerHeight * 0.7, startH + delta));
      drawer.style.height = newH + 'px';
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startY = e.clientY;
      startH = drawer.offsetHeight;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  },

  _consoleCollapsed: false,

  toggleConsoleDrawer() {
    const el = document.getElementById('consoleDrawer');
    if (!el) return;
    const isHidden = el.style.display === 'none' || !el.style.display;
    if (isHidden) {
      // Open from fully hidden
      if (!this.state.settings.showConsole) {
        this.state.settings.showConsole = true;
        this._syncConsoleCheckbox();
        this.triggerAutoSave();
      }
      this._consoleCollapsed = false;
      el.style.display = 'flex';
      el.style.height = '280px';
      this._consoleErrorCount = 0;
      this._consoleWarnCount = 0;
      this._updateConsoleBadge();
      this._renderConsoleDrawer();
    } else if (!this._consoleCollapsed) {
      // Collapse to just the header bar
      this._consoleCollapsed = true;
      el.style.height = 'auto';
      const body = document.getElementById('consoleDrawerBody');
      if (body) body.style.display = 'none';
      const handle = document.getElementById('consoleResizeHandle');
      if (handle) handle.style.display = 'none';
    } else {
      // Expand from collapsed
      this._consoleCollapsed = false;
      el.style.height = '280px';
      const body = document.getElementById('consoleDrawerBody');
      if (body) body.style.display = '';
      const handle = document.getElementById('consoleResizeHandle');
      if (handle) handle.style.display = '';
      this._renderConsoleDrawer();
    }
  },

  closeConsoleDrawer() {
    const el = document.getElementById('consoleDrawer');
    if (!el) return;
    el.style.display = 'none';
    this._consoleCollapsed = false;
    const body = document.getElementById('consoleDrawerBody');
    if (body) body.style.display = '';
    const handle = document.getElementById('consoleResizeHandle');
    if (handle) handle.style.display = '';
    this.state.settings.showConsole = false;
    this._updateConsoleBadge();
    // Sync the settings checkbox in real time if the settings tab is visible
    this._syncConsoleCheckbox();
    this.triggerAutoSave();
  },

  _syncConsoleCheckbox() {
    // Find the Developer console checkbox by traversing settings rows
    const rows = document.querySelectorAll('.settings-row');
    for (const row of rows) {
      const label = row.querySelector('.settings-label');
      if (label && label.textContent.trim() === 'Developer console') {
        const cb = row.querySelector('input[type="checkbox"]');
        if (cb) cb.checked = this.state.settings.showConsole;
        break;
      }
    }
  },

  _setConsoleFilter(f) {
    this._consoleFilter = f;
    // Update active pill
    const pills = document.querySelectorAll('#consoleFilters .con-filter');
    pills.forEach(p => {
      const isActive = p.getAttribute('data-filter') === f;
      p.style.background = isActive ? 'var(--accent,#e8a838)' : 'transparent';
      p.style.color = isActive ? '#000' : (p.getAttribute('data-filter') === 'error' ? '#f0857a' : p.getAttribute('data-filter') === 'warn' ? '#e8a838' : 'var(--text3,#888)');
    });
    this._renderConsoleDrawer();
  },

  _getFilteredLogs() {
    let logs = this._consoleLogs;
    // Level filter
    if (this._consoleFilter !== 'all') {
      logs = logs.filter(l => l.level === this._consoleFilter);
    }
    // Search filter
    const search = (document.getElementById('consoleSearch') || {}).value;
    if (search) {
      const q = search.toLowerCase();
      logs = logs.filter(l => l.msg.toLowerCase().includes(q) || l.source.toLowerCase().includes(q));
    }
    return logs;
  },

  _renderConsoleDrawer() {
    if (!this.state.settings.showConsole) return;
    const el = document.getElementById('consoleDrawerBody');
    if (!el) return;
    const colors = { error: '#f0857a', warn: '#e8a838', info: '#6cb4ee', log: 'var(--text3,#999)' };
    const icons = { error: '✖', warn: '!', info: 'ⓘ', log: '›' };
    const bgColors = { error: 'rgba(240,133,122,0.06)', warn: 'rgba(232,168,56,0.04)', info: 'transparent', log: 'transparent' };
    const logs = this._getFilteredLogs();
    // Update badge counts on filter pills
    const errCount = this._consoleLogs.filter(l => l.level === 'error').length;
    const warnCount = this._consoleLogs.filter(l => l.level === 'warn').length;
    const errBadge = document.querySelector('.con-badge-error');
    const warnBadge = document.querySelector('.con-badge-warn');
    if (errBadge) errBadge.textContent = errCount > 0 ? errCount + ' ' : '';
    if (warnBadge) warnBadge.textContent = warnCount > 0 ? warnCount + ' ' : '';

    if (logs.length === 0) {
      el.innerHTML = '<div style="color:var(--text3); font-style:italic; padding:12px; text-align:center">' +
        (this._consoleLogs.length === 0 ? 'No logs captured yet. Errors, warnings, and log calls will appear here.' : 'No logs match the current filter.') + '</div>';
      return;
    }
    el.innerHTML = logs.slice().reverse().map((l, i) => {
      const t = new Date(l.ts);
      const time = t.getHours().toString().padStart(2, '0') + ':' + t.getMinutes().toString().padStart(2, '0') + ':' + t.getSeconds().toString().padStart(2, '0') + '.' + t.getMilliseconds().toString().padStart(3, '0');
      const hasStack = l.stack && l.level === 'error';
      const msgEsc = _escapeHtml(l.msg);
      const srcEsc = l.source ? _escapeHtml(l.source) : '';
      const stackId = 'conStack' + i;
      return `<div style="background:${bgColors[l.level] || 'transparent'}; border-bottom:1px solid rgba(255,255,255,0.04); padding:3px 0">
        <div style="display:flex; gap:6px; padding:2px 4px; font-size:calc(11px * var(--font-scale)); line-height:1.4; align-items:flex-start; cursor:${hasStack ? 'pointer' : 'default'}" ${hasStack ? 'onclick="var s=document.getElementById(\'' + stackId + '\');if(s)s.style.display=s.style.display===\'none\'?\'block\':\'none\'"' : ''}>
          <span style="color:${colors[l.level]}; flex-shrink:0; width:14px; text-align:center; font-size:10px; line-height:1.6">${icons[l.level] || icons.log}</span>
          <span style="color:var(--text3); flex-shrink:0; opacity:0.45; font-size:10px; line-height:1.6; user-select:none">${time}</span>
          <span style="color:${colors[l.level]}; word-break:break-word; flex:1; white-space:pre-wrap">${msgEsc}</span>
          ${srcEsc ? '<span style="color:var(--text3); opacity:0.35; font-size:9px; flex-shrink:0; margin-left:auto; white-space:nowrap">' + srcEsc + '</span>' : ''}
          ${hasStack ? '<span style="color:var(--text3); opacity:0.3; font-size:9px; flex-shrink:0" title="Click to expand stack trace">+</span>' : ''}
        </div>
        ${hasStack ? '<pre id="' + stackId + '" style="display:none; margin:0 0 0 24px; padding:4px 8px; font-size:9px; color:var(--text3); opacity:0.55; white-space:pre-wrap; border-left:2px solid rgba(240,133,122,0.2)">' + _escapeHtml(l.stack) + '</pre>' : ''}
      </div>`;
    }).join('');
    el.scrollTop = 0;
  },

  _updateConsoleBadge() {
    const badge = document.getElementById('consoleBadge');
    if (!badge) return;
    const drawer = document.getElementById('consoleDrawer');
    const drawerVisible = drawer && drawer.style.display !== 'none' && drawer.style.display !== '';
    if (drawerVisible || this._consoleErrorCount === 0) {
      badge.style.display = 'none';
    } else {
      badge.style.display = 'block';
      badge.textContent = this._consoleErrorCount + ' error' + (this._consoleErrorCount !== 1 ? 's' : '');
    }
  },

  _copyConsoleLogs() {
    const logs = this._getFilteredLogs();
    const text = logs.map(l => {
      const t = new Date(l.ts);
      const time = t.getHours().toString().padStart(2, '0') + ':' + t.getMinutes().toString().padStart(2, '0') + ':' + t.getSeconds().toString().padStart(2, '0');
      return '[' + time + '] [' + l.level.toUpperCase() + '] ' + l.msg + (l.source ? ' (' + l.source + ')' : '') + (l.stack ? '\n' + l.stack : '');
    }).join('\n');
    let ok = false;
    // Electron clipboard (primary)
    try { if (window.overlay && window.overlay.clipboardWrite) { window.overlay.clipboardWrite(text); ok = true; } } catch(_) {}
    // execCommand fallback
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        ok = true;
      } catch(_) {}
    }
    // navigator.clipboard last resort
    if (!ok) { try { navigator.clipboard.writeText(text).catch(() => {}); } catch(_) {} }
    this.toast('Copied ' + logs.length + ' log entries to clipboard');
  },

  clearConsoleLogs() {
    this._consoleLogs = [];
    this._consoleErrorCount = 0;
    this._consoleWarnCount = 0;
    this._updateConsoleBadge();
    this._renderConsoleDrawer();
  },
});

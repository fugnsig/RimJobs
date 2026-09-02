/**
 * ARMOURY & APPAREL
 * Weapon DPS calculations, armoury list/comparison views, weapon editor,
 * apparel quality/stats, loadout builder, apparel comparison, apparel editor.
 * Auto-split from app.js - methods are assigned onto the App object.
 */

// Plain-English explanations of RimWorld combat jargon, surfaced as hover
// tooltips on Armoury/Apparel column headers and stat labels so newcomers
// aren't lost on terms like "Paper DPS" or "AP".
const GEAR_JARGON = {
  // Weapons
  paper: 'Paper DPS - theoretical damage per second at perfect accuracy, ignoring range. The weapon\'s raw output ceiling.',
  touch: 'Touch DPS - real damage per second at point-blank range (~3 tiles), after the weapon\'s accuracy is applied.',
  short: 'Short-range DPS - real damage per second at ~12 tiles.',
  medium: 'Medium-range DPS - real damage per second at ~25 tiles.',
  long: 'Long-range DPS - real damage per second at ~40 tiles.',
  ap: 'Armour Penetration - the percentage of a target\'s armour this attack ignores. Higher AP punches through armour.',
  quality: 'Quality tier (Awful through Legendary). Higher quality raises accuracy, and at Masterwork+ also damage and AP.',
  damage: 'Base damage per hit, before accuracy and the target\'s armour.',
  range: 'Maximum firing distance, in tiles.',
  warmup: 'Warmup - seconds spent aiming before the shot/swing lands.',
  cooldown: 'Cooldown - seconds between attacks after firing.',
  // Apparel
  sharp: 'Sharp armour - protection vs cutting/piercing damage (bullets, blades). Shown as the share of damage blocked.',
  blunt: 'Blunt armour - protection vs impact damage (clubs, fists, explosions).',
  heat: 'Heat armour - protection vs burning/fire damage.',
  insulationCold: 'Cold insulation - degrees of cold the garment offsets to keep the wearer warm.',
  insulationHeat: 'Heat insulation - degrees of heat the garment offsets to keep the wearer cool.',
  cold: 'Cold insulation - degrees of cold the garment offsets to keep the wearer warm.',
  hot: 'Heat insulation - degrees of heat the garment offsets to keep the wearer cool.',
  coverage: 'Body parts this item covers.',
  mass: 'Item mass in kg - adds to the wearer\'s carried weight.',
  deflect: 'Deflect chance - chance the hit is fully bounced off for no damage.',
  mitigate: 'Mitigate chance - chance the hit is partly absorbed for reduced damage.',
  penetrate: 'Penetrate chance - chance the hit gets through for full damage.',
  effectiveArmour: 'Effective armour after the attacker\'s armour penetration is subtracted.',
};
// Returns a ready-to-insert ` title="..."` attribute for a jargon key (or '').
function jtip(key) {
  const t = GEAR_JARGON[key];
  return t ? ` title="${_escapeHtml(t)}"` : '';
}

Object.assign(App, {
  // -- ARMOURY TAB --

  // Sort/filter state for armoury list (not persisted - resets on refresh)
  _armourySort: 'manual',     // manual, name, type, damage, paper, touch, short, medium, long, ap, range, mod
  _armourrySortDir: 'asc',    // asc or desc
  _armouryFilter: 'all',      // all, ranged, melee
  _armouryPage: 0,
  _apparelPage: 0,
  _gearPageSize: 100,

  // Use the space available to the Armoury rather than the whole window. An
  // expanded sidebar can make this pane narrow while the viewport remains wide.
  _armouryCompactBreakpoint: 820,
  _armouryLayoutWidth(container) {
    const candidates = [container, document.getElementById('view-armoury'), document.querySelector?.('.main')];
    for (const element of candidates) {
      const width = Number(element?.clientWidth);
      if (Number.isFinite(width) && width > 0) return width;
    }
    return Number(window.innerWidth) || 0;
  },
  _isCompactArmouryLayout(container) {
    return window.innerWidth <= 550 || this._armouryLayoutWidth(container) <= this._armouryCompactBreakpoint;
  },
  refreshArmouryResponsiveLayout() {
    const compact = this._isCompactArmouryLayout(document.getElementById('view-armoury'));
    if (compact === this._armouryCompactLayout) return false;
    this._armouryCompactLayout = compact;
    if (this.state.activeTab === 'armoury') this.renderArmoury();
    return true;
  },

  // Sort/filter state for apparel list
  _apparelSort: 'manual',
  _apparelSortDir: 'asc',
  _apparelFilter: 'all',      // all, armour, clothing, utility

  setArmourySort(field) {
    if (this._armourySort === field && field !== 'manual') {
      this._armourrySortDir = this._armourrySortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this._armourySort = field;
      this._armourrySortDir = (field === 'manual' || field === 'name' || field === 'type' || field === 'mod') ? 'asc' : 'desc';
    }
    this._armouryPage = 0;
    this.renderArmouryList();
  },

  setArmouryFilter(filter) {
    this._armouryFilter = filter;
    this._armouryPage = 0;
    this.renderArmouryList();
  },

  setArmouryPage(page) {
    this._armouryPage = Math.max(0, Math.floor(Number(page) || 0));
    this.renderArmouryList();
  },

  setApparelSort(field) {
    if (this._apparelSort === field && field !== 'manual') {
      this._apparelSortDir = this._apparelSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this._apparelSort = field;
      this._apparelSortDir = (field === 'manual' || field === 'name' || field === 'type' || field === 'layer' || field === 'mod') ? 'asc' : 'desc';
    }
    this._apparelPage = 0;
    this.renderApparelList();
  },

  setApparelFilter(filter) {
    this._apparelFilter = filter;
    this._apparelPage = 0;
    this.renderApparelList();
  },

  setApparelPage(page) {
    this._apparelPage = Math.max(0, Math.floor(Number(page) || 0));
    this.renderApparelList();
  },

  // ── Shared sort engine ──
  _sortGearList(items, field, dir, calcFn) {
    if (field === 'manual') return [...items];
    const d = dir === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
      if (field === 'name') return d * String(a.name || '').localeCompare(String(b.name || ''));
      if (field === 'type') return d * String(a.type || '').localeCompare(String(b.type || ''));
      if (field === 'mod') return d * String(a.modSource || '').toLowerCase().localeCompare(String(b.modSource || '').toLowerCase());
      if (field === 'layer') return d * String(a.layer || '').localeCompare(String(b.layer || ''));
      if (field === 'damage') return d * ((a.damage || 0) - (b.damage || 0));
      if (field === 'range') return d * ((a.range || 0) - (b.range || 0));
      if (field === 'mass') return d * ((a.mass || 0) - (b.mass || 0));
      if (field === 'sharp') { const sa = calcFn(a), sb = calcFn(b); return d * ((sa.armorSharp || 0) - (sb.armorSharp || 0)); }
      if (field === 'blunt') { const sa = calcFn(a), sb = calcFn(b); return d * ((sa.armorBlunt || 0) - (sb.armorBlunt || 0)); }
      if (field === 'heat') { const sa = calcFn(a), sb = calcFn(b); return d * ((sa.armorHeat || 0) - (sb.armorHeat || 0)); }
      if (field === 'cold') { const sa = calcFn(a), sb = calcFn(b); return d * ((sa.insulationCold || 0) - (sb.insulationCold || 0)); }
      if (field === 'hot') { const sa = calcFn(a), sb = calcFn(b); return d * ((sa.insulationHeat || 0) - (sb.insulationHeat || 0)); }
      // DPS fields (paper, touch, short, medium, long, ap)
      if (calcFn) {
        const dA = calcFn(a), dB = calcFn(b);
        return d * ((dA[field] || 0) - (dB[field] || 0));
      }
      return 0;
    });
  },

  // Split favourites from non-favourites, sort non-favs only
  _applyFavouriteSort(items, field, dir, calcFn) {
    const favs = items.filter(i => i.favourite);
    const rest = items.filter(i => !i.favourite);
    const sorted = this._sortGearList(rest, field, dir, calcFn);
    return [...favs, ...sorted];
  },

  // ── Favourite toggle ──
  toggleWeaponFavourite(id) {
    const w = this.state.weapons.find(x => x.id === id);
    if (w) {
      w.favourite = !w.favourite;
      this.renderArmouryList();
      this.triggerAutoSave();
    }
  },

  toggleApparelFavourite(id) {
    const a = this.state.apparel.find(x => x.id === id);
    if (a) {
      a.favourite = !a.favourite;
      this.renderApparelList();
      this.triggerAutoSave();
    }
  },

  // ── Drag and drop for weapons ──
  handleWeaponDragStart(e, id) {
    if (this._armourySort !== 'manual') { e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('dragging');
  },
  handleWeaponDragOver(e) {
    if (this._armourySort !== 'manual') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const tr = e.currentTarget.closest ? e.currentTarget : e.target.closest('tr');
    if (tr) tr.style.borderTop = '3px solid var(--accent)';
  },
  handleWeaponDragLeave(e) {
    const tr = e.currentTarget.closest ? e.currentTarget : e.target.closest('tr');
    if (tr) tr.style.borderTop = '';
    e.currentTarget.classList.remove('drag-over');
  },
  handleWeaponDrop(e, targetId) {
    e.preventDefault();
    const tr = e.currentTarget.closest ? e.currentTarget : e.target.closest('tr');
    if (tr) tr.style.borderTop = '';
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === targetId) return;
    const arr = this.state.weapons;
    const fromIdx = arr.findIndex(w => w.id === draggedId);
    const toIdx = arr.findIndex(w => w.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    this.renderArmouryList();
    this.triggerAutoSave();
  },
  handleWeaponDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
  },

  // ── Drag and drop for apparel ──
  handleApparelDragStart(e, id) {
    if (this._apparelSort !== 'manual') { e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('dragging');
  },
  handleApparelDragOver(e) {
    if (this._apparelSort !== 'manual') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const tr = e.currentTarget.closest ? e.currentTarget : e.target.closest('tr');
    if (tr) tr.style.borderTop = '3px solid var(--accent)';
  },
  handleApparelDragLeave(e) {
    const tr = e.currentTarget.closest ? e.currentTarget : e.target.closest('tr');
    if (tr) tr.style.borderTop = '';
    e.currentTarget.classList.remove('drag-over');
  },
  handleApparelDrop(e, targetId) {
    e.preventDefault();
    const tr = e.currentTarget.closest ? e.currentTarget : e.target.closest('tr');
    if (tr) tr.style.borderTop = '';
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === targetId) return;
    const arr = this.state.apparel;
    const fromIdx = arr.findIndex(a => a.id === draggedId);
    const toIdx = arr.findIndex(a => a.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    this.renderApparelList();
    this.triggerAutoSave();
  },
  handleApparelDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
  },

  // Build a short summary of utility-specific stats for display in apparel list/widget.
  _utilityStatsSummary(item) {
    if (!item || item.type !== 'utility') return null;
    const number = value => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const parts = [];
    const cat = item.utilityCategory || 'passive';
    const catLabels = { shield: 'Shield', active: 'Active', lance: 'Lance', passive: 'Passive' };
    parts.push(catLabels[cat] || cat);

    if (cat === 'shield') {
      const shield = this._calcShieldStats(item);
      if (shield) {
        parts.push(shield.effectiveHP.toFixed(0) + ' HP');
        parts.push(shield.rechargePerSec.toFixed(1) + ' HP/s');
        if (shield.blocksRangedOut) parts.push('Blocks ranged');
      }
    }
    if (number(item.charges)) parts.push(number(item.charges) + ' charge' + (number(item.charges) > 1 ? 's' : ''));
    if (number(item.range)) parts.push('Range ' + number(item.range).toFixed(0));
    if (number(item.radius)) parts.push('Radius ' + number(item.radius).toFixed(1));
    if (item.singleUse) parts.push('Single-use');
    if (item.statOffsets) {
      const so = item.statOffsets;
      const offset = key => number(so[key]);
      if (offset('rangedCooldownFactor')) parts.push('Ranged CD ' + (offset('rangedCooldownFactor') > 0 ? '+' : '') + (offset('rangedCooldownFactor') * 100).toFixed(0) + '%');
      if (offset('meleeCooldownFactor')) parts.push('Melee CD ' + (offset('meleeCooldownFactor') > 0 ? '+' : '') + (offset('meleeCooldownFactor') * 100).toFixed(0) + '%');
      if (offset('shootingAccuracy')) parts.push('Accuracy ' + (offset('shootingAccuracy') > 0 ? '+' : '') + (offset('shootingAccuracy') * 100).toFixed(0) + '%');
      if (offset('aimingDelayFactor')) parts.push('Aim ' + (offset('aimingDelayFactor') > 0 ? '+' : '') + (offset('aimingDelayFactor') * 100).toFixed(0) + '%');
      if (offset('moveSpeed')) parts.push('Move ' + (offset('moveSpeed') > 0 ? '+' : '') + offset('moveSpeed').toFixed(1));
      if (offset('mechBandwidth')) parts.push('+' + offset('mechBandwidth') + ' bandwidth');
      if (offset('mechControlGroups')) parts.push('+' + offset('mechControlGroups') + ' control');
    }
    return parts;
  },

  // Canonical weapon DPS calculation - single source of truth used by list + comparison views.
  // Optional utility parameter applies belt-slot modifiers (cooldown factor, shield blocks ranged).
  _calcWeaponDPS(w, targetSharp = 0, targetBlunt = 0, utility = null) {
    if (!w || typeof w !== 'object') w = {}; // tolerate a null/corrupt list entry
    // Coerce numeric stats - a custom/mod-scanned/hand-edited weapon may carry
    // non-numeric strings that would otherwise turn DPS into NaN.
    const n = (v, d = 0) => { const x = Number(v); return Number.isFinite(x) ? x : d; };
    w = { ...w,
      damage: n(w.damage), ap: n(w.ap), cooldown: n(w.cooldown), warmup: n(w.warmup),
      burstCount: n(w.burstCount), burstTicks: n(w.burstTicks),
      accuracyTouch: n(w.accuracyTouch), accuracyShort: n(w.accuracyShort),
      accuracyMedium: n(w.accuracyMedium), accuracyLong: n(w.accuracyLong),
    };
    const q    = WEAPON_QUALITIES.find(x => x.id === (w.quality || 'normal')) || WEAPON_QUALITIES[2];
    const isMelee = w.type === 'melee';

    // Quality damage multiplier differs between ranged and melee (verified from game StatDefs).
    // Ranged: RangedWeapon_DamageMultiplier (awful=0.9, poor-excellent=1.0, mw=1.25, leg=1.5)
    // Melee: MeleeWeapon_DamageMultiplier (awful=0.8, poor=0.9 ... mw=1.45, leg=1.65)
    const qDmg = isMelee ? (q.meleeDmg || q.rangedDmg || 1) : (q.rangedDmg || 1);

    // Material modifiers for melee weapons (stuff system).
    // Game: Tool.AdjustedBaseMeleeDamageAmount multiplies tool.power by
    //   equipment.GetStatValue(MeleeWeapon_DamageMultiplier) AND
    //   equipment.Stuff.GetStatValueAbstract(damageDef.armorCategory.multStat) [sharp/blunt mult].
    // Tool.AdjustedCooldown multiplies cooldownTime by
    //   equipment.GetStatValue(MeleeWeapon_CooldownMultiplier) [stuff stat factor, no quality].
    let stuffDmgMult = 1;
    let stuffCdMult = 1;
    if (isMelee && w.stuffBased) {
      let mat = w.stuff ? findMaterial(w.stuff, this.state.materials) : null;
      if (!mat && w.stuffCategories && w.stuffCategories.length > 0) {
        const available = getAvailableMaterials(w, this.state.materials);
        if (available.length > 0) mat = available[0];
      }
      if (mat) {
        const dmgType = w.meleeDamageType || 'sharp';
        stuffDmgMult = dmgType === 'blunt' ? (mat.bluntDmg || 1) : (mat.sharpDmg || 1);
        stuffCdMult = mat.meleeCooldown || 1;
      }
    }

    const dmg = (w.damage || 0) * qDmg * stuffDmgMult;
    // AP: if no explicit AP the game derives it from damage * 0.015. BOTH ranged and
    // melee AP are scaled by the weapon's quality damage multiplier:
    //   ranged: projectile AP * RangedWeapon_DamageMultiplier  (verified ProjectileProperties.GetArmorPenetration)
    //   melee:  AP * MeleeWeapon_DamageMultiplier (+ stuff for the auto/damage-derived case)
    //           (verified VerbProperties.AdjustedArmorPenetration)
    const ap  = isMelee
      ? (w.ap || ((w.damage || 0) * 0.015)) * qDmg * stuffDmgMult
      : (w.ap || ((w.damage || 0) * 0.015)) * qDmg;

    // Armour reduction - matches ArmorUtility.ApplyArmor from game source.
    // Game rolls random 0-1 vs effective armour num = max(0, armorRating - AP):
    //   roll < num/2  -> full deflect (0 damage)
    //   roll < num    -> half damage (sharp converted to blunt)
    //   roll >= num   -> full damage
    // Expected post-armour multiplier across the FULL range (num can exceed 1 when
    // armour > 100% vs a low-AP weapon, which the old `min(1,...)` clamp ignored -
    // overestimating damage vs heavy armour like cataphract):
    //   num<=1 : 1 - 0.75*num      (deflect num/2, half num/2, full 1-num)
    //   1<num<2: (2 - num) / 4     (no full hits; deflect num/2, half 1-num/2)
    //   num>=2 : 0                 (always deflects)
    // targetSharp is passed as percentage (0-200), ap is decimal (0-1).
    const targetArmour = isMelee && w.meleeDamageType === 'blunt' ? targetBlunt : targetSharp;
    const num = Math.max(0, (n(targetArmour) - ap * 100) / 100);
    const armorMult = num <= 1 ? (1 - 0.75 * num) : (num < 2 ? (2 - num) / 4 : 0);
    const effDmg = dmg * armorMult;

    // Utility stat offsets (e.g. RangedCooldownFactor from heavy bandolier mods)
    const rangedCdFactor = 1 + ((utility && utility.statOffsets && utility.statOffsets.rangedCooldownFactor) || 0);
    const meleeCdFactor  = 1 + ((utility && utility.statOffsets && utility.statOffsets.meleeCooldownFactor) || 0);

    // Shield belt that blocks ranged out: ranged DPS becomes 0
    const shieldBlocksRanged = utility && utility.blocksRangedOut === true;

    if (isMelee) {
      // Melee cooldown: tool.cooldownTime * MeleeWeapon_CooldownMultiplier (stuff, no quality)
      const cd  = Math.max(0.001, (w.cooldown || 1) * meleeCdFactor * stuffCdMult);
      const dps = effDmg / cd;
      return { paper: dps, touch: dps, short: null, medium: null, long: null, ap: ap,
               accT: 1, accS: null, accM: null, accL: null, shieldBlocked: false,
               stuffDmgMult, stuffCdMult };
    }

    // Shield belt blocks wearer from firing ranged weapons (AllowVerbCast check)
    if (shieldBlocksRanged) {
      return { paper: 0, touch: 0, short: 0, medium: 0, long: 0, ap: ap,
               accT: 0, accS: 0, accM: 0, accL: 0, shieldBlocked: true };
    }

    // Ranged cycle time: warmup + cooldown + (burstCount-1) * ticksBetweenBurstShots / 60
    // Matches VerbProperties.AdjustedFullCycleTime exactly.
    // RangedWeapon_Cooldown has no quality StatPart - cooldown is NOT quality-scaled.
    const burstCount = Math.max(1, w.burstCount || 1);
    const cooldown   = (w.cooldown || 0) * rangedCdFactor;
    const cycleTime  = (w.warmup || 0) + cooldown + ((burstCount - 1) * (w.burstTicks || 0) / 60);
    const paperDPS   = (effDmg * burstCount) / Math.max(0.001, cycleTime);

    const accT = Math.min(1.0, (w.accuracyTouch  || 0) * q.acc);
    const accS = Math.min(1.0, (w.accuracyShort  || 0) * q.acc);
    const accM = Math.min(1.0, (w.accuracyMedium || 0) * q.acc);
    const accL = Math.min(1.0, (w.accuracyLong   || 0) * q.acc);

    return {
      paper:  paperDPS,
      touch:  paperDPS * accT,
      short:  paperDPS * accS,
      medium: paperDPS * accM,
      long:   paperDPS * accL,
      ap:     ap,
      accT, accS, accM, accL,
      shieldBlocked: false
    };
  },

  // Calculate effective shield HP and recharge rate for a utility item.
  _calcShieldStats(util) {
    if (!util || util.utilityCategory !== 'shield') return null;
    const finite = (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const maxEnergy = finite(util.shieldMax);
    const parsedLoss = finite(util.shieldLossPerDmg, 0.033);
    const lossPerDmg = parsedLoss > 0 ? parsedLoss : 0.033;
    const rechargeRate = finite(util.shieldRecharge);
    return {
      effectiveHP: maxEnergy / lossPerDmg,
      rechargePerSec: (rechargeRate / lossPerDmg),
      maxEnergy: maxEnergy,
      rechargeRate: rechargeRate,
      blocksRangedOut: util.blocksRangedOut === true
    };
  },

  toggleArmouryMode() {
    this.state.armouryMode = this.state.armouryMode === 'list' ? 'compare' : 'list';
    const btn = document.getElementById('armouryCompareBtn');
    if (btn) {
      const isCompare = this.state.armouryMode === 'compare';
      if (isCompare) {
        btn.style.background = 'var(--accent)';
        btn.style.color = 'var(--bg)';
        btn.style.borderColor = 'var(--accent)';
      } else {
        btn.style.background = '';
        btn.style.color = '';
        btn.style.borderColor = '';
      }
    }
    this.renderArmoury();
  },

  updateComparisonField(side, field, value) {
    const data = this.state.comparisonData[side];
    if (field === 'name' || field === 'quality') data[field] = value;
    else if (field.includes('burst') || field === 'range') data[field] = parseInt(value) || 0;
    else data[field] = parseFloat(value) || 0;
    // Only re-render analysis, NOT the forms, replacing form innerHTML mid-event kills dropdowns
    this.analyzeComparison();
  },

  setThreatPreset(id) {
    const preset = THREAT_PRESETS.find(p => p.id === id) || THREAT_PRESETS[0];
    this.state.comparisonData.targetPreset = preset.id;
    this.state.comparisonData.targetSharp = preset.sharp * 100;
    this.state.comparisonData.targetBlunt = preset.blunt * 100;
    this.renderThreatControls();
    this.analyzeComparison();
  },

  updateThreatArmour(field, value) {
    if (field !== 'targetSharp' && field !== 'targetBlunt') return;
    const parsed = Number(value);
    this.state.comparisonData[field] = Number.isFinite(parsed)
      ? Math.max(0, Math.min(200, parsed)) : 0;
    this.state.comparisonData.targetPreset = 'custom';
    this.renderThreatControls();
    this.analyzeComparison();
  },

  _activeThreatPreset() {
    const data = this.state.comparisonData || {};
    const sharp = Number(data.targetSharp) || 0;
    const blunt = Number(data.targetBlunt) || 0;
    return THREAT_PRESETS.find(p => Math.abs(p.sharp * 100 - sharp) < 0.001
      && Math.abs(p.blunt * 100 - blunt) < 0.001) || null;
  },

  renderThreatControls() {
    const el = document.getElementById('weaponThreatControls');
    if (!el) return;
    const data = this.state.comparisonData || {};
    const active = this._activeThreatPreset();
    const sharp = Math.max(0, Math.min(200, Number(data.targetSharp) || 0));
    const blunt = Math.max(0, Math.min(200, Number(data.targetBlunt) || 0));
    el.innerHTML = `
      <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px">
        <span class="section-title section-title--sm" style="margin:0 6px 0 0">Target armour</span>
        ${THREAT_PRESETS.map(p => `<button class="btn btn-sm ${active && active.id === p.id ? 'btn-accent' : ''}"
          onclick="App.setThreatPreset('${p.id}')" aria-pressed="${active && active.id === p.id}">${_escapeHtml(p.label)}</button>`).join('')}
        <label style="margin-left:auto; display:flex; align-items:center; gap:5px; font-size:var(--f-xs); color:var(--text3)">
          Sharp % <input type="number" min="0" max="200" step="1" class="skill-input" style="width:64px" value="${sharp}"
            onchange="App.updateThreatArmour('targetSharp', this.value)">
        </label>
        <label style="display:flex; align-items:center; gap:5px; font-size:var(--f-xs); color:var(--text3)">
          Blunt % <input type="number" min="0" max="200" step="1" class="skill-input" style="width:64px" value="${blunt}"
            onchange="App.updateThreatArmour('targetBlunt', this.value)">
        </label>
      </div>
      <div style="margin-top:6px; font-size:var(--f-xs); color:var(--text3)">Effective DPS below includes the selected target's armour after each weapon's penetration. Blunt melee uses the blunt value.</div>`;
  },

  // Sub-tab dispatcher for the unified Armoury tab (Weapons / Apparel / Loadouts).
  renderArmoury() {
    const sub = this.state.armourySubTab || 'weapons';
    // Sub-tab bar active states
    document.querySelectorAll('#armourySubTabs .sub-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.sub === sub));
    // Hide every content block; the active sub-render shows its own.
    ['armouryContent', 'armouryComparison', 'apparelContent', 'apparelComparison', 'apparelLoadout']
      .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });

    const actions = document.getElementById('armourySubActions');
    const desc = document.getElementById('armourySubDesc');

    if (sub === 'apparel') {
      if (desc) desc.textContent = 'Model armour ratings, insulation, coverage, and utility items. Quality scales all armour stats.';
      if (this.state.apparelMode === 'loadout') this.state.apparelMode = 'list'; // loadouts is now its own sub-tab
      if (actions) actions.innerHTML =
        `<button class="btn btn-accent" data-mode="compare" onclick="App.setApparelMode('compare')" style="${this.state.apparelMode === 'compare' ? 'background:var(--accent);color:var(--bg)' : ''}">Direct Comparison</button>
         <button class="btn" onclick="App.openApparelEditor()">+ Add Item</button>
         <button class="btn btn-accent" id="scanModApparelBtn" onclick="App.scanModEquipment('apparel')" title="Scan RimWorld mods for apparel">Scan Mods</button>
         ${(this.state.apparel || []).length ? `<button class="btn btn-danger" onclick="App.deleteAllApparel()" title="Remove every item from the apparel lab">Delete All</button>` : ''}
         <button class="btn" onclick="App.resetApparelToDefaults()" title="Replace the list with the default vanilla apparel">Reset to Defaults</button>`;
      this.renderApparel();
    } else if (sub === 'loadouts') {
      if (desc) desc.textContent = 'Build two full kits and compare their protection, insulation, mass and weapon DPS side by side.';
      if (actions) actions.innerHTML = '';
      const el = document.getElementById('apparelLoadout');
      if (el) el.style.display = 'flex';
      this.renderApparelLoadout();
    } else { // weapons
      if (desc) desc.textContent = 'Compare weapon lethality, burst patterns, and effective DPS at range.';
      if (actions) actions.innerHTML =
        `<button class="btn btn-accent" data-mode="compare" id="armouryCompareBtn" onclick="App.toggleArmouryMode()" style="${this.state.armouryMode === 'compare' ? 'background:var(--accent);color:var(--bg)' : ''}">${this.state.armouryMode === 'compare' ? 'Back to List' : 'Direct Comparison'}</button>
         <button class="btn" onclick="App.openWeaponEditor()">+ Add Weapon</button>
         <button class="btn btn-accent" id="scanModWeaponsBtn" onclick="App.scanModEquipment('weapons')" title="Scan RimWorld mods for weapons">Scan Mods</button>
         ${(this.state.weapons || []).length ? `<button class="btn btn-danger" onclick="App.deleteAllWeapons()" title="Remove every weapon from the armoury">Delete All</button>` : ''}
         <button class="btn" onclick="App.resetWeaponsToDefaults()" title="Replace the list with the default vanilla weapons">Reset to Defaults</button>`;
      this._renderWeaponsPane();
    }
  },

  setArmourySubTab(sub) {
    this.state.armourySubTab = sub;
    this.renderArmoury();
  },

  _renderWeaponsPane() {
    const listEl = document.getElementById('armouryContent');
    const compEl = document.getElementById('armouryComparison');
    if (!listEl || !compEl) return;

    if (this.state.armouryMode === 'list') {
      listEl.style.display = 'grid';
      compEl.style.display = 'none';
      this.renderArmouryList();
    } else {
      listEl.style.display = 'none';
      compEl.style.display = 'flex';
      this.renderComparisonView();
    }
  },

  renderArmouryList() {
    const c = document.getElementById('armouryContent');
    const allWeapons = this.state.weapons || [];
    const isCompact = this._isCompactArmouryLayout(c);
    this._armouryCompactLayout = isCompact;
    c.classList.toggle('gear-compact', isCompact);

    if (allWeapons.length === 0) {
      c.innerHTML = `
        <div class="widget-gear-empty" style="grid-column: 1 / -1; text-align:center; padding:${isCompact ? '24px 12px' : '60px 20px'}; border:2px dashed var(--border-med); border-radius:12px; color:var(--text3)">
          <div style="font-size:${isCompact ? '18px' : 'calc(var(--f-base) * 2.4)'}; margin-bottom:16px; color:var(--text3)">ARMOURY</div>
          <h3 style="color:var(--text2); margin-bottom:8px; font-size:${isCompact ? '12px' : 'inherit'}">No weapons in the armoury</h3>
          <p style="font-size:${isCompact ? '11px' : 'inherit'}">Add weapons to begin tactical comparisons.</p>
          <button class="btn" onclick="App.openWeaponEditor()" style="margin-top:12px">+ Add Weapon</button>
        </div>`;
      return;
    }

    // Apply type filter
    const filter = this._armouryFilter || 'all';
    const filtered = filter === 'all' ? allWeapons
      : allWeapons.filter(w => w.type === filter);

    // Apply sort (favourites pinned to top, unaffected by sort)
    const sortField = this._armourySort || 'manual';
    const sortDir = this._armourrySortDir;
    // Memoise DPS for this render: _sortGearList calls it PER COMPARISON (O(n log n)) and each
    // card recomputes it - costly on huge modded weapon lists. Compute once per weapon.
    const _dpsCache = new Map();
    const dpsOf = (w) => { let d = _dpsCache.get(w.id); if (d === undefined) { d = this._calcWeaponDPS(w); _dpsCache.set(w.id, d); } return d; };
    const weapons = this._applyFavouriteSort(filtered, sortField, sortDir, dpsOf);
    const pageSize = this._gearPageSize;
    const pageCount = Math.max(1, Math.ceil(weapons.length / pageSize));
    const page = Math.min(Math.max(0, this._armouryPage || 0), pageCount - 1);
    this._armouryPage = page;
    const visibleWeapons = weapons.slice(page * pageSize, (page + 1) * pageSize);
    const rangeStart = weapons.length ? page * pageSize + 1 : 0;
    const rangeEnd = Math.min((page + 1) * pageSize, weapons.length);
    const pageOptions = Array.from({ length: pageCount }, (_, index) =>
      `<option value="${index}" ${index === page ? 'selected' : ''}>Page ${index + 1} of ${pageCount}</option>`).join('');

    const getQual = (id) => WEAPON_QUALITIES.find(q => q.id === (id || 'normal')) || WEAPON_QUALITIES[2];
    const modCount = allWeapons.filter(w => w.modSource).length;
    const hasModItems = modCount > 0;
    const isManual = sortField === 'manual';

    // Star icon helper
    const star = (w) => {
      const on = w.favourite;
      return `<span class="gear-fav" data-gear-id="${_escapeHtml(w.id)}" style="cursor:pointer; font-size:14px; color:${on ? 'var(--accent)' : 'var(--text3)'}; opacity:${on ? '1' : '0.4'}; margin-right:6px" onclick="event.stopPropagation(); App.toggleWeaponFavourite(this.dataset.gearId)" title="${on ? 'Unfavourite' : 'Favourite'}">${on ? '★' : '☆'}</span>`;
    };

    // Drag handle (only in manual mode)
    const grip = isManual ? '<span style="cursor:grab; color:var(--text3); opacity:0.5; margin-right:6px; font-size:12px" title="Drag to reorder">☰</span>' : '';

    // Build filter/sort bar
    const filterPill = (id, label) => {
      const active = filter === id;
      return `<button class="btn btn-sm" style="font-size:10px; ${active ? 'background:var(--accent); color:var(--bg)' : ''}" onclick="App.setArmouryFilter('${id}')">${label}</button>`;
    };

    let html = `<div style="grid-column:1/-1; display:flex; flex-wrap:wrap; align-items:center; gap:6px; padding:8px 12px; background:var(--surface3); border-radius:8px; font-size:var(--f-xs); color:var(--text2)">
      <span style="font-weight:700; color:var(--text3); margin-right:4px">Filter:</span>
      ${filterPill('all', 'All (' + allWeapons.length + ')')}
      ${filterPill('ranged', 'Ranged')}
      ${filterPill('melee', 'Melee')}
      <span style="margin-left:8px; font-weight:700; color:var(--text3)">Sort:</span>
      <select class="skill-input" style="width:auto; min-width:80px; font-size:var(--f-sm); padding:2px 8px; font-family:inherit; letter-spacing:0.01em" onchange="App.setArmourySort(this.value)">
        <option value="manual" ${sortField === 'manual' ? 'selected' : ''}>Manual (drag)</option>
        <option value="name" ${sortField === 'name' ? 'selected' : ''}>Name</option>
        <option value="type" ${sortField === 'type' ? 'selected' : ''}>Type</option>
        <option value="damage" ${sortField === 'damage' ? 'selected' : ''}>Damage</option>
        <option value="range" ${sortField === 'range' ? 'selected' : ''}>Range</option>
        <option value="paper" ${sortField === 'paper' ? 'selected' : ''}>Paper DPS</option>
        <option value="touch" ${sortField === 'touch' ? 'selected' : ''}>Touch DPS</option>
        <option value="short" ${sortField === 'short' ? 'selected' : ''}>Short DPS</option>
        <option value="medium" ${sortField === 'medium' ? 'selected' : ''}>Medium DPS</option>
        <option value="long" ${sortField === 'long' ? 'selected' : ''}>Long DPS</option>
        <option value="ap" ${sortField === 'ap' ? 'selected' : ''}>AP</option>
        ${hasModItems ? '<option value="mod" ' + (sortField === 'mod' ? 'selected' : '') + '>Mod Source</option>' : ''}
      </select>
      ${sortField !== 'manual' ? `<button class="btn btn-sm" style="font-size:10px; padding:2px 8px" onclick="App._armourrySortDir = App._armourrySortDir === 'asc' ? 'desc' : 'asc'; App.renderArmouryList()">${sortDir === 'asc' ? '&#9650; Asc' : '&#9660; Desc'}</button>` : ''}
      <span style="margin-left:auto; color:var(--text3)">${rangeStart}-${rangeEnd} of ${weapons.length} weapon${weapons.length !== 1 ? 's' : ''}</span>
      ${pageCount > 1 ? `<div class="gear-pagination">
        <button class="btn btn-sm" onclick="App.setArmouryPage(${page - 1})" ${page === 0 ? 'disabled' : ''} aria-label="Previous weapon page">&lt;</button>
        <select class="skill-input" onchange="App.setArmouryPage(this.value)" aria-label="Weapon page">${pageOptions}</select>
        <button class="btn btn-sm" onclick="App.setArmouryPage(${page + 1})" ${page === pageCount - 1 ? 'disabled' : ''} aria-label="Next weapon page">&gt;</button>
      </div>` : ''}
    </div>`;

    if (modCount > 0) {
      html += `<div style="grid-column:1/-1; display:flex; align-items:center; gap:8px; padding:6px 12px; background:var(--surface2); border-radius:6px; font-size:var(--f-xs); color:var(--text3)">
        <span class="mod-badge" style="margin:0">${modCount} mod</span> weapons loaded from mods
        <button class="btn btn-sm btn-danger" style="margin-left:auto; font-size:10px" onclick="App.clearModItems('weapons')">Clear Mod Weapons</button>
      </div>`;
    }

    if (isCompact) {
      // Card layout for widget mode or a narrow Armoury pane
      html += `<div style="display:flex; flex-direction:column; gap:8px">`;
      visibleWeapons.forEach(w => {
        const dps = dpsOf(w);
        const q = getQual(w.quality);
        html += `
          <div class="widget-gear-card" ${isManual ? `data-gear-id="${_escapeHtml(w.id)}" draggable="true" ondragstart="App.handleWeaponDragStart(event,this.dataset.gearId)" ondragover="App.handleWeaponDragOver(event)" ondragleave="App.handleWeaponDragLeave(event)" ondrop="App.handleWeaponDrop(event,this.dataset.gearId)" ondragend="App.handleWeaponDragEnd(event)"` : ''} style="${w.favourite ? 'border-left:3px solid var(--accent)' : ''}">
            <div style="display:flex; justify-content:space-between; align-items:center">
              <div>
                <div class="widget-gear-name">${star(w)}${grip}${_escapeHtml(w.name)}${_modBadge(w)}</div>
                <div class="widget-gear-sub">${w.range || 'Melee'} · ${w.type} · <span style="color:${q.color}; font-weight:700">${q.label}</span>${w.stuff ? ' · ' + _escapeHtml(((findMaterial(w.stuff, this.state.materials) || {}).label || w.stuff)) : ''}</div>
              </div>
            </div>
            <div class="widget-gear-stats">
              <div class="widget-gear-stat"><span class="widget-gear-stat-label"${jtip('paper')}>DPS</span> <span class="widget-gear-stat-val" style="color:var(--accent)">${dps.paper.toFixed(1)}</span></div>
              <div class="widget-gear-stat"><span class="widget-gear-stat-label"${jtip('touch')}>Touch</span> <span class="widget-gear-stat-val">${dps.touch.toFixed(1)}</span></div>
              ${w.type === 'ranged' ? `<div class="widget-gear-stat"><span class="widget-gear-stat-label"${jtip('short')}>Short</span> <span class="widget-gear-stat-val">${dps.short.toFixed(1)}</span></div>
              <div class="widget-gear-stat"><span class="widget-gear-stat-label"${jtip('medium')}>Med</span> <span class="widget-gear-stat-val">${dps.medium.toFixed(1)}</span></div>` : ''}
              <div class="widget-gear-stat"><span class="widget-gear-stat-label"${jtip('ap')}>AP</span> <span class="widget-gear-stat-val" style="color:var(--p2-txt)">${((dps.ap||0)*100).toFixed(0)}%</span></div>
            </div>
            <div class="widget-gear-actions">
              <button class="btn btn-sm" data-gear-id="${_escapeHtml(w.id)}" onclick="App.openWeaponEditor(this.dataset.gearId)">Edit</button>
              <button class="btn btn-sm btn-danger" data-gear-id="${_escapeHtml(w.id)}" onclick="App.deleteWeapon(this.dataset.gearId)">Del</button>
            </div>
          </div>`;
      });
      html += `</div>`;
    } else {
      // Full table for desktop
      const thSort = (field, label, align) => {
        const active = sortField === field;
        const arrow = active ? (sortDir === 'asc' ? ' &#9650;' : ' &#9660;') : '';
        const col = active ? 'color:var(--accent)' : '';
        return `<th style="padding:12px; font-size:var(--f-xs); ${align ? 'text-align:' + align : ''}; cursor:pointer; ${col}"${jtip(field)} onclick="App.setArmourySort('${field}')">${label}${arrow}</th>`;
      };
      html += `
        <div class="gear-table-scroll">
          <table class="armoury-table armoury-table--weapons" style="width:100%; border-collapse:collapse; background:var(--surface2); border:1px solid var(--border-med); border-radius:var(--radius-lg); overflow:hidden">
            <thead>
              <tr style="background:var(--surface3); text-align:left">
                ${thSort('name', 'WEAPON', '')}
                <th style="padding:12px; font-size:var(--f-xs)"${jtip('quality')}>QUALITY</th>
                ${thSort('paper', 'PAPER DPS', 'center')}
                ${thSort('touch', 'TOUCH (3m)', 'center')}
                ${thSort('short', 'SHORT (12m)', 'center')}
                ${thSort('medium', 'MED (25m)', 'center')}
                ${thSort('long', 'LONG (40m)', 'center')}
                ${thSort('ap', 'AP', 'center')}
                <th style="padding:12px; font-size:var(--f-xs); text-align:right">ACTIONS</th>
              </tr>
            </thead>
            <tbody>`;

      visibleWeapons.forEach(w => {
        const dps = dpsOf(w);
        const q   = getQual(w.quality);
        html += `
          <tr style="border-bottom:1px solid var(--border); ${w.favourite ? 'background:rgba(232,168,56,0.04)' : ''}" ${isManual ? `data-gear-id="${_escapeHtml(w.id)}" draggable="true" ondragstart="App.handleWeaponDragStart(event,this.dataset.gearId)" ondragover="App.handleWeaponDragOver(event)" ondragleave="App.handleWeaponDragLeave(event)" ondrop="App.handleWeaponDrop(event,this.dataset.gearId)" ondragend="App.handleWeaponDragEnd(event)"` : ''}>
            <td style="padding:12px">
              <div style="font-weight:700; color:var(--text); display:flex; align-items:center">${star(w)}${grip}${_escapeHtml(w.name)}${_modBadge(w)}</div>
              <div style="font-size:var(--f-xs); color:var(--text3); ${isManual ? 'padding-left:20px' : ''}">${w.range ? 'Range: ' + w.range : 'Melee'} | ${w.type}${w.stuff ? ' | ' + _escapeHtml(((findMaterial(w.stuff, this.state.materials) || {}).label || w.stuff)) : ''}</div>
            </td>
            <td style="padding:12px">
              <span style="font-size:var(--f-xs); font-weight:700; color:${q.color}; text-transform:uppercase; background:rgba(0,0,0,0.2); padding:2px 6px; border-radius:4px">${q.label}</span>
            </td>
            <td style="padding:12px; text-align:center; color:var(--accent); font-weight:800">${dps.paper.toFixed(2)}</td>
            <td style="padding:12px; text-align:center">${dps.touch.toFixed(2)}</td>
            <td style="padding:12px; text-align:center">${w.type === 'ranged' ? dps.short.toFixed(2) : '-'}</td>
            <td style="padding:12px; text-align:center">${w.type === 'ranged' ? dps.medium.toFixed(2) : '-'}</td>
            <td style="padding:12px; text-align:center">${w.type === 'ranged' ? dps.long.toFixed(2) : '-'}</td>
            <td style="padding:12px; text-align:center; color:var(--p2-txt)">${((dps.ap || 0) * 100).toFixed(0)}%</td>
            <td style="padding:12px; text-align:right">
              <button class="btn btn-sm" data-gear-id="${_escapeHtml(w.id)}" onclick="App.openWeaponEditor(this.dataset.gearId)">Edit</button>
              <button class="btn btn-sm btn-danger" data-gear-id="${_escapeHtml(w.id)}" onclick="App.deleteWeapon(this.dataset.gearId)">Delete</button>
            </td>
          </tr>`;
      });

      html += `</tbody></table></div>`;
    }

    // Quality modifier reference
    if (isCompact) {
      html += `
        <div class="settings-card" style="background:var(--surface2); margin-top:8px; padding:8px">
          <div class="section-title section-title--sm">Quality Modifiers</div>
          <div style="display:flex; flex-direction:column; gap:4px">
            ${WEAPON_QUALITIES.map(q => `
              <div style="display:flex; align-items:center; gap:6px; padding:4px 6px; background:rgba(0,0,0,0.15); border-radius:4px; border-left:3px solid ${q.color}">
                <span style="font-weight:800; color:${q.color}; font-size:calc(10px * var(--font-scale)); min-width:60px; text-transform:uppercase">${q.label}</span>
                <span style="font-size:calc(9px * var(--font-scale)); color:var(--text3)">Acc</span><span style="font-size:calc(10px * var(--font-scale)); font-weight:700; color:var(--text)">×${q.acc}</span>
                <span style="font-size:calc(9px * var(--font-scale)); color:var(--text3); margin-left:4px">R.Dmg</span><span style="font-size:calc(10px * var(--font-scale)); font-weight:700; color:var(--text)">×${q.rangedDmg}</span>
                <span style="font-size:calc(9px * var(--font-scale)); color:var(--text3); margin-left:4px">M.Dmg</span><span style="font-size:calc(10px * var(--font-scale)); font-weight:700; color:var(--text)">×${q.meleeDmg}</span>
              </div>`).join('')}
          </div>
          <p style="font-size:calc(9px * var(--font-scale)); color:var(--text3); margin-top:6px; font-style:italic">
            Accuracy scales across all tiers. Ranged Dmg changes at Masterwork+. Melee Dmg/AP scales at every tier.
          </p>
        </div>`;
    } else {
      html += `
        <div class="settings-card" style="background:var(--surface2); margin-top:8px">
          <div class="section-title section-title--sm">Weapon Quality Modifier Reference</div>
          <table style="width:100%; border-collapse:collapse; font-size:var(--f-xs)">
            <thead>
              <tr style="text-align:center; color:var(--text3); text-transform:uppercase; font-weight:700">
                <th style="padding:6px 12px; text-align:left">Quality</th>
                <th style="padding:6px 12px">Accuracy</th>
                <th style="padding:6px 12px">Ranged Dmg</th>
                <th style="padding:6px 12px">Melee Dmg/AP</th>
              </tr>
            </thead>
            <tbody>
              ${WEAPON_QUALITIES.map(q => `
                <tr style="border-top:1px solid var(--border)">
                  <td style="padding:6px 12px; font-weight:800; color:${q.color}; text-transform:uppercase">${q.label}</td>
                  <td style="padding:6px 12px; text-align:center; font-weight:700; color:var(--text)">×${q.acc}</td>
                  <td style="padding:6px 12px; text-align:center; font-weight:700; color:var(--text)">×${q.rangedDmg}</td>
                  <td style="padding:6px 12px; text-align:center; font-weight:700; color:var(--text)">×${q.meleeDmg}</td>
                </tr>`).join('')}
            </tbody>
          </table>
          <p style="font-size:var(--f-xs); color:var(--text3); margin-top:10px; font-style:italic">
            Accuracy scales across all quality levels. Ranged damage only changes at Masterwork and Legendary. Melee damage and AP scale at every quality tier.
          </p>
        </div>`;
    }

    c.innerHTML = html;
  },

  prefillComparison(side, weaponId) {
    if (!weaponId) return;
    const w = this.state.weapons.find(x => x.id === weaponId);
    if (!w) return;
    // Clone weapon data into comparison slot
    this.state.comparisonData[side] = { ...w };
    this.renderComparisonView();
  },

  renderComparisonView() {
    const weapons = this.state.weapons || [];
    
    const renderForm = (side) => {
      const w = this.state.comparisonData[side];
      return `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:12px">
          <div>
            <label class="settings-label" style="font-size:var(--f-xs); color:var(--accent)">Pre-fill from Armoury</label>
            <select class="skill-input" style="width:100%; margin-top:2px" onchange="App.prefillComparison('${side}', this.value)">
              <option value="">-- Select Weapon --</option>
              ${weapons.map(x => `<option value="${_escapeHtml(x.id)}" ${x.id === w.id ? 'selected' : ''}>${_escapeHtml(x.name)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="settings-label" style="font-size:var(--f-xs); color:var(--accent)">Weapon Quality</label>
            <select class="skill-input" style="width:100%; margin-top:2px" onchange="App.updateComparisonField('${side}', 'quality', this.value)">
              ${WEAPON_QUALITIES.map(q => `<option value="${q.id}" ${w.quality === q.id ? 'selected' : ''}>${q.label} (Acc ×${q.acc} / Dmg ×${q.rangedDmg}/${q.meleeDmg})</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px">
          <div style="grid-column: 1 / -1; margin-bottom:4px">
            <label class="settings-label" style="display:block; margin-bottom:4px; font-size:var(--f-xs)">Display Name</label>
            <input type="text" class="skill-input" style="width:100%; font-weight:700" value="${_escapeHtml(w.name)}" oninput="App.updateComparisonField('${side}', 'name', this.value)">
          </div>
          <div><label class="settings-label" style="display:block; margin-bottom:4px; font-size:var(--f-xs)">Base Damage</label><input type="number" class="skill-input" style="width:100%" value="${w.damage}" oninput="App.updateComparisonField('${side}', 'damage', this.value)"></div>
          <div><label class="settings-label" style="display:block; margin-bottom:4px; font-size:var(--f-xs)">Base AP</label><input type="number" step="0.01" class="skill-input" style="width:100%" value="${w.ap}" oninput="App.updateComparisonField('${side}', 'ap', this.value)"><div style="font-size:var(--f-xs);color:var(--text3);margin-top:2px">0 = auto (0.015×dmg)</div></div>
          <div><label class="settings-label" style="display:block; margin-bottom:4px; font-size:var(--f-xs)">Warmup (sec)</label><input type="number" step="0.01" class="skill-input" style="width:100%" value="${w.warmup}" oninput="App.updateComparisonField('${side}', 'warmup', this.value)"></div>
          <div><label class="settings-label" style="display:block; margin-bottom:4px; font-size:var(--f-xs)">Cooldown (sec)</label><input type="number" step="0.01" class="skill-input" style="width:100%" value="${w.cooldown}" oninput="App.updateComparisonField('${side}', 'cooldown', this.value)"></div>
          <div><label class="settings-label" style="display:block; margin-bottom:4px; font-size:var(--f-xs)">Burst Count</label><input type="number" class="skill-input" style="width:100%" value="${w.burstCount}" oninput="App.updateComparisonField('${side}', 'burstCount', this.value)"></div>
          <div><label class="settings-label" style="display:block; margin-bottom:4px; font-size:var(--f-xs)">Ticks/Shot</label><input type="number" class="skill-input" style="width:100%" value="${w.burstTicks}" oninput="App.updateComparisonField('${side}', 'burstTicks', this.value)"></div>
          <div><label class="settings-label" style="display:block; margin-bottom:4px; font-size:var(--f-xs)">Acc Touch (3m)</label><input type="number" step="0.01" min="0" max="1" class="skill-input" style="width:100%" value="${w.accuracyTouch}" oninput="App.updateComparisonField('${side}', 'accuracyTouch', this.value)"></div>
          <div><label class="settings-label" style="display:block; margin-bottom:4px; font-size:var(--f-xs)">Acc Short (12m)</label><input type="number" step="0.01" min="0" max="1" class="skill-input" style="width:100%" value="${w.accuracyShort}" oninput="App.updateComparisonField('${side}', 'accuracyShort', this.value)"></div>
          <div><label class="settings-label" style="display:block; margin-bottom:4px; font-size:var(--f-xs)">Acc Medium (25m)</label><input type="number" step="0.01" min="0" max="1" class="skill-input" style="width:100%" value="${w.accuracyMedium}" oninput="App.updateComparisonField('${side}', 'accuracyMedium', this.value)"></div>
          <div><label class="settings-label" style="display:block; margin-bottom:4px; font-size:var(--f-xs)">Acc Long (40m)</label><input type="number" step="0.01" min="0" max="1" class="skill-input" style="width:100%" value="${w.accuracyLong}" oninput="App.updateComparisonField('${side}', 'accuracyLong', this.value)"></div>
        </div>
      `;
    };

    document.getElementById('comp-form-a').innerHTML = renderForm('a');
    document.getElementById('comp-form-b').innerHTML = renderForm('b');

    this.renderThreatControls();
    this.analyzeComparison();
  },

  analyzeComparison() {
    const a = this.state.comparisonData.a;
    const b = this.state.comparisonData.b;

    // Use the shared DPS engine - same formula and quality multipliers as the list view
    const targetSharp = Math.max(0, Math.min(200, Number(this.state.comparisonData.targetSharp) || 0));
    const targetBlunt = Math.max(0, Math.min(200, Number(this.state.comparisonData.targetBlunt) || 0));
    const resA = this._calcWeaponDPS(a, targetSharp, targetBlunt);
    const resB = this._calcWeaponDPS(b, targetSharp, targetBlunt);
    const threat = this._activeThreatPreset();

    const getAnalysis = (main, mainRes, other, otherRes) => {
      const pros = [], cons = [];
      const dpsDiff = (mainRes.paper / (otherRes.paper || 0.001)) - 1;
      
      if (dpsDiff > 0.15) pros.push(`Superior raw power (+${(dpsDiff*100).toFixed(0)}% DPS)`);
      if (dpsDiff < -0.15) cons.push(`Lower raw lethality (-${(Math.abs(dpsDiff)*100).toFixed(0)}%)`);

      if (mainRes.ap > otherRes.ap + 0.05) pros.push(`Better armour penetration (+${((mainRes.ap - otherRes.ap)*100).toFixed(0)}% AP)`);
      if (mainRes.ap < otherRes.ap - 0.05) cons.push(`Weaker against heavy armour (-${((otherRes.ap - mainRes.ap)*100).toFixed(0)}% AP)`);

      // Warmup only matters for ranged weapons (melee has no aim time).
      if (main.type !== 'melee' && other.type !== 'melee') {
        if (main.warmup < other.warmup - 0.2) pros.push(`Faster target acquisition (${main.warmup}s vs ${other.warmup}s warmup)`);
        if (main.warmup > other.warmup + 0.2) cons.push(`Slower snap-fire speed (${main.warmup}s vs ${other.warmup}s warmup)`);
      }

      // Range-band accuracy profile (ranged only; melee weapons have null range bands, so the
      // null-safe check skips them rather than comparing against NaN).
      const rb = (mv, ov) => mv != null && ov != null && mv > ov * 1.15;
      if (rb(mainRes.short, otherRes.short)) pros.push(`Stronger Short-range (12m) profile`);
      if (rb(mainRes.medium, otherRes.medium)) pros.push(`Better Mid-range (25m) performance`);
      if (rb(mainRes.long, otherRes.long)) pros.push(`Superior Long-range (40m) accuracy`);
      if (rb(mainRes.touch, otherRes.touch)) pros.push(`Dominant at Touch range (3m)`);

      // Melee-specific: faster attack cadence (when both are melee).
      if (main.type === 'melee' && other.type === 'melee' && (main.cooldown || 1) < (other.cooldown || 1) - 0.1) {
        pros.push(`Faster attack speed (${main.cooldown}s vs ${other.cooldown}s cooldown)`);
      }

      const qual = WEAPON_QUALITIES.find(q => q.id === main.quality) || WEAPON_QUALITIES[2];
      const qDmgLabel = main.type === 'melee' ? qual.meleeDmg : qual.rangedDmg;
      if (qual.acc >= 1.35) pros.push(`High-quality craftsmanship (Acc ×${qual.acc}, Dmg ×${qDmgLabel})`);
      if (qual.acc <= 0.90) cons.push(`Quality penalty (Acc ×${qual.acc}, Dmg ×${qDmgLabel})`);

      return { pros, cons };
    };

    const analysisA = getAnalysis(a, resA, b, resB);
    const analysisB = getAnalysis(b, resB, a, resA);

    // Tactical TL;DR Engine - evaluated from BOTH weapons' perspectives so neither side's
    // strengths are missed, with melee-aware framing.
    const aMelee = a.type === 'melee', bMelee = b.type === 'melee';
    const tips = [];

    // Mixed classes: spell out that melee and ranged DPS are not measured the same way.
    if (aMelee !== bMelee) {
      const m = aMelee ? a : b, r = aMelee ? b : a;
      tips.push(`${m.name} is melee and ${r.name} is ranged - judge them in their roles. ${r.name} controls the distance; ${m.name} wins once it closes. (Melee DPS is sustained; ranged DPS assumes every shot lands.)`);
    }

    const weaponTips = (main, mainRes, other, otherRes) => {
      const t = [];
      const melee = main.type === 'melee';
      if (mainRes.ap > 0.35 && mainRes.ap > otherRes.ap + 0.05) t.push(`${main.name} excels at cracking armour - prioritise it against Centipedes and power-armoured enemies.`);
      if (!melee && (main.warmup || 0) < 0.6 && mainRes.short != null && otherRes.short != null && mainRes.short >= otherRes.short * 0.9) t.push(`${main.name} is a "Run & Gun" tool - low warmup rewards aggressive, mobile play.`);
      if (!melee && mainRes.long != null && otherRes.long != null && mainRes.long > otherRes.long * 1.2 && (main.range || 0) > (other.range || 0)) t.push(`${main.name} dominates long range - position it behind your line for safe damage.`);
      if (!melee && mainRes.paper > otherRes.paper * 1.3 && (main.accuracyMedium || 0) < (other.accuracyMedium || 0) - 0.15) t.push(`${main.name} is a "Glass Cannon" - devastating up close but accuracy falls off hard with distance.`);
      if (melee && other.type === 'melee' && mainRes.paper > otherRes.paper * 1.15) t.push(`${main.name} out-trades in a brawl - higher sustained melee damage per second.`);
      return t;
    };
    tips.push(...weaponTips(a, resA, b, resB));
    tips.push(...weaponTips(b, resB, a, resA));

    if (tips.length === 0) tips.push(`These two are tactically close. Pick on the pawn's skill, your range and ammo needs, and what you can craft or afford.`);

    const analysisEl = document.getElementById('comparisonAnalysis');
    analysisEl.innerHTML = `
      <div style="font-size:var(--f-xs); color:var(--text3); text-align:center; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px">Effective DPS vs ${_escapeHtml(threat ? threat.label : 'Custom armour')} - ${targetSharp}% sharp / ${targetBlunt}% blunt</div>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:32px">
        <!-- Weapon A Analysis -->
        <div style="background:rgba(56,140,232,0.05); padding:16px; border-radius:12px; border:1px solid rgba(56,140,232,0.1)">
          <h4 class="section-title section-title--sm" style="color:var(--p2-txt)">Analysis: ${_escapeHtml(a.name)}</h4>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px">
            <div>
              <div style="font-size:var(--f-xs); color:var(--ok-txt); font-weight:800; text-transform:uppercase; margin-bottom:6px">Pros</div>
              <ul style="padding-left:14px; color:var(--text2); font-size:var(--f-xs); line-height:1.4">
                ${analysisA.pros.map(p => `<li style="margin-bottom:4px">${_escapeHtml(p)}</li>`).join('') || '<li>Balanced weapon.</li>'}
              </ul>
            </div>
            <div>
              <div style="font-size:var(--f-xs); color:var(--p4-txt); font-weight:800; text-transform:uppercase; margin-bottom:6px">Cons</div>
              <ul style="padding-left:14px; color:var(--text2); font-size:var(--f-xs); line-height:1.4">
                ${analysisA.cons.map(c => `<li style="margin-bottom:4px">${_escapeHtml(c)}</li>`).join('') || '<li>No major weaknesses.</li>'}
              </ul>
            </div>
          </div>
        </div>

        <!-- Weapon B Analysis -->
        <div style="background:rgba(240,133,122,0.05); padding:16px; border-radius:12px; border:1px solid rgba(240,133,122,0.1)">
          <h4 class="section-title section-title--sm" style="color:var(--p4-txt)">Analysis: ${_escapeHtml(b.name)}</h4>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px">
            <div>
              <div style="font-size:var(--f-xs); color:var(--ok-txt); font-weight:800; text-transform:uppercase; margin-bottom:6px">Pros</div>
              <ul style="padding-left:14px; color:var(--text2); font-size:var(--f-xs); line-height:1.4">
                ${analysisB.pros.map(p => `<li style="margin-bottom:4px">${_escapeHtml(p)}</li>`).join('') || '<li>Balanced weapon.</li>'}
              </ul>
            </div>
            <div>
              <div style="font-size:var(--f-xs); color:var(--p4-txt); font-weight:800; text-transform:uppercase; margin-bottom:6px">Cons</div>
              <ul style="padding-left:14px; color:var(--text2); font-size:var(--f-xs); line-height:1.4">
                ${analysisB.cons.map(c => `<li style="margin-bottom:4px">${_escapeHtml(c)}</li>`).join('') || '<li>No major weaknesses.</li>'}
              </ul>
            </div>
          </div>
        </div>

        <div style="grid-column: 1 / -1; border-top:1px solid var(--border); padding-top:16px">
          <h4 class="section-title section-title--sm" style="color:var(--accent)">Tactical TL;DR</h4>
          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px">
            ${tips.slice(0,3).map(t => `<p style="color:var(--text); font-size:var(--f-sm); font-style:italic">"${_escapeHtml(t)}"</p>`).join('')}
          </div>
          <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:12px">
            <div style="text-align:center; background:var(--surface3); padding:10px; border-radius:8px">
              <div style="font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; margin-bottom:4px">Touch (3m)</div>
              <div style="font-size:var(--f-sm); font-weight:800; color:${resA.touch != null && resB.touch != null && resA.touch >= resB.touch ? 'var(--p2-txt)' : 'var(--text)'}">${resA.touch != null ? resA.touch.toFixed(2) : '-'}</div>
              <div style="font-size:var(--f-xs); color:var(--text3)">vs</div>
              <div style="font-size:var(--f-sm); font-weight:800; color:${resA.touch != null && resB.touch != null && resB.touch >= resA.touch ? 'var(--p4-txt)' : 'var(--text)'}">${resB.touch != null ? resB.touch.toFixed(2) : '-'}</div>
            </div>
            <div style="text-align:center; background:var(--surface3); padding:10px; border-radius:8px">
              <div style="font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; margin-bottom:4px">Short (12m)</div>
              <div style="font-size:var(--f-sm); font-weight:800; color:${resA.short != null && resB.short != null && resA.short >= resB.short ? 'var(--p2-txt)' : 'var(--text)'}">${resA.short != null ? resA.short.toFixed(2) : '-'}</div>
              <div style="font-size:var(--f-xs); color:var(--text3)">vs</div>
              <div style="font-size:var(--f-sm); font-weight:800; color:${resA.short != null && resB.short != null && resB.short >= resA.short ? 'var(--p4-txt)' : 'var(--text)'}">${resB.short != null ? resB.short.toFixed(2) : '-'}</div>
            </div>
            <div style="text-align:center; background:var(--surface3); padding:10px; border-radius:8px">
              <div style="font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; margin-bottom:4px">Med (25m)</div>
              <div style="font-size:var(--f-sm); font-weight:800; color:${resA.medium != null && resB.medium != null && resA.medium >= resB.medium ? 'var(--p2-txt)' : 'var(--text)'}">${resA.medium != null ? resA.medium.toFixed(2) : '-'}</div>
              <div style="font-size:var(--f-xs); color:var(--text3)">vs</div>
              <div style="font-size:var(--f-sm); font-weight:800; color:${resA.medium != null && resB.medium != null && resB.medium >= resA.medium ? 'var(--p4-txt)' : 'var(--text)'}">${resB.medium != null ? resB.medium.toFixed(2) : '-'}</div>
            </div>
            <div style="text-align:center; background:var(--surface3); padding:10px; border-radius:8px">
              <div style="font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; margin-bottom:4px">Long (40m)</div>
              <div style="font-size:var(--f-sm); font-weight:800; color:${resA.long != null && resB.long != null && resA.long >= resB.long ? 'var(--p2-txt)' : 'var(--text)'}">${resA.long != null ? resA.long.toFixed(2) : '-'}</div>
              <div style="font-size:var(--f-xs); color:var(--text3)">vs</div>
              <div style="font-size:var(--f-sm); font-weight:800; color:${resA.long != null && resB.long != null && resB.long >= resA.long ? 'var(--p4-txt)' : 'var(--text)'}">${resB.long != null ? resB.long.toFixed(2) : '-'}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  openWeaponEditor(id = null) {
    const modal = document.getElementById('weaponModal');
    const body = document.getElementById('weaponModalBody');
    const title = document.getElementById('weaponModalTitle');
    if (!modal || !body) return;

    const blank = {
      id: 'w_' + Date.now(),
      name: '',
      type: 'ranged',
      damage: 10,
      warmup: 1.0,
      cooldown: 1.0,
      burstCount: 1,
      burstTicks: 10,
      accuracyTouch: 0.9,
      accuracyShort: 0.8,
      accuracyMedium: 0.7,
      accuracyLong: 0.6,
      range: 30,
      ap: 0.15,
      stoppingPower: 1.0
    };
    const currentDraft = this.state.weaponEditing;
    const stored = id ? this.state.weapons.find(x => x.id === id) : null;
    const w = currentDraft && id && currentDraft.id === id
      ? currentDraft
      : { ...(stored || blank), stuffCategories: [...((stored || blank).stuffCategories || [])] };
    const isExisting = !!stored;

    this.state.weaponEditing = w;
    title.textContent = isExisting ? 'Edit Weapon' : 'Add New Weapon';
    
    body.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px">
        <div>
          <label style="display:block; font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; font-weight:700; margin-bottom:4px">Weapon Name</label>
          <input type="text" id="edit-w-name" class="skill-input" style="width:100%" value="${_escapeHtml(w.name)}" placeholder="e.g. Charge Rifle">
        </div>
        <div>
          <label style="display:block; font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; font-weight:700; margin-bottom:4px">Mod Source</label>
          <input type="text" id="edit-w-mod" class="skill-input" style="width:100%" value="${_escapeHtml(w.modSource || '')}" placeholder="Vanilla (leave blank)">
        </div>
        <div>
          <label style="display:block; font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; font-weight:700; margin-bottom:4px">Type</label>
          <select id="edit-w-type" class="skill-input" style="width:100%" onchange="App.state.weaponEditing.type=this.value; App.openWeaponEditor(App.state.weaponEditing.id)">
            <option value="ranged" ${w.type === 'ranged' ? 'selected' : ''}>Ranged</option>
            <option value="melee" ${w.type === 'melee' ? 'selected' : ''}>Melee</option>
          </select>
        </div>
        <div>
          <label style="display:block; font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; font-weight:700; margin-bottom:4px">Base Damage</label>
          <input type="number" id="edit-w-damage" class="skill-input" style="width:100%" value="${w.damage}">
        </div>

        ${w.type === 'melee' ? `
        <div>
          <label style="display:block; font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; font-weight:700; margin-bottom:4px">Damage Type</label>
          <select id="edit-w-dmgtype" class="skill-input" style="width:100%">
            <option value="sharp" ${(w.meleeDamageType || 'sharp') === 'sharp' ? 'selected' : ''}>Sharp (stab/cut)</option>
            <option value="blunt" ${w.meleeDamageType === 'blunt' ? 'selected' : ''}>Blunt</option>
          </select>
        </div>
        <div>
          <label style="display:block; font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; font-weight:700; margin-bottom:4px">Material</label>
          <select id="edit-w-stuff" class="skill-input" style="width:100%">
            <option value="">None (base stats)</option>
            ${(w.stuffBased ? getAvailableMaterials(w, this.state.materials) : (this.state.materials || DEFAULT_MATERIALS)).map(m =>
              '<option value="' + _escapeHtml(m.id) + '"' + (w.stuff === m.id ? ' selected' : '') + '>' + _escapeHtml(m.label) + (m.modSource ? ' (' + _escapeHtml(m.modSource) + ')' : '') + '</option>'
            ).join('')}
          </select>
          <div style="display:flex; align-items:center; gap:6px; margin-top:4px">
            <input type="checkbox" id="edit-w-stuff-based" ${w.stuffBased ? 'checked' : ''}
              style="width:14px; height:14px; accent-color:var(--accent)">
            <label for="edit-w-stuff-based" style="font-size:var(--f-xs); color:var(--text3); cursor:pointer">Stuff-based (material affects damage/cooldown)</label>
          </div>
        </div>
        ` : ''}

        <div style="grid-column: 1 / -1; border-top:1px solid var(--border); padding-top:16px; margin-top:8px">
          <h3 class="section-title section-title--sm">Timing & Accuracy</h3>
        </div>
        
        <div>
          <label style="display:block; font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; font-weight:700; margin-bottom:4px">Warmup (sec)</label>
          <input type="number" step="0.01" id="edit-w-warmup" class="skill-input" style="width:100%" value="${w.warmup}">
        </div>
        <div>
          <label style="display:block; font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; font-weight:700; margin-bottom:4px">Cooldown (sec)</label>
          <input type="number" step="0.01" id="edit-w-cooldown" class="skill-input" style="width:100%" value="${w.cooldown}">
        </div>

        ${w.type === 'ranged' ? `
          <div>
            <label style="display:block; font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; font-weight:700; margin-bottom:4px">Burst Count</label>
            <input type="number" id="edit-w-burst" class="skill-input" style="width:100%" value="${w.burstCount}">
          </div>
          <div>
            <label style="display:block; font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; font-weight:700; margin-bottom:4px">Ticks Between Shots</label>
            <input type="number" id="edit-w-ticks" class="skill-input" style="width:100%" value="${w.burstTicks}">
          </div>
          <div>
            <label style="display:block; font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; font-weight:700; margin-bottom:4px">Accuracy (Touch)</label>
            <input type="number" step="0.01" id="edit-w-acc-t" class="skill-input" style="width:100%" value="${w.accuracyTouch}">
          </div>
          <div>
            <label style="display:block; font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; font-weight:700; margin-bottom:4px">Accuracy (Short)</label>
            <input type="number" step="0.01" id="edit-w-acc-s" class="skill-input" style="width:100%" value="${w.accuracyShort}">
          </div>
          <div>
            <label style="display:block; font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; font-weight:700; margin-bottom:4px">Accuracy (Medium)</label>
            <input type="number" step="0.01" id="edit-w-acc-m" class="skill-input" style="width:100%" value="${w.accuracyMedium}">
          </div>
          <div>
            <label style="display:block; font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; font-weight:700; margin-bottom:4px">Accuracy (Long)</label>
            <input type="number" step="0.01" id="edit-w-acc-l" class="skill-input" style="width:100%" value="${w.accuracyLong}">
          </div>
        ` : ''}

        <div style="grid-column: 1 / -1; border-top:1px solid var(--border); padding-top:16px; margin-top:8px">
          <h3 class="section-title section-title--sm">Misc Stats</h3>
        </div>

        <div>
          <label style="display:block; font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; font-weight:700; margin-bottom:4px">Armour Pen (%)</label>
          <input type="number" step="0.01" id="edit-w-ap" class="skill-input" style="width:100%" value="${w.ap}">
        </div>
        <div>
          <label style="display:block; font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; font-weight:700; margin-bottom:4px">Max Range</label>
          <input type="number" id="edit-w-range" class="skill-input" style="width:100%" value="${w.range}">
        </div>
      </div>
    `;

    modal.classList.add('show');
  },

  closeWeaponEditor() {
    const modal = document.getElementById('weaponModal');
    if (modal) modal.classList.remove('show');
    this.state.weaponEditing = null;
  },

  saveWeapon() {
    const w = this.state.weaponEditing;
    if (!w) return;

    w.name = document.getElementById('edit-w-name').value || 'Unnamed Weapon';
    w.modSource = (document.getElementById('edit-w-mod')?.value || '').trim();
    w.damage = parseFloat(document.getElementById('edit-w-damage').value) || 0;
    w.warmup = parseFloat(document.getElementById('edit-w-warmup').value) || 0;
    w.cooldown = parseFloat(document.getElementById('edit-w-cooldown').value) || 0;
    w.ap = parseFloat(document.getElementById('edit-w-ap').value) || 0;
    w.range = parseInt(document.getElementById('edit-w-range').value) || 0;

    if (w.type === 'ranged') {
      w.burstCount = parseInt(document.getElementById('edit-w-burst').value) || 1;
      w.burstTicks = parseInt(document.getElementById('edit-w-ticks').value) || 0;
      w.accuracyTouch = parseFloat(document.getElementById('edit-w-acc-t').value) || 0;
      w.accuracyShort = parseFloat(document.getElementById('edit-w-acc-s').value) || 0;
      w.accuracyMedium = parseFloat(document.getElementById('edit-w-acc-m').value) || 0;
      w.accuracyLong = parseFloat(document.getElementById('edit-w-acc-l').value) || 0;
    }
    if (w.type === 'melee') {
      w.meleeDamageType = document.getElementById('edit-w-dmgtype')?.value || 'sharp';
      w.stuff = document.getElementById('edit-w-stuff')?.value || null;
      w.stuffBased = document.getElementById('edit-w-stuff-based')?.checked || false;
    }

    const idx = this.state.weapons.findIndex(x => x.id === w.id);
    if (idx > -1) this.state.weapons[idx] = w;
    else {
      if (!this._checkCap(this.state.weapons, 'weapons', 'weapons')) return;
      this.state.weapons.push(w);
    }

    this.closeWeaponEditor();
    this.renderArmoury();
    this.triggerAutoSave();
    this.toast('Weapon Saved');
  },

  deleteWeapon(id) {
    this.showConfirm('Remove this weapon from armoury?', 'Remove').then(() => {
      this.state.weapons = this.state.weapons.filter(x => x.id !== id);
      this.renderArmoury();
      this.triggerAutoSave();
    }).catch(() => {});
  },

  deleteAllWeapons() {
    const n = (this.state.weapons || []).length;
    if (!n) return;
    this.showConfirm(`Remove all ${n} weapon${n === 1 ? '' : 's'} from the armoury? This cannot be undone.`, 'Remove All').then(() => {
      this.state.weapons = [];
      this.renderArmoury();
      this.triggerAutoSave();
      this.toast('Cleared all weapons from the armoury');
    }).catch(() => {});
  },

  resetWeaponsToDefaults() {
    this.showConfirm('Replace the current weapon list with the default vanilla set? Any custom or scanned weapons will be removed.', 'Reset').then(() => {
      this.state.weapons = JSON.parse(JSON.stringify(DEFAULT_WEAPONS));
      this.renderArmoury();
      this.triggerAutoSave();
      this.toast('Weapons reset to defaults');
    }).catch(() => {});
  },

  // -- APPAREL & ARMOUR LAB --

  /**
   * Returns the correct APPAREL_QUALITIES entry for a given quality id.
   * Apparel uses a different quality scale than weapons (awful=0.5, legendary=1.8).
   */
  _apparelQuality(qualityId) {
    return APPAREL_QUALITIES.find(x => x.id === (qualityId || 'normal')) || APPAREL_QUALITIES[2];
  },

  /**
   * Calculates effective armour ratings after quality scaling.
   * Armor (Sharp/Blunt/Heat) and Insulation use SEPARATE quality multipliers:
   *   armor_final  = base × armorMult  (0.6 awful → 1.8 legendary)
   *   insul_final  = base × insulMult  (0.8 awful → 1.8 legendary)
   *
   * Optionally pass weaponAP (0.0-1.0) to get effective armor after penetration:
   *   effectiveArmor = max(0, armorRating − weaponAP)
   * This is subtracted, not multiplied.
   */
  _calcApparelStats(item, weaponAP = 0) {
    if (!item || typeof item !== 'object') item = {}; // tolerate a null/corrupt list entry
    // Coerce numeric stats so non-numeric strings cannot produce NaN ratings.
    const n = (v, d = 0) => { const x = Number(v); return Number.isFinite(x) ? x : d; };
    item = { ...item,
      armorSharp: n(item.armorSharp), armorBlunt: n(item.armorBlunt), armorHeat: n(item.armorHeat),
      insulationCold: n(item.insulationCold), insulationHeat: n(item.insulationHeat), mass: n(item.mass),
      stuffMultArmor: item.stuffMultArmor === undefined ? undefined : n(item.stuffMultArmor),
      stuffMultInsulCold: n(item.stuffMultInsulCold), stuffMultInsulHeat: n(item.stuffMultInsulHeat),
    };
    weaponAP = n(weaponAP);
    const q    = this._apparelQuality(item.quality);
    const aMult = q.armorMult !== undefined ? q.armorMult : (q.mult || 1); // backward compat
    const iMult = q.insulMult !== undefined ? q.insulMult : (q.mult || 1);

    // Stuff-based items: compute armour/insulation from material * item multiplier.
    // If no material is selected, use the first available material as a reference default.
    let baseSharp = item.armorSharp || 0;
    let baseBlunt = item.armorBlunt || 0;
    let baseHeat  = item.armorHeat || 0;
    let baseCold  = item.insulationCold || 0;
    let baseHot   = item.insulationHeat || 0;
    if (item.stuffBased && item.stuffMultArmor !== undefined) {
      let mat = item.stuff ? findMaterial(item.stuff, this.state.materials) : null;
      // Fallback: pick the first valid material for this item's stuff categories
      if (!mat && item.stuffCategories && item.stuffCategories.length > 0) {
        const available = getAvailableMaterials(item, this.state.materials);
        if (available.length > 0) mat = available[0];
      }
      if (mat) {
        baseSharp = (mat.armorSharp || 0) * (item.stuffMultArmor || 1);
        baseBlunt = (mat.armorBlunt || 0) * (item.stuffMultArmor || 1);
        baseHeat  = (mat.armorHeat || 0) * (item.stuffMultArmor || 1);
        baseCold  = (mat.insulCold || 0) * (item.stuffMultInsulCold || 0);
        baseHot   = (mat.insulHeat || 0) * (item.stuffMultInsulHeat || 0);
      }
    }

    const sharp = Math.min(2.0, baseSharp * aMult);
    const blunt = Math.min(2.0, baseBlunt * aMult);
    const heat  = Math.min(2.0, baseHeat * aMult);
    // AP is subtracted (not multiplied) from the rated armor value
    const effSharp = Math.max(0, sharp - weaponAP);
    const effBlunt = Math.max(0, blunt - weaponAP);
    const effHeat  = Math.max(0, heat  - weaponAP);
    // Armor ratings are decimals: 0.40 = 40%, 2.0 = 200%.
    // A full deflect occurs on roll < effectiveArmor / 2.
    const deflectChance = v => Math.min(1, v / 2);

    return {
      armorSharp: sharp,
      armorBlunt: blunt,
      armorHeat:  heat,
      effSharp, effBlunt, effHeat,
      deflectSharp:  deflectChance(effSharp),
      deflectBlunt:  deflectChance(effBlunt),
      deflectHeat:   deflectChance(effHeat),
      // Insulation uses its own quality multiplier (wiki: Insulation = material x factor x quality_mult)
      insulationCold: parseFloat((baseCold * iMult).toFixed(1)),
      insulationHeat: parseFloat((baseHot * iMult).toFixed(1)),
      mass: item.mass || 0,
    };
  },

  _armourColour(val) {
    if (val >= 0.5)  return 'var(--p1-txt)';
    if (val >= 0.2)  return 'var(--p3-txt)';
    return 'var(--p4-txt)';
  },

  updateApparelComparisonField(side, field, value) {
    const data = this.state.comparisonApparelData[side];
    if (field === 'name' || field === 'quality') data[field] = value;
    else data[field] = parseFloat(value) || 0;
    // Only re-render analysis, NOT the forms, replacing form innerHTML mid-event kills dropdowns
    this.analyzeApparelComparison();
  },

  prefillApparelComparison(side, itemId) {
    if (!itemId) return;
    const item = this.state.apparel.find(x => x.id === itemId);
    if (!item) return;
    this.state.comparisonApparelData[side] = JSON.parse(JSON.stringify(item));
    this.renderApparelComparisonView();
  },

  setApparelMode(mode) {
    this.state.apparelMode = this.state.apparelMode === mode ? 'list' : mode;
    this.renderArmoury(); // refresh sub-tab actions + content together
  },

  // Empty every slot in a loadout (and forget the seeded pawn so the dropdown resets to "Pawn…").
  clearLoadout(side) {
    const key = side === 'b' ? 'loadoutB' : 'loadout';
    this.state[key] = { weapon: null };
    if (this.state.loadoutSeedPawn) this.state.loadoutSeedPawn[side] = null;
    this.renderApparelLoadout();
  },

  updateLoadout(side, slotKey, id) {
    const key = side === 'b' ? 'loadoutB' : 'loadout';
    const lo = this.state[key] || (this.state[key] = {});
    if (slotKey === 'weapon') { lo.weapon = id || null; this.renderApparelLoadout(); return; }
    if (!id) { lo[slotKey] = null; this.renderApparelLoadout(); return; }
    // RimWorld has one Waist/Belt utility slot. Setting it replaces the current utility.
    if (slotKey === 'belt') { lo[slotKey] = id; this.renderApparelLoadout(); return; }
    // Place the item in EVERY slot it covers, so a multi-coverage piece (duster, power armour)
    // fills all its slots at once, and clear whatever it displaces there.
    const item = (this.state.apparel || []).find(a => a.id === id);
    const targetSlots = (item && this._apparelSlotsFor(item)) || [slotKey];
    for (const k of targetSlots) {
      const occ = lo[k];
      if (occ && occ !== id) for (const kk of Object.keys(lo)) if (lo[kk] === occ) lo[kk] = null;
      lo[k] = id;
    }
    this.renderApparelLoadout();
  },

  saveLoadout(side) {
    if (!this._checkCap(this.state.savedLoadouts, 'savedLoadouts', 'saved loadouts')) return;
    const key = side === 'b' ? 'loadoutB' : 'loadout';
    const slots = { ...this.state[key] };
    const ids = Object.values(slots).filter(Boolean);
    if (ids.length === 0) return;
    const names = ids.map(id => { const a = this.state.apparel.find(x => x.id === id); return a ? a.name : ''; }).filter(Boolean);
    const defaultName = names.slice(0, 2).join(' + ') || 'Loadout';
    const name = prompt('Name this loadout:', defaultName);
    if (!name) return;
    this.state.savedLoadouts.push({ name, slots: { ...slots } });
    this.save();
    this.renderApparelLoadout();
  },

  loadSavedLoadout(side, idx) {
    const preset = this.state.savedLoadouts[idx];
    if (!preset) return;
    const key = side === 'b' ? 'loadoutB' : 'loadout';
    this.state[key] = { ...preset.slots };
    this.renderApparelLoadout();
  },

  deleteSavedLoadout(idx) {
    this.state.savedLoadouts.splice(idx, 1);
    this.save();
    this.renderApparelLoadout();
  },

  _getLoadoutItems(side) {
    const key = side === 'b' ? 'loadoutB' : 'loadout';
    const lo = this.state[key] || {};
    const apparel = this.state.apparel || [];
    const seen = new Set(), items = [];
    // Walk the apparel slots, deduping by id (a multi-slot item occupies several keys).
    for (const slot of this._LOADOUT_APPAREL_SLOTS) {
      const id = lo[slot.key];
      if (!id || seen.has(id)) continue;
      const item = apparel.find(a => a.id === id);
      if (item) { seen.add(id); items.push(item); }
    }
    return items;
  },

  // Plain-text (newline-separated) stat summary of a weapon, for loadout slot hover tooltips.
  // The game's exact ShootingAccuracyPawn post-process curve (Stats_Pawns_Combat.xml):
  // maps a pawn's Shooting level to per-cell accuracy. Healthy capacities assumed.
  _SHOOT_ACC_CURVE: [[-20, 0.70], [-10, 0.80], [-6, 0.83], [-4, 0.85], [-2, 0.87], [0, 0.89], [2, 0.93], [4, 0.94], [6, 0.95], [8, 0.96], [10, 0.97], [12, 0.975], [14, 0.98], [16, 0.98333], [18, 0.98666], [20, 0.99], [22, 0.9925], [26, 0.995], [30, 0.9965], [40, 0.998], [60, 0.999]],
  _pawnShootAcc(skill) {
    const c = this._SHOOT_ACC_CURVE;
    if (skill <= c[0][0]) return c[0][1];
    for (let i = 1; i < c.length; i++) {
      if (skill <= c[i][0]) {
        const [x0, y0] = c[i - 1], [x1, y1] = c[i];
        return y0 + (y1 - y0) * ((skill - x0) / (x1 - x0));
      }
    }
    return c[c.length - 1][1];
  },
  // Hit factor from the shooter at a distance: acc^distance floored at 2.01%,
  // matching ShotReport.HitFactorFromShooter exactly.
  _pawnHitFactor(skill, dist) {
    return Math.max(Math.pow(this._pawnShootAcc(skill), dist), 0.0201);
  },

  _loadoutWeaponTip(w, side) {
    if (!w) return '';
    const pct = v => (v == null ? '-' : Math.round(v * 100) + '%');
    const r = this._calcWeaponDPS(w);
    const q = (typeof WEAPON_QUALITIES !== 'undefined') ? WEAPON_QUALITIES.find(x => x.id === (w.quality || 'normal')) : null;
    const melee = w.type === 'melee';
    const lines = [
      `${w.name}${q ? ' · ' + q.label : ''}`,
      `${melee ? 'Melee' : 'Ranged'} · DPS ${(r.paper || 0).toFixed(1)} · AP ${pct(r.ap)}`,
      `Damage ${w.damage}`,
    ];
    if (!melee) {
      lines.push(`Warmup ${w.warmup}s · Cooldown ${w.cooldown}s${(w.burstCount || 1) > 1 ? ' · Burst ' + w.burstCount : ''}`);
      lines.push(`Accuracy T/S/M/L: ${pct(r.accT)} / ${pct(r.accS)} / ${pct(r.accM)} / ${pct(r.accL)}`);
      // In the shooter's hands: weapon accuracy times the pawn's own per-cell hit
      // factor (ShootingAccuracyPawn^distance, the game's dominant accuracy variable)
      // at the standard 3/12/25/40-cell range brackets.
      const seedId = side && this.state.loadoutSeedPawn ? this.state.loadoutSeedPawn[side] : null;
      const pawn = seedId ? this.state.pawns.find(p => p.id === seedId) : null;
      if (pawn) {
        const skill = this.effectiveSkill(pawn, 'shoot');
        const eff = (dps, dist) => dps == null ? '-' : (dps * this._pawnHitFactor(skill, dist)).toFixed(1);
        lines.push(`In ${_pawnDisplayName(pawn)}'s hands (Shooting ${skill}):`);
        lines.push(`Effective DPS T/S/M/L: ${eff(r.touch, 3)} / ${eff(r.short, 12)} / ${eff(r.medium, 25)} / ${eff(r.long, 40)}`);
      }
    } else {
      lines.push(`Cooldown ${w.cooldown}s`);
    }
    if (w.mass) lines.push(`Mass ${w.mass} kg`);
    return lines.join('\n');
  },

  // Plain-text stat summary of an apparel/utility item, for loadout slot hover tooltips.
  _loadoutApparelTip(item) {
    if (!item) return '';
    const q = this._apparelQuality(item.quality);
    const lines = [`${item.name}${q && q.label ? ' · ' + q.label : ''}`, `${item.layer || 'outer'} layer`];
    if (item.type === 'utility') {
      lines.push('Utility item');
      const sh = this._calcShieldStats(item);
      if (sh) lines.push(`Shield ${Math.round(sh.effectiveHP)} HP · ${sh.rechargePerSec.toFixed(1)} HP/s recharge`);
    } else {
      const s = this._calcApparelStats(item, 0);
      lines.push(`Armour  Sharp ${Math.round(s.armorSharp * 100)}% · Blunt ${Math.round(s.armorBlunt * 100)}% · Heat ${Math.round(s.armorHeat * 100)}%`);
      lines.push(`Insulation  ${s.insulationCold >= 0 ? '+' : ''}${s.insulationCold}°C cold · ${s.insulationHeat >= 0 ? '+' : ''}${s.insulationHeat}°C heat`);
      if (s.mass) lines.push(`Mass ${s.mass} kg`);
    }
    if (item.coverage && item.coverage.length) lines.push(`Covers: ${item.coverage.join(', ')}`);
    return lines.join('\n');
  },

  // Curated wearable slots = apparel LAYER x body REGION (RimWorld conflicts by layer + body
  // part group, so a shirt and pants are both OnSkin yet fit). Order = roughly top-to-bottom.
  _LOADOUT_APPAREL_SLOTS: [
    { key: 'head',       label: 'Head' },
    { key: 'eyes',       label: 'Eyes' },
    { key: 'torsoShell', label: 'Torso · Outer' },
    { key: 'torsoMid',   label: 'Torso · Mid' },
    { key: 'torsoSkin',  label: 'Torso · Skin' },
    { key: 'legsShell',  label: 'Legs · Outer' },
    { key: 'legsMid',    label: 'Legs · Mid' },
    { key: 'legsSkin',   label: 'Legs · Skin' },
    { key: 'hands',      label: 'Hands' },
    { key: 'feet',       label: 'Feet' },
    { key: 'belt',       label: 'Belt',   belt: true },
  ],

  _apparelCoversRegion(item, region) {
    if (!item || item.type === 'utility') return false;
    const cov = Array.isArray(item.coverage)
      ? item.coverage.map(c => String(c).toLowerCase()) : [];
    if (!cov.length) return region === 'torso';
    const has = (...keys) => keys.some(k => cov.some(c => c.includes(k)));
    if (region === 'head') return has('head', 'skull', 'eye', 'ear', 'mouth', 'jaw', 'teeth', 'tongue');
    if (region === 'arms') return has('arm', 'shoulder');
    if (region === 'hands') return has('hand');
    if (region === 'legs') return has('leg', 'thigh');
    if (region === 'feet') return has('foot', 'feet');
    return has('torso', 'chest', 'neck', 'waist');
  },

  // Which loadout slot(s) an apparel item occupies, from its layer + coverage (body-part
  // groups). Multi-coverage items (a duster, power armour) span several slots.
  _apparelSlotsFor(item) {
    if (!item) return [];
    const layer = String(item.layer || 'outer').toLowerCase();
    const cov = (Array.isArray(item.coverage) ? item.coverage : []).map(c => String(c).toLowerCase());
    const has = (...keys) => keys.some(k => cov.some(c => c.includes(k)));
    if (layer === 'belt') return ['belt'];
    if (layer === 'eyes') return ['eyes'];
    if (layer === 'head') {
      const headSlots = [];
      if (has('full head', 'upper head', 'skull', 'head', 'ear', 'mouth', 'teeth', 'tongue', 'jaw')) headSlots.push('head');
      if (has('eye')) headSlots.push('eyes');
      return headSlots.length ? headSlots : ['head'];
    }
    // Body layers (OnSkin / Middle / Shell) combine with the region from coverage.
    const L = layer === 'skin' ? 'Skin' : layer === 'middle' ? 'Mid' : 'Shell';
    const slots = [];
    if (has('eye')) slots.push('eyes');
    if (has('full head', 'upper head', 'skull', 'head', 'ear', 'mouth', 'teeth', 'tongue', 'jaw')) slots.push('head');
    if (has('hand')) slots.push('hands');
    if (has('foot', 'feet')) slots.push('feet');
    if (has('torso', 'neck', 'shoulder', 'arm', 'chest', 'waist')) slots.push('torso' + L);
    if (has('leg', 'thigh')) slots.push('legs' + L);
    if (!slots.length) slots.push('torso' + L); // unknown coverage: default to its layer's torso slot
    return [...new Set(slots)];
  },

  _renderLoadoutColumn(side, label, color) {
    const slots = this._LOADOUT_APPAREL_SLOTS;
    const key = side === 'b' ? 'loadoutB' : 'loadout';
    const loadout = this.state[key] || {};
    const saved = this.state.savedLoadouts || [];

    let html = `<div class="settings-card" style="border-top:3px solid ${color}">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px">
        <h3 class="section-title" style="margin:0; color:${color}">${label}</h3>
        <div style="display:flex; gap:6px">
          <button class="btn btn-sm" onclick="App.saveLoadout('${side}')" title="Save this loadout as a preset" style="font-size:calc(10px * var(--font-scale)); padding:3px 8px">Save</button>
          <button class="btn btn-sm" onclick="App.clearLoadout('${side}')" title="Empty every slot in this loadout" style="font-size:calc(10px * var(--font-scale)); padding:3px 8px">Clear</button>
        </div>
      </div>`;

    if (saved.length > 0) {
      html += `<div style="margin-bottom:12px">
        <select class="skill-input" style="width:100%; font-size:var(--f-xs)" onchange="if(this.value!=='') App.loadSavedLoadout('${side}', parseInt(this.value)); this.value=''">
          <option value="">Load preset...</option>
          ${saved.map((s, i) => `<option value="${i}">${_escapeHtml(s.name)}</option>`).join('')}
        </select>
      </div>`;
    }

    // Weapon slot (drawn from the Armoury) - makes a loadout weapon + apparel.
    const selWeapon = loadout.weapon;
    const weapons = this.state.weapons || [];
    const wItem = weapons.find(w => w.id === selWeapon);
    const wTip = wItem ? this._loadoutWeaponTip(wItem, side) : '';
    html += `<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px${wTip ? '; cursor:help' : ''}"${wTip ? ` title="${_escapeHtml(wTip)}"` : ''}>
      <label style="width:60px; font-weight:700; font-size:var(--f-xs); color:var(--accent); text-transform:uppercase">Weapon</label>
      <select class="skill-input" style="flex:1; font-size:var(--f-xs)" onchange="App.updateLoadout('${side}', 'weapon', this.value)">
        <option value="">None</option>
        ${weapons.map(w => `<option value="${_escapeHtml(w.id)}" ${selWeapon === w.id ? 'selected' : ''}>${_escapeHtml(w.name)}</option>`).join('')}
      </select>
    </div>`;

    const apparel = this.state.apparel || [];
    slots.forEach(slot => {
      const selectedId = loadout[slot.key];
      // Items that can occupy THIS slot (a duster appears in both Torso/Legs Outer). Both belt
      // slots list every belt-layer item.
      const items = slot.belt
        ? apparel.filter(a => this._apparelSlotsFor(a)[0] === 'belt')
        : apparel.filter(a => this._apparelSlotsFor(a).includes(slot.key));
      const selItem = items.find(i => i.id === selectedId) || apparel.find(i => i.id === selectedId);
      const aTip = selItem ? this._loadoutApparelTip(selItem) : '';
      html += `<div style="display:flex; align-items:center; gap:8px; margin-bottom:6px${aTip ? '; cursor:help' : ''}"${aTip ? ` title="${_escapeHtml(aTip)}"` : ''}>
        <label style="width:92px; flex-shrink:0; font-weight:700; font-size:calc(var(--f-xs) * 0.92); color:var(--text3); text-transform:uppercase; letter-spacing:0.02em">${slot.label}</label>
        <select class="skill-input" style="flex:1; min-width:0; font-size:var(--f-xs)" onchange="App.updateLoadout('${side}', '${slot.key}', this.value)">
          <option value="">None</option>
          ${items.map(item => `<option value="${_escapeHtml(item.id)}" ${selectedId === item.id ? 'selected' : ''}>${_escapeHtml(item.name)}</option>`).join('')}
        </select>
      </div>`;
    });
    html += '</div>';
    return html;
  },

  renderApparelLoadout() {
    const container = document.getElementById('apparelLoadout');
    if (!container) return;

    const isWidget = document.body.classList.contains('widget-mode');
    const colA = this._renderLoadoutColumn('a', 'Loadout A', 'var(--p2-txt)');
    const colB = this._renderLoadoutColumn('b', 'Loadout B', 'var(--accent)');

    const itemsA = this._getLoadoutItems('a');
    const itemsB = this._getLoadoutItems('b');
    const wpnFor = (side) => {
      const id = this.state[side === 'b' ? 'loadoutB' : 'loadout'].weapon;
      return id ? (this.state.weapons || []).find(w => w.id === id) : null;
    };
    const wA = wpnFor('a'), wB = wpnFor('b');
    const hasA = itemsA.length > 0 || !!wA;
    const hasB = itemsB.length > 0 || !!wB;
    const hasBoth = hasA && hasB;
    const coverageRegions = [
      { id: 'torso', label: 'Torso' }, { id: 'head', label: 'Head' },
      { id: 'arms', label: 'Arms' }, { id: 'hands', label: 'Hands' },
      { id: 'legs', label: 'Legs' }, { id: 'feet', label: 'Feet' },
    ];
    const coverageRegion = coverageRegions.some(r => r.id === this.state.loadoutCoverageRegion)
      ? this.state.loadoutCoverageRegion : 'torso';
    const coverageLabel = coverageRegions.find(r => r.id === coverageRegion).label;

    let comparison = '';
    if (hasA || hasB) {
      const format = (v) => (v * 100).toFixed(1) + '%';
      const fmtTemp = (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '°C';
      const fmtMass = (v) => v.toFixed(2) + ' kg';

      const calcSide = (items, wpn) => {
        const coveringItems = items.filter(item => this._apparelCoversRegion(item, coverageRegion));
        const prot0 = Engine.calculateLoadoutProtection(coveringItems, 0);
        const prot20 = Engine.calculateLoadoutProtection(coveringItems, 20);
        // Find the utility (belt) item and compute shield stats + stat offsets
        const utilItem = items.find(i => i.type === 'utility');
        const shield = utilItem ? this._calcShieldStats(utilItem) : null;
        const statOffsets = utilItem && utilItem.statOffsets ? utilItem.statOffsets : null;
        const apparelMass = items.reduce((s, i) => s + (i.mass || 0), 0);
        return {
          prot0, prot20,
          cold: items.reduce((s, i) => s + (i.insulationCold || 0), 0),
          heat: items.reduce((s, i) => s + (i.insulationHeat || 0), 0),
          mass: apparelMass + (wpn && wpn.mass ? wpn.mass : 0), // total carried mass incl. weapon
          moveSpeed: items.reduce((s, i) => s + (i.moveSpeed || 0) + ((i.statOffsets && i.statOffsets.moveSpeed) || 0), 0),
          weapon: wpn || null,
          weaponName: wpn ? wpn.name : '-',
          weaponDps: wpn ? (this._calcWeaponDPS(wpn, 0, 0, utilItem).paper || 0) : 0,
          shield: shield,
          statOffsets: statOffsets,
          utilItem: utilItem || null,
        };
      };

      const a = hasA ? calcSide(itemsA, wA) : null;
      const b = hasB ? calcSide(itemsB, wB) : null;

      const diffColor = (valA, valB, higherIsBetter = true) => {
        if (valA == null || valB == null) return 'var(--text)';
        const d = valA - valB;
        if (Math.abs(d) < 0.001) return 'var(--text3)';
        return (higherIsBetter ? d > 0 : d < 0) ? 'var(--ok-txt)' : 'var(--p4-txt)';
      };

      const diffArrow = (valA, valB, higherIsBetter = true) => {
        if (valA == null || valB == null) return '';
        const d = valA - valB;
        if (Math.abs(d) < 0.001) return ' =';
        const better = (higherIsBetter ? d > 0 : d < 0);
        return better ? ' ▲' : ' ▼';
      };

      const row = (label, getVal, formatter, higherIsBetter = true) => {
        const vA = a ? getVal(a) : null;
        const vB = b ? getVal(b) : null;
        const colA = hasBoth ? diffColor(vA, vB, higherIsBetter) : 'var(--text)';
        const colB = hasBoth ? diffColor(vB, vA, higherIsBetter) : 'var(--text)';
        // Auto-attach a plain-English tooltip for jargon row labels.
        const lt = /deflect/i.test(label) ? GEAR_JARGON.deflect
          : /penetrat/i.test(label) ? GEAR_JARGON.penetrate
          : /partial/i.test(label) ? GEAR_JARGON.mitigate
          : /sharp/i.test(label) ? GEAR_JARGON.sharp
          : /blunt/i.test(label) ? GEAR_JARGON.blunt
          : /cold/i.test(label) ? GEAR_JARGON.cold
          : /heat insul|insul.*heat|hot/i.test(label) ? GEAR_JARGON.hot
          : /mass|weight/i.test(label) ? GEAR_JARGON.mass : '';
        const ltAttr = lt ? ` title="${_escapeHtml(lt)}"` : '';
        return `<div style="display:grid; grid-template-columns:${hasBoth ? '1fr 110px 1fr' : '1fr 1fr'}; gap:8px; align-items:center; padding:4px 0; border-bottom:1px solid var(--border-dim)">
          ${hasBoth ? `<div style="text-align:right; font-weight:700; font-size:var(--f-xs); color:${colA}">${vA != null ? formatter(vA) + diffArrow(vA, vB, higherIsBetter) : '-'}</div>` : ''}
          <div style="text-align:center; font-size:var(--f-xs); color:var(--text3); font-weight:600"${ltAttr}>${label}</div>
          <div style="text-align:${hasBoth ? 'left' : 'right'}; font-weight:700; font-size:var(--f-xs); color:${hasBoth ? colB : 'var(--text)'}">
            ${hasBoth ? (vB != null ? formatter(vB) + diffArrow(vB, vA, higherIsBetter) : '-') : (hasA && vA != null ? formatter(vA) : hasB && vB != null ? formatter(vB) : '-')}
          </div>
        </div>`;
      };

      comparison = `<div class="settings-card" style="background:var(--surface2)">
        <div style="display:flex; flex-wrap:wrap; justify-content:center; align-items:center; gap:8px; margin-bottom:12px">
          <h3 class="section-title section-title--sm" style="margin:0">${hasBoth ? 'A vs B Comparison' : 'Protection Analysis'}</h3>
          <label style="font-size:var(--f-xs); color:var(--text3)">Body region
            <select class="skill-input" style="width:auto; margin-left:4px" onchange="App.state.loadoutCoverageRegion=this.value; App.renderApparelLoadout()">
              ${coverageRegions.map(r => `<option value="${r.id}" ${r.id === coverageRegion ? 'selected' : ''}>${r.label}</option>`).join('')}
            </select>
          </label>
        </div>
        <div style="font-size:var(--f-xs); color:var(--text3); text-align:center; margin-bottom:10px">Only apparel covering the selected ${coverageLabel.toLowerCase()} region is included.</div>
        <div style="font-size:var(--f-xs); color:var(--text3); text-align:center; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px">Vs. 0 AP (Unarmoured)</div>
        ${row('Deflection', s => s.prot0.zero, format)}
        ${row('Partial', s => s.prot0.sharp50blunt + s.prot0.blunt50 + s.prot0.blunt25, format)}
        ${row('Penetration', s => s.prot0.sharp100 + s.prot0.blunt100, format, false)}

        <div style="font-size:var(--f-xs); color:var(--text3); text-align:center; text-transform:uppercase; letter-spacing:0.05em; margin:12px 0 8px">Vs. 20 AP (Assault Rifle)</div>
        ${row('Deflection', s => s.prot20.zero, format)}
        ${row('Partial', s => s.prot20.sharp50blunt + s.prot20.blunt50 + s.prot20.blunt25, format)}
        ${row('Penetration', s => s.prot20.sharp100 + s.prot20.blunt100, format, false)}

        ${(wA || wB) ? `
          <div style="font-size:var(--f-xs); color:var(--text3); text-align:center; text-transform:uppercase; letter-spacing:0.05em; margin:12px 0 8px">Weapon</div>
          <div style="display:grid; grid-template-columns:${hasBoth ? '1fr 110px 1fr' : '1fr 1fr'}; gap:8px; align-items:center; padding:4px 0; border-bottom:1px solid var(--border-dim)">
            ${hasBoth ? `<div style="text-align:right; font-weight:700; font-size:var(--f-xs)">${_escapeHtml(a ? a.weaponName : '-')}</div>` : ''}
            <div style="text-align:center; font-size:var(--f-xs); color:var(--text3); font-weight:600">Equipped</div>
            <div style="text-align:${hasBoth ? 'left' : 'right'}; font-weight:700; font-size:var(--f-xs)">${_escapeHtml(hasBoth ? (b ? b.weaponName : '-') : (a ? a.weaponName : (b ? b.weaponName : '-')))}</div>
          </div>
          ${row('Weapon DPS', s => s.weaponDps, v => v.toFixed(1))}
        ` : ''}

        <div style="font-size:var(--f-xs); color:var(--text3); text-align:center; text-transform:uppercase; letter-spacing:0.05em; margin:12px 0 8px">Insulation & Mobility</div>
        ${row('Cold Insul.', s => s.cold, fmtTemp)}
        ${row('Heat Insul.', s => s.heat, fmtTemp)}
        ${((a && a.moveSpeed) || (b && b.moveSpeed)) ? row('Move Speed', s => s.moveSpeed, v => (v >= 0 ? '+' : '') + v.toFixed(2) + ' c/s') : ''}
        ${row('Total Mass', s => s.mass, fmtMass, false)}
        ${((a && a.shield) || (b && b.shield)) ? `
          <div style="font-size:var(--f-xs); color:var(--text3); text-align:center; text-transform:uppercase; letter-spacing:0.05em; margin:12px 0 8px">Shield Belt</div>
          ${row('Shield HP', s => s.shield ? s.shield.effectiveHP : 0, v => v.toFixed(0))}
          ${row('Recharge/s', s => s.shield ? s.shield.rechargePerSec : 0, v => v.toFixed(1) + ' HP')}
          ${row('Blocks Ranged', s => s.shield ? (s.shield.blocksRangedOut ? 1 : 0) : 0, v => v ? 'Yes' : 'No', false)}
        ` : ''}
        ${((a && a.statOffsets) || (b && b.statOffsets)) ? `
          <div style="font-size:var(--f-xs); color:var(--text3); text-align:center; text-transform:uppercase; letter-spacing:0.05em; margin:12px 0 8px">Utility Stat Offsets</div>
          ${(a && a.statOffsets && a.statOffsets.rangedCooldownFactor) || (b && b.statOffsets && b.statOffsets.rangedCooldownFactor) ? row('Ranged CD', s => s.statOffsets ? (s.statOffsets.rangedCooldownFactor || 0) : 0, v => (v > 0 ? '+' : '') + (v * 100).toFixed(0) + '%', false) : ''}
          ${(a && a.statOffsets && a.statOffsets.meleeCooldownFactor) || (b && b.statOffsets && b.statOffsets.meleeCooldownFactor) ? row('Melee CD', s => s.statOffsets ? (s.statOffsets.meleeCooldownFactor || 0) : 0, v => (v > 0 ? '+' : '') + (v * 100).toFixed(0) + '%', false) : ''}
          ${(a && a.statOffsets && a.statOffsets.shootingAccuracy) || (b && b.statOffsets && b.statOffsets.shootingAccuracy) ? row('Shoot Acc.', s => s.statOffsets ? (s.statOffsets.shootingAccuracy || 0) : 0, v => (v > 0 ? '+' : '') + (v * 100).toFixed(0) + '%') : ''}
        ` : ''}
      </div>`;
    } else {
      comparison = `<div class="settings-card" style="background:var(--surface2); text-align:center; padding:40px; color:var(--text3)">
        Select apparel items in at least one outfit to see protection stats.${this.state.savedLoadouts.length > 0 ? ' Or load a saved preset.' : ''}
      </div>`;
    }

    // Saved presets manager
    const saved = this.state.savedLoadouts || [];
    let presetsHtml = '';
    if (saved.length > 0) {
      presetsHtml = `<div class="settings-card" style="margin-top:var(--gap-md)">
        <div class="section-title section-title--sm">Saved Presets</div>
        <div style="display:flex; flex-wrap:wrap; gap:8px">
          ${saved.map((s, i) => `<div style="display:flex; align-items:center; gap:4px; background:var(--surface3); padding:4px 10px; border-radius:var(--radius-sm); font-size:var(--f-xs)">
            <span style="font-weight:700">${_escapeHtml(s.name)}</span>
            <span style="color:var(--text3)">(${Object.values(s.slots).filter(Boolean).length} items)</span>
            <button class="btn btn-sm" onclick="App.deleteSavedLoadout(${i})" title="Delete preset" style="font-size:calc(9px * var(--font-scale)); padding:1px 5px; margin-left:4px; color:var(--p4-txt)">✕</button>
          </div>`).join('')}
        </div>
      </div>`;
    }

    // Seed-from-pawn bar: pawns whose equipped gear was imported from a save.
    const gearedPawns = (this.state.pawns || []).filter(p => p.equippedWeapon || (p.wornApparel && p.wornApparel.length));
    // Keep each side's dropdown showing the pawn it was seeded from (marked selected).
    const seedSel = this.state.loadoutSeedPawn || {};
    const seedOptsFor = (side) => gearedPawns.map(p => `<option value="${_escapeHtml(p.id)}" ${p.id === seedSel[side] ? 'selected' : ''}>${_escapeHtml(_pawnDisplayName(p, '?'))}</option>`).join('');
    const seedBar = gearedPawns.length ? `
      <div class="settings-card" style="margin-bottom:var(--gap-md); display:flex; flex-wrap:wrap; align-items:center; gap:10px">
        <span style="font-weight:700; font-size:var(--f-xs); color:var(--text3)">Seed from a pawn's imported gear:</span>
        <label style="font-size:var(--f-xs); display:flex; align-items:center; gap:4px; color:var(--p2-txt); font-weight:700">A
          <select class="skill-input" style="font-size:var(--f-xs)" onchange="this.value ? App.seedLoadoutFromPawn('a', this.value) : App.clearLoadout('a')"><option value="">Pawn…</option>${seedOptsFor('a')}</select></label>
        <label style="font-size:var(--f-xs); display:flex; align-items:center; gap:4px; color:var(--accent); font-weight:700">B
          <select class="skill-input" style="font-size:var(--f-xs)" onchange="this.value ? App.seedLoadoutFromPawn('b', this.value) : App.clearLoadout('b')"><option value="">Pawn…</option>${seedOptsFor('b')}</select></label>
        <span style="font-size:calc(10px * var(--font-scale)); color:var(--text3)">Matched against your Armoury/Apparel lists by name.</span>
      </div>` : '';

    container.innerHTML = `
      <div style="display:flex; justify-content:flex-end; margin-bottom:var(--gap-md)">
        <button class="btn btn-accent btn-sm" id="scanLoadoutModsBtn" onclick="App.scanModEquipment('both')"
          title="Scan your RimWorld install and mods for both weapons and armour, so loadouts can be built and seeded from modded gear"
          style="border-radius:999px; padding:5px 14px; font-size:var(--f-xs)">&#128269; Scan Equipment Mods</button>
      </div>
      ${seedBar}
      <div style="display:grid; grid-template-columns:${isWidget ? '1fr' : '1fr 1fr'}; gap:var(--gap-md)">
        ${colA}
        ${colB}
      </div>
      ${comparison}
      ${presetsHtml}
    `;
  },

  // Fill a loadout (A/B) from a pawn's imported equipped weapon + worn apparel,
  // matching each piece to the Armoury/Apparel lists by RimWorld defName or by
  // resolved name. Unmatched gear (not in your lists) is reported, not invented.
  seedLoadoutFromPawn(side, pawnId) {
    const p = (this.state.pawns || []).find(x => x.id === pawnId);
    if (!p) return;
    const key = side === 'b' ? 'loadoutB' : 'loadout';
    const lo = { weapon: null }; // apparel slots fill in below by coverage
    let matched = 0, total = 0;
    const unmatched = []; // human-readable names of gear not found in the Armoury/Apparel lists

    // Match by exact RimWorld defName first (scanned + curated items carry it), then by a
    // trimmed, case-insensitive defName, then by the humanised display name as a last resort.
    const norm = (s) => String(s || '').trim().toLowerCase();
    // Canonical key: drop a leading ThingDef prefix (Apparel_/Gun_/MeleeWeapon_…) and every
    // separator, so a save's defName matches a BUILT-IN item that only has a display name
    // (the DEFAULT_WEAPONS/DEFAULT_APPAREL carry no defName). e.g. "Apparel_FlakVest" -> "flakvest"
    // <-> "Flak Vest" -> "flakvest".
    const canon = (s) => String(s || '').replace(/^[A-Za-z]+_/, '').replace(/[^A-Za-z0-9]+/g, '').toLowerCase();
    const matchIn = (list, def) => {
      const d = norm(def), lbl = norm(this._defLabelOrHumanize(def)), c = canon(def);
      return (list || []).find(x =>
        (x.defName && (x.defName === def || norm(x.defName) === d || canon(x.defName) === c))
        || norm(x.name) === lbl
        || (c && canon(x.name) === c));
    };

    if (p.equippedWeapon) {
      total++;
      const w = matchIn(this.state.weapons, p.equippedWeapon.def);
      if (w) { lo.weapon = w.id; matched++; }
      else unmatched.push(this._defLabelOrHumanize(p.equippedWeapon.def));
    }
    (p.wornApparel || []).forEach(a => {
      total++;
      const item = matchIn(this.state.apparel, a.def);
      if (item) {
        const sl = this._apparelSlotsFor(item);
        if (sl[0] === 'belt') {
          if (lo.belt) {
            unmatched.push(this._defLabelOrHumanize(a.def) + ' (extra utility slot)');
            return;
          }
          lo.belt = item.id;
        } else {
          for (const k of sl) lo[k] = item.id;
        }
        matched++;
      } else unmatched.push(this._defLabelOrHumanize(a.def));
    });

    this.state[key] = lo;
    if (!this.state.loadoutSeedPawn) this.state.loadoutSeedPawn = {};
    this.state.loadoutSeedPawn[side] = pawnId; // so the dropdown shows this pawn, not "Pawn…"
    this.renderApparelLoadout();
    const who = _pawnDisplayName(p, 'pawn');
    if (matched < total) {
      const names = unmatched.slice(0, 5).join(', ') + (unmatched.length > 5 ? `, +${unmatched.length - 5} more` : '');
      this.toast(`Loadout ${side.toUpperCase()} seeded from ${who}: ${matched}/${total} matched. Not in your lists yet: ${names}. The mod scan does not catch every item; add them in the Armoury/Apparel tab.`, 8000);
    } else {
      this.toast(`Loadout ${side.toUpperCase()} seeded from ${who}: all ${matched} items matched.`);
    }
  },

  renderApparel() {
    const listEl = document.getElementById('apparelContent');
    const compEl = document.getElementById('apparelComparison');
    const loadoutEl = document.getElementById('apparelLoadout');
    if (!listEl || !compEl || !loadoutEl) return;

    listEl.style.display = 'none';
    compEl.style.display = 'none';
    loadoutEl.style.display = 'none';

    // Update pill active states
    const mode = this.state.apparelMode;
    const header = document.querySelector('#view-apparel .view-header-actions');
    if (header) {
      const pills = header.querySelectorAll('[data-mode]');
      pills.forEach(p => {
        if (p.dataset.mode === mode) {
          p.style.background = 'var(--accent)';
          p.style.color = 'var(--bg)';
          p.style.borderColor = 'var(--accent)';
        } else {
          p.style.background = '';
          p.style.color = '';
          p.style.borderColor = '';
        }
      });
    }

    if (mode === 'list') {
      listEl.style.display = 'grid';
      this.renderApparelList();
    } else if (mode === 'compare') {
      compEl.style.display = 'flex';
      this.renderApparelComparisonView();
    } else if (mode === 'loadout') {
      loadoutEl.style.display = 'flex';
      this.renderApparelLoadout();
    }
  },

  renderApparelList() {
    const c = document.getElementById('apparelContent');
    if (!c) return;
    const allItems = this.state.apparel || [];
    const isCompact = this._isCompactArmouryLayout(c);
    this._armouryCompactLayout = isCompact;
    c.classList.toggle('gear-compact', isCompact);

    if (allItems.length === 0) {
      c.innerHTML = `
        <div class="widget-gear-empty" style="grid-column:1/-1; text-align:center; padding:${isCompact ? '24px 12px' : '60px 20px'}; border:2px dashed var(--border-med); border-radius:12px; color:var(--text3)">
          <div style="font-size:${isCompact ? '18px' : 'calc(var(--f-base) * 2.4)'}; margin-bottom:16px; color:var(--text3)">APPAREL</div>
          <h3 style="color:var(--text2); margin-bottom:8px; font-size:${isCompact ? '12px' : 'inherit'}">No apparel items defined</h3>
          <p style="font-size:${isCompact ? '11px' : 'inherit'}">Add armour, clothing, or utility items.</p>
          <button class="btn" onclick="App.openApparelEditor()" style="margin-top:12px">+ Add Item</button>
        </div>`;
      return;
    }

    // Apply type filter
    const filter = this._apparelFilter || 'all';
    const filtered = filter === 'all' ? allItems
      : allItems.filter(i => i.type === filter);

    // Apply sort (favourites pinned to top)
    const sortField = this._apparelSort || 'manual';
    const sortDir = this._apparelSortDir;
    const calcStats = (item) => this._calcApparelStats(item);
    const items = this._applyFavouriteSort(filtered, sortField, sortDir, calcStats);
    const pageSize = this._gearPageSize;
    const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
    const page = Math.min(Math.max(0, this._apparelPage || 0), pageCount - 1);
    this._apparelPage = page;
    const visibleItems = items.slice(page * pageSize, (page + 1) * pageSize);
    const rangeStart = items.length ? page * pageSize + 1 : 0;
    const rangeEnd = Math.min((page + 1) * pageSize, items.length);
    const pageOptions = Array.from({ length: pageCount }, (_, index) =>
      `<option value="${index}" ${index === page ? 'selected' : ''}>Page ${index + 1} of ${pageCount}</option>`).join('');

    const modCount = allItems.filter(a => a.modSource).length;
    const hasModItems = modCount > 0;
    const isManual = sortField === 'manual';

    // Star icon helper
    const star = (item) => {
      const on = item.favourite;
      return `<span class="gear-fav" data-gear-id="${_escapeHtml(item.id)}" style="cursor:pointer; font-size:14px; color:${on ? 'var(--accent)' : 'var(--text3)'}; opacity:${on ? '1' : '0.4'}; margin-right:6px" onclick="event.stopPropagation(); App.toggleApparelFavourite(this.dataset.gearId)" title="${on ? 'Unfavourite' : 'Favourite'}">${on ? '★' : '☆'}</span>`;
    };
    const grip = isManual ? '<span style="cursor:grab; color:var(--text3); opacity:0.5; margin-right:6px; font-size:12px" title="Drag to reorder">☰</span>' : '';

    // Build filter/sort bar
    const filterPill = (id, label) => {
      const active = filter === id;
      return `<button class="btn btn-sm" style="font-size:10px; ${active ? 'background:var(--accent); color:var(--bg)' : ''}" onclick="App.setApparelFilter('${id}')">${label}</button>`;
    };

    let html = `<div style="grid-column:1/-1; display:flex; flex-wrap:wrap; align-items:center; gap:6px; padding:8px 12px; background:var(--surface3); border-radius:8px; font-size:var(--f-xs); color:var(--text2)">
      <span style="font-weight:700; color:var(--text3); margin-right:4px">Filter:</span>
      ${filterPill('all', 'All (' + allItems.length + ')')}
      ${filterPill('armour', 'Armour')}
      ${filterPill('clothing', 'Clothing')}
      ${filterPill('utility', 'Utility')}
      <span style="margin-left:8px; font-weight:700; color:var(--text3)">Sort:</span>
      <select class="skill-input" style="width:auto; min-width:80px; font-size:var(--f-sm); padding:2px 8px; font-family:inherit; letter-spacing:0.01em" onchange="App.setApparelSort(this.value)">
        <option value="manual" ${sortField === 'manual' ? 'selected' : ''}>Manual (drag)</option>
        <option value="name" ${sortField === 'name' ? 'selected' : ''}>Name</option>
        <option value="type" ${sortField === 'type' ? 'selected' : ''}>Type</option>
        <option value="layer" ${sortField === 'layer' ? 'selected' : ''}>Layer</option>
        <option value="sharp" ${sortField === 'sharp' ? 'selected' : ''}>Sharp</option>
        <option value="blunt" ${sortField === 'blunt' ? 'selected' : ''}>Blunt</option>
        <option value="heat" ${sortField === 'heat' ? 'selected' : ''}>Heat Armour</option>
        <option value="cold" ${sortField === 'cold' ? 'selected' : ''}>Cold Insul.</option>
        <option value="hot" ${sortField === 'hot' ? 'selected' : ''}>Heat Insul.</option>
        <option value="mass" ${sortField === 'mass' ? 'selected' : ''}>Mass</option>
        ${hasModItems ? '<option value="mod" ' + (sortField === 'mod' ? 'selected' : '') + '>Mod Source</option>' : ''}
      </select>
      ${sortField !== 'manual' ? `<button class="btn btn-sm" style="font-size:10px; padding:2px 8px" onclick="App._apparelSortDir = App._apparelSortDir === 'asc' ? 'desc' : 'asc'; App.renderApparelList()">${sortDir === 'asc' ? '&#9650; Asc' : '&#9660; Desc'}</button>` : ''}
      <span style="margin-left:auto; color:var(--text3)">${rangeStart}-${rangeEnd} of ${items.length} item${items.length !== 1 ? 's' : ''}</span>
      ${pageCount > 1 ? `<div class="gear-pagination">
        <button class="btn btn-sm" onclick="App.setApparelPage(${page - 1})" ${page === 0 ? 'disabled' : ''} aria-label="Previous apparel page">&lt;</button>
        <select class="skill-input" onchange="App.setApparelPage(this.value)" aria-label="Apparel page">${pageOptions}</select>
        <button class="btn btn-sm" onclick="App.setApparelPage(${page + 1})" ${page === pageCount - 1 ? 'disabled' : ''} aria-label="Next apparel page">&gt;</button>
      </div>` : ''}
    </div>`;

    if (modCount > 0) {
      html += `<div style="grid-column:1/-1; display:flex; align-items:center; gap:8px; padding:6px 12px; background:var(--surface2); border-radius:6px; font-size:var(--f-xs); color:var(--text3)">
        <span class="mod-badge" style="margin:0">${modCount} mod</span> apparel items loaded from mods
        <button class="btn btn-sm btn-danger" style="margin-left:auto; font-size:10px" onclick="App.clearModItems('apparel')">Clear Mod Apparel</button>
      </div>`;
    }

    const dragAttrs = (id) => isManual ? `data-gear-id="${_escapeHtml(id)}" draggable="true" ondragstart="App.handleApparelDragStart(event,this.dataset.gearId)" ondragover="App.handleApparelDragOver(event)" ondragleave="App.handleApparelDragLeave(event)" ondrop="App.handleApparelDrop(event,this.dataset.gearId)" ondragend="App.handleApparelDragEnd(event)"` : '';

    if (isCompact) {
      html += `<div style="display:flex; flex-direction:column; gap:8px">`;
      visibleItems.forEach(item => {
        const s = this._calcApparelStats(item);
        const q = this._apparelQuality(item.quality);
        const layerDef = APPAREL_LAYERS.find(l => l.id === item.layer) || { label: item.layer };
        const utilStats = this._utilityStatsSummary(item);

        let statsHtml;
        if (utilStats) {
          statsHtml = `<div class="widget-gear-stats">
            ${utilStats.map(p => `<div class="widget-gear-stat"><span class="widget-gear-stat-val" style="color:var(--accent); font-size:calc(10px * var(--font-scale))">${_escapeHtml(p)}</span></div>`).join('')}
          </div>`;
        } else {
          statsHtml = `<div class="widget-gear-stats">
                <div class="widget-gear-stat"><span class="widget-gear-stat-label"${jtip('sharp')}>Sharp</span> <span class="widget-gear-stat-val" style="color:${this._armourColour(s.armorSharp)}">${(s.armorSharp*100).toFixed(0)}%</span></div>
                <div class="widget-gear-stat"><span class="widget-gear-stat-label"${jtip('blunt')}>Blunt</span> <span class="widget-gear-stat-val" style="color:${this._armourColour(s.armorBlunt)}">${(s.armorBlunt*100).toFixed(0)}%</span></div>
                <div class="widget-gear-stat"><span class="widget-gear-stat-label"${jtip('heat')}>Heat</span> <span class="widget-gear-stat-val" style="color:${this._armourColour(s.armorHeat)}">${(s.armorHeat*100).toFixed(0)}%</span></div>
                <div class="widget-gear-stat"><span class="widget-gear-stat-label"${jtip('cold')}>Cold</span> <span class="widget-gear-stat-val" style="color:var(--p2-txt)">${s.insulationCold >= 0 ? '+' : ''}${s.insulationCold}°C</span></div>
                <div class="widget-gear-stat"><span class="widget-gear-stat-label"${jtip('hot')}>Hot</span> <span class="widget-gear-stat-val" style="color:var(--p4-txt)">${s.insulationHeat >= 0 ? '+' : ''}${s.insulationHeat}°C</span></div>
          </div>`;
        }

        html += `
          <div class="widget-gear-card" ${dragAttrs(item.id)} style="${item.favourite ? 'border-left:3px solid var(--accent)' : ''}">
            <div style="display:flex; justify-content:space-between; align-items:center">
              <div>
                <div class="widget-gear-name">${star(item)}${grip}${_escapeHtml(item.name)}${_modBadge(item)}</div>
                <div class="widget-gear-sub">${_escapeHtml(layerDef.label)} · <span style="color:${q.color}; font-weight:700">${q.label}</span>${item.stuff ? ' · ' + _escapeHtml(((findMaterial(item.stuff, this.state.materials) || {}).label || item.stuff)) : ''} · ${s.mass}kg</div>
              </div>
            </div>
            ${statsHtml}
            <div class="widget-gear-actions">
              <button class="btn btn-sm" data-gear-id="${_escapeHtml(item.id)}" onclick="App.openApparelEditor(this.dataset.gearId)">Edit</button>
              <button class="btn btn-sm btn-danger" data-gear-id="${_escapeHtml(item.id)}" onclick="App.deleteApparel(this.dataset.gearId)">Del</button>
            </div>
          </div>`;
      });
      html += `</div>`;
    } else {
      const thSort = (field, label, align) => {
        const active = sortField === field;
        const arrow = active ? (sortDir === 'asc' ? ' &#9650;' : ' &#9660;') : '';
        const col = active ? 'color:var(--accent)' : '';
        return `<th style="padding:12px; font-size:var(--f-xs); ${align ? 'text-align:' + align : ''}; cursor:pointer; ${col}"${jtip(field)} onclick="App.setApparelSort('${field}')">${label}${arrow}</th>`;
      };

      html += `
        <div class="gear-table-scroll">
          <table class="armoury-table armoury-table--apparel" style="width:100%; border-collapse:collapse; background:var(--surface2); border:1px solid var(--border-med); border-radius:var(--radius-lg); overflow:hidden">
            <thead>
              <tr style="background:var(--surface3); text-align:left">
                ${thSort('name', 'ITEM', '')}
                <th style="padding:12px; font-size:var(--f-xs)"${jtip('quality')}>QUALITY</th>
                ${thSort('sharp', 'SHARP', 'center')}
                ${thSort('blunt', 'BLUNT', 'center')}
                ${thSort('heat', 'HEAT', 'center')}
                ${thSort('cold', 'INSUL COLD', 'center')}
                ${thSort('hot', 'INSUL HEAT', 'center')}
                ${thSort('mass', 'MASS', 'center')}
                <th style="padding:12px; font-size:var(--f-xs); text-align:right">ACTIONS</th>
              </tr>
            </thead>
            <tbody>`;

      visibleItems.forEach(item => {
        const s = this._calcApparelStats(item);
        const q = this._apparelQuality(item.quality);
        const layerDef = APPAREL_LAYERS.find(l => l.id === item.layer) || { label: item.layer };
        const coverageLabels = (Array.isArray(item.coverage) ? item.coverage : [])
          .map(cid => APPAREL_COVERAGE.find(c => c.id === cid)?.label || cid)
          .join(', ') || '-';
        const utilStats = this._utilityStatsSummary(item);

        let statCells;
        if (utilStats) {
          // Utility items span the 5 stat columns with a tag-based summary
          const tags = utilStats.map(p => `<span style="display:inline-block; background:rgba(232,168,56,0.12); color:var(--accent); font-weight:700; padding:2px 8px; border-radius:4px; font-size:var(--f-xs); margin:1px 2px">${_escapeHtml(p)}</span>`).join(' ');
          statCells = `<td colspan="5" style="padding:12px; text-align:center">${tags}</td>`;
        } else {
          statCells = `
            <td style="padding:12px; text-align:center; font-weight:800; color:${this._armourColour(s.armorSharp)}">${(s.armorSharp * 100).toFixed(0)}%</td>
            <td style="padding:12px; text-align:center; font-weight:800; color:${this._armourColour(s.armorBlunt)}">${(s.armorBlunt * 100).toFixed(0)}%</td>
            <td style="padding:12px; text-align:center; font-weight:800; color:${this._armourColour(s.armorHeat)}">${(s.armorHeat  * 100).toFixed(0)}%</td>
            <td style="padding:12px; text-align:center; color:var(--p2-txt)">${s.insulationCold >= 0 ? '+' : ''}${s.insulationCold}°C</td>
            <td style="padding:12px; text-align:center; color:var(--p4-txt)">${s.insulationHeat >= 0 ? '+' : ''}${s.insulationHeat}°C</td>`;
        }

        html += `
          <tr style="border-bottom:1px solid var(--border); ${item.favourite ? 'background:rgba(232,168,56,0.04)' : ''}" ${dragAttrs(item.id)}>
            <td style="padding:12px">
              <div style="font-weight:700; color:var(--text); display:flex; align-items:center">${star(item)}${grip}${_escapeHtml(item.name)}${_modBadge(item)}</div>
              <div style="font-size:var(--f-xs); color:var(--text3); margin-top:2px">${_escapeHtml(layerDef.label)}${item.stuff ? ' · ' + _escapeHtml(((findMaterial(item.stuff, this.state.materials) || {}).label || item.stuff)) : ''} · ${_escapeHtml(coverageLabels)}</div>
            </td>
            <td style="padding:12px">
              <span style="font-size:var(--f-xs); font-weight:700; color:${q.color}; text-transform:uppercase; background:rgba(0,0,0,0.2); padding:2px 6px; border-radius:4px">${q.label}</span>
            </td>
            ${statCells}
            <td style="padding:12px; text-align:center; color:var(--text2)">${s.mass}kg</td>
            <td style="padding:12px; text-align:right">
              <button class="btn btn-sm" data-gear-id="${_escapeHtml(item.id)}" onclick="App.openApparelEditor(this.dataset.gearId)">Edit</button>
              <button class="btn btn-sm btn-danger" data-gear-id="${_escapeHtml(item.id)}" onclick="App.deleteApparel(this.dataset.gearId)">Delete</button>
            </td>
          </tr>`;
      });

      html += `</tbody></table></div>`;
    }

    // Quality guide
    let qualityGuide;
    if (isCompact) {
      qualityGuide = `
        <div class="settings-card" style="background:var(--surface2); margin-top:8px; padding:8px">
          <div class="section-title section-title--sm">Quality Modifiers</div>
          <div style="display:flex; flex-direction:column; gap:4px">
            ${APPAREL_QUALITIES.map(q => `
              <div style="display:flex; align-items:center; gap:6px; padding:4px 6px; background:rgba(0,0,0,0.15); border-radius:4px; border-left:3px solid ${q.color}">
                <span style="font-weight:800; color:${q.color}; font-size:calc(10px * var(--font-scale)); min-width:60px; text-transform:uppercase">${q.label}</span>
                <span style="font-size:calc(9px * var(--font-scale)); color:var(--text3)">Mult</span><span style="font-size:calc(10px * var(--font-scale)); font-weight:700; color:var(--text)">×${q.armorMult || q.mult}</span>
              </div>`).join('')}
          </div>
          <p style="font-size:calc(9px * var(--font-scale)); color:var(--text3); margin-top:6px; font-style:italic">
            Armour and Insulation scale with quality (separate multipliers).
          </p>
        </div>`;
    } else {
      qualityGuide = `
        <div class="settings-card" style="background:var(--surface2); margin-top:8px">
          <div class="section-title section-title--sm">Apparel Quality Reference</div>
          <table style="width:100%; border-collapse:collapse; font-size:var(--f-xs)">
            <thead>
              <tr style="text-align:center; color:var(--text3); text-transform:uppercase; font-weight:700">
                <th style="padding:6px 12px; text-align:left">Quality</th>
                <th style="padding:6px 12px">Mult</th>
              </tr>
            </thead>
            <tbody>
              ${APPAREL_QUALITIES.map(q => `
                <tr style="border-top:1px solid var(--border)">
                  <td style="padding:6px 12px; font-weight:800; color:${q.color}; text-transform:uppercase">${q.label}</td>
                  <td style="padding:6px 12px; text-align:center; font-weight:700; color:var(--text)">×${q.armorMult || q.mult}</td>
                </tr>`).join('')}
            </tbody>
          </table>
          <p style="font-size:var(--f-xs); color:var(--text3); margin-top:8px; font-style:italic">
            Armour and Insulation scale with quality (separate multipliers). Legendary apparel = ×1.8 armour, ×1.8 insulation.
          </p>
        </div>`;
    }

    c.innerHTML = `<div style="display:flex; flex-direction:column; gap:${isCompact ? '12px' : '16px'}">${html}${qualityGuide}</div>`;
  },

  renderApparelComparisonView() {
    const items = this.state.apparel || [];
    const wAP = this.state.comparisonApparelData.weaponAP || 0;
    const renderForm = (side) => {
      const w = this.state.comparisonApparelData[side];
      return `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:12px">
          <div>
            <label class="settings-label" style="font-size:var(--f-xs); color:var(--accent)">Pre-fill Item</label>
            <select class="skill-input" style="width:100%; margin-top:2px" onchange="App.prefillApparelComparison('${side}', this.value)">
              <option value="">-- Select Item --</option>
              ${items.map(x => `<option value="${_escapeHtml(x.id)}" ${x.id === w.id ? 'selected' : ''}>${_escapeHtml(x.name)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="settings-label" style="font-size:var(--f-xs); color:var(--accent)">Quality</label>
            <select class="skill-input" style="width:100%; margin-top:2px" onchange="App.updateApparelComparisonField('${side}', 'quality', this.value)">
              ${APPAREL_QUALITIES.map(q => `<option value="${q.id}" ${w.quality === q.id ? 'selected' : ''}>${q.label} (×${q.armorMult || q.mult})</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px">
          <div style="grid-column: 1 / -1; margin-bottom:4px">
            <label class="settings-label" style="display:block; margin-bottom:4px; font-size:var(--f-xs)">Display Name</label>
            <input type="text" class="skill-input" style="width:100%; font-weight:700" value="${_escapeHtml(w.name)}" oninput="App.updateApparelComparisonField('${side}', 'name', this.value)">
          </div>
          <div><label class="settings-label" style="display:block; margin-bottom:4px; font-size:var(--f-xs)">Base Sharp (%)</label><input type="number" step="0.01" class="skill-input" style="width:100%" value="${w.armorSharp}" oninput="App.updateApparelComparisonField('${side}', 'armorSharp', this.value)"></div>
          <div><label class="settings-label" style="display:block; margin-bottom:4px; font-size:var(--f-xs)">Base Blunt (%)</label><input type="number" step="0.01" class="skill-input" style="width:100%" value="${w.armorBlunt}" oninput="App.updateApparelComparisonField('${side}', 'armorBlunt', this.value)"></div>
          <div><label class="settings-label" style="display:block; margin-bottom:4px; font-size:var(--f-xs)">Base Heat (%)</label><input type="number" step="0.01" class="skill-input" style="width:100%" value="${w.armorHeat}" oninput="App.updateApparelComparisonField('${side}', 'armorHeat', this.value)"></div>
          <div><label class="settings-label" style="display:block; margin-bottom:4px; font-size:var(--f-xs)">Insul Cold (°C)</label><input type="number" class="skill-input" style="width:100%" value="${w.insulationCold}" oninput="App.updateApparelComparisonField('${side}', 'insulationCold', this.value)"></div>
          <div><label class="settings-label" style="display:block; margin-bottom:4px; font-size:var(--f-xs)">Insul Heat (°C)</label><input type="number" class="skill-input" style="width:100%" value="${w.insulationHeat}" oninput="App.updateApparelComparisonField('${side}', 'insulationHeat', this.value)"></div>
          <div><label class="settings-label" style="display:block; margin-bottom:4px; font-size:var(--f-xs)">Mass (kg)</label><input type="number" step="0.1" class="skill-input" style="width:100%" value="${w.mass}" oninput="App.updateApparelComparisonField('${side}', 'mass', this.value)"></div>
        </div>`;
    };

    // Weapon AP input - shown once, applies to both sides
    const apInput = `
      <div style="grid-column:1/-1; background:var(--surface3); border:1px solid var(--border-med); border-radius:8px; padding:10px 14px; margin-bottom:16px; display:flex; align-items:center; gap:16px; flex-wrap:wrap">
        <div style="font-size:var(--f-sm); font-weight:700; color:var(--accent)">Weapon AP Simulator</div>
        <div style="display:flex; align-items:center; gap:8px; flex:1">
          <label style="font-size:var(--f-xs); color:var(--text2); white-space:nowrap">Incoming Weapon AP (0-1.0):</label>
          <input type="number" step="0.01" min="0" max="1" value="${wAP}"
            class="skill-input" style="width:70px; text-align:center"
            oninput="App.state.comparisonApparelData.weaponAP=parseFloat(this.value)||0; App.analyzeApparelComparison()">
          <span style="font-size:var(--f-xs); color:var(--text3)">e.g. Assault Rifle = 0.16, Charge Rifle = 0.50, Pistol = 0.05</span>
        </div>
        <div style="font-size:var(--f-xs); color:var(--text3); font-style:italic">AP is <em>subtracted</em> from armour rating (not multiplied). Effective armour = base armour - AP.</div>
      </div>`;

    // Inject AP row into the parent comparison container above the form cards
    const compContainer = document.getElementById('apparelComparison');
    let apRow = compContainer.querySelector('.ap-simulator-row');
    if (!apRow) {
      apRow = document.createElement('div');
      apRow.className = 'ap-simulator-row';
      compContainer.insertBefore(apRow, compContainer.firstChild);
    }
    apRow.innerHTML = apInput;

    document.getElementById('comp-app-form-a').innerHTML = renderForm('a');
    document.getElementById('comp-app-form-b').innerHTML = renderForm('b');
    this.analyzeApparelComparison();
  },

  analyzeApparelComparison() {
    const a = this.state.comparisonApparelData.a;
    const b = this.state.comparisonApparelData.b;
    // Pull the incoming weapon AP from the shared input (default 0 = unarmoured hit)
    const wAP = parseFloat(this.state.comparisonApparelData.weaponAP || 0);
    const resA = this._calcApparelStats(a, wAP);
    const resB = this._calcApparelStats(b, wAP);

    const qA = this._apparelQuality(a.quality);
    const qB = this._apparelQuality(b.quality);

    const getAnalysis = (mainRes, otherRes, mainQual, mainItem, otherItem) => {
      const pros = [], cons = [];
      const isUtility = !!(mainItem && mainItem.type === 'utility');
      if (isUtility) {
        // Utility items (shield belts, packs) are not armour - judge them on their own effect.
        const sh = this._calcShieldStats ? this._calcShieldStats(mainItem) : null;
        if (sh) pros.push(`Energy shield (~${Math.round(sh.effectiveHP)} HP, ${sh.rechargePerSec.toFixed(1)} HP/s recharge)${sh.blocksRangedOut ? ' - blocks your own ranged fire' : ''}`);
        pros.push(`Belt-slot utility - leaves your armour layers free`);
      } else {
        if (mainRes.armorSharp > otherRes.armorSharp + 0.1) pros.push(`Superior Sharp protection (+${((mainRes.armorSharp - otherRes.armorSharp)*100).toFixed(0)}%)`);
        if (mainRes.armorSharp < otherRes.armorSharp - 0.1) cons.push(`Weaker against blades &amp; bullets (−${((otherRes.armorSharp - mainRes.armorSharp)*100).toFixed(0)}%)`);
        if (mainRes.armorBlunt > otherRes.armorBlunt + 0.1) pros.push(`Better Blunt resistance`);
        if (mainRes.armorBlunt < otherRes.armorBlunt - 0.1) cons.push(`Vulnerable to blunt trauma`);
        if (mainRes.armorHeat  > otherRes.armorHeat  + 0.1) pros.push(`Better Heat/Flame protection`);
        if (mainRes.armorHeat  < otherRes.armorHeat  - 0.1) cons.push(`Weaker against fire/heat damage`);
        if (mainRes.insulationCold > otherRes.insulationCold + 3) pros.push(`Warmer in cold (${mainRes.insulationCold > 0 ? '+' : ''}${mainRes.insulationCold}°C vs ${otherRes.insulationCold > 0 ? '+' : ''}${otherRes.insulationCold}°C)`);
        if (mainRes.insulationCold < otherRes.insulationCold - 3) cons.push(`Less cold protection`);
        if (mainRes.insulationHeat > otherRes.insulationHeat + 3) pros.push(`Better heat comfort`);
        if (mainRes.armorHeat > 0 && mainRes.armorHeat < 1.0) cons.push(`Heat armour below 100% - flame damage that passes through can still ignite the pawn`);
        // Coverage (only when both items report body-part coverage, e.g. from a mod scan).
        const mc = (mainItem && mainItem.coverage || []).length, oc = (otherItem && otherItem.coverage || []).length;
        if (mc > 0 && oc > 0 && mc > oc) pros.push(`Covers more of the body (${mc} vs ${oc} part${oc !== 1 ? 's' : ''})`);
        if (mc > 0 && oc > 0 && mc < oc) cons.push(`Covers less of the body (${mc} vs ${oc} parts)`);
        const q = this._apparelQuality(mainQual);
        const qm = q.armorMult || q.mult || 1;
        if (qm >= 1.45) pros.push(`High-quality craftsmanship (armour ×${qm}, insulation ×${q.insulMult || q.mult || 1})`);
        if (qm <= 0.8) cons.push(`Quality penalty on all stats (armour ×${qm}, insulation ×${q.insulMult || q.mult || 1})`);
      }
      if (mainRes.mass < otherRes.mass - 0.5) pros.push(`Lighter (${mainRes.mass}kg vs ${otherRes.mass}kg)`);
      if (mainRes.mass > otherRes.mass + 0.5) cons.push(`Heavier load (${mainRes.mass}kg vs ${otherRes.mass}kg)`);
      return { pros, cons };
    };

    const analysisA = getAnalysis(resA, resB, a.quality, a, b);
    const analysisB = getAnalysis(resB, resA, b.quality, b, a);

    // Symmetric, utility-aware TL;DR (evaluated from both items' perspectives).
    const apparelTips = (main, mainRes, other, otherRes) => {
      const t = [];
      if (main.type === 'utility') { t.push(`${main.name} is a utility item, not armour - it takes the belt slot and is judged on its own effect, not protection.`); return t; }
      if (mainRes.armorSharp > 0.8) t.push(`${main.name} is heavy-duty ballistic gear - solid front-line protection.`);
      if (mainRes.insulationCold > 20) t.push(`${main.name} is a vital asset in sub-zero colonies.`);
      if (mainRes.effSharp != null && mainRes.effSharp < 0.1 && wAP > 0) t.push(`${main.name} is nearly negated by the entered weapon AP (${(wAP*100).toFixed(0)}%) - upgrade quality or layer it under outer armour.`);
      if (mainRes.armorSharp > otherRes.armorSharp * 1.2 && mainRes.armorBlunt < otherRes.armorBlunt) t.push(`${main.name} beats ${other.name} vs sharp/ranged threats, but ${other.name} handles blunt (melee/explosions) better.`);
      const mc = (main.coverage || []).length, oc = (other.coverage || []).length;
      if (mc > 0 && oc > 0 && mc > oc + 2) t.push(`${main.name} covers much more of the body (${mc} vs ${oc} parts) - broader blanket protection.`);
      return t;
    };
    const tips = [...apparelTips(a, resA, b, resB), ...apparelTips(b, resB, a, resA)];
    if (tips.length === 0) tips.push(`Both items are comparable at the entered AP level - pick on coverage, layer and quality.`);

    // Deflect / mitigate chance helper formatted as %
    const pct = v => (v * 100).toFixed(0) + '%';

    const analysisEl = document.getElementById('apparelComparisonAnalysis');
    analysisEl.innerHTML = `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:32px">
        <div style="background:rgba(56,140,232,0.05); padding:16px; border-radius:12px; border:1px solid rgba(56,140,232,0.1)">
          <h4 class="section-title section-title--sm" style="color:var(--p2-txt)">Analysis: ${_escapeHtml(a.name)}</h4>
          <div style="font-size:var(--f-xs); color:${qA.color}; font-weight:700; margin-bottom:10px; text-transform:uppercase">${qA.label} Quality (×${qA.armorMult || qA.mult || 1})</div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px">
            <div>
              <div style="font-size:var(--f-xs); color:var(--ok-txt); font-weight:800; text-transform:uppercase; margin-bottom:6px">Pros</div>
              <ul style="padding-left:14px; color:var(--text2); font-size:var(--f-xs); line-height:1.4">${analysisA.pros.map(p => `<li style="margin-bottom:4px">${_escapeHtml(p)}</li>`).join('') || '<li>Balanced item.</li>'}</ul>
            </div>
            <div>
              <div style="font-size:var(--f-xs); color:var(--p4-txt); font-weight:800; text-transform:uppercase; margin-bottom:6px">Cons</div>
              <ul style="padding-left:14px; color:var(--text2); font-size:var(--f-xs); line-height:1.4">${analysisA.cons.map(c => `<li style="margin-bottom:4px">${_escapeHtml(c)}</li>`).join('') || '<li>No major flaws.</li>'}</ul>
            </div>
          </div>
        </div>
        <div style="background:rgba(240,133,122,0.05); padding:16px; border-radius:12px; border:1px solid rgba(240,133,122,0.1)">
          <h4 class="section-title section-title--sm" style="color:var(--p4-txt)">Analysis: ${_escapeHtml(b.name)}</h4>
          <div style="font-size:var(--f-xs); color:${qB.color}; font-weight:700; margin-bottom:10px; text-transform:uppercase">${qB.label} Quality (×${qB.armorMult || qB.mult || 1})</div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px">
            <div>
              <div style="font-size:var(--f-xs); color:var(--ok-txt); font-weight:800; text-transform:uppercase; margin-bottom:6px">Pros</div>
              <ul style="padding-left:14px; color:var(--text2); font-size:var(--f-xs); line-height:1.4">${analysisB.pros.map(p => `<li style="margin-bottom:4px">${_escapeHtml(p)}</li>`).join('') || '<li>Balanced item.</li>'}</ul>
            </div>
            <div>
              <div style="font-size:var(--f-xs); color:var(--p4-txt); font-weight:800; text-transform:uppercase; margin-bottom:6px">Cons</div>
              <ul style="padding-left:14px; color:var(--text2); font-size:var(--f-xs); line-height:1.4">${analysisB.cons.map(c => `<li style="margin-bottom:4px">${_escapeHtml(c)}</li>`).join('') || '<li>No major flaws.</li>'}</ul>
            </div>
          </div>
        </div>
        <div style="grid-column: 1 / -1; border-top:1px solid var(--border); padding-top:16px">
          <h4 class="section-title section-title--sm" style="color:var(--accent)">Tactical TL;DR</h4>
          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px">${tips.slice(0,3).map(t => `<p style="color:var(--text); font-size:var(--f-sm); font-style:italic; margin:0">"${_escapeHtml(t)}"</p>`).join('')}</div>
          <div style="margin-bottom:12px; padding:10px 14px; background:var(--surface3); border-radius:8px; border-left:3px solid var(--accent); font-size:var(--f-xs); color:var(--text2); line-height:1.5">
            <strong style="color:var(--accent)">How armour deflection works:</strong>
            Each layer rolls a random 0-100 vs <em>effective armour = base - weapon AP</em>.
            Roll &lt; effArmour/2 → full deflect. Roll &lt; effArmour → damage halved (Sharp converted to Blunt).
            Roll ≥ effArmour → armour has no effect. Layers stack multiplicatively - two 50% mitigation layers = 25% of original damage.
            <br><span style="color:var(--p3-txt)">Note: Inner layers always roll their <em>Sharp</em> rating even after a Sharp→Blunt conversion by an outer layer.</span>
          </div>
          <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:12px; margin-bottom:12px">
            <div style="background:var(--surface3); padding:10px; border-radius:8px; text-align:center">
              <div style="font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; margin-bottom:4px">Sharp (final)</div>
              <div style="font-weight:800; color:${resA.armorSharp >= resB.armorSharp ? 'var(--p2-txt)' : 'var(--text)'}">${(resA.armorSharp*100).toFixed(0)}%</div>
              <div style="font-size:var(--f-xs); color:var(--text3)">vs</div>
              <div style="font-weight:800; color:${resB.armorSharp >= resA.armorSharp ? 'var(--p4-txt)' : 'var(--text)'}">${(resB.armorSharp*100).toFixed(0)}%</div>
            </div>
            <div style="background:var(--surface3); padding:10px; border-radius:8px; text-align:center">
              <div style="font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; margin-bottom:4px">Deflect Chance<br><span style="opacity:0.7">vs AP ${(wAP*100).toFixed(0)}%</span></div>
              <div style="font-weight:800; color:${resA.deflectSharp >= resB.deflectSharp ? 'var(--p2-txt)' : 'var(--text)'}">${pct(resA.deflectSharp)}</div>
              <div style="font-size:var(--f-xs); color:var(--text3)">vs</div>
              <div style="font-weight:800; color:${resB.deflectSharp >= resA.deflectSharp ? 'var(--p4-txt)' : 'var(--text)'}">${pct(resB.deflectSharp)}</div>
            </div>
            <div style="background:var(--surface3); padding:10px; border-radius:8px; text-align:center">
              <div style="font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; margin-bottom:4px">Insulation Cold</div>
              <div style="font-weight:800; color:${resA.insulationCold >= resB.insulationCold ? 'var(--p2-txt)' : 'var(--text)'}">${resA.insulationCold > 0 ? '+' : ''}${resA.insulationCold}°C</div>
              <div style="font-size:var(--f-xs); color:var(--text3)">vs</div>
              <div style="font-weight:800; color:${resB.insulationCold >= resA.insulationCold ? 'var(--p4-txt)' : 'var(--text)'}">${resB.insulationCold > 0 ? '+' : ''}${resB.insulationCold}°C</div>
            </div>
            <div style="background:var(--surface3); padding:10px; border-radius:8px; text-align:center">
              <div style="font-size:var(--f-xs); color:var(--text3); text-transform:uppercase; margin-bottom:4px">Mass</div>
              <div style="font-weight:800; color:${resA.mass <= resB.mass ? 'var(--p2-txt)' : 'var(--text)'}">${resA.mass}kg</div>
              <div style="font-size:var(--f-xs); color:var(--text3)">vs</div>
              <div style="font-weight:800; color:${resB.mass <= resA.mass ? 'var(--p4-txt)' : 'var(--text)'}">${resB.mass}kg</div>
            </div>
          </div>
        </div>
      </div>`;
  },

  openApparelEditor(id = null) {
    const modal = document.getElementById('apparelModal');
    const body  = document.getElementById('apparelModalBody');
    const title = document.getElementById('apparelModalTitle');
    if (!modal || !body) return;

    // Capture previous editing state before overwriting - needed to detect type-switch
    const prevEditing = this.state.apparelEditing;
    const editingType = prevEditing?.type;
    const blank = {
      id: 'app_' + Date.now(),
      name: '',
      type: editingType || 'armour',
      layer: editingType === 'utility' ? 'belt' : 'middle',
      quality: 'normal',
      coverage: editingType === 'utility' ? [] : ['torso'],
      armorSharp: editingType === 'utility' ? 0 : 0.30,
      armorBlunt: editingType === 'utility' ? 0 : 0.20,
      armorHeat: editingType === 'utility' ? 0 : 0.10,
      insulationCold: 0,
      insulationHeat: 0,
      mass: 2.0,
      workToMake: 5000,
      movePenalty: 0,
      notes: '',
      utilityCategory: 'passive',
      shieldMax: 0,
      shieldRecharge: 0,
      shieldLossPerDmg: 0.033,
      blocksRangedOut: true,
      charges: 0,
      range: 0,
      warmup: 0,
      radius: 0,
    };

    const storedItem = id ? this.state.apparel.find(x => x.id === id) : null;
    const sourceItem = prevEditing && id && prevEditing.id === id
      ? prevEditing : (storedItem || blank);
    this.state.apparelEditing = {
      ...sourceItem,
      coverage: [...(sourceItem.coverage || [])],
      statOffsets: sourceItem.statOffsets ? { ...sourceItem.statOffsets } : undefined,
    };
    if (this.state.apparelEditing.type === 'utility') this.state.apparelEditing.layer = 'belt';
    // Use the editing copy for template rendering (reflects type override)
    const item = this.state.apparelEditing;
    title.textContent = storedItem ? 'Edit Apparel Item' : 'Add Apparel Item';


    const coverageCheckboxes = APPAREL_COVERAGE.map(c => `
      <label style="display:flex; align-items:center; gap:6px; font-size:var(--f-xs); cursor:pointer; padding:3px 0">
        <input type="checkbox" ${(item.coverage || []).includes(c.id) ? 'checked' : ''}
          onchange="App._toggleApparelCoverage('${c.id}', this.checked)"
          style="width:14px; height:14px; accent-color:var(--accent)">
        ${c.label}
      </label>`).join('');

    body.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px">

        <div>
          <label class="editor-label">Item Name</label>
          <input type="text" id="app-name" class="skill-input" style="width:100%; padding:8px 12px; text-align:left"
            value="${_escapeHtml(item.name)}" placeholder="e.g. Recon Armour">
        </div>

        <div>
          <label class="editor-label">Mod Source</label>
          <input type="text" id="app-mod" class="skill-input" style="width:100%; padding:8px 12px; text-align:left"
            value="${_escapeHtml(item.modSource || '')}" placeholder="Vanilla (leave blank)">
        </div>

        <div>
          <label class="editor-label">Type</label>
          <select id="app-type" class="skill-input" style="width:100%"
            onchange="App.state.apparelEditing.type=this.value; App.openApparelEditor(App.state.apparelEditing.id)">
            ${APPAREL_TYPES.map(t => `<option value="${t.id}" ${item.type===t.id?'selected':''}>${t.label}</option>`).join('')}
          </select>
        </div>

        <div>
          <label class="editor-label">Wear Layer</label>
          <select id="app-layer" class="skill-input" style="width:100%">
            ${APPAREL_LAYERS.map(l => `<option value="${l.id}" ${item.layer===l.id?'selected':''}>${l.label} - ${l.hint}</option>`).join('')}
          </select>
        </div>

        <div>
          <label class="editor-label">Quality</label>
          <select id="app-quality" class="skill-input" style="width:100%">
            ${APPAREL_QUALITIES.map(q => `<option value="${q.id}" ${item.quality===q.id?'selected':''}>${q.label} (x${q.armorMult || q.mult})</option>`).join('')}
          </select>
        </div>

        <div>
          <label class="editor-label">Material</label>
          <select id="app-stuff" class="skill-input" style="width:100%">
            <option value="">None (base stats)</option>
            ${(item.stuffBased ? getAvailableMaterials(item, this.state.materials) : (this.state.materials || DEFAULT_MATERIALS)).map(m =>
              '<option value="' + _escapeHtml(m.id) + '"' + (item.stuff === m.id ? ' selected' : '') + '>' + _escapeHtml(m.label) + (m.modSource ? ' (' + _escapeHtml(m.modSource) + ')' : '') + '</option>'
            ).join('')}
          </select>
          <div style="display:flex; align-items:center; gap:6px; margin-top:4px">
            <input type="checkbox" id="app-stuff-based" ${item.stuffBased ? 'checked' : ''}
              onchange="App.state.apparelEditing.stuffBased=this.checked; App.openApparelEditor(App.state.apparelEditing.id)"
              style="width:14px; height:14px; accent-color:var(--accent)">
            <label for="app-stuff-based" style="font-size:var(--f-xs); color:var(--text3); cursor:pointer">Stuff-based (stats from material)</label>
          </div>
        </div>

        <div>
          <label class="editor-label">Mass (kg)</label>
          <input type="number" step="0.1" id="app-mass" class="skill-input" style="width:100%" value="${item.mass}">
        </div>

        ${item.type === 'utility' ? `
        <div style="grid-column:1/-1; border-top:1px solid var(--border); padding-top:14px; margin-top:4px">
          <div class="section-title section-title--sm">Utility Stats</div>
        </div>

        <div>
          <label class="editor-label">Utility Category</label>
          <select id="app-util-cat" class="skill-input" style="width:100%">
            <option value="shield" ${item.utilityCategory==='shield'?'selected':''}>Shield</option>
            <option value="active" ${item.utilityCategory==='active'?'selected':''}>Active / Reloadable</option>
            <option value="lance" ${item.utilityCategory==='lance'?'selected':''}>Lance</option>
            <option value="passive" ${(!item.utilityCategory||item.utilityCategory==='passive')?'selected':''}>Passive</option>
          </select>
        </div>

        <div>
          <label class="editor-label">Shield Max Energy</label>
          <input type="number" step="0.1" id="app-shield-max" class="skill-input" style="width:100%" value="${item.shieldMax || 0}">
          <div style="font-size:var(--f-xs); color:var(--text3); margin-top:2px">EnergyShieldEnergyMax. Standard shield belt = 1.1</div>
        </div>
        <div>
          <label class="editor-label">Shield Recharge/s</label>
          <input type="number" step="0.01" id="app-shield-rech" class="skill-input" style="width:100%" value="${item.shieldRecharge || 0}">
          <div style="font-size:var(--f-xs); color:var(--text3); margin-top:2px">EnergyShieldRechargeRate. Standard = 0.13</div>
        </div>
        <div>
          <label class="editor-label">Shield Loss/Dmg</label>
          <input type="number" step="0.001" id="app-shield-loss" class="skill-input" style="width:100%" value="${item.shieldLossPerDmg || 0.033}">
          <div style="font-size:var(--f-xs); color:var(--text3); margin-top:2px">energyLossPerDamage. Default 0.033</div>
        </div>
        <div>
          <label class="editor-label">Blocks Ranged Out</label>
          <select id="app-blocks-ranged" class="skill-input" style="width:100%">
            <option value="true" ${item.blocksRangedOut !== false ? 'selected' : ''}>Yes - wearer cannot fire ranged</option>
            <option value="false" ${item.blocksRangedOut === false ? 'selected' : ''}>No - wearer can fire through shield</option>
          </select>
        </div>

        <div>
          <label class="editor-label">Charges</label>
          <input type="number" step="1" min="0" id="app-charges" class="skill-input" style="width:100%" value="${item.charges || 0}">
        </div>
        <div>
          <label class="editor-label">Range</label>
          <input type="number" step="0.1" id="app-range" class="skill-input" style="width:100%" value="${item.range || 0}">
        </div>
        <div>
          <label class="editor-label">Warmup Time (s)</label>
          <input type="number" step="0.1" id="app-warmup" class="skill-input" style="width:100%" value="${item.warmup || 0}">
        </div>
        <div>
          <label class="editor-label">Radius</label>
          <input type="number" step="0.1" id="app-radius" class="skill-input" style="width:100%" value="${item.radius || 0}">
        </div>

        <div style="grid-column:1/-1; border-top:1px solid var(--border); padding-top:14px; margin-top:4px">
          <div class="section-title section-title--sm">Equipped Stat Offsets (combat-relevant)</div>
        </div>
        <div>
          <label class="editor-label">Ranged Cooldown Factor</label>
          <input type="number" step="0.01" id="app-so-rcd" class="skill-input" style="width:100%" value="${(item.statOffsets && item.statOffsets.rangedCooldownFactor) || 0}">
          <div style="font-size:var(--f-xs); color:var(--text3); margin-top:2px">Negative = faster. -0.2 = 80% cooldown = ~25% DPS increase</div>
        </div>
        <div>
          <label class="editor-label">Melee Cooldown Factor</label>
          <input type="number" step="0.01" id="app-so-mcd" class="skill-input" style="width:100%" value="${(item.statOffsets && item.statOffsets.meleeCooldownFactor) || 0}">
        </div>
        <div>
          <label class="editor-label">Shooting Accuracy</label>
          <input type="number" step="0.01" id="app-so-acc" class="skill-input" style="width:100%" value="${(item.statOffsets && item.statOffsets.shootingAccuracy) || 0}">
        </div>
        <div>
          <label class="editor-label">Aiming Delay Factor</label>
          <input type="number" step="0.01" id="app-so-aim" class="skill-input" style="width:100%" value="${(item.statOffsets && item.statOffsets.aimingDelayFactor) || 0}">
        </div>
        ` : ''}

        ${item.stuffBased ? `
        <div style="grid-column:1/-1; border-top:1px solid var(--border); padding-top:14px; margin-top:4px">
          <div class="section-title section-title--sm">Stuff Multipliers (applied to material stats)</div>
        </div>
        <div>
          <label class="editor-label">Stuff Categories</label>
          <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px">
            ${['Fabric', 'Leathery', 'Metallic', 'Woody', 'Stony'].map(cat =>
              '<label style="display:flex; align-items:center; gap:4px; font-size:var(--f-xs); cursor:pointer">' +
              '<input type="checkbox" class="app-stuff-cat" value="' + cat + '"' +
              ((item.stuffCategories || []).includes(cat) ? ' checked' : '') +
              ' style="width:12px; height:12px; accent-color:var(--accent)">' + cat + '</label>'
            ).join('')}
          </div>
          <div style="font-size:var(--f-xs); color:var(--text3); margin-top:2px">Which material types can this item be made from.</div>
        </div>
        <div>
          <label class="editor-label">Armour Multiplier</label>
          <input type="number" step="0.05" min="0" max="2" id="app-stuff-armor" class="skill-input" style="width:100%" value="${item.stuffMultArmor || 1}">
          <div style="font-size:var(--f-xs); color:var(--text3); margin-top:2px">StuffEffectMultiplierArmor. Multiplied by material's StuffPower armour values.</div>
        </div>
        <div>
          <label class="editor-label">Cold Insulation Mult</label>
          <input type="number" step="0.05" min="0" max="3" id="app-stuff-cold" class="skill-input" style="width:100%" value="${item.stuffMultInsulCold || 0}">
          <div style="font-size:var(--f-xs); color:var(--text3); margin-top:2px">StuffEffectMultiplierInsulation_Cold. 0 = no insulation from material.</div>
        </div>
        <div>
          <label class="editor-label">Heat Insulation Mult</label>
          <input type="number" step="0.05" min="0" max="3" id="app-stuff-heat" class="skill-input" style="width:100%" value="${item.stuffMultInsulHeat || 0}">
          <div style="font-size:var(--f-xs); color:var(--text3); margin-top:2px">StuffEffectMultiplierInsulation_Heat. 0 = no insulation from material.</div>
        </div>
        ` : ''}

        <div style="grid-column:1/-1; border-top:1px solid var(--border); padding-top:14px; margin-top:4px">
          <div class="section-title section-title--sm">Armour Ratings (base, before quality${item.stuffBased ? ' - overridden by material when set' : ''})</div>
        </div>

        <div>
          <label class="editor-label">Sharp Armour (0-2.0)</label>
          <input type="number" step="0.01" min="0" max="2" id="app-sharp" class="skill-input" style="width:100%" value="${item.armorSharp}">
          <div style="font-size:var(--f-xs); color:var(--text3); margin-top:2px">Bullet, blade, and arrow resistance.${item.stuffBased ? ' Ignored when material is selected.' : ''}</div>
        </div>
        <div>
          <label class="editor-label">Blunt Armour (0-2.0)</label>
          <input type="number" step="0.01" min="0" max="2" id="app-blunt" class="skill-input" style="width:100%" value="${item.armorBlunt}">
          <div style="font-size:var(--f-xs); color:var(--text3); margin-top:2px">Club, charge, and explosion resistance.</div>
        </div>
        <div>
          <label class="editor-label">Heat Armour (0-2.0)</label>
          <input type="number" step="0.01" min="0" max="2" id="app-heat-arm" class="skill-input" style="width:100%" value="${item.armorHeat}">
          <div style="font-size:var(--f-xs); color:var(--text3); margin-top:2px">Flame and thermal damage resistance.</div>
        </div>

        <div style="grid-column:1/-1; border-top:1px solid var(--border); padding-top:14px; margin-top:4px">
          <div class="section-title section-title--sm">Insulation (°C offset, quality-scaled)</div>
        </div>
        <div>
          <label class="editor-label">Cold Insulation base (°C)</label>
          <input type="number" step="0.5" id="app-cold" class="skill-input" style="width:100%" value="${item.insulationCold}">
          <div style="font-size:var(--f-xs); color:var(--text3); margin-top:2px">Base value before quality. Positive = warmer; expands cold comfort range.</div>
        </div>
        <div>
          <label class="editor-label">Heat Insulation base (°C)</label>
          <input type="number" step="0.5" id="app-heat-ins" class="skill-input" style="width:100%" value="${item.insulationHeat}">
          <div style="font-size:var(--f-xs); color:var(--text3); margin-top:2px">Base value before quality. Positive = cooler; expands heat comfort range. Usually negative on armour.</div>
        </div>

        <div style="grid-column:1/-1; border-top:1px solid var(--border); padding-top:14px; margin-top:4px">
          <div class="section-title section-title--sm">Body Part Coverage</div>
          <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(130px,1fr)); gap:2px; margin-top:8px">
            ${coverageCheckboxes}
          </div>
        </div>

        <div style="grid-column:1/-1; border-top:1px solid var(--border); padding-top:14px; margin-top:4px">
          <label class="editor-label">Notes (optional)</label>
          <textarea id="app-notes" class="skill-input" style="width:100%; min-height:60px; resize:vertical; padding:8px; font-family:inherit; text-align:left"
            placeholder="Describe the item's role or quirks...">${_escapeHtml(item.notes || '')}</textarea>
        </div>

      </div>`;

    modal.classList.add('show');
  },

  _toggleApparelCoverage(partId, checked) {
    if (!this.state.apparelEditing) return;
    const cov = this.state.apparelEditing.coverage || [];
    const idx = cov.indexOf(partId);
    if (checked && idx === -1) cov.push(partId);
    if (!checked && idx > -1) cov.splice(idx, 1);
    this.state.apparelEditing.coverage = cov;
  },

  closeApparelEditor() {
    const modal = document.getElementById('apparelModal');
    if (modal) modal.classList.remove('show');
    this.state.apparelEditing = null;
  },

  saveApparel() {
    const item = this.state.apparelEditing;
    if (!item) return;

    item.name     = document.getElementById('app-name')?.value.trim() || 'Unnamed Item';
    item.modSource = (document.getElementById('app-mod')?.value || '').trim();
    item.type     = document.getElementById('app-type')?.value || 'armour';
    item.layer    = document.getElementById('app-layer')?.value || 'middle';
    item.quality  = document.getElementById('app-quality')?.value || 'normal';
    item.mass     = parseFloat(document.getElementById('app-mass')?.value) || 0;
    item.notes    = document.getElementById('app-notes')?.value || '';

    item.stuffBased = document.getElementById('app-stuff-based')?.checked || false;
    item.stuff = document.getElementById('app-stuff')?.value || null;
    // Stuff multipliers and categories (only present when stuffBased)
    if (item.stuffBased) {
      item.stuffMultArmor = parseFloat(document.getElementById('app-stuff-armor')?.value) || 1;
      item.stuffMultInsulCold = parseFloat(document.getElementById('app-stuff-cold')?.value) || 0;
      item.stuffMultInsulHeat = parseFloat(document.getElementById('app-stuff-heat')?.value) || 0;
      const catChecks = document.querySelectorAll('.app-stuff-cat:checked');
      item.stuffCategories = [...catChecks].map(c => c.value);
    }
    item.armorSharp    = parseFloat(document.getElementById('app-sharp')?.value)    || 0;
    item.armorBlunt    = parseFloat(document.getElementById('app-blunt')?.value)    || 0;
    item.armorHeat     = parseFloat(document.getElementById('app-heat-arm')?.value) || 0;
    item.insulationCold = parseFloat(document.getElementById('app-cold')?.value)    || 0;
    item.insulationHeat = parseFloat(document.getElementById('app-heat-ins')?.value)|| 0;

    // Utility-specific fields (only present when type is utility)
    if (item.type === 'utility') {
      const utilCatEl = document.getElementById('app-util-cat');
      if (utilCatEl) {
        item.utilityCategory = utilCatEl.value || 'passive';
        item.shieldMax = parseFloat(document.getElementById('app-shield-max')?.value) || 0;
        item.shieldRecharge = parseFloat(document.getElementById('app-shield-rech')?.value) || 0;
        item.shieldLossPerDmg = parseFloat(document.getElementById('app-shield-loss')?.value) || 0.033;
        item.blocksRangedOut = document.getElementById('app-blocks-ranged')?.value !== 'false';
        item.charges = parseInt(document.getElementById('app-charges')?.value) || 0;
        item.range = parseFloat(document.getElementById('app-range')?.value) || 0;
        item.warmup = parseFloat(document.getElementById('app-warmup')?.value) || 0;
        item.radius = parseFloat(document.getElementById('app-radius')?.value) || 0;

        const rcd = parseFloat(document.getElementById('app-so-rcd')?.value) || 0;
        const mcd = parseFloat(document.getElementById('app-so-mcd')?.value) || 0;
        const acc = parseFloat(document.getElementById('app-so-acc')?.value) || 0;
        const aim = parseFloat(document.getElementById('app-so-aim')?.value) || 0;
        const offsets = { ...(item.statOffsets || {}) };
        const assignOffset = (key, value) => { if (value) offsets[key] = value; else delete offsets[key]; };
        assignOffset('rangedCooldownFactor', rcd);
        assignOffset('meleeCooldownFactor', mcd);
        assignOffset('shootingAccuracy', acc);
        assignOffset('aimingDelayFactor', aim);
        item.statOffsets = Object.keys(offsets).length > 0 ? offsets : undefined;
      }
      // Auto-set layer to belt for utility items
      item.layer = 'belt';
    }

    const idx = this.state.apparel.findIndex(x => x.id === item.id);
    if (idx > -1) this.state.apparel[idx] = item;
    else {
      if (!this._checkCap(this.state.apparel, 'apparel', 'apparel items')) return;
      this.state.apparel.push(item);
    }

    this.closeApparelEditor();
    this.renderApparel();
    this.triggerAutoSave();
    this.toast('Apparel Item Saved');
  },

  deleteApparel(id) {
    this.showConfirm('Remove this item from the lab?', 'Remove').then(() => {
      this.state.apparel = this.state.apparel.filter(x => x.id !== id);
      this.renderApparel();
      this.triggerAutoSave();
    }).catch(() => {});
  },

  deleteAllApparel() {
    const n = (this.state.apparel || []).length;
    if (!n) return;
    this.showConfirm(`Remove all ${n} item${n === 1 ? '' : 's'} from the apparel lab? This cannot be undone.`, 'Remove All').then(() => {
      this.state.apparel = [];
      this.renderApparel();
      this.triggerAutoSave();
      this.toast('Cleared all apparel from the lab');
    }).catch(() => {});
  },

  resetApparelToDefaults() {
    this.showConfirm('Replace the current apparel list with the default vanilla set? Any custom or scanned items will be removed.', 'Reset').then(() => {
      this.state.apparel = JSON.parse(JSON.stringify(DEFAULT_APPAREL));
      this.renderApparel();
      this.triggerAutoSave();
      this.toast('Apparel reset to defaults');
    }).catch(() => {});
  },

  // ── Mod Equipment Scanner ──

  scanModEquipment(mode, opts) {
    const silent = !!(opts && opts.silent);
    // Coalesce: never run two equipment scans at once - they share one progress channel and the
    // bar jumps between them ("spastic"). A user click adopts the running scan's progress toast;
    // a background prefetch just yields to whatever is already running.
    if (this._equipScanPromise) {
      if (!silent) this._adoptRunningEquipScan();
      return this._equipScanPromise;
    }
    const p = this._runModEquipmentScan(mode, silent);
    this._equipScanPromise = p;
    p.finally(() => { if (this._equipScanPromise === p) this._equipScanPromise = null; });
    return p;
  },

  // A scan is already in flight - surface ITS progress (re-point the listener to a visible
  // handler and close the toast when it finishes) instead of launching a clashing second scan.
  _adoptRunningEquipScan() {
    this._showScanToast('Scanning equipment');
    this._updateScanToast(0, 0, 'Reading mod files…');
    if (window.overlay && window.overlay.onModScanProgress) {
      window.overlay.onModScanProgress(d => this._updateScanToast(d.done, d.total,
        `Reading defs… ${(d.done || 0).toLocaleString()} / ${(d.total || 0).toLocaleString()} files`));
    }
    if (this._equipScanPromise) {
      this._equipScanPromise.then(() => this._closeScanToast('Mod equipment loaded.', false),
        () => this._closeScanToast('Scan finished.', false));
    }
  },

  async _runModEquipmentScan(mode, silent) {
    if (!window.overlay?.scanModEquipment) {
      if (!silent) this.toast('Scanner not available - requires Electron');
      return;
    }

    // Determine install path - use stored or auto-detect
    let installPath = this.state.settings.rimworldPath;
    if (!installPath) {
      if (silent) return; // never pop a folder dialog during a background prefetch
      installPath = await window.overlay.pickDirectory();
      if (!installPath) return;
      this.state.settings.rimworldPath = installPath;
      this.triggerAutoSave();
    }

    // Disable every equipment-scan button while scanning (Weapons, Apparel and the Loadouts
    // "scan both" pill); all progress/result feedback goes through the shared scan toast.
    const scanBtnIds = ['scanModWeaponsBtn', 'scanModApparelBtn', 'scanLoadoutModsBtn'];
    const setScanBtns = (disabled) => scanBtnIds.forEach(id => { const b = document.getElementById(id); if (b) b.disabled = disabled; });
    setScanBtns(true);

    // Toast helpers: silent for the background prefetch, visible for a user-initiated scan.
    const showT = (t) => { if (!silent) this._showScanToast(t); };
    const updT = (d, t, l) => { if (!silent) this._updateScanToast(d, t, l); };
    const closeT = (m, e) => { if (!silent) this._closeScanToast(m, e); };
    showT('Scanning equipment');
    updT(0, 0, 'Finding mod files…');

    const progressHandler = (data) => {
      updT(data.done, data.total,
        `Reading defs… ${(data.done || 0).toLocaleString()} / ${(data.total || 0).toLocaleString()} files`);
    };
    if (window.overlay.onModScanProgress) {
      window.overlay.onModScanProgress(progressHandler);
    }

    try {
      const result = await window.overlay.scanModEquipment(installPath, { background: silent });
      if (result.error) {
        closeT('Scan failed: ' + result.error, true);
        return;
      }

      // Only merge the type the user requested
      const scanned = result.totalScanned || 0;
      const parts = [];

      // Always merge materials if any were found
      if (result.materials && result.materials.length > 0) {
        this._mergeScannedMaterials(result.materials);
        const mm = this._lastScanMerged;
        parts.push(`Materials: ${mm.added} added, ${mm.updated} updated`);
      }

      if (mode === 'weapons' || mode === 'both') {
        this._mergeScannedWeapons(result.weapons);
        const wm = this._lastScanMerged;
        parts.push(`Weapons: ${wm.added} added, ${wm.updated} updated`);
        this.renderArmoury();
      }
      if (mode === 'apparel' || mode === 'both') {
        this._mergeScannedApparel(result.apparel);
        const am = this._lastScanMerged;
        parts.push(`Apparel: ${am.added} added, ${am.updated} updated`);
        this.renderArmoury(); // refresh through the unified sub-tab dispatcher
      }

      closeT(`Scanned ${scanned} files. ${parts.join(' · ')}`, false);

      this.triggerAutoSave();
    } catch (err) {
      closeT('Scan error: ' + (err.message || err), true);
    } finally {
      // re-fetch by id: renderArmoury may have rebuilt the buttons during the merge.
      setScanBtns(false);
    }
  },

  _mergeScannedWeapons(scannedWeapons) {
    if (!scannedWeapons || scannedWeapons.length === 0) {
      this._lastScanMerged = { added: 0, updated: 0, skipped: 0 };
      return;
    }

    const existing = this.state.weapons;
    const existingByDef = {};
    const existingByName = {};
    for (const w of existing) {
      if (w.defName) existingByDef[w.defName] = w;
      existingByName[w.name.toLowerCase()] = w;
    }

    let added = 0, updated = 0, skipped = 0;

    for (const sw of scannedWeapons) {
      if (!sw.name || (!sw.damage && sw.type !== 'melee')) { skipped++; continue; }

      // Skip if it matches a built-in by name (vanilla/DLC items already in defaults)
      const nameKey = sw.name.toLowerCase();
      const existDef = sw.defName ? existingByDef[sw.defName] : null;
      const existName = existingByName[nameKey];

      if (existDef) {
        // Already have this defName - update if it came from a mod scan (has defName on existing)
        if (existDef.defName && existDef.modSource) {
          Object.assign(existDef, sw, { id: existDef.id, quality: existDef.quality });
          updated++;
        } else {
          skipped++; // built-in item, don't overwrite
        }
      } else if (existName && !existName.modSource) {
        skipped++; // built-in with same name
      } else if (existName && existName.modSource) {
        Object.assign(existName, sw, { id: existName.id, quality: existName.quality });
        updated++;
      } else {
        existing.push(sw);
        added++;
      }
    }

    this._lastScanMerged = { added, updated, skipped };
  },

  _mergeScannedApparel(scannedApparel) {
    if (!scannedApparel || scannedApparel.length === 0) {
      this._lastScanMerged = { added: 0, updated: 0, skipped: 0 };
      return;
    }

    const existing = this.state.apparel;
    const existingByDef = {};
    const existingByName = {};
    for (const a of existing) {
      if (a.defName) existingByDef[a.defName] = a;
      existingByName[a.name.toLowerCase()] = a;
    }

    let added = 0, updated = 0, skipped = 0;

    for (const sa of scannedApparel) {
      if (!sa.name) { skipped++; continue; }

      const nameKey = sa.name.toLowerCase();
      const existDef = sa.defName ? existingByDef[sa.defName] : null;
      const existName = existingByName[nameKey];

      if (existDef) {
        if (existDef.defName && existDef.modSource) {
          Object.assign(existDef, sa, { id: existDef.id, quality: existDef.quality });
          updated++;
        } else {
          skipped++;
        }
      } else if (existName && !existName.modSource) {
        skipped++;
      } else if (existName && existName.modSource) {
        Object.assign(existName, sa, { id: existName.id, quality: existName.quality });
        updated++;
      } else {
        existing.push(sa);
        added++;
      }
    }

    this._lastScanMerged = { added, updated, skipped };
  },

  _mergeScannedMaterials(scannedMaterials) {
    if (!scannedMaterials || scannedMaterials.length === 0) {
      this._lastScanMerged = { added: 0, updated: 0, skipped: 0 };
      return;
    }

    const existing = this.state.materials;
    const existingById = {};
    for (const m of existing) {
      existingById[m.id] = m;
    }

    let added = 0, updated = 0, skipped = 0;

    for (const sm of scannedMaterials) {
      if (!sm.id || !sm.label) { skipped++; continue; }

      const exist = existingById[sm.id];
      if (exist) {
        if (exist.modSource) {
          // Update mod material with fresh scan data
          Object.assign(exist, sm);
          updated++;
        } else {
          skipped++; // vanilla material, don't overwrite
        }
      } else {
        existing.push(sm);
        existingById[sm.id] = sm;
        added++;
      }
    }

    this._lastScanMerged = { added, updated, skipped };
  },

  clearModItems(type) {
    if (type === 'weapons') {
      this.showConfirm('Remove all mod-scanned weapons? Built-in weapons will remain.', 'Clear Mod Weapons').then(() => {
        this.state.weapons = this.state.weapons.filter(w => !w.modSource);
        this.renderArmoury();
        this.triggerAutoSave();
        this.toast('Mod weapons cleared');
      }).catch(() => {});
    } else if (type === 'materials') {
      this.showConfirm('Remove all mod-scanned materials? Built-in materials will remain.', 'Clear Mod Materials').then(() => {
        this.state.materials = this.state.materials.filter(m => !m.modSource);
        this.triggerAutoSave();
        this.toast('Mod materials cleared');
      }).catch(() => {});
    } else {
      this.showConfirm('Remove all mod-scanned apparel? Built-in items will remain.', 'Clear Mod Apparel').then(() => {
        this.state.apparel = this.state.apparel.filter(a => !a.modSource);
        this.renderApparel();
        this.triggerAutoSave();
        this.toast('Mod apparel cleared');
      }).catch(() => {});
    }
  },
});

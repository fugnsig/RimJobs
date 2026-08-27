const BIOMES = [
  { id: 'none',                label: '- None -',              icon: '' },
  { id: 'temperate_forest',    label: 'Temperate Forest',       icon: '' },
  { id: 'boreal_forest',       label: 'Boreal Forest',          icon: '' },
  { id: 'tropical_rainforest', label: 'Tropical Rainforest',    icon: '' },
  { id: 'arid_shrubland',      label: 'Arid Shrubland',         icon: '' },
  { id: 'desert',              label: 'Desert',                 icon: '' },
  { id: 'tundra',              label: 'Tundra',                 icon: '' },
  { id: 'ice_sheet',           label: 'Ice Sheet',              icon: '' },
  { id: 'sea_ice',             label: 'Sea Ice',                icon: '' },
];

const TIMELINE_CATEGORIES = [
  { id: 'raid',      label: 'Raid',      icon: 'R', color: '#f0857a' },
  { id: 'recruit',   label: 'Recruit',   icon: '+',       color: '#7de85a' },
  { id: 'death',     label: 'Death',     icon: '†', color: '#e05555' },
  { id: 'build',     label: 'Build',     icon: 'B', color: '#e8c55a' },
  { id: 'milestone', label: 'Milestone', icon: '★',       color: '#73b8f5' },
  { id: 'trade',     label: 'Trade',     icon: '$', color: '#d4aa50' },
  { id: 'custom',    label: 'Custom',    icon: '•', color: '#c97af5' },
];

const QUADRUMS = ['Aprimay', 'Jugust', 'Septober', 'Decembary'];

/**
 * STATIC DATA FOR RIMWORLD PRIORITY CALCULATOR
 * Includes Jobs, Skills, Xenotypes, and Traits.
 */

const AVATARS = [
  {bg:'#1e2d4a',color:'#73b8f5'},{bg:'#1a2d18',color:'#7de85a'},
  {bg:'#2d2010',color:'#e8a838'},{bg:'#2d1010',color:'#f0857a'},
  {bg:'#2d102d',color:'#e57af0'},{bg:'#102d2d',color:'#7af0e5'},
  {bg:'#1e1e1e',color:'#ffffff'},{bg:'#3d3d3d',color:'#aaaaaa'},
];

const AVATAR_ICONS = [
  { id: 'pawn', char: 'P', label: 'Colonist' },
  { id: 'leader', char: 'L', label: 'Leader' },
  { id: 'guard', char: 'G', label: 'Guard' },
  { id: 'doc', char: 'D', label: 'Doctor' },
  { id: 'grow', char: 'Gr', label: 'Grower' },
  { id: 'mine', char: 'M', label: 'Miner' },
  { id: 'craft', char: 'C', label: 'Crafter' },
  { id: 'intel', char: 'T', label: 'Thinker' },
  { id: 'social', char: 'S', label: 'Speaker' },
  { id: 'animal', char: 'H', label: 'Handler' },
];

// Quality multipliers match vanilla RimWorld XML values.
// All three stats (accuracy, damage, AP) scale uniformly per tier.
// Source: rimworldwiki.com/wiki/Quality & rimworldwiki.com/wiki/Weapons
// Quality multipliers sourced from RimWorld StatDefs (AccuracyTouch, RangedWeapon_DamageMultiplier,
// MeleeWeapon_DamageMultiplier). Ranged and melee have DIFFERENT damage/AP quality curves.
// acc: AccuracyTouch/Short/Medium/Long quality factor (shared by all four accuracy stats)
// rangedDmg: RangedWeapon_DamageMultiplier quality factor (applied to projectile damage)
// meleeDmg: MeleeWeapon_DamageMultiplier quality factor (applied to tool power AND melee AP)
const WEAPON_QUALITIES = [
  { id: 'awful',      label: 'Awful',      acc: 0.80, rangedDmg: 0.90, meleeDmg: 0.80, color: '#d14040' },
  { id: 'poor',       label: 'Poor',       acc: 0.90, rangedDmg: 1.00, meleeDmg: 0.90, color: '#c4a87a' },
  { id: 'normal',     label: 'Normal',     acc: 1.00, rangedDmg: 1.00, meleeDmg: 1.00, color: '#e8e9eb' },
  { id: 'good',       label: 'Good',       acc: 1.10, rangedDmg: 1.00, meleeDmg: 1.10, color: '#6cc66c' },
  { id: 'excellent',  label: 'Excellent',  acc: 1.20, rangedDmg: 1.00, meleeDmg: 1.20, color: '#6688cc' },
  { id: 'masterwork', label: 'Masterwork', acc: 1.35, rangedDmg: 1.25, meleeDmg: 1.45, color: '#b477d4' },
  { id: 'legendary',  label: 'Legendary',  acc: 1.50, rangedDmg: 1.50, meleeDmg: 1.65, color: '#e8c55a' }
];

// ─── APPAREL SYSTEM ──────────────────────────────────────────────────────────
// Armour in RimWorld is calculated per-hit via a probabilistic two-stage check:
//   - Roll random 0-100 vs effective armour (base rating − weapon AP).
//   - If roll < effectiveArmor/2  → damage deflected harmlessly.
//   - If roll < effectiveArmor    → damage halved (and converted to Blunt if Sharp).
//   - If roll ≥ effectiveArmor    → no effect.
// Layers are processed outermost-first: Eyes > Headgear > Belt > Outer > Middle > Skin.
// Each layer rolls independently; mitigation stacks multiplicatively across layers.
// Sharp/Blunt/Heat ratings are stored as decimals (0.0-2.0 = 0%-200%).
// Insulation values (°C) offset the pawn's comfortable temperature range.
// Utility slot items (shield belt) use Max Energy, not HP, and scale with quality.
// NOTE: If a Sharp hit is halved by any layer, ALL subsequent layers still use
//       their Sharp rating (not Blunt) for their own independent roll.
// NOTE: Heat armor that doesn't fully negate flame damage still allows ignition.
//
// APPAREL quality multipliers differ from weapon multipliers (source: wiki):
//   Armor ratings:   base × quality mult (scale: awful=0.5 → legendary=1.8)
//   Insulation:      base × quality mult (same scale)
//   Shield energy:   base × quality mult (same scale)

// Apparel quality multipliers - armor and insulation scale DIFFERENTLY.
// Source: rimworldwiki.com/wiki/Apparel#Quality_effects
// armorMult applies to Sharp/Blunt/Heat ratings and shield energy.
// insulMult applies to cold/heat insulation values.
const APPAREL_QUALITIES = [
  { id: 'awful',      label: 'Awful',      armorMult: 0.60, insulMult: 0.80, color: '#d14040' },
  { id: 'poor',       label: 'Poor',       armorMult: 0.80, insulMult: 0.90, color: '#c4a87a' },
  { id: 'normal',     label: 'Normal',     armorMult: 1.00, insulMult: 1.00, color: '#e8e9eb' },
  { id: 'good',       label: 'Good',       armorMult: 1.15, insulMult: 1.10, color: '#6cc66c' },
  { id: 'excellent',  label: 'Excellent',  armorMult: 1.30, insulMult: 1.20, color: '#6688cc' },
  { id: 'masterwork', label: 'Masterwork', armorMult: 1.45, insulMult: 1.50, color: '#b477d4' },
  { id: 'legendary',  label: 'Legendary',  armorMult: 1.80, insulMult: 1.80, color: '#e8c55a' }
];

// Layer order matches RimWorld's damage-processing sequence: outermost first.
// Eyes > Headgear > Belt > Outer > Middle > Skin
// Damage is checked against each layer in this order until stopped or exhausted.
const APPAREL_LAYERS = [
  { id: 'outer',   label: 'Outer',    hint: 'Outermost layer - processed first vs incoming hits (e.g. plate armour, dusters). Displayed on top of pawn sprite.' },
  { id: 'head',    label: 'Headgear', hint: 'Head slot - processed before belt/outer for head hits (e.g. helmets, cowboy hats).' },
  { id: 'belt',    label: 'Belt',     hint: 'Belt/utility slot - processed after headgear, before middle (e.g. shield belt). Only one utility item at a time.' },
  { id: 'middle',  label: 'Middle',   hint: 'Middle layer - processed after outer (e.g. flak vest, flak jacket).' },
  { id: 'skin',    label: 'Skin',     hint: 'Innermost layer - processed last (e.g. t-shirts, pants). Lowest priority for damage absorption.' },
];

const APPAREL_COVERAGE = [
  { id: 'torso',      label: 'Torso' },
  { id: 'neck',       label: 'Neck' },
  { id: 'left_arm',   label: 'Left Arm' },
  { id: 'right_arm',  label: 'Right Arm' },
  { id: 'left_hand',  label: 'Left Hand' },
  { id: 'right_hand', label: 'Right Hand' },
  { id: 'left_leg',   label: 'Left Leg' },
  { id: 'right_leg',  label: 'Right Leg' },
  { id: 'left_foot',  label: 'Left Foot' },
  { id: 'right_foot', label: 'Right Foot' },
  { id: 'head',       label: 'Head' },
  { id: 'eyes',       label: 'Eyes' },
  { id: 'ears',       label: 'Ears' },
  { id: 'mouth',      label: 'Mouth' },
];

// ========== STUFF CATEGORIES & VANILLA MATERIALS ==========
// Each material defines stats applied to stuff-based weapons/apparel.
// Weapons: sharpDmg/bluntDmg multiply melee tool damage per damage type,
//   meleeCooldown is a statFactor on MeleeWeapon_CooldownMultiplier (multiplies cooldown).
//   Ranged weapon damage is NOT affected by stuff (only quality).
// Apparel: armorSharp/Blunt/Heat are StuffPower values multiplied by the item's
//   StuffEffectMultiplierArmor. insulCold/insulHeat similarly use StuffEffectMultiplierInsulation_*.
// Verified against Core XML (Items_Resource_Stuff.xml, Items_Resource_Stuff_Leather.xml).
const STUFF_CATEGORIES = ['Fabric', 'Leathery', 'Metallic', 'Woody', 'Stony'];

const DEFAULT_MATERIALS = [
  // -- Metals (Metallic) --
  { id: 'Silver',   label: 'Silver',   categories: ['Metallic'], sharpDmg: 0.85, bluntDmg: 1.0,  meleeCooldown: 1.0, armorSharp: 0.72, armorBlunt: 0.36, armorHeat: 0.36, insulCold: 3,  insulHeat: 0 },
  { id: 'Gold',     label: 'Gold',     categories: ['Metallic'], sharpDmg: 0.75, bluntDmg: 1.0,  meleeCooldown: 1.0, armorSharp: 0.72, armorBlunt: 0.36, armorHeat: 0.36, insulCold: 3,  insulHeat: 0 },
  { id: 'Steel',    label: 'Steel',    categories: ['Metallic'], sharpDmg: 1.0,  bluntDmg: 1.0,  meleeCooldown: 1.0, armorSharp: 0.90, armorBlunt: 0.45, armorHeat: 0.60, insulCold: 3,  insulHeat: 0 },
  { id: 'Plasteel', label: 'Plasteel', categories: ['Metallic'], sharpDmg: 1.1,  bluntDmg: 0.9,  meleeCooldown: 0.8, armorSharp: 1.14, armorBlunt: 0.55, armorHeat: 0.65, insulCold: 3,  insulHeat: 0 },
  { id: 'Uranium',  label: 'Uranium',  categories: ['Metallic'], sharpDmg: 1.1,  bluntDmg: 1.5,  meleeCooldown: 1.1, armorSharp: 1.08, armorBlunt: 0.54, armorHeat: 0.65, insulCold: 3,  insulHeat: 0 },
  // -- Wood (Woody) --
  { id: 'WoodLog',  label: 'Wood',     categories: ['Woody'],    sharpDmg: 0.40, bluntDmg: 0.9,  meleeCooldown: 1.0, armorSharp: 0.54, armorBlunt: 0.54, armorHeat: 0.40, insulCold: 8,  insulHeat: 4 },
  // -- Stone (Stony) --
  { id: 'Jade',     label: 'Jade',     categories: ['Stony'],    sharpDmg: 1.0,  bluntDmg: 1.5,  meleeCooldown: 1.3, armorSharp: 0.90, armorBlunt: 0.45, armorHeat: 0.54, insulCold: 3,  insulHeat: 0 },
  // -- Fabrics (Fabric) --
  { id: 'Cloth',             label: 'Cloth',       categories: ['Fabric'],   sharpDmg: 1.0, bluntDmg: 1.0, meleeCooldown: 1.0, armorSharp: 0.36, armorBlunt: 0.00, armorHeat: 0.18, insulCold: 18, insulHeat: 18 },
  { id: 'Synthread',         label: 'Synthread',   categories: ['Fabric'],   sharpDmg: 1.0, bluntDmg: 1.0, meleeCooldown: 1.0, armorSharp: 0.94, armorBlunt: 0.26, armorHeat: 0.90, insulCold: 22, insulHeat: 22 },
  { id: 'DevilstrandCloth',  label: 'Devilstrand', categories: ['Fabric'],   sharpDmg: 1.0, bluntDmg: 1.0, meleeCooldown: 1.0, armorSharp: 1.40, armorBlunt: 0.36, armorHeat: 3.00, insulCold: 20, insulHeat: 24 },
  { id: 'Hyperweave',        label: 'Hyperweave',  categories: ['Fabric'],   sharpDmg: 1.0, bluntDmg: 1.0, meleeCooldown: 1.0, armorSharp: 2.00, armorBlunt: 0.54, armorHeat: 2.88, insulCold: 26, insulHeat: 26 },
  // -- Leathers (Leathery) - base stats from LeatherBase, overrides per hide --
  { id: 'Leather_Plain',     label: 'Plainleather',    categories: ['Leathery'], sharpDmg: 1.0, bluntDmg: 1.0, meleeCooldown: 1.0, armorSharp: 0.81, armorBlunt: 0.24, armorHeat: 1.50, insulCold: 16, insulHeat: 16 },
  { id: 'Leather_Wolf',      label: 'Wolfskin',        categories: ['Leathery'], sharpDmg: 1.0, bluntDmg: 1.0, meleeCooldown: 1.0, armorSharp: 1.02, armorBlunt: 0.24, armorHeat: 1.50, insulCold: 24, insulHeat: 16 },
  { id: 'Leather_Bear',      label: 'Bearskin',        categories: ['Leathery'], sharpDmg: 1.0, bluntDmg: 1.0, meleeCooldown: 1.0, armorSharp: 1.02, armorBlunt: 0.24, armorHeat: 1.50, insulCold: 24, insulHeat: 16 },
  { id: 'Leather_Thrumbo',   label: 'Thrumbofur',      categories: ['Leathery'], sharpDmg: 1.0, bluntDmg: 1.0, meleeCooldown: 1.0, armorSharp: 1.60, armorBlunt: 0.48, armorHeat: 3.00, insulCold: 34, insulHeat: 18 },
  // -- Wools (Fabric, inherit WoolBase) --
  { id: 'WoolSheep',         label: 'Sheep Wool',      categories: ['Fabric'],   sharpDmg: 1.0, bluntDmg: 1.0, meleeCooldown: 1.0, armorSharp: 0.36, armorBlunt: 0.00, armorHeat: 1.10, insulCold: 26, insulHeat: 10 },
  { id: 'WoolMuffalo',       label: 'Muffalo Wool',    categories: ['Fabric'],   sharpDmg: 1.0, bluntDmg: 1.0, meleeCooldown: 1.0, armorSharp: 0.36, armorBlunt: 0.00, armorHeat: 1.10, insulCold: 28, insulHeat: 12 },
  { id: 'WoolMegasloth',     label: 'Megasloth Wool',  categories: ['Fabric'],   sharpDmg: 1.0, bluntDmg: 1.0, meleeCooldown: 1.0, armorSharp: 0.80, armorBlunt: 0.00, armorHeat: 1.10, insulCold: 34, insulHeat: 12 },
  { id: 'WoolAlpaca',        label: 'Alpaca Wool',     categories: ['Fabric'],   sharpDmg: 1.0, bluntDmg: 1.0, meleeCooldown: 1.0, armorSharp: 0.36, armorBlunt: 0.00, armorHeat: 1.10, insulCold: 30, insulHeat: 16 },
];

// Look up a material by id from a combined materials array (DEFAULT_MATERIALS + mod materials).
// Returns the material object or null if not found.
function findMaterial(materialId, allMaterials) {
  if (!materialId) return null;
  return (allMaterials || DEFAULT_MATERIALS).find(m => m.id === materialId) || null;
}

// Get available materials for an item based on its stuffCategories.
// Returns materials whose categories overlap with the item's allowed categories.
function getAvailableMaterials(item, allMaterials) {
  const cats = item.stuffCategories;
  if (!cats || cats.length === 0) return [];
  const mats = allMaterials || DEFAULT_MATERIALS;
  return mats.filter(m => m.categories && m.categories.some(c => cats.includes(c)));
}

// ========== VANILLA WEAPONS ==========
// Extracted from RimWorld Core/Defs - stats at normal quality, no material modifiers.
// For melee weapons: damage/cooldown are from primary attack tool (highest DPS).
// AP for bullets defaults to damage * 0.015 unless armorPenetrationBase is specified.
const DEFAULT_WEAPONS = [
  // -- Neolithic Ranged --
  { id: 'v_short_bow',    name: 'Short Bow',        quality: 'normal', type: 'ranged', damage: 11, warmup: 1.35, cooldown: 1.65, burstCount: 1, burstTicks: 0, accuracyTouch: 0.75, accuracyShort: 0.65, accuracyMedium: 0.45, accuracyLong: 0.25, range: 22.9, ap: 0.165 },
  { id: 'v_recurve_bow',  name: 'Recurve Bow',      quality: 'normal', type: 'ranged', damage: 14, warmup: 1.45, cooldown: 1.65, burstCount: 1, burstTicks: 0, accuracyTouch: 0.70, accuracyShort: 0.78, accuracyMedium: 0.65, accuracyLong: 0.35, range: 25.9, ap: 0.21 },
  { id: 'v_greatbow',     name: 'Greatbow',         quality: 'normal', type: 'ranged', damage: 17, warmup: 2.0,  cooldown: 1.5,  burstCount: 1, burstTicks: 0, accuracyTouch: 0.65, accuracyShort: 0.85, accuracyMedium: 0.75, accuracyLong: 0.50, range: 29.9, ap: 0.15 },
  { id: 'v_pila',         name: 'Pila',             quality: 'normal', type: 'ranged', damage: 25, warmup: 4.0,  cooldown: 2.5,  burstCount: 1, burstTicks: 0, accuracyTouch: 0.80, accuracyShort: 0.71, accuracyMedium: 0.50, accuracyLong: 0.32, range: 18.9, ap: 0.10 },
  // -- Industrial Ranged --
  { id: 'v_revolver',     name: 'Revolver',         quality: 'normal', type: 'ranged', damage: 12, warmup: 0.3,  cooldown: 1.6,  burstCount: 1, burstTicks: 0, accuracyTouch: 0.80, accuracyShort: 0.75, accuracyMedium: 0.55, accuracyLong: 0.40, range: 25.9, ap: 0.18 },
  { id: 'v_autopistol',   name: 'Autopistol',       quality: 'normal', type: 'ranged', damage: 10, warmup: 0.3,  cooldown: 1.0,  burstCount: 1, burstTicks: 0, accuracyTouch: 0.80, accuracyShort: 0.70, accuracyMedium: 0.40, accuracyLong: 0.30, range: 25.9, ap: 0.15 },
  { id: 'v_machine_pistol', name: 'Machine Pistol', quality: 'normal', type: 'ranged', damage: 6,  warmup: 0.5,  cooldown: 0.9,  burstCount: 3, burstTicks: 7,  accuracyTouch: 0.90, accuracyShort: 0.65, accuracyMedium: 0.35, accuracyLong: 0.15, range: 19.9, ap: 0.09 },
  { id: 'v_bolt_action',  name: 'Bolt-Action Rifle', quality: 'normal', type: 'ranged', damage: 18, warmup: 1.7,  cooldown: 1.5,  burstCount: 1, burstTicks: 0, accuracyTouch: 0.65, accuracyShort: 0.80, accuracyMedium: 0.90, accuracyLong: 0.80, range: 36.9, ap: 0.27 },
  { id: 'v_pump_shotgun', name: 'Pump Shotgun',     quality: 'normal', type: 'ranged', damage: 18, warmup: 0.9,  cooldown: 1.25, burstCount: 1, burstTicks: 0, accuracyTouch: 0.80, accuracyShort: 0.87, accuracyMedium: 0.77, accuracyLong: 0.64, range: 15.9, ap: 0.14 },
  { id: 'v_chain_shotgun', name: 'Chain Shotgun',   quality: 'normal', type: 'ranged', damage: 18, warmup: 1.2,  cooldown: 1.35, burstCount: 3, burstTicks: 10, accuracyTouch: 0.57, accuracyShort: 0.64, accuracyMedium: 0.55, accuracyLong: 0.45, range: 12.9, ap: 0.14 },
  { id: 'v_heavy_smg',    name: 'Heavy SMG',        quality: 'normal', type: 'ranged', damage: 12, warmup: 0.9,  cooldown: 1.65, burstCount: 3, burstTicks: 11, accuracyTouch: 0.85, accuracyShort: 0.65, accuracyMedium: 0.35, accuracyLong: 0.20, range: 22.9, ap: 0.18 },
  { id: 'v_lmg',          name: 'LMG',              quality: 'normal', type: 'ranged', damage: 12, warmup: 1.8,  cooldown: 1.6,  burstCount: 6, burstTicks: 7,  accuracyTouch: 0.40, accuracyShort: 0.48, accuracyMedium: 0.35, accuracyLong: 0.26, range: 25.9, ap: 0.18 },
  { id: 'v_assault_rifle', name: 'Assault Rifle',   quality: 'normal', type: 'ranged', damage: 11, warmup: 1.0,  cooldown: 1.7,  burstCount: 3, burstTicks: 10, accuracyTouch: 0.60, accuracyShort: 0.70, accuracyMedium: 0.65, accuracyLong: 0.55, range: 30.9, ap: 0.165 },
  { id: 'v_sniper_rifle', name: 'Sniper Rifle',     quality: 'normal', type: 'ranged', damage: 25, warmup: 3.5,  cooldown: 1.5,  burstCount: 1, burstTicks: 0, accuracyTouch: 0.50, accuracyShort: 0.70, accuracyMedium: 0.88, accuracyLong: 0.90, range: 44.9, ap: 0.375 },
  { id: 'v_minigun',      name: 'Minigun',          quality: 'normal', type: 'ranged', damage: 10, warmup: 2.5,  cooldown: 1.5,  burstCount: 25, burstTicks: 5, accuracyTouch: 0.20, accuracyShort: 0.25, accuracyMedium: 0.25, accuracyLong: 0.18, range: 30.9, ap: 0.15 },
  { id: 'v_incendiary_launcher', name: 'Incendiary Launcher', quality: 'normal', type: 'ranged', damage: 0, warmup: 3.5, cooldown: 3.5, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 23.9, ap: 0, notes: 'AoE fire. Forced miss radius 1.9.' },
  { id: 'v_smoke_launcher', name: 'Smoke Launcher', quality: 'normal', type: 'ranged', damage: 0, warmup: 3.5, cooldown: 4.5, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 23.9, ap: 0, notes: 'Blocks line of sight. Forced miss radius 1.9.' },
  { id: 'v_emp_launcher',  name: 'EMP Launcher',    quality: 'normal', type: 'ranged', damage: 0, warmup: 3.5, cooldown: 3.5, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 23.9, ap: 0, notes: 'Stuns mechanoids and shields. Forced miss radius 1.9.' },
  // -- Spacer Ranged --
  { id: 'v_charge_rifle', name: 'Charge Rifle',     quality: 'normal', type: 'ranged', damage: 16, warmup: 1.0,  cooldown: 2.0,  burstCount: 3, burstTicks: 12, accuracyTouch: 0.55, accuracyShort: 0.64, accuracyMedium: 0.55, accuracyLong: 0.45, range: 27.9, ap: 0.35 },
  { id: 'v_charge_lance', name: 'Charge Lance',     quality: 'normal', type: 'ranged', damage: 30, warmup: 1.7,  cooldown: 2.7,  burstCount: 1, burstTicks: 0, accuracyTouch: 0.65, accuracyShort: 0.85, accuracyMedium: 0.85, accuracyLong: 0.75, range: 32.9, ap: 0.45 },
  // -- Grenades --
  { id: 'v_frag_grenades', name: 'Frag Grenades',   quality: 'normal', type: 'ranged', damage: 0, warmup: 1.5, cooldown: 2.66, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 12.9, ap: 0, notes: 'AoE bomb. Radius 1.9. Fuse delay 100 ticks.' },
  { id: 'v_molotov',      name: 'Molotov Cocktails', quality: 'normal', type: 'ranged', damage: 0, warmup: 1.5, cooldown: 2.66, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 12.9, ap: 0, notes: 'AoE fire. Radius 1.1. Incendiary.' },
  { id: 'v_emp_grenades', name: 'EMP Grenades',     quality: 'normal', type: 'ranged', damage: 0, warmup: 1.5, cooldown: 2.66, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 12.9, ap: 0, notes: 'AoE EMP. Radius 3.5. Stuns mechanoids.' },
  // -- Neolithic Melee --
  // stuffBased: true = stats affected by material choice. stuffCategories = allowed stuff types.
  // meleeDamageType: 'sharp' (stab/cut) or 'blunt' - determines which stuff multiplier applies.
  // stuff: currently selected material id (null = no material / use base stats).
  { id: 'v_club',         name: 'Club',             quality: 'normal', type: 'melee', damage: 14, warmup: 0, cooldown: 2.0, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 0, ap: 0.21, stuffBased: true, stuffCategories: ['Metallic', 'Woody', 'Stony'], meleeDamageType: 'blunt', stuff: null, notes: 'Blunt. Neolithic.' },
  { id: 'v_knife',        name: 'Knife',            quality: 'normal', type: 'melee', damage: 13, warmup: 0, cooldown: 2.0, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 0, ap: 0.195, stuffBased: true, stuffCategories: ['Metallic'], meleeDamageType: 'sharp', stuff: null, notes: 'Stab. Fast blade attack at 12 dmg / 1.5s cooldown.' },
  { id: 'v_ikwa',         name: 'Ikwa',             quality: 'normal', type: 'melee', damage: 15, warmup: 0, cooldown: 2.0, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 0, ap: 0.225, stuffBased: true, stuffCategories: ['Metallic', 'Woody'], meleeDamageType: 'sharp', stuff: null, notes: 'Stab/Cut. Neolithic short spear.' },
  { id: 'v_spear',        name: 'Spear',            quality: 'normal', type: 'melee', damage: 23, warmup: 0, cooldown: 2.6, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 0, ap: 0.50, stuffBased: true, stuffCategories: ['Metallic', 'Woody'], meleeDamageType: 'sharp', stuff: null, notes: 'Stab. High AP. Good vs armoured targets.' },
  // -- Medieval Melee --
  { id: 'v_mace',         name: 'Mace',             quality: 'normal', type: 'melee', damage: 15.7, warmup: 0, cooldown: 2.0, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 0, ap: 0.236, stuffBased: true, stuffCategories: ['Metallic'], meleeDamageType: 'blunt', stuff: null, notes: 'Blunt. Good vs armoured targets.' },
  { id: 'v_gladius',      name: 'Gladius',          quality: 'normal', type: 'melee', damage: 16, warmup: 0, cooldown: 2.0, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 0, ap: 0.24, stuffBased: true, stuffCategories: ['Metallic'], meleeDamageType: 'sharp', stuff: null, notes: 'Stab/Cut. Light and nimble.' },
  { id: 'v_longsword',    name: 'Longsword',        quality: 'normal', type: 'melee', damage: 23, warmup: 0, cooldown: 2.6, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 0, ap: 0.345, stuffBased: true, stuffCategories: ['Metallic'], meleeDamageType: 'sharp', stuff: null, notes: 'Stab/Cut. High damage, slow.' },
  // -- Royalty: Medieval Melee --
  { id: 'v_axe',          name: 'Axe',              quality: 'normal', type: 'melee', damage: 15, warmup: 0, cooldown: 2.0, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 0, ap: 0.225, stuffBased: true, stuffCategories: ['Metallic', 'Woody'], meleeDamageType: 'sharp', stuff: null, dlc: 'Royalty', notes: 'Cut. Medieval war axe.' },
  { id: 'v_warhammer',    name: 'Warhammer',        quality: 'normal', type: 'melee', damage: 20, warmup: 0, cooldown: 2.6, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 0, ap: 0.30, stuffBased: true, stuffCategories: ['Metallic'], meleeDamageType: 'blunt', stuff: null, dlc: 'Royalty', notes: 'Blunt. Heavy polearm. High damage, slow.' },
  // -- Royalty: Ultratech Melee (NOT stuff-based - fixed material) --
  { id: 'v_monosword',    name: 'Monosword',        quality: 'normal', type: 'melee', damage: 25, warmup: 0, cooldown: 2.0, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 0, ap: 0.90, meleeDamageType: 'sharp', dlc: 'Royalty', notes: 'Stab/Cut. Ultratech. Mono-molecular edge, extreme AP.' },
  { id: 'v_zeushammer',   name: 'Zeushammer',       quality: 'normal', type: 'melee', damage: 31, warmup: 0, cooldown: 3.0, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 0, ap: 0.465, meleeDamageType: 'blunt', dlc: 'Royalty', notes: 'Blunt + 9 EMP. Stuns mechs on hit.' },
  { id: 'v_plasmasword',  name: 'Plasmasword',      quality: 'normal', type: 'melee', damage: 21, warmup: 0, cooldown: 2.6, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 0, ap: 0.315, meleeDamageType: 'sharp', dlc: 'Royalty', notes: 'Stab/Cut + 10 Flame (50% chance). Ignites targets.' },
  // -- Royalty: Persona (Bladelink) Melee (NOT stuff-based) --
  { id: 'v_persona_mono', name: 'Persona Monosword', quality: 'normal', type: 'melee', damage: 27, warmup: 0, cooldown: 1.6, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 0, ap: 0.90, meleeDamageType: 'sharp', dlc: 'Royalty', notes: 'Bladelink. Faster than standard monosword. Bonds to wielder.' },
  { id: 'v_persona_zeus', name: 'Persona Zeushammer', quality: 'normal', type: 'melee', damage: 31, warmup: 0, cooldown: 2.2, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 0, ap: 0.465, meleeDamageType: 'blunt', dlc: 'Royalty', notes: 'Bladelink. Blunt + 9 EMP. Faster than standard. Bonds to wielder.' },
  { id: 'v_persona_plasma', name: 'Persona Plasmasword', quality: 'normal', type: 'melee', damage: 23, warmup: 0, cooldown: 2.0, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 0, ap: 0.345, meleeDamageType: 'sharp', dlc: 'Royalty', notes: 'Bladelink. Stab/Cut + 10 Flame (70% chance). Bonds to wielder.' },
  { id: 'v_eltex_staff',  name: 'Eltex Staff',      quality: 'normal', type: 'melee', damage: 12, warmup: 0, cooldown: 2.6, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 0, ap: 0.18, meleeDamageType: 'blunt', dlc: 'Royalty', notes: 'Blunt. +50% psychic sensitivity, +5/s neural heat recovery.' },
  // -- Core: Breach Melee --
  { id: 'v_breach_axe',   name: 'Breach Axe',       quality: 'normal', type: 'melee', damage: 7.5, warmup: 0, cooldown: 1.0, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 0, ap: 0.11, stuffBased: true, stuffCategories: ['Metallic', 'Woody', 'Stony'], meleeDamageType: 'blunt', stuff: null, notes: 'Demolish. Excels at destroying walls/doors. Weak vs pawns.' },
  // -- Biotech: Ranged --
  { id: 'v_tox_grenades', name: 'Tox Grenades',     quality: 'normal', type: 'ranged', damage: 0, warmup: 1.5, cooldown: 2.66, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 12.9, ap: 0, dlc: 'Biotech', notes: 'AoE tox gas. Radius 1.9. Burns lungs/eyes.' },
  { id: 'v_toxbomb_launcher', name: 'Toxbomb Launcher', quality: 'normal', type: 'ranged', damage: 0, warmup: 3.5, cooldown: 4.5, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 23.9, ap: 0, dlc: 'Biotech', notes: 'AoE tox gas launcher. Forced miss radius 1.9.' },
  // -- Anomaly: Ranged --
  { id: 'v_hellcat_rifle', name: 'Hellcat Rifle',    quality: 'normal', type: 'ranged', damage: 10, warmup: 1.1, cooldown: 1.70, burstCount: 3, burstTicks: 10, accuracyTouch: 0.60, accuracyShort: 0.70, accuracyMedium: 0.65, accuracyLong: 0.55, range: 26.9, ap: 0.15, dlc: 'Anomaly', notes: 'Burst rifle + bioferrite burner ability (2 charges).' },
  { id: 'v_incinerator',  name: 'Incinerator',      quality: 'normal', type: 'ranged', damage: 0, warmup: 0.5, cooldown: 3.0, burstCount: 20, burstTicks: 2, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 15.9, ap: 0, dlc: 'Anomaly', notes: 'Flame beam weapon. Min range 5.9. AoE fire cone.' },
  // -- Odyssey: Ranged --
  { id: 'v_beam_repeater', name: 'Beam Repeater',    quality: 'normal', type: 'ranged', damage: 5, warmup: 4.0, cooldown: 3.0, burstCount: 30, burstTicks: 10, accuracyTouch: 0.65, accuracyShort: 0.72, accuracyMedium: 0.65, accuracyLong: 0.60, range: 21.9, ap: 0.50, dlc: 'Odyssey', notes: 'Gamma laser burst. Pierces shields. -0.25 move speed. Heavy.' },
  // -- Core: Consumable Launchers --
  { id: 'v_triple_rocket', name: 'Triple Rocket Launcher', quality: 'normal', type: 'ranged', damage: 0, warmup: 4.5, cooldown: 4.5, burstCount: 3, burstTicks: 20, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 35.9, ap: 0, notes: 'Single-use. 3 explosive rockets. Radius 3.9. Forced miss 2.9.' },
  { id: 'v_doomsday_rocket', name: 'Doomsday Rocket Launcher', quality: 'normal', type: 'ranged', damage: 0, warmup: 4.5, cooldown: 4.5, burstCount: 1, burstTicks: 0, accuracyTouch: 0, accuracyShort: 0, accuracyMedium: 0, accuracyLong: 0, range: 35.9, ap: 0, notes: 'Single-use. Massive explosion. Radius 7.8. Starts fires.' },
];

// ========== VANILLA APPAREL ==========
// Extracted from RimWorld Core/Defs. Armour values at normal quality.
// Stuff-based items (cloth/leather/metal) show base multipliers, not final values.
const DEFAULT_APPAREL = [
  // -- Neolithic Clothing --
  // stuffBased items: armorSharp/Blunt/Heat and insulation are computed from material.
  // stuffMultArmor/InsulCold/InsulHeat = item-specific multipliers on material stats.
  // stuff: currently selected material id (null = use default reference material).
  { id: 'app_tribalwear',  name: 'Tribalwear',       type: 'clothing', layer: 'skin',   quality: 'normal', coverage: ['torso', 'legs'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.5, workToMake: 1800, movePenalty: 0, stuffBased: true, stuffCategories: ['Fabric', 'Leathery'], stuffMultArmor: 0.2, stuffMultInsulCold: 0.55, stuffMultInsulHeat: 0.55, stuff: null, notes: 'Stuff-based. Armour mult 0.2x. Cold mult 0.55x.' },
  { id: 'app_parka',       name: 'Parka',            type: 'clothing', layer: 'outer',  quality: 'normal', coverage: ['torso', 'neck', 'shoulders', 'arms'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 2, workToMake: 8000, movePenalty: 0, stuffBased: true, stuffCategories: ['Fabric', 'Leathery'], stuffMultArmor: 0.55, stuffMultInsulCold: 2.0, stuffMultInsulHeat: 0.55, stuff: null, notes: 'Stuff-based. Best cold insulation (2.0x mult). Outer layer.' },
  // -- Medieval/Industrial Clothing --
  { id: 'app_pants',       name: 'Pants',            type: 'clothing', layer: 'skin',   quality: 'normal', coverage: ['legs'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.5, workToMake: 1600, movePenalty: 0, stuffBased: true, stuffCategories: ['Fabric', 'Leathery'], stuffMultArmor: 0.2, stuffMultInsulCold: 0.2, stuffMultInsulHeat: 0.2, stuff: null, notes: 'Stuff-based. Armour mult 0.2x. Cold mult 0.2x.' },
  { id: 'app_tshirt',      name: 'T-Shirt',          type: 'clothing', layer: 'skin',   quality: 'normal', coverage: ['torso', 'shoulders'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.25, workToMake: 1600, movePenalty: 0, stuffBased: true, stuffCategories: ['Fabric', 'Leathery'], stuffMultArmor: 0.2, stuffMultInsulCold: 0.22, stuffMultInsulHeat: 0.22, stuff: null, notes: 'Stuff-based. Armour mult 0.2x. Cold mult 0.22x.' },
  { id: 'app_button_shirt', name: 'Button-Down Shirt', type: 'clothing', layer: 'skin', quality: 'normal', coverage: ['torso', 'neck', 'shoulders', 'arms'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.3, workToMake: 2700, movePenalty: 0, stuffBased: true, stuffCategories: ['Fabric', 'Leathery'], stuffMultArmor: 0.2, stuffMultInsulCold: 0.26, stuffMultInsulHeat: 0.26, stuff: null, notes: 'Stuff-based. Armour mult 0.2x. Cold mult 0.26x.' },
  { id: 'app_duster',      name: 'Duster',           type: 'clothing', layer: 'outer',  quality: 'normal', coverage: ['torso', 'neck', 'shoulders', 'arms', 'legs'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 2, workToMake: 10000, movePenalty: 0, stuffBased: true, stuffCategories: ['Fabric', 'Leathery'], stuffMultArmor: 0.55, stuffMultInsulCold: 0.6, stuffMultInsulHeat: 0.85, stuff: null, notes: 'Stuff-based. Best heat insulation (0.85x mult). Cold mult 0.6x.' },
  { id: 'app_jacket',      name: 'Jacket',           type: 'clothing', layer: 'outer',  quality: 'normal', coverage: ['torso', 'neck', 'shoulders', 'arms'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 1.7, workToMake: 7000, movePenalty: 0, stuffBased: true, stuffCategories: ['Fabric', 'Leathery'], stuffMultArmor: 0.55, stuffMultInsulCold: 0.8, stuffMultInsulHeat: 0.55, stuff: null, notes: 'Stuff-based. Cold mult 0.8x. Good all-rounder.' },
  { id: 'app_robe',        name: 'Robe',             type: 'clothing', layer: 'outer',  quality: 'normal', coverage: ['torso', 'shoulders', 'arms', 'legs'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.75, workToMake: 5000, movePenalty: 0, stuffBased: true, stuffCategories: ['Fabric', 'Leathery'], stuffMultArmor: 0.3, stuffMultInsulCold: 0.8, stuffMultInsulHeat: 0.4, stuff: null, notes: 'Stuff-based. Cold mult 0.8x. Ideo-linked.' },
  // -- Headgear (Clothing) --
  { id: 'app_cowboy_hat',  name: 'Cowboy Hat',       type: 'clothing', layer: 'head',   quality: 'normal', coverage: ['head'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.14, workToMake: 1800, movePenalty: 0, stuffBased: true, stuffCategories: ['Fabric', 'Leathery'], stuffMultArmor: 0.2, stuffMultInsulCold: 0.25, stuffMultInsulHeat: 0.5, stuff: null, notes: 'Stuff-based. +10% social impact. Heat mult 0.5x.' },
  { id: 'app_bowler_hat',  name: 'Bowler Hat',       type: 'clothing', layer: 'head',   quality: 'normal', coverage: ['head'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.14, workToMake: 1800, movePenalty: 0, stuffBased: true, stuffCategories: ['Fabric', 'Leathery'], stuffMultArmor: 0.2, stuffMultInsulCold: 0.25, stuffMultInsulHeat: 0.4, stuff: null, notes: 'Stuff-based. +15% social impact. Heat mult 0.4x.' },
  { id: 'app_tuque',       name: 'Tuque',            type: 'clothing', layer: 'head',   quality: 'normal', coverage: ['head'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.07, workToMake: 1200, movePenalty: 0, stuffBased: true, stuffCategories: ['Fabric', 'Leathery'], stuffMultArmor: 0.2, stuffMultInsulCold: 0.5, stuffMultInsulHeat: 0.1, stuff: null, notes: 'Stuff-based. Best head cold insulation (0.5x mult).' },
  // -- Medieval Armour --
  { id: 'app_plate_armor', name: 'Plate Armour',     type: 'armour', layer: 'middle',   quality: 'normal', coverage: ['torso', 'neck', 'shoulders', 'arms', 'legs'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 15, workToMake: 38000, movePenalty: -0.8, stuffBased: true, stuffCategories: ['Metallic'], stuffMultArmor: 0.9, stuffMultInsulCold: 0, stuffMultInsulHeat: 0, stuff: null, notes: 'Stuff-based (metal). Armour mult 0.9x. Very heavy.' },
  // -- Industrial Armour --
  { id: 'app_flak_vest',   name: 'Flak Vest',        type: 'armour', layer: 'middle',   quality: 'normal', coverage: ['torso', 'neck'], armorSharp: 1.00, armorBlunt: 0.36, armorHeat: 0.27, insulationCold: 1, insulationHeat: 0, mass: 4, workToMake: 9000, movePenalty: -0.12, notes: 'Core torso protection. Pairs with any shell layer.' },
  { id: 'app_flak_pants',  name: 'Flak Pants',       type: 'armour', layer: 'middle',   quality: 'normal', coverage: ['legs'], armorSharp: 0.55, armorBlunt: 0.08, armorHeat: 0.10, insulationCold: 3.5, insulationHeat: 1, mass: 4, workToMake: 9000, movePenalty: -0.12, notes: 'Leg protection. Worn under shell layer.' },
  { id: 'app_flak_jacket', name: 'Flak Jacket',      type: 'armour', layer: 'outer',   quality: 'normal', coverage: ['torso', 'neck', 'shoulders', 'arms'], armorSharp: 0.55, armorBlunt: 0.08, armorHeat: 0.10, insulationCold: 14.4, insulationHeat: 3, mass: 7, workToMake: 14000, movePenalty: -0.12, notes: 'Outer layer armour. Good insulation too.' },
  // -- Helmets --
  { id: 'app_simple_helmet', name: 'Simple Helmet',  type: 'armour', layer: 'head',    quality: 'normal', coverage: ['head'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 2, workToMake: 3200, movePenalty: 0, stuffBased: true, stuffCategories: ['Metallic'], stuffMultArmor: 0.5, stuffMultInsulCold: 0, stuffMultInsulHeat: 0, stuff: null, notes: 'Stuff-based (metal). Armour mult 0.5x. Basic head protection.' },
  { id: 'app_flak_helmet', name: 'Flak Helmet',      type: 'armour', layer: 'head',    quality: 'normal', coverage: ['head'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 1.2, workToMake: 8000, movePenalty: 0, stuffBased: true, stuffCategories: ['Metallic'], stuffMultArmor: 0.7, stuffMultInsulCold: 0, stuffMultInsulHeat: 0, stuff: null, notes: 'Stuff-based (metal). Armour mult 0.7x. Plasteel-reinforced.' },
  // -- Spacer Armour --
  { id: 'app_recon_armor', name: 'Recon Armour',     type: 'armour', layer: 'middle',   quality: 'normal', coverage: ['torso', 'neck', 'shoulders', 'arms', 'legs'], armorSharp: 0.92, armorBlunt: 0.40, armorHeat: 0.46, insulationCold: 64, insulationHeat: 9, mass: 9, workToMake: 45000, movePenalty: 0, notes: 'Light powered armour. No movement penalty. Full body coverage.' },
  { id: 'app_recon_helmet', name: 'Recon Helmet',    type: 'armour', layer: 'head',    quality: 'normal', coverage: ['head', 'eyes', 'ears', 'mouth'], armorSharp: 0.92, armorBlunt: 0.40, armorHeat: 0.46, insulationCold: 4, insulationHeat: 2, mass: 1, workToMake: 15750, movePenalty: 0, notes: 'Light powered helmet. Full head coverage.' },
  { id: 'app_marine_armor', name: 'Marine Armour',   type: 'armour', layer: 'middle',   quality: 'normal', coverage: ['torso', 'neck', 'shoulders', 'arms', 'legs'], armorSharp: 1.06, armorBlunt: 0.45, armorHeat: 0.54, insulationCold: 68, insulationHeat: 10, mass: 12, workToMake: 60000, movePenalty: -0.25, notes: 'Heavy powered armour. Best protection. -0.25 move speed.' },
  { id: 'app_marine_helmet', name: 'Marine Helmet',  type: 'armour', layer: 'head',    quality: 'normal', coverage: ['head', 'eyes', 'ears', 'mouth'], armorSharp: 1.06, armorBlunt: 0.45, armorHeat: 0.54, insulationCold: 4, insulationHeat: 2, mass: 1.5, workToMake: 21000, movePenalty: 0, notes: 'Heavy spacer-tech helmet. Full head coverage.' },
  // -- Utility (Belt layer) --
  { id: 'app_shield_belt', name: 'Shield Belt',      type: 'utility', layer: 'belt',   quality: 'normal', coverage: ['waist'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 3, workToMake: 14000, movePenalty: 0, utilityCategory: 'shield', shieldMax: 1.1, shieldRecharge: 0.13, shieldLossPerDmg: 0.033, blocksRangedOut: true, notes: 'Blocks ranged in and out. ~33 effective shield HP. EMP vulnerable.' },
  { id: 'app_smokepop',    name: 'Smokepop Pack',    type: 'utility', layer: 'belt',   quality: 'normal', coverage: ['waist'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 3, workToMake: 3600, movePenalty: 0, utilityCategory: 'active', charges: 3, radius: 4.9, notes: 'Releases defensive smoke cloud. Reloads with chemfuel.' },
  { id: 'app_psych_foil',  name: 'Psychic Foil Helmet', type: 'armour', layer: 'head', quality: 'normal', coverage: ['head'], armorSharp: 0.09, armorBlunt: 0.09, armorHeat: 0.27, insulationCold: 2, insulationHeat: 1, mass: 1, workToMake: 0, movePenalty: 0, notes: '-90% psychic sensitivity. Cannot be crafted.' },
  // -- Core: Additional Clothing --
  { id: 'app_basic_shirt', name: 'Basic Shirt',      type: 'clothing', layer: 'skin',   quality: 'normal', coverage: ['torso', 'shoulders', 'arms'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.25, workToMake: 2200, movePenalty: 0, stuffBased: true, stuffCategories: ['Fabric', 'Leathery'], stuffMultArmor: 0.2, stuffMultInsulCold: 0.22, stuffMultInsulHeat: 0.22, stuff: null, notes: 'Stuff-based. Armour mult 0.2x. Cold mult 0.22x.' },
  { id: 'app_collar_shirt', name: 'Collar Shirt',    type: 'clothing', layer: 'skin',   quality: 'normal', coverage: ['torso', 'neck', 'shoulders', 'arms'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.3, workToMake: 2700, movePenalty: 0, stuffBased: true, stuffCategories: ['Fabric', 'Leathery'], stuffMultArmor: 0.2, stuffMultInsulCold: 0.26, stuffMultInsulHeat: 0.26, stuff: null, notes: 'Stuff-based. Armour mult 0.2x. Cold mult 0.26x.' },
  { id: 'app_lab_coat',   name: 'Lab Coat',          type: 'clothing', layer: 'outer',  quality: 'normal', coverage: ['torso', 'shoulders', 'arms', 'legs'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.7, workToMake: 5000, movePenalty: 0, stuffBased: true, stuffCategories: ['Fabric', 'Leathery'], stuffMultArmor: 0.2, stuffMultInsulCold: 0.4, stuffMultInsulHeat: 0.3, stuff: null, notes: 'Stuff-based. +10% medical surgery chance. Cold mult 0.4x.' },
  // -- Core: Additional Utility --
  { id: 'app_firefoam',        name: 'Firefoam Pop Pack',      type: 'utility', layer: 'belt',   quality: 'normal', coverage: ['waist'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 3, workToMake: 3600, movePenalty: 0, utilityCategory: 'active', charges: 1, radius: 4.9, notes: 'Releases firefoam. Reloads with chemfuel.' },
  { id: 'app_shock_lance',     name: 'Psychic Shock Lance',    type: 'utility', layer: 'belt',   quality: 'normal', coverage: ['waist'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.5, workToMake: 0, movePenalty: 0, utilityCategory: 'lance', charges: 2, range: 41.9, warmup: 2.2, singleUse: true, notes: 'Psychic shock. 30% brain damage risk. Destroyed when empty.' },
  { id: 'app_insanity_lance',  name: 'Psychic Insanity Lance', type: 'utility', layer: 'belt',   quality: 'normal', coverage: ['waist'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.5, workToMake: 0, movePenalty: 0, utilityCategory: 'lance', charges: 2, range: 41.9, warmup: 2.2, singleUse: true, notes: 'Drives target berserk. 30% brain damage risk. Destroyed when empty.' },
  // -- Royalty: Cataphract Armour --
  { id: 'app_cataphract_armor', name: 'Cataphract Armour', type: 'armour', layer: 'middle', quality: 'normal', coverage: ['torso', 'neck', 'shoulders', 'arms', 'legs'], armorSharp: 1.20, armorBlunt: 0.50, armorHeat: 0.60, insulationCold: 70, insulationHeat: 12, mass: 15, workToMake: 75000, movePenalty: -0.50, dlc: 'Royalty', notes: 'Heaviest powered armour. -0.50 move speed. Covers middle+outer layers.' },
  { id: 'app_cataphract_helmet', name: 'Cataphract Helmet', type: 'armour', layer: 'head', quality: 'normal', coverage: ['head', 'eyes', 'ears', 'mouth'], armorSharp: 1.20, armorBlunt: 0.50, armorHeat: 0.60, insulationCold: 4, insulationHeat: 2, mass: 2, workToMake: 26250, movePenalty: 0, dlc: 'Royalty', notes: 'Heaviest spacer helmet. Full head coverage.' },
  // -- Royalty: Prestige Armour (same stats as base, +psychic) --
  { id: 'app_prestige_recon', name: 'Prestige Recon Armour', type: 'armour', layer: 'middle', quality: 'normal', coverage: ['torso', 'neck', 'shoulders', 'arms', 'legs'], armorSharp: 0.92, armorBlunt: 0.40, armorHeat: 0.46, insulationCold: 64, insulationHeat: 9, mass: 9, workToMake: 90000, movePenalty: 0, dlc: 'Royalty', notes: 'Prestige recon. Same armour as recon. +5% psychic sensitivity.' },
  { id: 'app_prestige_recon_helm', name: 'Prestige Recon Helmet', type: 'armour', layer: 'head', quality: 'normal', coverage: ['head', 'eyes', 'ears', 'mouth'], armorSharp: 0.92, armorBlunt: 0.40, armorHeat: 0.46, insulationCold: 4, insulationHeat: 2, mass: 1, workToMake: 31500, movePenalty: 0, dlc: 'Royalty', notes: 'Prestige recon helmet. +5% psychic sensitivity.' },
  { id: 'app_prestige_marine', name: 'Prestige Marine Armour', type: 'armour', layer: 'middle', quality: 'normal', coverage: ['torso', 'neck', 'shoulders', 'arms', 'legs'], armorSharp: 1.06, armorBlunt: 0.45, armorHeat: 0.54, insulationCold: 68, insulationHeat: 10, mass: 12, workToMake: 120000, movePenalty: -0.25, dlc: 'Royalty', notes: 'Prestige marine. Same armour as marine. +5% psychic sensitivity.' },
  { id: 'app_prestige_marine_helm', name: 'Prestige Marine Helmet', type: 'armour', layer: 'head', quality: 'normal', coverage: ['head', 'eyes', 'ears', 'mouth'], armorSharp: 1.06, armorBlunt: 0.45, armorHeat: 0.54, insulationCold: 4, insulationHeat: 2, mass: 1.5, workToMake: 42000, movePenalty: 0, dlc: 'Royalty', notes: 'Prestige marine helmet. +5% psychic sensitivity.' },
  { id: 'app_prestige_cata', name: 'Prestige Cataphract Armour', type: 'armour', layer: 'middle', quality: 'normal', coverage: ['torso', 'neck', 'shoulders', 'arms', 'legs'], armorSharp: 1.20, armorBlunt: 0.50, armorHeat: 0.60, insulationCold: 70, insulationHeat: 12, mass: 15, workToMake: 150000, movePenalty: -0.50, dlc: 'Royalty', notes: 'Prestige cataphract. Same armour as cataphract. +5% psychic sensitivity.' },
  { id: 'app_prestige_cata_helm', name: 'Prestige Cataphract Helmet', type: 'armour', layer: 'head', quality: 'normal', coverage: ['head', 'eyes', 'ears', 'mouth'], armorSharp: 1.20, armorBlunt: 0.50, armorHeat: 0.60, insulationCold: 4, insulationHeat: 2, mass: 2, workToMake: 52500, movePenalty: 0, dlc: 'Royalty', notes: 'Prestige cataphract helmet. +5% psychic sensitivity.' },
  // -- Royalty: Variant Armour --
  { id: 'app_locust_armor', name: 'Locust Armour',    type: 'armour', layer: 'middle',   quality: 'normal', coverage: ['torso', 'neck', 'shoulders', 'arms', 'legs'], armorSharp: 0.87, armorBlunt: 0.35, armorHeat: 0.41, insulationCold: 64, insulationHeat: 9, mass: 9, workToMake: 45000, movePenalty: 0, dlc: 'Royalty', notes: 'Recon variant with jump pack. Slightly less protection. 5 jump charges.' },
  // -- Royalty: Psychic Apparel --
  { id: 'app_eltex_shirt', name: 'Eltex Shirt',      type: 'clothing', layer: 'skin',   quality: 'normal', coverage: ['torso', 'neck', 'shoulders', 'arms'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.2, workToMake: 30000, movePenalty: 0, dlc: 'Royalty', notes: 'Stuff-based. +12% psychic sensitivity. +1.2/s neural heat recovery.' },
  { id: 'app_eltex_vest',  name: 'Eltex Vest',       type: 'clothing', layer: 'middle',  quality: 'normal', coverage: ['torso', 'neck'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.2, workToMake: 20000, movePenalty: 0, dlc: 'Royalty', notes: 'Stuff-based. +8% psychic sensitivity. +0.8/s neural heat recovery.' },
  { id: 'app_eltex_robe',  name: 'Eltex Robe',       type: 'clothing', layer: 'outer',   quality: 'normal', coverage: ['torso', 'shoulders', 'arms', 'legs'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.75, workToMake: 40000, movePenalty: 0, dlc: 'Royalty', notes: 'Stuff-based. +20% psychic sensitivity. +2/s neural heat recovery.' },
  // -- Royalty: Royal Clothing --
  { id: 'app_royal_vest',  name: 'Royal Vest',       type: 'clothing', layer: 'middle',  quality: 'normal', coverage: ['torso', 'neck'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.3, workToMake: 8000, movePenalty: 0, dlc: 'Royalty', notes: 'Stuff-based. Satisfies noble apparel requirements.' },
  { id: 'app_royal_robe',  name: 'Royal Robe',       type: 'clothing', layer: 'outer',   quality: 'normal', coverage: ['torso', 'shoulders', 'arms', 'legs'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.75, workToMake: 12000, movePenalty: 0, dlc: 'Royalty', notes: 'Stuff-based. Satisfies noble apparel requirements.' },
  // -- Ideology: Headgear --
  { id: 'app_war_mask',   name: 'War Mask',          type: 'clothing', layer: 'head',   quality: 'normal', coverage: ['head'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.3, workToMake: 1800, movePenalty: 0, dlc: 'Ideology', notes: 'Stuff-based. -20% social impact, +40% pain suppression.' },
  { id: 'app_blindfold',  name: 'Blindfold',         type: 'clothing', layer: 'head',   quality: 'normal', coverage: ['eyes'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.04, workToMake: 800, movePenalty: 0, dlc: 'Ideology', notes: 'Stuff-based. Blocks vision. Used by blind ideoligions.' },
  { id: 'app_tribal_head', name: 'Tribal Headdress', type: 'clothing', layer: 'head',   quality: 'normal', coverage: ['head'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.2, workToMake: 2400, movePenalty: 0, dlc: 'Ideology', notes: 'Stuff-based. +20% social impact. Tribal.' },
  { id: 'app_slicecap',   name: 'Slicecap',          type: 'clothing', layer: 'head',   quality: 'normal', coverage: ['head'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.3, workToMake: 2000, movePenalty: 0, dlc: 'Ideology', notes: 'Stuff-based. -10% social impact, +5% melee dodge.' },
  { id: 'app_visage_mask', name: 'Visage Mask',      type: 'clothing', layer: 'head',   quality: 'normal', coverage: ['head'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.3, workToMake: 2000, movePenalty: 0, dlc: 'Ideology', notes: 'Stuff-based. +30% social impact. Covers face.' },
  { id: 'app_collar',     name: 'Collar',            type: 'clothing', layer: 'head',   quality: 'normal', coverage: ['neck'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.1, workToMake: 500, movePenalty: 0, dlc: 'Ideology', notes: 'Stuff-based. Worn by slaves. Neck coverage only.' },
  // -- Ideology: Clothing --
  { id: 'app_burka',      name: 'Burka',             type: 'clothing', layer: 'outer',  quality: 'normal', coverage: ['torso', 'head', 'neck', 'shoulders', 'arms', 'legs'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 1, workToMake: 5000, movePenalty: 0, dlc: 'Ideology', notes: 'Stuff-based. Full body coverage. Limits vision.' },
  // -- Anomaly: Headgear --
  { id: 'app_cultist_mask', name: 'Cultist Mask',    type: 'clothing', layer: 'head',   quality: 'normal', coverage: ['head'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.15, workToMake: 0, movePenalty: 0, dlc: 'Anomaly', notes: 'Worn by cultists. Cannot be crafted.' },
  // -- Royalty: Utility --
  { id: 'app_jump_pack',       name: 'Jump Pack',              type: 'utility', layer: 'belt',   quality: 'normal', coverage: ['waist'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 3, workToMake: 14000, movePenalty: 0, utilityCategory: 'active', charges: 5, range: 23.9, dlc: 'Royalty', notes: 'Short-range flight. Reloads with chemfuel. 5 charges.' },
  { id: 'app_broadshield',     name: 'Low-Shield Pack',        type: 'utility', layer: 'belt',   quality: 'normal', coverage: ['waist'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 3, workToMake: 14000, movePenalty: 0, utilityCategory: 'active', charges: 1, singleUse: true, dlc: 'Royalty', notes: 'Deploys area shield. Single-use, destroyed when empty.' },
  // -- Biotech: Utility --
  { id: 'app_control_pack',    name: 'Control Pack',           type: 'utility', layer: 'belt',   quality: 'normal', coverage: ['waist'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 3, workToMake: 3200, movePenalty: 0, utilityCategory: 'passive', statOffsets: { mechControlGroups: 1 }, dlc: 'Biotech', notes: '+1 mech control group. Mechanitor only.' },
  { id: 'app_bandwidth_pack',  name: 'Bandwidth Pack',         type: 'utility', layer: 'belt',   quality: 'normal', coverage: ['waist'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 3, workToMake: 3200, movePenalty: 0, utilityCategory: 'passive', statOffsets: { mechBandwidth: 9 }, dlc: 'Biotech', notes: '+9 mech bandwidth. Mechanitor only.' },
  { id: 'app_tox_pack',        name: 'Tox Pack',               type: 'utility', layer: 'belt',   quality: 'normal', coverage: ['waist'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 3, workToMake: 3600, movePenalty: 0, utilityCategory: 'active', charges: 1, radius: 4.9, dlc: 'Biotech', notes: 'Releases tox gas. Reloads with chemfuel.' },
  { id: 'app_heavy_shield',    name: 'Heavy Shield Unit',      type: 'utility', layer: 'belt',   quality: 'normal', coverage: ['torso'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 3, workToMake: 0, movePenalty: 0, utilityCategory: 'shield', shieldMax: 4.0, shieldRecharge: 0.013, shieldLossPerDmg: 0.01, blocksRangedOut: false, dlc: 'Biotech', notes: 'Mech shield. 400 effective HP. Wearer CAN shoot out. EMP vulnerable.' },
  // -- Anomaly: Utility --
  { id: 'app_disruptor_flare', name: 'Disruptor Flare Pack',   type: 'utility', layer: 'belt',   quality: 'normal', coverage: ['waist'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 3, workToMake: 7200, movePenalty: 0, utilityCategory: 'active', charges: 6, range: 22.9, dlc: 'Anomaly', notes: 'Stuns psychic creatures. Reveals invisible entities. 6 charges.' },
  { id: 'app_turret_pack',     name: 'Turret Pack',            type: 'utility', layer: 'belt',   quality: 'normal', coverage: ['waist'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 3, workToMake: 10000, movePenalty: 0, utilityCategory: 'active', charges: 1, range: 22.9, singleUse: true, dlc: 'Anomaly', notes: 'Deploys auto-turret. Single-use, destroyed when empty.' },
  { id: 'app_deadlife_pack',   name: 'Deadlife Pack',          type: 'utility', layer: 'belt',   quality: 'normal', coverage: ['waist'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 3, workToMake: 6500, movePenalty: 0, utilityCategory: 'active', charges: 1, range: 23.9, singleUse: true, dlc: 'Anomaly', notes: 'Animates corpses as allied shamblers. Single-use.' },
  { id: 'app_shard_shock',     name: 'Shard Shock Lance',      type: 'utility', layer: 'belt',   quality: 'normal', coverage: ['waist'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.7, workToMake: 18000, movePenalty: 0, utilityCategory: 'lance', charges: 2, range: 16.9, warmup: 2.4, singleUse: true, dlc: 'Anomaly', notes: 'Shard-based shock lance. Shorter range. 30% brain damage risk.' },
  { id: 'app_shard_insanity',  name: 'Shard Insanity Lance',   type: 'utility', layer: 'belt',   quality: 'normal', coverage: ['waist'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.7, workToMake: 21000, movePenalty: 0, utilityCategory: 'lance', charges: 2, range: 16.9, warmup: 2.4, singleUse: true, dlc: 'Anomaly', notes: 'Shard-based insanity lance. Shorter range. 30% brain damage risk.' },
  { id: 'app_biomutation',     name: 'Biomutation Lance',      type: 'utility', layer: 'belt',   quality: 'normal', coverage: ['waist'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 0.5, workToMake: 21000, movePenalty: 0, utilityCategory: 'lance', charges: 4, range: 25.9, warmup: 2.0, singleUse: true, dlc: 'Anomaly', notes: 'Transforms target into fleshbeast. 4 charges.' },
  // -- Odyssey: Utility --
  { id: 'app_hunter_pack',     name: 'Hunter Pack',            type: 'utility', layer: 'belt',   quality: 'normal', coverage: ['waist'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 3, workToMake: 10000, movePenalty: 0, utilityCategory: 'active', charges: 1, range: 20.9, singleUse: true, dlc: 'Odyssey', notes: 'Deploys hunter drone that detonates on target. Single-use.' },
  { id: 'app_cerebrex_node',   name: 'Cerebrex Node',          type: 'utility', layer: 'belt',   quality: 'normal', coverage: ['waist'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 5, workToMake: 0, movePenalty: 0, utilityCategory: 'passive', statOffsets: { mechBandwidth: 15 }, dlc: 'Odyssey', notes: '+15 mech bandwidth. Can summon mechanoids. Indestructible.' },
  // -- Odyssey: Spacer Apparel --
  { id: 'app_vacsuit',    name: 'Vacsuit',           type: 'clothing', layer: 'skin',   quality: 'normal', coverage: ['torso', 'neck', 'shoulders', 'arms', 'legs'], armorSharp: 0, armorBlunt: 0, armorHeat: 0, insulationCold: 0, insulationHeat: 0, mass: 2, workToMake: 12000, movePenalty: 0, dlc: 'Odyssey', notes: 'Stuff-based. Provides vacuum resistance. Required for space EVA.' },
  { id: 'app_vacsuit_helmet', name: 'Vacsuit Helmet', type: 'armour', layer: 'head',   quality: 'normal', coverage: ['head', 'eyes', 'ears', 'mouth'], armorSharp: 0.20, armorBlunt: 0.10, armorHeat: 0.10, insulationCold: 5, insulationHeat: 2, mass: 1, workToMake: 8000, movePenalty: 0, dlc: 'Odyssey', notes: 'Vacuum-sealed helmet. Full head coverage. Required for space EVA.' },
];

const APPAREL_TYPES = [
  { id: 'armour',   label: 'Armour' },
  { id: 'clothing', label: 'Clothing' },
  { id: 'utility',  label: 'Utility' },
];

const SKILLS = [
  {id:'shoot',    name:'Shooting',     short:'Shoot'},
  {id:'construct',name:'Construction', short:'Build'},
  {id:'cook',     name:'Cooking',      short:'Cook'},
  {id:'animal',   name:'Animals',      short:'Animal'},
  {id:'art',      name:'Art',          short:'Art'},
  {id:'social',   name:'Social',       short:'Social'},
  {id:'melee',    name:'Melee',        short:'Melee'},
  {id:'mine',     name:'Mining',       short:'Mine'},
  {id:'plant',    name:'Plants',       short:'Plant'},
  {id:'craft',    name:'Crafting',     short:'Craft'},
  {id:'medicine', name:'Medicine',     short:'Med'},
  {id:'intel',    name:'Intellectual', short:'Intel'},
];

// naturalPriority: from RimWorld source - higher = game processes first (emergency = highest)
// speedFormula: {base, perLevel} from SkillNeed_BaseBonus in StatDefs - actual work speed = base + perLevel * skillLevel
// relevantSkills: array of skill IDs that affect this work type (from WorkTypeDef XML)
const JOBS = [
  {id:'firefight',    name:'Firefight',        cat:'emergency', filter:'combat',   skill:null,        hint:'Put out fires.', important:true,  incapBlocks:['violence','firefight'], naturalPriority:1400},
  {id:'patient',      name:'Patient',             cat:'emergency', filter:'combat',   skill:null,        hint:'Recover when injured.', important:true, naturalPriority:1350},
  {id:'doctoring',    name:'Doctor',              cat:'emergency', filter:'medical',  skill:'medicine',  hint:'Higher = better healing.', important:true,  incapBlocks:['doctoring','caring'], naturalPriority:1300, speedFormula:{base:0.4, perLevel:0.06}, relevantSkills:['medicine']},
  {id:'bed_rest',     name:'Bed Rest',            cat:'emergency', filter:'medical',  skill:null,        hint:'Stay in bed to recover.', important:false, naturalPriority:1200},
  {id:'tending',      name:'Nurse',               cat:'emergency', filter:'medical',  skill:'medicine',  hint:'Emergency tending.', important:false, incapBlocks:['doctoring','caring'], naturalPriority:1250, speedFormula:{base:0.4, perLevel:0.06}, relevantSkills:['medicine']},
  {id:'childcare',    name:'Childcare',           cat:'emergency', filter:'social',   skill:null,        hint:'Tends to children.', important:false, naturalPriority:1175, relevantSkills:['social']},
  {id:'basic_work',   name:'Basic',               cat:'emergency', filter:'labor',    skill:null,        hint:'Fallback for simple tasks.', important:false, naturalPriority:1150},
  {id:'warden',       name:'Warden',              cat:'emergency', filter:'social',   skill:'social',    hint:'Manage prisoners.', important:false, incapBlocks:['social'], naturalPriority:1100, relevantSkills:['social']},
  {id:'wait',         name:'Wait',                cat:'emergency', filter:'social',   skill:null,        hint:'Pawn idles.', important:false, naturalPriority:100},
  {id:'sell',         name:'Sell',                cat:'social',    filter:'social',   skill:'social',    hint:'Trade for better prices.', important:false, incapBlocks:['social'], naturalPriority:800, relevantSkills:['social']},
  {id:'handling',     name:'Handle',              cat:'social',    filter:'labor',    skill:'animal',    hint:'Taming and training.', important:false, incapBlocks:['animals'], naturalPriority:1050, speedFormula:{base:0.04, perLevel:0.12}, relevantSkills:['animal']},
  {id:'entertain',    name:'Entertain',           cat:'social',    filter:'social',   skill:'social',    hint:'Cheer up colonists.', important:false, incapBlocks:['social'], naturalPriority:600, relevantSkills:['social']},
  {id:'cooking',      name:'Cooking',                cat:'food',      filter:'crafting', skill:'cook',      hint:'Higher = better food.', important:true,  incapBlocks:['cooking'], naturalPriority:850, speedFormula:{base:0, perLevel:1, curve:true}, relevantSkills:['cook']},
  {id:'hunting',      name:'Hunt',                cat:'food',      filter:'combat',   skill:'shoot',     hint:'Risk vs Reward.', important:false, incapBlocks:['violence','hunting'], naturalPriority:950, relevantSkills:['shoot','animal']},
  {id:'construction', name:'Construct',           cat:'labor',     filter:'labor',    skill:'construct', hint:'Build speed & quality.', important:true, incapBlocks:['skilled_labor'], naturalPriority:750, speedFormula:{base:0.3, perLevel:0.0875}, relevantSkills:['construct']},
  {id:'growing',      name:'Grow',                cat:'labor',     filter:'labor',    skill:'plant',     hint:'Harvest yield & speed.', important:true, incapBlocks:['plantwork'], naturalPriority:700, speedFormula:{base:0.08, perLevel:0.115}, relevantSkills:['plant']},
  {id:'mining',       name:'Mine',                cat:'labor',     filter:'labor',    skill:'mine',      hint:'Mining speed & yield.', important:false, incapBlocks:['mining'], naturalPriority:650, speedFormula:{base:0.04, perLevel:0.12}, relevantSkills:['mine']},
  {id:'plant_cut',    name:'Plant Cut',           cat:'labor',     filter:'labor',    skill:'plant',     hint:'Clear forests.', important:false, incapBlocks:['plantwork'], naturalPriority:500, speedFormula:{base:0.08, perLevel:0.115}, relevantSkills:['plant']},
  {id:'dissect',      name:'Dissect',             cat:'labor',     filter:'medical',  skill:'medicine',  hint:'Anatomy research.', important:false, incapBlocks:['doctoring','caring'], naturalPriority:400, relevantSkills:['medicine']},
  {id:'smithing',     name:'Smith',               cat:'crafting',  filter:'crafting', skill:'craft',     hint:'Forge weapons.', important:false, incapBlocks:['crafting','skilled_labor'], naturalPriority:470, relevantSkills:['craft']},
  {id:'tailoring',    name:'Tailor',              cat:'crafting',  filter:'crafting', skill:'craft',     hint:'Craft apparel.', important:false, incapBlocks:['crafting','skilled_labor'], naturalPriority:450, relevantSkills:['craft']},
  {id:'art_work',     name:'Art',                 cat:'crafting',  filter:'crafting', skill:'art',       hint:'Boost colony beauty.', important:false, incapBlocks:['artistic'], naturalPriority:430, relevantSkills:['art']},
  {id:'crafting',     name:'Craft',               cat:'crafting',  filter:'crafting', skill:'craft',     hint:'General recipes.', important:false, incapBlocks:['crafting','skilled_labor'], naturalPriority:440, relevantSkills:['craft']},
  {id:'fishing',      name:'Fish',                cat:'crafting',  filter:'labor',    skill:'plant',     hint:'Water-based food.', important:false, incapBlocks:['plantwork'], naturalPriority:350, relevantSkills:['plant']},
  {id:'hauling',      name:'Haul',                cat:'maintenance',filter:'labor',   skill:null,        hint:'Vital logistics.', important:true,  incapBlocks:['hauling','dumb_labor'], naturalPriority:300},
  {id:'cleaning',     name:'Clean',               cat:'maintenance',filter:'labor',   skill:null,        hint:'Improve mood/hygiene.', important:false, incapBlocks:['cleaning','dumb_labor'], naturalPriority:200},
  {id:'dark_study',   name:'Dark Study',          cat:'maintenance',filter:'social',  skill:'intel',     hint:'Anomaly research.', important:false, naturalPriority:550, speedFormula:{base:0.08, perLevel:0.115}, relevantSkills:['intel']},
  {id:'gene_craft',   name:'Genetics',            cat:'maintenance',filter:'crafting',skill:'medicine',  hint:'Modify genomes.', important:false, naturalPriority:460, relevantSkills:['medicine']},
  {id:'research',     name:'Research',            cat:'maintenance',filter:'social',  skill:'intel',     hint:'Unlock new tech.', important:true,  incapBlocks:['research'], naturalPriority:550, speedFormula:{base:0.08, perLevel:0.115}, relevantSkills:['intel']},
  {id:'guard',        name:'Guard',               cat:'specialist',filter:'combat',   skill:'shoot',     hint:'Protect the colony.', important:false, incapBlocks:['violence'], naturalPriority:900, relevantSkills:['shoot','melee']},
  {id:'therapist',    name:'Therapist',           cat:'specialist',filter:'social',   skill:'social',    hint:'Reduce break risk.', important:false, naturalPriority:800, relevantSkills:['social']},
  {id:'gen_power',    name:'Gen Power',           cat:'specialist',filter:'labor',    skill:'construct', hint:'Maintain power.', important:false, naturalPriority:600, speedFormula:{base:0.3, perLevel:0.0875}, relevantSkills:['construct']},
  {id:'cycle',        name:'Cycle',               cat:'specialist',filter:'labor',    skill:null,        hint:'Odyssey systems.', important:false, naturalPriority:550},
];

// Minimum biological age per job (Biotech children). Verified against the humanlike
// race def's <lifeStageWorkSettings> in Races_Humanlike.xml: Hauling/Cleaning/Basic 3,
// Firefighter/Handling/Cooking/Hunting/Growing/Mining/PlantCutting/Tailoring/Crafting 7,
// Doctor/Warden/Construction/Art 10, Smithing/Research/DarkStudy 13. App-only jobs use
// the closest vanilla analogue. Jobs absent here have no age gate (Patient/Bed Rest/
// Childcare are 0 in the game data).
const JOB_MIN_AGE = {
  firefight: 7, doctoring: 10, tending: 10, basic_work: 3, warden: 10,
  sell: 10, handling: 7, entertain: 10, cooking: 7, hunting: 7,
  construction: 10, growing: 7, mining: 7, plant_cut: 7, dissect: 10,
  smithing: 13, tailoring: 7, art_work: 10, crafting: 7, fishing: 7,
  hauling: 3, cleaning: 3, dark_study: 13, gene_craft: 13, research: 13,
  guard: 13, therapist: 10, gen_power: 10, cycle: 7
};

// App jobs that a pawn with ZERO Manipulation cannot do - matching the in-game work
// tab exactly. RimWorld greys a work type only when EVERY one of its workGivers has an
// unmet requiredCapacity (PawnColumnWorker_WorkPriority.IsIncapableOfWholeWorkType).
// Verified against Core/Defs/WorkGiverDefs/WorkGivers.xml: for these work types every
// workGiver lists <requiredCapacities><li>Manipulation</li>. Work types with a "free"
// workGiver (Firefighter/FightFires, Doctor/VisitSickPawn, Warden/ChatWithPrisoner,
// BasicWorker/Flick, Research/StudyArchotechStructures, Patient) survive 0 Manipulation
// and are deliberately excluded. Sight and Moving gate no vanilla work type, so
// blindness/immobility cut work speed but do not disable a column.
const MANIPULATION_GATED_JOBS = [
  'construction', 'mining', 'growing', 'plant_cut', 'cooking', 'hunting',
  'handling', 'crafting', 'smithing', 'tailoring', 'art_work', 'hauling',
  'cleaning', 'fishing'
];

// Provenance of each built-in job column, verified against the RimWorld source
// (WorkTypeDefs). Vanilla = base game; the three DLC work types each live in
// their own WorkTypes.xml; the rest are not real RimWorld work types (modded or
// app-custom columns). Used for header tooltips and the Hide-Modded filter.
const JOB_SOURCE = {
  firefight:'vanilla', patient:'vanilla', doctoring:'vanilla', bed_rest:'vanilla',
  basic_work:'vanilla', warden:'vanilla', handling:'vanilla', cooking:'vanilla',
  hunting:'vanilla', construction:'vanilla', growing:'vanilla', mining:'vanilla',
  plant_cut:'vanilla', smithing:'vanilla', tailoring:'vanilla', art_work:'vanilla',
  crafting:'vanilla', hauling:'vanilla', cleaning:'vanilla', research:'vanilla',
  childcare:'Biotech', dark_study:'Anomaly', fishing:'Odyssey',
  tending:'modded', wait:'modded', sell:'modded', entertain:'modded', dissect:'modded',
  gene_craft:'modded', guard:'modded', therapist:'modded', gen_power:'modded', cycle:'modded',
};
const JOB_SOURCE_LABEL = {
  vanilla: 'Vanilla', Biotech: 'Biotech DLC', Anomaly: 'Anomaly DLC',
  Odyssey: 'Odyssey DLC', modded: 'Modded / custom',
};

// Vanilla RecordDefs in DefDatabase index order (= Records_Misc.xml file order),
// verified against the source AND cross-checked against real save <vals> data
// (e.g. index 10 = Damage Dealt, 36 = Nutrition Eaten). Used to label the flat,
// unlabelled <records><vals> list on import. Only this validated range is mapped;
// the time/DLC records that follow are intentionally left out to avoid mislabel.
const RECORD_DEFS = [
  { def: 'Kills', label: 'Kills', type: 'Int' },
  { def: 'KillsHumanlikes', label: 'Kills (humanlike)', type: 'Int' },
  { def: 'KillsAnimals', label: 'Kills (animals)', type: 'Int' },
  { def: 'KillsMechanoids', label: 'Kills (mechanoids)', type: 'Int' },
  { def: 'PawnsDowned', label: 'Enemies downed', type: 'Int' },
  { def: 'PawnsDownedHumanlikes', label: 'Downed (humanlike)', type: 'Int' },
  { def: 'PawnsDownedAnimals', label: 'Downed (animals)', type: 'Int' },
  { def: 'PawnsDownedMechanoids', label: 'Downed (mechanoids)', type: 'Int' },
  { def: 'ShotsFired', label: 'Shots fired', type: 'Int' },
  { def: 'Headshots', label: 'Headshots', type: 'Int' },
  { def: 'DamageDealt', label: 'Damage dealt', type: 'Int' },
  { def: 'DamageTaken', label: 'Damage taken', type: 'Int' },
  { def: 'TimesInMentalState', label: 'Mental breaks', type: 'Int' },
  { def: 'TimesOnFire', label: 'Times on fire', type: 'Int' },
  { def: 'FiresExtinguished', label: 'Fires extinguished', type: 'Int' },
  { def: 'OperationsReceived', label: 'Operations received', type: 'Int' },
  { def: 'OperationsPerformed', label: 'Operations performed', type: 'Int' },
  { def: 'TimesTendedTo', label: 'Tends received', type: 'Int' },
  { def: 'TimesTendedOther', label: 'Tends given', type: 'Int' },
  { def: 'PeopleCaptured', label: 'People captured', type: 'Int' },
  { def: 'PrisonersRecruited', label: 'Prisoners recruited', type: 'Int' },
  { def: 'PrisonersChatted', label: 'Prisoners chatted', type: 'Int' },
  { def: 'AnimalsTamed', label: 'Animals tamed', type: 'Int' },
  { def: 'AnimalsSlaughtered', label: 'Animals slaughtered', type: 'Int' },
  { def: 'MealsCooked', label: 'Meals cooked', type: 'Int' },
  { def: 'ThingsConstructed', label: 'Things constructed', type: 'Int' },
  { def: 'ThingsInstalled', label: 'Things installed', type: 'Int' },
  { def: 'ThingsRepaired', label: 'Things repaired', type: 'Int' },
  { def: 'ThingsCrafted', label: 'Things crafted', type: 'Int' },
  { def: 'ThingsHauled', label: 'Things hauled', type: 'Int' },
  { def: 'PlantsSown', label: 'Plants sown', type: 'Int' },
  { def: 'PlantsHarvested', label: 'Plants harvested', type: 'Int' },
  { def: 'CellsMined', label: 'Cells mined', type: 'Int' },
  { def: 'MessesCleaned', label: 'Messes cleaned', type: 'Int' },
  { def: 'ResearchPointsResearched', label: 'Research points', type: 'Float' },
  { def: 'CorpsesBuried', label: 'Corpses buried', type: 'Int' },
  { def: 'NutritionEaten', label: 'Nutrition eaten', type: 'Float' },
  { def: 'BodiesStripped', label: 'Bodies stripped', type: 'Int' },
  { def: 'ThingsUninstalled', label: 'Things uninstalled', type: 'Int' },
  { def: 'ThingsDeconstructed', label: 'Things deconstructed', type: 'Int' },
  { def: 'ArtifactsActivated', label: 'Artifacts activated', type: 'Int' },
  { def: 'ContainersOpened', label: 'Containers opened', type: 'Int' },
  { def: 'SwitchesFlicked', label: 'Switches flicked', type: 'Int' },
];
// The subset shown as columns in the Records tab (the interesting ones).
const RECORD_FEATURED = [
  'Kills', 'KillsHumanlikes', 'PawnsDowned', 'ShotsFired', 'DamageDealt', 'DamageTaken',
  'TimesInMentalState', 'OperationsPerformed', 'TimesTendedOther', 'PrisonersRecruited',
  'AnimalsTamed', 'MealsCooked', 'ThingsCrafted', 'ThingsHauled', 'CellsMined',
  'PlantsHarvested', 'MessesCleaned', 'ResearchPointsResearched', 'CorpsesBuried',
];
// Category for each featured record, for the Records tab category filter.
const RECORD_CATEGORY = {
  Kills: 'Combat', KillsHumanlikes: 'Combat', PawnsDowned: 'Combat', ShotsFired: 'Combat',
  DamageDealt: 'Combat', DamageTaken: 'Combat',
  OperationsPerformed: 'Medical', TimesTendedOther: 'Medical',
  PrisonersRecruited: 'Social',
  AnimalsTamed: 'Work', MealsCooked: 'Work', ThingsCrafted: 'Work', ThingsHauled: 'Work',
  CellsMined: 'Work', PlantsHarvested: 'Work', MessesCleaned: 'Work',
  ResearchPointsResearched: 'Work', CorpsesBuried: 'Work',
  TimesInMentalState: 'Mood',
};

const PRESET_XENOTYPES = {
  baseliner: { label:'Baseliner', color:'#9ba0aa', skillMods:{}, incapable:[], notes:'Standard human -no genetic modifications.', passions:[], uvSensitivity:0 },
  hussar: { label:'Hussar', color:'#e05555', skillMods:{shoot:8, melee:8, plant:-8, animal:-8, social:-8, art:-8}, incapable:[], notes:'Engineered soldiers. Go-juice dependent. Psychically deaf.', passions:['shoot','melee'], uvSensitivity:0, genes:['Hair_ShortOnly','Body_Standard','Eyes_Red','Body_Hulk','WoundHealing_SuperFast','Pain_Reduced','Unstoppable','MaxTemp_SmallIncrease','MinTemp_SmallDecrease','AptitudeRemarkable_Shooting','AptitudeRemarkable_Melee','ToxicEnvironmentResistance_Partial','Aggression_HyperAggressive','PsychicAbility_Deaf','AptitudeTerrible_Plants','AptitudeTerrible_Animals','AptitudeTerrible_Social','AptitudeTerrible_Artistic','ChemicalDependency_GoJuice'] },
  genie: { label:'Genie', color:'#82c4f5', skillMods:{intel:8, craft:8, social:-8, animal:-4, plant:-4}, incapable:[], notes:'Engineers. Fragile, pain-sensitive, emotionally dead calm.', passions:['intel','craft'], uvSensitivity:0, genes:['Hair_BaldOnly','Beard_NoBeardOnly','Body_Thin','ElongatedFingers','AptitudeRemarkable_Intellectual','AptitudeRemarkable_Crafting','AptitudeTerrible_Social','AptitudePoor_Animals','AptitudePoor_Plants','Pain_Extra','Delicate','Aggression_DeadCalm'] },
  highmate: { label:'Highmate', color:'#f5d06a', skillMods:{social:8, mine:-8, plant:-8}, incapable:['violence'], notes:'Designed companions. Beautiful, psychic bond, cannot do violence.', passions:['social'], uvSensitivity:0, genes:['Body_Thin','Body_Standard','Skin_SheerWhite','Skin_Blue','Skin_Purple','Hair_Grayless','Hair_SnowWhite','Hair_LongOnly','Beauty_Beautiful','PsychicAbility_Enhanced','ViolenceDisabled','KindInstinct','Delicate','AptitudeTerrible_Mining','AptitudeTerrible_Plants','AptitudeRemarkable_Social','Mood_Sanguine','MaxTemp_SmallDecrease','Libido_High','PsychicBonding'] },
  sanguophage: { label:'Sanguophage', color:'#e05585', skillMods:{melee:4, social:4, intel:4}, incapable:[], notes:'Archite-powered immortals. Need hemogen, deathrest. Fire weakness.', passions:[], uvSensitivity:1, genes:['Hemogenic','HemogenDrain','Bloodfeeder','Coagulate','XenogermReimplanter','LongjumpLegs','Ageless','Deathless','Deathrest','PiercingSpine','PsychicAbility_Enhanced','LowSleep','Beauty_Pretty','MoveSpeed_Quick','MeleeDamage_Strong','DarkVision','TotalHealing','PerfectImmunity','DiseaseFree','ToxResist_Total','WoundHealing_SuperFast','AptitudeStrong_Melee','AptitudeStrong_Social','AptitudeStrong_Intellectual','UVSensitivity_Mild','FireWeakness','FireTerror','ArchiteMetabolism','Aggression_Aggressive','Robust'] },
  dirtmole: { label:'Dirtmole', color:'#b09060', skillMods:{mine:8}, incapable:[], notes:'Tunnel dwellers. Dark vision, fast healing, UV sensitive, slow.', passions:['mine'], uvSensitivity:2, genes:['Eyes_Gray','Skin_LightGray','AptitudeRemarkable_Mining','DarkVision','MeleeDamage_Strong','WoundHealing_Fast','Nearsighted','UVSensitivity_Intense','MoveSpeed_Slow','CaveDweller'] },
  yttakin: { label:'Yttakin', color:'#6ad4c8', skillMods:{animal:8, mine:-8}, incapable:[], notes:'Cold-adapted. Animal warcall, robust, furred, slow healing.', passions:['animal'], uvSensitivity:0, genes:['Body_Hulk','VoiceRoar','Furskin','Hair_BaldOnly','Tail_Furry','Beard_Always','AnimalWarcall','Robust','AptitudeRemarkable_Animals','MeleeDamage_Strong','Sleepy','PsychicAbility_Dull','NakedSpeed','WoundHealing_Slow','Aggression_Aggressive','AptitudeTerrible_Mining'] },
  impid: { label:'Impid', color:'#c97af5', skillMods:{plant:-4, animal:-4}, incapable:[], notes:'Desert-adapted. Very fast, fire spew, weak immunity & melee.', passions:[], uvSensitivity:0, genes:['Skin_PaleYellow','Skin_Orange','Skin_DeepRed','Hair_LightOrange','Hair_SandyBlonde','Beard_NoBeardOnly','Headbone_MiniHorns','FireSpew','MoveSpeed_VeryQuick','FireResistant','MaxTemp_LargeIncrease','MinTemp_SmallIncrease','Immunity_Weak','WoundHealing_Slow','AptitudePoor_Plants','AptitudePoor_Animals','MeleeDamage_Weak','Mood_Pessimist'] },
  pigskin: { label:'Pigskin', color:'#e0955a', skillMods:{cook:-4}, incapable:[], notes:'Human-pig hybrids. Hardy, strong stomach, nearsighted, pig hands.', passions:[], uvSensitivity:0, genes:['Nose_Pig','Ears_Pig','Body_Fat','Body_Hulk','Hands_Pig','VoicePig','Pain_Reduced','Immunity_Strong','StrongStomach','RobustDigestion','Nearsighted','AptitudePoor_Cooking'] },
  waster: { label:'Waster', color:'#80c455', skillMods:{art:-4, animal:-8, cook:-4}, incapable:[], notes:'Toxic-immune, super immunity, aggressive. Psychite dependent.', passions:[], uvSensitivity:0, genes:['Skin_SlateGray','Hair_Gray','Head_Gaunt','AddictionImmune_WakeUp','ToxicEnvironmentResistance_Total','Aggression_Aggressive','AptitudePoor_Artistic','AptitudeTerrible_Animals','AptitudePoor_Cooking','ChemicalDependency_Psychite','Beauty_Ugly','Immunity_SuperStrong','PollutionRush'] },
  neanderthal: { label:'Neanderthal', color:'#a08060', skillMods:{intel:-4, social:-4, shoot:-4}, incapable:[], notes:'Stocky, robust, pain-reduced, strong immunity, slow learner.', passions:[], uvSensitivity:0, genes:['Body_Standard','Body_Fat','Body_Hulk','Jaw_Heavy','Brow_Heavy','MeleeDamage_Strong','Robust','Immunity_Strong','Aggression_Aggressive','AptitudePoor_Intellectual','AptitudePoor_Social','Learning_Slow','MoveSpeed_Slow','Pain_Reduced','MinTemp_SmallDecrease','MaxTemp_SmallIncrease','AptitudePoor_Shooting'] },
  starjack: { label:'Starjack', color:'#d0d8e8', skillMods:{construct:8, melee:-8, mine:-8, animal:-8}, incapable:[], notes:'Space-adapted. Dark vision, weak melee, cave dweller. (Odyssey)', passions:['construct'], uvSensitivity:0, genes:['Hair_BaldOnly','FacialRidges','Skin_SheerWhite','MinTemp_LargeDecrease','MaxTemp_SmallIncrease','VacuumResistance_Partial','MeleeDamage_Weak','CaveDweller','AptitudeRemarkable_Construction','AptitudeTerrible_Melee','AptitudeTerrible_Mining','AptitudeTerrible_Animals','MoveSpeed_Space'] },
};

// ─── XENOTYPE XML IMPORT ALGORITHM ──────────────────────────────────────────
// Parses XenotypeDef XML from vanilla, DLC, or mod folders with 100% accuracy.
// Gene naming convention is enforced by the game engine -ALL mods must follow it.
//
// Aptitude genes: Aptitude{Level}_{SkillDef}
//   Remarkable = +8 skill + adds passion
//   Strong     = +4 skill
//   Poor       = -4 skill
//   Terrible   = -8 skill + removes passion
//
// Skill def names map to our IDs:
//   Shooting→shoot, Melee→melee, Construction→construct, Mining→mine,
//   Cooking→cook, Plants→plant, Animals→animal, Crafting→craft,
//   Artistic→art, Medical→medicine, Social→social, Intellectual→intel
//
// Special genes detected:
//   ViolenceDisabled → incapable:['violence']
//   UVSensitivity_Mild → uvSensitivity:1
//   UVSensitivity_Intense → uvSensitivity:2
//   DarkVision → darkVision:true
//   Robust → damageFactor:0.75
//   Delicate → damageFactor:1.15
//   FireWeakness → fireWeakness:true
//
const XENO_GENE_SKILL_MAP = {
  'Shooting':'shoot', 'Melee':'melee', 'Construction':'construct', 'Mining':'mine',
  'Cooking':'cook', 'Plants':'plant', 'Animals':'animal', 'Crafting':'craft',
  'Artistic':'art', 'Medicine':'medicine', 'Medical':'medicine', 'Social':'social', 'Intellectual':'intel'
};
const XENO_APTITUDE_LEVELS = { 'Remarkable': 8, 'Strong': 4, 'Poor': -4, 'Terrible': -8 };
const XENO_PASSION_GENES = { 'Remarkable': true, 'Strong': false, 'Poor': false, 'Terrible': false };
// (gene <disabledWorkTags> -> app incap tags reuses WORKTAG_TO_INCAP, defined further down.)

function parseXenotypesFromXML(xmlString) {
  const results = {};
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');
  const xenoDefs = doc.querySelectorAll('XenotypeDef');

  for (const xDef of xenoDefs) {
    // Skip abstract defs
    if (xDef.getAttribute('Abstract') === 'True') continue;

    const defName = xDef.querySelector('defName')?.textContent;
    if (!defName) continue;

    const label = xDef.querySelector('label')?.textContent || defName;
    const descShort = xDef.querySelector('descriptionShort')?.textContent || '';
    const geneNodes = xDef.querySelectorAll('genes > li');

    const skillMods = {};
    const passions = [];
    const incapable = [];
    let uvSensitivity = 0;
    let darkVision = false;
    let fireWeakness = false;
    const geneIds = [];

    for (const gNode of geneNodes) {
      const gene = gNode.textContent.trim();
      geneIds.push(gene);

      // Parse aptitude genes: Aptitude{Level}_{Skill}
      const aptMatch = gene.match(/^Aptitude(Remarkable|Strong|Poor|Terrible)_(\w+)$/);
      if (aptMatch) {
        const [, level, skillDef] = aptMatch;
        const skillId = XENO_GENE_SKILL_MAP[skillDef];
        if (skillId) {
          skillMods[skillId] = (skillMods[skillId] || 0) + XENO_APTITUDE_LEVELS[level];
          if (XENO_PASSION_GENES[level]) passions.push(skillId);
        }
        continue;
      }

      // Special genes
      if (gene === 'ViolenceDisabled') { incapable.push('violence'); continue; }
      if (gene === 'UVSensitivity_Mild') { uvSensitivity = Math.max(uvSensitivity, 1); continue; }
      if (gene === 'UVSensitivity_Intense') { uvSensitivity = Math.max(uvSensitivity, 2); continue; }
      if (gene === 'DarkVision') { darkVision = true; continue; }
      if (gene === 'FireWeakness') { fireWeakness = true; continue; }
    }

    const id = defName.toLowerCase().replace(/\s+/g, '_');
    results[id] = {
      label: label.charAt(0).toUpperCase() + label.slice(1),
      color: '#888888',
      skillMods,
      incapable,
      passions: [...new Set(passions)],
      uvSensitivity,
      darkVision,
      fireWeakness,
      genes: geneIds,
      notes: descShort ? descShort.slice(0, 120) + (descShort.length > 120 ? '…' : '') : `Imported xenotype.`,
      modSource: 'Scanned from XML'
    };
  }
  return results;
}

// Map a RimWorld skill defName (e.g. "Shooting", "Medicine") to an app skill id.
function _rwSkillToAppId(name) {
  const base = (typeof XENO_GENE_SKILL_MAP !== 'undefined') ? XENO_GENE_SKILL_MAP : {};
  const map = Object.assign({ Medicine: 'medicine', Art: 'art' }, base);
  return map[String(name || '').trim()] || null;
}
function _capFirst(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
function _sanId(s) { return String(s).replace(/[^a-z0-9]+/gi, '_').toLowerCase(); }

// ── Safe XML helpers (C3) ─────────────────────────────────────────────────────
// Used by definition parsers that need inheritance resolution. These replace
// the inline DOMParser boilerplate in older parsers and add direct-child-only
// traversal (querySelector walks descendants, which is wrong for RimWorld XML
// where nested defs reuse the same tag names).

function _parseXmlDoc(xmlString) {
  if (!xmlString || typeof xmlString !== 'string') return null;
  let doc;
  try { doc = new DOMParser().parseFromString(xmlString, 'text/xml'); } catch (_) { return null; }
  if (!doc || !doc.documentElement) return null;
  const rootName = String(doc.documentElement.tagName || doc.documentElement.nodeName || '').toLowerCase();
  if (rootName === 'parsererror') return null;
  if (typeof doc.getElementsByTagName === 'function' && doc.getElementsByTagName('parsererror').length) return null;
  return doc;
}

function _elementChildren(el) {
  if (!el) return [];
  if (el.children) return Array.from(el.children);
  return Array.from(el.childNodes || []).filter(node => node && node.nodeType === 1);
}

function _directChild(el, tagName) {
  const children = _elementChildren(el);
  for (let i = 0; i < children.length; i++) {
    if (children[i].tagName === tagName) return children[i];
  }
  return null;
}

function _directChildren(el, tagName) {
  return _elementChildren(el).filter(child => child.tagName === tagName);
}

function _textDirect(el, tagName) {
  const child = _directChild(el, tagName);
  if (!child) return null;
  const t = child.textContent;
  return t != null ? t.trim() : null;
}

// CRITICAL: preserves numeric 0 - returns null only for absent/unparseable,
// NOT for zero. This differs from the parseFloat(x) || null pattern in older
// parsers which conflates 0 with absent.
function _numberDirect(el, tagName) {
  const raw = _textDirect(el, tagName);
  if (raw == null || raw === '') return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function _boolDirect(el, tagName) {
  const raw = _textDirect(el, tagName);
  if (raw == null) return null;
  if (/^\s*true\s*$/i.test(raw)) return true;
  if (/^\s*false\s*$/i.test(raw)) return false;
  return null;
}

function _boolAttribute(el, attributeName) {
  if (!el || !el.hasAttribute(attributeName)) return null;
  const raw = el.getAttribute(attributeName);
  if (/^\s*true\s*$/i.test(raw || '')) return true;
  if (/^\s*false\s*$/i.test(raw || '')) return false;
  return null;
}

function _uniqueStrings(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function _definitionProvenance(options, sourceOrder, sourceKey) {
  const opts = options || {};
  const mapped = sourceKey && opts.sourceMap && Array.isArray(opts.sourceMap[sourceKey])
    ? opts.sourceMap[sourceKey] : null;
  const sources = mapped ? mapped.slice() : (Array.isArray(opts.sources) ? opts.sources.slice() : []);
  if (!mapped) {
    sources.push({
      modId: opts.modId || null,
      file: opts.file || null,
      scanOrder: opts.scanOrder != null ? opts.scanOrder : null,
      sourceOrder: sourceOrder,
    });
  }
  const modIds = Array.from(new Set(sources.map(source => source.modId).filter(Boolean)));
  return { modId: modIds.length === 1 ? modIds[0] : (opts.modId || null), sources: sources };
}

function _mergeProvenance() {
  const inputs = Array.from(arguments).filter(Boolean);
  const sources = [];
  let modId = null;
  for (let i = 0; i < inputs.length; i++) {
    if (modId == null && inputs[i].modId != null) modId = inputs[i].modId;
    const next = Array.isArray(inputs[i].sources) ? inputs[i].sources : [];
    for (let j = 0; j < next.length; j++) sources.push(next[j]);
  }
  return { modId: modId, sources: sources };
}

function _storeDefinition(result, defName, value) {
  if (!result[defName]) {
    result[defName] = value;
    return;
  }
  const existing = result[defName];
  existing._completeness = 'partial';
  existing._completenessReasons = _uniqueStrings(
    (existing._completenessReasons || []).concat(value._completenessReasons || [], [
      'duplicateDefinitionConflict',
      'sourceOrderingUncertain',
    ])
  );
  existing._provenance = _mergeProvenance(existing._provenance, value._provenance);
}

// ── Inheritance resolution helper (C3) ────────────────────────────────────────
// Resolves ParentName inheritance for a collection of raw parsed defs.
// `fieldMerger(parentFields, childFields)` produces the merged rawFields.
// Returns the resolved array (abstract defs stripped, concrete defs enriched).
// Defs with unresolvable parents get _completeness:'partial'.

function _resolveInheritance(rawDefs, fieldMerger) {
  // Build lookups without silently choosing between duplicate parent candidates.
  const byName = {};
  for (let i = 0; i < rawDefs.length; i++) {
    const rd = rawDefs[i];
    const names = _uniqueStrings([rd.abstractName, rd.defName]);
    for (let j = 0; j < names.length; j++) {
      if (!byName[names[j]]) byName[names[j]] = [];
      byName[names[j]].push(rd);
    }
  }

  // Recursive parent chain resolver (with cycle detection)
  function resolveChain(rd, visited) {
    const ownReasons = (rd._completenessReasons || []).slice();
    const ownCompleteness = rd._completeness || 'unknown';
    if (!rd.parentName) {
      return {
        fields: rd.rawFields,
        completeness: ownCompleteness,
        reasons: ownReasons,
        provenance: rd._provenance,
      };
    }
    if (visited.has(rd.parentName)) {
      return {
        fields: rd.rawFields,
        completeness: 'partial',
        reasons: _uniqueStrings(ownReasons.concat('cyclicInheritance:' + rd.parentName)),
        provenance: rd._provenance,
      };
    }
    const parents = byName[rd.parentName] || [];
    if (!parents.length) {
      return {
        fields: rd.rawFields,
        completeness: 'partial',
        reasons: _uniqueStrings(ownReasons.concat('unresolvedParent:' + rd.parentName)),
        provenance: rd._provenance,
      };
    }
    if (parents.length > 1) {
      return {
        fields: rd.rawFields,
        completeness: 'partial',
        reasons: _uniqueStrings(ownReasons.concat(['duplicateDefinitionConflict', 'sourceOrderingUncertain'])),
        provenance: parents.reduce((p, parent) => _mergeProvenance(p, parent._provenance), rd._provenance),
      };
    }
    const nextVisited = new Set(visited);
    nextVisited.add(rd.parentName);
    const parentResult = resolveChain(parents[0], nextVisited);
    const merged = fieldMerger(parentResult.fields, rd.rawFields);
    const completeness = ownCompleteness === 'complete' && parentResult.completeness === 'complete'
      ? 'complete'
      : (ownCompleteness === 'unknown' || parentResult.completeness === 'unknown' ? 'unknown' : 'partial');
    return {
      fields: merged,
      completeness: completeness,
      reasons: _uniqueStrings(parentResult.reasons.concat(ownReasons)),
      provenance: _mergeProvenance(parentResult.provenance, rd._provenance),
    };
  }

  const out = [];
  for (let j = 0; j < rawDefs.length; j++) {
    const rd = rawDefs[j];
    // Named abstract bases participate in inheritance but never enter catalogs.
    if (!rd.defName || rd.isAbstract) continue;
    const chain = resolveChain(rd, new Set());
    const result = Object.assign({}, chain.fields, {
      defName: rd.defName,
      _completeness: chain.completeness,
      _completenessReasons: chain.reasons,
      _provenance: chain.provenance || { modId: null, sources: [] },
    });
    out.push(result);
  }
  return out;
}

// ── Completeness + provenance factory (C3) ────────────────────────────────────

function _makeCompleteness(completeness, reasons, provenance) {
  return {
    _completeness: completeness || 'unknown',
    _completenessReasons: Array.isArray(reasons) ? reasons : [],
    _provenance: provenance || { modId: null, sources: [] },
  };
}

// C4 permission source preservation. These records sit beside the legacy
// lower-case `incapable` projections; C1 continues to consume the legacy field.
function _parsePermissionSource(scope, sourceField, targetKind) {
  const el = _directChild(scope, sourceField);
  const inherited = !!(scope && scope.hasAttribute && scope.hasAttribute('ParentName'));
  if (!el) {
    return {
      sourceField,
      targetKind,
      presence: inherited ? 'unknown' : 'absent',
      rawValue: null,
      targets: [],
      completeness: inherited ? 'unknown' : 'complete',
    };
  }
  const listItems = _directChildren(el, 'li');
  const tokens = listItems.length
    ? listItems.map(li => String(li.textContent || '').trim()).filter(Boolean)
    : String(el.textContent || '').split(',').map(value => value.trim()).filter(Boolean);
  const targets = [];
  let complete = true;
  for (const rawTarget of tokens) {
    if (/^none$/i.test(rawTarget)) continue;
    let canonicalTarget = null;
    if (targetKind === 'workTag') {
      canonicalTarget = Object.prototype.hasOwnProperty.call(RIMWORLD_WORK_TAG_VALUES, rawTarget)
        ? rawTarget : null;
    } else if (/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(rawTarget)) {
      canonicalTarget = rawTarget;
    }
    if (!canonicalTarget) complete = false;
    targets.push({ rawTarget, canonicalTarget });
  }
  return {
    sourceField,
    targetKind,
    presence: 'present',
    rawValue: String(el.textContent || '').trim() || null,
    targets,
    completeness: complete ? 'complete' : 'partial',
  };
}

// Parse scanned <TraitDef> XML into { id: traitObj }. "Names + basic data":
// one entry per trait degree (what a pawn actually has), with skillGains mapped
// to skillMods where the XML declares them. Renderer-only (uses DOMParser).
function parseTraitsFromXML(xmlString) {
  const results = {};
  let doc;
  try { doc = new DOMParser().parseFromString(xmlString || '', 'text/xml'); } catch (_) { return results; }
  const gainsOf = (scope) => {
    const mods = {};
    const sg = scope && scope.querySelector('skillGains');
    if (!sg) return mods;
    const lis = Array.from(sg.children).filter(c => c.tagName.toLowerCase() === 'li');
    if (lis.length) {
      // 1.4+ list form: <li><key>Shooting</key><value>4</value></li> (or <skill>/<amount>)
      for (const li of lis) {
        const id = _rwSkillToAppId((li.querySelector('key, skill') || {}).textContent);
        const v = parseInt(((li.querySelector('value, amount') || {}).textContent) || '', 10);
        if (id && Number.isFinite(v) && v !== 0) mods[id] = (mods[id] || 0) + v;
      }
    } else {
      // Legacy form: <Shooting>4</Shooting>
      for (const ch of Array.from(sg.children)) {
        const id = _rwSkillToAppId(ch.tagName);
        const v = parseInt(ch.textContent || '', 10);
        if (id && Number.isFinite(v) && v !== 0) mods[id] = (mods[id] || 0) + v;
      }
    }
    return mods;
  };
  for (const tDef of doc.querySelectorAll('TraitDef')) {
    if (tDef.getAttribute('Abstract') === 'True') continue;
    const defName = (tDef.querySelector('defName') || {}).textContent;
    if (!defName || !defName.trim()) continue;
    const dn = defName.trim();
    const degreeLis = Array.from(tDef.querySelectorAll('degreeDatas > li'));
    // Work types this trait disables (e.g. Pyromaniac -> Firefighting). TraitDef-level,
    // so it applies to every degree. Map RimWorld work tags to app incap ids; "AllWork"
    // expands to the full set so the pawn is blocked from everything.
    const traitIncap = [];
    const dwt = (tDef.querySelector('disabledWorkTags') || {}).textContent;
    if (dwt && dwt.trim().toLowerCase() !== 'none') {
      dwt.split(',').forEach(t => {
        const tag = t.trim();
        if (!tag) return;
        if (tag.toLowerCase() === 'allwork') {
          Object.values(WORKTAG_TO_INCAP).forEach(inc => { if (!traitIncap.includes(inc)) traitIncap.push(inc); });
          return;
        }
        const mapped = WORKTAG_TO_INCAP[tag] || WORKTAG_TO_INCAP[tag.toLowerCase()];
        if (mapped) { if (!traitIncap.includes(mapped)) traitIncap.push(mapped); }
        else if (!traitIncap.includes(tag.toLowerCase())) traitIncap.push(tag.toLowerCase());
      });
    }
    const make = (label, suffix, scope) => {
      const id = 'mod_trait_' + _sanId(dn) + (suffix ? '_' + _sanId(suffix) : '');
      results[id] = {
        id, label: _capFirst((label || dn).trim()),
        description: 'Scanned from installed content.',
        workSpeed: 0, learningRate: 0, breakThreshold: 0,
        skillMods: gainsOf(scope), modSource: 'Scanned mod',
        permissionSources: [
          _parsePermissionSource(tDef, 'disabledWorkTypes', 'workType'),
          _parsePermissionSource(tDef, 'disabledWorkTags', 'workTag'),
        ],
      };
      if (traitIncap.length) results[id].incapable = [...traitIncap];
    };
    if (degreeLis.length) {
      for (const li of degreeLis) {
        const lbl = (li.querySelector('label') || {}).textContent || dn;
        const deg = ((li.querySelector('degree') || {}).textContent || '0').trim();
        make(lbl, deg, li);
      }
    } else {
      make((tDef.querySelector('label') || {}).textContent, '', tDef);
    }
  }
  return results;
}

// Parse scanned <MemeDef> XML into custom memes for the Ideology planner. Vanilla and
// DLC memes already in IDEO_MEMES are skipped by defName; structures keep their
// exclusive Structure category so the planner's pick-one rule applies to them too.
// Conflicts are derived from shared <exclusionTags> within the scanned set (how the
// game expresses meme conflicts). Renderer-only (DOMParser).
function parseMemesFromXML(xmlString) {
  const results = {};
  let doc;
  try { doc = new DOMParser().parseFromString(xmlString || '', 'text/xml'); } catch (_) { return results; }
  const VANILLA_MEME_DEFS = new Set([
    'Collectivist', 'Individualist', 'Supremacist', 'Guilty', 'Loyalist', 'Transhumanist',
    'FleshPurity', 'Tunneler', 'NaturePrimacy', 'TreeConnection', 'PainIsVirtue', 'Blindsight',
    'Darkness', 'Rancher', 'AnimalPersonhood', 'Raider', 'Nudism', 'Cannibal', 'HighLife',
    'HumanPrimacy', 'FemaleSupremacy', 'MaleSupremacy', 'Bloodfeeding', 'Ritualist', 'Inhuman',
    'Shipborn', 'Proselytizer',
    'Structure_Animist', 'Structure_Archist', 'Structure_Ideological',
    'Structure_TheistAbstract', 'Structure_TheistEmbodied'
  ]);
  const parsed = [];
  for (const m of doc.querySelectorAll('MemeDef')) {
    if (m.getAttribute('Abstract') === 'True') continue;
    const defName = ((m.querySelector('defName') || {}).textContent || '').trim();
    if (!defName || VANILLA_MEME_DEFS.has(defName)) continue;
    const label = ((m.querySelector('label') || {}).textContent || defName).trim();
    const desc = ((m.querySelector('description') || {}).textContent || '').trim();
    const catRaw = ((m.querySelector('category') || {}).textContent || '').trim();
    const impactRaw = parseInt(((m.querySelector('impact') || {}).textContent || '').trim(), 10);
    const tags = Array.from(m.querySelectorAll('exclusionTags > li')).map(li => (li.textContent || '').trim()).filter(Boolean);
    parsed.push({
      id: 'mod_meme_' + _sanId(defName),
      label: _capFirst(label),
      description: (typeof _cleanGrammarText === 'function' ? _cleanGrammarText(desc) : desc) || 'Scanned from installed content.',
      category: catRaw === 'Structure' ? 'Structure' : 'Theme',
      impact: impactRaw >= 3 ? 'high' : impactRaw === 2 ? 'medium' : impactRaw === 1 ? 'low' : undefined,
      tags,
      modSource: 'Scanned mod'
    });
  }
  // Conflicts: memes sharing an exclusion tag conflict with each other. Two passes,
  // so deleting the working tags can't break comparisons for later entries.
  for (const a of parsed) {
    a.conflicts = parsed.filter(b => b !== a && b.tags.some(t => a.tags.includes(t))).map(b => b.id);
  }
  for (const a of parsed) {
    delete a.tags;
    results[a.id] = a;
  }
  return results;
}

// Parse scanned ritual-pattern <PreceptDef> XML (preceptClass mentions Ritual) into
// custom rituals for the planner. Vanilla ritual defs are skipped by defName so the
// built-in IDEO_RITUALS list stays the source for those. Renderer-only (DOMParser).
function parseRitualsFromXML(xmlString) {
  const results = {};
  let doc;
  try { doc = new DOMParser().parseFromString(xmlString || '', 'text/xml'); } catch (_) { return results; }
  // The install scan also returns the base game's own ritual defs; those already
  // exist as built-in IDEO_RITUALS entries, so skip anything with a matching label.
  const builtinLabels = new Set((typeof IDEO_RITUALS !== 'undefined' ? IDEO_RITUALS : []).map(r => r.label.toLowerCase()));
  for (const p of doc.querySelectorAll('PreceptDef')) {
    if (p.getAttribute('Abstract') === 'True') continue;
    const defName = ((p.querySelector('defName') || {}).textContent || '').trim();
    if (!defName) continue;
    const label = ((p.querySelector('label') || {}).textContent || defName).trim();
    if (builtinLabels.has(label.toLowerCase())) continue;
    const desc = ((p.querySelector('description') || {}).textContent || '').trim();
    results['mod_ritual_' + _sanId(defName)] = {
      label: _capFirst(label),
      description: (typeof _cleanGrammarText === 'function' ? _cleanGrammarText(desc) : desc) || 'Scanned from installed content.',
      category: 'Modded',
      modSource: 'Scanned mod'
    };
  }
  return results;
}

// Turn RimWorld grammar-resolver tokens (e.g. [PAWN_nameDef], {PAWN_pronoun},
// {0_possessive}) into neutral, readable words for display. Handles both [..] and {..}
// bracket styles and any casing. Anything left over that looks like a token is stripped.
function _cleanGrammarText(raw) {
  let s = String(raw == null ? '' : raw).replace(/\\n/g, ' ').trim();
  if (!s) return '';
  const who = '(?:PAWN|ANYPAWN|INITIATOR|RECIPIENT|0|1|2)';
  s = s
    .replace(new RegExp(`[\\[{]${who}_(?:nameDef|nameFull|nameShort|name|label|definite|indefinite)[\\]}]`, 'gi'), 'this colonist')
    .replace(new RegExp(`[\\[{]${who}_pronoun[\\]}]`, 'gi'), 'they')
    .replace(new RegExp(`[\\[{]${who}_possessive[\\]}]`, 'gi'), 'their')
    .replace(new RegExp(`[\\[{]${who}_objective[\\]}]`, 'gi'), 'them')
    .replace(/[\[{][A-Za-z0-9_]+[\]}]/g, '') // strip any remaining grammar tokens
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Capitalise the first letter if a leading token was removed.
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Parse scanned <TraitDef> XML into a flat trait CATALOG for the save-export trait
// editor: one entry per (def, degree) with its real RimWorld defName, degree, label, and
// the data needed to detect conflicts (conflictingTraits + exclusionTags), exactly as
// TraitDef.ConflictsWith uses them. Covers vanilla (Core), DLC and mods in one scan.
// Renderer-only (uses DOMParser).
function parseTraitCatalogFromXML(xmlString) {
  const out = [];
  let doc;
  try { doc = new DOMParser().parseFromString(xmlString || '', 'text/xml'); } catch (_) { return out; }
  for (const tDef of doc.querySelectorAll('TraitDef')) {
    if (tDef.getAttribute('Abstract') === 'True') continue;
    const def = ((tDef.querySelector('defName') || {}).textContent || '').trim();
    if (!def) continue;
    const baseLabel = ((tDef.querySelector('label') || {}).textContent || def).trim();
    const conflictingTraits = Array.from(tDef.querySelectorAll('conflictingTraits > li'))
      .map(li => (li.textContent || '').trim()).filter(Boolean);
    const exclusionTags = Array.from(tDef.querySelectorAll('exclusionTags > li'))
      .map(li => (li.textContent || '').trim()).filter(Boolean);
    const degreeLis = Array.from(tDef.querySelectorAll('degreeDatas > li'));
    const push = (label, degree, desc) => out.push({
      def, degree: parseInt(degree, 10) || 0,
      label: _capFirst((label || baseLabel || def).trim()),
      desc: _cleanGrammarText(desc), conflictingTraits, exclusionTags
    });
    if (degreeLis.length) {
      for (const li of degreeLis) {
        push((li.querySelector('label') || {}).textContent,
             (li.querySelector('degree') || {}).textContent || '0',
             (li.querySelector('description') || {}).textContent);
      }
    } else {
      push(baseLabel, 0, (tDef.querySelector('description') || {}).textContent);
    }
  }
  return out;
}

// Parse scanned <HediffDef> XML into a flat catalogue for the health editor's "add"
// flow: def, label, the class to write in <li Class="...">, a rough category (injury /
// implant / condition) for grouping, and a default severity. Renderer-only (DOMParser).
function parseHediffCatalogFromXML(xmlString) {
  const out = [];
  const doc = _parseXmlDoc(xmlString);
  if (!doc) return out;
  for (const h of doc.querySelectorAll('HediffDef')) {
    if (_boolAttribute(h, 'Abstract') === true) continue;
    const def = _textDirect(h, 'defName') || '';
    if (!def) continue;
    const label = _textDirect(h, 'label') || def;
    const cls = _textDirect(h, 'hediffClass') || 'HediffWithComps';
    const isImplant = !!_directChild(h, 'addedPartProps') || /AddedPart|Implant/i.test(cls);
    const isInjury = /Injury/i.test(cls) || !!_directChild(h, 'injuryProps');
    const category = isImplant ? 'implant' : (isInjury ? 'injury' : 'condition');
    const parsedInitialSeverity = _numberDirect(h, 'initialSeverity');
    const initSev = parsedInitialSeverity != null ? parsedInitialSeverity : (isInjury ? 5 : 0.5);
    const completenessReasons = [];
    if (h.hasAttribute('ParentName')) completenessReasons.push('unsupportedInheritanceShape');
    if (_directChild(h, 'initialSeverity') && parsedInitialSeverity == null) {
      completenessReasons.push('unparseableRelevantField');
    }
    // Work this condition disables in-game (HediffStage.disabledWorkTags). This is how a
    // modded injury/implant says "a pawn with me can't do X" - the same mechanism the
    // game folds into CombinedDisabledWorkTags. Captured PER STAGE with its minSeverity so
    // the app can apply only the pawn's CURRENT stage (the game uses hediff.CurStage, not a
    // union) - a final-stage disable must not fire while the pawn sits at a mild stage.
    const mapTags = (text, into) => {
      (text || '').split(',').forEach(t => {
        const tag = t.trim();
        if (!tag || tag.toLowerCase() === 'none') return;
        if (tag.toLowerCase() === 'allwork') {
          Object.values(WORKTAG_TO_INCAP).forEach(i => { if (!into.includes(i)) into.push(i); });
          return;
        }
        const mapped = WORKTAG_TO_INCAP[tag] || WORKTAG_TO_INCAP[tag.toLowerCase()];
        if (mapped) { if (!into.includes(mapped)) into.push(mapped); }
        else if (!into.includes(tag.toLowerCase())) into.push(tag.toLowerCase());
      });
    };
    const stagesEl = _directChild(h, 'stages');
    const stageLis = stagesEl ? _directChildren(stagesEl, 'li') : [];
    const disabledWorkStages = [];
    const hiddenStages = [];
    const capModStages = [];
    let anyDisable = false, anyHidden = false, anyCapMod = false;
    if (stageLis.length) {
      stageLis.forEach(li => {
        const parsedMin = _numberDirect(li, 'minSeverity');
        const min = parsedMin != null ? parsedMin : 0;
        if (_directChild(li, 'minSeverity') && parsedMin == null) {
          completenessReasons.push('unparseableRelevantField');
        }
        const work = [];
        let hidden = false;
        // C3: capacity mod extraction per stage
        const capMods = [];
        let partEfficiencyOffset = null;
        let partIgnoreMissingHP = null;
        let capacityFactorEffectMultiplier = null;
        // Only this stage's own direct children, not descendants of nested defs.
        _elementChildren(li).forEach(c => {
          if (!c.tagName) return;
          const t = c.tagName.toLowerCase();
          if (t === 'disabledworktags') mapTags(c.textContent, work);
          // HediffStage.becomeVisible=false: the game hides the hediff at this stage
          // (Hediff.Visible) - e.g. utility/flag hediffs mods apply silently. Captured
          // so the health chips can hide them too.
          if (t === 'becomevisible' && /^\s*false\s*$/i.test(c.textContent || '')) hidden = true;
          // C3: partEfficiencyOffset (affects the body part this hediff is on)
          if (t === 'partefficiencyoffset') {
            const peo = parseFloat(c.textContent || '');
            if (Number.isFinite(peo)) partEfficiencyOffset = peo;
          }
          // C3: partIgnoreMissingHP (true = treat part HP as full even when damaged)
          if (t === 'partignoremissinghp') {
            const raw = String(c.textContent || '').trim();
            if (/^true$/i.test(raw)) partIgnoreMissingHP = true;
            else if (/^false$/i.test(raw)) partIgnoreMissingHP = false;
            else completenessReasons.push('unparseableRelevantField');
          }
          if (t === 'capacityfactoreffectmultiplier') {
            capacityFactorEffectMultiplier = String(c.textContent || '').trim() || null;
          }
          // C3: capMods - capacity modifier list per stage
          if (t === 'capmods') {
            _elementChildren(c).forEach(modLi => {
              if (modLi.tagName.toLowerCase() !== 'li') return;
              const capacity = _textDirect(modLi, 'capacity') || null;
              if (!capacity) return;
              const offset = _numberDirect(modLi, 'offset');
              const postFactor = _numberDirect(modLi, 'postFactor');
              const setMax = _numberDirect(modLi, 'setMax');
              if ((_directChild(modLi, 'offset') && offset == null)
                || (_directChild(modLi, 'postFactor') && postFactor == null)
                || (_directChild(modLi, 'setMax') && setMax == null)) {
                completenessReasons.push('unparseableRelevantField');
              }
              capMods.push({ capacity, offset, postFactor, setMax });
            });
          }
        });
        if (work.length) anyDisable = true;
        if (hidden) anyHidden = true;
        if (capMods.length || partEfficiencyOffset != null || partIgnoreMissingHP != null
          || capacityFactorEffectMultiplier) anyCapMod = true;
        disabledWorkStages.push({
          min,
          work,
          permissionSources: [_parsePermissionSource(li, 'disabledWorkTags', 'workTag')],
        });
        hiddenStages.push({ min, hidden });
        capModStages.push({
          minSeverity: min,
          capMods,
          partEfficiencyOffset,
          partIgnoreMissingHP,
          capacityFactorEffectMultiplier,
        });
      });
    } else {
      // No <stages> block but a stray top-level disabledWorkTags: treat as always-on.
      const work = [];
      const disabled = _directChild(h, 'disabledWorkTags');
      if (disabled) mapTags(disabled.textContent, work);
      if (work.length) {
        anyDisable = true;
        disabledWorkStages.push({
          min: 0,
          work,
          permissionSources: [_parsePermissionSource(h, 'disabledWorkTags', 'workTag')],
        });
      }
    }
    const entry = {
      def,
      label: _capFirst(label),
      hediffClass: cls,
      category,
      defaultSeverity: initSev,
      _completeness: completenessReasons.length ? 'partial' : 'complete',
      _completenessReasons: _uniqueStrings(completenessReasons),
      _provenance: { modId: null, sources: [] },
    };
    if (anyDisable) entry.disabledWorkStages = disabledWorkStages.sort((a, b) => a.min - b.min);
    if (anyHidden) entry.hiddenStages = hiddenStages.sort((a, b) => a.min - b.min);
    if (anyCapMod) entry.capModStages = capModStages.sort((a, b) => a.minSeverity - b.minSeverity);
    out.push(entry);
  }
  return out;
}

// Parse scanned <PawnRelationDef> XML into a flat catalogue of directly-assignable
// relations for the relationship editor. Implied relations (Sibling, Grandparent, etc.)
// are derived by the game and never stored in directRelations, so they are excluded.
// Renderer-only (DOMParser).
function parseRelationCatalogFromXML(xmlString) {
  const out = [];
  let doc;
  try { doc = new DOMParser().parseFromString(xmlString || '', 'text/xml'); } catch (_) { return out; }
  for (const r of doc.querySelectorAll('PawnRelationDef')) {
    if (r.getAttribute('Abstract') === 'True') continue;
    const def = ((r.querySelector('defName') || {}).textContent || '').trim();
    if (!def) continue;
    const implied = /^true$/i.test(((r.querySelector('implied') || {}).textContent || '').trim());
    if (implied) continue;
    const label = ((r.querySelector('label') || {}).textContent || def).trim();
    out.push({ def, label: _capFirst(label) });
  }
  return out;
}

// Parse scanned <VSE.Passions.PassionDef> XML into a catalogue of modded passions.
// This is the Vanilla Skills Expanded passion framework (also used by Alpha Skills);
// each passion is a real def that serialises into the vanilla <passion> tag by its
// defName (e.g. AS_CompetitivePassion, VSE_Apathy). The dotted tag name MUST be read
// with getElementsByTagName: in a browser querySelector('VSE.Passions.PassionDef')
// would parse the dots as CSS classes and match nothing. Renderer-only (DOMParser).
function parsePassionCatalogFromXML(xmlString) {
  const out = [];
  let doc;
  try { doc = new DOMParser().parseFromString(xmlString || '', 'text/xml'); } catch (_) { return out; }
  const nodes = doc.getElementsByTagName ? doc.getElementsByTagName('VSE.Passions.PassionDef') : [];
  const seen = new Set();
  for (let i = 0; i < nodes.length; i++) {
    const p = nodes[i];
    if (p.getAttribute && p.getAttribute('Abstract') === 'True') continue;
    const def = ((p.querySelector('defName') || {}).textContent || '').trim();
    if (!def || seen.has(def)) continue; // mods ship 1.3/1.4/1.5/1.6 copies; keep the first
    seen.add(def);
    const label = ((p.querySelector('label') || {}).textContent || def).trim();
    const indicator = ((p.querySelector('indicatorString') || {}).textContent || '').trim();
    const colorRaw = ((p.querySelector('color') || {}).textContent || '').trim();
    const isBad = /^true$/i.test(((p.querySelector('isBad') || {}).textContent || '').trim());
    const description = ((p.querySelector('description') || {}).textContent || '').trim();
    // Map the def's display colour to a learning bucket so the optimiser and joy maths
    // treat a modded passion roughly like its nearest vanilla tier. Bad passions
    // (isBad, e.g. VSE Apathy = reduced learning/interest) map to -1: actively worse
    // than no passion, so auto-assign never treats them as a plus.
    const bucket = isBad ? -1 : /major/i.test(colorRaw) ? 2 : /disabled/i.test(colorRaw) ? 0 : 1;
    // A "triggered" passion is a runtime-only state the mod flips on automatically
    // when its condition is met (e.g. the _Active variants), not something meant to be
    // hand-picked. Flagged so the picker can tuck these away by default.
    const isTriggered = /^true$/i.test(((p.querySelector('isTriggered') || {}).textContent || '').trim());
    const commTxt = ((p.querySelector('commonality') || {}).textContent || '').trim();
    const commonality = commTxt === '' ? null : (parseFloat(commTxt) || 0);
    out.push({ def, label: _capFirst(label), indicator, color: colorRaw, bucket, isBad, description, isTriggered, commonality });
  }
  return out;
}

// Parse scanned <GeneDef> XML into a { defName: [r,g,b] } colour map, from whichever of
// <skinColorOverride> / <skinColorBase> / <hairColorOverride> a gene defines. RimWorld
// writes these as either 0-255 ints "(255, 239, 213)" or 0-1 floats "(0.65, 0.65, 0.65)";
// both are normalised to 0-255. Lets the gene displays tint a colour gene by its real
// colour, for vanilla AND modded genes, with no hardcoded table. Renderer-only (DOMParser).
function parseGeneColorsFromXML(xmlString) {
  const out = {};
  let doc;
  try { doc = new DOMParser().parseFromString(xmlString || '', 'text/xml'); } catch (_) { return out; }
  for (const g of doc.querySelectorAll('GeneDef')) {
    const def = ((g.querySelector('defName') || {}).textContent || '').trim();
    if (!def) continue;
    // kind: 'override' (exotic skin, suppresses melanin), 'base' (natural melanin), 'hair'.
    let col = g.querySelector('skinColorOverride'), kind = 'override';
    if (!col) { col = g.querySelector('skinColorBase'); kind = 'base'; }
    if (!col) { col = g.querySelector('hairColorOverride'); kind = 'hair'; }
    if (!col) continue;
    const nums = (col.textContent || '').match(/-?\d*\.?\d+/g);
    if (!nums || nums.length < 3) continue;
    let r = parseFloat(nums[0]), gg = parseFloat(nums[1]), b = parseFloat(nums[2]);
    if (r <= 1 && gg <= 1 && b <= 1) { r *= 255; gg *= 255; b *= 255; } // 0-1 float form
    out[def] = { rgb: [Math.max(0, Math.min(255, Math.round(r))), Math.max(0, Math.min(255, Math.round(gg))), Math.max(0, Math.min(255, Math.round(b)))], kind };
  }
  return out;
}

// Parse scanned <GeneDef> XML into { id: geneObj }. Captures name, category, and the
// work-relevant effects we can read statically: a single <aptitudeOffset> (its skill
// inferred from a SkillDef name in the defName) and <disabledWorkTags> (mapped to the
// app's incapability tags). These feed effectiveSkill / isIncapable so the auto-assigner
// respects modded-xenotype strengths and weaknesses.
// NOTE: vanilla aptitude genes are GeneTemplateDefs (generated per skill), not static
// <GeneDef>s, so they aren't seen here; the curated GENES list already covers those.
// Renderer-only (uses DOMParser).
function parseGenesFromXML(xmlString) {
  const results = {};
  let doc;
  try { doc = new DOMParser().parseFromString(xmlString || '', 'text/xml'); } catch (_) { return results; }
  for (const gDef of doc.querySelectorAll('GeneDef')) {
    if (gDef.getAttribute('Abstract') === 'True') continue;
    const defName = (gDef.querySelector('defName') || {}).textContent;
    if (!defName || !defName.trim()) continue;
    const dn = defName.trim();
    const label = (gDef.querySelector('label') || {}).textContent || dn;
    const cat = ((gDef.querySelector('displayCategory') || {}).textContent || 'Modded').trim();
    const desc = ((gDef.querySelector('description') || {}).textContent || 'Scanned from installed content.').trim();

    // Skill aptitude: a static modded gene may carry an <aptitudeOffset> (int). The skill
    // it applies to is inferred from a SkillDef name appearing in the defName (e.g.
    // "SomeMod_Mining"). One skill per gene; nothing fabricated when no skill is found.
    const skillMods = {};
    const aptNode = gDef.querySelector('aptitudeOffset');
    if (aptNode) {
      const off = parseInt((aptNode.textContent || '').trim(), 10);
      if (off) {
        const lowDn = dn.toLowerCase();
        for (const sd in XENO_GENE_SKILL_MAP) {
          if (lowDn.includes(sd.toLowerCase())) { skillMods[XENO_GENE_SKILL_MAP[sd]] = off; break; }
        }
      }
    }

    // Disabled work tags -> the app's incapability tags (reusing WORKTAG_TO_INCAP, which keys
    // both PascalCase and lowercase), so isIncapable filters those jobs.
    const incapable = [];
    const dwtEl = gDef.querySelector('disabledWorkTags');
    if (dwtEl) {
      for (const li of dwtEl.querySelectorAll('li')) {
        const raw = (li.textContent || '').trim();
        if (!raw) continue;
        if (raw.toLowerCase() === 'allwork') { incapable.push(...new Set(Object.values(WORKTAG_TO_INCAP))); continue; }
        const mapped = WORKTAG_TO_INCAP[raw];
        if (mapped) incapable.push(mapped);
      }
    }

    const id = 'mod_gene_' + _sanId(dn);
    const out = {
      id, label: _capFirst(label.trim()), category: _capFirst(cat),
      description: desc, skillMods, modSource: 'Scanned mod',
      permissionSources: [_parsePermissionSource(gDef, 'disabledWorkTags', 'workTag')],
    };
    if (incapable.length) out.incapable = [...new Set(incapable)];
    results[id] = out;
  }
  return results;
}

// Clean a RimWorld backstory <baseDesc> for display: turn the [PAWN_*] grammar
// tokens into neutral words and strip anything left over.
function _cleanBackstoryDesc(raw) {
  let s = String(raw || '').replace(/\\n/g, '\n').trim();
  if (!s) return '';
  s = s
    .replace(/\[PAWN_nameDef\]|\[PAWN_nameFull\]|\[PAWN_label\]|\[PAWN_name\]/gi, 'They')
    .replace(/\[PAWN_pronoun\]/gi, 'they')
    .replace(/\[PAWN_possessive\]/gi, 'their')
    .replace(/\[PAWN_objective\]/gi, 'them')
    .replace(/\[PAWN_reflexive\]/gi, 'themselves')
    .replace(/\[[^\]]*\]/g, '')   // drop any remaining tokens
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return s;
}

// Parse scanned <BackstoryDef> XML into { id: backstoryObj } with the story text
// (baseDesc), slot, skillGains (app ids) and workDisables (incap ids).
// Renderer-only (uses DOMParser).
function parseBackstoriesFromXML(xmlString) {
  const results = {};
  let doc;
  try { doc = new DOMParser().parseFromString(xmlString || '', 'text/xml'); } catch (_) { return results; }
  const skillMap = (typeof BACKSTORY_SKILL_MAP !== 'undefined') ? BACKSTORY_SKILL_MAP : {};
  const incapMap = (typeof WORKTAG_TO_INCAP !== 'undefined') ? WORKTAG_TO_INCAP : {};
  const skillIdOf = (name) => skillMap[String(name || '').trim()] || _rwSkillToAppId(name);
  for (const b of doc.querySelectorAll('BackstoryDef')) {
    if (b.getAttribute('Abstract') === 'True') continue;
    const defName = (b.querySelector('defName') || {}).textContent;
    if (!defName || !defName.trim()) continue;
    const dn = defName.trim();
    const slotRaw = ((b.querySelector('slot') || {}).textContent || '').trim().toLowerCase();
    const slot = slotRaw.indexOf('child') === 0 ? 'child' : slotRaw.indexOf('adult') === 0 ? 'adult' : '';
    if (!slot) continue;
    // RimWorld stores backstory titles lowercase ("vatgrown soldier") - capitalise
    // the first letter for display, matching the baked vanilla list's style.
    const title = _capFirst((((b.querySelector('title') || {}).textContent) || dn).trim());
    const titleShort = _capFirst((((b.querySelector('titleShort') || {}).textContent) || title).trim());
    // The story lives in <description> (older/modded defs may use <baseDesc>).
    // Keep it raw (with [PAWN_*] tokens) so it can be personalised to the selected
    // pawn at display time (see _personalizeBackstory in app-pawns.js).
    const descNode = b.querySelector('description') || b.querySelector('baseDesc');
    const desc = String((descNode && descNode.textContent) || '').replace(/\\n/g, '\n').trim();
    const skills = {};
    const sg = b.querySelector('skillGains');
    if (sg) {
      const lis = Array.from(sg.children).filter(c => c.tagName.toLowerCase() === 'li');
      if (lis.length) {
        for (const li of lis) {
          const id = skillIdOf((li.querySelector('key, skill') || {}).textContent);
          const v = parseInt(((li.querySelector('value, amount') || {}).textContent) || '', 10);
          if (id && Number.isFinite(v) && v !== 0) skills[id] = (skills[id] || 0) + v;
        }
      } else {
        for (const ch of Array.from(sg.children)) {
          const id = skillIdOf(ch.tagName);
          const v = parseInt(ch.textContent || '', 10);
          if (id && Number.isFinite(v) && v !== 0) skills[id] = (skills[id] || 0) + v;
        }
      }
    }
    const incapable = [];
    const wd = b.querySelector('workDisables');
    if (wd) {
      const lis = Array.from(wd.children).filter(c => c.tagName.toLowerCase() === 'li');
      const tags = lis.length ? lis.map(li => li.textContent.trim())
                              : String(wd.textContent || '').split(',').map(x => x.trim()).filter(Boolean);
      for (const t of tags) {
        const inc = incapMap[t] || incapMap[t.toLowerCase()];
        if (inc && incapable.indexOf(inc) < 0) incapable.push(inc);
      }
    }
    results[dn] = {
      id: dn,
      slot,
      title,
      titleShort,
      desc,
      skills,
      incapable,
      permissionSources: [_parsePermissionSource(b, 'workDisables', 'workTag')],
      modSource: 'Scanned',
    };
  }
  return results;
}

const TRAITS = [
  { id: 'night_owl', label: 'Night Owl', description: 'Likes to work at night.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'undergrounder', label: 'Undergrounder', description: 'No need for outdoors or light.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'nudist', label: 'Nudist', description: 'Enjoys being nude.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'masochist', label: 'Masochist', description: 'Excited by getting hurt.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'body_modder', label: 'Body Modder', description: 'Dreams of artificial enhancements.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'body_purist', label: 'Body Purist', description: 'Dislikes artificial body parts.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'gourmand', label: 'Gourmand', description: 'Life revolves around food. +4 Cooking.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: { cook: 4 } },
  { id: 'ascetic', label: 'Ascetic', description: 'Prefers simple lifestyle.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'greedy', label: 'Greedy', description: 'Needs impressive bedroom.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'jealous', label: 'Jealous', description: 'Dislikes others having better rooms.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'pyromaniac', label: 'Pyromaniac', description: 'Loves fire; will start fires.', workSpeed: 0, learningRate: 0, breakThreshold: 0.08, skillMods: {}, incapable: ['firefight'], disabledWorkTagsExact: ['Firefighting'] },
  { id: 'bloodlust', label: 'Bloodlust', description: 'Rush from hurting people.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'cannibal', label: 'Cannibal', description: 'Likes eating human meat.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'psychopath', label: 'Psychopath', description: 'No empathy for others.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'nimble', label: 'Nimble', description: 'Preternatural grace. +15 Dodge.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'brawler', label: 'Brawler', description: 'Likes close combat. +4 Melee, -10 Shooting.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: { melee: 4, shoot: -10 } },
  { id: 'tough', label: 'Tough', description: 'Hard to kill. x50% Damage.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'wimp', label: 'Wimp', description: 'Weak and cowardly. -50% Pain Threshold.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'delicate', label: 'Delicate', description: 'Fragile skin and bones.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'too_smart', label: 'Too Smart', description: 'Fast learner but eccentric. +75% learning, +12% break threshold.', workSpeed: 0, learningRate: 0.75, breakThreshold: 0.12, skillMods: {} },
  { id: 'fast_learner', label: 'Fast Learner', description: 'Knack for learning. +75% learning.', workSpeed: 0, learningRate: 0.75, breakThreshold: 0, skillMods: {} },
  { id: 'slow_learner', label: 'Slow Learner', description: 'Slow on the uptake. -75% learning.', workSpeed: 0, learningRate: -0.75, breakThreshold: 0, skillMods: {} },
  { id: 'quick_sleeper', label: 'Quick Sleeper', description: 'Needs less sleep. +50% Rest Rate.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'great_memory', label: 'Great Memory', description: 'Fantastic memory. x50% Skill loss rate.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'tortured_artist', label: 'Tortured Artist', description: 'Alienated and misunderstood.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'kind', label: 'Kind', description: 'Agreeable and giving.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'abrasive', label: 'Abrasive', description: 'Says exactly what is on their mind.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'annoying_voice', label: 'Annoying Voice', description: 'Grating, nasal voice.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'creepy_breathing', label: 'Creepy Breathing', description: 'Heavy breathing; sweats.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'misandrist', label: 'Misandrist', description: 'Dislikes and distrusts men.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'misogynist', label: 'Misogynist', description: 'Dislikes and distrusts women.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'industrious', label: 'Industrious', description: 'Stays on-task and focused. +35% work speed.', workSpeed: 0.35, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'hard_worker', label: 'Hard Worker', description: 'Natural hard worker. +20% work speed.', workSpeed: 0.2, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'lazy', label: 'Lazy', description: 'A little bit lazy. -20% work speed.', workSpeed: -0.2, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'slothful', label: 'Slothful', description: 'Loves idleness. -35% work speed.', workSpeed: -0.35, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'jogger', label: 'Jogger', description: 'Moves with urgency. +0.4 c/s speed.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'fast_walker', label: 'Fast Walker', description: 'Walks quicker than most. +0.2 c/s speed.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'slowpoke', label: 'Slowpoke', description: 'Falling behind the group. -0.2 c/s speed.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'sanguine', label: 'Sanguine', description: 'Naturally upbeat. +12 mood.', workSpeed: 0, learningRate: 0, breakThreshold: -0.06, skillMods: {} },
  { id: 'optimist', label: 'Optimist', description: 'Naturally optimistic. +6 mood.', workSpeed: 0, learningRate: 0, breakThreshold: -0.03, skillMods: {} },
  { id: 'pessimist', label: 'Pessimist', description: 'Looks on the bad side. -6 mood.', workSpeed: 0, learningRate: 0, breakThreshold: 0.03, skillMods: {} },
  { id: 'depressive', label: 'Depressive', description: 'Perennially unhappy. -12 mood.', workSpeed: 0, learningRate: 0, breakThreshold: 0.06, skillMods: {} },
  { id: 'iron_willed', label: 'Iron-willed', description: 'Iron shield will. -18% break threshold.', workSpeed: 0, learningRate: 0, breakThreshold: -0.18, skillMods: {} },
  { id: 'steadfast', label: 'Steadfast', description: 'Mentally tough. -9% break threshold.', workSpeed: 0, learningRate: 0, breakThreshold: -0.09, skillMods: {} },
  { id: 'nervous', label: 'Nervous', description: 'Cracks under pressure. +8% break threshold.', workSpeed: 0, learningRate: 0, breakThreshold: 0.08, skillMods: {} },
  { id: 'volatile', label: 'Volatile', description: 'Hair-trigger personality. +15% break threshold.', workSpeed: 0, learningRate: 0, breakThreshold: 0.15, skillMods: {} },
  { id: 'neurotic', label: 'Neurotic', description: 'Likes things squared away. +20% work speed, +8% break threshold.', workSpeed: 0.20, learningRate: 0, breakThreshold: 0.08, skillMods: {} },
  { id: 'very_neurotic', label: 'Very Neurotic', description: 'Constantly nervous. +40% work speed, +14% break threshold.', workSpeed: 0.40, learningRate: 0, breakThreshold: 0.14, skillMods: {} },
  { id: 'careful_shooter', label: 'Careful Shooter', description: 'Takes more time to aim. +5 Shooting Accuracy.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: { shoot: 2 } },
  { id: 'trigger_happy', label: 'Trigger-happy', description: 'Likes pulling the trigger. -5 Shooting Accuracy.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: { shoot: -2 } },
  { id: 'beautiful', label: 'Beautiful', description: 'Exceptionally beautiful. +2 Pawn Beauty.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'pretty', label: 'Pretty', description: 'Pretty face. +1 Pawn Beauty.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'ugly', label: 'Ugly', description: 'Somewhat ugly. -1 Pawn Beauty.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'staggeringly_ugly', label: 'Staggeringly Ugly', description: 'Extremely unattractive. -2 Pawn Beauty.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'super_immune', label: 'Super-immune', description: 'Powerful immune system.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'sickly', label: 'Sickly', description: 'Awful immune system. +4 Medical.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: { medicine: 4 } },
  { id: 'perfect_memory', label: 'Perfect Memory', description: 'Outstanding memory. Skills never decay.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'occultist', label: 'Occultist', description: 'Knowledge of dark energy. +100% study.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: { intel: 2 } },
  { id: 'joyous', label: 'Joyous', description: 'Makes everyone feel better.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'body_mastery', label: 'Body Mastery', description: 'No basic needs (Food/Sleep).', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'disturbing', label: 'Disturbing', description: 'Fixated on horrendous ideas.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
  { id: 'void_fascination', label: 'Void Fascination', description: 'Intrigued by entities.', workSpeed: 0, learningRate: 0, breakThreshold: 0, skillMods: {} },
];

// Role work restrictions verified against Ideology's Precepts_Role.xml
// (<roleDisabledWorkTags>). Leader and Moral Guide disable NOTHING in-game - only the
// specialist roles refuse work. Tags map to app incap ids via the same scheme as
// WORKTAG_TO_INCAP; "Constructing" has no dedicated incap id so it rides on
// 'skilled_labor', which is safe because every role that disables Constructing also
// disables Crafting (the other jobs skilled_labor blocks).
const DEFAULT_ROLES = [
  { id: 'none', label: 'No Role', skillMods: {}, workSpeed: 0, incap: [], disabledWorkTagsExact: [], description: 'Standard member.' },
  { id: 'leader', label: 'Colony Leader', skillMods: { social: 4 }, workSpeed: 0.1, incap: [], disabledWorkTagsExact: [], description: 'Inspired leadership. +4 Social, +10% work speed. No work restrictions.' },
  { id: 'guide', label: 'Moral Guide', skillMods: { social: 6 }, workSpeed: 0, incap: [], disabledWorkTagsExact: [], description: 'Spiritual focus. +6 Social. No work restrictions.' },
  { id: 'production', label: 'Production Specialist', skillMods: { craft: 6, construct: 6 }, workSpeed: 0.5, incap: ['dumb_labor', 'animals', 'cooking', 'plantwork', 'mining'], disabledWorkTagsExact: ['ManualDumb', 'Animals', 'Cooking', 'PlantWork', 'Mining'], description: 'Focus on efficiency. +6 Craft/Build, +50% work speed. Refuses dumb labour, animals, cooking, plant work and mining.' },
  { id: 'shooting', label: 'Shooting Specialist', skillMods: { shoot: 4 }, workSpeed: 0, incap: ['crafting', 'cooking', 'plantwork', 'mining', 'skilled_labor'], disabledWorkTagsExact: ['Crafting', 'Cooking', 'PlantWork', 'Mining', 'Constructing'], description: 'Combat elite. +4 Shooting, Aiming speed bonus. Refuses crafting, cooking, plant work, mining and construction.' },
  { id: 'melee', label: 'Melee Specialist', skillMods: { melee: 4 }, workSpeed: 0, incap: ['crafting', 'cooking', 'plantwork', 'mining', 'skilled_labor', 'hunting'], disabledWorkTagsExact: ['Crafting', 'Cooking', 'PlantWork', 'Mining', 'Constructing', 'Hunting', 'Shooting'], description: 'CQC Expert. +4 Melee. Refuses crafting, cooking, plant work, mining, construction and hunting.' },
  { id: 'medical', label: 'Medical Specialist', skillMods: { medicine: 4 }, workSpeed: 0, incap: ['violence'], disabledWorkTagsExact: ['Violent'], description: 'Master healer. +4 Medicine, +50% tend speed. Refuses all violence.' },
  { id: 'mining', label: 'Mining Specialist', skillMods: { mine: 4 }, workSpeed: 0.5, incap: ['animals', 'crafting', 'cooking', 'plantwork', 'skilled_labor'], disabledWorkTagsExact: ['Animals', 'Crafting', 'Cooking', 'PlantWork', 'Constructing'], description: 'Deep driller. +4 Mining, +50% mining speed. Refuses animals, crafting, cooking, plant work and construction.' },
  { id: 'plants', label: 'Plants Specialist', skillMods: { plant: 4 }, workSpeed: 0.5, incap: ['animals', 'crafting', 'cooking', 'skilled_labor', 'mining'], disabledWorkTagsExact: ['Animals', 'Crafting', 'Cooking', 'Constructing', 'Mining'], description: 'Green thumb. +4 Plants, +50% harvest yield/speed. Refuses animals, crafting, cooking, construction and mining.' },
  { id: 'animal', label: 'Animal Specialist', skillMods: { animal: 4 }, workSpeed: 0, incap: ['crafting', 'cooking', 'plantwork', 'skilled_labor', 'mining'], disabledWorkTagsExact: ['Crafting', 'Cooking', 'PlantWork', 'Constructing', 'Mining'], description: 'Beast master. +4 Animals, +50% tame/train chance. Refuses crafting, cooking, plant work, construction and mining.' },
  { id: 'research', label: 'Research Specialist', skillMods: { intel: 4 }, workSpeed: 0.5, incap: ['dumb_labor', 'animals', 'cooking', 'plantwork', 'mining'], disabledWorkTagsExact: ['ManualDumb', 'Animals', 'Cooking', 'PlantWork', 'Mining'], description: 'Great thinker. +4 Intellectual, +50% research speed. Refuses dumb labour, animals, cooking, plant work and mining.' },
];

const INCAP_OPTIONS = [
  {id:'violence',       label:'Violence'},
  {id:'firefight',      label:'Firefighting'},
  {id:'hunting',        label:'Hunting'},
  {id:'hauling',        label:'Hauling'},
  {id:'cleaning',       label:'Cleaning'},
  {id:'cooking',        label:'Cooking'},
  {id:'doctoring',      label:'Doctoring'},
  {id:'research',       label:'Research'},
  {id:'caring',         label:'Caring'},
  {id:'dumb_labor',     label:'Dumb Labour'},
  {id:'skilled_labor',  label:'Skilled Labour'},
  {id:'social',         label:'Social'},
  {id:'animals',        label:'Animals'},
  {id:'artistic',       label:'Artistic'},
  {id:'crafting',       label:'Crafting'},
  {id:'plantwork',      label:'Plant Work'},
  {id:'mining',         label:'Mining'},
];

// Map RimWorld WorkTag names (from save files & backstory XML) → app incap IDs
const WORKTAG_TO_INCAP = {
  'Violent': 'violence', 'violent': 'violence',
  'Caring': 'caring', 'caring': 'caring',
  'Social': 'social', 'social': 'social',
  'ManualDumb': 'dumb_labor', 'manualdumb': 'dumb_labor',
  'ManualSkilled': 'skilled_labor', 'manualskilled': 'skilled_labor',
  'Hauling': 'hauling', 'hauling': 'hauling',
  'PlantWork': 'plantwork', 'plantwork': 'plantwork',
  'Animals': 'animals', 'animals': 'animals',
  'Artistic': 'artistic', 'artistic': 'artistic',
  'Crafting': 'crafting', 'crafting': 'crafting',
  'Cooking': 'cooking', 'cooking': 'cooking',
  'Firefighting': 'firefight', 'firefighting': 'firefight',
  'Cleaning': 'cleaning', 'cleaning': 'cleaning',
  'Mining': 'mining', 'mining': 'mining',
  'Intellectual': 'research', 'intellectual': 'research',
  'Hunting': 'hunting', 'hunting': 'hunting'
};

// Exact Verse.WorkTags values from RimWorld 1.6.4871. Canonical C2/C4 code uses
// this closed vocabulary; the legacy map above remains a C1 projection only.
const RIMWORLD_WORK_TAG_VALUES = Object.freeze({
  ManualDumb: 2,
  ManualSkilled: 4,
  Violent: 8,
  Caring: 16,
  Social: 32,
  Commoner: 64,
  Intellectual: 128,
  Animals: 256,
  Artistic: 512,
  Crafting: 1024,
  Cooking: 2048,
  Firefighting: 4096,
  Cleaning: 8192,
  Hauling: 16384,
  PlantWork: 32768,
  Mining: 65536,
  Hunting: 131072,
  Constructing: 262144,
  Shooting: 524288,
  AllWork: 1048576,
});

const DEFAULT_PRECEPTS = [
  { id: 'research_speed', label: 'Research Speed', value: 1.0, type: 'multiplier', description: 'Global research output multiplier.' },
  { id: 'mining_yield', label: 'Mining Yield', value: 1.0, type: 'multiplier', description: 'Global mining output multiplier.' },
  { id: 'work_drive', label: 'Work Drive', value: 0, type: 'bonus', description: 'Flat work speed bonus for everyone.' },
  { id: 'combat_focus', label: 'Combat Focus', value: 0, type: 'bonus', description: 'Flat skill bonus to shooting/melee.' },
];

// ─── IDEOLOGY SYSTEM ─────────────────────────────────────────────────────────
// Memes: core beliefs that define an ideology. Max 4 per ideology (vanilla).
// Each meme unlocks/requires certain precepts and provides passive effects.
const IDEO_MEMES = [
  // Structure memes: every in-game ideoligion has EXACTLY ONE (verified against
  // Memes_Structures_Basic.xml). They frame the belief system rather than grant stats,
  // so they carry no effects; selecting one swaps out any other structure meme.
  { id: 'structure_theistEmbodied', label: 'Theist (Embodied)', category: 'Structure', color: '#d4b05a', description: 'We worship deities who physically exist in the world and may walk among us.', effects: {}, conflicts: [], specialists: [] },
  { id: 'structure_theistAbstract', label: 'Theist (Abstract)', category: 'Structure', color: '#b8a06a', description: 'We worship abstract deities who exist beyond the physical world.', effects: {}, conflicts: [], specialists: [] },
  { id: 'structure_animist', label: 'Animist', category: 'Structure', color: '#6ab87a', description: 'Spirits inhabit animals, objects and places, and must be respected.', effects: {}, conflicts: [], specialists: [] },
  { id: 'structure_archist', label: 'Archist', category: 'Structure', color: '#6a9ed4', description: 'We venerate the archotech superintelligences as gods in the machine.', effects: {}, conflicts: [], specialists: [] },
  { id: 'structure_ideological', label: 'Ideological', category: 'Structure', color: '#c97a6a', description: 'No deities, only a system of ideas about how people should live.', effects: {}, conflicts: [], specialists: [] },
  // Social organisation memes (normal memes in the game; impact matches MemeDef XML)
  { id: 'collectivist', label: 'Collectivist', category: 'Social', color: '#e8a838', description: 'The group matters more than the individual.', impact: 'low', effects: { workSpeed: 0.10, mood: 0 }, conflicts: ['individualist'], specialists: ['production'] },
  { id: 'individualist', label: 'Individualist', category: 'Social', color: '#73b8f5', description: 'Personal freedom above all.', impact: 'low', effects: { mood: 5, workSpeed: 0 }, conflicts: ['collectivist', 'supremacist'], specialists: [] },
  { id: 'supremacist', label: 'Supremacist', category: 'Social', color: '#e05555', description: 'Our kind is superior. Outsiders have no value.', impact: 'low', effects: { combatSkill: 2, mood: -3 }, conflicts: ['individualist', 'loyalist', 'guilty'], specialists: ['shooting', 'melee'] },
  { id: 'guilty', label: 'Guilty', category: 'Social', color: '#7de85a', description: 'We carry guilt from ages past. Others are more worthy.', impact: 'low', effects: { socialSkill: 2, mood: 3 }, conflicts: ['supremacist'], specialists: [] },
  { id: 'loyalist', label: 'Loyalist', category: 'Social', color: '#5b8fd4', description: 'We stand for our own before outsiders.', impact: 'low', effects: { mood: 2, combatSkill: 1 }, conflicts: ['supremacist'], specialists: ['shooting'] },
  // Theme memes
  { id: 'transhumanist', label: 'Transhumanist', category: 'Theme', color: '#5bc8d4', description: 'Human progress means merging with technology.', impact: 'medium', effects: { researchSpeed: 0.15, mood: -5 }, conflicts: ['fleshPurity'], specialists: ['research'], forcedPrecepts: { nutrient_paste: 'fine', body_modification: 'approved', age_reversal: 'demanded' }, unlocks: { buildables: ['Neural supercharger', 'Sleep accelerator', 'Hex carpet', 'Hex tile'] }, agreeingTraits: ['Body modder'], conflictingTraits: ['Body purist'], culture: 'Techist' },
  { id: 'fleshPurity', label: 'Flesh Purity', category: 'Theme', color: '#f0857a', description: 'The body is pure and natural. Artificial implants are an abomination.', impact: 'medium', effects: { mood: 3, immunityGain: 0.05 }, conflicts: ['transhumanist'], specialists: ['medical'], agreeingTraits: ['Body purist'], conflictingTraits: ['Body modder'] },
  { id: 'tunneler', label: 'Tunneler', category: 'Theme', color: '#8B5E3C', description: 'Humans ought to live underground, enjoying the succulent fruit of the depths.', impact: 'high', effects: { miningSpeed: 0.25, mood: 3 }, conflicts: [], specialists: ['mining'], forcedPrecepts: { fungus: 'preferred', insect_meat: 'loved', mining: 'valued' }, unlocks: { buildables: ['Fungal gravel'], research: ['Stonecutting'] }, agreeingTraits: ['Undergrounder'] },
  { id: 'naturePrimacy', label: 'Nature Primacy', category: 'Theme', color: '#4a9e4a', description: 'Man is a stain on nature\'s perfection.', impact: 'medium', effects: { plantSpeed: 0.20, mood: 3 }, conflicts: ['humanPrimacy'], specialists: ['plants'], culture: 'Animalist' },
  { id: 'treeConnection', label: 'Tree Connection', category: 'Theme', color: '#2d8f3b', description: 'Trees are the essence of life, and we must be near them.', impact: 'high', effects: { plantSpeed: 0.25, mood: 2 }, conflicts: [], specialists: ['plants'], forcedPrecepts: { tree_cutting: 'despised' }, unlocks: { research: ['Tree sowing'] } },
  { id: 'painIsVirtue', label: 'Pain is Virtue', category: 'Theme', color: '#c97af5', description: 'Virtue is shown through suffering of self and others.', impact: 'high', effects: { painFactor: -0.20, mood: 0 }, conflicts: [], specialists: [], forcedPrecepts: { scarification: 'required' }, unlocks: { rituals: ['Scarification', 'Symbol burning'], buildables: ['Slab bed', 'Slab double bed'], apparel: ['Torture crown'] }, agreeingTraits: ['Ascetic', 'Tortured artist', 'Masochist'], conflictingTraits: ['Wimp', 'Gourmand'], culture: 'Morbid' },
  { id: 'blindsight', label: 'Blindsight', category: 'Theme', color: '#333366', description: 'Only the blind can perceive true reality. +30% psychic sensitivity when blind.', impact: 'high', effects: { psychicSensitivity: 0.40, mood: -8 }, conflicts: [], specialists: [], forcedPrecepts: { autonomous_weapons: 'neutral', blindness: 'respected' } },
  { id: 'darkness', label: 'Darkness', category: 'Theme', color: '#444466', description: 'Light burns and destroys. People ought to live in darkness.', impact: 'high', effects: { mood: 0, workSpeed: 0.05 }, conflicts: [], specialists: ['mining'] },
  { id: 'rancher', label: 'Rancher', category: 'Theme', color: '#e0955a', description: 'Raising animals is the right way; raising plants to eat is not.', impact: 'medium', effects: { animalSkill: 4, mood: 2 }, conflicts: ['animalist'], specialists: ['animals'], forcedPrecepts: { meat_eating: 'carnivore' } },
  { id: 'animalist', label: 'Animal Personhood', category: 'Theme', color: '#6ad4c8', description: 'Animals deserve the same respect as people. It is wrong to kill them.', impact: 'high', effects: { mood: 4, animalSkill: 2 }, conflicts: ['rancher'], specialists: ['animals'], forcedPrecepts: { meat_eating: 'vegetarian' } },
  { id: 'raider', label: 'Raider', category: 'Theme', color: '#d14040', description: 'The strong should take from the weak.', impact: 'medium', effects: { combatSkill: 3, mood: -3 }, conflicts: [], specialists: ['shooting', 'melee'] },
  { id: 'nudism', label: 'Nudism', category: 'Theme', color: '#f5b8d4', description: 'Clothing binds, controls, and suffocates us. We should all hang free.', impact: 'high', effects: { mood: 5, workSpeed: 0 }, conflicts: [], specialists: [], forcedPrecepts: { nudity: 'approved' }, agreeingTraits: ['Nudist'] },
  { id: 'cannibal', label: 'Cannibal', category: 'Theme', color: '#8b2020', description: 'We must consume human flesh. It is our way.', impact: 'high', effects: { mood: 0, combatSkill: 1 }, conflicts: [], specialists: [], forcedPrecepts: { cannibalism: 'preferred' }, agreeingTraits: ['Cannibal'] },
  { id: 'highLife', label: 'High Life', category: 'Theme', color: '#b05ad4', description: 'Exotic states of mind are central to a good life.', impact: 'medium', effects: { mood: 3, workSpeed: -0.05 }, conflicts: ['fleshPurity'], specialists: [], forcedPrecepts: { drugs: 'essential' }, agreeingTraits: ['Chemical interest', 'Chemical fascination'] },
  { id: 'humanPrimacy', label: 'Human Primacy', category: 'Theme', color: '#d4a05a', description: 'Humans are the moral center of the universe.', impact: 'medium', effects: { combatSkill: 1, mood: 0 }, conflicts: ['animalist'], specialists: ['animals'] },
  // Gender supremacy memes
  { id: 'femaleSupremacy', label: 'Female Supremacy', category: 'Theme', color: '#e85a9e', description: 'Women are the superior gender and should rule.', impact: 'medium', effects: { mood: 0 }, conflicts: ['maleSupremacy'], specialists: [], agreeingTraits: ['Misandrist'], conflictingTraits: ['Misogynist'] },
  { id: 'maleSupremacy', label: 'Male Supremacy', category: 'Theme', color: '#5a7ae8', description: 'Men are the superior gender and should rule.', impact: 'medium', effects: { mood: 0 }, conflicts: ['femaleSupremacy'], specialists: [], agreeingTraits: ['Misogynist'], conflictingTraits: ['Misandrist'] },
  // DLC memes
  { id: 'bloodfeeding', label: 'Bloodfeeding', category: 'Theme', color: '#8b0000', description: 'Drinking blood is sacred. Bloodfeeders should be worshipped.', impact: 'medium', dlc: 'Biotech', effects: { mood: 0 }, conflicts: [], specialists: [], forcedPrecepts: { organ_harvest: 'neutral', cannibalism: 'neutral' }, unlocks: { research: ['Electricity', 'Deathrest'] }, culture: 'Morbid' },
  { id: 'ritualist', label: 'Ritualist', category: 'Theme', color: '#7a3d9e', description: 'Through ritual we can understand and harness a greater energy in the universe.', impact: 'medium', dlc: 'Anomaly', effects: { mood: 0, researchSpeed: -0.15 }, conflicts: [], specialists: [], culture: 'Morbid' },
  { id: 'inhuman', label: 'Inhuman', category: 'Theme', color: '#444444', description: 'Humanity is a barrier to our connection with the machine god.', impact: 'high', dlc: 'Anomaly', effects: { mood: 0 }, conflicts: [], specialists: [], forcedPrecepts: { execution: 'accepted', cannibalism: 'neutral', corpses: 'sky_burial', nudity: 'neutral', organ_harvest: 'neutral', slavery: 'neutral' } },
  { id: 'shipborn', label: 'Shipborn', category: 'Theme', color: '#4a6a9e', description: 'Humans were destined to live among the stars.', impact: 'medium', dlc: 'Odyssey', effects: { mood: 0 }, conflicts: [], specialists: [], forcedPrecepts: { nutrient_paste: 'fine' }, conflictingTraits: ['Undergrounder'] },
  // Social memes
  { id: 'proselytizer', label: 'Proselytizer', category: 'Social', color: '#f5d06a', description: 'It is our duty to spread our beliefs.', impact: 'medium', effects: { socialSkill: 3, convertSpeed: 0.50 }, conflicts: [], specialists: [] },
];

// Specialist roles unlocked by memes - up to 2 types per ideology
const IDEO_SPECIALISTS = [
  { id: 'shooting', label: 'Shooting Specialist', description: '+8 Shooting, can enter berserk trance, unable to do many skilled jobs.', memes: ['supremacist', 'loyalist', 'raider'], statMods: { combatSkill: 8 }, disabledWork: ['Cooking', 'Plants', 'Mining', 'Construction', 'Crafting', 'Art', 'Tailoring', 'Smithing'] },
  { id: 'melee', label: 'Melee Specialist', description: '+8 Melee, berserk trance (0.1x pain), unable to do many skilled jobs.', memes: ['raider', 'supremacist'], statMods: { combatSkill: 8 }, disabledWork: ['Cooking', 'Plants', 'Mining', 'Construction', 'Crafting', 'Art', 'Tailoring', 'Smithing'] },
  { id: 'production', label: 'Production Specialist', description: 'Enhanced crafting, construction, and smithing work speed.', memes: ['collectivist'], statMods: { workSpeed: 0.15 } },
  { id: 'plants', label: 'Plants Specialist', description: 'Enhanced farming speed and yield. +25% pruning speed with Tree Connection.', memes: ['naturePrimacy', 'treeConnection'], statMods: { plantSpeed: 0.20 } },
  { id: 'animals', label: 'Animals Specialist', description: 'Enhanced taming and training. Combat animals fight harder.', memes: ['animalist', 'rancher', 'humanPrimacy'], statMods: { animalSkill: 4 } },
  { id: 'mining', label: 'Mining Specialist', description: 'Enhanced mining speed and deep drilling yield.', memes: ['tunneler', 'darkness'], statMods: { miningSpeed: 0.20 } },
  { id: 'research', label: 'Research Specialist', description: 'Enhanced research and scanning speed.', memes: ['transhumanist'], statMods: { researchSpeed: 0.25 } },
  { id: 'medical', label: 'Medical Specialist', description: 'Enhanced surgery success and treatment quality.', memes: ['fleshPurity'], statMods: {} },
];

// Ritual types available (display-only for planning)
const IDEO_RITUALS = [
  { id: 'dance_party', label: 'Dance Party', description: 'Colonists dance to music. Up to +16 mood, chance of +20% work speed buff.', category: 'Social', quality: 'high' },
  { id: 'drum_party', label: 'Drum Party', description: 'Drummers play as others dance. +16 mood, chance of +20% global work speed buff.', category: 'Social', quality: 'high' },
  { id: 'feast', label: 'Social Festival', description: 'Leader speaks and people gather to drink and socialise. +12 mood.', category: 'Social', quality: 'medium' },
  { id: 'gladiator_duel', label: 'Gladiator Duel', description: 'Two pawns fight for glory. Mood buff to spectators based on quality.', category: 'Combat', quality: 'medium' },
  { id: 'sacrifice', label: 'Sacrifice', description: 'A prisoner is sacrificed. Strong mood buff for believers.', category: 'Dark', quality: 'low' },
  { id: 'cannibal_feast', label: 'Cannibal Feast', description: 'Colonists devour human meat together. +12 mood for cannibals.', category: 'Dark', quality: 'low' },
  { id: 'scarification', label: 'Scarification', description: 'Moral guide scars a believer. Permanent mood buff based on scar count.', category: 'Dark', quality: 'medium' },
  { id: 'blinding', label: 'Blinding Ceremony', description: 'A believer is blinded ritually. Grants psychic sensitivity bonus.', category: 'Dark', quality: 'low' },
  { id: 'tree_celebration', label: 'Tree Celebration', description: 'Gather around a decorated tree. +10 mood, connection to nature.', category: 'Nature', quality: 'medium' },
  { id: 'funeral', label: 'Funeral', description: 'Gather around a grave to remember someone lost. Reduces grief.', category: 'Death', quality: 'medium' },
  { id: 'skylantern', label: 'Sky Lantern Festival', description: 'Release sky lanterns. +8 mood and recreation.', category: 'Social', quality: 'medium' },
  { id: 'burn_circle', label: 'Burn Circle', description: 'Burn a hated symbol (effigy or flag). +6 mood, ideological zeal.', category: 'Social', quality: 'low' },
];

// Ideology type (fluid vs fixed)
const IDEO_TYPES = [
  { id: 'fixed', label: 'Fixed', description: 'All memes and precepts locked at creation. Cannot be changed during play.' },
  { id: 'fluid', label: 'Fluid', description: 'Start with 1 meme. Earn development points to reform and add memes over time.' },
];

// Precept categories and their options with effects.
// Each precept has multiple levels the player can choose from.
const IDEO_PRECEPT_DEFS = [
  // ── Universal precepts (present in every ideoligion) ──
  { id: 'blindness', label: 'Blindness', category: 'Body', universal: true, options: [
    { id: 'horrible', label: 'Horrible', mood: -2, description: '-2 mood from someone getting blinded', blockedByMemes: ['blindsight'] },
    { id: 'respected', label: 'Respected', mood: 5, description: '+5 mood when blind, +10 opinion of blind pawns', requiredMemes: ['blindsight'] },
    { id: 'elevated', label: 'Elevated', mood: 10, description: '+10 mood when blind, +35 opinion of blind, -10 of sighted', requiredMemes: ['blindsight'] },
    { id: 'sublime', label: 'Sublime', mood: 15, description: '+15 mood when blind, +50 opinion of blind, -30 of sighted', requiredMemes: ['blindsight'] },
  ]},
  { id: 'cannibalism', label: 'Cannibalism', category: 'Food', universal: true, options: [
    { id: 'abhorrent', label: 'Abhorrent', mood: -20, description: '-20 mood from eating human meat', blockedByMemes: ['cannibal'] },
    { id: 'horrible', label: 'Horrible', mood: -12, description: '-12 mood from eating human meat', blockedByMemes: ['cannibal'] },
    { id: 'disapproved', label: 'Disapproved', mood: -5, description: '-5 mood from eating human meat', blockedByMemes: ['cannibal'] },
    { id: 'acceptable', label: 'Acceptable', mood: 0, description: 'No mood effect from human meat' },
    { id: 'preferred', label: 'Preferred', mood: 2, description: '+2 mood from eating human meat', requiredMemes: ['cannibal'] },
    { id: 'required_strong', label: 'Required (Strong)', mood: 4, description: '+4 mood, -2 for eating without human meat', requiredMemes: ['cannibal'] },
    { id: 'required_ravenous', label: 'Required (Ravenous)', mood: 6, description: '+6 mood, -4 for eating without human meat', requiredMemes: ['cannibal'] },
  ]},
  { id: 'corpses', label: 'Corpses', category: 'Death', universal: true, options: [
    { id: 'ugly', label: 'Ugly', mood: -4, description: '-4 mood from seeing corpses' },
    { id: 'dont_care', label: "Don't Care", mood: 0, description: 'No mood effect from corpses', enabledByMemes: ['painIsVirtue', 'cannibal', 'supremacist', 'raider'] },
  ]},
  { id: 'diversity_of_thought', label: 'Diversity of Thought', category: 'Social', universal: true, options: [
    { id: 'intense_bigotry', label: 'Intense Bigotry', mood: -9, description: '-9 mood from other ideologies, -25 opinion' },
    { id: 'moderate_bigotry', label: 'Moderate Bigotry', mood: -6, description: '-6 mood from other ideologies, -15 opinion' },
    { id: 'mild_bigotry', label: 'Mild Bigotry', mood: -3, description: '-3 mood from other ideologies, -5 opinion' },
    { id: 'neutral', label: 'Neutral', mood: 0, description: 'No strong feelings about other ideologies' },
    { id: 'appreciated', label: 'Appreciated', mood: 3, description: '+3 mood from other ideologies in colony' },
    { id: 'highly_appreciated', label: 'Highly Appreciated', mood: 6, description: '+6 mood from other ideologies', requiredMemes: ['individualist'] },
    { id: 'exalted', label: 'Exalted', mood: 9, description: '+9 mood from other ideologies', requiredMemes: ['individualist'] },
  ]},
  { id: 'nutrient_paste', label: 'Nutrient Paste', category: 'Food', universal: true, options: [
    { id: 'disgusting', label: 'Disgusting', mood: -4, description: '-4 mood from eating paste' },
    { id: 'fine', label: "Don't Mind", mood: 0, description: 'No mood penalty from paste', enabledByMemes: ['transhumanist', 'inhuman', 'shipborn'] },
  ]},
  { id: 'execution', label: 'Execution', category: 'Violence', universal: true, options: [
    { id: 'always_abhorrent', label: 'Always Abhorrent', mood: -20, description: '-20 mood for killing a prisoner, will not execute' },
    { id: 'always_horrible', label: 'Always Horrible', mood: -15, description: '-15 mood for executing a prisoner' },
    { id: 'horrible_if_innocent', label: 'Horrible if Innocent', mood: -15, description: '-15 mood for executing innocent, ok if guilty' },
    { id: 'dont_care', label: "Don't Care", mood: 0, description: 'No mood effect from executions' },
    { id: 'respected_guilty', label: 'Respected if Guilty', mood: 10, description: '+10 mood for executing guilty prisoner' },
    { id: 'required', label: 'Required', mood: 10, description: '+10 mood for executions, -3 if none for 30 days' },
  ]},
  { id: 'fungus', label: 'Fungus', category: 'Food', universal: true, options: [
    { id: 'despised', label: 'Despised', mood: -3, description: '-3 mood from eating cooked fungus, -6 raw', blockedByMemes: ['tunneler'] },
    { id: 'preferred', label: 'Preferred', mood: 3, description: '+3 mood from fungus, -3 from non-fungus plants', requiredMemes: ['tunneler'] },
  ]},
  { id: 'insect_meat', label: 'Insect Meat', category: 'Food', universal: true, options: [
    { id: 'despised', label: 'Despised', mood: -6, description: '-6 mood from eating insect meat' },
    { id: 'loved', label: 'Loved', mood: 6, description: '+6 mood from eating insect meat', enabledByMemes: ['tunneler'] },
  ]},
  { id: 'marriage_name', label: 'Marriage Name', category: 'Social', universal: true, options: [
    { id: 'wife_takes', label: 'Wife Takes Husband Name', mood: 0, description: 'Wife changes last name to husband\'s' },
    { id: 'husband_takes', label: 'Husband Takes Wife Name', mood: 0, description: 'Husband changes last name to wife\'s' },
    { id: 'keep_own', label: 'Keep Own Name', mood: 0, description: 'Both keep their original names' },
    { id: 'combined', label: 'Combined Name', mood: 0, description: 'Both take a combined hyphenated name' },
  ]},
  { id: 'female_clothing', label: 'Female Clothing', category: 'Lifestyle', universal: true, options: [
    { id: 'no_rules', label: 'No Rules', mood: 0, description: 'No clothing requirements for women' },
    { id: 'pants_at_most', label: 'Pants at Most', mood: 0, description: 'Women may wear pants at most', requiredMemes: ['nudism'] },
    { id: 'fully_nude', label: 'Fully Nude', mood: 0, description: 'Women must be fully nude', requiredMemes: ['nudism'] },
  ]},
  { id: 'male_clothing', label: 'Male Clothing', category: 'Lifestyle', universal: true, options: [
    { id: 'no_rules', label: 'No Rules', mood: 0, description: 'No clothing requirements for men' },
    { id: 'pants_at_most', label: 'Pants at Most', mood: 0, description: 'Men may wear pants at most', requiredMemes: ['nudism'] },
    { id: 'fully_nude', label: 'Fully Nude', mood: 0, description: 'Men must be fully nude', requiredMemes: ['nudism'] },
  ]},
  { id: 'organ_harvest', label: 'Organ Use', category: 'Violence', universal: true, options: [
    { id: 'abhorrent', label: 'Abhorrent', mood: -12, description: '-12 mood witnessed' },
    { id: 'horrible', label: 'Horrible', mood: -7, description: '-7 mood witnessed' },
    { id: 'acceptable', label: 'Acceptable', mood: 0, description: 'No mood effect' },
    { id: 'dont_care', label: "Don't Care", mood: 0, description: 'Never bothered' },
  ]},
  { id: 'physical_love', label: 'Physical Love', category: 'Social', universal: true, options: [
    { id: 'spouse_only', label: 'Spouse Only', mood: -8, description: '-8 mood if lovin with non-spouse' },
    { id: 'free', label: 'Free', mood: 2, description: '+2 mood, can share beds freely' },
  ]},
  { id: 'research', label: 'Research', category: 'Work', universal: true, options: [
    { id: 'extremely_slow', label: 'Extremely Slow', mood: 0, description: '-50% research speed', researchSpeed: -0.50 },
    { id: 'very_slow', label: 'Very Slow', mood: 0, description: '-35% research speed', researchSpeed: -0.35 },
    { id: 'slow', label: 'Slow', mood: 0, description: '-25% research speed', researchSpeed: -0.25 },
    { id: 'neutral', label: 'Neutral', mood: 0, description: 'No speed modifier', researchSpeed: 0 },
    { id: 'valued', label: 'Highly Valued', mood: 2, description: '+2 mood for researchers, +20% speed', researchSpeed: 0.20 },
  ]},
  { id: 'scarification', label: 'Scarification', category: 'Lifestyle', universal: true, options: [
    { id: 'horrible', label: 'Horrible', mood: -5, description: '-5 mood from being scarred', blockedByMemes: ['painIsVirtue'] },
    { id: 'neutral', label: 'No Opinion', mood: 0, description: 'No mood effect', blockedByMemes: ['painIsVirtue'] },
    { id: 'approved', label: 'Approved', mood: 3, description: '+3 mood per scar (stacks)' },
    { id: 'required', label: 'Required', mood: 5, description: '+5 mood per scar, -8 if unscarred', requiredMemes: ['painIsVirtue'] },
  ]},
  { id: 'skullspike', label: 'Skullspike', category: 'Death', universal: true, options: [
    { id: 'disapproved', label: 'Disapproved', mood: -3, description: '-3 mood when skull spikes are near' },
    { id: 'desired', label: 'Desired', mood: 3, description: '+3 mood when skull spikes are near' },
  ]},
  { id: 'slavery', label: 'Slavery', category: 'Social', universal: true, options: [
    { id: 'abhorrent', label: 'Abhorrent', mood: -10, description: '-10 mood if colony has slaves' },
    { id: 'horrible', label: 'Horrible', mood: -7, description: '-7 mood if colony has slaves' },
    { id: 'disapproved', label: 'Disapproved', mood: -4, description: '-4 mood if colony has slaves' },
    { id: 'acceptable', label: 'Acceptable', mood: 0, description: 'No mood effect' },
    { id: 'honorable', label: 'Honourable', mood: 3, description: '+3 mood when slaves present' },
  ]},
  { id: 'spouse_count_female', label: "Women's Spouses", category: 'Social', universal: true, options: [
    { id: 'one', label: 'One Spouse', mood: 0, description: 'Women may have one spouse' },
    { id: 'two', label: 'Up to Two', mood: 0, description: 'Women may have up to two spouses' },
    { id: 'three', label: 'Up to Three', mood: 0, description: 'Women may have up to three spouses' },
    { id: 'four', label: 'Up to Four', mood: 0, description: 'Women may have up to four spouses' },
    { id: 'unlimited', label: 'Unlimited', mood: 0, description: 'No spouse limit for women' },
  ]},
  { id: 'spouse_count_male', label: "Men's Spouses", category: 'Social', universal: true, options: [
    { id: 'one', label: 'One Spouse', mood: 0, description: 'Men may have one spouse' },
    { id: 'two', label: 'Up to Two', mood: 0, description: 'Men may have up to two spouses' },
    { id: 'three', label: 'Up to Three', mood: 0, description: 'Men may have up to three spouses' },
    { id: 'four', label: 'Up to Four', mood: 0, description: 'Men may have up to four spouses' },
    { id: 'unlimited', label: 'Unlimited', mood: 0, description: 'No spouse limit for men' },
  ]},
  // ── Meme-linked precepts (require specific memes) ──
  { id: 'slaughter_animals', label: 'Slaughtering Animals', category: 'Violence', options: [
    { id: 'horrible', label: 'Horrible', mood: -6, description: '-6 mood from slaughtering animals', requiredMemes: ['animalist'] },
    { id: 'disapproved', label: 'Disapproved', mood: -3, description: '-3 mood from slaughtering' },
    { id: 'neutral', label: 'No Opinion', mood: 0, description: 'No mood effect', blockedByMemes: ['animalist'] },
  ]},
  { id: 'killing_animals', label: 'Killing Innocent Animals', category: 'Violence', options: [
    { id: 'horrible', label: 'Horrible', mood: -5, description: '-5 mood from killing innocent animals', requiredMemes: ['animalist'] },
    { id: 'disapproved', label: 'Disapproved', mood: -3, description: '-3 mood from killing' },
    { id: 'neutral', label: 'No Opinion', mood: 0, description: 'No mood effect', blockedByMemes: ['animalist'] },
  ]},
  { id: 'apostasy', label: 'Apostasy', category: 'Social', options: [
    { id: 'abhorrent', label: 'Abhorrent', mood: -15, description: '-15 mood/opinion when someone leaves ideoligion' },
    { id: 'disapproved', label: 'Disapproved', mood: -5, description: '-5 mood when someone leaves' },
    { id: 'neutral', label: 'No Opinion', mood: 0, description: 'No mood effect from conversion' },
  ]},
  { id: 'autonomous_weapons', label: 'Autonomous Weapons', category: 'Violence', options: [
    { id: 'abhorrent', label: 'Abhorrent', mood: -8, description: '-8 mood if turrets/mechs used' },
    { id: 'disapproved', label: 'Disapproved', mood: -4, description: '-4 mood if turrets/mechs used' },
    { id: 'neutral', label: 'Neutral', mood: 0, description: 'No opinion on turrets/mechs' },
  ]},
  { id: 'body_modification', label: 'Body Modification', category: 'Lifestyle', options: [
    { id: 'abhorrent', label: 'Abhorrent', mood: -8, description: '-8 mood when modded, requires Flesh Purity', enabledByMemes: ['fleshPurity'] },
    { id: 'disapproved', label: 'Disapproved', mood: -4, description: '-4 mood when body is modified' },
    { id: 'approved', label: 'Approved', mood: 3, description: '+3 mood per implant/prosthetic', enabledByMemes: ['transhumanist'] },
  ]},
  { id: 'charity', label: 'Charity', category: 'Social', options: [
    { id: 'essential', label: 'Essential', mood: 5, description: '+5 mood after giving gifts', socialSkill: 2 },
    { id: 'important', label: 'Important', mood: 3, description: '+3 mood after giving gifts' },
    { id: 'worthwhile', label: 'Worthwhile', mood: 2, description: '+2 mood after giving gifts' },
    { id: 'neutral', label: 'Neutral', mood: 0, description: 'No opinion on charity' },
    { id: 'weakness', label: 'Sign of Weakness', mood: 0, description: 'Giving = weakness', combatSkill: 1 },
  ]},
  { id: 'drugs', label: 'Drug Use', category: 'Lifestyle', options: [
    { id: 'prohibited', label: 'Prohibited', mood: 0, description: 'No recreational drugs allowed', blockedByMemes: ['highLife'] },
    { id: 'medical', label: 'Medical Only', mood: 0, description: 'Only for medical use', blockedByMemes: ['highLife'] },
    { id: 'social', label: 'Social', mood: 2, description: '+2 mood, social drug use OK' },
    { id: 'essential', label: 'Essential', mood: 5, description: '+5 mood, expects regular use', requiredMemes: ['highLife'] },
  ]},
  { id: 'nudity', label: 'Nudity', category: 'Lifestyle', options: [
    { id: 'disapproved', label: 'Disapproved', mood: -5, description: '-5 mood if nude', blockedByMemes: ['nudism'] },
    { id: 'neutral', label: 'No Opinion', mood: 0, description: 'No mood effect', blockedByMemes: ['nudism'] },
    { id: 'approved', label: 'Approved', mood: 5, description: '+5 mood when nude, -5 when clothed', requiredMemes: ['nudism'] },
  ]},
  { id: 'authority', label: 'Authority', category: 'Social', options: [
    { id: 'none', label: 'No Leader', mood: 0, description: 'No leader role needed' },
    { id: 'respected', label: 'Respected Leader', mood: 3, description: '+3 mood when leader present' },
    { id: 'revered', label: 'Revered Leader', mood: 6, description: '+6 mood, -8 if no leader' },
  ]},
  { id: 'comfort', label: 'Comfort', category: 'Lifestyle', options: [
    { id: 'ascetic', label: 'Ascetic', mood: 4, description: '+4 mood in poor rooms, -4 in rich rooms' },
    { id: 'neutral', label: 'Neutral', mood: 0, description: 'Normal room expectations' },
    { id: 'luxurious', label: 'Luxurious', mood: 6, description: '+6 mood in impressive rooms, -6 in poor' },
  ]},
  { id: 'tree_cutting', label: 'Cutting Trees', category: 'Lifestyle', options: [
    { id: 'despised', label: 'Despised', mood: -6, description: '-6 mood from cutting trees', requiredMemes: ['treeConnection'] },
    { id: 'disapproved', label: 'Disapproved', mood: -3, description: '-3 mood from cutting trees' },
    { id: 'neutral', label: 'No Opinion', mood: 0, description: 'No mood effect', blockedByMemes: ['treeConnection'] },
  ]},
  { id: 'meat_eating', label: 'Meat Eating', category: 'Food', options: [
    { id: 'strictly_required', label: 'Strictly Carnivore', mood: -5, description: '-5 mood from non-meat meals', enabledByMemes: ['rancher'] },
    { id: 'seriously_required', label: 'Seriously Carnivore', mood: -3, description: '-3 mood from non-meat meals', enabledByMemes: ['rancher'] },
    { id: 'mildly_required', label: 'Mildly Carnivore', mood: 3, description: '+3 mood from meat meals', enabledByMemes: ['rancher'] },
    { id: 'omnivore', label: 'Omnivore', mood: 0, description: 'Eats both without issue' },
    { id: 'vegetarian', label: 'Vegetarian', mood: 3, description: '+3 mood from veggie meals, -6 from meat', requiredMemes: ['animalist'] },
  ]},
  { id: 'mining', label: 'Mining', category: 'Work', options: [
    { id: 'prohibited', label: 'Prohibited', mood: -5, description: 'Mining is prohibited', blockedByMemes: ['tunneler'] },
    { id: 'horrible', label: 'Horrible', mood: -4, description: '-4 mood from mining', blockedByMemes: ['tunneler'] },
    { id: 'disapproved', label: 'Disapproved', mood: -2, description: '-2 mood from mining', blockedByMemes: ['tunneler'] },
    { id: 'neutral', label: 'Neutral', mood: 0, description: 'No mood effect' },
    { id: 'valued', label: 'Highly Valued', mood: 3, description: '+3 mood when mining', requiredMemes: ['tunneler'] },
  ]},
  { id: 'raiding', label: 'Raiding', category: 'Violence', options: [
    { id: 'respected', label: 'Respected', mood: 3, description: '+3 mood after a successful raid', enabledByMemes: ['raider'] },
    { id: 'required', label: 'Required', mood: 5, description: '+5 mood after raiding, -3 if no raids for 30 days', requiredMemes: ['raider'] },
  ]},
  { id: 'biosculpting', label: 'Biosculpting', category: 'Lifestyle', options: [
    { id: 'neutral', label: 'Standard', mood: 0, description: 'Normal biosculpting cycle time' },
    { id: 'accelerated', label: 'Accelerated', mood: 0, description: 'Faster biosculpting cycles', enabledByMemes: ['transhumanist'] },
  ]},
  { id: 'age_reversal', label: 'Age Reversal', category: 'Lifestyle', options: [
    { id: 'demanded', label: 'Demanded', mood: -8, description: '-8 mood if aging without access to reversal', enabledByMemes: ['transhumanist'] },
    { id: 'expected', label: 'Expected', mood: -4, description: '-4 mood if aging naturally' },
    { id: 'neutral', label: 'No Opinion', mood: 0, description: 'No special opinion on aging' },
  ]},
  { id: 'proselytizing', label: 'Proselytizing', category: 'Social', options: [
    { id: 'occasional', label: 'Occasional', mood: 0, description: 'Occasional conversion attempts', enabledByMemes: ['proselytizer'] },
    { id: 'sometimes', label: 'Sometimes', mood: 0, description: 'Regular conversion attempts', enabledByMemes: ['proselytizer'] },
    { id: 'frequent', label: 'Frequent', mood: 0, description: 'Aggressive proselytizing', requiredMemes: ['proselytizer'] },
  ]},
  { id: 'ranching', label: 'Ranching', category: 'Work', options: [
    { id: 'central', label: 'Central', mood: 3, description: 'Ranching is central to way of life', requiredMemes: ['rancher'] },
  ]},
];

const CAT_LABELS = {
  emergency:   'Emergency & Med',
  social:      'Social & Warden',
  food:        'Food & Hunt',
  labor:       'Build & Labour',
  crafting:    'Craft & Product',
  maintenance: 'Main & Research',
  specialist:  'Specialist',
};

const MATERIAL_TYPES = [
  { id: 'wood',     label: 'Wood',       color: '#8B5E3C', beauty: 0 },
  { id: 'steel',    label: 'Steel',      color: '#7a8fa6', beauty: 0 },
  { id: 'stone',    label: 'Stone',      color: '#9e9e8e', beauty: 1 },
  { id: 'plasteel', label: 'Plasteel',   color: '#5bc8d4', beauty: 2 },
  { id: 'gold',     label: 'Gold',       color: '#e8c84a', beauty: 12 },
  { id: 'comp',     label: 'Components', color: '#b07adc', beauty: 0 },
  { id: 'cloth',    label: 'Cloth',      color: '#d47a7a', beauty: 0 },
];

// Blueprint palette. `def` is the real vanilla RimWorld ThingDef (struct layer)
// or TerrainDef (floor layer), verified against the game XML, so layouts can be
// exported to / imported from the "Blueprints" mod's .xml format. `stuff` is the
// default material emitted on export for stuffable items (the mod needs a Stuff
// for those). Items without `def` (e.g. user custom objects) export as nothing.
// The first two ids are kept for backward compatibility with saved blueprints.
const PRESET_BUILDINGS = [
  // -- Floors (TerrainDef) --
  { id: 'gen_floor',        label: 'Concrete',        layer: 'floor', def: 'Concrete',         costs: {}, color: '#5a5a5e', work: 100, beauty: 0, shape: 'square' },
  { id: 'floor_wood',       label: 'Wood Floor',      layer: 'floor', def: 'WoodPlankFloor',   costs: {}, color: '#8a5a32', work: 100, beauty: 1, shape: 'square' },
  { id: 'floor_sterile',    label: 'Sterile Tile',    layer: 'floor', def: 'SterileTile',      costs: {}, color: '#d7e3e8', work: 100, beauty: 0, shape: 'square' },
  { id: 'floor_metal',      label: 'Metal Tile',      layer: 'floor', def: 'MetalTile',        costs: {}, color: '#6f7782', work: 100, beauty: 0, shape: 'square' },
  { id: 'floor_silver',     label: 'Silver Tile',     layer: 'floor', def: 'SilverTile',       costs: {}, color: '#c9ccd1', work: 100, beauty: 1, shape: 'square' },
  { id: 'floor_granite',    label: 'Granite Tile',    layer: 'floor', def: 'TileGranite',      costs: {}, color: '#7a6f6a', work: 100, beauty: 1, shape: 'square' },
  { id: 'floor_sandstone',  label: 'Sandstone Tile',  layer: 'floor', def: 'TileSandstone',    costs: {}, color: '#b08a5a', work: 100, beauty: 1, shape: 'square' },
  { id: 'floor_flagstone',  label: 'Flagstone',       layer: 'floor', def: 'FlagstoneGranite', costs: {}, color: '#6d6661', work: 100, beauty: 0, shape: 'square' },
  { id: 'bridge',           label: 'Bridge',          layer: 'floor', def: 'Bridge',           costs: {}, color: '#4a6075', work: 100, beauty: 0, shape: 'square' },

  // -- Structure / objects (ThingDef) --
  { id: 'gen_wall',         label: 'Wall',            layer: 'struct', def: 'Wall',     stuff: 'BlocksGranite', costs: {}, color: '#888888', work: 200, beauty: 0, shape: 'square' },
  { id: 'door',             label: 'Door',            layer: 'struct', def: 'Door',     stuff: 'WoodLog',       costs: {}, color: '#b5853f', work: 200, beauty: 0, shape: 'square' },
  { id: 'autodoor',         label: 'Autodoor',        layer: 'struct', def: 'Autodoor', stuff: 'Steel',        costs: {}, color: '#9aa7b5', work: 200, beauty: 0, shape: 'square' },
  { id: 'column',           label: 'Column',          layer: 'struct', def: 'Column',   stuff: 'BlocksGranite', costs: {}, color: '#9b9288', work: 200, beauty: 1, shape: 'square' },
  { id: 'sandbags',         label: 'Sandbags',        layer: 'struct', def: 'Sandbags',                        costs: {}, color: '#b0a06a', work: 100, beauty: 0, shape: 'square' },
  { id: 'barricade',        label: 'Barricade',       layer: 'struct', def: 'Barricade', stuff: 'Steel',       costs: {}, color: '#7d7d85', work: 100, beauty: 0, shape: 'square' },
  { id: 'bed',              label: 'Bed',             layer: 'struct', def: 'Bed',       stuff: 'WoodLog',      costs: {}, color: '#9c6b8e', work: 200, beauty: 1, shape: 'square' },
  { id: 'doublebed',        label: 'Double Bed',      layer: 'struct', def: 'DoubleBed', stuff: 'WoodLog',      costs: {}, color: '#a85f8a', work: 200, beauty: 1, shape: 'square' },
  { id: 'bedroll',          label: 'Bedroll',         layer: 'struct', def: 'Bedroll',   stuff: 'Cloth',        costs: {}, color: '#8c7a5a', work: 100, beauty: 0, shape: 'square' },
  { id: 'hospitalbed',      label: 'Hospital Bed',    layer: 'struct', def: 'HospitalBed', stuff: 'Steel',     costs: {}, color: '#cfd8dc', work: 400, beauty: 0, shape: 'square' },
  { id: 'diningchair',      label: 'Dining Chair',    layer: 'struct', def: 'DiningChair', stuff: 'WoodLog',    costs: {}, color: '#a07845', work: 150, beauty: 1, shape: 'square' },
  { id: 'stool',            label: 'Stool',           layer: 'struct', def: 'Stool',     stuff: 'WoodLog',      costs: {}, color: '#8f6d40', work: 100, beauty: 0, shape: 'square' },
  { id: 'table2x2',         label: 'Table (2x2)',     layer: 'struct', def: 'Table2x2c', stuff: 'WoodLog',     costs: {}, color: '#7c5a30', work: 200, beauty: 1, shape: 'square' },
  { id: 'table1x2',         label: 'Table (1x2)',     layer: 'struct', def: 'Table1x2c', stuff: 'WoodLog',     costs: {}, color: '#7c5a30', work: 150, beauty: 1, shape: 'square' },
  { id: 'standinglamp',     label: 'Standing Lamp',   layer: 'struct', def: 'StandingLamp',                    costs: {}, color: '#e8d98a', work: 100, beauty: 0, shape: 'square' },
  { id: 'cooler',           label: 'Cooler',          layer: 'struct', def: 'Cooler',                          costs: {}, color: '#7fc4d8', work: 150, beauty: 0, shape: 'square' },
  { id: 'heater',           label: 'Heater',          layer: 'struct', def: 'Heater',                          costs: {}, color: '#e08a5a', work: 150, beauty: 0, shape: 'square' },
  { id: 'campfire',         label: 'Campfire',        layer: 'struct', def: 'Campfire',  stuff: 'WoodLog',      costs: {}, color: '#d9742f', work: 100, beauty: 0, shape: 'square' },
  { id: 'powerconduit',     label: 'Power Conduit',   layer: 'struct', def: 'PowerConduit',                    costs: {}, color: '#c8a23a', work: 35,  beauty: 0, shape: 'line' },
  { id: 'pipe',             label: 'Pipe (planning)', layer: 'struct',                                        costs: {}, color: '#5aa0c8', work: 35,  beauty: 0, shape: 'line' },
  { id: 'solar',            label: 'Solar Generator', layer: 'struct', def: 'SolarGenerator',                  costs: {}, color: '#3f6fb0', work: 200, beauty: 0, shape: 'square' },
  { id: 'woodgen',          label: 'Wood Generator',  layer: 'struct', def: 'WoodFiredGenerator',              costs: {}, color: '#8a6b3a', work: 200, beauty: 0, shape: 'square' },
  { id: 'battery',          label: 'Battery',         layer: 'struct', def: 'Battery',                         costs: {}, color: '#c0b84a', work: 200, beauty: 0, shape: 'square' },
  { id: 'researchbench',    label: 'Research Bench',  layer: 'struct', def: 'SimpleResearchBench', stuff: 'WoodLog', costs: {}, color: '#7a8c5a', work: 200, beauty: 0, shape: 'square' },
  { id: 'electricstove',    label: 'Electric Stove',  layer: 'struct', def: 'ElectricStove', stuff: 'Steel',   costs: {}, color: '#b5b5bd', work: 300, beauty: 0, shape: 'square' },
  { id: 'butcherspot',      label: 'Butcher Spot',    layer: 'struct', def: 'ButcherSpot',                     costs: {}, color: '#a05050', work: 50,  beauty: 0, shape: 'square' },
  { id: 'grave',            label: 'Grave',           layer: 'struct', def: 'Grave',                           costs: {}, color: '#5a4a3a', work: 100, beauty: 0, shape: 'square' },
  { id: 'sarcophagus',      label: 'Sarcophagus',     layer: 'struct', def: 'Sarcophagus', stuff: 'BlocksGranite', costs: {}, color: '#6a6055', work: 400, beauty: 2, shape: 'square' },
  { id: 'sculpture',        label: 'Sculpture',       layer: 'struct', def: 'SculptureSmall', stuff: 'WoodLog', costs: {}, color: '#9a7ab0', work: 400, beauty: 3, shape: 'square' },
];

// Footprint (width x height in cells) for multi-cell vanilla objects, keyed by
// ThingDef. Used to expand objects to their footprint on import and merge them
// back to one object on export. The game re-derives the true size on placement,
// so this only needs to be self-consistent (and roughly right for the preview).
// Verified against Core ThingDef <size> (Buildings_Furniture/Art/Misc/Power.xml).
const VANILLA_DEF_SIZES = {
  Bed: [1, 2], DoubleBed: [2, 2], HospitalBed: [1, 2], RoyalBed: [2, 2], Bedroll: [1, 2],
  Table1x2c: [1, 2], Table2x2c: [2, 2], Table2x4c: [2, 4], Table3x3c: [3, 3],
  SolarGenerator: [4, 4], WindTurbine: [7, 2], GeothermalGenerator: [6, 6],
  WoodFiredGenerator: [2, 2], Battery: [1, 2],
  SimpleResearchBench: [3, 2], ElectricStove: [3, 1],
  SculptureGrand: [2, 2], Sarcophagus: [1, 2], Grave: [1, 2],
};
// Footprints scanned from the user's installed mods (defName -> [w,h]),
// populated by the def scan. Takes priority so modded furniture fills its real
// tile size. Falls back to the vanilla table, then 1x1.
let _MOD_DEF_SIZES = {};
function setModDefSizes(map) { _MOD_DEF_SIZES = (map && typeof map === 'object' && !Array.isArray(map)) ? map : {}; }
function vanillaDefSize(def) {
  if (def && _MOD_DEF_SIZES[def]) return _MOD_DEF_SIZES[def];
  return (def && VANILLA_DEF_SIZES[def]) ? VANILLA_DEF_SIZES[def] : [1, 1];
}

// Conduits/pipes are "wire" objects: 1x1, sit under furniture, can overlap each
// other, and render as connecting lines. Detected by defName so modded pipes work.
function isWireDef(def) {
  if (!def) return false;
  if (def === 'PowerConduit') return true;
  return /(conduit|pipe|cable|wire|duct)/i.test(String(def));
}

// Maps a vanilla def (ThingDef or TerrainDef) back to a palette id, for import.
// Built lazily from PRESET_BUILDINGS so it always mirrors the palette above.
let _VANILLA_DEF_TO_ID = null;
function vanillaDefToBuildingId(def) {
  if (!def) return null;
  if (!_VANILLA_DEF_TO_ID) {
    _VANILLA_DEF_TO_ID = {};
    PRESET_BUILDINGS.forEach(b => { if (b.def) _VANILLA_DEF_TO_ID[b.def] = b.id; });
  }
  return _VANILLA_DEF_TO_ID[def] || null;
}

// ─── GENE SYSTEM ─────────────────────────────────────────────────────────────
// Vanilla RimWorld genes from Biotech DLC, grouped by category.
// Each gene has: id, label, category, description, and optional effect fields:
//   skillMods: { skillId: +/-value }     - additive skill offsets
//   workSpeed: +/-decimal               - additive work speed modifier
//   learningRate: +/-decimal            - additive learning rate modifier
//   incapable: ['jobType']              - work type disablers
//   immunityGainSpeed: +/-decimal       - immunity gain speed modifier
//   painFactor: decimal                 - pain threshold multiplier (1.0 = normal)
//   meleeDamage: +/-decimal             - melee DPS multiplier offset
//   moveSpeed: +/-decimal               - move speed offset (cells/sec)
//   beauty: +/-int                      - pawn beauty offset
//   metabolism: +/-int                  - metabolic efficiency offset (hunger rate)
//   psychicAbility: +/-int              - psychic sensitivity tier shift
//   isCustom: true                      - marks user-created mod genes
const GENES = [
  // ── Shooting ──
  { id: 'gene_shooting_terrible', label: 'Awful Shooting', category: 'Shooting', description: 'Terrible at shooting.', skillMods: { shoot: -8 } },
  { id: 'gene_shooting_poor',     label: 'Poor Shooting',  category: 'Shooting', description: 'Poor shooting ability.', skillMods: { shoot: -4 } },
  { id: 'gene_shooting_good',     label: 'Apt Shooting',   category: 'Shooting', description: 'Natural aim.', skillMods: { shoot: 4 } },
  { id: 'gene_shooting_great',    label: 'Great Shooting',  category: 'Shooting', description: 'Exceptional aim.', skillMods: { shoot: 8 } },
  // ── Melee ──
  { id: 'gene_melee_terrible', label: 'Awful Melee',  category: 'Melee', description: 'Terrible at melee.', skillMods: { melee: -8 } },
  { id: 'gene_melee_poor',     label: 'Poor Melee',   category: 'Melee', description: 'Poor melee ability.', skillMods: { melee: -4 } },
  { id: 'gene_melee_good',     label: 'Apt Melee',    category: 'Melee', description: 'Natural fighter.', skillMods: { melee: 4 } },
  { id: 'gene_melee_great',    label: 'Great Melee',   category: 'Melee', description: 'Exceptional fighter.', skillMods: { melee: 8 } },
  // ── Construction ──
  { id: 'gene_construct_poor', label: 'Poor Construction', category: 'Construction', description: 'Clumsy builder.', skillMods: { construct: -4 } },
  { id: 'gene_construct_good', label: 'Apt Construction',  category: 'Construction', description: 'Steady hands for building.', skillMods: { construct: 4 } },
  // ── Mining ──
  { id: 'gene_mining_poor', label: 'Poor Mining', category: 'Mining', description: 'Weak miner.', skillMods: { mine: -4 } },
  { id: 'gene_mining_good', label: 'Apt Mining',  category: 'Mining', description: 'Strong miner.', skillMods: { mine: 4 } },
  // ── Cooking ──
  { id: 'gene_cooking_poor', label: 'Poor Cooking', category: 'Cooking', description: 'Bad cook.', skillMods: { cook: -4 } },
  { id: 'gene_cooking_good', label: 'Apt Cooking',  category: 'Cooking', description: 'Natural chef.', skillMods: { cook: 4 } },
  // ── Plants ──
  { id: 'gene_plants_poor', label: 'Poor Plants', category: 'Plants', description: 'Bad with plants.', skillMods: { plant: -4 } },
  { id: 'gene_plants_good', label: 'Apt Plants',  category: 'Plants', description: 'Green thumb.', skillMods: { plant: 4 } },
  // ── Animals ──
  { id: 'gene_animals_poor', label: 'Poor Animals', category: 'Animals', description: 'Bad with animals.', skillMods: { animal: -4 } },
  { id: 'gene_animals_good', label: 'Apt Animals',  category: 'Animals', description: 'Natural handler.', skillMods: { animal: 4 } },
  // ── Crafting ──
  { id: 'gene_crafting_poor', label: 'Poor Crafting', category: 'Crafting', description: 'Clumsy hands.', skillMods: { craft: -4 } },
  { id: 'gene_crafting_good', label: 'Apt Crafting',  category: 'Crafting', description: 'Precise hands.', skillMods: { craft: 4 } },
  // ── Art ──
  { id: 'gene_art_poor', label: 'Poor Art', category: 'Art', description: 'No artistic sense.', skillMods: { art: -4 } },
  { id: 'gene_art_good', label: 'Apt Art',  category: 'Art', description: 'Creative soul.', skillMods: { art: 4 } },
  // ── Social ──
  { id: 'gene_social_poor', label: 'Poor Social', category: 'Social', description: 'Awkward socially.', skillMods: { social: -4 } },
  { id: 'gene_social_good', label: 'Apt Social',  category: 'Social', description: 'Charismatic.', skillMods: { social: 4 } },
  // ── Medicine ──
  { id: 'gene_medicine_poor', label: 'Poor Medicine', category: 'Medicine', description: 'Shaky hands for healing.', skillMods: { medicine: -4 } },
  { id: 'gene_medicine_good', label: 'Apt Medicine',  category: 'Medicine', description: 'Steady hands for healing.', skillMods: { medicine: 4 } },
  // ── Intellectual ──
  { id: 'gene_intel_poor', label: 'Poor Intellectual', category: 'Intellectual', description: 'Slow thinker.', skillMods: { intel: -4 } },
  { id: 'gene_intel_good', label: 'Apt Intellectual',  category: 'Intellectual', description: 'Quick thinker.', skillMods: { intel: 4 } },
  // ── Work Speed ──
  { id: 'gene_slow_study',  label: 'Slow Study',  category: 'Work', description: '-50% learning rate.', learningRate: -0.5 },
  { id: 'gene_quick_study', label: 'Quick Study', category: 'Work', description: '+50% learning rate.', learningRate: 0.5 },
  { id: 'gene_slow_runner',  label: 'Slow Runner',  category: 'Movement', description: '-0.4 c/s move speed.', moveSpeed: -0.4 },
  { id: 'gene_fast_runner',  label: 'Fast Runner',  category: 'Movement', description: '+0.4 c/s move speed.', moveSpeed: 0.4 },
  // ── Combat / Body ──
  { id: 'gene_robust',     label: 'Robust',      category: 'Body', description: 'Thickened bones & flesh. 25% less incoming damage.', damageFactor: 0.75 },
  { id: 'gene_delicate',   label: 'Delicate',    category: 'Body', description: 'Fragile bones & flesh. 15% more incoming damage.', damageFactor: 1.15 },
  { id: 'gene_tough_skin',  label: 'Tough Skin',   category: 'Body', description: 'Thick hide. Small blunt armour bonus.' },
  { id: 'gene_pain_low',    label: 'Low Pain',     category: 'Body', description: 'Reduced pain sensation.', painFactor: 0.5 },
  { id: 'gene_pain_high',   label: 'High Pain',    category: 'Body', description: 'Heightened pain sensitivity.', painFactor: 1.5 },
  { id: 'gene_strong_melee', label: 'Strong Melee Damage', category: 'Combat', description: '+25% melee damage.', meleeDamage: 0.25 },
  { id: 'gene_weak_melee',   label: 'Weak Melee Damage',   category: 'Combat', description: '-25% melee damage.', meleeDamage: -0.25 },
  // ── Immunity ──
  { id: 'gene_immunity_strong', label: 'Strong Immunity', category: 'Immunity', description: '+40% immunity gain speed.', immunityGainSpeed: 0.4 },
  { id: 'gene_immunity_weak',   label: 'Weak Immunity',   category: 'Immunity', description: '-40% immunity gain speed.', immunityGainSpeed: -0.4 },
  // ── Beauty ──
  { id: 'gene_beauty_pretty',     label: 'Pretty',      category: 'Beauty', description: '+1 beauty.', beauty: 1 },
  { id: 'gene_beauty_beautiful',   label: 'Beautiful',   category: 'Beauty', description: '+2 beauty.', beauty: 2 },
  { id: 'gene_beauty_ugly',        label: 'Ugly',        category: 'Beauty', description: '-1 beauty.', beauty: -1 },
  { id: 'gene_beauty_very_ugly',   label: 'Very Ugly',   category: 'Beauty', description: '-2 beauty.', beauty: -2 },
  // ── Metabolism / Hunger ──
  { id: 'gene_metabolism_slow', label: 'Slow Metabolism', category: 'Metabolism', description: 'Eats less. Metabolism -1.', metabolism: -1 },
  { id: 'gene_metabolism_fast', label: 'Fast Metabolism', category: 'Metabolism', description: 'Eats more. Metabolism +2.', metabolism: 2 },
  { id: 'gene_hemogenic',      label: 'Hemogenic',       category: 'Metabolism', description: 'Must consume hemogen (blood).' },
  // ── Psychic ──
  { id: 'gene_psychic_deaf',  label: 'Psychically Deaf',  category: 'Psychic', description: 'Immune to psychic effects.', psychicAbility: -99 },
  { id: 'gene_psychic_dull',  label: 'Psychically Dull',  category: 'Psychic', description: 'Reduced psychic sensitivity.', psychicAbility: -1 },
  { id: 'gene_psychic_sensitive', label: 'Psychically Sensitive', category: 'Psychic', description: 'Heightened psychic sensitivity.', psychicAbility: 1 },
  // ── Reproduction / Misc ──
  { id: 'gene_fertile',   label: 'Fertile',     category: 'Reproduction', description: '+100% fertility.' },
  { id: 'gene_infertile', label: 'Infertile',   category: 'Reproduction', description: 'Cannot reproduce naturally.' },
  { id: 'gene_ageless',   label: 'Ageless',     category: 'Aging', description: 'Does not age biologically.' },
  { id: 'gene_long_lived', label: 'Long-lived',  category: 'Aging', description: 'Ages at half speed.' },
  { id: 'gene_fire_resist', label: 'Fire Resistant', category: 'Resistance', description: 'Resistant to fire damage.' },
  { id: 'gene_toxic_resist', label: 'Toxic Resistant', category: 'Resistance', description: 'Resistant to toxic environments.' },
  { id: 'gene_no_sleep',  label: 'Sleepless',   category: 'Needs', description: 'Does not need sleep.' },
  { id: 'gene_no_food',   label: 'Non-Eating',  category: 'Needs', description: 'Does not need food.' },
  // ── Incapable Genes ──
  { id: 'gene_incap_violence',  label: 'Incapable of Violence',  category: 'Incapable', description: 'Cannot do violence.', incapable: ['violence'], disabledWorkTagsExact: ['Violent'] },
  { id: 'gene_incap_cooking',   label: 'Incapable of Cooking',   category: 'Incapable', description: 'Cannot cook.', incapable: ['cooking'], disabledWorkTagsExact: ['Cooking'] },
  { id: 'gene_incap_caring',    label: 'Incapable of Caring',    category: 'Incapable', description: 'Cannot do caring work.', incapable: ['caring'], disabledWorkTagsExact: ['Caring'] },
  // ── Appearance (cosmetic, no gameplay effect) ──
  { id: 'gene_fur',       label: 'Fur',         category: 'Cosmetic', description: 'Has fur.' },
  { id: 'gene_horns',     label: 'Horns',       category: 'Cosmetic', description: 'Has horns.' },
  { id: 'gene_tail',      label: 'Tail',        category: 'Cosmetic', description: 'Has a tail.' },
  { id: 'gene_ears_floppy', label: 'Floppy Ears', category: 'Cosmetic', description: 'Has floppy ears.' },
  { id: 'gene_ears_pointed', label: 'Pointed Ears', category: 'Cosmetic', description: 'Has pointed ears.' },
  { id: 'gene_skin_pig',   label: 'Pig Skin',    category: 'Cosmetic', description: 'Rough pigskin.' },
  { id: 'gene_glow_eyes',  label: 'Glowing Eyes', category: 'Cosmetic', description: 'Eyes glow in the dark.' },
];

// Gene category ordering for the UI
const GENE_CATEGORIES = [
  'Shooting','Melee','Construction','Mining','Cooking','Plants','Animals',
  'Crafting','Art','Social','Medicine','Intellectual',
  'Work','Movement','Body','Combat','Immunity',
  'Beauty','Metabolism','Psychic',
  'Needs','Aging','Reproduction','Resistance',
  'Incapable','Cosmetic'
];

const THREAT_PRESETS = [
  { id: 'none', label: 'Unarmoured / Naked', sharp: 0, blunt: 0, ap: 0 },
  { id: 'flak', label: 'Raider (Flak Vest)', sharp: 1.00, blunt: 0.36, ap: 0.16 },
  { id: 'centipede', label: 'Centipede (Mechanoid)', sharp: 0.72, blunt: 0.22, ap: 0.20 },
  { id: 'marine', label: 'Elite (Marine Armour)', sharp: 1.06, blunt: 0.45, ap: 0.35 },
  { id: 'cataphract', label: 'Boss (Cataphract)', sharp: 1.20, blunt: 0.50, ap: 0.45 },
];

const BACKSTORIES = [
  { id: 'AbandonedChild23', slot: 'child', title: 'Abandoned child', titleShort: 'Abandoned', skills: {}, workDisables: [] },
  { id: 'AbandonedChild30', slot: 'child', title: 'Abandoned child', titleShort: 'Abandoned', skills: { Construction: 1, Shooting: 1, Melee: 1, Social: 1 }, workDisables: ['Cooking', 'Cleaning'] },
  { id: 'AbandonedOrphan61', slot: 'child', title: 'Abandoned orphan', titleShort: 'Orphan', skills: { Plants: -3, Shooting: 2, Melee: 3, Social: 2 }, workDisables: [] },
  { id: 'Abductee7', slot: 'child', title: 'Abductee', titleShort: 'Abductee', skills: { Construction: 2, Mining: 4, Melee: 4, Social: -2 }, workDisables: ['Intellectual'] },
  { id: 'Abductee43', slot: 'child', title: 'Abductee', titleShort: 'Abductee', skills: { Construction: 2, Cooking: 2, Melee: 2, Crafting: 2 }, workDisables: [] },
  { id: 'AcademyStudent58', slot: 'child', title: 'Academy student', titleShort: 'Student', skills: { Social: 3, Crafting: 2 }, workDisables: ['Cleaning'] },
  { id: 'AccursedChild88', slot: 'child', title: 'Accursed child', titleShort: 'Cursed', skills: { Construction: -1, Medicine: 4, Intellectual: 5 }, workDisables: ['Firefighting', 'Cleaning', 'Hauling', 'Mining'] },
  { id: 'AdventuringChild30', slot: 'child', title: 'Adventuring child', titleShort: 'Adventurer', skills: { Construction: 2, Crafting: 3 }, workDisables: [] },
  { id: 'AdventurousYouth70', slot: 'child', title: 'Adventurous youth', titleShort: 'Adventurer', skills: { Cooking: 2, Melee: 2, Social: 2 }, workDisables: ['Cleaning'] },
  { id: 'AmateurAstronomer77', slot: 'child', title: 'Amateur astronomer', titleShort: 'Astronomer', skills: { Intellectual: 6 }, workDisables: [] },
  { id: 'AmateurBotanist79', slot: 'child', title: 'Amateur botanist', titleShort: 'Botanist', skills: { Plants: 4, Artistic: 2 }, workDisables: ['Cooking'] },
  { id: 'AmateurEngineer3', slot: 'child', title: 'Amateur engineer', titleShort: 'Engineer', skills: { Construction: 2, Mining: 1, Shooting: 1, Intellectual: 2 }, workDisables: ['Cleaning', 'PlantWork'] },
  { id: 'AngryStudent88', slot: 'child', title: 'Angry student', titleShort: 'Student', skills: { Intellectual: 4 }, workDisables: [] },
  { id: 'AnimalCaretaker20', slot: 'child', title: 'Animal caretaker', titleShort: 'Caretaker', skills: { Plants: 2, Animals: 4 }, workDisables: ['Intellectual'] },
  { id: 'AnimalLabTech39', slot: 'child', title: 'Animal lab tech', titleShort: 'Lab tech', skills: { Shooting: -2, Medicine: 2, Intellectual: 1, Animals: 3 }, workDisables: ['PlantWork'] },
  { id: 'AntisocialChild83', slot: 'child', title: 'Antisocial child', titleShort: 'Antisocial', skills: { Crafting: 2, Intellectual: 3 }, workDisables: ['Social', 'Artistic'] },
  { id: 'ApocalypseChild23', slot: 'child', title: 'Apocalypse child', titleShort: 'Apocalypse', skills: { Shooting: 2, Melee: 3, Crafting: 2 }, workDisables: ['Intellectual'] },
  { id: 'ApocalypseSurvivor23', slot: 'child', title: 'Apocalypse survivor', titleShort: 'Survivor', skills: {}, workDisables: [] },
  { id: 'ApprenticeOracle83', slot: 'child', title: 'Apprentice oracle', titleShort: 'Oracle', skills: { Social: 3, Medicine: 2, Intellectual: 2 }, workDisables: [] },
  { id: 'ApprenticeSmith37', slot: 'child', title: 'Apprentice smith', titleShort: 'Apprentice', skills: { Melee: 2, Crafting: 5 }, workDisables: [] },
  { id: 'OskarCustomChildhood', slot: 'child', title: 'Art slave', titleShort: 'Artist', skills: { Artistic: 4 }, workDisables: ['Social'] },
  { id: 'ArtfulDodger78', slot: 'child', title: 'Artful dodger', titleShort: 'Dodger', skills: { Shooting: 1, Melee: 2, Social: 3 }, workDisables: ['Caring', 'Artistic', 'Crafting', 'Cooking', 'Cleaning', 'PlantWork'] },
  { id: 'ArtisanFarmer23', slot: 'child', title: 'Artisan farmer', titleShort: 'Farmer', skills: { Cooking: 2, Plants: 7, Intellectual: -2 }, workDisables: ['Violent'] },
  { id: 'ArtisticWeirdo56', slot: 'child', title: 'Artistic weirdo', titleShort: 'Weirdo', skills: { Cooking: 1, Artistic: 3, Crafting: 2 }, workDisables: ['Caring', 'Social'] },
  { id: 'AspergersRebel13', slot: 'child', title: 'Aspergers rebel', titleShort: 'Rebel', skills: { Shooting: 2, Social: -3, Intellectual: 5 }, workDisables: ['Caring'] },
  { id: 'AspiringEngineer58', slot: 'child', title: 'Aspiring engineer', titleShort: 'Tinkerer', skills: { Construction: 2, Mining: 2, Social: -2, Crafting: 2, Intellectual: 4 }, workDisables: [] },
  { id: 'AspiringPhysicist47', slot: 'child', title: 'Aspiring physicist', titleShort: 'Student', skills: { Construction: 1, Crafting: 2, Intellectual: 3 }, workDisables: ['Caring', 'Animals', 'Cooking'] },
  { id: 'AspiringPopIdol28', slot: 'child', title: 'Aspiring pop idol', titleShort: 'Pop idol', skills: { Shooting: -4, Melee: -4, Social: 4, Artistic: 4 }, workDisables: ['ManualDumb', 'Cleaning', 'Hauling', 'PlantWork', 'Mining'] },
  { id: 'Athlete47', slot: 'child', title: 'Athlete', titleShort: 'Athlete', skills: { Melee: 4, Intellectual: 3 }, workDisables: ['Social', 'Artistic'] },
  { id: 'AwkwardNerd48', slot: 'child', title: 'Awkward nerd', titleShort: 'Nerd', skills: { Melee: -2, Social: -2, Crafting: 4, Intellectual: 5 }, workDisables: [] },
  { id: 'BlackjackPlayer76', slot: 'child', title: 'Blackjack player', titleShort: 'Gambler', skills: { Social: 4, Intellectual: 5 }, workDisables: ['Violent', 'Firefighting'] },
  { id: 'BlacksmithsSon73', slot: 'child', title: 'Blacksmith\'s son', titleShort: 'Blacksmith', skills: { Construction: 3, Shooting: 3, Artistic: -3, Crafting: 3 }, workDisables: [] },
  { id: 'BlessedChild46', slot: 'child', title: 'Blessed child', titleShort: 'Blessed', skills: { Social: 3, Medicine: 2, Artistic: 1 }, workDisables: [] },
  { id: 'BodyguardTrainee54', slot: 'child', title: 'Bodyguard trainee', titleShort: 'Bodyguard', skills: { Plants: 2, Shooting: 3, Melee: 2, Medicine: 2 }, workDisables: ['Artistic'] },
  { id: 'BoneCollector14', slot: 'child', title: 'Bone collector', titleShort: 'Pupil', skills: { Plants: 2, Mining: 2, Shooting: -3, Melee: -3, Social: -3, Medicine: 2, Artistic: 2, Crafting: 2 }, workDisables: [] },
  { id: 'Bookworm3', slot: 'child', title: 'Bookworm', titleShort: 'Bookworm', skills: { Plants: 2, Social: -2, Medicine: 2, Intellectual: 2 }, workDisables: [] },
  { id: 'Bookworm19', slot: 'child', title: 'Bookworm', titleShort: 'Bookworm', skills: {}, workDisables: ['ManualDumb'] },
  { id: 'BoyScout42', slot: 'child', title: 'Boy scout', titleShort: 'Scout', skills: { Plants: 2, Shooting: 2, Medicine: 2 }, workDisables: [] },
  { id: 'BoySoldier14', slot: 'child', title: 'Boy soldier', titleShort: 'Soldier', skills: { Shooting: 4, Melee: 2 }, workDisables: [] },
  { id: 'BrothelGofer84', slot: 'child', title: 'Brothel gofer', titleShort: 'Gofer', skills: { Cooking: 2, Social: 2, Crafting: 2 }, workDisables: [] },
  { id: 'BrutalThief59', slot: 'child', title: 'Brutal thief', titleShort: 'Thief', skills: { Plants: -2, Shooting: 2, Melee: 4, Social: -2 }, workDisables: ['Caring', 'Artistic'] },
  { id: 'BuddingArtist44', slot: 'child', title: 'Budding artist', titleShort: 'Artist', skills: {}, workDisables: [] },
  { id: 'Bully70', slot: 'child', title: 'Bully', titleShort: 'Bully', skills: {}, workDisables: ['Caring'] },
  { id: 'BunkerKid41', slot: 'child', title: 'Bunker kid', titleShort: 'Bunker kid', skills: { Shooting: 4, Melee: 4, Social: -2 }, workDisables: ['Artistic', 'PlantWork'] },
  { id: 'Cadet96', slot: 'child', title: 'Cadet', titleShort: 'Cadet', skills: { Construction: 3, Crafting: 3, Intellectual: 3 }, workDisables: ['Violent'] },
  { id: 'CaravanChild53', slot: 'child', title: 'Caravan child', titleShort: 'Child', skills: { Social: 2, Artistic: 2 }, workDisables: [] },
  { id: 'CaravanTraveler6', slot: 'child', title: 'Caravan traveler', titleShort: 'Traveler', skills: { Plants: -3, Shooting: 1, Social: 2, Animals: 3 }, workDisables: [] },
  { id: 'CatHerder4', slot: 'child', title: 'Cat herder', titleShort: 'Herder', skills: { Cooking: 3, Social: 2 }, workDisables: ['Cleaning', 'Hauling'] },
  { id: 'CaveChild17', slot: 'child', title: 'Cave child', titleShort: 'Cave kid', skills: { Cooking: 2, Plants: 2, Mining: 2, Shooting: -2, Melee: -2, Crafting: 2 }, workDisables: [] },
  { id: 'CaveChild30', slot: 'child', title: 'Cave child', titleShort: 'Cave child', skills: {}, workDisables: [] },
  { id: 'NathanCustomChildhood', slot: 'child', title: 'Cave child', titleShort: 'Cave child', skills: { Construction: 3, Mining: 3 }, workDisables: [] },
  { id: 'CaveworldTender26', slot: 'child', title: 'Caveworld tender', titleShort: 'Cave kid', skills: {}, workDisables: [] },
  { id: 'CaveworldTunneler48', slot: 'child', title: 'Caveworld tunneler', titleShort: 'Tunneler', skills: {}, workDisables: ['Intellectual', 'Crafting'] },
  { id: 'ChessMaster67', slot: 'child', title: 'Chess master', titleShort: 'Chesshead', skills: { Social: 4, Intellectual: 2 }, workDisables: [] },
  { id: 'ChildTribal', slot: 'child', title: 'Child', titleShort: 'Child', skills: {}, workDisables: [] },
  { id: 'Child27', slot: 'child', title: 'Child', titleShort: 'Child', skills: {}, workDisables: [] },
  { id: 'ChildOfDrifters18', slot: 'child', title: 'Child of drifters', titleShort: 'Drifter', skills: { Shooting: 4, Melee: -2, Social: -3, Crafting: 6 }, workDisables: ['Firefighting', 'PlantWork', 'Mining'] },
  { id: 'ChildOfGlass61', slot: 'child', title: 'Child of glass', titleShort: 'Survivor', skills: { Plants: 3, Shooting: 4, Artistic: -3 }, workDisables: ['Social', 'Animals'] },
  { id: 'ChildProdigy76', slot: 'child', title: 'Child prodigy', titleShort: 'Prodigy', skills: { Cooking: -3, Mining: -3, Medicine: 6, Intellectual: 6 }, workDisables: [] },
  { id: 'ChildResearcher32', slot: 'child', title: 'Child researcher', titleShort: 'Researcher', skills: { Shooting: -2, Melee: -2, Intellectual: 7 }, workDisables: ['Crafting'] },
  { id: 'ChildScientist30', slot: 'child', title: 'Child scientist', titleShort: 'Scientist', skills: { Cooking: -2, Social: -3, Medicine: 3, Intellectual: 4 }, workDisables: [] },
  { id: 'ChildSlave58', slot: 'child', title: 'Child slave', titleShort: 'Slave', skills: { Construction: 2, Mining: 3, Social: -2 }, workDisables: ['Intellectual'] },
  { id: 'ChildSpy84', slot: 'child', title: 'Child spy', titleShort: 'Spy', skills: { Shooting: 3, Social: 3, Medicine: 1 }, workDisables: ['PlantWork'] },
  { id: 'ChildSpy47', slot: 'child', title: 'Child spy', titleShort: 'Spy', skills: {}, workDisables: [] },
  { id: 'ChildStar74', slot: 'child', title: 'Child star', titleShort: 'Star', skills: {}, workDisables: ['ManualDumb'] },
  { id: 'ChildKnave69', slot: 'child', title: 'Child-knave', titleShort: 'Knave', skills: { Shooting: -3, Melee: 4, Social: 3 }, workDisables: ['Firefighting'] },
  { id: 'CircusPerformer37', slot: 'child', title: 'Circus performer', titleShort: 'Performer', skills: { Social: 3, Artistic: 2 }, workDisables: ['Firefighting'] },
  { id: 'ClassClown96', slot: 'child', title: 'Class clown', titleShort: 'Clowny kid', skills: { Social: -3, Artistic: 4 }, workDisables: ['Violent'] },
  { id: 'CloneFarmed21', slot: 'child', title: 'Clone-farmed', titleShort: 'Disposable', skills: { Shooting: -3, Artistic: 3, Intellectual: 4 }, workDisables: [] },
  { id: 'ColiseumCleaner54', slot: 'child', title: 'Coliseum cleaner', titleShort: 'Cleaner', skills: { Social: 2, Crafting: 1, Intellectual: 4 }, workDisables: ['Caring', 'Firefighting', 'Mining'] },
  { id: 'Colonist22', slot: 'child', title: 'Colonist', titleShort: 'Colonist', skills: { Cooking: 3, Plants: 4, Crafting: 2 }, workDisables: ['Artistic', 'Firefighting'] },
  { id: 'ColonyChild59', slot: 'child', title: 'Colony child', titleShort: 'Colonist', skills: {}, workDisables: [] },
  { id: 'ColonyKid47', slot: 'child', title: 'Colony kid', titleShort: 'Colony kid', skills: { Social: -2, Medicine: 3, Intellectual: 2 }, workDisables: [] },
  { id: 'ComaChild93', slot: 'child', title: 'Coma child', titleShort: 'Coma child', skills: {}, workDisables: [] },
  { id: 'CommonerHeir5', slot: 'child', title: 'Commoner heir', titleShort: 'Heir', skills: { Melee: 2, Crafting: 3, Intellectual: 1 }, workDisables: [] },
  { id: 'Computer80', slot: 'child', title: 'Computer', titleShort: 'Computer', skills: { Construction: -2, Plants: -3, Artistic: 1, Crafting: 3, Intellectual: 4 }, workDisables: ['Social'] },
  { id: 'ComputerGeek62', slot: 'child', title: 'Computer geek', titleShort: 'Geek', skills: { Construction: 3, Shooting: -2, Intellectual: 3, Animals: 2 }, workDisables: ['Social', 'Cooking', 'PlantWork'] },
  { id: 'ConstructionGrunt84', slot: 'child', title: 'Construction grunt', titleShort: 'Builder', skills: { Construction: 4, Social: 1, Crafting: 2 }, workDisables: ['Cleaning', 'PlantWork'] },
  { id: 'ConventChild16', slot: 'child', title: 'Convent child', titleShort: 'Illicit', skills: {}, workDisables: ['Intellectual', 'Violent'] },
  { id: 'CoreDilettante33', slot: 'child', title: 'Core dilettante', titleShort: 'Dilettante', skills: { Social: 2, Artistic: 2, Intellectual: 2 }, workDisables: ['ManualDumb', 'Violent'] },
  { id: 'CoreworldStudent50', slot: 'child', title: 'Coreworld student', titleShort: 'Student', skills: { Construction: 2, Shooting: -1, Artistic: 4, Crafting: 4 }, workDisables: ['Cooking', 'PlantWork'] },
  { id: 'CorpStudent95', slot: 'child', title: 'Corp student', titleShort: 'Student', skills: { Social: 3, Medicine: -2, Artistic: -3, Intellectual: 3 }, workDisables: ['Cleaning'] },
  { id: 'CorpBredStudent54', slot: 'child', title: 'Corp-bred student', titleShort: 'Student', skills: { Social: 7, Medicine: 3, Crafting: 3, Intellectual: 5 }, workDisables: ['Violent', 'Artistic'] },
  { id: 'CorporateSlave22', slot: 'child', title: 'Corporate slave', titleShort: 'Soldier', skills: { Plants: -2, Shooting: 4, Social: 4, Animals: -2 }, workDisables: ['Cooking', 'Cleaning'] },
  { id: 'CountryChild95', slot: 'child', title: 'Country child', titleShort: 'Hick kid', skills: { Cooking: 2, Animals: 4 }, workDisables: ['Artistic'] },
  { id: 'CountryLordling92', slot: 'child', title: 'Country lordling', titleShort: 'Field lord', skills: {}, workDisables: [] },
  { id: 'CowFarmer39', slot: 'child', title: 'Cow farmer', titleShort: 'Farmer', skills: { Plants: 4, Animals: 3 }, workDisables: [] },
  { id: 'CrashBaby32', slot: 'child', title: 'Crash baby', titleShort: 'Crashbaby', skills: {}, workDisables: [] },
  { id: 'CrimeBossChild39', slot: 'child', title: 'Crime boss\' child', titleShort: 'Crime kid', skills: { Construction: 2, Shooting: 2, Melee: 2 }, workDisables: ['Caring', 'Artistic', 'Cooking'] },
  { id: 'CultChild3', slot: 'child', title: 'Cult child', titleShort: 'Cult kid', skills: {}, workDisables: ['Intellectual'] },
  { id: 'CuriousChild33', slot: 'child', title: 'Curious child', titleShort: 'Curious', skills: { Mining: -2, Social: -3, Intellectual: 4 }, workDisables: ['Violent'] },
  { id: 'MateCustomChildhood', slot: 'child', title: 'Curious kid', titleShort: 'Curious kid', skills: { Artistic: 1, Intellectual: 1 }, workDisables: [] },
  { id: 'DataDecoder39', slot: 'child', title: 'Data decoder', titleShort: 'Decoder', skills: { Intellectual: 2 }, workDisables: ['Social'] },
  { id: 'DedicatedStudent12', slot: 'child', title: 'Dedicated student', titleShort: 'Student', skills: { Artistic: 2, Intellectual: 2 }, workDisables: ['Animals', 'Cooking', 'Cleaning'] },
  { id: 'Delinquent13', slot: 'child', title: 'Delinquent', titleShort: 'Delinquent', skills: {}, workDisables: ['Animals', 'PlantWork'] },
  { id: 'DesertRat47', slot: 'child', title: 'Desert rat', titleShort: 'Desert rat', skills: { Melee: 2, Medicine: 2, Intellectual: 2 }, workDisables: [] },
  { id: 'DiplomatsChild97', slot: 'child', title: 'Diplomat\'s child', titleShort: 'Diplomat', skills: { Artistic: 1, Intellectual: 1 }, workDisables: ['Violent', 'Social'] },
  { id: 'DisasterSurvivor65', slot: 'child', title: 'Disaster survivor', titleShort: 'Survivor', skills: { Plants: 2, Melee: 3, Crafting: 2 }, workDisables: [] },
  { id: 'DisasterSurvivor29', slot: 'child', title: 'Disaster survivor', titleShort: 'Survivor', skills: { Construction: 3, Cooking: 2, Crafting: 1 }, workDisables: ['Animals'] },
  { id: 'DiscardedYouth93', slot: 'child', title: 'Discarded youth', titleShort: 'Discarded', skills: { Construction: 3, Crafting: 3 }, workDisables: ['Artistic', 'Cleaning', 'PlantWork'] },
  { id: 'DisciplinedFarmer28', slot: 'child', title: 'Disciplined farmer', titleShort: 'Farmer', skills: { Construction: 2, Plants: 3, Mining: 2, Intellectual: -1 }, workDisables: ['Social', 'Cooking'] },
  { id: 'DisplacedNoble67', slot: 'child', title: 'Displaced noble', titleShort: 'Noble', skills: { Shooting: 3, Crafting: 2, Intellectual: 1 }, workDisables: ['ManualDumb'] },
  { id: 'DreadedBaby56', slot: 'child', title: 'Dreaded baby', titleShort: 'Baby dude', skills: { Cooking: 3, Shooting: 1, Artistic: 3 }, workDisables: [] },
  { id: 'Dreamer79', slot: 'child', title: 'Dreamer', titleShort: 'Dreamer', skills: { Melee: 2, Social: 4, Artistic: 3 }, workDisables: [] },
  { id: 'Drudge9', slot: 'child', title: 'Drudge', titleShort: 'Drudge', skills: { Construction: 2, Mining: 2, Crafting: 2 }, workDisables: [] },
  { id: 'DrugMule80', slot: 'child', title: 'Drug mule', titleShort: 'Mule', skills: { Shooting: 2, Melee: 3 }, workDisables: ['Caring', 'Social', 'Intellectual', 'Artistic', 'Cleaning', 'PlantWork'] },
  { id: 'JoeCustomChildhood', slot: 'child', title: 'Drummer', titleShort: 'Drummer', skills: { Artistic: 2 }, workDisables: [] },
  { id: 'DustyFarmHand75', slot: 'child', title: 'Dusty farm hand', titleShort: 'Farm hand', skills: { Plants: 2, Medicine: 1, Animals: 2 }, workDisables: ['Intellectual', 'Artistic'] },
  { id: 'Empath47', slot: 'child', title: 'Empath', titleShort: 'Empath', skills: { Artistic: 2, Intellectual: 2 }, workDisables: ['Violent', 'Social', 'Animals'] },
  { id: 'EnergeticPopIdol61', slot: 'child', title: 'Energetic pop idol', titleShort: 'Pop idol', skills: { Melee: 3, Social: 2, Medicine: -2, Artistic: 5, Intellectual: -2 }, workDisables: [] },
  { id: 'ExiledPrince58', slot: 'child', title: 'Exiled prince', titleShort: 'Prince', skills: { Construction: 3, Artistic: -2, Crafting: 2, Animals: 1 }, workDisables: ['Caring'] },
  { id: 'FactoryDrone58', slot: 'child', title: 'Factory drone', titleShort: 'Worker', skills: { Construction: 3, Crafting: 3, Intellectual: -2 }, workDisables: ['Artistic'] },
  { id: 'FallenProdigy40', slot: 'child', title: 'Fallen prodigy', titleShort: 'Prodigy', skills: { Construction: 2, Plants: 2, Medicine: 3, Crafting: 2, Intellectual: 5 }, workDisables: ['Social'] },
  { id: 'FarmBoy64', slot: 'child', title: 'Farm boy', titleShort: 'Farm boy', skills: { Cooking: -2, Plants: 2, Mining: 3, Melee: 4, Social: -3 }, workDisables: [] },
  { id: 'FarmHand2', slot: 'child', title: 'Farm hand', titleShort: 'Farm hand', skills: { Construction: 2, Plants: 4, Melee: 2, Intellectual: -2 }, workDisables: [] },
  { id: 'FarmKid60', slot: 'child', title: 'Farm kid', titleShort: 'Farm kid', skills: { Plants: 3, Medicine: 2, Crafting: 2 }, workDisables: [] },
  { id: 'TechScholar75', slot: 'child', title: 'Farm kid', titleShort: 'Farm kid', skills: { Plants: 3, Shooting: 3, Animals: 1 }, workDisables: ['Intellectual'] },
  { id: 'FarmMechanic1', slot: 'child', title: 'Farm mechanic', titleShort: 'Mechanic', skills: { Construction: 4, Plants: 2 }, workDisables: ['Intellectual', 'Artistic'] },
  { id: 'FarmerBoy88', slot: 'child', title: 'Farmer boy', titleShort: 'Farmer', skills: { Construction: 1, Plants: 4, Mining: 1, Crafting: 2 }, workDisables: ['Caring', 'Social', 'Firefighting'] },
  { id: 'FarmersDaughter81', slot: 'child', title: 'Farmer\'s daughter', titleShort: 'Farm girl', skills: { Cooking: 2, Social: -1, Artistic: 3, Crafting: 3 }, workDisables: ['Violent'] },
  { id: 'FarmersSon20', slot: 'child', title: 'Farmer\'s son', titleShort: 'Farmer', skills: { Cooking: 1, Plants: 2, Social: -3, Animals: 4 }, workDisables: [] },
  { id: 'FeralChild96', slot: 'child', title: 'Feral child', titleShort: 'Feral', skills: { Plants: 2, Melee: 4, Crafting: 1 }, workDisables: ['Social', 'Intellectual'] },
  { id: 'FeralChild85', slot: 'child', title: 'Feral child', titleShort: 'Survivor', skills: { Plants: 2, Melee: 4, Crafting: 1 }, workDisables: ['Social'] },
  { id: 'FeudalFarmBoy0', slot: 'child', title: 'Feudal farm boy', titleShort: 'Slave', skills: { Plants: 4, Social: 2 }, workDisables: ['Intellectual'] },
  { id: 'FeudalLordling56', slot: 'child', title: 'Feudal lordling', titleShort: 'Lordling', skills: { Melee: 4, Social: 3 }, workDisables: ['ManualDumb'] },
  { id: 'FireKeeper44', slot: 'child', title: 'Fire keeper', titleShort: 'Firekeep', skills: {}, workDisables: [] },
  { id: 'FireScarredChild1', slot: 'child', title: 'Fire-scarred child', titleShort: 'Scarred', skills: { Mining: 1, Melee: 1 }, workDisables: ['Cooking', 'Firefighting'] },
  { id: 'ForestChild83', slot: 'child', title: 'Forest child', titleShort: 'Forest kid', skills: { Melee: 2, Animals: 2 }, workDisables: ['Intellectual'] },
  { id: 'FoundryApprentice76', slot: 'child', title: 'Foundry apprentice', titleShort: 'Foundryman', skills: { Construction: 3, Melee: 1, Artistic: -2, Crafting: 3 }, workDisables: [] },
  { id: 'Freethinker38', slot: 'child', title: 'Freethinker', titleShort: 'Thinker', skills: { Shooting: 3, Social: 2, Artistic: 2, Intellectual: 2 }, workDisables: [] },
  { id: 'FrightenedChild43', slot: 'child', title: 'Frightened child', titleShort: 'Scared', skills: {}, workDisables: ['Violent'] },
  { id: 'FrontierMarshal54', slot: 'child', title: 'Frontier marshal', titleShort: 'Marshal', skills: { Shooting: 4, Melee: 3 }, workDisables: [] },
  { id: 'GalacticPage37', slot: 'child', title: 'Galactic page', titleShort: 'Page', skills: { Social: 6, Artistic: 2 }, workDisables: ['ManualDumb', 'ManualSkilled'] },
  { id: 'GameFanatic86', slot: 'child', title: 'Game fanatic', titleShort: 'Gamer', skills: { Shooting: 3, Intellectual: 3 }, workDisables: ['Artistic'] },
  { id: 'GangMember83', slot: 'child', title: 'Gang member', titleShort: 'Ganger', skills: { Plants: -2, Shooting: 2, Melee: 5 }, workDisables: ['Social', 'Intellectual'] },
  { id: 'GangMember16', slot: 'child', title: 'Gang member', titleShort: 'Gang kid', skills: { Shooting: 3, Melee: 4, Medicine: 3 }, workDisables: ['Artistic'] },
  { id: 'GlitterworldKid85', slot: 'child', title: 'Glitterworld kid', titleShort: 'Glitterkid', skills: { Plants: -2, Melee: -2, Social: 3, Crafting: 2, Intellectual: 3 }, workDisables: [] },
  { id: 'GlitterworldNerd20', slot: 'child', title: 'Glitterworld nerd', titleShort: 'Nerd', skills: { Crafting: 2, Intellectual: 5 }, workDisables: ['ManualDumb', 'Artistic'] },
  { id: 'GlitterworldRoyal24', slot: 'child', title: 'Glitterworld royal', titleShort: 'Royalty', skills: { Cooking: 2, Social: 2, Artistic: 2 }, workDisables: ['ManualDumb'] },
  { id: 'GNomeSculptor34', slot: 'child', title: 'G-nome sculptor', titleShort: 'Sculptor', skills: { Social: 2, Artistic: 4, Crafting: 2, Intellectual: 2 }, workDisables: ['Cooking', 'Cleaning'] },
  { id: 'GunKid30', slot: 'child', title: 'Gun kid', titleShort: 'Gun kid', skills: { Shooting: 3, Melee: 3, Artistic: -3 }, workDisables: [] },
  { id: 'Gymnast48', slot: 'child', title: 'Gymnast', titleShort: 'Gymnast', skills: { Melee: 4, Social: 2 }, workDisables: [] },
  { id: 'HackerKid98', slot: 'child', title: 'Hacker kid', titleShort: 'Hacker', skills: { Construction: 3, Crafting: 3 }, workDisables: ['Social'] },
  { id: 'HackerProdigy84', slot: 'child', title: 'Hacker prodigy', titleShort: 'Hacker', skills: { Medicine: 4, Intellectual: 7 }, workDisables: ['ManualDumb', 'Cooking'] },
  { id: 'HeadjackAddict4', slot: 'child', title: 'Headjack addict', titleShort: 'Headjacker', skills: { Plants: -3, Shooting: 2, Intellectual: 4 }, workDisables: ['Social', 'Animals'] },
  { id: 'HelpDeskWorker31', slot: 'child', title: 'Help desk worker', titleShort: 'Help desk', skills: { Intellectual: 3 }, workDisables: ['Caring'] },
  { id: 'Herder19', slot: 'child', title: 'Herder', titleShort: 'Herder', skills: {}, workDisables: [] },
  { id: 'HexCellArtist91', slot: 'child', title: 'Hex-cell artist', titleShort: 'Artist', skills: { Artistic: 3, Crafting: 2 }, workDisables: ['Intellectual'] },
  { id: 'Hideaway7', slot: 'child', title: 'Hideaway', titleShort: 'Hideaway', skills: {}, workDisables: [] },
  { id: 'HighBaroness37', slot: 'child', title: 'High baroness', titleShort: 'Noble', skills: { Social: 7, Artistic: 2, Intellectual: 2 }, workDisables: ['ManualDumb'] },
  { id: 'HillbillyProdigy60', slot: 'child', title: 'Hillbilly prodigy', titleShort: 'Hillbilly', skills: { Melee: 2, Medicine: 2, Intellectual: 2 }, workDisables: ['Social', 'Artistic', 'Cleaning'] },
  { id: 'HistoryStudent12', slot: 'child', title: 'History student', titleShort: 'Student', skills: { Social: 2, Artistic: 4, Crafting: 1 }, workDisables: [] },
  { id: 'HunterScavenger64', slot: 'child', title: 'Hunter scavenger', titleShort: 'Scavenger', skills: { Cooking: 2, Social: 2, Medicine: 2, Artistic: 3 }, workDisables: ['Animals'] },
  { id: 'IcePlanetChild95', slot: 'child', title: 'Ice planet child', titleShort: 'Ice child', skills: { Construction: 2, Intellectual: 4 }, workDisables: ['Caring', 'Social', 'Artistic'] },
  { id: 'IceworldSurvivor75', slot: 'child', title: 'Iceworld survivor', titleShort: 'Iceborn', skills: { Construction: 3, Social: 1, Crafting: 1 }, workDisables: ['PlantWork'] },
  { id: 'IdealisticCadet64', slot: 'child', title: 'Idealistic cadet', titleShort: 'Cadet', skills: { Shooting: 4, Melee: 3, Social: -2 }, workDisables: ['Mining'] },
  { id: 'ImperialStudent49', slot: 'child', title: 'Imperial student', titleShort: 'Student', skills: { Plants: 2, Shooting: -3, Melee: 2, Intellectual: 3 }, workDisables: ['Crafting', 'Firefighting', 'Cleaning'] },
  { id: 'IndustrialOrphan13', slot: 'child', title: 'Industrial orphan', titleShort: 'Orphan', skills: {}, workDisables: [] },
  { id: 'IndworldUrchin73', slot: 'child', title: 'Indworld urchin', titleShort: 'Urchin', skills: { Construction: 1, Melee: 1, Crafting: 2 }, workDisables: ['PlantWork'] },
  { id: 'Infantry99', slot: 'child', title: 'Infantry', titleShort: 'Infantry', skills: { Shooting: 2, Melee: 1, Social: 2 }, workDisables: ['Caring'] },
  { id: 'JoywireAddict76', slot: 'child', title: 'Joywire addict', titleShort: 'Addict', skills: { Shooting: 4, Melee: 6, Social: -3 }, workDisables: ['Intellectual', 'Cleaning'] },
  { id: 'JungleKid35', slot: 'child', title: 'Jungle kid', titleShort: 'Jungle kid', skills: { Cooking: 2, Melee: 2, Intellectual: -2, Animals: 4 }, workDisables: [] },
  { id: 'JunkyardMechanic51', slot: 'child', title: 'Junkyard mechanic', titleShort: 'Mechanic', skills: { Construction: 2, Social: -3, Crafting: 4, Intellectual: 2 }, workDisables: ['Animals'] },
  { id: 'KidScientist53', slot: 'child', title: 'Kid scientist', titleShort: 'Scientist', skills: { Medicine: 4, Artistic: -3, Intellectual: 4 }, workDisables: ['ManualDumb', 'Social'] },
  { id: 'Killer41', slot: 'child', title: 'Killer', titleShort: 'Killer', skills: { Melee: 4, Medicine: 2 }, workDisables: ['Social'] },
  { id: 'LabGrownChild22', slot: 'child', title: 'Lab-grown child', titleShort: 'Lab-grown', skills: { Plants: 2, Artistic: 2, Intellectual: 2 }, workDisables: ['Animals'] },
  { id: 'LaborCampOrphan91', slot: 'child', title: 'Labor camp orphan', titleShort: 'Orphan', skills: { Construction: 4, Mining: 4 }, workDisables: ['Artistic'] },
  { id: 'LogicalChild2', slot: 'child', title: 'Logical child', titleShort: 'Logic kid', skills: { Construction: 2, Social: -2, Crafting: 2, Intellectual: 2 }, workDisables: ['Artistic'] },
  { id: 'Machinist56', slot: 'child', title: 'Machinist', titleShort: 'Machinist', skills: {}, workDisables: [] },
  { id: 'MadScientist47', slot: 'child', title: 'Mad scientist', titleShort: 'Scientist', skills: { Melee: 1, Social: 2, Intellectual: 4 }, workDisables: ['Cleaning'] },
  { id: 'MarineCadet73', slot: 'child', title: 'Marine cadet', titleShort: 'Cadet', skills: { Shooting: 3, Melee: 3 }, workDisables: [] },
  { id: 'WillCustomChildhood', slot: 'child', title: 'Maze child', titleShort: 'Maze child', skills: { Mining: 1, Intellectual: 1 }, workDisables: [] },
  { id: 'MechanoidHacker93', slot: 'child', title: 'Mechanoid hacker', titleShort: 'Mechacker', skills: { Construction: 3, Social: -3, Crafting: 3, Intellectual: 3 }, workDisables: ['Artistic'] },
  { id: 'MechanoidNerd10', slot: 'child', title: 'Mechanoid nerd', titleShort: 'Mechanerd', skills: { Construction: 2, Social: -2, Crafting: 2, Intellectual: 3 }, workDisables: [] },
  { id: 'MedicalAssistant12', slot: 'child', title: 'Medical assistant', titleShort: 'Medic', skills: {}, workDisables: ['Firefighting'] },
  { id: 'MedicalHelper27', slot: 'child', title: 'Medical helper', titleShort: 'Med helper', skills: { Social: 2, Medicine: 4 }, workDisables: ['Firefighting'] },
  { id: 'MedicalStudent96', slot: 'child', title: 'Medical student', titleShort: 'Student', skills: { Social: 1, Medicine: 6 }, workDisables: [] },
  { id: 'MedicalStudent38', slot: 'child', title: 'Medical student', titleShort: 'Student', skills: { Construction: -2, Social: 3, Medicine: 3 }, workDisables: ['Hauling', 'Mining'] },
  { id: 'MedievalLordling19', slot: 'child', title: 'Medieval lordling', titleShort: 'Lordling', skills: {}, workDisables: ['ManualDumb'] },
  { id: 'MedievalNomad12', slot: 'child', title: 'Medieval nomad', titleShort: 'Nomad', skills: { Cooking: 2, Social: 2, Animals: 2 }, workDisables: [] },
  { id: 'MedievalPlower14', slot: 'child', title: 'Medieval plower', titleShort: 'Plower', skills: { Construction: 2, Plants: 5, Artistic: -2, Intellectual: -1 }, workDisables: [] },
  { id: 'MedievalSlave49', slot: 'child', title: 'Medieval slave', titleShort: 'Slave', skills: {}, workDisables: [] },
  { id: 'MedievalSlave50', slot: 'child', title: 'Medieval slave', titleShort: 'Slave', skills: { Construction: 2, Cooking: 2, Plants: 3, Mining: 1, Artistic: -2 }, workDisables: ['Intellectual'] },
  { id: 'MedievalSquire5', slot: 'child', title: 'Medieval squire', titleShort: 'Squire', skills: { Construction: -1, Mining: -1, Shooting: 3, Melee: 5 }, workDisables: ['Cooking', 'PlantWork'] },
  { id: 'MedievalThief74', slot: 'child', title: 'Medieval thief', titleShort: 'Thief', skills: { Shooting: -3, Melee: 4, Social: -2, Crafting: 2 }, workDisables: [] },
  { id: 'MercenaryRecruit36', slot: 'child', title: 'Mercenary recruit', titleShort: 'Mercenary', skills: { Shooting: 3, Melee: 1, Crafting: 3 }, workDisables: [] },
  { id: 'MercenaryRecruit18', slot: 'child', title: 'Mercenary recruit', titleShort: 'Recruit', skills: { Shooting: 3, Crafting: 3 }, workDisables: [] },
  { id: 'MidworldCadet83', slot: 'child', title: 'Midworld cadet', titleShort: 'Cadet', skills: { Social: 3, Crafting: 2, Intellectual: 3 }, workDisables: [] },
  { id: 'MidworldGeek18', slot: 'child', title: 'Midworld geek', titleShort: 'Geek', skills: { Social: -3, Intellectual: 6 }, workDisables: [] },
  { id: 'MidworldLoner80', slot: 'child', title: 'Midworld loner', titleShort: 'Loner', skills: { Construction: 3, Shooting: 3, Social: -2, Crafting: 5 }, workDisables: [] },
  { id: 'MidworldSketcher71', slot: 'child', title: 'Midworld sketcher', titleShort: 'Sketcher', skills: { Shooting: 2, Melee: 1, Artistic: 3 }, workDisables: [] },
  { id: 'MilitantChild49', slot: 'child', title: 'Militant child', titleShort: 'Soldier', skills: { Shooting: 3, Melee: 3, Intellectual: 2 }, workDisables: [] },
  { id: 'MilitaryCadet16', slot: 'child', title: 'Military cadet', titleShort: 'Cadet', skills: { Plants: -2, Mining: 2, Shooting: 3, Melee: 2, Medicine: 2, Animals: -3 }, workDisables: ['Artistic'] },
  { id: 'MilitaryCadet46', slot: 'child', title: 'Military cadet', titleShort: 'Cadet', skills: {}, workDisables: ['Animals', 'PlantWork'] },
  { id: 'MilitaryChild82', slot: 'child', title: 'Military child', titleShort: 'Military', skills: { Construction: 2, Shooting: 3, Melee: 1, Medicine: 2, Artistic: -3 }, workDisables: [] },
  { id: 'MilitaryRecruit49', slot: 'child', title: 'Military recruit', titleShort: 'Recruit', skills: { Shooting: 4, Melee: 3 }, workDisables: ['Caring'] },
  { id: 'MilitaryTrainee20', slot: 'child', title: 'Military trainee', titleShort: 'Trainee', skills: { Shooting: 3, Melee: 2, Medicine: 2 }, workDisables: [] },
  { id: 'MonkeyChild67', slot: 'child', title: 'Monkey child', titleShort: 'Monkey kid', skills: { Plants: 6, Mining: 4, Social: -3, Animals: 6 }, workDisables: ['Artistic', 'Cleaning'] },
  { id: 'MusicIdol50', slot: 'child', title: 'Music idol', titleShort: 'Music idol', skills: { Mining: -2, Melee: -2, Social: 3, Artistic: 2, Intellectual: 2 }, workDisables: [] },
  { id: 'MusicalKid14', slot: 'child', title: 'Musical kid', titleShort: 'Music kid', skills: { Social: 3, Artistic: 3 }, workDisables: ['Intellectual'] },
  { id: 'MusicalKid86', slot: 'child', title: 'Musical kid', titleShort: 'Musician', skills: {}, workDisables: [] },
  { id: 'Mute34', slot: 'child', title: 'Mute', titleShort: 'Mute', skills: {}, workDisables: ['Social'] },
  { id: 'Naturalist14', slot: 'child', title: 'Naturalist', titleShort: 'Naturalist', skills: { Cooking: 2, Plants: 3, Melee: 2 }, workDisables: ['Social', 'Intellectual'] },
  { id: 'NavyPathfinder53', slot: 'child', title: 'Navy pathfinder', titleShort: 'Pathfinder', skills: { Cooking: -2, Shooting: 2, Social: 3, Intellectual: 3, Animals: 4 }, workDisables: [] },
  { id: 'Nerd92', slot: 'child', title: 'Nerd', titleShort: 'Nerd', skills: { Construction: 1, Medicine: 2, Crafting: 2, Intellectual: 4 }, workDisables: ['Social'] },
  { id: 'NewAgeDuelist27', slot: 'child', title: 'New age duelist', titleShort: 'Duelist', skills: { Shooting: -2, Melee: 4, Animals: -2 }, workDisables: ['Cleaning'] },
  { id: 'Newborn79', slot: 'child', title: 'Newborn', titleShort: 'Newborn', skills: {}, workDisables: [] },
  { id: 'NobleWard61', slot: 'child', title: 'Noble ward', titleShort: 'Ward', skills: { Shooting: -1, Melee: -2, Social: 3, Intellectual: 4 }, workDisables: ['ManualDumb', 'Firefighting', 'PlantWork', 'Mining'] },
  { id: 'OfficerCadet25', slot: 'child', title: 'Officer cadet', titleShort: 'Cadet', skills: { Plants: 1, Shooting: 3, Melee: 3, Social: 1, Medicine: 1 }, workDisables: ['Artistic'] },
  { id: 'OffworldRecruit91', slot: 'child', title: 'Offworld recruit', titleShort: 'Recruit', skills: { Shooting: 2, Melee: 2, Medicine: 2 }, workDisables: ['Artistic'] },
  { id: 'OldMoneyHeir46', slot: 'child', title: 'Old money heir', titleShort: 'Heir', skills: { Social: 4, Artistic: 2, Intellectual: 3 }, workDisables: ['Cleaning'] },
  { id: 'OptimisticChild30', slot: 'child', title: 'Optimistic child', titleShort: 'Optimistic', skills: { Social: 4 }, workDisables: [] },
  { id: 'OrganFarm67', slot: 'child', title: 'Organ farm', titleShort: 'Organ farm', skills: {}, workDisables: ['Violent'] },
  { id: 'Orphan11', slot: 'child', title: 'Orphan', titleShort: 'Orphan', skills: { Construction: 2, Cooking: 2, Crafting: 2 }, workDisables: ['Social', 'Animals'] },
  { id: 'Orphan15', slot: 'child', title: 'Orphan', titleShort: 'Orphan', skills: { Melee: 4, Medicine: 2 }, workDisables: ['Crafting'] },
  { id: 'Orphan25', slot: 'child', title: 'Orphan', titleShort: 'Orphan', skills: { Social: 6 }, workDisables: [] },
  { id: 'OrphanOfWar60', slot: 'child', title: 'Orphan of war', titleShort: 'Orphan', skills: { Construction: 3, Cooking: 3, Mining: 3, Intellectual: -3 }, workDisables: ['Social'] },
  { id: 'OrphanedAcrobat84', slot: 'child', title: 'Orphaned acrobat', titleShort: 'Acrobat', skills: { Melee: 2, Social: 3, Animals: 1 }, workDisables: ['Caring'] },
  { id: 'Pampered87', slot: 'child', title: 'Pampered', titleShort: 'Pampered', skills: { Melee: -3, Social: 3, Medicine: 3, Intellectual: 2 }, workDisables: ['Cooking'] },
  { id: 'PamperedLordling37', slot: 'child', title: 'Pampered lordling', titleShort: 'Pampered', skills: {}, workDisables: ['ManualDumb'] },
  { id: 'PetKeeper7', slot: 'child', title: 'Pet keeper', titleShort: 'Pet keeper', skills: { Medicine: 1, Animals: 6 }, workDisables: ['Social', 'Artistic'] },
  { id: 'Philosopher82', slot: 'child', title: 'Philosopher', titleShort: 'Thinker', skills: { Social: 3, Intellectual: 4 }, workDisables: ['Violent'] },
  { id: 'Pickpocket61', slot: 'child', title: 'Pickpocket', titleShort: 'Thief', skills: { Melee: 3, Social: -1, Crafting: 3, Intellectual: -2 }, workDisables: [] },
  { id: 'Pickpocket82', slot: 'child', title: 'Pickpocket', titleShort: 'Pickpocket', skills: { Melee: 2, Social: 2, Artistic: 2 }, workDisables: ['Cleaning', 'PlantWork'] },
  { id: 'PilotFan16', slot: 'child', title: 'Pilot fan', titleShort: 'Pilot fan', skills: { Shooting: 3, Intellectual: 3 }, workDisables: [] },
  { id: 'PitGladiator19', slot: 'child', title: 'Pit gladiator', titleShort: 'Gladiator', skills: { Shooting: 4, Melee: 4 }, workDisables: ['Intellectual'] },
  { id: 'PizzaLover94', slot: 'child', title: 'Pizza lover', titleShort: 'Pizza kid', skills: { Cooking: 3, Melee: 5 }, workDisables: ['Caring'] },
  { id: 'PlagueChild44', slot: 'child', title: 'Plague child', titleShort: 'Child', skills: { Social: -3, Medicine: 5, Intellectual: 1 }, workDisables: ['Violent', 'Animals', 'Artistic', 'Cooking'] },
  { id: 'PlagueProdigy12', slot: 'child', title: 'Plague prodigy', titleShort: 'Prodigy', skills: { Construction: 2, Social: -2, Intellectual: 4 }, workDisables: ['Caring', 'Artistic'] },
  { id: 'PlagueSurvivor39', slot: 'child', title: 'Plague survivor', titleShort: 'Survivor', skills: { Cooking: 2, Social: -2, Medicine: 3 }, workDisables: [] },
  { id: 'PoliticalCaptive7', slot: 'child', title: 'Political captive', titleShort: 'Captive', skills: {}, workDisables: ['Social'] },
  { id: 'PoorKid18', slot: 'child', title: 'Poor kid', titleShort: 'Poor kid', skills: { Melee: 4, Social: 1 }, workDisables: ['Caring'] },
  { id: 'PowerMadScholar30', slot: 'child', title: 'Power-mad scholar', titleShort: 'Scholar', skills: { Construction: 2, Social: -3, Crafting: 3, Intellectual: 3 }, workDisables: [] },
  { id: 'PrivilegedChild86', slot: 'child', title: 'Privileged child', titleShort: 'Privileged', skills: { Social: 3 }, workDisables: ['ManualDumb'] },
  { id: 'PrivilegedProdigy70', slot: 'child', title: 'Privileged prodigy', titleShort: 'Prodigy', skills: { Medicine: 1, Artistic: 2, Intellectual: 2 }, workDisables: ['ManualDumb', 'Violent', 'Hauling', 'PlantWork', 'Mining'] },
  { id: 'ProdigalStudent67', slot: 'child', title: 'Prodigal student', titleShort: 'Student', skills: { Crafting: 2, Intellectual: 3 }, workDisables: ['Animals'] },
  { id: 'ProfessionalGamer76', slot: 'child', title: 'Professional gamer', titleShort: 'Pro gamer', skills: { Shooting: 4, Melee: -3, Crafting: 2 }, workDisables: ['Artistic'] },
  { id: 'ProjectSubject99', slot: 'child', title: 'Project subject', titleShort: 'Subject', skills: { Shooting: 4, Melee: 4 }, workDisables: ['Cleaning'] },
  { id: 'PsychologyStudent15', slot: 'child', title: 'Psychology student', titleShort: 'Student', skills: { Social: -3, Artistic: 4 }, workDisables: ['Violent'] },
  { id: 'TynanCustomChildhood', slot: 'child', title: 'Punk', titleShort: 'Punk', skills: { Social: -2, Intellectual: -2 }, workDisables: [] },
  { id: 'Punk30', slot: 'child', title: 'Punk', titleShort: 'Punk', skills: { Social: -2, Intellectual: -2 }, workDisables: [] },
  { id: 'PyroAssistant82', slot: 'child', title: 'Pyro assistant', titleShort: 'Assistant', skills: { Construction: 4, Medicine: 3 }, workDisables: ['Cooking', 'Firefighting'] },
  { id: 'Pyromaniac18', slot: 'child', title: 'Pyromaniac', titleShort: 'Pyro', skills: {}, workDisables: ['Firefighting'] },
  { id: 'QuietNerd97', slot: 'child', title: 'Quiet nerd', titleShort: 'Nerd', skills: { Social: -2, Artistic: 1, Crafting: 2, Intellectual: 2 }, workDisables: ['ManualDumb'] },
  { id: 'RangerChild57', slot: 'child', title: 'Ranger child', titleShort: 'Ranger kid', skills: { Cooking: 2, Mining: -2, Shooting: 2, Animals: 4 }, workDisables: ['Firefighting', 'PlantWork'] },
  { id: 'RebelChild8', slot: 'child', title: 'Rebel child', titleShort: 'Rebel', skills: { Melee: 2, Social: 3 }, workDisables: ['Caring'] },
  { id: 'RebelSlave14', slot: 'child', title: 'Rebel slave', titleShort: 'Rebel', skills: { Construction: 1, Plants: 1, Shooting: 2, Social: 2, Crafting: 2, Intellectual: -2 }, workDisables: ['Artistic', 'Mining'] },
  { id: 'RebelStudent14', slot: 'child', title: 'Rebel student', titleShort: 'Student', skills: { Shooting: 2, Intellectual: 3 }, workDisables: ['ManualDumb'] },
  { id: 'RebelWriter82', slot: 'child', title: 'Rebel writer', titleShort: 'Writer', skills: { Intellectual: 7 }, workDisables: [] },
  { id: 'RebelliousStudent74', slot: 'child', title: 'Rebellious student', titleShort: 'Student', skills: { Melee: 4, Social: -3, Artistic: 2, Intellectual: 2 }, workDisables: [] },
  { id: 'ReclusiveChild81', slot: 'child', title: 'Reclusive child', titleShort: 'Reclusive', skills: {}, workDisables: ['Social'] },
  { id: 'ReclusiveProdigy96', slot: 'child', title: 'Reclusive prodigy', titleShort: 'Prodigy', skills: { Medicine: 4, Intellectual: 4 }, workDisables: ['Social', 'Artistic'] },
  { id: 'ReEducatedYouth23', slot: 'child', title: 'Re-educated youth', titleShort: 'Reeducated', skills: { Social: 2 }, workDisables: ['Artistic'] },
  { id: 'RichBoy9', slot: 'child', title: 'Rich boy', titleShort: 'Rich boy', skills: { Melee: 3, Artistic: 3 }, workDisables: ['Caring', 'Social'] },
  { id: 'RichKid61', slot: 'child', title: 'Rich kid', titleShort: 'Rich kid', skills: {}, workDisables: [] },
  { id: 'RitualChild20', slot: 'child', title: 'Ritual child', titleShort: 'Sacrifice', skills: { Melee: 3, Crafting: 3, Intellectual: -3, Animals: 4 }, workDisables: ['Social'] },
  { id: 'RoyalBastard64', slot: 'child', title: 'Royal bastard', titleShort: 'Bastard', skills: {}, workDisables: [] },
  { id: 'Scavenger22', slot: 'child', title: 'Scavenger', titleShort: 'Scavenger', skills: {}, workDisables: ['ManualDumb'] },
  { id: 'Scavenger62', slot: 'child', title: 'Scavenger', titleShort: 'Scavenger', skills: { Cooking: 2, Shooting: 2, Melee: 2, Social: -2 }, workDisables: ['Intellectual', 'Artistic'] },
  { id: 'SchoolyardOutcast11', slot: 'child', title: 'Schoolyard outcast', titleShort: 'Outcast', skills: { Melee: 2, Social: -3, Artistic: 2, Intellectual: 2 }, workDisables: [] },
  { id: 'ScienceProdigy65', slot: 'child', title: 'Science prodigy', titleShort: 'Prodigy', skills: { Medicine: 3, Artistic: 2, Intellectual: 3 }, workDisables: ['Violent', 'Firefighting'] },
  { id: 'Scout6', slot: 'child', title: 'Scout', titleShort: 'Scout', skills: { Construction: 1, Shooting: 3, Crafting: 2 }, workDisables: ['Intellectual', 'Artistic'] },
  { id: 'Scout44', slot: 'child', title: 'Scout', titleShort: 'Scout', skills: {}, workDisables: ['Artistic', 'Intellectual'] },
  { id: 'Scrounger25', slot: 'child', title: 'Scrounger', titleShort: 'Scrounger', skills: { Mining: 2, Social: -2, Crafting: 2 }, workDisables: ['Cleaning'] },
  { id: 'SentimentalChild55', slot: 'child', title: 'Sentimental child', titleShort: 'Nice kid', skills: { Social: 4 }, workDisables: [] },
  { id: 'ServingBoy97', slot: 'child', title: 'Serving boy', titleShort: 'House boy', skills: {}, workDisables: [] },
  { id: 'SewerKid57', slot: 'child', title: 'Sewer kid', titleShort: 'Sewer boy', skills: {}, workDisables: [] },
  { id: 'ShelterChild50', slot: 'child', title: 'Shelter child', titleShort: 'Shelterkid', skills: {}, workDisables: [] },
  { id: 'ShipBoy89', slot: 'child', title: 'Ship boy', titleShort: 'Ship boy', skills: {}, workDisables: ['Animals', 'PlantWork'] },
  { id: 'ShipChild46', slot: 'child', title: 'Ship child', titleShort: 'Ship child', skills: { Melee: -3, Social: -3, Artistic: 4, Crafting: 4 }, workDisables: ['Animals', 'Cooking', 'PlantWork', 'Mining'] },
  { id: 'ShipTechnician0', slot: 'child', title: 'Ship technician', titleShort: 'Technician', skills: { Construction: 3, Plants: -3, Crafting: 3, Intellectual: 3 }, workDisables: [] },
  { id: 'ShipboundLordling12', slot: 'child', title: 'Shipbound lordling', titleShort: 'Ship lord', skills: {}, workDisables: [] },
  { id: 'ShootingComa59', slot: 'child', title: 'Shooting coma', titleShort: 'Coma child', skills: { Shooting: 8 }, workDisables: ['ManualDumb', 'ManualSkilled', 'Intellectual', 'Artistic'] },
  { id: 'ShopKid36', slot: 'child', title: 'Shop kid', titleShort: 'Shopkid', skills: {}, workDisables: [] },
  { id: 'ShunnedGirl30', slot: 'child', title: 'Shunned girl', titleShort: 'Shunned', skills: { Shooting: 2, Social: -2 }, workDisables: [] },
  { id: 'SicklyChild55', slot: 'child', title: 'Sickly child', titleShort: 'Patient', skills: {}, workDisables: [] },
  { id: 'SicklyLiar3', slot: 'child', title: 'Sickly liar', titleShort: 'Liar', skills: { Construction: -2, Shooting: -2, Melee: -2, Social: 6 }, workDisables: ['Caring'] },
  { id: 'LiamCustomChildhood', slot: 'child', title: 'Sim addict', titleShort: 'Sim addict', skills: { Intellectual: 2 }, workDisables: [] },
  { id: 'SlaveFarmer99', slot: 'child', title: 'Slave farmer', titleShort: 'Slave', skills: { Plants: 4 }, workDisables: ['Violent'] },
  { id: 'SmallTownKid41', slot: 'child', title: 'Small town kid', titleShort: 'Town kid', skills: { Construction: -3, Cooking: 3, Plants: 3, Mining: -3, Medicine: 3, Animals: 3 }, workDisables: ['Violent'] },
  { id: 'SocialPariah3', slot: 'child', title: 'Social pariah', titleShort: 'Pariah', skills: { Crafting: 2, Animals: 2 }, workDisables: [] },
  { id: 'SoldierExperiment50', slot: 'child', title: 'Soldier experiment', titleShort: 'Experiment', skills: { Shooting: 3, Melee: 3, Social: -3, Medicine: 2 }, workDisables: ['Cooking', 'Cleaning'] },
  { id: 'SoldiersKid55', slot: 'child', title: 'Soldier\'s kid', titleShort: 'Soldier kid', skills: {}, workDisables: ['Animals', 'PlantWork'] },
  { id: 'SoleSurvivor63', slot: 'child', title: 'Sole survivor', titleShort: 'Survivor', skills: { Plants: 2, Shooting: 2, Crafting: 2 }, workDisables: [] },
  { id: 'SoleSurvivor21', slot: 'child', title: 'Sole survivor', titleShort: 'Survivor', skills: {}, workDisables: ['Violent'] },
  { id: 'SonOfAHuntress75', slot: 'child', title: 'Son of a huntress', titleShort: 'Hunter', skills: { Cooking: 2, Shooting: 2, Melee: 2, Medicine: 1, Crafting: 1 }, workDisables: ['Intellectual'] },
  { id: 'SpaceCadet77', slot: 'child', title: 'Space cadet', titleShort: 'Cadet', skills: { Shooting: 4, Melee: 2 }, workDisables: ['PlantWork'] },
  { id: 'SpaceFanboy22', slot: 'child', title: 'Space fanboy', titleShort: 'Fanboy', skills: { Crafting: 3, Intellectual: 2 }, workDisables: [] },
  { id: 'SpaceNerd97', slot: 'child', title: 'Space nerd', titleShort: 'Space nerd', skills: { Cooking: 2, Social: -3, Crafting: 2, Intellectual: 4 }, workDisables: [] },
  { id: 'SpaceSmuggler6', slot: 'child', title: 'Space smuggler', titleShort: 'Smuggler', skills: { Plants: -2, Shooting: 3, Melee: 3, Social: 3, Medicine: 2, Artistic: -2, Intellectual: -2 }, workDisables: [] },
  { id: 'SpacerOrphan77', slot: 'child', title: 'Spacer orphan', titleShort: 'Orphan', skills: { Shooting: 2, Melee: 4, Crafting: 2 }, workDisables: ['Artistic', 'Mining'] },
  { id: 'SpaceyachtPilot89', slot: 'child', title: 'Spaceyacht pilot', titleShort: 'Pilot', skills: { Melee: 2, Social: 4 }, workDisables: ['Cooking'] },
  { id: 'SpeederRacer71', slot: 'child', title: 'Speeder racer', titleShort: 'Racer', skills: { Shooting: 3, Social: 3 }, workDisables: [] },
  { id: 'SpoiledBrat59', slot: 'child', title: 'Spoiled brat', titleShort: 'Brat', skills: { Medicine: 2 }, workDisables: ['ManualSkilled', 'Social', 'Intellectual', 'Cooking'] },
  { id: 'SpoiledChild33', slot: 'child', title: 'Spoiled child', titleShort: 'Spoiled', skills: { Construction: -2, Cooking: 2, Plants: 2, Mining: -2, Social: 2, Artistic: 2 }, workDisables: ['Firefighting'] },
  { id: 'SpoiledChild80', slot: 'child', title: 'Spoiled child', titleShort: 'Spoiled', skills: { Artistic: 2, Intellectual: 3, Animals: 3 }, workDisables: ['ManualDumb'] },
  { id: 'Stableboy49', slot: 'child', title: 'Stableboy', titleShort: 'Stableboy', skills: { Mining: 2, Melee: 2, Artistic: 2, Crafting: 1 }, workDisables: ['Social'] },
  { id: 'StarSquire9', slot: 'child', title: 'Star squire', titleShort: 'Squire', skills: { Shooting: 2, Melee: 3 }, workDisables: ['Animals', 'Artistic'] },
  { id: 'StarforceCadet79', slot: 'child', title: 'Starforce cadet', titleShort: 'Cadet', skills: { Mining: -3, Social: 2, Medicine: 1, Intellectual: 2 }, workDisables: [] },
  { id: 'StationWhelp94', slot: 'child', title: 'Station whelp', titleShort: 'Whelp', skills: { Shooting: 3, Melee: 5 }, workDisables: ['Caring', 'Social'] },
  { id: 'SteamworldTinker38', slot: 'child', title: 'Steamworld tinker', titleShort: 'Tinker', skills: { Construction: 4, Social: -3, Crafting: 3 }, workDisables: ['Artistic'] },
  { id: 'StewardsAssisant28', slot: 'child', title: 'Steward\'s assistant', titleShort: 'Steward', skills: { Cooking: 5, Melee: 5, Artistic: -2 }, workDisables: ['Hauling'] },
  { id: 'StoryWriter67', slot: 'child', title: 'Story writer', titleShort: 'Writer', skills: {}, workDisables: [] },
  { id: 'Straggler71', slot: 'child', title: 'Straggler', titleShort: 'Straggler', skills: { Melee: 2, Artistic: 2, Crafting: 2, Intellectual: -3 }, workDisables: ['Caring', 'Social'] },
  { id: 'StreetChild4', slot: 'child', title: 'Street child', titleShort: 'Street', skills: { Social: 3 }, workDisables: [] },
  { id: 'StreetKid19', slot: 'child', title: 'Street kid', titleShort: 'Street kid', skills: { Melee: 3, Social: 3 }, workDisables: ['PlantWork'] },
  { id: 'StreetPeddler66', slot: 'child', title: 'Street peddler', titleShort: 'Peddler', skills: { Melee: 2, Social: 3, Crafting: 2 }, workDisables: [] },
  { id: 'StreetRat81', slot: 'child', title: 'Street rat', titleShort: 'Street rat', skills: {}, workDisables: [] },
  { id: 'StreetUrchin53', slot: 'child', title: 'Street urchin', titleShort: 'Urchin', skills: { Shooting: 3, Melee: 3 }, workDisables: ['Social'] },
  { id: 'StreetUrchin74', slot: 'child', title: 'Street urchin', titleShort: 'Grifter', skills: { Construction: 2, Plants: -2, Shooting: 2, Melee: 3, Social: 2 }, workDisables: ['Artistic'] },
  { id: 'StreetUrchin45', slot: 'child', title: 'Street urchin', titleShort: 'Street rat', skills: { Construction: 2, Mining: 2, Melee: 3, Intellectual: -2 }, workDisables: ['Artistic'] },
  { id: 'Student65', slot: 'child', title: 'Student', titleShort: 'Student', skills: { Mining: -2, Social: 2, Medicine: 3, Intellectual: 3 }, workDisables: ['Cleaning', 'Hauling'] },
  { id: 'StudentEngineer34', slot: 'child', title: 'Student engineer', titleShort: 'Engineer', skills: { Construction: 2, Cooking: -2, Mining: -2, Artistic: -2, Crafting: 4, Intellectual: 4 }, workDisables: ['ManualDumb'] },
  { id: 'StudentSocialite89', slot: 'child', title: 'Student socialite', titleShort: 'Socialite', skills: { Social: 6 }, workDisables: ['ManualDumb', 'ManualSkilled', 'Caring', 'Artistic'] },
  { id: 'SuperSoldier99', slot: 'child', title: 'Super soldier', titleShort: 'Soldier', skills: { Plants: -3, Shooting: 3, Melee: 3, Medicine: 2 }, workDisables: ['Social', 'Animals', 'Artistic'] },
  { id: 'TechEnthusiast28', slot: 'child', title: 'Tech enthusiast', titleShort: 'Tech nerd', skills: { Shooting: 4, Social: -3, Intellectual: 4 }, workDisables: ['PlantWork'] },
  { id: 'TechHead8', slot: 'child', title: 'Tech-head', titleShort: 'Tech-head', skills: { Plants: 2, Social: -1, Intellectual: 6 }, workDisables: ['Cleaning'] },
  { id: 'TechnicalKid1', slot: 'child', title: 'Technical kid', titleShort: 'Tech kid', skills: { Construction: 2, Medicine: 3, Crafting: 2, Animals: 2 }, workDisables: ['Artistic'] },
  { id: 'TestSubject82', slot: 'child', title: 'Test subject', titleShort: 'Subject', skills: { Cooking: 1, Melee: 2, Intellectual: 2 }, workDisables: ['Social', 'PlantWork', 'Mining'] },
  { id: 'TestSubject15', slot: 'child', title: 'Test subject', titleShort: 'Testee', skills: {}, workDisables: ['Social', 'Caring', 'Firefighting'] },
  { id: 'Tinkerer11', slot: 'child', title: 'Tinkerer', titleShort: 'Tinkerer', skills: { Melee: -2, Crafting: 3, Intellectual: 3 }, workDisables: [] },
  { id: 'CynapseCustomChildhood', slot: 'child', title: 'Tinkerer', titleShort: 'Tinkerer', skills: { Crafting: 2, Intellectual: 2 }, workDisables: ['Social'] },
  { id: 'Tinkerer79', slot: 'child', title: 'Tinkerer', titleShort: 'Tinkerer', skills: { Construction: 2, Crafting: 4 }, workDisables: ['PlantWork'] },
  { id: 'ToxicChild96', slot: 'child', title: 'Toxic child', titleShort: 'Toxic', skills: { Construction: 3, Crafting: 3 }, workDisables: ['Firefighting', 'PlantWork'] },
  { id: 'TradersChild62', slot: 'child', title: 'Traders\' child', titleShort: 'Trader', skills: { Construction: -2, Plants: -1, Social: 1, Crafting: 1 }, workDisables: [] },
  { id: 'TragicLoner87', slot: 'child', title: 'Tragic loner', titleShort: 'Loner', skills: { Artistic: -2, Intellectual: 4, Animals: 2 }, workDisables: ['Social'] },
  { id: 'TraineeAlchemist64', slot: 'child', title: 'Trainee alchemist', titleShort: 'Alchemist', skills: { Cooking: 4, Medicine: 3, Intellectual: 3 }, workDisables: [] },
  { id: 'TransferStudent10', slot: 'child', title: 'Transfer student', titleShort: 'Student', skills: { Social: 2, Intellectual: 3 }, workDisables: ['ManualDumb'] },
  { id: 'TraumatizedYouth87', slot: 'child', title: 'Traumatized youth', titleShort: 'Trauma', skills: { Melee: 2, Medicine: 4 }, workDisables: ['Social'] },
  { id: 'TribalThunderer45', slot: 'child', title: 'Tribal thunderer', titleShort: 'Thunderer', skills: { Shooting: 5, Medicine: 2 }, workDisables: ['Intellectual', 'Artistic', 'Crafting'] },
  { id: 'TribeChild19', slot: 'child', title: 'Tribe child', titleShort: 'Tribal', skills: {}, workDisables: [] },
  { id: 'TribeChild40', slot: 'child', title: 'Tribe child', titleShort: 'Tribal', skills: {}, workDisables: [] },
  { id: 'TurtleHerder41', slot: 'child', title: 'Turtle herder', titleShort: 'Herder', skills: { Shooting: 2, Social: 1, Artistic: -2, Animals: 5 }, workDisables: [] },
  { id: 'UnwantedSurvivor67', slot: 'child', title: 'Unwanted survivor', titleShort: 'Survivor', skills: {}, workDisables: ['ManualDumb'] },
  { id: 'UpperUrbworlder12', slot: 'child', title: 'Upper urbworlder', titleShort: 'High urber', skills: { Construction: -3, Artistic: 2, Crafting: -3, Intellectual: 3 }, workDisables: [] },
  { id: 'UrbanLordling82', slot: 'child', title: 'Urban lordling', titleShort: 'City lord', skills: {}, workDisables: [] },
  { id: 'UrbworldArmyBrat84', slot: 'child', title: 'Urbworld army brat', titleShort: 'Army brat', skills: { Construction: 3, Plants: -3, Shooting: 3, Crafting: 2 }, workDisables: [] },
  { id: 'UrbworldChild56', slot: 'child', title: 'Urbworld child', titleShort: 'Urbkid', skills: { Plants: 1, Shooting: 3, Artistic: 1, Crafting: 1, Intellectual: 1 }, workDisables: [] },
  { id: 'UrbworldCriminal6', slot: 'child', title: 'Urbworld criminal', titleShort: 'Criminal', skills: { Shooting: 2, Melee: 3, Medicine: 1 }, workDisables: [] },
  { id: 'UrbworldHooligan12', slot: 'child', title: 'Urbworld hooligan', titleShort: 'Hooligan', skills: { Cooking: -3, Shooting: 2, Melee: 3 }, workDisables: ['PlantWork'] },
  { id: 'UrbworldUrchin6', slot: 'child', title: 'Urbworld urchin', titleShort: 'Urchin', skills: { Melee: 4, Social: -2, Crafting: 2 }, workDisables: ['PlantWork'] },
  { id: 'UrbworldUrchin61', slot: 'child', title: 'Urbworld urchin', titleShort: 'Urchin', skills: {}, workDisables: [] },
  { id: 'UrbworldUrchin90', slot: 'child', title: 'Urbworld urchin', titleShort: 'Urchin', skills: { Mining: 4, Melee: 2 }, workDisables: ['Artistic', 'Crafting'] },
  { id: 'VatgrownAssassin20', slot: 'child', title: 'Vatgrown assassin', titleShort: 'Clone', skills: { Construction: 2, Shooting: 4, Melee: 1 }, workDisables: ['Caring', 'Artistic', 'Cooking', 'PlantWork'] },
  { id: 'VatgrownChild11', slot: 'child', title: 'Vatgrown child', titleShort: 'Child', skills: {}, workDisables: [] },
  { id: 'VatgrownMedic53', slot: 'child', title: 'Vatgrown medic', titleShort: 'Medic', skills: { Shooting: 3, Medicine: 3 }, workDisables: ['Social', 'Artistic', 'Crafting', 'Cooking'] },
  { id: 'VatgrownScientist91', slot: 'child', title: 'Vatgrown scientist', titleShort: 'Scientist', skills: { Medicine: 2, Intellectual: 5 }, workDisables: [] },
  { id: 'VatgrownSlavegirl8', slot: 'child', title: 'Vatgrown slavegirl', titleShort: 'Slave girl', skills: { Cooking: 5, Artistic: -2 }, workDisables: ['Violent', 'Intellectual'] },
  { id: 'VatgrownSoldier8', slot: 'child', title: 'Vatgrown soldier', titleShort: 'Vatgrown', skills: {}, workDisables: ['Social', 'Caring'] },
  { id: 'VengefulChild43', slot: 'child', title: 'Vengeful child', titleShort: 'Vengeful', skills: {}, workDisables: ['Caring'] },
  { id: 'VideoGamer55', slot: 'child', title: 'Video gamer', titleShort: 'Gamer', skills: { Social: 3, Intellectual: 3 }, workDisables: [] },
  { id: 'VideoGamer16', slot: 'child', title: 'Video gamer', titleShort: 'Gamer', skills: { Shooting: 2, Melee: 1, Intellectual: 3 }, workDisables: ['Artistic'] },
  { id: 'VidtubeStar98', slot: 'child', title: 'Vidtube star', titleShort: 'Vidtuber', skills: { Cooking: 2, Social: 2, Artistic: 2, Crafting: 1 }, workDisables: [] },
  { id: 'VoyagerChild94', slot: 'child', title: 'Voyager child', titleShort: 'Voyager', skills: { Intellectual: 4 }, workDisables: ['Social'] },
  { id: 'VRAddict29', slot: 'child', title: 'VR addict', titleShort: 'VR addict', skills: { Shooting: 1, Melee: 1, Artistic: 1, Crafting: 1, Intellectual: 2 }, workDisables: ['Social'] },
  { id: 'WarBastard60', slot: 'child', title: 'War bastard', titleShort: 'Bastard', skills: {}, workDisables: ['Violent'] },
  { id: 'WarChild24', slot: 'child', title: 'War child', titleShort: 'War child', skills: { Shooting: 5, Melee: 3 }, workDisables: ['Caring', 'Artistic'] },
  { id: 'WarRefugee96', slot: 'child', title: 'War refugee', titleShort: 'Refugee', skills: { Cooking: -3, Shooting: 6, Melee: 5, Intellectual: 5 }, workDisables: ['Social', 'Artistic', 'PlantWork'] },
  { id: 'WarRefugee51', slot: 'child', title: 'War refugee', titleShort: 'Refugee', skills: {}, workDisables: ['Violent'] },
  { id: 'FeyCustomChildhood', slot: 'child', title: 'Wargame fanatic', titleShort: 'Wargame fanatic', skills: { Social: 1, Crafting: 2 }, workDisables: [] },
  { id: 'WastelandWanderer81', slot: 'child', title: 'Wasteland wanderer', titleShort: 'Wanderer', skills: { Shooting: 3, Social: 3, Medicine: 5, Crafting: 4 }, workDisables: ['Artistic'] },
  { id: 'WealthyStudent59', slot: 'child', title: 'Wealthy student', titleShort: 'Student', skills: { Construction: 2, Cooking: -2, Plants: -2, Mining: -2, Crafting: 3, Intellectual: 4 }, workDisables: ['Animals', 'Cleaning'] },
  { id: 'WildChild5', slot: 'child', title: 'Wild child', titleShort: 'Wild child', skills: { Cooking: -3, Shooting: 4, Melee: 6, Social: -2 }, workDisables: ['Caring', 'Intellectual', 'Artistic', 'Cleaning'] },
  { id: 'Winerunner8', slot: 'child', title: 'Winerunner', titleShort: 'Winerunner', skills: { Cooking: 2, Melee: 2, Social: 2, Crafting: 2 }, workDisables: [] },
  { id: 'WolfPackMember26', slot: 'child', title: 'Wolf pack member', titleShort: 'Feral', skills: { Melee: 8, Social: -3 }, workDisables: ['Firefighting'] },
  { id: 'WorkCampSlave37', slot: 'child', title: 'Work camp slave', titleShort: 'Slave', skills: { Construction: 2, Plants: 2, Mining: 2, Social: -2 }, workDisables: ['Intellectual'] },
  { id: 'WorldSlider42', slot: 'child', title: 'World slider', titleShort: 'Slider', skills: { Construction: -2, Plants: -2, Melee: 3, Medicine: 4 }, workDisables: [] },
  { id: 'WreckageExplorer93', slot: 'child', title: 'Wreckage explorer', titleShort: 'Explorer', skills: {}, workDisables: [] },
  { id: 'YoungMaster23', slot: 'child', title: 'Young master', titleShort: 'Master', skills: { Shooting: 1, Melee: 2, Social: 2, Intellectual: 2 }, workDisables: ['ManualDumb'] },
  { id: 'YoungPirate71', slot: 'child', title: 'Young pirate', titleShort: 'Pirate', skills: { Shooting: 2, Social: 2, Crafting: 2 }, workDisables: [] },
  { id: 'YoungPsychologist58', slot: 'child', title: 'Young psychologist', titleShort: 'Psych', skills: { Social: 4, Medicine: 2 }, workDisables: ['Artistic'] },
  { id: 'YouthDelinquent30', slot: 'child', title: 'Youth delinquent', titleShort: 'Delinquent', skills: { Shooting: 3, Melee: 1, Social: -1, Crafting: 4 }, workDisables: ['Caring', 'Artistic', 'Cleaning'] },
  { id: 'YouthSoldier99', slot: 'child', title: 'Youth soldier', titleShort: 'Soldier', skills: { Construction: 2, Shooting: 2, Melee: 2 }, workDisables: ['Artistic'] },
  { id: 'AceFighterPilot54', slot: 'adult', title: 'Ace fighter pilot', titleShort: 'Ace', skills: { Mining: -3, Shooting: 3, Melee: 2, Social: 3, Medicine: 3, Intellectual: 2 }, workDisables: [] },
  { id: 'AcolyteOfStars6', slot: 'adult', title: 'Acolyte of stars', titleShort: 'Priest', skills: { Social: -3, Medicine: 4, Artistic: 7, Intellectual: -3 }, workDisables: ['ManualDumb', 'Violent'] },
  { id: 'Actor72', slot: 'adult', title: 'Actor', titleShort: 'Actor', skills: {}, workDisables: ['ManualDumb'] },
  { id: 'Adventurer19', slot: 'adult', title: 'Adventurer', titleShort: 'Adventurer', skills: { Shooting: 3, Melee: 3, Social: 3, Medicine: 3, Crafting: 3, Animals: 2 }, workDisables: ['Cooking'] },
  { id: 'AdventurousWeirdo55', slot: 'adult', title: 'Adventurous weirdo', titleShort: 'Weirdo', skills: { Cooking: 2, Shooting: -2, Melee: 6, Artistic: 2, Crafting: 2 }, workDisables: ['Mining'] },
  { id: 'AerospaceEngineer44', slot: 'adult', title: 'Aerospace engineer', titleShort: 'Engineer', skills: { Construction: 2, Mining: 2, Shooting: 2, Social: 2, Intellectual: 4 }, workDisables: ['Cleaning', 'PlantWork'] },
  { id: 'AIProgrammer22', slot: 'adult', title: 'AI programmer', titleShort: 'Programmer', skills: { Crafting: 6, Intellectual: 7 }, workDisables: ['PlantWork'] },
  { id: 'AIResearcher94', slot: 'adult', title: 'AI researcher', titleShort: 'Researcher', skills: { Mining: -2, Melee: -2, Social: 4, Crafting: 1, Intellectual: 6 }, workDisables: ['ManualDumb'] },
  { id: 'AlcoholicTrucker93', slot: 'adult', title: 'Alcoholic trucker', titleShort: 'Alcoholic', skills: { Mining: 4, Shooting: 2, Melee: 2 }, workDisables: ['Caring', 'Social', 'Intellectual', 'Artistic', 'Cleaning'] },
  { id: 'AnarchistRebel77', slot: 'adult', title: 'Anarchist rebel', titleShort: 'Anarchist', skills: { Shooting: 6, Melee: 2, Social: 6 }, workDisables: ['Crafting', 'Cleaning'] },
  { id: 'AnimalFarmer21', slot: 'adult', title: 'Animal farmer', titleShort: 'Animal farmer', skills: {}, workDisables: [] },
  { id: 'Archaeologist85', slot: 'adult', title: 'Archaeologist', titleShort: 'Explorer', skills: { Construction: 4, Shooting: 2, Social: -2, Crafting: 2, Intellectual: 5 }, workDisables: [] },
  { id: 'Archer25', slot: 'adult', title: 'Archer', titleShort: 'Archer', skills: {}, workDisables: [] },
  { id: 'Architect28', slot: 'adult', title: 'Architect', titleShort: 'Architect', skills: {}, workDisables: ['ManualDumb'] },
  { id: 'ArchotechSpy75', slot: 'adult', title: 'Archotech researcher', titleShort: 'Researcher', skills: { Construction: 2, Cooking: -2, Crafting: 2, Intellectual: 5 }, workDisables: ['Mining'] },
  { id: 'ArmyCook0', slot: 'adult', title: 'Army cook', titleShort: 'Cook', skills: { Construction: 2, Cooking: 3, Shooting: 2, Melee: 2, Crafting: 1, Intellectual: -2 }, workDisables: ['Caring', 'Social', 'Firefighting'] },
  { id: 'ArmyScientist35', slot: 'adult', title: 'Army scientist', titleShort: 'Scientist', skills: { Medicine: 2, Intellectual: 8 }, workDisables: [] },
  { id: 'ArmySergeant16', slot: 'adult', title: 'Army sergeant', titleShort: 'Sergeant', skills: { Construction: 2, Shooting: 8, Melee: 2 }, workDisables: [] },
  { id: 'Aromatherapist80', slot: 'adult', title: 'Aromatherapist', titleShort: 'Therapist', skills: { Cooking: 4, Plants: 6, Shooting: -3, Melee: -3, Medicine: 4 }, workDisables: [] },
  { id: 'ArtStudent79', slot: 'adult', title: 'Art student', titleShort: 'Artist', skills: { Construction: -2, Cooking: -1, Plants: -1, Medicine: 1, Artistic: 8, Crafting: 2 }, workDisables: ['Mining'] },
  { id: 'ArtifactHunter48', slot: 'adult', title: 'Artifact hunter', titleShort: 'Artifacter', skills: { Construction: 4, Shooting: 8 }, workDisables: ['Social'] },
  { id: 'ArtificerRampant95', slot: 'adult', title: 'Artificer rampant', titleShort: 'Artificer', skills: { Construction: 2, Medicine: 2, Crafting: 8, Intellectual: 6 }, workDisables: [] },
  { id: 'Artilleryman28', slot: 'adult', title: 'Artilleryman', titleShort: 'Artilleer', skills: {}, workDisables: [] },
  { id: 'ArtsPatron54', slot: 'adult', title: 'Arts patron', titleShort: 'Patron', skills: {}, workDisables: [] },
  { id: 'AsceticPriest84', slot: 'adult', title: 'Ascetic priest', titleShort: 'Priest', skills: {}, workDisables: ['Violent', 'Social'] },
  { id: 'Assassin7', slot: 'adult', title: 'Assassin', titleShort: 'Assassin', skills: { Shooting: 7, Melee: 4 }, workDisables: ['Caring', 'Artistic', 'Crafting', 'Cooking', 'Cleaning', 'PlantWork'] },
  { id: 'Assassin20', slot: 'adult', title: 'Assassin', titleShort: 'Assassin', skills: {}, workDisables: ['Intellectual', 'ManualDumb', 'ManualSkilled', 'Social', 'Caring'] },
  { id: 'Assembler69', slot: 'adult', title: 'Assembler', titleShort: 'Assembler', skills: {}, workDisables: [] },
  { id: 'AWOLSoldier49', slot: 'adult', title: 'AWOL soldier', titleShort: 'Soldier', skills: { Shooting: 6, Melee: 5 }, workDisables: [] },
  { id: 'BalletDancer81', slot: 'adult', title: 'Ballet dancer', titleShort: 'Dancer', skills: {}, workDisables: [] },
  { id: 'BanditLeader74', slot: 'adult', title: 'Bandit leader', titleShort: 'Bandit', skills: { Shooting: 5, Melee: 5, Social: 2 }, workDisables: ['Intellectual', 'Cleaning'] },
  { id: 'Banished68', slot: 'adult', title: 'Banished', titleShort: 'Banished', skills: {}, workDisables: ['Social'] },
  { id: 'BanishedSoldier85', slot: 'adult', title: 'Banished soldier', titleShort: 'Outlaw', skills: { Melee: 7 }, workDisables: [] },
  { id: 'Bartender62', slot: 'adult', title: 'Bartender', titleShort: 'Barkeep', skills: {}, workDisables: [] },
  { id: 'BattleMechanic27', slot: 'adult', title: 'Battle mechanic', titleShort: 'Mechanic', skills: { Shooting: 5, Melee: 3, Crafting: 4 }, workDisables: [] },
  { id: 'BattlefieldTech52', slot: 'adult', title: 'Battlefield tech', titleShort: 'Technician', skills: { Construction: 4, Cooking: -3, Shooting: 3, Crafting: 4, Intellectual: 4 }, workDisables: ['Firefighting', 'PlantWork'] },
  { id: 'BeastSlayer67', slot: 'adult', title: 'Beast slayer', titleShort: 'Slayer', skills: { Cooking: 3, Plants: 2, Shooting: 4, Melee: 4 }, workDisables: ['Caring'] },
  { id: 'Beastmaster67', slot: 'adult', title: 'Beastmaster', titleShort: 'Beastmaster', skills: {}, workDisables: [] },
  { id: 'BehaviourResearch74', slot: 'adult', title: 'Behaviour research', titleShort: 'Scientist', skills: { Cooking: -2, Plants: -3, Melee: 1, Social: 2, Medicine: 6, Intellectual: 8 }, workDisables: ['Artistic'] },
  { id: 'BiosphereManager95', slot: 'adult', title: 'Biosphere manager', titleShort: 'Botanist', skills: {}, workDisables: ['ManualDumb', 'Crafting', 'Cooking'] },
  { id: 'Blacksmith72', slot: 'adult', title: 'Blacksmith', titleShort: 'Blacksmith', skills: {}, workDisables: ['Intellectual'] },
  { id: 'Blacksmith7', slot: 'adult', title: 'Blacksmith', titleShort: 'Blacksmith', skills: { Mining: 2, Melee: 2, Crafting: 8 }, workDisables: [] },
  { id: 'BlacksmithShooter21', slot: 'adult', title: 'Blacksmith shooter', titleShort: 'Gunsmith', skills: { Construction: 3, Shooting: 5, Crafting: 3 }, workDisables: ['Intellectual'] },
  { id: 'BloodgameSurvivor6', slot: 'adult', title: 'Bloodgame survivor', titleShort: 'Bloodgamer', skills: { Construction: 2, Melee: 7, Social: 6 }, workDisables: ['Crafting'] },
  { id: 'BloodyDentist9', slot: 'adult', title: 'Bloody dentist', titleShort: 'Dentist', skills: { Medicine: 6, Artistic: 2, Intellectual: 4 }, workDisables: [] },
  { id: 'BloodyWanderer28', slot: 'adult', title: 'Bloody wanderer', titleShort: 'Wanderer', skills: { Construction: 2, Shooting: 3, Melee: 4, Crafting: 2, Intellectual: -2 }, workDisables: ['Social', 'Firefighting'] },
  { id: 'Bodyguard58', slot: 'adult', title: 'Bodyguard', titleShort: 'Bodyguard', skills: {}, workDisables: ['Social'] },
  { id: 'BountyHunter17', slot: 'adult', title: 'Bounty hunter', titleShort: 'Hunter', skills: { Shooting: 6, Melee: 4, Medicine: 2 }, workDisables: ['Cleaning'] },
  { id: 'BountyHunter93', slot: 'adult', title: 'Bounty hunter', titleShort: 'Hunter', skills: { Shooting: 5, Melee: 3, Social: 2, Crafting: 2 }, workDisables: [] },
  { id: 'BountyHunter41', slot: 'adult', title: 'Bounty hunter', titleShort: 'Hunter', skills: { Shooting: 8, Melee: 5 }, workDisables: [] },
  { id: 'Brave88', slot: 'adult', title: 'Brave', titleShort: 'Brave', skills: {}, workDisables: [] },
  { id: 'Brigand68', slot: 'adult', title: 'Brigand', titleShort: 'Brigand', skills: { Construction: 2, Cooking: 2, Shooting: 2, Melee: 3, Medicine: 1, Crafting: 1 }, workDisables: [] },
  { id: 'BrokenSoldier29', slot: 'adult', title: 'Broken soldier', titleShort: 'Soldier', skills: {}, workDisables: ['Violent'] },
  { id: 'Builder96', slot: 'adult', title: 'Builder', titleShort: 'Builder', skills: {}, workDisables: [] },
  { id: 'BushSniper94', slot: 'adult', title: 'Bush sniper', titleShort: 'Sniper', skills: { Cooking: 2, Plants: -3, Shooting: 6, Artistic: -2, Animals: 4 }, workDisables: ['Caring'] },
  { id: 'BusinessGangster58', slot: 'adult', title: 'Business gangster', titleShort: 'Gangster', skills: { Shooting: 3, Melee: 5, Social: 7, Artistic: 2 }, workDisables: ['Caring', 'Cleaning', 'PlantWork'] },
  { id: 'MateCustomAdulthood', slot: 'adult', title: 'Busker', titleShort: 'Busker', skills: { Cooking: 2 }, workDisables: [] },
  { id: 'Butcher40', slot: 'adult', title: 'Butcher', titleShort: 'Butcher', skills: {}, workDisables: [] },
  { id: 'Caravaneer53', slot: 'adult', title: 'Caravaneer', titleShort: 'Caravaneer', skills: { Shooting: 4, Social: 7 }, workDisables: [] },
  { id: 'CargoPilot58', slot: 'adult', title: 'Cargo pilot', titleShort: 'Pilot', skills: { Construction: 2, Mining: 1, Shooting: 4, Melee: 2, Social: 1 }, workDisables: ['Cooking', 'Cleaning'] },
  { id: 'Carver1', slot: 'adult', title: 'Carver', titleShort: 'Carver', skills: {}, workDisables: [] },
  { id: 'CasketBuilder52', slot: 'adult', title: 'Casket builder', titleShort: 'Builder', skills: { Construction: 4, Medicine: 3, Intellectual: 4 }, workDisables: [] },
  { id: 'Castaway81', slot: 'adult', title: 'Castaway', titleShort: 'Castaway', skills: { Construction: 2, Cooking: 2, Plants: 3, Mining: 2 }, workDisables: [] },
  { id: 'Castaway57', slot: 'adult', title: 'Castaway', titleShort: 'Castaway', skills: {}, workDisables: ['Intellectual', 'Social', 'Artistic'] },
  { id: 'CaveBuilder81', slot: 'adult', title: 'Cave builder', titleShort: 'Cave builder', skills: {}, workDisables: [] },
  { id: 'CaveExplorer45', slot: 'adult', title: 'Cave explorer', titleShort: 'Cave explorer', skills: {}, workDisables: [] },
  { id: 'CaveworldIlluminator95', slot: 'adult', title: 'Caveworld illuminator', titleShort: 'Illuminator', skills: {}, workDisables: [] },
  { id: 'CharityWorker36', slot: 'adult', title: 'Charity worker', titleShort: 'Altruist', skills: {}, workDisables: ['Violent'] },
  { id: 'Chef52', slot: 'adult', title: 'Chef', titleShort: 'Chef', skills: {}, workDisables: ['Cleaning', 'ManualDumb'] },
  { id: 'Chemist78', slot: 'adult', title: 'Chemist', titleShort: 'Chemist', skills: { Social: -3, Crafting: 6, Intellectual: 6 }, workDisables: ['Caring'] },
  { id: 'Chemist73', slot: 'adult', title: 'Chemist', titleShort: 'Chemist', skills: { Social: 2, Medicine: 4, Intellectual: 6 }, workDisables: [] },
  { id: 'ChiefEngineer62', slot: 'adult', title: 'Chief engineer', titleShort: 'Engineer', skills: { Construction: 3, Mining: 2, Social: -2, Crafting: 3, Intellectual: 3 }, workDisables: ['Animals'] },
  { id: 'ChurchPsychic98', slot: 'adult', title: 'Church psychic', titleShort: 'Psychic', skills: {}, workDisables: [] },
  { id: 'CivilEngineer2', slot: 'adult', title: 'Civil engineer', titleShort: 'Engineer', skills: { Construction: 7, Mining: 2, Social: -3, Intellectual: 3 }, workDisables: [] },
  { id: 'CivilServant2', slot: 'adult', title: 'Civil servant', titleShort: 'Bureaucrat', skills: {}, workDisables: [] },
  { id: 'CivilServant25', slot: 'adult', title: 'Civil servant', titleShort: 'Bureaucrat', skills: { Social: 6, Intellectual: 3 }, workDisables: [] },
  { id: 'ClanChief14', slot: 'adult', title: 'Clan chief', titleShort: 'Chief', skills: { Shooting: 6, Social: 7 }, workDisables: ['Caring'] },
  { id: 'CloneFarmer58', slot: 'adult', title: 'Clone farmer', titleShort: 'Cloner', skills: { Social: 6, Medicine: 4, Crafting: 2 }, workDisables: ['Cooking', 'Firefighting', 'Mining'] },
  { id: 'ColiseumFighter22', slot: 'adult', title: 'Coliseum fighter', titleShort: 'Fighter', skills: { Shooting: 5, Social: -1, Crafting: 3, Intellectual: 2 }, workDisables: ['Caring', 'Artistic', 'PlantWork', 'Mining'] },
  { id: 'ColonialGovernor78', slot: 'adult', title: 'Colonial governor', titleShort: 'Governor', skills: { Construction: 3, Shooting: 1, Social: 6 }, workDisables: [] },
  { id: 'Colonist97', slot: 'adult', title: 'Colonist', titleShort: 'Colonist', skills: {}, workDisables: [] },
  { id: 'ColonyEngineer7', slot: 'adult', title: 'Colony engineer', titleShort: 'Engineer', skills: { Construction: 7, Medicine: -3, Crafting: 4, Intellectual: 4 }, workDisables: ['Artistic'] },
  { id: 'ColonySettler53', slot: 'adult', title: 'Colony settler', titleShort: 'Settler', skills: {}, workDisables: [] },
  { id: 'CombatEngineer30', slot: 'adult', title: 'Combat engineer', titleShort: 'Engineer', skills: { Construction: 6, Cooking: -2, Shooting: 4, Social: -3, Medicine: 2, Crafting: 2, Intellectual: 3 }, workDisables: ['Artistic', 'Firefighting', 'PlantWork'] },
  { id: 'CombatEngineer4', slot: 'adult', title: 'Combat engineer', titleShort: 'Engineer', skills: { Construction: 2, Shooting: 5, Crafting: 3 }, workDisables: [] },
  { id: 'CombatMedic82', slot: 'adult', title: 'Combat medic', titleShort: 'Medic', skills: { Shooting: 2, Melee: 1, Medicine: 6, Artistic: -2 }, workDisables: ['Social'] },
  { id: 'CombatMedtech59', slot: 'adult', title: 'Combat medtech', titleShort: 'Medic', skills: { Construction: 3, Medicine: 5, Crafting: 5, Intellectual: 1 }, workDisables: ['PlantWork'] },
  { id: 'CombatNegotiator31', slot: 'adult', title: 'Combat negotiator', titleShort: 'Negotiator', skills: { Shooting: 4, Melee: 3, Social: 3 }, workDisables: [] },
  { id: 'CommonerLord45', slot: 'adult', title: 'Commoner lord', titleShort: 'Lord', skills: { Melee: 7, Social: 6 }, workDisables: ['Cooking', 'Cleaning'] },
  { id: 'ComputerEngineer36', slot: 'adult', title: 'Computer engineer', titleShort: 'Engineer', skills: { Social: -2, Artistic: 2, Crafting: 5, Intellectual: 6 }, workDisables: ['Caring'] },
  { id: 'ComputerEngineer10', slot: 'adult', title: 'Computer engineer', titleShort: 'Tech head', skills: { Social: 4, Crafting: 2, Intellectual: 8 }, workDisables: ['ManualDumb', 'Violent'] },
  { id: 'ConArtist80', slot: 'adult', title: 'Con artist', titleShort: 'Con artist', skills: {}, workDisables: ['Violent'] },
  { id: 'ConceptualArtist39', slot: 'adult', title: 'Conceptual artist', titleShort: 'Artist', skills: {}, workDisables: ['Social', 'Caring', 'Hauling'] },
  { id: 'ConstructionEngineer32', slot: 'adult', title: 'Construction engineer', titleShort: 'Builder', skills: {}, workDisables: ['Intellectual', 'Cooking'] },
  { id: 'ContractMiner86', slot: 'adult', title: 'Contract miner', titleShort: 'Contract miner', skills: {}, workDisables: [] },
  { id: 'CoreworldJeweler19', slot: 'adult', title: 'Coreworld jeweler', titleShort: 'Jeweler', skills: { Construction: 3, Shooting: -3, Artistic: 5, Crafting: 7 }, workDisables: [] },
  { id: 'CorpResearcher93', slot: 'adult', title: 'Corp researcher', titleShort: 'Researcher', skills: { Cooking: -2, Social: 3, Medicine: 6, Crafting: 3, Intellectual: 8 }, workDisables: [] },
  { id: 'CorpResearcher71', slot: 'adult', title: 'Corp researcher', titleShort: 'Researcher', skills: { Shooting: -3, Melee: -3, Medicine: 4, Crafting: 4, Intellectual: 8 }, workDisables: ['Social'] },
  { id: 'CorporateBuilder58', slot: 'adult', title: 'Corporate builder', titleShort: 'Builder', skills: { Construction: 7, Mining: 4 }, workDisables: ['Artistic'] },
  { id: 'CorporateDrone10', slot: 'adult', title: 'Corporate drone', titleShort: 'Drone', skills: {}, workDisables: [] },
  { id: 'CorporateFixer36', slot: 'adult', title: 'Corporate fixer', titleShort: 'Fixer', skills: {}, workDisables: [] },
  { id: 'CorporateManager76', slot: 'adult', title: 'Corporate manager', titleShort: 'Manager', skills: {}, workDisables: [] },
  { id: 'CosmeticSurgeon36', slot: 'adult', title: 'Cosmetic surgeon', titleShort: 'Surgeon', skills: { Medicine: 8, Artistic: 6, Intellectual: 3 }, workDisables: ['Cooking'] },
  { id: 'CostumeCrafter41', slot: 'adult', title: 'Costume crafter', titleShort: 'Costumer', skills: { Crafting: 8, Intellectual: 4 }, workDisables: ['Cooking'] },
  { id: 'AddictionCounsel60', slot: 'adult', title: 'Counselor', titleShort: 'Counselor', skills: { Social: 8, Medicine: 3, Artistic: 3, Crafting: 3 }, workDisables: [] },
  { id: 'Counselor26', slot: 'adult', title: 'Counselor', titleShort: 'Counselor', skills: {}, workDisables: ['Cooking'] },
  { id: 'CraftShaper37', slot: 'adult', title: 'Craft shaper', titleShort: 'Shaper', skills: { Construction: 4, Social: -3, Artistic: 5, Crafting: 8 }, workDisables: ['Cooking', 'Cleaning'] },
  { id: 'CrimeLord10', slot: 'adult', title: 'Crime lord', titleShort: 'Crime lord', skills: { Shooting: 6, Melee: 2, Social: 3, Intellectual: 2 }, workDisables: ['Caring', 'Artistic', 'Cleaning'] },
  { id: 'CriminalKingpin36', slot: 'adult', title: 'Criminal kingpin', titleShort: 'Kingpin', skills: { Shooting: 2, Melee: 2, Social: 5 }, workDisables: ['ManualDumb'] },
  { id: 'CriminalSurgeon99', slot: 'adult', title: 'Criminal surgeon', titleShort: 'Surgeon', skills: { Melee: 6, Social: -2, Medicine: 5, Artistic: 1, Intellectual: -3 }, workDisables: [] },
  { id: 'CropFarmer17', slot: 'adult', title: 'Crop farmer', titleShort: 'Farmer', skills: {}, workDisables: [] },
  { id: 'DeepSpaceMiner3', slot: 'adult', title: 'Deep space miner', titleShort: 'Miner', skills: {}, workDisables: [] },
  { id: 'DeepSpaceSurveyor1', slot: 'adult', title: 'Deep space surveyor', titleShort: 'Surveyor', skills: { Construction: 4, Plants: -3, Shooting: 4, Social: 2, Intellectual: 6 }, workDisables: [] },
  { id: 'Defector78', slot: 'adult', title: 'Defector', titleShort: 'Defector', skills: {}, workDisables: ['Artistic'] },
  { id: 'Defector95', slot: 'adult', title: 'Defector', titleShort: 'Defector', skills: { Construction: 3, Shooting: 4, Melee: 2, Social: -2, Medicine: 4, Crafting: 3 }, workDisables: ['Animals', 'Artistic'] },
  { id: 'DefenseLawyer71', slot: 'adult', title: 'Defense lawyer', titleShort: 'Lawyer', skills: { Shooting: 3, Social: 8, Intellectual: 5 }, workDisables: ['ManualDumb', 'ManualSkilled', 'Caring'] },
  { id: 'Demolitionist39', slot: 'adult', title: 'Demolitionist', titleShort: 'Demolitionist', skills: {}, workDisables: [] },
  { id: 'Deserter65', slot: 'adult', title: 'Deserter', titleShort: 'Deserter', skills: {}, workDisables: [] },
  { id: 'DestroyerGeneral26', slot: 'adult', title: 'Destroyer-general', titleShort: 'General', skills: { Shooting: 6, Melee: 3, Social: 6, Artistic: -3 }, workDisables: ['ManualDumb'] },
  { id: 'NathanCustomAdulthood', slot: 'adult', title: 'Digger', titleShort: 'Digger', skills: { Construction: 2, Mining: 6 }, workDisables: [] },
  { id: 'Digger31', slot: 'adult', title: 'Digger', titleShort: 'Digger', skills: {}, workDisables: [] },
  { id: 'Digger66', slot: 'adult', title: 'Digger', titleShort: 'Digger', skills: {}, workDisables: [] },
  { id: 'DischargedSoldier53', slot: 'adult', title: 'Discharged soldier', titleShort: 'Soldier', skills: { Cooking: 2, Shooting: 6, Melee: 4 }, workDisables: [] },
  { id: 'DisgracedOfficer19', slot: 'adult', title: 'Disgraced officer', titleShort: 'Officer', skills: {}, workDisables: [] },
  { id: 'DoomsdayPariah18', slot: 'adult', title: 'Doomsday pariah', titleShort: 'Pariah', skills: { Construction: 2, Shooting: 2, Melee: 2, Crafting: 2, Intellectual: 3 }, workDisables: ['Caring', 'Artistic'] },
  { id: 'DreadedDude58', slot: 'adult', title: 'Dreaded dude', titleShort: 'Dude', skills: { Mining: -3, Medicine: 2, Artistic: 8, Crafting: 4, Intellectual: 6 }, workDisables: ['Cleaning'] },
  { id: 'Drifter67', slot: 'adult', title: 'Drifter', titleShort: 'Drifter', skills: {}, workDisables: [] },
  { id: 'DromedaryKnight37', slot: 'adult', title: 'Dromedary knight', titleShort: 'Knight', skills: { Shooting: -3, Melee: 4, Social: 4, Animals: 4 }, workDisables: ['Hauling'] },
  { id: 'DrugLieutenant98', slot: 'adult', title: 'Drug lieutenant', titleShort: 'Drugman', skills: { Plants: 4, Social: 7, Medicine: 7 }, workDisables: ['Artistic', 'Cooking', 'Cleaning'] },
  { id: 'EnergyResearcher89', slot: 'adult', title: 'Energy researcher', titleShort: 'Researcher', skills: { Social: -2, Artistic: -1, Crafting: 2, Intellectual: 8 }, workDisables: [] },
  { id: 'Engineer40', slot: 'adult', title: 'Engineer', titleShort: 'Engineer', skills: { Construction: 2, Cooking: -2, Social: 2, Crafting: 8, Intellectual: 1 }, workDisables: [] },
  { id: 'EngineeredPilot75', slot: 'adult', title: 'Engineered pilot', titleShort: 'Pilot', skills: { Shooting: 5, Melee: 2, Social: -2, Medicine: 2 }, workDisables: [] },
  { id: 'EnvoyOfTheStars19', slot: 'adult', title: 'Envoy of the stars', titleShort: 'Envoy', skills: { Shooting: 1, Social: 8, Medicine: 2, Artistic: 2 }, workDisables: ['ManualDumb', 'ManualSkilled'] },
  { id: 'EscapedConvict90', slot: 'adult', title: 'Escaped convict', titleShort: 'Escapee', skills: {}, workDisables: ['Caring'] },
  { id: 'Evangelist39', slot: 'adult', title: 'Evangelist', titleShort: 'Evangelist', skills: {}, workDisables: [] },
  { id: 'Excavator55', slot: 'adult', title: 'Excavator', titleShort: 'Excavator', skills: {}, workDisables: [] },
  { id: 'ExecutiveOfficer5', slot: 'adult', title: 'Executive officer', titleShort: 'Executive', skills: { Construction: 3, Melee: 2, Social: 7, Intellectual: 4 }, workDisables: ['Caring'] },
  { id: 'ExiledResearcher44', slot: 'adult', title: 'Exiled researcher', titleShort: 'Exile', skills: { Shooting: 2, Medicine: 4, Artistic: 2, Crafting: 3, Intellectual: 8 }, workDisables: [] },
  { id: 'ExoticChef96', slot: 'adult', title: 'Exotic chef', titleShort: 'Chef', skills: { Cooking: 6, Artistic: 2, Crafting: 1 }, workDisables: [] },
  { id: 'ExpertHandyman8', slot: 'adult', title: 'Expert handyman', titleShort: 'Handyman', skills: { Construction: 7, Crafting: 3, Intellectual: 4 }, workDisables: [] },
  { id: 'Explorer49', slot: 'adult', title: 'Explorer', titleShort: 'Explorer', skills: { Mining: 3, Shooting: 2, Melee: 2, Crafting: 2, Intellectual: 3 }, workDisables: [] },
  { id: 'ExplorerWriter10', slot: 'adult', title: 'Explorer-writer', titleShort: 'Explorer', skills: { Construction: 3, Cooking: 2, Plants: 3, Medicine: 3, Crafting: 2, Intellectual: 4 }, workDisables: [] },
  { id: 'ExplosivesExpert26', slot: 'adult', title: 'Explosives expert', titleShort: 'Blaster', skills: {}, workDisables: ['ManualDumb'] },
  { id: 'FactionLeader74', slot: 'adult', title: 'Faction leader', titleShort: 'Leader', skills: { Melee: 2, Social: 8, Medicine: 2, Intellectual: 3 }, workDisables: ['Cleaning'] },
  { id: 'FactoryWorker58', slot: 'adult', title: 'Factory worker', titleShort: 'Worker', skills: {}, workDisables: ['Intellectual', 'Artistic', 'Cooking'] },
  { id: 'FallenOfficial12', slot: 'adult', title: 'Fallen official', titleShort: 'Official', skills: { Melee: 2, Social: 5, Medicine: 2 }, workDisables: ['ManualSkilled'] },
  { id: 'FearfulChef49', slot: 'adult', title: 'Fearful chef', titleShort: 'Chef', skills: { Plants: 2, Medicine: 2, Intellectual: 2 }, workDisables: ['Cooking', 'Firefighting'] },
  { id: 'FelineScientist76', slot: 'adult', title: 'Feline scientist', titleShort: 'Scientist', skills: { Social: 2, Medicine: 3, Intellectual: 4 }, workDisables: [] },
  { id: 'FerventResearcher72', slot: 'adult', title: 'Fervent researcher', titleShort: 'Researcher', skills: { Shooting: 2, Medicine: 8, Intellectual: 6 }, workDisables: ['ManualDumb', 'ManualSkilled'] },
  { id: 'FighterController67', slot: 'adult', title: 'Fighter controller', titleShort: 'Controller', skills: { Cooking: 1, Shooting: 5, Melee: 5, Social: 2, Medicine: 3 }, workDisables: ['Intellectual'] },
  { id: 'Firebomber51', slot: 'adult', title: 'Firebomber', titleShort: 'Firebomber', skills: {}, workDisables: [] },
  { id: 'Flaneur30', slot: 'adult', title: 'Flaneur', titleShort: 'Flaneur', skills: { Cooking: 3, Social: 6, Artistic: 3, Intellectual: 3 }, workDisables: [] },
  { id: 'ForestProwler15', slot: 'adult', title: 'Forest prowler', titleShort: 'Prowler', skills: { Melee: 3, Social: 4, Crafting: 2 }, workDisables: ['Mining'] },
  { id: 'Forester96', slot: 'adult', title: 'Forester', titleShort: 'Forester', skills: {}, workDisables: [] },
  { id: 'Framer37', slot: 'adult', title: 'Framer', titleShort: 'Framer', skills: {}, workDisables: [] },
  { id: 'FrontierMarshal27', slot: 'adult', title: 'Frontier marshal', titleShort: 'Marshal', skills: { Shooting: 5, Social: 4, Medicine: 3 }, workDisables: [] },
  { id: 'Fugitive4', slot: 'adult', title: 'Fugitive', titleShort: 'Fugitive', skills: { Cooking: 4, Plants: 3, Social: -2, Medicine: 4 }, workDisables: [] },
  { id: 'FurnitureBuilder83', slot: 'adult', title: 'Furniture builder', titleShort: 'Builder', skills: {}, workDisables: [] },
  { id: 'GameDeveloper95', slot: 'adult', title: 'Game developer', titleShort: 'Game dev', skills: { Construction: -2, Mining: -2 }, workDisables: [] },
  { id: 'JoeCustomAdulthood', slot: 'adult', title: 'Game developer', titleShort: 'Game dev', skills: { Artistic: -2 }, workDisables: [] },
  { id: 'TynanCustomAdulthood', slot: 'adult', title: 'Game developer', titleShort: 'Game dev', skills: { Construction: -2, Mining: -2 }, workDisables: [] },
  { id: 'FeyCustomAdulthood', slot: 'adult', title: 'Game master', titleShort: 'Game master', skills: { Mining: -2, Social: 1, Artistic: 2, Intellectual: 1 }, workDisables: [] },
  { id: 'GameTester77', slot: 'adult', title: 'Game tester', titleShort: 'Tester', skills: { Shooting: 4, Melee: 4, Social: -2, Medicine: 4, Intellectual: 5 }, workDisables: [] },
  { id: 'GangBoss49', slot: 'adult', title: 'Gang boss', titleShort: 'Boss', skills: { Construction: 4, Shooting: 8, Melee: 6, Social: -3, Medicine: 3 }, workDisables: ['Animals'] },
  { id: 'GangSoldier39', slot: 'adult', title: 'Gang soldier', titleShort: 'Soldier', skills: { Construction: 2, Cooking: 2, Shooting: 6, Melee: 3, Medicine: 2 }, workDisables: ['Artistic', 'Hauling'] },
  { id: 'Gardener99', slot: 'adult', title: 'Gardener', titleShort: 'Gardener', skills: {}, workDisables: ['Intellectual', 'Crafting'] },
  { id: 'Gatherer70', slot: 'adult', title: 'Gatherer', titleShort: 'Gatherer', skills: {}, workDisables: [] },
  { id: 'GeneticEngineer89', slot: 'adult', title: 'Genetic engineer', titleShort: 'Geneticist', skills: { Plants: 1, Medicine: 2, Intellectual: 6 }, workDisables: ['Violent'] },
  { id: 'GeneticScientist66', slot: 'adult', title: 'Genetic scientist', titleShort: 'Geneticist', skills: { Shooting: 2, Medicine: 3, Intellectual: 4 }, workDisables: ['Social', 'Artistic', 'Crafting', 'Cooking'] },
  { id: 'Geologist66', slot: 'adult', title: 'Geologist', titleShort: 'Geologist', skills: {}, workDisables: [] },
  { id: 'Gigolo30', slot: 'adult', title: 'Gigolo', titleShort: 'Courtesan', skills: {}, workDisables: ['ManualDumb', 'ManualSkilled'] },
  { id: 'Gigolo68', slot: 'adult', title: 'Gigolo', titleShort: 'Gigolo', skills: { Cooking: 7, Shooting: 3, Melee: 6 }, workDisables: [] },
  { id: 'GlitterworldEmpath26', slot: 'adult', title: 'Glitterworld empath', titleShort: 'Empath', skills: {}, workDisables: ['Violent'] },
  { id: 'GlitterworldOfficer60', slot: 'adult', title: 'Glitterworld officer', titleShort: 'Officer', skills: {}, workDisables: ['ManualDumb'] },
  { id: 'GlitterworldSurgeon15', slot: 'adult', title: 'Glitterworld surgeon', titleShort: 'Surgeon', skills: {}, workDisables: [] },
  { id: 'Gnomebiologist96', slot: 'adult', title: 'Gnomebiologist', titleShort: 'Biologist', skills: { Social: 4, Artistic: 7, Crafting: 4, Intellectual: 4 }, workDisables: ['Cooking', 'Firefighting', 'Cleaning'] },
  { id: 'GovernmentAgent61', slot: 'adult', title: 'Government agent', titleShort: 'Agent', skills: { Shooting: 4, Melee: 4, Medicine: 3 }, workDisables: ['Cleaning'] },
  { id: 'GraphicDesigner33', slot: 'adult', title: 'Graphic designer', titleShort: 'Designer', skills: { Artistic: 7, Crafting: 1 }, workDisables: [] },
  { id: 'Guardian55', slot: 'adult', title: 'Guardian', titleShort: 'Guardian', skills: { Shooting: 4, Melee: 4, Medicine: 4 }, workDisables: [] },
  { id: 'GunDealer14', slot: 'adult', title: 'Gun dealer', titleShort: 'Gun dealer', skills: { Shooting: 4, Social: 8 }, workDisables: [] },
  { id: 'Gunfighter51', slot: 'adult', title: 'Gunfighter', titleShort: 'Gunfighter', skills: { Shooting: 8, Melee: 2, Medicine: 6 }, workDisables: ['Social'] },
  { id: 'HeadButler50', slot: 'adult', title: 'Head butler', titleShort: 'Butler', skills: {}, workDisables: [] },
  { id: 'Healer35', slot: 'adult', title: 'Healer', titleShort: 'Healer', skills: { Plants: 5, Medicine: 7 }, workDisables: ['ManualDumb', 'Mining'] },
  { id: 'Healer46', slot: 'adult', title: 'Healer', titleShort: 'Healer', skills: {}, workDisables: [] },
  { id: 'HearthTender66', slot: 'adult', title: 'Hearth tender', titleShort: 'Tender', skills: {}, workDisables: [] },
  { id: 'HedgeFundManager54', slot: 'adult', title: 'Hedge fund manager', titleShort: 'Banker', skills: { Construction: -2, Plants: -2, Social: 4, Artistic: 7, Intellectual: 3 }, workDisables: [] },
  { id: 'Herbalist54', slot: 'adult', title: 'Herbalist', titleShort: 'Herbalist', skills: {}, workDisables: [] },
  { id: 'Herder33', slot: 'adult', title: 'Herder', titleShort: 'Herder', skills: {}, workDisables: [] },
  { id: 'CynapseCustomAdulthood', slot: 'adult', title: 'Hermit', titleShort: 'Hermit', skills: { Animals: 3 }, workDisables: [] },
  { id: 'Hermit82', slot: 'adult', title: 'Hermit', titleShort: 'Hermit', skills: {}, workDisables: ['Social'] },
  { id: 'Herpetologist3', slot: 'adult', title: 'Herpetologist', titleShort: 'Herper', skills: { Plants: 2, Medicine: 4, Intellectual: 2, Animals: 6 }, workDisables: ['Mining'] },
  { id: 'HiredAssassin37', slot: 'adult', title: 'Hired assassin', titleShort: 'Assassin', skills: { Shooting: 4, Melee: 5, Social: 3 }, workDisables: [] },
  { id: 'HiredGun70', slot: 'adult', title: 'Hired gun', titleShort: 'Hired gun', skills: { Cooking: 2, Shooting: 6, Melee: 2, Medicine: 3 }, workDisables: ['PlantWork'] },
  { id: 'HiredMuscle5', slot: 'adult', title: 'Hired muscle', titleShort: 'Hired thug', skills: { Shooting: 5, Melee: 3, Social: 3 }, workDisables: [] },
  { id: 'HouseServant63', slot: 'adult', title: 'House servant', titleShort: 'Servant', skills: {}, workDisables: ['Intellectual'] },
  { id: 'HouseServant86', slot: 'adult', title: 'House servant', titleShort: 'Servant', skills: {}, workDisables: [] },
  { id: 'Housemate8', slot: 'adult', title: 'Housemate', titleShort: 'Housemate', skills: {}, workDisables: [] },
  { id: 'HumanComputer83', slot: 'adult', title: 'Human computer', titleShort: 'Computer', skills: {}, workDisables: ['Artistic'] },
  { id: 'HumanTrafficker35', slot: 'adult', title: 'Human trafficker', titleShort: 'Trafficker', skills: { Melee: 4, Social: 3, Crafting: 2 }, workDisables: ['Caring', 'Artistic', 'PlantWork'] },
  { id: 'Hunter74', slot: 'adult', title: 'Hunter', titleShort: 'Hunter', skills: {}, workDisables: [] },
  { id: 'Hunter73', slot: 'adult', title: 'Hunter', titleShort: 'Hunter', skills: { Plants: 2, Shooting: 6, Medicine: 4 }, workDisables: ['Mining'] },
  { id: 'Hunter89', slot: 'adult', title: 'Hunter', titleShort: 'Hunter', skills: {}, workDisables: [] },
  { id: 'HunterOfTheKing53', slot: 'adult', title: 'Hunter of the king', titleShort: 'Pest guard', skills: { Shooting: 6, Melee: 4, Medicine: 3, Crafting: -3, Intellectual: -2 }, workDisables: ['Animals', 'Artistic', 'PlantWork'] },
  { id: 'HypnocultLeader61', slot: 'adult', title: 'Hypnocult leader', titleShort: 'Cultist', skills: { Social: 8, Intellectual: 5 }, workDisables: [] },
  { id: 'IllegalShipwright76', slot: 'adult', title: 'Illegal shipwright', titleShort: 'Shipwright', skills: {}, workDisables: [] },
  { id: 'ImperialGeneral27', slot: 'adult', title: 'Imperial general', titleShort: 'General', skills: { Construction: -2, Mining: -3, Shooting: 4, Melee: 4, Social: 5, Medicine: 2, Intellectual: 4 }, workDisables: ['ManualDumb'] },
  { id: 'ImperialInquisitor53', slot: 'adult', title: 'Imperial inquisitor', titleShort: 'Inquisitor', skills: {}, workDisables: [] },
  { id: 'ImperialPriest24', slot: 'adult', title: 'Imperial priest', titleShort: 'Priest', skills: {}, workDisables: [] },
  { id: 'InfantryEngineer46', slot: 'adult', title: 'Infantry engineer', titleShort: 'Engineer', skills: {}, workDisables: [] },
  { id: 'InfantryMedic6', slot: 'adult', title: 'Infantry medic', titleShort: 'Medic', skills: {}, workDisables: [] },
  { id: 'InfantryOfficer49', slot: 'adult', title: 'Infantry officer', titleShort: 'Officer', skills: {}, workDisables: [] },
  { id: 'InformationBroker77', slot: 'adult', title: 'Information broker', titleShort: 'Broker', skills: { Shooting: -1, Melee: -2, Social: 5, Intellectual: 4 }, workDisables: [] },
  { id: 'IntelligenceAgent21', slot: 'adult', title: 'Intelligence agent', titleShort: 'Intel', skills: {}, workDisables: [] },
  { id: 'IntelligenceAgent10', slot: 'adult', title: 'Intelligence agent', titleShort: 'Agent', skills: { Shooting: 7, Melee: 4, Social: 8 }, workDisables: ['Artistic'] },
  { id: 'IntimateAssassin35', slot: 'adult', title: 'Intimate assassin', titleShort: 'Assassin', skills: { Melee: 8, Social: 4 }, workDisables: ['Caring', 'Animals'] },
  { id: 'Inventor6', slot: 'adult', title: 'Inventor', titleShort: 'Inventor', skills: {}, workDisables: [] },
  { id: 'InvoluntaryHermit38', slot: 'adult', title: 'Involuntary hermit', titleShort: 'Hermit', skills: { Construction: 1, Plants: 3, Melee: 4, Crafting: 3 }, workDisables: ['Caring', 'Artistic', 'Cleaning'] },
  { id: 'Jailbird40', slot: 'adult', title: 'Jailbird', titleShort: 'Jailbird', skills: {}, workDisables: ['Social', 'Caring'] },
  { id: 'JoywireArtist8', slot: 'adult', title: 'Joywire artist', titleShort: 'Joywirer', skills: {}, workDisables: ['ManualDumb'] },
  { id: 'KingOfPirates25', slot: 'adult', title: 'King of pirates', titleShort: 'Pirate', skills: { Shooting: 5, Melee: 8, Social: 4, Animals: 3 }, workDisables: ['Artistic', 'Cooking', 'Firefighting'] },
  { id: 'WillCustomAdulthood', slot: 'adult', title: 'Labyrinth maker', titleShort: 'Labyrinth maker', skills: { Construction: 2 }, workDisables: [] },
  { id: 'Landworker98', slot: 'adult', title: 'Landworker', titleShort: 'Landworker', skills: {}, workDisables: [] },
  { id: 'LanguageAnalyst27', slot: 'adult', title: 'Language analyst', titleShort: 'Linguist', skills: { Plants: 4, Intellectual: 8 }, workDisables: [] },
  { id: 'LazyProgrammer3', slot: 'adult', title: 'Lazy programmer', titleShort: 'Programmer', skills: { Intellectual: 8 }, workDisables: ['PlantWork', 'Mining'] },
  { id: 'LineInfanteer20', slot: 'adult', title: 'Line infanteer', titleShort: 'Infanteer', skills: {}, workDisables: [] },
  { id: 'LivestockFarmer8', slot: 'adult', title: 'Livestock farmer', titleShort: 'Farmer', skills: {}, workDisables: [] },
  { id: 'Logger95', slot: 'adult', title: 'Logger', titleShort: 'Logger', skills: {}, workDisables: [] },
  { id: 'Logger16', slot: 'adult', title: 'Logger', titleShort: 'Logger', skills: {}, workDisables: [] },
  { id: 'LoneTraveler95', slot: 'adult', title: 'Lone traveler', titleShort: 'Traveler', skills: { Plants: 3, Shooting: 4, Medicine: 3, Artistic: -2 }, workDisables: [] },
  { id: 'Loner61', slot: 'adult', title: 'Loner', titleShort: 'Loner', skills: {}, workDisables: ['Social'] },
  { id: 'LoreKeeper51', slot: 'adult', title: 'Lore keeper', titleShort: 'Keeper', skills: {}, workDisables: [] },
  { id: 'LostMarine81', slot: 'adult', title: 'Lost marine', titleShort: 'Traitor', skills: { Shooting: 7, Melee: 5, Medicine: 2, Crafting: 6 }, workDisables: ['ManualDumb', 'Mining'] },
  { id: 'LostSoldier13', slot: 'adult', title: 'Lost soldier', titleShort: 'Lost', skills: { Construction: 5, Social: -2, Crafting: 5, Intellectual: -3 }, workDisables: [] },
  { id: 'LowWageWorker7', slot: 'adult', title: 'Low-wage worker', titleShort: 'Grunt', skills: {}, workDisables: [] },
  { id: 'LoyalJanissary59', slot: 'adult', title: 'Loyal janissary', titleShort: 'Janissary', skills: {}, workDisables: [] },
  { id: 'MachineCollector55', slot: 'adult', title: 'Machine collector', titleShort: 'Collector', skills: {}, workDisables: [] },
  { id: 'MachineFixer31', slot: 'adult', title: 'Machine fixer', titleShort: 'Fixer', skills: { Construction: 5, Medicine: 5, Crafting: 3 }, workDisables: ['Cooking', 'Firefighting'] },
  { id: 'MadAccountant61', slot: 'adult', title: 'Mad accountant', titleShort: 'Accountant', skills: { Shooting: 4, Social: 4, Intellectual: 6 }, workDisables: [] },
  { id: 'MadScientist2', slot: 'adult', title: 'Mad scientist', titleShort: 'Scientist', skills: { Construction: 3, Social: -2, Intellectual: 7 }, workDisables: ['Caring', 'Animals', 'Artistic'] },
  { id: 'MadScientist31', slot: 'adult', title: 'Mad scientist', titleShort: 'Scientist', skills: { Mining: 3, Medicine: 3, Artistic: -3, Intellectual: 8, Animals: -2 }, workDisables: ['PlantWork'] },
  { id: 'MadScientist22', slot: 'adult', title: 'Mad scientist', titleShort: 'Scientist', skills: { Shooting: 5, Medicine: 4, Crafting: 2, Intellectual: 5 }, workDisables: ['Hauling', 'Mining'] },
  { id: 'MafiaBoss17', slot: 'adult', title: 'Mafia boss', titleShort: 'Boss', skills: {}, workDisables: ['ManualDumb', 'Caring', 'Cooking'] },
  { id: 'Mailman2', slot: 'adult', title: 'Mailman', titleShort: 'Mailman', skills: {}, workDisables: [] },
  { id: 'Malingerer28', slot: 'adult', title: 'Malingerer', titleShort: 'Malingerer', skills: {}, workDisables: ['ManualDumb'] },
  { id: 'MarbleDoctor99', slot: 'adult', title: 'Marble doctor', titleShort: 'Doctor', skills: { Medicine: 8, Intellectual: 4 }, workDisables: ['Crafting'] },
  { id: 'MasterChef48', slot: 'adult', title: 'Master chef', titleShort: 'Chef', skills: { Cooking: 8, Artistic: 4 }, workDisables: [] },
  { id: 'MasterTrader65', slot: 'adult', title: 'Master trader', titleShort: 'Trader', skills: { Cooking: 2, Social: 8, Artistic: 4 }, workDisables: ['Mining'] },
  { id: 'Mathematician6', slot: 'adult', title: 'Mathematician', titleShort: 'Math prof', skills: {}, workDisables: ['ManualDumb'] },
  { id: 'MechWarVeteran77', slot: 'adult', title: 'Mech war veteran', titleShort: 'Veteran', skills: { Shooting: 7, Melee: 4 }, workDisables: ['Caring', 'Artistic'] },
  { id: 'MechanicsEngineer64', slot: 'adult', title: 'Mechanics engineer', titleShort: 'Engineer', skills: { Construction: 5, Plants: -2, Crafting: 6, Intellectual: 2 }, workDisables: [] },
  { id: 'MedicSoldier54', slot: 'adult', title: 'Medic soldier', titleShort: 'Medic', skills: { Medicine: 7, Intellectual: 5 }, workDisables: ['Violent'] },
  { id: 'MedicalScientist16', slot: 'adult', title: 'Medical scientist', titleShort: 'Scientist', skills: { Medicine: 2, Intellectual: 8 }, workDisables: [] },
  { id: 'MedievalDoctor40', slot: 'adult', title: 'Medieval doctor', titleShort: 'Quack', skills: {}, workDisables: [] },
  { id: 'MedievalFarmOaf58', slot: 'adult', title: 'Medieval farm oaf', titleShort: 'Oaf', skills: {}, workDisables: ['Intellectual'] },
  { id: 'MedievalKnight26', slot: 'adult', title: 'Medieval knight', titleShort: 'Knight', skills: { Shooting: 2, Melee: 6 }, workDisables: ['Cleaning'] },
  { id: 'MedievalLord57', slot: 'adult', title: 'Medieval lord', titleShort: 'Noble', skills: {}, workDisables: ['ManualDumb', 'ManualSkilled'] },
  { id: 'MedievalMinstrel95', slot: 'adult', title: 'Medieval minstrel', titleShort: 'Minstrel', skills: {}, workDisables: ['ManualSkilled', 'Hauling'] },
  { id: 'MedievalSailor97', slot: 'adult', title: 'Medieval sailor', titleShort: 'Sailor', skills: {}, workDisables: ['ManualSkilled'] },
  { id: 'MenagerieKeeper1', slot: 'adult', title: 'Menagerie keeper', titleShort: 'Zookeeper', skills: {}, workDisables: [] },
  { id: 'MentalPatient69', slot: 'adult', title: 'Mental patient', titleShort: 'Patient', skills: { Plants: 3, Shooting: -2, Artistic: 3, Crafting: 3, Intellectual: 2 }, workDisables: ['Cooking', 'Firefighting', 'Mining'] },
  { id: 'Mercenary20', slot: 'adult', title: 'Mercenary', titleShort: 'Mercenary', skills: { Construction: 2, Shooting: 6, Melee: 6, Social: 2, Crafting: 2 }, workDisables: ['Animals'] },
  { id: 'Mercenary55', slot: 'adult', title: 'Mercenary', titleShort: 'Merc', skills: { Construction: 3, Mining: 2, Shooting: 4, Melee: 3 }, workDisables: [] },
  { id: 'Mercenary4', slot: 'adult', title: 'Mercenary', titleShort: 'Mercenary', skills: { Construction: 3, Mining: 2, Shooting: 5, Artistic: -2 }, workDisables: [] },
  { id: 'MercenaryCaptain98', slot: 'adult', title: 'Mercenary captain', titleShort: 'Captain', skills: { Shooting: 5, Social: 5, Intellectual: 2 }, workDisables: ['Cleaning'] },
  { id: 'MercenaryChef44', slot: 'adult', title: 'Mercenary chef', titleShort: 'Mercenary', skills: { Construction: -3, Cooking: 5, Mining: -3, Shooting: 4, Crafting: 5 }, workDisables: ['PlantWork'] },
  { id: 'MercenaryLeader28', slot: 'adult', title: 'Mercenary leader', titleShort: 'Mercenary', skills: { Shooting: 4, Melee: 4, Social: 4 }, workDisables: [] },
  { id: 'MercenaryLord13', slot: 'adult', title: 'Mercenary lord', titleShort: 'Merc lord', skills: { Shooting: 2, Social: 7, Medicine: 3, Artistic: 2, Intellectual: 4 }, workDisables: ['Animals', 'Mining'] },
  { id: 'MercenaryPilot63', slot: 'adult', title: 'Mercenary pilot', titleShort: 'Mercenary', skills: { Construction: 3, Shooting: 6, Melee: 4, Social: -1 }, workDisables: ['Caring', 'Artistic'] },
  { id: 'MessageCarrier77', slot: 'adult', title: 'Message carrier', titleShort: 'Messenger', skills: {}, workDisables: ['Intellectual'] },
  { id: 'Microbiologist12', slot: 'adult', title: 'Microbiologist', titleShort: 'Biologist', skills: { Medicine: 3, Intellectual: 5 }, workDisables: [] },
  { id: 'MidworldSailor91', slot: 'adult', title: 'Midworld sailor', titleShort: 'Sailor', skills: { Construction: 3, Shooting: 4, Melee: 3, Social: 4 }, workDisables: ['Cooking'] },
  { id: 'MilitaryChaplain10', slot: 'adult', title: 'Military chaplain', titleShort: 'Chaplain', skills: {}, workDisables: ['Violent'] },
  { id: 'MilitaryCommissar71', slot: 'adult', title: 'Military commissar', titleShort: 'Commissar', skills: {}, workDisables: [] },
  { id: 'MilitaryCook18', slot: 'adult', title: 'Military cook', titleShort: 'Army cook', skills: {}, workDisables: [] },
  { id: 'MilitaryEngineer45', slot: 'adult', title: 'Military engineer', titleShort: 'Engineer', skills: { Construction: 3, Shooting: 3, Melee: 1, Crafting: 4 }, workDisables: [] },
  { id: 'MilitaryGunsmith27', slot: 'adult', title: 'Military gunsmith', titleShort: 'Gunsmith', skills: { Construction: 2, Cooking: 1, Shooting: 5, Melee: 4, Medicine: 2, Crafting: 5 }, workDisables: [] },
  { id: 'MilitaryInventor35', slot: 'adult', title: 'Military inventor', titleShort: 'Inventor', skills: { Construction: 3, Shooting: 1, Social: 2, Crafting: 3, Intellectual: 3 }, workDisables: ['Artistic'] },
  { id: 'MilitaryOfficer17', slot: 'adult', title: 'Military officer', titleShort: 'Officer', skills: { Construction: 2, Shooting: 8, Social: -3, Intellectual: 2 }, workDisables: ['Caring'] },
  { id: 'MilitiaSoldier79', slot: 'adult', title: 'Militia soldier', titleShort: 'Soldier', skills: { Construction: 3, Melee: 3, Social: 4, Medicine: -3, Artistic: 4, Crafting: 3 }, workDisables: ['Cooking', 'Cleaning'] },
  { id: 'MindwipedAssassin50', slot: 'adult', title: 'Mindwiped assassin', titleShort: 'Mindwipe', skills: { Cooking: -2, Shooting: 8, Melee: 4 }, workDisables: ['Caring', 'Artistic'] },
  { id: 'Minister88', slot: 'adult', title: 'Minister', titleShort: 'Minister', skills: { Shooting: 2, Social: 4, Crafting: 3, Intellectual: 3 }, workDisables: ['ManualDumb'] },
  { id: 'Missionary99', slot: 'adult', title: 'Missionary', titleShort: 'Missionary', skills: { Cooking: 4, Social: 6, Medicine: 2 }, workDisables: ['Violent'] },
  { id: 'MobHenchman53', slot: 'adult', title: 'Mob henchman', titleShort: 'Henchman', skills: { Shooting: 3, Melee: 7, Social: -2, Medicine: 2, Crafting: 2 }, workDisables: ['Artistic', 'Cleaning'] },
  { id: 'OskarCustomAdulthood', slot: 'adult', title: 'Mod designer', titleShort: 'Modder', skills: { Medicine: 2, Crafting: 5, Intellectual: 5 }, workDisables: ['Violent'] },
  { id: 'Model99', slot: 'adult', title: 'Model', titleShort: 'Model', skills: {}, workDisables: ['ManualDumb', 'Intellectual', 'ManualSkilled', 'Caring'] },
  { id: 'MuffaloResearcher67', slot: 'adult', title: 'Muffalo researcher', titleShort: 'Researcher', skills: { Melee: -3, Medicine: 4, Intellectual: 5, Animals: 4 }, workDisables: ['Social', 'Artistic'] },
  { id: 'MuffaloShaman95', slot: 'adult', title: 'Muffalo shaman', titleShort: 'Shaman', skills: {}, workDisables: [] },
  { id: 'MutinousCaptain52', slot: 'adult', title: 'Mutinous captain', titleShort: 'Captain', skills: { Shooting: 4, Social: 8 }, workDisables: [] },
  { id: 'NavyScientist52', slot: 'adult', title: 'Navy scientist', titleShort: 'Scientist', skills: {}, workDisables: [] },
  { id: 'NavyTechOfficer0', slot: 'adult', title: 'Navy tech officer', titleShort: 'Navy tech', skills: { Cooking: -2, Shooting: 4, Crafting: 5, Intellectual: 6, Animals: -2 }, workDisables: ['ManualDumb'] },
  { id: 'NetworkEngineer34', slot: 'adult', title: 'Network engineer', titleShort: 'Engineer', skills: { Construction: 4, Shooting: 4, Crafting: 4, Intellectual: 4 }, workDisables: [] },
  { id: 'NeuroScientist19', slot: 'adult', title: 'Neuro scientist', titleShort: 'Scientist', skills: { Social: 2, Medicine: 3, Intellectual: 8 }, workDisables: [] },
  { id: 'NinjaAssassin31', slot: 'adult', title: 'Ninja assassin', titleShort: 'Ninja', skills: { Shooting: 4, Melee: 3, Social: 2, Crafting: 2 }, workDisables: ['PlantWork'] },
  { id: 'Novelist7', slot: 'adult', title: 'Novelist', titleShort: 'Novelist', skills: {}, workDisables: ['ManualDumb', 'Social'] },
  { id: 'Nurse61', slot: 'adult', title: 'Nurse', titleShort: 'Nurse', skills: {}, workDisables: ['Violent'] },
  { id: 'OrbitalReservist22', slot: 'adult', title: 'Orbital reservist', titleShort: 'Reservist', skills: { Shooting: 7, Melee: 5, Medicine: 2 }, workDisables: [] },
  { id: 'OrnamentMaker56', slot: 'adult', title: 'Ornament maker', titleShort: 'Ornamenter', skills: {}, workDisables: [] },
  { id: 'Osteologist74', slot: 'adult', title: 'Osteologist', titleShort: 'Scholar', skills: { Mining: -3, Melee: 3, Social: 3, Intellectual: 7 }, workDisables: ['ManualDumb'] },
  { id: 'OverwatchSniper42', slot: 'adult', title: 'Overwatch sniper', titleShort: 'Sniper', skills: { Shooting: 5, Melee: 3, Medicine: 3 }, workDisables: ['Artistic'] },
  { id: 'Paramedic45', slot: 'adult', title: 'Paramedic', titleShort: 'Paramedic', skills: {}, workDisables: [] },
  { id: 'ParamilitaryAgent11', slot: 'adult', title: 'Paramilitary agent', titleShort: 'Agent', skills: { Shooting: 5, Melee: 2, Social: 3 }, workDisables: [] },
  { id: 'ParticlePhysicist44', slot: 'adult', title: 'Particle physicist', titleShort: 'Physicist', skills: { Plants: 2, Medicine: 3, Artistic: 3, Intellectual: 8 }, workDisables: [] },
  { id: 'Philosopher97', slot: 'adult', title: 'Philosopher', titleShort: 'Sage', skills: { Social: 2, Medicine: 3, Crafting: 2, Intellectual: 4 }, workDisables: [] },
  { id: 'PiousSoldier67', slot: 'adult', title: 'Pious soldier', titleShort: 'Pious soldier', skills: {}, workDisables: [] },
  { id: 'Pirate56', slot: 'adult', title: 'Pirate', titleShort: 'Pirate', skills: { Shooting: 4, Melee: 2, Social: 8 }, workDisables: ['ManualDumb'] },
  { id: 'PirateCaptain69', slot: 'adult', title: 'Pirate captain', titleShort: 'Captain', skills: { Shooting: 5, Melee: 5, Social: 6 }, workDisables: [] },
  { id: 'PirateDoctor0', slot: 'adult', title: 'Pirate doctor', titleShort: 'Bad doc', skills: { Mining: -3, Social: -2, Medicine: 4, Artistic: -3, Intellectual: 3 }, workDisables: [] },
  { id: 'PirateKing69', slot: 'adult', title: 'Pirate king', titleShort: 'Pirate', skills: { Shooting: 7, Melee: 5, Artistic: -2 }, workDisables: ['Caring', 'Social'] },
  { id: 'PirateSympathizer24', slot: 'adult', title: 'Pirate sympathizer', titleShort: 'Pirate', skills: { Shooting: 4, Melee: 8 }, workDisables: [] },
  { id: 'PirateTrooper73', slot: 'adult', title: 'Pirate trooper', titleShort: 'Trooper', skills: { Shooting: 6, Melee: 5 }, workDisables: ['Caring', 'Social'] },
  { id: 'PitBrawler76', slot: 'adult', title: 'Pit brawler', titleShort: 'Brawler', skills: {}, workDisables: ['Intellectual', 'Caring'] },
  { id: 'PlagueDoctor31', slot: 'adult', title: 'Plague doctor', titleShort: 'Doctor', skills: { Social: -2, Medicine: 8, Intellectual: 4 }, workDisables: ['Violent', 'Animals', 'Artistic', 'Cooking'] },
  { id: 'PlanetaryDiplomat7', slot: 'adult', title: 'Planetary diplomat', titleShort: 'Diplomat', skills: { Construction: -2, Social: 8, Artistic: 2, Intellectual: 3 }, workDisables: ['ManualDumb', 'Violent', 'Hauling', 'PlantWork', 'Mining'] },
  { id: 'PlanetaryMiner64', slot: 'adult', title: 'Planetary miner', titleShort: 'Miner', skills: {}, workDisables: [] },
  { id: 'PlankCutter72', slot: 'adult', title: 'Plank cutter', titleShort: 'Plank cutter', skills: {}, workDisables: [] },
  { id: 'PoisonGardener29', slot: 'adult', title: 'Poison gardener', titleShort: 'Botanist', skills: { Cooking: 2, Plants: 4, Medicine: 2, Intellectual: 1 }, workDisables: ['Social', 'Hauling', 'Mining'] },
  { id: 'Policeman45', slot: 'adult', title: 'Policeman', titleShort: 'Policeman', skills: {}, workDisables: [] },
  { id: 'PoliticalActivist20', slot: 'adult', title: 'Political activist', titleShort: 'Activist', skills: { Shooting: 5, Melee: 3, Medicine: 2, Intellectual: 2 }, workDisables: [] },
  { id: 'PoliticalAssassin46', slot: 'adult', title: 'Political assassin', titleShort: 'Deathjack', skills: { Shooting: 8, Melee: 8 }, workDisables: ['ManualDumb', 'Caring', 'Social', 'Artistic'] },
  { id: 'Politician57', slot: 'adult', title: 'Politician', titleShort: 'Politician', skills: { Shooting: 2, Melee: 2, Social: 5 }, workDisables: ['PlantWork', 'Mining'] },
  { id: 'PopIdol59', slot: 'adult', title: 'Pop idol', titleShort: 'Pop idol', skills: { Shooting: -4, Melee: -4, Social: 8, Artistic: 8 }, workDisables: ['ManualDumb', 'Cleaning', 'Hauling', 'PlantWork', 'Mining'] },
  { id: 'PopIdolPirate39', slot: 'adult', title: 'Pop idol pirate', titleShort: 'Pirate', skills: { Cooking: -2, Plants: -2, Shooting: 5, Melee: 7, Social: 4 }, workDisables: ['ManualDumb', 'Caring', 'Firefighting'] },
  { id: 'PrisonerOfWar2', slot: 'adult', title: 'Prisoner of war', titleShort: 'Prisoner', skills: { Shooting: 4, Melee: 4, Social: 4 }, workDisables: ['Animals'] },
  { id: 'PrivateDetective66', slot: 'adult', title: 'Private detective', titleShort: 'Detective', skills: { Social: 7, Intellectual: 4 }, workDisables: ['PlantWork', 'Mining'] },
  { id: 'Propagandist86', slot: 'adult', title: 'Propagandist', titleShort: 'Propagandist', skills: {}, workDisables: [] },
  { id: 'ProstheticSurgeon0', slot: 'adult', title: 'Prosthetic surgeon', titleShort: 'Surgeon', skills: { Plants: -2, Medicine: 6, Crafting: 4, Intellectual: 4 }, workDisables: [] },
  { id: 'ProstituteIdol28', slot: 'adult', title: 'Prostitute idol', titleShort: 'Prostitute', skills: { Cooking: 3, Social: 7, Artistic: 3 }, workDisables: [] },
  { id: 'PsychiatricPatient94', slot: 'adult', title: 'Psychiatric patient', titleShort: 'Patient', skills: {}, workDisables: ['Social', 'Caring', 'Violent'] },
  { id: 'QuarryWorker29', slot: 'adult', title: 'Quarry worker', titleShort: 'Quarry worker', skills: {}, workDisables: [] },
  { id: 'RaiderKing38', slot: 'adult', title: 'Raider king', titleShort: 'Pirate', skills: { Mining: 3, Shooting: 5, Melee: 5 }, workDisables: ['Intellectual'] },
  { id: 'Rancher43', slot: 'adult', title: 'Rancher', titleShort: 'Rancher', skills: {}, workDisables: ['ManualDumb'] },
  { id: 'Ranger6', slot: 'adult', title: 'Ranger', titleShort: 'Ranger', skills: { Construction: 2, Cooking: 2, Plants: 2, Shooting: 4, Medicine: 2 }, workDisables: ['Artistic'] },
  { id: 'Ranger96', slot: 'adult', title: 'Ranger', titleShort: 'Ranger', skills: {}, workDisables: [] },
  { id: 'RebelFighter39', slot: 'adult', title: 'Rebel fighter', titleShort: 'Rebel', skills: { Shooting: 4, Melee: 2 }, workDisables: ['Caring', 'Artistic'] },
  { id: 'ReconSniper89', slot: 'adult', title: 'Recon sniper', titleShort: 'Sniper', skills: {}, workDisables: [] },
  { id: 'Recruiter14', slot: 'adult', title: 'Recruiter', titleShort: 'Recruiter', skills: {}, workDisables: ['Caring'] },
  { id: 'Regent9', slot: 'adult', title: 'Regent', titleShort: 'Regent', skills: {}, workDisables: [] },
  { id: 'ReligiousHierarch16', slot: 'adult', title: 'Religious hierarch', titleShort: 'Hierarch', skills: { Construction: -3, Cooking: 4, Mining: -3, Shooting: -2, Melee: -2, Social: 8, Medicine: 5 }, workDisables: ['ManualDumb', 'Artistic'] },
  { id: 'RenegadeEngineer43', slot: 'adult', title: 'Renegade engineer', titleShort: 'Engineer', skills: { Shooting: 3, Melee: 3, Medicine: 3, Intellectual: 3 }, workDisables: [] },
  { id: 'RenownedProfessor51', slot: 'adult', title: 'Renowned professor', titleShort: 'Professor', skills: { Social: 6, Intellectual: 5 }, workDisables: [] },
  { id: 'Reporter71', slot: 'adult', title: 'Reporter', titleShort: 'Reporter', skills: { Social: 4, Artistic: 3, Intellectual: 2 }, workDisables: [] },
  { id: 'ReptileResearcher37', slot: 'adult', title: 'Reptile researcher', titleShort: 'Researcher', skills: { Cooking: 2, Medicine: 3, Artistic: 3, Crafting: 2, Intellectual: 7 }, workDisables: ['Violent'] },
  { id: 'Restorer70', slot: 'adult', title: 'Restorer', titleShort: 'Restorer', skills: { Construction: 5, Social: -2, Crafting: 9 }, workDisables: [] },
  { id: 'RimworldExile32', slot: 'adult', title: 'Rimworld exile', titleShort: 'Exile', skills: { Cooking: 2, Shooting: -2, Social: 5, Intellectual: 6 }, workDisables: [] },
  { id: 'Roboticist1', slot: 'adult', title: 'Roboticist', titleShort: 'Roboticist', skills: { Construction: 3, Crafting: 3, Intellectual: 7 }, workDisables: ['ManualDumb'] },
  { id: 'Roboticist41', slot: 'adult', title: 'Roboticist', titleShort: 'Roboticist', skills: { Construction: 3, Crafting: 6, Intellectual: 4 }, workDisables: ['Cooking', 'PlantWork'] },
  { id: 'RocketEngineer53', slot: 'adult', title: 'Rocket engineer', titleShort: 'Engineer', skills: { Construction: 4, Cooking: -4, Mining: 3, Social: -1, Medicine: -2, Intellectual: 5 }, workDisables: [] },
  { id: 'RocketPioneer19', slot: 'adult', title: 'Rocket pioneer', titleShort: 'Rocketeer', skills: { Construction: 8, Plants: -3, Intellectual: 5 }, workDisables: ['Violent'] },
  { id: 'RoyalCook18', slot: 'adult', title: 'Royal cook', titleShort: 'Cook', skills: {}, workDisables: [] },
  { id: 'RoyalGuard51', slot: 'adult', title: 'Royal guard', titleShort: 'Guard', skills: {}, workDisables: [] },
  { id: 'RoyalMasseuse43', slot: 'adult', title: 'Royal masseuse', titleShort: 'Masseuse', skills: {}, workDisables: [] },
  { id: 'RugbyPlayer71', slot: 'adult', title: 'Rugby player', titleShort: 'Winger', skills: { Construction: 4, Mining: 3, Melee: 5 }, workDisables: ['Cleaning'] },
  { id: 'RunawayDancer35', slot: 'adult', title: 'Runaway dancer', titleShort: 'Dancer', skills: { Shooting: 2, Social: 6, Artistic: 4 }, workDisables: [] },
  { id: 'SanitationCaptain29', slot: 'adult', title: 'Sanitation captain', titleShort: 'Janitor', skills: { Construction: 5, Crafting: 3 }, workDisables: [] },
  { id: 'Scout59', slot: 'adult', title: 'Scout', titleShort: 'Scout', skills: {}, workDisables: [] },
  { id: 'Sculptor63', slot: 'adult', title: 'Sculptor', titleShort: 'Sculptor', skills: {}, workDisables: ['ManualDumb', 'Crafting', 'Cooking'] },
  { id: 'SelflessHunter61', slot: 'adult', title: 'Selfless hunter', titleShort: 'Hunter', skills: { Shooting: 5, Social: 6 }, workDisables: [] },
  { id: 'SerialMurderer47', slot: 'adult', title: 'Serial murderer', titleShort: 'Murderer', skills: { Shooting: 4, Melee: 4, Artistic: 4 }, workDisables: ['Animals'] },
  { id: 'ShadowMarine63', slot: 'adult', title: 'Shadow marine', titleShort: 'Marine', skills: { Shooting: 4, Melee: 2, Medicine: 3, Intellectual: 4, Animals: 3 }, workDisables: [] },
  { id: 'ShamanOfShadows47', slot: 'adult', title: 'Shaman of shadows', titleShort: 'Shaman', skills: { Construction: -2, Plants: 2, Social: 6, Medicine: 4, Intellectual: 2 }, workDisables: ['Violent'] },
  { id: 'Sheriff52', slot: 'adult', title: 'Sheriff', titleShort: 'Sheriff', skills: {}, workDisables: [] },
  { id: 'Shipcracker37', slot: 'adult', title: 'Shipcracker', titleShort: 'Shipcracker', skills: {}, workDisables: [] },
  { id: 'ShockTrooper15', slot: 'adult', title: 'Shock trooper', titleShort: 'Shocktroop', skills: { Shooting: 7, Melee: 5, Medicine: 2 }, workDisables: [] },
  { id: 'SicklyLawyer49', slot: 'adult', title: 'Sickly lawyer', titleShort: 'Lawyer', skills: { Social: 8 }, workDisables: ['ManualDumb', 'Mining'] },
  { id: 'Sightseer70', slot: 'adult', title: 'Sightseer', titleShort: 'Sightseer', skills: { Plants: 2, Shooting: 2, Melee: 2, Medicine: 2, Artistic: 2, Animals: 2 }, workDisables: ['Intellectual'] },
  { id: 'LiamCustomAdulthood', slot: 'adult', title: 'Simulation developer', titleShort: 'Sim dev', skills: { Construction: -3, Crafting: 4, Intellectual: 6 }, workDisables: ['Violent'] },
  { id: 'Slaughterer58', slot: 'adult', title: 'Slaughterer', titleShort: 'Slaughterer', skills: {}, workDisables: [] },
  { id: 'SlaveChemist84', slot: 'adult', title: 'Slave chemist', titleShort: 'Chemist', skills: { Construction: -1, Mining: -2, Melee: -1, Medicine: 5, Intellectual: 4 }, workDisables: [] },
  { id: 'Smuggler23', slot: 'adult', title: 'Smuggler', titleShort: 'Smuggler', skills: { Shooting: 2, Melee: 2, Social: 5, Medicine: 2, Intellectual: -2 }, workDisables: ['Artistic'] },
  { id: 'SoftwareDeveloper84', slot: 'adult', title: 'Software developer', titleShort: 'Developer', skills: { Plants: -3, Social: -3, Artistic: 3, Crafting: 5, Intellectual: 7 }, workDisables: ['ManualDumb', 'Cleaning', 'Hauling'] },
  { id: 'TechnologyDoctor35', slot: 'adult', title: 'Soldier-farmer', titleShort: 'Soldier', skills: { Plants: 4, Shooting: 4, Medicine: 2, Animals: 2 }, workDisables: [] },
  { id: 'SoleSurvivor85', slot: 'adult', title: 'Sole survivor', titleShort: 'Survivor', skills: { Shooting: 4, Melee: 5, Social: -3 }, workDisables: ['Animals', 'Artistic'] },
  { id: 'SpaceBartender0', slot: 'adult', title: 'Space bartender', titleShort: 'Bartender', skills: { Cooking: 5, Plants: 4, Social: 4, Crafting: 2 }, workDisables: [] },
  { id: 'SpaceExplorer53', slot: 'adult', title: 'Space explorer', titleShort: 'Explorer', skills: { Construction: 3, Plants: 3, Mining: 3, Shooting: 4, Social: 4 }, workDisables: ['Caring'] },
  { id: 'SpaceHumanitarian9', slot: 'adult', title: 'Space humanitarian', titleShort: 'Activist', skills: { Cooking: 4, Plants: 2, Shooting: -2, Medicine: 2 }, workDisables: [] },
  { id: 'SpaceHunter79', slot: 'adult', title: 'Space hunter', titleShort: 'Huntsman', skills: { Cooking: 1, Shooting: 5, Melee: 1, Medicine: 2, Crafting: 3 }, workDisables: [] },
  { id: 'SpaceMarine9', slot: 'adult', title: 'Space marine', titleShort: 'Marine', skills: { Shooting: 6, Melee: 5, Social: -2 }, workDisables: ['Artistic'] },
  { id: 'SpaceMarine51', slot: 'adult', title: 'Space marine', titleShort: 'Marine', skills: { Shooting: 6, Melee: 5, Medicine: 2 }, workDisables: ['Artistic'] },
  { id: 'SpaceMarine94', slot: 'adult', title: 'Space marine', titleShort: 'Marine', skills: { Shooting: 7, Melee: 5 }, workDisables: ['Cooking'] },
  { id: 'SpaceMarine16', slot: 'adult', title: 'Space marine', titleShort: 'Marine', skills: {}, workDisables: [] },
  { id: 'SpaceMarine19', slot: 'adult', title: 'Space marine', titleShort: 'Marine', skills: { Shooting: 6, Melee: 4, Artistic: -3, Crafting: -2 }, workDisables: ['Caring', 'Social'] },
  { id: 'SpaceMarine5', slot: 'adult', title: 'Space marine', titleShort: 'Marine', skills: { Shooting: 8, Melee: 6 }, workDisables: ['Caring', 'Social'] },
  { id: 'SpaceMarineMedic10', slot: 'adult', title: 'Space marine medic', titleShort: 'Medic', skills: { Shooting: 6, Melee: 2, Medicine: 6 }, workDisables: [] },
  { id: 'SpaceMerchant97', slot: 'adult', title: 'Space merchant', titleShort: 'Merchant', skills: { Construction: 4, Shooting: 2, Social: 5, Crafting: 2 }, workDisables: ['Caring'] },
  { id: 'SpaceNavyDoctor72', slot: 'adult', title: 'Space navy doctor', titleShort: 'Doctor', skills: { Construction: -2, Plants: -2, Mining: -2, Shooting: 3, Melee: 1, Social: 2, Medicine: 5, Artistic: -1 }, workDisables: [] },
  { id: 'SpaceNavyTech37', slot: 'adult', title: 'Space navy tech', titleShort: 'Navy tech', skills: { Shooting: 4, Melee: 2, Crafting: 3, Intellectual: 8 }, workDisables: ['Mining'] },
  { id: 'SpacePirate55', slot: 'adult', title: 'Space pirate', titleShort: 'Pirate', skills: {}, workDisables: [] },
  { id: 'SpaceRaider71', slot: 'adult', title: 'Space raider', titleShort: 'Pirate', skills: { Shooting: 8, Melee: 3, Social: 5 }, workDisables: [] },
  { id: 'SpaceResearcher25', slot: 'adult', title: 'Space researcher', titleShort: 'Researcher', skills: { Plants: 2, Mining: -1, Crafting: 3, Intellectual: 6 }, workDisables: [] },
  { id: 'SpaceStationCook63', slot: 'adult', title: 'Space station cook', titleShort: 'Cook', skills: { Cooking: 6, Melee: 4 }, workDisables: ['Caring', 'Social'] },
  { id: 'SpaceTactician28', slot: 'adult', title: 'Space tactician', titleShort: 'Tactician', skills: {}, workDisables: ['Social', 'Artistic'] },
  { id: 'SpaceTechnician29', slot: 'adult', title: 'Space technician', titleShort: 'Technician', skills: { Construction: 5, Mining: 2, Social: 1, Intellectual: 1 }, workDisables: ['Artistic'] },
  { id: 'SpaceTrafficker68', slot: 'adult', title: 'Space trafficker', titleShort: 'Trafficker', skills: { Shooting: 5, Melee: 5, Social: 5, Medicine: -2 }, workDisables: ['Animals', 'Artistic', 'Crafting'] },
  { id: 'SpaceshipChef41', slot: 'adult', title: 'Spaceship chef', titleShort: 'Chef', skills: { Cooking: 7, Medicine: 5 }, workDisables: ['Cleaning'] },
  { id: 'SpaceshipSalesman34', slot: 'adult', title: 'Spaceship salesman', titleShort: 'Salesman', skills: { Construction: 2, Cooking: -1, Plants: 1, Shooting: 2, Social: 8, Medicine: -1, Artistic: -2, Crafting: -1, Intellectual: 2 }, workDisables: [] },
  { id: 'SpecialForces13', slot: 'adult', title: 'Special forces', titleShort: 'Specialist', skills: { Shooting: 7, Melee: 6, Social: 2 }, workDisables: ['Intellectual', 'Animals', 'Artistic'] },
  { id: 'Spiceminer81', slot: 'adult', title: 'Spiceminer', titleShort: 'Spiceminer', skills: { Construction: 2, Plants: -2, Mining: 8, Social: 2, Medicine: -2 }, workDisables: ['Intellectual'] },
  { id: 'Spy58', slot: 'adult', title: 'Spy', titleShort: 'Spy', skills: { Shooting: 2, Melee: 2, Social: 7 }, workDisables: [] },
  { id: 'Spymaster41', slot: 'adult', title: 'Spymaster', titleShort: 'Spymaster', skills: {}, workDisables: [] },
  { id: 'StalwartFarmer90', slot: 'adult', title: 'Stalwart farmer', titleShort: 'Farmer', skills: { Construction: 4, Shooting: 4, Melee: 2, Crafting: 2 }, workDisables: ['Animals', 'Artistic', 'Cooking'] },
  { id: 'StalwartFarmer21', slot: 'adult', title: 'Stalwart farmer', titleShort: 'Farmer', skills: { Construction: 3, Plants: 3, Mining: 2, Shooting: 5, Melee: 2, Intellectual: -2 }, workDisables: ['Artistic'] },
  { id: 'StarKnight5', slot: 'adult', title: 'Star knight', titleShort: 'Knight', skills: { Shooting: 2, Melee: 8, Social: 3 }, workDisables: [] },
  { id: 'StarfighterPilot79', slot: 'adult', title: 'Starfighter pilot', titleShort: 'Pilot', skills: { Mining: -3, Shooting: 7, Melee: 3, Artistic: -3, Intellectual: 4, Animals: -3 }, workDisables: ['Caring'] },
  { id: 'StarshipDoctor37', slot: 'adult', title: 'Starship doctor', titleShort: 'Doctor', skills: { Melee: -2, Social: -3, Medicine: 8, Intellectual: 5 }, workDisables: [] },
  { id: 'StarshipJanitor33', slot: 'adult', title: 'Starship janitor', titleShort: 'Janitor', skills: {}, workDisables: [] },
  { id: 'StateEngineer60', slot: 'adult', title: 'State engineer', titleShort: 'Engineer', skills: { Construction: 2, Crafting: 5, Intellectual: 4 }, workDisables: [] },
  { id: 'StationSecurity38', slot: 'adult', title: 'Station security', titleShort: 'Security', skills: { Shooting: 4, Melee: 3, Social: 3, Medicine: 3, Artistic: -3 }, workDisables: ['Firefighting'] },
  { id: 'StellarPirate10', slot: 'adult', title: 'Stellar pirate', titleShort: 'Pirate', skills: { Shooting: 4, Social: 4, Crafting: 4 }, workDisables: [] },
  { id: 'StewKeeper95', slot: 'adult', title: 'Stew keeper', titleShort: 'Stewkeeper', skills: {}, workDisables: [] },
  { id: 'StilettoAssassin34', slot: 'adult', title: 'Stiletto assassin', titleShort: 'Assassin', skills: { Construction: -3, Mining: -3, Shooting: 6, Melee: 8, Medicine: 2 }, workDisables: [] },
  { id: 'Storyteller63', slot: 'adult', title: 'Storyteller', titleShort: 'Fabulist', skills: { Social: 4, Artistic: 3, Crafting: 2, Intellectual: 2 }, workDisables: ['Cooking', 'Mining'] },
  { id: 'Streamer52', slot: 'adult', title: 'Streamer', titleShort: 'Streamer', skills: { Social: 6, Animals: 5 }, workDisables: [] },
  { id: 'SuperSoldier95', slot: 'adult', title: 'Super soldier', titleShort: 'Soldier', skills: { Shooting: 8, Melee: 7, Crafting: -3 }, workDisables: ['Social', 'Animals', 'Artistic'] },
  { id: 'SystemLord77', slot: 'adult', title: 'System lord', titleShort: 'Lord', skills: { Shooting: 6, Melee: 2, Social: 6 }, workDisables: ['Caring'] },
  { id: 'SystemsEngineer1', slot: 'adult', title: 'Systems engineer', titleShort: 'Engineer', skills: { Construction: 5, Crafting: 4, Intellectual: 7 }, workDisables: ['Social'] },
  { id: 'Tamer79', slot: 'adult', title: 'Tamer', titleShort: 'Tamer', skills: {}, workDisables: [] },
  { id: 'Taster16', slot: 'adult', title: 'Taster', titleShort: 'Taster', skills: {}, workDisables: ['ManualDumb'] },
  { id: 'Taxonomist0', slot: 'adult', title: 'Taxonomist', titleShort: 'Taxonomist', skills: {}, workDisables: ['Violent'] },
  { id: 'Teacher20', slot: 'adult', title: 'Teacher', titleShort: 'Teacher', skills: {}, workDisables: [] },
  { id: 'Technician9', slot: 'adult', title: 'Technician', titleShort: 'Techie', skills: { Construction: 2, Medicine: 4, Intellectual: 6 }, workDisables: [] },
  { id: 'TestSubject90', slot: 'adult', title: 'Test subject', titleShort: 'Experiment', skills: { Shooting: 6, Melee: 8, Social: -4 }, workDisables: ['Intellectual'] },
  { id: 'TestSubject39', slot: 'adult', title: 'Test subject', titleShort: 'Subject', skills: { Shooting: 4, Melee: 4 }, workDisables: ['Caring', 'Social', 'Artistic', 'Cooking', 'Cleaning', 'PlantWork'] },
  { id: 'TestSubject92', slot: 'adult', title: 'Test subject', titleShort: 'Subject', skills: { Cooking: 1, Melee: 5, Intellectual: 5 }, workDisables: ['Caring', 'Social', 'PlantWork', 'Mining'] },
  { id: 'TheaterTechnician80', slot: 'adult', title: 'Theater technician', titleShort: 'Technician', skills: { Construction: 3, Social: 3, Artistic: 2, Crafting: 2 }, workDisables: [] },
  { id: 'Tinkerer86', slot: 'adult', title: 'Tinkerer', titleShort: 'Tinkerer', skills: { Construction: 4, Artistic: 2, Crafting: 4, Intellectual: 4 }, workDisables: [] },
  { id: 'ToasterRepairman22', slot: 'adult', title: 'Toaster repairman', titleShort: 'Repairman', skills: { Construction: 7, Mining: -3, Crafting: 6 }, workDisables: ['Intellectual', 'Artistic'] },
  { id: 'ToolMechanic77', slot: 'adult', title: 'Tool mechanic', titleShort: 'Mechanic', skills: { Construction: 5, Artistic: 2, Crafting: 8 }, workDisables: ['Animals', 'PlantWork'] },
  { id: 'Torturer37', slot: 'adult', title: 'Torturer', titleShort: 'Torturer', skills: {}, workDisables: ['Social', 'Caring'] },
  { id: 'TournamentFighter28', slot: 'adult', title: 'Tournament fighter', titleShort: 'Fighter', skills: { Melee: 8, Medicine: 1, Intellectual: 2 }, workDisables: ['ManualSkilled'] },
  { id: 'TravelingBard93', slot: 'adult', title: 'Traveling bard', titleShort: 'Musician', skills: { Social: 5, Artistic: 4, Crafting: 2 }, workDisables: ['Intellectual'] },
  { id: 'CosmeticReject64', slot: 'adult', title: 'Traveling handywoman', titleShort: 'Handywoman', skills: { Construction: 4, Plants: -2, Melee: -2, Crafting: 4, Intellectual: 2 }, workDisables: [] },
  { id: 'TreasureHunter82', slot: 'adult', title: 'Treasure hunter', titleShort: 'Adventurer', skills: { Cooking: 2, Shooting: 5, Melee: 5, Social: 4, Medicine: 2 }, workDisables: ['ManualDumb', 'Animals', 'Artistic'] },
  { id: 'TreehouseBuilder86', slot: 'adult', title: 'Treehouse builder', titleShort: 'Treehouse builder', skills: {}, workDisables: [] },
  { id: 'TribeMember57', slot: 'adult', title: 'Tribe member', titleShort: 'Tribal', skills: {}, workDisables: [] },
  { id: 'Undertaker93', slot: 'adult', title: 'Undertaker', titleShort: 'Undertaker', skills: { Social: 6, Medicine: 2, Intellectual: 3 }, workDisables: ['Violent'] },
  { id: 'UnethicalDoctor29', slot: 'adult', title: 'Unethical doctor', titleShort: 'Doctor', skills: { Medicine: 6, Intellectual: 6 }, workDisables: ['ManualDumb', 'Social'] },
  { id: 'UnstableButcher31', slot: 'adult', title: 'Unstable butcher', titleShort: 'Butcher', skills: { Construction: 4, Mining: 3, Melee: 6, Social: 2, Medicine: -3, Intellectual: -4 }, workDisables: [] },
  { id: 'UprightDiplomat49', slot: 'adult', title: 'Upright diplomat', titleShort: 'Diplomat', skills: { Construction: -3, Shooting: 4, Social: 8, Crafting: -3 }, workDisables: ['Hauling'] },
  { id: 'UrbworldDrone32', slot: 'adult', title: 'Urbworld drone', titleShort: 'Drone', skills: {}, workDisables: ['Artistic', 'Intellectual'] },
  { id: 'UrbworldEnforcer11', slot: 'adult', title: 'Urbworld enforcer', titleShort: 'Enforcer', skills: { Shooting: 7, Melee: 4, Social: 3, Medicine: 2 }, workDisables: ['Intellectual'] },
  { id: 'UrbworldEntrepreneur14', slot: 'adult', title: 'Urbworld entrepreneur', titleShort: 'Entrepreneur', skills: {}, workDisables: [] },
  { id: 'UrbworldPimp93', slot: 'adult', title: 'Urbworld pimp', titleShort: 'Pimp', skills: { Melee: 6, Social: 4, Medicine: 5 }, workDisables: ['Cleaning'] },
  { id: 'UrbworldPolitican92', slot: 'adult', title: 'Urbworld politican', titleShort: 'Politician', skills: { Social: 8 }, workDisables: ['ManualDumb', 'Crafting'] },
  { id: 'UrbworldRebel56', slot: 'adult', title: 'Urbworld rebel', titleShort: 'Rebel', skills: {}, workDisables: ['Intellectual', 'Crafting'] },
  { id: 'UrbworldSergeant50', slot: 'adult', title: 'Urbworld sergeant', titleShort: 'Sergeant', skills: { Shooting: 4, Melee: 2, Social: 3 }, workDisables: [] },
  { id: 'UrbworldSexSlave25', slot: 'adult', title: 'Urbworld sex slave', titleShort: 'Sex slave', skills: { Cooking: 2, Social: 6, Artistic: -2 }, workDisables: ['Violent', 'Intellectual'] },
  { id: 'Vagabond73', slot: 'adult', title: 'Vagabond', titleShort: 'Vagabond', skills: { Construction: 4, Cooking: -2, Shooting: 3, Crafting: 4, Animals: 4 }, workDisables: ['Intellectual', 'Artistic'] },
  { id: 'VengefulExplorer54', slot: 'adult', title: 'Vengeful explorer', titleShort: 'Explorer', skills: { Construction: 4, Shooting: 6, Melee: 5 }, workDisables: ['Caring'] },
  { id: 'VengefulHunter32', slot: 'adult', title: 'Vengeful hunter', titleShort: 'Vengeful', skills: {}, workDisables: ['Animals'] },
  { id: 'VengefulNomad67', slot: 'adult', title: 'Vengeful nomad', titleShort: 'Nomad', skills: { Construction: 5, Mining: 1, Crafting: 7 }, workDisables: ['Intellectual'] },
  { id: 'VersatileWorker13', slot: 'adult', title: 'Versatile worker', titleShort: 'Worker', skills: { Construction: 1, Plants: 4, Melee: 5, Medicine: -1, Crafting: 2 }, workDisables: ['Social', 'Intellectual', 'Firefighting'] },
  { id: 'Veterinarian99', slot: 'adult', title: 'Veterinarian', titleShort: 'Vet', skills: {}, workDisables: [] },
  { id: 'VideoProducer83', slot: 'adult', title: 'Video producer', titleShort: 'Producer', skills: { Artistic: 7, Crafting: 4, Intellectual: 2 }, workDisables: ['ManualDumb', 'Social'] },
  { id: 'Villain89', slot: 'adult', title: 'Villain', titleShort: 'Villain', skills: { Mining: -2, Shooting: 4, Social: 6, Intellectual: 2 }, workDisables: ['Hauling'] },
  { id: 'VinhoKing98', slot: 'adult', title: 'Vinho king', titleShort: 'Booze king', skills: { Shooting: 3, Social: 7, Intellectual: 3 }, workDisables: ['PlantWork'] },
  { id: 'VoidRaider74', slot: 'adult', title: 'Void raider', titleShort: 'Pirate', skills: { Shooting: 6, Melee: 6 }, workDisables: [] },
  { id: 'VoidspaceRaider94', slot: 'adult', title: 'Voidspace raider', titleShort: 'Pirate', skills: { Mining: 2, Shooting: 4, Melee: 2, Medicine: 2, Crafting: 3 }, workDisables: ['Artistic'] },
  { id: 'VRDesigner87', slot: 'adult', title: 'VR designer', titleShort: 'Game dev', skills: {}, workDisables: ['ManualDumb'] },
  { id: 'WanderingCrafter42', slot: 'adult', title: 'Wandering crafter', titleShort: 'Crafter', skills: { Shooting: 3, Crafting: 8, Intellectual: 2 }, workDisables: [] },
  { id: 'WanderingHealer52', slot: 'adult', title: 'Wandering healer', titleShort: 'Healer', skills: { Construction: -1, Cooking: 2, Mining: -1, Social: 3, Medicine: 7 }, workDisables: ['Violent'] },
  { id: 'WarChief97', slot: 'adult', title: 'War chief', titleShort: 'Chief', skills: { Shooting: 7, Melee: 5, Social: 2 }, workDisables: ['Hauling', 'PlantWork'] },
  { id: 'Warlordess56', slot: 'adult', title: 'Warlordess', titleShort: 'Warlordess', skills: { Cooking: 6, Mining: -2, Melee: -2, Social: 6, Medicine: 5, Artistic: 3 }, workDisables: ['ManualDumb'] },
  { id: 'Warmaster54', slot: 'adult', title: 'Warmaster', titleShort: 'Warmaster', skills: {}, workDisables: [] },
  { id: 'Warmonger35', slot: 'adult', title: 'Warmonger', titleShort: 'Warmonger', skills: {}, workDisables: ['Caring'] },
  { id: 'Warrior73', slot: 'adult', title: 'Warrior', titleShort: 'Warrior', skills: { Cooking: 2, Shooting: 5, Melee: 4, Medicine: 3 }, workDisables: ['Intellectual'] },
  { id: 'Warrior94', slot: 'adult', title: 'Warrior', titleShort: 'Warrior', skills: {}, workDisables: [] },
  { id: 'WarshipCaptain67', slot: 'adult', title: 'Warship captain', titleShort: 'Captain', skills: { Construction: 3, Plants: -3, Shooting: 3, Melee: 2, Social: 5, Intellectual: 5, Animals: -3 }, workDisables: [] },
  { id: 'Weaver63', slot: 'adult', title: 'Weaver', titleShort: 'Weaver', skills: {}, workDisables: [] },
  { id: 'WhiteHatHacker82', slot: 'adult', title: 'White-hat hacker', titleShort: 'Hacker', skills: { Social: -2, Crafting: 2, Intellectual: 8 }, workDisables: ['ManualDumb'] },
  { id: 'WildlifeRanger99', slot: 'adult', title: 'Wildlife ranger', titleShort: 'Ranger', skills: { Shooting: 2, Medicine: 2, Animals: 8 }, workDisables: ['Artistic'] }
];

// Map backstory XML skill names to app skill IDs
const BACKSTORY_SKILL_MAP = {
  'Shooting': 'shoot', 'Construction': 'construct', 'Cooking': 'cook',
  'Animals': 'animal', 'Artistic': 'art', 'Social': 'social',
  'Melee': 'melee', 'Mining': 'mine', 'Plants': 'plant',
  'Crafting': 'craft', 'Medicine': 'medicine', 'Intellectual': 'intel'
};

// ─── Human body part index map (depth-first traversal of vanilla Bodies_Humanlike.xml) ───
// RimWorld save files reference body parts as <body>Human</body><index>N</index>.
// The index is assigned by depth-first traversal of the BodyDef tree starting from corePart.
const HUMAN_BODY_INDEX = [
  /* 0  */ 'torso',
  /* 1  */ 'ribcage',
  /* 2  */ 'sternum',
  /* 3  */ 'pelvis',
  /* 4  */ 'spine',
  /* 5  */ 'stomach',
  /* 6  */ 'heart',
  /* 7  */ 'left lung',
  /* 8  */ 'right lung',
  /* 9  */ 'left kidney',
  /* 10 */ 'right kidney',
  /* 11 */ 'liver',
  /* 12 */ 'neck',
  /* 13 */ 'head',
  /* 14 */ 'skull',
  /* 15 */ 'brain',
  /* 16 */ 'left eye',
  /* 17 */ 'right eye',
  /* 18 */ 'left ear',
  /* 19 */ 'right ear',
  /* 20 */ 'nose',
  /* 21 */ 'jaw',
  /* 22 */ 'tongue',
  /* 23 */ 'left shoulder',
  /* 24 */ 'left clavicle',
  /* 25 */ 'left arm',
  /* 26 */ 'left humerus',
  /* 27 */ 'left radius',
  /* 28 */ 'left hand',
  /* 29 */ 'left pinky',
  /* 30 */ 'left ring finger',
  /* 31 */ 'left middle finger',
  /* 32 */ 'left index finger',
  /* 33 */ 'left thumb',
  /* 34 */ 'right shoulder',
  /* 35 */ 'right clavicle',
  /* 36 */ 'right arm',
  /* 37 */ 'right humerus',
  /* 38 */ 'right radius',
  /* 39 */ 'right hand',
  /* 40 */ 'right pinky',
  /* 41 */ 'right ring finger',
  /* 42 */ 'right middle finger',
  /* 43 */ 'right index finger',
  /* 44 */ 'right thumb',
  /* 45 */ 'waist',
  /* 46 */ 'left leg',
  /* 47 */ 'left femur',
  /* 48 */ 'left tibia',
  /* 49 */ 'left foot',
  /* 50 */ 'left little toe',
  /* 51 */ 'left fourth toe',
  /* 52 */ 'left middle toe',
  /* 53 */ 'left second toe',
  /* 54 */ 'left big toe',
  /* 55 */ 'right leg',
  /* 56 */ 'right femur',
  /* 57 */ 'right tibia',
  /* 58 */ 'right foot',
  /* 59 */ 'right little toe',
  /* 60 */ 'right fourth toe',
  /* 61 */ 'right middle toe',
  /* 62 */ 'right second toe',
  /* 63 */ 'right big toe',
];

// Vanilla body-part max hit points, keyed by base part type (left/right share
// values). Values verified against Core BodyPartDef XML (hitPoints) - see
// BodyParts_Humanoid.xml, BodyParts_General.xml, BodyParts_Organs.xml.
const BODY_PART_HP_BASE = {
  torso: 40, ribcage: 30, sternum: 20, pelvis: 25, spine: 25,
  stomach: 20, heart: 15, lung: 15, kidney: 15, liver: 20,
  neck: 25, head: 25, skull: 25, brain: 10,
  eye: 10, ear: 12, nose: 10, jaw: 20,
  shoulder: 30, clavicle: 25, arm: 30, humerus: 25, radius: 20, hand: 20,
  leg: 30, femur: 25, tibia: 25, foot: 25
  // waist (utility slot) and tongue are conceptual / have no hitPoints in Core.
};
// Resolve a readable part name (e.g. "left arm") to its max HP. 0 = unknown/modded.
function bodyPartMaxHP(name) {
  if (!name) return 0;
  const n = String(name).toLowerCase().replace(/^left\s+|^right\s+/, '').trim();
  if (BODY_PART_HP_BASE[n] != null) return BODY_PART_HP_BASE[n];
  if (/finger|thumb|pinky/.test(n)) return 8; // Finger hitPoints = 8
  if (/toe/.test(n)) return 8;                // Toe hitPoints = 8
  return 0;
}

// Prosthetic/implant part efficiencies come from scanning the player's actual
// HediffDef XML (addedPartProps.partEfficiency) - the accurate, install-specific
// source of truth. We deliberately do NOT bake guessed vanilla values here:
// before a scan, a replaced part simply shows without a % rather than a made-up
// one. This object stays empty so _prostheticEfficiency has a defined fallback.
const VANILLA_PROSTHETIC_EFFICIENCY = {};

// Parse scanned <HediffDef> XML for added-part (prosthetic) efficiencies.
// Returns { hediffDefName: { label, efficiency } }. Renderer-only (DOMParser).
function parseProstheticsFromXML(xmlString) {
  const results = {};
  let doc;
  try { doc = new DOMParser().parseFromString(xmlString || '', 'text/xml'); } catch (_) { return results; }
  for (const h of doc.querySelectorAll('HediffDef')) {
    if (h.getAttribute('Abstract') === 'True') continue;
    const defName = (h.querySelector('defName') || {}).textContent;
    if (!defName || !defName.trim()) continue;
    const app = h.querySelector('addedPartProps');
    if (!app) continue;
    const effRaw = (app.querySelector('partEfficiency') || {}).textContent;
    const eff = parseFloat(effRaw);
    if (!Number.isFinite(eff)) continue;
    const label = ((h.querySelector('label') || {}).textContent || defName).trim();
    results[defName.trim()] = { label: label.charAt(0).toUpperCase() + label.slice(1), efficiency: eff };
  }
  return results;
}

// ── C3: Definition XML parsers with inheritance ───────────────────────────────
//
// Source audit (0A), installed RimWorld 1.6.4871 rev590:
//   App.state.hediffCatalog shape (array of objects):
//     { def, label, hediffClass, category, defaultSeverity,
//       disabledWorkStages?, hiddenStages?, capModStages? }
//
//   Prosthetic efficiency shape (from parseProstheticsFromXML):
//     { hediffDefName: { label, efficiency } }
//
//   C2 body-evidence flat field names (from capability-evidence.js _makeBodyEvidence):
//     kind, partId, partDef, side, parentPartDef, provenance
//     + extra fields by kind: replacementDef, implantDef, hediffDef, severity, stage
//
//   Exact workerClass values:
//     PawnCapacityWorker_Consciousness, PawnCapacityWorker_Manipulation,
//     PawnCapacityWorker_Moving, PawnCapacityWorker_Sight,
//     PawnCapacityWorker_Talking, PawnCapacityWorker_Hearing.
//   Exact tags consumed by those workers:
//     ConsciousnessSource; ManipulationLimbCore/Segment/Digit;
//     MovingLimbCore/Segment/Digit plus Pelvis and Spine; SightSource;
//     TalkingSource plus TalkingPathway and Tongue; HearingSource.
//   PawnCapacityDef defaults from the installed assembly:
//     workerClass=PawnCapacityWorker, minForCapable=0, minValue=0,
//     zeroIfCannotBeAwake=false. BodyPartDef defaults: hitPoints=10, tags=[].
//   BodyDef.AllParts is cached root-first depth-first in XML child order.
//   Save Scribe_BodyParts writes both body defName and a forced index for every
//   non-null part reference. Omitted body within a present part node is not a
//   pawn-body default in this target version.
//   Capacity composition is audited for Task 5: awake gate, worker, offsets,
//   combined postFactors, minimum setMax, minValue floor, hundredth rounding.

// ── parseBodyDefsFromXML ──────────────────────────────────────────────────────
// Parses <BodyDef> elements from scanned XML into a { defName: BodyDef } map.
// Retains abstract/named parents for inheritance resolution.
// Renderer-only (DOMParser).

function parseBodyDefsFromXML(xmlString, options) {
  const opts = options || {};
  const doc = _parseXmlDoc(xmlString);
  if (!doc) return {};

  // Phase 1: raw parse (retaining abstract defs)
  const rawDefs = [];
  let order = 0;
  for (const el of doc.querySelectorAll('BodyDef')) {
    const defName = _textDirect(el, 'defName');
    const abstractName = el.getAttribute('Name') || null;
    const parentName = el.getAttribute('ParentName') || null;
    const isAbstract = _boolAttribute(el, 'Abstract') === true;

    // Parse corePart tree recursively
    const corePartEl = _directChild(el, 'corePart');
    const corePart = corePartEl ? _parseBodyNode(corePartEl) : null;

    const reasons = [];
    if (el.hasAttribute('Abstract') && _boolAttribute(el, 'Abstract') == null) {
      reasons.push('unparseableRelevantField');
    }
    if (!corePart && !parentName && !isAbstract) {
      reasons.push('unparseableRelevantField');
    }
    rawDefs.push({
      defName: defName || null,
      abstractName: abstractName,
      parentName: parentName,
      isAbstract: isAbstract,
      sourceOrder: order++,
      modId: opts.modId || null,
      rawFields: { corePart: corePart },
      _completeness: reasons.length ? 'partial' : 'complete',
      _completenessReasons: reasons,
      _provenance: _definitionProvenance(opts, order - 1, defName || (abstractName ? '@' + abstractName : null)),
    });
  }

  // Phase 2: resolve inheritance
  const resolved = _resolveInheritance(rawDefs, function(parentFields, childFields) {
    return {
      corePart: _mergeBodyNode(parentFields.corePart, childFields.corePart),
    };
  });

  // Phase 3: detect duplicates, build output map
  const result = {};
  for (let i = 0; i < resolved.length; i++) {
    const rd = resolved[i];
    if (!rd.defName) continue;
    const reasons = (rd._completenessReasons || []).slice();
    _collectBodyNodeIssues(rd.corePart, reasons);
    _storeDefinition(result, rd.defName, {
      defName: rd.defName,
      corePart: rd.corePart ? _publicBodyNode(rd.corePart) : null,
      _completeness: reasons.length ? 'partial' : rd._completeness,
      _completenessReasons: _uniqueStrings(reasons),
      _provenance: rd._provenance,
    });
  }
  return result;
}

// Recursive body part tree parser. Each node:
// { def, customLabel, coverage, depth, height, parts: [...] }
function _parseBodyNode(el) {
  if (!el) return null;
  const defEl = _directChild(el, 'def');
  const customLabelEl = _directChild(el, 'customLabel');
  const coverageEl = _directChild(el, 'coverage');
  const depthEl = _directChild(el, 'depth');
  const heightEl = _directChild(el, 'height');
  const def = _textDirect(el, 'def') || null;
  const customLabel = _textDirect(el, 'customLabel') || null;
  const coverage = _numberDirect(el, 'coverage');
  const depth = _textDirect(el, 'depth') || null;
  const height = _textDirect(el, 'height') || null;

  const parts = [];
  const partsEl = _directChild(el, 'parts');
  if (partsEl) {
    const lis = _directChildren(partsEl, 'li');
    for (let i = 0; i < lis.length; i++) {
      const child = _parseBodyNode(lis[i]);
      if (child) parts.push(child);
    }
  }

  const issues = [];
  if (coverageEl && coverage == null) issues.push('unparseableRelevantField');
  return {
    def: def,
    customLabel: customLabel,
    coverage: coverage,
    depth: depth,
    height: height,
    parts: parts,
    _inheritFalse: _boolAttribute(el, 'Inherit') === false,
    _partsPresent: !!partsEl,
    _partsInheritFalse: !!partsEl && _boolAttribute(partsEl, 'Inherit') === false,
    _present: {
      def: !!defEl,
      customLabel: !!customLabelEl,
      coverage: !!coverageEl,
      depth: !!depthEl,
      height: !!heightEl,
    },
    _parseIssues: issues,
  };
}

function _collectBodyNodeIssues(node, reasons) {
  if (!node) return;
  reasons.push.apply(reasons, node._parseIssues || []);
  if (!node.def) reasons.push('unparseableRelevantField');
  for (let i = 0; i < node.parts.length; i++) _collectBodyNodeIssues(node.parts[i], reasons);
}

function _mergeBodyNode(parentNode, childNode) {
  if (!childNode) return parentNode;
  if (!parentNode || childNode._inheritFalse) return childNode;
  const present = childNode._present || {};
  let parts;
  if (!childNode._partsPresent) parts = parentNode.parts || [];
  else if (childNode._partsInheritFalse) parts = childNode.parts || [];
  else parts = (parentNode.parts || []).concat(childNode.parts || []);
  return {
    def: present.def ? childNode.def : parentNode.def,
    customLabel: present.customLabel ? childNode.customLabel : parentNode.customLabel,
    coverage: present.coverage ? childNode.coverage : parentNode.coverage,
    depth: present.depth ? childNode.depth : parentNode.depth,
    height: present.height ? childNode.height : parentNode.height,
    parts: parts,
    _inheritFalse: false,
    _partsPresent: childNode._partsPresent || parentNode._partsPresent,
    _partsInheritFalse: childNode._partsInheritFalse,
    _present: {
      def: present.def || (parentNode._present || {}).def,
      customLabel: present.customLabel || (parentNode._present || {}).customLabel,
      coverage: present.coverage || (parentNode._present || {}).coverage,
      depth: present.depth || (parentNode._present || {}).depth,
      height: present.height || (parentNode._present || {}).height,
    },
    _parseIssues: (parentNode._parseIssues || []).concat(childNode._parseIssues || []),
  };
}

function _publicBodyNode(node) {
  return {
    def: node.def,
    customLabel: node.customLabel,
    coverage: node.coverage,
    depth: node.depth,
    height: node.height,
    parts: (node.parts || []).map(_publicBodyNode),
  };
}

// ── parseBodyPartDefsFromXML ──────────────────────────────────────────────────
// Parses <BodyPartDef> elements into { defName: BodyPartDef }.
// Renderer-only (DOMParser).

function parseBodyPartDefsFromXML(xmlString, options) {
  const opts = options || {};
  const doc = _parseXmlDoc(xmlString);
  if (!doc) return {};

  const rawDefs = [];
  let order = 0;
  for (const el of doc.querySelectorAll('BodyPartDef')) {
    const defName = _textDirect(el, 'defName');
    const abstractName = el.getAttribute('Name') || null;
    const parentName = el.getAttribute('ParentName') || null;
    const isAbstract = _boolAttribute(el, 'Abstract') === true;

    const label = _textDirect(el, 'label') || null;
    const hitPoints = _numberDirect(el, 'hitPoints');

    // Tags: <tags><li>...</li></tags>
    const tags = [];
    const tagsEl = _directChild(el, 'tags');
    if (tagsEl) {
      const lis = _directChildren(tagsEl, 'li');
      for (let i = 0; i < lis.length; i++) {
        const t = (lis[i].textContent || '').trim();
        if (t) tags.push(t);
      }
    }

    const reasons = [];
    if (el.hasAttribute('Abstract') && _boolAttribute(el, 'Abstract') == null) {
      reasons.push('unparseableRelevantField');
    }
    if (_directChild(el, 'hitPoints') && hitPoints == null) reasons.push('unparseableRelevantField');

    rawDefs.push({
      defName: defName || null,
      abstractName: abstractName,
      parentName: parentName,
      isAbstract: isAbstract,
      sourceOrder: order++,
      modId: opts.modId || null,
      rawFields: {
        label: label,
        hitPoints: hitPoints,
        tags: tags,
        tagsPresent: !!tagsEl,
        tagsInheritFalse: !!tagsEl && _boolAttribute(tagsEl, 'Inherit') === false,
      },
      _completeness: reasons.length ? 'partial' : 'complete',
      _completenessReasons: reasons,
      _provenance: _definitionProvenance(opts, order - 1, defName || (abstractName ? '@' + abstractName : null)),
    });
  }

  const resolved = _resolveInheritance(rawDefs, function(parentFields, childFields) {
    return {
      label: childFields.label != null ? childFields.label : parentFields.label,
      hitPoints: childFields.hitPoints != null ? childFields.hitPoints : parentFields.hitPoints,
      tags: !childFields.tagsPresent
        ? parentFields.tags
        : (childFields.tagsInheritFalse ? childFields.tags : (parentFields.tags || []).concat(childFields.tags || [])),
      tagsPresent: childFields.tagsPresent || parentFields.tagsPresent,
      tagsInheritFalse: childFields.tagsInheritFalse,
    };
  });

  const result = {};
  for (let i = 0; i < resolved.length; i++) {
    const rd = resolved[i];
    if (!rd.defName) continue;
    _storeDefinition(result, rd.defName, {
      defName: rd.defName,
      label: rd.label || null,
      hitPoints: rd.hitPoints != null ? rd.hitPoints : 10,
      tags: Array.isArray(rd.tags) ? rd.tags : [],
      _completeness: rd._completeness,
      _completenessReasons: rd._completenessReasons,
      _provenance: rd._provenance,
    });
  }
  return result;
}

// ── parsePawnCapacityDefsFromXML ──────────────────────────────────────────────
// Parses <PawnCapacityDef> elements into { defName: PawnCapacityDef }.
// Does not freeze guessed defaults for absent booleans/numbers.
// Renderer-only (DOMParser).

function parsePawnCapacityDefsFromXML(xmlString, options) {
  const opts = options || {};
  const doc = _parseXmlDoc(xmlString);
  if (!doc) return {};

  const rawDefs = [];
  let order = 0;
  for (const el of doc.querySelectorAll('PawnCapacityDef')) {
    const defName = _textDirect(el, 'defName');
    const abstractName = el.getAttribute('Name') || null;
    const parentName = el.getAttribute('ParentName') || null;
    const isAbstract = _boolAttribute(el, 'Abstract') === true;

    const workerClass = _textDirect(el, 'workerClass') || null;
    const minForCapable = _numberDirect(el, 'minForCapable');
    const minValue = _numberDirect(el, 'minValue');
    const zeroIfCannotBeAwake = _boolDirect(el, 'zeroIfCannotBeAwake');

    const reasons = [];
    if (el.hasAttribute('Abstract') && _boolAttribute(el, 'Abstract') == null) {
      reasons.push('unparseableRelevantField');
    }
    if ((_directChild(el, 'minForCapable') && minForCapable == null)
      || (_directChild(el, 'minValue') && minValue == null)
      || (_directChild(el, 'zeroIfCannotBeAwake') && zeroIfCannotBeAwake == null)) {
      reasons.push('unparseableRelevantField');
    }

    rawDefs.push({
      defName: defName || null,
      abstractName: abstractName,
      parentName: parentName,
      isAbstract: isAbstract,
      sourceOrder: order++,
      modId: opts.modId || null,
      rawFields: {
        workerClass: workerClass,
        minForCapable: minForCapable,
        minValue: minValue,
        zeroIfCannotBeAwake: zeroIfCannotBeAwake,
      },
      _completeness: reasons.length ? 'partial' : 'complete',
      _completenessReasons: reasons,
      _provenance: _definitionProvenance(opts, order - 1, defName || (abstractName ? '@' + abstractName : null)),
    });
  }

  const resolved = _resolveInheritance(rawDefs, function(parentFields, childFields) {
    return {
      workerClass: childFields.workerClass != null ? childFields.workerClass : parentFields.workerClass,
      minForCapable: childFields.minForCapable != null ? childFields.minForCapable : parentFields.minForCapable,
      minValue: childFields.minValue != null ? childFields.minValue : parentFields.minValue,
      zeroIfCannotBeAwake: childFields.zeroIfCannotBeAwake != null ? childFields.zeroIfCannotBeAwake : parentFields.zeroIfCannotBeAwake,
    };
  });

  const result = {};
  for (let i = 0; i < resolved.length; i++) {
    const rd = resolved[i];
    if (!rd.defName) continue;
    _storeDefinition(result, rd.defName, {
      defName: rd.defName,
      workerClass: rd.workerClass || 'PawnCapacityWorker',
      minForCapable: rd.minForCapable != null ? rd.minForCapable : 0,
      minValue: rd.minValue != null ? rd.minValue : 0,
      zeroIfCannotBeAwake: rd.zeroIfCannotBeAwake != null ? rd.zeroIfCannotBeAwake : false,
      _completeness: rd._completeness,
      _completenessReasons: rd._completenessReasons,
      _provenance: rd._provenance,
    });
  }
  return result;
}

// ── parseRaceBodyMapFromXML ──────────────────────────────────────────────────
// Parses ThingDef (race defs) to extract <race><body>BodyDefName</body></race>.
// Returns { raceDefName: RaceBodyMapping }.
// Renderer-only (DOMParser).

function parseRaceBodyMapFromXML(xmlString, options) {
  const opts = options || {};
  const doc = _parseXmlDoc(xmlString);
  if (!doc) return {};

  const rawDefs = [];
  let order = 0;
  for (const el of doc.querySelectorAll('ThingDef')) {
    const defName = _textDirect(el, 'defName');
    const abstractName = el.getAttribute('Name') || null;
    const parentName = el.getAttribute('ParentName') || null;
    const isAbstract = _boolAttribute(el, 'Abstract') === true;

    // Only process defs that have a <race> element (race ThingDefs)
    const raceEl = _directChild(el, 'race');
    if (!raceEl && !isAbstract && !parentName) continue;

    const bodyDefName = raceEl ? (_textDirect(raceEl, 'body') || null) : null;

    const reasons = [];
    if (el.hasAttribute('Abstract') && _boolAttribute(el, 'Abstract') == null) {
      reasons.push('unparseableRelevantField');
    }
    rawDefs.push({
      defName: defName || null,
      abstractName: abstractName,
      parentName: parentName,
      isAbstract: isAbstract,
      sourceOrder: order++,
      modId: opts.modId || null,
      rawFields: {
        bodyDefName: bodyDefName,
        hasRace: !!raceEl,
        raceInheritFalse: !!raceEl && _boolAttribute(raceEl, 'Inherit') === false,
      },
      _completeness: reasons.length ? 'partial' : 'complete',
      _completenessReasons: reasons,
      _provenance: _definitionProvenance(opts, order - 1, defName || (abstractName ? '@' + abstractName : null)),
    });
  }

  const resolved = _resolveInheritance(rawDefs, function(parentFields, childFields) {
    return {
      bodyDefName: childFields.raceInheritFalse
        ? childFields.bodyDefName
        : (childFields.bodyDefName != null ? childFields.bodyDefName : parentFields.bodyDefName),
      hasRace: childFields.hasRace || parentFields.hasRace,
      raceInheritFalse: childFields.raceInheritFalse,
    };
  });

  const result = {};
  for (let i = 0; i < resolved.length; i++) {
    const rd = resolved[i];
    if (!rd.defName) continue;
    // A ParentName alone does not prove that an arbitrary ThingDef is a race.
    if (!rd.hasRace) continue;
    const reasons = (rd._completenessReasons || []).slice();
    if (!rd.bodyDefName) reasons.push('unparseableRelevantField');
    // legacyIndexFallback: 'human' only for the Human race def - this is
    // parser/provider metadata; CapacityResolver must never derive it.
    const legacyIndexFallback = rd.defName === 'Human' ? 'human' : null;
    _storeDefinition(result, rd.defName, {
      raceDefName: rd.defName,
      bodyDefName: rd.bodyDefName || null,
      legacyIndexFallback: legacyIndexFallback,
      _completeness: reasons.length ? 'partial' : rd._completeness,
      _completenessReasons: _uniqueStrings(reasons),
      _provenance: rd._provenance,
    });
  }
  return result;
}

// ── C4 requirement-definition parsers ───────────────────────────────────────

function _stringListField(el, tagName) {
  const field = _directChild(el, tagName);
  if (!field) return { present: false, inheritFalse: false, values: [] };
  const items = _directChildren(field, 'li');
  const raw = items.length
    ? items.map(item => String(item.textContent || '').trim())
    : String(field.textContent || '').split(',').map(value => value.trim());
  return {
    present: true,
    inheritFalse: _boolAttribute(field, 'Inherit') === false,
    values: raw.filter(Boolean),
  };
}

function _mergeInheritedList(parent, child) {
  if (!child.present) return parent;
  if (child.inheritFalse) return child;
  return {
    present: true,
    inheritFalse: false,
    values: _uniqueStrings((parent.values || []).concat(child.values || [])),
  };
}

function parseWorkTypeDefsFromXML(xmlString, options) {
  const opts = options || {};
  const doc = _parseXmlDoc(xmlString);
  if (!doc) return {};
  const rawDefs = [];
  let order = 0;
  for (const el of doc.querySelectorAll('WorkTypeDef')) {
    const defName = _textDirect(el, 'defName');
    const abstractName = el.getAttribute('Name') || null;
    const workTags = _stringListField(el, 'workTags');
    rawDefs.push({
      defName: defName || null,
      abstractName,
      parentName: el.getAttribute('ParentName') || null,
      isAbstract: _boolAttribute(el, 'Abstract') === true,
      rawFields: { workTags },
      _completeness: 'complete',
      _completenessReasons: [],
      _provenance: _definitionProvenance(opts, order++, defName || (abstractName ? '@' + abstractName : null)),
    });
  }
  const resolved = _resolveInheritance(rawDefs, (parent, child) => ({
    // WorkTags is one enum-flags value, not a list field: an explicit child
    // value replaces the inherited value even when it contains several flags.
    workTags: child.workTags.present ? child.workTags : parent.workTags,
  }));
  const result = {};
  for (const rd of resolved) {
    const reasons = (rd._completenessReasons || []).slice();
    const tags = (rd.workTags && rd.workTags.values) || [];
    for (const tag of tags) {
      if (!Object.prototype.hasOwnProperty.call(RIMWORLD_WORK_TAG_VALUES, tag)) {
        reasons.push('unsupportedWorkTag:' + tag);
      }
    }
    _storeDefinition(result, rd.defName, {
      defName: rd.defName,
      workTags: tags.slice(),
      workTagsCompleteness: reasons.length ? 'partial' : rd._completeness,
      workTagsCompletenessReasons: _uniqueStrings(reasons),
      pathCatalogueCompleteness: 'complete',
      pathCatalogueCompletenessReasons: [],
      _completeness: reasons.length ? 'partial' : rd._completeness,
      _completenessReasons: _uniqueStrings(reasons),
      _provenance: rd._provenance,
    });
  }
  return result;
}

function parseWorkGiverDefsFromXML(xmlString, options) {
  const opts = options || {};
  const doc = _parseXmlDoc(xmlString);
  if (!doc) return {};
  const rawDefs = [];
  let order = 0;
  for (const el of doc.querySelectorAll('WorkGiverDef')) {
    const defName = _textDirect(el, 'defName');
    const abstractName = el.getAttribute('Name') || null;
    const priority = _numberDirect(el, 'priorityInType');
    const requiredCapacities = _stringListField(el, 'requiredCapacities');
    const reasons = [];
    if (_directChild(el, 'priorityInType') && priority == null) reasons.push('unparseablePriorityInType');
    rawDefs.push({
      defName: defName || null,
      abstractName,
      parentName: el.getAttribute('ParentName') || null,
      isAbstract: _boolAttribute(el, 'Abstract') === true,
      rawFields: {
        workTypeDefName: _textDirect(el, 'workType') || null,
        priorityInType: priority,
        requiredCapacities,
        giverClass: _textDirect(el, 'giverClass') || null,
      },
      _completeness: reasons.length ? 'partial' : 'complete',
      _completenessReasons: reasons,
      _provenance: _definitionProvenance(opts, order++, defName || (abstractName ? '@' + abstractName : null)),
    });
  }
  const resolved = _resolveInheritance(rawDefs, (parent, child) => ({
    workTypeDefName: child.workTypeDefName != null ? child.workTypeDefName : parent.workTypeDefName,
    priorityInType: child.priorityInType != null ? child.priorityInType : parent.priorityInType,
    requiredCapacities: _mergeInheritedList(parent.requiredCapacities, child.requiredCapacities),
    giverClass: child.giverClass != null ? child.giverClass : parent.giverClass,
  }));
  const result = {};
  for (const rd of resolved) {
    const workTypeReasons = [];
    const capacityReasons = [];
    if (!rd.workTypeDefName) workTypeReasons.push('missingWorkType');
    for (const reason of rd._completenessReasons || []) {
      workTypeReasons.push(reason);
      capacityReasons.push(reason);
    }
    _storeDefinition(result, rd.defName, {
      defName: rd.defName,
      workTypeDefName: rd.workTypeDefName || null,
      priorityInType: rd.priorityInType,
      requiredCapacities: ((rd.requiredCapacities && rd.requiredCapacities.values) || []).slice(),
      giverClass: rd.giverClass || null,
      workTypeCompleteness: workTypeReasons.length ? 'partial' : 'complete',
      workTypeCompletenessReasons: _uniqueStrings(workTypeReasons),
      requiredCapacitiesCompleteness: capacityReasons.length ? 'partial' : 'complete',
      requiredCapacitiesCompletenessReasons: _uniqueStrings(capacityReasons),
      catalogueMembershipCompleteness: rd._completeness,
      catalogueMembershipCompletenessReasons: (rd._completenessReasons || []).slice(),
      _completeness: (workTypeReasons.length || capacityReasons.length) ? 'partial' : rd._completeness,
      _completenessReasons: _uniqueStrings(workTypeReasons.concat(capacityReasons)),
      _provenance: rd._provenance,
    });
  }
  return result;
}

function parseRaceWorkSettingsFromXML(xmlString, options) {
  const opts = options || {};
  const doc = _parseXmlDoc(xmlString);
  if (!doc) return {};
  const rawDefs = [];
  let order = 0;
  for (const el of doc.querySelectorAll('ThingDef')) {
    const defName = _textDirect(el, 'defName');
    const abstractName = el.getAttribute('Name') || null;
    const race = _directChild(el, 'race');
    const settings = race && _directChild(race, 'lifeStageWorkSettings');
    if (!race && !el.getAttribute('ParentName') && _boolAttribute(el, 'Abstract') !== true) continue;
    const entries = {};
    const reasons = [];
    if (settings) {
      for (const child of _elementChildren(settings)) {
        const rawAge = String(child.textContent || '').trim();
        const minAge = /^-?\d+$/.test(rawAge) ? parseInt(rawAge, 10) : null;
        entries[child.tagName] = minAge;
        if (minAge == null) reasons.push('unparseableMinAge:' + child.tagName);
      }
    }
    rawDefs.push({
      defName: defName || null,
      abstractName,
      parentName: el.getAttribute('ParentName') || null,
      isAbstract: _boolAttribute(el, 'Abstract') === true,
      rawFields: {
        hasRace: !!race,
        raceInheritFalse: !!race && _boolAttribute(race, 'Inherit') === false,
        settingsPresent: !!settings,
        settingsInheritFalse: !!settings && _boolAttribute(settings, 'Inherit') === false,
        entries,
      },
      _completeness: reasons.length ? 'partial' : 'complete',
      _completenessReasons: reasons,
      _provenance: _definitionProvenance(opts, order++, defName || (abstractName ? '@' + abstractName : null)),
    });
  }
  const resolved = _resolveInheritance(rawDefs, (parent, child) => {
    if (child.raceInheritFalse) return child;
    let entries = parent.entries || {};
    if (child.settingsPresent) {
      entries = child.settingsInheritFalse
        ? Object.assign({}, child.entries)
        : Object.assign({}, parent.entries || {}, child.entries || {});
    }
    return {
      hasRace: child.hasRace || parent.hasRace,
      raceInheritFalse: false,
      settingsPresent: child.settingsPresent || parent.settingsPresent,
      settingsInheritFalse: child.settingsInheritFalse,
      entries,
    };
  });
  const result = {};
  for (const rd of resolved) {
    if (!rd.hasRace) continue;
    const entryCompleteness = {};
    const entryCompletenessReasons = {};
    for (const [workType, minAge] of Object.entries(rd.entries || {})) {
      entryCompleteness[workType] = minAge == null ? 'partial' : rd._completeness;
      entryCompletenessReasons[workType] = minAge == null
        ? ['unparseableMinAge:' + workType] : (rd._completenessReasons || []).slice();
    }
    _storeDefinition(result, rd.defName, {
      raceDefName: rd.defName,
      entries: Object.assign({}, rd.entries || {}),
      entryCompleteness,
      entryCompletenessReasons,
      catalogueCompleteness: rd._completeness,
      catalogueCompletenessReasons: (rd._completenessReasons || []).slice(),
      _completeness: rd._completeness,
      _completenessReasons: (rd._completenessReasons || []).slice(),
      _provenance: rd._provenance,
    });
  }
  return result;
}

// ── C5: focused structural-effectiveness definition provider ────────────────
// This parser deliberately records XML/data facts only. It does not interpret
// arbitrary workers, StatParts, JobDrivers, WorkGivers, or PatchOperations.

function parseEffectivenessProviderFromXML(parts, options) {
  const input = parts || {};
  const opts = options || {};
  const active = opts.activePackageResolution || {
    ids: ['ludeon.rimworld'], completeness: 'unknown', reasons: ['missingActivePackages'],
  };
  const activeIds = new Set(Array.isArray(active.ids) ? active.ids.map(id => String(id).toLowerCase()) : []);
  const uncertainty = opts.uncertainty || { byType: {}, dataset: {} };
  const sourceMap = opts.sourceMap || {};
  const supportedStats = new Set([
    'GlobalLearningFactor', 'AnimalsLearningFactor', 'WorkSpeedGlobal',
    'MiningSpeed', 'CookSpeed', 'RestFallRateFactor', 'RestRateMultiplier',
  ]);
  const supportedParts = new Set([
    'StatPart_Glow', 'StatPart_Slave', 'StatPart_OverseerStatOffset',
    'StatPart_Age', 'StatPart_Trainable',
  ]);
  const appSkillByDef = {
    Shooting: 'shoot', Construction: 'construct', Cooking: 'cook', Animals: 'animal',
    Artistic: 'art', Social: 'social', Melee: 'melee', Mining: 'mine', Plants: 'plant',
    Crafting: 'craft', Medicine: 'medicine', Intellectual: 'intel',
  };

  const docFor = xml => _parseXmlDoc(typeof xml === 'string' ? xml : '');
  const directList = (scope, field) => {
    const list = _directChild(scope, field);
    if (!list) return { present: false, inheritFalse: false, values: [] };
    const lis = _directChildren(list, 'li');
    const values = lis.length
      ? lis.map(li => String(li.textContent || '').trim()).filter(Boolean)
      : String(list.textContent || '').split(',').map(value => value.trim()).filter(Boolean);
    return {
      present: true,
      inheritFalse: _boolAttribute(list, 'Inherit') === false,
      values,
    };
  };
  const mergeList = (parent, child) => {
    if (!child || !child.present) return parent || { present: false, inheritFalse: false, values: [] };
    if (child.inheritFalse) return child;
    return Object.assign({}, child, {
      values: (parent && parent.values || []).concat(child.values || []),
    });
  };
  const sourceForOccurrence = (type, defName, occurrence) => {
    const records = sourceMap[type] && sourceMap[type][defName];
    return Array.isArray(records) && records[occurrence] ? records[occurrence] : null;
  };
  const activeNodeRecords = (doc, tagName, type) => {
    if (!doc) return [];
    const counts = {};
    const result = [];
    for (const node of doc.querySelectorAll(tagName)) {
      const defName = _textDirect(node, 'defName');
      const abstractName = node.getAttribute('Name') || null;
      const key = defName || (abstractName ? '@' + abstractName : null);
      const occurrence = key ? (counts[key] || 0) : 0;
      if (key) counts[key] = occurrence + 1;
      const source = defName ? sourceForOccurrence(type, defName, occurrence) : null;
      const modId = source && source.modId ? String(source.modId).toLowerCase() : null;
      if (active.completeness === 'complete' && modId && !activeIds.has(modId)) continue;
      result.push({ node, defName, abstractName, source, occurrence });
    }
    return result;
  };
  const provenanceFor = record => record.source
    ? { modId: record.source.modId || null, sources: [Object.assign({}, record.source)] }
    : _definitionProvenance(opts, record.occurrence, record.defName || ('@' + record.abstractName));
  const reasonsFor = (type, defName, dimension) => {
    const typed = uncertainty.byType && uncertainty.byType[type]
      && uncertainty.byType[type][defName];
    let values = [];
    if (Array.isArray(typed)) values = values.concat(typed);
    else if (typed && dimension && Array.isArray(typed[dimension])) values = values.concat(typed[dimension]);
    const dataset = uncertainty.dataset && uncertainty.dataset[type];
    if (Array.isArray(dataset)) values = values.concat(dataset);
    else if (dataset && dimension && Array.isArray(dataset[dimension])) values = values.concat(dataset[dimension]);
    return _uniqueStrings(values);
  };
  const parseTargetMap = (scope, field, valueName) => {
    const container = _directChild(scope, field);
    if (!container) return { present: false, inheritFalse: false, values: [] };
    const values = [];
    const children = _elementChildren(container);
    for (let index = 0; index < children.length; index++) {
      const child = children[index];
      let target = child.tagName === 'li'
        ? (_textDirect(child, 'skill') || _textDirect(child, 'stat') || null)
        : child.tagName;
      const raw = child.tagName === 'li'
        ? (_textDirect(child, valueName) || _textDirect(child, 'value') || _textDirect(child, 'level'))
        : String(child.textContent || '').trim();
      const number = raw == null || raw === '' ? null : Number(raw);
      values.push({ target, value: Number.isFinite(number) ? number : null, sourceOrder: index });
    }
    return {
      present: true,
      inheritFalse: _boolAttribute(container, 'Inherit') === false,
      values,
    };
  };
  const publicAptitudes = parsed => (parsed && parsed.values || []).map(item => ({
    skillDefId: item.target, offset: item.value, sourceOrder: item.sourceOrder,
  }));
  const publicStatOperations = (parsed, kind) => (parsed && parsed.values || []).map(item => ({
    kind, statDefId: item.target, value: item.value, sourceOrder: item.sourceOrder,
  }));

  const skillDefs = {};
  const skillDoc = docFor(input.skillDefsXml);
  const skillRaw = [];
  for (const record of activeNodeRecords(skillDoc, 'SkillDef', 'SkillDef')) {
    const node = record.node;
    const tags = directList(node, 'disablingWorkTags');
    const neverDisabled = _boolDirect(node, 'neverDisabledBasedOnWorkTypes');
    const reasons = [];
    if (_directChild(node, 'neverDisabledBasedOnWorkTypes') && neverDisabled == null) {
      reasons.push('unparseableRelevantField');
    }
    skillRaw.push({
      defName: record.defName || null,
      abstractName: record.abstractName,
      parentName: node.getAttribute('ParentName') || null,
      isAbstract: _boolAttribute(node, 'Abstract') === true,
      rawFields: { tags, neverDisabled, neverDisabledPresent: !!_directChild(node, 'neverDisabledBasedOnWorkTypes') },
      _completeness: reasons.length ? 'partial' : 'complete',
      _completenessReasons: reasons,
      _provenance: provenanceFor(record),
    });
  }
  const resolvedSkills = _resolveInheritance(skillRaw, (parent, child) => ({
    tags: mergeList(parent.tags, child.tags),
    neverDisabled: child.neverDisabledPresent ? child.neverDisabled : parent.neverDisabled,
    neverDisabledPresent: child.neverDisabledPresent || parent.neverDisabledPresent,
  }));
  for (const definition of resolvedSkills) {
    const reasons = _uniqueStrings((definition._completenessReasons || [])
      .concat(reasonsFor('SkillDef', definition.defName, 'fields')));
    _storeDefinition(skillDefs, definition.defName, {
      defName: definition.defName,
      appSkillId: appSkillByDef[definition.defName] || null,
      disablingWorkTags: (definition.tags && definition.tags.values || []).slice(),
      disablingWorkTagsCompleteness: reasons.length ? 'partial' : 'complete',
      neverDisabledBasedOnWorkTypes: definition.neverDisabled,
      activePackage: definition._provenance.modId || null,
      _completeness: reasons.length ? 'partial' : definition._completeness,
      _completenessReasons: reasons,
      _provenance: definition._provenance,
    });
  }

  const sourceOperations = { traits: {}, genes: {}, geneTemplates: {}, hediffs: {} };
  const traitDoc = docFor(input.traitsXml);
  for (const record of activeNodeRecords(traitDoc, 'TraitDef', 'TraitDef')) {
    if (!record.defName || _boolAttribute(record.node, 'Abstract') === true) continue;
    const degreeContainer = _directChild(record.node, 'degreeDatas');
    const degreeNodes = degreeContainer ? _directChildren(degreeContainer, 'li') : [];
    const traitDegrees = degreeNodes.map((degree, degreeOrder) => {
      const skillGains = parseTargetMap(degree, 'skillGains', 'value');
      const aptitudes = parseTargetMap(degree, 'aptitudes', 'level');
      const statOffsets = parseTargetMap(degree, 'statOffsets', 'value');
      const statFactors = parseTargetMap(degree, 'statFactors', 'value');
      return {
        degree: _numberDirect(degree, 'degree') ?? 0,
        sourceOrder: degreeOrder,
        skillGains: (skillGains.values || []).map(item => ({
          skillDefId: item.target, value: item.value, sourceOrder: item.sourceOrder,
        })),
        aptitudes: publicAptitudes(aptitudes),
        statOffsets: publicStatOperations(statOffsets, 'statOffset'),
        statFactors: publicStatOperations(statFactors, 'statFactor'),
        applicability: { kind: 'traitNotSuppressed', degreeRequired: true },
        aptitudeCompleteness: aptitudes.present ? 'complete' : 'complete',
      };
    });
    _storeDefinition(sourceOperations.traits, record.defName, {
      defName: record.defName, traitDegrees,
      traitDegreeCompleteness: degreeContainer ? 'complete' : 'complete',
      _completeness: 'complete', _completenessReasons: [],
      _provenance: provenanceFor(record),
    });
  }

  const geneDoc = docFor(input.genesXml);
  for (const record of activeNodeRecords(geneDoc, 'GeneDef', 'GeneDef')) {
    if (!record.defName || _boolAttribute(record.node, 'Abstract') === true) continue;
    const aptitudes = parseTargetMap(record.node, 'aptitudes', 'level');
    const statOffsets = parseTargetMap(record.node, 'statOffsets', 'value');
    const statFactors = parseTargetMap(record.node, 'statFactors', 'value');
    _storeDefinition(sourceOperations.genes, record.defName, {
      id: record.defName, defName: record.defName, definitionKind: 'GeneDef',
      geneClassId: _textDirect(record.node, 'geneClass') || 'Gene',
      aptitudes: publicAptitudes(aptitudes),
      aptitudeCompleteness: aptitudes.present ? 'complete' : 'complete',
      statOffsets: publicStatOperations(statOffsets, 'statOffset'),
      statFactors: publicStatOperations(statFactors, 'statFactor'),
      activeStateRequirement: 'Gene.Active',
      _completeness: 'complete', _completenessReasons: [],
      _provenance: provenanceFor(record),
    });
  }
  for (const record of activeNodeRecords(geneDoc, 'GeneTemplateDef', 'GeneTemplateDef')) {
    if (!record.defName || _boolAttribute(record.node, 'Abstract') === true) continue;
    const aptitudeOffset = _numberDirect(record.node, 'aptitudeOffset');
    _storeDefinition(sourceOperations.geneTemplates, record.defName, {
      defName: record.defName, definitionKind: 'GeneTemplateDef', aptitudeOffset,
      generatedGeneRequired: true, aptitudeCompleteness: 'partial',
      _completeness: aptitudeOffset == null ? 'partial' : 'complete',
      _completenessReasons: aptitudeOffset == null ? ['missingAptitudeOffset'] : [],
      _provenance: provenanceFor(record),
    });
  }

  const hediffDoc = docFor(input.allHediffsXml);
  for (const record of activeNodeRecords(hediffDoc, 'HediffDef', 'HediffDef')) {
    if (!record.defName || _boolAttribute(record.node, 'Abstract') === true) continue;
    const aptitudes = parseTargetMap(record.node, 'aptitudes', 'level');
    const stagesContainer = _directChild(record.node, 'stages');
    const stageNodes = stagesContainer ? _directChildren(stagesContainer, 'li') : [];
    const stages = stageNodes.map((stage, stageOrder) => ({
      minSeverity: _numberDirect(stage, 'minSeverity') ?? 0,
      sourceOrder: stageOrder,
      statOffsets: publicStatOperations(parseTargetMap(stage, 'statOffsets', 'value'), 'statOffset'),
      statFactors: publicStatOperations(parseTargetMap(stage, 'statFactors', 'value'), 'statFactor'),
      statOffsetEffectMultiplier: _textDirect(stage, 'statOffsetEffectMultiplier') || null,
      statFactorEffectMultiplier: _textDirect(stage, 'statFactorEffectMultiplier') || null,
    }));
    _storeDefinition(sourceOperations.hediffs, record.defName, {
      def: record.defName, defName: record.defName,
      aptitudes: publicAptitudes(aptitudes),
      aptitudeCompleteness: aptitudes.present ? 'complete' : 'complete',
      stages,
      _completeness: 'complete', _completenessReasons: [],
      _provenance: provenanceFor(record),
    });
  }

  const parseNeedList = (scope, field) => {
    const container = _directChild(scope, field);
    if (!container) return { present: false, inheritFalse: false, values: [] };
    return {
      present: true, inheritFalse: _boolAttribute(container, 'Inherit') === false,
      values: _directChildren(container, 'li').map((item, sourceOrder) => ({
        skillDefId: _textDirect(item, 'skill'),
        baseValue: _numberDirect(item, 'baseValue'),
        factorPerLevel: _numberDirect(item, 'factorPerLevel'),
        sourceOrder,
      })),
    };
  };
  const parseCapacityList = (scope, field) => {
    const container = _directChild(scope, field);
    if (!container) return { present: false, inheritFalse: false, values: [] };
    return {
      present: true, inheritFalse: _boolAttribute(container, 'Inherit') === false,
      values: _directChildren(container, 'li').map((item, sourceOrder) => ({
        capacityDefId: _textDirect(item, 'capacity'),
        scale: _numberDirect(item, 'scale'),
        weight: _numberDirect(item, 'weight'),
        max: _numberDirect(item, 'max'),
        allowedDefect: _numberDirect(item, 'allowedDefect'),
        setMax: _boolDirect(item, 'setMax'),
        sourceOrder,
      })),
    };
  };
  const parseDependencyList = (scope, field) => directList(scope, field);
  const parseCurve = scope => {
    const curve = _directChild(scope, 'postProcessCurve');
    if (!curve) return { present: false, value: null };
    const points = _directChild(curve, 'points');
    const values = points ? _directChildren(points, 'li').map((point, sourceOrder) => {
      const numbers = String(point.textContent || '').match(/-?\d*\.?\d+(?:[eE][+-]?\d+)?/g) || [];
      return { x: numbers.length > 0 ? Number(numbers[0]) : null,
        y: numbers.length > 1 ? Number(numbers[1]) : null, sourceOrder };
    }) : [];
    return { present: true, value: { points: values } };
  };
  const parseParts = scope => {
    const container = _directChild(scope, 'parts');
    if (!container) return { present: false, inheritFalse: false, values: [] };
    return {
      present: true, inheritFalse: _boolAttribute(container, 'Inherit') === false,
      values: _directChildren(container, 'li').map((item, sourceOrder) => {
        const classId = item.getAttribute('Class') || _textDirect(item, 'class') || null;
        const rawParameters = {};
        for (const child of _elementChildren(item)) {
          rawParameters[child.tagName] = String(child.textContent || '').trim();
        }
        return {
          classId, priority: _numberDirect(item, 'priority'), sourceOrder,
          support: supportedParts.has(classId) ? 'supported' : 'unsupported',
          rawParameters,
        };
      }),
    };
  };
  const statDoc = docFor(input.statDefsXml);
  const statRaw = [];
  const scalarFields = [
    'workerClass', 'defaultBaseValue', 'noSkillOffset', 'noSkillFactor',
    'minValue', 'maxValue', 'roundToFiveOver', 'roundValue', 'scenarioRandomizable',
  ];
  for (const record of activeNodeRecords(statDoc, 'StatDef', 'StatDef')) {
    const node = record.node;
    const fields = { _present: {} };
    for (const field of scalarFields) {
      const element = _directChild(node, field);
      fields._present[field] = !!element;
      if (field === 'workerClass') fields[field] = _textDirect(node, field);
      else if (field === 'roundValue' || field === 'scenarioRandomizable') {
        fields[field] = _boolDirect(node, field);
      } else fields[field] = _numberDirect(node, field);
    }
    fields.skillNeedOffsets = parseNeedList(node, 'skillNeedOffsets');
    fields.skillNeedFactors = parseNeedList(node, 'skillNeedFactors');
    fields.capacityOffsets = parseCapacityList(node, 'capacityOffsets');
    fields.capacityFactors = parseCapacityList(node, 'capacityFactors');
    fields.statFactors = parseDependencyList(node, 'statFactors');
    fields.postProcessStatFactors = parseDependencyList(node, 'postProcessStatFactors');
    fields.postProcessCurve = parseCurve(node);
    fields.parts = parseParts(node);
    statRaw.push({
      defName: record.defName || null,
      abstractName: record.abstractName,
      parentName: node.getAttribute('ParentName') || null,
      isAbstract: _boolAttribute(node, 'Abstract') === true,
      rawFields: fields,
      _completeness: 'complete', _completenessReasons: [],
      _provenance: provenanceFor(record),
    });
  }
  const resolvedStats = _resolveInheritance(statRaw, (parent, child) => {
    const merged = { _present: Object.assign({}, parent._present || {}, child._present || {}) };
    for (const field of scalarFields) {
      merged[field] = child._present && child._present[field] ? child[field] : parent[field];
    }
    for (const field of ['skillNeedOffsets', 'skillNeedFactors', 'capacityOffsets',
      'capacityFactors', 'statFactors', 'postProcessStatFactors', 'parts']) {
      merged[field] = mergeList(parent[field], child[field]);
    }
    merged.postProcessCurve = child.postProcessCurve && child.postProcessCurve.present
      ? child.postProcessCurve : parent.postProcessCurve;
    return merged;
  });
  const statDefs = {};
  for (const definition of resolvedStats) {
    const dependencyUncertainty = reasonsFor('StatDef', definition.defName, 'dependencies');
    const capacityUncertainty = reasonsFor('StatDef', definition.defName, 'capacities');
    const skillUncertainty = reasonsFor('StatDef', definition.defName, 'skillNeeds');
    const finalizationUncertainty = reasonsFor('StatDef', definition.defName, 'finalization');
    const dependencies = (definition.statFactors && definition.statFactors.values || [])
      .map((statDefId, sourceOrder) => ({
        statDefId, phase: 'statFactorDependency', sourceOrder,
        uncertainty: dependencyUncertainty.slice(),
      }));
    const postDependencies = (definition.postProcessStatFactors
      && definition.postProcessStatFactors.values || []).map((statDefId, sourceOrder) => ({
        statDefId, phase: 'postProcessStatFactorDependency', sourceOrder,
        uncertainty: dependencyUncertainty.slice(),
      }));
    const generalReasons = reasonsFor('StatDef', definition.defName, 'fields');
    _storeDefinition(statDefs, definition.defName, {
      defName: definition.defName,
      supported: supportedStats.has(definition.defName),
      recordOnly: !supportedStats.has(definition.defName),
      workerClassId: definition.workerClass || null,
      defaultBaseValue: definition.defaultBaseValue,
      noSkillOffset: definition.noSkillOffset,
      noSkillFactor: definition.noSkillFactor,
      minValue: definition.minValue,
      maxValue: definition.maxValue,
      roundToFiveOver: definition.roundToFiveOver,
      roundValue: definition.roundValue,
      scenarioRandomizable: definition.scenarioRandomizable,
      skillNeedOffsets: (definition.skillNeedOffsets && definition.skillNeedOffsets.values || []).slice(),
      skillNeedFactors: (definition.skillNeedFactors && definition.skillNeedFactors.values || []).slice(),
      capacityOffsets: (definition.capacityOffsets && definition.capacityOffsets.values || []).slice(),
      capacityFactors: (definition.capacityFactors && definition.capacityFactors.values || []).slice(),
      dependencies,
      postProcessStatFactors: postDependencies.map(item => item.statDefId),
      postProcessDependencies: postDependencies,
      postProcessCurve: definition.postProcessCurve && definition.postProcessCurve.value,
      parts: (definition.parts && definition.parts.values || []).slice(),
      phaseCompleteness: {
        base: generalReasons.length ? 'partial' : 'complete',
        skillNeeds: skillUncertainty.length ? 'partial' : 'complete',
        capacities: capacityUncertainty.length ? 'partial' : 'complete',
        dependencies: dependencyUncertainty.length ? 'partial' : 'complete',
        finalization: generalReasons.length || finalizationUncertainty.length ? 'partial' : 'complete',
      },
      _completeness: generalReasons.length || dependencyUncertainty.length
        || capacityUncertainty.length || skillUncertainty.length
        || finalizationUncertainty.length ? 'partial' : definition._completeness,
      _completenessReasons: _uniqueStrings((definition._completenessReasons || [])
        .concat(generalReasons, dependencyUncertainty, capacityUncertainty,
          skillUncertainty, finalizationUncertainty)),
      _provenance: definition._provenance,
    });
  }

  const facets = { workGivers: {}, recipes: {}, jobDefs: {} };
  const facetDoc = docFor(input.facetDefsXml);
  for (const record of activeNodeRecords(facetDoc, 'WorkGiverDef', 'WorkGiverDef')) {
    if (!record.defName || _boolAttribute(record.node, 'Abstract') === true) continue;
    _storeDefinition(facets.workGivers, record.defName, {
      defName: record.defName,
      workTypeDefId: _textDirect(record.node, 'workType'),
      giverClassId: _textDirect(record.node, 'giverClass'),
      jobDefId: _textDirect(record.node, 'jobDef'),
      semanticBinding: null,
      _completeness: 'complete', _completenessReasons: [],
      _provenance: provenanceFor(record),
    });
  }
  for (const record of activeNodeRecords(facetDoc, 'RecipeDef', 'RecipeDef')) {
    if (!record.defName || _boolAttribute(record.node, 'Abstract') === true) continue;
    const statDefIds = _uniqueStrings([
      _textDirect(record.node, 'workSpeedStat'),
      _textDirect(record.node, 'efficiencyStat'),
      _textDirect(record.node, 'workTableEfficiencyStat'),
    ]);
    const workSkillDefIds = _uniqueStrings([_textDirect(record.node, 'workSkill')]);
    _storeDefinition(facets.recipes, record.defName, {
      defName: record.defName,
      workerClassId: _textDirect(record.node, 'workerClass'),
      statDefIds, workSkillDefIds, semanticBinding: null,
      _completeness: 'complete', _completenessReasons: [],
      _provenance: provenanceFor(record),
    });
  }
  for (const record of activeNodeRecords(facetDoc, 'JobDef', 'JobDef')) {
    if (!record.defName || _boolAttribute(record.node, 'Abstract') === true) continue;
    _storeDefinition(facets.jobDefs, record.defName, {
      defName: record.defName,
      driverClassId: _textDirect(record.node, 'driverClass'),
      semanticBinding: null,
      _completeness: 'complete', _completenessReasons: [],
      _provenance: provenanceFor(record),
    });
  }

  const passions = {};
  const passionDoc = docFor(input.passionDefsXml);
  const passionNodes = passionDoc && passionDoc.getElementsByTagName
    ? passionDoc.getElementsByTagName('VSE.Passions.PassionDef') : [];
  for (let index = 0; index < passionNodes.length; index++) {
    const node = passionNodes[index];
    if (_boolAttribute(node, 'Abstract') === true) continue;
    const defName = _textDirect(node, 'defName');
    if (!defName) continue;
    const rawFields = {};
    for (const child of _elementChildren(node)) {
      if (child.tagName === 'defName') continue;
      rawFields[child.tagName] = String(child.textContent || '').trim();
    }
    _storeDefinition(passions, defName, {
      defName, providerClassId: node.tagName,
      rawFields, semantics: null,
      providerFingerprint: opts.providerFingerprint || null,
      runtimeFingerprint: opts.runtimeFingerprint || null,
      _completeness: opts.providerFingerprint ? 'partial' : 'unknown',
      _completenessReasons: ['unsupportedPassionSemantics'],
      _provenance: _definitionProvenance(opts, index, defName),
    });
  }

  const activeComplete = active.completeness === 'complete';
  const skillDatasetReasons = reasonsFor('SkillDef', null, 'catalogue');
  return {
    schemaVersion: 1,
    pawnIndependent: true,
    runtimeFingerprint: opts.runtimeFingerprint || null,
    providerFingerprint: opts.providerFingerprint || null,
    activePackageResolution: {
      ids: Array.from(activeIds), completeness: active.completeness || 'unknown',
      reasons: Array.isArray(active.reasons) ? active.reasons.slice() : [],
    },
    catalogueCompleteness: {
      skillDefs: activeComplete && !skillDatasetReasons.length ? 'complete' : 'partial',
      statDefs: activeComplete ? 'complete' : 'partial',
      sourceOperations: activeComplete ? 'complete' : 'partial',
      facets: activeComplete ? 'complete' : 'partial',
      passions: activeComplete && opts.providerFingerprint ? 'partial' : 'unknown',
    },
    skillDefs,
    sourceOperations,
    statDefs,
    facets,
    passions,
    relevantPatchNotApplied: JSON.parse(JSON.stringify(uncertainty)),
  };
}

function resolveC4ActivePackageIds(importMeta) {
  if (!importMeta || !Array.isArray(importMeta.modIds)) {
    return { ids: ['ludeon.rimworld'], completeness: 'unknown', reasons: ['missingTargetSaveModList'] };
  }
  const ids = [];
  const add = value => {
    const id = String(value || '').trim().toLowerCase();
    if (id && ids.indexOf(id) < 0) ids.push(id);
  };
  add('ludeon.rimworld');
  if (importMeta.royalty) add('ludeon.rimworld.royalty');
  if (importMeta.ideology) add('ludeon.rimworld.ideology');
  if (importMeta.biotech) add('ludeon.rimworld.biotech');
  for (const modId of importMeta.modIds) add(modId);
  return { ids, completeness: 'complete', reasons: [] };
}

// Parent index for each body part (depth-first tree). -1 = root (torso).
// Used to detect redundant "missing" entries (e.g. right hand missing → skip right fingers).
const HUMAN_BODY_PARENT = [
  /* 0  torso            */ -1,
  /* 1  ribcage          */  0,
  /* 2  sternum          */  0,
  /* 3  pelvis           */  0,
  /* 4  spine            */  0,
  /* 5  stomach          */  0,
  /* 6  heart            */  0,
  /* 7  left lung        */  0,
  /* 8  right lung       */  0,
  /* 9  left kidney      */  0,
  /* 10 right kidney     */  0,
  /* 11 liver            */  0,
  /* 12 neck             */  0,
  /* 13 head             */ 12,
  /* 14 skull            */ 13,
  /* 15 brain            */ 14,
  /* 16 left eye         */ 13,
  /* 17 right eye        */ 13,
  /* 18 left ear         */ 13,
  /* 19 right ear        */ 13,
  /* 20 nose             */ 13,
  /* 21 jaw              */ 13,
  /* 22 tongue           */ 21,
  /* 23 left shoulder    */  0,
  /* 24 left clavicle    */ 23,
  /* 25 left arm         */ 23,
  /* 26 left humerus     */ 25,
  /* 27 left radius      */ 25,
  /* 28 left hand        */ 25,
  /* 29 left pinky       */ 28,
  /* 30 left ring finger */ 28,
  /* 31 left mid. finger */ 28,
  /* 32 left index finger*/ 28,
  /* 33 left thumb       */ 28,
  /* 34 right shoulder   */  0,
  /* 35 right clavicle   */ 34,
  /* 36 right arm        */ 34,
  /* 37 right humerus    */ 36,
  /* 38 right radius     */ 36,
  /* 39 right hand       */ 36,
  /* 40 right pinky      */ 39,
  /* 41 right ring finger*/ 39,
  /* 42 right mid. finger*/ 39,
  /* 43 right index fngr */ 39,
  /* 44 right thumb      */ 39,
  /* 45 waist            */  0,
  /* 46 left leg         */  0,
  /* 47 left femur       */ 46,
  /* 48 left tibia       */ 46,
  /* 49 left foot        */ 46,
  /* 50 left little toe  */ 49,
  /* 51 left fourth toe  */ 49,
  /* 52 left middle toe  */ 49,
  /* 53 left second toe  */ 49,
  /* 54 left big toe     */ 49,
  /* 55 right leg        */  0,
  /* 56 right femur      */ 55,
  /* 57 right tibia      */ 55,
  /* 58 right foot       */ 55,
  /* 59 right little toe */ 58,
  /* 60 right fourth toe */ 58,
  /* 61 right middle toe */ 58,
  /* 62 right second toe */ 58,
  /* 63 right big toe    */ 58,
];

// ── PAWN RELATION DEFS ──────────────────────────────────────────────────
// Sourced from Core/Defs/PawnRelationDefs. opinion and romanceChanceFactor
// match the game's XML values. category groups them for display/colour.
const RELATION_DEFS = [
  // Family by choice (romance)
  { def: 'Spouse',   label: 'husband',  labelFemale: 'wife',     category: 'romance', opinion: 30,  romanceFactor: 0,    colour: '#e85d8a', importance: 210, reflexive: true },
  { def: 'Fiance',   label: 'fiance',   labelFemale: 'fiancee',  category: 'romance', opinion: 35,  romanceFactor: 0,    colour: '#e87da0', importance: 205, reflexive: true },
  { def: 'Lover',    label: 'lover',    labelFemale: 'lover',    category: 'romance', opinion: 35,  romanceFactor: 0,    colour: '#e8a0b8', importance: 200, reflexive: true },
  { def: 'ExSpouse', label: 'ex-husband', labelFemale: 'ex-wife', category: 'ex',     opinion: -15, romanceFactor: 0,    colour: '#8a5d6d', importance: 130, reflexive: true },
  { def: 'ExLover',  label: 'ex-lover', labelFemale: 'ex-lover', category: 'ex',      opinion: -15, romanceFactor: 0,    colour: '#7a5060', importance: 125, reflexive: true },
  // Family by blood
  { def: 'Parent',   label: 'father',   labelFemale: 'mother',   category: 'blood',   opinion: 30,  romanceFactor: 0.03, colour: '#5d8ae8', importance: 195, reflexive: false },
  { def: 'Child',    label: 'son',      labelFemale: 'daughter',  category: 'blood',   opinion: 30,  romanceFactor: 0.03, colour: '#5da0e8', importance: 190, reflexive: false },
  { def: 'Sibling',  label: 'brother',  labelFemale: 'sister',    category: 'blood',   opinion: 20,  romanceFactor: 0.03, colour: '#7db0e8', importance: 185, reflexive: false },
  { def: 'HalfSibling', label: 'half-brother', labelFemale: 'half-sister', category: 'blood', opinion: 15, romanceFactor: 0.1, colour: '#90b8e0', importance: 170, reflexive: false },
  { def: 'Grandparent', label: 'grandfather', labelFemale: 'grandmother', category: 'blood', opinion: 15, romanceFactor: 0.03, colour: '#a0c0e0', importance: 160, reflexive: false },
  { def: 'Grandchild',  label: 'grandson', labelFemale: 'granddaughter', category: 'blood', opinion: 15, romanceFactor: 0.03, colour: '#a0c8e8', importance: 155, reflexive: false },
  { def: 'UncleOrAunt', label: 'uncle',  labelFemale: 'aunt',     category: 'blood',   opinion: 10,  romanceFactor: 0.03, colour: '#b0c8d8', importance: 150, reflexive: false },
  { def: 'NephewOrNiece', label: 'nephew', labelFemale: 'niece',  category: 'blood',   opinion: 10,  romanceFactor: 0.03, colour: '#b0d0e0', importance: 145, reflexive: false },
  { def: 'Cousin',   label: 'cousin',   labelFemale: 'cousin',   category: 'blood',   opinion: 5,   romanceFactor: 0.5,  colour: '#c0d8e8', importance: 140, reflexive: false },
  { def: 'CousinOnceRemoved', label: 'cousin once removed', labelFemale: 'cousin once removed', category: 'blood', opinion: 5, romanceFactor: 0.5, colour: '#c8dce8', importance: 135, reflexive: false },
  { def: 'SecondCousin', label: 'second cousin', labelFemale: 'second cousin', category: 'blood', opinion: 5, romanceFactor: 0.7, colour: '#d0e0e8', importance: 130, reflexive: false },
  { def: 'Kin',      label: 'kin',      labelFemale: 'kin',      category: 'blood',   opinion: 5,   romanceFactor: 0.5,  colour: '#d8e4ec', importance: 90,  reflexive: false },
  // Other
  { def: 'Bond',     label: 'bonded',   labelFemale: 'bonded',   category: 'other',   opinion: 0,   romanceFactor: 0,    colour: '#e8c85d', importance: 80,  reflexive: false },
];

// Trait-based social opinion modifiers (situational thoughts).
// These are constant opinion effects one pawn has on another based on the OTHER pawn's traits.
// Sourced from Thoughts_Situation_Social.xml and trait-specific ThoughtWorkers.
const TRAIT_OPINION_EFFECTS = [
  // { trait on OTHER pawn } => opinion offset the OBSERVER feels
  { traitDef: 'AnnoyingVoice', opinion: -25, label: 'annoying voice' },
  { traitDef: 'CreepyBreathing', opinion: -20, label: 'creepy breathing' },
  // Beauty spectrum (PawnBeauty stat): -2 = staggeringly ugly, -1 = ugly, +1 = pretty, +2 = beautiful
  { traitDef: 'Beauty', degree: -2, opinion: -40, label: 'physically hideous' },
  { traitDef: 'Beauty', degree: -1, opinion: -20, label: 'physically unsightly' },
  { traitDef: 'Beauty', degree:  1, opinion:  20, label: 'physically attractive' },
  { traitDef: 'Beauty', degree:  2, opinion:  40, label: 'physically stunning' },
  // Kind nullifies ugly opinion (ThoughtWorker_Ugly.nullifyingTraits includes Kind)
];

// Trait social fight chance multipliers
// Sourced from Traits_Singular.xml degreeDatas socialFightChanceFactor
const TRAIT_FIGHT_FACTORS = {
  'Brawler':   4.0,
  'Bloodlust': 2.0,
  'Abrasive':  2.0,
  'Kind':      0.01,
};

// Resolve a backstory by its identifier (defName). Returns { skills: {appSkillId: bonus}, incapable: [appIncapId] }
function resolveBackstory(id) {
  if (!id) return null;
  const bs = BACKSTORIES.find(b => b.id === id);
  if (!bs) return null;
  const skills = {};
  for (const [xmlName, val] of Object.entries(bs.skills)) {
    const appId = BACKSTORY_SKILL_MAP[xmlName];
    if (appId) skills[appId] = val;
  }
  const incapable = bs.workDisables.map(tag => WORKTAG_TO_INCAP[tag]).filter(Boolean);
  return {
    id: bs.id,
    slot: bs.slot,
    title: bs.title,
    titleShort: bs.titleShort,
    skills,
    incapable,
    disabledWorkTagsExact: bs.workDisables.slice(),
  };
}

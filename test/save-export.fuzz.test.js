/**
 * Save-export (.rws round-trip writer) fuzz test.
 *
 * Drives App._locatePawnBlock / _applySkillEditsToBlock / buildEditedSaveText against
 * synthesized colonist <thing> blocks containing a random mix of vanilla skills,
 * MODDED skill defs, and MODDED passion strings (e.g. "Apathy", "Natural"), plus
 * omitted-default nodes (Scribe drops level 0 / passion None). Then it applies random
 * user edits and asserts:
 *
 *   1. Correctness: a vanilla skill the user edited has its level/passion written. The
 *      app keys skills by internal id (Shooting -> shoot, Intellectual -> intel), so
 *      the writer must map the file's <def> through mapSkillDefToId (the regression that
 *      shipped: it compared the raw def name and silently wrote nothing).
 *   2. Mod safety: anything the user did NOT edit is preserved byte-for-byte, including
 *      modded passions AND modded skill defs (which map to no internal id). A pawn with
 *      no edits round-trips to an identical block.
 *   3. Structure: the <thing> open/close balance never changes, no "$1" leakage, and
 *      the skills <li> count is preserved.
 *   4. Location: _locatePawnBlock returns a depth-balanced block (nested carried things
 *      do not end it early).
 *
 * Pure logic, no save file or DOM needed, so it always runs.
 */
const { loadScripts } = require('./_harness');

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VANILLA_SKILLS = ['Shooting', 'Melee', 'Construction', 'Mining', 'Cooking',
  'Plants', 'Animals', 'Crafting', 'Artistic', 'Medicine', 'Social', 'Intellectual'];
const MODDED_SKILLS = ['VSE_Survival', 'SomeMod.Spellcasting', 'RG_Sailing'];
const MODDED_PASSIONS = ['Apathy', 'Natural', 'Critical', 'VSE_Burning'];

const bucketOf = (str) => (str === 'Minor' ? 1 : str === 'Major' ? 2 : 0);

function parseSkillLi(li) {
  const def = (li.match(/<def>([^<]+)<\/def>/) || [])[1];
  const lm = li.match(/<level>([^<]*)<\/level>/);
  const level = lm ? (parseInt(lm[1], 10) || 0) : 0;
  const passStr = (li.match(/<passion>([^<]*)<\/passion>/) || [])[1] || '';
  return { def, level, passStr };
}
function skillLisOf(block) {
  const m = block.match(/<skills>\s*<skills>([\s\S]*?)<\/skills>/);
  if (!m) return [];
  return m[1].match(/<li\b[^>]*>[\s\S]*?<\/li>/g) || [];
}

module.exports = function run() {
  const ctx = loadScripts(['data.js', 'app-save.js'], { App: {}, document: undefined, window: undefined });
  const App = ctx.App;

  // Faithful copy of app-pawns.js mapSkillDefToId (that file isn't loaded here). The
  // parser/writer call it on the LOWERCASED def, so the model must use the same map.
  const SKILLS = ctx.SKILLS || [];
  App.mapSkillDefToId = function (def) {
    if (!def) return null;
    const mapping = { shooting: 'shoot', melee: 'melee', construction: 'construct', mining: 'mine',
      cooking: 'cook', plants: 'plant', animals: 'animal', crafting: 'craft', artistic: 'art',
      medicine: 'medicine', social: 'social', intellectual: 'intel' };
    return mapping[def] || (SKILLS.find(s => s.name.toLowerCase() === def || s.id === def) || {}).id || null;
  };
  const sidOf = (def) => App.mapSkillDefToId(String(def).toLowerCase());

  let failures = 0, total = 0;
  const fail = (m) => { failures++; if (failures <= 40) console.log('  FAIL', m); };
  const check = (cond, m) => { total++; if (!cond) fail(m); };

  // -- Direct regression: the exact reported case (Shooting set to 20). --
  {
    const block = `<thing Class="Pawn"><def>Human</def><id>HumanR</id>` +
      `<skills><skills><li><def>Shooting</def><level>3</level><xpSinceLastLevel>10</xpSinceLastLevel></li>` +
      `<li><def>Intellectual</def><level>7</level></li></skills></skills></thing>`;
    App.state = { pawns: [{ loadID: 'HumanR', name: 'R', skills: { shoot: 20, intel: 7 }, passions: { shoot: 2, intel: 0 } }] };
    const out = App.buildEditedSaveText(`<things>${block}</things>`).text;
    check(/<def>Shooting<\/def><level>20<\/level>/.test(out), '[regression] Shooting level not written as 20');
    check(/<def>Shooting<\/def><level>20<\/level><xpSinceLastLevel>/.test(out) || /<level>20<\/level>[\s\S]*?<passion>Major<\/passion>/.test(out), '[regression] Shooting passion not added');
    check(/<def>Intellectual<\/def><level>7<\/level>/.test(out), '[regression] unedited Intellectual changed');
  }

  // -- Modded (VSE) passion round-trip via passionDefs: lossless preserve + picker. --
  {
    const block = `<thing Class="Pawn"><def>Human</def><id>HumanS</id>` +
      `<skills><skills>` +
      `<li><def>Shooting</def><level>5</level><passion>Minor</passion></li>` +
      `<li><def>Social</def><level>8</level><passion>AS_CompetitivePassion</passion></li>` +
      `</skills></skills></thing>`;
    const wrap = (b) => `<things>${b}</things>`;
    const mkState = (socialPass) => ({ pawns: [{ loadID: 'HumanS', name: 'S',
      skills: { shoot: 5, social: 8 }, passions: { shoot: 1, social: 0 },
      passionDefs: { shoot: 'Minor', social: socialPass } }] });

    // A) Untouched modded passion is preserved byte-for-byte (so is the vanilla one).
    App.state = mkState('AS_CompetitivePassion');
    const outA = App.buildEditedSaveText(wrap(block)).text;
    check(/<def>Social<\/def><level>8<\/level><passion>AS_CompetitivePassion<\/passion>/.test(outA), '[passion] unchanged modded passion preserved');
    check(/<def>Shooting<\/def><level>5<\/level><passion>Minor<\/passion>/.test(outA), '[passion] unchanged vanilla passion preserved');

    // B) Picker assigns a different modded passion -> its defName is written.
    App.state = mkState('AS_FrozenPassion');
    const outB = App.buildEditedSaveText(wrap(block)).text;
    check(/<def>Social<\/def><level>8<\/level><passion>AS_FrozenPassion<\/passion>/.test(outB), '[passion] picker writes new modded defName');
    check(!/AS_CompetitivePassion/.test(outB), '[passion] old modded passion fully replaced');

    // C) Switching a modded passion to a vanilla tier writes the vanilla value.
    App.state = mkState('Major');
    const outC = App.buildEditedSaveText(wrap(block)).text;
    check(/<def>Social<\/def><level>8<\/level><passion>Major<\/passion>/.test(outC), '[passion] modded replaced by vanilla Major');

    // D) Clearing to None removes the passion node entirely (vanilla scribe shape).
    App.state = mkState('None');
    const outD = App.buildEditedSaveText(wrap(block)).text;
    check(!/<def>Social<\/def><level>8<\/level><passion>/.test(outD), '[passion] cleared modded passion removes the node');
    check(!/AS_CompetitivePassion/.test(outD), '[passion] cleared modded passion gone from output');
  }

  // C5 raw SkillRecord facts survive project normalisation without being
  // rebuilt from the app's fixed skill map or passion buckets.
  {
    const parsed = App._parseRawSkillRecords(
      `<li><def>Shooting</def><level>0</level><passion>Major</passion></li>`
      + `<li><def>Cooking</def><level>20</level></li>`
      + `<li><def>Mining</def><passion>Minor</passion></li>`
      + `<li><def>ModdedSkill</def><level>bad</level><passion>VSE_Apathy</passion></li>`,
      { sourcePath: 'test' }
    );
    check(parsed.records.Shooting.levelInt === 0
      && parsed.records.Cooking.levelInt === 20
      && parsed.records.Mining.levelFieldPresent === false
      && parsed.records.Mining.levelInt === 0,
    '[c5 raw skill] parser preserves zero, twenty, and omitted level default');
    check(parsed.records.Cooking.passionFieldPresent === false
      && parsed.records.Cooking.rawPassionIdentity === 'None'
      && parsed.records.ModdedSkill.levelState === 'unknown'
      && parsed.records.ModdedSkill.rawPassionIdentity === 'VSE_Apathy',
    '[c5 raw skill] parser preserves passion defaults, malformed level, and mod identity');
    check(App._parseRawSkillRecords(null, {}).catalogue.completeness === 'unknown'
      && !Object.prototype.hasOwnProperty.call(parsed.records, 'Animals'),
    '[c5 raw skill] missing scope stays unknown and fixed skills are not fabricated');

    const pawn = {
      id: 'raw-skill-pawn', name: 'Raw Skill Pawn', skills: { shoot: 0 },
      passions: { shoot: 0 }, rawSkillRecords: {
        Shooting: {
          skillDefId: 'Shooting', appSkillId: 'shoot', recordPresence: 'present',
          levelFieldPresent: true, levelState: 'known', levelInt: 0,
          passionFieldPresent: true, rawPassionIdentity: 'VSE_Apathy',
          parserCompleteness: 'complete', provenance: { sourceKind: 'saveSkillRecord' },
        },
      },
      skillRecordCatalogue: {
        presence: 'present', completeness: 'complete',
        provenance: { sourceKind: 'saveSkillTracker' },
      },
    };
    App._coercePawn(pawn, 0);
    check(pawn.rawSkillRecords.Shooting.rawPassionIdentity === 'VSE_Apathy'
      && pawn.rawSkillRecords.Shooting.recordPresence === 'present',
    '[c5 raw skill] project normalisation preserves exact raw record');
    check(Object.keys(pawn.rawSkillRecords).length === 1
      && pawn.skillRecordCatalogue.completeness === 'complete'
      && !JSON.stringify(pawn.rawSkillRecords).includes('runtimeDefaulted'),
    '[c5 raw skill] normalisation does not fabricate fixed-catalogue records');
  }

  const ITER = 360;
  for (let it = 0; it < ITER; it++) {
    const rand = rng(0x51b3 + it * 2654435761);
    const ri = (n) => Math.floor(rand() * n);
    const pick = (arr) => arr[ri(arr.length)];

    const nPawns = 1 + ri(4);
    const pawns = [];
    const specs = [];
    const blocks = [];

    for (let p = 0; p < nPawns; p++) {
      const id = 'Human' + (10 + it * 10 + p);
      const used = new Set();
      const skills = [];
      const nSkills = 3 + ri(10);
      for (let s = 0; s < nSkills; s++) {
        const def = rand() < 0.8 ? pick(VANILLA_SKILLS) : pick(MODDED_SKILLS);
        if (used.has(def)) continue;
        used.add(def);
        const hasLevel = rand() < 0.85;
        const level = hasLevel ? ri(21) : 0;
        const pr = rand();
        const passStr = pr < 0.4 ? '' : pr < 0.6 ? 'Minor' : pr < 0.8 ? 'Major' : pick(MODDED_PASSIONS);
        skills.push({ def, hasLevel, level, passStr });
      }

      const lis = skills.map((sk, i) => {
        const attr = i % 3 === 0 ? ' Class="SkillRecord"' : '';
        let li = `<li${attr}><def>${sk.def}</def>`;
        if (sk.hasLevel) li += `<level>${sk.level}</level>`;
        if (rand() < 0.5) li += `<xpSinceLastLevel>${(rand() * 9000).toFixed(3)}</xpSinceLastLevel>`;
        if (sk.passStr) li += `<passion>${sk.passStr}</passion>`;
        return li + `</li>`;
      }).join('');

      // ~half the pawns carry Vanilla-Skills-Expanded's extra tracker fields right after
      // the SkillRecord list (this is exactly how VSE saves look). The writer must edit
      // the skills list yet leave these byte-for-byte.
      const vse = rand() < 0.5;
      const tail = vse
        ? `<lastXpSinceMidnightResetTimestamp>-1</lastXpSinceMidnightResetTimestamp><expertise><expertise /></expertise>`
        : '';
      const block =
        `<thing Class="Pawn"><def>Human</def><id>${id}</id>` +
        `<name><first>F${p}</first><nick>N${p}</nick><last>L${p}</last></name>` +
        `<skills><skills>${lis}</skills>${tail}</skills>` +
        `<inventory><innerContainer><innerList>` +
        `<thing Class="ThingWithComps"><def>DoorKey</def><id>DoorKey${p}</id></thing>` +
        `</innerList></innerContainer></inventory>` +
        `</thing>`;

      // App model, faithful to the parser: keyed by mapped internal id (vanilla only).
      const sk = {}, pa = {};
      const ground = skills.map(s => {
        const sid = sidOf(s.def);
        const origLevel = s.hasLevel ? s.level : 0;
        const origBucket = bucketOf(s.passStr);
        if (sid) { sk[sid] = origLevel; pa[sid] = origBucket; }
        return { def: s.def, sid, modded: !sid, origLevel, origPassStr: s.passStr, origBucket,
                 appLevel: origLevel, appBucket: origBucket };
      });

      const noEdits = rand() < 0.25;
      if (!noEdits) {
        for (const e of ground) {
          if (!e.sid) continue; // can't edit modded skills via the app
          if (rand() < 0.4) { e.appLevel = ri(21); sk[e.sid] = e.appLevel; }
          if (rand() < 0.4) { e.appBucket = ri(3); pa[e.sid] = e.appBucket; }
        }
      }

      pawns.push({ id, loadID: id, name: id, skills: sk, passions: pa });
      specs.push({ id, ground, noEdits, block, vse });
      blocks.push(block);
    }

    const filler = '<thing Class="Building"><def>Wall</def><id>Wall' + it + '</id></thing>';
    const doc = `<savegame><game><maps><li><things>` +
      filler + blocks.join(filler) + filler + `</things></li></maps></game></savegame>`;

    for (const sp of specs) {
      const loc = App._locatePawnBlock(doc, sp.id);
      if (!loc) { check(false, `[it${it}] locate failed for ${sp.id}`); continue; }
      const got = doc.slice(loc.start, loc.end);
      const opens = (got.match(/<thing\b/g) || []).length;
      const closes = (got.match(/<\/thing>/g) || []).length;
      check(opens === closes && opens >= 2, `[it${it}] ${sp.id} block not depth-balanced (o${opens}/c${closes})`);
    }

    App.state = { pawns };
    let built;
    try { built = App.buildEditedSaveText(doc); }
    catch (e) { check(false, `[it${it}] buildEditedSaveText threw: ${e.message}`); continue; }
    const out = built.text;

    check((out.match(/<thing\b/g) || []).length === (doc.match(/<thing\b/g) || []).length, `[it${it}] <thing open count changed`);
    check((out.match(/<\/thing>/g) || []).length === (doc.match(/<\/thing>/g) || []).length, `[it${it}] </thing> count changed`);
    check(!/\$1/.test(out), `[it${it}] "$1" leaked into output`);

    for (const sp of specs) {
      const loc = App._locatePawnBlock(out, sp.id);
      if (!loc) { check(false, `[it${it}] post-edit locate failed ${sp.id}`); continue; }
      const block = out.slice(loc.start, loc.end);

      if (sp.noEdits) check(block === sp.block, `[it${it}] ${sp.id} no-edit block changed`);

      // VSE tracker fields adjacent to the skills list must survive untouched.
      if (sp.vse) {
        check(block.includes('<lastXpSinceMidnightResetTimestamp>-1</lastXpSinceMidnightResetTimestamp>'), `[it${it}] ${sp.id} VSE timestamp lost`);
        check(block.includes('<expertise><expertise /></expertise>'), `[it${it}] ${sp.id} VSE expertise block disturbed`);
      }

      const lis = skillLisOf(block);
      check(lis.length === sp.ground.length, `[it${it}] ${sp.id} skill li count changed`);
      const byDef = {};
      for (const li of lis) { const ps = parseSkillLi(li); byDef[ps.def] = ps; }

      for (const e of sp.ground) {
        const ps = byDef[e.def];
        if (!ps) { check(false, `[it${it}] ${sp.id} skill ${e.def} missing`); continue; }
        if (e.modded) {
          // Unmappable (modded) skills must be untouched.
          check(ps.level === e.origLevel && ps.passStr === e.origPassStr,
            `[it${it}] ${sp.id} modded skill ${e.def} changed (lvl ${ps.level}/${e.origLevel}, pas "${ps.passStr}"/"${e.origPassStr}")`);
          continue;
        }
        check(ps.level === e.appLevel, `[it${it}] ${sp.id} ${e.def} level ${ps.level} != app ${e.appLevel}`);
        check(bucketOf(ps.passStr) === e.appBucket, `[it${it}] ${sp.id} ${e.def} bucket ${bucketOf(ps.passStr)} != app ${e.appBucket}`);
        // Mod safety: unedited passion bucket keeps any modded passion string verbatim.
        if (e.appBucket === e.origBucket && e.origBucket === 0 && e.origPassStr) {
          check(ps.passStr === e.origPassStr, `[it${it}] ${sp.id} ${e.def} modded passion "${e.origPassStr}" lost (got "${ps.passStr}")`);
        }
      }
    }

    App.state = { pawns };
    const built2 = App.buildEditedSaveText(out);
    check(built2.text === out, `[it${it}] second pass changed output (not idempotent)`);
  }

  // notFound path.
  total++;
  {
    const doc = `<things><thing Class="Pawn"><def>Human</def><id>HumanZ</id>` +
      `<skills><skills><li><def>Shooting</def><level>3</level></li></skills></skills></thing></things>`;
    App.state = { pawns: [
      { loadID: 'HumanZ', name: 'Z', skills: { shoot: 12 }, passions: { shoot: 2 } },
      { loadID: 'Ghost404', name: 'Ghost', skills: { shoot: 5 }, passions: { shoot: 0 } },
    ] };
    const b = App.buildEditedSaveText(doc);
    if (!(b.notFound.includes('Ghost') && /<level>12<\/level>/.test(b.text) && /<passion>Major<\/passion>/.test(b.text))) {
      fail('[notFound] ghost not reported or present pawn not edited');
    }
  }

  // ── Trait writer (_applyTraitEditsToBlock) ────────────────────────────────
  const VANILLA_TRAITS = [['Psychopath', 0], ['Beauty', 2], ['Beauty', -1], ['Nerves', -2],
    ['ShootingAccuracy', 1], ['Industriousness', 2], ['NightOwl', 0], ['Bloodlust', 0], ['Cannibal', 0]];
  const MODDED_TRAITS = [['VoidFascination', 0], ['VTE_Smoker', 0], ['ST_Childish', 0],
    ['VRE_Flirty', 0], ['SomeMod.Brave', 2]];
  const parseTraits = (s) => (s.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) || []).map(li => {
    const def = (li.match(/<def>([^<]+)<\/def>/) || [])[1];
    const dm = li.match(/<degree>(-?\d+)<\/degree>/);
    return { def, degree: dm ? parseInt(dm[1], 10) : 0 };
  });
  const traitsBodyOf = (block) => (block.match(/<allTraits>([\s\S]*?)<\/allTraits>/) || [])[1] || '';
  const hasT = (arr, t) => arr.some(x => x.def === t.def && x.degree === (parseInt(t.degree, 10) || 0));

  for (let it = 0; it < 220; it++) {
    const rand = rng(0x9e37 + it * 40503);
    const ri = (n) => Math.floor(rand() * n);
    const pick = (a) => a[ri(a.length)];

    const pool = [...VANILLA_TRAITS, ...MODDED_TRAITS];
    const existing = [];
    const used = new Set();
    const n = ri(6);
    for (let i = 0; i < n; i++) {
      const t = pick(pool); const key = t[0] + '|' + t[1];
      if (used.has(key)) continue; used.add(key);
      existing.push({ def: t[0], degree: t[1] });
    }
    const empty = existing.length === 0 && rand() < 0.5;
    const lis = existing.map(t =>
      `<li><def>${t.def}</def><sourceGene>null</sourceGene>${t.degree ? `<degree>${t.degree}</degree>` : ''}<suppressedBy>null</suppressedBy></li>`).join('');
    const traitsXml = empty ? `<traits><allTraits /></traits>` : `<traits><allTraits>${lis}</allTraits></traits>`;
    const block = `<thing Class="Pawn"><def>Human</def><id>HumanT${it}</id>${traitsXml}` +
      `<skills><skills></skills></skills></thing>`;

    const remove = existing.filter(() => rand() < 0.4);
    const addCands = pool.filter(t => !used.has(t[0] + '|' + t[1])).map(t => ({ def: t[0], degree: t[1] }));
    const add = addCands.filter(() => rand() < 0.3);

    let out;
    try { out = App._applyTraitEditsToBlock(block, { add, remove }); }
    catch (e) { check(false, `[trait it${it}] threw: ${e.message}`); continue; }
    const outList = parseTraits(traitsBodyOf(out));

    for (const r of remove) check(!hasT(outList, r), `[trait it${it}] removed ${r.def}/${r.degree} still present`);
    for (const e of existing) if (!hasT(remove, e)) check(hasT(outList, e), `[trait it${it}] kept ${e.def}/${e.degree} lost`);
    for (const a of add) check(hasT(outList, a), `[trait it${it}] added ${a.def}/${a.degree} missing`);
    check((out.match(/<thing\b/g) || []).length === (block.match(/<thing\b/g) || []).length, `[trait it${it}] thing balance changed`);
    check((out.match(/<allTraits>/g) || []).length <= 1, `[trait it${it}] duplicate allTraits`);
    // No edits -> identical block.
    if (!remove.length && !add.length) check(out === block, `[trait it${it}] no-op changed block`);
    // No double-add: each def+degree appears at most once.
    const seen = new Set();
    for (const t of outList) { const k = t.def + '|' + t.degree; check(!seen.has(k), `[trait it${it}] duplicate trait ${k}`); seen.add(k); }
  }

  // Nested carried pawn: the writer must target the LAST trait block (parser parity),
  // not the first, so it never edits the wrong pawn.
  total++;
  {
    const first = `<traits><allTraits><li><def>Cannibal</def></li></allTraits></traits>`;
    const lastInner = `<traits><allTraits><li><def>Psychopath</def></li></allTraits></traits>`;
    const nested = `<thing Class="Pawn"><def>Human</def><id>HN1</id>${first}` +
      `<carryTracker><innerContainer><innerList>` +
      `<thing Class="Pawn"><def>Human</def><id>HN2</id>${lastInner}</thing>` +
      `</innerList></innerContainer></carryTracker></thing>`;
    const out = App._applyTraitEditsToBlock(nested, { remove: [{ def: 'Psychopath', degree: 0 }], add: [{ def: 'Bloodlust', degree: 0 }] });
    if (!/<def>Cannibal<\/def>/.test(out)) fail('[nested] first-block trait wrongly removed');
    if (/<def>Psychopath<\/def>/.test(out)) fail('[nested] last-block trait not removed');
    if (!/<def>Bloodlust<\/def>/.test(out)) fail('[nested] add not applied to last block');
  }

  // ── Ideology certainty writer (_applyIdeoCertaintyToBlock) ────────────────
  for (let it = 0; it < 240; it++) {
    const rand = rng(0xc0ffee + it * 100003);
    const ri = (n) => Math.floor(rand() * n);
    const hasCert = rand() < 0.85;
    const origFloat = (ri(10000) / 10000);
    const origPct = Math.round(origFloat * 100);
    const appPct = ri(101);
    const appFloat = appPct / 100;
    const block = `<thing Class="Pawn"><def>Human</def><id>HumanC${it}</id>` +
      `<ideo><ideo>Ideo_${1 + ri(6)}</ideo><previousIdeos />` +
      (hasCert ? `<certainty>${origFloat}</certainty>` : '') +
      `<joinTick>123</joinTick></ideo></thing>`;

    // No certainty on the pawn model -> writer must do nothing.
    check(App._applyIdeoCertaintyToBlock(block, {}) === block, `[cert it${it}] no-model edit changed block`);

    const out = App._applyIdeoCertaintyToBlock(block, { ideoCertainty: appFloat });
    const cm = out.match(/<certainty>([\d.]+)<\/certainty>/);
    if (hasCert && origPct === appPct) {
      check(out === block, `[cert it${it}] unchanged-percent should preserve exact float`);
    } else {
      check(!!cm, `[cert it${it}] certainty missing after edit`);
      if (cm) check(Math.round(parseFloat(cm[1]) * 100) === appPct, `[cert it${it}] written pct ${Math.round(parseFloat(cm[1]) * 100)} != ${appPct}`);
    }
    // Structure: <ideo> tag balance and <thing> balance unchanged; exactly one certainty.
    check((out.match(/<ideo>/g) || []).length === (block.match(/<ideo>/g) || []).length, `[cert it${it}] <ideo> balance changed`);
    check((out.match(/<\/ideo>/g) || []).length === (block.match(/<\/ideo>/g) || []).length, `[cert it${it}] </ideo> balance changed`);
    check((out.match(/<certainty>/g) || []).length <= 1, `[cert it${it}] duplicate certainty`);
  }

  // Nested carried pawn: certainty edit must hit the FIRST ideo tracker (parity with the
  // importer, which reads certainty via a plain .match = first occurrence).
  total++;
  {
    const firstIdeo = `<ideo><ideo>Ideo_1</ideo><certainty>0.9</certainty></ideo>`;
    const nestedIdeo = `<ideo><ideo>Ideo_9</ideo><certainty>0.2</certainty></ideo>`;
    const nested = `<thing Class="Pawn"><def>Human</def><id>HC1</id>${firstIdeo}` +
      `<carryTracker><innerContainer><innerList>` +
      `<thing Class="Pawn"><def>Human</def><id>HC2</id>${nestedIdeo}</thing>` +
      `</innerList></innerContainer></carryTracker></thing>`;
    const out = App._applyIdeoCertaintyToBlock(nested, { ideoCertainty: 0.5 });
    if (!/<ideo>Ideo_1<\/ideo><certainty>0.5<\/certainty>/.test(out)) fail('[cert nested] first tracker not set to 0.5');
    if (!/<ideo>Ideo_9<\/ideo><certainty>0.2<\/certainty>/.test(out)) fail('[cert nested] nested tracker wrongly edited');
  }

  // ── Hediff writer (_applyHediffEditsToBlock) + depth-aware _topLevelLis ────
  for (let it = 0; it < 260; it++) {
    const rand = rng(0xbeef + it * 7919);
    const ri = (n) => Math.floor(rand() * n);
    const n = ri(7);
    const hediffs = [];
    for (let i = 0; i < n; i++) {
      const def = rand() < 0.6 ? ['Gunshot', 'Bruise', 'Burn', 'Cut', 'Scratch'][ri(5)] : ['VHE_ModWound', 'SomeMod.Disease'][ri(2)];
      const partIdx = rand() < 0.7 ? ri(40) : -1;
      const hasComps = rand() < 0.5; // nested <li>s that must NOT be split
      hediffs.push({ def, partIdx, hasComps, sev: (rand() * 2).toFixed(3) });
    }
    const liOf = (h) => {
      const part = h.partIdx >= 0 ? `<part><body>Human</body><index>${h.partIdx}</index></part>` : '';
      const comps = h.hasComps
        ? `<comps><li Class="HediffComp_GetsPermanent"><isPermanent>false</isPermanent></li><li Class="HediffComp_TendDuration"><tendTicksLeft>120</tendTicksLeft></li></comps>` : '';
      return `<li Class="Hediff_Injury"><def>${h.def}</def>${part}<severity>${h.sev}</severity>${comps}</li>`;
    };
    const empty = n === 0 && rand() < 0.5;
    const inner = hediffs.map(liOf).join('');
    const hediffsXml = empty ? `<hediffSet><hediffs /></hediffSet>` : `<hediffSet><hediffs>${inner}</hediffs></hediffSet>`;
    const block = `<thing Class="Pawn"><def>Human</def><id>HH${it}</id><healthTracker>${hediffsXml}</healthTracker></thing>`;

    const bodyParsed = (block.match(/<hediffs>([\s\S]*?)<\/hediffs>/) || [])[1] || '';
    check(App._topLevelLis(bodyParsed).length === hediffs.length, `[hediff it${it}] topLevelLis ${App._topLevelLis(bodyParsed).length} != ${hediffs.length}`);

    const remove = hediffs.map((_, i) => i).filter(() => rand() < 0.4);
    const adds = [];
    if (rand() < 0.5) adds.push({ def: 'Cut', hediffClass: 'Hediff_Injury', partIdx: ri(40), severity: (rand() * 5).toFixed(2) });
    if (rand() < 0.3) adds.push({ def: 'Flu', hediffClass: 'HediffWithComps', severity: 0.3 });

    let out;
    try { out = App._applyHediffEditsToBlock(block, { remove, add: adds }); }
    catch (e) { check(false, `[hediff it${it}] threw: ${e.message}`); continue; }

    const outBody = (out.match(/<hediffs>([\s\S]*?)<\/hediffs>/) || [])[1] || '';
    const outLis = App._topLevelLis(outBody);
    const expectKept = hediffs.filter((_, i) => !remove.includes(i));
    check(outLis.length === expectKept.length + adds.length, `[hediff it${it}] count ${outLis.length} != ${expectKept.length + adds.length}`);
    const outDefs = outLis.map(li => (li.match(/<def>([^<]+)<\/def>/) || [])[1]);
    expectKept.forEach((h, i) => check(outDefs[i] === h.def, `[hediff it${it}] kept order def ${outDefs[i]} != ${h.def}`));
    adds.forEach((a, i) => check(outDefs[expectKept.length + i] === a.def, `[hediff it${it}] added def ${a.def} missing/misplaced`));
    check((out.match(/<thing\b/g) || []).length === (block.match(/<thing\b/g) || []).length, `[hediff it${it}] thing balance`);
    check((out.match(/<hediffs>/g) || []).length <= 1, `[hediff it${it}] duplicate hediffs`);
    if (!remove.length && !adds.length) check(out === block, `[hediff it${it}] no-op changed block`);
  }

  // Modded-race body def: a part-bound add writes the op's body verbatim (not a
  // hardcoded "Human"), so a non-human pawn gets the right <body> on new parts.
  total++;
  {
    const block = `<thing Class="Pawn"><def>Mutant</def><id>HB1</id><healthTracker><hediffSet><hediffs /></hediffSet></healthTracker></thing>`;
    const out = App._applyHediffEditsToBlock(block, { remove: [], add: [
      { def: 'AS_MutantArm', hediffClass: 'Hediff_AddedPart', partIdx: 25, body: 'AlphaMutant_Body', severity: 1 },
    ] });
    check(/<part><body>AlphaMutant_Body<\/body><index>25<\/index><\/part>/.test(out), '[hediff body] modded body def not written through');
    check(!/<body>Human<\/body>/.test(out), '[hediff body] hardcoded Human leaked for a modded race');
  }

  // Nested carried pawn: hediff edit must hit the LAST hediffs block (parser parity).
  total++;
  {
    const carriedH = `<healthTracker><hediffSet><hediffs><li Class="Hediff_Injury"><def>Bruise</def></li></hediffs></hediffSet></healthTracker>`;
    const carrierH = `<healthTracker><hediffSet><hediffs><li Class="Hediff_Injury"><def>Gunshot</def></li><li Class="Hediff_Injury"><def>Burn</def></li></hediffs></hediffSet></healthTracker>`;
    const nested = `<thing Class="Pawn"><def>Human</def><id>HHN1</id>${carrierH}` +
      `<carryTracker><innerContainer><innerList><thing Class="Pawn"><def>Human</def><id>HHN2</id>${carriedH}</thing></innerList></innerContainer></carryTracker></thing>`;
    // Last block is the carried pawn's (one li). Remove index 0 there -> Bruise gone, carrier intact.
    const out = App._applyHediffEditsToBlock(nested, { remove: [0], add: [] });
    if (/<def>Bruise<\/def>/.test(out)) fail('[hediff nested] last-block hediff not removed');
    if (!/<def>Gunshot<\/def>/.test(out) || !/<def>Burn<\/def>/.test(out)) fail('[hediff nested] carrier hediffs wrongly changed');
  }

  // ── Relationship writer (_applyRelationEditsToBlock) ──────────────────────
  const REL_DEFS = ['Lover', 'Spouse', 'Fiance', 'ExLover', 'ExSpouse', 'Parent', 'Child', 'Bond', 'VRE_ModRel'];
  const REL_TARGETS = ['Thing_Human101', 'Thing_Human102', 'Thing_Human103', 'Thing_AA_Animal55'];
  const hasRel = (arr, r) => arr.some(x => x.def === r.def && x.otherPawn === r.otherPawn);
  for (let it = 0; it < 220; it++) {
    const rand = rng(0xd00d + it * 48611);
    const ri = (n) => Math.floor(rand() * n);
    const pick = (a) => a[ri(a.length)];
    const existing = [];
    const used = new Set();
    const n = ri(5);
    for (let i = 0; i < n; i++) {
      const def = pick(REL_DEFS), other = pick(REL_TARGETS), k = def + '|' + other;
      if (used.has(k)) continue; used.add(k); existing.push({ def, otherPawn: other });
    }
    const empty = existing.length === 0 && rand() < 0.5;
    const lis = existing.map(r => `<li><def>${r.def}</def><otherPawn>${r.otherPawn}</otherPawn></li>`).join('');
    const relXml = empty ? `<directRelations />` : `<directRelations>${lis}</directRelations>`;
    const block = `<thing Class="Pawn"><def>Human</def><id>HR${it}</id>${relXml}</thing>`;

    const remove = existing.filter(() => rand() < 0.4);
    const addCands = [];
    for (let k = 0; k < 3; k++) { const def = pick(REL_DEFS), other = pick(REL_TARGETS); if (!used.has(def + '|' + other)) addCands.push({ def, otherPawn: other }); }
    const add = addCands.filter(() => rand() < 0.5);

    let out;
    try { out = App._applyRelationEditsToBlock(block, { add, remove }); }
    catch (e) { check(false, `[rel it${it}] threw: ${e.message}`); continue; }
    const body = (out.match(/<directRelations>([\s\S]*?)<\/directRelations>/) || [])[1] || '';
    const outRels = (body.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) || []).map(li => ({
      def: (li.match(/<def>([^<]+)<\/def>/) || [])[1], otherPawn: (li.match(/<otherPawn>([^<]+)<\/otherPawn>/) || [])[1]
    }));
    for (const r of remove) check(!hasRel(outRels, r), `[rel it${it}] removed ${r.def}->${r.otherPawn} still present`);
    for (const e of existing) if (!hasRel(remove, e)) check(hasRel(outRels, e), `[rel it${it}] kept ${e.def}->${e.otherPawn} lost`);
    for (const a of add) check(hasRel(outRels, a), `[rel it${it}] added ${a.def}->${a.otherPawn} missing`);
    check((out.match(/<thing\b/g) || []).length === (block.match(/<thing\b/g) || []).length, `[rel it${it}] thing balance`);
    check((out.match(/<directRelations>/g) || []).length <= 1, `[rel it${it}] duplicate directRelations`);
    if (!remove.length && !add.length) check(out === block, `[rel it${it}] no-op changed block`);
    const seen = new Set();
    for (const r of outRels) { const k = r.def + '|' + r.otherPawn; check(!seen.has(k), `[rel it${it}] duplicate ${k}`); seen.add(k); }
  }

  // Nested carried pawn: relation edit must hit the LAST directRelations (parser parity).
  total++;
  {
    const first = `<directRelations><li><def>Lover</def><otherPawn>Thing_Human1</otherPawn></li></directRelations>`;
    const lastInner = `<directRelations><li><def>Spouse</def><otherPawn>Thing_Human2</otherPawn></li></directRelations>`;
    const nested = `<thing Class="Pawn"><def>Human</def><id>RN1</id>${first}` +
      `<carryTracker><innerContainer><innerList><thing Class="Pawn"><def>Human</def><id>RN2</id>${lastInner}</thing></innerList></innerContainer></carryTracker></thing>`;
    const out = App._applyRelationEditsToBlock(nested, { remove: [{ def: 'Spouse', otherPawn: 'Thing_Human2' }], add: [{ def: 'Bond', otherPawn: 'Thing_Human9' }] });
    if (/<def>Spouse<\/def>/.test(out)) fail('[rel nested] last-block relation not removed');
    if (!/<def>Lover<\/def>/.test(out)) fail('[rel nested] first-block relation wrongly removed');
    if (!/<def>Bond<\/def>/.test(out)) fail('[rel nested] add not applied to last block');
  }

  return { name: 'save export fuzz', failures, total };
};

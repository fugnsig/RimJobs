/** C4 requirement scanner/parser contracts. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadScripts } = require('./_harness');
const { DOMParserShim } = require('./_xml-dom-shim');

module.exports = function run() {
  let total = 0;
  let failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) { failures++; console.log('  FAIL ' + label); }
  };
  const ctx = loadScripts(['data.js'], { DOMParser: DOMParserShim });
  vm.runInContext([
    'globalThis._parseWorkTypes = parseWorkTypeDefsFromXML',
    'globalThis._parseWorkGivers = parseWorkGiverDefsFromXML',
    'globalThis._parseRaceWork = parseRaceWorkSettingsFromXML',
    'globalThis._resolvePackages = resolveC4ActivePackageIds',
  ].join(';'), ctx);

  const xml = [
    '<Defs>',
    '<WorkTypeDef Name="WorkBase" Abstract="True"><workTags>ManualDumb</workTags></WorkTypeDef>',
    '<WorkTypeDef ParentName="WorkBase"><defName>FixtureWork</defName><workTags>Hauling, AllWork</workTags></WorkTypeDef>',
    '<WorkTypeDef><defName>ZeroTagWork</defName></WorkTypeDef>',
    '<WorkGiverDef><defName>ZeroPath</defName><workType>FixtureWork</workType><priorityInType>12</priorityInType><giverClass>Custom.Giver</giverClass></WorkGiverDef>',
    '<WorkGiverDef><defName>CapacityPath</defName><workType>FixtureWork</workType><requiredCapacities><li>Manipulation</li><li>Talking</li></requiredCapacities></WorkGiverDef>',
    '<ThingDef Name="RaceBase" Abstract="True"><race><lifeStageWorkSettings><Hauling>3</Hauling><Fishing>7</Fishing></lifeStageWorkSettings></race></ThingDef>',
    '<ThingDef ParentName="RaceBase"><defName>DefinitionRace</defName><race><lifeStageWorkSettings><Fishing>9</Fishing><Research>13</Research></lifeStageWorkSettings></race></ThingDef>',
    '</Defs>',
  ].join('');

  const workTypes = ctx._parseWorkTypes(xml, { modId: 'fixture.active' });
  ok(workTypes.FixtureWork.workTags.join(',') === 'Hauling,AllWork',
    'RS-001 explicit child WorkTags replace the inherited enum-flags value');
  ok(workTypes.FixtureWork.workTagsCompleteness === 'complete',
    'RS-002 complete WorkTag dimension remains complete');
  ok(workTypes.ZeroTagWork.workTags.length === 0
    && workTypes.ZeroTagWork.workTagsCompleteness === 'complete',
  'RS-003 verified empty WorkTags are not missing metadata');
  ok(workTypes.FixtureWork._provenance.modId === 'fixture.active',
    'RS-004 WorkType provenance is preserved');

  const givers = ctx._parseWorkGivers(xml, { modId: 'fixture.active' });
  ok(givers.ZeroPath.requiredCapacities.length === 0
    && givers.ZeroPath.requiredCapacitiesCompleteness === 'complete',
  'RS-005 absent capacity list on complete WorkGiver is verified zero-capacity path');
  ok(givers.CapacityPath.requiredCapacities.join(',') === 'Manipulation,Talking',
    'RS-006 required capacities preserve AND-list order');
  ok(givers.ZeroPath.workTypeDefName === 'FixtureWork' && givers.ZeroPath.priorityInType === 12,
    'RS-007 WorkGiver membership and priority parse exactly');
  ok(givers.ZeroPath.giverClass === 'Custom.Giver'
    && givers.ZeroPath.requiredCapacitiesCompleteness === 'complete',
  'RS-008 custom giver class is diagnostic and does not erase standard capacity metadata');

  const missingWorkType = ctx._parseWorkGivers(
    '<Defs><WorkGiverDef><defName>IncompletePath</defName>'
      + '<requiredCapacities><li>Manipulation</li></requiredCapacities></WorkGiverDef></Defs>'
  );
  ok(missingWorkType.IncompletePath.workTypeCompleteness === 'partial'
    && missingWorkType.IncompletePath.requiredCapacitiesCompleteness === 'complete',
  'RS-009 missing membership poisons only WorkType dimension');

  const raceWork = ctx._parseRaceWork(xml, { modId: 'fixture.active' });
  ok(raceWork.DefinitionRace.entries.Hauling === 3
    && raceWork.DefinitionRace.entries.Fishing === 9
    && raceWork.DefinitionRace.entries.Research === 13,
  'RS-010 race work settings inherit and override by exact WorkType key');
  ok(raceWork.DefinitionRace.catalogueCompleteness === 'complete',
    'RS-011 definition-backed modded race catalogue is complete without race-name logic');
  ok(!Object.prototype.hasOwnProperty.call(raceWork.DefinitionRace.entries, 'Doctor'),
    'RS-012 absent entry remains representable as known no-gate in complete catalogue');

  const invalidRace = ctx._parseRaceWork(
    '<Defs><ThingDef><defName>InvalidRace</defName><race><lifeStageWorkSettings>'
      + '<Doctor>old-enough</Doctor></lifeStageWorkSettings></race></ThingDef></Defs>'
  );
  ok(invalidRace.InvalidRace.entryCompleteness.Doctor === 'partial'
    && invalidRace.InvalidRace.entries.Doctor === null,
  'RS-013 malformed minimum age is partial, never a numeric default');

  const duplicate = ctx._parseWorkTypes(
    '<Defs><WorkTypeDef><defName>Repeated</defName><workTags>Cleaning</workTags></WorkTypeDef>'
      + '<WorkTypeDef><defName>Repeated</defName><workTags>Hauling</workTags></WorkTypeDef></Defs>'
  );
  ok(duplicate.Repeated._completeness === 'partial'
    && duplicate.Repeated._completenessReasons.includes('duplicateDefinitionConflict'),
  'RS-014 duplicate WorkType definitions become partial');
  let malformedSafe = true;
  try { ctx._parseWorkGivers('<Defs><WorkGiverDef><defName>Broken'); } catch (_) { malformedSafe = false; }
  ok(malformedSafe, 'RS-015 malformed scanner XML is safe');

  const active = ctx._resolvePackages({
    royalty: true, ideology: false, biotech: true,
    modIds: ['Fixture.Active', 'Ludeon.RimWorld.Anomaly'],
  });
  ok(active.completeness === 'complete' && active.ids[0] === 'ludeon.rimworld',
    'RS-016 Core is explicit in complete active-package resolution');
  ok(active.ids.includes('ludeon.rimworld.royalty')
    && active.ids.includes('ludeon.rimworld.biotech')
    && active.ids.includes('fixture.active'),
  'RS-017 official DLC evidence and ordered target-save mods are combined');
  const unknownPackages = ctx._resolvePackages(null);
  ok(unknownPackages.completeness === 'unknown'
    && unknownPackages.reasons.includes('missingTargetSaveModList'),
  'RS-018 missing target-save activation stays unknown');

  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  ok(/CACHE_VERSION\s*=\s*6/.test(mainSource)
    && /workTypeDefsXml/.test(mainSource) && /workGiverDefsXml/.test(mainSource),
  'RS-019 scanner cache and IPC schema include C4 fragments');
  ok(/requiredCapacities/.test(mainSource) && /pathCatalogue/.test(mainSource)
    && /lifeStageWorkSettings/.test(mainSource),
  'RS-020 patch classifier names only C4 requirement dimensions');
  const scanHandler = mainSource.slice(mainSource.indexOf("ipcMain.handle('scan-trait-gene-defs'"),
    mainSource.indexOf("ipcMain.handle('scan-def-labels'"));
  ok(!/\b(?:apply|execute)Patch(?:Operation)?\s*\(/.test(scanHandler)
    && /relevantPatchNotApplied/.test(scanHandler),
  'RS-021 scanner records relevant patch uncertainty without executing operations');

  return { name: 'C4 requirement scanner', failures, total };
};

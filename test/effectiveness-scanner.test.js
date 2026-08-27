/** C5 focused effectiveness scanner/provider contracts. */
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
  vm.runInContext('globalThis._parseC5Provider = parseEffectivenessProviderFromXML', ctx);

  const skillXml = '<Defs>'
    + '<SkillDef Name="SkillBase" Abstract="True"><disablingWorkTags><li>ManualDumb</li></disablingWorkTags></SkillDef>'
    + '<SkillDef ParentName="SkillBase"><defName>Cooking</defName><neverDisabledBasedOnWorkTypes>true</neverDisabledBasedOnWorkTypes></SkillDef>'
    + '<SkillDef ParentName="SkillBase"><defName>Mining</defName><disablingWorkTags Inherit="False" /></SkillDef>'
    + '<SkillDef><defName>DuplicateSkill</defName><disablingWorkTags><li>Violent</li></disablingWorkTags></SkillDef>'
    + '<SkillDef><defName>DuplicateSkill</defName><disablingWorkTags><li>Caring</li></disablingWorkTags></SkillDef>'
    + '</Defs>';
  const traitXml = '<Defs><TraitDef><defName>C5Trait</defName><degreeDatas><li><degree>1</degree>'
    + '<skillGains><Mining>2</Mining></skillGains>'
    + '<aptitudes><li><skill>Animals</skill><level>3</level></li></aptitudes>'
    + '<statOffsets><GlobalLearningFactor>0.75</GlobalLearningFactor><WorkSpeedGlobal>0.1</WorkSpeedGlobal></statOffsets>'
    + '<statFactors><MiningSpeed>1.2</MiningSpeed></statFactors>'
    + '</li></degreeDatas></TraitDef></Defs>';
  const geneXml = '<Defs>'
    + '<GeneDef><defName>C5GeneratedGene</defName><geneClass>Gene</geneClass>'
    + '<aptitudes><li><skill>Mining</skill><level>4</level></li></aptitudes>'
    + '<statOffsets><GlobalLearningFactor>0.25</GlobalLearningFactor></statOffsets></GeneDef>'
    + '<GeneTemplateDef><defName>C5Template</defName><aptitudeOffset>4</aptitudeOffset></GeneTemplateDef>'
    + '</Defs>';
  const hediffXml = '<Defs><HediffDef><defName>Inhumanized</defName>'
    + '<aptitudes><li><skill>Animals</skill><level>-12</level></li><li><skill>Social</skill><level>-12</level></li></aptitudes>'
    + '<stages><li><minSeverity>0.5</minSeverity><statOffsets><WorkSpeedGlobal>-0.2</WorkSpeedGlobal></statOffsets>'
    + '<statFactors><MiningSpeed>0.5</MiningSpeed></statFactors>'
    + '<statOffsetEffectMultiplier>Severity</statOffsetEffectMultiplier></li></stages>'
    + '</HediffDef></Defs>';
  const statXml = '<Defs>'
    + '<StatDef Name="LearningBase" Abstract="True"><workerClass>StatWorker</workerClass><defaultBaseValue>1</defaultBaseValue><minValue>0</minValue><scenarioRandomizable>true</scenarioRandomizable></StatDef>'
    + '<StatDef ParentName="LearningBase"><defName>GlobalLearningFactor</defName></StatDef>'
    + '<StatDef ParentName="LearningBase"><defName>AnimalsLearningFactor</defName></StatDef>'
    + '<StatDef><defName>WorkSpeedGlobal</defName><defaultBaseValue>1</defaultBaseValue><minValue>0.3</minValue><parts>'
    + '<li Class="StatPart_Glow"><priority>500</priority></li><li Class="Unsupported.CustomPart"><priority>100</priority><rawThing>yes</rawThing></li>'
    + '</parts><scenarioRandomizable>true</scenarioRandomizable></StatDef>'
    + '<StatDef><defName>MiningSpeed</defName><defaultBaseValue>1</defaultBaseValue><minValue>0.1</minValue>'
    + '<skillNeedFactors><li><skill>Mining</skill><baseValue>0.04</baseValue><factorPerLevel>0.12</factorPerLevel></li></skillNeedFactors>'
    + '<capacityFactors><li><capacity>Manipulation</capacity><weight>1</weight></li><li><capacity>Sight</capacity><weight>0.5</weight><max>1</max></li></capacityFactors>'
    + '<statFactors><li>WorkSpeedGlobal</li></statFactors></StatDef>'
    + '<StatDef><defName>CookSpeed</defName><defaultBaseValue>0</defaultBaseValue><noSkillOffset>20</noSkillOffset><minValue>0.1</minValue>'
    + '<skillNeedOffsets><li><skill>Cooking</skill><baseValue>0</baseValue><factorPerLevel>1</factorPerLevel></li></skillNeedOffsets>'
    + '<capacityOffsets><li><capacity>Sight</capacity><scale>4</scale><max>1.5</max></li><li><capacity>Manipulation</capacity><scale>16</scale><max>1.5</max></li></capacityOffsets>'
    + '<postProcessCurve><points><li>(-20, 0.01)</li><li>(0, 0.4)</li><li>(20, 1.6)</li></points></postProcessCurve>'
    + '<postProcessStatFactors><li>WorkSpeedGlobal</li></postProcessStatFactors><roundToFiveOver>100</roundToFiveOver><roundValue>false</roundValue><maxValue>5</maxValue></StatDef>'
    + '<StatDef><defName>FishingSpeed</defName><workerClass>Custom.FishingWorker</workerClass></StatDef>'
    + '</Defs>';
  const facetXml = '<Defs>'
    + '<WorkGiverDef><defName>DoBillsCook</defName><workType>Cooking</workType><giverClass>WorkGiver_DoBill</giverClass><jobDef>DoBill</jobDef></WorkGiverDef>'
    + '<RecipeDef><defName>CookMeal</defName><workerClass>RecipeWorkerCounter</workerClass><workSpeedStat>CookSpeed</workSpeedStat><efficiencyStat>GeneralLaborSpeed</efficiencyStat><workSkill>Cooking</workSkill></RecipeDef>'
    + '<JobDef><defName>DoBill</defName><driverClass>JobDriver_DoBill</driverClass></JobDef>'
    + '</Defs>';
  const passionXml = '<Defs><VSE.Passions.PassionDef><defName>VSE_Critical</defName><label>critical</label>'
    + '<indicatorString>!!!</indicatorString><learnFactor>2.0</learnFactor><isTriggered>false</isTriggered>'
    + '</VSE.Passions.PassionDef></Defs>';
  const sourceMap = {
    SkillDef: {
      Cooking: [{ modId: 'fixture.active', file: 'Skills.xml', scanOrder: 1, sourceOrder: 0 }],
      Mining: [{ modId: 'fixture.active', file: 'Skills.xml', scanOrder: 1, sourceOrder: 1 }],
      DuplicateSkill: [
        { modId: 'fixture.inactive', file: 'Old.xml', scanOrder: 0, sourceOrder: 0 },
        { modId: 'fixture.active', file: 'New.xml', scanOrder: 2, sourceOrder: 0 },
      ],
    },
  };
  const provider = ctx._parseC5Provider({
    skillDefsXml: skillXml,
    traitsXml: traitXml,
    genesXml: geneXml,
    allHediffsXml: hediffXml,
    statDefsXml: statXml,
    facetDefsXml: facetXml,
    passionDefsXml: passionXml,
  }, {
    sourceMap,
    activePackageResolution: { ids: ['ludeon.rimworld', 'fixture.active'], completeness: 'complete', reasons: [] },
    uncertainty: {
      byType: { StatDef: { MiningSpeed: { dependencies: ['relevantPatchNotApplied'] } } },
      dataset: {
        StatDef: { capacities: ['relevantPatchNotApplied'] },
        PassionDef: { provider: ['relevantPatchNotApplied'] },
      },
    },
    providerFingerprint: 'fixture-provider-sha256',
    runtimeFingerprint: 'RimWorld-1.6.4871-rev590',
  });

  ok(provider.schemaVersion === 1 && provider.pawnIndependent === true,
    'ES-001 provider is versioned and pawn-independent');
  ok(provider.skillDefs.Cooking.disablingWorkTags.join(',') === 'ManualDumb'
    && provider.skillDefs.Cooking.neverDisabledBasedOnWorkTypes === true,
  'ES-002 SkillDef inheritance and exact disable fields resolve');
  ok(provider.skillDefs.Mining.disablingWorkTags.length === 0
    && provider.skillDefs.Mining.disablingWorkTagsCompleteness === 'complete',
  'ES-003 Inherit=False preserves an explicitly empty complete list');
  ok(provider.skillDefs.DuplicateSkill.disablingWorkTags.join(',') === 'Caring'
    && provider.skillDefs.DuplicateSkill._provenance.modId === 'fixture.active',
  'ES-004 active-package load order selects the effective definition');
  ok(provider.catalogueCompleteness.skillDefs === 'complete',
    'ES-005 complete active package proof permits complete SkillDef catalogue');

  const trait = provider.sourceOperations.traits.C5Trait.traitDegrees[0];
  ok(trait.skillGains[0].skillDefId === 'Mining' && trait.skillGains[0].value === 2
    && trait.aptitudes[0].skillDefId === 'Animals' && trait.aptitudes[0].offset === 3,
  'ES-006 trait creation gains and aptitudes remain distinct ordered operations');
  ok(trait.statOffsets.map(item => item.statDefId).join(',') === 'GlobalLearningFactor,WorkSpeedGlobal'
    && trait.statFactors[0].statDefId === 'MiningSpeed',
  'ES-007 trait stat operation order and exact targets are retained');
  ok(provider.sourceOperations.genes.C5GeneratedGene.definitionKind === 'GeneDef'
    && provider.sourceOperations.genes.C5GeneratedGene.aptitudes[0].offset === 4
    && provider.sourceOperations.genes.C5GeneratedGene.activeStateRequirement === 'Gene.Active',
  'ES-008 effective GeneDef aptitude and active-state requirement are typed');
  ok(provider.sourceOperations.geneTemplates.C5Template.aptitudeOffset === 4
    && provider.sourceOperations.geneTemplates.C5Template.generatedGeneRequired === true,
  'ES-009 GeneTemplate provenance is retained without invented effective aptitude');
  ok(provider.sourceOperations.hediffs.Inhumanized.aptitudes.length === 2
    && provider.sourceOperations.hediffs.Inhumanized.stages[0].statOffsetEffectMultiplier === 'Severity',
  'ES-010 hediff definition aptitude and stage multiplier metadata are separate');

  ok(Object.keys(provider.statDefs).filter(id => provider.statDefs[id].supported).length === 5,
    'ES-011 exactly the five audited StatDefs are evaluator-supported');
  ok(provider.statDefs.GlobalLearningFactor.defaultBaseValue === 1
    && provider.statDefs.AnimalsLearningFactor.scenarioRandomizable === true,
  'ES-012 inherited StatDef base and scenario fields resolve');
  ok(provider.statDefs.MiningSpeed.skillNeedFactors[0].factorPerLevel === 0.12
    && provider.statDefs.MiningSpeed.capacityFactors.map(item => item.capacityDefId).join(',') === 'Manipulation,Sight',
  'ES-013 Mining skill and capacity factor families parse in order');
  ok(provider.statDefs.CookSpeed.noSkillOffset === 20
    && provider.statDefs.CookSpeed.capacityOffsets[1].scale === 16,
  'ES-014 Cook no-skill and capacity offset fields parse exactly');
  ok(provider.statDefs.CookSpeed.postProcessCurve.points.length === 3
    && provider.statDefs.CookSpeed.postProcessStatFactors[0] === 'WorkSpeedGlobal',
  'ES-015 curve and post-process dependency retain their phase');
  ok(provider.statDefs.CookSpeed.roundToFiveOver === 100
    && provider.statDefs.CookSpeed.roundValue === false
    && provider.statDefs.CookSpeed.maxValue === 5,
  'ES-016 rounding and clamp fields preserve explicit zero/false-compatible values');
  ok(provider.statDefs.WorkSpeedGlobal.parts[0].classId === 'StatPart_Glow'
    && provider.statDefs.WorkSpeedGlobal.parts[1].support === 'unsupported'
    && provider.statDefs.WorkSpeedGlobal.parts[1].rawParameters.rawThing === 'yes',
  'ES-017 supported and unsupported StatParts remain ordered structured data');
  ok(provider.statDefs.MiningSpeed.dependencies[0].uncertainty.includes('relevantPatchNotApplied'),
    'ES-018 dependency patch uncertainty attaches only at dependency use');
  ok(provider.statDefs.CookSpeed.phaseCompleteness.capacities === 'partial'
    && provider.statDefs.GlobalLearningFactor.phaseCompleteness.dependencies === 'complete',
  'ES-018B broad capacity uncertainty does not poison unrelated dependency phases');
  ok(provider.statDefs.FishingSpeed.supported === false
    && provider.statDefs.FishingSpeed.recordOnly === true,
  'ES-019 outside-subset StatDef identity is record-only');

  ok(provider.facets.workGivers.DoBillsCook.workTypeDefId === 'Cooking'
    && provider.facets.workGivers.DoBillsCook.giverClassId === 'WorkGiver_DoBill'
    && provider.facets.workGivers.DoBillsCook.jobDefId === 'DoBill',
  'ES-020 WorkGiver XML bindings are exact provider facts');
  ok(provider.facets.recipes.CookMeal.statDefIds.join(',') === 'CookSpeed,GeneralLaborSpeed'
    && provider.facets.recipes.CookMeal.workSkillDefIds.join(',') === 'Cooking',
  'ES-021 RecipeDef retains plural stat and skill bindings');
  ok(provider.facets.jobDefs.DoBill.driverClassId === 'JobDriver_DoBill'
    && provider.facets.jobDefs.DoBill.semanticBinding === null,
  'ES-022 raw JobDriver class reference does not invent C# semantics');
  ok(provider.passions.VSE_Critical.rawFields.learnFactor === '2.0'
    && provider.passions.VSE_Critical.semantics === null
    && provider.passions.VSE_Critical.providerFingerprint === 'fixture-provider-sha256',
  'ES-023 passion provider fields and fingerprint remain raw without arbitrary semantics');

  let malformedSafe = true;
  try { ctx._parseC5Provider({ statDefsXml: '<Defs><StatDef><defName>Broken' }, {}); }
  catch (_) { malformedSafe = false; }
  ok(malformedSafe, 'ES-024 malformed effectiveness XML degrades safely');

  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  ok(/CACHE_VERSION\s*=\s*7/.test(mainSource)
    && /skillDefsXml/.test(mainSource) && /statDefsXml/.test(mainSource)
    && /recipeDefsXml/.test(mainSource) && /jobDefsXml/.test(mainSource),
  'ES-025 cache v7 and focused C5 IPC fragments are present');
  const scanHandler = mainSource.slice(mainSource.indexOf("ipcMain.handle('scan-trait-gene-defs'"),
    mainSource.indexOf("ipcMain.handle('scan-def-labels'"));
  ok(/SkillDef/.test(scanHandler) && /StatDef/.test(scanHandler)
    && /RecipeDef/.test(scanHandler) && /passion/.test(scanHandler)
    && /relevantPatchNotApplied/.test(scanHandler)
    && !/\b(?:apply|execute)Patch(?:Operation)?\s*\(/.test(scanHandler),
  'ES-026 patch scope is classified without a PatchOperation interpreter');
  ok(!JSON.stringify(provider).includes('pawnId')
    && !JSON.stringify(provider).includes('geneRuntimeFacts'),
  'ES-027 definition provider contains no pawn-expanded operations');

  return { name: 'C5 effectiveness scanner/provider', failures, total };
};

/** C4 immutable RequirementRegistry tests. */
const fs = require('fs');
const path = require('path');
const { loadScripts } = require('./_harness');
const fixture = require('./fixtures/c4-runtime-audit-1.6.4871.json');

module.exports = function run() {
  let total = 0;
  let failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) { failures++; console.log('  FAIL ' + label); }
  };
  const { RequirementRegistry: registry } = loadScripts(['requirement-registry.js'], {});
  const provenance = modId => ({ modId, sources: [{ modId, file: 'fixture.xml' }] });
  const workTypeDefs = {};
  for (const item of fixture.directJobs) {
    workTypeDefs[item.workType] = {
      defName: item.workType,
      workTags: item.workTags.slice(),
      workTagsCompleteness: 'complete', workTagsCompletenessReasons: [],
      pathCatalogueCompleteness: 'complete', pathCatalogueCompletenessReasons: [],
      _provenance: provenance('ludeon.rimworld'),
    };
  }
  const workGiverDefs = {
    FightFires: {
      defName: 'FightFires', workTypeDefName: 'Firefighter', priorityInType: 100,
      requiredCapacities: [], requiredCapacitiesCompleteness: 'complete',
      workTypeCompleteness: 'complete', catalogueMembershipCompleteness: 'complete',
      _provenance: provenance('ludeon.rimworld'),
    },
    HaulGeneral: {
      defName: 'HaulGeneral', workTypeDefName: 'Hauling', priorityInType: 50,
      requiredCapacities: ['Manipulation'], requiredCapacitiesCompleteness: 'complete',
      workTypeCompleteness: 'complete', catalogueMembershipCompleteness: 'complete',
      _provenance: provenance('ludeon.rimworld'),
    },
    TakeEntityToHoldingPlatform: {
      defName: 'TakeEntityToHoldingPlatform', workTypeDefName: 'Hauling', priorityInType: 40,
      requiredCapacities: [], requiredCapacitiesCompleteness: 'complete',
      workTypeCompleteness: 'complete', catalogueMembershipCompleteness: 'complete',
      _provenance: provenance('ludeon.rimworld.anomaly'),
    },
    InactiveHaul: {
      defName: 'InactiveHaul', workTypeDefName: 'Hauling', priorityInType: 30,
      requiredCapacities: ['UnsupportedCapacity'], requiredCapacitiesCompleteness: 'complete',
      workTypeCompleteness: 'complete', catalogueMembershipCompleteness: 'complete',
      _provenance: provenance('fixture.inactive'),
    },
    TalkPath: {
      defName: 'TalkPath', workTypeDefName: 'Warden', priorityInType: 20,
      requiredCapacities: ['Talking'], requiredCapacitiesCompleteness: 'complete',
      workTypeCompleteness: 'complete', catalogueMembershipCompleteness: 'complete',
      _provenance: provenance('ludeon.rimworld'),
    },
  };
  const capacityDefs = {
    Manipulation: {
      defName: 'Manipulation', workerClass: 'PawnCapacityWorker_Manipulation',
      minForCapable: 0, _completeness: 'complete', _provenance: provenance('ludeon.rimworld'),
    },
    Talking: {
      defName: 'Talking', workerClass: 'PawnCapacityWorker_Talking',
      minForCapable: 0, _completeness: 'complete', _provenance: provenance('ludeon.rimworld'),
    },
    UnsupportedCapacity: {
      defName: 'UnsupportedCapacity', workerClass: 'ModdedCapacityWorker',
      minForCapable: 0.25, _completeness: 'complete', _provenance: provenance('fixture.inactive'),
    },
  };
  const humanEntries = {};
  const humanCompleteness = {};
  for (const [workType, entry] of Object.entries(fixture.raceWorkPolicies.Human.entries)) {
    if (entry.state === 'knownGate') {
      humanEntries[workType] = entry.minAge;
      humanCompleteness[workType] = 'complete';
    }
  }
  const raceWorkPolicies = {
    Human: {
      raceDefName: 'Human', entries: humanEntries,
      entryCompleteness: humanCompleteness, entryCompletenessReasons: {},
      catalogueCompleteness: 'complete', catalogueCompletenessReasons: [],
      _provenance: provenance('ludeon.rimworld'),
    },
    DefinitionRace: {
      raceDefName: 'DefinitionRace', entries: { Research: 4 },
      entryCompleteness: { Research: 'complete' }, entryCompletenessReasons: {},
      catalogueCompleteness: 'partial', catalogueCompletenessReasons: ['unappliedRacePatch'],
      _provenance: provenance('fixture.active'),
    },
  };
  const jobCatalog = fixture.directJobs.map(item => item.jobId)
    .concat(fixture.unknownAppJobs.map(item => item.jobId), ['custom_job']);
  const inputs = {
    runtimeVersion: fixture.runtimeVersion,
    jobCatalog, workTypeDefs, workGiverDefs, capacityDefs, raceWorkPolicies,
    activePackageIds: {
      ids: ['ludeon.rimworld', 'ludeon.rimworld.anomaly', 'fixture.active'],
      completeness: 'complete', reasons: [],
    },
  };
  const snapshot = registry.createSnapshot(inputs);

  for (const audited of fixture.directJobs) {
    const policy = registry.getJobPolicy(snapshot, audited.jobId);
    ok(policy && policy.state === 'definitionBacked'
      && policy.workTypeDefName === audited.workType,
    'RR-001 direct mapping ' + audited.jobId + ' -> ' + audited.workType);
  }
  for (const audited of fixture.unknownAppJobs) {
    const policy = registry.getJobPolicy(snapshot, audited.jobId);
    ok(policy && policy.state === 'unknown' && policy.workTypeDefName === null,
      'RR-002 audited app job remains unknown: ' + audited.jobId);
  }
  ok(registry.getJobPolicy(snapshot, 'custom_job').state === 'unknown',
    'RR-003 present custom job receives explicit unknown policy');
  ok(registry.getJobPolicy(snapshot, 'absent_job') === null,
    'RR-004 absent catalogue ID alone returns null');

  const firefight = registry.getJobPolicy(snapshot, 'firefight');
  ok(firefight.permission.workTags.values.join(',') === 'Firefighting,Commoner,AllWork',
    'RR-005 exact canonical Firefighter tags remain separate from legacy violence');
  ok(firefight.execution.mode === 'anyPath'
    && firefight.execution.paths[0].allOf.length === 0
    && firefight.execution.paths[0].completeness === 'complete',
  'RR-006 verified zero-capacity path is complete allOf empty');

  const hauling = registry.getJobPolicy(snapshot, 'hauling');
  ok(hauling.execution.paths.length === 2
    && hauling.execution.paths.some(item => item.pathId === 'workGiver:TakeEntityToHoldingPlatform'
      && item.allOf.length === 0),
  'RR-007 Anomaly Hauling free alternative survives active-package filtering');
  ok(!hauling.execution.paths.some(item => item.pathId === 'workGiver:InactiveHaul'),
    'RR-008 definitely inactive WorkGiver is excluded');
  const manipulation = hauling.execution.paths.find(item => item.pathId === 'workGiver:HaulGeneral').allOf[0];
  ok(manipulation.comparison.operator === 'gt'
    && manipulation.comparison.thresholdSource.value === 0,
  'RR-009 capacity threshold uses strict gt and preserves numeric zero');
  ok(manipulation.notApplicable === 'blocked',
    'RR-010 audited required capacity carries explicit notApplicable blocked policy');

  const unsupportedInputs = Object.assign({}, inputs, {
    activePackageIds: {
      ids: inputs.activePackageIds.ids.concat('fixture.inactive'), completeness: 'complete', reasons: [],
    },
  });
  const unsupported = registry.createSnapshot(unsupportedInputs);
  const unsupportedRequirement = registry.getJobPolicy(unsupported, 'hauling').execution.paths
    .find(pathItem => pathItem.pathId === 'workGiver:InactiveHaul').allOf[0];
  ok(unsupportedRequirement.notApplicable === 'unknown',
    'RR-011 unsupported capacity worker defaults notApplicable to unknown');

  const missingCapacityInputs = Object.assign({}, inputs, {
    capacityDefs: { Talking: capacityDefs.Talking },
  });
  const missingCapacity = registry.createSnapshot(missingCapacityInputs);
  const missingRequirement = registry.getJobPolicy(missingCapacity, 'hauling').execution.paths
    .find(pathItem => pathItem.pathId === 'workGiver:HaulGeneral').allOf[0];
  ok(missingRequirement.completeness === 'partial' && missingRequirement.comparison === null,
    'RR-012 missing capacity definition cannot become a numeric requirement');

  const fishing = registry.getJobPolicy(snapshot, 'fishing');
  ok(fishing.execution.completeness === 'complete' && fishing.execution.paths.length === 0,
    'RR-013 complete empty WorkGiver catalogue remains distinct from free path');
  const partialWorkTypes = Object.assign({}, workTypeDefs, {
    Fishing: Object.assign({}, workTypeDefs.Fishing, {
      pathCatalogueCompleteness: 'partial', pathCatalogueCompletenessReasons: ['broadWorkGiverPatch'],
    }),
  });
  const partialSnapshot = registry.createSnapshot(Object.assign({}, inputs, { workTypeDefs: partialWorkTypes }));
  ok(registry.getJobPolicy(partialSnapshot, 'fishing').execution.completeness === 'partial'
    && registry.getJobPolicy(partialSnapshot, 'fishing').execution.paths.length === 0,
  'RR-014 incomplete empty catalogue stays unknown-capable representation');

  const doctorGate = registry.getRaceWorkEntry(snapshot, 'Human', 'Doctor');
  const fishingGate = registry.getRaceWorkEntry(snapshot, 'Human', 'Fishing');
  ok(doctorGate.state === 'knownGate' && doctorGate.minAge === 10,
    'RR-015 Human Doctor gate comes from definitions');
  ok(fishingGate.state === 'knownNoGate' && fishingGate.minAge === null,
    'RR-016 Human Fishing has known no gate from complete catalogue');
  ok(registry.getRaceWorkEntry(snapshot, 'DefinitionRace', 'Research').state === 'knownGate'
    && registry.getRaceWorkEntry(snapshot, 'DefinitionRace', 'Research').minAge === 4,
  'RR-017 modded race exact entry survives partial unrelated catalogue uncertainty');
  ok(registry.getRaceWorkEntry(snapshot, 'DefinitionRace', 'Doctor').state === 'unknown',
    'RR-018 absent entry in partial modded race catalogue remains unknown');
  ok(registry.getRaceWorkEntry(snapshot, 'MissingRace', 'Doctor').state === 'unknown',
    'RR-019 missing race registry key remains unknown');

  const originalTag = workTypeDefs.Firefighter.workTags[0];
  let mutationRejected = false;
  try { snapshot.jobPolicies.firefight.permission.workTags.values.push('Violent'); }
  catch (_) { mutationRejected = true; }
  ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.jobPolicies.firefight.execution.paths)
    && (mutationRejected || !snapshot.jobPolicies.firefight.permission.workTags.values.includes('Violent')),
  'RR-020 returned snapshot is deeply immutable');
  ok(workTypeDefs.Firefighter.workTags[0] === originalTag
    && inputs.workGiverDefs.HaulGeneral.requiredCapacities.length === 1,
  'RR-021 registry does not mutate input catalogues');

  const source = fs.readFileSync(path.join(__dirname, '..', 'files', 'requirement-registry.js'), 'utf8');
  ok(!/incapBlocks|JOB_MIN_AGE|MANIPULATION_GATED_JOBS|closest|analogue/.test(source),
    'RR-022 canonical registry has no legacy or analogue dependency');
  ok(!/raceDefName\s*={2,3}|raceDefName\s*!={1,2}|switch\s*\([^)]*raceDefName/.test(source),
    'RR-023 race definition IDs are opaque lookup keys');

  return { name: 'C4 requirement registry', failures, total };
};

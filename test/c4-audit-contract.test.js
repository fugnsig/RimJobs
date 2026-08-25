/**
 * C4 Task 0: executable contracts frozen by the 1.6.4871 audit.
 * These fixtures are shared by later scanner, registry and resolver suites.
 */
const fixture = require('./fixtures/c4-runtime-audit-1.6.4871.json');

function run() {
  let total = 0;
  let failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) {
      failures++;
      console.log('  FAIL ' + label);
    }
  };

  const tagMap = Object.fromEntries(fixture.workTags.map(tag => [tag.id, tag.value]));
  const mask = tags => tags.reduce((value, tag) => value | (tagMap[tag] || 0), 0);
  const intersects = (left, right) => (mask(left) & mask(right)) !== 0;
  const directById = Object.fromEntries(fixture.directJobs.map(job => [job.jobId, job]));
  const unknownIds = fixture.unknownAppJobs.map(job => job.jobId);

  ok(fixture.runtimeVersion === '1.6.4871', 'C4-AUD-001 target runtime is frozen');
  ok(fixture.workTags.length === 20, 'C4-AUD-002 exact non-None WorkTag count');
  ok(new Set(fixture.workTags.map(tag => tag.id)).size === 20,
    'C4-AUD-003 WorkTag identifiers are unique');
  ok(new Set(fixture.workTags.map(tag => tag.value)).size === 20,
    'C4-AUD-004 WorkTag bit values are unique');
  ok(fixture.workTags.every(tag => /^[A-Z][A-Za-z]+$/.test(tag.id)),
    'C4-AUD-005 no lower-case legacy tag enters canonical vocabulary');
  ok(tagMap.Firefighting === 4096 && tagMap.AllWork === 1048576,
    'C4-AUD-006 audited Firefighting and AllWork flag values');
  ok(intersects(['Firefighting'], directById.firefight.workTags),
    'C4-AUD-007 Firefighting flag intersects Firefighter tags');
  ok(!intersects(['Violent'], directById.firefight.workTags),
    'C4-AUD-008 Violent alone does not intersect Firefighter tags');
  ok(intersects(['AllWork'], directById.firefight.workTags),
    'C4-AUD-009 AllWork exact flag intersects the WorkType AllWork flag');
  ok(intersects(['Violent', 'Caring'], directById.doctoring.workTags),
    'C4-AUD-010 combined flag masks match any shared exact flag');

  ok(fixture.directJobs.length === 23, 'C4-AUD-011 23 direct built-in job mappings');
  ok(fixture.unknownAppJobs.length === 10, 'C4-AUD-012 ten app jobs remain unknown');
  ok(new Set(fixture.directJobs.map(job => job.jobId)).size === 23,
    'C4-AUD-013 direct job IDs are unique');
  ok(new Set(unknownIds).size === 10, 'C4-AUD-014 unknown app job IDs are unique');
  ok(!fixture.directJobs.some(job => unknownIds.includes(job.jobId)),
    'C4-AUD-015 direct and unknown job partitions do not overlap');
  ok(fixture.unknownAppJobs.every(job => job.policyState === 'unknown'
    && !Object.prototype.hasOwnProperty.call(job, 'analogue')
    && !Object.prototype.hasOwnProperty.call(job, 'sourceWorkType')),
  'C4-AUD-016 unknown app jobs contain no guessed analogue');

  ok(JSON.stringify(directById.firefight.workTags)
    === JSON.stringify(['Firefighting', 'Commoner', 'AllWork']),
  'C4-AUD-017 Firefighter exact WorkTags');
  ok(fixture.raceWorkPolicies.Human.entries.Fishing.state === 'knownNoGate'
    && fixture.raceWorkPolicies.Human.entries.Fishing.minAge == null,
  'C4-AUD-018 Human Fishing has no official age gate');
  ok(directById.hauling.zeroCapacityPaths.includes('workGiver:TakeEntityToHoldingPlatform')
    && directById.hauling.capacitySets.some(set => set.length === 0),
  'C4-AUD-019 Anomaly Hauling preserves its verified zero-capacity path');
  ok(fixture.directJobs.every(job => (job.zeroCapacityPaths || [])
    .every(pathId => /^workGiver:[A-Za-z0-9_.-]+$/.test(pathId))),
  'C4-AUD-020 audited WorkGiver paths use stable IDs');
  ok(fixture.capacityDefs.Manipulation.operator === 'gt'
    && fixture.capacityDefs.Manipulation.minForCapable === 0,
  'C4-AUD-021 capacity contract is strict value > minForCapable');

  const examples = Object.fromEntries(fixture.executionStateExamples.map(item => [item.id, item]));
  ok(examples['verified-zero-capacity'].catalogueCompleteness === 'complete'
    && examples['verified-zero-capacity'].paths[0].completeness === 'complete'
    && examples['verified-zero-capacity'].paths[0].allOf.length === 0
    && examples['verified-zero-capacity'].expected === 'satisfied',
  'C4-AUD-022 complete zero-capacity path is satisfied');
  ok(examples['verified-empty-catalogue'].catalogueCompleteness === 'complete'
    && examples['verified-empty-catalogue'].paths.length === 0
    && examples['verified-empty-catalogue'].expected === 'failed',
  'C4-AUD-023 complete empty catalogue is failed');
  ok(examples['incomplete-empty-catalogue'].catalogueCompleteness === 'partial'
    && examples['incomplete-empty-catalogue'].paths.length === 0
    && examples['incomplete-empty-catalogue'].expected === 'unknown',
  'C4-AUD-024 incomplete empty catalogue is unknown');
  ok(new Set(fixture.executionStateExamples.map(item => item.expected)).size === 3,
    'C4-AUD-025 execution completeness examples remain semantically distinct');

  return { name: 'C4 audit contract', total, failures };
}

if (require.main === module) {
  const result = run();
  console.log(`${result.failures ? 'FAIL' : 'PASS'} ${result.name}: ${result.total} checks`);
  process.exit(result.failures ? 1 : 0);
}

module.exports = run;

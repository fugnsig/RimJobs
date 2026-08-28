const fs = require('fs');
const path = require('path');

module.exports = function run() {
  let total = 0;
  let failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) {
      failures++;
      console.log('  FAIL ' + label);
    }
  };

  const source = fs.readFileSync(
    path.join(__dirname, '..', 'files', 'c7-evaluation-coordinator.js'), 'utf8');
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'files', 'rimjobs.html'), 'utf8');
  const packageJson = require('../package.json');
  const runTests = fs.readFileSync(
    path.join(__dirname, 'run-tests.js'), 'utf8');

  ok(!/primarySkill/i.test(source), 'SG-1 no primarySkill');
  ok(!/effectivenessScore/i.test(source), 'SG-1 no effectivenessScore');
  ok(!/overallScore/i.test(source), 'SG-1 no overallScore');
  ok(!/WeakMap/i.test(source), 'SG-3 no WeakMap');
  ok(!/revisionCache/i.test(source), 'SG-3 no revision cache');
  ok(!/module\..*cache/i.test(source), 'SG-3 no module-level cache');
  ok(!/\.state\s*===?\s*(true|false)/i.test(source),
    'SG-5 no boolean coercion of canonical state');
  ok(!/incapBlocks/i.test(source), 'SG-7 no legacy incapBlocks token');
  ok(!/(trait|gene|hediff|race)(DefName|Id|Name)?\s*===/i.test(source),
    'SG-2 no identity semantic branch');
  ok(!/rank|assignment|slotConstruction/i.test(source),
    'SG-4 no ranking, assignment, or schedule construction');
  ok(!/C4LegacyCompatibility|legacyShadow/i.test(source),
    'SG-8 production coordinator has no C4 shadow dependency');
  ok(!/evaluatePawnJob|evaluateJobPermission|isIncapable/i.test(source),
    'SG-8 production coordinator has no deprecated C1 evaluator dependency');

  const scriptIndex = name => html.indexOf(`src="${name}"`);
  const dependencies = [
    'capability-evidence.js', 'capacity-resolver.js', 'permission-resolver.js',
    'availability-resolver.js', 'c5-evaluation-context.js',
    'temporal-profile-resolver.js',
  ];
  const coordinatorIndex = scriptIndex('c7-evaluation-coordinator.js');
  ok(coordinatorIndex >= 0 && dependencies.every(name => scriptIndex(name) >= 0
      && scriptIndex(name) < coordinatorIndex),
    'SG-9 C7 coordinator loads after its canonical dependencies');
  ok(scriptIndex('c5-runtime-contract.js') >= 0
      && scriptIndex('c5-runtime-contract.js') < scriptIndex('c5-definition-snapshot-factory.js'),
    'SG-9 packaged C5 runtime contract loads before its snapshot factory');
  ok(!html.includes('src="c4-legacy-compatibility.js"'),
    'SG-10 C4 shadow adapter is not production-loaded');
  ok(scriptIndex('c5-legacy-compatibility.js') > scriptIndex('app-pawns.js'),
    'SG-10 frozen C5 ranking compatibility loads after its legacy owners');
  ok(Array.isArray(packageJson.build && packageJson.build.files)
      && packageJson.build.files.includes('files/**/*'),
    'SG-11 release packaging includes the packaged C5 runtime contract');
  ok(runTests.includes("'./c4-compatibility.test.js'")
      && runTests.includes("'./c5-compatibility.test.js'"),
    'SG-12 deprecated C4/C5 shadow suites remain in the full gate');

  return { name: 'C7 static architecture gates', total, failures };
};

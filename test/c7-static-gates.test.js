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

  return { name: 'C7 static architecture gates', total, failures };
};

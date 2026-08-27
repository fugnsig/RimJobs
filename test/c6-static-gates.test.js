/** C6 Task 7: static architecture gate tests for temporal-profile-resolver.js. */
const fs = require('fs');
const path = require('path');

module.exports = function run() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'files', 'temporal-profile-resolver.js'), 'utf8');
  let total = 0, failures = 0;
  const ok = (condition, label) => {
    total++;
    if (!condition) { failures++; console.log('  FAIL ' + label); }
  };

  const absent = (pattern, label) => {
    ok(!pattern.test(src), label);
  };

  // C6-GATE-001: no App reference (excluding 'applicability' and similar substrings)
  absent(/\bApp\b(?!licab)/g,
    'C6-GATE-001 no App reference');

  // C6-GATE-002: no C4 permission/availability references
  absent(/c4RequirementSnapshot/g, 'C6-GATE-002a no c4RequirementSnapshot');
  absent(/C4EvaluationContext/g, 'C6-GATE-002b no C4EvaluationContext');
  absent(/PermissionResolver/g, 'C6-GATE-002c no PermissionResolver');
  absent(/AvailabilityResolver/g, 'C6-GATE-002d no AvailabilityResolver');

  // C6-GATE-003: no bioAge/lifeStage classification
  absent(/biologicalAge/g, 'C6-GATE-003a no biologicalAge threshold checks');
  absent(/\blifeStage\b/g, 'C6-GATE-003b no lifeStage classification');
  absent(/\bbioAge\b/g, 'C6-GATE-003c no bioAge');

  // C6-GATE-004: no scheduler policy
  absent(/\bbreakRisk\b/g, 'C6-GATE-004a no breakRisk');
  absent(/\bp1Count\b/g, 'C6-GATE-004b no p1Count');
  absent(/\bworkBudget\b/g, 'C6-GATE-004c no workBudget');
  absent(/\bworkHours\b/g, 'C6-GATE-004d no workHours');

  // C6-GATE-005: no identity-based branching on known names
  absent(/'quick_sleeper'/g, 'C6-GATE-005a no quick_sleeper string');
  absent(/'gene_no_sleep'/g, 'C6-GATE-005b no gene_no_sleep string');
  absent(/'body_mastery'/g, 'C6-GATE-005c no body_mastery string');
  absent(/'night_owl'/g, 'C6-GATE-005d no night_owl string');
  absent(/'meditation'/g, 'C6-GATE-005e no meditation string');
  absent(/'psycaster'/g, 'C6-GATE-005f no psycaster string');
  absent(/'ascetic'/g, 'C6-GATE-005g no ascetic string');
  absent(/'undergrounder'/g, 'C6-GATE-005h no undergrounder string');
  absent(/'dirtmole'/g, 'C6-GATE-005i no dirtmole string');
  absent(/'low_sleep'/g, 'C6-GATE-005j no low_sleep string');

  return { name: 'C6 static architecture gates', total, failures };
};

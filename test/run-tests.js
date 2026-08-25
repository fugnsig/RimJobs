/**
 * RimJobs logic test runner.
 *   node test/run-tests.js
 * Runs the pure-logic robustness tests (no Electron/DOM needed) and exits
 * non-zero if any assertion fails. The save-parser fuzz test skips cleanly when
 * no .rws is available (set RIMJOBS_SAVE to point at one).
 */
const tests = [
  './engine.optimiser.test.js',
  './save-parser.fuzz.test.js',
  './save-export.fuzz.test.js',
  './trait-editor.fuzz.test.js',
  './state-normaliser.fuzz.test.js',
  './clipboard-import.fuzz.test.js',
  './relations-graph.fuzz.test.js',
  './blueprint-import.fuzz.test.js',
  './raid-calc.fuzz.test.js',
  './charts-skill.fuzz.test.js',
  './armoury-calc.fuzz.test.js',
  './health-backstory.fuzz.test.js',
  './blueprint-rework.fuzz.test.js',
  './import-multitask.fuzz.test.js',
  './import-notice.test.js',
  './blueprint-xml.test.js',
  './stress-4d.fuzz.test.js',
  './logo-date.test.js',
  './capability-corpus.test.js',
  './capability-evidence.test.js',
  './capacity-resolver.test.js',
  './c4-audit-contract.test.js',
  './requirement-scanner.test.js',
  './requirement-registry.test.js',
  './permission-resolver.test.js',
];

(async () => {
  let totalFail = 0, ran = 0, skipped = 0;
  for (const t of tests) {
    let r;
    try { r = require(t)(); if (r && typeof r.then === 'function') r = await r; }
    catch (e) { totalFail++; console.log(`\n[harness error] ${t}: ${e.stack || e.message}`); continue; }
    if (r.skipped) { skipped++; console.log(`\nSKIP  ${r.name} - ${r.reason || ''}`); continue; }
    ran++;
    const status = r.failures ? `${r.failures} FAILED` : 'all passed';
    console.log(`\n${r.failures ? 'FAIL' : 'PASS'}  ${r.name}: ${r.total} checks, ${status}`);
    totalFail += r.failures;
  }
  console.log(`\n=== ${ran} suite(s) run, ${skipped} skipped, ${totalFail} failure(s) ===`);
  process.exit(totalFail ? 1 : 0);
})();

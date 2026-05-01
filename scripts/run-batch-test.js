#!/usr/bin/env node
/**
 * Batch Gravity Assist Test Runner
 * Usage: node scripts/run-batch-test.js [count]
 * Or: npx tsx scripts/run-batch-test.js [count]
 */

const count = parseInt(process.argv[2], 10) || 100;

// We need to import TypeScript modules, so use tsx if available
async function run() {
  try {
    const { runBatchGravityAssistTests } = await import('../src/tests/batchGravityAssistTests.ts');
    const summary = runBatchGravityAssistTests(count);

    // Exit with error code if too many failures
    const failureRate = summary.failedSystems / summary.totalSystems;
    if (failureRate > 0.1) {
      console.error(`\n❌ FAILURE: ${(failureRate * 100).toFixed(1)}% of systems failed (>10% threshold)`);
      process.exit(1);
    }

    console.log(`\n✅ SUCCESS: Batch test completed with ${(failureRate * 100).toFixed(1)}% failure rate`);
    process.exit(0);
  } catch (err) {
    console.error('Failed to run batch test:', err);
    process.exit(1);
  }
}

run();

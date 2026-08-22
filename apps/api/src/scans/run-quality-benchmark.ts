import {
  qualityBenchmarkCases,
  qualityBenchmarkVersion,
} from "./quality-benchmark-cases.js";
import { evaluateQualityBenchmark } from "./quality-benchmark.js";

const report = evaluateQualityBenchmark(qualityBenchmarkCases);

console.log(
  `Mentionish conversation quality benchmark ${qualityBenchmarkVersion}`,
);
console.log(`Cases: ${report.total}`);
console.log(`Exact tier accuracy: ${report.exactAccuracy}%`);
console.log(`Actionable precision: ${report.actionablePrecision}%`);
console.log(`Actionable recall: ${report.actionableRecall}%`);
console.log(`Direct-opportunity precision: ${report.directPrecision}%`);
console.log(
  `Non-actionable reply-queue leakage: ${report.nonActionableLeakage}`,
);

if (report.failures.length > 0) {
  console.log("\nTier mismatches:");
  for (const failure of report.failures)
    console.log(
      `- ${failure.id}: expected ${failure.expected}, received ${failure.predicted}`,
    );
}

if (!report.passed) {
  console.error("\nQuality gate failed:");
  for (const failure of report.thresholdFailures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("\nQuality gate passed.");
}

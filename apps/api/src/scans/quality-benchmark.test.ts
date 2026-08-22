import { describe, expect, it } from "vitest";
import {
  qualityBenchmarkCases,
  qualityBenchmarkVersion,
} from "./quality-benchmark-cases.js";
import {
  evaluateQualityBenchmark,
  releaseQualityThresholds,
} from "./quality-benchmark.js";

describe(`conversation quality benchmark ${qualityBenchmarkVersion}`, () => {
  it("meets the release quality gate with balanced tier coverage", () => {
    const report = evaluateQualityBenchmark(qualityBenchmarkCases);
    expect(report.total).toBeGreaterThanOrEqual(24);
    expect(report.expectedByTier).toEqual({
      direct_opportunity: 6,
      helpful_conversation: 6,
      market_signal: 6,
      irrelevant: 6,
    });
    expect(report.thresholdFailures).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it("fails closed when non-actionable cases leak into the reply queue", () => {
    const report = evaluateQualityBenchmark(
      qualityBenchmarkCases,
      releaseQualityThresholds,
      () => ({ tier: "helpful_conversation" }),
    );
    expect(report.passed).toBe(false);
    expect(report.nonActionableLeakage).toBe(12);
    expect(
      report.thresholdFailures.some((failure) =>
        failure.includes("leaked into the reply queue"),
      ),
    ).toBe(true);
  });
});

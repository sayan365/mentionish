import {
  qualificationDecision,
  type ConversationFitScores,
  type DiscoveryTier,
} from "./engine.js";
import type { QualityBenchmarkCase } from "./quality-benchmark-cases.js";

const tiers: DiscoveryTier[] = [
  "direct_opportunity",
  "helpful_conversation",
  "market_signal",
  "irrelevant",
];

export interface QualityBenchmarkThresholds {
  minimumCasesPerTier: number;
  minimumExactAccuracy: number;
  minimumActionablePrecision: number;
  minimumActionableRecall: number;
  minimumDirectPrecision: number;
  maximumNonActionableLeakage: number;
}

export const releaseQualityThresholds: QualityBenchmarkThresholds = {
  minimumCasesPerTier: 4,
  minimumExactAccuracy: 85,
  minimumActionablePrecision: 90,
  minimumActionableRecall: 85,
  minimumDirectPrecision: 85,
  maximumNonActionableLeakage: 0,
};

export interface QualityBenchmarkFailure {
  id: string;
  title: string;
  expected: DiscoveryTier;
  predicted: DiscoveryTier;
}

export interface QualityBenchmarkReport {
  total: number;
  exactAccuracy: number;
  actionablePrecision: number;
  actionableRecall: number;
  directPrecision: number;
  nonActionableLeakage: number;
  expectedByTier: Record<DiscoveryTier, number>;
  predictedByTier: Record<DiscoveryTier, number>;
  failures: QualityBenchmarkFailure[];
  thresholdFailures: string[];
  passed: boolean;
}

type DecisionFunction = (scores: ConversationFitScores) => {
  tier: DiscoveryTier;
};

function percentage(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1_000) / 10;
}

function emptyTierCounts(): Record<DiscoveryTier, number> {
  return {
    direct_opportunity: 0,
    helpful_conversation: 0,
    market_signal: 0,
    irrelevant: 0,
  };
}

function isActionable(tier: DiscoveryTier): boolean {
  return tier === "direct_opportunity" || tier === "helpful_conversation";
}

export function evaluateQualityBenchmark(
  cases: QualityBenchmarkCase[],
  thresholds: QualityBenchmarkThresholds = releaseQualityThresholds,
  decide: DecisionFunction = qualificationDecision,
): QualityBenchmarkReport {
  const expectedByTier = emptyTierCounts();
  const predictedByTier = emptyTierCounts();
  const failures: QualityBenchmarkFailure[] = [];
  let exact = 0;
  let actionableTruePositive = 0;
  let actionableFalsePositive = 0;
  let actionableFalseNegative = 0;
  let directTruePositive = 0;
  let directFalsePositive = 0;
  let nonActionableLeakage = 0;

  for (const benchmarkCase of cases) {
    const predicted = decide(benchmarkCase.scores).tier;
    expectedByTier[benchmarkCase.expectedTier] += 1;
    predictedByTier[predicted] += 1;
    if (predicted === benchmarkCase.expectedTier) exact += 1;
    else
      failures.push({
        id: benchmarkCase.id,
        title: benchmarkCase.title,
        expected: benchmarkCase.expectedTier,
        predicted,
      });

    const expectedActionable = isActionable(benchmarkCase.expectedTier);
    const predictedActionable = isActionable(predicted);
    if (expectedActionable && predictedActionable) actionableTruePositive += 1;
    if (!expectedActionable && predictedActionable) {
      actionableFalsePositive += 1;
      nonActionableLeakage += 1;
    }
    if (expectedActionable && !predictedActionable)
      actionableFalseNegative += 1;
    if (
      benchmarkCase.expectedTier === "direct_opportunity" &&
      predicted === "direct_opportunity"
    )
      directTruePositive += 1;
    if (
      benchmarkCase.expectedTier !== "direct_opportunity" &&
      predicted === "direct_opportunity"
    )
      directFalsePositive += 1;
  }

  const exactAccuracy = percentage(exact, cases.length);
  const actionablePrecision = percentage(
    actionableTruePositive,
    actionableTruePositive + actionableFalsePositive,
  );
  const actionableRecall = percentage(
    actionableTruePositive,
    actionableTruePositive + actionableFalseNegative,
  );
  const directPrecision = percentage(
    directTruePositive,
    directTruePositive + directFalsePositive,
  );
  const thresholdFailures: string[] = [];
  for (const tier of tiers) {
    if (expectedByTier[tier] < thresholds.minimumCasesPerTier)
      thresholdFailures.push(
        `${tier} has ${expectedByTier[tier]} cases; requires ${thresholds.minimumCasesPerTier}`,
      );
  }
  if (exactAccuracy < thresholds.minimumExactAccuracy)
    thresholdFailures.push(
      `exact accuracy ${exactAccuracy}% is below ${thresholds.minimumExactAccuracy}%`,
    );
  if (actionablePrecision < thresholds.minimumActionablePrecision)
    thresholdFailures.push(
      `actionable precision ${actionablePrecision}% is below ${thresholds.minimumActionablePrecision}%`,
    );
  if (actionableRecall < thresholds.minimumActionableRecall)
    thresholdFailures.push(
      `actionable recall ${actionableRecall}% is below ${thresholds.minimumActionableRecall}%`,
    );
  if (directPrecision < thresholds.minimumDirectPrecision)
    thresholdFailures.push(
      `direct precision ${directPrecision}% is below ${thresholds.minimumDirectPrecision}%`,
    );
  if (nonActionableLeakage > thresholds.maximumNonActionableLeakage)
    thresholdFailures.push(
      `${nonActionableLeakage} non-actionable cases leaked into the reply queue; maximum is ${thresholds.maximumNonActionableLeakage}`,
    );

  return {
    total: cases.length,
    exactAccuracy,
    actionablePrecision,
    actionableRecall,
    directPrecision,
    nonActionableLeakage,
    expectedByTier,
    predictedByTier,
    failures,
    thresholdFailures,
    passed: thresholdFailures.length === 0,
  };
}

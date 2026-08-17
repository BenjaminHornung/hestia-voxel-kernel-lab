import type {
  BenchmarkWarmupRuleV1,
  BenchmarkWarmupAlgorithmV1,
} from './typesV1';

export const BENCHMARK_WARMUP_RULE_V1: BenchmarkWarmupRuleV1 = Object.freeze({
  id: 'br03-warmup-stability-v1' as BenchmarkWarmupRuleV1['id'],
  version: 1,
  algorithm: 'median-last-5-vs-preceding-5-relative-deviation-v1' as BenchmarkWarmupAlgorithmV1,
  windowSize: 5,
  maximumRelativeDeviation: 0.05,
  consecutiveStableComparisons: 2,
  minimumWarmupIterations: 10,
  maximumWarmupIterations: 50,
});

export interface BenchmarkWarmupComparisonV1 {
  readonly start: number;
  readonly precedingMedian: number;
  readonly latestMedian: number;
  readonly relativeDeviation: number;
  readonly stable: boolean;
}

export interface BenchmarkWarmupStabilityResultV1 {
  readonly status: 'STABLE' | 'WARMUP_NOT_STABLE';
  readonly comparisons: readonly BenchmarkWarmupComparisonV1[];
  readonly consecutiveStableComparisons: number;
  readonly stabilizationIteration: number | null;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = sorted.length / 2;
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[Math.floor(middle)]!;
}

export function recomputeWarmupStabilityV1(
  values: readonly number[],
  rule: BenchmarkWarmupRuleV1,
  metricEpsilon: number,
): BenchmarkWarmupStabilityResultV1 {
  if (values.length < rule.minimumWarmupIterations || values.length > rule.maximumWarmupIterations
    || !Number.isFinite(metricEpsilon) || metricEpsilon <= 0 || Object.is(metricEpsilon, -0)
    || values.some((value) => !Number.isFinite(value) || value < 0 || Object.is(value, -0))) {
    return { status: 'WARMUP_NOT_STABLE', comparisons: [], consecutiveStableComparisons: 0, stabilizationIteration: null };
  }

  const comparisons: BenchmarkWarmupComparisonV1[] = [];
  let consecutiveStableComparisons = 0;
  for (let start = 0; start <= values.length - rule.windowSize * 2; start += 1) {
    const precedingMedian = median(values.slice(start, start + rule.windowSize));
    const latestMedian = median(values.slice(start + rule.windowSize, start + rule.windowSize * 2));
    const denominator = Math.max(Math.abs(precedingMedian), Math.abs(latestMedian), metricEpsilon);
    const relativeDeviation = Math.abs(latestMedian - precedingMedian) / denominator;
    const stable = relativeDeviation <= rule.maximumRelativeDeviation;
    comparisons.push({ start, precedingMedian, latestMedian, relativeDeviation, stable });
    consecutiveStableComparisons = stable ? consecutiveStableComparisons + 1 : 0;
    if (consecutiveStableComparisons >= rule.consecutiveStableComparisons) {
      return { status: 'STABLE', comparisons, consecutiveStableComparisons, stabilizationIteration: start + rule.windowSize * 2 };
    }
  }
  return { status: 'WARMUP_NOT_STABLE', comparisons, consecutiveStableComparisons, stabilizationIteration: null };
}

/**
 * BR04 canonical statistics (v1): nearest-rank quantiles, deterministic
 * seed-bound hierarchical bootstrap (xoshiro128**-32-v1 reimplemented from
 * the documented algorithm specification, no copied foreign code), paired
 * difference/ratio estimators, practical-effect relations, and
 * display formatting.
 *
 * Rules implemented from BR04 report sections 9-10:
 * - rank(p,n) = max(1, ceil(p*n)), no interpolation, observed values only;
 * - p99 only for n >= 1000 matching valid observations;
 * - maximum always reported for non-empty populations, null when empty;
 * - 95% percentile CI from 10000 replicates, endpoints Q(0.025)/Q(0.975);
 * - no outlier deletion, winsorizing, or trimming anywhere;
 * - no Math.random(), Date.now(), locale, or filesystem order in output.
 */
import { createHash } from 'node:crypto';
import { canonicalizeJsonV1 } from '../provenance/canonicalJsonV1';
import {
  BR04_BOOTSTRAP_CONFIDENCE_V1,
  BR04_BOOTSTRAP_RESAMPLES_V1,
  BR04_MINIMUM_TOP_LEVEL_CLUSTERS_V1,
  BR04_P99_MINIMUM_OBSERVATIONS_V1,
  BR04_SEED_DOMAIN_V1,
  type Br04BootstrapIntervalV1,
  type Br04BootstrapPolicyV1,
  type Br04MetricDefinitionV1,
  type Br04MetricRef,
  type Br04PairedComparisonV1,
  type Br04QuantileResultV1,
  type Br04Sha256,
} from './br04ContractV1';

export function sha256OfCanonicalV1(value: unknown): Br04Sha256 {
  const bytes = canonicalizeJsonV1(value);
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function sha256OfUtf8V1(text: string): Br04Sha256 {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

/** Nearest-rank quantile over an ascending sorted non-empty population. */
export function nearestRankV1(sortedAscending: readonly number[], probability: number): number {
  const rank = Math.max(1, Math.ceil(probability * sortedAscending.length));
  return sortedAscending[rank - 1] as number;
}

export function sortedAscendingV1(values: readonly number[]): number[] {
  return [...values].sort((left, right) => left - right);
}

export interface Br04QuantileScopeV1 {
  readonly metricRef: Br04MetricRef;
  readonly scopeId: string;
  readonly unit: string;
  readonly sourceRunDigests: readonly Br04Sha256[];
}

export function quantileResultV1(
  scope: Br04QuantileScopeV1,
  values: readonly number[],
  probability: 0.5 | 0.95 | 0.99,
): Br04QuantileResultV1 {
  const minimumRequired = probability === 0.99 ? BR04_P99_MINIMUM_OBSERVATIONS_V1 : 1;
  const scopeDigest = sha256OfCanonicalV1({
    metricRef: scope.metricRef,
    scopeId: scope.scopeId,
    unit: scope.unit,
    sourceRunDigests: [...scope.sourceRunDigests].sort(),
  });
  if (values.length === 0) {
    return {
      schemaVersion: 1, metricRef: scope.metricRef, scopeId: scope.scopeId, scopeDigest,
      probability, method: 'inverse-ecdf-nearest-rank-v1', status: 'no-samples',
      nMatchingValidObservations: 0, minimumRequired, oneBasedRank: null, value: null,
      unit: scope.unit, sourceRunDigests: [...scope.sourceRunDigests].sort(),
    };
  }
  if (values.length < minimumRequired) {
    return {
      schemaVersion: 1, metricRef: scope.metricRef, scopeId: scope.scopeId, scopeDigest,
      probability, method: 'inverse-ecdf-nearest-rank-v1', status: 'insufficient-samples',
      nMatchingValidObservations: values.length, minimumRequired, oneBasedRank: null, value: null,
      unit: scope.unit, sourceRunDigests: [...scope.sourceRunDigests].sort(),
    };
  }
  const sorted = sortedAscendingV1(values);
  const rank = Math.max(1, Math.ceil(probability * sorted.length));
  return {
    schemaVersion: 1, metricRef: scope.metricRef, scopeId: scope.scopeId, scopeDigest,
    probability, method: 'inverse-ecdf-nearest-rank-v1', status: 'ok',
    nMatchingValidObservations: values.length, minimumRequired, oneBasedRank: rank,
    value: sorted[rank - 1] as number, unit: scope.unit,
    sourceRunDigests: [...scope.sourceRunDigests].sort(),
  };
}

export function maximumOfV1(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let maximum = values[0] as number;
  for (const value of values) {
    if (value > maximum) maximum = value;
  }
  return maximum;
}

export function arithmeticMeanV1(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

/** Geometric mean, defined only for strictly positive values. */
export function geometricMeanV1(values: readonly number[]): number | null {  if (values.length === 0) return null;
  let logSum = 0;
  for (const value of values) {
    if (!(value > 0) || !Number.isFinite(value)) return null;
    logSum += Math.log(value);
  }
  return Math.exp(logSum / values.length);
}

export type Br04PerRunStatisticV1 = Br04MetricDefinitionV1['perRunStatistic'];

const BR04_DOMAIN_CODES_V1 = {
  'positive-duration': 'NON_POSITIVE_DURATION',
  'non-negative-bytes': 'NON_NEGATIVE_BYTES_VIOLATION',
  'non-negative-count': 'NON_NEGATIVE_COUNT_VIOLATION',
  'positive-ratio-component': 'NON_POSITIVE_RATIO_COMPONENT',
  revision: 'REVISION_DOMAIN_VIOLATION',
} as const;

/** Fail-closed numeric domain check for valid samples; null means the value is admissible. */
export function checkDomainV1(
  domain: Br04MetricDefinitionV1['numericDomain'],
  value: number,
): string | null {
  switch (domain) {
    case 'positive-duration':
    case 'positive-ratio-component':
      return Number.isFinite(value) && value > 0 ? null : BR04_DOMAIN_CODES_V1[domain];
    case 'non-negative-bytes':
    case 'non-negative-count':
      return Number.isSafeInteger(value) && value >= 0 ? null : BR04_DOMAIN_CODES_V1[domain];
    case 'revision':
      return Number.isSafeInteger(value) && value >= 0 ? null : BR04_DOMAIN_CODES_V1[domain];
    default:
      return 'UNKNOWN_DOMAIN';
  }
}

export function perRunScalarV1(
  values: readonly number[],
  statistic: Br04PerRunStatisticV1,
): number | null {
  switch (statistic) {
    case 'identity':
      return values.length === 1 ? (values[0] as number) : null;
    case 'count':
      return values.length;
    case 'sum': {
      let sum = 0;
      for (const value of values) sum += value;
      return sum;
    }
    case 'max':
      return maximumOfV1(values);
    case 'nearest-rank-p50':
      return values.length === 0 ? null : nearestRankV1(sortedAscendingV1(values), 0.5);
    case 'nearest-rank-p95':
      return values.length === 0 ? null : nearestRankV1(sortedAscendingV1(values), 0.95);
    case 'nearest-rank-p99':
      return values.length < BR04_P99_MINIMUM_OBSERVATIONS_V1
        ? null
        : nearestRankV1(sortedAscendingV1(values), 0.99);
    default:
      return null;
  }
}

export type Br04CellEstimatorV1 = Br04MetricDefinitionV1['cellEstimator'];
export function cellEstimatorV1(
  scalars: readonly number[],
  estimator: Br04CellEstimatorV1,
): number | null {
  switch (estimator) {
    case 'median':
      return scalars.length === 0 ? null : nearestRankV1(sortedAscendingV1(scalars), 0.5);
    case 'arithmetic-mean':
      return arithmeticMeanV1(scalars);
    case 'geometric-mean':
      return geometricMeanV1(scalars);
    default:
      return null;
  }
}

/**
 * xoshiro128** 1.0 32-bit PRNG state, reimplemented from the published
 * algorithm specification (public domain reference; see BR04 report 21).
 */
export interface Br04PrngStateV1 {
  s0: number;
  s1: number;
  s2: number;
  s3: number;
}

function rotl32V1(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

export function prngNextUint32V1(state: Br04PrngStateV1): number {
  const result = (rotl32V1(Math.imul(state.s1, 5), 7) * 9) >>> 0;
  const t = (state.s1 << 9) >>> 0;
  state.s2 = (state.s2 ^ state.s0) >>> 0;
  state.s3 = (state.s3 ^ state.s1) >>> 0;
  state.s1 = (state.s1 ^ state.s2) >>> 0;
  state.s0 = (state.s0 ^ state.s3) >>> 0;
  state.s2 = (state.s2 ^ t) >>> 0;
  state.s3 = rotl32V1(state.s3, 11);
  return result;
}

export interface Br04DerivedSeedV1 {
  readonly seedMaterialDigest: Br04Sha256;
  readonly derivedSeedHex: string;
  readonly state: Br04PrngStateV1;
}

export function derivePrngSeedV1(
  masterSeedHex: string,
  normalizedInputDigest: Br04Sha256,
  metricRef: Br04MetricRef,
  canonicalGroupKey: string,
  estimatorId: string,
): Br04DerivedSeedV1 {
  const material =
    `${BR04_SEED_DOMAIN_V1}\0${masterSeedHex}\0${normalizedInputDigest}\0` +
    `${metricRef}\0${canonicalGroupKey}\0${estimatorId}`;
  const digestBytes = createHash('sha256').update(material, 'utf8').digest();
  const words = [
    digestBytes.readUInt32LE(0),
    digestBytes.readUInt32LE(4),
    digestBytes.readUInt32LE(8),
    digestBytes.readUInt32LE(12),
  ];
  if (words[0] === 0 && words[1] === 0 && words[2] === 0 && words[3] === 0) {
    words[0] = 0x9e3779b9;
  }
  const hex = (digestBytes.subarray(0, 16)).toString('hex');
  return {
    seedMaterialDigest: `sha256:${createHash('sha256').update(material, 'utf8').digest('hex')}`,
    derivedSeedHex: hex,
    state: { s0: words[0] as number, s1: words[1] as number, s2: words[2] as number, s3: words[3] as number },
  };
}

/** Unbiased index draw from [0, n) via uint32 rejection sampling. */
export function drawIndexV1(state: Br04PrngStateV1, n: number): number {
  if (!Number.isSafeInteger(n) || n <= 0) throw new RangeError('drawIndexV1 requires n >= 1.');
  const range = 4294967296;
  const limit = Math.floor(range / n) * n;
  for (;;) {
    const candidate = prngNextUint32V1(state);
    if (candidate < limit) return candidate % n;
  }
}

export interface Br04AbsoluteClusterInputV1 {
  readonly clusterId: string;
  readonly runId: string;
  readonly runDigest: Br04Sha256;
  /** Eligible event values pooled across the run (non-warmup iterations only). */
  readonly values: readonly number[];
  /** Eligible event values grouped per iteration, same order as observed. */
  readonly iterations: readonly (readonly number[])[];
}

export interface Br04AbsoluteBootstrapInputV1 {
  readonly metricRef: Br04MetricRef;
  readonly unit: string;
  readonly canonicalGroupKey: string;
  readonly estimatorId: string;
  readonly estimator: Br04CellEstimatorV1;
  readonly perRunStatistic: Br04PerRunStatisticV1;
  readonly lowerLevel: Br04MetricDefinitionV1['lowerLevelResampling'];
  readonly clusters: readonly Br04AbsoluteClusterInputV1[];
  readonly masterSeedHex: string;
  readonly normalizedInputDigest: Br04Sha256;
}

export interface Br04AbsoluteBootstrapResultV1 {
  readonly point: number | null;
  readonly interval: Br04BootstrapIntervalV1;
  readonly replicateValues: readonly number[];
}

function resampledRunValuesV1(
  run: Br04AbsoluteClusterInputV1,
  lowerLevel: Br04MetricDefinitionV1['lowerLevelResampling'],
  state: Br04PrngStateV1,
  perRunStatistic: Br04PerRunStatisticV1,
): number | null {
  if (lowerLevel === 'none' || lowerLevel === 'fixed-workload') {
    return perRunScalarV1(run.values, perRunStatistic);
  }
  if (run.iterations.length === 0) return null;
  const pooled: number[] = [];
  for (let copy = 0; copy < run.iterations.length; copy += 1) {
    const iteration = run.iterations[drawIndexV1(state, run.iterations.length)] as readonly number[];
    for (const value of iteration) pooled.push(value);
  }
  return perRunScalarV1(pooled, perRunStatistic);
}

/**
 * Hierarchical percentile bootstrap for absolute cell estimators.
 * Outer unit: browser-process clusters. Inner: runs, then the
 * metric-specific lower-level policy. Chunk events are never resampled
 * as independent top-level replicates.
 */
export function bootstrapAbsoluteV1(input: Br04AbsoluteBootstrapInputV1): Br04AbsoluteBootstrapResultV1 {
  const policy: Br04BootstrapPolicyV1 = {
    method: 'hierarchical-percentile-v1',
    confidenceLevel: BR04_BOOTSTRAP_CONFIDENCE_V1,
    resamples: BR04_BOOTSTRAP_RESAMPLES_V1,
    minimumTopLevelClusters: BR04_MINIMUM_TOP_LEVEL_CLUSTERS_V1,
    masterSeedHex: input.masterSeedHex,
    seedDerivation: 'sha256-bound-xoshiro128ss-v1',
    prng: 'xoshiro128**-32-v1',
    indexSampling: 'uint32-rejection-v1',
  };
  const derived = derivePrngSeedV1(
    input.masterSeedHex, input.normalizedInputDigest, input.metricRef,
    input.canonicalGroupKey, input.estimatorId,
  );
  const byCluster = new Map<string, Br04AbsoluteClusterInputV1[]>();
  for (const run of input.clusters) {
    const group = byCluster.get(run.clusterId);
    if (group === undefined) byCluster.set(run.clusterId, [run]);
    else group.push(run);
  }
  const clusterIds = [...byCluster.keys()].sort();
  const topLevelClusters = clusterIds.length;
  let totalRuns = 0;
  let totalIterations = 0;
  let totalEvents = 0;
  for (const runs of byCluster.values()) {
    totalRuns += runs.length;
    for (const run of runs) {
      totalIterations += run.iterations.length;
      totalEvents += run.values.length;
    }
  }
  const estimate = (replicateState: Br04PrngStateV1 | null): number | null => {
    const scalars: number[] = [];
    for (const clusterId of clusterIds) {
      const sourceId = replicateState === null
        ? clusterId
        : clusterIds[drawIndexV1(replicateState, clusterIds.length)] as string;
      const runs = byCluster.get(sourceId) as Br04AbsoluteClusterInputV1[];
      for (let copy = 0; copy < runs.length; copy += 1) {
        const run = replicateState === null
          ? runs[copy] as Br04AbsoluteClusterInputV1
          : runs[drawIndexV1(replicateState, runs.length)] as Br04AbsoluteClusterInputV1;
        // The point estimate always uses the observed full event set; the
        // lower-level policy applies to bootstrap replicates only.
        const scalar = replicateState === null
          ? perRunScalarV1(run.values, input.perRunStatistic)
          : resampledRunValuesV1(run, input.lowerLevel, replicateState, input.perRunStatistic);
        if (scalar !== null) scalars.push(scalar);
      }
    }
    return cellEstimatorV1(scalars, input.estimator);
  };
  const point = topLevelClusters === 0 ? null : estimate(null);
  const fail = (
    status: Br04BootstrapIntervalV1['status'],
  ): Br04AbsoluteBootstrapResultV1 => ({
    point,
    interval: {
      schemaVersion: 1, metricRef: input.metricRef, estimatorId: input.estimatorId,
      status, method: policy.method, confidenceLevel: policy.confidenceLevel,
      resamples: policy.resamples, lower: null, upper: null, unit: input.unit,
      hierarchy: ['browser-process', 'run', input.lowerLevel],
      topLevelClusters, runs: totalRuns, iterations: totalIterations, events: totalEvents,
      masterSeedHex: input.masterSeedHex, seedMaterialDigest: derived.seedMaterialDigest,
      derivedSeedHex: derived.derivedSeedHex, replicateVectorDigest: null,
    },
    replicateValues: [],
  });
  if (topLevelClusters === 0 || point === null) return fail('no-data');
  if (topLevelClusters < BR04_MINIMUM_TOP_LEVEL_CLUSTERS_V1) return fail('insufficient-clusters');
  const replicates: number[] = [];
  for (let replicate = 0; replicate < BR04_BOOTSTRAP_RESAMPLES_V1; replicate += 1) {
    const value = estimate(derived.state);
    if (value === null || !Number.isFinite(value)) {
      return fail('no-data');
    }
    replicates.push(value);
  }
  const sorted = sortedAscendingV1(replicates);
  return {
    point,
    interval: {
      schemaVersion: 1, metricRef: input.metricRef, estimatorId: input.estimatorId,
      status: 'ok', method: policy.method, confidenceLevel: policy.confidenceLevel,
      resamples: policy.resamples,
      lower: nearestRankV1(sorted, 0.025),
      upper: nearestRankV1(sorted, 0.975),
      unit: input.unit,
      hierarchy: ['browser-process', 'run', input.lowerLevel],
      topLevelClusters, runs: totalRuns, iterations: totalIterations, events: totalEvents,
      masterSeedHex: input.masterSeedHex, seedMaterialDigest: derived.seedMaterialDigest,
      derivedSeedHex: derived.derivedSeedHex,
      replicateVectorDigest: sha256OfCanonicalV1(sorted),
    },
    replicateValues: replicates,
  };
}

export interface Br04PairedClusterInputV1 {
  readonly balanceBlockId: string;
  readonly pairs: readonly {
    readonly pairCellId: string;
    readonly pairOrdinal: number;
    readonly referenceScalar: number;
    readonly candidateScalar: number;
  }[];
}

export interface Br04PairedBootstrapInputV1 {
  readonly metricRef: Br04MetricRef;
  readonly unit: string;
  readonly canonicalGroupKey: string;
  readonly estimatorId: string;
  readonly clusters: readonly Br04PairedClusterInputV1[];
  readonly masterSeedHex: string;
  readonly normalizedInputDigest: Br04Sha256;
}

export interface Br04PairedBootstrapResultV1 {
  readonly differenceReplicates: readonly number[];
  readonly ratioReplicates: readonly number[];
  readonly differenceInterval: Br04BootstrapIntervalV1;
  readonly ratioInterval: Br04BootstrapIntervalV1;
}

/**
 * Hierarchical paired bootstrap. Outer unit: BR03 balance blocks.
 * Reference and candidate arms of a pair cell are never resampled
 * independently. Pair identity is (balanceBlockId, pairCellId,
 * pairOrdinal); bootstrapClusterId is never a pairing criterion.
 *
 * R2/B5 (report section 9.9): difference and ratio are evaluated
 * independently. A pair cell with an undefined ratio still contributes
 * to the difference evaluation; it never contributes to the ratio
 * evaluation. An undefined ratio suppresses only the ratio interval.
 *
 * R2/B6: difference and ratio replicates draw from their own derived
 * streams (differenceDerived / ratioDerived); the reported provenance
 * always names the stream actually used. Ratio intervals carry the
 * dimensionless unit 'ratio', never the input metric unit.
 */
export function bootstrapPairedV1(input: Br04PairedBootstrapInputV1): Br04PairedBootstrapResultV1 {
  const differenceEstimatorId = `${input.estimatorId}:difference-median`;
  const ratioEstimatorId = `${input.estimatorId}:ratio-geomean`;
  const differenceDerived = derivePrngSeedV1(
    input.masterSeedHex, input.normalizedInputDigest, input.metricRef,
    input.canonicalGroupKey, differenceEstimatorId,
  );
  const ratioDerived = derivePrngSeedV1(
    input.masterSeedHex, input.normalizedInputDigest, input.metricRef,
    input.canonicalGroupKey, ratioEstimatorId,
  );
  const clusters = [...input.clusters].sort((left, right) =>
    left.balanceBlockId < right.balanceBlockId ? -1 : left.balanceBlockId > right.balanceBlockId ? 1 : 0,
  );
  const topLevelClusters = clusters.length;
  const finish = (
    estimatorId: string,
    derived: { seedMaterialDigest: Br04Sha256; derivedSeedHex: string },
    replicates: readonly number[],
    status: Br04BootstrapIntervalV1['status'],
    unit: string,
    clusterCount: number,
  ): Br04BootstrapIntervalV1 => {
    const sorted = sortedAscendingV1(replicates);
    return {
      schemaVersion: 1, metricRef: input.metricRef, estimatorId,
      status, method: 'hierarchical-percentile-v1',
      confidenceLevel: BR04_BOOTSTRAP_CONFIDENCE_V1, resamples: BR04_BOOTSTRAP_RESAMPLES_V1,
      lower: status === 'ok' ? nearestRankV1(sorted, 0.025) : null,
      upper: status === 'ok' ? nearestRankV1(sorted, 0.975) : null,
      unit,
      hierarchy: ['balance-block', 'pair-cell'],
      topLevelClusters: clusterCount, runs: 0, iterations: 0, events: 0,
      masterSeedHex: input.masterSeedHex, seedMaterialDigest: derived.seedMaterialDigest,
      derivedSeedHex: derived.derivedSeedHex,
      replicateVectorDigest: status === 'ok' ? sha256OfCanonicalV1(sorted) : null,
    };
  };
  if (topLevelClusters === 0) {
    return {
      differenceReplicates: [],
      ratioReplicates: [],
      differenceInterval: finish(differenceEstimatorId, differenceDerived, [], 'no-data', input.unit, 0),
      ratioInterval: finish(ratioEstimatorId, ratioDerived, [], 'no-data', 'ratio', 0),
    };
  }
  if (topLevelClusters < BR04_MINIMUM_TOP_LEVEL_CLUSTERS_V1) {
    return {
      differenceReplicates: [],
      ratioReplicates: [],
      differenceInterval: finish(differenceEstimatorId, differenceDerived, [], 'insufficient-clusters', input.unit, topLevelClusters),
      ratioInterval: finish(ratioEstimatorId, ratioDerived, [], 'insufficient-clusters', 'ratio', topLevelClusters),
    };
  }
  const differenceReplicates: number[] = [];
  for (let replicate = 0; replicate < BR04_BOOTSTRAP_RESAMPLES_V1; replicate += 1) {
    const differences: number[] = [];
    for (let copy = 0; copy < clusters.length; copy += 1) {
      const cluster = clusters[drawIndexV1(differenceDerived.state, clusters.length)] as Br04PairedClusterInputV1;
      for (let pairCopy = 0; pairCopy < cluster.pairs.length; pairCopy += 1) {
        const pair = cluster.pairs[drawIndexV1(differenceDerived.state, cluster.pairs.length)] as {
          readonly referenceScalar: number; readonly candidateScalar: number;
        };
        differences.push(pair.candidateScalar - pair.referenceScalar);
      }
    }
    differenceReplicates.push(nearestRankV1(sortedAscendingV1(differences), 0.5));
  }
  const positiveClusters: Br04PairedClusterInputV1[] = [];
  for (const cluster of clusters) {
    const positivePairs = cluster.pairs.filter(
      (pair) => pair.referenceScalar > 0 && pair.candidateScalar > 0,
    );
    if (positivePairs.length > 0) {
      positiveClusters.push({ balanceBlockId: cluster.balanceBlockId, pairs: positivePairs });
    }
  }
  const ratioReplicates: number[] = [];
  let ratioStatus: Br04BootstrapIntervalV1['status'] = 'no-data';
  if (positiveClusters.length > 0) {
    ratioStatus = 'ok';
    for (let replicate = 0; replicate < BR04_BOOTSTRAP_RESAMPLES_V1; replicate += 1) {
      const ratios: number[] = [];
      for (let copy = 0; copy < positiveClusters.length; copy += 1) {
        const cluster = positiveClusters[drawIndexV1(ratioDerived.state, positiveClusters.length)] as Br04PairedClusterInputV1;
        for (let pairCopy = 0; pairCopy < cluster.pairs.length; pairCopy += 1) {
          const pair = cluster.pairs[drawIndexV1(ratioDerived.state, cluster.pairs.length)] as {
            readonly referenceScalar: number; readonly candidateScalar: number;
          };
          ratios.push(pair.candidateScalar / pair.referenceScalar);
        }
      }
      const ratio = geometricMeanV1(ratios);
      if (ratio === null) {
        ratioStatus = 'no-data';
        ratioReplicates.length = 0;
        break;
      }
      ratioReplicates.push(ratio);
    }
  }
  return {
    differenceReplicates,
    ratioReplicates,
    differenceInterval: finish(differenceEstimatorId, differenceDerived, differenceReplicates, 'ok', input.unit, topLevelClusters),
    ratioInterval: finish(ratioEstimatorId, ratioDerived, ratioReplicates, ratioStatus, 'ratio', positiveClusters.length),
  };
}

export function practicalEffectV1(
  delta: number | null,
  direction: Br04MetricDefinitionV1['direction'],
  ratioPoint: number | null,
  ratioLower: number | null,
  ratioUpper: number | null,
  ciAvailable: boolean,
): Br04PairedComparisonV1['practicalEffect'] {
  const band: readonly [number, number] | null = delta === null ? null : [1 - delta, 1 + delta] as const;
  if (delta === null || ratioPoint === null) {
    return {
      delta, band,
      pointRelation: direction === 'context-dependent' && delta !== null ? 'context-dependent' : 'not-configured',
      intervalRelation: 'unavailable',
      ciRelationToOne: ciAvailable && ratioLower !== null && ratioUpper !== null
        ? ratioUpper < 1 ? 'below' : ratioLower > 1 ? 'above' : 'contains'
        : 'unavailable',
    };
  }
  const [low, high] = band as readonly [number, number];
  if (direction === 'context-dependent') {
    return {
      delta, band, pointRelation: 'context-dependent',
      intervalRelation: ciAvailable && ratioLower !== null && ratioUpper !== null
        ? ratioUpper < low || ratioLower > high ? 'overlaps-boundary' : ratioLower >= low && ratioUpper <= high
          ? 'entirely-inside-band' : 'overlaps-boundary'
        : 'unavailable',
      ciRelationToOne: ciAvailable && ratioLower !== null && ratioUpper !== null
        ? ratioUpper < 1 ? 'below' : ratioLower > 1 ? 'above' : 'contains'
        : 'unavailable',
    };
  }
  const improved = direction === 'lower-is-better'
    ? (value: number): boolean => value <= low
    : (value: number): boolean => value >= high;
  const regressed = direction === 'lower-is-better'
    ? (value: number): boolean => value >= high
    : (value: number): boolean => value <= low;
  const pointRelation = improved(ratioPoint)
    ? 'practical-improvement'
    : regressed(ratioPoint)
      ? 'practical-regression'
      : 'inside-practical-band';
  let intervalRelation: Br04PairedComparisonV1['practicalEffect']['intervalRelation'] = 'unavailable';
  if (ciAvailable && ratioLower !== null && ratioUpper !== null) {
    if (ratioLower >= low && ratioUpper <= high) {
      intervalRelation = 'entirely-inside-band';
    } else if (direction === 'lower-is-better') {
      intervalRelation = ratioUpper <= low ? 'entirely-improvement' : ratioLower >= high ? 'entirely-regression' : 'overlaps-boundary';
    } else {
      intervalRelation = ratioLower >= high ? 'entirely-improvement' : ratioUpper <= low ? 'entirely-regression' : 'overlaps-boundary';
    }
  }
  return {
    delta, band, pointRelation, intervalRelation,
    ciRelationToOne: ciAvailable && ratioLower !== null && ratioUpper !== null
      ? ratioUpper < 1 ? 'below' : ratioLower > 1 ? 'above' : 'contains'
      : 'unavailable',
  };
}

/**
 * Markdown display formatting: safe integers without a decimal point,
 * otherwise ECMAScript toPrecision(6) semantics with unnecessary trailing
 * zeros removed. Rounding is display only; claim trace always references
 * the unrounded JSON value.
 */
export function formatSignificantV1(value: number): string {
  if (Number.isSafeInteger(value)) return String(value);
  let text = value.toPrecision(6);
  if (text.includes('e') || text.includes('E')) return text;
  if (text.includes('.')) {
    text = text.replace(/0+$/, '');
    if (text.endsWith('.')) text = text.slice(0, -1);
  }
  return text;
}

/**
 * BR04 golden fixtures H01-H04: hierarchy, bootstrap clusters,
 * determinism (report sections 9.8-9.10, 10, 16.2).
 */
import { describe, expect, it } from 'vitest';
import { validateAndAggregateBundleV1 } from '../../../../src/benchmark/aggregate/br04AggregateV1';
import {
  bootstrapAbsoluteV1,
  derivePrngSeedV1,
} from '../../../../src/benchmark/aggregate/br04StatisticsV1';
import { buildReportModelV1, renderMarkdownReportV1 } from '../../../../src/benchmark/reports/br04MarkdownReportV1';
import type { Br04MetricRef } from '../../../../src/benchmark/aggregate/br04ContractV1';
import {
  BR04_SYNTHETIC_SEED_00_V1,
  BR04_SYNTHETIC_SEED_01_V1,
  buildTestBundleV1,
  chunkMetricV1,
  fakeDigestV1,
  iterationV1,
} from '../../../fixtures/benchmark/aggregate/br04FixtureBuildersV1';
import { BR04_GOLDEN_DIGESTS_V1 } from '../../../fixtures/benchmark/aggregate/br04GoldenDigestsV1';

const CHUNK = 'chunk.mesh.cpu.ms@1' as Br04MetricRef;

function hierarchyBundleV1(bundleId: string, masterSeedHex = BR04_SYNTHETIC_SEED_00_V1) {
  return buildTestBundleV1({
    bundleId,
    masterSeedHex,
    metrics: [{ ...chunkMetricV1(), perRunStatistic: 'nearest-rank-p50', lowerLevelResampling: 'fixed-workload' as const }],
    slots: [
      { slotId: 'slot-p1', candidateId: 'candidate-a', bootstrapClusterId: 'cluster-p1' },
      { slotId: 'slot-p2', candidateId: 'candidate-a', bootstrapClusterId: 'cluster-p2' },
      { slotId: 'slot-p3', candidateId: 'candidate-a', bootstrapClusterId: 'cluster-p3' },
    ],
    runs: [
      {
        runId: 'run-p1', slotId: 'slot-p1', processId: 'process-p1',
        iterations: [iterationV1('iter-p1', CHUNK, Array.from({ length: 100 }, () => 1))],
      },
      {
        runId: 'run-p2', slotId: 'slot-p2', processId: 'process-p2',
        iterations: [iterationV1('iter-p2', CHUNK, [10])],
      },
      {
        runId: 'run-p3', slotId: 'slot-p3', processId: 'process-p3',
        iterations: [iterationV1('iter-p3', CHUNK, [100])],
      },
    ],
  });
}

describe('BR04 hierarchy and bootstrap goldens', () => {
  it('H01 process-level hierarchy: scalars [1,10,100], cell point 10, three clusters', () => {
    const { validation, aggregate } = validateAndAggregateBundleV1(hierarchyBundleV1('h01'));
    expect(validation.status).toBe('valid');
    const cell = aggregate?.environmentCells[0]?.metricCells[0];
    expect(cell?.perRunSummaries.map((summary) => summary.comparisonScalar)).toEqual([1, 10, 100]);
    expect(cell?.cellPointEstimate).toBe(10);
    expect(cell?.cellInterval.topLevelClusters).toBe(3);
    expect(cell?.cellInterval.status).toBe('ok');
    expect(cell?.cellInterval.lower).toBe(1);
    expect(cell?.cellInterval.upper).toBe(100);
    expect(cell?.populationQualification).toBe('technical-only');
  });

  it('H01 bootstrap support stays inside {1,10,100}: clusters only, never event-weighted', () => {
    const clusters = [
      {
        clusterId: 'process-p1', runId: 'run-p1', runDigest: fakeDigestV1('h01-p1'),
        values: Array.from({ length: 100 }, () => 1),
        iterations: [Array.from({ length: 100 }, () => 1)] as readonly (readonly number[])[],
      },
      {
        clusterId: 'process-p2', runId: 'run-p2', runDigest: fakeDigestV1('h01-p2'),
        values: [10], iterations: [[10]] as readonly (readonly number[])[],
      },
      {
        clusterId: 'process-p3', runId: 'run-p3', runDigest: fakeDigestV1('h01-p3'),
        values: [100], iterations: [[100]] as readonly (readonly number[])[],
      },
    ];
    const result = bootstrapAbsoluteV1({
      metricRef: CHUNK, unit: 'ms', canonicalGroupKey: 'h01-support',
      estimatorId: 'cell-median', estimator: 'median',
      perRunStatistic: 'nearest-rank-p50', lowerLevel: 'fixed-workload',
      clusters, masterSeedHex: BR04_SYNTHETIC_SEED_00_V1,
      normalizedInputDigest: fakeDigestV1('h01-input'),
    });
    expect(result.point).toBe(10);
    expect(result.replicateValues.length).toBe(10000);
    for (const replicate of result.replicateValues) {
      expect([1, 10, 100]).toContain(replicate);
    }
    expect(result.interval.lower).toBe(1);
    expect(result.interval.upper).toBe(100);
  });

  it('H02 same seed is byte-identical across aggregate JSON and markdown', () => {
    const first = validateAndAggregateBundleV1(hierarchyBundleV1('h02'));
    const second = validateAndAggregateBundleV1(hierarchyBundleV1('h02'));
    expect(first.validation.status).toBe('valid');
    expect(JSON.stringify(first.aggregate)).toBe(JSON.stringify(second.aggregate));
    expect(first.aggregate?.aggregateDigest).toBe(BR04_GOLDEN_DIGESTS_V1.h01AggregateDigest);
    const firstMarkdown = renderMarkdownReportV1(buildReportModelV1(first.aggregate ?? (() => {
      throw new Error('missing aggregate');
    })()));
    const secondMarkdown = renderMarkdownReportV1(buildReportModelV1(second.aggregate ?? (() => {
      throw new Error('missing aggregate');
    })()));
    expect(firstMarkdown).toBe(secondMarkdown);
  });

  it('H03 reversed input order leaves digests and aggregates identical', () => {
    const bundle = hierarchyBundleV1('h03');
    const reversed = {
      ...bundle,
      runs: [...bundle.runs].reverse(),
      runPlan: { ...bundle.runPlan, slots: [...bundle.runPlan.slots].reverse() },
      metricRegistry: [...bundle.metricRegistry].reverse(),
    };
    const first = validateAndAggregateBundleV1(bundle);
    const second = validateAndAggregateBundleV1(reversed);
    expect(second.validation.status).toBe('valid');
    expect(JSON.stringify(second.aggregate)).toBe(JSON.stringify(first.aggregate));
  });

  it('H04 different seeds share the point but bind different seeds and replicate digests', () => {
    const seed00 = validateAndAggregateBundleV1(hierarchyBundleV1('h04a', BR04_SYNTHETIC_SEED_00_V1));
    const seed01 = validateAndAggregateBundleV1(hierarchyBundleV1('h04b', BR04_SYNTHETIC_SEED_01_V1));
    const cell00 = seed00.aggregate?.environmentCells[0]?.metricCells[0];
    const cell01 = seed01.aggregate?.environmentCells[0]?.metricCells[0];
    expect(cell00?.cellPointEstimate).toBe(10);
    expect(cell01?.cellPointEstimate).toBe(10);
    expect(cell00?.cellInterval.derivedSeedHex).not.toBe(cell01?.cellInterval.derivedSeedHex);
    expect(cell00?.cellInterval.replicateVectorDigest).not.toBe(cell01?.cellInterval.replicateVectorDigest);
    const derived00 = derivePrngSeedV1(BR04_SYNTHETIC_SEED_00_V1, fakeDigestV1('x'), CHUNK, 'g', 'e');
    const derived01 = derivePrngSeedV1(BR04_SYNTHETIC_SEED_01_V1, fakeDigestV1('x'), CHUNK, 'g', 'e');
    expect(derived00.derivedSeedHex).not.toBe(derived01.derivedSeedHex);
  });
});

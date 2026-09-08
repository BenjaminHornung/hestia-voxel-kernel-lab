/**
 * BR04 R3 / Ratio-Mindestcluster: the minimum top-level cluster count must
 * be re-checked AFTER estimator-dependent filtering. With 3 blocks
 * Ref [1,0,0] / Cand [2,2,2], the difference bootstrap sees 3 clusters
 * (ok) but the ratio bootstrap sees only 1 positive cluster and must
 * report insufficient-clusters instead of ok.
 */
import { describe, expect, it } from 'vitest';
import { validateAndAggregateBundleV1 } from '../../../../src/benchmark/aggregate/br04AggregateV1';
import { bootstrapPairedV1 } from '../../../../src/benchmark/aggregate/br04StatisticsV1';
import type { Br04MetricRef } from '../../../../src/benchmark/aggregate/br04ContractV1';
import {
  BR04_SYNTHETIC_SEED_00_V1,
  fakeDigestV1,
  R2_COUNT_V1,
  r2BundleV1,
  r2EntryV1,
  r2PlanV1,
  type R2RunSpecV1,
  type R2UnitSpecV1,
} from '../../../fixtures/benchmark/aggregate/br04FixtureBuildersV1';

const CHUNK = 'chunk.mesh.cpu.ms@1' as Br04MetricRef;

function clustersV1(refs: readonly number[], cands: readonly number[]) {
  return refs.map((referenceScalar, index) => ({
    balanceBlockId: `bb-${index + 1}`,
    pairs: [{
      pairCellId: `pc-${index + 1}`,
      pairOrdinal: 1,
      referenceScalar,
      candidateScalar: cands[index] as number,
    }],
  }));
}

describe('br04 R3 ratio minimum clusters after filtering', () => {
  it('statistics level: 3 blocks Ref [1,0,0]/Cand [2,2,2] -> difference ok, ratio insufficient-clusters', () => {
    const result = bootstrapPairedV1({
      metricRef: CHUNK,
      unit: 'ms',
      canonicalGroupKey: 'r3-ratio-minimum',
      estimatorId: 'paired:r3',
      clusters: clustersV1([1, 0, 0], [2, 2, 2]),
      masterSeedHex: BR04_SYNTHETIC_SEED_00_V1,
      normalizedInputDigest: fakeDigestV1('r3-ratio-minimum-input'),
    });
    expect(result.differenceInterval.status).toBe('ok');
    expect(result.differenceReplicates.length).toBe(10000);
    expect(result.ratioInterval.status).toBe('insufficient-clusters');
    expect(result.ratioReplicates.length).toBe(0);
    expect(result.ratioInterval.topLevelClusters).toBe(1);
  });

  it('bundle level: paired count comparison reports difference ok and ratio insufficient-clusters', () => {
    const refs = [1, 0, 0];
    const cands = [2, 2, 2];
    const units: R2UnitSpecV1[] = [];
    const specs: R2RunSpecV1[] = [];
    refs.forEach((referenceValue, index) => {
      const block = index + 1;
      units.push(
        { slot: `slot-r${block}`, candidate: 'ref', block: `bb-${block}`, pairCell: `pc-${block}`, pairOrdinal: 1 },
        { slot: `slot-c${block}`, candidate: 'cmp', block: `bb-${block}`, pairCell: `pc-${block}`, pairOrdinal: 1 },
      );
      const dims = [{ key: 'observation-window-id', value: 'window-0' }];
      specs.push(
        {
          runId: `run-r${block}`, slot: `slot-r${block}`, candidate: 'ref', block: `bb-${block}`,
          metric: R2_COUNT_V1, values: [referenceValue], dims, capabilities: ['long-tasks'],
        },
        {
          runId: `run-c${block}`, slot: `slot-c${block}`, candidate: 'cmp', block: `bb-${block}`,
          metric: R2_COUNT_V1, values: [cands[index] as number], dims, capabilities: ['long-tasks'],
        },
      );
    });
    const plan = r2PlanV1('r3-ratio-min', units, { comparisonMode: 'reference-paired', referenceCandidateId: 'ref' });
    const { bundle, issues } = r2BundleV1('r3-ratio-min', plan, specs.map((spec) => r2EntryV1(plan, spec)));
    expect(issues).toEqual([]);
    const { validation, aggregate } = validateAndAggregateBundleV1(bundle ?? (() => {
      throw new Error('missing bundle');
    })());
    expect(validation.status).toBe('valid');
    const comparison = aggregate?.pairedComparisons.find((entry) => entry.metricRef === R2_COUNT_V1);
    expect(comparison?.pairs.complete).toBe(3);
    expect(comparison?.differenceInterval.status).toBe('ok');
    expect(comparison?.ratioInterval.status).toBe('insufficient-clusters');
  });
});

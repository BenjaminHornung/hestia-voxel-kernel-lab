/**
 * BR04 R3 / B2-Rest: same-run partition by the full metric tag tuple.
 * One run carrying memory.bytes@1 samples with memoryKind js-heap (=1)
 * and embedder-heap (=1000) must yield TWO populations (maxima 1 / 1000),
 * never one pooled population with max 1000.
 */
import { describe, expect, it } from 'vitest';
import { validateAndAggregateBundleV1 } from '../../../../src/benchmark/aggregate/br04AggregateV1';
import type {
  Br04MetricDefinitionV1,
  Br04MetricRef,
} from '../../../../src/benchmark/aggregate/br04ContractV1';
import {
  buildTestBundleV1,
  iterationV1,
} from '../../../fixtures/benchmark/aggregate/br04FixtureBuildersV1';

const MEMORY = 'memory.bytes@1' as Br04MetricRef;

function memoryMetricV1(): Br04MetricDefinitionV1 {
  return {
    schemaVersion: 1, metricId: 'memory.bytes', metricVersion: 1,
    label: MEMORY, unit: 'bytes', numericDomain: 'non-negative-bytes',
    population: 'r3 same-run partition', requiredTags: ['memoryKind'],
    groupByTags: ['memoryKind'], pairingKeySuffix: [],
    aggregationLevel: 'run', perRunStatistic: 'max',
    cellEstimator: 'median', allowedPhases: ['measurement'],
    capabilityRequirement: [], direction: 'lower-is-better',
    lowerLevelResampling: 'none', practicalEffectDelta: null,
    automaticDecision: 'forbidden', displaySignificantDigits: 6,
  };
}

describe('br04 R3 B2-Rest same-run partition', () => {
  it('splits js-heap and embedder-heap samples of one run into two populations', () => {
    const bundle = buildTestBundleV1({
      bundleId: 'r3-b2-same-run',
      metrics: [memoryMetricV1()],
      slots: [{ slotId: 'slot-1', candidateId: 'candidate-a' }],
      runs: [{
        runId: 'run-1',
        slotId: 'slot-1',
        candidateId: 'candidate-a',
        iterations: [{
          iterationId: 'iter-1',
          samples: [
            {
              metric: MEMORY, value: 1, unit: 'bytes',
              valid: true, invalidReason: null, tags: { memoryKind: 'js-heap' },
            },
            {
              metric: MEMORY, value: 1000, unit: 'bytes',
              valid: true, invalidReason: null, tags: { memoryKind: 'embedder-heap' },
            },
          ],
        }],
      }],
    });
    const result = validateAndAggregateBundleV1(bundle);
    expect(result.validation.status).toBe('valid');
    expect(result.aggregate).not.toBeNull();
    const cells = (result.aggregate?.environmentCells ?? []).flatMap(
      (cell) => cell.metricCells.filter((metricCell) => metricCell.metricRef === MEMORY),
    );
    expect(cells.length).toBe(2);
    expect(cells.map((cell) => cell.maximum).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([1, 1000]);
  });

  it('keeps per-partition run/iteration hierarchy (one run contributes to both populations)', () => {    const bundle = buildTestBundleV1({
      bundleId: 'r3-b2-hierarchy',
      metrics: [memoryMetricV1()],
      slots: [{ slotId: 'slot-1', candidateId: 'candidate-a' }],
      runs: [{
        runId: 'run-1',
        slotId: 'slot-1',
        candidateId: 'candidate-a',
        iterations: [
          iterationV1('iter-1', MEMORY, [1], { unit: 'bytes', tags: { memoryKind: 'js-heap' } }),
          iterationV1('iter-2', MEMORY, [1000], { unit: 'bytes', tags: { memoryKind: 'embedder-heap' } }),
        ],
      }],
    });
    const result = validateAndAggregateBundleV1(bundle);
    expect(result.validation.status).toBe('valid');
    const cells = (result.aggregate?.environmentCells ?? []).flatMap(
      (cell) => cell.metricCells.filter((metricCell) => metricCell.metricRef === MEMORY),
    );
    expect(cells.length).toBe(2);
    for (const cell of cells) {
      expect(cell.nRuns).toBe(1);
      expect(cell.nIterations).toBe(1);
    }
  });

  it('diverges paired arms when tag partitions differ (group-tags-diverged, no false pair)', () => {
    const bundle = buildTestBundleV1({
      bundleId: 'r3-b2-paired-diverged',
      comparisonMode: 'reference-paired',
      referenceCandidateId: 'ref',
      metrics: [memoryMetricV1()],
      slots: [
        {
          slotId: 'slot-r0', candidateId: 'ref', pairCellId: 'pc-1',
          pairOrdinal: 1, balanceBlockId: 'bb-1', bootstrapClusterId: 'cluster-r0',
        },
        {
          slotId: 'slot-c0', candidateId: 'cmp', pairCellId: 'pc-1',
          pairOrdinal: 1, balanceBlockId: 'bb-1', bootstrapClusterId: 'cluster-c0',
        },
      ],
      runs: [
        {
          runId: 'run-r0', slotId: 'slot-r0', processId: 'process-r0', candidateId: 'ref',
          iterations: [iterationV1('iter-r0', MEMORY, [10], { unit: 'bytes', tags: { memoryKind: 'js-heap' } })],
        },
        {
          runId: 'run-c0', slotId: 'slot-c0', processId: 'process-c0', candidateId: 'cmp',
          iterations: [{
            iterationId: 'iter-c0',
            samples: [
              {
                metric: MEMORY, value: 12, unit: 'bytes',
                valid: true, invalidReason: null, tags: { memoryKind: 'js-heap' },
              },
              {
                metric: MEMORY, value: 2000, unit: 'bytes',
                valid: true, invalidReason: null, tags: { memoryKind: 'embedder-heap' },
              },
            ],
          }],
        },
      ],
    });
    const result = validateAndAggregateBundleV1(bundle);
    expect(result.validation.status).toBe('valid');
    const comparisons = result.aggregate?.pairedComparisons ?? [];
    expect(comparisons.length).toBe(1);
    expect(comparisons[0]?.pairs.complete).toBe(0);
    expect(comparisons[0]?.pairs.incomplete).toBe(1);
  });

  it('pairs per partition when both arms share the same tag partitions', () => {
    const bundle = buildTestBundleV1({
      bundleId: 'r3-b2-paired-split',
      comparisonMode: 'reference-paired',
      referenceCandidateId: 'ref',
      metrics: [memoryMetricV1()],
      slots: [
        {
          slotId: 'slot-r0', candidateId: 'ref', pairCellId: 'pc-1',
          pairOrdinal: 1, balanceBlockId: 'bb-1', bootstrapClusterId: 'cluster-r0',
        },
        {
          slotId: 'slot-c0', candidateId: 'cmp', pairCellId: 'pc-1',
          pairOrdinal: 1, balanceBlockId: 'bb-1', bootstrapClusterId: 'cluster-c0',
        },
      ],
      runs: [
        {
          runId: 'run-r0', slotId: 'slot-r0', processId: 'process-r0', candidateId: 'ref',
          iterations: [{
            iterationId: 'iter-r0',
            samples: [
              {
                metric: MEMORY, value: 10, unit: 'bytes',
                valid: true, invalidReason: null, tags: { memoryKind: 'js-heap' },
              },
              {
                metric: MEMORY, value: 1000, unit: 'bytes',
                valid: true, invalidReason: null, tags: { memoryKind: 'embedder-heap' },
              },
            ],
          }],
        },
        {
          runId: 'run-c0', slotId: 'slot-c0', processId: 'process-c0', candidateId: 'cmp',
          iterations: [{
            iterationId: 'iter-c0',
            samples: [
              {
                metric: MEMORY, value: 12, unit: 'bytes',
                valid: true, invalidReason: null, tags: { memoryKind: 'js-heap' },
              },
              {
                metric: MEMORY, value: 1200, unit: 'bytes',
                valid: true, invalidReason: null, tags: { memoryKind: 'embedder-heap' },
              },
            ],
          }],
        },
      ],
    });
    const result = validateAndAggregateBundleV1(bundle);
    expect(result.validation.status).toBe('valid');
    const comparisons = (result.aggregate?.pairedComparisons ?? []).filter(
      (comparison) => comparison.metricRef === MEMORY,
    );
    expect(comparisons.length).toBe(2);
    for (const comparison of comparisons) {
      expect(comparison.pairs.complete).toBe(1);
      expect(comparison.pairs.incomplete).toBe(0);
    }
    const differences = comparisons.map((comparison) => comparison.differencePointEstimate).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(differences).toEqual([2, 200]);
  });

  it('R4: mixed and simple runs of one population stay one population (js-heap with 2 runs)', () => {
    const bundle = buildTestBundleV1({
      bundleId: 'r4-mixed-simple',
      metrics: [memoryMetricV1()],
      slots: [
        { slotId: 'slot-1', candidateId: 'candidate-a' },
        { slotId: 'slot-2', candidateId: 'candidate-a' },
      ],
      runs: [
        {
          runId: 'run-1',
          slotId: 'slot-1',
          candidateId: 'candidate-a',
          iterations: [{
            iterationId: 'iter-1',
            samples: [
              {
                metric: MEMORY, value: 1, unit: 'bytes',
                valid: true, invalidReason: null, tags: { memoryKind: 'js-heap' },
              },
              {
                metric: MEMORY, value: 1000, unit: 'bytes',
                valid: true, invalidReason: null, tags: { memoryKind: 'embedder-heap' },
              },
            ],
          }],
        },
        {
          runId: 'run-2',
          slotId: 'slot-2',
          candidateId: 'candidate-a',
          iterations: [iterationV1('iter-2', MEMORY, [2], { unit: 'bytes', tags: { memoryKind: 'js-heap' } })],
        },
      ],
    });
    const result = validateAndAggregateBundleV1(bundle);
    expect(result.validation.status).toBe('valid');
    const cells = (result.aggregate?.environmentCells ?? []).flatMap(
      (cell) => cell.metricCells.filter((metricCell) => metricCell.metricRef === MEMORY),
    );
    expect(cells.length).toBe(2);
    const jsHeap = cells.find((cell) => cell.maximum === 2);
    const embedder = cells.find((cell) => cell.maximum === 1000);
    expect(jsHeap).toBeDefined();
    expect(jsHeap?.nRuns).toBe(2);
    expect(embedder?.nRuns).toBe(1);
  });

  it('R4: paired js-heap merges across a mixed and a simple pair cell (no split-shaped duplicate)', () => {
    const bundle = buildTestBundleV1({
      bundleId: 'r4-paired-merge',
      comparisonMode: 'reference-paired',
      referenceCandidateId: 'ref',
      metrics: [memoryMetricV1()],
      slots: [
        {
          slotId: 'slot-r0', candidateId: 'ref', pairCellId: 'pc-1',
          pairOrdinal: 1, balanceBlockId: 'bb-1', bootstrapClusterId: 'cluster-r0',
        },
        {
          slotId: 'slot-c0', candidateId: 'cmp', pairCellId: 'pc-1',
          pairOrdinal: 1, balanceBlockId: 'bb-1', bootstrapClusterId: 'cluster-c0',
        },
        {
          slotId: 'slot-r1', candidateId: 'ref', pairCellId: 'pc-2',
          pairOrdinal: 1, balanceBlockId: 'bb-1', bootstrapClusterId: 'cluster-r1',
        },
        {
          slotId: 'slot-c1', candidateId: 'cmp', pairCellId: 'pc-2',
          pairOrdinal: 1, balanceBlockId: 'bb-1', bootstrapClusterId: 'cluster-c1',
        },
      ],
      runs: [
        {
          runId: 'run-r0', slotId: 'slot-r0', processId: 'process-r0', candidateId: 'ref',
          iterations: [{
            iterationId: 'iter-r0',
            samples: [
              {
                metric: MEMORY, value: 10, unit: 'bytes',
                valid: true, invalidReason: null, tags: { memoryKind: 'js-heap' },
              },
              {
                metric: MEMORY, value: 1000, unit: 'bytes',
                valid: true, invalidReason: null, tags: { memoryKind: 'embedder-heap' },
              },
            ],
          }],
        },
        {
          runId: 'run-c0', slotId: 'slot-c0', processId: 'process-c0', candidateId: 'cmp',
          iterations: [{
            iterationId: 'iter-c0',
            samples: [
              {
                metric: MEMORY, value: 12, unit: 'bytes',
                valid: true, invalidReason: null, tags: { memoryKind: 'js-heap' },
              },
              {
                metric: MEMORY, value: 1200, unit: 'bytes',
                valid: true, invalidReason: null, tags: { memoryKind: 'embedder-heap' },
              },
            ],
          }],
        },
        {
          runId: 'run-r1', slotId: 'slot-r1', processId: 'process-r1', candidateId: 'ref',
          iterations: [iterationV1('iter-r1', MEMORY, [20], { unit: 'bytes', tags: { memoryKind: 'js-heap' } })],
        },
        {
          runId: 'run-c1', slotId: 'slot-c1', processId: 'process-c1', candidateId: 'cmp',
          iterations: [iterationV1('iter-c1', MEMORY, [24], { unit: 'bytes', tags: { memoryKind: 'js-heap' } })],
        },
      ],
    });
    const result = validateAndAggregateBundleV1(bundle);
    expect(result.validation.status).toBe('valid');
    const comparisons = (result.aggregate?.pairedComparisons ?? []).filter(
      (comparison) => comparison.metricRef === MEMORY,
    );
    expect(comparisons.length).toBe(2);
    const jsHeap = comparisons.find((comparison) => comparison.pairValues.length === 2);
    const embedder = comparisons.find((comparison) => comparison.pairValues.length === 1);
    expect(jsHeap?.pairs.complete).toBe(2);
    expect(jsHeap?.pairs.incomplete).toBe(0);
    expect(embedder?.pairs.complete).toBe(1);
  });
});

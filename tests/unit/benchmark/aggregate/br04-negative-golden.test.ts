/**
 * BR04 negative golden fixtures N01-N06, U01, D02 plus receipt/slot
 * fail-closed validation (report section 16.2, prompt negative list).
 */
import { describe, expect, it } from 'vitest';
import { validateAndAggregateBundleV1 } from '../../../../src/benchmark/aggregate/br04AggregateV1';
import { parseCanonicalJsonV1, CanonicalJsonError } from '../../../../src/benchmark/provenance/canonicalJsonV1';
import type { Br04MetricRef } from '../../../../src/benchmark/aggregate/br04ContractV1';
import {
  buildTestBundleV1,
  chunkMetricV1,
  iterationV1,
  staleCountMetricV1,
} from '../../../fixtures/benchmark/aggregate/br04FixtureBuildersV1';

const CHUNK = 'chunk.mesh.cpu.ms@1' as Br04MetricRef;
const STALE = 'scheduler.stale.count@1' as Br04MetricRef;

function singleRunBundleV1(
  bundleId: string,
  samples: { metric: Br04MetricRef; value: number; unit?: string; tags?: Record<string, string | number | boolean | null> }[],
  options?: { metrics?: ReturnType<typeof chunkMetricV1>[] },
) {
  return buildTestBundleV1({
    bundleId,
    metrics: options?.metrics ?? [chunkMetricV1()],
    slots: [{ slotId: 'slot-a', candidateId: 'candidate-a' }],
    runs: [{
      runId: 'run-a', slotId: 'slot-a',
      iterations: [{ iterationId: 'iter-0', samples }],
    }],
  });
}

describe('BR04 negative goldens', () => {
  it('N01 zero duration is a fatal sample-domain error, no numeric aggregate', () => {
    const { validation, aggregate } = validateAndAggregateBundleV1(
      singleRunBundleV1('n01', [{ metric: CHUNK, value: 0 }]),
    );
    expect(validation.status).toBe('invalid');
    expect(aggregate).toBeNull();
    expect(validation.issues.some((issue) => issue.code === 'NON_POSITIVE_DURATION')).toBe(true);
  });

  it('N02 zero counter is valid with sum 0 and no invented events', () => {
    const tags = { observationWindowId: 'w-1', staleReason: 'superseded' };
    const { validation, aggregate } = validateAndAggregateBundleV1(
      singleRunBundleV1('n02', [{ metric: STALE, value: 0, unit: 'count', tags }], {
        metrics: [staleCountMetricV1()],
      }),
    );
    expect(validation.status).toBe('valid');
    const cell = aggregate?.environmentCells[0]?.metricCells[0];
    expect(cell?.nEvents).toBe(1);
    expect(cell?.perRunSummaries[0]?.comparisonScalar).toBe(0);
    expect(cell?.maximum).toBe(0);
  });

  it('N03 zero reference: difference 1, ratio null non-positive-reference, pair complete for difference', () => {
    const tags = { observationWindowId: 'w-1', staleReason: 'superseded' };
    const bundle = buildTestBundleV1({
      bundleId: 'n03',
      comparisonMode: 'reference-paired',
      referenceCandidateId: 'ref',
      metrics: [staleCountMetricV1()],
      slots: [
        { slotId: 'slot-r', candidateId: 'ref', pairCellId: 'pc-1', pairOrdinal: 1, balanceBlockId: 'bb-1', bootstrapClusterId: 'cluster-r' },
        { slotId: 'slot-c', candidateId: 'cmp', pairCellId: 'pc-1', pairOrdinal: 1, balanceBlockId: 'bb-1', bootstrapClusterId: 'cluster-c' },
      ],
      runs: [
        {
          runId: 'run-r', slotId: 'slot-r', processId: 'process-r', candidateId: 'ref',
          iterations: [{ iterationId: 'iter-r', samples: [{ metric: STALE, value: 0, unit: 'count', tags }] }],
        },
        {
          runId: 'run-c', slotId: 'slot-c', processId: 'process-c', candidateId: 'cmp',
          iterations: [{ iterationId: 'iter-c', samples: [{ metric: STALE, value: 1, unit: 'count', tags }] }],
        },
      ],
    });
    const { validation, aggregate } = validateAndAggregateBundleV1(bundle);
    expect(validation.status).toBe('valid');
    const comparison = aggregate?.pairedComparisons[0];
    expect(comparison?.pairs.complete).toBe(1);
    expect(comparison?.differencePointEstimate).toBe(1);
    expect(comparison?.ratioPointEstimate).toBeNull();
    expect(comparison?.pairValues[0]?.ratioStatus).toBe('non-positive-reference');
  });

  it('N04 negative values are rejected, never absolutized or clamped', () => {
    for (const value of [-1, -0.5]) {
      const bundle = singleRunBundleV1(`n04-${value}`, [{ metric: CHUNK, value: 1 }]);
      const sample = bundle.runs[0]?.run.iterations[0]?.samples[0] as { value: number };
      sample.value = value;
      const { validation, aggregate } = validateAndAggregateBundleV1(bundle);
      expect(validation.status).toBe('invalid');
      expect(aggregate).toBeNull();
      expect(validation.issues.some((issue) => issue.code === 'NON_POSITIVE_DURATION')).toBe(true);
    }
  });

  it('N05 NaN and Infinity fail: raw JSON parse plus in-memory mutation', () => {
    expect(() => parseCanonicalJsonV1('{"value":NaN}')).toThrow(CanonicalJsonError);
    expect(() => parseCanonicalJsonV1('{"value":Infinity}')).toThrow(CanonicalJsonError);
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const bundle = singleRunBundleV1(`n05-${String(value)}`, [{ metric: CHUNK, value: 1 }]);
      const sample = bundle.runs[0]?.run.iterations[0]?.samples[0] as { value: number };
      sample.value = value;
      const { validation, aggregate } = validateAndAggregateBundleV1(bundle);
      expect(validation.status).toBe('invalid');
      expect(aggregate).toBeNull();
      expect(validation.issues.some((issue) => issue.code === 'NON_FINITE_NUMBER')).toBe(true);
    }
  });

  it('N06 negative zero is forbidden and never reinterpreted as 0', () => {
    const bundle = singleRunBundleV1('n06', [{ metric: CHUNK, value: 1 }]);
    const sample = bundle.runs[0]?.run.iterations[0]?.samples[0] as { value: number };
    sample.value = -0;
    const { validation, aggregate } = validateAndAggregateBundleV1(bundle);
    expect(validation.status).toBe('invalid');
    expect(aggregate).toBeNull();
    expect(validation.issues.some((issue) => issue.code === 'NEGATIVE_ZERO_FORBIDDEN')).toBe(true);
  });

  it('U01 mixed units for one metricRef are bundle-fatal with no conversion', () => {
    const { validation, aggregate } = validateAndAggregateBundleV1(
      singleRunBundleV1('u01', [
        { metric: CHUNK, value: 5, unit: 'ms' },
        { metric: CHUNK, value: 6, unit: 'bytes' },
      ]),
    );
    expect(validation.status).toBe('invalid');
    expect(aggregate).toBeNull();
    expect(validation.issues.some((issue) => issue.code === 'METRIC_UNIT_MISMATCH')).toBe(true);
  });

  it('D02 duplicate run IDs are fatal with both digests retained', () => {
    const bundle = buildTestBundleV1({
      bundleId: 'd02',
      slots: [
        { slotId: 'slot-a', candidateId: 'candidate-a' },
        { slotId: 'slot-b', candidateId: 'candidate-a' },
      ],
      runs: [
        {
          runId: 'run-dup', slotId: 'slot-a',
          iterations: [iterationV1('iter-a', CHUNK, [5])],
        },
        {
          runId: 'run-dup', slotId: 'slot-b',
          iterations: [iterationV1('iter-b', CHUNK, [6])],
        },
      ],
    });
    const { validation, aggregate } = validateAndAggregateBundleV1(bundle);
    expect(validation.status).toBe('invalid');
    expect(aggregate).toBeNull();
    const issue = validation.issues.find((entry) => entry.code === 'DUPLICATE_RUN_ID');
    expect(issue?.sourceDigest).not.toBeNull();
    expect(validation.counts.duplicateRuns).toBe(1);
    const duplicates = validation.runLedger.filter((row) => row.runId === 'run-dup');
    expect(duplicates.length).toBe(2);
  });

  it('unknown metric references are fatal', () => {
    const { validation, aggregate } = validateAndAggregateBundleV1(
      singleRunBundleV1('unknown', [{ metric: 'nope.metric@9' as Br04MetricRef, value: 1 }]),
    );
    expect(validation.status).toBe('invalid');
    expect(aggregate).toBeNull();
    expect(validation.issues.some((issue) => issue.code === 'UNKNOWN_METRIC_REF')).toBe(true);
  });

  it('unknown slots are fatal', () => {
    const bundle = buildTestBundleV1({
      bundleId: 'unknown-slot',
      slots: [{ slotId: 'slot-a', candidateId: 'candidate-a' }],
      runs: [{
        runId: 'run-ghost', slotId: 'slot-ghost',
        iterations: [iterationV1('iter-g', CHUNK, [1])],
      }],
    });
    const { validation, aggregate } = validateAndAggregateBundleV1(bundle);
    expect(validation.status).toBe('invalid');
    expect(aggregate).toBeNull();
    expect(validation.issues.some((issue) => issue.code === 'UNKNOWN_SLOT')).toBe(true);
    const ghostRow = validation.runLedger.find((row) => row.slotId === 'slot-ghost');
    expect(ghostRow?.runId).toBe('run-ghost');
    expect(ghostRow?.reasonCodes).toContain('unaccounted-envelope');
  });
});

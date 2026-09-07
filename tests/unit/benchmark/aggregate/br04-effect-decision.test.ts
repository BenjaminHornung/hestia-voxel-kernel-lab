/**
 * BR04 golden fixtures E01-E03 and D01: practical-effect relations stay
 * descriptive and no winner is ever declared (report sections 9.11, 16.2).
 */
import { describe, expect, it } from 'vitest';
import { validateAndAggregateBundleV1 } from '../../../../src/benchmark/aggregate/br04AggregateV1';
import { practicalEffectV1 } from '../../../../src/benchmark/aggregate/br04StatisticsV1';
import { buildReportModelV1, renderMarkdownReportV1 } from '../../../../src/benchmark/reports/br04MarkdownReportV1';
import type { Br04MetricRef } from '../../../../src/benchmark/aggregate/br04ContractV1';
import {
  buildTestBundleV1,
  chunkMetricV1,
  iterationV1,
} from '../../../fixtures/benchmark/aggregate/br04FixtureBuildersV1';

const CHUNK = 'chunk.mesh.cpu.ms@1' as Br04MetricRef;

describe('BR04 practical effect and decision goldens', () => {
  it('E01 CI below one but inside the practical band: no practical improvement, no winner', () => {
    const effect = practicalEffectV1(0.1, 'lower-is-better', 0.97, 0.95, 0.99, true);
    expect(effect.band).toEqual([0.9, 1.1]);
    expect(effect.pointRelation).toBe('inside-practical-band');
    expect(effect.intervalRelation).toBe('entirely-inside-band');
    expect(effect.ciRelationToOne).toBe('below');
    expect(effect.pointRelation).not.toBe('practical-improvement');
  });

  it('E02 practical improvement with a tight CI, still decision null upstream', () => {
    const effect = practicalEffectV1(0.1, 'lower-is-better', 0.85, 0.82, 0.88, true);
    expect(effect.pointRelation).toBe('practical-improvement');
    expect(effect.intervalRelation).toBe('entirely-improvement');
    expect(effect.ciRelationToOne).toBe('below');
  });

  it('E03 uncertain boundary: inside band, overlapping interval containing one', () => {
    const effect = practicalEffectV1(0.1, 'lower-is-better', 0.95, 0.85, 1.05, true);
    expect(effect.pointRelation).toBe('inside-practical-band');
    expect(effect.intervalRelation).toBe('overlaps-boundary');
    expect(effect.ciRelationToOne).toBe('contains');
  });

  it('D01 faster candidate with unsupported capability and missing guardrail: facts only, decision null', () => {
    const { validation, aggregate } = validateAndAggregateBundleV1(buildTestBundleV1({
      bundleId: 'd01',
      comparisonMode: 'reference-paired',
      referenceCandidateId: 'ref',
      metrics: [chunkMetricV1()],
      slots: [
        { slotId: 'slot-r', candidateId: 'ref', pairCellId: 'pc-1', pairOrdinal: 1, balanceBlockId: 'bb-1', bootstrapClusterId: 'cluster-r' },
        { slotId: 'slot-c', candidateId: 'cmp', pairCellId: 'pc-1', pairOrdinal: 1, balanceBlockId: 'bb-1', bootstrapClusterId: 'cluster-c' },
      ],
      runs: [
        {
          runId: 'run-r', slotId: 'slot-r', processId: 'process-r', candidateId: 'ref',
          capabilities: { 'timestamp-query': 'unsupported' },
          iterations: [iterationV1('iter-r', CHUNK, [20])],
        },
        {
          runId: 'run-c', slotId: 'slot-c', processId: 'process-c', candidateId: 'cmp',
          iterations: [iterationV1('iter-c', CHUNK, [10])],
        },
      ],
    }));
    expect(validation.status).toBe('valid');
    expect(aggregate?.decision).toBeNull();
    expect(aggregate?.pairedComparisons[0]?.decision).toBeNull();
    expect(aggregate?.pairedComparisons[0]?.ratioPointEstimate).toBeCloseTo(0.5, 12);
    const markdown = renderMarkdownReportV1(buildReportModelV1(aggregate ?? (() => {
      throw new Error('missing aggregate');
    })()));
    expect(markdown).toContain('No winner is declared by BR-04.');
    expect(markdown).toContain('neutral-evidence-no-winner');
  });
});

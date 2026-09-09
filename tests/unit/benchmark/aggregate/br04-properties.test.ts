/**
 * BR04 property contracts (report section 16.3 properties 4-10) and
 * decision hygiene: no pass/fail/winner/regression verdicts anywhere.
 */
import { describe, expect, it } from 'vitest';
import {
  bootstrapPairedV1,
  geometricMeanV1,
  nearestRankV1,
  sortedAscendingV1,
} from '../../../../src/benchmark/aggregate/br04StatisticsV1';
import { validateAndAggregateBundleV1 } from '../../../../src/benchmark/aggregate/br04AggregateV1';
import { buildReportModelV1, renderMarkdownReportV1 } from '../../../../src/benchmark/reports/br04MarkdownReportV1';
import type { Br04MetricRef } from '../../../../src/benchmark/aggregate/br04ContractV1';
import {
  BR04_SYNTHETIC_SEED_00_V1,
  buildTestBundleV1,
  fakeDigestV1,
  iterationV1,
  staleCountMetricV1,
} from '../../../fixtures/benchmark/aggregate/br04FixtureBuildersV1';

const CHUNK = 'chunk.mesh.cpu.ms@1' as Br04MetricRef;
const STALE = 'scheduler.stale.count@1' as Br04MetricRef;

describe('BR04 property contracts', () => {
  it('adding an invalid run keeps valid numerics but changes ledger counts', () => {
    const tags = { observationWindowId: 'w-1', staleReason: 'superseded' };
    const base = {
      bundleId: 'prop-invalid',
      metrics: [staleCountMetricV1()],
      slots: [
        { slotId: 'slot-a', candidateId: 'candidate-a' },
        { slotId: 'slot-b', candidateId: 'candidate-a' },
      ],
      runs: [{
        runId: 'run-a', slotId: 'slot-a',
        iterations: [{ iterationId: 'iter-a', samples: [{ metric: STALE, value: 3, unit: 'count', tags }] }],
      }],
    };
    const before = validateAndAggregateBundleV1(buildTestBundleV1(base));
    const after = validateAndAggregateBundleV1(buildTestBundleV1({
      ...base,
      bundleId: 'prop-invalid-after',
      runs: [
        ...base.runs,
        {
          runId: 'run-b', slotId: 'slot-b', disposition: 'candidate-failure',
          reasonCode: 'page-error',
          iterations: [{ iterationId: 'iter-b', samples: [{ metric: STALE, value: 999, unit: 'count', tags }] }],
        },
      ],
    }));
    expect(before.validation.status).toBe('valid');
    expect(after.validation.status).toBe('valid');
    const beforeCell = before.aggregate?.environmentCells[0]?.metricCells[0];
    const afterCell = after.aggregate?.environmentCells[0]?.metricCells[0];
    expect(afterCell?.cellPointEstimate).toBe(beforeCell?.cellPointEstimate);
    expect(afterCell?.maximum).toBe(beforeCell?.maximum);
    expect(after.validation.counts.observedRuns).toBe(before.validation.counts.observedRuns + 1);
    expect(after.validation.counts.missingSlots).toBe(before.validation.counts.missingSlots - 1);
    expect(after.aggregate?.invalidRuns.baseDispositionCounts['candidate-failure']).toBe(1);
  });

  it('paired ratios and diagnostic inverses are reciprocal for positive pairs', () => {
    const ratio = 12 / 10;
    const inverse = 10 / 12;
    expect(ratio * inverse).toBeCloseTo(1, 15);
    expect(geometricMeanV1([1.2, 0.9, 1.1])).toBeCloseTo(1.059104500597819, 12);
  });

  it('no bootstrap replicate separates a paired A/B duo', () => {
    const pairs = [
      { pairCellId: 'pc-1', pairOrdinal: 1, referenceScalar: 10, candidateScalar: 12 },
      { pairCellId: 'pc-2', pairOrdinal: 1, referenceScalar: 20, candidateScalar: 18 },
      { pairCellId: 'pc-3', pairOrdinal: 1, referenceScalar: 40, candidateScalar: 44 },
    ];
    const result = bootstrapPairedV1({
      metricRef: CHUNK,
      unit: 'ms',
      canonicalGroupKey: 'prop-duo',
      estimatorId: 'paired:test',
      clusters: [
        { balanceBlockId: 'bb-1', pairs: [pairs[0] as (typeof pairs)[number]] },
        { balanceBlockId: 'bb-2', pairs: [pairs[1] as (typeof pairs)[number]] },
        { balanceBlockId: 'bb-3', pairs: [pairs[2] as (typeof pairs)[number]] },
      ],
      masterSeedHex: BR04_SYNTHETIC_SEED_00_V1,
      normalizedInputDigest: fakeDigestV1('prop-duo-input'),
    });
    expect(result.differenceReplicates.length).toBe(10000);
    for (const replicate of result.differenceReplicates) {
      expect([2, -2, 4]).toContain(replicate);
    }
    const intactRatios = [1.2, 0.9, 1.1];
    const expectedGeomeans: number[] = [];
    for (const first of intactRatios) {
      for (const second of intactRatios) {
        for (const third of intactRatios) {
          expectedGeomeans.push(Math.exp((Math.log(first) + Math.log(second) + Math.log(third)) / 3));
        }
      }
    }
    expect(result.ratioReplicates.length).toBe(10000);
    for (const replicate of result.ratioReplicates) {
      const nearest = Math.min(...expectedGeomeans.map((expected) => Math.abs(expected - replicate)));
      expect(nearest).toBeLessThan(1e-12);
    }
  });

  it('nearest-rank prefers observed values over interpolation', () => {
    expect(nearestRankV1(sortedAscendingV1([1, 2, 3, 4]), 0.5)).toBe(2);
    expect(nearestRankV1(sortedAscendingV1([1, 2, 3, 4, 5]), 0.5)).toBe(3);
  });

  it('null effect bands stay null: no global 0.10 default is inherited', () => {
    const { validation, aggregate } = validateAndAggregateBundleV1(buildTestBundleV1({
      bundleId: 'prop-band',
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
          iterations: [{ iterationId: 'iter-r', samples: [{ metric: STALE, value: 10, unit: 'count', tags: { observationWindowId: 'w', staleReason: 's' } }] }],
        },
        {
          runId: 'run-c', slotId: 'slot-c', processId: 'process-c', candidateId: 'cmp',
          iterations: [{ iterationId: 'iter-c', samples: [{ metric: STALE, value: 12, unit: 'count', tags: { observationWindowId: 'w', staleReason: 's' } }] }],
        },
      ],
    }));
    expect(validation.status).toBe('valid');
    const comparison = aggregate?.pairedComparisons[0];
    expect(comparison?.practicalEffect.delta).toBeNull();
    expect(comparison?.practicalEffect.band).toBeNull();
    expect(comparison?.practicalEffect.pointRelation).toBe('not-configured');
  });

  it('no pass, fail, winner, or regression verdict is produced', () => {
    const { aggregate } = validateAndAggregateBundleV1(buildTestBundleV1({
      bundleId: 'prop-verdict',
      slots: [{ slotId: 'slot-a', candidateId: 'candidate-a' }],
      runs: [{
        runId: 'run-a', slotId: 'slot-a',
        iterations: [iterationV1('iter-a', CHUNK, [5, 6, 7])],
      }],
    }));
    expect(aggregate?.decision).toBeNull();
    const serialised = JSON.stringify(aggregate);
    expect(serialised).not.toContain('"winner"');
    expect(serialised).not.toContain('"pass"');
    expect(serialised).not.toContain('"fail"');
    expect(serialised).not.toMatch(/"(pass|fail|winner)"/);
    const markdown = renderMarkdownReportV1(buildReportModelV1(aggregate ?? (() => {
      throw new Error('missing aggregate');
    })()));
    expect(markdown).not.toMatch(/\bpass\b|\bfail\b/i);
    expect(markdown).toContain('No winner is declared by BR-04.');
    expect(markdown).toContain('neutral-evidence-no-winner');
    const withoutClosing = markdown
      .replace('No winner is declared by BR-04.', '')
      .replace('neutral-evidence-no-winner', '');
    expect(withoutClosing).not.toMatch(/\bwinner\b/i);
  });
});

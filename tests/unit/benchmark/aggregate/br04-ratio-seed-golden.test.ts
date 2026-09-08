/**
 * BR04 R3 / B6-Folgen: positive non-trivial ratio seed golden with varying
 * positive pairs (not only null refs), plus readable population labels
 * (scenario/seed/tags) on cells, comparisons, and the markdown report.
 */
import { describe, expect, it } from 'vitest';
import { validateAndAggregateBundleV1 } from '../../../../src/benchmark/aggregate/br04AggregateV1';
import type { Br04Sha256 } from '../../../../src/benchmark/aggregate/br04ContractV1';
import { buildReportModelV1 } from '../../../../src/benchmark/reports/br04MarkdownReportV1';
import {
  R2_COUNT_V1,
  r2BundleV1,
  r2EntryV1,
  r2PlanV1,
  type R2RunSpecV1,
  type R2UnitSpecV1,
} from '../../../fixtures/benchmark/aggregate/br04FixtureBuildersV1';

function positiveVaryingBundleV1(bundleId: string) {
  const refs = [10, 20, 40];
  const cands = [12, 18, 44];
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
  const plan = r2PlanV1(bundleId, units, { comparisonMode: 'reference-paired', referenceCandidateId: 'ref' });
  return r2BundleV1(bundleId, plan, specs.map((spec) => r2EntryV1(plan, spec)));
}

describe('br04 R3 B6-Folgen positive ratio seed golden and labels', () => {
  it('positive varying pairs: separate ratio stream with known answer, unit ratio', () => {
    const { bundle, issues } = positiveVaryingBundleV1('r3-b6-ratio');
    expect(issues).toEqual([]);
    const { validation, aggregate } = validateAndAggregateBundleV1(bundle ?? (() => {
      throw new Error('missing bundle');
    })());
    expect(validation.status).toBe('valid');
    const comparison = aggregate?.pairedComparisons.find((entry) => entry.metricRef === R2_COUNT_V1);
    expect(comparison?.pairs.complete).toBe(3);
    expect(comparison?.differenceInterval.status).toBe('ok');
    expect(comparison?.ratioInterval.status).toBe('ok');
    expect(comparison?.ratioInterval.unit).toBe('ratio');
    expect(comparison?.differenceInterval.derivedSeedHex)
      .not.toBe(comparison?.ratioInterval.derivedSeedHex);
    expect(comparison?.differenceInterval.seedMaterialDigest)
      .not.toBe(comparison?.ratioInterval.seedMaterialDigest);
    expect(comparison?.differenceInterval.replicateVectorDigest)
      .not.toBe(comparison?.ratioInterval.replicateVectorDigest);
    expect(comparison?.ratioPointEstimate).toBeCloseTo(1.059104500597819, 12);
    expect(comparison?.ratioInterval.replicateVectorDigest).toBe(
      'sha256:86529f5127ef6e3a3bb83d7cf3e542e1514ec1d57bca57cad77d2dd8044b1530' as Br04Sha256,
    );
  });

  it('cells, comparisons, and report rows carry readable population labels', () => {
    const { bundle } = positiveVaryingBundleV1('r3-b6-labels');
    const { validation, aggregate } = validateAndAggregateBundleV1(bundle ?? (() => {
      throw new Error('missing bundle');
    })());
    expect(validation.status).toBe('valid');
    const cells = (aggregate?.environmentCells ?? []).flatMap((cell) => cell.metricCells);
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell.populationLabel).toContain('scenario=mesh-density-sweep-v1@v1');
      expect(cell.populationLabel).toContain('seed=7');
      expect(cell.populationLabel).toContain('observationWindowId="window-0"');
    }
    const comparison = aggregate?.pairedComparisons.find((entry) => entry.metricRef === R2_COUNT_V1);
    expect(comparison?.populationLabel).toContain('scenario=mesh-density-sweep-v1@v1');
    expect(comparison?.populationLabel).toContain('seed=7');
    expect(comparison?.populationLabel).toContain('observationWindowId="window-0"');
    const model = buildReportModelV1(aggregate ?? (() => {
      throw new Error('missing aggregate');
    })());
    const summaryRow = model.summarySection.rows.find((row) => row['metric'] === R2_COUNT_V1);
    expect(summaryRow?.['population']).toContain('scenario=mesh-density-sweep-v1@v1');
    const comparisonRow = model.comparisonSection.rows.find((row) =>
      (row['comparison'] ?? '').includes(`${R2_COUNT_V1}:ref-vs-cmp`));
    expect(comparisonRow?.['population']).toContain('seed=7');
  });
});

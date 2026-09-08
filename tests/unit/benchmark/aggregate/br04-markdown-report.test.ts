/**
 * BR04 markdown report duties: fixed section order, claim pointers for
 * every number, neutral banner, synthetic refusal, closing line
 * (report sections 8.11, 13, 16.3 property 10).
 */
import { describe, expect, it } from 'vitest';
import { validateAndAggregateBundleV1 } from '../../../../src/benchmark/aggregate/br04AggregateV1';
import { formatSignificantV1 } from '../../../../src/benchmark/aggregate/br04StatisticsV1';
import {
  buildReportModelV1,
  renderMarkdownReportV1,
  reportHeadingsV1,
} from '../../../../src/benchmark/reports/br04MarkdownReportV1';
import type { Br04BenchmarkAggregateV1, Br04MetricRef } from '../../../../src/benchmark/aggregate/br04ContractV1';
import {
  buildTestBundleV1,
  iterationV1,
  r2BundleV1,
  r2EntryV1,
  r2PlanV1,
} from '../../../fixtures/benchmark/aggregate/br04FixtureBuildersV1';

const CHUNK = 'chunk.mesh.cpu.ms@1' as Br04MetricRef;

function demoAggregateV1(synthetic: boolean): Br04BenchmarkAggregateV1 {
  const { validation, aggregate } = validateAndAggregateBundleV1(buildTestBundleV1({
    bundleId: synthetic ? 'report-synthetic' : 'report-measured',
    synthetic,
    comparisonMode: 'reference-paired',
    referenceCandidateId: 'ref',
    slots: [
      { slotId: 'slot-r', candidateId: 'ref', pairCellId: 'pc-1', pairOrdinal: 1, balanceBlockId: 'bb-1', bootstrapClusterId: 'cluster-r' },
      { slotId: 'slot-c', candidateId: 'cmp', pairCellId: 'pc-1', pairOrdinal: 1, balanceBlockId: 'bb-1', bootstrapClusterId: 'cluster-c' },
    ],
    runs: [
      {
        runId: 'run-r', slotId: 'slot-r', processId: 'process-r', candidateId: 'ref',
        iterations: [iterationV1('iter-r', CHUNK, [10])],
      },
      {
        runId: 'run-c', slotId: 'slot-c', processId: 'process-c', candidateId: 'cmp',
        iterations: [iterationV1('iter-c', CHUNK, [12])],
      },
    ],
  }));
  expect(validation.status).toBe('valid');
  if (aggregate === null) throw new Error('missing aggregate');
  return aggregate;
}

function resolvePointerV1(root: unknown, pointer: string): unknown {
  const parts = pointer.split('/').slice(1).map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current: unknown = root;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

describe('BR04 markdown report', () => {
  it('renders fifteen headings in contract order with a neutral closing line', () => {
    const markdown = renderMarkdownReportV1(buildReportModelV1(demoAggregateV1(true)));
    const headings = reportHeadingsV1();
    expect(headings.length).toBe(15);
    let cursor = -1;
    for (const heading of headings) {
      const index = markdown.indexOf(`## ${heading}`);
      expect(index).toBeGreaterThan(cursor);
      cursor = index;
    }
    expect(markdown).toContain('No winner is declared by BR-04.');
  });

  it('every section pointer resolves into the aggregate JSON', () => {
    const aggregate = demoAggregateV1(true);
    const model = buildReportModelV1(aggregate);
    const sections = [
      model.provenanceSection, model.environmentSection, model.runLedgerSection,
      model.summarySection, model.comparisonSection, model.capabilitySection,
      model.invalidationSection, model.factInferenceUnknownSection,
    ];
    let pointerCount = 0;
    for (const section of sections) {
      for (const pointer of section.aggregateJsonPointers) {
        expect(resolvePointerV1(aggregate, pointer), pointer).not.toBeUndefined();
        pointerCount += 1;
      }
      for (const row of section.rows) {
        const cells = Object.values(row).join(' ');
        if (/\d/.test(cells)) {
          expect(section.aggregateJsonPointers.length).toBeGreaterThan(0);
        }
      }
    }
    expect(pointerCount).toBeGreaterThan(0);
    for (const entry of model.claimIndex) {
      for (const pointer of entry.aggregateJsonPointers) {
        expect(resolvePointerV1(aggregate, pointer), pointer).not.toBeUndefined();
      }
    }
  });

  it('every rendered aggregate number is covered by a resolving pointer', () => {
    const aggregate = demoAggregateV1(true);
    const markdown = renderMarkdownReportV1(buildReportModelV1(aggregate));
    const model = buildReportModelV1(aggregate);
    const covered = new Set<string>();
    const sections = [
      model.provenanceSection, model.environmentSection, model.runLedgerSection,
      model.summarySection, model.comparisonSection, model.capabilitySection,
      model.invalidationSection, model.factInferenceUnknownSection,
    ];
    for (const section of sections) {
      for (const pointer of section.aggregateJsonPointers) {
        const value = resolvePointerV1(aggregate, pointer);
        if (typeof value === 'number' && Number.isFinite(value)) covered.add(formatSignificantV1(value));
        if (typeof value === 'string' && /\d/.test(value) && value.length < 80) covered.add(value);
      }
    }
    for (const entry of model.claimIndex) {
      for (const pointer of entry.aggregateJsonPointers) {
        const value = resolvePointerV1(aggregate, pointer);
        if (typeof value === 'number' && Number.isFinite(value)) covered.add(formatSignificantV1(value));
      }
    }
    const expected = new Set<string>();
    for (const cell of aggregate.environmentCells) {
      for (const metricCell of cell.metricCells) {
        for (const quantile of metricCell.descriptivePooledQuantiles) {
          if (quantile.value !== null) expected.add(formatSignificantV1(quantile.value));
        }
        if (metricCell.maximum !== null) expected.add(formatSignificantV1(metricCell.maximum));
        if (metricCell.cellPointEstimate !== null) expected.add(formatSignificantV1(metricCell.cellPointEstimate));
        const interval = metricCell.cellInterval;
        if (interval.lower !== null) expected.add(formatSignificantV1(interval.lower));
        if (interval.upper !== null) expected.add(formatSignificantV1(interval.upper));
      }
    }
    for (const comparison of aggregate.pairedComparisons) {
      if (comparison.differencePointEstimate !== null) {
        expected.add(formatSignificantV1(comparison.differencePointEstimate));
      }
      if (comparison.ratioPointEstimate !== null) {
        expected.add(formatSignificantV1(comparison.ratioPointEstimate));
      }
    }
    for (const value of expected) {
      expect(markdown.includes(value), value).toBe(true);
      expect(covered.has(value), value).toBe(true);
    }
  });

  it('synthetic reports refuse performance claims; measured reports do not', () => {
    const syntheticMarkdown = renderMarkdownReportV1(buildReportModelV1(demoAggregateV1(true)));
    expect(syntheticMarkdown).toContain('All numeric performance claims are refused for synthetic fixtures.');
    const measuredMarkdown = renderMarkdownReportV1(buildReportModelV1(demoAggregateV1(false)));
    expect(measuredMarkdown).not.toContain('refused for synthetic fixtures');
    expect(measuredMarkdown).toContain('Eligibility: eligible-measured');
  });

  it('formats six significant digits without trailing zeros and plain integers', () => {
    expect(formatSignificantV1(1.059104500597819)).toBe('1.0591');
    expect(formatSignificantV1(10)).toBe('10');
    expect(formatSignificantV1(2.5)).toBe('2.5');
    expect(formatSignificantV1(0.85)).toBe('0.85');
  });

  it('R2 metadata: claim status, ledger causes, and chart declarations stay honest', () => {
    const plan = r2PlanV1('r2-w', [{ slot: 'slot-w', candidate: 'candidate-a' }], { synthetic: false });
    const { bundle } = r2BundleV1('r2-w', plan, [
      r2EntryV1(plan, {
        runId: 'run-w', slot: 'slot-w', candidate: 'candidate-a', values: [5],
        validity: { status: 'invalid', reasons: [{ code: 'page-error', detail: 'x', phase: 'measurement' }] },
      }),
    ]);
    const { validation, aggregate } = validateAndAggregateBundleV1(bundle ?? (() => {
      throw new Error('missing bundle');
    })());
    expect(validation.status).toBe('valid');
    expect(aggregate?.environmentCells.length).toBe(0);
    expect(aggregate?.inputProvenance.performanceClaimEligibility).toBe('ineligible-no-valid-population');
    const emptyModel = buildReportModelV1(aggregate ?? (() => {
      throw new Error('missing aggregate');
    })());
    expect(emptyModel.performanceClaimEligibility).toBe('ineligible-no-valid-population');
    const chartPlan = r2PlanV1('r2-charts', [{ slot: 'slot-chart', candidate: 'candidate-a' }]);
    const chartBundle = r2BundleV1('r2-charts', chartPlan, [
      r2EntryV1(chartPlan, { runId: 'run-chart', slot: 'slot-chart', candidate: 'candidate-a', values: [5] }),
    ]);
    const chartAggregate = validateAndAggregateBundleV1(chartBundle.bundle ?? (() => {
      throw new Error('missing bundle');
    })()).aggregate;
    const model = buildReportModelV1(chartAggregate ?? (() => {
      throw new Error('missing aggregate');
    })());
    const ecdf = model.chartSpecifications.find((spec) => spec.kind === 'ecdf');
    expect(ecdf?.includesAllValidPoints).toBe(false);
    const dotplot = model.chartSpecifications.find((spec) => spec.kind === 'run-dotplot');
    expect(dotplot?.includesAllValidPoints).toBe(false);
  });
});

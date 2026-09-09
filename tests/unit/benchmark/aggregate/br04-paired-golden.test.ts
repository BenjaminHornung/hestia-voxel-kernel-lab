/**
 * BR04 golden fixtures P01-P05: explicit paired evaluation
 * (report sections 9.6-9.7, 16.2).
 */
import { describe, expect, it } from 'vitest';
import { validateAndAggregateBundleV1 } from '../../../../src/benchmark/aggregate/br04AggregateV1';
import type { Br04MetricRef, Br04Sha256 } from '../../../../src/benchmark/aggregate/br04ContractV1';
import {
  buildTestBundleV1,
  chunkMetricV1,
  iterationV1,
  R2_COUNT_V1,
  r2BundleV1,
  r2EntryV1,
  r2PlanV1,
  type Br04TestRunSpecV1,
  type Br04TestSlotSpecV1,
  type R2RunSpecV1,
  type R2UnitSpecV1,
} from '../../../fixtures/benchmark/aggregate/br04FixtureBuildersV1';

const CHUNK = 'chunk.mesh.cpu.ms@1' as Br04MetricRef;

interface Br04PairSpecV1 {
  readonly block: string;
  readonly cell: string;
  readonly ordinal: number;
  readonly referenceValue: number;
  readonly candidateValue: number | null;
  readonly candidateDisposition?: Br04TestRunSpecV1['disposition'];
}

function pairedBundleV1(bundleId: string, pairs: readonly Br04PairSpecV1[]) {
  const slots: Br04TestSlotSpecV1[] = [];
  const runs: Br04TestRunSpecV1[] = [];
  pairs.forEach((pair, index) => {
    const refSlot = `slot-r${index}`;
    const cmpSlot = `slot-c${index}`;
    slots.push(
      {
        slotId: refSlot, candidateId: 'ref', pairCellId: pair.cell,
        pairOrdinal: pair.ordinal, balanceBlockId: pair.block,
        bootstrapClusterId: `cluster-r${index}`,
      },
      {
        slotId: cmpSlot, candidateId: 'cmp', pairCellId: pair.cell,
        pairOrdinal: pair.ordinal, balanceBlockId: pair.block,
        bootstrapClusterId: `cluster-c${index}`,
      },
    );
    runs.push({
      runId: `run-r${index}`, slotId: refSlot, processId: `process-r${index}`,
      candidateId: 'ref',
      iterations: [iterationV1(`iter-r${index}`, CHUNK, [pair.referenceValue])],
    });
    if (pair.candidateValue !== null) {
      runs.push({
        runId: `run-c${index}`, slotId: cmpSlot, processId: `process-c${index}`,
        candidateId: 'cmp', disposition: pair.candidateDisposition ?? 'valid',
        reasonCode: pair.candidateDisposition === 'candidate-failure' ? 'page-error' : null,
        iterations: [iterationV1(`iter-c${index}`, CHUNK, [pair.candidateValue])],
      });
    }
  });
  return buildTestBundleV1({
    bundleId,
    comparisonMode: 'reference-paired',
    referenceCandidateId: 'ref',
    metrics: [chunkMetricV1()],
    slots,
    runs,
  });
}

describe('BR04 paired goldens', () => {
  it('P01 single paired ratio: difference 2, ratio 1.2, CIs insufficient-clusters, no winner', () => {
    const { validation, aggregate } = validateAndAggregateBundleV1(
      pairedBundleV1('p01', [{ block: 'bb-1', cell: 'pc-1', ordinal: 1, referenceValue: 10, candidateValue: 12 }]),
    );
    expect(validation.status).toBe('valid');
    const comparison = aggregate?.pairedComparisons[0];
    expect(comparison?.pairs.planned).toBe(1);
    expect(comparison?.pairs.complete).toBe(1);
    expect(comparison?.pairs.incomplete).toBe(0);
    expect(comparison?.differencePointEstimate).toBe(2);
    expect(comparison?.ratioPointEstimate).toBeCloseTo(1.2, 12);
    expect(comparison?.differenceInterval.status).toBe('insufficient-clusters');
    expect(comparison?.ratioInterval.status).toBe('insufficient-clusters');
    expect(comparison?.decision).toBeNull();
    expect(aggregate?.decision).toBeNull();
    expect(aggregate?.automaticDecision).toBe('forbidden');
    const pair = comparison?.pairValues[0];
    expect(pair?.ratioStatus).toBe('ok');
    expect(pair?.bootstrapClusterId).toBe('process-r0');
  });

  it('P02 multi-pair geomean 1.059104500597819 and median difference 2', () => {
    const { validation, aggregate } = validateAndAggregateBundleV1(
      pairedBundleV1('p02', [
        { block: 'bb-1', cell: 'pc-1', ordinal: 1, referenceValue: 10, candidateValue: 12 },
        { block: 'bb-2', cell: 'pc-2', ordinal: 1, referenceValue: 20, candidateValue: 18 },
        { block: 'bb-3', cell: 'pc-3', ordinal: 1, referenceValue: 40, candidateValue: 44 },
      ]),
    );
    expect(validation.status).toBe('valid');
    const comparison = aggregate?.pairedComparisons[0];
    expect(comparison?.pairs.complete).toBe(3);
    expect(comparison?.pairValues.map((pair) => pair.ratioCandidateOverReference))
      .toEqual([1.2, 0.9, 1.1]);
    expect(Math.abs((comparison?.ratioPointEstimate ?? 0) - 1.059104500597819)).toBeLessThan(1e-12);
    expect(comparison?.differencePointEstimate).toBe(2);
    expect(comparison?.differenceInterval.status).toBe('ok');
    expect(comparison?.ratioInterval.status).toBe('ok');
  });

  it('P03 missing candidate: complete 0, incomplete 1, A stays unpaired, slot missing', () => {
    const { validation, aggregate } = validateAndAggregateBundleV1(
      pairedBundleV1('p03', [{ block: 'bb-1', cell: 'pc-1', ordinal: 1, referenceValue: 10, candidateValue: null }]),
    );
    expect(validation.status).toBe('valid');
    const comparison = aggregate?.pairedComparisons[0];
    expect(comparison?.pairs.planned).toBe(1);
    expect(comparison?.pairs.complete).toBe(0);
    expect(comparison?.pairs.incomplete).toBe(1);
    expect(comparison?.ratioPointEstimate).toBeNull();
    expect(comparison?.differencePointEstimate).toBeNull();
    expect(comparison?.ratioInterval.status).toBe('no-data');
    expect(aggregate?.invalidRuns.missingSlots).toEqual(['slot-c0']);
    const refCell = aggregate?.environmentCells.find((cell) => cell.candidateId === 'ref');
    expect(refCell?.metricCells[0]?.maximum).toBe(10);
    const missingRow = validation.runLedger.find((row) => row.slotId === 'slot-c0');
    expect(missingRow?.runId).toBeNull();
  });

  it('P04 invalid candidate: incomplete pair, candidate failure retained, no re-pairing', () => {
    const { validation, aggregate } = validateAndAggregateBundleV1(
      pairedBundleV1('p04', [{
        block: 'bb-1', cell: 'pc-1', ordinal: 1, referenceValue: 10,
        candidateValue: 12, candidateDisposition: 'candidate-failure',
      }]),
    );
    expect(validation.status).toBe('valid');
    const comparison = aggregate?.pairedComparisons[0];
    expect(comparison?.pairs.complete).toBe(0);
    expect(comparison?.pairs.incomplete).toBe(1);
    const failedRow = validation.runLedger.find((row) => row.slotId === 'slot-c0');
    expect(failedRow?.baseDisposition).toBe('candidate-failure');
    const refCell = aggregate?.environmentCells.find((cell) => cell.candidateId === 'ref');
    expect(refCell?.metricCells[0]?.maximum).toBe(10);
  });

  it('P05 no cross-cell repair across pair cells', () => {
    const bundle = pairedBundleV1('p05', [
      { block: 'bb-1', cell: 'pc-1', ordinal: 1, referenceValue: 10, candidateValue: null },
    ]);
    const extraSlots: Br04TestSlotSpecV1[] = [
      {
        slotId: 'slot-lone', candidateId: 'cmp', pairCellId: 'pc-2',
        pairOrdinal: 1, balanceBlockId: 'bb-1', bootstrapClusterId: 'cluster-lone',
      },
    ];
    const extraRuns: Br04TestRunSpecV1[] = [{
      runId: 'run-lone', slotId: 'slot-lone', processId: 'process-lone',
      candidateId: 'cmp', iterations: [iterationV1('iter-lone', CHUNK, [11])],
    }];
    const combined = buildTestBundleV1({
      bundleId: 'p05',
      comparisonMode: 'reference-paired',
      referenceCandidateId: 'ref',
      metrics: [chunkMetricV1()],
      slots: [
        { slotId: 'slot-r0', candidateId: 'ref', pairCellId: 'pc-1', pairOrdinal: 1, balanceBlockId: 'bb-1', bootstrapClusterId: 'cluster-r0' },
        { slotId: 'slot-c0', candidateId: 'cmp', pairCellId: 'pc-1', pairOrdinal: 1, balanceBlockId: 'bb-1', bootstrapClusterId: 'cluster-c0' },
        ...extraSlots,
      ],
      runs: [
        {
          runId: 'run-r0', slotId: 'slot-r0', processId: 'process-r0',
          candidateId: 'ref', iterations: [iterationV1('iter-r0', CHUNK, [10])],
        },
        ...extraRuns,
      ],
    });
    expect(bundle.runPlan.slots.length).toBe(2);
    const { validation, aggregate } = validateAndAggregateBundleV1(combined);
    expect(validation.status).toBe('valid');
    const comparison = aggregate?.pairedComparisons[0];
    expect(comparison?.pairs.complete).toBe(0);
    expect(comparison?.pairs.incomplete).toBe(2);
  });

  it('B02 trace-phase pair is never a complete numeric CPU comparison after capability salvage', () => {
    const { validation, aggregate } = validateAndAggregateBundleV1(buildTestBundleV1({
      bundleId: 'b02-trace-pair',
      comparisonMode: 'reference-paired',
      referenceCandidateId: 'ref',
      metrics: [chunkMetricV1()],
      slots: [
        { slotId: 'slot-r', candidateId: 'ref', phase: 'trace', pairCellId: 'pc-1', pairOrdinal: 1, balanceBlockId: 'bb-1', bootstrapClusterId: 'cluster-r' },
        { slotId: 'slot-c', candidateId: 'cmp', phase: 'trace', pairCellId: 'pc-1', pairOrdinal: 1, balanceBlockId: 'bb-1', bootstrapClusterId: 'cluster-c' },
      ],
      runs: [
        {
          runId: 'run-r', slotId: 'slot-r', processId: 'process-r', candidateId: 'ref', phase: 'trace',
          disposition: 'capability-unsupported', reasonCode: 'capability-unsupported:timestamp-query',
          capabilities: { 'timestamp-query': 'unsupported' },
          iterations: [iterationV1('iter-r', CHUNK, [10])],
        },
        {
          runId: 'run-c', slotId: 'slot-c', processId: 'process-c', candidateId: 'cmp', phase: 'trace',
          disposition: 'capability-unsupported', reasonCode: 'capability-unsupported:timestamp-query',
          capabilities: { 'timestamp-query': 'unsupported' },
          iterations: [iterationV1('iter-c', CHUNK, [12])],
        },
      ],
    }));
    expect(validation.status).toBe('valid');
    const comparison = aggregate?.pairedComparisons[0];
    expect(comparison?.pairs.complete).toBe(0);
    expect(comparison?.pairs.incomplete).toBe(1);
    expect(comparison?.pairValues).toEqual([]);
    expect(comparison?.differencePointEstimate).toBeNull();
    expect(comparison?.ratioPointEstimate).toBeNull();
    expect(validation.runLedger.every((row) => row.metricEligibility[CHUNK] === 'trace-only')).toBe(true);
  });
});

describe('BR04 R2 paired regressions (B2 pairing, B4-B6)', () => {
  it('B2: pairing honors the same compatibility boundaries', () => {
    const plan = r2PlanV1('r2-b2p', [
      { slot: 'slot-r', candidate: 'ref', seed: 7, pairCell: 'pc-1', pairOrdinal: 1 },
      { slot: 'slot-c', candidate: 'cmp', seed: 8, pairCell: 'pc-1', pairOrdinal: 1 },
    ], { comparisonMode: 'reference-paired', referenceCandidateId: 'ref' });
    const { bundle } = r2BundleV1('r2-b2p', plan, [
      r2EntryV1(plan, { runId: 'run-r', slot: 'slot-r', candidate: 'ref', values: [10] }),
      r2EntryV1(plan, { runId: 'run-c', slot: 'slot-c', candidate: 'cmp', values: [12] }),
    ]);
    const { aggregate } = validateAndAggregateBundleV1(bundle ?? (() => {
      throw new Error('missing bundle');
    })());
    const comparison = aggregate?.pairedComparisons[0];
    expect(comparison?.pairs.complete).toBe(0);
    expect(comparison?.pairs.incomplete).toBe(1);
    expect(aggregate?.invalidRuns.incompletePairs[0]?.reasonCodes).toContain('compatibility-key-diverged');
  });

  it('B4: a missing arm is incomplete with causes, the counterpart stays descriptive', () => {
    const plan = r2PlanV1('r2-b4', [
      { slot: 'slot-r', candidate: 'ref', pairCell: 'pc-1', pairOrdinal: 1 },
      { slot: 'slot-c', candidate: 'cmp', pairCell: 'pc-1', pairOrdinal: 1 },
    ], { comparisonMode: 'reference-paired', referenceCandidateId: 'ref' });
    const { bundle } = r2BundleV1('r2-b4', plan, [
      r2EntryV1(plan, { runId: 'run-r', slot: 'slot-r', candidate: 'ref', values: [10] }),
    ]);
    expect(bundle).not.toBeNull();
    const { validation, aggregate } = validateAndAggregateBundleV1(bundle ?? (() => {
      throw new Error('missing bundle');
    })());
    expect(validation.status).toBe('valid');
    const comparison = aggregate?.pairedComparisons[0];
    expect(comparison?.pairs.planned).toBe(1);
    expect(comparison?.pairs.complete).toBe(0);
    expect(comparison?.pairs.incomplete).toBe(1);
    const refCell = aggregate?.environmentCells.find((cell) => cell.candidateId === 'ref');
    expect(refCell?.metricCells[0]?.maximum).toBe(10);
    expect(validation.runLedger.find((row) => row.slotId === 'slot-r')?.pairDisposition).toBe('incomplete-pair');
    expect(validation.runLedger.find((row) => row.slotId === 'slot-c')?.pairDisposition).toBe('incomplete-pair');
    const incomplete = aggregate?.invalidRuns.incompletePairs[0];
    expect(incomplete?.pairCellId).toBe('pc-1');
    expect(incomplete?.presentSlotIds).toEqual(['slot-r']);
    expect(incomplete?.missingOrInvalidSlotIds).toEqual(['slot-c']);
    expect(incomplete?.reasonCodes).toContain('candidate-missing-or-invalid');
  });

  it('B5: an undefined ratio suppresses only the ratio CI across three clusters', () => {
    const units: R2UnitSpecV1[] = [];
    const specs: R2RunSpecV1[] = [];
    for (let block = 1; block <= 3; block += 1) {
      units.push(
        { slot: `slot-r${block}`, candidate: 'ref', block: `bb-${block}`, pairCell: `pc-${block}`, pairOrdinal: 1 },
        { slot: `slot-c${block}`, candidate: 'cmp', block: `bb-${block}`, pairCell: `pc-${block}`, pairOrdinal: 1 },
      );
      specs.push(
        {
          runId: `run-r${block}`, slot: `slot-r${block}`, candidate: 'ref', block: `bb-${block}`,
          metric: R2_COUNT_V1, values: [0], dims: [{ key: 'observation-window-id', value: 'window-0' }],
          capabilities: ['long-tasks'],
        },
        {
          runId: `run-c${block}`, slot: `slot-c${block}`, candidate: 'cmp', block: `bb-${block}`,
          metric: R2_COUNT_V1, values: [1], dims: [{ key: 'observation-window-id', value: 'window-0' }],
          capabilities: ['long-tasks'],
        },
      );
    }
    const plan = r2PlanV1('r2-b5', units, { comparisonMode: 'reference-paired', referenceCandidateId: 'ref' });
    const { bundle, issues } = r2BundleV1('r2-b5', plan, specs.map((spec) => r2EntryV1(plan, spec)));
    expect(issues).toEqual([]);
    const { validation, aggregate } = validateAndAggregateBundleV1(bundle ?? (() => {
      throw new Error('missing bundle');
    })());
    expect(validation.status).toBe('valid');
    expect(aggregate?.pairedComparisons.length).toBe(1);
    const comparison = aggregate?.pairedComparisons.find((entry) => entry.metricRef === R2_COUNT_V1);
    expect(comparison?.pairs.complete).toBe(3);
    expect(comparison?.differencePointEstimate).toBe(1);
    expect(comparison?.differenceInterval.status).toBe('ok');
    expect(comparison?.differenceInterval.lower).toBe(1);
    expect(comparison?.differenceInterval.upper).toBe(1);
    expect(comparison?.ratioInterval.status).toBe('no-data');
    expect(comparison?.ratioInterval.unit).toBe('ratio');
  });

  it('B6: difference and ratio use their own declared streams with known answers', () => {
    const units: R2UnitSpecV1[] = [];
    const specs: R2RunSpecV1[] = [];
    for (let block = 1; block <= 3; block += 1) {
      units.push(
        { slot: `slot-r${block}`, candidate: 'ref', block: `bb-${block}`, pairCell: `pc-${block}`, pairOrdinal: 1 },
        { slot: `slot-c${block}`, candidate: 'cmp', block: `bb-${block}`, pairCell: `pc-${block}`, pairOrdinal: 1 },
      );
      specs.push(
        {
          runId: `run-r${block}`, slot: `slot-r${block}`, candidate: 'ref', block: `bb-${block}`,
          metric: R2_COUNT_V1, values: [0], dims: [{ key: 'observation-window-id', value: 'window-0' }],
          capabilities: ['long-tasks'],
        },
        {
          runId: `run-c${block}`, slot: `slot-c${block}`, candidate: 'cmp', block: `bb-${block}`,
          metric: R2_COUNT_V1, values: [1], dims: [{ key: 'observation-window-id', value: 'window-0' }],
          capabilities: ['long-tasks'],
        },
      );
    }
    const plan = r2PlanV1('r2-b6', units, { comparisonMode: 'reference-paired', referenceCandidateId: 'ref' });
    const { bundle } = r2BundleV1('r2-b6', plan, specs.map((spec) => r2EntryV1(plan, spec)));
    const { aggregate } = validateAndAggregateBundleV1(bundle ?? (() => {
      throw new Error('missing bundle');
    })());
    const comparison = aggregate?.pairedComparisons.find((entry) => entry.metricRef === R2_COUNT_V1);
    expect(comparison?.differenceInterval.derivedSeedHex).not.toBe(comparison?.ratioInterval.derivedSeedHex);
    expect(comparison?.differenceInterval.seedMaterialDigest).not.toBe(comparison?.ratioInterval.seedMaterialDigest);
    expect(comparison?.differenceInterval.replicateVectorDigest).toBe(
      'sha256:12d8ed70a040902b24b59ae42eefb205aaabef21414470f2678bf27e8ec1dd85' as Br04Sha256,
    );
  });
});

/**
 * BR04 validation and ledger duties: receipt/plan/registry digest binding,
 * manifest integrity, slot coverage, pair dispositions (prompt positive
 * and negative validation lists).
 */
import { describe, expect, it } from 'vitest';
import { validateAndAggregateBundleV1 } from '../../../../src/benchmark/aggregate/br04AggregateV1';
import type { Br04MetricRef } from '../../../../src/benchmark/aggregate/br04ContractV1';
import {
  buildTestBundleV1,
  iterationV1,
  r2BundleV1,
  r2EntryV1,
  r2PlanV1,
} from '../../../fixtures/benchmark/aggregate/br04FixtureBuildersV1';

const CHUNK = 'chunk.mesh.cpu.ms@1' as Br04MetricRef;

describe('BR04 validation and ledger', () => {
  it.each(['raw', 'canonical', 'plan', 'registry', 'status'] as const)(
    'broken receipt (%s) is fatal',
    (broken) => {
      const bundle = buildTestBundleV1({
        bundleId: `receipt-${broken}`,
        slots: [{ slotId: 'slot-a', candidateId: 'candidate-a' }],
        runs: [{
          runId: 'run-a', slotId: 'slot-a', breakReceipt: broken,
          iterations: [iterationV1('iter-a', CHUNK, [5])],
        }],
      });
      const { validation, aggregate } = validateAndAggregateBundleV1(bundle);
      expect(validation.status).toBe('invalid');
      expect(aggregate).toBeNull();
      expect(validation.counts.fatalErrors).toBeGreaterThan(0);
    },
  );

  it('tampered manifest is fatal', () => {
    const bundle = buildTestBundleV1({
      bundleId: 'manifest',
      slots: [{ slotId: 'slot-a', candidateId: 'candidate-a' }],
      runs: [{
        runId: 'run-a', slotId: 'slot-a',
        iterations: [iterationV1('iter-a', CHUNK, [5])],
      }],
    });
    const tampered = {
      ...bundle,
      runs: [{
        ...bundle.runs[0],
        run: {
          ...bundle.runs[0]?.run,
          iterations: [{
            iterationId: 'iter-a', ordinal: 0,
            samples: [{
              sampleId: 'iter-a:s0', metricRef: CHUNK, value: 6,
              unit: 'ms', valid: true, invalidReason: null, tags: {},
            }],
          }],
        },
      }],
    };
    const { validation, aggregate } = validateAndAggregateBundleV1(tampered);
    expect(validation.status).toBe('invalid');
    expect(aggregate).toBeNull();
    expect(validation.issues.some((issue) => issue.code === 'NORMALIZED_INPUT_DIGEST_MISMATCH')).toBe(true);
  });

  it('every planned slot appears in the ledger exactly once', () => {
    const { validation } = validateAndAggregateBundleV1(buildTestBundleV1({
      bundleId: 'ledger',
      slots: [
        { slotId: 'slot-a', candidateId: 'candidate-a' },
        { slotId: 'slot-b', candidateId: 'candidate-a' },
        { slotId: 'slot-c', candidateId: 'candidate-a' },
      ],
      runs: [{
        runId: 'run-a', slotId: 'slot-a',
        iterations: [iterationV1('iter-a', CHUNK, [5])],
      }],
    }));
    expect(validation.status).toBe('valid');
    expect(validation.runLedger.map((row) => row.slotId)).toEqual(['slot-a', 'slot-b', 'slot-c']);
    expect(validation.runLedger.find((row) => row.slotId === 'slot-b')?.runId).toBeNull();
    expect(validation.counts.missingSlots).toBe(2);
  });

  it('pair dispositions: complete, incomplete-pair, not-applicable', () => {
    const { validation } = validateAndAggregateBundleV1(buildTestBundleV1({
      bundleId: 'pair-disp',
      comparisonMode: 'reference-paired',
      referenceCandidateId: 'ref',
      slots: [
        { slotId: 'slot-r1', candidateId: 'ref', pairCellId: 'pc-1', pairOrdinal: 1, balanceBlockId: 'bb-1', bootstrapClusterId: 'cluster-r1' },
        { slotId: 'slot-c1', candidateId: 'cmp', pairCellId: 'pc-1', pairOrdinal: 1, balanceBlockId: 'bb-1', bootstrapClusterId: 'cluster-c1' },
        { slotId: 'slot-r2', candidateId: 'ref', pairCellId: 'pc-2', pairOrdinal: 1, balanceBlockId: 'bb-1', bootstrapClusterId: 'cluster-r2' },
        { slotId: 'slot-c2', candidateId: 'cmp', pairCellId: 'pc-2', pairOrdinal: 1, balanceBlockId: 'bb-1', bootstrapClusterId: 'cluster-c2' },
        { slotId: 'slot-u', candidateId: 'cmp', pairCellId: null, pairOrdinal: null, balanceBlockId: 'bb-1', bootstrapClusterId: 'cluster-u' },
      ],
      runs: [
        {
          runId: 'run-r1', slotId: 'slot-r1', processId: 'process-r1', candidateId: 'ref',
          iterations: [iterationV1('iter-r1', CHUNK, [10])],
        },
        {
          runId: 'run-c1', slotId: 'slot-c1', processId: 'process-c1', candidateId: 'cmp',
          iterations: [iterationV1('iter-c1', CHUNK, [12])],
        },
        {
          runId: 'run-r2', slotId: 'slot-r2', processId: 'process-r2', candidateId: 'ref',
          iterations: [iterationV1('iter-r2', CHUNK, [10])],
        },
        {
          runId: 'run-u', slotId: 'slot-u', processId: 'process-u', candidateId: 'cmp',
          iterations: [iterationV1('iter-u', CHUNK, [11])],
        },
      ],
    }));
    expect(validation.status).toBe('valid');
    const disposition = (slotId: string) =>
      validation.runLedger.find((row) => row.slotId === slotId)?.pairDisposition;
    expect(disposition('slot-r1')).toBe('complete');
    expect(disposition('slot-c1')).toBe('complete');
    expect(disposition('slot-r2')).toBe('incomplete-pair');
    expect(disposition('slot-c2')).toBe('incomplete-pair');
    expect(disposition('slot-u')).toBe('not-applicable');
  });

  it('illegal phases are fatal', () => {    const bundle = buildTestBundleV1({
      bundleId: 'phase',
      slots: [{ slotId: 'slot-a', candidateId: 'candidate-a' }],
      runs: [{
        runId: 'run-a', slotId: 'slot-a',
        iterations: [iterationV1('iter-a', CHUNK, [5])],
      }],
    });
    const tampered = {
      ...bundle,
      runs: bundle.runs.map((envelope) => ({
        ...envelope,
        run: { ...envelope.run, phase: 'superhot' as never },
      })),
    };
    const { validation, aggregate } = validateAndAggregateBundleV1(tampered);
    expect(validation.status).toBe('invalid');
    expect(aggregate).toBeNull();
    expect(validation.issues.some((issue) => issue.code === 'ILLEGAL_PHASE')).toBe(true);
  });

  it('R2: incomplete pairs retain present and missing slot causes', () => {
    const plan = r2PlanV1('r2-ledger', [
      { slot: 'slot-r', candidate: 'ref', pairCell: 'pc-1', pairOrdinal: 1 },
      { slot: 'slot-c', candidate: 'cmp', pairCell: 'pc-1', pairOrdinal: 1 },
    ], { comparisonMode: 'reference-paired', referenceCandidateId: 'ref' });
    const { bundle } = r2BundleV1('r2-ledger', plan, [
      r2EntryV1(plan, { runId: 'run-r', slot: 'slot-r', candidate: 'ref', values: [10] }),
    ]);
    const { validation, aggregate } = validateAndAggregateBundleV1(bundle ?? (() => {
      throw new Error('missing bundle');
    })());
    expect(validation.status).toBe('valid');
    expect(aggregate?.invalidRuns.missingSlots).toEqual(['slot-c']);
    const incomplete = aggregate?.invalidRuns.incompletePairs;
    expect(incomplete?.length).toBe(1);
    expect(incomplete?.[0]?.balanceBlockId).toBe('bb-1');
    expect(incomplete?.[0]?.pairOrdinal).toBe(1);
    expect(incomplete?.[0]?.presentSlotIds).toEqual(['slot-r']);
    expect(incomplete?.[0]?.missingOrInvalidSlotIds).toEqual(['slot-c']);
    expect(incomplete?.[0]?.reasonCodes).toContain('candidate-missing-or-invalid');
  });
});

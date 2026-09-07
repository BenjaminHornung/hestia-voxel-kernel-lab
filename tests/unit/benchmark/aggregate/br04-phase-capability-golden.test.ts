/**
 * BR04 golden fixtures PH01-PH02, C01, I01-I06 (report section 16.2):
 * phase separation, capability coverage, invalidation retention.
 */
import { describe, expect, it } from 'vitest';
import { validateAndAggregateBundleV1 } from '../../../../src/benchmark/aggregate/br04AggregateV1';
import type { Br04MetricRef } from '../../../../src/benchmark/aggregate/br04ContractV1';
import {
  buildTestBundleV1,
  chunkMetricV1,
  gpuMetricV1,
  iterationV1,
} from '../../../fixtures/benchmark/aggregate/br04FixtureBuildersV1';

const CHUNK = 'chunk.mesh.cpu.ms@1' as Br04MetricRef;
const GPU = 'gpu.time.ms@1' as Br04MetricRef;

describe('BR04 phase and capability goldens', () => {
  it('PH01 cold and measurement never mix: separate cells, maxima 100 and 10', () => {
    const { validation, aggregate } = validateAndAggregateBundleV1(buildTestBundleV1({
      bundleId: 'ph01',
      slots: [
        { slotId: 'slot-cold', candidateId: 'candidate-a', phase: 'cold' },
        { slotId: 'slot-warm', candidateId: 'candidate-a', phase: 'measurement' },
      ],
      runs: [
        {
          runId: 'run-cold', slotId: 'slot-cold', phase: 'cold',
          iterations: [iterationV1('iter-cold', CHUNK, [100])],
        },
        {
          runId: 'run-warm', slotId: 'slot-warm', phase: 'measurement',
          iterations: [iterationV1('iter-warm', CHUNK, [10])],
        },
      ],
    }));
    expect(validation.status).toBe('valid');
    expect(aggregate?.environmentCells.length).toBe(2);
    const cold = aggregate?.environmentCells.find((cell) => cell.phase === 'cold');
    const warm = aggregate?.environmentCells.find((cell) => cell.phase === 'measurement');
    expect(cold?.metricCells[0]?.maximum).toBe(100);
    expect(warm?.metricCells[0]?.maximum).toBe(10);
    expect(cold?.metricCells[0]?.nEvents).toBe(1);
  });

  it('PH02 p99 never combines phases: 600 cold plus 600 measurement stay insufficient', () => {
    const coldValues = Array.from({ length: 600 }, (_, index) => 100 + index);
    const warmValues = Array.from({ length: 600 }, (_, index) => 10 + index);
    const { validation, aggregate } = validateAndAggregateBundleV1(buildTestBundleV1({
      bundleId: 'ph02',
      slots: [
        { slotId: 'slot-cold', candidateId: 'candidate-a', phase: 'cold' },
        { slotId: 'slot-warm', candidateId: 'candidate-a', phase: 'measurement' },
      ],
      runs: [
        {
          runId: 'run-cold', slotId: 'slot-cold', phase: 'cold',
          iterations: [iterationV1('iter-cold', CHUNK, coldValues)],
        },
        {
          runId: 'run-warm', slotId: 'slot-warm', phase: 'measurement',
          iterations: [iterationV1('iter-warm', CHUNK, warmValues)],
        },
      ],
    }));
    expect(validation.status).toBe('valid');
    for (const cell of aggregate?.environmentCells ?? []) {
      const p99 = cell.metricCells[0]?.descriptivePooledQuantiles[2];
      expect(p99?.status).toBe('insufficient-samples');
      expect(p99?.nMatchingValidObservations).toBe(600);
    }
  });

  it('C01 unsupported capability: coverage unsupported, no numeric zero, no candidate failure', () => {
    const { validation, aggregate } = validateAndAggregateBundleV1(buildTestBundleV1({
      bundleId: 'c01',
      metrics: [chunkMetricV1(), gpuMetricV1()],
      slots: [{ slotId: 'slot-a', candidateId: 'candidate-a' }],
      runs: [{
        runId: 'run-a', slotId: 'slot-a',
        capabilities: { 'timestamp-query': 'unsupported' },
        iterations: [iterationV1('iter-a', CHUNK, [12])],
      }],
    }));
    expect(validation.status).toBe('valid');
    const coverage = aggregate?.capabilityCoverage.find((entry) => entry.metricRef === GPU);
    expect(coverage?.status).toBe('unsupported');
    expect(coverage?.supportedRuns).toBe(0);
    expect(coverage?.unsupportedRuns).toBe(1);
    const gpuCells = (aggregate?.environmentCells ?? []).flatMap((cell) =>
      cell.metricCells.filter((metricCell) => metricCell.metricRef === GPU),
    );
    expect(gpuCells.length).toBe(0);
    const row = validation.runLedger.find((entry) => entry.slotId === 'slot-a');
    expect(row?.baseDisposition).toBe('valid');
    expect(row?.metricEligibility[GPU]).toBe('capability-unsupported');
    const serialised = JSON.stringify(aggregate);
    expect(serialised).not.toContain('"gpu.time.ms@1","unit":"ms","nProcesses"');
  });

  it('I01 infrastructure-invalid run retained: valid summary has one run, ledger complete', () => {
    const rule = {
      ruleId: 'host-suspend-resume', version: 1, scope: 'whole-run' as const,
      detectionStage: 'during-run-independent-monitor' as const,
      machineCheckablePredicateId: 'host-suspend-resume-v1',
      candidateIndependent: true as const, valueBlind: true as const,
      retryAllowed: false, maxRetries: 0 as const,
    };
    const { validation, aggregate } = validateAndAggregateBundleV1(buildTestBundleV1({
      bundleId: 'i01',
      rules: [rule],
      slots: [
        { slotId: 'slot-a', candidateId: 'candidate-a' },
        { slotId: 'slot-b', candidateId: 'candidate-a' },
      ],
      runs: [
        {
          runId: 'run-a', slotId: 'slot-a',
          iterations: [iterationV1('iter-a', CHUNK, [10])],
        },
        {
          runId: 'run-b', slotId: 'slot-b', disposition: 'infrastructure-invalid',
          reasonCode: 'infrastructure-failure', ruleId: 'host-suspend-resume',
          iterations: [iterationV1('iter-b', CHUNK, [999])],
        },
      ],
    }));
    expect(validation.status).toBe('valid');
    expect(validation.counts.plannedSlots).toBe(2);
    expect(validation.counts.observedRuns).toBe(2);
    const cell = aggregate?.environmentCells[0]?.metricCells[0];
    expect(cell?.nRuns).toBe(1);
    expect(cell?.maximum).toBe(10);
    const invalidRow = validation.runLedger.find((row) => row.slotId === 'slot-b');
    expect(invalidRow?.baseDisposition).toBe('infrastructure-invalid');
    expect(aggregate?.invalidRuns.baseDispositionCounts['infrastructure-invalid']).toBe(1);
  });

  it('I02 undeclared invalidation fails closed with no publishable aggregate', () => {
    const { validation, aggregate } = validateAndAggregateBundleV1(buildTestBundleV1({
      bundleId: 'i02',
      slots: [{ slotId: 'slot-a', candidateId: 'candidate-a' }],
      runs: [{
        runId: 'run-a', slotId: 'slot-a', disposition: 'infrastructure-invalid',
        reasonCode: 'slow-outlier', ruleId: null,
        iterations: [iterationV1('iter-a', CHUNK, [10])],
      }],
    }));
    expect(validation.status).toBe('invalid');
    expect(aggregate).toBeNull();
    expect(validation.issues.some((issue) => issue.code === 'UNDECLARED_INVALIDATION_CODE')).toBe(true);
  });

  it('I04 source-dirty retained: visible digest and slot, excluded from numerics', () => {
    const { validation, aggregate } = validateAndAggregateBundleV1(buildTestBundleV1({
      bundleId: 'i04',
      slots: [
        { slotId: 'slot-a', candidateId: 'candidate-a' },
        { slotId: 'slot-b', candidateId: 'candidate-a' },
      ],
      runs: [
        {
          runId: 'run-a', slotId: 'slot-a',
          iterations: [iterationV1('iter-a', CHUNK, [10])],
        },
        {
          runId: 'run-b', slotId: 'slot-b', disposition: 'source-dirty',
          reasonCode: 'source-dirty',
          iterations: [iterationV1('iter-b', CHUNK, [20])],
        },
      ],
    }));
    expect(validation.status).toBe('valid');
    const row = validation.runLedger.find((entry) => entry.slotId === 'slot-b');
    expect(row?.baseDisposition).toBe('source-dirty');
    expect(row?.rawByteDigest).not.toBeNull();
    const cell = aggregate?.environmentCells[0]?.metricCells[0];
    expect(cell?.nRuns).toBe(1);
    expect(cell?.maximum).toBe(10);
  });

  it('I05 provenance mismatch retained with incomplete pair', () => {
    const { validation, aggregate } = validateAndAggregateBundleV1(buildTestBundleV1({
      bundleId: 'i05',
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
          disposition: 'provenance-mismatch', reasonCode: 'provenance-mismatch:build-digest',
          iterations: [iterationV1('iter-c', CHUNK, [12])],
        },
      ],
    }));
    expect(validation.status).toBe('valid');
    expect(aggregate?.pairedComparisons[0]?.pairs.complete).toBe(0);
    expect(aggregate?.pairedComparisons[0]?.pairs.incomplete).toBe(1);
    expect(aggregate?.invalidRuns.baseDispositionCounts['provenance-mismatch']).toBe(1);
  });

  it('I06 trace-only retained for diagnosis, excluded from gate numerics', () => {
    const { validation, aggregate } = validateAndAggregateBundleV1(buildTestBundleV1({
      bundleId: 'i06',
      slots: [
        { slotId: 'slot-t', candidateId: 'candidate-a', phase: 'trace' },
        { slotId: 'slot-m', candidateId: 'candidate-a', phase: 'measurement' },
      ],
      runs: [
        {
          runId: 'run-t', slotId: 'slot-t', phase: 'trace', eligible: false,
          disposition: 'trace-only', reasonCode: 'trace-only',
          iterations: [iterationV1('iter-t', CHUNK, [50])],
        },
        {
          runId: 'run-m', slotId: 'slot-m', phase: 'measurement',
          iterations: [iterationV1('iter-m', CHUNK, [10])],
        },
      ],
    }));
    expect(validation.status).toBe('valid');
    const row = validation.runLedger.find((entry) => entry.slotId === 'slot-t');
    expect(row?.baseDisposition).toBe('trace-only');
    const cells = aggregate?.environmentCells ?? [];
    expect(cells.some((cell) => cell.phase === 'trace' && cell.metricCells.length > 0)).toBe(false);
    expect(cells.find((cell) => cell.phase === 'measurement')?.metricCells[0]?.maximum).toBe(10);
  });
});

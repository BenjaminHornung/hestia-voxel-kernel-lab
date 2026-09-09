/**
 * BR04 population qualification: below-technical-floor, technical-only,
 * standard-cell (BR_SERIES_CONTRACT section 11, prompt positive/negative
 * process cases, cold-10 rule, 30-iteration rule, warmup exclusion).
 */
import { describe, expect, it } from 'vitest';
import { validateAndAggregateBundleV1 } from '../../../../src/benchmark/aggregate/br04AggregateV1';
import type { Br04MetricRef, Br04Phase } from '../../../../src/benchmark/aggregate/br04ContractV1';
import {
  buildTestBundleV1,
  chunkMetricV1,
  iterationV1,
  type Br04TestRunSpecV1,
  type Br04TestSlotSpecV1,
} from '../../../fixtures/benchmark/aggregate/br04FixtureBuildersV1';

const CHUNK = 'chunk.mesh.cpu.ms@1' as Br04MetricRef;

function measurementCellV1(
  bundleId: string,
  processCount: number,
  iterationsPerProcess: number,
  phase: Br04Phase = 'measurement',
) {
  const slots: Br04TestSlotSpecV1[] = [];
  const runs: Br04TestRunSpecV1[] = [];
  for (let process = 0; process < processCount; process += 1) {
    const slotId = `slot-p${process}`;
    slots.push({ slotId, candidateId: 'candidate-a', phase, bootstrapClusterId: `cluster-p${process}` });
    const iterations = [];
    for (let iteration = 0; iteration < iterationsPerProcess; iteration += 1) {
      iterations.push(iterationV1(`iter-p${process}-${iteration}`, CHUNK, [10 + process]));
    }
    runs.push({ runId: `run-p${process}`, slotId, processId: `process-p${process}`, phase, iterations });
  }
  return buildTestBundleV1({ bundleId, slots, runs });
}

describe('BR04 population qualification', () => {
  it('two processes are below the technical floor, never technically aggregatable', () => {
    const { validation, aggregate } = validateAndAggregateBundleV1(measurementCellV1('pop-2', 2, 6));
    expect(validation.status).toBe('valid');
    const cell = aggregate?.environmentCells[0]?.metricCells[0];
    expect(cell?.populationQualification).toBe('below-technical-floor');
    expect(cell?.cellInterval.status).toBe('insufficient-clusters');
    expect(cell?.cellPointEstimate).not.toBeNull();
  });

  it('three and four processes are technical-only with a computed interval', () => {
    for (const count of [3, 4]) {
      const { validation, aggregate } = validateAndAggregateBundleV1(measurementCellV1(`pop-${count}`, count, 6));
      expect(validation.status).toBe('valid');
      const cell = aggregate?.environmentCells[0]?.metricCells[0];
      expect(cell?.populationQualification).toBe('technical-only');
      expect(cell?.cellInterval.status).toBe('ok');
    }
  });

  it('five processes with thirty measurement iterations form a standard cell', () => {
    const { validation, aggregate } = validateAndAggregateBundleV1(measurementCellV1('pop-5', 5, 6));
    expect(validation.status).toBe('valid');
    const cell = aggregate?.environmentCells[0]?.metricCells[0];
    expect(cell?.nProcesses).toBe(5);
    expect(cell?.nIterations).toBe(30);
    expect(cell?.populationQualification).toBe('standard-cell');
  });

  it('five processes with fewer than thirty iterations are not a full standard cell', () => {
    const { validation, aggregate } = validateAndAggregateBundleV1(measurementCellV1('pop-5-short', 5, 5));
    expect(validation.status).toBe('valid');
    const cell = aggregate?.environmentCells[0]?.metricCells[0];
    expect(cell?.nIterations).toBe(25);
    expect(cell?.populationQualification).not.toBe('standard-cell');
    expect(cell?.populationQualification).toBe('technical-only');
  });

  it('cold cells need ten fresh processes for standard-cell', () => {
    const cold10 = validateAndAggregateBundleV1(measurementCellV1('cold-10', 10, 1, 'cold'));
    expect(cold10.validation.status).toBe('valid');
    expect(cold10.aggregate?.environmentCells[0]?.metricCells[0]?.populationQualification).toBe('standard-cell');
    const cold9 = validateAndAggregateBundleV1(measurementCellV1('cold-9', 9, 1, 'cold'));
    expect(cold9.validation.status).toBe('valid');
    expect(cold9.aggregate?.environmentCells[0]?.metricCells[0]?.populationQualification).toBe('technical-only');
  });

  it('iterations of one process never count as independent clusters', () => {
    const { validation, aggregate } = validateAndAggregateBundleV1(buildTestBundleV1({
      bundleId: 'pop-pseudo',
      slots: [{ slotId: 'slot-p0', candidateId: 'candidate-a' }],
      runs: [{
        runId: 'run-p0', slotId: 'slot-p0', processId: 'process-p0',
        iterations: [
          iterationV1('iter-0', CHUNK, [1]),
          iterationV1('iter-1', CHUNK, [2]),
          iterationV1('iter-2', CHUNK, [3]),
        ],
      }],
    }));
    expect(validation.status).toBe('valid');
    const cell = aggregate?.environmentCells[0]?.metricCells[0];
    expect(cell?.nProcesses).toBe(1);
    expect(cell?.populationQualification).toBe('below-technical-floor');
    expect(cell?.cellInterval.status).toBe('insufficient-clusters');
  });

  it('warmup runs never enter measurement populations but stay in the ledger', () => {
    const { validation, aggregate } = validateAndAggregateBundleV1(buildTestBundleV1({
      bundleId: 'pop-warmup',
      metrics: [{ ...chunkMetricV1(), allowedPhases: ['measurement'] }],
      slots: [
        { slotId: 'slot-w', candidateId: 'candidate-a', phase: 'warmup' },
        { slotId: 'slot-m', candidateId: 'candidate-a', phase: 'measurement' },
      ],
      runs: [
        {
          runId: 'run-w', slotId: 'slot-w', phase: 'warmup',
          iterations: [iterationV1('iter-w', CHUNK, [999])],
        },
        {
          runId: 'run-m', slotId: 'slot-m', phase: 'measurement',
          iterations: [iterationV1('iter-m', CHUNK, [10])],
        },
      ],
    }));
    expect(validation.status).toBe('valid');
    const cells = aggregate?.environmentCells ?? [];
    expect(cells.length).toBe(1);
    expect(cells[0]?.phase).toBe('measurement');
    expect(cells[0]?.metricCells[0]?.maximum).toBe(10);
    expect(validation.runLedger.length).toBe(2);
  });
});

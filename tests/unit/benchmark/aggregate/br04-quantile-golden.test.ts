/**
 * BR04 golden fixtures Q01-Q06 and O01 plus quantile property contracts
 * (report sections 9.1-9.2, 16.2-16.3 properties 1-3).
 */
import { describe, expect, it } from 'vitest';
import { validateAndAggregateBundleV1 } from '../../../../src/benchmark/aggregate/br04AggregateV1';
import { quantileResultV1 } from '../../../../src/benchmark/aggregate/br04StatisticsV1';
import type { Br04MetricRef, Br04Sha256 } from '../../../../src/benchmark/aggregate/br04ContractV1';
import {
  buildTestBundleV1,
  chunkMetricV1,
  iterationV1,
  rangeV1,
} from '../../../fixtures/benchmark/aggregate/br04FixtureBuildersV1';

const CHUNK = 'chunk.mesh.cpu.ms@1' as Br04MetricRef;
const DIGEST = 'sha256:0000000000000000000000000000000000000000000000000000000000000000' as Br04Sha256;

function scopeV1(scopeId: string) {
  return { metricRef: CHUNK, scopeId, unit: 'ms', sourceRunDigests: [DIGEST] as readonly Br04Sha256[] };
}

describe('BR04 quantile goldens', () => {
  it('Q01 odd nearest-rank: p50=3, p95=5, max=5, p99 insufficient', () => {
    const values = [1, 2, 3, 4, 5];
    const p50 = quantileResultV1(scopeV1('q01'), values, 0.5);
    const p95 = quantileResultV1(scopeV1('q01'), values, 0.95);
    const p99 = quantileResultV1(scopeV1('q01'), values, 0.99);
    expect(p50.status).toBe('ok');
    expect(p50.oneBasedRank).toBe(3);
    expect(p50.value).toBe(3);
    expect(p95.oneBasedRank).toBe(5);
    expect(p95.value).toBe(5);
    expect(p99.status).toBe('insufficient-samples');
    expect(p99.value).toBeNull();
    expect(p99.oneBasedRank).toBeNull();
  });

  it('Q02 even without interpolation: p50=2 not 2.5', () => {
    const values = [1, 2, 3, 4];
    const p50 = quantileResultV1(scopeV1('q02'), values, 0.5);
    const p95 = quantileResultV1(scopeV1('q02'), values, 0.95);
    expect(p50.oneBasedRank).toBe(2);
    expect(p50.value).toBe(2);
    expect(p50.value).not.toBe(2.5);
    expect(p95.value).toBe(4);
  });

  it('Q03 unsorted duplicates sort to [1,1,5,5,9] with p50=5', () => {
    const values = [5, 1, 1, 9, 5];
    expect(quantileResultV1(scopeV1('q03'), values, 0.5).value).toBe(5);
    expect(quantileResultV1(scopeV1('q03'), values, 0.95).value).toBe(9);
  });

  it('Q04 p99 refused at n=999', () => {
    const p99 = quantileResultV1(scopeV1('q04'), rangeV1(1, 999), 0.99);
    expect(p99.status).toBe('insufficient-samples');
    expect(p99.nMatchingValidObservations).toBe(999);
    expect(p99.value).toBeNull();
    expect(p99.oneBasedRank).toBeNull();
  });

  it('Q05 p99 accepted at n=1000 with rank 990 and value 990', () => {
    const p99 = quantileResultV1(scopeV1('q05'), rangeV1(1, 1000), 0.99);
    expect(p99.status).toBe('ok');
    expect(p99.oneBasedRank).toBe(990);
    expect(p99.value).toBe(990);
  });

  it('Q06 only valid events count: 999 valid of 1000, max over valid is 999', () => {
    const validSamples = rangeV1(1, 999).map((value) => ({
      metric: CHUNK, value, unit: 'ms', valid: true, invalidReason: null, tags: {},
    }));
    const bundle = buildTestBundleV1({
      bundleId: 'q06',
      slots: [{ slotId: 'slot-a', candidateId: 'candidate-a' }],
      runs: [{
        runId: 'run-a', slotId: 'slot-a',
        iterations: [{
          iterationId: 'iter-0',
          samples: [...validSamples, {
            metric: CHUNK, value: 1000, unit: 'ms', valid: false,
            invalidReason: 'sample-invalid', tags: {},
          }],
        }],
      }],
    });
    const { validation, aggregate } = validateAndAggregateBundleV1(bundle);
    expect(validation.status).toBe('valid');
    expect(aggregate).not.toBeNull();
    const cell = aggregate?.environmentCells[0]?.metricCells[0];
    expect(cell?.nEvents).toBe(999);
    const p99 = cell?.descriptivePooledQuantiles[2];
    expect(p99?.status).toBe('insufficient-samples');
    expect(p99?.nMatchingValidObservations).toBe(999);
    expect(cell?.maximum).toBe(999);
    const ledgerRow = validation.runLedger.find((row) => row.slotId === 'slot-a');
    expect(ledgerRow?.baseDisposition).toBe('valid');
  });

  it('O01 no outlier deletion: [1,2,3,1000] keeps the extreme value', () => {
    const values = [1, 2, 3, 1000];
    expect(quantileResultV1(scopeV1('o01'), values, 0.5).value).toBe(2);
    expect(quantileResultV1(scopeV1('o01'), values, 0.95).value).toBe(1000);
  });

  it('quantiles are monotone in p and stay inside the population', () => {
    const values = [7, 3, 9, 3, 12, 1];
    const probabilities = [0.5, 0.95, 0.99] as const;
    let previous = Number.NEGATIVE_INFINITY;
    for (const probability of probabilities) {
      const result = quantileResultV1(scopeV1('mono'), values, probability);
      if (result.status === 'ok' && result.value !== null) {
        expect(result.value).toBeGreaterThanOrEqual(previous);
        expect(values).toContain(result.value);
        previous = result.value;
      }
    }
  });

  it('permutation of a population does not change quantiles', () => {
    const forward = [4, 1, 8, 2, 9, 5];
    const backward = [...forward].reverse();
    for (const probability of [0.5, 0.95] as const) {
      expect(quantileResultV1(scopeV1('perm-a'), backward, probability).value)
        .toBe(quantileResultV1(scopeV1('perm-b'), forward, probability).value);
    }
  });

  it('chunk fixture metric carries the BR01 effect delta 0.10 without a global default', () => {
    expect(chunkMetricV1().practicalEffectDelta).toBe(0.1);
    expect(chunkMetricV1().automaticDecision).toBe('forbidden');
  });

  it('builder iterations carry the requested values', () => {
    const iteration = iterationV1('iter-0', CHUNK, [1, 2, 3]);
    expect(iteration.samples.map((sample) => sample.value)).toEqual([1, 2, 3]);
  });
});

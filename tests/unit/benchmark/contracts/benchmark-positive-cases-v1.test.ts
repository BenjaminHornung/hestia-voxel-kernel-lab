import { describe, expect, it } from 'vitest';
import { benchmarkPositiveFixtureCasesV1 } from '../../../../tests/fixtures/benchmark/v1/case-catalog';
import { BENCHMARK_SCENARIO_REGISTRY_V1 } from '../../../../src/benchmark/contracts/scenarioRegistryV1';
import { createBenchmarkCaseRuntimeV1 } from './benchmark-case-runtime-v1';

const runtime = createBenchmarkCaseRuntimeV1(Object.fromEntries(
  Object.entries(BENCHMARK_SCENARIO_REGISTRY_V1).map(([id, entry]) => [id, entry.definitionSha256]),
));

describe('BR01 positive fixture catalog', () => {
  it('dispatches every catalog case exactly once and matches its catalog outcome', () => {
    const executed = new Set<string>();

    for (const entry of benchmarkPositiveFixtureCasesV1) {
      expect(executed.has(entry.id), `${entry.id} was dispatched more than once`).toBe(false);
      executed.add(entry.id);

      const result = entry.executor({ ...entry.options, runtime });
      expect(result.status, `${entry.id}: ${JSON.stringify(result)}`).toBe(entry.expected.status);
      expect(result.stage, `${entry.id}: ${JSON.stringify(result)}`).toBe(entry.expected.stage);
      expect(result.code, `${entry.id}: ${JSON.stringify(result)}`).toBe(entry.expected.code);
      for (const [fact, expected] of Object.entries(entry.expected.facts ?? {})) {
        expect(result.facts[fact], `${entry.id}.${fact}`).toEqual(expected);
      }
    }

    expect([...executed]).toEqual(benchmarkPositiveFixtureCasesV1.map((entry) => entry.id));
    expect(executed.size).toBe(17);
  });
});

import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_SCENARIO_REGISTRY_V1,
  type BenchmarkScenarioParameterV1,
  type UInt32V1,
} from '../../../../src/benchmark/contracts';
import {
  resolveScenarioRouteV1,
  SCENARIO_DRIVER_REGISTRY_V1,
} from '../../../../src/benchmark/runner/scenarios/scenarioDriverRegistryV1';
import { meshGoldenParametersV1 } from '../../../fixtures/benchmark/runner/runPlanInputV1';

describe('BR03 scenario driver registry v1', () => {
  it('is exhaustive and exposes only the bounded mesh lifecycle smoke', () => {
    expect(Object.keys(SCENARIO_DRIVER_REGISTRY_V1).sort()).toEqual(
      Object.keys(BENCHMARK_SCENARIO_REGISTRY_V1).sort(),
    );
    expect(SCENARIO_DRIVER_REGISTRY_V1['mesh-golden-world-v1'].status).toBe('lifecycle-smoke-only');
    expect(Object.entries(SCENARIO_DRIVER_REGISTRY_V1)
      .filter(([scenarioId]) => scenarioId !== 'mesh-golden-world-v1')
      .every(([, driver]) => driver.status === 'unavailable' && driver.measurementEligible === false)).toBe(true);
  });

  it.each([
    ['visible', '/?lab=wp03&mesher=visible'],
    ['greedy', '/?lab=wp03&mesher=greedy'],
    ['greedy-ao', '/?lab=wp04&ao=on&debug=surface'],
  ] as const)('maps the fixed %s workload to its exact app route', (mesher, route) => {
    expect(resolveScenarioRouteV1('mesh-golden-world-v1', meshGoldenParametersV1(mesher))).toEqual({
      status: 'ready',
      route,
      measurementEligible: false,
    });
  });

  it.each([
    ['seed', 1],
    ['backend', 'raw-webgpu'],
    ['chunk-edge', 64],
    ['worker-count', 1],
  ] as const)('fails closed instead of ignoring an unsupported %s', (key, value) => {
    const parameters = meshGoldenParametersV1().map((parameter) =>
      parameter.key === key ? { ...parameter, value } : parameter,
    ) as BenchmarkScenarioParameterV1[];
    expect(() => resolveScenarioRouteV1('mesh-golden-world-v1', parameters)).toThrow();
  });

  it('returns an explicit unavailable result rather than executing backend-fixture-v1', () => {
    const parameters: BenchmarkScenarioParameterV1[] = [
      { key: 'seed', value: 0x4845_5354 as UInt32V1 },
      { key: 'backend', value: 'three-webgl2' },
      { key: 'mesher', value: 'greedy-ao' },
      { key: 'chunk-edge', value: 32 },
      { key: 'worker-count', value: 0 },
      { key: 'camera-contract-sha256', value: `sha256:${'1'.repeat(64)}` as never },
      { key: 'feature-contract-sha256', value: `sha256:${'2'.repeat(64)}` as never },
    ];
    expect(resolveScenarioRouteV1('backend-fixture-v1', parameters)).toEqual({
      status: 'unavailable',
      reasonCode: 'backend-parity-producers-unavailable',
      measurementEligible: false,
    });
  });
});

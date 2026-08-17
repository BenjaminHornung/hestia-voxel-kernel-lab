import { canonicalizeJsonV1 } from '../provenance/canonicalJsonV1';
import {
  BENCHMARK_METRIC_REGISTRY_V1,
  BENCHMARK_SCENARIO_METRIC_CAPABILITY_SELECTIONS_V1,
  benchmarkScenarioDefinitionsV1,
} from './scenarioRegistryV1';
import type { BenchmarkScenarioDefinitionV1, MetricRegistryV1 } from './typesV1';

export * from './versions';
export * from './typesV1';
export * from './browserValidationV1';
export * from './schemaSetV1';
export * from './scenarioRegistryV1';
export * from '../provenance/canonicalJsonV1';
export * from '../provenance/canonicalPathV1';

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function equalsCanonicalJson(value: unknown, expected: unknown): boolean {
  try {
    return sameBytes(canonicalizeJsonV1(value), canonicalizeJsonV1(expected));
  } catch {
    return false;
  }
}

export function validateBrowserScenarioDefinitionV1(value: unknown): value is BenchmarkScenarioDefinitionV1 {
  return benchmarkScenarioDefinitionsV1.some((definition) => equalsCanonicalJson(value, definition));
}

export function validateBrowserMetricRegistryV1(value: unknown): value is MetricRegistryV1 {
  return equalsCanonicalJson(value, BENCHMARK_METRIC_REGISTRY_V1);
}

export function validateBrowserScenarioMetricMappingsV1(value: unknown): boolean {
  return equalsCanonicalJson(value, BENCHMARK_SCENARIO_METRIC_CAPABILITY_SELECTIONS_V1);
}

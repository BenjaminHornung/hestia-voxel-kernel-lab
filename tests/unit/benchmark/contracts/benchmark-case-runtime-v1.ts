import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { canonicalizeJsonV1 } from '../../../../src/benchmark/provenance/canonicalJsonV1';
import type { MetricRegistryV1 } from '../../../../src/benchmark/contracts/typesV1';
import { BENCHMARK_METRIC_REGISTRY_V1 } from '../../../../src/benchmark/contracts/scenarioRegistryV1';

export interface BenchmarkCaseRuntimeV1 {
  readonly validateRunSchema: (value: unknown) => boolean;
  readonly validateArtifactSchema: (value: unknown) => boolean;
  readonly validateBundleSchema: (value: unknown) => boolean;
  readonly validateScenarioSchema: (value: unknown) => boolean;
  readonly schemaSetBytes: Uint8Array;
  readonly scenarioDefinitionDigests: Readonly<Record<string, string>>;
  readonly metricRegistry: MetricRegistryV1;
}

const schemaNames = [
  'benchmark-artifact-manifest-v1.schema.json',
  'benchmark-bundle-manifest-v1.schema.json',
  'benchmark-run-v1.schema.json',
  'benchmark-scenario-definition-v1.schema.json',
  'benchmark-validation-receipt-v1.schema.json',
] as const;

const schemaObjects = Object.fromEntries(schemaNames.map((name) => [
  name,
  JSON.parse(readFileSync(`src/benchmark/contracts/schemas/${name}`, 'utf8')),
])) as Record<string, unknown>;

export const BENCHMARK_TEST_SCHEMA_SET_BYTES_V1 = canonicalizeJsonV1(schemaObjects);

export function createBenchmarkCaseRuntimeV1(
  scenarioDefinitionDigests: Readonly<Record<string, string>>,
): BenchmarkCaseRuntimeV1 {
  const ajv = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
  const validateRunSchema = ajv.compile(schemaObjects['benchmark-run-v1.schema.json'] as any);
  const validateArtifactSchema = ajv.compile(schemaObjects['benchmark-artifact-manifest-v1.schema.json'] as any);
  const validateBundleSchema = ajv.compile(schemaObjects['benchmark-bundle-manifest-v1.schema.json'] as any);
  const validateScenarioSchema = ajv.compile(schemaObjects['benchmark-scenario-definition-v1.schema.json'] as any);
  return {
    validateRunSchema,
    validateArtifactSchema,
    validateBundleSchema,
    validateScenarioSchema,
    schemaSetBytes: BENCHMARK_TEST_SCHEMA_SET_BYTES_V1,
    scenarioDefinitionDigests,
    metricRegistry: BENCHMARK_METRIC_REGISTRY_V1,
  };
}

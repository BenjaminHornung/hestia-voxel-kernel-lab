import artifactManifestSchema from './schemas/benchmark-artifact-manifest-v1.schema.json';
import bundleManifestSchema from './schemas/benchmark-bundle-manifest-v1.schema.json';
import runSchema from './schemas/benchmark-run-v1.schema.json';
import scenarioDefinitionSchema from './schemas/benchmark-scenario-definition-v1.schema.json';
import validationReceiptSchema from './schemas/benchmark-validation-receipt-v1.schema.json';
import { canonicalizeJsonV1 } from '../provenance/canonicalJsonV1';
import type { Sha256DigestV1 } from './typesV1';

/** Checked-in schema objects keyed by their canonical repository filenames. */
const benchmarkSchemaSetV1 = {
  'benchmark-artifact-manifest-v1.schema.json': artifactManifestSchema,
  'benchmark-bundle-manifest-v1.schema.json': bundleManifestSchema,
  'benchmark-run-v1.schema.json': runSchema,
  'benchmark-scenario-definition-v1.schema.json': scenarioDefinitionSchema,
  'benchmark-validation-receipt-v1.schema.json': validationReceiptSchema,
} as const;

const canonicalBenchmarkSchemaSetBytesV1 = canonicalizeJsonV1(benchmarkSchemaSetV1);

export const BENCHMARK_SCHEMA_SET_SHA256_V1 = 'sha256:cc2d4ba6d2c148b94ff42458dc9fb7a7af2159711d713871e15848a7fe5ca4ef' as Sha256DigestV1;
export const BENCHMARK_SCHEMA_SET_BYTES_V1 = new Uint8Array(canonicalBenchmarkSchemaSetBytesV1);

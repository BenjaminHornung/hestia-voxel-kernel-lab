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

export const BENCHMARK_SCHEMA_SET_SHA256_V1 = 'sha256:1d3ab467b21d1033601704e1d2889287581bf9be0990bb227ed78747381419d7' as Sha256DigestV1;
export const BENCHMARK_SCHEMA_SET_BYTES_V1 = new Uint8Array(canonicalBenchmarkSchemaSetBytesV1);

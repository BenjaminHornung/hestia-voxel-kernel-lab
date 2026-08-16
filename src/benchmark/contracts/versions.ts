export const BENCHMARK_PROTOCOL_VERSION = 'benchmark-protocol-v1' as const;

export const BENCHMARK_SCHEMA_VERSIONS = {
  sourceProvenance: 'benchmark-source-provenance-v1',
  environmentManifest: 'benchmark-environment-manifest-v1',
  executionDescriptor: 'benchmark-execution-descriptor-v1',
  rawSample: 'benchmark-raw-sample-v1',
  iteration: 'benchmark-iteration-v1',
  run: 'benchmark-run-v1',
  browserProcess: 'benchmark-browser-process-v1',
  hardwareCell: 'benchmark-hardware-cell-v1',
  artifactManifest: 'benchmark-artifact-manifest-v1',
  bundleManifest: 'benchmark-bundle-manifest-v1',
  scenarioDefinition: 'benchmark-scenario-definition-v1',
  validationReceipt: 'benchmark-validation-receipt-v1',
  validationFailure: 'benchmark-validation-failure-v1',
} as const;

export const BENCHMARK_DIGEST_DOMAINS = {
  bundle: 'hestia-benchmark-bundle-sha256-v1\0',
  build: 'hestia-benchmark-build-sha256-v1\0',
  fileset: 'hestia-benchmark-fileset-sha256-v1\0',
} as const;

export const BENCHMARK_STATUS_COMMAND =
  'git status --porcelain=v2 -z --untracked-files=all --ignore-submodules=none' as const;

export const EMPTY_STATUS_SHA256 =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' as const;

export const BENCHMARK_REPOSITORY_URL =
  'https://github.com/BenjaminHornung/hestia-voxel-kernel-lab' as const;

export const BR01_ACCEPTED_WP04_SHA =
  'c64aeef1f51dd0ed2d8431411cf3ba1e84195b9d' as const;

export const BR01_C08_SHA = '377979a27f5ca8482a3bf534b9307653417b43bd' as const;
export const BR01_SOURCE_PACK_SHA = '8b7582b209c1618a2974d1ec6849b6aace827a1f' as const;

export const BENCHMARK_ID_OWNERSHIP = {
  slotId: 'BR03',
  browserProcessId: 'BR03',
  bootstrapClusterId: 'BR03',
  pairCellId: 'BR03',
  pairOrdinal: 'BR03',
} as const;

export type BenchmarkProtocolVersion = typeof BENCHMARK_PROTOCOL_VERSION;
export type BenchmarkSchemaVersionV1 =
  (typeof BENCHMARK_SCHEMA_VERSIONS)[keyof typeof BENCHMARK_SCHEMA_VERSIONS];
export type BenchmarkDigestDomainV1 = (typeof BENCHMARK_DIGEST_DOMAINS)[keyof typeof BENCHMARK_DIGEST_DOMAINS];

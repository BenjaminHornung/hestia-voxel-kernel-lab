import {
  BENCHMARK_METRIC_REGISTRY_V1,
  BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1,
  BENCHMARK_SCHEMA_SET_BYTES_V1,
  createBenchmarkValidationReceiptV1,
  validateBenchmarkRunV1,
  validateBenchmarkValidationReceiptV1,
  type BenchmarkRunDocumentV1,
  type BenchmarkValidationContextV1,
  type BenchmarkValidationReceiptV1,
  type AdaptTelemetryExportV1,
  type CanonicalIdV1,
  type GitShaV1,
} from '../../contracts';
import { adaptTelemetryExportV1 } from '../../adapters';
import { canonicalizeJsonV1, readFileBytesV1, repositoryRelativePathV1 } from '../../provenance';

export interface ReceiptValidatorSourceFileV1 {
  readonly path: string;
  readonly absolutePath: string;
  readonly bytes?: Uint8Array;
}

export interface MintReceiptOptionsV1 {
  readonly document: BenchmarkRunDocumentV1;
  readonly planId: CanonicalIdV1;
  readonly slotId: CanonicalIdV1;
  readonly runId: CanonicalIdV1;
  readonly telemetryExportRawBytes: Uint8Array;
  readonly validatorSourceCommitSha: GitShaV1;
  readonly validatorSourceFiles: readonly ReceiptValidatorSourceFileV1[];
  readonly validationContext: BenchmarkValidationContextV1;
  readonly telemetryAdapter?: AdaptTelemetryExportV1;
}

export interface MintedReceiptV1 {
  readonly benchmarkRunRawBytes: Uint8Array;
  readonly benchmarkRunCanonicalBytes: Uint8Array;
  readonly receipt: BenchmarkValidationReceiptV1;
  readonly receiptCanonicalBytes: Uint8Array;
}

export async function mintReceiptV1(options: MintReceiptOptionsV1): Promise<MintedReceiptV1> {
  const validation = validateBenchmarkRunV1(options.document, options.validationContext, BENCHMARK_METRIC_REGISTRY_V1);
  if (!validation.valid) throw new Error(`Cannot mint receipt for BR01-invalid hardware cell: ${validation.code}.`);
  if (options.validatorSourceFiles.length === 0) throw new TypeError('Receipt validator source file set must be non-empty.');
  let validatorSourceBytes = 0;
  const validatorSourceFiles = options.validatorSourceFiles.map(({ path, absolutePath, bytes }) => {
    const sourceBytes = bytes ?? readFileBytesV1(absolutePath, {
      maxFileBytes: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.maxFileBytes,
      maxAggregateBytes: Math.max(0, BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.maxAggregateBytes - validatorSourceBytes),
    });
    if (sourceBytes.byteLength < 1 || sourceBytes.byteLength > BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.maxFileBytes) {
      throw new TypeError(`Receipt validator source exceeds the v1 per-file limit: ${path}.`);
    }
    validatorSourceBytes += sourceBytes.byteLength;
    if (validatorSourceBytes > BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.maxAggregateBytes) {
      throw new TypeError('Receipt validator source files exceed the v1 aggregate limit.');
    }
    return { path: repositoryRelativePathV1(path), bytes: sourceBytes };
  });
  const benchmarkRunRawBytes = canonicalizeJsonV1(options.document);
  const benchmarkRunCanonicalBytes = canonicalizeJsonV1(options.document);
  const receipt = createBenchmarkValidationReceiptV1({
    planId: options.planId,
    slotId: options.slotId,
    runId: options.runId,
    telemetryExportRawBytes: options.telemetryExportRawBytes,
    benchmarkRunRawBytes,
    benchmarkRunCanonicalBytes,
    schemaSetBytes: BENCHMARK_SCHEMA_SET_BYTES_V1,
    metricRegistry: BENCHMARK_METRIC_REGISTRY_V1,
     telemetryAdapter: { adapt: options.telemetryAdapter ?? adaptTelemetryExportV1 },
    validatorSourceCommitSha: options.validatorSourceCommitSha,
    validatorSourceFiles,
    validationContext: options.validationContext,
  });
  const receiptValidation = validateBenchmarkValidationReceiptV1(receipt);
  if (!receiptValidation.valid) throw new Error(`BR01 rejected its minted receipt: ${receiptValidation.code}.`);
  return { benchmarkRunRawBytes, benchmarkRunCanonicalBytes, receipt, receiptCanonicalBytes: canonicalizeJsonV1(receipt) };
}

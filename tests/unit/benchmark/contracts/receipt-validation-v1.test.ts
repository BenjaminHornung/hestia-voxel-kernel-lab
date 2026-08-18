import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalizeJsonV1 } from '../../../../src/benchmark/provenance/canonicalJsonV1';
import { repositoryRelativePathV1 } from '../../../../src/benchmark/provenance/canonicalPathV1';
import { sha256BytesV1 } from '../../../../src/benchmark/provenance/fileSetDigestV1';
import { BENCHMARK_METRIC_REGISTRY_V1, BENCHMARK_SCENARIO_REGISTRY_V1 } from '../../../../src/benchmark/contracts/scenarioRegistryV1';
import { BENCHMARK_SCHEMA_SET_BYTES_V1 as PRODUCTION_SCHEMA_SET_BYTES_V1 } from '../../../../src/benchmark/contracts/schemaSetV1';
import { BENCHMARK_SCHEMA_SET_BYTES_V1, createBenchmarkCaseDocumentV1, createBenchmarkTelemetryAdapterV1, createBenchmarkTelemetryExportV1, createBenchmarkValidationContextV1, createTwoIterationBenchmarkCaseDocumentV1 } from './benchmark-case-fixtures-v1';
import {
  calculateRunBindingSha256V1,
  createBenchmarkValidationReceiptV1,
  validateBenchmarkValidationReceiptV1,
} from '../../../../src/benchmark/contracts/validateV1';

const TWO_ITERATION_ADAPTER_RESULTS_SHA256 = 'sha256:f5d4d4819be0010f21c1017c95b51ae4ea9771a0e63f54e923f140ef011c0b13';
const TWO_ITERATION_SAMPLES_SHA256 = 'sha256:5465e43eae356a2730f8926767c186b3c420da6eb699f78e693f6078d080f421';

function independentCanonicalSha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalizeJsonV1(value)).digest('hex')}`;
}

function input(document = createBenchmarkCaseDocumentV1({ samples: true })) {
  const raw = canonicalizeJsonV1(document);
  const context = createBenchmarkValidationContextV1();
  const telemetry = canonicalizeJsonV1(createBenchmarkTelemetryExportV1(document));
  return {
    planId: 'plan-v1' as never,
    slotId: 'slot-measurement' as never,
    runId: 'measurement-run' as never,
    telemetryExportRawBytes: telemetry,
    benchmarkRunRawBytes: raw,
    benchmarkRunCanonicalBytes: raw,
    schemaSetBytes: BENCHMARK_SCHEMA_SET_BYTES_V1,
    metricRegistry: BENCHMARK_METRIC_REGISTRY_V1,
    telemetryAdapter: createBenchmarkTelemetryAdapterV1(),
    validatorSourceCommitSha: 'a'.repeat(40) as never,
    validatorSourceFiles: [{ path: repositoryRelativePathV1('validator-v1.ts'), bytes: new TextEncoder().encode('validator') }],
    validationContext: context,
  };
}

describe('BR01 validation receipts', () => {
  it('computes all receipt digests from actual inputs', () => {
    const value = input();
    const receipt = createBenchmarkValidationReceiptV1(value);
    expect(validateBenchmarkValidationReceiptV1(receipt)).toMatchObject({ valid: true });
    expect(receipt.benchmarkRunRawByteSha256).toBe(sha256BytesV1(value.benchmarkRunRawBytes));
    expect(receipt.telemetryExportRawByteSha256).not.toBe(receipt.benchmarkRunRawByteSha256);
  });
  it('rejects unrelated telemetry even when the target run is otherwise valid', () => {
    const value = input();
    value.telemetryExportRawBytes = canonicalizeJsonV1({ runId: 'another-run', records: [] });
    expect(() => createBenchmarkValidationReceiptV1(value)).toThrow('does not match');
  });
  it('rejects an adapter result that claims an invalid derivation', () => {
    const value = input();
    value.telemetryAdapter = { ...value.telemetryAdapter, adapt: () => ({ samples: [], invalidReasons: [{ code: 'sample-invalid', detail: 'invalid adapter result', phase: 'measurement' }] as never }) };
    expect(() => createBenchmarkValidationReceiptV1(value)).toThrow('invalid telemetry derivation');
  });
  it('binds the accepted adapter contract and complete result chain', () => {
    const value = input(createTwoIterationBenchmarkCaseDocumentV1());
    const receipt = createBenchmarkValidationReceiptV1(value);
    const document = JSON.parse(new TextDecoder().decode(value.benchmarkRunRawBytes)) as any;
    const telemetry = JSON.parse(new TextDecoder().decode(value.telemetryExportRawBytes)) as any;
    const targetRun = document.browserProcesses[0].runs.find((run: any) => run.runId === 'measurement-run');
    const adapterResults = telemetry.records.map((record: any) => ({
      iterationId: record.iterationId,
      iterationOrdinal: record.iterationOrdinal,
      runId: record.runId,
      phase: record.phase,
      samples: record.samples,
      invalidReasons: [],
    }));
    const samples = targetRun.iterations.flatMap((iteration: any) => iteration.samples);
    expect(receipt.telemetryDerivationEvidence.adapterContractId).toBe('br02-telemetry-export-v1-to-benchmark-raw-sample-v1');
    expect(receipt.telemetryDerivationEvidence.adapterContractVersion).toBe(1);
    expect(independentCanonicalSha256(adapterResults)).toBe(TWO_ITERATION_ADAPTER_RESULTS_SHA256);
    expect(independentCanonicalSha256(samples)).toBe(TWO_ITERATION_SAMPLES_SHA256);
    expect(receipt.telemetryDerivationEvidence.adapterResultsCanonicalSha256).toBe(TWO_ITERATION_ADAPTER_RESULTS_SHA256);
    expect(receipt.telemetryDerivationEvidence.derivedRawSamplesCanonicalSha256).toBe(TWO_ITERATION_SAMPLES_SHA256);
    expect(independentCanonicalSha256([...adapterResults].reverse())).not.toBe(TWO_ITERATION_ADAPTER_RESULTS_SHA256);
    const changedSamples = JSON.parse(JSON.stringify(samples));
    changedSamples[0].result.value += 1;
    expect(independentCanonicalSha256(changedSamples)).not.toBe(TWO_ITERATION_SAMPLES_SHA256);
    expect(receipt.telemetryDerivationEvidence.adapterResultsCanonicalSha256).not.toBe(receipt.telemetryDerivationEvidence.derivedRawSamplesCanonicalSha256);
    expect(receipt.telemetryDerivationEvidence.derivedSampleCount).toBeGreaterThan(0);
    expect(validateBenchmarkValidationReceiptV1(receipt)).toMatchObject({ valid: true });
    const alteredEvidence = JSON.parse(JSON.stringify(receipt)) as Record<string, any>;
    alteredEvidence.telemetryDerivationEvidence.adapterResultsCanonicalSha256 = `sha256:${'b'.repeat(64)}`;
    expect(validateBenchmarkValidationReceiptV1(alteredEvidence)).toMatchObject({ valid: false, code: 'derivation-evidence-digest-mismatch' });
  });
  it('does not carry caller-provided adapter source provenance', () => {
    const receipt = createBenchmarkValidationReceiptV1(input());
    expect(receipt.telemetryDerivationEvidence).not.toHaveProperty('adapterSourceCommitSha');
    expect(receipt.telemetryDerivationEvidence).not.toHaveProperty('adapterSourceFileSetSha256');
    expect(input().telemetryAdapter).not.toHaveProperty('contractId');
    expect(input().telemetryAdapter).not.toHaveProperty('sourceFiles');
  });
  it('rejects telemetry sample-value and identity mutations before minting', () => {
    for (const mutate of [
      (telemetry: any) => { telemetry.records[0].samples[0].result.value += 1; },
      (telemetry: any) => { telemetry.records[0].runId = 'other-run'; },
      (telemetry: any) => { telemetry.records[0].iterationId = 'other-iteration'; },
    ]) {
      const value = input();
      const telemetry = JSON.parse(new TextDecoder().decode(value.telemetryExportRawBytes));
      mutate(telemetry);
      value.telemetryExportRawBytes = canonicalizeJsonV1(telemetry);
      expect(() => createBenchmarkValidationReceiptV1(value)).toThrow();
    }
  });
  it('rejects reordered telemetry iteration records', () => {
    const value = input(createTwoIterationBenchmarkCaseDocumentV1());
    const telemetry = JSON.parse(new TextDecoder().decode(value.telemetryExportRawBytes));
    telemetry.records.reverse();
    value.telemetryExportRawBytes = canonicalizeJsonV1(telemetry);
    expect(() => createBenchmarkValidationReceiptV1(value)).toThrow();
  });
  it('rejects a mutated adapter result even when telemetry is unchanged', () => {
    const value = input();
    const adapt = value.telemetryAdapter.adapt;
    value.telemetryAdapter = {
      adapt: (telemetry, context, registry) => {
        const result = adapt(telemetry, context, registry);
        return { ...result, samples: result.samples.slice(0, -1) };
      },
    };
    expect(() => createBenchmarkValidationReceiptV1(value)).toThrow('does not match');
  });
  it('rejects minting a receipt for a zero-sample target run', () => {
    expect(() => createBenchmarkValidationReceiptV1(input(createBenchmarkCaseDocumentV1({ samples: false })))).toThrow();
  });
  it('does not mint a receipt for the existing invalid-run fixture', () => {
    const value = input();
    const document = createBenchmarkCaseDocumentV1({ samples: true, invalid: true });
    const raw = canonicalizeJsonV1(document);
    value.benchmarkRunRawBytes = raw;
    value.benchmarkRunCanonicalBytes = raw;
    expect(() => createBenchmarkValidationReceiptV1(value)).toThrow('execution-invalid target run');
  });

  it.each([
    ['invalid run', (value: any) => { const document = JSON.parse(new TextDecoder().decode(value.benchmarkRunRawBytes)); document.browserProcesses[0].runs[1].createdUtc = '2026-08-13T12:00:01.000Z'; value.benchmarkRunRawBytes = canonicalizeJsonV1(document); value.benchmarkRunCanonicalBytes = value.benchmarkRunRawBytes; }],
    ['reversed sample array', (value: any) => { const document = JSON.parse(new TextDecoder().decode(value.benchmarkRunRawBytes)); document.browserProcesses[0].runs.at(-1).iterations[0].samples.reverse(); value.benchmarkRunRawBytes = canonicalizeJsonV1(document); value.benchmarkRunCanonicalBytes = value.benchmarkRunRawBytes; }],
    ['reversed iteration array', (value: any) => { const document = JSON.parse(new TextDecoder().decode(value.benchmarkRunRawBytes)); const run = document.browserProcesses[0].runs.at(-1); const second = JSON.parse(JSON.stringify(run.iterations[0])); second.iterationId = 'iteration-1'; second.iterationOrdinal = 1; run.iterations = [second, run.iterations[0]]; value.benchmarkRunRawBytes = canonicalizeJsonV1(document); value.benchmarkRunCanonicalBytes = value.benchmarkRunRawBytes; }],
    ['wrong plan', (value: any) => { value.planId = 'other-plan'; }],
    ['wrong run', (value: any) => { value.runId = 'other-run'; }],
    ['raw/canonical mismatch', (value: any) => { value.benchmarkRunCanonicalBytes = new TextEncoder().encode('{}'); }],
    ['wrong schema digest', (value: any) => { value.validationContext = { ...value.validationContext, schemaSetSha256: `sha256:${'b'.repeat(64)}` }; }],
    ['wrong registry digest', (value: any) => { value.validationContext = { ...value.validationContext, metricRegistrySha256: `sha256:${'b'.repeat(64)}` }; }],
  ])('rejects %s without minting', (_label, mutate) => {
    const value = input();
    mutate(value);
    expect(() => createBenchmarkValidationReceiptV1(value)).toThrow();
  });
  it.each([
    ['reversed cross-iteration samples', (document: any) => { document.browserProcesses[0].runs.at(-1).iterations[1].samples.reverse(); }],
    ['duplicate cross-iteration sample ordinal', (document: any) => { document.browserProcesses[0].runs.at(-1).iterations[1].samples[0].ordinal = 0; }],
    ['gapped cross-iteration sample ordinal', (document: any) => { const run = document.browserProcesses[0].runs.at(-1); run.iterations[1].samples[0].ordinal = run.iterations[0].samples.length + 1; }],
  ] as const)('rejects %s before minting a receipt', (_label, mutate) => {
    const value = input();
    const document = createTwoIterationBenchmarkCaseDocumentV1();
    mutate(document);
    value.benchmarkRunRawBytes = canonicalizeJsonV1(document);
    value.benchmarkRunCanonicalBytes = value.benchmarkRunRawBytes;
    expect(() => createBenchmarkValidationReceiptV1(value)).toThrow();
  });

  it.each(['timestamp', 'random', 'extra'])('rejects receipt %s fields', (field) => {
    const receipt = createBenchmarkValidationReceiptV1(input()) as unknown as Record<string, unknown>;
    if (field === 'timestamp') receipt.timestamp = '2026-08-13T12:00:00.000Z';
    if (field === 'random') receipt.random = 'random';
    if (field === 'extra') (receipt.validator as Record<string, unknown>).extra = true;
    expect(validateBenchmarkValidationReceiptV1(receipt).valid).toBe(false);
  });

  it('rejects a recomputed receipt when the source context changes', () => {
    const value = input();
    const document = JSON.parse(new TextDecoder().decode(value.benchmarkRunRawBytes));
    document.source.candidate.sourceFileSetSha256.value = `sha256:${'b'.repeat(64)}`;
    value.benchmarkRunRawBytes = canonicalizeJsonV1(document);
    value.benchmarkRunCanonicalBytes = value.benchmarkRunRawBytes;
    expect(() => createBenchmarkValidationReceiptV1(value)).toThrow();
  });

  it('rejects schema bytes that are not the accepted schema set', () => {
    const value = input();
    const arbitrary = new TextEncoder().encode('arbitrary-schema-bytes');
    value.schemaSetBytes = arbitrary;
    value.validationContext = { ...value.validationContext, schemaSetSha256: sha256BytesV1(arbitrary) };
    expect(() => createBenchmarkValidationReceiptV1(value)).toThrow();
  });
  it('rejects a mutated exported schema byte copy against the immutable schema digest', () => {
    const exportedBytes = PRODUCTION_SCHEMA_SET_BYTES_V1;
    const original = exportedBytes[0]!;
    exportedBytes[0] = original ^ 0xff;
    try {
      const value = input();
      value.schemaSetBytes = exportedBytes;
      expect(() => createBenchmarkValidationReceiptV1(value)).toThrow('schema bytes do not match');
    } finally {
      exportedBytes[0] = original;
    }
  });

  it.each([
    ['schema-set digest', 'schemaSetSha256', 'schema-set-digest-mismatch'],
    ['metric-registry digest', 'metricRegistrySha256', 'registry-digest-mismatch'],
  ] as const)('rejects a recomputed receipt with a shadow %s', (_label, field, code) => {
    const receipt = createBenchmarkValidationReceiptV1(input()) as unknown as Record<string, unknown>;
    receipt[field] = `sha256:${'b'.repeat(64)}`;
    delete receipt.receiptId;
    receipt.receiptId = sha256BytesV1(canonicalizeJsonV1(receipt));
    expect(validateBenchmarkValidationReceiptV1(receipt)).toMatchObject({ valid: false, code });
  });

  it.each([
    ['malformed', 'not-a-sha'],
    ['uppercase', 'A'.repeat(40)],
    ['wrong length', 'a'.repeat(39)],
  ])('rejects %s validator commit SHA before minting', (_label, commitSha) => {
    const value = input();
    value.validatorSourceCommitSha = commitSha as never;
    expect(() => createBenchmarkValidationReceiptV1(value)).toThrow();
  });

  it('rejects a different otherwise-valid metric registry before minting', () => {
    const value = input();
    const registry = JSON.parse(JSON.stringify(BENCHMARK_METRIC_REGISTRY_V1)) as any;
    registry.metrics[0].eventSemantics = `${registry.metrics[0].eventSemantics} changed`;
    registry.metricRegistrySha256 = sha256BytesV1(canonicalizeJsonV1({ schemaVersion: registry.schemaVersion, protocolVersion: registry.protocolVersion, metrics: registry.metrics, telemetryMappings: registry.telemetryMappings }));
    value.metricRegistry = registry;
    value.validationContext = { ...value.validationContext, metricRegistrySha256: registry.metricRegistrySha256 };
    expect(() => createBenchmarkValidationReceiptV1(value)).toThrow();
  });
  it('rejects a receipt bound to a cloned mutated scenario definition', () => {
    const value = input();
    const document = JSON.parse(new TextDecoder().decode(value.benchmarkRunRawBytes)) as any;
    const definition = JSON.parse(JSON.stringify(BENCHMARK_SCENARIO_REGISTRY_V1['mesh-golden-world-v1'].definition)) as any;
    definition.metricContracts[0].metricRef = 'mutated@1';
    const mutatedDigest = sha256BytesV1(canonicalizeJsonV1(definition));
    for (const run of document.browserProcesses[0].runs) {
      run.scenario.definitionSha256 = mutatedDigest;
      run.runBindingSha256 = calculateRunBindingSha256V1(run);
      for (const iteration of run.iterations) for (const sample of iteration.samples) sample.runBindingSha256 = run.runBindingSha256;
    }
    const raw = canonicalizeJsonV1(document);
    value.benchmarkRunRawBytes = raw;
    value.benchmarkRunCanonicalBytes = raw;
    expect(() => createBenchmarkValidationReceiptV1(value)).toThrow();
  });
});

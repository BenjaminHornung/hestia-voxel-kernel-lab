import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BENCHMARK_METRIC_REGISTRY_V1, benchmarkScenarioDefinitionsV1 } from '../../../../src/benchmark/contracts/scenarioRegistryV1';
import { BENCHMARK_SCHEMA_SET_BYTES_V1, BENCHMARK_SCHEMA_SET_SHA256_V1 } from '../../../../src/benchmark/contracts/schemaSetV1';
import { sha256BytesV1 } from '../../../../src/benchmark/provenance/fileSetDigestV1';
import { createBenchmarkValidationReceiptV1, validateBenchmarkRunStructureV1, validateBenchmarkValidationReceiptV1 } from '../../../../src/benchmark/contracts/validateV1';
import { createBenchmarkCaseDocumentV1, createBenchmarkTelemetryAdapterV1, createBenchmarkTelemetryExportV1, createBenchmarkValidationContextV1 } from './benchmark-case-fixtures-v1';
import { canonicalizeJsonV1 } from '../../../../src/benchmark/provenance/canonicalJsonV1';

const schemaFiles = [
  'benchmark-run-v1.schema.json',
  'benchmark-artifact-manifest-v1.schema.json',
  'benchmark-bundle-manifest-v1.schema.json',
  'benchmark-scenario-definition-v1.schema.json',
  'benchmark-validation-receipt-v1.schema.json',
] as const;

describe('BR01 Draft 2020-12 schemas', () => {
  it('recomputes the checked-in schema-set digest from canonical bytes in Node', () => {
    expect(sha256BytesV1(BENCHMARK_SCHEMA_SET_BYTES_V1)).toBe(BENCHMARK_SCHEMA_SET_SHA256_V1);
  });
  it('keeps the receipt schema in AJV parity with the hand validator', () => {
    const document = createBenchmarkCaseDocumentV1({ phase: 'cold', container: 'cold', samples: true });
    const runBytes = canonicalizeJsonV1(document);
    const telemetryBytes = canonicalizeJsonV1(createBenchmarkTelemetryExportV1(document));
    const context = createBenchmarkValidationContextV1();
    const receipt = createBenchmarkValidationReceiptV1({
      planId: 'plan-v1' as never,
      slotId: 'slot-measurement' as never,
      runId: 'measurement-run' as never,
      telemetryExportRawBytes: telemetryBytes,
      benchmarkRunRawBytes: runBytes,
      benchmarkRunCanonicalBytes: runBytes,
      schemaSetBytes: BENCHMARK_SCHEMA_SET_BYTES_V1,
      metricRegistry: BENCHMARK_METRIC_REGISTRY_V1,
      telemetryAdapter: createBenchmarkTelemetryAdapterV1(),
      validatorSourceCommitSha: 'a'.repeat(40) as never,
      validatorSourceFiles: [{ path: 'src/benchmark/contracts/validateV1.ts' as never, bytes: new TextEncoder().encode('validator') }],
      validationContext: context,
    });
    const ajv = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
    const validate = ajv.compile(JSON.parse(readFileSync('src/benchmark/contracts/schemas/benchmark-validation-receipt-v1.schema.json', 'utf8')));
    expect(validate(receipt), JSON.stringify(validate.errors)).toBe(true);
  });
  it('rejects a zero derived sample count in AJV and the hand receipt validator', () => {
    const document = createBenchmarkCaseDocumentV1({ phase: 'cold', container: 'cold', samples: true });
    const runBytes = canonicalizeJsonV1(document);
    const context = createBenchmarkValidationContextV1();
    const receipt = createBenchmarkValidationReceiptV1({
      planId: 'plan-v1' as never,
      slotId: 'slot-measurement' as never,
      runId: 'measurement-run' as never,
      telemetryExportRawBytes: canonicalizeJsonV1(createBenchmarkTelemetryExportV1(document)),
      benchmarkRunRawBytes: runBytes,
      benchmarkRunCanonicalBytes: runBytes,
      schemaSetBytes: BENCHMARK_SCHEMA_SET_BYTES_V1,
      metricRegistry: BENCHMARK_METRIC_REGISTRY_V1,
      telemetryAdapter: createBenchmarkTelemetryAdapterV1(),
      validatorSourceCommitSha: 'a'.repeat(40) as never,
      validatorSourceFiles: [{ path: 'src/benchmark/contracts/validateV1.ts' as never, bytes: new TextEncoder().encode('validator') }],
      validationContext: context,
    }) as any;
    receipt.telemetryDerivationEvidence.derivedSampleCount = 0;
    const withoutEvidenceDigest = { ...receipt.telemetryDerivationEvidence };
    delete withoutEvidenceDigest.evidenceSha256;
    receipt.telemetryDerivationEvidence.evidenceSha256 = sha256BytesV1(canonicalizeJsonV1(withoutEvidenceDigest));
    receipt.telemetryDerivationEvidenceSha256 = receipt.telemetryDerivationEvidence.evidenceSha256;
    delete receipt.receiptId;
    receipt.receiptId = sha256BytesV1(canonicalizeJsonV1(receipt));
    const validate = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false })
      .compile(JSON.parse(readFileSync('src/benchmark/contracts/schemas/benchmark-validation-receipt-v1.schema.json', 'utf8')));
    expect(validate(receipt)).toBe(false);
    expect(validateBenchmarkValidationReceiptV1(receipt)).toMatchObject({ valid: false });
  });
  it('compile with strict AJV2020 and allErrors without mutation', () => {
    const ajv = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
    for (const file of schemaFiles) {
      expect(() => ajv.compile(JSON.parse(readFileSync(`src/benchmark/contracts/schemas/${file}`, 'utf8')))).not.toThrow();
    }
  });
  it('accepts every explicit scenario definition', () => {
    const ajv = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
    const validate = ajv.compile(JSON.parse(readFileSync('src/benchmark/contracts/schemas/benchmark-scenario-definition-v1.schema.json', 'utf8')));
    for (const definition of benchmarkScenarioDefinitionsV1) expect(validate(definition), JSON.stringify(validate.errors)).toBe(true);
  });
  it('accepts case-preserving repository source paths in AJV and the hand validator', () => {
    const document = JSON.parse(JSON.stringify(createBenchmarkCaseDocumentV1({ samples: true }))) as Record<string, any>;
    document.source.fixture.sourcePaths.value = ['tests/contracts/wp04AoGolden.ts'];
    document.source.candidate.sourcePaths.value = ['tests/contracts/wp03GreedyGolden.ts'];
    const validate = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false })
      .compile(JSON.parse(readFileSync('src/benchmark/contracts/schemas/benchmark-run-v1.schema.json', 'utf8')));
    expect(validate(document), JSON.stringify(validate.errors)).toBe(true);
    expect(validateBenchmarkRunStructureV1(document)).toMatchObject({ valid: true });
  });
  it('keeps fixture source-commit binding required in AJV and the hand validator', () => {
    const document = JSON.parse(JSON.stringify(createBenchmarkCaseDocumentV1({ samples: true }))) as Record<string, any>;
    delete document.source.fixture.sourceCommitSha;
    const validate = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false })
      .compile(JSON.parse(readFileSync('src/benchmark/contracts/schemas/benchmark-run-v1.schema.json', 'utf8')));
    expect(validate(document)).toBe(false);
    expect(validateBenchmarkRunStructureV1(document)).toMatchObject({ valid: false, stage: 'schema' });
  });
  it('keeps typed Availability parity for environment fields', () => {
    const document = JSON.parse(JSON.stringify(createBenchmarkCaseDocumentV1({ samples: true }))) as Record<string, any>;
    document.environment.os.name.value = 123;
    const validate = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false }).compile(JSON.parse(readFileSync('src/benchmark/contracts/schemas/benchmark-run-v1.schema.json', 'utf8')));
    expect(validate(document)).toBe(false);
    expect(validateBenchmarkRunStructureV1(document)).toMatchObject({ valid: false, stage: 'schema' });
  });
  it.each([
    'os.name', 'os.version', 'os.architecture',
    'cpu.vendor', 'cpu.model',
    'gpu.vendor', 'gpu.device', 'gpu.driver', 'gpu.graphicsBackend',
    'browser.product', 'browser.version', 'browser.channel', 'browser.userAgent',
    'power.profile',
  ])('rejects the unknown sentinel for hardware string %s in both validators', (field) => {
    const document = JSON.parse(JSON.stringify(createBenchmarkCaseDocumentV1({ samples: true }))) as Record<string, any>;
    const parts = field.split('.');
    const target = parts.reduce((value, part) => value[part], document.environment) as Record<string, unknown>;
    target.value = 'unknown';
    const validate = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false }).compile(JSON.parse(readFileSync('src/benchmark/contracts/schemas/benchmark-run-v1.schema.json', 'utf8')));
    expect(validate(document)).toBe(false);
    expect(validateBenchmarkRunStructureV1(document)).toMatchObject({ valid: false, stage: 'schema' });
  });
  it('rejects the unknown power profile sentinel in both validators', () => {
    const document = JSON.parse(JSON.stringify(createBenchmarkCaseDocumentV1({ samples: true }))) as Record<string, any>;
    document.environment.power.profile.value = 'unknown';
    const validate = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false }).compile(JSON.parse(readFileSync('src/benchmark/contracts/schemas/benchmark-run-v1.schema.json', 'utf8')));
    expect(validate(document)).toBe(false);
    expect(validateBenchmarkRunStructureV1(document)).toMatchObject({ valid: false, stage: 'schema' });
  });
  it('preserves unavailable power profile as structural data while blocking eligibility', () => {
    const document = JSON.parse(JSON.stringify(createBenchmarkCaseDocumentV1({ samples: true }))) as Record<string, any>;
    const environments = [document.environment, document.browserProcesses[0].environment, ...document.browserProcesses[0].runs.map((run: any) => run.environment)];
    for (const environment of environments) environment.power.profile = { status: 'unknown', value: null, sourceRef: 'capture-v1', reasonCode: 'profile-not-observed' };
    const validate = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false }).compile(JSON.parse(readFileSync('src/benchmark/contracts/schemas/benchmark-run-v1.schema.json', 'utf8')));
    expect(validate(document)).toBe(true);
    expect(validateBenchmarkRunStructureV1(document)).toMatchObject({ valid: true });
  });
});

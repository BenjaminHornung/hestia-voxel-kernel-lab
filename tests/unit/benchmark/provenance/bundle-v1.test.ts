import Ajv2020 from 'ajv/dist/2020.js';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { canonicalizeJsonV1 } from '../../../../src/benchmark/provenance/canonicalJsonV1';
import { buildBundleFilesV1, bundleDigestFilesV1, formatBundleDigestV1, parseBundleDigestV1, verifyBundleDirectoryV1, writeBundleFilesV1 } from '../../../../src/benchmark/provenance/bundleV1';
import { digestFileBytesV1 } from '../../../../src/benchmark/provenance/fileSetDigestV1';
import { BENCHMARK_METRIC_REGISTRY_V1 } from '../../../../src/benchmark/contracts/scenarioRegistryV1';
import { BENCHMARK_SCHEMA_SET_BYTES_V1 } from '../../../../src/benchmark/contracts/schemaSetV1';
import { createBenchmarkValidationReceiptV1 } from '../../../../src/benchmark/contracts/validateV1';
import { createBenchmarkCaseDocumentV1, createBenchmarkTelemetryAdapterV1, createBenchmarkTelemetryExportV1, createBenchmarkValidationContextV1 } from '../contracts/benchmark-case-fixtures-v1';

const BINARY_ROLE_CONTROLS = [
  { role: 'trace', path: 'traces/trace.json.gz', mediaType: 'application/gzip' },
  { role: 'trace', path: 'traces/process-0042/trace.json.gz', mediaType: 'application/gzip' },
] as const;

function closedArtifacts(document: any): {
  readonly rawBytes: Uint8Array;
  readonly rawEntry: any;
  readonly artifacts: readonly any[];
  readonly bundleRuns: readonly any[];
  readonly closureFiles: readonly { readonly path: string; readonly bytes: Uint8Array }[];
} {
  const rawBytes = canonicalizeJsonV1(document);
  const rawEntry = {
    path: 'raw/multi-run.json', role: 'raw-run-json', mediaType: 'application/json', serialization: 'jcs-rfc8785',
    byteLength: rawBytes.byteLength, sha256: digestFileBytesV1(rawBytes),
    runIds: document.browserProcesses.flatMap((process: any) => process.runs.map((run: any) => run.runId)).sort(),
  };
  const adapter = createBenchmarkTelemetryAdapterV1();
  const context = createBenchmarkValidationContextV1();
  const closure = document.browserProcesses.flatMap((process: any) => process.runs.map((run: any) => {
    const telemetryBytes = canonicalizeJsonV1(createBenchmarkTelemetryExportV1(document, run.runId));
    const receipt = createBenchmarkValidationReceiptV1({
      planId: run.execution.runPlanId,
      slotId: run.ids.slotId,
      runId: run.runId,
      telemetryExportRawBytes: telemetryBytes,
      benchmarkRunRawBytes: rawBytes,
      benchmarkRunCanonicalBytes: rawBytes,
      schemaSetBytes: BENCHMARK_SCHEMA_SET_BYTES_V1,
      metricRegistry: BENCHMARK_METRIC_REGISTRY_V1,
      telemetryAdapter: adapter,
      validatorSourceCommitSha: 'a'.repeat(40) as never,
      validatorSourceFiles: [{ path: 'src/benchmark/contracts/validateV1.ts' as never, bytes: new TextEncoder().encode('validator') }],
      validationContext: context,
    });
    const receiptBytes = canonicalizeJsonV1(receipt);
    return {
      telemetry: { path: `telemetry/${run.runId}.json`, role: 'telemetry-export-json', mediaType: 'application/json', serialization: 'jcs-rfc8785', byteLength: telemetryBytes.byteLength, sha256: digestFileBytesV1(telemetryBytes), runIds: [run.runId] },
      receipt: { path: `receipts/${run.runId}.json`, role: 'validation-receipt-json', mediaType: 'application/json', serialization: 'jcs-rfc8785', byteLength: receiptBytes.byteLength, sha256: digestFileBytesV1(receiptBytes), runIds: [run.runId] },
      telemetryBytes,
      receiptBytes,
      run,
    };
  }));
  const artifacts = [rawEntry, ...closure.flatMap((entry: any) => [entry.receipt, entry.telemetry])].sort((left, right) => left.path.localeCompare(right.path));
  const bundleRuns = [...closure].map((entry: any) => ({
    runId: entry.run.runId,
    rawRun: { path: rawEntry.path, sha256: rawEntry.sha256 },
    telemetryExport: { path: entry.telemetry.path, sha256: entry.telemetry.sha256 },
    validationReceipt: { path: entry.receipt.path, sha256: entry.receipt.sha256 },
  })).sort((left, right) => left.runId.localeCompare(right.runId));
  const closureFiles = closure.flatMap((entry: any) => [
    { path: entry.telemetry.path, bytes: entry.telemetryBytes },
    { path: entry.receipt.path, bytes: entry.receiptBytes },
  ]);
  return { rawBytes, rawEntry, artifacts, bundleRuns, closureFiles };
}

function completeBundle(document = createBenchmarkCaseDocumentV1({ phase: 'cold', container: 'cold', samples: true }) as any): {
  readonly artifact: any;
  readonly bundle: any;
  readonly files: readonly any[];
} {
  const closed = closedArtifacts(document);
  const artifact = { schemaVersion: 'benchmark-artifact-manifest-v1', protocolVersion: 'benchmark-protocol-v1', artifacts: closed.artifacts };
  const artifactBytes = canonicalizeJsonV1(artifact);
  const bundle = {
    schemaVersion: 'benchmark-bundle-manifest-v1',
    protocolVersion: 'benchmark-protocol-v1',
    bundleId: 'bundle-complete',
    createdUtc: '2026-08-13T12:00:00.000Z',
    claimClass: 'correctness',
    canonicalJson: 'rfc8785-jcs',
    pathPolicy: 'hestia-relative-posix-lower-v1',
    digestAlgorithmVersion: 'hestia-benchmark-bundle-sha256-v1',
    artifactManifest: { path: 'artifact-manifest.json', byteLength: artifactBytes.byteLength, sha256: digestFileBytesV1(artifactBytes) },
    runs: closed.bundleRuns,
    excludedFromBundleDigest: ['bundle.sha256'],
  };
  return { artifact, bundle, files: buildBundleFilesV1(artifact as never, bundle as never, [{ path: closed.rawEntry.path, bytes: closed.rawBytes }, ...closed.closureFiles]) };
}

function materializeFiles(root: string, files: readonly { readonly path: string; readonly bytes: Uint8Array }[]): void {
  for (const file of files) {
    const target = join(root, ...file.path.split('/'));
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, file.bytes);
  }
}

function rebuildBundle(artifact: any, bundle: any, files: readonly { readonly path: string; readonly bytes: Uint8Array }[]): readonly any[] {
  const artifactBytes = canonicalizeJsonV1(artifact);
  const nextBundle = {
    ...bundle,
    artifactManifest: { path: 'artifact-manifest.json', byteLength: artifactBytes.byteLength, sha256: digestFileBytesV1(artifactBytes) },
  };
  const material = files.filter((file) => !['artifact-manifest.json', 'bundle-manifest.json', 'bundle.sha256'].includes(file.path));
  return buildBundleFilesV1(artifact as never, nextBundle as never, material);
}

function verifyBoundBinaryArtifact(control: (typeof BINARY_ROLE_CONTROLS)[number]): boolean {
  const document = createBenchmarkCaseDocumentV1({ phase: 'cold', container: 'cold', samples: true });
  const closed = closedArtifacts(document);
  const rawBytes = closed.rawBytes;
  const rawEntry = { ...closed.rawEntry, path: 'raw/measurement-run.json', runIds: ['measurement-run'] };
  const binaryBytes = new Uint8Array([1, 2, 3]);
  const binaryEntry = {
    path: control.path, role: control.role, mediaType: control.mediaType, serialization: 'binary-exact',
    byteLength: binaryBytes.byteLength, sha256: digestFileBytesV1(binaryBytes), runIds: ['measurement-run'],
  };
  const artifact = { schemaVersion: 'benchmark-artifact-manifest-v1', protocolVersion: 'benchmark-protocol-v1', artifacts: [...closed.artifacts.filter((entry) => entry.role !== 'raw-run-json'), rawEntry, binaryEntry].sort((left, right) => left.path.localeCompare(right.path)) };
  const artifactBytes = canonicalizeJsonV1(artifact);
  const bundle = {
    schemaVersion: 'benchmark-bundle-manifest-v1', protocolVersion: 'benchmark-protocol-v1', bundleId: 'bundle-binary-role',
    createdUtc: '2026-08-13T12:00:00.000Z', claimClass: 'correctness', canonicalJson: 'rfc8785-jcs',
    pathPolicy: 'hestia-relative-posix-lower-v1', digestAlgorithmVersion: 'hestia-benchmark-bundle-sha256-v1',
    artifactManifest: { path: 'artifact-manifest.json', byteLength: artifactBytes.byteLength, sha256: digestFileBytesV1(artifactBytes) },
    runs: [{ runId: 'measurement-run', rawRun: { path: rawEntry.path, sha256: rawEntry.sha256 }, telemetryExport: { path: 'telemetry/measurement-run.json', sha256: artifact.artifacts.find((entry: any) => entry.role === 'telemetry-export-json').sha256 }, validationReceipt: { path: 'receipts/measurement-run.json', sha256: artifact.artifacts.find((entry: any) => entry.role === 'validation-receipt-json').sha256 } }], excludedFromBundleDigest: ['bundle.sha256'],
  };
  const files = buildBundleFilesV1(artifact as never, bundle as never, [...closed.closureFiles, { path: control.path, bytes: binaryBytes }, { path: rawEntry.path, bytes: rawBytes }]);
  const root = mkdtempSync(join(tmpdir(), 'br01-binary-role-'));
  try {
    for (const file of files) {
      const target = join(root, ...file.path.split('/'));
      mkdirSync(join(target, '..'), { recursive: true });
      writeFileSync(target, file.bytes);
    }
    return verifyBundleDirectoryV1(root, createBenchmarkValidationContextV1()).valid;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('BR01 bundle framing', () => {
  it('round-trips the only digest-cover exception', () => {
    const digest = bundleDigestFilesV1([{ path: 'artifact-manifest.json', bytes: new TextEncoder().encode('{}') }]);
    expect(parseBundleDigestV1(formatBundleDigestV1(digest))).toBe(digest);
  });
  it.each(['con', 'con.json', 'raw/nul.bin', 'raw/com1.txt', 'raw/lpt9', 'raw/a.', 'raw/a '] as const)('rejects Windows extraction aliases before bundle construction: %s', (path) => {
    const fixture = completeBundle();
    expect(() => buildBundleFilesV1(fixture.artifact as never, fixture.bundle as never, [{ path, bytes: new Uint8Array([1]) }, { path: 'raw/a', bytes: new Uint8Array([2]) }])).toThrow();
  });
  it('rejects ancestor and descendant file paths before bundle construction', () => {
    const fixture = completeBundle();
    expect(() => buildBundleFilesV1(fixture.artifact as never, fixture.bundle as never, [
      { path: 'raw', bytes: new Uint8Array([1]) },
      { path: 'raw/a.json', bytes: new Uint8Array([2]) },
    ])).toThrow();
  });
  it('prevalidates every path before writing any bundle file', () => {
    const root = mkdtempSync(join(tmpdir(), 'br01-bundle-write-preflight-'));
    try {
      expect(() => writeBundleFilesV1(root, [{ path: 'raw/a', bytes: new Uint8Array([1]) }, { path: 'raw/a.', bytes: new Uint8Array([2]) }] as never)).toThrow();
      expect(readdirSync(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it.each(['raw/a.', 'raw/a '] as const)('rejects Windows-trailing aliases before writing any bundle file: %s', (path) => {
    const root = mkdtempSync(join(tmpdir(), 'br01-bundle-write-trailing-'));
    try {
      expect(() => writeBundleFilesV1(root, [{ path, bytes: new Uint8Array([1]) }] as never)).toThrow();
      expect(readdirSync(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('rejects ancestor and descendant paths before writing any bundle file', () => {
    const root = mkdtempSync(join(tmpdir(), 'br01-bundle-write-ancestor-'));
    try {
      expect(() => writeBundleFilesV1(root, [
        { path: 'raw', bytes: new Uint8Array([1]) },
        { path: 'raw/a.json', bytes: new Uint8Array([2]) },
      ] as never)).toThrow();
      expect(readdirSync(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('keeps artifact and bundle AJV path rejection aligned with extraction safety', () => {
    const ajv = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
    const artifactValidate = ajv.compile(JSON.parse(readFileSync('src/benchmark/contracts/schemas/benchmark-artifact-manifest-v1.schema.json', 'utf8')));
    const bundleValidate = ajv.compile(JSON.parse(readFileSync('src/benchmark/contracts/schemas/benchmark-bundle-manifest-v1.schema.json', 'utf8')));
    for (const path of ['con', 'con.json', 'raw/nul.bin', 'raw/com1.txt', 'raw/lpt9', 'raw/a.', 'raw/a ']) {
      expect(artifactValidate({
        schemaVersion: 'benchmark-artifact-manifest-v1', protocolVersion: 'benchmark-protocol-v1',
        artifacts: [{ path, role: 'summary-markdown', mediaType: 'text/markdown', serialization: 'utf8-lf-final-newline', byteLength: 1, sha256: 'sha256:' + 'a'.repeat(64), runIds: ['run'] }],
      }), path).toBe(false);
      expect(bundleValidate({
        schemaVersion: 'benchmark-bundle-manifest-v1', protocolVersion: 'benchmark-protocol-v1', bundleId: 'bundle', createdUtc: '2026-08-13T12:00:00.000Z', claimClass: 'correctness', canonicalJson: 'rfc8785-jcs', pathPolicy: 'hestia-relative-posix-lower-v1', digestAlgorithmVersion: 'hestia-benchmark-bundle-sha256-v1',
        artifactManifest: { path: 'artifact-manifest.json', byteLength: 1, sha256: 'sha256:' + 'a'.repeat(64) },
        runs: [{ runId: 'run', rawRun: { path, sha256: 'sha256:' + 'a'.repeat(64) }, telemetryExport: { path: 'telemetry/run.json', sha256: 'sha256:' + 'a'.repeat(64) }, validationReceipt: { path: 'receipts/run.json', sha256: 'sha256:' + 'a'.repeat(64) } }],
        excludedFromBundleDigest: ['bundle.sha256'],
      }), path).toBe(false);
    }
  });
  it('does not cover bundle.sha256', () => {
    const files = [{ path: 'artifact-manifest.json', bytes: new TextEncoder().encode('{}') }];
    expect(bundleDigestFilesV1(files)).toBe(bundleDigestFilesV1([...files, { path: 'bundle.sha256', bytes: new Uint8Array([1]) }]));
  });
  it('accepts a complete raw-run, telemetry, and receipt closure', () => {
    const fixture = completeBundle();
    const root = mkdtempSync(join(tmpdir(), 'br01-complete-bundle-'));
    try {
      materializeFiles(root, fixture.files);
      expect(verifyBundleDirectoryV1(root, createBenchmarkValidationContextV1())).toMatchObject({ valid: true });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it.each([
    ['missing telemetry', (fixture: ReturnType<typeof completeBundle>) => fixture.files.filter((file) => !file.path.startsWith('telemetry/'))],
    ['missing receipt', (fixture: ReturnType<typeof completeBundle>) => fixture.files.filter((file) => !file.path.startsWith('receipts/'))],
    ['foreign telemetry binding', (fixture: ReturnType<typeof completeBundle>) => { fixture.bundle.runs[0].telemetryExport.path = fixture.bundle.runs[0].validationReceipt.path; return rebuildBundle(fixture.artifact, fixture.bundle, fixture.files); }],
    ['foreign receipt binding', (fixture: ReturnType<typeof completeBundle>) => { fixture.bundle.runs[0].validationReceipt.path = fixture.bundle.runs[0].telemetryExport.path; return rebuildBundle(fixture.artifact, fixture.bundle, fixture.files); }],
  ] as const)('rejects %s closure', (_name, mutate) => {
    const fixture = completeBundle();
    const root = mkdtempSync(join(tmpdir(), 'br01-closure-negative-'));
    try {
      materializeFiles(root, mutate(fixture));
      expect(verifyBundleDirectoryV1(root, createBenchmarkValidationContextV1()).valid).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('rejects altered target samples after raw artifact rebinding', () => {
    const fixture = completeBundle();
    const raw = JSON.parse(new TextDecoder().decode(fixture.files.find((file) => file.path === 'raw/multi-run.json')!.bytes)) as any;
    raw.browserProcesses[0].runs[0].iterations[0].samples[0].result.value += 1;
    const rawBytes = canonicalizeJsonV1(raw);
    const artifact = JSON.parse(JSON.stringify(fixture.artifact)) as any;
    const rawEntry = artifact.artifacts.find((entry: any) => entry.role === 'raw-run-json');
    rawEntry.byteLength = rawBytes.byteLength;
    rawEntry.sha256 = digestFileBytesV1(rawBytes);
    fixture.bundle.runs[0].rawRun.sha256 = rawEntry.sha256;
    const files = rebuildBundle(artifact, fixture.bundle, [...fixture.files.filter((file) => file.path !== 'raw/multi-run.json'), { path: 'raw/multi-run.json', bytes: rawBytes }]);
    const root = mkdtempSync(join(tmpdir(), 'br01-sample-tamper-'));
    try {
      materializeFiles(root, files);
      expect(verifyBundleDirectoryV1(root, createBenchmarkValidationContextV1()).valid).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('rejects a zero-sample target after raw artifact rebinding', () => {
    const fixture = completeBundle();
    const raw = JSON.parse(new TextDecoder().decode(fixture.files.find((file) => file.path === 'raw/multi-run.json')!.bytes)) as any;
    raw.browserProcesses[0].runs[0].iterations[0].samples = [];
    const rawBytes = canonicalizeJsonV1(raw);
    const artifact = JSON.parse(JSON.stringify(fixture.artifact)) as any;
    const rawEntry = artifact.artifacts.find((entry: any) => entry.role === 'raw-run-json');
    rawEntry.byteLength = rawBytes.byteLength;
    rawEntry.sha256 = digestFileBytesV1(rawBytes);
    fixture.bundle.runs[0].rawRun.sha256 = rawEntry.sha256;
    const files = rebuildBundle(artifact, fixture.bundle, [...fixture.files.filter((file) => file.path !== 'raw/multi-run.json'), { path: 'raw/multi-run.json', bytes: rawBytes }]);
    const root = mkdtempSync(join(tmpdir(), 'br01-zero-sample-closure-'));
    try {
      materializeFiles(root, files);
      expect(verifyBundleDirectoryV1(root, createBenchmarkValidationContextV1()).valid).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('rejects reversed normative bundle run order', () => {
    const fixture = completeBundle(createBenchmarkCaseDocumentV1({ samples: true }) as any);
    fixture.bundle.runs.reverse();
    const files = rebuildBundle(fixture.artifact, fixture.bundle, fixture.files);
    const root = mkdtempSync(join(tmpdir(), 'br01-run-order-'));
    try {
      materializeFiles(root, files);
      expect(verifyBundleDirectoryV1(root, createBenchmarkValidationContextV1()).valid).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('rejects duplicate telemetry and receipt artifact entries at varied paths', () => {
    const fixture = completeBundle();
    const artifact = JSON.parse(JSON.stringify(fixture.artifact)) as any;
    const telemetry = artifact.artifacts.find((entry: any) => entry.role === 'telemetry-export-json');
    const receipt = artifact.artifacts.find((entry: any) => entry.role === 'validation-receipt-json');
    const duplicateTelemetry = { ...telemetry, path: 'telemetry/duplicate-measurement-run.json' };
    const duplicateReceipt = { ...receipt, path: 'receipts/duplicate-measurement-run.json' };
    artifact.artifacts.push(duplicateTelemetry, duplicateReceipt);
    const files = rebuildBundle(artifact, fixture.bundle, [
      ...fixture.files,
      { path: duplicateTelemetry.path, bytes: fixture.files.find((file) => file.path === telemetry.path)!.bytes },
      { path: duplicateReceipt.path, bytes: fixture.files.find((file) => file.path === receipt.path)!.bytes },
    ]);
    const root = mkdtempSync(join(tmpdir(), 'br01-duplicate-closure-'));
    try {
      materializeFiles(root, files);
      expect(verifyBundleDirectoryV1(root, createBenchmarkValidationContextV1()).valid).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('rejects an altered receipt/evidence after manifest rebinding', () => {
    const fixture = completeBundle();
    const receiptPath = 'receipts/measurement-run.json';
    const receipt = JSON.parse(new TextDecoder().decode(fixture.files.find((file) => file.path === receiptPath)!.bytes)) as any;
    receipt.telemetryDerivationEvidence.derivedSampleCount += 1;
    const receiptBytes = canonicalizeJsonV1(receipt);
    const artifact = JSON.parse(JSON.stringify(fixture.artifact)) as any;
    const entry = artifact.artifacts.find((candidate: any) => candidate.path === receiptPath);
    entry.byteLength = receiptBytes.byteLength;
    entry.sha256 = digestFileBytesV1(receiptBytes);
    const files = rebuildBundle(artifact, fixture.bundle, [...fixture.files.filter((file) => file.path !== receiptPath), { path: receiptPath, bytes: receiptBytes }]);
    const root = mkdtempSync(join(tmpdir(), 'br01-receipt-tamper-'));
    try {
      materializeFiles(root, files);
      expect(verifyBundleDirectoryV1(root, createBenchmarkValidationContextV1()).valid).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('rejects a correctly re-digested multi-run bundle with an omitted bundle run entry', () => {
    const document = createBenchmarkCaseDocumentV1({ samples: true }) as any;
    const closed = closedArtifacts(document);
    const artifact = { schemaVersion: 'benchmark-artifact-manifest-v1', protocolVersion: 'benchmark-protocol-v1', artifacts: closed.artifacts };
    const artifactBytes = canonicalizeJsonV1(artifact);
    const bundle = {
      schemaVersion: 'benchmark-bundle-manifest-v1',
      protocolVersion: 'benchmark-protocol-v1',
      bundleId: 'bundle-multi-run',
      createdUtc: '2026-08-13T12:00:00.000Z',
      claimClass: 'correctness',
      canonicalJson: 'rfc8785-jcs',
      pathPolicy: 'hestia-relative-posix-lower-v1',
      digestAlgorithmVersion: 'hestia-benchmark-bundle-sha256-v1',
      artifactManifest: { path: 'artifact-manifest.json', byteLength: artifactBytes.byteLength, sha256: digestFileBytesV1(artifactBytes) },
      runs: closed.bundleRuns,
      excludedFromBundleDigest: ['bundle.sha256'],
    };
    const omittedBundle = { ...bundle, runs: bundle.runs.slice(0, -1) };
    const files = buildBundleFilesV1(artifact as never, omittedBundle as never, [{ path: closed.rawEntry.path, bytes: closed.rawBytes }, ...closed.closureFiles]);
    const root = mkdtempSync(join(tmpdir(), 'br01-multi-run-bundle-'));
    try {
      for (const file of files) {
        const target = join(root, ...file.path.split('/'));
        mkdirSync(join(target, '..'), { recursive: true });
        writeFileSync(target, file.bytes);
      }
      expect(verifyBundleDirectoryV1(root, createBenchmarkValidationContextV1()).valid).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('rejects an overlong trace media type with AJV parity', () => {
    const role = 'trace' as const;
    const document = createBenchmarkCaseDocumentV1({ phase: 'cold', container: 'cold', samples: true }) as any;
    const closed = closedArtifacts(document);
    const runIds = ['measurement-run'];
    const rawEntry = { ...closed.rawEntry, runIds };
    const mediaPath = 'traces/process-0042/trace.json.gz';
    const mediaBytes = new Uint8Array([1, 2, 3]);
    const mediaEntry = {
      path: mediaPath, role, mediaType: 'x'.repeat(2049), serialization: 'binary-exact',
      byteLength: mediaBytes.byteLength, sha256: digestFileBytesV1(mediaBytes), runIds,
    };
    const artifact = { schemaVersion: 'benchmark-artifact-manifest-v1', protocolVersion: 'benchmark-protocol-v1', artifacts: [...closed.artifacts, mediaEntry].sort((left, right) => left.path.localeCompare(right.path)) };
    const artifactBytes = canonicalizeJsonV1(artifact);
    const bundle = {
      schemaVersion: 'benchmark-bundle-manifest-v1', protocolVersion: 'benchmark-protocol-v1', bundleId: 'bundle-media-type',
      createdUtc: '2026-08-13T12:00:00.000Z', claimClass: 'correctness', canonicalJson: 'rfc8785-jcs',
      pathPolicy: 'hestia-relative-posix-lower-v1', digestAlgorithmVersion: 'hestia-benchmark-bundle-sha256-v1',
      artifactManifest: { path: 'artifact-manifest.json', byteLength: artifactBytes.byteLength, sha256: digestFileBytesV1(artifactBytes) },
      runs: [{ ...closed.bundleRuns[0], rawRun: { path: rawEntry.path, sha256: rawEntry.sha256 } }], excludedFromBundleDigest: ['bundle.sha256'],
    };
    const files = buildBundleFilesV1(artifact as never, bundle as never, [...closed.closureFiles, { path: mediaPath, bytes: mediaBytes }, { path: rawEntry.path, bytes: closed.rawBytes }]);
    const root = mkdtempSync(join(tmpdir(), 'br01-media-type-'));
    try {
      for (const file of files) {
        const target = join(root, ...file.path.split('/'));
        mkdirSync(join(target, '..'), { recursive: true });
        writeFileSync(target, file.bytes);
      }
      const validateArtifact = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false })
        .compile(JSON.parse(readFileSync('src/benchmark/contracts/schemas/benchmark-artifact-manifest-v1.schema.json', 'utf8')));
      expect(validateArtifact(artifact)).toBe(false);
      const result = verifyBundleDirectoryV1(root, createBenchmarkValidationContextV1());
      expect(result).toMatchObject({ valid: false });
      expect(result.error).toContain('Artifact role/media type mismatch');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it.each(BINARY_ROLE_CONTROLS)('accepts the declared %s binary role control', (control) => {
    expect(verifyBoundBinaryArtifact(control)).toBe(true);
  });
});

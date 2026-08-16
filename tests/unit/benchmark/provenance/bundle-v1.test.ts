import Ajv2020 from 'ajv/dist/2020.js';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { canonicalizeJsonV1 } from '../../../../src/benchmark/provenance/canonicalJsonV1';
import { buildBundleFilesV1, bundleDigestFilesV1, formatBundleDigestV1, parseBundleDigestV1, verifyBundleDirectoryV1 } from '../../../../src/benchmark/provenance/bundleV1';
import { digestFileBytesV1 } from '../../../../src/benchmark/provenance/fileSetDigestV1';
import { createBenchmarkCaseDocumentV1, createBenchmarkValidationContextV1 } from '../contracts/benchmark-case-fixtures-v1';

const BINARY_ROLE_CONTROLS = [
  { role: 'trace', path: 'traces/process-0042/trace.json.gz', mediaType: 'application/gzip' },
] as const;

function verifyBoundBinaryArtifact(control: (typeof BINARY_ROLE_CONTROLS)[number]): boolean {
  const rawBytes = canonicalizeJsonV1(createBenchmarkCaseDocumentV1({ phase: 'cold', container: 'cold', samples: true }));
  const rawEntry = {
    path: 'raw/measurement-run.json', role: 'raw-run-json', mediaType: 'application/json', serialization: 'jcs-rfc8785',
    byteLength: rawBytes.byteLength, sha256: digestFileBytesV1(rawBytes), runIds: ['measurement-run'],
  };
  const binaryBytes = new Uint8Array([1, 2, 3]);
  const binaryEntry = {
    path: control.path, role: control.role, mediaType: control.mediaType, serialization: 'binary-exact',
    byteLength: binaryBytes.byteLength, sha256: digestFileBytesV1(binaryBytes), runIds: ['measurement-run'],
  };
  const artifact = { schemaVersion: 'benchmark-artifact-manifest-v1', protocolVersion: 'benchmark-protocol-v1', artifacts: [rawEntry, binaryEntry] };
  const artifactBytes = canonicalizeJsonV1(artifact);
  const bundle = {
    schemaVersion: 'benchmark-bundle-manifest-v1', protocolVersion: 'benchmark-protocol-v1', bundleId: 'bundle-binary-role',
    createdUtc: '2026-08-13T12:00:00.000Z', claimClass: 'correctness', canonicalJson: 'rfc8785-jcs',
    pathPolicy: 'hestia-relative-posix-lower-v1', digestAlgorithmVersion: 'hestia-benchmark-bundle-sha256-v1',
    artifactManifest: { path: 'artifact-manifest.json', byteLength: artifactBytes.byteLength, sha256: digestFileBytesV1(artifactBytes) },
    runs: [{ runId: 'measurement-run', path: rawEntry.path, sha256: rawEntry.sha256 }], excludedFromBundleDigest: ['bundle.sha256'],
  };
  const files = buildBundleFilesV1(artifact as never, bundle as never, [{ path: control.path, bytes: binaryBytes }, { path: rawEntry.path, bytes: rawBytes }]);
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
  it('does not cover bundle.sha256', () => {
    const files = [{ path: 'artifact-manifest.json', bytes: new TextEncoder().encode('{}') }];
    expect(bundleDigestFilesV1(files)).toBe(bundleDigestFilesV1([...files, { path: 'bundle.sha256', bytes: new Uint8Array([1]) }]));
  });
  it('rejects a correctly re-digested multi-run bundle with an omitted bundle run entry', () => {
    const document = createBenchmarkCaseDocumentV1({ samples: true }) as any;
    const rawBytes = canonicalizeJsonV1(document);
    const runIds = document.browserProcesses[0].runs.map((run: any) => run.runId).sort();
    const rawArtifact = {
      path: 'raw/multi-run.json',
      role: 'raw-run-json',
      mediaType: 'application/json',
      serialization: 'jcs-rfc8785',
      byteLength: rawBytes.byteLength,
      sha256: digestFileBytesV1(rawBytes),
      runIds,
    };
    const artifact = { schemaVersion: 'benchmark-artifact-manifest-v1', protocolVersion: 'benchmark-protocol-v1', artifacts: [rawArtifact] };
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
      runs: runIds.map((runId: string) => ({ runId, path: 'raw/multi-run.json', sha256: rawArtifact.sha256 })),
      excludedFromBundleDigest: ['bundle.sha256'],
    };
    const omittedBundle = { ...bundle, runs: bundle.runs.slice(0, -1) };
    const files = buildBundleFilesV1(artifact as never, omittedBundle as never, [{ path: rawArtifact.path, bytes: rawBytes }]);
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
    const rawBytes = canonicalizeJsonV1(document);
    const runIds = ['measurement-run'];
    const rawEntry = {
      path: 'raw/measurement-run.json', role: 'raw-run-json', mediaType: 'application/json', serialization: 'jcs-rfc8785',
      byteLength: rawBytes.byteLength, sha256: digestFileBytesV1(rawBytes), runIds,
    };
    const mediaPath = 'traces/process-0042/trace.json.gz';
    const mediaBytes = new Uint8Array([1, 2, 3]);
    const mediaEntry = {
      path: mediaPath, role, mediaType: 'x'.repeat(2049), serialization: 'binary-exact',
      byteLength: mediaBytes.byteLength, sha256: digestFileBytesV1(mediaBytes), runIds,
    };
    const artifact = { schemaVersion: 'benchmark-artifact-manifest-v1', protocolVersion: 'benchmark-protocol-v1', artifacts: [mediaEntry, rawEntry] };
    const artifactBytes = canonicalizeJsonV1(artifact);
    const bundle = {
      schemaVersion: 'benchmark-bundle-manifest-v1', protocolVersion: 'benchmark-protocol-v1', bundleId: 'bundle-media-type',
      createdUtc: '2026-08-13T12:00:00.000Z', claimClass: 'correctness', canonicalJson: 'rfc8785-jcs',
      pathPolicy: 'hestia-relative-posix-lower-v1', digestAlgorithmVersion: 'hestia-benchmark-bundle-sha256-v1',
      artifactManifest: { path: 'artifact-manifest.json', byteLength: artifactBytes.byteLength, sha256: digestFileBytesV1(artifactBytes) },
      runs: [{ runId: 'measurement-run', path: 'raw/measurement-run.json', sha256: rawEntry.sha256 }], excludedFromBundleDigest: ['bundle.sha256'],
    };
    const files = buildBundleFilesV1(artifact as never, bundle as never, [{ path: mediaPath, bytes: mediaBytes }, { path: rawEntry.path, bytes: rawBytes }]);
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

import { lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  BenchmarkArtifactEntryV1,
  BenchmarkArtifactManifestV1,
  BenchmarkBundleManifestV1,
  BenchmarkValidationContextV1,
  Sha256DigestV1,
} from '../contracts/typesV1';
import { canonicalizeJsonV1, parseCanonicalJsonV1 } from './canonicalJsonV1';
import { assertCanonicalRelativePathV1 } from './canonicalPathV1';
import { digestBundleV1, digestFileBytesV1 } from './fileSetDigestV1';
import { validUtc, validateBenchmarkRunV1 } from '../contracts/validateV1';

export interface BundleFileV1 {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface BundleVerificationResultV1 {
  readonly valid: boolean;
  readonly digest?: Sha256DigestV1;
  readonly error?: string;
}

function sameStringSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

const BINARY_ROLE_EXTENSIONS: Readonly<Record<'trace' | 'heap-snapshot' | 'gpu-capture', ReadonlySet<string>>> = {
  trace: new Set(['.json.gz']),
  'heap-snapshot': new Set(),
  'gpu-capture': new Set(),
};

const BINARY_ROLE_MEDIA_TYPES: Readonly<Record<'trace' | 'heap-snapshot' | 'gpu-capture', ReadonlySet<string>>> = {
  trace: new Set(['application/gzip']),
  'heap-snapshot': new Set(),
  'gpu-capture': new Set(),
};

const TRACE_ARTIFACT_PATH = /^traces\/(?:[a-z0-9][a-z0-9._-]*\/)+trace\.json\.gz$/;

export function bundleDigestFilesV1(files: readonly BundleFileV1[]): Sha256DigestV1 {
  const digestMarkerCount = files.filter((file) => file.path === 'bundle.sha256').length;
  if (digestMarkerCount > 1) throw new Error('Bundle contains more than one bundle.sha256 exception.');
  const digestFiles = files.filter((file) => file.path !== 'bundle.sha256');
  if (digestFiles.some((file) => file.path === 'bundle.sha256')) throw new Error('Invalid bundle digest cover.');
  const paths = new Set<string>();
  for (const file of digestFiles) {
    assertCanonicalRelativePathV1(file.path);
    if (paths.has(file.path)) throw new Error(`Bundle contains duplicate path ${file.path}.`);
    paths.add(file.path);
  }
  return digestBundleV1(digestFiles);
}

export function formatBundleDigestV1(digest: Sha256DigestV1): Uint8Array {
  return new TextEncoder().encode(`hestia-benchmark-bundle-sha256-v1 ${digest}\n`);
}

export function parseBundleDigestV1(bytes: Uint8Array): Sha256DigestV1 {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!/^hestia-benchmark-bundle-sha256-v1 sha256:[0-9a-f]{64}\n$/.test(text)) throw new Error('Invalid bundle.sha256 framing.');
  return text.slice('hestia-benchmark-bundle-sha256-v1 '.length, -1) as Sha256DigestV1;
}

function artifactPathRoleCompatible(entry: BenchmarkArtifactEntryV1): boolean {
  const extension = entry.path.endsWith('.json.gz') ? '.json.gz' : entry.path.slice(entry.path.lastIndexOf('.'));
  if (entry.role === 'raw-run-json' || entry.role === 'summary-json') return entry.serialization === 'jcs-rfc8785' && extension === '.json';
  if (entry.role === 'summary-markdown') return entry.serialization === 'utf8-lf-final-newline' && extension === '.md';
  if (entry.role === 'failure-log') return entry.serialization === 'utf8-lf-final-newline' && (extension === '.log' || extension === '.txt');
  if (entry.role === 'screenshot') return entry.serialization === 'binary-exact' && extension === '.png';
  if (entry.role === 'trace') return entry.serialization === 'binary-exact' && TRACE_ARTIFACT_PATH.test(entry.path) && BINARY_ROLE_EXTENSIONS.trace.has(extension);
  if (entry.role === 'heap-snapshot' || entry.role === 'gpu-capture') return entry.serialization === 'binary-exact' && BINARY_ROLE_EXTENSIONS[entry.role].has(extension);
  return false;
}

function mediaTypeRoleCompatible(entry: BenchmarkArtifactEntryV1): boolean {
  if (entry.mediaType.length === 0 || entry.mediaType.length > 2048) return false;
  if (entry.role === 'raw-run-json' || entry.role === 'summary-json') return entry.mediaType === 'application/json';
  if (entry.role === 'summary-markdown') return entry.mediaType === 'text/markdown';
  if (entry.role === 'failure-log') return entry.mediaType === 'text/plain';
  if (entry.role === 'screenshot') return entry.mediaType === 'image/png';
  if (entry.role === 'trace' || entry.role === 'heap-snapshot' || entry.role === 'gpu-capture') return BINARY_ROLE_MEDIA_TYPES[entry.role].has(entry.mediaType);
  return false;
}

function validateArtifactManifestShape(value: unknown): BenchmarkArtifactManifestV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Artifact manifest must be an object.');
  const artifact = value as BenchmarkArtifactManifestV1;
  if (Object.keys(artifact).some((key) => !['schemaVersion', 'protocolVersion', 'artifacts'].includes(key)) || artifact.schemaVersion !== 'benchmark-artifact-manifest-v1' || artifact.protocolVersion !== 'benchmark-protocol-v1' || !Array.isArray(artifact.artifacts)) throw new Error('Invalid artifact manifest.');
  return artifact;
}

function validateBundleManifestShape(value: unknown): BenchmarkBundleManifestV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Bundle manifest must be an object.');
  const bundle = value as BenchmarkBundleManifestV1;
  if (Object.keys(bundle).some((key) => !['schemaVersion', 'protocolVersion', 'bundleId', 'createdUtc', 'claimClass', 'canonicalJson', 'pathPolicy', 'digestAlgorithmVersion', 'artifactManifest', 'runs', 'excludedFromBundleDigest'].includes(key)) || bundle.schemaVersion !== 'benchmark-bundle-manifest-v1' || bundle.protocolVersion !== 'benchmark-protocol-v1') throw new Error('Invalid bundle manifest.');
  return bundle;
}

function validateManifest(value: unknown): { artifact: BenchmarkArtifactManifestV1; bundle: BenchmarkBundleManifestV1 } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Bundle manifest root must be an object.');
  const root = value as { readonly artifact: BenchmarkArtifactManifestV1; readonly bundle: BenchmarkBundleManifestV1 };
  if (Object.keys(root).length !== 2 || !Object.prototype.hasOwnProperty.call(root, 'artifact') || !Object.prototype.hasOwnProperty.call(root, 'bundle')) throw new Error('Bundle manifest root has unexpected properties.');
  const artifact = validateArtifactManifestShape(root.artifact);
  if (!Array.isArray(artifact.artifacts)) throw new Error('Artifact manifest entries must be an array.');
  const paths = new Set<string>();
  let previousPath = '';
  for (let index = 0; index < artifact.artifacts.length; index += 1) {
    const entry = artifact.artifacts[index]!;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).some((key) => !['path', 'role', 'mediaType', 'serialization', 'byteLength', 'sha256', 'runIds'].includes(key))) throw new Error(`Invalid artifact entry at index ${index}.`);
    if (typeof entry.role !== 'string' || typeof entry.serialization !== 'string' || typeof entry.mediaType !== 'string' || !entry.mediaType || !Array.isArray(entry.runIds) || entry.runIds.length === 0) throw new Error(`Invalid artifact entry at index ${index}.`);
    assertCanonicalRelativePathV1(entry.path);
    if (previousPath !== '' && previousPath >= entry.path) throw new Error('Artifact manifest paths are not strictly sorted.');
    previousPath = entry.path;
    if (paths.has(entry.path) || entry.path === 'artifact-manifest.json' || entry.path === 'bundle-manifest.json' || entry.path === 'bundle.sha256') throw new Error('Artifact manifest contains a reserved or duplicate path.');
    paths.add(entry.path);
    if (!artifactPathRoleCompatible(entry)) throw new Error(`Artifact role/serialization mismatch for ${entry.path}.`);
    if (!mediaTypeRoleCompatible(entry)) throw new Error(`Artifact role/media type mismatch for ${entry.path}.`);
    if (!Number.isSafeInteger(entry.byteLength) || entry.byteLength < 1 || !/^sha256:[0-9a-f]{64}$/.test(entry.sha256)) throw new Error(`Invalid artifact metadata for ${entry.path}.`);
    let previousRunId = '';
    for (const runId of entry.runIds) {
      if (typeof runId !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(runId)) throw new Error(`Invalid artifact run ID for ${entry.path}.`);
      if (previousRunId !== '' && previousRunId >= runId) throw new Error(`Artifact run IDs are not sorted for ${entry.path}.`);
      previousRunId = runId;
      if (entry.runIds.indexOf(runId) !== entry.runIds.lastIndexOf(runId)) throw new Error(`Artifact run IDs are duplicated for ${entry.path}.`);
    }
  }
  const bundle = validateBundleManifestShape(root.bundle);
  if (typeof bundle.bundleId !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(bundle.bundleId)) throw new Error('Invalid bundle ID.');
  validUtc(bundle.createdUtc, '$.createdUtc');
  if (bundle.canonicalJson !== 'rfc8785-jcs' || bundle.pathPolicy !== 'hestia-relative-posix-lower-v1' || bundle.digestAlgorithmVersion !== 'hestia-benchmark-bundle-sha256-v1') throw new Error('Invalid bundle contract literals.');
  if (!bundle.artifactManifest || typeof bundle.artifactManifest !== 'object' || Array.isArray(bundle.artifactManifest) || Object.keys(bundle.artifactManifest).some((key) => !['path', 'byteLength', 'sha256'].includes(key)) || bundle.artifactManifest.path !== 'artifact-manifest.json') throw new Error('Invalid artifact manifest binding.');
  if (!/^sha256:[0-9a-f]{64}$/.test(bundle.artifactManifest.sha256) || !Number.isSafeInteger(bundle.artifactManifest.byteLength) || bundle.artifactManifest.byteLength < 1) throw new Error('Invalid artifact manifest binding.');
  if (!['correctness', 'diagnostic', 'informational'].includes(bundle.claimClass)) throw new Error('Unsupported bundle claim class for BR01.');
  if (!Array.isArray(bundle.excludedFromBundleDigest) || bundle.excludedFromBundleDigest.length !== 1 || bundle.excludedFromBundleDigest[0] !== 'bundle.sha256') throw new Error('Invalid bundle digest exclusion.');
  if (!Array.isArray(bundle.runs) || bundle.runs.length === 0) throw new Error('Bundle must list at least one run.');
  const runIds = new Set<string>();
  for (const run of bundle.runs) {
    if (run === null || typeof run !== 'object' || Array.isArray(run) || Object.keys(run).some((key) => !['runId', 'path', 'sha256'].includes(key)) || typeof run.runId !== 'string' || typeof run.path !== 'string' || typeof run.sha256 !== 'string') throw new Error('Invalid bundle run entry.');
    if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(run.runId) || !/^sha256:[0-9a-f]{64}$/.test(run.sha256)) throw new Error('Invalid bundle run entry.');
    assertCanonicalRelativePathV1(run.path);
    if (runIds.has(run.runId)) throw new Error('Bundle run IDs are duplicated.');
    runIds.add(run.runId);
  }
  for (const entry of artifact.artifacts) {
    if (entry.runIds.some((runId: string) => !runIds.has(runId))) throw new Error(`Artifact references an unlisted run: ${entry.path}.`);
  }
  return { artifact, bundle };
}

function walkFiles(root: string, prefix = ''): BundleFileV1[] {
  const files: BundleFileV1[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = join(root, entry.name);
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) throw new Error(`Special file in bundle: ${path}`);
    if (entry.isDirectory()) files.push(...walkFiles(absolute, path));
    else files.push({ path, bytes: new Uint8Array(readFileSync(absolute)) });
  }
  return files;
}

export function verifyBundleDirectoryV1(rootPath: string, context: BenchmarkValidationContextV1): BundleVerificationResultV1 {
  try {
    const rootStat = lstatSync(rootPath);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('Bundle root must be a real directory.');
    const files = walkFiles(rootPath);
    const byPath = new Map(files.map((file) => [file.path, file]));
    const artifactBytes = byPath.get('artifact-manifest.json')?.bytes;
    const bundleBytes = byPath.get('bundle-manifest.json')?.bytes;
    const digestBytes = byPath.get('bundle.sha256')?.bytes;
    if (artifactBytes === undefined || bundleBytes === undefined || digestBytes === undefined) throw new Error('Bundle manifests or digest marker are missing.');
    const artifact = validateArtifactManifestShape(parseCanonicalJsonV1(artifactBytes));
    const bundle = validateBundleManifestShape(parseCanonicalJsonV1(bundleBytes));
    validateManifest({ artifact, bundle });
    if (bundle.excludedFromBundleDigest.length !== 1 || bundle.excludedFromBundleDigest[0] !== 'bundle.sha256') throw new Error('Invalid bundle digest exclusion.');
    if (bundle.artifactManifest.path !== 'artifact-manifest.json') throw new Error('Invalid artifact manifest path.');
    if (bundle.artifactManifest.byteLength !== artifactBytes.byteLength || bundle.artifactManifest.sha256 !== digestFileBytesV1(artifactBytes)) throw new Error('Artifact manifest binding mismatch.');
    const expected = new Set(['bundle-manifest.json', 'artifact-manifest.json', 'bundle.sha256', ...artifact.artifacts.map((entry) => entry.path)]);
    if (files.some((file) => !expected.has(file.path)) || [...expected].some((path) => !byPath.has(path))) throw new Error('Bundle contains missing or unmanifested files.');
    for (const entry of artifact.artifacts) {
      const file = byPath.get(entry.path)!;
      if (file.bytes.byteLength !== entry.byteLength || digestFileBytesV1(file.bytes) !== entry.sha256) throw new Error(`Artifact digest mismatch for ${entry.path}.`);
      if (entry.serialization === 'jcs-rfc8785') parseCanonicalJsonV1(file.bytes);
      if (entry.role === 'raw-run-json') {
        const parsed = parseCanonicalJsonV1(file.bytes) as {
          readonly browserProcesses?: readonly { readonly runs?: readonly { readonly runId?: string }[] }[];
        };
        const validation = validateBenchmarkRunV1(parsed, context);
        if (!validation.valid) throw new Error(`Raw run validation failed for ${entry.path}.`);
        const listed = bundle.runs.filter((run) => run.path === entry.path);
         const parsedRunIds = (parsed.browserProcesses ?? []).flatMap((process) => process.runs ?? []).map((run) => run.runId);
         const runIds = new Set<string>(parsedRunIds.filter((runId): runId is string => typeof runId === 'string'));
        const listedRunIds = new Set(listed.map((run) => run.runId));
        const artifactRunIds = new Set(entry.runIds);
        if (listed.length === 0 || !sameStringSet(runIds, listedRunIds) || !sameStringSet(runIds, artifactRunIds) || listed.some((run) => run.sha256 !== entry.sha256)) throw new Error(`Raw run is not bound by bundle manifest: ${entry.path}.`);
      }
       if (entry.serialization === 'utf8-lf-final-newline') { if (file.bytes.byteLength >= 3 && file.bytes[0] === 0xef && file.bytes[1] === 0xbb && file.bytes[2] === 0xbf) throw new Error(`Invalid text serialization for ${entry.path}.`); const text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes); if (text.startsWith('\ufeff') || text.includes('\r') || !text.endsWith('\n') || text.endsWith('\n\n')) throw new Error(`Invalid text serialization for ${entry.path}.`); }
    }
    for (const run of bundle.runs) {
      const rawRunArtifact = artifact.artifacts.find((entry) => entry.path === run.path && entry.role === 'raw-run-json');
      if (rawRunArtifact === undefined || !rawRunArtifact.runIds.includes(run.runId) || run.sha256 !== rawRunArtifact.sha256) throw new Error(`Bundle run path is not a raw-run artifact: ${run.path}.`);
    }
    const actual = bundleDigestFilesV1(files);
    const expectedDigest = parseBundleDigestV1(digestBytes);
    if (actual !== expectedDigest) throw new Error('Bundle digest mismatch.');
    return { valid: true, digest: actual };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Bundle verification failed.' };
  }
}

export function buildBundleFilesV1(
  artifactManifest: BenchmarkArtifactManifestV1,
  bundleManifest: BenchmarkBundleManifestV1,
  artifacts: readonly BundleFileV1[],
): BundleFileV1[] {
  const artifactManifestBytes = canonicalizeJsonV1(artifactManifest);
  const bundleManifestBytes = canonicalizeJsonV1(bundleManifest);
  const files: BundleFileV1[] = [
    { path: 'artifact-manifest.json', bytes: artifactManifestBytes },
    { path: 'bundle-manifest.json', bytes: bundleManifestBytes },
    ...artifacts,
  ];
  const digest = bundleDigestFilesV1(files);
  return [...files, { path: 'bundle.sha256', bytes: formatBundleDigestV1(digest) }];
}

export function writeBundleFilesV1(rootPath: string, files: readonly BundleFileV1[]): void {
  if (!lstatSync(rootPath).isDirectory()) throw new Error('Bundle root must be an existing directory.');
  const existing = walkFiles(rootPath);
  if (existing.length > 0) throw new Error('Bundle root must be empty before writing.');
  for (const file of files) {
    assertCanonicalRelativePathV1(file.path);
    const path = join(rootPath, ...file.path.split('/'));
    if (lstatSync(rootPath).isSymbolicLink()) throw new Error('Bundle root must not be a symlink.');
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, file.bytes, { flag: 'w' });
  }
}

export function validateRawRunFileV1(bytes: Uint8Array, context: BenchmarkValidationContextV1): boolean {
  try {
    const parsed = parseCanonicalJsonV1(bytes);
    const result = validateBenchmarkRunV1(parsed, context);
    return result.valid;
  } catch {
    return false;
  }
}

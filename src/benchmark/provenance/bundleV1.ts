import { lstatSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  BenchmarkArtifactEntryV1,
  BenchmarkArtifactManifestV1,
  BenchmarkArtifactRoleV1,
  BenchmarkBundleClaimClassV1,
  BenchmarkBundleManifestV1,
  BenchmarkRunDocumentV1,
  BenchmarkRunV1,
  BenchmarkValidationContextV1,
  BenchmarkValidationReceiptV1,
  BundleRelativePathV1,
  Sha256DigestV1,
} from '../contracts/typesV1';
import { BENCHMARK_ARTIFACT_ROLE_VALUES_V1, BENCHMARK_BUNDLE_CLAIM_CLASS_VALUES_V1 } from '../contracts/typesV1';
import {
  calculateBenchmarkDerivedRawSamplesCanonicalSha256V1,
  validateBenchmarkRunV1,
  validateBenchmarkValidationReceiptV1,
  validUtc,
} from '../contracts/validateV1';
import { BENCHMARK_METRIC_REGISTRY_V1 } from '../contracts/scenarioRegistryV1';
import { BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_ID_V1, BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_VERSION_V1 } from '../contracts/versions';
import { canonicalizeJsonV1, compareUtf16, parseCanonicalJsonV1 } from './canonicalJsonV1';
import { bundleRelativePathV1, compareBundleRelativePathsV1 } from './canonicalPathV1';
import {
  digestBundleV1,
  digestFileBytesV1,
  digestFilePathV1,
  digestFileSetPathsV1,
  enumerateFileSetDirectoryV1,
  readFileBytesV1,
  timingSafeEqualSha256V1,
} from './fileSetDigestV1';

export interface BundleFileV1<Path extends string = BundleRelativePathV1> {
  readonly path: Path;
  readonly bytes: Uint8Array;
}
export type BundleFileInputV1 = BundleFileV1<string>;

export const BUNDLE_ARTIFACT_ROLE_VALUES_V1 = BENCHMARK_ARTIFACT_ROLE_VALUES_V1;
export const BUNDLE_CLAIM_CLASS_VALUES_V1 = BENCHMARK_BUNDLE_CLAIM_CLASS_VALUES_V1;

export function isSupportedBundleArtifactRoleV1(value: unknown): value is BenchmarkArtifactRoleV1 {
  return typeof value === 'string' && BUNDLE_ARTIFACT_ROLE_VALUES_V1.includes(value as BenchmarkArtifactRoleV1);
}

export function isSupportedBundleClaimClassV1(value: unknown): value is BenchmarkBundleClaimClassV1 {
  return typeof value === 'string' && BUNDLE_CLAIM_CLASS_VALUES_V1.includes(value as BenchmarkBundleClaimClassV1);
}

export interface BundleVerificationResultV1 {
  readonly valid: boolean;
  readonly digest?: Sha256DigestV1;
  readonly error?: string;
}

interface BundleDirectoryFileV1 {
  readonly path: BundleRelativePathV1;
  readonly absolutePath: string;
  readonly byteLength: number;
}

interface ArtifactBindingV1 {
  readonly path: BundleRelativePathV1;
  readonly sha256: Sha256DigestV1;
}

interface ParsedRawRunArtifactV1 {
  readonly artifact: BenchmarkArtifactEntryV1;
  readonly document: BenchmarkRunDocumentV1;
  readonly bytes: Uint8Array;
}

interface ParsedJsonArtifactV1 {
  readonly artifact: BenchmarkArtifactEntryV1;
  readonly value: unknown;
  readonly bytes: Uint8Array;
}

function sameStringSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

const TRACE_ARTIFACT_PATH = /^traces\/(?:[a-z0-9][a-z0-9._-]*\/)*trace\.json\.gz$/;

export function bundleDigestFilesV1(files: readonly BundleFileInputV1[]): Sha256DigestV1 {
  const digestMarkerCount = files.filter((file) => file.path === 'bundle.sha256').length;
  if (digestMarkerCount > 1) throw new Error('Bundle contains more than one bundle.sha256 exception.');
  const digestFiles = files.filter((file) => file.path !== 'bundle.sha256');
  const paths = new Set<string>();
  for (const file of digestFiles) {
    bundleRelativePathV1(file.path);
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
  const isJson = entry.path.endsWith('.json');
  if (entry.role === 'raw-run-json' || entry.role === 'telemetry-export-json' || entry.role === 'validation-receipt-json' || entry.role === 'summary-json') {
    return entry.serialization === 'jcs-rfc8785' && isJson;
  }
  if (entry.role === 'summary-markdown') return entry.serialization === 'utf8-lf-final-newline' && entry.path.endsWith('.md');
  if (entry.role === 'failure-log') return entry.serialization === 'utf8-lf-final-newline' && (entry.path.endsWith('.log') || entry.path.endsWith('.txt'));
  if (entry.role === 'screenshot') return entry.serialization === 'binary-exact' && entry.path.endsWith('.png');
  if (entry.role === 'trace') return entry.serialization === 'binary-exact' && TRACE_ARTIFACT_PATH.test(entry.path);
  return false;
}

function mediaTypeRoleCompatible(entry: BenchmarkArtifactEntryV1): boolean {
  if (entry.mediaType.length === 0 || entry.mediaType.length > 2048) return false;
  if (entry.role === 'raw-run-json' || entry.role === 'telemetry-export-json' || entry.role === 'validation-receipt-json' || entry.role === 'summary-json') return entry.mediaType === 'application/json';
  if (entry.role === 'summary-markdown') return entry.mediaType === 'text/markdown';
  if (entry.role === 'failure-log') return entry.mediaType === 'text/plain';
  if (entry.role === 'screenshot') return entry.mediaType === 'image/png';
  if (entry.role === 'trace') return entry.mediaType === 'application/gzip';
  return false;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateArtifactManifestShape(value: unknown): BenchmarkArtifactManifestV1 {
  if (!isObject(value) || Object.keys(value).some((key) => !['schemaVersion', 'protocolVersion', 'artifacts'].includes(key))
    || value.schemaVersion !== 'benchmark-artifact-manifest-v1' || value.protocolVersion !== 'benchmark-protocol-v1' || !Array.isArray(value.artifacts)) {
    throw new Error('Invalid artifact manifest.');
  }
  return value as unknown as BenchmarkArtifactManifestV1;
}

function validateBundleManifestShape(value: unknown): BenchmarkBundleManifestV1 {
  if (!isObject(value) || Object.keys(value).some((key) => !['schemaVersion', 'protocolVersion', 'bundleId', 'createdUtc', 'claimClass', 'canonicalJson', 'pathPolicy', 'digestAlgorithmVersion', 'artifactManifest', 'runs', 'excludedFromBundleDigest'].includes(key))
    || value.schemaVersion !== 'benchmark-bundle-manifest-v1' || value.protocolVersion !== 'benchmark-protocol-v1') {
    throw new Error('Invalid bundle manifest.');
  }
  return value as unknown as BenchmarkBundleManifestV1;
}

function validateDigest(value: unknown, label: string): Sha256DigestV1 {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) throw new Error(`Invalid ${label}.`);
  return value as Sha256DigestV1;
}

function validateBinding(value: unknown, label: string): ArtifactBindingV1 {
  if (!isObject(value) || Object.keys(value).some((key) => !['path', 'sha256'].includes(key)) || typeof value.path !== 'string') throw new Error(`Invalid ${label}.`);
  return { path: bundleRelativePathV1(value.path), sha256: validateDigest(value.sha256, `${label} digest`) };
}

function validateManifest(value: unknown): { artifact: BenchmarkArtifactManifestV1; bundle: BenchmarkBundleManifestV1 } {
  if (!isObject(value) || Object.keys(value).length !== 2 || !isObject(value.artifact) || !isObject(value.bundle)) throw new Error('Bundle manifest root has unexpected properties.');
  const artifact = validateArtifactManifestShape(value.artifact);
  const paths = new Set<string>();
  let previousPath = '';
  for (let index = 0; index < artifact.artifacts.length; index += 1) {
    const entry = artifact.artifacts[index];
    if (!isObject(entry) || Object.keys(entry).some((key) => !['path', 'role', 'mediaType', 'serialization', 'byteLength', 'sha256', 'runIds'].includes(key))
      || typeof entry.path !== 'string' || typeof entry.role !== 'string' || typeof entry.serialization !== 'string' || typeof entry.mediaType !== 'string'
      || !Array.isArray(entry.runIds)) throw new Error(`Invalid artifact entry at index ${index}.`);
    const path = bundleRelativePathV1(entry.path);
    if (previousPath !== '' && compareBundleRelativePathsV1(previousPath, path) >= 0) throw new Error('Artifact manifest paths are not strictly sorted.');
    previousPath = path;
    if (paths.has(path) || ['artifact-manifest.json', 'bundle-manifest.json', 'bundle.sha256'].includes(path)) throw new Error('Artifact manifest contains a reserved or duplicate path.');
    paths.add(path);
    if (!isSupportedBundleArtifactRoleV1(entry.role) || !artifactPathRoleCompatible(entry as unknown as BenchmarkArtifactEntryV1)) throw new Error(`Artifact role/serialization mismatch for ${path}.`);
    if (!mediaTypeRoleCompatible(entry as unknown as BenchmarkArtifactEntryV1)) throw new Error(`Artifact role/media type mismatch for ${path}.`);
    if (!Number.isSafeInteger(entry.byteLength) || (entry.byteLength as number) < 1) throw new Error(`Invalid artifact byte length for ${path}.`);
    validateDigest(entry.sha256, `artifact digest for ${path}`);
    let previousRunId = '';
    if (entry.runIds.length === 0) throw new Error(`Artifact run IDs are empty for ${path}.`);
    for (const runId of entry.runIds) {
      if (typeof runId !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(runId) || (previousRunId !== '' && compareUtf16(previousRunId, runId) >= 0)) throw new Error(`Artifact run IDs are not sorted for ${path}.`);
      previousRunId = runId;
    }
    if (new Set(entry.runIds).size !== entry.runIds.length) throw new Error(`Artifact run IDs are duplicated for ${path}.`);
  }

  const bundle = validateBundleManifestShape(value.bundle);
  if (typeof bundle.bundleId !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(bundle.bundleId)) throw new Error('Invalid bundle ID.');
  validUtc(bundle.createdUtc, '$.createdUtc');
  if (bundle.canonicalJson !== 'rfc8785-jcs' || bundle.pathPolicy !== 'hestia-relative-posix-lower-v1' || bundle.digestAlgorithmVersion !== 'hestia-benchmark-bundle-sha256-v1') throw new Error('Invalid bundle contract literals.');
  if (!isObject(bundle.artifactManifest) || Object.keys(bundle.artifactManifest).some((key) => !['path', 'byteLength', 'sha256'].includes(key)) || bundle.artifactManifest.path !== 'artifact-manifest.json') throw new Error('Invalid artifact manifest binding.');
  if (!Number.isSafeInteger(bundle.artifactManifest.byteLength) || bundle.artifactManifest.byteLength < 1) throw new Error('Invalid artifact manifest byte length.');
  validateDigest(bundle.artifactManifest.sha256, 'artifact manifest digest');
  if (!isSupportedBundleClaimClassV1(bundle.claimClass)) throw new Error('Unsupported bundle claim class for BR01.');
  if (bundle.excludedFromBundleDigest.length !== 1 || bundle.excludedFromBundleDigest[0] !== 'bundle.sha256') throw new Error('Invalid bundle digest exclusion.');
  if (bundle.runs.length === 0) throw new Error('Bundle must list at least one run.');
  const runIds = new Set<string>();
  let previousRunId = '';
  const bindingPaths = new Set<string>();
  for (const run of bundle.runs) {
    if (!isObject(run) || Object.keys(run).some((key) => !['runId', 'rawRun', 'telemetryExport', 'validationReceipt'].includes(key)) || typeof run.runId !== 'string') throw new Error('Invalid bundle run entry.');
    if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(run.runId) || runIds.has(run.runId) || (previousRunId !== '' && compareUtf16(previousRunId, run.runId) >= 0)) throw new Error('Bundle runs must be unique and sorted by runId.');
    previousRunId = run.runId;
    runIds.add(run.runId);
    const rawRun = validateBinding(run.rawRun, `raw-run binding for ${run.runId}`);
    const telemetryExport = validateBinding(run.telemetryExport, `telemetry binding for ${run.runId}`);
    const validationReceipt = validateBinding(run.validationReceipt, `receipt binding for ${run.runId}`);
    if (rawRun.path === telemetryExport.path || rawRun.path === validationReceipt.path || telemetryExport.path === validationReceipt.path) throw new Error(`Bundle bindings are not distinct for ${run.runId}.`);
    if (bindingPaths.has(`${run.runId}\0${rawRun.path}`) || bindingPaths.has(`${run.runId}\0${telemetryExport.path}`) || bindingPaths.has(`${run.runId}\0${validationReceipt.path}`)) throw new Error(`Duplicate bundle binding for ${run.runId}.`);
    bindingPaths.add(`${run.runId}\0${rawRun.path}`); bindingPaths.add(`${run.runId}\0${telemetryExport.path}`); bindingPaths.add(`${run.runId}\0${validationReceipt.path}`);
  }
  for (const entry of artifact.artifacts) if (entry.runIds.some((runId) => !runIds.has(runId))) throw new Error(`Artifact references an unlisted run: ${entry.path}.`);
  for (const runId of runIds) {
    const rawRuns = artifact.artifacts.filter((entry) => entry.role === 'raw-run-json' && entry.runIds.some((entryRunId) => entryRunId === runId));
    const telemetry = artifact.artifacts.filter((entry) => entry.role === 'telemetry-export-json' && entry.runIds.some((entryRunId) => entryRunId === runId));
    const receipts = artifact.artifacts.filter((entry) => entry.role === 'validation-receipt-json' && entry.runIds.some((entryRunId) => entryRunId === runId));
    if (rawRuns.length !== 1 || telemetry.length !== 1 || receipts.length !== 1) throw new Error(`Each run requires exactly one raw run, telemetry export, and validation receipt: ${runId}.`);
  }
  return { artifact, bundle };
}

function walkFiles(root: string): BundleDirectoryFileV1[] {
  return enumerateFileSetDirectoryV1(root, 'bundle').map((file) => ({
    path: bundleRelativePathV1(file.path),
    absolutePath: file.absolutePath,
    byteLength: file.byteLength,
  }));
}

function rawRuns(document: BenchmarkRunDocumentV1): readonly BenchmarkRunV1[] {
  return document.browserProcesses.flatMap((process) => process.runs);
}

function findArtifact(artifacts: readonly BenchmarkArtifactEntryV1[], path: BundleRelativePathV1, role: BenchmarkArtifactRoleV1): BenchmarkArtifactEntryV1 {
  const matches = artifacts.filter((entry) => entry.path === path && entry.role === role);
  if (matches.length !== 1) throw new Error(`Expected exactly one ${role} artifact at ${path}.`);
  return matches[0]!;
}

function requireBindingDigest(actual: unknown, expected: unknown, label: string): void {
  validateDigest(actual, `${label} actual digest`);
  validateDigest(expected, `${label} expected digest`);
  if (!timingSafeEqualSha256V1(actual, expected)) throw new Error(`${label} digest mismatch.`);
}

function validateRunReceiptBindings(
  runEntry: BenchmarkBundleManifestV1['runs'][number],
  targetRun: BenchmarkRunV1,
  rawBytes: Uint8Array,
  telemetryBytes: Uint8Array,
  receipt: BenchmarkValidationReceiptV1,
  context: BenchmarkValidationContextV1,
): void {
  const rawDigest = digestFileBytesV1(rawBytes);
  const telemetryDigest = digestFileBytesV1(telemetryBytes);
  requireBindingDigest(runEntry.rawRun.sha256, rawDigest, 'raw-run binding');
  requireBindingDigest(runEntry.telemetryExport.sha256, telemetryDigest, 'telemetry binding');
  requireBindingDigest(receipt.benchmarkRunRawByteSha256, rawDigest, 'receipt raw-run');
  requireBindingDigest(receipt.benchmarkRunCanonicalSha256, digestFileBytesV1(canonicalizeJsonV1(parseCanonicalJsonV1(rawBytes))), 'receipt canonical run');
  requireBindingDigest(receipt.telemetryExportRawByteSha256, telemetryDigest, 'receipt telemetry');
  requireBindingDigest(receipt.runBindingSha256, targetRun.runBindingSha256, 'receipt run binding');
  requireBindingDigest(receipt.planDigest, targetRun.execution.runPlanSha256, 'receipt plan');
  requireBindingDigest(receipt.schemaSetSha256, context.schemaSetSha256, 'receipt schema-set');
  requireBindingDigest(receipt.metricRegistrySha256, context.metricRegistrySha256, 'receipt metric registry');
  requireBindingDigest(receipt.telemetryDerivationEvidenceSha256, receipt.telemetryDerivationEvidence.evidenceSha256, 'receipt derivation evidence');
  requireBindingDigest(receipt.telemetryDerivationEvidence.targetRunBindingSha256, targetRun.runBindingSha256, 'derivation target run');
  requireBindingDigest(receipt.telemetryDerivationEvidence.telemetryExportRawByteSha256, telemetryDigest, 'derivation telemetry');
  requireBindingDigest(receipt.telemetryDerivationEvidence.derivedRawSamplesCanonicalSha256, calculateBenchmarkDerivedRawSamplesCanonicalSha256V1(targetRun.iterations.flatMap((iteration) => iteration.samples)), 'derivation sample projection');
  requireBindingDigest(receipt.telemetryDerivationEvidence.metricRegistrySha256, BENCHMARK_METRIC_REGISTRY_V1.metricRegistrySha256, 'derivation metric registry');
  if (receipt.runId !== targetRun.runId || receipt.planId !== context.runPlan.id || receipt.slotId !== targetRun.ids.slotId || receipt.telemetryDerivationEvidence.targetRunId !== targetRun.runId) throw new Error('Receipt target run binding mismatch.');
  if (receipt.telemetryDerivationEvidence.adapterContractId !== BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_ID_V1 || receipt.telemetryDerivationEvidence.adapterContractVersion !== BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_VERSION_V1) throw new Error('Receipt adapter contract binding mismatch.');
  const targetSampleCount = targetRun.iterations.reduce((count, iteration) => count + iteration.samples.length, 0);
  if (targetSampleCount < 1 || receipt.telemetryDerivationEvidence.derivedSampleCount < 1) throw new Error('Receipt derived sample count must be positive.');
  if (receipt.telemetryDerivationEvidence.derivedSampleCount !== targetSampleCount) throw new Error('Receipt derived sample count mismatch.');
}

export function verifyBundleDirectoryV1(rootPath: string, context: BenchmarkValidationContextV1): BundleVerificationResultV1 {
  try {
    const rootStat = lstatSync(rootPath);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('Bundle root must be a real directory.');
    const files = walkFiles(rootPath);
    const byPath = new Map<string, BundleDirectoryFileV1>();
    for (const file of files) {
      if (byPath.has(file.path)) throw new Error(`Bundle contains duplicate path ${file.path}.`);
      byPath.set(file.path, file);
    }
    const artifactFile = byPath.get('artifact-manifest.json');
    const bundleFile = byPath.get('bundle-manifest.json');
    const digestFile = byPath.get('bundle.sha256');
    if (artifactFile === undefined || bundleFile === undefined || digestFile === undefined) throw new Error('Bundle manifests or digest marker are missing.');
    const artifactBytes = readFileBytesV1(artifactFile.absolutePath);
    const bundleBytes = readFileBytesV1(bundleFile.absolutePath);
    const digestBytes = readFileBytesV1(digestFile.absolutePath);
    const { artifact, bundle } = validateManifest({ artifact: parseCanonicalJsonV1(artifactBytes), bundle: parseCanonicalJsonV1(bundleBytes) });
    if (bundle.artifactManifest.byteLength !== artifactBytes.byteLength) throw new Error('Artifact manifest binding mismatch.');
    requireBindingDigest(bundle.artifactManifest.sha256, digestFileBytesV1(artifactBytes), 'artifact manifest');
    const expected = new Set(['bundle-manifest.json', 'artifact-manifest.json', 'bundle.sha256', ...artifact.artifacts.map((entry) => entry.path)]);
    if (files.some((file) => !expected.has(file.path)) || [...expected].some((path) => !byPath.has(path))) throw new Error('Bundle contains missing or unmanifested files.');

    const rawDocuments = new Map<string, ParsedRawRunArtifactV1>();
    const telemetryArtifacts = new Map<string, ParsedJsonArtifactV1>();
    const receiptArtifacts = new Map<string, ParsedJsonArtifactV1>();
    for (const entry of artifact.artifacts) {
      const file = byPath.get(entry.path)!;
      const bytes = entry.serialization === 'binary-exact' ? undefined : readFileBytesV1(file.absolutePath);
      const actualFile = bytes === undefined ? digestFilePathV1(file.absolutePath) : { digest: digestFileBytesV1(bytes), byteLength: bytes.byteLength };
      if (actualFile.byteLength !== entry.byteLength) throw new Error(`Artifact byte length mismatch for ${entry.path}.`);
      requireBindingDigest(actualFile.digest, entry.sha256, `artifact ${entry.path}`);
      if (entry.serialization === 'jcs-rfc8785') {
        const parsed = parseCanonicalJsonV1(bytes!);
        if (entry.role === 'raw-run-json') {
          const validation = validateBenchmarkRunV1(parsed, context);
          if (!validation.valid) throw new Error(`Raw run validation failed for ${entry.path}.`);
          const runs = rawRuns(validation.value);
          const parsedIds = new Set(runs.map((run) => run.runId));
          const entryIds = new Set(entry.runIds);
          if (runs.length !== parsedIds.size || !sameStringSet(parsedIds, entryIds)) throw new Error(`Raw run logical-run bindings mismatch for ${entry.path}.`);
          rawDocuments.set(entry.path, { artifact: entry, document: validation.value, bytes: bytes! });
        } else if (entry.role === 'telemetry-export-json') {
          if (entry.runIds.length !== 1 || !isObject(parsed)) throw new Error(`Telemetry export must bind one JSON object run: ${entry.path}.`);
          telemetryArtifacts.set(entry.path, { artifact: entry, value: parsed, bytes: bytes! });
        } else if (entry.role === 'validation-receipt-json') {
          if (entry.runIds.length !== 1) throw new Error(`Validation receipt must bind exactly one run: ${entry.path}.`);
          const receiptValidation = validateBenchmarkValidationReceiptV1(parsed);
          if (!receiptValidation.valid) throw new Error(`Validation receipt validation failed for ${entry.path}.`);
          receiptArtifacts.set(entry.path, { artifact: entry, value: receiptValidation.value, bytes: bytes! });
        }
      }
      if (entry.serialization === 'utf8-lf-final-newline') {
        if (bytes!.byteLength >= 3 && bytes![0] === 0xef && bytes![1] === 0xbb && bytes![2] === 0xbf) throw new Error(`Invalid text serialization for ${entry.path}.`);
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes!);
        if (text.startsWith('\ufeff') || text.includes('\r') || !text.endsWith('\n') || text.endsWith('\n\n')) throw new Error(`Invalid text serialization for ${entry.path}.`);
      }
    }

    for (const runEntry of bundle.runs) {
      const rawArtifact = findArtifact(artifact.artifacts, runEntry.rawRun.path, 'raw-run-json');
      if (!rawArtifact.runIds.includes(runEntry.runId) || !timingSafeEqualSha256V1(rawArtifact.sha256, runEntry.rawRun.sha256)) throw new Error(`Raw run binding mismatch for ${runEntry.runId}.`);
      const raw = rawDocuments.get(runEntry.rawRun.path);
      if (raw === undefined) throw new Error(`Raw run artifact was not parsed for ${runEntry.runId}.`);
      const targetRuns = rawRuns(raw.document).filter((run) => run.runId === runEntry.runId);
      if (targetRuns.length !== 1) throw new Error(`Logical run is not present exactly once: ${runEntry.runId}.`);
      const telemetryArtifact = findArtifact(artifact.artifacts, runEntry.telemetryExport.path, 'telemetry-export-json');
      const receiptArtifact = findArtifact(artifact.artifacts, runEntry.validationReceipt.path, 'validation-receipt-json');
      if (telemetryArtifact.runIds.length !== 1 || telemetryArtifact.runIds[0] !== runEntry.runId || !timingSafeEqualSha256V1(telemetryArtifact.sha256, runEntry.telemetryExport.sha256)) throw new Error(`Telemetry binding mismatch for ${runEntry.runId}.`);
      if (receiptArtifact.runIds.length !== 1 || receiptArtifact.runIds[0] !== runEntry.runId || !timingSafeEqualSha256V1(receiptArtifact.sha256, runEntry.validationReceipt.sha256)) throw new Error(`Validation receipt binding mismatch for ${runEntry.runId}.`);
      const telemetry = telemetryArtifacts.get(runEntry.telemetryExport.path);
      const receipt = receiptArtifacts.get(runEntry.validationReceipt.path);
      if (telemetry === undefined || receipt === undefined) throw new Error(`Run closure artifacts are not parsed for ${runEntry.runId}.`);
      validateRunReceiptBindings(runEntry, targetRuns[0]!, raw.bytes, telemetry.bytes, receipt.value as BenchmarkValidationReceiptV1, context);
    }
    const actual = digestFileSetPathsV1(files.filter((file) => file.path !== 'bundle.sha256'), 'bundle').digest;
    requireBindingDigest(actual, parseBundleDigestV1(digestBytes), 'bundle');
    return { valid: true, digest: actual };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Bundle verification failed.' };
  }
}

export function buildBundleFilesV1(
  artifactManifest: BenchmarkArtifactManifestV1,
  bundleManifest: BenchmarkBundleManifestV1,
  artifacts: readonly BundleFileInputV1[],
): BundleFileV1[] {
  const artifactManifestBytes = canonicalizeJsonV1(artifactManifest);
  const bundleManifestBytes = canonicalizeJsonV1(bundleManifest);
  const files: BundleFileV1[] = [
    { path: bundleRelativePathV1('artifact-manifest.json'), bytes: artifactManifestBytes },
    { path: bundleRelativePathV1('bundle-manifest.json'), bytes: bundleManifestBytes },
    ...artifacts.map((file) => ({ path: bundleRelativePathV1(file.path), bytes: file.bytes })),
  ];
  const digest = bundleDigestFilesV1(files);
  return [...files, { path: bundleRelativePathV1('bundle.sha256'), bytes: formatBundleDigestV1(digest) }];
}

export function writeBundleFilesV1(rootPath: string, files: readonly BundleFileV1[]): void {
  if (!lstatSync(rootPath).isDirectory()) throw new Error('Bundle root must be an existing directory.');
  if (readdirSync(rootPath).length > 0) throw new Error('Bundle root must be empty before writing.');
  for (const file of files) {
    bundleRelativePathV1(file.path);
    const path = join(rootPath, ...file.path.split('/'));
    if (lstatSync(rootPath).isSymbolicLink()) throw new Error('Bundle root must not be a symlink.');
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, file.bytes, { flag: 'w' });
  }
}

export function validateRawRunFileV1(bytes: Uint8Array, context: BenchmarkValidationContextV1): boolean {
  try {
    const parsed = parseCanonicalJsonV1(bytes);
    return validateBenchmarkRunV1(parsed, context).valid;
  } catch {
    return false;
  }
}

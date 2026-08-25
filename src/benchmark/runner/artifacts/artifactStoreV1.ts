import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, linkSync, openSync } from 'node:fs';
import { mkdir, open, readdir, realpath, rm, stat, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  BENCHMARK_PROTOCOL_VERSION,
  BENCHMARK_METRIC_REGISTRY_V1,
  BENCHMARK_SCHEMA_SET_SHA256_V1,
  type BenchmarkArtifactEntryV1,
  type BenchmarkArtifactManifestV1,
  type BenchmarkBundleClaimClassV1,
  type BenchmarkBundleManifestV1,
  type BenchmarkEnvironmentManifestV1,
  type BenchmarkScenarioIdV1,
  type BenchmarkRunV1,
  type BenchmarkRunDocumentV1,
  type BenchmarkValidationContextV1,
  type BenchmarkValidationReceiptV1,
  type AvailabilityV1,
  type CanonicalIdV1,
  type NonEmptyString,
  type SafePositiveIntegerV1,
} from '../../contracts';
import { validateBenchmarkRunV1 } from '../../contracts/validateV1';
import {
  BR02_BROWSER_HANDOFF_CONTRACT_ID,
  BR02_BROWSER_HANDOFF_SCHEMA_VERSION,
  BR02_BROWSER_RUNTIME_ACTIVATION,
  type BrowserTelemetryHandoffEnvelopeV1,
} from '../../../diagnostics/telemetry/browserHandoffV1';
import { validateDownloadedTelemetryV1 } from '../browser/br02HandoffDriverV1';
import {
  buildBundleFilesV1,
  bundleRelativePathV1,
  canonicalizeJsonV1,
  compareBundleRelativePathsV1,
  compareUtf16,
  parseCanonicalJsonV1,
  readFileBytesV1,
  sha256BytesV1,
  verifyBundleDirectoryV1,
  type BundleFileV1,
} from '../../provenance';
import type {
  BuiltRunPlanV1,
  FailureDiagnosticV1,
  InvocationClosureFileV1,
  InvocationClosureV1,
  LifecycleOwnershipReceiptV1,
  ProcessUnitResultV1,
  RunInvocationV1,
} from '../contractsV1';
import { deriveHardwareCellIdV1, hashCanonicalV1, idFromDigestV1 } from '../ids/orchestrationIdsV1';

export interface BundleRunClosureV1 {
  readonly runId: CanonicalIdV1;
  readonly telemetryExportRawBytes: Uint8Array;
  readonly receipt: BenchmarkValidationReceiptV1;
  readonly receiptCanonicalBytes: Uint8Array;
}

export interface BuildBundleOptionsV1 {
  readonly bundleId: CanonicalIdV1;
  readonly createdUtc: BenchmarkBundleManifestV1['createdUtc'];
  readonly claimClass: BenchmarkBundleClaimClassV1;
  readonly document: BenchmarkRunDocumentV1;
  readonly closures: readonly BundleRunClosureV1[];
}

export interface BuiltBundleV1 {
  readonly artifactManifest: BenchmarkArtifactManifestV1;
  readonly bundleManifest: BenchmarkBundleManifestV1;
  readonly files: readonly BundleFileV1[];
}

export class ArtifactCleanupErrorV1 extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ArtifactCleanupErrorV1';
  }
}

const ARTIFACT_CLEANUP_TIMEOUT_MS = 5_000;
const MAX_CONTROL_FILE_BYTES = 16 * 1024 * 1024;

async function boundedArtifactCleanupV1<T>(operation: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  void operation.catch(() => undefined);
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not finish within the cleanup bound.`)), ARTIFACT_CLEANUP_TIMEOUT_MS);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function readControlFileBoundedV1(path: string): Promise<Uint8Array> {
  let bytes: Uint8Array;
  try {
    bytes = readFileBytesV1(path, { maxFileBytes: MAX_CONTROL_FILE_BYTES, maxAggregateBytes: MAX_CONTROL_FILE_BYTES });
  } catch (error) {
    throw new TypeError('Invocation control file is missing or outside its size bound.', { cause: error });
  }
  if (bytes.byteLength < 1) throw new TypeError('Invocation control file is missing or outside its size bound.');
  return bytes;
}

async function assertMissingV1(path: string, label: string): Promise<void> {
  try {
    await stat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`${label} already exists.`);
}

const PERSISTED_OUTPUT_ROOT = '<RESULTS>';

function persistedInvocationV1(invocation: RunInvocationV1): RunInvocationV1 {
  return { ...invocation, outputRoot: PERSISTED_OUTPUT_ROOT };
}

function artifactEntry(
  path: string,
  role: BenchmarkArtifactEntryV1['role'],
  bytes: Uint8Array,
  runIds: readonly CanonicalIdV1[],
): BenchmarkArtifactEntryV1 {
  if (bytes.byteLength < 1 || runIds.length < 1) throw new TypeError('Bundle artifacts require bytes and run bindings.');
  const [firstRunId, ...remainingRunIds] = [...runIds].sort(compareUtf16);
  if (firstRunId === undefined || new Set(runIds).size !== runIds.length) throw new TypeError('Bundle artifact run IDs must be unique.');
  return {
    path: bundleRelativePathV1(path),
    role,
    mediaType: 'application/json' as NonEmptyString,
    serialization: 'jcs-rfc8785',
    byteLength: bytes.byteLength as SafePositiveIntegerV1,
    sha256: sha256BytesV1(bytes),
    runIds: [firstRunId, ...remainingRunIds],
  };
}

function allRuns(document: BenchmarkRunDocumentV1) {
  return document.browserProcesses.flatMap(({ runs }) => runs);
}

export function deriveBundleIdV1(invocationId: CanonicalIdV1, hardwareCellId: CanonicalIdV1): CanonicalIdV1 {
  return idFromDigestV1('br03-bundle-', hashCanonicalV1('br03/bundle/v1', { hardwareCellId, invocationId }));
}

export function buildBenchmarkBundleV1(options: BuildBundleOptionsV1): BuiltBundleV1 {
  const runs = allRuns(options.document).sort((left, right) => compareUtf16(left.runId, right.runId));
  const expectedRunIds = runs.map(({ runId }) => runId);
  const closures = [...options.closures].sort((left, right) => compareUtf16(left.runId, right.runId));
  if (expectedRunIds.length === 0 || closures.length !== expectedRunIds.length
    || expectedRunIds.some((runId, index) => closures[index]?.runId !== runId)) {
    throw new TypeError('Bundle requires exactly one telemetry/receipt closure for every logical run.');
  }
  const rawRunBytes = canonicalizeJsonV1(options.document);
  const rawPath = 'raw/hardware-cell.json';
  const artifacts = [{ path: rawPath, bytes: rawRunBytes }];
  const entries: BenchmarkArtifactEntryV1[] = [artifactEntry(rawPath, 'raw-run-json', rawRunBytes, expectedRunIds)];
  const bundleRuns: BenchmarkBundleManifestV1['runs'][number][] = [];
  for (const closure of closures) {
    if (closure.receipt.runId !== closure.runId || !sameBytes(closure.receiptCanonicalBytes, canonicalizeJsonV1(closure.receipt))) {
      throw new TypeError('Bundle receipt does not match its logical run or canonical bytes.');
    }
    parseCanonicalJsonV1(closure.telemetryExportRawBytes);
    const telemetryPath = `telemetry/${closure.runId}.json`;
    const receiptPath = `receipts/${closure.runId}.json`;
    artifacts.push({ path: telemetryPath, bytes: closure.telemetryExportRawBytes }, { path: receiptPath, bytes: closure.receiptCanonicalBytes });
    const telemetryEntry = artifactEntry(telemetryPath, 'telemetry-export-json', closure.telemetryExportRawBytes, [closure.runId]);
    const receiptEntry = artifactEntry(receiptPath, 'validation-receipt-json', closure.receiptCanonicalBytes, [closure.runId]);
    entries.push(telemetryEntry, receiptEntry);
    bundleRuns.push({
      runId: closure.runId,
      rawRun: { path: bundleRelativePathV1(rawPath), sha256: sha256BytesV1(rawRunBytes) },
      telemetryExport: { path: telemetryEntry.path, sha256: telemetryEntry.sha256 },
      validationReceipt: { path: receiptEntry.path, sha256: receiptEntry.sha256 },
    });
  }
  entries.sort((left, right) => compareBundleRelativePathsV1(left.path, right.path));
  const artifactManifest: BenchmarkArtifactManifestV1 = {
    schemaVersion: 'benchmark-artifact-manifest-v1',
    protocolVersion: BENCHMARK_PROTOCOL_VERSION,
    artifacts: entries,
  };
  const artifactManifestBytes = canonicalizeJsonV1(artifactManifest);
  const [firstBundleRun, ...remainingBundleRuns] = bundleRuns;
  if (firstBundleRun === undefined) throw new TypeError('Bundle requires a logical run.');
  const bundleManifest: BenchmarkBundleManifestV1 = {
    schemaVersion: 'benchmark-bundle-manifest-v1',
    protocolVersion: BENCHMARK_PROTOCOL_VERSION,
    bundleId: options.bundleId,
    createdUtc: options.createdUtc,
    claimClass: options.claimClass,
    canonicalJson: 'rfc8785-jcs',
    pathPolicy: 'hestia-relative-posix-lower-v1',
    digestAlgorithmVersion: 'hestia-benchmark-bundle-sha256-v1',
    artifactManifest: {
      path: 'artifact-manifest.json',
      byteLength: artifactManifestBytes.byteLength as SafePositiveIntegerV1,
      sha256: sha256BytesV1(artifactManifestBytes),
    },
    runs: [firstBundleRun, ...remainingBundleRuns],
    excludedFromBundleDigest: ['bundle.sha256'],
  };
  return { artifactManifest, bundleManifest, files: buildBundleFilesV1(artifactManifest, bundleManifest, artifacts) };
}

function assertChild(root: string, child: string): void {
  const fromRoot = relative(root, child);
  if (fromRoot.length === 0 || isAbsolute(fromRoot) || fromRoot.startsWith('..') || resolve(root, fromRoot) !== resolve(child)) {
    throw new Error('Artifact path escapes its invocation root.');
  }
}

function assertWithin(root: string, child: string, label: string): void {
  const normalizedRoot = resolve(root);
  const normalizedChild = resolve(child);
  const fromRoot = relative(normalizedRoot, normalizedChild);
  if (normalizedChild !== normalizedRoot && (fromRoot.startsWith('..') || isAbsolute(fromRoot) || !normalizedChild.startsWith(`${normalizedRoot}${sep}`))) {
    throw new Error(`${label} is restricted to the runner-owned .benchmark-results/.`);
  }
}

async function realpathWithMissingSuffixV1(path: string): Promise<string> {
  let current = resolve(path);
  const suffix: string[] = [];
  while (true) {
    try {
      const existing = await realpath(current);
      return resolve(existing, ...suffix.reverse());
    } catch (error) {
      const parent = dirname(current);
      if (parent === current) throw error;
      suffix.push(basename(current));
      current = parent;
    }
  }
}

function assertArtifactOutputRoot(projectRoot: string, outputRoot: string): void {
  const ownedRoot = resolve(projectRoot, '.benchmark-results');
  if (resolve(outputRoot) !== ownedRoot) throw new Error('Runner artifact output is restricted to the exact runner-owned .benchmark-results/. root.');
}

function sameFilesystemPathV1(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function syncParentDirectoryV1(path: string): void {
  if (process.platform === 'win32') return;
  const descriptor = openSync(dirname(path), 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

async function writeExclusive(
  path: string,
  bytes: Uint8Array,
  ownedRoot?: string,
  beforePublish?: () => void,
  afterPublish?: () => void,
  afterLink?: () => void,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  if (ownedRoot !== undefined) {
    assertWithin(ownedRoot, path, 'Runner artifact path');
    const [realRoot, realParent] = await Promise.all([realpath(ownedRoot), realpath(dirname(path))]);
    if (!sameFilesystemPathV1(realRoot, resolve(ownedRoot)) || !sameFilesystemPathV1(realParent, resolve(dirname(path)))) {
      throw new Error('Runner artifact path contains a symbolic-link or junction parent substitution.');
    }
  }
  const pendingPath = join(dirname(path), `.${basename(path)}.${randomUUID()}.pending`);
  const file = await open(pendingPath, 'wx');
  let writeError: unknown;
  try {
    await file.writeFile(bytes);
    await file.sync();
  } catch (error) {
    writeError = error;
    throw error;
  } finally {
    try {
      await boundedArtifactCleanupV1(Promise.resolve().then(() => file.close()), 'Artifact file close');
    } catch (closeError) {
      throw new ArtifactCleanupErrorV1('Artifact file close failed.', { cause: writeError === undefined ? closeError : new AggregateError([writeError, closeError], 'Artifact write and close failed.') });
    }
  }
  try {
    beforePublish?.();
    // Hard-link creation is the atomic no-replace publication point on NTFS and POSIX filesystems.
    linkSync(pendingPath, path);
    afterLink?.();
    syncParentDirectoryV1(path);
    afterPublish?.();
  } catch (error) {
    await boundedArtifactCleanupV1(unlink(pendingPath).catch((cleanupError) => {
      throw new ArtifactCleanupErrorV1('Artifact staging cleanup failed.', { cause: new AggregateError([error, cleanupError], 'Artifact publication and staging cleanup failed.') });
    }), 'Artifact staging cleanup');
    throw error;
  }
  try {
    await boundedArtifactCleanupV1(unlink(pendingPath), 'Published artifact staging cleanup');
  } catch (error) {
    throw new ArtifactCleanupErrorV1('Published artifact staging cleanup failed.', { cause: error });
  }
}

export async function createInvocationArtifactRootV1(
  outputRoot: string,
  projectRoot: string,
  plan: BuiltRunPlanV1,
  invocation: RunInvocationV1,
): Promise<string> {
  if (invocation.runPlanId !== plan.runPlanId || invocation.outputRoot !== outputRoot) throw new TypeError('Invocation artifact root does not match the accepted plan or output root.');
  if (outputRoot.split(/[\\/]/u).includes('..')) throw new TypeError('Runner artifact output must not contain parent traversal.');
  const realProjectRoot = await realpath(projectRoot);
  const ownedRoot = resolve(realProjectRoot, '.benchmark-results');
  await mkdir(ownedRoot, { recursive: true });
  const realOwnedRoot = await realpath(ownedRoot);
  const requestedOutputRoot = await realpathWithMissingSuffixV1(isAbsolute(outputRoot) ? outputRoot : resolve(realProjectRoot, outputRoot));
  assertArtifactOutputRoot(realProjectRoot, requestedOutputRoot);
  await mkdir(requestedOutputRoot, { recursive: true });
  const realOutputRoot = await realpath(requestedOutputRoot);
  assertWithin(realOwnedRoot, realOutputRoot, 'Runner artifact output');
  const invocationRoot = join(realOutputRoot, invocation.invocationId);
  assertChild(realOutputRoot, invocationRoot);
  await mkdir(invocationRoot, { recursive: false });
  syncParentDirectoryV1(invocationRoot);
  if (!(await stat(invocationRoot)).isDirectory()) throw new Error('Invocation artifact root is not a directory.');
  await writeExclusive(join(invocationRoot, 'run-plan.json'), plan.canonicalBytes, invocationRoot);
  await writeExclusive(join(invocationRoot, 'invocation.json'), canonicalizeJsonV1(persistedInvocationV1(invocation)), invocationRoot);
  await mkdir(join(invocationRoot, 'bundles'));
  await mkdir(join(invocationRoot, 'bundle-contexts'));
  await mkdir(join(invocationRoot, 'lifecycle-smoke'));
  await mkdir(join(invocationRoot, 'failure-diagnostics'));
  syncParentDirectoryV1(join(invocationRoot, 'owned-child'));
  return invocationRoot;
}

export async function writeLifecycleSmokeArtifactsV1(
  invocationRoot: string,
  slotId: CanonicalIdV1,
  run: BenchmarkRunV1,
  environment: BenchmarkEnvironmentManifestV1,
  telemetryExportRawBytes: Uint8Array,
  ownership: LifecycleOwnershipReceiptV1,
): Promise<string> {
  const root = await realpath(invocationRoot);
  const smokeRoot = join(root, 'lifecycle-smoke', slotId);
  assertChild(root, smokeRoot);
  await mkdir(smokeRoot, { recursive: false });
  syncParentDirectoryV1(smokeRoot);
  const files = [
    { path: 'environment.json', bytes: canonicalizeJsonV1(environment) },
    { path: 'ownership.json', bytes: canonicalizeJsonV1(ownership) },
    { path: 'run.json', bytes: canonicalizeJsonV1(run) },
    { path: 'telemetry-export.json', bytes: telemetryExportRawBytes },
  ];
  for (const file of files) await writeExclusive(join(smokeRoot, file.path), file.bytes, smokeRoot);
  await writeExclusive(join(smokeRoot, 'manifest.json'), canonicalizeJsonV1({
      schemaVersion: 'br03-lifecycle-smoke-artifact-v1',
      slotId,
      runId: run.runId,
      files: files.map(({ path, bytes }) => ({ path, byteLength: bytes.byteLength, sha256: sha256BytesV1(bytes) })),
    }), smokeRoot);
  return smokeRoot;
}

export async function verifyLifecycleSmokeArtifactsV1(
  invocationRoot: string,
  results: readonly ProcessUnitResultV1[],
  expected?: { readonly plan: BuiltRunPlanV1; readonly invocation: RunInvocationV1 },
): Promise<readonly string[]> {
  const issues: string[] = [];
  const expectedArtifacts = results.filter(({ disposition, failureCode, runIds }) => disposition === 'unsupported'
    && (failureCode === 'required-metric-producers-unavailable' || failureCode === 'backend-parity-producers-unavailable')
    && runIds.length === 1);
  const smokeRoot = join(invocationRoot, 'lifecycle-smoke');
  const entries = await readdir(smokeRoot, { withFileTypes: true });
  if (entries.length !== expectedArtifacts.length || entries.some((entry) => !entry.isDirectory() || entry.isSymbolicLink())) {
    return [`Lifecycle-smoke artifact directories do not match terminal results (expected ${expectedArtifacts.length}, observed ${entries.length}: ${entries.map(({ name }) => name).join(',') || 'none'}).`];
  }
  for (const result of expectedArtifacts) {
    const directory = join(smokeRoot, result.slotId);
    try {
      const names = await readdir(directory, { withFileTypes: true });
      const expectedNames = ['environment.json', 'manifest.json', 'ownership.json', 'run.json', 'telemetry-export.json'];
      if (names.length !== expectedNames.length || names.some((entry) => entry.isSymbolicLink() || !entry.isFile() || !expectedNames.includes(entry.name))) {
        throw new Error('Lifecycle-smoke artifact closure is invalid.');
      }
      const manifest = closedLifecycleManifestV1(parseCanonicalJsonV1(await readControlFileBoundedV1(join(directory, 'manifest.json'))));
      const manifestPaths = manifest.files.map(({ path }) => path);
      if (manifest.slotId !== result.slotId || manifest.runId !== result.runIds[0]
        || new Set(manifestPaths).size !== 4
        || !['environment.json', 'ownership.json', 'run.json', 'telemetry-export.json'].every((path) => manifestPaths.includes(path as typeof manifestPaths[number]))) {
        throw new Error('Lifecycle-smoke manifest binding is invalid.');
      }
      const bytesByPath = new Map<string, Uint8Array>();
      for (const file of manifest.files) {
        const bytes = await readControlFileBoundedV1(join(directory, file.path));
        if (bytes.byteLength !== file.byteLength || sha256BytesV1(bytes) !== file.sha256) throw new Error('Lifecycle-smoke artifact digest mismatch.');
        bytesByPath.set(file.path, bytes);
      }
      const environment = parseCanonicalJsonV1(bytesByPath.get('environment.json')!) as BenchmarkEnvironmentManifestV1;
      const ownership = parseCanonicalJsonV1(bytesByPath.get('ownership.json')!) as LifecycleOwnershipReceiptV1;
      const run = parseCanonicalJsonV1(bytesByPath.get('run.json')!) as BenchmarkRunDocumentV1['browserProcesses'][number]['runs'][number];
      const expectedCdpMethods = ['Browser.getVersion', 'SystemInfo.getInfo', 'Browser.getBrowserCommandLine'];
      const invalidCdp = !Array.isArray(ownership.cdp?.probes) || ownership.cdp.probes.length !== expectedCdpMethods.length
        || new Set(ownership.cdp.probes.map(({ method }) => method)).size !== expectedCdpMethods.length
        || ownership.cdp.probes.some(({ method, status, responseSha256 }) => !expectedCdpMethods.includes(method)
          || !['observed', 'unknown', 'unsupported', 'error', 'blocked', 'permission-denied'].includes(status)
          || (status === 'observed') !== (typeof responseSha256 === 'string' && /^sha256:[0-9a-f]{64}$/.test(responseSha256)));
      if (run.runId !== manifest.runId || !sameBytes(canonicalizeJsonV1(environment), canonicalizeJsonV1(run.environment))
        || ownership.schemaVersion !== 'br03-lifecycle-ownership-v1' || ownership.slotId !== result.slotId || ownership.cleanupState !== 'complete'
        || ownership.preview.host !== '127.0.0.1' || !Number.isSafeInteger(ownership.preview.port) || ownership.preview.port < 1
        || ownership.preview.expectedHealthSha256 !== ownership.preview.observedHealthSha256
        || (ownership.browser.exitCode === null && ownership.browser.signal === null)
        || ownership.browser.executableName.length === 0 || invalidCdp
        || environment.browser.executableSha256.status !== 'observed' || environment.browser.executableSha256.value !== ownership.browser.executableSha256) throw new Error('Lifecycle-smoke environment/run/ownership binding mismatch.');
      if (expected !== undefined) {
        const invocationUnit = expected.invocation.processUnits.find(({ slotId }) => slotId === result.slotId);
        const expectedUnit = expected.plan.core.processUnits.find(({ ids }) => ids.slotId === result.slotId);
        const expectedRun = invocationUnit?.runs.find(({ runId }) => runId === manifest.runId);
        if (expectedUnit === undefined || expectedRun === undefined) throw new Error('Lifecycle-smoke run is not present in its accepted invocation.');
        verifyLifecycleRunV1(run, expected.plan, expectedUnit, expectedRun, expected.invocation.createdUtc, bytesByPath.get('telemetry-export.json')!);
      } else {
        const telemetry = parseCanonicalJsonV1(bytesByPath.get('telemetry-export.json')!) as { readonly runId?: string };
        if (telemetry.runId !== manifest.runId) throw new Error('Lifecycle-smoke telemetry/run binding mismatch.');
      }
    } catch (error) {
      issues.push(`Lifecycle-smoke artifact closure is invalid for ${result.slotId}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
  return issues;
}

function closedLifecycleManifestV1(value: unknown): {
  readonly schemaVersion: 'br03-lifecycle-smoke-artifact-v1';
  readonly slotId: CanonicalIdV1;
  readonly runId: CanonicalIdV1;
  readonly files: readonly { readonly path: 'environment.json' | 'ownership.json' | 'run.json' | 'telemetry-export.json'; readonly byteLength: number; readonly sha256: string }[];
} {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Lifecycle-smoke manifest must be an object.');
  const object = value as Record<string, unknown>;
  const keys = ['schemaVersion', 'slotId', 'runId', 'files'];
  if (Object.keys(object).length !== keys.length || Object.keys(object).some((key) => !keys.includes(key))) throw new TypeError('Lifecycle-smoke manifest has unexpected fields.');
  if (object.schemaVersion !== 'br03-lifecycle-smoke-artifact-v1' || typeof object.slotId !== 'string' || typeof object.runId !== 'string' || !Array.isArray(object.files) || object.files.length !== 4) throw new TypeError('Lifecycle-smoke manifest header is invalid.');
  const files = object.files.map((value) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Lifecycle-smoke manifest file is invalid.');
    const file = value as Record<string, unknown>;
    const fileKeys = ['path', 'byteLength', 'sha256'];
    if (Object.keys(file).length !== fileKeys.length || Object.keys(file).some((key) => !fileKeys.includes(key))) throw new TypeError('Lifecycle-smoke manifest file has unexpected fields.');
    if (!['environment.json', 'ownership.json', 'run.json', 'telemetry-export.json'].includes(file.path as string) || !Number.isSafeInteger(file.byteLength) || (file.byteLength as number) < 1 || typeof file.sha256 !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(file.sha256)) throw new TypeError('Lifecycle-smoke manifest file values are invalid.');
    return { path: file.path as 'environment.json' | 'ownership.json' | 'run.json' | 'telemetry-export.json', byteLength: file.byteLength as number, sha256: file.sha256 };
  });
  return { schemaVersion: object.schemaVersion, slotId: object.slotId as CanonicalIdV1, runId: object.runId as CanonicalIdV1, files };
}

export async function writeProcessUnitResultsV1(
  invocationRoot: string,
  results: readonly ProcessUnitResultV1[],
  beforePublish?: () => void,
): Promise<void> {
  await writeExclusive(join(invocationRoot, 'process-unit-results.json'), canonicalizeJsonV1(results), invocationRoot, beforePublish);
}

function diagnosticErrorTypeV1(error: unknown): FailureDiagnosticV1['nativeErrorType'] {
  if (error instanceof AggregateError) return 'aggregate-error';
  if (error instanceof TypeError) return 'type-error';
  if (error instanceof RangeError) return 'range-error';
  if (error instanceof Error && typeof (error as NodeJS.ErrnoException).code === 'string') return 'system-error';
  if (error instanceof Error) return 'error';
  return 'unknown';
}

function diagnosticCauseChainV1(error: unknown): readonly { readonly type: FailureDiagnosticV1['nativeErrorType']; readonly code: string | null }[] {
  const chain: { type: FailureDiagnosticV1['nativeErrorType']; code: string | null }[] = [];
  const seen = new Set<unknown>();
  const collect = (value: unknown): void => {
    if (seen.has(value)) return;
    seen.add(value);
    const code = value instanceof Error && typeof (value as NodeJS.ErrnoException).code === 'string'
      ? (value as NodeJS.ErrnoException).code!
      : null;
    chain.push({ type: diagnosticErrorTypeV1(value), code: code !== null && /^[A-Z0-9_-]{1,64}$/.test(code) ? code : null });
    if (value instanceof Error) collect(value.cause);
    if (value instanceof AggregateError) for (const nested of value.errors) collect(nested);
  };
  collect(error);
  return chain;
}

export async function writeFailureDiagnosticV1(
  invocationRoot: string,
  slotId: CanonicalIdV1,
  stage: FailureDiagnosticV1['stage'],
  error: unknown,
  options: Pick<FailureDiagnosticV1, 'handoffCode' | 'timeoutOwner' | 'exitCode' | 'signal' | 'childSignal' | 'cleanupState' | 'expected' | 'observed'>,
  beforePublish?: () => void,
): Promise<void> {
  const chain = diagnosticCauseChainV1(error);
  const code = error instanceof Error && typeof (error as NodeJS.ErrnoException).code === 'string'
    && /^[A-Z0-9_-]{1,64}$/.test((error as NodeJS.ErrnoException).code!) ? (error as NodeJS.ErrnoException).code! : null;
  const diagnostic: FailureDiagnosticV1 = {
    schemaVersion: 'br03-failure-diagnostic-v1',
    slotId,
    stage,
    nativeErrorType: diagnosticErrorTypeV1(error),
    nativeCode: code,
    handoffCode: options.handoffCode,
    timeoutOwner: options.timeoutOwner,
    exitCode: options.exitCode,
    signal: options.signal,
    childSignal: options.childSignal,
    cleanupState: options.cleanupState,
    expected: options.expected,
    observed: options.observed,
    causeChainSha256: hashCanonicalV1('br03/failure-diagnostic-cause/v1', chain),
  };
  const diagnosticRoot = join(invocationRoot, 'failure-diagnostics');
  await writeExclusive(join(diagnosticRoot, `${slotId}.json`), canonicalizeJsonV1(diagnostic), diagnosticRoot, beforePublish);
}

async function stageBundleFilesV1(
  invocationRoot: string,
  bundleId: CanonicalIdV1,
  files: readonly BundleFileV1[],
): Promise<{ readonly pendingRoot: string; readonly bundleRoot: string }> {
  const root = await realpath(invocationRoot);
  const bundlesRoot = join(root, 'bundles');
  const bundleRoot = join(bundlesRoot, bundleId);
  const pendingRoot = join(bundlesRoot, `.${bundleId}.pending`);
  assertChild(root, bundlesRoot);
  assertChild(root, bundleRoot);
  assertChild(root, pendingRoot);
  await mkdir(bundlesRoot, { recursive: true });
  await mkdir(pendingRoot, { recursive: false });
  try {
    for (const file of files) {
      const path = join(pendingRoot, ...file.path.split('/'));
      assertChild(pendingRoot, path);
      await writeExclusive(path, file.bytes, pendingRoot);
    }
  } catch (error) {
    try {
      await boundedArtifactCleanupV1(rm(pendingRoot, { recursive: true, force: true }), 'Bundle staging rollback');
    } catch (cleanupError) {
      throw new ArtifactCleanupErrorV1('Bundle staging rollback failed.', { cause: new AggregateError([error, cleanupError], 'Bundle staging and rollback failed.') });
    }
    throw error;
  }
  return { pendingRoot, bundleRoot };
}

export async function writeBundleClosureExclusiveV1(
  invocationRoot: string,
  bundleId: CanonicalIdV1,
  context: BenchmarkValidationContextV1,
  files: readonly BundleFileV1[],
  afterBundleClaim?: () => void,
): Promise<string> {
  const root = await realpath(invocationRoot);
  const contextRoot = join(root, 'bundle-contexts');
  const contextPath = join(contextRoot, `${bundleId}.json`);
  const pendingContextPath = join(contextRoot, `.${bundleId}.json.pending`);
  assertChild(root, contextRoot);
  assertChild(root, contextPath);
  assertChild(root, pendingContextPath);
  await mkdir(contextRoot, { recursive: true });
  await Promise.all([
    assertMissingV1(join(root, 'bundles', bundleId), 'Bundle closure'),
    assertMissingV1(contextPath, 'Bundle validation context'),
  ]);
  const staged = await stageBundleFilesV1(root, bundleId, files);
  let bundlePromoted = false;
  let contextPublished = false;
  try {
    await writeExclusive(pendingContextPath, canonicalizeJsonV1(context), contextRoot);
    const stagedVerification = verifyWrittenBundleV1(staged.pendingRoot, context);
    if (!stagedVerification.valid) throw new Error(`Bundle verification failed before publication: ${stagedVerification.error ?? 'unknown error'}.`);
    // mkdir is the atomic no-replace claim for the final bundle identity on NTFS and POSIX.
    await mkdir(staged.bundleRoot, { recursive: false });
    bundlePromoted = true;
    syncParentDirectoryV1(staged.bundleRoot);
    afterBundleClaim?.();
    for (const file of files) await writeExclusive(join(staged.bundleRoot, ...file.path.split('/')), file.bytes, staged.bundleRoot);
    syncParentDirectoryV1(join(staged.bundleRoot, 'owned-child'));
    const finalVerification = verifyWrittenBundleV1(staged.bundleRoot, context);
    if (!finalVerification.valid) throw new Error(`Bundle verification failed before context publication: ${finalVerification.error ?? 'unknown error'}.`);
    await boundedArtifactCleanupV1(rm(staged.pendingRoot, { recursive: true, force: true }), 'Bundle pending-root cleanup');
    await boundedArtifactCleanupV1(rm(pendingContextPath, { force: true }), 'Bundle pending-context cleanup');
    // The immutable context is the bundle publish-last linearization point.
    await writeExclusive(contextPath, canonicalizeJsonV1(context), contextRoot, undefined, undefined, () => { contextPublished = true; });
    return staged.bundleRoot;
  } catch (error) {
    const cleanupErrors: Error[] = [];
    const cleanup = async (operation: Promise<void>): Promise<void> => {
      try {
        await operation;
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError instanceof Error ? cleanupError : new Error('Bundle publication rollback failed.', { cause: cleanupError }));
      }
    };
    await cleanup(boundedArtifactCleanupV1(rm(staged.pendingRoot, { recursive: true, force: true }), 'Bundle pending-root rollback'));
    await cleanup(boundedArtifactCleanupV1(rm(pendingContextPath, { force: true }), 'Bundle pending-context rollback'));
    if (bundlePromoted && !contextPublished) await cleanup(boundedArtifactCleanupV1(rm(staged.bundleRoot, { recursive: true, force: true }), 'Unpublished bundle rollback'));
    if (cleanupErrors.length > 0) throw new ArtifactCleanupErrorV1('Bundle publication and rollback failed.', { cause: new AggregateError([error, ...cleanupErrors], 'Bundle publication and rollback failed.') });
    throw error;
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function availabilityValue<T>(value: AvailabilityV1<T>, label: string): T {
  if (value.status !== 'observed' && value.status !== 'declared') throw new TypeError(`${label} is unavailable.`);
  return value.value;
}

function lifecycleDocument(run: BenchmarkRunDocumentV1['browserProcesses'][number]['runs'][number]): BenchmarkRunDocumentV1 {
  return {
    schemaVersion: 'benchmark-hardware-cell-v1',
    hardwareCellId: run.hardwareCellId,
    source: run.source,
    scenarioId: run.scenario.id as BenchmarkScenarioIdV1,
    scenarioVersion: run.scenario.version,
    hardwareProfileId: availabilityValue(run.environment.hardwareProfileId, 'Lifecycle hardware profile'),
    environment: run.environment,
    measurementEligible: false,
    measurementEligibilityReasons: run.measurementEligibilityReasons.map(({ code, phase }) => ({ code, detail: 'eligibility gate' as never, phase })),
    browserProcesses: [{
      schemaVersion: 'benchmark-browser-process-v1',
      browserProcessId: run.browserProcessId,
      hardwareCellId: run.hardwareCellId,
      source: run.source,
      environment: run.environment,
      ids: run.ids,
      runs: [run],
    }],
  };
}

function verifyLifecycleRunV1(
  run: BenchmarkRunDocumentV1['browserProcesses'][number]['runs'][number],
  expectedPlan: BuiltRunPlanV1,
  expectedUnit: BuiltRunPlanV1['core']['processUnits'][number],
  expectedInvocationRun: RunInvocationV1['processUnits'][number]['runs'][number],
  expectedCreatedUtc: string,
  telemetryBytes: Uint8Array,
): void {
  const expectedCandidate = expectedPlan.core.candidates.find(({ id }) => id === expectedUnit.candidateId);
  const expectedScheme = expectedPlan.core.balanceBlocks
    .find(({ blockId }) => blockId === expectedUnit.balanceBlockId)
    ?.rows.find(({ rowOrdinal }) => rowOrdinal === expectedUnit.rowOrdinal)?.scheme;
  if (expectedCandidate === undefined
    || expectedScheme === undefined
    || !sameBytes(canonicalizeJsonV1(run.ids), canonicalizeJsonV1(expectedUnit.ids))
    || run.createdUtc !== expectedCreatedUtc
    || run.browserProcessId !== expectedUnit.ids.browserProcessId
    || run.scenario.id !== expectedUnit.scenarioId
    || !sameBytes(canonicalizeJsonV1(run.scenario.parameters), canonicalizeJsonV1(expectedUnit.scenarioParameters))
    || run.source.fixture.id !== expectedPlan.core.fixtureContractId
    || availabilityValue(run.source.fixture.semanticSha256, 'Lifecycle fixture semantic digest') !== expectedPlan.core.fixtureSemanticSha256
    || run.source.commitSha !== expectedPlan.core.expectedSourceCommitSha
    || run.source.build.sha256 !== expectedPlan.core.expectedBuildSha256
    || run.source.candidate.id !== expectedCandidate.id
    || availabilityValue(run.source.candidate.sourceFileSetSha256, 'Lifecycle candidate source digest') !== expectedCandidate.sourceFileSetSha256
    || availabilityValue(run.environment.hardwareProfileId, 'Lifecycle hardware profile') !== expectedPlan.core.hardwareProfileId
    || run.hardwareCellId !== deriveHardwareCellIdV1({
      candidateId: expectedUnit.candidateId,
      hardwareProfileId: expectedPlan.core.hardwareProfileId,
      hardwareBindingSha256: expectedPlan.core.hardwareBindingSha256,
      fixtureContractId: expectedPlan.core.fixtureContractId,
      fixtureSemanticSha256: expectedPlan.core.fixtureSemanticSha256,
      expectedSourceCommitSha: expectedPlan.core.expectedSourceCommitSha,
      expectedBuildSha256: expectedPlan.core.expectedBuildSha256,
      scenarioId: expectedUnit.scenarioId as CanonicalIdV1,
    })
    || run.execution.runPlanId !== expectedPlan.runPlanId || run.execution.runPlanSha256 !== expectedPlan.runPlanSha256
    || run.execution.processContainer !== expectedUnit.processContainer
    || run.execution.processOrdinal !== expectedUnit.processOrdinal
    || run.execution.iteration !== expectedInvocationRun.runOrdinal
    || run.execution.order.scheme !== expectedScheme
    || run.execution.order.orderSeed !== expectedPlan.core.orderSeed
    || run.execution.order.blockId !== expectedUnit.balanceBlockId
    || run.execution.order.sequencePosition !== expectedUnit.sequencePosition
    || run.execution.order.candidateId !== expectedUnit.candidateId
    || run.execution.phase !== expectedInvocationRun.phase
    || run.iterations.length !== expectedInvocationRun.iterationIds.length
    || run.iterations.some(({ iterationId }, index) => iterationId !== expectedInvocationRun.iterationIds[index])) {
    throw new Error('Lifecycle run is not bound to its accepted plan and process slot.');
  }
  const context: BenchmarkValidationContextV1 = {
    fixture: run.source.fixture,
    candidate: run.source.candidate,
    runPlan: { id: expectedPlan.runPlanId, sha256: expectedPlan.runPlanSha256 },
    schemaSetSha256: BENCHMARK_SCHEMA_SET_SHA256_V1,
    metricRegistrySha256: BENCHMARK_METRIC_REGISTRY_V1.metricRegistrySha256,
  };
  const validation = validateBenchmarkRunV1(lifecycleDocument(run), context);
  if (!validation.valid) throw new Error(`Lifecycle run validation failed: ${validation.issues.map(({ code, path }) => `${code}@${path}`).join(', ')}.`);
  const backendValue = run.scenario.parameters.find(({ key }) => key === 'backend')?.value;
  const backend = backendValue === 'three-webgl2' || backendValue === 'raw-webgpu' ? backendValue : 'not-applicable';
  const envelope: BrowserTelemetryHandoffEnvelopeV1 = {
    schemaVersion: BR02_BROWSER_HANDOFF_SCHEMA_VERSION,
    contractId: BR02_BROWSER_HANDOFF_CONTRACT_ID,
    runtimeActivation: BR02_BROWSER_RUNTIME_ACTIVATION,
    runId: run.runId,
    planId: expectedPlan.runPlanId,
    scenarioId: run.scenario.id as CanonicalIdV1,
    phase: run.execution.phase,
    backend,
    telemetryMode: 'telemetry-enabled-minimal',
    iterations: run.iterations.map(({ iterationId, iterationOrdinal }) => ({ iterationId, iterationOrdinal })),
  };
  validateDownloadedTelemetryV1(telemetryBytes, envelope);
}

export async function readVerifiedBundleRunIdsV1(bundleRoot: string): Promise<readonly CanonicalIdV1[]> {
  const manifest = parseCanonicalJsonV1(await readControlFileBoundedV1(join(bundleRoot, 'bundle-manifest.json'))) as Partial<BenchmarkBundleManifestV1>;
  if (!Array.isArray(manifest.runs) || manifest.runs.length === 0 || manifest.runs.some((run) => run === null || typeof run !== 'object' || typeof run.runId !== 'string')) throw new TypeError('Bundle manifest runs are invalid.');
  return manifest.runs.map(({ runId }) => runId);
}

const INVOCATION_CLOSURE_PATH = 'invocation-closure.json';

function closureRoleV1(path: string): InvocationClosureFileV1['role'] {
  if (path === 'run-plan.json') return 'plan';
  if (path === 'invocation.json') return 'invocation';
  if (path === 'process-unit-results.json') return 'terminal-results';
  if (path.startsWith('bundles/')) return 'bundle';
  if (path.startsWith('bundle-contexts/')) return 'bundle-context';
  if (path.startsWith('lifecycle-smoke/')) return 'lifecycle-smoke';
  if (path.startsWith('failure-diagnostics/')) return 'failure-diagnostic';
  throw new TypeError(`Invocation contains an unowned closure path: ${path}.`);
}

async function invocationFilesV1(root: string, current = root): Promise<readonly { readonly path: string; readonly bytes: Uint8Array }[]> {
  const files: { path: string; bytes: Uint8Array }[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new TypeError('Invocation closure cannot contain symbolic links or junction aliases.');
    const absolutePath = join(current, entry.name);
    const relativePath = relative(root, absolutePath).split(sep).join('/');
    if (relativePath === INVOCATION_CLOSURE_PATH) continue;
    if (entry.isDirectory()) files.push(...await invocationFilesV1(root, absolutePath));
    else if (entry.isFile()) files.push({ path: relativePath, bytes: await readControlFileBoundedV1(absolutePath) });
    else throw new TypeError('Invocation closure contains an unsupported filesystem entry.');
  }
  return files.sort((left, right) => compareUtf16(left.path, right.path));
}

function buildInvocationClosureV1(
  plan: BuiltRunPlanV1,
  invocation: RunInvocationV1,
  results: readonly ProcessUnitResultV1[],
  files: readonly { readonly path: string; readonly bytes: Uint8Array }[],
): InvocationClosureV1 {
  const resultSlots = new Set(results.map(({ slotId }) => slotId));
  return {
    schemaVersion: 'br03-invocation-closure-v1',
    invocationId: invocation.invocationId,
    runPlanId: plan.runPlanId,
    runPlanSha256: plan.runPlanSha256,
    runnerSourceSha: invocation.runnerSourceSha,
    selectedSlotIds: [...invocation.selectedSlotIds],
    missingSlotIds: invocation.selectedSlotIds.filter((slotId) => !resultSlots.has(slotId)),
    terminalResults: results,
    files: files.map(({ path, bytes }) => ({
      path,
      byteLength: bytes.byteLength,
      sha256: sha256BytesV1(bytes),
      role: closureRoleV1(path),
    })),
  };
}

export async function writeInvocationClosureV1(
  invocationRoot: string,
  plan: BuiltRunPlanV1,
  invocation: RunInvocationV1,
  results: readonly ProcessUnitResultV1[],
  beforePublish?: () => void,
  afterPublish?: () => void,
): Promise<void> {
  const root = await realpath(invocationRoot);
  const files = await invocationFilesV1(root);
  const closure = buildInvocationClosureV1(plan, invocation, results, files);
  if (closure.missingSlotIds.length > 0) throw new TypeError('A terminal invocation closure cannot omit selected slots.');
  await writeExclusive(join(root, INVOCATION_CLOSURE_PATH), canonicalizeJsonV1(closure), root, beforePublish, afterPublish);
}

function parseInvocationClosureV1(value: unknown): InvocationClosureV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invocation closure must be an object.');
  const object = value as Record<string, unknown>;
  const keys = ['schemaVersion', 'invocationId', 'runPlanId', 'runPlanSha256', 'runnerSourceSha', 'selectedSlotIds', 'missingSlotIds', 'terminalResults', 'files'];
  if (Object.keys(object).length !== keys.length || Object.keys(object).some((key) => !keys.includes(key))) throw new TypeError('Invocation closure has missing or unexpected fields.');
  if (object.schemaVersion !== 'br03-invocation-closure-v1' || typeof object.invocationId !== 'string' || typeof object.runPlanId !== 'string'
    || typeof object.runPlanSha256 !== 'string' || typeof object.runnerSourceSha !== 'string'
    || !Array.isArray(object.selectedSlotIds) || !Array.isArray(object.missingSlotIds)
    || !Array.isArray(object.terminalResults) || !Array.isArray(object.files)) throw new TypeError('Invocation closure header is invalid.');
  const files = object.files.map((value) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invocation closure file entry is invalid.');
    const file = value as Record<string, unknown>;
    const fileKeys = ['path', 'byteLength', 'sha256', 'role'];
    if (Object.keys(file).length !== fileKeys.length || Object.keys(file).some((key) => !fileKeys.includes(key))
      || typeof file.path !== 'string' || file.path.length === 0 || file.path.includes('\\') || file.path.startsWith('/') || file.path.split('/').includes('..')
      || !Number.isSafeInteger(file.byteLength) || (file.byteLength as number) < 1
      || typeof file.sha256 !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(file.sha256)
      || !['plan', 'invocation', 'terminal-results', 'bundle', 'bundle-context', 'lifecycle-smoke', 'failure-diagnostic'].includes(file.role as string)
      || closureRoleV1(file.path) !== file.role) throw new TypeError('Invocation closure file entry values are invalid.');
    return file as unknown as InvocationClosureFileV1;
  });
  return {
    schemaVersion: 'br03-invocation-closure-v1',
    invocationId: object.invocationId as CanonicalIdV1,
    runPlanId: object.runPlanId as CanonicalIdV1,
    runPlanSha256: object.runPlanSha256 as InvocationClosureV1['runPlanSha256'],
    runnerSourceSha: object.runnerSourceSha as InvocationClosureV1['runnerSourceSha'],
    selectedSlotIds: object.selectedSlotIds as CanonicalIdV1[],
    missingSlotIds: object.missingSlotIds as CanonicalIdV1[],
    terminalResults: object.terminalResults.map(parseProcessUnitResultForClosureV1),
    files,
  };
}

export async function readInvocationClosureV1(invocationRoot: string): Promise<InvocationClosureV1> {
  return parseInvocationClosureV1(parseCanonicalJsonV1(await readControlFileBoundedV1(join(invocationRoot, INVOCATION_CLOSURE_PATH))));
}

function parseProcessUnitResultForClosureV1(value: unknown): ProcessUnitResultV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invocation closure terminal result is invalid.');
  return value as ProcessUnitResultV1;
}

export async function verifyInvocationClosureV1(
  invocationRoot: string,
  plan: BuiltRunPlanV1,
  invocation: RunInvocationV1,
  results: readonly ProcessUnitResultV1[],
): Promise<readonly string[]> {
  const issues: string[] = [];
  try {
    const root = await realpath(invocationRoot);
    const closure = await readInvocationClosureV1(root);
    const files = await invocationFilesV1(root);
    const expected = buildInvocationClosureV1(plan, invocation, results, files);
    if (!sameBytes(canonicalizeJsonV1(closure), canonicalizeJsonV1(expected))) issues.push('Invocation closure does not match its complete immutable file set.');
  } catch (error) {
    issues.push(`Invocation closure is invalid: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  return issues;
}

export async function verifyInvocationControlV1(
  invocationRoot: string,
  plan: BuiltRunPlanV1,
  invocation: RunInvocationV1,
  results: readonly ProcessUnitResultV1[],
): Promise<readonly string[]> {
  const issues: string[] = [];
  const [planBytes, invocationBytes, resultBytes] = await Promise.all([
    readControlFileBoundedV1(join(invocationRoot, 'run-plan.json')),
    readControlFileBoundedV1(join(invocationRoot, 'invocation.json')),
    readControlFileBoundedV1(join(invocationRoot, 'process-unit-results.json')),
  ]);
  if (!sameBytes(planBytes, plan.canonicalBytes)) issues.push('Run plan bytes mismatch.');
  if (!sameBytes(invocationBytes, canonicalizeJsonV1(persistedInvocationV1(invocation)))) issues.push('Invocation bytes mismatch.');
  if (!sameBytes(resultBytes, canonicalizeJsonV1(results))) issues.push('Process-unit result bytes mismatch.');
  return issues;
}

export async function verifyInvocationSetupV1(
  invocationRoot: string,
  plan: BuiltRunPlanV1,
  invocation: RunInvocationV1,
): Promise<readonly string[]> {
  const [planBytes, invocationBytes] = await Promise.all([
    readControlFileBoundedV1(join(invocationRoot, 'run-plan.json')),
    readControlFileBoundedV1(join(invocationRoot, 'invocation.json')),
  ]);
  const issues: string[] = [];
  if (!sameBytes(planBytes, plan.canonicalBytes)) issues.push('Run plan bytes mismatch.');
  if (!sameBytes(invocationBytes, canonicalizeJsonV1(persistedInvocationV1(invocation)))) issues.push('Invocation bytes mismatch.');
  return issues;
}

export function verifyWrittenBundleV1(bundleRoot: string, context: BenchmarkValidationContextV1) {
  return verifyBundleDirectoryV1(bundleRoot, context);
}

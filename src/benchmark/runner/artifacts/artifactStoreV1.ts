import { mkdir, open, readdir, realpath, rename, rm, stat } from 'node:fs/promises';
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
  if (fromRoot.length === 0 || fromRoot.startsWith('..') || resolve(root, fromRoot) !== resolve(child)) {
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

async function writeExclusive(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const file = await open(path, 'wx');
  let writeError: unknown;
  try {
    await file.writeFile(bytes);
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
}

export async function createInvocationArtifactRootV1(
  outputRoot: string,
  projectRoot: string,
  plan: BuiltRunPlanV1,
  invocation: RunInvocationV1,
): Promise<string> {
  if (invocation.runPlanId !== plan.runPlanId || invocation.outputRoot !== outputRoot) throw new TypeError('Invocation artifact root does not match the accepted plan or output root.');
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
  if (!(await stat(invocationRoot)).isDirectory()) throw new Error('Invocation artifact root is not a directory.');
  await writeExclusive(join(invocationRoot, 'run-plan.json'), plan.canonicalBytes);
  await writeExclusive(join(invocationRoot, 'invocation.json'), canonicalizeJsonV1(persistedInvocationV1(invocation)));
  await mkdir(join(invocationRoot, 'bundles'));
  await mkdir(join(invocationRoot, 'bundle-contexts'));
  await mkdir(join(invocationRoot, 'lifecycle-smoke'));
  return invocationRoot;
}

export async function writeLifecycleSmokeArtifactsV1(
  invocationRoot: string,
  slotId: CanonicalIdV1,
  run: BenchmarkRunV1,
  environment: BenchmarkEnvironmentManifestV1,
  telemetryExportRawBytes: Uint8Array,
): Promise<string> {
  const root = await realpath(invocationRoot);
  const smokeRoot = join(root, 'lifecycle-smoke', slotId);
  const stagingRoot = `${smokeRoot}.pending`;
  assertChild(root, smokeRoot);
  assertChild(root, stagingRoot);
  await mkdir(stagingRoot, { recursive: false });
  const files = [
    { path: 'environment.json', bytes: canonicalizeJsonV1(environment) },
    { path: 'run.json', bytes: canonicalizeJsonV1(run) },
    { path: 'telemetry-export.json', bytes: telemetryExportRawBytes },
  ];
  try {
    for (const file of files) await writeExclusive(join(stagingRoot, file.path), file.bytes);
    await writeExclusive(join(stagingRoot, 'manifest.json'), canonicalizeJsonV1({
      schemaVersion: 'br03-lifecycle-smoke-artifact-v1',
      slotId,
      runId: run.runId,
      files: files.map(({ path, bytes }) => ({ path, byteLength: bytes.byteLength, sha256: sha256BytesV1(bytes) })),
    }));
    await rename(stagingRoot, smokeRoot);
  } catch (error) {
    try {
      await boundedArtifactCleanupV1(rm(stagingRoot, { recursive: true, force: true }), 'Lifecycle-smoke artifact rollback');
    } catch (cleanupError) {
      throw new ArtifactCleanupErrorV1('Lifecycle-smoke artifact rollback failed.', { cause: new AggregateError([error, cleanupError], 'Lifecycle-smoke artifact publication and rollback failed.') });
    }
    throw error;
  }
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
    return ['Lifecycle-smoke artifact directories do not match terminal results.'];
  }
  for (const result of expectedArtifacts) {
    const directory = join(smokeRoot, result.slotId);
    try {
      if (expected !== undefined && result.failureCode !== 'required-metric-producers-unavailable') {
        throw new Error('Lifecycle-smoke terminal result has an unexpected producer failure code.');
      }
      const names = await readdir(directory, { withFileTypes: true });
      const expectedNames = ['environment.json', 'manifest.json', 'run.json', 'telemetry-export.json'];
      if (names.length !== expectedNames.length || names.some((entry) => entry.isSymbolicLink() || !entry.isFile() || !expectedNames.includes(entry.name))) {
        throw new Error('Lifecycle-smoke artifact closure is invalid.');
      }
      const manifest = closedLifecycleManifestV1(parseCanonicalJsonV1(await readControlFileBoundedV1(join(directory, 'manifest.json'))));
      const manifestPaths = manifest.files.map(({ path }) => path);
      if (manifest.slotId !== result.slotId || manifest.runId !== result.runIds[0]
        || new Set(manifestPaths).size !== 3
        || !['environment.json', 'run.json', 'telemetry-export.json'].every((path) => manifestPaths.includes(path as typeof manifestPaths[number]))) {
        throw new Error('Lifecycle-smoke manifest binding is invalid.');
      }
      const bytesByPath = new Map<string, Uint8Array>();
      for (const file of manifest.files) {
        const bytes = await readControlFileBoundedV1(join(directory, file.path));
        if (bytes.byteLength !== file.byteLength || sha256BytesV1(bytes) !== file.sha256) throw new Error('Lifecycle-smoke artifact digest mismatch.');
        bytesByPath.set(file.path, bytes);
      }
      const environment = parseCanonicalJsonV1(bytesByPath.get('environment.json')!) as BenchmarkEnvironmentManifestV1;
      const run = parseCanonicalJsonV1(bytesByPath.get('run.json')!) as BenchmarkRunDocumentV1['browserProcesses'][number]['runs'][number];
      if (run.runId !== manifest.runId || !sameBytes(canonicalizeJsonV1(environment), canonicalizeJsonV1(run.environment))) throw new Error('Lifecycle-smoke environment/run binding mismatch.');
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
  readonly files: readonly { readonly path: 'environment.json' | 'run.json' | 'telemetry-export.json'; readonly byteLength: number; readonly sha256: string }[];
} {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Lifecycle-smoke manifest must be an object.');
  const object = value as Record<string, unknown>;
  const keys = ['schemaVersion', 'slotId', 'runId', 'files'];
  if (Object.keys(object).length !== keys.length || Object.keys(object).some((key) => !keys.includes(key))) throw new TypeError('Lifecycle-smoke manifest has unexpected fields.');
  if (object.schemaVersion !== 'br03-lifecycle-smoke-artifact-v1' || typeof object.slotId !== 'string' || typeof object.runId !== 'string' || !Array.isArray(object.files) || object.files.length !== 3) throw new TypeError('Lifecycle-smoke manifest header is invalid.');
  const files = object.files.map((value) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Lifecycle-smoke manifest file is invalid.');
    const file = value as Record<string, unknown>;
    const fileKeys = ['path', 'byteLength', 'sha256'];
    if (Object.keys(file).length !== fileKeys.length || Object.keys(file).some((key) => !fileKeys.includes(key))) throw new TypeError('Lifecycle-smoke manifest file has unexpected fields.');
    if (!['environment.json', 'run.json', 'telemetry-export.json'].includes(file.path as string) || !Number.isSafeInteger(file.byteLength) || (file.byteLength as number) < 1 || typeof file.sha256 !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(file.sha256)) throw new TypeError('Lifecycle-smoke manifest file values are invalid.');
    return { path: file.path as 'environment.json' | 'run.json' | 'telemetry-export.json', byteLength: file.byteLength as number, sha256: file.sha256 };
  });
  return { schemaVersion: object.schemaVersion, slotId: object.slotId as CanonicalIdV1, runId: object.runId as CanonicalIdV1, files };
}

export async function writeProcessUnitResultsV1(
  invocationRoot: string,
  results: readonly ProcessUnitResultV1[],
): Promise<void> {
  const resultPath = join(invocationRoot, 'process-unit-results.json');
  const pendingPath = `${resultPath}.pending`;
  await writeExclusive(pendingPath, canonicalizeJsonV1(results));
  try {
    await rename(pendingPath, resultPath);
  } catch (error) {
    try {
      await boundedArtifactCleanupV1(rm(pendingPath, { force: true }), 'Process-unit result rollback');
    } catch (cleanupError) {
      throw new ArtifactCleanupErrorV1('Process-unit result rollback failed.', { cause: new AggregateError([error, cleanupError], 'Process-unit result publication and rollback failed.') });
    }
    throw error;
  }
}

export async function writeBundleValidationContextV1(
  invocationRoot: string,
  bundleId: CanonicalIdV1,
  context: BenchmarkValidationContextV1,
): Promise<void> {
  await writeExclusive(join(invocationRoot, 'bundle-contexts', `${bundleId}.json`), canonicalizeJsonV1(context));
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
      await writeExclusive(path, file.bytes);
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
): Promise<string> {
  const root = await realpath(invocationRoot);
  const contextRoot = join(root, 'bundle-contexts');
  const contextPath = join(contextRoot, `${bundleId}.json`);
  const pendingContextPath = join(contextRoot, `.${bundleId}.json.pending`);
  assertChild(root, contextRoot);
  assertChild(root, contextPath);
  assertChild(root, pendingContextPath);
  await mkdir(contextRoot, { recursive: true });
  const staged = await stageBundleFilesV1(root, bundleId, files);
  let publishedContext = false;
  let publishedBundle = false;
  try {
    await writeExclusive(pendingContextPath, canonicalizeJsonV1(context));
    const verification = verifyWrittenBundleV1(staged.pendingRoot, context);
    if (!verification.valid) throw new Error(`Bundle verification failed before publication: ${verification.error ?? 'unknown error'}.`);
    await rename(pendingContextPath, contextPath);
    publishedContext = true;
    await rename(staged.pendingRoot, staged.bundleRoot);
    publishedBundle = true;
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
    if (publishedContext) await cleanup(boundedArtifactCleanupV1(rm(contextPath, { force: true }), 'Bundle context rollback'));
    if (publishedBundle) await cleanup(boundedArtifactCleanupV1(rm(staged.bundleRoot, { recursive: true, force: true }), 'Bundle root rollback'));
    if (cleanupErrors.length > 0) throw new ArtifactCleanupErrorV1('Bundle publication and rollback failed.', { cause: new AggregateError([error, ...cleanupErrors], 'Bundle publication and rollback failed.') });
    throw error;
  }
}

export async function writeBundleExclusiveV1(
  invocationRoot: string,
  bundleId: CanonicalIdV1,
  files: readonly BundleFileV1[],
): Promise<string> {
  const staged = await stageBundleFilesV1(invocationRoot, bundleId, files);
  try {
    await rename(staged.pendingRoot, staged.bundleRoot);
  } catch (error) {
    try {
      await boundedArtifactCleanupV1(rm(staged.pendingRoot, { recursive: true, force: true }), 'Bundle rollback');
    } catch (cleanupError) {
      throw new ArtifactCleanupErrorV1('Bundle rollback failed.', { cause: new AggregateError([error, cleanupError], 'Bundle publication and rollback failed.') });
    }
    throw error;
  }
  return staged.bundleRoot;
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

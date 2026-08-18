import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  canonicalizeJsonV1,
  CanonicalJsonError,
  parseCanonicalJsonV1,
} from '../../../../src/benchmark/provenance/canonicalJsonV1';
import {
  bundleRelativePathV1,
  compareCanonicalRelativePathsV1,
  sortCanonicalRelativePathsV1,
} from '../../../../src/benchmark/provenance/canonicalPathV1';
import {
  bundleDigestFilesV1,
  buildBundleFilesV1,
  formatBundleDigestV1,
  parseBundleDigestV1,
  verifyBundleDirectoryV1,
  type BundleFileInputV1,
  type BundleFileV1,
} from '../../../../src/benchmark/provenance/bundleV1';
import {
  digestFileBytesV1,
  digestFileSetV1,
  type FileSetEntryInputV1,
} from '../../../../src/benchmark/provenance/fileSetDigestV1';
import {
  sourcePreflightV1,
  type SourcePreflightCommandResultV1,
} from '../../../../src/benchmark/provenance/sourcePreflightV1';
import {
  calculateRunBindingSha256V1,
  createBenchmarkValidationReceiptV1,
  validateBenchmarkRunV1,
} from '../../../../src/benchmark/contracts/validateV1';
import { BENCHMARK_SCHEMA_SET_BYTES_V1 } from '../../../../src/benchmark/contracts/schemaSetV1';
import { repositoryRelativePathV1 } from '../../../../src/benchmark/provenance/canonicalPathV1';
import {
  BENCHMARK_TEST_SCENARIO_DEFINITION_DIGESTS_V1,
  BENCHMARK_TEST_SCENARIO_DEFINITIONS_V1,
} from '../../../contracts/benchmark/scenario-fixtures-v1';
import type { BenchmarkCaseRuntimeV1 } from '../../../unit/benchmark/contracts/benchmark-case-runtime-v1';
import {
  createBenchmarkCaseDocumentV1,
  createBenchmarkTelemetryAdapterV1,
  createBenchmarkTelemetryExportV1,
  createBenchmarkValidationContextV1,
} from '../../../unit/benchmark/contracts/benchmark-case-fixtures-v1';

type JsonRecord = Record<string, any>;
type DocumentOptions = Parameters<typeof createBenchmarkCaseDocumentV1>[0];
type ContextOptions = Parameters<typeof createBenchmarkValidationContextV1>[0];
const BR01_ACCEPTED_WP04_SHA = 'c64aeef1f51dd0ed2d8431411cf3ba1e84195b9d';

export type BenchmarkFixtureCaseStageV1 = 'pass' | 'parse' | 'schema' | 'semantic' | 'provenance-or-bundle';
export type BenchmarkFixtureCaseStatusV1 = 'pass' | 'reject';

export interface BenchmarkFixtureExpectedOutcomeV1 {
  readonly status: BenchmarkFixtureCaseStatusV1;
  readonly stage: BenchmarkFixtureCaseStageV1;
  readonly code?: string;
  readonly facts?: Readonly<Record<string, unknown>>;
}

export interface BenchmarkFixtureExecutionResultV1 {
  readonly status: BenchmarkFixtureCaseStatusV1;
  readonly stage: BenchmarkFixtureCaseStageV1;
  readonly code?: string;
  readonly facts: Readonly<Record<string, unknown>>;
}

export interface BenchmarkFixtureCaseOptionsV1 {
  readonly kind: string;
  readonly [key: string]: unknown;
}

export type BenchmarkFixtureCaseExecutorV1 = (
  options: BenchmarkFixtureCaseOptionsV1,
) => BenchmarkFixtureExecutionResultV1;

export interface BenchmarkFixtureCaseV1<Id extends string = string> {
  readonly id: Id;
  readonly description: string;
  readonly options: BenchmarkFixtureCaseOptionsV1;
  readonly executor: BenchmarkFixtureCaseExecutorV1;
  readonly expected: BenchmarkFixtureExpectedOutcomeV1;
}

const positiveCaseIds = [
  'P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09',
  'P10', 'P11', 'P12', 'P13', 'P14', 'P15', 'P16', 'P17',
] as const;
const negativeCaseIds = [
  'N01', 'N02', 'N03', 'N04', 'N05', 'N06', 'N07', 'N08', 'N09', 'N10',
  'N11', 'N12', 'N13', 'N14', 'N15', 'N16', 'N17', 'N18', 'N19', 'N20',
  'N21', 'N22', 'N23', 'N24', 'N25', 'N26', 'N27', 'N28', 'N29', 'N30',
  'N31', 'N32', 'N33', 'N34', 'N35', 'N36', 'N37', 'N38', 'N39', 'N40',
  'N41', 'N42', 'N43', 'N44', 'N45', 'N46', 'N47', 'N48', 'N49', 'N50',
  'N51', 'N52', 'N53', 'N54', 'N55', 'N56', 'N57', 'N58', 'N59', 'N60',
  'N61', 'N62', 'N63', 'N64', 'N65', 'N66', 'N67', 'N68',
] as const;

export type BenchmarkPositiveFixtureCaseIdV1 = (typeof positiveCaseIds)[number];
export type BenchmarkNegativeFixtureCaseIdV1 = (typeof negativeCaseIds)[number];

const textEncoder = new TextEncoder();
const CANDIDATE_HEAD_BLOB_OID = 'c'.repeat(40);
const textDecoder = new TextDecoder();

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function pass(facts: Readonly<Record<string, unknown>> = {}): BenchmarkFixtureExecutionResultV1 {
  return { status: 'pass', stage: 'pass', facts };
}

function reject(
  stage: Exclude<BenchmarkFixtureCaseStageV1, 'pass'>,
  code: string | undefined,
  facts: Readonly<Record<string, unknown>> = {},
): BenchmarkFixtureExecutionResultV1 {
  return { status: 'reject', stage, ...(code === undefined ? {} : { code }), facts };
}

type N36FixtureMutationV1 =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'token'; readonly value: 'NaN' | 'Infinity' | '-0' };

interface N36FixtureV1 {
  readonly caseId: 'N36';
  readonly fixtureId: string;
  readonly metricRef: string;
  readonly mutation: N36FixtureMutationV1;
  readonly sampleOrdinal: number;
  readonly variant: string;
  readonly version: 1;
}

interface RunVariantOptions {
  readonly name: string;
  readonly document?: DocumentOptions;
  readonly context?: ContextOptions;
  readonly fixturePath?: string;
  readonly mutate: (document: JsonRecord, fixture?: N36FixtureV1) => void;
  readonly collectFacts?: (document: JsonRecord) => Readonly<Record<string, unknown>>;
  readonly runtime?: BenchmarkCaseRuntimeV1;
}

interface RunCaseOptions extends BenchmarkFixtureCaseOptionsV1 {
  readonly kind: 'run';
  readonly document?: DocumentOptions;
  readonly context?: ContextOptions;
  readonly mutate?: (document: JsonRecord) => void;
  readonly variants?: readonly RunVariantOptions[];
  readonly preflight?: SourcePreflightKindV1;
  readonly preflightFirst?: boolean;
  readonly provenanceBoundary?: boolean;
  readonly collectFacts?: (document: JsonRecord) => Readonly<Record<string, unknown>>;
  readonly runtime?: BenchmarkCaseRuntimeV1;
}

function documentFor(options: DocumentOptions | undefined): JsonRecord {
  const input = { ...(options ?? {}) };
  if (input.samples === undefined) input.samples = true;
  return clone(createBenchmarkCaseDocumentV1(input));
}

function resultCode(result: { readonly valid: boolean; readonly code?: string }): string | undefined {
  return result.valid ? undefined : result.code;
}

function targetRun(document: JsonRecord): JsonRecord {
  return document.browserProcesses[0].runs.at(-1)!;
}

function targetSamples(document: JsonRecord): JsonRecord[] {
  return targetRun(document).iterations.flatMap((iteration: JsonRecord) => iteration.samples) as JsonRecord[];
}

function readN36Fixture(fileName: string, expectedVariant: string): N36FixtureV1 {
  const value = JSON.parse(readFileSync(new URL(`./negative/${fileName}`, import.meta.url), 'utf8')) as JsonRecord;
  const mutation = value.mutation as JsonRecord | undefined;
  const validMutation = mutation !== undefined
    && ((mutation.kind === 'number' && typeof mutation.value === 'number' && Number.isFinite(mutation.value))
      || (mutation.kind === 'token' && ['NaN', 'Infinity', '-0'].includes(String(mutation.value))));
  if (value.caseId !== 'N36' || value.version !== 1 || value.variant !== expectedVariant
    || typeof value.fixtureId !== 'string' || typeof value.metricRef !== 'string'
    || !Number.isSafeInteger(value.sampleOrdinal) || !validMutation) {
    throw new Error(`Invalid N36 fixture metadata: ${fileName}.`);
  }
  return value as unknown as N36FixtureV1;
}

function mutateN36Fixture(document: JsonRecord, fixture: N36FixtureV1 | undefined): void {
  if (fixture === undefined) throw new Error('N36 fixture metadata was not injected.');
  const sample = targetSamples(document).find((candidate) => candidate.metricRef === fixture.metricRef && candidate.ordinal === fixture.sampleOrdinal);
  if (sample === undefined) throw new Error(`N36 fixture target sample was not found: ${fixture.metricRef}.`);
  const mutation = fixture.mutation;
  sample.result.value = mutation.kind === 'number'
    ? mutation.value
    : mutation.value === 'NaN' ? NaN : mutation.value === 'Infinity' ? Infinity : -0;
}

function runVariant(options: RunVariantOptions): JsonRecord {
  const document = documentFor(options.document);
  const context = createBenchmarkValidationContextV1(options.context);
  const fixture = options.fixturePath === undefined ? undefined : readN36Fixture(options.fixturePath, options.name);
  options.mutate(document, fixture);
  if (options.runtime === undefined) throw new Error('Benchmark case runtime was not injected.');
  const schemaValid = options.runtime.validateRunSchema(document);
  const validation = validateBenchmarkRunV1(document, context);
  const collectedFacts = options.collectFacts?.(document) ?? {};
  return {
    name: options.name,
    status: validation.valid ? 'pass' : 'reject',
    stage: validation.valid ? 'pass' : validation.stage,
    ...(resultCode(validation) === undefined ? {} : { code: resultCode(validation) }),
    schemaValid,
    ...(fixture === undefined ? {} : { fixtureId: fixture.fixtureId, fixtureVariant: fixture.variant }),
    ...collectedFacts,
  };
}

function setupSourcePreflight(kind: SourcePreflightKindV1): {
  readonly root: string;
  readonly input: Parameters<typeof sourcePreflightV1>[0];
  readonly expected: { readonly status: 'accepted' | 'rejected'; readonly code?: string };
} {
  const root = mkdtempSync(join(tmpdir(), `br01-${kind}-`));
  const fixtureEntries: FileSetEntryInputV1[] = [{ path: 'fixture.txt', bytes: textEncoder.encode('fixture') }];
  const candidateEntries: FileSetEntryInputV1[] = [{ path: 'candidate.txt', bytes: textEncoder.encode('candidate') }];
  const fixtureSemanticBytes = canonicalizeJsonV1({ fixtureContractId: 'fixture-v1', version: 1 });
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'fixture.txt'), fixtureEntries[0]!.bytes);
  writeFileSync(join(root, 'candidate.txt'), candidateEntries[0]!.bytes);
  writeFileSync(join(root, 'dist', 'index.js'), textEncoder.encode('build'));
  if (kind === 'gitmodules') writeFileSync(join(root, '.gitmodules'), textEncoder.encode('[submodule "unexpected"]\n'));

  const fixtureDigest = digestFileSetV1(fixtureEntries);
  const candidateDigest = digestFileSetV1(candidateEntries);
  const fixture = {
    id: 'fixture-v1',
    version: 1,
    semanticSha256: { status: 'observed', value: digestFileBytesV1(fixtureSemanticBytes), sourceRef: 'capture-v1', stability: 'stable' },
    sourceCommitSha: { status: 'declared', value: BR01_ACCEPTED_WP04_SHA, sourceRef: 'plan-v1', stability: 'run-config' },
    sourceFileSetSha256: { status: 'observed', value: kind === 'fixture-mismatch' ? `sha256:${'b'.repeat(64)}` : fixtureDigest, sourceRef: 'capture-v1', stability: 'stable' },
    sourcePaths: { status: 'observed', value: ['fixture.txt'], sourceRef: 'capture-v1', stability: 'stable' },
  };
  const candidate = {
    id: 'candidate-v1',
    version: 1,
    sourceFileSetSha256: { status: 'observed', value: kind === 'candidate-mismatch' ? `sha256:${'b'.repeat(64)}` : candidateDigest, sourceRef: 'capture-v1', stability: 'stable' },
    sourcePaths: { status: 'observed', value: ['candidate.txt'], sourceRef: 'capture-v1', stability: 'stable' },
  };
  const trees = ['a'.repeat(40), kind === 'tree-change' ? 'b'.repeat(40) : 'a'.repeat(40)];
  let treeRead = 0;
  const empty = new Uint8Array();
  const commandResult = (stdout: string | Uint8Array, status = 0): SourcePreflightCommandResultV1 => ({
    status,
    stdout: typeof stdout === 'string' ? textEncoder.encode(`${stdout}\n`) : stdout,
    stderr: empty,
  });
  const runCommand = (_command: string, args: readonly string[], cwd: string): SourcePreflightCommandResultV1 => {
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return commandResult(realpathSync(cwd));
    if (args[0] === 'rev-parse' && args[2] === 'HEAD^{commit}') return commandResult(BR01_ACCEPTED_WP04_SHA);
    if (args[0] === 'rev-parse' && args[2]?.endsWith('^{tree}')) return commandResult(trees[Math.min(treeRead++, trees.length - 1)]!);
    if (args[0] === 'status') return kind === 'dirty' ? commandResult('1 .M fixture.txt') : commandResult(empty);
    if (args[0] === 'ls-files' && kind === 'gitlink') return commandResult(`160000 ${'a'.repeat(40)} 0\tvendor/submodule`);
    if (args[0] === 'ls-tree') return { status: 0, stdout: textEncoder.encode(`100644 blob ${CANDIDATE_HEAD_BLOB_OID}\t${args[args.length - 1]}\0`), stderr: empty };
    if (args[0] === 'hash-object') return commandResult(CANDIDATE_HEAD_BLOB_OID);
    return commandResult(empty);
  };
  const input = {
    rootPath: root,
    expectedSourceCommitSha: BR01_ACCEPTED_WP04_SHA,
    fixtureSemanticBytes,
    fixture: fixture as never,
    candidate: candidate as never,
    runCommand,
  };
  const expected = kind === 'accepted'
    ? { status: 'accepted' as const }
    : { status: 'rejected' as const, code: ({
      dirty: 'source-dirty',
       gitmodules: 'infrastructure-failure',
       gitlink: 'infrastructure-failure',
      'tree-change': 'source-tree-mismatch',
      'fixture-mismatch': 'fixture-contract-mismatch',
      'candidate-mismatch': 'candidate-contract-mismatch',
    } as const)[kind] };
  return { root, input, expected };
}

type SourcePreflightKindV1 = 'accepted' | 'dirty' | 'gitmodules' | 'gitlink' | 'tree-change' | 'fixture-mismatch' | 'candidate-mismatch';

function sourcePreflightFacts(kind: SourcePreflightKindV1): Readonly<Record<string, unknown>> {
  const setup = setupSourcePreflight(kind);
  try {
    const result = sourcePreflightV1(setup.input);
    return {
      preflight: {
        status: result.status,
        ...(result.status === 'rejected' ? { code: result.code } : {}),
      },
    };
  } finally {
    rmSync(setup.root, { recursive: true, force: true });
  }
}

function executeRunCase(rawOptions: BenchmarkFixtureCaseOptionsV1): BenchmarkFixtureExecutionResultV1 {
  const options = rawOptions as RunCaseOptions;
  const preflightFacts = options.preflight === undefined ? {} : sourcePreflightFacts(options.preflight);
  const variants = options.variants ?? [{
    name: 'default',
    document: options.document,
    context: options.context,
    mutate: options.mutate ?? (() => undefined),
  }];
  const results = variants.map((variant) => runVariant({ ...variant, collectFacts: options.collectFacts, runtime: options.runtime }));
  const allRejected = results.every((result) => result.status === 'reject');
  const allPassed = results.every((result) => result.status === 'pass');
  const stages = new Set(results.map((result) => result.stage));
  const codes = new Set(results.map((result) => result.code).filter((code): code is string => code !== undefined));
  const facts: Record<string, unknown> = {
    ...(results.length === 1 ? Object.fromEntries(
      Object.entries(results[0]!).filter(([key]) => !['name', 'status', 'stage', 'code'].includes(key)),
    ) : {
      variants: results,
      schemaValid: results.every((result) => result.schemaValid),
    }),
  };
  Object.assign(facts, preflightFacts);
  const preflight = preflightFacts.preflight as JsonRecord | undefined;
  if (options.preflightFirst === true && preflight?.status === 'rejected') return reject('provenance-or-bundle', preflight.code as string | undefined, facts);
  if (options.provenanceBoundary === true) {
    const inner = results[0]!;
    facts.inner = { status: inner.status, stage: inner.stage, ...(inner.code === undefined ? {} : { code: inner.code }) };
    return reject('provenance-or-bundle', undefined, facts);
  }
  const stage = stages.size === 1 ? results[0]!.stage : results[0]!.stage;
  const code = codes.size === 1 ? [...codes][0] : undefined;
  if (allPassed) return { status: 'pass', stage: 'pass', facts };
  if (allRejected) return { status: 'reject', stage, ...(code === undefined ? {} : { code }), facts };
  return { status: 'reject', stage, facts };
}

interface BundleVariantOptions {
  readonly name: string;
  readonly includeBinary?: boolean;
  readonly includeText?: boolean;
  readonly mutate: (root: string) => void;
}

interface BundleFixture {
  readonly files: readonly BundleFileV1[];
  readonly artifact: JsonRecord;
  readonly bundle: JsonRecord;
}

function createBundleFixture(options: { readonly includeBinary?: boolean; readonly includeText?: boolean; readonly metricRegistry: any }): BundleFixture {
  const document = createBenchmarkCaseDocumentV1({ phase: 'cold', container: 'cold', samples: true });
  const rawRun = canonicalizeJsonV1(document);
  const telemetryExport = canonicalizeJsonV1(createBenchmarkTelemetryExportV1(document));
  const receipt = createBenchmarkValidationReceiptV1({
    planId: 'plan-v1' as never,
    slotId: 'slot-measurement' as never,
    runId: 'measurement-run' as never,
    telemetryExportRawBytes: telemetryExport,
    benchmarkRunRawBytes: rawRun,
    benchmarkRunCanonicalBytes: rawRun,
    schemaSetBytes: BENCHMARK_SCHEMA_SET_BYTES_V1,
    metricRegistry: options.metricRegistry,
    telemetryAdapter: createBenchmarkTelemetryAdapterV1(),
    validatorSourceCommitSha: 'a'.repeat(40) as never,
    validatorSourceFiles: [{ path: repositoryRelativePathV1('src/benchmark/contracts/validateV1.ts'), bytes: textEncoder.encode('validator') }],
    validationContext: createBenchmarkValidationContextV1(),
  });
  const artifacts: BundleFileInputV1[] = [
    ...(options.includeBinary === true ? [{ path: 'artifacts/capture.png', bytes: new Uint8Array([0, 1, 2]) }] : []),
    { path: 'raw/measurement-run.json', bytes: rawRun },
    { path: 'receipts/measurement-run.json', bytes: canonicalizeJsonV1(receipt) },
    { path: 'telemetry/measurement-run.json', bytes: telemetryExport },
    ...(options.includeText === true ? [
      { path: 'summary/summary.json', bytes: textEncoder.encode('{}') },
      { path: 'summary/summary.md', bytes: textEncoder.encode('# summary\n') },
    ] : []),
  ];
  artifacts.sort((left, right) => compareCanonicalRelativePathsV1(left.path, right.path));
  const artifact = {
    schemaVersion: 'benchmark-artifact-manifest-v1',
    protocolVersion: 'benchmark-protocol-v1',
    artifacts: artifacts.map((file) => ({
      path: file.path,
      role: file.path.endsWith('.png') ? 'screenshot' : file.path.endsWith('.md') ? 'summary-markdown' : file.path.startsWith('raw/') ? 'raw-run-json' : file.path.startsWith('telemetry/') ? 'telemetry-export-json' : file.path.startsWith('receipts/') ? 'validation-receipt-json' : 'summary-json',
      mediaType: file.path.endsWith('.png') ? 'image/png' : file.path.endsWith('.md') ? 'text/markdown' : 'application/json',
      serialization: file.path.endsWith('.png') ? 'binary-exact' : file.path.endsWith('.md') ? 'utf8-lf-final-newline' : 'jcs-rfc8785',
      byteLength: file.bytes.byteLength,
      sha256: digestFileBytesV1(file.bytes),
      runIds: ['measurement-run'],
    })),
  };
  const artifactBytes = canonicalizeJsonV1(artifact);
  const bundle = {
    schemaVersion: 'benchmark-bundle-manifest-v1',
    protocolVersion: 'benchmark-protocol-v1',
    bundleId: 'bundle-1',
    createdUtc: '2026-08-13T12:00:00.000Z',
    claimClass: 'correctness',
    canonicalJson: 'rfc8785-jcs',
    pathPolicy: 'hestia-relative-posix-lower-v1',
    digestAlgorithmVersion: 'hestia-benchmark-bundle-sha256-v1',
    artifactManifest: {
      path: 'artifact-manifest.json',
      byteLength: artifactBytes.byteLength,
      sha256: digestFileBytesV1(artifactBytes),
    },
    runs: [{ runId: 'measurement-run', rawRun: { path: 'raw/measurement-run.json', sha256: digestFileBytesV1(rawRun) }, telemetryExport: { path: 'telemetry/measurement-run.json', sha256: digestFileBytesV1(telemetryExport) }, validationReceipt: { path: 'receipts/measurement-run.json', sha256: digestFileBytesV1(canonicalizeJsonV1(receipt)) } }],
    excludedFromBundleDigest: ['bundle.sha256'],
  };
  return { files: buildBundleFilesV1(artifact as never, bundle as never, artifacts), artifact, bundle };
}

function materializeBundle(root: string, files: readonly BundleFileV1[]): void {
  for (const file of files) {
    const target = join(root, ...file.path.split('/'));
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, file.bytes);
  }
}

function rewriteJsonFile(root: string, path: string, mutate: (value: JsonRecord) => void): void {
  const target = join(root, ...path.split('/'));
  const value = parseCanonicalJsonV1(new Uint8Array(readFileSync(target))) as JsonRecord;
  mutate(value);
  writeFileSync(target, canonicalizeJsonV1(value));
}

function materializedBundleFiles(root: string, prefix = ''): BundleFileV1[] {
  const files: BundleFileV1[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = join(root, entry.name);
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...materializedBundleFiles(absolute, path));
    else files.push({ path: bundleRelativePathV1(path), bytes: new Uint8Array(readFileSync(absolute)) });
  }
  return files;
}

function rewriteArtifactManifestAndBindings(root: string, mutate: (manifest: JsonRecord) => void, rebuildBundleDigest: boolean): void {
  const artifactPath = join(root, 'artifact-manifest.json');
  const artifact = parseCanonicalJsonV1(new Uint8Array(readFileSync(artifactPath))) as JsonRecord;
  mutate(artifact);
  const artifactBytes = canonicalizeJsonV1(artifact);
  writeFileSync(artifactPath, artifactBytes);
  const bundlePath = join(root, 'bundle-manifest.json');
  const bundle = parseCanonicalJsonV1(new Uint8Array(readFileSync(bundlePath))) as JsonRecord;
  bundle.artifactManifest = { ...bundle.artifactManifest, byteLength: artifactBytes.byteLength, sha256: digestFileBytesV1(artifactBytes) };
  writeFileSync(bundlePath, canonicalizeJsonV1(bundle));
  if (rebuildBundleDigest) writeFileSync(join(root, 'bundle.sha256'), formatBundleDigestV1(bundleDigestFilesV1(materializedBundleFiles(root))));
}

type BinaryArtifactRoleV1 = 'trace';

const BINARY_ARTIFACT_ROLE_FIXTURES: Readonly<Record<BinaryArtifactRoleV1, { readonly path: string; readonly mediaType: string }>> = {
  trace: { path: 'traces/process-0042/trace.json.gz', mediaType: 'application/gzip' },
};

function mutateBinaryArtifactRole(root: string, role: BinaryArtifactRoleV1, mismatch: 'extension' | 'media-type' | 'location' | 'name' | 'raw-location-name'): void {
  const fixture = BINARY_ARTIFACT_ROLE_FIXTURES[role];
  const originalPath = 'artifacts/capture.png';
  const targetPath = mismatch === 'extension'
    ? 'artifacts/capture.bin'
    : mismatch === 'location' ? 'artifacts/process-0042/trace.json.gz'
      : mismatch === 'name' ? 'traces/process-0042/not-trace.json.gz'
        : mismatch === 'raw-location-name' ? 'raw/not-a-trace.json.gz' : fixture.path;
  mkdirSync(join(root, ...targetPath.split('/').slice(0, -1)), { recursive: true });
  renameSync(join(root, originalPath), join(root, targetPath));
  rewriteArtifactManifestAndBindings(root, (manifest) => {
    const entry = (manifest.artifacts as JsonRecord[]).find((candidate) => candidate.path === originalPath)!;
    entry.path = targetPath;
    entry.role = role;
    entry.mediaType = mismatch === 'media-type' ? 'APPLICATION/GZIP' : fixture.mediaType;
    entry.serialization = 'binary-exact';
  }, true);
}

function rebindArtifactFile(root: string, path: string, rebuildBundleDigest: boolean): void {
  const bytes = new Uint8Array(readFileSync(join(root, ...path.split('/'))));
  rewriteArtifactManifestAndBindings(root, (manifest) => {
    const entry = (manifest.artifacts as JsonRecord[]).find((candidate) => candidate.path === path);
    if (entry === undefined) throw new Error(`Artifact entry not found: ${path}.`);
    entry.byteLength = bytes.byteLength;
    entry.sha256 = digestFileBytesV1(bytes);
  }, rebuildBundleDigest);
}

function executeBundleCase(rawOptions: BenchmarkFixtureCaseOptionsV1): BenchmarkFixtureExecutionResultV1 {
  const options = rawOptions as BenchmarkFixtureCaseOptionsV1 & { readonly variants: readonly BundleVariantOptions[] };
  const runtime = (rawOptions as BenchmarkFixtureCaseOptionsV1 & { readonly runtime?: BenchmarkCaseRuntimeV1 }).runtime;
  if (runtime === undefined) throw new Error('Benchmark case runtime was not injected.');
  const variantResults: JsonRecord[] = [];
  for (const variant of options.variants) {
    const root = mkdtempSync(join(tmpdir(), `br01-${variant.name}-`));
    let platformOutcome: string | undefined;
    try {
       const fixture = createBundleFixture({ includeBinary: variant.includeBinary, includeText: variant.includeText, metricRegistry: runtime.metricRegistry });
      materializeBundle(root, fixture.files);
      try {
        variant.mutate(root);
      } catch (error) {
        const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
        if (options.kind === 'bundle-symlink' && ['EACCES', 'EPERM', 'ENOTSUP', 'UNKNOWN'].includes(code ?? '')) {
          platformOutcome = 'unsupported-platform';
        } else {
          throw error;
        }
      }
      if (options.kind === 'bundle-symlink' && platformOutcome === undefined) {
        const link = join(root, 'raw', 'link');
        if (!lstatSync(link).isSymbolicLink()) throw new Error('N56 did not create a symbolic link.');
      }
      const verification = verifyBundleDirectoryV1(root, createBenchmarkValidationContextV1());
      const rejected = platformOutcome !== undefined || !verification.valid;
      variantResults.push({
        name: variant.name,
        status: rejected ? 'reject' : 'pass',
        ...(platformOutcome === undefined ? {} : { platformOutcome }),
        ...(verification.valid ? {} : { errorCategory: 'bundle-verification-error' }),
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  const allRejected = variantResults.every((result) => result.status === 'reject');
  const facts: Record<string, unknown> = { variants: variantResults };
  if (options.kind === 'bundle-symlink') {
    facts.variantCount = variantResults.length;
    facts.securityBoundary = 'symlink-or-unsupported-platform';
  }
  return allRejected
    ? reject('provenance-or-bundle', undefined, facts)
    : pass(facts);
}

function executeParseCase(rawOptions: BenchmarkFixtureCaseOptionsV1): BenchmarkFixtureExecutionResultV1 {
  const options = rawOptions as BenchmarkFixtureCaseOptionsV1 & {
    readonly variants: readonly { readonly name: string; readonly input: Uint8Array | string }[];
  };
  const variants = options.variants.map((variant) => {
    try {
      parseCanonicalJsonV1(variant.input);
      return { name: variant.name, status: 'pass' };
    } catch (error) {
      return {
        name: variant.name,
        status: 'reject',
        errorKind: error instanceof CanonicalJsonError ? 'CanonicalJsonError' : 'unknown-error',
      };
    }
  });
  return variants.every((variant) => variant.status === 'reject')
    ? reject('parse', undefined, { variants })
    : pass({ variants });
}

function executeBomCase(rawOptions: BenchmarkFixtureCaseOptionsV1): BenchmarkFixtureExecutionResultV1 {
  const runtime = (rawOptions as BenchmarkFixtureCaseOptionsV1 & { readonly runtime?: BenchmarkCaseRuntimeV1 }).runtime;
  if (runtime === undefined) throw new Error('Benchmark case runtime was not injected.');
  const jsonResult = executeParseCase({
    kind: 'parse',
    variants: [{ name: 'json-bom', input: new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]) }],
  });
  const root = mkdtempSync(join(tmpdir(), 'br01-n44-markdown-'));
  try {
     const fixture = createBundleFixture({ includeText: true, metricRegistry: runtime.metricRegistry });
    const artifact = clone(fixture.artifact);
    const bundle = clone(fixture.bundle);
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...textEncoder.encode('# summary\n')]);
    const artifacts = fixture.files.filter((file) => !['artifact-manifest.json', 'bundle-manifest.json', 'bundle.sha256', 'summary/summary.md'].includes(file.path));
    const entry = (artifact.artifacts as JsonRecord[]).find((candidate) => candidate.path === 'summary/summary.md')!;
    entry.byteLength = bom.byteLength;
    entry.sha256 = digestFileBytesV1(bom);
    const artifactBytes = canonicalizeJsonV1(artifact);
    bundle.artifactManifest = { path: 'artifact-manifest.json', byteLength: artifactBytes.byteLength, sha256: digestFileBytesV1(artifactBytes) };
    const rebuilt = buildBundleFilesV1(artifact as never, bundle as never, [...artifacts, { path: 'summary/summary.md', bytes: bom }]);
    materializeBundle(root, rebuilt);
    const verification = verifyBundleDirectoryV1(root, createBenchmarkValidationContextV1());
    const markdown = { name: 'markdown-bom', status: verification.valid ? 'pass' : 'reject', errorCategory: verification.valid ? undefined : 'bundle-verification-error' };
    return reject('parse', undefined, {
      variants: [
        ...(jsonResult.facts.variants as readonly JsonRecord[]),
        markdown,
      ],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function executeP11(): BenchmarkFixtureExecutionResultV1 {
  const bytes = canonicalizeJsonV1({ z: 0, a: 'ä', n: 1e-7 });
  const decoded = textDecoder.decode(bytes);
  return decoded === '{"a":"ä","n":1e-7,"z":0}'
    ? pass({ canonicalBytes: decoded, normalized: false })
    : reject('parse', 'canonical-json-mismatch', { canonicalBytes: decoded });
}

function executeP12P13(rawOptions: BenchmarkFixtureCaseOptionsV1): BenchmarkFixtureExecutionResultV1 {
  const options = rawOptions as BenchmarkFixtureCaseOptionsV1 & { readonly includeBinary?: boolean; readonly includeText?: boolean; readonly runtime?: BenchmarkCaseRuntimeV1 };
  if (options.runtime === undefined) throw new Error('Benchmark case runtime was not injected.');
  const fixture = createBundleFixture({ includeBinary: options.includeBinary, includeText: options.includeText, metricRegistry: options.runtime.metricRegistry });
  const root = mkdtempSync(join(tmpdir(), 'br01-positive-bundle-'));
  try {
    materializeBundle(root, fixture.files);
    const verification = verifyBundleDirectoryV1(root, createBenchmarkValidationContextV1({ schemaSetBytes: options.runtime.schemaSetBytes }));
    const rawArtifacts = (fixture.artifact.artifacts as JsonRecord[]).filter((entry) => entry.role === 'raw-run-json');
    const rawRunBytes = fixture.files.find((file) => file.path === 'raw/measurement-run.json')!.bytes;
    const rawDocument = parseCanonicalJsonV1(rawRunBytes) as JsonRecord;
    const rawRunCount = rawDocument.browserProcesses.flatMap((process: JsonRecord) => process.runs).length;
    const bundleRunCount = (fixture.bundle.runs as JsonRecord[]).length;
    const artifactSchemaValid = options.runtime.validateArtifactSchema(fixture.artifact);
    const bundleSchemaValid = options.runtime.validateBundleSchema(fixture.bundle);
    const expected = options.includeBinary === true && options.includeText === true
      ? rawArtifacts.length === 1 && rawRunCount === 1 && bundleRunCount === 1 && artifactSchemaValid && bundleSchemaValid && verification.valid
      : rawArtifacts.length === 1 && rawRunCount === 1 && bundleRunCount === 1 && artifactSchemaValid && bundleSchemaValid && verification.valid;
    return expected
      ? pass({ artifactCount: fixture.artifact.artifacts.length, rawArtifactCount: rawArtifacts.length, rawRunCount, bundleRunCount, artifactSchemaValid, bundleSchemaValid })
       : reject('provenance-or-bundle', 'bundle-invalid', { artifactCount: fixture.artifact.artifacts.length, rawArtifactCount: rawArtifacts.length, rawRunCount, bundleRunCount, artifactSchemaValid, bundleSchemaValid, verificationValid: verification.valid, verificationError: verification.error });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function executeP14(): BenchmarkFixtureExecutionResultV1 {
  const entries = [
    { path: 'a/2.json', bytes: new Uint8Array([2]) },
    { path: 'a.json', bytes: new Uint8Array([1]) },
    { path: 'a/deep/10.json', bytes: new Uint8Array([10]) },
    { path: 'a/deep/2.json', bytes: new Uint8Array([20]) },
  ];
  const ordered = sortCanonicalRelativePathsV1(entries).map((entry) => entry.path);
  const expected = ['a.json', 'a/2.json', 'a/deep/10.json', 'a/deep/2.json'];
  return JSON.stringify(ordered) === JSON.stringify(expected)
    && compareCanonicalRelativePathsV1('a/deep/2.json', 'a/deep/10.json') > 0
    ? pass({ ordered })
    : reject('provenance-or-bundle', 'path-order-invalid', { ordered });
}

function executeP15(rawOptions: BenchmarkFixtureCaseOptionsV1): BenchmarkFixtureExecutionResultV1 {
  const runtime = (rawOptions as BenchmarkFixtureCaseOptionsV1 & { readonly runtime?: BenchmarkCaseRuntimeV1 }).runtime;
  if (runtime === undefined) throw new Error('Benchmark case runtime was not injected.');
  const first = createBundleFixture({ includeBinary: true, includeText: true, metricRegistry: runtime.metricRegistry });
  const second = createBundleFixture({ includeBinary: true, includeText: true, metricRegistry: runtime.metricRegistry });
  const firstRoot = mkdtempSync(join(tmpdir(), 'br01-p15-first-'));
  const secondRoot = mkdtempSync(join(tmpdir(), 'br01-p15-second-'));
  try {
    materializeBundle(firstRoot, first.files);
    materializeBundle(secondRoot, second.files);
    const firstByPath = new Map(first.files.map((file) => [file.path, file.bytes]));
    const secondByPath = new Map(second.files.map((file) => [file.path, file.bytes]));
    const sameBytes = first.files.length === second.files.length
      && first.files.every((file) => bytesEqual(file.bytes, secondByPath.get(file.path)!));
    const firstDigest = parseBundleDigestV1(first.files.find((file) => file.path === 'bundle.sha256')!.bytes);
    const secondDigest = parseBundleDigestV1(second.files.find((file) => file.path === 'bundle.sha256')!.bytes);
    const firstVerification = verifyBundleDirectoryV1(firstRoot, createBenchmarkValidationContextV1());
    const secondVerification = verifyBundleDirectoryV1(secondRoot, createBenchmarkValidationContextV1());
    return sameBytes && firstDigest === secondDigest && firstVerification.valid && secondVerification.valid
      ? pass({ sameBytes, sameDigest: firstDigest === secondDigest, independentlyMaterialized: true })
      : reject('provenance-or-bundle', 'rebuild-not-deterministic', { sameBytes, sameDigest: firstDigest === secondDigest, independentlyMaterialized: firstByPath.size === secondByPath.size });
  } finally {
    rmSync(firstRoot, { recursive: true, force: true });
    rmSync(secondRoot, { recursive: true, force: true });
  }
}

function executeP17(rawOptions: BenchmarkFixtureCaseOptionsV1): BenchmarkFixtureExecutionResultV1 {
  const runtime = (rawOptions as BenchmarkFixtureCaseOptionsV1 & { readonly runtime?: BenchmarkCaseRuntimeV1 }).runtime;
  if (runtime === undefined) throw new Error('Benchmark case runtime was not injected.');
  const checks = BENCHMARK_TEST_SCENARIO_DEFINITIONS_V1.map((definition) => {
    const bytes = canonicalizeJsonV1(definition);
    const firstDigest = digestFileBytesV1(bytes);
    const secondDigest = digestFileBytesV1(canonicalizeJsonV1(definition));
    return {
      id: definition.id,
      schemaValid: runtime.validateScenarioSchema(definition),
      digestStable: firstDigest === secondDigest,
        registryDigestMatches: firstDigest === runtime.scenarioDefinitionDigests[definition.id]
        && runtime.scenarioDefinitionDigests[definition.id] === BENCHMARK_TEST_SCENARIO_DEFINITION_DIGESTS_V1[definition.id as keyof typeof BENCHMARK_TEST_SCENARIO_DEFINITION_DIGESTS_V1],
    };
  });
  return checks.length === 7 && checks.every((check) => check.schemaValid && check.digestStable && check.registryDigestMatches)
    ? pass({ scenarioCount: checks.length, checks })
    : reject('schema', 'scenario-definition-invalid', { scenarioCount: checks.length, checks });
}

const run = (options: Omit<RunCaseOptions, 'kind'>): BenchmarkFixtureCaseOptionsV1 => ({ kind: 'run', ...options });
const parse = (variants: readonly { readonly name: string; readonly input: Uint8Array | string }[]): BenchmarkFixtureCaseOptionsV1 => ({ kind: 'parse', variants });
const bundle = (variants: readonly BundleVariantOptions[]): BenchmarkFixtureCaseOptionsV1 => ({ kind: 'bundle', variants });

const expectedPass = (facts: Readonly<Record<string, unknown>> = {}): BenchmarkFixtureExpectedOutcomeV1 => ({ status: 'pass', stage: 'pass', facts });
const expectedReject = (
  stage: Exclude<BenchmarkFixtureCaseStageV1, 'pass'>,
  code: string | undefined,
  facts: Readonly<Record<string, unknown>> = {},
): BenchmarkFixtureExpectedOutcomeV1 => ({ status: 'reject', stage, ...(code === undefined ? {} : { code }), facts });

export const benchmarkPositiveFixtureCasesV1 = [
  { id: 'P01', description: 'minimal valid measurement run with one duration sample', executor: executeRunCase, options: run({ document: { samples: true }, collectFacts: (document: JsonRecord) => ({ hasDurationSample: targetSamples(document).some((sample) => sample.kind === 'duration') }) }), expected: expectedPass({ schemaValid: true, hasDurationSample: true }) },
  { id: 'P02', description: 'valid cold run with an independent process ordinal', executor: executeRunCase, options: run({ document: { phase: 'cold', container: 'cold', samples: true }, collectFacts: (document: JsonRecord) => ({ processOrdinal: targetRun(document).execution.processOrdinal, ownProcessIdentity: targetRun(document).browserProcessId === document.browserProcesses[0].browserProcessId }) }), expected: expectedPass({ schemaValid: true, processOrdinal: 0, ownProcessIdentity: true }) },
  { id: 'P03', description: 'valid warmup run marked ineligible', executor: executeRunCase, options: run({ document: { phase: 'warmup', container: 'warm-measurement', samples: false }, collectFacts: (document: JsonRecord) => ({ phase: targetRun(document).execution.phase, measurementEligibility: targetRun(document).execution.measurementEligibility }) }), expected: expectedPass({ schemaValid: true, phase: 'warmup', measurementEligibility: 'ineligible' }) },
  { id: 'P04', description: 'valid stress run with counter and liveness samples', executor: executeRunCase, options: run({ document: { scenarioId: 'scheduler-burst-v1', phase: 'stress', container: 'stress', samples: true }, context: { scenarioId: 'scheduler-burst-v1' }, collectFacts: (document: JsonRecord) => ({ hasCounterSample: targetSamples(document).some((sample) => sample.kind === 'counter'), hasLivenessSample: targetSamples(document).some((sample) => sample.kind === 'liveness') }) }), expected: expectedPass({ schemaValid: true, hasCounterSample: true, hasLivenessSample: true }) },
  { id: 'P05', description: 'valid trace run explicitly ineligible for a gate', executor: executeRunCase, options: run({ document: { phase: 'trace', container: 'trace', samples: false }, collectFacts: (document: JsonRecord) => ({ measurementEligibility: targetRun(document).execution.measurementEligibility }) }), expected: expectedPass({ schemaValid: true, measurementEligibility: 'ineligible' }) },
  { id: 'P06', description: 'valid navigation leak run', executor: executeRunCase, options: run({ document: { scenarioId: 'navigation-leak-v1', phase: 'leak', container: 'leak', samples: true }, context: { scenarioId: 'navigation-leak-v1' }, collectFacts: (document: JsonRecord) => ({ scenarioId: document.scenarioId, hasLeakMetrics: targetSamples(document).some((sample) => sample.metricRef === 'dom.document.count@1') }) }), expected: expectedPass({ schemaValid: true, scenarioId: 'navigation-leak-v1', hasLeakMetrics: true }) },
  { id: 'P07', description: 'observed WebGL2 capability without a detail field', executor: executeRunCase, options: run({ document: { samples: true }, collectFacts: (document: JsonRecord) => { const capability = document.environment.capabilities.find((entry: JsonRecord) => entry.id === 'webgl2')!; return { webgl2ObservedWithoutDetail: capability.value.status === 'observed' && !Object.prototype.hasOwnProperty.call(capability.value, 'detail') }; } }), expected: expectedPass({ schemaValid: true, webgl2ObservedWithoutDetail: true }) },
  { id: 'P08', description: 'unsupported WebGPU timestamp capability without a null sample', executor: executeRunCase, options: run({ document: { scenarioId: 'backend-fixture-v1', backend: 'raw-webgpu', samples: true, webgpuTimestamp: 'unsupported' }, context: { scenarioId: 'backend-fixture-v1' }, collectFacts: (document: JsonRecord) => { const capability = document.environment.capabilities.find((entry: JsonRecord) => entry.id === 'webgpu-timestamp-query')!; return { timestampUnsupported: capability.value.status === 'unsupported' && capability.value.value === null, gpuSampleCount: targetSamples(document).filter((sample) => sample.kind === 'gpu').length }; } }), expected: expectedPass({ schemaValid: true, timestampUnsupported: true, gpuSampleCount: 0 }) },
  { id: 'P09', description: 'invalid run with a reason and no samples', executor: executeRunCase, options: run({ document: { invalid: true, samples: false }, collectFacts: (document: JsonRecord) => ({ validity: targetRun(document).execution.validity.status, reasonCount: targetRun(document).execution.validity.reasons.length, sampleCount: targetSamples(document).length }) }), expected: expectedPass({ schemaValid: true, validity: 'invalid', reasonCount: 1, sampleCount: 0 }) },
  { id: 'P10', description: 'valid counter value zero is retained as a measurement', executor: executeRunCase, options: run({ document: { samples: true, counterZero: true }, collectFacts: (document: JsonRecord) => ({ zeroCounterCount: targetSamples(document).filter((sample) => sample.kind === 'counter' && sample.result.status === 'valid' && sample.result.value === 0).length }) }), expected: expectedPass({ schemaValid: true, zeroCounterCount: 1 }) },
  { id: 'P11', description: 'JCS Unicode is preserved without normalization', executor: executeP11, options: { kind: 'canonical-json' }, expected: expectedPass({ normalized: false }) },
  { id: 'P12', description: 'valid bundle with one raw run, telemetry export, and validation receipt', executor: executeP12P13, options: { kind: 'bundle-positive', includeBinary: false, includeText: false }, expected: expectedPass({ artifactCount: 3, rawArtifactCount: 1, rawRunCount: 1, bundleRunCount: 1, artifactSchemaValid: true, bundleSchemaValid: true }) },
  { id: 'P13', description: 'valid bundle with closure and JSON, Markdown, and PNG artifacts', executor: executeP12P13, options: { kind: 'bundle-positive', includeBinary: true, includeText: true }, expected: expectedPass({ artifactCount: 6, rawArtifactCount: 1, rawRunCount: 1, bundleRunCount: 1, artifactSchemaValid: true, bundleSchemaValid: true }) },
  { id: 'P14', description: 'canonical path ordering across multiple directory depths', executor: executeP14, options: { kind: 'path-order' }, expected: expectedPass({ ordered: ['a.json', 'a/2.json', 'a/deep/10.json', 'a/deep/2.json'] }) },
  { id: 'P15', description: 'two independently materialized identical rebuilds have identical bytes and digest', executor: executeP15, options: { kind: 'rebuild' }, expected: expectedPass({ sameBytes: true, sameDigest: true, independentlyMaterialized: true }) },
  { id: 'P16', description: 'infrastructure rerun explicitly binds replacement and approval IDs', executor: executeRunCase, options: run({ document: { samples: true, rerun: true }, collectFacts: (document: JsonRecord) => { const origin = targetRun(document).execution.origin; return { rerunKind: origin.kind, replacesRunId: origin.kind === 'infrastructure-rerun' ? origin.replacesRunId : undefined, approvalId: origin.kind === 'infrastructure-rerun' ? origin.approvalId : undefined, bindingMatches: targetRun(document).runBindingSha256 === calculateRunBindingSha256V1(targetRun(document) as never) }; } }), expected: expectedPass({ schemaValid: true, rerunKind: 'infrastructure-rerun', replacesRunId: 'previous-run', approvalId: 'approval-1', bindingMatches: true }) },
  { id: 'P17', description: 'all seven scenario definitions validate and have stable registry digests', executor: executeP17, options: { kind: 'scenario-registry' }, expected: expectedPass({ scenarioCount: 7 }) },
] as const satisfies readonly BenchmarkFixtureCaseV1<BenchmarkPositiveFixtureCaseIdV1>[];

const runMutation = (mutate: (document: JsonRecord) => void, document?: DocumentOptions, preflight?: SourcePreflightKindV1, preflightFirst = false, provenanceBoundary = false): BenchmarkFixtureCaseOptionsV1 => run({ document, mutate, preflight, preflightFirst, provenanceBoundary });
const runVariants = (variants: readonly RunVariantOptions[], preflight?: SourcePreflightKindV1): BenchmarkFixtureCaseOptionsV1 => run({ variants, preflight });

const makeBundleMutation = (name: string, mutate: (root: string) => void, includeBinary = false, includeText = false): BundleVariantOptions => ({ name, mutate, includeBinary, includeText });
const badPath = (path: string): ((root: string) => void) => (root) => rewriteJsonFile(root, 'artifact-manifest.json', (manifest) => { manifest.artifacts[0]!.path = path; });

function materializeUppercaseBundlePath(root: string): void {
  renameSync(join(root, 'raw/measurement-run.json'), join(root, 'raw/MEASUREMENT-RUN.JSON'));
}

function materializeCaseCollisionBundlePath(root: string): void {
  const upper = join(root, 'raw/MEASUREMENT-RUN.JSON');
  renameSync(join(root, 'raw/measurement-run.json'), upper);
  writeFileSync(join(root, 'raw/measurement-run.json'), readFileSync(upper));
}

function rewriteBundleDigestFraming(root: string, variant: 'missing-second-line' | 'wrong-domain' | 'uppercase-hex' | 'malformed'): void {
  const path = join(root, 'bundle.sha256');
  const digest = parseBundleDigestV1(new Uint8Array(readFileSync(path)));
  const text = variant === 'missing-second-line'
    ? `hestia-benchmark-bundle-sha256-v1 ${digest}`
    : variant === 'wrong-domain'
      ? `wrong-bundle-sha256-v1 ${digest}\n`
      : variant === 'uppercase-hex'
        ? `hestia-benchmark-bundle-sha256-v1 ${digest.toUpperCase()}\n`
        : `hestia-benchmark-bundle-sha256-v1 ${digest}\nextra\n`;
  writeFileSync(path, text);
}

export const benchmarkNegativeFixtureCasesV1 = [
  { id: 'N01', description: 'unknown schemaVersion', executor: executeRunCase, options: runMutation((document) => { document.schemaVersion = 'benchmark-v2'; }), expected: expectedReject('schema', 'schema-invalid', { schemaValid: false }) },
  { id: 'N02', description: 'unknown protocolVersion', executor: executeRunCase, options: runMutation((document) => { document.browserProcesses[0].runs.at(-1)!.protocolVersion = 'benchmark-protocol-v2'; }), expected: expectedReject('schema', 'schema-invalid', { schemaValid: false }) },
  { id: 'N03', description: 'additional top-level property', executor: executeRunCase, options: runMutation((document) => { document.extra = true; }), expected: expectedReject('schema', 'schema-invalid', { schemaValid: false }) },
  { id: 'N04', description: 'missing commitSha', executor: executeRunCase, options: runMutation((document) => { delete document.browserProcesses[0].runs.at(-1)!.source.commitSha; }), expected: expectedReject('schema', 'schema-invalid', { schemaValid: false }) },
  { id: 'N05', description: 'commit SHA with wrong length', executor: executeRunCase, options: runMutation((document) => { document.browserProcesses[0].runs.at(-1)!.source.commitSha = 'a'.repeat(39); }), expected: expectedReject('schema', 'git-sha-invalid', { schemaValid: false }) },
  { id: 'N06', description: 'uppercase commit SHA', executor: executeRunCase, options: runMutation((document) => { document.browserProcesses[0].runs.at(-1)!.source.commitSha = 'A'.repeat(40); }), expected: expectedReject('schema', 'git-sha-invalid', { schemaValid: false }) },
  { id: 'N07', description: 'dirty worktree state rejected by source preflight and contract validation', executor: executeRunCase, options: runMutation((document) => { document.browserProcesses[0].runs.at(-1)!.source.worktree.state = 'dirty'; }, undefined, 'dirty'), expected: expectedReject('schema', 'schema-invalid', { schemaValid: false, preflight: { status: 'rejected', code: 'source-dirty' } }) },
  { id: 'N08', description: 'non-empty status digest crosses the source-preflight boundary before schema rejection', executor: executeRunCase, options: runMutation((document) => { document.browserProcesses[0].runs.at(-1)!.source.worktree.statusOutputSha256 = `sha256:${'b'.repeat(64)}`; }, undefined, 'accepted'), expected: expectedReject('schema', 'schema-invalid', { schemaValid: false, preflight: { status: 'accepted' } }) },
  { id: 'N09', description: 'gitlink or gitmodules claim rejected at source preflight', executor: executeRunCase, options: runMutation((document) => { document.browserProcesses[0].runs.at(-1)!.source.worktree.submodules = ['unexpected']; }, undefined, 'gitlink', true), expected: expectedReject('provenance-or-bundle', 'infrastructure-failure', { schemaValid: false, preflight: { status: 'rejected', code: 'infrastructure-failure' } }) },
  { id: 'N10', description: 'commit tree change rejected by source preflight and malformed contract binding', executor: executeRunCase, options: runMutation((document) => { document.browserProcesses[0].runs.at(-1)!.source.commitTreeSha = `sha256:${'b'.repeat(64)}`; }, undefined, 'tree-change', true), expected: expectedReject('provenance-or-bundle', 'source-tree-mismatch', { schemaValid: false, preflight: { status: 'rejected', code: 'source-tree-mismatch' } }) },
  { id: 'N11', description: 'invalid build digest format', executor: executeRunCase, options: runMutation((document) => { document.browserProcesses[0].runs.at(-1)!.source.build.sha256 = 'not-a-sha'; }), expected: expectedReject('schema', 'digest-invalid', { schemaValid: false }) },
  { id: 'N12', description: 'zero build file count', executor: executeRunCase, options: runMutation((document) => { document.browserProcesses[0].runs.at(-1)!.source.build.fileCount = 0; }), expected: expectedReject('schema', 'integer-invalid', { schemaValid: false }) },
  { id: 'N13', description: 'missing fixture semantic digest', executor: executeRunCase, options: runMutation((document) => { delete document.browserProcesses[0].runs.at(-1)!.source.fixture.semanticSha256; }), expected: expectedReject('schema', 'schema-invalid', { schemaValid: false }) },
  { id: 'N14', description: 'fixture source digest mismatch is rejected against accepted provenance', executor: executeRunCase, options: runMutation((document) => { document.source.fixture.sourceFileSetSha256.value = `sha256:${'b'.repeat(64)}`; document.browserProcesses[0].source.fixture.sourceFileSetSha256.value = `sha256:${'b'.repeat(64)}`; document.browserProcesses[0].runs.at(-1)!.source.fixture.sourceFileSetSha256.value = `sha256:${'b'.repeat(64)}`; }, undefined, 'fixture-mismatch', true), expected: expectedReject('provenance-or-bundle', 'fixture-contract-mismatch', { schemaValid: true, preflight: { status: 'rejected', code: 'fixture-contract-mismatch' } }) },
  { id: 'N15', description: 'candidate source digest mismatch is rejected against accepted provenance', executor: executeRunCase, options: runMutation((document) => { document.source.candidate.sourceFileSetSha256.value = `sha256:${'b'.repeat(64)}`; document.browserProcesses[0].source.candidate.sourceFileSetSha256.value = `sha256:${'b'.repeat(64)}`; document.browserProcesses[0].runs.at(-1)!.source.candidate.sourceFileSetSha256.value = `sha256:${'b'.repeat(64)}`; }, undefined, 'candidate-mismatch', true), expected: expectedReject('provenance-or-bundle', 'candidate-contract-mismatch', { schemaValid: true, preflight: { status: 'rejected', code: 'candidate-contract-mismatch' } }) },
  { id: 'N16', description: 'scenario fixture differs from source fixture', executor: executeRunCase, options: runMutation((document) => { document.browserProcesses[0].runs[0].scenario.fixture.id = 'different-fixture'; }), expected: expectedReject('semantic', 'fixture-contract-mismatch', { schemaValid: true }) },
  { id: 'N17', description: 'unknown scenario ID', executor: executeRunCase, options: runMutation((document) => { document.scenarioId = 'unknown-scenario'; }), expected: expectedReject('schema', 'schema-invalid', { schemaValid: false }) },
  { id: 'N18', description: 'scenario version mismatch', executor: executeRunCase, options: runMutation((document) => { document.scenarioVersion = 2; }), expected: expectedReject('schema', 'schema-invalid', { schemaValid: false }) },
  { id: 'N19', description: 'scenario definition digest mismatch', executor: executeRunCase, options: runMutation((document) => { document.browserProcesses[0].runs.at(-1)!.scenario.definitionSha256 = `sha256:${'b'.repeat(64)}`; }), expected: expectedReject('semantic', 'scenario-contract-mismatch', { schemaValid: true }) },
  { id: 'N20', description: 'required scenario parameter missing', executor: executeRunCase, options: runMutation((document) => { document.browserProcesses[0].runs.at(-1)!.scenario.parameters.pop(); }), expected: expectedReject('semantic', 'parameter-set-mismatch', { schemaValid: true }) },
  { id: 'N21', description: 'duplicate scenario parameter', executor: executeRunCase, options: runMutation((document) => { document.browserProcesses[0].runs.at(-1)!.scenario.parameters.push({ key: 'backend', value: 'three-webgl2' }); }), expected: expectedReject('semantic', 'parameter-duplicate', { schemaValid: true }) },
  { id: 'N22', description: 'run-plan digest mismatch crosses the provenance boundary', executor: executeRunCase, options: runMutation((document) => { const runValue = document.browserProcesses[0].runs.at(-1)!; runValue.execution.runPlanSha256 = `sha256:${'b'.repeat(64)}`; runValue.runBindingSha256 = calculateRunBindingSha256V1(runValue); for (const iteration of runValue.iterations) for (const sample of iteration.samples) sample.runBindingSha256 = runValue.runBindingSha256; }, undefined, 'accepted', true, true), expected: expectedReject('provenance-or-bundle', undefined, { schemaValid: true, preflight: { status: 'accepted' }, inner: { status: 'reject', stage: 'semantic', code: 'run-plan-mismatch' } }) },
  { id: 'N23', description: 'order candidate differs from source candidate', executor: executeRunCase, options: runMutation((document) => { document.browserProcesses[0].runs.at(-1)!.execution.order.candidateId = 'other-candidate'; }), expected: expectedReject('semantic', 'candidate-contract-mismatch', { schemaValid: true }) },
  { id: 'N24', description: 'missing CPU, GPU, and browser environment fields', executor: executeRunCase, options: runVariants([
    { name: 'cpu-model', mutate: (document) => { delete document.environment.cpu.model; } },
    { name: 'gpu-device', mutate: (document) => { delete document.environment.gpu.device; } },
    { name: 'browser-version', mutate: (document) => { delete document.environment.browser.version; } },
  ]), expected: expectedReject('schema', 'environment-incomplete', { variants: [
    { name: 'cpu-model', status: 'reject', stage: 'schema', code: 'environment-incomplete', schemaValid: false },
    { name: 'gpu-device', status: 'reject', stage: 'schema', code: 'environment-incomplete', schemaValid: false },
    { name: 'browser-version', status: 'reject', stage: 'schema', code: 'environment-incomplete', schemaValid: false },
  ] }) },
  { id: 'N25', description: 'hardware field uses null, empty, and unknown sentinels', executor: executeRunCase, options: runVariants([
    { name: 'null', mutate: (document) => { document.environment.os.name.value = null; } },
    { name: 'empty', mutate: (document) => { document.environment.os.name.value = ''; } },
    { name: 'unknown', mutate: (document) => { document.environment.os.name.value = 'unknown'; } },
  ]), expected: expectedReject('schema', undefined, { variants: [
    { name: 'null', status: 'reject', stage: 'schema', code: 'schema-invalid', schemaValid: false },
     { name: 'empty', status: 'reject', stage: 'schema', code: 'availability-sentinel', schemaValid: false },
     { name: 'unknown', status: 'reject', stage: 'schema', code: 'environment-incomplete', schemaValid: false },
  ] }) },
  { id: 'N26', description: 'zero device pixel ratio and zero refresh rate', executor: executeRunCase, options: runVariants([
    { name: 'device-pixel-ratio', mutate: (document) => { document.environment.display.devicePixelRatio.value = 0; } },
    { name: 'refresh-rate', mutate: (document) => { document.environment.display.refreshHz.value = 0; } },
  ]), expected: expectedReject('schema', 'number-domain-invalid', { variants: [
    { name: 'device-pixel-ratio', status: 'reject', stage: 'schema', code: 'number-domain-invalid', schemaValid: false },
    { name: 'refresh-rate', status: 'reject', stage: 'schema', code: 'number-domain-invalid', schemaValid: false },
  ] }) },
  { id: 'N27', description: 'eligible run with hidden document', executor: executeRunCase, options: runMutation((document) => { setEnvironmentState(document, 'visibility', 'hidden'); setExecutionPageState(document, 'visibility', 'hidden'); refreshBindings(document); }, { phase: 'cold', container: 'cold', samples: true, measurementEligibility: 'eligible' }), expected: expectedReject('semantic', 'document-hidden', { schemaValid: true }) },
  { id: 'N28', description: 'eligible run without focus', executor: executeRunCase, options: runMutation((document) => { setEnvironmentState(document, 'focus', 'unfocused'); setExecutionPageState(document, 'focus', 'unfocused'); refreshBindings(document); }, { phase: 'cold', container: 'cold', samples: true, measurementEligibility: 'eligible' }), expected: expectedReject('semantic', 'document-unfocused', { schemaValid: true }) },
  { id: 'N29', description: 'eligible run with background tab', executor: executeRunCase, options: runMutation((document) => { setEnvironmentState(document, 'backgroundTabs', 1); setExecutionPageState(document, 'backgroundTabs', 1); refreshBindings(document); }, { phase: 'cold', container: 'cold', samples: true, measurementEligibility: 'eligible' }), expected: expectedReject('semantic', 'background-tabs-present', { schemaValid: true }) },
  { id: 'N30', description: 'headless performance run', executor: executeRunCase, options: runMutation((document) => { setEnvironmentState(document, 'headless', true); setEnvironmentState(document, 'gateRole', 'performance-primary'); refreshBindings(document); }, { phase: 'cold', container: 'cold', samples: true, measurementEligibility: 'eligible' }), expected: expectedReject('semantic', 'environment-incomplete', { schemaValid: true }) },
  { id: 'N31', description: 'warmup and trace runs marked eligible', executor: executeRunCase, options: runVariants([
    { name: 'warmup', document: { phase: 'warmup', container: 'warm-measurement', samples: true }, mutate: (document) => { const runValue = document.browserProcesses[0].runs.at(-1)!; runValue.execution.measurementEligibility = 'eligible'; runValue.measurementEligible = true; } },
     { name: 'trace', document: { scenarioId: 'navigation-leak-v1', phase: 'trace', container: 'trace', samples: true }, context: { scenarioId: 'navigation-leak-v1' }, mutate: (document) => { const runValue = document.browserProcesses[0].runs.at(-1)!; runValue.execution.measurementEligibility = 'eligible'; runValue.measurementEligible = true; } },
  ]), expected: expectedReject('semantic', 'measurement-ineligible', { variants: [
    { name: 'warmup', status: 'reject', stage: 'semantic', code: 'measurement-ineligible', schemaValid: true },
    { name: 'trace', status: 'reject', stage: 'semantic', code: 'measurement-ineligible', schemaValid: true },
  ] }) },
  { id: 'N32', description: 'valid eligible run without samples', executor: executeRunCase, options: runMutation((document) => { const runValue = document.browserProcesses[0].runs.at(-1)!; runValue.execution.validity = { status: 'valid' }; runValue.execution.measurementEligibility = 'eligible'; runValue.measurementEligible = true; }, { samples: false, measurementEligibility: 'eligible' }), expected: expectedReject('schema', 'sample-missing', { schemaValid: false }) },
  { id: 'N33', description: 'invalid run without a reason', executor: executeRunCase, options: runMutation((document) => { delete document.browserProcesses[0].runs.at(-1)!.execution.validity.reasons; }, { invalid: true, samples: true }), expected: expectedReject('schema', 'schema-invalid', { schemaValid: false }) },
  { id: 'N34', description: 'valid sample without a value', executor: executeRunCase, options: runMutation((document) => { delete document.browserProcesses[0].runs.at(-1)!.iterations[0].samples[0].result.value; }, { samples: true }), expected: expectedReject('schema', 'schema-invalid', { schemaValid: false }) },
  { id: 'N35', description: 'invalid sample with a value and no reason', executor: executeRunCase, options: runMutation((document) => { document.browserProcesses[0].runs.at(-1)!.iterations[0].samples[0].result = { status: 'invalid', value: 1 }; }, { samples: true }), expected: expectedReject('schema', 'schema-invalid', { schemaValid: false }) },
  { id: 'N36', description: 'negative, NaN, Infinity, and negative-zero duration fixture files', executor: executeRunCase, options: runVariants([
    { name: 'negative', fixturePath: 'n36-negative-duration.json', mutate: mutateN36Fixture, document: { samples: true } },
    { name: 'NaN', fixturePath: 'n36-nan.json', mutate: mutateN36Fixture, document: { samples: true } },
    { name: 'Infinity', fixturePath: 'n36-infinity.json', mutate: mutateN36Fixture, document: { samples: true } },
    { name: 'negative-zero', fixturePath: 'n36-negative-zero.json', mutate: mutateN36Fixture, document: { samples: true } },
  ]), expected: expectedReject('semantic', 'sample-invalid', { variants: [
    { name: 'negative', fixtureId: 'n36-negative-duration-v1', fixtureVariant: 'negative', status: 'reject', stage: 'semantic', code: 'sample-invalid', schemaValid: true },
    { name: 'NaN', fixtureId: 'n36-nan-v1', fixtureVariant: 'NaN', status: 'reject', stage: 'semantic', code: 'sample-invalid', schemaValid: false },
    { name: 'Infinity', fixtureId: 'n36-infinity-v1', fixtureVariant: 'Infinity', status: 'reject', stage: 'semantic', code: 'sample-invalid', schemaValid: false },
    { name: 'negative-zero', fixtureId: 'n36-negative-zero-v1', fixtureVariant: 'negative-zero', status: 'reject', stage: 'semantic', code: 'sample-invalid', schemaValid: true },
  ] }) },
  { id: 'N37', description: 'duration with bytes unit', executor: executeRunCase, options: runMutation((document) => { document.browserProcesses[0].runs.at(-1)!.iterations[0].samples[0].unit = 'bytes'; }, { samples: true }), expected: expectedReject('semantic', 'metric-unit-mismatch', { schemaValid: true }) },
  { id: 'N38', description: 'duplicate sample identifier', executor: executeRunCase, options: runMutation((document) => { const samples = document.browserProcesses[0].runs.at(-1)!.iterations[0].samples; samples[1].sampleId = samples[0].sampleId; }, { samples: true }), expected: expectedReject('semantic', 'duplicate-id', { schemaValid: true }) },
  { id: 'N39', description: 'sample ordinal gap', executor: executeRunCase, options: runMutation((document) => { document.browserProcesses[0].runs.at(-1)!.iterations[0].samples[1].ordinal = 9999; }, { samples: true }), expected: expectedReject('semantic', 'ordinal-order-invalid', { schemaValid: true }) },
  { id: 'N40', description: 'sample run binding differs from top-level binding', executor: executeRunCase, options: runMutation((document) => { document.browserProcesses[0].runs.at(-1)!.iterations[0].samples[0].runBindingSha256 = `sha256:${'c'.repeat(64)}`; }, { samples: true }), expected: expectedReject('semantic', 'run-binding-mismatch', { schemaValid: true }) },
  { id: 'N41', description: 'changed run metadata with unchanged samples', executor: executeRunCase, options: runMutation((document) => { document.browserProcesses[0].runs.at(-1)!.createdUtc = '2026-08-13T12:00:01.000Z'; }, { samples: true }), expected: expectedReject('semantic', 'run-binding-mismatch', { schemaValid: true }) },
  { id: 'N42', description: 'duplicate JSON key', executor: executeParseCase, options: parse([{ name: 'duplicate-key', input: '{"a":1,"a":2}' }]), expected: expectedReject('parse', undefined, { variants: [{ name: 'duplicate-key', status: 'reject', errorKind: 'CanonicalJsonError' }] }) },
  { id: 'N43', description: 'pretty and whitespace JSON', executor: executeParseCase, options: parse([{ name: 'space', input: '{"a": 1}' }, { name: 'pretty', input: '{\n}' }]), expected: expectedReject('parse', undefined, { variants: [{ name: 'space', status: 'reject', errorKind: 'CanonicalJsonError' }, { name: 'pretty', status: 'reject', errorKind: 'CanonicalJsonError' }] }) },
  { id: 'N44', description: 'UTF-8 BOM in JSON and Markdown boundaries', executor: executeBomCase, options: { kind: 'bom' }, expected: expectedReject('parse', undefined, { variants: [{ name: 'json-bom', status: 'reject', errorKind: 'CanonicalJsonError' }, { name: 'markdown-bom', status: 'reject', errorCategory: 'bundle-verification-error' }] }) },
  { id: 'N45', description: 'CRLF, missing final LF, and double final LF Markdown variants', executor: executeBundleCase, options: bundle([
    makeBundleMutation('crlf', (root) => rewriteTextArtifact(root, new Uint8Array([35, 32, 115, 117, 109, 109, 97, 114, 121, 13, 10])), false, true),
    makeBundleMutation('missing-final-lf', (root) => rewriteTextArtifact(root, textEncoder.encode('# summary')), false, true),
    makeBundleMutation('double-final-lf', (root) => rewriteTextArtifact(root, textEncoder.encode('# summary\n\n')), false, true),
  ]), expected: expectedReject('provenance-or-bundle', undefined, { variants: [
    { name: 'crlf', status: 'reject', errorCategory: 'bundle-verification-error' },
    { name: 'missing-final-lf', status: 'reject', errorCategory: 'bundle-verification-error' },
    { name: 'double-final-lf', status: 'reject', errorCategory: 'bundle-verification-error' },
  ] }) },
  { id: 'N46', description: 'absolute artifact path', executor: executeBundleCase, options: bundle([makeBundleMutation('absolute', badPath('/raw/measurement-run.json'))]), expected: expectedReject('provenance-or-bundle', undefined, { variants: [{ name: 'absolute', status: 'reject', errorCategory: 'bundle-verification-error' }] }) },
  { id: 'N47', description: 'all named traversal, dot, duplicate-slash, backslash, and drive-prefix paths', executor: executeBundleCase, options: bundle([
    makeBundleMutation('parent', badPath('../raw/measurement-run.json')),
    makeBundleMutation('dot', badPath('./raw/measurement-run.json')),
    makeBundleMutation('duplicate-slash', badPath('raw//measurement-run.json')),
    makeBundleMutation('backslash', badPath('raw\\measurement-run.json')),
    makeBundleMutation('drive-prefix', badPath('C:/raw/measurement-run.json')),
  ]), expected: expectedReject('provenance-or-bundle', undefined, { variants: [
    { name: 'parent', status: 'reject', errorCategory: 'bundle-verification-error' },
    { name: 'dot', status: 'reject', errorCategory: 'bundle-verification-error' },
    { name: 'duplicate-slash', status: 'reject', errorCategory: 'bundle-verification-error' },
    { name: 'backslash', status: 'reject', errorCategory: 'bundle-verification-error' },
    { name: 'drive-prefix', status: 'reject', errorCategory: 'bundle-verification-error' },
  ] }) },
  { id: 'N48', description: 'uppercase path and case-collision path forms', executor: executeBundleCase, options: bundle([
    makeBundleMutation('uppercase', materializeUppercaseBundlePath),
    makeBundleMutation('case-collision', materializeCaseCollisionBundlePath),
  ]), expected: expectedReject('provenance-or-bundle', undefined, { variants: [
    { name: 'uppercase', status: 'reject', errorCategory: 'bundle-verification-error' },
    { name: 'case-collision', status: 'reject', errorCategory: 'bundle-verification-error' },
  ] }) },
  { id: 'N49', description: 'duplicate artifact path', executor: executeBundleCase, options: bundle([makeBundleMutation('duplicate', (root) => rewriteJsonFile(root, 'artifact-manifest.json', (manifest) => { manifest.artifacts.push({ ...manifest.artifacts[0] }); }))]), expected: expectedReject('provenance-or-bundle', undefined, { variants: [{ name: 'duplicate', status: 'reject', errorCategory: 'bundle-verification-error' }] }) },
  { id: 'N50', description: 'manifest lists itself or bundle.sha256', executor: executeBundleCase, options: bundle([
    makeBundleMutation('artifact-manifest', badPath('artifact-manifest.json')),
    makeBundleMutation('bundle-digest', badPath('bundle.sha256')),
  ]), expected: expectedReject('provenance-or-bundle', undefined, { variants: [
    { name: 'artifact-manifest', status: 'reject', errorCategory: 'bundle-verification-error' },
    { name: 'bundle-digest', status: 'reject', errorCategory: 'bundle-verification-error' },
  ] }) },
  { id: 'N51', description: 'manifested file missing', executor: executeBundleCase, options: bundle([makeBundleMutation('missing', (root) => unlinkSync(join(root, 'raw/measurement-run.json')))]), expected: expectedReject('provenance-or-bundle', undefined, { variants: [{ name: 'missing', status: 'reject', errorCategory: 'bundle-verification-error' }] }) },
  { id: 'N52', description: 'unmanifested file present', executor: executeBundleCase, options: bundle([makeBundleMutation('extra', (root) => writeFileSync(join(root, 'raw/extra.bin'), new Uint8Array([1])))]), expected: expectedReject('provenance-or-bundle', undefined, { variants: [{ name: 'extra', status: 'reject', errorCategory: 'bundle-verification-error' }] }) },
  { id: 'N53', description: 'bound artifact byteLength mismatch reaches per-file verification', executor: executeBundleCase, options: bundle([makeBundleMutation('byte-length', (root) => rewriteArtifactManifestAndBindings(root, (manifest) => { manifest.artifacts[0]!.byteLength += 1; }, true))]), expected: expectedReject('provenance-or-bundle', undefined, { variants: [{ name: 'byte-length', status: 'reject', errorCategory: 'bundle-verification-error' }] }) },
  { id: 'N54', description: 'bound artifact digest mismatch reaches per-file verification', executor: executeBundleCase, options: bundle([makeBundleMutation('file-digest', (root) => rewriteArtifactManifestAndBindings(root, (manifest) => { manifest.artifacts[0]!.sha256 = `sha256:${'b'.repeat(64)}`; }, true))]), expected: expectedReject('provenance-or-bundle', undefined, { variants: [{ name: 'file-digest', status: 'reject', errorCategory: 'bundle-verification-error' }] }) },
  { id: 'N55', description: 'artifact role, path, extension, and media mismatch variants remain fully bound', executor: executeBundleCase, options: bundle([
    makeBundleMutation('summary-markdown-log', (root) => {
      renameSync(join(root, 'summary/summary.md'), join(root, 'summary/summary.log'));
      rewriteArtifactManifestAndBindings(root, (manifest) => { const entry = (manifest.artifacts as JsonRecord[]).find((candidate) => candidate.path === 'summary/summary.md')!; entry.path = 'summary/summary.log'; }, true);
    }, false, true),
    makeBundleMutation('failure-log-md', (root) => rewriteArtifactManifestAndBindings(root, (manifest) => { const entry = (manifest.artifacts as JsonRecord[]).find((candidate) => candidate.path === 'summary/summary.md')!; entry.role = 'failure-log'; entry.mediaType = 'text/plain'; }, true), false, true),
    ...(['trace'] as const).flatMap((role) => [
      makeBundleMutation(`${role}-wrong-extension`, (root) => mutateBinaryArtifactRole(root, role, 'extension'), true),
      makeBundleMutation(`${role}-wrong-media-type`, (root) => mutateBinaryArtifactRole(root, role, 'media-type'), true),
    ]),
    makeBundleMutation('trace-wrong-location', (root) => mutateBinaryArtifactRole(root, 'trace', 'location'), true),
    makeBundleMutation('trace-wrong-name', (root) => mutateBinaryArtifactRole(root, 'trace', 'name'), true),
    makeBundleMutation('trace-raw-wrong-location-name', (root) => mutateBinaryArtifactRole(root, 'trace', 'raw-location-name'), true),
  ]), expected: expectedReject('provenance-or-bundle', undefined, { variants: [
    { name: 'summary-markdown-log', status: 'reject', errorCategory: 'bundle-verification-error' },
    { name: 'failure-log-md', status: 'reject', errorCategory: 'bundle-verification-error' },
    ...(['trace'] as const).flatMap((role) => [
      { name: `${role}-wrong-extension`, status: 'reject', errorCategory: 'bundle-verification-error' },
      { name: `${role}-wrong-media-type`, status: 'reject', errorCategory: 'bundle-verification-error' },
    ]),
    { name: 'trace-wrong-location', status: 'reject', errorCategory: 'bundle-verification-error' },
    { name: 'trace-wrong-name', status: 'reject', errorCategory: 'bundle-verification-error' },
    { name: 'trace-raw-wrong-location-name', status: 'reject', errorCategory: 'bundle-verification-error' },
  ] }) },
  { id: 'N56', description: 'genuine symlink child rejected, with explicit unsupported-platform outcome when creation is unavailable', executor: executeBundleCase, options: { kind: 'bundle-symlink', variants: [makeBundleMutation('symlink', (root) => symlinkSync('measurement-run.json', join(root, 'raw', 'link'), 'file'))] }, expected: expectedReject('provenance-or-bundle', undefined, { variantCount: 1, securityBoundary: 'symlink-or-unsupported-platform' }) },
  { id: 'N57', description: 'invalid bundle.sha256 framing variants', executor: executeBundleCase, options: bundle([
    makeBundleMutation('missing-second-line', (root) => rewriteBundleDigestFraming(root, 'missing-second-line')),
    makeBundleMutation('wrong-domain', (root) => rewriteBundleDigestFraming(root, 'wrong-domain')),
    makeBundleMutation('uppercase-hex', (root) => rewriteBundleDigestFraming(root, 'uppercase-hex')),
    makeBundleMutation('malformed', (root) => rewriteBundleDigestFraming(root, 'malformed')),
  ]), expected: expectedReject('provenance-or-bundle', undefined, { variants: [
    { name: 'missing-second-line', status: 'reject', errorCategory: 'bundle-verification-error' },
    { name: 'wrong-domain', status: 'reject', errorCategory: 'bundle-verification-error' },
    { name: 'uppercase-hex', status: 'reject', errorCategory: 'bundle-verification-error' },
    { name: 'malformed', status: 'reject', errorCategory: 'bundle-verification-error' },
  ] }) },
  { id: 'N58', description: 'raw JSON byte tampering after upstream per-file rebinding', executor: executeBundleCase, options: bundle([makeBundleMutation('raw-tamper', (root) => { writeFileSync(join(root, 'raw/measurement-run.json'), new Uint8Array([0])); rebindArtifactFile(root, 'raw/measurement-run.json', false); })]), expected: expectedReject('provenance-or-bundle', undefined, { variants: [{ name: 'raw-tamper', status: 'reject', errorCategory: 'bundle-verification-error' }] }) },
  { id: 'N59', description: 'binary artifact tampering reaches bundle digest after upstream rebinding', executor: executeBundleCase, options: bundle([makeBundleMutation('binary-tamper', (root) => { writeFileSync(join(root, 'artifacts/capture.png'), new Uint8Array([9, 9, 9])); rebindArtifactFile(root, 'artifacts/capture.png', false); }, true)]), expected: expectedReject('provenance-or-bundle', undefined, { variants: [{ name: 'binary-tamper', status: 'reject', errorCategory: 'bundle-verification-error' }] }) },
  { id: 'N60', description: 'bundle timestamp changed after build', executor: executeBundleCase, options: bundle([makeBundleMutation('timestamp', (root) => rewriteJsonFile(root, 'bundle-manifest.json', (manifest) => { manifest.createdUtc = '2026-08-13T12:00:01.000Z'; }))]), expected: expectedReject('provenance-or-bundle', undefined, { variants: [{ name: 'timestamp', status: 'reject', errorCategory: 'bundle-verification-error' }] }) },
  { id: 'N61', description: 'scenario parameter outside registry domain', executor: executeRunCase, options: runMutation((document) => { const parameter = document.browserProcesses[0].runs.at(-1)!.scenario.parameters.find((entry: JsonRecord) => entry.key === 'seed')!; parameter.value = 0x1_0000_0000; }), expected: expectedReject('semantic', 'parameter-domain-invalid', { schemaValid: true }) },
  { id: 'N62', description: 'runtime state and execution page state differ', executor: executeRunCase, options: runMutation((document) => { document.browserProcesses[0].runs[0].execution.pageState.visibility = 'hidden'; }), expected: expectedReject('semantic', 'runtime-state-mismatch', { schemaValid: true }) },
  { id: 'N63', description: 'eligible run with documented competing load', executor: executeRunCase, options: runMutation((document) => { setEnvironmentState(document, 'competingLoad', { status: 'documented', detail: 'load' }); refreshBindings(document); }, { phase: 'cold', container: 'cold', samples: true, measurementEligibility: 'eligible' }), expected: expectedReject('semantic', 'environment-incomplete', { schemaValid: true }) },
  { id: 'N64', description: 'eligible performance run with unobservable thermal state', executor: executeRunCase, options: runMutation((document) => { setEnvironmentState(document, 'thermalState', 'not-observable'); refreshBindings(document); }, { phase: 'cold', container: 'cold', samples: true, measurementEligibility: 'eligible' }), expected: expectedReject('semantic', 'environment-incomplete', { schemaValid: true }) },
  { id: 'N65', description: 'required metric missing, wrong kind, and wrong unit', executor: executeRunCase, options: runVariants([
     { name: 'missing', mutate: (document) => { document.browserProcesses[0].runs.at(-1)!.iterations[0].samples.pop(); }, document: { samples: true, measurementEligibility: 'eligible' } },
     { name: 'wrong-kind', mutate: (document) => { document.browserProcesses[0].runs.at(-1)!.iterations[0].samples[0].kind = 'counter'; }, document: { samples: true, measurementEligibility: 'eligible' } },
     { name: 'wrong-unit', mutate: (document) => { document.browserProcesses[0].runs.at(-1)!.iterations[0].samples[0].unit = 'bytes'; }, document: { samples: true, measurementEligibility: 'eligible' } },
  ]), expected: expectedReject('semantic', undefined, { variants: [
     { name: 'missing', status: 'reject', stage: 'semantic', code: 'metric-not-producible', schemaValid: true },
    { name: 'wrong-kind', status: 'reject', stage: 'semantic', code: 'metric-unit-mismatch', schemaValid: true },
    { name: 'wrong-unit', status: 'reject', stage: 'semantic', code: 'metric-unit-mismatch', schemaValid: true },
  ] }) },
   { id: 'N66', description: 'supported conditional GPU metric is missing behind an unbound fixture', executor: executeRunCase, options: { ...runMutation((document) => { setCapabilityObserved(document, 'webgpu-timestamp-query'); refreshBindings(document); }, { scenarioId: 'backend-fixture-v1', backend: 'raw-webgpu', samples: true, webgpuTimestamp: 'unsupported', measurementEligibility: 'eligible' }), context: { scenarioId: 'backend-fixture-v1' } }, expected: expectedReject('semantic', 'fixture-contract-mismatch', { schemaValid: true }) },
  { id: 'N67', description: 'canonical path ends with a slash', executor: executeBundleCase, options: bundle([makeBundleMutation('trailing-slash', badPath('raw/'))]), expected: expectedReject('provenance-or-bundle', undefined, { variants: [{ name: 'trailing-slash', status: 'reject', errorCategory: 'bundle-verification-error' }] }) },
  { id: 'N68', description: 'unpaired UTF-16 surrogate in a key and a value', executor: executeParseCase, options: parse([
    { name: 'key', input: new Uint8Array([123, 34, 92, 117, 100, 56, 48, 48, 34, 58, 49, 125]) },
    { name: 'value', input: new Uint8Array([123, 34, 97, 34, 58, 34, 92, 117, 100, 56, 48, 48, 34, 125]) },
  ]), expected: expectedReject('parse', undefined, { variants: [{ name: 'key', status: 'reject', errorKind: 'CanonicalJsonError' }, { name: 'value', status: 'reject', errorKind: 'CanonicalJsonError' }] }) },
] as const satisfies readonly BenchmarkFixtureCaseV1<BenchmarkNegativeFixtureCaseIdV1>[];

function rewriteTextArtifact(root: string, bytes: Uint8Array): void {
  const artifact = parseCanonicalJsonV1(new Uint8Array(readFileSync(join(root, 'artifact-manifest.json')))) as JsonRecord;
  const bundle = parseCanonicalJsonV1(new Uint8Array(readFileSync(join(root, 'bundle-manifest.json')))) as JsonRecord;
  const artifacts = materializedBundleFiles(root).filter((file) => !['artifact-manifest.json', 'bundle-manifest.json', 'bundle.sha256', 'summary/summary.md'].includes(file.path));
  const entry = (artifact.artifacts as JsonRecord[]).find((candidate) => candidate.path === 'summary/summary.md')!;
  entry.byteLength = bytes.byteLength;
  entry.sha256 = digestFileBytesV1(bytes);
  const artifactBytes = canonicalizeJsonV1(artifact);
  bundle.artifactManifest = { path: 'artifact-manifest.json', byteLength: artifactBytes.byteLength, sha256: digestFileBytesV1(artifactBytes) };
  const rebuilt = buildBundleFilesV1(artifact as never, bundle as never, [...artifacts, { path: 'summary/summary.md', bytes }]);
  for (const file of rebuilt) {
    const target = join(root, ...file.path.split('/'));
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, file.bytes);
  }
}

function environmentRecords(document: JsonRecord): JsonRecord[] {
  return [
    document.environment,
    document.browserProcesses[0].environment,
    ...document.browserProcesses[0].runs.map((runValue: JsonRecord) => runValue.environment),
  ];
}

function setEnvironmentState(document: JsonRecord, field: string, value: unknown): void {
  for (const environment of environmentRecords(document)) {
    const availability = field === 'headless' ? environment.browser.headless
      : field === 'gateRole' ? environment.gateRole
        : environment.runtimeState[field];
    availability.value = value;
  }
  const reasonCode = field === 'visibility' ? 'document-hidden'
    : field === 'focus' ? 'document-unfocused'
      : field === 'backgroundTabs' ? 'background-tabs-present'
        : field === 'thermalState' ? (value === 'throttled' ? 'thermal-throttling' : 'environment-incomplete')
          : 'environment-incomplete';
  const runValue = document.browserProcesses[0].runs.at(-1) as JsonRecord;
  if (runValue.execution.phase === 'cold' || runValue.execution.phase === 'measurement' || runValue.execution.phase === 'stress') {
    runValue.measurementEligibilityReasons = [{ code: reasonCode, detail: 'eligibility gate', phase: runValue.execution.phase }];
    document.measurementEligibilityReasons = [{ code: reasonCode, detail: 'eligibility gate', phase: runValue.execution.phase }];
    document.measurementEligible = false;
  }
}

function setExecutionPageState(document: JsonRecord, field: string, value: unknown): void {
  for (const runValue of document.browserProcesses[0].runs as JsonRecord[]) runValue.execution.pageState[field] = value;
}

function setCapabilityObserved(document: JsonRecord, capabilityId: string): void {
  for (const environment of environmentRecords(document)) {
    const capability = environment.capabilities.find((entry: JsonRecord) => entry.id === capabilityId);
    if (capability !== undefined) capability.value = { status: 'observed', value: true, sourceRef: 'capture-v1', stability: 'stable' };
  }
}

function refreshBindings(document: JsonRecord): void {
  for (const runValue of document.browserProcesses[0].runs as JsonRecord[]) {
    runValue.runBindingSha256 = calculateRunBindingSha256V1(runValue as never);
    for (const iteration of runValue.iterations as JsonRecord[]) {
      for (const sample of iteration.samples as JsonRecord[]) sample.runBindingSha256 = runValue.runBindingSha256;
    }
  }
}

function buildFixtureCaseMap<T extends BenchmarkFixtureCaseV1>(cases: readonly T[]): Readonly<Record<string, T>> {
  return Object.fromEntries(cases.map((entry) => [entry.id, entry])) as Readonly<Record<string, T>>;
}

export const benchmarkPositiveFixtureCasesByIdV1 = buildFixtureCaseMap(benchmarkPositiveFixtureCasesV1);
export const benchmarkNegativeFixtureCasesByIdV1 = buildFixtureCaseMap(benchmarkNegativeFixtureCasesV1);

// Keep the ID literals in the catalog so manifests and coverage can cross-check this single executable source.
export const benchmarkPositiveFixtureCaseIdsV1 = positiveCaseIds;
export const benchmarkNegativeFixtureCaseIdsV1 = negativeCaseIds;

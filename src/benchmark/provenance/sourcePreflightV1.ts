import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, lstatSync, mkdtempSync, openSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import type {
  AvailabilityV1,
  BenchmarkBuildBindingV1,
  BenchmarkBuildHandoffMetadataV1,
  BenchmarkCandidateBindingV1,
  BenchmarkFixtureContractBindingV1,
  BenchmarkSourcePreflightFailureCodeV1,
  BenchmarkSourceProvenanceV1,
  CanonicalIdV1,
  GitShaV1,
  NonEmptyReadonlyArray,
  NonEmptyString,
  RepositoryRelativePathV1,
  SafePositiveIntegerV1,
  Sha256DigestV1,
} from '../contracts/typesV1';
import {
  BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1,
  BENCHMARK_REPOSITORY_URL,
  BENCHMARK_STATUS_COMMAND,
  EMPTY_STATUS_SHA256,
} from '../contracts/versions';
import {
  BENCHMARK_SOURCE_FIXTURE_BINDINGS_V1,
  BENCHMARK_WP04_SEMANTIC_SHA256_V1,
  isBenchmarkWp04SemanticBytesV1,
} from '../contracts/scenarioRegistryV1';
import {
  digestFileSetReadersV1,
  digestFileSetPathsV1,
  enumerateFileSetDirectoryV1,
  sha256BytesV1,
  timingSafeEqualSha256V1,
  type FileSetPathInputV1,
  type FileSetReaderEntryInputV1,
} from './fileSetDigestV1';
import { compareRepositoryRelativePathsV1, repositoryRelativePathV1 } from './canonicalPathV1';
import { parseCanonicalJsonV1 } from './canonicalJsonV1';

export interface SourcePreflightCommandResultV1 {
  readonly status: number | null;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
  readonly error?: Error;
  readonly signal?: NodeJS.Signals | null;
}

export type SourcePreflightCommandRunnerV1 = (
  command: string,
  args: readonly string[],
  cwd: string,
) => SourcePreflightCommandResultV1;

export interface SourcePreflightInputV1 {
  readonly rootPath: string;
  readonly expectedSourceCommitSha: string;
  readonly fixtureSemanticBytes: Uint8Array;
  readonly fixture: BenchmarkFixtureContractBindingV1;
  readonly candidate: BenchmarkCandidateBindingV1;
  readonly build?: BenchmarkBuildBindingV1;
  readonly runCommand?: SourcePreflightCommandRunnerV1;
}

export interface BenchmarkBuildHandoffV1 extends BenchmarkBuildHandoffMetadataV1 {
  readonly rootIdentity: {
    readonly repositoryRootPath: string;
    readonly buildRootPath: string;
  };
  readonly expected: BenchmarkBuildBindingV1;
}

export type BuildHandoffVerificationResultV1 =
  | { readonly status: 'verified'; readonly build: BenchmarkBuildBindingV1 }
  | {
      readonly status: 'rejected';
      readonly code: Extract<BenchmarkSourcePreflightFailureCodeV1, 'build-digest-mismatch' | 'infrastructure-failure'>;
      readonly detail: NonEmptyString;
    };

type BuildHandoffFailureCodeV1 = Extract<BenchmarkSourcePreflightFailureCodeV1, 'build-digest-mismatch' | 'infrastructure-failure'>;

export type SourcePreflightResultV1 =
  | { readonly status: 'accepted'; readonly provenance: BenchmarkSourceProvenanceV1; readonly buildHandoff: BenchmarkBuildHandoffV1 }
  | {
      readonly status: 'rejected';
      readonly code: BenchmarkSourcePreflightFailureCodeV1;
      readonly detail: NonEmptyString;
    };

const defaultRunner: SourcePreflightCommandRunnerV1 = (command, args, cwd) => {
  const result = spawnSync(command, [...args], {
    cwd,
    encoding: 'buffer',
    shell: false,
    windowsHide: true,
    timeout: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.gitCommandTimeoutMs,
    maxBuffer: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.commandOutputMaxBytes,
  });
  return {
    status: result.status,
    stdout: result.stdout instanceof Uint8Array ? new Uint8Array(result.stdout) : new Uint8Array(),
    stderr: result.stderr instanceof Uint8Array ? new Uint8Array(result.stderr) : new Uint8Array(),
    error: result.error,
    signal: result.signal,
  };
};

const emptyStatusDigest = sha256BytesV1(new Uint8Array());
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const SHA_PATTERN = /^sha256:[0-9a-f]{64}$/;
const UNAVAILABLE_STATUSES = ['unknown', 'unsupported', 'not-requested', 'not-active', 'permission-denied', 'blocked', 'error'] as const;

class SourcePreflightContractError extends Error {
  public constructor(
    public readonly code: BenchmarkSourcePreflightFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'SourcePreflightContractError';
  }
}

class SourcePreflightInfrastructureError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'SourcePreflightInfrastructureError';
  }
}

function reject(code: BenchmarkSourcePreflightFailureCodeV1, detail: string): SourcePreflightResultV1 {
  return { status: 'rejected', code, detail: detail as NonEmptyString };
}

function commandResult(
  runner: SourcePreflightCommandRunnerV1,
  command: string,
  args: readonly string[],
  cwd: string,
): SourcePreflightCommandResultV1 {
  let result: SourcePreflightCommandResultV1;
  try {
    result = runner(command, args, cwd);
  } catch (error) {
    throw new SourcePreflightInfrastructureError(error instanceof Error ? error.message : 'Git command failed.');
  }
  if (!(result.stdout instanceof Uint8Array) || !(result.stderr instanceof Uint8Array)) {
    throw new SourcePreflightInfrastructureError('Git command returned invalid output buffers.');
  }
  const maxOutput = BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.commandOutputMaxBytes;
  if (result.stdout.byteLength > maxOutput || result.stderr.byteLength > maxOutput || result.stdout.byteLength + result.stderr.byteLength > maxOutput) {
    throw new SourcePreflightInfrastructureError('Git command output exceeded the v1 bound.');
  }
  if (result.error !== undefined || (result.signal !== undefined && result.signal !== null) || result.status !== 0 || result.stderr.byteLength !== 0) {
    throw new SourcePreflightInfrastructureError('Git command failed.');
  }
  return result;
}

function commandText(result: SourcePreflightCommandResultV1): string | undefined {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(result.stdout);
    if (!text.endsWith('\n') || text.length <= 1 || text.slice(0, -1).includes('\n')) return undefined;
    return text.slice(0, -1);
  } catch {
    return undefined;
  }
}

function exactCommandText(result: SourcePreflightCommandResultV1): string | undefined {
  if (result.stdout.byteLength !== 41) return undefined;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(result.stdout);
    if (!text.endsWith('\n')) return undefined;
    const value = text.slice(0, -1);
    return /^[0-9a-f]{40}$/.test(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function safePositiveInteger(value: number, label: string): SafePositiveIntegerV1 {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} is outside the safe positive integer domain.`);
  return value as SafePositiveIntegerV1;
}

function metadataObject(value: unknown, label: string, code: BenchmarkSourcePreflightFailureCodeV1): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new SourcePreflightContractError(code, `${label} must be an object.`);
  return value as Record<string, unknown>;
}

function metadataClosed(value: unknown, keys: readonly string[], label: string, code: BenchmarkSourcePreflightFailureCodeV1): Record<string, unknown> {
  const result = metadataObject(value, label, code);
  const allowed = new Set(keys);
  if (Object.keys(result).length !== keys.length || Object.keys(result).some((key) => !allowed.has(key))) {
    throw new SourcePreflightContractError(code, `${label} has missing or unexpected fields.`);
  }
  return result;
}

function metadataId(value: unknown, label: string, code: BenchmarkSourcePreflightFailureCodeV1): CanonicalIdV1 {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new SourcePreflightContractError(code, `${label} is not a canonical ID.`);
  return value as CanonicalIdV1;
}

function metadataVersion(value: unknown, label: string, code: BenchmarkSourcePreflightFailureCodeV1): SafePositiveIntegerV1 {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new SourcePreflightContractError(code, `${label} is not a positive safe integer.`);
  return value as SafePositiveIntegerV1;
}

function metadataDigest(value: unknown, label: string, code: BenchmarkSourcePreflightFailureCodeV1): Sha256DigestV1 {
  if (typeof value !== 'string' || !SHA_PATTERN.test(value)) throw new SourcePreflightContractError(code, `${label} is not a canonical SHA-256 digest.`);
  return value as Sha256DigestV1;
}

function metadataGitSha(value: unknown, label: string, code: BenchmarkSourcePreflightFailureCodeV1): GitShaV1 {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) throw new SourcePreflightContractError(code, `${label} is not a canonical Git SHA.`);
  return value as GitShaV1;
}

function metadataAvailabilityShape<T>(
  value: unknown,
  label: string,
  code: BenchmarkSourcePreflightFailureCodeV1,
  validateValue: (value: unknown) => T,
): AvailabilityV1<T> {
  const binding = metadataObject(value, label, code);
  if (binding.status === 'observed' || binding.status === 'declared') {
    const branch = metadataClosed(binding, ['status', 'value', 'sourceRef', 'stability'], label, code);
    const sourceRef = metadataId(branch.sourceRef, `${label} sourceRef`, code);
    if (typeof branch.stability !== 'string') throw new SourcePreflightContractError(code, `${label} stability is invalid.`);
    const allowedStability = branch.status === 'observed'
      ? ['stable', 'experimental', 'platform-specific']
      : ['owner-binding', 'run-config', 'browser-default'];
    if (!allowedStability.includes(branch.stability)) throw new SourcePreflightContractError(code, `${label} stability is invalid for its status.`);
    return {
      status: branch.status,
      value: validateValue(branch.value),
      sourceRef,
      stability: branch.stability,
    } as AvailabilityV1<T>;
  }
  if (typeof binding.status === 'string' && (UNAVAILABLE_STATUSES as readonly string[]).includes(binding.status)) {
    const branch = metadataClosed(binding, ['status', 'value', 'sourceRef', 'reasonCode'], label, code);
    if (branch.value !== null) throw new SourcePreflightContractError(code, `${label} unavailable branch must carry value:null.`);
    return {
      status: binding.status as Exclude<AvailabilityV1<T>['status'], 'observed' | 'declared'>,
      value: null,
      sourceRef: metadataId(branch.sourceRef, `${label} sourceRef`, code),
      reasonCode: metadataId(branch.reasonCode, `${label} reasonCode`, code),
    } as AvailabilityV1<T>;
  }
  throw new SourcePreflightContractError(code, `${label} has an invalid availability status.`);
}

function metadataBinding<T>(
  value: unknown,
  label: string,
  code: BenchmarkSourcePreflightFailureCodeV1,
  validateValue: (value: unknown) => T,
): T {
  const binding = metadataAvailabilityShape(value, label, code, validateValue);
  if (binding.status !== 'observed' && binding.status !== 'declared') throw new SourcePreflightContractError(code, `${label} must contain an observed or declared value.`);
  return binding.value;
}

function sourcePathsAreCanonical(paths: readonly RepositoryRelativePathV1[]): boolean {
  const seen = new Set<string>();
  for (let index = 0; index < paths.length; index += 1) {
    const path = paths[index]!;
    repositoryRelativePathV1(path);
    if (seen.has(path)) return false;
    if (index > 0 && compareRepositoryRelativePathsV1(paths[index - 1]!, path) >= 0) return false;
    seen.add(path);
  }
  return true;
}

function metadataPaths(value: unknown, label: string, code: BenchmarkSourcePreflightFailureCodeV1): NonEmptyReadonlyArray<RepositoryRelativePathV1> {
  return metadataBinding(value, label, code, (rawPaths) => canonicalPathList(rawPaths, label, code));
}

function validateFixtureMetadata(value: unknown): {
  readonly id: CanonicalIdV1;
  readonly version: SafePositiveIntegerV1;
  readonly semanticSha256: Sha256DigestV1;
  readonly sourceCommitSha: AvailabilityV1<GitShaV1>;
  readonly sourceFileSetSha256: Sha256DigestV1;
  readonly sourcePaths: NonEmptyReadonlyArray<RepositoryRelativePathV1>;
} {
  const fixture = metadataClosed(value, ['id', 'version', 'semanticSha256', 'sourceCommitSha', 'sourceFileSetSha256', 'sourcePaths'], 'Fixture metadata', 'fixture-contract-mismatch');
  return {
    id: metadataId(fixture.id, 'Fixture ID', 'fixture-contract-mismatch'),
    version: metadataVersion(fixture.version, 'Fixture version', 'fixture-contract-mismatch'),
    semanticSha256: metadataBinding(fixture.semanticSha256, 'Fixture semantic digest', 'fixture-contract-mismatch', (entry) => metadataDigest(entry, 'Fixture semantic digest', 'fixture-contract-mismatch')),
    sourceCommitSha: metadataAvailabilityShape(fixture.sourceCommitSha, 'Fixture source commit', 'fixture-contract-mismatch', (entry) => metadataGitSha(entry, 'Fixture source commit', 'fixture-contract-mismatch')),
    sourceFileSetSha256: metadataBinding(fixture.sourceFileSetSha256, 'Fixture source fileset digest', 'fixture-contract-mismatch', (entry) => metadataDigest(entry, 'Fixture source fileset digest', 'fixture-contract-mismatch')),
    sourcePaths: metadataPaths(fixture.sourcePaths, 'Fixture source paths', 'fixture-contract-mismatch'),
  };
}

function validateCandidateMetadata(value: unknown): {
  readonly id: CanonicalIdV1;
  readonly version: SafePositiveIntegerV1;
  readonly sourceFileSetSha256: Sha256DigestV1;
  readonly sourcePaths: NonEmptyReadonlyArray<RepositoryRelativePathV1>;
} {
  const candidate = metadataClosed(value, ['id', 'version', 'sourceFileSetSha256', 'sourcePaths'], 'Candidate metadata', 'candidate-contract-mismatch');
  return {
    id: metadataId(candidate.id, 'Candidate ID', 'candidate-contract-mismatch'),
    version: metadataVersion(candidate.version, 'Candidate version', 'candidate-contract-mismatch'),
    sourceFileSetSha256: metadataBinding(candidate.sourceFileSetSha256, 'Candidate source fileset digest', 'candidate-contract-mismatch', (entry) => metadataDigest(entry, 'Candidate source fileset digest', 'candidate-contract-mismatch')),
    sourcePaths: metadataPaths(candidate.sourcePaths, 'Candidate source paths', 'candidate-contract-mismatch'),
  };
}

function validateBuildMetadata(value: unknown): BenchmarkBuildBindingV1 | undefined {
  if (value === undefined) return undefined;
  const build = metadataClosed(value, ['algorithmVersion', 'rootPath', 'sha256', 'fileCount', 'totalBytes'], 'Build metadata', 'build-digest-mismatch');
  if (build.algorithmVersion !== 'hestia-benchmark-build-sha256-v1' || build.rootPath !== 'dist') throw new SourcePreflightContractError('build-digest-mismatch', 'Build algorithm or root is invalid.');
  const sha256 = metadataDigest(build.sha256, 'Build digest', 'build-digest-mismatch');
  if (!Number.isSafeInteger(build.fileCount) || (build.fileCount as number) < 1) throw new SourcePreflightContractError('build-digest-mismatch', 'Build file count is not a positive safe integer.');
  if (!Number.isSafeInteger(build.totalBytes) || (build.totalBytes as number) < 1) throw new SourcePreflightContractError('build-digest-mismatch', 'Build byte count is not a positive safe integer.');
  return {
    algorithmVersion: 'hestia-benchmark-build-sha256-v1',
    rootPath: 'dist',
    sha256,
    fileCount: build.fileCount as SafePositiveIntegerV1,
    totalBytes: build.totalBytes as SafePositiveIntegerV1,
  };
}

function observedBinding<T>(value: T): AvailabilityV1<T> {
  return { status: 'observed', value, sourceRef: 'source-preflight-v1' as CanonicalIdV1, stability: 'stable' };
}

function verifiedSourceFilePath(rootPath: string, relativePath: RepositoryRelativePathV1, code: 'fixture-contract-mismatch' | 'candidate-contract-mismatch'): string {
  let current = rootPath;
  const segments = relativePath.split('/');
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    let children;
    try {
      children = readdirSync(current, { withFileTypes: true });
    } catch {
      throw new SourcePreflightContractError(code, `Source path does not exist: ${relativePath}.`);
    }
    if (!children.some((entry) => entry.name === segment)) throw new SourcePreflightContractError(code, `Source path case does not match the repository entry: ${relativePath}.`);
    current = join(current, segment);
    let stat;
    try {
      stat = lstatSync(current);
    } catch {
      throw new SourcePreflightContractError(code, `Source path does not exist: ${relativePath}.`);
    }
    if (stat.isSymbolicLink()) throw new SourcePreflightContractError(code, `Source path contains a symbolic link: ${relativePath}.`);
    if (index === segments.length - 1 ? !stat.isFile() : !stat.isDirectory()) throw new SourcePreflightContractError(code, `Source path is not a regular file: ${relativePath}.`);
  }
  let resolved: string;
  try {
    resolved = realpathSync(current);
  } catch {
    throw new SourcePreflightContractError(code, `Source path cannot be resolved: ${relativePath}.`);
  }
  const root = realpathSync(rootPath);
  const targetRelative = relative(root, resolved);
  if (targetRelative === '..' || targetRelative.startsWith(`..${sep}`) || isAbsolute(targetRelative)) throw new SourcePreflightContractError(code, `Source path escapes the verified repository root: ${relativePath}.`);
  return resolved;
}

function samePaths(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index]);
}

interface RegisteredFixtureBindingV1 {
  readonly id: CanonicalIdV1;
  readonly version: SafePositiveIntegerV1;
  readonly sourceCommitSha: GitShaV1;
  readonly sourcePaths: NonEmptyReadonlyArray<RepositoryRelativePathV1>;
  readonly sourceFileSetSha256: Sha256DigestV1;
}

function registryObservedBinding<T>(
  value: unknown,
  label: string,
  validateValue: (value: unknown) => T,
): T {
  const binding = metadataAvailabilityShape(value, label, 'fixture-contract-mismatch', validateValue);
  if (binding.status !== 'observed') throw new SourcePreflightContractError('fixture-contract-mismatch', `${label} is not an observed registry binding.`);
  return binding.value;
}

function canonicalPathList(value: unknown, label: string, code: BenchmarkSourcePreflightFailureCodeV1): NonEmptyReadonlyArray<RepositoryRelativePathV1> {
  if (!Array.isArray(value) || value.length === 0) throw new SourcePreflightContractError(code, `${label} must be a non-empty path list.`);
  const result = value.map((path, index) => {
    if (typeof path !== 'string') throw new SourcePreflightContractError(code, `${label}[${index}] must be a path.`);
    try {
      return repositoryRelativePathV1(path);
    } catch {
      throw new SourcePreflightContractError(code, `${label}[${index}] is not canonical.`);
    }
  });
  if (!sourcePathsAreCanonical(result)) throw new SourcePreflightContractError(code, `${label} must be strictly sorted and unique.`);
  return result as unknown as NonEmptyReadonlyArray<RepositoryRelativePathV1>;
}

function readCurrentHeadBlobOid(
  path: RepositoryRelativePathV1,
  rootPath: string,
  treeSha: string,
  runner: SourcePreflightCommandRunnerV1,
): string {
  const result = commandResult(runner, 'git', ['ls-tree', '-z', '--full-tree', treeSha, '--', path], rootPath);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(result.stdout);
  } catch {
    throw new SourcePreflightContractError('candidate-contract-mismatch', `Current HEAD metadata is not UTF-8: ${path}.`);
  }
  const firstNul = text.indexOf('\0');
  if (firstNul < 1 || firstNul !== text.length - 1 || text.indexOf('\0', firstNul + 1) !== -1) {
    throw new SourcePreflightContractError('candidate-contract-mismatch', `Current HEAD metadata must contain exactly one NUL record: ${path}.`);
  }
  const record = text.slice(0, firstNul);
  const tab = record.indexOf('\t');
  if (tab < 1 || record.indexOf('\t', tab + 1) !== -1) {
    throw new SourcePreflightContractError('candidate-contract-mismatch', `Current HEAD metadata is malformed: ${path}.`);
  }
  const fields = record.slice(0, tab).split(' ');
  const returnedPath = record.slice(tab + 1);
  if (fields.length !== 3 || !/^100[0-7]{3}$/.test(fields[0]!) || fields[1] !== 'blob' || !/^[0-9a-f]{40}$/.test(fields[2]!) || returnedPath !== path) {
    throw new SourcePreflightContractError('candidate-contract-mismatch', `Current HEAD candidate binding is not an exact regular blob: ${path}.`);
  }
  return fields[2]!;
}

function verifyCurrentHeadCandidatePath(
  path: RepositoryRelativePathV1,
  rootPath: string,
  treeSha: string,
  runner: SourcePreflightCommandRunnerV1,
  expectedBlobOid?: string,
): string {
  const headBlobOid = readCurrentHeadBlobOid(path, rootPath, treeSha, runner);
  if (expectedBlobOid !== undefined && headBlobOid !== expectedBlobOid) {
    throw new SourcePreflightContractError('candidate-contract-mismatch', `Candidate tree binding changed during preflight: ${path}.`);
  }
  const filteredWorkingTreeOid = exactCommandText(commandResult(runner, 'git', ['hash-object', `--path=${path}`, '--', path], rootPath));
  if (filteredWorkingTreeOid === undefined) {
    throw new SourcePreflightContractError('candidate-contract-mismatch', `Clean-filter candidate hash is malformed: ${path}.`);
  }
  if (filteredWorkingTreeOid !== headBlobOid) {
    throw new SourcePreflightContractError('candidate-contract-mismatch', `Candidate bytes do not match the current HEAD blob: ${path}.`);
  }
  return headBlobOid;
}

function verifyCurrentHeadCandidatePaths(
  paths: readonly RepositoryRelativePathV1[],
  rootPath: string,
  treeSha: string,
  runner: SourcePreflightCommandRunnerV1,
  expectedBlobOids?: readonly string[],
): readonly string[] {
  return paths.map((path, index) => verifyCurrentHeadCandidatePath(path, rootPath, treeSha, runner, expectedBlobOids?.[index]));
}

function fixtureCommandResult(
  runner: SourcePreflightCommandRunnerV1,
  args: readonly string[],
  rootPath: string,
): SourcePreflightCommandResultV1 {
  try {
    return commandResult(runner, 'git', ['--no-replace-objects', ...args], rootPath);
  } catch (error) {
    throw new SourcePreflightContractError('fixture-contract-mismatch', error instanceof Error ? error.message : 'Historical Git command failed.');
  }
}

function registryBlobOid(
  path: RepositoryRelativePathV1,
  registryCommit: GitShaV1,
  rootPath: string,
  runner: SourcePreflightCommandRunnerV1,
): string {
  const result = fixtureCommandResult(runner, ['ls-tree', '-z', '--full-tree', registryCommit, '--', path], rootPath);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(result.stdout);
  } catch {
    throw new SourcePreflightContractError('fixture-contract-mismatch', `Historical Git tree metadata is not UTF-8: ${path}.`);
  }
  const firstNul = text.indexOf('\0');
  if (firstNul < 1 || firstNul !== text.length - 1 || text.indexOf('\0', firstNul + 1) !== -1) {
    throw new SourcePreflightContractError('fixture-contract-mismatch', `Historical Git tree metadata must contain exactly one NUL record: ${path}.`);
  }
  const record = text.slice(0, firstNul);
  const tab = record.indexOf('\t');
  if (tab < 1 || record.indexOf('\t', tab + 1) !== -1) {
    throw new SourcePreflightContractError('fixture-contract-mismatch', `Historical Git tree metadata is malformed: ${path}.`);
  }
  const fields = record.slice(0, tab).split(' ');
  const returnedPath = record.slice(tab + 1);
  if (fields.length !== 3
    || (fields[0] !== '100644' && fields[0] !== '100755')
    || fields[1] !== 'blob'
    || !/^[0-9a-f]{40}$/.test(fields[2]!)
    || returnedPath !== path) {
    throw new SourcePreflightContractError('fixture-contract-mismatch', `Historical Git tree binding is not an exact regular blob: ${path}.`);
  }
  return fields[2]!;
}

function registryBlobSize(
  path: RepositoryRelativePathV1,
  blobOid: string,
  rootPath: string,
  runner: SourcePreflightCommandRunnerV1,
): number {
  const type = commandText(fixtureCommandResult(runner, ['cat-file', '-t', blobOid], rootPath));
  if (type !== 'blob') throw new SourcePreflightContractError('fixture-contract-mismatch', `Historical Git object is not a blob: ${path}.`);
  const sizeText = commandText(fixtureCommandResult(runner, ['cat-file', '-s', blobOid], rootPath));
  if (sizeText === undefined || !/^(0|[1-9][0-9]*)$/.test(sizeText)) {
    throw new SourcePreflightContractError('fixture-contract-mismatch', `Historical Git blob size is malformed: ${path}.`);
  }
  const size = Number(sizeText);
  if (!Number.isSafeInteger(size) || size < 0 || size > BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.maxFileBytes) {
    throw new SourcePreflightContractError('fixture-contract-mismatch', `Historical Git blob exceeds the v1 per-file limit: ${path}.`);
  }
  return size;
}

function materializeDefaultRegistryBlob(
  path: RepositoryRelativePathV1,
  registryCommit: GitShaV1,
  expectedSize: number,
  rootPath: string,
  tempRoot: string,
  index: number,
): string {
  const targetPath = join(tempRoot, `blob-${String(index)}.bin`);
  let result: ReturnType<typeof spawnSync> | undefined;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(targetPath, 'w');
    try {
      result = spawnSync('git', ['--no-replace-objects', 'cat-file', 'blob', `${registryCommit}:${path}`], {
        cwd: rootPath,
        encoding: 'buffer',
        shell: false,
        windowsHide: true,
        timeout: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.gitCommandTimeoutMs,
        maxBuffer: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.commandOutputMaxBytes,
        stdio: ['ignore', descriptor, 'pipe'],
      });
    } finally {
      closeSync(descriptor);
      descriptor = undefined;
    }
  } catch (error) {
    throw new SourcePreflightContractError('fixture-contract-mismatch', error instanceof Error ? error.message : `Historical Git blob read failed: ${path}.`);
  }
  if (result === undefined) throw new SourcePreflightContractError('fixture-contract-mismatch', `Historical Git blob read returned no result: ${path}.`);
  if ((result.stdout !== null && result.stdout !== undefined && !(result.stdout instanceof Uint8Array))
    || (result.stderr !== null && result.stderr !== undefined && !(result.stderr instanceof Uint8Array))) {
    throw new SourcePreflightContractError('fixture-contract-mismatch', `Historical Git blob command returned invalid control output: ${path}.`);
  }
  const stderr = result.stderr instanceof Uint8Array ? result.stderr : new Uint8Array();
  const stdout = result.stdout instanceof Uint8Array ? result.stdout : new Uint8Array();
  if (stdout.byteLength > BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.commandOutputMaxBytes
    || stderr.byteLength > BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.commandOutputMaxBytes
    || stdout.byteLength + stderr.byteLength > BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.commandOutputMaxBytes
    || stdout.byteLength !== 0
    || result.error !== undefined
    || (result.signal !== undefined && result.signal !== null)
    || result.status !== 0
    || stderr.byteLength !== 0) {
    throw new SourcePreflightContractError('fixture-contract-mismatch', `Historical Git blob command failed: ${path}.`);
  }
  let stat;
  try {
    stat = lstatSync(targetPath, { bigint: false, throwIfNoEntry: true });
  } catch {
    throw new SourcePreflightContractError('fixture-contract-mismatch', `Historical Git blob was not materialized: ${path}.`);
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== expectedSize) {
    throw new SourcePreflightContractError('fixture-contract-mismatch', `Historical Git blob size changed while materializing: ${path}.`);
  }
  return targetPath;
}

function verifyRegisteredFixtureBinding(
  rootPath: string,
  fixtureMetadata: ReturnType<typeof validateFixtureMetadata>,
  runner: SourcePreflightCommandRunnerV1,
): RegisteredFixtureBindingV1 | undefined {
  const binding = BENCHMARK_SOURCE_FIXTURE_BINDINGS_V1[fixtureMetadata.id as keyof typeof BENCHMARK_SOURCE_FIXTURE_BINDINGS_V1];
  if (binding === undefined) {
    if (fixtureMetadata.sourceCommitSha.status === 'observed') throw new SourcePreflightContractError('fixture-contract-mismatch', 'Synthetic fixture source commit is not Git-verified.');
    return undefined;
  }
  const bindingId = metadataId(binding.id, 'Registry fixture ID', 'fixture-contract-mismatch');
  const bindingVersion = metadataVersion(binding.version, 'Registry fixture version', 'fixture-contract-mismatch');
  const bindingCommit = registryObservedBinding(binding.sourceCommitSha, 'Registry fixture source commit', (value) => metadataGitSha(value, 'Registry fixture source commit', 'fixture-contract-mismatch'));
  const bindingObjectType = commandText(fixtureCommandResult(runner, ['cat-file', '-t', bindingCommit], rootPath));
  if (bindingObjectType !== 'commit') throw new SourcePreflightContractError('fixture-contract-mismatch', 'Registry fixture source commit is not a Git commit object.');
  const bindingPaths = registryObservedBinding(binding.sourcePaths, 'Registry fixture source paths', (value) => canonicalPathList(value, 'Registry fixture source paths', 'fixture-contract-mismatch'));
  const bindingDigest = registryObservedBinding(binding.sourceFileSetSha256, 'Registry fixture source fileset digest', (value) => metadataDigest(value, 'Registry fixture source fileset digest', 'fixture-contract-mismatch'));
  if (fixtureMetadata.id !== bindingId || fixtureMetadata.version !== bindingVersion) throw new SourcePreflightContractError('fixture-contract-mismatch', 'Fixture ID or version does not match the registered binding.');
  if (fixtureMetadata.sourceCommitSha.value !== bindingCommit) throw new SourcePreflightContractError('fixture-contract-mismatch', 'Fixture source commit does not match the registered binding.');
  if (!samePaths(fixtureMetadata.sourcePaths, bindingPaths)) throw new SourcePreflightContractError('fixture-contract-mismatch', 'Fixture source paths do not exactly match the registered binding.');
  if (!timingSafeEqualSha256V1(fixtureMetadata.sourceFileSetSha256, bindingDigest)) throw new SourcePreflightContractError('fixture-contract-mismatch', 'Fixture source fileset digest does not match the registered binding.');

  if (bindingPaths.length > BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.maxFiles) throw new SourcePreflightContractError('fixture-contract-mismatch', 'Registered fixture file count exceeds the v1 limit.');
  const tempRoot = runner === defaultRunner ? mkdtempSync(join(tmpdir(), 'br01-registered-fixture-')) : undefined;
  try {
    const pathEntries: FileSetPathInputV1[] = [];
    const readerEntries: FileSetReaderEntryInputV1[] = [];
    let aggregateBytes = 0;
    for (const [index, path] of bindingPaths.entries()) {
      const blobOid = registryBlobOid(path, bindingCommit, rootPath, runner);
      const expectedSize = registryBlobSize(path, blobOid, rootPath, runner);
      aggregateBytes += expectedSize;
      if (aggregateBytes > BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.maxAggregateBytes) {
        throw new SourcePreflightContractError('fixture-contract-mismatch', 'Registered fixture aggregate bytes exceed the v1 limit.');
      }
      if (tempRoot !== undefined) {
        pathEntries.push({ path, absolutePath: materializeDefaultRegistryBlob(path, bindingCommit, expectedSize, rootPath, tempRoot, index) });
      } else {
        const result = fixtureCommandResult(runner, ['cat-file', 'blob', `${bindingCommit}:${path}`], rootPath);
        if (result.stdout.byteLength !== expectedSize) throw new SourcePreflightContractError('fixture-contract-mismatch', `Historical Git blob size does not match cat-file metadata: ${path}.`);
        const bytes = new Uint8Array(result.stdout);
        readerEntries.push({ path, read: () => new Uint8Array(bytes) });
      }
    }
    const actual = tempRoot === undefined
      ? digestFileSetReadersV1(readerEntries, 'fileset')
      : digestFileSetPathsV1(pathEntries, 'fileset');
    if (actual.fileCount !== bindingPaths.length || actual.totalBytes !== aggregateBytes || !timingSafeEqualSha256V1(actual.digest, bindingDigest)) {
      throw new SourcePreflightContractError('fixture-contract-mismatch', 'Historical Git blob fileset digest does not match the registered binding.');
    }
  } catch (error) {
    if (error instanceof SourcePreflightContractError) throw error;
    throw new SourcePreflightContractError('fixture-contract-mismatch', error instanceof Error ? error.message : 'Historical Git blob fileset could not be verified.');
  } finally {
    if (tempRoot !== undefined) rmSync(tempRoot, { recursive: true, force: true });
  }
  return { id: bindingId, version: bindingVersion, sourceCommitSha: bindingCommit, sourcePaths: bindingPaths, sourceFileSetSha256: bindingDigest };
}

function hasGitlink(rootPath: string, runner: SourcePreflightCommandRunnerV1): boolean {
  const result = commandResult(runner, 'git', ['ls-files', '--stage'], rootPath);
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(result.stdout);
    return text.split('\n').some((line) => line.startsWith('160000 '));
  } catch {
    throw new SourcePreflightInfrastructureError('Git index output is not UTF-8.');
  }
}

function createBuildHandoff(rootPath: string, build: BenchmarkBuildBindingV1): BenchmarkBuildHandoffV1 {
  const buildRootPath = realpathSync(join(rootPath, 'dist'));
  return Object.freeze({
    rootIdentity: Object.freeze({ repositoryRootPath: rootPath, buildRootPath }),
    expected: Object.freeze({ ...build }),
  });
}

function handoffReject(code: BuildHandoffFailureCodeV1, detail: string): BuildHandoffVerificationResultV1 {
  return { status: 'rejected', code, detail: detail as NonEmptyString };
}

export function verifyBuildHandoffV1(handoff: BenchmarkBuildHandoffV1): BuildHandoffVerificationResultV1 {
  try {
    if (handoff === null || typeof handoff !== 'object') return handoffReject('infrastructure-failure', 'Build handoff must be an object.');
    const identity = handoff.rootIdentity;
    if (identity === null || typeof identity !== 'object' || !isAbsolute(identity.repositoryRootPath) || !isAbsolute(identity.buildRootPath)) {
      return handoffReject('infrastructure-failure', 'Build handoff root identity is invalid.');
    }
    const expected = validateBuildMetadata(handoff.expected);
    if (expected === undefined) return handoffReject('infrastructure-failure', 'Build handoff expectation is missing.');
    const rootStat = lstatSync(identity.repositoryRootPath);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory() || realpathSync(identity.repositoryRootPath) !== identity.repositoryRootPath) {
      return handoffReject('infrastructure-failure', 'Build handoff repository root changed or is a symlink.');
    }
    const distPath = join(identity.repositoryRootPath, 'dist');
    const distStat = lstatSync(distPath);
    if (distStat.isSymbolicLink() || !distStat.isDirectory() || realpathSync(distPath) !== identity.buildRootPath) {
      return handoffReject('build-digest-mismatch', 'Build handoff dist root changed or is a symlink.');
    }
    const relativeBuildRoot = relative(identity.repositoryRootPath, identity.buildRootPath);
    if (relativeBuildRoot !== 'dist') return handoffReject('infrastructure-failure', 'Build handoff dist root is outside the repository root.');
    const files = enumerateFileSetDirectoryV1(identity.buildRootPath, 'build');
    const actual = digestFileSetPathsV1(files, 'build');
    if (!timingSafeEqualSha256V1(actual.digest, expected.sha256) || actual.fileCount !== expected.fileCount || actual.totalBytes !== expected.totalBytes) {
      return handoffReject('build-digest-mismatch', 'Build files changed after source preflight.');
    }
    return { status: 'verified', build: expected };
  } catch (error) {
    if (error instanceof SourcePreflightContractError) return handoffReject(error.code as 'build-digest-mismatch', error.message);
    return handoffReject('build-digest-mismatch', error instanceof Error ? error.message : 'Build handoff verification failed.');
  }
}

export function sourcePreflightV1(input: SourcePreflightInputV1): SourcePreflightResultV1 {
  const runner = input.runCommand ?? defaultRunner;
  try {
    if (!existsSync(input.rootPath)) return reject('infrastructure-failure', 'Repository root does not exist.');
    const verifiedRootPath = realpathSync(input.rootPath);
    const reportedRoot = commandText(commandResult(runner, 'git', ['rev-parse', '--show-toplevel'], verifiedRootPath));
    if (reportedRoot === undefined) return reject('infrastructure-failure', 'Could not resolve repository root.');
    let verifiedReportedRoot: string;
    try {
      verifiedReportedRoot = realpathSync(reportedRoot);
    } catch {
      return reject('infrastructure-failure', 'Git reported a repository root that cannot be resolved.');
    }
    if (relative(verifiedRootPath, verifiedReportedRoot) !== '') return reject('infrastructure-failure', 'Git repository root differs from supplied root.');
    const commit = exactCommandText(commandResult(runner, 'git', ['rev-parse', '--verify', 'HEAD^{commit}'], verifiedRootPath));
    const tree = commit === undefined
      ? undefined
      : exactCommandText(commandResult(runner, 'git', ['rev-parse', '--verify', `${commit}^{tree}`], verifiedRootPath));
    if (commit === undefined) return reject('infrastructure-failure', 'Invalid HEAD commit output.');
    if (tree === undefined) return reject('infrastructure-failure', 'Invalid HEAD tree output.');
    if (commit !== input.expectedSourceCommitSha) return reject('source-sha-mismatch', 'HEAD does not match the expected current source commit SHA.');
    const candidateMetadata = validateCandidateMetadata(input.candidate);
    const firstCandidateBlobOids = verifyCurrentHeadCandidatePaths(candidateMetadata.sourcePaths, verifiedRootPath, tree, runner);
    const status = commandResult(runner, 'git', ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=none'], verifiedRootPath);
    if (status.stdout.byteLength !== 0) return reject('source-dirty', 'Git worktree status is not empty.');
    if (!timingSafeEqualSha256V1(sha256BytesV1(status.stdout), EMPTY_STATUS_SHA256) || !timingSafeEqualSha256V1(emptyStatusDigest, EMPTY_STATUS_SHA256)) {
      return reject('infrastructure-failure', 'Empty status digest does not match the v1 constant.');
    }
    if (existsSync(join(verifiedRootPath, '.gitmodules')) || hasGitlink(verifiedRootPath, runner)) return reject('infrastructure-failure', 'Git submodules or gitlinks are not allowed.');
    if (!(input.fixtureSemanticBytes instanceof Uint8Array)) throw new SourcePreflightContractError('fixture-contract-mismatch', 'Canonical fixture semantic bytes are required.');
    try {
      parseCanonicalJsonV1(input.fixtureSemanticBytes);
    } catch {
      throw new SourcePreflightContractError('fixture-contract-mismatch', 'Canonical fixture semantic bytes must be canonical JSON.');
    }
    const fixtureSemanticDigest = sha256BytesV1(input.fixtureSemanticBytes);
    const fixtureMetadata = validateFixtureMetadata(input.fixture);
    if (!timingSafeEqualSha256V1(fixtureMetadata.semanticSha256, fixtureSemanticDigest)) return reject('fixture-contract-mismatch', 'Fixture semantic digest does not match canonical fixture bytes.');
    const isWp04Semantic = isBenchmarkWp04SemanticBytesV1(input.fixtureSemanticBytes) && timingSafeEqualSha256V1(fixtureSemanticDigest, BENCHMARK_WP04_SEMANTIC_SHA256_V1);
    if (isWp04Semantic && fixtureMetadata.id !== 'wp04-golden-world-v1') return reject('fixture-contract-mismatch', 'WP04 semantic bytes require the WP04 fixture ID.');
    if (fixtureMetadata.id === 'wp04-golden-world-v1' && !isWp04Semantic) return reject('fixture-contract-mismatch', 'WP04 fixture semantic bytes do not match the authoritative contract.');
    const expectedBuild = validateBuildMetadata(input.build);
    const registeredFixture = verifyRegisteredFixtureBinding(verifiedRootPath, fixtureMetadata, runner);
    if (registeredFixture === undefined) {
      const fixtureEntries: FileSetPathInputV1[] = fixtureMetadata.sourcePaths.map((path) => ({ path, absolutePath: verifiedSourceFilePath(verifiedRootPath, path, 'fixture-contract-mismatch') }));
      let actualFixture;
      try {
        actualFixture = digestFileSetPathsV1(fixtureEntries, 'fileset');
      } catch (error) {
        throw new SourcePreflightContractError('fixture-contract-mismatch', error instanceof Error ? error.message : 'Fixture fileset could not be read.');
      }
      if (!timingSafeEqualSha256V1(actualFixture.digest, fixtureMetadata.sourceFileSetSha256)) return reject('fixture-contract-mismatch', 'Fixture fileset digest mismatch.');
    }
    const candidateEntries: FileSetPathInputV1[] = candidateMetadata.sourcePaths.map((path) => ({ path, absolutePath: verifiedSourceFilePath(verifiedRootPath, path, 'candidate-contract-mismatch') }));
    let actualCandidate;
    try {
      actualCandidate = digestFileSetPathsV1(candidateEntries, 'fileset');
    } catch (error) {
      throw new SourcePreflightContractError('candidate-contract-mismatch', error instanceof Error ? error.message : 'Candidate fileset could not be read.');
    }
    const secondCandidateBlobOids = verifyCurrentHeadCandidatePaths(candidateMetadata.sourcePaths, verifiedRootPath, tree, runner, firstCandidateBlobOids);
    if (!samePaths(firstCandidateBlobOids, secondCandidateBlobOids)) throw new SourcePreflightContractError('candidate-contract-mismatch', 'Candidate HEAD bindings changed during preflight.');
    const secondCandidateEntries: FileSetPathInputV1[] = candidateMetadata.sourcePaths.map((path) => ({ path, absolutePath: verifiedSourceFilePath(verifiedRootPath, path, 'candidate-contract-mismatch') }));
    let secondCandidate;
    try {
      secondCandidate = digestFileSetPathsV1(secondCandidateEntries, 'fileset');
    } catch (error) {
      throw new SourcePreflightContractError('candidate-contract-mismatch', error instanceof Error ? error.message : 'Candidate fileset could not be read.');
    }
    if (!timingSafeEqualSha256V1(actualCandidate.digest, secondCandidate.digest) || actualCandidate.fileCount !== secondCandidate.fileCount || actualCandidate.totalBytes !== secondCandidate.totalBytes) {
      throw new SourcePreflightContractError('candidate-contract-mismatch', 'Candidate fileset changed during preflight.');
    }
    if (!timingSafeEqualSha256V1(actualCandidate.digest, candidateMetadata.sourceFileSetSha256)) return reject('candidate-contract-mismatch', 'Candidate fileset digest mismatch.');
    const distPath = join(verifiedRootPath, 'dist');
    if (!existsSync(distPath)) return reject('build-digest-mismatch', 'Build root dist/ does not exist as a real directory.');
    let distStat;
    try {
      distStat = lstatSync(distPath);
    } catch (error) {
      throw new SourcePreflightContractError('build-digest-mismatch', error instanceof Error ? error.message : 'Build root dist/ could not be inspected.');
    }
    if (distStat.isSymbolicLink() || !distStat.isDirectory()) return reject('build-digest-mismatch', 'Build root dist/ does not exist as a real directory.');
    let actualBuild;
    try {
      const files = enumerateFileSetDirectoryV1(distPath, 'build');
      actualBuild = digestFileSetPathsV1(files, 'build');
    } catch (error) {
      throw new SourcePreflightContractError('build-digest-mismatch', error instanceof Error ? error.message : 'Build fileset could not be read.');
    }
    const build: BenchmarkBuildBindingV1 = {
      algorithmVersion: 'hestia-benchmark-build-sha256-v1',
      rootPath: 'dist',
      sha256: actualBuild.digest,
      fileCount: safePositiveInteger(actualBuild.fileCount, 'Build file count'),
      totalBytes: safePositiveInteger(actualBuild.totalBytes, 'Build byte count'),
    };
    if (expectedBuild !== undefined && (!timingSafeEqualSha256V1(expectedBuild.sha256, build.sha256) || expectedBuild.fileCount !== build.fileCount || expectedBuild.totalBytes !== build.totalBytes)) {
      return reject('build-digest-mismatch', 'Build fileset binding does not match dist/.');
    }
    const buildHandoff = createBuildHandoff(verifiedRootPath, build);
    const afterCommit = exactCommandText(commandResult(runner, 'git', ['rev-parse', '--verify', 'HEAD^{commit}'], verifiedRootPath));
    const afterTree = afterCommit === undefined
      ? undefined
      : exactCommandText(commandResult(runner, 'git', ['rev-parse', '--verify', `${afterCommit}^{tree}`], verifiedRootPath));
    const afterStatus = commandResult(runner, 'git', ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=none'], verifiedRootPath);
    if (afterCommit === undefined || afterTree === undefined) return reject('infrastructure-failure', 'Source changed during preflight.');
    if (afterStatus.stdout.byteLength !== 0) return reject('source-dirty', 'Git worktree became dirty during preflight.');
    if (afterCommit !== commit) return reject('source-sha-mismatch', 'Commit changed during preflight.');
    if (afterTree !== tree) return reject('source-tree-mismatch', 'Commit tree changed during preflight.');
    const buildVerification = verifyBuildHandoffV1(buildHandoff);
    if (buildVerification.status === 'rejected') return reject(buildVerification.code, buildVerification.detail);
    const sourceCommitSha = registeredFixture === undefined
      ? fixtureMetadata.sourceCommitSha
      : observedBinding(registeredFixture.sourceCommitSha);
    const verifiedFixture: BenchmarkFixtureContractBindingV1 = {
      id: fixtureMetadata.id,
      version: fixtureMetadata.version,
      semanticSha256: observedBinding(fixtureSemanticDigest),
      sourceCommitSha,
      sourceFileSetSha256: observedBinding(registeredFixture?.sourceFileSetSha256 ?? fixtureMetadata.sourceFileSetSha256),
      sourcePaths: observedBinding(registeredFixture?.sourcePaths ?? fixtureMetadata.sourcePaths),
    };
    const verifiedCandidate: BenchmarkCandidateBindingV1 = {
      id: candidateMetadata.id,
      version: candidateMetadata.version,
      sourceFileSetSha256: observedBinding(candidateMetadata.sourceFileSetSha256),
      sourcePaths: observedBinding(candidateMetadata.sourcePaths),
    };
    const provenance: BenchmarkSourceProvenanceV1 = {
      schemaVersion: 'benchmark-source-provenance-v1',
      repositoryUrl: BENCHMARK_REPOSITORY_URL,
      commitSha: commit as GitShaV1,
      commitTreeSha: tree as GitShaV1,
      worktree: { state: 'clean', statusCommand: BENCHMARK_STATUS_COMMAND, statusOutputSha256: EMPTY_STATUS_SHA256, submodules: [] },
      build,
      fixture: verifiedFixture,
      candidate: verifiedCandidate,
    };
    return { status: 'accepted', provenance, buildHandoff };
  } catch (error) {
    if (error instanceof SourcePreflightContractError) return reject(error.code, error.message);
    return reject('infrastructure-failure', error instanceof Error ? error.message : 'Source preflight failed.');
  }
}

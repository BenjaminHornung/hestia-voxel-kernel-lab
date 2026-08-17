import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
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
  BR01_ACCEPTED_WP04_SHA,
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
  return metadataBinding(value, label, code, (rawPaths) => {
    if (!Array.isArray(rawPaths) || rawPaths.length === 0) throw new SourcePreflightContractError(code, `${label} must be a non-empty path list.`);
    const result = rawPaths.map((path, index) => {
      if (typeof path !== 'string') throw new SourcePreflightContractError(code, `${label}[${index}] must be a path.`);
      try {
        return repositoryRelativePathV1(path);
      } catch {
        throw new SourcePreflightContractError(code, `${label}[${index}] is not canonical.`);
      }
    });
    if (!sourcePathsAreCanonical(result)) throw new SourcePreflightContractError(code, `${label} must be strictly sorted and unique.`);
    return result as unknown as NonEmptyReadonlyArray<RepositoryRelativePathV1>;
  });
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

function observedRegistryValue(value: unknown, label: string): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || (value as { readonly status?: unknown }).status !== 'observed') {
    throw new SourcePreflightContractError('fixture-contract-mismatch', `${label} is not an observed owner binding.`);
  }
  return (value as { readonly value: unknown }).value;
}

function readAcceptedHeadBlob(
  path: RepositoryRelativePathV1,
  rootPath: string,
  runner: SourcePreflightCommandRunnerV1,
): Uint8Array {
  const result = commandResult(runner, 'git', ['cat-file', 'blob', `${BR01_ACCEPTED_WP04_SHA}:${path}`], rootPath);
  return new Uint8Array(result.stdout);
}

function verifyWp04OwnerBinding(
  rootPath: string,
  fixtureMetadata: ReturnType<typeof validateFixtureMetadata>,
  runner: SourcePreflightCommandRunnerV1,
): void {
  const binding = BENCHMARK_SOURCE_FIXTURE_BINDINGS_V1[fixtureMetadata.id as keyof typeof BENCHMARK_SOURCE_FIXTURE_BINDINGS_V1];
  if (binding === undefined) {
    if (fixtureMetadata.sourceCommitSha.status === 'observed') throw new SourcePreflightContractError('fixture-contract-mismatch', 'Synthetic fixture source commit is not Git-verified.');
    return;
  }
  if (fixtureMetadata.id !== 'wp04-golden-world-v1') {
    if (binding.sourceCommitSha.status !== 'observed' || binding.sourcePaths.status !== 'observed' || binding.sourceFileSetSha256.status !== 'observed') {
      throw new SourcePreflightContractError('fixture-contract-mismatch', 'Known fixture owner binding is unavailable.');
    }
    if (fixtureMetadata.sourceCommitSha.status === 'observed') throw new SourcePreflightContractError('fixture-contract-mismatch', 'Fixture source commit is not Git-verified by this preflight.');
    return;
  }
  const bindingId = binding.id;
  const bindingVersion = binding.version;
  const bindingCommit = observedRegistryValue(binding.sourceCommitSha, 'WP04 source commit') as string;
  const bindingPaths = observedRegistryValue(binding.sourcePaths, 'WP04 source paths') as readonly string[];
  const bindingDigest = observedRegistryValue(binding.sourceFileSetSha256, 'WP04 source fileset digest') as string;
  if (fixtureMetadata.id !== bindingId || fixtureMetadata.version !== bindingVersion) throw new SourcePreflightContractError('fixture-contract-mismatch', 'WP04 fixture ID or version is not owner-bound.');
  if ((fixtureMetadata.sourceCommitSha.status !== 'observed' && fixtureMetadata.sourceCommitSha.status !== 'declared') || fixtureMetadata.sourceCommitSha.value !== bindingCommit) throw new SourcePreflightContractError('fixture-contract-mismatch', 'WP04 fixture source commit does not match the historical owner binding.');
  if (!samePaths(fixtureMetadata.sourcePaths, bindingPaths)) throw new SourcePreflightContractError('fixture-contract-mismatch', 'WP04 source paths do not exactly match the owner binding.');
  if (!timingSafeEqualSha256V1(fixtureMetadata.sourceFileSetSha256, bindingDigest)) throw new SourcePreflightContractError('fixture-contract-mismatch', 'WP04 source fileset digest does not match the owner binding.');
  const actualDigest = digestFileSetReadersV1(bindingPaths.map((path) => {
    const repositoryPath = repositoryRelativePathV1(path);
    return { path: repositoryPath, read: () => readAcceptedHeadBlob(repositoryPath, rootPath, runner) };
  })).digest;
  if (!timingSafeEqualSha256V1(actualDigest, bindingDigest)) throw new SourcePreflightContractError('fixture-contract-mismatch', 'WP04 Git blob fileset digest does not match the owner binding.');
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
    const tree = exactCommandText(commandResult(runner, 'git', ['rev-parse', '--verify', 'HEAD^{tree}'], verifiedRootPath));
    if (commit === undefined) return reject('infrastructure-failure', 'Invalid HEAD commit output.');
    if (tree === undefined) return reject('infrastructure-failure', 'Invalid HEAD tree output.');
    const status = commandResult(runner, 'git', ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=none'], verifiedRootPath);
    if (status.stdout.byteLength !== 0) return reject('source-dirty', 'Git worktree status is not empty.');
    if (commit !== input.expectedSourceCommitSha) return reject('source-sha-mismatch', 'HEAD does not match the expected current source commit SHA.');
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
    const candidateMetadata = validateCandidateMetadata(input.candidate);
    const expectedBuild = validateBuildMetadata(input.build);
    verifyWp04OwnerBinding(verifiedRootPath, fixtureMetadata, runner);
    if (fixtureMetadata.id !== 'wp04-golden-world-v1') {
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
    const afterTree = exactCommandText(commandResult(runner, 'git', ['rev-parse', '--verify', 'HEAD^{tree}'], verifiedRootPath));
    const afterStatus = commandResult(runner, 'git', ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=none'], verifiedRootPath);
    if (afterCommit === undefined || afterTree === undefined) return reject('infrastructure-failure', 'Source changed during preflight.');
    if (afterStatus.stdout.byteLength !== 0) return reject('source-dirty', 'Git worktree became dirty during preflight.');
    if (afterCommit !== commit) return reject('source-sha-mismatch', 'Commit changed during preflight.');
    if (afterTree !== tree) return reject('source-tree-mismatch', 'Commit tree changed during preflight.');
    const buildVerification = verifyBuildHandoffV1(buildHandoff);
    if (buildVerification.status === 'rejected') return reject(buildVerification.code, buildVerification.detail);
    const sourceCommitSha = fixtureMetadata.sourceCommitSha.status === 'observed' || fixtureMetadata.sourceCommitSha.status === 'declared'
      ? fixtureMetadata.id === 'wp04-golden-world-v1'
        ? observedBinding(fixtureMetadata.sourceCommitSha.value)
        : fixtureMetadata.sourceCommitSha
      : fixtureMetadata.sourceCommitSha;
    const verifiedFixture: BenchmarkFixtureContractBindingV1 = {
      id: fixtureMetadata.id,
      version: fixtureMetadata.version,
      semanticSha256: observedBinding(fixtureSemanticDigest),
      sourceCommitSha,
      sourceFileSetSha256: observedBinding(fixtureMetadata.sourceFileSetSha256),
      sourcePaths: observedBinding(fixtureMetadata.sourcePaths),
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

import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import type {
  AvailabilityV1,
  BenchmarkCandidateBindingV1,
  BenchmarkFixtureContractBindingV1,
  BenchmarkSourcePreflightResultV1,
  BenchmarkSourceProvenanceV1,
  BenchmarkBuildBindingV1,
  BenchmarkSourcePreflightFailureCodeV1,
  CanonicalIdV1,
  CanonicalRelativePathV1,
  GitShaV1,
  NonEmptyReadonlyArray,
  NonEmptyString,
  SafePositiveIntegerV1,
  Sha256DigestV1,
} from '../contracts/typesV1';
import { BENCHMARK_REPOSITORY_URL, BENCHMARK_STATUS_COMMAND, EMPTY_STATUS_SHA256 } from '../contracts/versions';
import { BENCHMARK_WP04_SEMANTIC_SHA256_V1, isBenchmarkWp04SemanticBytesV1 } from '../contracts/scenarioRegistryV1';
import { digestBuildV1, digestFileSetV1, sha256BytesV1, type FileSetEntryV1 } from './fileSetDigestV1';
import { canonicalRelativePathV1, compareCanonicalRelativePathsV1 } from './canonicalPathV1';
import { parseCanonicalJsonV1 } from './canonicalJsonV1';

export interface SourcePreflightCommandResultV1 {
  readonly status: number | null;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
  readonly error?: Error;
}

export type SourcePreflightCommandRunnerV1 = (
  command: string,
  args: readonly string[],
  cwd: string,
) => SourcePreflightCommandResultV1;

export interface SourcePreflightInputV1 {
  readonly rootPath: string;
  readonly expectedAcceptedWp04Sha: string;
  readonly fixtureSemanticBytes: Uint8Array;
  readonly fixture: BenchmarkFixtureContractBindingV1;
  readonly candidate: BenchmarkCandidateBindingV1;
  readonly build?: BenchmarkBuildBindingV1;
  readonly runCommand?: SourcePreflightCommandRunnerV1;
}

const defaultRunner: SourcePreflightCommandRunnerV1 = (command, args, cwd) => {
  const result = spawnSync(command, [...args], { cwd, encoding: 'buffer', shell: false, windowsHide: true });
  return {
    status: result.status,
    stdout: result.stdout instanceof Buffer ? new Uint8Array(result.stdout) : new Uint8Array(),
    stderr: result.stderr instanceof Buffer ? new Uint8Array(result.stderr) : new Uint8Array(),
    error: result.error,
  };
};

const emptyStatusDigest = sha256BytesV1(new Uint8Array());

function reject(code: BenchmarkSourcePreflightFailureCodeV1, detail: string): BenchmarkSourcePreflightResultV1 {
  return { status: 'rejected', code, detail: detail as NonEmptyString };
}

function commandText(result: SourcePreflightCommandResultV1): string | undefined {
  if (result.status !== 0 || result.error !== undefined || result.stderr.byteLength !== 0) return undefined;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(result.stdout);
    if (!text.endsWith('\n') || text.length <= 1 || text.slice(0, -1).includes('\n')) return undefined;
    return text.slice(0, -1);
  } catch {
    return undefined;
  }
}

function exactCommandText(result: SourcePreflightCommandResultV1): string | undefined {
  if (result.status !== 0 || result.error !== undefined || result.stderr.byteLength !== 0) return undefined;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(result.stdout);
    if (!text.endsWith('\n') || text.length !== 41) return undefined;
    const value = text.slice(0, -1);
    return /^[0-9a-f]{40}$/.test(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function listFiles(rootPath: string, prefix = ''): FileSetEntryV1[] {
  const files: FileSetEntryV1[] = [];
  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    const absolute = join(rootPath, entry.name);
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) throw new Error(`Unsupported file type ${path}.`);
    if (entry.isDirectory()) files.push(...listFiles(absolute, path));
    else files.push({ path: canonicalRelativePathV1(path), bytes: new Uint8Array(readFileSync(absolute)) });
  }
  return files;
}

function safePositiveInteger(value: number, label: string): SafePositiveIntegerV1 {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} is outside the safe positive integer domain.`);
  return value as SafePositiveIntegerV1;
}

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

function metadataAvailability(value: unknown, label: string, code: BenchmarkSourcePreflightFailureCodeV1): { readonly available: boolean; readonly value?: unknown } {
  const binding = metadataObject(value, label, code);
  if (binding.status === 'observed' || binding.status === 'declared') {
    const branch = metadataClosed(binding, ['status', 'value', 'sourceRef', 'stability'], label, code);
    metadataId(branch.sourceRef, `${label} sourceRef`, code);
    if (typeof branch.stability !== 'string') throw new SourcePreflightContractError(code, `${label} stability is invalid.`);
    const allowedStability = branch.status === 'observed'
      ? ['stable', 'experimental', 'platform-specific']
      : ['owner-binding', 'run-config', 'browser-default'];
    if (!allowedStability.includes(branch.stability)) throw new SourcePreflightContractError(code, `${label} stability is invalid for its status.`);
    return { available: true, value: branch.value };
  }
  if (typeof binding.status === 'string' && (UNAVAILABLE_STATUSES as readonly string[]).includes(binding.status)) {
    const branch = metadataClosed(binding, ['status', 'value', 'sourceRef', 'reasonCode'], label, code);
    if (branch.value !== null) throw new SourcePreflightContractError(code, `${label} unavailable branch must carry value:null.`);
    metadataId(branch.sourceRef, `${label} sourceRef`, code);
    metadataId(branch.reasonCode, `${label} reasonCode`, code);
    return { available: false };
  }
  throw new SourcePreflightContractError(code, `${label} has an invalid availability status.`);
}

function metadataBinding<T>(
  value: unknown,
  label: string,
  code: BenchmarkSourcePreflightFailureCodeV1,
  validateValue: (value: unknown) => T,
): T {
  const binding = metadataAvailability(value, label, code);
  if (!binding.available) {
    throw new SourcePreflightContractError(code, `${label} must contain an observed or declared value.`);
  }
  return validateValue(binding.value);
}

function metadataPaths(value: unknown, label: string, code: BenchmarkSourcePreflightFailureCodeV1): NonEmptyReadonlyArray<CanonicalRelativePathV1> {
  return metadataBinding(value, label, code, (rawPaths) => {
    if (!Array.isArray(rawPaths) || rawPaths.length === 0) throw new SourcePreflightContractError(code, `${label} must be a non-empty path list.`);
    const result = rawPaths.map((path, index) => {
      if (typeof path !== 'string') throw new SourcePreflightContractError(code, `${label}[${index}] must be a path.`);
      try {
        return canonicalRelativePathV1(path);
      } catch {
        throw new SourcePreflightContractError(code, `${label}[${index}] is not canonical.`);
      }
    });
    if (!sourcePathsAreCanonical(result)) throw new SourcePreflightContractError(code, `${label} must be strictly sorted and unique.`);
    return result as unknown as NonEmptyReadonlyArray<CanonicalRelativePathV1>;
  });
}

function validateFixtureMetadata(value: unknown): {
  readonly id: CanonicalIdV1;
  readonly version: SafePositiveIntegerV1;
  readonly semanticSha256: Sha256DigestV1;
  readonly sourceFileSetSha256: Sha256DigestV1;
  readonly sourcePaths: NonEmptyReadonlyArray<CanonicalRelativePathV1>;
} {
  const fixture = metadataClosed(value, ['id', 'version', 'semanticSha256', 'sourceFileSetSha256', 'sourcePaths'], 'Fixture metadata', 'fixture-contract-mismatch');
  return {
    id: metadataId(fixture.id, 'Fixture ID', 'fixture-contract-mismatch'),
    version: metadataVersion(fixture.version, 'Fixture version', 'fixture-contract-mismatch'),
    semanticSha256: metadataBinding(fixture.semanticSha256, 'Fixture semantic digest', 'fixture-contract-mismatch', (entry) => metadataDigest(entry, 'Fixture semantic digest', 'fixture-contract-mismatch')),
    sourceFileSetSha256: metadataBinding(fixture.sourceFileSetSha256, 'Fixture source fileset digest', 'fixture-contract-mismatch', (entry) => metadataDigest(entry, 'Fixture source fileset digest', 'fixture-contract-mismatch')),
    sourcePaths: metadataPaths(fixture.sourcePaths, 'Fixture source paths', 'fixture-contract-mismatch'),
  };
}

function validateCandidateMetadata(value: unknown): {
  readonly id: CanonicalIdV1;
  readonly version: SafePositiveIntegerV1;
  readonly sourceFileSetSha256: Sha256DigestV1;
  readonly sourcePaths: NonEmptyReadonlyArray<CanonicalRelativePathV1>;
} {
  const candidate = metadataClosed(value, ['id', 'version', 'sourceFileSetSha256', 'sourcePaths'], 'Candidate metadata', 'candidate-contract-mismatch');
  return {
    id: metadataId(candidate.id, 'Candidate ID', 'candidate-contract-mismatch'),
    version: metadataVersion(candidate.version, 'Candidate version', 'candidate-contract-mismatch'),
    sourceFileSetSha256: metadataBinding(candidate.sourceFileSetSha256, 'Candidate source fileset digest', 'candidate-contract-mismatch', (entry) => metadataDigest(entry, 'Candidate source fileset digest', 'candidate-contract-mismatch')),
    sourcePaths: metadataPaths(candidate.sourcePaths, 'Candidate source paths', 'candidate-contract-mismatch'),
  };
}

function validateBuildMetadata(value: unknown): void {
  if (value === undefined) return;
  const build = metadataClosed(value, ['algorithmVersion', 'rootPath', 'sha256', 'fileCount', 'totalBytes'], 'Build metadata', 'build-digest-mismatch');
  if (build.algorithmVersion !== 'hestia-benchmark-build-sha256-v1' || build.rootPath !== 'dist') throw new SourcePreflightContractError('build-digest-mismatch', 'Build algorithm or root is invalid.');
  metadataDigest(build.sha256, 'Build digest', 'build-digest-mismatch');
  if (!Number.isSafeInteger(build.fileCount) || (build.fileCount as number) < 1) throw new SourcePreflightContractError('build-digest-mismatch', 'Build file count is not a positive safe integer.');
  if (!Number.isSafeInteger(build.totalBytes) || (build.totalBytes as number) < 1) throw new SourcePreflightContractError('build-digest-mismatch', 'Build byte count is not a positive safe integer.');
}

function hasGitlink(rootPath: string, runner: SourcePreflightCommandRunnerV1): boolean {
  const result = runner('git', ['ls-files', '--stage'], rootPath);
  if (result.status !== 0 || result.stderr.byteLength !== 0) return true;
  const text = new TextDecoder().decode(result.stdout);
  return text.split('\n').some((line) => line.startsWith('160000 '));
}

function observedBinding<T>(value: T): AvailabilityV1<T> {
  return { status: 'observed', value, sourceRef: 'source-preflight-v1' as CanonicalIdV1, stability: 'stable' };
}

function sourcePathsAreCanonical(paths: readonly CanonicalRelativePathV1[]): boolean {
  const seen = new Set<string>();
  for (let index = 0; index < paths.length; index += 1) {
    const path = paths[index]!;
    canonicalRelativePathV1(path);
    if (seen.has(path)) return false;
    if (index > 0 && compareCanonicalRelativePathsV1(paths[index - 1]!, path) >= 0) return false;
    seen.add(path);
  }
  return true;
}

function verifiedSourceFilePath(rootPath: string, relativePath: CanonicalRelativePathV1, code: 'fixture-contract-mismatch' | 'candidate-contract-mismatch'): string {
  let current = rootPath;
  const segments = relativePath.split('/');
  for (let index = 0; index < segments.length; index += 1) {
    current = join(current, segments[index]!);
    let stat;
    try { stat = lstatSync(current); } catch { throw new SourcePreflightContractError(code, `Source path does not exist: ${relativePath}.`); }
    if (stat.isSymbolicLink()) throw new SourcePreflightContractError(code, `Source path contains a symbolic link: ${relativePath}.`);
    if (index === segments.length - 1 ? !stat.isFile() : !stat.isDirectory()) throw new SourcePreflightContractError(code, `Source path is not a regular file: ${relativePath}.`);
  }
  let resolved: string;
  try { resolved = realpathSync(current); } catch { throw new SourcePreflightContractError(code, `Source path cannot be resolved: ${relativePath}.`); }
  const root = realpathSync(rootPath);
  const targetRelative = relative(root, resolved);
  if (targetRelative === '..' || targetRelative.startsWith(`..${sep}`) || isAbsolute(targetRelative)) throw new SourcePreflightContractError(code, `Source path escapes the verified repository root: ${relativePath}.`);
  return resolved;
}

export function sourcePreflightV1(input: SourcePreflightInputV1): BenchmarkSourcePreflightResultV1 {
  const runner = input.runCommand ?? defaultRunner;
  try {
    if (!existsSync(input.rootPath)) return reject('infrastructure-failure', 'Repository root does not exist.');
    const verifiedRootPath = realpathSync(input.rootPath);
    const reportedRoot = commandText(runner('git', ['rev-parse', '--show-toplevel'], verifiedRootPath));
    if (reportedRoot === undefined) return reject('infrastructure-failure', 'Could not resolve repository root.');
    let verifiedReportedRoot: string;
    try { verifiedReportedRoot = realpathSync(reportedRoot); } catch { return reject('infrastructure-failure', 'Git reported a repository root that cannot be resolved.'); }
    const rootsEqual = relative(verifiedRootPath, verifiedReportedRoot) === '';
    if (!rootsEqual) return reject('infrastructure-failure', 'Git repository root differs from supplied root.');
    const commit = exactCommandText(runner('git', ['rev-parse', '--verify', 'HEAD^{commit}'], verifiedRootPath));
    const tree = exactCommandText(runner('git', ['rev-parse', '--verify', 'HEAD^{tree}'], verifiedRootPath));
    if (commit === undefined) return reject('infrastructure-failure', 'Invalid HEAD commit output.');
    if (tree === undefined) return reject('infrastructure-failure', 'Invalid HEAD tree output.');
    const status = runner('git', ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=none'], verifiedRootPath);
    if (status.status !== 0 || status.stderr.byteLength !== 0 || status.error !== undefined) return reject('infrastructure-failure', 'Git status failed.');
    if (status.stdout.byteLength !== 0) return reject('source-dirty', 'Git worktree status is not empty.');
    if (commit !== input.expectedAcceptedWp04Sha) return reject('source-sha-mismatch', 'HEAD does not match accepted WP04 SHA.');
    if (String(sha256BytesV1(status.stdout)) !== EMPTY_STATUS_SHA256 || String(emptyStatusDigest) !== EMPTY_STATUS_SHA256) {
      return reject('infrastructure-failure', 'Empty status digest does not match the v1 constant.');
    }
    if (existsSync(join(verifiedRootPath, '.gitmodules')) || hasGitlink(verifiedRootPath, runner)) return reject('infrastructure-failure', 'Git submodules or gitlinks are not allowed.');
    if (!(input.fixtureSemanticBytes instanceof Uint8Array)) throw new SourcePreflightContractError('fixture-contract-mismatch', 'Canonical fixture semantic bytes are required.');
    try { parseCanonicalJsonV1(input.fixtureSemanticBytes); } catch { throw new SourcePreflightContractError('fixture-contract-mismatch', 'Canonical fixture semantic bytes must be canonical JSON.'); }
    const fixtureSemanticDigest = sha256BytesV1(input.fixtureSemanticBytes);
    const fixtureMetadata = validateFixtureMetadata(input.fixture);
    if (fixtureMetadata.semanticSha256 !== fixtureSemanticDigest) return reject('fixture-contract-mismatch', 'Fixture semantic digest does not match canonical fixture bytes.');
    if (fixtureMetadata.id === 'wp04-golden-world-v1' && (!isBenchmarkWp04SemanticBytesV1(input.fixtureSemanticBytes) || fixtureSemanticDigest !== BENCHMARK_WP04_SEMANTIC_SHA256_V1)) return reject('fixture-contract-mismatch', 'WP04 fixture semantic bytes do not match the authoritative contract.');
    const candidateMetadata = validateCandidateMetadata(input.candidate);
    validateBuildMetadata(input.build);
    const fixturePaths = fixtureMetadata.sourcePaths;
    const fixtureDigest = fixtureMetadata.sourceFileSetSha256;
    const fixtureEntries = fixturePaths.map((path) => {
      canonicalRelativePathV1(path);
      const absolute = verifiedSourceFilePath(verifiedRootPath, path, 'fixture-contract-mismatch');
      return { path, bytes: new Uint8Array(readFileSync(absolute)) };
    });
    if (digestFileSetV1(fixtureEntries) !== fixtureDigest) return reject('fixture-contract-mismatch', 'Fixture fileset digest mismatch.');
    const candidatePaths = candidateMetadata.sourcePaths;
    const candidateDigest = candidateMetadata.sourceFileSetSha256;
    const candidateEntries = candidatePaths.map((path) => {
      canonicalRelativePathV1(path);
      const absolute = verifiedSourceFilePath(verifiedRootPath, path, 'candidate-contract-mismatch');
      return { path, bytes: new Uint8Array(readFileSync(absolute)) };
    });
    if (digestFileSetV1(candidateEntries) !== candidateDigest) return reject('candidate-contract-mismatch', 'Candidate fileset digest mismatch.');
    const distPath = join(verifiedRootPath, 'dist');
    if (!existsSync(distPath) || lstatSync(distPath).isSymbolicLink() || !lstatSync(distPath).isDirectory()) return reject('build-digest-mismatch', 'Build root dist/ does not exist.');
    const entries = listFiles(distPath);
    const actualBuild = digestBuildV1(entries);
    const actualFileCount = entries.length;
    const actualTotalBytes = entries.reduce((sum, entry) => sum + entry.bytes.byteLength, 0);
    const fileCount = safePositiveInteger(actualFileCount, 'Build file count');
    const totalBytes = safePositiveInteger(actualTotalBytes, 'Build byte count');
    if (input.build !== undefined && ((input.build as BenchmarkBuildBindingV1).sha256 !== actualBuild || (input.build as BenchmarkBuildBindingV1).fileCount !== actualFileCount || (input.build as BenchmarkBuildBindingV1).totalBytes !== actualTotalBytes)) {
      return reject('build-digest-mismatch', 'Build fileset binding does not match dist/.');
    }
    const build: BenchmarkBuildBindingV1 = { algorithmVersion: 'hestia-benchmark-build-sha256-v1', rootPath: 'dist', sha256: actualBuild, fileCount, totalBytes };
    const afterCommit = exactCommandText(runner('git', ['rev-parse', '--verify', 'HEAD^{commit}'], verifiedRootPath));
    const afterTree = exactCommandText(runner('git', ['rev-parse', '--verify', 'HEAD^{tree}'], verifiedRootPath));
    const afterStatus = runner('git', ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=none'], verifiedRootPath);
    if (afterCommit === undefined || afterTree === undefined || afterStatus.stderr.byteLength !== 0 || afterStatus.status !== 0 || afterStatus.error !== undefined) return reject('infrastructure-failure', 'Source changed during preflight.');
    if (afterStatus.stdout.byteLength !== 0) return reject('source-dirty', 'Git worktree became dirty during preflight.');
    if (afterCommit !== commit) return reject('source-sha-mismatch', 'Commit changed during preflight.');
    if (afterTree !== tree) return reject('source-tree-mismatch', 'Commit tree changed during preflight.');
    const verifiedFixture: BenchmarkFixtureContractBindingV1 = {
      id: fixtureMetadata.id,
      version: fixtureMetadata.version,
      semanticSha256: observedBinding(fixtureSemanticDigest),
      sourceFileSetSha256: observedBinding(fixtureDigest),
      sourcePaths: observedBinding(fixturePaths),
    };
    const verifiedCandidate: BenchmarkCandidateBindingV1 = {
      id: candidateMetadata.id,
      version: candidateMetadata.version,
      sourceFileSetSha256: observedBinding(candidateDigest),
      sourcePaths: observedBinding(candidatePaths),
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
    return { status: 'accepted', provenance };
  } catch (error) {
    if (error instanceof SourcePreflightContractError) return reject(error.code, error.message);
    return reject('infrastructure-failure', error instanceof Error ? error.message : 'Source preflight failed.');
  }
}

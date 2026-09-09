import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1, type Sha256DigestV1 } from '../contracts';
import { readFileBytesV1 } from '../provenance';
import { RunnerFailureErrorV1 } from './contractsV1';
import { runNoReplaceGitV1 } from './provenance/gitCommandV1';

declare const __BR03_SOURCE_COMMIT_SHA__: string | undefined;

const GIT_SHA = /^[0-9a-f]{40}$/;
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/;
const AUTHORITY_BRAND = Symbol('br03-runner-authority-v1');

export interface RunnerAuthorityV1 {
  readonly projectRoot: string;
  readonly runnerPath: string;
  readonly sourceCommitSha: string;
  readonly runnerSourceSha: Sha256DigestV1;
}

export function resolveRunnerBuildSourceCommitShaV1(): string | null {
  return typeof __BR03_SOURCE_COMMIT_SHA__ === 'string' ? __BR03_SOURCE_COMMIT_SHA__ : null;
}

export async function resolveRunnerSourceShaV1(): Promise<Sha256DigestV1> {
  const bytes = readFileBytesV1(fileURLToPath(import.meta.url), {
    maxFileBytes: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.maxFileBytes,
    maxAggregateBytes: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.maxAggregateBytes,
  });
  if (bytes.byteLength === 0) throw new Error('Runner executable is empty.');
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}` as Sha256DigestV1;
}

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function assertCurrentSourceCommitV1(projectRoot: string, expectedSourceCommitSha: string): void {
  const result = runNoReplaceGitV1(['rev-parse', '--verify', 'HEAD^{commit}'], projectRoot);
  if (result.status !== 0 || result.error !== undefined || (result.signal !== undefined && result.signal !== null) || result.stderr.byteLength !== 0) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', 'The current Git checkout could not be verified.', { cause: result.error });
  }
  let output: string;
  try {
    output = new TextDecoder('utf-8', { fatal: true }).decode(result.stdout);
  } catch (error) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', 'The current Git commit output is not valid UTF-8.', { cause: error });
  }
  if (output !== `${expectedSourceCommitSha}\n`) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', 'The current Git checkout does not match the expected source commit.');
  }
}

export async function createRunnerAuthorityV1(projectRoot: string, expectedSourceCommitSha: string): Promise<RunnerAuthorityV1> {
  const builtSourceCommitSha = resolveRunnerBuildSourceCommitShaV1();
  if (!GIT_SHA.test(expectedSourceCommitSha) || builtSourceCommitSha === null || builtSourceCommitSha !== expectedSourceCommitSha) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', 'The built runner was not built from the expected source commit.');
  }
  let resolvedRoot: string;
  let currentRunnerPath: string;
  let expectedRunnerPath: string;
  try {
    resolvedRoot = await realpath(projectRoot);
    currentRunnerPath = await realpath(fileURLToPath(import.meta.url));
    expectedRunnerPath = resolve(resolvedRoot, '.benchmark-runner', 'runner.mjs');
    const [currentStat, expectedStat, resolvedExpectedRunnerPath] = await Promise.all([
      lstat(fileURLToPath(import.meta.url)),
      lstat(expectedRunnerPath),
      realpath(expectedRunnerPath),
    ]);
    if (!currentStat.isFile() || currentStat.isSymbolicLink()
      || !expectedStat.isFile() || expectedStat.isSymbolicLink()
      || !samePath(currentRunnerPath, resolvedExpectedRunnerPath)) {
      throw new Error('Runner executable is not the exact built runner for the current Git checkout.');
    }
  } catch (error) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', 'Runner executable identity could not be proven for the current Git checkout.', { cause: error });
  }
  assertCurrentSourceCommitV1(resolvedRoot, expectedSourceCommitSha);
  const runnerSourceSha = await resolveRunnerSourceShaV1();
  const authority = {
    projectRoot: resolvedRoot,
    runnerPath: currentRunnerPath,
    sourceCommitSha: expectedSourceCommitSha,
    runnerSourceSha,
    [AUTHORITY_BRAND]: true as const,
  };
  return authority;
}

export function assertRunnerAuthorityV1(
  value: unknown,
  expected?: Partial<Pick<RunnerAuthorityV1, 'projectRoot' | 'sourceCommitSha' | 'runnerSourceSha'>>,
): asserts value is RunnerAuthorityV1 {
  if (value === null || typeof value !== 'object' || (value as Record<PropertyKey, unknown>)[AUTHORITY_BRAND] !== true) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', 'A validated built-runner authority is required.');
  }
  const authority = value as RunnerAuthorityV1;
  if (typeof authority.projectRoot !== 'string' || authority.projectRoot.length === 0
    || typeof authority.runnerPath !== 'string' || authority.runnerPath.length === 0
    || typeof authority.sourceCommitSha !== 'string' || !GIT_SHA.test(authority.sourceCommitSha)
    || typeof authority.runnerSourceSha !== 'string' || !SHA256_DIGEST.test(authority.runnerSourceSha)) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', 'The runner authority fields are invalid.');
  }
  if (expected?.projectRoot !== undefined && !samePath(authority.projectRoot, expected.projectRoot)) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', 'Runner authority project root does not match the expected root.');
  }
  if (expected?.sourceCommitSha !== undefined && authority.sourceCommitSha !== expected.sourceCommitSha) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', 'Runner authority source commit does not match the expected commit.');
  }
  if (expected?.runnerSourceSha !== undefined && authority.runnerSourceSha !== expected.runnerSourceSha) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', 'Runner authority digest does not match the expected runner.');
  }
}

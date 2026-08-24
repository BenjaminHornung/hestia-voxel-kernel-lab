import { lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1,
  type GitShaV1,
  type RepositoryRelativePathV1,
  type Sha256DigestV1,
} from '../../contracts';
import {
  compareUtf16,
  digestFileSetReadersV1,
  readFileBytesV1,
  repositoryRelativePathV1,
} from '../../provenance';
import { RunnerFailureErrorV1 } from '../contractsV1';
import { runNoReplaceGitV1 } from '../provenance/gitCommandV1';

export const VALIDATOR_ATTESTATION_COMMIT_SHA_V1 = 'e88978cbcd5504789a804fb25e353e08aaec1bd6' as GitShaV1;
export const VALIDATOR_ATTESTATION_ROOTS_V1 = ['src/benchmark/contracts', 'src/benchmark/provenance'] as const;

const GIT_SHA = /^[0-9a-f]{40}$/;
const MAX_VALIDATOR_FILE_BYTES = BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.commandOutputMaxBytes;
const MAX_VALIDATOR_TOTAL_BYTES = MAX_VALIDATOR_FILE_BYTES * 16;

export interface ValidatorAttestedFileV1 {
  readonly path: RepositoryRelativePathV1;
  readonly absolutePath: string;
  readonly bytes: Uint8Array;
}

export interface ValidatorAttestationSetV1 {
  readonly commitSha: GitShaV1;
  readonly files: readonly ValidatorAttestedFileV1[];
  readonly filesetDigest: Sha256DigestV1;
  readonly fileCount: number;
  readonly totalBytes: number;
}

function gitOutput(result: ReturnType<typeof runNoReplaceGitV1>, label: string): Uint8Array {
  if (result.stdout.byteLength >= MAX_VALIDATOR_FILE_BYTES
    || result.stderr.byteLength >= MAX_VALIDATOR_FILE_BYTES
    || result.stdout.byteLength + result.stderr.byteLength >= MAX_VALIDATOR_FILE_BYTES
    || result.status !== 0 || result.error !== undefined
    || (result.signal !== undefined && result.signal !== null) || result.stderr.byteLength !== 0) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', `Git ${label} failed or exceeded the v1 bound.`, { cause: result.error });
  }
  return result.stdout;
}

function parseTreePathsV1(bytes: Uint8Array, roots: readonly string[]): readonly { readonly path: RepositoryRelativePathV1; readonly objectSha: string }[] {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', 'Validator Git tree output is not valid UTF-8.', { cause: error });
  }
  if (!text.endsWith('\0')) throw new RunnerFailureErrorV1('source-preflight-rejected', 'Validator Git tree output is not NUL terminated.');
  const records = text.slice(0, -1).split('\0');
  if (records.length === 0 || records.some((record) => record.length === 0)) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', 'Validator Git tree output contains an empty record.');
  }
  const seen = new Set<string>();
  const seenCaseFolded = new Set<string>();
  const paths = records.map((record) => {
    const match = /^(\d{6}) (\w+) ([0-9a-f]{40})\t(.+)$/.exec(record);
    if (match === null) throw new RunnerFailureErrorV1('source-preflight-rejected', 'Validator Git tree output is malformed.');
    const [, mode, type, objectSha, rawPath] = match;
    if ((mode !== '100644' && mode !== '100755') || type !== 'blob' || !GIT_SHA.test(objectSha!)) {
      throw new RunnerFailureErrorV1('source-preflight-rejected', `Validator path has an unsupported Git entry: ${rawPath}.`);
    }
    if (!roots.some((root) => rawPath!.startsWith(`${root}/`))) {
      throw new RunnerFailureErrorV1('source-preflight-rejected', `Validator path is outside the fixed roots: ${rawPath}.`);
    }
    const path = repositoryRelativePathV1(rawPath!);
    if (path !== rawPath || seen.has(path) || seenCaseFolded.has(path.toLowerCase())) {
      throw new RunnerFailureErrorV1('source-preflight-rejected', `Validator path is duplicated or case-conflicting: ${rawPath}.`);
    }
    seen.add(path);
    seenCaseFolded.add(path.toLowerCase());
    return { path, objectSha: objectSha! };
  });
  if (paths.length === 0) throw new RunnerFailureErrorV1('source-preflight-rejected', 'Validator source closure is empty.');
  return paths.sort((left, right) => compareUtf16(left.path, right.path));
}

export function readValidatorAttestationSetAtCommitV1(
  projectRoot: string,
  commitSha: string,
  roots: readonly string[] = VALIDATOR_ATTESTATION_ROOTS_V1,
): ValidatorAttestationSetV1 {
  if (!GIT_SHA.test(commitSha)) throw new RunnerFailureErrorV1('source-preflight-rejected', 'Validator source commit is not a canonical Git SHA.');
  const treeBytes = gitOutput(runNoReplaceGitV1(['ls-tree', '-r', '-z', '--full-tree', commitSha, '--', ...roots], projectRoot), 'validator tree enumeration');
  const paths = parseTreePathsV1(treeBytes, roots);
  let totalBytes = 0;
  const files = paths.map(({ path, objectSha }) => {
    const committedBytes = gitOutput(runNoReplaceGitV1(['cat-file', 'blob', `${commitSha}:${path}`], projectRoot), `validator blob read for ${path}`);
    if (committedBytes.byteLength === 0 || committedBytes.byteLength > MAX_VALIDATOR_FILE_BYTES) {
      throw new RunnerFailureErrorV1('source-preflight-rejected', `Validator blob is empty or oversized: ${path}.`);
    }
    totalBytes += committedBytes.byteLength;
    if (totalBytes > MAX_VALIDATOR_TOTAL_BYTES) throw new RunnerFailureErrorV1('source-preflight-rejected', 'Validator source closure exceeds the v1 aggregate bound.');
    const absolutePath = resolve(projectRoot, ...path.split('/'));
    let currentBytes: Uint8Array;
    try {
      const stat = lstatSync(absolutePath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Validator source path is not a regular file.');
      currentBytes = readFileBytesV1(absolutePath, { maxFileBytes: MAX_VALIDATOR_FILE_BYTES, maxAggregateBytes: MAX_VALIDATOR_TOTAL_BYTES });
    } catch (error) {
      throw new RunnerFailureErrorV1('source-preflight-rejected', `Validator source path could not be read: ${path}.`, { cause: error });
    }
    const currentHash = new TextDecoder('utf-8', { fatal: true }).decode(gitOutput(
      runNoReplaceGitV1(['hash-object', `--path=${path}`, '--stdin'], projectRoot, currentBytes),
      `working validator hash for ${path}`,
    )).trim();
    if (currentHash !== objectSha) {
      throw new RunnerFailureErrorV1('source-preflight-rejected', `Validator source path is not Git-bound to ${commitSha}: ${path}.`);
    }
    return { path, absolutePath, bytes: new Uint8Array(committedBytes) };
  });
  const digest = digestFileSetReadersV1(files.map(({ path, bytes }) => ({ path, read: () => bytes })), 'fileset', {
    maxFiles: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.maxFiles,
    maxFileBytes: MAX_VALIDATOR_FILE_BYTES,
    maxAggregateBytes: MAX_VALIDATOR_TOTAL_BYTES,
    digestChunkBytes: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.digestChunkBytes,
  });
  return { commitSha: commitSha as GitShaV1, files, filesetDigest: digest.digest, fileCount: digest.fileCount, totalBytes: digest.totalBytes };
}

export function readFixedValidatorAttestationSetV1(projectRoot: string): ValidatorAttestationSetV1 {
  return readValidatorAttestationSetAtCommitV1(projectRoot, VALIDATOR_ATTESTATION_COMMIT_SHA_V1);
}

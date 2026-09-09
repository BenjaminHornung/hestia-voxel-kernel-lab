import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1, BR01_ACCEPTED_WP04_SHA, EMPTY_STATUS_SHA256 } from '../../../../src/benchmark/contracts/versions';
import { BENCHMARK_SOURCE_FIXTURE_BINDINGS_V1, BENCHMARK_WP04_SEMANTIC_SHA256_V1, getBenchmarkWp04SemanticBytesV1 } from '../../../../src/benchmark/contracts/scenarioRegistryV1';
import { sourcePreflightV1, verifyBuildHandoffV1, type SourcePreflightCommandResultV1, type SourcePreflightResultV1 } from '../../../../src/benchmark/provenance/sourcePreflightV1';
import { digestBuildV1, digestFileSetPathsV1, digestFileSetV1, sha256BytesV1 } from '../../../../src/benchmark/provenance/fileSetDigestV1';
import { canonicalizeJsonV1 } from '../../../../src/benchmark/provenance/canonicalJsonV1';
import { validateBenchmarkRunStructureV1 } from '../../../../src/benchmark/contracts/validateV1';
import { createBenchmarkCaseDocumentV1 } from '../contracts/benchmark-case-fixtures-v1';

const empty = new Uint8Array();
const FIXTURE_SEMANTIC_BYTES = canonicalizeJsonV1({ fixtureContractId: 'fixture-v1', version: 1 });
const FIXTURE_SEMANTIC_DIGEST = sha256BytesV1(FIXTURE_SEMANTIC_BYTES);
const result = (stdout: string | Uint8Array, status = 0): SourcePreflightCommandResultV1 => ({ status, stdout: typeof stdout === 'string' ? new TextEncoder().encode(`${stdout}\n`) : stdout, stderr: empty });
const emptyResult = (): SourcePreflightCommandResultV1 => ({ status: 0, stdout: empty, stderr: empty });
const CANDIDATE_BLOB_OID = 'c'.repeat(40);
const REAL_GIT_COMMAND_TIMEOUT_MS = 30_000;
const REAL_GIT_TEST_TIMEOUT_MS = 120_000;

interface CandidateCommandOptions {
  readonly treeOid?: string;
  readonly hashOid?: string;
  readonly returnedPath?: string;
}

function candidateCommandResult(args: readonly string[], options: CandidateCommandOptions = {}): SourcePreflightCommandResultV1 | undefined {
  if (args[0] !== 'ls-tree' && args[0] !== 'hash-object') return undefined;
  const path = args[args.length - 1];
  if (path === undefined) return emptyResult();
  const treeOid = options.treeOid ?? CANDIDATE_BLOB_OID;
  if (args[0] === 'ls-tree') {
    const returnedPath = options.returnedPath ?? path;
    return { status: 0, stdout: new TextEncoder().encode(`100644 blob ${treeOid}\t${returnedPath}\0`), stderr: empty };
  }
  return result(options.hashOid ?? treeOid);
}

const observed = <T>(value: T) => ({ status: 'observed' as const, value, sourceRef: 'capture-v1', stability: 'stable' as const });
const declared = <T>(value: T) => ({ status: 'declared' as const, value, sourceRef: 'plan-v1', stability: 'run-config' as const });
const WP04_SOURCE_PATHS = ['evidence/wp04/manifest.json', 'tests/contracts/wp02FixtureGolden.ts', 'tests/contracts/wp03GreedyGolden.ts', 'tests/contracts/wp04AoGolden.ts'] as const;
// Controlled failure is intentional: tests must never fall back to current-checkout bytes for historical c64 data.
function loadWp04SourceBlobs(): ReadonlyMap<string, Uint8Array> {
  try {
    return new Map(WP04_SOURCE_PATHS.map((path) => [
      path,
      new Uint8Array(execFileSync('git', ['cat-file', 'blob', `${BR01_ACCEPTED_WP04_SHA}:${path}`], { cwd: realpathSync('.') })),
    ] as const));
  } catch (error) {
    throw new Error(`Historical WP04 c64 Git blob object is unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const WP04_SOURCE_BLOBS = loadWp04SourceBlobs();
const WP04_SOURCE_BLOB_OIDS = new Map<string, string>([
  ['evidence/wp04/manifest.json', '370ee64a843b0f138c59f4a11c4b36807dac91d4'],
  ['tests/contracts/wp02FixtureGolden.ts', 'bfb4e465efc2e5bafe6132979f4a486ff3431413'],
  ['tests/contracts/wp03GreedyGolden.ts', 'b790fdbdca4d270c655ab1d82b7a89facd58cccd'],
  ['tests/contracts/wp04AoGolden.ts', '41e9381169fed9ba3799931f53989786c9c95f27'],
]);

function acceptedWp04Blob(path: string): Uint8Array {
  const bytes = WP04_SOURCE_BLOBS.get(path as typeof WP04_SOURCE_PATHS[number]);
  if (bytes === undefined) throw new Error(`Unknown WP04 source path: ${path}`);
  return new Uint8Array(bytes);
}

function wp04HistoricalCommand(rawArgs: readonly string[]): SourcePreflightCommandResultV1 | undefined {
  const args = rawArgs[0] === '--no-replace-objects' ? rawArgs.slice(1) : rawArgs;
  if (args[0] === 'cat-file' && args[1] === '-t' && args[2] === BR01_ACCEPTED_WP04_SHA) return result('commit');
  const path = args[0] === 'cat-file' && (args[1] === '-t' || args[1] === '-s')
    ? [...WP04_SOURCE_BLOB_OIDS.entries()].find(([, oid]) => oid === args[2])?.[0]
    : args[0] === 'cat-file' && args[1] === 'blob' && args[2]?.startsWith(`${BR01_ACCEPTED_WP04_SHA}:`)
      ? args[2].slice(`${BR01_ACCEPTED_WP04_SHA}:`.length)
    : args[args.length - 1];
  if (path === undefined || !WP04_SOURCE_BLOBS.has(path)) return undefined;
  const bytes = acceptedWp04Blob(path);
  const oid = WP04_SOURCE_BLOB_OIDS.get(path)!;
  if (args[0] === 'ls-tree' && args[3] === BR01_ACCEPTED_WP04_SHA) return { status: 0, stdout: new TextEncoder().encode(`100644 blob ${oid}\t${path}\0`), stderr: empty };
  if (args[0] === 'cat-file' && args[1] === '-t') return result('blob');
  if (args[0] === 'cat-file' && args[1] === '-s') return result(String(bytes.byteLength));
  if (args[0] === 'cat-file' && args[1] === 'blob' && args[2] === `${BR01_ACCEPTED_WP04_SHA}:${path}`) return { status: 0, stdout: bytes, stderr: empty };
  return undefined;
}

function runWp04Preflight(options: {
  readonly currentSourceCommitSha?: string;
  readonly mutateFixture?: (fixture: any) => void;
  readonly mutateCurrentFile?: (path: string, bytes: Uint8Array) => Uint8Array;
  readonly omitCurrentHistoricalFiles?: boolean;
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'br01-wp04-preflight-'));
  try {
    const blobs = WP04_SOURCE_PATHS.map((path) => ({ path, bytes: acceptedWp04Blob(path) }));
    if (!options.omitCurrentHistoricalFiles) {
      for (const entry of blobs) {
        const target = join(root, ...entry.path.split('/'));
        mkdirSync(join(target, '..'), { recursive: true });
        writeFileSync(target, options.mutateCurrentFile?.(entry.path, entry.bytes) ?? entry.bytes);
      }
    }
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'candidate.txt'), new TextEncoder().encode('candidate'));
    writeFileSync(join(root, 'dist', 'index.js'), new TextEncoder().encode('build'));
    const sourceDigest = digestFileSetV1(blobs);
    const fixture = {
      id: 'wp04-golden-world-v1',
      version: 1,
      semanticSha256: observed(BENCHMARK_WP04_SEMANTIC_SHA256_V1),
      sourceCommitSha: observed(BR01_ACCEPTED_WP04_SHA),
      sourceFileSetSha256: observed(sourceDigest),
      sourcePaths: observed([...WP04_SOURCE_PATHS]),
    };
    options.mutateFixture?.(fixture);
    const candidateEntries = [{ path: 'candidate.txt', bytes: new TextEncoder().encode('candidate') }];
    const currentSourceCommitSha = options.currentSourceCommitSha ?? 'a'.repeat(40);
    const response = (_command: string, args: readonly string[]): SourcePreflightCommandResultV1 => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return result(root);
      if (args[0] === 'rev-parse' && args[2] === 'HEAD^{commit}') return result(currentSourceCommitSha);
      if (args[0] === 'rev-parse' && args[2]?.endsWith('^{tree}')) return result('a'.repeat(40));
      if (args[0] === 'status' || args[0] === 'ls-files') return emptyResult();
      const historical = wp04HistoricalCommand(args);
      if (historical !== undefined) return historical;
      const candidate = candidateCommandResult(args);
      if (candidate !== undefined) return candidate;
      return emptyResult();
    };
    return sourcePreflightV1({
      rootPath: root,
      expectedSourceCommitSha: currentSourceCommitSha,
      fixtureSemanticBytes: getBenchmarkWp04SemanticBytesV1(),
      fixture: fixture as never,
      candidate: { id: 'candidate-v1', version: 1, sourceFileSetSha256: observed(digestFileSetV1(candidateEntries)), sourcePaths: observed(['candidate.txt']) } as never,
      runCommand: response,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function pathPreflightOutcome(owner: 'fixture' | 'candidate', invalidPaths: readonly string[]) {
  const root = mkdtempSync(join(tmpdir(), `br01-${owner}-path-order-`));
  try {
    const encoder = new TextEncoder();
    mkdirSync(join(root, 'dist'));
    const fixtureEntries = [{ path: 'fixture-a.txt', bytes: encoder.encode('fixture-a') }, { path: 'fixture-b.txt', bytes: encoder.encode('fixture-b') }];
    const candidateEntries = [{ path: 'candidate-a.txt', bytes: encoder.encode('candidate-a') }, { path: 'candidate-b.txt', bytes: encoder.encode('candidate-b') }];
    for (const entry of [...fixtureEntries, ...candidateEntries]) writeFileSync(join(root, entry.path), entry.bytes);
    writeFileSync(join(root, 'dist', 'index.js'), encoder.encode('build'));
    const fixturePaths = owner === 'fixture' ? invalidPaths : ['fixture-a.txt'];
    const candidatePaths = owner === 'candidate' ? invalidPaths : ['candidate-a.txt'];
    const fixtureDigestEntries = owner === 'fixture' ? fixtureEntries : [fixtureEntries[0]!];
    const candidateDigestEntries = owner === 'candidate' ? candidateEntries : [candidateEntries[0]!];
      const fixture = { id: 'fixture-v1', version: 1, semanticSha256: observed(FIXTURE_SEMANTIC_DIGEST), sourceCommitSha: declared(BR01_ACCEPTED_WP04_SHA), sourceFileSetSha256: observed(digestFileSetV1(fixtureDigestEntries)), sourcePaths: observed(fixturePaths) };
    const candidate = { id: 'candidate-v1', version: 1, sourceFileSetSha256: observed(digestFileSetV1(candidateDigestEntries)), sourcePaths: observed(candidatePaths) };
    const response = (_command: string, args: readonly string[]): SourcePreflightCommandResultV1 => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return result(root);
      if (args[0] === 'rev-parse' && args[2] === 'HEAD^{commit}') return result(BR01_ACCEPTED_WP04_SHA);
      if (args[0] === 'rev-parse' && args[2]?.endsWith('^{tree}')) return result('a'.repeat(40));
      if (args[0] === 'status' || args[0] === 'ls-files') return emptyResult();
      const candidate = candidateCommandResult(args);
      if (candidate !== undefined) return candidate;
      return emptyResult();
    };
    return sourcePreflightV1({ rootPath: root, expectedSourceCommitSha: BR01_ACCEPTED_WP04_SHA, fixtureSemanticBytes: FIXTURE_SEMANTIC_BYTES, fixture: fixture as never, candidate: candidate as never, runCommand: response });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function metadataPreflightOutcome(
  mutate: (input: { readonly fixture: any; readonly candidate: any; readonly build: any }) => void,
  prepareRoot: (root: string) => void = () => undefined,
  fixtureSemanticBytes: Uint8Array | null = FIXTURE_SEMANTIC_BYTES,
) {
  const root = mkdtempSync(join(tmpdir(), 'br01-metadata-'));
  try {
    const encoder = new TextEncoder();
    const fixtureEntries = [{ path: 'fixture.txt', bytes: encoder.encode('fixture') }];
    const candidateEntries = [{ path: 'candidate.txt', bytes: encoder.encode('candidate') }];
    const buildEntries = [{ path: 'index.js', bytes: encoder.encode('build') }];
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'fixture.txt'), fixtureEntries[0]!.bytes);
    writeFileSync(join(root, 'candidate.txt'), candidateEntries[0]!.bytes);
    writeFileSync(join(root, 'dist', 'index.js'), buildEntries[0]!.bytes);
    prepareRoot(root);
    const input = {
       fixture: { id: 'fixture-v1', version: 1, semanticSha256: observed(FIXTURE_SEMANTIC_DIGEST), sourceCommitSha: declared(BR01_ACCEPTED_WP04_SHA), sourceFileSetSha256: observed(digestFileSetV1(fixtureEntries)), sourcePaths: observed(['fixture.txt']) },
      candidate: { id: 'candidate-v1', version: 1, sourceFileSetSha256: observed(digestFileSetV1(candidateEntries)), sourcePaths: observed(['candidate.txt']) },
      build: { algorithmVersion: 'hestia-benchmark-build-sha256-v1', rootPath: 'dist', sha256: digestBuildV1(buildEntries), fileCount: 1, totalBytes: 5 },
    };
    mutate(input);
    const response = (_command: string, args: readonly string[]): SourcePreflightCommandResultV1 => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return result(root);
      if (args[0] === 'rev-parse' && args[2] === 'HEAD^{commit}') return result(BR01_ACCEPTED_WP04_SHA);
      if (args[0] === 'rev-parse' && args[2]?.endsWith('^{tree}')) return result('a'.repeat(40));
      if (args[0] === 'status' || args[0] === 'ls-files') return emptyResult();
      const candidate = candidateCommandResult(args);
      if (candidate !== undefined) return candidate;
      return emptyResult();
    };
       return sourcePreflightV1({
         rootPath: root,
         expectedSourceCommitSha: BR01_ACCEPTED_WP04_SHA,
         ...(fixtureSemanticBytes === null ? {} : { fixtureSemanticBytes }),
         fixture: input.fixture as never,
         candidate: input.candidate as never,
         build: input.build as never,
         runCommand: response,
       } as never);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function candidateBindingPreflight(options: {
  readonly candidatePath?: string;
  readonly candidateBytes?: Uint8Array;
  readonly candidateDigest?: string;
  readonly returnedPath?: string;
  readonly treeOid?: string;
  readonly hashOid?: string;
  readonly candidateCommand?: (args: readonly string[], callIndex: number, rootPath: string, candidatePath: string) => SourcePreflightCommandResultV1 | undefined;
} = {}): SourcePreflightResultV1 {
  const root = mkdtempSync(join(tmpdir(), 'br01-candidate-binding-'));
  try {
    const candidatePath = options.candidatePath ?? 'candidate.txt';
    const candidateBytes = options.candidateBytes ?? new TextEncoder().encode('candidate');
    const candidateTarget = join(root, ...candidatePath.split('/'));
    mkdirSync(join(root, 'dist'), { recursive: true });
    mkdirSync(join(candidateTarget, '..'), { recursive: true });
    writeFileSync(join(root, 'fixture.txt'), new TextEncoder().encode('fixture'));
    writeFileSync(candidateTarget, candidateBytes);
    writeFileSync(join(root, 'dist', 'index.js'), new TextEncoder().encode('build'));
    const fixtureEntries = [{ path: 'fixture.txt', bytes: new TextEncoder().encode('fixture') }];
    const candidateEntries = [{ path: candidatePath, bytes: candidateBytes }];
    const candidateDigest = options.candidateDigest ?? digestFileSetV1(candidateEntries);
    const fixture = {
      id: 'fixture-v1', version: 1, semanticSha256: observed(FIXTURE_SEMANTIC_DIGEST), sourceCommitSha: declared(BR01_ACCEPTED_WP04_SHA),
      sourceFileSetSha256: observed(digestFileSetV1(fixtureEntries)), sourcePaths: observed(['fixture.txt']),
    };
    let candidateCallIndex = 0;
    const response = (_command: string, args: readonly string[]): SourcePreflightCommandResultV1 => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return result(root);
      if (args[0] === 'rev-parse' && args[2] === 'HEAD^{commit}') return result(BR01_ACCEPTED_WP04_SHA);
      if (args[0] === 'rev-parse' && args[2]?.endsWith('^{tree}')) return result('a'.repeat(40));
      if (args[0] === 'status') return emptyResult();
      const candidate = candidateCommandResult(args, {
        treeOid: options.treeOid,
        hashOid: options.hashOid,
        returnedPath: options.returnedPath,
      });
      if (candidate !== undefined) {
        const overridden = options.candidateCommand?.(args, candidateCallIndex, root, candidatePath);
        candidateCallIndex += 1;
        return overridden ?? candidate;
      }
      return emptyResult();
    };
    return sourcePreflightV1({
      rootPath: root,
      expectedSourceCommitSha: BR01_ACCEPTED_WP04_SHA,
      fixtureSemanticBytes: FIXTURE_SEMANTIC_BYTES,
      fixture: fixture as never,
      candidate: { id: 'candidate-v1', version: 1, sourceFileSetSha256: observed(candidateDigest), sourcePaths: observed([candidatePath]) } as never,
      runCommand: response,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function localGit(root: string, args: readonly string[]): string {
  return String(execFileSync('git', [...args], { cwd: root, encoding: 'utf8', timeout: REAL_GIT_COMMAND_TIMEOUT_MS })).trim();
}

function realGitCandidatePreflight(root: string, expectedSourceCommitSha: string, candidatePath: string, candidateBytes: Uint8Array): SourcePreflightResultV1 {
  const fixtureBytes = new TextEncoder().encode('fixture');
  return sourcePreflightV1({
    rootPath: root,
    expectedSourceCommitSha,
    fixtureSemanticBytes: FIXTURE_SEMANTIC_BYTES,
    fixture: {
      id: 'fixture-v1',
      version: 1,
      semanticSha256: observed(FIXTURE_SEMANTIC_DIGEST),
      sourceCommitSha: declared(expectedSourceCommitSha),
      sourceFileSetSha256: observed(digestFileSetV1([{ path: 'fixture.txt', bytes: fixtureBytes }])),
      sourcePaths: observed(['fixture.txt']),
    } as never,
    candidate: {
      id: 'candidate-v1',
      version: 1,
      sourceFileSetSha256: observed(digestFileSetV1([{ path: candidatePath, bytes: candidateBytes }])),
      sourcePaths: observed([candidatePath]),
    } as never,
  });
}

function runRealGitCandidatePreflight(options: {
  readonly candidatePath: string;
  readonly candidateBytes: Uint8Array;
  readonly mutate?: (root: string) => void;
}): SourcePreflightResultV1 {
  const root = mkdtempSync(join(tmpdir(), 'br01-real-git-candidate-'));
  try {
    const encoder = new TextEncoder();
    writeFileSync(join(root, '.gitignore'), 'dist/\nnode_modules/\n');
    writeFileSync(join(root, 'fixture.txt'), encoder.encode('fixture'));
    writeFileSync(join(root, 'candidate.txt'), encoder.encode('candidate'));
    writeFileSync(join(root, 'unrelated.txt'), encoder.encode('unchanged'));
    localGit(root, ['init', '--quiet']);
    localGit(root, ['config', 'user.name', 'BR01 test']);
    localGit(root, ['config', 'user.email', 'br01-test@example.invalid']);
    localGit(root, ['add', '--', '.gitignore', 'fixture.txt', 'candidate.txt', 'unrelated.txt']);
    localGit(root, ['commit', '--quiet', '-m', 'initial']);
    const expectedSourceCommitSha = localGit(root, ['rev-parse', '--verify', 'HEAD']);
    const sourceRoot = localGit(root, ['rev-parse', '--show-toplevel']);

    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(join(root, 'dist', 'index.js'), encoder.encode('build'));
    mkdirSync(join(root, 'node_modules', 'vendor'), { recursive: true });
    writeFileSync(join(root, 'node_modules', 'vendor', 'index.js'), encoder.encode('vendor'));
    const candidateTarget = join(root, ...options.candidatePath.split('/'));
    mkdirSync(join(candidateTarget, '..'), { recursive: true });
    writeFileSync(candidateTarget, options.candidateBytes);
    options.mutate?.(root);

    return realGitCandidatePreflight(sourceRoot, expectedSourceCommitSha, options.candidatePath, options.candidateBytes);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('BR01 source preflight', () => {
  it('uses the exact accepted SHA and empty-status digest contract', () => {
    expect(BR01_ACCEPTED_WP04_SHA).toHaveLength(40);
    expect(EMPTY_STATUS_SHA256).toBe('sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('fails closed for a dirty injected status command', () => {
    expect(existsSync('.')).toBe(true);
    const calls: string[] = [];
    const response = (command: string, args: readonly string[]): SourcePreflightCommandResultV1 => {
      calls.push(`${command} ${args.join(' ')}`);
       if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return result(realpathSync('.'));
      if (args[0] === 'rev-parse' && args[2] === 'HEAD^{commit}') return result(BR01_ACCEPTED_WP04_SHA);
       if (args[0] === 'rev-parse' && args[2]?.endsWith('^{tree}')) return result('a'.repeat(40));
      if (args[0] === 'status') return result('1 .M file.ts');
      const candidate = candidateCommandResult(args);
      if (candidate !== undefined) return candidate;
      return result('');
    };
    const outcome = sourcePreflightV1({
      rootPath: '.',
      expectedSourceCommitSha: BR01_ACCEPTED_WP04_SHA,
      fixtureSemanticBytes: FIXTURE_SEMANTIC_BYTES,
      fixture: {} as never,
      candidate: {
        id: 'candidate-v1',
        version: 1,
        sourceFileSetSha256: observed(digestFileSetV1([{ path: 'candidate.txt', bytes: new TextEncoder().encode('candidate') }])),
        sourcePaths: observed(['candidate.txt']),
      } as never,
      runCommand: response,
    });
    expect(outcome).toMatchObject({ status: 'rejected', code: 'source-dirty' });
    expect(calls.some((call) => call.includes('--porcelain=v2'))).toBe(true);
  });

  it('rejects an unexpected accepted SHA before reading source files', () => {
    const response = (_command: string, args: readonly string[]): SourcePreflightCommandResultV1 => {
       if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return result(realpathSync('.'));
      if (args[0] === 'rev-parse' && args[2] === 'HEAD^{commit}') return result(BR01_ACCEPTED_WP04_SHA);
       if (args[0] === 'rev-parse' && args[2]?.endsWith('^{tree}')) return result('a'.repeat(40));
      if (args[0] === 'status') return emptyResult();
      const candidate = candidateCommandResult(args);
      if (candidate !== undefined) return candidate;
      return emptyResult();
    };
    const outcome = sourcePreflightV1({ rootPath: '.', expectedSourceCommitSha: 'b'.repeat(40), fixtureSemanticBytes: FIXTURE_SEMANTIC_BYTES, fixture: {} as never, candidate: {} as never, runCommand: response });
    expect(outcome).toMatchObject({ status: 'rejected', code: 'source-sha-mismatch' });
  });
  it('accepts a current source commit later than the historical c64 fixture owner', () => {
    const currentSourceCommitSha = 'a'.repeat(40);
    const outcome = runWp04Preflight({ currentSourceCommitSha });
    expect(outcome).toMatchObject({ status: 'accepted' });
    if (outcome.status === 'accepted') {
      expect(outcome.provenance.commitSha).toBe(currentSourceCommitSha);
      expect(outcome.provenance.fixture.sourceCommitSha).toMatchObject({ status: 'observed', value: BR01_ACCEPTED_WP04_SHA });
    }
  });
  it('rejects a WP04 fixture commit that is not the historical owner binding', () => {
    expect(runWp04Preflight({ mutateFixture: (fixture) => { fixture.sourceCommitSha.value = 'a'.repeat(40); } })).toMatchObject({ status: 'rejected', code: 'fixture-contract-mismatch' });
  });
  it('rejects a WP04 fixture fileset digest that is not the historical owner binding', () => {
    expect(runWp04Preflight({ mutateFixture: (fixture) => { fixture.sourceFileSetSha256.value = `sha256:${'b'.repeat(64)}`; } })).toMatchObject({ status: 'rejected', code: 'fixture-contract-mismatch' });
  });
  it('does not let current bytes at the historical paths redefine c64 fixture blobs', () => {
    const outcome = runWp04Preflight({ mutateCurrentFile: (path, bytes) => path === WP04_SOURCE_PATHS[0] ? new Uint8Array([...bytes, 0]) : bytes });
    expect(outcome).toMatchObject({ status: 'accepted' });
  });
  it('accepts c64 historical blobs when all historical paths are absent from the current checkout', () => {
    expect(runWp04Preflight({ omitCurrentHistoricalFiles: true })).toMatchObject({ status: 'accepted' });
  });

  it('rejects a git root mismatch before reading fixture or build files', () => {
    const root = mkdtempSync(join(tmpdir(), 'br01-root-mismatch-'));
    try {
      const calls: string[] = [];
      const response = (command: string, args: readonly string[], cwd: string): SourcePreflightCommandResultV1 => {
        calls.push(`${command} ${args.join(' ')} ${cwd}`);
        return args[0] === 'rev-parse' && args[1] === '--show-toplevel' ? result(realpathSync('.')) : emptyResult();
      };
      const outcome = sourcePreflightV1({ rootPath: root, expectedSourceCommitSha: BR01_ACCEPTED_WP04_SHA, fixtureSemanticBytes: FIXTURE_SEMANTIC_BYTES, fixture: {} as never, candidate: {} as never, runCommand: response });
      expect(outcome).toMatchObject({ status: 'rejected', code: 'infrastructure-failure' });
      expect(calls).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a commit-tree change after the read-only preflight work', () => {
    const root = mkdtempSync(join(tmpdir(), 'br01-preflight-'));
    try {
      const encoder = new TextEncoder();
      mkdirSync(join(root, 'dist'));
      writeFileSync(join(root, 'fixture.txt'), encoder.encode('fixture'));
      writeFileSync(join(root, 'candidate.txt'), encoder.encode('candidate'));
      writeFileSync(join(root, 'dist', 'index.js'), encoder.encode('build'));
      const fixtureEntries = [{ path: 'fixture.txt', bytes: encoder.encode('fixture') }];
      const candidateEntries = [{ path: 'candidate.txt', bytes: encoder.encode('candidate') }];
      const fixture = {
         id: 'fixture-v1', version: 1, semanticSha256: observed(FIXTURE_SEMANTIC_DIGEST), sourceCommitSha: declared(BR01_ACCEPTED_WP04_SHA),
         sourceFileSetSha256: observed(digestFileSetV1(fixtureEntries)), sourcePaths: observed(['fixture.txt']),
      };
      const candidate = {
         id: 'candidate-v1', version: 1, sourceFileSetSha256: observed(digestFileSetV1(candidateEntries)), sourcePaths: observed(['candidate.txt']),
      };
      let treeReads = 0;
      const response = (_command: string, args: readonly string[]): SourcePreflightCommandResultV1 => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return result(root);
        if (args[0] === 'rev-parse' && args[2] === 'HEAD^{commit}') return result(BR01_ACCEPTED_WP04_SHA);
        if (args[0] === 'rev-parse' && args[2]?.endsWith('^{tree}')) return result(treeReads++ === 0 ? 'a'.repeat(40) : 'b'.repeat(40));
        if (args[0] === 'status') return emptyResult();
        if (args[0] === 'ls-files') return emptyResult();
        const candidate = candidateCommandResult(args);
        if (candidate !== undefined) return candidate;
        return emptyResult();
      };
       const outcome = sourcePreflightV1({ rootPath: root, expectedSourceCommitSha: BR01_ACCEPTED_WP04_SHA, fixtureSemanticBytes: FIXTURE_SEMANTIC_BYTES, fixture: fixture as never, candidate: candidate as never, runCommand: response });
      expect(outcome).toMatchObject({ status: 'rejected', code: 'source-tree-mismatch' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('emits observed source bindings after verifying declared source claims', () => {
    const root = mkdtempSync(join(tmpdir(), 'br01-observed-bindings-'));
    try {
      const encoder = new TextEncoder();
      mkdirSync(join(root, 'dist'));
      writeFileSync(join(root, 'fixture.txt'), encoder.encode('fixture'));
      writeFileSync(join(root, 'candidate.txt'), encoder.encode('candidate'));
      writeFileSync(join(root, 'dist', 'index.js'), encoder.encode('build'));
      const fixtureEntries = [{ path: 'fixture.txt', bytes: encoder.encode('fixture') }];
      const candidateEntries = [{ path: 'candidate.txt', bytes: encoder.encode('candidate') }];
      const fixture = {
         id: 'fixture-v1', version: 1, semanticSha256: observed(FIXTURE_SEMANTIC_DIGEST), sourceCommitSha: declared(BR01_ACCEPTED_WP04_SHA),
        sourceFileSetSha256: declared(digestFileSetV1(fixtureEntries)), sourcePaths: declared(['fixture.txt']),
      };
      const candidate = {
        id: 'candidate-v1', version: 1, sourceFileSetSha256: declared(digestFileSetV1(candidateEntries)), sourcePaths: declared(['candidate.txt']),
      };
      const response = (_command: string, args: readonly string[]): SourcePreflightCommandResultV1 => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return result(root);
        if (args[0] === 'rev-parse' && args[2] === 'HEAD^{commit}') return result(BR01_ACCEPTED_WP04_SHA);
        if (args[0] === 'rev-parse' && args[2]?.endsWith('^{tree}')) return result('a'.repeat(40));
        if (args[0] === 'status') return emptyResult();
        if (args[0] === 'ls-files') return emptyResult();
        const candidate = candidateCommandResult(args);
        if (candidate !== undefined) return candidate;
        return emptyResult();
      };
       const outcome = sourcePreflightV1({ rootPath: root, expectedSourceCommitSha: BR01_ACCEPTED_WP04_SHA, fixtureSemanticBytes: FIXTURE_SEMANTIC_BYTES, fixture: fixture as never, candidate: candidate as never, runCommand: response });
      expect(outcome.status).toBe('accepted');
      if (outcome.status === 'accepted') {
         expect(outcome.provenance.fixture.semanticSha256).toMatchObject({ status: 'observed', value: FIXTURE_SEMANTIC_DIGEST });
        expect(outcome.provenance.fixture.sourceFileSetSha256.status).toBe('observed');
        expect(outcome.provenance.fixture.sourcePaths.status).toBe('observed');
        expect(outcome.provenance.candidate.sourceFileSetSha256.status).toBe('observed');
        expect(outcome.provenance.candidate.sourcePaths.status).toBe('observed');
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('rejects missing canonical fixture semantic bytes', () => {
    expect(metadataPreflightOutcome(() => undefined, () => undefined, null)).toMatchObject({ status: 'rejected', code: 'fixture-contract-mismatch' });
  });
  it('rejects canonical fixture semantic bytes that do not match the fixture digest', () => {
    expect(metadataPreflightOutcome(() => undefined, () => undefined, canonicalizeJsonV1({ fixtureContractId: 'different-fixture-v1', version: 1 }))).toMatchObject({ status: 'rejected', code: 'fixture-contract-mismatch' });
  });
  it.each([
    ['non-JSON', new TextEncoder().encode('fixture-contract-v1')],
    ['non-canonical JSON', new TextEncoder().encode('{"version":1,"fixtureContractId":"fixture-v1"}')],
  ] as const)('rejects %s fixture semantic bytes before hashing', (_label, bytes) => {
    expect(metadataPreflightOutcome(() => undefined, () => undefined, bytes)).toMatchObject({ status: 'rejected', code: 'fixture-contract-mismatch' });
  });
  it.each([
    ['declared', (input: any) => { input.fixture.semanticSha256 = declared(`sha256:${'a'.repeat(64)}`); }],
    ['observed', (input: any) => { input.fixture.semanticSha256 = observed(`sha256:${'b'.repeat(64)}`); }],
  ] as const)('rejects an arbitrary %s semantic digest without promoting it', (_label, mutate) => {
    expect(metadataPreflightOutcome(mutate)).toMatchObject({ status: 'rejected', code: 'fixture-contract-mismatch' });
  });
  it('promotes a matching declared semantic digest only from canonical fixture bytes', () => {
    const outcome = metadataPreflightOutcome((input) => {
      input.fixture.semanticSha256 = declared(FIXTURE_SEMANTIC_DIGEST);
    });
    expect(outcome).toMatchObject({ status: 'accepted' });
    if (outcome.status === 'accepted') expect(outcome.provenance.fixture.semanticSha256).toMatchObject({ status: 'observed', value: FIXTURE_SEMANTIC_DIGEST });
  });
  it('preserves a declared synthetic fixture source commit without promoting it', () => {
    const outcome = metadataPreflightOutcome((input) => {
      input.fixture.sourceCommitSha = declared(BR01_ACCEPTED_WP04_SHA);
    });
    expect(outcome).toMatchObject({ status: 'accepted' });
    if (outcome.status === 'accepted') expect(outcome.provenance.fixture.sourceCommitSha).toEqual(declared(BR01_ACCEPTED_WP04_SHA));
  });
  it('preserves an unavailable synthetic fixture source commit', () => {
    const outcome = metadataPreflightOutcome((input) => {
      input.fixture.sourceCommitSha = { status: 'unknown', value: null, sourceRef: 'capture-v1', reasonCode: 'commit-not-observed' };
    });
    expect(outcome).toMatchObject({ status: 'accepted' });
    if (outcome.status === 'accepted') expect(outcome.provenance.fixture.sourceCommitSha).toEqual({ status: 'unknown', value: null, sourceRef: 'capture-v1', reasonCode: 'commit-not-observed' });
  });
  it('rejects an observed synthetic fixture source commit without owner verification', () => {
    const outcome = metadataPreflightOutcome((input) => {
      input.fixture.sourceCommitSha = observed(BR01_ACCEPTED_WP04_SHA);
    });
    expect(outcome).toMatchObject({ status: 'rejected', code: 'fixture-contract-mismatch' });
  });
  it('rejects known registry fixtures whose owner binding is unavailable', () => {
    const outcome = metadataPreflightOutcome((input) => {
      input.fixture.id = 'scheduler-edit-stream-v1';
    });
    expect(outcome).toMatchObject({ status: 'rejected', code: 'fixture-contract-mismatch' });
  });
  it('rejects a repository path whose case does not match the directory entry', () => {
    expect(metadataPreflightOutcome(() => undefined, (root) => {
      renameSync(join(root, 'fixture.txt'), join(root, 'Fixture.txt'));
    })).toMatchObject({ status: 'rejected', code: 'fixture-contract-mismatch' });
  });
  it('uses the immutable initial tree for both candidate binding passes', () => {
    const initialTree = 'a'.repeat(40);
    const foreignOid = 'e'.repeat(40);
    const lsTreeCalls: string[][] = [];
    const outcome = candidateBindingPreflight({ candidateCommand: (args) => {
      if (args[0] === 'ls-tree') {
        lsTreeCalls.push([...args]);
        if (args[3] === 'HEAD') return { status: 0, stdout: new TextEncoder().encode(`100644 blob ${foreignOid}\tcandidate.txt\0`), stderr: empty };
      }
      return undefined;
    } });
    expect(outcome).toMatchObject({ status: 'accepted' });
    expect(lsTreeCalls).toHaveLength(2);
    expect(lsTreeCalls.every((args) => args[3] === initialTree && !args.includes('HEAD'))).toBe(true);
  });
  it('rejects a foreign immutable-tree candidate OID', () => {
    const initialTree = 'a'.repeat(40);
    const foreignOid = 'e'.repeat(40);
    const lsTreeCalls: string[][] = [];
    const outcome = candidateBindingPreflight({ candidateCommand: (args) => {
      if (args[0] === 'ls-tree') {
        lsTreeCalls.push([...args]);
        if (args[3] === initialTree) return { status: 0, stdout: new TextEncoder().encode(`100644 blob ${foreignOid}\tcandidate.txt\0`), stderr: empty };
      }
      return undefined;
    } });
    expect(outcome).toMatchObject({ status: 'rejected', code: 'candidate-contract-mismatch' });
    expect(lsTreeCalls.length).toBeGreaterThan(0);
    expect(lsTreeCalls.every((args) => args[3] === initialTree)).toBe(true);
  });
  it('pins tree resolution to captured commits across a HEAD ref race', () => {
    const root = mkdtempSync(join(tmpdir(), 'br01-commit-tree-race-'));
    try {
      const encoder = new TextEncoder();
      mkdirSync(join(root, 'dist'));
      writeFileSync(join(root, 'fixture.txt'), encoder.encode('fixture'));
      writeFileSync(join(root, 'candidate.txt'), encoder.encode('candidate'));
      writeFileSync(join(root, 'dist', 'index.js'), encoder.encode('build'));
      const fixtureEntries = [{ path: 'fixture.txt', bytes: encoder.encode('fixture') }];
      const candidateEntries = [{ path: 'candidate.txt', bytes: encoder.encode('candidate') }];
      const capturedCommit = BR01_ACCEPTED_WP04_SHA;
      const changedCommit = 'b'.repeat(40);
      const capturedTree = 'a'.repeat(40);
      const mutableHeadTree = 'd'.repeat(40);
      const treeExpressions: string[] = [];
      let commitReads = 0;
      let headCommit: string = capturedCommit;
      let headTree: string = capturedTree;
      const response = (_command: string, args: readonly string[]): SourcePreflightCommandResultV1 => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return result(root);
        if (args[0] === 'rev-parse' && args[2] === 'HEAD^{commit}') {
          commitReads += 1;
          const currentCommit = headCommit;
          if (commitReads === 1) {
            headCommit = changedCommit;
            headTree = mutableHeadTree;
          }
          return result(currentCommit);
        }
        if (args[0] === 'rev-parse' && args[2]?.endsWith('^{tree}')) {
          const expression = args[2];
          treeExpressions.push(expression);
          if (expression === `${capturedCommit}^{tree}`) return result(capturedTree);
          return result(headTree);
        }
        if (args[0] === 'status' || args[0] === 'ls-files') return emptyResult();
        const candidate = candidateCommandResult(args);
        if (candidate !== undefined) return candidate;
        return emptyResult();
      };
      const outcome = sourcePreflightV1({
        rootPath: root,
        expectedSourceCommitSha: capturedCommit,
        fixtureSemanticBytes: FIXTURE_SEMANTIC_BYTES,
        fixture: { id: 'fixture-v1', version: 1, semanticSha256: observed(FIXTURE_SEMANTIC_DIGEST), sourceCommitSha: declared(capturedCommit), sourceFileSetSha256: observed(digestFileSetV1(fixtureEntries)), sourcePaths: observed(['fixture.txt']) } as never,
        candidate: { id: 'candidate-v1', version: 1, sourceFileSetSha256: observed(digestFileSetV1(candidateEntries)), sourcePaths: observed(['candidate.txt']) } as never,
        runCommand: response,
      });
      expect(outcome).toMatchObject({ status: 'rejected', code: 'source-sha-mismatch' });
      expect(treeExpressions[0]).toBe(`${capturedCommit}^{tree}`);
      expect(treeExpressions).toContain(`${changedCommit}^{tree}`);
      expect(treeExpressions).not.toContain('HEAD^{tree}');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('accepts a tracked candidate in an isolated real Git repository', () => {
    const candidateBytes = new TextEncoder().encode('candidate');
    const outcome = runRealGitCandidatePreflight({ candidatePath: 'candidate.txt', candidateBytes });
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ status: 'accepted' });
  }, REAL_GIT_TEST_TIMEOUT_MS);
  it.each([
    ['ignored dist file', 'dist/index.js', 'build'],
    ['ignored node_modules file', 'node_modules/vendor/index.js', 'vendor'],
    ['untracked nonignored file', 'untracked.txt', 'untracked'],
    ['untracked nested nonignored file', 'untracked/nested.js', 'nested'],
  ] as const)('rejects an %s in an isolated real Git repository', (_label, candidatePath, bytes) => {
    expect(runRealGitCandidatePreflight({ candidatePath, candidateBytes: new TextEncoder().encode(bytes) })).toMatchObject({
      status: 'rejected',
      code: 'candidate-contract-mismatch',
    });
  }, REAL_GIT_TEST_TIMEOUT_MS);
  it('rejects an unrelated dirty change as source-dirty in an isolated real Git repository', () => {
    const candidateBytes = new TextEncoder().encode('candidate');
    expect(runRealGitCandidatePreflight({
      candidatePath: 'candidate.txt',
      candidateBytes,
      mutate: (root) => writeFileSync(join(root, 'unrelated.txt'), new TextEncoder().encode('changed')),
    })).toMatchObject({ status: 'rejected', code: 'source-dirty' });
  }, REAL_GIT_TEST_TIMEOUT_MS);
  it('accepts a tracked current-HEAD candidate only after exact blob and filtered hash binding', () => {
    expect(candidateBindingPreflight()).toMatchObject({ status: 'accepted' });
  });
  it.each([
    ['ignored dist/index.js', 'dist/index.js'],
    ['ignored node_modules file', 'node_modules/vendor/index.js'],
    ['untracked nonignored file', 'untracked.txt'],
    ['path present only in another commit/tree', 'historical.txt'],
  ] as const)('rejects an %s without a current-HEAD blob record', (_label, candidatePath) => {
    expect(candidateBindingPreflight({
      candidatePath,
      candidateCommand: (args) => args[0] === 'ls-tree' ? emptyResult() : undefined,
    })).toMatchObject({ status: 'rejected', code: 'candidate-contract-mismatch' });
  });
  it('rejects a candidate whose current-HEAD path differs by case', () => {
    expect(candidateBindingPreflight({ candidatePath: 'Candidate.txt', returnedPath: 'candidate.txt' })).toMatchObject({ status: 'rejected', code: 'candidate-contract-mismatch' });
  });
  it('rejects a filtered working-tree blob mismatch', () => {
    expect(candidateBindingPreflight({ hashOid: 'd'.repeat(40) })).toMatchObject({ status: 'rejected', code: 'candidate-contract-mismatch' });
  });
  it('accepts CRLF working-tree bytes when the clean-filter hash matches HEAD', () => {
    expect(candidateBindingPreflight({ candidateBytes: new TextEncoder().encode('candidate\r\n') })).toMatchObject({ status: 'accepted' });
  });
  it('rejects an independently mutated supplied candidate fileset digest', () => {
    expect(candidateBindingPreflight({ candidateDigest: `sha256:${'b'.repeat(64)}` })).toMatchObject({ status: 'rejected', code: 'candidate-contract-mismatch' });
  });
  it('rejects a second current-HEAD membership/hash mutation', () => {
    const changedOid = 'd'.repeat(40);
    expect(candidateBindingPreflight({ candidateCommand: (args, callIndex) => {
      if (args[0] === 'ls-tree' && callIndex >= 2) return { status: 0, stdout: new TextEncoder().encode(`100644 blob ${changedOid}\t${args[args.length - 1]}\0`), stderr: empty };
      if (args[0] === 'hash-object' && callIndex >= 3) return result(changedOid);
      return undefined;
    } })).toMatchObject({ status: 'rejected', code: 'candidate-contract-mismatch' });
  });
  it('rejects a second raw candidate read mutation', () => {
    expect(candidateBindingPreflight({ candidateCommand: (args, callIndex, rootPath, candidatePath) => {
      if (args[0] === 'hash-object' && callIndex === 3) writeFileSync(join(rootPath, ...candidatePath.split('/')), new TextEncoder().encode('changed'));
      return undefined;
    } })).toMatchObject({ status: 'rejected', code: 'candidate-contract-mismatch' });
  });
  it.each([
    ['Git timeout', 'ls-tree', () => ({ status: null, stdout: empty, stderr: empty, signal: 'SIGTERM' as const }), 'infrastructure-failure'],
    ['Git nonzero status', 'ls-tree', () => ({ status: 1, stdout: empty, stderr: empty }), 'infrastructure-failure'],
    ['malformed HEAD metadata', 'ls-tree', () => ({ status: 0, stdout: new TextEncoder().encode('malformed\0'), stderr: empty }), 'candidate-contract-mismatch'],
    ['multiple HEAD records', 'ls-tree', () => ({ status: 0, stdout: new TextEncoder().encode(`100644 blob ${CANDIDATE_BLOB_OID}\tcandidate.txt\0extra\0`), stderr: empty }), 'candidate-contract-mismatch'],
    ['non-blob HEAD entry', 'ls-tree', () => ({ status: 0, stdout: new TextEncoder().encode(`040000 tree ${CANDIDATE_BLOB_OID}\tcandidate.txt\0`), stderr: empty }), 'candidate-contract-mismatch'],
    ['malformed clean-filter hash', 'hash-object', () => result('not-a-sha'), 'candidate-contract-mismatch'],
    ['Git output overflow', 'ls-tree', () => ({ status: 0, stdout: new Uint8Array(BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.commandOutputMaxBytes + 1), stderr: empty }), 'infrastructure-failure'],
  ] as const)('fails closed for %s during candidate binding', (_label, command, failure, expectedCode) => {
    expect(candidateBindingPreflight({ candidateCommand: (args) => args[0] === command ? failure() : undefined })).toMatchObject({
      status: 'rejected',
      code: expectedCode,
    });
  });
  it('accepts the authoritative WP04 semantic fixture and exact c64 Git blob fileset', () => {
    const root = mkdtempSync(join(tmpdir(), 'br01-wp04-owner-'));
    try {
      const blobs = WP04_SOURCE_PATHS.map((path) => ({ path, bytes: acceptedWp04Blob(path) }));
      const sourceDigest = digestFileSetV1(blobs);
      expect(sourceDigest).toBe(BENCHMARK_SOURCE_FIXTURE_BINDINGS_V1['wp04-golden-world-v1'].sourceFileSetSha256.value);
      for (const entry of blobs) {
        const target = join(root, ...entry.path.split('/'));
        mkdirSync(join(target, '..'), { recursive: true });
        writeFileSync(target, entry.bytes);
      }
      mkdirSync(join(root, 'dist'));
      writeFileSync(join(root, 'candidate.txt'), new TextEncoder().encode('candidate'));
      writeFileSync(join(root, 'dist', 'index.js'), new TextEncoder().encode('build'));
      const candidateEntries = [{ path: 'candidate.txt', bytes: new TextEncoder().encode('candidate') }];
      const response = (_command: string, args: readonly string[]): SourcePreflightCommandResultV1 => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return result(root);
        if (args[0] === 'rev-parse' && args[2] === 'HEAD^{commit}') return result(BR01_ACCEPTED_WP04_SHA);
         if (args[0] === 'rev-parse' && args[2]?.endsWith('^{tree}')) return result('a'.repeat(40));
         if (args[0] === 'status' || args[0] === 'ls-files') return emptyResult();
         const historical = wp04HistoricalCommand(args);
         if (historical !== undefined) return historical;
         const candidate = candidateCommandResult(args);
        if (candidate !== undefined) return candidate;
        return emptyResult();
      };
      const outcome = sourcePreflightV1({
        rootPath: root,
        expectedSourceCommitSha: BR01_ACCEPTED_WP04_SHA,
        fixtureSemanticBytes: getBenchmarkWp04SemanticBytesV1(),
        fixture: {
          id: 'wp04-golden-world-v1',
           version: 1,
           semanticSha256: observed(BENCHMARK_WP04_SEMANTIC_SHA256_V1),
           sourceCommitSha: observed(BR01_ACCEPTED_WP04_SHA),
          sourceFileSetSha256: observed(sourceDigest),
          sourcePaths: observed([...WP04_SOURCE_PATHS]),
        } as never,
        candidate: {
          id: 'candidate-v1',
          version: 1,
          sourceFileSetSha256: observed(digestFileSetV1(candidateEntries)),
          sourcePaths: observed(['candidate.txt']),
        } as never,
        runCommand: response,
      });
      expect(outcome.status).toBe('accepted');
      if (outcome.status === 'accepted') expect(verifyBuildHandoffV1(outcome.buildHandoff)).toMatchObject({ status: 'verified' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it.each([
    ['altered canonical bytes', canonicalizeJsonV1({ wp02: { altered: true } })],
    ['empty bytes', new Uint8Array()],
    ['recomputed arbitrary bytes', canonicalizeJsonV1({ fixtureContractId: 'wp04-golden-world-v1', version: 1 })],
  ] as const)('rejects %s for the authoritative WP04 semantic fixture', (_label, bytes) => {
    expect(metadataPreflightOutcome((input) => {
      input.fixture.id = 'wp04-golden-world-v1';
      input.fixture.semanticSha256 = observed(sha256BytesV1(bytes));
    }, () => undefined, bytes)).toMatchObject({ status: 'rejected', code: 'fixture-contract-mismatch' });
  });
  it('rejects a mismatched byte fileset digest before emitting observed provenance', () => {
    expect(metadataPreflightOutcome((input) => {
      input.fixture.sourceFileSetSha256.value = `sha256:${'b'.repeat(64)}`;
    })).toMatchObject({ status: 'rejected', code: 'fixture-contract-mismatch' });
  });
  it.each([
    ['fixture ID', (input: any) => { input.fixture.id = 'Fixture-v1'; }, 'fixture-contract-mismatch'],
    ['fixture version', (input: any) => { input.fixture.version = 0; }, 'fixture-contract-mismatch'],
    ['fixture semantic digest', (input: any) => { input.fixture.semanticSha256.value = 'not-a-sha'; }, 'fixture-contract-mismatch'],
    ['candidate source digest', (input: any) => { input.candidate.sourceFileSetSha256.value = `sha256:${'A'.repeat(64)}`; }, 'candidate-contract-mismatch'],
    ['candidate version', (input: any) => { input.candidate.version = 0; }, 'candidate-contract-mismatch'],
    ['build algorithm', (input: any) => { input.build.algorithmVersion = 'other-build-v1'; }, 'build-digest-mismatch'],
    ['build root', (input: any) => { input.build.rootPath = 'build'; }, 'build-digest-mismatch'],
    ['build digest', (input: any) => { input.build.sha256 = 'not-a-sha'; }, 'build-digest-mismatch'],
    ['build file count', (input: any) => { input.build.fileCount = 0; }, 'build-digest-mismatch'],
    ['build byte count', (input: any) => { input.build.totalBytes = 0; }, 'build-digest-mismatch'],
  ] as const)('rejects malformed untrusted %s metadata even when files match', (_label, mutate, code) => {
    expect(metadataPreflightOutcome(mutate)).toMatchObject({ status: 'rejected', code });
  });
  it.each([
    ['fixture wrapper extra field', (input: any) => { input.fixture.semanticSha256.extra = true; }, 'fixture-contract-mismatch'],
    ['fixture wrapper missing stability', (input: any) => { delete input.fixture.semanticSha256.stability; }, 'fixture-contract-mismatch'],
    ['fixture wrapper invalid sourceRef', (input: any) => { input.fixture.semanticSha256.sourceRef = 'CAPTURE-V1'; }, 'fixture-contract-mismatch'],
    ['fixture wrapper invalid observed stability', (input: any) => { input.fixture.semanticSha256.stability = 'run-config'; }, 'fixture-contract-mismatch'],
    ['fixture unavailable branch', (input: any) => { input.fixture.semanticSha256 = { status: 'unknown', value: null, sourceRef: 'capture-v1', reasonCode: 'not-observed' }; }, 'fixture-contract-mismatch'],
    ['candidate wrapper extra field', (input: any) => { input.candidate.sourceFileSetSha256.extra = true; }, 'candidate-contract-mismatch'],
    ['candidate wrapper invalid sourceRef', (input: any) => { input.candidate.sourceFileSetSha256.sourceRef = 'CAPTURE-V1'; }, 'candidate-contract-mismatch'],
  ] as const)('rejects malformed %s before accepting provenance', (_label, mutate, code) => {
    expect(metadataPreflightOutcome(mutate)).toMatchObject({ status: 'rejected', code });
  });
  it('round-trips accepted provenance through the structural source contract', () => {
    const outcome = metadataPreflightOutcome(() => undefined);
    expect(outcome.status).toBe('accepted');
    if (outcome.status === 'accepted') {
      const document = createBenchmarkCaseDocumentV1({ samples: true }) as any;
      document.source = outcome.provenance;
      document.browserProcesses[0].source = outcome.provenance;
      for (const run of document.browserProcesses[0].runs) run.source = outcome.provenance;
      const validation = validateBenchmarkRunStructureV1(document);
      expect(validation, validation.valid ? '' : JSON.stringify(validation.issues)).toMatchObject({ valid: true });
    }
  });
  it('rejects a fixture path whose parent symlink escapes the verified root', () => {
    const outside = mkdtempSync(join(tmpdir(), 'br01-source-outside-'));
    try {
      let unsupported = false;
      try {
        const outcome = metadataPreflightOutcome(
          (input) => { input.fixture.sourcePaths.value = ['fixture-link/escape.txt']; },
          (root) => {
            writeFileSync(join(outside, 'escape.txt'), new TextEncoder().encode('escape'));
            symlinkSync(outside, join(root, 'fixture-link'), process.platform === 'win32' ? 'junction' : 'dir');
          },
        );
        expect(outcome).toMatchObject({ status: 'rejected', code: 'fixture-contract-mismatch' });
      } catch (error) {
        const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
        if (['EACCES', 'EPERM', 'ENOTSUP', 'UNKNOWN'].includes(code ?? '')) unsupported = true;
        else throw error;
      }
      if (unsupported) expect('unsupported-platform').toBe('unsupported-platform');
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
  it.each([
    ['fixture', 'reversed', ['fixture-b.txt', 'fixture-a.txt'], 'fixture-contract-mismatch'],
    ['candidate', 'reversed', ['candidate-b.txt', 'candidate-a.txt'], 'candidate-contract-mismatch'],
    ['fixture', 'duplicate', ['fixture-a.txt', 'fixture-a.txt'], 'fixture-contract-mismatch'],
    ['candidate', 'duplicate', ['candidate-a.txt', 'candidate-a.txt'], 'candidate-contract-mismatch'],
  ] as const)('rejects %s %s source paths without reordering', (owner, _case, paths, code) => {
    expect(pathPreflightOutcome(owner, paths)).toMatchObject({ status: 'rejected', code });
  });
  it('streams a large fileset with the same framing as the byte-entry API', () => {
    const root = mkdtempSync(join(tmpdir(), 'br01-streamed-fileset-'));
    try {
      const bytes = new Uint8Array(128 * 1024 + 17);
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 251;
      writeFileSync(join(root, 'large.bin'), bytes);
      const streamed = digestFileSetPathsV1([{ path: 'large.bin', absolutePath: join(root, 'large.bin') }]);
      expect(streamed).toMatchObject({ digest: digestFileSetV1([{ path: 'large.bin', bytes }]), fileCount: 1, totalBytes: bytes.byteLength });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('enforces stricter caller limits without widening the v1 contract', () => {
    const root = mkdtempSync(join(tmpdir(), 'br01-stream-limits-'));
    try {
      writeFileSync(join(root, 'two.bin'), new Uint8Array([1, 2]));
      writeFileSync(join(root, 'three.bin'), new Uint8Array([3, 4]));
      expect(() => digestFileSetPathsV1([{ path: 'two.bin', absolutePath: join(root, 'two.bin') }], 'fileset', { maxFileBytes: 1 })).toThrow();
      expect(() => digestFileSetPathsV1([
        { path: 'three.bin', absolutePath: join(root, 'three.bin') },
        { path: 'two.bin', absolutePath: join(root, 'two.bin') },
      ], 'fileset', { maxFiles: 1 })).toThrow();
      expect(() => digestFileSetPathsV1([
        { path: 'three.bin', absolutePath: join(root, 'three.bin') },
        { path: 'two.bin', absolutePath: join(root, 'two.bin') },
      ], 'fileset', { maxAggregateBytes: 3 })).toThrow();
      expect(BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.commandOutputMaxBytes).toBe(1_048_576);
      expect(BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.gitCommandTimeoutMs).toBe(5_000);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('fails closed for command output overflow and signals', () => {
    const oversized = new Uint8Array(BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.commandOutputMaxBytes + 1);
    const overflow = sourcePreflightV1({
      rootPath: '.',
       expectedSourceCommitSha: BR01_ACCEPTED_WP04_SHA,
      fixtureSemanticBytes: FIXTURE_SEMANTIC_BYTES,
      fixture: {} as never,
      candidate: {} as never,
      runCommand: () => ({ status: 0, stdout: oversized, stderr: empty }),
    });
    expect(overflow).toMatchObject({ status: 'rejected', code: 'infrastructure-failure' });
    const signaled = sourcePreflightV1({
      rootPath: '.',
       expectedSourceCommitSha: BR01_ACCEPTED_WP04_SHA,
      fixtureSemanticBytes: FIXTURE_SEMANTIC_BYTES,
      fixture: {} as never,
      candidate: {} as never,
      runCommand: () => ({ status: null, stdout: empty, stderr: empty, signal: 'SIGTERM' }),
    });
    expect(signaled).toMatchObject({ status: 'rejected', code: 'infrastructure-failure' });
  });
  it('detects a build mutation after an accepted preflight handoff', () => {
    const root = mkdtempSync(join(tmpdir(), 'br01-build-handoff-'));
    try {
      const encoder = new TextEncoder();
      mkdirSync(join(root, 'dist'));
      writeFileSync(join(root, 'fixture.txt'), encoder.encode('fixture'));
      writeFileSync(join(root, 'candidate.txt'), encoder.encode('candidate'));
      writeFileSync(join(root, 'dist', 'index.js'), encoder.encode('build'));
      const fixtureEntries = [{ path: 'fixture.txt', bytes: encoder.encode('fixture') }];
      const candidateEntries = [{ path: 'candidate.txt', bytes: encoder.encode('candidate') }];
      const response = (_command: string, args: readonly string[]): SourcePreflightCommandResultV1 => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return result(root);
        if (args[0] === 'rev-parse' && args[2] === 'HEAD^{commit}') return result(BR01_ACCEPTED_WP04_SHA);
        if (args[0] === 'rev-parse' && args[2]?.endsWith('^{tree}')) return result('a'.repeat(40));
        const candidate = candidateCommandResult(args);
        if (candidate !== undefined) return candidate;
        return emptyResult();
      };
      const outcome = sourcePreflightV1({
        rootPath: root,
         expectedSourceCommitSha: BR01_ACCEPTED_WP04_SHA,
        fixtureSemanticBytes: FIXTURE_SEMANTIC_BYTES,
        fixture: { id: 'fixture-v1', version: 1, semanticSha256: observed(FIXTURE_SEMANTIC_DIGEST), sourceCommitSha: declared(BR01_ACCEPTED_WP04_SHA), sourceFileSetSha256: observed(digestFileSetV1(fixtureEntries)), sourcePaths: observed(['fixture.txt']) } as never,
        candidate: { id: 'candidate-v1', version: 1, sourceFileSetSha256: observed(digestFileSetV1(candidateEntries)), sourcePaths: observed(['candidate.txt']) } as never,
        runCommand: response,
      });
      expect(outcome.status).toBe('accepted');
      if (outcome.status === 'accepted') {
        writeFileSync(join(root, 'dist', 'index.js'), encoder.encode('changed'));
        expect(verifyBuildHandoffV1(outcome.buildHandoff)).toMatchObject({ status: 'rejected', code: 'build-digest-mismatch' });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it.each([
    ['added ignored-dist file', (root: string, encoder: TextEncoder) => { writeFileSync(join(root, 'dist', '.ignored.js'), encoder.encode('added')); }],
    ['deleted ignored-dist file', (root: string, _encoder: TextEncoder) => { unlinkSync(join(root, 'dist', 'index.js')); }],
  ] as const)('detects an %s after an accepted preflight handoff', (_label, mutate) => {
    const root = mkdtempSync(join(tmpdir(), 'br01-build-handoff-cardinality-'));
    try {
      const encoder = new TextEncoder();
      mkdirSync(join(root, 'dist'));
      writeFileSync(join(root, 'fixture.txt'), encoder.encode('fixture'));
      writeFileSync(join(root, 'candidate.txt'), encoder.encode('candidate'));
      writeFileSync(join(root, 'dist', 'index.js'), encoder.encode('build'));
      const fixtureEntries = [{ path: 'fixture.txt', bytes: encoder.encode('fixture') }];
      const candidateEntries = [{ path: 'candidate.txt', bytes: encoder.encode('candidate') }];
      const response = (_command: string, args: readonly string[]): SourcePreflightCommandResultV1 => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return result(root);
        if (args[0] === 'rev-parse' && args[2] === 'HEAD^{commit}') return result(BR01_ACCEPTED_WP04_SHA);
        if (args[0] === 'rev-parse' && args[2]?.endsWith('^{tree}')) return result('a'.repeat(40));
        const candidate = candidateCommandResult(args);
        if (candidate !== undefined) return candidate;
        return emptyResult();
      };
      const outcome = sourcePreflightV1({
        rootPath: root,
         expectedSourceCommitSha: BR01_ACCEPTED_WP04_SHA,
        fixtureSemanticBytes: FIXTURE_SEMANTIC_BYTES,
         fixture: { id: 'fixture-v1', version: 1, semanticSha256: observed(FIXTURE_SEMANTIC_DIGEST), sourceCommitSha: declared(BR01_ACCEPTED_WP04_SHA), sourceFileSetSha256: observed(digestFileSetV1(fixtureEntries)), sourcePaths: observed(['fixture.txt']) } as never,
        candidate: { id: 'candidate-v1', version: 1, sourceFileSetSha256: observed(digestFileSetV1(candidateEntries)), sourcePaths: observed(['candidate.txt']) } as never,
        runCommand: response,
      });
      expect(outcome.status).toBe('accepted');
      if (outcome.status === 'accepted') {
        mutate(root, encoder);
        expect(verifyBuildHandoffV1(outcome.buildHandoff)).toMatchObject({ status: 'rejected', code: 'build-digest-mismatch' });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

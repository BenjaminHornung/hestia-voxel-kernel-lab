import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BR01_ACCEPTED_WP04_SHA, EMPTY_STATUS_SHA256 } from '../../../../src/benchmark/contracts/versions';
import { BENCHMARK_WP04_SEMANTIC_SHA256_V1, getBenchmarkWp04SemanticBytesV1 } from '../../../../src/benchmark/contracts/scenarioRegistryV1';
import { sourcePreflightV1, type SourcePreflightCommandResultV1 } from '../../../../src/benchmark/provenance/sourcePreflightV1';
import { digestBuildV1, digestFileSetV1, sha256BytesV1 } from '../../../../src/benchmark/provenance/fileSetDigestV1';
import { canonicalizeJsonV1 } from '../../../../src/benchmark/provenance/canonicalJsonV1';
import { validateBenchmarkRunStructureV1 } from '../../../../src/benchmark/contracts/validateV1';
import { createBenchmarkCaseDocumentV1 } from '../contracts/benchmark-case-fixtures-v1';

const empty = new Uint8Array();
const FIXTURE_SEMANTIC_BYTES = canonicalizeJsonV1({ fixtureContractId: 'fixture-v1', version: 1 });
const FIXTURE_SEMANTIC_DIGEST = sha256BytesV1(FIXTURE_SEMANTIC_BYTES);
const result = (stdout: string | Uint8Array, status = 0): SourcePreflightCommandResultV1 => ({ status, stdout: typeof stdout === 'string' ? new TextEncoder().encode(`${stdout}\n`) : stdout, stderr: empty });
const emptyResult = (): SourcePreflightCommandResultV1 => ({ status: 0, stdout: empty, stderr: empty });
const observed = <T>(value: T) => ({ status: 'observed' as const, value, sourceRef: 'capture-v1', stability: 'stable' as const });
const declared = <T>(value: T) => ({ status: 'declared' as const, value, sourceRef: 'plan-v1', stability: 'run-config' as const });

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
     const fixture = { id: 'fixture-v1', version: 1, semanticSha256: observed(FIXTURE_SEMANTIC_DIGEST), sourceFileSetSha256: observed(digestFileSetV1(fixtureDigestEntries)), sourcePaths: observed(fixturePaths) };
    const candidate = { id: 'candidate-v1', version: 1, sourceFileSetSha256: observed(digestFileSetV1(candidateDigestEntries)), sourcePaths: observed(candidatePaths) };
    const response = (_command: string, args: readonly string[]): SourcePreflightCommandResultV1 => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return result(root);
      if (args[0] === 'rev-parse' && args[2] === 'HEAD^{commit}') return result(BR01_ACCEPTED_WP04_SHA);
      if (args[0] === 'rev-parse' && args[2] === 'HEAD^{tree}') return result('a'.repeat(40));
      if (args[0] === 'status' || args[0] === 'ls-files') return emptyResult();
      return emptyResult();
    };
    return sourcePreflightV1({ rootPath: root, expectedAcceptedWp04Sha: BR01_ACCEPTED_WP04_SHA, fixtureSemanticBytes: FIXTURE_SEMANTIC_BYTES, fixture: fixture as never, candidate: candidate as never, runCommand: response });
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
       fixture: { id: 'fixture-v1', version: 1, semanticSha256: observed(FIXTURE_SEMANTIC_DIGEST), sourceFileSetSha256: observed(digestFileSetV1(fixtureEntries)), sourcePaths: observed(['fixture.txt']) },
      candidate: { id: 'candidate-v1', version: 1, sourceFileSetSha256: observed(digestFileSetV1(candidateEntries)), sourcePaths: observed(['candidate.txt']) },
      build: { algorithmVersion: 'hestia-benchmark-build-sha256-v1', rootPath: 'dist', sha256: digestBuildV1(buildEntries), fileCount: 1, totalBytes: 5 },
    };
    mutate(input);
    const response = (_command: string, args: readonly string[]): SourcePreflightCommandResultV1 => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return result(root);
      if (args[0] === 'rev-parse' && args[2] === 'HEAD^{commit}') return result(BR01_ACCEPTED_WP04_SHA);
      if (args[0] === 'rev-parse' && args[2] === 'HEAD^{tree}') return result('a'.repeat(40));
      if (args[0] === 'status' || args[0] === 'ls-files') return emptyResult();
      return emptyResult();
    };
       return sourcePreflightV1({
         rootPath: root,
         expectedAcceptedWp04Sha: BR01_ACCEPTED_WP04_SHA,
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
      if (args[0] === 'rev-parse' && args[2] === 'HEAD^{tree}') return result('a'.repeat(40));
      if (args[0] === 'status') return result('1 .M file.ts');
      return result('');
    };
    const outcome = sourcePreflightV1({ rootPath: '.', expectedAcceptedWp04Sha: BR01_ACCEPTED_WP04_SHA, fixtureSemanticBytes: FIXTURE_SEMANTIC_BYTES, fixture: {} as never, candidate: {} as never, runCommand: response });
    expect(outcome).toMatchObject({ status: 'rejected', code: 'source-dirty' });
    expect(calls.some((call) => call.includes('--porcelain=v2'))).toBe(true);
  });

  it('rejects an unexpected accepted SHA before reading source files', () => {
    const response = (_command: string, args: readonly string[]): SourcePreflightCommandResultV1 => {
       if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return result(realpathSync('.'));
      if (args[0] === 'rev-parse' && args[2] === 'HEAD^{commit}') return result(BR01_ACCEPTED_WP04_SHA);
      if (args[0] === 'rev-parse' && args[2] === 'HEAD^{tree}') return result('a'.repeat(40));
      if (args[0] === 'status') return emptyResult();
      return emptyResult();
    };
    const outcome = sourcePreflightV1({ rootPath: '.', expectedAcceptedWp04Sha: 'b'.repeat(40), fixtureSemanticBytes: FIXTURE_SEMANTIC_BYTES, fixture: {} as never, candidate: {} as never, runCommand: response });
    expect(outcome).toMatchObject({ status: 'rejected', code: 'source-sha-mismatch' });
  });

  it('rejects a git root mismatch before reading fixture or build files', () => {
    const root = mkdtempSync(join(tmpdir(), 'br01-root-mismatch-'));
    try {
      const calls: string[] = [];
      const response = (command: string, args: readonly string[], cwd: string): SourcePreflightCommandResultV1 => {
        calls.push(`${command} ${args.join(' ')} ${cwd}`);
        return args[0] === 'rev-parse' && args[1] === '--show-toplevel' ? result(realpathSync('.')) : emptyResult();
      };
      const outcome = sourcePreflightV1({ rootPath: root, expectedAcceptedWp04Sha: BR01_ACCEPTED_WP04_SHA, fixtureSemanticBytes: FIXTURE_SEMANTIC_BYTES, fixture: {} as never, candidate: {} as never, runCommand: response });
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
         id: 'fixture-v1', version: 1, semanticSha256: observed(FIXTURE_SEMANTIC_DIGEST),
         sourceFileSetSha256: observed(digestFileSetV1(fixtureEntries)), sourcePaths: observed(['fixture.txt']),
      };
      const candidate = {
         id: 'candidate-v1', version: 1, sourceFileSetSha256: observed(digestFileSetV1(candidateEntries)), sourcePaths: observed(['candidate.txt']),
      };
      let treeReads = 0;
      const response = (_command: string, args: readonly string[]): SourcePreflightCommandResultV1 => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return result(root);
        if (args[0] === 'rev-parse' && args[2] === 'HEAD^{commit}') return result(BR01_ACCEPTED_WP04_SHA);
        if (args[0] === 'rev-parse' && args[2] === 'HEAD^{tree}') return result(treeReads++ === 0 ? 'a'.repeat(40) : 'b'.repeat(40));
        if (args[0] === 'status') return emptyResult();
        if (args[0] === 'ls-files') return emptyResult();
        return emptyResult();
      };
       const outcome = sourcePreflightV1({ rootPath: root, expectedAcceptedWp04Sha: BR01_ACCEPTED_WP04_SHA, fixtureSemanticBytes: FIXTURE_SEMANTIC_BYTES, fixture: fixture as never, candidate: candidate as never, runCommand: response });
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
         id: 'fixture-v1', version: 1, semanticSha256: observed(FIXTURE_SEMANTIC_DIGEST),
        sourceFileSetSha256: declared(digestFileSetV1(fixtureEntries)), sourcePaths: declared(['fixture.txt']),
      };
      const candidate = {
        id: 'candidate-v1', version: 1, sourceFileSetSha256: declared(digestFileSetV1(candidateEntries)), sourcePaths: declared(['candidate.txt']),
      };
      const response = (_command: string, args: readonly string[]): SourcePreflightCommandResultV1 => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return result(root);
        if (args[0] === 'rev-parse' && args[2] === 'HEAD^{commit}') return result(BR01_ACCEPTED_WP04_SHA);
        if (args[0] === 'rev-parse' && args[2] === 'HEAD^{tree}') return result('a'.repeat(40));
        if (args[0] === 'status') return emptyResult();
        if (args[0] === 'ls-files') return emptyResult();
        return emptyResult();
      };
       const outcome = sourcePreflightV1({ rootPath: root, expectedAcceptedWp04Sha: BR01_ACCEPTED_WP04_SHA, fixtureSemanticBytes: FIXTURE_SEMANTIC_BYTES, fixture: fixture as never, candidate: candidate as never, runCommand: response });
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
  it('accepts the authoritative WP04 semantic fixture bytes and digest', () => {
    const outcome = metadataPreflightOutcome((input) => {
      input.fixture.id = 'wp04-golden-world-v1';
      input.fixture.semanticSha256 = observed(BENCHMARK_WP04_SEMANTIC_SHA256_V1);
    }, () => undefined, getBenchmarkWp04SemanticBytesV1());
    expect(outcome).toMatchObject({ status: 'accepted' });
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
});

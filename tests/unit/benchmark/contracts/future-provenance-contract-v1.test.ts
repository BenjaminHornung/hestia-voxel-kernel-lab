import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { canonicalizeJsonV1 } from '../../../../src/benchmark/provenance/canonicalJsonV1';
import { repositoryRelativePathV1 } from '../../../../src/benchmark/provenance/canonicalPathV1';
import { digestFileSetV1, sha256BytesV1 } from '../../../../src/benchmark/provenance/fileSetDigestV1';

const REGISTRY_MODULE = '../../../../src/benchmark/contracts/scenarioRegistryV1';
const FIXTURE_ID = 'generic-historical-test-v1';
const FIXTURE_PATHS = ['fixtures/A-small.txt', 'fixtures/large.bin'] as const;
const CANDIDATE_PATH = 'candidate.txt';
const textEncoder = new TextEncoder();
const empty = new Uint8Array();
const FUTURE_OWNER_CONFIGURATIONS = [
  { scenarioId: 'mesh-density-sweep-v1', fixtureId: 'density-volume-suite-v1', owner: 'BR02', backend: 'three-webgl2' },
  { scenarioId: 'scheduler-steady-v1', fixtureId: 'scheduler-edit-stream-v1', owner: 'WP05', backend: 'three-webgl2' },
  { scenarioId: 'brush-stress-v1', fixtureId: 'brush-command-stream-v1', owner: 'WP05', backend: 'three-webgl2' },
  { scenarioId: 'backend-fixture-v1', fixtureId: 'backend-parity-world-v1', owner: 'BR05', backend: 'raw-webgpu' },
] as const;

const observed = <T>(value: T) => ({ status: 'observed' as const, value, sourceRef: 'capture-v1', stability: 'stable' as const });
const declared = <T>(value: T) => ({ status: 'declared' as const, value, sourceRef: 'plan-v1', stability: 'run-config' as const });

interface TestRepositoryV1 {
  readonly root: string;
  readonly ownerCommit: string;
  readonly currentCommit: string;
  readonly fixtureEntries: readonly { readonly path: string; readonly bytes: Uint8Array }[];
  readonly candidateBytes: Uint8Array;
  readonly blobOids: Readonly<Record<string, string>>;
  readonly fixtureDigest: string;
  readonly currentFixtureDigest: string;
  readonly semanticBytes: Uint8Array;
}

let sharedRepository: TestRepositoryV1 | undefined;
const repositoryRootsToClean = new Set<string>();

function git(root: string, args: readonly string[]): string {
  return String(execFileSync('git', [...args], { cwd: root, encoding: 'utf8', timeout: 5_000 })).trim();
}

function createTestRepository(): TestRepositoryV1 {
  if (sharedRepository !== undefined) return sharedRepository;
  const root = mkdtempSync(join(tmpdir(), 'br01-generic-history-'));
  repositoryRootsToClean.add(root);
  const smallBytes = textEncoder.encode('historical-small\n');
  const largeBytes = new Uint8Array(1_048_577);
  for (let index = 0; index < largeBytes.byteLength; index += 1) largeBytes[index] = index % 251;
  const candidateBytes = textEncoder.encode('candidate-current\n');
  mkdirSync(join(root, 'fixtures'), { recursive: true });
  writeFileSync(join(root, '.gitignore'), 'dist/\n');
  writeFileSync(join(root, FIXTURE_PATHS[0]!), smallBytes);
  writeFileSync(join(root, FIXTURE_PATHS[1]!), largeBytes);
  writeFileSync(join(root, CANDIDATE_PATH), candidateBytes);
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.name', 'BR01 test']);
  git(root, ['config', 'user.email', 'br01-test@example.invalid']);
  git(root, ['add', '--', '.gitignore', ...FIXTURE_PATHS, CANDIDATE_PATH]);
  git(root, ['commit', '--quiet', '-m', 'historical fixture']);
  const ownerCommit = git(root, ['rev-parse', '--verify', 'HEAD']);
  const fixtureEntries = [
    { path: FIXTURE_PATHS[0], bytes: new Uint8Array(smallBytes) },
    { path: FIXTURE_PATHS[1], bytes: new Uint8Array(largeBytes) },
  ];
  const currentSmallBytes = textEncoder.encode('current-checkout-mutation\n');
  writeFileSync(join(root, FIXTURE_PATHS[0]!), currentSmallBytes);
  git(root, ['add', '--', FIXTURE_PATHS[0]!]);
  git(root, ['commit', '--quiet', '-m', 'later current source']);
  const currentCommit = git(root, ['rev-parse', '--verify', 'HEAD']);
  const gitRoot = git(root, ['rev-parse', '--show-toplevel']);
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'dist', 'index.js'), textEncoder.encode('build'));
  const blobOids = Object.fromEntries(fixtureEntries.map((entry) => [entry.path, git(root, ['rev-parse', `${ownerCommit}:${entry.path}`])])) as Record<string, string>;
  sharedRepository = {
    root: gitRoot,
    ownerCommit,
    currentCommit,
    fixtureEntries,
    candidateBytes,
    blobOids,
    fixtureDigest: digestFileSetV1(fixtureEntries),
    currentFixtureDigest: digestFileSetV1([{ path: FIXTURE_PATHS[0], bytes: currentSmallBytes }, fixtureEntries[1]!]),
    semanticBytes: canonicalizeJsonV1({ fixtureContractId: FIXTURE_ID, fixtureContractVersion: 1 }),
  };
  return sharedRepository;
}

afterAll(() => {
  for (const root of repositoryRootsToClean) rmSync(root, { recursive: true, force: true });
});

function bindingFor(repository: TestRepositoryV1, id = FIXTURE_ID) {
  return {
    id,
    version: 1,
    sourceCommitSha: observed(repository.ownerCommit),
    sourcePaths: observed([...FIXTURE_PATHS]),
    sourceFileSetSha256: observed(repository.fixtureDigest),
  };
}

function preflightInput(repository: TestRepositoryV1, fixtureId = FIXTURE_ID, semanticBytes = repository.semanticBytes, fixtureDigest = repository.fixtureDigest): any {
  return {
    rootPath: repository.root,
    expectedSourceCommitSha: repository.currentCommit,
    fixtureSemanticBytes: semanticBytes,
    fixture: {
      id: fixtureId,
      version: 1,
      semanticSha256: observed(sha256BytesV1(semanticBytes)),
      sourceCommitSha: declared(repository.ownerCommit),
      sourceFileSetSha256: observed(fixtureDigest),
      sourcePaths: observed([...FIXTURE_PATHS]),
    },
    candidate: {
      id: 'candidate-v1',
      version: 1,
      sourceFileSetSha256: observed(digestFileSetV1([{ path: CANDIDATE_PATH, bytes: repository.candidateBytes }])),
      sourcePaths: observed([repositoryRelativePathV1(CANDIDATE_PATH)]),
    },
  };
}

function commandResult(stdout: string | Uint8Array, status = 0): any {
  return { status, stdout: typeof stdout === 'string' ? textEncoder.encode(`${stdout}\n`) : stdout, stderr: empty };
}

function delegatedRunner(mutate?: (args: readonly string[]) => any): any {
  return (command: string, args: readonly string[], cwd: string) => {
    const custom = mutate?.(args[0] === '--no-replace-objects' ? args.slice(1) : args);
    if (custom !== undefined) return custom;
    const result = spawnSync(command, [...args], {
      cwd,
      encoding: 'buffer',
      shell: false,
      windowsHide: true,
      timeout: 5_000,
      maxBuffer: 1_048_576,
    });
    return {
      status: result.status,
      stdout: result.stdout instanceof Uint8Array ? new Uint8Array(result.stdout) : empty,
      stderr: result.stderr instanceof Uint8Array ? new Uint8Array(result.stderr) : empty,
      error: result.error,
      signal: result.signal,
    };
  };
}

async function importWithBindings(bindings: Readonly<Record<string, unknown>>): Promise<any> {
  vi.resetModules();
  vi.doMock(REGISTRY_MODULE, async () => {
    const original = await vi.importActual<any>(REGISTRY_MODULE);
    return {
      ...original,
      BENCHMARK_SOURCE_FIXTURE_BINDINGS_V1: {
        ...original.BENCHMARK_SOURCE_FIXTURE_BINDINGS_V1,
        ...bindings,
      },
    };
  });
  try {
    const registry = await import(REGISTRY_MODULE);
    const sourcePreflight = await import('../../../../src/benchmark/provenance/sourcePreflightV1');
    const validate = await import('../../../../src/benchmark/contracts/validateV1');
    const fixtures = await import('./benchmark-case-fixtures-v1');
    return { sourcePreflight, validate, fixtures, registry };
  } catch (error) {
    cleanupModuleMock();
    throw error;
  }
}

function cleanupModuleMock(): void {
  vi.doUnmock(REGISTRY_MODULE);
  vi.resetModules();
}

function replaceDocumentProvenance(document: any, provenance: any): void {
  document.source = provenance;
  for (const process of document.browserProcesses) {
    process.source = provenance;
    for (const run of process.runs) {
      run.source = provenance;
      run.scenario.fixture = provenance.fixture;
    }
  }
}

function rebindRuns(document: any, calculateRunBinding: (run: any) => string): void {
  for (const process of document.browserProcesses) {
    for (const run of process.runs) {
      run.runBindingSha256 = calculateRunBinding(run);
      for (const iteration of run.iterations) for (const sample of iteration.samples) sample.runBindingSha256 = run.runBindingSha256;
    }
  }
}

describe('BR01 generic historical fixture provenance contract', () => {
  it('accepts exact historical Git blobs despite changed current bytes', async () => {
    const repository = createTestRepository();
    const modules = await importWithBindings({ [FIXTURE_ID]: bindingFor(repository) });
    try {
      const outcome = modules.sourcePreflight.sourcePreflightV1(preflightInput(repository));
      expect(outcome, JSON.stringify(outcome)).toMatchObject({ status: 'accepted' });
      if (outcome.status === 'accepted') {
        expect(outcome.provenance.fixture).toMatchObject({
          id: FIXTURE_ID,
          version: 1,
          sourceCommitSha: { status: 'observed', value: repository.ownerCommit },
          sourcePaths: { status: 'observed', value: [...FIXTURE_PATHS] },
          sourceFileSetSha256: { status: 'observed', value: repository.fixtureDigest },
        });
      }
    } finally {
      cleanupModuleMock();
    }
  }, 30_000);

  it('remains accepted under a real git replace and removes it in finally', async () => {
    const repository = createTestRepository();
    const modules = await importWithBindings({ [FIXTURE_ID]: bindingFor(repository) });
    try {
      git(repository.root, ['replace', repository.ownerCommit, repository.currentCommit]);
      try {
        expect(modules.sourcePreflight.sourcePreflightV1(preflightInput(repository))).toMatchObject({ status: 'accepted' });
      } finally {
        git(repository.root, ['replace', '-d', repository.ownerCommit]);
      }
    } finally {
      cleanupModuleMock();
    }
  }, 30_000);

  it.each([
    ['wrong fixture.sourceCommitSha', (input: any) => { input.fixture.sourceCommitSha = declared('f'.repeat(40)); }],
    ['wrong-case fixture.sourcePaths', (input: any) => { input.fixture.sourcePaths = observed(['fixtures/a-small.txt', 'fixtures/large.bin']); }],
    ['different fixture source path', (input: any) => { input.fixture.sourcePaths = observed(['fixtures/A-other.txt', 'fixtures/large.bin']); }],
    ['wrong fixture.sourceFileSetSha256', (input: any) => { input.fixture.sourceFileSetSha256 = observed(`sha256:${'b'.repeat(64)}`); }],
  ] as const)('rejects %s', async (_label, mutate) => {
    const repository = createTestRepository();
    const modules = await importWithBindings({ [FIXTURE_ID]: bindingFor(repository) });
    try {
      const input = preflightInput(repository);
      mutate(input);
      expect(modules.sourcePreflight.sourcePreflightV1(input)).toMatchObject({ status: 'rejected', code: 'fixture-contract-mismatch' });
    } finally {
      cleanupModuleMock();
    }
  }, 30_000);

  it.each([
    ['tree object as commit', (repository: TestRepositoryV1, args: readonly string[]) => args[0] === 'cat-file' && args[1] === '-t' && args[2] === repository.ownerCommit ? commandResult('tree') : undefined],
    ['tag object as commit', (repository: TestRepositoryV1, args: readonly string[]) => args[0] === 'cat-file' && args[1] === '-t' && args[2] === repository.ownerCommit ? commandResult('tag') : undefined],
    ['missing Git entry', (repository: TestRepositoryV1, args: readonly string[]) => args[0] === 'ls-tree' && args[3] === repository.ownerCommit ? commandResult(empty) : undefined],
    ['tree entry', (repository: TestRepositoryV1, args: readonly string[]) => args[0] === 'ls-tree' && args[3] === repository.ownerCommit ? { status: 0, stdout: textEncoder.encode(`040000 tree ${repository.blobOids[FIXTURE_PATHS[0]!]}\t${FIXTURE_PATHS[0]}\0`), stderr: empty } : undefined],
    ['symlink entry', (repository: TestRepositoryV1, args: readonly string[]) => args[0] === 'ls-tree' && args[3] === repository.ownerCommit ? { status: 0, stdout: textEncoder.encode(`120000 blob ${repository.blobOids[FIXTURE_PATHS[0]!]}\t${FIXTURE_PATHS[0]}\0`), stderr: empty } : undefined],
    ['wrong-case entry', (repository: TestRepositoryV1, args: readonly string[]) => args[0] === 'ls-tree' && args[3] === repository.ownerCommit ? { status: 0, stdout: textEncoder.encode(`100644 blob ${repository.blobOids[FIXTURE_PATHS[0]!]}\tfixtures/a-small.txt\0`), stderr: empty } : undefined],
    ['timeout', (_repository: TestRepositoryV1, args: readonly string[]) => args[0] === 'cat-file' && args[1] === '-t' ? { status: null, stdout: empty, stderr: empty, signal: 'SIGTERM' } : undefined],
    ['output overflow', (_repository: TestRepositoryV1, args: readonly string[]) => args[0] === 'cat-file' && args[1] === '-t' ? { status: 0, stdout: new Uint8Array(1_048_577), stderr: empty } : undefined],
    ['blob size limit', (_repository: TestRepositoryV1, args: readonly string[]) => args[0] === 'cat-file' && args[1] === '-s' ? commandResult(String(64 * 1_024 * 1_024 + 1)) : undefined],
    ['blob payload size mismatch', (repository: TestRepositoryV1, args: readonly string[]) => args[0] === 'cat-file' && args[1] === '-s' ? commandResult(String(repository.fixtureEntries[0]!.bytes.byteLength + 1)) : undefined],
    ['blob digest mismatch', (repository: TestRepositoryV1, args: readonly string[]) => args[0] === 'cat-file' && args[1] === 'blob' ? { status: 0, stdout: new Uint8Array(repository.fixtureEntries[0]!.bytes.byteLength).fill(7), stderr: empty } : undefined],
  ] as const)('rejects %s without partial provenance', async (_label, mutate) => {
    const repository = createTestRepository();
    const modules = await importWithBindings({ [FIXTURE_ID]: bindingFor(repository) });
    try {
      const outcome = modules.sourcePreflight.sourcePreflightV1({ ...preflightInput(repository), runCommand: delegatedRunner((args: readonly string[]) => mutate(repository, args)) });
      expect(outcome).toMatchObject({ status: 'rejected', code: 'fixture-contract-mismatch' });
    } finally {
      cleanupModuleMock();
    }
  }, 30_000);

  it('keeps unavailable known owners and unknown synthetic commits from becoming observed', async () => {
    const repository = createTestRepository();
    const modules = await importWithBindings({ [FIXTURE_ID]: bindingFor(repository) });
    try {
      for (const fixtureId of ['density-volume-suite-v1', 'scheduler-edit-stream-v1', 'brush-command-stream-v1', 'navigation-route-sequence-v1', 'backend-parity-world-v1']) {
        const unavailable = preflightInput(repository, fixtureId, canonicalizeJsonV1({ fixtureContractId: fixtureId, fixtureContractVersion: 1 }));
        expect(modules.sourcePreflight.sourcePreflightV1(unavailable)).toMatchObject({ status: 'rejected', code: 'fixture-contract-mismatch' });
      }

      const syntheticBytes = canonicalizeJsonV1({ fixtureContractId: 'synthetic-future-v1', fixtureContractVersion: 1 });
      const synthetic = preflightInput(repository, 'synthetic-future-v1', syntheticBytes, repository.currentFixtureDigest);
      const syntheticOutcome = modules.sourcePreflight.sourcePreflightV1(synthetic);
      expect(syntheticOutcome.status).toBe('accepted');
      if (syntheticOutcome.status === 'accepted') expect(syntheticOutcome.provenance.fixture.sourceCommitSha.status).toBe('declared');
    } finally {
      cleanupModuleMock();
    }
  }, 30_000);

  it.each(FUTURE_OWNER_CONFIGURATIONS)('proves future owner activation for $scenarioId', async (configuration) => {
    const repository = createTestRepository();
    const bindings = Object.fromEntries(FUTURE_OWNER_CONFIGURATIONS.map(({ fixtureId }) => [fixtureId, bindingFor(repository, fixtureId)]));
    const modules = await importWithBindings(bindings);
    try {
      const semanticBytes = canonicalizeJsonV1({ fixtureContractId: configuration.fixtureId, fixtureContractVersion: 1 });
      const outcome = modules.sourcePreflight.sourcePreflightV1(preflightInput(repository, configuration.fixtureId, semanticBytes));
      expect(outcome.status).toBe('accepted');
      if (outcome.status !== 'accepted') return;

      const phase = configuration.scenarioId === 'brush-stress-v1' ? 'stress' : 'measurement';
      const container = phase === 'stress' ? 'stress' : 'warm-measurement';
      const document = modules.fixtures.createBenchmarkCaseDocumentV1({ scenarioId: configuration.scenarioId, phase, container, backend: configuration.backend, samples: true }) as any;
      replaceDocumentProvenance(document, outcome.provenance);
      const context = modules.fixtures.createBenchmarkValidationContextV1({ scenarioId: configuration.scenarioId }) as any;
      context.fixture = outcome.provenance.fixture;
      context.candidate = outcome.provenance.candidate;
      rebindRuns(document, modules.validate.calculateRunBindingSha256V1);
      const targetRun = document.browserProcesses[0].runs.at(-1);
      const recordNames = modules.registry.BENCHMARK_METRIC_REACHABILITY_MATRIX_V1
        .filter((entry: any) => entry.scenarioId === configuration.scenarioId
          && entry.phase === targetRun.execution.phase
          && entry.backend === configuration.backend
          && entry.disposition === 'emit-sample')
        .map((entry: any) => entry.recordName);
      expect(modules.registry.BENCHMARK_METRIC_REACHABILITY_MATRIX_V1.some((entry: any) => entry.scenarioId === configuration.scenarioId && entry.futureProducerOwner === configuration.owner)).toBe(true);
      modules.fixtures.applySyntheticFutureProducerRecordsV1(document, recordNames);
      const validation = modules.validate.validateBenchmarkRunV1(document, context);
      expect(validation, JSON.stringify({ configuration, validation, fixture: targetRun.source.fixture, documentReasons: document.measurementEligibilityReasons, runReasons: targetRun.measurementEligibilityReasons, recordNames })).toMatchObject({ valid: true });
      expect(document.measurementEligible).toBe(true);
      expect(document.browserProcesses[0].runs.at(-1).execution.measurementEligibility).toBe('eligible');
      if (configuration.scenarioId === 'backend-fixture-v1') {
        const unsupported = structuredClone(document);
        const environments = [unsupported.environment, unsupported.browserProcesses[0].environment, ...unsupported.browserProcesses[0].runs.map((run: any) => run.environment)];
        for (const environment of environments) {
          environment.capabilities.find((entry: any) => entry.id === 'webgpu-timestamp-query').value = { status: 'unsupported', value: null, sourceRef: 'capture-v1', reasonCode: 'api-not-supported' };
        }
        rebindRuns(unsupported, modules.validate.calculateRunBindingSha256V1);
        expect(modules.validate.validateBenchmarkRunV1(unsupported, context)).toMatchObject({ valid: false, code: 'required-capability-missing' });
      }
    } finally {
      cleanupModuleMock();
    }
  }, 30_000);

  it('keeps future producer records structurally valid behind the fixture eligibility gate', async () => {
    const repository = createTestRepository();
    const bindings = Object.fromEntries(FUTURE_OWNER_CONFIGURATIONS.map(({ fixtureId }) => [fixtureId, bindingFor(repository, fixtureId)]));
    const modules = await importWithBindings(bindings);
    try {
      const structural = modules.fixtures.createBenchmarkCaseDocumentV1({ scenarioId: 'mesh-density-sweep-v1', samples: true }) as any;
      const structuralFixtures = [
        structural.source.fixture,
        ...structural.browserProcesses.flatMap((process: any) => [process.source.fixture, ...process.runs.flatMap((run: any) => [run.source.fixture, run.scenario.fixture])]),
      ];
      for (const fixture of structuralFixtures) fixture.sourceCommitSha = declared(fixture.sourceCommitSha.value);
      const structuralContext = modules.fixtures.createBenchmarkValidationContextV1({ scenarioId: 'mesh-density-sweep-v1' }) as any;
      structuralContext.fixture = structural.source.fixture;
      rebindRuns(structural, modules.validate.calculateRunBindingSha256V1);
      const allFutureRecordNames = modules.registry.BENCHMARK_METRIC_REACHABILITY_MATRIX_V1
        .filter((entry: any) => entry.scenarioId === 'mesh-density-sweep-v1' && entry.phase === 'measurement' && entry.backend === 'three-webgl2' && entry.disposition === 'emit-sample')
        .map((entry: any) => entry.recordName);
      modules.fixtures.applySyntheticFutureProducerRecordsV1(structural, allFutureRecordNames);
      expect(structural.measurementEligible).toBe(false);
      expect(structural.measurementEligibilityReasons).toEqual([{ code: 'fixture-contract-mismatch', detail: 'eligibility gate', phase: 'measurement' }]);
      expect(modules.validate.validateBenchmarkRunV1(structural, structuralContext)).toMatchObject({ valid: true });
    } finally {
      cleanupModuleMock();
    }
  }, 30_000);
});

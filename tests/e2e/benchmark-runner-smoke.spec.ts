import { execFileSync, spawnSync } from 'node:child_process';
import { appendFile, cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, relative, sep, join } from 'node:path';
import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { BENCHMARK_SOURCE_FIXTURE_BINDINGS_V1, getBenchmarkWp04SemanticBytesV1 } from '../../src/benchmark/contracts/scenarioRegistryV1';
import type { CanonicalIdV1, Sha256DigestV1 } from '../../src/benchmark/contracts/typesV1';
import { canonicalizeJsonV1 } from '../../src/benchmark/provenance/canonicalJsonV1';
import { digestFileSetV1, digestFileSetPathsV1, enumerateFileSetDirectoryV1 } from '../../src/benchmark/provenance/fileSetDigestV1';

const id = (value: string) => value as CanonicalIdV1;
const WP04_SEMANTIC_SHA256 = 'sha256:6481f4b81631c6bbed5560970f92aa82e51de77a233ec40d919dbbf765f99b44';
const VALIDATOR_COMMIT_SHA = 'e88978cbcd5504789a804fb25e353e08aaec1bd6';

let temporaryRoot: string;
let repositoryRoot: string;

function runNode(repository: string, args: readonly string[], encoding: BufferEncoding = 'utf8'): string {
  return execFileSync(process.execPath, args, { cwd: repository, encoding, windowsHide: true });
}

function runNodeOutcome(repository: string, args: readonly string[]): { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
  const result = spawnSync(process.execPath, args, { cwd: repository, encoding: 'utf8', windowsHide: true, timeout: 180_000 });
  return { status: result.status, stdout: typeof result.stdout === 'string' ? result.stdout : '', stderr: typeof result.stderr === 'string' ? result.stderr : '' };
}

function withPoisonedGitEnvironment<T>(operation: () => T): T {
  const previousGitDir = process.env.GIT_DIR;
  const previousGitConfigParameters = process.env.GIT_CONFIG_PARAMETERS;
  const previousGitAttrSource = process.env.GIT_ATTR_SOURCE;
  try {
    process.env.GIT_DIR = join(temporaryRoot, 'not-a-git-directory');
    process.env.GIT_CONFIG_PARAMETERS = "'core.repositoryformatversion=99'";
    process.env.GIT_ATTR_SOURCE = 'br03-nonexistent-attribute-source';
    return operation();
  } finally {
    if (previousGitDir === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = previousGitDir;
    if (previousGitConfigParameters === undefined) delete process.env.GIT_CONFIG_PARAMETERS;
    else process.env.GIT_CONFIG_PARAMETERS = previousGitConfigParameters;
    if (previousGitAttrSource === undefined) delete process.env.GIT_ATTR_SOURCE;
    else process.env.GIT_ATTR_SOURCE = previousGitAttrSource;
  }
}

function runGit(repository: string, args: readonly string[], encoding: BufferEncoding = 'utf8'): string {
  return execFileSync('git', args, { cwd: repository, encoding, windowsHide: true });
}

function runGitBytes(repository: string, args: readonly string[]): Buffer {
  return execFileSync('git', args, { cwd: repository, encoding: 'buffer', windowsHide: true });
}

function buildRunner(repository: string): void {
  execFileSync(process.execPath, [join(repository, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit'], { cwd: repository, windowsHide: true, stdio: 'pipe' });
  execFileSync(process.execPath, [join(repository, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', 'vite.runner.config.ts'], { cwd: repository, windowsHide: true, stdio: 'pipe' });
}

function expectCommandFailure(repository: string, args: readonly string[], expected: RegExp): void {
  let error: unknown;
  try {
    runNode(repository, args);
  } catch (caught) {
    error = caught;
  }
  if (error === undefined) throw new Error('Expected the benchmark command to fail.');
  const result = error as { readonly status?: number; readonly stderr?: Buffer | string };
  expect(result.status).not.toBe(0);
  expect(String(result.stderr ?? error)).toMatch(expected);
}

async function copyCandidateSourceV1(destination: string): Promise<void> {
  const ignoredRoots = new Set(['.git', '.worktrees', 'node_modules', '.benchmark-runner', '.benchmark-results', 'dist', 'test-results']);
  await cp(process.cwd(), destination, {
    recursive: true,
    filter: (source) => {
      const relativePath = relative(process.cwd(), source);
      if (relativePath.length === 0) return true;
      const first = relativePath.split(sep)[0]!;
      return !ignoredRoots.has(first) && relativePath !== '.npmrc' && !first.startsWith('.env');
    },
  });
}

function observed<T>(value: T) {
  return { status: 'observed' as const, value, sourceRef: id('br03-e2e-preflight'), stability: 'stable' as const };
}

function validatorSummary(repository: string) {
  const records = runGitBytes(repository, ['--no-replace-objects', 'ls-tree', '-r', '-z', '--full-tree', 'e88978cbcd5504789a804fb25e353e08aaec1bd6', '--', 'src/benchmark/contracts', 'src/benchmark/provenance'])
    .toString('utf8').replace(/\0$/, '').split('\0');
  const files = records.map((record) => {
    const path = record.slice(record.indexOf('\t') + 1);
    return { path: path as never, bytes: runGitBytes(repository, ['--no-replace-objects', 'cat-file', 'blob', `e88978cbcd5504789a804fb25e353e08aaec1bd6:${path}`]) };
  });
  return { digest: digestFileSetV1(files, 'fileset'), fileCount: files.length, totalBytes: files.reduce((total, file) => total + file.bytes.byteLength, 0) };
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  temporaryRoot = await mkdtemp(join(tmpdir(), 'br03-built-cli-e2e-'));
  repositoryRoot = join(temporaryRoot, 'repository');
  runGit(temporaryRoot, ['clone', '--quiet', '--no-local', process.cwd(), repositoryRoot]);
  await copyCandidateSourceV1(repositoryRoot);
  await writeFile(join(repositoryRoot, 'fixture-semantic.json'), getBenchmarkWp04SemanticBytesV1());
  await appendFile(join(repositoryRoot, '.gitignore'), '\ndist/\n');
  runGit(repositoryRoot, ['config', 'user.name', 'BR03 test']);
  runGit(repositoryRoot, ['config', 'user.email', 'br03-test@example.invalid']);
  runGit(repositoryRoot, ['add', '--all']);
  runGit(repositoryRoot, ['commit', '--quiet', '-m', 'BR03 clean candidate fixture']);
  await symlink(join(process.cwd(), 'node_modules'), join(repositoryRoot, 'node_modules'), 'junction');
  await build({
    root: repositoryRoot,
    configFile: false,
    mode: 'benchmark',
    logLevel: 'silent',
    build: { outDir: join(repositoryRoot, 'dist'), emptyOutDir: true },
  });
  expect(runGit(repositoryRoot, ['status', '--porcelain=v2', '-z'])).toBe('');
  runGit(repositoryRoot, ['rev-parse', '--verify', 'HEAD']);
  withPoisonedGitEnvironment(() => buildRunner(repositoryRoot));
});

test.afterAll(async () => {
  if (temporaryRoot !== undefined) await rm(temporaryRoot, { recursive: true, force: true });
});

test('runs the clean built CLI through a real WP04 diagnostic receipt and rejects provenance swaps', async () => {
  test.setTimeout(300_000);
  const candidatePath = 'src/main.ts';
  const candidateDigest = digestFileSetPathsV1([{ path: candidatePath as never, absolutePath: join(repositoryRoot, 'src', 'main.ts') }], 'fileset').digest;
  const buildDigest = digestFileSetPathsV1(enumerateFileSetDirectoryV1(join(repositoryRoot, 'dist'), 'build'), 'build').digest;
  const expectedSourceCommitSha = runGit(repositoryRoot, ['rev-parse', '--verify', 'HEAD']).trim();
  const controlsRoot = join(temporaryRoot, 'controls');
  await mkdir(controlsRoot);
  const planInputPath = join(controlsRoot, 'plan-input.json');
  const planPath = join(controlsRoot, 'run-plan.json');
  const preflightPath = join(controlsRoot, 'synthetic-preflight.json');
  await writeFile(planInputPath, canonicalizeJsonV1({
    expectedSourceCommitSha,
    expectedBuildSha256: buildDigest,
    fixtureContractId: 'wp04-golden-world-v1',
    fixtureSemanticSha256: WP04_SEMANTIC_SHA256,
    hardwareProfileId: 'br03-ci-correctness',
    hardwareBindingSha256: `sha256:${'1'.repeat(64)}`,
    syntheticHardwareProfile: true,
    browser: { requestedChannel: 'chrome', headless: true, requestedArgs: [] },
    orderSeed: 0x1020_3040,
    candidates: [
      { id: 'candidate-a', sourceFileSetSha256: candidateDigest },
      { id: 'candidate-b', sourceFileSetSha256: candidateDigest },
    ],
    scenarios: [{
      id: 'mesh-golden-world-v1',
      parameters: [
        { key: 'seed', value: 0x4845_5354 },
        { key: 'backend', value: 'three-webgl2' },
        { key: 'mesher', value: 'greedy-ao' },
        { key: 'chunk-edge', value: 32 },
        { key: 'worker-count', value: 0 },
      ],
    }],
    phases: {
      cold: { enabled: true, minimumProcessesPerCandidate: 10 },
      warmMeasurement: { enabled: false, minimumProcessesPerCandidate: 0, measurementIterationsPerProcess: 0 },
      stress: { enabled: false, minimumProcessesPerCandidate: 0 },
      trace: { enabled: false, minimumProcessesPerCandidate: 0 },
      leak: { enabled: false, minimumProcessesPerCandidate: 0 },
    },
    retryPolicy: 'none',
  }));
  await writeFile(preflightPath, canonicalizeJsonV1({
    schemaVersion: 'br03-synthetic-contract-preflight-v1',
    candidates: ['candidate-a', 'candidate-b'].map((candidateId) => ({
      id: candidateId,
      binding: {
        id: candidateId,
        version: 1,
        sourceFileSetSha256: observed(candidateDigest),
        sourcePaths: observed([candidatePath]),
      },
    })),
  }));

  const planResult = JSON.parse(runNode(repositoryRoot, ['.benchmark-runner/runner.mjs', 'plan', '--input', planInputPath, '--output', planPath]));
  expect(planResult.status).toBe('planned');
  const createdUtc = '2026-08-24T18:00:00.000Z';
  const runResult = JSON.parse(runNode(repositoryRoot, [
    '.benchmark-runner/runner.mjs', 'run', '--plan', planPath, '--mode', 'synthetic-contract-v1', '--slot-index', '0',
    '--created-utc', createdUtc, '--output-root', join(repositoryRoot, '.benchmark-results'), '--preflight', preflightPath,
  ]));
  expect(runResult.status).toBe('completed');
  const verifyResult = JSON.parse(runNode(repositoryRoot, ['.benchmark-runner/runner.mjs', 'verify', '--plan', planPath, '--invocation-root', runResult.invocationRoot]));
  expect(verifyResult.status).toBe('verified');

  const invocation = JSON.parse(await readFile(join(runResult.invocationRoot, 'invocation.json'), 'utf8')) as { readonly outputRoot: string; readonly runnerSourceSha: Sha256DigestV1 };
  const document = JSON.parse(await readFile(join(runResult.bundleRoot, 'raw', 'hardware-cell.json'), 'utf8')) as {
    readonly source: { readonly commitSha: string; readonly build: { readonly sha256: string }; readonly fixture: { readonly id: string; readonly semanticSha256: { readonly status: string; readonly value: string } }; readonly candidate: { readonly sourceFileSetSha256: { readonly status: string; readonly value: string } } };
    readonly browserProcesses: readonly [{ readonly runs: readonly [{ readonly measurementEligible: boolean; readonly measurementEligibilityReasons: readonly [{ readonly code: string }] }] }];
  };
  const receipts = JSON.parse(await readFile(join(runResult.bundleRoot, 'bundle-manifest.json'), 'utf8')) as { readonly runs: readonly [{ readonly validationReceipt: { readonly path: string } }]; readonly claimClass: string };
  const receipt = JSON.parse(await readFile(join(runResult.bundleRoot, receipts.runs[0]!.validationReceipt.path), 'utf8')) as { readonly status: string; readonly validator: { readonly sourceCommitSha: string; readonly sourceFileSetSha256: string } };
  expect(invocation.outputRoot).toBe('<RESULTS>');
  expect(invocation.runnerSourceSha).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(document.source.commitSha).toBe(expectedSourceCommitSha);
  expect(document.source.build.sha256).toBe(buildDigest);
  expect(document.source.fixture).toMatchObject({ id: 'wp04-golden-world-v1', semanticSha256: { status: 'observed', value: WP04_SEMANTIC_SHA256 } });
  expect(document.source.candidate).toMatchObject({ sourceFileSetSha256: { status: 'observed', value: candidateDigest } });
  expect(document.browserProcesses[0]!.runs[0]!).toMatchObject({ measurementEligible: false, measurementEligibilityReasons: [{ code: 'environment-incomplete' }] });
  expect(receipts.claimClass).toBe('diagnostic');
  expect(receipts.runs).toHaveLength(1);
  expect(receipt).toMatchObject({ status: 'schema-and-integrity-valid', validator: { sourceCommitSha: VALIDATOR_COMMIT_SHA } });
  const validator = validatorSummary(repositoryRoot);
  expect(validator).toMatchObject({ fileCount: 19, totalBytes: 420416, digest: 'sha256:f44a2d4aa367221e8a0f941c7d5dcaf9bff30c2f809d9b9bbc32beb5f3df4840' });
  expect(receipt.validator.sourceFileSetSha256).toBe(validator.digest);

  const lifecyclePreflightPath = join(controlsRoot, 'lifecycle-preflight.json');
  const fixtureBinding = BENCHMARK_SOURCE_FIXTURE_BINDINGS_V1['wp04-golden-world-v1'];
  await writeFile(lifecyclePreflightPath, canonicalizeJsonV1({
    schemaVersion: 'br03-lifecycle-smoke-preflight-v1',
    fixtureSemanticPath: 'fixture-semantic.json',
    fixture: { ...fixtureBinding, semanticSha256: observed(WP04_SEMANTIC_SHA256) },
    candidates: ['candidate-a', 'candidate-b'].map((candidateId) => ({
      id: candidateId,
      binding: {
        id: candidateId,
        version: 1,
        sourceFileSetSha256: observed(candidateDigest),
        sourcePaths: observed([candidatePath]),
      },
    })),
  }));
  const lifecycleOutcome = runNodeOutcome(repositoryRoot, [
    '.benchmark-runner/runner.mjs', 'run', '--plan', planPath, '--mode', 'lifecycle-smoke-v1', '--slot-index', '0',
    '--created-utc', '2026-08-24T18:00:30.000Z', '--output-root', join(repositoryRoot, '.benchmark-results'), '--preflight', lifecyclePreflightPath,
  ]);
  expect(lifecycleOutcome.status).toBe(7);
  const lifecycleResult = JSON.parse(lifecycleOutcome.stdout) as { readonly status: string; readonly disposition: string; readonly invocationId: string; readonly invocationRoot: string; readonly artifactRoot: string };
  expect(lifecycleResult).toMatchObject({ status: 'completed', disposition: 'unsupported' });
  expect(JSON.parse(runNode(repositoryRoot, ['.benchmark-runner/runner.mjs', 'verify', '--plan', planPath, '--invocation-root', lifecycleResult.invocationRoot])).status).toBe('verified');
  const lifecycleRun = JSON.parse(await readFile(join(lifecycleResult.artifactRoot, 'run.json'), 'utf8')) as { readonly measurementEligible: boolean; readonly measurementEligibilityReasons: readonly [{ readonly code: string }] };
  const lifecycleEnvironment = JSON.parse(await readFile(join(lifecycleResult.artifactRoot, 'environment.json'), 'utf8')) as { readonly browser: { readonly product: { readonly status: string } } };
  expect(lifecycleRun).toMatchObject({ measurementEligible: false, measurementEligibilityReasons: [{ code: 'environment-incomplete' }] });
  expect(lifecycleEnvironment.browser.product.status).toBe('observed');
  expect((await readFile(join(lifecycleResult.artifactRoot, 'telemetry-export.json'))).byteLength).toBeGreaterThan(0);
  await expect(readdir(join(dirname(lifecycleResult.invocationRoot), '.profiles', lifecycleResult.invocationId))).rejects.toThrow();

  const poisonedRun = withPoisonedGitEnvironment(() => {
    const run = runNodeOutcome(repositoryRoot, [
      '.benchmark-runner/runner.mjs', 'run', '--plan', planPath, '--mode', 'synthetic-contract-v1', '--slot-index', '0',
      '--created-utc', '2026-08-24T18:00:45.000Z', '--output-root', join(repositoryRoot, '.benchmark-results'), '--preflight', preflightPath,
    ]);
    const verify = JSON.parse(runNode(repositoryRoot, ['.benchmark-runner/runner.mjs', 'verify', '--plan', planPath, '--invocation-root', runResult.invocationRoot]));
    return { run, verify };
  });
  expect(poisonedRun.run.status).toBe(0);
  expect(JSON.parse(poisonedRun.run.stdout).status).toBe('completed');
  expect(poisonedRun.verify.status).toBe('verified');

  const mainSource = await readFile(join(repositoryRoot, candidatePath));
  await writeFile(join(repositoryRoot, candidatePath), Buffer.concat([mainSource, Buffer.from('\n// dirty fixture\n')]));
  expectCommandFailure(repositoryRoot, [
    '.benchmark-runner/runner.mjs', 'run', '--plan', planPath, '--mode', 'synthetic-contract-v1', '--slot-index', '0',
    '--created-utc', '2026-08-24T18:01:00.000Z', '--output-root', join(repositoryRoot, '.benchmark-results'), '--preflight', preflightPath,
  ], /source|dirty|preflight/i);
  await writeFile(join(repositoryRoot, candidatePath), mainSource);

  await writeFile(join(repositoryRoot, candidatePath), Buffer.concat([mainSource, Buffer.from('\n// dirty runner build\n')]));
  expect(() => buildRunner(repositoryRoot)).toThrow();
  await writeFile(join(repositoryRoot, candidatePath), mainSource);

  const originalRunner = await readFile(join(repositoryRoot, '.benchmark-runner', 'runner.mjs'));
  await writeFile(join(repositoryRoot, '.benchmark-runner', 'runner.mjs'), Buffer.concat([originalRunner, Buffer.from('\n// tampered\n')]));
  expectCommandFailure(repositoryRoot, ['.benchmark-runner/runner.mjs', 'verify', '--plan', planPath, '--invocation-root', runResult.invocationRoot], /invocation|plan|root|runner/i);
  await writeFile(join(repositoryRoot, '.benchmark-runner', 'runner.mjs'), originalRunner);

  runGit(repositoryRoot, ['commit', '--quiet', '--allow-empty', '-m', 'BR03 changed checkout identity']);
  expectCommandFailure(repositoryRoot, ['.benchmark-runner/runner.mjs', 'verify', '--plan', planPath, '--invocation-root', runResult.invocationRoot], /checkout|commit|source|authority/i);

  const checkoutY = join(temporaryRoot, 'checkout-y');
  runGit(temporaryRoot, ['clone', '--quiet', '--no-local', repositoryRoot, checkoutY]);
  await symlink(join(process.cwd(), 'node_modules'), join(checkoutY, 'node_modules'), 'junction');
  await mkdir(join(checkoutY, '.benchmark-runner'));
  await writeFile(join(checkoutY, '.benchmark-runner', 'runner.mjs'), originalRunner);
  expectCommandFailure(checkoutY, [
    join(repositoryRoot, '.benchmark-runner', 'runner.mjs'), 'run', '--plan', planPath, '--mode', 'synthetic-contract-v1', '--slot-index', '0',
    '--created-utc', '2026-08-24T18:02:00.000Z', '--output-root', join(checkoutY, '.benchmark-results'), '--preflight', preflightPath,
  ], /runner|checkout|authority|source/i);
  await expect(readdir(join(checkoutY, '.benchmark-results'))).rejects.toThrow();
});

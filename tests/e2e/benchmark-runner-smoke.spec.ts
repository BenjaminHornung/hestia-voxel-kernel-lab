import { execFileSync } from 'node:child_process';
import { access, appendFile, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, relative, sep, join } from 'node:path';
import { createConnection } from 'node:net';
import { expect, test, type TestInfo } from '@playwright/test';
import { build } from 'vite';
import { BENCHMARK_SOURCE_FIXTURE_BINDINGS_V1, getBenchmarkWp04SemanticBytesV1 } from '../../src/benchmark/contracts/scenarioRegistryV1';
import type { CanonicalIdV1, Sha256DigestV1 } from '../../src/benchmark/contracts/typesV1';
import { canonicalizeJsonV1 } from '../../src/benchmark/provenance/canonicalJsonV1';
import { digestFileSetV1, digestFileSetPathsV1, enumerateFileSetDirectoryV1 } from '../../src/benchmark/provenance/fileSetDigestV1';
import { runBlackBoxCommandV1, type BlackBoxCommandOptionsV1 } from '../fixtures/benchmark/runner/blackBoxCommandV1';

const id = (value: string) => value as CanonicalIdV1;
const WP04_SEMANTIC_SHA256 = 'sha256:6481f4b81631c6bbed5560970f92aa82e51de77a233ec40d919dbbf765f99b44';
const VALIDATOR_COMMIT_SHA = 'e88978cbcd5504789a804fb25e353e08aaec1bd6';

let temporaryRoot: string;
let repositoryRoot: string;

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
  return execFileSync('git', ['--no-replace-objects', ...args], { cwd: repository, encoding, windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024 });
}

function runGitBytes(repository: string, args: readonly string[]): Buffer {
  return execFileSync('git', ['--no-replace-objects', ...args], { cwd: repository, encoding: 'buffer', windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024 });
}

function buildRunner(repository: string): void {
  execFileSync(process.execPath, [join(repository, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit'], { cwd: repository, windowsHide: true, stdio: 'pipe', timeout: 180_000 });
  execFileSync(process.execPath, [join(repository, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', 'vite.runner.config.ts'], { cwd: repository, windowsHide: true, stdio: 'pipe', timeout: 180_000 });
}

function assertCandidateClean(): void {
  expect(runGit(repositoryRoot, ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=none'])).toBe('');
}

async function profileInventory(): Promise<readonly string[]> {
  try {
    return (await readdir(join(repositoryRoot, '.benchmark-results', '.profiles'))).sort();
  } catch {
    return [];
  }
}

async function invocationInventory(): Promise<readonly string[]> {
  try {
    return (await readdir(join(repositoryRoot, '.benchmark-results'))).filter((entry) => !entry.startsWith('.')).sort();
  } catch {
    return [];
  }
}

function portAcceptsConnections(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const finish = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

async function writeSignalPreload(path: string, markerPath: string, profileRoot: string, signal: 'SIGINT' | 'SIGTERM'): Promise<void> {
  await writeFile(path, [
    "const fs = require('node:fs');",
    'delete process.env.NODE_OPTIONS;',
    `const profileRoot = ${JSON.stringify(profileRoot)};`,
    `const markerPath = ${JSON.stringify(markerPath)};`,
    `const signal = ${JSON.stringify(signal)};`,
    'const deadline = Date.now() + 30000;',
    'const timer = setInterval(() => {',
    '  let ready = false;',
    '  try { ready = fs.readdirSync(profileRoot).length > 0 && process.listenerCount(signal) > 0; } catch {}',
    '  if (!ready && Date.now() < deadline) return;',
    "  if (!ready) { clearInterval(timer); process.stderr.write('Signal injection boundary unavailable.\\n'); process.exitCode = 91; return; }",
    '  clearInterval(timer);',
    '  setTimeout(() => {}, 5000);',
    '  setTimeout(() => {',
    "    const describe = (raw) => ({ rawName: raw.name, listenerName: raw.listener?.name ?? null, source: String(raw.listener ?? raw).slice(0, 160) });",
    "    const listeners = process.rawListeners(signal).map(describe);",
    "    fs.writeFileSync(markerPath, JSON.stringify({ listenerCount: listeners.length, viteListenerCount: listeners.filter(({ listenerName, source }) => listenerName?.startsWith('parentSigtermCallback') || source.includes('sigtermCallbacks')).length, listeners, stdinEndListeners: process.stdin.rawListeners('end').map(describe) }));",
    '    process.emit(signal, signal);',
    '  }, 1000);',
    '}, 10);',
  ].join('\n'));
}

async function writeCleanupFailurePreload(path: string): Promise<void> {
  await writeFile(path, [
    "const fsPromises = require('node:fs/promises');",
    'delete process.env.NODE_OPTIONS;',
    'const originalRm = fsPromises.rm;',
    'fsPromises.rm = async (path, options) => {',
    "  if (String(path).includes('.profiles')) {",
    "    const error = new Error('Injected profile cleanup failure.');",
    "    error.code = 'EACCES';",
    '    throw error;',
    '  }',
    '  return originalRm(path, options);',
    '};',
  ].join('\n'));
}

async function writeTimeoutPreload(path: string, markerPath: string): Promise<void> {
  await writeFile(path, [
    "const fs = require('node:fs');",
    'delete process.env.NODE_OPTIONS;',
    `const markerPath = ${JSON.stringify(markerPath)};`,
    "const baseline = process.listenerCount('SIGTERM');",
    'const timer = setInterval(() => {',
    "  if (process.listenerCount('SIGTERM') <= baseline) return;",
    '  clearInterval(timer);',
    "  fs.writeFileSync(markerPath, 'lifecycle-started');",
    '}, 10);',
  ].join('\n'));
}

async function waitForFile(path: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error('Controlled black-box marker did not appear within its bound.');
}

async function waitForOwnedProfile(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await profileInventory()).length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Owned browser profile did not appear within its bound.');
}

type BuiltCommandOptionsV1 = Partial<Pick<BlackBoxCommandOptionsV1, 'timeoutMs' | 'classification' | 'env' | 'control' | 'observeBefore' | 'observeAfter' | 'innerTimeout'>>;

function runBuilt(testInfo: TestInfo, label: string, args: readonly string[], options: BuiltCommandOptionsV1 = {}) {
  return runBlackBoxCommandV1({
    label,
    command: process.execPath,
    args: ['.benchmark-runner/runner.mjs', ...args],
    cwd: repositoryRoot,
    timeoutMs: options.timeoutMs ?? 180_000,
    receiptPath: testInfo.outputPath('receipts', `${label}.json`),
    classification: options.classification ?? 'expected-success',
    ...options,
  });
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
  const records = runGitBytes(repository, ['ls-tree', '-r', '-z', '--full-tree', 'e88978cbcd5504789a804fb25e353e08aaec1bd6', '--', 'src/benchmark/contracts', 'src/benchmark/provenance'])
    .toString('utf8').replace(/\0$/, '').split('\0');
  const files = records.map((record) => {
    const path = record.slice(record.indexOf('\t') + 1);
    return { path: path as never, bytes: runGitBytes(repository, ['cat-file', 'blob', `e88978cbcd5504789a804fb25e353e08aaec1bd6:${path}`]) };
  });
  return { digest: digestFileSetV1(files, 'fileset'), fileCount: files.length, totalBytes: files.reduce((total, file) => total + file.bytes.byteLength, 0) };
}

test.beforeAll(async () => {
  test.setTimeout(300_000);
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
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath === undefined) throw new Error('npm CLI path is unavailable.');
  execFileSync(process.execPath, [npmExecPath, 'ci'], {
    cwd: repositoryRoot,
    windowsHide: true,
    stdio: 'pipe',
    timeout: 180_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  expect(runGit(repositoryRoot, ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=none'])).toBe('');
  await build({
    root: repositoryRoot,
    configFile: false,
    mode: 'benchmark',
    logLevel: 'silent',
    build: { outDir: join(repositoryRoot, 'dist'), emptyOutDir: true },
  });
  expect(runGit(repositoryRoot, ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=none'])).toBe('');
  runGit(repositoryRoot, ['rev-parse', '--verify', 'HEAD']);
  withPoisonedGitEnvironment(() => buildRunner(repositoryRoot));
});

test.afterAll(async () => {
  if (temporaryRoot !== undefined) await rm(temporaryRoot, { recursive: true, force: true });
});

test('runs the clean built CLI through a real WP04 diagnostic receipt and rejects provenance swaps', async ({}, testInfo) => {
  test.setTimeout(600_000);
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
    comparisonMode: 'reference-paired',
    referenceCandidateId: 'candidate-a',
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

  const invalidInputPath = join(controlsRoot, 'invalid-input.json');
  await writeFile(invalidInputPath, '{"schemaVersion":"not-a-run-plan"}\n');
  const invalidInput = await runBuilt(testInfo, 'invalid-input', ['plan', '--input', invalidInputPath, '--output', join(controlsRoot, 'invalid-plan.json')], { classification: 'expected-invalid-input' });
  expect(invalidInput.status).toBe(2);

  const planOutcome = await runBuilt(testInfo, 'plan', ['plan', '--input', planInputPath, '--output', planPath]);
  expect(planOutcome.status, planOutcome.stderr).toBe(0);
  const planResult = JSON.parse(planOutcome.stdout);
  expect(planResult.status).toBe('planned');
  const createdUtc = '2026-08-24T18:00:00.000Z';
  const syntheticOutcome = await runBuilt(testInfo, 'synthetic-run', [
    'run', '--plan', planPath, '--mode', 'synthetic-contract-v1', '--slot-index', '0',
    '--created-utc', createdUtc, '--output-root', join(repositoryRoot, '.benchmark-results'), '--preflight', preflightPath,
  ]);
  expect(syntheticOutcome.status, syntheticOutcome.stderr).toBe(0);
  const runResult = JSON.parse(syntheticOutcome.stdout);
  expect(runResult.status).toBe('completed');
  const verifyOutcome = await runBuilt(testInfo, 'verify', ['verify', '--plan', planPath, '--invocation-root', runResult.invocationRoot]);
  expect(verifyOutcome.status, verifyOutcome.stderr).toBe(0);
  const verifyResult = JSON.parse(verifyOutcome.stdout);
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
  expect(runGit(repositoryRoot, ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=none'])).toBe('');
  const lifecycleOutcome = await runBuilt(testInfo, 'unsupported-live-slot', [
    'run', '--plan', planPath, '--mode', 'lifecycle-smoke-v1', '--slot-index', '1',
    '--created-utc', '2026-08-24T18:00:30.000Z', '--output-root', join(repositoryRoot, '.benchmark-results'), '--preflight', lifecyclePreflightPath,
  ], {
    classification: 'expected-unsupported',
    observeBefore: async () => ({ profiles: await profileInventory(), ports: [] }),
    observeAfter: async (outcome) => {
      const result = JSON.parse(outcome.stdout) as { readonly artifactRoot: string };
      const ownership = JSON.parse(await readFile(join(result.artifactRoot, 'ownership.json'), 'utf8')) as { readonly preview: { readonly host: string; readonly port: number } };
      return {
        profiles: await profileInventory(),
        ports: [{ ...ownership.preview, acceptsConnections: await portAcceptsConnections(ownership.preview.host, ownership.preview.port) }],
      };
    },
  });
  expect(lifecycleOutcome.status, lifecycleOutcome.stderr).toBe(7);
  const lifecycleResult = JSON.parse(lifecycleOutcome.stdout) as { readonly status: string; readonly disposition: string; readonly invocationId: string; readonly invocationRoot: string; readonly artifactRoot: string };
  expect(lifecycleResult).toMatchObject({ status: 'completed', disposition: 'unsupported' });
  const lifecycleVerify = await runBuilt(testInfo, 'unsupported-live-slot-verify', ['verify', '--plan', planPath, '--invocation-root', lifecycleResult.invocationRoot]);
  expect(lifecycleVerify.status, lifecycleVerify.stderr).toBe(0);
  expect(JSON.parse(lifecycleVerify.stdout).status).toBe('verified');
  const lifecycleRun = JSON.parse(await readFile(join(lifecycleResult.artifactRoot, 'run.json'), 'utf8')) as { readonly measurementEligible: boolean; readonly measurementEligibilityReasons: readonly [{ readonly code: string }] };
  const lifecycleEnvironment = JSON.parse(await readFile(join(lifecycleResult.artifactRoot, 'environment.json'), 'utf8')) as { readonly browser: { readonly product: { readonly status: string } } };
  const lifecycleOwnership = JSON.parse(await readFile(join(lifecycleResult.artifactRoot, 'ownership.json'), 'utf8')) as { readonly preview: { readonly host: string; readonly port: number } };
  expect(lifecycleRun).toMatchObject({ measurementEligible: false, measurementEligibilityReasons: [{ code: 'environment-incomplete' }] });
  expect(lifecycleEnvironment.browser.product.status).toBe('observed');
  expect(lifecycleOwnership.preview.host).toBe('127.0.0.1');
  expect(lifecycleOwnership.preview.port).toBeGreaterThan(0);
  expect(await portAcceptsConnections(lifecycleOwnership.preview.host, lifecycleOwnership.preview.port)).toBe(false);
  const lifecycleCommandReceipt = JSON.parse(await readFile(testInfo.outputPath('receipts', 'unsupported-live-slot.json'), 'utf8')) as { readonly observations: { readonly after: { readonly ports: readonly { readonly host: string; readonly port: number; readonly acceptsConnections: boolean }[] } } };
  expect(lifecycleCommandReceipt.observations.after.ports).toEqual([{ ...lifecycleOwnership.preview, acceptsConnections: false }]);
  expect((await readFile(join(lifecycleResult.artifactRoot, 'telemetry-export.json'))).byteLength).toBeGreaterThan(0);
  await expect(readdir(join(dirname(lifecycleResult.invocationRoot), '.profiles', lifecycleResult.invocationId))).rejects.toThrow();

  const approvedRerun = await runBuilt(testInfo, 'approved-rerun', [
    'run', '--plan', planPath, '--mode', 'synthetic-contract-v1', '--slot-index', '0',
    '--created-utc', '2026-08-24T18:00:31.000Z', '--attempt', '1', '--approval-id', 'poison-approval', '--replaces-invocation-root', runResult.invocationRoot,
    '--output-root', join(repositoryRoot, '.benchmark-results'), '--preflight', preflightPath,
  ], {
    env: {
      ...process.env,
      GIT_DIR: join(temporaryRoot, 'not-a-git-directory'),
      GIT_CONFIG_PARAMETERS: "'core.repositoryformatversion=99'",
      GIT_ATTR_SOURCE: 'br03-nonexistent-attribute-source',
    },
  });
  expect(approvedRerun.status, approvedRerun.stderr).toBe(0);
  const rerunResult = JSON.parse(approvedRerun.stdout);
  const rerunVerify = await runBuilt(testInfo, 'approved-rerun-verify', ['verify', '--plan', planPath, '--invocation-root', rerunResult.invocationRoot]);
  expect(rerunVerify.status, rerunVerify.stderr).toBe(0);
  const rerunInvocation = JSON.parse(await readFile(join(rerunResult.invocationRoot, 'invocation.json'), 'utf8')) as { readonly attempt: number; readonly rerunOrigin: { readonly reason: string; readonly approvalId: string; readonly replacesInvocationId: string } };
  expect(rerunInvocation).toMatchObject({
    attempt: 1,
    rerunOrigin: { reason: 'infrastructure-failure', approvalId: 'poison-approval', replacesInvocationId: runResult.invocationId },
  });

  const profileRoot = join(repositoryRoot, '.benchmark-results', '.profiles');
  assertCandidateClean();
  const timeoutPreloadPath = join(controlsRoot, 'timeout-preload.cjs');
  const timeoutMarkerPath = join(controlsRoot, 'timeout-marker');
  await writeTimeoutPreload(timeoutPreloadPath, timeoutMarkerPath);
  const invocationsBeforeTimeout = new Set(await invocationInventory());
  const timeoutOutcome = await runBuilt(testInfo, 'outer-timeout', [
    'run', '--plan', planPath, '--mode', 'lifecycle-smoke-v1', '--slot-index', '1',
    '--attempt', '1', '--approval-id', 'timeout-approval', '--replaces-invocation-root', lifecycleResult.invocationRoot,
    '--created-utc', '2026-08-24T18:00:31.000Z', '--output-root', join(repositoryRoot, '.benchmark-results'), '--preflight', lifecyclePreflightPath,
  ], {
    timeoutMs: 180_000,
    classification: 'expected-outer-timeout',
    env: { ...process.env, NODE_OPTIONS: `--require=${timeoutPreloadPath}` },
    control: async ({ timeout }) => {
      await waitForFile(timeoutMarkerPath, 30_000);
      await waitForOwnedProfile(30_000);
      await timeout();
    },
    observeBefore: async () => ({ profiles: await profileInventory() }),
    observeAfter: async () => ({ profiles: await profileInventory() }),
  });
  expect(timeoutOutcome.timedOut).toBe(true);
  expect(await profileInventory()).not.toEqual([]);
  const timeoutInvocationId = (await invocationInventory()).find((entry) => !invocationsBeforeTimeout.has(entry));
  expect(timeoutInvocationId).toBeDefined();
  await rm(join(repositoryRoot, '.benchmark-results', timeoutInvocationId!), { recursive: true, force: true });
  await rm(profileRoot, { recursive: true, force: true });
  expect(await profileInventory()).toEqual([]);

  assertCandidateClean();
  const cleanupPreloadPath = join(controlsRoot, 'cleanup-failure-preload.cjs');
  await writeCleanupFailurePreload(cleanupPreloadPath);
  const invocationsBeforeCleanup = new Set(await invocationInventory());
  const cleanupFailure = await runBuilt(testInfo, 'cleanup-failure', [
    'run', '--plan', planPath, '--mode', 'lifecycle-smoke-v1', '--slot-index', '0',
    '--attempt', '2', '--approval-id', 'cleanup-approval', '--replaces-invocation-root', rerunResult.invocationRoot,
    '--created-utc', '2026-08-24T18:00:35.000Z', '--output-root', join(repositoryRoot, '.benchmark-results'), '--preflight', lifecyclePreflightPath,
  ], {
    classification: 'expected-cleanup-failure',
    env: { ...process.env, NODE_OPTIONS: `--require=${cleanupPreloadPath}` },
    observeBefore: async () => ({ profiles: await profileInventory() }),
    observeAfter: async () => ({ profiles: await profileInventory() }),
  });
  expect(cleanupFailure.status).toBe(8);
  expect(await profileInventory()).not.toEqual([]);
  const cleanupInvocationId = (await invocationInventory()).find((entry) => !invocationsBeforeCleanup.has(entry));
  expect(cleanupInvocationId).toBeDefined();
  const cleanupInvocationRoot = join(repositoryRoot, '.benchmark-results', cleanupInvocationId!);
  const cleanupVerify = await runBuilt(testInfo, 'cleanup-failure-verify', ['verify', '--plan', planPath, '--invocation-root', cleanupInvocationRoot]);
  expect(cleanupVerify.status, cleanupVerify.stderr).toBe(0);
  const cleanupResults = JSON.parse(await readFile(join(cleanupInvocationRoot, 'process-unit-results.json'), 'utf8')) as readonly { readonly failureCode: string; readonly failureClass: string; readonly disposition: string }[];
  expect(cleanupResults).toContainEqual(expect.objectContaining({ disposition: 'failed', failureClass: 'cleanup', failureCode: 'cleanup-failed' }));
  const cleanupDiagnosticNames = await readdir(join(cleanupInvocationRoot, 'failure-diagnostics'));
  expect(cleanupDiagnosticNames).toHaveLength(1);
  const cleanupDiagnostic = JSON.parse(await readFile(join(cleanupInvocationRoot, 'failure-diagnostics', cleanupDiagnosticNames[0]!), 'utf8')) as { readonly stage: string; readonly cleanupState: string };
  expect(cleanupDiagnostic).toMatchObject({ stage: 'cleanup-failed', cleanupState: 'failed' });
  await rm(profileRoot, { recursive: true, force: true });
  expect(await profileInventory()).toEqual([]);

  const signalCases = [
    { slotIndex: 0, signal: 'SIGINT' as const, attempt: 3, predecessor: cleanupInvocationRoot },
    { slotIndex: 1, signal: 'SIGTERM' as const, attempt: 1, predecessor: lifecycleResult.invocationRoot },
  ];
  for (const { slotIndex, signal, attempt, predecessor } of signalCases) {
    assertCandidateClean();
    const invocationsBeforeSignal = new Set(await invocationInventory());
    const preloadPath = join(controlsRoot, `${signal.toLowerCase()}-preload.cjs`);
    const markerPath = join(controlsRoot, `${signal.toLowerCase()}-marker.json`);
    await writeSignalPreload(preloadPath, markerPath, profileRoot, signal);
    const signalOutcome = await runBuilt(testInfo, signal.toLowerCase(), [
      'run', '--plan', planPath, '--mode', 'lifecycle-smoke-v1', '--slot-index', String(slotIndex),
      '--attempt', String(attempt), '--approval-id', `${signal.toLowerCase()}-approval`, '--replaces-invocation-root', predecessor,
      '--created-utc', `2026-08-24T18:00:4${slotIndex}.000Z`, '--output-root', join(repositoryRoot, '.benchmark-results'), '--preflight', lifecyclePreflightPath,
    ], {
      classification: `expected-${signal.toLowerCase()}`,
      env: { ...process.env, NODE_OPTIONS: `--require=${preloadPath}` },
      observeBefore: async () => ({ profiles: await profileInventory() }),
      observeAfter: async () => ({ profiles: await profileInventory(), signalMarker: JSON.parse(await readFile(markerPath, 'utf8')) }),
    });
    const signalMarker = JSON.parse(await readFile(markerPath, 'utf8')) as { readonly listenerCount: number; readonly viteListenerCount: number };
    expect(signalMarker.listenerCount).toBeGreaterThan(0);
    if (signal === 'SIGTERM') expect(signalMarker.viteListenerCount).toBe(0);
    expect(signalOutcome.status, signalOutcome.stderr).toBe(5);
    const signalInvocationId = (await invocationInventory()).find((entry) => !invocationsBeforeSignal.has(entry));
    expect(signalInvocationId).toBeDefined();
    const signalInvocationRoot = join(repositoryRoot, '.benchmark-results', signalInvocationId!);
    const signalResults = JSON.parse(await readFile(join(signalInvocationRoot, 'process-unit-results.json'), 'utf8')) as readonly { readonly failureCode: string; readonly disposition: string }[];
    expect(signalResults).toContainEqual(expect.objectContaining({ disposition: 'aborted', failureCode: 'operator-abort' }));
    const signalDiagnosticNames = await readdir(join(signalInvocationRoot, 'failure-diagnostics'));
    expect(signalDiagnosticNames).toHaveLength(1);
    const signalDiagnostic = JSON.parse(await readFile(join(signalInvocationRoot, 'failure-diagnostics', signalDiagnosticNames[0]!), 'utf8')) as { readonly stage: string; readonly signal: string; readonly cleanupState: string };
    expect(signalDiagnostic).toMatchObject({ stage: 'operator-abort', signal, cleanupState: 'complete' });
    const signalVerify = await runBuilt(testInfo, `${signal.toLowerCase()}-verify`, ['verify', '--plan', planPath, '--invocation-root', signalInvocationRoot]);
    expect(signalVerify.status, signalVerify.stderr).toBe(0);
    expect(await profileInventory()).toEqual([]);
  }

  const duplicateAttempt = await runBuilt(testInfo, 'duplicate-initial-attempt', [
    'run', '--plan', planPath, '--mode', 'synthetic-contract-v1', '--slot-index', '0',
    '--created-utc', '2026-08-24T18:00:15.000Z', '--output-root', join(repositoryRoot, '.benchmark-results'), '--preflight', preflightPath,
  ], { classification: 'expected-duplicate-rejection' });
  expect(duplicateAttempt.status).toBe(4);
  const duplicateVerify = await runBuilt(testInfo, 'duplicate-preserves-initial', ['verify', '--plan', planPath, '--invocation-root', runResult.invocationRoot]);
  expect(duplicateVerify.status, duplicateVerify.stderr).toBe(0);
  expect(JSON.parse(duplicateVerify.stdout).status).toBe('verified');

  expect((await runBuilt(testInfo, 'invalid-rerun-missing-approval', [
    'run', '--plan', planPath, '--mode', 'synthetic-contract-v1', '--slot-index', '0',
    '--attempt', '1', '--created-utc', '2026-08-24T18:00:20.000Z', '--output-root', join(repositoryRoot, '.benchmark-results'), '--preflight', preflightPath,
  ], { classification: 'expected-invalid-input' })).status).toBe(2);
  expect((await runBuilt(testInfo, 'invalid-rerun-attempt-bound', [
    'run', '--plan', planPath, '--mode', 'synthetic-contract-v1', '--slot-index', '0',
    '--attempt', '1025', '--approval-id', 'approval', '--replaces-invocation-root', runResult.invocationRoot, '--created-utc', '2026-08-24T18:00:25.000Z',
    '--output-root', join(repositoryRoot, '.benchmark-results'), '--preflight', preflightPath,
  ], { classification: 'expected-invalid-input' })).status).toBe(2);

  const mainSource = await readFile(join(repositoryRoot, candidatePath));
  await writeFile(join(repositoryRoot, candidatePath), Buffer.concat([mainSource, Buffer.from('\n// dirty fixture\n')]));
  const dirtySource = await runBuilt(testInfo, 'dirty-source-rejection', [
    'run', '--plan', planPath, '--mode', 'synthetic-contract-v1', '--slot-index', '0',
    '--created-utc', '2026-08-24T18:01:00.000Z', '--output-root', join(repositoryRoot, '.benchmark-results'), '--preflight', preflightPath,
  ], { classification: 'expected-dirty-source-rejection' });
  expect(dirtySource.status).not.toBe(0);
  expect(dirtySource.stderr).toMatch(/source|dirty|preflight/i);
  await writeFile(join(repositoryRoot, candidatePath), mainSource);

  await writeFile(join(repositoryRoot, candidatePath), Buffer.concat([mainSource, Buffer.from('\n// dirty runner build\n')]));
  expect(() => buildRunner(repositoryRoot)).toThrow();
  await writeFile(join(repositoryRoot, candidatePath), mainSource);

  const originalRunner = await readFile(join(repositoryRoot, '.benchmark-runner', 'runner.mjs'));
  await writeFile(join(repositoryRoot, '.benchmark-runner', 'runner.mjs'), Buffer.concat([originalRunner, Buffer.from('\n// tampered\n')]));
  const tamperedVerify = await runBuilt(testInfo, 'tampered-runner', ['verify', '--plan', planPath, '--invocation-root', runResult.invocationRoot], { classification: 'expected-tamper-rejection' });
  expect(tamperedVerify.status).not.toBe(0);
  expect(tamperedVerify.stderr).toMatch(/invocation|plan|root|runner/i);
  await writeFile(join(repositoryRoot, '.benchmark-runner', 'runner.mjs'), originalRunner);

  runGit(repositoryRoot, ['commit', '--quiet', '--allow-empty', '-m', 'BR03 changed checkout identity']);
  const changedCheckout = await runBuilt(testInfo, 'changed-checkout-rejection', ['verify', '--plan', planPath, '--invocation-root', runResult.invocationRoot], { classification: 'expected-checkout-rejection' });
  expect(changedCheckout.status).not.toBe(0);
  expect(changedCheckout.stderr).toMatch(/checkout|commit|source|authority/i);

  const checkoutY = join(temporaryRoot, 'checkout-y');
  runGit(temporaryRoot, ['clone', '--quiet', '--no-local', repositoryRoot, checkoutY]);
  await mkdir(join(checkoutY, '.benchmark-runner'));
  await writeFile(join(checkoutY, '.benchmark-runner', 'runner.mjs'), originalRunner);
  const foreignCheckout = await runBlackBoxCommandV1({
    label: 'foreign-checkout-rejection',
    command: process.execPath,
    args: [join(repositoryRoot, '.benchmark-runner', 'runner.mjs'), 'run', '--plan', planPath, '--mode', 'synthetic-contract-v1', '--slot-index', '0',
    '--created-utc', '2026-08-24T18:02:00.000Z', '--output-root', join(checkoutY, '.benchmark-results'), '--preflight', preflightPath,
    ],
    cwd: checkoutY,
    timeoutMs: 180_000,
    receiptPath: testInfo.outputPath('receipts', 'foreign-checkout-rejection.json'),
    classification: 'expected-checkout-rejection',
  });
  expect(foreignCheckout.status).not.toBe(0);
  expect(foreignCheckout.stderr).toMatch(/runner|checkout|authority|source/i);
  await expect(readdir(join(checkoutY, '.benchmark-results'))).rejects.toThrow();
});

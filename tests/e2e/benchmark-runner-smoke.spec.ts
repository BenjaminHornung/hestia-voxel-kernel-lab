import { execFileSync } from 'node:child_process';
import { access, appendFile, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { build, createServer, type ViteDevServer } from 'vite';
import type { BenchmarkScenarioParameterV1, CanonicalIdV1, Sha256DigestV1, UInt32V1 } from '../../src/benchmark/contracts';

const id = (value: string) => value as CanonicalIdV1;
let temporaryRoot: string;
let repositoryRoot: string;
let moduleServer: ViteDevServer;
let lifecycleModule: typeof import('../../src/benchmark/runner/live/lifecycleSmokeRunV1');
let planModule: typeof import('../../src/benchmark/runner/plan/runPlanV1');
let registryModule: typeof import('../../src/benchmark/contracts/scenarioRegistryV1');
let digestModule: typeof import('../../src/benchmark/provenance/fileSetDigestV1');

test.beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'br03-runner-e2e-'));
  moduleServer = await createServer({ root: process.cwd(), configFile: false, mode: 'benchmark', logLevel: 'silent', server: { middlewareMode: true } });
  const [loadedLifecycle, loadedPlan, loadedRegistry, loadedDigest] = await Promise.all([
    moduleServer.ssrLoadModule('/src/benchmark/runner/live/lifecycleSmokeRunV1.ts'),
    moduleServer.ssrLoadModule('/src/benchmark/runner/plan/runPlanV1.ts'),
    moduleServer.ssrLoadModule('/src/benchmark/contracts/scenarioRegistryV1.ts'),
    moduleServer.ssrLoadModule('/src/benchmark/provenance/fileSetDigestV1.ts'),
  ]);
  lifecycleModule = loadedLifecycle as unknown as typeof lifecycleModule;
  planModule = loadedPlan as unknown as typeof planModule;
  registryModule = loadedRegistry as unknown as typeof registryModule;
  digestModule = loadedDigest as unknown as typeof digestModule;
  repositoryRoot = join(temporaryRoot, 'repository');
  execFileSync('git', ['clone', '--quiet', '--no-local', process.cwd(), repositoryRoot], { windowsHide: true });
  repositoryRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true }).trim();
  await symlink(join(process.cwd(), 'node_modules'), join(repositoryRoot, 'node_modules'), 'junction');
  await writeFile(join(repositoryRoot, 'fixture-semantic.json'), registryModule.getBenchmarkWp04SemanticBytesV1());
  await appendFile(join(repositoryRoot, '.gitignore'), '\n.benchmark-results/\n');
  execFileSync('git', ['add', '--', '.gitignore', 'fixture-semantic.json'], { cwd: repositoryRoot, windowsHide: true });
  execFileSync('git', ['-c', 'user.name=BR03 test', '-c', 'user.email=br03-test@example.invalid', 'commit', '--quiet', '-m', 'Add lifecycle fixture'], { cwd: repositoryRoot, windowsHide: true });
  await build({
    root: repositoryRoot,
    configFile: false,
    mode: 'benchmark',
    logLevel: 'silent',
    build: { outDir: join(repositoryRoot, 'dist'), emptyOutDir: true },
  });
});

test.afterAll(async () => {
  if (moduleServer !== undefined) await moduleServer.close();
  if (temporaryRoot !== undefined) await rm(temporaryRoot, { recursive: true, force: true });
});

test('runs preflight, CDP, real BR02 lifecycle, diagnostic artifacts, and owned cleanup', async () => {
  const parameters: readonly BenchmarkScenarioParameterV1[] = [
    { key: 'seed', value: 0x4845_5354 as UInt32V1 },
    { key: 'backend', value: 'three-webgl2' },
    { key: 'mesher', value: 'visible' },
    { key: 'chunk-edge', value: 32 },
    { key: 'worker-count', value: 0 },
  ];
  const candidatePath = 'src/main.ts';
  const candidateDigest = digestModule.digestFileSetPathsV1([{ path: candidatePath as never, absolutePath: join(repositoryRoot, 'src', 'main.ts') }], 'fileset').digest;
  const buildDigest = digestModule.digestFileSetPathsV1(digestModule.enumerateFileSetDirectoryV1(join(repositoryRoot, 'dist'), 'build'), 'build').digest;
  const commit = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true }).trim();
  const plan = planModule.buildRunPlanV1({
    expectedSourceCommitSha: commit as never,
    expectedBuildSha256: buildDigest,
    fixtureContractId: id('wp04-golden-world-v1'),
    fixtureSemanticSha256: registryModule.BENCHMARK_WP04_SEMANTIC_SHA256_V1,
    hardwareProfileId: id('br03-ci-correctness'),
    hardwareBindingSha256: `sha256:${'1'.repeat(64)}` as Sha256DigestV1,
    syntheticHardwareProfile: true,
    browser: { requestedChannel: 'chrome', headless: true, requestedArgs: [] },
    orderSeed: 0x1020_3040,
    candidates: [id('candidate-a'), id('candidate-b')].map((candidateId) => ({ id: candidateId, sourceFileSetSha256: candidateDigest })),
    scenarios: [{ id: 'mesh-golden-world-v1', parameters }],
    phases: {
      cold: { enabled: true, minimumProcessesPerCandidate: 10 },
      warmMeasurement: { enabled: false, minimumProcessesPerCandidate: 0, measurementIterationsPerProcess: 0 },
      stress: { enabled: false, minimumProcessesPerCandidate: 0 },
      trace: { enabled: false, minimumProcessesPerCandidate: 0 },
      leak: { enabled: false, minimumProcessesPerCandidate: 0 },
    },
    retryPolicy: 'none',
  });
  const sourceRef = id('br03-e2e-source');
  const observed = <T,>(value: T) => ({ status: 'observed' as const, value, sourceRef, stability: 'stable' as const });
  const fixtureOwner = registryModule.BENCHMARK_SOURCE_FIXTURE_BINDINGS_V1['wp04-golden-world-v1'];
  const candidateBinding = (candidateId: CanonicalIdV1) => ({ id: candidateId, version: 1 as never, sourceFileSetSha256: observed(candidateDigest), sourcePaths: observed([candidatePath as never] as [never]) });
  const result = await lifecycleModule.runLifecycleSmokeV1({
    plan,
    slotIndex: 0,
    createdUtc: '2026-08-20T21:30:00.000Z',
    outputRoot: join(repositoryRoot, '.benchmark-results'),
    projectRoot: repositoryRoot,
    preflight: {
      schemaVersion: 'br03-lifecycle-smoke-preflight-v1',
      fixtureSemanticPath: 'fixture-semantic.json',
      fixture: { ...fixtureOwner, semanticSha256: observed(registryModule.BENCHMARK_WP04_SEMANTIC_SHA256_V1) } as never,
      candidates: [id('candidate-a'), id('candidate-b')].map((candidateId) => ({ id: candidateId, binding: candidateBinding(candidateId) })),
    },
  });
  const run = JSON.parse(await readFile(join(result.artifactRoot, 'run.json'), 'utf8'));
  const invocation = JSON.parse(await readFile(join(result.invocationRoot, 'invocation.json'), 'utf8'));
  const environment = JSON.parse(await readFile(join(result.artifactRoot, 'environment.json'), 'utf8'));
  expect(run.measurementEligible).toBe(false);
  expect(environment.browser.product.status).toBe('observed');
  expect(run.runId).toBe(result.runId);
  expect(invocation.outputRoot).toBe('<RESULTS>');
  expect((await readFile(join(result.artifactRoot, 'telemetry-export.json'))).byteLength).toBeGreaterThan(0);
  await expect(access(join(result.invocationRoot, '.profiles'))).rejects.toThrow();
});

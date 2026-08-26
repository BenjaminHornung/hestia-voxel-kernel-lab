import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
// @ts-expect-error Node's native type stripping requires the explicit extension.
import { boundedGitV1, cleanStatusV1, runBlackBoxCommandV1 } from './blackBoxCommandV1.ts';

const repositoryRoot = resolve(process.cwd());
const npmExecPath = process.env.npm_execpath;
if (npmExecPath === undefined) throw new Error('npm CLI path is unavailable.');
const vitestExecPath = resolve(repositoryRoot, 'node_modules', 'vitest', 'vitest.mjs');
if (cleanStatusV1(repositoryRoot) !== '') throw new Error('BR03 final gates require a clean candidate worktree.');

const candidateRef = boundedGitV1(repositoryRoot, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
const receiptRoot = join(repositoryRoot, '.benchmark-results', 'gate-receipts', candidateRef);
const integrationRef = 'e88978cbcd5504789a804fb25e353e08aaec1bd6';
const allowedPaths = new Set([
  '.gitignore', 'docs/benchmark/runner-v1.md', 'package.json', 'vite.runner.config.ts',
  'src/benchmark/runner/artifacts/artifactStoreV1.ts', 'src/benchmark/runner/assembly/receiptMinterV1.ts', 'src/benchmark/runner/assembly/runAssemblerV1.ts',
  'src/benchmark/runner/browser/br02HandoffDriverV1.ts', 'src/benchmark/runner/cli.ts', 'src/benchmark/runner/contractsV1.ts', 'src/benchmark/runner/environment/environmentCollectorV1.ts',
  'src/benchmark/runner/ids/orchestrationIdsV1.ts', 'src/benchmark/runner/invocation/runInvocationV1.ts', 'src/benchmark/runner/live/lifecycleSmokeRunV1.ts',
  'src/benchmark/runner/plan/counterbalanceV1.ts', 'src/benchmark/runner/plan/planFileV1.ts', 'src/benchmark/runner/plan/runPlanV1.ts',
  'src/benchmark/runner/preflight/preflightBindingsV1.ts', 'src/benchmark/runner/process/browserProcessSupervisorV1.ts', 'src/benchmark/runner/process/cleanupGuardV1.ts',
  'src/benchmark/runner/process/previewServerSupervisorV1.ts', 'src/benchmark/runner/provenance/gitCommandV1.ts', 'src/benchmark/runner/results/processUnitResultLedgerV1.ts',
  'src/benchmark/runner/runnerSourceV1.ts', 'src/benchmark/runner/scenarios/scenarioDriverRegistryV1.ts', 'src/benchmark/runner/synthetic/syntheticContractRunV1.ts',
  'src/benchmark/runner/synthetic/validatorAttestationV1.ts', 'src/benchmark/runner/validation/warmupControllerV1.ts', 'tests/e2e/benchmark-runner-smoke.spec.ts',
  'tests/fixtures/benchmark/runner/blackBoxCommandV1.ts', 'tests/fixtures/benchmark/runner/cli-synthetic-input.json', 'tests/fixtures/benchmark/runner/finalGateHarnessV1.ts',
  'tests/fixtures/benchmark/runner/runPlanInputV1.ts', 'tests/fixtures/benchmark/runner/runnerSourceV1.ts', 'tests/fixtures/benchmark/runner/synthetic-contract-plan-input-v1.json',
  'tests/unit/benchmark/runner/black-box-command-v1.test.ts', 'tests/unit/benchmark/runner/br02-handoff-driver-v1.test.ts', 'tests/unit/benchmark/runner/br03-gate-allowlist-v1.test.ts',
  'tests/unit/benchmark/runner/cli-v1.test.ts', 'tests/unit/benchmark/runner/contract-inventory-v1.test.ts', 'tests/unit/benchmark/runner/environment-collector-v1.test.ts',
  'tests/unit/benchmark/runner/invocation-warmup-v1.test.ts', 'tests/unit/benchmark/runner/lifecycle-smoke-v1.test.ts', 'tests/unit/benchmark/runner/process-supervisors-v1.test.ts',
  'tests/unit/benchmark/runner/process-unit-result-ledger-v1.test.ts', 'tests/unit/benchmark/runner/run-assembly-receipt-v1.test.ts', 'tests/unit/benchmark/runner/run-plan-v1.test.ts',
  'tests/unit/benchmark/runner/scenario-driver-registry-v1.test.ts',
]);

async function nativeCandidateGuards(): Promise<string> {
  const changedPaths = [
    ...boundedGitV1(repositoryRoot, ['diff', '--name-only', integrationRef]).trim().split(/\r?\n/u),
    ...boundedGitV1(repositoryRoot, ['ls-files', '--others', '--exclude-standard']).trim().split(/\r?\n/u),
  ].filter(Boolean);
  if (changedPaths.some((path) => !allowedPaths.has(path))) {
    throw new Error('BR03 native candidate guard rejected a path outside the cumulative allowlist.');
  }
  const accepted = JSON.parse(boundedGitV1(repositoryRoot, ['show', `${integrationRef}:package.json`])) as { readonly dependencies: unknown; readonly devDependencies: unknown };
  const candidate = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')) as { readonly dependencies: unknown; readonly devDependencies: unknown };
  if (JSON.stringify([candidate.dependencies, candidate.devDependencies]) !== JSON.stringify([accepted.dependencies, accepted.devDependencies])) {
    throw new Error('BR03 native candidate guard rejected a dependency graph change.');
  }
  return 'passed';
}

async function profiles(): Promise<readonly string[]> {
  try {
    return (await readdir(join(repositoryRoot, '.benchmark-results', '.profiles'))).sort();
  } catch {
    return [];
  }
}

async function gate(label: string, command: string, args: readonly string[], timeoutMs: number, before?: () => Promise<string>): Promise<void> {
  const outcome = await runBlackBoxCommandV1({
    label,
    command,
    args,
    cwd: repositoryRoot,
    timeoutMs,
    receiptPath: join(receiptRoot, `${label}.json`),
    classification: 'final-gate',
    observeBefore: async () => ({ profiles: await profiles(), ports: [], nativeCandidateGuards: await before?.() ?? 'not-applicable' }),
    observeAfter: async () => ({ profiles: await profiles(), ports: [] }),
  });
  if (outcome.timedOut || outcome.status !== 0 || outcome.signal !== null) {
    process.stderr.write(outcome.stdout);
    process.stderr.write(outcome.stderr);
    throw new Error(`BR03 final gate ${label} failed; see its immutable command receipt.`);
  }
  if (cleanStatusV1(repositoryRoot) !== '') throw new Error(`BR03 final gate ${label} dirtied the candidate worktree.`);
}

await gate('01-npm-ci', process.execPath, [npmExecPath, 'ci'], 300_000, nativeCandidateGuards);
await gate('02-focused-runner-tests', process.execPath, [vitestExecPath, 'run', '--maxWorkers=1',
  'tests/unit/benchmark/runner/black-box-command-v1.test.ts',
  'tests/unit/benchmark/runner/br03-gate-allowlist-v1.test.ts',
  'tests/unit/benchmark/runner/process-supervisors-v1.test.ts',
  'tests/unit/benchmark/runner/br02-handoff-driver-v1.test.ts',
  'tests/unit/benchmark/runner/lifecycle-smoke-v1.test.ts',
  'tests/unit/benchmark/runner/run-assembly-receipt-v1.test.ts'], 300_000);
await gate('03-unit-tests', process.execPath, [vitestExecPath, 'run', '--maxWorkers=1'], 600_000);
await gate('04-build', process.execPath, [npmExecPath, 'run', 'build'], 300_000);
await gate('05-build-benchmark', process.execPath, [npmExecPath, 'run', 'build:benchmark'], 300_000);
await gate('06-build-runner', process.execPath, [npmExecPath, 'run', 'build:runner'], 300_000);
await gate('07-e2e-and-built-runner-matrix', process.execPath, [npmExecPath, 'run', 'test:e2e'], 1_200_000);
await gate('08-dependency-tree', process.execPath, [npmExecPath, 'ls', '--depth=0'], 120_000);
await gate('09-diff-check', 'git', ['--no-replace-objects', 'diff', '--check'], 30_000);

if ((await profiles()).length !== 0) throw new Error('BR03 final gates left an owned browser profile behind.');
if (cleanStatusV1(repositoryRoot) !== '') throw new Error('BR03 final gates did not preserve a clean candidate worktree.');
process.stdout.write(`${JSON.stringify({ status: 'passed', candidateRef, receiptRoot })}\n`);

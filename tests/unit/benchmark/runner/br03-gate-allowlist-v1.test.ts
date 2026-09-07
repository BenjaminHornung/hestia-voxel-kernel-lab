import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const INTEGRATION_SHA = 'e88978cbcd5504789a804fb25e353e08aaec1bd6';
const FORBIDDEN_PREFIXES = [
  'src/benchmark/contracts/',
  'src/benchmark/provenance/',
  'src/benchmark/adapters/',
  'src/diagnostics/telemetry/',
  'tests/contracts/',
  'evidence/',
] as const;
const ALLOWED_PATHS = new Set([
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
  'tests/unit/benchmark/contracts/future-provenance-contract-v1.test.ts', 'tests/unit/benchmark/provenance/source-preflight-v1.test.ts',
  'tests/unit/benchmark/runner/black-box-command-v1.test.ts', 'tests/unit/benchmark/runner/br02-handoff-driver-v1.test.ts', 'tests/unit/benchmark/runner/br03-gate-allowlist-v1.test.ts',
  'tests/unit/benchmark/runner/cli-v1.test.ts', 'tests/unit/benchmark/runner/contract-inventory-v1.test.ts', 'tests/unit/benchmark/runner/environment-collector-v1.test.ts',
  'tests/unit/benchmark/runner/invocation-warmup-v1.test.ts', 'tests/unit/benchmark/runner/lifecycle-smoke-v1.test.ts', 'tests/unit/benchmark/runner/process-supervisors-v1.test.ts',
  'tests/unit/benchmark/runner/process-unit-result-ledger-v1.test.ts', 'tests/unit/benchmark/runner/run-assembly-receipt-v1.test.ts', 'tests/unit/benchmark/runner/run-plan-v1.test.ts',
  'tests/unit/benchmark/runner/scenario-driver-registry-v1.test.ts',
  'docs/benchmark/aggregator-v1.md',
  'src/benchmark/aggregate/br04AggregateV1.ts', 'src/benchmark/aggregate/br04ContractV1.ts', 'src/benchmark/aggregate/br04CrosswalkV1.ts',
  'src/benchmark/aggregate/br04StatisticsV1.ts', 'src/benchmark/reports/br04MarkdownReportV1.ts',
  'tests/fixtures/benchmark/aggregate/br04FixtureBuildersV1.ts', 'tests/fixtures/benchmark/aggregate/br04GoldenDigestsV1.ts',
  'tests/unit/benchmark/aggregate/br04-crosswalk.test.ts', 'tests/unit/benchmark/aggregate/br04-effect-decision.test.ts', 'tests/unit/benchmark/aggregate/br04-hierarchy-bootstrap.test.ts',
  'tests/unit/benchmark/aggregate/br04-markdown-report.test.ts', 'tests/unit/benchmark/aggregate/br04-negative-golden.test.ts', 'tests/unit/benchmark/aggregate/br04-paired-golden.test.ts',
  'tests/unit/benchmark/aggregate/br04-phase-capability-golden.test.ts', 'tests/unit/benchmark/aggregate/br04-population-qualification.test.ts', 'tests/unit/benchmark/aggregate/br04-properties.test.ts',
  'tests/unit/benchmark/aggregate/br04-quantile-golden.test.ts', 'tests/unit/benchmark/aggregate/br04-validation-ledger.test.ts',
]);

function git(args: readonly string[]): string {
  const result = spawnSync('git', ['--no-replace-objects', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 5_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0 || result.signal !== null || result.error !== undefined) {
    throw new Error('Bounded BR03 Git allowlist inspection failed.');
  }
  return result.stdout;
}

describe('BR03 cumulative gate allowlist', () => {
  it('keeps frozen integration and Evidence paths unchanged', () => {
    const changedPaths = [
      ...git(['diff', '--name-only', INTEGRATION_SHA]).trim().split(/\r?\n/u),
      ...git(['ls-files', '--others', '--exclude-standard']).trim().split(/\r?\n/u),
    ].filter(Boolean);
    expect(changedPaths.filter((path) => path === 'package-lock.json' || FORBIDDEN_PREFIXES.some((prefix) => path.startsWith(prefix)))).toEqual([]);
    expect(changedPaths.filter((path) => !ALLOWED_PATHS.has(path))).toEqual([]);
  }, 30_000);

  it('keeps the integration anchor and package dependency graph available', () => {
    expect(git(['rev-parse', '--verify', `${INTEGRATION_SHA}^{commit}`]).trim()).toBe(INTEGRATION_SHA);
    expect(git(['diff', '--name-only', INTEGRATION_SHA, 'HEAD', '--', 'package-lock.json'])).toBe('');
    const acceptedPackage = JSON.parse(git(['show', `${INTEGRATION_SHA}:package.json`])) as { readonly dependencies: unknown; readonly devDependencies: unknown };
    const candidatePackage = JSON.parse(readFileSync('package.json', 'utf8')) as { readonly dependencies: unknown; readonly devDependencies: unknown };
    expect({ dependencies: candidatePackage.dependencies, devDependencies: candidatePackage.devDependencies })
      .toEqual({ dependencies: acceptedPackage.dependencies, devDependencies: acceptedPackage.devDependencies });
  }, 30_000);
});

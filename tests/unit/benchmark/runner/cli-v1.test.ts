import { mkdtemp, readdir, rm, mkdir, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalizeJsonV1 } from '../../../../src/benchmark/provenance';
import { assertBundleRunBindingsV1, assertRunModeCompatibilityV1, classifyRunnerErrorV1, CliInputErrorV1, readPredecessorLineageV1 } from '../../../../src/benchmark/runner/cli';
import { RunnerFailureErrorV1 } from '../../../../src/benchmark/runner/contractsV1';
import { parseRunPlanInputJsonV1 } from '../../../../src/benchmark/runner/plan/planFileV1';
import { buildRunPlanV1, RunPlanValidationErrorV1 } from '../../../../src/benchmark/runner/plan/runPlanV1';
import { runPlanInputV1 } from '../../../fixtures/benchmark/runner/runPlanInputV1';

describe('BR03 CLI failure and closure contracts v1', () => {
  it('enforces the exact valid-run to bundle-run set', () => {
    expect(() => assertBundleRunBindingsV1(['run-a', 'run-b'], ['run-a'])).toThrow(/logical-run bindings/);
    expect(() => assertBundleRunBindingsV1(['run-a'], ['run-a', 'run-a'])).toThrow(/logical-run bindings/);
    expect(() => assertBundleRunBindingsV1(['run-b', 'run-a'], ['run-a', 'run-b'])).not.toThrow();
  });

  it('rejects a non-synthetic hardware profile at the synthetic CLI boundary', () => {
    const input = parseRunPlanInputJsonV1(canonicalizeJsonV1(runPlanInputV1()));
    const plan = buildRunPlanV1({ ...input, syntheticHardwareProfile: false });
    let failure: unknown;
    try {
      assertRunModeCompatibilityV1('synthetic-contract-v1', plan, plan.core.processUnits[0]!);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(CliInputErrorV1);
    expect(classifyRunnerErrorV1(failure, 'run')).toBe(2);
  });

  it('maps the closed operational failure taxonomy and cleanup priority', () => {
    expect(classifyRunnerErrorV1(new Error('source preflight rejected'), 'run')).toBe(3);
    expect(classifyRunnerErrorV1(new Error('browser handoff failed'), 'run')).toBe(5);
    expect(classifyRunnerErrorV1(new Error('environment incomplete'), 'run')).toBe(6);
    expect(classifyRunnerErrorV1(new Error('scenario unavailable'), 'run')).toBe(7);
    expect(classifyRunnerErrorV1(new Error('cleanup failed after source preflight'), 'run')).toBe(8);
    expect(classifyRunnerErrorV1(new Error('malformed input'), 'plan')).toBe(2);
    expect(classifyRunnerErrorV1(new Error('Lifecycle-smoke process failed at build-handoff-rejected.'), 'run')).toBe(3);
    expect(classifyRunnerErrorV1(new Error('Lifecycle-smoke process failed at browser-crash.'), 'run')).toBe(5);
    expect(classifyRunnerErrorV1(new Error('Lifecycle-smoke process failed at operator-abort.'), 'run')).toBe(5);
    expect(classifyRunnerErrorV1(new TypeError('Built run plan failed verification.', { cause: new RunPlanValidationErrorV1(['invalid']) }), 'run')).toBe(2);
    expect(classifyRunnerErrorV1(new RunnerFailureErrorV1('browser-launch-failed', 'Browser launch failed.', { cause: new Error('profile retained') }), 'run')).toBe(4);
  });

  it('rejects a self-referencing rerun lineage without reading a predecessor', async () => {
    const { buildRunPlanV1 } = await import('../../../../src/benchmark/runner/plan/runPlanV1');
    const { runPlanInputV1 } = await import('../../../fixtures/benchmark/runner/runPlanInputV1');
    const { testRunnerSourceShaV1 } = await import('../../../fixtures/benchmark/runner/runnerSourceV1');
    const plan = buildRunPlanV1(runPlanInputV1());
    const current = {
      invocationId: 'self-cycle-a',
      outputRoot: '<RESULTS>',
      attempt: 1,
      rerunOrigin: { reason: 'infrastructure-failure', replacesInvocationId: 'self-cycle-a', approvalId: 'approval-a' },
    } as unknown as Parameters<typeof readPredecessorLineageV1>[1];
    await expect(readPredecessorLineageV1(join(tmpdir(), 'self-cycle-a'), current, plan, testRunnerSourceShaV1)).rejects.toThrow(/cycle/);
  });

  it('rejects a two-node rerun cycle without re-reading the entry and without writing', async () => {
    const { buildRunPlanV1 } = await import('../../../../src/benchmark/runner/plan/runPlanV1');
    const { runPlanInputV1 } = await import('../../../fixtures/benchmark/runner/runPlanInputV1');
    const { testRunnerSourceShaV1 } = await import('../../../fixtures/benchmark/runner/runnerSourceV1');
    const plan = buildRunPlanV1(runPlanInputV1());
    const root = await realpath(await mkdtemp(join(tmpdir(), 'br03-lineage-cycle-')));
    try {
      await mkdir(join(root, 'cycle-b'), { recursive: true });
      await writeFile(join(root, 'cycle-b', 'invocation.json'), canonicalizeJsonV1({
        invocationId: 'cycle-b',
        outputRoot: '<RESULTS>',
        attempt: 1,
        rerunOrigin: { reason: 'infrastructure-failure', replacesInvocationId: 'cycle-a', approvalId: 'approval-a' },
      } as unknown as Record<string, unknown>));
      const before = await readdir(root);
      const current = {
        invocationId: 'cycle-a',
        outputRoot: '<RESULTS>',
        attempt: 2,
        rerunOrigin: { reason: 'infrastructure-failure', replacesInvocationId: 'cycle-b', approvalId: 'approval-a' },
      } as unknown as Parameters<typeof readPredecessorLineageV1>[1];
      // cycle-a has no directory on disk: a second read would fail with a file error, not a cycle.
      await expect(readPredecessorLineageV1(join(root, 'cycle-a'), current, plan, testRunnerSourceShaV1)).rejects.toThrow(/cycle/);
      expect(await readdir(root)).toEqual(before);
      expect(await readdir(join(root, 'cycle-b'))).toEqual(['invocation.json']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

import { describe, expect, it } from 'vitest';
import { canonicalizeJsonV1 } from '../../../../src/benchmark/provenance';
import { assertBundleRunBindingsV1, assertRunModeCompatibilityV1, classifyRunnerErrorV1, CliInputErrorV1 } from '../../../../src/benchmark/runner/cli';
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
});

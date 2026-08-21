import { describe, expect, it } from 'vitest';
import type { CanonicalIdV1 } from '../../../../src/benchmark/contracts';
import { createRunInvocationV1, verifyRunInvocationV1 } from '../../../../src/benchmark/runner/invocation/runInvocationV1';
import { buildRunPlanV1 } from '../../../../src/benchmark/runner/plan/runPlanV1';
import { WarmupControllerV1, type WarmupControlSampleV1 } from '../../../../src/benchmark/runner/validation/warmupControllerV1';
import { runPlanInputV1 } from '../../../fixtures/benchmark/runner/runPlanInputV1';
import { testRunnerSourceShaV1 } from '../../../fixtures/benchmark/runner/runnerSourceV1';

const id = (value: string) => value as CanonicalIdV1;

describe('BR03 run invocation v1', () => {
  it('derives deterministic run and iteration IDs after plan finalization', () => {
    const plan = buildRunPlanV1(runPlanInputV1());
    const options = { createdUtc: '2026-08-20T12:00:00.000Z', outputRoot: '.benchmark-results', runnerSourceSha: testRunnerSourceShaV1 };
    const first = createRunInvocationV1(plan, options);
    const second = createRunInvocationV1(plan, options);
    expect(first).toEqual(second);
    expect(verifyRunInvocationV1(plan, first, testRunnerSourceShaV1)).toEqual([]);
    expect(first.invocationId).toMatch(/^br03-invocation-[0-9a-f]{64}$/);
    expect(new Set(first.processUnits.flatMap(({ runs }) => runs.map(({ runId }) => runId))).size)
      .toBe(first.processUnits.reduce((sum, { runs }) => sum + runs.length, 0));
    expect(new Set(first.processUnits.flatMap(({ runs }) => runs.flatMap(({ iterationIds }) => iterationIds))).size)
      .toBe(first.processUnits.reduce((sum, { runs }) => sum + runs.reduce((count, { iterationIds }) => count + iterationIds.length, 0), 0));
    const distinctInvocation = createRunInvocationV1(plan, { createdUtc: '2026-08-20T12:00:01.000Z', outputRoot: '.benchmark-results', runnerSourceSha: testRunnerSourceShaV1 });
    expect(distinctInvocation.processUnits[0]!.runs[0]!.runId).not.toBe(first.processUnits[0]!.runs[0]!.runId);

    const warm = first.processUnits[plan.core.processUnits.findIndex(({ processContainer }) => processContainer === 'warm-measurement')]!;
    expect(warm.runs).toHaveLength(51);
    expect(warm.runs.slice(0, 50).every(({ phase, iterationIds }) => phase === 'warmup' && iterationIds.length === 1)).toBe(true);
    expect(warm.runs[50]).toMatchObject({ phase: 'measurement' });
  });

  it('requires explicit approval metadata for infrastructure reruns', () => {
    const plan = buildRunPlanV1(runPlanInputV1());
    expect(() => createRunInvocationV1(plan, {
      createdUtc: '2026-08-20T12:00:00.000Z',
      outputRoot: '.benchmark-results',
      runnerSourceSha: `sha256:${'0'.repeat(64)}` as never,
    })).toThrow(/runner executable/);
    expect(() => createRunInvocationV1(plan, {
      createdUtc: '2026-08-20T12:00:00.000Z', outputRoot: '.benchmark-results', attempt: 1,
      runnerSourceSha: testRunnerSourceShaV1,
    })).toThrow(/approval metadata/);
    const initial = createRunInvocationV1(plan, { createdUtc: '2026-08-20T12:00:00.000Z', outputRoot: '.benchmark-results', runnerSourceSha: testRunnerSourceShaV1 });
    const rerun = createRunInvocationV1(plan, {
      createdUtc: '2026-08-20T12:01:00.000Z',
      outputRoot: '.benchmark-results',
      runnerSourceSha: testRunnerSourceShaV1,
      attempt: 1,
      rerunOrigin: { reason: 'infrastructure-failure', replacesInvocationId: initial.invocationId, approvalId: id('approval-1') },
    });
    expect(rerun.attempt).toBe(1);
    expect(rerun.invocationId).not.toBe(initial.invocationId);
  });

  it('binds selected-slot invocations without closing untouched plan units', () => {
    const plan = buildRunPlanV1(runPlanInputV1());
    const selectedSlotId = plan.core.processUnits[3]!.ids.slotId;
    const invocation = createRunInvocationV1(plan, {
      createdUtc: '2026-08-20T12:00:00.000Z',
      outputRoot: '.benchmark-results',
      runnerSourceSha: testRunnerSourceShaV1,
      selectedSlotIds: [selectedSlotId],
    });
    expect(invocation.selectedSlotIds).toEqual([selectedSlotId]);
    expect(invocation.processUnits).toHaveLength(1);
    expect(verifyRunInvocationV1(plan, invocation, testRunnerSourceShaV1)).toEqual([]);
    expect(invocation.invocationId).not.toBe(createRunInvocationV1(plan, {
      createdUtc: '2026-08-20T12:00:00.000Z',
      outputRoot: '.benchmark-results',
      runnerSourceSha: testRunnerSourceShaV1,
      selectedSlotIds: [plan.core.processUnits[4]!.ids.slotId],
    }).invocationId);
  });
});

describe('BR03 warmup controller v1', () => {
  const options = () => {
    const plan = buildRunPlanV1(runPlanInputV1());
    const unit = plan.core.processUnits.find(({ processContainer }) => processContainer === 'warm-measurement')!;
    return { scenarioId: unit.scenarioId, browserProcessId: unit.ids.browserProcessId, runPlanId: plan.runPlanId, runPlanSha256: plan.runPlanSha256 };
  };
  const sample = (ordinal: number, value: number): WarmupControlSampleV1 => ({
    sampleId: id(`sample-${ordinal}`),
    runId: id(`run-${ordinal}`),
    iterationId: id(`iteration-${ordinal}`),
    iterationOrdinal: ordinal,
    sampleOrdinal: 0,
    value,
  });

  it('recomputes with BR01 after every sample and binds every sample before measurement', () => {
    const controller = new WarmupControllerV1(options());
    for (let ordinal = 0; ordinal < 10; ordinal += 1) expect(controller.add(sample(ordinal, 10)).status).toBe('continue');
    const stable = controller.add(sample(10, 10));
    expect(stable.status).toBe('stable');
    if (stable.status !== 'stable') throw new Error('Expected stable warmup.');
    expect(stable.completedIterations).toBe(11);
    expect(stable.evidence.controlSamples).toHaveLength(11);
    expect(stable.evidence.controlMetricRef).toBe('chunk.mesh.cpu.ms@1');
    expect(() => controller.add(sample(11, 10))).toThrow(/already stable/);
  });

  it('fails closed at 50 unstable samples and rejects swapped IDs or ordinals', () => {
    const controller = new WarmupControllerV1(options());
    let status = 'continue';
    for (let ordinal = 0; ordinal < 50; ordinal += 1) {
      status = controller.add(sample(ordinal, 2 ** ordinal)).status;
    }
    expect(status).toBe('invalid');
    expect(controller.evidence).toBeNull();
    expect(() => new WarmupControllerV1(options()).add(sample(1, 1))).toThrow(/contiguous/);
    const duplicates = new WarmupControllerV1(options());
    duplicates.add(sample(0, 1));
    expect(() => duplicates.add({ ...sample(1, 1), runId: id('run-0') })).toThrow(/unique/);
  });
});

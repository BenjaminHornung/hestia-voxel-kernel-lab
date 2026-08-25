import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_METRIC_REGISTRY_V1,
  type CanonicalIdV1,
} from '../../../../src/benchmark/contracts';
import { adaptTelemetryExportV1 } from '../../../../src/benchmark/adapters';
import { createTelemetryBufferV1 } from '../../../../src/diagnostics/telemetry/bufferV1';
import { deriveTelemetryCapabilityIdsV1 } from '../../../../src/diagnostics/telemetry/contractV1';
import { createRunInvocationV1, verifyRunInvocationV1 } from '../../../../src/benchmark/runner/invocation/runInvocationV1';
import { buildRunPlanV1 } from '../../../../src/benchmark/runner/plan/runPlanV1';
import {
  AdaptiveWarmupControllerV1,
  bindAdaptiveWarmupControlSampleV1,
  WarmupControllerV1,
  type AdaptedWarmupControlSampleV1,
  type WarmupControlSampleV1,
} from '../../../../src/benchmark/runner/validation/warmupControllerV1';
import { runPlanInputV1 } from '../../../fixtures/benchmark/runner/runPlanInputV1';
import { testRunnerSourceShaV1 } from '../../../fixtures/benchmark/runner/runnerSourceV1';

const id = (value: string) => value as CanonicalIdV1;

describe('BR03 run invocation v1', () => {
  it('derives attempt-0 identity only from the plan and canonical selected slot set', () => {
    const plan = buildRunPlanV1(runPlanInputV1());
    const selected = [plan.core.processUnits[3]!.ids.slotId, plan.core.processUnits[1]!.ids.slotId];
    const first = createRunInvocationV1(plan, {
      createdUtc: '2026-08-20T12:00:00.000Z',
      outputRoot: '.benchmark-results',
      selectedSlotIds: selected,
      runnerSourceSha: testRunnerSourceShaV1,
    });
    const second = createRunInvocationV1(plan, {
      createdUtc: '2026-08-20T12:00:01.000Z',
      outputRoot: '.benchmark-results/other-spelling',
      selectedSlotIds: [...selected].reverse(),
      runnerSourceSha: testRunnerSourceShaV1,
    });
    expect(second.invocationId).toBe(first.invocationId);
    expect(second.selectedSlotIds).toEqual(first.selectedSlotIds);
    expect(second.processUnits.map(({ runs }) => runs.map(({ runId }) => runId))).toEqual(
      first.processUnits.map(({ runs }) => runs.map(({ runId }) => runId)),
    );
    expect(verifyRunInvocationV1(plan, first, testRunnerSourceShaV1)).toEqual([]);
    expect(first.invocationId).toMatch(/^br03-invocation-[0-9a-f]{64}$/);
  });

  it('does not reserve phantom warmup or measurement runs', () => {
    const plan = buildRunPlanV1(runPlanInputV1());
    const warmUnit = plan.core.processUnits.find(({ processContainer }) => processContainer === 'warm-measurement')!;
    const invocation = createRunInvocationV1(plan, {
      createdUtc: '2026-08-20T12:00:00.000Z',
      outputRoot: '.benchmark-results',
      selectedSlotIds: [warmUnit.ids.slotId],
      runnerSourceSha: testRunnerSourceShaV1,
    });
    expect(invocation.processUnits[0]).toMatchObject({
      runs: [],
      adaptiveWarmup: {
        schemaVersion: 'br03-adaptive-warmup-schedule-v1',
        maximumWarmupRuns: 50,
        measurementIterations: warmUnit.measurementIterations,
      },
    });
  });

  it('requires exact predecessor lineage and gives produced runs BR01 rerun origin', () => {
    const plan = buildRunPlanV1(runPlanInputV1());
    const slotId = plan.core.processUnits[0]!.ids.slotId;
    const initial = createRunInvocationV1(plan, {
      createdUtc: '2026-08-20T12:00:00.000Z', outputRoot: '.benchmark-results', selectedSlotIds: [slotId], runnerSourceSha: testRunnerSourceShaV1,
    });
    const origin = { reason: 'infrastructure-failure' as const, replacesInvocationId: initial.invocationId, approvalId: id('approval-1') };
    expect(() => createRunInvocationV1(plan, {
      createdUtc: '2026-08-20T12:01:00.000Z', outputRoot: '.benchmark-results', attempt: 1, rerunOrigin: origin,
      selectedSlotIds: [slotId], runnerSourceSha: testRunnerSourceShaV1,
    })).toThrow(/predecessor/);
    const rerun = createRunInvocationV1(plan, {
      createdUtc: '2026-08-20T12:01:00.000Z', outputRoot: '.benchmark-results', attempt: 1, rerunOrigin: origin,
      predecessorInvocation: initial, selectedSlotIds: [slotId], runnerSourceSha: testRunnerSourceShaV1,
    });
    expect(rerun.invocationId).not.toBe(initial.invocationId);
    expect(rerun.processUnits[0]!.runs[0]!.origin).toEqual({
      kind: 'infrastructure-rerun',
      replacesRunId: initial.processUnits[0]!.runs[0]!.runId,
      approvalId: id('approval-1'),
      reason: 'infrastructure-failure',
    });
    expect(verifyRunInvocationV1(plan, rerun, testRunnerSourceShaV1, initial)).toEqual([]);
    expect(() => createRunInvocationV1(plan, {
      createdUtc: '2026-08-20T12:02:00.000Z', outputRoot: '.benchmark-results', attempt: 2, rerunOrigin: origin,
      predecessorInvocation: initial, selectedSlotIds: [slotId], runnerSourceSha: testRunnerSourceShaV1,
    })).toThrow(/prior attempt/);
    expect(() => createRunInvocationV1(plan, {
      createdUtc: '2026-08-20T12:02:00.000Z', outputRoot: '.benchmark-results', attempt: 1, rerunOrigin: origin,
      predecessorInvocation: initial, selectedSlotIds: [plan.core.processUnits[1]!.ids.slotId], runnerSourceSha: testRunnerSourceShaV1,
    })).toThrow(/same plan and selected slots/);
    const otherPlan = buildRunPlanV1({ ...runPlanInputV1(), orderSeed: 2 });
    expect(() => createRunInvocationV1(otherPlan, {
      createdUtc: '2026-08-20T12:02:00.000Z', outputRoot: '.benchmark-results', attempt: 1, rerunOrigin: origin,
      predecessorInvocation: initial, selectedSlotIds: [otherPlan.core.processUnits[0]!.ids.slotId], runnerSourceSha: testRunnerSourceShaV1,
    })).toThrow(/same plan and selected slots/);
  });
});

function controllerFixture() {
  const plan = buildRunPlanV1(runPlanInputV1());
  const unit = plan.core.processUnits.find(({ processContainer }) => processContainer === 'warm-measurement')!;
  const invocation = createRunInvocationV1(plan, {
    createdUtc: '2026-08-20T12:00:00.000Z', outputRoot: '.benchmark-results',
    selectedSlotIds: [unit.ids.slotId], runnerSourceSha: testRunnerSourceShaV1,
  });
  return { plan, unit, invocation, controller: new AdaptiveWarmupControllerV1({ invocation, unit }) };
}

function adaptControlSample(
  fixture: ReturnType<typeof controllerFixture>,
  run: ReturnType<AdaptiveWarmupControllerV1['nextWarmupRun']>,
  value: number,
): AdaptedWarmupControlSampleV1 {
  const iterationId = run.iterationIds[0]!;
  const buffer = createTelemetryBufferV1({
    runId: run.runId,
    planId: fixture.plan.runPlanId,
    scenarioId: fixture.unit.scenarioId as CanonicalIdV1,
    phase: 'warmup',
    backend: 'three-webgl2',
    telemetryMode: 'telemetry-enabled-minimal',
    iterations: [{ iterationId, iterationOrdinal: 0 }],
    realms: [{ realmId: id('worker-realm'), realm: 'worker', timeOriginEpochMs: 1 }],
    capabilities: deriveTelemetryCapabilityIdsV1({ scenarioId: fixture.unit.scenarioId as CanonicalIdV1, phase: 'warmup', backend: 'three-webgl2' })
      .map((capabilityId) => ({ id: capabilityId, value: { status: 'observed' as const, value: true as const, sourceRef: id('capture-v1'), stability: 'stable' as const } })),
  });
  expect(buffer.append({
    realmId: id('worker-realm'), startMs: 1, kind: 'sample', name: 'worker.mesh-cpu', iterationId,
    fields: { sampleKind: 'duration', sourceUnit: 'ms', value, operationId: id('operation'), spanId: id('span'), dimensions: [{ key: 'chunk-key', value: id('chunk-0') }] },
  }).status).toBe('accepted');
  const telemetry = buffer.seal();
  const adapted = adaptTelemetryExportV1(telemetry as never, {
    hardwareCellId: id('hardware-cell'), slotId: fixture.unit.ids.slotId, browserProcessId: fixture.unit.ids.browserProcessId,
    runId: run.runId, iterationId, phase: 'warmup', runBindingSha256: `sha256:${'1'.repeat(64)}`,
  } as never, BENCHMARK_METRIC_REGISTRY_V1);
  expect(adapted.invalidReasons).toEqual([]);
  const sample = adapted.samples.find(({ metricRef }) => metricRef === 'chunk.mesh.cpu.ms@1');
  if (sample?.result.status !== 'valid') throw new Error('Expected one valid BR02-adapted warmup control sample.');
  return bindAdaptiveWarmupControlSampleV1({
    sampleId: sample.sampleId,
    runId: run.runId,
    iterationId,
    metricRef: sample.metricRef,
    ordinal: sample.ordinal,
    result: sample.result,
  }, run.runId, iterationId);
}

describe('BR03 adaptive warmup controller v1', () => {
  it('allocates one real run at a time and starts measurement at the first stable boundary', () => {
    const fixture = controllerFixture();
    const sampleIds: string[] = [];
    expect(() => fixture.controller.createMeasurementRun()).toThrow(/before/);
    for (let ordinal = 0; ordinal < 11; ordinal += 1) {
      const run = fixture.controller.nextWarmupRun();
      expect(() => fixture.controller.nextWarmupRun()).toThrow(/must finish/);
      const completed = fixture.controller.completeWarmupRun(adaptControlSample(fixture, run, 10));
      sampleIds.push(completed.boundSampleId);
      expect(completed.progress.status).toBe(ordinal === 10 ? 'stable' : 'continue');
      expect(completed.controlSample.iterationOrdinal).toBe(0);
    }
    const measurement = fixture.controller.createMeasurementRun();
    expect(measurement.phase).toBe('measurement');
    expect(fixture.controller.executedRuns).toHaveLength(12);
    expect(fixture.controller.evidence?.controlSamples).toHaveLength(11);
    expect(new Set(sampleIds).size).toBe(11);
    const runs = fixture.controller.executedRuns;
    expect(new Set(runs.map(({ runId }) => runId)).size).toBe(runs.length);
    expect(new Set(runs.flatMap(({ iterationIds }) => iterationIds)).size).toBe(runs.flatMap(({ iterationIds }) => iterationIds).length);
    expect(() => fixture.controller.nextWarmupRun()).toThrow(/terminal/);
  });

  it('is invalid at 50 without allocating a measurement or phantom run', () => {
    const fixture = controllerFixture();
    let status = 'continue';
    for (let ordinal = 0; ordinal < 50; ordinal += 1) {
      const run = fixture.controller.nextWarmupRun();
      status = fixture.controller.completeWarmupRun({
        sampleId: id(`bound-sample-${ordinal}`), runId: run.runId, iterationId: run.iterationIds[0]!, metricRef: 'chunk.mesh.cpu.ms@1',
        ordinal: 0, result: { status: 'valid', value: 2 ** ordinal },
      }).progress.status;
      expect(run.runOrdinal).toBe(ordinal);
    }
    expect(status).toBe('invalid');
    expect(fixture.controller.executedRuns).toHaveLength(50);
    expect(fixture.controller.evidence).toBeNull();
    expect(() => fixture.controller.createMeasurementRun()).toThrow(/before/);
  });

  it('keeps direct BR01 recomputation evidence exact and rejects duplicate ownership IDs', () => {
    const { plan, unit } = controllerFixture();
    const controller = new WarmupControllerV1({
      scenarioId: unit.scenarioId,
      browserProcessId: unit.ids.browserProcessId,
      runPlanId: plan.runPlanId,
      runPlanSha256: plan.runPlanSha256,
    });
    const sample = (ordinal: number): WarmupControlSampleV1 => ({
      sampleId: id(`sample-${ordinal}`), runId: id(`run-${ordinal}`), iterationId: id(`iteration-${ordinal}`),
      iterationOrdinal: 0, sampleOrdinal: 0, value: 10,
    });
    for (let ordinal = 0; ordinal < 10; ordinal += 1) expect(controller.add(sample(ordinal)).status).toBe('continue');
    expect(controller.add(sample(10)).status).toBe('stable');
    const duplicate = new WarmupControllerV1({
      scenarioId: unit.scenarioId, browserProcessId: unit.ids.browserProcessId, runPlanId: plan.runPlanId, runPlanSha256: plan.runPlanSha256,
    });
    duplicate.add(sample(0));
    expect(() => duplicate.add({ ...sample(1), runId: id('run-0') })).toThrow(/unique/);
  });
});

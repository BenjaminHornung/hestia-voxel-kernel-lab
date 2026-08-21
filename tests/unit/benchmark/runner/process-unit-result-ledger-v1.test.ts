import { describe, expect, it } from 'vitest';
import { buildRunPlanV1 } from '../../../../src/benchmark/runner/plan/runPlanV1';
import { createRunInvocationV1 } from '../../../../src/benchmark/runner/invocation/runInvocationV1';
import { ProcessUnitResultLedgerV1 } from '../../../../src/benchmark/runner/results/processUnitResultLedgerV1';
import { runPlanInputV1 } from '../../../fixtures/benchmark/runner/runPlanInputV1';
import { testRunnerSourceShaV1 } from '../../../fixtures/benchmark/runner/runnerSourceV1';

describe('BR03 process-unit result ledger v1', () => {
  it('requires exactly one terminal result for every planned process unit', () => {
    const plan = buildRunPlanV1(runPlanInputV1());
    const invocation = createRunInvocationV1(plan, { createdUtc: '2026-08-20T12:00:00.000Z', outputRoot: '.benchmark-results', runnerSourceSha: testRunnerSourceShaV1 });
    const ledger = new ProcessUnitResultLedgerV1(plan, invocation);
    const unit = plan.core.processUnits[0]!;
    const result = {
      schemaVersion: 'br03-process-unit-result-v1' as const,
      slotId: unit.ids.slotId,
      browserProcessId: unit.ids.browserProcessId,
      disposition: 'unsupported' as const,
      failureClass: 'unsupported' as const,
      failureCode: 'scenario-unavailable' as const,
      runIds: [],
    };
    ledger.record(result);
    expect(() => ledger.record(result)).toThrow(/already terminal/);
    expect(() => ledger.finalize()).toThrow(/incomplete/);

    for (const remaining of plan.core.processUnits.slice(1)) {
      ledger.record({ ...result, slotId: remaining.ids.slotId, browserProcessId: remaining.ids.browserProcessId });
    }
    expect(ledger.finalize()).toHaveLength(plan.core.processUnits.length);
  });

  it('rejects foreign IDs and inconsistent success taxonomy', () => {
    const plan = buildRunPlanV1(runPlanInputV1());
    const unit = plan.core.processUnits[0]!;
    const invocation = createRunInvocationV1(plan, { createdUtc: '2026-08-20T12:00:00.000Z', outputRoot: '.benchmark-results', runnerSourceSha: testRunnerSourceShaV1 });
    const ledger = new ProcessUnitResultLedgerV1(plan, invocation);
    expect(() => ledger.record({
      schemaVersion: 'br03-process-unit-result-v1', slotId: unit.ids.slotId, browserProcessId: unit.ids.browserProcessId,
      disposition: 'valid', failureClass: 'none', failureCode: 'none', runIds: [],
    })).toThrow(/taxonomy/);
    expect(() => ledger.record({
      schemaVersion: 'br03-process-unit-result-v1', slotId: unit.ids.slotId, browserProcessId: 'foreign' as never,
      disposition: 'unsupported', failureClass: 'unsupported', failureCode: 'scenario-unavailable', runIds: [],
    })).toThrow(/accepted plan/);
    expect(() => ledger.record({
      schemaVersion: 'br03-process-unit-result-v1', slotId: unit.ids.slotId, browserProcessId: unit.ids.browserProcessId,
      disposition: 'unsupported', failureClass: 'unsupported', failureCode: 'scenario-unavailable', runIds: ['foreign-run' as never],
    })).toThrow(/outside its invocation/);
  });

  it('rejects contradictory terminal dispositions', () => {
    const plan = buildRunPlanV1(runPlanInputV1());
    const unit = plan.core.processUnits[0]!;
    const invocation = createRunInvocationV1(plan, { createdUtc: '2026-08-20T12:00:00.000Z', outputRoot: '.benchmark-results', runnerSourceSha: testRunnerSourceShaV1 });
    const ledger = new ProcessUnitResultLedgerV1(plan, invocation);
    expect(() => ledger.record({
      schemaVersion: 'br03-process-unit-result-v1', slotId: unit.ids.slotId, browserProcessId: unit.ids.browserProcessId,
      disposition: 'unsupported', failureClass: 'cleanup', failureCode: 'cleanup-failed', runIds: [],
    })).toThrow(/unsupported failure code/);
    expect(() => ledger.record({
      schemaVersion: 'br03-process-unit-result-v1', slotId: unit.ids.slotId, browserProcessId: unit.ids.browserProcessId,
      disposition: 'unsupported', failureClass: 'unsupported', failureCode: 'scenario-unavailable', runIds: [invocation.processUnits[0]!.runs[0]!.runId],
    })).toThrow(/cannot retain/);
    expect(() => ledger.record({
      schemaVersion: 'br03-process-unit-result-v1', slotId: unit.ids.slotId, browserProcessId: unit.ids.browserProcessId,
      disposition: 'unsupported', failureClass: 'unsupported', failureCode: 'required-metric-producers-unavailable', runIds: [],
    })).toThrow(/must retain/);
    expect(() => ledger.record({
      schemaVersion: 'br03-process-unit-result-v1', slotId: unit.ids.slotId, browserProcessId: unit.ids.browserProcessId,
      disposition: 'aborted', failureClass: 'candidate', failureCode: 'browser-crash', runIds: [],
    })).toThrow(/operator-abort/);
  });

  it('does not accept a valid result that names only part of a warm invocation', () => {
    const plan = buildRunPlanV1(runPlanInputV1());
    const invocation = createRunInvocationV1(plan, { createdUtc: '2026-08-20T12:00:00.000Z', outputRoot: '.benchmark-results', runnerSourceSha: testRunnerSourceShaV1 });
    const unit = plan.core.processUnits.find(({ processContainer }) => processContainer === 'warm-measurement')!;
    const invocationUnit = invocation.processUnits.find(({ slotId }) => slotId === unit.ids.slotId)!;
    const ledger = new ProcessUnitResultLedgerV1(plan, invocation);
    expect(() => ledger.record({
      schemaVersion: 'br03-process-unit-result-v1',
      slotId: unit.ids.slotId,
      browserProcessId: unit.ids.browserProcessId,
      disposition: 'valid',
      failureClass: 'none',
      failureCode: 'none',
      runIds: [invocationUnit.runs[0]!.runId],
    })).toThrow(/every planned invocation run|complete and exact/);
  });

  it('closes only the explicitly selected invocation subset', () => {
    const plan = buildRunPlanV1(runPlanInputV1());
    const unit = plan.core.processUnits[2]!;
    const invocation = createRunInvocationV1(plan, {
      createdUtc: '2026-08-20T12:00:00.000Z',
      outputRoot: '.benchmark-results',
      runnerSourceSha: testRunnerSourceShaV1,
      selectedSlotIds: [unit.ids.slotId],
    });
    const ledger = new ProcessUnitResultLedgerV1(plan, invocation);
    ledger.record({
      schemaVersion: 'br03-process-unit-result-v1',
      slotId: unit.ids.slotId,
      browserProcessId: unit.ids.browserProcessId,
      disposition: 'unsupported',
      failureClass: 'unsupported',
      failureCode: 'scenario-unavailable',
      runIds: [],
    });
    expect(ledger.finalize()).toHaveLength(1);
  });
});

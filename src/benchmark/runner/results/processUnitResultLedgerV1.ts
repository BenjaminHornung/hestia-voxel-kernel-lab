import type { BuiltRunPlanV1, ProcessUnitFailureCodeV1, ProcessUnitResultV1, RunInvocationV1 } from '../contractsV1';

const ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const dispositions = new Set(['valid', 'failed', 'invalid', 'unsupported', 'aborted']);
const failureClasses = new Set(['none', 'provenance', 'infrastructure', 'candidate', 'environment', 'unsupported', 'cleanup']);
const failureCodes = new Set([
  'none', 'source-preflight-rejected', 'build-handoff-rejected', 'scenario-unavailable', 'required-metric-producers-unavailable',
  'backend-parity-producers-unavailable', 'environment-invalid', 'preview-start-failed',
  'preview-health-failed', 'browser-launch-failed', 'browser-crash', 'handoff-failed', 'warmup-not-stable',
  'validation-failed', 'receipt-failed', 'artifact-write-failed', 'cleanup-failed', 'operator-abort', 'timeout',
]);
const unsupportedFailureCodes = new Set(['scenario-unavailable', 'required-metric-producers-unavailable', 'backend-parity-producers-unavailable']);
const invalidFailureCodes = new Set(['source-preflight-rejected', 'build-handoff-rejected', 'environment-invalid', 'warmup-not-stable']);

export function parseProcessUnitResultV1(value: unknown): ProcessUnitResultV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Process-unit result must be an object.');
  const object = value as Record<string, unknown>;
  const keys = ['schemaVersion', 'slotId', 'browserProcessId', 'disposition', 'failureClass', 'failureCode', 'runIds'];
  if (Object.keys(object).length !== keys.length || Object.keys(object).some((key) => !keys.includes(key))) throw new TypeError('Process-unit result has missing or unexpected fields.');
  if (object.schemaVersion !== 'br03-process-unit-result-v1'
    || typeof object.slotId !== 'string' || !ID.test(object.slotId)
    || typeof object.browserProcessId !== 'string' || !ID.test(object.browserProcessId)
    || typeof object.disposition !== 'string' || !dispositions.has(object.disposition)
    || typeof object.failureClass !== 'string' || !failureClasses.has(object.failureClass)
    || typeof object.failureCode !== 'string' || !failureCodes.has(object.failureCode)
    || !Array.isArray(object.runIds) || object.runIds.some((runId) => typeof runId !== 'string' || !ID.test(runId))) {
    throw new TypeError('Process-unit result contains an invalid field value.');
  }
  return object as unknown as ProcessUnitResultV1;
}

export class ProcessUnitResultLedgerV1 {
  readonly #expected: ReadonlyMap<string, { readonly browserProcessId: string; readonly ordinal: number; readonly runIds: ReadonlySet<string> }>;
  readonly #results = new Map<string, ProcessUnitResultV1>();

  public constructor(plan: BuiltRunPlanV1, invocation: RunInvocationV1) {
    const invocationUnits = new Map<string, RunInvocationV1['processUnits'][number]>(invocation.processUnits.map((unit) => [unit.slotId, unit]));
    const planUnits = new Map(plan.core.processUnits.map((unit, ordinal) => [unit.ids.slotId, { unit, ordinal }] as const));
    this.#expected = new Map(invocation.processUnits.map((invocationUnit) => {
      const accepted = planUnits.get(invocationUnit.slotId);
      if (accepted === undefined) throw new TypeError('Run invocation contains a process unit outside the accepted plan.');
      return [accepted.unit.ids.slotId, {
        browserProcessId: accepted.unit.ids.browserProcessId,
        ordinal: accepted.ordinal,
        runIds: new Set(invocationUnit.runs.map(({ runId }) => runId)),
      }] as const;
    }));
    if (invocation.selectedSlotIds.length !== invocation.processUnits.length
      || new Set(invocation.selectedSlotIds).size !== invocation.selectedSlotIds.length
      || invocation.selectedSlotIds.some((slotId) => !invocationUnits.has(slotId))
      || [...this.#expected].some(([slotId, expected]) => expected.runIds.size === 0 || invocationUnits.get(slotId)?.browserProcessId !== expected.browserProcessId)) {
      throw new TypeError('Run invocation does not cover the accepted plan.');
    }
  }

  public record(result: ProcessUnitResultV1): void {
    const expected = this.#expected.get(result.slotId);
    if (expected === undefined || expected.browserProcessId !== result.browserProcessId) {
      throw new TypeError('Process-unit result does not belong to the accepted plan.');
    }
    if (this.#results.has(result.slotId)) throw new TypeError('Process-unit result is already terminal.');
    if (result.runIds.some((runId) => !expected.runIds.has(runId))) throw new TypeError('Process-unit result contains a run ID outside its invocation slot.');
    const successful = result.disposition === 'valid';
    const expectedRunIds = [...expected.runIds];
    const actualRunIds = [...result.runIds].sort();
    const sortedExpectedRunIds = expectedRunIds.sort();
    const exactRunBinding = actualRunIds.length === sortedExpectedRunIds.length
      && actualRunIds.every((runId, index) => runId === sortedExpectedRunIds[index]);
    if ((successful && (result.failureClass !== 'none' || result.failureCode !== 'none' || result.runIds.length === 0))
      || (!successful && (result.failureClass === 'none' || result.failureCode === 'none'))) {
      throw new TypeError('Process-unit disposition and failure taxonomy disagree.');
    }
    if (result.disposition === 'unsupported' && !unsupportedFailureCodes.has(result.failureCode)) {
      throw new TypeError('Unsupported process-unit results require an unsupported failure code.');
    }
    if (result.disposition === 'unsupported' && result.failureCode === 'scenario-unavailable' && result.runIds.length !== 0) {
      throw new TypeError('Scenario-unavailable results cannot retain completed run IDs.');
    }
    if (result.disposition === 'unsupported' && (result.failureCode === 'required-metric-producers-unavailable' || result.failureCode === 'backend-parity-producers-unavailable') && result.runIds.length === 0) {
      throw new TypeError('Producer-unavailable results must retain the completed run ID.');
    }
    if (result.disposition === 'invalid' && !invalidFailureCodes.has(result.failureCode)) {
      throw new TypeError('Invalid process-unit results require a provenance, environment, or warmup failure code.');
    }
    if (result.disposition === 'aborted' && result.failureCode !== 'operator-abort') {
      throw new TypeError('Aborted process-unit results require the operator-abort failure code.');
    }
    if (result.disposition === 'failed' && (unsupportedFailureCodes.has(result.failureCode) || invalidFailureCodes.has(result.failureCode) || result.failureCode === 'operator-abort')) {
      throw new TypeError('Failed process-unit results contain a failure code for another disposition.');
    }
    if (result.disposition !== 'valid' && result.runIds.length > 0 && result.disposition !== 'unsupported') {
      throw new TypeError('Only unsupported results may retain completed run IDs.');
    }
    if (successful && !exactRunBinding) throw new TypeError('Valid process-unit results must bind every planned invocation run exactly once.');
    if (result.runIds.length > 0 && !exactRunBinding) throw new TypeError('Process-unit result run binding must be complete and exact.');
    const expectedClass = failureClassForCode(result.failureCode);
    if (result.failureClass !== expectedClass) throw new TypeError('Process-unit failure class does not match its failure code.');
    if (new Set(result.runIds).size !== result.runIds.length) throw new TypeError('Process-unit run IDs must be unique.');
    this.#results.set(result.slotId, result);
  }

  public finalize(): readonly ProcessUnitResultV1[] {
    if (this.#results.size !== this.#expected.size) {
      const missing = [...this.#expected.keys()].filter((slotId) => !this.#results.has(slotId));
      throw new Error(`Process-unit ledger is incomplete: ${missing.length} slot(s) have no terminal result.`);
    }
    return [...this.#results.values()].sort((left, right) =>
      this.#expected.get(left.slotId)!.ordinal - this.#expected.get(right.slotId)!.ordinal);
  }
}

function failureClassForCode(code: ProcessUnitFailureCodeV1): ProcessUnitResultV1['failureClass'] {
  if (code === 'none') return 'none';
  if (code === 'source-preflight-rejected' || code === 'build-handoff-rejected') return 'provenance';
  if (code === 'scenario-unavailable' || code === 'required-metric-producers-unavailable' || code === 'backend-parity-producers-unavailable') return 'unsupported';
  if (code === 'environment-invalid') return 'environment';
  if (code === 'browser-crash' || code === 'handoff-failed' || code === 'warmup-not-stable' || code === 'validation-failed' || code === 'receipt-failed' || code === 'operator-abort') return 'candidate';
  if (code === 'cleanup-failed') return 'cleanup';
  return 'infrastructure';
}

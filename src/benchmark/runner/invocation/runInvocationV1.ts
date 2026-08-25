import { BENCHMARK_WARMUP_RULE_V1, type CanonicalIdV1 } from '../../contracts';
import { canonicalizeJsonV1 } from '../../provenance';
import type { Sha256DigestV1 } from '../../contracts';
import type {
  BuiltRunPlanV1,
  PlannedInvocationRunV1,
  RunInvocationRerunOriginV1,
  RunInvocationV1,
  RunPlanProcessUnitV1,
} from '../contractsV1';
import {
  deriveInvocationIterationIdV1,
  deriveInvocationRunIdV1,
  hashCanonicalV1,
  idFromDigestV1,
} from '../ids/orchestrationIdsV1';

const CANONICAL_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/;

export interface CreateRunInvocationOptionsV1 {
  readonly createdUtc: string;
  readonly outputRoot: string;
  readonly attempt?: number;
  readonly rerunOrigin?: RunInvocationRerunOriginV1;
  readonly predecessorInvocation?: RunInvocationV1;
  readonly selectedSlotIds?: readonly CanonicalIdV1[];
  readonly runnerSourceSha: Sha256DigestV1;
}

function assertInvocationOptions(options: CreateRunInvocationOptionsV1): void {
  const attempt = options.attempt ?? 0;
  if (!Number.isSafeInteger(attempt) || attempt < 0) throw new RangeError('Invocation attempt must be a non-negative safe integer.');
  const createdDate = new Date(options.createdUtc);
  if (!Number.isFinite(createdDate.getTime()) || createdDate.toISOString() !== options.createdUtc) throw new TypeError('createdUtc must be a canonical UTC timestamp.');
  if (options.outputRoot.length === 0 || options.outputRoot.includes('\0')) throw new TypeError('outputRoot must be non-empty.');
  if (!SHA256_DIGEST.test(options.runnerSourceSha) || /^sha256:0{64}$/.test(options.runnerSourceSha)) throw new TypeError('runnerSourceSha must identify a non-empty runner executable.');
  if (attempt === 0 && options.rerunOrigin !== undefined) throw new TypeError('Initial invocations cannot declare rerun metadata.');
  if (attempt === 0 && options.predecessorInvocation !== undefined) throw new TypeError('Initial invocations cannot declare a predecessor.');
  if (attempt > 0 && (options.rerunOrigin === undefined || options.predecessorInvocation === undefined)) {
    throw new TypeError('Reruns require explicit approval metadata and an existing predecessor invocation.');
  }
  if (options.rerunOrigin !== undefined
    && (!CANONICAL_ID.test(options.rerunOrigin.approvalId) || !CANONICAL_ID.test(options.rerunOrigin.replacesInvocationId))) {
    throw new TypeError('Rerun approval IDs must be canonical IDs.');
  }
}

function runShapes(unit: RunPlanProcessUnitV1): readonly { readonly phase: PlannedInvocationRunV1['phase']; readonly iterations: number }[] {
  if (unit.processContainer === 'warm-measurement') return [];
  return [{ phase: unit.processContainer, iterations: unit.measurementIterations }];
}

function sameIds(left: readonly CanonicalIdV1[], right: readonly CanonicalIdV1[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function assertRerunLineage(
  plan: BuiltRunPlanV1,
  attempt: number,
  selectedSlotIds: readonly CanonicalIdV1[],
  options: CreateRunInvocationOptionsV1,
): void {
  if (attempt === 0) return;
  const predecessor = options.predecessorInvocation!;
  const origin = options.rerunOrigin!;
  if (predecessor.invocationId !== origin.replacesInvocationId
    || predecessor.runPlanId !== plan.runPlanId
    || predecessor.runPlanSha256 !== plan.runPlanSha256
    || predecessor.attempt !== attempt - 1
    || !sameIds(predecessor.selectedSlotIds, selectedSlotIds)) {
    throw new TypeError('Rerun predecessor must bind the same plan and selected slots at the exact prior attempt.');
  }
}

export function createRunInvocationV1(
  plan: BuiltRunPlanV1,
  options: CreateRunInvocationOptionsV1,
): RunInvocationV1 {
  assertInvocationOptions(options);
  const attempt = options.attempt ?? 0;
  const rerunOrigin = options.rerunOrigin ?? null;
  const runnerSourceSha = options.runnerSourceSha;
  const selectedSlotIds = options.selectedSlotIds ?? plan.core.processUnits.map(({ ids }) => ids.slotId);
  if (selectedSlotIds.length === 0 || new Set(selectedSlotIds).size !== selectedSlotIds.length
    || selectedSlotIds.some((slotId) => !CANONICAL_ID.test(slotId)
      || !plan.core.processUnits.some(({ ids }) => ids.slotId === slotId))) {
    throw new TypeError('Invocation selection must contain unique accepted process-unit slot IDs.');
  }
  const selected = new Set(selectedSlotIds);
  const selectedUnits = plan.core.processUnits.filter(({ ids }) => selected.has(ids.slotId));
  const canonicalSelectedSlotIds = selectedUnits.map(({ ids }) => ids.slotId);
  assertRerunLineage(plan, attempt, canonicalSelectedSlotIds, options);
  const invocationId = idFromDigestV1('br03-invocation-', hashCanonicalV1('br03/invocation/v1', attempt === 0
    ? { attempt, selectedSlotIds: canonicalSelectedSlotIds, runPlanSha256: plan.runPlanSha256 }
    : {
      approvalId: rerunOrigin!.approvalId,
      attempt,
      replacesInvocationId: rerunOrigin!.replacesInvocationId,
      selectedSlotIds: canonicalSelectedSlotIds,
      runPlanSha256: plan.runPlanSha256,
    }));
  const runIds = new Set<string>();
  const iterationIds = new Set<string>();
  const processUnits = selectedUnits.map((unit) => {
    const predecessorUnit = options.predecessorInvocation?.processUnits.find(({ slotId }) => slotId === unit.ids.slotId);
    return {
      slotId: unit.ids.slotId,
      browserProcessId: unit.ids.browserProcessId,
      adaptiveWarmup: unit.processContainer === 'warm-measurement' ? {
        schemaVersion: 'br03-adaptive-warmup-schedule-v1' as const,
        maximumWarmupRuns: BENCHMARK_WARMUP_RULE_V1.maximumWarmupIterations,
        measurementIterations: unit.measurementIterations,
      } : null,
      runs: runShapes(unit).map(({ phase, iterations }, runOrdinal) => {
      const runId = deriveInvocationRunIdV1(invocationId, plan.runPlanSha256, unit.ids.slotId, runOrdinal, attempt);
      if (runIds.has(runId)) throw new Error('Digest collision in invocation run IDs.');
      runIds.add(runId);
      const plannedIterationIds = Array.from({ length: iterations }, (_, iterationOrdinal) => {
        const iterationId = deriveInvocationIterationIdV1(runId, iterationOrdinal);
        if (iterationIds.has(iterationId)) throw new Error('Digest collision in invocation iteration IDs.');
        iterationIds.add(iterationId);
        return iterationId;
      });
        const previousRun = predecessorUnit?.runs.find((run) => run.runOrdinal === runOrdinal && run.phase === phase);
        if (attempt > 0 && previousRun === undefined) throw new TypeError('Rerun predecessor is missing the replaced planned run.');
        return {
          runOrdinal,
          runId,
          phase,
          iterationIds: plannedIterationIds,
          origin: previousRun === undefined ? { kind: 'planned' as const } : {
            kind: 'infrastructure-rerun' as const,
            replacesRunId: previousRun.runId,
            approvalId: rerunOrigin!.approvalId,
            reason: 'infrastructure-failure' as const,
          },
        };
      }),
    };
  });
  return {
    schemaVersion: 'br03-run-invocation-v1',
    invocationId,
    runPlanId: plan.runPlanId,
    runPlanSha256: plan.runPlanSha256,
    runnerSourceSha,
    createdUtc: options.createdUtc,
    outputRoot: options.outputRoot,
    attempt,
    rerunOrigin,
    selectedSlotIds: canonicalSelectedSlotIds,
    processUnits,
  };
}

export function verifyRunInvocationV1(
  plan: BuiltRunPlanV1,
  invocation: RunInvocationV1,
  runnerSourceSha: Sha256DigestV1,
  predecessorInvocation?: RunInvocationV1,
): readonly string[] {
  if (invocation.runnerSourceSha !== runnerSourceSha) return ['Invocation runner source digest does not match the executing runner.'];
  let expected: RunInvocationV1;
  try {
    expected = createRunInvocationV1(plan, {
      createdUtc: invocation.createdUtc,
      outputRoot: invocation.outputRoot,
      attempt: invocation.attempt,
      rerunOrigin: invocation.rerunOrigin ?? undefined,
      predecessorInvocation,
      selectedSlotIds: invocation.selectedSlotIds,
      runnerSourceSha,
    });
  } catch (error) {
    return [error instanceof Error ? error.message : 'Invocation verification failed.'];
  }
  const actualBytes = canonicalizeJsonV1(invocation);
  const expectedBytes = canonicalizeJsonV1(expected);
  return actualBytes.byteLength === expectedBytes.byteLength
    && actualBytes.every((byte, index) => byte === expectedBytes[index])
    ? []
    : ['Invocation does not match its accepted plan and runtime metadata.'];
}

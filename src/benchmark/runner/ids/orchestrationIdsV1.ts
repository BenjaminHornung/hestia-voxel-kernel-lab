import {
  BENCHMARK_ID_OWNERSHIP,
  type BenchmarkOrchestrationIdsV1,
  type CanonicalIdV1,
  type GitShaV1,
  type SafePositiveIntegerV1,
  type Sha256DigestV1,
} from '../../contracts';
import { canonicalizeJsonV1, sha256BytesV1 } from '../../provenance';

export type HashCanonicalV1 = (domain: string, value: unknown) => Sha256DigestV1;

export const hashCanonicalV1: HashCanonicalV1 = (domain, value) =>
  sha256BytesV1(canonicalizeJsonV1({ domain, value }));

export function idFromDigestV1(prefix: string, digest: Sha256DigestV1): CanonicalIdV1 {
  return `${prefix}${digest.slice('sha256:'.length)}` as CanonicalIdV1;
}

export function deriveHardwareCellIdV1(input: {
  readonly candidateId: CanonicalIdV1;
  readonly hardwareProfileId: CanonicalIdV1;
  readonly hardwareBindingSha256: Sha256DigestV1;
  readonly fixtureContractId: CanonicalIdV1;
  readonly fixtureSemanticSha256: Sha256DigestV1;
  readonly expectedSourceCommitSha: GitShaV1;
  readonly expectedBuildSha256: Sha256DigestV1;
  readonly scenarioId: CanonicalIdV1;
}, hash: HashCanonicalV1 = hashCanonicalV1): CanonicalIdV1 {
  return idFromDigestV1('br03-hardware-', hash('br03/hardware-cell/v1', input));
}

export interface OrchestrationIdInputV1 {
  readonly slot: unknown;
  readonly browserProcess: unknown;
  readonly bootstrapCluster: unknown;
  readonly pairCell: unknown;
  readonly pairOrdinal: number;
}

export function createOrchestrationIdsV1(
  input: OrchestrationIdInputV1,
  hash: HashCanonicalV1 = hashCanonicalV1,
): BenchmarkOrchestrationIdsV1 {
  if (!Number.isSafeInteger(input.pairOrdinal) || input.pairOrdinal < 1) {
    throw new RangeError('pairOrdinal must be a positive safe integer.');
  }
  return {
    slotId: idFromDigestV1('br03-slot-', hash('br03/slot/v1', input.slot)),
    browserProcessId: idFromDigestV1('br03-process-', hash('br03/browser-process/v1', input.browserProcess)),
    bootstrapClusterId: idFromDigestV1('br03-cluster-', hash('br03/bootstrap-cluster/v1', input.bootstrapCluster)),
    pairCellId: idFromDigestV1('br03-pair-', hash('br03/pair-cell/v1', input.pairCell)),
    pairOrdinal: input.pairOrdinal as SafePositiveIntegerV1,
    ownership: BENCHMARK_ID_OWNERSHIP,
  };
}

export function deriveInvocationRunIdV1(
  invocationId: CanonicalIdV1,
  runPlanSha256: Sha256DigestV1,
  slotId: CanonicalIdV1,
  runOrdinal: number,
  attempt: number,
  hash: HashCanonicalV1 = hashCanonicalV1,
): CanonicalIdV1 {
  if (![runOrdinal, attempt].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new RangeError('Run ordinal and attempt must be non-negative safe integers.');
  }
  return idFromDigestV1('br03-run-', hash('br03/invocation-run/v1', {
    attempt,
    invocationId,
    runOrdinal,
    runPlanSha256,
    slotId,
  }));
}

export function deriveInvocationIterationIdV1(
  runId: CanonicalIdV1,
  iterationOrdinal: number,
  hash: HashCanonicalV1 = hashCanonicalV1,
): CanonicalIdV1 {
  if (!Number.isSafeInteger(iterationOrdinal) || iterationOrdinal < 0) {
    throw new RangeError('Iteration ordinal must be a non-negative safe integer.');
  }
  return idFromDigestV1('br03-iteration-', hash('br03/invocation-iteration/v1', {
    iterationOrdinal,
    runId,
  }));
}

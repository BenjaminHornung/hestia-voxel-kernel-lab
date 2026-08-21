import type {
  BenchmarkOrchestrationIdsV1,
  BenchmarkProcessContainerV1,
  BenchmarkSamplePhaseV1,
  BenchmarkScenarioIdV1,
  BenchmarkScenarioParameterV1,
  CanonicalIdV1,
  GitShaV1,
  Sha256DigestV1,
  UInt32V1,
} from '../contracts';

export interface RunPlanCandidateV1 {
  readonly id: CanonicalIdV1;
  readonly sourceFileSetSha256: Sha256DigestV1;
}

export interface RunPlanScenarioV1 {
  readonly id: BenchmarkScenarioIdV1;
  readonly parameters: readonly BenchmarkScenarioParameterV1[];
}

export interface RunPlanProcessRequirementV1 {
  readonly enabled: boolean;
  readonly minimumProcessesPerCandidate: number;
}

export interface RunPlanWarmMeasurementRequirementV1 extends RunPlanProcessRequirementV1 {
  readonly measurementIterationsPerProcess: number;
}

export interface RunPlanPhaseRequirementsV1 {
  readonly cold: RunPlanProcessRequirementV1;
  readonly warmMeasurement: RunPlanWarmMeasurementRequirementV1;
  readonly stress: RunPlanProcessRequirementV1;
  readonly trace: RunPlanProcessRequirementV1;
  readonly leak: RunPlanProcessRequirementV1;
}

export interface RunPlanInputV1 {
  readonly expectedSourceCommitSha: GitShaV1;
  readonly expectedBuildSha256: Sha256DigestV1;
  readonly fixtureContractId: CanonicalIdV1;
  readonly fixtureSemanticSha256: Sha256DigestV1;
  readonly hardwareProfileId: CanonicalIdV1;
  readonly hardwareBindingSha256: Sha256DigestV1;
  readonly syntheticHardwareProfile: boolean;
  readonly browser: {
    readonly requestedChannel: string;
    readonly headless: boolean;
    readonly requestedArgs: readonly string[];
  };
  readonly orderSeed: number;
  readonly candidates: readonly RunPlanCandidateV1[];
  readonly scenarios: readonly RunPlanScenarioV1[];
  readonly phases: RunPlanPhaseRequirementsV1;
  readonly retryPolicy: 'none';
}

export interface BalanceRowV1 {
  readonly rowOrdinal: number;
  readonly scheme: 'abba' | 'baab' | 'latin-square';
  readonly candidateIds: readonly CanonicalIdV1[];
}

export interface RunPlanBalanceBlockV1 {
  readonly blockId: CanonicalIdV1;
  readonly processContainer: BenchmarkProcessContainerV1;
  readonly scenarioId: BenchmarkScenarioIdV1;
  readonly repetitionOrdinal: number;
  readonly rows: readonly BalanceRowV1[];
}

export interface RunPlanProcessUnitV1 {
  readonly processOrdinal: number;
  readonly processContainer: BenchmarkProcessContainerV1;
  readonly scenarioId: BenchmarkScenarioIdV1;
  readonly scenarioParameters: readonly BenchmarkScenarioParameterV1[];
  readonly candidateId: CanonicalIdV1;
  readonly balanceBlockId: CanonicalIdV1;
  readonly rowOrdinal: number;
  readonly sequencePosition: number;
  readonly measurementIterations: number;
  readonly measurementEligible: false;
  readonly freshBrowserProcess: true;
  readonly freshProfile: true;
  readonly ids: BenchmarkOrchestrationIdsV1;
}

export interface RunPlanCoreV1 {
  readonly schemaVersion: 'br03-run-plan-core-v1';
  readonly expectedSourceCommitSha: GitShaV1;
  readonly expectedBuildSha256: Sha256DigestV1;
  readonly fixtureContractId: CanonicalIdV1;
  readonly fixtureSemanticSha256: Sha256DigestV1;
  readonly hardwareProfileId: CanonicalIdV1;
  readonly hardwareBindingSha256: Sha256DigestV1;
  readonly syntheticHardwareProfile: boolean;
  readonly browser: {
    readonly requestedChannel: string;
    readonly headless: boolean;
    readonly requestedArgs: readonly string[];
  };
  readonly orderSeed: UInt32V1;
  readonly candidates: readonly RunPlanCandidateV1[];
  readonly scenarios: readonly RunPlanScenarioV1[];
  readonly phases: RunPlanPhaseRequirementsV1;
  readonly balanceBlocks: readonly RunPlanBalanceBlockV1[];
  readonly processUnits: readonly RunPlanProcessUnitV1[];
  readonly retryPolicy: 'none';
}

export interface BuiltRunPlanV1 {
  readonly core: RunPlanCoreV1;
  readonly canonicalBytes: Uint8Array;
  readonly runPlanSha256: Sha256DigestV1;
  readonly runPlanId: CanonicalIdV1;
}

export interface PlannedInvocationRunV1 {
  readonly runOrdinal: number;
  readonly runId: CanonicalIdV1;
  readonly phase: BenchmarkSamplePhaseV1;
  readonly iterationIds: readonly CanonicalIdV1[];
}

export interface RunInvocationProcessUnitV1 {
  readonly slotId: CanonicalIdV1;
  readonly browserProcessId: CanonicalIdV1;
  readonly runs: readonly PlannedInvocationRunV1[];
}

export type RunInvocationRerunOriginV1 = {
  readonly reason: 'infrastructure-failure';
  readonly replacesInvocationId: CanonicalIdV1;
  readonly approvalId: CanonicalIdV1;
};

export interface RunInvocationV1 {
  readonly schemaVersion: 'br03-run-invocation-v1';
  readonly invocationId: CanonicalIdV1;
  readonly runPlanId: CanonicalIdV1;
  readonly runPlanSha256: Sha256DigestV1;
  readonly runnerSourceSha: Sha256DigestV1;
  readonly createdUtc: string;
  readonly outputRoot: string;
  readonly attempt: number;
  readonly rerunOrigin: RunInvocationRerunOriginV1 | null;
  readonly selectedSlotIds: readonly CanonicalIdV1[];
  readonly processUnits: readonly RunInvocationProcessUnitV1[];
}

export type ProcessUnitDispositionV1 = 'valid' | 'failed' | 'invalid' | 'unsupported' | 'aborted';
export type ProcessUnitFailureClassV1 = 'none' | 'provenance' | 'infrastructure' | 'candidate' | 'environment' | 'unsupported' | 'cleanup';
export type ProcessUnitFailureCodeV1 =
  | 'none'
   | 'source-preflight-rejected'
   | 'build-handoff-rejected'
   | 'scenario-unavailable'
   | 'required-metric-producers-unavailable'
   | 'backend-parity-producers-unavailable'
   | 'environment-invalid'
  | 'preview-start-failed'
  | 'preview-health-failed'
  | 'browser-launch-failed'
  | 'browser-crash'
  | 'handoff-failed'
  | 'warmup-not-stable'
  | 'validation-failed'
  | 'receipt-failed'
  | 'artifact-write-failed'
  | 'cleanup-failed'
  | 'operator-abort'
   | 'timeout';

export class RunnerFailureErrorV1 extends Error {
  public constructor(public readonly failureCode: ProcessUnitFailureCodeV1, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RunnerFailureErrorV1';
  }
}

export interface ProcessUnitResultV1 {
  readonly schemaVersion: 'br03-process-unit-result-v1';
  readonly slotId: CanonicalIdV1;
  readonly browserProcessId: CanonicalIdV1;
  readonly disposition: ProcessUnitDispositionV1;
  readonly failureClass: ProcessUnitFailureClassV1;
  readonly failureCode: ProcessUnitFailureCodeV1;
  readonly runIds: readonly CanonicalIdV1[];
}

export interface PopulationClassificationV1 {
  readonly technicallyAggregable: boolean;
  readonly standardProcessFloor: boolean;
  readonly standardMeasurementCell: boolean;
}

export interface ScenarioDriverDefinitionV1 {
  readonly scenarioId: BenchmarkScenarioIdV1;
  readonly status: 'lifecycle-smoke-only' | 'unavailable';
  readonly reasonCode: CanonicalIdV1;
  readonly measurementEligible: false;
  readonly route: (parameters: readonly BenchmarkScenarioParameterV1[]) => string | null;
}

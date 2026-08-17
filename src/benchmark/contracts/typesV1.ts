import {
  BENCHMARK_DIGEST_DOMAINS,
  BENCHMARK_ID_OWNERSHIP,
  BENCHMARK_PROTOCOL_VERSION,
  BENCHMARK_REPOSITORY_URL,
  BENCHMARK_SCHEMA_VERSIONS,
  BENCHMARK_STATUS_COMMAND,
  BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_ID_V1,
  BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_VERSION_V1,
  EMPTY_STATUS_SHA256,
} from './versions';
import type { BenchmarkProtocolVersion } from './versions';

declare const benchmarkBrand: unique symbol;

export type Branded<T, Name extends string> = T & { readonly [benchmarkBrand]: Name };
export type NonEmptyString = Branded<string, 'NonEmptyString'>;
export type CanonicalIdV1 = Branded<string, 'CanonicalIdV1'>;
export type CanonicalId = CanonicalIdV1;
export type CanonicalMetricRefV1 = Branded<string, 'CanonicalMetricRefV1'>;
export type RepositoryRelativePathV1 = Branded<string, 'RepositoryRelativePathV1'>;
export type BundleRelativePathV1 = Branded<string, 'BundleRelativePathV1'>;
export type BuildRelativePathV1 = Branded<string, 'BuildRelativePathV1'>;
/** @deprecated Use the owner-specific path types. This alias retains bundle ownership. */
export type CanonicalRelativePathV1 = BundleRelativePathV1;
/** @deprecated Use BundleRelativePathV1. */
export type CanonicalRelativePath = BundleRelativePathV1;
export type Sha256DigestV1 = Branded<`sha256:${string}`, 'Sha256DigestV1'>;
export type Sha256Digest = Sha256DigestV1;
export type GitShaV1 = Branded<string, 'GitShaV1'>;
export type GitSha1 = GitShaV1;
export type UtcTimestampMsV1 = Branded<string, 'UtcTimestampMsV1'>;
export type UtcTimestampMs = UtcTimestampMsV1;
export type UInt32V1 = Branded<number, 'UInt32V1'>;
export type UInt32 = UInt32V1;
export type SafePositiveIntegerV1 = Branded<number, 'SafePositiveIntegerV1'>;
export type SafePositiveInteger = SafePositiveIntegerV1;
export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

export type BenchmarkScenarioIdV1 =
  | 'mesh-golden-world-v1'
  | 'mesh-density-sweep-v1'
  | 'scheduler-steady-v1'
  | 'scheduler-burst-v1'
  | 'brush-stress-v1'
  | 'navigation-leak-v1'
  | 'backend-fixture-v1';

export type BenchmarkProcessContainerV1 =
  | 'cold'
  | 'warm-measurement'
  | 'stress'
  | 'trace'
  | 'leak';

export type BenchmarkSamplePhaseV1 =
  | 'cold'
  | 'warmup'
  | 'measurement'
  | 'stress'
  | 'trace'
  | 'leak';

export type BenchmarkExecutionPhaseV1 = BenchmarkSamplePhaseV1;

export type AvailabilityStatusV1 =
  | 'observed'
  | 'declared'
  | 'unknown'
  | 'unsupported'
  | 'not-requested'
  | 'not-active'
  | 'permission-denied'
  | 'blocked'
  | 'error';

export type AvailabilityObservedStabilityV1 =
  | 'stable'
  | 'experimental'
  | 'platform-specific';
export type AvailabilityDeclaredStabilityV1 =
  | 'owner-binding'
  | 'run-config'
  | 'browser-default';

export type AvailabilityV1<T> =
  | {
      readonly status: 'observed';
      readonly value: T;
      readonly sourceRef: CanonicalIdV1;
      readonly stability: AvailabilityObservedStabilityV1;
    }
  | {
      readonly status: 'declared';
      readonly value: T;
      readonly sourceRef: CanonicalIdV1;
      readonly stability: AvailabilityDeclaredStabilityV1;
    }
  | {
      readonly status: Exclude<AvailabilityStatusV1, 'observed' | 'declared'>;
      readonly value: null;
      readonly sourceRef: CanonicalIdV1;
      readonly reasonCode: CanonicalIdV1;
    };

export type CapabilityAvailabilityV1 = AvailabilityV1<true>;

export type BenchmarkInvalidReason =
  | 'source-dirty'
  | 'source-sha-mismatch'
  | 'source-tree-mismatch'
  | 'build-digest-mismatch'
  | 'fixture-contract-mismatch'
  | 'candidate-contract-mismatch'
  | 'scenario-contract-mismatch'
  | 'run-plan-mismatch'
  | 'environment-incomplete'
  | 'browser-version-mismatch'
  | 'required-capability-missing'
  | 'document-hidden'
  | 'document-unfocused'
  | 'background-tabs-present'
  | 'power-state-mismatch'
  | 'thermal-throttling'
  | 'clock-invalid'
  | 'sample-invalid'
  | 'gpu-disjoint'
  | 'context-lost'
  | 'console-error'
  | 'page-error'
  | 'request-failure'
  | 'http-error'
  | 'process-crash'
  | 'operator-abort'
  | 'metric-not-producible'
  | 'warmup-not-stable'
  | 'infrastructure-failure';

export interface BenchmarkInvalidReasonV1 {
  readonly code: BenchmarkInvalidReason;
  readonly detail: NonEmptyString;
  readonly phase: BenchmarkSamplePhaseV1;
}

export interface BenchmarkBuildBindingV1 {
  readonly algorithmVersion: 'hestia-benchmark-build-sha256-v1';
  readonly rootPath: 'dist';
  readonly sha256: Sha256DigestV1;
  readonly fileCount: SafePositiveIntegerV1;
  readonly totalBytes: SafePositiveIntegerV1;
}

/** Node preflight may add resolved filesystem identity beside this node-neutral expectation. */
export interface BenchmarkBuildHandoffMetadataV1 {
  readonly expected: BenchmarkBuildBindingV1;
}

export interface BenchmarkFixtureContractBindingV1 {
  readonly id: CanonicalIdV1;
  readonly version: SafePositiveIntegerV1;
  readonly semanticSha256: AvailabilityV1<Sha256DigestV1>;
  readonly sourceFileSetSha256: AvailabilityV1<Sha256DigestV1>;
  readonly sourcePaths: AvailabilityV1<NonEmptyReadonlyArray<RepositoryRelativePathV1>>;
}

export interface BenchmarkCandidateBindingV1 {
  readonly id: CanonicalIdV1;
  readonly version: SafePositiveIntegerV1;
  readonly sourceFileSetSha256: AvailabilityV1<Sha256DigestV1>;
  readonly sourcePaths: AvailabilityV1<NonEmptyReadonlyArray<RepositoryRelativePathV1>>;
}

export interface BenchmarkSourceProvenanceV1 {
  readonly schemaVersion: 'benchmark-source-provenance-v1';
  readonly repositoryUrl: typeof BENCHMARK_REPOSITORY_URL;
  readonly commitSha: GitShaV1;
  readonly commitTreeSha: GitShaV1;
  readonly worktree: {
    readonly state: 'clean';
    readonly statusCommand: typeof BENCHMARK_STATUS_COMMAND;
    readonly statusOutputSha256: typeof EMPTY_STATUS_SHA256;
    readonly submodules: readonly [];
  };
  readonly build: BenchmarkBuildBindingV1;
  readonly fixture: BenchmarkFixtureContractBindingV1;
  readonly candidate: BenchmarkCandidateBindingV1;
}

export type BenchmarkSourcePreflightFailureCodeV1 = Extract<
  BenchmarkInvalidReason,
  | 'source-dirty'
  | 'source-sha-mismatch'
  | 'source-tree-mismatch'
  | 'build-digest-mismatch'
  | 'fixture-contract-mismatch'
  | 'candidate-contract-mismatch'
  | 'infrastructure-failure'
>;

export type BenchmarkSourcePreflightResultV1 =
  | { readonly status: 'accepted'; readonly provenance: BenchmarkSourceProvenanceV1; readonly buildHandoff: BenchmarkBuildHandoffMetadataV1 }
  | {
      readonly status: 'rejected';
      readonly code: BenchmarkSourcePreflightFailureCodeV1;
      readonly detail: NonEmptyString;
    };

export type BenchmarkBackendV1 = 'three-webgl2' | 'raw-webgpu';
export type BenchmarkBackendCellV1 = BenchmarkBackendV1 | 'not-applicable';
export type BenchmarkMesherV1 = 'visible' | 'greedy' | 'greedy-ao' | 'not-applicable';

export type BenchmarkScenarioParameterV1 =
  | { readonly key: 'seed'; readonly value: UInt32V1 }
  | { readonly key: 'backend'; readonly value: BenchmarkBackendV1 }
  | { readonly key: 'mesher'; readonly value: BenchmarkMesherV1 }
  | { readonly key: 'chunk-edge'; readonly value: 32 | 64 }
  | { readonly key: 'worker-count'; readonly value: number }
  | { readonly key: 'duration-ms'; readonly value: number }
  | { readonly key: 'edit-interval-ms'; readonly value: number }
  | { readonly key: 'burst-size'; readonly value: number }
  | { readonly key: 'burst-interval-ms'; readonly value: number }
  | { readonly key: 'edit-count'; readonly value: 100 | 1_000 }
  | {
      readonly key: 'density-case';
      readonly value:
        | 'empty'
        | 'one-percent'
        | 'ten-percent'
        | 'fifty-percent'
        | 'ninety-percent'
        | 'full'
        | 'checkerboard';
    }
  | { readonly key: 'stabilization-cycles'; readonly value: 20 }
  | { readonly key: 'measurement-cycles'; readonly value: 100 }
  | { readonly key: 'camera-contract-sha256'; readonly value: Sha256DigestV1 }
  | { readonly key: 'feature-contract-sha256'; readonly value: Sha256DigestV1 }
  | { readonly key: 'command-stream-sha256'; readonly value: Sha256DigestV1 };

export type BenchmarkScenarioParameterDomainV1 =
  | { readonly kind: 'uint32' }
  | { readonly kind: 'safe-integer-range'; readonly minimum: number; readonly maximum: number }
  | { readonly kind: 'enum'; readonly values: NonEmptyReadonlyArray<string | number> }
  | { readonly kind: 'sha256' };

export interface BenchmarkScenarioParameterContractV1 {
  readonly key: BenchmarkScenarioParameterV1['key'];
  readonly required: true;
  readonly domain: BenchmarkScenarioParameterDomainV1;
}

export interface BenchmarkScenarioCapabilityContractV1 {
  readonly id: CanonicalIdV1;
  readonly requirement: 'must-support' | 'must-declare';
}

export type BenchmarkSampleKindV1 =
  | 'duration'
  | 'counter'
  | 'memory'
  | 'frame'
  | 'long-task'
  | 'gpu'
  | 'liveness';

export type BenchmarkSampleUnitV1 =
  | 'ms'
  | 'bytes'
  | 'count'
  | 'ratio'
  | 'revision'
  | 'hertz'
  | 'percent';

export interface BenchmarkScenarioMetricContractV1 {
  readonly metricRef: CanonicalMetricRefV1;
  readonly kind: BenchmarkSampleKindV1;
  readonly unit: BenchmarkSampleUnitV1;
  readonly dimensions?: readonly BenchmarkSampleDimensionV1[];
  readonly requirement:
    | { readonly kind: 'required' }
     | { readonly kind: 'when-capability-supported'; readonly capabilityId: CanonicalIdV1 };
}

export type BenchmarkMetricDimensionDomainV1 =
  | { readonly kind: 'canonical-id' }
  | { readonly kind: 'non-negative-safe-integer' }
  | { readonly kind: 'sha256' };

export interface BenchmarkMetricDimensionContractV1 {
  readonly key: CanonicalIdV1;
  readonly domain: BenchmarkMetricDimensionDomainV1;
}

export type BenchmarkWarmupAlgorithmV1 = 'median-last-5-vs-preceding-5-relative-deviation-v1';

export interface BenchmarkWarmupRuleV1 {
  readonly id: CanonicalIdV1;
  readonly version: 1;
  readonly algorithm: BenchmarkWarmupAlgorithmV1;
  readonly windowSize: 5;
  readonly maximumRelativeDeviation: 0.05;
  readonly consecutiveStableComparisons: 2;
  readonly minimumWarmupIterations: 10;
  readonly maximumWarmupIterations: 50;
}

export interface BenchmarkScenarioWarmupControlV1 {
  readonly metricRef: CanonicalMetricRefV1;
  readonly rule: BenchmarkWarmupRuleV1;
}

export type BenchmarkMetricProducibilityReasonV1 =
  | 'phase-not-allowed'
  | 'container-not-allowed'
  | 'producer-unavailable'
  | 'diagnostic-only'
  | 'capability-bound';

export interface BenchmarkMetricProducibilityCellV1 {
  readonly scenarioId: BenchmarkScenarioIdV1;
  readonly phase: BenchmarkSamplePhaseV1;
  readonly backend: BenchmarkBackendCellV1;
  readonly metricRef: CanonicalMetricRefV1;
  readonly scenarioMetricContractOrdinal: number;
}

export type BenchmarkMetricProducibilityEntryV1 = BenchmarkMetricProducibilityCellV1 & (
  | {
      readonly classification: 'emit-sample';
      readonly producer: {
        readonly recordName: CanonicalIdV1;
        readonly metricRef: CanonicalMetricRefV1;
        readonly unit: BenchmarkSampleUnitV1;
      };
    }
  | {
      readonly classification: 'capability-bound-unavailable';
      readonly required: boolean;
      readonly capabilityId: CanonicalIdV1;
      readonly reasonCode: Extract<BenchmarkMetricProducibilityReasonV1, 'capability-bound' | 'producer-unavailable' | 'diagnostic-only'>;
    }
  | {
      readonly classification: 'eligibility-bound-unavailable';
      readonly required: boolean;
      readonly reasonCode: Exclude<BenchmarkMetricProducibilityReasonV1, 'capability-bound'>;
    }
);

export interface BenchmarkScenarioMetricCapabilitySelectionV1 {
  readonly scenarioId: BenchmarkScenarioIdV1;
  readonly metricRef: CanonicalMetricRefV1;
  readonly parameterKey: 'backend';
  readonly selections: NonEmptyReadonlyArray<{
    readonly parameterValue: BenchmarkBackendV1;
    readonly capabilityId: CanonicalIdV1;
  }>;
}

export interface BenchmarkSampleDimensionV1 {
  readonly key: CanonicalIdV1;
  readonly value: string | number | boolean;
}

export type BenchmarkComparisonAxisV1 =
  | 'candidate'
  | 'backend'
  | 'mesher'
  | 'chunk-edge'
  | 'worker-count';

export interface BenchmarkScenarioDefinitionV1 {
  readonly schemaVersion: 'benchmark-scenario-definition-v1';
  readonly protocolVersion: BenchmarkProtocolVersion;
  readonly id: BenchmarkScenarioIdV1;
  readonly version: 1;
  readonly fixtureContractId: CanonicalIdV1;
  readonly fixtureContractVersion: SafePositiveIntegerV1;
  readonly allowedPhases: NonEmptyReadonlyArray<BenchmarkSamplePhaseV1>;
  readonly parameterContracts: readonly BenchmarkScenarioParameterContractV1[];
  readonly metricContracts: readonly BenchmarkScenarioMetricContractV1[];
  readonly metricCapabilitySelections: readonly BenchmarkScenarioMetricCapabilitySelectionV1[];
  readonly capabilityContracts: readonly BenchmarkScenarioCapabilityContractV1[];
  readonly comparisonAxes: NonEmptyReadonlyArray<BenchmarkComparisonAxisV1>;
  readonly fairnessKeys: readonly CanonicalIdV1[];
  readonly warmupControl: BenchmarkScenarioWarmupControlV1 | null;
}

export interface BenchmarkScenarioBindingV1 {
  readonly id: BenchmarkScenarioIdV1;
  readonly version: 1;
  readonly definitionSha256: Sha256DigestV1;
  readonly fixture: BenchmarkFixtureContractBindingV1;
  readonly parameters: readonly BenchmarkScenarioParameterV1[];
}

export type BenchmarkGateRoleV1 =
  | 'correctness-only'
  | 'performance-primary'
  | 'guardrail'
  | 'informational';

export interface BenchmarkEnvironmentManifestV1 {
  readonly schemaVersion: 'benchmark-environment-manifest-v1';
  readonly hardwareProfileId: AvailabilityV1<CanonicalIdV1>;
  readonly hardwareProfileTier: AvailabilityV1<'H1' | 'H2' | 'H3'>;
  readonly gateRole: AvailabilityV1<BenchmarkGateRoleV1>;
  readonly os: {
    readonly name: AvailabilityV1<NonEmptyString>;
    readonly version: AvailabilityV1<NonEmptyString>;
    readonly architecture: AvailabilityV1<NonEmptyString>;
  };
  readonly cpu: {
    readonly vendor: AvailabilityV1<NonEmptyString>;
    readonly model: AvailabilityV1<NonEmptyString>;
    readonly physicalCores: AvailabilityV1<SafePositiveIntegerV1>;
    readonly logicalCores: AvailabilityV1<SafePositiveIntegerV1>;
    readonly ramBytes: AvailabilityV1<SafePositiveIntegerV1>;
  };
  readonly gpu: {
    readonly vendor: AvailabilityV1<NonEmptyString>;
    readonly device: AvailabilityV1<NonEmptyString>;
    readonly driver: AvailabilityV1<NonEmptyString>;
    readonly graphicsBackend: AvailabilityV1<NonEmptyString>;
  };
  readonly browser: {
    readonly product: AvailabilityV1<NonEmptyString>;
    readonly version: AvailabilityV1<NonEmptyString>;
    readonly channel: AvailabilityV1<NonEmptyString>;
    readonly userAgent: AvailabilityV1<NonEmptyString>;
    readonly executableSha256: AvailabilityV1<Sha256DigestV1>;
    readonly headless: AvailabilityV1<boolean>;
    readonly flags: AvailabilityV1<readonly NonEmptyString[]>;
  };
  readonly display: {
    readonly cssWidth: AvailabilityV1<SafePositiveIntegerV1>;
    readonly cssHeight: AvailabilityV1<SafePositiveIntegerV1>;
    readonly devicePixelRatio: AvailabilityV1<number>;
    readonly refreshHz: AvailabilityV1<number>;
    readonly vsync: AvailabilityV1<'enabled' | 'disabled' | 'platform-default'>;
  };
  readonly power: {
    readonly source: AvailabilityV1<'ac' | 'battery'>;
    readonly profile: AvailabilityV1<NonEmptyString>;
    readonly battery: AvailabilityV1<
      | { readonly status: 'not-applicable' }
      | { readonly status: 'reported'; readonly percent: number }
      | { readonly status: 'unavailable'; readonly reason: NonEmptyString }
    >;
  };
  readonly runtimeState: {
    readonly visibility: AvailabilityV1<'visible' | 'hidden'>;
    readonly focus: AvailabilityV1<'focused' | 'unfocused'>;
    readonly backgroundTabs: AvailabilityV1<number>;
    readonly competingLoad: AvailabilityV1<
      | { readonly status: 'none' }
      | { readonly status: 'documented'; readonly detail: NonEmptyString }
    >;
    readonly thermalState: AvailabilityV1<'nominal' | 'throttled' | 'not-observable'>;
  };
  readonly capabilities: readonly {
    readonly id: CanonicalIdV1;
    readonly value: CapabilityAvailabilityV1;
  }[];
}

export interface BenchmarkIdOwnershipV1 {
  readonly slotId: typeof BENCHMARK_ID_OWNERSHIP.slotId;
  readonly browserProcessId: typeof BENCHMARK_ID_OWNERSHIP.browserProcessId;
  readonly bootstrapClusterId: typeof BENCHMARK_ID_OWNERSHIP.bootstrapClusterId;
  readonly pairCellId: typeof BENCHMARK_ID_OWNERSHIP.pairCellId;
  readonly pairOrdinal: typeof BENCHMARK_ID_OWNERSHIP.pairOrdinal;
}

export interface BenchmarkOrchestrationIdsV1 {
  readonly slotId: CanonicalIdV1;
  readonly browserProcessId: CanonicalIdV1;
  readonly bootstrapClusterId: CanonicalIdV1;
  readonly pairCellId: CanonicalIdV1;
  readonly pairOrdinal: SafePositiveIntegerV1;
  readonly ownership: BenchmarkIdOwnershipV1;
}

export type BenchmarkRunValidityV1 =
  | { readonly status: 'valid' }
  | { readonly status: 'invalid'; readonly reasons: NonEmptyReadonlyArray<BenchmarkInvalidReasonV1> };

export type BenchmarkRunOriginV1 =
  | { readonly kind: 'planned' }
  | {
      readonly kind: 'infrastructure-rerun';
      readonly replacesRunId: CanonicalIdV1;
      readonly approvalId: CanonicalIdV1;
      readonly reason: 'infrastructure-failure';
    };

export interface BenchmarkExecutionDescriptorV1 {
  readonly schemaVersion: 'benchmark-execution-descriptor-v1';
  readonly processContainer: BenchmarkProcessContainerV1;
  readonly phase: BenchmarkSamplePhaseV1;
  readonly processOrdinal: number;
  readonly iteration: number;
  readonly runPlanId: CanonicalIdV1;
  readonly runPlanSha256: Sha256DigestV1;
  readonly order: {
    readonly scheme: 'single-candidate' | 'abba' | 'baab' | 'latin-square';
    readonly orderSeed: UInt32V1;
    readonly blockId: CanonicalIdV1;
    readonly sequencePosition: number;
    readonly candidateId: CanonicalIdV1;
  };
  readonly pageState: {
    readonly visibility: 'visible' | 'hidden';
    readonly focus: 'focused' | 'unfocused';
    readonly backgroundTabs: number;
  };
  readonly measurementEligibility: 'eligible' | 'ineligible';
  readonly origin: BenchmarkRunOriginV1;
  readonly validity: BenchmarkRunValidityV1;
}

export interface BenchmarkWarmMeasurementEvidenceV1 {
  readonly schemaVersion: 'benchmark-warm-measurement-evidence-v1';
  readonly browserProcessId: CanonicalIdV1;
  readonly runPlanId: CanonicalIdV1;
  readonly runPlanSha256: Sha256DigestV1;
  readonly ruleId: CanonicalIdV1;
  readonly ruleVersion: 1;
  readonly algorithm: BenchmarkWarmupAlgorithmV1;
  readonly controlMetricRef: CanonicalMetricRefV1;
  readonly controlSamples: NonEmptyReadonlyArray<{
    readonly sampleId: CanonicalIdV1;
    readonly runId: CanonicalIdV1;
    readonly iterationId: CanonicalIdV1;
    readonly iterationOrdinal: number;
    readonly sampleOrdinal: number;
    readonly value: number;
  }>;
}

export type BenchmarkSampleObservationV1 =
  | {
      readonly clock: 'performance-time-origin';
      readonly realmId: CanonicalIdV1;
      readonly timeOriginEpochMs: number;
      readonly startMs: number;
    }
  | {
      readonly clock: 'gpu-query';
      readonly realmId: CanonicalIdV1;
      readonly startTickDecimal: NonEmptyString;
      readonly timestampPeriodNs: number;
    };

export type BenchmarkSampleResultV1 =
  | { readonly status: 'valid'; readonly value: number }
  | { readonly status: 'invalid'; readonly reason: BenchmarkInvalidReasonV1 };

export interface BenchmarkRawSampleV1 {
  readonly schemaVersion: 'benchmark-raw-sample-v1';
  readonly sampleId: CanonicalIdV1;
  readonly ordinal: number;
  readonly iterationId: CanonicalIdV1;
  readonly phase: BenchmarkSamplePhaseV1;
  readonly metricRef: CanonicalMetricRefV1;
  readonly kind: BenchmarkSampleKindV1;
  readonly realm: 'main' | 'worker' | 'gpu' | 'browser';
  readonly observedAt: BenchmarkSampleObservationV1;
  readonly unit: BenchmarkSampleUnitV1;
  readonly result: BenchmarkSampleResultV1;
  readonly dimensions: readonly BenchmarkSampleDimensionV1[];
  readonly runBindingSha256: Sha256DigestV1;
}

export interface BenchmarkIterationV1 {
  readonly schemaVersion: 'benchmark-iteration-v1';
  readonly iterationId: CanonicalIdV1;
  readonly iterationOrdinal: number;
  readonly runId: CanonicalIdV1;
  readonly phase: BenchmarkSamplePhaseV1;
  readonly samples: readonly BenchmarkRawSampleV1[];
}

export interface BenchmarkRunV1 {
  readonly schemaVersion: 'benchmark-run-v1';
  readonly protocolVersion: BenchmarkProtocolVersion;
  readonly runId: CanonicalIdV1;
  readonly createdUtc: UtcTimestampMsV1;
  readonly hardwareCellId: CanonicalIdV1;
  readonly browserProcessId: CanonicalIdV1;
  readonly ids: BenchmarkOrchestrationIdsV1;
  readonly source: BenchmarkSourceProvenanceV1;
  readonly scenario: BenchmarkScenarioBindingV1;
  readonly environment: BenchmarkEnvironmentManifestV1;
  readonly execution: BenchmarkExecutionDescriptorV1;
  readonly runBindingSha256: Sha256DigestV1;
  readonly measurementEligible: boolean;
  readonly measurementEligibilityReasons: readonly BenchmarkInvalidReasonV1[];
  readonly iterations: readonly BenchmarkIterationV1[];
}

export interface BrowserProcessV1 {
  readonly schemaVersion: 'benchmark-browser-process-v1';
  readonly browserProcessId: CanonicalIdV1;
  readonly hardwareCellId: CanonicalIdV1;
  readonly source: BenchmarkSourceProvenanceV1;
  readonly environment: BenchmarkEnvironmentManifestV1;
  readonly ids: BenchmarkOrchestrationIdsV1;
  readonly runs: NonEmptyReadonlyArray<BenchmarkRunV1>;
}

export interface HardwareCellV1 {
  readonly schemaVersion: 'benchmark-hardware-cell-v1';
  readonly hardwareCellId: CanonicalIdV1;
  readonly source: BenchmarkSourceProvenanceV1;
  readonly scenarioId: BenchmarkScenarioIdV1;
  readonly scenarioVersion: 1;
  readonly hardwareProfileId: CanonicalIdV1;
  readonly environment: BenchmarkEnvironmentManifestV1;
  readonly measurementEligible: boolean;
  readonly measurementEligibilityReasons: readonly BenchmarkInvalidReasonV1[];
  readonly browserProcesses: NonEmptyReadonlyArray<BrowserProcessV1>;
}

export type BenchmarkRunDocumentV1 = HardwareCellV1;

export const BENCHMARK_ARTIFACT_ROLE_VALUES_V1 = [
  'raw-run-json',
  'telemetry-export-json',
  'validation-receipt-json',
  'summary-json',
  'summary-markdown',
  'screenshot',
  'trace',
  'failure-log',
] as const;
export type BenchmarkArtifactRoleV1 = typeof BENCHMARK_ARTIFACT_ROLE_VALUES_V1[number];

export type BenchmarkArtifactSerializationV1 =
  | 'jcs-rfc8785'
  | 'utf8-lf-final-newline'
  | 'binary-exact';

export interface BenchmarkArtifactEntryV1 {
  readonly path: BundleRelativePathV1;
  readonly role: BenchmarkArtifactRoleV1;
  readonly mediaType: NonEmptyString;
  readonly serialization: BenchmarkArtifactSerializationV1;
  readonly byteLength: SafePositiveIntegerV1;
  readonly sha256: Sha256DigestV1;
  readonly runIds: NonEmptyReadonlyArray<CanonicalIdV1>;
}

export interface BenchmarkArtifactManifestV1 {
  readonly schemaVersion: 'benchmark-artifact-manifest-v1';
  readonly protocolVersion: BenchmarkProtocolVersion;
  readonly artifacts: readonly BenchmarkArtifactEntryV1[];
}

export const BENCHMARK_BUNDLE_CLAIM_CLASS_VALUES_V1 = ['correctness', 'diagnostic', 'informational'] as const;
export type BenchmarkBundleClaimClassV1 = typeof BENCHMARK_BUNDLE_CLAIM_CLASS_VALUES_V1[number];

export interface BenchmarkBundleManifestV1 {
  readonly schemaVersion: 'benchmark-bundle-manifest-v1';
  readonly protocolVersion: BenchmarkProtocolVersion;
  readonly bundleId: CanonicalIdV1;
  readonly createdUtc: UtcTimestampMsV1;
  readonly claimClass: BenchmarkBundleClaimClassV1;
  readonly canonicalJson: 'rfc8785-jcs';
  readonly pathPolicy: 'hestia-relative-posix-lower-v1';
  readonly digestAlgorithmVersion: 'hestia-benchmark-bundle-sha256-v1';
  readonly artifactManifest: {
    readonly path: 'artifact-manifest.json';
    readonly byteLength: SafePositiveIntegerV1;
    readonly sha256: Sha256DigestV1;
  };
  readonly runs: NonEmptyReadonlyArray<{
    readonly runId: CanonicalIdV1;
    readonly rawRun: {
      readonly path: BundleRelativePathV1;
      readonly sha256: Sha256DigestV1;
    };
    readonly telemetryExport: {
      readonly path: BundleRelativePathV1;
      readonly sha256: Sha256DigestV1;
    };
    readonly validationReceipt: {
      readonly path: BundleRelativePathV1;
      readonly sha256: Sha256DigestV1;
    };
  }>;
  readonly excludedFromBundleDigest: readonly ['bundle.sha256'];
}

export interface BenchmarkTelemetryDerivationEvidenceV1 {
  readonly schemaVersion: 'benchmark-telemetry-derivation-evidence-v1';
  readonly adapterContractId: typeof BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_ID_V1;
  readonly adapterContractVersion: typeof BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_VERSION_V1;
  readonly metricRegistrySha256: Sha256DigestV1;
  readonly targetRunId: CanonicalIdV1;
  readonly targetRunBindingSha256: Sha256DigestV1;
  readonly telemetryExportRawByteSha256: Sha256DigestV1;
  readonly adapterResultsCanonicalSha256: Sha256DigestV1;
  readonly derivedRawSamplesCanonicalSha256: Sha256DigestV1;
  readonly derivedSampleCount: SafePositiveIntegerV1;
  readonly evidenceSha256: Sha256DigestV1;
}

export interface BenchmarkValidationReceiptV1 {
  readonly schemaVersion: 'benchmark-validation-receipt-v1';
  readonly protocolVersion: BenchmarkProtocolVersion;
  readonly status: 'schema-and-integrity-valid';
  readonly receiptId: Sha256DigestV1;
  readonly planId: CanonicalIdV1;
  readonly slotId: CanonicalIdV1;
  readonly runId: CanonicalIdV1;
  readonly planDigest: Sha256DigestV1;
  readonly telemetryExportRawByteSha256: Sha256DigestV1;
  readonly benchmarkRunRawByteSha256: Sha256DigestV1;
  readonly benchmarkRunCanonicalSha256: Sha256DigestV1;
  readonly runBindingSha256: Sha256DigestV1;
  readonly schemaSetSha256: Sha256DigestV1;
  readonly metricRegistrySha256: Sha256DigestV1;
  readonly telemetryDerivationEvidence: BenchmarkTelemetryDerivationEvidenceV1;
  readonly telemetryDerivationEvidenceSha256: Sha256DigestV1;
  readonly validator: {
    readonly id: 'br01-validator-v1';
    readonly sourceCommitSha: GitShaV1;
    readonly sourceFileSetSha256: Sha256DigestV1;
  };
}

export type BenchmarkValidationStageV1 =
  | 'parse'
  | 'schema'
  | 'semantic'
  | 'provenance-or-bundle';

export interface BenchmarkValidationFailureV1 {
  readonly schemaVersion: 'benchmark-validation-failure-v1';
  readonly protocolVersion: BenchmarkProtocolVersion;
  readonly stage: BenchmarkValidationStageV1;
  readonly reason: BenchmarkInvalidReasonV1;
  readonly runId: CanonicalIdV1;
  readonly receiptId?: Sha256DigestV1;
}

export type TelemetryExportV1 = Readonly<Record<string, unknown>>;

export interface BenchmarkValidationContextV1 {
  readonly fixture: BenchmarkFixtureContractBindingV1;
  readonly candidate: BenchmarkCandidateBindingV1;
  readonly runPlan: {
    readonly id: CanonicalIdV1;
    readonly sha256: Sha256DigestV1;
  };
  readonly schemaSetSha256: Sha256DigestV1;
  readonly metricRegistrySha256: Sha256DigestV1;
  readonly warmMeasurementEvidence?: NonEmptyReadonlyArray<BenchmarkWarmMeasurementEvidenceV1>;
}

export interface BenchmarkValidationReceiptInputV1 {
  readonly planId: CanonicalIdV1;
  readonly slotId: CanonicalIdV1;
  readonly runId: CanonicalIdV1;
  readonly telemetryExportRawBytes: Uint8Array;
  readonly benchmarkRunRawBytes: Uint8Array;
  readonly benchmarkRunCanonicalBytes?: Uint8Array;
  readonly schemaSetBytes: Uint8Array;
  readonly metricRegistry: MetricRegistryV1;
  readonly telemetryAdapter: {
    readonly adapt: AdaptTelemetryExportV1;
  };
  readonly validatorSourceCommitSha: GitShaV1;
  readonly validatorSourceFiles: readonly { readonly path: RepositoryRelativePathV1; readonly bytes: Uint8Array }[];
  readonly validationContext: BenchmarkValidationContextV1;
}

export interface TelemetryAdapterContextV1 {
  readonly hardwareCellId: CanonicalIdV1;
  readonly slotId: CanonicalIdV1;
  readonly browserProcessId: CanonicalIdV1;
  readonly runId: CanonicalIdV1;
  readonly iterationId: CanonicalIdV1;
  readonly phase: BenchmarkSamplePhaseV1;
  readonly runBindingSha256: Sha256DigestV1;
}

export interface TelemetryAdapterResultV1 {
  readonly samples: readonly BenchmarkRawSampleV1[];
  readonly invalidReasons: readonly BenchmarkInvalidReasonV1[];
}

export interface BenchmarkTelemetryAdapterResultProjectionV1 {
  readonly iterationId: CanonicalIdV1;
  readonly iterationOrdinal: number;
  readonly runId: CanonicalIdV1;
  readonly phase: BenchmarkSamplePhaseV1;
  readonly samples: readonly BenchmarkRawSampleV1[];
  readonly invalidReasons: readonly BenchmarkInvalidReasonV1[];
}

export interface TelemetrySourceMappingV1 {
  readonly recordName: CanonicalIdV1;
  readonly disposition: 'emit-sample' | 'context-only' | 'diagnostic-only' | 'control-only';
  readonly metricRef?: CanonicalMetricRefV1;
  readonly unit?: BenchmarkSampleUnitV1;
}

export type AdaptTelemetryExportV1 = (
  telemetry: TelemetryExportV1,
  context: TelemetryAdapterContextV1,
  metricRegistry: MetricRegistryV1,
) => TelemetryAdapterResultV1;

export type BenchmarkMetricDirectionV1 = 'lower' | 'higher' | 'context-dependent';
export type BenchmarkMetricNumericKindV1 =
  | 'finite-number'
  | 'non-negative-safe-integer'
  | 'positive-finite-number';

export interface BenchmarkMetricNumericDomainV1 {
  readonly kind: BenchmarkMetricNumericKindV1;
  readonly minimum: number;
  readonly maximum: number | null;
}

export interface BenchmarkMetricGroupingV1 {
  readonly keys: readonly CanonicalIdV1[];
  readonly population: NonEmptyString;
}

export interface BenchmarkMetricPairingV1 {
  readonly keys: readonly CanonicalIdV1[];
  readonly level: 'run' | 'iteration' | 'event' | 'time-block' | 'window' | 'burst';
}

export interface BenchmarkMetricWarmupControlV1 {
  readonly metricRef: CanonicalMetricRefV1;
  readonly epsilon: number;
}

export interface MetricDefinitionV1 {
  readonly schemaVersion: 'benchmark-metric-definition-v1';
  readonly metricRef: CanonicalMetricRefV1;
  readonly kind: BenchmarkSampleKindV1;
  readonly unit: BenchmarkSampleUnitV1;
  readonly numericDomain: BenchmarkMetricNumericDomainV1;
  readonly eventSemantics: NonEmptyString;
  readonly populationSemantics: NonEmptyString;
  readonly allowedContainers: NonEmptyReadonlyArray<BenchmarkProcessContainerV1>;
  readonly allowedPhases: NonEmptyReadonlyArray<BenchmarkSamplePhaseV1>;
  readonly capabilityRequirements: readonly CanonicalIdV1[];
  readonly sourceMapping: readonly TelemetrySourceMappingV1[];
  readonly grouping: BenchmarkMetricGroupingV1;
  readonly pairing: BenchmarkMetricPairingV1;
  readonly dimensionContracts: readonly BenchmarkMetricDimensionContractV1[];
  readonly direction: BenchmarkMetricDirectionV1;
  readonly warmupControl: BenchmarkMetricWarmupControlV1 | null;
  readonly practicalEffectDelta: number | null;
  readonly automaticDecision: 'forbidden';
}

export interface MetricRegistryV1 {
  readonly schemaVersion: 'benchmark-metric-registry-v1';
  readonly protocolVersion: BenchmarkProtocolVersion;
  readonly metrics: NonEmptyReadonlyArray<MetricDefinitionV1>;
  readonly telemetryMappings: NonEmptyReadonlyArray<TelemetrySourceMappingV1>;
  readonly producibilityCrosswalk: NonEmptyReadonlyArray<BenchmarkMetricProducibilityEntryV1>;
  readonly metricRegistrySha256: Sha256DigestV1;
}

export const CONTRACT_VERSION_LITERALS = {
  protocol: BENCHMARK_PROTOCOL_VERSION,
  schemas: BENCHMARK_SCHEMA_VERSIONS,
  domains: BENCHMARK_DIGEST_DOMAINS,
  telemetryAdapter: {
    id: BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_ID_V1,
    version: BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_VERSION_V1,
  },
} as const;

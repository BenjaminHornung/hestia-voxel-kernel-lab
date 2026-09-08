/**
 * BR04 benchmark aggregate contract types (v1).
 *
 * Field-level transcription of BR04 report section 8
 * (BR04_Benchmark_Aggregator_Abschlussbericht_2026-08-12).
 *
 * Documented BR04 extensions beyond the report (all owned by this package,
 * none reinterpreting frozen BR01/BR03 IDs):
 * - PlannedRunSlotV1.balanceBlockId (XW-Block-01): the BR03-owned
 *   counterbalance order block. Required because paired evaluation and the
 *   paired bootstrap scope pairs strictly inside one balance block, while
 *   bootstrapClusterId (one browser process per cluster) is never a pairing
 *   criterion (packet P-BR04-IMPL crosswalk kern).
 * - Br03RunPlanProjectionV1.syntheticHardwareProfile (XW-Synth-01): the
 *   BR03-owned plan flag. Drives performance-claim eligibility: aggregates
 *   built from synthetic fixtures are strictly ineligible for performance
 *   claims (packet scope rule from the architecture audit).
 * - MetricCellV1.populationQualification: neutral qualification
 *   below-technical-floor / technical-only / standard-cell
 *   (BR_SERIES_CONTRACT section 11, implementation prompt component 8).
 * - BenchmarkAggregateV1.decision / automaticDecision: decision is always
 *   null, automaticDecision always "forbidden" (implementation prompt
 *   component 10).
 * - BenchmarkAggregateV1.inputProvenance: synthetic flag plus derived
 *   performance-claim eligibility.
 * - BenchmarkMarkdownReportModelV1.performanceClaimEligibility: same
 *   eligibility surfaced to the pure report renderer.
 */

export type Br04Sha256 = `sha256:${string}`;
export type Br04CommitSha = string;
export type Br04MetricRef = `${string}@${number}`;
export type Br04Phase = 'cold' | 'warmup' | 'measurement' | 'stress' | 'trace' | 'leak';

export type Br04RunDispositionV1 =
  | 'valid'
  | 'infrastructure-invalid'
  | 'capability-unsupported'
  | 'candidate-failure'
  | 'provenance-mismatch'
  | 'source-dirty'
  | 'trace-only';

export type Br04PairDispositionV1 = 'complete' | 'incomplete-pair' | 'not-applicable';

export type Br04PopulationQualificationV1 =
  | 'below-technical-floor'
  | 'technical-only'
  | 'standard-cell';

export type Br04PerformanceClaimEligibilityV1 =
  | 'eligible-measured'
  | 'ineligible-synthetic-fixture'
  | 'ineligible-no-valid-population';

export interface Br04ContractIssueV1 {
  readonly severity: 'error' | 'warning' | 'info';
  readonly code: string;
  readonly jsonPointer: string;
  readonly message: string;
  readonly runId: string | null;
  readonly slotId: string | null;
  readonly sourceDigest: Br04Sha256 | null;
}

export interface Br04AggregateInputBundleV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: 'br04-aggregate-input-v1';
  readonly bundleId: string;
  readonly reportAsOfUtc: string;
  readonly sourceContract: {
    readonly repository: 'BenjaminHornung/hestia-voxel-kernel-lab';
    readonly acceptedBr03Sha: Br04CommitSha;
    readonly br01SchemaId: string;
    readonly br01SchemaDigest: Br04Sha256;
    readonly br01ValidatorId: string;
    readonly br01ValidatorDigest: Br04Sha256;
  };
  readonly runPlan: Br04RunPlanProjectionV1;
  readonly metricRegistry: readonly Br04MetricDefinitionV1[];
  readonly bootstrapPolicy: Br04BootstrapPolicyV1;
  readonly runs: readonly Br04ValidatedRunEnvelopeV1[];
  readonly manifest: {
    readonly orderedRawRunDigests: readonly Br04Sha256[];
    readonly normalizedInputDigest: Br04Sha256;
    readonly manifestDigest: Br04Sha256;
  };
}

export interface Br04RunPlanProjectionV1 {
  readonly planId: string;
  readonly planVersion: number;
  readonly planDigest: Br04Sha256;
  readonly acceptedBr03Sha: Br04CommitSha;
  readonly comparisonMode: 'reference-paired' | 'unpaired-only';
  readonly slots: readonly Br04PlannedRunSlotV1[];
  readonly invalidationRegistry: readonly Br04InfrastructureInvalidationRuleV1[];
  readonly syntheticHardwareProfile: boolean;
}

export interface Br04PlannedRunSlotV1 {
  readonly slotId: string;
  readonly bootstrapClusterId: string;
  readonly balanceBlockId: string;
  readonly pairCellId: string | null;
  readonly pairOrdinal: number | null;
  readonly candidateId: string;
  readonly referenceCandidateId: string | null;
  readonly environmentCellId: string;
  readonly scenarioId: string;
  readonly scenarioVersion: number;
  readonly phase: Br04Phase;
  readonly workloadSeed: number;
  readonly requiredCapabilities: readonly string[];
}

export interface Br04InfrastructureInvalidationRuleV1 {
  readonly ruleId: string;
  readonly version: number;
  readonly scope: 'whole-run' | `metric:${Br04MetricRef}`;
  readonly detectionStage: 'pre-run' | 'during-run-independent-monitor' | 'post-run-integrity';
  readonly machineCheckablePredicateId: string;
  readonly candidateIndependent: true;
  readonly valueBlind: true;
  readonly retryAllowed: boolean;
  readonly maxRetries: 0 | 1;
}

export interface Br04ValidatedRunEnvelopeV1 {
  readonly runId: string;
  readonly slotId: string;
  readonly rawByteDigest: Br04Sha256;
  readonly canonicalContentDigest: Br04Sha256;
  readonly br01ValidationReceipt: {
    readonly receiptVersion: 1;
    readonly validatorId: string;
    readonly validatorDigest: Br04Sha256;
    readonly status: 'schema-and-integrity-valid';
    readonly validatedRawByteDigest: Br04Sha256;
    readonly validatedCanonicalContentDigest: Br04Sha256;
    readonly planDigest: Br04Sha256;
    readonly metricRegistryDigest: Br04Sha256;
  };
  readonly run: Br04RunProjectionV1;
}

export interface Br04RunProjectionV1 {
  readonly source: {
    readonly repository: string;
    readonly sourceTreeSha: Br04CommitSha;
    readonly buildSha256: Br04Sha256;
    readonly dirty: boolean;
    readonly fixtureContractId: string;
    readonly fixtureContractVersion: number;
    readonly fixtureDigest: Br04Sha256;
  };
  readonly environmentCellId: string;
  readonly browserProcessId: string;
  readonly candidateId: string;
  readonly phase: Br04Phase;
  /**
   * Compatibility key (R2, report sections 6.1-6.2): the BR03-planned
   * scenario binding plus the workload seed. Absolute cells and paired
   * comparisons must separate on these boundaries; the hardware cell
   * alone is not a complete experimental key.
   */
  readonly scenarioId: string;
  readonly scenarioVersion: number;
  readonly workloadSeed: number;
  /**
   * Content digest of the full frozen BR01 environment manifest
   * (browser, os, cpu, gpu, display, power, runtime state, capabilities).
   * Part of the compatibility key; capabilities stay separately visible
   * through metric eligibility.
   */
  readonly environmentFingerprint: Br04Sha256;
  readonly measurementEligible: boolean;
  readonly declaredDisposition: Br04RunDispositionV1;
  readonly declaredReasonCode: string | null;
  readonly declaredRuleId: string | null;
  readonly capabilities: Readonly<Record<string, 'supported' | 'unsupported' | 'error'>>;
  readonly iterations: readonly {
    readonly iterationId: string;
    readonly ordinal: number;
    readonly samples: readonly Br04RawMetricSampleProjectionV1[];
  }[];
}

export interface Br04RawMetricSampleProjectionV1 {
  readonly sampleId: string;
  readonly metricRef: Br04MetricRef;
  readonly value: number;
  readonly unit: string;
  readonly valid: boolean;
  readonly invalidReason: string | null;
  readonly tags: Readonly<Record<string, string | number | boolean | null>>;
}

export interface Br04MetricDefinitionV1 {
  readonly schemaVersion: 1;
  readonly metricId: string;
  readonly metricVersion: number;
  readonly label: string;
  readonly unit: 'ms' | 'bytes' | 'count' | 'ratio' | 'revision';
  readonly numericDomain:
    | 'positive-duration'
    | 'non-negative-bytes'
    | 'non-negative-count'
    | 'positive-ratio-component'
    | 'revision';
  readonly population: string;
  readonly requiredTags: readonly string[];
  readonly groupByTags: readonly string[];
  readonly pairingKeySuffix: readonly string[];
  readonly aggregationLevel: 'run' | 'iteration' | 'event' | 'time-block';
  readonly perRunStatistic:
    | 'identity'
    | 'sum'
    | 'count'
    | 'max'
    | 'nearest-rank-p50'
    | 'nearest-rank-p95'
    | 'nearest-rank-p99';
  readonly cellEstimator: 'median' | 'arithmetic-mean' | 'geometric-mean';
  readonly allowedPhases: readonly Br04Phase[];
  readonly capabilityRequirement: readonly string[];
  readonly direction: 'lower-is-better' | 'higher-is-better' | 'context-dependent';
  readonly lowerLevelResampling:
    | 'fixed-workload'
    | 'exchangeable-iterations'
    | 'predeclared-time-blocks'
    | 'none';
  readonly practicalEffectDelta: number | null;
  readonly automaticDecision: 'forbidden';
  readonly displaySignificantDigits: 6;
}

export interface Br04QuantileResultV1 {
  readonly schemaVersion: 1;
  readonly metricRef: Br04MetricRef;
  readonly scopeId: string;
  readonly scopeDigest: Br04Sha256;
  readonly probability: 0.5 | 0.95 | 0.99;
  readonly method: 'inverse-ecdf-nearest-rank-v1';
  readonly status: 'ok' | 'no-samples' | 'insufficient-samples';
  readonly nMatchingValidObservations: number;
  readonly minimumRequired: number;
  readonly oneBasedRank: number | null;
  readonly value: number | null;
  readonly unit: string;
  readonly sourceRunDigests: readonly Br04Sha256[];
}

export interface Br04BootstrapPolicyV1 {
  readonly method: 'hierarchical-percentile-v1';
  readonly confidenceLevel: 0.95;
  readonly resamples: 10000;
  readonly minimumTopLevelClusters: 3;
  readonly masterSeedHex: string;
  readonly seedDerivation: 'sha256-bound-xoshiro128ss-v1';
  readonly prng: 'xoshiro128**-32-v1';
  readonly indexSampling: 'uint32-rejection-v1';
}

export interface Br04BootstrapIntervalV1 {
  readonly schemaVersion: 1;
  readonly metricRef: Br04MetricRef;
  readonly estimatorId: string;
  readonly status: 'ok' | 'insufficient-clusters' | 'no-data' | 'not-applicable';
  readonly method: 'hierarchical-percentile-v1';
  readonly confidenceLevel: 0.95;
  readonly resamples: 10000;
  readonly lower: number | null;
  readonly upper: number | null;
  readonly unit: string;
  readonly hierarchy: readonly string[];
  readonly topLevelClusters: number;
  readonly runs: number;
  readonly iterations: number;
  readonly events: number;
  readonly masterSeedHex: string;
  readonly seedMaterialDigest: Br04Sha256;
  readonly derivedSeedHex: string;
  readonly replicateVectorDigest: Br04Sha256 | null;
}

export interface Br04PairKeyV1 {
  readonly balanceBlockId: string;
  readonly pairCellId: string;
  readonly pairOrdinal: number;
}

export interface Br04PairedComparisonV1 {  readonly schemaVersion: 1;
  readonly comparisonId: string;
  readonly metricRef: Br04MetricRef;
  readonly environmentCellId: string;
  readonly phase: Br04Phase;
  readonly referenceCandidateId: string;
  readonly candidateId: string;
  readonly direction: Br04MetricDefinitionV1['direction'];
  readonly perRunStatistic: Br04MetricDefinitionV1['perRunStatistic'];
  readonly pairs: {
    readonly planned: number;
    readonly complete: number;
    readonly incomplete: number;
    readonly completePairCellIds: readonly string[];
    readonly incompletePairCellIds: readonly string[];
  };
  readonly pairValues: readonly {
    readonly pairCellId: string;
    readonly pairOrdinal: number;
    readonly balanceBlockId: string;
    readonly bootstrapClusterId: string;
    readonly referenceValue: number;
    readonly candidateValue: number;
    readonly differenceCandidateMinusReference: number;
    readonly ratioCandidateOverReference: number | null;
    readonly ratioStatus: 'ok' | 'non-positive-reference' | 'domain-invalid';
    readonly referenceRunDigest: Br04Sha256;
    readonly candidateRunDigest: Br04Sha256;
  }[];
  readonly differencePointEstimate: number | null;
  readonly ratioPointEstimate: number | null;
  readonly differenceInterval: Br04BootstrapIntervalV1;
  readonly ratioInterval: Br04BootstrapIntervalV1;
  readonly practicalEffect: {
    readonly delta: number | null;
    readonly band: readonly [number, number] | null;
    readonly pointRelation:
      | 'practical-improvement'
      | 'inside-practical-band'
      | 'practical-regression'
      | 'context-dependent'
      | 'not-configured';
    readonly intervalRelation:
      | 'entirely-improvement'
      | 'entirely-inside-band'
      | 'entirely-regression'
      | 'overlaps-boundary'
      | 'unavailable';
    readonly ciRelationToOne: 'below' | 'contains' | 'above' | 'unavailable';
  };
  readonly decision: null;
}

export type Br04PairValueV1 = Br04PairedComparisonV1['pairValues'][number];

export interface Br04RunLedgerEntryV1 {
  readonly runId: string | null;
  readonly slotId: string;
  readonly rawByteDigest: Br04Sha256 | null;
  readonly baseDisposition: Br04RunDispositionV1;
  readonly pairDisposition: Br04PairDispositionV1;
  readonly reasonCodes: readonly string[];
  readonly metricEligibility: Readonly<Record<Br04MetricRef, Br04RunDispositionV1>>;
}

export interface Br04AggregateValidationResultV1 {
  readonly schemaVersion: 1;
  readonly status: 'valid' | 'invalid';
  readonly normalizedInputDigest: Br04Sha256 | null;
  readonly issues: readonly Br04ContractIssueV1[];
  readonly counts: {
    readonly plannedSlots: number;
    readonly observedRuns: number;
    readonly duplicateRuns: number;
    readonly missingSlots: number;
    readonly validReceipts: number;
    readonly fatalErrors: number;
  };
  readonly runLedger: readonly Br04RunLedgerEntryV1[];
}

export interface Br04InvalidRunSummaryV1 {
  readonly schemaVersion: 1;
  readonly plannedSlots: number;
  readonly observedRuns: number;
  readonly baseDispositionCounts: Readonly<Record<Br04RunDispositionV1, number>>;
  readonly entries: readonly {
    readonly runId: string | null;
    readonly slotId: string;
    readonly baseDisposition: Br04RunDispositionV1;
    readonly pairDisposition: Br04PairDispositionV1;
    readonly scope: 'run' | `metric:${Br04MetricRef}`;
    readonly reasonCodes: readonly string[];
    readonly rawRunDigest: Br04Sha256 | null;
    readonly planSlotDigest: Br04Sha256;
  }[];
  readonly missingSlots: readonly string[];
  readonly incompletePairs: readonly {
    readonly pairCellId: string;
    /** Full planned pair identity (R2): pairCellId alone can collide across blocks. */
    readonly balanceBlockId: string;
    readonly pairOrdinal: number;
    readonly presentSlotIds: readonly string[];
    readonly missingOrInvalidSlotIds: readonly string[];
    readonly reasonCodes: readonly string[];
  }[];
}

export type Br04InvalidRunEntryV1 = Br04InvalidRunSummaryV1['entries'][number];
export type Br04IncompletePairV1 = Br04InvalidRunSummaryV1['incompletePairs'][number];

export interface Br04CapabilityCoverageV1 {
  readonly schemaVersion: 1;
  readonly metricRef: Br04MetricRef;
  readonly environmentCellId: string;
  readonly candidateId: string;
  readonly requiredCapabilities: readonly string[];
  readonly status: 'supported' | 'partially-supported' | 'unsupported' | 'error';
  readonly plannedRuns: number;
  readonly observedRuns: number;
  readonly supportedRuns: number;
  readonly unsupportedRuns: number;
  readonly erroredRuns: number;
  readonly reasonCodes: readonly string[];
  readonly sourceRunDigests: readonly Br04Sha256[];
}

export interface Br04PerRunMetricSummaryV1 {
  readonly runId: string;
  readonly runDigest: Br04Sha256;
  readonly metricRef: Br04MetricRef;
  readonly nEvents: number;
  readonly p50: Br04QuantileResultV1;
  readonly p95: Br04QuantileResultV1;
  readonly p99: Br04QuantileResultV1;
  readonly maximum: number | null;
  readonly comparisonScalar: number | null;
}

export interface Br04MetricCellV1 {
  readonly metricRef: Br04MetricRef;
  readonly unit: string;
  readonly nProcesses: number;
  readonly nRuns: number;
  readonly nIterations: number;
  readonly nEvents: number;
  readonly populationQualification: Br04PopulationQualificationV1;
  readonly perRunSummaries: readonly Br04PerRunMetricSummaryV1[];
  readonly descriptivePooledQuantiles: readonly Br04QuantileResultV1[];
  readonly maximum: number | null;
  readonly cellPointEstimate: number | null;
  readonly cellInterval: Br04BootstrapIntervalV1;
}

export interface Br04EnvironmentCellAggregateV1 {
  readonly environmentCellId: string;
  readonly environmentFingerprintDigest: Br04Sha256;
  readonly phase: Br04Phase;
  readonly candidateId: string;
  readonly metricCells: readonly Br04MetricCellV1[];
}

export interface Br04ClaimTraceV1 {
  readonly claimId: string;
  readonly class: 'fact' | 'inference' | 'unknown';
  readonly aggregateJsonPointers: readonly string[];
  readonly sourceRunDigests: readonly Br04Sha256[];
  readonly planSlotIds: readonly string[];
  readonly metricDefinitionDigest: Br04Sha256 | null;
}

export interface Br04BenchmarkAggregateV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: 'br04-benchmark-aggregate-v1';
  readonly reportAsOfUtc: string;
  readonly inputDigest: Br04Sha256;
  readonly runPlanDigest: Br04Sha256;
  readonly acceptedBr03Sha: Br04CommitSha;
  readonly metricRegistryDigest: Br04Sha256;
  readonly bootstrapPolicyDigest: Br04Sha256;
  readonly aggregatorSourceDigest: Br04Sha256;
  readonly inputProvenance: {
    readonly syntheticHardwareProfile: boolean;
    readonly performanceClaimEligibility: Br04PerformanceClaimEligibilityV1;
  };
  readonly validation: Br04AggregateValidationResultV1;
  readonly environmentCells: readonly Br04EnvironmentCellAggregateV1[];
  readonly pairedComparisons: readonly Br04PairedComparisonV1[];
  readonly invalidRuns: Br04InvalidRunSummaryV1;
  readonly capabilityCoverage: readonly Br04CapabilityCoverageV1[];
  readonly claimIndex: readonly Br04ClaimTraceV1[];
  readonly facts: readonly string[];
  readonly inferences: readonly string[];
  readonly unknowns: readonly string[];
  readonly decision: null;
  readonly automaticDecision: 'forbidden';
  readonly aggregateDigest: Br04Sha256;
}

export interface Br04ReportSectionV1 {
  readonly heading: string;
  readonly rows: readonly Readonly<Record<string, string>>[];
  readonly aggregateJsonPointers: readonly string[];
}

export interface Br04AllowedChartSpecV1 {
  readonly chartId: string;
  readonly kind: 'ecdf' | 'run-dotplot' | 'paired-ratio' | 'ci-forest' | 'time-series';
  readonly sourceJsonPointers: readonly string[];
  /**
   * True only when the referenced sources actually carry every valid
   * point (R2: an ECDF declared from three pooled quantiles plus maximum
   * is not reconstructible and must say false).
   */
  readonly includesAllValidPoints: boolean;
  readonly showsInvalidCount: true;
  readonly truncatedAxis: false;
  readonly declaresPhase: true;
}

export interface Br04MarkdownReportModelV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: 'br04-markdown-report-model-v1';
  readonly aggregateDigest: Br04Sha256;
  readonly title: string;
  readonly reportAsOfUtc: string;
  readonly statusBanner: 'neutral-evidence-no-winner';
  readonly performanceClaimEligibility: Br04PerformanceClaimEligibilityV1;
  readonly provenanceSection: Br04ReportSectionV1;
  readonly environmentSection: Br04ReportSectionV1;
  readonly runLedgerSection: Br04ReportSectionV1;
  readonly summarySection: Br04ReportSectionV1;
  readonly comparisonSection: Br04ReportSectionV1;
  readonly capabilitySection: Br04ReportSectionV1;
  readonly invalidationSection: Br04ReportSectionV1;
  readonly chartSpecifications: readonly Br04AllowedChartSpecV1[];
  readonly factInferenceUnknownSection: Br04ReportSectionV1;
  readonly claimIndex: readonly Br04ClaimTraceV1[];
  readonly reportModelDigest: Br04Sha256;
}

export const BR04_AGGREGATOR_VERSION_V1 = 'br04-aggregator-v1' as const;
export const BR04_SEED_DOMAIN_V1 = 'BR04/bootstrap/v1' as const;
export const BR04_BOOTSTRAP_RESAMPLES_V1 = 10000 as const;
export const BR04_BOOTSTRAP_CONFIDENCE_V1 = 0.95 as const;
export const BR04_MINIMUM_TOP_LEVEL_CLUSTERS_V1 = 3 as const;
export const BR04_STANDARD_CELL_PROCESSES_V1 = 5 as const;
export const BR04_STANDARD_CELL_MEASUREMENT_ITERATIONS_V1 = 30 as const;
export const BR04_COLD_CELL_PROCESSES_V1 = 10 as const;
export const BR04_P99_MINIMUM_OBSERVATIONS_V1 = 1000 as const;

/**
 * BR04 versioned crosswalk adapter (v1): thin, explicit mapping from the
 * frozen accepted BR01/BR03 types onto the BR04 report projections
 * (AggregateInputBundleV1). The adapter never weakens validation and never
 * reinterprets frozen IDs:
 * - slotId, browserProcessId, bootstrapClusterId, pairCellId, pairOrdinal
 *   are BR03-owned and copied verbatim;
 * - balanceBlockId is BR03-owned and projected as an explicit slot field
 *   (XW-Block-01) so paired evaluation and the paired bootstrap scope
 *   pairs strictly inside one balance block;
 * - MetricRegistryV1 and its digest are imported from BR01
 *   (BENCHMARK_METRIC_REGISTRY_V1); practicalEffectDelta is shown per
 *   metric, null stays null, no global default;
 * - warmup-phase iterations are excluded at projection time (XW-Phase-01):
 *   warmup is not aggregatable for any v1 metric and warmup samples must
 *   never enter a measurement population. Runs stay fully listed in the
 *   ledger regardless.
 *
 * Open owner bindings applied here: O3 (field crosswalk), O4 (per-metric
 * delta display only). CROSSWALK_V1 full text was unavailable to this
 * package; the packet kern (process clusters for absolute CIs,
 * balanceBlockId+pairCellId for paired CIs, no ID reinterpretation,
 * synthetic-valid receipts ineligible for performance claims) is
 * implemented and every additional assumption is tagged XW-* and
 * documented in docs/benchmark/aggregator-v1.md.
 */
import { BENCHMARK_METRIC_REGISTRY_V1 } from '../contracts';
import type {
  BenchmarkInvalidReason,
  BenchmarkRunDocumentV1,
  BenchmarkRunV1,
  BenchmarkSamplePhaseV1,
  BenchmarkValidationReceiptV1,
  MetricDefinitionV1 as FrozenMetricDefinitionV1,
  MetricRegistryV1,
} from '../contracts';
import type {
  BuiltRunPlanV1,
  RunPlanProcessUnitV1,
} from '../runner/contractsV1';
import { sha256OfCanonicalV1, checkDomainV1 } from './br04StatisticsV1';
import type {
  Br04AggregateInputBundleV1,
  Br04BootstrapPolicyV1,
  Br04ContractIssueV1,
  Br04InfrastructureInvalidationRuleV1,
  Br04MetricDefinitionV1,
  Br04MetricRef,
  Br04Phase,
  Br04PlannedRunSlotV1,
  Br04RawMetricSampleProjectionV1,
  Br04RunDispositionV1,
  Br04Sha256,
  Br04ValidatedRunEnvelopeV1,
} from './br04ContractV1';
import {
  BR04_BOOTSTRAP_CONFIDENCE_V1,
  BR04_BOOTSTRAP_RESAMPLES_V1,
  BR04_MINIMUM_TOP_LEVEL_CLUSTERS_V1,
} from './br04ContractV1';

export interface Br04CrosswalkRunInputV1 {
  readonly document: BenchmarkRunDocumentV1;
  readonly run: BenchmarkRunV1;
  readonly receipt: BenchmarkValidationReceiptV1;
  readonly rawByteDigest: Br04Sha256;
  readonly canonicalContentDigest: Br04Sha256;
  /**
   * Harness-provided binding to a predeclared plan invalidation rule.
   * Frozen BR03 run documents carry no rule reference (owner gap
   * XW-Rule-01); without this binding an infrastructure claim is
   * fail-closed rejected as UNDECLARED_INVALIDATION_CODE.
   */
  readonly declaredRuleId?: string | null;
}

export interface Br04CrosswalkSourceContractV1 {
  readonly br01SchemaId: string;
  readonly br01SchemaDigest: Br04Sha256;
  readonly br01ValidatorId: string;
  readonly br01ValidatorDigest: Br04Sha256;
}

export interface Br04CrosswalkInputV1 {
  readonly acceptedBr03Sha: string;
  readonly bundleId: string;
  readonly reportAsOfUtc: string;
  readonly plan: BuiltRunPlanV1;
  readonly registry?: MetricRegistryV1;
  readonly bootstrapPolicy: Br04BootstrapPolicyV1;
  /**
   * Predeclared BR03 invalidation rules (XW-Rule-02). The frozen BR03 plan
   * core at the BR03-M1M2 SHA carries no machine-readable invalidation
   * registry, so the harness supplies the plan-published rules here.
   * Infrastructure claims without a matching predeclared rule are
   * fail-closed rejected (UNDECLARED_INVALIDATION_CODE).
   */
  readonly invalidationRegistry?: readonly Br04InfrastructureInvalidationRuleV1[];
  readonly runs: readonly Br04CrosswalkRunInputV1[];
}

export interface Br04CrosswalkResultV1 {
  readonly bundle: Br04AggregateInputBundleV1 | null;
  readonly issues: readonly Br04ContractIssueV1[];
}

interface Br04MetricPolicyV1 {
  readonly aggregationLevel: Br04MetricDefinitionV1['aggregationLevel'];
  readonly perRunStatistic: Br04MetricDefinitionV1['perRunStatistic'];
  readonly cellEstimator: Br04MetricDefinitionV1['cellEstimator'];
  readonly lowerLevelResampling: Br04MetricDefinitionV1['lowerLevelResampling'];
  readonly requiredTags: readonly string[];
}

/**
 * Versioned per-metric analysis policy transcribed from BR04 report
 * section 12.2. Metrics outside this table fall back to a generic,
 * documented policy (pairing level from the frozen registry, run-level
 * identity scalars, median cell estimator, no lower-level resampling).
 */
const BR04_ANALYTIC_POLICY_V1: Readonly<Record<string, Br04MetricPolicyV1>> = {
  'world.mesh.total.ms@1': { aggregationLevel: 'iteration', perRunStatistic: 'nearest-rank-p50', cellEstimator: 'median', lowerLevelResampling: 'none', requiredTags: [] },
  'chunk.mesh.cpu.ms@1': { aggregationLevel: 'event', perRunStatistic: 'nearest-rank-p95', cellEstimator: 'median', lowerLevelResampling: 'fixed-workload', requiredTags: [] },
  'snapshot.halo.build.ms@1': { aggregationLevel: 'event', perRunStatistic: 'nearest-rank-p95', cellEstimator: 'median', lowerLevelResampling: 'fixed-workload', requiredTags: [] },
  'scheduler.queue.wait.ms@1': { aggregationLevel: 'event', perRunStatistic: 'nearest-rank-p95', cellEstimator: 'median', lowerLevelResampling: 'exchangeable-iterations', requiredTags: [] },
  'worker.total.ms@1': { aggregationLevel: 'event', perRunStatistic: 'nearest-rank-p95', cellEstimator: 'median', lowerLevelResampling: 'exchangeable-iterations', requiredTags: [] },
  'adoption.cpu.ms@1': { aggregationLevel: 'event', perRunStatistic: 'nearest-rank-p95', cellEstimator: 'median', lowerLevelResampling: 'exchangeable-iterations', requiredTags: [] },
  'input.revision.submit.ms@1': { aggregationLevel: 'event', perRunStatistic: 'nearest-rank-p95', cellEstimator: 'median', lowerLevelResampling: 'exchangeable-iterations', requiredTags: [] },
  'raf.interval.ms@1': { aggregationLevel: 'time-block', perRunStatistic: 'nearest-rank-p95', cellEstimator: 'median', lowerLevelResampling: 'predeclared-time-blocks', requiredTags: [] },
  'longtask.duration.ms@1': { aggregationLevel: 'time-block', perRunStatistic: 'max', cellEstimator: 'median', lowerLevelResampling: 'predeclared-time-blocks', requiredTags: [] },
  'longtask.count@1': { aggregationLevel: 'run', perRunStatistic: 'sum', cellEstimator: 'median', lowerLevelResampling: 'none', requiredTags: ['observationWindowId'] },
  'memory.bytes@1': { aggregationLevel: 'run', perRunStatistic: 'max', cellEstimator: 'median', lowerLevelResampling: 'none', requiredTags: ['memoryKind'] },
  'gpu.time.ms@1': { aggregationLevel: 'time-block', perRunStatistic: 'nearest-rank-p95', cellEstimator: 'median', lowerLevelResampling: 'predeclared-time-blocks', requiredTags: [] },
  'scheduler.drain.ms@1': { aggregationLevel: 'run', perRunStatistic: 'max', cellEstimator: 'median', lowerLevelResampling: 'none', requiredTags: [] },
  'scheduler.stale.count@1': { aggregationLevel: 'run', perRunStatistic: 'sum', cellEstimator: 'median', lowerLevelResampling: 'none', requiredTags: ['observationWindowId', 'staleReason'] },
  'scheduler.drop.count@1': { aggregationLevel: 'run', perRunStatistic: 'sum', cellEstimator: 'median', lowerLevelResampling: 'none', requiredTags: ['observationWindowId', 'dropKind'] },
};

const BR04_SUPPORTED_UNITS_V1 = ['ms', 'bytes', 'count', 'ratio', 'revision'] as const;

/**
 * Versioned dimension-name mapping (R2, XW-Name-01, B1): the frozen BR01
 * registry and all real BR01 samples use kebab-case canonical ids
 * (`memory-kind`, `observation-window-id`, `stale-reason`, `drop-kind`,
 * `checkpoint-id`), while the BR04 analytic policy table and the projected
 * bundle contract use camelCase tag names. This map is the single boundary
 * where names are translated; frozen BR01 contracts are never renamed.
 * Unknown keys pass through unchanged and fail closed downstream when a
 * required tag is missing.
 */
const BR04_DIMENSION_ALIAS_V1: Readonly<Record<string, string>> = {
  'memory-kind': 'memoryKind',
  'observation-window-id': 'observationWindowId',
  'stale-reason': 'staleReason',
  'drop-kind': 'dropKind',
  'checkpoint-id': 'checkpointId',
};

export function normalizeDimensionKeyV1(key: string): string {
  return BR04_DIMENSION_ALIAS_V1[key] ?? key;
}

function numericDomainForUnitV1(unit: string): Br04MetricDefinitionV1['numericDomain'] {
  switch (unit) {
    case 'ms': return 'positive-duration';
    case 'bytes': return 'non-negative-bytes';
    case 'count': return 'non-negative-count';
    case 'ratio': return 'positive-ratio-component';
    case 'revision': return 'revision';
    default: return 'positive-duration';
  }
}

function fallbackPolicyV1(frozen: FrozenMetricDefinitionV1): Br04MetricPolicyV1 {
  const level = frozen.pairing.level;
  const aggregationLevel: Br04MetricDefinitionV1['aggregationLevel'] =
    level === 'run' || level === 'window' || level === 'burst' ? 'run'
      : level === 'iteration' ? 'iteration'
        : level === 'time-block' ? 'time-block' : 'event';
  return {
    aggregationLevel,
    perRunStatistic: aggregationLevel === 'run' ? 'identity' : 'nearest-rank-p50',
    cellEstimator: 'median',
    lowerLevelResampling: 'none',
    requiredTags: [],
  };
}

function parseMetricRefV1(metricRef: string): { metricId: string; metricVersion: number } | null {
  const at = metricRef.lastIndexOf('@');
  if (at <= 0) return null;
  const version = Number(metricRef.slice(at + 1));
  if (!Number.isSafeInteger(version) || version < 1) return null;
  return { metricId: metricRef.slice(0, at), metricVersion: version };
}

const INFRASTRUCTURE_REASON_CODES_V1: ReadonlySet<BenchmarkInvalidReason> = new Set([
  'environment-incomplete', 'browser-version-mismatch', 'document-hidden', 'document-unfocused',
  'background-tabs-present', 'power-state-mismatch', 'thermal-throttling', 'clock-invalid',
  'infrastructure-failure', 'operator-abort',
]);

const CANDIDATE_REASON_CODES_V1: ReadonlySet<BenchmarkInvalidReason> = new Set([
  'page-error', 'console-error', 'request-failure', 'http-error', 'process-crash',
  'context-lost', 'sample-invalid', 'warmup-not-stable',
]);

const PROVENANCE_REASON_CODES_V1: ReadonlySet<BenchmarkInvalidReason> = new Set([
  'source-sha-mismatch', 'source-tree-mismatch', 'build-digest-mismatch',
  'fixture-contract-mismatch', 'candidate-contract-mismatch',
  'scenario-contract-mismatch', 'run-plan-mismatch',
]);

function isSha256V1(value: string): value is Br04Sha256 {
  return /^sha256:[0-9a-f]{64}$/.test(value);
}

function isCommitShaV1(value: string): boolean {
  return /^[0-9a-f]{40}$/.test(value);
}

export function projectMetricDefinitionV1(
  frozen: FrozenMetricDefinitionV1,
): { definition: Br04MetricDefinitionV1 | null; skippedUnit: boolean } {
  if (!BR04_SUPPORTED_UNITS_V1.includes(frozen.unit as (typeof BR04_SUPPORTED_UNITS_V1)[number])) {
    return { definition: null, skippedUnit: true };
  }
  const parsed = parseMetricRefV1(frozen.metricRef as string);
  if (parsed === null) return { definition: null, skippedUnit: false };
  const policy = BR04_ANALYTIC_POLICY_V1[frozen.metricRef as string] ?? fallbackPolicyV1(frozen);
  return {
    skippedUnit: false,
    definition: {
      schemaVersion: 1,
      metricId: parsed.metricId,
      metricVersion: parsed.metricVersion,
      label: frozen.metricRef as string,
      unit: frozen.unit as Br04MetricDefinitionV1['unit'],
      numericDomain: numericDomainForUnitV1(frozen.unit as string),
      population: frozen.populationSemantics as string,
      requiredTags: [...policy.requiredTags],
      groupByTags: frozen.grouping.keys.map((key) => normalizeDimensionKeyV1(key as string)),
      pairingKeySuffix: frozen.pairing.keys.map((key) => normalizeDimensionKeyV1(key as string)),
      aggregationLevel: policy.aggregationLevel,
      perRunStatistic: policy.perRunStatistic,
      cellEstimator: policy.cellEstimator,
      allowedPhases: [...frozen.allowedPhases] as Br04Phase[],
      capabilityRequirement: frozen.capabilityRequirements.map((id) => id as string),
      direction: frozen.direction === 'lower'
        ? 'lower-is-better'
        : frozen.direction === 'higher' ? 'higher-is-better' : 'context-dependent',
      lowerLevelResampling: policy.lowerLevelResampling,
      practicalEffectDelta: frozen.practicalEffectDelta,
      automaticDecision: 'forbidden',
      displaySignificantDigits: 6,
    },
  };
}

function missingSlotPhaseV1(unit: RunPlanProcessUnitV1): Br04Phase {
  switch (unit.processContainer) {
    case 'cold': return 'cold';
    case 'warm-measurement': return 'measurement';
    case 'stress': return 'stress';
    case 'trace': return 'trace';
    case 'leak': return 'leak';
    default: return 'measurement';
  }
}

function scenarioSeedV1(unit: RunPlanProcessUnitV1, orderSeed: number): number {
  for (const parameter of unit.scenarioParameters) {
    if (parameter.key === 'seed') return parameter.value as number;
  }
  return orderSeed;
}

interface Br04ProjectedRunV1 {
  readonly envelope: Br04ValidatedRunEnvelopeV1;
  readonly fatal: Br04ContractIssueV1 | null;
}

function projectRunV1(
  entry: Br04CrosswalkRunInputV1,
  unitBySlot: ReadonlyMap<string, RunPlanProcessUnitV1>,
  planCore: BuiltRunPlanV1['core'],
  planDigest: Br04Sha256,
  registryDigest: Br04Sha256,
  projectedRegistryDigest: Br04Sha256,
  metricByRef: ReadonlyMap<string, Br04MetricDefinitionV1>,
  sourceContract: Br04CrosswalkSourceContractV1,
  invalidationRegistry: readonly Br04InfrastructureInvalidationRuleV1[],
): Br04ProjectedRunV1 {
  const { document, receipt } = entry;
  const fail = (
    code: string, message: string, jsonPointer: string,
  ): Br04ProjectedRunV1 => ({
    envelope: null as never,
    fatal: {
      severity: 'error', code, jsonPointer, message,
      runId: entry.run.runId as string, slotId: entry.run.ids.slotId as string, sourceDigest: entry.rawByteDigest,
    },
  });
  /**
   * R2/B3: the projected run is derived from the validated document, never
   * from the unbound parallel `input.run` copy. The document embeds the
   * full runs (HardwareCellV1.browserProcesses[].runs[]); the passed copy
   * must be canonically identical to the embedded run, otherwise a stale
   * or swapped object could be evaluated under foreign evidence.
   */
  const processes = Array.isArray((document as { browserProcesses?: unknown }).browserProcesses)
    ? (document.browserProcesses as readonly {
      readonly runs?: readonly BenchmarkRunV1[];
      readonly ids?: { readonly bootstrapClusterId?: unknown };
    }[])
    : [];
  let embedded: BenchmarkRunV1 | undefined;
  let processBootstrapCluster: unknown;
  for (const candidate of processes) {
    const found = Array.isArray(candidate.runs)
      ? candidate.runs.find((item) => (item as BenchmarkRunV1).runId === entry.run.runId)
      : undefined;
    if (found !== undefined && Array.isArray((found as BenchmarkRunV1).iterations)) {
      embedded = found as BenchmarkRunV1;
      processBootstrapCluster = candidate.ids?.bootstrapClusterId;
      break;
    }
  }
  if (embedded === undefined) {
    return fail('RUN_NOT_IN_DOCUMENT', 'Run is not contained as a full run object in any browser process of its document.', '/browserProcesses');
  }
  if (sha256OfCanonicalV1(embedded) !== sha256OfCanonicalV1(entry.run)) {
    return fail('RUN_DOCUMENT_MISMATCH', 'The passed run copy differs from the run embedded in the validated document; only the embedded run is projectable.', '/browserProcesses');
  }
  const run = embedded;
  const receiptBinding = (receipt as { runBindingSha256?: unknown }).runBindingSha256;
  if (typeof receiptBinding === 'string' && receiptBinding !== (run.runBindingSha256 as string)) {
    return fail('RUN_BINDING_MISMATCH', 'Receipt run binding does not match the embedded run.', '/br01ValidationReceipt/runBindingSha256');
  }
  if (receipt.status !== 'schema-and-integrity-valid') {
    return fail('RECEIPT_STATUS_INVALID', 'BR01 receipt status is not schema-and-integrity-valid.', '/br01ValidationReceipt/status');
  }
  if (receipt.runId !== run.runId) {
    return fail('RECEIPT_RUN_MISMATCH', 'Receipt runId does not match the run.', '/br01ValidationReceipt/runId');
  }
  if (receipt.slotId !== run.ids.slotId) {
    return fail('RECEIPT_SLOT_MISMATCH', 'Receipt slotId does not match the run slot.', '/br01ValidationReceipt/slotId');
  }
  if (receipt.benchmarkRunRawByteSha256 !== entry.rawByteDigest) {
    return fail('RECEIPT_DIGEST_MISMATCH', 'Receipt raw-byte digest does not match the observed run bytes.', '/br01ValidationReceipt/validatedRawByteDigest');
  }
  if (receipt.benchmarkRunCanonicalSha256 !== entry.canonicalContentDigest) {
    return fail('RECEIPT_DIGEST_MISMATCH', 'Receipt canonical-content digest does not match the observed run.', '/br01ValidationReceipt/validatedCanonicalContentDigest');
  }
  /**
   * R3/B3-Rest: bind the validated bytes to the projected run. The checks
   * above compare caller-supplied digest strings with each other, so a
   * consistently mutated document (embedded run and parallel copy changed
   * together) under a stale receipt would pass. Recompute the canonical
   * digest from the validated document with the same canonicalizer the
   * BR01 validator uses and require it to match both the observed digest
   * and the receipt, otherwise a stale or foreign evidence could back
   * different values than the ones actually aggregated.
   */
  const recomputedDocumentDigest = sha256OfCanonicalV1(document);
  if (recomputedDocumentDigest !== entry.canonicalContentDigest) {
    return fail('DOCUMENT_DIGEST_MISMATCH', 'Observed canonical-content digest does not match the validated document bytes.', '/canonicalContentDigest');
  }
  if (recomputedDocumentDigest !== (receipt.benchmarkRunCanonicalSha256 as string)) {
    return fail('RECEIPT_DIGEST_MISMATCH', 'Receipt canonical-content digest does not match the validated document bytes; the receipt is stale or foreign.', '/br01ValidationReceipt/validatedCanonicalContentDigest');
  }
  if (receipt.planDigest !== planDigest) {
    return fail('PLAN_DIGEST_MISMATCH', 'Receipt plan digest does not match the BR03 run plan.', '/br01ValidationReceipt/planDigest');
  }
  if (receipt.metricRegistrySha256 !== registryDigest) {
    return fail('REGISTRY_DIGEST_MISMATCH', 'Receipt metric-registry digest does not match the BR01 registry.', '/br01ValidationReceipt/metricRegistrySha256');
  }
  if (receipt.validator.id !== 'br01-validator-v1') {
    return fail('VALIDATOR_MISMATCH', 'Receipt validator is not br01-validator-v1.', '/br01ValidationReceipt/validator/id');
  }
  if (
    receipt.validator.sourceFileSetSha256 !== sourceContract.br01ValidatorDigest
    || receipt.schemaSetSha256 !== sourceContract.br01SchemaDigest
  ) {
    return fail('SOURCE_CONTRACT_CONFLICT', 'Receipt schema/validator digests conflict with the bundle source contract.', '/br01ValidationReceipt');
  }
  const unit = unitBySlot.get(run.ids.slotId as string);
  if (unit === undefined) {
    return fail('UNKNOWN_SLOT', 'Run references a slot that is not part of the BR03 plan.', '/slotId');
  }
  if (processBootstrapCluster !== run.ids.bootstrapClusterId) {
    return fail('HIERARCHY_INVALID', 'Run bootstrap cluster disagrees with its browser process.', '/ids/bootstrapClusterId');
  }
  const scenarioId = (run as { scenario?: { id?: unknown; version?: unknown } }).scenario;
  if (scenarioId !== undefined) {
    if (scenarioId.id !== unit.scenarioId) {
      return fail('SCENARIO_MISMATCH', 'Run scenario binding disagrees with its plan slot.', '/scenario/id');
    }
    if (scenarioId.version !== 1) {
      return fail('SCENARIO_VERSION_MISMATCH', 'Run scenario version is not the frozen v1.', '/scenario/version');
    }
  }
  if (run.measurementEligible === true && run.measurementEligibilityReasons.length > 0) {
    return fail('ELIGIBILITY_CONFLICT', 'Eligible run carries eligibility reasons.', '/measurementEligibilityReasons');
  }
  if (run.execution.order.candidateId !== unit.candidateId) {
    return fail('SLOT_CANDIDATE_MISMATCH', 'Run candidate disagrees with its plan slot.', '/execution/order/candidateId');
  }
  if (run.execution.order.blockId !== unit.balanceBlockId) {
    return fail('SLOT_BLOCK_MISMATCH', 'Run balance block disagrees with its plan slot.', '/execution/order/blockId');
  }
  const capabilities: Record<string, 'supported' | 'unsupported' | 'error'> = {};
  for (const entryCapability of run.environment.capabilities) {
    const value = entryCapability.value;
    capabilities[entryCapability.id as string] =
      value.status === 'observed' && value.value === true
        ? 'supported'
        : value.status === 'error' ? 'error' : 'unsupported';
  }
  const projectedIterations: {
    readonly iterationId: string;
    readonly ordinal: number;
    readonly samples: readonly Br04RawMetricSampleProjectionV1[];
  }[] = [];
  for (const iteration of run.iterations) {
    if ((iteration.phase as BenchmarkSamplePhaseV1) === 'warmup') continue;
    const projected: Br04RawMetricSampleProjectionV1[] = [];
    for (const sample of iteration.samples) {
      if ((sample.phase as BenchmarkSamplePhaseV1) === 'warmup') continue;
      const metricRef = sample.metricRef as string as Br04MetricRef;
      const metric = metricByRef.get(metricRef);
      if (metric === undefined) {
        return fail('UNKNOWN_METRIC_REF', `Sample references unknown metric ${metricRef}.`, `/iterations/${iteration.iterationId as string}/samples/${sample.sampleId as string}`);
      }
      if ((sample.unit as string) !== metric.unit) {
        return fail('METRIC_UNIT_MISMATCH', `Sample unit disagrees with the registry for ${metricRef}.`, `/iterations/${iteration.iterationId as string}/samples/${sample.sampleId as string}`);
      }
      if (sample.result.status === 'valid') {
        const value = sample.result.value;
        if (Number.isNaN(value) || !Number.isFinite(value)) {
          return fail('NON_FINITE_NUMBER', 'Valid sample value is NaN or infinite.', `/iterations/${iteration.iterationId as string}/samples/${sample.sampleId as string}`);
        }
        if (Object.is(value, -0)) {
          return fail('NEGATIVE_ZERO_FORBIDDEN', 'Valid sample value is negative zero.', `/iterations/${iteration.iterationId as string}/samples/${sample.sampleId as string}`);
        }
        if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
          return fail('UNSAFE_INTEGER', 'Valid sample integer is not a safe integer.', `/iterations/${iteration.iterationId as string}/samples/${sample.sampleId as string}`);
        }
        const domainViolation = checkDomainV1(metric.numericDomain, value);
        if (domainViolation !== null) {
          return fail(domainViolation, `Valid sample violates ${metric.numericDomain} for ${metricRef}.`, `/iterations/${iteration.iterationId as string}/samples/${sample.sampleId as string}`);
        }
      }
      const tags: Record<string, string | number | boolean | null> = {};
      for (const dimension of sample.dimensions) {
        tags[normalizeDimensionKeyV1(dimension.key as string)] = dimension.value as string | number | boolean;
      }
      const sampleBinding = (sample as { runBindingSha256?: unknown }).runBindingSha256;
      if (typeof sampleBinding === 'string' && sampleBinding !== (run.runBindingSha256 as string)) {
        return fail('SAMPLE_BINDING_MISMATCH', 'Sample run binding does not match its run.', `/iterations/${iteration.iterationId as string}/samples/${sample.sampleId as string}`);
      }
      if (sample.result.status === 'valid') {
        for (const required of metric.requiredTags) {
          if (tags[required] === undefined || tags[required] === null) {
            return fail('REQUIRED_TAG_MISSING', `Valid sample for ${metricRef} misses required tag ${required}.`, `/iterations/${iteration.iterationId as string}/samples/${sample.sampleId as string}`);
          }
        }
      }
      projected.push({
        sampleId: sample.sampleId as string,
        metricRef,
        value: sample.result.status === 'valid' ? sample.result.value : 0,
        unit: sample.unit as string,
        valid: sample.result.status === 'valid',
        invalidReason: sample.result.status === 'valid' ? null : sample.result.reason.code,
        tags,
      });
    }
    projectedIterations.push({
      iterationId: iteration.iterationId as string,
      ordinal: projectedIterations.length,
      samples: projected,
    });
  }
  const reasonCodes = run.execution.validity.status === 'invalid'
    ? run.execution.validity.reasons.map((reason) => reason.code)
    : run.measurementEligibilityReasons.map((reason) => reason.code);
  const dirty = reasonCodes.includes('source-dirty');
  const provenanceViolations: string[] = [];
  if ((run.source.commitSha as string) !== (planCore.expectedSourceCommitSha as string)) {
    provenanceViolations.push('provenance-mismatch:source-commit');
  }
  if ((run.source.build.sha256 as string) !== (planCore.expectedBuildSha256 as string)) {
    provenanceViolations.push('provenance-mismatch:build-digest');
  }
  if ((run.source.fixture.id as string) !== (planCore.fixtureContractId as string)) {
    provenanceViolations.push('provenance-mismatch:fixture-contract');
  }
  const fixtureSemantic = run.source.fixture.semanticSha256;
  if (
    (fixtureSemantic.status === 'observed' || fixtureSemantic.status === 'declared')
    && (fixtureSemantic.value as string) !== (planCore.fixtureSemanticSha256 as string)
  ) {
    provenanceViolations.push('provenance-mismatch:fixture-digest');
  }
  let declaredDisposition: Br04RunDispositionV1;
  let declaredReasonCode: string | null = null;
  const declaredRuleId: string | null = entry.declaredRuleId ?? null;
  if (dirty) {
    declaredDisposition = 'source-dirty';
    declaredReasonCode = 'source-dirty';
  } else if (provenanceViolations.length > 0) {
    declaredDisposition = 'provenance-mismatch';
    declaredReasonCode = provenanceViolations[0] as string;
  } else if (run.execution.validity.status === 'invalid') {
    const first = run.execution.validity.reasons[0];
    if (first === undefined) {
      return fail('EMPTY_INVALID_REASONS', 'Invalid run carries no reason.', '/validity/reasons');
    }
    declaredReasonCode = first.code;
    if (PROVENANCE_REASON_CODES_V1.has(first.code)) {
      declaredDisposition = 'provenance-mismatch';
    } else if (CANDIDATE_REASON_CODES_V1.has(first.code)) {
      if (declaredRuleId !== null) {
        return fail('DISPOSITION_CONFLICT', 'Candidate-class failure bound to an infrastructure rule.', '/declaredRuleId');
      }
      declaredDisposition = 'candidate-failure';
    } else if (first.code === 'required-capability-missing' || first.code === 'metric-not-producible') {
      declaredDisposition = 'capability-unsupported';
    } else if (INFRASTRUCTURE_REASON_CODES_V1.has(first.code) || first.code === 'gpu-disjoint') {
      const rule = declaredRuleId === null
        ? undefined
        : invalidationRegistry.find((candidate) => candidate.ruleId === declaredRuleId);
      if (rule === undefined || rule.candidateIndependent !== true) {
        return fail('UNDECLARED_INVALIDATION_CODE', 'Infrastructure claim has no matching predeclared plan rule.', '/declaredRuleId');
      }
      declaredDisposition = 'infrastructure-invalid';
    } else {
      declaredDisposition = 'candidate-failure';
    }
  } else if ((run.execution.phase as BenchmarkSamplePhaseV1) === 'trace' && !run.measurementEligible) {
    declaredDisposition = 'trace-only';
  } else {
    declaredDisposition = 'valid';
  }
  const semanticValue = run.source.fixture.semanticSha256;
  const fileSetValue = run.source.fixture.sourceFileSetSha256;
  const fixtureDigest = semanticValue.status === 'observed' || semanticValue.status === 'declared'
    ? semanticValue.value as string as Br04Sha256
    : fileSetValue.status === 'observed' || fileSetValue.status === 'declared'
      ? fileSetValue.value as string as Br04Sha256
      : null;
  if (fixtureDigest === null) {
    return fail('FIXTURE_DIGEST_UNAVAILABLE', 'No observed fixture digest available for the run.', '/source/fixture');
  }
  const envelope: Br04ValidatedRunEnvelopeV1 = {
    runId: run.runId as string,
    slotId: run.ids.slotId as string,
    rawByteDigest: entry.rawByteDigest,
    canonicalContentDigest: entry.canonicalContentDigest,
    br01ValidationReceipt: {
      receiptVersion: 1,
      validatorId: receipt.validator.id,
      validatorDigest: receipt.validator.sourceFileSetSha256 as string as Br04Sha256,
      status: 'schema-and-integrity-valid',
      validatedRawByteDigest: receipt.benchmarkRunRawByteSha256 as string as Br04Sha256,
      validatedCanonicalContentDigest: receipt.benchmarkRunCanonicalSha256 as string as Br04Sha256,
      planDigest: receipt.planDigest as string as Br04Sha256,
      metricRegistryDigest: projectedRegistryDigest,
    },
    run: {
      source: {
        repository: run.source.repositoryUrl as string,
        sourceTreeSha: run.source.commitTreeSha as string,
        buildSha256: run.source.build.sha256 as string as Br04Sha256,
        dirty,
        fixtureContractId: run.source.fixture.id as string,
        fixtureContractVersion: run.source.fixture.version as number,
        fixtureDigest,
      },
      environmentCellId: run.hardwareCellId as string,
      browserProcessId: run.browserProcessId as string,
      candidateId: run.execution.order.candidateId as string,
      phase: run.execution.phase as string as Br04Phase,
      scenarioId: unit.scenarioId as string,
      scenarioVersion: 1,
      workloadSeed: scenarioSeedV1(unit, planCore.orderSeed as number),
      environmentFingerprint: sha256OfCanonicalV1(run.environment),
      measurementEligible: run.measurementEligible,
      declaredDisposition,
      declaredReasonCode,
      declaredRuleId,
      capabilities,
      iterations: projectedIterations,
    },
  };
  return { envelope, fatal: null };
}

export function crosswalkToBundleV1(input: Br04CrosswalkInputV1): Br04CrosswalkResultV1 {
  const issues: Br04ContractIssueV1[] = [];
  const fatal = (code: string, message: string, jsonPointer: string): Br04CrosswalkResultV1 => ({
    bundle: null,
    issues: [...issues, { severity: 'error', code, jsonPointer, message, runId: null, slotId: null, sourceDigest: null }],
  });
  if (!isCommitShaV1(input.acceptedBr03Sha)) {
    return fatal('ACCEPTED_BR03_SHA_INVALID', 'acceptedBr03Sha is not a 40-character lowercase hex SHA.', '/sourceContract/acceptedBr03Sha');
  }
  const registry = input.registry ?? BENCHMARK_METRIC_REGISTRY_V1;
  const metricByRef = new Map<string, Br04MetricDefinitionV1>();
  const projectedRegistry: Br04MetricDefinitionV1[] = [];
  for (const frozen of registry.metrics) {
    const { definition, skippedUnit } = projectMetricDefinitionV1(frozen);
    if (definition === null) {
      if (!skippedUnit) {
        return fatal('REGISTRY_METRIC_REF_INVALID', `Registry metricRef ${frozen.metricRef as string} is not projectable.`, '/metricRegistry');
      }
      issues.push({
        severity: 'warning', code: 'METRIC_NOT_AGGREGATABLE_V1', jsonPointer: '/metricRegistry',
        message: `Registry metric ${frozen.metricRef as string} uses a non-BR04 unit and is not aggregated; it stays BR01-owned.`,
        runId: null, slotId: null, sourceDigest: null,
      });
      continue;
    }
    const ref = `${definition.metricId}@${definition.metricVersion}` as Br04MetricRef;
    if (metricByRef.has(ref)) {
      return fatal('REGISTRY_DUPLICATE_METRIC', `Registry duplicates metric ${ref}.`, '/metricRegistry');
    }
    metricByRef.set(ref, definition);
    projectedRegistry.push(definition);
  }
  projectedRegistry.sort((left, right) =>
    left.metricId < right.metricId ? -1 : left.metricId > right.metricId ? 1 : left.metricVersion - right.metricVersion,
  );
  const planDigest = input.plan.runPlanSha256 as string as Br04Sha256;
  if (!isSha256V1(planDigest)) {
    return fatal('PLAN_DIGEST_INVALID', 'BR03 plan digest is not a sha256 digest.', '/runPlan/planDigest');
  }
  const unitBySlot = new Map<string, RunPlanProcessUnitV1>();
  for (const unit of input.plan.core.processUnits) {
    const slotId = unit.ids.slotId as string;
    if (unitBySlot.has(slotId)) {
      return fatal('PLAN_DUPLICATE_SLOT', `Plan duplicates slot ${slotId}.`, '/runPlan/slots');
    }
    unitBySlot.set(slotId, unit);
  }
  let sourceContract: Br04CrosswalkSourceContractV1 | null = null;
  for (const entry of input.runs) {
    const candidate: Br04CrosswalkSourceContractV1 = {
      br01SchemaId: entry.receipt.schemaVersion,
      br01SchemaDigest: entry.receipt.schemaSetSha256 as string as Br04Sha256,
      br01ValidatorId: entry.receipt.validator.id,
      br01ValidatorDigest: entry.receipt.validator.sourceFileSetSha256 as string as Br04Sha256,
    };
    if (sourceContract === null) sourceContract = candidate;
    else if (
      sourceContract.br01SchemaId !== candidate.br01SchemaId
      || sourceContract.br01SchemaDigest !== candidate.br01SchemaDigest
      || sourceContract.br01ValidatorId !== candidate.br01ValidatorId
      || sourceContract.br01ValidatorDigest !== candidate.br01ValidatorDigest
    ) {
      return fatal('SOURCE_CONTRACT_CONFLICT', 'Receipts disagree on the BR01 schema/validator contract.', '/sourceContract');
    }
  }
  if (sourceContract === null) {
    return fatal('NO_RUNS_OBSERVED', 'Crosswalk input carries no runs; the source contract cannot be bound.', '/runs');
  }
  const envelopes: Br04ValidatedRunEnvelopeV1[] = [];
  const invalidationRegistry = input.invalidationRegistry ?? [];
  const projectedRegistryDigest = sha256OfCanonicalV1(projectedRegistry);
  for (const entry of input.runs) {
    const { envelope, fatal: runFatal } = projectRunV1(
      entry, unitBySlot, input.plan.core, planDigest, registry.metricRegistrySha256 as string as Br04Sha256,
      projectedRegistryDigest, metricByRef, sourceContract, invalidationRegistry,
    );
    if (runFatal !== null) {
      return { bundle: null, issues: [...issues, runFatal] };
    }
    envelopes.push(envelope);
  }
  const runBySlot = new Map<string, Br04ValidatedRunEnvelopeV1>();
  for (const envelope of envelopes) runBySlot.set(envelope.slotId, envelope);
  const slots: Br04PlannedRunSlotV1[] = [];
  for (const unit of input.plan.core.processUnits) {
    const slotId = unit.ids.slotId as string;
    const observed = runBySlot.get(slotId);
    slots.push({
      slotId,
      bootstrapClusterId: unit.ids.bootstrapClusterId as string,
      balanceBlockId: unit.balanceBlockId as string,
      pairCellId: unit.ids.pairCellId as string,
      pairOrdinal: unit.ids.pairOrdinal as number,
      candidateId: unit.candidateId as string,
      referenceCandidateId: input.plan.core.referenceCandidateId as string | null,
      environmentCellId: observed !== undefined ? observed.run.environmentCellId : `unobserved:${slotId}`,
      scenarioId: unit.scenarioId as string,
      scenarioVersion: 1,
      phase: observed !== undefined ? observed.run.phase : missingSlotPhaseV1(unit),
      workloadSeed: scenarioSeedV1(unit, input.plan.core.orderSeed as number),
      requiredCapabilities: [],
    });
  }
  slots.sort((left, right) => left.slotId < right.slotId ? -1 : left.slotId > right.slotId ? 1 : 0);
  envelopes.sort((left, right) =>
    left.slotId < right.slotId ? -1 : left.slotId > right.slotId ? 1
      : left.runId < right.runId ? -1 : left.runId > right.runId ? 1
        : left.rawByteDigest < right.rawByteDigest ? -1 : 1,
  );
  const policy = input.bootstrapPolicy;
  if (!/^[0-9a-f]{64}$/.test(policy.masterSeedHex)) {
    return fatal('MASTER_SEED_INVALID', 'bootstrapPolicy.masterSeedHex is not 64 lowercase hex.', '/bootstrapPolicy/masterSeedHex');
  }
  if (
    policy.method !== 'hierarchical-percentile-v1'
    || policy.confidenceLevel !== BR04_BOOTSTRAP_CONFIDENCE_V1
    || policy.resamples !== BR04_BOOTSTRAP_RESAMPLES_V1
    || policy.minimumTopLevelClusters !== BR04_MINIMUM_TOP_LEVEL_CLUSTERS_V1
    || policy.seedDerivation !== 'sha256-bound-xoshiro128ss-v1'
    || policy.prng !== 'xoshiro128**-32-v1'
    || policy.indexSampling !== 'uint32-rejection-v1'
  ) {
    return fatal('BOOTSTRAP_POLICY_INVALID', 'bootstrapPolicy deviates from the versioned BR04 statistics policy.', '/bootstrapPolicy');
  }
  const body = {
    schemaVersion: 1 as const,
    contractVersion: 'br04-aggregate-input-v1' as const,
    bundleId: input.bundleId,
    reportAsOfUtc: input.reportAsOfUtc,
    sourceContract: {
      repository: 'BenjaminHornung/hestia-voxel-kernel-lab' as const,
      acceptedBr03Sha: input.acceptedBr03Sha,
      br01SchemaId: sourceContract.br01SchemaId,
      br01SchemaDigest: sourceContract.br01SchemaDigest,
      br01ValidatorId: sourceContract.br01ValidatorId,
      br01ValidatorDigest: sourceContract.br01ValidatorDigest,
    },
    runPlan: {
      planId: input.plan.runPlanId as string,
      planVersion: 1,
      planDigest,
      acceptedBr03Sha: input.acceptedBr03Sha,
      comparisonMode: input.plan.core.comparisonMode,
      slots,
      invalidationRegistry: [...invalidationRegistry],
      syntheticHardwareProfile: input.plan.core.syntheticHardwareProfile,
    },
    metricRegistry: projectedRegistry,
    bootstrapPolicy: policy,
    runs: envelopes,
  };
  const normalizedInputDigest = sha256OfCanonicalV1(body);
  const orderedRawRunDigests = envelopes.map((envelope) => envelope.rawByteDigest).sort();
  const manifestDigest = sha256OfCanonicalV1({ orderedRawRunDigests, normalizedInputDigest });
  return {
    bundle: {
      ...body,
      manifest: { orderedRawRunDigests, normalizedInputDigest, manifestDigest },
    },
    issues,
  };
}

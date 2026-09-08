/**
 * BR04 aggregate builder (v1): fail-closed bundle validation, exact
 * hierarchy grouping, process-cluster bootstrap CIs, explicit paired
 * evaluation, neutral population qualification, capability coverage,
 * run ledger, claim trace, and deterministic digests.
 *
 * Hierarchy contract (report section 5, BR_SERIES_CONTRACT section 5):
 * hardware/browser cell -> browser process -> run -> iteration -> event.
 * Cells are never merged. Iterations and events of one process never count
 * as independent clusters. Warmup never enters a measurement population.
 *
 * Pairing contract (packet crosswalk kern): paired evaluation only inside
 * (balanceBlockId, pairCellId, pairOrdinal) with reference and comparison
 * arms together; bootstrapClusterId is never a pairing criterion. The
 * paired bootstrap resamples balance blocks first, then complete pair
 * cells. Absolute CIs resample browser-process clusters first, then runs.
 *
 * Population qualification (BR_SERIES_CONTRACT section 11): <3 processes
 * below-technical-floor; 3-4 technical-only; >=5 plus contract minima
 * standard-cell (>=30 measurement iterations for measurement cells,
 * >=10 fresh processes for cold cells).
 *
 * v1 interpretations (documented in docs/benchmark/aggregator-v1.md):
 * - M-01: missing slots are ledger rows with runId null and base
 *   disposition trace-only (visible for diagnosis, never gate-numeric).
 * - PD-01: ledger pair disposition is run-level (complete if the run sits
 *   in a complete pair cell for at least one metric).
 * - C-01: capability plannedRuns counts observed runs plus missing slots
 *   with the same candidate and phase.
 * - S-01: pair cells sort by (balanceBlockId, pairOrdinal, pairCellId).
 * - R-01: the ratio geomean uses strictly positive pair ratios; zero
 *   ratios stay listed in pairValues but cannot enter a geometric mean.
 */
import {
  BR04_COLD_CELL_PROCESSES_V1,
  BR04_STANDARD_CELL_MEASUREMENT_ITERATIONS_V1,
  BR04_STANDARD_CELL_PROCESSES_V1,
  type Br04AggregateInputBundleV1,
  type Br04AggregateValidationResultV1,
  type Br04BenchmarkAggregateV1,
  type Br04BootstrapIntervalV1,
  type Br04CapabilityCoverageV1,
  type Br04ClaimTraceV1,
  type Br04ContractIssueV1,
  type Br04EnvironmentCellAggregateV1,
  type Br04IncompletePairV1,
  type Br04InvalidRunEntryV1,
  type Br04InvalidRunSummaryV1,
  type Br04MetricCellV1,
  type Br04MetricDefinitionV1,
  type Br04MetricRef,
  type Br04PairedComparisonV1,
  type Br04PairValueV1,
  type Br04PerRunMetricSummaryV1,
  type Br04Phase,
  type Br04PlannedRunSlotV1,
  type Br04PopulationQualificationV1,
  type Br04QuantileResultV1,
  type Br04RunDispositionV1,
  type Br04RunLedgerEntryV1,
  type Br04RunProjectionV1,
  type Br04Sha256,
  type Br04ValidatedRunEnvelopeV1,
  BR04_AGGREGATOR_VERSION_V1,
  BR04_BOOTSTRAP_CONFIDENCE_V1,
  BR04_BOOTSTRAP_RESAMPLES_V1,
  BR04_MINIMUM_TOP_LEVEL_CLUSTERS_V1,
} from './br04ContractV1';
import {
  bootstrapAbsoluteV1,
  bootstrapPairedV1,
  cellEstimatorV1,
  checkDomainV1,
  derivePrngSeedV1,
  maximumOfV1,
  perRunScalarV1,
  practicalEffectV1,
  quantileResultV1,
  sha256OfCanonicalV1,
  type Br04AbsoluteClusterInputV1,
  type Br04PairedClusterInputV1,
} from './br04StatisticsV1';

export interface Br04AggregateResultV1 {
  readonly validation: Br04AggregateValidationResultV1;
  readonly aggregate: Br04BenchmarkAggregateV1 | null;
}

interface Br04EligibleRunV1 {
  readonly envelope: Br04ValidatedRunEnvelopeV1;
  readonly slot: Br04PlannedRunSlotV1;
  readonly metricEligibility: Readonly<Record<Br04MetricRef, Br04RunDispositionV1>>;
}

type Br04MutableLedgerRowV1 = {
  -readonly [K in keyof Br04RunLedgerEntryV1]: Br04RunLedgerEntryV1[K];
};

function isSha256V1(value: string): value is Br04Sha256 {
  return /^sha256:[0-9a-f]{64}$/.test(value);
}

function metricEligibilityForV1(
  run: Br04RunProjectionV1,
  metric: Br04MetricDefinitionV1,
): Br04RunDispositionV1 {
  const base = run.declaredDisposition;
  if (base === 'source-dirty') return 'source-dirty';
  if (base === 'provenance-mismatch') return 'provenance-mismatch';
  if (base === 'candidate-failure') return 'candidate-failure';
  if (base === 'trace-only') return 'trace-only';
  if (base === 'infrastructure-invalid') {
    if (run.declaredReasonCode === 'gpu-disjoint' && metric.metricId === 'gpu.time.ms' && metric.metricVersion === 1) {
      return 'infrastructure-invalid';
    }
    if (run.declaredReasonCode === 'gpu-disjoint') return 'valid';
    return 'infrastructure-invalid';
  }
  if (base === 'capability-unsupported') {
    const missing = metric.capabilityRequirement.filter(
      (required) => run.capabilities[required] !== 'supported',
    );
    return missing.length === 0 ? 'valid' : 'capability-unsupported';
  }
  if (!run.measurementEligible) return 'trace-only';
  if (!metric.allowedPhases.includes(run.phase)) return 'trace-only';
  const missingCapability = metric.capabilityRequirement.filter(
    (required) => run.capabilities[required] !== 'supported',
  );
  if (missingCapability.length > 0) return 'capability-unsupported';
  return 'valid';
}

function armOfV1(slot: Br04PlannedRunSlotV1, mode: 'reference-paired' | 'unpaired-only'): 'reference' | 'comparison' | 'unpaired' {
  if (mode === 'unpaired-only') return 'unpaired';
  if (slot.referenceCandidateId !== null && slot.candidateId === slot.referenceCandidateId) return 'reference';
  return 'comparison';
}

/** Canonical digest over the normalized bundle body (everything but the manifest). */
export function canonicalBundleBodyDigestV1(bundle: Omit<Br04AggregateInputBundleV1, 'manifest'>): Br04Sha256 {
  const runs = [...bundle.runs].sort((left, right) =>
    left.slotId < right.slotId ? -1 : left.slotId > right.slotId ? 1
      : left.runId < right.runId ? -1 : left.runId > right.runId ? 1
        : left.rawByteDigest < right.rawByteDigest ? -1 : 1,
  );
  const slots = [...bundle.runPlan.slots].sort((left, right) =>
    left.slotId < right.slotId ? -1 : 1,
  );
  const metrics = [...bundle.metricRegistry].sort((left, right) =>
    left.metricId < right.metricId ? -1 : left.metricId > right.metricId ? 1
      : left.metricVersion - right.metricVersion,
  );
  return sha256OfCanonicalV1({
    schemaVersion: bundle.schemaVersion,
    contractVersion: bundle.contractVersion,
    bundleId: bundle.bundleId,
    reportAsOfUtc: bundle.reportAsOfUtc,
    sourceContract: bundle.sourceContract,
    runPlan: { ...bundle.runPlan, slots },
    metricRegistry: metrics,
    bootstrapPolicy: bundle.bootstrapPolicy,
    runs,
  });
}

export function validateAndAggregateBundleV1(bundle: Br04AggregateInputBundleV1): Br04AggregateResultV1 {  const issues: Br04ContractIssueV1[] = [];
  const error = (
    code: string, message: string, jsonPointer: string,
    runId: string | null = null, slotId: string | null = null, sourceDigest: Br04Sha256 | null = null,
  ): void => {
    issues.push({ severity: 'error', code, jsonPointer, message, runId, slotId, sourceDigest });
  };
  if (bundle.schemaVersion !== 1) error('SCHEMA_VERSION_INVALID', 'Bundle schemaVersion must be 1.', '/schemaVersion');
  if (bundle.contractVersion !== 'br04-aggregate-input-v1') {
    error('CONTRACT_VERSION_INVALID', 'Bundle contractVersion must be br04-aggregate-input-v1.', '/contractVersion');
  }
  if (!/^[0-9a-f]{40}$/.test(bundle.sourceContract.acceptedBr03Sha)) {
    error('ACCEPTED_BR03_SHA_INVALID', 'acceptedBr03Sha is not a 40-character lowercase hex SHA.', '/sourceContract/acceptedBr03Sha');
  }
  if (!/^[0-9a-f]{64}$/.test(bundle.bootstrapPolicy.masterSeedHex)) {
    error('MASTER_SEED_INVALID', 'bootstrapPolicy.masterSeedHex is not 64 lowercase hex.', '/bootstrapPolicy/masterSeedHex');
  }
  /**
   * R3/B3-Rest: the public boundary enforces the same versioned statistics
   * policy as the crosswalk, so a hand-built bundle cannot smuggle in a
   * weakened bootstrap (e.g. resamples=7).
   */
  if (
    bundle.bootstrapPolicy.method !== 'hierarchical-percentile-v1'
    || bundle.bootstrapPolicy.confidenceLevel !== BR04_BOOTSTRAP_CONFIDENCE_V1
    || bundle.bootstrapPolicy.resamples !== BR04_BOOTSTRAP_RESAMPLES_V1
    || bundle.bootstrapPolicy.minimumTopLevelClusters !== BR04_MINIMUM_TOP_LEVEL_CLUSTERS_V1
    || bundle.bootstrapPolicy.seedDerivation !== 'sha256-bound-xoshiro128ss-v1'
    || bundle.bootstrapPolicy.prng !== 'xoshiro128**-32-v1'
    || bundle.bootstrapPolicy.indexSampling !== 'uint32-rejection-v1'
  ) {
    error('BOOTSTRAP_POLICY_INVALID', 'bootstrapPolicy deviates from the versioned BR04 statistics policy.', '/bootstrapPolicy');
  }
  if (bundle.sourceContract.acceptedBr03Sha !== bundle.runPlan.acceptedBr03Sha) {
    error('SOURCE_CONTRACT_CONFLICT', 'sourceContract acceptedBr03Sha disagrees with the run plan.', '/sourceContract/acceptedBr03Sha');
  }
  if (bundle.runPlan.slots.length === 0) error('NO_PLANNED_SLOTS', 'Run plan carries no slots.', '/runPlan/slots');
  if (bundle.metricRegistry.length === 0) error('EMPTY_METRIC_REGISTRY', 'Metric registry is empty.', '/metricRegistry');
  const metricByRef = new Map<Br04MetricRef, Br04MetricDefinitionV1>();
  for (const metric of bundle.metricRegistry) {
    const ref = `${metric.metricId}@${metric.metricVersion}` as Br04MetricRef;
    if (metric.automaticDecision !== 'forbidden') {
      error('AUTOMATIC_DECISION_FORBIDDEN', `Metric ${ref} allows automatic decisions.`, '/metricRegistry');
    }
    if (metricByRef.has(ref)) error('REGISTRY_DUPLICATE_METRIC', `Registry duplicates metric ${ref}.`, '/metricRegistry');
    metricByRef.set(ref, metric);
  }
  const slotById = new Map<string, Br04PlannedRunSlotV1>();
  for (const slot of bundle.runPlan.slots) {
    if (slotById.has(slot.slotId)) error('PLAN_DUPLICATE_SLOT', `Plan duplicates slot ${slot.slotId}.`, '/runPlan/slots');
    slotById.set(slot.slotId, slot);
  }
  const seenRunIds = new Set<string>();
  const seenSlots = new Set<string>();
  let duplicateRuns = 0;
  let validReceipts = 0;
  for (const envelope of bundle.runs) {
    if (slotById.get(envelope.slotId) === undefined) {
      error('UNKNOWN_SLOT', `Run ${envelope.runId} references unknown slot ${envelope.slotId}.`, '/runs', envelope.runId, envelope.slotId, envelope.rawByteDigest);
    }
    if (seenRunIds.has(envelope.runId)) {
      duplicateRuns += 1;
      error('DUPLICATE_RUN_ID', `Duplicate runId ${envelope.runId}; both digests retained, no first/last wins.`, '/runs', envelope.runId, envelope.slotId, envelope.rawByteDigest);
    }
    seenRunIds.add(envelope.runId);
    if (seenSlots.has(envelope.slotId)) {
      error('DUPLICATE_SLOT_OCCUPANCY', `Slot ${envelope.slotId} is occupied twice.`, '/runs', envelope.runId, envelope.slotId, envelope.rawByteDigest);
    }
    seenSlots.add(envelope.slotId);
    const receipt = envelope.br01ValidationReceipt;
    if (receipt.status !== 'schema-and-integrity-valid') {
      error('RECEIPT_STATUS_INVALID', 'Receipt status is not schema-and-integrity-valid.', '/runs', envelope.runId, envelope.slotId, envelope.rawByteDigest);
    }
    if (receipt.validatedRawByteDigest !== envelope.rawByteDigest) {
      error('RECEIPT_DIGEST_MISMATCH', 'Receipt raw-byte digest mismatches the run.', '/runs', envelope.runId, envelope.slotId, envelope.rawByteDigest);
    } else if (receipt.validatedCanonicalContentDigest !== envelope.canonicalContentDigest) {
      error('RECEIPT_DIGEST_MISMATCH', 'Receipt canonical-content digest mismatches the run.', '/runs', envelope.runId, envelope.slotId, envelope.rawByteDigest);
    } else if (receipt.planDigest !== bundle.runPlan.planDigest) {
      error('PLAN_DIGEST_MISMATCH', 'Receipt plan digest mismatches the bundle run plan.', '/runs', envelope.runId, envelope.slotId, envelope.rawByteDigest);
    } else if (receipt.status === 'schema-and-integrity-valid') {
      validReceipts += 1;
    }
    if (!isSha256V1(envelope.rawByteDigest) || !isSha256V1(envelope.canonicalContentDigest)) {
      error('RUN_DIGEST_INVALID', 'Run digests are not sha256 digests.', '/runs', envelope.runId, envelope.slotId, null);
    }
    if (!['cold', 'warmup', 'measurement', 'stress', 'trace', 'leak'].includes(envelope.run.phase)) {
      error('ILLEGAL_PHASE', 'Run phase is not a known sample phase.', '/runs', envelope.runId, envelope.slotId, envelope.rawByteDigest);
    }
    /**
     * R3/B3-Rest: receipt-to-source-contract binding and run-to-slot
     * binding at the public boundary. A wrong validator digest, a
     * dirty source projected as valid, or a candidate that disagrees
     * with its plan slot is refused instead of aggregated.
     */
    if (receipt.validatorId !== bundle.sourceContract.br01ValidatorId) {
      error('VALIDATOR_MISMATCH', 'Receipt validator disagrees with the bundle source contract.', '/runs', envelope.runId, envelope.slotId, envelope.rawByteDigest);
    }
    if (receipt.validatorDigest !== bundle.sourceContract.br01ValidatorDigest) {
      error('VALIDATOR_DIGEST_MISMATCH', 'Receipt validator digest disagrees with the bundle source contract.', '/runs', envelope.runId, envelope.slotId, envelope.rawByteDigest);
    }
    if (envelope.run.source.dirty && envelope.run.declaredDisposition === 'valid') {
      error('SOURCE_DIRTY_MISMATCH', 'Run source is dirty but projected as valid.', '/runs', envelope.runId, envelope.slotId, envelope.rawByteDigest);
    }
    const plannedSlot = slotById.get(envelope.slotId);
    if (plannedSlot !== undefined && envelope.run.candidateId !== plannedSlot.candidateId) {
      error('SLOT_CANDIDATE_MISMATCH', 'Run candidate disagrees with its plan slot.', '/runs', envelope.runId, envelope.slotId, envelope.rawByteDigest);
    }
    if (envelope.run.declaredDisposition === 'infrastructure-invalid') {
      const rule = envelope.run.declaredRuleId === null
        ? undefined
        : bundle.runPlan.invalidationRegistry.find((candidate) => candidate.ruleId === envelope.run.declaredRuleId);
      if (rule === undefined || rule.candidateIndependent !== true) {
        error('UNDECLARED_INVALIDATION_CODE', 'Infrastructure disposition has no matching predeclared plan rule.', '/runs', envelope.runId, envelope.slotId, envelope.rawByteDigest);
      }
    }
    for (const iteration of envelope.run.iterations) {
      for (const sample of iteration.samples) {
        if (Number.isNaN(sample.value) || !Number.isFinite(sample.value)) {
          error('NON_FINITE_NUMBER', 'Sample value is NaN or infinite.', '/runs', envelope.runId, envelope.slotId, envelope.rawByteDigest);
        } else if (Object.is(sample.value, -0)) {
          error('NEGATIVE_ZERO_FORBIDDEN', 'Sample value is negative zero.', '/runs', envelope.runId, envelope.slotId, envelope.rawByteDigest);
        }
        const metric = metricByRef.get(sample.metricRef);
        if (metric === undefined) {
          error('UNKNOWN_METRIC_REF', `Sample references unknown metric ${sample.metricRef}.`, '/runs', envelope.runId, envelope.slotId, envelope.rawByteDigest);
        } else if (sample.unit !== metric.unit) {
          error('METRIC_UNIT_MISMATCH', `Sample unit mismatches the registry for ${sample.metricRef}; no conversion.`, '/runs', envelope.runId, envelope.slotId, envelope.rawByteDigest);
        } else if (sample.valid) {
          for (const required of metric.requiredTags) {
            if (sample.tags[required] === undefined || sample.tags[required] === null) {
              error('REQUIRED_TAG_MISSING', `Valid sample for ${sample.metricRef} misses required tag ${required}.`, '/runs', envelope.runId, envelope.slotId, envelope.rawByteDigest);
            }
          }
          const domainViolation = checkDomainV1(metric.numericDomain, sample.value);
          if (domainViolation !== null) {
            error(domainViolation, `Valid sample violates ${metric.numericDomain} for ${sample.metricRef}.`, '/runs', envelope.runId, envelope.slotId, envelope.rawByteDigest);
          }
        }
      }
    }
  }
  let recomputed: Br04Sha256 | null = null;
  try {
    recomputed = canonicalBundleBodyDigestV1(bundle);
  } catch {
    error('CANONICAL_SERIALIZATION_FAILED', 'Bundle body is not canonical JSON (non-finite, negative zero, or unsafe value).', '/manifest/normalizedInputDigest');
  }
  if (recomputed !== null && recomputed !== bundle.manifest.normalizedInputDigest) {
    error('NORMALIZED_INPUT_DIGEST_MISMATCH', 'Manifest normalized input digest does not match the bundle body.', '/manifest/normalizedInputDigest');
  }
  const orderedRaw = bundle.runs.map((envelope) => envelope.rawByteDigest).sort();
  if (orderedRaw.join(',') !== [...bundle.manifest.orderedRawRunDigests].sort().join(',')) {
    error('MANIFEST_RUN_DIGESTS_MISMATCH', 'Manifest raw run digests do not match the observed runs.', '/manifest/orderedRawRunDigests');
  }
  /**
   * R3/B3-Rest: the manifest digest itself is recomputed and bound, so a
   * hand-built bundle cannot carry a foreign manifestDigest over otherwise
   * consistent contents.
   */
  const recomputedManifest = sha256OfCanonicalV1({
    orderedRawRunDigests: [...bundle.manifest.orderedRawRunDigests].sort(),
    normalizedInputDigest: bundle.manifest.normalizedInputDigest,
  });
  if (recomputedManifest !== bundle.manifest.manifestDigest) {
    error('MANIFEST_DIGEST_MISMATCH', 'Manifest digest does not match the manifest contents.', '/manifest/manifestDigest');
  }
  const metricRegistryDigest = sha256OfCanonicalV1(bundle.metricRegistry);
  for (const envelope of bundle.runs) {
    if (envelope.br01ValidationReceipt.metricRegistryDigest !== metricRegistryDigest) {
      error('REGISTRY_DIGEST_MISMATCH', 'Receipt metric-registry digest mismatches the bundle registry.', '/runs', envelope.runId, envelope.slotId, envelope.rawByteDigest);
    }
  }
  const fatalErrors = issues.filter((issue) => issue.severity === 'error').length;
  const eligible: Br04EligibleRunV1[] = [];
  const ledger: Br04MutableLedgerRowV1[] = [];
  const missingSlots: string[] = [];
  const slotDigestById = new Map<string, Br04Sha256>();
  for (const slot of bundle.runPlan.slots) {
    slotDigestById.set(slot.slotId, sha256OfCanonicalV1(slot));
  }
  const envelopeBySlot = new Map<string, Br04ValidatedRunEnvelopeV1>();
  for (const envelope of bundle.runs) {
    if (!envelopeBySlot.has(envelope.slotId)) envelopeBySlot.set(envelope.slotId, envelope);
  }
  const accountedEnvelopes = new Set<Br04ValidatedRunEnvelopeV1>();
  for (const slot of bundle.runPlan.slots) {
    const envelope = envelopeBySlot.get(slot.slotId);
    if (envelope === undefined) {
      missingSlots.push(slot.slotId);
      const metricEligibility: Record<Br04MetricRef, Br04RunDispositionV1> = {};
      ledger.push({
        runId: null, slotId: slot.slotId, rawByteDigest: null,
        baseDisposition: 'trace-only', pairDisposition: 'not-applicable',
        reasonCodes: ['missing-slot'], metricEligibility,
      });
      continue;
    }
    accountedEnvelopes.add(envelope);
    const metricEligibility = {} as Record<Br04MetricRef, Br04RunDispositionV1>;
    for (const metric of bundle.metricRegistry) {
      const ref = `${metric.metricId}@${metric.metricVersion}` as Br04MetricRef;
      metricEligibility[ref] = metricEligibilityForV1(envelope.run, metric);
    }
    eligible.push({ envelope, slot, metricEligibility });
    const reasonCodes: string[] = [];
    if (envelope.run.declaredReasonCode !== null) reasonCodes.push(envelope.run.declaredReasonCode);
    if (!envelope.run.measurementEligible && envelope.run.declaredDisposition === 'valid') {
      reasonCodes.push('measurement-ineligible');
    }
    ledger.push({
      runId: envelope.runId, slotId: slot.slotId, rawByteDigest: envelope.rawByteDigest,
      baseDisposition: envelope.run.declaredDisposition, pairDisposition: 'not-applicable',
      reasonCodes, metricEligibility,
    });
  }
  for (const envelope of bundle.runs) {
    if (accountedEnvelopes.has(envelope)) continue;
    accountedEnvelopes.add(envelope);
    const metricEligibility = {} as Record<Br04MetricRef, Br04RunDispositionV1>;
    for (const metric of bundle.metricRegistry) {
      const ref = `${metric.metricId}@${metric.metricVersion}` as Br04MetricRef;
      metricEligibility[ref] = metricEligibilityForV1(envelope.run, metric);
    }
    ledger.push({
      runId: envelope.runId, slotId: envelope.slotId, rawByteDigest: envelope.rawByteDigest,
      baseDisposition: envelope.run.declaredDisposition, pairDisposition: 'not-applicable',
      reasonCodes: [...(envelope.run.declaredReasonCode !== null ? [envelope.run.declaredReasonCode] : []), 'unaccounted-envelope'],
      metricEligibility,
    });
  }
  ledger.sort((left, right) => left.slotId < right.slotId ? -1 : left.slotId > right.slotId ? 1 : 0);
  missingSlots.sort();
  const validation: Br04AggregateValidationResultV1 = {
    schemaVersion: 1,
    status: fatalErrors === 0 ? 'valid' : 'invalid',
    normalizedInputDigest: fatalErrors === 0 ? bundle.manifest.normalizedInputDigest : null,
    issues,
    counts: {
      plannedSlots: bundle.runPlan.slots.length,
      observedRuns: bundle.runs.length,
      duplicateRuns,
      missingSlots: missingSlots.length,
      validReceipts,
      fatalErrors,
    },
    runLedger: ledger,
  };
  if (fatalErrors > 0) return { validation, aggregate: null };
  const aggregate = buildAggregateV1(bundle, eligible, ledger, missingSlots, slotDigestById, metricRegistryDigest, validation);
  return { validation, aggregate };
}

interface Br04RunMetricDataV1 {
  readonly metric: Br04MetricDefinitionV1;
  readonly ref: Br04MetricRef;
  readonly populationLabel: string;
  readonly runs: {
    readonly eligible: Br04EligibleRunV1;
    readonly values: readonly number[];
    readonly iterations: readonly (readonly number[])[];
    readonly runDigest: Br04Sha256;
    readonly partitionKey: string | null;
  }[];
}

/**
 * Compatibility boundaries already covered by the cell coordinates
 * themselves (report section 6.1); every other metric group tag splits
 * the population by its observed sample-tag values (R2/B2).
 */
const BR04_CELL_COVERED_GROUP_TAGS_V1: ReadonlySet<string> = new Set([
  'hardware-profile', 'hardwareProfile', 'phase', 'candidate',
]);

function extraGroupTagsV1(metric: Br04MetricDefinitionV1): string[] {
  return metric.groupByTags.filter((tag) => !BR04_CELL_COVERED_GROUP_TAGS_V1.has(tag)).sort();
}

function tagSignatureV1(
  extraTags: readonly string[],
  samples: readonly { readonly tags: Readonly<Record<string, string | number | boolean | null>> }[],
): string {
  if (extraTags.length === 0) return '';
  const parts: string[] = [];
  for (const tag of extraTags) {
    const distinct = [...new Set(samples.map((sample) => JSON.stringify(sample.tags[tag] ?? null)))].sort();
    parts.push(`${tag}=${distinct.join(',')}`);
  }
  return parts.join(';');
}

/**
 * R3/B2-Rest: full metric tag-tuple key of one sample. Samples of one run
 * that differ in any tag (memory kinds, checkpoints, other tags) belong to
 * different populations, even when they share run and iteration.
 */
function tagPartitionKeyV1(tags: Readonly<Record<string, string | number | boolean | null>>): string {
  return Object.keys(tags).sort().map((key) => `${key}=${JSON.stringify(tags[key] ?? null)}`).join(';');
}

/**
 * R3/B6-Folgen: readable population identity for cells and comparisons.
 * Scenario, workload seed, and the observed tag tuple name the population;
 * the fingerprint digest remains the machine identity.
 */
export function populationLabelV1(
  scenarioId: string,
  scenarioVersion: number,
  workloadSeed: number,
  tagSignature: string,
): string {
  return `scenario=${scenarioId}@v${scenarioVersion} seed=${workloadSeed} tags=${tagSignature === '' ? '-' : tagSignature}`;
}

export interface Br04CompatibilityKeyV1 {
  readonly key: string;
  readonly tagSignature: string;
}

export function compatibilityKeyV1(
  envelope: Br04ValidatedRunEnvelopeV1,
  tagSignature: string,
): Br04CompatibilityKeyV1 {
  const run = envelope.run;
  const key = [
    run.environmentCellId, run.phase, run.candidateId,
    run.scenarioId, String(run.scenarioVersion), String(run.workloadSeed),
    run.source.sourceTreeSha, run.source.buildSha256, run.source.fixtureDigest,
    run.environmentFingerprint, tagSignature,
  ].join('\0');
  return { key, tagSignature };
}

function fingerprintForKeyV1(envelope: Br04ValidatedRunEnvelopeV1, tagSignature: string): Br04Sha256 {
  const run = envelope.run;
  return sha256OfCanonicalV1({
    environmentCellId: run.environmentCellId,
    phase: run.phase,
    candidateId: run.candidateId,
    scenarioId: run.scenarioId,
    scenarioVersion: run.scenarioVersion,
    workloadSeed: run.workloadSeed,
    sourceTreeSha: run.source.sourceTreeSha,
    buildSha256: run.source.buildSha256,
    fixtureDigest: run.source.fixtureDigest,
    environmentFingerprint: run.environmentFingerprint,
    tagSignature,
  });
}

function groupCellDataV1(
  eligible: readonly Br04EligibleRunV1[],
  metrics: readonly Br04MetricDefinitionV1[],
): Map<string, { environmentCellId: string; phase: Br04Phase; candidateId: string; compatKey: string; fingerprint: Br04Sha256; metrics: Map<Br04MetricRef, Br04RunMetricDataV1> }> {
  const cells = new Map<string, { environmentCellId: string; phase: Br04Phase; candidateId: string; compatKey: string; fingerprint: Br04Sha256; metrics: Map<Br04MetricRef, Br04RunMetricDataV1> }>();
  for (const metric of metrics) {
    const ref = `${metric.metricId}@${metric.metricVersion}` as Br04MetricRef;
    const extraTags = extraGroupTagsV1(metric);
    for (const item of eligible) {
      if (item.metricEligibility[ref] !== 'valid') continue;
      const partitions = new Map<string, { values: number[]; iterations: number[][]; samples: { readonly tags: Readonly<Record<string, string | number | boolean | null>> }[] }>();
      for (const iteration of item.envelope.run.iterations) {
        const perPartition = new Map<string, number[]>();
        for (const sample of iteration.samples) {
          if (sample.metricRef !== ref || !sample.valid) continue;
          if (!metric.allowedPhases.includes(item.envelope.run.phase)) continue;
          const partitionKey = tagPartitionKeyV1(sample.tags);
          let entry = partitions.get(partitionKey);
          if (entry === undefined) {
            entry = { values: [], iterations: [], samples: [] };
            partitions.set(partitionKey, entry);
          }
          entry.values.push(sample.value);
          entry.samples.push(sample);
          let iterationValues = perPartition.get(partitionKey);
          if (iterationValues === undefined) {
            iterationValues = [];
            perPartition.set(partitionKey, iterationValues);
          }
          iterationValues.push(sample.value);
        }
        for (const [partitionKey, iterationValues] of perPartition) {
          (partitions.get(partitionKey) as { iterations: number[][] }).iterations.push(iterationValues);
        }
      }
      if (partitions.size === 0) continue;
      const split = partitions.size > 1;
      for (const partitionKey of [...partitions.keys()].sort()) {
        const entry = partitions.get(partitionKey) as { values: number[]; iterations: number[][]; samples: { readonly tags: Readonly<Record<string, string | number | boolean | null>> }[] };
        const signature = tagSignatureV1(extraTags, entry.samples);
        const compatTag = split ? `${ref}\0${signature}\0${partitionKey}` : `${ref}\0${signature}`;
        const { key } = compatibilityKeyV1(item.envelope, compatTag);
        let cell = cells.get(key);
        if (cell === undefined) {
          cell = {
            environmentCellId: item.envelope.run.environmentCellId,
            phase: item.envelope.run.phase,
            candidateId: item.envelope.run.candidateId,
            compatKey: key,
            fingerprint: fingerprintForKeyV1(item.envelope, compatTag),
            metrics: new Map(),
          };
          cells.set(key, cell);
        }
        let data = cell.metrics.get(ref);
        if (data === undefined) {
          data = {
            metric, ref, runs: [],
            populationLabel: populationLabelV1(
              item.envelope.run.scenarioId, item.envelope.run.scenarioVersion,
              item.envelope.run.workloadSeed, signature,
            ),
          };
          cell.metrics.set(ref, data);
        }
        data.runs.push({ eligible: item, values: entry.values, iterations: entry.iterations, runDigest: item.envelope.canonicalContentDigest, partitionKey: split ? partitionKey : null });
      }
    }
  }
  return cells;
}

function qualifyPopulationV1(
  phase: Br04Phase,
  nProcesses: number,
  nIterations: number,
): Br04PopulationQualificationV1 {
  if (nProcesses < 3) return 'below-technical-floor';
  if (phase === 'cold') {
    return nProcesses >= BR04_COLD_CELL_PROCESSES_V1 ? 'standard-cell' : 'technical-only';
  }
  if (phase === 'measurement') {
    return nProcesses >= BR04_STANDARD_CELL_PROCESSES_V1 && nIterations >= BR04_STANDARD_CELL_MEASUREMENT_ITERATIONS_V1
      ? 'standard-cell'
      : 'technical-only';
  }
  return nProcesses >= BR04_STANDARD_CELL_PROCESSES_V1 ? 'standard-cell' : 'technical-only';
}

function buildAggregateV1(
  bundle: Br04AggregateInputBundleV1,
  eligible: readonly Br04EligibleRunV1[],
  ledger: Br04MutableLedgerRowV1[],
  missingSlots: readonly string[],
  slotDigestById: ReadonlyMap<string, Br04Sha256>,
  metricRegistryDigest: Br04Sha256,
  validation: Br04AggregateValidationResultV1,
): Br04BenchmarkAggregateV1 {
  const claims: Br04ClaimTraceV1[] = [];
  const facts: string[] = [];
  const inferences: string[] = [];
  const unknowns: string[] = [];
  const metricDigestByRef = new Map<Br04MetricRef, Br04Sha256>();
  for (const metric of bundle.metricRegistry) {
    metricDigestByRef.set(`${metric.metricId}@${metric.metricVersion}` as Br04MetricRef, sha256OfCanonicalV1(metric));
  }
  const claim = (
    claimId: string, klass: Br04ClaimTraceV1['class'], aggregateJsonPointers: readonly string[],
    sourceRunDigests: readonly Br04Sha256[], planSlotIds: readonly string[], metricRef: Br04MetricRef | null,
  ): void => {
    claims.push({
      claimId, class: klass, aggregateJsonPointers,
      sourceRunDigests: [...sourceRunDigests].sort(), planSlotIds: [...planSlotIds].sort(),
      metricDefinitionDigest: metricRef === null ? null : (metricDigestByRef.get(metricRef) ?? null),
    });
  };
  const cells = groupCellDataV1(eligible, bundle.metricRegistry);
  const sortedCellKeys = [...cells.keys()].sort();
  const environmentCells: Br04EnvironmentCellAggregateV1[] = [];
  let environmentCellIndex = 0;
  for (const cellKey of sortedCellKeys) {
    const cell = cells.get(cellKey) as { environmentCellId: string; phase: Br04Phase; candidateId: string; compatKey: string; fingerprint: Br04Sha256; metrics: Map<Br04MetricRef, Br04RunMetricDataV1> };
    const metricCells: Br04MetricCellV1[] = [];
    const sortedRefs = [...cell.metrics.keys()].sort();
    for (const ref of sortedRefs) {
      const data = cell.metrics.get(ref) as Br04RunMetricDataV1;
      const metric = data.metric;
      const runDigests = [...new Set(data.runs.map((run) => run.runDigest))].sort();
      const slotIds = [...new Set(data.runs.map((run) => run.eligible.envelope.slotId))].sort();
      const perRunSummaries: Br04PerRunMetricSummaryV1[] = [];
      const pooledValues: number[] = [];
      const clusterInputs: Br04AbsoluteClusterInputV1[] = [];
      let nIterations = 0;
      const processes = new Set<string>();
      for (const run of [...data.runs].sort((left, right) =>
        left.eligible.envelope.runId < right.eligible.envelope.runId ? -1
          : left.eligible.envelope.runId > right.eligible.envelope.runId ? 1
            : (left.partitionKey ?? '') < (right.partitionKey ?? '') ? -1 : 1,
      )) {
        processes.add(run.eligible.envelope.run.browserProcessId);
        nIterations += run.iterations.length;
        for (const value of run.values) pooledValues.push(value);
        const scope = { metricRef: ref, unit: metric.unit, sourceRunDigests: [run.runDigest] as readonly Br04Sha256[] };
        const runScopeId = run.partitionKey === null
          ? `run:${run.eligible.envelope.runId}:${ref}`
          : `run:${run.eligible.envelope.runId}:${ref}:${run.partitionKey}`;
        const p50 = quantileResultV1({ ...scope, scopeId: runScopeId }, run.values, 0.5);
        const p95 = quantileResultV1({ ...scope, scopeId: runScopeId }, run.values, 0.95);
        const p99 = quantileResultV1({ ...scope, scopeId: runScopeId }, run.values, 0.99);
        perRunSummaries.push({
          runId: run.eligible.envelope.runId, runDigest: run.runDigest, metricRef: ref,
          nEvents: run.values.length, p50, p95, p99,
          maximum: maximumOfV1(run.values),
          comparisonScalar: perRunScalarV1(run.values, metric.perRunStatistic),
        });
        clusterInputs.push({
          clusterId: run.eligible.envelope.run.browserProcessId,
          runId: run.eligible.envelope.runId,
          runDigest: run.runDigest,
          values: run.values,
          iterations: run.iterations,
        });
      }
      const splitKeys = [...new Set(data.runs.map((run) => run.partitionKey).filter((key): key is string => key !== null))].sort();
      const pooledScopeId = splitKeys.length === 0
        ? `cell:${cell.environmentCellId}:${cell.phase}:${cell.candidateId}:${ref}`
        : `cell:${cell.environmentCellId}:${cell.phase}:${cell.candidateId}:${ref}:${splitKeys.join('|')}`;
      const pooledScope = { metricRef: ref, scopeId: pooledScopeId, unit: metric.unit, sourceRunDigests: runDigests };
      const descriptivePooledQuantiles: Br04QuantileResultV1[] = [
        quantileResultV1(pooledScope, pooledValues, 0.5),
        quantileResultV1(pooledScope, pooledValues, 0.95),
        quantileResultV1(pooledScope, pooledValues, 0.99),
      ];
      const maximum = maximumOfV1(pooledValues);
      const scalars = perRunSummaries
        .map((summary) => summary.comparisonScalar)
        .filter((scalar): scalar is number => scalar !== null);
      const cellPointEstimate = cellEstimatorV1(scalars, metric.cellEstimator);
      const groupKey = cell.compatKey;
      const bootstrap = bootstrapAbsoluteV1({
        metricRef: ref, unit: metric.unit, canonicalGroupKey: groupKey,
        estimatorId: `cell-${metric.cellEstimator}`, estimator: metric.cellEstimator,
        perRunStatistic: metric.perRunStatistic, lowerLevel: metric.lowerLevelResampling,
        clusters: clusterInputs,
        masterSeedHex: bundle.bootstrapPolicy.masterSeedHex,
        normalizedInputDigest: bundle.manifest.normalizedInputDigest,
      });
      const qualification = qualifyPopulationV1(cell.phase, processes.size, nIterations);
      const cellPointer = `/environmentCells/${environmentCellIndex}/metricCells/${metricCells.length}`;
      metricCells.push({
        metricRef: ref, unit: metric.unit,
        populationLabel: data.populationLabel,
        nProcesses: processes.size, nRuns: data.runs.length, nIterations, nEvents: pooledValues.length,
        populationQualification: qualification,
        perRunSummaries, descriptivePooledQuantiles, maximum,
        cellPointEstimate: bootstrap.point ?? cellPointEstimate,
        cellInterval: bootstrap.interval,
      });
      claim(`cell:${cell.environmentCellId}:${cell.phase}:${cell.candidateId}:${ref}:${cell.fingerprint.slice(7, 15)}:point`, 'fact',
        [`${cellPointer}/cellPointEstimate`, `${cellPointer}/cellInterval`], runDigests, slotIds, ref);
      claim(`cell:${cell.environmentCellId}:${cell.phase}:${cell.candidateId}:${ref}:${cell.fingerprint.slice(7, 15)}:quantiles`, 'fact',
        [`${cellPointer}/descriptivePooledQuantiles`, `${cellPointer}/maximum`], runDigests, slotIds, ref);
      if (qualification !== 'standard-cell') {
        unknowns.push(`${ref} in ${cell.environmentCellId}/${cell.phase}/${cell.candidateId} is ${qualification}: not a standard performance cell.`);
      }
      const pooledP99 = descriptivePooledQuantiles[2] as Br04QuantileResultV1;
      if (pooledP99.status === 'insufficient-samples') {
        facts.push(`p99 for ${ref} in ${cell.environmentCellId}/${cell.phase} is unavailable: n=${pooledP99.nMatchingValidObservations} < 1000.`);
      }
    }
    environmentCells.push({
      environmentCellId: cell.environmentCellId,
      environmentFingerprintDigest: cell.fingerprint,
      phase: cell.phase,
      candidateId: cell.candidateId,
      metricCells,
    });
    environmentCellIndex += 1;
  }
  const { comparisons: pairedComparisons, incompleteDetails } =
    buildPairedComparisonsV1(bundle, eligible, claim);
  const capabilityCoverage = buildCapabilityCoverageV1(bundle, eligible);
  applyPairDispositionsV1(ledger, bundle, pairedComparisons, incompleteDetails);
  const invalidRuns = buildInvalidSummaryV1(bundle, ledger, missingSlots, slotDigestById, incompleteDetails);
  facts.unshift(
    `${validation.counts.observedRuns} of ${validation.counts.plannedSlots} planned runs were observed; ` +
    `${missingSlots.length} planned slots are missing.`,
  );
  const bootstrapPolicyDigest = sha256OfCanonicalV1(bundle.bootstrapPolicy);
  /**
   * R2 provenance note: this digest binds the versioned method labels, not
   * the implementation bytes. A code change under identical labels does
   * not change this value; it is a schema/method-label hash, and the
   * aggregate digest above it binds the actual computed content.
   */
  const aggregatorSourceDigest = sha256OfCanonicalV1({
    aggregator: BR04_AGGREGATOR_VERSION_V1,
    quantileMethod: 'inverse-ecdf-nearest-rank-v1',
    bootstrapMethod: 'hierarchical-percentile-v1',
    seedDerivation: 'sha256-bound-xoshiro128ss-v1',
    prng: 'xoshiro128**-32-v1',
    indexSampling: 'uint32-rejection-v1',
  });
  const aggregateBody = {
    schemaVersion: 1 as const,
    contractVersion: 'br04-benchmark-aggregate-v1' as const,
    reportAsOfUtc: bundle.reportAsOfUtc,
    inputDigest: bundle.manifest.normalizedInputDigest,
    runPlanDigest: bundle.runPlan.planDigest,
    acceptedBr03Sha: bundle.sourceContract.acceptedBr03Sha,
    metricRegistryDigest,
    bootstrapPolicyDigest,
    aggregatorSourceDigest,
    inputProvenance: {
      syntheticHardwareProfile: bundle.runPlan.syntheticHardwareProfile,
      performanceClaimEligibility: bundle.runPlan.syntheticHardwareProfile
        ? 'ineligible-synthetic-fixture' as const
        : environmentCells.some((cell) => cell.metricCells.length > 0)
          ? 'eligible-measured' as const
          : 'ineligible-no-valid-population' as const,
    },
    validation,
    environmentCells,
    pairedComparisons,
    invalidRuns,
    capabilityCoverage,
    claimIndex: claims,
    facts,
    inferences,
    unknowns,
    decision: null,
    automaticDecision: 'forbidden' as const,
  };
  return { ...aggregateBody, aggregateDigest: sha256OfCanonicalV1(aggregateBody) };
}

interface Br04PairCellStateV1 {
  readonly key: string;
  readonly balanceBlockId: string;
  readonly pairCellId: string;
  readonly pairOrdinal: number;
  readonly referenceSlots: Br04PlannedRunSlotV1[];
  readonly comparisonSlots: Br04PlannedRunSlotV1[];
}

export interface Br04IncompletePairDetailV1 {
  readonly pairCellId: string;
  readonly balanceBlockId: string;
  readonly pairOrdinal: number;
  readonly presentSlotIds: readonly string[];
  readonly missingOrInvalidSlotIds: readonly string[];
  readonly reasonCodes: readonly string[];
}

interface Br04ArmContextV1 {
  readonly environmentCellId: string;
  readonly phase: Br04Phase;
  readonly scenarioId: string;
  readonly scenarioVersion: number;
  readonly workloadSeed: number;
  readonly sourceTreeSha: string | null;
  readonly buildSha256: string | null;
  readonly fixtureDigest: string | null;
  readonly environmentFingerprint: Br04Sha256 | null;
  readonly tagSignature: string | null;
}

/**
 * R3/B2-Rest: one arm's valid samples of one metric keyed by the full tag
 * tuple. Pairing must operate per partition, never on pooled cross-tag
 * scalars.
 */
function armPartitionMapV1(
  item: Br04EligibleRunV1,
  metric: Br04MetricDefinitionV1,
): Map<string, { tagSignature: string; values: number[] }> {
  const ref = `${metric.metricId}@${metric.metricVersion}`;
  const extraTags = extraGroupTagsV1(metric);
  const collected = new Map<string, { values: number[]; samples: { readonly tags: Readonly<Record<string, string | number | boolean | null>> }[] }>();
  for (const iteration of item.envelope.run.iterations) {
    for (const sample of iteration.samples) {
      if (sample.metricRef !== ref || !sample.valid) continue;
      const key = tagPartitionKeyV1(sample.tags);
      let entry = collected.get(key);
      if (entry === undefined) {
        entry = { values: [], samples: [] };
        collected.set(key, entry);
      }
      entry.values.push(sample.value);
      entry.samples.push(sample);
    }
  }
  const mapped = new Map<string, { tagSignature: string; values: number[] }>();
  for (const [key, entry] of collected) {
    mapped.set(key, { tagSignature: tagSignatureV1(extraTags, entry.samples), values: entry.values });
  }
  return mapped;
}

function armContextFromRunV1(item: Br04EligibleRunV1, metric: Br04MetricDefinitionV1): Br04ArmContextV1 {
  const run = item.envelope.run;
  const joined = [...new Set([...armPartitionMapV1(item, metric).values()].map((part) => part.tagSignature))].sort().join('|');
  return {
    environmentCellId: run.environmentCellId,
    phase: run.phase,
    scenarioId: run.scenarioId,
    scenarioVersion: run.scenarioVersion,
    workloadSeed: run.workloadSeed,
    sourceTreeSha: run.source.sourceTreeSha,
    buildSha256: run.source.buildSha256,
    fixtureDigest: run.source.fixtureDigest,
    environmentFingerprint: run.environmentFingerprint,
    tagSignature: joined,
  };
}

function armContextFromSlotV1(slot: Br04PlannedRunSlotV1): Br04ArmContextV1 {
  return {
    environmentCellId: slot.environmentCellId,
    phase: slot.phase,
    scenarioId: slot.scenarioId,
    scenarioVersion: slot.scenarioVersion,
    workloadSeed: slot.workloadSeed,
    sourceTreeSha: null,
    buildSha256: null,
    fixtureDigest: null,
    environmentFingerprint: null,
    tagSignature: null,
  };
}

/** Null fields are wildcards from unobserved slot fallbacks; two observed contexts must agree exactly. */
function contextDivergenceV1(left: Br04ArmContextV1, right: Br04ArmContextV1): string[] {
  const reasons: string[] = [];
  if (left.environmentCellId !== right.environmentCellId) reasons.push('environment-cell-diverged');
  if (left.phase !== right.phase) reasons.push('phase-diverged');
  if (
    left.scenarioId !== right.scenarioId || left.scenarioVersion !== right.scenarioVersion
    || left.workloadSeed !== right.workloadSeed || left.sourceTreeSha !== right.sourceTreeSha
    || left.buildSha256 !== right.buildSha256 || left.fixtureDigest !== right.fixtureDigest
    || left.environmentFingerprint !== right.environmentFingerprint
  ) {
    reasons.push('compatibility-key-diverged');
  }
  if (left.tagSignature !== null && right.tagSignature !== null && left.tagSignature !== right.tagSignature) {
    reasons.push('group-tags-diverged');
  }
  return reasons;
}

function buildPairedComparisonsV1(
  bundle: Br04AggregateInputBundleV1,
  eligible: readonly Br04EligibleRunV1[],
  claim: (
    claimId: string, klass: Br04ClaimTraceV1['class'], aggregateJsonPointers: readonly string[],
    sourceRunDigests: readonly Br04Sha256[], planSlotIds: readonly string[], metricRef: Br04MetricRef | null,
  ) => void,
): { comparisons: Br04PairedComparisonV1[]; incompleteDetails: Br04IncompletePairDetailV1[] } {
  const comparisons: Br04PairedComparisonV1[] = [];
  const incompleteDetails: Br04IncompletePairDetailV1[] = [];
  if (bundle.runPlan.comparisonMode !== 'reference-paired') return { comparisons, incompleteDetails };
  const envelopeBySlot = new Map<string, Br04EligibleRunV1>();
  for (const item of eligible) envelopeBySlot.set(item.slot.slotId, item);
  const groups = new Map<string, {
    environmentCellId: string; phase: Br04Phase; scenarioId: string; scenarioVersion: number;
    workloadSeed: number; tagSignature: string; partitionKey: string | null; split: boolean; metricRef: Br04MetricRef;
    referenceCandidateId: string; candidateId: string; cells: Map<string, Br04PairCellStateV1>;
  }>();
  for (const metric of bundle.metricRegistry) {
    const ref = `${metric.metricId}@${metric.metricVersion}` as Br04MetricRef;
    const pairCells = new Map<string, Br04PairCellStateV1>();
    for (const slot of bundle.runPlan.slots) {
      if (slot.referenceCandidateId === null || slot.pairCellId === null || slot.pairOrdinal === null) continue;
      if (armOfV1(slot, 'reference-paired') === 'unpaired') continue;
      const pairKey = `${slot.balanceBlockId}\0${slot.pairCellId as string}\0${slot.pairOrdinal as number}`;
      let cell = pairCells.get(pairKey);
      if (cell === undefined) {
        cell = {
          key: pairKey, balanceBlockId: slot.balanceBlockId,
          pairCellId: slot.pairCellId as string, pairOrdinal: slot.pairOrdinal as number,
          referenceSlots: [], comparisonSlots: [],
        };
        pairCells.set(pairKey, cell);
      }
      const mutable = cell as { referenceSlots: Br04PlannedRunSlotV1[]; comparisonSlots: Br04PlannedRunSlotV1[] };
      if (slot.candidateId === slot.referenceCandidateId) mutable.referenceSlots.push(slot);
      else mutable.comparisonSlots.push(slot);
    }
    let observedAny = false;
    for (const cellState of pairCells.values()) {
      for (const slot of [...cellState.referenceSlots, ...cellState.comparisonSlots]) {
        const item = envelopeBySlot.get(slot.slotId);
        if (
          item !== undefined
          && item.envelope.run.iterations.some((iteration) =>
            iteration.samples.some((sample) => sample.metricRef === ref && sample.valid))
        ) {
          observedAny = true;
          break;
        }
      }
      if (observedAny) break;
    }
    if (!observedAny) continue;
    for (const cellState of pairCells.values()) {
      const refSlot = cellState.referenceSlots.length === 1
        ? (cellState.referenceSlots[0] as Br04PlannedRunSlotV1) : undefined;
      const cmpSlot = cellState.comparisonSlots.length === 1
        ? (cellState.comparisonSlots[0] as Br04PlannedRunSlotV1) : undefined;
      const refRun = refSlot === undefined ? undefined : envelopeBySlot.get(refSlot.slotId);
      const cmpRun = cmpSlot === undefined ? undefined : envelopeBySlot.get(cmpSlot.slotId);
      const refContext = refRun !== undefined
        ? armContextFromRunV1(refRun, metric)
        : refSlot !== undefined ? armContextFromSlotV1(refSlot) : null;
      const cmpContext = cmpRun !== undefined
        ? armContextFromRunV1(cmpRun, metric)
        : cmpSlot !== undefined ? armContextFromSlotV1(cmpSlot) : null;
      const primary = refContext ?? cmpContext;
      if (primary === null) continue;
      const primaryParts = refRun !== undefined
        ? armPartitionMapV1(refRun, metric)
        : cmpRun !== undefined ? armPartitionMapV1(cmpRun, metric) : null;
      const primaryKeys = primaryParts !== null && primaryParts.size > 0
        ? [...primaryParts.keys()].sort()
        : [null] as readonly (string | null)[];
      const split = primaryParts !== null && primaryParts.size > 1;
      for (const partitionKey of primaryKeys) {
        const signature = partitionKey === null
          ? (primary.tagSignature ?? '')
          : (primaryParts as Map<string, { tagSignature: string }>).get(partitionKey)?.tagSignature ?? '';
        const groupKey = [
          primary.environmentCellId, primary.phase, primary.scenarioId,
          String(primary.scenarioVersion), String(primary.workloadSeed),
          primary.sourceTreeSha ?? '', primary.buildSha256 ?? '', primary.fixtureDigest ?? '',
          primary.environmentFingerprint ?? '', ref,
          refSlot?.referenceCandidateId ?? cmpSlot?.referenceCandidateId ?? '',
          cmpSlot?.candidateId ?? refSlot?.candidateId ?? '',
          signature,
          split && partitionKey !== null ? partitionKey : '',
        ].join('\0');
        let group = groups.get(groupKey);
        if (group === undefined) {
          group = {
            environmentCellId: primary.environmentCellId, phase: primary.phase,
            scenarioId: primary.scenarioId, scenarioVersion: primary.scenarioVersion,
            workloadSeed: primary.workloadSeed, tagSignature: signature,
            partitionKey, split,
            metricRef: ref,
            referenceCandidateId: (refSlot?.referenceCandidateId ?? cmpSlot?.referenceCandidateId ?? '') as string,
            candidateId: (cmpSlot?.candidateId ?? refSlot?.candidateId ?? '') as string,
            cells: new Map(),
          };
          groups.set(groupKey, group);
        }
        group.cells.set(cellState.key, cellState);
      }
    }
  }
  const sortedGroupKeys = [...groups.keys()].sort();
  let comparisonIndex = 0;
  for (const groupKey of sortedGroupKeys) {
    const group = groups.get(groupKey) as {
      environmentCellId: string; phase: Br04Phase; scenarioId: string; scenarioVersion: number;
      workloadSeed: number; tagSignature: string; partitionKey: string | null; split: boolean; metricRef: Br04MetricRef;
      referenceCandidateId: string; candidateId: string; cells: Map<string, Br04PairCellStateV1>;
    };
    const metric = bundle.metricRegistry.find(
      (candidate) => `${candidate.metricId}@${candidate.metricVersion}` === group.metricRef,
    ) as Br04MetricDefinitionV1;
    const sortedPairKeys = [...group.cells.keys()].sort();
    const pairValues: Br04PairValueV1[] = [];
    const completePairCellIds: string[] = [];
    const incompletePairCellIds: string[] = [];
    const incompleteSlotIds: string[] = [];
    const pairClusters = new Map<string, Br04PairedClusterInputV1>();
    for (const pairKey of sortedPairKeys) {
      const cellState = group.cells.get(pairKey) as Br04PairCellStateV1;
      const refRun = cellState.referenceSlots.length === 1
        ? envelopeBySlot.get((cellState.referenceSlots[0] as Br04PlannedRunSlotV1).slotId)
        : undefined;
      const cmpRun = cellState.comparisonSlots.length === 1
        ? envelopeBySlot.get((cellState.comparisonSlots[0] as Br04PlannedRunSlotV1).slotId)
        : undefined;
      const cellReasons: string[] = [];
      if (cellState.referenceSlots.length !== 1 || cellState.comparisonSlots.length !== 1) {
        cellReasons.push('pair-cell-arm-count');
      }
      if (refRun !== undefined && cmpRun !== undefined && cellReasons.length === 0) {
        cellReasons.push(...contextDivergenceV1(
          armContextFromRunV1(refRun, metric), armContextFromRunV1(cmpRun, metric),
        ));
      }
      let refScalar: number | null = null;
      let cmpScalar: number | null = null;
      if (refRun !== undefined && cmpRun !== undefined && cellReasons.length === 0) {
        if (refRun.metricEligibility[group.metricRef] !== 'valid') {
          cellReasons.push(`reference-${refRun.metricEligibility[group.metricRef]}`);
        }
        if (cmpRun.metricEligibility[group.metricRef] !== 'valid') {
          cellReasons.push(`candidate-${cmpRun.metricEligibility[group.metricRef]}`);
        }
        if (cellReasons.length === 0) {
          if (group.partitionKey !== null) {
            const refParts = armPartitionMapV1(refRun, metric);
            const cmpParts = armPartitionMapV1(cmpRun, metric);
            const refKeys = [...refParts.keys()].sort();
            const cmpKeys = [...cmpParts.keys()].sort();
            if (refKeys.join('\0') !== cmpKeys.join('\0')) {
              cellReasons.push('group-tags-diverged');
            } else {
              const refPart = refParts.get(group.partitionKey);
              const cmpPart = cmpParts.get(group.partitionKey);
              if (refPart === undefined || cmpPart === undefined) {
                cellReasons.push('group-tags-diverged');
              } else if (refPart.values.length === 0 || cmpPart.values.length === 0) {
                cellReasons.push('scalar-unavailable');
              } else {
                refScalar = perRunScalarV1(refPart.values, metric.perRunStatistic);
                cmpScalar = perRunScalarV1(cmpPart.values, metric.perRunStatistic);
                if (refScalar === null || cmpScalar === null) cellReasons.push('scalar-unavailable');
              }
            }
          } else {
            const refValues: number[] = [];
            for (const iteration of refRun.envelope.run.iterations) {
              for (const sample of iteration.samples) {
                if (sample.metricRef === group.metricRef && sample.valid) refValues.push(sample.value);
              }
            }
            const cmpValues: number[] = [];
            for (const iteration of cmpRun.envelope.run.iterations) {
              for (const sample of iteration.samples) {
                if (sample.metricRef === group.metricRef && sample.valid) cmpValues.push(sample.value);
              }
            }
            if (refValues.length === 0 || cmpValues.length === 0) {
              cellReasons.push('scalar-unavailable');
            } else {
              refScalar = perRunScalarV1(refValues, metric.perRunStatistic);
              cmpScalar = perRunScalarV1(cmpValues, metric.perRunStatistic);
              if (refScalar === null || cmpScalar === null) cellReasons.push('scalar-unavailable');
            }
          }
        }
      } else if (cellReasons.length === 0) {
        cellReasons.push(refRun === undefined ? 'reference-missing-or-invalid' : 'candidate-missing-or-invalid');
      }
      if (cellReasons.length > 0) {
        incompletePairCellIds.push(cellState.pairCellId);
        const present: string[] = [];
        const missing: string[] = [];
        for (const slot of cellState.referenceSlots) {
          incompleteSlotIds.push(slot.slotId);
          (envelopeBySlot.has(slot.slotId) ? present : missing).push(slot.slotId);
        }
        for (const slot of cellState.comparisonSlots) {
          incompleteSlotIds.push(slot.slotId);
          (envelopeBySlot.has(slot.slotId) ? present : missing).push(slot.slotId);
        }
        incompleteDetails.push({
          pairCellId: cellState.pairCellId,
          balanceBlockId: cellState.balanceBlockId,
          pairOrdinal: cellState.pairOrdinal,
          presentSlotIds: [...present].sort(),
          missingOrInvalidSlotIds: [...missing].sort(),
          reasonCodes: [...cellReasons].sort(),
        });
        continue;
      }
      const referenceValue = refScalar as number;
      const candidateValue = cmpScalar as number;
      const ratioStatus: 'ok' | 'non-positive-reference' | 'domain-invalid' =
        checkDomainV1(metric.numericDomain, referenceValue) !== null
        || checkDomainV1(metric.numericDomain, candidateValue) !== null
          ? 'domain-invalid'
          : referenceValue > 0 ? 'ok' : 'non-positive-reference';
      const ratio = ratioStatus === 'ok' ? candidateValue / referenceValue : null;
      const refItem = refRun as Br04EligibleRunV1;
      const cmpItem = cmpRun as Br04EligibleRunV1;
      pairValues.push({
        pairCellId: cellState.pairCellId,
        pairOrdinal: cellState.pairOrdinal,
        balanceBlockId: cellState.balanceBlockId,
        bootstrapClusterId: refItem.envelope.run.browserProcessId,
        referenceValue, candidateValue,
        differenceCandidateMinusReference: candidateValue - referenceValue,
        ratioCandidateOverReference: ratio,
        ratioStatus,
        referenceRunDigest: refItem.envelope.canonicalContentDigest,
        candidateRunDigest: cmpItem.envelope.canonicalContentDigest,
      });
      completePairCellIds.push(cellState.pairCellId);
      if (
        checkDomainV1(metric.numericDomain, referenceValue) === null
        && checkDomainV1(metric.numericDomain, candidateValue) === null
      ) {
        let cluster = pairClusters.get(cellState.balanceBlockId);
        if (cluster === undefined) {
          cluster = { balanceBlockId: cellState.balanceBlockId, pairs: [] };
          pairClusters.set(cellState.balanceBlockId, cluster);
        }
        (cluster.pairs as { pairCellId: string; pairOrdinal: number; referenceScalar: number; candidateScalar: number }[]).push({
          pairCellId: cellState.pairCellId, pairOrdinal: cellState.pairOrdinal,
          referenceScalar: referenceValue, candidateScalar: candidateValue,
        });
      }
    }
    completePairCellIds.sort();
    incompletePairCellIds.sort();
    const domainPairs = pairValues.filter(
      (pair) => checkDomainV1(metric.numericDomain, pair.referenceValue) === null
        && checkDomainV1(metric.numericDomain, pair.candidateValue) === null,
    );
    const differences = domainPairs.map((pair) => pair.differenceCandidateMinusReference);
    const positiveRatios = domainPairs
      .map((pair) => pair.ratioCandidateOverReference)
      .filter((ratio): ratio is number => ratio !== null && ratio > 0);
    const differencePointEstimate = differences.length === 0
      ? null
      : perRunScalarV1(differences, 'nearest-rank-p50');
    const ratioPointEstimate = positiveRatios.length === 0 ? null : (() => {
      let logSum = 0;
      for (const ratio of positiveRatios) logSum += Math.log(ratio);
      return Math.exp(logSum / positiveRatios.length);
    })();
    const canonicalGroupKey =
      `${group.environmentCellId}\0${group.phase}\0${group.scenarioId}\0${group.scenarioVersion}\0` +
      `${group.workloadSeed}\0${group.referenceCandidateId}\0${group.candidateId}\0${group.metricRef}\0${group.tagSignature}`;
    const estimatorId = `paired:${group.referenceCandidateId}-vs-${group.candidateId}`;
    const pairedBootstrap = pairClusters.size === 0
      ? null
      : bootstrapPairedV1({
        metricRef: group.metricRef, unit: metric.unit, canonicalGroupKey, estimatorId,
        clusters: [...pairClusters.values()],
        masterSeedHex: bundle.bootstrapPolicy.masterSeedHex,
        normalizedInputDigest: bundle.manifest.normalizedInputDigest,
      });
    const bootstrap = {
      differenceInterval: pairedBootstrap === null
        ? emptyPairedIntervalV1(bundle, group.metricRef, metric.unit, canonicalGroupKey, `${estimatorId}:difference-median`, 'no-data')
        : pairedBootstrap.differenceInterval,
      ratioInterval: pairedBootstrap === null
        ? emptyPairedIntervalV1(bundle, group.metricRef, 'ratio', canonicalGroupKey, `${estimatorId}:ratio-geomean`, 'no-data')
        : pairedBootstrap.ratioInterval,
    };
    const comparisonPointer = `/pairedComparisons/${comparisonIndex}`;
    const practicalEffect = practicalEffectV1(
      metric.practicalEffectDelta, metric.direction, ratioPointEstimate,
      bootstrap.ratioInterval.lower, bootstrap.ratioInterval.upper,
      bootstrap.ratioInterval.status === 'ok',
    );
    const comparisonId =
      `cmp:${group.environmentCellId}:${group.phase}:${group.scenarioId}:${group.workloadSeed}:` +
      `${group.metricRef}:${group.referenceCandidateId}-vs-${group.candidateId}` +
      (group.split && group.partitionKey !== null ? `:tag=${group.partitionKey}` : '');
    comparisons.push({
      schemaVersion: 1,
      comparisonId,
      populationLabel: populationLabelV1(
        group.scenarioId, group.scenarioVersion, group.workloadSeed, group.tagSignature,
      ),
      metricRef: group.metricRef,
      environmentCellId: group.environmentCellId,
      phase: group.phase,
      referenceCandidateId: group.referenceCandidateId,
      candidateId: group.candidateId,
      direction: metric.direction,
      perRunStatistic: metric.perRunStatistic,
      pairs: {
        planned: sortedPairKeys.length,
        complete: completePairCellIds.length,
        incomplete: incompletePairCellIds.length,
        completePairCellIds,
        incompletePairCellIds,
      },
      pairValues,
      differencePointEstimate,
      ratioPointEstimate,
      differenceInterval: bootstrap.differenceInterval,
      ratioInterval: bootstrap.ratioInterval,
      practicalEffect,
      decision: null,
    });
    claim(`${comparisonId}:estimates`, 'fact',
      [`${comparisonPointer}/differencePointEstimate`, `${comparisonPointer}/ratioPointEstimate`,
        `${comparisonPointer}/differenceInterval`, `${comparisonPointer}/ratioInterval`],
      [...new Set(pairValues.flatMap((pair) => [pair.referenceRunDigest, pair.candidateRunDigest]))].sort(),
      [...new Set(groupCellsSlotIdsV1(group))].sort(), group.metricRef);
    if (incompletePairCellIds.length > 0) {
      claim(`${comparisonId}:incomplete`, 'unknown',
        [`${comparisonPointer}/pairs`], [],
        [...new Set(incompleteSlotIds)].sort(), group.metricRef);
    }
    comparisonIndex += 1;
  }
  return { comparisons, incompleteDetails };
}

function groupCellsSlotIdsV1(group: {
  cells: Map<string, Br04PairCellStateV1>;
}): string[] {
  const ids: string[] = [];
  for (const cell of group.cells.values()) {
    for (const slot of cell.referenceSlots) ids.push(slot.slotId);
    for (const slot of cell.comparisonSlots) ids.push(slot.slotId);
  }
  return ids;
}

function emptyPairedIntervalV1(
  bundle: Br04AggregateInputBundleV1,
  metricRef: Br04MetricRef,
  unit: string,
  canonicalGroupKey: string,
  estimatorId: string,
  status: Br04BootstrapIntervalV1['status'],
): Br04BootstrapIntervalV1 {
  const derived = derivePrngSeedV1(
    bundle.bootstrapPolicy.masterSeedHex, bundle.manifest.normalizedInputDigest,
    metricRef, canonicalGroupKey, estimatorId,
  );
  return {
    schemaVersion: 1, metricRef, estimatorId, status,
    method: 'hierarchical-percentile-v1', confidenceLevel: 0.95, resamples: 10000,
    lower: null, upper: null, unit,
    hierarchy: ['balance-block', 'pair-cell'],
    topLevelClusters: 0, runs: 0, iterations: 0, events: 0,
    masterSeedHex: bundle.bootstrapPolicy.masterSeedHex,
    seedMaterialDigest: derived.seedMaterialDigest,
    derivedSeedHex: derived.derivedSeedHex,
    replicateVectorDigest: null,
  };
}

function buildCapabilityCoverageV1(
  bundle: Br04AggregateInputBundleV1,
  eligible: readonly Br04EligibleRunV1[],
): Br04CapabilityCoverageV1[] {
  const coverage: Br04CapabilityCoverageV1[] = [];
  const byCellCandidate = new Map<string, { environmentCellId: string; phase: Br04Phase; candidateId: string; runs: Br04EligibleRunV1[] }>();
  for (const item of eligible) {
    const key = `${item.envelope.run.environmentCellId}\0${item.envelope.run.phase}\0${item.envelope.run.candidateId}`;
    let group = byCellCandidate.get(key);
    if (group === undefined) {
      group = {
        environmentCellId: item.envelope.run.environmentCellId,
        phase: item.envelope.run.phase, candidateId: item.envelope.run.candidateId, runs: [],
      };
      byCellCandidate.set(key, group);
    }
    group.runs.push(item);
  }
  const missingByCandidate = new Map<string, number>();
  for (const slot of bundle.runPlan.slots) {
    const observed = eligible.some((item) => item.slot.slotId === slot.slotId);
    if (!observed) {
      const key = `${slot.candidateId}\0${slot.phase}`;
      missingByCandidate.set(key, (missingByCandidate.get(key) ?? 0) + 1);
    }
  }
  for (const cellKey of [...byCellCandidate.keys()].sort()) {
    const group = byCellCandidate.get(cellKey) as { environmentCellId: string; phase: Br04Phase; candidateId: string; runs: Br04EligibleRunV1[] };
    const refs = new Set<Br04MetricRef>();
    for (const item of group.runs) {
      for (const ref of Object.keys(item.metricEligibility) as Br04MetricRef[]) refs.add(ref);
    }
    for (const ref of [...refs].sort()) {
      const metric = bundle.metricRegistry.find(
        (candidate) => `${candidate.metricId}@${candidate.metricVersion}` === ref,
      ) as Br04MetricDefinitionV1;
      const required = metric.capabilityRequirement;
      let supportedRuns = 0;
      let unsupportedRuns = 0;
      let erroredRuns = 0;
      const reasonCodes = new Set<string>();
      const digests: Br04Sha256[] = [];
      for (const item of group.runs) {
        digests.push(item.envelope.canonicalContentDigest);
        if (required.length === 0) {
          supportedRuns += 1;
          continue;
        }
        let error = false;
        let unsupported = false;
        for (const capability of required) {
          const state = item.envelope.run.capabilities[capability] ?? 'unsupported';
          if (state === 'error') error = true;
          else if (state !== 'supported') {
            unsupported = true;
            reasonCodes.add(`capability-unsupported:${capability}`);
          }
        }
        if (error && !unsupported) {
          erroredRuns += 1;
          reasonCodes.add('capability-error');
        } else if (unsupported) unsupportedRuns += 1;
        else supportedRuns += 1;
      }
      const observedRuns = group.runs.length;
      const plannedRuns = observedRuns + (missingByCandidate.get(`${group.candidateId}\0${group.phase}`) ?? 0);
      const status = required.length === 0 || supportedRuns === observedRuns
        ? 'supported'
        : supportedRuns === 0 && erroredRuns > 0 ? 'error'
          : supportedRuns === 0 ? 'unsupported' : 'partially-supported';
      coverage.push({
        schemaVersion: 1, metricRef: ref,
        environmentCellId: group.environmentCellId, candidateId: group.candidateId,
        requiredCapabilities: [...required], status, plannedRuns, observedRuns,
        supportedRuns, unsupportedRuns, erroredRuns,
        reasonCodes: [...reasonCodes].sort(), sourceRunDigests: [...new Set(digests)].sort(),
      });
    }
  }
  return coverage;
}

function buildInvalidSummaryV1(
  bundle: Br04AggregateInputBundleV1,
  ledger: readonly Br04RunLedgerEntryV1[],
  missingSlots: readonly string[],
  slotDigestById: ReadonlyMap<string, Br04Sha256>,
  incompleteDetails: readonly Br04IncompletePairDetailV1[],
): Br04InvalidRunSummaryV1 {
  const counts: Record<Br04RunDispositionV1, number> = {
    valid: 0, 'infrastructure-invalid': 0, 'capability-unsupported': 0,
    'candidate-failure': 0, 'provenance-mismatch': 0, 'source-dirty': 0, 'trace-only': 0,
  };
  const entries: Br04InvalidRunEntryV1[] = [];
  for (const row of ledger) {
    counts[row.baseDisposition] += 1;
    if (row.baseDisposition !== 'valid') {
      entries.push({
        runId: row.runId, slotId: row.slotId, baseDisposition: row.baseDisposition,
        pairDisposition: row.pairDisposition, scope: 'run', reasonCodes: [...row.reasonCodes],
        rawRunDigest: row.rawByteDigest,
        planSlotDigest: slotDigestById.get(row.slotId) as Br04Sha256,
      });
    }
    for (const ref of Object.keys(row.metricEligibility) as Br04MetricRef[]) {
      const disposition = row.metricEligibility[ref] as Br04RunDispositionV1;
      if (row.baseDisposition === 'valid' && disposition !== 'valid') {
        entries.push({
          runId: row.runId, slotId: row.slotId, baseDisposition: disposition,
          pairDisposition: row.pairDisposition, scope: `metric:${ref}`,
          reasonCodes: [`metric-ineligible:${disposition}`],
          rawRunDigest: row.rawByteDigest,
          planSlotDigest: slotDigestById.get(row.slotId) as Br04Sha256,
        });
      }
    }
  }
  entries.sort((left, right) =>
    left.slotId < right.slotId ? -1 : left.slotId > right.slotId ? 1
      : left.scope < right.scope ? -1 : 1,
  );
  const incompletePairs: Br04IncompletePairV1[] = [];
  const seenPairTriples = new Set<string>();
  for (const detail of incompleteDetails) {
    const triple = `${detail.balanceBlockId}\0${detail.pairCellId}\0${detail.pairOrdinal}`;
    if (seenPairTriples.has(triple)) continue;
    seenPairTriples.add(triple);
    incompletePairs.push({
      pairCellId: detail.pairCellId,
      balanceBlockId: detail.balanceBlockId,
      pairOrdinal: detail.pairOrdinal,
      presentSlotIds: [...detail.presentSlotIds],
      missingOrInvalidSlotIds: [...detail.missingOrInvalidSlotIds],
      reasonCodes: [...detail.reasonCodes],
    });
  }
  incompletePairs.sort((left, right) =>
    left.balanceBlockId < right.balanceBlockId ? -1 : left.balanceBlockId > right.balanceBlockId ? 1
      : left.pairCellId < right.pairCellId ? -1 : left.pairCellId > right.pairCellId ? 1
        : left.pairOrdinal - right.pairOrdinal,
  );
  return {
    schemaVersion: 1,
    plannedSlots: bundle.runPlan.slots.length,
    observedRuns: bundle.runs.length,
    baseDispositionCounts: counts,
    entries,
    missingSlots: [...missingSlots],
    incompletePairs,
  };
}

function applyPairDispositionsV1(
  ledger: Br04MutableLedgerRowV1[],
  bundle: Br04AggregateInputBundleV1,
  pairedComparisons: readonly Br04PairedComparisonV1[],
  incompleteDetails: readonly Br04IncompletePairDetailV1[],
): void {
  const completeTriples = new Set<string>();
  const incompleteTriples = new Set<string>();
  for (const comparison of pairedComparisons) {
    for (const pair of comparison.pairValues) {
      completeTriples.add(`${pair.balanceBlockId}\0${pair.pairCellId}\0${pair.pairOrdinal}`);
    }
  }
  for (const detail of incompleteDetails) {
    incompleteTriples.add(`${detail.balanceBlockId}\0${detail.pairCellId}\0${detail.pairOrdinal}`);
  }
  const slotById = new Map<string, Br04PlannedRunSlotV1>();
  for (const slot of bundle.runPlan.slots) slotById.set(slot.slotId, slot);
  for (const row of ledger) {
    const slot = slotById.get(row.slotId);
    if (slot === undefined || slot.pairCellId === null) {
      row.pairDisposition = 'not-applicable';
      continue;
    }
    if (armOfV1(slot, bundle.runPlan.comparisonMode) === 'unpaired') {
      row.pairDisposition = 'not-applicable';
      continue;
    }
    const triple = `${slot.balanceBlockId}\0${slot.pairCellId}\0${slot.pairOrdinal as number}`;
    if (completeTriples.has(triple)) row.pairDisposition = 'complete';
    else if (incompleteTriples.has(triple)) row.pairDisposition = 'incomplete-pair';
    else row.pairDisposition = 'not-applicable';
  }
}

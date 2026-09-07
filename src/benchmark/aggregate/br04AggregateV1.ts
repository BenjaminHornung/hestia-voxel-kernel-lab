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
  readonly runs: {
    readonly eligible: Br04EligibleRunV1;
    readonly values: readonly number[];
    readonly iterations: readonly (readonly number[])[];
    readonly runDigest: Br04Sha256;
  }[];
}

function groupCellDataV1(
  eligible: readonly Br04EligibleRunV1[],
  metrics: readonly Br04MetricDefinitionV1[],
): Map<string, { environmentCellId: string; phase: Br04Phase; candidateId: string; metrics: Map<Br04MetricRef, Br04RunMetricDataV1> }> {
  const cells = new Map<string, { environmentCellId: string; phase: Br04Phase; candidateId: string; metrics: Map<Br04MetricRef, Br04RunMetricDataV1> }>();
  for (const metric of metrics) {
    const ref = `${metric.metricId}@${metric.metricVersion}` as Br04MetricRef;
    for (const item of eligible) {
      if (item.metricEligibility[ref] !== 'valid') continue;
      const values: number[] = [];
      const iterations: (readonly number[])[] = [];
      for (const iteration of item.envelope.run.iterations) {
        const iterationValues: number[] = [];
        for (const sample of iteration.samples) {
          if (sample.metricRef !== ref || !sample.valid) continue;
          if (!metric.allowedPhases.includes(item.envelope.run.phase)) continue;
          values.push(sample.value);
          iterationValues.push(sample.value);
        }
        if (iterationValues.length > 0) iterations.push(iterationValues);
      }
      if (values.length === 0) continue;
      const key = `${item.envelope.run.environmentCellId}\0${item.envelope.run.phase}\0${item.envelope.run.candidateId}`;
      let cell = cells.get(key);
      if (cell === undefined) {
        cell = {
          environmentCellId: item.envelope.run.environmentCellId,
          phase: item.envelope.run.phase,
          candidateId: item.envelope.run.candidateId,
          metrics: new Map(),
        };
        cells.set(key, cell);
      }
      let data = cell.metrics.get(ref);
      if (data === undefined) {
        data = { metric, ref, runs: [] };
        cell.metrics.set(ref, data);
      }
      data.runs.push({ eligible: item, values, iterations, runDigest: item.envelope.canonicalContentDigest });
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
    const cell = cells.get(cellKey) as { environmentCellId: string; phase: Br04Phase; candidateId: string; metrics: Map<Br04MetricRef, Br04RunMetricDataV1> };
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
        left.eligible.envelope.runId < right.eligible.envelope.runId ? -1 : 1,
      )) {
        processes.add(run.eligible.envelope.run.browserProcessId);
        nIterations += run.iterations.length;
        for (const value of run.values) pooledValues.push(value);
        const scope = { metricRef: ref, unit: metric.unit, sourceRunDigests: [run.runDigest] as readonly Br04Sha256[] };
        const p50 = quantileResultV1({ ...scope, scopeId: `run:${run.eligible.envelope.runId}:${ref}` }, run.values, 0.5);
        const p95 = quantileResultV1({ ...scope, scopeId: `run:${run.eligible.envelope.runId}:${ref}` }, run.values, 0.95);
        const p99 = quantileResultV1({ ...scope, scopeId: `run:${run.eligible.envelope.runId}:${ref}` }, run.values, 0.99);
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
      const pooledScopeId = `cell:${cell.environmentCellId}:${cell.phase}:${cell.candidateId}:${ref}`;
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
      const groupKey = `${cell.environmentCellId}\0${cell.phase}\0${cell.candidateId}\0${ref}`;
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
        nProcesses: processes.size, nRuns: data.runs.length, nIterations, nEvents: pooledValues.length,
        populationQualification: qualification,
        perRunSummaries, descriptivePooledQuantiles, maximum,
        cellPointEstimate: bootstrap.point ?? cellPointEstimate,
        cellInterval: bootstrap.interval,
      });
      claim(`cell:${cell.environmentCellId}:${cell.phase}:${cell.candidateId}:${ref}:point`, 'fact',
        [`${cellPointer}/cellPointEstimate`, `${cellPointer}/cellInterval`], runDigests, slotIds, ref);
      claim(`cell:${cell.environmentCellId}:${cell.phase}:${cell.candidateId}:${ref}:quantiles`, 'fact',
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
      environmentFingerprintDigest: sha256OfCanonicalV1({
        environmentCellId: cell.environmentCellId, phase: cell.phase, candidateId: cell.candidateId,
      }),
      phase: cell.phase,
      candidateId: cell.candidateId,
      metricCells,
    });
    environmentCellIndex += 1;
  }
  const pairedComparisons = buildPairedComparisonsV1(bundle, eligible, claim);
  const capabilityCoverage = buildCapabilityCoverageV1(bundle, eligible);
  applyPairDispositionsV1(ledger, bundle, pairedComparisons);
  const invalidRuns = buildInvalidSummaryV1(bundle, ledger, missingSlots, slotDigestById, pairedComparisons);
  facts.unshift(
    `${validation.counts.observedRuns} of ${validation.counts.plannedSlots} planned runs were observed; ` +
    `${missingSlots.length} planned slots are missing.`,
  );
  const bootstrapPolicyDigest = sha256OfCanonicalV1(bundle.bootstrapPolicy);
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
        : 'eligible-measured' as const,
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

function buildPairedComparisonsV1(
  bundle: Br04AggregateInputBundleV1,
  eligible: readonly Br04EligibleRunV1[],
  claim: (
    claimId: string, klass: Br04ClaimTraceV1['class'], aggregateJsonPointers: readonly string[],
    sourceRunDigests: readonly Br04Sha256[], planSlotIds: readonly string[], metricRef: Br04MetricRef | null,
  ) => void,
): Br04PairedComparisonV1[] {
  const comparisons: Br04PairedComparisonV1[] = [];
  if (bundle.runPlan.comparisonMode !== 'reference-paired') return comparisons;
  const envelopeBySlot = new Map<string, Br04EligibleRunV1>();
  for (const item of eligible) envelopeBySlot.set(item.slot.slotId, item);
  const groups = new Map<string, {
    environmentCellId: string; phase: Br04Phase; metricRef: Br04MetricRef;
    referenceCandidateId: string; candidateId: string; cells: Map<string, Br04PairCellStateV1>;
  }>();
  for (const metric of bundle.metricRegistry) {
    const ref = `${metric.metricId}@${metric.metricVersion}` as Br04MetricRef;
    const byCandidate = new Map<string, { environmentCellId: string; phase: Br04Phase; slots: Br04PlannedRunSlotV1[] }>();
    for (const slot of bundle.runPlan.slots) {
      if (slot.referenceCandidateId === null || slot.pairCellId === null || slot.pairOrdinal === null) continue;
      if (armOfV1(slot, 'reference-paired') === 'unpaired') continue;
      const observed = envelopeBySlot.get(slot.slotId);
      const environmentCellId = observed !== undefined ? observed.envelope.run.environmentCellId : slot.environmentCellId;
      const phase = observed !== undefined ? observed.envelope.run.phase : slot.phase;
      const key = `${slot.candidateId}\0${environmentCellId}\0${phase}`;
      let group = byCandidate.get(key);
      if (group === undefined) {
        group = { environmentCellId, phase, slots: [] };
        byCandidate.set(key, group);
      }
      group.slots.push(slot);
    }
    const referenceGroups = new Map<string, typeof byCandidate>();
    for (const [key, group] of byCandidate) {
      const sample = group.slots[0] as Br04PlannedRunSlotV1;
      const cellKey = `${group.environmentCellId}\0${group.phase}\0${sample.referenceCandidateId ?? ''}`;
      let bucket = referenceGroups.get(cellKey);
      if (bucket === undefined) {
        bucket = new Map();
        referenceGroups.set(cellKey, bucket);
      }
      bucket.set(key, group);
    }
    for (const [, bucket] of referenceGroups) {
      let referenceKey: string | null = null;
      for (const [key, group] of bucket) {
        const sample = group.slots[0] as Br04PlannedRunSlotV1;
        if (sample.referenceCandidateId !== null && sample.candidateId === sample.referenceCandidateId) {
          referenceKey = key;
          break;
        }
      }
      if (referenceKey === null) continue;
      const referenceGroup = bucket.get(referenceKey) as { environmentCellId: string; phase: Br04Phase; slots: Br04PlannedRunSlotV1[] };
      for (const [candidateKey, candidateGroup] of bucket) {
        if (candidateKey === referenceKey) continue;
        const candidateSample = candidateGroup.slots[0] as Br04PlannedRunSlotV1;
        const groupKey = `${referenceGroup.environmentCellId}\0${referenceGroup.phase}\0${ref}\0${candidateSample.referenceCandidateId ?? ''}\0${candidateSample.candidateId}`;
        let group = groups.get(groupKey);
        if (group === undefined) {
          group = {
            environmentCellId: referenceGroup.environmentCellId, phase: referenceGroup.phase,
            metricRef: ref,
            referenceCandidateId: candidateSample.referenceCandidateId as string,
            candidateId: candidateSample.candidateId, cells: new Map(),
          };
          groups.set(groupKey, group);
        }
        const register = (slot: Br04PlannedRunSlotV1, arm: 'reference' | 'comparison'): void => {
          const pairKey = `${slot.balanceBlockId}\0${slot.pairCellId as string}\0${slot.pairOrdinal as number}`;
          let cell = group.cells.get(pairKey);
          if (cell === undefined) {
            cell = {
              key: pairKey, balanceBlockId: slot.balanceBlockId,
              pairCellId: slot.pairCellId as string, pairOrdinal: slot.pairOrdinal as number,
              referenceSlots: [], comparisonSlots: [],
            };
            group.cells.set(pairKey, cell);
          }
          if (arm === 'reference') cell.referenceSlots.push(slot);
          else cell.comparisonSlots.push(slot);
        };
        for (const slot of referenceGroup.slots) {
          if (slot.candidateId === group.referenceCandidateId) register(slot, 'reference');
        }
        for (const slot of candidateGroup.slots) {
          if (slot.candidateId === group.candidateId) register(slot, 'comparison');
        }
      }
    }
  }
  const sortedGroupKeys = [...groups.keys()].sort();
  let comparisonIndex = 0;
  for (const groupKey of sortedGroupKeys) {
    const group = groups.get(groupKey) as {
      environmentCellId: string; phase: Br04Phase; metricRef: Br04MetricRef;
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
      const reasons: string[] = [];
      if (cellState.referenceSlots.length !== 1 || cellState.comparisonSlots.length !== 1) {
        reasons.push('pair-cell-arm-count');
      }
      let refScalar: number | null = null;
      let cmpScalar: number | null = null;
      if (refRun !== undefined && cmpRun !== undefined && reasons.length === 0) {
        if (refRun.envelope.run.environmentCellId !== cmpRun.envelope.run.environmentCellId) {
          reasons.push('environment-cell-diverged');
        }
        if (refRun.envelope.run.phase !== cmpRun.envelope.run.phase) {
          reasons.push('phase-diverged');
        }
        if (refRun.metricEligibility[group.metricRef] !== 'valid') {
          reasons.push(`reference-${refRun.metricEligibility[group.metricRef]}`);
        }
        if (cmpRun.metricEligibility[group.metricRef] !== 'valid') {
          reasons.push(`candidate-${cmpRun.metricEligibility[group.metricRef]}`);
        }
        if (reasons.length === 0) {
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
          refScalar = perRunScalarV1(refValues, metric.perRunStatistic);
          cmpScalar = perRunScalarV1(cmpValues, metric.perRunStatistic);
          if (refScalar === null || cmpScalar === null) reasons.push('scalar-unavailable');
        }
      } else if (reasons.length === 0) {
        reasons.push(refRun === undefined ? 'reference-missing-or-invalid' : 'candidate-missing-or-invalid');
      }
      if (reasons.length > 0) {
        incompletePairCellIds.push(cellState.pairCellId);
        for (const slot of cellState.referenceSlots) incompleteSlotIds.push(slot.slotId);
        for (const slot of cellState.comparisonSlots) incompleteSlotIds.push(slot.slotId);
        continue;
      }
      const referenceValue = refScalar as number;
      const candidateValue = cmpScalar as number;
      const ratioStatus: 'ok' | 'non-positive-reference' | 'domain-invalid' = referenceValue > 0
        ? (metric.numericDomain === 'positive-duration' && candidateValue <= 0 ? 'domain-invalid' : 'ok')
        : 'non-positive-reference';
      const ratio = ratioStatus === 'ok' ? candidateValue / referenceValue : null;
      const refItem = refRun as Br04EligibleRunV1;
      const cmpItem = cmpRun as Br04EligibleRunV1;
      pairValues.push({
        pairCellId: cellState.pairCellId,
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
    completePairCellIds.sort();
    incompletePairCellIds.sort();
    const differences = pairValues.map((pair) => pair.differenceCandidateMinusReference);
    const positiveRatios = pairValues
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
      `${group.environmentCellId}\0${group.phase}\0${group.referenceCandidateId}\0${group.candidateId}\0${group.metricRef}`;
    const estimatorId = `paired:${group.referenceCandidateId}-vs-${group.candidateId}`;
    const differenceBootstrap = pairValues.length === 0
      ? null
      : bootstrapPairedV1({
        metricRef: group.metricRef, unit: metric.unit, canonicalGroupKey, estimatorId,
        clusters: [...pairClusters.values()],
        masterSeedHex: bundle.bootstrapPolicy.masterSeedHex,
        normalizedInputDigest: bundle.manifest.normalizedInputDigest,
      });
    const ratioClusters: Br04PairedClusterInputV1[] = [];
    for (const cluster of pairClusters.values()) {
      const positivePairs = cluster.pairs.filter(
        (pair) => pair.referenceScalar > 0 && pair.candidateScalar > 0,
      );
      if (positivePairs.length > 0) {
        ratioClusters.push({ balanceBlockId: cluster.balanceBlockId, pairs: positivePairs });
      }
    }
    const ratioBootstrap = ratioClusters.length === 0
      ? null
      : bootstrapPairedV1({
        metricRef: group.metricRef, unit: metric.unit, canonicalGroupKey, estimatorId,
        clusters: ratioClusters,
        masterSeedHex: bundle.bootstrapPolicy.masterSeedHex,
        normalizedInputDigest: bundle.manifest.normalizedInputDigest,
      });
    const bootstrap = {
      differenceInterval: differenceBootstrap === null
        ? emptyPairedIntervalV1(bundle, group.metricRef, metric.unit, canonicalGroupKey, `${estimatorId}:difference-median`, 'no-data')
        : differenceBootstrap.differenceInterval,
      ratioInterval: ratioBootstrap === null
        ? emptyPairedIntervalV1(bundle, group.metricRef, metric.unit, canonicalGroupKey, `${estimatorId}:ratio-geomean`, 'no-data')
        : ratioBootstrap.ratioInterval,
    };
    const comparisonPointer = `/pairedComparisons/${comparisonIndex}`;
    const practicalEffect = practicalEffectV1(
      metric.practicalEffectDelta, metric.direction, ratioPointEstimate,
      bootstrap.ratioInterval.lower, bootstrap.ratioInterval.upper,
      bootstrap.ratioInterval.status === 'ok',
    );
    comparisons.push({
      schemaVersion: 1,
      comparisonId: `cmp:${group.environmentCellId}:${group.phase}:${group.metricRef}:${group.referenceCandidateId}-vs-${group.candidateId}`,
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
    claim(`cmp:${group.environmentCellId}:${group.phase}:${group.metricRef}:${group.referenceCandidateId}-vs-${group.candidateId}:estimates`, 'fact',
      [`${comparisonPointer}/differencePointEstimate`, `${comparisonPointer}/ratioPointEstimate`,
        `${comparisonPointer}/differenceInterval`, `${comparisonPointer}/ratioInterval`],
      [...new Set(pairValues.flatMap((pair) => [pair.referenceRunDigest, pair.candidateRunDigest]))].sort(),
      [...new Set(groupCellsSlotIdsV1(group))].sort(), group.metricRef);
    if (incompletePairCellIds.length > 0) {
      claim(`cmp:${group.environmentCellId}:${group.phase}:${group.metricRef}:${group.referenceCandidateId}-vs-${group.candidateId}:incomplete`, 'unknown',
        [`${comparisonPointer}/pairs`], [],
        [...new Set(incompleteSlotIds)].sort(), group.metricRef);
    }
    comparisonIndex += 1;
  }
  return comparisons;
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
  pairedComparisons: readonly Br04PairedComparisonV1[],
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
  const seenPairCells = new Set<string>();
  for (const comparison of pairedComparisons) {
    for (const pairCellId of comparison.pairs.incompletePairCellIds) {
      if (seenPairCells.has(pairCellId)) continue;
      seenPairCells.add(pairCellId);
      incompletePairs.push({
        pairCellId, presentSlotIds: [], missingOrInvalidSlotIds: [],
        reasonCodes: ['incomplete-pair'],
      });
    }
  }
  incompletePairs.sort((left, right) => left.pairCellId < right.pairCellId ? -1 : 1);
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
): void {
  const completePairs = new Set<string>();
  const incompletePairs = new Set<string>();
  for (const comparison of pairedComparisons) {
    for (const pairCellId of comparison.pairs.completePairCellIds) completePairs.add(pairCellId);
    for (const pairCellId of comparison.pairs.incompletePairCellIds) incompletePairs.add(pairCellId);
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
    if (completePairs.has(slot.pairCellId)) row.pairDisposition = 'complete';
    else if (incompletePairs.has(slot.pairCellId)) row.pairDisposition = 'incomplete-pair';
    else row.pairDisposition = 'not-applicable';
  }
}

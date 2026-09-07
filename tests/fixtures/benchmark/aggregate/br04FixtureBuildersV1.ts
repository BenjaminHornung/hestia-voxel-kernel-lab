/**
 * Synthetic BR04 fixture builders (v1). Every fixture built here is
 * synthetic test data: aggregates built from it are strictly ineligible
 * for performance claims (ineligible-synthetic-fixture) and verify the
 * aggregation contract only.
 */
import { canonicalBundleBodyDigestV1 } from '../../../../src/benchmark/aggregate/br04AggregateV1';
import { sha256OfCanonicalV1, sha256OfUtf8V1 } from '../../../../src/benchmark/aggregate/br04StatisticsV1';
import type {
  Br04AggregateInputBundleV1,
  Br04InfrastructureInvalidationRuleV1,
  Br04MetricDefinitionV1,
  Br04MetricRef,
  Br04Phase,
  Br04RunDispositionV1,
  Br04Sha256,
} from '../../../../src/benchmark/aggregate/br04ContractV1';

export const BR04_SYNTHETIC_SEED_00_V1 = '0'.repeat(64);
export const BR04_SYNTHETIC_SEED_01_V1 = `${'0'.repeat(63)}1`;
export const BR04_ACCEPTED_BR03_SYNTHETIC_V1 = 'a'.repeat(40);

export function fakeDigestV1(seed: string): Br04Sha256 {
  return sha256OfUtf8V1(`br04-synthetic:${seed}`);
}

export function chunkMetricV1(): Br04MetricDefinitionV1 {
  return {
    schemaVersion: 1, metricId: 'chunk.mesh.cpu.ms', metricVersion: 1,
    label: 'chunk.mesh.cpu.ms@1', unit: 'ms', numericDomain: 'positive-duration',
    population: 'synthetic chunk cpu durations', requiredTags: [], groupByTags: [],
    pairingKeySuffix: [], aggregationLevel: 'event', perRunStatistic: 'nearest-rank-p95',
    cellEstimator: 'median', allowedPhases: ['cold', 'measurement', 'stress'],
    capabilityRequirement: [], direction: 'lower-is-better',
    lowerLevelResampling: 'fixed-workload', practicalEffectDelta: 0.1,
    automaticDecision: 'forbidden', displaySignificantDigits: 6,
  };
}

export function staleCountMetricV1(): Br04MetricDefinitionV1 {
  return {
    schemaVersion: 1, metricId: 'scheduler.stale.count', metricVersion: 1,
    label: 'scheduler.stale.count@1', unit: 'count', numericDomain: 'non-negative-count',
    population: 'synthetic stale counters', requiredTags: ['observationWindowId', 'staleReason'],
    groupByTags: [], pairingKeySuffix: [], aggregationLevel: 'run', perRunStatistic: 'sum',
    cellEstimator: 'median', allowedPhases: ['measurement', 'stress'],
    capabilityRequirement: [], direction: 'context-dependent',
    lowerLevelResampling: 'none', practicalEffectDelta: null,
    automaticDecision: 'forbidden', displaySignificantDigits: 6,
  };
}

export function gpuMetricV1(): Br04MetricDefinitionV1 {
  return {
    schemaVersion: 1, metricId: 'gpu.time.ms', metricVersion: 1,
    label: 'gpu.time.ms@1', unit: 'ms', numericDomain: 'positive-duration',
    population: 'synthetic gpu durations', requiredTags: [], groupByTags: [],
    pairingKeySuffix: [], aggregationLevel: 'time-block', perRunStatistic: 'nearest-rank-p95',
    cellEstimator: 'median', allowedPhases: ['measurement'],
    capabilityRequirement: ['timestamp-query'], direction: 'lower-is-better',
    lowerLevelResampling: 'predeclared-time-blocks', practicalEffectDelta: 0.1,
    automaticDecision: 'forbidden', displaySignificantDigits: 6,
  };
}

export interface Br04TestSampleSpecV1 {
  readonly metric: Br04MetricRef;
  readonly value: number;
  readonly unit?: string;
  readonly valid?: boolean;
  readonly invalidReason?: string | null;
  readonly tags?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface Br04TestIterationSpecV1 {
  readonly iterationId: string;
  readonly samples: readonly Br04TestSampleSpecV1[];
}

export function iterationV1(
  iterationId: string,
  metric: Br04MetricRef,
  values: readonly number[],
  options?: { unit?: string; tags?: Readonly<Record<string, string | number | boolean | null>> },
): Br04TestIterationSpecV1 {
  return {
    iterationId,
    samples: values.map((value) => ({
      metric,
      value,
      unit: options?.unit,
      valid: true,
      invalidReason: null,
      tags: options?.tags ?? {},
    })),
  };
}

export interface Br04TestRunSpecV1 {
  readonly runId: string;
  readonly slotId: string;
  readonly processId?: string;
  readonly candidateId?: string;
  readonly phase?: Br04Phase;
  readonly environmentCellId?: string;
  readonly disposition?: Br04RunDispositionV1;
  readonly reasonCode?: string | null;
  readonly ruleId?: string | null;
  readonly eligible?: boolean;
  readonly capabilities?: Readonly<Record<string, 'supported' | 'unsupported' | 'error'>>;
  readonly iterations: readonly Br04TestIterationSpecV1[];
  readonly breakReceipt?: 'raw' | 'canonical' | 'plan' | 'registry' | 'status';
}

export interface Br04TestSlotSpecV1 {
  readonly slotId: string;
  readonly candidateId: string;
  readonly pairCellId?: string | null;
  readonly pairOrdinal?: number | null;
  readonly balanceBlockId?: string;
  readonly bootstrapClusterId?: string;
  readonly environmentCellId?: string;
  readonly scenarioId?: string;
  readonly phase?: Br04Phase;
}

export interface Br04TestBundleSpecV1 {
  readonly bundleId?: string;
  readonly comparisonMode?: 'reference-paired' | 'unpaired-only';
  readonly referenceCandidateId?: string | null;
  readonly synthetic?: boolean;
  readonly masterSeedHex?: string;
  readonly metrics?: readonly Br04MetricDefinitionV1[];
  readonly slots: readonly Br04TestSlotSpecV1[];
  readonly runs: readonly Br04TestRunSpecV1[];
  readonly rules?: readonly Br04InfrastructureInvalidationRuleV1[];
}

export function buildTestBundleV1(spec: Br04TestBundleSpecV1): Br04AggregateInputBundleV1 {
  const metrics = spec.metrics ?? [chunkMetricV1()];
  const metricByRef = new Map<Br04MetricRef, Br04MetricDefinitionV1>();
  for (const metric of metrics) {
    metricByRef.set(`${metric.metricId}@${metric.metricVersion}` as Br04MetricRef, metric);
  }
  const planId = `plan-${spec.bundleId ?? 'synthetic'}`;
  const slotSpecs = [...spec.slots].sort((left, right) =>
    left.slotId < right.slotId ? -1 : 1,
  );
  const runSpecs = [...spec.runs].sort((left, right) =>
    left.slotId < right.slotId ? -1 : left.slotId > right.slotId ? 1
      : left.runId < right.runId ? -1 : 1,
  );
  const planBody = {
    planId,
    slots: slotSpecs.map((slot) => ({
      slotId: slot.slotId,
      candidateId: slot.candidateId,
      pairCellId: slot.pairCellId ?? null,
      pairOrdinal: slot.pairOrdinal ?? null,
      balanceBlockId: slot.balanceBlockId ?? 'bb-1',
      bootstrapClusterId: slot.bootstrapClusterId ?? `cluster-${slot.slotId}`,
      environmentCellId: slot.environmentCellId ?? 'cell-h1',
      scenarioId: slot.scenarioId ?? 'mesh-density-sweep-v1',
      phase: slot.phase ?? 'measurement',
    })),
  };
  const planDigest = sha256OfCanonicalV1(planBody);
  const metricRegistryDigest = sha256OfCanonicalV1([...metrics]);
  const envelopes = runSpecs.map((run) => {
    const rawByteDigest = fakeDigestV1(`raw:${run.runId}`);
    const canonicalContentDigest = fakeDigestV1(`canonical:${run.runId}`);
    const receipt = {
      receiptVersion: 1 as const,
      validatorId: 'br01-validator-v1',
      validatorDigest: fakeDigestV1('validator'),
      status: 'schema-and-integrity-valid' as const,
      validatedRawByteDigest: run.breakReceipt === 'raw' ? fakeDigestV1(`broken:${run.runId}`) : rawByteDigest,
      validatedCanonicalContentDigest: run.breakReceipt === 'canonical' ? fakeDigestV1(`broken:${run.runId}`) : canonicalContentDigest,
      planDigest: run.breakReceipt === 'plan' ? fakeDigestV1('broken-plan') : planDigest,
      metricRegistryDigest: run.breakReceipt === 'registry' ? fakeDigestV1('broken-registry') : metricRegistryDigest,
    };
    const brokenStatus = run.breakReceipt === 'status'
      ? { ...receipt, status: 'tampered' as never }
      : receipt;
    return {
      runId: run.runId,
      slotId: run.slotId,
      rawByteDigest,
      canonicalContentDigest,
      br01ValidationReceipt: brokenStatus,
      run: {
        source: {
          repository: 'BenjaminHornung/hestia-voxel-kernel-lab',
          sourceTreeSha: BR04_ACCEPTED_BR03_SYNTHETIC_V1,
          buildSha256: fakeDigestV1('build'),
          dirty: run.disposition === 'source-dirty',
          fixtureContractId: 'fixture-synthetic',
          fixtureContractVersion: 1,
          fixtureDigest: fakeDigestV1('fixture'),
        },
        environmentCellId: run.environmentCellId ?? 'cell-h1',
        browserProcessId: run.processId ?? `process-${run.slotId}`,
        candidateId: run.candidateId ?? slotSpecs.find((slot) => slot.slotId === run.slotId)?.candidateId ?? 'candidate-a',
        phase: run.phase ?? 'measurement',
        measurementEligible: run.eligible ?? true,
        declaredDisposition: run.disposition ?? 'valid',
        declaredReasonCode: run.reasonCode ?? null,
        declaredRuleId: run.ruleId ?? null,
        capabilities: run.capabilities ?? {},
        iterations: run.iterations.map((iteration, ordinal) => ({
          iterationId: iteration.iterationId,
          ordinal,
          samples: iteration.samples.map((sample, sampleIndex) => {
            const metric = metricByRef.get(sample.metric);
            return {
              sampleId: `${iteration.iterationId}:s${sampleIndex}`,
              metricRef: sample.metric,
              value: sample.value,
              unit: sample.unit ?? metric?.unit ?? 'ms',
              valid: sample.valid ?? true,
              invalidReason: sample.invalidReason ?? null,
              tags: sample.tags ?? {},
            };
          }),
        })),
      },
    };
  });
  const body = {
    schemaVersion: 1 as const,
    contractVersion: 'br04-aggregate-input-v1' as const,
    bundleId: spec.bundleId ?? 'bundle-synthetic',
    reportAsOfUtc: '2026-09-07T00:00:00.000Z',
    sourceContract: {
      repository: 'BenjaminHornung/hestia-voxel-kernel-lab' as const,
      acceptedBr03Sha: BR04_ACCEPTED_BR03_SYNTHETIC_V1,
      br01SchemaId: 'benchmark-validation-receipt-v1',
      br01SchemaDigest: fakeDigestV1('schema'),
      br01ValidatorId: 'br01-validator-v1',
      br01ValidatorDigest: fakeDigestV1('validator'),
    },
    runPlan: {
      planId,
      planVersion: 1,
      planDigest,
      acceptedBr03Sha: BR04_ACCEPTED_BR03_SYNTHETIC_V1,
      comparisonMode: spec.comparisonMode ?? 'unpaired-only',
      slots: slotSpecs.map((slot) => ({
        slotId: slot.slotId,
        bootstrapClusterId: slot.bootstrapClusterId ?? `cluster-${slot.slotId}`,
        balanceBlockId: slot.balanceBlockId ?? 'bb-1',
        pairCellId: slot.pairCellId ?? null,
        pairOrdinal: slot.pairOrdinal ?? null,
        candidateId: slot.candidateId,
        referenceCandidateId: spec.referenceCandidateId ?? null,
        environmentCellId: slot.environmentCellId ?? 'cell-h1',
        scenarioId: slot.scenarioId ?? 'mesh-density-sweep-v1',
        scenarioVersion: 1,
        phase: slot.phase ?? 'measurement',
        workloadSeed: 7,
        requiredCapabilities: [],
      })),
      invalidationRegistry: spec.rules ?? [],
      syntheticHardwareProfile: spec.synthetic ?? true,
    },
    metricRegistry: [...metrics],
    bootstrapPolicy: {
      method: 'hierarchical-percentile-v1' as const,
      confidenceLevel: 0.95 as const,
      resamples: 10000 as const,
      minimumTopLevelClusters: 3 as const,
      masterSeedHex: spec.masterSeedHex ?? BR04_SYNTHETIC_SEED_00_V1,
      seedDerivation: 'sha256-bound-xoshiro128ss-v1' as const,
      prng: 'xoshiro128**-32-v1' as const,
      indexSampling: 'uint32-rejection-v1' as const,
    },
    runs: envelopes,
  };
  const normalizedInputDigest = canonicalBundleBodyDigestV1(body);
  const orderedRawRunDigests = envelopes.map((envelope) => envelope.rawByteDigest).sort();
  return {
    ...body,
    manifest: {
      orderedRawRunDigests,
      normalizedInputDigest,
      manifestDigest: sha256OfCanonicalV1({ orderedRawRunDigests, normalizedInputDigest }),
    },
  };
}

export function rangeV1(from: number, to: number): number[] {
  const values: number[] = [];
  for (let value = from; value <= to; value += 1) values.push(value);
  return values;
}

export function repeatV1(value: number, count: number): number[] {
  return Array.from({ length: count }, () => value);
}

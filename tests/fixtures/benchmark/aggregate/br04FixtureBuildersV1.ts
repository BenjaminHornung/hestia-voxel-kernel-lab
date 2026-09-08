/**
 * Synthetic BR04 fixture builders (v1). Every fixture built here is
 * synthetic test data: aggregates built from it are strictly ineligible
 * for performance claims (ineligible-synthetic-fixture) and verify the
 * aggregation contract only.
 */
import { canonicalBundleBodyDigestV1 } from '../../../../src/benchmark/aggregate/br04AggregateV1';
import { crosswalkToBundleV1 } from '../../../../src/benchmark/aggregate/br04CrosswalkV1';
import { sha256OfCanonicalV1, sha256OfUtf8V1 } from '../../../../src/benchmark/aggregate/br04StatisticsV1';
import { BENCHMARK_METRIC_REGISTRY_V1 } from '../../../../src/benchmark/contracts';
import type {
  BenchmarkRunDocumentV1,
  BenchmarkRunV1,
  BenchmarkValidationReceiptV1,
} from '../../../../src/benchmark/contracts';
import type { BuiltRunPlanV1 } from '../../../../src/benchmark/runner/contractsV1';
import type {
  Br04AggregateInputBundleV1,
  Br04BootstrapPolicyV1,
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
  readonly scenarioId?: string;
  readonly workloadSeed?: number;
  readonly environmentFingerprint?: Br04Sha256;
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
  readonly scenarioVersion?: number;
  readonly workloadSeed?: number;
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
    const slot = slotSpecs.find((entry) => entry.slotId === run.slotId);
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
        scenarioId: run.scenarioId ?? slot?.scenarioId ?? 'mesh-density-sweep-v1',
        scenarioVersion: 1,
        workloadSeed: run.workloadSeed ?? slot?.workloadSeed ?? 7,
        environmentFingerprint: run.environmentFingerprint ?? fakeDigestV1('env:default'),
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
        scenarioVersion: slot.scenarioVersion ?? 1,
        phase: slot.phase ?? 'measurement',
        workloadSeed: slot.workloadSeed ?? 7,
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

/**
 * R2 contract-fixture builders: genuine frozen BR01/BR03 contract shapes
 * (real BENCHMARK_METRIC_REGISTRY_V1, real scenario ids, kebab-case
 * dimensions, document-embedded runs) for Crosswalk -> Aggregator -> Report
 * regressions. Runs are synthetic (fixed SHAs) and stay
 * ineligible-synthetic-fixture unless a test opts out.
 */
export const R2_COMMIT_V1 = 'b'.repeat(40);
export const R2_BUILD_V1 = fakeDigestV1('r2-build');
export const R2_FIXTURE_V1 = fakeDigestV1('r2-fixture');
export const R2_BINDING_V1 = fakeDigestV1('r2-binding');
export const R2_CHUNK_V1 = 'chunk.mesh.cpu.ms@1' as Br04MetricRef;
export const R2_MEMORY_V1 = 'memory.bytes@1' as Br04MetricRef;
export const R2_COUNT_V1 = 'longtask.count@1' as Br04MetricRef;

export const R2_POLICY_V1: Br04BootstrapPolicyV1 = {
  method: 'hierarchical-percentile-v1',
  confidenceLevel: 0.95,
  resamples: 10000,
  minimumTopLevelClusters: 3,
  masterSeedHex: BR04_SYNTHETIC_SEED_00_V1,
  seedDerivation: 'sha256-bound-xoshiro128ss-v1',
  prng: 'xoshiro128**-32-v1',
  indexSampling: 'uint32-rejection-v1',
};

export interface R2UnitSpecV1 {
  readonly slot: string;
  readonly candidate: string;
  readonly scenario?: string;
  readonly seed?: number;
  readonly block?: string;
  readonly pairCell?: string | null;
  readonly pairOrdinal?: number | null;
}

export interface R2RunSpecV1 {
  readonly runId: string;
  readonly slot: string;
  readonly candidate: string;
  readonly block?: string;
  readonly scenario?: string;
  readonly metric?: Br04MetricRef;
  readonly unit?: string;
  readonly values: readonly number[];
  readonly dims?: readonly { readonly key: string; readonly value: string }[];
  readonly sampleBinding?: Br04Sha256 | null;
  readonly capabilities?: readonly string[];
  readonly validity?: { status: 'valid' } | { status: 'invalid'; reasons: { code: string; detail: string; phase: string }[] };
  readonly eligible?: boolean;
  readonly eligibilityReasons?: { code: string; detail: string; phase: string }[];
}

export interface R2CrosswalkEntryV1 {
  readonly document: BenchmarkRunDocumentV1;
  readonly run: BenchmarkRunV1;
  readonly receipt: BenchmarkValidationReceiptV1;
}

export function r2PlanV1(
  planId: string,
  units: readonly R2UnitSpecV1[],
  options?: {
    comparisonMode?: 'reference-paired' | 'unpaired-only';
    referenceCandidateId?: string | null;
    synthetic?: boolean;
  },
): BuiltRunPlanV1 {
  return {
    runPlanId: planId,
    runPlanSha256: fakeDigestV1(`r2-plan:${planId}`),
    core: {
      expectedSourceCommitSha: R2_COMMIT_V1,
      expectedBuildSha256: R2_BUILD_V1,
      fixtureContractId: 'fixture-r2',
      fixtureSemanticSha256: R2_FIXTURE_V1,
      syntheticHardwareProfile: options?.synthetic ?? true,
      comparisonMode: options?.comparisonMode ?? 'unpaired-only',
      referenceCandidateId: options?.referenceCandidateId ?? null,
      orderSeed: 7,
      processUnits: units.map((spec) => ({
        processOrdinal: 0,
        processContainer: 'warm-measurement',
        scenarioId: spec.scenario ?? 'mesh-density-sweep-v1',
        scenarioParameters: [{ key: 'seed', value: spec.seed ?? 7 }],
        candidateId: spec.candidate,
        comparisonArm: 'unpaired',
        balanceBlockId: spec.block ?? 'bb-1',
        rowOrdinal: 0,
        sequencePosition: 0,
        measurementIterations: 1,
        measurementEligible: false,
        freshBrowserProcess: true,
        freshProfile: true,
        ids: {
          slotId: spec.slot,
          browserProcessId: `process-${spec.slot}`,
          bootstrapClusterId: `cluster-${spec.slot}`,
          pairCellId: spec.pairCell ?? 'pc-x',
          pairOrdinal: spec.pairOrdinal ?? 1,
          ownership: {
            slotId: 'BR03', browserProcessId: 'BR03', bootstrapClusterId: 'BR03',
            pairCellId: 'BR03', pairOrdinal: 'BR03',
          },
        },
      })),
    },
  } as unknown as BuiltRunPlanV1;
}

export function r2EntryV1(
  plan: BuiltRunPlanV1,
  spec: R2RunSpecV1,
  mutateRun?: (run: Record<string, unknown>) => void,
): R2CrosswalkEntryV1 {
  const metric = spec.metric ?? R2_CHUNK_V1;
  const unitValue = spec.unit ?? (metric === R2_MEMORY_V1 ? 'bytes' : metric === R2_COUNT_V1 ? 'count' : 'ms');
  const run = {
    runId: spec.runId,
    ids: { slotId: spec.slot, bootstrapClusterId: `cluster-${spec.slot}` },
    hardwareCellId: 'cell-h1',
    browserProcessId: `process-${spec.slot}`,
    execution: {
      order: { candidateId: spec.candidate, blockId: spec.block ?? 'bb-1' },
      phase: 'measurement',
      validity: spec.validity ?? { status: 'valid' },
    },
    environment: {
      capabilities: (spec.capabilities ?? []).map((id) => ({
        id, value: { status: 'observed', value: true },
      })),
    },
    iterations: [{
      iterationId: `iter-${spec.runId}`,
      phase: 'measurement',
      samples: spec.values.map((value, index) => ({
        sampleId: `sample-${index}`,
        phase: 'measurement',
        metricRef: metric,
        unit: unitValue,
        result: { status: 'valid', value },
        dimensions: [...(spec.dims ?? [])],
        runBindingSha256: spec.sampleBinding === undefined ? R2_BINDING_V1 : spec.sampleBinding,
      })),
    }],
    source: {
      repositoryUrl: 'BenjaminHornung/hestia-voxel-kernel-lab',
      commitTreeSha: R2_COMMIT_V1,
      commitSha: R2_COMMIT_V1,
      build: { sha256: R2_BUILD_V1 },
      fixture: {
        id: 'fixture-r2',
        version: 1,
        semanticSha256: { status: 'observed', value: R2_FIXTURE_V1 },
        sourceFileSetSha256: { status: 'observed', value: R2_FIXTURE_V1 },
      },
    },
    scenario: { id: spec.scenario ?? 'mesh-density-sweep-v1', version: 1 },
    measurementEligible: spec.eligible ?? true,
    measurementEligibilityReasons: spec.eligibilityReasons ?? [],
    runBindingSha256: R2_BINDING_V1,
  } as unknown as BenchmarkRunV1;
  const document = {
    browserProcesses: [{ runs: [run], ids: { bootstrapClusterId: `cluster-${spec.slot}` } }],
  } as unknown as BenchmarkRunDocumentV1;
  if (mutateRun !== undefined) mutateRun(run as unknown as Record<string, unknown>);
  const receipt = {
    status: 'schema-and-integrity-valid',
    runId: spec.runId,
    slotId: spec.slot,
    benchmarkRunRawByteSha256: fakeDigestV1(`r2-raw:${spec.runId}`),
    benchmarkRunCanonicalSha256: fakeDigestV1(`r2-canonical:${spec.runId}`),
    planDigest: plan.runPlanSha256,
    metricRegistrySha256: BENCHMARK_METRIC_REGISTRY_V1.metricRegistrySha256,
    runBindingSha256: R2_BINDING_V1,
    validator: { id: 'br01-validator-v1', sourceFileSetSha256: fakeDigestV1('r2-validator') },
    schemaVersion: 'benchmark-validation-receipt-v1',
    schemaSetSha256: fakeDigestV1('r2-schema'),
  } as unknown as BenchmarkValidationReceiptV1;
  return { document, run, receipt };
}

export function r2BundleV1(
  bundleId: string,
  plan: BuiltRunPlanV1,
  entries: readonly R2CrosswalkEntryV1[],
  policy: Br04BootstrapPolicyV1 = R2_POLICY_V1,
) {
  return crosswalkToBundleV1({
    acceptedBr03Sha: R2_COMMIT_V1,
    bundleId,
    reportAsOfUtc: '2026-09-07T00:00:00.000Z',
    plan,
    registry: BENCHMARK_METRIC_REGISTRY_V1,
    bootstrapPolicy: policy,
    runs: entries.map((entry) => ({
      document: entry.document,
      run: entry.run,
      receipt: entry.receipt,
      rawByteDigest: entry.receipt.benchmarkRunRawByteSha256 as string as Br04Sha256,
      canonicalContentDigest: entry.receipt.benchmarkRunCanonicalSha256 as string as Br04Sha256,
    })),
  });
}

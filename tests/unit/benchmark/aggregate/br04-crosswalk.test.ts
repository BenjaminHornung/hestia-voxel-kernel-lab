/**
 * BR04 crosswalk duties: frozen BR01/BR03 inputs project onto the bundle
 * contract without reinterpreting IDs, with fail-closed receipt, hierarchy,
 * rule, and provenance checks (XW-Block-01, XW-Phase-01, XW-Rule-01/02,
 * XW-Synth-01, XW-Disp-01).
 */
import { describe, expect, it } from 'vitest';
import { BENCHMARK_METRIC_REGISTRY_V1 } from '../../../../src/benchmark/contracts';
import type {
  BenchmarkRunDocumentV1,
  BenchmarkRunV1,
  BenchmarkValidationReceiptV1,
  MetricRegistryV1,
} from '../../../../src/benchmark/contracts';
import type { BuiltRunPlanV1 } from '../../../../src/benchmark/runner/contractsV1';
import { crosswalkToBundleV1, normalizeDimensionKeyV1, projectMetricDefinitionV1 } from '../../../../src/benchmark/aggregate/br04CrosswalkV1';
import { sha256OfCanonicalV1 } from '../../../../src/benchmark/aggregate/br04StatisticsV1';
import { validateAndAggregateBundleV1 } from '../../../../src/benchmark/aggregate/br04AggregateV1';
import type { Br04BootstrapPolicyV1, Br04Sha256 } from '../../../../src/benchmark/aggregate/br04ContractV1';
import {
  BR04_ACCEPTED_BR03_SYNTHETIC_V1,
  BR04_SYNTHETIC_SEED_00_V1,
  fakeDigestV1,
  R2_MEMORY_V1,
  R2_POLICY_V1,
  r2BundleV1,
  r2EntryV1,
  r2PlanV1,
} from '../../../fixtures/benchmark/aggregate/br04FixtureBuildersV1';

const BUILD_DIGEST = fakeDigestV1('xw-build');
const FIXTURE_DIGEST = fakeDigestV1('xw-fixture');

function frozenMetricRegistryV1(): MetricRegistryV1 {
  return {
    schemaVersion: 'benchmark-metric-registry-v1',
    protocolVersion: '1',
    metrics: [{
      schemaVersion: 'benchmark-metric-definition-v1',
      metricRef: 'chunk.mesh.cpu.ms@1',
      kind: 'duration',
      unit: 'ms',
      numericDomain: { kind: 'positive-finite-number', minimum: 0, maximum: null },
      eventSemantics: 'synthetic chunk duration',
      populationSemantics: 'synthetic chunk population',
      allowedContainers: ['warm-measurement'],
      allowedPhases: ['measurement'],
      capabilityRequirements: [],
      sourceMapping: [],
      grouping: { keys: [], population: 'synthetic' },
      pairing: { keys: [], level: 'event' },
      dimensionContracts: [],
      direction: 'lower',
      warmupControl: null,
      practicalEffectDelta: null,
      automaticDecision: 'forbidden',
    }],
    telemetryMappings: [],
    producibilityCrosswalk: [],
    reachabilityMatrix: [],
    metricRegistrySha256: fakeDigestV1('xw-registry'),
  } as unknown as MetricRegistryV1;
}

function frozenPlanV1(): BuiltRunPlanV1 {
  return {
    runPlanId: 'plan-xw',
    runPlanSha256: fakeDigestV1('xw-plan'),
    core: {
      expectedSourceCommitSha: BR04_ACCEPTED_BR03_SYNTHETIC_V1,
      expectedBuildSha256: BUILD_DIGEST,
      fixtureContractId: 'fixture-xw',
      fixtureSemanticSha256: FIXTURE_DIGEST,
      syntheticHardwareProfile: true,
      comparisonMode: 'unpaired-only',
      referenceCandidateId: null,
      orderSeed: 7,
      processUnits: [{
        processOrdinal: 0,
        processContainer: 'warm-measurement',
        scenarioId: 'mesh-density-sweep-v1',
        scenarioParameters: [],
        candidateId: 'candidate-a',
        comparisonArm: 'unpaired',
        balanceBlockId: 'bb-9',
        rowOrdinal: 0,
        sequencePosition: 0,
        measurementIterations: 1,
        measurementEligible: false,
        freshBrowserProcess: true,
        freshProfile: true,
        ids: {
          slotId: 'slot-xw', browserProcessId: 'process-xw',
          bootstrapClusterId: 'cluster-xw', pairCellId: 'pc-xw', pairOrdinal: 1,
          ownership: {
            slotId: 'BR03', browserProcessId: 'BR03', bootstrapClusterId: 'BR03',
            pairCellId: 'BR03', pairOrdinal: 'BR03',
          },
        },
      }],
    },
  } as unknown as BuiltRunPlanV1;
}

interface Br04FrozenSampleV1 {
  readonly value: number;
  readonly phase?: string;
  readonly valid?: boolean;
}

function frozenRunV1(
  samples: readonly Br04FrozenSampleV1[],
  iterationPhase = 'measurement',
  overrides?: {
    slotId?: string;
    validity?: { status: 'valid' } | { status: 'invalid'; reasons: { code: string; detail: string; phase: string }[] };
    buildDigest?: Br04Sha256;
    commitSha?: string;
  },
): { document: BenchmarkRunDocumentV1; run: BenchmarkRunV1; receipt: BenchmarkValidationReceiptV1; rawByteDigest: Br04Sha256; canonicalContentDigest: Br04Sha256 } {
  const slotId = overrides?.slotId ?? 'slot-xw';
  const run = {
    runId: 'run-xw',
    ids: { slotId, bootstrapClusterId: 'cluster-xw' },
    hardwareCellId: 'cell-xw',
    browserProcessId: 'process-xw',
    execution: {
      order: { candidateId: 'candidate-a', blockId: 'bb-9' },
      phase: 'measurement',
      validity: overrides?.validity ?? { status: 'valid' },
    },
    environment: { capabilities: [] },
    iterations: [{
      iterationId: 'iter-xw',
      phase: iterationPhase,
      samples: samples.map((sample, index) => ({
        sampleId: `sample-${index}`,
        phase: sample.phase ?? iterationPhase,
        metricRef: 'chunk.mesh.cpu.ms@1',
        unit: 'ms',
        result: sample.valid === false
          ? { status: 'invalid', reason: { code: 'sample-invalid', detail: 'synthetic', phase: 'measurement' } }
          : { status: 'valid', value: sample.value },
        dimensions: [],
      })),
    }],
    source: {
      repositoryUrl: 'BenjaminHornung/hestia-voxel-kernel-lab',
      commitTreeSha: BR04_ACCEPTED_BR03_SYNTHETIC_V1,
      commitSha: overrides?.commitSha ?? BR04_ACCEPTED_BR03_SYNTHETIC_V1,
      build: { sha256: overrides?.buildDigest ?? BUILD_DIGEST },
      fixture: {
        id: 'fixture-xw',
        version: 1,
        semanticSha256: { status: 'observed', value: FIXTURE_DIGEST },
        sourceFileSetSha256: { status: 'observed', value: FIXTURE_DIGEST },
      },
    },
    measurementEligible: true,
    measurementEligibilityReasons: [],
  } as unknown as BenchmarkRunV1;
  const document = {
    browserProcesses: [{ runs: [run], ids: { bootstrapClusterId: 'cluster-xw' } }],
  } as unknown as BenchmarkRunDocumentV1;
  /**
   * R3/B3-Rest: genuine validated digests bound to the document bytes, so
   * the crosswalk recomputation check taken from the BR01 canonicalizer
   * accepts untampered fixtures and refuses stale receipts.
   */
  const documentDigest = sha256OfCanonicalV1(document);
  const receipt = {
    status: 'schema-and-integrity-valid',
    runId: 'run-xw',
    slotId,
    benchmarkRunRawByteSha256: documentDigest,
    benchmarkRunCanonicalSha256: documentDigest,
    planDigest: fakeDigestV1('xw-plan'),
    metricRegistrySha256: fakeDigestV1('xw-registry'),
    validator: { id: 'br01-validator-v1', sourceFileSetSha256: fakeDigestV1('xw-validator') },
    schemaVersion: 'benchmark-validation-receipt-v1',
    schemaSetSha256: fakeDigestV1('xw-schema'),
  } as unknown as BenchmarkValidationReceiptV1;
  return { document, run, receipt, rawByteDigest: documentDigest, canonicalContentDigest: documentDigest };
}

const POLICY: Br04BootstrapPolicyV1 = {
  method: 'hierarchical-percentile-v1',
  confidenceLevel: 0.95,
  resamples: 10000,
  minimumTopLevelClusters: 3,
  masterSeedHex: BR04_SYNTHETIC_SEED_00_V1,
  seedDerivation: 'sha256-bound-xoshiro128ss-v1',
  prng: 'xoshiro128**-32-v1',
  indexSampling: 'uint32-rejection-v1',
};

describe('BR04 crosswalk', () => {
  it('projects frozen inputs verbatim with block binding, warmup exclusion, and synthetic flag', () => {
    const frozen = frozenRunV1([{ value: 5 }]);
    const warmupRun = {
      ...frozen.run,
      iterations: [
        {
          iterationId: 'iter-warm', phase: 'warmup',
          samples: [{
            sampleId: 'sample-w', phase: 'warmup', metricRef: 'chunk.mesh.cpu.ms@1',
            unit: 'ms', result: { status: 'valid', value: 999 }, dimensions: [],
          }],
        },
        ...(frozen.run.iterations as unknown[]),
      ],
    } as unknown as BenchmarkRunV1;
    const warmupDocument = {
      browserProcesses: [{ runs: [warmupRun], ids: { bootstrapClusterId: 'cluster-xw' } }],
    } as unknown as BenchmarkRunDocumentV1;
    const warmupDigest = sha256OfCanonicalV1(warmupDocument);
    const result = crosswalkToBundleV1({
      acceptedBr03Sha: BR04_ACCEPTED_BR03_SYNTHETIC_V1,
      bundleId: 'xw-valid',
      reportAsOfUtc: '2026-09-07T00:00:00.000Z',
      plan: frozenPlanV1(),
      registry: frozenMetricRegistryV1(),
      bootstrapPolicy: POLICY,
      runs: [{
        document: warmupDocument,
        run: warmupRun,
        receipt: {
          ...frozen.receipt,
          benchmarkRunRawByteSha256: warmupDigest,
          benchmarkRunCanonicalSha256: warmupDigest,
        } as BenchmarkValidationReceiptV1,
        rawByteDigest: warmupDigest,
        canonicalContentDigest: warmupDigest,
      }],
    });
    expect(result.issues).toEqual([]);
    const bundle = result.bundle;
    expect(bundle).not.toBeNull();
    expect(bundle?.runPlan.slots[0]?.balanceBlockId).toBe('bb-9');
    expect(bundle?.runPlan.slots[0]?.bootstrapClusterId).toBe('cluster-xw');
    expect(bundle?.runPlan.slots[0]?.pairCellId).toBe('pc-xw');
    expect(bundle?.runPlan.syntheticHardwareProfile).toBe(true);
    expect(bundle?.runs[0]?.run.iterations.length).toBe(1);
    expect(bundle?.runs[0]?.run.iterations[0]?.samples[0]?.value).toBe(5);
    expect(bundle?.metricRegistry[0]?.practicalEffectDelta).toBeNull();
    const aggregated = validateAndAggregateBundleV1(bundle ?? (() => {
      throw new Error('missing bundle');
    })());
    expect(aggregated.validation.status).toBe('valid');
    expect(aggregated.aggregate?.inputProvenance.performanceClaimEligibility)
      .toBe('ineligible-synthetic-fixture');
  });

  it('receipt digest mismatch refuses the bundle without guessing', () => {
    const frozen = frozenRunV1([{ value: 5 }]);
    const result = crosswalkToBundleV1({
      acceptedBr03Sha: BR04_ACCEPTED_BR03_SYNTHETIC_V1,
      bundleId: 'xw-receipt',
      reportAsOfUtc: '2026-09-07T00:00:00.000Z',
      plan: frozenPlanV1(),
      registry: frozenMetricRegistryV1(),
      bootstrapPolicy: POLICY,
      runs: [{
        document: frozen.document, run: frozen.run, receipt: frozen.receipt,
        rawByteDigest: fakeDigestV1('xw-tampered'),
        canonicalContentDigest: fakeDigestV1('xw-canonical'),
      }],
    });
    expect(result.bundle).toBeNull();
    expect(result.issues.some((issue) => issue.code === 'RECEIPT_DIGEST_MISMATCH')).toBe(true);
  });

  it('unknown slots and missing hierarchy parents are refused, never reconstructed', () => {
    const ghost = frozenRunV1([{ value: 5 }], 'measurement', { slotId: 'slot-ghost' });
    const ghostResult = crosswalkToBundleV1({
      acceptedBr03Sha: BR04_ACCEPTED_BR03_SYNTHETIC_V1,
      bundleId: 'xw-ghost',
      reportAsOfUtc: '2026-09-07T00:00:00.000Z',
      plan: frozenPlanV1(),
      registry: frozenMetricRegistryV1(),
      bootstrapPolicy: POLICY,
      runs: [{
        document: ghost.document, run: ghost.run,
        receipt: { ...ghost.receipt, slotId: 'slot-ghost' } as BenchmarkValidationReceiptV1,
        rawByteDigest: ghost.rawByteDigest,
        canonicalContentDigest: ghost.canonicalContentDigest,
      }],
    });
    expect(ghostResult.bundle).toBeNull();
    expect(ghostResult.issues.some((issue) => issue.code === 'UNKNOWN_SLOT')).toBe(true);
    const orphan = frozenRunV1([{ value: 5 }]);
    const orphanResult = crosswalkToBundleV1({
      acceptedBr03Sha: BR04_ACCEPTED_BR03_SYNTHETIC_V1,
      bundleId: 'xw-orphan',
      reportAsOfUtc: '2026-09-07T00:00:00.000Z',
      plan: frozenPlanV1(),
      registry: frozenMetricRegistryV1(),
      bootstrapPolicy: POLICY,
      runs: [{
        document: { browserProcesses: [] } as unknown as BenchmarkRunDocumentV1,
        run: orphan.run, receipt: orphan.receipt,
        rawByteDigest: orphan.rawByteDigest,
        canonicalContentDigest: orphan.canonicalContentDigest,
      }],
    });
    expect(orphanResult.bundle).toBeNull();
    expect(orphanResult.issues.some((issue) => issue.code === 'RUN_NOT_IN_DOCUMENT')).toBe(true);
  });

  it('infrastructure claims need a predeclared rule; candidate failures reject rule binding', () => {
    const infra = frozenRunV1([{ value: 5 }], 'measurement', {
      validity: {
        status: 'invalid',
        reasons: [{ code: 'infrastructure-failure', detail: 'synthetic', phase: 'measurement' }],
      },
    });
    const base = {
      acceptedBr03Sha: BR04_ACCEPTED_BR03_SYNTHETIC_V1,
      bundleId: 'xw-infra',
      reportAsOfUtc: '2026-09-07T00:00:00.000Z',
      plan: frozenPlanV1(),
      registry: frozenMetricRegistryV1(),
      bootstrapPolicy: POLICY,
    };
    const runEntry = {
      document: infra.document, run: infra.run, receipt: infra.receipt,
      rawByteDigest: infra.rawByteDigest,
      canonicalContentDigest: infra.canonicalContentDigest,
    };
    const undeclared = crosswalkToBundleV1({ ...base, runs: [runEntry] });
    expect(undeclared.bundle).toBeNull();
    expect(undeclared.issues.some((issue) => issue.code === 'UNDECLARED_INVALIDATION_CODE')).toBe(true);
    const rule = {
      ruleId: 'host-suspend-resume', version: 1, scope: 'whole-run' as const,
      detectionStage: 'during-run-independent-monitor' as const,
      machineCheckablePredicateId: 'host-suspend-resume-v1',
      candidateIndependent: true as const, valueBlind: true as const,
      retryAllowed: false, maxRetries: 0 as const,
    };
    const declared = crosswalkToBundleV1({
      ...base,
      invalidationRegistry: [rule],
      runs: [{ ...runEntry, declaredRuleId: 'host-suspend-resume' }],
    });
    expect(declared.bundle).not.toBeNull();
    expect(declared.bundle?.runs[0]?.run.declaredDisposition).toBe('infrastructure-invalid');
    const candidate = frozenRunV1([{ value: 5 }], 'measurement', {
      validity: {
        status: 'invalid',
        reasons: [{ code: 'page-error', detail: 'synthetic', phase: 'measurement' }],
      },
    });
    const conflict = crosswalkToBundleV1({
      ...base,
      bundleId: 'xw-conflict',
      invalidationRegistry: [rule],
      runs: [{
        document: candidate.document, run: candidate.run, receipt: candidate.receipt,
        rawByteDigest: candidate.rawByteDigest,
        canonicalContentDigest: candidate.canonicalContentDigest,
        declaredRuleId: 'host-suspend-resume',
      }],
    });
    expect(conflict.bundle).toBeNull();
    expect(conflict.issues.some((issue) => issue.code === 'DISPOSITION_CONFLICT')).toBe(true);
  });

  it('provenance and dirty signals classify without reinterpretation', () => {
    const dirty = frozenRunV1([{ value: 5 }], 'measurement', {
      validity: {
        status: 'invalid',
        reasons: [{ code: 'source-dirty', detail: 'synthetic', phase: 'measurement' }],
      },
    });
    const base = {
      acceptedBr03Sha: BR04_ACCEPTED_BR03_SYNTHETIC_V1,
      bundleId: 'xw-dirty',
      reportAsOfUtc: '2026-09-07T00:00:00.000Z',
      plan: frozenPlanV1(),
      registry: frozenMetricRegistryV1(),
      bootstrapPolicy: POLICY,
    };
    const entry = {
      document: dirty.document, run: dirty.run, receipt: dirty.receipt,
      rawByteDigest: dirty.rawByteDigest,
      canonicalContentDigest: dirty.canonicalContentDigest,
    };
    expect(crosswalkToBundleV1({ ...base, runs: [entry] }).bundle?.runs[0]?.run.declaredDisposition)
      .toBe('source-dirty');
    const drifted = frozenRunV1([{ value: 5 }], 'measurement', { buildDigest: fakeDigestV1('xw-other-build') });
    const driftedResult = crosswalkToBundleV1({
      ...base,
      bundleId: 'xw-drift',
      runs: [{
        document: drifted.document, run: drifted.run, receipt: drifted.receipt,
        rawByteDigest: drifted.rawByteDigest,
        canonicalContentDigest: drifted.canonicalContentDigest,
      }],
    });
    expect(driftedResult.bundle?.runs[0]?.run.declaredDisposition).toBe('provenance-mismatch');
  });

  it('the BR01-owned registry projects without a shadow register', () => {    const metric = BENCHMARK_METRIC_REGISTRY_V1.metrics.find(
      (entry) => (entry.metricRef as string) === 'chunk.mesh.cpu.ms@1',
    );
    expect(metric).toBeDefined();
    const { definition, skippedUnit } = projectMetricDefinitionV1(
      metric ?? ({} as unknown as typeof BENCHMARK_METRIC_REGISTRY_V1.metrics[number]),
    );
    expect(skippedUnit).toBe(false);
    expect(definition?.unit).toBe('ms');
    expect(definition?.automaticDecision).toBe('forbidden');
  });
});

describe('BR04 R2 crosswalk regressions (B1-B3)', () => {
  it('B1: real frozen memory dimensions pass the single versioned name boundary', () => {
    expect(normalizeDimensionKeyV1('memory-kind')).toBe('memoryKind');
    expect(normalizeDimensionKeyV1('observation-window-id')).toBe('observationWindowId');
    expect(normalizeDimensionKeyV1('stale-reason')).toBe('staleReason');
    expect(normalizeDimensionKeyV1('drop-kind')).toBe('dropKind');
    expect(normalizeDimensionKeyV1('checkpoint-id')).toBe('checkpointId');
    expect(normalizeDimensionKeyV1('hardware-profile')).toBe('hardware-profile');
    const plan = r2PlanV1('r2-b1', [{ slot: 'slot-b1', candidate: 'candidate-a' }]);
    const entry = r2EntryV1(plan, {
      runId: 'run-b1', slot: 'slot-b1', candidate: 'candidate-a',
      metric: R2_MEMORY_V1, values: [1048576],
      dims: [
        { key: 'memory-kind', value: 'js-heap' },
        { key: 'checkpoint-id', value: 'checkpoint-0' },
      ],
    });
    const { bundle, issues } = r2BundleV1('r2-b1', plan, [entry]);
    expect(issues).toEqual([]);
    expect(bundle).not.toBeNull();
    const tags = bundle?.runs[0]?.run.iterations[0]?.samples[0]?.tags;
    expect(tags?.['memoryKind']).toBe('js-heap');
    expect(tags?.['checkpointId']).toBe('checkpoint-0');
    const { validation, aggregate } = validateAndAggregateBundleV1(bundle ?? (() => {
      throw new Error('missing bundle');
    })());
    expect(validation.status).toBe('valid');
    expect(aggregate?.environmentCells[0]?.metricCells[0]?.maximum).toBe(1048576);
  });

  it('B2: workload seeds separate absolute populations on one hardware cell', () => {
    const plan = r2PlanV1('r2-b2seed', [
      { slot: 'slot-s7', candidate: 'candidate-a', seed: 7 },
      { slot: 'slot-s8', candidate: 'candidate-a', seed: 8 },
    ]);
    const { bundle } = r2BundleV1('r2-b2seed', plan, [
      r2EntryV1(plan, { runId: 'run-s7', slot: 'slot-s7', candidate: 'candidate-a', values: [1] }),
      r2EntryV1(plan, { runId: 'run-s8', slot: 'slot-s8', candidate: 'candidate-a', values: [1000] }),
    ]);
    const { validation, aggregate } = validateAndAggregateBundleV1(bundle ?? (() => {
      throw new Error('missing bundle');
    })());
    expect(validation.status).toBe('valid');
    expect(aggregate?.environmentCells.length).toBe(2);
    const maxima = (aggregate?.environmentCells ?? [])
      .map((cell) => cell.metricCells[0]?.maximum)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(maxima).toEqual([1, 1000]);
    const fingerprints = (aggregate?.environmentCells ?? []).map((cell) => cell.environmentFingerprintDigest);
    expect(new Set(fingerprints).size).toBe(2);
  });

  it('B2: scenarios and memory kinds separate absolute populations', () => {
    const plan = r2PlanV1('r2-b2s', [
      { slot: 'slot-m1', candidate: 'candidate-a', scenario: 'mesh-density-sweep-v1' },
      { slot: 'slot-m2', candidate: 'candidate-a', scenario: 'scheduler-steady-v1' },
    ]);
    const { bundle } = r2BundleV1('r2-b2s', plan, [
      r2EntryV1(plan, { runId: 'run-m1', slot: 'slot-m1', candidate: 'candidate-a', scenario: 'mesh-density-sweep-v1', values: [1] }),
      r2EntryV1(plan, { runId: 'run-m2', slot: 'slot-m2', candidate: 'candidate-a', scenario: 'scheduler-steady-v1', values: [1000] }),
    ]);
    const { aggregate } = validateAndAggregateBundleV1(bundle ?? (() => {
      throw new Error('missing bundle');
    })());
    expect(aggregate?.environmentCells.length).toBe(2);
    const planKind = r2PlanV1('r2-b2k', [
      { slot: 'slot-k1', candidate: 'candidate-a' },
      { slot: 'slot-k2', candidate: 'candidate-a' },
    ]);
    const kindBundle = r2BundleV1('r2-b2k', planKind, [
      r2EntryV1(planKind, {
        runId: 'run-k1', slot: 'slot-k1', candidate: 'candidate-a',
        metric: R2_MEMORY_V1, values: [100],
        dims: [{ key: 'memory-kind', value: 'js-heap' }, { key: 'checkpoint-id', value: 'checkpoint-0' }],
      }),
      r2EntryV1(planKind, {
        runId: 'run-k2', slot: 'slot-k2', candidate: 'candidate-a',
        metric: R2_MEMORY_V1, values: [200],
        dims: [{ key: 'memory-kind', value: 'embedder-heap' }, { key: 'checkpoint-id', value: 'checkpoint-0' }],
      }),
    ]);
    const kindAggregate = validateAndAggregateBundleV1(kindBundle.bundle ?? (() => {
      throw new Error('missing bundle');
    })()).aggregate;
    expect(kindAggregate?.environmentCells.length).toBe(2);
  });

  it('B3: a swapped run copy is refused, the embedded run is projected', () => {
    const plan = r2PlanV1('r2-b3', [{ slot: 'slot-b3', candidate: 'candidate-a' }]);
    const entry = r2EntryV1(plan, { runId: 'run-b3', slot: 'slot-b3', candidate: 'candidate-a', values: [5] });
    const tamperedRun = JSON.parse(JSON.stringify(entry.run)) as Record<string, unknown>;
    const iterations = tamperedRun['iterations'] as { samples: { result: { value: number } }[] }[];
    iterations[0]!.samples[0]!.result.value = 12345;
    const tampered = r2BundleV1('r2-b3', plan, [{
      document: entry.document,
      run: tamperedRun as unknown as BenchmarkRunV1,
      receipt: entry.receipt,
    }]);
    expect(tampered.bundle).toBeNull();
    expect(tampered.issues.some((issue) => issue.code === 'RUN_DOCUMENT_MISMATCH')).toBe(true);
    const { bundle } = r2BundleV1('r2-b3ok', plan, [entry]);
    expect(bundle?.runs[0]?.run.iterations[0]?.samples[0]?.value).toBe(5);
  });

  it('B3: run, sample, scenario, eligibility, and policy bindings are fail-closed', () => {
    const plan = r2PlanV1('r2-b3b', [{ slot: 'slot-b3b', candidate: 'candidate-a' }]);
    const base = r2EntryV1(plan, { runId: 'run-b3b', slot: 'slot-b3b', candidate: 'candidate-a', values: [5] });
    const wrongBindingReceipt = { ...base.receipt, runBindingSha256: fakeDigestV1('r2-other') };
    const bound = r2BundleV1('r2-b3bind', plan, [{
      document: base.document, run: base.run,
      receipt: wrongBindingReceipt as unknown as BenchmarkValidationReceiptV1,
    }]);
    expect(bound.bundle).toBeNull();
    expect(bound.issues.some((issue) => issue.code === 'RUN_BINDING_MISMATCH')).toBe(true);
    const badSample = r2EntryV1(plan, {
      runId: 'run-b3s', slot: 'slot-b3b', candidate: 'candidate-a', values: [5],
      sampleBinding: fakeDigestV1('r2-other-sample'),
    });
    const sampled = r2BundleV1('r2-b3sample', plan, [badSample]);
    expect(sampled.bundle).toBeNull();
    expect(sampled.issues.some((issue) => issue.code === 'SAMPLE_BINDING_MISMATCH')).toBe(true);
    const wrongScenario = r2EntryV1(plan, {
      runId: 'run-b3sc', slot: 'slot-b3b', candidate: 'candidate-a',
      scenario: 'scheduler-steady-v1', values: [5],
    });
    const scenarioed = r2BundleV1('r2-b3scenario', plan, [wrongScenario]);
    expect(scenarioed.bundle).toBeNull();
    expect(scenarioed.issues.some((issue) => issue.code === 'SCENARIO_MISMATCH')).toBe(true);
    const eligibleConflict = r2EntryV1(plan, {
      runId: 'run-b3e', slot: 'slot-b3b', candidate: 'candidate-a', values: [5],
      eligibilityReasons: [{ code: 'source-dirty', detail: 'x', phase: 'measurement' }],
    });
    const conflicted = r2BundleV1('r2-b3elig', plan, [eligibleConflict]);
    expect(conflicted.bundle).toBeNull();
    expect(conflicted.issues.some((issue) => issue.code === 'ELIGIBILITY_CONFLICT')).toBe(true);
    const badPolicy: Br04BootstrapPolicyV1 = { ...R2_POLICY_V1, resamples: 100 as never };
    const policed = r2BundleV1('r2-b3pol', plan, [base], badPolicy);
    expect(policed.bundle).toBeNull();
    expect(policed.issues.some((issue) => issue.code === 'BOOTSTRAP_POLICY_INVALID')).toBe(true);
  });
});

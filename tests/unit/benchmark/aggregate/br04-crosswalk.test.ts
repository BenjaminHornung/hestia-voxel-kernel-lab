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
import { crosswalkToBundleV1, projectMetricDefinitionV1 } from '../../../../src/benchmark/aggregate/br04CrosswalkV1';
import { validateAndAggregateBundleV1 } from '../../../../src/benchmark/aggregate/br04AggregateV1';
import type { Br04BootstrapPolicyV1, Br04Sha256 } from '../../../../src/benchmark/aggregate/br04ContractV1';
import {
  BR04_ACCEPTED_BR03_SYNTHETIC_V1,
  BR04_SYNTHETIC_SEED_00_V1,
  fakeDigestV1,
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
): { document: BenchmarkRunDocumentV1; run: BenchmarkRunV1; receipt: BenchmarkValidationReceiptV1 } {
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
    browserProcesses: [{ runs: [{ runId: 'run-xw' }], ids: { bootstrapClusterId: 'cluster-xw' } }],
  } as unknown as BenchmarkRunDocumentV1;
  const receipt = {
    status: 'schema-and-integrity-valid',
    runId: 'run-xw',
    slotId,
    benchmarkRunRawByteSha256: fakeDigestV1('xw-raw'),
    benchmarkRunCanonicalSha256: fakeDigestV1('xw-canonical'),
    planDigest: fakeDigestV1('xw-plan'),
    metricRegistrySha256: fakeDigestV1('xw-registry'),
    validator: { id: 'br01-validator-v1', sourceFileSetSha256: fakeDigestV1('xw-validator') },
    schemaVersion: 'benchmark-validation-receipt-v1',
    schemaSetSha256: fakeDigestV1('xw-schema'),
  } as unknown as BenchmarkValidationReceiptV1;
  return { document, run, receipt };
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
    const result = crosswalkToBundleV1({
      acceptedBr03Sha: BR04_ACCEPTED_BR03_SYNTHETIC_V1,
      bundleId: 'xw-valid',
      reportAsOfUtc: '2026-09-07T00:00:00.000Z',
      plan: frozenPlanV1(),
      registry: frozenMetricRegistryV1(),
      bootstrapPolicy: POLICY,
      runs: [{
        document: frozen.document, run: warmupRun, receipt: frozen.receipt,
        rawByteDigest: fakeDigestV1('xw-raw'),
        canonicalContentDigest: fakeDigestV1('xw-canonical'),
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
        rawByteDigest: fakeDigestV1('xw-raw'),
        canonicalContentDigest: fakeDigestV1('xw-canonical'),
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
        rawByteDigest: fakeDigestV1('xw-raw'),
        canonicalContentDigest: fakeDigestV1('xw-canonical'),
      }],
    });
    expect(orphanResult.bundle).toBeNull();
    expect(orphanResult.issues.some((issue) => issue.code === 'HIERARCHY_INVALID')).toBe(true);
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
      rawByteDigest: fakeDigestV1('xw-raw'),
      canonicalContentDigest: fakeDigestV1('xw-canonical'),
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
        rawByteDigest: fakeDigestV1('xw-raw'),
        canonicalContentDigest: fakeDigestV1('xw-canonical'),
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
      rawByteDigest: fakeDigestV1('xw-raw'),
      canonicalContentDigest: fakeDigestV1('xw-canonical'),
    };
    expect(crosswalkToBundleV1({ ...base, runs: [entry] }).bundle?.runs[0]?.run.declaredDisposition)
      .toBe('source-dirty');
    const drifted = frozenRunV1([{ value: 5 }], 'measurement', { buildDigest: fakeDigestV1('xw-other-build') });
    const driftedResult = crosswalkToBundleV1({
      ...base,
      bundleId: 'xw-drift',
      runs: [{
        document: drifted.document, run: drifted.run, receipt: drifted.receipt,
        rawByteDigest: fakeDigestV1('xw-raw'),
        canonicalContentDigest: fakeDigestV1('xw-canonical'),
      }],
    });
    expect(driftedResult.bundle?.runs[0]?.run.declaredDisposition).toBe('provenance-mismatch');
  });

  it('the BR01-owned registry projects without a shadow register', () => {
    const metric = BENCHMARK_METRIC_REGISTRY_V1.metrics.find(
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

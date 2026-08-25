import {
  BENCHMARK_METRIC_REGISTRY_V1,
  BENCHMARK_SCENARIO_REGISTRY_V1,
  BENCHMARK_WARMUP_RULE_V1,
  recomputeWarmupStabilityV1,
  type BenchmarkScenarioIdV1,
  type BenchmarkWarmMeasurementEvidenceV1,
  type CanonicalIdV1,
  type Sha256DigestV1,
} from '../../contracts';
import type { PlannedInvocationRunV1, RunInvocationV1, RunPlanProcessUnitV1 } from '../contractsV1';
import {
  deriveInvocationIterationIdV1,
  deriveInvocationRunIdV1,
  deriveInvocationSampleIdV1,
} from '../ids/orchestrationIdsV1';

export type WarmupControlSampleV1 = BenchmarkWarmMeasurementEvidenceV1['controlSamples'][number];

export type WarmupProgressV1 =
  | { readonly status: 'continue'; readonly completedIterations: number }
  | { readonly status: 'stable'; readonly completedIterations: number; readonly evidence: BenchmarkWarmMeasurementEvidenceV1 }
  | { readonly status: 'invalid'; readonly completedIterations: number; readonly reason: 'warmup-not-stable' };

export interface WarmupControllerOptionsV1 {
  readonly scenarioId: BenchmarkScenarioIdV1;
  readonly browserProcessId: CanonicalIdV1;
  readonly runPlanId: CanonicalIdV1;
  readonly runPlanSha256: Sha256DigestV1;
}

export class WarmupControllerV1 {
  readonly #samples: WarmupControlSampleV1[] = [];
  readonly #metricRef: BenchmarkWarmMeasurementEvidenceV1['controlMetricRef'];
  readonly #epsilon: number;
  #stableEvidence: BenchmarkWarmMeasurementEvidenceV1 | null = null;

  public constructor(readonly options: WarmupControllerOptionsV1) {
    const control = BENCHMARK_SCENARIO_REGISTRY_V1[options.scenarioId]?.definition.warmupControl;
    if (control === undefined || control === null) throw new TypeError(`${options.scenarioId} has no BR01 warmup control.`);
    const metric = BENCHMARK_METRIC_REGISTRY_V1.metrics.find(({ metricRef }) => metricRef === control.metricRef);
    if (metric?.warmupControl === null || metric?.warmupControl === undefined) {
      throw new TypeError(`${control.metricRef} has no BR01 metric warmup control.`);
    }
    this.#metricRef = control.metricRef;
    this.#epsilon = metric.warmupControl.epsilon;
  }

  public add(sample: WarmupControlSampleV1): WarmupProgressV1 {
    if (this.#stableEvidence !== null) throw new Error('Warmup is already stable.');
    if (this.#samples.length >= BENCHMARK_WARMUP_RULE_V1.maximumWarmupIterations) throw new Error('Warmup iteration limit reached.');
    if (![sample.iterationOrdinal, sample.sampleOrdinal].every((value) => Number.isSafeInteger(value) && value >= 0)
      || !Number.isFinite(sample.value) || sample.value < 0 || Object.is(sample.value, -0)) {
      throw new TypeError('Warmup control sample is invalid.');
    }
    if (this.#samples.some(({ sampleId, runId, iterationId }) => sampleId === sample.sampleId || runId === sample.runId || iterationId === sample.iterationId)) {
      throw new TypeError('Warmup control sample IDs must be unique.');
    }
    this.#samples.push(sample);
    const result = recomputeWarmupStabilityV1(this.#samples.map(({ value }) => value), BENCHMARK_WARMUP_RULE_V1, this.#epsilon);
    if (result.status === 'STABLE') {
      this.#stableEvidence = this.#buildEvidence();
      return { status: 'stable', completedIterations: this.#samples.length, evidence: this.#stableEvidence };
    }
    if (this.#samples.length === BENCHMARK_WARMUP_RULE_V1.maximumWarmupIterations) {
      return { status: 'invalid', completedIterations: this.#samples.length, reason: 'warmup-not-stable' };
    }
    return { status: 'continue', completedIterations: this.#samples.length };
  }

  public get evidence(): BenchmarkWarmMeasurementEvidenceV1 | null {
    return this.#stableEvidence;
  }

  public get controlMetricRef(): BenchmarkWarmMeasurementEvidenceV1['controlMetricRef'] {
    return this.#metricRef;
  }

  readonly #buildEvidence = (): BenchmarkWarmMeasurementEvidenceV1 => {
    const [first, ...rest] = this.#samples;
    if (first === undefined) throw new Error('Stable warmup cannot have an empty sample set.');
    return {
      schemaVersion: 'benchmark-warm-measurement-evidence-v1',
      browserProcessId: this.options.browserProcessId,
      runPlanId: this.options.runPlanId,
      runPlanSha256: this.options.runPlanSha256,
      ruleId: BENCHMARK_WARMUP_RULE_V1.id,
      ruleVersion: BENCHMARK_WARMUP_RULE_V1.version,
      algorithm: BENCHMARK_WARMUP_RULE_V1.algorithm,
      controlMetricRef: this.#metricRef,
      controlSamples: [first, ...rest],
    };
  };
}

export interface AdaptiveWarmupControllerOptionsV1 {
  readonly invocation: RunInvocationV1;
  readonly unit: RunPlanProcessUnitV1;
  readonly predecessorRuns?: readonly PlannedInvocationRunV1[];
}

export interface AdaptedWarmupControlSampleV1 {
  readonly sampleId: CanonicalIdV1;
  readonly runId: CanonicalIdV1;
  readonly iterationId: CanonicalIdV1;
  readonly metricRef: string;
  readonly ordinal: number;
  readonly result: { readonly status: 'valid'; readonly value: number };
}

export function bindAdaptiveWarmupControlSampleV1(
  sample: AdaptedWarmupControlSampleV1,
  runId: CanonicalIdV1,
  iterationId: CanonicalIdV1,
): AdaptedWarmupControlSampleV1 {
  if (sample.runId !== runId || sample.iterationId !== iterationId) throw new TypeError('Warmup sample binding does not match its run and iteration.');
  return { ...sample, sampleId: deriveInvocationSampleIdV1(runId, iterationId, sample.sampleId) };
}

export interface CompletedAdaptiveWarmupRunV1 {
  readonly run: PlannedInvocationRunV1;
  readonly boundSampleId: CanonicalIdV1;
  readonly controlSample: WarmupControlSampleV1;
  readonly progress: WarmupProgressV1;
}

export class AdaptiveWarmupControllerV1 {
  readonly #controller: WarmupControllerV1;
  readonly #invocationUnit: RunInvocationV1['processUnits'][number];
  readonly #executedRuns: PlannedInvocationRunV1[] = [];
  #pendingRun: PlannedInvocationRunV1 | null = null;
  #measurementRun: PlannedInvocationRunV1 | null = null;
  #progress: WarmupProgressV1 | null = null;

  public constructor(readonly options: AdaptiveWarmupControllerOptionsV1) {
    const invocationUnit = options.invocation.processUnits.find(({ slotId }) => slotId === options.unit.ids.slotId);
    if (options.unit.processContainer !== 'warm-measurement'
      || invocationUnit?.adaptiveWarmup === null || invocationUnit?.adaptiveWarmup === undefined
      || invocationUnit.runs.length !== 0
      || invocationUnit.browserProcessId !== options.unit.ids.browserProcessId) {
      throw new TypeError('Adaptive warmup requires an unreserved warm-measurement invocation unit.');
    }
    this.#invocationUnit = invocationUnit;
    this.#controller = new WarmupControllerV1({
      scenarioId: options.unit.scenarioId,
      browserProcessId: options.unit.ids.browserProcessId,
      runPlanId: options.invocation.runPlanId,
      runPlanSha256: options.invocation.runPlanSha256,
    });
  }

  readonly #origin = (phase: PlannedInvocationRunV1['phase'], runOrdinal: number): PlannedInvocationRunV1['origin'] => {
    if (this.options.invocation.attempt === 0) return { kind: 'planned' };
    const predecessor = phase === 'measurement'
      ? this.options.predecessorRuns?.find((run) => run.phase === 'measurement')
      : this.options.predecessorRuns?.filter((run) => run.phase === 'warmup')[runOrdinal];
    const approvalId = this.options.invocation.rerunOrigin?.approvalId;
    if (predecessor === undefined || approvalId === undefined) throw new TypeError('Adaptive rerun is missing its exact predecessor run.');
    return { kind: 'infrastructure-rerun', replacesRunId: predecessor.runId, approvalId, reason: 'infrastructure-failure' };
  };

  readonly #plannedRun = (phase: 'warmup' | 'measurement', runOrdinal: number, iterations: number): PlannedInvocationRunV1 => {
    const runId = deriveInvocationRunIdV1(
      this.options.invocation.invocationId,
      this.options.invocation.runPlanSha256,
      this.#invocationUnit.slotId,
      runOrdinal,
      this.options.invocation.attempt,
    );
    return {
      runOrdinal,
      runId,
      phase,
      iterationIds: Array.from({ length: iterations }, (_, ordinal) => deriveInvocationIterationIdV1(runId, ordinal)),
      origin: this.#origin(phase, runOrdinal),
    };
  };

  public nextWarmupRun(): PlannedInvocationRunV1 {
    if (this.#pendingRun !== null) throw new Error('The current warmup run must finish before another is allocated.');
    if (this.#progress?.status === 'stable' || this.#progress?.status === 'invalid') throw new Error('Adaptive warmup is already terminal.');
    if (this.#executedRuns.length >= this.#invocationUnit.adaptiveWarmup!.maximumWarmupRuns) throw new Error('Warmup iteration limit reached.');
    this.#pendingRun = this.#plannedRun('warmup', this.#executedRuns.length, 1);
    return this.#pendingRun;
  }

  public completeWarmupRun(sample: AdaptedWarmupControlSampleV1): CompletedAdaptiveWarmupRunV1 {
    const run = this.#pendingRun;
    if (run === null) throw new Error('No adaptive warmup run is pending.');
    if (sample.runId !== run.runId || sample.iterationId !== run.iterationIds[0] || sample.metricRef !== this.#controller.controlMetricRef) {
      throw new TypeError('Adapted warmup control sample is not bound to the pending run, iteration, or metric.');
    }
    if (sample.result.status !== 'valid') throw new TypeError('Adapted warmup control sample must be valid.');
    if (!Number.isSafeInteger(sample.ordinal) || sample.ordinal < 0 || !Number.isFinite(sample.result.value)
      || sample.result.value < 0 || Object.is(sample.result.value, -0)) {
      throw new TypeError('Adapted warmup control sample is invalid.');
    }
    const iterationId = run.iterationIds[0]!;
    const boundSampleId = sample.sampleId;
    const controlSample: WarmupControlSampleV1 = {
      sampleId: boundSampleId,
      runId: run.runId,
      iterationId,
      iterationOrdinal: 0,
      sampleOrdinal: sample.ordinal,
      value: sample.result.value,
    };
    const progress = this.#controller.add(controlSample);
    this.#executedRuns.push(run);
    this.#pendingRun = null;
    this.#progress = progress;
    return { run, boundSampleId, controlSample, progress };
  }

  public createMeasurementRun(): PlannedInvocationRunV1 {
    if (this.#progress?.status !== 'stable') throw new Error('Measurement cannot start before the first accepted stable boundary.');
    if (this.#measurementRun !== null) throw new Error('Measurement run is already allocated.');
    this.#measurementRun = this.#plannedRun(
      'measurement',
      this.#executedRuns.length,
      this.#invocationUnit.adaptiveWarmup!.measurementIterations,
    );
    this.#executedRuns.push(this.#measurementRun);
    return this.#measurementRun;
  }

  public get executedRuns(): readonly PlannedInvocationRunV1[] {
    return [...this.#executedRuns];
  }

  public get evidence(): BenchmarkWarmMeasurementEvidenceV1 | null {
    return this.#controller.evidence;
  }
}

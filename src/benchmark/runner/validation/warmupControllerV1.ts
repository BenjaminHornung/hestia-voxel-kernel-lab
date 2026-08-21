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
    if (sample.iterationOrdinal !== this.#samples.length) throw new TypeError('Warmup iteration ordinals must be contiguous.');
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

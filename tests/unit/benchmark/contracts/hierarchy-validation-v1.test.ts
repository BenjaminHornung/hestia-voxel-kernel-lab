import { describe, expect, it } from 'vitest';
import { createBenchmarkCaseDocumentV1, createBenchmarkValidationContextV1, createBenchmarkWarmMeasurementEvidenceV1, createTwoIterationBenchmarkCaseDocumentV1, createTwoProcessWarmMeasurementDocumentV1 } from './benchmark-case-fixtures-v1';
import { calculateRunBindingSha256V1, validateBenchmarkRunV1 } from '../../../../src/benchmark/contracts/validateV1';
import { BENCHMARK_WARMUP_RULE_V1, recomputeWarmupStabilityV1 } from '../../../../src/benchmark/contracts/browserValidationV1';

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

describe('BR01 hierarchy and eligibility', () => {
  it.each([
     ['process hardware cell', (document: any) => { document.browserProcesses[0].hardwareCellId = 'other-cell'; }, 'hierarchy-invalid'],
     ['hardware profile', (document: any) => { document.hardwareProfileId = 'other-profile'; }, 'hierarchy-invalid'],
     ['process source', (document: any) => { document.browserProcesses[0].source.commitSha = 'b'.repeat(40); }, 'hierarchy-invalid'],
    ['run environment', (document: any) => { document.browserProcesses[0].runs[0].environment.browser.version.value = 'other'; }, 'hierarchy-invalid'],
     ['cell eligibility', (document: any) => { document.measurementEligible = true; }, 'measurement-ineligible'],
     ['measurement before warmup', (document: any) => { document.browserProcesses[0].runs.reverse(); }, 'ordinal-order-invalid'],
  ])('rejects %s with a specific code', (_label, mutate, code) => {
     const document = clone(createBenchmarkCaseDocumentV1({ samples: true })) as any;
    const context = createBenchmarkValidationContextV1();
    mutate(document);
    expect(validateBenchmarkRunV1(document, context)).toMatchObject({ valid: false, code });
  });

  it('allows repeated plan slot IDs within one browser process', () => {
     const document = clone(createBenchmarkCaseDocumentV1({ samples: true })) as any;
    document.browserProcesses[0].runs[0].ids.slotId = document.browserProcesses[0].runs[1].ids.slotId;
     expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1())).toMatchObject({ valid: true });
  });

   it('fails closed when the hardware profile evidence is unavailable', () => {
     const document = clone(createBenchmarkCaseDocumentV1({ samples: true, measurementEligibility: 'eligible' })) as any;
     const context = createBenchmarkValidationContextV1();
    const unavailable = { status: 'unknown', value: null, sourceRef: 'capture-v1', reasonCode: 'profile-not-observed' };
    document.environment.hardwareProfileTier = unavailable;
    document.browserProcesses[0].environment.hardwareProfileTier = unavailable;
     for (const run of document.browserProcesses[0].runs) { run.environment.hardwareProfileTier = unavailable; run.measurementEligibilityReasons = [{ code: 'environment-incomplete', detail: 'profile evidence unavailable', phase: run.execution.phase }]; run.runBindingSha256 = calculateRunBindingSha256V1(run); for (const iteration of run.iterations) for (const sample of iteration.samples) sample.runBindingSha256 = run.runBindingSha256; }
     document.measurementEligibilityReasons = [{ code: 'environment-incomplete', detail: 'eligibility gate', phase: 'measurement' }];
     expect(validateBenchmarkRunV1(document, context)).toMatchObject({ valid: false, code: 'environment-incomplete' });
   });
   it.each([
     ['wrong process', (context: any) => { context.warmMeasurementEvidence[0].browserProcessId = 'other-process'; }, 'warmup-process-mismatch'],
     ['wrong plan', (context: any) => { context.warmMeasurementEvidence[0].runPlanId = 'other-plan'; }, 'warmup-plan-mismatch'],
   ])('rejects malformed warmup evidence', (_label, mutate, code) => {
     const document = createBenchmarkCaseDocumentV1({ samples: true }) as any;
     const context = createBenchmarkValidationContextV1() as any;
     mutate(context);
     expect(validateBenchmarkRunV1(document, context)).toMatchObject({ valid: false, code });
   });
   it('rejects below minimum warmup evidence', () => {
     const document = createBenchmarkCaseDocumentV1({ samples: true }) as any;
     document.browserProcesses[0].runs.splice(1, 10);
     const evidence = createBenchmarkWarmMeasurementEvidenceV1(document);
     expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1({ warmMeasurementEvidence: evidence }))).toMatchObject({ valid: false, code: 'warmup-minimum-invalid' });
   });
   it('rejects unstable warmup evidence after recomputing the rule', () => {
     const document = createBenchmarkCaseDocumentV1({ samples: true }) as any;
     for (const run of document.browserProcesses[0].runs.slice(6, 11)) {
       const warmupSample = run.iterations[0].samples.find((sample: any) => sample.metricRef === 'chunk.mesh.cpu.ms@1');
       warmupSample.result.value = 100;
     }
     const evidence = createBenchmarkWarmMeasurementEvidenceV1(document);
      expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1({ warmMeasurementEvidence: evidence }))).toMatchObject({ valid: false, code: 'warmup-not-stable' });
    });
    it('requires the first stable boundary and uses the fixed metric epsilon', () => {
      const ten = recomputeWarmupStabilityV1(Array.from({ length: 10 }, () => 1), BENCHMARK_WARMUP_RULE_V1, 0.001);
      const eleven = recomputeWarmupStabilityV1(Array.from({ length: 11 }, () => 1), BENCHMARK_WARMUP_RULE_V1, 0.001);
      expect(ten).toMatchObject({ status: 'WARMUP_NOT_STABLE', stabilizationIteration: null });
      expect(eleven).toMatchObject({ status: 'STABLE', stabilizationIteration: 11 });

      const currentDominates = recomputeWarmupStabilityV1([...Array.from({ length: 5 }, () => 10), ...Array.from({ length: 5 }, () => 11)], BENCHMARK_WARMUP_RULE_V1, 0.001);
      expect(currentDominates.comparisons[0]?.relativeDeviation).toBeCloseTo(1 / 11, 12);
      const nearZero = recomputeWarmupStabilityV1([...Array.from({ length: 5 }, () => 0), ...Array.from({ length: 5 }, () => 0.0005)], BENCHMARK_WARMUP_RULE_V1, 0.001);
      expect(nearZero.comparisons[0]?.relativeDeviation).toBeCloseTo(0.5, 12);
      const stableAtMaximum = recomputeWarmupStabilityV1([
        ...Array.from({ length: 38 }, (_, index) => index % 2 === 0 ? 1 : 100),
        16, 16, 16, ...Array.from({ length: 9 }, () => 1),
      ], BENCHMARK_WARMUP_RULE_V1, 0.001);
      expect(stableAtMaximum).toMatchObject({ status: 'STABLE', stabilizationIteration: 50 });
      const neverStable = recomputeWarmupStabilityV1(Array.from({ length: 50 }, (_, index) => index % 2 === 0 ? 1 : 100), BENCHMARK_WARMUP_RULE_V1, 0.001);
      expect(neverStable).toMatchObject({ status: 'WARMUP_NOT_STABLE', stabilizationIteration: null });
    });
    it('rejects trailing warmups after the first stable boundary', () => {
      const document = clone(createBenchmarkCaseDocumentV1({ samples: true })) as any;
      const process = document.browserProcesses[0];
      const extra = clone(process.runs[10]);
      extra.runId = 'warmup-run-12';
      extra.ids.slotId = 'slot-warmup-12';
      extra.ids.pairCellId = 'pair-cell-warmup-12';
      extra.execution.iteration = 11;
      extra.execution.order.sequencePosition = 11;
      for (const iteration of extra.iterations) {
        iteration.runId = extra.runId;
        for (const sample of iteration.samples) {
          sample.sampleId = `warmup-12-${sample.sampleId}`;
          sample.iterationId = iteration.iterationId;
        }
      }
      extra.runBindingSha256 = calculateRunBindingSha256V1(extra);
      for (const iteration of extra.iterations) for (const sample of iteration.samples) sample.runBindingSha256 = extra.runBindingSha256;
      process.runs.splice(11, 0, extra);
      const measurement = process.runs[12];
      measurement.execution.iteration = 12;
      measurement.execution.order.sequencePosition = 12;
      measurement.runBindingSha256 = calculateRunBindingSha256V1(measurement);
      for (const iteration of measurement.iterations) for (const sample of iteration.samples) sample.runBindingSha256 = measurement.runBindingSha256;
      const evidence = createBenchmarkWarmMeasurementEvidenceV1(document);
      expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1({ warmMeasurementEvidence: evidence }))).toMatchObject({ valid: false, code: 'warmup-not-stable' });
    });
   it('accepts one process-specific warmup evidence entry for each eligible process', () => {
     const document = createTwoProcessWarmMeasurementDocumentV1();
     const evidence = createBenchmarkWarmMeasurementEvidenceV1(document)!;
     const context = createBenchmarkValidationContextV1({
       warmMeasurementEvidence: evidence,
     });
     expect(validateBenchmarkRunV1(document, context)).toMatchObject({ valid: true });
  });
  it.each([
    ['hardwareCellId', (document: any) => { document.hardwareCellId = 'hardware-cell-mutated'; document.browserProcesses[0].hardwareCellId = 'hardware-cell-mutated'; for (const run of document.browserProcesses[0].runs) run.hardwareCellId = 'hardware-cell-mutated'; }],
    ['browserProcessId', (document: any, context: any) => { document.browserProcesses[0].browserProcessId = 'browser-process-mutated'; document.browserProcesses[0].ids.browserProcessId = 'browser-process-mutated'; context.warmMeasurementEvidence[0].browserProcessId = 'browser-process-mutated'; for (const run of document.browserProcesses[0].runs) { run.browserProcessId = 'browser-process-mutated'; run.ids.browserProcessId = 'browser-process-mutated'; } }],
    ['ids.slotId', (document: any) => { document.browserProcesses[0].runs.at(-1)!.ids.slotId = 'slot-mutated'; }],
    ['ids.browserProcessId', (document: any, context: any) => { document.browserProcesses[0].browserProcessId = 'browser-process-mutated'; document.browserProcesses[0].ids.browserProcessId = 'browser-process-mutated'; context.warmMeasurementEvidence[0].browserProcessId = 'browser-process-mutated'; for (const run of document.browserProcesses[0].runs) { run.browserProcessId = 'browser-process-mutated'; run.ids.browserProcessId = 'browser-process-mutated'; } }],
    ['ids.bootstrapClusterId', (document: any) => { document.browserProcesses[0].ids.bootstrapClusterId = 'bootstrap-cluster-mutated'; for (const run of document.browserProcesses[0].runs) run.ids.bootstrapClusterId = 'bootstrap-cluster-mutated'; }],
    ['ids.pairCellId', (document: any) => { document.browserProcesses[0].runs.at(-1)!.ids.pairCellId = 'pair-cell-mutated'; }],
    ['ids.pairOrdinal', (document: any) => { document.browserProcesses[0].runs.at(-1)!.ids.pairOrdinal = 2; }],
  ] as const)('binds unchanged samples to %s', (_field, mutate) => {
    const document = clone(createBenchmarkCaseDocumentV1({ samples: true })) as any;
    const context = createBenchmarkValidationContextV1() as any;
    mutate(document, context);
    expect(validateBenchmarkRunV1(document, context)).toMatchObject({ valid: false, code: 'run-binding-mismatch' });
  });
  it('rejects missing, duplicate, and cross-process warmup evidence', () => {
    const document = createTwoProcessWarmMeasurementDocumentV1();
    const baseEvidence = createBenchmarkValidationContextV1().warmMeasurementEvidence![0]!;
    const cases = [
      createBenchmarkValidationContextV1(),
      createBenchmarkValidationContextV1({ warmMeasurementEvidence: [baseEvidence, baseEvidence] }),
      createBenchmarkValidationContextV1({ warmMeasurementEvidence: [baseEvidence, { ...baseEvidence, browserProcessId: 'other-process' as never }] }),
    ];
    for (const context of cases) expect(validateBenchmarkRunV1(document, context).valid).toBe(false);
  });
   it('rejects a measurement run after only one warmup run', () => {
     const document = createBenchmarkCaseDocumentV1({ samples: true }) as any;
     document.browserProcesses[0].runs.splice(1, 10);
     const evidence = createBenchmarkWarmMeasurementEvidenceV1(document);
     expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1({ warmMeasurementEvidence: evidence }))).toMatchObject({ valid: false, code: 'warmup-minimum-invalid' });
  });
  it('rejects warmup after measurement has started within one process', () => {
    const document = clone(createBenchmarkCaseDocumentV1({ samples: true })) as any;
    const process = document.browserProcesses[0];
    const lateWarmup = clone(process.runs[0]);
    lateWarmup.runId = 'warmup-late';
    lateWarmup.ids.slotId = 'slot-warmup-late';
    lateWarmup.ids.pairCellId = 'pair-cell-warmup-late';
    lateWarmup.execution.iteration = 12;
    lateWarmup.execution.order.sequencePosition = 12;
    for (const iteration of lateWarmup.iterations) {
      iteration.runId = lateWarmup.runId;
      for (const sample of iteration.samples) sample.sampleId = `late-${sample.sampleId}`;
    }
    lateWarmup.runBindingSha256 = calculateRunBindingSha256V1(lateWarmup);
    for (const iteration of lateWarmup.iterations) for (const sample of iteration.samples) sample.runBindingSha256 = lateWarmup.runBindingSha256;
    process.runs.push(lateWarmup);
    expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1())).toMatchObject({ valid: false, code: 'phase-transition-invalid' });
  });
  it('rejects reversed sample arrays by ordinal order', () => {
    const document = clone(createBenchmarkCaseDocumentV1({ samples: true })) as any;
    document.browserProcesses[0].runs.at(-1).iterations[0].samples.reverse();
    expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1())).toMatchObject({ valid: false, code: 'ordinal-order-invalid' });
  });
  it('accepts source-pack run-global sample ordinals across two iterations', () => {
    expect(validateBenchmarkRunV1(createTwoIterationBenchmarkCaseDocumentV1(), createBenchmarkValidationContextV1())).toMatchObject({ valid: true });
  });
  it.each([
    ['reversed cross-iteration samples', (document: any) => { document.browserProcesses[0].runs.at(-1).iterations[1].samples.reverse(); }],
    ['duplicate cross-iteration sample ordinal', (document: any) => { document.browserProcesses[0].runs.at(-1).iterations[1].samples[0].ordinal = 0; }],
    ['gapped cross-iteration sample ordinal', (document: any) => { const run = document.browserProcesses[0].runs.at(-1); run.iterations[1].samples[0].ordinal = run.iterations[0].samples.length + 1; }],
  ] as const)('rejects %s', (_label, mutate) => {
    const document = createTwoIterationBenchmarkCaseDocumentV1();
    mutate(document);
    expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1())).toMatchObject({ valid: false, code: 'ordinal-order-invalid' });
  });
  it('rejects reversed iteration arrays by ordinal order', () => {
    const document = clone(createBenchmarkCaseDocumentV1({ samples: true })) as any;
    const run = document.browserProcesses[0].runs.at(-1);
    const second = clone(run.iterations[0]);
    second.iterationId = 'iteration-1';
    second.iterationOrdinal = 1;
    run.iterations = [second, run.iterations[0]];
    expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1())).toMatchObject({ valid: false, code: 'ordinal-order-invalid' });
  });
});

import { describe, expect, it } from 'vitest';
import { createBenchmarkCaseDocumentV1, createBenchmarkValidationContextV1, createTwoIterationBenchmarkCaseDocumentV1, createTwoProcessWarmMeasurementDocumentV1 } from './benchmark-case-fixtures-v1';
import { calculateRunBindingSha256V1, validateBenchmarkRunV1 } from '../../../../src/benchmark/contracts/validateV1';

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

describe('BR01 hierarchy and eligibility', () => {
  it.each([
     ['process hardware cell', (document: any) => { document.browserProcesses[0].hardwareCellId = 'other-cell'; }, 'hierarchy-invalid'],
     ['hardware profile', (document: any) => { document.hardwareProfileId = 'other-profile'; }, 'hierarchy-invalid'],
     ['process source', (document: any) => { document.browserProcesses[0].source.commitSha = 'b'.repeat(40); }, 'hierarchy-invalid'],
    ['run environment', (document: any) => { document.browserProcesses[0].runs[0].environment.browser.version.value = 'other'; }, 'hierarchy-invalid'],
    ['cell eligibility', (document: any) => { document.measurementEligible = false; }, 'measurement-ineligible'],
    ['measurement before warmup', (document: any) => { document.browserProcesses[0].runs.reverse(); }, 'phase-transition-invalid'],
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
    const document = clone(createBenchmarkCaseDocumentV1({ samples: true })) as any;
     const context = createBenchmarkValidationContextV1();
    const unavailable = { status: 'unknown', value: null, sourceRef: 'capture-v1', reasonCode: 'profile-not-observed' };
    document.environment.hardwareProfileTier = unavailable;
    document.browserProcesses[0].environment.hardwareProfileTier = unavailable;
     for (const run of document.browserProcesses[0].runs) { run.environment.hardwareProfileTier = unavailable; run.measurementEligibilityReasons = [{ code: 'environment-incomplete', detail: 'profile evidence unavailable', phase: run.execution.phase }]; run.runBindingSha256 = calculateRunBindingSha256V1(run); for (const iteration of run.iterations) for (const sample of iteration.samples) sample.runBindingSha256 = run.runBindingSha256; }
     expect(validateBenchmarkRunV1(document, context)).toMatchObject({ valid: false, code: 'environment-incomplete' });
  });
  it.each([
    ['below minimum', (context: any) => { context.warmMeasurementEvidence[0].minimumWarmupRuns = 3; }, 'warmup-minimum-invalid'],
    ['unstable', (context: any) => { context.warmMeasurementEvidence[0].stability = 'unstable'; }, 'warmup-stability-invalid'],
    ['wrong process', (context: any) => { context.warmMeasurementEvidence[0].browserProcessId = 'other-process'; }, 'warmup-process-mismatch'],
    ['wrong plan', (context: any) => { context.warmMeasurementEvidence[0].runPlanId = 'other-plan'; }, 'warmup-plan-mismatch'],
  ])('rejects %s warmup evidence', (_label, mutate, code) => {
    const document = createBenchmarkCaseDocumentV1({ samples: true }) as any;
    const context = createBenchmarkValidationContextV1() as any;
    mutate(context);
    expect(validateBenchmarkRunV1(document, context)).toMatchObject({ valid: false, code });
  });
  it('accepts one process-specific warmup evidence entry for each eligible process', () => {
    const document = createTwoProcessWarmMeasurementDocumentV1();
    const baseEvidence = createBenchmarkValidationContextV1().warmMeasurementEvidence![0]!;
    const context = createBenchmarkValidationContextV1({
      warmMeasurementEvidence: [baseEvidence, { ...baseEvidence, browserProcessId: 'browser-process-2' as never }],
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
    document.browserProcesses[0].runs.splice(1, 1);
    expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1())).toMatchObject({ valid: false, code: 'warmup-minimum-invalid' });
  });
  it('rejects warmup after measurement has started within one process', () => {
    const document = clone(createBenchmarkCaseDocumentV1({ samples: true })) as any;
    const process = document.browserProcesses[0];
    const lateWarmup = clone(process.runs[0]);
    lateWarmup.runId = 'warmup-late';
    lateWarmup.ids.slotId = 'slot-warmup-late';
    lateWarmup.ids.pairCellId = 'pair-cell-warmup-late';
    lateWarmup.runBindingSha256 = calculateRunBindingSha256V1(lateWarmup);
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

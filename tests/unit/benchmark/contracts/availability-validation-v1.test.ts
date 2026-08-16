import { describe, expect, it } from 'vitest';
import { calculateRunBindingSha256V1, validateBenchmarkRunV1 } from '../../../../src/benchmark/contracts/validateV1';
import { compareUtf16 } from '../../../../src/benchmark/provenance/canonicalJsonV1';
import { createBenchmarkCaseDocumentV1, createBenchmarkValidationContextV1 } from './benchmark-case-fixtures-v1';

const eligibilityPhases = [
  { phase: 'cold', scenarioId: 'mesh-golden-world-v1', container: 'cold' },
  { phase: 'measurement', scenarioId: 'mesh-golden-world-v1', container: 'warm-measurement' },
  { phase: 'stress', scenarioId: 'scheduler-steady-v1', container: 'stress' },
] as const;

const eligibilityGates = [
  { label: 'hidden', kind: 'visibility', value: 'hidden', reasonCode: 'document-hidden' },
  { label: 'unfocused', kind: 'focus', value: 'unfocused', reasonCode: 'document-unfocused' },
  { label: 'background tabs', kind: 'backgroundTabs', value: 1, reasonCode: 'background-tabs-present' },
  { label: 'thermal', kind: 'thermalState', value: 'throttled', reasonCode: 'thermal-throttling' },
  { label: 'missing capability', kind: 'capability', capabilityId: 'performance-time-origin', reasonCode: 'required-capability-missing' },
  { label: 'unknown evidence', kind: 'unknown-visibility', reasonCode: 'environment-incomplete' },
] as const;

const digestMatchCases = [
  { metricRef: 'coverage.sha256.match@1', scenarioId: 'mesh-golden-world-v1', phase: 'measurement', container: 'warm-measurement' },
  { metricRef: 'world.sha256.match@1', scenarioId: 'brush-stress-v1', phase: 'stress', container: 'stress' },
  { metricRef: 'image.contract.sha256.match@1', scenarioId: 'backend-fixture-v1', phase: 'measurement', container: 'warm-measurement', webgpuTimestamp: 'unsupported' },
] as const;

function eligibilityDocument(
  phaseConfig: (typeof eligibilityPhases)[number],
  gate: (typeof eligibilityGates)[number],
  includeRunReason: boolean,
  cellReason: 'correct' | 'mismatch' | 'empty' = 'correct',
): { readonly document: any; readonly context: any } {
  const document = createBenchmarkCaseDocumentV1({ ...phaseConfig, samples: true }) as any;
  const environments = [document.environment, document.browserProcesses[0].environment, ...document.browserProcesses[0].runs.map((run: any) => run.environment)];
  for (const environment of environments) {
    if (gate.kind === 'capability') {
      const capability = environment.capabilities.find((entry: any) => entry.id === gate.capabilityId);
      capability.value = { status: 'unsupported', value: null, sourceRef: 'capture-v1', reasonCode: 'api-not-supported' };
    } else if (gate.kind === 'unknown-visibility') {
      environment.runtimeState.visibility = { status: 'unknown', value: null, sourceRef: 'capture-v1', reasonCode: 'visibility-not-observed' };
    } else {
      environment.runtimeState[gate.kind] = { status: 'observed', value: gate.value, sourceRef: 'capture-v1', stability: 'stable' };
    }
  }
  const targetRun = document.browserProcesses[0].runs.at(-1);
  targetRun.execution.measurementEligibility = 'ineligible';
  targetRun.measurementEligible = false;
  targetRun.measurementEligibilityReasons = includeRunReason
    ? [{ code: gate.reasonCode, detail: 'eligibility gate', phase: phaseConfig.phase }]
    : [];
  for (const run of document.browserProcesses[0].runs) {
    if (gate.kind === 'visibility') run.execution.pageState.visibility = gate.value;
    if (gate.kind === 'focus') run.execution.pageState.focus = gate.value;
    if (gate.kind === 'backgroundTabs') run.execution.pageState.backgroundTabs = gate.value;
    run.runBindingSha256 = calculateRunBindingSha256V1(run);
    for (const iteration of run.iterations) for (const sample of iteration.samples) sample.runBindingSha256 = run.runBindingSha256;
  }
  document.measurementEligibilityReasons = cellReason === 'correct' && includeRunReason
    ? [{ code: gate.reasonCode, detail: 'eligibility gate', phase: phaseConfig.phase }]
    : cellReason === 'mismatch'
      ? [{ code: 'document-unfocused', detail: 'wrong cell reason', phase: phaseConfig.phase }]
      : [];
  document.measurementEligible = false;
  return { document, context: createBenchmarkValidationContextV1({ scenarioId: phaseConfig.scenarioId }) };
}

function setCapability(document: any, capabilityId: string, value: any | undefined): void {
  const environments = [document.environment, document.browserProcesses[0].environment, ...document.browserProcesses[0].runs.map((run: any) => run.environment)];
  for (const environment of environments) {
    const index = environment.capabilities.findIndex((entry: any) => entry.id === capabilityId);
    if (value === undefined) {
      if (index >= 0) environment.capabilities.splice(index, 1);
    } else if (index >= 0) {
      environment.capabilities[index].value = value;
    } else {
      environment.capabilities.push({ id: capabilityId, value });
      environment.capabilities.sort((left: any, right: any) => compareUtf16(left.id, right.id));
    }
  }
  for (const run of document.browserProcesses[0].runs) {
    run.runBindingSha256 = calculateRunBindingSha256V1(run);
    for (const iteration of run.iterations) for (const sample of iteration.samples) sample.runBindingSha256 = run.runBindingSha256;
  }
}

describe('BR01 fail-closed semantic rules', () => {
  it('rejects a declared false-like capability and accepts explicit zero only as a measurement value', () => {
    expect(validateBenchmarkRunV1({}, createBenchmarkValidationContextV1()).valid).toBe(false);
    expect(validateBenchmarkRunV1({ status: 'declared', value: false }, createBenchmarkValidationContextV1()).valid).toBe(false);
  });
  it('accepts observed false and zero values as real observations', () => {
    const document = createBenchmarkCaseDocumentV1({ samples: true }) as any;
    const context = createBenchmarkValidationContextV1();
    const environments = [document.environment, document.browserProcesses[0].environment, ...document.browserProcesses[0].runs.map((run: any) => run.environment)];
    for (const environment of environments) {
      environment.browser.headless.value = false;
      environment.runtimeState.backgroundTabs.value = 0;
      environment.power.source.value = 'battery';
      environment.power.battery.value = { status: 'reported', percent: 0 };
    }
    for (const run of document.browserProcesses[0].runs) { run.runBindingSha256 = calculateRunBindingSha256V1(run); for (const iteration of run.iterations) for (const sample of iteration.samples) sample.runBindingSha256 = run.runBindingSha256; }
    expect(validateBenchmarkRunV1(document, context)).toMatchObject({ valid: true });
  });
  it.each(['visibility', 'focus'] as const)('keeps unknown %s structurally valid but ineligible', (field) => {
    const document = createBenchmarkCaseDocumentV1({ samples: true }) as any;
    const unavailable = { status: 'unknown', value: null, sourceRef: 'capture-v1', reasonCode: `${field}-not-observed` };
    const environments = [document.environment, document.browserProcesses[0].environment, ...document.browserProcesses[0].runs.map((run: any) => run.environment)];
    for (const environment of environments) environment.runtimeState[field] = unavailable;
    for (const run of document.browserProcesses[0].runs) {
      run.execution.measurementEligibility = 'ineligible';
      run.measurementEligible = false;
      run.measurementEligibilityReasons = [{ code: 'environment-incomplete', detail: `${field} evidence unavailable`, phase: run.execution.phase }];
      run.runBindingSha256 = calculateRunBindingSha256V1(run);
      for (const iteration of run.iterations) for (const sample of iteration.samples) sample.runBindingSha256 = run.runBindingSha256;
    }
    document.measurementEligibilityReasons = [{ code: 'environment-incomplete', detail: 'eligibility gate', phase: 'measurement' }];
    document.measurementEligible = false;
    expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1())).toMatchObject({ valid: true });
  });
  it('rejects an unknown power profile before an eligible run can pass', () => {
    const document = createBenchmarkCaseDocumentV1({ samples: true }) as any;
    const environments = [document.environment, document.browserProcesses[0].environment, ...document.browserProcesses[0].runs.map((run: any) => run.environment)];
    for (const environment of environments) environment.power.profile.value = 'unknown';
    expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1())).toMatchObject({ valid: false, stage: 'schema' });
  });
  it('keeps an unavailable power profile structural while making the run ineligible', () => {
    const document = createBenchmarkCaseDocumentV1({ samples: true }) as any;
    const unavailable = { status: 'unknown', value: null, sourceRef: 'capture-v1', reasonCode: 'profile-not-observed' };
    const environments = [document.environment, document.browserProcesses[0].environment, ...document.browserProcesses[0].runs.map((run: any) => run.environment)];
    for (const environment of environments) environment.power.profile = unavailable;
    const targetRun = document.browserProcesses[0].runs.at(-1);
    targetRun.execution.measurementEligibility = 'ineligible';
    targetRun.measurementEligible = false;
    targetRun.measurementEligibilityReasons = [{ code: 'environment-incomplete', detail: 'power profile unavailable', phase: targetRun.execution.phase }];
    for (const run of document.browserProcesses[0].runs) {
      run.runBindingSha256 = calculateRunBindingSha256V1(run);
      for (const iteration of run.iterations) for (const sample of iteration.samples) sample.runBindingSha256 = run.runBindingSha256;
    }
    document.measurementEligibilityReasons = [{ code: 'environment-incomplete', detail: 'eligibility gate', phase: 'measurement' }];
    document.measurementEligible = false;
    const result = validateBenchmarkRunV1(document, createBenchmarkValidationContextV1());
    expect(result, JSON.stringify(result)).toMatchObject({ valid: true });
  });
  it('keeps an owner-unbound H2 profile structural but never measurement-eligible', () => {
    const document = createBenchmarkCaseDocumentV1({ samples: true }) as any;
    const unavailable = { status: 'unknown', value: null, sourceRef: 'capture-v1', reasonCode: 'profile-not-owner-bound' };
    const tier = { status: 'observed', value: 'H2', sourceRef: 'capture-v1', stability: 'stable' };
    const environments = [document.environment, document.browserProcesses[0].environment, ...document.browserProcesses[0].runs.map((run: any) => run.environment)];
    for (const environment of environments) { environment.hardwareProfileTier = tier; environment.hardwareProfileId = unavailable; }
    for (const run of document.browserProcesses[0].runs) {
      run.execution.measurementEligibility = 'ineligible';
      run.measurementEligible = false;
      run.measurementEligibilityReasons = [{ code: 'environment-incomplete', detail: 'H2 profile is not owner-bound', phase: run.execution.phase }];
      run.runBindingSha256 = calculateRunBindingSha256V1(run);
      for (const iteration of run.iterations) for (const sample of iteration.samples) sample.runBindingSha256 = run.runBindingSha256;
    }
    document.measurementEligibilityReasons = [{ code: 'environment-incomplete', detail: 'eligibility gate', phase: 'measurement' }];
    document.measurementEligible = false;
    expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1())).toMatchObject({ valid: true });
  });
  it.each([
    ['hidden document', 'visibility', 'hidden'],
    ['unfocused document', 'focus', 'unfocused'],
    ['thermal throttling', 'thermalState', 'throttled'],
  ] as const)('rejects an ineligible measurement with an empty %s reason', (_label, field, value) => {
    const document = createBenchmarkCaseDocumentV1({ samples: true }) as any;
    const environments = [document.environment, document.browserProcesses[0].environment, ...document.browserProcesses[0].runs.map((run: any) => run.environment)];
    for (const environment of environments) environment.runtimeState[field] = { status: 'observed', value, sourceRef: 'capture-v1', stability: 'stable' };
    const run = document.browserProcesses[0].runs.at(-1);
    run.execution.measurementEligibility = 'ineligible';
    run.measurementEligible = false;
    run.measurementEligibilityReasons = [];
    for (const entry of document.browserProcesses[0].runs) {
      if (field === 'visibility') entry.execution.pageState.visibility = value;
      if (field === 'focus') entry.execution.pageState.focus = value;
      entry.runBindingSha256 = calculateRunBindingSha256V1(entry);
      for (const iteration of entry.iterations) for (const sample of iteration.samples) sample.runBindingSha256 = entry.runBindingSha256;
    }
    document.measurementEligible = false;
    expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1())).toMatchObject({ valid: false, code: 'eligibility-reason-missing' });
  });
  it('rejects an ineligible measurement with an empty capability reason', () => {
    const document = createBenchmarkCaseDocumentV1({ samples: true }) as any;
    const environments = [document.environment, document.browserProcesses[0].environment, ...document.browserProcesses[0].runs.map((run: any) => run.environment)];
    for (const environment of environments) {
      const capability = environment.capabilities.find((entry: any) => entry.id === 'performance-time-origin');
      capability.value = { status: 'unsupported', value: null, sourceRef: 'capture-v1', reasonCode: 'api-not-supported' };
    }
    const run = document.browserProcesses[0].runs.at(-1);
    run.execution.measurementEligibility = 'ineligible';
    run.measurementEligible = false;
    run.measurementEligibilityReasons = [];
    for (const entry of document.browserProcesses[0].runs) {
      entry.runBindingSha256 = calculateRunBindingSha256V1(entry);
      for (const iteration of entry.iterations) for (const sample of iteration.samples) sample.runBindingSha256 = entry.runBindingSha256;
    }
    document.measurementEligible = false;
    expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1())).toMatchObject({ valid: false, code: 'eligibility-reason-missing' });
  });
  it.each(eligibilityPhases.flatMap((phaseConfig) => eligibilityGates.map((gate) => ({ phaseConfig, gate }))))('binds the first applicable $gate.label reason for $phaseConfig.phase runs', ({ phaseConfig, gate }) => {
    const accepted = eligibilityDocument(phaseConfig, gate, true);
    expect(validateBenchmarkRunV1(accepted.document, accepted.context)).toMatchObject({ valid: true });
    const missing = eligibilityDocument(phaseConfig, gate, false);
    expect(validateBenchmarkRunV1(missing.document, missing.context)).toMatchObject({ valid: false, code: 'eligibility-reason-missing' });
  });
  it('binds hardware-cell reasons to the first applicable non-intrinsic run reason', () => {
    const value = eligibilityDocument(eligibilityPhases[0]!, eligibilityGates[0]!, true, 'mismatch');
    expect(validateBenchmarkRunV1(value.document, value.context)).toMatchObject({ valid: false, code: 'measurement-ineligible' });
  });
  it('derives the cell reason independently of run-reason detail', () => {
    const value = eligibilityDocument(eligibilityPhases[0]!, eligibilityGates[0]!, true);
    value.document.browserProcesses[0].runs.at(-1).measurementEligibilityReasons[0].detail = 'run-specific diagnostic';
    expect(validateBenchmarkRunV1(value.document, value.context)).toMatchObject({ valid: true });
  });
  it.each(digestMatchCases)('requires canonical equal digest dimensions for $metricRef', (configuration) => {
    const document = createBenchmarkCaseDocumentV1({ ...configuration, samples: true }) as any;
    const context = createBenchmarkValidationContextV1({ scenarioId: configuration.scenarioId });
    const sample = document.browserProcesses[0].runs.at(-1).iterations.flatMap((iteration: any) => iteration.samples).find((entry: any) => entry.metricRef === configuration.metricRef);
    expect(validateBenchmarkRunV1(document, context)).toMatchObject({ valid: true });
    const mutations = [
      (entry: any) => { entry.dimensions = [entry.dimensions[0]]; },
      (entry: any) => { entry.dimensions = [...entry.dimensions, { key: 'other', value: 'value' }]; },
      (entry: any) => { entry.dimensions[0].value = 'not-a-sha'; },
      (entry: any) => { entry.dimensions[1].value = `sha256:${'b'.repeat(64)}`; },
    ];
    for (const mutate of mutations) {
      const candidate = JSON.parse(JSON.stringify(document));
      const target = candidate.browserProcesses[0].runs.at(-1).iterations.flatMap((iteration: any) => iteration.samples).find((entry: any) => entry.metricRef === configuration.metricRef);
      mutate(target);
      expect(validateBenchmarkRunV1(candidate, context).valid).toBe(false);
    }
    expect(sample.dimensions[0].value).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
  it.each([
    ['declared', { status: 'declared', value: true, sourceRef: 'capture-v1', stability: 'run-config' }],
    ['unsupported', { status: 'unsupported', value: null, sourceRef: 'capture-v1', reasonCode: 'api-not-supported' }],
    ['missing', undefined],
    ['false', { status: 'observed', value: false, sourceRef: 'capture-v1', stability: 'stable' }],
  ] as const)('requires observed true for sampled metric capabilities: %s', (_label, value) => {
    const document = createBenchmarkCaseDocumentV1({ scenarioId: 'backend-fixture-v1', samples: true, webgpuTimestamp: 'unsupported' }) as any;
    setCapability(document, 'request-animation-frame', value);
    expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1({ scenarioId: 'backend-fixture-v1' }))).toMatchObject({ valid: false, code: 'required-capability-missing' });
  });
  it('requires canonical memory kinds and rejects a missing kind', () => {
    const document = createBenchmarkCaseDocumentV1({ scenarioId: 'navigation-leak-v1', phase: 'leak', container: 'leak', samples: true }) as any;
    const run = document.browserProcesses[0].runs[0];
    run.iterations[0].samples = run.iterations[0].samples.filter((sample: any) => sample.dimensions.find((dimension: any) => dimension.key === 'memory-kind')?.value !== 'js-heap').map((sample: any, ordinal: number) => ({ ...sample, ordinal }));
    expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1({ scenarioId: 'navigation-leak-v1' }))).toMatchObject({ valid: false, code: 'metric-dimension-missing' });
  });
  it('rejects duplicate canonical memory kinds specifically', () => {
    const document = createBenchmarkCaseDocumentV1({ scenarioId: 'navigation-leak-v1', phase: 'leak', container: 'leak', samples: true }) as any;
    const run = document.browserProcesses[0].runs[0];
    const duplicate = { ...run.iterations[0].samples.find((sample: any) => sample.dimensions.find((dimension: any) => dimension.key === 'memory-kind')?.value === 'js-heap'), sampleId: 'sample-duplicate', ordinal: run.iterations[0].samples.length };
    run.iterations[0].samples.push(duplicate);
    expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1({ scenarioId: 'navigation-leak-v1' }))).toMatchObject({ valid: false, code: 'metric-dimension-duplicate' });
  });
  it.each([
    ['navigation-leak-v1', { phase: 'leak', container: 'leak' }],
    ['backend-fixture-v1', { phase: 'measurement', container: 'warm-measurement' }],
  ] as const)('rejects an invented memory kind for %s', (scenarioId, options) => {
    const document = createBenchmarkCaseDocumentV1({ scenarioId, ...options, samples: true }) as any;
    const sample = document.browserProcesses[0].runs.at(-1).iterations[0].samples.find((entry: any) => entry.metricRef === 'memory.bytes@1');
    sample.dimensions.find((dimension: any) => dimension.key === 'memory-kind').value = 'invented-memory-kind';
    expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1({ scenarioId }))).toMatchObject({ valid: false, code: 'metric-dimension-missing' });
  });
  it('rejects an extra unmatched scenario memory variant', () => {
    const document = createBenchmarkCaseDocumentV1({ scenarioId: 'navigation-leak-v1', phase: 'leak', container: 'leak', samples: true }) as any;
    const run = document.browserProcesses[0].runs[0];
    const memorySample = run.iterations[0].samples.find((entry: any) => entry.metricRef === 'memory.bytes@1');
    run.iterations[0].samples.push({
      ...memorySample,
      sampleId: 'sample-invented-memory',
      ordinal: run.iterations[0].samples.length,
      dimensions: memorySample.dimensions.map((dimension: any) => dimension.key === 'memory-kind' ? { ...dimension, value: 'invented-memory-kind' } : dimension),
    });
    expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1({ scenarioId: 'navigation-leak-v1' }))).toMatchObject({ valid: false, code: 'metric-dimension-missing' });
  });
  it('keeps extra dimensions valid for metrics without scenario dimension contracts', () => {
    const document = createBenchmarkCaseDocumentV1({ samples: true }) as any;
    const sample = document.browserProcesses[0].runs.at(-1).iterations[0].samples.find((entry: any) => entry.metricRef === 'geometry.bytes@1');
    sample.dimensions = [{ key: 'invented', value: 'generic-metric-context' }];
    expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1())).toMatchObject({ valid: true });
  });
  it.each([
    ['unknown version', { schemaVersion: 'v2' }],
    ['flat sample', { sample: { value: 1 } }],
    ['warm-measurement phase', { phase: 'warm-measurement' }],
    ['unknown metric', { metricRef: 'unknown@1' }],
    ['invalid path', { path: '../escape' }],
  ])('fails closed for %s', (_name, input) => expect(validateBenchmarkRunV1(input, createBenchmarkValidationContextV1()).valid).toBe(false));
});

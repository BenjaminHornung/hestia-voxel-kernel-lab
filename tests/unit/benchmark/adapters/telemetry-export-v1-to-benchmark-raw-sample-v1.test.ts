import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_METRIC_REGISTRY_V1,
  canonicalizeJsonV1,
} from '../../../../src/benchmark/contracts/browserV1';
import { BENCHMARK_SCHEMA_SET_BYTES_V1 } from '../../../../src/benchmark/contracts/schemaSetV1';
import { createBenchmarkValidationReceiptV1, validateBenchmarkValidationReceiptV1 } from '../../../../src/benchmark/contracts/validateV1';
import type {
  AdaptTelemetryExportV1,
  BenchmarkBackendCellV1,
  BenchmarkSamplePhaseV1,
  CanonicalIdV1,
  MetricRegistryV1,
  Sha256DigestV1,
  TelemetryAdapterContextV1,
  TelemetryExportV1,
} from '../../../../src/benchmark/contracts/browserV1';
import { adaptTelemetryExportV1 } from '../../../../src/benchmark/adapters';
import { deriveTelemetryCapabilityIdsV1 } from '../../../../src/diagnostics/telemetry/contractV1';
import { createTelemetryBufferV1 } from '../../../../src/diagnostics/telemetry/bufferV1';
import { applySyntheticFutureProducerRecordsV1, createBenchmarkCaseDocumentV1, createBenchmarkValidationContextV1 } from '../contracts/benchmark-case-fixtures-v1';
import type {
  Br02TelemetryExportV1,
  TelemetryCapabilityV1,
  TelemetryIterationV1,
  TelemetryRealmV1,
  TelemetryRecordDraftV1,
  TelemetrySampleNameV1,
} from '../../../../src/diagnostics/telemetry/contractV1';

const id = (value: string): CanonicalIdV1 => value as CanonicalIdV1;
const digest = `sha256:${'a'.repeat(64)}` as Sha256DigestV1;
const runBindingSha256 = `sha256:${'b'.repeat(64)}` as Sha256DigestV1;

type TestPhase = BenchmarkSamplePhaseV1;

function observedCapability(capabilityId: string): TelemetryCapabilityV1 {
  return {
    id: id(capabilityId),
    value: { status: 'observed', value: true, sourceRef: id('capture-v1'), stability: 'stable' },
  };
}

function declaredCapability(capabilityId: string): TelemetryCapabilityV1 {
  return {
    id: id(capabilityId),
    value: { status: 'declared', value: true, sourceRef: id('plan-v1'), stability: 'run-config' },
  };
}

function unavailableCapability(capabilityId: string): TelemetryCapabilityV1 {
  return {
    id: id(capabilityId),
    value: { status: 'unsupported', value: null, sourceRef: id('capture-v1'), reasonCode: id('not-observed') },
  };
}

function sampleDraft(
  name: TelemetrySampleNameV1,
  iterationId = 'iteration-0',
  realmId = 'main-realm',
  value = 1,
  startMs = 1,
): TelemetryRecordDraftV1 {
  const base = { realmId: id(realmId), startMs, kind: 'sample' as const, name, iterationId: id(iterationId) };
  if (name === 'run.total') return { ...base, fields: { sampleKind: 'duration', sourceUnit: 'ms', value, operationId: id('operation'), spanId: id('span') } } as TelemetryRecordDraftV1;
  if (name === 'worker.mesh-cpu') return { ...base, fields: { sampleKind: 'duration', sourceUnit: 'ms', value, operationId: id('operation'), spanId: id('span'), dimensions: [{ key: 'chunk-key', value: id('chunk-0') }] } } as TelemetryRecordDraftV1;
  if (name === 'mesh.quads') return { ...base, fields: { sampleKind: 'counter', sourceUnit: 'count', value, operationId: id('operation') } } as TelemetryRecordDraftV1;
  if (name === 'mesh.output-bytes') return { ...base, fields: { sampleKind: 'memory', sourceUnit: 'byte', value, operationId: id('operation') } } as TelemetryRecordDraftV1;
  if (name === 'coverage.sha256-match') return { ...base, fields: { sampleKind: 'liveness', sourceUnit: 'count', value: value as 1, operationId: id('operation'), dimensions: [{ key: 'actual-sha256', value: digest }, { key: 'expected-sha256', value: digest }] } } as TelemetryRecordDraftV1;
  if (name === 'browser.long-task') return { ...base, fields: { sampleKind: 'long-task', sourceUnit: 'ms', value, operationId: id('operation'), dimensions: [{ key: 'time-block-ordinal', value: 0 }] } } as TelemetryRecordDraftV1;
  if (name === 'draw-submit.cpu') return { ...base, fields: { sampleKind: 'duration', sourceUnit: 'ms', value, operationId: id('operation'), spanId: id('span') } } as TelemetryRecordDraftV1;
  return { ...base, fields: { sampleKind: 'frame', sourceUnit: 'ms', value, operationId: id('operation'), dimensions: [{ key: 'time-block-ordinal', value: 0 }] } } as TelemetryRecordDraftV1;
}

function contextFor(value: Br02TelemetryExportV1, iterationId = value.iterations[0]!.iterationId, phase: TestPhase = value.phase): TelemetryAdapterContextV1 {
  return {
    hardwareCellId: id('hardware-cell'),
    slotId: id('slot'),
    browserProcessId: id('browser-process'),
    runId: value.runId,
    iterationId,
    phase,
    runBindingSha256,
  };
}

function makeExport(options: {
  readonly runId?: string;
  readonly scenarioId?: string;
  readonly phase?: TestPhase;
  readonly backend?: BenchmarkBackendCellV1;
  readonly iterations?: readonly TelemetryIterationV1[];
  readonly realms?: readonly TelemetryRealmV1[];
  readonly drafts?: readonly TelemetryRecordDraftV1[];
  readonly telemetryMode?: 'telemetry-enabled-minimal' | 'telemetry-enabled-full';
} = {}): Br02TelemetryExportV1 {
  const phase = options.phase ?? 'measurement';
  const scenarioId = id(options.scenarioId ?? 'mesh-golden-world-v1');
  const backend = options.backend ?? 'three-webgl2';
  const buffer = createTelemetryBufferV1({
    runId: id(options.runId ?? 'run'),
    planId: id('plan'),
    scenarioId,
    phase,
    backend,
    telemetryMode: options.telemetryMode ?? 'telemetry-enabled-minimal',
    iterations: options.iterations ?? [{ iterationId: id('iteration-0'), iterationOrdinal: 0 }],
    realms: options.realms ?? [{ realmId: id('main-realm'), realm: 'main', timeOriginEpochMs: 1000.125 }],
    capabilities: deriveTelemetryCapabilityIdsV1({ scenarioId, phase, backend }).map(observedCapability),
  });
  for (const draft of options.drafts ?? []) expect(buffer.append(draft).status).toBe('accepted');
  return buffer.seal();
}

function adapt(value: unknown, context: unknown, registry: unknown = BENCHMARK_METRIC_REGISTRY_V1): ReturnType<AdaptTelemetryExportV1> {
  return adaptTelemetryExportV1(value as TelemetryExportV1, context as TelemetryAdapterContextV1, registry as MetricRegistryV1);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function expectReason(result: ReturnType<AdaptTelemetryExportV1>, code: string, detail: string): void {
  expect(result.samples).toEqual([]);
  expect(result.invalidReasons).toContainEqual(expect.objectContaining({ code, detail }));
}

function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => reverseKeys(entry));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reverseKeys(entry)]));
  }
  return value;
}

describe('BR02 telemetry export adapter', () => {
  it('is directly assignable to the frozen BR01 adapter contract', () => {
    const directAssignment: AdaptTelemetryExportV1 = adaptTelemetryExportV1;
    expect(directAssignment).toBe(adaptTelemetryExportV1);
  });

  it.each([
    { name: 'run.total', scenarioId: 'mesh-golden-world-v1', phase: 'cold', backend: 'three-webgl2', expectedMetric: 'world.mesh.total.ms@1', expectedKind: 'duration', expectedUnit: 'ms', realm: 'main', value: 2.25 },
    { name: 'worker.mesh-cpu', scenarioId: 'mesh-golden-world-v1', phase: 'measurement', backend: 'three-webgl2', expectedMetric: 'chunk.mesh.cpu.ms@1', expectedKind: 'duration', expectedUnit: 'ms', realm: 'worker', value: 3.5 },
    { name: 'mesh.quads', scenarioId: 'mesh-golden-world-v1', phase: 'measurement', backend: 'three-webgl2', expectedMetric: 'mesh.quads.count@1', expectedKind: 'counter', expectedUnit: 'count', realm: 'main', value: 7 },
    { name: 'mesh.output-bytes', scenarioId: 'mesh-golden-world-v1', phase: 'measurement', backend: 'three-webgl2', expectedMetric: 'geometry.bytes@1', expectedKind: 'memory', expectedUnit: 'bytes', realm: 'main', value: 4096 },
    { name: 'coverage.sha256-match', scenarioId: 'mesh-golden-world-v1', phase: 'measurement', backend: 'three-webgl2', expectedMetric: 'coverage.sha256.match@1', expectedKind: 'liveness', expectedUnit: 'count', realm: 'main', value: 1 },
    { name: 'browser.long-task', scenarioId: 'scheduler-steady-v1', phase: 'measurement', backend: 'three-webgl2', expectedMetric: 'longtask.duration.ms@1', expectedKind: 'long-task', expectedUnit: 'ms', realm: 'main', value: 50.25 },
    { name: 'draw-submit.cpu', scenarioId: 'backend-fixture-v1', phase: 'cold', backend: 'three-webgl2', expectedMetric: 'draw.submit.cpu.ms@1', expectedKind: 'duration', expectedUnit: 'ms', realm: 'main', value: 1.75 },
    { name: 'browser.raf-interval', scenarioId: 'backend-fixture-v1', phase: 'measurement', backend: 'three-webgl2', expectedMetric: 'raf.interval.ms@1', expectedKind: 'frame', expectedUnit: 'ms', realm: 'main', value: 16.75 },
  ] as const)('maps each BR02 owner record without rewriting its value', (testCase) => {
    const realms = testCase.realm === 'worker'
      ? [{ realmId: id('worker-realm'), realm: 'worker' as const, timeOriginEpochMs: 2000.5 }]
      : undefined;
    const value = makeExport({
      scenarioId: testCase.scenarioId,
      phase: testCase.phase,
      backend: testCase.backend,
      realms,
       telemetryMode: testCase.name === 'browser.long-task' ? 'telemetry-enabled-full' : undefined,
      drafts: [sampleDraft(testCase.name, 'iteration-0', testCase.realm === 'worker' ? 'worker-realm' : 'main-realm', testCase.value, 12.375)],
    });
    const result = adapt(value, contextFor(value));
    expect(result.invalidReasons).toEqual([]);
    expect(result.samples).toHaveLength(1);
    const sample = result.samples[0]!;
    expect(sample).toMatchObject({
      schemaVersion: 'benchmark-raw-sample-v1',
      sampleId: 'br02-sample-00000000',
      ordinal: 0,
      iterationId: 'iteration-0',
      phase: testCase.phase,
      metricRef: testCase.expectedMetric,
      kind: testCase.expectedKind,
      realm: testCase.realm,
      unit: testCase.expectedUnit,
      result: { status: 'valid', value: testCase.value },
      runBindingSha256,
    });
    expect(sample.observedAt).toEqual({
      clock: 'performance-time-origin',
      realmId: testCase.realm === 'worker' ? 'worker-realm' : 'main-realm',
      timeOriginEpochMs: testCase.realm === 'worker' ? 2000.5 : 1000.125,
      startMs: 12.375,
    });
    if (testCase.name === 'mesh.output-bytes') expect(sample.result).toEqual({ status: 'valid', value: 4096 });
  });

  it('keeps context, diagnostic, and control records out of samples', () => {
    const contextExport = makeExport({ drafts: [{ realmId: id('main-realm'), startMs: 1, kind: 'context', name: 'document.visibility', iterationId: null, fields: { value: 'visible' } }] });
    const diagnosticExport = makeExport({ telemetryMode: 'telemetry-enabled-full', drafts: [{ realmId: id('main-realm'), startMs: 2, kind: 'diagnostic', name: 'browser.event-timing', iterationId: null, fields: { durationMs: 2, timeBlockOrdinal: 0 } }] });
    const controlExport = makeExport({ drafts: [{ realmId: id('main-realm'), startMs: 3, kind: 'control', name: 'telemetry.invalidation', iterationId: null, fields: { source: 'clock-anomaly', reasonCode: 'clock-invalid', detailCode: 'br02-clock-invalid' } }] });
    expect(adapt(contextExport, contextFor(contextExport))).toMatchObject({ samples: [], invalidReasons: [] });
    expect(adapt(diagnosticExport, contextFor(diagnosticExport))).toMatchObject({ samples: [], invalidReasons: [] });
    expect(adapt(controlExport, contextFor(controlExport)).samples).toEqual([]);
  });

  it.each(['scheduler.queue-depth', 'memory.bytes'] as const)('does not create a BR02 producer path for %s', (name) => {
    const value = clone(makeExport({ drafts: [sampleDraft('run.total')] })) as any;
    value.records[0].name = name;
    const result = adapt(value, contextFor(value));
    expectReason(result, 'sample-invalid', 'br02-export-invalid');
  });

  it.each([
    ['hardwareCellId', 'INVALID'],
    ['slotId', 'INVALID'],
    ['browserProcessId', 'INVALID'],
    ['runId', 'INVALID'],
    ['iterationId', 'INVALID'],
    ['phase', 'INVALID'],
    ['runBindingSha256', 'sha256:INVALID'],
  ] as const)('rejects an invalid context field: %s', (field, value) => {
    const exportValue = makeExport({ drafts: [sampleDraft('run.total')] });
    const context = contextFor(exportValue) as any;
    context[field] = value;
    expectReason(adapt(exportValue, context), 'sample-invalid', 'br02-context-invalid');
  });

  it.each([
    ['run ID mismatch', (context: any) => { context.runId = 'different-run'; }],
    ['phase mismatch', (context: any) => { context.phase = 'cold'; }],
    ['target iteration is not registered', (context: any) => { context.iterationId = 'iteration-missing'; }],
  ] as const)('rejects a context/export mismatch: %s', (_label, mutate) => {
    const exportValue = makeExport({ drafts: [sampleDraft('run.total')] });
    const context = contextFor(exportValue) as any;
    mutate(context);
    expectReason(adapt(exportValue, context), 'sample-invalid', 'br02-context-invalid');
  });

  it('throws the deterministic phase error when neither phase is trusted', () => {
    const exportValue = clone(makeExport({ drafts: [sampleDraft('run.total')] })) as any;
    exportValue.phase = 'INVALID';
    const context = contextFor(exportValue) as any;
    context.phase = 'INVALID';
    expect(() => adapt(exportValue, context)).toThrow(new TypeError('br02-adapter-unrepresentable-phase'));
  });

  it('propagates valid export invalidation reasons without returning partial samples', () => {
    const value = makeExport({ drafts: [{ realmId: id('main-realm'), startMs: 1, kind: 'control', name: 'telemetry.invalidation', iterationId: null, fields: { source: 'clock-anomaly', reasonCode: 'clock-invalid', detailCode: 'br02-clock-invalid' } }] });
    const result = adapt(value, contextFor(value));
    expect(result.samples).toEqual([]);
    expect(result.invalidReasons).toEqual(value.validity.status === 'invalid' ? value.validity.reasons : []);
  });

  it.each([
    ['unknown name', (value: any) => { value.records[0].name = 'unknown.record'; }],
    ['wrong kind', (value: any) => { value.records[0].fields.sampleKind = 'counter'; }],
    ['wrong unit', (value: any) => { value.records[0].fields.sourceUnit = 'bytes'; }],
    ['wrong range', (value: any) => { value.records[0].fields.value = -1; }],
    ['missing dimension', (value: any) => { value.records[0].fields.dimensions = []; }],
    ['additional dimension', (value: any) => { value.records[0].fields.dimensions.push({ key: 'chunk-key', value: 'chunk-1' }); }],
    ['wrong dimension', (value: any) => { value.records[0].fields.dimensions[0].key = 'time-block-ordinal'; }],
  ] as const)('rejects a malformed concrete export: %s', (_label, mutate) => {
    const source = _label.includes('dimension') ? 'worker.mesh-cpu' : 'run.total';
    const value = clone(makeExport({
      realms: source === 'worker.mesh-cpu' ? [{ realmId: id('worker-realm'), realm: 'worker', timeOriginEpochMs: 2000 }] : undefined,
      drafts: [sampleDraft(source, 'iteration-0', source === 'worker.mesh-cpu' ? 'worker-realm' : 'main-realm')],
    })) as any;
    mutate(value);
    expectReason(adapt(value, contextFor(value)), 'sample-invalid', 'br02-export-invalid');
  });

  it.each(['mesh.quads', 'mesh.output-bytes'] as const)('accepts zero for non-negative-safe-integer metric %s', (name) => {
    const value = makeExport({ drafts: [sampleDraft(name, 'iteration-0', 'main-realm', 0)] });
    const result = adapt(value, contextFor(value));
    expect(result.invalidReasons).toEqual([]);
    expect(result.samples).toHaveLength(1);
    expect(result.samples[0]?.result).toEqual({ status: 'valid', value: 0 });
  });

  it('rejects a zero RAF record before adaptation', () => {
    const value = makeExport({
      scenarioId: 'backend-fixture-v1',
       drafts: [],
    });
    const buffer = createTelemetryBufferV1({
      runId: value.runId,
      planId: id('plan'),
      scenarioId: id('backend-fixture-v1'),
      phase: 'measurement',
      backend: 'three-webgl2',
      telemetryMode: 'telemetry-enabled-minimal',
      iterations: value.iterations,
      realms: value.realms,
      capabilities: value.capabilities,
    });
    expect(buffer.append(sampleDraft('browser.raf-interval', 'iteration-0', 'main-realm', 0)).status).toBe('rejected');
    expect(adapt(buffer.seal(), contextFor(value))).toMatchObject({ samples: [] });
  });

  it.each([
    ['phase', (value: any) => { value.phase = 'stress'; }],
    ['backend', (value: any) => { value.backend = 'not-applicable'; }],
    ['scenario reachability', (value: any) => { value.scenarioId = 'scheduler-steady-v1'; }],
  ] as const)('rejects a wrong %s path', (_label, mutate) => {
    const value = clone(makeExport({ drafts: [sampleDraft('run.total')] })) as any;
    mutate(value);
    const context = contextFor(value);
    if (_label === 'phase') (context as any).phase = 'stress';
    expectReason(adapt(value, context), 'sample-invalid', 'br02-export-invalid');
  });

  it('rejects a concrete raw WebGPU export at the current browser adapter boundary', () => {
    const value = clone(makeExport({
      scenarioId: 'backend-fixture-v1',
      drafts: [sampleDraft('draw-submit.cpu')],
    })) as any;
    value.backend = 'raw-webgpu';
    expectReason(adapt(value, contextFor(value)), 'sample-invalid', 'br02-export-invalid');
  });

  it.each([
    ['missing', (value: any) => {
      value.capabilities.find((capability: any) => capability.id === 'request-animation-frame').value = unavailableCapability('request-animation-frame').value;
    }],
    ['declared', (value: any) => {
      value.capabilities.find((capability: any) => capability.id === 'request-animation-frame').value = declaredCapability('request-animation-frame').value;
    }],
    ['unavailable', (value: any) => {
      value.capabilities.find((capability: any) => capability.id === 'request-animation-frame').value = unavailableCapability('request-animation-frame').value;
    }],
  ] as const)('requires an observed capability when the path is capability-bound: %s', (_label, mutate) => {
    const value = clone(makeExport({
      scenarioId: 'backend-fixture-v1',
      drafts: [sampleDraft('browser.raf-interval')],
    })) as any;
    mutate(value);
    expectReason(adapt(value, contextFor(value)), 'required-capability-missing', 'br02-capability-not-observed');
  });

  it.each([
    ['noncanonical object', (registry: any) => { registry.metrics[0].metricRef = 'INVALID'; }],
    ['altered digest', (registry: any) => { registry.metricRegistrySha256 = `sha256:${'c'.repeat(64)}`; }],
    ['ambiguous mapping', (registry: any) => { registry.telemetryMappings.push({ ...registry.telemetryMappings[0] }); }],
  ] as const)('rejects a %s registry', (_label, mutate) => {
    const value = makeExport({ drafts: [sampleDraft('run.total')] });
    const registry = clone(BENCHMARK_METRIC_REGISTRY_V1) as any;
    mutate(registry);
    expectReason(adapt(value, contextFor(value), registry), 'sample-invalid', 'br02-registry-invalid');
  });

  it('requires coverage to be exactly one with equal SHA-256 dimensions', () => {
    const value = makeExport({ drafts: [sampleDraft('coverage.sha256-match')] });
    const result = adapt(value, contextFor(value));
    expect(result.samples[0]?.result).toEqual({ status: 'valid', value: 1 });
    expect(result.samples[0]?.dimensions).toEqual([
      { key: 'actual-sha256', value: digest },
      { key: 'expected-sha256', value: digest },
    ]);
    const invalidValue = clone(value) as any;
    invalidValue.records[0].fields.value = 0;
    expectReason(adapt(invalidValue, contextFor(invalidValue)), 'sample-invalid', 'br02-export-invalid');
  });

  it('uses full ingest order for global ordinals and filters only after counting', () => {
    const iterations = [
      { iterationId: id('iteration-a'), iterationOrdinal: 0 },
      { iterationId: id('iteration-b'), iterationOrdinal: 1 },
    ] as const;
    const value = makeExport({
      iterations,
      drafts: [
        sampleDraft('run.total', 'iteration-a', 'main-realm', 1, 20),
        sampleDraft('run.total', 'iteration-a', 'main-realm', 2, 10),
        sampleDraft('run.total', 'iteration-b', 'main-realm', 3, 30),
        sampleDraft('run.total', 'iteration-b', 'main-realm', 4, 5),
      ],
    });
    const a = adapt(value, contextFor(value, id('iteration-a')));
    const b = adapt(value, contextFor(value, id('iteration-b')));
    expect(a.samples.map((sample) => [sample.sampleId, sample.ordinal, sample.result])).toEqual([
      ['br02-sample-00000000', 0, { status: 'valid', value: 1 }],
      ['br02-sample-00000001', 1, { status: 'valid', value: 2 }],
    ]);
    expect(b.samples.map((sample) => [sample.sampleId, sample.ordinal, sample.result])).toEqual([
      ['br02-sample-00000002', 2, { status: 'valid', value: 3 }],
      ['br02-sample-00000003', 3, { status: 'valid', value: 4 }],
    ]);
  });

  it('rejects a sample iteration ordinal regression instead of sorting it', () => {
    const value = clone(makeExport({
      iterations: [
        { iterationId: id('iteration-a'), iterationOrdinal: 0 },
        { iterationId: id('iteration-b'), iterationOrdinal: 1 },
      ],
      drafts: [
        sampleDraft('run.total', 'iteration-a'),
        sampleDraft('run.total', 'iteration-a'),
        sampleDraft('run.total', 'iteration-b'),
        sampleDraft('run.total', 'iteration-b'),
      ],
    })) as any;
    value.records[1].iterationId = 'iteration-b';
    value.records[2].iterationId = 'iteration-a';
    expectReason(adapt(value, contextFor(value, id('iteration-a'))), 'sample-invalid', 'br02-iteration-invalid');
  });

  it('returns only BR01 fields and preserves fractional values without rounding or aggregation', () => {
    const value = makeExport({ drafts: [sampleDraft('run.total', 'iteration-0', 'main-realm', 1.23456789, 12.3456789)] });
    const result = adapt(value, contextFor(value));
    const sample = result.samples[0]!;
    expect(Object.keys(sample)).toEqual(['schemaVersion', 'sampleId', 'ordinal', 'iterationId', 'phase', 'metricRef', 'kind', 'realm', 'observedAt', 'unit', 'result', 'dimensions', 'runBindingSha256']);
    expect(Object.keys(sample.observedAt)).toEqual(['clock', 'realmId', 'timeOriginEpochMs', 'startMs']);
    expect(Object.keys(sample.result)).toEqual(['status', 'value']);
    expect(sample.result).toEqual({ status: 'valid', value: 1.23456789 });
    if (sample.observedAt.clock === 'performance-time-origin') expect(sample.observedAt.startMs).toBe(12.3456789);
    expect(sample).not.toHaveProperty('hardwareCellId');
    expect(sample).not.toHaveProperty('slotId');
    expect(sample).not.toHaveProperty('browserProcessId');
    expect(sample).not.toHaveProperty('planId');
    expect(sample).not.toHaveProperty('scenarioId');
    expect(sample).not.toHaveProperty('backend');
    expect(sample).not.toHaveProperty('recordId');
  });

  it('is stable for independent input property orders', () => {
    const value = makeExport({ drafts: [sampleDraft('worker.mesh-cpu', 'iteration-0', 'worker-realm')], realms: [{ realmId: id('worker-realm'), realm: 'worker', timeOriginEpochMs: 2000.25 }] });
    const reordered = reverseKeys(value) as Br02TelemetryExportV1;
    const first = adapt(value, contextFor(value));
    const second = adapt(reordered, contextFor(value));
    expect(second).toEqual(first);
    expect(canonicalizeJsonV1(second)).toEqual(canonicalizeJsonV1(first));
  });

  it('composes a two-iteration backend fixture through the real BR01 receipt validator', () => {
    const document = createBenchmarkCaseDocumentV1({
      scenarioId: 'backend-fixture-v1',
      backend: 'three-webgl2',
      samples: true,
      iterationCount: 2,
    }) as any;
    applySyntheticFutureProducerRecordsV1(document, ['draw-submit.cpu', 'browser.raf-interval']);
    const targetRun = document.browserProcesses[0].runs.find((run: any) => run.runId === 'measurement-run');
    expect(targetRun.iterations).toHaveLength(2);

    const iterations = targetRun.iterations.map((iteration: any) => ({
      iterationId: id(iteration.iterationId),
      iterationOrdinal: iteration.iterationOrdinal,
    }));
    const drafts = targetRun.iterations.flatMap((iteration: any) => [
      sampleDraft('draw-submit.cpu', iteration.iterationId, 'main-realm', 1, 1),
      sampleDraft('browser.raf-interval', iteration.iterationId, 'main-realm', 2, 2),
    ]);
    const exportValue = makeExport({
      runId: targetRun.runId,
      scenarioId: 'backend-fixture-v1',
      phase: 'measurement',
      backend: 'three-webgl2',
      iterations,
       drafts,
    });
    expect(exportValue.records.map((record) => [record.iterationId, record.name])).toEqual([
      [id('iteration-0'), 'draw-submit.cpu'],
      [id('iteration-0'), 'browser.raf-interval'],
      [id('iteration-1'), 'draw-submit.cpu'],
      [id('iteration-1'), 'browser.raf-interval'],
    ]);

    const contextForTarget = (iterationId: CanonicalIdV1): TelemetryAdapterContextV1 => ({
      hardwareCellId: id(targetRun.hardwareCellId),
      slotId: id(targetRun.ids.slotId),
      browserProcessId: id(targetRun.browserProcessId),
      runId: id(targetRun.runId),
      iterationId,
      phase: targetRun.execution.phase,
      runBindingSha256: targetRun.runBindingSha256,
    });
    for (const iteration of targetRun.iterations) {
      const adapted = adapt(exportValue, contextForTarget(id(iteration.iterationId)));
      expect(adapted.invalidReasons).toEqual([]);
      iteration.samples = adapted.samples;
    }

    const calls: { readonly iterationId: CanonicalIdV1; readonly ordinals: readonly number[]; readonly samples: readonly unknown[] }[] = [];
    const telemetryAdapter = {
      adapt: (telemetry: TelemetryExportV1, context: TelemetryAdapterContextV1, registry: MetricRegistryV1) => {
        const result = adaptTelemetryExportV1(telemetry, context, registry);
        calls.push({ iterationId: context.iterationId, ordinals: result.samples.map((sample) => sample.ordinal), samples: result.samples });
        return result;
      },
    };
    const benchmarkRunRawBytes = canonicalizeJsonV1(document);
    const receipt = createBenchmarkValidationReceiptV1({
      planId: id(targetRun.execution.runPlanId),
      slotId: id(targetRun.ids.slotId),
      runId: id(targetRun.runId),
      telemetryExportRawBytes: canonicalizeJsonV1(exportValue),
      benchmarkRunRawBytes,
      benchmarkRunCanonicalBytes: benchmarkRunRawBytes,
      schemaSetBytes: BENCHMARK_SCHEMA_SET_BYTES_V1,
      metricRegistry: BENCHMARK_METRIC_REGISTRY_V1,
      telemetryAdapter,
      validatorSourceCommitSha: 'a'.repeat(40) as never,
      validatorSourceFiles: [{ path: 'src/benchmark/contracts/validateV1.ts' as never, bytes: new TextEncoder().encode('validator') }],
      validationContext: createBenchmarkValidationContextV1({ scenarioId: 'backend-fixture-v1' }),
    });

    expect(receipt.status).toBe('schema-and-integrity-valid');
    expect(validateBenchmarkValidationReceiptV1(receipt)).toMatchObject({ valid: true });
    expect(calls.map((call) => [call.iterationId, call.ordinals])).toEqual([
      [id('iteration-0'), [0, 1]],
      [id('iteration-1'), [2, 3]],
    ]);
    expect(calls.map((call) => call.samples)).toEqual(targetRun.iterations.map((iteration: any) => iteration.samples));
    expect(receipt.telemetryDerivationEvidence.derivedSampleCount).toBe(4);
  });
});

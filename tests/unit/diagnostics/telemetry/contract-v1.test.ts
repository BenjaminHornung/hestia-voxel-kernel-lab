import { describe, expect, it } from 'vitest';
import type {
  CapabilityAvailabilityV1,
  CanonicalIdV1,
  Sha256DigestV1,
} from '../../../../src/benchmark/contracts/browserV1';
import { canonicalizeJsonV1 } from '../../../../src/benchmark/contracts/browserV1';
import {
  BR02_BROWSER_METADATA_LIMITS_V1,
  Br02TelemetryExportV1,
  TELEMETRY_CONTRACT_ID,
  TELEMETRY_DETAIL_CODES_V1,
  TELEMETRY_SCHEMA_VERSION,
  TelemetryRecordDraftV1,
  chargeRecordV1,
  deriveTelemetryCapabilityIdsV1,
  isTelemetryExportV1,
  serializeSealedTelemetryExportV1,
  validateTelemetryExportV1,
} from '../../../../src/diagnostics/telemetry/contractV1';
import { createTelemetryBufferV1 as createBuffer } from '../../../../src/diagnostics/telemetry/bufferV1';

const id = (value: string): CanonicalIdV1 => value as CanonicalIdV1;
const digest = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Sha256DigestV1;
const BACKEND_FIXTURE_CAPABILITY_IDS_GOLDEN = [
  'performance-time-origin',
  'request-animation-frame',
  'webgl-disjoint-timer-query',
  'webgl2',
  'webgpu',
  'webgpu-timestamp-query',
] as const;

const baseCapabilityMetadata = BACKEND_FIXTURE_CAPABILITY_IDS_GOLDEN.map((capabilityId) => ({
  id: id(capabilityId),
  value: { status: 'declared' as const, value: true as const, sourceRef: id('plan'), stability: 'run-config' as const },
}));

const baseInput = {
  runId: id('run'),
  planId: id('plan'),
  scenarioId: id('backend-fixture-v1'),
  phase: 'measurement' as const,
  backend: 'three-webgl2' as const,
  telemetryMode: 'telemetry-enabled-minimal' as const,
  iterations: [{ iterationId: id('iteration-0'), iterationOrdinal: 0 }],
  realms: [{ realmId: id('main'), realm: 'main' as const, timeOriginEpochMs: 1000.25 }],
  capabilities: baseCapabilityMetadata,
};

function runTotalDraft(iterationId: CanonicalIdV1 | null = id('iteration-0')): TelemetryRecordDraftV1 {
  return {
    realmId: id('main'),
    startMs: 1002.375,
    kind: 'sample',
    name: 'run.total',
    iterationId: iterationId!,
    fields: { sampleKind: 'duration', sourceUnit: 'ms', value: 1.25, operationId: id('op'), spanId: id('span') },
  };
}

function makeExport(withRecord = true): Br02TelemetryExportV1 {
  const buffer = createBuffer(baseInput);
  if (withRecord) expect(buffer.append(runTotalDraft()).status).toBe('accepted');
  return buffer.seal();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe('BR02 telemetry contract v1', () => {
  it('pins the BR01-derived capability golden and shared metadata limits', () => {
    expect(deriveTelemetryCapabilityIdsV1({
      scenarioId: id('backend-fixture-v1'),
      phase: 'measurement',
      backend: 'three-webgl2',
    })).toEqual(BACKEND_FIXTURE_CAPABILITY_IDS_GOLDEN);
    expect(BR02_BROWSER_METADATA_LIMITS_V1).toEqual({ maxIterations: 256, maxRealms: 16, maxCapabilities: 64 });
  });

  it('exports the closed authoritative shape and directly differs from BR01 opaque exports', () => {
    const value = makeExport();
    expect(Object.keys(value)).toEqual([
      'schemaVersion', 'contractId', 'adapterContractId', 'adapterContractVersion', 'runId', 'planId', 'scenarioId',
      'phase', 'backend', 'telemetryMode', 'iterations', 'clock', 'limits', 'realms', 'capabilities', 'records', 'validity', 'loss', 'sealed',
    ]);
    expect(value.schemaVersion).toBe(TELEMETRY_SCHEMA_VERSION);
    expect(value.contractId).toBe(TELEMETRY_CONTRACT_ID);
    expect(value.adapterContractId).toBe('br02-telemetry-export-v1-to-benchmark-raw-sample-v1');
    expect(value.sealed).toBe(true);
    expect(isTelemetryExportV1(value)).toBe(true);
    expect(value.loss.observerDrops).toEqual([
      { entryType: 'event', status: 'not-active', droppedEntriesCount: null },
      { entryType: 'longtask', status: 'not-active', droppedEntriesCount: null },
    ]);
    expect(value).not.toHaveProperty('statistics');
    expect(value).not.toHaveProperty('percentiles');
    expect(value).not.toHaveProperty('eligibility');
  });

  it.each([
    ['wrong schema version', (value: any) => { value.schemaVersion = 2; }],
    ['wrong contract ID', (value: any) => { value.contractId = 'br01-opaque'; }],
    ['unknown top-level key', (value: any) => { value.extra = true; }],
    ['oversize external ID', (value: any) => { value.runId = 'a'.repeat(129); }],
    ['unknown iteration', (value: any) => { value.records[0].iterationId = 'iteration-unknown'; }],
    ['ingest gap', (value: any) => { value.records[0].ingestSequence = 1; }],
    ['realm sequence regression', (value: any) => { value.records[0].realmSequence = 1; }],
    ['non-finite timestamp', (value: any) => { value.records[0].startMs = Number.NaN; }],
    ['negative timestamp', (value: any) => { value.records[0].startMs = -1; }],
    ['accessor', (value: any) => { Object.defineProperty(value, 'runId', { enumerable: true, get: () => 'run' }); }],
    ['foreign prototype', (value: any) => { Object.setPrototypeOf(value, new Map()); }],
  ])('fails closed for %s', (_label, mutate) => {
    const value = clone(makeExport());
    mutate(value);
    expect(validateTelemetryExportV1(value).valid).toBe(false);
  });

  it('requires contiguous iteration ordinals and accepts known non-target iteration IDs', () => {
    const input = { ...baseInput, iterations: [
      { iterationId: id('iteration-0'), iterationOrdinal: 0 },
      { iterationId: id('iteration-1'), iterationOrdinal: 1 },
    ] };
    const buffer = createBuffer(input);
    expect(buffer.append({ ...runTotalDraft(), iterationId: id('iteration-1') }).status).toBe('accepted');
    const value = buffer.seal();
    expect(validateTelemetryExportV1(value).valid).toBe(true);
    const invalid = clone(value) as any;
    invalid.iterations[1].iterationOrdinal = 3;
    expect(validateTelemetryExportV1(invalid).valid).toBe(false);
  });

  it('rejects sample iteration ordinal regressions in ingest order', () => {
    const input = { ...baseInput, iterations: [
      { iterationId: id('iteration-0'), iterationOrdinal: 0 },
      { iterationId: id('iteration-1'), iterationOrdinal: 1 },
    ] };
    const buffer = createBuffer(input);
    expect(buffer.append(runTotalDraft(id('iteration-0'))).status).toBe('accepted');
    expect(buffer.append(runTotalDraft(id('iteration-1'))).status).toBe('accepted');
    const value = clone(buffer.seal()) as any;
    value.records[0].iterationId = 'iteration-1';
    value.records[1].iterationId = 'iteration-0';
    expect(validateTelemetryExportV1(value).valid).toBe(false);
  });

  it('enforces each closed record variant and rejects privacy or unit substitutions', () => {
    const validSamples: TelemetryRecordDraftV1[] = [
      runTotalDraft(),
      { realmId: id('main'), startMs: 2, kind: 'sample', name: 'worker.mesh-cpu', iterationId: id('iteration-0'), fields: { sampleKind: 'duration', sourceUnit: 'ms', value: 2, operationId: id('op'), spanId: id('span'), dimensions: [{ key: 'chunk-key', value: id('chunk') }] } },
      { realmId: id('main'), startMs: 3, kind: 'sample', name: 'mesh.quads', iterationId: id('iteration-0'), fields: { sampleKind: 'counter', sourceUnit: 'count', value: 2, operationId: id('op') } },
      { realmId: id('main'), startMs: 4, kind: 'sample', name: 'mesh.output-bytes', iterationId: id('iteration-0'), fields: { sampleKind: 'memory', sourceUnit: 'byte', value: 2, operationId: id('op') } },
      { realmId: id('main'), startMs: 5, kind: 'sample', name: 'coverage.sha256-match', iterationId: id('iteration-0'), fields: { sampleKind: 'liveness', sourceUnit: 'count', value: 1, operationId: id('op'), dimensions: [{ key: 'actual-sha256', value: digest }, { key: 'expected-sha256', value: digest }] } },
      { realmId: id('main'), startMs: 6, kind: 'sample', name: 'browser.long-task', iterationId: id('iteration-0'), fields: { sampleKind: 'long-task', sourceUnit: 'ms', value: 2, operationId: id('op'), dimensions: [{ key: 'time-block-ordinal', value: 0 }] } },
      { realmId: id('main'), startMs: 6.5, kind: 'diagnostic', name: 'browser.event-timing', iterationId: id('iteration-0'), fields: { durationMs: 2, timeBlockOrdinal: 0 } },
      { realmId: id('main'), startMs: 7, kind: 'sample', name: 'draw-submit.cpu', iterationId: id('iteration-0'), fields: { sampleKind: 'duration', sourceUnit: 'ms', value: 2, operationId: id('op'), spanId: id('span') } },
      { realmId: id('main'), startMs: 8, kind: 'sample', name: 'browser.raf-interval', iterationId: id('iteration-0'), fields: { sampleKind: 'frame', sourceUnit: 'ms', value: 2, operationId: id('op'), dimensions: [{ key: 'time-block-ordinal', value: 0 }] } },
    ];
    const buffer = createBuffer({ ...baseInput, telemetryMode: 'telemetry-enabled-full' });
    for (const sample of validSamples) expect(buffer.append(sample).status).toBe('accepted');
    const exportValue = buffer.seal();
    expect(validateTelemetryExportV1(exportValue).valid).toBe(true);
    for (const record of exportValue.records) expect(canonicalizeJsonV1(record).byteLength).toBeLessThanOrEqual(chargeRecordV1(record));
    const invalid = clone(makeExport()) as any;
    invalid.records[0].fields = { ...invalid.records[0].fields, sourceUnit: 'bytes', target: '#secret' };
    expect(validateTelemetryExportV1(invalid).valid).toBe(false);
    const nullSample = createBuffer(baseInput).append(runTotalDraft(null));
    expect(nullSample.status).toBe('rejected');
  });

  it.each([
    ['browser.long-task', { realmId: id('main'), startMs: 2, kind: 'sample', name: 'browser.long-task', iterationId: id('iteration-0'), fields: { sampleKind: 'long-task', sourceUnit: 'ms', value: 2, operationId: id('op'), dimensions: [{ key: 'time-block-ordinal', value: 0 }] } }],
    ['browser.event-timing', { realmId: id('main'), startMs: 2, kind: 'diagnostic', name: 'browser.event-timing', iterationId: id('iteration-0'), fields: { durationMs: 2, timeBlockOrdinal: 0 } }],
  ] as const)('rejects %s records in minimal exports', (_label, draft) => {
    const buffer = createBuffer({ ...baseInput, telemetryMode: 'telemetry-enabled-full' });
    expect(buffer.append(draft).status).toBe('accepted');
    const value = clone(buffer.seal()) as any;
    value.telemetryMode = 'telemetry-enabled-minimal';
    expect(validateTelemetryExportV1(value).valid).toBe(false);
  });

  it('accepts every BR01 availability status without inventing a supported literal', () => {
    const unavailable = ['unknown', 'unsupported', 'not-requested', 'not-active', 'permission-denied', 'blocked', 'error'] as const;
    const values: CapabilityAvailabilityV1[] = [
      { status: 'observed', value: true, sourceRef: id('capture'), stability: 'stable' },
      { status: 'declared', value: true, sourceRef: id('plan'), stability: 'run-config' },
      ...unavailable.map((status) => ({ status, value: null, sourceRef: id('capture'), reasonCode: id('not-observed') })),
    ];
    for (const value of values) {
      const exportValue = makeExport(false);
      const candidate = clone(exportValue) as any;
      candidate.capabilities[0].value = value;
      expect(validateTelemetryExportV1(candidate).valid, statusOf(value)).toBe(true);
      expect(candidate.capabilities[0].value.status).not.toBe('supported');
    }
  });

  it('enforces shared metadata bounds at the direct export boundary', () => {
    const base = clone(makeExport(false)) as any;
    base.iterations = Array.from({ length: 256 }, (_, iterationOrdinal) => ({
      iterationId: `iteration-${iterationOrdinal}`,
      iterationOrdinal,
    }));
    expect(base.iterations).toHaveLength(256);
    expect(validateTelemetryExportV1(base).valid).toBe(true);
    base.iterations.push({ iterationId: 'iteration-256', iterationOrdinal: 256 });
    expect(base.iterations).toHaveLength(257);
    expect(validateTelemetryExportV1(base).valid).toBe(false);

    const emptyIterations = clone(makeExport(false)) as any;
    emptyIterations.iterations = [];
    expect(validateTelemetryExportV1(emptyIterations).valid).toBe(false);

    const sixteenRealms = clone(makeExport(false)) as any;
    sixteenRealms.realms = Array.from({ length: 16 }, (_, index) => ({
      realmId: `realm-${String(index).padStart(2, '0')}`,
      realm: 'main',
      timeOriginEpochMs: index,
    }));
    expect(sixteenRealms.realms).toHaveLength(16);
    expect(validateTelemetryExportV1(sixteenRealms).valid).toBe(true);
    sixteenRealms.realms.push({ realmId: 'realm-16', realm: 'main', timeOriginEpochMs: 16 });
    expect(sixteenRealms.realms).toHaveLength(17);
    expect(validateTelemetryExportV1(sixteenRealms).valid).toBe(false);

    const emptyRealms = clone(makeExport(false)) as any;
    emptyRealms.realms = [];
    expect(validateTelemetryExportV1(emptyRealms).valid).toBe(false);
  });

  it('accepts a real no-backend BR01 scenario only with not-applicable backend semantics', () => {
    const value = clone(makeExport(false)) as any;
    value.scenarioId = 'navigation-leak-v1';
    value.phase = 'leak';
    value.backend = 'not-applicable';
    value.capabilities = deriveTelemetryCapabilityIdsV1({
      scenarioId: id(value.scenarioId),
      phase: value.phase,
      backend: value.backend,
    }).map((capabilityId) => ({
      id: capabilityId,
      value: { status: 'declared', value: true, sourceRef: 'plan', stability: 'run-config' },
    }));
    expect(validateTelemetryExportV1(value).valid).toBe(true);
  });

  it.each([
    ['unknown scenario', (value: any) => { value.scenarioId = 'invented-scenario'; }],
    ['phase mismatch', (value: any) => { value.phase = 'stress'; }],
    ['raw WebGPU', (value: any) => { value.backend = 'raw-webgpu'; }],
    ['backend mismatch', (value: any) => { value.backend = 'not-applicable'; }],
  ] as const)('rejects direct export metadata mismatch: %s', (_label, mutate) => {
    const value = clone(makeExport(false)) as any;
    mutate(value);
    expect(validateTelemetryExportV1(value).valid).toBe(false);
    expect(isTelemetryExportV1(value)).toBe(false);
  });

  it.each(['constructor'] as const)('rejects the canonical prototype scenario name %s as scenario-invalid', (scenarioId) => {
    const value = clone(makeExport(false)) as any;
    value.scenarioId = scenarioId;
    const result = validateTelemetryExportV1(value);
    expect(result.valid).toBe(false);
    if (result.valid) throw new Error('Expected prototype scenario name to fail validation.');
    expect(result.issues[0]).toMatchObject({ path: '$.scenarioId', code: 'scenario-invalid' });
  });

  it.each([
    ['missing', (capabilities: any[]) => { capabilities.splice(0, 1); }],
    ['extra known', (capabilities: any[]) => { capabilities.push({ ...capabilities[0], id: 'long-tasks' }); }],
    ['foreign', (capabilities: any[]) => { capabilities[0].id = 'FOREIGN'; }],
    ['unknown canonical', (capabilities: any[]) => { capabilities[0].id = 'unknown-capability'; }],
    ['duplicate', (capabilities: any[]) => { capabilities[1].id = capabilities[0].id; }],
    ['wrong UTF-16 order', (capabilities: any[]) => { [capabilities[0], capabilities[1]] = [capabilities[1], capabilities[0]]; }],
    ['over limit', (capabilities: any[]) => {
      while (capabilities.length <= 64) {
        capabilities.push({ ...capabilities[0], id: `capability-${capabilities.length}` });
      }
      expect(capabilities).toHaveLength(65);
    }],
  ] as const)('requires the exact BR01-derived capability list: %s', (_label, mutate) => {
    const value = clone(makeExport(false)) as any;
    mutate(value.capabilities);
    expect(validateTelemetryExportV1(value).valid).toBe(false);
    expect(isTelemetryExportV1(value)).toBe(false);
  });

  it('projects fixed invalidation details to BR01 reasons and keeps them deduplicated', () => {
    const buffer = createBuffer(baseInput);
    const draft: TelemetryRecordDraftV1 = {
      realmId: id('main'), startMs: 0, kind: 'control', name: 'telemetry.invalidation', iterationId: null,
      fields: { source: 'webgl-context-loss', reasonCode: 'context-lost', detailCode: 'br02-webgl-context-loss' },
    };
    expect(buffer.append(draft).status).toBe('accepted');
    expect(buffer.append(draft).status).toBe('accepted');
    const value = buffer.seal();
    expect(value.validity).toEqual({ status: 'invalid', reasons: [{ code: 'context-lost', detail: 'br02-webgl-context-loss', phase: 'measurement' }] });
    expect(validateTelemetryExportV1(value).valid).toBe(true);
    expect(TELEMETRY_DETAIL_CODES_V1).toContain('br02-observer-drop-accounting-unavailable');
  });

  it('uses the UTF-16-smallest detail for a deduplicated BR01 reason key', () => {
    const buffer = createBuffer(baseInput);
    expect(buffer.append({
      realmId: id('main'), startMs: 0, kind: 'control', name: 'telemetry.invalidation', iterationId: null,
      fields: { source: 'export-invalid', reasonCode: 'sample-invalid', detailCode: 'br02-record-invalid' },
    }).status).toBe('accepted');
    expect(buffer.append({
      realmId: id('main'), startMs: 0, kind: 'control', name: 'telemetry.invalidation', iterationId: null,
      fields: { source: 'buffer-overflow', reasonCode: 'sample-invalid', detailCode: 'br02-buffer-overflow' },
    }).status).toBe('accepted');
    const value = buffer.seal();
    expect(value.validity.reasons).toEqual([{ code: 'sample-invalid', detail: 'br02-buffer-overflow', phase: 'measurement' }]);
    const largerDetail = clone(value) as any;
    largerDetail.validity = { status: 'invalid', reasons: [{ code: 'sample-invalid', detail: 'br02-record-invalid', phase: 'measurement' }] };
    expect(validateTelemetryExportV1(largerDetail).valid).toBe(false);
  });

  it.each([
    ['not-reported', { entryType: 'event', status: 'not-reported', droppedEntriesCount: null }, { code: 'infrastructure-failure', detail: 'br02-observer-drop-accounting-unavailable' }],
    ['positive', { entryType: 'event', status: 'reported', droppedEntriesCount: 1 }, { code: 'sample-invalid', detail: 'br02-observer-drop' }],
  ] as const)('requires mapped invalidity for observer loss: %s', (_label, drop, mappedReason) => {
    const value = clone(makeExport(false)) as any;
    value.loss.observerDrops[0] = drop;
    expect(validateTelemetryExportV1(value).valid).toBe(false);
    value.validity = { status: 'invalid', reasons: [{ ...mappedReason, phase: value.phase }] };
    expect(validateTelemetryExportV1(value).valid).toBe(true);
  });

  it.each([
    ['overflowed', (value: any) => { value.loss.overflowed = true; }, { code: 'sample-invalid', detail: 'br02-buffer-overflow', phase: 'measurement' }],
    ['control reserve flag', (value: any) => { value.loss.controlReserveExhausted = true; }, { code: 'sample-invalid', detail: 'br02-control-reserve-exhausted', phase: 'measurement' }],
    ['control reserve drops', (value: any) => { value.loss.controlRecordsDropped = 1; }, { code: 'sample-invalid', detail: 'br02-control-reserve-exhausted', phase: 'measurement' }],
    ['record drops without overflow', (value: any) => { value.loss.dataRecordsDropped = 1; }, { code: 'sample-invalid', detail: 'br02-record-invalid', phase: 'measurement' }],
    ['open spans at seal', (value: any) => { value.loss.openSpansAtSeal = 1; }, { code: 'sample-invalid', detail: 'br02-open-span-at-seal', phase: 'measurement' }],
    ['observer not-reported', (value: any) => { value.loss.observerDrops[0] = { entryType: 'event', status: 'not-reported', droppedEntriesCount: null }; }, { code: 'infrastructure-failure', detail: 'br02-observer-drop-accounting-unavailable', phase: 'measurement' }],
    ['observer positive drop', (value: any) => { value.loss.observerDrops[0] = { entryType: 'event', status: 'reported', droppedEntriesCount: 1 }; }, { code: 'sample-invalid', detail: 'br02-observer-drop', phase: 'measurement' }],
  ] as const)('requires the exact loss reason for %s even when validity is already invalid', (_label, mutate, mappedReason) => {
    const missing = clone(makeExport(false)) as any;
    mutate(missing);
    missing.validity = { status: 'invalid', reasons: [{ code: 'context-lost', detail: 'br02-webgl-context-loss', phase: 'measurement' }] };
    expect(validateTelemetryExportV1(missing).valid).toBe(false);

    const present = clone(makeExport(false)) as any;
    mutate(present);
    present.validity = {
      status: 'invalid',
      reasons: [mappedReason],
    };
    expect(validateTelemetryExportV1(present).valid).toBe(true);
  });

  it('rejects a fabricated buffer-overflow reason without loss or an invalidation record', () => {
    const value = clone(makeExport(false)) as any;
    value.validity = { status: 'invalid', reasons: [{ code: 'sample-invalid', detail: 'br02-buffer-overflow', phase: value.phase }] };
    expect(validateTelemetryExportV1(value).valid).toBe(false);
  });

  it('rejects an accepted invalidation record with valid status', () => {
    const buffer = createBuffer(baseInput);
    expect(buffer.append({
      realmId: id('main'), startMs: 0, kind: 'control', name: 'telemetry.invalidation', iterationId: null,
      fields: { source: 'clock-anomaly', reasonCode: 'clock-invalid', detailCode: 'br02-clock-invalid' },
    }).status).toBe('accepted');
    const value = clone(buffer.seal()) as any;
    expect(value.records).toHaveLength(1);
    expect(value.records[0]).toMatchObject({ kind: 'control', name: 'telemetry.invalidation' });
    value.validity = { status: 'valid', reasons: [] };
    expect(validateTelemetryExportV1(value).valid).toBe(false);
  });

  it('rejects an invalid reason without its accepted invalidation record', () => {
    const value = clone(makeExport(false)) as any;
    value.validity = { status: 'invalid', reasons: [{ code: 'clock-invalid', detail: 'br02-clock-invalid', phase: value.phase }] };
    expect(validateTelemetryExportV1(value).valid).toBe(false);
  });

  it('rejects a loss reason mismatch even when the export is already invalid', () => {
    const value = clone(makeExport(false)) as any;
    value.loss.overflowed = true;
    value.validity = { status: 'invalid', reasons: [{ code: 'sample-invalid', detail: 'br02-record-invalid', phase: value.phase }] };
    expect(validateTelemetryExportV1(value).valid).toBe(false);
  });

  it('rejects valid status when a loss indicator is present', () => {
    const value = clone(makeExport(false)) as any;
    value.loss.overflowed = true;
    expect(validateTelemetryExportV1(value).valid).toBe(false);
  });

  it('canonicalizes independent property orders to identical bytes', () => {
    const value = makeExport();
    const reversed = Object.fromEntries(Object.entries(value).reverse()) as Br02TelemetryExportV1;
    expect(serializeSealedTelemetryExportV1(value)).toEqual(serializeSealedTelemetryExportV1(reversed));
  });
});

function statusOf(value: CapabilityAvailabilityV1): string {
  return value.status;
}

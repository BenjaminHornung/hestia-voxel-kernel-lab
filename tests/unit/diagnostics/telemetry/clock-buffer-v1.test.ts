import { describe, expect, it, vi } from 'vitest';
import type { CanonicalIdV1 } from '../../../../src/benchmark/contracts/browserV1';
import { canonicalizeJsonV1 } from '../../../../src/benchmark/contracts/browserV1';
import {
  TELEMETRY_LIMITS_V1,
  TelemetryRecordDraftV1,
  TelemetryRecordV1,
} from '../../../../src/diagnostics/telemetry/contractV1';
import { createMonotonicClockV1 } from '../../../../src/diagnostics/telemetry/clockV1';
import { createTelemetryBufferV1 } from '../../../../src/diagnostics/telemetry/bufferV1';

const id = (value: string): CanonicalIdV1 => value as CanonicalIdV1;
const BACKEND_FIXTURE_CAPABILITY_IDS_GOLDEN = [
  'performance-time-origin',
  'request-animation-frame',
  'webgl-disjoint-timer-query',
  'webgl2',
  'webgpu',
  'webgpu-timestamp-query',
] as const;

const capabilities = BACKEND_FIXTURE_CAPABILITY_IDS_GOLDEN.map((capabilityId) => ({
  id: id(capabilityId),
  value: { status: 'declared' as const, value: true as const, sourceRef: id('plan'), stability: 'run-config' as const },
}));

const input = {
  runId: id('run'),
  planId: id('plan'),
  scenarioId: id('backend-fixture-v1'),
  phase: 'measurement' as const,
  backend: 'three-webgl2' as const,
  telemetryMode: 'telemetry-enabled-minimal' as const,
  iterations: [{ iterationId: id('iteration-0'), iterationOrdinal: 0 }],
  realms: [
    { realmId: id('main'), realm: 'main' as const, timeOriginEpochMs: 1000 },
    { realmId: id('worker'), realm: 'worker' as const, timeOriginEpochMs: 2000 },
  ],
  capabilities,
};

function counterDraft(startMs = 1, realmId: CanonicalIdV1 = id('main')): TelemetryRecordDraftV1 {
  return {
    realmId,
    startMs,
    kind: 'sample',
    name: 'mesh.quads',
    iterationId: id('iteration-0'),
    fields: { sampleKind: 'counter', sourceUnit: 'count', value: 1, operationId: id('o') },
  };
}

function shortestContextDraft(realmId: CanonicalIdV1 = id('m')): TelemetryRecordDraftV1 {
  return {
    realmId,
    startMs: 0,
    kind: 'context',
    name: 'document.focus',
    iterationId: null,
    fields: { value: 'focused' },
  };
}

function controlDraft(detailCode: 'br02-clock-invalid' | 'br02-document-hidden' = 'br02-clock-invalid'): TelemetryRecordDraftV1 {
  const source = detailCode === 'br02-clock-invalid' ? 'clock-anomaly' : 'document-hidden';
  const reasonCode = detailCode === 'br02-clock-invalid' ? 'clock-invalid' : 'document-hidden';
  return {
    realmId: id('main'), startMs: 0, kind: 'control', name: 'telemetry.invalidation', iterationId: null,
    fields: { source, reasonCode, detailCode },
  };
}

describe('BR02 monotonic clock v1', () => {
  it('uses one now read per marker and preserves exact origin plus now', () => {
    let now = 2.125;
    let nowReads = 0;
    const performanceLike = { timeOrigin: 1000.25, now: () => { nowReads += 1; return now; } };
    const clock = createMonotonicClockV1(id('main'), performanceLike);
    expect(clock.registerRealm()).toEqual({ realmId: 'main', timeOriginMs: 1000.25 });
    expect(clock.marker()).toEqual({ realmId: 'main', timeOriginMs: 1000.25, nowMs: 2.125, absoluteMonotonicMs: 1002.375 });
    now = 2.125;
    expect(clock.marker().absoluteMonotonicMs).toBe(1002.375);
    expect(nowReads).toBe(2);
    expect(clock.hasAnomaly()).toBe(false);
  });

  it('fails closed for negative, non-finite, regressive, and changed-origin values without clamping', () => {
    let now = 2;
    let origin = 1000;
    const performanceLike = { get timeOrigin() { return origin; }, now: () => now };
    const clock = createMonotonicClockV1(id('main'), performanceLike);
    expect(clock.marker().absoluteMonotonicMs).toBe(1002);
    now = 1;
    expect(() => clock.marker()).toThrow();
    expect(clock.hasAnomaly()).toBe(true);

    const negativeSource = createMonotonicClockV1(id('worker'), { timeOrigin: 1, now: () => 1 });
    expect(() => negativeSource.sourceTimestamp(-0.001)).toThrow();
    expect(() => negativeSource.sourceTimestamp(Number.NaN)).toThrow();

    origin = 1001;
    expect(() => clock.registerRealm()).toThrow();
  });

  it('keeps equal manual markers valid and rejects a non-finite now', () => {
    let now = 0;
    const clock = createMonotonicClockV1(id('main'), { timeOrigin: 1, now: () => now });
    expect(clock.marker().absoluteMonotonicMs).toBe(1);
    expect(clock.marker().absoluteMonotonicMs).toBe(1);
    const invalid = createMonotonicClockV1(id('main'), { timeOrigin: 1, now: () => Number.POSITIVE_INFINITY });
    expect(() => invalid.marker()).toThrow();
    expect(invalid.anomalyDetail()).toBe('br02-clock-invalid');
  });
});

describe('BR02 bounded append-only buffer v1', () => {
  it('enforces shared iteration, realm, and capability bounds during construction', () => {
    const iterations = Array.from({ length: 256 }, (_, iterationOrdinal) => ({
      iterationId: id(`iteration-${iterationOrdinal}`),
      iterationOrdinal,
    }));
    expect(() => createTelemetryBufferV1({ ...input, iterations })).not.toThrow();
    expect(() => createTelemetryBufferV1({
      ...input,
      iterations: [...iterations, { iterationId: id('iteration-256'), iterationOrdinal: 256 }],
    })).toThrow();
    expect(() => createTelemetryBufferV1({ ...input, iterations: [] })).toThrow();

    const realms = Array.from({ length: 16 }, (_, index) => ({
      realmId: id(`realm-${String(index).padStart(2, '0')}`),
      realm: 'main' as const,
      timeOriginEpochMs: index,
    }));
    expect(() => createTelemetryBufferV1({ ...input, realms })).not.toThrow();
    expect(() => createTelemetryBufferV1({ ...input, realms: [...realms, { realmId: id('realm-16'), realm: 'main', timeOriginEpochMs: 16 }] })).toThrow();
    expect(() => createTelemetryBufferV1({ ...input, realms: [] })).toThrow();

    const tooManyCapabilities = Array.from({ length: 65 }, (_, index) => ({
      id: id(`capability-${index}`),
      value: { status: 'declared' as const, value: true as const, sourceRef: id('plan'), stability: 'run-config' as const },
    }));
    expect(() => createTelemetryBufferV1({ ...input, capabilities: tooManyCapabilities })).toThrow();
  });

  it('assigns deterministic IDs and independent per-realm sequences in acceptance order', () => {
    const buffer = createTelemetryBufferV1(input);
    const first = buffer.append(counterDraft(10, id('main')));
    const second = buffer.append(counterDraft(2, id('worker')));
    const third = buffer.append(counterDraft(3, id('main')));
    expect(first.status).toBe('accepted'); expect(second.status).toBe('accepted'); expect(third.status).toBe('accepted');
    const value = buffer.seal();
    expect(value.records.map((record) => [record.recordId, record.ingestSequence, record.realmSequence, record.startMs])).toEqual([
      ['br02-record-00000000', 0, 0, 10], ['br02-record-00000001', 1, 0, 2], ['br02-record-00000002', 2, 1, 3],
    ]);
  });

  it('keeps 255, 256, and 257 accepted records ordered across segments', () => {
    const buffer = createTelemetryBufferV1(input);
    for (let index = 0; index < 257; index += 1) expect(buffer.append(counterDraft(index + 1)).status).toBe('accepted');
    const records = buffer.seal().records;
    expect(records).toHaveLength(257);
    expect(records[255]!.recordId).toBe('br02-record-00000255');
    expect(records[256]!.recordId).toBe('br02-record-00000256');
  });

  it('accepts the shortest 65536-record charge/export boundary and drops the next record', { timeout: 30_000 }, () => {
    const shortestInput = { ...input, realms: [{ realmId: id('m'), realm: 'main' as const, timeOriginEpochMs: 1 }] };
    const buffer = createTelemetryBufferV1(shortestInput);
    let last: { status: string; record?: TelemetryRecordV1; chargedBytes?: number } = { status: 'rejected' };
    for (let index = 0; index < TELEMETRY_LIMITS_V1.maxDataRecords; index += 1) {
      last = buffer.append(shortestContextDraft());
      expect(last.status, `record ${index}`).toBe('accepted');
    }
    if (last.status === 'accepted') {
      expect(canonicalizeJsonV1(last.record!).byteLength).toBe(227);
      expect(last.chargedBytes!).toBe(227);
      expect(canonicalizeJsonV1(last.record!).byteLength).toBeLessThanOrEqual(last.chargedBytes!);
      expect(last.chargedBytes!).toBeLessThanOrEqual(256);
    }
    const countOverflow = buffer.append(shortestContextDraft());
    expect(countOverflow.status).toBe('rejected');
    if (countOverflow.status === 'rejected') expect(countOverflow.reason).toBe('overflow');
    const value = buffer.seal();
    expect(value.loss.dataRecordCount).toBe(65_536);
    expect(value.loss.dataRecordsDropped).toBe(1);
    expect(value.loss.overflowed).toBe(true);
    expect(value.loss.controlRecordCount).toBe(1);
    expect(buffer.serialize().byteLength).toBeLessThanOrEqual(TELEMETRY_LIMITS_V1.maxCanonicalExportBytes);
  });

  it('uses conservative record charge without serialization in append', () => {
    const buffer = createTelemetryBufferV1(input);
    const result = buffer.append(counterDraft());
    expect(result.status).toBe('accepted');
    if (result.status === 'accepted') {
      expect(canonicalizeJsonV1(result.record).byteLength).toBeLessThanOrEqual(result.chargedBytes);
    }
  });

  it('keeps observer-drop accounting explicit and sorted', () => {
    const buffer = createTelemetryBufferV1(input);
    expect(buffer.setObserverDrop('longtask', 'reported', 3)).toBe(true);
    expect(buffer.setObserverDrop('event', 'not-active')).toBe(true);
    const value = buffer.seal();
    expect(value.loss.observerDrops).toEqual([
      { entryType: 'event', status: 'not-active', droppedEntriesCount: null },
      { entryType: 'longtask', status: 'reported', droppedEntriesCount: 3 },
    ]);
    expect(value.validity.status).toBe('invalid');
  });

  it('emits one observer invalidation per entry/detail while retaining latest loss state', () => {
    const buffer = createTelemetryBufferV1(input);
    expect(buffer.setObserverDrop('event', 'not-reported')).toBe(true);
    expect(buffer.setObserverDrop('event', 'not-reported')).toBe(true);
    expect(buffer.setObserverDrop('event', 'reported', 1)).toBe(true);
    expect(buffer.setObserverDrop('event', 'reported', 2)).toBe(true);
    expect(buffer.setObserverDrop('longtask', 'reported', 3)).toBe(true);
    expect(buffer.setObserverDrop('longtask', 'reported', 4)).toBe(true);

    const value = buffer.seal();
    const controls = value.records.filter((record) => record.kind === 'control');
    expect(controls.map((record) => record.fields.detailCode)).toEqual([
      'br02-observer-drop-accounting-unavailable',
      'br02-observer-drop',
      'br02-observer-drop',
    ]);
    expect(value.loss.controlRecordCount).toBe(3);
    expect(value.loss.controlRecordsDropped).toBe(0);
    expect(value.loss.observerDrops).toEqual([
      { entryType: 'event', status: 'reported', droppedEntriesCount: 2 },
      { entryType: 'longtask', status: 'reported', droppedEntriesCount: 4 },
    ]);
    expect(value.validity).toEqual({
      status: 'invalid',
      reasons: [
        { code: 'infrastructure-failure', detail: 'br02-observer-drop-accounting-unavailable', phase: 'measurement' },
        { code: 'sample-invalid', detail: 'br02-observer-drop', phase: 'measurement' },
      ],
    });
  });

  it('emits one overflow control and exposes later drops and reserve exhaustion', () => {
    const full = createTelemetryBufferV1({ ...input, realms: [{ realmId: id('m'), realm: 'main' as const, timeOriginEpochMs: 1 }] });
    for (let index = 0; index < TELEMETRY_LIMITS_V1.maxDataRecords; index += 1) full.append(shortestContextDraft());
    expect(full.append(shortestContextDraft()).status).toBe('rejected');
    expect(full.append(shortestContextDraft()).status).toBe('rejected');
    const overflow = full.seal();
    expect(overflow.records.filter((record) => record.kind === 'control')).toHaveLength(1);
    expect(overflow.loss.dataRecordsDropped).toBe(2);

    const reserve = createTelemetryBufferV1(input);
    for (let index = 0; index < TELEMETRY_LIMITS_V1.controlReserveRecords; index += 1) expect(reserve.append(controlDraft()).status).toBe('accepted');
    const rejected = reserve.append(controlDraft());
    expect(rejected.status).toBe('rejected');
    if (rejected.status === 'rejected') expect(rejected.reason).toBe('control-reserve-exhausted');
    expect(reserve.seal().loss.controlReserveExhausted).toBe(true);
  }, 30_000);

  it('enforces open-span, seal, deep-freeze, and idempotent serialization behavior', () => {
    const buffer = createTelemetryBufferV1(input);
    for (let index = 0; index < TELEMETRY_LIMITS_V1.maxOpenSpans; index += 1) expect(buffer.openSpan(id(`span-${index}`))).toBe(true);
    expect(buffer.openSpan(id('span-over'))).toBe(false);
    const sealed = buffer.seal();
    expect(sealed.loss.openSpansAtSeal).toBe(TELEMETRY_LIMITS_V1.maxOpenSpans);
    expect(sealed.loss.overflowed).toBe(false);
    expect(Object.isFrozen(sealed)).toBe(true);
    expect(Object.isFrozen(sealed.records)).toBe(true);
    expect(Object.isFrozen(sealed.records[0])).toBe(true);
    const rejected = buffer.append(counterDraft());
    expect(rejected.status).toBe('rejected');
    if (rejected.status === 'rejected') expect(rejected.reason).toBe('sealed');
    const first = buffer.serialize();
    const second = buffer.serialize();
    expect(first).toEqual(second);
    expect(buffer.seal()).toBe(sealed);
  });

  it('does not serialize during append, but serializes after seal', () => {
    const stringify = vi.spyOn(JSON, 'stringify');
    const encode = vi.spyOn(TextEncoder.prototype, 'encode');
    const buffer = createTelemetryBufferV1(input);
    buffer.append(counterDraft());
    buffer.seal();
    expect(stringify).not.toHaveBeenCalled();
    expect(encode).not.toHaveBeenCalled();
    buffer.serialize();
    expect(encode).toHaveBeenCalled();
    stringify.mockRestore();
    encode.mockRestore();
  });
});

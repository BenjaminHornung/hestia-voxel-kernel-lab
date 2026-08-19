import {
  BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_ID_V1,
  BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_VERSION_V1,
  canonicalizeJsonV1,
  compareUtf16,
} from '../../benchmark/contracts/browserV1';
import type {
  BenchmarkBackendCellV1,
  BenchmarkInvalidReason,
  BenchmarkInvalidReasonV1,
  BenchmarkSamplePhaseV1,
  CapabilityAvailabilityV1,
  CanonicalIdV1,
  Sha256DigestV1,
} from '../../benchmark/contracts/browserV1';

export const TELEMETRY_SCHEMA_VERSION = 1 as const;
export const TELEMETRY_CONTRACT_ID = 'br-02-in-browser-telemetry-v1' as const;
export const TELEMETRY_CLOCK_CONTRACT_ID = 'br02-performance-time-origin-clock-v1' as const;

export const TELEMETRY_LIMITS_V1 = Object.freeze({
  segmentCapacityRecords: 256,
  maxDataRecords: 65_536,
  maxDataChargeBytes: 16_777_216,
  maxCanonicalExportBytes: 17_825_792,
  controlReserveRecords: 16,
  controlReserveChargeBytes: 16_384,
  maxOpenSpans: 4_096,
  maxTagsPerRecord: 12,
  maxSafeStringCodeUnits: 80,
} as const);

export type TelemetryModeV1 = 'telemetry-enabled-minimal' | 'telemetry-enabled-full';
export type TelemetryRealmKindV1 = 'main' | 'worker' | 'gpu' | 'browser';
export type TelemetryRecordKindV1 = 'sample' | 'context' | 'diagnostic' | 'control';
export type TelemetrySampleNameV1 =
  | 'run.total'
  | 'worker.mesh-cpu'
  | 'mesh.quads'
  | 'mesh.output-bytes'
  | 'coverage.sha256-match'
  | 'browser.long-task'
  | 'draw-submit.cpu'
  | 'browser.raf-interval';
export type TelemetryNonSampleNameV1 =
  | 'document.visibility'
  | 'document.focus'
  | 'browser.event-timing'
  | 'telemetry.invalidation';
export type TelemetryRecordNameV1 = TelemetrySampleNameV1 | TelemetryNonSampleNameV1;

export type TelemetryInvalidationSourceV1 =
  | 'buffer-overflow'
  | 'control-reserve-exhausted'
  | 'observer-drop'
  | 'observer-drop-accounting-unavailable'
  | 'clock-anomaly'
  | 'open-span-at-seal'
  | 'webgl-context-loss'
  | 'webgpu-device-loss'
  | 'document-hidden'
  | 'document-unfocused'
  | 'export-invalid';

export const TELEMETRY_DETAIL_CODES_V1 = [
  'br02-buffer-overflow',
  'br02-capability-not-observed',
  'br02-clock-invalid',
  'br02-context-invalid',
  'br02-control-reserve-exhausted',
  'br02-document-hidden',
  'br02-document-unfocused',
  'br02-export-invalid',
  'br02-iteration-invalid',
  'br02-metric-not-reachable',
  'br02-observer-drop',
  'br02-observer-drop-accounting-unavailable',
  'br02-open-span-at-seal',
  'br02-record-invalid',
  'br02-registry-invalid',
  'br02-webgl-context-loss',
  'br02-webgpu-device-loss',
] as const;
export type TelemetryDetailCodeV1 = (typeof TELEMETRY_DETAIL_CODES_V1)[number];

export const TELEMETRY_REASON_BY_DETAIL_V1: Readonly<Record<TelemetryDetailCodeV1, BenchmarkInvalidReason>> = Object.freeze({
  'br02-buffer-overflow': 'sample-invalid',
  'br02-capability-not-observed': 'required-capability-missing',
  'br02-clock-invalid': 'clock-invalid',
  'br02-context-invalid': 'sample-invalid',
  'br02-control-reserve-exhausted': 'sample-invalid',
  'br02-document-hidden': 'document-hidden',
  'br02-document-unfocused': 'document-unfocused',
  'br02-export-invalid': 'sample-invalid',
  'br02-iteration-invalid': 'sample-invalid',
  'br02-metric-not-reachable': 'metric-not-producible',
  'br02-observer-drop': 'sample-invalid',
  'br02-observer-drop-accounting-unavailable': 'infrastructure-failure',
  'br02-open-span-at-seal': 'sample-invalid',
  'br02-record-invalid': 'sample-invalid',
  'br02-registry-invalid': 'sample-invalid',
  'br02-webgl-context-loss': 'context-lost',
  'br02-webgpu-device-loss': 'context-lost',
});

export interface TelemetryIterationV1 {
  readonly iterationId: CanonicalIdV1;
  readonly iterationOrdinal: number;
}

export interface TelemetryClockBlockV1 {
  readonly contractId: typeof TELEMETRY_CLOCK_CONTRACT_ID;
  readonly clockAnomalyToleranceMs: 4;
}

export interface TelemetryLimitsV1 {
  readonly segmentCapacityRecords: 256;
  readonly maxDataRecords: 65_536;
  readonly maxDataChargeBytes: 16_777_216;
  readonly maxCanonicalExportBytes: 17_825_792;
  readonly controlReserveRecords: 16;
  readonly controlReserveChargeBytes: 16_384;
  readonly maxOpenSpans: 4_096;
  readonly maxTagsPerRecord: 12;
  readonly maxSafeStringCodeUnits: 80;
}

export interface TelemetryRealmV1 {
  readonly realmId: CanonicalIdV1;
  readonly realm: TelemetryRealmKindV1;
  readonly timeOriginEpochMs: number;
}

export interface TelemetryCapabilityV1 {
  readonly id: CanonicalIdV1;
  readonly value: CapabilityAvailabilityV1;
}

export interface TelemetryDimensionChunkKeyV1 {
  readonly key: 'chunk-key';
  readonly value: CanonicalIdV1;
}
export interface TelemetryDimensionTimeBlockV1 {
  readonly key: 'time-block-ordinal';
  readonly value: number;
}
export interface TelemetryDimensionSha256V1 {
  readonly key: 'actual-sha256' | 'expected-sha256';
  readonly value: Sha256DigestV1;
}
export type TelemetryDimensionV1 =
  | TelemetryDimensionChunkKeyV1
  | TelemetryDimensionTimeBlockV1
  | TelemetryDimensionSha256V1;

export interface TelemetryRunTotalFieldsV1 {
  readonly sampleKind: 'duration';
  readonly sourceUnit: 'ms';
  readonly value: number;
  readonly operationId: CanonicalIdV1;
  readonly spanId: CanonicalIdV1;
}
export interface TelemetryWorkerMeshCpuFieldsV1 {
  readonly sampleKind: 'duration';
  readonly sourceUnit: 'ms';
  readonly value: number;
  readonly operationId: CanonicalIdV1;
  readonly spanId: CanonicalIdV1;
  readonly dimensions: readonly [TelemetryDimensionChunkKeyV1];
}
export interface TelemetryMeshQuadsFieldsV1 {
  readonly sampleKind: 'counter';
  readonly sourceUnit: 'count';
  readonly value: number;
  readonly operationId: CanonicalIdV1;
}
export interface TelemetryMeshOutputBytesFieldsV1 {
  readonly sampleKind: 'memory';
  readonly sourceUnit: 'byte';
  readonly value: number;
  readonly operationId: CanonicalIdV1;
}
export interface TelemetryCoverageFieldsV1 {
  readonly sampleKind: 'liveness';
  readonly sourceUnit: 'count';
  readonly value: 1;
  readonly operationId: CanonicalIdV1;
  readonly dimensions: readonly [TelemetryDimensionSha256V1, TelemetryDimensionSha256V1];
}
export interface TelemetryLongTaskFieldsV1 {
  readonly sampleKind: 'long-task';
  readonly sourceUnit: 'ms';
  readonly value: number;
  readonly operationId: CanonicalIdV1;
  readonly dimensions: readonly [TelemetryDimensionTimeBlockV1];
}
export interface TelemetryDrawSubmitFieldsV1 {
  readonly sampleKind: 'duration';
  readonly sourceUnit: 'ms';
  readonly value: number;
  readonly operationId: CanonicalIdV1;
  readonly spanId: CanonicalIdV1;
}
export interface TelemetryRafIntervalFieldsV1 {
  readonly sampleKind: 'frame';
  readonly sourceUnit: 'ms';
  readonly value: number;
  readonly operationId: CanonicalIdV1;
  readonly dimensions: readonly [TelemetryDimensionTimeBlockV1];
}

export type TelemetrySampleFieldsV1 =
  | TelemetryRunTotalFieldsV1
  | TelemetryWorkerMeshCpuFieldsV1
  | TelemetryMeshQuadsFieldsV1
  | TelemetryMeshOutputBytesFieldsV1
  | TelemetryCoverageFieldsV1
  | TelemetryLongTaskFieldsV1
  | TelemetryDrawSubmitFieldsV1
  | TelemetryRafIntervalFieldsV1;

export interface TelemetryVisibilityFieldsV1 { readonly value: 'visible' | 'hidden'; }
export interface TelemetryFocusFieldsV1 { readonly value: 'focused' | 'unfocused'; }
export interface TelemetryEventTimingFieldsV1 { readonly durationMs: number; readonly timeBlockOrdinal: number; }
export interface TelemetryInvalidationFieldsV1 {
  readonly source: TelemetryInvalidationSourceV1;
  readonly reasonCode: BenchmarkInvalidReason;
  readonly detailCode: TelemetryDetailCodeV1;
}
export type TelemetryNonSampleFieldsV1 = TelemetryVisibilityFieldsV1 | TelemetryFocusFieldsV1 | TelemetryEventTimingFieldsV1 | TelemetryInvalidationFieldsV1;
export type TelemetryFieldsV1 = TelemetrySampleFieldsV1 | TelemetryNonSampleFieldsV1;

interface TelemetryDraftBaseV1 { readonly realmId: CanonicalIdV1; readonly startMs: number; readonly iterationId: CanonicalIdV1 | null; }

export type TelemetryRecordDraftV1 =
  | (TelemetryDraftBaseV1 & { readonly kind: 'sample'; readonly name: 'run.total'; readonly iterationId: CanonicalIdV1; readonly fields: TelemetryRunTotalFieldsV1 })
  | (TelemetryDraftBaseV1 & { readonly kind: 'sample'; readonly name: 'worker.mesh-cpu'; readonly iterationId: CanonicalIdV1; readonly fields: TelemetryWorkerMeshCpuFieldsV1 })
  | (TelemetryDraftBaseV1 & { readonly kind: 'sample'; readonly name: 'mesh.quads'; readonly iterationId: CanonicalIdV1; readonly fields: TelemetryMeshQuadsFieldsV1 })
  | (TelemetryDraftBaseV1 & { readonly kind: 'sample'; readonly name: 'mesh.output-bytes'; readonly iterationId: CanonicalIdV1; readonly fields: TelemetryMeshOutputBytesFieldsV1 })
  | (TelemetryDraftBaseV1 & { readonly kind: 'sample'; readonly name: 'coverage.sha256-match'; readonly iterationId: CanonicalIdV1; readonly fields: TelemetryCoverageFieldsV1 })
  | (TelemetryDraftBaseV1 & { readonly kind: 'sample'; readonly name: 'browser.long-task'; readonly iterationId: CanonicalIdV1; readonly fields: TelemetryLongTaskFieldsV1 })
  | (TelemetryDraftBaseV1 & { readonly kind: 'sample'; readonly name: 'draw-submit.cpu'; readonly iterationId: CanonicalIdV1; readonly fields: TelemetryDrawSubmitFieldsV1 })
  | (TelemetryDraftBaseV1 & { readonly kind: 'sample'; readonly name: 'browser.raf-interval'; readonly iterationId: CanonicalIdV1; readonly fields: TelemetryRafIntervalFieldsV1 })
  | (TelemetryDraftBaseV1 & { readonly kind: 'context'; readonly name: 'document.visibility'; readonly fields: TelemetryVisibilityFieldsV1 })
  | (TelemetryDraftBaseV1 & { readonly kind: 'context'; readonly name: 'document.focus'; readonly fields: TelemetryFocusFieldsV1 })
  | (TelemetryDraftBaseV1 & { readonly kind: 'diagnostic'; readonly name: 'browser.event-timing'; readonly fields: TelemetryEventTimingFieldsV1 })
  | (TelemetryDraftBaseV1 & { readonly kind: 'control'; readonly name: 'telemetry.invalidation'; readonly fields: TelemetryInvalidationFieldsV1 });

interface TelemetryRecordBaseV1 extends TelemetryDraftBaseV1 {
  readonly schemaVersion: typeof TELEMETRY_SCHEMA_VERSION;
  readonly runId: CanonicalIdV1;
  readonly recordId: CanonicalIdV1;
  readonly realmSequence: number;
  readonly ingestSequence: number;
}

export type TelemetryRecordV1 =
  | (TelemetryRecordBaseV1 & { readonly kind: 'sample'; readonly name: 'run.total'; readonly iterationId: CanonicalIdV1; readonly fields: TelemetryRunTotalFieldsV1 })
  | (TelemetryRecordBaseV1 & { readonly kind: 'sample'; readonly name: 'worker.mesh-cpu'; readonly iterationId: CanonicalIdV1; readonly fields: TelemetryWorkerMeshCpuFieldsV1 })
  | (TelemetryRecordBaseV1 & { readonly kind: 'sample'; readonly name: 'mesh.quads'; readonly iterationId: CanonicalIdV1; readonly fields: TelemetryMeshQuadsFieldsV1 })
  | (TelemetryRecordBaseV1 & { readonly kind: 'sample'; readonly name: 'mesh.output-bytes'; readonly iterationId: CanonicalIdV1; readonly fields: TelemetryMeshOutputBytesFieldsV1 })
  | (TelemetryRecordBaseV1 & { readonly kind: 'sample'; readonly name: 'coverage.sha256-match'; readonly iterationId: CanonicalIdV1; readonly fields: TelemetryCoverageFieldsV1 })
  | (TelemetryRecordBaseV1 & { readonly kind: 'sample'; readonly name: 'browser.long-task'; readonly iterationId: CanonicalIdV1; readonly fields: TelemetryLongTaskFieldsV1 })
  | (TelemetryRecordBaseV1 & { readonly kind: 'sample'; readonly name: 'draw-submit.cpu'; readonly iterationId: CanonicalIdV1; readonly fields: TelemetryDrawSubmitFieldsV1 })
  | (TelemetryRecordBaseV1 & { readonly kind: 'sample'; readonly name: 'browser.raf-interval'; readonly iterationId: CanonicalIdV1; readonly fields: TelemetryRafIntervalFieldsV1 })
  | (TelemetryRecordBaseV1 & { readonly kind: 'context'; readonly name: 'document.visibility'; readonly fields: TelemetryVisibilityFieldsV1 })
  | (TelemetryRecordBaseV1 & { readonly kind: 'context'; readonly name: 'document.focus'; readonly fields: TelemetryFocusFieldsV1 })
  | (TelemetryRecordBaseV1 & { readonly kind: 'diagnostic'; readonly name: 'browser.event-timing'; readonly fields: TelemetryEventTimingFieldsV1 })
  | (TelemetryRecordBaseV1 & { readonly kind: 'control'; readonly name: 'telemetry.invalidation'; readonly fields: TelemetryInvalidationFieldsV1 });

export type TelemetryValidityV1 =
  | { readonly status: 'valid'; readonly reasons: readonly [] }
  | { readonly status: 'invalid'; readonly reasons: readonly BenchmarkInvalidReasonV1[] };

export type TelemetryObserverDropEntryTypeV1 = 'event' | 'longtask';
export type TelemetryObserverDropStatusV1 = 'not-active' | 'not-reported' | 'reported';
export interface TelemetryObserverDropV1 {
  readonly entryType: TelemetryObserverDropEntryTypeV1;
  readonly status: TelemetryObserverDropStatusV1;
  readonly droppedEntriesCount: number | null;
}

export interface TelemetryLossV1 {
  readonly dataRecordCount: number;
  readonly dataChargeBytes: number;
  readonly dataRecordsDropped: number;
  readonly controlRecordCount: number;
  readonly controlChargeBytes: number;
  readonly controlRecordsDropped: number;
  readonly overflowed: boolean;
  readonly controlReserveExhausted: boolean;
  readonly openSpansAtSeal: number;
  readonly observerDrops: readonly [TelemetryObserverDropV1, TelemetryObserverDropV1];
}

export interface Br02TelemetryExportV1 {
  readonly schemaVersion: typeof TELEMETRY_SCHEMA_VERSION;
  readonly contractId: typeof TELEMETRY_CONTRACT_ID;
  readonly adapterContractId: typeof BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_ID_V1;
  readonly adapterContractVersion: typeof BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_VERSION_V1;
  readonly runId: CanonicalIdV1;
  readonly planId: CanonicalIdV1;
  readonly scenarioId: CanonicalIdV1;
  readonly phase: BenchmarkSamplePhaseV1;
  readonly backend: BenchmarkBackendCellV1;
  readonly telemetryMode: TelemetryModeV1;
  readonly iterations: readonly TelemetryIterationV1[];
  readonly clock: TelemetryClockBlockV1;
  readonly limits: TelemetryLimitsV1;
  readonly realms: readonly TelemetryRealmV1[];
  readonly capabilities: readonly TelemetryCapabilityV1[];
  readonly records: readonly TelemetryRecordV1[];
  readonly validity: TelemetryValidityV1;
  readonly loss: TelemetryLossV1;
  readonly sealed: true;
}

export interface TelemetryValidationIssueV1 {
  readonly path: string;
  readonly code: string;
  readonly detail: string;
}

export type TelemetryValidationResultV1 =
  | { readonly valid: true; readonly value: Br02TelemetryExportV1; readonly issues: readonly [] }
  | { readonly valid: false; readonly issues: readonly [TelemetryValidationIssueV1, ...TelemetryValidationIssueV1[]] };

const BR01_REASON_CODES: readonly BenchmarkInvalidReason[] = [
  'source-dirty', 'source-sha-mismatch', 'source-tree-mismatch', 'build-digest-mismatch', 'fixture-contract-mismatch',
  'candidate-contract-mismatch', 'scenario-contract-mismatch', 'run-plan-mismatch', 'environment-incomplete',
  'browser-version-mismatch', 'required-capability-missing', 'document-hidden', 'document-unfocused', 'background-tabs-present',
  'power-state-mismatch', 'thermal-throttling', 'clock-invalid', 'sample-invalid', 'gpu-disjoint', 'context-lost',
  'console-error', 'page-error', 'request-failure', 'http-error', 'process-crash', 'operator-abort', 'metric-not-producible',
  'warmup-not-stable', 'infrastructure-failure',
];
const PHASES: readonly BenchmarkSamplePhaseV1[] = ['cold', 'warmup', 'measurement', 'stress', 'trace', 'leak'];
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const DETAIL_SET = new Set<string>(TELEMETRY_DETAIL_CODES_V1);
const REASON_SET = new Set<string>(BR01_REASON_CODES);

class ContractValidationError extends TypeError {
  public constructor(public readonly path: string, public readonly code: string, message: string) {
    super(message);
    this.name = 'TelemetryContractValidationError';
  }
}

type JsonObject = Record<string, unknown>;

function fail(path: string, code: string, message: string): never {
  throw new ContractValidationError(path, code, message);
}

function plainObject(value: unknown, path: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'object-invalid', 'Expected a plain object.');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(path, 'prototype-invalid', 'Foreign prototypes are not allowed.');
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') fail(path, 'symbol-key', 'Symbol keys are not allowed.');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined || !descriptor.enumerable) {
      fail(`${path}.${key}`, 'accessor-invalid', 'Accessor and non-enumerable properties are not allowed.');
    }
  }
  return value as JsonObject;
}

function plainArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail(path, 'array-invalid', 'Expected a plain array.');
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue;
    if (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length) {
      fail(`${path}.${String(key)}`, 'array-key-invalid', 'Array keys must be contiguous indices.');
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined || !descriptor.enumerable) {
      fail(`${path}[${key}]`, 'accessor-invalid', 'Accessor and non-enumerable properties are not allowed.');
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, String(index))) fail(`${path}[${index}]`, 'array-hole', 'Array holes are not allowed.');
  }
  return value;
}

function closed(value: unknown, keys: readonly string[], path: string): JsonObject {
  const object = plainObject(value, path);
  const expected = new Set(keys);
  for (const key of Reflect.ownKeys(object)) {
    if (typeof key !== 'string' || !expected.has(key)) fail(`${path}.${String(key)}`, 'unknown-key', 'Unknown property.');
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) fail(`${path}.${key}`, 'missing-key', 'Missing property.');
  }
  return object;
}

function stringValue(value: unknown, path: string, maximum: number = TELEMETRY_LIMITS_V1.maxSafeStringCodeUnits): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum) fail(path, 'string-invalid', 'String length is outside the contract.');
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdfff) fail(path, 'string-invalid', 'Unpaired or non-ASCII string data is not allowed.');
    if (code > 0x7f) fail(path, 'string-invalid', 'Only ASCII technical strings are allowed.');
  }
  return value;
}

function canonicalId(value: unknown, path: string): CanonicalIdV1 {
  const id = stringValue(value, path, 128);
  if (!ID_PATTERN.test(id)) fail(path, 'id-invalid', 'Identifier is not canonical.');
  return id as CanonicalIdV1;
}

function finiteNonNegative(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || Object.is(value, -0)) fail(path, 'number-invalid', 'Expected a finite non-negative number.');
  if (Number.isInteger(value) && !Number.isSafeInteger(value)) fail(path, 'number-invalid', 'Integral numbers must be safe integers.');
  return value;
}

function positiveFinite(value: unknown, path: string): number {
  const result = finiteNonNegative(value, path);
  if (result <= 0) fail(path, 'number-domain-invalid', 'Expected a positive number.');
  return result;
}

function safeNonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) fail(path, 'integer-invalid', 'Expected a non-negative safe integer.');
  return value;
}

function equal(value: unknown, expected: unknown, path: string): void {
  if (value !== expected) fail(path, 'literal-invalid', `Expected ${String(expected)}.`);
}

function oneOf(value: unknown, values: readonly unknown[], path: string): void {
  if (!values.includes(value)) fail(path, 'enum-invalid', 'Value is outside the contract enum.');
}

function validateDimensions(value: unknown, path: string, expectedKeys: readonly string[]): void {
  const dimensions = plainArray(value, path);
  if (dimensions.length !== expectedKeys.length) fail(path, 'dimension-count-invalid', 'Wrong dimension count.');
  for (let index = 0; index < dimensions.length; index += 1) {
    validateDimension(dimensions[index], `${path}[${index}]`, expectedKeys[index] as TelemetryDimensionV1['key']);
  }
}

function validateDimension(value: unknown, path: string, expectedKey: TelemetryDimensionV1['key']): TelemetryDimensionV1 {
  const dimension = closed(value, ['key', 'value'], path);
  equal(dimension.key, expectedKey, `${path}.key`);
  if (expectedKey === 'chunk-key') return { key: expectedKey, value: canonicalId(dimension.value, `${path}.value`) };
  if (expectedKey === 'time-block-ordinal') return { key: expectedKey, value: safeNonNegativeInteger(dimension.value, `${path}.value`) };
  const digest = stringValue(dimension.value, `${path}.value`, 71);
  const digestPrefix = ['sha', '256', ':'].join('');
  if (digest.slice(0, 7) !== digestPrefix || digest.length !== 71 || digest.slice(7).split('').some((character) => !'0123456789abcdef'.includes(character))) fail(`${path}.value`, 'digest-invalid', 'SHA-256 digest is not canonical.');
  return { key: expectedKey, value: digest as Sha256DigestV1 };
}

function validateSampleFields(name: TelemetrySampleNameV1, value: unknown, path: string): void {
  const fields = plainObject(value, path);
  if (name === 'run.total') {
    closed(fields, ['sampleKind', 'sourceUnit', 'value', 'operationId', 'spanId'], path);
    equal(fields.sampleKind, 'duration', `${path}.sampleKind`); equal(fields.sourceUnit, 'ms', `${path}.sourceUnit`);
    positiveFinite(fields.value, `${path}.value`); canonicalId(fields.operationId, `${path}.operationId`); canonicalId(fields.spanId, `${path}.spanId`);
    return;
  }
  if (name === 'worker.mesh-cpu') {
    closed(fields, ['sampleKind', 'sourceUnit', 'value', 'operationId', 'spanId', 'dimensions'], path);
    equal(fields.sampleKind, 'duration', `${path}.sampleKind`); equal(fields.sourceUnit, 'ms', `${path}.sourceUnit`);
    positiveFinite(fields.value, `${path}.value`); canonicalId(fields.operationId, `${path}.operationId`); canonicalId(fields.spanId, `${path}.spanId`);
    validateDimensions(fields.dimensions, `${path}.dimensions`, ['chunk-key']);
    return;
  }
  if (name === 'mesh.quads') {
    closed(fields, ['sampleKind', 'sourceUnit', 'value', 'operationId'], path);
    equal(fields.sampleKind, 'counter', `${path}.sampleKind`); equal(fields.sourceUnit, 'count', `${path}.sourceUnit`);
    safeNonNegativeInteger(fields.value, `${path}.value`); canonicalId(fields.operationId, `${path}.operationId`);
    return;
  }
  if (name === 'mesh.output-bytes') {
    closed(fields, ['sampleKind', 'sourceUnit', 'value', 'operationId'], path);
    equal(fields.sampleKind, 'memory', `${path}.sampleKind`); equal(fields.sourceUnit, 'byte', `${path}.sourceUnit`);
    safeNonNegativeInteger(fields.value, `${path}.value`); canonicalId(fields.operationId, `${path}.operationId`);
    return;
  }
  if (name === 'coverage.sha256-match') {
    closed(fields, ['sampleKind', 'sourceUnit', 'value', 'operationId', 'dimensions'], path);
    equal(fields.sampleKind, 'liveness', `${path}.sampleKind`); equal(fields.sourceUnit, 'count', `${path}.sourceUnit`); equal(fields.value, 1, `${path}.value`);
    canonicalId(fields.operationId, `${path}.operationId`); validateDimensions(fields.dimensions, `${path}.dimensions`, ['actual-sha256', 'expected-sha256']);
    const dimensions = fields.dimensions as readonly JsonObject[];
    if (dimensions[0]!.value !== dimensions[1]!.value) fail(`${path}.dimensions`, 'digest-mismatch', 'Coverage digests must match.');
    return;
  }
  if (name === 'browser.long-task') {
    closed(fields, ['sampleKind', 'sourceUnit', 'value', 'operationId', 'dimensions'], path);
    equal(fields.sampleKind, 'long-task', `${path}.sampleKind`); equal(fields.sourceUnit, 'ms', `${path}.sourceUnit`); positiveFinite(fields.value, `${path}.value`);
    canonicalId(fields.operationId, `${path}.operationId`); validateDimensions(fields.dimensions, `${path}.dimensions`, ['time-block-ordinal']);
    return;
  }
  if (name === 'draw-submit.cpu') {
    closed(fields, ['sampleKind', 'sourceUnit', 'value', 'operationId', 'spanId'], path);
    equal(fields.sampleKind, 'duration', `${path}.sampleKind`); equal(fields.sourceUnit, 'ms', `${path}.sourceUnit`); positiveFinite(fields.value, `${path}.value`);
    canonicalId(fields.operationId, `${path}.operationId`); canonicalId(fields.spanId, `${path}.spanId`);
    return;
  }
  if (name === 'browser.raf-interval') {
    closed(fields, ['sampleKind', 'sourceUnit', 'value', 'operationId', 'dimensions'], path);
    equal(fields.sampleKind, 'frame', `${path}.sampleKind`); equal(fields.sourceUnit, 'ms', `${path}.sourceUnit`); positiveFinite(fields.value, `${path}.value`);
    canonicalId(fields.operationId, `${path}.operationId`); validateDimensions(fields.dimensions, `${path}.dimensions`, ['time-block-ordinal']);
    return;
  }
  fail(path, 'sample-name-invalid', 'Unknown sample name.');
}

function validateInvalidationFields(value: unknown, path: string): void {
  const fields = closed(value, ['source', 'reasonCode', 'detailCode'], path);
  oneOf(fields.source, ['buffer-overflow', 'control-reserve-exhausted', 'observer-drop', 'observer-drop-accounting-unavailable', 'clock-anomaly', 'open-span-at-seal', 'webgl-context-loss', 'webgpu-device-loss', 'document-hidden', 'document-unfocused', 'export-invalid'], `${path}.source`);
  if (typeof fields.reasonCode !== 'string' || !REASON_SET.has(fields.reasonCode)) fail(`${path}.reasonCode`, 'reason-code-invalid', 'Unknown BR01 reason code.');
  if (typeof fields.detailCode !== 'string' || !DETAIL_SET.has(fields.detailCode)) fail(`${path}.detailCode`, 'detail-code-invalid', 'Unknown BR02 detail code.');
  const detail = fields.detailCode as TelemetryDetailCodeV1;
  equal(fields.reasonCode, TELEMETRY_REASON_BY_DETAIL_V1[detail], `${path}.reasonCode`);
  const source = fields.source as TelemetryInvalidationSourceV1;
  const expectedSource = detail === 'br02-buffer-overflow' ? 'buffer-overflow'
    : detail === 'br02-control-reserve-exhausted' ? 'control-reserve-exhausted'
      : detail === 'br02-observer-drop' ? 'observer-drop'
        : detail === 'br02-observer-drop-accounting-unavailable' ? 'observer-drop-accounting-unavailable'
          : detail === 'br02-clock-invalid' ? 'clock-anomaly'
            : detail === 'br02-open-span-at-seal' ? 'open-span-at-seal'
              : detail === 'br02-webgl-context-loss' ? 'webgl-context-loss'
                : detail === 'br02-webgpu-device-loss' ? 'webgpu-device-loss'
                  : detail === 'br02-document-hidden' ? 'document-hidden'
                    : detail === 'br02-document-unfocused' ? 'document-unfocused'
                      : 'export-invalid';
  equal(source, expectedSource, `${path}.source`);
}

function validateRecordFields(kind: TelemetryRecordKindV1, name: TelemetryRecordNameV1, fields: unknown, path: string): void {
  if (kind === 'sample') { validateSampleFields(name as TelemetrySampleNameV1, fields, path); return; }
  if (name === 'document.visibility') { const value = closed(fields, ['value'], path).value; oneOf(value, ['visible', 'hidden'], `${path}.value`); return; }
  if (name === 'document.focus') { const value = closed(fields, ['value'], path).value; oneOf(value, ['focused', 'unfocused'], `${path}.value`); return; }
  if (name === 'browser.event-timing') {
    const object = closed(fields, ['durationMs', 'timeBlockOrdinal'], path);
    positiveFinite(object.durationMs, `${path}.durationMs`); safeNonNegativeInteger(object.timeBlockOrdinal, `${path}.timeBlockOrdinal`); return;
  }
  validateInvalidationFields(fields, path);
}

interface RecordValidationContextV1 {
  readonly runId: CanonicalIdV1;
  readonly realmIds: ReadonlySet<string>;
  readonly iterationIds: ReadonlySet<string>;
  readonly telemetryMode: TelemetryModeV1;
}

function validateRecord(value: unknown, path: string, context: RecordValidationContextV1, index: number, realmSequences: Map<string, number>): TelemetryRecordV1 {
  const record = closed(value, ['schemaVersion', 'runId', 'recordId', 'realmSequence', 'ingestSequence', 'realmId', 'startMs', 'kind', 'name', 'iterationId', 'fields'], path);
  equal(record.schemaVersion, TELEMETRY_SCHEMA_VERSION, `${path}.schemaVersion`); equal(record.runId, context.runId, `${path}.runId`);
  const ingestSequence = safeNonNegativeInteger(record.ingestSequence, `${path}.ingestSequence`); equal(ingestSequence, index, `${path}.ingestSequence`);
  equal(record.recordId, `br02-record-${String(index).padStart(8, '0')}`, `${path}.recordId`);
  const realmId = canonicalId(record.realmId, `${path}.realmId`);
  if (!context.realmIds.has(realmId)) fail(`${path}.realmId`, 'realm-reference-invalid', 'Record realm is not registered.');
  const expectedRealmSequence = realmSequences.get(realmId) ?? 0;
  const realmSequence = safeNonNegativeInteger(record.realmSequence, `${path}.realmSequence`); equal(realmSequence, expectedRealmSequence, `${path}.realmSequence`); realmSequences.set(realmId, expectedRealmSequence + 1);
  finiteNonNegative(record.startMs, `${path}.startMs`);
  const kind = record.kind; oneOf(kind, ['sample', 'context', 'diagnostic', 'control'], `${path}.kind`);
  const name = record.name; oneOf(name, ['run.total', 'worker.mesh-cpu', 'mesh.quads', 'mesh.output-bytes', 'coverage.sha256-match', 'browser.long-task', 'draw-submit.cpu', 'browser.raf-interval', 'document.visibility', 'document.focus', 'browser.event-timing', 'telemetry.invalidation'], `${path}.name`);
  const sample = ['run.total', 'worker.mesh-cpu', 'mesh.quads', 'mesh.output-bytes', 'coverage.sha256-match', 'browser.long-task', 'draw-submit.cpu', 'browser.raf-interval'].includes(name as string);
  if (record.iterationId === null) { if (sample) fail(`${path}.iterationId`, 'iteration-reference-invalid', 'Sample records need an iteration.'); }
  else if (!context.iterationIds.has(canonicalId(record.iterationId, `${path}.iterationId`))) fail(`${path}.iterationId`, 'iteration-reference-invalid', 'Record iteration is not registered.');
  const expectedKind = sample ? 'sample' : name === 'telemetry.invalidation' ? 'control' : name === 'browser.event-timing' ? 'diagnostic' : 'context';
  equal(kind, expectedKind, `${path}.kind`);
  if (context.telemetryMode === 'telemetry-enabled-minimal' && (name === 'browser.long-task' || name === 'browser.event-timing')) {
    fail(`${path}.name`, 'telemetry-mode-invalid', 'Full-only telemetry records are not allowed in minimal mode.');
  }
  validateRecordFields(kind as TelemetryRecordKindV1, name as TelemetryRecordNameV1, record.fields, `${path}.fields`);
  return record as unknown as TelemetryRecordV1;
}

function lossReasons(loss: JsonObject, phase: BenchmarkSamplePhaseV1): readonly BenchmarkInvalidReasonV1[] {
  const detailCodes = new Set<TelemetryDetailCodeV1>();
  if (loss.overflowed === true) detailCodes.add('br02-buffer-overflow');
  if (loss.controlReserveExhausted === true || (loss.controlRecordsDropped as number) > 0) {
    detailCodes.add('br02-control-reserve-exhausted');
  }
  if ((loss.dataRecordsDropped as number) > 0 && loss.overflowed !== true) detailCodes.add('br02-record-invalid');
  if ((loss.openSpansAtSeal as number) > 0) detailCodes.add('br02-open-span-at-seal');
  const drops = loss.observerDrops as readonly JsonObject[];
  for (const drop of drops) {
    if (drop.status === 'not-reported') detailCodes.add('br02-observer-drop-accounting-unavailable');
    else if (drop.status === 'reported' && typeof drop.droppedEntriesCount === 'number' && drop.droppedEntriesCount > 0) {
      detailCodes.add('br02-observer-drop');
    }
  }
  return [...detailCodes].map((detailCode) => reasonForDetailCodeV1(detailCode, phase));
}

function reconciledReasons(
  loss: JsonObject,
  records: readonly TelemetryRecordV1[],
  phase: BenchmarkSamplePhaseV1,
): readonly BenchmarkInvalidReasonV1[] {
  const reasonsByKey = new Map<string, BenchmarkInvalidReasonV1>();
  const remember = (candidate: BenchmarkInvalidReasonV1): void => {
    const key = `${candidate.code}:${candidate.phase}`;
    const current = reasonsByKey.get(key);
    if (current === undefined || compareUtf16(candidate.detail, current.detail) < 0) reasonsByKey.set(key, candidate);
  };
  for (const candidate of lossReasons(loss, phase)) remember(candidate);
  for (const record of records) {
    if (record.kind === 'control') remember(reasonForDetailCodeV1(record.fields.detailCode, phase));
  }
  return [...reasonsByKey.values()].sort(compareReasonsV1);
}

function validateValidityReconciliation(
  loss: JsonObject,
  records: readonly TelemetryRecordV1[],
  validity: JsonObject,
  phase: BenchmarkSamplePhaseV1,
): void {
  const expectedReasons = reconciledReasons(loss, records, phase);
  if (expectedReasons.length === 0) {
    if (validity.status !== 'valid') fail('$.validity', 'validity-reconciliation-mismatch', 'Invalid validity requires a loss indicator or accepted invalidation record.');
    return;
  }
  if (validity.status !== 'invalid') fail('$.validity', 'validity-reconciliation-mismatch', 'Loss indicators and invalidation records require invalid validity.');
  const actualReasons = validity.reasons as readonly JsonObject[];
  if (actualReasons.length !== expectedReasons.length || expectedReasons.some((expected, index) => {
    const actual = actualReasons[index];
    return actual?.code !== expected.code || actual.detail !== expected.detail || actual.phase !== expected.phase;
  })) {
    fail('$.validity.reasons', 'validity-reconciliation-mismatch', 'Validity reasons must exactly match loss indicators and accepted invalidation records.');
  }
}

function validateIterations(value: unknown, path: string): readonly TelemetryIterationV1[] {
  const entries = plainArray(value, path); if (entries.length === 0) fail(path, 'iteration-empty', 'At least one iteration is required.');
  const ids = new Set<string>();
  return entries.map((entry, index) => {
    const iteration = closed(entry, ['iterationId', 'iterationOrdinal'], `${path}[${index}]`);
    const id = canonicalId(iteration.iterationId, `${path}[${index}].iterationId`); const ordinal = safeNonNegativeInteger(iteration.iterationOrdinal, `${path}[${index}].iterationOrdinal`);
    if (ordinal !== index || ids.has(id)) fail(`${path}[${index}]`, 'iteration-order-invalid', 'Iterations must be unique and contiguous.');
    ids.add(id); return { iterationId: id, iterationOrdinal: ordinal };
  });
}

function validateRealms(value: unknown, path: string): readonly TelemetryRealmV1[] {
  const entries = plainArray(value, path); let previous = ''; const ids = new Set<string>();
  return entries.map((entry, index) => {
    const realm = closed(entry, ['realmId', 'realm', 'timeOriginEpochMs'], `${path}[${index}]`); const id = canonicalId(realm.realmId, `${path}[${index}].realmId`);
    if (ids.has(id) || (previous !== '' && compareUtf16(previous, id) >= 0)) fail(`${path}[${index}].realmId`, 'realm-order-invalid', 'Realms must be sorted and unique.');
    previous = id; ids.add(id); oneOf(realm.realm, ['main', 'worker', 'gpu', 'browser'], `${path}[${index}].realm`);
    return { realmId: id, realm: realm.realm as TelemetryRealmKindV1, timeOriginEpochMs: finiteNonNegative(realm.timeOriginEpochMs, `${path}[${index}].timeOriginEpochMs`) };
  });
}

function validateCapabilities(value: unknown, path: string): readonly TelemetryCapabilityV1[] {
  const entries = plainArray(value, path); let previous = ''; const ids = new Set<string>();
  return entries.map((entry, index) => {
    const capability = closed(entry, ['id', 'value'], `${path}[${index}]`); const id = canonicalId(capability.id, `${path}[${index}].id`);
    if (ids.has(id) || (previous !== '' && compareUtf16(previous, id) >= 0)) fail(`${path}[${index}].id`, 'capability-order-invalid', 'Capabilities must be sorted and unique.');
    previous = id; ids.add(id); validateAvailability(capability.value, `${path}[${index}].value`); return { id, value: capability.value as CapabilityAvailabilityV1 };
  });
}

function validateAvailability(value: unknown, path: string): void {
  const availability = plainObject(value, path); const status = availability.status;
  const observedStatuses = ['observed', 'declared']; const unavailableStatuses = ['unknown', 'unsupported', 'not-requested', 'not-active', 'permission-denied', 'blocked', 'error'];
  if (typeof status !== 'string') fail(`${path}.status`, 'availability-invalid', 'Availability status is invalid.');
  if (observedStatuses.includes(status)) {
    closed(availability, ['status', 'value', 'sourceRef', 'stability'], path); equal(availability.value, true, `${path}.value`); canonicalId(availability.sourceRef, `${path}.sourceRef`);
    oneOf(availability.stability, status === 'observed' ? ['stable', 'experimental', 'platform-specific'] : ['owner-binding', 'run-config', 'browser-default'], `${path}.stability`); return;
  }
  if (unavailableStatuses.includes(status)) {
    closed(availability, ['status', 'value', 'sourceRef', 'reasonCode'], path); equal(availability.value, null, `${path}.value`); canonicalId(availability.sourceRef, `${path}.sourceRef`); canonicalId(availability.reasonCode, `${path}.reasonCode`); return;
  }
  fail(`${path}.status`, 'availability-invalid', 'Unknown availability status.');
}

function validateLimits(value: unknown, path: string): void {
  const limits = closed(value, Object.keys(TELEMETRY_LIMITS_V1), path);
  for (const [key, expected] of Object.entries(TELEMETRY_LIMITS_V1)) equal(limits[key], expected, `${path}.${key}`);
}

function validateLoss(value: unknown, path: string): void {
  const loss = closed(value, ['dataRecordCount', 'dataChargeBytes', 'dataRecordsDropped', 'controlRecordCount', 'controlChargeBytes', 'controlRecordsDropped', 'overflowed', 'controlReserveExhausted', 'openSpansAtSeal', 'observerDrops'], path);
  for (const key of ['dataRecordCount', 'dataChargeBytes', 'dataRecordsDropped', 'controlRecordCount', 'controlChargeBytes', 'controlRecordsDropped', 'openSpansAtSeal']) safeNonNegativeInteger(loss[key], `${path}.${key}`);
  const dataRecordCount = loss.dataRecordCount as number;
  const dataChargeBytes = loss.dataChargeBytes as number;
  const controlRecordCount = loss.controlRecordCount as number;
  const controlChargeBytes = loss.controlChargeBytes as number;
  const openSpansAtSeal = loss.openSpansAtSeal as number;
  if (dataRecordCount > TELEMETRY_LIMITS_V1.maxDataRecords || dataChargeBytes > TELEMETRY_LIMITS_V1.maxDataChargeBytes || controlRecordCount > TELEMETRY_LIMITS_V1.controlReserveRecords || controlChargeBytes > TELEMETRY_LIMITS_V1.controlReserveChargeBytes || openSpansAtSeal > TELEMETRY_LIMITS_V1.maxOpenSpans) fail(path, 'loss-limit-invalid', 'Loss counters exceed fixed limits.');
  if (typeof loss.overflowed !== 'boolean' || typeof loss.controlReserveExhausted !== 'boolean') fail(path, 'loss-boolean-invalid', 'Loss flags must be boolean.');
  const drops = plainArray(loss.observerDrops, `${path}.observerDrops`);
  if (drops.length !== 2) fail(`${path}.observerDrops`, 'observer-drop-shape-invalid', 'Both observer entry types are required.');
  const expectedTypes: readonly TelemetryObserverDropEntryTypeV1[] = ['event', 'longtask'];
  drops.forEach((entry, index) => {
    const drop = closed(entry, ['entryType', 'status', 'droppedEntriesCount'], `${path}.observerDrops[${index}]`);
    equal(drop.entryType, expectedTypes[index], `${path}.observerDrops[${index}].entryType`);
    oneOf(drop.status, ['not-active', 'not-reported', 'reported'], `${path}.observerDrops[${index}].status`);
    if (drop.status === 'reported') safeNonNegativeInteger(drop.droppedEntriesCount, `${path}.observerDrops[${index}].droppedEntriesCount`);
    else if (drop.droppedEntriesCount !== null) fail(`${path}.observerDrops[${index}].droppedEntriesCount`, 'observer-drop-count-invalid', 'Unreported observer counts must be null.');
  });
}

function validateValidity(value: unknown, path: string, phase: BenchmarkSamplePhaseV1): void {
  const validity = plainObject(value, path);
  if (validity.status === 'valid') {
    const valid = closed(validity, ['status', 'reasons'], path);
    if (!Array.isArray(valid.reasons) || valid.reasons.length !== 0) fail(`${path}.reasons`, 'reason-shape-invalid', 'Valid exports need no reasons.');
    plainArray(valid.reasons, `${path}.reasons`);
    return;
  }
  if (validity.status !== 'invalid') fail(`${path}.status`, 'validity-invalid', 'Validity status is invalid.');
  const invalid = closed(validity, ['status', 'reasons'], path);
  const reasons = plainArray(invalid.reasons, `${path}.reasons`);
  if (reasons.length === 0) fail(`${path}.reasons`, 'reason-missing', 'Invalid exports need a reason.');
  for (let index = 0; index < reasons.length; index += 1) {
    const item = closed(reasons[index], ['code', 'detail', 'phase'], `${path}.reasons[${index}]`);
    if (typeof item.code !== 'string' || !REASON_SET.has(item.code)) fail(`${path}.reasons[${index}].code`, 'reason-code-invalid', 'Unknown BR01 reason code.');
    const detail = stringValue(item.detail, `${path}.reasons[${index}].detail`);
    if (!DETAIL_SET.has(detail)) fail(`${path}.reasons[${index}].detail`, 'detail-code-invalid', 'Unknown BR02 detail code.');
    equal(TELEMETRY_REASON_BY_DETAIL_V1[detail as TelemetryDetailCodeV1], item.code, `${path}.reasons[${index}].code`);
    equal(item.phase, phase, `${path}.reasons[${index}].phase`);
    oneOf(item.phase, PHASES, `${path}.reasons[${index}].phase`);
  }
}

function validateClock(value: unknown, path: string): void {
  const clock = closed(value, ['contractId', 'clockAnomalyToleranceMs'], path);
  equal(clock.contractId, TELEMETRY_CLOCK_CONTRACT_ID, `${path}.contractId`);
  equal(clock.clockAnomalyToleranceMs, 4, `${path}.clockAnomalyToleranceMs`);
}

function assertTelemetryExport(value: unknown): Br02TelemetryExportV1 {
  const exportValue = closed(value, ['schemaVersion', 'contractId', 'adapterContractId', 'adapterContractVersion', 'runId', 'planId', 'scenarioId', 'phase', 'backend', 'telemetryMode', 'iterations', 'clock', 'limits', 'realms', 'capabilities', 'records', 'validity', 'loss', 'sealed'], '$');
  equal(exportValue.schemaVersion, TELEMETRY_SCHEMA_VERSION, '$.schemaVersion');
  equal(exportValue.contractId, TELEMETRY_CONTRACT_ID, '$.contractId');
  equal(exportValue.adapterContractId, BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_ID_V1, '$.adapterContractId');
  equal(exportValue.adapterContractVersion, BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_VERSION_V1, '$.adapterContractVersion');
  const runId = canonicalId(exportValue.runId, '$.runId');
  canonicalId(exportValue.planId, '$.planId');
  canonicalId(exportValue.scenarioId, '$.scenarioId');
  const phase = exportValue.phase;
  oneOf(phase, PHASES, '$.phase');
  oneOf(exportValue.backend, ['three-webgl2', 'raw-webgpu', 'not-applicable'], '$.backend');
  const telemetryMode = exportValue.telemetryMode as TelemetryModeV1;
  oneOf(telemetryMode, ['telemetry-enabled-minimal', 'telemetry-enabled-full'], '$.telemetryMode');
  const iterations = validateIterations(exportValue.iterations, '$.iterations');
  validateClock(exportValue.clock, '$.clock');
  validateLimits(exportValue.limits, '$.limits');
  const realms = validateRealms(exportValue.realms, '$.realms');
  validateCapabilities(exportValue.capabilities, '$.capabilities');
  const realmIds = new Set(realms.map((realm) => realm.realmId));
  const iterationIds = new Set(iterations.map((iteration) => iteration.iterationId));
  const records = plainArray(exportValue.records, '$.records');
  const realmSequences = new Map<string, number>();
  const iterationOrdinals = new Map(iterations.map((iteration) => [iteration.iterationId, iteration.iterationOrdinal]));
  let previousSampleIterationOrdinal: number | undefined;
  const validatedRecords = records.map((record, index) => {
    const validated = validateRecord(record, `$.records[${index}]`, { runId, realmIds, iterationIds, telemetryMode }, index, realmSequences);
    if (validated.kind === 'sample') {
      const iterationOrdinal = iterationOrdinals.get(validated.iterationId);
      if (iterationOrdinal === undefined) fail(`$.records[${index}].iterationId`, 'iteration-reference-invalid', 'Record iteration is not registered.');
      if (previousSampleIterationOrdinal !== undefined && iterationOrdinal < previousSampleIterationOrdinal) {
        fail(`$.records[${index}].iterationId`, 'iteration-order-invalid', 'Sample iteration ordinals must be nondecreasing in ingest order.');
      }
      previousSampleIterationOrdinal = iterationOrdinal;
    }
    return validated;
  });
  let dataChargeBytes = 0;
  let controlChargeBytes = 0;
  for (const record of validatedRecords) {
    const charge = chargeRecordV1(record);
    if (record.kind === 'control') controlChargeBytes += charge;
    else dataChargeBytes += charge;
  }
  validateValidity(exportValue.validity, '$.validity', phase as BenchmarkSamplePhaseV1);
  validateLoss(exportValue.loss, '$.loss');
  const loss = exportValue.loss as JsonObject;
  const validity = exportValue.validity as JsonObject;
  validateValidityReconciliation(loss, validatedRecords, validity, phase as BenchmarkSamplePhaseV1);
  equal(loss.dataRecordCount, validatedRecords.filter((record) => record.kind !== 'control').length, '$.loss.dataRecordCount');
  equal(loss.dataChargeBytes, dataChargeBytes, '$.loss.dataChargeBytes');
  equal(loss.controlRecordCount, validatedRecords.filter((record) => record.kind === 'control').length, '$.loss.controlRecordCount');
  equal(loss.controlChargeBytes, controlChargeBytes, '$.loss.controlChargeBytes');
  equal(exportValue.sealed, true, '$.sealed');
  return exportValue as unknown as Br02TelemetryExportV1;
}

export function validateTelemetryExportV1(value: unknown): TelemetryValidationResultV1 {
  try {
    return { valid: true, value: assertTelemetryExport(value), issues: [] };
  } catch (error) {
    if (error instanceof ContractValidationError) return { valid: false, issues: [{ path: error.path, code: error.code, detail: error.message }] };
    return { valid: false, issues: [{ path: '$', code: 'validator-error', detail: 'Telemetry export validation failed closed.' }] };
  }
}

export function isTelemetryExportV1(value: unknown): value is Br02TelemetryExportV1 {
  return validateTelemetryExportV1(value).valid;
}

export function validateTelemetryRecordV1(value: unknown): value is TelemetryRecordV1 {
  try {
    const record = plainObject(value, '$');
    const runId = canonicalId(record.runId, '$.runId');
    const realmId = canonicalId(record.realmId, '$.realmId');
    const ingestSequence = safeNonNegativeInteger(record.ingestSequence, '$.ingestSequence');
    const realmSequence = safeNonNegativeInteger(record.realmSequence, '$.realmSequence');
    const realms = new Set<string>([realmId]);
    const iterationId = record.iterationId === null ? null : canonicalId(record.iterationId, '$.iterationId');
    const iterations = iterationId === null ? new Set<string>() : new Set<string>([iterationId]);
    validateRecord(record, '$', { runId, realmIds: realms, iterationIds: iterations, telemetryMode: 'telemetry-enabled-full' }, ingestSequence, new Map([[realmId, realmSequence]]));
    return true;
  } catch {
    return false;
  }
}

export function validateTelemetryRecordDraftV1(value: unknown): value is TelemetryRecordDraftV1 {
  try {
    const draft = plainObject(value, '$');
    closed(draft, ['realmId', 'startMs', 'kind', 'name', 'iterationId', 'fields'], '$');
    const record = { ...draft, schemaVersion: TELEMETRY_SCHEMA_VERSION, runId: 'r', recordId: 'br02-record-00000000', realmSequence: 0, ingestSequence: 0 };
    const iterationId = draft.iterationId === null ? null : canonicalId(draft.iterationId, '$.iterationId');
    validateRecord(record, '$', { runId: 'r' as CanonicalIdV1, realmIds: new Set([canonicalId(draft.realmId, '$.realmId')]), iterationIds: iterationId === null ? new Set() : new Set([iterationId]), telemetryMode: 'telemetry-enabled-full' }, 0, new Map());
    return true;
  } catch {
    return false;
  }
}

function utf8StringLength(value: string): number {
  let length = 2;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x22 || code === 0x5c) length += 2;
    else if (code <= 0x1f) length += code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d ? 2 : 6;
    else if (code <= 0x7f) length += 1;
    else if (code <= 0x7ff) length += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) { length += 4; index += 1; }
    else length += 3;
  }
  return length;
}

function jsonCharge(value: unknown): number {
  if (value === null) return 4;
  if (typeof value === 'string') return utf8StringLength(value);
  if (typeof value === 'boolean') return value ? 4 : 5;
  if (typeof value === 'number') return String(value).length;
  if (Array.isArray(value)) return 2 + value.reduce((total, entry, index) => total + jsonCharge(entry) + (index === 0 ? 0 : 1), 0);
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object);
  return 2 + keys.reduce((total, key, index) => total + utf8StringLength(key) + 1 + jsonCharge(object[key]) + (index === 0 ? 0 : 1), 0);
}

export function chargeRecordV1(record: TelemetryRecordV1): number {
  if (!validateTelemetryRecordV1(record)) throw new TypeError('Cannot charge an invalid BR02 telemetry record.');
  return jsonCharge(record);
}

export function serializeSealedTelemetryExportV1(exportValue: Br02TelemetryExportV1): Uint8Array {
  const result = validateTelemetryExportV1(exportValue);
  if (!result.valid) throw new TypeError(`Cannot serialize invalid BR02 telemetry export: ${result.issues[0]!.detail}`);
  const bytes = canonicalizeJsonV1(exportValue);
  if (bytes.byteLength > TELEMETRY_LIMITS_V1.maxCanonicalExportBytes) throw new RangeError('BR02 telemetry export exceeds its canonical byte limit.');
  return bytes;
}

export function reasonForDetailCodeV1(detailCode: TelemetryDetailCodeV1, phase: BenchmarkSamplePhaseV1): BenchmarkInvalidReasonV1 {
  return { code: TELEMETRY_REASON_BY_DETAIL_V1[detailCode], detail: detailCode, phase } as BenchmarkInvalidReasonV1;
}

export function compareReasonsV1(left: BenchmarkInvalidReasonV1, right: BenchmarkInvalidReasonV1): number {
  return compareUtf16(`${left.code}:${left.phase}`, `${right.code}:${right.phase}`);
}

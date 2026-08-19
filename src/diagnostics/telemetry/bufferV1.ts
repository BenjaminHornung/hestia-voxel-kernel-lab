import {
  BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_ID_V1,
  BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_VERSION_V1,
  compareUtf16,
} from '../../benchmark/contracts/browserV1';
import type {
  BenchmarkBackendCellV1,
  BenchmarkInvalidReasonV1,
  BenchmarkSamplePhaseV1,
  CanonicalIdV1,
} from '../../benchmark/contracts/browserV1';
import {
  Br02TelemetryExportV1,
  TELEMETRY_CLOCK_CONTRACT_ID,
  TELEMETRY_CONTRACT_ID,
  TELEMETRY_LIMITS_V1,
  TELEMETRY_REASON_BY_DETAIL_V1,
  TelemetryCapabilityV1,
  TelemetryDetailCodeV1,
  TelemetryIterationV1,
  TelemetryModeV1,
  TelemetryObserverDropEntryTypeV1,
  TelemetryObserverDropV1,
  TelemetryObserverDropStatusV1,
  TelemetryRecordDraftV1,
  TelemetryRecordV1,
  TelemetryRealmV1,
  chargeRecordV1,
  compareReasonsV1,
  hasTelemetryTemporalBindingV1,
  reasonForDetailCodeV1,
  serializeSealedTelemetryExportV1,
  validateTelemetryExportV1,
  validateTelemetryRecordDraftV1,
} from './contractV1';

export interface CreateTelemetryBufferV1Input {
  readonly adapterContractId?: typeof BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_ID_V1;
  readonly adapterContractVersion?: typeof BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_VERSION_V1;
  readonly runId: CanonicalIdV1;
  readonly planId: CanonicalIdV1;
  readonly scenarioId: CanonicalIdV1;
  readonly phase: BenchmarkSamplePhaseV1;
  readonly backend: BenchmarkBackendCellV1;
  readonly telemetryMode: TelemetryModeV1;
  readonly iterations: readonly TelemetryIterationV1[];
  readonly realms: readonly TelemetryRealmV1[];
  readonly capabilities: readonly TelemetryCapabilityV1[];
}

export type TelemetryAppendResultV1 =
  | { readonly status: 'accepted'; readonly record: TelemetryRecordV1; readonly chargedBytes: number }
  | { readonly status: 'rejected'; readonly reason: 'sealed' | 'invalid-record' | 'record-too-large' | 'overflow' | 'control-reserve-exhausted' | 'open-span-limit' };

export interface TelemetryBufferV1Api {
  append(draft: TelemetryRecordDraftV1): TelemetryAppendResultV1;
  seal(): Br02TelemetryExportV1;
  serialize(): Uint8Array;
  isSealed(): boolean;
  snapshot(): Br02TelemetryExportV1;
  openSpan(spanId: CanonicalIdV1): boolean;
  closeSpan(spanId: CanonicalIdV1): boolean;
  setObserverDrop(entryType: TelemetryObserverDropEntryTypeV1, status: TelemetryObserverDropStatusV1, droppedEntriesCount?: number | null): boolean;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => cloneValue(entry)) as T;
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value)) result[key] = cloneValue((value as Record<string, unknown>)[key]);
    return result as T;
  }
  return value;
}

function canonicalId(value: string): CanonicalIdV1 {
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value)) throw new TypeError('BR02 buffer ID is not canonical.');
  return value as CanonicalIdV1;
}

function recordId(ingestSequence: number): CanonicalIdV1 {
  return canonicalId(`br02-record-${String(ingestSequence).padStart(8, '0')}`);
}

function emptyObserverDrops(): readonly [{ entryType: 'event'; status: 'not-active'; droppedEntriesCount: null }, { entryType: 'longtask'; status: 'not-active'; droppedEntriesCount: null }] {
  return [
    { entryType: 'event', status: 'not-active', droppedEntriesCount: null },
    { entryType: 'longtask', status: 'not-active', droppedEntriesCount: null },
  ];
}

export class TelemetryBufferV1 implements TelemetryBufferV1Api {
  readonly #input: CreateTelemetryBufferV1Input;
  readonly #iterations: readonly TelemetryIterationV1[];
  readonly #realms: readonly TelemetryRealmV1[];
  readonly #capabilities: readonly TelemetryCapabilityV1[];
  readonly #realmIds: ReadonlySet<string>;
  readonly #iterationIds: ReadonlySet<string>;
  readonly #iterationOrdinals: ReadonlyMap<string, number>;
  readonly #segments: TelemetryRecordV1[][] = [];
  readonly #realmSequences = new Map<string, number>();
  readonly #openSpans = new Set<string>();
  readonly #issues: BenchmarkInvalidReasonV1[] = [];
  readonly #observerDrops: [TelemetryObserverDropV1, TelemetryObserverDropV1] = emptyObserverDrops().map((entry) => ({ ...entry })) as [TelemetryObserverDropV1, TelemetryObserverDropV1];
  #nextIngestSequence = 0;
  #dataRecordCount = 0;
  #dataChargeBytes = 0;
  #dataRecordsDropped = 0;
  #controlRecordCount = 0;
  #controlChargeBytes = 0;
  #controlRecordsDropped = 0;
  #overflowed = false;
  #controlReserveExhausted = false;
  #overflowControlAttempted = false;
  #openSpanControlAttempted = false;
  readonly #observerInvalidationAttempted = new Set<string>();
  #sealed = false;
  #sealedExport: Br02TelemetryExportV1 | null = null;
  #serialized: Uint8Array | null = null;

  public constructor(input: CreateTelemetryBufferV1Input) {
    const adapterContractId = input.adapterContractId ?? BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_ID_V1;
    const adapterContractVersion = input.adapterContractVersion ?? BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_VERSION_V1;
    const observerDrops = emptyObserverDrops();
    const initial: Br02TelemetryExportV1 = {
      schemaVersion: 1,
      contractId: TELEMETRY_CONTRACT_ID,
      adapterContractId,
      adapterContractVersion,
      runId: input.runId,
      planId: input.planId,
      scenarioId: input.scenarioId,
      phase: input.phase,
      backend: input.backend,
      telemetryMode: input.telemetryMode,
      iterations: input.iterations,
      clock: { contractId: TELEMETRY_CLOCK_CONTRACT_ID, clockAnomalyToleranceMs: 4 },
      limits: TELEMETRY_LIMITS_V1,
      realms: input.realms,
      capabilities: input.capabilities,
      records: [],
      validity: { status: 'valid', reasons: [] },
      loss: {
        dataRecordCount: 0,
        dataChargeBytes: 0,
        dataRecordsDropped: 0,
        controlRecordCount: 0,
        controlChargeBytes: 0,
        controlRecordsDropped: 0,
        overflowed: false,
        controlReserveExhausted: false,
        openSpansAtSeal: 0,
        observerDrops,
      },
      sealed: true,
    };
    const validation = validateTelemetryExportV1(initial);
    if (!validation.valid) throw new TypeError(`Invalid BR02 buffer input: ${validation.issues[0]!.detail}`);
    this.#input = {
      ...input,
      adapterContractId,
      adapterContractVersion,
      iterations: cloneValue(input.iterations),
      realms: cloneValue(input.realms),
      capabilities: cloneValue(input.capabilities),
    };
    this.#iterations = this.#input.iterations;
    this.#realms = this.#input.realms;
    this.#capabilities = this.#input.capabilities;
    this.#realmIds = new Set(this.#realms.map((realm) => realm.realmId));
    this.#iterationIds = new Set(this.#iterations.map((iteration) => iteration.iterationId));
    for (const realm of this.#realms) this.#realmSequences.set(realm.realmId, 0);
    deepFreeze(this.#iterations);
    deepFreeze(this.#realms);
    deepFreeze(this.#capabilities);
    this.#iterationOrdinals = new Map(this.#iterations.map((iteration) => [iteration.iterationId, iteration.iterationOrdinal]));
  }

  public append(draft: TelemetryRecordDraftV1): TelemetryAppendResultV1 {
    if (this.#sealed) return { status: 'rejected', reason: 'sealed' };
    if (!validateTelemetryRecordDraftV1(draft)
      || !this.#realmIds.has(draft.realmId)
      || (draft.iterationId !== null && !this.#iterationIds.has(draft.iterationId))
      || !hasTelemetryTemporalBindingV1(draft, this.#iterationOrdinals)) {
      this.#dataRecordsDropped += 1;
      this.#rememberIssue('br02-record-invalid');
      this.#appendInvalidation('export-invalid', 'br02-record-invalid');
      return { status: 'rejected', reason: 'invalid-record' };
    }
    const record = this.#buildRecord(draft);
    let charge: number;
    try { charge = chargeRecordV1(record); } catch {
      this.#dataRecordsDropped += 1;
      this.#rememberIssue('br02-record-invalid');
      this.#appendInvalidation('export-invalid', 'br02-record-invalid');
      return { status: 'rejected', reason: 'invalid-record' };
    }
    if (draft.kind === 'control') {
      if (!this.#fitsControl(charge)) {
        this.#dropControlReserve();
        return { status: 'rejected', reason: 'control-reserve-exhausted' };
      }
      this.#accept(record, charge);
      if (draft.name === 'telemetry.invalidation') this.#rememberIssue(draft.fields.detailCode);
      return { status: 'accepted', record, chargedBytes: charge };
    }
    if (!this.#fitsData(charge)) {
      this.#dropDataOverflow(charge);
      return { status: 'rejected', reason: charge > TELEMETRY_LIMITS_V1.maxDataChargeBytes ? 'record-too-large' : 'overflow' };
    }
    this.#accept(record, charge);
    return { status: 'accepted', record, chargedBytes: charge };
  }

  public openSpan(spanId: CanonicalIdV1): boolean {
    if (this.#sealed || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(spanId) || this.#openSpans.has(spanId)) return false;
    if (this.#openSpans.size >= TELEMETRY_LIMITS_V1.maxOpenSpans) {
      this.#rememberIssue('br02-open-span-at-seal');
      if (!this.#openSpanControlAttempted) {
        this.#openSpanControlAttempted = true;
        this.#appendInvalidation('open-span-at-seal', 'br02-open-span-at-seal');
      }
      return false;
    }
    this.#openSpans.add(spanId);
    return true;
  }

  public closeSpan(spanId: CanonicalIdV1): boolean {
    if (this.#sealed) return false;
    return this.#openSpans.delete(spanId);
  }

  public setObserverDrop(entryType: TelemetryObserverDropEntryTypeV1, status: TelemetryObserverDropStatusV1, droppedEntriesCount: number | null = null): boolean {
    if (this.#sealed || (entryType !== 'event' && entryType !== 'longtask')) return false;
    if (status === 'reported' && (droppedEntriesCount === null || !Number.isSafeInteger(droppedEntriesCount) || droppedEntriesCount < 0)) return false;
    if (status !== 'reported' && droppedEntriesCount !== null) return false;
    const index = entryType === 'event' ? 0 : 1;
    this.#observerDrops[index] = { entryType, status, droppedEntriesCount };
    if (status === 'reported' && typeof droppedEntriesCount === 'number' && droppedEntriesCount > 0) {
      this.#rememberIssue('br02-observer-drop');
      this.#appendObserverInvalidation(entryType, 'observer-drop', 'br02-observer-drop');
    }
    if (status === 'not-reported') {
      this.#rememberIssue('br02-observer-drop-accounting-unavailable');
      this.#appendObserverInvalidation(entryType, 'observer-drop-accounting-unavailable', 'br02-observer-drop-accounting-unavailable');
    }
    return true;
  }

  public seal(): Br02TelemetryExportV1 {
    if (this.#sealedExport !== null) return this.#sealedExport;
    const openSpansAtSeal = this.#openSpans.size;
    if (openSpansAtSeal > 0) {
      this.#rememberIssue('br02-open-span-at-seal');
      if (!this.#openSpanControlAttempted) {
        this.#openSpanControlAttempted = true;
        this.#appendInvalidation('open-span-at-seal', 'br02-open-span-at-seal');
      }
    }
    this.#sealed = true;
    const records = this.#segments.flatMap((segment) => segment);
    const reasonsByKey = new Map<string, BenchmarkInvalidReasonV1>();
    const sortedIssues = [...this.#issues];
    sortedIssues.sort((left, right) => compareUtf16(right.detail, left.detail));
    for (const item of sortedIssues) reasonsByKey.set(`${item.code}:${item.phase}`, item);
    const reasons = [...reasonsByKey.values()].sort(compareReasonsV1);
    const loss = {
      dataRecordCount: this.#dataRecordCount,
      dataChargeBytes: this.#dataChargeBytes,
      dataRecordsDropped: this.#dataRecordsDropped,
      controlRecordCount: this.#controlRecordCount,
      controlChargeBytes: this.#controlChargeBytes,
      controlRecordsDropped: this.#controlRecordsDropped,
      overflowed: this.#overflowed,
      controlReserveExhausted: this.#controlReserveExhausted,
      openSpansAtSeal,
      observerDrops: [{ ...this.#observerDrops[0] }, { ...this.#observerDrops[1] }] as const,
    } as const;
    const exportValue: Br02TelemetryExportV1 = {
      schemaVersion: 1,
      contractId: TELEMETRY_CONTRACT_ID,
      adapterContractId: this.#input.adapterContractId!,
      adapterContractVersion: this.#input.adapterContractVersion!,
      runId: this.#input.runId,
      planId: this.#input.planId,
      scenarioId: this.#input.scenarioId,
      phase: this.#input.phase,
      backend: this.#input.backend,
      telemetryMode: this.#input.telemetryMode,
      iterations: cloneValue(this.#iterations),
      clock: { contractId: TELEMETRY_CLOCK_CONTRACT_ID, clockAnomalyToleranceMs: 4 },
      limits: { ...TELEMETRY_LIMITS_V1 },
      realms: cloneValue(this.#realms),
      capabilities: cloneValue(this.#capabilities),
      records,
      validity: reasons.length === 0 ? { status: 'valid', reasons: [] } : { status: 'invalid', reasons },
      loss,
      sealed: true,
    };
    const validation = validateTelemetryExportV1(exportValue);
    if (!validation.valid) throw new TypeError(`BR02 seal produced an invalid export: ${validation.issues[0]!.detail}`);
    this.#sealedExport = deepFreeze(exportValue);
    return this.#sealedExport;
  }

  public serialize(): Uint8Array {
    if (this.#serialized === null) this.#serialized = serializeSealedTelemetryExportV1(this.seal());
    return new Uint8Array(this.#serialized);
  }

  public isSealed(): boolean { return this.#sealed; }

  public snapshot(): Br02TelemetryExportV1 { return this.seal(); }

  #buildRecord(draft: TelemetryRecordDraftV1): TelemetryRecordV1 {
    const realmSequence = this.#realmSequences.get(draft.realmId);
    if (realmSequence === undefined) throw new TypeError('BR02 record realm is not registered.');
    const record = {
      schemaVersion: 1 as const,
      runId: this.#input.runId,
      recordId: recordId(this.#nextIngestSequence),
      realmSequence,
      ingestSequence: this.#nextIngestSequence,
      realmId: draft.realmId,
      startMs: draft.startMs,
      kind: draft.kind,
      name: draft.name,
      iterationId: draft.iterationId,
      fields: cloneValue(draft.fields),
    };
    return record as TelemetryRecordV1;
  }

  #accept(record: TelemetryRecordV1, charge: number): void {
    if (this.#segments.length === 0 || this.#segments[this.#segments.length - 1]!.length >= TELEMETRY_LIMITS_V1.segmentCapacityRecords) this.#segments.push([]);
    this.#segments[this.#segments.length - 1]!.push(deepFreeze(record));
    this.#nextIngestSequence += 1;
    this.#realmSequences.set(record.realmId, record.realmSequence + 1);
    if (record.kind === 'control') {
      this.#controlRecordCount += 1;
      this.#controlChargeBytes += charge;
    } else {
      this.#dataRecordCount += 1;
      this.#dataChargeBytes += charge;
    }
  }

  #fitsData(charge: number): boolean {
    return charge <= TELEMETRY_LIMITS_V1.maxDataChargeBytes
      && this.#dataRecordCount < TELEMETRY_LIMITS_V1.maxDataRecords
      && this.#dataChargeBytes <= TELEMETRY_LIMITS_V1.maxDataChargeBytes - charge;
  }

  #fitsControl(charge: number): boolean {
    return charge <= TELEMETRY_LIMITS_V1.controlReserveChargeBytes
      && this.#controlRecordCount < TELEMETRY_LIMITS_V1.controlReserveRecords
      && this.#controlChargeBytes <= TELEMETRY_LIMITS_V1.controlReserveChargeBytes - charge;
  }

  #dropDataOverflow(_charge: number): void {
    this.#dataRecordsDropped += 1;
    this.#overflowed = true;
    this.#rememberIssue('br02-buffer-overflow');
    if (!this.#overflowControlAttempted) {
      this.#overflowControlAttempted = true;
      this.#appendInvalidation('buffer-overflow', 'br02-buffer-overflow');
    }
  }

  #dropControlReserve(): void {
    this.#controlRecordsDropped += 1;
    this.#controlReserveExhausted = true;
    this.#rememberIssue('br02-control-reserve-exhausted');
  }

  #rememberIssue(detailCode: TelemetryDetailCodeV1): void {
    const item = reasonForDetailCodeV1(detailCode, this.#input.phase);
    this.#issues.push(item);
  }

  #appendObserverInvalidation(
    entryType: TelemetryObserverDropEntryTypeV1,
    source: 'observer-drop' | 'observer-drop-accounting-unavailable',
    detailCode: 'br02-observer-drop' | 'br02-observer-drop-accounting-unavailable',
  ): void {
    const key = `${entryType}:${detailCode}`;
    if (this.#observerInvalidationAttempted.has(key)) return;
    this.#observerInvalidationAttempted.add(key);
    this.#appendInvalidation(source, detailCode);
  }

  #appendInvalidation(source: 'buffer-overflow' | 'control-reserve-exhausted' | 'observer-drop' | 'observer-drop-accounting-unavailable' | 'open-span-at-seal' | 'export-invalid', detailCode: TelemetryDetailCodeV1): void {
    const realmId = this.#realms[0]?.realmId;
    if (realmId === undefined) {
      this.#controlRecordsDropped += 1;
      this.#controlReserveExhausted = true;
      this.#rememberIssue('br02-control-reserve-exhausted');
      return;
    }
    const draft: TelemetryRecordDraftV1 = {
      realmId,
      startMs: 0,
      kind: 'control',
      name: 'telemetry.invalidation',
      iterationId: null,
      fields: { source, reasonCode: TELEMETRY_REASON_BY_DETAIL_V1[detailCode], detailCode },
    };
    const record = this.#buildRecord(draft);
    const charge = chargeRecordV1(record);
    if (!this.#fitsControl(charge)) {
      this.#dropControlReserve();
      return;
    }
    this.#accept(record, charge);
    this.#rememberIssue(detailCode);
  }
}

export function createTelemetryBufferV1(input: CreateTelemetryBufferV1Input): TelemetryBufferV1 {
  return new TelemetryBufferV1(input);
}

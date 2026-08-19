import {
  BENCHMARK_METRIC_REACHABILITY_MATRIX_V1,
  BENCHMARK_SCENARIO_REGISTRY_V1,
  type CanonicalIdV1,
  type CapabilityAvailabilityV1,
  type Sha256DigestV1,
} from '../../benchmark/contracts/browserV1';
import { createTelemetryBufferV1, type TelemetryBufferV1 } from './bufferV1';
import { createMonotonicClockV1, type MonotonicClockV1, type PerformanceLikeV1 } from './clockV1';
import {
  TELEMETRY_REASON_BY_DETAIL_V1,
  deriveTelemetryCapabilityIdsV1,
  type Br02TelemetryExportV1,
  type TelemetryCapabilityV1,
  type TelemetryDetailCodeV1,
  type TelemetryInvalidationSourceV1,
  type TelemetryObserverDropEntryTypeV1,
  type TelemetryRecordDraftV1,
} from './contractV1';
import type { BrowserTelemetryHandoffEnvelopeV1 } from './browserHandoffV1';

export function deriveBrowserTelemetryCapabilityIdsV1(
  bootstrap: BrowserTelemetryHandoffEnvelopeV1,
): readonly CanonicalIdV1[] {
  return deriveTelemetryCapabilityIdsV1({
    scenarioId: bootstrap.scenarioId,
    phase: bootstrap.phase,
    backend: bootstrap.backend,
  });
}

export type BrowserTelemetryCollectorStateV1 = 'initializing' | 'ready' | 'running' | 'sealed' | 'invalid';
export type BrowserTelemetryCollectorReasonV1 = 'none' | 'download-failed' | 'renderer-failure' | TelemetryDetailCodeV1;

export interface RendererTelemetrySinkV1 {
  onAnimationFrame(timestamp: number): void;
  beforeDraw(): void;
  afterDraw(): void;
  onRendererFailure(): void;
  onWebglContextLost(): void;
  onWebgpuDeviceLost(): void;
}

export interface BrowserTelemetryCollectorProjectionV1 {
  readonly iterationId: CanonicalIdV1;
  readonly iterationOrdinal: number;
}

interface BrowserTelemetryDocumentV1 {
  readonly visibilityState: string;
  hasFocus?(): boolean;
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

interface BrowserTelemetryWindowV1 {
  readonly requestAnimationFrame?: unknown;
  readonly Worker?: unknown;
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

interface PerformanceEntryV1 {
  readonly startTime: number;
  readonly duration: number;
}

interface PerformanceObserverEntryListV1 {
  getEntries(): readonly PerformanceEntryV1[];
}

interface PerformanceObserverCallbackOptionsV1 {
  readonly droppedEntriesCount?: unknown;
}

interface PerformanceObserverV1 {
  observe(options: { readonly type: string; readonly buffered?: boolean }): void;
  takeRecords(): readonly PerformanceEntryV1[];
  disconnect(): void;
}

interface PerformanceObserverConstructorV1 {
  new(callback: (
    list: PerformanceObserverEntryListV1,
    observer: PerformanceObserverV1,
    options?: PerformanceObserverCallbackOptionsV1 | number,
  ) => void): PerformanceObserverV1;
  readonly supportedEntryTypes?: readonly string[];
}

export interface BrowserTelemetryCollectorEnvironmentV1 {
  readonly document: BrowserTelemetryDocumentV1;
  readonly window: BrowserTelemetryWindowV1;
  readonly performance: PerformanceLikeV1;
  readonly PerformanceObserver?: PerformanceObserverConstructorV1;
}

export interface BrowserTelemetryCollectorOptionsV1 {
  readonly bootstrap: BrowserTelemetryHandoffEnvelopeV1;
  readonly canvas: HTMLCanvasElement;
  readonly environment?: BrowserTelemetryCollectorEnvironmentV1;
  readonly onStateChange?: (
    state: BrowserTelemetryCollectorStateV1,
    reason: BrowserTelemetryCollectorReasonV1,
  ) => void;
}

export interface BrowserTelemetryDownloadEnvironmentV1 {
  readonly document: Pick<Document, 'createElement'>;
  readonly url: Pick<URLConstructorV1, 'createObjectURL' | 'revokeObjectURL'>;
  readonly setTimeout: (callback: () => void, delay: number) => unknown;
}

interface URLConstructorV1 {
  createObjectURL(object: Blob): string;
  revokeObjectURL(url: string): void;
}

interface ObserverStateV1 {
  readonly entryType: TelemetryObserverDropEntryTypeV1;
  required: boolean;
  observer: PerformanceObserverV1 | null;
  active: boolean;
  accountingObserved: boolean;
}

const MAIN_REALM_ID = 'main' as CanonicalIdV1;
const MAIN_SOURCE_REF = 'br02-performance-time-origin-v1' as CanonicalIdV1;
const BOOTSTRAP_SOURCE_REF = 'br02-bootstrap-v1' as CanonicalIdV1;
const WEBGL_SOURCE_REF = 'br02-webgl2-probe-v1' as CanonicalIdV1;
const RAF_SOURCE_REF = 'br02-raf-source-v1' as CanonicalIdV1;
const OBSERVER_SOURCE_REF = 'br02-performance-observer-v1' as CanonicalIdV1;
const EXTENSION_SOURCE_REF = 'br02-webgl-extension-probe-v1' as CanonicalIdV1;
const WORKER_SOURCE_REF = 'br02-worker-probe-v1' as CanonicalIdV1;
const CAPABILITY_REASON_NOT_OBSERVED = 'not-observed' as CanonicalIdV1;
const CAPABILITY_REASON_NOT_ACTIVE = 'not-active' as CanonicalIdV1;
const CAPABILITY_REASON_API_UNAVAILABLE = 'api-unavailable' as CanonicalIdV1;
const CAPABILITY_REASON_PROBE_ERROR = 'probe-error' as CanonicalIdV1;
const DRAW_OPERATION_ID = 'br02-draw-submit' as CanonicalIdV1;
const DRAW_SPAN_ID = 'br02-draw-submit-span' as CanonicalIdV1;
const RAF_OPERATION_ID = 'br02-raf-interval' as CanonicalIdV1;
const LONGTASK_OPERATION_ID = 'br02-longtask' as CanonicalIdV1;
const RUN_OPERATION_ID = 'br02-run-total' as CanonicalIdV1;
const WORKER_OPERATION_ID = 'br02-worker-mesh-cpu' as CanonicalIdV1;
const MESH_OPERATION_ID = 'br02-mesh' as CanonicalIdV1;
const COVERAGE_OPERATION_ID = 'br02-coverage' as CanonicalIdV1;

const SAMPLE_NAMES = new Set([
  'run.total',
  'worker.mesh-cpu',
  'mesh.quads',
  'mesh.output-bytes',
  'coverage.sha256-match',
  'browser.long-task',
  'draw-submit.cpu',
  'browser.raf-interval',
]);

function defaultEnvironment(): BrowserTelemetryCollectorEnvironmentV1 {
  const scope = globalThis as typeof globalThis & {
    readonly window?: BrowserTelemetryWindowV1;
    readonly document?: BrowserTelemetryDocumentV1;
    readonly performance?: PerformanceLikeV1;
    readonly PerformanceObserver?: PerformanceObserverConstructorV1;
  };
  if (scope.window === undefined || scope.document === undefined || scope.performance === undefined) {
    throw new Error('BR02 browser telemetry requires a browser environment.');
  }
  return {
    window: scope.window,
    document: scope.document,
    performance: scope.performance,
    PerformanceObserver: scope.PerformanceObserver,
  };
}

function canonicalId(value: string): CanonicalIdV1 {
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value)) throw new TypeError('BR02 telemetry ID is not canonical.');
  return value as CanonicalIdV1;
}

function observed(sourceRef: CanonicalIdV1): CapabilityAvailabilityV1 {
  return { status: 'observed', value: true, sourceRef, stability: 'stable' };
}

function declared(): CapabilityAvailabilityV1 {
  return { status: 'declared', value: true, sourceRef: BOOTSTRAP_SOURCE_REF, stability: 'run-config' };
}

function unavailable(
  status: 'unknown' | 'unsupported' | 'not-requested' | 'not-active' | 'permission-denied' | 'blocked' | 'error',
  sourceRef: CanonicalIdV1,
  reasonCode: CanonicalIdV1,
): CapabilityAvailabilityV1 {
  return { status, value: null, sourceRef, reasonCode };
}

function exactReachability(
  bootstrap: BrowserTelemetryHandoffEnvelopeV1,
  recordName: string,
): readonly { readonly capabilityId?: CanonicalIdV1; readonly disposition: string }[] {
  return BENCHMARK_METRIC_REACHABILITY_MATRIX_V1.filter((entry) => (
    entry.scenarioId === bootstrap.scenarioId
    && entry.phase === bootstrap.phase
    && entry.backend === bootstrap.backend
    && entry.recordName === recordName
  ));
}

function hasExactReachability(bootstrap: BrowserTelemetryHandoffEnvelopeV1, recordName: string): boolean {
  const entries = exactReachability(bootstrap, recordName);
  return entries.length === 1 && entries[0]!.disposition === 'emit-sample';
}

function makeObserverState(entryType: TelemetryObserverDropEntryTypeV1, required: boolean): ObserverStateV1 {
  return { entryType, required, observer: null, active: false, accountingObserved: false };
}

function entryValues(list: PerformanceObserverEntryListV1): readonly PerformanceEntryV1[] {
  return list.getEntries();
}

export class BrowserTelemetryCollectorV1 implements RendererTelemetrySinkV1 {
  readonly #environment: BrowserTelemetryCollectorEnvironmentV1;
  readonly #canvas: HTMLCanvasElement;
  readonly #bootstrap: BrowserTelemetryHandoffEnvelopeV1;
  readonly #onStateChange: BrowserTelemetryCollectorOptionsV1['onStateChange'];
  readonly #clock: MonotonicClockV1;
  readonly #buffer: TelemetryBufferV1;
  readonly #webglContext: WebGL2RenderingContext | null;
  readonly #observers: Record<TelemetryObserverDropEntryTypeV1, ObserverStateV1> = {
    event: makeObserverState('event', false),
    longtask: makeObserverState('longtask', false),
  };
  readonly #visibilityChanged = (): void => this.#recordVisibility(this.#readVisibility());
  readonly #focusChanged = (event: Event): void => this.#recordFocus(event.type === 'focus' ? 'focused' : 'unfocused');
  readonly #capabilityIds: readonly CanonicalIdV1[];
  #state: BrowserTelemetryCollectorStateV1 = 'initializing';
  #reason: BrowserTelemetryCollectorReasonV1 = 'none';
  #currentOrdinal = 0;
  #completed = new Set<number>();
  #binding: CanonicalIdV1 | null = null;
  #rafBaseline: number | null = null;
  #drawStart: number | null = null;
  #visibility: 'visible' | 'hidden' = 'visible';
  #focus: 'focused' | 'unfocused' = 'focused';
  #sealedExport: Br02TelemetryExportV1 | null = null;
  #downloadAttempted = false;
  #disposed = false;

  public constructor(options: BrowserTelemetryCollectorOptionsV1) {
    this.#environment = options.environment ?? defaultEnvironment();
    this.#canvas = options.canvas;
    this.#bootstrap = options.bootstrap;
    this.#onStateChange = options.onStateChange;
    this.#capabilityIds = deriveTelemetryCapabilityIdsV1(options.bootstrap);

    this.#clock = createMonotonicClockV1(MAIN_REALM_ID, this.#environment.performance);
    const realm = this.#clock.registerRealm();
    this.#clock.marker();
    this.#webglContext = this.#probeWebgl2();
    this.#prepareObservers();
    const capabilities = this.#createCapabilities();
    this.#buffer = createTelemetryBufferV1({
      runId: options.bootstrap.runId,
      planId: options.bootstrap.planId,
      scenarioId: options.bootstrap.scenarioId,
      phase: options.bootstrap.phase,
      backend: options.bootstrap.backend,
      telemetryMode: options.bootstrap.telemetryMode,
      iterations: options.bootstrap.iterations,
      realms: [{ realmId: MAIN_REALM_ID, realm: 'main', timeOriginEpochMs: realm.timeOriginMs }],
      capabilities,
    });
    this.#installListeners();
    this.#setInactiveObserverDrops();
    this.#visibility = this.#readVisibility();
    this.#focus = this.#readFocus();
    this.#recordContext('document.visibility', { value: this.#visibility });
    this.#recordContext('document.focus', { value: this.#focus });
    this.#validateInitialSources();
  }

  public get state(): BrowserTelemetryCollectorStateV1 {
    return this.#state;
  }

  public get reason(): BrowserTelemetryCollectorReasonV1 {
    return this.#reason;
  }

  public get currentIteration(): BrowserTelemetryCollectorProjectionV1 {
    const iteration = this.#bootstrap.iterations[this.#currentOrdinal];
    if (iteration === undefined) throw new RangeError('BR02 current iteration is outside the handoff.');
    return Object.freeze({ iterationId: iteration.iterationId, iterationOrdinal: iteration.iterationOrdinal });
  }

  public get canStartCurrentIteration(): boolean {
    return this.#state === 'ready' && !this.#completed.has(this.#currentOrdinal);
  }

  public get canCompleteCurrentIteration(): boolean {
    return this.#state === 'running' && this.#binding !== null;
  }

  public get canCompleteAndSealCurrentIteration(): boolean {
    return this.canCompleteCurrentIteration && this.#isFinalIteration();
  }

  public get canAdvanceToNextIteration(): boolean {
    return this.#state === 'ready'
      && this.#completed.has(this.#currentOrdinal)
      && !this.#isFinalIteration();
  }

  public get canSeal(): boolean {
    return this.#state === 'ready' && this.#completed.has(this.#currentOrdinal) && this.#isFinalIteration();
  }

  public get canExport(): boolean {
    return this.#state === 'sealed' && this.#sealedExport !== null && !this.#downloadAttempted;
  }

  public get rendererSink(): RendererTelemetrySinkV1 {
    return this;
  }

  public markReady(): boolean {
    if (this.#state !== 'initializing' || this.#disposed || this.#webglContext === null) return false;
    this.#state = 'ready';
    this.#notifyState();
    return true;
  }

  public startCurrentIteration(): boolean {
    if (this.#state !== 'ready' || this.#disposed || this.#completed.has(this.#currentOrdinal)) return false;
    if (this.#visibility === 'hidden') {
      this.#invalidate('document-hidden', 'br02-document-hidden');
      return false;
    }
    if (this.#focus === 'unfocused') {
      this.#invalidate('document-unfocused', 'br02-document-unfocused');
      return false;
    }
    this.#clearObserverQueues();
    if (this.#state !== 'ready') return false;
    const iteration = this.currentIteration;
    this.#binding = iteration.iterationId;
    this.#rafBaseline = null;
    this.#drawStart = null;
    this.#state = 'running';
    this.#notifyState();
    return true;
  }

  public completeCurrentIteration(): boolean {
    if (this.#state !== 'running' || this.#binding === null) return false;
    this.#drainObserverQueues();
    if (this.#state !== 'running') return false;
    this.#completed.add(this.#currentOrdinal);
    this.#binding = null;
    this.#rafBaseline = null;
    this.#drawStart = null;
    this.#state = 'ready';
    this.#notifyState();
    return true;
  }

  public completeAndSealCurrentIteration(): boolean {
    if (this.#state !== 'running' || this.#binding === null || !this.#isFinalIteration()) return false;
    this.#drainObserverQueues();
    if (this.#state !== 'running') return false;
    this.#completed.add(this.#currentOrdinal);
    this.#binding = null;
    this.#rafBaseline = null;
    this.#drawStart = null;
    return this.#sealInternal();
  }

  public advanceToNextIteration(): boolean {
    if (this.#state !== 'ready' || !this.#completed.has(this.#currentOrdinal)) return false;
    if (this.#currentOrdinal + 1 >= this.#bootstrap.iterations.length) return false;
    this.#currentOrdinal += 1;
    this.#notifyState();
    return true;
  }

  public seal(): boolean {
    if (this.#state !== 'ready' || !this.#completed.has(this.#currentOrdinal) || !this.#isFinalIteration()) return false;
    return this.#sealInternal();
  }

  public snapshot(): Br02TelemetryExportV1 | null {
    return this.#sealedExport;
  }

  public scheduleExportDownload(environment: BrowserTelemetryDownloadEnvironmentV1): boolean {
    if (this.#state !== 'sealed' || this.#sealedExport === null || this.#downloadAttempted) return false;
    this.#downloadAttempted = true;
    try {
      environment.setTimeout(() => {
        let url: string | null = null;
        const revokeUrl = (): void => {
          if (url === null) return;
          try {
            environment.url.revokeObjectURL(url);
          } catch {
            // Cleanup failure must not change the sealed payload.
          }
        };
        try {
          const bytes = this.#buffer.serialize();
          const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/json' });
          url = environment.url.createObjectURL(blob);
          const anchor = environment.document.createElement('a');
          anchor.href = url;
          anchor.download = 'br02-telemetry-export-v1.json';
          anchor.click();
          environment.setTimeout(revokeUrl, 0);
        } catch {
          revokeUrl();
          this.#reason = 'download-failed';
          this.#notifyState();
        }
      }, 0);
    } catch {
      this.#reason = 'download-failed';
      this.#notifyState();
    }
    return true;
  }

  public onAnimationFrame(timestamp: number): void {
    if (this.#state !== 'running' || this.#binding === null || !hasExactReachability(this.#bootstrap, 'browser.raf-interval')) return;
    let sourceTimestamp: number;
    try {
      sourceTimestamp = this.#clock.sourceTimestamp(timestamp);
    } catch {
      this.#invalidate(this.#rafBaseline === null ? 'clock-anomaly' : 'export-invalid', this.#rafBaseline === null ? 'br02-clock-invalid' : 'br02-record-invalid');
      return;
    }
    if (this.#rafBaseline === null) {
      this.#rafBaseline = sourceTimestamp;
      return;
    }
    const interval = sourceTimestamp - this.#rafBaseline;
    if (!Number.isFinite(interval) || interval <= 0) {
      this.#invalidate('export-invalid', 'br02-record-invalid');
      return;
    }
    this.#rafBaseline = sourceTimestamp;
    this.#appendSample({
      realmId: MAIN_REALM_ID,
      startMs: sourceTimestamp,
      kind: 'sample',
      name: 'browser.raf-interval',
      iterationId: this.#binding,
      fields: {
        sampleKind: 'frame',
        sourceUnit: 'ms',
        value: interval,
        operationId: RAF_OPERATION_ID,
        dimensions: [{ key: 'time-block-ordinal', value: this.#currentIterationOrdinal() }],
      },
    });
  }

  public beforeDraw(): void {
    if (this.#state !== 'running' || this.#binding === null || this.#drawStart !== null || !hasExactReachability(this.#bootstrap, 'draw-submit.cpu')) return;
    try {
      this.#drawStart = this.#clock.marker().absoluteMonotonicMs;
    } catch {
      this.#invalidate('clock-anomaly', 'br02-clock-invalid');
    }
  }

  public afterDraw(): void {
    const startMs = this.#drawStart;
    this.#drawStart = null;
    if (startMs === null || this.#state !== 'running' || this.#binding === null) return;
    try {
      const endMs = this.#clock.marker().absoluteMonotonicMs;
      this.#appendSample({
        realmId: MAIN_REALM_ID,
        startMs,
        kind: 'sample',
        name: 'draw-submit.cpu',
        iterationId: this.#binding,
        fields: {
          sampleKind: 'duration',
          sourceUnit: 'ms',
          value: endMs - startMs,
          operationId: DRAW_OPERATION_ID,
          spanId: DRAW_SPAN_ID,
        },
      });
    } catch {
      this.#invalidate('clock-anomaly', 'br02-clock-invalid');
    }
  }

  public onWebglContextLost(): void {
    if (this.#state === 'sealed' || this.#state === 'invalid') return;
    this.#invalidate('webgl-context-loss', 'br02-webgl-context-loss');
  }

  public onWebgpuDeviceLost(): void {
    if (this.#state === 'sealed' || this.#state === 'invalid') return;
    this.#invalidate('webgpu-device-loss', 'br02-webgpu-device-loss');
  }

  public markRendererFailed(): void {
    if (this.#state === 'sealed' || this.#state === 'invalid' || this.#disposed) return;
    this.#state = 'invalid';
    this.#reason = 'renderer-failure';
    this.#binding = null;
    this.#rafBaseline = null;
    this.#drawStart = null;
    this.#notifyState();
  }

  public onRendererFailure(): void {
    this.markRendererFailed();
  }

  public recordRunTotal(startMs: number, value: number): boolean {
    const iterationId = this.#binding;
    if (iterationId === null || !hasExactReachability(this.#bootstrap, 'run.total')) return false;
    return this.#appendSample({
      realmId: MAIN_REALM_ID,
      startMs,
      kind: 'sample',
      name: 'run.total',
      iterationId,
      fields: { sampleKind: 'duration', sourceUnit: 'ms', value, operationId: RUN_OPERATION_ID, spanId: 'br02-run-total-span' as CanonicalIdV1 },
    });
  }

  public recordWorkerMeshCpu(startMs: number, value: number, chunkKey: string): boolean {
    const iterationId = this.#binding;
    if (iterationId === null || !hasExactReachability(this.#bootstrap, 'worker.mesh-cpu')) return false;
    let canonicalChunkKey: CanonicalIdV1;
    try {
      canonicalChunkKey = canonicalId(chunkKey);
    } catch {
      this.#invalidate('export-invalid', 'br02-record-invalid');
      return false;
    }
    return this.#appendSample({
      realmId: MAIN_REALM_ID,
      startMs,
      kind: 'sample',
      name: 'worker.mesh-cpu',
      iterationId,
      fields: {
        sampleKind: 'duration',
        sourceUnit: 'ms',
        value,
        operationId: WORKER_OPERATION_ID,
        spanId: 'br02-worker-mesh-cpu-span' as CanonicalIdV1,
        dimensions: [{ key: 'chunk-key', value: canonicalChunkKey }],
      },
    });
  }

  public recordMeshQuads(startMs: number, value: number): boolean {
    const iterationId = this.#binding;
    if (iterationId === null || !hasExactReachability(this.#bootstrap, 'mesh.quads')) return false;
    return this.#appendSample({
      realmId: MAIN_REALM_ID,
      startMs,
      kind: 'sample',
      name: 'mesh.quads',
      iterationId,
      fields: { sampleKind: 'counter', sourceUnit: 'count', value, operationId: MESH_OPERATION_ID },
    });
  }

  public recordMeshOutputBytes(startMs: number, value: number): boolean {
    const iterationId = this.#binding;
    if (iterationId === null || !hasExactReachability(this.#bootstrap, 'mesh.output-bytes')) return false;
    return this.#appendSample({
      realmId: MAIN_REALM_ID,
      startMs,
      kind: 'sample',
      name: 'mesh.output-bytes',
      iterationId,
      fields: { sampleKind: 'memory', sourceUnit: 'byte', value, operationId: MESH_OPERATION_ID },
    });
  }

  public recordCoverage(startMs: number, digest: `sha256:${string}`): boolean {
    const iterationId = this.#binding;
    if (iterationId === null || !hasExactReachability(this.#bootstrap, 'coverage.sha256-match')) return false;
    return this.#appendSample({
      realmId: MAIN_REALM_ID,
      startMs,
      kind: 'sample',
      name: 'coverage.sha256-match',
      iterationId,
      fields: {
        sampleKind: 'liveness',
        sourceUnit: 'count',
        value: 1,
        operationId: COVERAGE_OPERATION_ID,
        dimensions: [
          { key: 'actual-sha256', value: digest as Sha256DigestV1 },
          { key: 'expected-sha256', value: digest as Sha256DigestV1 },
        ],
      },
    });
  }

  public recordLongTask(startMs: number, value: number): boolean {
    if (this.#state !== 'running' || this.#bootstrap.telemetryMode !== 'telemetry-enabled-full' || !hasExactReachability(this.#bootstrap, 'browser.long-task')) return false;
    return this.#appendLongTask(startMs, value);
  }

  public recordDrawSubmit(startMs: number, value: number): boolean {
    const iterationId = this.#binding;
    if (iterationId === null || !hasExactReachability(this.#bootstrap, 'draw-submit.cpu')) return false;
    return this.#appendSample({
      realmId: MAIN_REALM_ID,
      startMs,
      kind: 'sample',
      name: 'draw-submit.cpu',
      iterationId,
      fields: { sampleKind: 'duration', sourceUnit: 'ms', value, operationId: DRAW_OPERATION_ID, spanId: DRAW_SPAN_ID },
    });
  }

  public recordRafInterval(startMs: number, value: number): boolean {
    const iterationId = this.#binding;
    if (iterationId === null || !hasExactReachability(this.#bootstrap, 'browser.raf-interval')) return false;
    return this.#appendSample({
      realmId: MAIN_REALM_ID,
      startMs,
      kind: 'sample',
      name: 'browser.raf-interval',
      iterationId,
      fields: {
        sampleKind: 'frame',
        sourceUnit: 'ms',
        value,
        operationId: RAF_OPERATION_ID,
        dimensions: [{ key: 'time-block-ordinal', value: this.#currentIterationOrdinal() }],
      },
    });
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#environment.document.removeEventListener('visibilitychange', this.#visibilityChanged);
    this.#environment.window.removeEventListener('focus', this.#focusChanged);
    this.#environment.window.removeEventListener('blur', this.#focusChanged);
    this.#disconnectObservers();
  }

  #probeWebgl2(): WebGL2RenderingContext | null {
    try {
      return this.#canvas.getContext('webgl2', { antialias: true, alpha: false });
    } catch {
      return null;
    }
  }

  #prepareObservers(): void {
    const longTaskRequired = hasExactReachability(this.#bootstrap, 'browser.long-task');
    this.#observers.longtask.required = longTaskRequired;
    if (this.#bootstrap.telemetryMode !== 'telemetry-enabled-full') return;
    for (const entryType of ['longtask', 'event'] as const) {
      const required = entryType === 'longtask' && longTaskRequired;
      const state = this.#observers[entryType];
      state.observer = this.#constructObserver(entryType, required);
      state.active = state.observer !== null;
    }
  }

  #constructObserver(entryType: TelemetryObserverDropEntryTypeV1, _required: boolean): PerformanceObserverV1 | null {
    const Constructor = this.#environment.PerformanceObserver;
    if (Constructor === undefined) return null;
    const supported = Constructor.supportedEntryTypes;
    if (!Array.isArray(supported) || !supported.includes(entryType)) return null;
    try {
      const observer = new Constructor((list, _observer, options) => this.#observerCallback(entryType, list, options));
      observer.observe({ type: entryType, buffered: true });
      return observer;
    } catch {
      return null;
    }
  }

  #createCapabilities(): readonly TelemetryCapabilityV1[] {
    const definition = BENCHMARK_SCENARIO_REGISTRY_V1[this.#bootstrap.scenarioId as keyof typeof BENCHMARK_SCENARIO_REGISTRY_V1]?.definition;
    if (definition === undefined) throw new TypeError('BR02 telemetry scenario is not registered.');
    return this.#capabilityIds.map((id) => {
      const declaredContract = definition.capabilityContracts.find((entry) => entry.id === id);
      return { id, value: this.#probeCapability(id, declaredContract?.requirement) };
    });
  }

  #probeCapability(id: CanonicalIdV1, requirement: 'must-support' | 'must-declare' | undefined): CapabilityAvailabilityV1 {
    if (id === 'performance-time-origin') return observed(MAIN_SOURCE_REF);
    if (id === 'webgl2') return this.#webglContext === null
      ? unavailable('unsupported', WEBGL_SOURCE_REF, CAPABILITY_REASON_API_UNAVAILABLE)
      : observed(WEBGL_SOURCE_REF);
    if (id === 'request-animation-frame') return typeof this.#environment.window.requestAnimationFrame === 'function'
      ? observed(RAF_SOURCE_REF)
      : unavailable('unsupported', RAF_SOURCE_REF, CAPABILITY_REASON_API_UNAVAILABLE);
    if (id === 'long-tasks') return this.#observers.longtask.active
      ? observed(OBSERVER_SOURCE_REF)
      : unavailable('not-active', OBSERVER_SOURCE_REF, CAPABILITY_REASON_NOT_ACTIVE);
    if (id === 'event-timing') return this.#observers.event.active
      ? observed(OBSERVER_SOURCE_REF)
      : unavailable('not-active', OBSERVER_SOURCE_REF, CAPABILITY_REASON_NOT_ACTIVE);
    if (id === 'dedicated-worker') return typeof this.#environment.window.Worker === 'function'
      ? observed(WORKER_SOURCE_REF)
      : unavailable('unsupported', WORKER_SOURCE_REF, CAPABILITY_REASON_API_UNAVAILABLE);
    if (id === 'webgl-disjoint-timer-query') {
      try {
        const extension = this.#webglContext?.getExtension('EXT_disjoint_timer_query_webgl2');
        return extension === null || extension === undefined
          ? unavailable('unsupported', EXTENSION_SOURCE_REF, CAPABILITY_REASON_API_UNAVAILABLE)
          : observed(EXTENSION_SOURCE_REF);
      } catch {
        return unavailable('error', EXTENSION_SOURCE_REF, CAPABILITY_REASON_PROBE_ERROR);
      }
    }
    if (id === 'webgpu' || id === 'webgpu-timestamp-query') return requirement === 'must-declare' ? declared()
      : unavailable('not-requested', BOOTSTRAP_SOURCE_REF, CAPABILITY_REASON_NOT_OBSERVED);
    if (id.startsWith('cdp-')) return unavailable('not-requested', BOOTSTRAP_SOURCE_REF, CAPABILITY_REASON_NOT_ACTIVE);
    if (requirement === 'must-declare') return declared();
    return unavailable('unknown', BOOTSTRAP_SOURCE_REF, CAPABILITY_REASON_NOT_OBSERVED);
  }

  #installListeners(): void {
    this.#environment.document.addEventListener('visibilitychange', this.#visibilityChanged);
    this.#environment.window.addEventListener('focus', this.#focusChanged);
    this.#environment.window.addEventListener('blur', this.#focusChanged);
  }

  #setInactiveObserverDrops(): void {
    for (const entryType of ['event', 'longtask'] as const) {
      const observer = this.#observers[entryType];
      if (!observer.active) this.#buffer.setObserverDrop(entryType, 'not-active');
    }
  }

  #validateInitialSources(): void {
    if (this.#webglContext === null) this.#invalidate('export-invalid', 'br02-context-invalid');
    if (this.#bootstrap.telemetryMode === 'telemetry-enabled-full'
      && this.#observers.longtask.required
      && !this.#observers.longtask.active) {
      this.#invalidate('export-invalid', 'br02-capability-not-observed');
    }
    if (hasExactReachability(this.#bootstrap, 'browser.raf-interval')
      && typeof this.#environment.window.requestAnimationFrame !== 'function') {
      this.#invalidate('export-invalid', 'br02-capability-not-observed');
    }
    if (this.#clock.hasAnomaly()) this.#invalidate('clock-anomaly', 'br02-clock-invalid');
  }

  #readVisibility(): 'visible' | 'hidden' {
    if (this.#environment.document.visibilityState === 'hidden') return 'hidden';
    if (this.#environment.document.visibilityState === 'visible') return 'visible';
    this.#invalidate('export-invalid', 'br02-context-invalid');
    return 'visible';
  }

  #readFocus(): 'focused' | 'unfocused' {
    try {
      return this.#environment.document.hasFocus?.() === false ? 'unfocused' : 'focused';
    } catch {
      this.#invalidate('export-invalid', 'br02-context-invalid');
      return 'unfocused';
    }
  }

  #recordVisibility(value: 'visible' | 'hidden'): void {
    this.#visibility = value;
    this.#recordContext('document.visibility', { value });
    if (value === 'hidden' && this.#state === 'running') this.#invalidate('document-hidden', 'br02-document-hidden');
  }

  #recordFocus(value: 'focused' | 'unfocused'): void {
    this.#focus = value;
    this.#recordContext('document.focus', { value });
    if (value === 'unfocused' && this.#state === 'running') this.#invalidate('document-unfocused', 'br02-document-unfocused');
  }

  #recordContext(name: 'document.visibility' | 'document.focus', fields: { readonly value: 'visible' | 'hidden' | 'focused' | 'unfocused' }): void {
    if (this.#state === 'invalid' || this.#state === 'sealed') return;
    try {
      const marker = this.#clock.marker();
      if (name === 'document.visibility') {
        this.#appendDraft({
          realmId: MAIN_REALM_ID,
          startMs: marker.absoluteMonotonicMs,
          kind: 'context',
          name,
          iterationId: null,
          fields: fields as { readonly value: 'visible' | 'hidden' },
        });
      } else {
        this.#appendDraft({
          realmId: MAIN_REALM_ID,
          startMs: marker.absoluteMonotonicMs,
          kind: 'context',
          name,
          iterationId: null,
          fields: fields as { readonly value: 'focused' | 'unfocused' },
        });
      }
    } catch {
      this.#invalidate('clock-anomaly', 'br02-clock-invalid');
    }
  }

  #observerCallback(
    entryType: TelemetryObserverDropEntryTypeV1,
    list: PerformanceObserverEntryListV1,
    options?: PerformanceObserverCallbackOptionsV1 | number,
  ): void {
    if (this.#state !== 'running' || this.#binding === null) return;
    const state = this.#observers[entryType];
    if (this.#requiresObserverAccounting(state)) {
      const dropped = typeof options === 'number' ? options : options?.droppedEntriesCount;
      if (typeof dropped !== 'number' || !Number.isFinite(dropped) || !Number.isSafeInteger(dropped) || dropped < 0) {
        this.#setObserverDrop(entryType, 'not-reported');
        this.#markInvalid('br02-observer-drop-accounting-unavailable');
        return;
      }
      state.accountingObserved = true;
      this.#setObserverDrop(entryType, 'reported', dropped);
      if (dropped > 0) {
        this.#markInvalid('br02-observer-drop');
        return;
      }
    }
    if (entryType === 'longtask' && !hasExactReachability(this.#bootstrap, 'browser.long-task')) return;
    let entries: readonly PerformanceEntryV1[];
    try {
      entries = entryValues(list);
    } catch {
      this.#invalidate('export-invalid', 'br02-context-invalid');
      return;
    }
    this.#processObserverEntries(entryType, entries);
  }

  #appendLongTask(startMs: number, value: number): boolean {
    const iterationId = this.#binding;
    if (this.#state !== 'running' || this.#bootstrap.telemetryMode !== 'telemetry-enabled-full' || iterationId === null || !hasExactReachability(this.#bootstrap, 'browser.long-task')) return false;
    return this.#appendSample({
      realmId: MAIN_REALM_ID,
      startMs,
      kind: 'sample',
      name: 'browser.long-task',
      iterationId,
      fields: {
        sampleKind: 'long-task',
        sourceUnit: 'ms',
        value,
        operationId: LONGTASK_OPERATION_ID,
        dimensions: [{ key: 'time-block-ordinal', value: this.#currentIterationOrdinal() }],
      },
    });
  }

  #appendEventTiming(startMs: number, durationMs: number): boolean {
    if (this.#bootstrap.telemetryMode !== 'telemetry-enabled-full' || this.#state !== 'running' || this.#binding === null) return false;
    return this.#appendDraft({
      realmId: MAIN_REALM_ID,
      startMs,
      kind: 'diagnostic',
      name: 'browser.event-timing',
      iterationId: this.#binding,
      fields: { durationMs, timeBlockOrdinal: this.#currentIterationOrdinal() },
    });
  }

  #appendSample(draft: TelemetryRecordDraftV1): boolean {
    if (draft.kind !== 'sample' || !SAMPLE_NAMES.has(draft.name) || this.#state !== 'running' || this.#binding === null) return false;
    if (!hasExactReachability(this.#bootstrap, draft.name)) return false;
    return this.#appendDraft(draft);
  }

  #appendDraft(draft: TelemetryRecordDraftV1): boolean {
    if (this.#disposed || this.#state === 'invalid' || this.#state === 'sealed') return false;
    let result: ReturnType<TelemetryBufferV1['append']>;
    try {
      result = this.#buffer.append(draft);
    } catch {
      this.#invalidate('export-invalid', 'br02-record-invalid');
      return false;
    }
    if (result.status === 'accepted') return true;
    const detailCode = result.reason === 'overflow' || result.reason === 'record-too-large'
      ? 'br02-buffer-overflow'
      : result.reason === 'control-reserve-exhausted'
        ? 'br02-control-reserve-exhausted'
        : 'br02-record-invalid';
    const source = detailCode === 'br02-buffer-overflow' ? 'buffer-overflow'
      : detailCode === 'br02-control-reserve-exhausted' ? 'control-reserve-exhausted'
        : 'export-invalid';
    this.#invalidate(source, detailCode);
    return false;
  }

  #setObserverDrop(
    entryType: TelemetryObserverDropEntryTypeV1,
    status: 'not-reported' | 'reported',
    droppedEntriesCount?: number,
  ): void {
    if (status === 'reported') this.#buffer.setObserverDrop(entryType, status, droppedEntriesCount);
    else this.#buffer.setObserverDrop(entryType, status, null);
  }

  #clearObserverQueues(): void {
    for (const state of Object.values(this.#observers)) {
      if (!state.active || state.observer === null) continue;
      try {
        state.observer.takeRecords();
      } catch {
        this.#invalidate('export-invalid', 'br02-context-invalid');
      }
    }
  }

  #drainObserverQueues(): void {
    const processRecords = this.#state === 'running' && this.#binding !== null;
    for (const entryType of ['event', 'longtask'] as const) {
      const state = this.#observers[entryType];
      if (!state.active || state.observer === null) continue;
      let records: readonly PerformanceEntryV1[];
      try {
        records = state.observer.takeRecords();
      } catch {
        this.#invalidate('export-invalid', 'br02-context-invalid');
        continue;
      }
      if (processRecords) this.#processObserverEntries(entryType, records);
    }
  }

  #processObserverEntries(entryType: TelemetryObserverDropEntryTypeV1, records: readonly PerformanceEntryV1[]): void {
    if (entryType === 'longtask' && !hasExactReachability(this.#bootstrap, 'browser.long-task')) return;
    for (const entry of records) {
      if (entryType === 'longtask') this.#appendLongTask(entry.startTime, entry.duration);
      else this.#appendEventTiming(entry.startTime, entry.duration);
      if (this.#state !== 'running' || this.#binding === null) return;
    }
  }

  #disconnectObservers(drainBeforeDisconnect = true): void {
    for (const state of Object.values(this.#observers)) {
      if (state.observer === null) continue;
      if (drainBeforeDisconnect) {
        try {
          const records = state.observer.takeRecords();
          if (this.#state === 'running' && this.#binding !== null) this.#processObserverEntries(state.entryType, records);
        } catch {
          if (!this.#disposed && this.#state !== 'sealed') this.#invalidate('export-invalid', 'br02-context-invalid');
        }
      }
      try {
        state.observer.disconnect();
      } catch {
        if (!this.#disposed && this.#state !== 'sealed') this.#invalidate('export-invalid', 'br02-context-invalid');
      }
      state.observer = null;
      state.active = false;
    }
  }

  #invalidate(source: TelemetryInvalidationSourceV1, detailCode: TelemetryDetailCodeV1): void {
    if (this.#state === 'invalid' || this.#state === 'sealed' || this.#disposed) return;
    const draft: TelemetryRecordDraftV1 = {
      realmId: MAIN_REALM_ID,
      startMs: 0,
      kind: 'control',
      name: 'telemetry.invalidation',
      iterationId: null,
      fields: { source, reasonCode: TELEMETRY_REASON_BY_DETAIL_V1[detailCode], detailCode },
    };
    try {
      this.#buffer.append(draft);
    } catch {
      this.#reason = detailCode;
    }
    this.#markInvalid(detailCode);
  }

  #markInvalid(detailCode: TelemetryDetailCodeV1): void {
    if (this.#state === 'invalid' || this.#state === 'sealed' || this.#disposed) return;
    this.#reason = detailCode;
    this.#state = 'invalid';
    this.#binding = null;
    this.#notifyState();
  }

  #sealInternal(): boolean {
    if (this.#state !== 'ready' && this.#state !== 'running') return false;
    this.#drainObserverQueues();
    for (const entryType of ['event', 'longtask'] as const) {
      const state = this.#observers[entryType];
      if (this.#requiresObserverAccounting(state) && state.active && !state.accountingObserved) {
        this.#setObserverDrop(entryType, 'not-reported');
        this.#reason = 'br02-observer-drop-accounting-unavailable';
      }
    }
    this.#disconnectObservers(false);
    if (this.#isInvalid()) return false;
    try {
      this.#sealedExport = this.#buffer.seal();
    } catch {
      this.#reason = 'br02-export-invalid';
      this.#state = 'invalid';
      this.#notifyState();
      return false;
    }
    if (this.#sealedExport.validity.status === 'invalid') {
      this.#reason = this.#sealedExport.validity.reasons[0]?.detail as TelemetryDetailCodeV1 ?? 'br02-export-invalid';
    }
    this.#state = 'sealed';
    this.#binding = null;
    this.#notifyState();
    return true;
  }

  #isFinalIteration(): boolean {
    return this.#currentOrdinal === this.#bootstrap.iterations.length - 1;
  }

  #isInvalid(): boolean {
    return this.#state === 'invalid';
  }

  #requiresObserverAccounting(state: ObserverStateV1): boolean {
    return this.#bootstrap.telemetryMode === 'telemetry-enabled-full' && state.active;
  }

  #currentIterationOrdinal(): number {
    return this.currentIteration.iterationOrdinal;
  }

  #notifyState(): void {
    this.#onStateChange?.(this.#state, this.#reason);
  }
}

export function createBrowserTelemetryCollectorV1(options: BrowserTelemetryCollectorOptionsV1): BrowserTelemetryCollectorV1 {
  return new BrowserTelemetryCollectorV1(options);
}

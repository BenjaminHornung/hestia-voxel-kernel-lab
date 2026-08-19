import { describe, expect, it, vi } from 'vitest';
import type { CanonicalIdV1 } from '../../../../src/benchmark/contracts/browserV1';
import { serializeSealedTelemetryExportV1 } from '../../../../src/diagnostics/telemetry/contractV1';
import {
  BrowserTelemetryCollectorV1,
  type BrowserTelemetryCollectorEnvironmentV1,
} from '../../../../src/diagnostics/telemetry/collectorV1';
import { TelemetryBufferV1 } from '../../../../src/diagnostics/telemetry/bufferV1';
import type { BrowserTelemetryHandoffEnvelopeV1 } from '../../../../src/diagnostics/telemetry/browserHandoffV1';
import { rethrowRendererFailureV1 } from '../../../../src/render-three/threeVoxelRenderer';

const id = (value: string): CanonicalIdV1 => value as CanonicalIdV1;

function envelope(overrides: Partial<BrowserTelemetryHandoffEnvelopeV1> = {}): BrowserTelemetryHandoffEnvelopeV1 {
  return {
    schemaVersion: 1,
    contractId: 'br-02-browser-telemetry-handoff-v1',
    runtimeActivation: 'br02-browser-telemetry-enabled-v1',
    runId: id('run'),
    planId: id('plan'),
    scenarioId: id('backend-fixture-v1'),
    phase: 'measurement',
    backend: 'three-webgl2',
    telemetryMode: 'telemetry-enabled-minimal',
    iterations: [{ iterationId: id('iteration-0'), iterationOrdinal: 0 }],
    ...overrides,
  };
}

interface FakeDom {
  readonly document: {
    visibilityState: string;
    hasFocus(): boolean;
    addEventListener(type: string, listener: (event: Event) => void): void;
    removeEventListener(type: string, listener: (event: Event) => void): void;
  };
  readonly window: {
    readonly requestAnimationFrame: () => number;
    readonly Worker: unknown;
    addEventListener(type: string, listener: (event: Event) => void): void;
    removeEventListener(type: string, listener: (event: Event) => void): void;
  };
  readonly performance: { timeOrigin: number; now(): number };
  readonly removedDocumentListeners: string[];
  readonly removedWindowListeners: string[];
  fireDocument(type: string): void;
  fireWindow(type: string): void;
}

function fakeDom(): FakeDom {
  let focused = true;
  let visibility = 'visible';
  let now = 0;
  const documentListeners = new Map<string, (event: Event) => void>();
  const windowListeners = new Map<string, (event: Event) => void>();
  const removedDocumentListeners: string[] = [];
  const removedWindowListeners: string[] = [];
  const value: FakeDom = {
    document: {
      get visibilityState() { return visibility; },
      hasFocus: () => focused,
      addEventListener: (type, listener) => { documentListeners.set(type, listener); },
      removeEventListener: (type) => { removedDocumentListeners.push(type); documentListeners.delete(type); },
    },
    window: {
      requestAnimationFrame: () => 1,
      Worker: function Worker() {},
      addEventListener: (type, listener) => { windowListeners.set(type, listener); },
      removeEventListener: (type) => { removedWindowListeners.push(type); windowListeners.delete(type); },
    },
    removedDocumentListeners,
    removedWindowListeners,
    performance: {
      timeOrigin: 1000,
      now: () => now,
    },
    fireDocument: (type) => { documentListeners.get(type)?.(new Event(type)); },
    fireWindow: (type) => { windowListeners.get(type)?.(new Event(type)); },
  };
  void focused;
  void visibility;
  void now;
  return value;
}

function environment(dom: FakeDom, performanceObserver?: any): BrowserTelemetryCollectorEnvironmentV1 {
  return {
    document: dom.document as any,
    window: dom.window as any,
    performance: dom.performance,
    PerformanceObserver: performanceObserver,
  };
}

function canvas(): HTMLCanvasElement {
  return {
    getContext: () => ({ getExtension: () => null }),
  } as unknown as HTMLCanvasElement;
}

describe('BR02 browser collector v1', () => {
  it('resets the rAF baseline per iteration and records native successive timestamps', () => {
    const dom = fakeDom();
    const collector = new BrowserTelemetryCollectorV1({ bootstrap: envelope(), canvas: canvas(), environment: environment(dom) });
    expect(collector.state).toBe('initializing');
    expect(collector.markReady()).toBe(true);
    expect(collector.startCurrentIteration()).toBe(true);
    collector.onAnimationFrame(10);
    collector.onAnimationFrame(26);
    expect(collector.completeCurrentIteration()).toBe(true);
    expect(collector.seal()).toBe(true);
    const exportValue = collector.snapshot();
    expect(exportValue?.records.filter((record) => record.name === 'browser.raf-interval').map((record) => ({
      startMs: record.startMs,
      value: (record.fields as { value: number }).value,
    }))).toEqual([{ startMs: 26, value: 16 }]);
  });

  it.each([
    ['cold', envelope({ phase: 'cold' }), true],
    ['warmup', envelope({ phase: 'warmup' }), true],
    ['non-reachable scenario', envelope({ scenarioId: id('navigation-leak-v1'), phase: 'leak', backend: 'not-applicable' }), false],
  ] as const)('gates draw-submit at the exact reachability cell for %s', (_label, bootstrap, reachable) => {
    const dom = fakeDom();
    const collector = new BrowserTelemetryCollectorV1({ bootstrap, canvas: canvas(), environment: environment(dom) });
    expect(collector.markReady()).toBe(true);
    expect(collector.startCurrentIteration()).toBe(true);
    expect(collector.recordDrawSubmit(12, 1)).toBe(reachable);
    expect(collector.completeCurrentIteration()).toBe(true);
    expect(collector.seal()).toBe(true);
    expect(collector.snapshot()!.records.filter((record) => record.name === 'draw-submit.cpu')).toHaveLength(reachable ? 1 : 0);
    expect(collector.snapshot()!.validity).toEqual({ status: 'valid', reasons: [] });
  });

  it('no-ops every unreachable sample producer without invalidating the export', () => {
    const dom = fakeDom();
    const collector = new BrowserTelemetryCollectorV1({
      bootstrap: envelope({ scenarioId: id('navigation-leak-v1'), phase: 'leak', backend: 'not-applicable' }),
      canvas: canvas(),
      environment: environment(dom),
    });
    collector.markReady();
    collector.startCurrentIteration();
    expect(collector.recordRunTotal(1, 1)).toBe(false);
    expect(collector.recordWorkerMeshCpu(1, 1, 'chunk-0')).toBe(false);
    expect(collector.recordMeshQuads(1, 1)).toBe(false);
    expect(collector.recordMeshOutputBytes(1, 1)).toBe(false);
    expect(collector.recordCoverage(1, 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false);
    expect(collector.recordLongTask(1, 50)).toBe(false);
    expect(collector.recordDrawSubmit(1, 1)).toBe(false);
    expect(collector.recordRafInterval(1, 1)).toBe(false);
    expect(collector.completeCurrentIteration()).toBe(true);
    expect(collector.seal()).toBe(true);
    expect(collector.snapshot()!.records.filter((record) => record.kind === 'sample')).toEqual([]);
    expect(collector.snapshot()!.validity).toEqual({ status: 'valid', reasons: [] });
  });

  it('keeps an optional long-task capability unavailable in minimal mode without invalidating', () => {
    const dom = fakeDom();
    const collector = new BrowserTelemetryCollectorV1({
      bootstrap: envelope({ scenarioId: id('scheduler-steady-v1'), telemetryMode: 'telemetry-enabled-minimal' }),
      canvas: canvas(),
      environment: environment(dom),
    });
    expect(collector.markReady()).toBe(true);
    expect(collector.startCurrentIteration()).toBe(true);
    expect(collector.recordLongTask(1, 50)).toBe(false);
    expect(collector.completeCurrentIteration()).toBe(true);
    expect(collector.seal()).toBe(true);
    expect(collector.snapshot()!.capabilities.find((entry) => entry.id === 'long-tasks')?.value).toMatchObject({ status: 'not-active', value: null });
    expect(collector.snapshot()!.loss.observerDrops).toEqual([
      { entryType: 'event', status: 'not-active', droppedEntriesCount: null },
      { entryType: 'longtask', status: 'not-active', droppedEntriesCount: null },
    ]);
    expect(collector.snapshot()!.validity).toEqual({ status: 'valid', reasons: [] });
  });

  it('gates the Full long-task producer on a running iteration', () => {
    class FakePerformanceObserver {
      static supportedEntryTypes = ['longtask'];
      constructor(_callback: (list: any, observer: any, options?: any) => void) {}
      observe(): void {}
      takeRecords(): readonly any[] { return []; }
      disconnect(): void {}
    }
    const dom = fakeDom();
    const collector = new BrowserTelemetryCollectorV1({
      bootstrap: envelope({ scenarioId: id('scheduler-steady-v1'), telemetryMode: 'telemetry-enabled-full' }),
      canvas: canvas(),
      environment: environment(dom, FakePerformanceObserver),
    });
    expect(collector.recordLongTask(1, 50)).toBe(false);
    expect(collector.markReady()).toBe(true);
    expect(collector.recordLongTask(1, 50)).toBe(false);
    expect(collector.startCurrentIteration()).toBe(true);
    expect(collector.recordLongTask(1, 50)).toBe(true);
    expect(collector.completeCurrentIteration()).toBe(true);
    expect(collector.recordLongTask(1, 50)).toBe(false);
    expect(collector.seal()).toBe(true);
    expect(collector.snapshot()!.records.filter((record) => record.name === 'browser.long-task')).toHaveLength(1);
  });

  it('uses the declared ordinal for the second iteration time block', () => {
    const dom = fakeDom();
    const collector = new BrowserTelemetryCollectorV1({
      bootstrap: envelope({
        iterations: [
          { iterationId: id('iteration-0'), iterationOrdinal: 0 },
          { iterationId: id('iteration-1'), iterationOrdinal: 1 },
        ],
      }),
      canvas: canvas(),
      environment: environment(dom),
    });
    collector.markReady();
    collector.startCurrentIteration();
    collector.onAnimationFrame(10);
    collector.onAnimationFrame(26);
    expect(collector.completeCurrentIteration()).toBe(true);
    expect(collector.advanceToNextIteration()).toBe(true);
    expect(collector.startCurrentIteration()).toBe(true);
    collector.onAnimationFrame(30);
    collector.onAnimationFrame(46);
    expect(collector.completeAndSealCurrentIteration()).toBe(true);
    expect(collector.snapshot()!.records.filter((record) => record.name === 'browser.raf-interval').map((record) => (
      (record.fields as { dimensions: readonly [{ value: number }] }).dimensions[0].value
    ))).toEqual([0, 1]);
  });

  it.each([
    ['zero', 10],
    ['negative', 9],
    ['non-finite', Number.NaN],
    ['infinite', Number.POSITIVE_INFINITY],
  ] as const)('fails closed with br02-record-invalid for a %s subsequent rAF interval', (_label, secondTimestamp) => {
    const dom = fakeDom();
    const collector = new BrowserTelemetryCollectorV1({ bootstrap: envelope(), canvas: canvas(), environment: environment(dom) });
    collector.markReady();
    collector.startCurrentIteration();
    collector.onAnimationFrame(10);
    collector.onAnimationFrame(secondTimestamp);
    expect(collector.state).toBe('invalid');
    expect(collector.reason).toBe('br02-record-invalid');
  });

  it('keeps observer callbacks gated to running and drains active observers while bound', () => {
    const callbacks: Array<(list: any, observer: any, options?: any) => void> = [];
    class FakePerformanceObserver {
      static supportedEntryTypes = ['event', 'longtask'];
      readonly queue: any[] = [];
      constructor(callback: (list: any, observer: any, options?: any) => void) { callbacks.push(callback); }
      observe(): void {}
      takeRecords(): readonly any[] { const result = [...this.queue]; this.queue.length = 0; return result; }
      disconnect(): void {}
    }
    const dom = fakeDom();
    const collector = new BrowserTelemetryCollectorV1({
      bootstrap: envelope({ scenarioId: id('scheduler-steady-v1'), telemetryMode: 'telemetry-enabled-full' }),
      canvas: canvas(),
      environment: environment(dom, FakePerformanceObserver),
    });
    expect(collector.markReady()).toBe(true);
    expect(collector.startCurrentIteration()).toBe(true);
    callbacks[0]?.({ getEntries: () => [{ startTime: 40, duration: 50 }] }, {}, { droppedEntriesCount: 0 });
    callbacks[1]?.({ getEntries: () => [{ startTime: 41, duration: 2 }] }, {}, { droppedEntriesCount: 0 });
    expect(collector.completeCurrentIteration()).toBe(true);
    expect(collector.seal()).toBe(true);
    const records = collector.snapshot()!.records;
    expect(records.filter((record) => record.name === 'browser.long-task')).toHaveLength(1);
    expect(records.filter((record) => record.name === 'browser.event-timing')).toHaveLength(1);
    expect(collector.snapshot()!.loss.observerDrops).toEqual([
      { entryType: 'event', status: 'reported', droppedEntriesCount: 0 },
      { entryType: 'longtask', status: 'reported', droppedEntriesCount: 0 },
    ]);
    expect(collector.state).toBe('sealed');
  });

  it('seals one active observer accounting loss as one invalidation control', () => {
    class FakePerformanceObserver {
      static supportedEntryTypes = ['longtask'];
      constructor(_callback: (list: any, observer: any, options?: any) => void) {}
      observe(): void {}
      takeRecords(): readonly any[] { return []; }
      disconnect(): void {}
    }
    const dom = fakeDom();
    const collector = new BrowserTelemetryCollectorV1({
      bootstrap: envelope({ scenarioId: id('scheduler-steady-v1'), telemetryMode: 'telemetry-enabled-full' }),
      canvas: canvas(),
      environment: environment(dom, FakePerformanceObserver),
    });
    expect(collector.markReady()).toBe(true);
    expect(collector.startCurrentIteration()).toBe(true);
    expect(collector.completeCurrentIteration()).toBe(true);
    expect(collector.seal()).toBe(true);
    const exportValue = collector.snapshot()!;
    expect(collector.state).toBe('sealed');
    expect(exportValue.records.filter((record) => record.kind === 'control')).toHaveLength(1);
    expect(exportValue.loss.controlRecordCount).toBe(1);
    expect(exportValue.validity).toEqual({
      status: 'invalid',
      reasons: [{ code: 'infrastructure-failure', detail: 'br02-observer-drop-accounting-unavailable', phase: 'measurement' }],
    });
  });

  it('drains an unreachable Full long-task observer without invalidating or exporting a sample', () => {
    const callbacks: Array<(list: any, observer: any, options?: any) => void> = [];
    class FakePerformanceObserver {
      static supportedEntryTypes = ['longtask'];
      constructor(callback: (list: any, observer: any, options?: any) => void) { callbacks.push(callback); }
      observe(): void {}
      takeRecords(): readonly any[] { return []; }
      disconnect(): void {}
    }
    const dom = fakeDom();
    const collector = new BrowserTelemetryCollectorV1({
      bootstrap: envelope({ scenarioId: id('navigation-leak-v1'), phase: 'leak', backend: 'not-applicable', telemetryMode: 'telemetry-enabled-full' }),
      canvas: canvas(),
      environment: environment(dom, FakePerformanceObserver),
    });
    expect(collector.markReady()).toBe(true);
    expect(collector.startCurrentIteration()).toBe(true);
    callbacks[0]?.({ getEntries: () => [{ startTime: 40, duration: 50 }] }, {}, { droppedEntriesCount: 0 });
    expect(collector.completeCurrentIteration()).toBe(true);
    expect(collector.seal()).toBe(true);
    expect(collector.state).toBe('sealed');
    expect(collector.snapshot()!.records.filter((record) => record.name === 'browser.long-task')).toHaveLength(0);
    expect(collector.snapshot()!.validity).toEqual({ status: 'valid', reasons: [] });
  });

  it.each([
    ['longtask', 0],
    ['event', 1],
  ] as const)('fails closed on missing active %s observer drop accounting without exporting a numeric zero', (_entryType, callbackIndex) => {
    const callbacks: Array<(list: any, observer: any, options?: any) => void> = [];
    class FakePerformanceObserver {
      static supportedEntryTypes = ['longtask', 'event'];
      constructor(callback: (list: any, observer: any, options?: any) => void) { callbacks.push(callback); }
      observe(): void {}
      takeRecords(): readonly any[] { return []; }
      disconnect(): void {}
    }
    const dom = fakeDom();
    const collector = new BrowserTelemetryCollectorV1({
      bootstrap: envelope({ scenarioId: id('scheduler-steady-v1'), telemetryMode: 'telemetry-enabled-full' }),
      canvas: canvas(),
      environment: environment(dom, FakePerformanceObserver),
    });
    expect(collector.markReady()).toBe(true);
    expect(collector.startCurrentIteration()).toBe(true);
    callbacks[callbackIndex]?.({ getEntries: () => [] }, {});
    expect(collector.state).toBe('invalid');
    expect(collector.reason).toBe('br02-observer-drop-accounting-unavailable');
  });

  it.each([
    ['longtask', 0],
    ['event', 1],
  ] as const)('fails closed on a positive drop count for a full %s observer', (_entryType, callbackIndex) => {
    const callbacks: Array<(list: any, observer: any, options?: any) => void> = [];
    class FakePerformanceObserver {
      static supportedEntryTypes = ['longtask', 'event'];
      constructor(callback: (list: any, observer: any, options?: any) => void) { callbacks.push(callback); }
      observe(): void {}
      takeRecords(): readonly any[] { return []; }
      disconnect(): void {}
    }
    const dom = fakeDom();
    const collector = new BrowserTelemetryCollectorV1({
      bootstrap: envelope({ scenarioId: id('scheduler-steady-v1'), telemetryMode: 'telemetry-enabled-full' }),
      canvas: canvas(),
      environment: environment(dom, FakePerformanceObserver),
    });
    collector.markReady();
    collector.startCurrentIteration();
    callbacks[callbackIndex]?.({ getEntries: () => [{ startTime: 40, duration: 50 }] }, {}, { droppedEntriesCount: 1 });
    expect(collector.state).toBe('invalid');
    expect(collector.reason).toBe('br02-observer-drop');
  });

  it('drains pending observer queues while bound and discards them after completion before disconnect', () => {
    const callbacks: Array<(list: any, observer: any, options?: any) => void> = [];
    const observers: Array<{ readonly queue: any[]; takeCount: number; disconnected: boolean }> = [];
    class FakePerformanceObserver {
      static supportedEntryTypes = ['longtask', 'event'];
      readonly queue: any[] = [];
      takeCount = 0;
      disconnected = false;
      constructor(callback: (list: any, observer: any, options?: any) => void) { callbacks.push(callback); observers.push(this); }
      observe(): void {}
      takeRecords(): readonly any[] {
        this.takeCount += 1;
        const records = [...this.queue];
        this.queue.length = 0;
        return records;
      }
      disconnect(): void {
        expect(this.queue).toEqual([]);
        this.disconnected = true;
      }
    }
    const dom = fakeDom();
    const collector = new BrowserTelemetryCollectorV1({
      bootstrap: envelope({ telemetryMode: 'telemetry-enabled-full' }),
      canvas: canvas(),
      environment: environment(dom, FakePerformanceObserver),
    });
    const eventObserver = observers[1]!;
    collector.markReady();
    collector.startCurrentIteration();
    callbacks[0]?.({ getEntries: () => [] }, {}, { droppedEntriesCount: 0 });
    callbacks[1]?.({ getEntries: () => [] }, {}, { droppedEntriesCount: 0 });
    eventObserver.queue.push({ startTime: 40, duration: 2 });
    expect(collector.completeCurrentIteration()).toBe(true);
    eventObserver.queue.push({ startTime: 41, duration: 3 });
    expect(collector.seal()).toBe(true);
    expect(eventObserver.takeCount).toBeGreaterThanOrEqual(3);
    expect(eventObserver.disconnected).toBe(true);
    expect(collector.snapshot()!.records.filter((record) => record.name === 'browser.event-timing')).toHaveLength(1);
    expect(collector.snapshot()!.validity).toEqual({ status: 'valid', reasons: [] });
  });

  it('drains and processes active observer queues before latching disposal', () => {
    const callbacks: Array<(list: any, observer: any, options?: any) => void> = [];
    const observers: Array<{ readonly queue: any[]; takeCount: number; disconnectCount: number }> = [];
    const appendSpy = vi.spyOn(TelemetryBufferV1.prototype, 'append');
    let entryReads = 0;
    class FakePerformanceObserver {
      static supportedEntryTypes = ['longtask', 'event'];
      readonly queue: any[] = [];
      takeCount = 0;
      disconnectCount = 0;
      constructor(callback: (list: any, observer: any, options?: any) => void) { callbacks.push(callback); observers.push(this); }
      observe(): void {}
      takeRecords(): readonly any[] { this.takeCount += 1; const result = [...this.queue]; this.queue.length = 0; return result; }
      disconnect(): void { this.disconnectCount += 1; expect(this.queue).toEqual([]); }
    }
    try {
      const dom = fakeDom();
      const collector = new BrowserTelemetryCollectorV1({
        bootstrap: envelope({ telemetryMode: 'telemetry-enabled-full' }),
        canvas: canvas(),
        environment: environment(dom, FakePerformanceObserver),
      });
      collector.markReady();
      collector.startCurrentIteration();
      callbacks[0]?.({ getEntries: () => [] }, {}, { droppedEntriesCount: 0 });
      callbacks[1]?.({ getEntries: () => [] }, {}, { droppedEntriesCount: 0 });
      const eventObserver = observers[1]!;
      eventObserver.queue.push({
        get startTime() { entryReads += 1; return 40; },
        get duration() { entryReads += 1; return 2; },
      });

      collector.dispose();

      expect(entryReads).toBe(2);
      expect(observers.map((observer) => observer.takeCount)).toEqual([2, 2]);
      expect(appendSpy.mock.calls.some(([draft]) => draft.kind === 'diagnostic' && draft.name === 'browser.event-timing')).toBe(true);
      expect(eventObserver.disconnectCount).toBe(1);
      expect(observers[0]!.disconnectCount).toBe(1);
      expect(dom.removedDocumentListeners).toEqual(['visibilitychange']);
      expect(dom.removedWindowListeners).toEqual(['focus', 'blur']);
      expect(collector.snapshot()).toBeNull();
      expect(collector.canStartCurrentIteration).toBe(false);
      expect(collector.canCompleteCurrentIteration).toBe(false);
      expect(collector.canCompleteAndSealCurrentIteration).toBe(false);
      expect(collector.canAdvanceToNextIteration).toBe(false);
      expect(collector.canSeal).toBe(false);
      expect(collector.canExport).toBe(false);
      collector.dispose();
      expect(eventObserver.disconnectCount).toBe(1);
      expect(dom.removedDocumentListeners).toEqual(['visibilitychange']);
      expect(dom.removedWindowListeners).toEqual(['focus', 'blur']);
    } finally {
      appendSpy.mockRestore();
    }
  });

  it('fails closed and completes disposal when a queued getter and state callback throw', () => {
    const callbacks: Array<(list: any, observer: any, options?: any) => void> = [];
    const observers: Array<{ readonly queue: any[]; takeCount: number; disconnectCount: number }> = [];
    let collector: BrowserTelemetryCollectorV1 | null = null;
    let callbackCalls = 0;
    class FakePerformanceObserver {
      static supportedEntryTypes = ['longtask', 'event'];
      readonly queue: any[] = [];
      takeCount = 0;
      disconnectCount = 0;
      constructor(callback: (list: any, observer: any, options?: any) => void) { callbacks.push(callback); observers.push(this); }
      observe(): void {}
      takeRecords(): readonly any[] { this.takeCount += 1; const result = [...this.queue]; this.queue.length = 0; return result; }
      disconnect(): void { this.disconnectCount += 1; expect(this.queue).toEqual([]); }
    }
    collector = new BrowserTelemetryCollectorV1({
      bootstrap: envelope({ telemetryMode: 'telemetry-enabled-full' }),
      canvas: canvas(),
      environment: environment(fakeDom(), FakePerformanceObserver),
      onStateChange: (_state, reason) => {
        if (reason !== 'br02-record-invalid') return;
        callbackCalls += 1;
        collector?.dispose();
        throw new Error('state callback failed');
      },
    });
    collector.markReady();
    collector.startCurrentIteration();
    callbacks[0]?.({ getEntries: () => [] }, {}, { droppedEntriesCount: 0 });
    callbacks[1]?.({ getEntries: () => [] }, {}, { droppedEntriesCount: 0 });
    const eventObserver = observers[1]!;
    eventObserver.queue.push({
      get startTime() { throw new Error('entry getter failed'); },
      duration: 2,
    });

    expect(() => collector!.dispose()).not.toThrow();

    expect(callbackCalls).toBe(1);
    expect(collector.state).toBe('invalid');
    expect(collector.reason).toBe('br02-record-invalid');
    expect(observers.map((observer) => observer.takeCount)).toEqual([2, 2]);
    expect(observers.map((observer) => observer.disconnectCount)).toEqual([1, 1]);
    expect(collector.snapshot()).toBeNull();
    expect(collector.canStartCurrentIteration).toBe(false);
    expect(collector.canCompleteCurrentIteration).toBe(false);
    expect(collector.canCompleteAndSealCurrentIteration).toBe(false);
    expect(collector.canAdvanceToNextIteration).toBe(false);
    expect(collector.canSeal).toBe(false);
    expect(collector.canExport).toBe(false);
    expect(collector.startCurrentIteration()).toBe(false);
    expect(collector.completeCurrentIteration()).toBe(false);
    expect(collector.completeAndSealCurrentIteration()).toBe(false);
    expect(collector.advanceToNextIteration()).toBe(false);
    expect(collector.seal()).toBe(false);
    expect(collector.recordMeshQuads(1, 1)).toBe(false);
    collector.onAnimationFrame(26);
    collector.beforeDraw();
    collector.afterDraw();
    collector.dispose();
    expect(observers.map((observer) => observer.disconnectCount)).toEqual([1, 1]);
  });

  it('fails closed when takeRecords throws and still disconnects every observer once', () => {
    const observers: Array<{ takeCount: number; disconnectCount: number }> = [];
    class FakePerformanceObserver {
      static supportedEntryTypes = ['longtask', 'event'];
      takeCount = 0;
      disconnectCount = 0;
      constructor(_callback: (list: any, observer: any, options?: any) => void) { observers.push(this); }
      observe(): void {}
      takeRecords(): readonly any[] {
        this.takeCount += 1;
        if (this.takeCount === 2) throw new Error('takeRecords failed');
        return [];
      }
      disconnect(): void { this.disconnectCount += 1; }
    }
    const collector = new BrowserTelemetryCollectorV1({
      bootstrap: envelope({ telemetryMode: 'telemetry-enabled-full' }),
      canvas: canvas(),
      environment: environment(fakeDom(), FakePerformanceObserver),
    });
    collector.markReady();
    collector.startCurrentIteration();

    expect(() => collector.dispose()).not.toThrow();

    expect(observers.map((observer) => observer.takeCount)).toEqual([2, 2]);
    expect(observers.map((observer) => observer.disconnectCount)).toEqual([1, 1]);
    expect(collector.state).toBe('invalid');
    expect(collector.reason).toBe('br02-context-invalid');
    expect(collector.snapshot()).toBeNull();
    expect(collector.canCompleteCurrentIteration).toBe(false);
    collector.dispose();
    expect(observers.map((observer) => observer.disconnectCount)).toEqual([1, 1]);
  });

  it('fails closed when disconnect throws after disposal drain', () => {
    const observers: Array<{ takeCount: number; disconnectCount: number }> = [];
    class FakePerformanceObserver {
      static supportedEntryTypes = ['longtask', 'event'];
      takeCount = 0;
      disconnectCount = 0;
      constructor(_callback: (list: any, observer: any, options?: any) => void) { observers.push(this); }
      observe(): void {}
      takeRecords(): readonly any[] { this.takeCount += 1; return []; }
      disconnect(): void { this.disconnectCount += 1; throw new Error('disconnect failed'); }
    }
    const collector = new BrowserTelemetryCollectorV1({
      bootstrap: envelope({ telemetryMode: 'telemetry-enabled-full' }),
      canvas: canvas(),
      environment: environment(fakeDom(), FakePerformanceObserver),
    });
    collector.markReady();
    collector.startCurrentIteration();

    expect(() => collector.dispose()).not.toThrow();

    expect(observers.map((observer) => observer.takeCount)).toEqual([2, 2]);
    expect(observers.map((observer) => observer.disconnectCount)).toEqual([1, 1]);
    expect(collector.state).toBe('invalid');
    expect(collector.reason).toBe('br02-context-invalid');
    expect(collector.snapshot()).toBeNull();
    expect(collector.canCompleteCurrentIteration).toBe(false);
  });

  it('uses the existing invalid-record path for an invalid queued observer entry during disposal', () => {
    const callbacks: Array<(list: any, observer: any, options?: any) => void> = [];
    let queue: any[] = [];
    let disconnectCount = 0;
    class FakePerformanceObserver {
      static supportedEntryTypes = ['event'];
      constructor(callback: (list: any, observer: any, options?: any) => void) { callbacks.push(callback); }
      observe(): void {}
      takeRecords(): readonly any[] { const result = queue; queue = []; return result; }
      disconnect(): void { disconnectCount += 1; expect(queue).toEqual([]); }
    }
    const dom = fakeDom();
    const collector = new BrowserTelemetryCollectorV1({
      bootstrap: envelope({ telemetryMode: 'telemetry-enabled-full' }),
      canvas: canvas(),
      environment: environment(dom, FakePerformanceObserver),
    });
    collector.markReady();
    collector.startCurrentIteration();
    callbacks[0]?.({ getEntries: () => [] }, {}, { droppedEntriesCount: 0 });
    queue = [{ startTime: 40, duration: 0 }];

    collector.dispose();

    expect(collector.state).toBe('invalid');
    expect(collector.reason).toBe('br02-record-invalid');
    expect(disconnectCount).toBe(1);
    expect(collector.snapshot()).toBeNull();
  });

  it('blocks every collector action and marker path after running disposal', () => {
    const collector = new BrowserTelemetryCollectorV1({ bootstrap: envelope(), canvas: canvas(), environment: environment(fakeDom()) });
    collector.markReady();
    collector.startCurrentIteration();
    collector.onAnimationFrame(10);
    collector.beforeDraw();
    collector.dispose();

    expect(collector.markReady()).toBe(false);
    expect(collector.startCurrentIteration()).toBe(false);
    expect(collector.completeCurrentIteration()).toBe(false);
    expect(collector.completeAndSealCurrentIteration()).toBe(false);
    expect(collector.advanceToNextIteration()).toBe(false);
    expect(collector.seal()).toBe(false);
    expect(collector.recordMeshQuads(1, 1)).toBe(false);
    collector.onAnimationFrame(26);
    collector.beforeDraw();
    collector.afterDraw();
    expect(collector.scheduleExportDownload({
      document: { createElement: () => ({ click: () => {} } as unknown as HTMLAnchorElement) },
      url: { createObjectURL: () => 'blob:unused', revokeObjectURL: () => {} },
      setTimeout: () => 1,
    })).toBe(false);
    expect(collector.snapshot()).toBeNull();
  });

  it('blocks ready disposal actions without creating a snapshot', () => {
    const collector = new BrowserTelemetryCollectorV1({
      bootstrap: envelope({ iterations: [
        { iterationId: id('iteration-0'), iterationOrdinal: 0 },
        { iterationId: id('iteration-1'), iterationOrdinal: 1 },
      ] }),
      canvas: canvas(),
      environment: environment(fakeDom()),
    });
    collector.markReady();
    collector.startCurrentIteration();
    collector.completeCurrentIteration();
    collector.dispose();

    expect(collector.startCurrentIteration()).toBe(false);
    expect(collector.advanceToNextIteration()).toBe(false);
    expect(collector.seal()).toBe(false);
    expect(collector.snapshot()).toBeNull();
  });

  it('keeps a sealed snapshot and canonical bytes unchanged after idempotent disposal', () => {
    const dom = fakeDom();
    const collector = new BrowserTelemetryCollectorV1({ bootstrap: envelope(), canvas: canvas(), environment: environment(dom) });
    collector.markReady();
    collector.startCurrentIteration();
    collector.completeCurrentIteration();
    collector.seal();
    const snapshot = collector.snapshot();
    const beforeBytes = serializeSealedTelemetryExportV1(snapshot!);

    collector.dispose();
    const afterBytes = serializeSealedTelemetryExportV1(collector.snapshot()!);
    collector.dispose();

    expect(collector.snapshot()).toBe(snapshot);
    expect(afterBytes).toEqual(beforeBytes);
    expect(collector.canExport).toBe(false);
    expect(collector.scheduleExportDownload({
      document: { createElement: () => ({ click: () => {} } as unknown as HTMLAnchorElement) },
      url: { createObjectURL: () => 'blob:unused', revokeObjectURL: () => {} },
      setTimeout: () => 1,
    })).toBe(false);
    expect(dom.removedDocumentListeners).toEqual(['visibilitychange']);
    expect(dom.removedWindowListeners).toEqual(['focus', 'blur']);
  });

  it('does not deliver a queued download after disposal', () => {
    const collector = new BrowserTelemetryCollectorV1({ bootstrap: envelope(), canvas: canvas(), environment: environment(fakeDom()) });
    collector.markReady();
    collector.startCurrentIteration();
    collector.completeCurrentIteration();
    collector.seal();
    const snapshot = collector.snapshot();
    const tasks: Array<() => void> = [];
    let created = 0;
    let clicked = 0;
    expect(collector.scheduleExportDownload({
      document: { createElement: () => ({ click: () => { clicked += 1; } } as unknown as HTMLAnchorElement) },
      url: {
        createObjectURL: () => { created += 1; return 'blob:br02-disposed'; },
        revokeObjectURL: () => {},
      },
      setTimeout: (callback) => { tasks.push(callback); return tasks.length; },
    })).toBe(true);
    expect(tasks).toHaveLength(1);

    collector.dispose();
    tasks.shift()?.();

    expect(created).toBe(0);
    expect(clicked).toBe(0);
    expect(collector.snapshot()).toBe(snapshot);
    expect(serializeSealedTelemetryExportV1(collector.snapshot()!)).toEqual(serializeSealedTelemetryExportV1(snapshot!));
  });

  it.each([
    ['visibility', (dom: FakeDom) => { Object.defineProperty(dom.document, 'visibilityState', { value: 'hidden', configurable: true }); dom.fireDocument('visibilitychange'); }],
    ['focus', (dom: FakeDom) => { Object.defineProperty(dom.document, 'hasFocus', { value: () => false }); dom.fireWindow('blur'); }],
  ])('fails closed when the document becomes %s while running', (_label, mutate) => {
    const dom = fakeDom();
    const collector = new BrowserTelemetryCollectorV1({ bootstrap: envelope(), canvas: canvas(), environment: environment(dom) });
    collector.markReady();
    collector.startCurrentIteration();
    mutate(dom);
    expect(collector.state).toBe('invalid');
  });

  it('exposes capability availability without inventing unsupported samples', () => {
    const dom = fakeDom();
    const collector = new BrowserTelemetryCollectorV1({ bootstrap: envelope(), canvas: canvas(), environment: environment(dom) });
    collector.markReady();
    collector.startCurrentIteration();
    collector.completeCurrentIteration();
    collector.seal();
    const capabilities = collector.snapshot()!.capabilities;
    expect(capabilities.find((entry) => entry.id === 'webgl2')?.value).toMatchObject({ status: 'observed', value: true });
    expect(capabilities.find((entry) => entry.id === 'request-animation-frame')?.value).toMatchObject({ status: 'observed', value: true });
    expect(capabilities.every((entry) => entry.value.status !== 'observed' || entry.value.value === true)).toBe(true);
  });

  it('keeps context and device loss separate and terminal', () => {
    const dom = fakeDom();
    const first = new BrowserTelemetryCollectorV1({ bootstrap: envelope(), canvas: canvas(), environment: environment(dom) });
    first.markReady();
    first.onWebglContextLost();
    expect(first.state).toBe('invalid');
    expect(first.reason).toBe('br02-webgl-context-loss');
    const second = new BrowserTelemetryCollectorV1({ bootstrap: envelope(), canvas: canvas(), environment: environment(dom) });
    second.markReady();
    second.onWebgpuDeviceLost();
    expect(second.state).toBe('invalid');
    expect(second.reason).toBe('br02-webgpu-device-loss');
  });

  it('attributes renderer startup failure without recording context loss and preserves a sealed export', () => {
    const dom = fakeDom();
    const failed = new BrowserTelemetryCollectorV1({ bootstrap: envelope(), canvas: canvas(), environment: environment(dom) });
    failed.markRendererFailed();
    expect(failed.state).toBe('invalid');
    expect(failed.reason).toBe('renderer-failure');
    expect(failed.snapshot()).toBeNull();

    const sealed = new BrowserTelemetryCollectorV1({ bootstrap: envelope(), canvas: canvas(), environment: environment(dom) });
    sealed.markReady();
    sealed.startCurrentIteration();
    sealed.completeCurrentIteration();
    sealed.seal();
    const exportValue = sealed.snapshot();
    sealed.markRendererFailed();
    expect(sealed.state).toBe('sealed');
    expect(sealed.reason).toBe('none');
    expect(sealed.snapshot()).toBe(exportValue);
  });

  it('fails the complete frame operation once, preserves the original error, and does not schedule after a failed draw', () => {
    const renderError = new Error('render details must not be captured');
    const events: string[] = [];
    let failures = 0;
    let scheduled = 0;
    const runControlledFrame = (failure: Error, afterDraw: boolean): unknown => {
      try {
        events.push('raf', 'record', 'controls', 'before', 'render');
        if (afterDraw) events.push('after', 'hud');
        throw failure;
        // The real frame loop schedules only after this point.
        scheduled += 1;
      } catch (error) {
        try {
          rethrowRendererFailureV1(error, () => { failures += 1; });
        } catch (rethrow) {
          return rethrow;
        }
      }
      return undefined;
    };
    const renderCaught = runControlledFrame(renderError, false);
    expect(renderCaught).toBe(renderError);
    expect(events).toEqual(['raf', 'record', 'controls', 'before', 'render']);
    expect(failures).toBe(1);
    expect(scheduled).toBe(0);

    const phaseError = new TypeError('HUD details must not be captured');
    events.length = 0;
    const phaseCaught = runControlledFrame(phaseError, true);
    expect(phaseCaught).toBe(phaseError);
    expect(events).toEqual(['raf', 'record', 'controls', 'before', 'render', 'after', 'hud']);
    expect(failures).toBe(2);
    expect(scheduled).toBe(0);
  });

  it('uses the renderer-failure terminal path for collector state, markers, controls, and idempotent disposal', () => {
    const dom = fakeDom();
    const collector = new BrowserTelemetryCollectorV1({ bootstrap: envelope(), canvas: canvas(), environment: environment(dom) });
    collector.markReady();
    collector.startCurrentIteration();
    collector.onAnimationFrame(10);
    collector.beforeDraw();
    collector.onRendererFailure();

    expect(collector.state).toBe('invalid');
    expect(collector.reason).toBe('renderer-failure');
    expect(collector.canStartCurrentIteration).toBe(false);
    expect(collector.canCompleteCurrentIteration).toBe(false);
    expect(collector.canCompleteAndSealCurrentIteration).toBe(false);
    expect(collector.canAdvanceToNextIteration).toBe(false);
    expect(collector.canSeal).toBe(false);
    expect(collector.canExport).toBe(false);
    expect(collector.completeCurrentIteration()).toBe(false);
    expect(collector.completeAndSealCurrentIteration()).toBe(false);
    expect(collector.advanceToNextIteration()).toBe(false);
    expect(collector.seal()).toBe(false);
    expect(collector.scheduleExportDownload({
      document: { createElement: () => ({ click: () => {} } as unknown as HTMLAnchorElement) },
      url: { createObjectURL: () => 'blob:unused', revokeObjectURL: () => {} },
      setTimeout: () => 1,
    })).toBe(false);
    collector.afterDraw();
    expect(collector.snapshot()).toBeNull();
    collector.dispose();
    collector.dispose();
    expect(collector.markReady()).toBe(false);
  });

  it('seals immutable bytes and schedules real Blob/object-URL delivery outside the lifecycle call', () => {
    const dom = fakeDom();
    const collector = new BrowserTelemetryCollectorV1({ bootstrap: envelope(), canvas: canvas(), environment: environment(dom) });
    collector.markReady();
    collector.startCurrentIteration();
    collector.recordMeshQuads(12, 3);
    collector.completeCurrentIteration();
    collector.seal();
    const before = collector.snapshot();
    const tasks: Array<() => void> = [];
    let clicked = 0;
    const anchor = { href: '', download: '', click: () => { clicked += 1; } };
    let revoked = 0;
    expect(collector.scheduleExportDownload({
      document: { createElement: () => anchor as unknown as HTMLAnchorElement },
      url: { createObjectURL: () => 'blob:br02', revokeObjectURL: () => { revoked += 1; } },
      setTimeout: (callback) => { tasks.push(callback); return tasks.length; },
    })).toBe(true);
    expect(collector.canExport).toBe(false);
    expect(collector.scheduleExportDownload({
      document: { createElement: () => anchor as unknown as HTMLAnchorElement },
      url: { createObjectURL: () => 'blob:br02', revokeObjectURL: () => { revoked += 1; } },
      setTimeout: (callback) => { tasks.push(callback); return tasks.length; },
    })).toBe(false);
    expect(clicked).toBe(0);
    tasks.shift()?.();
    expect(clicked).toBe(1);
    expect(collector.canExport).toBe(false);
    tasks.shift()?.();
    expect(revoked).toBe(1);
    expect(collector.snapshot()).toEqual(before);
    expect(collector.snapshot()?.records.some((record) => Object.keys(record).some((key) => /target|url|text|path|stack/i.test(key)))).toBe(false);
  });

  it('latches a failed download attempt, revokes its URL, and preserves sealed state and payload', () => {
    const dom = fakeDom();
    const collector = new BrowserTelemetryCollectorV1({ bootstrap: envelope(), canvas: canvas(), environment: environment(dom) });
    collector.markReady();
    collector.startCurrentIteration();
    collector.completeCurrentIteration();
    collector.seal();
    const before = collector.snapshot();
    const tasks: Array<() => void> = [];
    let revoked = 0;
    const anchor = { href: '', download: '', click: () => { throw new TypeError('click failed'); } };
    const downloadEnvironment = {
      document: { createElement: () => anchor as unknown as HTMLAnchorElement },
      url: {
        createObjectURL: () => 'blob:br02-failed',
        revokeObjectURL: () => { revoked += 1; },
      },
      setTimeout: (callback: () => void) => { tasks.push(callback); return tasks.length; },
    };
    expect(collector.scheduleExportDownload(downloadEnvironment)).toBe(true);
    expect(collector.canExport).toBe(false);
    expect(collector.scheduleExportDownload(downloadEnvironment)).toBe(false);
    tasks.shift()?.();
    expect(revoked).toBe(1);
    expect(collector.state).toBe('sealed');
    expect(collector.reason).toBe('download-failed');
    expect(collector.snapshot()).toBe(before);
  });

  it('swallows asynchronous URL revoke failures without changing the sealed payload', () => {
    const dom = fakeDom();
    const collector = new BrowserTelemetryCollectorV1({ bootstrap: envelope(), canvas: canvas(), environment: environment(dom) });
    collector.markReady();
    collector.startCurrentIteration();
    collector.completeCurrentIteration();
    collector.seal();
    const before = collector.snapshot();
    const tasks: Array<() => void> = [];
    const downloadEnvironment = {
      document: { createElement: () => ({ href: '', download: '', click: () => {} } as unknown as HTMLAnchorElement) },
      url: {
        createObjectURL: () => 'blob:br02-revoke-fails',
        revokeObjectURL: () => { throw new TypeError('revoke failed'); },
      },
      setTimeout: (callback: () => void) => { tasks.push(callback); return tasks.length; },
    };
    expect(collector.scheduleExportDownload(downloadEnvironment)).toBe(true);
    tasks.shift()?.();
    expect(() => tasks.shift()?.()).not.toThrow();
    expect(collector.state).toBe('sealed');
    expect(collector.reason).toBe('none');
    expect(collector.snapshot()).toBe(before);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { BenchmarkBackendCellV1, BenchmarkSamplePhaseV1, CanonicalIdV1 } from '../../../../src/benchmark/contracts/browserV1';
import {
  BR02_BROWSER_HANDOFF_CONTRACT_ID,
  BR02_BROWSER_HANDOFF_SCHEMA_VERSION,
  BR02_BROWSER_RUNTIME_ACTIVATION,
  BrowserTelemetryHandoffV1,
  decodeBrowserTelemetryHandoffV1,
  encodeBrowserTelemetryHandoffV1,
  readBrowserTelemetryBootstrapV1,
  validateBrowserTelemetryHandoffEnvelopeV1,
  type BrowserTelemetryHandoffEnvelopeV1,
} from '../../../../src/diagnostics/telemetry/browserHandoffV1';

const id = (value: string): CanonicalIdV1 => value as CanonicalIdV1;

const baseEnvelope = (): BrowserTelemetryHandoffEnvelopeV1 => ({
  schemaVersion: BR02_BROWSER_HANDOFF_SCHEMA_VERSION,
  contractId: BR02_BROWSER_HANDOFF_CONTRACT_ID,
  runtimeActivation: BR02_BROWSER_RUNTIME_ACTIVATION,
  runId: id('run'),
  planId: id('plan'),
  scenarioId: id('backend-fixture-v1'),
  phase: 'measurement',
  backend: 'three-webgl2',
  telemetryMode: 'telemetry-enabled-minimal',
  iterations: [
    { iterationId: id('iteration-0'), iterationOrdinal: 0 },
    { iterationId: id('iteration-1'), iterationOrdinal: 1 },
  ],
});

function base64UrlUtf8(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  parentElement: FakeElement | null = null;
  textContent = '';
  disabled = false;
  className = '';
  readonly listeners = new Map<string, (...args: any[]) => void>();
  readonly tagName: string;

  public constructor(tagName: string) {
    this.tagName = tagName;
  }

  public setAttribute(_name: string, _value: string): void {}

  public append(...children: (FakeElement | string)[]): void {
    for (const child of children) {
      if (typeof child !== 'string') {
        child.parentElement = this;
        this.children.push(child);
      }
    }
  }

  public insertBefore(child: FakeElement, before: FakeElement): void {
    child.parentElement = this;
    const index = this.children.indexOf(before);
    this.children.splice(index < 0 ? this.children.length : index, 0, child);
  }

  public addEventListener(type: string, listener: (...args: any[]) => void): void { this.listeners.set(type, listener); }

  public click(): void { this.listeners.get('click')?.(new Event('click')); }

  public querySelector<T extends FakeElement>(selector: string): T | null {
    const testId = selector.match(/\[data-testid="([^"]+)"\]/)?.[1];
    for (const child of this.children) {
      if ((testId !== undefined && child.dataset.testid === testId) || (testId === undefined && selector === child.tagName)) return child as T;
      const nested = child.querySelector<T>(selector);
      if (nested !== null) return nested;
    }
    return null;
  }
}

function handoffRoot(): FakeElement {
  const root = new FakeElement('main');
  const hud = new FakeElement('div');
  hud.dataset.testid = 'voxel-hud';
  hud.append(new FakeElement('dl'));
  const canvas = new FakeElement('canvas') as FakeElement & { getContext: () => { getExtension: () => null } };
  canvas.dataset.testid = 'voxel-canvas';
  canvas.getContext = () => ({ getExtension: () => null });
  root.append(hud, canvas);
  return root;
}

function handoffEnvironment(performance = { timeOrigin: 1000, now: () => 0 }): {
  readonly document: Record<string, unknown>;
  readonly window: Record<string, unknown>;
} {
  const listeners = new Map<string, (...args: any[]) => void>();
  return {
    document: {
      visibilityState: 'visible',
      hasFocus: () => true,
      addEventListener: (type: string, listener: (...args: any[]) => void) => { listeners.set(type, listener); },
      removeEventListener: (type: string) => { listeners.delete(type); },
    },
    window: {
      requestAnimationFrame: () => 1,
      Worker: function Worker() {},
      addEventListener: (type: string, listener: (...args: any[]) => void) => { listeners.set(type, listener); },
      removeEventListener: (type: string) => { listeners.delete(type); },
      location: { search: `?br02Telemetry=${encodeBrowserTelemetryHandoffV1(baseEnvelope())}` },
      setTimeout: () => 1,
      performance,
    },
  };
}

describe('BR02 browser handoff v1', () => {
  it('round-trips the canonical closed envelope and accepts one query value', () => {
    const envelope = baseEnvelope();
    const encoded = encodeBrowserTelemetryHandoffV1(envelope);
    expect(decodeBrowserTelemetryHandoffV1(encoded)).toEqual(envelope);
    expect(readBrowserTelemetryBootstrapV1(`?br02Telemetry=${encoded}`)).toEqual({ kind: 'enabled', envelope });
    expect(readBrowserTelemetryBootstrapV1('')).toEqual({ kind: 'disabled' });
  });

  it.each([
    ['duplicate query', (encoded: string) => `?br02Telemetry=${encoded}&br02Telemetry=${encoded}`],
    ['padding', (encoded: string) => `?br02Telemetry=${encoded}=`],
    ['plus alphabet', () => '?br02Telemetry=+w'],
    ['slash alphabet', () => '?br02Telemetry=/w'],
    ['invalid length', () => '?br02Telemetry=a'],
  ])('fails closed for %s', (_label, makeSearch) => {
    const encoded = encodeBrowserTelemetryHandoffV1(baseEnvelope());
    expect(readBrowserTelemetryBootstrapV1(makeSearch(encoded))).toEqual({ kind: 'invalid' });
  });

  it('rejects noncanonical JSON and duplicate object keys before the envelope validator', () => {
    const whitespace = base64UrlUtf8(` {"backend":"three-webgl2","contractId":"${BR02_BROWSER_HANDOFF_CONTRACT_ID}","iterations":[],"phase":"measurement","planId":"plan","runId":"run","runtimeActivation":"${BR02_BROWSER_RUNTIME_ACTIVATION}","scenarioId":"backend-fixture-v1","schemaVersion":1,"telemetryMode":"telemetry-enabled-minimal"} `);
    expect(() => decodeBrowserTelemetryHandoffV1(whitespace)).toThrow();
    const duplicate = base64UrlUtf8('{"backend":"three-webgl2","backend":"three-webgl2"}');
    expect(() => decodeBrowserTelemetryHandoffV1(duplicate)).toThrow();
  });

  it.each([
    ['wrong version', (value: any) => { value.schemaVersion = 2; }],
    ['unknown key', (value: any) => { value.extra = true; }],
    ['wrong activation', (value: any) => { value.runtimeActivation = 'other'; }],
    ['noncanonical ID', (value: any) => { value.runId = 'RUN'; }],
    ['wrong phase', (value: any) => { value.phase = 'stress'; }],
    ['raw WebGPU backend', (value: any) => { value.backend = 'raw-webgpu'; }],
    ['wrong backend for a non-backend scenario', (value: any) => { value.scenarioId = 'navigation-leak-v1'; value.phase = 'leak'; value.backend = 'three-webgl2'; }],
    ['duplicate iteration ID', (value: any) => { value.iterations[1].iterationId = value.iterations[0].iterationId; }],
    ['ordinal gap', (value: any) => { value.iterations[1].iterationOrdinal = 2; }],
  ])('dedicated validation rejects %s', (_label, mutate) => {
    const value = structuredClone(baseEnvelope()) as any;
    mutate(value);
    expect(validateBrowserTelemetryHandoffEnvelopeV1(value).valid).toBe(false);
  });

  it('rejects more than the bounded iteration metadata before collector construction', () => {
    const value = baseEnvelope() as any;
    value.iterations = Array.from({ length: 256 }, (_, iterationOrdinal) => ({
      iterationId: `iteration-${iterationOrdinal}`,
      iterationOrdinal,
    }));
    expect(validateBrowserTelemetryHandoffEnvelopeV1(value).valid).toBe(true);
    value.iterations.push({ iterationId: 'iteration-256', iterationOrdinal: 256 });
    expect(validateBrowserTelemetryHandoffEnvelopeV1(value).valid).toBe(false);
    value.iterations = [];
    expect(validateBrowserTelemetryHandoffEnvelopeV1(value).valid).toBe(false);
  });

  it('enforces the encoded transport bound before decoding', () => {
    expect(readBrowserTelemetryBootstrapV1(`?br02Telemetry=${'A'.repeat(65_537)}`)).toEqual({ kind: 'invalid' });
  });

  it('keeps BR01 phase/backend domains typed at the handoff boundary', () => {
    const envelope = baseEnvelope();
    const phase: BenchmarkSamplePhaseV1 = envelope.phase;
    const backend: BenchmarkBackendCellV1 = envelope.backend;
    expect(phase).toBe('measurement');
    expect(backend).toBe('three-webgl2');
  });

  it('renders the validated current iteration ID and ordinal while keeping status fixed', () => {
    const root = handoffRoot();
    const environment = handoffEnvironment();
    const handoff = new BrowserTelemetryHandoffV1(root as unknown as HTMLElement, {
      document: {
        createElement: (tag: string) => new FakeElement(tag),
      } as unknown as Document,
      window: environment.window as unknown as Window,
      collectorEnvironment: {
        document: environment.document as any,
        window: environment.window as any,
        performance: environment.window.performance as { timeOrigin: number; now(): number },
      },
    });
    expect(root.querySelector<FakeElement>('[data-testid="telemetry-current-iteration"]')?.textContent).toBe('id=iteration-0; ordinal=0');
    expect(root.querySelector<FakeElement>('[data-testid="telemetry-contract-status"]')?.textContent).toContain('contract=br-02-browser-telemetry-handoff-v1; version=1; state=initializing; reason=none');
    expect(handoff.markRendererReady()).toBe(true);
    expect(handoff.collector?.startCurrentIteration()).toBe(true);
    expect(handoff.collector?.completeCurrentIteration()).toBe(true);
    expect(handoff.collector?.advanceToNextIteration()).toBe(true);
    expect(root.querySelector<FakeElement>('[data-testid="telemetry-current-iteration"]')?.textContent).toBe('id=iteration-1; ordinal=1');
  });

  it('disables every existing control and ignores clicks after handoff disposal', () => {
    const root = handoffRoot();
    const environment = handoffEnvironment();
    const handoff = new BrowserTelemetryHandoffV1(root as unknown as HTMLElement, {
      document: { createElement: (tag: string) => new FakeElement(tag) } as unknown as Document,
      window: environment.window as unknown as Window,
      collectorEnvironment: {
        document: environment.document as any,
        window: environment.window as any,
        performance: environment.window.performance as { timeOrigin: number; now(): number },
      },
    });
    expect(handoff.markRendererReady()).toBe(true);
    expect(handoff.collector?.startCurrentIteration()).toBe(true);
    const collector = handoff.collector!;

    handoff.dispose();

    const controls = [
      'telemetry-start-current-iteration',
      'telemetry-complete-current-iteration',
      'telemetry-advance-next-iteration',
      'telemetry-seal',
      'telemetry-export',
    ];
    for (const testId of controls) {
      const button = root.querySelector<FakeElement>(`[data-testid="${testId}"]`)!;
      expect(button.disabled).toBe(true);
      button.click();
    }
    expect(collector.state).toBe('running');
    expect(collector.snapshot()).toBeNull();
    expect(collector.canExport).toBe(false);
    handoff.dispose();
    expect(collector.snapshot()).toBeNull();
  });

  it('reprojects controls in finally when collector disposal throws', () => {
    const root = handoffRoot();
    const environment = handoffEnvironment();
    const handoff = new BrowserTelemetryHandoffV1(root as unknown as HTMLElement, {
      document: { createElement: (tag: string) => new FakeElement(tag) } as unknown as Document,
      window: environment.window as unknown as Window,
      collectorEnvironment: {
        document: environment.document as any,
        window: environment.window as any,
        performance: environment.window.performance as { timeOrigin: number; now(): number },
      },
    });
    expect(handoff.markRendererReady()).toBe(true);
    const collector = handoff.collector!;
    const start = root.querySelector<FakeElement>('[data-testid="telemetry-start-current-iteration"]')!;
    expect(start.disabled).toBe(false);
    const canStart = vi.spyOn(collector, 'canStartCurrentIteration', 'get');
    const dispose = vi.spyOn(collector, 'dispose').mockImplementation(() => {
      canStart.mockReturnValue(false);
      throw new Error('dispose failed');
    });

    try {
      expect(() => handoff.dispose()).toThrow('dispose failed');
      expect(start.disabled).toBe(true);
      for (const testId of [
        'telemetry-start-current-iteration',
        'telemetry-complete-current-iteration',
        'telemetry-advance-next-iteration',
        'telemetry-seal',
        'telemetry-export',
      ]) {
        expect(root.querySelector<FakeElement>(`[data-testid="${testId}"]`)?.disabled).toBe(true);
      }
    } finally {
      dispose.mockRestore();
      canStart.mockRestore();
    }
  });

  it('attributes renderer failure without context loss, preserves sealed state, and uses fixed initialization failure', () => {
    const root = handoffRoot();
    const environment = handoffEnvironment();
    const handoff = new BrowserTelemetryHandoffV1(root as unknown as HTMLElement, {
      document: { createElement: (tag: string) => new FakeElement(tag) } as unknown as Document,
      window: environment.window as unknown as Window,
      collectorEnvironment: {
        document: environment.document as any,
        window: environment.window as any,
        performance: environment.window.performance as { timeOrigin: number; now(): number },
      },
    });
    expect(handoff.markRendererReady()).toBe(true);
    handoff.markRendererFailed();
    expect(handoff.state).toBe('invalid');
    expect(handoff.reason).toBe('renderer-failure');
    expect(handoff.collector?.reason).toBe('renderer-failure');
    for (const testId of [
      'telemetry-start-current-iteration',
      'telemetry-complete-current-iteration',
      'telemetry-advance-next-iteration',
      'telemetry-seal',
      'telemetry-export',
    ]) {
      expect(root.querySelector<FakeElement>(`[data-testid="${testId}"]`)?.disabled).toBe(true);
    }
    const statusText = root.querySelector<FakeElement>('[data-testid="telemetry-contract-status"]')?.textContent;
    expect(statusText).toBe('contract=br-02-browser-telemetry-handoff-v1; version=1; state=invalid; reason=renderer-failure');
    expect(statusText).not.toContain('render details must not be captured');

    const sealedRoot = handoffRoot();
    const sealedEnvironment = handoffEnvironment();
    const sealedHandoff = new BrowserTelemetryHandoffV1(sealedRoot as unknown as HTMLElement, {
      document: { createElement: (tag: string) => new FakeElement(tag) } as unknown as Document,
      window: sealedEnvironment.window as unknown as Window,
      collectorEnvironment: {
        document: sealedEnvironment.document as any,
        window: sealedEnvironment.window as any,
        performance: sealedEnvironment.window.performance as { timeOrigin: number; now(): number },
      },
    });
    sealedHandoff.markRendererReady();
    sealedHandoff.collector?.startCurrentIteration();
    sealedHandoff.collector?.completeCurrentIteration();
    sealedHandoff.collector?.advanceToNextIteration();
    sealedHandoff.collector?.startCurrentIteration();
    sealedHandoff.collector?.completeAndSealCurrentIteration();
    const sealedExport = sealedHandoff.collector?.snapshot();
    sealedHandoff.markRendererFailed();
    expect(sealedHandoff.state).toBe('sealed');
    expect(sealedHandoff.collector?.snapshot()).toBe(sealedExport);

    const failedRoot = handoffRoot();
    const failedEnvironment = handoffEnvironment({ timeOrigin: Number.NaN, now: () => 0 });
    const failedHandoff = new BrowserTelemetryHandoffV1(failedRoot as unknown as HTMLElement, {
      document: { createElement: (tag: string) => new FakeElement(tag) } as unknown as Document,
      window: failedEnvironment.window as unknown as Window,
      collectorEnvironment: {
        document: failedEnvironment.document as any,
        window: failedEnvironment.window as any,
        performance: failedEnvironment.window.performance as { timeOrigin: number; now(): number },
      },
    });
    expect(failedHandoff.state).toBe('invalid');
    expect(failedHandoff.reason).toBe('initialization-failed');
  });
});

import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import type { Download, Page } from '@playwright/test';
import type { CapabilityAvailabilityV1, CanonicalIdV1 } from '../../../../src/benchmark/contracts/browserV1';
import { createTelemetryBufferV1 } from '../../../../src/diagnostics/telemetry/bufferV1';
import {
  BR02_BROWSER_HANDOFF_CONTRACT_ID,
  BR02_BROWSER_HANDOFF_SCHEMA_VERSION,
  BR02_BROWSER_RUNTIME_ACTIVATION,
  type BrowserTelemetryHandoffEnvelopeV1,
} from '../../../../src/diagnostics/telemetry/browserHandoffV1';
import { serializeSealedTelemetryExportV1 } from '../../../../src/diagnostics/telemetry/contractV1';
import {
  parseBr02ContractStatusV1,
  runBr02HandoffV1,
  validateDownloadedTelemetryV1,
} from '../../../../src/benchmark/runner/browser/br02HandoffDriverV1';

const id = (value: string): CanonicalIdV1 => value as CanonicalIdV1;
const envelope = (): BrowserTelemetryHandoffEnvelopeV1 => ({
  schemaVersion: BR02_BROWSER_HANDOFF_SCHEMA_VERSION,
  contractId: BR02_BROWSER_HANDOFF_CONTRACT_ID,
  runtimeActivation: BR02_BROWSER_RUNTIME_ACTIVATION,
  runId: id('run'),
  planId: id('plan'),
  scenarioId: id('backend-fixture-v1'),
  phase: 'measurement',
  backend: 'three-webgl2',
  telemetryMode: 'telemetry-enabled-minimal',
  iterations: [{ iterationId: id('iteration-0'), iterationOrdinal: 0 }],
});

const capabilities = [
  'performance-time-origin', 'request-animation-frame', 'webgl-disjoint-timer-query',
  'webgl2', 'webgpu', 'webgpu-timestamp-query',
].map((capabilityId): { readonly id: CanonicalIdV1; readonly value: CapabilityAvailabilityV1 } => ({
  id: id(capabilityId),
  value: { status: 'declared', value: true, sourceRef: id('plan'), stability: 'run-config' },
}));

function rawExport(): Uint8Array {
  const expected = envelope();
  const buffer = createTelemetryBufferV1({
    runId: expected.runId,
    planId: expected.planId,
    scenarioId: expected.scenarioId,
    phase: expected.phase,
    backend: expected.backend,
    telemetryMode: expected.telemetryMode,
    iterations: expected.iterations,
    realms: [{ realmId: id('main'), realm: 'main', timeOriginEpochMs: 1000 }],
    capabilities,
  });
  return serializeSealedTelemetryExportV1(buffer.seal());
}

async function observedHandoffFailure(
  trigger?: (listeners: Map<string, (...args: never[]) => void>, contextListeners: Map<string, (...args: never[]) => void>, browserListeners: Map<string, (...args: never[]) => void>) => void,
  status = 'contract=br-02-browser-telemetry-handoff-v1; version=1; state=ready; reason=none',
): Promise<string | undefined> {
  const listeners = new Map<string, (...args: never[]) => void>();
  const contextListeners = new Map<string, (...args: never[]) => void>();
  const browserListeners = new Map<string, (...args: never[]) => void>();
  const browser = { on: (event: string, listener: (...args: never[]) => void) => browserListeners.set(event, listener), off: (event: string) => browserListeners.delete(event) };
  const context = { browser: () => browser, on: (event: string, listener: (...args: never[]) => void) => contextListeners.set(event, listener), off: (event: string) => contextListeners.delete(event) };
  const pending = new Promise<void>(() => undefined);
  const page = {
    context: () => context,
    on: (event: string, listener: (...args: never[]) => void) => listeners.set(event, listener),
    off: (event: string) => listeners.delete(event),
    exposeBinding: async () => undefined,
    addInitScript: async () => undefined,
    goto: async () => { trigger?.(listeners, contextListeners, browserListeners); },
    locator: () => ({ waitFor: async () => status.includes('state=ready') ? pending : undefined }),
    getByTestId: (testId: string) => ({
      waitFor: async () => undefined,
      textContent: async () => testId === 'telemetry-contract-status' ? status : 'id=iteration-0; ordinal=0',
      click: async () => undefined,
    }),
    evaluate: async () => undefined,
  } as unknown as Page;
  try {
    await runBr02HandoffV1(page, 'http://127.0.0.1:43210', '/', envelope());
  } catch (error) {
    return error instanceof Error && 'code' in error ? String(error.code) : undefined;
  }
  return undefined;
}

describe('BR03 BR02 handoff driver v1', () => {
  it('parses only the exact BR02 status grammar', () => {
    expect(parseBr02ContractStatusV1('contract=br-02-browser-telemetry-handoff-v1; version=1; state=ready; reason=none'))
      .toEqual({ state: 'ready', reason: 'none' });
    expect(() => parseBr02ContractStatusV1('state=ready')).toThrow(/status-mismatch/);
  });

  it('accepts only canonical BR02 bytes with exact envelope bindings', () => {
    const rawBytes = rawExport();
    expect(validateDownloadedTelemetryV1(rawBytes, envelope()).runId).toBe('run');
    expect(() => validateDownloadedTelemetryV1(
      new TextEncoder().encode(` ${new TextDecoder().decode(rawBytes)}`),
      envelope(),
    )).toThrow(/telemetry-noncanonical/);
    expect(() => validateDownloadedTelemetryV1(rawBytes, { ...envelope(), runId: id('other-run') }))
      .toThrow(/telemetry-binding-mismatch/);
  });

  it('retains HTTP 204, external success, popup, page close, browser disconnect, and context loss as distinct failures', async () => {
    const cases: readonly [string, Parameters<typeof observedHandoffFailure>[0]][] = [
      ['http-error', (listeners) => listeners.get('response')?.({ status: () => 204, url: () => 'http://127.0.0.1:43210/no-content' } as never)],
      ['unexpected-external-origin', (listeners) => listeners.get('response')?.({ status: () => 200, url: () => 'https://example.invalid/resource' } as never)],
      ['unexpected-external-origin', (listeners) => listeners.get('response')?.({ status: () => 204, url: () => 'https://example.invalid/no-content' } as never)],
      ['popup-opened', (listeners) => listeners.get('popup')?.()],
      ['page-closed', (listeners) => listeners.get('close')?.()],
      ['browser-disconnected', (_listeners, _context, browser) => browser.get('disconnected')?.()],
      ['context-lost', (_listeners, context) => context.get('close')?.()],
    ];
    for (const [code, trigger] of cases) expect(await observedHandoffFailure(trigger)).toBe(code);
  });

  it('lets an explicit invalid BR02 terminal state win without a generic timeout', async () => {
    expect(await observedHandoffFailure(undefined, 'contract=br-02-browser-telemetry-handoff-v1; version=1; state=invalid; reason=runtime-error')).toBe('telemetry-terminal-invalid');
  });

  it('retains a delayed duplicate download until owned Handoff observation completes', async () => {
    const listeners = new Map<string, (...args: never[]) => void>();
    const contextListeners = new Map<string, (...args: never[]) => void>();
    const browserListeners = new Map<string, (...args: never[]) => void>();
    const browser = { on: (event: string, listener: (...args: never[]) => void) => browserListeners.set(event, listener), off: (event: string) => browserListeners.delete(event) };
    const context = { browser: () => browser, on: (event: string, listener: (...args: never[]) => void) => contextListeners.set(event, listener), off: (event: string) => contextListeners.delete(event) };
    const bytes = rawExport();
    const download = { suggestedFilename: () => 'br02-telemetry-export-v1.json', failure: async () => null, createReadStream: async () => Readable.from([Buffer.from(bytes)]) } as unknown as Download;
    let state: 'ready' | 'running' | 'sealed' = 'ready';
    let resolveDownload: ((value: Download) => void) | undefined;
    const page = {
      context: () => context,
      on: (event: string, listener: (...args: never[]) => void) => listeners.set(event, listener),
      off: (event: string) => listeners.delete(event),
      exposeBinding: async () => undefined,
      addInitScript: async () => undefined,
      goto: async () => undefined,
      locator: () => ({ waitFor: async () => undefined }),
      getByTestId: (testId: string) => ({
        waitFor: async () => undefined,
        textContent: async () => testId === 'telemetry-contract-status'
          ? `contract=br-02-browser-telemetry-handoff-v1; version=1; state=${state}; reason=none`
          : 'id=iteration-0; ordinal=0',
        click: async () => {
          if (testId === 'telemetry-start-current-iteration') state = 'running';
          else if (testId === 'telemetry-complete-current-iteration') state = 'sealed';
          else if (testId === 'telemetry-export') {
            listeners.get('download')?.(download as never);
            resolveDownload?.(download);
          }
        },
      }),
      evaluate: async () => undefined,
      waitForEvent: async () => new Promise<Download>((resolve) => { resolveDownload = resolve; }),
    } as unknown as Page;
    const result = await runBr02HandoffV1(page, 'http://127.0.0.1:43210', '/', envelope());
    listeners.get('download')?.(download as never);
    expect(() => result.completeObservation()).toThrow(/download-duplicate/);
  });
});

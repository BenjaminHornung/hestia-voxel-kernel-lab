import type { ConsoleMessage, Download, Page, Request, Response } from '@playwright/test';
import {
  BR02_BROWSER_HANDOFF_CONTRACT_ID,
  BR02_BROWSER_HANDOFF_QUERY_KEY,
  BR02_BROWSER_HANDOFF_SCHEMA_VERSION,
  encodeBrowserTelemetryHandoffV1,
  type BrowserTelemetryHandoffEnvelopeV1,
} from '../../../diagnostics/telemetry/browserHandoffV1';
import {
  TELEMETRY_LIMITS_V1,
  serializeSealedTelemetryExportV1,
  validateTelemetryExportV1,
  type Br02TelemetryExportV1,
} from '../../../diagnostics/telemetry/contractV1';
import type { Br02HandoffFailureCodeV1 } from '../contractsV1';

export type { Br02HandoffFailureCodeV1 } from '../contractsV1';

export class Br02HandoffDriverErrorV1 extends Error {
  public constructor(public readonly code: Br02HandoffFailureCodeV1, options?: ErrorOptions) {
    super(`BR03 browser handoff failed: ${code}.`, options);
    this.name = 'Br02HandoffDriverErrorV1';
  }
}

export interface Br02HandoffResultV1 {
  readonly rawBytes: Uint8Array;
  readonly telemetryExport: Br02TelemetryExportV1;
  completeObservation(): void;
}

interface ParsedStatusV1 {
  readonly state: 'initializing' | 'ready' | 'running' | 'sealed' | 'invalid' | 'disabled';
  readonly reason: string;
}

const STATUS_PATTERN = new RegExp(
  `^contract=${BR02_BROWSER_HANDOFF_CONTRACT_ID}; version=${BR02_BROWSER_HANDOFF_SCHEMA_VERSION}; state=(initializing|ready|running|sealed|invalid|disabled); reason=([a-z0-9-]+)$`,
);

export function parseBr02ContractStatusV1(value: string): ParsedStatusV1 {
  const match = STATUS_PATTERN.exec(value);
  if (match === null) throw new Br02HandoffDriverErrorV1('status-mismatch');
  return { state: match[1] as ParsedStatusV1['state'], reason: match[2]! };
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function assertEnvelopeBinding(telemetryExport: Br02TelemetryExportV1, envelope: BrowserTelemetryHandoffEnvelopeV1): void {
  if (telemetryExport.runId !== envelope.runId
    || telemetryExport.planId !== envelope.planId
    || telemetryExport.scenarioId !== envelope.scenarioId
    || telemetryExport.phase !== envelope.phase
    || telemetryExport.backend !== envelope.backend
    || telemetryExport.telemetryMode !== envelope.telemetryMode
    || telemetryExport.iterations.length !== envelope.iterations.length
    || telemetryExport.iterations.some((iteration, index) => {
      const expected = envelope.iterations[index];
      return expected === undefined
        || iteration.iterationId !== expected.iterationId
        || iteration.iterationOrdinal !== expected.iterationOrdinal;
    })) {
    throw new Br02HandoffDriverErrorV1('telemetry-binding-mismatch');
  }
}

export function validateDownloadedTelemetryV1(
  rawBytes: Uint8Array,
  envelope: BrowserTelemetryHandoffEnvelopeV1,
): Br02TelemetryExportV1 {
  if (rawBytes.byteLength === 0 || rawBytes.byteLength > TELEMETRY_LIMITS_V1.maxCanonicalExportBytes) {
    throw new Br02HandoffDriverErrorV1('download-size-invalid');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBytes));
  } catch (error) {
    throw new Br02HandoffDriverErrorV1('telemetry-invalid', { cause: error });
  }
  const validation = validateTelemetryExportV1(parsed);
  if (!validation.valid) throw new Br02HandoffDriverErrorV1('telemetry-invalid');
  const canonicalBytes = serializeSealedTelemetryExportV1(validation.value);
  if (!equalBytes(rawBytes, canonicalBytes)) throw new Br02HandoffDriverErrorV1('telemetry-noncanonical');
  assertEnvelopeBinding(validation.value, envelope);
  return validation.value;
}

async function readDownload(download: Download): Promise<Uint8Array> {
  if (download.suggestedFilename() !== 'br02-telemetry-export-v1.json') {
    throw new Br02HandoffDriverErrorV1('download-name-mismatch');
  }
  if (await download.failure() !== null) throw new Br02HandoffDriverErrorV1('download-read-failure');
  const stream = await download.createReadStream();
  if (stream === null) throw new Br02HandoffDriverErrorV1('download-read-failure');
  const chunks: Buffer[] = [];
  let byteLength = 0;
  try {
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      byteLength += bytes.byteLength;
      if (byteLength > TELEMETRY_LIMITS_V1.maxCanonicalExportBytes) {
        stream.destroy();
        throw new Br02HandoffDriverErrorV1('download-size-invalid');
      }
      chunks.push(bytes);
    }
  } catch (error) {
    if (error instanceof Br02HandoffDriverErrorV1) throw error;
    throw new Br02HandoffDriverErrorV1('download-read-failure', { cause: error });
  }
  return new Uint8Array(Buffer.concat(chunks));
}

async function trackFailures(page: Page, expectedOrigin: string): Promise<{ readonly failures: Br02HandoffFailureCodeV1[]; readonly failure: Promise<never>; readonly stop: () => void }> {
  const failures: Br02HandoffFailureCodeV1[] = [];
  let rejectFailure: ((error: Br02HandoffDriverErrorV1) => void) | undefined;
  const failure = new Promise<never>((_, reject) => { rejectFailure = reject; });
  void failure.catch(() => undefined);
  const record = (code: Br02HandoffFailureCodeV1) => {
    failures.push(code);
    rejectFailure?.(new Br02HandoffDriverErrorV1(code));
  };
  await page.exposeBinding('__br03RuntimeFailureV1', (_source, code: unknown) => {
    if (code === 'runtime-state-change' || code === 'telemetry-terminal-invalid') record(code);
  });
  await page.addInitScript(() => {
    (globalThis as unknown as { __br03RuntimeStateArmedV1: boolean }).__br03RuntimeStateArmedV1 = false;
    const report = (code: 'runtime-state-change' | 'telemetry-terminal-invalid') => {
      void (globalThis as unknown as { __br03RuntimeFailureV1: (value: string) => Promise<void> }).__br03RuntimeFailureV1(code);
    };
    const reportRuntimeChange = () => {
      if ((globalThis as unknown as { __br03RuntimeStateArmedV1: boolean }).__br03RuntimeStateArmedV1) report('runtime-state-change');
    };
    document.addEventListener('visibilitychange', reportRuntimeChange);
    window.addEventListener('blur', reportRuntimeChange);
    const observer = new MutationObserver(() => {
      const state = document.querySelector('[data-testid="voxel-app"]')?.getAttribute('data-telemetry-state');
      if (state === 'invalid' || state === 'disabled') report('telemetry-terminal-invalid');
    });
    const observeStatus = () => observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
    if (document.documentElement === null) document.addEventListener('DOMContentLoaded', observeStatus, { once: true });
    else observeStatus();
  });
  const consoleListener = (message: ConsoleMessage) => { if (message.type() === 'error') record('console-error'); };
  const pageErrorListener = () => { record('page-error'); };
  const requestFailureListener = (_request: Request) => { record('request-failure'); };
  const responseListener = (response: Response) => {
    const status = response.status();
    if (status >= 200 && status < 400 && new URL(response.url()).origin !== expectedOrigin) record('unexpected-external-origin');
    else if (status >= 400 || status === 204) record('http-error');
  };
  const crashListener = () => { record('process-crash'); };
  const contextCloseListener = () => { record('context-lost'); };
  const popupListener = () => { record('popup-opened'); };
  const pageCloseListener = () => { record('page-closed'); };
  const browser = page.context().browser();
  const disconnectListener = () => { record('browser-disconnected'); };
  page.on('console', consoleListener);
  page.on('pageerror', pageErrorListener);
  page.on('requestfailed', requestFailureListener);
  page.on('response', responseListener);
  page.on('crash', crashListener);
  page.on('popup', popupListener);
  page.on('close', pageCloseListener);
  page.context().on('close', contextCloseListener);
  browser?.on('disconnected', disconnectListener);
  return {
    failures,
    failure,
    stop: () => {
      page.off('console', consoleListener);
      page.off('pageerror', pageErrorListener);
      page.off('requestfailed', requestFailureListener);
      page.off('response', responseListener);
      page.off('crash', crashListener);
      page.off('popup', popupListener);
      page.off('close', pageCloseListener);
      page.context().off('close', contextCloseListener);
      browser?.off('disconnected', disconnectListener);
    },
  };
}

function assertNoFailures(failures: readonly Br02HandoffFailureCodeV1[]): void {
  const first = failures[0];
  if (first !== undefined) throw new Br02HandoffDriverErrorV1(first);
}

async function waitForState(page: Page, state: ParsedStatusV1['state']): Promise<void> {
  await page.locator(`[data-testid="voxel-app"][data-telemetry-state="${state}"], [data-testid="voxel-app"][data-telemetry-state="invalid"], [data-testid="voxel-app"][data-telemetry-state="disabled"]`).waitFor({ state: 'attached' });
  const value = await page.getByTestId('telemetry-contract-status').textContent();
  if (value === null) throw new Br02HandoffDriverErrorV1('status-mismatch');
  const parsed = parseBr02ContractStatusV1(value);
  if (parsed.state === 'invalid' || parsed.state === 'disabled') throw new Br02HandoffDriverErrorV1('telemetry-terminal-invalid');
  if (parsed.state !== state || parsed.reason !== 'none') throw new Br02HandoffDriverErrorV1('status-mismatch');
}

async function waitForTelemetryInterval(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

export async function runBr02HandoffV1(
  page: Page,
  baseUrl: string,
  route: string,
  envelope: BrowserTelemetryHandoffEnvelopeV1,
): Promise<Br02HandoffResultV1> {
  const url = new URL(route, baseUrl);
  if (url.searchParams.has(BR02_BROWSER_HANDOFF_QUERY_KEY)) throw new Br02HandoffDriverErrorV1('ui-lifecycle-failure');
  url.searchParams.set(BR02_BROWSER_HANDOFF_QUERY_KEY, encodeBrowserTelemetryHandoffV1(envelope));
  const tracker = await trackFailures(page, new URL(baseUrl).origin);
  let retainObservation = false;
  try {
    return await Promise.race([(async () => {
    await page.goto(url.toString(), { waitUntil: 'load' });
    await page.locator('[data-testid="voxel-app"][data-ready="true"]').waitFor({ state: 'attached' });
    await page.getByTestId('telemetry-panel').waitFor({ state: 'visible' });
    await page.evaluate(() => { (globalThis as unknown as { __br03RuntimeStateArmedV1: boolean }).__br03RuntimeStateArmedV1 = true; });
    await waitForState(page, 'ready');
    assertNoFailures(tracker.failures);
    for (const [index, iteration] of envelope.iterations.entries()) {
      const current = await page.getByTestId('telemetry-current-iteration').textContent();
      if (current !== `id=${iteration.iterationId}; ordinal=${iteration.iterationOrdinal}`) {
        throw new Br02HandoffDriverErrorV1('status-mismatch');
      }
      await page.getByTestId('telemetry-start-current-iteration').click();
      await waitForState(page, 'running');
      await waitForTelemetryInterval(page);
      await page.getByTestId('telemetry-complete-current-iteration').click();
      if (index === envelope.iterations.length - 1) {
        await waitForState(page, 'sealed');
      } else {
        await waitForState(page, 'ready');
        await page.getByTestId('telemetry-advance-next-iteration').click();
      }
      assertNoFailures(tracker.failures);
    }
    const downloads: Download[] = [];
    const downloadListener = (download: Download) => { downloads.push(download); };
    page.on('download', downloadListener);
    let download: Download;
    try {
      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('telemetry-export').click();
      download = await downloadPromise;
    } finally {
      if (downloads.length === 0) page.off('download', downloadListener);
    }
    if (downloads.length === 0) throw new Br02HandoffDriverErrorV1('download-missing');
    if (downloads.length !== 1 || downloads[0] !== download) throw new Br02HandoffDriverErrorV1('download-duplicate');
    const rawBytes = await readDownload(download);
    const telemetryExport = validateDownloadedTelemetryV1(rawBytes, envelope);
    assertNoFailures(tracker.failures);
    retainObservation = true;
    let observationComplete = false;
    return { rawBytes, telemetryExport, completeObservation: () => {
      if (observationComplete) return;
      observationComplete = true;
      page.off('download', downloadListener);
      tracker.stop();
      if (downloads.length !== 1 || downloads[0] !== download) throw new Br02HandoffDriverErrorV1('download-duplicate');
      assertNoFailures(tracker.failures);
    } };
    })(), tracker.failure]);
  } catch (error) {
    if (error instanceof Br02HandoffDriverErrorV1) throw error;
    assertNoFailures(tracker.failures);
    throw new Br02HandoffDriverErrorV1('ui-lifecycle-failure', { cause: error });
  } finally {
    if (!retainObservation) tracker.stop();
  }
}

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

export type Br02HandoffFailureCodeV1 =
  | 'console-error'
  | 'page-error'
  | 'request-failure'
  | 'http-error'
  | 'process-crash'
  | 'ui-lifecycle-failure'
  | 'status-mismatch'
  | 'download-missing'
  | 'download-duplicate'
  | 'download-name-mismatch'
  | 'download-read-failure'
  | 'download-size-invalid'
  | 'telemetry-invalid'
  | 'telemetry-noncanonical'
  | 'telemetry-binding-mismatch';

export class Br02HandoffDriverErrorV1 extends Error {
  public constructor(public readonly code: Br02HandoffFailureCodeV1, options?: ErrorOptions) {
    super(`BR03 browser handoff failed: ${code}.`, options);
    this.name = 'Br02HandoffDriverErrorV1';
  }
}

export interface Br02HandoffResultV1 {
  readonly rawBytes: Uint8Array;
  readonly telemetryExport: Br02TelemetryExportV1;
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

function trackFailures(page: Page): { readonly failures: Br02HandoffFailureCodeV1[]; readonly stop: () => void } {
  const failures: Br02HandoffFailureCodeV1[] = [];
  const consoleListener = (message: ConsoleMessage) => { if (message.type() === 'error') failures.push('console-error'); };
  const pageErrorListener = () => { failures.push('page-error'); };
  const requestFailureListener = (_request: Request) => { failures.push('request-failure'); };
  const responseListener = (response: Response) => { if (response.status() >= 400) failures.push('http-error'); };
  const crashListener = () => { failures.push('process-crash'); };
  const contextCloseListener = () => { failures.push('process-crash'); };
  page.on('console', consoleListener);
  page.on('pageerror', pageErrorListener);
  page.on('requestfailed', requestFailureListener);
  page.on('response', responseListener);
  page.on('crash', crashListener);
  page.context().on('close', contextCloseListener);
  return {
    failures,
    stop: () => {
      page.off('console', consoleListener);
      page.off('pageerror', pageErrorListener);
      page.off('requestfailed', requestFailureListener);
      page.off('response', responseListener);
      page.off('crash', crashListener);
      page.context().off('close', contextCloseListener);
    },
  };
}

function assertNoFailures(failures: readonly Br02HandoffFailureCodeV1[]): void {
  const first = failures[0];
  if (first !== undefined) throw new Br02HandoffDriverErrorV1(first);
}

async function waitForState(page: Page, state: ParsedStatusV1['state']): Promise<void> {
  await page.locator(`[data-testid="voxel-app"][data-telemetry-state="${state}"]`).waitFor({ state: 'attached' });
  const value = await page.getByTestId('telemetry-contract-status').textContent();
  if (value === null) throw new Br02HandoffDriverErrorV1('status-mismatch');
  const parsed = parseBr02ContractStatusV1(value);
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
  const tracker = trackFailures(page);
  try {
    await page.goto(url.toString(), { waitUntil: 'load' });
    await page.locator('[data-testid="voxel-app"][data-ready="true"]').waitFor({ state: 'attached' });
    await page.getByTestId('telemetry-panel').waitFor({ state: 'visible' });
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
      await page.waitForTimeout(0);
    } finally {
      page.off('download', downloadListener);
    }
    if (downloads.length === 0) throw new Br02HandoffDriverErrorV1('download-missing');
    if (downloads.length !== 1 || downloads[0] !== download) throw new Br02HandoffDriverErrorV1('download-duplicate');
    const rawBytes = await readDownload(download);
    const telemetryExport = validateDownloadedTelemetryV1(rawBytes, envelope);
    assertNoFailures(tracker.failures);
    return { rawBytes, telemetryExport };
  } catch (error) {
    if (error instanceof Br02HandoffDriverErrorV1) throw error;
    throw new Br02HandoffDriverErrorV1('ui-lifecycle-failure', { cause: error });
  } finally {
    tracker.stop();
  }
}

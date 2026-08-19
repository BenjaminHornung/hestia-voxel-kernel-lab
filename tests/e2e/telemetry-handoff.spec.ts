import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { build, createServer, preview, type PreviewServer, type ViteDevServer } from 'vite';
import type { BenchmarkSamplePhaseV1, CanonicalIdV1, Sha256DigestV1, TelemetryAdapterContextV1, TelemetryExportV1 } from '../../src/benchmark/contracts/browserV1';
import { trackPageFailures } from './support';

const telemetryQuery = Buffer.from(JSON.stringify({
  backend: 'three-webgl2',
  contractId: 'br-02-browser-telemetry-handoff-v1',
  iterations: [
    { iterationId: 'iteration-0', iterationOrdinal: 0 },
    { iterationId: 'iteration-1', iterationOrdinal: 1 },
  ],
  phase: 'measurement',
  planId: 'e2e-plan',
  runId: 'e2e-run',
  runtimeActivation: 'br02-browser-telemetry-enabled-v1',
  scenarioId: 'backend-fixture-v1',
  schemaVersion: 1,
  telemetryMode: 'telemetry-enabled-minimal',
})).toString('base64url');

function objectKeys(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.flatMap(objectKeys);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [key, ...objectKeys(child)]);
}

async function waitForTelemetryInterval(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

let benchmarkDir: string | undefined;
let benchmarkServer: PreviewServer | undefined;
let benchmarkBaseUrl: string | undefined;
let productModuleServer: ViteDevServer | undefined;
let adaptTelemetryExportV1: typeof import('../../src/benchmark/adapters').adaptTelemetryExportV1;
let benchmarkMetricRegistryV1: typeof import('../../src/benchmark/contracts/browserV1').BENCHMARK_METRIC_REGISTRY_V1;
let serializeSealedTelemetryExportV1: typeof import('../../src/diagnostics/telemetry/contractV1').serializeSealedTelemetryExportV1;
let validateTelemetryExportV1: typeof import('../../src/diagnostics/telemetry/contractV1').validateTelemetryExportV1;

test.beforeAll(async () => {
  productModuleServer = await createServer({
    root: process.cwd(),
    configFile: false,
    mode: 'benchmark',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });
  const [adapterModule, browserContractsModule, telemetryContractModule] = await Promise.all([
    productModuleServer.ssrLoadModule('/src/benchmark/adapters/index.ts'),
    productModuleServer.ssrLoadModule('/src/benchmark/contracts/browserV1.ts'),
    productModuleServer.ssrLoadModule('/src/diagnostics/telemetry/contractV1.ts'),
  ]);
  adaptTelemetryExportV1 = adapterModule.adaptTelemetryExportV1;
  benchmarkMetricRegistryV1 = browserContractsModule.BENCHMARK_METRIC_REGISTRY_V1;
  serializeSealedTelemetryExportV1 = telemetryContractModule.serializeSealedTelemetryExportV1;
  validateTelemetryExportV1 = telemetryContractModule.validateTelemetryExportV1;
  benchmarkDir = mkdtempSync(join(tmpdir(), 'br02-e2e-benchmark-'));
  await build({
    root: process.cwd(),
    configFile: false,
    mode: 'benchmark',
    logLevel: 'silent',
    build: { outDir: benchmarkDir, emptyOutDir: true },
  });
  benchmarkServer = await preview({
    root: process.cwd(),
    configFile: false,
    logLevel: 'silent',
    build: { outDir: benchmarkDir },
    preview: { host: '127.0.0.1', port: 0 },
  });
  const address = benchmarkServer.httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('Benchmark preview did not expose a TCP port.');
  benchmarkBaseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (productModuleServer !== undefined) {
    await productModuleServer.close();
  }
  if (benchmarkServer !== undefined) {
    await new Promise<void>((resolve) => benchmarkServer!.httpServer.close(() => resolve()));
  }
  if (benchmarkDir !== undefined) rmSync(benchmarkDir, { recursive: true, force: true });
});

test('ordinary production ignores valid, invalid, and duplicate telemetry queries', async ({ page }) => {
  const failures = trackPageFailures(page);
  for (const query of [
    `?lab=wp01&br02Telemetry=${telemetryQuery}`,
    '?lab=wp01&br02Telemetry=invalid',
    `?lab=wp01&br02Telemetry=${telemetryQuery}&br02Telemetry=${telemetryQuery}`,
  ]) {
    await page.goto(query);
    await expect(page.getByTestId('voxel-app')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByTestId('app-status')).toHaveText('Ready');
    await expect(page.getByTestId('telemetry-contract-status')).toHaveCount(0);
  }
  expect(failures).toEqual({ consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [] });
});

test('benchmark without a valid handoff stays disabled, while malformed input stops scene startup', async ({ browser }) => {
  expect(benchmarkBaseUrl).toBeDefined();
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await page.goto(`${benchmarkBaseUrl}/?lab=wp01`);
    await expect(page.getByTestId('telemetry-contract-status')).toContainText('state=disabled');
    await expect(page.getByTestId('voxel-app')).toHaveAttribute('data-ready', 'true');
    await page.goto(`${benchmarkBaseUrl}/?lab=wp01&br02Telemetry=invalid`);
    await expect(page.getByTestId('telemetry-contract-status')).toContainText('state=invalid');
    await expect(page.getByTestId('voxel-app')).toHaveAttribute('data-ready', 'error');
  } finally {
    await context.close();
  }
});

test('benchmark handoff exposes keyboard-accessible lifecycle and real download', async ({ browser }, testInfo) => {
  expect(benchmarkBaseUrl).toBeDefined();
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const failures = trackPageFailures(page);
  try {
    await page.goto(`${benchmarkBaseUrl}/?lab=wp01&br02Telemetry=${telemetryQuery}`);
    await expect(page.getByTestId('voxel-app')).toHaveAttribute('data-ready', 'true');
    const region = page.getByRole('region', { name: 'BR02 browser telemetry' });
    await expect(region).toBeVisible();
    await expect(page.getByTestId('telemetry-contract-status')).toContainText('state=ready');
    await expect(page.getByTestId('telemetry-current-iteration')).toHaveText('id=iteration-0; ordinal=0');
    expect(await region.locator('button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-testid')))).toEqual([
      'telemetry-start-current-iteration',
      'telemetry-complete-current-iteration',
      'telemetry-advance-next-iteration',
      'telemetry-seal',
      'telemetry-export',
    ]);
    const start = page.getByRole('button', { name: 'Start current iteration' });
    const complete = page.getByRole('button', { name: 'Complete current iteration' });
    const advance = page.getByRole('button', { name: 'Advance to next iteration' });
    const exportButton = page.getByRole('button', { name: 'Export telemetry' });
    await start.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('telemetry-contract-status')).toContainText('state=running');
    await waitForTelemetryInterval(page);
    await expect(page.getByTestId('telemetry-contract-status')).toContainText('state=running');
    await page.keyboard.press('Tab');
    await expect(complete).toBeFocused();
    await complete.click();
    await expect(page.getByTestId('telemetry-contract-status')).toContainText('state=ready');
    await advance.click();
    await expect(page.getByTestId('telemetry-current-iteration')).toHaveText('id=iteration-1; ordinal=1');
    await start.click();
    await expect(page.getByTestId('telemetry-contract-status')).toContainText('state=running');
    await waitForTelemetryInterval(page);
    await expect(page.getByTestId('telemetry-contract-status')).toContainText('state=running');
    await complete.click();
    await expect(page.getByTestId('telemetry-contract-status')).toContainText('state=sealed');
    await expect(start).toBeDisabled();
    await expect(complete).toBeDisabled();
    await expect(advance).toBeDisabled();
    await expect(exportButton).toBeEnabled();
    const downloadPromise = page.waitForEvent('download');
    await exportButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('br02-telemetry-export-v1.json');
    const exportPath = testInfo.outputPath('br02-telemetry-export-v1.json');
    await download.saveAs(exportPath);
    const rawBytes = new Uint8Array(readFileSync(exportPath));
    const parsedTelemetryExport: unknown = JSON.parse(new TextDecoder().decode(rawBytes));
    const validation = validateTelemetryExportV1(parsedTelemetryExport);
    expect(validation.valid).toBe(true);
    if (!validation.valid) throw new Error('The downloaded BR02 export failed its browser-safe contract validation.');
    const telemetryExport = validation.value;
    const firstSerialization = serializeSealedTelemetryExportV1(telemetryExport);
    const secondSerialization = serializeSealedTelemetryExportV1(telemetryExport);
    expect(Array.from(firstSerialization)).toEqual(Array.from(secondSerialization));
    expect(Array.from(firstSerialization)).toEqual(Array.from(rawBytes));
    expect(telemetryExport.schemaVersion).toBe(1);
    expect(telemetryExport.contractId).toBe('br-02-in-browser-telemetry-v1');
    expect(telemetryExport.adapterContractId).toBe('br02-telemetry-export-v1-to-benchmark-raw-sample-v1');
    expect(telemetryExport.adapterContractVersion).toBe(1);
    expect(telemetryExport.sealed).toBe(true);
    expect(telemetryExport.iterations).toEqual([
      { iterationId: 'iteration-0', iterationOrdinal: 0 },
      { iterationId: 'iteration-1', iterationOrdinal: 1 },
    ]);
    expect(telemetryExport.records.map((record) => record.ingestSequence)).toEqual(
      telemetryExport.records.map((_record, index) => index),
    );
    for (const record of telemetryExport.records) {
      expect(record.recordId).toBe(`br02-record-${String(record.ingestSequence).padStart(8, '0')}`);
      if (record.kind !== 'sample') continue;
      const iteration = telemetryExport.iterations.find((candidate) => candidate.iterationId === record.iterationId);
      expect(iteration).toBeDefined();
      const timeBlock = 'dimensions' in record.fields
        ? record.fields.dimensions.find((dimension) => dimension.key === 'time-block-ordinal')
        : undefined;
      if (timeBlock !== undefined) expect(timeBlock.value).toBe(iteration!.iterationOrdinal);
    }
    const runBindingSha256 = `sha256:${'b'.repeat(64)}` as Sha256DigestV1;
    const contexts: readonly TelemetryAdapterContextV1[] = telemetryExport.iterations.map((iteration) => ({
      hardwareCellId: 'e2e-hardware-cell' as CanonicalIdV1,
      slotId: 'e2e-slot' as CanonicalIdV1,
      browserProcessId: 'e2e-browser-process' as CanonicalIdV1,
      runId: telemetryExport.runId,
      iterationId: iteration.iterationId,
      phase: telemetryExport.phase as BenchmarkSamplePhaseV1,
      runBindingSha256,
    }));
    expect(contexts.every((context) => Object.keys(context).length === 7)).toBe(true);
    const adapterInput = telemetryExport as unknown as TelemetryExportV1;
    const adapted = contexts.map((context) => adaptTelemetryExportV1(adapterInput, context, benchmarkMetricRegistryV1));
    const repeated = contexts.map((context) => adaptTelemetryExportV1(adapterInput, context, benchmarkMetricRegistryV1));
    expect(adapted).toEqual(repeated);
    for (const [index, result] of adapted.entries()) {
      expect(result.invalidReasons).toEqual([]);
      expect(result.samples.length).toBeGreaterThan(0);
      expect(result.samples.every((sample) => sample.iterationId === telemetryExport.iterations[index]!.iterationId)).toBe(true);
    }
    const samples = adapted.flatMap((result) => result.samples);
    expect(samples.map((sample) => sample.ordinal)).toEqual(samples.map((_sample, index) => index));
    expect(samples.map((sample) => sample.sampleId)).toEqual(samples.map((_sample, index) => `br02-sample-${String(index).padStart(8, '0')}`));
    expect(new Set(samples.map((sample) => sample.sampleId)).size).toBe(samples.length);
    expect(objectKeys(telemetryExport).filter((key) => /^(target|selector|text|pointer|url|container|path|stack|error|message)$/i.test(key))).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('telemetry-handoff.png') });
    expect(failures).toEqual({ consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [] });
  } finally {
    await context.close();
  }
});

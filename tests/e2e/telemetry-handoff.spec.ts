import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { build, preview, type PreviewServer } from 'vite';
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

interface TelemetryExportE2e {
  readonly schemaVersion: number;
  readonly contractId: string;
  readonly adapterContractId: string;
  readonly adapterContractVersion: number;
  readonly iterations: readonly { readonly iterationId: string; readonly iterationOrdinal: number }[];
  readonly records: readonly {
    readonly recordId: string;
    readonly ingestSequence: number;
    readonly kind: string;
    readonly iterationId: string | null;
    readonly fields: { readonly dimensions?: readonly { readonly key: string; readonly value: number }[] };
  }[];
  readonly sealed: boolean;
}

function objectKeys(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.flatMap(objectKeys);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [key, ...objectKeys(child)]);
}

let benchmarkDir: string | undefined;
let benchmarkServer: PreviewServer | undefined;
let benchmarkBaseUrl: string | undefined;

test.beforeAll(async () => {
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
    await page.keyboard.press('Tab');
    await expect(complete).toBeFocused();
    await complete.click();
    await expect(page.getByTestId('telemetry-contract-status')).toContainText('state=ready');
    await advance.click();
    await expect(page.getByTestId('telemetry-current-iteration')).toHaveText('id=iteration-1; ordinal=1');
    await start.click();
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
    const telemetryExport = JSON.parse(readFileSync(exportPath, 'utf8')) as TelemetryExportE2e;
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
      const timeBlock = record.fields.dimensions?.find((dimension) => dimension.key === 'time-block-ordinal');
      if (timeBlock !== undefined) expect(timeBlock.value).toBe(iteration!.iterationOrdinal);
    }
    expect(objectKeys(telemetryExport).filter((key) => /^(target|selector|text|pointer|url|container|path|stack|error|message)$/i.test(key))).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('telemetry-handoff.png') });
    expect(failures).toEqual({ consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [] });
  } finally {
    await context.close();
  }
});

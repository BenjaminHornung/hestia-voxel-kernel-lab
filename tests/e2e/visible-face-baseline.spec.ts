import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { imageDifference, pngDimensions, trackPageFailures } from './support';

const evidencePath = path.join(process.cwd(), 'evidence', 'wp01', 'visible-face-baseline.png');

test('renders the deterministic visible-face fixture in the production preview', async ({ context, page }, testInfo) => {
  const failures = trackPageFailures(page);

  await page.goto('/?lab=wp01');
  const app = page.getByTestId('voxel-app');
  await expect(app).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await expect(page.getByTestId('metric-renderer')).toHaveText('Three/WebGL2 · Visible Faces');
  await expect(page.getByTestId('metric-lab')).toHaveText('WP01 · Visible-face baseline');
  await expect(page.getByTestId('metric-voxel-size')).toHaveText('0.25 m');
  await expect(page.getByTestId('metric-volume')).toHaveText('32 × 32 × 32');
  await expect(page.getByTestId('metric-occupied')).toHaveText('1,169');
  await expect(page.getByTestId('metric-quads')).toHaveText('2,238');
  await expect(page.getByTestId('metric-triangles')).toHaveText('4,476');
  await expect(page.getByTestId('metric-draw-calls')).toHaveText('2');
  await expect(page.getByTestId('telemetry-classification')).toContainText('not a steady-state benchmark');

  for (const testId of ['metric-frame-current', 'metric-frame-p50', 'metric-frame-p95']) {
    const value = Number.parseFloat(await page.getByTestId(testId).innerText());
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(10_000);
  }
  const p50 = Number.parseFloat(await page.getByTestId('metric-frame-p50').innerText());
  const p95 = Number.parseFloat(await page.getByTestId('metric-frame-p95').innerText());
  expect(p50).toBeLessThanOrEqual(p95);

  const screenshotPath = testInfo.outputPath('visible-face-baseline.png');
  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath });
  expect(await pngDimensions(context, await readFile(screenshotPath))).toEqual({ width: 1920, height: 1080 });

  const normalToggle = page.getByTestId('normal-toggle');
  await normalToggle.check();
  await expect(page.getByTestId('metric-draw-calls')).toHaveText('3');
  await normalToggle.uncheck();
  await expect(page.getByTestId('metric-draw-calls')).toHaveText('2');

  const wireframeToggle = page.getByTestId('wireframe-toggle');
  await wireframeToggle.check();
  await expect(page.getByTestId('metric-draw-calls')).toHaveText('1');
  await wireframeToggle.uncheck();
  await expect(page.getByTestId('metric-draw-calls')).toHaveText('2');

  const canvas = page.getByTestId('voxel-canvas');
  const initialView = await canvas.screenshot();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * 0.65, box!.y + box!.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.75, box!.y + box!.height * 0.6, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const rotatedView = await canvas.screenshot();
  const rotatedDifference = await imageDifference(page, initialView, rotatedView);
  expect(rotatedDifference).toBeGreaterThan(0.001);

  await page.mouse.wheel(0, -700);
  await page.waitForTimeout(500);
  const zoomedView = await canvas.screenshot();
  const zoomedDifference = await imageDifference(page, rotatedView, zoomedView);
  expect(zoomedDifference).toBeGreaterThan(0.001);

  await page.getByTestId('camera-reset').click();
  await page.waitForTimeout(500);
  const resetDifference = await imageDifference(page, initialView, await canvas.screenshot());
  expect(resetDifference).toBeLessThan(Math.min(rotatedDifference, zoomedDifference) * 0.1);
  expect(await page.evaluate(() => 'TestBridge' in window)).toBe(false);
  expect(await page.evaluate(() => '__VOXEL_TEST__' in window)).toBe(false);
  expect(failures).toEqual({ consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [] });
});

test('@evidence-wp01 captures the curated WP01 baseline after warm-up', async ({ context, page }) => {
  const failures = trackPageFailures(page);
  await page.goto('/?lab=wp01');
  await expect(page.getByTestId('voxel-app')).toHaveAttribute('data-ready', 'true');
  await page.waitForTimeout(3_000);
  await expect(page.getByTestId('metric-draw-calls')).toHaveText('2');

  await mkdir(path.dirname(evidencePath), { recursive: true });
  await page.screenshot({ path: evidencePath });
  expect(await pngDimensions(context, await readFile(evidencePath))).toEqual({ width: 1920, height: 1080 });
  expect(failures).toEqual({ consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [] });
});

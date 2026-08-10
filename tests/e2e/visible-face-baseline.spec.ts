import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const screenshotPath = path.join(process.cwd(), 'evidence', 'wp01', 'visible-face-baseline.png');

async function imageDifference(page: Page, left: Buffer, right: Buffer): Promise<number> {
  return page.evaluate(async ({ leftBase64, rightBase64 }) => {
    const decode = async (base64: string): Promise<ImageBitmap> => {
      const response = await fetch(`data:image/png;base64,${base64}`);
      return createImageBitmap(await response.blob());
    };
    const [leftImage, rightImage] = await Promise.all([decode(leftBase64), decode(rightBase64)]);
    const canvas = new OffscreenCanvas(leftImage.width, leftImage.height);
    const context2d = canvas.getContext('2d', { willReadFrequently: true });
    if (!context2d || leftImage.width !== rightImage.width || leftImage.height !== rightImage.height) {
      throw new Error('Screenshot comparison requires equal decodable images.');
    }
    context2d.drawImage(leftImage, 0, 0);
    const leftPixels = context2d.getImageData(0, 0, canvas.width, canvas.height).data;
    context2d.drawImage(rightImage, 0, 0);
    const rightPixels = context2d.getImageData(0, 0, canvas.width, canvas.height).data;
    let difference = 0;
    for (let index = 0; index < leftPixels.length; index += 4) {
      difference += Math.abs(leftPixels[index]! - rightPixels[index]!);
      difference += Math.abs(leftPixels[index + 1]! - rightPixels[index + 1]!);
      difference += Math.abs(leftPixels[index + 2]! - rightPixels[index + 2]!);
    }
    leftImage.close();
    rightImage.close();
    return difference / (canvas.width * canvas.height * 3 * 255);
  }, { leftBase64: left.toString('base64'), rightBase64: right.toString('base64') });
}

test('renders the deterministic visible-face fixture in the production preview', async ({ context, page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));

  await page.goto('/');
  const app = page.getByTestId('voxel-app');
  await expect(app).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await expect(page.getByTestId('metric-renderer')).toContainText('Three.js WebGL2');
  await expect(page.getByTestId('metric-volume')).toHaveText('32 × 32 × 32');
  await expect(page.getByTestId('metric-occupied')).toHaveText('1,169');
  await expect(page.getByTestId('metric-quads')).toHaveText('2,238');
  await expect(page.getByTestId('metric-triangles')).toHaveText('4,476');
  await expect(page.getByTestId('metric-draw-calls')).toHaveText('2');

  for (const testId of ['metric-frame-current', 'metric-frame-p50', 'metric-frame-p95']) {
    const value = Number.parseFloat(await page.getByTestId(testId).innerText());
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(10_000);
  }
  const p50 = Number.parseFloat(await page.getByTestId('metric-frame-p50').innerText());
  const p95 = Number.parseFloat(await page.getByTestId('metric-frame-p95').innerText());
  expect(p50).toBeLessThanOrEqual(p95);

  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath });
  const png = await readFile(screenshotPath);
  const decoder = await context.newPage();
  const dimensions = await decoder.evaluate(async (base64) => {
    const response = await fetch(`data:image/png;base64,${base64}`);
    const bitmap = await createImageBitmap(await response.blob());
    const result = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  }, png.toString('base64'));
  await decoder.close();
  expect(dimensions).toEqual({ width: 1920, height: 1080 });

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
  expect(await page.evaluate(() => '__VOXEL_TEST__' in window)).toBe(false);
  expect(errors).toEqual([]);
});

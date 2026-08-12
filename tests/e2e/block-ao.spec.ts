import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { AO_DARKNESS, type Wp04DebugMode } from '../../src/render-three/aoVertexColors';
import { DEFAULT_FIXTURE_SEED, LARGE_FIXTURE_ID, LARGE_FIXTURE_VERSION } from '../../src/voxel/largeFixture';
import { PALETTE_V1 } from '../../src/voxel/palette';
import { WP02_FIXTURE_GOLDEN } from '../contracts/wp02FixtureGolden';
import { WP03_GREEDY_GOLDEN } from '../contracts/wp03GreedyGolden';
import { WP04_AO_GOLDEN } from '../contracts/wp04AoGolden';
import { imageDifference, metricNumber, pngDimensions, trackPageFailures } from './support';

const evidenceDirectory = path.join(process.cwd(), 'evidence', 'wp04');

const IMAGE_METRIC_VERSION = 'mean-absolute-rgb-normalized-v1';
const ROI_CONTRACT_VERSION = 'wp04-canvas-roi-v1';
const AO_DEBUG_SAMPLE_CONTRACT_VERSION = 'wp04-ao-debug-framebuffer-samples-v1';
const OVERVIEW_MIN_SURFACE_DIFFERENCE = 0.00001;
const OVERVIEW_MAX_REPEAT_DIFFERENCE = 0.000001;
const CONCAVE_ZOOM_IN_STEPS = 14;
const SOURCE_AO_DEBUG_RGB8 = [
  [2, 4, 8], [8, 26, 72], [147, 65, 7], [226, 202, 149],
] as const;
const AO_DEBUG_FRAMEBUFFER_SAMPLES = [
  { sourceClass: 0, x: 972, y: 526, radius: 2, expectedRgb8: [7, 14, 26] },
  { sourceClass: 1, x: 972, y: 570, radius: 2, expectedRgb8: [22, 48, 86] },
  { sourceClass: 2, x: 937, y: 587, radius: 2, expectedRgb8: [108, 77, 24] },
  { sourceClass: 3, x: 972, y: 481, radius: 2, expectedRgb8: [132, 132, 121] },
] as const;
const AO_DEBUG_FRAMEBUFFER_TOLERANCE_RGB8 = 1;

interface CanvasRoi {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly purpose: string;
}

const CANVAS_ROIS = {
  'wp04-concave-corner-roi-v1': {
    id: 'wp04-concave-corner-roi-v1', x: 760, y: 320, width: 400, height: 400,
    purpose: 'Compare AO On and AO Off at the same concave-corner view.',
  },
  'wp04-chunk-seam-roi-v1': {
    id: 'wp04-chunk-seam-roi-v1', x: 900, y: 190, width: 120, height: 240,
    purpose: 'Check optical uniformity across the unoccluded solid-cube chunk boundary.',
  },
  'wp04-flat-surface-roi-v1': {
    id: 'wp04-flat-surface-roi-v1', x: 720, y: 160, width: 480, height: 260,
    purpose: 'Check that AO does not darken a fully unoccluded flat surface.',
  },
  'wp04-ao-level-roi-v1': {
    id: 'wp04-ao-level-roi-v1', x: 760, y: 320, width: 400, height: 400,
    purpose: 'Confirm visible evidence of all four source AO debug classes.',
  },
} as const satisfies Readonly<Record<string, CanvasRoi>>;

type CanvasRoiId = keyof typeof CANVAS_ROIS;

interface CanvasCapture {
  readonly png: Buffer;
  readonly includesUi: false;
  readonly ambientOcclusion: 'on' | 'off';
  readonly state: {
    readonly canvas: { readonly width: number; readonly height: number };
    readonly cameraPreset: string;
    readonly zoomInWheelSteps: number;
    readonly debugMode: string;
    readonly worldHash: string;
    readonly coveredUnitFaces: number;
    readonly quads: number;
    readonly triangles: number;
    readonly toggles: {
      readonly wireframe: boolean;
      readonly blockEdges: boolean;
      readonly meshQuadEdges: boolean;
      readonly normals: boolean;
      readonly chunkBounds: boolean;
    };
  };
}

function validateCanvasRoi(roi: CanvasRoi, canvasWidth: number, canvasHeight: number): CanvasRoi {
  const coordinates = [roi.x, roi.y, roi.width, roi.height, canvasWidth, canvasHeight];
  if (!coordinates.every(Number.isInteger) || roi.x < 0 || roi.y < 0 || roi.width <= 0 || roi.height <= 0
    || roi.x + roi.width > canvasWidth || roi.y + roi.height > canvasHeight) {
    throw new RangeError(`ROI ${roi.id} is outside the ${canvasWidth}x${canvasHeight} canvas.`);
  }
  return roi;
}

function resolveCanvasRoi(id: string, canvasWidth: number, canvasHeight: number): CanvasRoi {
  const roi = CANVAS_ROIS[id as CanvasRoiId];
  if (!roi) throw new RangeError(`Unknown WP04 ROI version: ${id}`);
  return validateCanvasRoi(roi, canvasWidth, canvasHeight);
}

async function zoomIn(page: Page, steps: number): Promise<void> {
  if (steps === 0) return;
  const box = await page.getByTestId('voxel-canvas').boundingBox();
  if (!box) throw new Error('Zoom requires a visible canvas.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let step = 0; step < steps; step += 1) await page.mouse.wheel(0, -100);
  await page.waitForTimeout(600);
}

async function captureCanvasWithoutUi(page: Page, zoomInWheelSteps: number): Promise<CanvasCapture> {
  const canvas = page.getByTestId('voxel-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas capture requires a visible canvas.');
  const canvasDimensions = { width: Math.round(box.width), height: Math.round(box.height) };
  const hud = page.getByTestId('voxel-hud');
  const previousVisibility = await hud.evaluate((element) => {
    const previous = element.style.visibility;
    element.style.visibility = 'hidden';
    return previous;
  });
  let png: Buffer;
  try {
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    if (await hud.evaluate((element) => getComputedStyle(element).visibility !== 'hidden')) {
      throw new Error('Canvas-only capture requires every HUD pixel to be hidden.');
    }
    png = await page.screenshot({
      clip: { x: Math.round(box.x), y: Math.round(box.y), width: canvasDimensions.width, height: canvasDimensions.height },
    });
  } finally {
    await hud.evaluate((element, visibility) => { element.style.visibility = visibility; }, previousVisibility);
  }
  const ambientOcclusion = await page.getByTestId('ao-select').inputValue();
  if (ambientOcclusion !== 'on' && ambientOcclusion !== 'off') throw new Error(`Unexpected AO state: ${ambientOcclusion}`);
  return {
    png,
    includesUi: false,
    ambientOcclusion,
    state: {
      canvas: canvasDimensions,
      cameraPreset: await page.getByTestId('camera-preset').inputValue(),
      zoomInWheelSteps,
      debugMode: await page.getByTestId('wp04-debug-select').inputValue(),
      worldHash: await page.getByTestId('metric-world-hash').innerText(),
      coveredUnitFaces: await metricNumber(page, 'metric-covered-unit-faces'),
      quads: await metricNumber(page, 'metric-quads'),
      triangles: await metricNumber(page, 'metric-triangles'),
      toggles: {
        wireframe: await page.getByTestId('wireframe-toggle').isChecked(),
        blockEdges: await page.getByTestId('block-edge-toggle').isChecked(),
        meshQuadEdges: await page.getByTestId('mesh-quad-edge-toggle').isChecked(),
        normals: await page.getByTestId('normal-toggle').isChecked(),
        chunkBounds: await page.getByTestId('chunk-bounds-toggle').isChecked(),
      },
    },
  };
}

async function cropPng(page: Page, source: Buffer, roi: CanvasRoi): Promise<Buffer> {
  const base64 = await page.evaluate(async ({ sourceBase64, crop }) => {
    const response = await fetch(`data:image/png;base64,${sourceBase64}`);
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(crop.width, crop.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('ROI crop requires a 2D canvas.');
    context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    bitmap.close();
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, { sourceBase64: source.toString('base64'), crop: roi });
  return Buffer.from(base64, 'base64');
}

async function composeConcaveComparison(page: Page, aoOn: Buffer, aoOff: Buffer): Promise<Buffer> {
  const base64 = await page.evaluate(async ({ onBase64, offBase64 }) => {
    const decode = async (source: string): Promise<ImageBitmap> => {
      const response = await fetch(`data:image/png;base64,${source}`);
      return createImageBitmap(await response.blob());
    };
    const [on, off] = await Promise.all([decode(onBase64), decode(offBase64)]);
    const canvas = new OffscreenCanvas(1920, 1080);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Evidence composition requires a 2D canvas.');
    context.fillStyle = '#17202a';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#f8fafc';
    context.font = '700 34px system-ui';
    context.fillText('AO ON', 60, 78);
    context.fillText('AO OFF', 1020, 78);
    context.font = '500 20px system-ui';
    context.fillStyle = '#cbd5e1';
    context.fillText('Concave corner · same camera, geometry, toggles, and canvas-pixel crop', 60, 112);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(on, 40, 140, 880, 880);
    context.drawImage(off, 1000, 140, 880, 880);
    context.strokeStyle = '#f8fafc';
    context.lineWidth = 3;
    context.strokeRect(40, 140, 880, 880);
    context.strokeRect(1000, 140, 880, 880);
    on.close();
    off.close();
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, { onBase64: aoOn.toString('base64'), offBase64: aoOff.toString('base64') });
  return Buffer.from(base64, 'base64');
}

async function sampleAoDebugFramebuffer(page: Page, png: Buffer) {
  return page.evaluate(async ({ base64, samples }) => {
    const response = await fetch(`data:image/png;base64,${base64}`);
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('AO debug evidence inspection requires a 2D canvas.');
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return samples.map((sample) => {
      if (sample.x - sample.radius < 0 || sample.y - sample.radius < 0
        || sample.x + sample.radius >= canvas.width || sample.y + sample.radius >= canvas.height) {
        throw new RangeError(`AO debug sample ${sample.sourceClass} is outside the canvas.`);
      }
      const patchMinRgb8 = [255, 255, 255];
      const patchMaxRgb8 = [0, 0, 0];
      for (let y = sample.y - sample.radius; y <= sample.y + sample.radius; y += 1) {
        for (let x = sample.x - sample.radius; x <= sample.x + sample.radius; x += 1) {
          const index = (y * canvas.width + x) * 4;
          for (let channel = 0; channel < 3; channel += 1) {
            patchMinRgb8[channel] = Math.min(patchMinRgb8[channel]!, pixels[index + channel]!);
            patchMaxRgb8[channel] = Math.max(patchMaxRgb8[channel]!, pixels[index + channel]!);
          }
        }
      }
      const centerIndex = (sample.y * canvas.width + sample.x) * 4;
      return {
        sourceClass: sample.sourceClass,
        x: sample.x,
        y: sample.y,
        radius: sample.radius,
        expectedFramebufferRgb8: sample.expectedRgb8,
        measuredFramebufferRgb8: Array.from(pixels.slice(centerIndex, centerIndex + 3)),
        patchMinRgb8,
        patchMaxRgb8,
      };
    });
  }, { base64: png.toString('base64'), samples: AO_DEBUG_FRAMEBUFFER_SAMPLES });
}

async function canvasRoi(page: Page): Promise<Buffer> {
  const box = await page.getByTestId('voxel-canvas').boundingBox();
  if (!box) throw new Error('Canvas ROI requires a visible canvas.');
  return page.screenshot({
    clip: {
      x: box.x + box.width * 0.32,
      y: box.y + box.height * 0.25,
      width: box.width * 0.46,
      height: box.height * 0.5,
    },
  });
}

async function expectWp04(page: Page, ao: 'on' | 'off', debug: Wp04DebugMode = 'surface'): Promise<void> {
  const app = page.getByTestId('voxel-app');
  await expect(app).toHaveAttribute('data-ready', 'true');
  await expect(app).toHaveAttribute('data-lab', 'wp04');
  await expect(app).toHaveAttribute('data-mesher', 'ao-greedy');
  await expect(app).toHaveAttribute('data-ao', ao);
  await expect(app).toHaveAttribute('data-debug', debug);
  await expect(app).toHaveAttribute('data-world-hash', WP02_FIXTURE_GOLDEN.worldHash);
  await expect(app).toHaveAttribute('data-palette-hash', WP04_AO_GOLDEN.paletteHash);
  await expect(page.getByTestId('metric-active-ao')).toHaveText(ao === 'on' ? 'On' : 'Off');
  await expect(page.getByTestId('metric-wp04-debug-mode')).toHaveText(debug);
  await expect(page.getByTestId('metric-palette-id')).toHaveText(PALETTE_V1.id);
  await expect(page.getByTestId('metric-palette-version')).toHaveText(String(PALETTE_V1.version));
  await expect(page.getByTestId('metric-palette-hash')).toHaveText(PALETTE_V1.hash);
  expect(await metricNumber(page, 'metric-quads')).toBe(WP04_AO_GOLDEN.quads);
  expect(await metricNumber(page, 'metric-triangles')).toBe(WP04_AO_GOLDEN.triangles);
  expect(await metricNumber(page, 'metric-covered-unit-faces')).toBe(WP04_AO_GOLDEN.coveredUnitFaces);
  expect(await metricNumber(page, 'metric-ao-attribute-bytes')).toBe(WP04_AO_GOLDEN.aoAttributeBytes);
  expect(await metricNumber(page, 'metric-packed-color-bytes')).toBe(WP04_AO_GOLDEN.packedRendererColorBytes);
  expect(await metricNumber(page, 'metric-mesh-total-bytes')).toBe(WP04_AO_GOLDEN.neutralMeshTotalBytes);
  expect(await metricNumber(page, 'metric-normal-diagonals')).toBe(WP04_AO_GOLDEN.normalDiagonalCount);
  expect(await metricNumber(page, 'metric-flipped-diagonals')).toBe(WP04_AO_GOLDEN.flippedDiagonalCount);
  expect(await metricNumber(page, 'metric-ao-split-delta')).toBe(WP04_AO_GOLDEN.aoSplitDeltaVsWp03);
  await expect(page.getByTestId('metric-ao-histogram')).toHaveText('23,958 / 9,322 / 22,388 / 37,644');
  await expect(page.getByTestId('metric-gpu-memory-bytes')).toHaveText('Unknown / unavailable');
}

async function configureView(page: Page, preset: string): Promise<void> {
  await page.getByTestId('camera-preset').selectOption(preset);
  await page.getByTestId('wireframe-toggle').uncheck();
  await page.getByTestId('block-edge-toggle').uncheck();
  await page.getByTestId('mesh-quad-edge-toggle').uncheck();
  await page.getByTestId('normal-toggle').uncheck();
  await page.getByTestId('chunk-bounds-toggle').uncheck();
  await page.waitForTimeout(600);
}

test('loads WP04 AO on/off without changing authority, coverage, or root WP03 default', async ({ page }) => {
  const failures = trackPageFailures(page);
  await page.goto('/?lab=wp04');
  await expectWp04(page, 'on');
  const onHash = await page.getByTestId('metric-world-hash').innerText();
  const onCoverage = await metricNumber(page, 'metric-covered-unit-faces');
  await page.goto('/?lab=wp04&ao=off');
  await expectWp04(page, 'off');
  expect(await page.getByTestId('metric-world-hash').innerText()).toBe(onHash);
  expect(await metricNumber(page, 'metric-covered-unit-faces')).toBe(onCoverage);
  await page.goto('/');
  await expect(page.getByTestId('voxel-app')).toHaveAttribute('data-lab', 'wp03');
  await expect(page.getByTestId('voxel-app')).toHaveAttribute('data-mesher', 'greedy');
  expect(failures).toEqual({ consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [] });
});

test('AO/debug selectors navigate controlled fail-closed WP04 routes', async ({ page }) => {
  await page.goto('/?lab=wp04&ao=on');
  await expectWp04(page, 'on');
  await Promise.all([page.waitForURL(/lab=wp04&ao=off/), page.getByTestId('ao-select').selectOption('off')]);
  await expectWp04(page, 'off');
  await Promise.all([page.waitForURL(/debug=ao-levels/), page.getByTestId('wp04-debug-select').selectOption('ao-levels')]);
  await expectWp04(page, 'off', 'ao-levels');
  expect(await metricNumber(page, 'metric-debug-color-count')).toBe(4);

  for (const route of [
    '/?lab=wp04&ao=', '/?lab=wp04&ao=maybe', '/?lab=wp04&ao=on&ao=off',
    '/?lab=wp04&debug=', '/?lab=wp04&debug=unknown', '/?lab=wp04&debug=surface&debug=normals',
    '/?lab=wp04&mesher=greedy', '/?lab=wp03&ao=on', '/?lab=wp04&unknown=1',
  ]) {
    await page.goto(route);
    await expect(page.getByTestId('voxel-app')).toHaveAttribute('data-ready', 'error');
    await expect(page.getByTestId('voxel-app')).toHaveAttribute('data-lab', 'invalid');
  }
});

test('shows local AO contrast, flat uniformity, seam continuity, and actual diagonal products', async ({ page }) => {
  await page.goto('/?lab=wp04&ao=off');
  await expectWp04(page, 'off');
  await configureView(page, 'concave-corner');
  const off = await canvasRoi(page);
  await page.goto('/?lab=wp04&ao=on');
  await expectWp04(page, 'on');
  await configureView(page, 'concave-corner');
  const on = await canvasRoi(page);
  expect(await imageDifference(page, off, on)).toBeGreaterThan(0.0001);

  await configureView(page, 'solid-cube');
  const flat = await canvasRoi(page);
  await page.goto('/?lab=wp04&ao=off');
  await configureView(page, 'solid-cube');
  expect(await imageDifference(page, flat, await canvasRoi(page))).toBeLessThan(0.001);

  await page.goto('/?lab=wp04&ao=on');
  await configureView(page, 'chunk-seam-closeup');
  const seamOn = await canvasRoi(page);
  await page.goto('/?lab=wp04&ao=off');
  await configureView(page, 'chunk-seam-closeup');
  expect(await imageDifference(page, seamOn, await canvasRoi(page))).toBeLessThan(0.001);

  await page.goto('/?lab=wp04&ao=on&debug=diagonal-normal');
  await expectWp04(page, 'on', 'diagonal-normal');
  expect(await metricNumber(page, 'metric-debug-diagonal-bytes')).toBe(WP04_AO_GOLDEN.normalDiagonalCount * 24);
  await page.goto('/?lab=wp04&ao=on&debug=diagonal-flipped');
  await expectWp04(page, 'on', 'diagonal-flipped');
  expect(await metricNumber(page, 'metric-debug-diagonal-bytes')).toBe(WP04_AO_GOLDEN.flippedDiagonalCount * 24);

});

test('keeps orbit, zoom, reset, and inherited toggles functional', async ({ page }) => {
  await page.goto('/?lab=wp04&ao=on');
  await expectWp04(page, 'on');
  await configureView(page, 'tunnel');
  const canvas = page.getByTestId('voxel-canvas');
  const initial = await canvas.screenshot();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * 0.6, box!.y + box!.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.7, box!.y + box!.height * 0.6, { steps: 10 });
  await page.mouse.up();
  await page.mouse.wheel(0, -500);
  await page.waitForTimeout(400);
  expect(await imageDifference(page, initial, await canvas.screenshot())).toBeGreaterThan(0.001);
  await page.getByTestId('camera-reset').click();
  await page.getByTestId('block-edge-toggle').check();
  await page.getByTestId('mesh-quad-edge-toggle').check();
  await page.getByTestId('chunk-bounds-toggle').check();
  await page.getByTestId('normal-toggle').check();
  expect(await page.evaluate(() => 'TestBridge' in window || '__VOXEL_TEST__' in window)).toBe(false);
});

test('fails closed for unknown or invalid versioned canvas ROIs', () => {
  for (const roi of Object.values(CANVAS_ROIS)) expect(resolveCanvasRoi(roi.id, 1920, 1080)).toEqual(roi);
  expect(() => resolveCanvasRoi('wp04-unknown-roi-v1', 1920, 1080)).toThrow(/Unknown WP04 ROI version/);
  expect(() => validateCanvasRoi({
    id: 'wp04-invalid-roi-v1', x: 1900, y: 0, width: 40, height: 40, purpose: 'Invalid test fixture.',
  }, 1920, 1080)).toThrow(/outside the 1920x1080 canvas/);
});

test('@evidence-wp04 captures curated AO contracts and manifest', async ({ context, page }) => {
  test.setTimeout(180_000);
  const failures = trackPageFailures(page);
  await mkdir(evidenceDirectory, { recursive: true });
  const captures = [
    { file: 'overview-ao-off.png', source: 'wp04-overview-ao-off-canvas-v1', ao: 'off', debug: 'surface', preset: 'overview' },
    { file: 'overview-ao-on.png', source: 'wp04-overview-ao-on-canvas-v1', ao: 'on', debug: 'surface', preset: 'overview' },
    { file: 'concave-corner-ao.png', source: 'wp04-concave-corner-ao-on-canvas-v1', ao: 'on', debug: 'surface', preset: 'concave-corner' },
    { file: 'diagonal-normal.png', source: 'wp04-diagonal-normal-canvas-v1', ao: 'on', debug: 'diagonal-normal', preset: 'concave-corner' },
    { file: 'diagonal-flipped.png', source: 'wp04-diagonal-flipped-canvas-v1', ao: 'on', debug: 'diagonal-flipped', preset: 'concave-corner' },
    { file: 'chunk-seam-ao.png', source: 'wp04-chunk-seam-ao-on-canvas-v1', ao: 'on', debug: 'surface', preset: 'chunk-seam-closeup' },
    { file: 'ao-level-debug.png', source: 'wp04-ao-level-debug-canvas-v1', ao: 'on', debug: 'ao-levels', preset: 'concave-corner' },
  ] as const;
  const screenshots = [];
  const canvasCaptures = new Map<string, CanvasCapture>();
  for (const capture of captures) {
    const query = new URLSearchParams({ lab: 'wp04', ao: capture.ao });
    if (capture.debug !== 'surface') query.set('debug', capture.debug);
    await page.goto(`/?${query}`);
    await expectWp04(page, capture.ao, capture.debug);
    await page.waitForTimeout(3_000);
    await configureView(page, capture.preset);
    const zoomInWheelSteps = capture.file === 'ao-level-debug.png' ? CONCAVE_ZOOM_IN_STEPS : 0;
    await zoomIn(page, zoomInWheelSteps);
    const canvasCapture = await captureCanvasWithoutUi(page, zoomInWheelSteps);
    canvasCaptures.set(capture.source, canvasCapture);
    if (capture.file === 'overview-ao-on.png') {
      const repeatCapture = await captureCanvasWithoutUi(page, zoomInWheelSteps);
      expect(repeatCapture.state).toEqual(canvasCapture.state);
      canvasCaptures.set('wp04-overview-ao-on-repeat-canvas-v1', repeatCapture);
    }
    let png: Buffer;
    if (capture.file === 'concave-corner-ao.png') {
      const comparison = await context.newPage();
      await comparison.goto('/?lab=wp04&ao=off');
      await expectWp04(comparison, 'off');
      await comparison.waitForTimeout(3_000);
      await configureView(comparison, capture.preset);
      const offCapture = await captureCanvasWithoutUi(comparison, 0);
      expect(offCapture.state).toEqual(canvasCapture.state);
      canvasCaptures.set('wp04-concave-corner-ao-off-canvas-v1', offCapture);
      const roi = resolveCanvasRoi('wp04-concave-corner-roi-v1', canvasCapture.state.canvas.width, canvasCapture.state.canvas.height);
      png = await composeConcaveComparison(
        page,
        await cropPng(page, canvasCapture.png, roi),
        await cropPng(page, offCapture.png, roi),
      );
      await comparison.close();
    } else {
      png = await page.screenshot();
    }
    const outputPath = path.join(evidenceDirectory, capture.file);
    await writeFile(outputPath, png);
    const dimensions = await pngDimensions(context, png);
    expect(dimensions).toEqual({ width: 1920, height: 1080 });
    screenshots.push({
      path: `evidence/wp04/${capture.file}`, mode: capture.debug, ao: capture.ao, preset: capture.preset,
      toggles: {
        filled: true, blockEdges: false, meshQuadEdges: false, normals: false, chunkBounds: false,
        aoComparison: capture.file === 'concave-corner-ao.png' ? ['off', 'on'] : null,
        selectedDiagonals: capture.debug === 'diagonal-normal' || capture.debug === 'diagonal-flipped',
      },
      zoomInWheelSteps,
      canvasSourceCaptures: capture.file === 'concave-corner-ao.png'
        ? [capture.source, 'wp04-concave-corner-ao-off-canvas-v1']
        : [capture.source],
      selectedDiagonalBytes: await metricNumber(page, 'metric-debug-diagonal-bytes'),
      sourceRendererAttributeColorCount: await metricNumber(page, 'metric-debug-color-count'),
      ...dimensions, sha256: createHash('sha256').update(png).digest('hex'),
    });
  }

  const overviewOff = canvasCaptures.get('wp04-overview-ao-off-canvas-v1')!;
  const overviewOn = canvasCaptures.get('wp04-overview-ao-on-canvas-v1')!;
  const overviewOnRepeat = canvasCaptures.get('wp04-overview-ao-on-repeat-canvas-v1')!;
  expect(overviewOff.state).toEqual(overviewOn.state);
  expect(overviewOnRepeat.state).toEqual(overviewOn.state);
  expect([overviewOff.ambientOcclusion, overviewOn.ambientOcclusion, overviewOnRepeat.ambientOcclusion]).toEqual(['off', 'on', 'on']);
  const overviewSurfaceDifference = await imageDifference(page, overviewOff.png, overviewOn.png);
  const overviewRepeatDifference = await imageDifference(page, overviewOn.png, overviewOnRepeat.png);
  expect(overviewRepeatDifference).toBeLessThanOrEqual(OVERVIEW_MAX_REPEAT_DIFFERENCE);
  expect(overviewSurfaceDifference).toBeGreaterThan(OVERVIEW_MIN_SURFACE_DIFFERENCE);

  const concaveOff = canvasCaptures.get('wp04-concave-corner-ao-off-canvas-v1')!;
  const concaveOn = canvasCaptures.get('wp04-concave-corner-ao-on-canvas-v1')!;
  expect(concaveOff.state).toEqual(concaveOn.state);
  expect([concaveOff.ambientOcclusion, concaveOn.ambientOcclusion]).toEqual(['off', 'on']);
  const concaveRoi = resolveCanvasRoi('wp04-concave-corner-roi-v1', concaveOn.state.canvas.width, concaveOn.state.canvas.height);
  const concaveCornerRoiAoDifference = await imageDifference(
    page, await cropPng(page, concaveOff.png, concaveRoi), await cropPng(page, concaveOn.png, concaveRoi),
  );
  expect(concaveCornerRoiAoDifference).toBeGreaterThan(0.0001);

  await page.goto('/?lab=wp04&ao=off');
  await expectWp04(page, 'off');
  await page.waitForTimeout(3_000);
  await configureView(page, 'chunk-seam-closeup');
  const seamOff = await captureCanvasWithoutUi(page, 0);
  canvasCaptures.set('wp04-chunk-seam-ao-off-canvas-v1', seamOff);
  const seamOn = canvasCaptures.get('wp04-chunk-seam-ao-on-canvas-v1')!;
  expect(seamOff.state).toEqual(seamOn.state);
  expect([seamOff.ambientOcclusion, seamOn.ambientOcclusion]).toEqual(['off', 'on']);
  const seamRoi = resolveCanvasRoi('wp04-chunk-seam-roi-v1', seamOn.state.canvas.width, seamOn.state.canvas.height);
  const chunkSeamRoiAoDifference = await imageDifference(
    page, await cropPng(page, seamOff.png, seamRoi), await cropPng(page, seamOn.png, seamRoi),
  );
  expect(chunkSeamRoiAoDifference).toBeLessThan(0.001);

  await page.goto('/?lab=wp04&ao=off');
  await expectWp04(page, 'off');
  await page.waitForTimeout(3_000);
  await configureView(page, 'solid-cube');
  const flatOff = await captureCanvasWithoutUi(page, 0);
  canvasCaptures.set('wp04-flat-surface-ao-off-canvas-v1', flatOff);
  await page.goto('/?lab=wp04&ao=on');
  await expectWp04(page, 'on');
  await page.waitForTimeout(3_000);
  await configureView(page, 'solid-cube');
  const flatOn = await captureCanvasWithoutUi(page, 0);
  canvasCaptures.set('wp04-flat-surface-ao-on-canvas-v1', flatOn);
  expect(flatOff.state).toEqual(flatOn.state);
  expect([flatOff.ambientOcclusion, flatOn.ambientOcclusion]).toEqual(['off', 'on']);
  const flatRoi = resolveCanvasRoi('wp04-flat-surface-roi-v1', flatOn.state.canvas.width, flatOn.state.canvas.height);
  const flatSurfaceRoiAoDifference = await imageDifference(
    page, await cropPng(page, flatOff.png, flatRoi), await cropPng(page, flatOn.png, flatRoi),
  );
  expect(flatSurfaceRoiAoDifference).toBeLessThan(0.001);

  const aoLevelCapture = canvasCaptures.get('wp04-ao-level-debug-canvas-v1')!;
  const aoLevelRoi = resolveCanvasRoi('wp04-ao-level-roi-v1', aoLevelCapture.state.canvas.width, aoLevelCapture.state.canvas.height);
  const aoDebugFramebufferSamples = await sampleAoDebugFramebuffer(page, aoLevelCapture.png);
  const aoDebugEvidenceSamples = aoDebugFramebufferSamples.map((sample) => ({
    ...sample,
    sourceVertexAttributeRgb8: SOURCE_AO_DEBUG_RGB8[sample.sourceClass]!,
  }));
  expect(aoDebugFramebufferSamples.map(({ sourceClass }) => sourceClass)).toEqual([0, 1, 2, 3]);
  for (const sample of aoDebugFramebufferSamples) {
    expect(sample.x - sample.radius).toBeGreaterThanOrEqual(aoLevelRoi.x);
    expect(sample.y - sample.radius).toBeGreaterThanOrEqual(aoLevelRoi.y);
    expect(sample.x + sample.radius).toBeLessThan(aoLevelRoi.x + aoLevelRoi.width);
    expect(sample.y + sample.radius).toBeLessThan(aoLevelRoi.y + aoLevelRoi.height);
    for (let channel = 0; channel < 3; channel += 1) {
      expect(Math.abs(sample.measuredFramebufferRgb8[channel]! - sample.expectedFramebufferRgb8[channel]!))
        .toBeLessThanOrEqual(AO_DEBUG_FRAMEBUFFER_TOLERANCE_RGB8);
      expect(Math.abs(sample.patchMinRgb8[channel]! - sample.expectedFramebufferRgb8[channel]!))
        .toBeLessThanOrEqual(AO_DEBUG_FRAMEBUFFER_TOLERANCE_RGB8);
      expect(Math.abs(sample.patchMaxRgb8[channel]! - sample.expectedFramebufferRgb8[channel]!))
        .toBeLessThanOrEqual(AO_DEBUG_FRAMEBUFFER_TOLERANCE_RGB8);
    }
  }

  await page.goto('/?lab=wp04&ao=on');
  await expectWp04(page, 'on');
  expect(WP04_AO_GOLDEN.aoHistogram.reduce((sum, value) => sum + value, 0)).toBe(WP04_AO_GOLDEN.quads * 4);
  expect(WP04_AO_GOLDEN.normalDiagonalCount + WP04_AO_GOLDEN.flippedDiagonalCount).toBe(WP04_AO_GOLDEN.quads);
  expect(WP04_AO_GOLDEN.triangles).toBe(WP04_AO_GOLDEN.quads * 2);
  expect(WP04_AO_GOLDEN.meshPositionBytes).toBe(WP04_AO_GOLDEN.quads * 48);
  expect(WP04_AO_GOLDEN.meshNormalBytes).toBe(WP04_AO_GOLDEN.quads * 48);
  expect(WP04_AO_GOLDEN.meshIndexBytes).toBe(WP04_AO_GOLDEN.quads * 24);
  expect(WP04_AO_GOLDEN.meshMaterialIdBytes).toBe(WP04_AO_GOLDEN.quads * 4);
  expect(WP04_AO_GOLDEN.aoAttributeBytes).toBe(WP04_AO_GOLDEN.quads * 4);
  expect(WP04_AO_GOLDEN.neutralMeshTotalBytes).toBe(WP04_AO_GOLDEN.quads * 128);
  expect(WP04_AO_GOLDEN.packedRendererColorBytes).toBe(WP04_AO_GOLDEN.quads * 12);

  const roiContract = (roi: CanvasRoi, fields: {
    readonly referenceCapture: string;
    readonly candidateCapture: string;
    readonly operator: 'greater-than' | 'less-than';
    readonly threshold: number;
    readonly measured: number;
  }) => ({
    ...roi, space: 'canvas-pixel', ...fields, metric: IMAGE_METRIC_VERSION, includesUi: false,
  });
  const canvasSources = Object.fromEntries(await Promise.all([...canvasCaptures].map(async ([id, capture]) => {
    const dimensions = await pngDimensions(context, capture.png);
    expect(dimensions).toEqual(capture.state.canvas);
    return [id, {
      byteSource: 'transient-canvas-png',
      sha256: createHash('sha256').update(capture.png).digest('hex'),
      ...dimensions,
      includesUi: capture.includesUi,
      state: { ambientOcclusion: capture.ambientOcclusion, ...capture.state },
    }] as const;
  })));
  const manifest = {
    basisSha: 'd95992df05952ac4be6221ca1809c1c9e3c0ac9d',
    fixture: { id: LARGE_FIXTURE_ID, version: LARGE_FIXTURE_VERSION, seed: DEFAULT_FIXTURE_SEED, worldHash: WP02_FIXTURE_GOLDEN.worldHash },
    goldenReferences: ['tests/contracts/wp02FixtureGolden.ts', 'tests/contracts/wp03GreedyGolden.ts'],
    priorGreedy: { quads: WP03_GREEDY_GOLDEN.quads, neutralMeshBytes: WP03_GREEDY_GOLDEN.meshTotalBytes },
    palette: { id: PALETTE_V1.id, version: PALETTE_V1.version, hash: PALETTE_V1.hash },
    aoDarkness: AO_DARKNESS,
    aoHistogramScope: 'mesh-vertex-ao-levels',
    diagonalCountScope: 'emitted-quads',
    coverageScope: 'material-aware-world-unit-faces',
    imageMetricVersion: IMAGE_METRIC_VERSION,
    roiContractVersion: ROI_CONTRACT_VERSION,
    canvasSources,
    ao: {
      histogram: WP04_AO_GOLDEN.aoHistogram,
      normalDiagonalCount: WP04_AO_GOLDEN.normalDiagonalCount,
      flippedDiagonalCount: WP04_AO_GOLDEN.flippedDiagonalCount,
      splitDeltaVsWp03: WP04_AO_GOLDEN.aoSplitDeltaVsWp03,
    },
    coverage: { coveredUnitFaces: WP04_AO_GOLDEN.coveredUnitFaces, materialAwareHash: WP04_AO_GOLDEN.coverageHash },
    geometry: {
      quads: WP04_AO_GOLDEN.quads, triangles: WP04_AO_GOLDEN.triangles,
      bytes: {
        positions: WP04_AO_GOLDEN.meshPositionBytes, normals: WP04_AO_GOLDEN.meshNormalBytes,
        indices: WP04_AO_GOLDEN.meshIndexBytes, materials: WP04_AO_GOLDEN.meshMaterialIdBytes,
        ao: WP04_AO_GOLDEN.aoAttributeBytes, neutralTotal: WP04_AO_GOLDEN.neutralMeshTotalBytes,
        packedRendererColors: WP04_AO_GOLDEN.packedRendererColorBytes,
      },
    },
    imageChecks: {
      overviewSurfaceDifference: {
        referenceCapture: 'wp04-overview-ao-off-canvas-v1', candidateCapture: 'wp04-overview-ao-on-canvas-v1',
        comparisonSource: 'canvas-only', includesUi: false, metric: IMAGE_METRIC_VERSION,
        operator: 'greater-than', threshold: OVERVIEW_MIN_SURFACE_DIFFERENCE, measured: overviewSurfaceDifference,
        thresholdBasis: 'Minimum is 10x the accepted same-state repeat-capture noise ceiling.',
        noiseControl: {
          referenceCapture: 'wp04-overview-ao-on-canvas-v1',
          candidateCapture: 'wp04-overview-ao-on-repeat-canvas-v1',
          operator: 'less-than-or-equal', threshold: OVERVIEW_MAX_REPEAT_DIFFERENCE, measured: overviewRepeatDifference,
        },
      },
      rois: [
        roiContract(concaveRoi, {
          referenceCapture: 'wp04-concave-corner-ao-off-canvas-v1',
          candidateCapture: 'wp04-concave-corner-ao-on-canvas-v1',
          operator: 'greater-than', threshold: 0.0001, measured: concaveCornerRoiAoDifference,
        }),
        {
          ...roiContract(seamRoi, {
            referenceCapture: 'wp04-chunk-seam-ao-off-canvas-v1',
            candidateCapture: 'wp04-chunk-seam-ao-on-canvas-v1',
            operator: 'less-than', threshold: 0.001, measured: chunkSeamRoiAoDifference,
          }),
          evidenceScope: 'optical-uniformity-of-unoccluded-surface',
          limitation: 'This ROI does not claim nontrivial AO at the fixture seam.',
          nontrivialAoContinuityProof: 'tests/unit/ao-greedy-mesher.test.ts covers X/Y/Z chunk seams and a three-neighbor chunk corner independently.',
        },
        roiContract(flatRoi, {
          referenceCapture: 'wp04-flat-surface-ao-off-canvas-v1',
          candidateCapture: 'wp04-flat-surface-ao-on-canvas-v1',
          operator: 'less-than', threshold: 0.001, measured: flatSurfaceRoiAoDifference,
        }),
      ],
    },
    aoDebugEvidence: {
      sourceAoDebugClassCount: 4,
      sourceAoDebugRgb8: SOURCE_AO_DEBUG_RGB8,
      sourceScope: 'discrete-input-classes-of-normalized-vertex-color-attribute',
      framebufferSemantics: 'Lambert lighting, interpolation, and antialiasing may produce more than four raster colors.',
      selectedEvidenceRoi: {
        ...aoLevelRoi, space: 'canvas-pixel', sourceCapture: 'wp04-ao-level-debug-canvas-v1',
        curatedScreenshot: 'evidence/wp04/ao-level-debug.png', includesUi: false,
        sampleContractVersion: AO_DEBUG_SAMPLE_CONTRACT_VERSION,
        sampleSemantics: 'One calibrated uniform 5x5 interior framebuffer patch per source AO class; no hue classifier or pixel-count inference.',
        framebufferToleranceRgb8: AO_DEBUG_FRAMEBUFFER_TOLERANCE_RGB8,
        samples: aoDebugEvidenceSamples,
        operator: 'all-patches-within-rgb8-tolerance',
      },
    },
    timing: {
      classification: 'diagnostic only; not a benchmark gate',
      meshTotalMs: await metricNumber(page, 'metric-mesh-total'),
      meshP50Ms: await metricNumber(page, 'metric-mesh-p50'),
      meshP95Ms: await metricNumber(page, 'metric-mesh-p95'),
    },
    gpuMemory: 'Unknown / unavailable',
    captureContract: { browser: 'Google Chrome', productionPreview: true, width: 1920, height: 1080, deviceScaleFactor: 1, warmupMs: 3_000, settleMs: 600 },
    screenshots,
  };
  await writeFile(path.join(evidenceDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const parsed = JSON.parse(await readFile(path.join(evidenceDirectory, 'manifest.json'), 'utf8')) as typeof manifest;
  expect(parsed.geometry.quads).toBe(WP04_AO_GOLDEN.quads);
  expect(parsed.palette.hash).toBe(WP04_AO_GOLDEN.paletteHash);
  expect(parsed.imageChecks.overviewSurfaceDifference.includesUi).toBe(false);
  expect(parsed.imageChecks.overviewSurfaceDifference.measured).toBeGreaterThan(parsed.imageChecks.overviewSurfaceDifference.threshold);
  expect(parsed.imageChecks.overviewSurfaceDifference.noiseControl.measured)
    .toBeLessThanOrEqual(parsed.imageChecks.overviewSurfaceDifference.noiseControl.threshold);
  expect(parsed.imageChecks.rois.every(({ includesUi }) => includesUi === false)).toBe(true);
  expect(parsed.imageChecks.rois.map(({ id }) => id)).toEqual([
    'wp04-concave-corner-roi-v1', 'wp04-chunk-seam-roi-v1', 'wp04-flat-surface-roi-v1',
  ]);
  const referencedCanvasSources = [
    parsed.imageChecks.overviewSurfaceDifference.referenceCapture,
    parsed.imageChecks.overviewSurfaceDifference.candidateCapture,
    parsed.imageChecks.overviewSurfaceDifference.noiseControl.candidateCapture,
    ...parsed.imageChecks.rois.flatMap(({ referenceCapture, candidateCapture }) => [referenceCapture, candidateCapture]),
    parsed.aoDebugEvidence.selectedEvidenceRoi.sourceCapture,
    ...parsed.screenshots.flatMap(({ canvasSourceCaptures }) => canvasSourceCaptures),
  ];
  for (const source of referencedCanvasSources) {
    expect(parsed.canvasSources[source]).toMatchObject({ width: 1920, height: 1080, includesUi: false });
    expect(parsed.canvasSources[source]!.sha256).toMatch(/^[0-9a-f]{64}$/);
  }
  expect(parsed.aoDebugEvidence.sourceAoDebugClassCount).toBe(4);
  expect(parsed.aoDebugEvidence.selectedEvidenceRoi.samples.map(({ sourceClass }) => sourceClass)).toEqual([0, 1, 2, 3]);
  expect(parsed.screenshots.find(({ path: screenshotPath }) => screenshotPath.endsWith('chunk-seam-ao.png'))?.toggles.chunkBounds).toBe(false);
  expect(parsed.screenshots.every(({ sha256 }) => /^[0-9a-f]{64}$/.test(sha256))).toBe(true);
  expect((await readdir(evidenceDirectory)).sort()).toEqual([
    'ao-level-debug.png', 'chunk-seam-ao.png', 'concave-corner-ao.png', 'diagonal-flipped.png',
    'diagonal-normal.png', 'manifest.json', 'overview-ao-off.png', 'overview-ao-on.png',
  ]);
  expect(failures).toEqual({ consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [] });
});

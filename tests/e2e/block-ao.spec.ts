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

test('@evidence-wp04 captures curated AO contracts and manifest', async ({ context, page }) => {
  test.setTimeout(120_000);
  const failures = trackPageFailures(page);
  await mkdir(evidenceDirectory, { recursive: true });
  const captures = [
    { file: 'overview-ao-off.png', ao: 'off', debug: 'surface', preset: 'overview' },
    { file: 'overview-ao-on.png', ao: 'on', debug: 'surface', preset: 'overview' },
    { file: 'concave-corner-ao.png', ao: 'on', debug: 'surface', preset: 'concave-corner' },
    { file: 'diagonal-normal.png', ao: 'on', debug: 'diagonal-normal', preset: 'concave-corner' },
    { file: 'diagonal-flipped.png', ao: 'on', debug: 'diagonal-flipped', preset: 'concave-corner' },
    { file: 'chunk-seam-ao.png', ao: 'on', debug: 'surface', preset: 'chunk-seam-closeup' },
    { file: 'ao-level-debug.png', ao: 'on', debug: 'ao-levels', preset: 'concave-corner' },
  ] as const;
  const screenshots = [];
  const canvasByFile = new Map<string, Buffer>();
  for (const capture of captures) {
    const query = new URLSearchParams({ lab: 'wp04', ao: capture.ao });
    if (capture.debug !== 'surface') query.set('debug', capture.debug);
    await page.goto(`/?${query}`);
    await expectWp04(page, capture.ao, capture.debug);
    await page.waitForTimeout(3_000);
    await configureView(page, capture.preset);
    if (capture.file === 'chunk-seam-ao.png') await page.getByTestId('chunk-bounds-toggle').check();
    if (capture.file === 'concave-corner-ao.png') {
      const comparison = await context.newPage();
      await comparison.goto('/?lab=wp04&ao=off');
      await expectWp04(comparison, 'off');
      await configureView(comparison, capture.preset);
      const offCanvas = await comparison.getByTestId('voxel-canvas').screenshot();
      await page.evaluate((source) => {
        const figure = document.createElement('figure');
        figure.style.cssText = 'position:fixed;right:24px;bottom:24px;width:38vw;margin:0;border:3px solid #f8fafc;box-shadow:0 4px 18px rgb(31 41 51 / 25%)';
        const image = document.createElement('img');
        image.alt = '';
        image.src = source;
        image.style.cssText = 'display:block;width:100%';
        const caption = document.createElement('figcaption');
        caption.textContent = 'AO Off comparison';
        caption.style.cssText = 'position:absolute;left:8px;top:8px;padding:4px 7px;border-radius:3px;color:#fff;background:#1d2630;font:700 0.72rem system-ui';
        figure.append(image, caption);
        document.body.append(figure);
      }, `data:image/png;base64,${offCanvas.toString('base64')}`);
      await comparison.close();
    }
    const canvas = await page.getByTestId('voxel-canvas').screenshot();
    canvasByFile.set(capture.file, canvas);
    const outputPath = path.join(evidenceDirectory, capture.file);
    await page.screenshot({ path: outputPath });
    const png = await readFile(outputPath);
    const dimensions = await pngDimensions(context, png);
    expect(dimensions).toEqual({ width: 1920, height: 1080 });
    screenshots.push({
      path: `evidence/wp04/${capture.file}`, mode: capture.debug, ao: capture.ao, preset: capture.preset,
      toggles: {
        filled: true, blockEdges: false, meshQuadEdges: false, normals: false, chunkBounds: capture.file === 'chunk-seam-ao.png',
        aoComparison: capture.file === 'concave-corner-ao.png' ? ['off', 'on'] : null,
        selectedDiagonals: capture.debug === 'diagonal-normal' || capture.debug === 'diagonal-flipped',
      },
      selectedDiagonalBytes: await metricNumber(page, 'metric-debug-diagonal-bytes'),
      activeDebugColors: await metricNumber(page, 'metric-debug-color-count'),
      ...dimensions, sha256: createHash('sha256').update(png).digest('hex'),
    });
  }

  const overviewDifference = await imageDifference(page, canvasByFile.get('overview-ao-off.png')!, canvasByFile.get('overview-ao-on.png')!);
  expect(overviewDifference).toBeGreaterThan(0);

  await page.goto('/?lab=wp04&ao=off');
  await configureView(page, 'concave-corner');
  const concaveOffRoi = await canvasRoi(page);
  await page.goto('/?lab=wp04&ao=on');
  await configureView(page, 'concave-corner');
  const concaveOnRoi = await canvasRoi(page);
  const concaveCornerRoiAoDifference = await imageDifference(page, concaveOffRoi, concaveOnRoi);
  expect(concaveCornerRoiAoDifference).toBeGreaterThan(0.0001);

  await page.goto('/?lab=wp04&ao=off');
  await configureView(page, 'chunk-seam-closeup');
  const seamOffRoi = await canvasRoi(page);
  await page.goto('/?lab=wp04&ao=on');
  await configureView(page, 'chunk-seam-closeup');
  const seamOnRoi = await canvasRoi(page);
  const chunkSeamRoiAoDifference = await imageDifference(page, seamOffRoi, seamOnRoi);
  expect(chunkSeamRoiAoDifference).toBeLessThan(0.001);

  await page.goto('/?lab=wp04&ao=off');
  await configureView(page, 'solid-cube');
  const flatOffRoi = await canvasRoi(page);
  await page.goto('/?lab=wp04&ao=on');
  await configureView(page, 'solid-cube');
  const flatOnRoi = await canvasRoi(page);
  const flatSurfaceRoiAoDifference = await imageDifference(page, flatOffRoi, flatOnRoi);
  expect(flatSurfaceRoiAoDifference).toBeLessThan(0.001);
  await page.goto('/?lab=wp04&ao=on');
  await expectWp04(page, 'on');
  const manifest = {
    basisSha: 'd95992df05952ac4be6221ca1809c1c9e3c0ac9d',
    fixture: { id: LARGE_FIXTURE_ID, version: LARGE_FIXTURE_VERSION, seed: DEFAULT_FIXTURE_SEED, worldHash: WP02_FIXTURE_GOLDEN.worldHash },
    goldenReferences: ['tests/contracts/wp02FixtureGolden.ts', 'tests/contracts/wp03GreedyGolden.ts'],
    priorGreedy: { quads: WP03_GREEDY_GOLDEN.quads, neutralMeshBytes: WP03_GREEDY_GOLDEN.meshTotalBytes },
    palette: { id: PALETTE_V1.id, version: PALETTE_V1.version, hash: PALETTE_V1.hash },
    aoDarkness: AO_DARKNESS,
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
    imageChecks: { overviewCanvasDifference: overviewDifference, concaveCornerRoiAoDifference, chunkSeamRoiAoDifference, flatSurfaceRoiAoDifference },
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
  expect(parsed.screenshots.every(({ sha256 }) => /^[0-9a-f]{64}$/.test(sha256))).toBe(true);
  expect((await readdir(evidenceDirectory)).sort()).toEqual([
    'ao-level-debug.png', 'chunk-seam-ao.png', 'concave-corner-ao.png', 'diagonal-flipped.png',
    'diagonal-normal.png', 'manifest.json', 'overview-ao-off.png', 'overview-ao-on.png',
  ]);
  expect(failures).toEqual({ consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [] });
});

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_FIXTURE_SEED, LARGE_FIXTURE_ID, LARGE_FIXTURE_VERSION } from '../../src/voxel/largeFixture';
import { WP02_FIXTURE_GOLDEN } from '../contracts/wp02FixtureGolden';
import { WP03_GREEDY_GOLDEN } from '../contracts/wp03GreedyGolden';
import { imageDifference, metricNumber, pngDimensions, trackPageFailures } from './support';

const wp03EvidenceDirectory = path.join(process.cwd(), 'evidence', 'wp03');

async function setView(page: Page, options: {
  readonly preset: string;
  readonly blockEdges: boolean;
  readonly meshQuadEdges: boolean;
}): Promise<void> {
  await page.getByTestId('camera-preset').selectOption(options.preset);
  await page.getByTestId('wireframe-toggle').uncheck();
  await page.getByTestId('block-edge-toggle').setChecked(options.blockEdges);
  await page.getByTestId('mesh-quad-edge-toggle').setChecked(options.meshQuadEdges);
  await page.getByTestId('normal-toggle').uncheck();
  await page.getByTestId('chunk-bounds-toggle').uncheck();
  await page.waitForTimeout(600);
}

async function expectWp03Contract(page: Page, mesher: 'visible' | 'greedy'): Promise<void> {
  const app = page.getByTestId('voxel-app');
  await expect(app).toHaveAttribute('data-ready', 'true');
  await expect(app).toHaveAttribute('data-lab', 'wp03');
  await expect(app).toHaveAttribute('data-mesher', mesher);
  await expect(app).toHaveAttribute('data-world-hash', WP02_FIXTURE_GOLDEN.worldHash);
  await expect(page.getByTestId('metric-active-mesher')).toHaveText(mesher === 'visible' ? 'Visible Faces' : 'Greedy');
  await expect(page.getByTestId('metric-covered-unit-faces')).toHaveText('59,350');
  await expect(page.getByTestId('metric-visible-quads')).toHaveText('59,350');
  await expect(page.getByTestId('metric-greedy-quads')).toHaveText('19,073');
  await expect(page.getByTestId('metric-active-filled-mesh-sets')).toHaveText('1');
  expect(await metricNumber(page, 'metric-materialized-chunks')).toBe(WP02_FIXTURE_GOLDEN.materializedChunks);
  expect(await metricNumber(page, 'metric-occupied')).toBe(WP02_FIXTURE_GOLDEN.occupiedVoxels);
  expect(await metricNumber(page, 'metric-quads')).toBe(mesher === 'visible' ? WP02_FIXTURE_GOLDEN.exposedQuads : WP03_GREEDY_GOLDEN.quads);
  expect(await metricNumber(page, 'metric-triangles')).toBe(mesher === 'visible' ? WP02_FIXTURE_GOLDEN.triangles : WP03_GREEDY_GOLDEN.triangles);
  expect(await metricNumber(page, 'metric-mesh-total-bytes')).toBe(
    mesher === 'visible' ? 7_359_400 : WP03_GREEDY_GOLDEN.meshTotalBytes,
  );
}

test('defaults to WP03 Greedy and exposes the exact A/B contract', async ({ page }) => {
  const failures = trackPageFailures(page);
  await page.goto('/');
  await expectWp03Contract(page, 'greedy');
  await expect(page.getByTestId('mesher-select')).toHaveValue('greedy');
  await expect(page.getByTestId('metric-gpu-memory-bytes')).toHaveText('Unknown / unavailable');
  await expect(page.getByTestId('telemetry-classification')).toContainText('not a steady-state benchmark');
  expect(await page.evaluate(() => 'TestBridge' in window || '__VOXEL_TEST__' in window)).toBe(false);
  expect(failures).toEqual({ consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [] });
});

test('loads explicit A/B routes and switches mesher through controlled navigation', async ({ page }) => {
  await page.goto('/?lab=wp03&mesher=visible');
  await expectWp03Contract(page, 'visible');
  await expect(page.getByTestId('mesher-select')).toHaveValue('visible');
  await Promise.all([
    page.waitForURL(/lab=wp03&mesher=greedy/),
    page.getByTestId('mesher-select').selectOption('greedy'),
  ]);
  await expectWp03Contract(page, 'greedy');
  await page.goto('/?lab=wp03');
  await expectWp03Contract(page, 'greedy');
});

test('fails closed for invalid, duplicate, or incompatible mesher queries', async ({ page }) => {
  for (const route of [
    '/?lab=wp03&mesher=', '/?lab=wp03&mesher=other', '/?lab=wp03&mesher=greedy&mesher=visible',
    '/?lab=wp02&mesher=greedy', '/?mesher=greedy',
  ]) {
    await page.goto(route);
    await expect(page.getByTestId('voxel-app')).toHaveAttribute('data-ready', 'error');
    await expect(page.getByTestId('voxel-app')).toHaveAttribute('data-lab', 'invalid');
    await expect(page.getByTestId('app-status')).toContainText(/mesher/i);
  }
});

test('keeps block topology visually stable and separates active mesh-quad edges', async ({ page }) => {
  await page.goto('/?lab=wp03&mesher=visible');
  await expectWp03Contract(page, 'visible');
  await setView(page, { preset: 'overview', blockEdges: true, meshQuadEdges: false });
  const visibleBlockEdgeBytes = await metricNumber(page, 'metric-debug-edge-bytes');
  const visibleQuadEdgeBytes = await metricNumber(page, 'metric-debug-mesh-quad-edge-bytes');
  const visibleCanvas = await page.getByTestId('voxel-canvas').screenshot();

  await page.goto('/?lab=wp03&mesher=greedy');
  await expectWp03Contract(page, 'greedy');
  await setView(page, { preset: 'overview', blockEdges: true, meshQuadEdges: false });
  expect(await metricNumber(page, 'metric-debug-edge-bytes')).toBe(visibleBlockEdgeBytes);
  expect(await metricNumber(page, 'metric-debug-mesh-quad-edge-bytes')).not.toBe(visibleQuadEdgeBytes);
  const greedyCanvas = await page.getByTestId('voxel-canvas').screenshot();
  expect(await imageDifference(page, visibleCanvas, greedyCanvas)).toBeLessThan(0.01);

  const withoutQuadEdges = await page.getByTestId('voxel-canvas').screenshot();
  await page.getByTestId('block-edge-toggle').uncheck();
  await page.getByTestId('mesh-quad-edge-toggle').check();
  await page.waitForTimeout(600);
  expect(await imageDifference(page, withoutQuadEdges, await page.getByTestId('voxel-canvas').screenshot())).toBeGreaterThan(0.001);
  await page.getByTestId('wireframe-toggle').check();
  await expect(page.getByTestId('metric-draw-calls')).toHaveText('1');
  await expect(page.getByTestId('mesh-quad-edge-toggle')).toBeChecked();
});

test('@evidence-wp03 captures deterministic A/B views and manifest', async ({ context, page }) => {
  const failures = trackPageFailures(page);
  await mkdir(wp03EvidenceDirectory, { recursive: true });
  const screenshots: Array<{
    path: string;
    mesher: 'visible' | 'greedy';
    preset: string;
    zoneId: string | null;
    toggles: { filled: boolean; blockEdges: boolean; meshQuadEdges: boolean; normals: boolean; chunkBounds: boolean };
    width: number;
    height: number;
    activeQuads: number;
    coveredUnitFaces: number;
    meshQuadEdgeBytes: number;
    sha256: string;
  }> = [];

  const capture = async (
    mesher: 'visible' | 'greedy',
    preset: string,
    file: string,
    blockEdges: boolean,
    meshQuadEdges: boolean,
  ): Promise<Buffer> => {
    await page.goto(`/?lab=wp03&mesher=${mesher}`);
    await expectWp03Contract(page, mesher);
    await page.waitForTimeout(3_000);
    await setView(page, { preset, blockEdges, meshQuadEdges });
    const canvas = await page.getByTestId('voxel-canvas').screenshot();
    const outputPath = path.join(wp03EvidenceDirectory, file);
    await page.screenshot({ path: outputPath });
    const png = await readFile(outputPath);
    const dimensions = await pngDimensions(context, png);
    expect(dimensions).toEqual({ width: 1920, height: 1080 });
    screenshots.push({
      path: `evidence/wp03/${file}`,
      mesher,
      preset,
      zoneId: preset === 'overview' ? null : preset,
      toggles: { filled: true, blockEdges, meshQuadEdges, normals: false, chunkBounds: false },
      ...dimensions,
      activeQuads: await metricNumber(page, 'metric-quads'),
      coveredUnitFaces: await metricNumber(page, 'metric-covered-unit-faces'),
      meshQuadEdgeBytes: await metricNumber(page, 'metric-debug-mesh-quad-edge-bytes'),
      sha256: createHash('sha256').update(png).digest('hex'),
    });
    return canvas;
  };

  const visibleOverview = await capture('visible', 'overview', 'overview-visible-blocks.png', true, false);
  const visible = {
    quads: await metricNumber(page, 'metric-quads'),
    triangles: await metricNumber(page, 'metric-triangles'),
    memory: {
      positions: await metricNumber(page, 'metric-mesh-position-bytes'), normals: await metricNumber(page, 'metric-mesh-normal-bytes'),
      indices: await metricNumber(page, 'metric-mesh-index-bytes'), materials: await metricNumber(page, 'metric-mesh-material-id-bytes'),
      total: await metricNumber(page, 'metric-mesh-total-bytes'),
    },
    timing: {
      total: await metricNumber(page, 'metric-mesh-total'), p50: await metricNumber(page, 'metric-mesh-p50'), p95: await metricNumber(page, 'metric-mesh-p95'),
    },
    drawCalls: await metricNumber(page, 'metric-draw-calls'),
    debug: {
      blockEdges: await metricNumber(page, 'metric-debug-edge-bytes'), meshQuadEdges: await metricNumber(page, 'metric-debug-mesh-quad-edge-bytes'),
      normals: await metricNumber(page, 'metric-debug-normal-bytes'), colors: await metricNumber(page, 'metric-renderer-color-attribute-bytes'),
      chunkBounds: await metricNumber(page, 'metric-debug-chunk-bounds-bytes'),
    },
  };
  const greedyOverview = await capture('greedy', 'overview', 'overview-greedy-blocks.png', true, false);
  const greedy = {
    quads: await metricNumber(page, 'metric-quads'),
    triangles: await metricNumber(page, 'metric-triangles'),
    memory: {
      positions: await metricNumber(page, 'metric-mesh-position-bytes'), normals: await metricNumber(page, 'metric-mesh-normal-bytes'),
      indices: await metricNumber(page, 'metric-mesh-index-bytes'), materials: await metricNumber(page, 'metric-mesh-material-id-bytes'),
      total: await metricNumber(page, 'metric-mesh-total-bytes'),
    },
    timing: {
      total: await metricNumber(page, 'metric-mesh-total'), p50: await metricNumber(page, 'metric-mesh-p50'), p95: await metricNumber(page, 'metric-mesh-p95'),
    },
    drawCalls: await metricNumber(page, 'metric-draw-calls'),
    debug: {
      blockEdges: await metricNumber(page, 'metric-debug-edge-bytes'), meshQuadEdges: await metricNumber(page, 'metric-debug-mesh-quad-edge-bytes'),
      normals: await metricNumber(page, 'metric-debug-normal-bytes'), colors: await metricNumber(page, 'metric-renderer-color-attribute-bytes'),
      chunkBounds: await metricNumber(page, 'metric-debug-chunk-bounds-bytes'),
    },
  };
  const overviewCanvasImageDifference = await imageDifference(page, visibleOverview, greedyOverview);
  expect(overviewCanvasImageDifference).toBeLessThan(0.01);
  await capture('greedy', 'solid-cube', 'solid-cube-greedy-quads.png', false, true);
  await capture('greedy', 'checkerboard', 'checkerboard-greedy-quads.png', false, true);

  const percent = (absolute: number, reference: number): number => absolute / reference * 100;
  const manifest = {
    basisSha: 'c8a41a5275ec0b77cb805d692a4de0f69c0eb3e0',
    fixture: { id: LARGE_FIXTURE_ID, version: LARGE_FIXTURE_VERSION, seed: DEFAULT_FIXTURE_SEED },
    wp02GoldenContract: 'tests/contracts/wp02FixtureGolden.ts',
    worldHash: WP02_FIXTURE_GOLDEN.worldHash,
    worldCells: [512, 128, 512], worldMeters: [128, 32, 128], chunkEdge: 32,
    materializedChunks: WP02_FIXTURE_GOLDEN.materializedChunks,
    occupiedVoxels: WP02_FIXTURE_GOLDEN.occupiedVoxels,
    coveredUnitFaces: WP03_GREEDY_GOLDEN.coveredUnitFaces,
    captureContract: { width: 1920, height: 1080, deviceScaleFactor: 1, browser: 'Google Chrome', productionPreview: true, warmupMs: 3_000, settleMs: 600 },
    coverage: { equal: true, materialAwareHash: WP03_GREEDY_GOLDEN.coverageHash, overviewCanvasImageDifference },
    visible,
    greedy,
    reductions: {
      quadReductionAbsolute: visible.quads - greedy.quads,
      quadReductionPercent: percent(visible.quads - greedy.quads, visible.quads),
      triangleReductionAbsolute: visible.triangles - greedy.triangles,
      triangleReductionPercent: percent(visible.triangles - greedy.triangles, visible.triangles),
      neutralMeshByteReductionAbsolute: visible.memory.total - greedy.memory.total,
      neutralMeshByteReductionPercent: percent(visible.memory.total - greedy.memory.total, visible.memory.total),
      visibleToGreedyMeshingTimeRatio: visible.timing.total / greedy.timing.total,
      timingClassification: 'diagnostic only',
    },
    screenshots,
    classification: {
      cpuTimes: 'diagnostic, not a benchmark gate',
      gpuMemory: 'Unknown / unavailable; no portable WebGL byte source',
      neutralMeshBytes: 'exact active mesh TypedArray byteLength sums; debug and renderer buffers excluded',
      imageDifference: 'overviewCanvasImageDifference compares canvas pixels only, not the full HUD page',
    },
  };
  const manifestPath = path.join(wp03EvidenceDirectory, 'manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const parsed = JSON.parse(await readFile(manifestPath, 'utf8')) as typeof manifest;
  expect(parsed.visible.quads).toBe(WP02_FIXTURE_GOLDEN.exposedQuads);
  expect(parsed.greedy.quads).toBe(WP03_GREEDY_GOLDEN.quads);
  expect(parsed.greedy.memory.total).toBe(WP03_GREEDY_GOLDEN.meshTotalBytes);
  expect(parsed.coverage.equal).toBe(true);
  expect(parsed.screenshots.every(({ sha256 }) => /^[0-9a-f]{64}$/.test(sha256))).toBe(true);
  expect((await readdir(wp03EvidenceDirectory)).sort()).toEqual([
    'checkerboard-greedy-quads.png', 'manifest.json', 'overview-greedy-blocks.png',
    'overview-visible-blocks.png', 'solid-cube-greedy-quads.png',
  ]);
  expect(failures).toEqual({ consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [] });
});

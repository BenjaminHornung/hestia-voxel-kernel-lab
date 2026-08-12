import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  DEFAULT_FIXTURE_SEED,
  LARGE_FIXTURE_ID,
  LARGE_FIXTURE_VERSION,
  ZONE_IDS,
} from '../../src/voxel/largeFixture';
import { WP02_FIXTURE_GOLDEN } from '../contracts/wp02FixtureGolden';
import { imageDifference, metricNumber, pngDimensions, trackPageFailures } from './support';

const wp02EvidenceDirectory = path.join(process.cwd(), 'evidence', 'wp02');

test('renders the large sparse chunk fixture in the production preview', async ({ context, page }, testInfo) => {
  const failures = trackPageFailures(page);
  await page.goto('/?lab=wp02');
  const app = page.getByTestId('voxel-app');
  await expect(app).toHaveAttribute('data-ready', 'true');
  await expect(app).toHaveAttribute('data-lab', 'wp02');
  await expect(app).toHaveAttribute('data-zone-count', '9');
  await expect(app).toHaveAttribute('data-world-hash', /^fnv1a32:[0-9a-f]{8}$/);
  await expect(page.getByTestId('app-status')).toHaveText('Ready');
  await expect(page.getByTestId('metric-renderer')).toHaveText('Three/WebGL2 · Visible Faces');
  await expect(page.getByTestId('metric-voxel-size')).toHaveText('0.25 m');
  await expect(page.getByTestId('metric-volume')).toHaveText('512 × 128 × 512');
  await expect(page.getByTestId('metric-world-meters')).toHaveText('128 × 32 × 128 m');
  await expect(page.getByTestId('metric-chunk-edge')).toHaveText('32');
  await expect(page.getByTestId('metric-candidate-chunks')).toHaveText('1,024');
  await expect(page.getByTestId('metric-active-preset')).toHaveText('Overview');

  const materialized = await metricNumber(page, 'metric-materialized-chunks');
  const occupied = await metricNumber(page, 'metric-occupied');
  const quads = await metricNumber(page, 'metric-quads');
  const triangles = await metricNumber(page, 'metric-triangles');
  const resident = await metricNumber(page, 'metric-resident-chunk-meshes');
  expect(materialized).toBeGreaterThan(0);
  expect(materialized).toBeLessThan(256);
  expect(materialized).toBeLessThan(1_024);
  expect(occupied).toBeGreaterThan(0);
  expect(quads).toBeGreaterThan(0);
  expect(triangles).toBe(quads * 2);
  expect(resident).toBeGreaterThan(0);
  expect(resident).toBe(materialized);
  expect(await metricNumber(page, 'metric-candidate-dense-voxel-bytes')).toBe(33_554_432);
  expect(await metricNumber(page, 'metric-materialized-voxel-payload-bytes')).toBe(1_671_168);
  expect(await metricNumber(page, 'metric-chunk-metadata-bytes-estimate')).toBeGreaterThan(0);
  const haloBytes = await metricNumber(page, 'metric-halo-bytes-per-snapshot');
  expect(haloBytes).toBe(39_304);
  expect(await metricNumber(page, 'metric-halo-bytes-total-processed')).toBe(haloBytes * materialized);
  const meshBytes = [
    await metricNumber(page, 'metric-mesh-position-bytes'),
    await metricNumber(page, 'metric-mesh-normal-bytes'),
    await metricNumber(page, 'metric-mesh-index-bytes'),
    await metricNumber(page, 'metric-mesh-material-id-bytes'),
  ];
  expect(await metricNumber(page, 'metric-mesh-total-bytes')).toBe(meshBytes.reduce((sum, value) => sum + value, 0));
  for (const testId of [
    'metric-debug-edge-bytes', 'metric-debug-normal-bytes', 'metric-debug-chunk-bounds-bytes',
    'metric-renderer-color-attribute-bytes',
  ]) {
    expect(await metricNumber(page, testId)).toBeGreaterThan(0);
  }
  await expect(page.getByTestId('metric-gpu-memory-bytes')).toHaveText('Unknown / unavailable');

  for (const testId of [
    'metric-fixture-build', 'metric-halo-total', 'metric-halo-p50', 'metric-halo-p95',
    'metric-mesh-total', 'metric-mesh-p50', 'metric-mesh-p95',
    'metric-frame-current', 'metric-frame-p50', 'metric-frame-p95',
  ]) {
    const value = await metricNumber(page, testId);
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(100_000);
  }

  const canvas = page.getByTestId('voxel-canvas');
  const overview = await canvas.screenshot();
  const preset = page.getByTestId('camera-preset');
  await expect(preset.locator('option')).toHaveCount(11);
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('metric-active-preset')).toHaveText('Solid cube');
  await preset.selectOption('overview');
  await preset.selectOption('chunk-seam-closeup');
  await expect(page.getByTestId('metric-active-preset')).toHaveText('Chunk seam closeup');
  await expect(page.getByTestId('active-zone')).toHaveText('Solid cube');
  await page.waitForTimeout(400);
  expect(await imageDifference(page, overview, await canvas.screenshot())).toBeGreaterThan(0.001);

  const drawCalls = await metricNumber(page, 'metric-draw-calls');
  await page.getByTestId('chunk-bounds-toggle').check();
  await expect.poll(() => metricNumber(page, 'metric-draw-calls')).toBe(drawCalls + 1);
  await page.getByTestId('chunk-bounds-toggle').uncheck();

  await page.getByTestId('wireframe-toggle').check();
  await expect.poll(() => metricNumber(page, 'metric-draw-calls')).toBe(1);
  const wireframePath = testInfo.outputPath('wp02-wireframe.png');
  await mkdir(path.dirname(wireframePath), { recursive: true });
  await page.screenshot({ path: wireframePath });
  expect(await pngDimensions(context, await readFile(wireframePath))).toEqual({ width: 1920, height: 1080 });
  await page.getByTestId('wireframe-toggle').uncheck();

  await preset.selectOption('checkerboard');
  await expect(page.getByTestId('metric-active-preset')).toHaveText('Checkerboard');
  await page.waitForTimeout(400);
  const resetView = await canvas.screenshot();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * 0.65, box!.y + box!.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.75, box!.y + box!.height * 0.6, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const rotatedDifference = await imageDifference(page, resetView, await canvas.screenshot());
  expect(rotatedDifference).toBeGreaterThan(0.001);
  await page.getByTestId('camera-reset').click();
  await page.waitForTimeout(400);
  expect(await imageDifference(page, resetView, await canvas.screenshot())).toBeLessThan(rotatedDifference * 0.1);

  expect(await page.evaluate(() => 'TestBridge' in window)).toBe(false);
  expect(await page.evaluate(() => '__VOXEL_TEST__' in window)).toBe(false);
  expect(failures).toEqual({ consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [] });
});

test('keeps explicit WP02 routing and rejects inconsistent lab values', async ({ page }) => {
  await page.goto('/?lab=wp02');
  await expect(page.getByTestId('voxel-app')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('voxel-app')).toHaveAttribute('data-lab', 'wp02');
  for (const route of ['/?lab=', '/?lab=wp99', '/?lab=wp01&lab=wp01', '/?lab=wp01&lab=wp02']) {
    await page.goto(route);
    await expect(page.getByTestId('voxel-app')).toHaveAttribute('data-ready', 'error');
    await expect(page.getByTestId('voxel-app')).toHaveAttribute('data-lab', 'invalid');
    await expect(page.getByTestId('app-status')).toContainText('exactly one of');
  }
});

test('@evidence-wp02 captures curated WP02 views and manifest after warm-up', async ({ context, page }) => {
  const failures = trackPageFailures(page);
  await page.goto('/?lab=wp02');
  const app = page.getByTestId('voxel-app');
  await expect(app).toHaveAttribute('data-ready', 'true');
  await page.waitForTimeout(3_000);
  await mkdir(wp02EvidenceDirectory, { recursive: true });
  await page.getByTestId('wireframe-toggle').uncheck();
  await page.getByTestId('block-edge-toggle').check();
  await page.getByTestId('normal-toggle').uncheck();
  await page.getByTestId('chunk-bounds-toggle').uncheck();

  const captures = [
    { preset: 'overview', file: 'large-fixture-overview.png' },
    { preset: 'chunk-seam-closeup', file: 'chunk-seam-closeup.png' },
    { preset: 'checkerboard', file: 'checkerboard-closeup.png' },
  ] as const;
  const screenshotEntries: Array<{
    path: string;
    cameraPreset: string;
    width: number;
    height: number;
    sha256: string;
  }> = [];
  for (const capture of captures) {
    await page.getByTestId('camera-preset').selectOption(capture.preset);
    await expect(page.getByTestId('wireframe-toggle')).not.toBeChecked();
    await expect(page.getByTestId('block-edge-toggle')).toBeChecked();
    await expect(page.getByTestId('normal-toggle')).not.toBeChecked();
    await expect(page.getByTestId('chunk-bounds-toggle')).not.toBeChecked();
    await page.waitForTimeout(600);
    const outputPath = path.join(wp02EvidenceDirectory, capture.file);
    await page.screenshot({ path: outputPath });
    const png = await readFile(outputPath);
    const dimensions = await pngDimensions(context, png);
    expect(dimensions).toEqual({ width: 1920, height: 1080 });
    screenshotEntries.push({
      path: `evidence/wp02/${capture.file}`,
      cameraPreset: capture.preset,
      ...dimensions,
      sha256: createHash('sha256').update(png).digest('hex'),
    });
  }

  const manifest = {
    basisSha: '07d23c16838109a06c9764ac1d1994bcf4eed155',
    fixture: { id: LARGE_FIXTURE_ID, version: LARGE_FIXTURE_VERSION, seed: DEFAULT_FIXTURE_SEED },
    voxelSizeMeters: 0.25,
    worldCells: [512, 128, 512],
    worldMeters: [128, 32, 128],
    chunkEdge: 32,
    candidateChunks: 1_024,
    zoneIds: ZONE_IDS,
    fixtureByteWorldHash: await app.getAttribute('data-world-hash'),
    materializedChunks: await metricNumber(page, 'metric-materialized-chunks'),
    occupiedVoxels: await metricNumber(page, 'metric-occupied'),
    exposedQuads: await metricNumber(page, 'metric-quads'),
    triangles: await metricNumber(page, 'metric-triangles'),
    golden: WP02_FIXTURE_GOLDEN,
    memory: {
      classifications: {
        candidateDenseVoxelBytes: 'theoretical candidate capacity',
        materializedVoxelPayloadBytes: 'exact resident TypedArray byteLength sum',
        chunkMetadataBytesEstimate: 'estimate; JavaScript Map/object overhead is not directly measurable',
        haloBytesPerSnapshot: 'exact Uint8Array byteLength',
        haloBytesTotalProcessed: 'exact Uint8Array byteLength sum',
        meshPositionBytes: 'exact Float32Array byteLength sum',
        meshNormalBytes: 'exact Float32Array byteLength sum',
        meshIndexBytes: 'exact Uint32Array byteLength sum',
        meshMaterialIdBytes: 'exact Uint8Array byteLength sum',
        meshTotalBytes: 'exact neutral mesh TypedArray byteLength sum',
        debugEdgeBytes: 'exact renderer Float32Array byteLength',
        debugNormalBytes: 'exact renderer Float32Array byteLength',
        debugChunkBoundsBytes: 'exact renderer Float32Array byteLength',
        colorAttributeBytes: 'exact renderer Float32Array byteLength',
        gpuMemoryBytes: 'unknown / unavailable; no portable WebGL byte source',
      },
      candidateDenseVoxelBytes: await metricNumber(page, 'metric-candidate-dense-voxel-bytes'),
      materializedVoxelPayloadBytes: await metricNumber(page, 'metric-materialized-voxel-payload-bytes'),
      chunkMetadataBytesEstimate: await metricNumber(page, 'metric-chunk-metadata-bytes-estimate'),
      haloBytesPerSnapshot: await metricNumber(page, 'metric-halo-bytes-per-snapshot'),
      haloBytesTotalProcessed: await metricNumber(page, 'metric-halo-bytes-total-processed'),
      meshPositionBytes: await metricNumber(page, 'metric-mesh-position-bytes'),
      meshNormalBytes: await metricNumber(page, 'metric-mesh-normal-bytes'),
      meshIndexBytes: await metricNumber(page, 'metric-mesh-index-bytes'),
      meshMaterialIdBytes: await metricNumber(page, 'metric-mesh-material-id-bytes'),
      meshTotalBytes: await metricNumber(page, 'metric-mesh-total-bytes'),
      debugEdgeBytes: await metricNumber(page, 'metric-debug-edge-bytes'),
      debugNormalBytes: await metricNumber(page, 'metric-debug-normal-bytes'),
      debugChunkBoundsBytes: await metricNumber(page, 'metric-debug-chunk-bounds-bytes'),
      colorAttributeBytes: await metricNumber(page, 'metric-renderer-color-attribute-bytes'),
      gpuMemoryBytes: await page.getByTestId('metric-gpu-memory-bytes').innerText(),
    },
    screenshots: screenshotEntries,
    diagnostics: {
      classification: await page.getByTestId('telemetry-classification').innerText(),
      fixtureBuildMs: await metricNumber(page, 'metric-fixture-build'),
      haloCopyMs: {
        total: await metricNumber(page, 'metric-halo-total'),
        p50: await metricNumber(page, 'metric-halo-p50'),
        p95: await metricNumber(page, 'metric-halo-p95'),
      },
      chunkMeshMs: {
        total: await metricNumber(page, 'metric-mesh-total'),
        p50: await metricNumber(page, 'metric-mesh-p50'),
        p95: await metricNumber(page, 'metric-mesh-p95'),
      },
      frameMs: {
        current: await metricNumber(page, 'metric-frame-current'),
        p50: await metricNumber(page, 'metric-frame-p50'),
        p95: await metricNumber(page, 'metric-frame-p95'),
      },
      drawCalls: await metricNumber(page, 'metric-draw-calls'),
    },
  };
  const manifestPath = path.join(wp02EvidenceDirectory, 'manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const parsed = JSON.parse(await readFile(manifestPath, 'utf8')) as typeof manifest;
  expect(parsed.screenshots).toEqual(screenshotEntries);
  expect(parsed.fixtureByteWorldHash).toBe(WP02_FIXTURE_GOLDEN.worldHash);
  expect(parsed.materializedChunks).toBe(WP02_FIXTURE_GOLDEN.materializedChunks);
  expect(parsed.occupiedVoxels).toBe(WP02_FIXTURE_GOLDEN.occupiedVoxels);
  expect(parsed.exposedQuads).toBe(WP02_FIXTURE_GOLDEN.exposedQuads);
  expect(parsed.triangles).toBe(WP02_FIXTURE_GOLDEN.triangles);
  expect(parsed.memory.meshTotalBytes).toBe(
    parsed.memory.meshPositionBytes + parsed.memory.meshNormalBytes
      + parsed.memory.meshIndexBytes + parsed.memory.meshMaterialIdBytes,
  );
  expect(parsed.memory.gpuMemoryBytes).toBe('Unknown / unavailable');
  expect(parsed.screenshots.every(({ sha256 }) => /^[0-9a-f]{64}$/.test(sha256))).toBe(true);
  expect((await readdir(wp02EvidenceDirectory)).sort()).toEqual([
    'checkerboard-closeup.png',
    'chunk-seam-closeup.png',
    'large-fixture-overview.png',
    'manifest.json',
  ]);
  expect(failures).toEqual({ consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [] });
});

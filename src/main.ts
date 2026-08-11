import './style.css';
import { candidateDenseVoxelBytes, summarizeMeshMemory } from './diagnostics/memory';
import { summarizeDurations } from './diagnostics/telemetry';
import { ThreeVoxelRenderer, type VoxelLabScene } from './render-three/threeVoxelRenderer';
import {
  CANDIDATE_CHUNK_COUNT,
  CHUNK_EDGE,
  VOXEL_SIZE_METERS,
  WORLD_CELLS,
  WORLD_METERS,
} from './voxel/constants';
import { createChunkHaloSnapshot, createVolumeHaloSnapshot } from './voxel/chunkHalo';
import { createVisibleFaceFixture, FIXTURE_SHA256 } from './voxel/fixtures';
import { createLargeChunkFixture } from './voxel/largeFixture';
import { estimateChunkMetadataBytes } from './voxel/sparseChunkWorld';
import { meshChunkVisibleFaces } from './voxel/visibleFaceMesher';

const root = document.querySelector<HTMLElement>('#voxel-app');
if (!root) {
  throw new Error('Voxel application root is missing.');
}

function selectedLab(): 'wp01' | 'wp02' {
  const values = new URLSearchParams(window.location.search).getAll('lab');
  if (values.length === 0) {
    return 'wp02';
  }
  if (values.length !== 1 || (values[0] !== 'wp01' && values[0] !== 'wp02')) {
    throw new RangeError('The lab query must be exactly one of: wp01, wp02.');
  }
  return values[0];
}

function createWp01Scene(): VoxelLabScene {
  const fixtureStarted = performance.now();
  const volume = createVisibleFaceFixture();
  const fixtureBuildDurationMs = performance.now() - fixtureStarted;
  const haloStarted = performance.now();
  const halo = createVolumeHaloSnapshot(volume);
  const haloTiming = summarizeDurations([performance.now() - haloStarted]);
  const meshStarted = performance.now();
  const chunk = meshChunkVisibleFaces(halo);
  const meshTiming = summarizeDurations([performance.now() - meshStarted]);
  const meshMemory = summarizeMeshMemory([chunk]);
  return {
    lab: 'wp01',
    sceneLabel: 'WP01 · Visible-face baseline',
    voxelSizeMeters: VOXEL_SIZE_METERS,
    worldCells: [32, 32, 32],
    worldMeters: [8, 8, 8],
    chunkEdge: CHUNK_EDGE,
    candidateChunks: 1,
    materializedChunks: 1,
    occupiedVoxels: volume.occupiedCount,
    fixtureBuildDurationMs,
    haloTiming,
    meshTiming,
    memory: {
      candidateDenseVoxelBytes: candidateDenseVoxelBytes(1),
      materializedVoxelPayloadBytes: volume.storageByteLength,
      chunkMetadataBytesEstimate: estimateChunkMetadataBytes('0,0,0'),
      haloBytesPerSnapshot: halo.voxels.byteLength,
      haloBytesTotalProcessed: halo.voxels.byteLength,
      ...meshMemory,
    },
    chunks: [chunk],
    cameraPresets: [{
      id: 'wp01',
      label: 'WP01 fixture',
      positionMeters: [10.75, 8, -4.25],
      targetMeters: [4, 0.875, 4],
      zoneId: null,
    }],
    zoneCount: 1,
    worldHash: FIXTURE_SHA256,
  };
}

function createWp02Scene(): VoxelLabScene {
  const fixture = createLargeChunkFixture();
  const haloSamples: number[] = [];
  const meshSamples: number[] = [];
  let haloBytesTotalProcessed = 0;
  let haloBytesPerSnapshot = 0;
  const chunks = fixture.world.chunkCoords().map((coord) => {
    const haloStarted = performance.now();
    const halo = createChunkHaloSnapshot(fixture.world, coord);
    haloBytesPerSnapshot = halo.voxels.byteLength;
    haloBytesTotalProcessed += halo.voxels.byteLength;
    haloSamples.push(performance.now() - haloStarted);
    const meshStarted = performance.now();
    const mesh = meshChunkVisibleFaces(halo);
    meshSamples.push(performance.now() - meshStarted);
    return mesh;
  });
  const meshMemory = summarizeMeshMemory(chunks);
  return {
    lab: 'wp02',
    sceneLabel: 'WP02 · Large sparse chunk fixture',
    voxelSizeMeters: VOXEL_SIZE_METERS,
    worldCells: [WORLD_CELLS.x, WORLD_CELLS.y, WORLD_CELLS.z],
    worldMeters: [WORLD_METERS.x, WORLD_METERS.y, WORLD_METERS.z],
    chunkEdge: CHUNK_EDGE,
    candidateChunks: CANDIDATE_CHUNK_COUNT,
    materializedChunks: fixture.world.materializedChunkCount,
    occupiedVoxels: fixture.world.occupiedCount,
    fixtureBuildDurationMs: fixture.buildDurationMs,
    haloTiming: summarizeDurations(haloSamples),
    meshTiming: summarizeDurations(meshSamples),
    memory: {
      candidateDenseVoxelBytes: candidateDenseVoxelBytes(),
      materializedVoxelPayloadBytes: fixture.world.materializedVoxelPayloadBytes,
      chunkMetadataBytesEstimate: fixture.world.chunkMetadataBytesEstimate,
      haloBytesPerSnapshot,
      haloBytesTotalProcessed,
      ...meshMemory,
    },
    chunks,
    cameraPresets: fixture.cameraPresets,
    zoneCount: fixture.zones.length,
    worldHash: fixture.worldHash,
  };
}

let app: ThreeVoxelRenderer | null = null;
try {
  const lab = selectedLab();
  app = new ThreeVoxelRenderer(root, lab === 'wp01' ? createWp01Scene() : createWp02Scene());
  root.querySelector<HTMLElement>('[data-testid="lab-heading"]')!.textContent = lab === 'wp01'
    ? 'WP01 · Visible-face baseline'
    : 'WP02 · Sparse chunk fixture';
} catch (error) {
  root.dataset.ready = 'error';
  root.dataset.lab = 'invalid';
  const status = root.querySelector<HTMLElement>('[data-testid="app-status"]');
  if (status) {
    status.textContent = error instanceof Error ? error.message : 'Voxel lab initialization failed.';
  }
}

const dispose = (): void => {
  window.removeEventListener('beforeunload', dispose);
  app?.dispose();
};

window.addEventListener('beforeunload', dispose, { once: true });
if (import.meta.hot) {
  import.meta.hot.dispose(dispose);
}

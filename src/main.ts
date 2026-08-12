import './style.css';
import { candidateDenseVoxelBytes, summarizeMeshMemory, type NeutralMeshMemory } from './diagnostics/memory';
import { summarizeDurations } from './diagnostics/telemetry';
import { AO_DARKNESS, createPackedAoVertexColors, type Wp04DebugMode } from './render-three/aoVertexColors';
import { ThreeVoxelRenderer, type MesherComparison, type MesherStatistics, type VoxelLabScene } from './render-three/threeVoxelRenderer';
import { createMesherEdgeProducts, createWorldDiagonalPositions } from './render-three/worldEdgeAggregation';
import { meshChunkAoGreedyFaces } from './voxel/aoGreedyFaceMesher';
import {
  CANDIDATE_CHUNK_COUNT,
  CHUNK_EDGE,
  VOXEL_SIZE_METERS,
  WORLD_CELLS,
  WORLD_METERS,
} from './voxel/constants';
import { createChunkHaloSnapshot, createVolumeHaloSnapshot, type ChunkHaloSnapshot } from './voxel/chunkHalo';
import { createVisibleFaceFixture, FIXTURE_SHA256 } from './voxel/fixtures';
import { createLargeChunkFixture } from './voxel/largeFixture';
import { meshChunkGreedyFaces } from './voxel/greedyFaceMesher';
import { PALETTE_V1 } from './voxel/palette';
import { estimateChunkMetadataBytes } from './voxel/sparseChunkWorld';
import type { ChunkVisibleFaceMesh, MesherMode } from './voxel/types';
import { meshChunkVisibleFaces } from './voxel/visibleFaceMesher';

const root = document.querySelector<HTMLElement>('#voxel-app');
if (!root) {
  throw new Error('Voxel application root is missing.');
}

interface SelectedRoute {
  readonly lab: 'wp01' | 'wp02' | 'wp03' | 'wp04';
  readonly mesherMode: MesherMode;
  readonly aoEnabled: boolean;
  readonly debugMode: Wp04DebugMode;
}

function selectedRoute(): SelectedRoute {
  const search = new URLSearchParams(window.location.search);
  for (const key of search.keys()) {
    if (!['lab', 'mesher', 'ao', 'debug'].includes(key)) throw new RangeError(`Unknown query parameter: ${key}.`);
  }
  const labs = search.getAll('lab');
  const meshers = search.getAll('mesher');
  const aoValues = search.getAll('ao');
  const debugValues = search.getAll('debug');
  if (labs.length === 0) {
    if (meshers.length > 0 || aoValues.length > 0 || debugValues.length > 0) {
      throw new RangeError('Mesher, AO, and debug queries require an explicit compatible lab.');
    }
    return { lab: 'wp03', mesherMode: 'greedy', aoEnabled: false, debugMode: 'surface' };
  }
  if (labs.length !== 1 || !['wp01', 'wp02', 'wp03', 'wp04'].includes(labs[0]!)) {
    throw new RangeError('The lab query must be exactly one of: wp01, wp02, wp03, wp04.');
  }
  const lab = labs[0] as SelectedRoute['lab'];
  if (lab === 'wp04') {
    if (meshers.length > 0) throw new RangeError('The mesher query is only valid for lab=wp03.');
    if (aoValues.length > 1 || (aoValues.length === 1 && aoValues[0] !== 'on' && aoValues[0] !== 'off')) {
      throw new RangeError('The AO query must be exactly one of: on, off.');
    }
    const debugModes: readonly Wp04DebugMode[] = ['surface', 'ao-levels', 'diagonal-normal', 'diagonal-flipped', 'materials', 'normals'];
    if (debugValues.length > 1 || (debugValues.length === 1 && !debugModes.includes(debugValues[0] as Wp04DebugMode))) {
      throw new RangeError(`The debug query must be exactly one of: ${debugModes.join(', ')}.`);
    }
    return {
      lab,
      mesherMode: 'ao-greedy',
      aoEnabled: aoValues[0] !== 'off',
      debugMode: (debugValues[0] as Wp04DebugMode | undefined) ?? 'surface',
    };
  }
  if (aoValues.length > 0 || debugValues.length > 0) throw new RangeError('AO and debug queries are only valid for lab=wp04.');
  if (lab !== 'wp03') {
    if (meshers.length > 0) throw new RangeError('The mesher query is only valid for lab=wp03.');
    return { lab, mesherMode: 'visible', aoEnabled: false, debugMode: 'surface' };
  }
  if (meshers.length === 0) return { lab, mesherMode: 'greedy', aoEnabled: false, debugMode: 'surface' };
  if (meshers.length !== 1 || (meshers[0] !== 'visible' && meshers[0] !== 'greedy')) {
    throw new RangeError('The mesher query must be exactly one of: visible, greedy.');
  }
  return { lab, mesherMode: meshers[0], aoEnabled: false, debugMode: 'surface' };
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
    mesherMode: 'visible',
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
    coveredUnitFaces: chunk.coveredUnitFaces,
    comparison: null,
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
    mesherMode: 'visible',
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
    coveredUnitFaces: chunks.reduce((sum, chunk) => sum + chunk.coveredUnitFaces, 0),
    comparison: null,
    cameraPresets: fixture.cameraPresets,
    zoneCount: fixture.zones.length,
    worldHash: fixture.worldHash,
  };
}

interface MeshedWorld {
  readonly chunks: readonly ChunkVisibleFaceMesh[];
  readonly statistics: MesherStatistics;
}

function meshWorld(halos: readonly ChunkHaloSnapshot[], mesherMode: MesherMode): MeshedWorld {
  const samples: number[] = [];
  const chunks = halos.map((halo) => {
    const started = performance.now();
    const mesh = mesherMode === 'visible' ? meshChunkVisibleFaces(halo) : meshChunkGreedyFaces(halo);
    samples.push(performance.now() - started);
    return mesh;
  });
  const memory: NeutralMeshMemory = summarizeMeshMemory(chunks);
  return {
    chunks,
    statistics: {
      mesherMode,
      coveredUnitFaces: chunks.reduce((sum, chunk) => sum + chunk.coveredUnitFaces, 0),
      quadCount: chunks.reduce((sum, chunk) => sum + chunk.quadCount, 0),
      triangleCount: chunks.reduce((sum, chunk) => sum + chunk.triangleCount, 0),
      memory,
      timing: summarizeDurations(samples),
    },
  };
}

function reduction(reference: number, candidate: number): { readonly absolute: number; readonly percent: number } {
  return { absolute: reference - candidate, percent: reference === 0 ? 0 : (reference - candidate) / reference * 100 };
}

function createWp03Scene(mesherMode: MesherMode): VoxelLabScene {
  const fixture = createLargeChunkFixture();
  const haloSamples: number[] = [];
  let haloBytesPerSnapshot = 0;
  let haloBytesTotalProcessed = 0;
  const halos = fixture.world.chunkCoords().map((coord) => {
    const started = performance.now();
    const halo = createChunkHaloSnapshot(fixture.world, coord);
    haloSamples.push(performance.now() - started);
    haloBytesPerSnapshot = halo.voxels.byteLength;
    haloBytesTotalProcessed += halo.voxels.byteLength;
    return halo;
  });
  const visible = meshWorld(halos, 'visible');
  const greedy = meshWorld(halos, 'greedy');
  const active = mesherMode === 'visible' ? visible : greedy;
  const comparison: MesherComparison = {
    visible: visible.statistics,
    greedy: greedy.statistics,
    quadReduction: reduction(visible.statistics.quadCount, greedy.statistics.quadCount),
    triangleReduction: reduction(visible.statistics.triangleCount, greedy.statistics.triangleCount),
    neutralMeshByteReduction: reduction(visible.statistics.memory.meshTotalBytes, greedy.statistics.memory.meshTotalBytes),
  };
  const edgeProducts = createMesherEdgeProducts(visible.chunks, active.chunks, VOXEL_SIZE_METERS);
  return {
    lab: 'wp03',
    mesherMode,
    sceneLabel: 'WP03 · Greedy meshing A/B',
    voxelSizeMeters: VOXEL_SIZE_METERS,
    worldCells: [WORLD_CELLS.x, WORLD_CELLS.y, WORLD_CELLS.z],
    worldMeters: [WORLD_METERS.x, WORLD_METERS.y, WORLD_METERS.z],
    chunkEdge: CHUNK_EDGE,
    candidateChunks: CANDIDATE_CHUNK_COUNT,
    materializedChunks: fixture.world.materializedChunkCount,
    occupiedVoxels: fixture.world.occupiedCount,
    fixtureBuildDurationMs: fixture.buildDurationMs,
    haloTiming: summarizeDurations(haloSamples),
    meshTiming: active.statistics.timing,
    memory: {
      candidateDenseVoxelBytes: candidateDenseVoxelBytes(),
      materializedVoxelPayloadBytes: fixture.world.materializedVoxelPayloadBytes,
      chunkMetadataBytesEstimate: fixture.world.chunkMetadataBytesEstimate,
      haloBytesPerSnapshot,
      haloBytesTotalProcessed,
      ...active.statistics.memory,
    },
    chunks: active.chunks,
    coveredUnitFaces: active.statistics.coveredUnitFaces,
    comparison,
    ...edgeProducts,
    cameraPresets: fixture.cameraPresets,
    zoneCount: fixture.zones.length,
    worldHash: fixture.worldHash,
  };
}

function createWp04Scene(aoEnabled: boolean, debugMode: Wp04DebugMode): VoxelLabScene {
  const fixture = createLargeChunkFixture();
  const haloSamples: number[] = [];
  let haloBytesPerSnapshot = 0;
  let haloBytesTotalProcessed = 0;
  const halos = fixture.world.chunkCoords().map((coord) => {
    const started = performance.now();
    const halo = createChunkHaloSnapshot(fixture.world, coord);
    haloSamples.push(performance.now() - started);
    haloBytesPerSnapshot = halo.voxels.byteLength;
    haloBytesTotalProcessed += halo.voxels.byteLength;
    return halo;
  });
  const meshSamples: number[] = [];
  const chunks = halos.map((halo) => {
    const started = performance.now();
    const mesh = meshChunkAoGreedyFaces(halo);
    meshSamples.push(performance.now() - started);
    return mesh;
  });
  const visibleChunks = halos.map((halo) => meshChunkVisibleFaces(halo));
  const meshMemory = summarizeMeshMemory(chunks);
  const aoAttributeBytes = chunks.reduce((sum, chunk) => sum + chunk.aoLevels.byteLength, 0);
  const rendererColors = chunks.map((chunk) => createPackedAoVertexColors(chunk, aoEnabled, debugMode));
  const diagonalMode = debugMode === 'diagonal-normal' || debugMode === 'diagonal-flipped'
    ? debugMode.replace('diagonal-', '') as 'normal' | 'flipped'
    : null;
  const edgeProducts = createMesherEdgeProducts(visibleChunks, chunks, VOXEL_SIZE_METERS);
  const aoHistogram = chunks.reduce((sum, chunk) => (
    sum.map((value, level) => value + chunk.aoHistogram[level]!) as [number, number, number, number]
  ), [0, 0, 0, 0] as [number, number, number, number]);
  const normalDiagonalCount = chunks.reduce((sum, chunk) => sum + chunk.normalDiagonalCount, 0);
  const flippedDiagonalCount = chunks.reduce((sum, chunk) => sum + chunk.flippedDiagonalCount, 0);
  const debugColorCount = new Set(rendererColors.flatMap((colors) => (
    Array.from({ length: colors.length / 3 }, (_, vertex) => `${colors[vertex * 3]},${colors[vertex * 3 + 1]},${colors[vertex * 3 + 2]}`)
  ))).size;
  const concaveCornerPreset = {
    id: 'concave-corner',
    label: 'Concave corner',
    positionMeters: [0, 2.5, -4] as const,
    targetMeters: [0, 2.5, 0] as const,
    zoneId: 'tunnel',
  };
  return {
    lab: 'wp04',
    mesherMode: 'ao-greedy',
    sceneLabel: 'WP04 · Block AO and palette-v1',
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
      meshTotalBytes: meshMemory.meshTotalBytes + aoAttributeBytes,
      aoAttributeBytes,
    },
    chunks,
    rendererColors,
    coveredUnitFaces: chunks.reduce((sum, chunk) => sum + chunk.coveredUnitFaces, 0),
    comparison: null,
    ...edgeProducts,
    diagonalPositions: diagonalMode ? createWorldDiagonalPositions(chunks, VOXEL_SIZE_METERS, diagonalMode) : new Float32Array(),
    cameraPresets: [...fixture.cameraPresets, concaveCornerPreset],
    zoneCount: fixture.zones.length,
    worldHash: fixture.worldHash,
    wp04: {
      aoEnabled,
      debugMode,
      paletteId: PALETTE_V1.id,
      paletteVersion: PALETTE_V1.version,
      paletteHash: PALETTE_V1.hash,
      aoDarkness: AO_DARKNESS,
      aoHistogram,
      normalDiagonalCount,
      flippedDiagonalCount,
      aoSplitDeltaVsWp03: chunks.reduce((sum, chunk) => sum + chunk.quadCount, 0) - 19_073,
      aoAttributeBytes,
      packedRendererColorBytes: rendererColors.reduce((sum, colors) => sum + colors.byteLength, 0),
      debugColorCount,
    },
  };
}

let app: ThreeVoxelRenderer | null = null;
try {
  const route = selectedRoute();
  const scene = route.lab === 'wp01' ? createWp01Scene()
    : route.lab === 'wp02' ? createWp02Scene()
      : route.lab === 'wp03' ? createWp03Scene(route.mesherMode)
        : createWp04Scene(route.aoEnabled, route.debugMode);
  app = new ThreeVoxelRenderer(root, scene);
  root.querySelector<HTMLElement>('[data-testid="lab-heading"]')!.textContent = route.lab === 'wp01'
    ? 'WP01 · Visible-face baseline'
    : route.lab === 'wp02' ? 'WP02 · Sparse chunk fixture'
      : route.lab === 'wp03' ? 'WP03 · Greedy meshing A/B' : 'WP04 · Block AO and palette-v1';
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

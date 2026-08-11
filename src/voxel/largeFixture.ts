import {
  MAX_MATERIALIZED_CHUNKS,
  VOXEL_SIZE_METERS,
  VOLUME_VOXEL_COUNT,
  WORLD_CELL_BOUNDS,
  VoxelMaterial,
} from './constants';
import { chunkCoordToKey, voxelIndex, worldCellToChunkLocal } from './coordinates';
import { SparseChunkWorld, type ChunkPayload } from './sparseChunkWorld';
import type { ChunkCoord, ChunkKey, Vec3 } from './types';

export const LARGE_FIXTURE_ID = 'wp02-large-sparse-fixture';
export const LARGE_FIXTURE_VERSION = 1;
export const DEFAULT_FIXTURE_SEED = 0x48455354;

export const ZONE_IDS = [
  'solid-cube',
  'hollow-shell',
  'staircase',
  'hard-voxel-sphere',
  'tunnel',
  'checkerboard',
  'sparse-10-percent',
  'random-50-percent',
  'multi-component-field',
] as const;
export type FixtureZoneId = typeof ZONE_IDS[number];

export interface AxisAlignedBounds {
  readonly min: Vec3;
  readonly maxExclusive: Vec3;
}

export interface CameraPreset {
  readonly id: string;
  readonly label: string;
  readonly positionMeters: Vec3;
  readonly targetMeters: Vec3;
  readonly zoneId: FixtureZoneId | null;
}

export interface FixtureZone {
  readonly id: FixtureZoneId;
  readonly label: string;
  readonly fixtureKind: FixtureZoneId;
  readonly cellBounds: AxisAlignedBounds;
  readonly meterBounds: AxisAlignedBounds;
  readonly targetMeters: Vec3;
  readonly cameraPreset: CameraPreset;
}

export interface LargeChunkFixture {
  readonly id: typeof LARGE_FIXTURE_ID;
  readonly version: typeof LARGE_FIXTURE_VERSION;
  readonly seed: number;
  readonly world: SparseChunkWorld;
  readonly worldHash: string;
  readonly zones: readonly FixtureZone[];
  readonly zoneHashes: Readonly<Record<FixtureZoneId, string>>;
  readonly cameraPresets: readonly CameraPreset[];
  readonly buildDurationMs: number;
}

const ZONE_DEFINITIONS: ReadonlyArray<{
  readonly id: FixtureZoneId;
  readonly label: string;
  readonly bounds: AxisAlignedBounds;
}> = [
  { id: 'solid-cube', label: 'Solid cube', bounds: { min: [-178, 4, -178], maxExclusive: [-142, 40, -142] } },
  { id: 'hollow-shell', label: 'Hollow shell', bounds: { min: [-18, 4, -178], maxExclusive: [18, 36, -142] } },
  { id: 'staircase', label: 'Staircase', bounds: { min: [144, 0, -176], maxExclusive: [176, 16, -144] } },
  { id: 'hard-voxel-sphere', label: 'Hard voxel sphere', bounds: { min: [-178, 4, -18], maxExclusive: [-142, 40, 18] } },
  { id: 'tunnel', label: 'Tunnel', bounds: { min: [-10, 2, -22], maxExclusive: [10, 18, 22] } },
  { id: 'checkerboard', label: 'Checkerboard', bounds: { min: [154, 4, -6], maxExclusive: [166, 16, 6] } },
  { id: 'sparse-10-percent', label: 'Sparse 10 percent', bounds: { min: [-172, 4, 148], maxExclusive: [-148, 28, 172] } },
  { id: 'random-50-percent', label: 'Random 50 percent', bounds: { min: [-8, 4, 152], maxExclusive: [8, 20, 168] } },
  { id: 'multi-component-field', label: 'Multi-component field', bounds: { min: [140, 0, 140], maxExclusive: [180, 40, 180] } },
];

function toMeters([x, y, z]: Vec3): Vec3 {
  return [x * VOXEL_SIZE_METERS, y * VOXEL_SIZE_METERS, z * VOXEL_SIZE_METERS];
}

function seededHash(x: number, y: number, z: number, seed: number): number {
  let hash = seed | 0;
  hash = Math.imul(hash ^ x, 0x45d9f3b);
  hash = Math.imul(hash ^ y, 0x45d9f3b);
  hash = Math.imul(hash ^ z, 0x45d9f3b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

class FixtureAssembler {
  readonly #chunks = new Map<ChunkKey, { readonly coord: ChunkCoord; readonly voxels: Uint8Array }>();

  set(x: number, y: number, z: number, material: Exclude<VoxelMaterial, VoxelMaterial.Air>): void {
    if (
      x < WORLD_CELL_BOUNDS.min.x || x >= WORLD_CELL_BOUNDS.maxExclusive.x
      || y < WORLD_CELL_BOUNDS.min.y || y >= WORLD_CELL_BOUNDS.maxExclusive.y
      || z < WORLD_CELL_BOUNDS.min.z || z >= WORLD_CELL_BOUNDS.maxExclusive.z
    ) {
      throw new RangeError(`Fixture cell (${x}, ${y}, ${z}) is outside the WP02 world.`);
    }
    const { chunk, local } = worldCellToChunkLocal(x, y, z);
    const key = chunkCoordToKey(chunk);
    let payload = this.#chunks.get(key);
    if (!payload) {
      payload = { coord: chunk, voxels: new Uint8Array(VOLUME_VOXEL_COUNT) };
      this.#chunks.set(key, payload);
    }
    payload.voxels[voxelIndex(local.x, local.y, local.z)] = material;
  }

  chunks(): readonly ChunkPayload[] {
    return [...this.#chunks.values()];
  }
}

function fillBounds(
  assembler: FixtureAssembler,
  bounds: AxisAlignedBounds,
  material: Exclude<VoxelMaterial, VoxelMaterial.Air>,
  include: (x: number, y: number, z: number) => boolean = () => true,
): void {
  for (let z = bounds.min[2]; z < bounds.maxExclusive[2]; z += 1) {
    for (let y = bounds.min[1]; y < bounds.maxExclusive[1]; y += 1) {
      for (let x = bounds.min[0]; x < bounds.maxExclusive[0]; x += 1) {
        if (include(x, y, z)) {
          assembler.set(x, y, z, material);
        }
      }
    }
  }
}

function buildZones(assembler: FixtureAssembler, seed: number): void {
  fillBounds(assembler, ZONE_DEFINITIONS[0]!.bounds, VoxelMaterial.Platform);

  const shell = ZONE_DEFINITIONS[1]!.bounds;
  fillBounds(assembler, shell, VoxelMaterial.Shell, (x, y, z) => {
    const boundary = x === shell.min[0] || x === shell.maxExclusive[0] - 1
      || y === shell.min[1] || y === shell.maxExclusive[1] - 1
      || z === shell.min[2] || z === shell.maxExclusive[2] - 1;
    const opening = z === shell.min[2] && x >= -5 && x < 5 && y >= 12 && y < 24;
    return boundary && !opening;
  });

  const stairs = ZONE_DEFINITIONS[2]!.bounds;
  fillBounds(assembler, stairs, VoxelMaterial.Stairs, (x, y) => y < Math.floor((x - stairs.min[0]) / 2) + 1);

  const sphere = ZONE_DEFINITIONS[3]!.bounds;
  fillBounds(assembler, sphere, VoxelMaterial.Roof, (x, y, z) => {
    const dx = x + 160;
    const dy = y - 22;
    return dx * dx + dy * dy + z * z <= 18 ** 2;
  });

  const tunnel = ZONE_DEFINITIONS[4]!.bounds;
  fillBounds(assembler, tunnel, VoxelMaterial.Shell, (x, y) => (
    x < tunnel.min[0] + 2 || x >= tunnel.maxExclusive[0] - 2
    || y < tunnel.min[1] + 2 || y >= tunnel.maxExclusive[1] - 2
  ));

  fillBounds(assembler, ZONE_DEFINITIONS[5]!.bounds, VoxelMaterial.Roof, (x, y, z) => (x + y + z) % 2 === 0);
  fillBounds(assembler, ZONE_DEFINITIONS[6]!.bounds, VoxelMaterial.Stairs, (x, y, z) => (
    seededHash(x, y, z, seed ^ 0x10) % 100 < 10
  ));
  fillBounds(assembler, ZONE_DEFINITIONS[7]!.bounds, VoxelMaterial.Platform, (x, y, z) => (
    seededHash(x, y, z, seed ^ 0x50) % 2 === 0
  ));

  const columnXs = [142, 150, 166, 174];
  const columnZs = [142, 150, 166, 174];
  for (const z of columnZs) {
    for (const x of columnXs) {
      const height = 8 + seededHash(x, 0, z, 0x4d554c54) % 31;
      for (let y = 0; y < height; y += 1) {
        for (let dz = 0; dz < 2; dz += 1) {
          for (let dx = 0; dx < 2; dx += 1) {
            assembler.set(x + dx, y, z + dz, VoxelMaterial.Stairs);
          }
        }
      }
    }
  }
  for (const [x, y, z] of [[158, 4, 148], [146, 12, 160], [170, 7, 158], [158, 18, 172]] as const) {
    for (let dz = 0; dz < 4; dz += 1) {
      for (let dy = 0; dy < 4; dy += 1) {
        for (let dx = 0; dx < 4; dx += 1) {
          assembler.set(x + dx, y + dy, z + dz, VoxelMaterial.Shell);
        }
      }
    }
  }
}

function createZoneHashes(world: SparseChunkWorld): Readonly<Record<FixtureZoneId, string>> {
  const hashes = ZONE_DEFINITIONS.map(({ id, bounds }) => {
    let hash = 0x811c9dc5;
    for (let z = bounds.min[2]; z < bounds.maxExclusive[2]; z += 1) {
      for (let y = bounds.min[1]; y < bounds.maxExclusive[1]; y += 1) {
        for (let x = bounds.min[0]; x < bounds.maxExclusive[0]; x += 1) {
          hash ^= world.getCell(x, y, z);
          hash = Math.imul(hash, 0x01000193) >>> 0;
        }
      }
    }
    return [id, `fnv1a32:${hash.toString(16).padStart(8, '0')}`] as const;
  });
  return Object.fromEntries(hashes) as Readonly<Record<FixtureZoneId, string>>;
}

function createZones(): readonly FixtureZone[] {
  return ZONE_DEFINITIONS.map(({ id, label, bounds }) => {
    const centerCells: Vec3 = [
      (bounds.min[0] + bounds.maxExclusive[0]) / 2,
      (bounds.min[1] + bounds.maxExclusive[1]) / 2,
      (bounds.min[2] + bounds.maxExclusive[2]) / 2,
    ];
    const targetMeters = toMeters(centerCells);
    const extentMeters = Math.max(
      bounds.maxExclusive[0] - bounds.min[0],
      bounds.maxExclusive[1] - bounds.min[1],
      bounds.maxExclusive[2] - bounds.min[2],
    ) * VOXEL_SIZE_METERS;
    const distance = Math.max(6, extentMeters * 1.8);
    const cameraPreset: CameraPreset = {
      id,
      label,
      positionMeters: [targetMeters[0] + distance, targetMeters[1] + distance * 0.8, targetMeters[2] - distance],
      targetMeters,
      zoneId: id,
    };
    return {
      id,
      label,
      fixtureKind: id,
      cellBounds: bounds,
      meterBounds: { min: toMeters(bounds.min), maxExclusive: toMeters(bounds.maxExclusive) },
      targetMeters,
      cameraPreset,
    };
  });
}

export function createLargeChunkFixture(seed = DEFAULT_FIXTURE_SEED): LargeChunkFixture {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError('Fixture seed must be an unsigned 32-bit integer.');
  }
  const started = performance.now();
  const assembler = new FixtureAssembler();
  buildZones(assembler, seed);
  const world = new SparseChunkWorld(assembler.chunks());
  if (world.materializedChunkCount > MAX_MATERIALIZED_CHUNKS) {
    throw new RangeError(`WP02 fixture materialized ${world.materializedChunkCount} chunks; the maximum is ${MAX_MATERIALIZED_CHUNKS}.`);
  }
  const zones = createZones();
  const overview: CameraPreset = {
    id: 'overview',
    label: 'Overview',
    positionMeters: [132, 110, -150],
    targetMeters: [0, 6, 0],
    zoneId: null,
  };
  const seam: CameraPreset = {
    id: 'chunk-seam-closeup',
    label: 'Chunk seam closeup',
    positionMeters: [-28, 16, -28],
    targetMeters: [-40, 6, -40],
    zoneId: 'solid-cube',
  };
  return {
    id: LARGE_FIXTURE_ID,
    version: LARGE_FIXTURE_VERSION,
    seed,
    world,
    worldHash: world.signature(),
    zones,
    zoneHashes: createZoneHashes(world),
    cameraPresets: [overview, ...zones.map((zone) => zone.cameraPreset), seam],
    buildDurationMs: performance.now() - started,
  };
}

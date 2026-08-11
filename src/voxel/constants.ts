export const CHUNK_EDGE = 32;
export const VOLUME_SIZE = CHUNK_EDGE;
export const VOLUME_VOXEL_COUNT = VOLUME_SIZE ** 3;
export const HALO_EDGE = CHUNK_EDGE + 2;
export const HALO_VOXEL_COUNT = HALO_EDGE ** 3;
export const VOXEL_SIZE_METERS = 0.25;

export const WORLD_CHUNK_BOUNDS = {
  min: { x: -8, y: 0, z: -8 },
  maxExclusive: { x: 8, y: 4, z: 8 },
} as const;
export const WORLD_CELL_BOUNDS = {
  min: { x: -256, y: 0, z: -256 },
  maxExclusive: { x: 256, y: 128, z: 256 },
} as const;
export const WORLD_CELLS = { x: 512, y: 128, z: 512 } as const;
export const WORLD_METERS = { x: 128, y: 32, z: 128 } as const;
export const CANDIDATE_CHUNK_COUNT = 1_024;
export const MAX_MATERIALIZED_CHUNKS = 255;

export enum VoxelMaterial {
  Air = 0,
  Platform = 1,
  Stairs = 2,
  Shell = 3,
  Roof = 4,
}

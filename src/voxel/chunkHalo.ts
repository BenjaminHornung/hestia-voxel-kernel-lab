import { HALO_EDGE, HALO_VOXEL_COUNT, VOLUME_SIZE, VoxelMaterial } from './constants';
import { chunkCoordToKey } from './coordinates';
import type { DenseVoxelVolume } from './denseVolume';
import type { SparseChunkWorld } from './sparseChunkWorld';
import type { ChunkCoord, ChunkKey } from './types';

export interface ChunkHaloSnapshot {
  readonly key: ChunkKey;
  readonly coord: ChunkCoord;
  readonly voxels: Uint8Array;
}

export function assertValidChunkHaloSnapshot(halo: ChunkHaloSnapshot): void {
  const expectedKey = chunkCoordToKey(halo.coord);
  if (halo.key !== expectedKey) {
    throw new RangeError(`Halo key ${halo.key} does not match coordinate ${expectedKey}.`);
  }
  if (halo.voxels.length !== HALO_VOXEL_COUNT) {
    throw new RangeError(`Expected a ${HALO_EDGE}³ halo snapshot.`);
  }
  for (const material of halo.voxels) {
    if (material > VoxelMaterial.Roof) {
      throw new RangeError(`Halo contains invalid voxel material ${material}.`);
    }
  }
}

export function haloIndex(x: number, y: number, z: number): number {
  if (![x, y, z].every((value) => Number.isInteger(value) && value >= -1 && value <= VOLUME_SIZE)) {
    throw new RangeError(`Halo coordinate (${x}, ${y}, ${z}) is outside -1..${VOLUME_SIZE}.`);
  }
  return (x + 1) + HALO_EDGE * ((y + 1) + HALO_EDGE * (z + 1));
}

export function createChunkHaloSnapshot(world: SparseChunkWorld, coord: ChunkCoord): ChunkHaloSnapshot {
  const voxels = new Uint8Array(HALO_VOXEL_COUNT);
  const originX = coord.x * VOLUME_SIZE;
  const originY = coord.y * VOLUME_SIZE;
  const originZ = coord.z * VOLUME_SIZE;
  for (let z = -1; z <= VOLUME_SIZE; z += 1) {
    for (let y = -1; y <= VOLUME_SIZE; y += 1) {
      for (let x = -1; x <= VOLUME_SIZE; x += 1) {
        voxels[haloIndex(x, y, z)] = world.getCell(originX + x, originY + y, originZ + z);
      }
    }
  }
  return { key: chunkCoordToKey(coord), coord: { ...coord }, voxels };
}

export function createVolumeHaloSnapshot(volume: DenseVoxelVolume): ChunkHaloSnapshot {
  const voxels = new Uint8Array(HALO_VOXEL_COUNT);
  for (let z = 0; z < VOLUME_SIZE; z += 1) {
    for (let y = 0; y < VOLUME_SIZE; y += 1) {
      for (let x = 0; x < VOLUME_SIZE; x += 1) {
        const material = volume.get(x, y, z);
        if (material !== VoxelMaterial.Air) {
          voxels[haloIndex(x, y, z)] = material;
        }
      }
    }
  }
  return { key: '0,0,0', coord: { x: 0, y: 0, z: 0 }, voxels };
}

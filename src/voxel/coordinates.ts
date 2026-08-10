import { VOLUME_SIZE } from './constants';

export function isInsideVolume(x: number, y: number, z: number): boolean {
  return x >= 0 && x < VOLUME_SIZE && y >= 0 && y < VOLUME_SIZE && z >= 0 && z < VOLUME_SIZE;
}

export function voxelIndex(x: number, y: number, z: number): number {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z) || !isInsideVolume(x, y, z)) {
    throw new RangeError(`Voxel coordinate (${x}, ${y}, ${z}) is outside the ${VOLUME_SIZE}³ volume.`);
  }

  return x + VOLUME_SIZE * (y + VOLUME_SIZE * z);
}

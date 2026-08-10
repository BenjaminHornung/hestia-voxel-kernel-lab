import { VOLUME_SIZE, VOLUME_VOXEL_COUNT } from './constants';

export function isInsideVolume(x: number, y: number, z: number): boolean {
  return x >= 0 && x < VOLUME_SIZE && y >= 0 && y < VOLUME_SIZE && z >= 0 && z < VOLUME_SIZE;
}

export function voxelIndex(x: number, y: number, z: number): number {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z) || !isInsideVolume(x, y, z)) {
    throw new RangeError(`Voxel coordinate (${x}, ${y}, ${z}) is outside the ${VOLUME_SIZE}³ volume.`);
  }

  return x + VOLUME_SIZE * (y + VOLUME_SIZE * z);
}

export function voxelCoordinates(index: number): readonly [number, number, number] {
  if (!Number.isInteger(index) || index < 0 || index >= VOLUME_VOXEL_COUNT) {
    throw new RangeError(`Voxel index ${index} is outside the ${VOLUME_SIZE}³ volume.`);
  }

  return [
    index % VOLUME_SIZE,
    Math.floor(index / VOLUME_SIZE) % VOLUME_SIZE,
    Math.floor(index / (VOLUME_SIZE ** 2)),
  ];
}

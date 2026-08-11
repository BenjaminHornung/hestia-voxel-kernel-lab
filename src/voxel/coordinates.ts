import { VOLUME_SIZE, VOLUME_VOXEL_COUNT } from './constants';
import type { ChunkCoord, ChunkKey } from './types';

const CHUNK_KEY_PATTERN = /^(-?(?:0|[1-9]\d*)),(-?(?:0|[1-9]\d*)),(-?(?:0|[1-9]\d*))$/;

function requireSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer.`);
  }
}

function requireCoord(coord: ChunkCoord, label: string): void {
  requireSafeInteger(coord.x, `${label}.x`);
  requireSafeInteger(coord.y, `${label}.y`);
  requireSafeInteger(coord.z, `${label}.z`);
}

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

export function worldCellAxisToChunk(value: number): { readonly chunk: number; readonly local: number } {
  requireSafeInteger(value, 'World cell coordinate');
  const chunk = Math.floor(value / VOLUME_SIZE);
  return { chunk, local: value - chunk * VOLUME_SIZE };
}

export function worldCellToChunkLocal(x: number, y: number, z: number): {
  readonly chunk: ChunkCoord;
  readonly local: ChunkCoord;
} {
  const mappedX = worldCellAxisToChunk(x);
  const mappedY = worldCellAxisToChunk(y);
  const mappedZ = worldCellAxisToChunk(z);
  return {
    chunk: { x: mappedX.chunk, y: mappedY.chunk, z: mappedZ.chunk },
    local: { x: mappedX.local, y: mappedY.local, z: mappedZ.local },
  };
}

export function chunkLocalToWorldCell(chunk: ChunkCoord, local: ChunkCoord): ChunkCoord {
  requireCoord(chunk, 'Chunk coordinate');
  requireCoord(local, 'Local coordinate');
  if (!isInsideVolume(local.x, local.y, local.z)) {
    throw new RangeError(`Local coordinate (${local.x}, ${local.y}, ${local.z}) is outside the ${VOLUME_SIZE}³ chunk.`);
  }
  const world = {
    x: chunk.x * VOLUME_SIZE + local.x,
    y: chunk.y * VOLUME_SIZE + local.y,
    z: chunk.z * VOLUME_SIZE + local.z,
  };
  requireCoord(world, 'World cell coordinate');
  return world;
}

export function chunkCoordToKey(coord: ChunkCoord): ChunkKey {
  requireCoord(coord, 'Chunk coordinate');
  return `${coord.x},${coord.y},${coord.z}`;
}

export function chunkKeyToCoord(key: ChunkKey): ChunkCoord {
  const match = CHUNK_KEY_PATTERN.exec(key);
  if (!match) {
    throw new RangeError(`Malformed chunk key: ${key}`);
  }
  const coord = { x: Number(match[1]), y: Number(match[2]), z: Number(match[3]) };
  requireCoord(coord, 'Chunk key coordinate');
  if (chunkCoordToKey(coord) !== key) {
    throw new RangeError(`Non-canonical chunk key: ${key}`);
  }
  return coord;
}

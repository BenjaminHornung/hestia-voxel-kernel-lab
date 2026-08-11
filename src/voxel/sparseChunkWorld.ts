import { VoxelMaterial } from './constants';
import { chunkCoordToKey, worldCellToChunkLocal } from './coordinates';
import { DenseVoxelVolume } from './denseVolume';
import type { ChunkCoord, ChunkKey } from './types';

export interface ChunkPayload {
  readonly coord: ChunkCoord;
  readonly voxels: Uint8Array;
}

export interface ChunkSnapshot extends ChunkPayload {
  readonly key: ChunkKey;
  readonly occupiedCount: number;
}

export class SparseChunkWorld {
  readonly #chunks = new Map<ChunkKey, { readonly coord: ChunkCoord; readonly volume: DenseVoxelVolume }>();
  readonly occupiedCount: number;

  constructor(chunks: Iterable<ChunkPayload> = []) {
    let occupiedCount = 0;
    for (const chunk of chunks) {
      const key = chunkCoordToKey(chunk.coord);
      if (this.#chunks.has(key)) {
        throw new RangeError(`Duplicate chunk: ${key}`);
      }
      const volume = new DenseVoxelVolume(chunk.voxels);
      if (volume.occupiedCount === 0) {
        continue;
      }
      this.#chunks.set(key, { coord: { ...chunk.coord }, volume });
      occupiedCount += volume.occupiedCount;
    }
    this.occupiedCount = occupiedCount;
  }

  get materializedChunkCount(): number {
    return this.#chunks.size;
  }

  getCell(x: number, y: number, z: number): VoxelMaterial {
    const { chunk, local } = worldCellToChunkLocal(x, y, z);
    const stored = this.#chunks.get(chunkCoordToKey(chunk));
    return stored?.volume.get(local.x, local.y, local.z) ?? VoxelMaterial.Air;
  }

  chunkCoords(): readonly ChunkCoord[] {
    return [...this.#chunks.values()]
      .map(({ coord }) => ({ ...coord }))
      .sort((left, right) => left.z - right.z || left.y - right.y || left.x - right.x);
  }

  chunkSnapshot(coord: ChunkCoord): ChunkSnapshot | null {
    const key = chunkCoordToKey(coord);
    const stored = this.#chunks.get(key);
    return stored ? {
      key,
      coord: { ...stored.coord },
      voxels: stored.volume.snapshot(),
      occupiedCount: stored.volume.occupiedCount,
    } : null;
  }

  snapshots(): readonly ChunkSnapshot[] {
    return this.chunkCoords().map((coord) => this.chunkSnapshot(coord)!);
  }

  signature(): string {
    let hash = 0x811c9dc5;
    const add = (byte: number): void => {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    };
    for (const snapshot of this.snapshots()) {
      for (const character of snapshot.key) {
        add(character.charCodeAt(0));
      }
      add(0);
      for (const material of snapshot.voxels) {
        add(material);
      }
    }
    return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
  }
}

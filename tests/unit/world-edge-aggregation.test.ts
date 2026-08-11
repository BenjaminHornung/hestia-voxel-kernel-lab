import { describe, expect, it } from 'vitest';
import { createWorldEdgePositions } from '../../src/render-three/worldEdgeAggregation';
import { VOLUME_VOXEL_COUNT, VoxelMaterial } from '../../src/voxel/constants';
import { createChunkHaloSnapshot } from '../../src/voxel/chunkHalo';
import { SparseChunkWorld } from '../../src/voxel/sparseChunkWorld';
import { meshChunkVisibleFaces } from '../../src/voxel/visibleFaceMesher';

function adjacentFullChunkMeshes() {
  const voxels = new Uint8Array(VOLUME_VOXEL_COUNT).fill(VoxelMaterial.Platform);
  const world = new SparseChunkWorld([
    { coord: { x: 0, y: 0, z: 0 }, voxels },
    { coord: { x: 1, y: 0, z: 0 }, voxels },
  ]);
  return world.chunkCoords().map((coord) => meshChunkVisibleFaces(createChunkHaloSnapshot(world, coord)));
}

function segmentKey(values: ArrayLike<number>, offset: number): string {
  const start = [values[offset], values[offset + 1], values[offset + 2]];
  const end = [values[offset + 3], values[offset + 4], values[offset + 5]];
  const startKey = start.join(',');
  const endKey = end.join(',');
  return startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
}

describe('world-space block edge aggregation', () => {
  it('globally deduplicates adjacent chunk edges without diagonals', () => {
    const positions = createWorldEdgePositions(adjacentFullChunkMeshes(), 1);
    const keys = new Map<string, number>();
    for (let offset = 0; offset < positions.length; offset += 6) {
      const key = segmentKey(positions, offset);
      keys.set(key, (keys.get(key) ?? 0) + 1);
      const differences = [0, 1, 2].map((axis) => Math.abs(positions[offset + axis]! - positions[offset + 3 + axis]!));
      expect(differences.filter((value) => value !== 0)).toEqual([1]);
    }
    expect(keys.size).toBe(positions.length / 6);
    expect(keys.get('32,32,0|32,32,1')).toBe(1);
    expect(keys.get('32,0,0|32,1,0')).toBe(1);
  });

  it('produces byte-identical arrays for identical chunk mesh input', () => {
    const meshes = adjacentFullChunkMeshes();
    const first = createWorldEdgePositions(meshes, 0.25);
    const second = createWorldEdgePositions(meshes, 0.25);
    expect(new Uint8Array(first.buffer)).toEqual(new Uint8Array(second.buffer));
    const reversed = createWorldEdgePositions([...meshes].reverse(), 0.25);
    expect(new Uint8Array(first.buffer)).toEqual(new Uint8Array(reversed.buffer));
  });
});

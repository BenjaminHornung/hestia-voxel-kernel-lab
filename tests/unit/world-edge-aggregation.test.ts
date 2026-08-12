import { describe, expect, it } from 'vitest';
import { createMesherEdgeProducts, createWorldEdgePositions, createWorldQuadEdgePositions } from '../../src/render-three/worldEdgeAggregation';
import { VOLUME_VOXEL_COUNT, VoxelMaterial } from '../../src/voxel/constants';
import { createChunkHaloSnapshot } from '../../src/voxel/chunkHalo';
import { SparseChunkWorld } from '../../src/voxel/sparseChunkWorld';
import { meshChunkGreedyFaces } from '../../src/voxel/greedyFaceMesher';
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

describe('world-space mesh quad edge aggregation', () => {
  it('shows active greedy quad boundaries without diagonals or duplicate segment keys', () => {
    const voxels = new Uint8Array(VOLUME_VOXEL_COUNT);
    for (let z = 0; z < 2; z += 1) for (let y = 0; y < 2; y += 1) for (let x = 0; x < 2; x += 1) {
      voxels[x + 32 * (y + 32 * z)] = VoxelMaterial.Platform;
    }
    const world = new SparseChunkWorld([{ coord: { x: 0, y: 0, z: 0 }, voxels }]);
    const halo = createChunkHaloSnapshot(world, { x: 0, y: 0, z: 0 });
    const visible = meshChunkVisibleFaces(halo);
    const greedy = meshChunkGreedyFaces(halo);
    const visibleEdges = createWorldQuadEdgePositions([visible], 1);
    const greedyEdges = createWorldQuadEdgePositions([greedy], 1);
    expect(greedyEdges).not.toEqual(visibleEdges);
    const keys = new Set<string>();
    let hasLongEdge = false;
    for (let offset = 0; offset < greedyEdges.length; offset += 6) {
      const key = segmentKey(greedyEdges, offset);
      expect(keys.has(key)).toBe(false);
      keys.add(key);
      const differences = [0, 1, 2].map((axis) => Math.abs(greedyEdges[offset + axis]! - greedyEdges[offset + 3 + axis]!));
      expect(differences.filter((value) => value !== 0)).toHaveLength(1);
      hasLongEdge ||= differences.includes(2);
    }
    expect(hasLongEdge).toBe(true);
    expect(createWorldQuadEdgePositions([greedy], 1)).toEqual(greedyEdges);
  });

  it('keeps unit block-edge bytes independent of the active mesher', () => {
    const voxels = new Uint8Array(VOLUME_VOXEL_COUNT).fill(VoxelMaterial.Platform);
    const world = new SparseChunkWorld([{ coord: { x: 0, y: 0, z: 0 }, voxels }]);
    const halo = createChunkHaloSnapshot(world, { x: 0, y: 0, z: 0 });
    const visible = [meshChunkVisibleFaces(halo)];
    const greedy = [meshChunkGreedyFaces(halo)];
    const visibleMode = createMesherEdgeProducts(visible, visible, 0.25);
    const greedyMode = createMesherEdgeProducts(visible, greedy, 0.25);
    expect(new Uint8Array(greedyMode.blockEdgePositions.buffer)).toEqual(new Uint8Array(visibleMode.blockEdgePositions.buffer));
    expect(greedyMode.meshQuadEdgePositions).not.toEqual(visibleMode.meshQuadEdgePositions);
  });
});

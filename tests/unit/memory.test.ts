import { describe, expect, it } from 'vitest';
import { candidateDenseVoxelBytes, summarizeMeshMemory } from '../../src/diagnostics/memory';
import { VOLUME_VOXEL_COUNT, VoxelMaterial } from '../../src/voxel/constants';
import { createChunkHaloSnapshot } from '../../src/voxel/chunkHalo';
import { SparseChunkWorld } from '../../src/voxel/sparseChunkWorld';
import { meshChunkVisibleFaces } from '../../src/voxel/visibleFaceMesher';

describe('memory diagnostics', () => {
  it('reports theoretical candidate bytes separately from exact resident payload bytes', () => {
    expect(candidateDenseVoxelBytes(1_024)).toBe(1_024 * VOLUME_VOXEL_COUNT);
    const voxels = new Uint8Array(VOLUME_VOXEL_COUNT);
    voxels[0] = VoxelMaterial.Platform;
    const world = new SparseChunkWorld([{ coord: { x: 0, y: 0, z: 0 }, voxels }]);
    expect(world.materializedVoxelPayloadBytes).toBe(VOLUME_VOXEL_COUNT);
    expect(world.materializedVoxelPayloadBytes).toBeLessThan(candidateDenseVoxelBytes(1_024));
  });

  it('sums exact neutral mesh typed-array byte lengths', () => {
    const voxels = new Uint8Array(VOLUME_VOXEL_COUNT);
    voxels[0] = VoxelMaterial.Platform;
    const world = new SparseChunkWorld([{ coord: { x: 0, y: 0, z: 0 }, voxels }]);
    const mesh = meshChunkVisibleFaces(createChunkHaloSnapshot(world, { x: 0, y: 0, z: 0 }));
    const memory = summarizeMeshMemory([mesh]);
    expect(memory).toEqual({
      meshPositionBytes: mesh.positions.byteLength,
      meshNormalBytes: mesh.normals.byteLength,
      meshIndexBytes: mesh.indices.byteLength,
      meshMaterialIdBytes: mesh.materialIds.byteLength,
      meshTotalBytes: mesh.positions.byteLength + mesh.normals.byteLength + mesh.indices.byteLength + mesh.materialIds.byteLength,
    });
  });
});

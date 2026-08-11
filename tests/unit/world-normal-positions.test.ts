import { describe, expect, it } from 'vitest';
import { createWorldNormalPositions } from '../../src/render-three/threeVoxelRenderer';
import { VOLUME_VOXEL_COUNT, VoxelMaterial } from '../../src/voxel/constants';
import { createChunkHaloSnapshot } from '../../src/voxel/chunkHalo';
import { SparseChunkWorld } from '../../src/voxel/sparseChunkWorld';
import { meshChunkVisibleFaces } from '../../src/voxel/visibleFaceMesher';

describe('world-space normal debug positions', () => {
  it('transforms chunk-local normal lines by chunk origin and voxel scale', () => {
    const voxels = new Uint8Array(VOLUME_VOXEL_COUNT);
    voxels[0] = VoxelMaterial.Platform;
    const world = new SparseChunkWorld([{ coord: { x: 1, y: 2, z: 3 }, voxels }]);
    const mesh = meshChunkVisibleFaces(createChunkHaloSnapshot(world, { x: 1, y: 2, z: 3 }));
    const positions = createWorldNormalPositions([mesh], 0.25);
    expect(positions[0]).toBe(8);
    expect(positions[1]).toBeCloseTo(16.125, 5);
    expect(positions[2]).toBeCloseTo(24.125, 5);
    expect(positions[3]).toBeCloseTo(7.93, 5);
    expect(positions[4]).toBeCloseTo(16.125, 5);
    expect(positions[5]).toBeCloseTo(24.125, 5);
  });
});

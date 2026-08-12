import { describe, expect, it } from 'vitest';
import { createPackedAoVertexColors, AO_DARKNESS } from '../../src/render-three/aoVertexColors';
import { createRendererColorAttribute } from '../../src/render-three/threeVoxelRenderer';
import { createWorldDiagonalPositions } from '../../src/render-three/worldEdgeAggregation';
import { meshChunkAoGreedyFaces } from '../../src/voxel/aoGreedyFaceMesher';
import { VOLUME_VOXEL_COUNT, VoxelMaterial } from '../../src/voxel/constants';
import { createVolumeHaloSnapshot } from '../../src/voxel/chunkHalo';
import { voxelIndex } from '../../src/voxel/coordinates';
import { DenseVoxelVolume } from '../../src/voxel/denseVolume';
import { PALETTE_LOOKUP_V1 } from '../../src/voxel/palette';

describe('WP04 packed renderer products', () => {
  it('uses exact normalized Uint8 RGB bytes and deterministic AO darkness', () => {
    const voxels = new Uint8Array(VOLUME_VOXEL_COUNT);
    voxels[voxelIndex(10, 10, 10)] = VoxelMaterial.Platform;
    const mesh = meshChunkAoGreedyFaces(createVolumeHaloSnapshot(new DenseVoxelVolume(voxels)));
    mesh.aoLevels.set([0, 1, 2, 3]);
    const off = createPackedAoVertexColors(mesh, false, 'surface');
    const on = createPackedAoVertexColors(mesh, true, 'surface');
    const debug = createPackedAoVertexColors(mesh, true, 'ao-levels');
    expect(off).toBeInstanceOf(Uint8Array);
    expect(off.byteLength).toBe(mesh.materialIds.length * 3);
    expect(off.slice(0, 12)).toEqual(new Uint8Array([52, 62, 73, 52, 62, 73, 52, 62, 73, 52, 62, 73]));
    expect(on.slice(0, 12)).toEqual(new Uint8Array([21, 25, 29, 31, 37, 44, 42, 49, 59, 52, 62, 73]));
    expect(debug.slice(0, 12)).toEqual(new Uint8Array([2, 4, 8, 8, 26, 72, 147, 65, 7, 226, 202, 149]));
    const attribute = createRendererColorAttribute(on);
    expect(attribute.array).toBe(on);
    expect(attribute.itemSize).toBe(3);
    expect(attribute.normalized).toBe(true);
    expect(AO_DARKNESS).toBe(0.60);
  });

  it('darkens an occluded corner but preserves a non-occluded corner and exact palette colors', () => {
    const voxels = new Uint8Array(VOLUME_VOXEL_COUNT);
    voxels[voxelIndex(10, 10, 10)] = VoxelMaterial.Platform;
    voxels[voxelIndex(9, 11, 10)] = VoxelMaterial.Shell;
    const mesh = meshChunkAoGreedyFaces(createVolumeHaloSnapshot(new DenseVoxelVolume(voxels)));
    const off = createPackedAoVertexColors(mesh, false, 'surface');
    const on = createPackedAoVertexColors(mesh, true, 'surface');
    expect([...on].some((value, index) => value < off[index]!)).toBe(true);
    const materials = createPackedAoVertexColors(mesh, true, 'materials');
    expect(materials).toEqual(off);
  });

  it('maps AO-level and normal debug views to deterministic discrete colors', () => {
    const voxels = new Uint8Array(VOLUME_VOXEL_COUNT);
    voxels[voxelIndex(10, 10, 10)] = VoxelMaterial.Platform;
    const mesh = meshChunkAoGreedyFaces(createVolumeHaloSnapshot(new DenseVoxelVolume(voxels)));
    const levels = createPackedAoVertexColors(mesh, true, 'ao-levels');
    const normals = createPackedAoVertexColors(mesh, true, 'normals');
    expect(new Set(Array.from({ length: levels.length / 3 }, (_, vertex) => Array.from(levels.slice(vertex * 3, vertex * 3 + 3)).join(','))).size).toBe(1);
    expect(new Set(Array.from({ length: normals.length / 3 }, (_, vertex) => Array.from(normals.slice(vertex * 3, vertex * 3 + 3)).join(','))).size).toBe(6);
  });

  it('emits only the actual selected triangle diagonals in world meters', () => {
    const voxels = new Uint8Array(VOLUME_VOXEL_COUNT);
    for (let z = 9; z < 12; z += 1) for (let y = 9; y < 12; y += 1) for (let x = 9; x < 12; x += 1) {
      if ((x + y + z) % 2 === 0) voxels[voxelIndex(x, y, z)] = VoxelMaterial.Platform;
    }
    const mesh = meshChunkAoGreedyFaces(createVolumeHaloSnapshot(new DenseVoxelVolume(voxels)), PALETTE_LOOKUP_V1.filter((entry): entry is NonNullable<typeof entry> => entry !== undefined));
    const normal = createWorldDiagonalPositions([mesh], 0.25, 'normal');
    const flipped = createWorldDiagonalPositions([mesh], 0.25, 'flipped');
    expect(normal.byteLength).toBe(mesh.normalDiagonalCount * 6 * Float32Array.BYTES_PER_ELEMENT);
    expect(flipped.byteLength).toBe(mesh.flippedDiagonalCount * 6 * Float32Array.BYTES_PER_ELEMENT);
    expect(createWorldDiagonalPositions([mesh], 0.25, 'normal')).toEqual(normal);
  });
});

import { describe, expect, it } from 'vitest';
import { HALO_VOXEL_COUNT, VOLUME_VOXEL_COUNT, VoxelMaterial } from '../../src/voxel/constants';
import { createChunkHaloSnapshot, haloIndex } from '../../src/voxel/chunkHalo';
import {
  chunkCoordToKey,
  chunkKeyToCoord,
  chunkLocalToWorldCell,
  voxelIndex,
  worldCellAxisToChunk,
  worldCellToChunkLocal,
} from '../../src/voxel/coordinates';
import { SparseChunkWorld } from '../../src/voxel/sparseChunkWorld';
import type { ChunkCoord } from '../../src/voxel/types';
import { meshChunkVisibleFaces } from '../../src/voxel/visibleFaceMesher';

const REQUIRED_BOUNDARIES = [-65, -64, -33, -32, -31, -1, 0, 1, 31, 32, 33, 63, 64, 65] as const;
const ORIGIN = { x: 0, y: 0, z: 0 } as const;

function fullChunk(material = VoxelMaterial.Platform): Uint8Array {
  return new Uint8Array(VOLUME_VOXEL_COUNT).fill(material);
}

describe('signed chunk coordinates', () => {
  it('maps every required signed boundary with floor division and positive modulo', () => {
    for (const value of REQUIRED_BOUNDARIES) {
      const { chunk, local } = worldCellAxisToChunk(value);
      expect(local).toBeGreaterThanOrEqual(0);
      expect(local).toBeLessThan(32);
      expect(chunk * 32 + local).toBe(value);
      const mapped = worldCellToChunkLocal(value, value, value);
      expect(mapped.chunk).toEqual({ x: chunk, y: chunk, z: chunk });
      expect(mapped.local).toEqual({ x: local, y: local, z: local });
      expect(chunkLocalToWorldCell(mapped.chunk, mapped.local)).toEqual({ x: value, y: value, z: value });
    }
  });

  it('round-trips stable canonical keys and rejects malformed keys', () => {
    for (const coord of [{ x: -8, y: 0, z: 7 }, ORIGIN, { x: 7, y: 3, z: -8 }]) {
      expect(chunkKeyToCoord(chunkCoordToKey(coord))).toEqual(coord);
    }
    for (const key of ['', '1,2', '1,2,3,4', '1.0,2,3', '01,2,3', '-0,2,3', 'x,2,3', '1, 2,3']) {
      expect(() => chunkKeyToCoord(key)).toThrow(RangeError);
    }
  });

  it('rejects non-integer world, chunk, and local coordinates', () => {
    expect(() => worldCellAxisToChunk(0.5)).toThrow(RangeError);
    expect(() => worldCellToChunkLocal(0, Number.NaN, 0)).toThrow(RangeError);
    expect(() => chunkCoordToKey({ x: 0, y: 1.5, z: 0 })).toThrow(RangeError);
    expect(() => chunkLocalToWorldCell(ORIGIN, { x: 32, y: 0, z: 0 })).toThrow(RangeError);
    expect(() => chunkLocalToWorldCell(ORIGIN, { x: 0, y: 0.5, z: 0 })).toThrow(RangeError);
    expect(() => chunkLocalToWorldCell({ x: Number.MAX_SAFE_INTEGER, y: 0, z: 0 }, ORIGIN)).toThrow(RangeError);
  });
});

describe('SparseChunkWorld', () => {
  it('treats missing and empty chunks as air without materializing candidates', () => {
    const world = new SparseChunkWorld([{ coord: ORIGIN, voxels: new Uint8Array(VOLUME_VOXEL_COUNT) }]);
    expect(world.materializedChunkCount).toBe(0);
    expect(world.occupiedCount).toBe(0);
    expect(world.getCell(0, 0, 0)).toBe(VoxelMaterial.Air);
    expect(world.getCell(-1, 0, 0)).toBe(VoxelMaterial.Air);
  });

  it('defensively owns payloads and snapshots', () => {
    const payload = new Uint8Array(VOLUME_VOXEL_COUNT);
    payload[voxelIndex(1, 2, 3)] = VoxelMaterial.Stairs;
    const world = new SparseChunkWorld([{ coord: ORIGIN, voxels: payload }]);
    payload[voxelIndex(1, 2, 3)] = VoxelMaterial.Air;
    const snapshot = world.chunkSnapshot(ORIGIN)!;
    snapshot.voxels[voxelIndex(1, 2, 3)] = VoxelMaterial.Roof;
    expect(world.getCell(1, 2, 3)).toBe(VoxelMaterial.Stairs);
    expect(world.materializedChunkCount).toBe(1);
    expect(world.occupiedCount).toBe(1);
  });

  it('rejects duplicate chunk coordinates', () => {
    expect(() => new SparseChunkWorld([
      { coord: ORIGIN, voxels: fullChunk() },
      { coord: ORIGIN, voxels: fullChunk() },
    ])).toThrow(RangeError);
  });
});

describe('chunk halo and seam meshing', () => {
  it('copies a 34³ halo across all six neighbors and isolates mutations', () => {
    const neighbors: ReadonlyArray<readonly [ChunkCoord, readonly [number, number, number]]> = [
      [{ x: -1, y: 0, z: 0 }, [31, 10, 10]],
      [{ x: 1, y: 0, z: 0 }, [0, 10, 10]],
      [{ x: 0, y: -1, z: 0 }, [10, 31, 10]],
      [{ x: 0, y: 1, z: 0 }, [10, 0, 10]],
      [{ x: 0, y: 0, z: -1 }, [10, 10, 31]],
      [{ x: 0, y: 0, z: 1 }, [10, 10, 0]],
    ];
    const chunks = neighbors.map(([coord, local]) => {
      const voxels = new Uint8Array(VOLUME_VOXEL_COUNT);
      voxels[voxelIndex(local[0], local[1], local[2])] = VoxelMaterial.Shell;
      return { coord, voxels };
    });
    const world = new SparseChunkWorld(chunks);
    const halo = createChunkHaloSnapshot(world, ORIGIN);
    expect(halo.voxels).toHaveLength(HALO_VOXEL_COUNT);
    for (const local of [[-1, 10, 10], [32, 10, 10], [10, -1, 10], [10, 32, 10], [10, 10, -1], [10, 10, 32]] as const) {
      expect(halo.voxels[haloIndex(local[0], local[1], local[2])]).toBe(VoxelMaterial.Shell);
    }
    expect(halo.voxels[haloIndex(-1, 0, 0)]).toBe(VoxelMaterial.Air);
    halo.voxels[haloIndex(-1, 10, 10)] = VoxelMaterial.Air;
    expect(world.getCell(-1, 10, 10)).toBe(VoxelMaterial.Shell);
  });

  it.each([
    ['-X', { x: -1, y: 0, z: 0 }],
    ['+X', { x: 1, y: 0, z: 0 }],
    ['-Y', { x: 0, y: -1, z: 0 }],
    ['+Y', { x: 0, y: 1, z: 0 }],
    ['-Z', { x: 0, y: 0, z: -1 }],
    ['+Z', { x: 0, y: 0, z: 1 }],
  ] as const)('removes the internal %s seam for adjacent full chunks and restores it without the neighbor', (_axis, adjacent) => {
    const world = new SparseChunkWorld([
      { coord: ORIGIN, voxels: fullChunk() },
      { coord: adjacent, voxels: fullChunk() },
    ]);
    const left = meshChunkVisibleFaces(createChunkHaloSnapshot(world, ORIGIN));
    const right = meshChunkVisibleFaces(createChunkHaloSnapshot(world, adjacent));
    expect(left.quadCount + right.quadCount).toBe(10_240);
    expect(left.triangleCount + right.triangleCount).toBe(20_480);
    expect(left.quadCount).toBe(5_120);
    expect(right.quadCount).toBe(5_120);

    const alone = meshChunkVisibleFaces(createChunkHaloSnapshot(
      new SparseChunkWorld([{ coord: ORIGIN, voxels: fullChunk() }]),
      ORIGIN,
    ));
    expect(alone.quadCount).toBe(6_144);
  });

  it('keeps local axis-aligned deterministic output', () => {
    const data = new Uint8Array(VOLUME_VOXEL_COUNT);
    data[voxelIndex(0, 0, 0)] = VoxelMaterial.Roof;
    data[voxelIndex(31, 31, 31)] = VoxelMaterial.Shell;
    const world = new SparseChunkWorld([{ coord: { x: -2, y: 1, z: 3 }, voxels: data }]);
    const halo = createChunkHaloSnapshot(world, { x: -2, y: 1, z: 3 });
    const first = meshChunkVisibleFaces(halo);
    const second = meshChunkVisibleFaces({ ...halo, voxels: halo.voxels.slice() });
    expect(first.key).toBe('-2,1,3');
    expect(first.coord).toEqual({ x: -2, y: 1, z: 3 });
    expect(first.bounds).toEqual({ min: [0, 0, 0], max: [32, 32, 32] });
    expect(Math.min(...first.positions)).toBe(0);
    expect(Math.max(...first.positions)).toBe(32);
    expect(new Set(first.normals).has(0)).toBe(true);
    expect([...new Set(first.normals)].sort()).toEqual([-1, 0, 1]);
    expect(first.positions).toEqual(second.positions);
    expect(first.normals).toEqual(second.normals);
    expect(first.indices).toEqual(second.indices);
    expect(first.materialIds).toEqual(second.materialIds);
  });
});

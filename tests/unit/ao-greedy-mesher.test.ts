import { beforeAll, describe, expect, it } from 'vitest';
import { summarizeMeshMemory } from '../../src/diagnostics/memory';
import { meshChunkAoGreedyFaces } from '../../src/voxel/aoGreedyFaceMesher';
import { VOLUME_SIZE, VOLUME_VOXEL_COUNT, VoxelMaterial } from '../../src/voxel/constants';
import { createChunkHaloSnapshot, createVolumeHaloSnapshot, haloIndex, type ChunkHaloSnapshot } from '../../src/voxel/chunkHalo';
import { voxelIndex, worldCellToChunkLocal } from '../../src/voxel/coordinates';
import { DenseVoxelVolume } from '../../src/voxel/denseVolume';
import { createLargeChunkFixture } from '../../src/voxel/largeFixture';
import { PALETTE_V1, type PaletteEntryV1 } from '../../src/voxel/palette';
import { SparseChunkWorld } from '../../src/voxel/sparseChunkWorld';
import type { ChunkAoFaceMesh, ChunkCoord, Vec3 } from '../../src/voxel/types';
import { WP02_FIXTURE_GOLDEN } from '../contracts/wp02FixtureGolden';
import { WP03_GREEDY_GOLDEN } from '../contracts/wp03GreedyGolden';
import { WP04_AO_GOLDEN } from '../contracts/wp04AoGolden';
import { meshCoverage } from '../helpers/meshCoverageOracle';
import { occupancySurfaceCoverage } from '../helpers/occupancySurfaceOracle';

const ORIGIN = { x: 0, y: 0, z: 0 } as const;
const POSITIVE_FACE_AO_OFFSETS = {
  1: [
    [[1, -1, 0], [1, 0, 1], [1, -1, 1]], [[1, -1, 0], [1, 0, -1], [1, -1, -1]],
    [[1, 1, 0], [1, 0, -1], [1, 1, -1]], [[1, 1, 0], [1, 0, 1], [1, 1, 1]],
  ],
  3: [
    [[-1, 1, 0], [0, 1, -1], [-1, 1, -1]], [[-1, 1, 0], [0, 1, 1], [-1, 1, 1]],
    [[1, 1, 0], [0, 1, 1], [1, 1, 1]], [[1, 1, 0], [0, 1, -1], [1, 1, -1]],
  ],
  5: [
    [[-1, 0, 1], [0, -1, 1], [-1, -1, 1]], [[1, 0, 1], [0, -1, 1], [1, -1, 1]],
    [[1, 0, 1], [0, 1, 1], [1, 1, 1]], [[-1, 0, 1], [0, 1, 1], [-1, 1, 1]],
  ],
} as const;
type PositiveFaceId = keyof typeof POSITIVE_FACE_AO_OFFSETS;

function addCell(cell: Vec3, offset: Vec3): Vec3 {
  return [cell[0] + offset[0], cell[1] + offset[1], cell[2] + offset[2]];
}

function worldFromCells(cells: readonly Vec3[]): SparseChunkWorld {
  const chunks = new Map<string, { readonly coord: ChunkCoord; readonly voxels: Uint8Array }>();
  for (const cell of cells) {
    const { chunk, local } = worldCellToChunkLocal(cell[0], cell[1], cell[2]);
    const key = `${chunk.x},${chunk.y},${chunk.z}`;
    let payload = chunks.get(key);
    if (!payload) {
      payload = { coord: chunk, voxels: new Uint8Array(VOLUME_VOXEL_COUNT) };
      chunks.set(key, payload);
    }
    payload.voxels[voxelIndex(local.x, local.y, local.z)] = VoxelMaterial.Platform;
  }
  return new SparseChunkWorld(chunks.values());
}

function independentFaceAo(world: SparseChunkWorld, cell: Vec3, faceId: PositiveFaceId): readonly number[] {
  return POSITIVE_FACE_AO_OFFSETS[faceId].map(([side1, side2, corner]) => {
    const occupied = (offset: Vec3): boolean => {
      const sample = addCell(cell, offset);
      return world.getCell(sample[0], sample[1], sample[2]) !== VoxelMaterial.Air;
    };
    const first = occupied(side1);
    const second = occupied(side2);
    return first && second ? 0 : 3 - Number(first) - Number(second) - Number(occupied(corner));
  });
}

function positiveFaceAo(mesh: ChunkAoFaceMesh, faceId: PositiveFaceId): readonly number[] {
  const axis = Math.floor(faceId / 2);
  for (let vertex = 0; vertex < mesh.aoLevels.length; vertex += 4) {
    const offset = vertex * 3;
    if (mesh.normals[offset + axis] !== 1) continue;
    if ([0, 1, 2, 3].every((corner) => mesh.positions[offset + corner * 3 + axis] === VOLUME_SIZE)) {
      return [...mesh.aoLevels.slice(vertex, vertex + 4)];
    }
  }
  throw new Error(`Missing positive face ${faceId} at the chunk boundary.`);
}

function meshVolume(voxels: Uint8Array): { readonly halo: ChunkHaloSnapshot; readonly mesh: ChunkAoFaceMesh } {
  const halo = createVolumeHaloSnapshot(new DenseVoxelVolume(voxels));
  return { halo, mesh: meshChunkAoGreedyFaces(halo) };
}

function topQuadsAtPlane(mesh: ChunkAoFaceMesh, plane: number): number {
  let count = 0;
  for (let quad = 0; quad < mesh.quadCount; quad += 1) {
    const offset = quad * 12;
    if (mesh.normals[offset] === 0 && mesh.normals[offset + 1] === 1 && mesh.normals[offset + 2] === 0
      && mesh.positions[offset + 1] === plane) count += 1;
  }
  return count;
}

function assertSharedWorldVertexAo(meshes: readonly ChunkAoFaceMesh[]): void {
  const levels = new Map<string, { readonly level: number; readonly meshKey: string; readonly vertex: number; readonly material: number }>();
  for (const mesh of meshes) {
    const origin = [mesh.coord.x * VOLUME_SIZE, mesh.coord.y * VOLUME_SIZE, mesh.coord.z * VOLUME_SIZE];
    for (let vertex = 0; vertex < mesh.aoLevels.length; vertex += 1) {
      const offset = vertex * 3;
      const key = `${mesh.normals[offset]},${mesh.normals[offset + 1]},${mesh.normals[offset + 2]}|${
        mesh.positions[offset]! + origin[0]!},${mesh.positions[offset + 1]! + origin[1]!},${mesh.positions[offset + 2]! + origin[2]!
      }`;
      const current = { level: mesh.aoLevels[vertex]!, meshKey: mesh.key, vertex, material: mesh.materialIds[vertex]! };
      const previous = levels.get(key);
      if (previous !== undefined) expect(current.level, `${key} previous=${JSON.stringify(previous)} current=${JSON.stringify(current)}`).toBe(previous.level);
      else levels.set(key, current);
    }
  }
}

function aggregate(meshes: readonly ChunkAoFaceMesh[]) {
  const memory = summarizeMeshMemory(meshes);
  return {
    coveredUnitFaces: meshes.reduce((sum, mesh) => sum + mesh.coveredUnitFaces, 0),
    quads: meshes.reduce((sum, mesh) => sum + mesh.quadCount, 0),
    triangles: meshes.reduce((sum, mesh) => sum + mesh.triangleCount, 0),
    aoHistogram: meshes.reduce((sum, mesh) => sum.map((value, level) => value + mesh.aoHistogram[level]!), [0, 0, 0, 0]),
    normalDiagonals: meshes.reduce((sum, mesh) => sum + mesh.normalDiagonalCount, 0),
    flippedDiagonals: meshes.reduce((sum, mesh) => sum + mesh.flippedDiagonalCount, 0),
    aoBytes: meshes.reduce((sum, mesh) => sum + mesh.aoLevels.byteLength, 0),
    ...memory,
    coverageHash: meshCoverage(meshes).hash,
  };
}

describe('AO-aware greedy mesher', () => {
  it('emits AO in vertex order with exact typed-array and histogram contracts', () => {
    const voxels = new Uint8Array(VOLUME_VOXEL_COUNT);
    voxels[voxelIndex(10, 10, 10)] = VoxelMaterial.Platform;
    const { mesh } = meshVolume(voxels);
    expect(mesh.mesherMode).toBe('ao-greedy');
    expect(mesh.quadCount).toBe(6);
    expect(mesh.coveredUnitFaces).toBe(6);
    expect(mesh.aoLevels).toEqual(new Uint8Array(24).fill(3));
    expect(mesh.aoLevels).toHaveLength(mesh.quadCount * 4);
    expect(mesh.aoHistogram).toEqual([0, 0, 0, 24]);
    expect(mesh.normalDiagonalCount).toBe(6);
    expect(mesh.flippedDiagonalCount).toBe(0);
  });

  it('merges equal AO4 and splits when an internal AO signature changes', () => {
    const flat = new Uint8Array(VOLUME_VOXEL_COUNT);
    flat[voxelIndex(10, 10, 10)] = VoxelMaterial.Platform;
    flat[voxelIndex(11, 10, 10)] = VoxelMaterial.Platform;
    expect(topQuadsAtPlane(meshVolume(flat).mesh, 11)).toBe(1);
    const split = flat.slice();
    split[voxelIndex(9, 11, 10)] = VoxelMaterial.Shell;
    expect(topQuadsAtPlane(meshVolume(split).mesh, 11)).toBe(2);
  });

  it('does not merge a different material ID even when RGB values are equal', () => {
    const halo = createVolumeHaloSnapshot(new DenseVoxelVolume());
    halo.voxels[haloIndex(10, 10, 10)] = VoxelMaterial.Platform;
    halo.voxels[haloIndex(11, 10, 10)] = 5;
    const entries: PaletteEntryV1[] = [...PALETTE_V1.entries, {
      id: 5, name: 'platform-alias', baseColorSrgb24: 0x7d8792, opaque: true, contributesToAo: true,
    }];
    expect(topQuadsAtPlane(meshChunkAoGreedyFaces(halo, entries), 11)).toBe(2);
  });

  it('rejects a used material that the supplied palette does not define', () => {
    const halo = createVolumeHaloSnapshot(new DenseVoxelVolume());
    halo.voxels[haloIndex(10, 10, 10)] = 5;
    expect(() => meshChunkAoGreedyFaces(halo)).toThrow(/undefined in palette-v1/);
  });

  it('keeps every min/max boundary AO sample inside the existing 34³ halo', () => {
    for (const cell of [[0, 0, 0], [31, 31, 31]] as Vec3[]) {
      const halo = createVolumeHaloSnapshot(new DenseVoxelVolume());
      halo.voxels[haloIndex(cell[0], cell[1], cell[2])] = VoxelMaterial.Platform;
      const mesh = meshChunkAoGreedyFaces(halo);
      expect(mesh.coveredUnitFaces).toBe(6);
    }
  });

  it.each([
    ['X', [31, 10, 10], 1, [1, -1, 1]],
    ['Y', [10, 31, 10], 3, [-1, 1, -1]],
    ['Z', [10, 10, 31], 5, [-1, -1, 1]],
  ] as const)('samples nontrivial AO through the %s chunk halo', (_axis, cell, faceId, blockerOffset) => {
    const world = worldFromCells([cell, addCell(cell, blockerOffset)]);
    const actual = positiveFaceAo(meshChunkAoGreedyFaces(createChunkHaloSnapshot(world, ORIGIN)), faceId);
    expect(actual).toEqual(independentFaceAo(world, cell, faceId));
    expect(actual[0]).toBe(2);
  });

  it('samples a nontrivial AO corner through three neighboring chunks', () => {
    const cell: Vec3 = [31, 31, 31];
    const [side1, side2, corner] = POSITIVE_FACE_AO_OFFSETS[1][3];
    const world = worldFromCells([cell, addCell(cell, side1), addCell(cell, side2), addCell(cell, corner)]);
    const actual = positiveFaceAo(meshChunkAoGreedyFaces(createChunkHaloSnapshot(world, ORIGIN)), 1);
    expect(actual).toEqual(independentFaceAo(world, cell, 1));
    expect(actual[3]).toBe(0);
  });

  it('is byte-identical for repeated input', () => {
    const voxels = new Uint8Array(VOLUME_VOXEL_COUNT);
    for (let z = 4; z < 9; z += 1) for (let y = 4; y < 9; y += 1) for (let x = 4; x < 9; x += 1) {
      if ((x + y + z) % 3 !== 0) voxels[voxelIndex(x, y, z)] = 1 + (x + z) % 4;
    }
    const halo = createVolumeHaloSnapshot(new DenseVoxelVolume(voxels));
    expect(meshChunkAoGreedyFaces(halo)).toEqual(meshChunkAoGreedyFaces({ ...halo, voxels: halo.voxels.slice() }));
  });
});

describe('AO mesher independent surface property matrix', () => {
  it.each(Array.from({ length: 12 }, (_, index) => index + 1))(
    'matches direct occupancy coverage for dimension %i³ at deterministic densities/materials', (size) => {
    const densities = [0, 1, 10, 50, 90, 100];
    for (const density of densities) {
      const voxels = new Uint8Array(VOLUME_VOXEL_COUNT);
      for (let z = 0; z < size; z += 1) for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
        let hash = Math.imul(x + size * 17, 0x45d9f3b) ^ Math.imul(y + density * 31, 0x45d9f3b) ^ Math.imul(z + 97, 0x45d9f3b);
        hash = (hash ^ (hash >>> 16)) >>> 0;
        if (density === 100 || (density > 0 && hash % 100 < density)) voxels[voxelIndex(x, y, z)] = 1 + hash % 4;
      }
      const halo = createVolumeHaloSnapshot(new DenseVoxelVolume(voxels));
      const mesh = meshChunkAoGreedyFaces(halo);
      const direct = occupancySurfaceCoverage([halo]);
      const derived = meshCoverage([mesh]);
      expect(derived.keys, `size=${size}, density=${density}`).toEqual(direct.keys);
      expect(derived.hash).toBe(direct.hash);
      expect(mesh.coveredUnitFaces).toBe(direct.keys.size);
      expect(mesh.aoLevels.every((level) => Number.isInteger(level) && level >= 0 && level <= 3)).toBe(true);
    }
  });
});

describe('WP04 golden-world derivation', () => {
  const fixture = createLargeChunkFixture();
  let halos: ChunkHaloSnapshot[];
  let meshes: ChunkAoFaceMesh[];

  beforeAll(() => {
    halos = fixture.world.chunkCoords().map((coord) => createChunkHaloSnapshot(fixture.world, coord));
    meshes = halos.map((halo) => meshChunkAoGreedyFaces(halo));
  });

  it('matches the independent material-aware occupancy surface and prior immutable world contracts', () => {
    const direct = occupancySurfaceCoverage(halos);
    const derived = meshCoverage(meshes);
    expect(fixture.worldHash).toBe(WP02_FIXTURE_GOLDEN.worldHash);
    expect(WP03_GREEDY_GOLDEN.basisWorldHash).toBe(WP02_FIXTURE_GOLDEN.worldHash);
    expect(direct.keys.size).toBe(WP02_FIXTURE_GOLDEN.exposedQuads);
    expect(derived.keys).toEqual(direct.keys);
    expect(derived.hash).toBe(WP03_GREEDY_GOLDEN.coverageHash);
    expect(meshes.reduce((sum, mesh) => sum + mesh.coveredUnitFaces, 0)).toBe(WP03_GREEDY_GOLDEN.coveredUnitFaces);
    assertSharedWorldVertexAo(meshes);
  });

  it('keeps histogram, coverage, hash, counts, and bytes independent of chunk order', () => {
    expect(aggregate([...meshes].reverse())).toEqual(aggregate(meshes));
    const shuffled = [...meshes].sort((left, right) => (left.key.length % 3) - (right.key.length % 3) || right.key.localeCompare(left.key));
    expect(aggregate(shuffled)).toEqual(aggregate(meshes));
  });

  it('locks measured WP04 values only after independent correctness checks', () => {
    const values = aggregate(meshes);
    expect(WP04_AO_GOLDEN.basisWorldHash).toBe(WP02_FIXTURE_GOLDEN.worldHash);
    expect(WP04_AO_GOLDEN.paletteHash).toBe(PALETTE_V1.hash);
    expect(values).toMatchObject({
      coveredUnitFaces: WP04_AO_GOLDEN.coveredUnitFaces,
      quads: WP04_AO_GOLDEN.quads,
      triangles: WP04_AO_GOLDEN.triangles,
      aoHistogram: WP04_AO_GOLDEN.aoHistogram,
      normalDiagonals: WP04_AO_GOLDEN.normalDiagonalCount,
      flippedDiagonals: WP04_AO_GOLDEN.flippedDiagonalCount,
      meshPositionBytes: WP04_AO_GOLDEN.meshPositionBytes,
      meshNormalBytes: WP04_AO_GOLDEN.meshNormalBytes,
      meshIndexBytes: WP04_AO_GOLDEN.meshIndexBytes,
      meshMaterialIdBytes: WP04_AO_GOLDEN.meshMaterialIdBytes,
      aoBytes: WP04_AO_GOLDEN.aoAttributeBytes,
      coverageHash: WP04_AO_GOLDEN.coverageHash,
    });
    expect(values.meshTotalBytes + values.aoBytes).toBe(WP04_AO_GOLDEN.neutralMeshTotalBytes);
    expect(values.quads - WP03_GREEDY_GOLDEN.quads).toBe(WP04_AO_GOLDEN.aoSplitDeltaVsWp03);
  });
});

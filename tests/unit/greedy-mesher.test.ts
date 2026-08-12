import { beforeAll, describe, expect, it } from 'vitest';
import { summarizeMeshMemory } from '../../src/diagnostics/memory';
import { VOLUME_SIZE, VOLUME_VOXEL_COUNT, VoxelMaterial } from '../../src/voxel/constants';
import { createChunkHaloSnapshot, createVolumeHaloSnapshot } from '../../src/voxel/chunkHalo';
import { voxelIndex } from '../../src/voxel/coordinates';
import { DenseVoxelVolume } from '../../src/voxel/denseVolume';
import { meshChunkGreedyFaces } from '../../src/voxel/greedyFaceMesher';
import { createLargeChunkFixture, ZONE_IDS, type FixtureZoneId } from '../../src/voxel/largeFixture';
import { SparseChunkWorld } from '../../src/voxel/sparseChunkWorld';
import type { ChunkCoord, ChunkVisibleFaceMesh } from '../../src/voxel/types';
import { meshChunkVisibleFaces } from '../../src/voxel/visibleFaceMesher';
import { WP02_FIXTURE_GOLDEN } from '../contracts/wp02FixtureGolden';
import { WP03_GREEDY_GOLDEN } from '../contracts/wp03GreedyGolden';
import { meshCoverage } from '../helpers/meshCoverageOracle';

const ORIGIN = { x: 0, y: 0, z: 0 } as const;

function fullChunk(material = VoxelMaterial.Platform): Uint8Array {
  return new Uint8Array(VOLUME_VOXEL_COUNT).fill(material);
}

function chunkWithBox(size: number): Uint8Array {
  const voxels = new Uint8Array(VOLUME_VOXEL_COUNT);
  for (let z = 0; z < size; z += 1) for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    voxels[voxelIndex(x, y, z)] = VoxelMaterial.Platform;
  }
  return voxels;
}

function meshData(data: Uint8Array): { readonly visible: ChunkVisibleFaceMesh; readonly greedy: ChunkVisibleFaceMesh } {
  const halo = createVolumeHaloSnapshot(new DenseVoxelVolume(data));
  return { visible: meshChunkVisibleFaces(halo), greedy: meshChunkGreedyFaces(halo) };
}

function expectEqualCoverage(visible: readonly ChunkVisibleFaceMesh[], greedy: readonly ChunkVisibleFaceMesh[]): void {
  const visibleCoverage = meshCoverage(visible);
  const greedyCoverage = meshCoverage(greedy);
  expect(greedyCoverage.keys).toEqual(visibleCoverage.keys);
  expect(greedyCoverage.hash).toBe(visibleCoverage.hash);
  expect(visible.reduce((sum, mesh) => sum + mesh.coveredUnitFaces, 0)).toBe(visibleCoverage.keys.size);
  expect(greedy.reduce((sum, mesh) => sum + mesh.coveredUnitFaces, 0)).toBe(visibleCoverage.keys.size);
}

describe('deterministic greedy face mesher', () => {
  it.each([
    ['empty chunk', new Uint8Array(VOLUME_VOXEL_COUNT), 0, 0],
    ['one voxel', chunkWithBox(1), 6, 6],
    ['2×2×2 block', chunkWithBox(2), 6, 24],
    ['full chunk', fullChunk(), 6, 6_144],
  ] as const)('meshes %s with exact counts', (_name, voxels, quads, coveredUnitFaces) => {
    const { visible, greedy } = meshData(voxels);
    expect(greedy.quadCount).toBe(quads);
    expect(greedy.triangleCount).toBe(quads * 2);
    expect(greedy.coveredUnitFaces).toBe(coveredUnitFaces);
    expect(greedy.mesherMode).toBe('greedy');
    expectEqualCoverage([visible], [greedy]);
  });

  it.each([
    ['-X', { x: -1, y: 0, z: 0 }], ['+X', { x: 1, y: 0, z: 0 }],
    ['-Y', { x: 0, y: -1, z: 0 }], ['+Y', { x: 0, y: 1, z: 0 }],
    ['-Z', { x: 0, y: 0, z: -1 }], ['+Z', { x: 0, y: 0, z: 1 }],
  ] as const)('suppresses the internal %s seam between full chunks', (_axis, adjacent) => {
    const world = new SparseChunkWorld([{ coord: ORIGIN, voxels: fullChunk() }, { coord: adjacent, voxels: fullChunk() }]);
    const visible = world.chunkCoords().map((coord) => meshChunkVisibleFaces(createChunkHaloSnapshot(world, coord)));
    const greedy = world.chunkCoords().map((coord) => meshChunkGreedyFaces(createChunkHaloSnapshot(world, coord)));
    expect(greedy.reduce((sum, mesh) => sum + mesh.quadCount, 0)).toBe(10);
    expect(greedy.reduce((sum, mesh) => sum + mesh.triangleCount, 0)).toBe(20);
    expect(greedy.reduce((sum, mesh) => sum + mesh.coveredUnitFaces, 0)).toBe(10_240);
    expectEqualCoverage(visible, greedy);
  });

  it('merges equal materials but preserves material boundaries and suppresses internal faces', () => {
    const equal = new Uint8Array(VOLUME_VOXEL_COUNT);
    equal[voxelIndex(0, 0, 0)] = VoxelMaterial.Platform;
    equal[voxelIndex(1, 0, 0)] = VoxelMaterial.Platform;
    expect(meshData(equal).greedy.quadCount).toBe(6);

    const split = equal.slice();
    split[voxelIndex(1, 0, 0)] = VoxelMaterial.Stairs;
    const { visible, greedy } = meshData(split);
    expect(greedy.quadCount).toBe(10);
    expect(greedy.coveredUnitFaces).toBe(10);
    for (let quad = 0; quad < greedy.quadCount; quad += 1) {
      expect(new Set(greedy.materialIds.slice(quad * 4, quad * 4 + 4)).size).toBe(1);
    }
    expectEqualCoverage([visible], [greedy]);
  });

  it('is byte-identical for the same validated halo and rejects every malformed halo product', () => {
    const world = new SparseChunkWorld([{ coord: { x: -2, y: 1, z: 3 }, voxels: chunkWithBox(3) }]);
    const halo = createChunkHaloSnapshot(world, { x: -2, y: 1, z: 3 });
    const first = meshChunkGreedyFaces(halo);
    const second = meshChunkGreedyFaces({ ...halo, voxels: halo.voxels.slice() });
    expect(first).toEqual(second);
    expect(() => meshChunkGreedyFaces({ ...halo, key: '0,0,0' })).toThrow(/does not match/);
    expect(() => meshChunkGreedyFaces({ ...halo, coord: { x: 0.5, y: 1, z: 3 } })).toThrow(/safe integer/);
    expect(() => meshChunkGreedyFaces({ ...halo, voxels: halo.voxels.slice(1) })).toThrow(/halo snapshot/);
    const invalidMaterial = halo.voxels.slice();
    invalidMaterial[0] = VoxelMaterial.Roof + 1;
    expect(() => meshChunkGreedyFaces({ ...halo, voxels: invalidMaterial })).toThrow(/invalid voxel material/);
  });
});

describe('WP03 golden-world coverage', () => {
  const fixture = createLargeChunkFixture();
  let visible: ChunkVisibleFaceMesh[];
  let greedy: ChunkVisibleFaceMesh[];

  beforeAll(() => {
    const coords = fixture.world.chunkCoords();
    visible = coords.map((coord) => meshChunkVisibleFaces(createChunkHaloSnapshot(fixture.world, coord)));
    greedy = coords.map((coord) => meshChunkGreedyFaces(createChunkHaloSnapshot(fixture.world, coord)));
  });

  it('is material-aware coverage-identical across all 51 chunks and reduces geometry', () => {
    expect(visible).toHaveLength(WP02_FIXTURE_GOLDEN.materializedChunks);
    expect(greedy).toHaveLength(WP02_FIXTURE_GOLDEN.materializedChunks);
    const visibleCoverage = meshCoverage(visible);
    const greedyCoverage = meshCoverage(greedy);
    const greedyQuads = greedy.reduce((sum, mesh) => sum + mesh.quadCount, 0);
    expect(WP03_GREEDY_GOLDEN.basisWorldHash).toBe(WP02_FIXTURE_GOLDEN.worldHash);
    expect(fixture.worldHash).toBe(WP02_FIXTURE_GOLDEN.worldHash);
    expect(fixture.world.materializedChunkCount).toBe(WP02_FIXTURE_GOLDEN.materializedChunks);
    expect(fixture.world.occupiedCount).toBe(WP02_FIXTURE_GOLDEN.occupiedVoxels);
    expect(visibleCoverage.keys.size).toBe(WP02_FIXTURE_GOLDEN.exposedQuads);
    expect(greedyCoverage.keys).toEqual(visibleCoverage.keys);
    expect(greedyCoverage.hash).toBe(WP03_GREEDY_GOLDEN.coverageHash);
    expect(visibleCoverage.hash).toBe(WP03_GREEDY_GOLDEN.coverageHash);
    for (const visibleMesh of visible) {
      const greedyMesh = greedy.find(({ key }) => key === visibleMesh.key);
      expect(greedyMesh).toBeDefined();
      expectEqualCoverage([visibleMesh], [greedyMesh!]);
    }
    expect(greedy.reduce((sum, mesh) => sum + mesh.coveredUnitFaces, 0)).toBe(WP03_GREEDY_GOLDEN.coveredUnitFaces);
    expect(greedyQuads).toBe(WP03_GREEDY_GOLDEN.quads);
    expect(greedy.reduce((sum, mesh) => sum + mesh.triangleCount, 0)).toBe(WP03_GREEDY_GOLDEN.triangles);
    expect(summarizeMeshMemory(greedy)).toEqual({
      meshPositionBytes: WP03_GREEDY_GOLDEN.meshPositionBytes,
      meshNormalBytes: WP03_GREEDY_GOLDEN.meshNormalBytes,
      meshIndexBytes: WP03_GREEDY_GOLDEN.meshIndexBytes,
      meshMaterialIdBytes: WP03_GREEDY_GOLDEN.meshMaterialIdBytes,
      meshTotalBytes: WP03_GREEDY_GOLDEN.meshTotalBytes,
    });
  });

  it.each(ZONE_IDS)('keeps exact coverage for the %s zone', (zoneId: FixtureZoneId) => {
    const zone = fixture.zones.find(({ id }) => id === zoneId)!;
    const minChunk = zone.cellBounds.min.map((value) => Math.floor(value / VOLUME_SIZE));
    const maxChunk = zone.cellBounds.maxExclusive.map((value) => Math.floor((value - 1) / VOLUME_SIZE));
    const inside = ({ x, y, z }: ChunkCoord): boolean => (
      x >= minChunk[0]! && x <= maxChunk[0]! && y >= minChunk[1]! && y <= maxChunk[1]! && z >= minChunk[2]! && z <= maxChunk[2]!
    );
    expectEqualCoverage(visible.filter(({ coord }) => inside(coord)), greedy.filter(({ coord }) => inside(coord)));
  });

  it('keeps aggregate counts and coverage hash independent of chunk order', () => {
    const stats = (meshes: readonly ChunkVisibleFaceMesh[]) => ({
      quads: meshes.reduce((sum, mesh) => sum + mesh.quadCount, 0),
      triangles: meshes.reduce((sum, mesh) => sum + mesh.triangleCount, 0),
      covered: meshes.reduce((sum, mesh) => sum + mesh.coveredUnitFaces, 0),
      coverageHash: meshCoverage(meshes).hash,
    });
    expect(stats([...greedy].reverse())).toEqual(stats(greedy));
  });
});

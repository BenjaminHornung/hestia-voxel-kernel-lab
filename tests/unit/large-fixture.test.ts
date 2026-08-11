import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { MAX_MATERIALIZED_CHUNKS, VOXEL_SIZE_METERS, WORLD_CELL_BOUNDS, VoxelMaterial } from '../../src/voxel/constants';
import {
  createLargeChunkFixture,
  DEFAULT_FIXTURE_SEED,
  ZONE_IDS,
  type FixtureZoneId,
} from '../../src/voxel/largeFixture';

describe('WP02 large sparse fixture', () => {
  it('contains exactly nine unique in-bounds technical zones and fixed world metadata', () => {
    const fixture = createLargeChunkFixture();
    expect(fixture.zones.map(({ id }) => id)).toEqual(ZONE_IDS);
    expect(new Set(fixture.zones.map(({ id }) => id)).size).toBe(9);
    expect(VOXEL_SIZE_METERS).toBe(0.25);
    for (const zone of fixture.zones) {
      const { min, maxExclusive } = zone.cellBounds;
      expect(min[0]).toBeGreaterThanOrEqual(WORLD_CELL_BOUNDS.min.x);
      expect(min[1]).toBeGreaterThanOrEqual(WORLD_CELL_BOUNDS.min.y);
      expect(min[2]).toBeGreaterThanOrEqual(WORLD_CELL_BOUNDS.min.z);
      expect(maxExclusive[0]).toBeLessThanOrEqual(WORLD_CELL_BOUNDS.maxExclusive.x);
      expect(maxExclusive[1]).toBeLessThanOrEqual(WORLD_CELL_BOUNDS.maxExclusive.y);
      expect(maxExclusive[2]).toBeLessThanOrEqual(WORLD_CELL_BOUNDS.maxExclusive.z);
      expect(zone.meterBounds.min).toEqual(min.map((value) => value * VOXEL_SIZE_METERS));
      expect(zone.meterBounds.maxExclusive).toEqual(maxExclusive.map((value) => value * VOXEL_SIZE_METERS));
    }
  });

  it('materializes a useful sparse subset rather than the candidate space', () => {
    const fixture = createLargeChunkFixture();
    expect(fixture.world.materializedChunkCount).toBeGreaterThanOrEqual(40);
    expect(fixture.world.materializedChunkCount).toBeLessThanOrEqual(MAX_MATERIALIZED_CHUNKS);
    expect(fixture.world.materializedChunkCount).toBeLessThan(1_024);
    expect(fixture.world.occupiedCount).toBeGreaterThan(0);
  });

  it('locks the required geometry semantics of all nine zones', () => {
    const fixture = createLargeChunkFixture();
    const world = fixture.world;
    expect(world.getCell(-178, 4, -178)).toBe(VoxelMaterial.Platform);
    expect(world.getCell(-160, 32, -160)).toBe(VoxelMaterial.Platform);
    expect(world.getCell(-18, 10, -160)).toBe(VoxelMaterial.Shell);
    expect(world.getCell(0, 10, -160)).toBe(VoxelMaterial.Air);
    expect(world.getCell(0, 15, -178)).toBe(VoxelMaterial.Air);
    expect(world.getCell(144, 0, -160)).toBe(VoxelMaterial.Stairs);
    expect(world.getCell(144, 1, -160)).toBe(VoxelMaterial.Air);
    expect(world.getCell(175, 15, -160)).toBe(VoxelMaterial.Stairs);
    expect(world.getCell(-160, 22, 0)).toBe(VoxelMaterial.Roof);
    expect(world.getCell(-178, 4, -18)).toBe(VoxelMaterial.Air);
    expect(world.getCell(-10, 10, 0)).toBe(VoxelMaterial.Shell);
    expect(world.getCell(0, 10, 0)).toBe(VoxelMaterial.Air);
    expect(world.getCell(154, 4, -6)).toBe(VoxelMaterial.Roof);
    expect(world.getCell(155, 4, -6)).toBe(VoxelMaterial.Air);
    expect(world.getCell(142, 0, 142)).toBe(VoxelMaterial.Stairs);
    expect(world.getCell(145, 0, 145)).toBe(VoxelMaterial.Air);

    const occupancy = (id: FixtureZoneId): { occupied: number; cells: number } => {
      const zone = fixture.zones.find((candidate) => candidate.id === id)!;
      let occupied = 0;
      let cells = 0;
      for (let z = zone.cellBounds.min[2]; z < zone.cellBounds.maxExclusive[2]; z += 1) {
        for (let y = zone.cellBounds.min[1]; y < zone.cellBounds.maxExclusive[1]; y += 1) {
          for (let x = zone.cellBounds.min[0]; x < zone.cellBounds.maxExclusive[0]; x += 1) {
            occupied += Number(world.getCell(x, y, z) !== VoxelMaterial.Air);
            cells += 1;
          }
        }
      }
      return { occupied, cells };
    };
    for (const id of ZONE_IDS) {
      expect(occupancy(id).occupied).toBeGreaterThan(0);
    }
    const sparse = occupancy('sparse-10-percent');
    expect(sparse.occupied / sparse.cells).toBeGreaterThan(0.08);
    expect(sparse.occupied / sparse.cells).toBeLessThan(0.12);
    const random = occupancy('random-50-percent');
    expect(random.occupied / random.cells).toBeGreaterThan(0.45);
    expect(random.occupied / random.cells).toBeLessThan(0.55);
  });

  it('is byte/hash-identical for the same seed', () => {
    const first = createLargeChunkFixture(DEFAULT_FIXTURE_SEED);
    const second = createLargeChunkFixture(DEFAULT_FIXTURE_SEED);
    expect(first.worldHash).toBe(second.worldHash);
    expect(first.zoneHashes).toEqual(second.zoneHashes);
    expect(first.world.materializedChunkCount).toBe(second.world.materializedChunkCount);
    expect(first.world.occupiedCount).toBe(second.world.occupiedCount);
  });

  it('changes only seeded sparse/random zones when the seed changes', () => {
    const first = createLargeChunkFixture(DEFAULT_FIXTURE_SEED);
    const second = createLargeChunkFixture(DEFAULT_FIXTURE_SEED + 1);
    const seeded = new Set<FixtureZoneId>(['sparse-10-percent', 'random-50-percent']);
    for (const id of ZONE_IDS) {
      if (seeded.has(id)) {
        expect(first.zoneHashes[id]).not.toBe(second.zoneHashes[id]);
      } else {
        expect(first.zoneHashes[id]).toBe(second.zoneHashes[id]);
      }
    }
    expect(first.worldHash).not.toBe(second.worldHash);
  });

  it('rejects seeds outside the unsigned 32-bit fixture contract', () => {
    expect(() => createLargeChunkFixture(-1)).toThrow(RangeError);
    expect(() => createLargeChunkFixture(0x1_0000_0000)).toThrow(RangeError);
    expect(() => createLargeChunkFixture(1.5)).toThrow(RangeError);
  });

  it('uses no ambient random source in the fixture path', async () => {
    const source = await readFile(new URL('../../src/voxel/largeFixture.ts', import.meta.url), 'utf8');
    expect(source.includes('Math' + '.random')).toBe(false);
  });

  it('makes at least three zone AABBs cross chunk boundaries', () => {
    const fixture = createLargeChunkFixture();
    const crossing = fixture.zones.filter(({ cellBounds }) => [0, 1, 2].some((axis) => (
      Math.floor(cellBounds.min[axis]! / 32) !== Math.floor((cellBounds.maxExclusive[axis]! - 1) / 32)
    )));
    expect(crossing.length).toBeGreaterThanOrEqual(3);
  });
});

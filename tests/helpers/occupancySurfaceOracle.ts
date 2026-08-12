import { createHash } from 'node:crypto';
import { VOLUME_SIZE, VoxelMaterial } from '../../src/voxel/constants';
import { haloIndex, type ChunkHaloSnapshot } from '../../src/voxel/chunkHalo';

const DIRECTIONS = [
  [-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1],
] as const;

export function occupancySurfaceCoverage(halos: readonly ChunkHaloSnapshot[]): { readonly keys: ReadonlySet<string>; readonly hash: string } {
  const keys = new Set<string>();
  for (const halo of halos) {
    const origin = [halo.coord.x * VOLUME_SIZE, halo.coord.y * VOLUME_SIZE, halo.coord.z * VOLUME_SIZE];
    for (let z = 0; z < VOLUME_SIZE; z += 1) for (let y = 0; y < VOLUME_SIZE; y += 1) for (let x = 0; x < VOLUME_SIZE; x += 1) {
      const cell = [x, y, z];
      const material = halo.voxels[haloIndex(x, y, z)]!;
      if (material === VoxelMaterial.Air) continue;
      for (const direction of DIRECTIONS) {
        if (halo.voxels[haloIndex(x + direction[0], y + direction[1], z + direction[2])] !== VoxelMaterial.Air) continue;
        const axis = direction.findIndex((value) => value !== 0);
        const sign = direction[axis]!;
        const surfaceAxes = [0, 1, 2].filter((component) => component !== axis);
        const plane = cell[axis]! + origin[axis]! + Number(sign > 0);
        const key = `${axis}:${sign}:${plane}:${cell[surfaceAxes[0]!]! + origin[surfaceAxes[0]!]!}:${cell[surfaceAxes[1]!]! + origin[surfaceAxes[1]!]!}:${material}`;
        if (keys.has(key)) throw new RangeError(`Duplicate occupancy unit face: ${key}`);
        keys.add(key);
      }
    }
  }
  const hash = createHash('sha256').update([...keys].sort().join('\n')).digest('hex');
  return { keys, hash: `sha256:${hash}` };
}

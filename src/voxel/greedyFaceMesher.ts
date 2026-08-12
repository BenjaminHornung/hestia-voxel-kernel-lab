import { VOLUME_SIZE, VoxelMaterial } from './constants';
import { assertValidChunkHaloSnapshot, haloIndex, type ChunkHaloSnapshot } from './chunkHalo';
import type { ChunkVisibleFaceMesh, Vec3 } from './types';

interface GreedyFace {
  readonly neighbor: Vec3;
  readonly normal: Vec3;
  readonly voxel: (slice: number, u: number, v: number) => Vec3;
  readonly corners: (slice: number, u: number, v: number, width: number, height: number) => readonly [Vec3, Vec3, Vec3, Vec3];
}

const GREEDY_FACES: readonly GreedyFace[] = [
  {
    neighbor: [-1, 0, 0], normal: [-1, 0, 0],
    voxel: (slice, u, v) => [slice, v, u],
    corners: (slice, u, v, width, height) => [
      [slice, v, u], [slice, v, u + width], [slice, v + height, u + width], [slice, v + height, u],
    ],
  },
  {
    neighbor: [1, 0, 0], normal: [1, 0, 0],
    voxel: (slice, u, v) => [slice, v, u],
    corners: (slice, u, v, width, height) => [
      [slice + 1, v, u + width], [slice + 1, v, u], [slice + 1, v + height, u], [slice + 1, v + height, u + width],
    ],
  },
  {
    neighbor: [0, -1, 0], normal: [0, -1, 0],
    voxel: (slice, u, v) => [u, slice, v],
    corners: (slice, u, v, width, height) => [
      [u, slice, v + height], [u, slice, v], [u + width, slice, v], [u + width, slice, v + height],
    ],
  },
  {
    neighbor: [0, 1, 0], normal: [0, 1, 0],
    voxel: (slice, u, v) => [u, slice, v],
    corners: (slice, u, v, width, height) => [
      [u, slice + 1, v], [u, slice + 1, v + height], [u + width, slice + 1, v + height], [u + width, slice + 1, v],
    ],
  },
  {
    neighbor: [0, 0, -1], normal: [0, 0, -1],
    voxel: (slice, u, v) => [u, v, slice],
    corners: (slice, u, v, width, height) => [
      [u + width, v, slice], [u, v, slice], [u, v + height, slice], [u + width, v + height, slice],
    ],
  },
  {
    neighbor: [0, 0, 1], normal: [0, 0, 1],
    voxel: (slice, u, v) => [u, v, slice],
    corners: (slice, u, v, width, height) => [
      [u, v, slice + 1], [u + width, v, slice + 1], [u + width, v + height, slice + 1], [u, v + height, slice + 1],
    ],
  },
];

export function meshChunkGreedyFaces(halo: ChunkHaloSnapshot): ChunkVisibleFaceMesh {
  assertValidChunkHaloSnapshot(halo);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const materialIds: number[] = [];
  const min = [VOLUME_SIZE, VOLUME_SIZE, VOLUME_SIZE];
  const max = [0, 0, 0];
  let occupiedCount = 0;

  for (let z = 0; z < VOLUME_SIZE; z += 1) {
    for (let y = 0; y < VOLUME_SIZE; y += 1) {
      for (let x = 0; x < VOLUME_SIZE; x += 1) {
        if (halo.voxels[haloIndex(x, y, z)] === VoxelMaterial.Air) continue;
        occupiedCount += 1;
        min[0] = Math.min(min[0], x);
        min[1] = Math.min(min[1], y);
        min[2] = Math.min(min[2], z);
        max[0] = Math.max(max[0], x + 1);
        max[1] = Math.max(max[1], y + 1);
        max[2] = Math.max(max[2], z + 1);
      }
    }
  }

  let quadCount = 0;
  let coveredUnitFaces = 0;
  for (const face of GREEDY_FACES) {
    for (let slice = 0; slice < VOLUME_SIZE; slice += 1) {
      const mask = new Uint8Array(VOLUME_SIZE ** 2);
      for (let v = 0; v < VOLUME_SIZE; v += 1) {
        for (let u = 0; u < VOLUME_SIZE; u += 1) {
          const [x, y, z] = face.voxel(slice, u, v);
          const material = halo.voxels[haloIndex(x, y, z)] as VoxelMaterial;
          if (
            material !== VoxelMaterial.Air
            && halo.voxels[haloIndex(x + face.neighbor[0], y + face.neighbor[1], z + face.neighbor[2])] === VoxelMaterial.Air
          ) {
            mask[u + VOLUME_SIZE * v] = material;
          }
        }
      }

      for (let v = 0; v < VOLUME_SIZE; v += 1) {
        for (let u = 0; u < VOLUME_SIZE; u += 1) {
          const material = mask[u + VOLUME_SIZE * v]!;
          if (material === VoxelMaterial.Air) continue;
          let width = 1;
          while (u + width < VOLUME_SIZE && mask[u + width + VOLUME_SIZE * v] === material) width += 1;
          let height = 1;
          heightLoop: while (v + height < VOLUME_SIZE) {
            for (let offset = 0; offset < width; offset += 1) {
              if (mask[u + offset + VOLUME_SIZE * (v + height)] !== material) break heightLoop;
            }
            height += 1;
          }

          const vertexOffset = positions.length / 3;
          for (const corner of face.corners(slice, u, v, width, height)) {
            positions.push(...corner);
            normals.push(...face.normal);
            materialIds.push(material);
          }
          indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2, vertexOffset, vertexOffset + 2, vertexOffset + 3);
          for (let clearV = 0; clearV < height; clearV += 1) {
            mask.fill(VoxelMaterial.Air, u + VOLUME_SIZE * (v + clearV), u + width + VOLUME_SIZE * (v + clearV));
          }
          quadCount += 1;
          coveredUnitFaces += width * height;
        }
      }
    }
  }

  return {
    key: halo.key,
    coord: { ...halo.coord },
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
    materialIds: new Uint8Array(materialIds),
    bounds: quadCount === 0 ? null : { min: [min[0], min[1], min[2]], max: [max[0], max[1], max[2]] },
    quadCount,
    triangleCount: quadCount * 2,
    coveredUnitFaces,
    mesherMode: 'greedy',
    occupiedCount,
  };
}

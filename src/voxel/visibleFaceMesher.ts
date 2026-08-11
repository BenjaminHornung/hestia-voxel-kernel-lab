import { VOLUME_SIZE, VoxelMaterial } from './constants';
import { haloIndex, createVolumeHaloSnapshot, type ChunkHaloSnapshot } from './chunkHalo';
import type { DenseVoxelVolume } from './denseVolume';
import type { ChunkVisibleFaceMesh, Vec3, VisibleFaceMesh } from './types';

interface Face {
  readonly neighbor: Vec3;
  readonly normal: Vec3;
  readonly corners: readonly [Vec3, Vec3, Vec3, Vec3];
}

const FACES: readonly Face[] = [
  { neighbor: [-1, 0, 0], normal: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { neighbor: [1, 0, 0], normal: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { neighbor: [0, -1, 0], normal: [0, -1, 0], corners: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]] },
  { neighbor: [0, 1, 0], normal: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { neighbor: [0, 0, -1], normal: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
  { neighbor: [0, 0, 1], normal: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
];

export function meshVisibleFaces(volume: DenseVoxelVolume): VisibleFaceMesh {
  const { key: _key, coord: _coord, occupiedCount: _occupiedCount, ...mesh } = meshChunkVisibleFaces(
    createVolumeHaloSnapshot(volume),
  );
  return mesh;
}

export function meshChunkVisibleFaces(halo: ChunkHaloSnapshot): ChunkVisibleFaceMesh {
  if (halo.voxels.length !== (VOLUME_SIZE + 2) ** 3) {
    throw new RangeError(`Expected a ${(VOLUME_SIZE + 2)}³ halo snapshot.`);
  }
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const materialIds: number[] = [];
  const min = [VOLUME_SIZE, VOLUME_SIZE, VOLUME_SIZE];
  const max = [0, 0, 0];
  let quadCount = 0;
  let occupiedCount = 0;

  for (let z = 0; z < VOLUME_SIZE; z += 1) {
    for (let y = 0; y < VOLUME_SIZE; y += 1) {
      for (let x = 0; x < VOLUME_SIZE; x += 1) {
        const material = halo.voxels[haloIndex(x, y, z)] as VoxelMaterial;
        if (material === VoxelMaterial.Air) {
          continue;
        }
        occupiedCount += 1;

        min[0] = Math.min(min[0], x);
        min[1] = Math.min(min[1], y);
        min[2] = Math.min(min[2], z);
        max[0] = Math.max(max[0], x + 1);
        max[1] = Math.max(max[1], y + 1);
        max[2] = Math.max(max[2], z + 1);

        for (const face of FACES) {
          const neighborX = x + face.neighbor[0];
          const neighborY = y + face.neighbor[1];
          const neighborZ = z + face.neighbor[2];
          if (halo.voxels[haloIndex(neighborX, neighborY, neighborZ)] !== VoxelMaterial.Air) {
            continue;
          }

          const vertexOffset = positions.length / 3;
          for (const corner of face.corners) {
            positions.push(x + corner[0], y + corner[1], z + corner[2]);
            normals.push(...face.normal);
            materialIds.push(material);
          }
          indices.push(
            vertexOffset,
            vertexOffset + 1,
            vertexOffset + 2,
            vertexOffset,
            vertexOffset + 2,
            vertexOffset + 3,
          );
          quadCount += 1;
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
    bounds: quadCount === 0 ? null : {
      min: [min[0], min[1], min[2]],
      max: [max[0], max[1], max[2]],
    },
    quadCount,
    triangleCount: quadCount * 2,
    occupiedCount,
  };
}

import { VOLUME_SIZE, VOLUME_VOXEL_COUNT, VoxelMaterial } from './constants';
import { voxelIndex } from './coordinates';

export class DenseVoxelVolume {
  readonly size = VOLUME_SIZE;
  readonly occupiedCount: number;
  readonly #voxels: Uint8Array;

  constructor(voxels: Uint8Array = new Uint8Array(VOLUME_VOXEL_COUNT)) {
    if (voxels.length !== VOLUME_VOXEL_COUNT) {
      throw new RangeError(`Expected ${VOLUME_VOXEL_COUNT} voxels, received ${voxels.length}.`);
    }
    if (voxels.some((material) => material > VoxelMaterial.Roof)) {
      throw new RangeError(`Voxel materials must be in the range ${VoxelMaterial.Air}..${VoxelMaterial.Roof}.`);
    }

    this.#voxels = voxels.slice();
    this.occupiedCount = this.#voxels.reduce(
      (count, material) => count + Number(material !== VoxelMaterial.Air),
      0,
    );
  }

  get(x: number, y: number, z: number): VoxelMaterial {
    return this.#voxels[voxelIndex(x, y, z)] as VoxelMaterial;
  }

  snapshot(): Uint8Array {
    return this.#voxels.slice();
  }
}

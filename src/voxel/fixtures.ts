import { VOLUME_VOXEL_COUNT, VoxelMaterial } from './constants';
import { voxelIndex } from './coordinates';
import { DenseVoxelVolume } from './denseVolume';

export const FIXTURE_SHA256 = '079de3fc80fc9b0d00dcaafb9a071ca684ea3d71e352b1c8c13a777f59384e55';

export function createVisibleFaceFixture(): DenseVoxelVolume {
  const voxels = new Uint8Array(VOLUME_VOXEL_COUNT);

  for (let z = 2; z <= 29; z += 1) {
    for (let x = 2; x <= 29; x += 1) {
      voxels[voxelIndex(x, 0, z)] = VoxelMaterial.Platform;
    }
  }

  for (let step = 0; step < 6; step += 1) {
    for (let z = 6; z <= 10; z += 1) {
      for (let y = 1; y <= step + 1; y += 1) {
        voxels[voxelIndex(5 + step, y, z)] = VoxelMaterial.Stairs;
      }
    }
  }

  for (let z = 18; z <= 25; z += 1) {
    for (let y = 1; y <= 8; y += 1) {
      for (let x = 20; x <= 27; x += 1) {
        const isShell = x === 20 || x === 27 || y === 1 || y === 8 || z === 18 || z === 25;
        const isOpening = z === 18 && x >= 22 && x <= 25 && y >= 3 && y <= 6;
        if (isShell && !isOpening) {
          voxels[voxelIndex(x, y, z)] = y === 8 ? VoxelMaterial.Roof : VoxelMaterial.Shell;
        }
      }
    }
  }

  return new DenseVoxelVolume(voxels);
}

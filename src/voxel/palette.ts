import { VoxelMaterial } from './constants';

export const MATERIAL_COLORS: Readonly<Record<Exclude<VoxelMaterial, VoxelMaterial.Air>, number>> = {
  [VoxelMaterial.Platform]: 0x7d8792,
  [VoxelMaterial.Stairs]: 0x4f7699,
  [VoxelMaterial.Shell]: 0xa66e45,
  [VoxelMaterial.Roof]: 0xd4b879,
};

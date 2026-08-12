import { Color, SRGBColorSpace } from 'three';
import { PALETTE_LOOKUP_V1, type PaletteLookup } from '../voxel/palette';
import type { ChunkAoFaceMesh } from '../voxel/types';

export const AO_DARKNESS = 0.60;
export type Wp04DebugMode = 'surface' | 'ao-levels' | 'diagonal-normal' | 'diagonal-flipped' | 'materials' | 'normals';

const AO_LEVEL_COLORS = [0x172033, 0x315a91, 0xc88a2d, 0xf2e6c9] as const;
const NORMAL_COLORS: Readonly<Record<string, number>> = {
  '-1,0,0': 0x7f1d1d, '1,0,0': 0xef4444,
  '0,-1,0': 0x14532d, '0,1,0': 0x4ade80,
  '0,0,-1': 0x1e3a8a, '0,0,1': 0x60a5fa,
};

function quantizedLinearRgb(hex: number, factor = 1): readonly [number, number, number] {
  const color = new Color().setHex(hex, SRGBColorSpace);
  return [color.r, color.g, color.b].map((component) => (
    Math.round(Math.min(1, Math.max(0, component * factor)) * 255)
  )) as unknown as readonly [number, number, number];
}

export function createPackedAoVertexColors(
  mesh: ChunkAoFaceMesh,
  aoEnabled: boolean,
  debugMode: Wp04DebugMode,
  palette: PaletteLookup = PALETTE_LOOKUP_V1,
): Uint8Array {
  if (mesh.aoLevels.length !== mesh.materialIds.length || mesh.normals.length !== mesh.materialIds.length * 3) {
    throw new RangeError('AO renderer attributes must contain one AO level and normal per mesh vertex.');
  }
  const colors = new Uint8Array(mesh.materialIds.length * 3);
  for (let vertex = 0; vertex < mesh.materialIds.length; vertex += 1) {
    const material = mesh.materialIds[vertex]!;
    const entry = palette[material];
    if (!entry) throw new RangeError(`Voxel material ${material} is undefined in palette-v1.`);
    const ao = mesh.aoLevels[vertex]!;
    let hex = entry.baseColorSrgb24;
    let factor = aoEnabled ? 1 - AO_DARKNESS * (3 - ao) / 3 : 1;
    if (debugMode === 'ao-levels') {
      hex = AO_LEVEL_COLORS[ao]!;
      factor = 1;
    } else if (debugMode === 'normals') {
      const offset = vertex * 3;
      hex = NORMAL_COLORS[`${mesh.normals[offset]},${mesh.normals[offset + 1]},${mesh.normals[offset + 2]}`]!;
      factor = 1;
    } else if (debugMode === 'materials') {
      factor = 1;
    }
    colors.set(quantizedLinearRgb(hex, factor), vertex * 3);
  }
  return colors;
}

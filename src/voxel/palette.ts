import { VoxelMaterial } from './constants';

export interface PaletteEntryV1 {
  readonly id: number;
  readonly name: string;
  readonly baseColorSrgb24: number;
  readonly opaque: boolean;
  readonly contributesToAo: boolean;
}

export interface PaletteV1 {
  readonly id: 'palette-v1';
  readonly version: 1;
  readonly entries: readonly PaletteEntryV1[];
  readonly hash: string;
}

export type PaletteLookup = readonly (PaletteEntryV1 | undefined)[];

export function validatePaletteEntriesV1(entries: readonly PaletteEntryV1[]): readonly PaletteEntryV1[] {
  const ids = new Set<number>();
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.id) || entry.id < 0 || entry.id > 0xff) {
      throw new RangeError(`Palette ID ${entry.id} must be a safe integer in 0..255.`);
    }
    if (ids.has(entry.id)) throw new RangeError(`Duplicate palette ID ${entry.id}.`);
    ids.add(entry.id);
    if (entry.name.length === 0 || entry.name.trim() !== entry.name) {
      throw new RangeError(`Palette entry ${entry.id} requires a stable non-empty name.`);
    }
    if (typeof entry.opaque !== 'boolean' || typeof entry.contributesToAo !== 'boolean') {
      throw new RangeError(`Palette entry ${entry.id} requires boolean opacity and AO flags.`);
    }
    if (entry.id !== VoxelMaterial.Air && !entry.opaque) {
      throw new RangeError(`Palette-v1 requires non-air entry ${entry.id} to be opaque.`);
    }
    if (entry.id !== VoxelMaterial.Air && (!Number.isSafeInteger(entry.baseColorSrgb24)
      || entry.baseColorSrgb24 < 0 || entry.baseColorSrgb24 > 0xff_ffff)) {
      throw new RangeError(`Palette entry ${entry.id} requires an RGB integer in 0x000000..0xFFFFFF.`);
    }
  }
  const air = entries.filter(({ id }) => id === VoxelMaterial.Air);
  if (air.length !== 1 || air[0]!.name !== 'air' || air[0]!.opaque || air[0]!.contributesToAo) {
    throw new RangeError('Palette-v1 requires exactly one non-opaque, non-occluding air entry in slot 0.');
  }
  return entries;
}

export function paletteHashV1(entries: readonly PaletteEntryV1[]): string {
  validatePaletteEntriesV1(entries);
  const sorted = [...entries].sort((left, right) => left.id - right.id);
  const canonical = ['palette-v1|1', ...sorted.map((entry) => (
    `${entry.id}|${entry.name}|${entry.id === VoxelMaterial.Air ? '-' : entry.baseColorSrgb24.toString(16).padStart(6, '0')}|${Number(entry.opaque)}|${Number(entry.contributesToAo)}`
  ))].join('\n');
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(canonical)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

export function createPaletteLookup(entries: readonly PaletteEntryV1[]): PaletteLookup {
  const lookup: Array<PaletteEntryV1 | undefined> = new Array(256);
  for (const entry of validatePaletteEntriesV1(entries)) lookup[entry.id] = entry;
  return lookup;
}

export function assertPaletteDefinesMaterials(voxels: Uint8Array, lookup: PaletteLookup): void {
  for (const material of voxels) {
    if (material !== VoxelMaterial.Air && lookup[material] === undefined) {
      throw new RangeError(`Voxel material ${material} is undefined in palette-v1.`);
    }
  }
}

const PALETTE_ENTRIES_V1 = validatePaletteEntriesV1([
  { id: VoxelMaterial.Air, name: 'air', baseColorSrgb24: 0, opaque: false, contributesToAo: false },
  { id: VoxelMaterial.Platform, name: 'platform', baseColorSrgb24: 0x7d8792, opaque: true, contributesToAo: true },
  { id: VoxelMaterial.Stairs, name: 'stairs', baseColorSrgb24: 0x4f7699, opaque: true, contributesToAo: true },
  { id: VoxelMaterial.Shell, name: 'shell', baseColorSrgb24: 0xa66e45, opaque: true, contributesToAo: true },
  { id: VoxelMaterial.Roof, name: 'roof', baseColorSrgb24: 0xd4b879, opaque: true, contributesToAo: true },
]);

export const PALETTE_V1: PaletteV1 = {
  id: 'palette-v1',
  version: 1,
  entries: PALETTE_ENTRIES_V1,
  hash: paletteHashV1(PALETTE_ENTRIES_V1),
};

export const PALETTE_LOOKUP_V1 = createPaletteLookup(PALETTE_V1.entries);

export const MATERIAL_COLORS: Readonly<Record<Exclude<VoxelMaterial, VoxelMaterial.Air>, number>> = {
  [VoxelMaterial.Platform]: 0x7d8792,
  [VoxelMaterial.Stairs]: 0x4f7699,
  [VoxelMaterial.Shell]: 0xa66e45,
  [VoxelMaterial.Roof]: 0xd4b879,
};

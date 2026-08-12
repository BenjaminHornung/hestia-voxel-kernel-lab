import { describe, expect, it } from 'vitest';
import { BLOCK_FACES, faceAoSampleCoordinates, packAoMergeKey, packAoSignature, quadIndices, sampleFaceAo, unpackAoSignature, usesFlippedDiagonal, vertexAo, type FaceId } from '../../src/voxel/blockAo';
import { VOLUME_VOXEL_COUNT, VoxelMaterial } from '../../src/voxel/constants';
import { createVolumeHaloSnapshot, haloIndex } from '../../src/voxel/chunkHalo';
import { DenseVoxelVolume } from '../../src/voxel/denseVolume';
import { createPaletteLookup, paletteHashV1, PALETTE_LOOKUP_V1, PALETTE_V1, validatePaletteEntriesV1 } from '../../src/voxel/palette';
import type { Ao4, Vec3 } from '../../src/voxel/types';

describe('Palette-v1', () => {
  it('locks the five palette slots, exact colors, flags, and canonical hash', () => {
    expect(PALETTE_V1.id).toBe('palette-v1');
    expect(PALETTE_V1.version).toBe(1);
    expect(PALETTE_V1.entries).toEqual([
      { id: 0, name: 'air', baseColorSrgb24: 0, opaque: false, contributesToAo: false },
      { id: 1, name: 'platform', baseColorSrgb24: 0x7d8792, opaque: true, contributesToAo: true },
      { id: 2, name: 'stairs', baseColorSrgb24: 0x4f7699, opaque: true, contributesToAo: true },
      { id: 3, name: 'shell', baseColorSrgb24: 0xa66e45, opaque: true, contributesToAo: true },
      { id: 4, name: 'roof', baseColorSrgb24: 0xd4b879, opaque: true, contributesToAo: true },
    ]);
    expect(PALETTE_V1.hash).toBe('fnv1a32:232ad3ae');
    expect(paletteHashV1([...PALETTE_V1.entries].reverse())).toBe(PALETTE_V1.hash);
  });

  it('fails closed for duplicate, malformed, or invalid slot-zero entries', () => {
    expect(() => validatePaletteEntriesV1([...PALETTE_V1.entries, PALETTE_V1.entries[1]!])).toThrow(/Duplicate/);
    expect(() => validatePaletteEntriesV1(PALETTE_V1.entries.map((entry) => entry.id === 1 ? { ...entry, id: 1.5 } : entry))).toThrow(/safe integer/);
    expect(() => validatePaletteEntriesV1(PALETTE_V1.entries.map((entry) => entry.id === 1 ? { ...entry, name: '' } : entry))).toThrow(/non-empty/);
    expect(() => validatePaletteEntriesV1(PALETTE_V1.entries.map((entry) => entry.id === 1 ? { ...entry, baseColorSrgb24: 0x1_000000 } : entry))).toThrow(/RGB integer/);
    expect(() => validatePaletteEntriesV1(PALETTE_V1.entries.map((entry) => entry.id === 1 ? { ...entry, opaque: false } : entry))).toThrow(/opaque/);
    expect(() => validatePaletteEntriesV1(PALETTE_V1.entries.map((entry) => entry.id === 1 ? { ...entry, contributesToAo: 1 as unknown as boolean } : entry))).toThrow(/boolean/);
    expect(() => validatePaletteEntriesV1(PALETTE_V1.entries.filter(({ id }) => id !== 0))).toThrow(/slot 0/);
    expect(() => validatePaletteEntriesV1(PALETTE_V1.entries.map((entry) => entry.id === 0 ? { ...entry, contributesToAo: true } : entry))).toThrow(/slot 0/);
  });
});

describe('block AO convention', () => {
  it.each([
    [false, false, false, 3], [false, false, true, 2], [true, false, false, 2], [false, true, false, 2],
    [true, false, true, 1], [false, true, true, 1], [true, true, false, 0], [true, true, true, 0],
  ] as const)('maps side1=%s side2=%s corner=%s to %s', (side1, side2, corner, expected) => {
    expect(vertexAo(side1, side2, corner)).toBe(expected);
  });

  it('packs and unpacks every AO4 signature bijectively', () => {
    for (let signature = 0; signature < 256; signature += 1) {
      expect(packAoSignature(unpackAoSignature(signature))).toBe(signature);
    }
  });

  it('packs face, material, and AO independently into the merge key', () => {
    const base = packAoMergeKey(1, packAoSignature([3, 3, 3, 3]), 0);
    expect(packAoMergeKey(2, packAoSignature([3, 3, 3, 3]), 0)).not.toBe(base);
    expect(packAoMergeKey(1, packAoSignature([2, 3, 3, 3]), 0)).not.toBe(base);
    expect(packAoMergeKey(1, packAoSignature([3, 2, 3, 3]), 0)).not.toBe(base);
    expect(packAoMergeKey(1, packAoSignature([3, 3, 2, 3]), 0)).not.toBe(base);
    expect(packAoMergeKey(1, packAoSignature([3, 3, 3, 2]), 0)).not.toBe(base);
    expect(packAoMergeKey(1, packAoSignature([3, 3, 3, 3]), 1)).not.toBe(base);
  });

  it('uses the deterministic normal or flipped diagonal rule', () => {
    expect(usesFlippedDiagonal([0, 3, 0, 3])).toBe(false);
    expect(usesFlippedDiagonal([3, 3, 3, 3])).toBe(false);
    expect(usesFlippedDiagonal([3, 0, 3, 0])).toBe(true);
    expect(quadIndices(8, [3, 3, 3, 3])).toEqual([8, 9, 10, 8, 10, 11]);
    expect(quadIndices(8, [3, 0, 3, 0])).toEqual([8, 9, 11, 9, 10, 11]);
  });

  it.each([0, 1, 2, 3, 4, 5] as const)('maps face %i vertices to independent exact AO sample offsets', (faceId) => {
    const expected = [
      [
        [[-1, 0, 0], [-1, -1, 0], [-1, 0, -1], [-1, -1, -1]],
        [[-1, 0, 0], [-1, -1, 0], [-1, 0, 1], [-1, -1, 1]],
        [[-1, 0, 0], [-1, 1, 0], [-1, 0, 1], [-1, 1, 1]],
        [[-1, 0, 0], [-1, 1, 0], [-1, 0, -1], [-1, 1, -1]],
      ],
      [
        [[1, 0, 0], [1, -1, 0], [1, 0, 1], [1, -1, 1]],
        [[1, 0, 0], [1, -1, 0], [1, 0, -1], [1, -1, -1]],
        [[1, 0, 0], [1, 1, 0], [1, 0, -1], [1, 1, -1]],
        [[1, 0, 0], [1, 1, 0], [1, 0, 1], [1, 1, 1]],
      ],
      [
        [[0, -1, 0], [-1, -1, 0], [0, -1, 1], [-1, -1, 1]],
        [[0, -1, 0], [-1, -1, 0], [0, -1, -1], [-1, -1, -1]],
        [[0, -1, 0], [1, -1, 0], [0, -1, -1], [1, -1, -1]],
        [[0, -1, 0], [1, -1, 0], [0, -1, 1], [1, -1, 1]],
      ],
      [
        [[0, 1, 0], [-1, 1, 0], [0, 1, -1], [-1, 1, -1]],
        [[0, 1, 0], [-1, 1, 0], [0, 1, 1], [-1, 1, 1]],
        [[0, 1, 0], [1, 1, 0], [0, 1, 1], [1, 1, 1]],
        [[0, 1, 0], [1, 1, 0], [0, 1, -1], [1, 1, -1]],
      ],
      [
        [[0, 0, -1], [1, 0, -1], [0, -1, -1], [1, -1, -1]],
        [[0, 0, -1], [-1, 0, -1], [0, -1, -1], [-1, -1, -1]],
        [[0, 0, -1], [-1, 0, -1], [0, 1, -1], [-1, 1, -1]],
        [[0, 0, -1], [1, 0, -1], [0, 1, -1], [1, 1, -1]],
      ],
      [
        [[0, 0, 1], [-1, 0, 1], [0, -1, 1], [-1, -1, 1]],
        [[0, 0, 1], [1, 0, 1], [0, -1, 1], [1, -1, 1]],
        [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]],
        [[0, 0, 1], [-1, 0, 1], [0, 1, 1], [-1, 1, 1]],
      ],
    ] as const;
    for (const [vertex, samples] of expected[faceId].entries()) {
      const [faceAir, side1, side2, corner] = samples;
      expect(faceAoSampleCoordinates([0, 0, 0], faceId as FaceId, vertex), `vertex=${vertex}`)
        .toEqual({ faceAir, side1, side2, corner });
    }
  });

  it('uses contributesToAo rather than non-air as the occlusion decision', () => {
    const halo = createVolumeHaloSnapshot(new DenseVoxelVolume(new Uint8Array(VOLUME_VOXEL_COUNT)));
    const face = BLOCK_FACES[3]!;
    const cell: Vec3 = [10, 10, 10];
    const sample = faceAoSampleCoordinates(cell, face.id, 0).corner;
    halo.voxels[haloIndex(sample[0], sample[1], sample[2])] = VoxelMaterial.Platform;
    expect(sampleFaceAo(halo, cell, face.id, PALETTE_LOOKUP_V1)[0]).toBe(2);
    const nonOccluding = createPaletteLookup(PALETTE_V1.entries.map((entry) => entry.id === VoxelMaterial.Platform ? { ...entry, contributesToAo: false } : entry));
    expect(sampleFaceAo(halo, cell, face.id, nonOccluding)[0]).toBe(3);
  });

  it('keeps both diagonal patterns outward for all six face directions', () => {
    const cross = (a: Vec3, b: Vec3, c: Vec3): Vec3 => {
      const ab = b.map((value, axis) => value - a[axis]!) as unknown as Vec3;
      const ac = c.map((value, axis) => value - a[axis]!) as unknown as Vec3;
      return [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    };
    for (const face of BLOCK_FACES) {
      const corners = face.corners(5, 6, 7, 2, 3);
      for (const ao of [[3, 3, 3, 3], [3, 0, 3, 0]] as Ao4[]) {
        const indices = quadIndices(0, ao);
        for (const offset of [0, 3]) {
          expect(cross(corners[indices[offset]!]!, corners[indices[offset + 1]!]!, corners[indices[offset + 2]!]!)
            .map((value) => value === 0 ? 0 : value)).toEqual(face.normal.map((value) => value * 6));
        }
      }
    }
  });
});

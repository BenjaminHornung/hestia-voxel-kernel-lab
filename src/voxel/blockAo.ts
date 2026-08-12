import { VoxelMaterial } from './constants';
import { haloIndex, type ChunkHaloSnapshot } from './chunkHalo';
import type { PaletteLookup } from './palette';
import type { Ao4, AoLevel, Vec3 } from './types';

export type FaceId = 0 | 1 | 2 | 3 | 4 | 5;

export interface BlockFaceDefinition {
  readonly id: FaceId;
  readonly neighbor: Vec3;
  readonly normal: Vec3;
  readonly tangent1: Vec3;
  readonly tangent2: Vec3;
  readonly vertexSigns: readonly [readonly [number, number], readonly [number, number], readonly [number, number], readonly [number, number]];
  readonly voxel: (slice: number, u: number, v: number) => Vec3;
  readonly corners: (slice: number, u: number, v: number, width: number, height: number) => readonly [Vec3, Vec3, Vec3, Vec3];
}

const STANDARD_SIGNS = [[-1, -1], [-1, 1], [1, 1], [1, -1]] as const;

export const BLOCK_FACES: readonly BlockFaceDefinition[] = [
  { id: 0, neighbor: [-1, 0, 0], normal: [-1, 0, 0], tangent1: [0, 1, 0], tangent2: [0, 0, 1], vertexSigns: STANDARD_SIGNS,
    voxel: (slice, u, v) => [slice, v, u], corners: (slice, u, v, width, height) => [[slice, v, u], [slice, v, u + width], [slice, v + height, u + width], [slice, v + height, u]] },
  { id: 1, neighbor: [1, 0, 0], normal: [1, 0, 0], tangent1: [0, 1, 0], tangent2: [0, 0, 1], vertexSigns: [[-1, 1], [-1, -1], [1, -1], [1, 1]],
    voxel: (slice, u, v) => [slice, v, u], corners: (slice, u, v, width, height) => [[slice + 1, v, u + width], [slice + 1, v, u], [slice + 1, v + height, u], [slice + 1, v + height, u + width]] },
  { id: 2, neighbor: [0, -1, 0], normal: [0, -1, 0], tangent1: [1, 0, 0], tangent2: [0, 0, 1], vertexSigns: [[-1, 1], [-1, -1], [1, -1], [1, 1]],
    voxel: (slice, u, v) => [u, slice, v], corners: (slice, u, v, width, height) => [[u, slice, v + height], [u, slice, v], [u + width, slice, v], [u + width, slice, v + height]] },
  { id: 3, neighbor: [0, 1, 0], normal: [0, 1, 0], tangent1: [1, 0, 0], tangent2: [0, 0, 1], vertexSigns: STANDARD_SIGNS,
    voxel: (slice, u, v) => [u, slice, v], corners: (slice, u, v, width, height) => [[u, slice + 1, v], [u, slice + 1, v + height], [u + width, slice + 1, v + height], [u + width, slice + 1, v]] },
  { id: 4, neighbor: [0, 0, -1], normal: [0, 0, -1], tangent1: [1, 0, 0], tangent2: [0, 1, 0], vertexSigns: [[1, -1], [-1, -1], [-1, 1], [1, 1]],
    voxel: (slice, u, v) => [u, v, slice], corners: (slice, u, v, width, height) => [[u + width, v, slice], [u, v, slice], [u, v + height, slice], [u + width, v + height, slice]] },
  { id: 5, neighbor: [0, 0, 1], normal: [0, 0, 1], tangent1: [1, 0, 0], tangent2: [0, 1, 0], vertexSigns: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
    voxel: (slice, u, v) => [u, v, slice], corners: (slice, u, v, width, height) => [[u, v, slice + 1], [u + width, v, slice + 1], [u + width, v + height, slice + 1], [u, v + height, slice + 1]] },
] as const;

export function vertexAo(side1: boolean, side2: boolean, corner: boolean): AoLevel {
  if (side1 && side2) return 0;
  return (3 - Number(side1) - Number(side2) - Number(corner)) as AoLevel;
}

function add(left: Vec3, right: Vec3, scale = 1): Vec3 {
  return [left[0] + right[0] * scale, left[1] + right[1] * scale, left[2] + right[2] * scale];
}

export function faceAoSampleCoordinates(cell: Vec3, faceId: FaceId, vertex: number): {
  readonly faceAir: Vec3;
  readonly side1: Vec3;
  readonly side2: Vec3;
  readonly corner: Vec3;
} {
  if (!Number.isInteger(vertex) || vertex < 0 || vertex > 3) throw new RangeError('Face vertex must be in 0..3.');
  const face = BLOCK_FACES[faceId];
  const [sign1, sign2] = face.vertexSigns[vertex]!;
  const faceAir = add(cell, face.normal);
  const side1 = add(faceAir, face.tangent1, sign1);
  const side2 = add(faceAir, face.tangent2, sign2);
  return { faceAir, side1, side2, corner: add(add(faceAir, face.tangent1, sign1), face.tangent2, sign2) };
}

export function sampleFaceAo(halo: ChunkHaloSnapshot, cell: Vec3, faceId: FaceId, lookup: PaletteLookup): Ao4 {
  const contributes = (coord: Vec3): boolean => {
    const material = halo.voxels[haloIndex(coord[0], coord[1], coord[2])]!;
    if (material === VoxelMaterial.Air) return false;
    const entry = lookup[material];
    if (!entry) throw new RangeError(`Voxel material ${material} is undefined in palette-v1.`);
    return entry.contributesToAo;
  };
  return BLOCK_FACES[faceId].vertexSigns.map((_signs, vertex) => {
    const samples = faceAoSampleCoordinates(cell, faceId, vertex);
    return vertexAo(contributes(samples.side1), contributes(samples.side2), contributes(samples.corner));
  }) as unknown as Ao4;
}

export function packAoSignature(ao: readonly number[]): number {
  if (ao.length !== 4 || ao.some((value) => !Number.isInteger(value) || value < 0 || value > 3)) {
    throw new RangeError('AO4 requires exactly four integer levels in 0..3.');
  }
  return ao[0]! | (ao[1]! << 2) | (ao[2]! << 4) | (ao[3]! << 6);
}

export function unpackAoSignature(signature: number): Ao4 {
  if (!Number.isSafeInteger(signature) || signature < 0 || signature > 0xff) throw new RangeError('AO4 signature must be in 0..255.');
  return [signature & 3, (signature >> 2) & 3, (signature >> 4) & 3, (signature >> 6) & 3] as Ao4;
}

export function packAoMergeKey(materialId: number, aoSignature: number, faceId: FaceId): number {
  if (!Number.isSafeInteger(materialId) || materialId <= 0 || materialId > 0xff) throw new RangeError('AO merge material must be in 1..255.');
  if (!Number.isSafeInteger(aoSignature) || aoSignature < 0 || aoSignature > 0xff) throw new RangeError('AO signature must be in 0..255.');
  return materialId | (aoSignature << 8) | (faceId << 16);
}

export function usesFlippedDiagonal(ao: Ao4): boolean {
  return ao[0] + ao[2] > ao[1] + ao[3];
}

export function quadIndices(vertexOffset: number, ao: Ao4): readonly [number, number, number, number, number, number] {
  return usesFlippedDiagonal(ao)
    ? [vertexOffset, vertexOffset + 1, vertexOffset + 3, vertexOffset + 1, vertexOffset + 2, vertexOffset + 3]
    : [vertexOffset, vertexOffset + 1, vertexOffset + 2, vertexOffset, vertexOffset + 2, vertexOffset + 3];
}

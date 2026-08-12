import { VOLUME_SIZE, VoxelMaterial } from './constants';
import { BLOCK_FACES, packAoMergeKey, packAoSignature, quadIndices, sampleFaceAo, unpackAoSignature, usesFlippedDiagonal } from './blockAo';
import { assertValidChunkHaloStructure, haloIndex, type ChunkHaloSnapshot } from './chunkHalo';
import { assertPaletteDefinesMaterials, createPaletteLookup, PALETTE_V1, type PaletteEntryV1 } from './palette';
import type { ChunkAoFaceMesh } from './types';

export function meshChunkAoGreedyFaces(
  halo: ChunkHaloSnapshot,
  paletteEntries: readonly PaletteEntryV1[] = PALETTE_V1.entries,
): ChunkAoFaceMesh {
  assertValidChunkHaloStructure(halo);
  const lookup = createPaletteLookup(paletteEntries);
  assertPaletteDefinesMaterials(halo.voxels, lookup);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const materialIds: number[] = [];
  const aoLevels: number[] = [];
  const aoHistogram = [0, 0, 0, 0];
  const min = [VOLUME_SIZE, VOLUME_SIZE, VOLUME_SIZE];
  const max = [0, 0, 0];
  let occupiedCount = 0;
  let quadCount = 0;
  let coveredUnitFaces = 0;
  let normalDiagonalCount = 0;
  let flippedDiagonalCount = 0;

  for (let z = 0; z < VOLUME_SIZE; z += 1) for (let y = 0; y < VOLUME_SIZE; y += 1) for (let x = 0; x < VOLUME_SIZE; x += 1) {
    if (halo.voxels[haloIndex(x, y, z)] === VoxelMaterial.Air) continue;
    occupiedCount += 1;
    min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y); min[2] = Math.min(min[2], z);
    max[0] = Math.max(max[0], x + 1); max[1] = Math.max(max[1], y + 1); max[2] = Math.max(max[2], z + 1);
  }

  for (const face of BLOCK_FACES) {
    for (let slice = 0; slice < VOLUME_SIZE; slice += 1) {
      const mask = new Uint32Array(VOLUME_SIZE ** 2);
      for (let v = 0; v < VOLUME_SIZE; v += 1) for (let u = 0; u < VOLUME_SIZE; u += 1) {
        const cell = face.voxel(slice, u, v);
        const material = halo.voxels[haloIndex(cell[0], cell[1], cell[2])]!;
        if (material !== VoxelMaterial.Air
          && halo.voxels[haloIndex(cell[0] + face.neighbor[0], cell[1] + face.neighbor[1], cell[2] + face.neighbor[2])] === VoxelMaterial.Air) {
          mask[u + VOLUME_SIZE * v] = packAoMergeKey(material, packAoSignature(sampleFaceAo(halo, cell, face.id, lookup)), face.id);
        }
      }

      for (let v = 0; v < VOLUME_SIZE; v += 1) for (let u = 0; u < VOLUME_SIZE; u += 1) {
        const key = mask[u + VOLUME_SIZE * v]!;
        if (key === 0) continue;
        let width = 1;
        while (u + width < VOLUME_SIZE && mask[u + width + VOLUME_SIZE * v] === key) width += 1;
        let height = 1;
        heightLoop: while (v + height < VOLUME_SIZE) {
          for (let offset = 0; offset < width; offset += 1) if (mask[u + offset + VOLUME_SIZE * (v + height)] !== key) break heightLoop;
          height += 1;
        }
        const material = key & 0xff;
        const ao = unpackAoSignature((key >> 8) & 0xff);
        const vertexOffset = positions.length / 3;
        for (const corner of face.corners(slice, u, v, width, height)) {
          positions.push(...corner); normals.push(...face.normal); materialIds.push(material);
        }
        aoLevels.push(...ao);
        for (const level of ao) aoHistogram[level] = aoHistogram[level]! + 1;
        indices.push(...quadIndices(vertexOffset, ao));
        if (usesFlippedDiagonal(ao)) flippedDiagonalCount += 1; else normalDiagonalCount += 1;
        for (let clearV = 0; clearV < height; clearV += 1) mask.fill(0, u + VOLUME_SIZE * (v + clearV), u + width + VOLUME_SIZE * (v + clearV));
        quadCount += 1;
        coveredUnitFaces += width * height;
      }
    }
  }

  return {
    key: halo.key, coord: { ...halo.coord },
    positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices),
    materialIds: new Uint8Array(materialIds), aoLevels: new Uint8Array(aoLevels),
    bounds: quadCount === 0 ? null : { min: [min[0], min[1], min[2]], max: [max[0], max[1], max[2]] },
    quadCount, triangleCount: quadCount * 2, coveredUnitFaces, mesherMode: 'ao-greedy', occupiedCount,
    aoHistogram: aoHistogram as [number, number, number, number], normalDiagonalCount, flippedDiagonalCount,
  };
}

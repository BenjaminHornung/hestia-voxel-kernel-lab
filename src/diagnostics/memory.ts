import { CANDIDATE_CHUNK_COUNT, VOLUME_VOXEL_COUNT } from '../voxel/constants';
import type { ChunkVisibleFaceMesh } from '../voxel/types';

export interface MemoryDiagnostics {
  readonly candidateDenseVoxelBytes: number;
  readonly materializedVoxelPayloadBytes: number;
  readonly chunkMetadataBytesEstimate: number;
  readonly haloBytesPerSnapshot: number;
  readonly haloBytesTotalProcessed: number;
  readonly meshPositionBytes: number;
  readonly meshNormalBytes: number;
  readonly meshIndexBytes: number;
  readonly meshMaterialIdBytes: number;
  readonly meshTotalBytes: number;
  readonly debugEdgeBytes: number;
  readonly debugNormalBytes: number;
  readonly debugChunkBoundsBytes: number;
  readonly colorAttributeBytes: number;
  readonly gpuMemoryBytes: number | null;
}

export type SceneMemoryDiagnostics = Pick<MemoryDiagnostics,
  'candidateDenseVoxelBytes'
  | 'materializedVoxelPayloadBytes'
  | 'chunkMetadataBytesEstimate'
  | 'haloBytesPerSnapshot'
  | 'haloBytesTotalProcessed'
  | 'meshPositionBytes'
  | 'meshNormalBytes'
  | 'meshIndexBytes'
  | 'meshMaterialIdBytes'
  | 'meshTotalBytes'
>;

export function candidateDenseVoxelBytes(candidateChunks = CANDIDATE_CHUNK_COUNT): number {
  return candidateChunks * VOLUME_VOXEL_COUNT * Uint8Array.BYTES_PER_ELEMENT;
}

export function summarizeMeshMemory(chunks: readonly ChunkVisibleFaceMesh[]): Pick<
  SceneMemoryDiagnostics,
  'meshPositionBytes' | 'meshNormalBytes' | 'meshIndexBytes' | 'meshMaterialIdBytes' | 'meshTotalBytes'
> {
  const memory = chunks.reduce((sum, chunk) => ({
    meshPositionBytes: sum.meshPositionBytes + chunk.positions.byteLength,
    meshNormalBytes: sum.meshNormalBytes + chunk.normals.byteLength,
    meshIndexBytes: sum.meshIndexBytes + chunk.indices.byteLength,
    meshMaterialIdBytes: sum.meshMaterialIdBytes + chunk.materialIds.byteLength,
  }), {
    meshPositionBytes: 0,
    meshNormalBytes: 0,
    meshIndexBytes: 0,
    meshMaterialIdBytes: 0,
  });
  return { ...memory, meshTotalBytes: Object.values(memory).reduce((total, bytes) => total + bytes, 0) };
}

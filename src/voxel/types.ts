export type Vec3 = readonly [number, number, number];

export interface ChunkCoord {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type ChunkKey = string;

export interface MeshBounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface VisibleFaceMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  readonly materialIds: Uint8Array;
  readonly bounds: MeshBounds | null;
  readonly quadCount: number;
  readonly triangleCount: number;
}

export interface ChunkVisibleFaceMesh extends VisibleFaceMesh {
  readonly key: ChunkKey;
  readonly coord: ChunkCoord;
  readonly occupiedCount: number;
}

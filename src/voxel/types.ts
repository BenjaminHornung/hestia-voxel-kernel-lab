export type Vec3 = readonly [number, number, number];

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

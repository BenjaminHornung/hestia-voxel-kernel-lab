import { createHash } from 'node:crypto';
import { VOLUME_SIZE, VoxelMaterial } from '../../src/voxel/constants';
import type { ChunkVisibleFaceMesh } from '../../src/voxel/types';

export interface MeshCoverage {
  readonly keys: ReadonlySet<string>;
  readonly hash: string;
}

export function meshCoverage(meshes: readonly ChunkVisibleFaceMesh[]): MeshCoverage {
  const keys = new Set<string>();
  for (const mesh of meshes) {
    if (
      mesh.triangleCount !== mesh.quadCount * 2
      || mesh.positions.length % 3 !== 0
      || mesh.positions.length !== mesh.quadCount * 12
      || mesh.normals.length !== mesh.quadCount * 12
      || mesh.materialIds.length !== mesh.quadCount * 4
      || mesh.indices.length !== mesh.quadCount * 6
    ) {
      throw new RangeError('Mesh arrays do not match the declared quad count.');
    }
    const origin = [mesh.coord.x * VOLUME_SIZE, mesh.coord.y * VOLUME_SIZE, mesh.coord.z * VOLUME_SIZE];
    for (let quad = 0; quad < mesh.quadCount; quad += 1) {
      const vertexOffset = quad * 12;
      const materialOffset = quad * 4;
      const indexOffset = quad * 6;
      const expectedIndices = [vertexOffset / 3, vertexOffset / 3 + 1, vertexOffset / 3 + 2, vertexOffset / 3, vertexOffset / 3 + 2, vertexOffset / 3 + 3];
      const actualIndices = Array.from(mesh.indices.slice(indexOffset, indexOffset + 6));
      if (actualIndices.some((index) => !Number.isInteger(index) || index < 0 || index >= mesh.positions.length / 3)
        || actualIndices.some((index, indexPosition) => index !== expectedIndices[indexPosition])) {
        throw new RangeError(`Quad ${quad} has invalid indexed triangle topology.`);
      }
      const normal = Array.from(mesh.normals.slice(vertexOffset, vertexOffset + 3));
      if (normal.filter((value) => Math.abs(value) === 1).length !== 1 || normal.some((value) => ![-1, 0, 1].includes(value))) {
        throw new RangeError(`Quad ${quad} does not have an axis-aligned unit normal.`);
      }
      const axis = normal.findIndex((value) => value !== 0);
      const sign = normal[axis]!;
      const material = mesh.materialIds[materialOffset]!;
      if (material === VoxelMaterial.Air) throw new RangeError(`Quad ${quad} uses air as its material.`);
      for (let vertex = 0; vertex < 4; vertex += 1) {
        if (
          mesh.materialIds[materialOffset + vertex] !== material
          || [0, 1, 2].some((component) => mesh.normals[vertexOffset + vertex * 3 + component] !== normal[component])
        ) {
          throw new RangeError(`Quad ${quad} has inconsistent vertex material or normals.`);
        }
      }

      const vertices = Array.from({ length: 4 }, (_, vertex) => (
        [0, 1, 2].map((component) => mesh.positions[vertexOffset + vertex * 3 + component]!)
      ));
      if (vertices.flat().some((value) => !Number.isInteger(value) || value < 0 || value > VOLUME_SIZE)) {
        throw new RangeError(`Quad ${quad} has a vertex outside integer chunk-cell boundaries.`);
      }
      const plane = vertices[0]![axis]!;
      if (vertices.some((vertex) => vertex[axis] !== plane)) throw new RangeError(`Quad ${quad} is not coplanar.`);
      const surfaceAxes = [0, 1, 2].filter((component) => component !== axis);
      const [uAxis, vAxis] = surfaceAxes;
      const minU = Math.min(...vertices.map((vertex) => vertex[uAxis!]!));
      const maxU = Math.max(...vertices.map((vertex) => vertex[uAxis!]!));
      const minV = Math.min(...vertices.map((vertex) => vertex[vAxis!]!));
      const maxV = Math.max(...vertices.map((vertex) => vertex[vAxis!]!));
      if (minU === maxU || minV === maxV) throw new RangeError(`Quad ${quad} has zero area.`);
      const expectedCorners = new Set([`${minU},${minV}`, `${minU},${maxV}`, `${maxU},${minV}`, `${maxU},${maxV}`]);
      if (new Set(vertices.map((vertex) => `${vertex[uAxis!]},${vertex[vAxis!]}`)).size !== 4
        || vertices.some((vertex) => !expectedCorners.has(`${vertex[uAxis!]},${vertex[vAxis!]}`))) {
        throw new RangeError(`Quad ${quad} does not describe an axis-aligned rectangle.`);
      }

      const area = (maxU - minU) * (maxV - minV);
      const indexedVertex = (index: number): number[] => [
        mesh.positions[index * 3]!, mesh.positions[index * 3 + 1]!, mesh.positions[index * 3 + 2]!,
      ];
      for (const triangleOffset of [0, 3]) {
        const [a, b, c] = actualIndices.slice(triangleOffset, triangleOffset + 3).map(indexedVertex);
        const ab = b!.map((value, component) => value - a![component]!);
        const ac = c!.map((value, component) => value - a![component]!);
        const cross = [
          ab[1]! * ac[2]! - ab[2]! * ac[1]!,
          ab[2]! * ac[0]! - ab[0]! * ac[2]!,
          ab[0]! * ac[1]! - ab[1]! * ac[0]!,
        ];
        if (cross.some((value, component) => value !== normal[component]! * area)) {
          throw new RangeError(`Quad ${quad} has incorrect outward winding.`);
        }
      }

      const worldPlane = plane + origin[axis]!;
      for (let v = minV; v < maxV; v += 1) {
        for (let u = minU; u < maxU; u += 1) {
          const key = `${axis}:${sign}:${worldPlane}:${u + origin[uAxis!]}:${v + origin[vAxis!]}:${material}`;
          if (keys.has(key)) throw new RangeError(`Duplicate covered unit face: ${key}`);
          keys.add(key);
        }
      }
    }
  }
  const hash = createHash('sha256').update([...keys].sort().join('\n')).digest('hex');
  return { keys, hash: `sha256:${hash}` };
}

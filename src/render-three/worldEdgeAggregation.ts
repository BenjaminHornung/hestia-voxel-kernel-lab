import { VOLUME_SIZE } from '../voxel/constants';
import type { ChunkVisibleFaceMesh } from '../voxel/types';

type WorldCellVertex = readonly [number, number, number];

function worldCellVertex(chunk: ChunkVisibleFaceMesh, vertex: number): WorldCellVertex {
  const offset = vertex * 3;
  const point = [
    chunk.coord.x * VOLUME_SIZE + chunk.positions[offset]!,
    chunk.coord.y * VOLUME_SIZE + chunk.positions[offset + 1]!,
    chunk.coord.z * VOLUME_SIZE + chunk.positions[offset + 2]!,
  ] as const;
  if (!point.every(Number.isSafeInteger)) {
    throw new RangeError('Chunk mesh edges require safe integer world-cell vertices.');
  }
  return point;
}

function edgeKey(start: WorldCellVertex, end: WorldCellVertex): string {
  const differences = end.map((value, axis) => value - start[axis]!) as [number, number, number];
  const edgeAxis = differences.findIndex((value) => value !== 0);
  if (edgeAxis < 0 || differences.some((value, axis) => axis !== edgeAxis && value !== 0)) {
    throw new RangeError('Chunk mesh edges must be axis-aligned.');
  }
  const minimum = differences[edgeAxis]! > 0 ? start : end;
  if (Math.abs(differences[edgeAxis]!) !== 1) {
    throw new RangeError('Chunk mesh edges must span exactly one world cell.');
  }
  return `${edgeAxis}:${minimum[0]},${minimum[1]},${minimum[2]}`;
}

export function createWorldEdgePositions(
  chunks: readonly ChunkVisibleFaceMesh[],
  voxelSizeMeters: number,
): Float32Array {
  const edges = new Map<string, readonly [WorldCellVertex, WorldCellVertex]>();
  const corners = [[0, 1], [1, 2], [2, 3], [3, 0]] as const;
  for (const chunk of chunks) {
    if (chunk.positions.length % 12 !== 0) {
      throw new RangeError('Chunk mesh positions must contain four vertices per quad.');
    }
    for (let quad = 0; quad < chunk.positions.length / 12; quad += 1) {
      for (const [startCorner, endCorner] of corners) {
        const start = worldCellVertex(chunk, quad * 4 + startCorner);
        const end = worldCellVertex(chunk, quad * 4 + endCorner);
        edges.set(edgeKey(start, end), differencesForCanonicalEndpoint(start, end));
      }
    }
  }

  const positions = new Float32Array(edges.size * 6);
  let offset = 0;
  for (const [, [start, end]] of [...edges.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
    for (const point of [start, end]) {
      positions[offset++] = point[0] * voxelSizeMeters;
      positions[offset++] = point[1] * voxelSizeMeters;
      positions[offset++] = point[2] * voxelSizeMeters;
    }
  }
  return positions;
}

function differencesForCanonicalEndpoint(start: WorldCellVertex, end: WorldCellVertex): readonly [WorldCellVertex, WorldCellVertex] {
  const axis = end.findIndex((value, index) => value !== start[index]);
  return end[axis]! > start[axis]! ? [start, end] : [end, start];
}

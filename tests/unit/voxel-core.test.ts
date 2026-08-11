import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { VOLUME_SIZE, VOLUME_VOXEL_COUNT, VoxelMaterial } from '../../src/voxel/constants';
import { voxelCoordinates, voxelIndex } from '../../src/voxel/coordinates';
import { DenseVoxelVolume } from '../../src/voxel/denseVolume';
import { createVisibleFaceFixture, FIXTURE_SHA256 } from '../../src/voxel/fixtures';
import { meshVisibleFaces } from '../../src/voxel/visibleFaceMesher';

function volumeWith(...voxels: ReadonlyArray<readonly [number, number, number, VoxelMaterial]>): DenseVoxelVolume {
  const data = new Uint8Array(VOLUME_VOXEL_COUNT);
  for (const [x, y, z, material] of voxels) {
    data[voxelIndex(x, y, z)] = material;
  }
  return new DenseVoxelVolume(data);
}

describe('DenseVoxelVolume', () => {
  it('reserves material zero for air', () => {
    expect(VoxelMaterial.Air).toBe(0);
  });

  it('uses x-fast indexing and rejects invalid coordinates', () => {
    expect(voxelIndex(0, 0, 0)).toBe(0);
    expect(voxelIndex(1, 0, 0)).toBe(1);
    expect(voxelIndex(0, 1, 0)).toBe(VOLUME_SIZE);
    expect(voxelIndex(0, 0, 1)).toBe(VOLUME_SIZE ** 2);
    expect(voxelIndex(31, 31, 31)).toBe(VOLUME_VOXEL_COUNT - 1);
    expect(() => voxelIndex(-1, 0, 0)).toThrow(RangeError);
    expect(() => voxelIndex(0.5, 0, 0)).toThrow(RangeError);
  });

  it('round-trips boundary and fixed inner coordinates through the inverse index mapping', () => {
    const coordinates = [
      [0, 0, 0],
      [31, 0, 0],
      [0, 31, 0],
      [0, 0, 31],
      [31, 31, 0],
      [31, 0, 31],
      [0, 31, 31],
      [31, 31, 31],
      [1, 2, 3],
      [7, 13, 29],
      [16, 16, 16],
    ] as const;

    for (const [x, y, z] of coordinates) {
      expect(voxelCoordinates(voxelIndex(x, y, z))).toEqual([x, y, z]);
    }
    expect(voxelCoordinates(0)).toEqual([0, 0, 0]);
    expect(voxelCoordinates(VOLUME_VOXEL_COUNT - 1)).toEqual([31, 31, 31]);
    for (const invalid of [-1, VOLUME_VOXEL_COUNT, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => voxelCoordinates(invalid)).toThrow(RangeError);
    }
  });

  it('owns its data and returns defensive snapshots', () => {
    const source = new Uint8Array(VOLUME_VOXEL_COUNT);
    source[voxelIndex(1, 2, 3)] = VoxelMaterial.Stairs;
    const volume = new DenseVoxelVolume(source);
    source[voxelIndex(1, 2, 3)] = VoxelMaterial.Air;

    const snapshot = volume.snapshot();
    snapshot[voxelIndex(1, 2, 3)] = VoxelMaterial.Roof;

    expect(volume.get(1, 2, 3)).toBe(VoxelMaterial.Stairs);
    expect(volume.occupiedCount).toBe(1);
    expect(volume.storageByteLength).toBe(VOLUME_VOXEL_COUNT * Uint8Array.BYTES_PER_ELEMENT);
    expect(volume.snapshot()[voxelIndex(1, 2, 3)]).toBe(VoxelMaterial.Stairs);
  });

  it('rejects the wrong size and unknown materials', () => {
    expect(() => new DenseVoxelVolume(new Uint8Array(1))).toThrow(RangeError);
    const data = new Uint8Array(VOLUME_VOXEL_COUNT);
    data[0] = 5;
    expect(() => new DenseVoxelVolume(data)).toThrow(RangeError);
  });

  it('rejects invalid coordinates when reading', () => {
    const volume = new DenseVoxelVolume();
    expect(() => volume.get(-1, 0, 0)).toThrow(RangeError);
    expect(() => volume.get(0, VOLUME_SIZE, 0)).toThrow(RangeError);
    expect(() => volume.get(0, 0, 1.5)).toThrow(RangeError);
  });
});

describe('visible-face mesher', () => {
  it('returns typed empty output and null bounds', () => {
    const mesh = meshVisibleFaces(new DenseVoxelVolume());
    expect(mesh.positions).toBeInstanceOf(Float32Array);
    expect(mesh.normals).toBeInstanceOf(Float32Array);
    expect(mesh.indices).toBeInstanceOf(Uint32Array);
    expect(mesh.materialIds).toBeInstanceOf(Uint8Array);
    expect(mesh.positions).toHaveLength(0);
    expect(mesh.bounds).toBeNull();
    expect(mesh.quadCount).toBe(0);
    expect(mesh.triangleCount).toBe(0);
  });

  it('emits six outward axis-aligned quads with two triangles each', () => {
    const mesh = meshVisibleFaces(volumeWith([1, 1, 1, VoxelMaterial.Shell]));
    expect(mesh.quadCount).toBe(6);
    expect(mesh.triangleCount).toBe(12);
    expect(mesh.positions).toHaveLength(6 * 4 * 3);
    expect(mesh.normals).toHaveLength(6 * 4 * 3);
    expect(mesh.indices).toHaveLength(6 * 6);
    expect(mesh.materialIds).toEqual(new Uint8Array(24).fill(VoxelMaterial.Shell));
    expect(mesh.bounds).toEqual({ min: [1, 1, 1], max: [2, 2, 2] });

    const expectedNormals = [
      [-1, 0, 0],
      [1, 0, 0],
      [0, -1, 0],
      [0, 1, 0],
      [0, 0, -1],
      [0, 0, 1],
    ];
    for (let quad = 0; quad < mesh.quadCount; quad += 1) {
      const vertex = quad * 12;
      const normal = Array.from(mesh.normals.slice(vertex, vertex + 3));
      expect(normal).toEqual(expectedNormals[quad]);
      expect(Array.from(mesh.normals.slice(vertex, vertex + 12))).toEqual([...normal, ...normal, ...normal, ...normal]);

      const a = mesh.positions.slice(vertex, vertex + 3);
      const b = mesh.positions.slice(vertex + 3, vertex + 6);
      const c = mesh.positions.slice(vertex + 6, vertex + 9);
      const ab = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
      const ac = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
      const cross = [
        ab[1]! * ac[2]! - ab[2]! * ac[1]!,
        ab[2]! * ac[0]! - ab[0]! * ac[2]!,
        ab[0]! * ac[1]! - ab[1]! * ac[0]!,
      ];
      expect(cross.map((value) => value === 0 ? 0 : value)).toEqual(normal);
      expect(Array.from(mesh.indices.slice(quad * 6, quad * 6 + 6))).toEqual([
        quad * 4,
        quad * 4 + 1,
        quad * 4 + 2,
        quad * 4,
        quad * 4 + 2,
        quad * 4 + 3,
      ]);
    }
  });

  it.each([
    [[1, 0, 0], 'x'],
    [[0, 1, 0], 'y'],
    [[0, 0, 1], 'z'],
  ] as const)('removes the shared face for touching voxels along $1', ([dx, dy, dz], _axis) => {
    const mesh = meshVisibleFaces(volumeWith(
      [10, 10, 10, VoxelMaterial.Platform],
      [10 + dx, 10 + dy, 10 + dz, VoxelMaterial.Stairs],
    ));
    expect(mesh.quadCount).toBe(10);
    expect(mesh.triangleCount).toBe(20);
  });

  it('emits only the 24 outside quads of a complete 2×2×2 block', () => {
    const voxels: Array<readonly [number, number, number, VoxelMaterial]> = [];
    for (let z = 8; z < 10; z += 1) {
      for (let y = 8; y < 10; y += 1) {
        for (let x = 8; x < 10; x += 1) {
          voxels.push([x, y, z, VoxelMaterial.Platform]);
        }
      }
    }
    const mesh = meshVisibleFaces(volumeWith(...voxels));
    expect(mesh.quadCount).toBe(24);
    expect(mesh.triangleCount).toBe(48);
  });

  it('is byte-identical across repeated runs', () => {
    const volume = createVisibleFaceFixture();
    const first = meshVisibleFaces(volume);
    const second = meshVisibleFaces(volume);
    expect(first.positions).toEqual(second.positions);
    expect(first.normals).toEqual(second.normals);
    expect(first.indices).toEqual(second.indices);
    expect(first.materialIds).toEqual(second.materialIds);
    expect(first.bounds).toEqual(second.bounds);
  });
});

describe('WP01 fixture', () => {
  it('locks the volume bytes, material counts, and mesh totals', () => {
    const volume = createVisibleFaceFixture();
    const snapshot = volume.snapshot();
    const counts = [0, 0, 0, 0, 0];
    for (const material of snapshot) {
      counts[material]! += 1;
    }

    expect(createHash('sha256').update(snapshot).digest('hex')).toBe(FIXTURE_SHA256);
    expect(counts).toEqual([31_599, 784, 105, 216, 64]);
    expect(volume.occupiedCount).toBe(1_169);

    const mesh = meshVisibleFaces(volume);
    expect(mesh.quadCount).toBe(2_238);
    expect(mesh.triangleCount).toBe(4_476);
    expect(mesh.positions).toHaveLength(26_856);
    expect(mesh.normals).toHaveLength(26_856);
    expect(mesh.materialIds).toHaveLength(8_952);
    expect(mesh.indices).toHaveLength(13_428);
    expect(mesh.bounds).toEqual({ min: [2, 0, 2], max: [30, 9, 30] });
  });

  it('keeps every triangle axis-aligned with outward winding', () => {
    const mesh = meshVisibleFaces(createVisibleFaceFixture());
    const axisNormals = new Set(['-1,0,0', '1,0,0', '0,-1,0', '0,1,0', '0,0,-1', '0,0,1']);

    for (let offset = 0; offset < mesh.normals.length; offset += 3) {
      expect(axisNormals.has(Array.from(mesh.normals.slice(offset, offset + 3)).join(','))).toBe(true);
    }

    for (let triangle = 0; triangle < mesh.triangleCount; triangle += 1) {
      const indices = Array.from(mesh.indices.slice(triangle * 3, triangle * 3 + 3));
      const [a, b, c] = indices.map((index) => Array.from(mesh.positions.slice(index! * 3, index! * 3 + 3)));
      const normal = Array.from(mesh.normals.slice(indices[0]! * 3, indices[0]! * 3 + 3));
      const planeAxis = normal.findIndex((value) => value !== 0);
      expect(a![planeAxis]).toBe(b![planeAxis]);
      expect(a![planeAxis]).toBe(c![planeAxis]);

      const ab = a!.map((value, axis) => b![axis]! - value);
      const ac = a!.map((value, axis) => c![axis]! - value);
      const cross = [
        ab[1]! * ac[2]! - ab[2]! * ac[1]!,
        ab[2]! * ac[0]! - ab[0]! * ac[2]!,
        ab[0]! * ac[1]! - ab[1]! * ac[0]!,
      ];
      expect(cross.map((value) => value === 0 ? 0 : value)).toEqual(normal);
    }
  });
});

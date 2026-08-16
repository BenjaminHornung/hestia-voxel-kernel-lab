import { describe, expect, it } from 'vitest';
import { assertCanonicalRelativePathV1, compareCanonicalRelativePathsV1 } from '../../../../src/benchmark/provenance/canonicalPathV1';
import { digestBundleV1, digestBuildV1, digestFileSetV1, frameFileSetV1, sha256BytesV1, type FileSetEntryV1 } from '../../../../src/benchmark/provenance/fileSetDigestV1';
import { BENCHMARK_DIGEST_GOLDENS_V1 } from '../../../../tests/contracts/benchmark/digest-v1.golden';

const files: FileSetEntryV1[] = [
  { path: 'raw/a.json', bytes: new TextEncoder().encode('{}') },
];

describe('BR01 paths and digests', () => {
  it('rejects non-canonical paths', () => {
    for (const path of ['/a', '../a', 'a//b', 'A/a', 'a/']) expect(() => assertCanonicalRelativePathV1(path)).toThrow();
  });
  it('sorts paths by raw UTF-16 code units across punctuation and depth', () => {
    expect(compareCanonicalRelativePathsV1('a/2', 'a/10')).toBeGreaterThan(0);
    expect(['a-2', 'a.2', 'a/2', 'a/2/deep'].sort(compareCanonicalRelativePathsV1)).toEqual(['a-2', 'a.2', 'a/2', 'a/2/deep']);
  });
  it('keeps domain-separated digests distinct', () => {
    expect(digestBundleV1(files)).not.toBe(digestBuildV1(files));
    expect(digestBuildV1(files)).not.toBe(digestFileSetV1(files));
  });
  it('uses the same frame bytes for digest and frame APIs', () => {
    expect(sha256BytesV1(frameFileSetV1(files))).toBe(digestFileSetV1(files));
  });
  it('matches the primary source digest vectors', () => {
    const one: FileSetEntryV1[] = [{ path: 'raw/a.json', bytes: new TextEncoder().encode('{}') }];
    const two: FileSetEntryV1[] = [
      { path: 'raw/b.bin', bytes: new Uint8Array([0x00, 0xff, 0x7f]) },
      { path: 'raw/a.json', bytes: new TextEncoder().encode('{"x":"é"}') },
    ];
    for (const [files, golden] of [[one, BENCHMARK_DIGEST_GOLDENS_V1.one], [two, BENCHMARK_DIGEST_GOLDENS_V1.two]] as const) {
      expect(digestBundleV1(files)).toBe(golden.bundle);
      expect(digestBuildV1(files)).toBe(golden.build);
      expect(digestFileSetV1(files)).toBe(golden.fileset);
    }
  });
});

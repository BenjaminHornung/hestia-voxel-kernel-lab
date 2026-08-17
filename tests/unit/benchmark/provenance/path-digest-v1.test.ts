import { describe, expect, it } from 'vitest';
import { assertBuildRelativePathV1, assertBundleRelativePathV1, assertCanonicalRelativePathV1, assertRepositoryRelativePathV1, buildRelativePathV1, compareCanonicalRelativePathsV1, repositoryRelativePathV1 } from '../../../../src/benchmark/provenance/canonicalPathV1';
import { digestBundleV1, digestBuildV1, digestFileSetV1, frameFileSetV1, sha256BytesV1, type FileSetEntryInputV1 } from '../../../../src/benchmark/provenance/fileSetDigestV1';
import { BENCHMARK_DIGEST_GOLDENS_V1 } from '../../../../tests/contracts/benchmark/digest-v1.golden';

const files: FileSetEntryInputV1[] = [
  { path: 'raw/a.json', bytes: new TextEncoder().encode('{}') },
];

describe('BR01 paths and digests', () => {
  it('rejects non-canonical paths', () => {
    for (const path of ['/a', '../a', 'a//b', 'A/a', 'a/', 'C:/a', '\\\\server\\share', 'a\\b', 'a/\0b']) expect(() => assertBundleRelativePathV1(path)).toThrow();
  });
  it('rejects Windows reserved and trailing aliases only at the bundle boundary', () => {
    for (const path of ['con', 'con.json', 'raw/nul.bin', 'raw/com1.txt', 'raw/lpt9', 'raw/a.', 'raw/a ']) expect(() => assertBundleRelativePathV1(path)).toThrow();
    for (const path of ['raw/console.json', 'raw/compute1.json', 'raw/lpt10.json']) expect(() => assertBundleRelativePathV1(path)).not.toThrow();
    expect(() => assertRepositoryRelativePathV1('raw/con.json')).not.toThrow();
    expect(() => assertBuildRelativePathV1('raw/a.')).not.toThrow();
  });
  it('keeps repository and build ownership case-preserving while bundles remain lowercase', () => {
    expect(repositoryRelativePathV1('tests/contracts/wp04AoGolden.ts')).toBe('tests/contracts/wp04AoGolden.ts');
    expect(buildRelativePathV1('assets/index-DwXV5Hbk.js')).toBe('assets/index-DwXV5Hbk.js');
    expect(() => assertRepositoryRelativePathV1('tests/contracts/wp04AoGolden.ts/../x')).toThrow();
    expect(() => assertBuildRelativePathV1('C:\\dist\\assets\\index.js')).toThrow();
    expect(() => assertCanonicalRelativePathV1('Assets/index.js')).toThrow();
    expect(() => repositoryRelativePathV1('tests/contracts/wp04aogolden.ts')).not.toThrow();
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
  it('routes each digest domain through its owning path policy', () => {
    const repository = [{ path: 'tests/contracts/wp04AoGolden.ts', bytes: new Uint8Array([1]) }];
    const build = [{ path: 'assets/index-DwXV5Hbk.js', bytes: new Uint8Array([1]) }];
    expect(() => digestFileSetV1(repository)).not.toThrow();
    expect(() => digestBuildV1(build)).not.toThrow();
    expect(() => digestBundleV1(build)).toThrow();
  });
  it('matches the primary source digest vectors', () => {
    const one: FileSetEntryInputV1[] = [{ path: 'raw/a.json', bytes: new TextEncoder().encode('{}') }];
    const two: FileSetEntryInputV1[] = [
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

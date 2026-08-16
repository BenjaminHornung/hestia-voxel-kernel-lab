import { describe, expect, it } from 'vitest';
import { BENCHMARK_JCS_GOLDENS_V1 } from '../../../../tests/contracts/benchmark/jcs-v1.golden';
import { assertCanonicalJsonBytesV1, canonicalizeJsonStringV1, CanonicalJsonError, parseCanonicalJsonV1 } from '../../../../src/benchmark/provenance/canonicalJsonV1';

describe('BR01 canonical JSON', () => {
  it('uses raw UTF-16 key order and preserves Unicode', () => {
    expect(canonicalizeJsonStringV1({ z: 0, a: 'ä', n: 1e-7 })).toBe(BENCHMARK_JCS_GOLDENS_V1.sorted);
    expect(canonicalizeJsonStringV1({ composed: 'é', decomposed: 'é' })).toBe(BENCHMARK_JCS_GOLDENS_V1.unicodeComposed);
  });
  it.each([
    ['duplicate keys', new TextEncoder().encode('{"a":1,"a":2}')],
    ['BOM', new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d])],
    ['pretty JSON', new TextEncoder().encode('{\n}')],
  ])('rejects %s', (_label, value) => expect(() => parseCanonicalJsonV1(value)).toThrow(CanonicalJsonError));
  it('rejects unsafe values', () => {
    expect(() => canonicalizeJsonStringV1(NaN)).toThrow(CanonicalJsonError);
    expect(() => canonicalizeJsonStringV1(-0)).toThrow(CanonicalJsonError);
    const cycle: { value?: unknown } = {}; cycle.value = cycle;
    expect(() => canonicalizeJsonStringV1(cycle)).toThrow(CanonicalJsonError);
  });
  it('accepts only byte-identical canonical JSON', () => expect(() => assertCanonicalJsonBytesV1('{}')).not.toThrow());
});

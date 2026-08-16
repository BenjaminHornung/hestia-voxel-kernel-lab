import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  benchmarkNegativeFixtureCasesV1,
  benchmarkPositiveFixtureCasesV1,
} from '../../../../tests/fixtures/benchmark/v1/case-catalog';

const readCaseIds = (path: string): string[] => {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as { readonly caseIds: string[] };
  return manifest.caseIds;
};

describe('BR01 executable catalog coverage', () => {
  it('keeps the positive catalog to exactly P01-P17 with unique IDs and executable contracts', () => {
    const ids = benchmarkPositiveFixtureCasesV1.map((entry) => entry.id);
    expect(ids).toHaveLength(17);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^P(?:0[1-9]|1[0-7])$/.test(id))).toBe(true);
    expect(benchmarkPositiveFixtureCasesV1.every((entry) => typeof entry.executor === 'function' && entry.options.kind.length > 0 && entry.expected.stage.length > 0)).toBe(true);
  });

  it('keeps the negative catalog to exactly N01-N68 with unique IDs and executable contracts', () => {
    const ids = benchmarkNegativeFixtureCasesV1.map((entry) => entry.id);
    expect(ids).toHaveLength(68);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^N(?:0[1-9]|[1-5][0-9]|6[0-8])$/.test(id))).toBe(true);
    expect(benchmarkNegativeFixtureCasesV1.every((entry) => typeof entry.executor === 'function' && entry.options.kind.length > 0 && entry.expected.stage.length > 0)).toBe(true);
  });

  it('keeps both ID-only manifests aligned with the catalog order', () => {
    const fixtureRoot = join('tests', 'fixtures', 'benchmark', 'v1');
    expect(readCaseIds(join(fixtureRoot, 'positive', 'README.json'))).toEqual(benchmarkPositiveFixtureCasesV1.map((entry) => entry.id));
    expect(readCaseIds(join(fixtureRoot, 'negative', 'README.json'))).toEqual(benchmarkNegativeFixtureCasesV1.map((entry) => entry.id));
  });
});

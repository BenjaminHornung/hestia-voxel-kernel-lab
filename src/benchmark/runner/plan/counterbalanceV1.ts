import type { CanonicalIdV1, UInt32V1 } from '../../contracts';
import { compareUtf16 } from '../../provenance';
import type { BalanceRowV1 } from '../contractsV1';
import { hashCanonicalV1, type HashCanonicalV1 } from '../ids/orchestrationIdsV1';

function seededOrder(
  values: readonly CanonicalIdV1[],
  seed: UInt32V1,
  domain: string,
  hash: HashCanonicalV1,
): CanonicalIdV1[] {
  const entries = values.map((value) => ({ value, digest: hash(domain, { seed, value }) }));
  if (new Set(entries.map(({ digest }) => digest)).size !== entries.length) {
    throw new Error(`Digest collision in ${domain}.`);
  }
  return entries.sort((left, right) => compareUtf16(left.digest, right.digest)).map(({ value }) => value);
}

function williamsBase(length: number): number[] {
  const result = [0];
  for (let offset = 1; result.length < length; offset += 1) {
    result.push(offset);
    if (result.length < length) result.push(length - offset);
  }
  return result;
}

function assertRows(rows: readonly BalanceRowV1[], candidates: readonly CanonicalIdV1[]): void {
  const expected = JSON.stringify([...candidates].sort(compareUtf16));
  for (const row of rows) {
    if (candidates.length >= 3 && JSON.stringify([...row.candidateIds].sort(compareUtf16)) !== expected) {
      throw new Error('A Williams row must contain every candidate exactly once.');
    }
  }
  const counts = new Map<string, number>();
  rows.forEach((row) => row.candidateIds.forEach((candidateId, position) => {
    const label = JSON.stringify([candidateId, position]);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }));
  if (new Set(counts.values()).size !== 1) throw new Error('Counterbalance positions are unequal.');
}

export function buildCounterbalanceRowsV1(
  canonicalCandidates: readonly CanonicalIdV1[],
  seed: UInt32V1,
  hash: HashCanonicalV1 = hashCanonicalV1,
): readonly BalanceRowV1[] {
  if (canonicalCandidates.length < 2 || new Set(canonicalCandidates).size !== canonicalCandidates.length) {
    throw new RangeError('At least two unique candidates are required.');
  }
  const labels = seededOrder(
    [...canonicalCandidates].sort(compareUtf16),
    seed,
    'br03/order/candidate-labels/v1',
    hash,
  );
  if (labels.length === 2) {
    const [a, b] = labels as [CanonicalIdV1, CanonicalIdV1];
    const rows: BalanceRowV1[] = [
      { rowOrdinal: 0, scheme: 'abba', candidateIds: [a, b, b, a] },
      { rowOrdinal: 1, scheme: 'baab', candidateIds: [b, a, a, b] },
    ];
    assertRows(rows, labels);
    return rows;
  }

  const base = williamsBase(labels.length);
  const initialRows = Array.from({ length: labels.length }, (_, rotation) =>
    base.map((index) => labels[(index + rotation) % labels.length]!),
  );
  const balancedRows = labels.length % 2 === 0
    ? initialRows
    : initialRows.flatMap((row) => [row, [...row].reverse()]);
  const ordered = balancedRows.map((candidateIds) => ({
    candidateIds,
    digest: hash('br03/order/williams-row/v1', { candidateIds, seed }),
  }));
  if (new Set(ordered.map(({ digest }) => digest)).size !== ordered.length) {
    throw new Error('Digest collision in Williams row ordering.');
  }
  const rows = ordered
    .sort((left, right) => compareUtf16(left.digest, right.digest))
    .map(({ candidateIds }, rowOrdinal) => ({ rowOrdinal, scheme: 'latin-square' as const, candidateIds }));
  assertRows(rows, labels);
  return rows;
}

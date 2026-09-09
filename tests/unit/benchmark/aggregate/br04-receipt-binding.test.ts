/**
 * BR04 R3 / B3-Rest: receipt binding of the bytes actually projected.
 * - A consistently mutated document (sample 5 -> 12345) under a stale
 *   receipt must be refused at the crosswalk; the tampered value must
 *   never surface as max = 12345.
 * - Hand-built bundles with a wrong manifestDigest, dirty=true as valid,
 *   candidate-vs-slot conflict, wrong validator digest, or resamples=7
 *   must be refused by the public bundle validator.
 */
import { describe, expect, it } from 'vitest';
import { canonicalBundleBodyDigestV1, validateAndAggregateBundleV1 } from '../../../../src/benchmark/aggregate/br04AggregateV1';
import { sha256OfCanonicalV1 } from '../../../../src/benchmark/aggregate/br04StatisticsV1';
import type { Br04AggregateInputBundleV1 } from '../../../../src/benchmark/aggregate/br04ContractV1';
import type { BenchmarkRunV1 } from '../../../../src/benchmark/contracts';
import {
  buildTestBundleV1,
  chunkMetricV1,
  iterationV1,
  r2BundleV1,
  r2EntryV1,
  r2PlanV1,
} from '../../../fixtures/benchmark/aggregate/br04FixtureBuildersV1';

function setSampleValue(run: BenchmarkRunV1, value: number): void {
  const iterations = (run as unknown as {
    iterations: { samples: { result: { value: number } }[] }[];
  }).iterations;
  iterations[0]!.samples[0]!.result.value = value;
}

function mutableBundle(): Br04AggregateInputBundleV1 {
  const bundle = buildTestBundleV1({
    bundleId: 'r3-b3-bundle',
    metrics: [chunkMetricV1()],
    slots: [{ slotId: 'slot-1', candidateId: 'candidate-a' }],
    runs: [{
      runId: 'run-1',
      slotId: 'slot-1',
      candidateId: 'candidate-a',
      iterations: [iterationV1('iter-1', 'chunk.mesh.cpu.ms@1', [5])],
    }],
  });
  return structuredClone(bundle);
}

describe('br04 R3 B3-Rest receipt binding', () => {
  it('refuses a consistently mutated document under a stale receipt (5 -> 12345)', () => {
    const plan = r2PlanV1('r3-b3-doc', [{ slot: 'slot-doc', candidate: 'candidate-a' }]);
    const entry = r2EntryV1(plan, {
      runId: 'run-doc', slot: 'slot-doc', candidate: 'candidate-a', values: [5],
    });
    setSampleValue(entry.run, 12345);
    const mutated = r2BundleV1('r3-b3-doc', plan, [entry]);
    expect(mutated.bundle).toBeNull();
    expect(mutated.issues.some((issue) =>
      issue.code === 'DOCUMENT_DIGEST_MISMATCH' || issue.code === 'RECEIPT_DIGEST_MISMATCH')).toBe(true);
  });

  it('refuses a wrong manifestDigest at the public bundle boundary', () => {
    const bundle = mutableBundle();
    (bundle as { manifest: { manifestDigest: unknown } }).manifest.manifestDigest =
      'sha256:0000000000000000000000000000000000000000000000000000000000000000';
    const result = validateAndAggregateBundleV1(bundle);
    expect(result.validation.status).toBe('invalid');
    expect(result.aggregate).toBeNull();
    expect(result.validation.issues.some((issue) => issue.code === 'MANIFEST_DIGEST_MISMATCH')).toBe(true);
  });

  it('refuses dirty=true projected as valid at the public bundle boundary', () => {
    const bundle = mutableBundle();
    const envelope = bundle.runs[0]!;
    (envelope.run.source as { dirty: boolean }).dirty = true;
    const result = validateAndAggregateBundleV1(bundle);
    expect(result.validation.status).toBe('invalid');
    expect(result.aggregate).toBeNull();
    expect(result.validation.issues.some((issue) => issue.code === 'SOURCE_DIRTY_MISMATCH')).toBe(true);
  });

  it('refuses a candidate-vs-slot conflict at the public bundle boundary', () => {
    const bundle = mutableBundle();
    (bundle.runs[0]!.run as { candidateId: string }).candidateId = 'candidate-intruder';
    const result = validateAndAggregateBundleV1(bundle);
    expect(result.validation.status).toBe('invalid');
    expect(result.aggregate).toBeNull();
    expect(result.validation.issues.some((issue) => issue.code === 'SLOT_CANDIDATE_MISMATCH')).toBe(true);
  });

  it('refuses a wrong validator digest at the public bundle boundary', () => {
    const bundle = mutableBundle();
    (bundle.sourceContract as { br01ValidatorDigest: unknown }).br01ValidatorDigest =
      'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const result = validateAndAggregateBundleV1(bundle);
    expect(result.validation.status).toBe('invalid');
    expect(result.aggregate).toBeNull();
    expect(result.validation.issues.some((issue) => issue.code === 'VALIDATOR_DIGEST_MISMATCH')).toBe(true);
  });

  it('refuses resamples=7 at the public bundle boundary', () => {
    const bundle = mutableBundle();
    (bundle.bootstrapPolicy as { resamples: unknown }).resamples = 7;
    const result = validateAndAggregateBundleV1(bundle);
    expect(result.validation.status).toBe('invalid');
    expect(result.aggregate).toBeNull();
    expect(result.validation.issues.some((issue) => issue.code === 'BOOTSTRAP_POLICY_INVALID')).toBe(true);
  });

  it('R4-FIX3B: reports a pre-R4 bundle without validatedProjectionDigest as PROJECTION_DIGEST_MISSING (not MISMATCH)', () => {
    const bundle = mutableBundle();
    delete (bundle.runs[0]!.br01ValidationReceipt as { validatedProjectionDigest?: unknown }).validatedProjectionDigest;
    const body = { ...bundle, runs: bundle.runs } as Omit<Br04AggregateInputBundleV1, 'manifest'>;
    const normalizedInputDigest = canonicalBundleBodyDigestV1(body);
    const orderedRawRunDigests = [...bundle.manifest.orderedRawRunDigests];
    const preR4: Br04AggregateInputBundleV1 = {
      ...bundle,
      manifest: {
        orderedRawRunDigests,
        normalizedInputDigest,
        manifestDigest: sha256OfCanonicalV1({ orderedRawRunDigests, normalizedInputDigest }),
      },
    };
    const result = validateAndAggregateBundleV1(preR4);
    expect(result.validation.status).toBe('invalid');
    expect(result.aggregate).toBeNull();
    expect(result.validation.issues.some((issue) => issue.code === 'PROJECTION_DIGEST_MISSING')).toBe(true);
    expect(result.validation.issues.some((issue) => issue.code === 'PROJECTION_DIGEST_MISMATCH')).toBe(false);
  });

  it('R4: rejects a post-crosswalk projection tamper (5 -> 12345) with recomputed container hashes', () => {
    const plan = r2PlanV1('r4-bind-doc', [{ slot: 'slot-doc', candidate: 'candidate-a' }]);
    const entry = r2EntryV1(plan, {
      runId: 'run-doc', slot: 'slot-doc', candidate: 'candidate-a', values: [5],
    });
    const { bundle } = r2BundleV1('r4-bind-doc', plan, [entry]);
    expect(bundle).not.toBeNull();
    const tamperedRuns = structuredClone(bundle?.runs ?? []);
    const tamperedSample = tamperedRuns[0]?.run.iterations[0]?.samples[0] as { value: number } | undefined;
    expect(tamperedSample?.value).toBe(5);
    if (tamperedSample !== undefined) tamperedSample.value = 12345;
    const tamperedBody = { ...bundle, runs: tamperedRuns } as Omit<Br04AggregateInputBundleV1, 'manifest'>;
    const normalizedInputDigest = canonicalBundleBodyDigestV1(tamperedBody);
    const orderedRawRunDigests = [...(bundle?.manifest.orderedRawRunDigests ?? [])];
    const tampered: Br04AggregateInputBundleV1 = {
      ...(bundle as Br04AggregateInputBundleV1),
      runs: tamperedRuns,
      manifest: {
        orderedRawRunDigests,
        normalizedInputDigest,
        manifestDigest: sha256OfCanonicalV1({ orderedRawRunDigests, normalizedInputDigest }),
      },
    };
    const result = validateAndAggregateBundleV1(tampered);
    expect(result.validation.status).toBe('invalid');
    expect(result.aggregate).toBeNull();
    expect(result.validation.issues.some((issue) => issue.code === 'PROJECTION_DIGEST_MISMATCH')).toBe(true);
  });
});

/**
 * BR04 golden aggregate digests (v1). Committed after the first accepted
 * implementation run; must never be updated together with an algorithm
 * change without a new contract version.
 *
 * R2 renewal: the H01 digest was re-recorded after the R2 finding fixes
 * (compatibility key with scenario/seed/source/fingerprint/tag signature,
 * bound environment fingerprint, per-population claim ids). The H01
 * fixture itself is unchanged; only the fixed contract content moved it.
 */
export const BR04_GOLDEN_DIGESTS_V1 = {
  h01AggregateDigest: 'sha256:b584dc6cbdc7d8de9b63bd015953e6789c5c1f44e85594347ec4edebe5a7bfb8' as `sha256:${string}`,
};

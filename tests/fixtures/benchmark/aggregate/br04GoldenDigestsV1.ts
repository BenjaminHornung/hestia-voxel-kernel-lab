/**
 * BR04 golden aggregate digests (v1). Committed after the first accepted
 * implementation run; must never be updated together with an algorithm
 * change without a new contract version.
 *
 * R2 renewal: the H01 digest was re-recorded after the R2 finding fixes
 * (compatibility key with scenario/seed/source/fingerprint/tag signature,
 * bound environment fingerprint, per-population claim ids). The H01
 * fixture itself is unchanged; only the fixed contract content moved it.
 *
 * R3 renewal: re-recorded after the R3 finding fixes (same-run tag-tuple
 * partitioning, receipt-bound document digests, ratio minimum recheck
 * after filtering, readable population labels on cells and comparisons).
 * The H01 fixture itself is unchanged; only the fixed contract content
 * moved it.
 */
export const BR04_GOLDEN_DIGESTS_V1 = {
  h01AggregateDigest: 'sha256:442f74d270f3f8e1aabea91f9def1972275786c8f41a1848031398f71dbd3328' as `sha256:${string}`,
};

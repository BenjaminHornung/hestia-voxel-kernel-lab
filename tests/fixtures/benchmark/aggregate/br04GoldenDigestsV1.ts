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
 *
 * R4 renewal: re-recorded after the R4 focus-audit fixes (uniform
 * population identity: the key always carries metric plus the full
 * observed tag tuple, no split-conditional legacy keys; projection-bound
 * receipts via validatedProjectionDigest). The H01 fixture itself is
 * unchanged; only the fixed contract content moved it.
 */
export const BR04_GOLDEN_DIGESTS_V1 = {
  h01AggregateDigest: 'sha256:f7d229a5aa1855779613bcac4e70d2a3dcc912ba24c65e3876fd13dadd4e4234' as `sha256:${string}`,
};

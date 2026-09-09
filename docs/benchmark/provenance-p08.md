# P-LAB-P08 Provenance and Method Boundary Evidence

- Basis: `origin/integration/voxel-kernel-lab-v1` @ `92c747bb1bb5859188e68089cb72bc7d47195db5`
- Branch: `agent/benchmark-provenance-p08`
- Scope: synthetic-versus-measured claim provenance and the method/source rest points listed in `aggregator-v1.md:104-137`.
- External review source: `WELTRAUM_VERIFIKATION_REVIEW_FOLGEPLAN_2026-09-09.md:173-187,407-410`.
- No benchmark platform, statistic, golden, harness, hardware, E2E, or gate behavior was changed.

## Claim and publishing boundary

BR04 has two explicit outcomes:

- `syntheticHardwareProfile: true` produces `ineligible-synthetic-fixture`; the report must not publish a numeric performance claim from that aggregate.
- `syntheticHardwareProfile: false` may produce `eligible-measured` only after the existing plan, receipt, source, projection, bundle, and statistic validations pass.

The second outcome is a **metadata eligibility claim**, not an authenticity attestation. The current v1 input contract has no independent hardware evidence, signed plan, or external execution authority from which the aggregator could prove that a consistently rewritten `syntheticHardwareProfile` is truthful. P08 therefore does not claim to detect a fully self-consistent re-forgery at the public bundle boundary. That boundary is explicitly deferred to a future execution-authority/source-attestation contract; it is not silently treated as a hardware or performance release gate.

The protected cases are nevertheless fail-closed:

1. Flipping the plan flag while retaining the old canonical bytes/digest fails `verifyBuiltRunPlanV1`.
2. Supplying a receipt from another plan fails `PLAN_DIGEST_MISMATCH` in the Crosswalk.
3. Flipping the bundle flag without recomputing the normalized input digest fails `NORMALIZED_INPUT_DIGEST_MISMATCH` and produces no aggregate.
4. A test that rewrites the flag, plan identifier/digest, receipt plan digests, and manifest consistently demonstrates the remaining trust boundary: the current contract can only see internally consistent metadata and yields `eligible-measured`.

The fourth case is evidence for the boundary, not an accepted path for publishing a real claim.

## N05 status

| Point | Status | Resolution and source |
|---|---|---|
| Synthetic protection is a trusted metadata mark, not authenticity | `ACCEPTED` with explicit boundary | The existing v1 contract intentionally keeps synthetic inputs ineligible and rejects stale/foreign bindings. The absence of an independent execution authority is documented rather than hidden. Sources: `src/benchmark/aggregate/br04AggregateV1.ts` eligibility construction, `src/benchmark/aggregate/br04CrosswalkV1.ts:356-375`, `docs/benchmark/br04-fixes-r4.md:16,30-36`, and the P08 tamper tests in `tests/unit/benchmark/aggregate/br04-receipt-binding.test.ts`. Fully authenticated hardware provenance remains outside this package. |

## N06 method/source rest-point status

The list below preserves the historical open statements while giving each one an explicit P08 disposition. No unavailable owner decision is invented.

| Rest point | Status | Resolution / remaining boundary | Source |
|---|---|---|---|
| Full `CROSSWALK_V1` text and Research Synthesis / Decision Log were not supplied | `DEFERRED` | The implemented Crosswalk is inspected and tested, but the missing external owner/source pack is not reconstructed from code. | `docs/benchmark/aggregator-v1.md:106-107`; review `N06` |
| `WELTRAUM_ARCHITEKTUR_AUDIT_2026-09-06.md` unavailable | `DEFERRED` | The package documents the unavailable audit and does not claim audit-derived decisions that cannot be cited. | `docs/benchmark/aggregator-v1.md:108-109` |
| O2: accepted BR03 SHA as integration basis | `DEFERRED` | The current branch is based on the fetched integration SHA, and the contract checks format and cross-field equality. A separate owner freeze/decision record is still required before a release claim. | `docs/benchmark/aggregator-v1.md:110-112`; current `sourceContract.acceptedBr03Sha` checks |
| O4: product-wide Δ binding | `DEFERRED` | v1 retains per-metric delta display only; P08 does not invent a product-wide claim or change statistic semantics. | `docs/benchmark/aggregator-v1.md:110-112`; `src/benchmark/aggregate/br04CrosswalkV1.ts:19-25` |
| O5: gate minimum-cluster decision | `DEFERRED` | Existing v1 registry/3-and-5 rules remain package behavior, but no product-wide gate authority is asserted by P08. | `docs/benchmark/aggregator-v1.md:110-112` |
| BL-01: finer time-block tags below iteration level | `DEFERRED` | v1 intentionally resamples complete iterations and records `pairingKeySuffix`; no fine-grained time-block claim is made. | `docs/benchmark/aggregator-v1.md:113-115`; `docs/benchmark/br04-fixes-r2.md:27` |
| `aggregatorSourceDigest` is a method-label hash, not an implementation byte hash | `ACCEPTED` as the v1 contract boundary | The field is explicitly labeled as a method hash. It must not be presented as source-byte attestation; P08 leaves that distinction visible. | `docs/benchmark/aggregator-v1.md:136`; `src/benchmark/aggregate/br04AggregateV1.ts:773-790`; `docs/benchmark/br04-fixes-r2.md:18` |

## Remaining owner point

| Point | Status | Evidence and disposition |
|---|---|---|
| BR03 cumulative allowlist rejects the two new P08 Evidence paths | `REMAINING/OWNER` | `npm test` is `930/931`: all other tests pass, and only `tests/unit/benchmark/runner/br03-gate-allowlist-v1.test.ts` rejects `docs/benchmark/provenance-p08.md` and `docs/benchmark/provenance-p08.summary.json`. The required amendment belongs to a separate owner round. P08 deliberately leaves both the Unit-Allowlist and native Harness scope unchanged. |

## Evidence limits and non-goals

- This package does not authorize a real hardware/performance claim, the official BR03 gate, or a human release decision.
- The tests use deterministic synthetic fixtures; they prove the fail-closed binding behavior and the stated metadata trust boundary, not physical measurement authenticity.
- No `src/benchmark/aggregate` production code was changed for P08. The existing v1 contract already provides the claim classification and digest checks needed for the bounded evidence.
- The `REMAINING/OWNER` allowlist point is intentionally not repaired in this package; it requires the separate Owner-Amendment round.

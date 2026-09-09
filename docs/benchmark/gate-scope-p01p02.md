# P-LAB-P01P02 gate scope and phase eligibility evidence

## Scope and anchors

- Package: `P-LAB-P01P02`
- Base: `0937844d9576b3819f9e5d6b5678168eb09a4515` (`origin/integration/voxel-kernel-lab-v1`)
- Frozen gate reference: `e88978cbcd5504789a804fb25e353e08aaec1bd6`
- The frozen reference remains unchanged in both gate guards.
- The native final-gate harness remains selective: it accepts exact owner-authorized paths only; there is no `src/**` wildcard or guard bypass.

## P01 — cumulative gate scope

### Failing-first reproduction

Before the fix, the native and unit literals contained 50 and 81 paths respectively:

```text
nativeCount=50
unitCount=81
onlyInNative=[]
onlyInUnitCount=31
nativeControlAccepted(src/anything-new.ts)=false
```

The new drift regression was run before synchronizing the native set and failed with:

```text
BR03 cumulative gate allowlist > keeps the native and unit cumulative allowlists synchronized and selective
expected Set{ ... 49 } to deeply equal Set{ ... 80 }
```

This is the B01 reproduction without running the reserved `gate:br03` command. The native guard's current code path would reject a merged path such as `src/voxel/sparseChunkWorld.ts`, because that path was absent from its 50-entry set.

### Fix and regression

The native harness now contains the exact 31 paths already present in the owner-amended unit guard. The unit guard also includes the two explicit package evidence files. Both literal sets now contain 83 paths and are compared by the regression in `br03-gate-allowlist-v1.test.ts`.

The regression extracts the two exact `new Set([...])` literals, compares them as sets, and checks that `src/benchmark/contracts/unapproved.ts` and `src/anything-new.ts` remain rejected by both sets. This prevents drift and prevents replacing the selective scope with a broad prefix or wildcard.

### Legitimacy of the 31 inherited paths

Every path below is in `git diff --name-only e88978cbcd5504789a804fb25e353e08aaec1bd6 HEAD`; none is a newly invented scope expansion. The unit guard's owner-approved amendments (`a3e540c`, `be054ac`, and `4257b69`) recorded the BR04 evidence additions. The paths are adopted by the native guard because the merged integration tree already contains and exercises them.

| Path | Why it is legitimate |
| --- | --- |
| `docs/benchmark/aggregator-v1.md` | Merged BR04 aggregator contract and evidence documentation. |
| `docs/benchmark/br04-fixes-r2.md` | Owner-approved BR04 R2 fix/evidence record. |
| `docs/benchmark/br04-fixes-r2.summary.json` | Machine-readable BR04 R2 evidence summary. |
| `docs/benchmark/br04-fixes-r3.md` | Owner-approved BR04 R3 fix/evidence record. |
| `docs/benchmark/br04-fixes-r3.summary.json` | Machine-readable BR04 R3 evidence summary. |
| `docs/benchmark/br04-fixes-r4.md` | Owner-approved BR04 R4 fix/evidence record. |
| `docs/benchmark/br04-fixes-r4.summary.json` | Machine-readable BR04 R4 evidence summary. |
| `src/benchmark/aggregate/br04AggregateV1.ts` | Integrated BR04 aggregate implementation. |
| `src/benchmark/aggregate/br04ContractV1.ts` | Integrated BR04 aggregate contract types and boundaries. |
| `src/benchmark/aggregate/br04CrosswalkV1.ts` | Integrated BR04 source-to-aggregate crosswalk. |
| `src/benchmark/aggregate/br04StatisticsV1.ts` | Integrated BR04 statistic and bootstrap implementation. |
| `src/benchmark/reports/br04MarkdownReportV1.ts` | Integrated BR04 report rendering implementation. |
| `tests/fixtures/benchmark/aggregate/br04FixtureBuildersV1.ts` | BR04 fixture builders used by the merged aggregate tests. |
| `tests/fixtures/benchmark/aggregate/br04GoldenDigestsV1.ts` | BR04 golden digest fixtures used by the merged tests. |
| `tests/unit/benchmark/aggregate/br04-crosswalk.test.ts` | BR04 crosswalk regression. |
| `tests/unit/benchmark/aggregate/br04-effect-decision.test.ts` | BR04 effect-decision regression. |
| `tests/unit/benchmark/aggregate/br04-hierarchy-bootstrap.test.ts` | BR04 hierarchy/bootstrap regression. |
| `tests/unit/benchmark/aggregate/br04-markdown-report.test.ts` | BR04 report regression. |
| `tests/unit/benchmark/aggregate/br04-negative-golden.test.ts` | BR04 negative-case regression. |
| `tests/unit/benchmark/aggregate/br04-paired-golden.test.ts` | BR04 paired-comparison regression. |
| `tests/unit/benchmark/aggregate/br04-phase-capability-golden.test.ts` | BR04 phase/capability regression, including P02 coverage. |
| `tests/unit/benchmark/aggregate/br04-population-qualification.test.ts` | BR04 population qualification regression. |
| `tests/unit/benchmark/aggregate/br04-properties.test.ts` | BR04 aggregate property regression. |
| `tests/unit/benchmark/aggregate/br04-quantile-golden.test.ts` | BR04 quantile regression. |
| `tests/unit/benchmark/aggregate/br04-validation-ledger.test.ts` | BR04 validation-ledger regression. |
| `tests/unit/benchmark/aggregate/br04-ratio-minimum.test.ts` | BR04 ratio minimum regression. |
| `tests/unit/benchmark/aggregate/br04-ratio-seed-golden.test.ts` | BR04 ratio seed determinism regression. |
| `tests/unit/benchmark/aggregate/br04-receipt-binding.test.ts` | BR04 receipt-binding regression. |
| `tests/unit/benchmark/aggregate/br04-same-run-partition.test.ts` | BR04 same-run partition regression. |
| `src/voxel/sparseChunkWorld.ts` | Merged L1 voxel-world change explicitly carried by the cumulative gate scope. |
| `tests/unit/chunk-world.test.ts` | Unit regression for the merged L1 voxel-world change. |

The two package evidence files are also exact entries in both sets because this package is explicitly authorized to add them; they are not part of the 31 inherited differences.

### P01 test mapping

| Finding | Fix | Regression/evidence |
| --- | --- | --- |
| B01 native/unit cumulative allowlists drifted by 31 paths. | Copy the owner-authorized 31 exact paths into the native set; preserve `e88978c...`. | Set equality plus rejected controls in `br03-gate-allowlist-v1.test.ts`; pre-fix mismatch recorded above. |
| Future guard edits can drift again. | Keep both literal sets explicit and compare them in the unit guard. | Native-vs-unit equality regression fails on any missing or extra path. |
| Broadening the guard would hide scope errors. | Keep exact literals only. | `src/benchmark/contracts/unapproved.ts` and `src/anything-new.ts` remain absent. |

## P02 — phase eligibility before salvage

### Failing-first native bundle reproduction

The aggregate-level paired regression used a real `Br04AggregateInputBundleV1` built by `buildTestBundleV1`: both reference and candidate arms were `phase: "trace"`, both declared `capability-unsupported`, and their CPU values were 10 and 12. Before the fix, the CPU metric has no capability requirement, so the capability salvage branch returned `valid` before checking `allowedPhases`; the pair incorrectly became numeric:

```text
B02 trace-phase pair ...: expected complete=0, received 1
B02 applies phase eligibility ...: disallowed capability salvage expected trace-only, received valid
2 failed, 17 passed
```

The same reproduction is an absolute-path failure in the matrix case: a trace-phase CPU metric was published as an absolute numeric cell. The native bundle is never sent to `gate:br03`; this is an aggregate-native unit reproduction of the defect.

### Fix

`metricEligibilityForV1` now applies `metric.allowedPhases.includes(run.phase)` immediately after the non-salvageable base dispositions and before both metric-specific salvage branches:

- a disallowed phase is always `trace-only` for that metric;
- an allowed phase can still salvage a CPU metric when the declared issue is GPU-only (`gpu-disjoint` or an unsupported capability irrelevant to that CPU metric);
- GPU metrics remain `infrastructure-invalid` for an allowed-phase `gpu-disjoint` run and `capability-unsupported` for an allowed-phase missing GPU capability;
- the later duplicate phase check was removed, so absolute and paired paths use one boundary.

No statistics, ratio, bootstrap, receipt, comparison-basis, BR01, or BR02 code was changed.

### P02 regression mapping

| Case | Expected result | Regression |
| --- | --- | --- |
| Paired trace + capability-unsupported, CPU values 10/12 | `complete=0`, `incomplete=1`, no pair values or estimates | Native bundle repro in `br04-paired-golden.test.ts` |
| Measurement + capability-unsupported | CPU salvage remains `valid`; GPU is `capability-unsupported`; only CPU has an absolute cell | Phase/capability matrix in `br04-phase-capability-golden.test.ts` |
| Trace + capability-unsupported | CPU and GPU are `trace-only`; no absolute cells | Same matrix |
| Measurement + `gpu-disjoint` | CPU salvage remains `valid`; GPU is `infrastructure-invalid`; only CPU has an absolute cell | Same matrix |
| Trace + `gpu-disjoint` | CPU and GPU are `trace-only`; no absolute cells | Same matrix |

After the fix, the focused P02 run passed `19/19` tests across the paired and phase/capability suites.

### P02 test mapping

| Finding | Fix | Regression/evidence |
| --- | --- | --- |
| B02 capability/disjoint salvage bypassed metric phase eligibility. | Make `allowedPhases` a mandatory common gate before salvage. | Trace pair and phase × capability × disjoint matrix. |
| Allowed CPU salvage must remain usable. | Keep the existing metric-specific salvage branches after the phase gate. | Measurement capability and GPU-disjoint matrix rows publish CPU only. |
| Absolute and paired paths disagreed. | Both consume the same `metricEligibilityForV1` result; remove the duplicate later phase check. | Matrix checks absolute cells; paired trace repro checks complete/incomplete pair state. |

## Package evidence status

P01 and P02 are closed in this worktree. The official `gate:br03` run was intentionally not executed because it is reserved and explicitly out of scope; the requested `npm test`, `benchmark:aggregate:verify`, and TypeScript checks remain the final verification steps.

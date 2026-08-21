# Benchmark Runner v1

BR03 provides a deterministic Node CLI over the accepted BR01 contracts and BR02 browser telemetry. It creates plans and raw correctness artifacts; it does not aggregate results, decide performance gates, modify product evidence, retry failed slots, or claim H1/H2/H3 performance.

## Commands

Build the runner before using its commands:

```text
npm run build:runner
```

Create a canonical plan from a closed JSON input:

```text
npm run benchmark:plan -- --input <plan-input.json> --output <plan.json>
```

Run the synthetic contract integration, which is the only BR03 path allowed to create a positive BR01 validation receipt:

```text
npm run benchmark:run -- --plan <plan.json> --mode synthetic-contract-v1 --slot-index 0 --created-utc <UTC> --output-root .benchmark-results
```

Run the real browser lifecycle smoke:

```text
npm run benchmark:run -- --plan <plan.json> --mode lifecycle-smoke-v1 --slot-index <index> --created-utc <UTC> --output-root .benchmark-results --preflight <preflight.json>
```

Verify a closed invocation without starting a browser or repairing files:

```text
npm run benchmark:verify -- --plan <plan.json> --invocation-root <invocation-directory>
```

All CLI options use separate `--name value` pairs. Unknown, duplicate, missing, inline-`=` or mode-incompatible options fail closed. The runner performs no automatic retry.

## Live boundary

`lifecycle-smoke-v1` is deliberately narrower than a performance campaign. It accepts only process ordinal zero of a planned cold `mesh-golden-world-v1` cell with the fixed BR03 route contract. The runner:

1. calls BR01 `sourcePreflightV1` against the exact clean repository, source commit, fixture semantics and selected candidate binding;
2. requires the observed build digest to equal the plan and calls `verifyBuildHandoffV1` immediately before preview startup;
3. starts one exclusive loopback Vite preview over that verified `dist/`;
4. starts one persistent Chromium context with a fresh owned profile;
5. opens a browser-wide CDP session and records observed host, browser, GPU, capability and runtime availability without inventing unknown values;
6. drives the real BR02 start, complete, advance, seal and download controls;
7. preserves the exact canonical BR02 download, the ineligible assembled run and the environment snapshot in a digest-bound diagnostic closure;
8. closes the context and browser, proves the Playwright browser connection ended, removes only the owned profile, closes only the owned preview, and repeats source/build preflight after cleanup.

The live slot remains `unsupported` for measurement because the accepted integration has no required live metric producers. It never receives a positive receipt or performance eligibility. Every other planned slot receives an explicit terminal result. Other BR01 scenarios remain unavailable until their owner-bound route, producer and fixture contracts exist.

## Preflight file

The preflight file is canonical JSON with this closed top-level shape:

```json
{
  "candidates": [{ "binding": {}, "id": "candidate-id" }],
  "fixture": {},
  "fixtureSemanticPath": "repository/relative/fixture-semantic.json",
  "schemaVersion": "br03-lifecycle-smoke-preflight-v1"
}
```

`fixture` is the accepted BR01 `BenchmarkFixtureContractBindingV1`; each candidate `binding` is a `BenchmarkCandidateBindingV1`. IDs and observed semantic/fileset digests must match the accepted plan. BR01 performs the authoritative closed-shape, Git-object, exact-case path, fileset and clean-tree validation. A dirty checkout, mismatched commit, changed build, unavailable fixture binding or changed candidate source stops before browser startup.

## Determinism and phases

The plan digest covers deterministic inputs only: source/build/fixture/profile bindings, browser contract, seed, candidates, scenarios, phase requirements, counterbalance rows and concrete BR03-owned orchestration IDs. Timestamps, output paths, ports, OS PIDs and temporary paths exist only in the invocation.

Cold slots use a fresh process and profile. Warm-measurement plans reserve up to 50 one-iteration warmup runs and a separate measurement run; `WarmupControllerV1` delegates stability recomputation to the BR01 rule and rejects instability at 50. No currently live scenario is allowed to execute that path, so the CLI does not fabricate warmup values or silently promote lifecycle-smoke data. Trace and leak remain separate unavailable containers.

## Artifacts

Each invocation root is created exclusively under `.benchmark-results/<invocation-id>/` and contains canonical plan, invocation and terminal process-unit results plus closed bundle and lifecycle-smoke directories. Files are written with create-new semantics. Paths are confined to the invocation root.

Synthetic success writes a BR01 bundle with exactly one raw run, BR02 export and BR01 receipt closure per logical run. Assembly and receipt derivation share a single-pass adapter session, so the accepted BR02 adapter executes once per target iteration while BR01 still independently checks the cached derivation.

Synthetic contract mode is a local BR01/BR02 contract integration and emits a `diagnostic` bundle. It requires the verified repository worktree to be clean. Its BR01-required source worktree fields, build file counts, and commit/build bindings are contract placeholders or plan declarations, not observations; fixture and candidate digests are declared, and the synthetic executable digest is unavailable. Before minting its receipt, synthetic mode verifies the working validator files against the expected commit and supplies the exact committed blob bytes to the receipt; only lifecycle smoke performs the broader authoritative source/build preflight before browser startup.

Live lifecycle smoke writes `environment.json`, `run.json`, the exact `telemetry-export.json`, and a canonical manifest binding each file's byte length and SHA-256. `benchmark:verify` rejects missing, extra, changed, noncanonical, unmanifested or mismatched control, bundle and lifecycle files.

The built CLI embeds the clean Git commit used by `build:runner`; a dirty or unresolvable source tree receives a non-commit build stamp and run modes reject it for a source-commit plan. The CLI also attests the exact bytes of `.benchmark-runner/runner.mjs`; run modes reject a plan whose expected source commit differs from that build stamp, and `benchmark:verify` accepts invocations created by that built runner. Direct source-module calls used by tests attest the loaded source module and are not CLI-verifiable.

Bundle files and validation contexts are staged and published in order. An interrupted publication leaves an incomplete invocation that verification rejects; the runner never repairs or adopts such leftovers.

An identical rerun without a distinct attempt identity is rejected by the create-new invocation root and is classified as infrastructure failure (`4`); the v1 CLI does not expose the approved rerun metadata path.

## Failure and cleanup

Process results use the closed BR03 disposition, failure-class and failure-code taxonomy. Hard preflight and handoff errors do not trigger replacement slots. `SIGINT`, `SIGTERM`, uncaught exceptions and unhandled rejections converge on the same idempotent cleanup guard. A cleanup failure stops the invocation and profile deletion occurs only after browser closure. The runner never scans for, adopts, kills or removes unrelated processes, ports, profiles or directories.

## Exit codes

`0` is success; `2` is invalid CLI or plan input, including a slot that is outside the selected mode's fixed route contract; `3` is source/provenance or verification failure; `4` is runner infrastructure or timeout failure; `5` is candidate/browser/handoff/receipt or operator-abort failure; `6` is environment failure; `7` is an explicit unsupported result (including a completed lifecycle smoke with retained diagnostic artifacts); `8` is cleanup or ownership failure.

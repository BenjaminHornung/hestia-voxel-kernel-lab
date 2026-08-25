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

The plan input itself must be canonical RFC 8785 JCS JSON; pretty-printed or otherwise byte-noncanonical JSON is rejected rather than normalized.

Run the synthetic contract integration, which is the only BR03 path allowed to create a positive BR01 validation receipt:

```text
npm run benchmark:run -- --plan <plan.json> --mode synthetic-contract-v1 --slot-index 0 --created-utc <UTC> --output-root .benchmark-results --preflight <synthetic-preflight.json>
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

Plan input binds comparison direction with `comparisonMode: "reference-paired"` plus a selected `referenceCandidateId`, or uses `comparisonMode: "unpaired-only"` with `referenceCandidateId: null` for three-or-more-candidate order-only plans. Two-candidate plans always use explicit reference pairing. Every reference-paired `pairCellId` contains exactly one reference and one distinct comparison arm with one shared pair ordinal; N-way Williams rows control order but are never represented as N-member pair cells. Unpaired-only plans use one technical singleton cell per arm. `balanceBlockId` is explicit on both the balance block and every process unit, while every browser process retains its own bootstrap cluster.

The scenario `seed` parameter participates in deterministic scenario/candidate ordering and orchestration IDs in addition to the plan digest. Process counts and warm-measurement iteration counts must remain non-negative safe integers even when their phase is disabled; `enabled` controls execution, not schema validity.

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

The lifecycle preflight file is canonical JSON with this closed top-level shape:

```json
{
  "candidates": [{ "binding": {}, "id": "candidate-id" }],
  "fixture": {},
  "fixtureSemanticPath": "repository/relative/fixture-semantic.json",
  "schemaVersion": "br03-lifecycle-smoke-preflight-v1"
}
```

`fixture` is the accepted BR01 `BenchmarkFixtureContractBindingV1`; each candidate `binding` is a `BenchmarkCandidateBindingV1`. IDs and observed semantic/fileset digests must match the accepted plan. BR01 performs the authoritative closed-shape, Git-object, exact-case path, fileset and clean-tree validation. A dirty checkout, mismatched commit, changed build, unavailable fixture binding or changed candidate source stops before browser startup.

Synthetic contract mode requires a separate canonical control with this closed top-level shape:

```json
{
  "candidates": [{ "binding": {}, "id": "candidate-id" }],
  "schemaVersion": "br03-synthetic-contract-preflight-v1"
}
```

The synthetic control contains every planned candidate exactly once. Its candidate bindings are checked against the plan, then BR01 `sourcePreflightV1` and `verifyBuildHandoffV1` run for every candidate. The fixture is not caller-supplied: synthetic mode derives the authoritative `wp04-golden-world-v1` binding and canonical semantic bytes from BR01 and requires the exact `mesh-golden-world-v1` WP04 tuple (`seed=0x48455354`, `three-webgl2`, `greedy-ao`, chunk edge `32`, worker count `0`).

## Determinism and phases

The plan digest covers deterministic inputs only: source/build/fixture/profile bindings, browser contract, seed, candidates, scenarios, phase requirements, counterbalance rows and concrete BR03-owned orchestration IDs. Timestamps, output paths, ports, OS PIDs and temporary paths exist only in the invocation.

Cold slots use a fresh process and profile. Warm-measurement plans allow a deterministic maximum of 50 one-iteration warmup runs; `WarmupControllerV1` delegates stability recomputation to the BR01 rule and rejects instability at 50. No currently live scenario is allowed to execute that path, so the CLI does not fabricate warmup values or silently promote lifecycle-smoke data. Trace and leak remain separate unavailable containers.

Warm-measurement invocation units do not predeclare 50 phantom runs. `AdaptiveWarmupControllerV1` allocates one warmup run and its iteration/sample identities only when execution starts, accepts exactly one BR02-adapted control sample, and calls BR01 `recomputeWarmupStabilityV1` after each completion. It allocates measurement only at the first accepted stable boundary, retains exact evidence, and becomes invalid without a measurement at 50. Only allocated runs belong in terminal results and BR01 documents.

No current BR03 ScenarioDriver reaches this adaptive path. Before a future driver enables it, that driver must wire the controller's executed-run IDs into both ledger construction and CLI verification, persist its warmup evidence, and bind the exact sample IDs into the assembled BR01 runs. Until then, warm-measurement data is neither fabricated nor treated as a valid result.

## Artifacts

Each invocation root is created exclusively under `.benchmark-results/<invocation-id>/` and contains canonical plan, invocation and terminal process-unit results plus closed bundle, lifecycle-smoke and failure-diagnostic directories. Final files are first written and synced under unique staging names, then atomically hard-linked with no-replace semantics; a duplicate publication fails without changing prior bytes. POSIX parent directories are synced after publication. `invocation-closure.json` is the publish-last terminal record. It binds the exact plan, persisted invocation, selected and missing-slot derivation, terminal dispositions (including unsupported, failed, invalid and aborted), runner bundle identity, and every referenced bundle, lifecycle or diagnostic file by path, length, role and digest. An invocation without that complete immutable closure is neither verifiable nor an eligible rerun predecessor; BR04 consumes the closure references rather than discovering directories by name or timestamp. Output and profile roots are confined to the exact runner-owned result tree, and symbolic-link or junction aliases are rejected.

Synthetic success writes a BR01 bundle with exactly one raw run, BR02 export and BR01 receipt closure per logical run. Assembly and receipt derivation share a single-pass adapter session, so the accepted BR02 adapter executes once per target iteration while BR01 still independently checks the cached derivation.

Synthetic contract mode is a local BR01/BR02 contract integration and emits a `diagnostic` bundle. It requires a clean verified repository and uses the real current source commit, tree, candidate fileset and built `dist` facts observed by BR01 preflight. It mints exactly one receipt using the dynamically enumerated validator attestation set: every regular Git blob under `src/benchmark/contracts/**` and `src/benchmark/provenance/**` at fixed commit `e88978cbcd5504789a804fb25e353e08aaec1bd6`, with exact committed bytes supplied to BR01. The synthetic environment is deliberately declared and the run has exactly one `environment-incomplete` reason; this is schema/integrity evidence only, never a performance claim. Source/build preflight and validator closure are repeated before publication and must be byte/digest stable.

Live lifecycle smoke writes `environment.json`, `run.json`, the exact `telemetry-export.json`, and a canonical manifest binding each file's byte length and SHA-256. Its noncanonical ownership receipt records the actual loopback host/port, expected and observed build-health digest, exact launched executable name/digest, sanitized `Browser.getVersion` fields and typed CDP probe outcomes with sanitized response digests. Missing, unsupported, errored, blocked and permission-denied probes remain distinct and never become inferred capability support. `benchmark:verify` rejects missing, extra, changed, noncanonical, unmanifested or mismatched control, bundle and lifecycle files.

The built CLI can only be produced from a resolvable clean Git worktree; the build fails before output mutation for dirty/unresolvable input and rechecks the commit/status after bundling. Runtime authority requires the embedded exact source commit, the bounded SHA-256 of the complete `.benchmark-runner/runner.mjs`, and realpath identity with `<resolved Git root>/.benchmark-runner/runner.mjs`. `run` and `verify` receive a private runtime-branded authority, so direct source-module calls cannot create CLI-verifiable artifacts or receipts; a bundle from checkout X invoked with checkout Y is rejected before invocation creation. The runner SHA is a consistency binding to the current build and checkout, not an external code-signing trust anchor.

Bundle files and validation contexts are staged and published in order, with the immutable validation context published only after the final bundle file set. An interrupted publication leaves an incomplete invocation that verification rejects; the runner never repairs or adopts such leftovers.

An identical attempt-0 execution is rejected by the create-new invocation root and is classified as infrastructure failure (`4`).

Attempt-0 identity is derived only from the plan digest, the canonical selected-slot set, and attempt `0`; timestamps, output spelling, and runner paths cannot create another initial identity. A later attempt uses `--attempt <n> --approval-id <id> --replaces-invocation-root <root>`. The predecessor must already have a complete immutable terminal control, use the same plan and selected slots, and be exactly attempt `n-1`. Each produced BR01 run then carries `origin.kind: "infrastructure-rerun"`, the approval ID, and the exact replaced predecessor run ID. The runner never retries automatically.

A valid slot whose ScenarioDriver is unavailable still creates an immutable invocation and one terminal `unsupported / scenario-unavailable` process-unit result, then exits `7`; it does not start preview or browser work.

## Failure and cleanup

Process results use the closed BR03 disposition, failure-class and failure-code taxonomy. Hard preflight and handoff errors do not trigger replacement slots. Failure diagnostics retain only typed stage, native type/code, timeout owner, exit/signal, cleanup state and a cause-chain digest; private paths, usernames, unrestricted flags and free-form exception text are excluded. `SIGINT`, `SIGTERM`, uncaught exceptions and unhandled rejections converge on the same idempotent cleanup guard, and the immutable closure is the only terminal linearization point. The runner owns one exact non-shell Playwright browser child, waits for startup and child exit even after timeout or signal, and deletes its profile only after exit proof. A cleanup state other than `complete` blocks success. Preview uses a dynamic exclusive loopback port, verifies the exact built `index.html` digest, and is raced against Handoff execution. The runner never scans for, adopts, kills or removes unrelated processes, ports, profiles or directories.

Pure Node does not expose directory-descriptor-relative no-follow publication on Windows or POSIX, nor Windows Job objects. The runner therefore rejects static realpath/junction substitution and publishes through an atomic hard link, but a hostile process already able to mutate the private results tree retains a narrow parent-swap race. Catchable signals and late startup are fully supervised; uncatchable termination such as SIGKILL, process termination by the operating system, or power loss cannot provide child-tree cleanup proof. Such invocations have no trusted terminal closure and remain unverifiable.

## BR03 final gates

`npm run gate:br03` runs the final matrix once from a clean candidate worktree. It performs the clean dependency install, focused and complete tests, all three builds, the complete Playwright suite, dependency inspection and diff check without invoking Evidence scripts or a real performance benchmark. The built-runner E2E invokes the exact `.benchmark-runner/runner.mjs` through plan, synthetic run, verify, unsupported lifecycle, invalid input, duplicate attempt, approved rerun, externally owned timeout, SIGINT, SIGTERM, injected cleanup failure and tamper cases. Its real-Git candidate clone installs dependencies normally; it never adds a `node_modules` link.

Candidate-bound plan and preflight controls are generated under the test's external temporary directory. Committed generic fixtures are unit-test inputs only and are not positive built-runner evidence. The clone's full porcelain-v2 status is checked before build and immediately before each lifecycle group. The live closure binds the actual dynamic loopback port, and the test proves that port and `.benchmark-results/.profiles/<invocation-id>` are released after cleanup.

Each final command writes one no-replace diagnostic receipt below `.benchmark-results/gate-receipts/<candidate-sha>/`; built-runner subcommands write receipts in Playwright `test-results`. Receipts contain argv, hashed cwd identity, ref/tree, tool versions, exit/signal, output digests, inner/outer timeout ownership, before/after Git and ignored-artifact state, exact child liveness, profile/port observations and a closed classification. They contain no raw command output and are never project Evidence. Playwright retries remain disabled; a failed final matrix is reported from its first receipt and is not retried to green.

## Exit codes

`0` is success; `2` is invalid CLI or plan input, including a slot that is outside the selected mode's fixed route contract; `3` is source/provenance or verification failure; `4` is runner infrastructure or timeout failure; `5` is candidate/browser/handoff/receipt or operator-abort failure; `6` is environment failure; `7` is an explicit unsupported result (including a completed lifecycle smoke with retained diagnostic artifacts); `8` is cleanup or ownership failure.

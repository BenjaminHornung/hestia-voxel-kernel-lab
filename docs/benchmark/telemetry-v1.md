# BR02 Browser Telemetry v1

BR02 is an opt-in browser capture layer for the existing voxel lab. The
ordinary production graph does not import the handoff or collector and does
not create telemetry DOM or global state. The benchmark graph is activated
only by the literal `import.meta.env.MODE === 'benchmark'` gate.

## Wire handoff

The only query key is `br02Telemetry`. Its value is unpadded base64url of the
canonical UTF-8 JSON envelope below. Canonical JSON uses the Slice-1
`canonicalizeJsonV1` serializer; duplicate object keys are rejected before
the closed envelope validator runs.

```json
{
  "backend": "three-webgl2",
  "contractId": "br-02-browser-telemetry-handoff-v1",
  "iterations": [{"iterationId":"iteration-0","iterationOrdinal":0}],
  "phase": "measurement",
  "planId": "plan-id",
  "runId": "run-id",
  "runtimeActivation": "br02-browser-telemetry-enabled-v1",
  "scenarioId": "backend-fixture-v1",
  "schemaVersion": 1,
  "telemetryMode": "telemetry-enabled-minimal"
}
```

The envelope is closed: its exact keys are `schemaVersion`, `contractId`,
`runtimeActivation`, `runId`, `planId`, `scenarioId`, `phase`, `backend`,
`telemetryMode`, and `iterations`. IDs, phases, scenarios, and backend cells
use BR01 domains. Iterations are non-empty, unique, and ordered exactly
`0..n-1`. The limits are 65,536 encoded UTF-16 code units, 49,152 decoded
UTF-8 bytes, 256 iterations, 16 realms, and 64 capability metadata entries.
Padding, `+`, `/`, invalid base64url length, invalid UTF-8, noncanonical JSON,
unknown keys, missing keys, foreign prototypes, accessors, and duplicate
iteration ordinals fail closed.

This base accepts `three-webgl2` only for scenarios declaring a BR01 backend
parameter. A scenario without that parameter must use `not-applicable`.
`raw-webgpu` is bootstrap-invalid: this base has a WebGL2 renderer and never
allows a raw WebGPU scenario to reach a collector or scene.

## Owners and boundaries

The eight BR02 telemetry contract owners are:

1. `run.total`
2. `worker.mesh-cpu`
3. `mesh.quads`
4. `mesh.output-bytes`
5. `coverage.sha256-match`
6. `browser.long-task`
7. `draw-submit.cpu`
8. `browser.raf-interval`

Five producer boundaries remain runtime-inactive in this startup slice:
`run.total`, `worker.mesh-cpu`, `mesh.quads`, `mesh.output-bytes`, and
`coverage.sha256-match`. They have deterministic fake collector APIs for
contract tests, but startup does not pretend that fixture, worker, mesher,
geometry, or SHA work occurred. There is no Worker, scheduler, runner,
authority, digest, or relabeling path in BR02.

The real startup producers are `draw-submit.cpu` around the actual
`renderer.render(scene, camera)` call and `browser.raf-interval` from native
successive rAF timestamps. Full mode can additionally emit `browser.long-task`
and diagnostic-only `browser.event-timing` records from separate observers.
Context and invalidation records are not performance samples.

The browser export remains the BR02 telemetry export. The only BR01 conversion
boundary is `telemetryExportV1ToBenchmarkRawSampleV1` in the adapter. It
validates the frozen BR01 registry and reachability matrix, then projects raw
sample fields and bytes without aggregation, rounding, percentile calculation,
or value rewriting. Node-side BR01 provenance, schema, and authority remain
outside the browser graph.

The frozen BR01 adapter context has no `planId`, `scenarioId`, or `backend`.
BR02 validates those export fields and their exact reachability cells, but it
cannot prove target-run equality; Node/BR01 receipt authority must bind those
values later. This is an accepted frozen-boundary limitation, not a BR01
change.

## Reachability and dimensions

Capability IDs are derived only from the selected BR01 scenario capability
contracts, backend capability selections, and the exact scenario/phase/backend
reachability cells. The list is sorted by BR01 UTF-16 ordering. Observed
availability requires an actual browser probe or source; declared values are
configuration metadata; unavailable values are `null` with a reason and are
never emitted as numeric zero samples.

The current WebGL2 probe uses the existing `[data-testid="voxel-canvas"]`
before fixture or scene construction. The renderer reuses the browser's
WebGL2 context. Exact producer gating is by one matching BR01 reachability
cell with `disposition: "emit-sample"`; otherwise that producer emits no
sample. Full mode does not become invalid merely because `browser.long-task`
is not an exact producer in the selected cell: unreachable long-task entries
are drained without a sample. An installed active Full observer still
requires its own drop accounting, and missing or positive accounting can
invalidate the capture. Raw WebGPU is never a reachability option in this
base.

`browser.raf-interval` uses the native callback timestamp unchanged and a
time-block ordinal dimension. Long-task and event records use their native
`startTime` and `duration` unchanged. Delayed or out-of-order source times do
not regress the manual clock. The adapter owns conversion of raw telemetry
bytes into BR01 samples and preserves those source values.

## Lifecycle and loss handling

The handoff state is closed: `disabled -> initializing -> ready -> running ->
sealed`, with terminal `invalid`. A sealed or invalid capture never becomes
ready again. The handoff is not a runner or authority and never starts or
stops a scene.

The runtime-inserted BR02 region is placed before the existing HUD `<dl>` and
uses the existing button and focus styles. It exposes a read-only current
iteration `<output>`, a fixed contract/version/state/reason status, and
buttons for starting the current iteration, completing it, advancing only to
the next declared ordinal, sealing, and exporting. Starting binds exactly the
current iteration. Completion drains observer queues while that binding is
still active; the final iteration may complete and seal atomically.

The Slice-1 monotonic clock uses `performance.timeOrigin + performance.now()`
for manual markers. Each manual marker reads `performance.now()` once. Native
observer timestamps never update the manual-clock regression baseline.
Visibility and focus are context-only at initialization and on change, but a
hidden or unfocused document while running invalidates with the existing BR01
`document-hidden` or `document-unfocused` reason.

Full mode checks `PerformanceObserver` and `supportedEntryTypes` separately
for `longtask` and `event`, and catches construction and observe failures.
`takeRecords()` is called before disconnecting. The optional callback
`droppedEntriesCount` must be finite, non-negative, and safe; a positive count
is loss, while each active Full observer without accounting is
`not-reported`/`null` and invalidates with
`br02-observer-drop-accounting-unavailable`. Unsupported or inactive sources
produce no numeric sample, no numeric observer-drop count, and no invented
zero.

Clock, buffer, capability, observer, WebGL context, and WebGPU device loss
fail closed using existing BR01 reasons and the fixed BR02 detail codes. A
deliberate renderer `forceContextLoss()` during disposal is not reported as a
capture loss because the listener is removed first.

## Seal and download

The bounded append-only buffer is not serialized during measurement. After
seal, export serialization is queued with a later task, canonicalized through
the Slice-1 serializer, and limited to 17 MiB. Delivery creates a real
`Blob`, object URL, and anchor download. Delivery attempts, object URLs, and
failure state are outside the sealed payload; a failed attempt does not open
or mutate the buffer, and repeated serialization returns identical bytes.
No target, selector, text, key, pointer, URL, container, path, stack, or free
error message is exported.

## Authority and later work

BR01 owns the frozen plan, scenario definition, capability contracts,
reachability matrix, backend cell, and raw-sample contract. BR02 binds its
capture to the supplied run/plan/scenario/phase/backend values and does not
derive IDs from time, randomness, DOM order, URL order, or renderer state.
The Node/BR01 adapter and provenance authority remain the boundary for
downstream conversion and validation.

Later BR03 work may add observation/control orchestration, runner-owned
iteration scheduling, browser-process identity, and external authority
bindings. Those controls are deliberately absent from this BR02 startup UI
and collector.

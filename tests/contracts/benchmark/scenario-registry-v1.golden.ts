export const BENCHMARK_SCENARIO_IDS_V1 = [
  'mesh-golden-world-v1',
  'mesh-density-sweep-v1',
  'scheduler-steady-v1',
  'scheduler-burst-v1',
  'brush-stress-v1',
  'navigation-leak-v1',
  'backend-fixture-v1',
] as const;

export const BENCHMARK_SCENARIO_DEFINITION_DIGESTS_V1 = {
  'mesh-golden-world-v1': 'sha256:dcad15580873fde5f320d07c79551cfc239752cb5fc349ba78e43d300895cb60',
  'mesh-density-sweep-v1': 'sha256:60d186056c36b2856605a0946bdfa87f96aba811ec96d9551f1dd4e4b6a86b15',
  'scheduler-steady-v1': 'sha256:c72eab34e7bd5096814d73fa5265acf00a6d8f4ec14f56973e4d6b6c6c8b8414',
  'scheduler-burst-v1': 'sha256:292074e871da67b1c2ebb1a5afd33eeea5b589f9e759e582e56a17ce798d9818',
  'brush-stress-v1': 'sha256:9dde69ef8e6135290dfb3425ec548f953330f29f3f9a61c668e01f9e4946cf20',
  'navigation-leak-v1': 'sha256:972c9ca6886f027e0c6614c93234c28e24ba50e109adee18a0c861eeba578ff6',
  'backend-fixture-v1': 'sha256:ae142329c74c5c3713b1069ed982d4d35fd23f7aaef7378f9528db692adc92dc',
} as const;

export const BENCHMARK_WP04_SEMANTIC_SHA256_GOLDEN_V1 = 'sha256:6481f4b81631c6bbed5560970f92aa82e51de77a233ec40d919dbbf765f99b44';

export const BENCHMARK_SCENARIO_METRIC_CAPABILITY_SELECTION_GOLDENS_V1 = [
  {
    scenarioId: 'backend-fixture-v1',
    metricRef: 'gpu.time.ms@1',
    parameterKey: 'backend',
    selections: [
      { parameterValue: 'raw-webgpu', capabilityId: 'webgpu-timestamp-query' },
      { parameterValue: 'three-webgl2', capabilityId: 'webgl-disjoint-timer-query' },
    ],
  },
] as const;

export const BENCHMARK_UTF16_ORDER_GOLDENS_V1 = [
  ['metric@10', 'metric@2', -1],
  ['metric@2', 'metric@10', 1],
  ['a!', 'a#', -1],
  ['a0', 'a9', -1],
] as const;

const emit = (recordName: string, metricRef: string, unit: string): string => `${recordName}|emit-sample|${metricRef}|${unit}`;
const diagnostic = (recordName: string): string => `${recordName}|diagnostic-only`;

export const BENCHMARK_METRIC_REGISTRY_GOLDENS_V1 = {
  'world.mesh.total.ms@1': {
    kind: 'duration', unit: 'ms', sourceMapping: [diagnostic('run.total')],
    groupingKeys: ['hardware-profile', 'phase', 'candidate', 'iteration-ordinal'],
    population: 'one non-overlapping end-to-end world mesh critical path per iteration',
    pairingKeys: ['bootstrap-cluster-id', 'iteration-ordinal'], pairingLevel: 'iteration', direction: 'lower', practicalEffectDelta: 0.10,
  },
  'chunk.mesh.cpu.ms@1': {
    kind: 'duration', unit: 'ms', sourceMapping: [emit('worker.mesh-cpu', 'chunk.mesh.cpu.ms@1', 'ms'), diagnostic('mesh.cpu')],
    groupingKeys: ['hardware-profile', 'phase', 'candidate', 'iteration-ordinal', 'chunk-key'],
    population: 'pure mesher CPU duration for one identified chunk',
    pairingKeys: ['bootstrap-cluster-id', 'iteration-ordinal', 'chunk-key'], pairingLevel: 'event', direction: 'lower', practicalEffectDelta: 0.10,
  },
  'snapshot.halo.build.ms@1': {
    kind: 'duration', unit: 'ms', sourceMapping: [emit('snapshot.build', 'snapshot.halo.build.ms@1', 'ms')],
    groupingKeys: ['hardware-profile', 'phase', 'candidate', 'iteration-ordinal', 'chunk-key'],
    population: 'build duration for one identified immutable snapshot or halo',
    pairingKeys: ['bootstrap-cluster-id', 'iteration-ordinal', 'chunk-key'], pairingLevel: 'event', direction: 'lower', practicalEffectDelta: 0.10,
  },
  'scheduler.queue.wait.ms@1': {
    kind: 'duration', unit: 'ms', sourceMapping: [emit('scheduler.queue-wait', 'scheduler.queue.wait.ms@1', 'ms')],
    groupingKeys: ['hardware-profile', 'phase', 'candidate', 'operation-ordinal', 'operation-semantic-key'],
    population: 'main-thread admission until dispatch of one scheduler operation',
    pairingKeys: ['bootstrap-cluster-id', 'operation-ordinal', 'operation-semantic-key'], pairingLevel: 'event', direction: 'lower', practicalEffectDelta: 0.10,
  },
  'worker.total.ms@1': {
    kind: 'duration', unit: 'ms', sourceMapping: [diagnostic('worker.validation')],
    groupingKeys: ['hardware-profile', 'phase', 'candidate', 'operation-ordinal', 'operation-semantic-key'],
    population: 'worker receive, validation, compute, serialize, and post duration for one operation',
    pairingKeys: ['bootstrap-cluster-id', 'operation-ordinal', 'operation-semantic-key'], pairingLevel: 'event', direction: 'lower', practicalEffectDelta: 0.10,
  },
  'adoption.cpu.ms@1': {
    kind: 'duration', unit: 'ms', sourceMapping: [emit('result.adoption', 'adoption.cpu.ms@1', 'ms')],
    groupingKeys: ['hardware-profile', 'phase', 'candidate', 'operation-ordinal', 'operation-semantic-key'],
    population: 'main-thread receive, validation, stale-check, and buffer adoption duration for one operation',
    pairingKeys: ['bootstrap-cluster-id', 'operation-ordinal', 'operation-semantic-key'], pairingLevel: 'event', direction: 'lower', practicalEffectDelta: 0.10,
  },
  'input.revision.submit.ms@1': {
    kind: 'duration', unit: 'ms', sourceMapping: [emit('input-to-revision-submit', 'input.revision.submit.ms@1', 'ms')],
    groupingKeys: ['hardware-profile', 'phase', 'candidate', 'input-ordinal', 'expected-world-revision'],
    population: 'trusted input start until draw submit of the expected world revision',
    pairingKeys: ['bootstrap-cluster-id', 'input-ordinal', 'expected-world-revision'], pairingLevel: 'event', direction: 'lower', practicalEffectDelta: 0.10,
  },
  'raf.interval.ms@1': {
    kind: 'frame', unit: 'ms', sourceMapping: [emit('browser.raf-interval', 'raf.interval.ms@1', 'ms')],
    groupingKeys: ['hardware-profile', 'phase', 'candidate', 'time-block-ordinal'],
    population: 'distance between consecutive requestAnimationFrame callbacks in one measurement block',
    pairingKeys: ['bootstrap-cluster-id', 'time-block-ordinal'], pairingLevel: 'time-block', direction: 'context-dependent', practicalEffectDelta: null,
  },
  'longtask.duration.ms@1': {
    kind: 'long-task', unit: 'ms', sourceMapping: [emit('browser.long-task', 'longtask.duration.ms@1', 'ms')],
    groupingKeys: ['hardware-profile', 'phase', 'candidate', 'time-block-ordinal'],
    population: 'duration of each browser long task reported at or above 50 ms',
    pairingKeys: ['bootstrap-cluster-id', 'time-block-ordinal'], pairingLevel: 'time-block', direction: 'lower', practicalEffectDelta: 0.10,
  },
  'longtask.count@1': {
    kind: 'counter', unit: 'count', sourceMapping: [diagnostic('telemetry.invalidation')],
    groupingKeys: ['hardware-profile', 'phase', 'candidate', 'observation-window-id'],
    population: 'number of browser long-task entries in a predefined measurement window',
    pairingKeys: ['bootstrap-cluster-id', 'observation-window-id'], pairingLevel: 'window', direction: 'lower', practicalEffectDelta: null,
  },
  'memory.bytes@1': {
    kind: 'memory', unit: 'bytes', sourceMapping: [diagnostic('telemetry.charged-bytes')],
    groupingKeys: ['hardware-profile', 'phase', 'candidate', 'memory-kind', 'checkpoint-id'],
    population: 'memory bytes for one explicitly named memory kind at one checkpoint',
    pairingKeys: ['bootstrap-cluster-id', 'memory-kind', 'checkpoint-id'], pairingLevel: 'run', direction: 'lower', practicalEffectDelta: 0.10,
  },
  'gpu.time.ms@1': {
    kind: 'gpu', unit: 'ms', sourceMapping: [diagnostic('telemetry.invalidation')],
    groupingKeys: ['hardware-profile', 'phase', 'candidate', 'render-pass-id', 'frame-block-ordinal'],
    population: 'asynchronously measured GPU duration for one declared render pass and frame block',
    pairingKeys: ['bootstrap-cluster-id', 'render-pass-id', 'frame-block-ordinal'], pairingLevel: 'time-block', direction: 'lower', practicalEffectDelta: 0.10,
  },
  'scheduler.drain.ms@1': {
    kind: 'duration', unit: 'ms', sourceMapping: [diagnostic('telemetry.invalidation')],
    groupingKeys: ['hardware-profile', 'phase', 'candidate', 'burst-ordinal'],
    population: 'time from deterministic burst admission until the queue is empty',
    pairingKeys: ['bootstrap-cluster-id', 'burst-ordinal'], pairingLevel: 'burst', direction: 'lower', practicalEffectDelta: 0.10,
  },
  'scheduler.stale.count@1': {
    kind: 'counter', unit: 'count', sourceMapping: [emit('result.stale-dropped', 'scheduler.stale.count@1', 'count')],
    groupingKeys: ['hardware-profile', 'phase', 'candidate', 'observation-window-id', 'stale-reason'],
    population: 'stale results per predefined measurement window and stale reason',
    pairingKeys: ['bootstrap-cluster-id', 'observation-window-id', 'stale-reason'], pairingLevel: 'window', direction: 'context-dependent', practicalEffectDelta: null,
  },
  'scheduler.drop.count@1': {
    kind: 'counter', unit: 'count', sourceMapping: [emit('scheduler.evicted', 'scheduler.drop.count@1', 'count')],
    groupingKeys: ['hardware-profile', 'phase', 'candidate', 'observation-window-id', 'drop-kind'],
    population: 'drops per predefined measurement window and drop kind',
    pairingKeys: ['bootstrap-cluster-id', 'observation-window-id', 'drop-kind'], pairingLevel: 'window', direction: 'context-dependent', practicalEffectDelta: null,
  },
  'mesh.quads.count@1': { kind: 'counter', unit: 'count', sourceMapping: [emit('mesh.quads', 'mesh.quads.count@1', 'count')], groupingKeys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric', pairingKeys: [], pairingLevel: 'run', direction: 'higher', practicalEffectDelta: null },
  'geometry.bytes@1': { kind: 'memory', unit: 'bytes', sourceMapping: [emit('mesh.output-bytes', 'geometry.bytes@1', 'bytes')], groupingKeys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric', pairingKeys: [], pairingLevel: 'run', direction: 'lower', practicalEffectDelta: null },
   'coverage.sha256.match@1': { kind: 'liveness', unit: 'count', sourceMapping: [diagnostic('telemetry.invalidation')], groupingKeys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric', pairingKeys: [], pairingLevel: 'run', direction: 'higher', practicalEffectDelta: null },
  'scheduler.queue.depth.count@1': { kind: 'counter', unit: 'count', sourceMapping: [emit('scheduler.queue-depth', 'scheduler.queue.depth.count@1', 'count')], groupingKeys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric', pairingKeys: [], pairingLevel: 'run', direction: 'context-dependent', practicalEffectDelta: null },
  'worker.active.count@1': { kind: 'counter', unit: 'count', sourceMapping: [emit('scheduler.in-flight', 'worker.active.count@1', 'count')], groupingKeys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric', pairingKeys: [], pairingLevel: 'run', direction: 'context-dependent', practicalEffectDelta: null },
  'revision.latest.visible@1': { kind: 'liveness', unit: 'revision', sourceMapping: [diagnostic('telemetry.invalidation')], groupingKeys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric', pairingKeys: [], pairingLevel: 'run', direction: 'higher', practicalEffectDelta: null },
  'heartbeat.gap.ms@1': { kind: 'duration', unit: 'ms', sourceMapping: [diagnostic('telemetry.invalidation')], groupingKeys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric', pairingKeys: [], pairingLevel: 'run', direction: 'lower', practicalEffectDelta: null },
   'world.sha256.match@1': { kind: 'liveness', unit: 'count', sourceMapping: [diagnostic('telemetry.invalidation')], groupingKeys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric', pairingKeys: [], pairingLevel: 'run', direction: 'higher', practicalEffectDelta: null },
  'dom.document.count@1': { kind: 'counter', unit: 'count', sourceMapping: [diagnostic('telemetry.invalidation')], groupingKeys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric', pairingKeys: [], pairingLevel: 'run', direction: 'lower', practicalEffectDelta: null },
  'dom.node.count@1': { kind: 'counter', unit: 'count', sourceMapping: [diagnostic('telemetry.invalidation')], groupingKeys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric', pairingKeys: [], pairingLevel: 'run', direction: 'lower', practicalEffectDelta: null },
  'event.listener.count@1': { kind: 'counter', unit: 'count', sourceMapping: [diagnostic('telemetry.invalidation')], groupingKeys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric', pairingKeys: [], pairingLevel: 'run', direction: 'lower', practicalEffectDelta: null },
  'gpu.resource.count@1': { kind: 'counter', unit: 'count', sourceMapping: [diagnostic('telemetry.invalidation')], groupingKeys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric', pairingKeys: [], pairingLevel: 'run', direction: 'lower', practicalEffectDelta: null },
  'draw.submit.cpu.ms@1': { kind: 'duration', unit: 'ms', sourceMapping: [emit('draw-submit.cpu', 'draw.submit.cpu.ms@1', 'ms')], groupingKeys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric', pairingKeys: [], pairingLevel: 'run', direction: 'lower', practicalEffectDelta: null },
   'image.contract.sha256.match@1': { kind: 'liveness', unit: 'count', sourceMapping: [diagnostic('telemetry.invalidation')], groupingKeys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric', pairingKeys: [], pairingLevel: 'run', direction: 'higher', practicalEffectDelta: null },
} as const;

export const BENCHMARK_METRIC_REGISTRY_SHA256_GOLDEN_V1 = 'sha256:4c505640ce82ffd739298b07055535a3173947b80523cb3d34cddd1e5e830f82' as const;

export const BENCHMARK_METRIC_REGISTRY_CONTRACT_GOLDENS_V1 = {
  'adoption.cpu.ms@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'positive-finite-number', minimum: 0, maximum: null },
    eventSemantics: 'Main-thread receive, validation, stale-check, and buffer adoption duration for one operation.', populationSemantics: 'One scheduler operation population per operation ordinal and semantic key.',
    allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], warmupControl: null, automaticDecision: 'forbidden',
  },
  'chunk.mesh.cpu.ms@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'positive-finite-number', minimum: 0, maximum: null },
    eventSemantics: 'Pure mesher CPU duration for one identified chunk.', populationSemantics: 'One chunk operation population per iteration and chunk.',
    allowedContainers: ['cold', 'warm-measurement', 'stress'], allowedPhases: ['cold', 'measurement', 'stress'], capabilityRequirements: [], warmupControl: null, automaticDecision: 'forbidden',
  },
  'coverage.sha256.match@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'non-negative-safe-integer', minimum: 0, maximum: 9007199254740991 },
    eventSemantics: 'Binary coverage digest equality assertion.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.',
    allowedContainers: ['cold', 'warm-measurement'], allowedPhases: ['cold', 'measurement'], capabilityRequirements: [], warmupControl: null, automaticDecision: 'forbidden',
  },
  'dom.document.count@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'non-negative-safe-integer', minimum: 0, maximum: 9007199254740991 },
    eventSemantics: 'Number of live DOM documents.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.',
    allowedContainers: ['leak', 'trace'], allowedPhases: ['leak', 'trace'], capabilityRequirements: ['cdp-memory-dom-counters'], warmupControl: null, automaticDecision: 'forbidden',
  },
  'dom.node.count@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'non-negative-safe-integer', minimum: 0, maximum: 9007199254740991 },
    eventSemantics: 'Number of live DOM nodes.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.',
    allowedContainers: ['leak', 'trace'], allowedPhases: ['leak', 'trace'], capabilityRequirements: ['cdp-memory-dom-counters'], warmupControl: null, automaticDecision: 'forbidden',
  },
  'draw.submit.cpu.ms@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'positive-finite-number', minimum: 0, maximum: null },
    eventSemantics: 'CPU duration submitting one draw workload.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.',
    allowedContainers: ['cold', 'warm-measurement'], allowedPhases: ['cold', 'measurement'], capabilityRequirements: [], warmupControl: null, automaticDecision: 'forbidden',
  },
  'event.listener.count@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'non-negative-safe-integer', minimum: 0, maximum: 9007199254740991 },
    eventSemantics: 'Number of live event listeners.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.',
    allowedContainers: ['leak', 'trace'], allowedPhases: ['leak', 'trace'], capabilityRequirements: ['cdp-runtime-heap-usage'], warmupControl: null, automaticDecision: 'forbidden',
  },
  'geometry.bytes@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'non-negative-safe-integer', minimum: 0, maximum: 9007199254740991 },
    eventSemantics: 'Bytes in a completed geometry transfer.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.',
    allowedContainers: ['cold', 'warm-measurement', 'stress'], allowedPhases: ['cold', 'measurement', 'stress'], capabilityRequirements: [], warmupControl: null, automaticDecision: 'forbidden',
  },
  'gpu.resource.count@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'non-negative-safe-integer', minimum: 0, maximum: 9007199254740991 },
    eventSemantics: 'Number of live GPU resources.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.',
    allowedContainers: ['leak', 'trace'], allowedPhases: ['leak', 'trace'], capabilityRequirements: ['cdp-system-info'], warmupControl: null, automaticDecision: 'forbidden',
  },
  'gpu.time.ms@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'positive-finite-number', minimum: 0, maximum: null },
    eventSemantics: 'Asynchronously measured GPU duration for one declared render pass and frame block.', populationSemantics: 'One GPU population per render pass and frame block.',
    allowedContainers: ['warm-measurement'], allowedPhases: ['measurement'], capabilityRequirements: [], warmupControl: null, automaticDecision: 'forbidden',
  },
  'heartbeat.gap.ms@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'positive-finite-number', minimum: 0, maximum: null },
    eventSemantics: 'Gap between worker heartbeat observations.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.',
    allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], warmupControl: null, automaticDecision: 'forbidden',
  },
  'image.contract.sha256.match@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'non-negative-safe-integer', minimum: 0, maximum: 9007199254740991 },
    eventSemantics: 'Binary image contract equality assertion.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.',
    allowedContainers: ['cold', 'warm-measurement'], allowedPhases: ['cold', 'measurement'], capabilityRequirements: [], warmupControl: null, automaticDecision: 'forbidden',
  },
  'input.revision.submit.ms@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'positive-finite-number', minimum: 0, maximum: null },
    eventSemantics: 'Trusted input start until draw submit of the expected world revision.', populationSemantics: 'One input and revision population per input ordinal and expected world revision.',
    allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], warmupControl: null, automaticDecision: 'forbidden',
  },
  'longtask.count@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'non-negative-safe-integer', minimum: 0, maximum: 9007199254740991 },
    eventSemantics: 'Number of browser long-task entries in a predefined measurement window.', populationSemantics: 'One counter population per observation window.',
    allowedContainers: ['warm-measurement', 'stress', 'leak'], allowedPhases: ['measurement', 'stress', 'leak'], capabilityRequirements: ['long-tasks'], warmupControl: null, automaticDecision: 'forbidden',
  },
  'longtask.duration.ms@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'positive-finite-number', minimum: 0, maximum: null },
    eventSemantics: 'Duration of each browser long task reported at or above 50 ms.', populationSemantics: 'One frame and long-task series population per time block; individual events are not directly paired.',
    allowedContainers: ['warm-measurement', 'stress', 'leak'], allowedPhases: ['measurement', 'stress', 'leak'], capabilityRequirements: ['long-tasks'], warmupControl: null, automaticDecision: 'forbidden',
  },
  'memory.bytes@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'non-negative-safe-integer', minimum: 0, maximum: 9007199254740991 },
    eventSemantics: 'Memory bytes for the explicitly named memory kind.', populationSemantics: 'One memory population per memory kind and checkpoint; memory kinds are never mixed.',
    allowedContainers: ['cold', 'warm-measurement', 'leak'], allowedPhases: ['cold', 'measurement', 'leak'], capabilityRequirements: [], warmupControl: null, automaticDecision: 'forbidden',
  },
  'mesh.quads.count@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'non-negative-safe-integer', minimum: 0, maximum: 9007199254740991 },
    eventSemantics: 'Number of generated mesh quads.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.',
    allowedContainers: ['cold', 'warm-measurement', 'stress'], allowedPhases: ['cold', 'measurement', 'stress'], capabilityRequirements: [], warmupControl: null, automaticDecision: 'forbidden',
  },
  'raf.interval.ms@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'positive-finite-number', minimum: 0, maximum: null },
    eventSemantics: 'Distance between consecutive requestAnimationFrame callbacks in one measurement block.', populationSemantics: 'One frame series population per time block; individual intervals are not directly paired.',
    allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: ['request-animation-frame'], warmupControl: null, automaticDecision: 'forbidden',
  },
  'revision.latest.visible@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'non-negative-safe-integer', minimum: 0, maximum: 9007199254740991 },
    eventSemantics: 'Latest revision observed as visible.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.',
    allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], warmupControl: null, automaticDecision: 'forbidden',
  },
  'scheduler.drain.ms@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'positive-finite-number', minimum: 0, maximum: null },
    eventSemantics: 'Time from deterministic burst admission until the queue is empty and all operations are terminal.', populationSemantics: 'One drain population per declared burst.',
    allowedContainers: ['stress'], allowedPhases: ['stress'], capabilityRequirements: [], warmupControl: null, automaticDecision: 'forbidden',
  },
  'scheduler.drop.count@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'non-negative-safe-integer', minimum: 0, maximum: 9007199254740991 },
    eventSemantics: 'Count of drops by declared drop kind before execution.', populationSemantics: 'One counter population per observation window and drop kind.',
    allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], warmupControl: null, automaticDecision: 'forbidden',
  },
  'scheduler.queue.depth.count@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'non-negative-safe-integer', minimum: 0, maximum: 9007199254740991 },
    eventSemantics: 'Scheduler queue depth at a declared sampling point.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.',
    allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], warmupControl: null, automaticDecision: 'forbidden',
  },
  'scheduler.queue.wait.ms@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'positive-finite-number', minimum: 0, maximum: null },
    eventSemantics: 'Main-thread admission until dispatch of one scheduler operation.', populationSemantics: 'One scheduler operation population per operation ordinal and semantic key.',
    allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], warmupControl: null, automaticDecision: 'forbidden',
  },
  'scheduler.stale.count@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'non-negative-safe-integer', minimum: 0, maximum: 9007199254740991 },
    eventSemantics: 'Count of stale results discarded by the scheduler, retaining stale reason.', populationSemantics: 'One counter population per observation window and stale reason.',
    allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], warmupControl: null, automaticDecision: 'forbidden',
  },
  'snapshot.halo.build.ms@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'positive-finite-number', minimum: 0, maximum: null },
    eventSemantics: 'Build duration for one identified immutable snapshot or halo.', populationSemantics: 'One chunk operation population per iteration and chunk.',
    allowedContainers: ['cold', 'warm-measurement', 'stress'], allowedPhases: ['cold', 'measurement', 'stress'], capabilityRequirements: [], warmupControl: null, automaticDecision: 'forbidden',
  },
  'worker.active.count@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'non-negative-safe-integer', minimum: 0, maximum: 9007199254740991 },
    eventSemantics: 'Number of active worker jobs at a declared sampling point.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.',
    allowedContainers: ['warm-measurement', 'stress', 'leak'], allowedPhases: ['measurement', 'stress', 'leak'], capabilityRequirements: [], warmupControl: null, automaticDecision: 'forbidden',
  },
  'worker.total.ms@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'positive-finite-number', minimum: 0, maximum: null },
    eventSemantics: 'Worker receive, validation, compute, serialize, and post duration for one operation.', populationSemantics: 'One scheduler operation population per operation ordinal and semantic key.',
    allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], warmupControl: null, automaticDecision: 'forbidden',
  },
  'world.mesh.total.ms@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'positive-finite-number', minimum: 0, maximum: null },
    eventSemantics: 'One non-overlapping end-to-end world mesh critical path per iteration.', populationSemantics: 'One world iteration population per declared phase.',
    allowedContainers: ['cold', 'warm-measurement'], allowedPhases: ['cold', 'measurement'], capabilityRequirements: [], warmupControl: null, automaticDecision: 'forbidden',
  },
  'world.sha256.match@1': {
    schemaVersion: 'benchmark-metric-definition-v1', numericDomain: { kind: 'non-negative-safe-integer', minimum: 0, maximum: 9007199254740991 },
    eventSemantics: 'Binary world digest equality assertion.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.',
    allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], warmupControl: null, automaticDecision: 'forbidden',
  },
} as const;

export const BENCHMARK_TELEMETRY_MAPPING_GOLDENS_V1 = [
  { recordName: 'benchmark-download', disposition: 'diagnostic-only' },
  { recordName: 'browser.event-timing', disposition: 'diagnostic-only' },
  { recordName: 'browser.long-task', disposition: 'emit-sample', metricRef: 'longtask.duration.ms@1', unit: 'ms' },
  { recordName: 'browser.raf-interval', disposition: 'emit-sample', metricRef: 'raf.interval.ms@1', unit: 'ms' },
  { recordName: 'dedicated-worker', disposition: 'context-only' },
  { recordName: 'document-focus', disposition: 'context-only' },
  { recordName: 'document.focus', disposition: 'context-only' },
  { recordName: 'document.visibility', disposition: 'context-only' },
  { recordName: 'draw-submit.cpu', disposition: 'emit-sample', metricRef: 'draw.submit.cpu.ms@1', unit: 'ms' },
  { recordName: 'edge-products.build', disposition: 'diagnostic-only' },
  { recordName: 'event-timing', disposition: 'context-only' },
  { recordName: 'fixture.build', disposition: 'diagnostic-only' },
  { recordName: 'halo.build', disposition: 'diagnostic-only' },
  { recordName: 'high-resolution-time', disposition: 'context-only' },
  { recordName: 'input-to-revision-submit', disposition: 'emit-sample', metricRef: 'input.revision.submit.ms@1', unit: 'ms' },
  { recordName: 'long-task', disposition: 'context-only' },
  { recordName: 'main-to-worker.transit-wait', disposition: 'diagnostic-only' },
  { recordName: 'main.frame-work', disposition: 'diagnostic-only' },
  { recordName: 'mesh.cpu', disposition: 'diagnostic-only' },
  { recordName: 'mesh.input-bytes', disposition: 'context-only' },
  { recordName: 'mesh.output-bytes', disposition: 'emit-sample', metricRef: 'geometry.bytes@1', unit: 'bytes' },
  { recordName: 'mesh.quads', disposition: 'emit-sample', metricRef: 'mesh.quads.count@1', unit: 'count' },
  { recordName: 'page-visibility', disposition: 'context-only' },
  { recordName: 'performance-observer', disposition: 'context-only' },
  { recordName: 'renderer.adoption', disposition: 'diagnostic-only' },
  { recordName: 'request-animation-frame', disposition: 'context-only' },
  { recordName: 'result.adoption', disposition: 'emit-sample', metricRef: 'adoption.cpu.ms@1', unit: 'ms' },
  { recordName: 'result.stale-dropped', disposition: 'emit-sample', metricRef: 'scheduler.stale.count@1', unit: 'count' },
  { recordName: 'result.validation', disposition: 'diagnostic-only' },
  { recordName: 'run.total', disposition: 'diagnostic-only' },
  { recordName: 'scheduler.admitted', disposition: 'diagnostic-only' },
  { recordName: 'scheduler.coalesced', disposition: 'diagnostic-only' },
  { recordName: 'scheduler.evicted', disposition: 'emit-sample', metricRef: 'scheduler.drop.count@1', unit: 'count' },
  { recordName: 'scheduler.in-flight', disposition: 'emit-sample', metricRef: 'worker.active.count@1', unit: 'count' },
  { recordName: 'scheduler.queue-depth', disposition: 'emit-sample', metricRef: 'scheduler.queue.depth.count@1', unit: 'count' },
  { recordName: 'scheduler.queue-wait', disposition: 'emit-sample', metricRef: 'scheduler.queue.wait.ms@1', unit: 'ms' },
  { recordName: 'snapshot.build', disposition: 'emit-sample', metricRef: 'snapshot.halo.build.ms@1', unit: 'ms' },
  { recordName: 'telemetry.charged-bytes', disposition: 'diagnostic-only' },
  { recordName: 'telemetry.invalidation', disposition: 'diagnostic-only' },
  { recordName: 'telemetry.observer-callbacks', disposition: 'diagnostic-only' },
  { recordName: 'telemetry.observer-entries-dropped', disposition: 'diagnostic-only' },
  { recordName: 'telemetry.open-spans', disposition: 'diagnostic-only' },
  { recordName: 'telemetry.records-dropped', disposition: 'diagnostic-only' },
  { recordName: 'telemetry.records-written', disposition: 'diagnostic-only' },
  { recordName: 'user-timing', disposition: 'context-only' },
  { recordName: 'worker-to-main.transit-wait', disposition: 'diagnostic-only' },
  { recordName: 'worker.mesh-cpu', disposition: 'emit-sample', metricRef: 'chunk.mesh.cpu.ms@1', unit: 'ms' },
  { recordName: 'worker.transfer-products-build', disposition: 'diagnostic-only' },
  { recordName: 'worker.validation', disposition: 'diagnostic-only' },
] as const;

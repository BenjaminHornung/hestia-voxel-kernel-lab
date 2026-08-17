import { BENCHMARK_SCENARIO_DEFINITION_DIGESTS_V1 } from './scenario-registry-v1.golden';

const required = (metricRef: string, kind: string, unit: string, dimensions?: readonly { readonly key: string; readonly value: string }[]) => ({
  metricRef,
  kind,
  unit,
  ...(dimensions === undefined ? {} : { dimensions }),
  requirement: { kind: 'required' },
});

const conditional = (metricRef: string, kind: string, unit: string, capabilityId: string) => ({
  metricRef,
  kind,
  unit,
  requirement: { kind: 'when-capability-supported', capabilityId },
});

const capability = (id: string, requirement: 'must-support' | 'must-declare') => ({ id, requirement });
const parameter = (key: string, domain: Record<string, unknown>) => ({ key, required: true, domain });
const uint32 = { kind: 'uint32' } as const;
const sha256 = { kind: 'sha256' } as const;
const range = (minimum: number, maximum: number) => ({ kind: 'safe-integer-range', minimum, maximum });
const enumDomain = (values: readonly (string | number)[]) => ({ kind: 'enum', values });
const warmupRule = { id: 'br03-warmup-stability-v1', version: 1, algorithm: 'median-last-5-vs-preceding-5-relative-deviation-v1', windowSize: 5, maximumRelativeDeviation: 0.05, consecutiveStableComparisons: 2, minimumWarmupIterations: 10, maximumWarmupIterations: 50 } as const;
const warmupControl = (metricRef: string) => ({ metricRef, rule: warmupRule });

export const BENCHMARK_TEST_METRIC_FIXTURES_V1 = {
  'world.mesh.total.ms@1': { kind: 'duration', unit: 'ms', capabilityRequirements: [] },
  'chunk.mesh.cpu.ms@1': { kind: 'duration', unit: 'ms', capabilityRequirements: [] },
  'snapshot.halo.build.ms@1': { kind: 'duration', unit: 'ms', capabilityRequirements: [] },
  'scheduler.queue.wait.ms@1': { kind: 'duration', unit: 'ms', capabilityRequirements: [] },
  'worker.total.ms@1': { kind: 'duration', unit: 'ms', capabilityRequirements: [] },
  'adoption.cpu.ms@1': { kind: 'duration', unit: 'ms', capabilityRequirements: [] },
  'input.revision.submit.ms@1': { kind: 'duration', unit: 'ms', capabilityRequirements: [] },
  'raf.interval.ms@1': { kind: 'frame', unit: 'ms', capabilityRequirements: ['request-animation-frame'] },
  'longtask.duration.ms@1': { kind: 'long-task', unit: 'ms', capabilityRequirements: ['long-tasks'] },
  'longtask.count@1': { kind: 'counter', unit: 'count', capabilityRequirements: ['long-tasks'] },
  'memory.bytes@1': { kind: 'memory', unit: 'bytes', capabilityRequirements: [] },
  'gpu.time.ms@1': { kind: 'gpu', unit: 'ms', capabilityRequirements: [] },
  'scheduler.drain.ms@1': { kind: 'duration', unit: 'ms', capabilityRequirements: [] },
  'scheduler.stale.count@1': { kind: 'counter', unit: 'count', capabilityRequirements: [] },
  'scheduler.drop.count@1': { kind: 'counter', unit: 'count', capabilityRequirements: [] },
  'mesh.quads.count@1': { kind: 'counter', unit: 'count', capabilityRequirements: [] },
  'geometry.bytes@1': { kind: 'memory', unit: 'bytes', capabilityRequirements: [] },
  'coverage.sha256.match@1': { kind: 'liveness', unit: 'count', capabilityRequirements: [] },
  'scheduler.queue.depth.count@1': { kind: 'counter', unit: 'count', capabilityRequirements: [] },
  'worker.active.count@1': { kind: 'counter', unit: 'count', capabilityRequirements: [] },
  'revision.latest.visible@1': { kind: 'liveness', unit: 'revision', capabilityRequirements: [] },
  'heartbeat.gap.ms@1': { kind: 'duration', unit: 'ms', capabilityRequirements: [] },
  'world.sha256.match@1': { kind: 'liveness', unit: 'count', capabilityRequirements: [] },
  'dom.document.count@1': { kind: 'counter', unit: 'count', capabilityRequirements: ['cdp-memory-dom-counters'] },
  'dom.node.count@1': { kind: 'counter', unit: 'count', capabilityRequirements: ['cdp-memory-dom-counters'] },
  'event.listener.count@1': { kind: 'counter', unit: 'count', capabilityRequirements: ['cdp-runtime-heap-usage'] },
  'gpu.resource.count@1': { kind: 'counter', unit: 'count', capabilityRequirements: ['cdp-system-info'] },
  'draw.submit.cpu.ms@1': { kind: 'duration', unit: 'ms', capabilityRequirements: [] },
  'image.contract.sha256.match@1': { kind: 'liveness', unit: 'count', capabilityRequirements: [] },
} as const;

const fairnessKeys = [
  'browser-build',
  'browser-flags',
  'display',
  'fixture-semantic-sha256',
  'fixture-source-fileset-sha256',
  'gpu',
  'hardware-profile',
  'os',
  'phase',
  'power',
  'run-plan-sha256',
  'scenario-definition-sha256',
] as const;

const definition = (
  id: string,
  fixtureContractId: string,
  allowedPhases: readonly string[],
  parameterContracts: readonly Record<string, unknown>[],
  metricContracts: readonly Record<string, unknown>[],
  capabilityContracts: readonly Record<string, unknown>[],
  comparisonAxes: readonly string[],
  metricCapabilitySelections: readonly Record<string, unknown>[] = [],
  warmupControlValue: Record<string, unknown> | null = null,
) => ({
  schemaVersion: 'benchmark-scenario-definition-v1',
  protocolVersion: 'benchmark-protocol-v1',
  id,
  version: 1,
  fixtureContractId,
  fixtureContractVersion: 1,
  allowedPhases,
  parameterContracts,
  metricContracts,
  metricCapabilitySelections,
  capabilityContracts,
  comparisonAxes,
  fairnessKeys,
  warmupControl: warmupControlValue,
});

export const BENCHMARK_TEST_SCENARIO_DEFINITIONS_V1 = [
  definition('mesh-golden-world-v1', 'wp04-golden-world-v1', ['cold', 'measurement', 'trace', 'warmup'], [
    parameter('backend', enumDomain(['raw-webgpu', 'three-webgl2'])), parameter('chunk-edge', enumDomain([32])), parameter('mesher', enumDomain(['greedy', 'greedy-ao', 'visible'])), parameter('seed', uint32), parameter('worker-count', range(0, 64)),
  ], [
    required('chunk.mesh.cpu.ms@1', 'duration', 'ms'), required('coverage.sha256.match@1', 'liveness', 'count'), required('geometry.bytes@1', 'memory', 'bytes'), required('mesh.quads.count@1', 'counter', 'count'), required('world.mesh.total.ms@1', 'duration', 'ms'),
  ], [capability('performance-time-origin', 'must-support'), capability('webgl2', 'must-declare'), capability('webgpu', 'must-declare')], ['candidate', 'mesher'], [], warmupControl('chunk.mesh.cpu.ms@1')),
  definition('mesh-density-sweep-v1', 'density-volume-suite-v1', ['cold', 'measurement', 'trace', 'warmup'], [
    parameter('backend', enumDomain(['raw-webgpu', 'three-webgl2'])), parameter('chunk-edge', enumDomain([32, 64])), parameter('density-case', enumDomain(['checkerboard', 'empty', 'fifty-percent', 'full', 'ninety-percent', 'one-percent', 'ten-percent'])), parameter('mesher', enumDomain(['greedy', 'greedy-ao', 'visible'])), parameter('seed', uint32), parameter('worker-count', range(0, 64)),
  ], [
    required('chunk.mesh.cpu.ms@1', 'duration', 'ms'), required('coverage.sha256.match@1', 'liveness', 'count'), required('geometry.bytes@1', 'memory', 'bytes'), required('mesh.quads.count@1', 'counter', 'count'),
  ], [capability('performance-time-origin', 'must-support'), capability('webgl2', 'must-declare'), capability('webgpu', 'must-declare')], ['candidate', 'chunk-edge', 'mesher'], [], warmupControl('chunk.mesh.cpu.ms@1')),
  definition('scheduler-steady-v1', 'scheduler-edit-stream-v1', ['measurement', 'stress', 'trace', 'warmup'], [
    parameter('backend', enumDomain(['raw-webgpu', 'three-webgl2'])), parameter('chunk-edge', enumDomain([32])), parameter('command-stream-sha256', sha256), parameter('duration-ms', enumDomain([60000])), parameter('edit-interval-ms', enumDomain([250])), parameter('mesher', enumDomain(['greedy-ao'])), parameter('seed', uint32), parameter('worker-count', range(1, 64)),
  ], [
    required('adoption.cpu.ms@1', 'duration', 'ms'), required('heartbeat.gap.ms@1', 'duration', 'ms'), conditional('longtask.duration.ms@1', 'long-task', 'ms', 'long-tasks'), required('revision.latest.visible@1', 'liveness', 'revision'), required('scheduler.queue.depth.count@1', 'counter', 'count'), required('worker.active.count@1', 'counter', 'count'),
  ], [capability('dedicated-worker', 'must-support'), capability('long-tasks', 'must-declare'), capability('performance-time-origin', 'must-support'), capability('webgl2', 'must-declare'), capability('webgpu', 'must-declare')], ['candidate', 'worker-count'], [], warmupControl('scheduler.queue.depth.count@1')),
  definition('scheduler-burst-v1', 'scheduler-edit-stream-v1', ['measurement', 'stress', 'trace', 'warmup'], [
    parameter('backend', enumDomain(['raw-webgpu', 'three-webgl2'])), parameter('burst-interval-ms', enumDomain([2000])), parameter('burst-size', enumDomain([20])), parameter('chunk-edge', enumDomain([32])), parameter('command-stream-sha256', sha256), parameter('duration-ms', enumDomain([60000])), parameter('mesher', enumDomain(['greedy-ao'])), parameter('seed', uint32), parameter('worker-count', range(1, 64)),
  ], [
    required('heartbeat.gap.ms@1', 'duration', 'ms'), conditional('longtask.duration.ms@1', 'long-task', 'ms', 'long-tasks'), required('revision.latest.visible@1', 'liveness', 'revision'), required('scheduler.drain.ms@1', 'duration', 'ms'), required('scheduler.drop.count@1', 'counter', 'count'), required('scheduler.queue.depth.count@1', 'counter', 'count'), required('scheduler.stale.count@1', 'counter', 'count'),
  ], [capability('dedicated-worker', 'must-support'), capability('long-tasks', 'must-declare'), capability('performance-time-origin', 'must-support'), capability('webgl2', 'must-declare'), capability('webgpu', 'must-declare')], ['candidate', 'worker-count'], [], warmupControl('scheduler.queue.depth.count@1')),
  definition('brush-stress-v1', 'brush-command-stream-v1', ['stress', 'trace', 'warmup'], [
    parameter('backend', enumDomain(['raw-webgpu', 'three-webgl2'])), parameter('chunk-edge', enumDomain([32])), parameter('command-stream-sha256', sha256), parameter('edit-count', enumDomain([100, 1000])), parameter('mesher', enumDomain(['greedy-ao'])), parameter('seed', uint32), parameter('worker-count', range(1, 64)),
  ], [
    required('input.revision.submit.ms@1', 'duration', 'ms'), conditional('longtask.duration.ms@1', 'long-task', 'ms', 'long-tasks'), required('revision.latest.visible@1', 'liveness', 'revision'), required('scheduler.drain.ms@1', 'duration', 'ms'), required('scheduler.queue.depth.count@1', 'counter', 'count'), required('world.sha256.match@1', 'liveness', 'count'),
  ], [capability('dedicated-worker', 'must-support'), capability('long-tasks', 'must-declare'), capability('performance-time-origin', 'must-support'), capability('webgl2', 'must-declare'), capability('webgpu', 'must-declare')], ['candidate', 'worker-count'], [], warmupControl('input.revision.submit.ms@1')),
  definition('navigation-leak-v1', 'navigation-route-sequence-v1', ['leak', 'trace'], [
    parameter('measurement-cycles', enumDomain([100])), parameter('stabilization-cycles', enumDomain([20])),
  ], [
    required('dom.document.count@1', 'counter', 'count'), required('dom.node.count@1', 'counter', 'count'), required('event.listener.count@1', 'counter', 'count'), required('gpu.resource.count@1', 'counter', 'count'), required('memory.bytes@1', 'memory', 'bytes', [{ key: 'memory-kind', value: 'js-heap' }]), required('memory.bytes@1', 'memory', 'bytes', [{ key: 'memory-kind', value: 'embedder-heap' }]), required('memory.bytes@1', 'memory', 'bytes', [{ key: 'memory-kind', value: 'backing-storage' }]), required('worker.active.count@1', 'counter', 'count'),
  ], [capability('cdp-memory-dom-counters', 'must-support'), capability('cdp-runtime-heap-usage', 'must-support'), capability('cdp-system-info', 'must-declare')], ['candidate']),
  definition('backend-fixture-v1', 'backend-parity-world-v1', ['cold', 'measurement', 'trace', 'warmup'], [
    parameter('backend', enumDomain(['raw-webgpu', 'three-webgl2'])), parameter('camera-contract-sha256', sha256), parameter('chunk-edge', enumDomain([32])), parameter('feature-contract-sha256', sha256), parameter('mesher', enumDomain(['greedy-ao'])), parameter('seed', uint32), parameter('worker-count', range(0, 64)),
  ], [
     required('draw.submit.cpu.ms@1', 'duration', 'ms'), required('gpu.time.ms@1', 'gpu', 'ms'), required('image.contract.sha256.match@1', 'liveness', 'count'), required('memory.bytes@1', 'memory', 'bytes', [{ key: 'memory-kind', value: 'owner-bound' }]), required('raf.interval.ms@1', 'frame', 'ms'),
     ], [capability('performance-time-origin', 'must-support'), capability('webgl-disjoint-timer-query', 'must-declare'), capability('webgl2', 'must-declare'), capability('webgpu', 'must-declare'), capability('webgpu-timestamp-query', 'must-declare')], ['backend', 'candidate'], [{ scenarioId: 'backend-fixture-v1', metricRef: 'gpu.time.ms@1', parameterKey: 'backend', selections: [{ parameterValue: 'raw-webgpu', capabilityId: 'webgpu-timestamp-query' }, { parameterValue: 'three-webgl2', capabilityId: 'webgl-disjoint-timer-query' }] }], warmupControl('draw.submit.cpu.ms@1')),
] as const;

export { BENCHMARK_SCENARIO_DEFINITION_DIGESTS_V1 as BENCHMARK_TEST_SCENARIO_DEFINITION_DIGESTS_V1 };

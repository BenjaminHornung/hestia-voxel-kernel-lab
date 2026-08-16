import { createHash } from 'node:crypto';
import { canonicalizeJsonV1, compareUtf16 } from '../provenance/canonicalJsonV1';
import { sha256BytesV1 } from '../provenance/fileSetDigestV1';
import type {
  BenchmarkComparisonAxisV1,
  BenchmarkMetricNumericDomainV1,
  BenchmarkMetricWarmupControlV1,
  BenchmarkSampleKindV1,
  BenchmarkSamplePhaseV1,
  BenchmarkSampleDimensionV1,
  BenchmarkSampleUnitV1,
  BenchmarkScenarioCapabilityContractV1,
  BenchmarkScenarioDefinitionV1,
  BenchmarkScenarioMetricCapabilitySelectionV1,
  BenchmarkScenarioMetricContractV1,
  BenchmarkScenarioParameterContractV1,
  BenchmarkScenarioIdV1,
  CanonicalIdV1,
  CanonicalMetricRefV1,
  NonEmptyReadonlyArray,
  NonEmptyString,
  Sha256DigestV1,
  MetricDefinitionV1,
  MetricRegistryV1,
  TelemetrySourceMappingV1,
} from './typesV1';
import { BENCHMARK_PROTOCOL_VERSION } from './versions';

const id = (value: string) => value as CanonicalIdV1;
const metricRef = (value: string) => value as CanonicalMetricRefV1;
const digest = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}` as Sha256DigestV1;

const phases = {
  cold: 'cold',
  measurement: 'measurement',
  stress: 'stress',
  trace: 'trace',
  warmup: 'warmup',
  leak: 'leak',
} as const;

const fairnessKeys = [
  id('browser-build'),
  id('browser-flags'),
  id('display'),
  id('fixture-semantic-sha256'),
  id('fixture-source-fileset-sha256'),
  id('gpu'),
  id('hardware-profile'),
  id('os'),
  id('phase'),
  id('power'),
  id('run-plan-sha256'),
  id('scenario-definition-sha256'),
] as const satisfies NonEmptyReadonlyArray<CanonicalIdV1>;

const parameter = (
  key: BenchmarkScenarioParameterContractV1['key'],
  domain: BenchmarkScenarioParameterContractV1['domain'],
): BenchmarkScenarioParameterContractV1 => ({ key, required: true, domain });
const enumDomain = <T extends string | number>(values: readonly T[]) => ({
  kind: 'enum' as const,
  values: values as NonEmptyReadonlyArray<T>,
});
const rangeDomain = (minimum: number, maximum: number) => ({ kind: 'safe-integer-range', minimum, maximum }) as const;
const requiredMetric = (
  ref: string,
  kind: BenchmarkSampleKindV1,
  unit: BenchmarkSampleUnitV1,
  dimensions?: readonly BenchmarkSampleDimensionV1[],
): BenchmarkScenarioMetricContractV1 => ({
  metricRef: metricRef(ref),
  kind,
  unit,
  ...(dimensions === undefined ? {} : { dimensions }),
  requirement: { kind: 'required' },
});
const capabilityMetric = (
  ref: string,
  kind: BenchmarkSampleKindV1,
  unit: BenchmarkSampleUnitV1,
  capabilityId: string,
): BenchmarkScenarioMetricContractV1 => ({
  metricRef: metricRef(ref),
  kind,
  unit,
  requirement: { kind: 'when-capability-supported', capabilityId: id(capabilityId) },
});
const capabilities = (entries: readonly [string, 'must-support' | 'must-declare'][]): readonly BenchmarkScenarioCapabilityContractV1[] =>
  entries.map(([capabilityId, requirement]) => ({ id: id(capabilityId), requirement }));

const commonMeshCapabilities = capabilities([
  ['performance-time-origin', 'must-support'],
  ['webgl2', 'must-declare'],
  ['webgpu', 'must-declare'],
]);
const schedulerCapabilities = capabilities([
  ['dedicated-worker', 'must-support'],
  ['long-tasks', 'must-declare'],
]);

function freezeGraph<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) freezeGraph(child);
  return value;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

const backendMetricCapabilitySelections: readonly BenchmarkScenarioMetricCapabilitySelectionV1[] = [
  {
    scenarioId: 'backend-fixture-v1',
    metricRef: metricRef('gpu.time.ms@1'),
    parameterKey: 'backend',
    selections: [
      { parameterValue: 'raw-webgpu', capabilityId: id('webgpu-timestamp-query') },
      { parameterValue: 'three-webgl2', capabilityId: id('webgl-disjoint-timer-query') },
    ],
  },
];

function definition(
  scenarioId: BenchmarkScenarioIdV1,
  fixtureContractId: string,
  allowedPhases: readonly BenchmarkSamplePhaseV1[],
  parameterContracts: readonly BenchmarkScenarioParameterContractV1[],
  metricContracts: readonly BenchmarkScenarioMetricContractV1[],
  capabilityContracts: readonly BenchmarkScenarioCapabilityContractV1[],
  comparisonAxes: readonly BenchmarkComparisonAxisV1[],
  metricCapabilitySelections: readonly BenchmarkScenarioMetricCapabilitySelectionV1[] = [],
): BenchmarkScenarioDefinitionV1 {
  return {
    schemaVersion: 'benchmark-scenario-definition-v1',
    protocolVersion: BENCHMARK_PROTOCOL_VERSION,
    id: scenarioId,
    version: 1,
    fixtureContractId: id(fixtureContractId),
    fixtureContractVersion: 1 as never,
    allowedPhases: [...allowedPhases].sort(compareUtf16) as unknown as NonEmptyReadonlyArray<BenchmarkSamplePhaseV1>,
    parameterContracts: [...parameterContracts].sort((left, right) => compareUtf16(left.key, right.key)),
    metricContracts: [...metricContracts].sort((left, right) => compareUtf16(left.metricRef, right.metricRef)),
    metricCapabilitySelections: [...metricCapabilitySelections],
    capabilityContracts: [...capabilityContracts].sort((left, right) => compareUtf16(left.id, right.id)),
    comparisonAxes: [...comparisonAxes].sort(compareUtf16) as unknown as NonEmptyReadonlyArray<BenchmarkComparisonAxisV1>,
    fairnessKeys,
  };
}

const seed = parameter('seed', { kind: 'uint32' });
const backend = parameter('backend', enumDomain(['raw-webgpu', 'three-webgl2']));
const meshMesher = parameter('mesher', enumDomain(['greedy', 'greedy-ao', 'visible']));
const aoMesher = parameter('mesher', enumDomain(['greedy-ao']));
const chunkEdge32 = parameter('chunk-edge', enumDomain([32]));
const chunkEdge = parameter('chunk-edge', enumDomain([32, 64]));
const workerCount = parameter('worker-count', rangeDomain(0, 64));
const schedulerWorkerCount = parameter('worker-count', rangeDomain(1, 64));
const shaCommand = parameter('command-stream-sha256', { kind: 'sha256' });

const definitions: readonly BenchmarkScenarioDefinitionV1[] = [
  definition('mesh-golden-world-v1', 'wp04-golden-world-v1', [phases.cold, phases.measurement, phases.trace, phases.warmup], [seed, backend, meshMesher, chunkEdge32, workerCount], [
    requiredMetric('world.mesh.total.ms@1', 'duration', 'ms'), requiredMetric('chunk.mesh.cpu.ms@1', 'duration', 'ms'),
    requiredMetric('mesh.quads.count@1', 'counter', 'count'), requiredMetric('geometry.bytes@1', 'memory', 'bytes'),
    requiredMetric('coverage.sha256.match@1', 'liveness', 'count'),
  ], commonMeshCapabilities, ['candidate', 'mesher']),
  definition('mesh-density-sweep-v1', 'density-volume-suite-v1', [phases.cold, phases.measurement, phases.trace, phases.warmup], [seed, backend, meshMesher, chunkEdge, workerCount, parameter('density-case', enumDomain(['checkerboard', 'empty', 'fifty-percent', 'full', 'ninety-percent', 'one-percent', 'ten-percent']))], [
    requiredMetric('chunk.mesh.cpu.ms@1', 'duration', 'ms'), requiredMetric('mesh.quads.count@1', 'counter', 'count'),
    requiredMetric('geometry.bytes@1', 'memory', 'bytes'), requiredMetric('coverage.sha256.match@1', 'liveness', 'count'),
  ], commonMeshCapabilities, ['candidate', 'chunk-edge', 'mesher']),
  definition('scheduler-steady-v1', 'scheduler-edit-stream-v1', [phases.measurement, phases.stress, phases.trace, phases.warmup], [seed, backend, aoMesher, chunkEdge32, schedulerWorkerCount, parameter('duration-ms', enumDomain([60000])), parameter('edit-interval-ms', enumDomain([250])), shaCommand], [
    requiredMetric('scheduler.queue.depth.count@1', 'counter', 'count'), requiredMetric('worker.active.count@1', 'counter', 'count'),
    requiredMetric('adoption.cpu.ms@1', 'duration', 'ms'), requiredMetric('revision.latest.visible@1', 'liveness', 'revision'),
    requiredMetric('heartbeat.gap.ms@1', 'duration', 'ms'), capabilityMetric('longtask.duration.ms@1', 'long-task', 'ms', 'long-tasks'),
  ], [...commonMeshCapabilities, ...schedulerCapabilities], ['candidate', 'worker-count']),
  definition('scheduler-burst-v1', 'scheduler-edit-stream-v1', [phases.measurement, phases.stress, phases.trace, phases.warmup], [seed, backend, aoMesher, chunkEdge32, schedulerWorkerCount, parameter('duration-ms', enumDomain([60000])), parameter('burst-size', enumDomain([20])), parameter('burst-interval-ms', enumDomain([2000])), shaCommand], [
    requiredMetric('scheduler.queue.depth.count@1', 'counter', 'count'), requiredMetric('scheduler.drain.ms@1', 'duration', 'ms'),
    requiredMetric('scheduler.drop.count@1', 'counter', 'count'), requiredMetric('scheduler.stale.count@1', 'counter', 'count'),
    requiredMetric('revision.latest.visible@1', 'liveness', 'revision'), requiredMetric('heartbeat.gap.ms@1', 'duration', 'ms'),
    capabilityMetric('longtask.duration.ms@1', 'long-task', 'ms', 'long-tasks'),
  ], [...commonMeshCapabilities, ...schedulerCapabilities], ['candidate', 'worker-count']),
  definition('brush-stress-v1', 'brush-command-stream-v1', [phases.stress, phases.trace, phases.warmup], [seed, backend, aoMesher, chunkEdge32, schedulerWorkerCount, parameter('edit-count', enumDomain([100, 1000])), shaCommand], [
    requiredMetric('input.revision.submit.ms@1', 'duration', 'ms'), requiredMetric('revision.latest.visible@1', 'liveness', 'revision'),
    requiredMetric('world.sha256.match@1', 'liveness', 'count'), requiredMetric('scheduler.queue.depth.count@1', 'counter', 'count'),
    requiredMetric('scheduler.drain.ms@1', 'duration', 'ms'), capabilityMetric('longtask.duration.ms@1', 'long-task', 'ms', 'long-tasks'),
  ], [...commonMeshCapabilities, ...schedulerCapabilities], ['candidate', 'worker-count']),
  definition('navigation-leak-v1', 'navigation-route-sequence-v1', [phases.leak, phases.trace], [parameter('stabilization-cycles', { kind: 'enum', values: [20] }), parameter('measurement-cycles', { kind: 'enum', values: [100] })], [
    requiredMetric('memory.bytes@1', 'memory', 'bytes', [{ key: id('memory-kind'), value: 'js-heap' }]),
    requiredMetric('memory.bytes@1', 'memory', 'bytes', [{ key: id('memory-kind'), value: 'embedder-heap' }]),
    requiredMetric('memory.bytes@1', 'memory', 'bytes', [{ key: id('memory-kind'), value: 'backing-storage' }]), requiredMetric('dom.document.count@1', 'counter', 'count'),
    requiredMetric('dom.node.count@1', 'counter', 'count'), requiredMetric('event.listener.count@1', 'counter', 'count'),
    requiredMetric('worker.active.count@1', 'counter', 'count'), requiredMetric('gpu.resource.count@1', 'counter', 'count'),
  ], capabilities([['cdp-runtime-heap-usage', 'must-support'], ['cdp-memory-dom-counters', 'must-support'], ['cdp-system-info', 'must-declare']]), ['candidate']),
  definition('backend-fixture-v1', 'backend-parity-world-v1', [phases.cold, phases.measurement, phases.trace, phases.warmup], [seed, backend, aoMesher, chunkEdge32, workerCount, parameter('camera-contract-sha256', { kind: 'sha256' }), parameter('feature-contract-sha256', { kind: 'sha256' })], [
    requiredMetric('draw.submit.cpu.ms@1', 'duration', 'ms'), requiredMetric('gpu.time.ms@1', 'gpu', 'ms'), requiredMetric('raf.interval.ms@1', 'frame', 'ms'),
    requiredMetric('memory.bytes@1', 'memory', 'bytes', [{ key: id('memory-kind'), value: 'owner-bound' }]), requiredMetric('image.contract.sha256.match@1', 'liveness', 'count'),
  ], capabilities([['performance-time-origin', 'must-support'], ['webgl-disjoint-timer-query', 'must-declare'], ['webgl2', 'must-declare'], ['webgpu-timestamp-query', 'must-declare'], ['webgpu', 'must-declare']]), ['backend', 'candidate'], backendMetricCapabilitySelections),
];

const frozenDefinitions = freezeGraph(definitions);

export const BENCHMARK_SCENARIO_METRIC_CAPABILITY_SELECTIONS_V1: readonly BenchmarkScenarioMetricCapabilitySelectionV1[] = freezeGraph(frozenDefinitions.flatMap((scenarioDefinition) => scenarioDefinition.metricCapabilitySelections));

export function resolveScenarioMetricCapabilitySelectionV1(
  scenarioId: BenchmarkScenarioIdV1,
  metricRefValue: CanonicalMetricRefV1,
  parameters: readonly { readonly key: string; readonly value: unknown }[],
  definitionValue?: BenchmarkScenarioDefinitionV1,
): readonly CanonicalIdV1[] | undefined {
  const definition = definitionValue ?? BENCHMARK_SCENARIO_REGISTRY_V1[scenarioId]?.definition;
  const selection = definition?.metricCapabilitySelections.find((entry) => entry.metricRef === metricRefValue);
  if (selection === undefined) return undefined;
  const parameterValue = parameters.find((parameter) => parameter.key === selection.parameterKey)?.value;
  const selected = selection.selections.find((entry) => entry.parameterValue === parameterValue);
  return selected === undefined ? [] : [selected.capabilityId];
}

function definitionDigest(definitionValue: BenchmarkScenarioDefinitionV1): Sha256DigestV1 {
  return digest(new TextDecoder().decode(canonicalizeJsonV1(definitionValue)));
}

export interface BenchmarkScenarioRegistryEntryV1 {
  readonly definition: BenchmarkScenarioDefinitionV1;
  readonly definitionSha256: Sha256DigestV1;
  readonly metricCapabilitySelections: readonly BenchmarkScenarioMetricCapabilitySelectionV1[];
  readonly lifecycle: { readonly status: 'contract-only' };
}

export const BENCHMARK_SCENARIO_REGISTRY_V1: Readonly<Record<BenchmarkScenarioIdV1, BenchmarkScenarioRegistryEntryV1>> = freezeGraph(Object.fromEntries(
  frozenDefinitions.map((scenarioDefinition) => [scenarioDefinition.id, {
    definition: scenarioDefinition,
    definitionSha256: definitionDigest(scenarioDefinition),
    metricCapabilitySelections: scenarioDefinition.metricCapabilitySelections,
    lifecycle: { status: 'contract-only' },
  }]),
)) as unknown as Record<BenchmarkScenarioIdV1, BenchmarkScenarioRegistryEntryV1>;

export const benchmarkScenarioDefinitionsV1 = frozenDefinitions;

const authoritativeWp04SemanticContractV1 = freezeGraph({
  wp02: {
    id: 'wp02-large-sparse-fixture',
    version: 1,
    seed: 1_212_502_868,
    worldHash: 'fnv1a32:b58829bb',
    materializedChunks: 51,
    occupiedVoxels: 97_989,
    exposedQuads: 59_350,
    triangles: 118_700,
    zoneIds: ['solid-cube', 'hollow-shell', 'staircase', 'hard-voxel-sphere', 'tunnel', 'checkerboard', 'sparse-10-percent', 'random-50-percent', 'multi-component-field'],
    zoneHashes: {
      'solid-cube': 'fnv1a32:10407d05',
      'hollow-shell': 'fnv1a32:c55f2555',
      staircase: 'fnv1a32:e6c1d5c5',
      'hard-voxel-sphere': 'fnv1a32:72435dd5',
      tunnel: 'fnv1a32:d15bdfc5',
      checkerboard: 'fnv1a32:3792d8c5',
      'sparse-10-percent': 'fnv1a32:20cfee35',
      'random-50-percent': 'fnv1a32:f4d8a372',
      'multi-component-field': 'fnv1a32:03f8db65',
    },
  },
  wp03: {
    basisWorldHash: 'fnv1a32:b58829bb',
    coveredUnitFaces: 59_350,
    coverageHash: 'sha256:3e2c700c99a650413821586a01da0705491101b2d1dc1944730acb0db006b04e',
    quads: 19_073,
    triangles: 38_146,
    meshPositionBytes: 915_504,
    meshNormalBytes: 915_504,
    meshIndexBytes: 457_752,
    meshMaterialIdBytes: 76_292,
    meshTotalBytes: 2_365_052,
  },
  wp04: {
    basisWorldHash: 'fnv1a32:b58829bb',
    paletteId: 'palette-v1',
    paletteVersion: 1,
    paletteHash: 'fnv1a32:232ad3ae',
    aoDarkness: 0.60,
    coveredUnitFaces: 59_350,
    coverageHash: 'sha256:3e2c700c99a650413821586a01da0705491101b2d1dc1944730acb0db006b04e',
    quads: 23_328,
    triangles: 46_656,
    aoHistogram: [23_958, 9_322, 22_388, 37_644],
    normalDiagonalCount: 19_585,
    flippedDiagonalCount: 3_743,
    meshPositionBytes: 1_119_744,
    meshNormalBytes: 1_119_744,
    meshIndexBytes: 559_872,
    meshMaterialIdBytes: 93_312,
    aoAttributeBytes: 93_312,
    neutralMeshTotalBytes: 2_985_984,
    packedRendererColorBytes: 279_936,
    aoSplitDeltaVsWp03: 4_255,
  },
} as const);

const authoritativeWp04SemanticBytesV1 = canonicalizeJsonV1(authoritativeWp04SemanticContractV1);
export const BENCHMARK_WP04_SEMANTIC_SHA256_V1 = sha256BytesV1(authoritativeWp04SemanticBytesV1);

export function getBenchmarkWp04SemanticBytesV1(): Uint8Array {
  return new Uint8Array(authoritativeWp04SemanticBytesV1);
}

export function isBenchmarkWp04SemanticBytesV1(value: Uint8Array): boolean {
  return sameBytes(value, authoritativeWp04SemanticBytesV1);
}

const observedBinding = <T>(value: T) => ({ status: 'observed' as const, value, sourceRef: id('source-preflight-v1'), stability: 'stable' as const });
const unavailableBinding = (reasonCode: string) => ({ status: 'unknown' as const, value: null, sourceRef: id('source-preflight-v1'), reasonCode: id(reasonCode) });

export const BENCHMARK_SOURCE_FIXTURE_BINDINGS_V1 = freezeGraph({
  'wp04-golden-world-v1': {
    sourceCommitSha: observedBinding('c64aeef1f51dd0ed2d8431411cf3ba1e84195b9d'),
    sourcePaths: observedBinding(['evidence/wp04/manifest.json', 'tests/contracts/wp02FixtureGolden.ts', 'tests/contracts/wp03GreedyGolden.ts', 'tests/contracts/wp04AoGolden.ts']),
    sourceFileSetSha256: observedBinding('sha256:5350f946fd27820d17c0c0abdcd676c87a23c319e6adb46d320ca610addcf898'),
  },
  'density-volume-suite-v1': { sourceCommitSha: unavailableBinding('owner-bound'), sourcePaths: unavailableBinding('owner-bound'), sourceFileSetSha256: unavailableBinding('owner-bound') },
  'scheduler-edit-stream-v1': { sourceCommitSha: unavailableBinding('owner-bound'), sourcePaths: unavailableBinding('owner-bound'), sourceFileSetSha256: unavailableBinding('owner-bound') },
  'brush-command-stream-v1': { sourceCommitSha: unavailableBinding('owner-bound'), sourcePaths: unavailableBinding('owner-bound'), sourceFileSetSha256: unavailableBinding('owner-bound') },
  'navigation-route-sequence-v1': { sourceCommitSha: unavailableBinding('owner-bound'), sourcePaths: unavailableBinding('owner-bound'), sourceFileSetSha256: unavailableBinding('owner-bound') },
  'backend-parity-world-v1': { sourceCommitSha: unavailableBinding('owner-bound'), sourcePaths: unavailableBinding('owner-bound'), sourceFileSetSha256: unavailableBinding('owner-bound') },
} as const);

type ExplicitMetricSpec = Omit<MetricDefinitionV1, 'schemaVersion' | 'eventSemantics' | 'populationSemantics'> & { readonly eventSemantics: string; readonly populationSemantics: string };
const metric = (spec: ExplicitMetricSpec): MetricDefinitionV1 => ({ schemaVersion: 'benchmark-metric-definition-v1', ...spec, eventSemantics: spec.eventSemantics as NonEmptyString, populationSemantics: spec.populationSemantics as NonEmptyString });
const metricDomain = (kind: BenchmarkMetricNumericDomainV1['kind']): BenchmarkMetricNumericDomainV1 => kind === 'positive-finite-number'
  ? { kind, minimum: 0, maximum: null }
  : { kind, minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const noWarmupControl: BenchmarkMetricWarmupControlV1 | null = null;
const emit = (recordName: string, ref: string, unit: BenchmarkSampleUnitV1): TelemetrySourceMappingV1 => ({ recordName: id(recordName), disposition: 'emit-sample', metricRef: metricRef(ref), unit });
const diagnostic = (recordName: string): TelemetrySourceMappingV1 => ({ recordName: id(recordName), disposition: 'diagnostic-only' });
const context = (recordName: string): TelemetrySourceMappingV1 => ({ recordName: id(recordName), disposition: 'context-only' });
const unavailable = (): TelemetrySourceMappingV1 => diagnostic('telemetry.invalidation');

const explicitMetrics: readonly MetricDefinitionV1[] = [
  metric({ metricRef: metricRef('world.mesh.total.ms@1'), kind: 'duration', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'One non-overlapping end-to-end world mesh critical path per iteration.', populationSemantics: 'One world iteration population per declared phase.', allowedContainers: ['cold', 'warm-measurement'], allowedPhases: ['cold', 'measurement'], capabilityRequirements: [], sourceMapping: [diagnostic('run.total')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('iteration-ordinal')], population: 'one non-overlapping end-to-end world mesh critical path per iteration' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('iteration-ordinal')], level: 'iteration' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: 0.10, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('chunk.mesh.cpu.ms@1'), kind: 'duration', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'Pure mesher CPU duration for one identified chunk.', populationSemantics: 'One chunk operation population per iteration and chunk.', allowedContainers: ['cold', 'warm-measurement', 'stress'], allowedPhases: ['cold', 'measurement', 'stress'], capabilityRequirements: [], sourceMapping: [emit('worker.mesh-cpu', 'chunk.mesh.cpu.ms@1', 'ms'), diagnostic('mesh.cpu')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('iteration-ordinal'), id('chunk-key')], population: 'pure mesher CPU duration for one identified chunk' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('iteration-ordinal'), id('chunk-key')], level: 'event' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: 0.10, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('snapshot.halo.build.ms@1'), kind: 'duration', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'Build duration for one identified immutable snapshot or halo.', populationSemantics: 'One chunk operation population per iteration and chunk.', allowedContainers: ['cold', 'warm-measurement', 'stress'], allowedPhases: ['cold', 'measurement', 'stress'], capabilityRequirements: [], sourceMapping: [emit('snapshot.build', 'snapshot.halo.build.ms@1', 'ms')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('iteration-ordinal'), id('chunk-key')], population: 'build duration for one identified immutable snapshot or halo' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('iteration-ordinal'), id('chunk-key')], level: 'event' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: 0.10, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('scheduler.queue.wait.ms@1'), kind: 'duration', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'Main-thread admission until dispatch of one scheduler operation.', populationSemantics: 'One scheduler operation population per operation ordinal and semantic key.', allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], sourceMapping: [emit('scheduler.queue-wait', 'scheduler.queue.wait.ms@1', 'ms')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('operation-ordinal'), id('operation-semantic-key')], population: 'main-thread admission until dispatch of one scheduler operation' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('operation-ordinal'), id('operation-semantic-key')], level: 'event' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: 0.10, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('worker.total.ms@1'), kind: 'duration', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'Worker receive, validation, compute, serialize, and post duration for one operation.', populationSemantics: 'One scheduler operation population per operation ordinal and semantic key.', allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], sourceMapping: [diagnostic('worker.validation')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('operation-ordinal'), id('operation-semantic-key')], population: 'worker receive, validation, compute, serialize, and post duration for one operation' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('operation-ordinal'), id('operation-semantic-key')], level: 'event' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: 0.10, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('adoption.cpu.ms@1'), kind: 'duration', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'Main-thread receive, validation, stale-check, and buffer adoption duration for one operation.', populationSemantics: 'One scheduler operation population per operation ordinal and semantic key.', allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], sourceMapping: [emit('result.adoption', 'adoption.cpu.ms@1', 'ms')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('operation-ordinal'), id('operation-semantic-key')], population: 'main-thread receive, validation, stale-check, and buffer adoption duration for one operation' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('operation-ordinal'), id('operation-semantic-key')], level: 'event' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: 0.10, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('input.revision.submit.ms@1'), kind: 'duration', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'Trusted input start until draw submit of the expected world revision.', populationSemantics: 'One input and revision population per input ordinal and expected world revision.', allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], sourceMapping: [emit('input-to-revision-submit', 'input.revision.submit.ms@1', 'ms')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('input-ordinal'), id('expected-world-revision')], population: 'trusted input start until draw submit of the expected world revision' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('input-ordinal'), id('expected-world-revision')], level: 'event' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: 0.10, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('raf.interval.ms@1'), kind: 'frame', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'Distance between consecutive requestAnimationFrame callbacks in one measurement block.', populationSemantics: 'One frame series population per time block; individual intervals are not directly paired.', allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [id('request-animation-frame')], sourceMapping: [emit('browser.raf-interval', 'raf.interval.ms@1', 'ms')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('time-block-ordinal')], population: 'distance between consecutive requestAnimationFrame callbacks in one measurement block' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('time-block-ordinal')], level: 'time-block' }, direction: 'context-dependent', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('longtask.duration.ms@1'), kind: 'long-task', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'Duration of each browser long task reported at or above 50 ms.', populationSemantics: 'One frame and long-task series population per time block; individual events are not directly paired.', allowedContainers: ['warm-measurement', 'stress', 'leak'], allowedPhases: ['measurement', 'stress', 'leak'], capabilityRequirements: [id('long-tasks')], sourceMapping: [emit('browser.long-task', 'longtask.duration.ms@1', 'ms')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('time-block-ordinal')], population: 'duration of each browser long task reported at or above 50 ms' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('time-block-ordinal')], level: 'time-block' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: 0.10, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('longtask.count@1'), kind: 'counter', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Number of browser long-task entries in a predefined measurement window.', populationSemantics: 'One counter population per observation window.', allowedContainers: ['warm-measurement', 'stress', 'leak'], allowedPhases: ['measurement', 'stress', 'leak'], capabilityRequirements: [id('long-tasks')], sourceMapping: [unavailable()], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('observation-window-id')], population: 'number of browser long-task entries in a predefined measurement window' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('observation-window-id')], level: 'window' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('memory.bytes@1'), kind: 'memory', unit: 'bytes', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Memory bytes for the explicitly named memory kind.', populationSemantics: 'One memory population per memory kind and checkpoint; memory kinds are never mixed.', allowedContainers: ['cold', 'warm-measurement', 'leak'], allowedPhases: ['cold', 'measurement', 'leak'], capabilityRequirements: [], sourceMapping: [diagnostic('telemetry.charged-bytes')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('memory-kind'), id('checkpoint-id')], population: 'memory bytes for one explicitly named memory kind at one checkpoint' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('memory-kind'), id('checkpoint-id')], level: 'run' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: 0.10, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('gpu.time.ms@1'), kind: 'gpu', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'Asynchronously measured GPU duration for one declared render pass and frame block.', populationSemantics: 'One GPU population per render pass and frame block.', allowedContainers: ['warm-measurement'], allowedPhases: ['measurement'], capabilityRequirements: [], sourceMapping: [unavailable()], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('render-pass-id'), id('frame-block-ordinal')], population: 'asynchronously measured GPU duration for one declared render pass and frame block' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('render-pass-id'), id('frame-block-ordinal')], level: 'time-block' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: 0.10, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('scheduler.drain.ms@1'), kind: 'duration', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'Time from deterministic burst admission until the queue is empty and all operations are terminal.', populationSemantics: 'One drain population per declared burst.', allowedContainers: ['stress'], allowedPhases: ['stress'], capabilityRequirements: [], sourceMapping: [unavailable()], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('burst-ordinal')], population: 'time from deterministic burst admission until the queue is empty' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('burst-ordinal')], level: 'burst' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: 0.10, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('scheduler.stale.count@1'), kind: 'counter', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Count of stale results discarded by the scheduler, retaining stale reason.', populationSemantics: 'One counter population per observation window and stale reason.', allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], sourceMapping: [emit('result.stale-dropped', 'scheduler.stale.count@1', 'count')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('observation-window-id'), id('stale-reason')], population: 'stale results per predefined measurement window and stale reason' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('observation-window-id'), id('stale-reason')], level: 'window' }, direction: 'context-dependent', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('scheduler.drop.count@1'), kind: 'counter', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Count of drops by declared drop kind before execution.', populationSemantics: 'One counter population per observation window and drop kind.', allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], sourceMapping: [emit('scheduler.evicted', 'scheduler.drop.count@1', 'count')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('observation-window-id'), id('drop-kind')], population: 'drops per predefined measurement window and drop kind' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('observation-window-id'), id('drop-kind')], level: 'window' }, direction: 'context-dependent', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('mesh.quads.count@1'), kind: 'counter', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Number of generated mesh quads.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['cold', 'warm-measurement', 'stress'], allowedPhases: ['cold', 'measurement', 'stress'], capabilityRequirements: [], sourceMapping: [emit('mesh.quads', 'mesh.quads.count@1', 'count')], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'higher', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('geometry.bytes@1'), kind: 'memory', unit: 'bytes', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Bytes in a completed geometry transfer.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['cold', 'warm-measurement', 'stress'], allowedPhases: ['cold', 'measurement', 'stress'], capabilityRequirements: [], sourceMapping: [emit('mesh.output-bytes', 'geometry.bytes@1', 'bytes')], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
   metric({ metricRef: metricRef('coverage.sha256.match@1'), kind: 'liveness', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Binary coverage digest equality assertion.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['cold', 'warm-measurement'], allowedPhases: ['cold', 'measurement'], capabilityRequirements: [], sourceMapping: [unavailable()], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'higher', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('scheduler.queue.depth.count@1'), kind: 'counter', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Scheduler queue depth at a declared sampling point.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], sourceMapping: [emit('scheduler.queue-depth', 'scheduler.queue.depth.count@1', 'count')], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'context-dependent', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('worker.active.count@1'), kind: 'counter', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Number of active worker jobs at a declared sampling point.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['warm-measurement', 'stress', 'leak'], allowedPhases: ['measurement', 'stress', 'leak'], capabilityRequirements: [], sourceMapping: [emit('scheduler.in-flight', 'worker.active.count@1', 'count')], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'context-dependent', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('revision.latest.visible@1'), kind: 'liveness', unit: 'revision', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Latest revision observed as visible.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], sourceMapping: [unavailable()], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'higher', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('heartbeat.gap.ms@1'), kind: 'duration', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'Gap between worker heartbeat observations.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], sourceMapping: [unavailable()], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
   metric({ metricRef: metricRef('world.sha256.match@1'), kind: 'liveness', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Binary world digest equality assertion.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], sourceMapping: [unavailable()], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'higher', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('dom.document.count@1'), kind: 'counter', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Number of live DOM documents.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['leak', 'trace'], allowedPhases: ['leak', 'trace'], capabilityRequirements: [id('cdp-memory-dom-counters')], sourceMapping: [unavailable()], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('dom.node.count@1'), kind: 'counter', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Number of live DOM nodes.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['leak', 'trace'], allowedPhases: ['leak', 'trace'], capabilityRequirements: [id('cdp-memory-dom-counters')], sourceMapping: [unavailable()], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('event.listener.count@1'), kind: 'counter', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Number of live event listeners.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['leak', 'trace'], allowedPhases: ['leak', 'trace'], capabilityRequirements: [id('cdp-runtime-heap-usage')], sourceMapping: [unavailable()], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('gpu.resource.count@1'), kind: 'counter', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Number of live GPU resources.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['leak', 'trace'], allowedPhases: ['leak', 'trace'], capabilityRequirements: [id('cdp-system-info')], sourceMapping: [unavailable()], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('draw.submit.cpu.ms@1'), kind: 'duration', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'CPU duration submitting one draw workload.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['cold', 'warm-measurement'], allowedPhases: ['cold', 'measurement'], capabilityRequirements: [], sourceMapping: [emit('draw-submit.cpu', 'draw.submit.cpu.ms@1', 'ms')], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
   metric({ metricRef: metricRef('image.contract.sha256.match@1'), kind: 'liveness', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Binary image contract equality assertion.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['cold', 'warm-measurement'], allowedPhases: ['cold', 'measurement'], capabilityRequirements: [], sourceMapping: [unavailable()], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'higher', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
];

const metricList: readonly MetricDefinitionV1[] = freezeGraph([...explicitMetrics].sort((left, right) => compareUtf16(left.metricRef, right.metricRef)));
export const BENCHMARK_METRIC_CROSSWALK_V1: readonly (readonly [string, CanonicalMetricRefV1])[] = freezeGraph([
  ['world-mesh-ms', metricRef('world.mesh.total.ms@1')], ['chunk-mesh-ms', metricRef('chunk.mesh.cpu.ms@1')], ['quad-count', metricRef('mesh.quads.count@1')],
  ['geometry-bytes', metricRef('geometry.bytes@1')], ['coverage-sha256-match', metricRef('coverage.sha256.match@1')], ['queue-depth', metricRef('scheduler.queue.depth.count@1')],
  ['active-worker-count', metricRef('worker.active.count@1')], ['adoption-ms', metricRef('adoption.cpu.ms@1')], ['latest-revision-visible', metricRef('revision.latest.visible@1')],
  ['heartbeat-gap-ms', metricRef('heartbeat.gap.ms@1')], ['long-task-ms', metricRef('longtask.duration.ms@1')], ['queue-drain-ms', metricRef('scheduler.drain.ms@1')],
  ['dropped-job-count', metricRef('scheduler.drop.count@1')], ['stale-result-count', metricRef('scheduler.stale.count@1')], ['input-to-revision-submit-ms', metricRef('input.revision.submit.ms@1')],
  ['world-sha256-match', metricRef('world.sha256.match@1')], ['js-heap-bytes', metricRef('memory.bytes@1')], ['embedder-heap-bytes', metricRef('memory.bytes@1')],
  ['backing-storage-bytes', metricRef('memory.bytes@1')], ['memory-bytes', metricRef('memory.bytes@1')], ['dom-document-count', metricRef('dom.document.count@1')],
  ['dom-node-count', metricRef('dom.node.count@1')], ['event-listener-count', metricRef('event.listener.count@1')], ['gpu-resource-count', metricRef('gpu.resource.count@1')],
  ['draw-submit-cpu-ms', metricRef('draw.submit.cpu.ms@1')], ['raf-interval-ms', metricRef('raf.interval.ms@1')], ['image-contract-sha256-match', metricRef('image.contract.sha256.match@1')],
  ['gpu-time-ms', metricRef('gpu.time.ms@1')],
]);

const telemetryMappings: readonly TelemetrySourceMappingV1[] = [
  diagnostic('run.total'), diagnostic('fixture.build'), diagnostic('halo.build'), diagnostic('mesh.cpu'), diagnostic('edge-products.build'), diagnostic('renderer.adoption'),
  diagnostic('main.frame-work'), emit('draw-submit.cpu', 'draw.submit.cpu.ms@1', 'ms'), emit('input-to-revision-submit', 'input.revision.submit.ms@1', 'ms'), emit('scheduler.queue-wait', 'scheduler.queue.wait.ms@1', 'ms'), emit('snapshot.build', 'snapshot.halo.build.ms@1', 'ms'),
  diagnostic('main-to-worker.transit-wait'), diagnostic('worker.validation'), emit('worker.mesh-cpu', 'chunk.mesh.cpu.ms@1', 'ms'), diagnostic('worker.transfer-products-build'), diagnostic('worker-to-main.transit-wait'), diagnostic('result.validation'),
  emit('result.adoption', 'adoption.cpu.ms@1', 'ms'), diagnostic('telemetry.records-written'), diagnostic('telemetry.records-dropped'), diagnostic('telemetry.observer-callbacks'), diagnostic('telemetry.observer-entries-dropped'), context('mesh.input-bytes'), emit('mesh.output-bytes', 'geometry.bytes@1', 'bytes'), emit('mesh.quads', 'mesh.quads.count@1', 'count'),
  diagnostic('scheduler.admitted'), emit('scheduler.evicted', 'scheduler.drop.count@1', 'count'), diagnostic('scheduler.coalesced'), emit('result.stale-dropped', 'scheduler.stale.count@1', 'count'), context('document.visibility'), context('document.focus'), emit('scheduler.queue-depth', 'scheduler.queue.depth.count@1', 'count'), emit('scheduler.in-flight', 'worker.active.count@1', 'count'),
  diagnostic('telemetry.open-spans'), diagnostic('telemetry.charged-bytes'), emit('browser.long-task', 'longtask.duration.ms@1', 'ms'), diagnostic('browser.event-timing'), emit('browser.raf-interval', 'raf.interval.ms@1', 'ms'), diagnostic('telemetry.invalidation'), context('high-resolution-time'), context('performance-observer'), context('long-task'), context('event-timing'), context('user-timing'), context('request-animation-frame'), context('page-visibility'), context('document-focus'), context('dedicated-worker'), diagnostic('benchmark-download'),
];

const telemetryMappingList: readonly TelemetrySourceMappingV1[] = freezeGraph([...telemetryMappings].sort((left, right) => compareUtf16(left.recordName, right.recordName)));
const metricRegistryDigestInput = {
  schemaVersion: 'benchmark-metric-registry-v1',
  protocolVersion: BENCHMARK_PROTOCOL_VERSION,
  metrics: metricList,
  telemetryMappings: telemetryMappingList,
} as const;

export const BENCHMARK_METRIC_REGISTRY_V1: MetricRegistryV1 = freezeGraph({
  ...metricRegistryDigestInput,
  metrics: metricList as unknown as NonEmptyReadonlyArray<MetricDefinitionV1>,
  telemetryMappings: telemetryMappingList as unknown as NonEmptyReadonlyArray<TelemetrySourceMappingV1>,
  metricRegistrySha256: digest(new TextDecoder().decode(canonicalizeJsonV1(metricRegistryDigestInput))),
});

export const BENCHMARK_REQUIRED_TELEMETRY_RECORD_NAMES_V1 = freezeGraph(telemetryMappingList.map((mapping) => mapping.recordName)) as readonly CanonicalIdV1[];
export const BENCHMARK_TELEMETRY_RECORD_MAPPINGS_V1 = telemetryMappingList;

export const BENCHMARK_POPULATION_FLOORS_V1 = freezeGraph({
  technicalBootstrapBrowserProcesses: 3,
  standardPerformanceCellBrowserProcesses: 5,
  warmMeasurementIterations: 30,
  coldBrowserProcesses: 10,
} as const);

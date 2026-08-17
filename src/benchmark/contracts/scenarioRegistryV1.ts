import { canonicalizeJsonV1, compareUtf16 } from '../provenance/canonicalJsonV1';
import { BENCHMARK_WARMUP_RULE_V1 } from './browserValidationV1';
import type {
  BenchmarkBackendCellV1,
  BenchmarkComparisonAxisV1,
  BenchmarkMetricDimensionContractV1,
  BenchmarkMetricGroupingV1,
  BenchmarkMetricPairingV1,
  BenchmarkMetricNumericDomainV1,
  BenchmarkMetricWarmupControlV1,
  BenchmarkMetricReachabilityEntryV1,
  BenchmarkMetricReachabilityOwnerV1,
  BenchmarkMetricProducibilityEntryV1,
  BenchmarkProcessContainerV1,
  BenchmarkSampleKindV1,
  BenchmarkSamplePhaseV1,
  BenchmarkSampleDimensionV1,
  BenchmarkSampleUnitV1,
  BenchmarkScenarioCapabilityContractV1,
  BenchmarkScenarioDefinitionV1,
  BenchmarkScenarioMetricCapabilitySelectionV1,
  BenchmarkScenarioMetricContractV1,
  BenchmarkScenarioParameterContractV1,
  BenchmarkScenarioWarmupControlV1,
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
import { BENCHMARK_PROTOCOL_VERSION, BR01_ACCEPTED_WP04_SHA } from './versions';

const id = (value: string) => value as CanonicalIdV1;
const metricRef = (value: string) => value as CanonicalMetricRefV1;

const phases = {
  cold: 'cold',
  measurement: 'measurement',
  stress: 'stress',
  trace: 'trace',
  warmup: 'warmup',
  leak: 'leak',
} as const;

const BENCHMARK_SCENARIO_DEFINITION_DIGESTS_V1: Readonly<Record<BenchmarkScenarioIdV1, Sha256DigestV1>> = {
  'mesh-golden-world-v1': 'sha256:534f20b53a436f92ffc134f28dce398f2e586069dea69d92055660a664b385eb' as Sha256DigestV1,
  'mesh-density-sweep-v1': 'sha256:7fa812d4a6b2a3eab8e42a7ab3596453520546d4ffbb5e01e57ef6b4efe5a128' as Sha256DigestV1,
  'scheduler-steady-v1': 'sha256:5a95cf466bfd780a457fd8d8154701a1e20c7302b4ec6aec1e5b6af351a2171f' as Sha256DigestV1,
  'scheduler-burst-v1': 'sha256:e2dda8bf5a264277fc30f61fa10858efb3e7702fe3dfaceb3947a427cfff2242' as Sha256DigestV1,
  'brush-stress-v1': 'sha256:f101c131a4e50df3f67f64d1dee88f0ff41bea04a9c315e2f815da66cac18e72' as Sha256DigestV1,
  'navigation-leak-v1': 'sha256:f1a5611516eee57b4c2e18f13fd2dc8142bbc7c97e7beea67da4ac2d1a50b58a' as Sha256DigestV1,
  'backend-fixture-v1': 'sha256:d7c77ae97fc787db9185ccd363276dc0c41a1763e0a57117f9bafa367a72ec84' as Sha256DigestV1,
};

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
  warmupControl: BenchmarkScenarioWarmupControlV1 | null = null,
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
    warmupControl,
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
const warmupControl = (ref: string): BenchmarkScenarioWarmupControlV1 => ({ metricRef: metricRef(ref), rule: BENCHMARK_WARMUP_RULE_V1 });

const definitions: readonly BenchmarkScenarioDefinitionV1[] = [
  definition('mesh-golden-world-v1', 'wp04-golden-world-v1', [phases.cold, phases.measurement, phases.trace, phases.warmup], [seed, backend, meshMesher, chunkEdge32, workerCount], [
    requiredMetric('world.mesh.total.ms@1', 'duration', 'ms'), requiredMetric('chunk.mesh.cpu.ms@1', 'duration', 'ms'),
    requiredMetric('mesh.quads.count@1', 'counter', 'count'), requiredMetric('geometry.bytes@1', 'memory', 'bytes'),
    requiredMetric('coverage.sha256.match@1', 'liveness', 'count'),
  ], commonMeshCapabilities, ['candidate', 'mesher'], [], warmupControl('chunk.mesh.cpu.ms@1')),
  definition('mesh-density-sweep-v1', 'density-volume-suite-v1', [phases.cold, phases.measurement, phases.trace, phases.warmup], [seed, backend, meshMesher, chunkEdge, workerCount, parameter('density-case', enumDomain(['checkerboard', 'empty', 'fifty-percent', 'full', 'ninety-percent', 'one-percent', 'ten-percent']))], [
    requiredMetric('chunk.mesh.cpu.ms@1', 'duration', 'ms'), requiredMetric('mesh.quads.count@1', 'counter', 'count'),
    requiredMetric('geometry.bytes@1', 'memory', 'bytes'), requiredMetric('coverage.sha256.match@1', 'liveness', 'count'),
  ], commonMeshCapabilities, ['candidate', 'chunk-edge', 'mesher'], [], warmupControl('chunk.mesh.cpu.ms@1')),
  definition('scheduler-steady-v1', 'scheduler-edit-stream-v1', [phases.measurement, phases.stress, phases.trace, phases.warmup], [seed, backend, aoMesher, chunkEdge32, schedulerWorkerCount, parameter('duration-ms', enumDomain([60000])), parameter('edit-interval-ms', enumDomain([250])), shaCommand], [
    requiredMetric('scheduler.queue.depth.count@1', 'counter', 'count'), requiredMetric('worker.active.count@1', 'counter', 'count'),
    requiredMetric('adoption.cpu.ms@1', 'duration', 'ms'), requiredMetric('revision.latest.visible@1', 'liveness', 'revision'),
    requiredMetric('heartbeat.gap.ms@1', 'duration', 'ms'), capabilityMetric('longtask.duration.ms@1', 'long-task', 'ms', 'long-tasks'),
  ], [...commonMeshCapabilities, ...schedulerCapabilities], ['candidate', 'worker-count'], [], warmupControl('scheduler.queue.depth.count@1')),
  definition('scheduler-burst-v1', 'scheduler-edit-stream-v1', [phases.measurement, phases.stress, phases.trace, phases.warmup], [seed, backend, aoMesher, chunkEdge32, schedulerWorkerCount, parameter('duration-ms', enumDomain([60000])), parameter('burst-size', enumDomain([20])), parameter('burst-interval-ms', enumDomain([2000])), shaCommand], [
    requiredMetric('scheduler.queue.depth.count@1', 'counter', 'count'), requiredMetric('scheduler.drain.ms@1', 'duration', 'ms'),
    requiredMetric('scheduler.drop.count@1', 'counter', 'count'), requiredMetric('scheduler.stale.count@1', 'counter', 'count'),
    requiredMetric('revision.latest.visible@1', 'liveness', 'revision'), requiredMetric('heartbeat.gap.ms@1', 'duration', 'ms'),
    capabilityMetric('longtask.duration.ms@1', 'long-task', 'ms', 'long-tasks'),
  ], [...commonMeshCapabilities, ...schedulerCapabilities], ['candidate', 'worker-count'], [], warmupControl('scheduler.queue.depth.count@1')),
  definition('brush-stress-v1', 'brush-command-stream-v1', [phases.stress, phases.trace, phases.warmup], [seed, backend, aoMesher, chunkEdge32, schedulerWorkerCount, parameter('edit-count', enumDomain([100, 1000])), shaCommand], [
    requiredMetric('input.revision.submit.ms@1', 'duration', 'ms'), requiredMetric('revision.latest.visible@1', 'liveness', 'revision'),
    requiredMetric('world.sha256.match@1', 'liveness', 'count'), requiredMetric('scheduler.queue.depth.count@1', 'counter', 'count'),
    requiredMetric('scheduler.drain.ms@1', 'duration', 'ms'), capabilityMetric('longtask.duration.ms@1', 'long-task', 'ms', 'long-tasks'),
  ], [...commonMeshCapabilities, ...schedulerCapabilities], ['candidate', 'worker-count'], [], warmupControl('input.revision.submit.ms@1')),
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
  ], capabilities([['performance-time-origin', 'must-support'], ['webgl-disjoint-timer-query', 'must-declare'], ['webgl2', 'must-declare'], ['webgpu-timestamp-query', 'must-declare'], ['webgpu', 'must-declare']]), ['backend', 'candidate'], backendMetricCapabilitySelections, warmupControl('draw.submit.cpu.ms@1')),
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
  return BENCHMARK_SCENARIO_DEFINITION_DIGESTS_V1[definitionValue.id];
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
export const BENCHMARK_WP04_SEMANTIC_SHA256_V1 = 'sha256:6481f4b81631c6bbed5560970f92aa82e51de77a233ec40d919dbbf765f99b44' as Sha256DigestV1;

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
    id: 'wp04-golden-world-v1',
    version: 1,
    sourceCommitSha: observedBinding(BR01_ACCEPTED_WP04_SHA),
    sourcePaths: observedBinding(['evidence/wp04/manifest.json', 'tests/contracts/wp02FixtureGolden.ts', 'tests/contracts/wp03GreedyGolden.ts', 'tests/contracts/wp04AoGolden.ts']),
    sourceFileSetSha256: observedBinding('sha256:5a89e11f59c2fbe1d35eaa782aed039505edbc45282302698ad4009fb04900e0'),
  },
  'density-volume-suite-v1': { id: 'density-volume-suite-v1', version: 1, sourceCommitSha: unavailableBinding('owner-bound'), sourcePaths: unavailableBinding('owner-bound'), sourceFileSetSha256: unavailableBinding('owner-bound') },
  'scheduler-edit-stream-v1': { id: 'scheduler-edit-stream-v1', version: 1, sourceCommitSha: unavailableBinding('owner-bound'), sourcePaths: unavailableBinding('owner-bound'), sourceFileSetSha256: unavailableBinding('owner-bound') },
  'brush-command-stream-v1': { id: 'brush-command-stream-v1', version: 1, sourceCommitSha: unavailableBinding('owner-bound'), sourcePaths: unavailableBinding('owner-bound'), sourceFileSetSha256: unavailableBinding('owner-bound') },
  'navigation-route-sequence-v1': { id: 'navigation-route-sequence-v1', version: 1, sourceCommitSha: unavailableBinding('owner-bound'), sourcePaths: unavailableBinding('owner-bound'), sourceFileSetSha256: unavailableBinding('owner-bound') },
  'backend-parity-world-v1': { id: 'backend-parity-world-v1', version: 1, sourceCommitSha: unavailableBinding('owner-bound'), sourcePaths: unavailableBinding('owner-bound'), sourceFileSetSha256: unavailableBinding('owner-bound') },
} as const);

type ExplicitMetricSpec = Omit<MetricDefinitionV1, 'schemaVersion' | 'eventSemantics' | 'populationSemantics' | 'dimensionContracts'> & {
  readonly eventSemantics: string;
  readonly populationSemantics: string;
  readonly dimensionContracts?: readonly BenchmarkMetricDimensionContractV1[];
};

const HIERARCHY_DIMENSION_KEYS = new Set(['hardware-profile', 'phase', 'candidate', 'iteration-ordinal', 'bootstrap-cluster-id']);

export const BENCHMARK_METRIC_DIMENSION_DOMAIN_OWNERS_V1: Readonly<Record<string, BenchmarkMetricDimensionContractV1['domain']>> = freezeGraph({
  'actual-sha256': { kind: 'sha256' },
  'burst-ordinal': { kind: 'non-negative-safe-integer' },
  'checkpoint-id': { kind: 'canonical-id' },
  'chunk-key': { kind: 'canonical-id' },
  'drop-kind': { kind: 'canonical-id' },
  'expected-sha256': { kind: 'sha256' },
  'expected-world-revision': { kind: 'non-negative-safe-integer' },
  'frame-block-ordinal': { kind: 'non-negative-safe-integer' },
  'input-ordinal': { kind: 'non-negative-safe-integer' },
  'memory-kind': { kind: 'canonical-id' },
  'observation-window-id': { kind: 'canonical-id' },
  'operation-ordinal': { kind: 'non-negative-safe-integer' },
  'operation-semantic-key': { kind: 'canonical-id' },
  'render-pass-id': { kind: 'canonical-id' },
  'stale-reason': { kind: 'canonical-id' },
  'time-block-ordinal': { kind: 'non-negative-safe-integer' },
} as const);
const derivedDimensionContracts = (metricRefValue: CanonicalMetricRefV1, grouping: BenchmarkMetricGroupingV1, pairing: BenchmarkMetricPairingV1): readonly BenchmarkMetricDimensionContractV1[] => {
  const keys = new Set([...grouping.keys, ...pairing.keys].filter((key) => !HIERARCHY_DIMENSION_KEYS.has(key)));
  if (metricRefValue.endsWith('.sha256.match@1')) {
    keys.add(id('actual-sha256'));
    keys.add(id('expected-sha256'));
  }
  return [...keys].sort(compareUtf16).map((key) => {
    const domain = BENCHMARK_METRIC_DIMENSION_DOMAIN_OWNERS_V1[key];
    if (domain === undefined) throw new Error(`No explicit dimension domain owner for ${key}.`);
    return { key, domain };
  });
};
const metric = (spec: ExplicitMetricSpec): MetricDefinitionV1 => ({
  schemaVersion: 'benchmark-metric-definition-v1',
  ...spec,
  dimensionContracts: spec.dimensionContracts ?? derivedDimensionContracts(spec.metricRef, spec.grouping, spec.pairing),
  eventSemantics: spec.eventSemantics as NonEmptyString,
  populationSemantics: spec.populationSemantics as NonEmptyString,
});
const metricDomain = (kind: BenchmarkMetricNumericDomainV1['kind']): BenchmarkMetricNumericDomainV1 => kind === 'positive-finite-number'
  ? { kind, minimum: 0, maximum: null }
  : { kind, minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const noWarmupControl: BenchmarkMetricWarmupControlV1 | null = null;
const metricWarmupControl = (ref: string, epsilon: number): BenchmarkMetricWarmupControlV1 => ({ metricRef: metricRef(ref), epsilon });
const emit = (recordName: string, ref: string, unit: BenchmarkSampleUnitV1): TelemetrySourceMappingV1 => ({ recordName: id(recordName), disposition: 'emit-sample', metricRef: metricRef(ref), unit });
const diagnostic = (recordName: string): TelemetrySourceMappingV1 => ({ recordName: id(recordName), disposition: 'diagnostic-only' });
const context = (recordName: string): TelemetrySourceMappingV1 => ({ recordName: id(recordName), disposition: 'context-only' });
const unavailable = (): TelemetrySourceMappingV1 => diagnostic('telemetry.invalidation');

interface FutureMetricProducerContractV1 {
  readonly owner: BenchmarkMetricReachabilityOwnerV1;
  readonly recordName: CanonicalIdV1;
}

export const BENCHMARK_FUTURE_METRIC_PRODUCER_CONTRACTS_V1: Readonly<Record<string, FutureMetricProducerContractV1>> = freezeGraph({
  'world.mesh.total.ms@1': { owner: 'BR02', recordName: id('run.total') },
  'chunk.mesh.cpu.ms@1': { owner: 'BR02', recordName: id('worker.mesh-cpu') },
  'mesh.quads.count@1': { owner: 'BR02', recordName: id('mesh.quads') },
  'geometry.bytes@1': { owner: 'BR02', recordName: id('mesh.output-bytes') },
  'coverage.sha256.match@1': { owner: 'BR02', recordName: id('coverage.sha256-match') },
  'longtask.duration.ms@1': { owner: 'BR02', recordName: id('browser.long-task') },
  'draw.submit.cpu.ms@1': { owner: 'BR02', recordName: id('draw-submit.cpu') },
  'raf.interval.ms@1': { owner: 'BR02', recordName: id('browser.raf-interval') },
  'scheduler.queue.depth.count@1': { owner: 'WP05', recordName: id('scheduler.queue-depth') },
  'worker.active.count@1': { owner: 'WP05', recordName: id('scheduler.in-flight') },
  'adoption.cpu.ms@1': { owner: 'WP05', recordName: id('result.adoption') },
  'revision.latest.visible@1': { owner: 'WP05', recordName: id('revision.latest-visible') },
  'heartbeat.gap.ms@1': { owner: 'WP05', recordName: id('worker.heartbeat-gap') },
  'scheduler.drain.ms@1': { owner: 'WP05', recordName: id('scheduler.drain') },
  'scheduler.drop.count@1': { owner: 'WP05', recordName: id('scheduler.evicted') },
  'scheduler.stale.count@1': { owner: 'WP05', recordName: id('result.stale-dropped') },
  'input.revision.submit.ms@1': { owner: 'WP05', recordName: id('input-to-revision-submit') },
  'world.sha256.match@1': { owner: 'WP05', recordName: id('world.sha256-match') },
  'memory.bytes@1': { owner: 'BR05', recordName: id('memory.bytes') },
  'dom.document.count@1': { owner: 'BR05', recordName: id('browser.dom-document-count') },
  'dom.node.count@1': { owner: 'BR05', recordName: id('browser.dom-node-count') },
  'event.listener.count@1': { owner: 'BR05', recordName: id('browser.event-listener-count') },
  'gpu.resource.count@1': { owner: 'BR05', recordName: id('browser.gpu-resource-count') },
  'image.contract.sha256.match@1': { owner: 'BR05', recordName: id('image.contract-sha256-match') },
  'gpu.time.ms@1': { owner: 'BR05', recordName: id('gpu.time') },
} as const);

function futureMetricProducerContract(ref: CanonicalMetricRefV1): FutureMetricProducerContractV1 {
  const contract = BENCHMARK_FUTURE_METRIC_PRODUCER_CONTRACTS_V1[ref];
  if (contract === undefined) throw new Error(`No future producer contract exists for ${ref}.`);
  return contract;
}

const explicitMetrics: readonly MetricDefinitionV1[] = [
  metric({ metricRef: metricRef('world.mesh.total.ms@1'), kind: 'duration', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'One non-overlapping end-to-end world mesh critical path per iteration.', populationSemantics: 'One world iteration population per declared phase.', allowedContainers: ['cold', 'warm-measurement'], allowedPhases: ['cold', 'measurement'], capabilityRequirements: [], sourceMapping: [emit('run.total', 'world.mesh.total.ms@1', 'ms')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('iteration-ordinal')], population: 'one non-overlapping end-to-end world mesh critical path per iteration' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('iteration-ordinal')], level: 'iteration' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: 0.10, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('chunk.mesh.cpu.ms@1'), kind: 'duration', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'Pure mesher CPU duration for one identified chunk.', populationSemantics: 'One chunk operation population per iteration and chunk.', allowedContainers: ['cold', 'warm-measurement', 'stress'], allowedPhases: ['cold', 'measurement', 'stress', 'warmup'], capabilityRequirements: [], sourceMapping: [emit('worker.mesh-cpu', 'chunk.mesh.cpu.ms@1', 'ms'), diagnostic('mesh.cpu')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('iteration-ordinal'), id('chunk-key')], population: 'pure mesher CPU duration for one identified chunk' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('iteration-ordinal'), id('chunk-key')], level: 'event' }, direction: 'lower', warmupControl: metricWarmupControl('chunk.mesh.cpu.ms@1', 0.001), practicalEffectDelta: 0.10, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('snapshot.halo.build.ms@1'), kind: 'duration', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'Build duration for one identified immutable snapshot or halo.', populationSemantics: 'One chunk operation population per iteration and chunk.', allowedContainers: ['cold', 'warm-measurement', 'stress'], allowedPhases: ['cold', 'measurement', 'stress'], capabilityRequirements: [], sourceMapping: [emit('snapshot.build', 'snapshot.halo.build.ms@1', 'ms')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('iteration-ordinal'), id('chunk-key')], population: 'build duration for one identified immutable snapshot or halo' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('iteration-ordinal'), id('chunk-key')], level: 'event' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: 0.10, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('scheduler.queue.wait.ms@1'), kind: 'duration', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'Main-thread admission until dispatch of one scheduler operation.', populationSemantics: 'One scheduler operation population per operation ordinal and semantic key.', allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], sourceMapping: [emit('scheduler.queue-wait', 'scheduler.queue.wait.ms@1', 'ms')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('operation-ordinal'), id('operation-semantic-key')], population: 'main-thread admission until dispatch of one scheduler operation' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('operation-ordinal'), id('operation-semantic-key')], level: 'event' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: 0.10, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('worker.total.ms@1'), kind: 'duration', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'Worker receive, validation, compute, serialize, and post duration for one operation.', populationSemantics: 'One scheduler operation population per operation ordinal and semantic key.', allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], sourceMapping: [diagnostic('worker.validation')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('operation-ordinal'), id('operation-semantic-key')], population: 'worker receive, validation, compute, serialize, and post duration for one operation' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('operation-ordinal'), id('operation-semantic-key')], level: 'event' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: 0.10, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('adoption.cpu.ms@1'), kind: 'duration', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'Main-thread receive, validation, stale-check, and buffer adoption duration for one operation.', populationSemantics: 'One scheduler operation population per operation ordinal and semantic key.', allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], sourceMapping: [emit('result.adoption', 'adoption.cpu.ms@1', 'ms')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('operation-ordinal'), id('operation-semantic-key')], population: 'main-thread receive, validation, stale-check, and buffer adoption duration for one operation' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('operation-ordinal'), id('operation-semantic-key')], level: 'event' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: 0.10, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('input.revision.submit.ms@1'), kind: 'duration', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'Trusted input start until draw submit of the expected world revision.', populationSemantics: 'One input and revision population per input ordinal and expected world revision.', allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress', 'warmup'], capabilityRequirements: [], sourceMapping: [emit('input-to-revision-submit', 'input.revision.submit.ms@1', 'ms')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('input-ordinal'), id('expected-world-revision')], population: 'trusted input start until draw submit of the expected world revision' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('input-ordinal'), id('expected-world-revision')], level: 'event' }, direction: 'lower', warmupControl: metricWarmupControl('input.revision.submit.ms@1', 0.001), practicalEffectDelta: 0.10, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('raf.interval.ms@1'), kind: 'frame', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'Distance between consecutive requestAnimationFrame callbacks in one measurement block.', populationSemantics: 'One frame series population per time block; individual intervals are not directly paired.', allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [id('request-animation-frame')], sourceMapping: [emit('browser.raf-interval', 'raf.interval.ms@1', 'ms')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('time-block-ordinal')], population: 'distance between consecutive requestAnimationFrame callbacks in one measurement block' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('time-block-ordinal')], level: 'time-block' }, direction: 'context-dependent', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('longtask.duration.ms@1'), kind: 'long-task', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'Duration of each browser long task reported at or above 50 ms.', populationSemantics: 'One frame and long-task series population per time block; individual events are not directly paired.', allowedContainers: ['warm-measurement', 'stress', 'leak'], allowedPhases: ['measurement', 'stress', 'leak'], capabilityRequirements: [id('long-tasks')], sourceMapping: [emit('browser.long-task', 'longtask.duration.ms@1', 'ms')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('time-block-ordinal')], population: 'duration of each browser long task reported at or above 50 ms' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('time-block-ordinal')], level: 'time-block' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: 0.10, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('longtask.count@1'), kind: 'counter', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Number of browser long-task entries in a predefined measurement window.', populationSemantics: 'One counter population per observation window.', allowedContainers: ['warm-measurement', 'stress', 'leak'], allowedPhases: ['measurement', 'stress', 'leak'], capabilityRequirements: [id('long-tasks')], sourceMapping: [unavailable()], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('observation-window-id')], population: 'number of browser long-task entries in a predefined measurement window' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('observation-window-id')], level: 'window' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('memory.bytes@1'), kind: 'memory', unit: 'bytes', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Memory bytes for the explicitly named memory kind.', populationSemantics: 'One memory population per memory kind and checkpoint; memory kinds are never mixed.', allowedContainers: ['cold', 'warm-measurement', 'leak'], allowedPhases: ['cold', 'measurement', 'leak'], capabilityRequirements: [], sourceMapping: [emit('memory.bytes', 'memory.bytes@1', 'bytes')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('memory-kind'), id('checkpoint-id')], population: 'memory bytes for one explicitly named memory kind at one checkpoint' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('memory-kind'), id('checkpoint-id')], level: 'run' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: 0.10, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('gpu.time.ms@1'), kind: 'gpu', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'Asynchronously measured GPU duration for one declared render pass and frame block.', populationSemantics: 'One GPU population per render pass and frame block.', allowedContainers: ['warm-measurement'], allowedPhases: ['measurement'], capabilityRequirements: [], sourceMapping: [emit('gpu.time', 'gpu.time.ms@1', 'ms')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('render-pass-id'), id('frame-block-ordinal')], population: 'asynchronously measured GPU duration for one declared render pass and frame block' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('render-pass-id'), id('frame-block-ordinal')], level: 'time-block' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: 0.10, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('scheduler.drain.ms@1'), kind: 'duration', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'Time from deterministic burst admission until the queue is empty and all operations are terminal.', populationSemantics: 'One drain population per declared burst.', allowedContainers: ['stress'], allowedPhases: ['stress'], capabilityRequirements: [], sourceMapping: [emit('scheduler.drain', 'scheduler.drain.ms@1', 'ms')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('burst-ordinal')], population: 'time from deterministic burst admission until the queue is empty' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('burst-ordinal')], level: 'burst' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: 0.10, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('scheduler.stale.count@1'), kind: 'counter', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Count of stale results discarded by the scheduler, retaining stale reason.', populationSemantics: 'One counter population per observation window and stale reason.', allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], sourceMapping: [emit('result.stale-dropped', 'scheduler.stale.count@1', 'count')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('observation-window-id'), id('stale-reason')], population: 'stale results per predefined measurement window and stale reason' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('observation-window-id'), id('stale-reason')], level: 'window' }, direction: 'context-dependent', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('scheduler.drop.count@1'), kind: 'counter', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Count of drops by declared drop kind before execution.', populationSemantics: 'One counter population per observation window and drop kind.', allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], sourceMapping: [emit('scheduler.evicted', 'scheduler.drop.count@1', 'count')], grouping: { keys: [id('hardware-profile'), id('phase'), id('candidate'), id('observation-window-id'), id('drop-kind')], population: 'drops per predefined measurement window and drop kind' as NonEmptyString }, pairing: { keys: [id('bootstrap-cluster-id'), id('observation-window-id'), id('drop-kind')], level: 'window' }, direction: 'context-dependent', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('mesh.quads.count@1'), kind: 'counter', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Number of generated mesh quads.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['cold', 'warm-measurement', 'stress'], allowedPhases: ['cold', 'measurement', 'stress'], capabilityRequirements: [], sourceMapping: [emit('mesh.quads', 'mesh.quads.count@1', 'count')], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'higher', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('geometry.bytes@1'), kind: 'memory', unit: 'bytes', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Bytes in a completed geometry transfer.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['cold', 'warm-measurement', 'stress'], allowedPhases: ['cold', 'measurement', 'stress'], capabilityRequirements: [], sourceMapping: [emit('mesh.output-bytes', 'geometry.bytes@1', 'bytes')], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
   metric({ metricRef: metricRef('coverage.sha256.match@1'), kind: 'liveness', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Binary coverage digest equality assertion.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['cold', 'warm-measurement'], allowedPhases: ['cold', 'measurement'], capabilityRequirements: [], sourceMapping: [emit('coverage.sha256-match', 'coverage.sha256.match@1', 'count')], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'higher', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('scheduler.queue.depth.count@1'), kind: 'counter', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Scheduler queue depth at a declared sampling point.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress', 'warmup'], capabilityRequirements: [], sourceMapping: [emit('scheduler.queue-depth', 'scheduler.queue.depth.count@1', 'count')], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'context-dependent', warmupControl: metricWarmupControl('scheduler.queue.depth.count@1', 1), practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('worker.active.count@1'), kind: 'counter', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Number of active worker jobs at a declared sampling point.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['warm-measurement', 'stress', 'leak'], allowedPhases: ['measurement', 'stress', 'leak'], capabilityRequirements: [], sourceMapping: [emit('scheduler.in-flight', 'worker.active.count@1', 'count')], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'context-dependent', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('revision.latest.visible@1'), kind: 'liveness', unit: 'revision', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Latest revision observed as visible.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], sourceMapping: [emit('revision.latest-visible', 'revision.latest.visible@1', 'revision')], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'higher', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('heartbeat.gap.ms@1'), kind: 'duration', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'Gap between worker heartbeat observations.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], sourceMapping: [emit('worker.heartbeat-gap', 'heartbeat.gap.ms@1', 'ms')], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
   metric({ metricRef: metricRef('world.sha256.match@1'), kind: 'liveness', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Binary world digest equality assertion.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['warm-measurement', 'stress'], allowedPhases: ['measurement', 'stress'], capabilityRequirements: [], sourceMapping: [emit('world.sha256-match', 'world.sha256.match@1', 'count')], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'higher', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('dom.document.count@1'), kind: 'counter', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Number of live DOM documents.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['leak', 'trace'], allowedPhases: ['leak', 'trace'], capabilityRequirements: [id('cdp-memory-dom-counters')], sourceMapping: [emit('browser.dom-document-count', 'dom.document.count@1', 'count')], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('dom.node.count@1'), kind: 'counter', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Number of live DOM nodes.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['leak', 'trace'], allowedPhases: ['leak', 'trace'], capabilityRequirements: [id('cdp-memory-dom-counters')], sourceMapping: [emit('browser.dom-node-count', 'dom.node.count@1', 'count')], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('event.listener.count@1'), kind: 'counter', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Number of live event listeners.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['leak', 'trace'], allowedPhases: ['leak', 'trace'], capabilityRequirements: [id('cdp-runtime-heap-usage')], sourceMapping: [emit('browser.event-listener-count', 'event.listener.count@1', 'count')], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
  metric({ metricRef: metricRef('gpu.resource.count@1'), kind: 'counter', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Number of live GPU resources.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['leak', 'trace'], allowedPhases: ['leak', 'trace'], capabilityRequirements: [id('cdp-system-info')], sourceMapping: [emit('browser.gpu-resource-count', 'gpu.resource.count@1', 'count')], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'lower', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
    metric({ metricRef: metricRef('draw.submit.cpu.ms@1'), kind: 'duration', unit: 'ms', numericDomain: metricDomain('positive-finite-number'), eventSemantics: 'CPU duration submitting one draw workload.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['cold', 'warm-measurement'], allowedPhases: ['cold', 'measurement', 'warmup'], capabilityRequirements: [], sourceMapping: [emit('draw-submit.cpu', 'draw.submit.cpu.ms@1', 'ms')], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'lower', warmupControl: metricWarmupControl('draw.submit.cpu.ms@1', 0.001), practicalEffectDelta: null, automaticDecision: 'forbidden' }),
   metric({ metricRef: metricRef('image.contract.sha256.match@1'), kind: 'liveness', unit: 'count', numericDomain: metricDomain('non-negative-safe-integer'), eventSemantics: 'Binary image contract equality assertion.', populationSemantics: 'Unavailable in the accepted BR04 registry; retained as a diagnostic crosswalk population.', allowedContainers: ['cold', 'warm-measurement'], allowedPhases: ['cold', 'measurement'], capabilityRequirements: [], sourceMapping: [emit('image.contract-sha256-match', 'image.contract.sha256.match@1', 'count')], grouping: { keys: [], population: 'unavailable: no concrete BR04 grouping is specified for this crosswalk metric' as NonEmptyString }, pairing: { keys: [], level: 'run' }, direction: 'higher', warmupControl: noWarmupControl, practicalEffectDelta: null, automaticDecision: 'forbidden' }),
];

const metricList: readonly MetricDefinitionV1[] = freezeGraph([...explicitMetrics].sort((left, right) => compareUtf16(left.metricRef, right.metricRef)));

function backendCells(definitionValue: BenchmarkScenarioDefinitionV1): readonly BenchmarkBackendCellV1[] {
  return definitionValue.parameterContracts.some((contract) => contract.key === 'backend')
    ? ['raw-webgpu', 'three-webgl2']
    : ['not-applicable'];
}

function phaseContainer(phase: BenchmarkSamplePhaseV1): BenchmarkProcessContainerV1 {
  return phase === 'warmup' || phase === 'measurement' ? 'warm-measurement' : phase;
}

function selectedCapability(
  definitionValue: BenchmarkScenarioDefinitionV1,
  contract: BenchmarkScenarioMetricContractV1,
  backendValue: BenchmarkBackendCellV1,
  metric: MetricDefinitionV1,
): CanonicalIdV1 {
  const selection = definitionValue.metricCapabilitySelections.find((entry) => entry.metricRef === contract.metricRef);
  const selected = selection?.selections.find((entry) => entry.parameterValue === backendValue)?.capabilityId;
  return selected ?? (contract.requirement.kind === 'when-capability-supported' ? contract.requirement.capabilityId : metric.capabilityRequirements[0] ?? id('capability-bound'));
}

function buildMetricProducibilityCrosswalk(): readonly BenchmarkMetricProducibilityEntryV1[] {
  const entries: BenchmarkMetricProducibilityEntryV1[] = [];
  for (const definitionValue of frozenDefinitions) {
    for (const phase of definitionValue.allowedPhases) {
      for (const backendValue of backendCells(definitionValue)) {
        for (const [scenarioMetricContractOrdinal, contract] of definitionValue.metricContracts.entries()) {
          const metric = metricList.find((entry) => entry.metricRef === contract.metricRef);
          if (metric === undefined) continue;
          const base = { scenarioId: definitionValue.id, phase, backend: backendValue, metricRef: contract.metricRef, scenarioMetricContractOrdinal } as const;
          const allowedInPhase = metric.allowedPhases.includes(phase);
          const allowedInContainer = metric.allowedContainers.includes(phaseContainer(phase));
          const producer = metric.sourceMapping.find((mapping) => mapping.disposition === 'emit-sample');
          if (!allowedInPhase) {
            entries.push({ ...base, classification: 'eligibility-bound-unavailable', required: false, reasonCode: 'phase-not-allowed' });
          } else if (!allowedInContainer) {
            entries.push({ ...base, classification: 'eligibility-bound-unavailable', required: false, reasonCode: 'container-not-allowed' });
          } else if (producer?.disposition === 'emit-sample' && producer.metricRef === metric.metricRef && producer.unit === metric.unit) {
            entries.push({ ...base, classification: 'emit-sample', producer: { recordName: producer.recordName, metricRef: producer.metricRef, unit: producer.unit } });
          } else if (definitionValue.metricCapabilitySelections.some((entry) => entry.metricRef === contract.metricRef)
            || metric.capabilityRequirements.length > 0
            || contract.requirement.kind === 'when-capability-supported') {
            entries.push({
              ...base,
              classification: 'capability-bound-unavailable',
              required: contract.requirement.kind === 'required',
              capabilityId: selectedCapability(definitionValue, contract, backendValue, metric),
              reasonCode: producer === undefined || producer.disposition !== 'emit-sample' ? 'producer-unavailable' : 'capability-bound',
            });
          } else {
            entries.push({
              ...base,
              classification: 'eligibility-bound-unavailable',
              required: contract.requirement.kind === 'required',
              reasonCode: metric.sourceMapping.every((mapping) => mapping.disposition === 'diagnostic-only') ? 'diagnostic-only' : 'producer-unavailable',
            });
          }
        }
      }
    }
  }
  return freezeGraph(entries.sort((left, right) => {
    const scenario = compareUtf16(left.scenarioId, right.scenarioId);
    if (scenario !== 0) return scenario;
    const phase = compareUtf16(left.phase, right.phase);
    if (phase !== 0) return phase;
    const backend = compareUtf16(left.backend, right.backend);
    if (backend !== 0) return backend;
    const metric = compareUtf16(left.metricRef, right.metricRef);
    return metric !== 0 ? metric : left.scenarioMetricContractOrdinal - right.scenarioMetricContractOrdinal;
  }));
}

export const BENCHMARK_METRIC_PRODUCIBILITY_CROSSWALK_V1 = buildMetricProducibilityCrosswalk();

function reachabilityRequirement(
  definitionValue: BenchmarkScenarioDefinitionV1,
  contract: BenchmarkScenarioMetricContractV1,
  metric: MetricDefinitionV1,
  backendValue: BenchmarkBackendCellV1,
): { readonly requirement: 'required' | 'capability-selected'; readonly capabilityId?: CanonicalIdV1 } {
  const selection = definitionValue.metricCapabilitySelections.find((entry) => entry.metricRef === contract.metricRef);
  if (selection !== undefined) return { requirement: 'capability-selected', capabilityId: selectedCapability(definitionValue, contract, backendValue, metric) };
  if (contract.requirement.kind === 'when-capability-supported') return { requirement: 'capability-selected', capabilityId: contract.requirement.capabilityId };
  const capabilityId = metric.capabilityRequirements[0];
  return capabilityId === undefined ? { requirement: 'required' } : { requirement: 'required', capabilityId };
}

function buildMetricReachabilityMatrixV1(): readonly BenchmarkMetricReachabilityEntryV1[] {
  const entries: BenchmarkMetricReachabilityEntryV1[] = [];
  for (const definitionValue of frozenDefinitions) {
    for (const phase of definitionValue.allowedPhases) {
      for (const backendValue of backendCells(definitionValue)) {
        for (const [scenarioMetricContractOrdinal, contract] of definitionValue.metricContracts.entries()) {
          const metric = metricList.find((entry) => entry.metricRef === contract.metricRef);
          if (metric === undefined) throw new Error(`Scenario metric ${contract.metricRef} is missing from the metric registry.`);
          const producer = futureMetricProducerContract(contract.metricRef);
          const requirement = reachabilityRequirement(definitionValue, contract, metric, backendValue);
          const allowed = metric.allowedPhases.includes(phase) && metric.allowedContainers.includes(phaseContainer(phase));
          const eligibility = !allowed
            ? 'not-required-in-phase' as const
            : phase === 'warmup' || phase === 'trace' || phase === 'leak'
              ? 'ineligible-phase-by-contract' as const
              : undefined;
          entries.push({
            scenarioId: definitionValue.id,
            phase,
            backend: backendValue,
            metricRef: contract.metricRef,
            scenarioMetricContractOrdinal,
            ...requirement,
            futureProducerOwner: producer.owner,
            recordName: producer.recordName,
            disposition: allowed ? 'emit-sample' : 'not-required-in-phase',
            firstWorkPackageAbleToEmit: producer.owner,
            eligibilityBeforeProducer: eligibility ?? 'ineligible-until-valid-sample-and-all-other-contracts',
            eligibilityAfterProducer: eligibility ?? 'eligible-after-valid-sample-and-all-other-contracts',
          });
        }
      }
    }
  }
  return freezeGraph(entries.sort((left, right) => {
    const scenario = compareUtf16(left.scenarioId, right.scenarioId);
    if (scenario !== 0) return scenario;
    const phase = compareUtf16(left.phase, right.phase);
    if (phase !== 0) return phase;
    const backend = compareUtf16(left.backend, right.backend);
    if (backend !== 0) return backend;
    const metric = compareUtf16(left.metricRef, right.metricRef);
    return metric !== 0 ? metric : left.scenarioMetricContractOrdinal - right.scenarioMetricContractOrdinal;
  }));
}

export const BENCHMARK_METRIC_REACHABILITY_MATRIX_V1 = buildMetricReachabilityMatrixV1();

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
  emit('run.total', 'world.mesh.total.ms@1', 'ms'), diagnostic('fixture.build'), diagnostic('halo.build'), diagnostic('mesh.cpu'), diagnostic('edge-products.build'), diagnostic('renderer.adoption'),
  diagnostic('main.frame-work'), emit('draw-submit.cpu', 'draw.submit.cpu.ms@1', 'ms'), emit('input-to-revision-submit', 'input.revision.submit.ms@1', 'ms'), emit('scheduler.queue-wait', 'scheduler.queue.wait.ms@1', 'ms'), emit('snapshot.build', 'snapshot.halo.build.ms@1', 'ms'),
  diagnostic('main-to-worker.transit-wait'), diagnostic('worker.validation'), emit('worker.mesh-cpu', 'chunk.mesh.cpu.ms@1', 'ms'), diagnostic('worker.transfer-products-build'), diagnostic('worker-to-main.transit-wait'), diagnostic('result.validation'),
  emit('result.adoption', 'adoption.cpu.ms@1', 'ms'), diagnostic('telemetry.records-written'), diagnostic('telemetry.records-dropped'), diagnostic('telemetry.observer-callbacks'), diagnostic('telemetry.observer-entries-dropped'), context('mesh.input-bytes'), emit('mesh.output-bytes', 'geometry.bytes@1', 'bytes'), emit('mesh.quads', 'mesh.quads.count@1', 'count'),
  diagnostic('scheduler.admitted'), emit('scheduler.evicted', 'scheduler.drop.count@1', 'count'), diagnostic('scheduler.coalesced'), emit('result.stale-dropped', 'scheduler.stale.count@1', 'count'), emit('revision.latest-visible', 'revision.latest.visible@1', 'revision'), emit('worker.heartbeat-gap', 'heartbeat.gap.ms@1', 'ms'), emit('scheduler.drain', 'scheduler.drain.ms@1', 'ms'), emit('world.sha256-match', 'world.sha256.match@1', 'count'), context('document.visibility'), context('document.focus'), emit('scheduler.queue-depth', 'scheduler.queue.depth.count@1', 'count'), emit('scheduler.in-flight', 'worker.active.count@1', 'count'),
  diagnostic('telemetry.open-spans'), diagnostic('telemetry.charged-bytes'), diagnostic('telemetry.invalidation'), emit('memory.bytes', 'memory.bytes@1', 'bytes'), emit('browser.dom-document-count', 'dom.document.count@1', 'count'), emit('browser.dom-node-count', 'dom.node.count@1', 'count'), emit('browser.event-listener-count', 'event.listener.count@1', 'count'), emit('browser.gpu-resource-count', 'gpu.resource.count@1', 'count'), emit('browser.long-task', 'longtask.duration.ms@1', 'ms'), diagnostic('browser.event-timing'), emit('browser.raf-interval', 'raf.interval.ms@1', 'ms'), emit('coverage.sha256-match', 'coverage.sha256.match@1', 'count'), emit('gpu.time', 'gpu.time.ms@1', 'ms'), emit('image.contract-sha256-match', 'image.contract.sha256.match@1', 'count'), context('high-resolution-time'), context('performance-observer'), context('long-task'), context('event-timing'), context('user-timing'), context('request-animation-frame'), context('page-visibility'), context('document-focus'), context('dedicated-worker'), diagnostic('benchmark-download'),
];

const telemetryMappingList: readonly TelemetrySourceMappingV1[] = freezeGraph([...telemetryMappings].sort((left, right) => compareUtf16(left.recordName, right.recordName)));
const metricRegistryDigestInput = {
  schemaVersion: 'benchmark-metric-registry-v1',
  protocolVersion: BENCHMARK_PROTOCOL_VERSION,
  metrics: metricList,
  telemetryMappings: telemetryMappingList,
  producibilityCrosswalk: BENCHMARK_METRIC_PRODUCIBILITY_CROSSWALK_V1,
  reachabilityMatrix: BENCHMARK_METRIC_REACHABILITY_MATRIX_V1,
} as const;

export const BENCHMARK_METRIC_REGISTRY_V1: MetricRegistryV1 = freezeGraph({
  ...metricRegistryDigestInput,
  metrics: metricList as unknown as NonEmptyReadonlyArray<MetricDefinitionV1>,
  telemetryMappings: telemetryMappingList as unknown as NonEmptyReadonlyArray<TelemetrySourceMappingV1>,
  producibilityCrosswalk: BENCHMARK_METRIC_PRODUCIBILITY_CROSSWALK_V1 as unknown as NonEmptyReadonlyArray<BenchmarkMetricProducibilityEntryV1>,
  reachabilityMatrix: BENCHMARK_METRIC_REACHABILITY_MATRIX_V1 as unknown as NonEmptyReadonlyArray<BenchmarkMetricReachabilityEntryV1>,
  metricRegistrySha256: 'sha256:4deeb759d0823ae842e453bd00276a98b9418866528210c70a30569c1f14b3f5' as Sha256DigestV1,
});

export const BENCHMARK_REQUIRED_TELEMETRY_RECORD_NAMES_V1 = freezeGraph(telemetryMappingList.map((mapping) => mapping.recordName)) as readonly CanonicalIdV1[];
export const BENCHMARK_TELEMETRY_RECORD_MAPPINGS_V1 = telemetryMappingList;

export const BENCHMARK_POPULATION_FLOORS_V1 = freezeGraph({
  technicalBootstrapBrowserProcesses: 3,
  standardPerformanceCellBrowserProcesses: 5,
  warmMeasurementIterations: 30,
  coldBrowserProcesses: 10,
} as const);

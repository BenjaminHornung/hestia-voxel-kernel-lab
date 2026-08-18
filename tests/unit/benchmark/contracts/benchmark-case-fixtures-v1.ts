import { calculateRunBindingSha256V1 } from '../../../../src/benchmark/contracts/validateV1';
import { sha256BytesV1 } from '../../../../src/benchmark/provenance/fileSetDigestV1';
import { compareUtf16 } from '../../../../src/benchmark/provenance/canonicalJsonV1';
import type { BenchmarkValidationContextV1, BenchmarkValidationReceiptInputV1 } from '../../../../src/benchmark/contracts/typesV1';
import { BENCHMARK_METRIC_REACHABILITY_MATRIX_V1, BENCHMARK_METRIC_REGISTRY_V1, BENCHMARK_SCENARIO_REGISTRY_V1, BENCHMARK_SOURCE_FIXTURE_BINDINGS_V1 } from '../../../../src/benchmark/contracts/scenarioRegistryV1';
import { BENCHMARK_SCHEMA_SET_SHA256_V1 } from '../../../../src/benchmark/contracts/schemaSetV1';
import {
  BENCHMARK_TEST_METRIC_FIXTURES_V1,
  BENCHMARK_TEST_SCENARIO_DEFINITION_DIGESTS_V1,
  BENCHMARK_TEST_SCENARIO_DEFINITIONS_V1,
} from '../../../../tests/contracts/benchmark/scenario-fixtures-v1';
import { BENCHMARK_TEST_SCHEMA_SET_BYTES_V1 } from './benchmark-case-runtime-v1';

export const BENCHMARK_SCHEMA_SET_BYTES_V1 = BENCHMARK_TEST_SCHEMA_SET_BYTES_V1;
export { BENCHMARK_TEST_SCENARIO_DEFINITIONS_V1 } from '../../../../tests/contracts/benchmark/scenario-fixtures-v1';

type JsonRecord = Record<string, unknown>;

const DIGEST = `sha256:${'a'.repeat(64)}`;
const GIT_SHA = 'a'.repeat(40);
const SOURCE_PATHS = ['evidence/wp04/ao-level-debug.png', 'evidence/wp04/manifest.json'] as const;
const CANDIDATE_PATHS = ['src/main.ts'] as const;
const scenarioDefinitions = Object.fromEntries(BENCHMARK_TEST_SCENARIO_DEFINITIONS_V1.map((definition) => [definition.id, definition]));
const metricFixtures = BENCHMARK_TEST_METRIC_FIXTURES_V1;
const requiredSampleDimensions: Readonly<Record<string, readonly { readonly key: string; readonly value: string | number | boolean }[]>> = {
  'chunk.mesh.cpu.ms@1': [{ key: 'chunk-key', value: 'chunk-0' }],
  'snapshot.halo.build.ms@1': [{ key: 'chunk-key', value: 'chunk-0' }],
  'scheduler.queue.wait.ms@1': [{ key: 'operation-ordinal', value: 0 }, { key: 'operation-semantic-key', value: 'operation-0' }],
  'worker.total.ms@1': [{ key: 'operation-ordinal', value: 0 }, { key: 'operation-semantic-key', value: 'operation-0' }],
  'adoption.cpu.ms@1': [{ key: 'operation-ordinal', value: 0 }, { key: 'operation-semantic-key', value: 'operation-0' }],
  'input.revision.submit.ms@1': [{ key: 'input-ordinal', value: 0 }, { key: 'expected-world-revision', value: 1 }],
  'raf.interval.ms@1': [{ key: 'time-block-ordinal', value: 0 }],
  'longtask.duration.ms@1': [{ key: 'time-block-ordinal', value: 0 }],
  'longtask.count@1': [{ key: 'observation-window-id', value: 'window-0' }],
  'memory.bytes@1': [{ key: 'memory-kind', value: 'owner-bound' }, { key: 'checkpoint-id', value: 'checkpoint-0' }],
  'gpu.time.ms@1': [{ key: 'render-pass-id', value: 'pass-0' }, { key: 'frame-block-ordinal', value: 0 }],
  'scheduler.drain.ms@1': [{ key: 'burst-ordinal', value: 0 }],
  'scheduler.stale.count@1': [{ key: 'observation-window-id', value: 'window-0' }, { key: 'stale-reason', value: 'stale' }],
  'scheduler.drop.count@1': [{ key: 'observation-window-id', value: 'window-0' }, { key: 'drop-kind', value: 'evicted' }],
};

function observed<T>(value: T, sourceRef = 'capture-v1'): JsonRecord {
  return { status: 'observed', value, sourceRef, stability: 'stable' };
}

function declared<T>(value: T, sourceRef = 'plan-v1'): JsonRecord {
  return { status: 'declared', value, sourceRef, stability: 'run-config' };
}

const fixture = (id: string) => {
  const binding = BENCHMARK_SOURCE_FIXTURE_BINDINGS_V1[id as keyof typeof BENCHMARK_SOURCE_FIXTURE_BINDINGS_V1] as any;
  if (binding !== undefined
    && binding.sourceCommitSha.status === 'observed'
    && binding.sourcePaths.status === 'observed'
    && binding.sourceFileSetSha256.status === 'observed') {
    return {
      id,
      version: binding.version,
      semanticSha256: observed(DIGEST),
      sourceCommitSha: observed(binding.sourceCommitSha.value),
      sourceFileSetSha256: observed(binding.sourceFileSetSha256.value),
      sourcePaths: observed(binding.sourcePaths.value),
    };
  }
  return {
    id,
    version: 1,
    semanticSha256: observed(DIGEST),
    sourceCommitSha: declared(GIT_SHA),
    sourceFileSetSha256: observed(DIGEST),
    sourcePaths: observed(SOURCE_PATHS),
  };
};

function fixtureHasCanonicalObservedBinding(value: JsonRecord): boolean {
  const binding = BENCHMARK_SOURCE_FIXTURE_BINDINGS_V1[value.id as keyof typeof BENCHMARK_SOURCE_FIXTURE_BINDINGS_V1] as any;
  const semanticSha256 = value.semanticSha256 as JsonRecord | undefined;
  const sourceCommitSha = value.sourceCommitSha as JsonRecord | undefined;
  const sourcePaths = value.sourcePaths as JsonRecord | undefined;
  const sourceFileSetSha256 = value.sourceFileSetSha256 as JsonRecord | undefined;
  return binding !== undefined
    && binding.id === value.id
    && binding.version === value.version
    && binding.sourceCommitSha.status === 'observed'
    && binding.sourcePaths.status === 'observed'
    && binding.sourceFileSetSha256.status === 'observed'
    && semanticSha256?.status === 'observed'
    && sourceCommitSha?.status === 'observed'
    && sourcePaths?.status === 'observed'
    && sourceFileSetSha256?.status === 'observed'
    && JSON.stringify(sourceCommitSha.value) === JSON.stringify(binding.sourceCommitSha.value)
    && JSON.stringify(sourcePaths.value) === JSON.stringify(binding.sourcePaths.value)
    && JSON.stringify(sourceFileSetSha256.value) === JSON.stringify(binding.sourceFileSetSha256.value);
}

const baseSource = {
  schemaVersion: 'benchmark-source-provenance-v1',
  repositoryUrl: 'https://github.com/BenjaminHornung/hestia-voxel-kernel-lab',
  commitSha: GIT_SHA,
  commitTreeSha: GIT_SHA,
  worktree: {
    state: 'clean',
    statusCommand: 'git status --porcelain=v2 -z --untracked-files=all --ignore-submodules=none',
    statusOutputSha256: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    submodules: [],
  },
  build: {
    algorithmVersion: 'hestia-benchmark-build-sha256-v1',
    rootPath: 'dist',
    sha256: DIGEST,
    fileCount: 1,
    totalBytes: 1,
  },
  fixture: fixture('wp04-golden-world-v1'),
  candidate: {
    id: 'candidate-v1',
    version: 1,
    sourceFileSetSha256: observed(DIGEST),
    sourcePaths: observed(CANDIDATE_PATHS),
  },
};

function sourceFor(fixtureId: string): JsonRecord {
  return { ...baseSource, fixture: fixture(fixtureId) };
}

function capability(id: string, status: 'observed' | 'declared' | 'unsupported' = 'declared'): JsonRecord {
  return status === 'observed'
    ? { id, value: observed(true) }
    : status === 'declared'
      ? { id, value: declared(true) }
      : { id, value: { status, value: null, sourceRef: 'capture-v1', reasonCode: 'api-not-supported' } };
}

function environment(scenarioId: string, options: { readonly backend?: 'three-webgl2' | 'raw-webgpu'; readonly webgpuTimestamp?: 'unsupported' } = {}): JsonRecord {
  const definition = scenarioDefinitions[scenarioId] as any;
  const requiredCapabilities = definition.capabilityContracts.map((contract: any) => capability(contract.id, contract.requirement === 'must-support' || contract.id === 'webgl2' || contract.id === 'webgpu' ? 'observed' : 'declared'));
  const sampledMetricCapabilityIds = new Set<string>(definition.metricContracts
    .filter((contract: any) => contract.requirement.kind === 'required' || contract.requirement.capabilityId !== 'webgpu-timestamp-query')
    .flatMap((contract: any) => metricFixtures[contract.metricRef as keyof typeof metricFixtures]?.capabilityRequirements ?? [])
    .map((value: unknown) => String(value)));
  for (const capabilityId of sampledMetricCapabilityIds) {
    const index = requiredCapabilities.findIndex((entry: JsonRecord) => entry.id === capabilityId);
    if (index >= 0) requiredCapabilities[index] = capability(capabilityId, 'observed');
    else requiredCapabilities.push(capability(capabilityId, 'observed'));
  }
  if (!requiredCapabilities.some((entry: JsonRecord) => entry.id === 'webgl2')) requiredCapabilities.push(capability('webgl2', 'observed'));
  if (!requiredCapabilities.some((entry: JsonRecord) => entry.id === 'webgpu')) requiredCapabilities.push(capability('webgpu', 'observed'));
  if (options.webgpuTimestamp === 'unsupported') {
    const index = requiredCapabilities.findIndex((entry: JsonRecord) => entry.id === 'webgpu-timestamp-query');
    if (index >= 0) requiredCapabilities[index] = capability('webgpu-timestamp-query', 'unsupported');
  }
  const backendCapabilityId = options.backend === 'raw-webgpu' ? 'webgpu-timestamp-query' : 'webgl-disjoint-timer-query';
  const backendCapabilityIndex = requiredCapabilities.findIndex((entry: JsonRecord) => entry.id === backendCapabilityId);
  const backendCapabilityStatus = backendCapabilityId === 'webgpu-timestamp-query' && options.webgpuTimestamp === 'unsupported' ? 'unsupported' : 'observed';
  if (backendCapabilityIndex >= 0) requiredCapabilities[backendCapabilityIndex] = capability(backendCapabilityId, backendCapabilityStatus);
  else requiredCapabilities.push(capability(backendCapabilityId, backendCapabilityStatus));
  return {
    schemaVersion: 'benchmark-environment-manifest-v1',
     hardwareProfileId: observed('h1-ci'),
     hardwareProfileTier: observed('H1'),
     gateRole: observed('correctness-only'),
     os: { name: observed('windows'), version: observed('11'), architecture: observed('x64') },
     cpu: { vendor: observed('test'), model: observed('test-cpu'), physicalCores: observed(4), logicalCores: observed(8), ramBytes: observed(1) },
     gpu: { vendor: observed('test'), device: observed('test-gpu'), driver: observed('test-driver'), graphicsBackend: observed('webgl2') },
     browser: { product: observed('chromium'), version: observed('1'), channel: observed('stable'), userAgent: observed('test'), executableSha256: observed(DIGEST), headless: observed(false), flags: observed([]) },
     display: { cssWidth: observed(1920), cssHeight: observed(1080), devicePixelRatio: observed(1), refreshHz: observed(60), vsync: observed('enabled') },
     power: { source: observed('ac'), profile: observed('balanced'), battery: observed({ status: 'not-applicable' }) },
     runtimeState: { visibility: observed('visible'), focus: observed('focused'), backgroundTabs: observed(0), competingLoad: observed({ status: 'none' }), thermalState: observed('nominal') },
    capabilities: requiredCapabilities.sort((left: JsonRecord, right: JsonRecord) => compareUtf16(String(left.id), String(right.id))),
  };
}

function parameterValue(key: string, scenarioId: string, backend: 'three-webgl2' | 'raw-webgpu'): string | number {
  if (key === 'seed') return 1;
  if (key === 'backend') return backend;
  if (key === 'mesher') return scenarioId === 'mesh-golden-world-v1' ? 'greedy' : 'greedy-ao';
  if (key === 'chunk-edge') return 32;
  if (key === 'worker-count') return scenarioId.startsWith('scheduler') || scenarioId === 'brush-stress-v1' ? 1 : 0;
  if (key === 'duration-ms') return 60_000;
  if (key === 'edit-interval-ms') return 250;
  if (key === 'burst-size') return 20;
  if (key === 'burst-interval-ms') return 2_000;
  if (key === 'edit-count') return 100;
  if (key === 'density-case') return 'empty';
  if (key === 'stabilization-cycles') return 20;
  if (key === 'measurement-cycles') return 100;
  return DIGEST;
}

function parameters(scenarioId: string, backend: 'three-webgl2' | 'raw-webgpu'): readonly JsonRecord[] {
  return (scenarioDefinitions[scenarioId] as any).parameterContracts
     .map((contract: any) => ({ key: contract.key, value: parameterValue(contract.key, scenarioId, backend) }));
}

function sampleDimensions(metricRef: string, contract: any): readonly JsonRecord[] {
  const dimensions = new Map<string, string | number | boolean>();
  for (const dimension of requiredSampleDimensions[metricRef] ?? []) dimensions.set(dimension.key, dimension.value);
  for (const dimension of contract.dimensions ?? []) dimensions.set(dimension.key, dimension.value);
  if (metricRef.includes('sha256.match')) {
    dimensions.set('actual-sha256', DIGEST);
    dimensions.set('expected-sha256', DIGEST);
  }
  return [...dimensions.entries()]
    .sort(([left], [right]) => compareUtf16(left, right))
    .map(([key, value]) => ({ key, value }));
}

function ids(slotId: string, runId = 'measurement-run'): JsonRecord {
  return {
    slotId,
    browserProcessId: 'browser-process-1',
    bootstrapClusterId: 'bootstrap-cluster-process',
    pairCellId: `pair-cell-${runId}`,
    pairOrdinal: 1,
    ownership: { slotId: 'BR03', browserProcessId: 'BR03', bootstrapClusterId: 'BR03', pairCellId: 'BR03', pairOrdinal: 'BR03' },
  };
}

function processIds(): JsonRecord {
  return {
    slotId: 'slot-process',
    browserProcessId: 'browser-process-1',
    bootstrapClusterId: 'bootstrap-cluster-process',
    pairCellId: 'pair-cell-process',
    pairOrdinal: 1,
    ownership: { slotId: 'BR03', browserProcessId: 'BR03', bootstrapClusterId: 'BR03', pairCellId: 'BR03', pairOrdinal: 'BR03' },
  };
}

function execution(
  phase: string,
  container: string,
  measurementEligibility: 'eligible' | 'ineligible',
  validity: JsonRecord,
  origin: JsonRecord = { kind: 'planned' },
  executionIteration = 0,
  sequencePosition = executionIteration,
): JsonRecord {
  return {
    schemaVersion: 'benchmark-execution-descriptor-v1',
    processContainer: container,
    phase,
    processOrdinal: 0,
    iteration: executionIteration,
    runPlanId: 'plan-v1',
    runPlanSha256: DIGEST,
    order: { scheme: 'single-candidate', orderSeed: 1, blockId: 'block-1', sequencePosition, candidateId: 'candidate-v1' },
    pageState: { visibility: 'visible', focus: 'focused', backgroundTabs: 0 },
    measurementEligibility,
    origin,
    validity,
  };
}

function metricSamples(runId: string, scenarioId: string, phase: string, runBindingSha256: string, counterZero: boolean, backend: 'three-webgl2' | 'raw-webgpu', webgpuTimestamp?: 'unsupported', sampleOrdinalStart = 0): readonly JsonRecord[] {
  const definition = scenarioDefinitions[scenarioId] as any;
  return definition.metricContracts
     .filter((contract: any) => {
       const metricDefinition = BENCHMARK_METRIC_REGISTRY_V1.metrics.find((entry) => entry.metricRef === contract.metricRef)!;
       const phaseContainer = phase === 'measurement' || phase === 'warmup' ? 'warm-measurement' : phase;
       return metricDefinition.allowedPhases.includes(phase as never) && metricDefinition.allowedContainers.includes(phaseContainer as never)
         && (contract.metricRef !== 'gpu.time.ms@1'
           || (phase === 'measurement' && (backend === 'three-webgl2' || webgpuTimestamp !== 'unsupported')))
         && (contract.metricRef !== 'raf.interval.ms@1' || phase === 'measurement' || phase === 'stress');
     })
      .map((contract: any, ordinal: number) => {
      const metricRef = contract.metricRef;
      const metric = metricFixtures[metricRef as keyof typeof metricFixtures];
     const isMatch = metricRef.includes('sha256.match');
     const sampleOrdinal = sampleOrdinalStart + ordinal;
     return {
       schemaVersion: 'benchmark-raw-sample-v1',
        sampleId: `${runId}-sample-${sampleOrdinal}`,
       ordinal: sampleOrdinal,
      iterationId: 'iteration-0',
      phase,
      metricRef,
       kind: metric.kind,
      realm: 'main',
      observedAt: { clock: 'performance-time-origin', realmId: 'main-realm', timeOriginEpochMs: 1, startMs: ordinal + 1 },
       unit: metric.unit,
      result: { status: 'valid', value: isMatch ? 1 : metric.kind === 'counter' && counterZero ? 0 : 1 },
       dimensions: sampleDimensions(metricRef, contract),
      runBindingSha256,
    };
    });
}

function run(
  runId: string,
  scenarioId: string,
  phase: string,
  container: string,
  measurementEligibility: 'eligible' | 'ineligible',
   options: { readonly samples?: boolean; readonly counterZero?: boolean; readonly invalid?: boolean; readonly rerun?: boolean; readonly backend?: 'three-webgl2' | 'raw-webgpu'; readonly webgpuTimestamp?: 'unsupported'; readonly iterationCount?: number; readonly executionIteration?: number; readonly sequencePosition?: number } = {},
): JsonRecord {
  const definition = scenarioDefinitions[scenarioId] as any;
  const backend = options.backend ?? 'three-webgl2';
  const runValue: JsonRecord = {
    schemaVersion: 'benchmark-run-v1',
    protocolVersion: 'benchmark-protocol-v1',
    runId,
    createdUtc: '2026-08-13T12:00:00.000Z',
    hardwareCellId: 'hardware-cell-1',
    browserProcessId: 'browser-process-1',
     ids: ids(runId === 'measurement-run' ? 'slot-measurement' : 'slot-warmup', runId),
     source: sourceFor(definition.fixtureContractId),
     scenario: { id: scenarioId, version: 1, definitionSha256: BENCHMARK_TEST_SCENARIO_DEFINITION_DIGESTS_V1[scenarioId as keyof typeof BENCHMARK_TEST_SCENARIO_DEFINITION_DIGESTS_V1], fixture: fixture(definition.fixtureContractId), parameters: parameters(scenarioId, backend) },
     environment: environment(scenarioId, { backend, webgpuTimestamp: options.webgpuTimestamp }),
    execution: execution(
      phase,
      container,
      measurementEligibility,
      options.invalid ? { status: 'invalid', reasons: [{ code: 'sample-invalid', detail: 'fixture invalidation', phase }] } : { status: 'valid' },
      options.rerun ? { kind: 'infrastructure-rerun', replacesRunId: 'previous-run', approvalId: 'approval-1', reason: 'infrastructure-failure' } : undefined,
      options.executionIteration,
      options.sequencePosition,
    ),
    runBindingSha256: DIGEST,
    measurementEligible: measurementEligibility === 'eligible',
       measurementEligibilityReasons: options.invalid
         ? [{ code: 'sample-invalid', detail: 'fixture invalidation', phase }]
        : measurementEligibility === 'ineligible' && (phase === 'measurement' || phase === 'cold' || phase === 'stress')
             ? [{ code: fixtureHasCanonicalObservedBinding(sourceFor(definition.fixtureContractId).fixture as JsonRecord) ? (options.samples === true ? 'environment-incomplete' : 'metric-not-producible') : 'fixture-contract-mismatch', detail: 'eligibility gate', phase }]
           : [],
     iterations: options.samples ? Array.from({ length: options.iterationCount ?? 1 }, (_, iterationOrdinal) => ({ schemaVersion: 'benchmark-iteration-v1', iterationId: `iteration-${iterationOrdinal}`, iterationOrdinal, runId, phase, samples: [] })) : [],
  };
  const binding = calculateRunBindingSha256V1(runValue as never);
  runValue.runBindingSha256 = binding;
   const iterations = runValue.iterations as JsonRecord[];
   let sampleOrdinal = 0;
    for (const iteration of iterations) {
       const samples = metricSamples(runId, scenarioId, phase, binding, options.counterZero === true, backend, options.webgpuTimestamp, sampleOrdinal);
      iteration.samples = samples.map((sample) => ({ ...sample, iterationId: iteration.iterationId }));
     sampleOrdinal += samples.length;
   }
  return runValue;
}

export function createBenchmarkCaseDocumentV1(options: {
  readonly scenarioId?: string;
  readonly phase?: string;
  readonly container?: string;
  readonly measurementEligibility?: 'eligible' | 'ineligible';
  readonly samples?: boolean;
  readonly counterZero?: boolean;
  readonly invalid?: boolean;
  readonly rerun?: boolean;
  readonly backend?: 'three-webgl2' | 'raw-webgpu';
  readonly webgpuTimestamp?: 'unsupported';
  readonly iterationCount?: number;
  readonly executionIteration?: number;
  readonly sequencePosition?: number;
} = {}): JsonRecord {
  const scenarioId = options.scenarioId ?? 'mesh-golden-world-v1';
  const phase = options.phase ?? 'measurement';
  const container = options.container ?? (phase === 'measurement' || phase === 'warmup' ? 'warm-measurement' : phase);
   const measurementEligibility = options.measurementEligibility ?? 'ineligible';
   const measurementRun = run('measurement-run', scenarioId, phase, container, measurementEligibility, { ...options, executionIteration: phase === 'measurement' ? 11 : options.executionIteration, sequencePosition: phase === 'measurement' ? 11 : options.sequencePosition });
   const runs = phase === 'measurement' && container === 'warm-measurement'
      ? [
        ...Array.from({ length: 11 }, (_, index) => run(`warmup-run-${index + 1}`, scenarioId, 'warmup', 'warm-measurement', 'ineligible', { backend: options.backend, webgpuTimestamp: options.webgpuTimestamp, samples: true, executionIteration: index, sequencePosition: index })),
        measurementRun,
      ]
     : [measurementRun];
  return {
    schemaVersion: 'benchmark-hardware-cell-v1',
    hardwareCellId: 'hardware-cell-1',
     source: sourceFor((scenarioDefinitions[scenarioId] as any).fixtureContractId),
    scenarioId,
    scenarioVersion: 1,
    hardwareProfileId: 'h1-ci',
     environment: environment(scenarioId, { backend: options.backend, webgpuTimestamp: options.webgpuTimestamp }),
    measurementEligible: runs.some((entry) => (entry as JsonRecord).measurementEligible === true),
     measurementEligibilityReasons: (measurementRun.measurementEligibilityReasons as JsonRecord[]).map((reason) => ({ ...reason, detail: 'eligibility gate' })),
     browserProcesses: [{ schemaVersion: 'benchmark-browser-process-v1', browserProcessId: 'browser-process-1', hardwareCellId: 'hardware-cell-1', source: sourceFor((scenarioDefinitions[scenarioId] as any).fixtureContractId), environment: environment(scenarioId, { backend: options.backend, webgpuTimestamp: options.webgpuTimestamp }), ids: processIds(), runs }],
  };
}

export function applySyntheticFutureProducerRecordsV1(document: any, recordNames: readonly string[]): void {
  const process = document.browserProcesses[0];
  const run = process.runs.at(-1);
  const backend = run.scenario.parameters.find((parameter: JsonRecord) => parameter.key === 'backend')?.value ?? 'not-applicable';
  const reachable = BENCHMARK_METRIC_REACHABILITY_MATRIX_V1.filter((entry) => entry.scenarioId === run.scenario.id
    && entry.phase === run.execution.phase
    && entry.backend === backend
    && entry.disposition === 'emit-sample'
    && recordNames.includes(entry.recordName));
  const metricRefs = new Set<string>(reachable.map((entry) => entry.metricRef));
  for (const iteration of run.iterations) {
    iteration.samples = iteration.samples
      .filter((sample: JsonRecord) => metricRefs.has(String(sample.metricRef)))
      .map((sample: JsonRecord, ordinal: number) => ({ ...sample, ordinal }));
  }
  if (!recordNames.includes('browser.long-task')) {
    const environments = [document.environment, process.environment, ...process.runs.map((candidate: JsonRecord) => candidate.environment)];
    for (const environment of environments) {
      const capability = environment.capabilities.find((entry: JsonRecord) => entry.id === 'long-tasks');
      if (capability !== undefined) capability.value = { status: 'unsupported', value: null, sourceRef: 'capture-v1', reasonCode: 'synthetic-record-omitted' };
    }
  }
   const hasRecords = recordNames.length > 0;
   const eligible = hasRecords && fixtureHasCanonicalObservedBinding(run.source.fixture);
   const requiresEligibilityReason = run.execution.phase === 'cold' || run.execution.phase === 'measurement' || run.execution.phase === 'stress';
   const reason = fixtureHasCanonicalObservedBinding(run.source.fixture) ? 'metric-not-producible' : 'fixture-contract-mismatch';
   run.execution.measurementEligibility = eligible ? 'eligible' : 'ineligible';
   run.measurementEligible = eligible;
   run.measurementEligibilityReasons = eligible || !requiresEligibilityReason ? [] : [{ code: reason, detail: 'eligibility gate', phase: run.execution.phase }];
  for (const candidate of process.runs) {
    candidate.runBindingSha256 = calculateRunBindingSha256V1(candidate);
    for (const iteration of candidate.iterations) for (const sample of iteration.samples) sample.runBindingSha256 = candidate.runBindingSha256;
  }
   document.measurementEligible = eligible;
   document.measurementEligibilityReasons = eligible || !requiresEligibilityReason ? [] : [{ code: reason, detail: 'eligibility gate', phase: run.execution.phase }];
}

export function createTwoIterationBenchmarkCaseDocumentV1(): any {
  return createBenchmarkCaseDocumentV1({ samples: true, iterationCount: 2 });
}

export function createTwoProcessWarmMeasurementDocumentV1(): any {
  const document = JSON.parse(JSON.stringify(createBenchmarkCaseDocumentV1({ samples: true }))) as any;
  const process = JSON.parse(JSON.stringify(document.browserProcesses[0])) as any;
  process.browserProcessId = 'browser-process-2';
  process.ids.slotId = 'slot-process-2';
  process.ids.browserProcessId = 'browser-process-2';
  process.ids.bootstrapClusterId = 'bootstrap-cluster-process-2';
  process.ids.pairCellId = 'pair-cell-process-2';
  for (const run of process.runs) {
    const originalRunId = run.runId;
    run.runId = `process-2-${originalRunId}`;
    run.browserProcessId = 'browser-process-2';
    run.ids.slotId = `process-2-${run.ids.slotId}`;
    run.ids.browserProcessId = 'browser-process-2';
    run.ids.bootstrapClusterId = 'bootstrap-cluster-process-2';
    run.ids.pairCellId = `process-2-${run.ids.pairCellId}`;
    run.execution.processOrdinal = 1;
    for (const iteration of run.iterations) {
      iteration.runId = run.runId;
      iteration.iterationId = `process-2-${iteration.iterationId}`;
      for (const sample of iteration.samples) {
        sample.sampleId = `process-2-${sample.sampleId}`;
        sample.iterationId = iteration.iterationId;
      }
    }
    run.runBindingSha256 = calculateRunBindingSha256V1(run);
    for (const iteration of run.iterations) for (const sample of iteration.samples) sample.runBindingSha256 = run.runBindingSha256;
  }
  document.browserProcesses.push(process);
  return document;
}

export const benchmarkFixtureDigestV1 = DIGEST;

export function createBenchmarkWarmMeasurementEvidenceV1(document: any): BenchmarkValidationContextV1['warmMeasurementEvidence'] {
  const entries = document.browserProcesses.flatMap((process: any) => {
    const scenario = BENCHMARK_SCENARIO_REGISTRY_V1[document.scenarioId as keyof typeof BENCHMARK_SCENARIO_REGISTRY_V1]?.definition;
    const control = scenario?.warmupControl;
    if (control === null || control === undefined) return [];
    const controlSamples = process.runs
      .filter((run: any) => run.execution.phase === 'warmup')
      .flatMap((run: any) => run.iterations.map((iteration: any) => {
        const sample = iteration.samples.find((entry: any) => entry.metricRef === control.metricRef);
        return sample === undefined || sample.result.status !== 'valid' ? undefined : {
          sampleId: sample.sampleId,
          runId: run.runId,
          iterationId: iteration.iterationId,
          iterationOrdinal: iteration.iterationOrdinal,
          sampleOrdinal: sample.ordinal,
          value: sample.result.value,
        };
      }))
      .filter((sample: unknown): sample is JsonRecord => sample !== undefined);
    if (controlSamples.length === 0) return [];
    return [{
      schemaVersion: 'benchmark-warm-measurement-evidence-v1',
      browserProcessId: process.browserProcessId,
      runPlanId: 'plan-v1',
      runPlanSha256: DIGEST,
      ruleId: control.rule.id,
      ruleVersion: control.rule.version,
      algorithm: control.rule.algorithm,
      controlMetricRef: control.metricRef,
      controlSamples,
    }];
  });
  return entries.length === 0 ? undefined : entries;
}

export function createBenchmarkValidationContextV1(options: {
  readonly scenarioId?: string;
  readonly schemaSetBytes?: Uint8Array;
  readonly warmMeasurementEvidence?: BenchmarkValidationContextV1['warmMeasurementEvidence'];
} = {}): BenchmarkValidationContextV1 {
  const scenarioId = options.scenarioId ?? 'mesh-golden-world-v1';
  const fixtureId = (scenarioDefinitions[scenarioId] as any).fixtureContractId;
  const defaultDocument = options.warmMeasurementEvidence === undefined
    ? createBenchmarkCaseDocumentV1({ scenarioId, phase: 'measurement', container: 'warm-measurement', samples: true })
    : undefined;
  const warmMeasurementEvidence = options.warmMeasurementEvidence ?? createBenchmarkWarmMeasurementEvidenceV1(defaultDocument);
  return {
    fixture: fixture(fixtureId) as never,
    candidate: { id: 'candidate-v1', version: 1, sourceFileSetSha256: observed(DIGEST), sourcePaths: observed(CANDIDATE_PATHS) } as never,
    runPlan: { id: 'plan-v1' as never, sha256: DIGEST as never },
      schemaSetSha256: options.schemaSetBytes === undefined ? BENCHMARK_SCHEMA_SET_SHA256_V1 : sha256BytesV1(options.schemaSetBytes),
      metricRegistrySha256: BENCHMARK_METRIC_REGISTRY_V1.metricRegistrySha256,
      ...(warmMeasurementEvidence === undefined ? {} : { warmMeasurementEvidence }),
  };
}

export function createBenchmarkTelemetryExportV1(document: any, runId = 'measurement-run'): JsonRecord {
  const runValue = document.browserProcesses
    .flatMap((process: JsonRecord) => process.runs as JsonRecord[])
    .find((run: JsonRecord) => run.runId === runId);
  return {
    runId,
    records: (runValue?.iterations ?? []).map((iteration: JsonRecord) => ({
      runId,
      iterationId: iteration.iterationId,
      iterationOrdinal: iteration.iterationOrdinal,
      phase: iteration.phase,
      samples: iteration.samples,
    })),
  };
}

export function createBenchmarkTelemetryAdapterV1(): BenchmarkValidationReceiptInputV1['telemetryAdapter'] {
  return {
    adapt: (telemetry, context) => {
      if (telemetry.runId !== context.runId || !Array.isArray(telemetry.records)) return { samples: [], invalidReasons: [] };
      const records = telemetry.records as unknown[];
      if (records.some((entry, index) => {
        if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return true;
        const candidate = entry as JsonRecord;
        return candidate.runId !== context.runId || candidate.iterationOrdinal !== index || candidate.phase !== context.phase;
      })) return { samples: [], invalidReasons: [] };
      const record = records.find((entry: unknown) => {
        if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return false;
        const candidate = entry as JsonRecord;
        return candidate.runId === context.runId && candidate.iterationId === context.iterationId;
      }) as JsonRecord | undefined;
      if (record === undefined) return { samples: [], invalidReasons: [] };
      return { samples: (Array.isArray(record.samples) ? record.samples : []) as never, invalidReasons: [] };
    },
  };
}

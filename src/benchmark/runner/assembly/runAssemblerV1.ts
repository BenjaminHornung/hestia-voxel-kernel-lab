import { adaptTelemetryExportV1 } from '../../adapters';
import {
  BENCHMARK_METRIC_REGISTRY_V1,
  BENCHMARK_PROTOCOL_VERSION,
  BENCHMARK_SCENARIO_REGISTRY_V1,
  calculateRunBindingSha256V1,
  validateBenchmarkRunV1,
  type BenchmarkEnvironmentManifestV1,
  type BenchmarkInvalidReasonV1,
  type BenchmarkRunOriginV1,
  type BenchmarkRunV1,
  type BenchmarkSourceProvenanceV1,
  type BenchmarkValidationContextV1,
  type BrowserProcessV1,
  type CanonicalIdV1,
  type AdaptTelemetryExportV1,
  type HardwareCellV1,
  type TelemetryExportV1,
} from '../../contracts';
import { canonicalizeJsonV1, compareUtf16 } from '../../provenance';
import type { Br02TelemetryExportV1 } from '../../../diagnostics/telemetry/contractV1';
import type {
  BuiltRunPlanV1,
  PlannedInvocationRunV1,
  RunPlanProcessUnitV1,
} from '../contractsV1';

const PLACEHOLDER_DIGEST = `sha256:${'0'.repeat(64)}` as BenchmarkRunV1['runBindingSha256'];

export class RunAssemblyErrorV1 extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RunAssemblyErrorV1';
  }
}

export interface AssembleRunOptionsV1 {
  readonly plan: BuiltRunPlanV1;
  readonly unit: RunPlanProcessUnitV1;
  readonly plannedRun: PlannedInvocationRunV1;
  readonly createdUtc: string;
  readonly hardwareCellId: CanonicalIdV1;
  readonly source: BenchmarkSourceProvenanceV1;
  readonly environment: BenchmarkEnvironmentManifestV1;
  readonly telemetryExport: Br02TelemetryExportV1;
  readonly pageState: { readonly visibility: 'visible' | 'hidden'; readonly focus: 'focused' | 'unfocused'; readonly backgroundTabs: number };
  readonly origin: BenchmarkRunOriginV1;
  readonly measurementEligibilityReasons: readonly BenchmarkInvalidReasonV1[];
  readonly telemetryAdapter?: AdaptTelemetryExportV1;
  readonly measurementEligible?: boolean;
}

export function createSinglePassTelemetryAdapterV1(
  adapter: AdaptTelemetryExportV1 = adaptTelemetryExportV1,
): AdaptTelemetryExportV1 {
  const cache = new Map<string, ReturnType<AdaptTelemetryExportV1>>();
  const cachedArguments = new Map<string, Uint8Array>();
  return (telemetry, context, metricRegistry) => {
    const cacheId = `${context.runId}:${context.iterationId}`;
    const cached = cache.get(cacheId);
    const argumentBytes = canonicalizeJsonV1([telemetry, context, metricRegistry.metricRegistrySha256]);
    if (cached !== undefined) {
      const previous = cachedArguments.get(cacheId)!;
      if (previous.byteLength !== argumentBytes.byteLength || previous.some((byte, index) => byte !== argumentBytes[index])) {
        throw new RunAssemblyErrorV1('Telemetry adapter iteration was reused with different inputs.');
      }
      return cached;
    }
    const result = adapter(telemetry, context, metricRegistry);
    cache.set(cacheId, result);
    cachedArguments.set(cacheId, argumentBytes);
    return result;
  };
}

function assertPlanUnit(plan: BuiltRunPlanV1, unit: RunPlanProcessUnitV1, plannedRun: PlannedInvocationRunV1): void {
  const accepted = plan.core.processUnits.find(({ ids }) => ids.slotId === unit.ids.slotId);
  const acceptedBytes = accepted === undefined ? null : canonicalizeJsonV1(accepted);
  const unitBytes = canonicalizeJsonV1(unit);
  if (acceptedBytes === null || acceptedBytes.byteLength !== unitBytes.byteLength
    || acceptedBytes.some((byte, index) => byte !== unitBytes[index])) {
    throw new RunAssemblyErrorV1('Process unit does not match the accepted plan.');
  }
  const legalPhase = unit.processContainer === 'warm-measurement'
    ? plannedRun.phase === 'warmup' || plannedRun.phase === 'measurement'
    : plannedRun.phase === unit.processContainer;
  if (plannedRun.iterationIds.length === 0 || !legalPhase) {
    throw new RunAssemblyErrorV1('Planned run does not match its process container.');
  }
}

function executionScheme(plan: BuiltRunPlanV1, unit: RunPlanProcessUnitV1): 'single-candidate' | 'abba' | 'baab' | 'latin-square' {
  const block = plan.core.balanceBlocks.find(({ blockId }) => blockId === unit.balanceBlockId);
  const row = block?.rows.find(({ rowOrdinal }) => rowOrdinal === unit.rowOrdinal);
  if (row === undefined) throw new RunAssemblyErrorV1('Process unit balance row is missing.');
  return row.scheme;
}

function assertTelemetryBinding(telemetry: Br02TelemetryExportV1, options: AssembleRunOptionsV1): void {
  const backend = options.unit.scenarioParameters.find(({ key }) => key === 'backend')?.value ?? 'not-applicable';
  if (telemetry.runId !== options.plannedRun.runId
    || telemetry.planId !== options.plan.runPlanId
    || telemetry.scenarioId !== options.unit.scenarioId
    || telemetry.phase !== options.plannedRun.phase
    || telemetry.backend !== backend
    || telemetry.iterations.length !== options.plannedRun.iterationIds.length
    || telemetry.iterations.some((iteration, index) => iteration.iterationId !== options.plannedRun.iterationIds[index]
      || iteration.iterationOrdinal !== index)) {
    throw new RunAssemblyErrorV1('BR02 telemetry does not match the planned run.');
  }
}

function sortedReasons(reasons: readonly BenchmarkInvalidReasonV1[]): readonly BenchmarkInvalidReasonV1[] {
  return [...reasons].sort((left, right) => compareUtf16(`${left.code}:${left.phase}`, `${right.code}:${right.phase}`));
}

export function assembleRunV1(options: AssembleRunOptionsV1): BenchmarkRunV1 {
  assertPlanUnit(options.plan, options.unit, options.plannedRun);
  assertTelemetryBinding(options.telemetryExport, options);
  if (new Date(options.createdUtc).toISOString() !== options.createdUtc) throw new RunAssemblyErrorV1('Run timestamp is not canonical UTC.');
  if (options.source.candidate.id !== options.unit.candidateId || options.source.fixture.id !== options.plan.core.fixtureContractId) {
    throw new RunAssemblyErrorV1('Run source bindings do not match the planned candidate and fixture.');
  }
  const phaseNeedsReason = options.plannedRun.phase === 'cold' || options.plannedRun.phase === 'measurement' || options.plannedRun.phase === 'stress';
  if ((phaseNeedsReason && options.measurementEligibilityReasons.length !== 1)
    || (!phaseNeedsReason && options.measurementEligibilityReasons.length !== 0)) {
    throw new RunAssemblyErrorV1('Measurement-ineligible run has the wrong eligibility reason count.');
  }
  const registry = BENCHMARK_SCENARIO_REGISTRY_V1[options.unit.scenarioId];
  const run: BenchmarkRunV1 = {
    schemaVersion: 'benchmark-run-v1',
    protocolVersion: BENCHMARK_PROTOCOL_VERSION,
    runId: options.plannedRun.runId,
    createdUtc: options.createdUtc as BenchmarkRunV1['createdUtc'],
    hardwareCellId: options.hardwareCellId,
    browserProcessId: options.unit.ids.browserProcessId,
    ids: options.unit.ids,
    source: options.source,
    scenario: {
      id: options.unit.scenarioId,
      version: 1,
      definitionSha256: registry.definitionSha256,
      fixture: options.source.fixture,
      parameters: options.unit.scenarioParameters,
    },
    environment: options.environment,
    execution: {
      schemaVersion: 'benchmark-execution-descriptor-v1',
      processContainer: options.unit.processContainer,
      phase: options.plannedRun.phase,
      processOrdinal: options.unit.processOrdinal,
      iteration: options.plannedRun.runOrdinal,
      runPlanId: options.plan.runPlanId,
      runPlanSha256: options.plan.runPlanSha256,
      order: {
        scheme: executionScheme(options.plan, options.unit),
        orderSeed: options.plan.core.orderSeed,
        blockId: options.unit.balanceBlockId,
        sequencePosition: options.unit.sequencePosition,
        candidateId: options.unit.candidateId,
      },
      pageState: options.pageState,
       measurementEligibility: options.measurementEligible === true ? 'eligible' : 'ineligible',
      origin: options.origin,
      validity: { status: 'valid' },
    },
    runBindingSha256: PLACEHOLDER_DIGEST,
     measurementEligible: options.measurementEligible === true,
    measurementEligibilityReasons: sortedReasons(options.measurementEligibilityReasons),
    iterations: [],
  };
  const runBindingSha256 = calculateRunBindingSha256V1(run);
  const iterations = options.telemetryExport.iterations.map((iteration) => {
    const context = {
      hardwareCellId: options.hardwareCellId,
      slotId: options.unit.ids.slotId,
      browserProcessId: options.unit.ids.browserProcessId,
      runId: options.plannedRun.runId,
      iterationId: iteration.iterationId,
      phase: options.plannedRun.phase,
      runBindingSha256,
    };
    if (Object.keys(context).length !== 7) throw new RunAssemblyErrorV1('BR02 adapter context is not closed.');
    const adapted = (options.telemetryAdapter ?? adaptTelemetryExportV1)(options.telemetryExport as unknown as TelemetryExportV1, context, BENCHMARK_METRIC_REGISTRY_V1);
    if (adapted.invalidReasons.length !== 0) throw new RunAssemblyErrorV1('BR02 adapter rejected telemetry.');
    return {
      schemaVersion: 'benchmark-iteration-v1' as const,
      iterationId: iteration.iterationId,
      iterationOrdinal: iteration.iterationOrdinal,
      runId: options.plannedRun.runId,
      phase: options.plannedRun.phase,
      samples: adapted.samples,
    };
  });
  return { ...run, runBindingSha256, iterations };
}

export interface CompletedProcessV1 {
  readonly unit: RunPlanProcessUnitV1;
  readonly runs: readonly BenchmarkRunV1[];
}

export interface AssembleHardwareCellOptionsV1 {
  readonly hardwareCellId: CanonicalIdV1;
  readonly hardwareProfileId: CanonicalIdV1;
  readonly scenarioId: RunPlanProcessUnitV1['scenarioId'];
  readonly candidateId: CanonicalIdV1;
  readonly source: BenchmarkSourceProvenanceV1;
  readonly environment: BenchmarkEnvironmentManifestV1;
  readonly processes: readonly CompletedProcessV1[];
  readonly validationContext: BenchmarkValidationContextV1;
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
  const leftBytes = canonicalizeJsonV1(left);
  const rightBytes = canonicalizeJsonV1(right);
  return leftBytes.byteLength === rightBytes.byteLength && leftBytes.every((byte, index) => byte === rightBytes[index]);
}

export function assembleHardwareCellV1(options: AssembleHardwareCellOptionsV1): HardwareCellV1 {
  if (options.processes.length === 0) throw new RunAssemblyErrorV1('Hardware cell needs at least one completed process.');
  const ordered = [...options.processes].sort((left, right) => left.unit.processOrdinal - right.unit.processOrdinal);
  const browserProcesses: BrowserProcessV1[] = ordered.map(({ unit, runs }, processIndex) => {
    const [first, ...rest] = runs;
    if (first === undefined || unit.processOrdinal !== processIndex
      || unit.scenarioId !== options.scenarioId || unit.candidateId !== options.candidateId
      || runs.some((run) => run.browserProcessId !== unit.ids.browserProcessId
        || run.hardwareCellId !== options.hardwareCellId
        || !sameCanonicalValue(run.source, options.source)
        || !sameCanonicalValue(run.environment, options.environment))) {
      throw new RunAssemblyErrorV1('Completed process does not match its hardware cell.');
    }
    return {
      schemaVersion: 'benchmark-browser-process-v1',
      browserProcessId: unit.ids.browserProcessId,
      hardwareCellId: options.hardwareCellId,
      source: options.source,
      environment: options.environment,
      ids: unit.ids,
      runs: [first, ...rest],
    };
  });
  const reasonMap = new Map<string, BenchmarkInvalidReasonV1>();
  for (const run of browserProcesses.flatMap(({ runs }) => runs)) {
    for (const reason of run.measurementEligibilityReasons) {
      const cellReason: BenchmarkInvalidReasonV1 = { code: reason.code, detail: 'eligibility gate' as BenchmarkInvalidReasonV1['detail'], phase: reason.phase };
      reasonMap.set(`${cellReason.code}:${cellReason.phase}`, cellReason);
    }
  }
  const [firstProcess, ...restProcesses] = browserProcesses;
  if (firstProcess === undefined) throw new RunAssemblyErrorV1('Hardware cell needs at least one browser process.');
  const cell: HardwareCellV1 = {
    schemaVersion: 'benchmark-hardware-cell-v1',
    hardwareCellId: options.hardwareCellId,
    source: options.source,
    scenarioId: options.scenarioId,
    scenarioVersion: 1,
    hardwareProfileId: options.hardwareProfileId,
    environment: options.environment,
    measurementEligible: browserProcesses.some(({ runs }) => runs.some(({ measurementEligible }) => measurementEligible)),
    measurementEligibilityReasons: [...reasonMap.values()].sort((left, right) => compareUtf16(`${left.code}:${left.phase}`, `${right.code}:${right.phase}`)),
    browserProcesses: [firstProcess, ...restProcesses],
  };
  const validation = validateBenchmarkRunV1(cell, options.validationContext, BENCHMARK_METRIC_REGISTRY_V1);
  if (!validation.valid) throw new RunAssemblyErrorV1(`BR01 rejected assembled hardware cell: ${validation.code}.`);
  return cell;
}

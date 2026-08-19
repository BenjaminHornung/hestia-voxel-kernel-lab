import {
  BENCHMARK_FUTURE_METRIC_PRODUCER_CONTRACTS_V1,
  BENCHMARK_SCENARIO_REGISTRY_V1,
  benchmarkScenarioDefinitionsV1,
  compareUtf16,
  validateBrowserMetricRegistryV1,
} from '../contracts/browserV1';
import type {
  AdaptTelemetryExportV1,
  BenchmarkInvalidReasonV1,
  BenchmarkMetricDimensionContractV1,
  BenchmarkSampleDimensionV1,
  BenchmarkSamplePhaseV1,
  MetricDefinitionV1,
  Sha256DigestV1,
  TelemetryExportV1 as Br01TelemetryExportV1,
} from '../contracts/browserV1';
import {
  reasonForDetailCodeV1,
  validateTelemetryExportV1,
} from '../../diagnostics/telemetry/contractV1';
import type {
  Br02TelemetryExportV1,
  TelemetryDetailCodeV1,
} from '../../diagnostics/telemetry/contractV1';

const PHASES: readonly BenchmarkSamplePhaseV1[] = ['cold', 'warmup', 'measurement', 'stress', 'trace', 'leak'];
const CANONICAL_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;

type UnknownRecord = Record<string, unknown>;

interface ContextState {
  readonly valid: boolean;
  readonly phase: BenchmarkSamplePhaseV1 | undefined;
  readonly runId: string | undefined;
  readonly iterationId: string | undefined;
  readonly runBindingSha256: Sha256DigestV1 | undefined;
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPhase(value: unknown): value is BenchmarkSamplePhaseV1 {
  return typeof value === 'string' && PHASES.includes(value as BenchmarkSamplePhaseV1);
}

function isCanonicalId(value: unknown): value is string {
  return typeof value === 'string' && CANONICAL_ID.test(value);
}

function isSha256(value: unknown): value is Sha256DigestV1 {
  return typeof value === 'string' && SHA256.test(value);
}

function inspectContext(value: unknown): ContextState {
  try {
    if (!isRecord(value)) return { valid: false, phase: undefined, runId: undefined, iterationId: undefined, runBindingSha256: undefined };
    const phase = isPhase(value.phase) ? value.phase : undefined;
    const runId = isCanonicalId(value.runId) ? value.runId : undefined;
    const iterationId = isCanonicalId(value.iterationId) ? value.iterationId : undefined;
    const runBindingSha256 = isSha256(value.runBindingSha256) ? value.runBindingSha256 : undefined;
    return {
      valid: isCanonicalId(value.hardwareCellId)
        && isCanonicalId(value.slotId)
        && isCanonicalId(value.browserProcessId)
        && runId !== undefined
        && iterationId !== undefined
        && phase !== undefined
        && runBindingSha256 !== undefined,
      phase,
      runId,
      iterationId,
      runBindingSha256,
    };
  } catch {
    return { valid: false, phase: undefined, runId: undefined, iterationId: undefined, runBindingSha256: undefined };
  }
}

function inspectExportPhase(value: unknown): BenchmarkSamplePhaseV1 | undefined {
  try {
    return isRecord(value) && isPhase(value.phase) ? value.phase : undefined;
  } catch {
    return undefined;
  }
}

function reason(detail: TelemetryDetailCodeV1, phase: BenchmarkSamplePhaseV1): BenchmarkInvalidReasonV1 {
  return reasonForDetailCodeV1(detail, phase);
}

function canonicalReasons(reasons: readonly BenchmarkInvalidReasonV1[]): readonly BenchmarkInvalidReasonV1[] {
  const ordered = [...reasons].sort((left, right) => compareUtf16(
    `${left.code}:${left.phase}:${left.detail}`,
    `${right.code}:${right.phase}:${right.detail}`,
  ));
  const seen = new Set<string>();
  return ordered.filter((entry) => {
    const key = `${entry.code}:${entry.phase}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function invalid(reasons: readonly BenchmarkInvalidReasonV1[]): { readonly samples: readonly []; readonly invalidReasons: readonly BenchmarkInvalidReasonV1[] } {
  return { samples: [], invalidReasons: canonicalReasons(reasons) };
}

function dimensionValueMatches(value: unknown, contract: BenchmarkMetricDimensionContractV1['domain']): boolean {
  if (contract.kind === 'canonical-id') return isCanonicalId(value);
  if (contract.kind === 'sha256') return isSha256(value);
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function projectDimensions(
  fields: UnknownRecord,
  contracts: readonly BenchmarkMetricDimensionContractV1[],
): readonly BenchmarkSampleDimensionV1[] | undefined {
  const hasDimensions = Object.prototype.hasOwnProperty.call(fields, 'dimensions');
  if (contracts.length === 0) return hasDimensions ? undefined : [];
  if (!Array.isArray(fields.dimensions) || fields.dimensions.length !== contracts.length) return undefined;
  const dimensions: BenchmarkSampleDimensionV1[] = [];
  for (let index = 0; index < contracts.length; index += 1) {
    const candidate = fields.dimensions[index];
    const contract = contracts[index]!;
    if (!isRecord(candidate) || candidate.key !== contract.key || !dimensionValueMatches(candidate.value, contract.domain)) return undefined;
    if (typeof candidate.value !== 'string' && typeof candidate.value !== 'number' && typeof candidate.value !== 'boolean') return undefined;
    dimensions.push({ key: contract.key, value: candidate.value });
  }
  return dimensions;
}

function valueMatchesDomain(value: unknown, metric: MetricDefinitionV1): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0)) return false;
  if (value < metric.numericDomain.minimum) return false;
  if (metric.numericDomain.maximum !== null && value > metric.numericDomain.maximum) return false;
  if (metric.numericDomain.kind === 'positive-finite-number' && value <= 0) return false;
  if (metric.numericDomain.kind === 'non-negative-safe-integer' && !Number.isSafeInteger(value)) return false;
  return true;
}

function phaseContainer(phase: BenchmarkSamplePhaseV1): 'cold' | 'warm-measurement' | 'stress' | 'trace' | 'leak' {
  return phase === 'warmup' || phase === 'measurement' ? 'warm-measurement' : phase;
}

function sampleId(ordinal: number): string {
  return `br02-sample-${String(ordinal).padStart(8, '0')}`;
}

function selectedScenario(telemetry: Br02TelemetryExportV1) {
  const entry = BENCHMARK_SCENARIO_REGISTRY_V1[telemetry.scenarioId as keyof typeof BENCHMARK_SCENARIO_REGISTRY_V1];
  const definition = benchmarkScenarioDefinitionsV1.find((candidate) => candidate.id === telemetry.scenarioId);
  if (entry === undefined || definition === undefined || entry.definition !== definition) return undefined;
  return definition;
}

function capabilityObserved(telemetry: Br02TelemetryExportV1, capabilityId: string): boolean {
  const capability = telemetry.capabilities.find((candidate) => candidate.id === capabilityId);
  return capability?.value.status === 'observed' && capability.value.value === true;
}

export const adaptTelemetryExportV1: AdaptTelemetryExportV1 = (
  telemetry,
  context,
  metricRegistry,
) => {
  const opaqueTelemetry: Br01TelemetryExportV1 = telemetry;
  const contextState = inspectContext(context);
  const exportPhase = inspectExportPhase(opaqueTelemetry);
  if (exportPhase === undefined && contextState.phase === undefined) {
    throw new TypeError('br02-adapter-unrepresentable-phase');
  }
  const reasonPhase = exportPhase ?? contextState.phase!;
  const preliminaryReasons: BenchmarkInvalidReasonV1[] = [];
  if (!contextState.valid) preliminaryReasons.push(reason('br02-context-invalid', reasonPhase));

  const telemetryValidation = validateTelemetryExportV1(opaqueTelemetry);
  if (!telemetryValidation.valid) {
    const detail = telemetryValidation.issues.some((issue) => issue.code === 'iteration-order-invalid')
      ? 'br02-iteration-invalid'
      : 'br02-export-invalid';
    return invalid([...preliminaryReasons, reason(detail, reasonPhase)]);
  }
  const exportValue = telemetryValidation.value;

  if (contextState.valid
    && (contextState.runId !== exportValue.runId
      || contextState.phase !== exportValue.phase
      || !exportValue.iterations.some((iteration) => iteration.iterationId === contextState.iterationId))) {
    preliminaryReasons.push(reason('br02-context-invalid', exportValue.phase));
  }
  if (exportValue.validity.status === 'invalid' || preliminaryReasons.length > 0) {
    return invalid([...preliminaryReasons, ...(exportValue.validity.status === 'invalid' ? exportValue.validity.reasons : [])]);
  }

  let registryValid = false;
  try {
    registryValid = validateBrowserMetricRegistryV1(metricRegistry);
  } catch {
    registryValid = false;
  }
  if (!registryValid) return invalid([reason('br02-registry-invalid', exportValue.phase)]);
  if (exportValue.backend === 'raw-webgpu') return invalid([reason('br02-metric-not-reachable', exportValue.phase)]);

  const scenario = selectedScenario(exportValue);
  if (scenario === undefined
    || !scenario.allowedPhases.includes(exportValue.phase)
    || (scenario.parameterContracts.some((contract) => contract.key === 'backend')
      ? exportValue.backend !== 'three-webgl2'
      : exportValue.backend !== 'not-applicable')) {
    return invalid([reason('br02-metric-not-reachable', exportValue.phase)]);
  }

  const iterationOrdinals = new Map(exportValue.iterations.map((iteration) => [iteration.iterationId, iteration.iterationOrdinal]));
  const realms = new Map(exportValue.realms.map((realm) => [realm.realmId, realm]));
  const samples: ReturnType<AdaptTelemetryExportV1>['samples'][number][] = [];
  const reasons: BenchmarkInvalidReasonV1[] = [];
  let globalOrdinal = 0;
  let previousSampleIterationOrdinal: number | undefined;

  for (const record of exportValue.records) {
    const mappings = metricRegistry.telemetryMappings.filter((candidate) => candidate.recordName === record.name);
    if (mappings.length !== 1) {
      reasons.push(reason('br02-record-invalid', exportValue.phase));
      continue;
    }
    const mapping = mappings[0]!;
    if (record.kind !== 'sample') {
      if (mapping.disposition === 'emit-sample') reasons.push(reason('br02-record-invalid', exportValue.phase));
      continue;
    }
    if (mapping.disposition !== 'emit-sample' || mapping.metricRef === undefined || mapping.unit === undefined) {
      reasons.push(reason('br02-record-invalid', exportValue.phase));
      continue;
    }

    const iterationOrdinal = iterationOrdinals.get(record.iterationId);
    if (iterationOrdinal === undefined) {
      reasons.push(reason('br02-iteration-invalid', exportValue.phase));
      continue;
    }
    if (previousSampleIterationOrdinal !== undefined && iterationOrdinal < previousSampleIterationOrdinal) {
      reasons.push(reason('br02-iteration-invalid', exportValue.phase));
    }
    previousSampleIterationOrdinal = iterationOrdinal;

    const producer = BENCHMARK_FUTURE_METRIC_PRODUCER_CONTRACTS_V1[mapping.metricRef];
    const metrics = metricRegistry.metrics.filter((candidate) => candidate.metricRef === mapping.metricRef);
    const metric = metrics.length === 1 ? metrics[0] : undefined;
    const reachability = metricRegistry.reachabilityMatrix.filter((candidate) => candidate.scenarioId === exportValue.scenarioId
      && candidate.phase === exportValue.phase
      && candidate.backend === exportValue.backend
      && candidate.metricRef === mapping.metricRef
      && candidate.recordName === record.name);
    const selectedReachability = reachability.length === 1 ? reachability[0] : undefined;
    const contract = selectedReachability === undefined ? undefined : scenario.metricContracts[selectedReachability.scenarioMetricContractOrdinal];
    if (producer === undefined
      || producer.owner !== 'BR02'
      || producer.recordName !== record.name
      || metric === undefined
      || mapping.unit !== metric.unit
      || selectedReachability === undefined
      || selectedReachability.futureProducerOwner !== 'BR02'
      || selectedReachability.firstWorkPackageAbleToEmit !== 'BR02'
      || selectedReachability.disposition !== 'emit-sample'
      || contract === undefined
      || contract.metricRef !== metric.metricRef
      || contract.kind !== metric.kind
      || contract.unit !== metric.unit
      || !metric.allowedPhases.includes(exportValue.phase)
      || !metric.allowedContainers.includes(phaseContainer(exportValue.phase))) {
      reasons.push(reason('br02-metric-not-reachable', exportValue.phase));
      continue;
    }
    if (selectedReachability.capabilityId !== undefined && !capabilityObserved(exportValue, selectedReachability.capabilityId)) {
      reasons.push(reason('br02-capability-not-observed', exportValue.phase));
      continue;
    }

    const fields = record.fields as unknown as UnknownRecord;
    const expectedSourceUnit = record.name === 'mesh.output-bytes' && metric.unit === 'bytes' ? 'byte' : metric.unit;
    const dimensions = projectDimensions(fields, metric.dimensionContracts);
    if (!isRecord(fields)
      || fields.sampleKind !== metric.kind
      || fields.sourceUnit !== expectedSourceUnit
      || !valueMatchesDomain(fields.value, metric)
      || dimensions === undefined
      || (record.name === 'coverage.sha256-match'
        && (fields.value !== 1
          || dimensions.length !== 2
          || dimensions[0]?.key !== 'actual-sha256'
          || dimensions[1]?.key !== 'expected-sha256'
          || dimensions[0]?.value !== dimensions[1]?.value))) {
      reasons.push(reason('br02-record-invalid', exportValue.phase));
      continue;
    }
    const realm = realms.get(record.realmId);
    if (realm === undefined || !Number.isFinite(record.startMs) || record.startMs < 0 || Object.is(record.startMs, -0)) {
      reasons.push(reason('br02-record-invalid', exportValue.phase));
      continue;
    }

    const ordinal = globalOrdinal;
    globalOrdinal += 1;
    if (record.iterationId !== contextState.iterationId) continue;
    samples.push({
      schemaVersion: 'benchmark-raw-sample-v1',
      sampleId: sampleId(ordinal) as ReturnType<AdaptTelemetryExportV1>['samples'][number]['sampleId'],
      ordinal,
      iterationId: record.iterationId,
      phase: exportValue.phase,
      metricRef: metric.metricRef,
      kind: metric.kind,
      realm: realm.realm,
      observedAt: {
        clock: 'performance-time-origin',
        realmId: realm.realmId,
        timeOriginEpochMs: realm.timeOriginEpochMs,
        startMs: record.startMs,
      },
      unit: metric.unit,
      result: { status: 'valid', value: fields.value },
      dimensions,
      runBindingSha256: contextState.runBindingSha256!,
    });
  }

  if (reasons.length > 0) return invalid(reasons);
  return { samples, invalidReasons: [] };
};

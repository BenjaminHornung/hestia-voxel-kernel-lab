import { canonicalizeJsonV1, compareUtf16, parseCanonicalJsonV1 } from '../provenance/canonicalJsonV1';
import { compareRepositoryRelativePathsV1, repositoryRelativePathV1 } from '../provenance/canonicalPathV1';
import { digestFileSetV1, sha256BytesV1, timingSafeEqualSha256V1 } from '../provenance/fileSetDigestV1';
import { BENCHMARK_SCHEMA_SET_SHA256_V1 } from './schemaSetV1';
import { BENCHMARK_WARMUP_RULE_V1, recomputeWarmupStabilityV1 } from './browserValidationV1';
import {
  BENCHMARK_METRIC_REGISTRY_V1,
  BENCHMARK_SCENARIO_REGISTRY_V1,
  BENCHMARK_METRIC_DIMENSION_DOMAIN_OWNERS_V1,
  benchmarkScenarioDefinitionsV1,
  resolveScenarioMetricCapabilitySelectionV1,
} from './scenarioRegistryV1';
import type {
  AvailabilityV1,
  BenchmarkInvalidReason,
  BenchmarkInvalidReasonV1,
  BenchmarkMetricProducibilityEntryV1,
  BenchmarkIterationV1,
  BenchmarkEnvironmentManifestV1,
  BenchmarkRawSampleV1,
  BenchmarkRunDocumentV1,
  BenchmarkRunV1,
  BenchmarkSampleKindV1,
  BenchmarkSamplePhaseV1,
  BenchmarkScenarioDefinitionV1,
  BenchmarkValidationFailureV1,
  BenchmarkValidationContextV1,
  BenchmarkValidationReceiptInputV1,
  BenchmarkValidationReceiptV1,
  BenchmarkTelemetryAdapterResultProjectionV1,
  BenchmarkTelemetryDerivationEvidenceV1,
  BenchmarkValidationStageV1,
  BrowserProcessV1,
  CanonicalIdV1,
  MetricDefinitionV1,
  MetricRegistryV1,
  NonEmptyReadonlyArray,
  Sha256DigestV1,
} from './typesV1';
import { BENCHMARK_PROTOCOL_VERSION, BENCHMARK_STATUS_COMMAND, EMPTY_STATUS_SHA256 } from './versions';
import {
  BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_ID_V1,
  BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_VERSION_V1,
} from './versions';

export interface BenchmarkValidationIssueV1 {
  readonly stage: BenchmarkValidationStageV1;
  readonly code: string;
  readonly path: string;
  readonly detail: string;
}

export type BenchmarkValidationResultV1<T> =
  | { readonly valid: true; readonly value: T; readonly issues: readonly [] }
  | {
      readonly valid: false;
      readonly stage: BenchmarkValidationStageV1;
      readonly code: string;
      readonly issues: NonEmptyReadonlyArray<BenchmarkValidationIssueV1>;
    };

class ValidationError extends Error {
  public constructor(
    public readonly stage: BenchmarkValidationStageV1,
    public readonly code: string,
    public readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = 'BenchmarkValidationError';
  }
}

const fail = (stage: BenchmarkValidationStageV1, code: string, path: string, detail: string): never => {
  throw new ValidationError(stage, code, path, detail);
};
function schema(condition: unknown, path: string, detail: string, code = 'schema-invalid'): asserts condition {
  if (!condition) fail('schema', code, path, detail);
}
function semantic(condition: unknown, path: string, detail: string, code = 'semantic-invalid'): asserts condition {
  if (!condition) fail('semantic', code, path, detail);
}

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value);
function object(value: unknown, path: string): JsonObject {
  schema(isObject(value), path, 'Expected a closed JSON object.');
  return value;
}
function array(value: unknown, path: string): unknown[] {
  schema(Array.isArray(value), path, 'Expected a JSON array.');
  return value;
}
function string(value: unknown, path: string, nonEmpty = false): string {
  schema(typeof value === 'string' && (!nonEmpty || (value.length > 0 && value.length <= 2048)), path, nonEmpty ? 'Expected a non-empty string of at most 2048 code units.' : 'Expected a string.');
  return value;
}
function hardwareString(value: unknown, path: string): string {
  const result = string(value, path, true);
  schema(result !== 'unknown', path, 'Hardware values must not use the unknown sentinel.', 'environment-incomplete');
  return result;
}
function boolean(value: unknown, path: string): boolean {
  schema(typeof value === 'boolean', path, 'Expected a boolean.');
  return value;
}
function number(value: unknown, path: string): number {
  schema(typeof value === 'number', path, 'Expected a number.');
  return value;
}
function integer(value: unknown, path: string): number {
  const result = number(value, path);
  schema(Number.isInteger(result), path, 'Expected an integer.');
  return result;
}
function closed(value: unknown, keys: readonly string[], path: string): JsonObject {
  const result = object(value, path);
  const allowed = new Set(keys);
  for (const key of Object.keys(result)) schema(allowed.has(key), `${path}.${key}`, 'Unknown property.');
  for (const key of keys) schema(Object.prototype.hasOwnProperty.call(result, key), `${path}.${key}`, 'Missing required property.');
  return result;
}
function environmentClosed(value: unknown, keys: readonly string[], path: string): JsonObject {
  schema(value !== undefined, path, 'Missing required environment field.', 'environment-incomplete');
  const result = object(value, path);
  const allowed = new Set(keys);
  for (const key of Object.keys(result)) schema(allowed.has(key), `${path}.${key}`, 'Unknown property.');
  for (const key of keys) schema(Object.prototype.hasOwnProperty.call(result, key), `${path}.${key}`, 'Missing required environment field.', 'environment-incomplete');
  return result;
}
function oneOf(value: string, values: readonly string[], path: string): void {
  schema(values.includes(value), path, `Expected one of: ${values.join(', ')}.`);
}
function equalKeys(value: JsonObject, expected: readonly string[], path: string): void {
  closed(value, expected, path);
}

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const METRIC_REF_PATTERN = /^[a-z0-9][a-z0-9._-]*@[1-9][0-9]*$/;
const SHA_PATTERN = /^sha256:[0-9a-f]{64}$/;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const UTC_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/;

function validId(value: unknown, path: string): string {
  const result = string(value, path, true);
  schema(ID_PATTERN.test(result), path, 'Identifier is not canonical.', 'id-invalid');
  return result;
}
function validMetricRef(value: unknown, path: string): string {
  const result = string(value, path, true);
  schema(METRIC_REF_PATTERN.test(result), path, 'Metric reference is not canonical.', 'metric-ref-invalid');
  return result;
}
function validSha(value: unknown, path: string): string {
  const result = string(value, path, true);
  schema(SHA_PATTERN.test(result), path, 'SHA-256 digest is not canonical.', 'digest-invalid');
  return result;
}
function validGitSha(value: unknown, path: string): string {
  const result = string(value, path, true);
  schema(GIT_SHA_PATTERN.test(result), path, 'Git SHA is not canonical.', 'git-sha-invalid');
  return result;
}
function validPath(value: unknown, path: string): string {
  const result = string(value, path, true);
  try {
    repositoryRelativePathV1(result);
  } catch {
    fail('schema', 'path-invalid', path, 'Path is not canonical.');
  }
  return result;
}
export function validUtc(value: unknown, path: string): string {
  const result = string(value, path, true);
  semantic(UTC_PATTERN.test(result), path, 'UTC timestamp format is invalid.', 'timestamp-invalid');
  const date = new Date(result);
  semantic(Number.isFinite(date.getTime()) && date.toISOString() === result, path, 'UTC timestamp is not a real calendar instant.', 'timestamp-invalid');
  return result;
}
function finite(value: unknown, path: string, minimum?: number): number {
  const result = number(value, path);
  semantic(Number.isFinite(result) && !Object.is(result, -0), path, 'Number must be finite and not -0.', 'number-invalid');
  if (minimum !== undefined) semantic(result >= minimum, path, `Number must be at least ${minimum}.`, 'number-domain-invalid');
  return result;
}
function safeInteger(value: unknown, path: string, minimum = 0): number {
  const result = integer(value, path);
  schema(Number.isSafeInteger(result) && !Object.is(result, -0) && result >= minimum, path, 'Expected a safe integer in the allowed domain.', 'integer-invalid');
  return result;
}

function positiveFinite(value: unknown, path: string): number {
  const result = number(value, path);
  schema(Number.isFinite(result) && result > 0 && !Object.is(result, -0), path, 'Expected a positive finite number.', 'number-domain-invalid');
  return result;
}

function availabilityValue(value: unknown, path: string): void {
  schema(value !== null && value !== undefined, path, 'Availability value must not be null or undefined.');
  if (typeof value === 'string') schema(value.length > 0, path, 'Availability value must not be an empty string.', 'availability-sentinel');
  if (typeof value === 'number') {
    semantic(Number.isFinite(value) && !Object.is(value, -0), path, 'Availability value must be finite and not negative zero.', 'availability-value-invalid');
  }
}

function availableValue(value: unknown): unknown {
  if (!isObject(value)) return undefined;
  return value.status === 'observed' || value.status === 'declared' ? value.value : undefined;
}

function isObserved(value: unknown): boolean {
  return isObject(value) && value.status === 'observed';
}

function validateAvailability(value: unknown, path: string): void {
  const candidate = object(value, path);
  const status = string(candidate.status, `${path}.status`, true);
  const nonValueStatuses = ['unknown', 'unsupported', 'not-requested', 'not-active', 'permission-denied', 'blocked', 'error'];
  if (status === 'observed') {
    equalKeys(candidate, ['status', 'value', 'sourceRef', 'stability'], path);
    availabilityValue(candidate.value, `${path}.value`);
    validId(candidate.sourceRef, `${path}.sourceRef`);
    oneOf(string(candidate.stability, `${path}.stability`), ['stable', 'experimental', 'platform-specific'], `${path}.stability`);
  } else if (status === 'declared') {
    equalKeys(candidate, ['status', 'value', 'sourceRef', 'stability'], path);
    availabilityValue(candidate.value, `${path}.value`);
    validId(candidate.sourceRef, `${path}.sourceRef`);
    oneOf(string(candidate.stability, `${path}.stability`), ['owner-binding', 'run-config', 'browser-default'], `${path}.stability`);
  } else {
    oneOf(status, nonValueStatuses, `${path}.status`);
    equalKeys(candidate, ['status', 'value', 'sourceRef', 'reasonCode'], path);
    schema(candidate.value === null, `${path}.value`, 'Non-value availability must carry value:null.');
    validId(candidate.sourceRef, `${path}.sourceRef`);
    validId(candidate.reasonCode, `${path}.reasonCode`);
  }
}

function validateSourceBinding(value: unknown, path: string): void {
  const source = closed(value, ['schemaVersion', 'repositoryUrl', 'commitSha', 'commitTreeSha', 'worktree', 'build', 'fixture', 'candidate'], path);
  schema(source.schemaVersion === 'benchmark-source-provenance-v1', `${path}.schemaVersion`, 'Wrong source schema version.');
  schema(source.repositoryUrl === 'https://github.com/BenjaminHornung/hestia-voxel-kernel-lab', `${path}.repositoryUrl`, 'Wrong repository URL.');
  validGitSha(source.commitSha, `${path}.commitSha`);
  validGitSha(source.commitTreeSha, `${path}.commitTreeSha`);
  const worktree = closed(valueOf(source, 'worktree'), ['state', 'statusCommand', 'statusOutputSha256', 'submodules'], `${path}.worktree`);
  schema(worktree.state === 'clean', `${path}.worktree.state`, 'Worktree must be clean.');
  schema(worktree.statusCommand === BENCHMARK_STATUS_COMMAND, `${path}.worktree.statusCommand`, 'Wrong status command.');
  schema(worktree.statusOutputSha256 === EMPTY_STATUS_SHA256, `${path}.worktree.statusOutputSha256`, 'Wrong empty status digest.');
  schema(Array.isArray(worktree.submodules) && worktree.submodules.length === 0, `${path}.worktree.submodules`, 'Submodules are not allowed.');
  validateBuild(valueOf(source, 'build'), `${path}.build`);
  validateFixture(valueOf(source, 'fixture'), `${path}.fixture`);
  validateCandidate(valueOf(source, 'candidate'), `${path}.candidate`);
}

function valueOf(objectValue: JsonObject, key: string): unknown {
  return objectValue[key];
}

function validateBuild(value: unknown, path: string): void {
  const build = closed(value, ['algorithmVersion', 'rootPath', 'sha256', 'fileCount', 'totalBytes'], path);
  schema(build.algorithmVersion === 'hestia-benchmark-build-sha256-v1' && build.rootPath === 'dist', path, 'Build binding literals are invalid.');
  validSha(build.sha256, `${path}.sha256`);
  safeInteger(build.fileCount, `${path}.fileCount`, 1);
  safeInteger(build.totalBytes, `${path}.totalBytes`, 1);
}

function validateFixture(value: unknown, path: string): void {
  const fixture = closed(value, ['id', 'version', 'semanticSha256', 'sourceFileSetSha256', 'sourcePaths'], path);
  validId(fixture.id, `${path}.id`);
  safeInteger(fixture.version, `${path}.version`, 1);
  environmentAvailability(fixture.semanticSha256, `${path}.semanticSha256`, validSha);
  environmentAvailability(fixture.sourceFileSetSha256, `${path}.sourceFileSetSha256`, validSha);
  environmentAvailability(fixture.sourcePaths, `${path}.sourcePaths`, (entry, entryPath) => validateSortedUniquePaths(entry, entryPath));
}

function validateCandidate(value: unknown, path: string): void {
  const candidate = closed(value, ['id', 'version', 'sourceFileSetSha256', 'sourcePaths'], path);
  validId(candidate.id, `${path}.id`);
  safeInteger(candidate.version, `${path}.version`, 1);
  environmentAvailability(candidate.sourceFileSetSha256, `${path}.sourceFileSetSha256`, validSha);
  environmentAvailability(candidate.sourcePaths, `${path}.sourcePaths`, (entry, entryPath) => validateSortedUniquePaths(entry, entryPath));
}

function validateSortedUniquePaths(value: unknown, path: string): string[] {
  const paths = array(value, path);
  schema(paths.length > 0, path, 'Path list must not be empty.');
  const result = paths.map((entry, index) => validPath(entry, `${path}[${index}]`));
  for (let index = 1; index < result.length; index += 1) {
    semantic(compareRepositoryRelativePathsV1(result[index - 1]!, result[index]!) < 0, path, 'Paths must be strictly sorted and unique.', 'order-invalid');
  }
  return result;
}

function validateScenarioBinding(value: unknown, path: string): void {
  const scenario = closed(value, ['id', 'version', 'definitionSha256', 'fixture', 'parameters'], path);
  const idValue = string(scenario.id, `${path}.id`, true);
  schema(Object.prototype.hasOwnProperty.call(BENCHMARK_SCENARIO_REGISTRY_V1, idValue), `${path}.id`, 'Unknown scenario ID.');
  schema(scenario.version === 1, `${path}.version`, 'Unsupported scenario version.');
  validSha(scenario.definitionSha256, `${path}.definitionSha256`);
  validateFixture(scenario.fixture, `${path}.fixture`);
  const parameters = array(scenario.parameters, `${path}.parameters`);
  const seen = new Set<string>();
  for (let index = 0; index < parameters.length; index += 1) {
    const parameterValue = closed(parameters[index], ['key', 'value'], `${path}.parameters[${index}]`);
    const key = string(parameterValue.key, `${path}.parameters[${index}].key`, true);
    semantic(!seen.has(key), `${path}.parameters[${index}].key`, 'Duplicate scenario parameter.', 'parameter-duplicate');
    seen.add(key);
  }
  const registryEntry = BENCHMARK_SCENARIO_REGISTRY_V1[idValue as BenchmarkScenarioDefinitionV1['id']];
  semantic(registryEntry !== undefined, `${path}.id`, 'Unknown scenario ID.', 'scenario-contract-mismatch');
  if (registryEntry !== undefined) {
    semantic(scenario.definitionSha256 === registryEntry.definitionSha256, `${path}.definitionSha256`, 'Scenario definition digest does not match registry.', 'scenario-contract-mismatch');
    validateScenarioParameters(scenario, registryEntry.definition, `${path}.parameters`);
    validateScenarioWarmupControl(registryEntry.definition, `${path}.warmupControl`);
    const fixture = object(scenario.fixture, `${path}.fixture`);
    semantic(fixture.id === registryEntry.definition.fixtureContractId && fixture.version === registryEntry.definition.fixtureContractVersion, `${path}.fixture`, 'Scenario fixture binding does not match its definition.', 'fixture-contract-mismatch');
  }
}

function validateScenarioWarmupControl(definition: BenchmarkScenarioDefinitionV1, path: string): void {
  if (definition.warmupControl === null) {
    semantic(!definition.allowedPhases.includes('warmup'), path, 'A scenario without warmup control must not allow warmup.', 'warmup-unsupported');
    return;
  }
  semantic(definition.allowedPhases.includes('warmup'), path, 'A scenario warmup control requires the warmup phase.', 'warmup-unsupported');
  const control = definition.warmupControl;
  semantic(control.rule.id === BENCHMARK_WARMUP_RULE_V1.id && control.rule.version === BENCHMARK_WARMUP_RULE_V1.version
    && control.rule.algorithm === BENCHMARK_WARMUP_RULE_V1.algorithm && control.rule.windowSize === 5
    && control.rule.maximumRelativeDeviation === 0.05 && control.rule.consecutiveStableComparisons === 2
    && control.rule.minimumWarmupIterations === 10 && control.rule.maximumWarmupIterations === 50,
  path, 'Scenario warmup control must use the normative BR03 rule.', 'warmup-rule-mismatch');
  const contracts = definition.metricContracts.filter((contract) => contract.metricRef === control.metricRef);
  semantic(contracts.length === 1, path, 'Warmup control must reference exactly one scenario metric contract.', 'warmup-metric-mismatch');
  const metric = BENCHMARK_METRIC_REGISTRY_V1.metrics.find((entry) => entry.metricRef === control.metricRef);
  semantic(metric !== undefined && metric.warmupControl !== null && metric.warmupControl.metricRef === control.metricRef
    && Number.isFinite(metric.warmupControl.epsilon) && metric.warmupControl.epsilon > 0
    && metric.allowedPhases.includes('warmup') && metric.allowedContainers.includes('warm-measurement')
    && metric.sourceMapping.some((mapping) => mapping.disposition === 'emit-sample' && mapping.metricRef === control.metricRef), path, 'Warmup control metric must have a canonical emit producer.', 'warmup-unsupported');
}

function validateScenarioParameters(
  scenario: JsonObject,
  definition: BenchmarkScenarioDefinitionV1,
  path: string,
): void {
  const parameters = array(scenario.parameters, path);
  const contracts = new Map<string, BenchmarkScenarioDefinitionV1['parameterContracts'][number]>(definition.parameterContracts.map((contract) => [contract.key, contract]));
  semantic(parameters.length === contracts.size, path, 'Scenario parameters must match the registry exactly.', 'parameter-set-mismatch');
  let previous = '';
  const seen = new Set<string>();
  for (let index = 0; index < parameters.length; index += 1) {
    const parameterValue = closed(parameters[index], ['key', 'value'], `${path}[${index}]`);
    const key = string(parameterValue.key, `${path}[${index}].key`, true);
    semantic(!seen.has(key) && (previous === '' || compareUtf16(previous, key) < 0), `${path}[${index}].key`, 'Scenario parameters must be sorted and unique.', 'parameter-order-invalid');
    previous = key;
    seen.add(key);
    const contract = contracts.get(key);
    semantic(contract !== undefined, `${path}[${index}].key`, 'Parameter is not registered for this scenario.', 'parameter-unknown');
    if (contract === undefined) continue;
    const parameterValueRaw = parameterValue.value;
    switch (contract.domain.kind) {
      case 'uint32':
        semantic(Number.isSafeInteger(parameterValueRaw) && (parameterValueRaw as number) >= 0 && (parameterValueRaw as number) <= 0xffff_ffff, `${path}[${index}].value`, 'Parameter is outside uint32 domain.', 'parameter-domain-invalid');
        break;
      case 'safe-integer-range':
        semantic(Number.isSafeInteger(parameterValueRaw) && (parameterValueRaw as number) >= contract.domain.minimum && (parameterValueRaw as number) <= contract.domain.maximum, `${path}[${index}].value`, 'Parameter is outside integer range.', 'parameter-domain-invalid');
        break;
      case 'enum':
        semantic(contract.domain.values.includes(parameterValueRaw as never), `${path}[${index}].value`, 'Parameter is outside enum domain.', 'parameter-domain-invalid');
        break;
      case 'sha256':
        validSha(parameterValueRaw, `${path}[${index}].value`);
        break;
    }
  }
}

function validateReason(value: unknown, path: string): BenchmarkInvalidReasonV1 {
  const reason = closed(value, ['code', 'detail', 'phase'], path);
  const code = string(reason.code, `${path}.code`, true) as BenchmarkInvalidReason;
  const phases: BenchmarkSamplePhaseV1[] = ['cold', 'warmup', 'measurement', 'stress', 'trace', 'leak'];
  oneOf(code, [
    'source-dirty', 'source-sha-mismatch', 'source-tree-mismatch', 'build-digest-mismatch', 'fixture-contract-mismatch',
    'candidate-contract-mismatch', 'scenario-contract-mismatch', 'run-plan-mismatch', 'environment-incomplete',
    'browser-version-mismatch', 'required-capability-missing', 'document-hidden', 'document-unfocused', 'background-tabs-present',
    'power-state-mismatch', 'thermal-throttling', 'clock-invalid', 'sample-invalid', 'gpu-disjoint', 'context-lost',
    'console-error', 'page-error', 'request-failure', 'http-error', 'process-crash', 'operator-abort', 'metric-not-producible', 'warmup-not-stable', 'infrastructure-failure',
  ], `${path}.code`);
  string(reason.detail, `${path}.detail`, true);
  oneOf(string(reason.phase, `${path}.phase`), phases, `${path}.phase`);
  return reason as unknown as BenchmarkInvalidReasonV1;
}

function validateSortedReasons(value: unknown, path: string): void {
  const reasons = array(value, path);
  let previous = '';
  const seen = new Set<string>();
  for (let index = 0; index < reasons.length; index += 1) {
    const reason = validateReason(reasons[index], `${path}[${index}]`);
    const key = `${reason.code}:${reason.phase}`;
    semantic(!seen.has(key) && (previous === '' || compareUtf16(previous, key) < 0), `${path}[${index}]`, 'Reasons must be sorted and unique.', 'reason-order-invalid');
    seen.add(key);
    previous = key;
  }
}

function environmentAvailability(value: unknown, path: string, validateValue: (value: unknown, path: string) => void): JsonObject {
  schema(value !== undefined, path, 'Missing required environment field.', 'environment-incomplete');
  const availability = object(value, path);
  validateAvailability(availability, path);
  if (availability.status === 'observed' || availability.status === 'declared') validateValue(availability.value, `${path}.value`);
  return availability;
}

function validateBatteryState(value: unknown, path: string): void {
  const battery = object(value, path);
  const status = string(battery.status, `${path}.status`);
  if (status === 'not-applicable') equalKeys(battery, ['status'], path);
  else if (status === 'reported') { equalKeys(battery, ['status', 'percent'], path); finite(battery.percent, `${path}.percent`, 0); semantic((battery.percent as number) <= 100, `${path}.percent`, 'Battery percent exceeds 100.', 'power-state-mismatch'); }
  else if (status === 'unavailable') { equalKeys(battery, ['status', 'reason'], path); string(battery.reason, `${path}.reason`, true); }
  else fail('schema', 'enum-invalid', `${path}.status`, 'Unknown battery status.');
}

function validateCompetingLoad(value: unknown, path: string): void {
  const competing = object(value, path);
  const status = string(competing.status, `${path}.status`);
  if (status === 'none') equalKeys(competing, ['status'], path);
  else if (status === 'documented') { equalKeys(competing, ['status', 'detail'], path); string(competing.detail, `${path}.detail`, true); }
  else fail('schema', 'enum-invalid', `${path}.status`, 'Unknown competing load status.');
}

function validateEnvironment(value: unknown, path: string): void {
  const environment = environmentClosed(value, [
    'schemaVersion', 'hardwareProfileId', 'hardwareProfileTier', 'gateRole', 'os', 'cpu', 'gpu', 'browser',
    'display', 'power', 'runtimeState', 'capabilities',
  ], path);
  schema(environment.schemaVersion === 'benchmark-environment-manifest-v1', `${path}.schemaVersion`, 'Wrong environment schema version.');
  environmentAvailability(environment.hardwareProfileId, `${path}.hardwareProfileId`, (entry, entryPath) => validId(entry, entryPath));
  environmentAvailability(environment.hardwareProfileTier, `${path}.hardwareProfileTier`, (entry, entryPath) => oneOf(string(entry, entryPath), ['H1', 'H2', 'H3'], entryPath));
  environmentAvailability(environment.gateRole, `${path}.gateRole`, (entry, entryPath) => oneOf(string(entry, entryPath), ['correctness-only', 'performance-primary', 'guardrail', 'informational'], entryPath));
  const os = environmentClosed(valueOf(environment, 'os'), ['name', 'version', 'architecture'], `${path}.os`);
  environmentAvailability(os.name, `${path}.os.name`, hardwareString);
  environmentAvailability(os.version, `${path}.os.version`, hardwareString);
  environmentAvailability(os.architecture, `${path}.os.architecture`, hardwareString);
  const cpu = environmentClosed(valueOf(environment, 'cpu'), ['vendor', 'model', 'physicalCores', 'logicalCores', 'ramBytes'], `${path}.cpu`);
  environmentAvailability(cpu.vendor, `${path}.cpu.vendor`, hardwareString);
  environmentAvailability(cpu.model, `${path}.cpu.model`, hardwareString);
  environmentAvailability(cpu.physicalCores, `${path}.cpu.physicalCores`, (entry, entryPath) => safeInteger(entry, entryPath, 1));
  environmentAvailability(cpu.logicalCores, `${path}.cpu.logicalCores`, (entry, entryPath) => safeInteger(entry, entryPath, 1));
  environmentAvailability(cpu.ramBytes, `${path}.cpu.ramBytes`, (entry, entryPath) => safeInteger(entry, entryPath, 1));
  const physicalCores = availableValue(cpu.physicalCores);
  const logicalCores = availableValue(cpu.logicalCores);
  if (typeof physicalCores === 'number' && typeof logicalCores === 'number') {
    semantic(physicalCores <= logicalCores, `${path}.cpu.logicalCores`, 'Physical CPU cores cannot exceed logical CPU cores.', 'number-domain-invalid');
  }
  const gpu = environmentClosed(valueOf(environment, 'gpu'), ['vendor', 'device', 'driver', 'graphicsBackend'], `${path}.gpu`);
  environmentAvailability(gpu.vendor, `${path}.gpu.vendor`, hardwareString);
  environmentAvailability(gpu.device, `${path}.gpu.device`, hardwareString);
  environmentAvailability(gpu.driver, `${path}.gpu.driver`, hardwareString);
  environmentAvailability(gpu.graphicsBackend, `${path}.gpu.graphicsBackend`, hardwareString);
  const browser = environmentClosed(valueOf(environment, 'browser'), ['product', 'version', 'channel', 'userAgent', 'executableSha256', 'headless', 'flags'], `${path}.browser`);
  environmentAvailability(browser.product, `${path}.browser.product`, hardwareString);
  environmentAvailability(browser.version, `${path}.browser.version`, hardwareString);
  environmentAvailability(browser.channel, `${path}.browser.channel`, hardwareString);
  environmentAvailability(browser.userAgent, `${path}.browser.userAgent`, hardwareString);
  environmentAvailability(browser.executableSha256, `${path}.browser.executableSha256`, validSha);
  environmentAvailability(browser.headless, `${path}.browser.headless`, boolean);
  environmentAvailability(browser.flags, `${path}.browser.flags`, validateSortedStrings);
  const display = environmentClosed(valueOf(environment, 'display'), ['cssWidth', 'cssHeight', 'devicePixelRatio', 'refreshHz', 'vsync'], `${path}.display`);
  environmentAvailability(display.cssWidth, `${path}.display.cssWidth`, (entry, entryPath) => safeInteger(entry, entryPath, 1));
  environmentAvailability(display.cssHeight, `${path}.display.cssHeight`, (entry, entryPath) => safeInteger(entry, entryPath, 1));
  environmentAvailability(display.devicePixelRatio, `${path}.display.devicePixelRatio`, positiveFinite);
  environmentAvailability(display.refreshHz, `${path}.display.refreshHz`, positiveFinite);
  environmentAvailability(display.vsync, `${path}.display.vsync`, (entry, entryPath) => oneOf(string(entry, entryPath), ['enabled', 'disabled', 'platform-default'], entryPath));
  const power = environmentClosed(valueOf(environment, 'power'), ['source', 'profile', 'battery'], `${path}.power`);
  environmentAvailability(power.source, `${path}.power.source`, (entry, entryPath) => oneOf(string(entry, entryPath), ['ac', 'battery'], entryPath));
  environmentAvailability(power.profile, `${path}.power.profile`, hardwareString);
  environmentAvailability(power.battery, `${path}.power.battery`, validateBatteryState);
  const runtime = environmentClosed(valueOf(environment, 'runtimeState'), ['visibility', 'focus', 'backgroundTabs', 'competingLoad', 'thermalState'], `${path}.runtimeState`);
  environmentAvailability(runtime.visibility, `${path}.runtimeState.visibility`, (entry, entryPath) => oneOf(string(entry, entryPath), ['visible', 'hidden'], entryPath));
  environmentAvailability(runtime.focus, `${path}.runtimeState.focus`, (entry, entryPath) => oneOf(string(entry, entryPath), ['focused', 'unfocused'], entryPath));
  environmentAvailability(runtime.backgroundTabs, `${path}.runtimeState.backgroundTabs`, (entry, entryPath) => safeInteger(entry, entryPath, 0));
  environmentAvailability(runtime.competingLoad, `${path}.runtimeState.competingLoad`, validateCompetingLoad);
  environmentAvailability(runtime.thermalState, `${path}.runtimeState.thermalState`, (entry, entryPath) => oneOf(string(entry, entryPath), ['nominal', 'throttled', 'not-observable'], entryPath));
  validateCapabilities(environment.capabilities, `${path}.capabilities`);
  const powerSource = availableValue(power.source);
  const battery = availableValue(power.battery) as { status?: string } | undefined;
  if (battery?.status === 'not-applicable') semantic(powerSource === 'ac', `${path}.power.battery`, 'not-applicable battery requires AC source.', 'power-state-mismatch');
  if (battery?.status === 'reported' || battery?.status === 'unavailable') semantic(powerSource === 'battery', `${path}.power.battery`, 'Reported or unavailable battery requires battery source.', 'power-state-mismatch');
}

function validateSortedStrings(value: unknown, path: string): void {
  const entries = array(value, path).map((entry, index) => string(entry, `${path}[${index}]`, true));
  semantic(new Set(entries).size === entries.length, path, 'Strings must be unique.', 'duplicate-value');
  semantic(entries.every((entry, index) => index === 0 || compareUtf16(entries[index - 1]!, entry) < 0), path, 'Strings must be sorted.', 'order-invalid');
}

function validateCapabilities(value: unknown, path: string): Map<string, JsonObject> {
  const entries = array(value, path);
  const result = new Map<string, JsonObject>();
  let previous = '';
  for (let index = 0; index < entries.length; index += 1) {
    const entry = closed(entries[index], ['id', 'value'], `${path}[${index}]`);
    const idValue = validId(entry.id, `${path}[${index}].id`);
    semantic(!result.has(idValue), `${path}[${index}].id`, 'Capability IDs must be unique.', 'duplicate-id');
    semantic(previous === '' || compareUtf16(previous, idValue) < 0, `${path}[${index}].id`, 'Capabilities must be sorted.', 'order-invalid');
    previous = idValue; result.set(idValue, entry);
    validateAvailability(entry.value, `${path}[${index}].value`);
    const availability = entry.value as JsonObject;
    if (availability.status === 'observed' || availability.status === 'declared') semantic(availability.value === true, `${path}[${index}].value.value`, 'Capability value must be observed true.', 'required-capability-missing');
  }
  return result;
}

function validateExecution(value: unknown, path: string): void {
  const execution = closed(value, ['schemaVersion', 'processContainer', 'phase', 'processOrdinal', 'iteration', 'runPlanId', 'runPlanSha256', 'order', 'pageState', 'measurementEligibility', 'origin', 'validity'], path);
  schema(execution.schemaVersion === 'benchmark-execution-descriptor-v1', `${path}.schemaVersion`, 'Wrong execution schema version.');
  oneOf(string(execution.processContainer, `${path}.processContainer`), ['cold', 'warm-measurement', 'stress', 'trace', 'leak'], `${path}.processContainer`); oneOf(string(execution.phase, `${path}.phase`), ['cold', 'warmup', 'measurement', 'stress', 'trace', 'leak'], `${path}.phase`); safeInteger(execution.processOrdinal, `${path}.processOrdinal`, 0); safeInteger(execution.iteration, `${path}.iteration`, 0); validId(execution.runPlanId, `${path}.runPlanId`); validSha(execution.runPlanSha256, `${path}.runPlanSha256`);
  const order = closed(valueOf(execution, 'order'), ['scheme', 'orderSeed', 'blockId', 'sequencePosition', 'candidateId'], `${path}.order`); oneOf(string(order.scheme, `${path}.order.scheme`), ['single-candidate', 'abba', 'baab', 'latin-square'], `${path}.order.scheme`); safeInteger(order.orderSeed, `${path}.order.orderSeed`, 0); validId(order.blockId, `${path}.order.blockId`); safeInteger(order.sequencePosition, `${path}.order.sequencePosition`, 0); validId(order.candidateId, `${path}.order.candidateId`);
  const page = closed(valueOf(execution, 'pageState'), ['visibility', 'focus', 'backgroundTabs'], `${path}.pageState`); oneOf(string(page.visibility, `${path}.pageState.visibility`), ['visible', 'hidden'], `${path}.pageState.visibility`); oneOf(string(page.focus, `${path}.pageState.focus`), ['focused', 'unfocused'], `${path}.pageState.focus`); safeInteger(page.backgroundTabs, `${path}.pageState.backgroundTabs`, 0);
  oneOf(string(execution.measurementEligibility, `${path}.measurementEligibility`), ['eligible', 'ineligible'], `${path}.measurementEligibility`); validateOrigin(execution.origin, `${path}.origin`); validateValidity(execution.validity, `${path}.validity`);
}

function validateOrigin(value: unknown, path: string): void {
  const origin = object(value, path); const kind = string(origin.kind, `${path}.kind`);
  if (kind === 'planned') equalKeys(origin, ['kind'], path);
  else if (kind === 'infrastructure-rerun') { equalKeys(origin, ['kind', 'replacesRunId', 'approvalId', 'reason'], path); validId(origin.replacesRunId, `${path}.replacesRunId`); validId(origin.approvalId, `${path}.approvalId`); schema(origin.reason === 'infrastructure-failure', `${path}.reason`, 'Wrong rerun reason.'); }
  else fail('schema', 'enum-invalid', `${path}.kind`, 'Unknown run origin.');
}

function validateValidity(value: unknown, path: string): void {
  const validity = object(value, path); const status = string(validity.status, `${path}.status`);
  if (status === 'valid') equalKeys(validity, ['status'], path);
  else if (status === 'invalid') { equalKeys(validity, ['status', 'reasons'], path); const reasons = array(validity.reasons, `${path}.reasons`); schema(reasons.length > 0, `${path}.reasons`, 'Invalid run needs a reason.'); reasons.forEach((reason, index) => validateReason(reason, `${path}.reasons[${index}]`)); }
  else fail('schema', 'enum-invalid', `${path}.status`, 'Unknown validity status.');
}

function validateObservation(value: unknown, path: string): void {
  const observation = object(value, path); const clock = string(observation.clock, `${path}.clock`);
  if (clock === 'performance-time-origin') { equalKeys(observation, ['clock', 'realmId', 'timeOriginEpochMs', 'startMs'], path); validId(observation.realmId, `${path}.realmId`); finite(observation.timeOriginEpochMs, `${path}.timeOriginEpochMs`, 0); finite(observation.startMs, `${path}.startMs`, 0); }
  else if (clock === 'gpu-query') { equalKeys(observation, ['clock', 'realmId', 'startTickDecimal', 'timestampPeriodNs'], path); validId(observation.realmId, `${path}.realmId`); const tick = string(observation.startTickDecimal, `${path}.startTickDecimal`, true); semantic(/^(0|[1-9][0-9]*)$/.test(tick), `${path}.startTickDecimal`, 'GPU tick is not canonical.', 'number-invalid'); finite(observation.timestampPeriodNs, `${path}.timestampPeriodNs`, Number.MIN_VALUE); }
  else fail('schema', 'enum-invalid', `${path}.clock`, 'Unknown observation clock.');
}

function validateSample(value: unknown, path: string): BenchmarkRawSampleV1 {
  const sample = closed(value, ['schemaVersion', 'sampleId', 'ordinal', 'iterationId', 'phase', 'metricRef', 'kind', 'realm', 'observedAt', 'unit', 'result', 'dimensions', 'runBindingSha256'], path);
  schema(sample.schemaVersion === 'benchmark-raw-sample-v1', `${path}.schemaVersion`, 'Wrong sample schema version.'); validId(sample.sampleId, `${path}.sampleId`); safeInteger(sample.ordinal, `${path}.ordinal`, 0); validId(sample.iterationId, `${path}.iterationId`); oneOf(string(sample.phase, `${path}.phase`), ['cold', 'warmup', 'measurement', 'stress', 'trace', 'leak'], `${path}.phase`); validMetricRef(sample.metricRef, `${path}.metricRef`); const kind = oneOfSampleKind(sample.kind, `${path}.kind`); oneOf(string(sample.realm, `${path}.realm`), ['main', 'worker', 'gpu', 'browser'], `${path}.realm`); validateObservation(sample.observedAt, `${path}.observedAt`); oneOf(string(sample.unit, `${path}.unit`), ['ms', 'bytes', 'count', 'ratio', 'revision', 'hertz', 'percent'], `${path}.unit`); validateSampleResult(sample.result, `${path}.result`, kind); validateDimensions(sample.dimensions, `${path}.dimensions`); validSha(sample.runBindingSha256, `${path}.runBindingSha256`); return sample as unknown as BenchmarkRawSampleV1;
}

function oneOfSampleKind(value: unknown, path: string): BenchmarkSampleKindV1 {
  const result = string(value, path);
  oneOf(result, ['duration', 'counter', 'memory', 'frame', 'long-task', 'gpu', 'liveness'], path);
  return result as BenchmarkSampleKindV1;
}

function validateSampleResult(value: unknown, path: string, kind?: BenchmarkSampleKindV1): void {
  const result = object(value, path); const status = string(result.status, `${path}.status`);
  if (status === 'valid') {
    equalKeys(result, ['status', 'value'], path);
    if (kind === 'duration') {
      const duration = number(result.value, `${path}.value`);
      semantic(Number.isFinite(duration) && !Object.is(duration, -0) && duration >= 0, `${path}.value`, 'Duration sample numeric value is invalid.', 'sample-invalid');
    } else {
      finite(result.value, `${path}.value`);
    }
  }
  else if (status === 'invalid') { equalKeys(result, ['status', 'reason'], path); validateReason(result.reason, `${path}.reason`); }
  else fail('schema', 'enum-invalid', `${path}.status`, 'Unknown sample result status.');
}

function validateDimensions(value: unknown, path: string): void {
  const dimensions = array(value, path); let previous = ''; const seen = new Set<string>();
  for (let index = 0; index < dimensions.length; index += 1) { const dimension = closed(dimensions[index], ['key', 'value'], `${path}[${index}]`); const key = validId(dimension.key, `${path}[${index}].key`); schema(!seen.has(key), `${path}[${index}].key`, 'Dimensions must not contain duplicate keys.', 'metric-dimension-duplicate'); semantic(previous === '' || compareUtf16(previous, key) < 0, `${path}[${index}].key`, 'Dimensions must be sorted and unique.', 'order-invalid'); seen.add(key); previous = key; schema(typeof dimension.value === 'string' || typeof dimension.value === 'number' || typeof dimension.value === 'boolean', `${path}[${index}].value`, 'Dimension values must be simple JSON primitives.'); if (typeof dimension.value === 'number') finite(dimension.value, `${path}[${index}].value`); }
}

function validateIteration(value: unknown, path: string, index: number): BenchmarkIterationV1 {
  const iteration = closed(value, ['schemaVersion', 'iterationId', 'iterationOrdinal', 'runId', 'phase', 'samples'], path); schema(iteration.schemaVersion === 'benchmark-iteration-v1', `${path}.schemaVersion`, 'Wrong iteration schema version.'); validId(iteration.iterationId, `${path}.iterationId`); safeInteger(iteration.iterationOrdinal, `${path}.iterationOrdinal`, 0); validId(iteration.runId, `${path}.runId`); oneOf(string(iteration.phase, `${path}.phase`), ['cold', 'warmup', 'measurement', 'stress', 'trace', 'leak'], `${path}.phase`); const samples = array(iteration.samples, `${path}.samples`);
  semantic(iteration.iterationOrdinal === index, `${path}.iterationOrdinal`, 'Iteration ordinal must match its array index.', 'ordinal-order-invalid');
  samples.forEach((sample, sampleIndex) => validateSample(sample, `${path}.samples[${sampleIndex}]`));
  return iteration as unknown as BenchmarkIterationV1;
}

function validateRun(value: unknown, path: string): BenchmarkRunV1 {
  const run = closed(value, ['schemaVersion', 'protocolVersion', 'runId', 'createdUtc', 'hardwareCellId', 'browserProcessId', 'ids', 'source', 'scenario', 'environment', 'execution', 'runBindingSha256', 'measurementEligible', 'measurementEligibilityReasons', 'iterations'], path);
   schema(run.schemaVersion === 'benchmark-run-v1' && run.protocolVersion === BENCHMARK_PROTOCOL_VERSION, path, 'Wrong run version literals.'); validId(run.runId, `${path}.runId`); validUtc(run.createdUtc, `${path}.createdUtc`); validId(run.hardwareCellId, `${path}.hardwareCellId`); validId(run.browserProcessId, `${path}.browserProcessId`); validateIds(run.ids, `${path}.ids`); validateSourceBinding(run.source, `${path}.source`); validateScenarioBinding(run.scenario, `${path}.scenario`); validateEnvironment(run.environment, `${path}.environment`); validateExecution(run.execution, `${path}.execution`); validSha(run.runBindingSha256, `${path}.runBindingSha256`); boolean(run.measurementEligible, `${path}.measurementEligible`); validateSortedReasons(run.measurementEligibilityReasons, `${path}.measurementEligibilityReasons`); const iterations = array(run.iterations, `${path}.iterations`); iterations.forEach((iteration, index) => validateIteration(iteration, `${path}.iterations[${index}]`, index));
  const execution = object(run.execution, `${path}.execution`);
  if (execution.measurementEligibility === 'eligible' && isObject(execution.validity) && execution.validity.status === 'valid') {
    schema(iterations.some((iteration) => isObject(iteration) && Array.isArray(iteration.samples) && iteration.samples.length > 0), `${path}.iterations`, 'A valid eligible run needs at least one sample.', 'sample-missing');
  }
  return run as unknown as BenchmarkRunV1;
}

function validateIds(value: unknown, path: string): void {
  const ids = closed(value, ['slotId', 'browserProcessId', 'bootstrapClusterId', 'pairCellId', 'pairOrdinal', 'ownership'], path); validId(ids.slotId, `${path}.slotId`); validId(ids.browserProcessId, `${path}.browserProcessId`); validId(ids.bootstrapClusterId, `${path}.bootstrapClusterId`); validId(ids.pairCellId, `${path}.pairCellId`); safeInteger(ids.pairOrdinal, `${path}.pairOrdinal`, 1); const ownership = closed(ids.ownership, ['slotId', 'browserProcessId', 'bootstrapClusterId', 'pairCellId', 'pairOrdinal'], `${path}.ownership`); for (const key of ['slotId', 'browserProcessId', 'bootstrapClusterId', 'pairCellId', 'pairOrdinal']) schema(ownership[key] === 'BR03', `${path}.ownership.${key}`, 'Concrete orchestration IDs are owned by BR03.');
}

function validateProcess(value: unknown, path: string): BrowserProcessV1 {
  const process = closed(value, ['schemaVersion', 'browserProcessId', 'hardwareCellId', 'source', 'environment', 'ids', 'runs'], path); schema(process.schemaVersion === 'benchmark-browser-process-v1', `${path}.schemaVersion`, 'Wrong browser process schema version.'); validId(process.browserProcessId, `${path}.browserProcessId`); validId(process.hardwareCellId, `${path}.hardwareCellId`); validateSourceBinding(process.source, `${path}.source`); validateEnvironment(process.environment, `${path}.environment`); validateIds(process.ids, `${path}.ids`); const runs = array(process.runs, `${path}.runs`); schema(runs.length > 0, `${path}.runs`, 'Browser process needs runs.'); runs.forEach((run, index) => validateRun(run, `${path}.runs[${index}]`)); return process as unknown as BrowserProcessV1;
}

function structuralDocument(value: unknown): BenchmarkRunDocumentV1 {
  const cell = closed(value, ['schemaVersion', 'hardwareCellId', 'source', 'scenarioId', 'scenarioVersion', 'hardwareProfileId', 'environment', 'measurementEligible', 'measurementEligibilityReasons', 'browserProcesses'], '$'); schema(cell.schemaVersion === 'benchmark-hardware-cell-v1', '$.schemaVersion', 'Wrong hardware cell schema version.'); validId(cell.hardwareCellId, '$.hardwareCellId'); validateSourceBinding(cell.source, '$.source'); const scenarioId = string(cell.scenarioId, '$.scenarioId', true); schema(Object.prototype.hasOwnProperty.call(BENCHMARK_SCENARIO_REGISTRY_V1, scenarioId), '$.scenarioId', 'Unknown scenario ID.'); schema(cell.scenarioVersion === 1, '$.scenarioVersion', 'Wrong scenario version.'); validId(cell.hardwareProfileId, '$.hardwareProfileId'); validateEnvironment(cell.environment, '$.environment'); boolean(cell.measurementEligible, '$.measurementEligible'); validateSortedReasons(cell.measurementEligibilityReasons, '$.measurementEligibilityReasons'); const processes = array(cell.browserProcesses, '$.browserProcesses'); schema(processes.length > 0, '$.browserProcesses', 'Hardware cell needs browser processes.'); processes.forEach((process, index) => validateProcess(process, `$.browserProcesses[${index}]`)); return cell as unknown as BenchmarkRunDocumentV1;
}

function runBindingProjection(run: BenchmarkRunV1): Record<string, unknown> {
  return {
    schemaVersion: run.schemaVersion,
    protocolVersion: run.protocolVersion,
    runId: run.runId,
    createdUtc: run.createdUtc,
    hardwareCellId: run.hardwareCellId,
    browserProcessId: run.browserProcessId,
    ids: run.ids,
    source: run.source,
    scenario: run.scenario,
    environment: run.environment,
    execution: run.execution,
  };
}

export function calculateRunBindingSha256V1(run: BenchmarkRunV1): Sha256DigestV1 {
  return sha256BytesV1(canonicalizeJsonV1(runBindingProjection(run)));
}

function metricFor(ref: string, registry: MetricRegistryV1): MetricDefinitionV1 | undefined {
  return registry.metrics.find((metric) => metric.metricRef === ref);
}

const DIGEST_MATCH_METRIC_REFS = new Set([
  'coverage.sha256.match@1',
  'world.sha256.match@1',
  'image.contract.sha256.match@1',
]);

function availabilityIsObservedTrue(value: unknown): boolean {
  return isObject(value) && value.status === 'observed' && value.value === true;
}

function metricCapabilityIds(metric: MetricDefinitionV1, runValue: BenchmarkRunV1, definition?: BenchmarkScenarioDefinitionV1): readonly string[] {
  return resolveScenarioMetricCapabilitySelectionV1(runValue.scenario.id, metric.metricRef, runValue.scenario.parameters, definition)
    ?? metric.capabilityRequirements;
}

function validateMetricSampleDimensions(sample: BenchmarkRawSampleV1, metric: MetricDefinitionV1, path: string): void {
  for (const contract of metric.dimensionContracts) {
    semantic(sample.dimensions.some((dimension) => dimension.key === contract.key), `${path}.dimensions`, `Metric ${metric.metricRef} requires dimension ${contract.key}.`, 'metric-dimension-missing');
  }
  semantic(sample.dimensions.length === metric.dimensionContracts.length, `${path}.dimensions`, `Metric ${metric.metricRef} requires an exact dimension set.`, 'metric-dimension-set-invalid');
  for (const contract of metric.dimensionContracts) {
    const matches = sample.dimensions.filter((dimension) => dimension.key === contract.key);
    semantic(matches.length === 1, `${path}.dimensions`, `Metric ${metric.metricRef} requires exactly one dimension ${contract.key}.`, matches.length === 0 ? 'metric-dimension-missing' : 'metric-dimension-duplicate');
    const value = matches[0]?.value;
    if (value === undefined) continue;
    if (contract.domain.kind === 'canonical-id') validId(value, `${path}.dimensions.${contract.key}`);
    else if (contract.domain.kind === 'sha256') validSha(value, `${path}.dimensions.${contract.key}`);
    else safeInteger(value, `${path}.dimensions.${contract.key}`, 0);
  }
}

function scenarioMetricRequiredByRun(
  runValue: BenchmarkRunV1,
  metricContract: BenchmarkScenarioDefinitionV1['metricContracts'][number],
  capabilities: ReadonlyMap<string, AvailabilityV1<true>>,
  definition: BenchmarkScenarioDefinitionV1,
): boolean {
  const selectedCapabilities = resolveScenarioMetricCapabilitySelectionV1(runValue.scenario.id, metricContract.metricRef, runValue.scenario.parameters, definition);
  if (selectedCapabilities !== undefined) return selectedCapabilities.every((capabilityId) => availabilityIsObservedTrue(capabilities.get(capabilityId)));
  if (metricContract.requirement.kind === 'required') return true;
  return availabilityIsObservedTrue(capabilities.get(metricContract.requirement.capabilityId));
}

function backendCellForRun(runValue: BenchmarkRunV1, definition: BenchmarkScenarioDefinitionV1): string {
  return definition.parameterContracts.some((contract) => contract.key === 'backend')
    ? String(runValue.scenario.parameters.find((parameter) => parameter.key === 'backend')?.value ?? '')
    : 'not-applicable';
}

function metricProducibilityEntryForRun(
  runValue: BenchmarkRunV1,
  definition: BenchmarkScenarioDefinitionV1,
  metricContract: BenchmarkScenarioDefinitionV1['metricContracts'][number],
  scenarioMetricContractOrdinal: number,
  registry: MetricRegistryV1,
): BenchmarkMetricProducibilityEntryV1 | undefined {
  return registry.producibilityCrosswalk.find((entry) => entry.scenarioId === definition.id
    && entry.phase === runValue.execution.phase
    && entry.backend === backendCellForRun(runValue, definition)
    && entry.metricRef === metricContract.metricRef
    && entry.scenarioMetricContractOrdinal === scenarioMetricContractOrdinal);
}

function metricUnavailableForEligibleRun(
  runValue: BenchmarkRunV1,
  definition: BenchmarkScenarioDefinitionV1,
  capabilities: ReadonlyMap<string, AvailabilityV1<true>>,
  registry: MetricRegistryV1,
): boolean {
  if (runValue.execution.phase === 'warmup' || runValue.execution.phase === 'trace' || runValue.execution.phase === 'leak') return false;
  for (const [scenarioMetricContractOrdinal, metricContract] of definition.metricContracts.entries()) {
    const metric = metricFor(metricContract.metricRef, registry);
    if (metric === undefined || !metric.allowedPhases.includes(runValue.execution.phase) || !metric.allowedContainers.includes(runValue.execution.processContainer)) continue;
    if (!scenarioMetricRequiredByRun(runValue, metricContract, capabilities, definition)) continue;
    const entry = metricProducibilityEntryForRun(runValue, definition, metricContract, scenarioMetricContractOrdinal, registry);
    if (entry !== undefined && entry.classification !== 'emit-sample') return true;
  }
  return false;
}

function validateMetricValue(value: number, metric: MetricDefinitionV1, path: string): void {
  const domain = metric.numericDomain;
  const withinBounds = value >= domain.minimum && (domain.maximum === null || value <= domain.maximum);
  if (domain.kind === 'positive-finite-number') {
    semantic(Number.isFinite(value) && !Object.is(value, -0) && value > 0 && withinBounds, path, 'Metric value is outside its positive finite domain.', 'metric-domain-invalid');
  } else if (domain.kind === 'finite-number') {
    semantic(Number.isFinite(value) && value >= 0 && withinBounds, path, 'Metric value is outside its finite domain.', 'metric-domain-invalid');
  } else {
    semantic(Number.isSafeInteger(value) && value >= 0 && withinBounds, path, 'Metric value is outside its non-negative safe integer domain.', 'metric-domain-invalid');
  }
}

function validateMetricCapabilities(
  metric: MetricDefinitionV1,
  runValue: BenchmarkRunV1,
  capabilities: ReadonlyMap<string, AvailabilityV1<true>>,
  path: string,
  definition?: BenchmarkScenarioDefinitionV1,
): void {
  for (const capabilityId of metricCapabilityIds(metric, runValue, definition)) {
    semantic(availabilityIsObservedTrue(capabilities.get(capabilityId)), `${path}.capabilityRequirements`, `Metric ${metric.metricRef} requires observed capability ${capabilityId}.`, 'required-capability-missing');
  }
}

function sameReason(left: BenchmarkInvalidReasonV1, right: BenchmarkInvalidReasonV1): boolean {
  return left.code === right.code && left.detail === right.detail && left.phase === right.phase;
}

function reasonKey(reason: BenchmarkInvalidReasonV1): string {
  return `${reason.code}:${reason.phase}`;
}

function cellEligibilityReason(code: BenchmarkInvalidReason, phase: BenchmarkSamplePhaseV1): BenchmarkInvalidReasonV1 {
  return { code, detail: 'eligibility gate' as BenchmarkInvalidReasonV1['detail'], phase };
}

function sameReasons(left: readonly BenchmarkInvalidReasonV1[], right: readonly BenchmarkInvalidReasonV1[]): boolean {
  return left.length === right.length && left.every((reason, index) => sameReason(reason, right[index]!));
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
  const leftBytes = canonicalizeJsonV1(left);
  const rightBytes = canonicalizeJsonV1(right);
  return leftBytes.byteLength === rightBytes.byteLength && leftBytes.every((byte, index) => byte === rightBytes[index]);
}

function validateDigestMatchDimensions(sample: BenchmarkRawSampleV1, path: string, requireEqual: boolean): void {
  const dimensions = sample.dimensions;
  const keys = dimensions.map((dimension) => String(dimension.key));
  semantic(dimensions.length === 2 && new Set(keys).size === 2 && keys.every((key) => key === 'actual-sha256' || key === 'expected-sha256'), `${path}.dimensions`, 'Digest match samples require exactly actual-sha256 and expected-sha256 dimensions.', 'sample-invalid');
  const actual = dimensions.find((dimension) => dimension.key === 'actual-sha256');
  const expected = dimensions.find((dimension) => dimension.key === 'expected-sha256');
  if (actual === undefined || expected === undefined) return;
  validSha(actual.value, `${path}.dimensions.actual-sha256`);
  validSha(expected.value, `${path}.dimensions.expected-sha256`);
  if (requireEqual) semantic(actual.value === expected.value, `${path}.dimensions`, 'Digest match sample values must be equal.', 'sample-invalid');
}

function allEnvironmentEvidenceObserved(environment: BenchmarkEnvironmentManifestV1): boolean {
  const values: readonly unknown[] = [
    environment.hardwareProfileId, environment.hardwareProfileTier, environment.gateRole,
    environment.os.name, environment.os.version, environment.os.architecture,
    environment.cpu.vendor, environment.cpu.model, environment.cpu.physicalCores, environment.cpu.logicalCores, environment.cpu.ramBytes,
    environment.gpu.vendor, environment.gpu.device, environment.gpu.driver, environment.gpu.graphicsBackend,
    environment.browser.product, environment.browser.version, environment.browser.channel, environment.browser.userAgent,
    environment.browser.executableSha256, environment.browser.headless, environment.browser.flags,
    environment.display.cssWidth, environment.display.cssHeight, environment.display.devicePixelRatio, environment.display.refreshHz, environment.display.vsync,
    environment.power.source, environment.power.profile, environment.power.battery,
    environment.runtimeState.visibility, environment.runtimeState.focus, environment.runtimeState.backgroundTabs,
    environment.runtimeState.competingLoad, environment.runtimeState.thermalState,
  ];
  return values.every(isObserved);
}

function profileEvidenceIsBound(environment: BenchmarkEnvironmentManifestV1): boolean {
  const tier = availableValue(environment.hardwareProfileTier);
  if (tier !== 'H1' && tier !== 'H2' && tier !== 'H3') return false;
  return isObserved(environment.hardwareProfileTier) && isObserved(environment.hardwareProfileId);
}

function environmentEligibilityReasonCode(environment: BenchmarkEnvironmentManifestV1): BenchmarkInvalidReason | undefined {
  if (!allEnvironmentEvidenceObserved(environment) || !profileEvidenceIsBound(environment)) return 'environment-incomplete';
  if (availableValue(environment.runtimeState.visibility) === 'hidden') return 'document-hidden';
  if (availableValue(environment.runtimeState.visibility) !== 'visible') return 'environment-incomplete';
  if (availableValue(environment.runtimeState.focus) === 'unfocused') return 'document-unfocused';
  if (availableValue(environment.runtimeState.focus) !== 'focused') return 'environment-incomplete';
  if ((availableValue(environment.runtimeState.backgroundTabs) as number | undefined) !== 0) return 'background-tabs-present';
  const competingLoad = availableValue(environment.runtimeState.competingLoad) as { readonly status?: string } | undefined;
  if (competingLoad?.status !== 'none') return 'environment-incomplete';
  const thermalState = availableValue(environment.runtimeState.thermalState);
  if (thermalState === 'throttled') return 'thermal-throttling';
  if (thermalState !== 'nominal') return 'environment-incomplete';
  const headless = availableValue(environment.browser.headless);
  const gateRole = availableValue(environment.gateRole);
  if (headless === true && gateRole !== 'correctness-only' && gateRole !== 'informational') return 'environment-incomplete';
  return undefined;
}

function measurementEligibilityReasonCode(
  environment: BenchmarkEnvironmentManifestV1,
  runValue: BenchmarkRunV1,
  definition: BenchmarkScenarioDefinitionV1,
  registry: MetricRegistryV1,
): BenchmarkInvalidReason {
  const environmentReason = environmentEligibilityReasonCode(environment);
  if (environmentReason !== undefined) return environmentReason;

  const capabilities = new Map<string, AvailabilityV1<true>>(environment.capabilities.map((entry) => [entry.id, entry.value]));
  for (const capability of definition.capabilityContracts) {
    const availability = capabilities.get(capability.id);
    if (availability === undefined || (capability.requirement === 'must-support' && !availabilityIsObservedTrue(availability))) {
      return 'required-capability-missing';
    }
  }
  const backend = runValue.scenario.parameters.find((parameter) => parameter.key === 'backend')?.value;
  if (backend === 'three-webgl2' && !availabilityIsObservedTrue(capabilities.get('webgl2'))) return 'required-capability-missing';
  if (backend === 'raw-webgpu' && !availabilityIsObservedTrue(capabilities.get('webgpu'))) return 'required-capability-missing';
  if (runValue.execution.validity.status === 'invalid') return runValue.execution.validity.reasons[0]?.code ?? 'environment-incomplete';
  if (metricUnavailableForEligibleRun(runValue, definition, capabilities, registry)) return 'metric-not-producible';
  return 'environment-incomplete';
}

function environmentMeasurementEligible(environment: BenchmarkEnvironmentManifestV1): boolean {
  return environmentEligibilityReasonCode(environment) === undefined;
}

function validateWarmMeasurementEvidenceCollection(value: unknown, path: string): void {
  const entries = array(value, path);
  schema(entries.length > 0, path, 'Warm measurement evidence must not be empty.', 'warmup-evidence-missing');
  let previous = '';
  const seen = new Set<string>();
  for (let index = 0; index < entries.length; index += 1) {
    const entryPath = `${path}[${index}]`;
    const evidence = closed(entries[index], ['schemaVersion', 'browserProcessId', 'runPlanId', 'runPlanSha256', 'ruleId', 'ruleVersion', 'algorithm', 'controlMetricRef', 'controlSamples'], entryPath);
    schema(evidence.schemaVersion === 'benchmark-warm-measurement-evidence-v1', `${entryPath}.schemaVersion`, 'Wrong warm measurement evidence schema version.');
    const browserProcessId = validId(evidence.browserProcessId, `${entryPath}.browserProcessId`);
    validId(evidence.runPlanId, `${entryPath}.runPlanId`);
    validSha(evidence.runPlanSha256, `${entryPath}.runPlanSha256`);
    validId(evidence.ruleId, `${entryPath}.ruleId`);
    schema(evidence.ruleId === BENCHMARK_WARMUP_RULE_V1.id && evidence.ruleVersion === BENCHMARK_WARMUP_RULE_V1.version
      && evidence.algorithm === BENCHMARK_WARMUP_RULE_V1.algorithm, `${entryPath}.ruleId`, 'Warmup evidence must bind the normative rule.', 'warmup-rule-mismatch');
    validMetricRef(evidence.controlMetricRef, `${entryPath}.controlMetricRef`);
    const samples = array(evidence.controlSamples, `${entryPath}.controlSamples`);
    schema(samples.length > 0, `${entryPath}.controlSamples`, 'Warmup evidence must contain control samples.', 'warmup-evidence-missing');
    const sampleIds = new Set<string>();
    for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
      const samplePath = `${entryPath}.controlSamples[${sampleIndex}]`;
      const sample = closed(samples[sampleIndex], ['sampleId', 'runId', 'iterationId', 'iterationOrdinal', 'sampleOrdinal', 'value'], samplePath);
      validId(sample.sampleId, `${samplePath}.sampleId`);
      validId(sample.runId, `${samplePath}.runId`);
      validId(sample.iterationId, `${samplePath}.iterationId`);
      safeInteger(sample.iterationOrdinal, `${samplePath}.iterationOrdinal`, 0);
      safeInteger(sample.sampleOrdinal, `${samplePath}.sampleOrdinal`, 0);
       finite(sample.value, `${samplePath}.value`, 0);
      semantic(!sampleIds.has(sample.sampleId as string), `${samplePath}.sampleId`, 'Warmup control sample IDs must be unique.', 'warmup-sample-duplicate');
      sampleIds.add(sample.sampleId as string);
    }
    semantic(!seen.has(browserProcessId), `${entryPath}.browserProcessId`, 'Warm measurement evidence must contain one entry per browser process.', 'duplicate-id');
    semantic(previous === '' || compareUtf16(previous, browserProcessId) < 0, `${entryPath}.browserProcessId`, 'Warm measurement evidence must be sorted by browser process ID.', 'order-invalid');
    seen.add(browserProcessId);
    previous = browserProcessId;
  }
}

function validateWarmMeasurementEvidence(
  processValue: BrowserProcessV1,
  runIndex: number,
  runValue: BenchmarkRunV1,
  context: BenchmarkValidationContextV1,
): void {
  if (runValue.execution.processContainer !== 'warm-measurement' || runValue.execution.phase !== 'measurement') return;
  const evidenceEntries = context.warmMeasurementEvidence?.filter((entry) => entry.browserProcessId === processValue.browserProcessId);
  semantic(evidenceEntries !== undefined, '$.browserProcesses.runs', 'Warm measurement requires accepted BR03 warmup evidence.', 'warmup-evidence-missing');
  if (evidenceEntries === undefined) return;
  semantic(evidenceEntries.length === 1, '$.browserProcesses.runs', 'Eligible warm measurement requires exactly one process-specific warmup evidence entry.', 'warmup-evidence-duplicate');
  const evidence = evidenceEntries[0];
  if (evidence === undefined) return;
  semantic(evidence.browserProcessId === processValue.browserProcessId, '$.browserProcesses.runs', 'Warmup evidence belongs to a different browser process.', 'warmup-process-mismatch');
  semantic(evidence.runPlanId === context.runPlan.id && evidence.runPlanSha256 === context.runPlan.sha256, '$.browserProcesses.runs', 'Warmup evidence belongs to a different accepted plan.', 'warmup-plan-mismatch');
  const definition = BENCHMARK_SCENARIO_REGISTRY_V1[runValue.scenario.id].definition;
  const control = definition.warmupControl;
  semantic(control !== null, '$.browserProcesses.runs', 'Scenario does not define a warmup control metric.', 'warmup-unsupported');
  if (control === null) return;
  semantic(evidence.ruleId === control.rule.id && evidence.ruleVersion === control.rule.version && evidence.algorithm === control.rule.algorithm, '$.browserProcesses.runs', 'Warmup evidence rule does not match the scenario contract.', 'warmup-rule-mismatch');
  semantic(evidence.controlMetricRef === control.metricRef, '$.browserProcesses.runs', 'Warmup evidence control metric does not match the scenario contract.', 'warmup-metric-mismatch');
  const metric = metricFor(control.metricRef, BENCHMARK_METRIC_REGISTRY_V1);
  semantic(metric !== undefined && metric.allowedPhases.includes('warmup') && metric.allowedContainers.includes('warm-measurement'), '$.browserProcesses.runs', 'Warmup control metric is not producible in the warmup phase.', 'warmup-unsupported');
  const warmupRuns = processValue.runs.slice(0, runIndex).filter((candidate) => candidate.execution.phase === 'warmup');
  const expectedSamples: Array<{ readonly sample: BenchmarkRawSampleV1; readonly run: BenchmarkRunV1; readonly iteration: BenchmarkIterationV1 }> = [];
  for (const candidate of warmupRuns) {
    semantic(candidate.execution.processContainer === 'warm-measurement' && candidate.execution.phase === 'warmup', '$.browserProcesses.runs', 'Warmup runs must precede measurement and use the warmup phase.', 'phase-transition-invalid');
    semantic(candidate.execution.runPlanId === context.runPlan.id && candidate.execution.runPlanSha256 === context.runPlan.sha256, '$.browserProcesses.runs', 'Warmup run belongs to a different accepted plan.', 'warmup-plan-mismatch');
    semantic(candidate.execution.validity.status === 'valid', '$.browserProcesses.runs', 'Warmup runs must be execution-valid.', 'warmup-sample-invalid');
    for (const iteration of candidate.iterations) {
      const matches = iteration.samples.filter((sample) => sample.metricRef === control.metricRef);
      semantic(matches.length === 1, '$.browserProcesses.runs', 'Each warmup iteration must contain exactly one control sample.', 'warmup-sample-mismatch');
      const sample = matches[0]!;
      semantic(sample.result.status === 'valid', '$.browserProcesses.runs', 'Warmup control samples must be valid.', 'warmup-sample-invalid');
      expectedSamples.push({ sample, run: candidate, iteration });
    }
  }
  semantic(expectedSamples.length >= control.rule.minimumWarmupIterations, '$.browserProcesses.runs', 'Warmup evidence minimum was not reached before measurement.', 'warmup-minimum-invalid');
  semantic(expectedSamples.length <= control.rule.maximumWarmupIterations, '$.browserProcesses.runs', 'Warmup evidence exceeds the maximum warmup iterations.', 'warmup-maximum-invalid');
  semantic(evidence.controlSamples.length === expectedSamples.length, '$.browserProcesses.runs', 'Warmup evidence does not enumerate the preceding control samples exactly.', 'warmup-sample-mismatch');
  for (let index = 0; index < expectedSamples.length; index += 1) {
    const expected = expectedSamples[index]!;
    const actual = evidence.controlSamples[index]!;
    semantic(actual.sampleId === expected.sample.sampleId && actual.runId === expected.run.runId && actual.iterationId === expected.iteration.iterationId
      && actual.iterationOrdinal === expected.iteration.iterationOrdinal && actual.sampleOrdinal === expected.sample.ordinal
      && expected.sample.result.status === 'valid' && actual.value === expected.sample.result.value,
    `$.browserProcesses.runs[${runIndex}].warmupEvidence.controlSamples[${index}]`, 'Warmup evidence sample identity or value does not match the preceding run.', 'warmup-sample-mismatch');
  }
  if (metric === undefined || metric.warmupControl === null) return;
  const result = recomputeWarmupStabilityV1(evidence.controlSamples.map((sample) => sample.value), control.rule, metric.warmupControl.epsilon);
  semantic(result.status === 'STABLE' && result.stabilizationIteration === expectedSamples.length, '$.browserProcesses.runs', 'Warmup control values did not reach the normative stability rule at the first stable boundary.', 'warmup-not-stable');
}

function dimensionsMatchContract(
  sample: BenchmarkRawSampleV1,
  metric: MetricDefinitionV1,
  contract: BenchmarkScenarioDefinitionV1['metricContracts'][number],
): boolean {
  const fixedDimensions = contract.dimensions ?? [];
  const expectedKeys = new Set(metric.dimensionContracts.map((dimension) => dimension.key));
  for (const fixed of fixedDimensions) {
    if (expectedKeys.has(fixed.key)) continue;
    expectedKeys.add(fixed.key);
  }
  if (fixedDimensions.some((fixed) => !metric.dimensionContracts.some((dimension) => dimension.key === fixed.key))
    || sample.dimensions.length !== expectedKeys.size
    || sample.dimensions.some((dimension) => !expectedKeys.has(dimension.key))) return false;
  return fixedDimensions.every((expected) => sample.dimensions.some((actual) => actual.key === expected.key && sameCanonicalValue(actual.value, expected.value)));
}

function semanticDocument(document: BenchmarkRunDocumentV1, context: BenchmarkValidationContextV1, registry: MetricRegistryV1): void {
   const processIds = new Set<string>(); const runIds = new Set<string>(); const slotOwners = new Map<string, { readonly processId: string; readonly planId: string }>(); const bootstrapClusters = new Set<string>(); const pairCells = new Map<string, number>();
   const cell = document as unknown as JsonObject; const env = cell.environment as unknown as BenchmarkEnvironmentManifestV1;
   const baseEligible = environmentMeasurementEligible(env);
   const profileId = availableValue(env.hardwareProfileId);
   if (profileId !== undefined) semantic(profileId === document.hardwareProfileId, '$.hardwareProfileId', 'Hardware profile binding does not match the environment evidence.', 'hierarchy-invalid');
    const observedCapability = (id: string): boolean => availabilityIsObservedTrue((env.capabilities as readonly { id: CanonicalIdV1; value: AvailabilityV1<true> }[]).find((entry) => entry.id === id)?.value);
   const runEligible = new Set<string>();
   const expectedCellReasons = new Map<string, BenchmarkInvalidReasonV1>();
   for (let processIndex = 0; processIndex < document.browserProcesses.length; processIndex += 1) {
     const process = document.browserProcesses[processIndex]!;
     semantic(process.runs.length > 0, `$.browserProcesses[${processIndex}].runs`, 'Browser process needs runs.', 'hierarchy-invalid');
     let previousIteration = -1;
     let previousSequencePosition = -1;
     for (let runIndex = 0; runIndex < process.runs.length; runIndex += 1) {
       const run = process.runs[runIndex]!;
       semantic(run.execution.processOrdinal === processIndex, `$.browserProcesses[${processIndex}].runs[${runIndex}].execution.processOrdinal`, 'Process ordinals must match strict browser-process array order.', 'ordinal-order-invalid');
       const ordered = run.execution.iteration > previousIteration
         || (run.execution.iteration === previousIteration && run.execution.order.sequencePosition > previousSequencePosition);
       semantic(runIndex === 0 || ordered, `$.browserProcesses[${processIndex}].runs[${runIndex}]`, 'Runs must be strictly ordered by execution iteration and order sequence position.', 'ordinal-order-invalid');
       previousIteration = run.execution.iteration;
       previousSequencePosition = run.execution.order.sequencePosition;
     }
   }
   const eligibleWarmProcesses = new Set(document.browserProcesses
      .filter((process) => process.runs.some((run) => run.execution.processContainer === 'warm-measurement'
        && run.execution.phase === 'measurement'
        && run.execution.measurementEligibility === 'eligible'))
      .map((process) => process.browserProcessId));
    if (context.warmMeasurementEvidence !== undefined) {
      for (const evidence of context.warmMeasurementEvidence) {
        semantic(document.browserProcesses.some((process) => process.browserProcessId === evidence.browserProcessId), '$.validationContext.warmMeasurementEvidence', 'Warmup evidence belongs to an unknown browser process.', 'warmup-process-mismatch');
        if (eligibleWarmProcesses.size > 0) semantic(eligibleWarmProcesses.has(evidence.browserProcessId), '$.validationContext.warmMeasurementEvidence', 'Warmup evidence belongs to a process without an eligible warm measurement.', 'warmup-process-mismatch');
      }
    }
   semantic(sameCanonicalValue(document.source.fixture, context.fixture), '$.source.fixture', 'Fixture binding does not match the accepted validation context.', 'fixture-contract-mismatch');
  semantic(sameCanonicalValue(document.source.candidate, context.candidate), '$.source.candidate', 'Candidate binding does not match the accepted validation context.', 'candidate-contract-mismatch');
  for (const processValue of document.browserProcesses) {
    semantic(processValue.browserProcessId === processValue.ids.browserProcessId, '$.browserProcesses', 'Browser process ID parent reference is inconsistent.', 'hierarchy-invalid');
    semantic(processValue.hardwareCellId === document.hardwareCellId, '$.browserProcesses.hardwareCellId', 'Browser process hardware-cell parent reference is inconsistent.', 'hierarchy-invalid');
    semantic(sameCanonicalValue(processValue.source, document.source), '$.browserProcesses.source', 'Browser process source does not match its hardware cell.', 'hierarchy-invalid');
    semantic(sameCanonicalValue(processValue.environment, document.environment), '$.browserProcesses.environment', 'Browser process environment does not match its hardware cell.', 'hierarchy-invalid');
    semantic(!processIds.has(processValue.browserProcessId), '$.browserProcesses', 'Duplicate browser process ID.', 'duplicate-id'); processIds.add(processValue.browserProcessId);
    semantic(!bootstrapClusters.has(processValue.ids.bootstrapClusterId), '$.browserProcesses', 'Duplicate bootstrap cluster ID.', 'duplicate-id'); bootstrapClusters.add(processValue.ids.bootstrapClusterId);
    for (const runValue of processValue.runs) {
      semantic(runValue.browserProcessId === processValue.browserProcessId && runValue.hardwareCellId === document.hardwareCellId, '$.browserProcesses', 'Run parent references are inconsistent.', 'hierarchy-invalid');
       semantic(runValue.ids.browserProcessId === processValue.browserProcessId, '$.browserProcesses.ids.browserProcessId', 'Run browser process ID reference is inconsistent.', 'hierarchy-invalid');
       semantic(runValue.ids.bootstrapClusterId === processValue.ids.bootstrapClusterId, '$.browserProcesses.ids.bootstrapClusterId', 'Run bootstrap cluster ID reference is inconsistent.', 'hierarchy-invalid');
       semantic(sameCanonicalValue(runValue.source, document.source), '$.browserProcesses.runs.source', 'Run source does not match its hardware cell.', 'hierarchy-invalid');
       semantic(sameCanonicalValue(runValue.environment, document.environment), '$.browserProcesses.runs.environment', 'Run environment does not match its hardware cell.', 'hierarchy-invalid');
      semantic(runValue.scenario.id === document.scenarioId, '$.browserProcesses', 'Run scenario does not match hardware cell.', 'scenario-contract-mismatch');
        semantic(sameCanonicalValue(runValue.source.fixture, runValue.scenario.fixture), '$.scenario.fixture', 'Scenario fixture binding differs from source fixture.', 'fixture-contract-mismatch');
      semantic(!runIds.has(runValue.runId), '$.browserProcesses', 'Duplicate run ID.', 'duplicate-id'); runIds.add(runValue.runId);
       const slotOwner = slotOwners.get(runValue.ids.slotId);
       semantic(slotOwner === undefined || (slotOwner.processId === processValue.browserProcessId && slotOwner.planId === runValue.execution.runPlanId), '$.browserProcesses', 'A plan slot cannot be shared across browser processes or plans.', 'duplicate-id');
       if (slotOwner === undefined) slotOwners.set(runValue.ids.slotId, { processId: processValue.browserProcessId, planId: runValue.execution.runPlanId });
      semantic(runValue.ids.browserProcessId === processValue.browserProcessId, '$.browserProcesses.ids.browserProcessId', 'Run browser process ID reference is inconsistent.', 'hierarchy-invalid');
       const previousPairOrdinal = pairCells.get(runValue.ids.pairCellId); if (previousPairOrdinal !== undefined) semantic(previousPairOrdinal === runValue.ids.pairOrdinal, '$.browserProcesses', 'Pair ordinal is inconsistent.', 'pairing-invalid'); else pairCells.set(runValue.ids.pairCellId, runValue.ids.pairOrdinal);
      const registryEntry = BENCHMARK_SCENARIO_REGISTRY_V1[runValue.scenario.id];
      semantic(runValue.scenario.definitionSha256 === registryEntry.definitionSha256, '$.scenario.definitionSha256', 'Scenario definition digest does not match registry.', 'scenario-contract-mismatch');
      validateScenarioParameters(runValue.scenario as unknown as JsonObject, registryEntry.definition, '$.scenario.parameters');
      semantic(registryEntry.definition.allowedPhases.includes(runValue.execution.phase), '$.execution.phase', 'Scenario does not allow this phase.', 'phase-invalid');
      semantic(new TextDecoder().decode(canonicalizeJsonV1(runValue.scenario.fixture)) === new TextDecoder().decode(canonicalizeJsonV1(runValue.source.fixture)), '$.scenario.fixture', 'Scenario fixture differs from source fixture.', 'fixture-contract-mismatch');
       semantic(runValue.execution.order.candidateId === runValue.source.candidate.id, '$.execution.order.candidateId', 'Order candidate does not match source candidate.', 'candidate-contract-mismatch');
       semantic(runValue.execution.runPlanId === context.runPlan.id && runValue.execution.runPlanSha256 === context.runPlan.sha256, '$.execution.runPlanId', 'Run plan does not match the accepted validation context.', 'run-plan-mismatch');
       const executionPageState = runValue.execution.pageState;
       const runtimeVisibility = availableValue(env.runtimeState.visibility);
       const runtimeFocus = availableValue(env.runtimeState.focus);
       const runtimeBackgroundTabs = availableValue(env.runtimeState.backgroundTabs);
       if (runtimeVisibility !== undefined) semantic(executionPageState.visibility === runtimeVisibility, '$.execution.pageState.visibility', 'Runtime state and execution page visibility differ.', 'runtime-state-mismatch');
       if (runtimeFocus !== undefined) semantic(executionPageState.focus === runtimeFocus, '$.execution.pageState.focus', 'Runtime state and execution page focus differ.', 'runtime-state-mismatch');
       if (runtimeBackgroundTabs !== undefined) semantic(executionPageState.backgroundTabs === runtimeBackgroundTabs, '$.execution.pageState.backgroundTabs', 'Runtime state and execution background-tab count differ.', 'runtime-state-mismatch');
      const phase = runValue.execution.phase; const container = runValue.execution.processContainer;
      const legal = container === 'warm-measurement' ? phase === 'warmup' || phase === 'measurement' : phase === container;
      semantic(legal, '$.execution', 'Process container and sample phase transition is illegal.', 'phase-transition-invalid');
       semantic(phase === 'warmup' || phase === 'trace' || phase === 'leak' ? runValue.execution.measurementEligibility === 'ineligible' : true, '$.execution.measurementEligibility', 'Warmup, trace, and leak runs cannot be eligible.', 'measurement-ineligible');
       const calculatedBinding = calculateRunBindingSha256V1(runValue); semantic(runValue.runBindingSha256 === calculatedBinding, '$.runBindingSha256', 'Run binding digest mismatch.', 'run-binding-mismatch');
       if (runValue.execution.validity.status === 'invalid') {
         for (const reason of runValue.execution.validity.reasons) {
           semantic(reason.phase === phase, '$.execution.validity.reasons', 'Invalid reason phase must match the run phase.', 'reason-phase-invalid');
         }
       }
       const allCapabilities = new Map((env.capabilities as readonly { id: CanonicalIdV1; value: AvailabilityV1<true> }[]).map((entry) => [entry.id, entry.value]));
         const seenIterations = new Set<number>(); const seenSampleOrdinals = new Set<number>(); const seenSampleIds = new Set<string>(); let expectedSampleOrdinal = 0; let previousIterationOrdinal = -1;
       for (const iteration of runValue.iterations) {
         semantic(iteration.runId === runValue.runId && iteration.phase === phase, '$.iterations', 'Iteration parent or phase reference is inconsistent.', 'hierarchy-invalid'); semantic(iteration.iterationOrdinal > previousIterationOrdinal, '$.iterations', 'Iterations must be strictly ordered by ordinal.', 'ordinal-order-invalid'); semantic(!seenIterations.has(iteration.iterationOrdinal), '$.iterations', 'Duplicate iteration ordinal.', 'duplicate-ordinal'); seenIterations.add(iteration.iterationOrdinal); previousIterationOrdinal = iteration.iterationOrdinal;
         for (const sample of iteration.samples) {
           semantic(sample.iterationId === iteration.iterationId && sample.phase === phase, '$.iterations.samples', 'Sample parent or phase reference is inconsistent.', 'hierarchy-invalid');
           semantic(sample.ordinal === expectedSampleOrdinal, '$.iterations.samples.ordinal', 'Sample ordinals must follow one contiguous run-global array order.', 'ordinal-order-invalid'); expectedSampleOrdinal += 1;
           semantic(!seenSampleOrdinals.has(sample.ordinal) && !seenSampleIds.has(sample.sampleId), '$.iterations.samples', 'Duplicate sample ID or ordinal.', 'duplicate-id'); seenSampleOrdinals.add(sample.ordinal); seenSampleIds.add(sample.sampleId);
          semantic(sample.runBindingSha256 === runValue.runBindingSha256, '$.iterations.samples', 'Sample run binding digest mismatch.', 'run-binding-mismatch');
            const canonicalRef = sample.metricRef;
            const scenarioMetricContracts = registryEntry.definition.metricContracts.filter((contract) => contract.metricRef === canonicalRef);
            semantic(scenarioMetricContracts.length > 0, '$.iterations.samples.metricRef', 'Metric reference is not registered for the bound scenario.', 'metric-unknown');
            const metric = metricFor(canonicalRef, registry); semantic(metric !== undefined, '$.iterations.samples.metricRef', 'Unknown metric reference.', 'metric-unknown'); if (metric === undefined) continue;
              semantic(metric.unit === sample.unit && metric.kind === sample.kind, '$.iterations.samples', 'Metric kind or unit mismatch.', 'metric-unit-mismatch'); semantic(metric.allowedPhases.includes(phase), '$.iterations.samples.phase', `Metric ${canonicalRef} is not allowed in phase ${phase}.`, 'metric-phase-invalid'); semantic(metric.allowedContainers.includes(container), '$.iterations.samples.phase', `Metric ${canonicalRef} is not allowed in container ${container}.`, 'metric-container-invalid'); validateMetricSampleDimensions(sample, metric, '$.iterations.samples');
              const dimensionContracts = registryEntry.definition.metricContracts.filter((contract) => contract.metricRef === canonicalRef && contract.dimensions !== undefined);
              if (dimensionContracts.length > 0) semantic(dimensionContracts.some((contract) => dimensionsMatchContract(sample, metric, contract)), '$.iterations.samples.dimensions', `Sample dimensions for ${canonicalRef} do not match a scenario contract.`, 'metric-dimension-missing');
             if (runValue.execution.validity.status === 'valid' && runValue.execution.measurementEligibility === 'eligible') validateMetricCapabilities(metric, runValue, allCapabilities, '$.iterations.samples', registryEntry.definition);
          if (sample.result.status === 'valid') {
             const value = sample.result.value; validateMetricValue(value, metric, '$.iterations.samples.result.value');
              if (DIGEST_MATCH_METRIC_REFS.has(sample.metricRef)) { semantic(value === 1 && sample.unit === 'count', '$.iterations.samples', 'Digest match samples must be value 1/count.', 'sample-invalid'); validateDigestMatchDimensions(sample, '$.iterations.samples', true); }
            } else {
              const invalidResult = sample.result;
              if (DIGEST_MATCH_METRIC_REFS.has(sample.metricRef)) validateDigestMatchDimensions(sample, '$.iterations.samples', false);
             semantic(invalidResult.status === 'invalid', '$.iterations.samples.result', 'Invalid sample result must carry an invalid status.', 'sample-invalid');
             semantic(runValue.execution.validity.status === 'invalid', '$.execution.validity', 'Invalid sample requires invalid run validity.', 'sample-invalid');
             if (invalidResult.status === 'invalid' && runValue.execution.validity.status === 'invalid') {
               semantic(runValue.execution.validity.reasons.some((reason) => sameReason(reason, invalidResult.reason)), '$.iterations.samples.result.reason', 'Invalid sample reason must be present in run validity reasons.', 'sample-invalid');
             }
           }
        }
         for (const metric of registry.metrics) {
           const relevant = iteration.samples.filter((sample) => sample.metricRef === metric.metricRef);
          if (relevant.length === 0) continue;
          semantic(relevant.every((sample) => sample.unit === metric.unit && sample.kind === metric.kind), '$.iterations.samples', 'Metric kind or unit mismatch.', 'metric-unit-mismatch');
        }
      }
      const sortedSampleOrdinals = [...seenSampleOrdinals].sort((left, right) => left - right);
      semantic(sortedSampleOrdinals.every((ordinal, ordinalIndex) => ordinal === ordinalIndex), '$.iterations.samples', 'Sample ordinals must be contiguous from zero.', 'ordinal-order-invalid');
      const sortedIterationOrdinals = [...seenIterations].sort((left, right) => left - right);
      semantic(sortedIterationOrdinals.every((ordinal, ordinalIndex) => ordinal === ordinalIndex), '$.iterations', 'Iteration ordinals must be contiguous from zero.', 'ordinal-order-invalid');
       if (runValue.execution.validity.status === 'valid') {
         semantic(runValue.iterations.every((iteration) => iteration.samples.every((sample) => sample.result.status === 'valid')), '$.iterations.samples', 'A valid run cannot contain invalid samples.', 'sample-invalid');
       }
        if (runValue.execution.validity.status === 'valid' && runValue.execution.measurementEligibility === 'eligible') {
          semantic(seenSampleOrdinals.size > 0, '$.iterations.samples', 'A valid run needs at least one sample.', 'sample-missing');
       } else if (runValue.execution.validity.status === 'invalid') {
         const reasons = runValue.execution.validity.reasons;
        const reasonKeys = reasons.map((reason) => `${reason.code}:${reason.phase}`);
         semantic(new Set(reasonKeys).size === reasonKeys.length && reasonKeys.every((key, index) => index === 0 || compareUtf16(reasonKeys[index - 1]!, key) < 0), '$.execution.validity.reasons', 'Invalid reasons must be unique and sorted.', 'reason-order-invalid');
      }
            for (const [scenarioMetricContractOrdinal, metricContract] of registryEntry.definition.metricContracts.entries()) {
             const canonicalRef = metricContract.metricRef;
             const metric = metricFor(canonicalRef, registry);
             const producibility = metricProducibilityEntryForRun(runValue, registryEntry.definition, metricContract, scenarioMetricContractOrdinal, registry);
             const metricAllowedForRun = metric !== undefined
               && metric.allowedPhases.includes(runValue.execution.phase)
               && metric.allowedContainers.includes(runValue.execution.processContainer);
             const requiredByRun = runValue.execution.validity.status === 'valid' && runValue.execution.phase !== 'warmup' && runValue.execution.phase !== 'trace'
                  && metricAllowedForRun
                  && scenarioMetricRequiredByRun(runValue, metricContract, allCapabilities, registryEntry.definition)
                  && producibility?.classification === 'emit-sample';
              if (!requiredByRun) continue;
             const matchingSamples = runValue.iterations.flatMap((iteration) => iteration.samples)
               .filter((sample) => metric !== undefined && sample.metricRef === canonicalRef && dimensionsMatchContract(sample, metric, metricContract));
            if (matchingSamples.length === 0) {
              semantic(false, metricContract.dimensions === undefined ? '$.iterations.samples' : '$.iterations.samples.dimensions',
               metricContract.dimensions === undefined ? `Required metric ${canonicalRef} is missing.` : `Required dimensions for ${canonicalRef} are missing.`,
               metricContract.dimensions === undefined ? 'metric-missing' : 'metric-dimension-missing');
           }
             if (metric !== undefined) validateMetricCapabilities(metric, runValue, allCapabilities, '$.iterations.samples', registryEntry.definition);
           if (metricContract.dimensions !== undefined) {
             semantic(matchingSamples.length === 1, '$.iterations.samples.dimensions', `Required dimensions for ${canonicalRef} are duplicated.`, 'metric-dimension-duplicate');
           }
        }
       const capabilityContracts = registryEntry.definition.capabilityContracts;
          for (const capabilityContract of capabilityContracts) {
          const value = allCapabilities.get(capabilityContract.id); const claimsEligibility = runValue.execution.measurementEligibility === 'eligible'; semantic(value !== undefined, '$.environment.capabilities', 'Registry capability is missing.', 'required-capability-missing'); if (claimsEligibility && capabilityContract.requirement === 'must-support') semantic(availabilityIsObservedTrue(value), '$.environment.capabilities', 'Required capability lacks observed support.', 'required-capability-missing');
       }
       const parameters = new Map((runValue.scenario.parameters as readonly { key: string; value: unknown }[]).map((parameterValue) => [parameterValue.key, parameterValue.value]));
      const backend = parameters.get('backend');
        if (runValue.execution.measurementEligibility === 'eligible' && backend === 'three-webgl2') semantic(observedCapability('webgl2'), '$.environment.capabilities', 'WebGL2 backend requires observed WebGL2 support.', 'required-capability-missing');
        if (runValue.execution.measurementEligibility === 'eligible' && backend === 'raw-webgpu') semantic(observedCapability('webgpu'), '$.environment.capabilities', 'WebGPU backend requires observed WebGPU support.', 'required-capability-missing');
        if (runValue.execution.measurementEligibility === 'eligible') {
           semantic(baseEligible, '$.environment', 'Eligible run does not satisfy observed environment evidence or runtime eligibility.', environmentEligibilityReasonCode(env) ?? 'measurement-ineligible'); semantic(runValue.execution.validity.status === 'valid', '$.execution.validity', 'Eligible run must be valid.', 'measurement-ineligible');
           semantic(!metricUnavailableForEligibleRun(runValue, registryEntry.definition, allCapabilities, registry), '$.iterations.samples', 'An eligible run cannot claim a required metric without a canonical producer.', 'metric-not-producible');
        }
         if ((phase === 'cold' || phase === 'measurement' || phase === 'stress') && runValue.execution.measurementEligibility === 'ineligible') {
           const expectedReasonCode = measurementEligibilityReasonCode(env, runValue, registryEntry.definition, registry);
            const runReason = runValue.measurementEligibilityReasons.find((reason) => reason.code === expectedReasonCode && reason.phase === phase);
            semantic(runReason !== undefined, '$.measurementEligibilityReasons', 'Ineligible run must record its first applicable eligibility gate.', 'eligibility-reason-missing');
            const expectedCellReason = cellEligibilityReason(expectedReasonCode, phase);
            if (!expectedCellReasons.has(reasonKey(expectedCellReason))) {
              expectedCellReasons.set(reasonKey(expectedCellReason), expectedCellReason);
            }
         }
         const derivedRunEligible = runValue.execution.measurementEligibility === 'eligible' && baseEligible && runValue.execution.phase !== 'warmup' && runValue.execution.phase !== 'trace' && runValue.execution.phase !== 'leak' && runValue.execution.validity.status === 'valid';
        semantic(runValue.measurementEligible === derivedRunEligible, '$.measurementEligible', 'Run measurement eligibility is not fail-closed.', 'measurement-ineligible');
        if (derivedRunEligible) runEligible.add(runValue.runId);
    }
  }
  for (let index = 0; index < document.browserProcesses.length; index += 1) {
    const process = document.browserProcesses[index]!;
    let measurementStarted = false;
    for (let runIndex = 0; runIndex < process.runs.length; runIndex += 1) {
      const run = process.runs[runIndex]!;
      if (run.execution.phase === 'measurement') measurementStarted = true;
      if (measurementStarted && run.execution.phase === 'warmup') {
        semantic(false, '$.browserProcesses', 'Warmup runs cannot begin after measurement has started.', 'phase-transition-invalid');
      }
      if (run.execution.processContainer === 'warm-measurement' && run.execution.phase === 'measurement') {
        semantic(process.runs.slice(0, runIndex).some((run) => run.execution.processContainer === 'warm-measurement' && run.execution.phase === 'warmup'), '$.browserProcesses', 'Measurement run appears before warmup.', 'phase-transition-invalid');
        validateWarmMeasurementEvidence(process, runIndex, run, context);
      }
    }
  }
  const expectedReasons = [...expectedCellReasons.values()].sort((left, right) => compareUtf16(reasonKey(left), reasonKey(right)));
  semantic(sameReasons(document.measurementEligibilityReasons, expectedReasons), '$.measurementEligibilityReasons', 'Cell eligibility reasons do not match its ineligible runs.', 'measurement-ineligible');
  semantic(document.measurementEligible === (runEligible.size > 0), '$.measurementEligible', 'Cell measurement eligibility does not match its eligible runs.', 'measurement-ineligible');
}

export function validateBenchmarkRunStructureV1(value: unknown): BenchmarkValidationResultV1<BenchmarkRunDocumentV1> {
  try { return { valid: true, value: structuralDocument(value), issues: [] }; } catch (error) { return failure(error); }
}

function validateAcceptedValidationContext(context: BenchmarkValidationContextV1, registry: MetricRegistryV1): void {
  validSha(context.schemaSetSha256, '$.validationContext.schemaSetSha256');
  validSha(context.metricRegistrySha256, '$.validationContext.metricRegistrySha256');
  semantic(context.schemaSetSha256 === BENCHMARK_SCHEMA_SET_SHA256_V1, '$.validationContext.schemaSetSha256', 'Accepted schema-set digest does not match the production schema set.', 'schema-set-digest-mismatch');
  semantic(context.metricRegistrySha256 === registry.metricRegistrySha256, '$.validationContext.metricRegistrySha256', 'Accepted metric registry digest does not match the registry used for validation.', 'registry-digest-mismatch');
  validId(context.runPlan.id, '$.validationContext.runPlan.id');
  validSha(context.runPlan.sha256, '$.validationContext.runPlan.sha256');
  if (context.warmMeasurementEvidence !== undefined) validateWarmMeasurementEvidenceCollection(context.warmMeasurementEvidence, '$.validationContext.warmMeasurementEvidence');
}

function validateCanonicalMetricRegistry(registry: MetricRegistryV1): void {
  const validation = validateMetricRegistryV1(registry);
  if (!validation.valid) {
    const issue = validation.issues[0]!;
    fail(validation.stage, validation.code, issue.path, issue.detail);
    return;
  }
  semantic(validation.value.metricRegistrySha256 === BENCHMARK_METRIC_REGISTRY_V1.metricRegistrySha256, '$.validationContext.metricRegistrySha256', 'A benchmark run may only be validated against the canonical metric registry.', 'registry-digest-mismatch');
}

export function validateBenchmarkRunV1(value: unknown, context: BenchmarkValidationContextV1, registry: MetricRegistryV1 = BENCHMARK_METRIC_REGISTRY_V1): BenchmarkValidationResultV1<BenchmarkRunDocumentV1> {
  const structure = validateBenchmarkRunStructureV1(value); if (!structure.valid) return structure;
  if (context === undefined || context === null) return failure(new ValidationError('provenance-or-bundle', 'validation-context-missing', '$', 'An accepted fixture, candidate, and run-plan validation context is required.'));
  try { validateCanonicalMetricRegistry(registry); validateAcceptedValidationContext(context, registry); } catch (error) { return failure(error); }
  try { semanticDocument(structure.value, context, registry); return structure; } catch (error) { return failure(error); }
}

export const validateBenchmarkDocumentV1 = validateBenchmarkRunV1;
export const validateHardwareCellV1 = validateBenchmarkRunV1;

function failure<T>(error: unknown): BenchmarkValidationResultV1<T> {
  const validationError = error instanceof ValidationError ? error : new ValidationError('parse', 'validator-error', '$', error instanceof Error ? error.message : 'Validation failed.');
  return { valid: false, stage: validationError.stage, code: validationError.code, issues: [{ stage: validationError.stage, code: validationError.code, path: validationError.path, detail: validationError.message }] };
}

export function validateMetricRegistryV1(registry: unknown = BENCHMARK_METRIC_REGISTRY_V1): BenchmarkValidationResultV1<MetricRegistryV1> {
  try {
    const value = closed(registry, ['schemaVersion', 'protocolVersion', 'metrics', 'telemetryMappings', 'producibilityCrosswalk', 'metricRegistrySha256'], '$');
    schema(value.schemaVersion === 'benchmark-metric-registry-v1' && value.protocolVersion === BENCHMARK_PROTOCOL_VERSION, '$', 'Wrong metric registry version.');
    const metrics = array(value.metrics, '$.metrics');
    schema(metrics.length > 0, '$.metrics', 'Metric registry cannot be empty.');
    let previous = '';
    const refs = new Set<string>();
    const metricsByRef = new Map<string, JsonObject>();
    for (let index = 0; index < metrics.length; index += 1) {
      const metric = object(metrics[index], `$.metrics[${index}]`);
       validMetricDefinition(metric, `$.metrics[${index}]`);
       validateMetricDimensionContracts(metric, `$.metrics[${index}].dimensionContracts`);
       const ref = metric.metricRef as string;
       const canonicalMetric = BENCHMARK_METRIC_REGISTRY_V1.metrics.find((entry) => entry.metricRef === ref);
       semantic(canonicalMetric !== undefined && sameCanonicalValue(metric.warmupControl, canonicalMetric.warmupControl), `$.metrics[${index}].warmupControl`, 'Metric warmup control does not match the canonical owner binding.', 'warmup-control-mismatch');
       semantic(!refs.has(ref), `$.metrics[${index}].metricRef`, 'Duplicate metric reference.', 'duplicate-id');
      semantic(previous === '' || compareUtf16(previous, ref) < 0, `$.metrics[${index}].metricRef`, 'Metric references must be sorted.', 'order-invalid');
      previous = ref;
      refs.add(ref);
      metricsByRef.set(ref, metric);
    }

    const telemetryMappings = array(value.telemetryMappings, '$.telemetryMappings');
    schema(telemetryMappings.length > 0, '$.telemetryMappings', 'Telemetry mapping registry cannot be empty.');
    previous = '';
    const mappingsByRecordName = new Map<string, JsonObject>();
    for (let index = 0; index < telemetryMappings.length; index += 1) {
      const mapping = validateGlobalTelemetryMapping(telemetryMappings[index], `$.telemetryMappings[${index}]`);
      const recordName = mapping.recordName as string;
      semantic(!mappingsByRecordName.has(recordName), `$.telemetryMappings[${index}].recordName`, 'Telemetry record names must be unique.', 'duplicate-id');
      semantic(previous === '' || compareUtf16(previous, recordName) < 0, `$.telemetryMappings[${index}].recordName`, 'Telemetry record names must be sorted.', 'order-invalid');
      previous = recordName;
      mappingsByRecordName.set(recordName, mapping);
      if (mapping.disposition === 'emit-sample') {
        const metric = metricsByRef.get(mapping.metricRef as string);
        semantic(metric !== undefined, `$.telemetryMappings[${index}].metricRef`, 'Emit mapping references an unknown metric.', 'metric-mapping-mismatch');
        if (metric !== undefined) semantic(metric.unit === mapping.unit, `$.telemetryMappings[${index}].unit`, 'Emit mapping unit does not match its metric.', 'metric-mapping-mismatch');
      }
    }
    for (let metricIndex = 0; metricIndex < metrics.length; metricIndex += 1) {
      const metric = object(metrics[metricIndex], `$.metrics[${metricIndex}]`);
      const mappings = array(metric.sourceMapping, `$.metrics[${metricIndex}].sourceMapping`);
      for (let mappingIndex = 0; mappingIndex < mappings.length; mappingIndex += 1) {
        const mapping = object(mappings[mappingIndex], `$.metrics[${metricIndex}].sourceMapping[${mappingIndex}]`);
        const recordName = mapping.recordName as string;
        const globalMapping = mappingsByRecordName.get(recordName);
        semantic(globalMapping !== undefined, `$.metrics[${metricIndex}].sourceMapping[${mappingIndex}].recordName`, 'Metric source mapping is not in the global telemetry mapping table.', 'metric-mapping-mismatch');
        if (globalMapping !== undefined) semantic(globalMapping.disposition === mapping.disposition && (mapping.disposition !== 'emit-sample' || (globalMapping.metricRef === mapping.metricRef && globalMapping.unit === mapping.unit)), `$.metrics[${metricIndex}].sourceMapping[${mappingIndex}]`, 'Metric emit mapping differs from the global telemetry mapping.', 'metric-mapping-mismatch');
      }
    }
    for (let globalIndex = 0; globalIndex < telemetryMappings.length; globalIndex += 1) {
      const globalMapping = object(telemetryMappings[globalIndex], `$.telemetryMappings[${globalIndex}]`);
      if (globalMapping.disposition !== 'emit-sample') continue;
      let localMatches = 0;
      for (let metricIndex = 0; metricIndex < metrics.length; metricIndex += 1) {
        const metric = object(metrics[metricIndex], `$.metrics[${metricIndex}]`);
        const mappings = array(metric.sourceMapping, `$.metrics[${metricIndex}].sourceMapping`);
        for (const mappingValue of mappings) {
          const mapping = object(mappingValue, `$.metrics[${metricIndex}].sourceMapping`);
          if (mapping.recordName === globalMapping.recordName && mapping.disposition === 'emit-sample' && mapping.metricRef === globalMapping.metricRef && mapping.unit === globalMapping.unit) localMatches += 1;
        }
      }
      semantic(localMatches === 1, `$.telemetryMappings[${globalIndex}]`, 'Each global emit mapping must have exactly one matching local metric mapping.', 'metric-mapping-mismatch');
    }
    validateMetricProducibilityCrosswalk(value.producibilityCrosswalk, metricsByRef, '$.producibilityCrosswalk');
    validSha(value.metricRegistrySha256, '$.metricRegistrySha256');
    const withoutDigest = { schemaVersion: value.schemaVersion, protocolVersion: value.protocolVersion, metrics: value.metrics, telemetryMappings: value.telemetryMappings, producibilityCrosswalk: value.producibilityCrosswalk };
    semantic(value.metricRegistrySha256 === sha256BytesV1(canonicalizeJsonV1(withoutDigest)), '$.metricRegistrySha256', 'Metric registry digest mismatch.', 'registry-digest-mismatch');
    return { valid: true, value: registry as MetricRegistryV1, issues: [] };
  } catch (error) { return failure(error); }
}

function validateMetricProducibilityCrosswalk(
  value: unknown,
  metricsByRef: ReadonlyMap<string, JsonObject>,
  path: string,
): void {
  const entries = array(value, path);
  const expectedCount = benchmarkScenarioDefinitionsV1.reduce((total, definition) => {
    const backendCount = definition.parameterContracts.some((contract) => contract.key === 'backend') ? 2 : 1;
    return total + definition.allowedPhases.length * backendCount * definition.metricContracts.length;
  }, 0);
  schema(entries.length === expectedCount, path, 'Metric producibility crosswalk is incomplete.', 'producibility-crosswalk-incomplete');
  const seen = new Set<string>();
  for (let index = 0; index < entries.length; index += 1) {
    const entryPath = `${path}[${index}]`;
    const entry = object(entries[index], entryPath);
    const baseKeys = ['scenarioId', 'phase', 'backend', 'metricRef', 'scenarioMetricContractOrdinal', 'classification'] as const;
    for (const key of baseKeys) schema(Object.prototype.hasOwnProperty.call(entry, key), `${entryPath}.${key}`, 'Missing crosswalk property.');
    const base = entry;
    const scenarioId = string(base.scenarioId, `${entryPath}.scenarioId`, true);
    const scenario = BENCHMARK_SCENARIO_REGISTRY_V1[scenarioId as keyof typeof BENCHMARK_SCENARIO_REGISTRY_V1]?.definition;
    semantic(scenario !== undefined, `${entryPath}.scenarioId`, 'Crosswalk references an unknown scenario.', 'producibility-crosswalk-invalid');
    if (scenario === undefined) continue;
    const phase = string(base.phase, `${entryPath}.phase`, true);
    semantic(scenario.allowedPhases.includes(phase as BenchmarkSamplePhaseV1), `${entryPath}.phase`, 'Crosswalk phase is not allowed by its scenario.', 'producibility-crosswalk-invalid');
    const backend = string(base.backend, `${entryPath}.backend`, true);
    const hasBackend = scenario.parameterContracts.some((contract) => contract.key === 'backend');
    semantic((hasBackend && (backend === 'raw-webgpu' || backend === 'three-webgl2')) || (!hasBackend && backend === 'not-applicable'), `${entryPath}.backend`, 'Crosswalk backend cell is invalid for its scenario.', 'producibility-crosswalk-invalid');
    const metricRef = validMetricRef(base.metricRef, `${entryPath}.metricRef`);
    const ordinal = safeInteger(base.scenarioMetricContractOrdinal, `${entryPath}.scenarioMetricContractOrdinal`, 0);
    const contract = scenario.metricContracts[ordinal];
    semantic(contract !== undefined && contract.metricRef === metricRef, `${entryPath}.scenarioMetricContractOrdinal`, 'Crosswalk metric contract ordinal is not canonical.', 'producibility-crosswalk-invalid');
    const key = `${scenarioId}|${phase}|${backend}|${metricRef}|${ordinal}`;
    semantic(!seen.has(key), entryPath, 'Crosswalk cells must be unique.', 'producibility-crosswalk-duplicate');
    seen.add(key);
    const classification = string(base.classification, `${entryPath}.classification`, true);
    const metric = metricsByRef.get(metricRef);
    semantic(metric !== undefined, `${entryPath}.metricRef`, 'Crosswalk references an unknown metric.', 'metric-unknown');
    const scenarioAllowsPhase = scenario.allowedPhases.includes(phase as BenchmarkSamplePhaseV1);
    const metricAllowedForCell = metric !== undefined
      && (metric.allowedPhases as unknown[]).includes(phase)
      && (metric.allowedContainers as unknown[]).includes(phase === 'warmup' || phase === 'measurement' ? 'warm-measurement' : phase);
    const metricDefinitionAllowsSample = metricAllowedForCell
      && (metric.sourceMapping as unknown[]).some((mappingValue) => (mappingValue as JsonObject).disposition === 'emit-sample');
    const requiredForCell = scenarioAllowsPhase && metricAllowedForCell && contract!.requirement.kind === 'required';
    if (classification === 'emit-sample') {
      const emit = closed(entry, ['scenarioId', 'phase', 'backend', 'metricRef', 'scenarioMetricContractOrdinal', 'classification', 'producer'], entryPath);
      const producer = closed(emit.producer, ['recordName', 'metricRef', 'unit'], `${entryPath}.producer`);
      validId(producer.recordName, `${entryPath}.producer.recordName`);
      validMetricRef(producer.metricRef, `${entryPath}.producer.metricRef`);
      oneOf(string(producer.unit, `${entryPath}.producer.unit`), ['ms', 'bytes', 'count', 'ratio', 'revision', 'hertz', 'percent'], `${entryPath}.producer.unit`);
      semantic(producer.metricRef === metricRef && metric !== undefined && producer.unit === metric.unit, `${entryPath}.producer`, 'Crosswalk producer does not bind the canonical metric.', 'metric-mapping-mismatch');
      semantic(metric !== undefined && Array.isArray(metric.sourceMapping) && (metric.sourceMapping as unknown[]).some((mappingValue) => {
        const mapping = mappingValue as JsonObject;
        return mapping.disposition === 'emit-sample' && mapping.recordName === producer.recordName && mapping.metricRef === producer.metricRef && mapping.unit === producer.unit;
      }), `${entryPath}.producer`, 'Crosswalk producer is not a canonical source mapping.', 'metric-mapping-mismatch');
    } else if (classification === 'capability-bound-unavailable') {
      const unavailable = closed(entry, ['scenarioId', 'phase', 'backend', 'metricRef', 'scenarioMetricContractOrdinal', 'classification', 'required', 'capabilityId', 'reasonCode'], entryPath);
      const required = boolean(unavailable.required, `${entryPath}.required`);
      semantic(required === requiredForCell, `${entryPath}.required`, 'Crosswalk required flag does not match the scenario metric contract.', 'producibility-crosswalk-invalid');
      semantic(!scenarioAllowsPhase || !metricDefinitionAllowsSample, entryPath, 'A canonical producer cannot be marked capability-bound unavailable.', 'producibility-crosswalk-invalid');
      validId(unavailable.capabilityId, `${entryPath}.capabilityId`);
      oneOf(string(unavailable.reasonCode, `${entryPath}.reasonCode`), ['capability-bound', 'producer-unavailable', 'diagnostic-only'], `${entryPath}.reasonCode`);
    } else if (classification === 'eligibility-bound-unavailable') {
      const unavailable = closed(entry, ['scenarioId', 'phase', 'backend', 'metricRef', 'scenarioMetricContractOrdinal', 'classification', 'required', 'reasonCode'], entryPath);
      const required = boolean(unavailable.required, `${entryPath}.required`);
      semantic(required === requiredForCell, `${entryPath}.required`, 'Crosswalk required flag does not match the scenario metric contract.', 'producibility-crosswalk-invalid');
      semantic(!scenarioAllowsPhase || !metricDefinitionAllowsSample, entryPath, 'A canonical producer cannot be marked eligibility-bound unavailable in an allowed cell.', 'producibility-crosswalk-invalid');
      oneOf(string(unavailable.reasonCode, `${entryPath}.reasonCode`), ['phase-not-allowed', 'container-not-allowed', 'producer-unavailable', 'diagnostic-only'], `${entryPath}.reasonCode`);
    } else {
      fail('schema', 'enum-invalid', `${entryPath}.classification`, 'Unknown metric producibility classification.');
    }
  }
  semantic(seen.size === expectedCount, path, 'Metric producibility crosswalk does not cover every scenario phase/backend/metric contract cell.', 'producibility-crosswalk-incomplete');
}

function validateGlobalTelemetryMapping(value: unknown, path: string): JsonObject {
  const mapping = object(value, path);
  const disposition = string(mapping.disposition, `${path}.disposition`, true);
  if (disposition === 'emit-sample') {
    closed(mapping, ['recordName', 'disposition', 'metricRef', 'unit'], path);
    validMetricRef(mapping.metricRef, `${path}.metricRef`);
    oneOf(string(mapping.unit, `${path}.unit`), ['ms', 'bytes', 'count', 'ratio', 'revision', 'hertz', 'percent'], `${path}.unit`);
  } else {
    closed(mapping, ['recordName', 'disposition'], path);
  }
  validId(mapping.recordName, `${path}.recordName`);
  oneOf(disposition, ['emit-sample', 'context-only', 'diagnostic-only', 'control-only'], `${path}.disposition`);
  return mapping;
}

function validateMetricMappings(value: JsonObject, path: string): void {
  const ref = string(value.metricRef, `${path}.metricRef`);
  const unit = string(value.unit, `${path}.unit`);
  const mappings = array(value.sourceMapping, `${path}.sourceMapping`);
  for (let index = 0; index < mappings.length; index += 1) {
    const mapping = object(mappings[index], `${path}.sourceMapping[${index}]`);
    for (const key of Object.keys(mapping)) schema(['recordName', 'disposition', 'metricRef', 'unit'].includes(key), `${path}.sourceMapping[${index}].${key}`, 'Unknown source mapping property.');
    validId(mapping.recordName, `${path}.sourceMapping[${index}].recordName`);
    oneOf(string(mapping.disposition, `${path}.sourceMapping[${index}].disposition`), ['emit-sample', 'context-only', 'diagnostic-only', 'control-only'], `${path}.sourceMapping[${index}].disposition`);
    if (mapping.disposition === 'emit-sample') {
      validMetricRef(mapping.metricRef, `${path}.sourceMapping[${index}].metricRef`);
      oneOf(string(mapping.unit, `${path}.sourceMapping[${index}].unit`), ['ms', 'bytes', 'count', 'ratio', 'revision', 'hertz', 'percent'], `${path}.sourceMapping[${index}].unit`);
      semantic(mapping.metricRef === ref && mapping.unit === unit, `${path}.sourceMapping[${index}]`, 'Emit mapping must bind the enclosing metric reference and unit.', 'metric-mapping-mismatch');
    } else {
      schema(mapping.metricRef === undefined && mapping.unit === undefined, `${path}.sourceMapping[${index}]`, 'Conservative source mappings must not claim metric emission.');
    }
  }
}

function validateMetricDimensionContracts(value: JsonObject, path: string): void {
  const dimensions = array(value.dimensionContracts, path);
  let previous = '';
  const seen = new Set<string>();
  for (let index = 0; index < dimensions.length; index += 1) {
    const dimension = closed(dimensions[index], ['key', 'domain'], `${path}[${index}]`);
    const key = validId(dimension.key, `${path}[${index}].key`);
    semantic(!seen.has(key) && (previous === '' || compareUtf16(previous, key) < 0), `${path}[${index}].key`, 'Metric dimension contracts must be sorted and unique.', 'metric-dimension-order-invalid');
    const domain = closed(dimension.domain, ['kind'], `${path}[${index}].domain`);
    oneOf(string(domain.kind, `${path}[${index}].domain.kind`), ['canonical-id', 'non-negative-safe-integer', 'sha256'], `${path}[${index}].domain.kind`);
    const owner = BENCHMARK_METRIC_DIMENSION_DOMAIN_OWNERS_V1[key];
    semantic(owner !== undefined, `${path}[${index}].key`, 'Metric dimension key has no explicit domain owner.', 'metric-dimension-domain-invalid');
    if (owner !== undefined) semantic(sameCanonicalValue(domain, owner), `${path}[${index}].domain`, 'Metric dimension domain does not match its explicit owner.', 'metric-dimension-domain-invalid');
    seen.add(key);
    previous = key;
  }
  const grouping = object(value.grouping, '$.grouping');
  const pairing = object(value.pairing, '$.pairing');
  const hierarchy = new Set(['hardware-profile', 'phase', 'candidate', 'iteration-ordinal', 'bootstrap-cluster-id']);
  const expected = new Set<string>();
  for (const source of [grouping.keys, pairing.keys]) {
    for (const key of array(source, '$.dimension-source')) {
      const keyValue = String(key);
      if (!hierarchy.has(keyValue)) expected.add(keyValue);
    }
  }
  if (String(value.metricRef).endsWith('.sha256.match@1')) {
    expected.add('actual-sha256');
    expected.add('expected-sha256');
  }
   semantic(seen.size === expected.size && [...expected].every((key) => seen.has(key)), path, 'Metric dimension contracts must cover the exact grouping/pairing dimension set.', 'metric-dimension-contract-invalid');
   for (const key of expected) semantic(BENCHMARK_METRIC_DIMENSION_DOMAIN_OWNERS_V1[key] !== undefined, path, 'Metric grouping or pairing contains an unknown dimension key.', 'metric-dimension-domain-invalid');
}

function validMetricDefinition(value: JsonObject, path: string): void {
  validateMetricMappings(value, path);
  if (value.warmupControl !== null && value.warmupControl !== undefined) {
    const warmupControl = closed(value.warmupControl, ['metricRef', 'epsilon'], `${path}.warmupControl`);
    validMetricRef(warmupControl.metricRef, `${path}.warmupControl.metricRef`);
    positiveFinite(warmupControl.epsilon, `${path}.warmupControl.epsilon`);
    semantic(warmupControl.metricRef === value.metricRef, `${path}.warmupControl.metricRef`, 'Metric warmup control must own its enclosing metric.', 'warmup-metric-mismatch');
  }
  const required = ['schemaVersion', 'metricRef', 'kind', 'unit', 'numericDomain', 'eventSemantics', 'populationSemantics', 'allowedContainers', 'allowedPhases', 'capabilityRequirements', 'sourceMapping', 'grouping', 'pairing', 'dimensionContracts', 'direction', 'warmupControl', 'practicalEffectDelta', 'automaticDecision'];
  closed(value, required, path); schema(value.schemaVersion === 'benchmark-metric-definition-v1', `${path}.schemaVersion`, 'Wrong metric schema version.'); validMetricRef(value.metricRef, `${path}.metricRef`); oneOf(string(value.kind, `${path}.kind`), ['duration', 'counter', 'memory', 'frame', 'long-task', 'gpu', 'liveness'], `${path}.kind`); oneOf(string(value.unit, `${path}.unit`), ['ms', 'bytes', 'count', 'ratio', 'revision', 'hertz', 'percent'], `${path}.unit`); const domain = closed(value.numericDomain, ['kind', 'minimum', 'maximum'], `${path}.numericDomain`); oneOf(string(domain.kind, `${path}.numericDomain.kind`), ['finite-number', 'non-negative-safe-integer', 'positive-finite-number'], `${path}.numericDomain.kind`); finite(domain.minimum, `${path}.numericDomain.minimum`, 0); if (domain.maximum !== null) finite(domain.maximum, `${path}.numericDomain.maximum`, domain.minimum as number); string(value.eventSemantics, `${path}.eventSemantics`, true); string(value.populationSemantics, `${path}.populationSemantics`, true); const containers = array(value.allowedContainers, `${path}.allowedContainers`); containers.forEach((entry, index) => oneOf(string(entry, `${path}.allowedContainers[${index}]`), ['cold', 'warm-measurement', 'stress', 'trace', 'leak'], `${path}.allowedContainers[${index}]`)); const phases = array(value.allowedPhases, `${path}.allowedPhases`); phases.forEach((entry, index) => oneOf(string(entry, `${path}.allowedPhases[${index}]`), ['cold', 'warmup', 'measurement', 'stress', 'trace', 'leak'], `${path}.allowedPhases[${index}]`)); const caps = array(value.capabilityRequirements, `${path}.capabilityRequirements`); caps.forEach((entry, index) => validId(entry, `${path}.capabilityRequirements[${index}]`)); const mappings = array(value.sourceMapping, `${path}.sourceMapping`); schema(mappings.length > 0, `${path}.sourceMapping`, 'Source mapping cannot be empty.'); mappings.forEach((entry, index) => { const mapping = object(entry, `${path}.sourceMapping[${index}]`); for (const key of Object.keys(mapping)) schema(['recordName', 'disposition', 'metricRef', 'unit'].includes(key), `${path}.sourceMapping[${index}].${key}`, 'Unknown source mapping property.'); schema(Object.prototype.hasOwnProperty.call(mapping, 'recordName') && Object.prototype.hasOwnProperty.call(mapping, 'disposition'), `${path}.sourceMapping[${index}]`, 'Source mapping requires recordName and disposition.'); validId(mapping.recordName, `${path}.sourceMapping[${index}].recordName`); oneOf(string(mapping.disposition, `${path}.sourceMapping[${index}].disposition`), ['emit-sample', 'context-only', 'diagnostic-only', 'control-only'], `${path}.sourceMapping[${index}].disposition`); if (mapping.disposition === 'emit-sample') { schema(Object.prototype.hasOwnProperty.call(mapping, 'metricRef') && Object.prototype.hasOwnProperty.call(mapping, 'unit'), `${path}.sourceMapping[${index}]`, 'Sample mappings require metricRef and unit.'); validMetricRef(mapping.metricRef, `${path}.sourceMapping[${index}].metricRef`); oneOf(string(mapping.unit, `${path}.sourceMapping[${index}].unit`), ['ms', 'bytes', 'count', 'ratio', 'revision', 'hertz', 'percent'], `${path}.sourceMapping[${index}].unit`); } else { schema(mapping.metricRef === undefined && mapping.unit === undefined, `${path}.sourceMapping[${index}]`, 'Non-sample mappings cannot bind a metric.'); } }); const grouping = closed(value.grouping, ['keys', 'population'], `${path}.grouping`); array(grouping.keys, `${path}.grouping.keys`).forEach((entry, index) => validId(entry, `${path}.grouping.keys[${index}]`)); string(grouping.population, `${path}.grouping.population`, true); const pairing = closed(value.pairing, ['keys', 'level'], `${path}.pairing`); array(pairing.keys, `${path}.pairing.keys`).forEach((entry, index) => validId(entry, `${path}.pairing.keys[${index}]`)); oneOf(string(pairing.level, `${path}.pairing.level`), ['run', 'iteration', 'event', 'time-block', 'window', 'burst'], `${path}.pairing.level`); oneOf(string(value.direction, `${path}.direction`), ['lower', 'higher', 'context-dependent'], `${path}.direction`); if (value.warmupControl !== null) { const warmup = closed(value.warmupControl, ['metricRef', 'epsilon'], `${path}.warmupControl`); validMetricRef(warmup.metricRef, `${path}.warmupControl.metricRef`); finite(warmup.epsilon, `${path}.warmupControl.epsilon`, 0); } schema(value.practicalEffectDelta === null || typeof value.practicalEffectDelta === 'number', `${path}.practicalEffectDelta`, 'Effect delta must be numeric or null.'); if (value.practicalEffectDelta !== null) finite(value.practicalEffectDelta, `${path}.practicalEffectDelta`, 0); schema(value.automaticDecision === 'forbidden', `${path}.automaticDecision`, 'Automatic decisions are forbidden.');
}

type BenchmarkTelemetryDerivationEvidenceWithoutDigestV1 = Omit<BenchmarkTelemetryDerivationEvidenceV1, 'evidenceSha256'>;

export function calculateBenchmarkDerivedRawSamplesCanonicalSha256V1(
  samples: readonly BenchmarkRawSampleV1[],
): Sha256DigestV1 {
  return sha256BytesV1(canonicalizeJsonV1(samples));
}

export function calculateBenchmarkTelemetryAdapterResultsCanonicalSha256V1(
  results: readonly BenchmarkTelemetryAdapterResultProjectionV1[],
): Sha256DigestV1 {
  return sha256BytesV1(canonicalizeJsonV1(results));
}

export function calculateBenchmarkTelemetryDerivationEvidenceSha256V1(
  evidence: BenchmarkTelemetryDerivationEvidenceWithoutDigestV1,
): Sha256DigestV1 {
  return sha256BytesV1(canonicalizeJsonV1(evidence));
}

function buildTelemetryDerivationEvidenceV1(
  input: BenchmarkValidationReceiptInputV1,
  telemetry: JsonObject,
  targetRun: BenchmarkRunV1,
  metricRegistry: MetricRegistryV1,
  telemetryExportRawByteSha256: Sha256DigestV1,
): BenchmarkTelemetryDerivationEvidenceV1 {
  const samples = targetRun.iterations.flatMap((iteration) => iteration.samples);
  if (samples.length === 0) throw new Error('Cannot mint a receipt for a target run without derived samples.');
  const adapterResults: BenchmarkTelemetryAdapterResultProjectionV1[] = [];
  for (const iteration of targetRun.iterations) {
    const adapted = input.telemetryAdapter.adapt(telemetry, {
      hardwareCellId: targetRun.hardwareCellId,
      slotId: targetRun.ids.slotId,
      browserProcessId: targetRun.browserProcessId,
      runId: targetRun.runId,
      iterationId: iteration.iterationId,
      phase: iteration.phase,
      runBindingSha256: targetRun.runBindingSha256,
    }, metricRegistry);
    if (adapted === null || typeof adapted !== 'object' || !Array.isArray(adapted.samples) || !Array.isArray(adapted.invalidReasons)) {
      throw new Error('BR02 telemetry adapter returned an invalid derivation result.');
    }
    for (const [index, reason] of adapted.invalidReasons.entries()) validateReason(reason, `$.telemetryAdapter.invalidReasons[${index}]`);
    if (adapted.invalidReasons.length !== 0) throw new Error('Cannot mint a receipt for an invalid telemetry derivation.');
    if (!sameCanonicalValue(adapted.samples, iteration.samples)) throw new Error('BR02 telemetry derivation does not match the validated target-run samples.');
    adapterResults.push({
      iterationId: iteration.iterationId,
      iterationOrdinal: iteration.iterationOrdinal,
      runId: iteration.runId,
      phase: iteration.phase,
      samples: adapted.samples,
      invalidReasons: adapted.invalidReasons,
    });
  }
  const withoutDigest: BenchmarkTelemetryDerivationEvidenceWithoutDigestV1 = {
    schemaVersion: 'benchmark-telemetry-derivation-evidence-v1',
    adapterContractId: BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_ID_V1,
    adapterContractVersion: BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_VERSION_V1,
    metricRegistrySha256: metricRegistry.metricRegistrySha256,
    targetRunId: targetRun.runId,
    targetRunBindingSha256: targetRun.runBindingSha256,
    telemetryExportRawByteSha256,
    adapterResultsCanonicalSha256: calculateBenchmarkTelemetryAdapterResultsCanonicalSha256V1(adapterResults),
    derivedRawSamplesCanonicalSha256: calculateBenchmarkDerivedRawSamplesCanonicalSha256V1(samples),
    derivedSampleCount: samples.length as BenchmarkTelemetryDerivationEvidenceV1['derivedSampleCount'],
  };
  return { ...withoutDigest, evidenceSha256: calculateBenchmarkTelemetryDerivationEvidenceSha256V1(withoutDigest) };
}

export function createBenchmarkValidationReceiptV1(input: BenchmarkValidationReceiptInputV1): BenchmarkValidationReceiptV1 {
  validGitSha(input.validatorSourceCommitSha, '$.validatorSourceCommitSha');
  if (input.planId !== input.validationContext.runPlan.id) throw new Error('Receipt plan does not match the validation context.');
  if (!timingSafeEqualSha256V1(sha256BytesV1(input.schemaSetBytes), BENCHMARK_SCHEMA_SET_SHA256_V1)) throw new Error('Receipt schema bytes do not match the production schema set.');
  const registryValidation = validateMetricRegistryV1(input.metricRegistry);
  if (!registryValidation.valid) throw new Error(`Cannot mint a receipt for an invalid metric registry: ${registryValidation.code}.`);
   if (!timingSafeEqualSha256V1(registryValidation.value.metricRegistrySha256, BENCHMARK_METRIC_REGISTRY_V1.metricRegistrySha256)) throw new Error('Cannot mint a receipt for a non-canonical metric registry.');
  const schemaSetSha256 = BENCHMARK_SCHEMA_SET_SHA256_V1;
  const metricRegistrySha256 = registryValidation.value.metricRegistrySha256;
   if (!timingSafeEqualSha256V1(input.validationContext.schemaSetSha256, schemaSetSha256)) throw new Error('Schema-set digest does not match the validation context.');
   if (!timingSafeEqualSha256V1(input.validationContext.metricRegistrySha256, metricRegistrySha256)) throw new Error('Metric-registry digest does not match the validation context.');
  const parsed = parseCanonicalJsonV1(input.benchmarkRunRawBytes);
  const canonicalRunBytes = canonicalizeJsonV1(parsed);
  if (input.benchmarkRunCanonicalBytes !== undefined && !sameBytes(input.benchmarkRunCanonicalBytes, canonicalRunBytes)) throw new Error('Canonical run bytes do not match the raw run.');
  const structure = validateBenchmarkRunStructureV1(parsed);
  if (!structure.valid) throw new Error(`Cannot mint a receipt for an invalid run: ${structure.issues[0]!.code}.`);
  const validation = validateBenchmarkRunV1(parsed, input.validationContext, registryValidation.value);
  if (!validation.valid) throw new Error(`Cannot mint a receipt for an invalid run: ${validation.code}.`);
  const targetRuns = structure.value.browserProcesses.flatMap((process) => process.runs).filter((candidate) => candidate.runId === input.runId);
  if (targetRuns.length !== 1) throw new Error('Receipt run context does not identify exactly one run.');
   const targetRun = targetRuns[0]!;
   if (targetRun.execution.validity.status !== 'valid') throw new Error('Cannot mint a receipt for an execution-invalid target run.');
   if (targetRun.ids.slotId !== input.slotId || targetRun.execution.runPlanId !== input.planId
     || !timingSafeEqualSha256V1(targetRun.execution.runPlanSha256, input.validationContext.runPlan.sha256)) throw new Error('Receipt plan, slot, or run context does not match the validated run.');
   const telemetry = parseCanonicalJsonV1(input.telemetryExportRawBytes);
   if (!isObject(telemetry)) throw new Error('Telemetry export must be a JSON object.');
   const telemetryExportRawByteSha256 = sha256BytesV1(input.telemetryExportRawBytes);
   const telemetryDerivationEvidence = buildTelemetryDerivationEvidenceV1(input, telemetry, targetRun, registryValidation.value, telemetryExportRawByteSha256);
   const receiptWithoutId: Omit<BenchmarkValidationReceiptV1, 'receiptId'> = {
    schemaVersion: 'benchmark-validation-receipt-v1',
    protocolVersion: BENCHMARK_PROTOCOL_VERSION,
    status: 'schema-and-integrity-valid',
    planId: input.validationContext.runPlan.id,
    slotId: input.slotId,
    runId: targetRun.runId,
    planDigest: input.validationContext.runPlan.sha256,
     telemetryExportRawByteSha256,
    benchmarkRunRawByteSha256: sha256BytesV1(input.benchmarkRunRawBytes),
    benchmarkRunCanonicalSha256: sha256BytesV1(canonicalRunBytes),
    runBindingSha256: targetRun.runBindingSha256,
     schemaSetSha256,
     metricRegistrySha256,
     telemetryDerivationEvidence,
     telemetryDerivationEvidenceSha256: telemetryDerivationEvidence.evidenceSha256,
     validator: { id: 'br01-validator-v1', sourceCommitSha: input.validatorSourceCommitSha, sourceFileSetSha256: digestFileSetV1(input.validatorSourceFiles) },
   };
   if (timingSafeEqualSha256V1(receiptWithoutId.telemetryExportRawByteSha256, receiptWithoutId.benchmarkRunRawByteSha256)) throw new Error('Telemetry and run raw digests must remain separate.');
  return { ...receiptWithoutId, receiptId: sha256BytesV1(canonicalizeJsonV1(receiptWithoutId)) };
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function validateTelemetryDerivationEvidence(value: unknown, path: string): BenchmarkTelemetryDerivationEvidenceV1 {
  const evidence = closed(value, [
    'schemaVersion', 'adapterContractId', 'adapterContractVersion', 'metricRegistrySha256', 'targetRunId', 'targetRunBindingSha256',
    'telemetryExportRawByteSha256', 'adapterResultsCanonicalSha256', 'derivedRawSamplesCanonicalSha256', 'derivedSampleCount', 'evidenceSha256',
  ], path);
  schema(evidence.schemaVersion === 'benchmark-telemetry-derivation-evidence-v1', `${path}.schemaVersion`, 'Wrong telemetry derivation evidence schema version.');
  schema(evidence.adapterContractId === BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_ID_V1, `${path}.adapterContractId`, 'Wrong accepted BR02 adapter contract.');
  schema(evidence.adapterContractVersion === BENCHMARK_TELEMETRY_ADAPTER_CONTRACT_VERSION_V1, `${path}.adapterContractVersion`, 'Wrong accepted BR02 adapter contract version.');
  for (const key of ['metricRegistrySha256', 'targetRunBindingSha256', 'telemetryExportRawByteSha256', 'adapterResultsCanonicalSha256', 'derivedRawSamplesCanonicalSha256', 'evidenceSha256']) {
    validSha(evidence[key], `${path}.${key}`);
  }
  validId(evidence.targetRunId, `${path}.targetRunId`);
  safeInteger(evidence.derivedSampleCount, `${path}.derivedSampleCount`, 1);
  const withoutDigest = { ...evidence };
  delete withoutDigest.evidenceSha256;
  semantic(timingSafeEqualSha256V1(evidence.evidenceSha256, calculateBenchmarkTelemetryDerivationEvidenceSha256V1(withoutDigest as BenchmarkTelemetryDerivationEvidenceWithoutDigestV1)), `${path}.evidenceSha256`, 'Telemetry derivation evidence digest mismatch.', 'derivation-evidence-digest-mismatch');
  return evidence as unknown as BenchmarkTelemetryDerivationEvidenceV1;
}

export function validateBenchmarkValidationReceiptV1(value: unknown): BenchmarkValidationResultV1<BenchmarkValidationReceiptV1> {
  try {
    const receipt = closed(value, [
      'schemaVersion', 'protocolVersion', 'status', 'receiptId', 'planId', 'slotId', 'runId', 'planDigest',
      'telemetryExportRawByteSha256', 'benchmarkRunRawByteSha256', 'benchmarkRunCanonicalSha256', 'runBindingSha256',
      'schemaSetSha256', 'metricRegistrySha256', 'telemetryDerivationEvidence', 'telemetryDerivationEvidenceSha256', 'validator',
    ], '$');
    schema(receipt.schemaVersion === 'benchmark-validation-receipt-v1' && receipt.protocolVersion === BENCHMARK_PROTOCOL_VERSION && receipt.status === 'schema-and-integrity-valid', '$', 'Receipt literals are invalid.');
    validSha(receipt.receiptId, '$.receiptId');
    validId(receipt.planId, '$.planId');
    validId(receipt.slotId, '$.slotId');
    validId(receipt.runId, '$.runId');
    for (const key of ['planDigest', 'telemetryExportRawByteSha256', 'benchmarkRunRawByteSha256', 'benchmarkRunCanonicalSha256', 'runBindingSha256', 'schemaSetSha256', 'metricRegistrySha256', 'telemetryDerivationEvidenceSha256']) validSha(receipt[key], `$.${key}`);
    semantic(timingSafeEqualSha256V1(receipt.schemaSetSha256, BENCHMARK_SCHEMA_SET_SHA256_V1), '$.schemaSetSha256', 'Receipt schema-set digest does not match the canonical schema set.', 'schema-set-digest-mismatch');
    semantic(timingSafeEqualSha256V1(receipt.metricRegistrySha256, BENCHMARK_METRIC_REGISTRY_V1.metricRegistrySha256), '$.metricRegistrySha256', 'Receipt metric-registry digest does not match the canonical metric registry.', 'registry-digest-mismatch');
    const evidence = validateTelemetryDerivationEvidence(receipt.telemetryDerivationEvidence, '$.telemetryDerivationEvidence');
    semantic(timingSafeEqualSha256V1(receipt.telemetryDerivationEvidenceSha256, evidence.evidenceSha256), '$.telemetryDerivationEvidenceSha256', 'Receipt derivation evidence binding does not match the embedded evidence.', 'receipt-binding-invalid');
    semantic(receipt.runId === evidence.targetRunId, '$.runId', 'Receipt run ID does not match derivation evidence.', 'receipt-binding-invalid');
    semantic(timingSafeEqualSha256V1(receipt.runBindingSha256, evidence.targetRunBindingSha256), '$.runBindingSha256', 'Receipt run binding does not match derivation evidence.', 'receipt-binding-invalid');
    semantic(timingSafeEqualSha256V1(receipt.telemetryExportRawByteSha256, evidence.telemetryExportRawByteSha256), '$.telemetryExportRawByteSha256', 'Receipt telemetry binding does not match derivation evidence.', 'receipt-binding-invalid');
    semantic(timingSafeEqualSha256V1(receipt.metricRegistrySha256, evidence.metricRegistrySha256), '$.metricRegistrySha256', 'Receipt registry binding does not match derivation evidence.', 'receipt-binding-invalid');
    const validator = closed(receipt.validator, ['id', 'sourceCommitSha', 'sourceFileSetSha256'], '$.validator');
    schema(validator.id === 'br01-validator-v1', '$.validator.id', 'Wrong validator ID.');
    validGitSha(validator.sourceCommitSha, '$.validator.sourceCommitSha');
    validSha(validator.sourceFileSetSha256, '$.validator.sourceFileSetSha256');
    const withoutId = { ...receipt };
    delete withoutId.receiptId;
    semantic(timingSafeEqualSha256V1(receipt.receiptId, sha256BytesV1(canonicalizeJsonV1(withoutId))), '$.receiptId', 'Receipt ID is not self-excluding.', 'receipt-digest-mismatch');
    semantic(!timingSafeEqualSha256V1(receipt.telemetryExportRawByteSha256, receipt.benchmarkRunRawByteSha256), '$.benchmarkRunRawByteSha256', 'Telemetry and run raw digests must remain separate.', 'receipt-binding-invalid');
    return { valid: true, value: value as BenchmarkValidationReceiptV1, issues: [] };
  } catch (error) { return failure(error); }
}

export function toBenchmarkValidationFailureV1(runId: CanonicalIdV1, stage: BenchmarkValidationStageV1, reason: BenchmarkInvalidReasonV1, receiptId?: Sha256DigestV1): BenchmarkValidationFailureV1 {
  return receiptId === undefined ? { schemaVersion: 'benchmark-validation-failure-v1', protocolVersion: BENCHMARK_PROTOCOL_VERSION, stage, reason, runId } : { schemaVersion: 'benchmark-validation-failure-v1', protocolVersion: BENCHMARK_PROTOCOL_VERSION, stage, reason, runId, receiptId };
}

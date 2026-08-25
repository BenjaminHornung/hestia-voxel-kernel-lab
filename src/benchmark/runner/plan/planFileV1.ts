import type { BenchmarkScenarioParameterV1 } from '../../contracts';
import { canonicalizeJsonV1, parseCanonicalJsonV1 } from '../../provenance';
import type { BuiltRunPlanV1, RunPlanCoreV1, RunPlanInputV1 } from '../contractsV1';
import { verifyBuiltRunPlanV1 } from './runPlanV1';

type JsonObjectV1 = Record<string, unknown>;

function object(value: unknown, label: string): JsonObjectV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return value as JsonObjectV1;
}

function closed(value: unknown, keys: readonly string[], label: string): JsonObjectV1 {
  const result = object(value, label);
  const actual = Object.keys(result);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw new TypeError(`${label} has missing or unknown fields.`);
  return result;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string.`);
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${label} must be a finite number.`);
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean.`);
  return value;
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  return value;
}

function processRequirement(value: unknown, label: string) {
  const result = closed(value, ['enabled', 'minimumProcessesPerCandidate'], label);
  return {
    enabled: boolean(result.enabled, `${label}.enabled`),
    minimumProcessesPerCandidate: finiteNumber(result.minimumProcessesPerCandidate, `${label}.minimumProcessesPerCandidate`),
  };
}

export function parseRunPlanInputJsonV1(bytes: Uint8Array): RunPlanInputV1 {
  let parsed: unknown;
  try {
    parsed = parseCanonicalJsonV1(bytes);
  } catch (error) {
    throw new TypeError(`Run-plan input is not valid UTF-8 JSON: ${error instanceof Error ? error.message : 'parse failure'}.`, { cause: error });
  }
  const input = closed(parsed, [
    'expectedSourceCommitSha', 'expectedBuildSha256', 'fixtureContractId', 'fixtureSemanticSha256',
    'hardwareProfileId', 'hardwareBindingSha256', 'syntheticHardwareProfile', 'browser', 'orderSeed',
    'comparisonMode', 'referenceCandidateId', 'candidates', 'scenarios', 'phases', 'retryPolicy',
  ], '$');
  const browser = closed(input.browser, ['requestedChannel', 'headless', 'requestedArgs'], '$.browser');
  const candidates = array(input.candidates, '$.candidates').map((candidate, index) => {
    const value = closed(candidate, ['id', 'sourceFileSetSha256'], `$.candidates[${index}]`);
    return { id: string(value.id, `$.candidates[${index}].id`), sourceFileSetSha256: string(value.sourceFileSetSha256, `$.candidates[${index}].sourceFileSetSha256`) };
  });
  const scenarios = array(input.scenarios, '$.scenarios').map((scenario, scenarioIndex) => {
    const value = closed(scenario, ['id', 'parameters'], `$.scenarios[${scenarioIndex}]`);
    const parameters = array(value.parameters, `$.scenarios[${scenarioIndex}].parameters`).map((parameter, parameterIndex) => {
      const entry = closed(parameter, ['key', 'value'], `$.scenarios[${scenarioIndex}].parameters[${parameterIndex}]`);
      if (!['string', 'number', 'boolean'].includes(typeof entry.value)) throw new TypeError('Scenario parameter values must be JSON primitives.');
      return { key: string(entry.key, 'Scenario parameter key'), value: entry.value } as BenchmarkScenarioParameterV1;
    });
    return { id: string(value.id, `$.scenarios[${scenarioIndex}].id`), parameters };
  });
  const phases = closed(input.phases, ['cold', 'warmMeasurement', 'stress', 'trace', 'leak'], '$.phases');
  const warm = closed(phases.warmMeasurement, ['enabled', 'minimumProcessesPerCandidate', 'measurementIterationsPerProcess'], '$.phases.warmMeasurement');
  if (input.retryPolicy !== 'none') throw new TypeError('retryPolicy must be none.');
  return {
    expectedSourceCommitSha: string(input.expectedSourceCommitSha, '$.expectedSourceCommitSha') as RunPlanInputV1['expectedSourceCommitSha'],
    expectedBuildSha256: string(input.expectedBuildSha256, '$.expectedBuildSha256') as RunPlanInputV1['expectedBuildSha256'],
    fixtureContractId: string(input.fixtureContractId, '$.fixtureContractId') as RunPlanInputV1['fixtureContractId'],
    fixtureSemanticSha256: string(input.fixtureSemanticSha256, '$.fixtureSemanticSha256') as RunPlanInputV1['fixtureSemanticSha256'],
    hardwareProfileId: string(input.hardwareProfileId, '$.hardwareProfileId') as RunPlanInputV1['hardwareProfileId'],
    hardwareBindingSha256: string(input.hardwareBindingSha256, '$.hardwareBindingSha256') as RunPlanInputV1['hardwareBindingSha256'],
    syntheticHardwareProfile: boolean(input.syntheticHardwareProfile, '$.syntheticHardwareProfile'),
    browser: {
      requestedChannel: string(browser.requestedChannel, '$.browser.requestedChannel'),
      headless: boolean(browser.headless, '$.browser.headless'),
      requestedArgs: array(browser.requestedArgs, '$.browser.requestedArgs').map((argument, index) => string(argument, `$.browser.requestedArgs[${index}]`)),
    },
    orderSeed: finiteNumber(input.orderSeed, '$.orderSeed'),
    comparisonMode: string(input.comparisonMode, '$.comparisonMode') as RunPlanInputV1['comparisonMode'],
    referenceCandidateId: input.referenceCandidateId === null
      ? null
      : string(input.referenceCandidateId, '$.referenceCandidateId') as RunPlanInputV1['referenceCandidateId'],
    candidates: candidates as unknown as RunPlanInputV1['candidates'],
    scenarios: scenarios as unknown as RunPlanInputV1['scenarios'],
    phases: {
      cold: processRequirement(phases.cold, '$.phases.cold'),
      warmMeasurement: {
        enabled: boolean(warm.enabled, '$.phases.warmMeasurement.enabled'),
        minimumProcessesPerCandidate: finiteNumber(warm.minimumProcessesPerCandidate, '$.phases.warmMeasurement.minimumProcessesPerCandidate'),
        measurementIterationsPerProcess: finiteNumber(warm.measurementIterationsPerProcess, '$.phases.warmMeasurement.measurementIterationsPerProcess'),
      },
      stress: processRequirement(phases.stress, '$.phases.stress'),
      trace: processRequirement(phases.trace, '$.phases.trace'),
      leak: processRequirement(phases.leak, '$.phases.leak'),
    },
    retryPolicy: 'none',
  };
}

export function encodeBuiltRunPlanV1(plan: BuiltRunPlanV1): Uint8Array {
  return canonicalizeJsonV1({
    schemaVersion: 'br03-built-run-plan-v1',
    runPlanId: plan.runPlanId,
    runPlanSha256: plan.runPlanSha256,
    core: plan.core,
  });
}

export function parseBuiltRunPlanV1(bytes: Uint8Array): BuiltRunPlanV1 {
  const file = closed(parseCanonicalJsonV1(bytes), ['schemaVersion', 'runPlanId', 'runPlanSha256', 'core'], '$');
  if (file.schemaVersion !== 'br03-built-run-plan-v1') throw new TypeError('Wrong built run-plan schema version.');
  const coreObject = closed(file.core, [
    'schemaVersion', 'expectedSourceCommitSha', 'expectedBuildSha256', 'fixtureContractId',
    'fixtureSemanticSha256', 'hardwareProfileId', 'hardwareBindingSha256', 'syntheticHardwareProfile',
    'browser', 'orderSeed', 'comparisonMode', 'referenceCandidateId', 'candidates', 'scenarios', 'phases', 'balanceBlocks', 'processUnits', 'retryPolicy',
  ], '$.core');
  if (coreObject.schemaVersion !== 'br03-run-plan-core-v1') throw new TypeError('Wrong run-plan core schema version.');
  parseRunPlanInputJsonV1(canonicalizeJsonV1({
    expectedSourceCommitSha: coreObject.expectedSourceCommitSha,
    expectedBuildSha256: coreObject.expectedBuildSha256,
    fixtureContractId: coreObject.fixtureContractId,
    fixtureSemanticSha256: coreObject.fixtureSemanticSha256,
    hardwareProfileId: coreObject.hardwareProfileId,
    hardwareBindingSha256: coreObject.hardwareBindingSha256,
    syntheticHardwareProfile: coreObject.syntheticHardwareProfile,
    browser: coreObject.browser,
    orderSeed: coreObject.orderSeed,
    comparisonMode: coreObject.comparisonMode,
    referenceCandidateId: coreObject.referenceCandidateId,
    candidates: coreObject.candidates,
    scenarios: coreObject.scenarios,
    phases: coreObject.phases,
    retryPolicy: coreObject.retryPolicy,
  }));
  const core = coreObject as unknown as RunPlanCoreV1;
  const plan: BuiltRunPlanV1 = {
    core,
    canonicalBytes: canonicalizeJsonV1(core),
    runPlanId: string(file.runPlanId, '$.runPlanId') as BuiltRunPlanV1['runPlanId'],
    runPlanSha256: string(file.runPlanSha256, '$.runPlanSha256') as BuiltRunPlanV1['runPlanSha256'],
  };
  const issues = verifyBuiltRunPlanV1(plan);
  if (issues.length > 0) throw new TypeError(`Built run plan failed verification: ${issues.join('; ')}`);
  return plan;
}

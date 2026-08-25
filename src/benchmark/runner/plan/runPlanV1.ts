import {
  BENCHMARK_POPULATION_FLOORS_V1,
  BENCHMARK_SCENARIO_REGISTRY_V1,
} from '../../contracts/scenarioRegistryV1';
import type {
  BenchmarkProcessContainerV1,
  BenchmarkScenarioParameterContractV1,
  BenchmarkScenarioParameterV1,
  Sha256DigestV1,
  UInt32V1,
} from '../../contracts/typesV1';
import { canonicalizeJsonV1, compareUtf16, sha256BytesV1 } from '../../provenance';
import type {
  BuiltRunPlanV1,
  PopulationClassificationV1,
  RunPlanBalanceBlockV1,
  RunPlanCoreV1,
  RunPlanInputV1,
  RunPlanProcessUnitV1,
  RunPlanScenarioV1,
} from '../contractsV1';
import {
  createOrchestrationIdsV1,
  hashCanonicalV1,
  idFromDigestV1,
  type HashCanonicalV1,
} from '../ids/orchestrationIdsV1';
import { buildCounterbalanceRowsV1 } from './counterbalanceV1';

const ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const GIT_SHA = /^[0-9a-f]{40}$/;
const CREDENTIAL_ARGUMENT = /^--[^=]*(?:password|passwd|token|secret|credential|api[-_]?key|access[-_]?key|auth(?:entication)?|username)(?:[-_](?:file|path))?(?==|$)/i;
const OWNERSHIP_ARGUMENT = /^--(?:user-data-dir|profile-directory|remote-debugging-(?:port|pipe|address|host)|remote-debugging|disk-cache-dir|data-path|crash-dumps-dir|log-file|load-extension|disable-extensions-except|renderer-cmd-prefix|utility-cmd-prefix|proxy-server)(?:=|$)/i;
const URL_USERINFO = /[a-z][a-z0-9+.-]*:\/\/[^\s/@]+(?::[^\s/@]*)?@/i;

export class RunPlanValidationErrorV1 extends TypeError {
  public constructor(public readonly issues: readonly string[]) {
    super(`BR03 run plan is invalid: ${issues.join('; ')}`);
    this.name = 'RunPlanValidationErrorV1';
  }
}

function parameterAllowed(contract: BenchmarkScenarioParameterContractV1, value: unknown): boolean {
  if (contract.domain.kind === 'uint32') {
    return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 0xffff_ffff && !Object.is(value, -0);
  }
  if (contract.domain.kind === 'safe-integer-range') {
    return Number.isSafeInteger(value) && Number(value) >= contract.domain.minimum && Number(value) <= contract.domain.maximum;
  }
  if (contract.domain.kind === 'sha256') return typeof value === 'string' && SHA256.test(value);
  return contract.domain.values.includes(value as never);
}

export function validateScenarioParametersV1(
  scenario: RunPlanScenarioV1,
): readonly BenchmarkScenarioParameterV1[] {
  const definition = BENCHMARK_SCENARIO_REGISTRY_V1[scenario.id]?.definition;
  if (definition === undefined) throw new RunPlanValidationErrorV1([`Unknown scenario ${scenario.id}.`]);
  const values = new Map<string, BenchmarkScenarioParameterV1>();
  for (const parameter of scenario.parameters) {
    if (values.has(parameter.key)) throw new RunPlanValidationErrorV1([`Duplicate parameter ${parameter.key}.`]);
    values.set(parameter.key, parameter);
  }
  const expected = new Set(definition.parameterContracts.map(({ key }) => key));
  const issues: string[] = [];
  for (const contract of definition.parameterContracts) {
    const parameter = values.get(contract.key);
    if (parameter === undefined) issues.push(`Missing parameter ${contract.key}.`);
    else if (!parameterAllowed(contract, parameter.value)) issues.push(`Parameter ${contract.key} is outside its BR01 domain.`);
  }
  for (const key of values.keys()) if (!expected.has(key as never)) issues.push(`Unknown parameter ${key}.`);
  if (issues.length > 0) throw new RunPlanValidationErrorV1(issues);
  return [...values.values()].sort((left, right) => compareUtf16(left.key, right.key));
}

export function classifyPopulationV1(
  independentBrowserProcesses: number,
  measurementIterations: number,
): PopulationClassificationV1 {
  if (![independentBrowserProcesses, measurementIterations].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new RangeError('Population counts must be non-negative safe integers.');
  }
  return {
    technicallyAggregable: independentBrowserProcesses >= BENCHMARK_POPULATION_FLOORS_V1.technicalBootstrapBrowserProcesses,
    standardProcessFloor: independentBrowserProcesses >= BENCHMARK_POPULATION_FLOORS_V1.standardPerformanceCellBrowserProcesses,
    standardMeasurementCell:
      independentBrowserProcesses >= BENCHMARK_POPULATION_FLOORS_V1.standardPerformanceCellBrowserProcesses
      && measurementIterations >= BENCHMARK_POPULATION_FLOORS_V1.warmMeasurementIterations,
  };
}

function canonicalScenarios(input: readonly RunPlanScenarioV1[]): readonly RunPlanScenarioV1[] {
  const seen = new Set<string>();
  const scenarios = input.map((scenario) => {
    if (seen.has(scenario.id)) throw new RunPlanValidationErrorV1([`Duplicate scenario ${scenario.id}.`]);
    seen.add(scenario.id);
    return { id: scenario.id, parameters: validateScenarioParametersV1(scenario) };
  });
  if (scenarios.length === 0) throw new RunPlanValidationErrorV1(['At least one scenario is required.']);
  return scenarios.sort((left, right) => compareUtf16(left.id, right.id));
}

interface EnabledContainerV1 {
  readonly container: BenchmarkProcessContainerV1;
  readonly targetPerCandidate: number;
  readonly measurementIterations: number;
  readonly requiredPhases: readonly ('cold' | 'warmup' | 'measurement' | 'stress' | 'trace' | 'leak')[];
}

function enabledContainers(input: RunPlanInputV1): readonly EnabledContainerV1[] {
  const result: EnabledContainerV1[] = [];
  const requirements = [
    ['cold', input.phases.cold.minimumProcessesPerCandidate],
    ['warm-measurement', input.phases.warmMeasurement.minimumProcessesPerCandidate],
    ['stress', input.phases.stress.minimumProcessesPerCandidate],
    ['trace', input.phases.trace.minimumProcessesPerCandidate],
    ['leak', input.phases.leak.minimumProcessesPerCandidate],
  ] as const;
  for (const [container, count] of requirements) {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RunPlanValidationErrorV1([`${container} process minimum is invalid.`]);
    }
  }
  if (!Number.isSafeInteger(input.phases.warmMeasurement.measurementIterationsPerProcess)
    || input.phases.warmMeasurement.measurementIterationsPerProcess < 0) {
    throw new RunPlanValidationErrorV1(['Measurement iterations per process are invalid.']);
  }
  const add = (
    container: BenchmarkProcessContainerV1,
    enabled: boolean,
    targetPerCandidate: number,
    measurementIterations: number,
    requiredPhases: EnabledContainerV1['requiredPhases'],
  ) => {
    if (!enabled) return;
    if (!Number.isSafeInteger(targetPerCandidate) || targetPerCandidate < 1) {
      throw new RunPlanValidationErrorV1([`${container} process minimum is invalid.`]);
    }
    result.push({ container, targetPerCandidate, measurementIterations, requiredPhases });
  };

  if (input.phases.cold.enabled
    && input.phases.cold.minimumProcessesPerCandidate < BENCHMARK_POPULATION_FLOORS_V1.coldBrowserProcesses) {
    throw new RunPlanValidationErrorV1(['Cold requires at least 10 fresh processes per candidate.']);
  }
  const warm = input.phases.warmMeasurement;
  if (warm.enabled) {
    if (!Number.isSafeInteger(warm.measurementIterationsPerProcess) || warm.measurementIterationsPerProcess < 1) {
      throw new RunPlanValidationErrorV1(['Measurement iterations per process must be positive.']);
    }
    const requiredProcesses = Math.max(
      BENCHMARK_POPULATION_FLOORS_V1.standardPerformanceCellBrowserProcesses,
      Math.ceil(BENCHMARK_POPULATION_FLOORS_V1.warmMeasurementIterations / warm.measurementIterationsPerProcess),
    );
    if (warm.minimumProcessesPerCandidate < requiredProcesses) {
      throw new RunPlanValidationErrorV1([`Warm measurement requires at least ${requiredProcesses} processes per candidate.`]);
    }
  }
  add('cold', input.phases.cold.enabled, input.phases.cold.minimumProcessesPerCandidate, 1, ['cold']);
  add('warm-measurement', warm.enabled, warm.minimumProcessesPerCandidate, warm.measurementIterationsPerProcess, ['warmup', 'measurement']);
  add('stress', input.phases.stress.enabled, input.phases.stress.minimumProcessesPerCandidate, 1, ['stress']);
  add('trace', input.phases.trace.enabled, input.phases.trace.minimumProcessesPerCandidate, 1, ['trace']);
  add('leak', input.phases.leak.enabled, input.phases.leak.minimumProcessesPerCandidate, 1, ['leak']);
  if (result.length === 0) throw new RunPlanValidationErrorV1(['At least one process container must be enabled.']);
  return result;
}

function assertCanonicalId(value: string, label: string): void {
  if (!ID.test(value)) throw new RunPlanValidationErrorV1([`${label} is not a canonical ID.`]);
}

function assertDigest(value: string, label: string): void {
  if (!SHA256.test(value)) throw new RunPlanValidationErrorV1([`${label} is not a full SHA-256 digest.`]);
}

function forbiddenPlanKeyIssues(value: unknown, path = '$'): string[] {
  if (value === null || typeof value !== 'object') return [];
  const issues: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (['createdUtc', 'invocationId', 'outputRoot', 'pid', 'port', 'runId', 'tempPath'].includes(key)) {
      issues.push(`${path}.${key} is runtime-only.`);
    }
    issues.push(...forbiddenPlanKeyIssues(child, `${path}.${key}`));
  }
  return issues;
}

export function validateRunPlanCoreV1(plan: RunPlanCoreV1): readonly string[] {
  const issues = forbiddenPlanKeyIssues(plan);
  if (plan.retryPolicy !== 'none') issues.push('retryPolicy must be none.');
  if (new Set(plan.processUnits.map(({ ids }) => ids.slotId)).size !== plan.processUnits.length) issues.push('slotId collision.');
  if (new Set(plan.processUnits.map(({ ids }) => ids.browserProcessId)).size !== plan.processUnits.length) issues.push('browserProcessId collision.');
  if (new Set(plan.processUnits.map(({ ids }) => ids.bootstrapClusterId)).size !== plan.processUnits.length) issues.push('bootstrapClusterId collision.');
  if (plan.processUnits.some(({ ids }) => ids.pairOrdinal < 1
    || Object.values(ids.ownership).some((owner) => owner !== 'BR03'))) {
    issues.push('Invalid orchestration ID ownership or pair ordinal.');
  }
  if (plan.balanceBlocks.some(({ blockId, balanceBlockId }) => blockId !== balanceBlockId)
    || new Set(plan.balanceBlocks.map(({ balanceBlockId }) => balanceBlockId)).size !== plan.balanceBlocks.length) {
    issues.push('Balance-block identity is inconsistent.');
  }
  const blockIds = new Set(plan.balanceBlocks.map(({ balanceBlockId }) => balanceBlockId));
  if (plan.processUnits.some(({ balanceBlockId }) => !blockIds.has(balanceBlockId))) issues.push('Process unit references an unknown balance block.');
  const pairCells = new Map<string, RunPlanProcessUnitV1[]>();
  for (const unit of plan.processUnits) {
    const cells = pairCells.get(unit.ids.pairCellId) ?? [];
    cells.push(unit);
    pairCells.set(unit.ids.pairCellId, cells);
  }
  for (const units of pairCells.values()) {
    if (new Set(units.map(({ ids }) => ids.pairOrdinal)).size !== 1) issues.push('Pair-cell ordinal is inconsistent.');
    if (plan.comparisonMode === 'reference-paired') {
      const reference = units.filter(({ comparisonArm }) => comparisonArm === 'reference');
      const comparisons = units.filter(({ comparisonArm }) => comparisonArm === 'comparison');
      if (units.length !== 2 || new Set(units.map(({ candidateId }) => candidateId)).size !== 2
        || reference.length !== 1 || comparisons.length !== 1
        || reference[0]?.candidateId !== plan.referenceCandidateId) {
        issues.push('Reference-paired cells require exactly one reference and one distinct comparison arm.');
      }
    } else if (units.length !== 1 || units[0]?.comparisonArm !== 'unpaired') {
      issues.push('Unpaired-only cells must contain exactly one unpaired arm.');
    }
  }
  return issues;
}

export function buildRunPlanV1(
  input: RunPlanInputV1,
  hash: HashCanonicalV1 = hashCanonicalV1,
): BuiltRunPlanV1 {
  if (!Number.isInteger(input.orderSeed) || input.orderSeed < 0
    || input.orderSeed > 0xffff_ffff || Object.is(input.orderSeed, -0)) {
    throw new RunPlanValidationErrorV1(['orderSeed must be uint32.']);
  }
  if (!GIT_SHA.test(input.expectedSourceCommitSha)) throw new RunPlanValidationErrorV1(['expectedSourceCommitSha is not a canonical Git SHA.']);
  if (input.browser.requestedChannel.length === 0
    || input.browser.requestedArgs.some((argument) => argument.length === 0 || argument.includes('\0')
      || CREDENTIAL_ARGUMENT.test(argument) || OWNERSHIP_ARGUMENT.test(argument) || URL_USERINFO.test(argument))
    || new Set(input.browser.requestedArgs).size !== input.browser.requestedArgs.length) {
    throw new RunPlanValidationErrorV1(['Browser channel and requested arguments must be non-empty and unique.']);
  }
  assertCanonicalId(input.fixtureContractId, 'fixtureContractId');
  assertCanonicalId(input.hardwareProfileId, 'hardwareProfileId');
  assertDigest(input.expectedBuildSha256, 'expectedBuildSha256');
  assertDigest(input.fixtureSemanticSha256, 'fixtureSemanticSha256');
  assertDigest(input.hardwareBindingSha256, 'hardwareBindingSha256');

  const candidateIds = input.candidates.map(({ id }) => id).sort(compareUtf16);
  if (candidateIds.length < 2 || new Set(candidateIds).size !== candidateIds.length) {
    throw new RunPlanValidationErrorV1(['At least two unique candidates are required.']);
  }
  input.candidates.forEach((candidate) => {
    assertCanonicalId(candidate.id, 'candidate.id');
    assertDigest(candidate.sourceFileSetSha256, 'candidate.sourceFileSetSha256');
  });
  const candidateById = new Map(input.candidates.map((candidate) => [candidate.id, candidate]));
  const candidates = candidateIds.map((candidateId) => candidateById.get(candidateId)!);
  if (input.comparisonMode === 'reference-paired') {
    if (input.referenceCandidateId === null || !candidateById.has(input.referenceCandidateId)) {
      throw new RunPlanValidationErrorV1(['referenceCandidateId must identify a selected candidate.']);
    }
  } else if (input.comparisonMode === 'unpaired-only') {
    if (input.referenceCandidateId !== null) throw new RunPlanValidationErrorV1(['unpaired-only plans cannot declare a referenceCandidateId.']);
    if (candidateIds.length === 2) throw new RunPlanValidationErrorV1(['Two-candidate plans require an explicit referenceCandidateId.']);
  } else {
    throw new RunPlanValidationErrorV1(['comparisonMode is invalid.']);
  }
  const scenarios = canonicalScenarios(input.scenarios);
  const fixtureMismatches = scenarios
    .filter(({ id }) => BENCHMARK_SCENARIO_REGISTRY_V1[id].definition.fixtureContractId !== input.fixtureContractId)
    .map(({ id }) => `${id} requires fixture ${BENCHMARK_SCENARIO_REGISTRY_V1[id].definition.fixtureContractId}.`);
  if (fixtureMismatches.length > 0) throw new RunPlanValidationErrorV1(fixtureMismatches);
  const containers = enabledContainers(input);
  const orderSeed = input.orderSeed as UInt32V1;
  const balanceBlocks: RunPlanBalanceBlockV1[] = [];
  const processUnits: RunPlanProcessUnitV1[] = [];
  const processOrdinals = new Map<string, number>();
  const pairCells = new Set<string>();
  let pairOrdinal = 1;

  for (const container of containers) {
    for (const scenario of scenarios) {
      const scenarioSeedValue = scenario.parameters.find(({ key }) => key === 'seed')?.value ?? null;
      const scenarioSeedDigest = hash('br03/order/scenarios/v1', { orderSeed, scenarioId: scenario.id, scenarioSeed: scenarioSeedValue });
      const effectiveScenarioSeed = Number.parseInt(scenarioSeedDigest.slice('sha256:'.length, 'sha256:'.length + 8), 16) as UInt32V1;
      const rows = buildCounterbalanceRowsV1(candidateIds, effectiveScenarioSeed, hash);
      const occurrencesPerCandidate = rows
        .flatMap(({ candidateIds: rowCandidates }) => rowCandidates)
        .filter((candidateId) => candidateId === candidateIds[0]).length;
      const allowedPhases = BENCHMARK_SCENARIO_REGISTRY_V1[scenario.id].definition.allowedPhases;
      const missingPhase = container.requiredPhases.find((phase) => !allowedPhases.includes(phase));
      if (missingPhase !== undefined) {
        throw new RunPlanValidationErrorV1([`${scenario.id} does not allow ${missingPhase}.`]);
      }
      const repetitions = Math.ceil(container.targetPerCandidate / occurrencesPerCandidate);
      for (let repetitionOrdinal = 0; repetitionOrdinal < repetitions; repetitionOrdinal += 1) {
        const blockIdentity = {
          container: container.container,
          orderSeed,
          repetitionOrdinal,
          scenarioId: scenario.id,
          scenarioSeed: scenarioSeedValue,
        };
        const blockId = idFromDigestV1('br03-block-', hash('br03/balance-block/v1', blockIdentity));
        if (balanceBlocks.some((block) => block.blockId === blockId)) {
          throw new Error('Digest collision in balance-block IDs.');
        }
        balanceBlocks.push({
          blockId,
          balanceBlockId: blockId,
          processContainer: container.container,
          scenarioId: scenario.id,
          repetitionOrdinal,
          rows,
        });
        for (const row of rows) {
          const groups: readonly { readonly candidateIds: readonly typeof candidateIds[number][]; readonly arms: readonly RunPlanProcessUnitV1['comparisonArm'][] }[] = candidateIds.length === 2
            ? Array.from({ length: row.candidateIds.length / 2 }, (_, index) => {
              const pair = row.candidateIds.slice(index * 2, index * 2 + 2);
              return {
                candidateIds: pair,
                arms: pair.map((candidateId) => candidateId === input.referenceCandidateId ? 'reference' as const : 'comparison' as const),
              };
            })
            : input.comparisonMode === 'reference-paired'
              ? row.candidateIds.filter((candidateId) => candidateId !== input.referenceCandidateId).map((candidateId) => {
                const referenceFirst = row.candidateIds.indexOf(input.referenceCandidateId!) < row.candidateIds.indexOf(candidateId);
                return {
                  candidateIds: referenceFirst ? [input.referenceCandidateId!, candidateId] : [candidateId, input.referenceCandidateId!],
                  arms: referenceFirst ? ['reference', 'comparison'] : ['comparison', 'reference'],
                };
              })
              : row.candidateIds.map((candidateId) => ({ candidateIds: [candidateId], arms: ['unpaired'] }));
          let rowPosition = 0;
          for (let groupOrdinal = 0; groupOrdinal < groups.length; groupOrdinal += 1) {
            const group = groups[groupOrdinal]!;
            const pairIdentity = {
              ...blockIdentity,
              balanceBlockId: blockId,
              comparisonMode: input.comparisonMode,
              groupOrdinal,
              pairCandidateIds: group.candidateIds,
              referenceCandidateId: input.referenceCandidateId,
              rowOrdinal: row.rowOrdinal,
            };
            const pairCellId = idFromDigestV1('br03-pair-', hash('br03/pair-cell/v1', pairIdentity));
            if (pairCells.has(pairCellId)) throw new Error('Digest collision in pair-cell IDs.');
            pairCells.add(pairCellId);
            const currentPairOrdinal = pairOrdinal;
            pairOrdinal += 1;
            for (let armOrdinal = 0; armOrdinal < group.candidateIds.length; armOrdinal += 1) {
              const candidateId = group.candidateIds[armOrdinal]!;
              const processCell = `${scenario.id}:${candidateId}`;
              const processOrdinal = processOrdinals.get(processCell) ?? 0;
              processOrdinals.set(processCell, processOrdinal + 1);
              const slotIdentity = {
                ...pairIdentity,
                candidateId,
                processOrdinal,
                sequencePosition: rowPosition,
              };
              const ids = createOrchestrationIdsV1({
                slot: slotIdentity,
                browserProcess: slotIdentity,
                bootstrapCluster: slotIdentity,
                pairCell: pairIdentity,
                pairOrdinal: currentPairOrdinal,
              }, hash);
              if (ids.pairCellId !== pairCellId) throw new Error('Pair-cell derivation mismatch.');
              processUnits.push({
                processOrdinal,
                processContainer: container.container,
                scenarioId: scenario.id,
                scenarioParameters: scenario.parameters,
                candidateId,
                comparisonArm: group.arms[armOrdinal]!,
                balanceBlockId: blockId,
                rowOrdinal: row.rowOrdinal,
                sequencePosition: rowPosition,
                measurementIterations: container.measurementIterations,
                measurementEligible: false,
                freshBrowserProcess: true,
                freshProfile: true,
                ids,
              });
              rowPosition += 1;
            }
          }
        }
      }
    }
  }

  const core: RunPlanCoreV1 = {
    schemaVersion: 'br03-run-plan-core-v1',
    expectedSourceCommitSha: input.expectedSourceCommitSha,
    expectedBuildSha256: input.expectedBuildSha256,
    fixtureContractId: input.fixtureContractId,
    fixtureSemanticSha256: input.fixtureSemanticSha256,
    hardwareProfileId: input.hardwareProfileId,
    hardwareBindingSha256: input.hardwareBindingSha256,
    syntheticHardwareProfile: input.syntheticHardwareProfile,
    browser: { ...input.browser, requestedArgs: [...input.browser.requestedArgs] },
    orderSeed,
    comparisonMode: input.comparisonMode,
    referenceCandidateId: input.referenceCandidateId,
    candidates,
    scenarios,
    phases: input.phases,
    balanceBlocks,
    processUnits,
    retryPolicy: 'none',
  };
  const issues = validateRunPlanCoreV1(core);
  if (issues.length > 0) throw new RunPlanValidationErrorV1(issues);
  const canonicalBytes = canonicalizeJsonV1(core);
  const runPlanSha256 = sha256BytesV1(canonicalBytes);
  const runPlanId = idFromDigestV1('br03-plan-', runPlanSha256);
  return { core, canonicalBytes, runPlanSha256, runPlanId };
}

export function verifyBuiltRunPlanV1(plan: BuiltRunPlanV1): readonly string[] {
  try {
    const core = plan.core;
    const rebuilt = buildRunPlanV1({
      expectedSourceCommitSha: core.expectedSourceCommitSha,
      expectedBuildSha256: core.expectedBuildSha256,
      fixtureContractId: core.fixtureContractId,
      fixtureSemanticSha256: core.fixtureSemanticSha256,
      hardwareProfileId: core.hardwareProfileId,
      hardwareBindingSha256: core.hardwareBindingSha256,
      syntheticHardwareProfile: core.syntheticHardwareProfile,
      browser: core.browser,
      orderSeed: core.orderSeed,
      comparisonMode: core.comparisonMode,
      referenceCandidateId: core.referenceCandidateId,
      candidates: core.candidates,
      scenarios: core.scenarios,
      phases: core.phases,
      retryPolicy: core.retryPolicy,
    });
    const issues: string[] = [];
    const coreBytes = canonicalizeJsonV1(core);
    if (coreBytes.byteLength !== rebuilt.canonicalBytes.byteLength || coreBytes.some((byte, index) => byte !== rebuilt.canonicalBytes[index])) issues.push('Run plan core is not the deterministic plan derived from its inputs.');
    if (plan.runPlanSha256 !== rebuilt.runPlanSha256) issues.push('runPlanSha256 mismatch.');
    if (plan.runPlanId !== rebuilt.runPlanId) issues.push('runPlanId mismatch.');
    if (plan.canonicalBytes.byteLength !== rebuilt.canonicalBytes.byteLength || plan.canonicalBytes.some((byte, index) => byte !== rebuilt.canonicalBytes[index])) issues.push('Canonical plan bytes mismatch.');
    return issues;
  } catch (error) {
    return [error instanceof Error ? error.message : 'Run plan reconstruction failed.'];
  }
}

export const asFullDigestV1 = (value: string): Sha256DigestV1 => value as Sha256DigestV1;

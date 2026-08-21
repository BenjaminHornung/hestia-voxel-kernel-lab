import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  BENCHMARK_METRIC_REGISTRY_V1,
  BENCHMARK_REPOSITORY_URL,
  BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1,
  BENCHMARK_SCENARIO_REGISTRY_V1,
  BENCHMARK_SCHEMA_SET_SHA256_V1,
  BENCHMARK_STATUS_COMMAND,
  EMPTY_STATUS_SHA256,
  type AvailabilityDeclaredStabilityV1,
   type AvailabilityV1,
  type BenchmarkEnvironmentManifestV1,
  type BenchmarkSourceProvenanceV1,
  type BenchmarkValidationContextV1,
  type CanonicalIdV1,
  type NonEmptyReadonlyArray,
  type NonEmptyString,
  type RepositoryRelativePathV1,
  type SafePositiveIntegerV1,
} from '../../contracts';
import { compareUtf16, readFileBytesV1, repositoryRelativePathV1 } from '../../provenance';
import { createTelemetryBufferV1 } from '../../../diagnostics/telemetry/bufferV1';
import {
  BR02_BROWSER_HANDOFF_CONTRACT_ID,
  BR02_BROWSER_HANDOFF_SCHEMA_VERSION,
  BR02_BROWSER_RUNTIME_ACTIVATION,
  type BrowserTelemetryHandoffEnvelopeV1,
} from '../../../diagnostics/telemetry/browserHandoffV1';
import {
  deriveTelemetryCapabilityIdsV1,
  serializeSealedTelemetryExportV1,
} from '../../../diagnostics/telemetry/contractV1';
import { assembleHardwareCellV1, assembleRunV1, createSinglePassTelemetryAdapterV1 } from '../assembly/runAssemblerV1';
import { mintReceiptV1 } from '../assembly/receiptMinterV1';
import {
  ArtifactCleanupErrorV1,
  buildBenchmarkBundleV1,
  createInvocationArtifactRootV1,
  deriveBundleIdV1,
  verifyWrittenBundleV1,
  writeBundleClosureExclusiveV1,
  writeProcessUnitResultsV1,
} from '../artifacts/artifactStoreV1';
import { validateDownloadedTelemetryV1 } from '../browser/br02HandoffDriverV1';
import { RunnerFailureErrorV1, type BuiltRunPlanV1, type ProcessUnitResultV1 } from '../contractsV1';
import { deriveHardwareCellIdV1 } from '../ids/orchestrationIdsV1';
import { createRunInvocationV1 } from '../invocation/runInvocationV1';
import { resolveRunnerBuildSourceCommitShaV1, resolveRunnerSourceShaV1 } from '../runnerSourceV1';
import { ProcessUnitResultLedgerV1 } from '../results/processUnitResultLedgerV1';

const sourceRef = 'br03-synthetic-contract-v1' as CanonicalIdV1;
const SYNTHETIC_VALIDATOR_SOURCE_PATHS = [
  'src/benchmark/adapters/telemetryExportV1ToBenchmarkRawSampleV1.ts',
  'src/benchmark/contracts/scenarioRegistryV1.ts',
  'src/benchmark/contracts/schemaSetV1.ts',
  'src/benchmark/contracts/validateV1.ts',
  'src/diagnostics/telemetry/contractV1.ts',
] as const;
const MAX_VALIDATOR_SOURCE_BYTES = BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.commandOutputMaxBytes;

function boundedGitOutputV1(result: ReturnType<typeof spawnSync>, label: string): { readonly stdout: Uint8Array; readonly stderr: Uint8Array } {
  const stdout = result.stdout instanceof Uint8Array ? new Uint8Array(result.stdout) : new Uint8Array();
  const stderr = result.stderr instanceof Uint8Array ? new Uint8Array(result.stderr) : new Uint8Array();
  if (stdout.byteLength > BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.commandOutputMaxBytes
    || stderr.byteLength > BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.commandOutputMaxBytes
    || stdout.byteLength + stderr.byteLength > BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.commandOutputMaxBytes) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', `Git ${label} output exceeded the v1 command bound.`);
  }
  return { stdout, stderr };
}

async function readSyntheticValidatorSourceBindingV1(projectRoot: string, expectedSourceCommitSha: string): Promise<readonly { readonly path: string; readonly absolutePath: string; readonly bytes: Uint8Array }[]> {
  const builtSourceCommitSha = resolveRunnerBuildSourceCommitShaV1();
  if (builtSourceCommitSha !== null && builtSourceCommitSha !== expectedSourceCommitSha) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', 'The built runner was not built from the expected source commit.');
  }
  const commit = spawnSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], {
    cwd: projectRoot,
    encoding: 'buffer',
    shell: false,
    windowsHide: true,
    timeout: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.gitCommandTimeoutMs,
    maxBuffer: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.commandOutputMaxBytes,
  });
  const commitOutput = boundedGitOutputV1(commit, 'source commit lookup');
  const actualCommit = commit.status === 0 && commitOutput.stderr.byteLength === 0 ? new TextDecoder().decode(commitOutput.stdout).trim() : '';
  if (actualCommit !== expectedSourceCommitSha) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', 'Synthetic receipt validator sources require the expected current source commit.', { cause: commit.error });
  }
  const status = spawnSync('git', ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=none'], {
    cwd: projectRoot,
    encoding: 'buffer',
    shell: false,
    windowsHide: true,
    timeout: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.gitCommandTimeoutMs,
    maxBuffer: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.commandOutputMaxBytes,
  });
  const statusOutput = boundedGitOutputV1(status, 'source status lookup');
  if (status.status !== 0 || statusOutput.stderr.byteLength !== 0 || statusOutput.stdout.byteLength !== 0) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', 'Synthetic receipts require a clean source worktree.', { cause: status.error });
  }
  const files = [] as { readonly path: string; readonly absolutePath: string; readonly bytes: Uint8Array }[];
  for (const path of SYNTHETIC_VALIDATOR_SOURCE_PATHS) {
    const absolutePath = resolve(projectRoot, path);
    let currentBytes: Uint8Array;
    try {
      currentBytes = readFileBytesV1(absolutePath, {
        maxFileBytes: MAX_VALIDATOR_SOURCE_BYTES,
        maxAggregateBytes: MAX_VALIDATOR_SOURCE_BYTES,
      });
    } catch (error) {
      throw new RunnerFailureErrorV1('source-preflight-rejected', `Synthetic receipt validator source could not be read: ${path}.`, { cause: error });
    }
    const committed = spawnSync('git', ['--no-replace-objects', 'rev-parse', '--verify', `${expectedSourceCommitSha}:${path}`], {
      cwd: projectRoot,
      encoding: 'buffer',
      shell: false,
      windowsHide: true,
      timeout: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.gitCommandTimeoutMs,
      maxBuffer: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.commandOutputMaxBytes,
    });
    const committedOutput = boundedGitOutputV1(committed, `committed validator lookup for ${path}`);
    const committedBlobSha = committed.status === 0 && committedOutput.stderr.byteLength === 0 ? new TextDecoder().decode(committedOutput.stdout).trim() : '';
    const committedBytesResult = spawnSync('git', ['--no-replace-objects', 'cat-file', 'blob', `${expectedSourceCommitSha}:${path}`], {
      cwd: projectRoot,
      encoding: 'buffer',
      shell: false,
      windowsHide: true,
      timeout: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.gitCommandTimeoutMs,
      maxBuffer: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.commandOutputMaxBytes,
    });
    const committedBytesOutput = boundedGitOutputV1(committedBytesResult, `committed validator read for ${path}`);
    const committedBytes = committedBytesOutput.stdout;
    const current = spawnSync('git', ['--no-replace-objects', 'hash-object', `--path=${path}`, '--stdin'], {
      cwd: projectRoot,
      input: currentBytes,
      encoding: 'buffer',
      shell: false,
      windowsHide: true,
      timeout: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.gitCommandTimeoutMs,
      maxBuffer: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.commandOutputMaxBytes,
    });
    const currentOutput = boundedGitOutputV1(current, `working validator hash for ${path}`);
    const currentBlobSha = current.status === 0 && currentOutput.stderr.byteLength === 0 ? new TextDecoder().decode(currentOutput.stdout).trim() : '';
    if (committed.status !== 0 || committedOutput.stderr.byteLength !== 0 || committedBytesResult.status !== 0 || committedBytesOutput.stderr.byteLength !== 0
      || current.status !== 0 || currentOutput.stderr.byteLength !== 0 || committedBlobSha !== currentBlobSha) {
      throw new RunnerFailureErrorV1('source-preflight-rejected', `Synthetic receipt validator source is not bound to ${expectedSourceCommitSha}: ${path}.`, { cause: committed.error ?? committedBytesResult.error ?? current.error });
    }
    files.push({ path, absolutePath, bytes: committedBytes });
  }
  const afterCommitResult = spawnSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], {
    cwd: projectRoot,
    encoding: 'buffer',
    shell: false,
    windowsHide: true,
    timeout: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.gitCommandTimeoutMs,
    maxBuffer: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.commandOutputMaxBytes,
  });
  const afterCommitOutput = boundedGitOutputV1(afterCommitResult, 'post-read source commit lookup');
  const afterCommit = afterCommitResult.status === 0 && afterCommitOutput.stderr.byteLength === 0 ? new TextDecoder().decode(afterCommitOutput.stdout).trim() : '';
  if (afterCommit !== expectedSourceCommitSha) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', 'Synthetic receipt validator sources were read across a source commit change.', { cause: afterCommitResult.error });
  }
  const afterStatusResult = spawnSync('git', ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=none'], {
    cwd: projectRoot,
    encoding: 'buffer',
    shell: false,
    windowsHide: true,
    timeout: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.gitCommandTimeoutMs,
    maxBuffer: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.commandOutputMaxBytes,
  });
  const afterStatusOutput = boundedGitOutputV1(afterStatusResult, 'post-read source status lookup');
  if (afterStatusResult.status !== 0 || afterStatusOutput.stderr.byteLength !== 0 || afterStatusOutput.stdout.byteLength !== 0) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', 'Synthetic receipt sources were read across a worktree change.', { cause: afterStatusResult.error });
  }
  return files;
}

function declared<T>(value: T, stability: AvailabilityDeclaredStabilityV1 = 'run-config'): AvailabilityV1<T> {
  return { status: 'declared', value, sourceRef, stability };
}

function unknown<T>(reasonCode: string): AvailabilityV1<T> {
  return { status: 'unknown', value: null, sourceRef, reasonCode: reasonCode as CanonicalIdV1 };
}

function syntheticSource(plan: BuiltRunPlanV1, candidateIndex: number): BenchmarkSourceProvenanceV1 {
  const candidate = plan.core.candidates[candidateIndex];
  if (candidate === undefined) throw new RangeError('Synthetic candidate index is outside the plan.');
  const sourcePaths = [repositoryRelativePathV1('src/main.ts')] as NonEmptyReadonlyArray<RepositoryRelativePathV1>;
  return {
    schemaVersion: 'benchmark-source-provenance-v1',
    repositoryUrl: BENCHMARK_REPOSITORY_URL,
    commitSha: plan.core.expectedSourceCommitSha,
    commitTreeSha: plan.core.expectedSourceCommitSha,
    worktree: { state: 'clean', statusCommand: BENCHMARK_STATUS_COMMAND, statusOutputSha256: EMPTY_STATUS_SHA256, submodules: [] },
    build: {
      algorithmVersion: 'hestia-benchmark-build-sha256-v1',
      rootPath: 'dist',
      sha256: plan.core.expectedBuildSha256,
      fileCount: 1 as SafePositiveIntegerV1,
      totalBytes: 1 as SafePositiveIntegerV1,
    },
    fixture: {
      id: plan.core.fixtureContractId,
      version: 1 as SafePositiveIntegerV1,
       semanticSha256: declared(plan.core.fixtureSemanticSha256),
      sourceCommitSha: declared(plan.core.expectedSourceCommitSha),
      sourceFileSetSha256: unknown('owner-binding-unavailable'),
      sourcePaths: unknown('owner-binding-unavailable'),
    },
    candidate: {
      id: candidate.id,
      version: 1 as SafePositiveIntegerV1,
       sourceFileSetSha256: declared(candidate.sourceFileSetSha256),
      sourcePaths: declared(sourcePaths),
    },
  };
}

function syntheticEnvironment(plan: BuiltRunPlanV1, scenarioId: BuiltRunPlanV1['core']['scenarios'][number]['id']): BenchmarkEnvironmentManifestV1 {
  const text = (value: string) => value as NonEmptyString;
  const capabilityIds = new Set(BENCHMARK_SCENARIO_REGISTRY_V1[scenarioId].definition.capabilityContracts.map(({ id }) => id));
  capabilityIds.add('webgl2' as CanonicalIdV1);
  capabilityIds.add('webgpu' as CanonicalIdV1);
  return {
    schemaVersion: 'benchmark-environment-manifest-v1',
    hardwareProfileId: declared(plan.core.hardwareProfileId, 'owner-binding'),
    hardwareProfileTier: declared('H1', 'owner-binding'),
    gateRole: declared('correctness-only', 'owner-binding'),
    os: { name: declared(text('synthetic-os')), version: declared(text('1')), architecture: declared(text('x64')) },
    cpu: {
      vendor: declared(text('synthetic-vendor')), model: declared(text('synthetic-cpu')),
      physicalCores: declared(1 as SafePositiveIntegerV1), logicalCores: declared(1 as SafePositiveIntegerV1), ramBytes: declared(1 as SafePositiveIntegerV1),
    },
    gpu: {
      vendor: declared(text('synthetic-vendor')), device: declared(text('synthetic-gpu')),
      driver: declared(text('synthetic-driver')), graphicsBackend: declared(text('three-webgl2')),
    },
    browser: {
      product: declared(text('synthetic-browser')), version: declared(text('1')), channel: declared(text(plan.core.browser.requestedChannel)),
      userAgent: declared(text('br03-synthetic')), executableSha256: unknown('synthetic-executable-unavailable'),
      headless: declared(plan.core.browser.headless), flags: declared([...plan.core.browser.requestedArgs].sort(compareUtf16).map(text)),
    },
    display: {
      cssWidth: declared(1 as SafePositiveIntegerV1), cssHeight: declared(1 as SafePositiveIntegerV1),
      devicePixelRatio: declared(1), refreshHz: declared(60), vsync: declared('platform-default'),
    },
    power: {
      source: declared('ac'), profile: declared(text('synthetic')),
      battery: declared({ status: 'not-applicable' as const }),
    },
    runtimeState: {
      visibility: declared('visible'), focus: declared('focused'), backgroundTabs: declared(0),
      competingLoad: declared({ status: 'none' as const }), thermalState: declared('nominal'),
    },
    capabilities: [...capabilityIds].sort().map((id) => ({ id, value: declared(true as const) })),
  };
}

export interface SyntheticContractRunOptionsV1 {
  readonly plan: BuiltRunPlanV1;
  readonly slotIndex: number;
  readonly createdUtc: string;
  readonly outputRoot: string;
  readonly projectRoot: string;
}

export interface SyntheticContractRunResultV1 {
  readonly invocationId: CanonicalIdV1;
  readonly bundleId: CanonicalIdV1;
  readonly runId: CanonicalIdV1;
  readonly invocationRoot: string;
  readonly bundleRoot: string;
  readonly receiptId: string;
}

export async function runSyntheticContractV1(options: SyntheticContractRunOptionsV1): Promise<SyntheticContractRunResultV1> {
  const { plan } = options;
  if (!plan.core.syntheticHardwareProfile) throw new TypeError('Synthetic contract mode requires a synthetic hardware profile plan.');
  if (!Number.isSafeInteger(options.slotIndex) || options.slotIndex < 0) throw new RangeError('slotIndex must be a non-negative safe integer.');
  const unit = plan.core.processUnits[options.slotIndex];
  if (unit === undefined || unit.scenarioId !== 'backend-fixture-v1' || unit.processContainer !== 'cold' || unit.processOrdinal !== 0) {
    throw new TypeError('Synthetic contract mode requires the first cold backend-fixture process for one candidate cell.');
  }
  const candidateIndex = plan.core.candidates.findIndex(({ id }) => id === unit.candidateId);
  const source = syntheticSource(plan, candidateIndex);
  const environment = syntheticEnvironment(plan, unit.scenarioId);
  const invocation = createRunInvocationV1(plan, { createdUtc: options.createdUtc, outputRoot: options.outputRoot, selectedSlotIds: [unit.ids.slotId], runnerSourceSha: await resolveRunnerSourceShaV1() });
  const invocationUnit = invocation.processUnits.find(({ slotId }) => slotId === unit.ids.slotId)!;
  const plannedRun = invocationUnit.runs[0]!;
  const backend = unit.scenarioParameters.find(({ key }) => key === 'backend')?.value;
  if (backend !== 'three-webgl2') throw new TypeError('Synthetic contract mode supports only the three-webgl2 backend fixture.');
  const capabilities = deriveTelemetryCapabilityIdsV1({ scenarioId: unit.scenarioId as CanonicalIdV1, phase: plannedRun.phase, backend })
    .map((id) => ({ id, value: declared(true as const) }));
  const buffer = createTelemetryBufferV1({
    runId: plannedRun.runId,
    planId: plan.runPlanId,
    scenarioId: unit.scenarioId as CanonicalIdV1,
    phase: plannedRun.phase,
    backend,
    telemetryMode: 'telemetry-enabled-minimal',
    iterations: plannedRun.iterationIds.map((iterationId, iterationOrdinal) => ({ iterationId, iterationOrdinal })),
    realms: [{ realmId: 'synthetic-main' as CanonicalIdV1, realm: 'main', timeOriginEpochMs: 1 }],
    capabilities,
  });
  const append = buffer.append({
    realmId: 'synthetic-main' as CanonicalIdV1,
    startMs: 1,
    kind: 'sample',
    name: 'draw-submit.cpu',
    iterationId: plannedRun.iterationIds[0]!,
    fields: {
      sampleKind: 'duration', sourceUnit: 'ms', value: 1,
      operationId: 'synthetic-operation' as CanonicalIdV1, spanId: 'synthetic-span' as CanonicalIdV1,
    },
  });
  if (append.status !== 'accepted') throw new Error('Synthetic BR02 record was not accepted.');
  const telemetryExport = buffer.seal();
  const telemetryExportRawBytes = serializeSealedTelemetryExportV1(telemetryExport);
  const envelope: BrowserTelemetryHandoffEnvelopeV1 = {
    schemaVersion: BR02_BROWSER_HANDOFF_SCHEMA_VERSION,
    contractId: BR02_BROWSER_HANDOFF_CONTRACT_ID,
    runtimeActivation: BR02_BROWSER_RUNTIME_ACTIVATION,
    runId: plannedRun.runId,
    planId: plan.runPlanId,
    scenarioId: unit.scenarioId as CanonicalIdV1,
    phase: plannedRun.phase,
    backend,
    telemetryMode: 'telemetry-enabled-minimal',
    iterations: plannedRun.iterationIds.map((iterationId, iterationOrdinal) => ({ iterationId, iterationOrdinal })),
  };
  validateDownloadedTelemetryV1(telemetryExportRawBytes, envelope);
  const hardwareCellId = deriveHardwareCellIdV1({
    candidateId: unit.candidateId,
    hardwareProfileId: plan.core.hardwareProfileId,
    hardwareBindingSha256: plan.core.hardwareBindingSha256,
    fixtureContractId: plan.core.fixtureContractId,
    fixtureSemanticSha256: plan.core.fixtureSemanticSha256,
    expectedSourceCommitSha: plan.core.expectedSourceCommitSha,
    expectedBuildSha256: plan.core.expectedBuildSha256,
    scenarioId: unit.scenarioId as CanonicalIdV1,
  });
  const telemetryAdapter = createSinglePassTelemetryAdapterV1();
  const run = assembleRunV1({
    plan, unit, plannedRun, createdUtc: options.createdUtc, hardwareCellId, source, environment, telemetryExport,
    pageState: { visibility: 'visible', focus: 'focused', backgroundTabs: 0 },
    origin: { kind: 'planned' },
    measurementEligibilityReasons: [{ code: 'fixture-contract-mismatch', detail: 'synthetic contract fixture' as NonEmptyString, phase: 'cold' }],
    telemetryAdapter,
  });
  const validationContext: BenchmarkValidationContextV1 = {
    fixture: source.fixture,
    candidate: source.candidate,
    runPlan: { id: plan.runPlanId, sha256: plan.runPlanSha256 },
    schemaSetSha256: BENCHMARK_SCHEMA_SET_SHA256_V1,
    metricRegistrySha256: BENCHMARK_METRIC_REGISTRY_V1.metricRegistrySha256,
  };
  const document = assembleHardwareCellV1({
    hardwareCellId,
    hardwareProfileId: plan.core.hardwareProfileId,
    scenarioId: unit.scenarioId,
    candidateId: unit.candidateId,
    source,
    environment,
    processes: [{ unit, runs: [run] }],
    validationContext,
  });
  const validatorSourceFiles = await readSyntheticValidatorSourceBindingV1(options.projectRoot, plan.core.expectedSourceCommitSha);
  const minted = await mintReceiptV1({
    document,
    planId: plan.runPlanId,
    slotId: unit.ids.slotId,
    runId: plannedRun.runId,
    telemetryExportRawBytes,
    validatorSourceCommitSha: plan.core.expectedSourceCommitSha,
    validatorSourceFiles,
    validationContext,
    telemetryAdapter,
  });
  const ledger = new ProcessUnitResultLedgerV1(plan, invocation);
  for (const invocationUnit of invocation.processUnits) {
    const current = plan.core.processUnits.find(({ ids }) => ids.slotId === invocationUnit.slotId);
    if (current === undefined) throw new TypeError('Synthetic invocation unit is missing from the accepted plan.');
    const result: ProcessUnitResultV1 = {
      schemaVersion: 'br03-process-unit-result-v1',
      slotId: current.ids.slotId,
      browserProcessId: current.ids.browserProcessId,
      disposition: 'valid',
      failureClass: 'none',
      failureCode: 'none',
      runIds: [plannedRun.runId],
    };
    ledger.record(result);
  }
  const results = ledger.finalize();
  const invocationRoot = await createInvocationArtifactRootV1(options.outputRoot, options.projectRoot, plan, invocation);
  const failureResults = (failureCode: ProcessUnitResultV1['failureCode']): readonly ProcessUnitResultV1[] => {
    const failureLedger = new ProcessUnitResultLedgerV1(plan, invocation);
    for (const invocationUnit of invocation.processUnits) {
      failureLedger.record({
        schemaVersion: 'br03-process-unit-result-v1',
        slotId: invocationUnit.slotId,
        browserProcessId: invocationUnit.browserProcessId,
        disposition: 'failed',
        failureClass: failureCode === 'cleanup-failed' ? 'cleanup' : 'infrastructure',
        failureCode,
        runIds: [],
      });
    }
    return failureLedger.finalize();
  };
  try {
    const bundleId = deriveBundleIdV1(invocation.invocationId, hardwareCellId);
    const bundle = buildBenchmarkBundleV1({
      bundleId,
      createdUtc: options.createdUtc as BuildBundleOptionsCreatedUtc,
      claimClass: 'diagnostic',
      document,
      closures: [{ runId: plannedRun.runId, telemetryExportRawBytes, receipt: minted.receipt, receiptCanonicalBytes: minted.receiptCanonicalBytes }],
    });
    const bundleRoot = await writeBundleClosureExclusiveV1(invocationRoot, bundleId, validationContext, bundle.files);
    const bundleVerification = verifyWrittenBundleV1(bundleRoot, validationContext);
    if (!bundleVerification.valid) throw new Error('Synthetic artifact verification failed.');
    await writeProcessUnitResultsV1(invocationRoot, results);
    return {
      invocationId: invocation.invocationId,
      bundleId,
      runId: plannedRun.runId,
      invocationRoot,
      bundleRoot,
      receiptId: minted.receipt.receiptId,
    };
  } catch (error) {
    let terminalError = error;
    let failureCode = error instanceof ArtifactCleanupErrorV1 ? 'cleanup-failed' as const : 'artifact-write-failed' as const;
    try {
      await writeProcessUnitResultsV1(invocationRoot, failureResults(failureCode));
    } catch (resultError) {
      if (resultError instanceof ArtifactCleanupErrorV1) failureCode = 'cleanup-failed';
      terminalError = new AggregateError([error, resultError], 'Synthetic artifact failure and terminal-result publication failed.');
    }
    throw new RunnerFailureErrorV1(failureCode, 'Synthetic artifact publication failed.', { cause: terminalError });
  }
}

type BuildBundleOptionsCreatedUtc = Parameters<typeof buildBenchmarkBundleV1>[0]['createdUtc'];

import {
  BENCHMARK_METRIC_REGISTRY_V1,
  BENCHMARK_SCENARIO_REGISTRY_V1,
  BENCHMARK_SCHEMA_SET_SHA256_V1,
  BENCHMARK_SOURCE_FIXTURE_BINDINGS_V1,
  BENCHMARK_WP04_SEMANTIC_SHA256_V1,
  getBenchmarkWp04SemanticBytesV1,
  type BenchmarkCandidateBindingV1,
  type BenchmarkFixtureContractBindingV1,
  type AvailabilityDeclaredStabilityV1,
  type AvailabilityV1,
  type BenchmarkEnvironmentManifestV1,
  type BenchmarkValidationContextV1,
  type CanonicalIdV1,
  type NonEmptyString,
  type SafePositiveIntegerV1,
} from '../../contracts';
import { canonicalizeJsonV1, compareUtf16, parseCanonicalJsonV1, sha256BytesV1, sourcePreflightV1, verifyBuildHandoffV1 } from '../../provenance';
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
  writeFailureDiagnosticV1,
  writeInvocationClosureV1,
  writeProcessUnitResultsV1,
} from '../artifacts/artifactStoreV1';
import { validateDownloadedTelemetryV1 } from '../browser/br02HandoffDriverV1';
import { RunnerFailureErrorV1, type BuiltRunPlanV1, type ProcessUnitResultV1, type RunInvocationRerunOriginV1, type RunInvocationV1 } from '../contractsV1';
import { deriveHardwareCellIdV1 } from '../ids/orchestrationIdsV1';
import { createRunInvocationV1 } from '../invocation/runInvocationV1';
import { ProcessUnitResultLedgerV1 } from '../results/processUnitResultLedgerV1';
import { assertRunnerAuthorityV1, type RunnerAuthorityV1 } from '../runnerSourceV1';
import { runNoReplaceGitCommandV1 } from '../provenance/gitCommandV1';
import { assertWp04SyntheticRouteV1 } from '../scenarios/scenarioDriverRegistryV1';
import { readFixedValidatorAttestationSetV1, VALIDATOR_ATTESTATION_COMMIT_SHA_V1 } from './validatorAttestationV1';
import { parseCandidateBindingV1, closedPreflightObjectV1 } from '../preflight/preflightBindingsV1';

const sourceRef = 'br03-synthetic-contract-v1' as CanonicalIdV1;

function declared<T>(value: T, stability: AvailabilityDeclaredStabilityV1 = 'run-config'): AvailabilityV1<T> {
  return { status: 'declared', value, sourceRef, stability };
}

function unknown<T>(reasonCode: string): AvailabilityV1<T> {
  return { status: 'unknown', value: null, sourceRef, reasonCode: reasonCode as CanonicalIdV1 };
}

export interface SyntheticContractPreflightConfigV1 {
  readonly schemaVersion: 'br03-synthetic-contract-preflight-v1';
  readonly candidates: readonly { readonly id: CanonicalIdV1; readonly binding: BenchmarkCandidateBindingV1 }[];
}

export function parseSyntheticContractPreflightConfigV1(bytes: Uint8Array): SyntheticContractPreflightConfigV1 {
  const object = closedPreflightObjectV1(parseCanonicalJsonV1(bytes), ['schemaVersion', 'candidates'], 'Synthetic-contract preflight');
  if (object.schemaVersion !== 'br03-synthetic-contract-preflight-v1' || !Array.isArray(object.candidates) || object.candidates.length === 0) {
    throw new TypeError('Synthetic-contract preflight header or candidates are invalid.');
  }
  const candidates = object.candidates.map((entry, index) => {
    const candidate = closedPreflightObjectV1(entry, ['id', 'binding'], `Synthetic-contract candidate ${index}`);
    if (typeof candidate.id !== 'string') throw new TypeError('Synthetic-contract candidate ID is invalid.');
    const binding = parseCandidateBindingV1(candidate.binding, `Synthetic-contract candidate ${index}.binding`);
    if (binding.id !== candidate.id) throw new TypeError('Synthetic-contract candidate ID does not match its binding.');
    return { id: candidate.id as CanonicalIdV1, binding };
  });
  if (new Set(candidates.map(({ id }) => id)).size !== candidates.length) throw new TypeError('Synthetic-contract candidate IDs must be unique.');
  return { schemaVersion: object.schemaVersion, candidates };
}

function availablePreflightValueV1(value: AvailabilityV1<unknown>): unknown {
  return value.status === 'observed' || value.status === 'declared' ? value.value : undefined;
}

export function assertSyntheticContractPreflightBindingsV1(plan: BuiltRunPlanV1, preflight: SyntheticContractPreflightConfigV1): void {
  const expected = plan.core.candidates;
  if (preflight.candidates.length !== expected.length
    || preflight.candidates.some(({ id, binding }, index) => expected[index]?.id !== id
      || binding.id !== id
      || availablePreflightValueV1(binding.sourceFileSetSha256) !== expected[index]?.sourceFileSetSha256)) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', 'Synthetic-contract preflight candidates do not exactly match the accepted plan.');
  }
}

interface AcceptedSyntheticPreflightV1 {
  readonly byCandidateId: ReadonlyMap<string, Extract<ReturnType<typeof sourcePreflightV1>, { readonly status: 'accepted' }> >;
  readonly selected: Extract<ReturnType<typeof sourcePreflightV1>, { readonly status: 'accepted' }>;
}

function runSyntheticSourcePreflightV1(
  projectRoot: string,
  expectedSourceCommitSha: string,
  plan: BuiltRunPlanV1,
  preflight: SyntheticContractPreflightConfigV1,
  selectedCandidateId: string,
): AcceptedSyntheticPreflightV1 {
  assertSyntheticContractPreflightBindingsV1(plan, preflight);
  const fixture = {
    ...BENCHMARK_SOURCE_FIXTURE_BINDINGS_V1['wp04-golden-world-v1'],
    semanticSha256: {
      status: 'observed' as const,
      value: BENCHMARK_WP04_SEMANTIC_SHA256_V1,
      sourceRef,
      stability: 'stable' as const,
    },
  } as unknown as BenchmarkFixtureContractBindingV1;
  if (plan.core.fixtureContractId !== fixture.id || plan.core.fixtureSemanticSha256 !== BENCHMARK_WP04_SEMANTIC_SHA256_V1) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', 'Synthetic-contract mode is not bound to the authoritative WP04 fixture.');
  }
  const semanticBytes = getBenchmarkWp04SemanticBytesV1();
  const byCandidateId = new Map<string, Extract<ReturnType<typeof sourcePreflightV1>, { readonly status: 'accepted' }>>();
  for (const candidate of preflight.candidates) {
    const result = sourcePreflightV1({
      rootPath: projectRoot,
      expectedSourceCommitSha,
      fixtureSemanticBytes: semanticBytes,
      fixture,
      candidate: candidate.binding,
      runCommand: runNoReplaceGitCommandV1,
    });
    if (result.status === 'rejected') {
      throw new RunnerFailureErrorV1('source-preflight-rejected', `Source preflight rejected ${candidate.id}: ${result.code}: ${result.detail}`);
    }
    if (result.provenance.build.sha256 !== plan.core.expectedBuildSha256) {
      throw new RunnerFailureErrorV1('build-handoff-rejected', 'Source preflight build digest does not match the plan.');
    }
    const build = verifyBuildHandoffV1(result.buildHandoff);
    if (build.status === 'rejected') throw new RunnerFailureErrorV1('build-handoff-rejected', `Build handoff rejected: ${build.code}.`);
    byCandidateId.set(candidate.id, result);
  }
  const selected = byCandidateId.get(selectedCandidateId);
  if (selected === undefined) throw new RunnerFailureErrorV1('source-preflight-rejected', 'Selected synthetic candidate preflight binding is missing.');
  return { byCandidateId, selected };
}

function assertSyntheticPreflightUnchangedV1(before: AcceptedSyntheticPreflightV1, after: AcceptedSyntheticPreflightV1): void {
  if (before.byCandidateId.size !== after.byCandidateId.size) throw new RunnerFailureErrorV1('source-preflight-rejected', 'Synthetic source preflight candidate set changed.');
  for (const [candidateId, beforeResult] of before.byCandidateId) {
    const afterResult = after.byCandidateId.get(candidateId);
    if (afterResult === undefined
      || !sameCanonicalValueV1(beforeResult.provenance, afterResult.provenance)
      || !sameCanonicalValueV1(beforeResult.buildHandoff, afterResult.buildHandoff)) {
      throw new RunnerFailureErrorV1('source-preflight-rejected', 'Synthetic source or build provenance changed during receipt assembly.');
    }
  }
}

function sameCanonicalValueV1(left: unknown, right: unknown): boolean {
  const leftBytes = canonicalizeJsonV1(left);
  const rightBytes = canonicalizeJsonV1(right);
  return leftBytes.byteLength === rightBytes.byteLength && leftBytes.every((byte, index) => byte === rightBytes[index]);
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
  readonly preflight: SyntheticContractPreflightConfigV1;
  readonly runnerAuthority: RunnerAuthorityV1;
  readonly attempt?: number;
  readonly rerunOrigin?: RunInvocationRerunOriginV1;
  readonly predecessorInvocation?: RunInvocationV1;
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
  assertRunnerAuthorityV1(options.runnerAuthority);
  if (options.runnerAuthority.sourceCommitSha !== plan.core.expectedSourceCommitSha) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', 'Runner authority does not match the expected source commit.');
  }
  if (plan.core.syntheticHardwareProfile !== true) throw new TypeError('Synthetic contract mode requires a synthetic hardware profile plan.');
  if (!Number.isSafeInteger(options.slotIndex) || options.slotIndex < 0) throw new RangeError('slotIndex must be a non-negative safe integer.');
  const unit = plan.core.processUnits[options.slotIndex];
  if (unit === undefined || unit.processContainer !== 'cold' || unit.processOrdinal !== 0) {
    throw new TypeError('Synthetic contract mode requires the first cold mesh-golden process for one candidate cell.');
  }
  assertWp04SyntheticRouteV1(unit.scenarioId, unit.scenarioParameters);
  const acceptedPreflight = runSyntheticSourcePreflightV1(options.projectRoot, plan.core.expectedSourceCommitSha, plan, options.preflight, unit.candidateId);
  const source = acceptedPreflight.selected.provenance;
  const environment = syntheticEnvironment(plan, unit.scenarioId);
  const invocation = createRunInvocationV1(plan, {
    createdUtc: options.createdUtc,
    outputRoot: options.outputRoot,
    attempt: options.attempt,
    rerunOrigin: options.rerunOrigin,
    predecessorInvocation: options.predecessorInvocation,
    selectedSlotIds: [unit.ids.slotId],
    runnerSourceSha: options.runnerAuthority.runnerSourceSha,
  });
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
    name: 'run.total',
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
    origin: plannedRun.origin,
    measurementEligibilityReasons: [{ code: 'environment-incomplete', detail: 'synthetic environment is diagnostic-only' as NonEmptyString, phase: 'cold' }],
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
  const validatorBefore = readFixedValidatorAttestationSetV1(options.projectRoot);
  const minted = await mintReceiptV1({
    document,
    planId: plan.runPlanId,
    slotId: unit.ids.slotId,
    runId: plannedRun.runId,
    telemetryExportRawBytes,
    validatorSourceCommitSha: VALIDATOR_ATTESTATION_COMMIT_SHA_V1,
    validatorSourceFiles: validatorBefore.files,
    validationContext,
    telemetryAdapter,
  });
  const postflight = runSyntheticSourcePreflightV1(options.projectRoot, plan.core.expectedSourceCommitSha, plan, options.preflight, unit.candidateId);
  assertSyntheticPreflightUnchangedV1(acceptedPreflight, postflight);
  const validatorAfter = readFixedValidatorAttestationSetV1(options.projectRoot);
  if (validatorBefore.filesetDigest !== validatorAfter.filesetDigest
    || validatorBefore.fileCount !== validatorAfter.fileCount
    || validatorBefore.totalBytes !== validatorAfter.totalBytes
    || validatorBefore.files.some((file, index) => {
      const other = validatorAfter.files[index];
      return other === undefined || file.path !== other.path || file.bytes.byteLength !== other.bytes.byteLength
        || file.bytes.some((byte, byteIndex) => byte !== other.bytes[byteIndex]);
    })) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', 'Validator source closure changed during receipt assembly.');
  }
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
    await writeInvocationClosureV1(invocationRoot, plan, invocation, results);
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
      const terminalResults = failureResults(failureCode);
      await writeFailureDiagnosticV1(invocationRoot, unit.ids.slotId, failureCode, terminalError, {
        handoffCode: null,
        timeoutOwner: 'none', exitCode: null, signal: null, childSignal: null,
        cleanupState: failureCode === 'cleanup-failed' ? 'failed' : 'complete',
        expected: [
          { field: 'source-commit', sha256: sha256BytesV1(new TextEncoder().encode(plan.core.expectedSourceCommitSha)) },
          { field: 'build', sha256: plan.core.expectedBuildSha256 },
          { field: 'runner-bundle', sha256: options.runnerAuthority.runnerSourceSha },
        ],
        observed: [
          { field: 'source-commit', sha256: sha256BytesV1(new TextEncoder().encode(options.runnerAuthority.sourceCommitSha)) },
          { field: 'build', sha256: source.build.sha256 },
          { field: 'runner-bundle', sha256: options.runnerAuthority.runnerSourceSha },
        ],
      });
      await writeProcessUnitResultsV1(invocationRoot, terminalResults);
      await writeInvocationClosureV1(invocationRoot, plan, invocation, terminalResults);
    } catch (resultError) {
      if (resultError instanceof ArtifactCleanupErrorV1) failureCode = 'cleanup-failed';
      terminalError = new AggregateError([error, resultError], 'Synthetic artifact failure and terminal-result publication failed.');
    }
    throw new RunnerFailureErrorV1(failureCode, 'Synthetic artifact publication failed.', { cause: terminalError });
  }
}

type BuildBundleOptionsCreatedUtc = Parameters<typeof buildBenchmarkBundleV1>[0]['createdUtc'];

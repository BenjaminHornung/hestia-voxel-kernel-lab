import { rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import {
  BENCHMARK_SCENARIO_REGISTRY_V1,
  type BenchmarkCandidateBindingV1,
  type BenchmarkFixtureContractBindingV1,
  type CanonicalIdV1,
  type NonEmptyString,
} from '../../contracts';
import {
  canonicalizeJsonV1,
  parseCanonicalJsonV1,
  readFileBytesV1,
  repositoryRelativePathV1,
  sourcePreflightV1,
  verifyBuildHandoffV1,
} from '../../provenance';
import {
  BR02_BROWSER_HANDOFF_CONTRACT_ID,
  BR02_BROWSER_HANDOFF_SCHEMA_VERSION,
  BR02_BROWSER_RUNTIME_ACTIVATION,
} from '../../../diagnostics/telemetry/browserHandoffV1';
import {
  assembleRunV1,
  createSinglePassTelemetryAdapterV1,
} from '../assembly/runAssemblerV1';
import {
  createInvocationArtifactRootV1,
  ArtifactCleanupErrorV1,
  verifyInvocationSetupV1,
  verifyLifecycleSmokeArtifactsV1,
  writeLifecycleSmokeArtifactsV1,
  writeProcessUnitResultsV1,
} from '../artifacts/artifactStoreV1';
import { Br02HandoffDriverErrorV1, runBr02HandoffV1 } from '../browser/br02HandoffDriverV1';
import { RunnerFailureErrorV1, type BuiltRunPlanV1, type ProcessUnitFailureCodeV1, type ProcessUnitResultV1 } from '../contractsV1';
import { collectEnvironmentV1 } from '../environment/environmentCollectorV1';
import { deriveHardwareCellIdV1 } from '../ids/orchestrationIdsV1';
import { createRunInvocationV1 } from '../invocation/runInvocationV1';
import { boundedCleanupV1, BrowserStartupCleanupErrorV1, startBrowserProcessV1 } from '../process/browserProcessSupervisorV1';
import { CleanupGuardV1 } from '../process/cleanupGuardV1';
import { PreviewStartupCleanupErrorV1, startPreviewServerV1 } from '../process/previewServerSupervisorV1';
import { ProcessUnitResultLedgerV1 } from '../results/processUnitResultLedgerV1';
import { resolveScenarioRouteV1 } from '../scenarios/scenarioDriverRegistryV1';
import { parseCandidateBindingV1, parseFixtureBindingV1, closedPreflightObjectV1 } from '../preflight/preflightBindingsV1';
import { assertRunnerAuthorityV1, type RunnerAuthorityV1 } from '../runnerSourceV1';
import { runNoReplaceGitCommandV1 } from '../provenance/gitCommandV1';

const MAX_SEMANTIC_BYTES = 1024 * 1024;
const LIFECYCLE_PROCESS_TIMEOUT_MS = 120_000;
const RESOURCE_STARTUP_CLEANUP_TIMEOUT_MS = 5_000;

type StartupOutcomeV1<T> =
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'rejected'; readonly error: unknown }
  | { readonly status: 'timeout' };

async function settleStartupV1<T>(operation: Promise<T>): Promise<StartupOutcomeV1<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const outcome = await Promise.race<StartupOutcomeV1<T>>([
    operation.then((value) => ({ status: 'ready' as const, value }), (error) => ({ status: 'rejected' as const, error })),
    new Promise<StartupOutcomeV1<T>>((resolve) => {
      timer = setTimeout(() => resolve({ status: 'timeout' }), RESOURCE_STARTUP_CLEANUP_TIMEOUT_MS);
    }),
  ]);
  if (timer !== undefined) clearTimeout(timer);
  return outcome;
}

function withTimeoutV1<T>(operation: Promise<T>, abortSignal: Promise<never>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  void operation.catch(() => undefined);
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RunnerFailureErrorV1('timeout', `${label} did not finish within the lifecycle bound.`)), timeoutMs);
  });
  return Promise.race([operation, abortSignal, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
export interface LifecycleSmokePreflightConfigV1 {
  readonly schemaVersion: 'br03-lifecycle-smoke-preflight-v1';
  readonly fixtureSemanticPath: string;
  readonly fixture: BenchmarkFixtureContractBindingV1;
  readonly candidates: readonly { readonly id: CanonicalIdV1; readonly binding: BenchmarkCandidateBindingV1 }[];
}

export interface LifecycleSmokeRunOptionsV1 {
  readonly plan: BuiltRunPlanV1;
  readonly slotIndex: number;
  readonly createdUtc: string;
  readonly outputRoot: string;
  readonly projectRoot: string;
  readonly preflight: LifecycleSmokePreflightConfigV1;
  readonly runnerAuthority: RunnerAuthorityV1;
}

export interface LifecycleSmokeRunResultV1 {
  readonly invocationId: CanonicalIdV1;
  readonly runId: CanonicalIdV1;
  readonly invocationRoot: string;
  readonly artifactRoot: string;
  readonly disposition: 'unsupported';
}

export function parseLifecycleSmokePreflightConfigV1(bytes: Uint8Array): LifecycleSmokePreflightConfigV1 {
  const object = closedPreflightObjectV1(parseCanonicalJsonV1(bytes), ['schemaVersion', 'fixtureSemanticPath', 'fixture', 'candidates'], 'Lifecycle-smoke preflight');
  if (object.schemaVersion !== 'br03-lifecycle-smoke-preflight-v1' || typeof object.fixtureSemanticPath !== 'string') {
    throw new TypeError('Lifecycle-smoke preflight header is invalid.');
  }
  if (!Array.isArray(object.candidates) || object.candidates.length === 0) throw new TypeError('Lifecycle-smoke candidates are missing.');
  const candidates = object.candidates.map((entry, index) => {
    const candidate = closedPreflightObjectV1(entry, ['id', 'binding'], `Lifecycle-smoke candidate ${index}`);
    if (typeof candidate.id !== 'string') throw new TypeError('Lifecycle-smoke candidate ID is invalid.');
    const binding = parseCandidateBindingV1(candidate.binding, `Lifecycle-smoke candidate ${index}.binding`);
    if (binding.id !== candidate.id) throw new TypeError('Lifecycle-smoke candidate ID does not match its binding.');
    return { id: candidate.id as CanonicalIdV1, binding };
  });
  if (new Set(candidates.map(({ id }) => id)).size !== candidates.length) throw new TypeError('Lifecycle-smoke candidate IDs must be unique.');
  return {
    schemaVersion: object.schemaVersion,
    fixtureSemanticPath: repositoryRelativePathV1(object.fixtureSemanticPath),
    fixture: parseFixtureBindingV1(object.fixture, 'Lifecycle-smoke fixture'),
    candidates,
  };
}

function observedValue(value: { readonly status: string; readonly value: unknown }): unknown {
  return value.status === 'observed' || value.status === 'declared' ? value.value : undefined;
}

export function assertLifecyclePreflightBindingsV1(plan: BuiltRunPlanV1, preflight: LifecycleSmokePreflightConfigV1): void {
  const expectedCandidates = plan.core.candidates;
  if (preflight.fixture.id !== plan.core.fixtureContractId
    || observedValue(preflight.fixture.semanticSha256) !== plan.core.fixtureSemanticSha256
    || preflight.candidates.length !== expectedCandidates.length
    || preflight.candidates.some((candidate, index) => candidate.id !== expectedCandidates[index]?.id
      || candidate.binding.id !== candidate.id
      || observedValue(candidate.binding.sourceFileSetSha256) !== expectedCandidates[index]?.sourceFileSetSha256)) {
    throw new TypeError('Lifecycle-smoke preflight bindings do not match the accepted plan.');
  }
}

async function readFixtureSemanticBytesV1(projectRoot: string, semanticPath: string): Promise<Uint8Array> {
  const path = resolve(projectRoot, ...repositoryRelativePathV1(semanticPath).split('/'));
  let bytes: Uint8Array;
  try {
    bytes = readFileBytesV1(path, { maxFileBytes: MAX_SEMANTIC_BYTES, maxAggregateBytes: MAX_SEMANTIC_BYTES });
  } catch (error) {
    throw new TypeError('Fixture semantic file is missing or outside its size bound.', { cause: error });
  }
  if (bytes.byteLength < 1) throw new TypeError('Fixture semantic file is missing or outside its size bound.');
  return bytes;
}

async function runtimeObservation(page: Parameters<typeof runBr02HandoffV1>[0]) {
  return page.evaluate(() => ({
    cssWidth: window.innerWidth,
    cssHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    visibility: document.visibilityState === 'visible' ? 'visible' as const : 'hidden' as const,
    focused: document.hasFocus(),
    webgl2: document.createElement('canvas').getContext('webgl2') !== null,
    webgpu: 'gpu' in navigator,
    performanceTimeOrigin: Number.isFinite(performance.timeOrigin),
  }));
}

function failureClass(code: ProcessUnitFailureCodeV1): ProcessUnitResultV1['failureClass'] {
  if (code === 'cleanup-failed') return 'cleanup';
  if (code === 'source-preflight-rejected' || code === 'build-handoff-rejected') return 'provenance';
  if (code === 'scenario-unavailable' || code === 'required-metric-producers-unavailable' || code === 'backend-parity-producers-unavailable') return 'unsupported';
  if (code === 'environment-invalid') return 'environment';
  if (code === 'browser-crash' || code === 'handoff-failed' || code === 'warmup-not-stable' || code === 'validation-failed' || code === 'receipt-failed') return 'candidate';
  if (code === 'operator-abort') return 'candidate';
  return 'infrastructure';
}

export function lifecycleTerminalFailureCodeV1(
  completed: boolean,
  stage: ProcessUnitFailureCodeV1,
  aborted: boolean,
): ProcessUnitFailureCodeV1 {
  return completed ? 'required-metric-producers-unavailable'
    : stage === 'cleanup-failed' ? 'cleanup-failed'
      : aborted ? 'operator-abort'
        : stage === 'scenario-unavailable' ? 'scenario-unavailable' : stage;
}

export async function runLifecycleSmokeV1(options: LifecycleSmokeRunOptionsV1): Promise<LifecycleSmokeRunResultV1> {
  assertRunnerAuthorityV1(options.runnerAuthority);
  if (options.runnerAuthority.sourceCommitSha !== options.plan.core.expectedSourceCommitSha) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', 'Runner authority does not match the expected source commit.');
  }
  if (!Number.isSafeInteger(options.slotIndex) || options.slotIndex < 0) throw new RangeError('slotIndex must be a non-negative safe integer.');
  const unit = options.plan.core.processUnits[options.slotIndex];
  if (unit === undefined || unit.processContainer !== 'cold' || unit.processOrdinal !== 0) {
    throw new TypeError('Lifecycle-smoke mode supports the first cold process of one candidate cell.');
  }
  const invocation = createRunInvocationV1(options.plan, { createdUtc: options.createdUtc, outputRoot: options.outputRoot, selectedSlotIds: [unit.ids.slotId], runnerSourceSha: options.runnerAuthority.runnerSourceSha });
  const invocationUnit = invocation.processUnits.find(({ slotId }) => slotId === unit.ids.slotId)!;
  const plannedRun = invocationUnit.runs[0]!;
  let stage: ProcessUnitFailureCodeV1 = 'source-preflight-rejected';
  let cleanupFailed = false;
  let aborted = false;
  let terminalOutcome: 'open' | 'aborted' | 'claimed' = 'open';
  let execution: Awaited<ReturnType<typeof executeLifecycleSmokeProcessV1>> | undefined;
  let executionError: unknown;
  const recordFailure = (error: unknown, message: string): void => {
    executionError = executionError === undefined ? error : new AggregateError([executionError, error], message);
  };
  const setStage = (value: ProcessUnitFailureCodeV1): void => {
    if (!cleanupFailed) stage = value;
  };
  const recordCleanupFailure = (error: unknown): void => {
    cleanupFailed = true;
    stage = 'cleanup-failed';
    recordFailure(error, 'Lifecycle-smoke execution and cleanup failed.');
  };
  let preflightInput: Parameters<typeof sourcePreflightV1>[0] | undefined;
  let acceptedPreflight: Extract<ReturnType<typeof sourcePreflightV1>, { readonly status: 'accepted' }> | undefined;
  const guard = new CleanupGuardV1();
  let signalCleanup: Promise<void> | null = null;
  let rejectAbort: ((reason: unknown) => void) | undefined;
  const abortSignal = new Promise<never>((_, reject) => { rejectAbort = reject; });
  void abortSignal.catch(() => undefined);
  const requestAbort = (reason: unknown) => {
    if (terminalOutcome === 'open') {
      terminalOutcome = 'aborted';
      aborted = true;
      executionError ??= reason;
    }
    rejectAbort?.(reason);
    signalCleanup ??= guard.close();
  };
  const terminalOutcomeIsAborted = () => terminalOutcome === 'aborted';
  const onSignal = () => {
    requestAbort(new Error('Lifecycle-smoke execution was aborted by an operating-system signal.'));
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  const onFatal = (reason: unknown) => {
    if (terminalOutcome === 'claimed') {
      const message = reason instanceof Error ? reason.message : 'Lifecycle-smoke fatal event after terminal publication.';
      process.exitCode = 4;
      process.stderr.write(`${JSON.stringify({ status: 'error', message })}\n`);
      const hardExit = setTimeout(() => process.exit(4), 250);
      hardExit.unref();
      return;
    }
    requestAbort(reason);
  };
  process.on('uncaughtException', onFatal);
  process.on('unhandledRejection', onFatal);
  const removeHandlers = () => {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    process.off('uncaughtException', onFatal);
    process.off('unhandledRejection', onFatal);
  };
  let invocationRoot: string;
  try {
    invocationRoot = await createInvocationArtifactRootV1(options.outputRoot, options.projectRoot, options.plan, invocation);
  } catch (error) {
    try {
      await guard.close();
    } catch (cleanupError) {
      error = new AggregateError([error, cleanupError], 'Lifecycle-smoke invocation setup and cleanup failed.');
    }
    removeHandlers();
    if (aborted) throw new RunnerFailureErrorV1('operator-abort', 'Lifecycle-smoke execution was aborted during invocation setup.', { cause: error });
    throw error;
  }
  try {
    if (!aborted) {
      let route: ReturnType<typeof resolveScenarioRouteV1>;
      try {
        route = resolveScenarioRouteV1(unit.scenarioId, unit.scenarioParameters);
      } catch (error) {
        setStage('scenario-unavailable');
        throw error;
      }
      if (route.status !== 'ready') {
        setStage('scenario-unavailable');
        throw new TypeError(`Scenario is unavailable: ${route.reasonCode}.`);
      }
      assertLifecyclePreflightBindingsV1(options.plan, options.preflight);
      const candidate = options.preflight.candidates.find(({ id }) => id === unit.candidateId);
      if (candidate === undefined) throw new TypeError('Lifecycle-smoke candidate preflight binding is missing.');
      const currentPreflightInput: Parameters<typeof sourcePreflightV1>[0] = {
        rootPath: options.projectRoot,
        expectedSourceCommitSha: options.plan.core.expectedSourceCommitSha,
        fixtureSemanticBytes: await readFixtureSemanticBytesV1(options.projectRoot, options.preflight.fixtureSemanticPath),
        fixture: options.preflight.fixture,
        candidate: candidate.binding,
        runCommand: runNoReplaceGitCommandV1,
      };
      preflightInput = currentPreflightInput;
      const preflight = sourcePreflightV1(currentPreflightInput);
      if (preflight.status === 'rejected') throw new Error(`Source preflight rejected: ${preflight.code}: ${preflight.detail}`);
      acceptedPreflight = preflight;
      setStage('build-handoff-rejected');
      if (preflight.provenance.build.sha256 !== options.plan.core.expectedBuildSha256) throw new Error('Source preflight build digest does not match the plan.');
      const buildVerification = verifyBuildHandoffV1(preflight.buildHandoff);
      if (buildVerification.status === 'rejected') throw new Error(`Build handoff rejected: ${buildVerification.code}.`);
      setStage('preview-start-failed');
      if (aborted) throw new Error('Lifecycle-smoke execution was aborted before owned process startup.');
      const processExecution = executeLifecycleSmokeProcessV1({ options, unit, route: route.route, plannedRun, preflight, invocationRoot, guard, isAborted: () => aborted, setStage });
      execution = await withTimeoutV1(processExecution, abortSignal, LIFECYCLE_PROCESS_TIMEOUT_MS, 'Lifecycle-smoke process');
    }
  } catch (error) {
    if (error instanceof RunnerFailureErrorV1 && error.failureCode === 'timeout') setStage('timeout');
    recordFailure(error, 'Lifecycle-smoke execution failed.');
  } finally {
    try {
      await (signalCleanup ?? guard.close());
    } catch (error) {
      recordCleanupFailure(error);
      execution = undefined;
    }
  }

  if (aborted) execution = undefined;

  if (preflightInput !== undefined && acceptedPreflight !== undefined) {
    try {
      const postflight = sourcePreflightV1({
        ...preflightInput,
        fixtureSemanticBytes: await readFixtureSemanticBytesV1(options.projectRoot, options.preflight.fixtureSemanticPath),
        runCommand: runNoReplaceGitCommandV1,
      });
      const postBuild = postflight.status === 'accepted' ? verifyBuildHandoffV1(postflight.buildHandoff) : undefined;
      const beforeBytes = canonicalizeJsonV1(acceptedPreflight.provenance);
      const afterBytes = postflight.status === 'accepted' ? canonicalizeJsonV1(postflight.provenance) : new Uint8Array();
      if (postflight.status === 'rejected' || postBuild?.status !== 'verified'
        || beforeBytes.byteLength !== afterBytes.byteLength || beforeBytes.some((byte, index) => byte !== afterBytes[index])) {
        setStage(postflight.status === 'rejected' ? 'source-preflight-rejected' : 'build-handoff-rejected');
        throw new Error('Source or build provenance changed during lifecycle smoke.');
      }
    } catch (error) {
      recordFailure(error, 'Lifecycle-smoke postflight failed.');
      execution = undefined;
    }
  }

  const buildResults = (completed: boolean): readonly ProcessUnitResultV1[] => {
    const ledger = new ProcessUnitResultLedgerV1(options.plan, invocation);
    for (const invocationUnit of invocation.processUnits) {
      const current = options.plan.core.processUnits.find(({ ids }) => ids.slotId === invocationUnit.slotId);
      if (current === undefined) throw new Error('Invocation process unit is missing from the accepted plan.');
      const terminalCode = lifecycleTerminalFailureCodeV1(completed, stage, aborted);
      const unsupported = !aborted && !cleanupFailed && (completed || terminalCode === 'scenario-unavailable');
      const disposition = unsupported ? 'unsupported' : cleanupFailed ? 'failed' : aborted ? 'aborted' : (terminalCode === 'source-preflight-rejected' || terminalCode === 'build-handoff-rejected' || terminalCode === 'environment-invalid' || terminalCode === 'warmup-not-stable' ? 'invalid' : 'failed');
      ledger.record({
        schemaVersion: 'br03-process-unit-result-v1',
        slotId: current.ids.slotId,
        browserProcessId: current.ids.browserProcessId,
        disposition,
        failureClass: failureClass(terminalCode),
        failureCode: terminalCode,
        runIds: completed ? [plannedRun.runId] : [],
      });
    }
    return ledger.finalize();
  };

  let setupIssues: readonly string[] = [];
  try {
    setupIssues = await verifyInvocationSetupV1(invocationRoot, options.plan, invocation);
  } catch (error) {
    setupIssues = [error instanceof Error ? error.message : 'Invocation setup verification failed.'];
  }
  if (setupIssues.length > 0) {
    setStage('artifact-write-failed');
    recordFailure(new Error(`Invocation setup verification failed: ${setupIssues.join('; ')}`), 'Lifecycle-smoke invocation setup failed.');
    execution = undefined;
  }

  let artifactRoot: string | undefined;
  const discardArtifact = async (): Promise<void> => {
    const currentRoot = artifactRoot;
    artifactRoot = undefined;
    if (currentRoot === undefined) return;
    try {
      await boundedCleanupV1(rm(currentRoot, { recursive: true, force: true }), 'Lifecycle-smoke artifact discard');
    } catch (error) {
      recordCleanupFailure(error);
    }
  };
  if (execution !== undefined) {
    try {
      artifactRoot = await writeLifecycleSmokeArtifactsV1(invocationRoot, unit.ids.slotId, execution.run, execution.environment, execution.rawBytes);
      const issues = await verifyLifecycleSmokeArtifactsV1(invocationRoot, buildResults(true), { plan: options.plan, invocation });
      if (issues.length > 0) throw new Error(issues.join('; '));
    } catch (error) {
      if (error instanceof ArtifactCleanupErrorV1) recordCleanupFailure(error);
      else {
        setStage('artifact-write-failed');
        recordFailure(error, 'Lifecycle-smoke artifact publication failed.');
      }
      execution = undefined;
      await discardArtifact();
    }
  }

  try {
    let results = buildResults(execution !== undefined);
    try {
      const lifecycleIssues = await verifyLifecycleSmokeArtifactsV1(invocationRoot, results, { plan: options.plan, invocation });
      if (lifecycleIssues.length > 0) {
        setStage('artifact-write-failed');
        recordFailure(new Error(`Lifecycle-smoke artifact verification failed: ${lifecycleIssues.join('; ')}`), 'Lifecycle-smoke artifact verification failed.');
        execution = undefined;
        await discardArtifact();
        results = buildResults(false);
      }
    } catch (error) {
      setStage('artifact-write-failed');
      recordFailure(error, 'Lifecycle-smoke artifact verification failed.');
      execution = undefined;
      await discardArtifact();
      results = buildResults(false);
    }
    if (terminalOutcomeIsAborted()) {
      execution = undefined;
      setStage('operator-abort');
      await discardArtifact();
      results = buildResults(false);
    }
    // The claim is the terminal publication linearization point; later signals cannot rewrite it.
    terminalOutcome = 'claimed';
    try {
      await writeProcessUnitResultsV1(invocationRoot, results);
    } catch (error) {
      if (error instanceof ArtifactCleanupErrorV1) recordCleanupFailure(error);
      else {
        setStage('artifact-write-failed');
        recordFailure(error, 'Lifecycle-smoke terminal-result publication failed.');
      }
      throw new RunnerFailureErrorV1(stage, `Lifecycle-smoke process failed at ${stage}.`, { cause: executionError });
    }
    removeHandlers();
    if (signalCleanup !== null) {
      try {
        await signalCleanup;
      } catch (error) {
        recordCleanupFailure(error);
      }
    }
    if (cleanupFailed) throw new RunnerFailureErrorV1('cleanup-failed', 'Lifecycle-smoke cleanup failed after terminal publication.', { cause: executionError });
    if (execution === undefined || artifactRoot === undefined) throw new RunnerFailureErrorV1(stage, `Lifecycle-smoke process failed at ${stage}.`, { cause: executionError });
    return { invocationId: invocation.invocationId, runId: plannedRun.runId, invocationRoot, artifactRoot, disposition: 'unsupported' };
  } finally {
    removeHandlers();
  }
}

interface ExecuteProcessOptionsV1 {
  readonly options: LifecycleSmokeRunOptionsV1;
  readonly unit: BuiltRunPlanV1['core']['processUnits'][number];
  readonly route: string;
  readonly plannedRun: ReturnType<typeof createRunInvocationV1>['processUnits'][number]['runs'][number];
  readonly preflight: Extract<ReturnType<typeof sourcePreflightV1>, { readonly status: 'accepted' }>;
  readonly invocationRoot: string;
  readonly guard: CleanupGuardV1;
  readonly isAborted: () => boolean;
  readonly setStage: (stage: ProcessUnitFailureCodeV1) => void;
}

async function executeLifecycleSmokeProcessV1(input: ExecuteProcessOptionsV1) {
  const { options, unit, plannedRun, preflight, invocationRoot, guard } = input;
  let preview: Awaited<ReturnType<typeof startPreviewServerV1>> | undefined;
  let previewStart: Promise<Awaited<ReturnType<typeof startPreviewServerV1>>> | undefined;
  guard.register('preview-server', async () => {
    if (previewStart === undefined) return;
    const outcome = await settleStartupV1(previewStart);
    if (outcome.status === 'timeout') {
      void previewStart.then((handle) => handle.close().catch(() => undefined), () => undefined);
      throw new Error('Preview startup cleanup timed out.');
    }
    if (outcome.status === 'rejected') {
      if (outcome.error instanceof PreviewStartupCleanupErrorV1) throw outcome.error;
      return;
    }
    if (outcome.status === 'ready') await outcome.value.close();
  });
  previewStart = startPreviewServerV1({ projectRoot: options.projectRoot, buildRoot: preflight.buildHandoff.rootIdentity.buildRootPath });
  void previewStart.catch(() => undefined);
  preview = await previewStart;
  if (input.isAborted()) {
    await preview.close();
    throw new Error('Lifecycle-smoke execution was aborted while starting the preview server.');
  }
  input.setStage('browser-launch-failed');
   const profileRoot = join(dirname(invocationRoot), '.profiles', basename(invocationRoot));
  let browser: Awaited<ReturnType<typeof startBrowserProcessV1>> | undefined;
  let browserStart: Promise<Awaited<ReturnType<typeof startBrowserProcessV1>>> | undefined;
  let browserStartAttempted = false;
  const closeBrowser = async () => {
    if (browser === undefined) {
      if (browserStartAttempted) {
        if (browserStart === undefined) throw new Error('Owned browser startup promise is unavailable.');
        const outcome = await settleStartupV1(browserStart);
        if (outcome.status === 'timeout') {
          void browserStart.then(async (handle) => {
            try {
              await handle.close();
              await boundedCleanupV1(rm(profileRoot, { recursive: true, force: true }), 'Late browser profile cleanup');
            } catch {
              // Retain the owned profile when eventual closure is not proven.
            }
          }, () => undefined);
          throw new Error('Browser startup cleanup timed out.');
        }
        if (outcome.status === 'rejected') {
          const error = outcome.error;
          if (error instanceof BrowserStartupCleanupErrorV1) throw error;
          await boundedCleanupV1(rm(profileRoot, { recursive: true, force: true }), 'Browser startup profile cleanup');
          return;
        }
        browser = outcome.value;
        if (browser === undefined) throw new Error('Owned browser handle is unavailable; profile ownership is retained for cleanup review.');
      }
      return;
    }
    await browser.close();
    await boundedCleanupV1(rm(profileRoot, { recursive: true, force: true }), 'Browser profile cleanup');
  };
  browserStartAttempted = true;
  guard.register('browser-and-profile-root', closeBrowser);
  browserStart = startBrowserProcessV1({
    profileRoot,
    channel: options.plan.core.browser.requestedChannel,
    headless: options.plan.core.browser.headless,
    args: options.plan.core.browser.requestedArgs,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  void browserStart.catch(() => undefined);
  browser = await browserStart;
  if (input.isAborted()) {
    await closeBrowser();
    throw new Error('Lifecycle-smoke execution was aborted while starting the browser.');
  }
  if (browser === undefined) throw new Error('Browser process handle was not created.');
  const ownedBrowser = browser;
  if (ownedBrowser.cdp === null) throw new Error('Browser-wide CDP session is unavailable.');
  input.setStage('handoff-failed');
  const backendValue = unit.scenarioParameters.find(({ key }) => key === 'backend')?.value;
  const backend = backendValue === 'three-webgl2' || backendValue === 'raw-webgpu' ? backendValue : 'not-applicable';
  let handoff: Awaited<ReturnType<typeof runBr02HandoffV1>>;
  try {
    handoff = await runBr02HandoffV1(ownedBrowser.page, preview.baseUrl, input.route, {
      schemaVersion: BR02_BROWSER_HANDOFF_SCHEMA_VERSION,
      contractId: BR02_BROWSER_HANDOFF_CONTRACT_ID,
      runtimeActivation: BR02_BROWSER_RUNTIME_ACTIVATION,
      runId: plannedRun.runId,
      planId: options.plan.runPlanId,
      scenarioId: unit.scenarioId as CanonicalIdV1,
      phase: plannedRun.phase,
      backend,
      telemetryMode: 'telemetry-enabled-minimal',
      iterations: plannedRun.iterationIds.map((iterationId, iterationOrdinal) => ({ iterationId, iterationOrdinal })),
    });
  } catch (error) {
    if (error instanceof Br02HandoffDriverErrorV1 && error.code === 'process-crash') input.setStage('browser-crash');
    throw error;
  }
  input.setStage('browser-crash');
  ownedBrowser.assertRunning();
  input.setStage('preview-health-failed');
  await preview.assertHealthy();
  input.setStage('browser-crash');
  ownedBrowser.assertRunning();
  const runtime = await runtimeObservation(ownedBrowser.page);
  input.setStage('browser-crash');
  ownedBrowser.assertRunning();
  const definition = BENCHMARK_SCENARIO_REGISTRY_V1[unit.scenarioId].definition;
  const support = new Map<string, boolean>([
    ['performance-time-origin', runtime.performanceTimeOrigin],
    ['webgl2', runtime.webgl2],
    ['webgpu', runtime.webgpu],
  ]);
  input.setStage('environment-invalid');
  const environment = await collectEnvironmentV1({
    hardwareProfileId: options.plan.core.hardwareProfileId,
    gateRole: 'correctness-only',
    syntheticHardwareProfile: options.plan.core.syntheticHardwareProfile,
    requestedChannel: options.plan.core.browser.requestedChannel,
    requestedHeadless: options.plan.core.browser.headless,
    requestedArgs: options.plan.core.browser.requestedArgs,
    profilePath: ownedBrowser.profilePath,
    outputRoot: options.outputRoot,
    runtime: { cssWidth: runtime.cssWidth, cssHeight: runtime.cssHeight, devicePixelRatio: runtime.devicePixelRatio, visibility: runtime.visibility, focused: runtime.focused, backgroundTabs: ownedBrowser.context.pages().length - 1 },
    capabilities: definition.capabilityContracts.map(({ id }) => ({ id, supported: support.get(id) ?? false, sourceRef: 'br03-browser-capability-v1' as CanonicalIdV1 })),
    cdp: ownedBrowser.cdp,
  });
  input.setStage('browser-crash');
  ownedBrowser.assertRunning();
   input.setStage('environment-invalid');
   if (environment.effectiveArgs.status !== 'observed') throw new TypeError('Effective browser command line was not observed for profile ownership verification.');
  const hardwareCellId = deriveHardwareCellIdV1({
    candidateId: unit.candidateId,
    hardwareProfileId: options.plan.core.hardwareProfileId,
    hardwareBindingSha256: options.plan.core.hardwareBindingSha256,
    fixtureContractId: options.plan.core.fixtureContractId,
    fixtureSemanticSha256: options.plan.core.fixtureSemanticSha256,
    expectedSourceCommitSha: options.plan.core.expectedSourceCommitSha,
    expectedBuildSha256: options.plan.core.expectedBuildSha256,
    scenarioId: unit.scenarioId as CanonicalIdV1,
  });
  const telemetryAdapter = createSinglePassTelemetryAdapterV1();
  input.setStage('validation-failed');
   const environmentReasonDetail = `lifecycle smoke only${environment.ineligibilityReasons.length === 0 ? '' : `: ${environment.ineligibilityReasons.join(', ')}`}` as NonEmptyString;
   const run = assembleRunV1({
    plan: options.plan,
    unit,
    plannedRun,
    createdUtc: options.createdUtc,
    hardwareCellId,
    source: preflight.provenance,
    environment: environment.manifest,
    telemetryExport: handoff.telemetryExport,
    pageState: { visibility: runtime.visibility, focus: runtime.focused ? 'focused' : 'unfocused', backgroundTabs: ownedBrowser.context.pages().length - 1 },
    origin: { kind: 'planned' },
     measurementEligibilityReasons: [{ code: 'environment-incomplete', detail: environmentReasonDetail, phase: plannedRun.phase }],
    telemetryAdapter,
  });
  input.setStage('browser-crash');
  ownedBrowser.assertRunning();
  return { run, environment: environment.manifest, rawBytes: handoff.rawBytes };
}

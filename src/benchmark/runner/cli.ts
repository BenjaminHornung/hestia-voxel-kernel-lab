import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, linkSync, openSync } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BENCHMARK_WP04_SEMANTIC_SHA256_V1, type BenchmarkRunDocumentV1, type BenchmarkValidationContextV1, type CanonicalIdV1 } from '../contracts';
import { canonicalizeJsonV1, parseCanonicalJsonV1, readFileBytesV1 } from '../provenance';
import { ArtifactCleanupErrorV1, createInvocationArtifactRootV1, deriveBundleIdV1, readInvocationClosureV1, readVerifiedBundleRunIdsV1, verifyInvocationClosureV1, verifyInvocationControlV1, verifyLifecycleSmokeArtifactsV1, verifyWrittenBundleV1, writeInvocationClosureV1, writeProcessUnitResultsV1 } from './artifacts/artifactStoreV1';
import { RunnerFailureErrorV1, type BuiltRunPlanV1, type RunInvocationRerunOriginV1, type RunInvocationV1, type RunPlanProcessUnitV1 } from './contractsV1';
import { CleanupGuardErrorV1 } from './process/cleanupGuardV1';
import { createRunInvocationV1, verifyRunInvocationV1 } from './invocation/runInvocationV1';
import { parseLifecycleSmokePreflightConfigV1, runLifecycleSmokeV1 } from './live/lifecycleSmokeRunV1';
import { encodeBuiltRunPlanV1, parseBuiltRunPlanV1, parseRunPlanInputJsonV1 } from './plan/planFileV1';
import { buildRunPlanV1, RunPlanValidationErrorV1 } from './plan/runPlanV1';
import { parseProcessUnitResultV1, ProcessUnitResultLedgerV1 } from './results/processUnitResultLedgerV1';
import { parseSyntheticContractPreflightConfigV1, runSyntheticContractV1 } from './synthetic/syntheticContractRunV1';
import { deriveHardwareCellIdV1 } from './ids/orchestrationIdsV1';
import { createRunnerAuthorityV1 } from './runnerSourceV1';
import { runNoReplaceGitV1 } from './provenance/gitCommandV1';
import { assertWp04SyntheticRouteV1, resolveScenarioRouteV1 } from './scenarios/scenarioDriverRegistryV1';

const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const CANONICAL_ID_V1 = /^[a-z0-9][a-z0-9._-]{0,127}$/;

type CommandV1 = 'plan' | 'run' | 'verify';
export type RunnerExitCodeV1 = 0 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export class CliInputErrorV1 extends TypeError {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CliInputErrorV1';
  }
}

export function assertBundleRunBindingsV1(expectedValidRunIds: readonly string[], actualBundleRunIds: readonly string[]): void {
  const expected = [...expectedValidRunIds].sort();
  const actual = [...actualBundleRunIds].sort();
  if (new Set(actual).size !== actual.length || actual.length !== expected.length || actual.some((runId, index) => runId !== expected[index])) {
    throw new TypeError('Bundle logical-run bindings do not exactly match valid process-unit results.');
  }
}

export function classifyRunnerErrorV1(error: unknown, command: string | undefined): Exclude<RunnerExitCodeV1, 0> {
  const chain: Error[] = [];
  const collect = (value: unknown): void => {
    if (!(value instanceof Error) || chain.includes(value)) return;
    chain.push(value);
    collect(value.cause);
    if (value instanceof AggregateError) for (const nested of value.errors) collect(nested);
  };
  collect(error);
  const message = chain.map(({ message: value }) => value.toLowerCase()).join(' | ');
  const tagged = chain.find((entry): entry is RunnerFailureErrorV1 => entry instanceof RunnerFailureErrorV1);
  if (chain.some((entry) => entry instanceof CliInputErrorV1)) return 2;
  if (chain.some((entry) => entry instanceof RunPlanValidationErrorV1)) return 2;
  if (chain.some((entry) => entry instanceof RunnerFailureErrorV1 && entry.failureCode === 'cleanup-failed')
    || chain.some((entry) => entry instanceof ArtifactCleanupErrorV1 || entry instanceof CleanupGuardErrorV1)
    || (command !== 'verify' && tagged === undefined && /cleanup|ownership|did not terminate|unclear possession/.test(message))) return 8;
  if (tagged !== undefined) {
    if (tagged.failureCode === 'source-preflight-rejected' || tagged.failureCode === 'build-handoff-rejected') return 3;
    if (tagged.failureCode === 'scenario-unavailable' || tagged.failureCode === 'required-metric-producers-unavailable' || tagged.failureCode === 'backend-parity-producers-unavailable') return 7;
    if (tagged.failureCode === 'environment-invalid') return 6;
    if (tagged.failureCode === 'browser-crash' || tagged.failureCode === 'handoff-failed' || tagged.failureCode === 'warmup-not-stable' || tagged.failureCode === 'validation-failed' || tagged.failureCode === 'receipt-failed' || tagged.failureCode === 'operator-abort') return 5;
    return 4;
  }
  if (command === 'verify') return 3;
  if (/cli input|malformed input|expected exactly one command|closed --name value pairs|requires --preflight|slot-index|unknown br03 run mode|missing required/.test(message)) return 2;
  if (/source[- ]preflight|build[- ]handoff|provenance|source[- ](?:sha|tree)|build digest|expected source|fixture[- ](?:contract|semantic)/.test(message)) return 3;
  if (/browser[- ]crash|process[- ]crash|operator[- ]abort|handoff|candidate|receipt|validation-failed|download|telemetry/.test(message)) return 5;
  if (/environment|runtime state|browser argument/.test(message)) return 6;
  if (/scenario unavailable|unsupported|metric-producers-unavailable|capability/.test(message)) return 7;
  return 4;
}

function parseArguments(arguments_: readonly string[]): { readonly command: CommandV1; readonly values: ReadonlyMap<string, string> } {
  const command = arguments_[0];
  if (command !== 'plan' && command !== 'run' && command !== 'verify') throw new CliInputErrorV1('Expected exactly one command: plan, run, or verify.');
  const allowed = new Set(command === 'plan'
    ? ['input', 'output']
    : command === 'run'
      ? ['plan', 'mode', 'slot-index', 'created-utc', 'output-root', 'preflight', 'attempt', 'approval-id', 'replaces-invocation-root']
      : ['plan', 'invocation-root']);
  const values = new Map<string, string>();
  for (let index = 1; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (flag === undefined || value === undefined || value.length === 0 || !flag.startsWith('--') || flag.includes('=') || value.startsWith('--')) {
      throw new CliInputErrorV1('CLI options must use closed --name value pairs.');
    }
    const name = flag.slice(2);
    if (!allowed.has(name) || values.has(name)) throw new CliInputErrorV1(`Unknown or duplicate option: --${name}.`);
    values.set(name, value);
  }
  const required = command === 'plan' ? ['input', 'output'] : command === 'verify' ? ['plan', 'invocation-root'] : ['plan', 'mode', 'slot-index', 'created-utc', 'output-root'];
  if (required.some((name) => !values.has(name))) throw new CliInputErrorV1(`Command ${command} is missing required options.`);
  if (command === 'run') {
    const mode = values.get('mode');
    if (mode !== 'synthetic-contract-v1' && mode !== 'lifecycle-smoke-v1') throw new CliInputErrorV1('Unknown BR03 run mode.');
    if (!values.has('preflight')) throw new CliInputErrorV1('Run modes require --preflight.');
  }
  return { command, values };
}

async function readBounded(path: string): Promise<Uint8Array> {
  let bytes: Uint8Array;
  try {
    bytes = readFileBytesV1(path, { maxFileBytes: MAX_INPUT_BYTES, maxAggregateBytes: MAX_INPUT_BYTES });
  } catch (error) {
    throw new TypeError('CLI input file is missing or outside its size bound.', { cause: error });
  }
  if (bytes.byteLength < 1) throw new TypeError('CLI input file is missing or outside its size bound.');
  return bytes;
}

async function readCliInputV1<T>(path: string, parser: (bytes: Uint8Array) => T): Promise<T> {
  try {
    return parser(await readBounded(path));
  } catch (error) {
    throw new CliInputErrorV1(`CLI input is invalid: ${error instanceof Error ? error.message : 'parse failure'}.`, { cause: error });
  }
}

function samePathV1(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

async function resolveInvocationDirectoryV1(path: string): Promise<string> {
  if ((await lstat(path)).isSymbolicLink()) throw new TypeError('Invocation root must not be a symbolic link.');
  const root = await realpath(path);
  if (!(await lstat(root)).isDirectory()) throw new TypeError('Invocation root must be a real directory.');
  return root;
}

async function assertOwnedInvocationRootV1(projectRoot: string, invocationRoot: string): Promise<void> {
  const expectedResultsRoot = await realpath(join(projectRoot, '.benchmark-results'));
  if (!samePathV1(dirname(invocationRoot), expectedResultsRoot) || !CANONICAL_ID_V1.test(basename(invocationRoot))) {
    throw new TypeError('Invocation root must be a direct canonical child of the runner-owned .benchmark-results root.');
  }
}

async function readInvocationAtRootV1(root: string): Promise<RunInvocationV1> {
  const invocation = parseCanonicalJsonV1(await readBounded(join(root, 'invocation.json'))) as unknown as RunInvocationV1;
  if (invocation.outputRoot !== '<RESULTS>' || basename(root) !== invocation.invocationId) {
    throw new TypeError('Invocation does not match its persisted root identity.');
  }
  return invocation;
}

async function readPredecessorLineageV1(
  currentRoot: string,
  current: RunInvocationV1,
  plan: BuiltRunPlanV1,
  runnerSourceSha: RunInvocationV1['runnerSourceSha'],
): Promise<RunInvocationV1 | undefined> {
  if (current.attempt === 0) return undefined;
  if (!Number.isSafeInteger(current.attempt) || current.attempt < 1 || current.attempt > 1024 || current.rerunOrigin === null) {
    throw new TypeError('Rerun invocation lineage is invalid.');
  }
  if (!CANONICAL_ID_V1.test(current.rerunOrigin.replacesInvocationId)) throw new TypeError('Rerun predecessor ID is not canonical.');
  const expectedRoot = join(dirname(currentRoot), current.rerunOrigin.replacesInvocationId);
  const predecessorRoot = await resolveInvocationDirectoryV1(expectedRoot);
  if (!samePathV1(predecessorRoot, expectedRoot)) throw new TypeError('Rerun predecessor root identity is invalid.');
  const predecessor = await readInvocationAtRootV1(predecessorRoot);
  const earlier = await readPredecessorLineageV1(predecessorRoot, predecessor, plan, runnerSourceSha);
  const issues = verifyRunInvocationV1(plan, predecessor, runnerSourceSha, earlier);
  if (issues.length > 0) throw new TypeError(`Rerun predecessor verification failed: ${issues.join('; ')}`);
  await assertPredecessorTerminalV1(predecessorRoot, plan, predecessor);
  return predecessor;
}

async function assertPredecessorTerminalV1(
  root: string,
  plan: BuiltRunPlanV1,
  invocation: RunInvocationV1,
): Promise<void> {
  const rawResults = parseCanonicalJsonV1(await readBounded(join(root, 'process-unit-results.json')));
  if (!Array.isArray(rawResults)) throw new TypeError('Rerun predecessor process-unit results must be an array.');
  const ledger = new ProcessUnitResultLedgerV1(plan, invocation);
  for (const result of rawResults) ledger.record(parseProcessUnitResultV1(result));
  const results = ledger.finalize();
  const issues = await verifyInvocationControlV1(root, plan, invocation, results);
  const closureIssues = await verifyInvocationClosureV1(root, plan, invocation, results);
  if (issues.length > 0 || closureIssues.length > 0) throw new TypeError(`Rerun predecessor terminal control is invalid: ${[...issues, ...closureIssues].join('; ')}`);
}

async function resolveRepositoryRootV1(cwd: string): Promise<string> {
  const result = runNoReplaceGitV1(['rev-parse', '--show-toplevel'], cwd);
  if (result.status !== 0 || result.error !== undefined || (result.signal !== undefined && result.signal !== null) || result.stderr.byteLength !== 0) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', 'Could not resolve the Git repository root.', { cause: result.error });
  }
  const reportedRoot = new TextDecoder('utf-8', { fatal: true }).decode(result.stdout).trim();
  if (reportedRoot.length === 0) throw new RunnerFailureErrorV1('source-preflight-rejected', 'Could not resolve the Git repository root.', { cause: result.error });
  let realCwd: string;
  let realRoot: string;
  try {
    [realCwd, realRoot] = await Promise.all([realpath(cwd), realpath(reportedRoot)]);
  } catch (error) {
    throw new RunnerFailureErrorV1('source-preflight-rejected', 'The Git repository root could not be resolved.', { cause: error });
  }
  const sameRoot = process.platform === 'win32' ? realCwd.toLowerCase() === realRoot.toLowerCase() || realCwd.toLowerCase().startsWith(`${realRoot.toLowerCase()}\\`) : realCwd === realRoot || realCwd.startsWith(`${realRoot}/`);
  if (!sameRoot) throw new RunnerFailureErrorV1('source-preflight-rejected', 'The current directory is outside the resolved Git repository root.');
  return realRoot;
}

async function writeExclusive(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const pendingPath = join(dirname(path), `.${basename(path)}.${randomUUID()}.pending`);
  const file = await open(pendingPath, 'wx');
  let writeError: unknown;
  try {
    await file.writeFile(bytes);
    await file.sync();
  } catch (error) {
    writeError = error;
    throw error;
  } finally {
    try {
      await boundedFileCleanupV1(Promise.resolve().then(() => file.close()), 'CLI artifact file close');
    } catch (closeError) {
      throw new ArtifactCleanupErrorV1('CLI artifact file close failed.', { cause: writeError === undefined ? closeError : new AggregateError([writeError, closeError], 'CLI artifact write and close failed.') });
    }
  }
  try {
    linkSync(pendingPath, path);
    if (process.platform !== 'win32') {
      const descriptor = openSync(dirname(path), 'r');
      try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
    }
  } catch (error) {
    await boundedFileCleanupV1(unlink(pendingPath), 'CLI staging cleanup');
    throw error;
  }
  await boundedFileCleanupV1(unlink(pendingPath), 'CLI published staging cleanup');
}

async function boundedFileCleanupV1<T>(operation: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  void operation.catch(() => undefined);
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not finish within the cleanup bound.`)), 5_000);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function output(value: unknown): void {
  process.stdout.write(Buffer.from(canonicalizeJsonV1(value)));
  process.stdout.write('\n');
}

function availableValueV1(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const object = value as Record<string, unknown>;
  return object.status === 'observed' || object.status === 'declared' ? object.value : undefined;
}

function assertBundleContextBindingsV1(context: BenchmarkValidationContextV1, plan: Awaited<ReturnType<typeof buildRunPlanV1>>): void {
  const candidate = plan.core.candidates.find(({ id }) => id === context.candidate.id);
  if (context.runPlan.id !== plan.runPlanId || context.runPlan.sha256 !== plan.runPlanSha256
    || context.fixture.id !== plan.core.fixtureContractId
    || availableValueV1(context.fixture.semanticSha256) !== plan.core.fixtureSemanticSha256
    || candidate === undefined
    || availableValueV1(context.candidate.sourceFileSetSha256) !== candidate.sourceFileSetSha256) {
    throw new TypeError('Bundle validation context is not bound to the accepted plan and candidate.');
  }
}

function assertBundleContextDocumentBindingsV1(context: BenchmarkValidationContextV1, document: BenchmarkRunDocumentV1): void {
  if (!canonicalBytesEqualV1(context.candidate, document.source.candidate)) {
    throw new TypeError('Bundle validation context is not bound to the bundle candidate.');
  }
}

export function assertBundleDocumentBindingsV1(
  document: BenchmarkRunDocumentV1,
  plan: Awaited<ReturnType<typeof buildRunPlanV1>>,
  invocation: RunInvocationV1,
): void {
  for (const process of document.browserProcesses) {
    if (process.hardwareCellId !== document.hardwareCellId) throw new TypeError('Bundle browser-process hardware cell binding mismatch.');
    for (const run of process.runs) {
      const unit = plan.core.processUnits.find(({ ids }) => ids.slotId === run.ids.slotId);
      const invocationUnit = invocation.processUnits.find(({ slotId }) => slotId === run.ids.slotId);
      const expectedRun = invocationUnit?.runs.find(({ runId }) => runId === run.runId);
      const candidate = unit === undefined ? undefined : plan.core.candidates.find(({ id }) => id === unit.candidateId);
      const balanceBlock = unit === undefined ? undefined : plan.core.balanceBlocks.find(({ blockId }) => blockId === unit.balanceBlockId);
      const expectedScheme = balanceBlock?.rows.find(({ rowOrdinal }) => rowOrdinal === unit?.rowOrdinal)?.scheme;
      if (unit === undefined || candidate === undefined || expectedRun === undefined
        || expectedScheme === undefined
        || !canonicalBytesEqualV1(process.ids, unit.ids)
        || !canonicalBytesEqualV1(run.ids, unit.ids)
        || run.createdUtc !== invocation.createdUtc
        || run.hardwareCellId !== document.hardwareCellId
        || run.browserProcessId !== unit.ids.browserProcessId
        || run.source.commitSha !== plan.core.expectedSourceCommitSha
        || run.source.build.sha256 !== plan.core.expectedBuildSha256
        || run.source.fixture.id !== plan.core.fixtureContractId
        || availableValueV1(run.source.fixture.semanticSha256) !== plan.core.fixtureSemanticSha256
        || run.source.candidate.id !== candidate.id
        || availableValueV1(run.source.candidate.sourceFileSetSha256) !== candidate.sourceFileSetSha256
        || availableValueV1(run.environment.hardwareProfileId) !== plan.core.hardwareProfileId
        || run.execution.runPlanId !== plan.runPlanId
        || run.execution.runPlanSha256 !== plan.runPlanSha256
        || run.execution.processContainer !== unit.processContainer
        || run.execution.processOrdinal !== unit.processOrdinal
         || run.execution.iteration !== expectedRun.runOrdinal
         || !canonicalBytesEqualV1(run.execution.origin, expectedRun.origin)
         || run.execution.order.scheme !== expectedScheme
        || run.execution.order.orderSeed !== plan.core.orderSeed
        || run.execution.order.blockId !== unit.balanceBlockId
        || run.execution.order.sequencePosition !== unit.sequencePosition
        || run.execution.order.candidateId !== unit.candidateId
        || run.scenario.id !== unit.scenarioId
        || !canonicalBytesEqualV1(run.scenario.parameters, unit.scenarioParameters)
        || run.hardwareCellId !== deriveHardwareCellIdV1({
          candidateId: unit.candidateId,
          hardwareProfileId: plan.core.hardwareProfileId,
          hardwareBindingSha256: plan.core.hardwareBindingSha256,
          fixtureContractId: plan.core.fixtureContractId,
          fixtureSemanticSha256: plan.core.fixtureSemanticSha256,
          expectedSourceCommitSha: plan.core.expectedSourceCommitSha,
          expectedBuildSha256: plan.core.expectedBuildSha256,
          scenarioId: unit.scenarioId as CanonicalIdV1,
        })) {
        throw new TypeError('Bundle run is not bound to its accepted plan, invocation, source, or hardware cell.');
      }
      if (run.execution.phase !== expectedRun.phase || run.iterations.length !== expectedRun.iterationIds.length
        || run.iterations.some(({ iterationId }, index) => iterationId !== expectedRun.iterationIds[index])) {
        throw new TypeError('Bundle run iterations are not bound to its invocation.');
      }
    }
  }
}

function canonicalBytesEqualV1(left: unknown, right: unknown): boolean {
  const leftBytes = canonicalizeJsonV1(left);
  const rightBytes = canonicalizeJsonV1(right);
  return leftBytes.byteLength === rightBytes.byteLength && leftBytes.every((byte, index) => byte === rightBytes[index]);
}

async function planCommand(values: ReadonlyMap<string, string>): Promise<void> {
  const inputPath = values.get('input')!;
  const outputPath = values.get('output')!;
  let input: ReturnType<typeof parseRunPlanInputJsonV1>;
  try {
    input = parseRunPlanInputJsonV1(await readBounded(inputPath));
  } catch (error) {
    throw new CliInputErrorV1(`CLI input plan is invalid: ${error instanceof Error ? error.message : 'parse failure'}.`, { cause: error });
  }
  const plan = buildRunPlanV1(input);
  await writeExclusive(outputPath, encodeBuiltRunPlanV1(plan));
  output({ status: 'planned', runPlanId: plan.runPlanId, runPlanSha256: plan.runPlanSha256, processUnitCount: plan.core.processUnits.length, outputPath });
}

export function assertRunModeCompatibilityV1(mode: string, plan: BuiltRunPlanV1, unit: RunPlanProcessUnitV1): void {
  if (mode === 'synthetic-contract-v1') {
    const backend = unit.scenarioParameters.find(({ key }) => key === 'backend')?.value;
    const values = new Map(unit.scenarioParameters.map(({ key, value }) => [key, value]));
    if (unit.scenarioId !== 'mesh-golden-world-v1'
      || plan.core.fixtureContractId !== 'wp04-golden-world-v1'
      || plan.core.syntheticHardwareProfile !== true
      || plan.core.fixtureSemanticSha256 !== BENCHMARK_WP04_SEMANTIC_SHA256_V1
      || values.get('seed') !== 0x4845_5354
      || backend !== 'three-webgl2'
      || values.get('mesher') !== 'greedy-ao'
      || values.get('chunk-edge') !== 32
      || values.get('worker-count') !== 0) {
      throw new CliInputErrorV1('Synthetic contract mode requires the exact WP04 mesh-golden tuple and a synthetic hardware profile.');
    }
    try {
      assertWp04SyntheticRouteV1(unit.scenarioId, unit.scenarioParameters);
    } catch (error) {
      throw new CliInputErrorV1(`Synthetic contract route is invalid: ${error instanceof Error ? error.message : 'invalid route'}.`, { cause: error });
    }
  } else if (unit.scenarioId !== 'mesh-golden-world-v1') {
    throw new CliInputErrorV1('Lifecycle-smoke mode requires the mesh-golden-world-v1 scenario.');
  } else {
    try {
      const route = resolveScenarioRouteV1(unit.scenarioId, unit.scenarioParameters);
      if (route.status !== 'ready') throw new Error(`Lifecycle-smoke scenario is unavailable: ${route.reasonCode}.`);
    } catch (error) {
      throw new CliInputErrorV1(`Lifecycle-smoke slot parameters are invalid: ${error instanceof Error ? error.message : 'invalid route'}.`, { cause: error });
    }
  }
}

async function runCommand(values: ReadonlyMap<string, string>): Promise<void> {
  const mode = values.get('mode')!;
  const slotValue = values.get('slot-index')!;
  if (!/^(0|[1-9][0-9]*)$/.test(slotValue)) throw new CliInputErrorV1('slot-index must be a canonical non-negative integer.');
  const slotIndex = Number(slotValue);
  if (!Number.isSafeInteger(slotIndex)) throw new CliInputErrorV1('slot-index must be a safe integer.');
  const plan = await readCliInputV1(values.get('plan')!, parseBuiltRunPlanV1);
  const unit = plan.core.processUnits[slotIndex];
  if (unit === undefined || unit.processContainer !== 'cold' || unit.processOrdinal !== 0) {
    throw new CliInputErrorV1('slot-index must select the first cold process of a candidate cell.');
  }
  const attemptValue = values.get('attempt') ?? '0';
  if (!/^(0|[1-9][0-9]*)$/.test(attemptValue) || !Number.isSafeInteger(Number(attemptValue))) {
    throw new CliInputErrorV1('attempt must be a canonical non-negative safe integer.');
  }
  const attempt = Number(attemptValue);
  if (attempt > 1024) throw new CliInputErrorV1('attempt must not exceed 1024.');
  const approvalId = values.get('approval-id');
  if (approvalId !== undefined && !CANONICAL_ID_V1.test(approvalId)) throw new CliInputErrorV1('approval-id must be a canonical ID.');
  const predecessorPath = values.get('replaces-invocation-root');
  if ((attempt === 0 && (approvalId !== undefined || predecessorPath !== undefined))
    || (attempt > 0 && (approvalId === undefined || predecessorPath === undefined))) {
    throw new CliInputErrorV1('Reruns require --attempt, --approval-id and --replaces-invocation-root together; attempt 0 accepts none of them.');
  }
  const createdUtc = values.get('created-utc')!;
  const createdDate = new Date(createdUtc);
  if (!Number.isFinite(createdDate.getTime()) || createdDate.toISOString() !== createdUtc) {
    throw new CliInputErrorV1('created-utc must be a canonical UTC timestamp.');
  }
  const projectRoot = await resolveRepositoryRootV1(process.cwd());
  const authority = await createRunnerAuthorityV1(projectRoot, plan.core.expectedSourceCommitSha);
  let predecessorInvocation: RunInvocationV1 | undefined;
  let rerunOrigin: RunInvocationRerunOriginV1 | undefined;
  if (attempt > 0) {
    let predecessorRoot: string;
    try {
      predecessorRoot = await resolveInvocationDirectoryV1(predecessorPath!);
      await assertOwnedInvocationRootV1(projectRoot, predecessorRoot);
      const resultsRoot = await realpath(values.get('output-root')!);
      if (!samePathV1(resultsRoot, await realpath(join(projectRoot, '.benchmark-results'))) || !samePathV1(dirname(predecessorRoot), resultsRoot)) throw new TypeError('Rerun predecessor must be a direct child of the selected results root.');
      predecessorInvocation = await readInvocationAtRootV1(predecessorRoot);
      const earlier = await readPredecessorLineageV1(predecessorRoot, predecessorInvocation, plan, authority.runnerSourceSha);
      const predecessorIssues = verifyRunInvocationV1(plan, predecessorInvocation, authority.runnerSourceSha, earlier);
      if (predecessorIssues.length > 0) throw new TypeError(predecessorIssues.join('; '));
      await assertPredecessorTerminalV1(predecessorRoot, plan, predecessorInvocation);
    } catch (error) {
      throw new CliInputErrorV1(`Rerun predecessor is invalid: ${error instanceof Error ? error.message : 'invalid predecessor'}.`, { cause: error });
    }
    rerunOrigin = {
      reason: 'infrastructure-failure',
      replacesInvocationId: predecessorInvocation.invocationId,
      approvalId: approvalId as CanonicalIdV1,
    };
  }
  const common = {
    plan,
    slotIndex,
    createdUtc,
    outputRoot: values.get('output-root')!,
    projectRoot,
    runnerAuthority: authority,
    attempt,
    rerunOrigin,
    predecessorInvocation,
  };
  if (mode === 'lifecycle-smoke-v1') {
    let route: ReturnType<typeof resolveScenarioRouteV1>;
    try {
      route = resolveScenarioRouteV1(unit.scenarioId, unit.scenarioParameters);
    } catch (error) {
      throw new CliInputErrorV1(`Lifecycle-smoke slot parameters are invalid: ${error instanceof Error ? error.message : 'invalid route'}.`, { cause: error });
    }
    if (route.status === 'unavailable') {
      const invocation = createRunInvocationV1(plan, {
        createdUtc,
        outputRoot: values.get('output-root')!,
        attempt,
        rerunOrigin,
        predecessorInvocation,
        selectedSlotIds: [unit.ids.slotId],
        runnerSourceSha: authority.runnerSourceSha,
      });
      const invocationRoot = await createInvocationArtifactRootV1(values.get('output-root')!, projectRoot, plan, invocation);
      const ledger = new ProcessUnitResultLedgerV1(plan, invocation);
      ledger.record({
        schemaVersion: 'br03-process-unit-result-v1',
        slotId: unit.ids.slotId,
        browserProcessId: unit.ids.browserProcessId,
        disposition: 'unsupported',
        failureClass: 'unsupported',
        failureCode: 'scenario-unavailable',
        runIds: [],
      });
      const results = ledger.finalize();
      await writeProcessUnitResultsV1(invocationRoot, results);
      await writeInvocationClosureV1(invocationRoot, plan, invocation, results, authority);
      output({ status: 'completed', mode, invocationId: invocation.invocationId, invocationRoot, disposition: 'unsupported' });
      process.exitCode = 7;
      return;
    }
  }
  assertRunModeCompatibilityV1(mode, plan, unit);
  const result = mode === 'synthetic-contract-v1'
    ? await runSyntheticContractV1({ ...common, preflight: await readCliInputV1(values.get('preflight')!, parseSyntheticContractPreflightConfigV1) })
    : await runLifecycleSmokeV1({ ...common, preflight: await readCliInputV1(values.get('preflight')!, parseLifecycleSmokePreflightConfigV1) });
  output({ status: 'completed', mode, ...result });
  if (mode === 'lifecycle-smoke-v1' && 'disposition' in result && result.disposition === 'unsupported'
    && (process.exitCode === undefined || process.exitCode === 0)) process.exitCode = 7;
}

async function verifyCommand(values: ReadonlyMap<string, string>): Promise<void> {
  const plan = await readCliInputV1(values.get('plan')!, parseBuiltRunPlanV1);
  const projectRoot = await resolveRepositoryRootV1(process.cwd());
  const authority = await createRunnerAuthorityV1(projectRoot, plan.core.expectedSourceCommitSha);
  let invocationRoot: string;
  try {
    invocationRoot = await resolveInvocationDirectoryV1(values.get('invocation-root')!);
    await assertOwnedInvocationRootV1(projectRoot, invocationRoot);
  } catch (error) {
    throw new CliInputErrorV1(`CLI invocation input is invalid: ${error instanceof Error ? error.message : 'invalid invocation root'}.`, { cause: error });
  }
  const rootEntries = await readdir(invocationRoot, { withFileTypes: true });
  const expectedRootEntries = new Set(['run-plan.json', 'invocation.json', 'process-unit-results.json', 'invocation-closure.json', 'bundles', 'bundle-contexts', 'lifecycle-smoke', 'failure-diagnostics']);
  if (rootEntries.length !== expectedRootEntries.size || rootEntries.some((entry) => !expectedRootEntries.has(entry.name) || entry.isSymbolicLink())) {
    throw new TypeError('Invocation root contains missing or unexpected entries.');
  }
  const invocation = await readInvocationAtRootV1(invocationRoot);
  const predecessor = await readPredecessorLineageV1(invocationRoot, invocation, plan, authority.runnerSourceSha);
  const invocationIssues = verifyRunInvocationV1(plan, invocation, authority.runnerSourceSha, predecessor);
  if (invocationIssues.length > 0 || basename(invocationRoot) !== invocation.invocationId) throw new TypeError('Invocation does not match its plan or root identity.');
  const rawResults = parseCanonicalJsonV1(await readBounded(join(invocationRoot, 'process-unit-results.json')));
  if (!Array.isArray(rawResults)) throw new TypeError('Process-unit results must be an array.');
  const ledger = new ProcessUnitResultLedgerV1(plan, invocation);
  for (const result of rawResults) ledger.record(parseProcessUnitResultV1(result));
  const results = ledger.finalize();
  const controlIssues = await verifyInvocationControlV1(invocationRoot, plan, invocation, results);
  const lifecycleIssues = await verifyLifecycleSmokeArtifactsV1(invocationRoot, results, { plan, invocation });
  const closureIssues = await verifyInvocationClosureV1(invocationRoot, plan, invocation, results);
  if (controlIssues.length > 0 || lifecycleIssues.length > 0 || closureIssues.length > 0) throw new TypeError(`Invocation control verification failed: ${[...controlIssues, ...lifecycleIssues, ...closureIssues].join('; ')}`);
  const closure = await readInvocationClosureV1(invocationRoot);
  const bundleRoot = join(invocationRoot, 'bundles');
  const contextRoot = join(invocationRoot, 'bundle-contexts');
  const bundleNames = [...new Set(closure.files.filter(({ role }) => role === 'bundle').map(({ path }) => path.split('/')[1]).filter((name): name is string => name !== undefined))].sort();
  const contextNames = closure.files.filter(({ role }) => role === 'bundle-context').map(({ path }) => basename(path)).sort();
  const validRunCount = results.filter(({ disposition }) => disposition === 'valid').reduce((count, result) => count + result.runIds.length, 0);
  if ((validRunCount > 0 && bundleNames.length === 0) || contextNames.length !== bundleNames.length) {
    throw new TypeError('Bundle and validation-context directories do not form a closed set.');
  }
  const verifiedBundles: string[] = [];
  const bundleRunIds: string[] = [];
  for (const bundleName of bundleNames) {
    const contextName = `${bundleName}.json`;
    if (!contextNames.includes(contextName)) throw new TypeError('Bundle validation context is missing.');
    const context = parseCanonicalJsonV1(await readBounded(join(contextRoot, contextName))) as unknown as BenchmarkValidationContextV1;
    assertBundleContextBindingsV1(context, plan);
    const currentBundleRoot = join(bundleRoot, bundleName);
    const bundleManifest = parseCanonicalJsonV1(await readBounded(join(currentBundleRoot, 'bundle-manifest.json'))) as { readonly bundleId?: unknown };
    const document = parseCanonicalJsonV1(await readBounded(join(currentBundleRoot, 'raw', 'hardware-cell.json'))) as BenchmarkRunDocumentV1;
    if (bundleManifest.bundleId !== bundleName || typeof document.hardwareCellId !== 'string'
      || deriveBundleIdV1(invocation.invocationId, document.hardwareCellId as CanonicalIdV1) !== bundleName) {
      throw new TypeError('Bundle identity is not bound to its invocation and hardware cell.');
    }
    assertBundleContextDocumentBindingsV1(context, document);
    assertBundleDocumentBindingsV1(document, plan, invocation);
    const verification = verifyWrittenBundleV1(currentBundleRoot, context);
    if (!verification.valid) throw new TypeError(`Bundle verification failed: ${verification.error ?? 'unknown error'}.`);
    verifiedBundles.push(bundleName);
    bundleRunIds.push(...await readVerifiedBundleRunIdsV1(join(bundleRoot, bundleName)));
  }
  const expectedValidRunIds = results.filter(({ disposition }) => disposition === 'valid').flatMap(({ runIds }) => runIds);
  assertBundleRunBindingsV1(expectedValidRunIds, bundleRunIds);
  verifiedBundles.sort();
  output({ status: 'verified', invocationId: invocation.invocationId, bundleIds: verifiedBundles });
}

async function main(): Promise<void> {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.command === 'plan') await planCommand(parsed.values);
  else if (parsed.command === 'run') await runCommand(parsed.values);
  else await verifyCommand(parsed.values);
}

async function isCurrentModulePathV1(argumentPath: string | undefined): Promise<boolean> {
  if (argumentPath === undefined) return false;
  try {
    const [currentPath, invokedPath] = await Promise.all([
      realpath(fileURLToPath(import.meta.url)),
      realpath(resolve(argumentPath)),
    ]);
    return process.platform === 'win32'
      ? currentPath.toLowerCase() === invokedPath.toLowerCase()
      : currentPath === invokedPath;
  } catch {
    return false;
  }
}

if (await isCurrentModulePathV1(process.argv[1])) {
  try {
    await main();
  } catch (error) {
    const errorLine = `${JSON.stringify({ status: 'error', message: error instanceof Error ? error.message : 'Runner failed.' })}\n`;
    const exitCode = classifyRunnerErrorV1(error, process.argv[2]);
    process.exitCode = exitCode;
    process.stderr.write(errorLine);
  }
}

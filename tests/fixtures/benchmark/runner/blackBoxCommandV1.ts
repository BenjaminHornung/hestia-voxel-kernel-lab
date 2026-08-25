import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, open, realpath, type FileHandle } from 'node:fs/promises';
import { basename, dirname } from 'node:path';

const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const GIT_TIMEOUT_MS = 30_000;
const TREE_KILL_TIMEOUT_MS = 10_000;

export type GateTimeoutOwnerV1 = 'none' | 'inner' | 'outer';

export interface BlackBoxOutcomeV1 {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly pid: number;
  readonly directChildAliveAfter: boolean;
}

export interface BlackBoxControlV1 {
  readonly pid: number;
  signal(signal: NodeJS.Signals): void;
  timeout(): Promise<void>;
}

export interface BlackBoxObservationV1 {
  readonly profiles?: readonly string[];
  readonly ports?: readonly { readonly host: string; readonly port: number; readonly acceptsConnections: boolean }[];
}

export interface BlackBoxCommandOptionsV1 {
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly receiptPath: string;
  readonly classification: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly control?: (control: BlackBoxControlV1) => Promise<void>;
  readonly observeBefore?: () => Promise<BlackBoxObservationV1>;
  readonly observeAfter?: (outcome: BlackBoxOutcomeV1) => Promise<BlackBoxObservationV1>;
  readonly innerTimeout?: (outcome: BlackBoxOutcomeV1) => boolean;
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function bounded(repository: string, command: string, args: readonly string[], timeout = GIT_TIMEOUT_MS): string {
  const result = spawnSync(command, [...args], {
    cwd: repository,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout,
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  if (result.status !== 0 || result.signal !== null || result.error !== undefined || result.stderr !== '') {
    throw new Error(`Bounded ${basename(command)} inspection failed.`);
  }
  return result.stdout;
}

function repositoryState(repository: string) {
  return {
    ref: bounded(repository, 'git', ['--no-replace-objects', 'rev-parse', '--verify', 'HEAD^{commit}']).trim(),
    tree: bounded(repository, 'git', ['--no-replace-objects', 'rev-parse', '--verify', 'HEAD^{tree}']).trim(),
    statusSha256: sha256(bounded(repository, 'git', ['--no-replace-objects', 'status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=none'])),
    ignoredInventorySha256: sha256(bounded(repository, 'git', ['--no-replace-objects', 'status', '--porcelain=v2', '-z', '--ignored=matching', '--untracked-files=all', '--ignore-submodules=none'])),
  };
}

function npmVersion(repository: string): string {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath !== undefined) return bounded(repository, process.execPath, [npmExecPath, '--version']).trim();
  if (process.platform === 'win32') throw new Error('npm CLI path is unavailable.');
  return bounded(repository, 'npm', ['--version']).trim();
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function killTree(pid: number): Promise<void> {
  if (!alive(pid)) return;
  if (process.platform !== 'win32') {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      if (alive(pid)) throw new Error('Owned process group could not be terminated.');
    }
    return;
  }
  const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: TREE_KILL_TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  if (alive(pid) && (result.status !== 0 || result.error !== undefined)) throw new Error('Owned Windows process tree could not be terminated.');
}

function appendBounded(chunks: Buffer[], bytes: number, chunk: Buffer): number | null {
  const nextBytes = bytes + chunk.byteLength;
  if (nextBytes > MAX_OUTPUT_BYTES) return null;
  chunks.push(chunk);
  return nextBytes;
}

export function cleanStatusV1(repository: string): string {
  return bounded(repository, 'git', ['--no-replace-objects', 'status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=none']);
}

export function boundedGitV1(repository: string, args: readonly string[]): string {
  return bounded(repository, 'git', ['--no-replace-objects', ...args]);
}

interface CommandStateV1 {
  timedOut: boolean;
  pid: number | null;
}

async function runBlackBoxCommandCoreV1(options: BlackBoxCommandOptionsV1, receipt: FileHandle, state: CommandStateV1): Promise<BlackBoxOutcomeV1> {
  const cwd = await realpath(options.cwd);
  const before = repositoryState(cwd);
  const observationBefore = await options.observeBefore?.() ?? {};
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let timedOut = false;
  let outputExceeded = false;
  const child = spawn(options.command, [...options.args], {
    cwd,
    detached: true,
    env: options.env ?? process.env,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (child.pid === undefined) throw new Error('Black-box child PID is unavailable.');
  const pid = child.pid;
  state.pid = pid;
  child.stdout!.on('data', (chunk: Buffer) => {
    const nextBytes = appendBounded(stdout, stdoutBytes, chunk);
    if (nextBytes === null) outputExceeded = true;
    else stdoutBytes = nextBytes;
  });
  child.stderr!.on('data', (chunk: Buffer) => {
    const nextBytes = appendBounded(stderr, stderrBytes, chunk);
    if (nextBytes === null) outputExceeded = true;
    else stderrBytes = nextBytes;
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const close = new Promise<{ readonly status: number | null; readonly signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (status, signal) => resolve({ status, signal }));
    timer = setTimeout(() => {
      timedOut = true;
      state.timedOut = true;
      void killTree(pid).catch(reject);
    }, options.timeoutMs);
  });

  const control = options.control?.({
    pid,
    signal(signal) {
      if (process.platform === 'win32') child.kill(signal);
      else process.kill(-pid, signal);
    },
    async timeout() {
      timedOut = true;
      state.timedOut = true;
      await killTree(pid);
    },
  });
  if (control !== undefined) void control.catch(() => killTree(pid).catch(() => undefined));

  let closed: { readonly status: number | null; readonly signal: NodeJS.Signals | null };
  try {
    closed = await close;
    if (control !== undefined) await control;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  if (outputExceeded) {
    await killTree(pid);
    throw new Error('Black-box child exceeded its output bound.');
  }
  const outcome: BlackBoxOutcomeV1 = {
    ...closed,
    stdout: Buffer.concat(stdout).toString('utf8'),
    stderr: Buffer.concat(stderr).toString('utf8'),
    timedOut,
    pid,
    directChildAliveAfter: false,
  };
  const after = repositoryState(cwd);
  let observationAfter: unknown = {};
  let observationFailure: unknown;
  try {
    observationAfter = await options.observeAfter?.(outcome) ?? {};
  } catch (error) {
    observationFailure = error;
    observationAfter = null;
  }
  const timeoutOwner: GateTimeoutOwnerV1 = timedOut ? 'outer' : options.innerTimeout?.(outcome) === true ? 'inner' : 'none';
  await receipt.writeFile(`${JSON.stringify({
    schemaVersion: 'br03-command-receipt-v1',
    label: options.label,
    argv: [options.command, ...options.args],
    cwd: { basename: basename(cwd), sha256: sha256(cwd) },
    repository: { before, after },
    tools: {
      node: process.version,
      git: bounded(cwd, 'git', ['--version']).trim(),
      npm: npmVersion(cwd),
    },
    result: {
      exitCode: outcome.status,
      signal: outcome.signal,
      stdoutSha256: sha256(outcome.stdout),
      stderrSha256: sha256(outcome.stderr),
      timeoutOwner,
      directChildPid: pid,
      directChildAliveAfter: outcome.directChildAliveAfter,
    },
    observations: {
      before: observationBefore,
      after: observationAfter,
      failureSha256: observationFailure === undefined ? null : sha256(observationFailure instanceof Error ? `${observationFailure.name}:${observationFailure.message}` : 'Unknown observation failure'),
    },
    classification: observationFailure === undefined ? options.classification : 'harness-failure',
  }, null, 2)}\n`);
  if (observationFailure !== undefined) throw observationFailure;
  return outcome;
}

export async function runBlackBoxCommandV1(options: BlackBoxCommandOptionsV1): Promise<BlackBoxOutcomeV1> {
  await mkdir(dirname(options.receiptPath), { recursive: true });
  const receipt = await open(options.receiptPath, 'wx');
  const state: CommandStateV1 = { timedOut: false, pid: null };
  try {
    return await runBlackBoxCommandCoreV1(options, receipt, state);
  } catch (error) {
    const message = error instanceof Error ? `${error.name}:${error.message}` : 'Unknown black-box harness failure';
    if ((await receipt.stat()).size === 0) {
      try {
        await receipt.writeFile(`${JSON.stringify({
          schemaVersion: 'br03-command-receipt-v1',
          label: options.label,
          argv: [options.command, ...options.args],
          cwd: { basename: basename(options.cwd), sha256: sha256(options.cwd) },
          repository: { before: null, after: null },
          tools: { node: process.version, git: null, npm: null },
          result: {
            exitCode: null,
            signal: null,
            stdoutSha256: null,
            stderrSha256: null,
            timeoutOwner: state.timedOut ? 'outer' : 'none',
            directChildPid: state.pid,
            directChildAliveAfter: state.pid === null ? null : alive(state.pid),
            harnessFailureSha256: sha256(message),
          },
          observations: { before: null, after: null, failureSha256: null },
          classification: 'harness-failure',
        }, null, 2)}\n`);
      } catch {
        // Preserve the original harness failure; an immutable partial receipt is still failure evidence.
      }
    }
    throw error;
  } finally {
    await receipt.close();
  }
}

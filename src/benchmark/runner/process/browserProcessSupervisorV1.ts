import { createHash } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, realpath, rm } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type BrowserServer, type CDPSession, type Page } from '@playwright/test';
import type { Sha256DigestV1 } from '../../contracts';

type BrowserServerOptionsV1 = NonNullable<Parameters<typeof chromium.launchServer>[0]>;

export interface OwnedBrowserLauncherV1 {
  launchServer(options: BrowserServerOptionsV1): Promise<BrowserServer>;
  connect(wsEndpoint: string): Promise<Browser>;
}

export interface BrowserProcessOptionsV1 {
  readonly ownedResultsRoot: string;
  readonly profileRoot: string;
  readonly channel: string;
  readonly headless: boolean;
  readonly args: readonly string[];
  readonly viewport: { readonly width: number; readonly height: number };
  readonly deviceScaleFactor: number;
}

export interface BrowserProcessHandleV1 {
  readonly context: BrowserContext;
  readonly page: Page;
  readonly cdp: CDPSession | null;
  readonly profilePath: string;
  readonly executableName: string;
  readonly executableSha256: Sha256DigestV1;
  readonly processId: number;
  readonly exitCode: number | null;
  readonly signalCode: string | null;
  assertRunning(): void;
  close(): Promise<void>;
}

export class BrowserStartupCleanupErrorV1 extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'BrowserStartupCleanupErrorV1';
  }
}

export class BrowserInitializationErrorV1 extends Error {
  public constructor(
    cause: unknown,
    public readonly executableName: string | null,
    public readonly executableSha256: Sha256DigestV1 | null,
    public readonly exitCode: number | null,
    public readonly signalCode: string | null,
  ) {
    super('Benchmark browser initialization failed; observed child provenance is attached.', { cause });
    this.name = 'BrowserInitializationErrorV1';
  }
}

const BROWSER_CLOSE_TIMEOUT_MS = 5_000;

async function waitForBrowserDisconnect(browser: Browser): Promise<void> {
  const deadline = Date.now() + BROWSER_CLOSE_TIMEOUT_MS;
  while (browser.isConnected() && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  if (browser.isConnected()) throw new Error('Benchmark browser process did not terminate within the cleanup bound.');
}

async function digestExecutableV1(path: string): Promise<Sha256DigestV1> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return `sha256:${hash.digest('hex')}` as Sha256DigestV1;
}

export async function boundedCleanupV1<T>(operation: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  void operation.catch(() => undefined);
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not finish within the cleanup bound.`)), BROWSER_CLOSE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function closeOwnedBrowser(context: BrowserContext, browser: Browser, server: BrowserServer): Promise<void> {
  const errors: Error[] = [];
  try {
    await boundedCleanupV1(context.close(), 'Benchmark browser context close');
  } catch (error) {
    errors.push(error instanceof Error ? error : new Error('Benchmark browser context close failed.', { cause: error }));
  }
  try {
    await boundedCleanupV1(browser.close(), 'Benchmark browser connection close');
  } catch (error) {
    errors.push(error instanceof Error ? error : new Error('Benchmark browser connection close failed.', { cause: error }));
  }
  try {
    await waitForBrowserDisconnect(browser);
  } catch (error) {
    errors.push(error instanceof Error ? error : new Error('Benchmark browser disconnect was not proven.', { cause: error }));
  }
  try {
    await boundedCleanupV1(server.close(), 'Benchmark browser server close');
  } catch (error) {
    try {
      await boundedCleanupV1(server.kill(), 'Benchmark browser server kill');
    } catch (killError) {
      errors.push(new AggregateError([error, killError], 'Benchmark browser process termination was not proven.'));
    }
  }
  const child = server.process();
  try {
    await waitForExactChildExitV1(child);
  } catch (error) {
    try {
      await boundedCleanupV1(server.kill(), 'Benchmark browser server kill after exit timeout');
      await waitForExactChildExitV1(child);
    } catch (killError) {
      errors.push(new AggregateError([error, killError], 'Benchmark browser process termination was not proven.'));
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, 'Benchmark browser cleanup was not proven complete.');
}

async function waitForExactChildExitV1(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await boundedCleanupV1(new Promise<void>((resolve) => child.once('exit', () => resolve())), 'Exact owned browser child exit');
}

async function killOwnedBrowserServerV1(server: BrowserServer): Promise<void> {
  await boundedCleanupV1(server.kill(), 'Benchmark browser server startup cleanup');
  await waitForExactChildExitV1(server.process());
}

function assertOwnedPath(root: string, candidate: string): void {
  const pathFromRoot = relative(root, candidate);
  if (pathFromRoot.length === 0 || pathFromRoot.startsWith('..') || resolve(root, pathFromRoot) !== resolve(candidate)) {
    throw new Error('Refusing to clean a browser profile outside its owned root or through a symbolic-link alias.');
  }
}

async function realpathWithMissingSuffixV1(path: string): Promise<string> {
  let current = resolve(path);
  const suffix: string[] = [];
  while (true) {
    try {
      const existing = await realpath(current);
      return resolve(existing, ...suffix.reverse());
    } catch (error) {
      const parent = dirname(current);
      if (parent === current) throw error;
      suffix.push(basename(current));
      current = parent;
    }
  }
}

async function assertNoSymlinkParentsV1(path: string, boundary: string): Promise<void> {
  let current = resolve(path);
  const resolvedBoundary = resolve(boundary);
  while (true) {
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Browser profile path contains a symbolic-link or junction alias.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (current === resolvedBoundary) return;
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

export async function cleanupOwnedProfileV1(profilePath: string, ownedResultsRoot: string, label: string): Promise<void> {
  const resolvedRoot = await realpath(ownedResultsRoot);
  const resolvedProfilePath = await realpath(profilePath).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  });
  if (resolvedProfilePath === undefined) return;
  assertOwnedPath(resolvedRoot, resolvedProfilePath);
  await assertNoSymlinkParentsV1(ownedResultsRoot, ownedResultsRoot);
  await assertNoSymlinkParentsV1(profilePath, ownedResultsRoot);
  await boundedCleanupV1(rm(profilePath, { recursive: true, force: true }), label);
}

async function launchServerInOwnedTempRoot(
  launcher: OwnedBrowserLauncherV1,
  root: string,
  options: BrowserServerOptionsV1,
): Promise<BrowserServer> {
  const keys = ['TMPDIR', 'TMP', 'TEMP'] as const;
  const previous = keys.map((key) => process.env[key]);
  try {
    for (const key of keys) process.env[key] = root;
    return await launcher.launchServer(options);
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
}

export async function startBrowserProcessV1(
  options: BrowserProcessOptionsV1,
  launcher: OwnedBrowserLauncherV1 = chromium,
): Promise<BrowserProcessHandleV1> {
  if (!Number.isSafeInteger(options.viewport.width) || options.viewport.width < 1
    || !Number.isSafeInteger(options.viewport.height) || options.viewport.height < 1
    || !Number.isFinite(options.deviceScaleFactor) || options.deviceScaleFactor <= 0) {
    throw new TypeError('Browser viewport is invalid.');
  }
  if (options.args.some((argument) => argument === '--user-data-dir' || argument.startsWith('--user-data-dir='))) {
    throw new TypeError('Browser profile ownership is runner-controlled.');
  }
  const requestedOwnedResultsRoot = resolve(options.ownedResultsRoot);
  const requestedProfileRoot = resolve(options.profileRoot);
  assertOwnedPath(requestedOwnedResultsRoot, requestedProfileRoot);
  const ownedResultsRoot = await realpath(requestedOwnedResultsRoot);
  await assertNoSymlinkParentsV1(requestedOwnedResultsRoot, requestedOwnedResultsRoot);
  await assertNoSymlinkParentsV1(requestedProfileRoot, requestedOwnedResultsRoot);
  const verifiedProfileRoot = await realpathWithMissingSuffixV1(requestedProfileRoot);
  assertOwnedPath(ownedResultsRoot, verifiedProfileRoot);
  await mkdir(requestedProfileRoot, { recursive: true });
  const root = await realpath(requestedProfileRoot);
  assertOwnedPath(ownedResultsRoot, root);
  await assertNoSymlinkParentsV1(requestedProfileRoot, requestedOwnedResultsRoot);
  let server: BrowserServer;
  server = await launchServerInOwnedTempRoot(launcher, root, {
      args: [...options.args, ...(options.args.includes('--enable-automation') ? [] : ['--enable-automation'])],
      channel: options.channel,
      handleSIGHUP: false,
      handleSIGINT: false,
      handleSIGTERM: false,
      headless: options.headless,
  });
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let profilePath: string | null = null;
  const child = server.process();
  let childExited = child.exitCode !== null || child.signalCode !== null;
  if (typeof child.once === 'function') child.once('exit', () => { childExited = true; });
  let executableName: string | null = null;
  let executableSha256: Sha256DigestV1 | null = null;
  try {
    if (!Number.isSafeInteger(child.pid) || child.pid === undefined || child.pid < 1 || child.spawnfile.length === 0) throw new Error('Owned browser child identity is unavailable.');
    const profileArgument = child.spawnargs.find((argument) => argument.startsWith('--user-data-dir='));
    if (profileArgument === undefined) throw new Error('Owned browser profile identity is unavailable.');
    const candidateProfilePath = await realpath(profileArgument.slice('--user-data-dir='.length));
    assertOwnedPath(root, candidateProfilePath);
    profilePath = candidateProfilePath;
    const ownedProfilePath = candidateProfilePath;
    const executablePath = await realpath(child.spawnfile);
    executableName = basename(executablePath);
    executableSha256 = await digestExecutableV1(executablePath);
    browser = await launcher.connect(server.wsEndpoint());
    context = browser.contexts()[0] ?? await browser.newContext({ acceptDownloads: true, deviceScaleFactor: options.deviceScaleFactor, viewport: options.viewport });
    const ownedContext = context;
    const existingPages = ownedContext.pages();
    if (existingPages.length > 1) throw new Error('Persistent benchmark context opened background tabs.');
    let cdp: CDPSession | null = null;
    cdp = await browser.newBrowserCDPSession();
    const page = existingPages[0] ?? await ownedContext.newPage();
    await page.setViewportSize(options.viewport);
       let state: 'running' | 'closing' | 'closed' | 'crashed' = childExited ? 'crashed' : 'running';
      page.on('crash', () => { state = 'crashed'; });
      ownedContext.on('close', () => { state = state === 'closing' ? 'closed' : 'crashed'; });
       if (typeof child.once === 'function') child.once('exit', () => { if (state === 'running') state = 'crashed'; });
    let closePromise: Promise<void> | null = null;
    return {
      context: ownedContext,
      page,
      cdp,
      profilePath: ownedProfilePath,
      executableName,
      executableSha256,
      processId: child.pid,
      get exitCode() { return child.exitCode; },
      get signalCode() { return child.signalCode; },
       assertRunning: () => {
         if (child.exitCode !== null || child.signalCode !== null) state = state === 'running' ? 'crashed' : state;
         if (state !== 'running') throw new Error(`Benchmark browser process is ${state}.`);
      },
      close: () => {
        if (closePromise !== null) return closePromise;
        closePromise = (async () => {
           if (state === 'closed') return;
           const crashed = state === 'crashed';
           state = 'closing';
           let closeError: unknown;
           try {
             await closeOwnedBrowser(ownedContext, browser!, server);
           } catch (error) {
             closeError = error;
           } finally {
             state = crashed || child.exitCode !== null || child.signalCode !== null ? 'crashed' : 'closed';
           }
            if (closeError === undefined || childExited || child.exitCode !== null || child.signalCode !== null) {
             assertOwnedPath(root, ownedProfilePath);
             await cleanupOwnedProfileV1(ownedProfilePath, ownedResultsRoot, 'Benchmark browser profile cleanup');
           }
           if (closeError !== undefined) throw closeError;
        })();
        return closePromise;
      },
    };
  } catch (error) {
    const initializationError = () => new BrowserInitializationErrorV1(error, executableName, executableSha256, child.exitCode, child.signalCode);
    try {
      if (context !== null && browser !== null) await closeOwnedBrowser(context, browser, server);
      else await killOwnedBrowserServerV1(server);
    } catch (cleanupError) {
      throw new BrowserStartupCleanupErrorV1('Benchmark browser initialization and cleanup failed.', { cause: new AggregateError([initializationError(), cleanupError], 'Benchmark browser initialization and cleanup failed.') });
    }
    if (profilePath !== null) {
      try {
        assertOwnedPath(root, profilePath);
        await cleanupOwnedProfileV1(profilePath, ownedResultsRoot, 'Benchmark browser profile cleanup');
      } catch (cleanupError) {
        throw new BrowserStartupCleanupErrorV1('Benchmark browser profile cleanup failed.', { cause: new AggregateError([initializationError(), cleanupError], 'Benchmark browser profile cleanup failed.') });
      }
    }
    throw initializationError();
  }
}

export async function withBrowserProcessV1<T>(
  options: BrowserProcessOptionsV1,
  operation: (handle: BrowserProcessHandleV1) => Promise<T>,
  launcher: OwnedBrowserLauncherV1 = chromium,
): Promise<T> {
  const handle = await startBrowserProcessV1(options, launcher);
  let operationError: unknown;
  try {
    return await operation(handle);
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      await handle.close();
    } catch (cleanupError) {
      if (operationError !== undefined) throw new AggregateError([operationError, cleanupError], 'Browser operation and cleanup both failed.');
      throw cleanupError;
    }
  }
}

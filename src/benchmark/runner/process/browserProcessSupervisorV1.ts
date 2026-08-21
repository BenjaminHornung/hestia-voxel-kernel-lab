import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from '@playwright/test';

type PersistentContextOptionsV1 = NonNullable<Parameters<typeof chromium.launchPersistentContext>[1]>;

export interface PersistentContextLauncherV1 {
  launchPersistentContext(userDataDir: string, options: PersistentContextOptionsV1): Promise<BrowserContext>;
}

export interface BrowserProcessOptionsV1 {
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
  assertRunning(): void;
  close(): Promise<void>;
}

export class BrowserStartupCleanupErrorV1 extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'BrowserStartupCleanupErrorV1';
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

async function closeOwnedBrowser(context: BrowserContext, browser: Browser | null): Promise<void> {
  const errors: Error[] = [];
  try {
    await boundedCleanupV1(context.close(), 'Benchmark browser context close');
  } catch (error) {
    errors.push(error instanceof Error ? error : new Error('Benchmark browser context close failed.', { cause: error }));
  }
  if (browser === null) {
    errors.push(new Error('Owned browser process handle is unavailable; profile cleanup is not proven safe.'));
  } else {
    try {
      await boundedCleanupV1(browser.close(), 'Benchmark browser close');
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error('Benchmark browser close failed.', { cause: error }));
    }
    try {
      await waitForBrowserDisconnect(browser);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error('Benchmark browser disconnect was not proven.', { cause: error }));
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, 'Benchmark browser cleanup was not proven complete.');
}

function assertOwnedPath(root: string, candidate: string): void {
  const pathFromRoot = relative(root, candidate);
  if (pathFromRoot.length === 0 || pathFromRoot.startsWith('..') || resolve(root, pathFromRoot) !== resolve(candidate)) {
    throw new Error('Refusing to clean a browser profile outside its owned root.');
  }
}

export async function startBrowserProcessV1(
  options: BrowserProcessOptionsV1,
  launcher: PersistentContextLauncherV1 = chromium,
): Promise<BrowserProcessHandleV1> {
  if (!Number.isSafeInteger(options.viewport.width) || options.viewport.width < 1
    || !Number.isSafeInteger(options.viewport.height) || options.viewport.height < 1
    || !Number.isFinite(options.deviceScaleFactor) || options.deviceScaleFactor <= 0) {
    throw new TypeError('Browser viewport is invalid.');
  }
  await mkdir(options.profileRoot, { recursive: true });
  const root = await realpath(options.profileRoot);
  const profilePath = await mkdtemp(join(root, 'br03-profile-'));
  assertOwnedPath(root, profilePath);
  let context: BrowserContext;
  try {
    context = await launcher.launchPersistentContext(profilePath, {
      acceptDownloads: true,
      args: options.args.includes('--enable-automation') ? [...options.args] : [...options.args, '--enable-automation'],
      channel: options.channel,
      deviceScaleFactor: options.deviceScaleFactor,
      headless: options.headless,
      viewport: options.viewport,
    });
  } catch (error) {
    try {
      await boundedCleanupV1(rm(profilePath, { recursive: true, force: true }), 'Benchmark browser profile cleanup');
    } catch (cleanupError) {
      throw new BrowserStartupCleanupErrorV1('Benchmark browser launch and profile cleanup failed.', { cause: new AggregateError([error, cleanupError], 'Benchmark browser launch and profile cleanup failed.') });
    }
    throw error;
  }
  let browser: Browser | null = null;
  try {
    browser = typeof context.browser === 'function' ? context.browser() : null;
    const existingPages = context.pages();
    if (existingPages.length > 1) throw new Error('Persistent benchmark context opened background tabs.');
    let cdp: CDPSession | null = null;
    cdp = browser === null ? null : await browser.newBrowserCDPSession();
    const page = existingPages[0] ?? await context.newPage();
    let state: 'running' | 'closing' | 'closed' | 'crashed' = 'running';
    page.on('crash', () => { state = 'crashed'; });
    context.on('close', () => { state = state === 'closing' ? 'closed' : 'crashed'; });
    let closePromise: Promise<void> | null = null;
    return {
      context,
      page,
      cdp,
      profilePath,
      assertRunning: () => {
        if (state !== 'running') throw new Error(`Benchmark browser process is ${state}.`);
      },
      close: () => {
        if (closePromise !== null) return closePromise;
        closePromise = (async () => {
          if (state === 'closed') return;
          const crashed = state === 'crashed';
          state = 'closing';
          try {
            await closeOwnedBrowser(context, browser);
          } finally {
            state = crashed ? 'crashed' : 'closed';
          }
          assertOwnedPath(root, profilePath);
          await boundedCleanupV1(rm(profilePath, { recursive: true, force: true }), 'Benchmark browser profile cleanup');
        })();
        return closePromise;
      },
    };
  } catch (error) {
    try {
      await closeOwnedBrowser(context, browser);
    } catch (cleanupError) {
      throw new BrowserStartupCleanupErrorV1('Benchmark browser initialization and cleanup failed.', { cause: new AggregateError([error, cleanupError], 'Benchmark browser initialization and cleanup failed.') });
    }
    try {
      await boundedCleanupV1(rm(profilePath, { recursive: true, force: true }), 'Benchmark browser profile cleanup');
    } catch (cleanupError) {
      throw new BrowserStartupCleanupErrorV1('Benchmark browser profile cleanup failed.', { cause: new AggregateError([error, cleanupError], 'Benchmark browser profile cleanup failed.') });
    }
    throw error;
  }
}

export async function withBrowserProcessV1<T>(
  options: BrowserProcessOptionsV1,
  operation: (handle: BrowserProcessHandleV1) => Promise<T>,
  launcher: PersistentContextLauncherV1 = chromium,
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

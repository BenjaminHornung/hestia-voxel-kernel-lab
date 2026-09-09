import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, BrowserContext, BrowserServer, Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { sha256BytesV1 } from '../../../../src/benchmark/provenance';
import { BrowserInitializationErrorV1, BrowserStartupCleanupErrorV1, cleanupOwnedProfileV1, startBrowserProcessV1, type OwnedBrowserLauncherV1 } from '../../../../src/benchmark/runner/process/browserProcessSupervisorV1';
import { CleanupGuardV1 } from '../../../../src/benchmark/runner/process/cleanupGuardV1';
import { startPreviewServerV1, type PreviewFactoryV1 } from '../../../../src/benchmark/runner/process/previewServerSupervisorV1';

describe('BR03 cleanup and preview supervision v1', () => {
  it('cleans only registered handles in reverse order and reports every failure', async () => {
    const order: string[] = [];
    const guard = new CleanupGuardV1();
    guard.register('first', () => { order.push('first'); });
    guard.register('second', () => { order.push('second'); throw new Error('failed'); });
    await expect(guard.close()).rejects.toThrow(/owned resources/);
    expect(order).toEqual(['second', 'first']);
    await expect(guard.close()).rejects.toThrow(/owned resources/);
  });

  it('binds preview to an exclusive loopback port, health-checks, and closes its owned server', async () => {
    const listeners = new Map<string, (...arguments_: never[]) => void>();
    const close = vi.fn((callback: (error?: Error) => void) => { listeners.get('close')?.(); callback(); });
    const factory: PreviewFactoryV1 = vi.fn(async (config) => {
      expect(config.preview).toEqual({ host: '127.0.0.1', port: 0, strictPort: true });
      return { httpServer: {
        address: () => ({ port: 43210 }),
        close,
        on: (event: 'close' | 'error', listener: (...arguments_: never[]) => void) => listeners.set(event, listener),
      } };
    });
    const fetchImplementation = vi.fn(async () => new Response('ok')) as unknown as typeof fetch;
    const expectedHealthSha256 = sha256BytesV1(new TextEncoder().encode('ok'));
    const handle = await startPreviewServerV1({ projectRoot: 'project', buildRoot: 'dist', expectedHealthSha256 }, factory, fetchImplementation);
    expect(handle.baseUrl).toBe('http://127.0.0.1:43210');
    expect(handle).toMatchObject({ host: '127.0.0.1', port: 43210, healthSha256: expectedHealthSha256 });
    await handle.assertHealthy();
    await handle.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it('removes only SIGTERM listeners installed by the preview factory', async () => {
    const before = process.rawListeners('SIGTERM');
    const stdinBefore = process.stdin.rawListeners('end');
    const existing = vi.fn();
    const existingStdin = vi.fn();
    function parentSigtermCallback() {}
    const unrelated = vi.fn();
    process.on('SIGTERM', existing);
    process.stdin.on('end', existingStdin);
    const close = vi.fn((callback: (error?: Error) => void) => callback());
    const factory: PreviewFactoryV1 = async () => {
      process.once('SIGTERM', parentSigtermCallback);
      process.stdin.on('end', parentSigtermCallback);
      process.on('SIGTERM', unrelated);
      return { httpServer: { address: () => ({ port: 43210 }), close, on: () => undefined } };
    };
    try {
      const handle = await startPreviewServerV1(
        { projectRoot: 'project', buildRoot: 'dist', expectedHealthSha256: sha256BytesV1(new TextEncoder().encode('ok')) },
        factory,
        vi.fn(async () => new Response('ok')) as unknown as typeof fetch,
      );
      expect(process.rawListeners('SIGTERM')).toEqual([...before, existing, unrelated]);
      expect(process.stdin.rawListeners('end')).toEqual([...stdinBefore, existingStdin]);
      await handle.close();
    } finally {
      process.removeListener('SIGTERM', existing);
      process.removeListener('SIGTERM', parentSigtermCallback);
      process.removeListener('SIGTERM', unrelated);
      process.stdin.removeListener('end', existingStdin);
      process.stdin.removeListener('end', parentSigtermCallback);
    }
  });

  it('removes a preview SIGTERM listener when preview startup rejects', async () => {
    const before = process.rawListeners('SIGTERM');
    function parentSigtermCallback() {}
    const factory: PreviewFactoryV1 = async () => {
      process.once('SIGTERM', parentSigtermCallback);
      throw new Error('preview failed');
    };
    try {
      await expect(startPreviewServerV1(
        { projectRoot: 'project', buildRoot: 'dist', expectedHealthSha256: sha256BytesV1(new TextEncoder().encode('ok')) },
        factory,
      )).rejects.toThrow(/preview failed/);
      expect(process.rawListeners('SIGTERM')).toEqual(before);
    } finally {
      process.removeListener('SIGTERM', parentSigtermCallback);
    }
  });

  it('fails closed when preview health is not successful', async () => {
    const close = vi.fn((callback: (error?: Error) => void) => callback());
    const factory: PreviewFactoryV1 = async () => ({ httpServer: {
      address: () => ({ port: 43210 }), close, on: () => undefined,
    } });
    await expect(startPreviewServerV1(
      { projectRoot: 'project', buildRoot: 'dist', expectedHealthSha256: sha256BytesV1(new TextEncoder().encode('ok')) },
      factory,
      vi.fn(async () => new Response('no', { status: 503 })) as unknown as typeof fetch,
    )).rejects.toThrow(/HTTP 503/);
    expect(close).toHaveBeenCalledOnce();
  });

  it('fails closed when preview returns 200 with the wrong build marker', async () => {
    const close = vi.fn((callback: (error?: Error) => void) => callback());
    const factory: PreviewFactoryV1 = async () => ({ httpServer: {
      address: () => ({ port: 43210 }), close, on: () => undefined,
    } });
    await expect(startPreviewServerV1(
      { projectRoot: 'project', buildRoot: 'dist', expectedHealthSha256: sha256BytesV1(new TextEncoder().encode('expected')) },
      factory,
      vi.fn(async () => new Response('different')) as unknown as typeof fetch,
    )).rejects.toThrow(/build marker/);
    expect(close).toHaveBeenCalledOnce();
  });

  it('times out a hanging preview body, aborts, and closes its owned server', async () => {
    const listeners = new Map<string, (...arguments_: never[]) => void>();
    const close = vi.fn((callback: (error?: Error) => void) => { listeners.get('close')?.(); callback(); });
    const factory: PreviewFactoryV1 = async () => ({ httpServer: {
      address: () => ({ port: 43210 }),
      close,
      on: (event: 'close' | 'error', listener: (...arguments_: never[]) => void) => listeners.set(event, listener),
    } });
    let observedSignal: AbortSignal | undefined;
    const fetchImplementation = vi.fn(async (_url: unknown, init?: { readonly signal?: AbortSignal }) => {
      observedSignal = init?.signal;
      return { ok: true, status: 200, arrayBuffer: () => new Promise<ArrayBuffer>(() => {}) } as unknown as Response;
    }) as unknown as typeof fetch;
    await expect(startPreviewServerV1(
      { projectRoot: 'project', buildRoot: 'dist', expectedHealthSha256: sha256BytesV1(new TextEncoder().encode('ok')) },
      factory,
      fetchImplementation,
    )).rejects.toThrow(/timed out/);
    expect(observedSignal?.aborted).toBe(true);
    expect(close).toHaveBeenCalledOnce();
  }, 15_000);

  it('rejects an oversized preview body without hashing and closes its owned server', async () => {
    const close = vi.fn((callback: (error?: Error) => void) => callback());
    const factory: PreviewFactoryV1 = async () => ({ httpServer: {
      address: () => ({ port: 43210 }), close, on: () => undefined,
    } });
    await expect(startPreviewServerV1(
      { projectRoot: 'project', buildRoot: 'dist', expectedHealthSha256: sha256BytesV1(new TextEncoder().encode('ok')) },
      factory,
      vi.fn(async () => new Response('x'.repeat(2 * 1024 * 1024))) as unknown as typeof fetch,
    )).rejects.toThrow(/size bound/);
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('BR03 persistent browser profile supervision v1', () => {
  it('rejects a static profile parent alias before creating an external child', async () => {
    const root = await mkdtemp(join(tmpdir(), 'br03-profile-parent-alias-'));
    const external = await mkdtemp(join(tmpdir(), 'br03-profile-parent-external-'));
    const profileParent = join(root, 'profiles');
    try {
      try {
        await symlink(external, profileParent, process.platform === 'win32' ? 'junction' : 'dir');
      } catch (error) {
        const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
        if (['EACCES', 'EPERM', 'ENOTSUP', 'UNKNOWN'].includes(code ?? '')) return;
        throw error;
      }
      await writeFile(join(external, 'sentinel'), 'keep');
      const launcher: OwnedBrowserLauncherV1 = {
        launchServer: vi.fn(async () => { throw new Error('must not launch'); }),
        connect: async () => { throw new Error('must not connect'); },
      };
      await expect(startBrowserProcessV1({
        ownedResultsRoot: root,
        profileRoot: join(profileParent, 'invocation'),
        channel: 'chromium',
        headless: true,
        args: [],
        viewport: { width: 1, height: 1 },
        deviceScaleFactor: 1,
      }, launcher)).rejects.toThrow(/symbolic-link|junction/);
      expect(launcher.launchServer).not.toHaveBeenCalled();
      expect(await readdir(external)).toEqual(['sentinel']);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(external, { recursive: true, force: true });
    }
  });

  it('refuses cleanup through a static profile parent alias', async () => {
    const root = await mkdtemp(join(tmpdir(), 'br03-profile-cleanup-alias-'));
    const external = await mkdtemp(join(tmpdir(), 'br03-profile-cleanup-external-'));
    const profileParent = join(root, 'profiles');
    try {
      try {
        await symlink(external, profileParent, process.platform === 'win32' ? 'junction' : 'dir');
      } catch (error) {
        const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
        if (['EACCES', 'EPERM', 'ENOTSUP', 'UNKNOWN'].includes(code ?? '')) return;
        throw error;
      }
      await mkdir(join(external, 'invocation'), { recursive: true });
      await writeFile(join(external, 'sentinel'), 'keep');
      await expect(cleanupOwnedProfileV1(join(profileParent, 'invocation'), root, 'profile cleanup')).rejects.toThrow(/symbolic-link|junction|owned root/);
      expect(await readdir(external)).toEqual(expect.arrayContaining(['invocation', 'sentinel']));
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(external, { recursive: true, force: true });
    }
  });

  it('retains observed initialization provenance when startup cleanup also fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'br03-startup-cleanup-'));
    const child = { pid: 1234, spawnfile: process.execPath, spawnargs: [] as string[], exitCode: null as number | null, signalCode: null };
    const server = { process: () => child, wsEndpoint: () => 'ws://127.0.0.1/owned', kill: async () => { throw new Error('kill failed'); } } as unknown as BrowserServer;
    let profilePath = '';
    const launcher: OwnedBrowserLauncherV1 = {
      launchServer: async () => {
        profilePath = await mkdtemp(join(process.env.TEMP!, 'playwright_chromiumdev_profile-'));
        await writeFile(join(profilePath, 'sentinel'), 'retain');
        child.spawnargs = [process.execPath, `--user-data-dir=${profilePath}`];
        return server;
      },
      connect: async () => { throw new Error('connect failed'); },
    };
    try {
      const error = await startBrowserProcessV1({ ownedResultsRoot: root, profileRoot: join(root, 'profiles'), channel: 'chromium', headless: true, args: [], viewport: { width: 1, height: 1 }, deviceScaleFactor: 1 }, launcher).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(BrowserStartupCleanupErrorV1);
      const aggregate = (error as Error).cause as AggregateError;
      expect(aggregate.errors.some((entry) => entry instanceof BrowserInitializationErrorV1
        && entry.executableName === (process.platform === 'win32' ? 'node.exe' : 'node'))).toBe(true);
      expect(await readdir(profilePath)).toEqual(['sentinel']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('never deletes a launcher-reported profile outside the owned results root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'br03-owned-results-'));
    const external = await mkdtemp(join(tmpdir(), 'br03-external-profile-'));
    await writeFile(join(external, 'sentinel'), 'keep');
    const child = { pid: 1234, spawnfile: process.execPath, spawnargs: [process.execPath, `--user-data-dir=${external}`], exitCode: null as number | null, signalCode: null };
    const server = { process: () => child, wsEndpoint: () => 'ws://127.0.0.1/owned', close: async () => { child.exitCode = 0; }, kill: async () => { child.exitCode = 1; } } as unknown as BrowserServer;
    const launcher: OwnedBrowserLauncherV1 = { launchServer: async () => server, connect: async () => { throw new Error('must not connect'); } };
    try {
      await expect(startBrowserProcessV1({ ownedResultsRoot: root, profileRoot: join(root, 'profiles'), channel: 'chromium', headless: true, args: [], viewport: { width: 1, height: 1 }, deviceScaleFactor: 1 }, launcher)).rejects.toBeInstanceOf(BrowserInitializationErrorV1);
      expect(await readdir(external)).toEqual(['sentinel']);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(external, { recursive: true, force: true });
    }
  });

  it('uses a unique empty profile per process and removes only that profile after context close', async () => {
    const root = await mkdtemp(join(tmpdir(), 'br03-browser-test-'));
    const events = new Map<string, () => void>();
    const closeOrder: string[] = [];
    const page = { on: vi.fn(), setViewportSize: vi.fn(async () => undefined) } as unknown as Page;
    let connected = true;
    const context = {
      pages: () => [page],
      newPage: async () => page,
      on: (event: string, listener: () => void) => { events.set(event, listener); },
      close: async () => { closeOrder.push('context'); events.get('close')?.(); },
    } as unknown as BrowserContext;
    const profiles: string[] = [];
    const child = { pid: 1234, spawnfile: process.execPath, spawnargs: [] as string[], exitCode: null as number | null, signalCode: null };
    const server = {
      process: () => child,
      wsEndpoint: () => 'ws://127.0.0.1/owned',
      close: async () => { child.exitCode = 0; },
      kill: async () => { child.exitCode = 1; },
    } as unknown as BrowserServer;
    const browser = {
      contexts: () => [context],
      isConnected: () => connected,
      close: async () => { closeOrder.push('browser'); connected = false; },
      newBrowserCDPSession: async () => ({ send: async () => ({}) }),
    } as unknown as Browser;
    const launcher: OwnedBrowserLauncherV1 = {
      launchServer: async (launchOptions) => {
        expect(launchOptions.args?.some((argument) => argument.startsWith('--user-data-dir='))).toBe(false);
        const profilePath = await mkdtemp(join(process.env.TEMP!, 'playwright_chromiumdev_profile-'));
        child.spawnargs = [process.execPath, `--user-data-dir=${profilePath}`];
        profiles.push(profilePath);
        expect(await readdir(profilePath)).toEqual([]);
        child.exitCode = null;
        connected = true;
        return server;
      },
      connect: async () => browser,
    };
    try {
      await expect(startBrowserProcessV1({ ownedResultsRoot: root, profileRoot: join(root, '..', 'outside'), channel: 'chromium', headless: true, args: [], viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 }, launcher)).rejects.toThrow(/outside its owned root/);
      const profileRoot = join(root, 'profiles');
      const first = await startBrowserProcessV1({ ownedResultsRoot: root, profileRoot, channel: 'chromium', headless: true, args: [], viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 }, launcher);
      await first.close();
      expect(await readdir(profileRoot)).toEqual([]);
      const second = await startBrowserProcessV1({ ownedResultsRoot: root, profileRoot, channel: 'chromium', headless: true, args: [], viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 }, launcher);
      await second.close();
      expect(profiles[0]).not.toBe(profiles[1]);
      expect(closeOrder).toEqual(['context', 'browser', 'context', 'browser']);
      expect(await readdir(profileRoot)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

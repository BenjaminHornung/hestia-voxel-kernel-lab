import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { startBrowserProcessV1, type PersistentContextLauncherV1 } from '../../../../src/benchmark/runner/process/browserProcessSupervisorV1';
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
    const handle = await startPreviewServerV1({ projectRoot: 'project', buildRoot: 'dist' }, factory, fetchImplementation);
    expect(handle.baseUrl).toBe('http://127.0.0.1:43210');
    await handle.assertHealthy();
    await handle.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it('fails closed when preview health is not successful', async () => {
    const close = vi.fn((callback: (error?: Error) => void) => callback());
    const factory: PreviewFactoryV1 = async () => ({ httpServer: {
      address: () => ({ port: 43210 }), close, on: () => undefined,
    } });
    await expect(startPreviewServerV1(
      { projectRoot: 'project', buildRoot: 'dist' },
      factory,
      vi.fn(async () => new Response('no', { status: 503 })) as unknown as typeof fetch,
    )).rejects.toThrow(/HTTP 503/);
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('BR03 persistent browser profile supervision v1', () => {
  it('uses a unique empty profile per process and removes only that profile after context close', async () => {
    const root = await mkdtemp(join(tmpdir(), 'br03-browser-test-'));
    const events = new Map<string, () => void>();
    const closeOrder: string[] = [];
    const page = { on: vi.fn() } as unknown as Page;
    let connected = true;
    const context = {
      pages: () => [page],
      newPage: async () => page,
      on: (event: string, listener: () => void) => { events.set(event, listener); },
      close: async () => { closeOrder.push('context'); events.get('close')?.(); },
      browser: () => ({
        isConnected: () => connected,
        close: async () => { closeOrder.push('browser'); connected = false; },
        newBrowserCDPSession: async () => ({ send: async () => ({}) }),
      }),
    } as unknown as BrowserContext;
    const profiles: string[] = [];
    const launcher: PersistentContextLauncherV1 = {
      launchPersistentContext: async (profilePath) => { profiles.push(profilePath); expect(await readdir(profilePath)).toEqual([]); return context; },
    };
    try {
      const first = await startBrowserProcessV1({ profileRoot: root, channel: 'chromium', headless: true, args: [], viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 }, launcher);
      await first.close();
      expect(await readdir(root)).toEqual([]);
      const second = await startBrowserProcessV1({ profileRoot: root, channel: 'chromium', headless: true, args: [], viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 }, launcher);
      await second.close();
      expect(profiles[0]).not.toBe(profiles[1]);
      expect(closeOrder).toEqual(['context', 'browser', 'context', 'browser']);
      expect(await readdir(root)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

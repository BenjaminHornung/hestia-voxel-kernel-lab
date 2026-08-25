import { preview } from 'vite';
import type { Sha256DigestV1 } from '../../contracts';
import { sha256BytesV1 } from '../../provenance';

interface PreviewHttpServerV1 {
  address(): string | { readonly port: number } | null;
  close(callback: (error?: Error) => void): void;
  closeAllConnections?(): void;
  on(event: 'close', listener: () => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

interface PreviewServerV1 {
  readonly httpServer: PreviewHttpServerV1;
}

const PREVIEW_CLOSE_TIMEOUT_MS = 5_000;

export class PreviewStartupCleanupErrorV1 extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PreviewStartupCleanupErrorV1';
  }
}

export class PreviewHealthMismatchErrorV1 extends Error {
  public constructor(
    public readonly expectedSha256: Sha256DigestV1,
    public readonly observedSha256: Sha256DigestV1,
  ) {
    super('Benchmark preview health body does not match the expected verified build marker.');
    this.name = 'PreviewHealthMismatchErrorV1';
  }
}

async function bounded<T>(operation: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  void operation.catch(() => undefined);
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not finish within the cleanup bound.`)), PREVIEW_CLOSE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export type PreviewFactoryV1 = (config: {
  readonly root: string;
  readonly configFile: false;
  readonly logLevel: 'silent';
  readonly build: { readonly outDir: string };
  readonly preview: { readonly host: '127.0.0.1'; readonly port: 0; readonly strictPort: true };
}) => Promise<PreviewServerV1>;

export interface PreviewServerOptionsV1 {
  readonly projectRoot: string;
  readonly buildRoot: string;
  readonly healthPath?: string;
  readonly expectedHealthSha256: Sha256DigestV1;
}

export interface PreviewServerHandleV1 {
  readonly baseUrl: string;
  readonly host: '127.0.0.1';
  readonly port: number;
  readonly healthSha256: Sha256DigestV1;
  readonly failure: Promise<never>;
  assertHealthy(): Promise<void>;
  close(): Promise<void>;
}

async function closeServer(server: PreviewServerV1, isClosed: () => boolean = () => false): Promise<void> {
  if (isClosed()) return;
  const closeOperation = new Promise<void>((resolve, reject) => server.httpServer.close((error) => error === undefined ? resolve() : reject(error)));
  try {
    server.httpServer.closeAllConnections?.();
  } catch (error) {
    if (isClosed()) return;
    void bounded(closeOperation, 'Benchmark preview close').catch(() => undefined);
    throw new Error('Benchmark preview close-all-connections failed.', { cause: error });
  }
  try {
    await bounded(closeOperation, 'Benchmark preview close');
  } catch (error) {
    if (isClosed()) return;
    throw error;
  }
}

export async function startPreviewServerV1(
  options: PreviewServerOptionsV1,
  previewFactory: PreviewFactoryV1 = preview as unknown as PreviewFactoryV1,
  fetchImplementation: typeof fetch = fetch,
): Promise<PreviewServerHandleV1> {
  const server = await previewFactory({
    root: options.projectRoot,
    configFile: false,
    logLevel: 'silent',
    build: { outDir: options.buildRoot },
    preview: { host: '127.0.0.1', port: 0, strictPort: true },
  });
  const address = server.httpServer.address();
  if (address === null || typeof address === 'string' || !Number.isSafeInteger(address.port) || address.port < 1) {
    try {
      await closeServer(server);
    } catch (cleanupError) {
      throw new PreviewStartupCleanupErrorV1('Benchmark preview startup and cleanup failed.', { cause: cleanupError });
    }
    throw new Error('Benchmark preview did not expose an exclusive TCP port.');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  let state: 'running' | 'closing' | 'closed' | 'failed' = 'running';
  let failure: Error | null = null;
  let rejectFailure: ((error: Error) => void) | undefined;
  const failureSignal = new Promise<never>((_, reject) => { rejectFailure = reject; });
  void failureSignal.catch(() => undefined);
  let serverClosed = false;
  server.httpServer.on('error', (error) => {
    state = 'failed';
    failure = error;
    rejectFailure?.(error);
  });
  server.httpServer.on('close', () => {
    serverClosed = true;
    if (state !== 'closing') {
      state = 'failed';
      rejectFailure?.(new Error('Benchmark preview closed unexpectedly.'));
    }
    else state = 'closed';
  });
  let closePromise: Promise<void> | null = null;

  let observedHealthSha256: Sha256DigestV1 | null = null;
  const assertHealthy = async (): Promise<void> => {
    if (state !== 'running') throw new Error('Benchmark preview is not running.', { cause: failure });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PREVIEW_CLOSE_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetchImplementation(new URL(options.healthPath ?? '/', baseUrl), { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`Benchmark preview health check returned HTTP ${response.status}.`);
    const healthSha256 = sha256BytesV1(new Uint8Array(await response.arrayBuffer()));
    if (healthSha256 !== options.expectedHealthSha256) throw new PreviewHealthMismatchErrorV1(options.expectedHealthSha256, healthSha256);
    observedHealthSha256 = healthSha256;
    if (state !== 'running') throw new Error('Benchmark preview stopped during its health check.', { cause: failure });
  };
  try {
    await assertHealthy();
  } catch (error) {
    state = 'closing';
    if (!serverClosed) {
      try {
        await closeServer(server, () => serverClosed);
      } catch (cleanupError) {
        throw new PreviewStartupCleanupErrorV1('Benchmark preview health check and cleanup failed.', { cause: new AggregateError([error, cleanupError], 'Benchmark preview health check and cleanup failed.') });
      }
    }
    throw error;
  }
  return {
    baseUrl,
    host: '127.0.0.1',
    port: address.port,
    healthSha256: observedHealthSha256!,
    failure: failureSignal,
    assertHealthy,
      close: () => {
        if (closePromise !== null) return closePromise;
        closePromise = (async () => {
          if (state === 'closed' || serverClosed) return;
          state = 'closing';
          try {
            await closeServer(server, () => serverClosed);
          } catch (error) {
            if (serverClosed) {
              state = 'closed';
              return;
            }
            throw new AggregateError([new Error('Benchmark preview close failed.', { cause: error }), ...(failure === null ? [] : [failure])], 'Benchmark preview cleanup was not proven complete.');
          }
          state = 'closed';
        })();
        return closePromise;
      },
  };
}

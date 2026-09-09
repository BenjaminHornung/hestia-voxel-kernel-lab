export type OwnedCleanupV1 = () => void | Promise<void>;

export class CleanupGuardErrorV1 extends AggregateError {
  public constructor(errors: readonly Error[]) {
    super(errors, 'One or more owned resources failed to close.');
    this.name = 'CleanupGuardErrorV1';
  }
}

export class CleanupGuardV1 {
  readonly #entries: { readonly label: string; readonly cleanup: OwnedCleanupV1 }[] = [];
  #closed = false;
  #closePromise: Promise<void> | null = null;

  public register(label: string, cleanup: OwnedCleanupV1): void {
    if (this.#closed) throw new Error('Cannot register cleanup after guard closure.');
    if (label.length === 0) throw new TypeError('Cleanup label must be non-empty.');
    this.#entries.push({ label, cleanup });
  }

  public close(): Promise<void> {
    if (this.#closePromise !== null) return this.#closePromise;
    this.#closed = true;
    this.#closePromise = (async () => {
      const errors: Error[] = [];
      for (const entry of this.#entries.reverse()) {
        try {
          await entry.cleanup();
        } catch (error) {
          errors.push(new Error(`Cleanup failed for ${entry.label}.`, { cause: error }));
        }
      }
      if (errors.length > 0) throw new CleanupGuardErrorV1(errors);
    })();
    return this.#closePromise;
  }
}

export async function withCleanupGuardV1<T>(operation: (guard: CleanupGuardV1) => Promise<T>): Promise<T> {
  const guard = new CleanupGuardV1();
  let operationError: unknown;
  try {
    return await operation(guard);
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      await guard.close();
    } catch (cleanupError) {
      if (operationError !== undefined) throw new AggregateError([operationError, cleanupError], 'Operation and cleanup both failed.');
      throw cleanupError;
    }
  }
}

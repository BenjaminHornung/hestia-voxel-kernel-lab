import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runBlackBoxCommandV1 } from '../../../fixtures/benchmark/runner/blackBoxCommandV1';

let temporaryRoot: string | undefined;

afterEach(async () => {
  if (temporaryRoot !== undefined) await rm(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = undefined;
});

describe('BR03 black-box command receipts', () => {
  it('preserves a completed command outcome when post-observation fails', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'br03-command-receipt-'));
    const receiptPath = join(temporaryRoot, 'receipt.json');
    await expect(runBlackBoxCommandV1({
      label: 'observation-failure',
      command: process.execPath,
      args: ['-e', "process.stdout.write('complete')"],
      cwd: process.cwd(),
      timeoutMs: 30_000,
      receiptPath,
      classification: 'unit-test',
      observeAfter: async () => { throw new Error('observer failed'); },
    })).rejects.toThrow(/observer failed/);
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as { readonly classification: string; readonly result: { readonly exitCode: number; readonly stdoutSha256: string }; readonly observations: { readonly failureSha256: string } };
    expect(receipt).toMatchObject({ classification: 'harness-failure', result: { exitCode: 0 } });
    expect(receipt.result.stdoutSha256).toMatch(/^sha256:/u);
    expect(receipt.observations.failureSha256).toMatch(/^sha256:/u);
  });

  it('reserves an immutable receipt before spawning', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'br03-command-reservation-'));
    const receiptPath = join(temporaryRoot, 'receipt.json');
    const markerPath = join(temporaryRoot, 'spawned');
    const options = {
      label: 'reservation',
      command: process.execPath,
      cwd: process.cwd(),
      timeoutMs: 30_000,
      receiptPath,
      classification: 'unit-test',
    } as const;
    await runBlackBoxCommandV1({ ...options, args: ['-e', ''] });
    await expect(runBlackBoxCommandV1({ ...options, args: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(markerPath)}, 'spawned')`] })).rejects.toThrow();
    await expect(access(markerPath)).rejects.toThrow();
  });
});

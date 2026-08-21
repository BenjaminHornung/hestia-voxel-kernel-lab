import { spawnSync } from 'node:child_process';
import { defineConfig } from 'vite';

const MAX_GIT_OUTPUT_BYTES = 1024 * 1024;

function outputByteLength(value: unknown): number {
  if (typeof value === 'string') return Buffer.byteLength(value, 'utf8');
  return value instanceof Uint8Array ? value.byteLength : 0;
}

function gitResultSucceeded(result: ReturnType<typeof spawnSync>): boolean {
  const stdoutBytes = outputByteLength(result.stdout);
  const stderrBytes = outputByteLength(result.stderr);
  return result.status === 0 && result.error === undefined && (result.signal === undefined || result.signal === null)
    && stdoutBytes <= MAX_GIT_OUTPUT_BYTES && stderrBytes <= MAX_GIT_OUTPUT_BYTES
    && stdoutBytes + stderrBytes <= MAX_GIT_OUTPUT_BYTES && stderrBytes === 0;
}

const sourceCommit = spawnSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], {
  encoding: 'utf8',
  shell: false,
  windowsHide: true,
  timeout: 5_000,
  maxBuffer: MAX_GIT_OUTPUT_BYTES,
});
const sourceStatus = spawnSync('git', ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=none'], {
  encoding: 'utf8',
  shell: false,
  windowsHide: true,
  timeout: 5_000,
  maxBuffer: MAX_GIT_OUTPUT_BYTES,
});
const resolvedSourceCommitSha = gitResultSucceeded(sourceCommit) && typeof sourceCommit.stdout === 'string' ? sourceCommit.stdout.trim() : '';
const sourceIsClean = gitResultSucceeded(sourceStatus) && typeof sourceStatus.stdout === 'string' && sourceStatus.stdout.length === 0;
const sourceCommitSha = /^[0-9a-f]{40}$/.test(resolvedSourceCommitSha) && sourceIsClean ? resolvedSourceCommitSha : 'dirty-worktree';

function assertCleanBuildInputsUnchanged(): void {
  if (!sourceIsClean) return;
  const currentCommit = spawnSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 5_000,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });
  const currentStatus = spawnSync('git', ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=none'], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 5_000,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });
  const currentCommitSha = gitResultSucceeded(currentCommit) && typeof currentCommit.stdout === 'string' ? currentCommit.stdout.trim() : '';
  if (currentCommitSha !== resolvedSourceCommitSha || !gitResultSucceeded(currentStatus) || currentStatus.stdout !== '') {
    throw new Error('Runner source changed during a clean build.');
  }
}

export default defineConfig({
  define: { __BR03_SOURCE_COMMIT_SHA__: JSON.stringify(sourceCommitSha) },
  plugins: [{ name: 'br03-runner-source-integrity', closeBundle: assertCleanBuildInputsUnchanged }],
  build: {
    ssr: 'src/benchmark/runner/cli.ts',
    outDir: '.benchmark-runner',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rollupOptions: {
      output: { entryFileNames: 'runner.mjs' },
    },
  },
});

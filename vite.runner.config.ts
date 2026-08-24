import { spawnSync } from 'node:child_process';
import { defineConfig } from 'vite';

const MAX_GIT_OUTPUT_BYTES = 1024 * 1024;
const GIT_REDIRECT_ENVIRONMENT_KEYS = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_ATTR_SOURCE',
  'GIT_CEILING_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_CONFIG',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_KEY_0',
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_SYSTEM',
  'GIT_CONFIG_VALUE_0',
  'GIT_DIR',
  'GIT_INDEX_FILE',
  'GIT_NAMESPACE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_REPLACE_REF_BASE',
  'GIT_WORK_TREE',
] as const;

function gitEnvironmentV1(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    const upperKey = key.toUpperCase();
    if (GIT_REDIRECT_ENVIRONMENT_KEYS.includes(upperKey as typeof GIT_REDIRECT_ENVIRONMENT_KEYS[number])
      || /^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(upperKey)) delete environment[key];
  }
  return environment;
}

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

function readGit(args: readonly string[]): ReturnType<typeof spawnSync> {
  return spawnSync('git', ['--no-replace-objects', ...args], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 5_000,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    env: gitEnvironmentV1(),
  });
}

function readCleanSourceState(): { readonly commitSha: string; readonly status: string } {
  const sourceCommit = readGit(['rev-parse', '--verify', 'HEAD^{commit}']);
  const sourceStatus = readGit(['status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=none']);
  if (!gitResultSucceeded(sourceCommit) || !gitResultSucceeded(sourceStatus)
    || typeof sourceCommit.stdout !== 'string' || typeof sourceStatus.stdout !== 'string') {
    throw new Error('Runner build requires a resolvable clean Git worktree.');
  }
  const commitSha = sourceCommit.stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(commitSha) || sourceStatus.stdout.length !== 0) {
    throw new Error('Runner build requires a clean Git worktree.');
  }
  return { commitSha, status: sourceStatus.stdout };
}

const initialSourceState = readCleanSourceState();
const sourceCommitSha = initialSourceState.commitSha;

function assertCleanBuildInputsUnchanged(): void {
  const currentSourceState = readCleanSourceState();
  if (currentSourceState.commitSha !== initialSourceState.commitSha || currentSourceState.status !== initialSourceState.status) {
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

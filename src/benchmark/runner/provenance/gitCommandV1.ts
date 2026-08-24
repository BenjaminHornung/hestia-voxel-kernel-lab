import { spawnSync } from 'node:child_process';
import { BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1 } from '../../contracts';
import type { SourcePreflightCommandResultV1 } from '../../provenance';

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

export function runNoReplaceGitV1(
  args: readonly string[],
  cwd: string,
  input?: Uint8Array,
): SourcePreflightCommandResultV1 {
  const result = spawnSync('git', ['--no-replace-objects', ...args], {
    cwd,
    encoding: 'buffer',
    shell: false,
    windowsHide: true,
    timeout: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.gitCommandTimeoutMs,
    maxBuffer: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.commandOutputMaxBytes,
    input,
    env: gitEnvironmentV1(),
  });
  return {
    status: result.status,
    stdout: result.stdout instanceof Uint8Array ? new Uint8Array(result.stdout) : new Uint8Array(),
    stderr: result.stderr instanceof Uint8Array ? new Uint8Array(result.stderr) : new Uint8Array(),
    error: result.error,
    signal: result.signal,
  };
}

export function runNoReplaceGitCommandV1(
  command: string,
  args: readonly string[],
  cwd: string,
): SourcePreflightCommandResultV1 {
  if (command !== 'git') throw new Error(`Unexpected provenance command: ${command}.`);
  return runNoReplaceGitV1(args, cwd);
}

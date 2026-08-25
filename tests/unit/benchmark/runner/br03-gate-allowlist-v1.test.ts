import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const INTEGRATION_SHA = 'e88978cbcd5504789a804fb25e353e08aaec1bd6';
const FORBIDDEN_PREFIXES = [
  'src/benchmark/contracts/',
  'src/benchmark/provenance/',
  'src/benchmark/adapters/',
  'src/diagnostics/telemetry/',
  'tests/contracts/',
  'evidence/',
] as const;

function git(args: readonly string[]): string {
  const result = spawnSync('git', ['--no-replace-objects', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 5_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0 || result.signal !== null || result.error !== undefined) {
    throw new Error('Bounded BR03 Git allowlist inspection failed.');
  }
  return result.stdout;
}

describe('BR03 cumulative gate allowlist', () => {
  it('keeps frozen integration and Evidence paths unchanged', () => {
    const changedPaths = [
      ...git(['diff', '--name-only', INTEGRATION_SHA]).trim().split(/\r?\n/u),
      ...git(['ls-files', '--others', '--exclude-standard']).trim().split(/\r?\n/u),
    ].filter(Boolean);
    expect(changedPaths.filter((path) => path === 'package-lock.json' || FORBIDDEN_PREFIXES.some((prefix) => path.startsWith(prefix)))).toEqual([]);
  });

  it('keeps the integration anchor and package dependency graph available', () => {
    expect(git(['rev-parse', '--verify', `${INTEGRATION_SHA}^{commit}`]).trim()).toBe(INTEGRATION_SHA);
    expect(git(['diff', '--name-only', INTEGRATION_SHA, 'HEAD', '--', 'package-lock.json'])).toBe('');
    const acceptedPackage = JSON.parse(git(['show', `${INTEGRATION_SHA}:package.json`])) as { readonly dependencies: unknown; readonly devDependencies: unknown };
    const candidatePackage = JSON.parse(readFileSync('package.json', 'utf8')) as { readonly dependencies: unknown; readonly devDependencies: unknown };
    expect({ dependencies: candidatePackage.dependencies, devDependencies: candidatePackage.devDependencies })
      .toEqual({ dependencies: acceptedPackage.dependencies, devDependencies: acceptedPackage.devDependencies });
  });
});

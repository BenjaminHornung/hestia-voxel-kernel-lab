import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
// @ts-expect-error Node's native type stripping requires the explicit extension.
import { boundedGitV1, cleanStatusV1, runBlackBoxCommandV1 } from './blackBoxCommandV1.ts';

const repositoryRoot = resolve(process.cwd());
const npmExecPath = process.env.npm_execpath;
if (npmExecPath === undefined) throw new Error('npm CLI path is unavailable.');
if (cleanStatusV1(repositoryRoot) !== '') throw new Error('BR03 final gates require a clean candidate worktree.');

const candidateRef = boundedGitV1(repositoryRoot, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
const receiptRoot = join(repositoryRoot, '.benchmark-results', 'gate-receipts', candidateRef);
const integrationRef = 'e88978cbcd5504789a804fb25e353e08aaec1bd6';
const forbiddenPrefixes = ['src/benchmark/contracts/', 'src/benchmark/provenance/', 'src/benchmark/adapters/', 'src/diagnostics/telemetry/', 'tests/contracts/', 'evidence/'];

async function nativeCandidateGuards(): Promise<string> {
  const changedPaths = [
    ...boundedGitV1(repositoryRoot, ['diff', '--name-only', integrationRef]).trim().split(/\r?\n/u),
    ...boundedGitV1(repositoryRoot, ['ls-files', '--others', '--exclude-standard']).trim().split(/\r?\n/u),
  ].filter(Boolean);
  if (changedPaths.some((path) => path === 'package-lock.json' || forbiddenPrefixes.some((prefix) => path.startsWith(prefix)))) {
    throw new Error('BR03 native candidate guard rejected a protected path.');
  }
  const accepted = JSON.parse(boundedGitV1(repositoryRoot, ['show', `${integrationRef}:package.json`])) as { readonly dependencies: unknown; readonly devDependencies: unknown };
  const candidate = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')) as { readonly dependencies: unknown; readonly devDependencies: unknown };
  if (JSON.stringify([candidate.dependencies, candidate.devDependencies]) !== JSON.stringify([accepted.dependencies, accepted.devDependencies])) {
    throw new Error('BR03 native candidate guard rejected a dependency graph change.');
  }
  return 'passed';
}

async function profiles(): Promise<readonly string[]> {
  try {
    return (await readdir(join(repositoryRoot, '.benchmark-results', '.profiles'))).sort();
  } catch {
    return [];
  }
}

async function gate(label: string, command: string, args: readonly string[], timeoutMs: number, before?: () => Promise<string>): Promise<void> {
  const outcome = await runBlackBoxCommandV1({
    label,
    command,
    args,
    cwd: repositoryRoot,
    timeoutMs,
    receiptPath: join(receiptRoot, `${label}.json`),
    classification: 'final-gate',
    observeBefore: async () => ({ profiles: await profiles(), ports: [], nativeCandidateGuards: await before?.() ?? 'not-applicable' }),
    observeAfter: async () => ({ profiles: await profiles(), ports: [] }),
  });
  if (outcome.timedOut || outcome.status !== 0 || outcome.signal !== null) {
    throw new Error(`BR03 final gate ${label} failed; see its immutable command receipt.`);
  }
  if (cleanStatusV1(repositoryRoot) !== '') throw new Error(`BR03 final gate ${label} dirtied the candidate worktree.`);
}

await gate('01-npm-ci', process.execPath, [npmExecPath, 'ci'], 300_000, nativeCandidateGuards);
await gate('02-focused-runner-tests', process.execPath, [join(repositoryRoot, 'node_modules', 'vitest', 'vitest.mjs'), 'run', 'tests/unit/benchmark/runner'], 300_000);
await gate('03-unit-tests', process.execPath, [npmExecPath, 'test'], 300_000);
await gate('04-build', process.execPath, [npmExecPath, 'run', 'build'], 300_000);
await gate('05-build-benchmark', process.execPath, [npmExecPath, 'run', 'build:benchmark'], 300_000);
await gate('06-build-runner', process.execPath, [npmExecPath, 'run', 'build:runner'], 300_000);
await gate('07-e2e-and-built-runner-matrix', process.execPath, [npmExecPath, 'run', 'test:e2e'], 900_000);
await gate('08-dependency-tree', process.execPath, [npmExecPath, 'ls', '--depth=0'], 120_000);
await gate('09-diff-check', 'git', ['--no-replace-objects', 'diff', '--check'], 30_000);

if ((await profiles()).length !== 0) throw new Error('BR03 final gates left an owned browser profile behind.');
if (cleanStatusV1(repositoryRoot) !== '') throw new Error('BR03 final gates did not preserve a clean candidate worktree.');
process.stdout.write(`${JSON.stringify({ status: 'passed', candidateRef, receiptRoot })}\n`);

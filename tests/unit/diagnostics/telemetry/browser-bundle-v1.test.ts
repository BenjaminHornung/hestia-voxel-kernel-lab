import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { build } from 'vite';

function outputFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? outputFiles(path) : [path];
  });
}

function outputText(root: string): string {
  return outputFiles(root).map((path) => readFileSync(path, 'utf8')).join('\n');
}

async function buildApp(outDir: string, mode: 'production' | 'benchmark'): Promise<void> {
  await build({
    root: process.cwd(),
    configFile: false,
    mode,
    logLevel: 'silent',
    build: { outDir, emptyOutDir: true, minify: false },
  });
}

async function buildLib(outDir: string, entry: string, fileName: string): Promise<void> {
  await build({
    root: process.cwd(),
    configFile: false,
    mode: 'benchmark',
    logLevel: 'silent',
    build: {
      outDir,
      emptyOutDir: true,
      minify: false,
      lib: { entry: resolve(entry), formats: ['es'], fileName: () => fileName },
    },
  });
}

describe('BR02 browser bundle v1', () => {
  it('keeps ordinary production inactive and retains only browser-safe benchmark graphs', async () => {
    const productionDir = mkdtempSync(join(tmpdir(), 'br02-production-bundle-'));
    const benchmarkDir = mkdtempSync(join(tmpdir(), 'br02-benchmark-bundle-'));
    const handoffDir = mkdtempSync(join(tmpdir(), 'br02-handoff-bundle-'));
    const contractDir = mkdtempSync(join(tmpdir(), 'br02-contract-bundle-'));
    const adapterDir = mkdtempSync(join(tmpdir(), 'br02-adapter-bundle-'));
    try {
      await buildApp(productionDir, 'production');
      const production = outputText(productionDir);
      expect(production).not.toContain('br-02-browser-telemetry-handoff-v1');
      expect(production).not.toContain('telemetry-current-iteration');
      expect(outputFiles(productionDir).some((path) => /browserHandoffV1/i.test(path))).toBe(false);

      await buildApp(benchmarkDir, 'benchmark');
      await buildLib(handoffDir, 'src/diagnostics/telemetry/browserHandoffV1.ts', 'handoff-entry.js');
      await buildLib(contractDir, 'src/benchmark/contracts/browserV1.ts', 'contract-entry.js');
      await buildLib(adapterDir, 'src/benchmark/adapters/index.ts', 'adapter-entry.js');
      const benchmark = [benchmarkDir, handoffDir, contractDir, adapterDir].map(outputText).join('\n');
      expect(benchmark).toContain('br-02-browser-telemetry-handoff-v1');
      expect(benchmark).toContain('br02-browser-telemetry-enabled-v1');
      expect(benchmark).toContain('br02-telemetry-export-v1-to-benchmark-raw-sample-v1');
      expect(benchmark).toContain('browserHandoffV1');
      expect(benchmark).not.toMatch(/node:[A-Za-z0-9_./-]+/);
      expect(benchmark).not.toMatch(/(?:from|require\()\s*["'](?:crypto|fs|path|os|child_process)["']/);
      expect(benchmark).not.toMatch(new RegExp('a' + 'jv', 'i'));
      expect(benchmark).not.toMatch(/(?:contracts\/index|provenance\/index|validateV1|fileSetDigestV1|sourcePreflightV1|bundleV1)/);
    } finally {
      for (const directory of [productionDir, benchmarkDir, handoffDir, contractDir, adapterDir]) {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });
});

import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { build } from 'vite';

function outputFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? outputFiles(path) : [path];
  });
}

describe('BR02 browser contract entry', () => {
  it('builds and imports without Node or AJV dependencies', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'br02-browser-contract-'));
    try {
      await build({
        root: process.cwd(),
        configFile: false,
        logLevel: 'silent',
        build: {
          outDir,
          emptyOutDir: true,
          minify: false,
          lib: { entry: resolve('src/benchmark/contracts/browserV1.ts'), formats: ['es'], fileName: () => 'browser-entry.js' },
        },
      });

      const bundled = outputFiles(outDir).map((path) => readFileSync(path, 'utf8')).join('\n');
      expect(bundled).not.toMatch(/node:[A-Za-z0-9_./-]+/);
      expect(bundled).not.toMatch(/(?:from|require\()\s*["'](?:crypto|fs|path|child_process)["']/);
      expect(bundled).not.toMatch(/\bajv\b/i);

      const browserContract = await import(`${pathToFileURL(join(outDir, 'browser-entry.js')).href}?br02`);
      expect(browserContract.BENCHMARK_PROTOCOL_VERSION).toBe('benchmark-protocol-v1');
      expect(browserContract.validateBrowserMetricRegistryV1(browserContract.BENCHMARK_METRIC_REGISTRY_V1)).toBe(true);
      expect(browserContract.BENCHMARK_METRIC_REACHABILITY_MATRIX_V1).toHaveLength(268);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

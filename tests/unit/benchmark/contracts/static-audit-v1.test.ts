import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

describe('BR01 static boundaries', () => {
  it('does not import AJV from source', () => {
    const files = globSync('src/**/*.ts');
    expect(files.some((file) => /ajv/i.test(readFileSync(file, 'utf8')))).toBe(false);
  });
  it('keeps AJV and production registry imports out of fixture catalogs', () => {
    const files = globSync('tests/**/*.ts');
    const ajvFiles = files.filter((file) => /ajv/i.test(readFileSync(file, 'utf8')));
    expect(ajvFiles.every((file) => /^tests[\\/]unit[\\/]benchmark[\\/]/.test(file))).toBe(true);
    const fixtureFiles = globSync('tests/fixtures/**/*.ts');
    expect(fixtureFiles.some((file) => /ajv|scenarioRegistryV1|benchmarkScenarioDefinitions/.test(readFileSync(file, 'utf8')))).toBe(false);
  });
  it('keeps telemetry adaptation type-only in BR01', () => {
    expect(readFileSync('src/benchmark/contracts/typesV1.ts', 'utf8')).not.toMatch(/export\s+declare\s+const\s+adaptTelemetryExportV1/);
  });
});

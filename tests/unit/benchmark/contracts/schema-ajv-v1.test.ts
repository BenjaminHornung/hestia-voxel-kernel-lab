import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { benchmarkScenarioDefinitionsV1 } from '../../../../src/benchmark/contracts/scenarioRegistryV1';
import { validateBenchmarkRunStructureV1 } from '../../../../src/benchmark/contracts/validateV1';
import { createBenchmarkCaseDocumentV1 } from './benchmark-case-fixtures-v1';

const schemaFiles = [
  'benchmark-run-v1.schema.json',
  'benchmark-artifact-manifest-v1.schema.json',
  'benchmark-bundle-manifest-v1.schema.json',
  'benchmark-scenario-definition-v1.schema.json',
  'benchmark-validation-receipt-v1.schema.json',
] as const;

describe('BR01 Draft 2020-12 schemas', () => {
  it('compile with strict AJV2020 and allErrors without mutation', () => {
    const ajv = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
    for (const file of schemaFiles) {
      expect(() => ajv.compile(JSON.parse(readFileSync(`src/benchmark/contracts/schemas/${file}`, 'utf8')))).not.toThrow();
    }
  });
  it('accepts every explicit scenario definition', () => {
    const ajv = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
    const validate = ajv.compile(JSON.parse(readFileSync('src/benchmark/contracts/schemas/benchmark-scenario-definition-v1.schema.json', 'utf8')));
    for (const definition of benchmarkScenarioDefinitionsV1) expect(validate(definition), JSON.stringify(validate.errors)).toBe(true);
  });
  it('keeps typed Availability parity for environment fields', () => {
    const document = JSON.parse(JSON.stringify(createBenchmarkCaseDocumentV1({ samples: true }))) as Record<string, any>;
    document.environment.os.name.value = 123;
    const validate = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false }).compile(JSON.parse(readFileSync('src/benchmark/contracts/schemas/benchmark-run-v1.schema.json', 'utf8')));
    expect(validate(document)).toBe(false);
    expect(validateBenchmarkRunStructureV1(document)).toMatchObject({ valid: false, stage: 'schema' });
  });
  it.each([
    'os.name', 'os.version', 'os.architecture',
    'cpu.vendor', 'cpu.model',
    'gpu.vendor', 'gpu.device', 'gpu.driver', 'gpu.graphicsBackend',
    'browser.product', 'browser.version', 'browser.channel', 'browser.userAgent',
    'power.profile',
  ])('rejects the unknown sentinel for hardware string %s in both validators', (field) => {
    const document = JSON.parse(JSON.stringify(createBenchmarkCaseDocumentV1({ samples: true }))) as Record<string, any>;
    const parts = field.split('.');
    const target = parts.reduce((value, part) => value[part], document.environment) as Record<string, unknown>;
    target.value = 'unknown';
    const validate = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false }).compile(JSON.parse(readFileSync('src/benchmark/contracts/schemas/benchmark-run-v1.schema.json', 'utf8')));
    expect(validate(document)).toBe(false);
    expect(validateBenchmarkRunStructureV1(document)).toMatchObject({ valid: false, stage: 'schema' });
  });
  it('rejects the unknown power profile sentinel in both validators', () => {
    const document = JSON.parse(JSON.stringify(createBenchmarkCaseDocumentV1({ samples: true }))) as Record<string, any>;
    document.environment.power.profile.value = 'unknown';
    const validate = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false }).compile(JSON.parse(readFileSync('src/benchmark/contracts/schemas/benchmark-run-v1.schema.json', 'utf8')));
    expect(validate(document)).toBe(false);
    expect(validateBenchmarkRunStructureV1(document)).toMatchObject({ valid: false, stage: 'schema' });
  });
  it('preserves unavailable power profile as structural data while blocking eligibility', () => {
    const document = JSON.parse(JSON.stringify(createBenchmarkCaseDocumentV1({ samples: true }))) as Record<string, any>;
    const environments = [document.environment, document.browserProcesses[0].environment, ...document.browserProcesses[0].runs.map((run: any) => run.environment)];
    for (const environment of environments) environment.power.profile = { status: 'unknown', value: null, sourceRef: 'capture-v1', reasonCode: 'profile-not-observed' };
    const validate = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false }).compile(JSON.parse(readFileSync('src/benchmark/contracts/schemas/benchmark-run-v1.schema.json', 'utf8')));
    expect(validate(document)).toBe(true);
    expect(validateBenchmarkRunStructureV1(document)).toMatchObject({ valid: true });
  });
});

import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { canonicalizeJsonV1 } from '../../../../src/benchmark/provenance/canonicalJsonV1';
import { sha256BytesV1 } from '../../../../src/benchmark/provenance/fileSetDigestV1';
import {
  benchmarkNegativeFixtureCasesByIdV1,
  benchmarkPositiveFixtureCasesByIdV1,
} from '../../../../tests/fixtures/benchmark/v1/case-catalog';
import { applySyntheticFutureProducerRecordsV1, createBenchmarkCaseDocumentV1, createBenchmarkValidationContextV1 } from './benchmark-case-fixtures-v1';
import { calculateRunBindingSha256V1, validateBenchmarkRunStructureV1, validateBenchmarkRunV1 } from '../../../../src/benchmark/contracts/validateV1';
import { BENCHMARK_METRIC_REGISTRY_V1, BENCHMARK_SCENARIO_REGISTRY_V1 } from '../../../../src/benchmark/contracts/scenarioRegistryV1';
import { createBenchmarkCaseRuntimeV1 } from './benchmark-case-runtime-v1';

const positiveCases = Object.keys(benchmarkPositiveFixtureCasesByIdV1);
const negativeCases = Object.keys(benchmarkNegativeFixtureCasesByIdV1);

const runSchema = JSON.parse(readFileSync('src/benchmark/contracts/schemas/benchmark-run-v1.schema.json', 'utf8')) as object;
const ajv = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
const validateSchema = ajv.compile(runSchema);
const runtime = createBenchmarkCaseRuntimeV1(Object.fromEntries(
  Object.entries(BENCHMARK_SCENARIO_REGISTRY_V1).map(([id, entry]) => [id, entry.definitionSha256]),
));

function setEnvironmentValue(document: any, field: string, value: unknown): void {
  const environments = [document.environment, document.browserProcesses[0].environment, ...document.browserProcesses[0].runs.map((run: any) => run.environment)];
  for (const environment of environments) {
    if (field === 'physicalCores' || field === 'logicalCores') environment.cpu[field].value = value;
  }
  for (const run of document.browserProcesses[0].runs) {
    run.runBindingSha256 = calculateRunBindingSha256V1(run);
    for (const iteration of run.iterations) for (const sample of iteration.samples) sample.runBindingSha256 = run.runBindingSha256;
  }
}

function setCapability(document: any, capabilityId: string, value: any): void {
  const environments = [document.environment, document.browserProcesses[0].environment, ...document.browserProcesses[0].runs.map((run: any) => run.environment)];
  for (const environment of environments) environment.capabilities.find((entry: any) => entry.id === capabilityId).value = value;
  for (const run of document.browserProcesses[0].runs) {
    run.runBindingSha256 = calculateRunBindingSha256V1(run);
    for (const iteration of run.iterations) for (const sample of iteration.samples) sample.runBindingSha256 = run.runBindingSha256;
  }
}

function removeCapability(document: any, capabilityId: string): void {
  const environments = [document.environment, document.browserProcesses[0].environment, ...document.browserProcesses[0].runs.map((run: any) => run.environment)];
  for (const environment of environments) environment.capabilities = environment.capabilities.filter((entry: any) => entry.id !== capabilityId);
  for (const run of document.browserProcesses[0].runs) {
    run.runBindingSha256 = calculateRunBindingSha256V1(run);
    for (const iteration of run.iterations) for (const sample of iteration.samples) sample.runBindingSha256 = run.runBindingSha256;
  }
}

describe('BR01 executable fixture matrix', () => {
  it('contains exactly the required positive and negative IDs', () => {
    expect(positiveCases).toHaveLength(17);
    expect(negativeCases).toHaveLength(68);
    expect(new Set(positiveCases).size).toBe(17);
    expect(new Set(negativeCases).size).toBe(68);
  });

  it('accepts the valid measurement fixture structurally and semantically', () => {
    const document = createBenchmarkCaseDocumentV1({ samples: true });
    expect(validateSchema(document), JSON.stringify(validateSchema.errors)).toBe(true);
    expect(validateBenchmarkRunStructureV1(document)).toMatchObject({ valid: true });
      expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1())).toMatchObject({ valid: true });
  });
  it('binds current source and historical fixture provenance independently', () => {
    const baseline = (createBenchmarkCaseDocumentV1({ samples: true }) as any).browserProcesses[0].runs.at(-1);
    const currentSourceChanged = JSON.parse(JSON.stringify(baseline));
    currentSourceChanged.source.commitSha = 'b'.repeat(40);
    const fixtureSourceChanged = JSON.parse(JSON.stringify(baseline));
    fixtureSourceChanged.source.fixture.sourceCommitSha.value = 'b'.repeat(40);
    expect(calculateRunBindingSha256V1(currentSourceChanged)).not.toBe(calculateRunBindingSha256V1(baseline));
    expect(calculateRunBindingSha256V1(fixtureSourceChanged)).not.toBe(calculateRunBindingSha256V1(baseline));
    expect(calculateRunBindingSha256V1(currentSourceChanged)).not.toBe(calculateRunBindingSha256V1(fixtureSourceChanged));
  });
  it.each([
    ['mesh-golden-world-v1', { phase: 'cold', container: 'cold' }, ['run.total', 'worker.mesh-cpu', 'mesh.quads', 'mesh.output-bytes', 'coverage.sha256-match']],
    ['scheduler-burst-v1', { phase: 'stress', container: 'stress' }, ['scheduler.queue-depth', 'scheduler.drain', 'scheduler.evicted', 'result.stale-dropped', 'revision.latest-visible', 'worker.heartbeat-gap']],
    ['brush-stress-v1', { phase: 'stress', container: 'stress' }, ['input-to-revision-submit', 'revision.latest-visible', 'world.sha256-match', 'scheduler.queue-depth', 'scheduler.drain']],
    ['backend-fixture-v1', { backend: 'three-webgl2' }, ['draw-submit.cpu', 'gpu.time', 'browser.raf-interval', 'memory.bytes', 'image.contract-sha256-match']],
  ] as const)('keeps future producer reachability fail-closed before records and eligible after valid records: %s', (scenarioId, options, records) => {
    const before = createBenchmarkCaseDocumentV1({ scenarioId, ...options, samples: true }) as any;
    applySyntheticFutureProducerRecordsV1(before, []);
    const beforeValidation = validateBenchmarkRunV1(before, createBenchmarkValidationContextV1({ scenarioId }));
    expect(beforeValidation, beforeValidation.valid ? '' : JSON.stringify(beforeValidation.issues)).toMatchObject({ valid: true });
    expect(before.measurementEligible).toBe(false);

    const after = createBenchmarkCaseDocumentV1({ scenarioId, ...options, samples: true }) as any;
    applySyntheticFutureProducerRecordsV1(after, records);
    expect(validateBenchmarkRunV1(after, createBenchmarkValidationContextV1({ scenarioId }))).toMatchObject({ valid: true });
    expect(after.measurementEligible).toBe(true);
  });
  it.each([
    ['warmup', 'mesh-golden-world-v1', 'warm-measurement', ['worker.mesh-cpu']],
    ['trace', 'navigation-leak-v1', 'trace', ['browser.dom-document-count']],
    ['leak', 'navigation-leak-v1', 'leak', ['memory.bytes']],
  ] as const)('keeps %s samples structurally producible but measurement-ineligible by contract', (phase, scenarioId, container, records) => {
    const document = createBenchmarkCaseDocumentV1({ scenarioId, phase, container, samples: true }) as any;
    applySyntheticFutureProducerRecordsV1(document, records);
    const run = document.browserProcesses[0].runs.at(-1);
    expect(run.execution.measurementEligibility).toBe('eligible');
    expect(run.iterations.some((iteration: any) => iteration.samples.length > 0)).toBe(true);
    expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1({ scenarioId }))).toMatchObject({ valid: false, code: 'measurement-ineligible' });
  });
  it.each([
    ['three-webgl2', 'webgl-disjoint-timer-query'],
    ['raw-webgpu', 'webgpu-timestamp-query'],
  ] as const)('rejects an eligible backend cell when its selected GPU capability is unavailable: %s', (backend, selected) => {
    const document = createBenchmarkCaseDocumentV1({ scenarioId: 'backend-fixture-v1', backend, samples: true }) as any;
    applySyntheticFutureProducerRecordsV1(document, ['draw-submit.cpu', 'gpu.time', 'browser.raf-interval', 'memory.bytes', 'image.contract-sha256-match']);
    setCapability(document, selected, { status: 'unsupported', value: null, sourceRef: 'capture-v1', reasonCode: 'api-not-supported' });
    expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1({ scenarioId: 'backend-fixture-v1' }))).toMatchObject({ valid: false, code: 'required-capability-missing' });
  });
  it('rejects a globally known metric that is absent from the bound scenario', () => {
    const document = createBenchmarkCaseDocumentV1({ samples: true }) as any;
    document.browserProcesses[0].runs.at(-1).iterations[0].samples[0].metricRef = 'memory.bytes@1';
    expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1())).toMatchObject({ valid: false, stage: 'semantic', code: 'metric-unknown' });
  });
  it('keeps AJV and handwritten structural rejection aligned for catalog schema cases', () => {
    const schemaCases = [...Object.values(benchmarkPositiveFixtureCasesByIdV1), ...Object.values(benchmarkNegativeFixtureCasesByIdV1)]
      .filter((entry) => entry.options.kind === 'run' && entry.expected.stage === 'schema');
    expect(schemaCases.length).toBeGreaterThan(0);
    for (const entry of schemaCases) {
      const result = entry.executor({ ...entry.options, runtime });
      const variants = result.facts.variants as readonly { readonly schemaValid: boolean }[] | undefined;
      const ajvValid = variants === undefined ? result.facts.schemaValid : variants.every((variant) => variant.schemaValid);
      expect(ajvValid, entry.id).toBe(false);
      expect(result.stage, entry.id).toBe('schema');
    }
  });
  it('compares every N24 environment-missing variant AJV and handwritten stage/code independently', () => {
    const entry = benchmarkNegativeFixtureCasesByIdV1.N24;
    const result = entry.executor({ ...entry.options, runtime });
    const actual = result.facts.variants as readonly { readonly name: string; readonly schemaValid: boolean; readonly stage: string; readonly code?: string }[];
    const expected = entry.expected.facts!.variants as readonly { readonly name: string; readonly schemaValid: boolean; readonly stage: string; readonly code?: string }[];
    expect(actual).toHaveLength(expected.length);
    for (let index = 0; index < expected.length; index += 1) {
      expect(actual[index]!.name).toBe(expected[index]!.name);
      expect(actual[index]!.schemaValid).toBe(false);
      expect(actual[index]!.schemaValid).toBe(expected[index]!.schemaValid);
      expect(actual[index]!.stage).toBe(expected[index]!.stage);
      expect(actual[index]!.code).toBe(expected[index]!.code);
    }
  });
  it('compares every N25 variant AJV and handwritten stage/code independently', () => {
    const entry = benchmarkNegativeFixtureCasesByIdV1.N25;
    const result = entry.executor({ ...entry.options, runtime });
    const actual = result.facts.variants as readonly { readonly name: string; readonly schemaValid: boolean; readonly stage: string; readonly code?: string }[];
    const expected = entry.expected.facts!.variants as readonly { readonly name: string; readonly schemaValid: boolean; readonly stage: string; readonly code?: string }[];
    expect(actual).toHaveLength(expected.length);
    for (let index = 0; index < expected.length; index += 1) {
      expect(actual[index]!.name).toBe(expected[index]!.name);
      expect(actual[index]!.schemaValid).toBe(expected[index]!.schemaValid);
      expect(actual[index]!.stage).toBe(expected[index]!.stage);
      expect(actual[index]!.code).toBe(expected[index]!.code);
    }
  });
  it('compares every N36 fixture variant stage/code independently', () => {
    const entry = benchmarkNegativeFixtureCasesByIdV1.N36;
    const result = entry.executor({ ...entry.options, runtime });
    const actual = result.facts.variants as readonly { readonly name: string; readonly fixtureId: string; readonly fixtureVariant: string; readonly schemaValid: boolean; readonly stage: string; readonly code?: string }[];
    const expected = entry.expected.facts!.variants as readonly { readonly name: string; readonly fixtureId: string; readonly fixtureVariant: string; readonly schemaValid: boolean; readonly stage: string; readonly code?: string }[];
    expect(actual).toHaveLength(4);
    expect(actual).toHaveLength(expected.length);
    for (let index = 0; index < expected.length; index += 1) {
      expect(actual[index]!.name).toBe(expected[index]!.name);
      expect(actual[index]!.fixtureId).toBe(expected[index]!.fixtureId);
      expect(actual[index]!.fixtureVariant).toBe(expected[index]!.fixtureVariant);
      expect(actual[index]!.schemaValid).toBe(expected[index]!.schemaValid);
      expect(actual[index]!.stage).toBe(expected[index]!.stage);
      expect(actual[index]!.code).toBe(expected[index]!.code);
    }
  });
  it.each([
    ['three-webgl2', 'webgl-disjoint-timer-query', 'webgpu-timestamp-query'],
    ['raw-webgpu', 'webgpu-timestamp-query', 'webgl-disjoint-timer-query'],
  ] as const)('requires only the selected backend GPU timer capability: %s', (backend, selected, _unrelated) => {
    const document = createBenchmarkCaseDocumentV1({ scenarioId: 'backend-fixture-v1', backend, samples: true }) as any;
    const context = createBenchmarkValidationContextV1({ scenarioId: 'backend-fixture-v1' });
    expect(validateBenchmarkRunV1(document, context)).toMatchObject({ valid: true });
    setCapability(document, selected, { status: 'unsupported', value: null, sourceRef: 'capture-v1', reasonCode: 'api-not-supported' });
     expect(validateBenchmarkRunV1(document, context)).toMatchObject({ valid: true });
    const missingSelected = createBenchmarkCaseDocumentV1({ scenarioId: 'backend-fixture-v1', backend, samples: true }) as any;
    removeCapability(missingSelected, selected);
     expect(validateBenchmarkRunV1(missingSelected, context)).toMatchObject({ valid: false, code: 'required-capability-missing' });
  });
  it('accepts a cold backend run without phase-excluded GPU and RAF samples', () => {
    const document = createBenchmarkCaseDocumentV1({ scenarioId: 'backend-fixture-v1', backend: 'three-webgl2', phase: 'cold', container: 'cold', samples: true }) as any;
    const samples = document.browserProcesses[0].runs[0].iterations[0].samples;
    expect(samples.some((sample: any) => sample.metricRef === 'gpu.time.ms@1' || sample.metricRef === 'raf.interval.ms@1')).toBe(false);
    expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1({ scenarioId: 'backend-fixture-v1' }))).toMatchObject({ valid: true });
  });
  it('rejects a present backend GPU sample in a cold run', () => {
    const document = createBenchmarkCaseDocumentV1({ scenarioId: 'backend-fixture-v1', backend: 'three-webgl2', phase: 'cold', container: 'cold', samples: true }) as any;
    const measurement = createBenchmarkCaseDocumentV1({ scenarioId: 'backend-fixture-v1', backend: 'three-webgl2', samples: true }) as any;
    const coldRun = document.browserProcesses[0].runs[0];
    const gpuSample = measurement.browserProcesses[0].runs.at(-1).iterations[0].samples.find((sample: any) => sample.metricRef === 'gpu.time.ms@1');
    coldRun.iterations[0].samples.push({ ...gpuSample, sampleId: 'sample-cold-gpu', ordinal: coldRun.iterations[0].samples.length, iterationId: 'iteration-0', phase: 'cold', runBindingSha256: coldRun.runBindingSha256 });
    expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1({ scenarioId: 'backend-fixture-v1' }))).toMatchObject({ valid: false, code: 'metric-phase-invalid' });
  });
  it('rejects impossible physical/logical CPU topology in all environment copies', () => {
    const document = createBenchmarkCaseDocumentV1({ samples: true }) as any;
    setEnvironmentValue(document, 'physicalCores', 8);
    setEnvironmentValue(document, 'logicalCores', 4);
    expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1())).toMatchObject({ valid: false, code: 'number-domain-invalid' });
  });
  it.each([
    ['chunk', { scenarioId: 'mesh-golden-world-v1' }, 'chunk.mesh.cpu.ms@1', 'chunk-key'],
    ['operation', { scenarioId: 'scheduler-steady-v1' }, 'adoption.cpu.ms@1', 'operation-ordinal'],
    ['input/revision', { scenarioId: 'brush-stress-v1', phase: 'stress', container: 'stress' }, 'input.revision.submit.ms@1', 'input-ordinal'],
    ['time-block', { scenarioId: 'backend-fixture-v1' }, 'raf.interval.ms@1', 'time-block-ordinal'],
    ['counter-window/reason', { scenarioId: 'scheduler-burst-v1', phase: 'stress', container: 'stress' }, 'scheduler.stale.count@1', 'stale-reason'],
    ['memory/checkpoint', { scenarioId: 'navigation-leak-v1', phase: 'leak', container: 'leak' }, 'memory.bytes@1', 'checkpoint-id'],
    ['render/frame', { scenarioId: 'backend-fixture-v1' }, 'gpu.time.ms@1', 'render-pass-id'],
    ['burst', { scenarioId: 'scheduler-burst-v1', phase: 'stress', container: 'stress' }, 'scheduler.drain.ms@1', 'burst-ordinal'],
  ] as const)('rejects a missing %s sample dimension', (_family, options, metricRef, dimensionKey) => {
    const document = createBenchmarkCaseDocumentV1({ ...options, samples: true }) as any;
    const sample = document.browserProcesses[0].runs.at(-1).iterations.flatMap((iteration: any) => iteration.samples).find((entry: any) => entry.metricRef === metricRef);
    expect(sample).toBeDefined();
    sample.dimensions = sample.dimensions.filter((dimension: any) => dimension.key !== dimensionKey);
    expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1({ scenarioId: options.scenarioId }))).toMatchObject({ valid: false, code: 'metric-dimension-missing' });
  });
  it('rejects duplicate and wrong required sample dimension keys', () => {
    const duplicateDocument = createBenchmarkCaseDocumentV1({ samples: true }) as any;
    const duplicateSample = duplicateDocument.browserProcesses[0].runs.at(-1).iterations[0].samples.find((entry: any) => entry.metricRef === 'chunk.mesh.cpu.ms@1');
    duplicateSample.dimensions.push({ key: 'chunk-key', value: 'chunk-1' });
    expect(validateBenchmarkRunV1(duplicateDocument, createBenchmarkValidationContextV1())).toMatchObject({ valid: false, code: 'metric-dimension-duplicate' });

    const wrongDocument = createBenchmarkCaseDocumentV1({ samples: true }) as any;
    const wrongSample = wrongDocument.browserProcesses[0].runs.at(-1).iterations[0].samples.find((entry: any) => entry.metricRef === 'chunk.mesh.cpu.ms@1');
    wrongSample.dimensions[0] = { key: 'wrong-dimension', value: 'chunk-0' };
    expect(validateBenchmarkRunV1(wrongDocument, createBenchmarkValidationContextV1())).toMatchObject({ valid: false, code: 'metric-dimension-missing' });
  });
  it('rejects zero for the positive finite RAF metric domain', () => {
    const document = createBenchmarkCaseDocumentV1({ scenarioId: 'backend-fixture-v1', backend: 'three-webgl2', samples: true }) as any;
    const sample = document.browserProcesses[0].runs.at(-1).iterations.flatMap((iteration: any) => iteration.samples).find((entry: any) => entry.metricRef === 'raf.interval.ms@1');
    sample.result.value = 0;
    expect(validateBenchmarkRunV1(document, createBenchmarkValidationContextV1({ scenarioId: 'backend-fixture-v1' }))).toMatchObject({ valid: false, code: 'metric-domain-invalid' });
  });
  it('rejects a recomputed caller-defined shadow metric registry', () => {
    const document = createBenchmarkCaseDocumentV1({ samples: true });
    const registry = JSON.parse(JSON.stringify(BENCHMARK_METRIC_REGISTRY_V1)) as any;
    registry.metrics[0].eventSemantics = `${registry.metrics[0].eventSemantics} shadow`;
    registry.metricRegistrySha256 = sha256BytesV1(canonicalizeJsonV1({
      schemaVersion: registry.schemaVersion,
      protocolVersion: registry.protocolVersion,
      metrics: registry.metrics,
      telemetryMappings: registry.telemetryMappings,
    }));
    const context = createBenchmarkValidationContextV1() as any;
    context.metricRegistrySha256 = registry.metricRegistrySha256;
    expect(validateBenchmarkRunV1(document, context, registry)).toMatchObject({ valid: false, code: 'registry-digest-mismatch' });
  });
});

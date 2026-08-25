import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  BenchmarkEnvironmentManifestV1,
  BenchmarkRunV1,
  BenchmarkSourceProvenanceV1,
  BenchmarkValidationContextV1,
  CanonicalIdV1,
  Sha256DigestV1,
} from '../../../../src/benchmark/contracts';
import { adaptTelemetryExportV1 } from '../../../../src/benchmark/adapters';
import { createTelemetryBufferV1 } from '../../../../src/diagnostics/telemetry/bufferV1';
import { deriveTelemetryCapabilityIdsV1, serializeSealedTelemetryExportV1 } from '../../../../src/diagnostics/telemetry/contractV1';
import { assembleHardwareCellV1, assembleRunV1, createSinglePassTelemetryAdapterV1 } from '../../../../src/benchmark/runner/assembly/runAssemblerV1';
import { mintReceiptV1 } from '../../../../src/benchmark/runner/assembly/receiptMinterV1';
import {
  buildBenchmarkBundleV1,
  createInvocationArtifactRootV1,
  deriveBundleIdV1,
  verifyInvocationClosureV1,
  verifyInvocationControlV1,
  verifyWrittenBundleV1,
  writeBundleClosureExclusiveV1,
  writeFailureDiagnosticV1,
  writeInvocationClosureV1,
  writeProcessUnitResultsV1,
} from '../../../../src/benchmark/runner/artifacts/artifactStoreV1';
import { Br02HandoffDriverErrorV1 } from '../../../../src/benchmark/runner/browser/br02HandoffDriverV1';
import { createRunInvocationV1 } from '../../../../src/benchmark/runner/invocation/runInvocationV1';
import { deriveHardwareCellIdV1 } from '../../../../src/benchmark/runner/ids/orchestrationIdsV1';
import { buildRunPlanV1 } from '../../../../src/benchmark/runner/plan/runPlanV1';
import { assertBundleDocumentBindingsV1 } from '../../../../src/benchmark/runner/cli';
import { runPlanInputV1 } from '../../../fixtures/benchmark/runner/runPlanInputV1';
import { testRunnerSourceShaV1 } from '../../../fixtures/benchmark/runner/runnerSourceV1';
import {
  createBenchmarkCaseDocumentV1,
  createBenchmarkValidationContextV1,
} from '../../benchmark/contracts/benchmark-case-fixtures-v1';

const id = (value: string): CanonicalIdV1 => value as CanonicalIdV1;

function setup() {
  const template = createBenchmarkCaseDocumentV1({
    scenarioId: 'backend-fixture-v1', phase: 'cold', container: 'cold', samples: true,
  }) as unknown as {
    readonly hardwareCellId: CanonicalIdV1;
    readonly hardwareProfileId: CanonicalIdV1;
    readonly source: BenchmarkSourceProvenanceV1;
    readonly environment: BenchmarkEnvironmentManifestV1;
    readonly browserProcesses: readonly [{ readonly runs: readonly [{ readonly scenario: { readonly parameters: readonly never[] } }] }];
  };
  const sourceDigest = template.source.candidate.sourceFileSetSha256;
  if (sourceDigest.status !== 'observed') throw new Error('Synthetic candidate fixture must expose a digest.');
  const fixtureDigest = template.source.fixture.semanticSha256;
  if (fixtureDigest.status !== 'observed') throw new Error('Synthetic fixture must expose a semantic digest.');
  const input = runPlanInputV1();
  const plan = buildRunPlanV1({
    ...input,
    expectedSourceCommitSha: template.source.commitSha,
    expectedBuildSha256: template.source.build.sha256,
    fixtureContractId: template.source.fixture.id,
    fixtureSemanticSha256: fixtureDigest.value,
    hardwareProfileId: template.hardwareProfileId,
    referenceCandidateId: template.source.candidate.id,
    candidates: [
      { id: template.source.candidate.id, sourceFileSetSha256: sourceDigest.value },
      { id: id('candidate-z'), sourceFileSetSha256: `sha256:${'f'.repeat(64)}` as Sha256DigestV1 },
    ],
    scenarios: [{ id: 'backend-fixture-v1', parameters: template.browserProcesses[0].runs[0].scenario.parameters }],
    phases: {
      cold: { enabled: true, minimumProcessesPerCandidate: 10 },
      warmMeasurement: { enabled: false, minimumProcessesPerCandidate: 0, measurementIterationsPerProcess: 0 },
      stress: { enabled: false, minimumProcessesPerCandidate: 0 },
      trace: { enabled: false, minimumProcessesPerCandidate: 0 },
      leak: { enabled: false, minimumProcessesPerCandidate: 0 },
    },
  });
  const unit = plan.core.processUnits.find(({ candidateId }) => candidateId === template.source.candidate.id)!;
  const hardwareCellId = deriveHardwareCellIdV1({
    candidateId: unit.candidateId,
    hardwareProfileId: plan.core.hardwareProfileId,
    hardwareBindingSha256: plan.core.hardwareBindingSha256,
    fixtureContractId: plan.core.fixtureContractId,
    fixtureSemanticSha256: plan.core.fixtureSemanticSha256,
    expectedSourceCommitSha: plan.core.expectedSourceCommitSha,
    expectedBuildSha256: plan.core.expectedBuildSha256,
    scenarioId: unit.scenarioId as CanonicalIdV1,
  });
  const invocation = createRunInvocationV1(plan, { createdUtc: '2026-08-20T12:00:00.000Z', outputRoot: '.benchmark-results', runnerSourceSha: testRunnerSourceShaV1, selectedSlotIds: [unit.ids.slotId] });
  const plannedRun = invocation.processUnits.find(({ slotId }) => slotId === unit.ids.slotId)!.runs[0]!;
  const capabilityIds = deriveTelemetryCapabilityIdsV1({ scenarioId: unit.scenarioId as CanonicalIdV1, phase: plannedRun.phase, backend: 'three-webgl2' });
  const buffer = createTelemetryBufferV1({
    runId: plannedRun.runId,
    planId: plan.runPlanId,
    scenarioId: unit.scenarioId as CanonicalIdV1,
    phase: plannedRun.phase,
    backend: 'three-webgl2',
    telemetryMode: 'telemetry-enabled-minimal',
    iterations: plannedRun.iterationIds.map((iterationId, iterationOrdinal) => ({ iterationId, iterationOrdinal })),
    realms: [{ realmId: id('main'), realm: 'main', timeOriginEpochMs: 1000 }],
    capabilities: capabilityIds.map((capabilityId) => ({
      id: capabilityId,
      value: { status: 'declared' as const, value: true as const, sourceRef: id('plan'), stability: 'run-config' as const },
    })),
  });
  expect(buffer.append({
    realmId: id('main'), startMs: 1, kind: 'sample', name: 'draw-submit.cpu', iterationId: plannedRun.iterationIds[0]!,
    fields: { sampleKind: 'duration', sourceUnit: 'ms', value: 1, operationId: id('operation-1'), spanId: id('span-1') },
  }).status).toBe('accepted');
  const telemetryExport = buffer.seal();
  const validationContext: BenchmarkValidationContextV1 = {
    ...createBenchmarkValidationContextV1({ scenarioId: 'backend-fixture-v1' }),
    fixture: template.source.fixture,
    candidate: template.source.candidate,
    runPlan: { id: plan.runPlanId, sha256: plan.runPlanSha256 },
    warmMeasurementEvidence: undefined,
  };
  return { template, hardwareCellId, plan, unit, invocation, plannedRun, telemetryExport, validationContext };
}

describe('BR03 run assembly and receipt integration v1', () => {
  it('uses the real BR02 adapter and BR01 validator/receipt over a synthetic ineligible run', async () => {
    const setupValue = setup();
    const { template, hardwareCellId, plan, unit, invocation, plannedRun, telemetryExport, validationContext } = setupValue;
    let adapterCalls = 0;
    const telemetryAdapter = createSinglePassTelemetryAdapterV1((...arguments_) => {
      adapterCalls += 1;
      return adaptTelemetryExportV1(...arguments_);
    });
    const run = assembleRunV1({
      plan, unit, plannedRun, createdUtc: '2026-08-20T12:00:00.000Z', hardwareCellId,
      source: template.source, environment: template.environment, telemetryExport,
      pageState: { visibility: 'visible', focus: 'focused', backgroundTabs: 0 }, origin: { kind: 'planned' },
      measurementEligibilityReasons: [{ code: 'fixture-contract-mismatch', detail: 'eligibility gate' as never, phase: 'cold' }],
      telemetryAdapter,
    });
    expect(run.iterations[0]!.samples.map(({ metricRef }) => metricRef)).toEqual(['draw.submit.cpu.ms@1']);
    expect(run.measurementEligible).toBe(false);
    const document = assembleHardwareCellV1({
      hardwareCellId,
      hardwareProfileId: template.hardwareProfileId,
      scenarioId: unit.scenarioId,
      candidateId: unit.candidateId,
      source: template.source,
      environment: template.environment,
      processes: [{ unit, runs: [run] }],
      validationContext,
    });
    expect(() => assertBundleDocumentBindingsV1(document, plan, invocation)).not.toThrow();
    const browserProcess = document.browserProcesses[0]!;
    expect(() => assertBundleDocumentBindingsV1({
      ...document,
      browserProcesses: [{ ...browserProcess, ids: { ...browserProcess.ids, pairCellId: id('different-pair-cell') } }],
    }, plan, invocation)).toThrow(/not bound/);
    const tamperedRuns: readonly BenchmarkRunV1[] = [
      { ...run, ids: { ...run.ids, pairCellId: id('different-pair-cell') } },
      { ...run, createdUtc: '2026-08-20T12:00:01.000Z' as BenchmarkRunV1['createdUtc'] },
      { ...run, execution: { ...run.execution, iteration: run.execution.iteration + 1 } },
      { ...run, execution: { ...run.execution, order: { ...run.execution.order, scheme: 'single-candidate' } } },
      { ...run, execution: { ...run.execution, order: { ...run.execution.order, orderSeed: (run.execution.order.orderSeed + 1) as never } } },
    ];
    for (const tamperedRun of tamperedRuns) {
      expect(() => assertBundleDocumentBindingsV1({
        ...document,
        browserProcesses: [{ ...browserProcess, runs: [tamperedRun] }],
      }, plan, invocation)).toThrow(/not bound/);
    }
    const rawTelemetry = serializeSealedTelemetryExportV1(telemetryExport);
    const minted = await mintReceiptV1({
      document,
      planId: plan.runPlanId,
      slotId: unit.ids.slotId,
      runId: plannedRun.runId,
      telemetryExportRawBytes: rawTelemetry,
      validatorSourceCommitSha: template.source.commitSha,
      validatorSourceFiles: [{ path: 'src/benchmark/contracts/validateV1.ts', absolutePath: resolve('src/benchmark/contracts/validateV1.ts') }],
      validationContext,
      telemetryAdapter,
    });
    expect(minted.receipt.status).toBe('schema-and-integrity-valid');
    expect(minted.receipt.telemetryDerivationEvidence.derivedSampleCount).toBe(1);
    expect(minted.receipt.runId).toBe(plannedRun.runId);
    expect(adapterCalls).toBe(plannedRun.iterationIds.length);

    const temporaryRoot = await mkdtemp(join(tmpdir(), 'br03-artifact-test-'));
    try {
      const outputRoot = join(temporaryRoot, '.benchmark-results');
      const invocationForOutput = { ...invocation, outputRoot };
      const protectedOutputRoot = join(temporaryRoot, 'evidence');
      await expect(createInvocationArtifactRootV1(protectedOutputRoot, temporaryRoot, plan, { ...invocation, outputRoot: protectedOutputRoot })).rejects.toThrow(/restricted/);
      const traversingOutputRoot = `${temporaryRoot}/.benchmark-results/../.benchmark-results`;
      await expect(createInvocationArtifactRootV1(traversingOutputRoot, temporaryRoot, plan, { ...invocation, outputRoot: traversingOutputRoot })).rejects.toThrow(/parent traversal/);
      const invocationRoot = await createInvocationArtifactRootV1(outputRoot, temporaryRoot, plan, invocationForOutput);
      const diagnosticPath = join(invocationRoot, 'failure-diagnostics', `${unit.ids.slotId}.json`);
      await expect(writeFailureDiagnosticV1(invocationRoot, unit.ids.slotId, 'handoff-failed', new Br02HandoffDriverErrorV1('popup-opened'), {
        handoffCode: 'popup-opened', timeoutOwner: 'none', exitCode: null, signal: null, childSignal: null, cleanupState: 'complete', expected: [], observed: [],
      }, () => { throw new Error('signal'); })).rejects.toThrow(/signal/);
      await expect(readFile(diagnosticPath)).rejects.toThrow();
      await writeFailureDiagnosticV1(invocationRoot, unit.ids.slotId, 'handoff-failed', new Br02HandoffDriverErrorV1('popup-opened'), {
        handoffCode: 'popup-opened', timeoutOwner: 'none', exitCode: null, signal: null, childSignal: null, cleanupState: 'complete', expected: [], observed: [],
      });
      expect(JSON.parse(await readFile(diagnosticPath, 'utf8'))).toMatchObject({ nativeCode: null, handoffCode: 'popup-opened' });
      await rm(diagnosticPath);
      const results = [{
        schemaVersion: 'br03-process-unit-result-v1' as const,
        slotId: unit.ids.slotId,
        browserProcessId: unit.ids.browserProcessId,
        disposition: 'valid' as const,
        failureClass: 'none' as const,
        failureCode: 'none' as const,
        runIds: [plannedRun.runId],
      }];
      await expect(writeInvocationClosureV1(invocationRoot, plan, invocationForOutput, [])).rejects.toThrow(/omit selected slots/);
      await expect(writeProcessUnitResultsV1(invocationRoot, results, () => { throw new Error('signal'); })).rejects.toThrow(/signal/);
      await expect(readFile(join(invocationRoot, 'process-unit-results.json'))).rejects.toThrow();
      await writeProcessUnitResultsV1(invocationRoot, results);
      const bundleId = deriveBundleIdV1(invocation.invocationId, hardwareCellId);
      const bundle = buildBenchmarkBundleV1({
        bundleId,
        createdUtc: '2026-08-20T12:00:00.000Z' as never,
        claimClass: 'correctness',
        document,
        closures: [{ runId: plannedRun.runId, telemetryExportRawBytes: rawTelemetry, receipt: minted.receipt, receiptCanonicalBytes: minted.receiptCanonicalBytes }],
      });
      const persistedContext: BenchmarkValidationContextV1 = {
        fixture: validationContext.fixture,
        candidate: validationContext.candidate,
        runPlan: validationContext.runPlan,
        schemaSetSha256: validationContext.schemaSetSha256,
        metricRegistrySha256: validationContext.metricRegistrySha256,
      };
      await expect(writeBundleClosureExclusiveV1(invocationRoot, id('interrupted-bundle'), persistedContext, bundle.files, () => { throw new Error('interrupted'); })).rejects.toThrow(/interrupted/);
      expect(await readdir(join(invocationRoot, 'bundles'))).toEqual([]);
      expect(await readdir(join(invocationRoot, 'bundle-contexts'))).toEqual([]);
      const bundleRoot = await writeBundleClosureExclusiveV1(invocationRoot, bundleId, persistedContext, bundle.files);
      await expect(writeInvocationClosureV1(invocationRoot, plan, invocationForOutput, results, () => { throw new Error('signal'); })).rejects.toThrow(/signal/);
      await expect(readFile(join(invocationRoot, 'invocation-closure.json'))).rejects.toThrow();
      await writeInvocationClosureV1(invocationRoot, plan, invocationForOutput, results);
      expect(await verifyInvocationControlV1(invocationRoot, plan, invocationForOutput, results)).toEqual([]);
      expect(await verifyInvocationClosureV1(invocationRoot, plan, invocationForOutput, results)).toEqual([]);
      expect(verifyWrittenBundleV1(bundleRoot, validationContext).valid).toBe(true);
      const originalResults = await readFile(join(invocationRoot, 'process-unit-results.json'));
      await expect(writeProcessUnitResultsV1(invocationRoot, [{ ...results[0]!, disposition: 'failed', failureClass: 'infrastructure', failureCode: 'artifact-write-failed', runIds: [] }])).rejects.toThrow();
      expect(await readFile(join(invocationRoot, 'process-unit-results.json'))).toEqual(originalResults);
      const originalContext = await readFile(join(invocationRoot, 'bundle-contexts', `${bundleId}.json`));
      const originalManifest = await readFile(join(bundleRoot, 'bundle-manifest.json'));
      await expect(writeBundleClosureExclusiveV1(invocationRoot, bundleId, persistedContext, bundle.files)).rejects.toThrow();
      expect(await readFile(join(invocationRoot, 'bundle-contexts', `${bundleId}.json`))).toEqual(originalContext);
      expect(await readFile(join(bundleRoot, 'bundle-manifest.json'))).toEqual(originalManifest);
      await expect(writeInvocationClosureV1(invocationRoot, plan, invocationForOutput, results)).rejects.toThrow();
      await expect(createInvocationArtifactRootV1(outputRoot, temporaryRoot, plan, invocationForOutput)).rejects.toThrow();
      await writeFile(join(bundleRoot, 'telemetry', `${plannedRun.runId}.json`), new Uint8Array([123, 125]));
      expect(verifyWrittenBundleV1(bundleRoot, validationContext).valid).toBe(false);
      expect(await verifyInvocationClosureV1(invocationRoot, plan, invocationForOutput, results)).not.toEqual([]);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('rejects telemetry from a different concrete run', () => {
    const setupValue = setup();
    expect(() => assembleRunV1({
      plan: setupValue.plan,
      unit: setupValue.unit,
      plannedRun: { ...setupValue.plannedRun, runId: id('different-run') },
      createdUtc: '2026-08-20T12:00:00.000Z',
      hardwareCellId: setupValue.template.hardwareCellId,
      source: setupValue.template.source,
      environment: setupValue.template.environment,
      telemetryExport: setupValue.telemetryExport,
      pageState: { visibility: 'visible', focus: 'focused', backgroundTabs: 0 },
      origin: { kind: 'planned' },
      measurementEligibilityReasons: [{ code: 'fixture-contract-mismatch', detail: 'eligibility gate' as never, phase: 'cold' }],
    })).toThrow(/telemetry does not match/);
  });

  it('rejects symlink or junction parent substitution before artifact mutation', async () => {
    const fixture = setup();
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'br03-artifact-link-test-'));
    try {
      const outputRoot = join(temporaryRoot, '.benchmark-results');
      const invocation = { ...fixture.invocation, outputRoot };
      const invocationRoot = await createInvocationArtifactRootV1(outputRoot, temporaryRoot, fixture.plan, invocation);
      const external = join(temporaryRoot, 'external');
      const contextRoot = join(invocationRoot, 'bundle-contexts');
      await mkdir(external);
      await rm(contextRoot, { recursive: true });
      await symlink(external, contextRoot, process.platform === 'win32' ? 'junction' : 'dir');
      const { warmMeasurementEvidence: _unused, ...persistedContext } = fixture.validationContext;
      await expect(writeBundleClosureExclusiveV1(invocationRoot, id('bundle'), persistedContext, [])).rejects.toThrow(/symbolic-link|junction/);
      expect(await readdir(external)).toEqual([]);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});

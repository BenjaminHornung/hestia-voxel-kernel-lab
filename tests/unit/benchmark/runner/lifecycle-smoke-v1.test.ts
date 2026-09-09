import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BenchmarkRunV1 } from '../../../../src/benchmark/contracts';
import { canonicalizeJsonV1 } from '../../../../src/benchmark/provenance';
import {
  verifyLifecycleSmokeArtifactsV1,
  writeLifecycleSmokeArtifactsV1,
} from '../../../../src/benchmark/runner/artifacts/artifactStoreV1';
import { assertLifecyclePreflightBindingsV1, lifecycleTerminalFailureCodeV1, parseLifecycleSmokePreflightConfigV1, runLifecycleSmokeV1 } from '../../../../src/benchmark/runner/live/lifecycleSmokeRunV1';
import { buildRunPlanV1 } from '../../../../src/benchmark/runner/plan/runPlanV1';
import { createBenchmarkCaseDocumentV1 } from '../../benchmark/contracts/benchmark-case-fixtures-v1';
import { runPlanInputV1 } from '../../../fixtures/benchmark/runner/runPlanInputV1';

const observed = (value: unknown) => ({ status: 'observed', value, sourceRef: 'test-source', stability: 'stable' });

describe('BR03 lifecycle-smoke contract v1', () => {
  it('keeps lifecycle failure codes inside the closed result vocabulary', () => {
    expect(lifecycleTerminalFailureCodeV1(true, 'scenario-unavailable', false)).toBe('required-metric-producers-unavailable');
    expect(lifecycleTerminalFailureCodeV1(false, 'scenario-unavailable', false)).toBe('scenario-unavailable');
    expect(lifecycleTerminalFailureCodeV1(false, 'source-preflight-rejected', false)).toBe('source-preflight-rejected');
  });

  it('parses only the closed canonical preflight shape', () => {
    const binding = { id: 'candidate-a', version: 1, sourceFileSetSha256: observed(`sha256:${'a'.repeat(64)}`), sourcePaths: observed(['src/main.ts']) };
    const input = {
      schemaVersion: 'br03-lifecycle-smoke-preflight-v1',
      fixtureSemanticPath: 'fixture-semantic.json',
      fixture: { id: 'wp04-golden-world-v1', version: 1, semanticSha256: observed(`sha256:${'b'.repeat(64)}`), sourceCommitSha: observed('a'.repeat(40)), sourceFileSetSha256: observed(`sha256:${'c'.repeat(64)}`), sourcePaths: observed(['fixture-semantic.json']) },
      candidates: [{ id: 'candidate-a', binding }],
    };
    expect(parseLifecycleSmokePreflightConfigV1(canonicalizeJsonV1(input))).toMatchObject({ schemaVersion: input.schemaVersion, fixtureSemanticPath: input.fixtureSemanticPath });
    expect(() => parseLifecycleSmokePreflightConfigV1(canonicalizeJsonV1({ ...input, extra: true }))).toThrow(/unexpected fields/);
  });

  it('rejects every supplied preflight candidate that is not bound to the plan', () => {
    const plan = buildRunPlanV1(runPlanInputV1());
    const candidate = plan.core.candidates[0]!;
    const preflight = {
      schemaVersion: 'br03-lifecycle-smoke-preflight-v1' as const,
      fixtureSemanticPath: 'fixture-semantic.json',
      fixture: { id: plan.core.fixtureContractId, semanticSha256: observed(plan.core.fixtureSemanticSha256) } as never,
      candidates: plan.core.candidates.map(({ id, sourceFileSetSha256 }) => ({ id, binding: { id, sourceFileSetSha256: observed(sourceFileSetSha256) } as never })),
    };
    expect(() => assertLifecyclePreflightBindingsV1(plan, preflight)).not.toThrow();
    expect(() => assertLifecyclePreflightBindingsV1(plan, {
      ...preflight,
      candidates: [...preflight.candidates, { id: 'unknown-candidate' as never, binding: { id: 'unknown-candidate', sourceFileSetSha256: observed(candidate.sourceFileSetSha256) } as never }],
    })).toThrow(/accepted plan/);
  });

  it('detects a changed raw lifecycle export', async () => {
    const root = await mkdtemp(join(tmpdir(), 'br03-lifecycle-artifacts-'));
    try {
      await mkdir(join(root, 'lifecycle-smoke'));
      const document = createBenchmarkCaseDocumentV1({ scenarioId: 'backend-fixture-v1', phase: 'cold', container: 'cold', samples: true }) as unknown as { readonly browserProcesses: readonly [{ readonly runs: readonly [BenchmarkRunV1] }] };
      const run = document.browserProcesses[0]!.runs[0]!;
      const executableSha256 = `sha256:${'a'.repeat(64)}` as never;
      const environment = { ...run.environment, browser: { ...run.environment.browser, executableSha256: observed(executableSha256) } } as BenchmarkRunV1['environment'];
      const ownedRun = { ...run, environment };
      const result = {
        schemaVersion: 'br03-process-unit-result-v1' as const,
        slotId: run.ids.slotId,
        browserProcessId: run.browserProcessId,
        disposition: 'unsupported' as const,
        failureClass: 'unsupported' as const,
         failureCode: 'required-metric-producers-unavailable' as const,
        runIds: [run.runId],
      };
      const artifactRoot = await writeLifecycleSmokeArtifactsV1(root, run.ids.slotId, ownedRun, environment, canonicalizeJsonV1({ runId: run.runId }), {
        schemaVersion: 'br03-lifecycle-ownership-v1', slotId: run.ids.slotId,
        preview: { host: '127.0.0.1', port: 43210, expectedHealthSha256: executableSha256, observedHealthSha256: executableSha256 },
        browser: { executableName: 'chromium', executableSha256, exitCode: 0, signal: null },
        cdp: { browserVersion: { product: null, protocolVersion: null, revision: null, userAgent: null, jsVersion: null }, probes: [
          { method: 'Browser.getVersion', status: 'unknown', responseSha256: null },
          { method: 'SystemInfo.getInfo', status: 'unknown', responseSha256: null },
          { method: 'Browser.getBrowserCommandLine', status: 'unknown', responseSha256: null },
        ] },
        cleanupState: 'complete',
      });
      expect(await verifyLifecycleSmokeArtifactsV1(root, [result])).toEqual([]);
      await writeFile(join(artifactRoot, 'telemetry-export.json'), new TextEncoder().encode('{"changed":true}'));
      expect(await verifyLifecycleSmokeArtifactsV1(root, [result])).toContainEqual(expect.stringMatching(/digest mismatch/));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('publishes a terminal provenance failure after invocation creation', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'br03-lifecycle-failure-'));
    try {
      const plan = buildRunPlanV1(runPlanInputV1());
      const unit = plan.core.processUnits[0]!;
      const outputRoot = join(projectRoot, '.benchmark-results');
      await expect(runLifecycleSmokeV1({
        plan,
        slotIndex: 0,
        createdUtc: '2026-08-20T12:00:00.000Z',
        outputRoot,
         projectRoot,
         runnerAuthority: {} as never,
         preflight: {
          schemaVersion: 'br03-lifecycle-smoke-preflight-v1',
          fixtureSemanticPath: 'fixture-semantic.json',
          fixture: { id: plan.core.fixtureContractId, semanticSha256: observed(plan.core.fixtureSemanticSha256) } as never,
          candidates: [{ id: unit.candidateId, binding: { id: unit.candidateId, sourceFileSetSha256: observed(`sha256:${'f'.repeat(64)}`) } as never }],
        },
      })).rejects.toThrow(/validated built-runner authority/);
      await expect(readdir(outputRoot)).rejects.toThrow();
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

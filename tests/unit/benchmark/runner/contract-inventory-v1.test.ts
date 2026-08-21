import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_ID_OWNERSHIP,
  BENCHMARK_METRIC_REGISTRY_V1,
  BENCHMARK_SCENARIO_REGISTRY_V1,
  BENCHMARK_SCHEMA_SET_BYTES_V1,
  BENCHMARK_WARMUP_RULE_V1,
  calculateRunBindingSha256V1,
  createBenchmarkValidationReceiptV1,
  recomputeWarmupStabilityV1,
  validateBenchmarkRunStructureV1,
  validateBenchmarkRunV1,
  type CanonicalIdV1,
} from '../../../../src/benchmark/contracts';
import { adaptTelemetryExportV1 } from '../../../../src/benchmark/adapters';
import {
  sourcePreflightV1,
  verifyBuildHandoffV1,
} from '../../../../src/benchmark/provenance';
import {
  BR02_BROWSER_HANDOFF_CONTRACT_ID,
  BR02_BROWSER_HANDOFF_QUERY_KEY,
  BR02_BROWSER_HANDOFF_SCHEMA_VERSION,
  BR02_BROWSER_RUNTIME_ACTIVATION,
  encodeBrowserTelemetryHandoffV1,
  type BrowserTelemetryHandoffEnvelopeV1,
} from '../../../../src/diagnostics/telemetry/browserHandoffV1';
import {
  serializeSealedTelemetryExportV1,
  validateTelemetryExportV1,
} from '../../../../src/diagnostics/telemetry/contractV1';

const id = (value: string): CanonicalIdV1 => value as CanonicalIdV1;

describe('BR03 integrated contract inventory v1', () => {
  it('imports every required BR01 and BR02 boundary from its owner', () => {
    expect([
      calculateRunBindingSha256V1,
      validateBenchmarkRunStructureV1,
      validateBenchmarkRunV1,
      createBenchmarkValidationReceiptV1,
      recomputeWarmupStabilityV1,
      sourcePreflightV1,
      verifyBuildHandoffV1,
      adaptTelemetryExportV1,
      validateTelemetryExportV1,
      serializeSealedTelemetryExportV1,
      encodeBrowserTelemetryHandoffV1,
    ].every((value) => typeof value === 'function')).toBe(true);
    expect(BENCHMARK_ID_OWNERSHIP).toBeDefined();
    expect(BENCHMARK_SCENARIO_REGISTRY_V1).toBeDefined();
    expect(BENCHMARK_METRIC_REGISTRY_V1).toBeDefined();
    expect(BENCHMARK_WARMUP_RULE_V1).toBeDefined();
    expect(BENCHMARK_SCHEMA_SET_BYTES_V1).toBeInstanceOf(Uint8Array);
  });

  it('uses the real BR02 encoder to create exactly one handoff query value', () => {
    const envelope: BrowserTelemetryHandoffEnvelopeV1 = {
      schemaVersion: BR02_BROWSER_HANDOFF_SCHEMA_VERSION,
      contractId: BR02_BROWSER_HANDOFF_CONTRACT_ID,
      runtimeActivation: BR02_BROWSER_RUNTIME_ACTIVATION,
      runId: id('br03-inventory-run'),
      planId: id('br03-inventory-plan'),
      scenarioId: id('mesh-golden-world-v1'),
      phase: 'measurement',
      backend: 'three-webgl2',
      telemetryMode: 'telemetry-enabled-minimal',
      iterations: [{ iterationId: id('br03-inventory-iteration-0'), iterationOrdinal: 0 }],
    };
    const query = new URLSearchParams();
    query.set(BR02_BROWSER_HANDOFF_QUERY_KEY, encodeBrowserTelemetryHandoffV1(envelope));

    expect(query.getAll(BR02_BROWSER_HANDOFF_QUERY_KEY)).toHaveLength(1);
  });
});

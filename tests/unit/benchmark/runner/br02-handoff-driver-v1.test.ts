import { describe, expect, it } from 'vitest';
import type { CapabilityAvailabilityV1, CanonicalIdV1 } from '../../../../src/benchmark/contracts/browserV1';
import { createTelemetryBufferV1 } from '../../../../src/diagnostics/telemetry/bufferV1';
import {
  BR02_BROWSER_HANDOFF_CONTRACT_ID,
  BR02_BROWSER_HANDOFF_SCHEMA_VERSION,
  BR02_BROWSER_RUNTIME_ACTIVATION,
  type BrowserTelemetryHandoffEnvelopeV1,
} from '../../../../src/diagnostics/telemetry/browserHandoffV1';
import { serializeSealedTelemetryExportV1 } from '../../../../src/diagnostics/telemetry/contractV1';
import {
  parseBr02ContractStatusV1,
  validateDownloadedTelemetryV1,
} from '../../../../src/benchmark/runner/browser/br02HandoffDriverV1';

const id = (value: string): CanonicalIdV1 => value as CanonicalIdV1;
const envelope = (): BrowserTelemetryHandoffEnvelopeV1 => ({
  schemaVersion: BR02_BROWSER_HANDOFF_SCHEMA_VERSION,
  contractId: BR02_BROWSER_HANDOFF_CONTRACT_ID,
  runtimeActivation: BR02_BROWSER_RUNTIME_ACTIVATION,
  runId: id('run'),
  planId: id('plan'),
  scenarioId: id('backend-fixture-v1'),
  phase: 'measurement',
  backend: 'three-webgl2',
  telemetryMode: 'telemetry-enabled-minimal',
  iterations: [{ iterationId: id('iteration-0'), iterationOrdinal: 0 }],
});

const capabilities = [
  'performance-time-origin', 'request-animation-frame', 'webgl-disjoint-timer-query',
  'webgl2', 'webgpu', 'webgpu-timestamp-query',
].map((capabilityId): { readonly id: CanonicalIdV1; readonly value: CapabilityAvailabilityV1 } => ({
  id: id(capabilityId),
  value: { status: 'declared', value: true, sourceRef: id('plan'), stability: 'run-config' },
}));

function rawExport(): Uint8Array {
  const expected = envelope();
  const buffer = createTelemetryBufferV1({
    runId: expected.runId,
    planId: expected.planId,
    scenarioId: expected.scenarioId,
    phase: expected.phase,
    backend: expected.backend,
    telemetryMode: expected.telemetryMode,
    iterations: expected.iterations,
    realms: [{ realmId: id('main'), realm: 'main', timeOriginEpochMs: 1000 }],
    capabilities,
  });
  return serializeSealedTelemetryExportV1(buffer.seal());
}

describe('BR03 BR02 handoff driver v1', () => {
  it('parses only the exact BR02 status grammar', () => {
    expect(parseBr02ContractStatusV1('contract=br-02-browser-telemetry-handoff-v1; version=1; state=ready; reason=none'))
      .toEqual({ state: 'ready', reason: 'none' });
    expect(() => parseBr02ContractStatusV1('state=ready')).toThrow(/status-mismatch/);
  });

  it('accepts only canonical BR02 bytes with exact envelope bindings', () => {
    const rawBytes = rawExport();
    expect(validateDownloadedTelemetryV1(rawBytes, envelope()).runId).toBe('run');
    expect(() => validateDownloadedTelemetryV1(
      new TextEncoder().encode(` ${new TextDecoder().decode(rawBytes)}`),
      envelope(),
    )).toThrow(/telemetry-noncanonical/);
    expect(() => validateDownloadedTelemetryV1(rawBytes, { ...envelope(), runId: id('other-run') }))
      .toThrow(/telemetry-binding-mismatch/);
  });
});

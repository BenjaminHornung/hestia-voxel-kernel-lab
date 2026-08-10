import { describe, expect, it } from 'vitest';
import { FrameIntervalTelemetry } from '../../src/diagnostics/telemetry';

describe('FrameIntervalTelemetry', () => {
  it('keeps a bounded sample window and reports current, p50, and p95', () => {
    const telemetry = new FrameIntervalTelemetry(3);
    telemetry.record(99);
    telemetry.record(10);
    telemetry.record(20);
    telemetry.record(30);
    telemetry.record(0);
    telemetry.record(Number.NaN);

    expect(telemetry.snapshot()).toEqual({ current: 30, p50: 20, p95: 30 });
  });
});

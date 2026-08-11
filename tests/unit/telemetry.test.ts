import { describe, expect, it } from 'vitest';
import { FrameIntervalTelemetry, summarizeDurations } from '../../src/diagnostics/telemetry';

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

describe('duration summaries', () => {
  it('reports total and nearest-rank percentiles without mutating samples', () => {
    const samples = [9, 1, 5, 3];
    expect(summarizeDurations(samples)).toEqual({ total: 18, p50: 3, p95: 9 });
    expect(samples).toEqual([9, 1, 5, 3]);
    expect(summarizeDurations([])).toEqual({ total: 0, p50: 0, p95: 0 });
    expect(() => summarizeDurations([1, Number.NaN])).toThrow(RangeError);
  });
});

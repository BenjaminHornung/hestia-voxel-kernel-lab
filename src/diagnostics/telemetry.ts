export interface FrameIntervalSnapshot {
  readonly current: number;
  readonly p50: number;
  readonly p95: number;
}

export class FrameIntervalTelemetry {
  readonly #samples: number[] = [];

  constructor(readonly capacity = 120) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('Telemetry capacity must be a positive integer.');
    }
  }

  record(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
      return;
    }
    this.#samples.push(milliseconds);
    if (this.#samples.length > this.capacity) {
      this.#samples.shift();
    }
  }

  snapshot(): FrameIntervalSnapshot {
    if (this.#samples.length === 0) {
      return { current: 0, p50: 0, p95: 0 };
    }
    const sorted = this.#samples.slice().sort((left, right) => left - right);
    const percentile = (value: number): number => sorted[Math.ceil(sorted.length * value) - 1] ?? 0;
    return {
      current: this.#samples.at(-1) ?? 0,
      p50: percentile(0.5),
      p95: percentile(0.95),
    };
  }
}

import type { CanonicalIdV1 } from '../../benchmark/contracts/browserV1';

export interface PerformanceLikeV1 {
  readonly timeOrigin: number;
  now(): number;
}

export interface MonotonicMarkerV1 {
  readonly realmId: CanonicalIdV1;
  readonly timeOriginMs: number;
  readonly nowMs: number;
  readonly absoluteMonotonicMs: number;
}

export interface TelemetryClockRegistrationV1 {
  readonly realmId: CanonicalIdV1;
  readonly timeOriginMs: number;
}

export interface MonotonicClockV1 {
  registerRealm(): TelemetryClockRegistrationV1;
  marker(): MonotonicMarkerV1;
  sourceTimestamp(startMs: number): number;
  hasAnomaly(): boolean;
  anomalyDetail(): string | null;
}

export class TelemetryClockAnomalyError extends RangeError {
  public constructor(detail: string) {
    super(detail);
    this.name = 'TelemetryClockAnomalyError';
  }
}

const CANONICAL_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;

function validId(value: string): boolean {
  return value.length > 0 && value.length <= 128 && CANONICAL_ID.test(value);
}

function validNumber(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && !Object.is(value, -0) && (!Number.isInteger(value) || Number.isSafeInteger(value));
}

export function createMonotonicClockV1(realmId: CanonicalIdV1, performanceLike: PerformanceLikeV1): MonotonicClockV1 {
  if (!validId(realmId)) throw new TypeError('BR02 clock realm ID is not canonical.');

  let registered = false;
  let registeredOrigin = 0;
  let lastAbsolute: number | null = null;
  let anomaly: string | null = null;

  const failClock = (detail: string): never => {
    anomaly ??= detail;
    throw new TelemetryClockAnomalyError(anomaly);
  };

  const registerRealm = (): TelemetryClockRegistrationV1 => {
    const origin = performanceLike.timeOrigin;
    if (!validNumber(origin)) failClock('br02-clock-invalid');
    if (registered) {
      if (origin !== registeredOrigin) failClock('br02-clock-invalid');
      return Object.freeze({ realmId, timeOriginMs: registeredOrigin });
    }
    registered = true;
    registeredOrigin = origin;
    return Object.freeze({ realmId, timeOriginMs: registeredOrigin });
  };

  const marker = (): MonotonicMarkerV1 => {
    if (anomaly !== null) failClock(anomaly);
    if (!registered) registerRealm();
    const origin = performanceLike.timeOrigin;
    const now = performanceLike.now();
    if (!validNumber(origin) || !validNumber(now) || origin !== registeredOrigin) failClock('br02-clock-invalid');
    const absoluteMonotonicMs = origin + now;
    if (!validNumber(absoluteMonotonicMs)) failClock('br02-clock-invalid');
    if (lastAbsolute !== null && absoluteMonotonicMs < lastAbsolute) failClock('br02-clock-invalid');
    lastAbsolute = absoluteMonotonicMs;
    return Object.freeze({ realmId, timeOriginMs: origin, nowMs: now, absoluteMonotonicMs });
  };

  return Object.freeze({
    registerRealm,
    marker,
    sourceTimestamp(startMs: number): number {
      if (!validNumber(startMs)) failClock('br02-clock-invalid');
      return startMs;
    },
    hasAnomaly(): boolean {
      return anomaly !== null;
    },
    anomalyDetail(): string | null {
      return anomaly;
    },
  });
}

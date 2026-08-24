import type {
  AvailabilityV1,
  BenchmarkCandidateBindingV1,
  BenchmarkFixtureContractBindingV1,
  CanonicalIdV1,
  GitShaV1,
  NonEmptyReadonlyArray,
  RepositoryRelativePathV1,
  SafePositiveIntegerV1,
  Sha256DigestV1,
} from '../../contracts';
import { repositoryRelativePathV1 } from '../../provenance';

const ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const GIT_SHA = /^[0-9a-f]{40}$/;
const AVAILABILITY_STATUSES = new Set(['unknown', 'unsupported', 'not-requested', 'not-active', 'permission-denied', 'blocked', 'error']);
const OBSERVED_STABILITY = new Set(['stable', 'experimental', 'platform-specific']);
const DECLARED_STABILITY = new Set(['owner-binding', 'run-config', 'browser-default']);

export function closedPreflightObjectV1(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  const object = value as Record<string, unknown>;
  const expected = new Set(keys);
  if (Object.keys(object).length !== keys.length || Object.keys(object).some((key) => !expected.has(key))) {
    throw new TypeError(`${label} has missing or unexpected fields.`);
  }
  return object;
}

function canonicalIdV1(value: unknown, label: string): CanonicalIdV1 {
  if (typeof value !== 'string' || !ID.test(value)) throw new TypeError(`${label} is not a canonical ID.`);
  return value as CanonicalIdV1;
}

function digestV1(value: unknown, label: string): Sha256DigestV1 {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new TypeError(`${label} is not a SHA-256 digest.`);
  return value as Sha256DigestV1;
}

function gitShaV1(value: unknown, label: string): GitShaV1 {
  if (typeof value !== 'string' || !GIT_SHA.test(value)) throw new TypeError(`${label} is not a Git SHA.`);
  return value as GitShaV1;
}

function positiveIntegerV1(value: unknown, label: string): SafePositiveIntegerV1 {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new TypeError(`${label} is not a positive safe integer.`);
  return value as SafePositiveIntegerV1;
}

function nonEmptyPathsV1(value: unknown, label: string): NonEmptyReadonlyArray<RepositoryRelativePathV1> {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError(`${label} must be a non-empty path array.`);
  const paths = value.map((entry, index) => {
    if (typeof entry !== 'string') throw new TypeError(`${label}[${index}] must be a path string.`);
    return repositoryRelativePathV1(entry);
  });
  if (new Set(paths).size !== paths.length || new Set(paths.map((path) => path.toLowerCase())).size !== paths.length) {
    throw new TypeError(`${label} contains duplicate or case-conflicting paths.`);
  }
  return paths as unknown as NonEmptyReadonlyArray<RepositoryRelativePathV1>;
}

function availabilityV1<T>(value: unknown, label: string, parseValue: (value: unknown, label: string) => T): AvailabilityV1<T> {
  const object = closedPreflightObjectV1(value, ['status', 'value', 'sourceRef', 'stability'], label);
  const status = object.status;
  const sourceRef = canonicalIdV1(object.sourceRef, `${label}.sourceRef`);
  if (status === 'observed' || status === 'declared') {
    if (typeof object.stability !== 'string'
      || !(status === 'observed' ? OBSERVED_STABILITY : DECLARED_STABILITY).has(object.stability)) {
      throw new TypeError(`${label}.stability is invalid.`);
    }
    return {
      status,
      value: parseValue(object.value, `${label}.value`),
      sourceRef,
      stability: object.stability,
    } as AvailabilityV1<T>;
  }
  if (typeof status !== 'string' || !AVAILABILITY_STATUSES.has(status) || object.value !== null || typeof object.stability !== 'undefined') {
    throw new TypeError(`${label} availability is invalid.`);
  }
  throw new TypeError(`${label} unavailable bindings must use reasonCode.`);
}

function unavailableAvailabilityV1<T>(value: unknown, label: string): AvailabilityV1<T> {
  const object = closedPreflightObjectV1(value, ['status', 'value', 'sourceRef', 'reasonCode'], label);
  const status = object.status;
  if (typeof status !== 'string' || !AVAILABILITY_STATUSES.has(status) || object.value !== null) throw new TypeError(`${label} availability is invalid.`);
  return {
    status,
    value: null,
    sourceRef: canonicalIdV1(object.sourceRef, `${label}.sourceRef`),
    reasonCode: canonicalIdV1(object.reasonCode, `${label}.reasonCode`),
  } as AvailabilityV1<T>;
}

function parseAvailabilityV1<T>(value: unknown, label: string, parseValue: (value: unknown, label: string) => T): AvailabilityV1<T> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an availability object.`);
  const status = (value as Record<string, unknown>).status;
  return status === 'observed' || status === 'declared'
    ? availabilityV1(value, label, parseValue)
    : unavailableAvailabilityV1(value, label);
}

export function parseCandidateBindingV1(value: unknown, label: string): BenchmarkCandidateBindingV1 {
  const object = closedPreflightObjectV1(value, ['id', 'version', 'sourceFileSetSha256', 'sourcePaths'], label);
  return {
    id: canonicalIdV1(object.id, `${label}.id`),
    version: positiveIntegerV1(object.version, `${label}.version`),
    sourceFileSetSha256: parseAvailabilityV1(object.sourceFileSetSha256, `${label}.sourceFileSetSha256`, digestV1),
    sourcePaths: parseAvailabilityV1(object.sourcePaths, `${label}.sourcePaths`, nonEmptyPathsV1),
  };
}

export function parseFixtureBindingV1(value: unknown, label: string): BenchmarkFixtureContractBindingV1 {
  const object = closedPreflightObjectV1(value, ['id', 'version', 'semanticSha256', 'sourceCommitSha', 'sourceFileSetSha256', 'sourcePaths'], label);
  return {
    id: canonicalIdV1(object.id, `${label}.id`),
    version: positiveIntegerV1(object.version, `${label}.version`),
    semanticSha256: parseAvailabilityV1(object.semanticSha256, `${label}.semanticSha256`, digestV1),
    sourceCommitSha: parseAvailabilityV1(object.sourceCommitSha, `${label}.sourceCommitSha`, gitShaV1),
    sourceFileSetSha256: parseAvailabilityV1(object.sourceFileSetSha256, `${label}.sourceFileSetSha256`, digestV1),
    sourcePaths: parseAvailabilityV1(object.sourcePaths, `${label}.sourcePaths`, nonEmptyPathsV1),
  };
}

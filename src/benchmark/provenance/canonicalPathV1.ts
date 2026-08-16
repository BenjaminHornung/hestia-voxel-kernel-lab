import type { CanonicalRelativePathV1 } from '../contracts/typesV1';
import { compareUtf16 } from './canonicalJsonV1';

const PATH_PATTERN = /^[a-z0-9](?:[a-z0-9._/-]*[a-z0-9._-])?$/;
const PATH_MAX_CODE_UNITS = 512;

export class CanonicalPathError extends RangeError {
  public constructor(message: string) {
    super(message);
    this.name = 'CanonicalPathError';
  }
}

export function assertCanonicalRelativePathV1(path: string): asserts path is CanonicalRelativePathV1 {
  if (typeof path !== 'string' || path.length === 0) throw new CanonicalPathError('Path must be non-empty.');
  if (path.length > PATH_MAX_CODE_UNITS) throw new CanonicalPathError('Path exceeds 512 code units.');
  if (!PATH_PATTERN.test(path)) throw new CanonicalPathError(`Non-canonical relative path: ${path}`);
  const segments = path.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new CanonicalPathError(`Path contains an empty or traversal segment: ${path}`);
  }
  if (path.includes('\\') || path.includes(':') || path.includes('\0') || path.startsWith('/')) {
    throw new CanonicalPathError(`Path contains a forbidden separator or prefix: ${path}`);
  }
}

export function canonicalRelativePathV1(path: string): CanonicalRelativePathV1 {
  assertCanonicalRelativePathV1(path);
  return path;
}

export function isCanonicalRelativePathV1(path: unknown): path is CanonicalRelativePathV1 {
  if (typeof path !== 'string') return false;
  try {
    assertCanonicalRelativePathV1(path);
    return true;
  } catch {
    return false;
  }
}

export function compareCanonicalRelativePathsV1(left: string, right: string): number {
  assertCanonicalRelativePathV1(left);
  assertCanonicalRelativePathV1(right);
  return compareUtf16(left, right);
}

export function sortCanonicalRelativePathsV1<T extends { readonly path: string }>(
  entries: readonly T[],
): T[] {
  return [...entries].sort((left, right) => compareCanonicalRelativePathsV1(left.path, right.path));
}

import type { BuildRelativePathV1, BundleRelativePathV1, CanonicalRelativePathV1, RepositoryRelativePathV1 } from '../contracts/typesV1';
import { compareUtf16 } from './canonicalJsonV1';

const BUNDLE_PATH_PATTERN = /^[a-z0-9](?:[a-z0-9._/-]*[a-z0-9._-])?$/;
const REPOSITORY_PATH_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._/-]*[A-Za-z0-9._-])?$/;
const BUILD_PATH_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._/-]*[A-Za-z0-9._-])?$/;
const PATH_MAX_CODE_UNITS = 512;
const WINDOWS_RESERVED_BASENAMES = new Set(['con', 'prn', 'aux', 'nul', 'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9', 'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9']);

export class CanonicalPathError extends RangeError {
  public constructor(message: string) {
    super(message);
    this.name = 'CanonicalPathError';
  }
}

function assertPath(path: string, pattern: RegExp, owner: string): void {
  if (typeof path !== 'string' || path.length === 0) throw new CanonicalPathError('Path must be non-empty.');
  if (path.length > PATH_MAX_CODE_UNITS) throw new CanonicalPathError('Path exceeds 512 code units.');
  if (!pattern.test(path)) throw new CanonicalPathError(`Non-canonical ${owner}-relative path: ${path}`);
  const segments = path.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new CanonicalPathError(`Path contains an empty or traversal segment: ${path}`);
  }
  if (path.includes('\\') || path.includes(':') || path.includes('\0') || path.startsWith('/')) {
    throw new CanonicalPathError(`Path contains a forbidden separator or prefix: ${path}`);
  }
}

export function assertBundleRelativePathV1(path: string): asserts path is BundleRelativePathV1 {
  assertPath(path, BUNDLE_PATH_PATTERN, 'bundle');
  for (const segment of path.split('/')) {
    const basename = segment.slice(0, segment.indexOf('.') < 0 ? segment.length : segment.indexOf('.'));
    if (WINDOWS_RESERVED_BASENAMES.has(basename)) throw new CanonicalPathError(`Bundle path uses a Windows reserved basename: ${path}`);
    if (segment.endsWith('.') || segment.endsWith(' ')) throw new CanonicalPathError(`Bundle path uses a Windows-trailing alias: ${path}`);
  }
}

export function bundleRelativePathV1(path: string): BundleRelativePathV1 {
  assertBundleRelativePathV1(path);
  return path;
}

export function isBundleRelativePathV1(path: unknown): path is BundleRelativePathV1 {
  if (typeof path !== 'string') return false;
  try {
    assertBundleRelativePathV1(path);
    return true;
  } catch {
    return false;
  }
}

export function assertRepositoryRelativePathV1(path: string): asserts path is RepositoryRelativePathV1 {
  assertPath(path, REPOSITORY_PATH_PATTERN, 'repository');
}

export function repositoryRelativePathV1(path: string): RepositoryRelativePathV1 {
  assertRepositoryRelativePathV1(path);
  return path;
}

export function isRepositoryRelativePathV1(path: unknown): path is RepositoryRelativePathV1 {
  if (typeof path !== 'string') return false;
  try {
    assertRepositoryRelativePathV1(path);
    return true;
  } catch {
    return false;
  }
}

export function assertBuildRelativePathV1(path: string): asserts path is BuildRelativePathV1 {
  assertPath(path, BUILD_PATH_PATTERN, 'build');
}

export function buildRelativePathV1(path: string): BuildRelativePathV1 {
  assertBuildRelativePathV1(path);
  return path;
}

export function isBuildRelativePathV1(path: unknown): path is BuildRelativePathV1 {
  if (typeof path !== 'string') return false;
  try {
    assertBuildRelativePathV1(path);
    return true;
  } catch {
    return false;
  }
}

/** @deprecated Use bundleRelativePathV1. */
export function assertCanonicalRelativePathV1(path: string): asserts path is CanonicalRelativePathV1 {
  assertBundleRelativePathV1(path);
}

/** @deprecated Use bundleRelativePathV1. */
export function canonicalRelativePathV1(path: string): CanonicalRelativePathV1 {
  assertBundleRelativePathV1(path);
  return path;
}

/** @deprecated Use isBundleRelativePathV1. */
export function isCanonicalRelativePathV1(path: unknown): path is CanonicalRelativePathV1 {
  return isBundleRelativePathV1(path);
}

function comparePaths(left: string, right: string, assertPathForOwner: (path: string) => void): number {
  assertPathForOwner(left);
  assertPathForOwner(right);
  return compareUtf16(left, right);
}

export function compareBundleRelativePathsV1(left: string, right: string): number {
  return comparePaths(left, right, assertBundleRelativePathV1);
}

export function compareRepositoryRelativePathsV1(left: string, right: string): number {
  return comparePaths(left, right, assertRepositoryRelativePathV1);
}

export function compareBuildRelativePathsV1(left: string, right: string): number {
  return comparePaths(left, right, assertBuildRelativePathV1);
}

/** @deprecated Use compareBundleRelativePathsV1. */
export function compareCanonicalRelativePathsV1(left: string, right: string): number {
  return compareBundleRelativePathsV1(left, right);
}

function sortPaths<T extends { readonly path: string }>(
  entries: readonly T[],
  compare: (left: string, right: string) => number,
): T[] {
  return [...entries].sort((left, right) => compare(left.path, right.path));
}

export function sortBundleRelativePathsV1<T extends { readonly path: string }>(entries: readonly T[]): T[] {
  return sortPaths(entries, compareBundleRelativePathsV1);
}

export function sortRepositoryRelativePathsV1<T extends { readonly path: string }>(entries: readonly T[]): T[] {
  return sortPaths(entries, compareRepositoryRelativePathsV1);
}

export function sortBuildRelativePathsV1<T extends { readonly path: string }>(entries: readonly T[]): T[] {
  return sortPaths(entries, compareBuildRelativePathsV1);
}

/** @deprecated Use sortBundleRelativePathsV1. */
export function sortCanonicalRelativePathsV1<T extends { readonly path: string }>(entries: readonly T[]): T[] {
  return sortBundleRelativePathsV1(entries);
}

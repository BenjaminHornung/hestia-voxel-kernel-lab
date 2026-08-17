import { createHash, timingSafeEqual } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, openSync, readSync, readdirSync, realpathSync, type Stats } from 'node:fs';
import { join } from 'node:path';
import { BENCHMARK_DIGEST_DOMAINS, BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1 } from '../contracts/versions';
import type { BuildRelativePathV1, BundleRelativePathV1, RepositoryRelativePathV1, Sha256DigestV1 } from '../contracts/typesV1';
import {
  assertBuildRelativePathV1,
  assertBundleRelativePathV1,
  assertRepositoryRelativePathV1,
  compareBuildRelativePathsV1,
  compareBundleRelativePathsV1,
  compareRepositoryRelativePathsV1,
} from './canonicalPathV1';

export interface FileSetEntryV1<Path extends string = RepositoryRelativePathV1> {
  readonly path: Path;
  readonly bytes: Uint8Array;
}

export type FileSetEntryInputV1 = FileSetEntryV1<string>;
export type RepositoryFileSetEntryV1 = FileSetEntryV1<RepositoryRelativePathV1>;
export type BuildFileSetEntryV1 = FileSetEntryV1<BuildRelativePathV1>;
export type BundleFileSetEntryV1 = FileSetEntryV1<BundleRelativePathV1>;

export type FileSetDigestDomainV1 = keyof typeof BENCHMARK_DIGEST_DOMAINS;

export interface FileSetResourceLimitsInputV1 {
  readonly maxFiles?: number;
  readonly maxFileBytes?: number;
  readonly maxAggregateBytes?: number;
  readonly digestChunkBytes?: number;
}

interface FileSetResourceLimitsV1 {
  readonly maxFiles: number;
  readonly maxFileBytes: number;
  readonly maxAggregateBytes: number;
  readonly digestChunkBytes: number;
}

export interface FileSetPathInputV1<Path extends string = string> {
  readonly path: Path;
  readonly absolutePath: string;
}

export interface FileSetPathDescriptorV1<Path extends string = string> extends FileSetPathInputV1<Path> {
  readonly byteLength: number;
}

export interface FileSetDigestSummaryV1 {
  readonly digest: Sha256DigestV1;
  readonly fileCount: number;
  readonly totalBytes: number;
}

export interface FileSetReaderEntryInputV1<Path extends string = string> {
  readonly path: Path;
  readonly read: () => Uint8Array;
}

const MAX_U32 = 0xffff_ffff;
const MAX_U64 = 0xffff_ffff_ffff_ffffn;

function assertU32(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_U32) {
    throw new RangeError(`${label} must fit in u32.`);
  }
}

function u32be(value: number): Uint8Array {
  assertU32(value, 'u32 value');
  const output = new Uint8Array(4);
  new DataView(output.buffer).setUint32(0, value, false);
  return output;
}

function u64be(value: bigint): Uint8Array {
  if (value < 0n || value > MAX_U64) throw new RangeError('u64 value is out of range.');
  const output = new Uint8Array(8);
  new DataView(output.buffer).setBigUint64(0, value, false);
  return output;
}

function digestString(bytes: Uint8Array): Sha256DigestV1 {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}` as Sha256DigestV1;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

export function sha256BytesV1(bytes: Uint8Array): Sha256DigestV1 {
  return digestString(bytes);
}

function resolveLimits(input: FileSetResourceLimitsInputV1 | undefined): FileSetResourceLimitsV1 {
  const limits: FileSetResourceLimitsV1 = {
    maxFiles: input?.maxFiles ?? BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.maxFiles,
    maxFileBytes: input?.maxFileBytes ?? BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.maxFileBytes,
    maxAggregateBytes: input?.maxAggregateBytes ?? BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.maxAggregateBytes,
    digestChunkBytes: input?.digestChunkBytes ?? BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.digestChunkBytes,
  };
  for (const key of ['maxFiles', 'maxFileBytes', 'maxAggregateBytes', 'digestChunkBytes'] as const) {
    const value = limits[key];
    const maximum = BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1[key];
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
      throw new RangeError(`${key} must be a positive integer no greater than the v1 limit.`);
    }
  }
  return limits;
}

function pathPolicy(domain: FileSetDigestDomainV1): {
  readonly assert: (path: string) => void;
  readonly compare: (left: string, right: string) => number;
} {
  if (domain === 'build') return { assert: assertBuildRelativePathV1, compare: compareBuildRelativePathsV1 };
  if (domain === 'bundle') return { assert: assertBundleRelativePathV1, compare: compareBundleRelativePathsV1 };
  return { assert: assertRepositoryRelativePathV1, compare: compareRepositoryRelativePathsV1 };
}

function prepareByteEntries(
  entries: readonly FileSetEntryInputV1[],
  domain: FileSetDigestDomainV1,
  limits: FileSetResourceLimitsV1,
): FileSetEntryInputV1[] {
  if (entries.length === 0) throw new RangeError('A v1 fileset must contain at least one file.');
  if (entries.length > limits.maxFiles) throw new RangeError('Fileset file count exceeds the v1 limit.');
  assertU32(entries.length, 'File count');
  const policy = pathPolicy(domain);
  const sorted = [...entries].sort((left, right) => policy.compare(left.path, right.path));
  const seen = new Set<string>();
  let totalBytes = 0;
  for (const entry of sorted) {
    policy.assert(entry.path);
    if (seen.has(entry.path)) throw new RangeError(`Duplicate fileset path ${entry.path}.`);
    seen.add(entry.path);
    if (!(entry.bytes instanceof Uint8Array)) throw new TypeError(`File ${entry.path} does not contain bytes.`);
    if (entry.bytes.byteLength > limits.maxFileBytes || BigInt(entry.bytes.byteLength) > MAX_U64) throw new RangeError(`File ${entry.path} is too large.`);
    totalBytes += entry.bytes.byteLength;
    if (totalBytes > limits.maxAggregateBytes) throw new RangeError('Fileset aggregate bytes exceed the v1 limit.');
  }
  return sorted;
}

function updateHashHeader(hash: ReturnType<typeof createHash>, fileCount: number, domain: FileSetDigestDomainV1): void {
  hash.update(new TextEncoder().encode(BENCHMARK_DIGEST_DOMAINS[domain]));
  hash.update(u32be(fileCount));
}

function updateHashEntry(hash: ReturnType<typeof createHash>, path: string, bytes: Uint8Array): void {
  const pathBytes = new TextEncoder().encode(path);
  hash.update(u32be(pathBytes.byteLength));
  hash.update(pathBytes);
  hash.update(u64be(BigInt(bytes.byteLength)));
  hash.update(bytes);
}

function updateHashEntryHeader(hash: ReturnType<typeof createHash>, path: string, byteLength: number): void {
  const pathBytes = new TextEncoder().encode(path);
  hash.update(u32be(pathBytes.byteLength));
  hash.update(pathBytes);
  hash.update(u64be(BigInt(byteLength)));
}

export function digestFileSetV1(
  entries: readonly FileSetEntryInputV1[],
  domain: FileSetDigestDomainV1 = 'fileset',
  limits?: FileSetResourceLimitsInputV1,
): Sha256DigestV1 {
  const resolvedLimits = resolveLimits(limits);
  const sorted = prepareByteEntries(entries, domain, resolvedLimits);
  const hash = createHash('sha256');
  updateHashHeader(hash, sorted.length, domain);
  for (const entry of sorted) updateHashEntry(hash, entry.path, entry.bytes);
  return `sha256:${hash.digest('hex')}` as Sha256DigestV1;
}

export const digestFilesetV1 = digestFileSetV1;

export function digestFileSetReadersV1(
  entries: readonly FileSetReaderEntryInputV1[],
  domain: FileSetDigestDomainV1 = 'fileset',
  limits?: FileSetResourceLimitsInputV1,
): FileSetDigestSummaryV1 {
  const resolvedLimits = resolveLimits(limits);
  if (entries.length === 0) throw new RangeError('A v1 fileset must contain at least one file.');
  if (entries.length > resolvedLimits.maxFiles) throw new RangeError('Fileset file count exceeds the v1 limit.');
  const policy = pathPolicy(domain);
  const sorted = [...entries].sort((left, right) => policy.compare(left.path, right.path));
  const seen = new Set<string>();
  for (const entry of sorted) {
    policy.assert(entry.path);
    if (seen.has(entry.path)) throw new RangeError(`Duplicate fileset path ${entry.path}.`);
    seen.add(entry.path);
  }
  const hash = createHash('sha256');
  updateHashHeader(hash, sorted.length, domain);
  let totalBytes = 0;
  for (const entry of sorted) {
    const bytes = entry.read();
    if (!(bytes instanceof Uint8Array)) throw new TypeError(`File ${entry.path} does not contain bytes.`);
    if (bytes.byteLength > resolvedLimits.maxFileBytes) throw new RangeError(`File ${entry.path} is too large.`);
    totalBytes += bytes.byteLength;
    if (totalBytes > resolvedLimits.maxAggregateBytes) throw new RangeError('Fileset aggregate bytes exceed the v1 limit.');
    updateHashEntry(hash, entry.path, bytes);
  }
  return { digest: `sha256:${hash.digest('hex')}` as Sha256DigestV1, fileCount: sorted.length, totalBytes };
}

export function digestBuildV1(entries: readonly FileSetEntryInputV1[]): Sha256DigestV1 {
  return digestFileSetV1(entries, 'build');
}

export function digestBundleV1(entries: readonly FileSetEntryInputV1[]): Sha256DigestV1 {
  return digestFileSetV1(entries, 'bundle');
}

export function digestFileBytesV1(bytes: Uint8Array): Sha256DigestV1 {
  return sha256BytesV1(bytes);
}

export function frameFileSetV1(
  entries: readonly FileSetEntryInputV1[],
  domain: FileSetDigestDomainV1 = 'fileset',
  limits?: FileSetResourceLimitsInputV1,
): Uint8Array {
  const resolvedLimits = resolveLimits(limits);
  const sorted = prepareByteEntries(entries, domain, resolvedLimits);
  const frames: Uint8Array[] = [new TextEncoder().encode(BENCHMARK_DIGEST_DOMAINS[domain]), u32be(sorted.length)];
  for (const entry of sorted) {
    const pathBytes = new TextEncoder().encode(entry.path);
    frames.push(u32be(pathBytes.byteLength), pathBytes, u64be(BigInt(entry.bytes.byteLength)), entry.bytes);
  }
  return concat(frames);
}

function isRegularFile(stat: { isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean }): boolean {
  return stat.isFile() && !stat.isDirectory() && !stat.isSymbolicLink();
}

function snapshotEqual(
  left: { readonly dev: number; readonly ino: number; readonly mode: number; readonly size: number; readonly mtimeMs: number; readonly ctimeMs: number; readonly birthtimeMs: number },
  right: { readonly dev: number; readonly ino: number; readonly mode: number; readonly size: number; readonly mtimeMs: number; readonly ctimeMs: number; readonly birthtimeMs: number },
): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs
    && left.birthtimeMs === right.birthtimeMs;
}

function checkedFileStat(absolutePath: string, limits: FileSetResourceLimitsV1): Stats {
  const stat = lstatSync(absolutePath, { bigint: false, throwIfNoEntry: true }) as Stats;
  if (!isRegularFile(stat)) throw new Error(`Unsupported file type: ${absolutePath}.`);
  if (!Number.isSafeInteger(stat.size) || stat.size < 0 || stat.size > limits.maxFileBytes) {
    throw new Error(`File exceeds the v1 per-file limit: ${absolutePath}.`);
  }
  return stat;
}

function streamRegularFile(
  absolutePath: string,
  limits: FileSetResourceLimitsV1,
  onChunk: (chunk: Uint8Array) => void,
): number {
  const initial = checkedFileStat(absolutePath, limits);
  const fd = openSync(absolutePath, 'r');
  try {
    const opened = fstatSync(fd, { bigint: false }) as Stats;
    if (!isRegularFile(opened) || !snapshotEqual(initial, opened)) throw new Error(`File changed before reading: ${absolutePath}.`);
    const expectedBytes = opened.size;
    const buffer = new Uint8Array(Math.min(limits.digestChunkBytes, Math.max(1, expectedBytes)));
    let offset = 0;
    while (offset < expectedBytes) {
      const requested = Math.min(buffer.byteLength, expectedBytes - offset);
      const read = readSync(fd, buffer, 0, requested, offset);
      if (!Number.isSafeInteger(read) || read <= 0) throw new Error(`Partial file read: ${absolutePath}.`);
      offset += read;
      if (offset > limits.maxFileBytes) throw new Error(`File exceeds the v1 per-file limit: ${absolutePath}.`);
      onChunk(buffer.subarray(0, read));
    }
    const probe = new Uint8Array(1);
    if (readSync(fd, probe, 0, 1, offset) !== 0) throw new Error(`File changed while reading: ${absolutePath}.`);
    const closed = fstatSync(fd, { bigint: false }) as Stats;
    const final = lstatSync(absolutePath, { bigint: false, throwIfNoEntry: true }) as Stats;
    if (!isRegularFile(final) || !snapshotEqual(initial, closed) || !snapshotEqual(initial, final)) {
      throw new Error(`File changed while reading: ${absolutePath}.`);
    }
    return offset;
  } finally {
    closeSync(fd);
  }
}

export function readFileBytesV1(
  absolutePath: string,
  limits?: FileSetResourceLimitsInputV1,
): Uint8Array {
  const resolvedLimits = resolveLimits(limits);
  const stat = checkedFileStat(absolutePath, resolvedLimits);
  const output = new Uint8Array(stat.size);
  let offset = 0;
  const read = streamRegularFile(absolutePath, resolvedLimits, (chunk) => {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  });
  if (read !== output.byteLength || offset !== output.byteLength) throw new Error(`Partial file read: ${absolutePath}.`);
  return output;
}

export interface FileDigestSummaryV1 {
  readonly digest: Sha256DigestV1;
  readonly byteLength: number;
}

export function digestFilePathV1(
  absolutePath: string,
  limits?: FileSetResourceLimitsInputV1,
): FileDigestSummaryV1 {
  const resolvedLimits = resolveLimits(limits);
  const hash = createHash('sha256');
  let byteLength = 0;
  const read = streamRegularFile(absolutePath, resolvedLimits, (chunk) => {
    byteLength += chunk.byteLength;
    hash.update(chunk);
  });
  if (read !== byteLength) throw new Error(`Partial file read: ${absolutePath}.`);
  return { digest: `sha256:${hash.digest('hex')}` as Sha256DigestV1, byteLength };
}

function prepareStreamEntries(
  entries: readonly FileSetPathInputV1[],
  domain: FileSetDigestDomainV1,
  limits: FileSetResourceLimitsV1,
): FileSetPathDescriptorV1[] {
  if (entries.length === 0) throw new RangeError('A v1 fileset must contain at least one file.');
  if (entries.length > limits.maxFiles) throw new RangeError('Fileset file count exceeds the v1 limit.');
  const policy = pathPolicy(domain);
  const sorted = [...entries].sort((left, right) => policy.compare(left.path, right.path));
  const seen = new Set<string>();
  let totalBytes = 0;
  return sorted.map((entry) => {
    policy.assert(entry.path);
    if (seen.has(entry.path)) throw new RangeError(`Duplicate fileset path ${entry.path}.`);
    seen.add(entry.path);
    const stat = checkedFileStat(entry.absolutePath, limits);
    totalBytes += stat.size;
    if (totalBytes > limits.maxAggregateBytes) throw new RangeError('Fileset aggregate bytes exceed the v1 limit.');
    return { path: entry.path, absolutePath: entry.absolutePath, byteLength: stat.size };
  });
}

export function digestFileSetPathsV1(
  entries: readonly FileSetPathInputV1[],
  domain: FileSetDigestDomainV1 = 'fileset',
  limits?: FileSetResourceLimitsInputV1,
): FileSetDigestSummaryV1 {
  const resolvedLimits = resolveLimits(limits);
  const prepared = prepareStreamEntries(entries, domain, resolvedLimits);
  const hash = createHash('sha256');
  updateHashHeader(hash, prepared.length, domain);
  let totalBytes = 0;
  for (const entry of prepared) {
    updateHashEntryHeader(hash, entry.path, entry.byteLength);
    const read = streamRegularFile(entry.absolutePath, resolvedLimits, (chunk) => {
      totalBytes += chunk.byteLength;
      if (totalBytes > resolvedLimits.maxAggregateBytes) throw new Error('Fileset aggregate bytes exceed the v1 limit.');
      hash.update(chunk);
    });
    if (read !== entry.byteLength) throw new Error(`File length changed while reading: ${entry.path}.`);
  }
  return { digest: `sha256:${hash.digest('hex')}` as Sha256DigestV1, fileCount: prepared.length, totalBytes };
}

function walkDirectory(
  rootPath: string,
  domain: FileSetDigestDomainV1,
  limits: FileSetResourceLimitsV1,
  prefix = '',
  output: FileSetPathDescriptorV1[] = [],
  totalBytes = { value: 0 },
): FileSetPathDescriptorV1[] {
  const policy = pathPolicy(domain);
  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    const absolutePath = join(rootPath, entry.name);
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    const stat = lstatSync(absolutePath, { bigint: false, throwIfNoEntry: true }) as Stats;
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error(`Unsupported file type: ${path}.`);
    policy.assert(path);
    if (stat.isDirectory()) {
      walkDirectory(absolutePath, domain, limits, path, output, totalBytes);
      continue;
    }
    if (output.length >= limits.maxFiles) throw new Error('Fileset file count exceeds the v1 limit.');
    if (!Number.isSafeInteger(stat.size) || stat.size < 0 || stat.size > limits.maxFileBytes) throw new Error(`File exceeds the v1 per-file limit: ${path}.`);
    totalBytes.value += stat.size;
    if (totalBytes.value > limits.maxAggregateBytes) throw new Error('Fileset aggregate bytes exceed the v1 limit.');
    output.push({ path, absolutePath, byteLength: stat.size });
  }
  return output;
}

export function enumerateFileSetDirectoryV1(
  rootPath: string,
  domain: FileSetDigestDomainV1 = 'fileset',
  limits?: FileSetResourceLimitsInputV1,
): FileSetPathDescriptorV1[] {
  const resolvedLimits = resolveLimits(limits);
  const rootStat = lstatSync(rootPath, { bigint: false, throwIfNoEntry: true }) as Stats;
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('Fileset root must be a real directory.');
  const files = walkDirectory(rootPath, domain, resolvedLimits);
  if (files.length === 0) throw new RangeError('A v1 fileset must contain at least one file.');
  return files.sort((left, right) => pathPolicy(domain).compare(left.path, right.path));
}

export function digestFileSetDirectoryV1(
  rootPath: string,
  domain: FileSetDigestDomainV1 = 'fileset',
  limits?: FileSetResourceLimitsInputV1,
): FileSetDigestSummaryV1 {
  const resolvedLimits = resolveLimits(limits);
  const rootIdentity = realpathSync(rootPath);
  const result = digestFileSetPathsV1(enumerateFileSetDirectoryV1(rootPath, domain, resolvedLimits), domain, resolvedLimits);
  if (realpathSync(rootPath) !== rootIdentity) throw new Error('Fileset root changed while reading.');
  return result;
}

export function timingSafeEqualSha256V1(left: unknown, right: unknown): boolean {
  if (typeof left !== 'string' || typeof right !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(left) || !/^sha256:[0-9a-f]{64}$/.test(right)) {
    throw new RangeError('Timing-safe SHA-256 comparison requires canonical digests.');
  }
  return timingSafeEqual(Buffer.from(left.slice(7), 'hex'), Buffer.from(right.slice(7), 'hex'));
}

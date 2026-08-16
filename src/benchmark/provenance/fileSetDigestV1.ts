import { createHash } from 'node:crypto';
import { BENCHMARK_DIGEST_DOMAINS } from '../contracts/versions';
import type { Sha256DigestV1 } from '../contracts/typesV1';
import { assertCanonicalRelativePathV1, compareCanonicalRelativePathsV1 } from './canonicalPathV1';

export interface FileSetEntryV1 {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export type FileSetDigestDomainV1 = keyof typeof BENCHMARK_DIGEST_DOMAINS;

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

export function digestFileSetV1(
  entries: readonly FileSetEntryV1[],
  domain: FileSetDigestDomainV1 = 'fileset',
): Sha256DigestV1 {
  return digestString(frameFileSetV1(entries, domain));
}

export const digestFilesetV1 = digestFileSetV1;

export function digestBuildV1(entries: readonly FileSetEntryV1[]): Sha256DigestV1 {
  return digestFileSetV1(entries, 'build');
}

export function digestBundleV1(entries: readonly FileSetEntryV1[]): Sha256DigestV1 {
  return digestFileSetV1(entries, 'bundle');
}

export function digestFileBytesV1(bytes: Uint8Array): Sha256DigestV1 {
  return sha256BytesV1(bytes);
}

export function frameFileSetV1(
  entries: readonly FileSetEntryV1[],
  domain: FileSetDigestDomainV1 = 'fileset',
): Uint8Array {
  if (entries.length === 0) throw new RangeError('A v1 fileset must contain at least one file.');
  assertU32(entries.length, 'File count');
  const sorted = [...entries].sort((left, right) => compareCanonicalRelativePathsV1(left.path, right.path));
  const seen = new Set<string>();
  const frames: Uint8Array[] = [new TextEncoder().encode(BENCHMARK_DIGEST_DOMAINS[domain]), u32be(sorted.length)];
  for (const entry of sorted) {
    assertCanonicalRelativePathV1(entry.path);
    if (seen.has(entry.path)) throw new RangeError(`Duplicate fileset path ${entry.path}.`);
    seen.add(entry.path);
    const pathBytes = new TextEncoder().encode(entry.path);
    if (BigInt(entry.bytes.byteLength) > MAX_U64) throw new RangeError(`File ${entry.path} is too large.`);
    frames.push(u32be(pathBytes.byteLength), pathBytes, u64be(BigInt(entry.bytes.byteLength)), entry.bytes);
  }
  return concat(frames);
}

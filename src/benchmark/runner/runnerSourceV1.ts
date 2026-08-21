import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1, type Sha256DigestV1 } from '../contracts';
import { readFileBytesV1 } from '../provenance';

declare const __BR03_SOURCE_COMMIT_SHA__: string | undefined;

export function resolveRunnerBuildSourceCommitShaV1(): string | null {
  return typeof __BR03_SOURCE_COMMIT_SHA__ === 'string' ? __BR03_SOURCE_COMMIT_SHA__ : null;
}

export async function resolveRunnerSourceShaV1(): Promise<Sha256DigestV1> {
  const bytes = readFileBytesV1(fileURLToPath(import.meta.url), {
    maxFileBytes: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.maxFileBytes,
    maxAggregateBytes: BENCHMARK_PROVENANCE_RESOURCE_LIMITS_V1.maxAggregateBytes,
  });
  if (bytes.byteLength === 0) throw new Error('Runner executable is empty.');
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}` as Sha256DigestV1;
}

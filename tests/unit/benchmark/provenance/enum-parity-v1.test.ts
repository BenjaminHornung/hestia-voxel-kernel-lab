import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_ARTIFACT_ROLE_VALUES_V1,
  BENCHMARK_BUNDLE_CLAIM_CLASS_VALUES_V1,
} from '../../../../src/benchmark/contracts/typesV1';
import {
  BUNDLE_ARTIFACT_ROLE_VALUES_V1,
  BUNDLE_CLAIM_CLASS_VALUES_V1,
  isSupportedBundleArtifactRoleV1,
  isSupportedBundleClaimClassV1,
} from '../../../../src/benchmark/provenance/bundleV1';

const artifactSchema = JSON.parse(readFileSync('src/benchmark/contracts/schemas/benchmark-artifact-manifest-v1.schema.json', 'utf8')) as {
  readonly $defs: { readonly artifact: { readonly properties: { readonly role: { readonly enum: readonly string[] } } } };
};
const bundleSchema = JSON.parse(readFileSync('src/benchmark/contracts/schemas/benchmark-bundle-manifest-v1.schema.json', 'utf8')) as {
  readonly properties: { readonly claimClass: { readonly enum: readonly string[] } };
};

describe('BR01 public enum parity', () => {
  it('keeps schema, hand-validator, and bundle role values identical', () => {
    const schemaRoles = artifactSchema.$defs.artifact.properties.role.enum;
    expect(schemaRoles).toEqual([...BENCHMARK_ARTIFACT_ROLE_VALUES_V1]);
    expect(BUNDLE_ARTIFACT_ROLE_VALUES_V1).toEqual(BENCHMARK_ARTIFACT_ROLE_VALUES_V1);
    for (const role of schemaRoles) expect(isSupportedBundleArtifactRoleV1(role)).toBe(true);
    for (const role of ['heap-snapshot', 'gpu-capture']) expect(isSupportedBundleArtifactRoleV1(role)).toBe(false);
  });

  it('keeps schema, hand-validator, and bundle claim values identical', () => {
    const schemaClaims = bundleSchema.properties.claimClass.enum;
    expect(schemaClaims).toEqual([...BENCHMARK_BUNDLE_CLAIM_CLASS_VALUES_V1]);
    expect(BUNDLE_CLAIM_CLASS_VALUES_V1).toEqual(BENCHMARK_BUNDLE_CLAIM_CLASS_VALUES_V1);
    for (const claimClass of schemaClaims) expect(isSupportedBundleClaimClassV1(claimClass)).toBe(true);
    expect(isSupportedBundleClaimClassV1('performance-gate')).toBe(false);
  });
});

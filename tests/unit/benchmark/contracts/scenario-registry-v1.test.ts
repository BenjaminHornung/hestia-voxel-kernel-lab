import { describe, expect, it } from 'vitest';
import { BENCHMARK_METRIC_CROSSWALK_V1, BENCHMARK_METRIC_REGISTRY_V1, BENCHMARK_SCENARIO_METRIC_CAPABILITY_SELECTIONS_V1, BENCHMARK_SCENARIO_REGISTRY_V1, BENCHMARK_REQUIRED_TELEMETRY_RECORD_NAMES_V1, BENCHMARK_SOURCE_FIXTURE_BINDINGS_V1, BENCHMARK_TELEMETRY_RECORD_MAPPINGS_V1, BENCHMARK_WP04_SEMANTIC_SHA256_V1, benchmarkScenarioDefinitionsV1, getBenchmarkWp04SemanticBytesV1, resolveScenarioMetricCapabilitySelectionV1 } from '../../../../src/benchmark/contracts/scenarioRegistryV1';
import { canonicalizeJsonV1, compareUtf16 } from '../../../../src/benchmark/provenance/canonicalJsonV1';
import { sha256BytesV1 } from '../../../../src/benchmark/provenance/fileSetDigestV1';
import { validateMetricRegistryV1 } from '../../../../src/benchmark/contracts/validateV1';
import { BENCHMARK_METRIC_DIMENSION_CONTRACT_GOLDENS_V1, BENCHMARK_METRIC_REGISTRY_CONTRACT_GOLDENS_V1, BENCHMARK_METRIC_REGISTRY_GOLDENS_V1, BENCHMARK_METRIC_REGISTRY_SHA256_GOLDEN_V1, BENCHMARK_SCENARIO_DEFINITION_DIGESTS_V1, BENCHMARK_SCENARIO_METRIC_CAPABILITY_SELECTION_GOLDENS_V1, BENCHMARK_TELEMETRY_MAPPING_GOLDENS_V1, BENCHMARK_UTF16_ORDER_GOLDENS_V1, BENCHMARK_WP04_SEMANTIC_SHA256_GOLDEN_V1 } from '../../../../tests/contracts/benchmark/scenario-registry-v1.golden';

describe('BR01 registries', () => {
  it('contains all seven contract-only scenarios', () => {
    expect(benchmarkScenarioDefinitionsV1).toHaveLength(7);
    expect(Object.values(BENCHMARK_SCENARIO_REGISTRY_V1).every((entry) => entry.lifecycle.status === 'contract-only')).toBe(true);
  });
  it('matches the authoritative WP04 semantic fixture digest golden', () => {
    expect(BENCHMARK_WP04_SEMANTIC_SHA256_V1).toBe(BENCHMARK_WP04_SEMANTIC_SHA256_GOLDEN_V1);
  });
  it('freezes explicit metric decisions', () => {
    expect(BENCHMARK_METRIC_REGISTRY_V1.metrics.length).toBeGreaterThanOrEqual(15);
    expect(BENCHMARK_METRIC_REGISTRY_V1.metrics.every((metric) => metric.automaticDecision === 'forbidden' && Object.prototype.hasOwnProperty.call(metric, 'practicalEffectDelta'))).toBe(true);
    expect(BENCHMARK_METRIC_REGISTRY_V1.metricRegistrySha256).toBe(BENCHMARK_METRIC_REGISTRY_SHA256_GOLDEN_V1);
    const result = validateMetricRegistryV1();
    expect(result.valid, result.valid ? '' : `${result.issues[0]?.path}: ${result.issues[0]?.detail}`).toBe(true);
  });
  it('freezes the complete exported scenario and metric registry graph', () => {
    const definition = BENCHMARK_SCENARIO_REGISTRY_V1['backend-fixture-v1'].definition;
    const metric = BENCHMARK_METRIC_REGISTRY_V1.metrics[0]!;
    expect(Object.isFrozen(BENCHMARK_SCENARIO_REGISTRY_V1)).toBe(true);
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.metricContracts)).toBe(true);
    expect(Object.isFrozen(BENCHMARK_METRIC_REGISTRY_V1)).toBe(true);
    expect(Object.isFrozen(metric)).toBe(true);
    expect(() => { (definition as any).metricContracts = []; }).toThrow();
    expect(() => { (definition.metricContracts[0] as any).metricRef = 'mutated@1'; }).toThrow();
    expect(() => { (BENCHMARK_METRIC_REGISTRY_V1.metrics[0] as any).eventSemantics = 'mutated'; }).toThrow();
    expect(validateMetricRegistryV1()).toMatchObject({ valid: true });
  });
  it('classifies every BR02 telemetry record exactly once', () => {
    const names = BENCHMARK_TELEMETRY_RECORD_MAPPINGS_V1.map((mapping) => mapping.recordName);
    expect(new Set(names).size).toBe(names.length);
    expect(BENCHMARK_REQUIRED_TELEMETRY_RECORD_NAMES_V1.every((name) => names.some((entry) => entry === name))).toBe(true);
  });
  it('asserts the exact capability set for all seven scenarios', () => {
    const expected: Record<string, string[]> = {
      'mesh-golden-world-v1': ['performance-time-origin:must-support', 'webgl2:must-declare', 'webgpu:must-declare'],
      'mesh-density-sweep-v1': ['performance-time-origin:must-support', 'webgl2:must-declare', 'webgpu:must-declare'],
      'scheduler-steady-v1': ['dedicated-worker:must-support', 'long-tasks:must-declare', 'performance-time-origin:must-support', 'webgl2:must-declare', 'webgpu:must-declare'],
      'scheduler-burst-v1': ['dedicated-worker:must-support', 'long-tasks:must-declare', 'performance-time-origin:must-support', 'webgl2:must-declare', 'webgpu:must-declare'],
      'brush-stress-v1': ['dedicated-worker:must-support', 'long-tasks:must-declare', 'performance-time-origin:must-support', 'webgl2:must-declare', 'webgpu:must-declare'],
      'navigation-leak-v1': ['cdp-memory-dom-counters:must-support', 'cdp-runtime-heap-usage:must-support', 'cdp-system-info:must-declare'],
      'backend-fixture-v1': ['performance-time-origin:must-support', 'webgl-disjoint-timer-query:must-declare', 'webgl2:must-declare', 'webgpu-timestamp-query:must-declare', 'webgpu:must-declare'],
    };
    for (const id of Object.keys(expected)) {
      const actual = BENCHMARK_SCENARIO_REGISTRY_V1[id as keyof typeof BENCHMARK_SCENARIO_REGISTRY_V1].definition.capabilityContracts.map((entry) => `${entry.id}:${entry.requirement}`).sort();
      expect(actual).toEqual(expected[id]);
    }
  });
  it('stores backend-conditioned GPU timer capability selections in the registry', () => {
    expect(BENCHMARK_SCENARIO_METRIC_CAPABILITY_SELECTIONS_V1).toEqual(BENCHMARK_SCENARIO_METRIC_CAPABILITY_SELECTION_GOLDENS_V1);
    expect(BENCHMARK_SCENARIO_REGISTRY_V1['backend-fixture-v1'].metricCapabilitySelections).toEqual(BENCHMARK_SCENARIO_METRIC_CAPABILITY_SELECTION_GOLDENS_V1);
    expect(BENCHMARK_SCENARIO_REGISTRY_V1['backend-fixture-v1'].metricCapabilitySelections).toEqual(BENCHMARK_SCENARIO_REGISTRY_V1['backend-fixture-v1'].definition.metricCapabilitySelections);
    expect(BENCHMARK_SCENARIO_METRIC_CAPABILITY_SELECTIONS_V1[0]!.selections.map((entry) => entry.capabilityId)).toEqual([
      'webgpu-timestamp-query', 'webgl-disjoint-timer-query',
    ]);
    expect(resolveScenarioMetricCapabilitySelectionV1('backend-fixture-v1', 'gpu.time.ms@1' as never, [{ key: 'backend', value: 'three-webgl2' }])).toEqual(['webgl-disjoint-timer-query']);
    expect(resolveScenarioMetricCapabilitySelectionV1('backend-fixture-v1', 'gpu.time.ms@1' as never, [{ key: 'backend', value: 'raw-webgpu' }])).toEqual(['webgpu-timestamp-query']);
  });
  it('binds serialized capability selections into the scenario definition digest', () => {
    const definition = BENCHMARK_SCENARIO_REGISTRY_V1['backend-fixture-v1'].definition;
    const mutated = JSON.parse(JSON.stringify(definition)) as any;
    mutated.metricCapabilitySelections[0].selections[0].capabilityId = 'webgpu';
    expect(sha256BytesV1(canonicalizeJsonV1(mutated))).not.toBe(BENCHMARK_SCENARIO_REGISTRY_V1['backend-fixture-v1'].definitionSha256);
  });
  it('stores canonical metric references and explicit crosswalk coverage', () => {
    const refs = new Set(BENCHMARK_METRIC_REGISTRY_V1.metrics.map((metric) => metric.metricRef));
    expect([...refs].sort()).toEqual([
      'adoption.cpu.ms@1', 'chunk.mesh.cpu.ms@1', 'coverage.sha256.match@1', 'dom.document.count@1', 'dom.node.count@1', 'draw.submit.cpu.ms@1',
      'event.listener.count@1', 'geometry.bytes@1', 'gpu.resource.count@1', 'gpu.time.ms@1', 'heartbeat.gap.ms@1', 'image.contract.sha256.match@1',
      'input.revision.submit.ms@1', 'longtask.count@1', 'longtask.duration.ms@1', 'memory.bytes@1', 'mesh.quads.count@1', 'raf.interval.ms@1',
      'revision.latest.visible@1', 'scheduler.drain.ms@1', 'scheduler.drop.count@1', 'scheduler.queue.depth.count@1', 'scheduler.queue.wait.ms@1',
      'scheduler.stale.count@1', 'snapshot.halo.build.ms@1', 'worker.active.count@1', 'worker.total.ms@1', 'world.mesh.total.ms@1', 'world.sha256.match@1',
    ]);
    expect([...refs].every((ref) => /^[a-z0-9][a-z0-9._-]*@[1-9][0-9]*$/.test(ref))).toBe(true);
    for (const definition of benchmarkScenarioDefinitionsV1) for (const contract of definition.metricContracts) expect(refs.has(contract.metricRef)).toBe(true);
    for (const [, canonicalRef] of BENCHMARK_METRIC_CROSSWALK_V1) expect(refs.has(canonicalRef)).toBe(true);
    expect(BENCHMARK_METRIC_REGISTRY_V1.metrics.every((metric) => metric.eventSemantics !== '' && metric.populationSemantics !== '' && metric.sourceMapping.length > 0)).toBe(true);
  });
  it('matches the exact scenario definition digest golden', () => {
    for (const definition of benchmarkScenarioDefinitionsV1) expect(BENCHMARK_SCENARIO_REGISTRY_V1[definition.id].definitionSha256).toBe(BENCHMARK_SCENARIO_DEFINITION_DIGESTS_V1[definition.id]);
  });
  it('recomputes checked-in registry digests from canonical bytes in Node', () => {
    for (const definition of benchmarkScenarioDefinitionsV1) {
      expect(sha256BytesV1(canonicalizeJsonV1(definition))).toBe(BENCHMARK_SCENARIO_REGISTRY_V1[definition.id].definitionSha256);
    }
    expect(sha256BytesV1(getBenchmarkWp04SemanticBytesV1())).toBe(BENCHMARK_WP04_SEMANTIC_SHA256_V1);
    const { metricRegistrySha256: _metricRegistrySha256, ...metricRegistryDigestInput } = BENCHMARK_METRIC_REGISTRY_V1;
    expect(sha256BytesV1(canonicalizeJsonV1(metricRegistryDigestInput))).toBe(BENCHMARK_METRIC_REGISTRY_V1.metricRegistrySha256);
  });
  it('uses the direct UTF-16 code-unit order for punctuation and digits', () => {
    for (const [left, right, expectedSign] of BENCHMARK_UTF16_ORDER_GOLDENS_V1) expect(Math.sign(compareUtf16(left, right))).toBe(expectedSign);
  });
  it('matches the complete per-metric grouping, pairing, population, disposition, and effect golden', () => {
    const actual = Object.fromEntries(BENCHMARK_METRIC_REGISTRY_V1.metrics.map((metric) => [metric.metricRef, {
      kind: metric.kind,
      unit: metric.unit,
      sourceMapping: metric.sourceMapping.map((mapping) => mapping.disposition === 'emit-sample'
        ? `${mapping.recordName}|${mapping.disposition}|${mapping.metricRef}|${mapping.unit}`
        : `${mapping.recordName}|${mapping.disposition}`),
      groupingKeys: [...metric.grouping.keys],
      population: metric.grouping.population,
      pairingKeys: [...metric.pairing.keys],
      pairingLevel: metric.pairing.level,
      direction: metric.direction,
      practicalEffectDelta: metric.practicalEffectDelta,
    }]));
    expect(actual).toEqual(BENCHMARK_METRIC_REGISTRY_GOLDENS_V1);
  });
  it('matches the independent literal golden for all remaining metric contract fields', () => {
    const actual = Object.fromEntries(BENCHMARK_METRIC_REGISTRY_V1.metrics.map((metric) => [metric.metricRef, {
      schemaVersion: metric.schemaVersion,
      numericDomain: metric.numericDomain,
      eventSemantics: metric.eventSemantics,
      populationSemantics: metric.populationSemantics,
      allowedContainers: [...metric.allowedContainers],
      allowedPhases: [...metric.allowedPhases],
      capabilityRequirements: [...metric.capabilityRequirements],
      warmupControl: metric.warmupControl,
      automaticDecision: metric.automaticDecision,
    }]));
    expect(actual).toEqual(BENCHMARK_METRIC_REGISTRY_CONTRACT_GOLDENS_V1);
  });
  it('matches independent literal dimension owner goldens for every metric', () => {
    const actual = Object.fromEntries(BENCHMARK_METRIC_REGISTRY_V1.metrics.map((metric) => [metric.metricRef, metric.dimensionContracts.map((dimension) => ({ key: dimension.key, domain: dimension.domain }))]));
    expect(actual).toEqual(BENCHMARK_METRIC_DIMENSION_CONTRACT_GOLDENS_V1);
  });
  it('matches the independent literal golden for the complete global telemetry mapping set', () => {
    expect(BENCHMARK_TELEMETRY_RECORD_MAPPINGS_V1).toEqual(BENCHMARK_TELEMETRY_MAPPING_GOLDENS_V1);
    expect(BENCHMARK_REQUIRED_TELEMETRY_RECORD_NAMES_V1).toEqual(BENCHMARK_TELEMETRY_MAPPING_GOLDENS_V1.map((mapping) => mapping.recordName));
  });
  it('rejects a registry digest that omits the global telemetry mapping table', () => {
    const registry = JSON.parse(JSON.stringify(BENCHMARK_METRIC_REGISTRY_V1)) as any;
    registry.metricRegistrySha256 = sha256BytesV1(canonicalizeJsonV1({ schemaVersion: registry.schemaVersion, protocolVersion: registry.protocolVersion, metrics: registry.metrics }));
    expect(validateMetricRegistryV1(registry)).toMatchObject({ valid: false, code: 'registry-digest-mismatch' });
  });
  it.each([
    ['unknown dimension key', (registry: any) => { registry.metrics.find((entry: any) => entry.metricRef === 'chunk.mesh.cpu.ms@1').dimensionContracts[0].key = 'chunk-ke'; }],
    ['mistyped dimension domain', (registry: any) => { registry.metrics.find((entry: any) => entry.metricRef === 'chunk.mesh.cpu.ms@1').dimensionContracts[0].domain.kind = 'sha256'; }],
  ] as const)('fails closed for a %s', (_label, mutate) => {
    const registry = JSON.parse(JSON.stringify(BENCHMARK_METRIC_REGISTRY_V1)) as any;
    mutate(registry);
    registry.metricRegistrySha256 = sha256BytesV1(canonicalizeJsonV1({
      schemaVersion: registry.schemaVersion,
      protocolVersion: registry.protocolVersion,
      metrics: registry.metrics,
      telemetryMappings: registry.telemetryMappings,
      producibilityCrosswalk: registry.producibilityCrosswalk,
    }));
    expect(validateMetricRegistryV1(registry)).toMatchObject({ valid: false });
  });
  it('rejects a recomputed local emit mapping that disagrees with its global mapping', () => {
    const registry = JSON.parse(JSON.stringify(BENCHMARK_METRIC_REGISTRY_V1)) as any;
    const globalMapping = registry.telemetryMappings.find((mapping: any) => mapping.recordName === 'result.adoption');
    globalMapping.metricRef = 'world.mesh.total.ms@1';
    registry.metricRegistrySha256 = sha256BytesV1(canonicalizeJsonV1({ schemaVersion: registry.schemaVersion, protocolVersion: registry.protocolVersion, metrics: registry.metrics, telemetryMappings: registry.telemetryMappings }));
    expect(validateMetricRegistryV1(registry)).toMatchObject({ valid: false, code: 'metric-mapping-mismatch' });
  });
  it.each([
    ['missing local emit mapping', (registry: any) => {
      const metric = registry.metrics.find((entry: any) => entry.metricRef === 'adoption.cpu.ms@1');
      metric.sourceMapping = [{ recordName: 'renderer.adoption', disposition: 'diagnostic-only' }];
    }],
    ['duplicate local emit mapping', (registry: any) => {
      const metric = registry.metrics.find((entry: any) => entry.metricRef === 'adoption.cpu.ms@1');
      metric.sourceMapping.push({ ...metric.sourceMapping[0] });
    }],
    ['wrong global metric target', (registry: any) => {
      const mapping = registry.telemetryMappings.find((entry: any) => entry.recordName === 'result.adoption');
      mapping.metricRef = 'world.mesh.total.ms@1';
    }],
  ] as const)('rejects a recomputed registry with %s', (_label, mutate) => {
    const registry = JSON.parse(JSON.stringify(BENCHMARK_METRIC_REGISTRY_V1)) as any;
    mutate(registry);
    registry.metricRegistrySha256 = sha256BytesV1(canonicalizeJsonV1({ schemaVersion: registry.schemaVersion, protocolVersion: registry.protocolVersion, metrics: registry.metrics, telemetryMappings: registry.telemetryMappings }));
    expect(validateMetricRegistryV1(registry)).toMatchObject({ valid: false, code: 'metric-mapping-mismatch' });
  });
  it('keeps one global disposition when metric source mappings are flattened', () => {
    const global = new Map(BENCHMARK_TELEMETRY_RECORD_MAPPINGS_V1.map((mapping) => [mapping.recordName, mapping.disposition]));
    const dispositions = new Map<string, Set<string>>();
    for (const metric of BENCHMARK_METRIC_REGISTRY_V1.metrics) {
      for (const mapping of metric.sourceMapping) {
        const values = dispositions.get(mapping.recordName) ?? new Set<string>();
        values.add(mapping.disposition);
        dispositions.set(mapping.recordName, values);
        expect(global.get(mapping.recordName), mapping.recordName).toBe(mapping.disposition);
      }
    }
    for (const [recordName, values] of dispositions) expect(values.size, recordName).toBe(1);
    expect(BENCHMARK_TELEMETRY_RECORD_MAPPINGS_V1.find((mapping) => mapping.recordName === 'browser.long-task')?.disposition).toBe('emit-sample');
    expect(BENCHMARK_TELEMETRY_RECORD_MAPPINGS_V1.find((mapping) => mapping.recordName === 'scheduler.queue-depth')?.disposition).toBe('emit-sample');
    expect(new Set(BENCHMARK_REQUIRED_TELEMETRY_RECORD_NAMES_V1).size).toBe(BENCHMARK_REQUIRED_TELEMETRY_RECORD_NAMES_V1.length);
  });
  it('maps adoption timing only from result.adoption', () => {
    const metric = BENCHMARK_METRIC_REGISTRY_V1.metrics.find((entry) => entry.metricRef === 'adoption.cpu.ms@1')!;
    expect(metric.sourceMapping).toEqual([{ recordName: 'result.adoption', disposition: 'emit-sample', metricRef: 'adoption.cpu.ms@1', unit: 'ms' }]);
    expect(BENCHMARK_TELEMETRY_RECORD_MAPPINGS_V1.find((entry) => entry.recordName === 'renderer.adoption')).toEqual({ recordName: 'renderer.adoption', disposition: 'diagnostic-only' });
  });
  it('keeps memory dimensions and removes the public alias field', () => {
    const memoryContracts = benchmarkScenarioDefinitionsV1.flatMap((definition) => definition.metricContracts.filter((metric) => metric.metricRef === 'memory.bytes@1'));
    expect(memoryContracts.map((metric) => metric.dimensions?.[0])).toEqual([
      { key: 'memory-kind', value: 'js-heap' },
      { key: 'memory-kind', value: 'embedder-heap' },
      { key: 'memory-kind', value: 'backing-storage' },
      { key: 'memory-kind', value: 'owner-bound' },
    ]);
    expect(JSON.stringify(benchmarkScenarioDefinitionsV1)).not.toContain('"alias"');
  });
  it('uses the source-defined counter dimension suffixes exactly', () => {
    expect(BENCHMARK_METRIC_REGISTRY_V1.metrics.find((metric) => metric.metricRef === 'longtask.count@1')).toMatchObject({
      grouping: { keys: ['hardware-profile', 'phase', 'candidate', 'observation-window-id'] },
      pairing: { keys: ['bootstrap-cluster-id', 'observation-window-id'] },
    });
    expect(BENCHMARK_METRIC_REGISTRY_V1.metrics.find((metric) => metric.metricRef === 'scheduler.stale.count@1')).toMatchObject({
      grouping: { keys: ['hardware-profile', 'phase', 'candidate', 'observation-window-id', 'stale-reason'] },
      pairing: { keys: ['bootstrap-cluster-id', 'observation-window-id', 'stale-reason'] },
    });
    expect(BENCHMARK_METRIC_REGISTRY_V1.metrics.find((metric) => metric.metricRef === 'scheduler.drop.count@1')).toMatchObject({
      grouping: { keys: ['hardware-profile', 'phase', 'candidate', 'observation-window-id', 'drop-kind'] },
      pairing: { keys: ['bootstrap-cluster-id', 'observation-window-id', 'drop-kind'] },
    });
  });
  it('represents future source bindings as unavailable instead of fabricated', () => {
    const wp04 = BENCHMARK_SOURCE_FIXTURE_BINDINGS_V1['wp04-golden-world-v1'];
    expect(wp04).toMatchObject({ id: 'wp04-golden-world-v1', version: 1, sourceCommitSha: { status: 'observed', value: 'c64aeef1f51dd0ed2d8431411cf3ba1e84195b9d' } });
    expect(wp04.sourcePaths.value).toEqual(['evidence/wp04/manifest.json', 'tests/contracts/wp02FixtureGolden.ts', 'tests/contracts/wp03GreedyGolden.ts', 'tests/contracts/wp04AoGolden.ts']);
    expect(wp04.sourceFileSetSha256.value).toBe('sha256:5a89e11f59c2fbe1d35eaa782aed039505edbc45282302698ad4009fb04900e0');
    for (const key of ['scheduler-edit-stream-v1', 'brush-command-stream-v1', 'navigation-route-sequence-v1', 'backend-parity-world-v1'] as const) {
      expect(BENCHMARK_SOURCE_FIXTURE_BINDINGS_V1[key]).toMatchObject({ sourceCommitSha: { status: 'unknown', value: null }, sourcePaths: { status: 'unknown', value: null }, sourceFileSetSha256: { status: 'unknown', value: null } });
    }
  });
});

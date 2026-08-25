import { describe, expect, it } from 'vitest';
import type { CanonicalIdV1, Sha256DigestV1, UInt32V1 } from '../../../../src/benchmark/contracts';
import { canonicalizeJsonV1, sha256BytesV1 } from '../../../../src/benchmark/provenance';
import { buildCounterbalanceRowsV1 } from '../../../../src/benchmark/runner/plan/counterbalanceV1';
import type { RunPlanProcessUnitV1 } from '../../../../src/benchmark/runner/contractsV1';
import {
  buildRunPlanV1,
  classifyPopulationV1,
  verifyBuiltRunPlanV1,
} from '../../../../src/benchmark/runner/plan/runPlanV1';
import { encodeBuiltRunPlanV1, parseBuiltRunPlanV1, parseRunPlanInputJsonV1 } from '../../../../src/benchmark/runner/plan/planFileV1';
import {
  meshGoldenParametersV1,
  runPlanInputV1,
} from '../../../fixtures/benchmark/runner/runPlanInputV1';

const id = (value: string) => value as CanonicalIdV1;
const pairCells = (units: readonly RunPlanProcessUnitV1[]) => {
  const result = new Map<string, RunPlanProcessUnitV1[]>();
  for (const unit of units) result.set(unit.ids.pairCellId, [...(result.get(unit.ids.pairCellId) ?? []), unit]);
  return result;
};

describe('BR03 run plan v1', () => {
  it('produces byte-identical plans, full digests, stable IDs and owner literals', () => {
    const first = buildRunPlanV1(runPlanInputV1());
    const second = buildRunPlanV1(runPlanInputV1());

    expect(first).toEqual(second);
    expect(first.runPlanSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.runPlanId).toBe(`br03-plan-${first.runPlanSha256.slice(7)}`);
    expect(verifyBuiltRunPlanV1(first)).toEqual([]);
    expect(first.core.processUnits.every(({ ids }) => Object.values(ids.ownership).every((owner) => owner === 'BR03'))).toBe(true);
    expect(new Set(first.core.processUnits.map(({ ids }) => ids.slotId)).size).toBe(first.core.processUnits.length);
    for (const scenario of first.core.scenarios) {
      for (const candidateId of first.core.candidates.map(({ id: candidateId }) => candidateId)) {
        const ordinals = first.core.processUnits
          .filter((unit) => unit.scenarioId === scenario.id && unit.candidateId === candidateId)
          .map(({ processOrdinal }) => processOrdinal);
        expect(ordinals).toEqual(ordinals.map((_value, index) => index));
      }
    }
    expect(new TextDecoder().decode(first.canonicalBytes)).not.toMatch(/createdUtc|invocationId|outputRoot|pid|port|runId|tempPath/);
  });

  it('canonicalizes candidate, scenario-parameter and input ordering', () => {
    const input = runPlanInputV1();
    const reordered = {
      ...input,
      candidates: [...input.candidates].reverse(),
      scenarios: input.scenarios.map((scenario) => ({
        ...scenario,
        parameters: [...scenario.parameters].reverse(),
      })),
    };
    expect(buildRunPlanV1(reordered)).toEqual(buildRunPlanV1(input));
  });

  it('binds a changed seed only into deterministic plan order, digest and IDs', () => {
    const input = runPlanInputV1();
    const first = buildRunPlanV1(input);
    const second = buildRunPlanV1({ ...input, orderSeed: input.orderSeed + 1 });

    expect(second.runPlanSha256).not.toBe(first.runPlanSha256);
    expect(second.core.processUnits.map(({ candidateId }) => candidateId).sort()).toEqual(
      first.core.processUnits.map(({ candidateId }) => candidateId).sort(),
    );
    expect(second.core.processUnits[0]!.ids.slotId).not.toBe(first.core.processUnits[0]!.ids.slotId);
  });

  it('keeps complete ABBA and BAAB superblocks and rounds minima upward', () => {
    const plan = buildRunPlanV1(runPlanInputV1());
    const firstBlock = plan.core.balanceBlocks[0]!;
    expect(firstBlock.rows.map(({ scheme }) => scheme)).toEqual(['abba', 'baab']);
    expect(firstBlock.rows.every(({ candidateIds }) => candidateIds.length === 4)).toBe(true);
    expect(firstBlock.balanceBlockId).toBe(firstBlock.blockId);

    for (const units of pairCells(plan.core.processUnits).values()) {
      expect(units).toHaveLength(2);
      expect(new Set(units.map(({ candidateId }) => candidateId)).size).toBe(2);
      expect(units.filter(({ comparisonArm }) => comparisonArm === 'reference').map(({ candidateId }) => candidateId)).toEqual(['candidate-a']);
      expect(new Set(units.map(({ ids }) => ids.pairOrdinal)).size).toBe(1);
    }
    expect(new Set(plan.core.processUnits.map(({ ids }) => ids.bootstrapClusterId)).size).toBe(plan.core.processUnits.length);

    const cold = plan.core.processUnits.filter(({ processContainer }) => processContainer === 'cold');
    const warm = plan.core.processUnits.filter(({ processContainer }) => processContainer === 'warm-measurement');
    for (const candidateId of plan.core.candidates.map(({ id: candidateId }) => candidateId)) {
      expect(cold.filter((unit) => unit.candidateId === candidateId)).toHaveLength(12);
      expect(warm.filter((unit) => unit.candidateId === candidateId)).toHaveLength(8);
      expect(warm.filter((unit) => unit.candidateId === candidateId).reduce((sum, unit) => sum + unit.measurementIterations, 0)).toBe(40);
    }
  });

  it.each([3, 4, 5])('builds balanced Williams rows for %i candidates', (count) => {
    const candidates = Array.from({ length: count }, (_, index) => id(`candidate-${index}`));
    const rows = buildCounterbalanceRowsV1(candidates, 7 as UInt32V1);
    expect(rows).toHaveLength(count % 2 === 0 ? count : count * 2);
    expect(rows.every(({ scheme }) => scheme === 'latin-square')).toBe(true);
    expect(rows.every(({ candidateIds }) => new Set(candidateIds).size === count)).toBe(true);
    candidates.forEach((candidateId) => {
      for (let position = 0; position < count; position += 1) {
        expect(rows.filter(({ candidateIds }) => candidateIds[position] === candidateId)).toHaveLength(count % 2 === 0 ? 1 : 2);
      }
    });
  });

  it.each([3, 4, 5])('creates only explicit two-arm reference pairs for %i candidates', (count) => {
    const input = runPlanInputV1(Array.from({ length: count }, (_, index) => `candidate-${index}`));
    const plan = buildRunPlanV1(input);
    for (const units of pairCells(plan.core.processUnits).values()) {
      expect(units).toHaveLength(2);
      expect(new Set(units.map(({ candidateId }) => candidateId)).size).toBe(2);
      expect(units.find(({ comparisonArm }) => comparisonArm === 'reference')?.candidateId).toBe('candidate-0');
      expect(units.filter(({ comparisonArm }) => comparisonArm === 'comparison')).toHaveLength(1);
    }
  });

  it.each([3, 4, 5])('keeps %i-candidate unpaired-only cells singleton', (count) => {
    const base = runPlanInputV1(Array.from({ length: count }, (_, index) => `candidate-${index}`));
    const plan = buildRunPlanV1({ ...base, comparisonMode: 'unpaired-only', referenceCandidateId: null });
    expect(plan.core.comparisonMode).toBe('unpaired-only');
    for (const units of pairCells(plan.core.processUnits).values()) {
      expect(units).toHaveLength(1);
      expect(units[0]!.comparisonArm).toBe('unpaired');
    }
  });

  it('classifies 2, 3, 4 and 5 process populations without lowering the 30-iteration floor', () => {
    expect(classifyPopulationV1(2, 30)).toEqual({
      technicallyAggregable: false,
      standardProcessFloor: false,
      standardMeasurementCell: false,
    });
    for (const processes of [3, 4]) {
      expect(classifyPopulationV1(processes, 30)).toEqual({
        technicallyAggregable: true,
        standardProcessFloor: false,
        standardMeasurementCell: false,
      });
    }
    expect(classifyPopulationV1(5, 29).standardMeasurementCell).toBe(false);
    expect(classifyPopulationV1(5, 30).standardMeasurementCell).toBe(true);
  });

  it('rejects lowered minima, invalid parameters and deterministic digest collisions', () => {
    const input = runPlanInputV1();
    expect(() => buildRunPlanV1({
      ...input,
      phases: { ...input.phases, cold: { enabled: true, minimumProcessesPerCandidate: 9 } },
    })).toThrow(/Cold requires at least 10/);
    expect(() => buildRunPlanV1({
      ...input,
      phases: {
        ...input.phases,
        warmMeasurement: { enabled: true, minimumProcessesPerCandidate: 5, measurementIterationsPerProcess: 5 },
      },
    })).toThrow(/at least 6 processes/);
    expect(() => buildRunPlanV1({
      ...input,
      scenarios: [{ id: 'mesh-golden-world-v1', parameters: meshGoldenParametersV1().filter(({ key }) => key !== 'seed') }],
    })).toThrow(/Missing parameter seed/);
    const collision = () => `sha256:${'0'.repeat(64)}` as Sha256DigestV1;
    expect(() => buildRunPlanV1(input, collision)).toThrow(/collision/i);
  });

  it('validates disabled phase numeric domains and comparison direction', () => {
    const input = runPlanInputV1();
    expect(() => buildRunPlanV1({ ...input, referenceCandidateId: id('missing') })).toThrow(/selected candidate/);
    expect(() => buildRunPlanV1({ ...input, comparisonMode: 'unpaired-only', referenceCandidateId: id('candidate-a') })).toThrow(/cannot declare/);
    expect(() => buildRunPlanV1({ ...input, comparisonMode: 'unpaired-only', referenceCandidateId: null })).toThrow(/Two-candidate/);
    expect(() => buildRunPlanV1({
      ...input,
      phases: { ...input.phases, trace: { enabled: false, minimumProcessesPerCandidate: -1 } },
    })).toThrow(/trace process minimum/);
    expect(() => buildRunPlanV1({
      ...input,
      phases: { ...input.phases, warmMeasurement: { enabled: false, minimumProcessesPerCandidate: 0, measurementIterationsPerProcess: -1 } },
    })).toThrow(/Measurement iterations/);
  });

  it('uses the scenario seed in deterministic scenario ordering', () => {
    const input = runPlanInputV1(['candidate-a', 'candidate-b', 'candidate-c']);
    const first = buildRunPlanV1(input);
    const second = Array.from({ length: 16 }, (_, index) => index + 1)
      .map((seed) => buildRunPlanV1({
        ...input,
        scenarios: input.scenarios.map((scenario) => ({
          ...scenario,
          parameters: scenario.parameters.map((parameter) => parameter.key === 'seed' ? { ...parameter, value: seed as UInt32V1 } : parameter),
        })),
      }))
      .find((candidate) => JSON.stringify(candidate.core.balanceBlocks[0]!.rows) !== JSON.stringify(first.core.balanceBlocks[0]!.rows));
    expect(second).toBeDefined();
    if (second === undefined) throw new Error('Expected at least one distinct deterministic scenario-seed order.');
    expect(second.core.balanceBlocks[0]!.rows).not.toEqual(first.core.balanceBlocks[0]!.rows);
    expect(second.core.processUnits[0]!.ids.slotId).not.toBe(first.core.processUnits[0]!.ids.slotId);
  });

  it('rejects a scenario whose registered fixture is not the plan fixture', () => {
    expect(() => buildRunPlanV1({ ...runPlanInputV1(), fixtureContractId: id('backend-parity-world-v1') })).toThrow(/mesh-golden-world-v1 requires fixture wp04-golden-world-v1/);
  });

  it('rejects a rehashed plan whose generated execution graph was removed', () => {
    const plan = buildRunPlanV1(runPlanInputV1());
    const core = { ...plan.core, processUnits: [] };
    const canonicalBytes = canonicalizeJsonV1(core);
    const runPlanSha256 = sha256BytesV1(canonicalBytes);
    expect(verifyBuiltRunPlanV1({ core, canonicalBytes, runPlanSha256, runPlanId: `br03-plan-${runPlanSha256.slice(7)}` as CanonicalIdV1 })).not.toEqual([]);
  });

  it('rejects self-consistent built plans with non-boolean or unknown input fields', () => {
    const input = runPlanInputV1();
    const forged = [
      buildRunPlanV1({ ...input, syntheticHardwareProfile: 'yes' as never }),
      buildRunPlanV1({ ...input, browser: { ...input.browser, headless: 'yes' as never } }),
      buildRunPlanV1({ ...input, browser: { ...input.browser, extra: true } as never }),
      buildRunPlanV1({ ...input, candidates: input.candidates.map((candidate, index) => index === 0 ? { ...candidate, extra: true } as never : candidate) }),
      buildRunPlanV1({ ...input, phases: { ...input.phases, cold: { ...input.phases.cold, extra: true } as never } }),
    ];
    for (const plan of forged) expect(() => parseBuiltRunPlanV1(encodeBuiltRunPlanV1(plan))).toThrow(/must be boolean|missing or unknown fields/);
    const invalidComparison = { ...buildRunPlanV1(input), core: { ...buildRunPlanV1(input).core, comparisonMode: 'banana' as never } };
    expect(() => parseBuiltRunPlanV1(encodeBuiltRunPlanV1(invalidComparison))).toThrow(/comparisonMode is invalid/);
  });

  it('rejects duplicate keys before plan input values are interpreted', () => {
    const input = JSON.stringify(runPlanInputV1());
    const duplicate = input.replace(/"orderSeed":([0-9]+)/, '"orderSeed":$1,"orderSeed":1');
    expect(() => parseRunPlanInputJsonV1(new TextEncoder().encode(duplicate))).toThrow(/duplicate object key/i);
  });

  it('rejects profile ownership and debugging browser arguments at plan boundary', () => {
    const input = runPlanInputV1();
    const urlWithCredentials = ['--proxy-server=https://user:', 'p@ss@example.invalid'].join('');
    expect(() => buildRunPlanV1({ ...input, browser: { ...input.browser, requestedArgs: ['--user-data-dir=C:/other'] } })).toThrow(/channel and requested arguments/);
    expect(() => buildRunPlanV1({ ...input, browser: { ...input.browser, requestedArgs: ['--remote-debugging-port=9222'] } })).toThrow(/channel and requested arguments/);
    expect(() => buildRunPlanV1({ ...input, browser: { ...input.browser, requestedArgs: ['--password-file=C:/private/credentials.txt'] } })).toThrow(/channel and requested arguments/);
    expect(() => buildRunPlanV1({ ...input, browser: { ...input.browser, requestedArgs: [urlWithCredentials] } })).toThrow(/channel and requested arguments/);
  });
});

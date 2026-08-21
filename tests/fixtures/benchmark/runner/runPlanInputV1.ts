import type {
  BenchmarkMesherV1,
  CanonicalIdV1,
  GitShaV1,
  Sha256DigestV1,
  UInt32V1,
} from '../../../../src/benchmark/contracts';
import type { RunPlanInputV1 } from '../../../../src/benchmark/runner/contractsV1';

const id = (value: string) => value as CanonicalIdV1;
const digest = (character: string) => `sha256:${character.repeat(64)}` as Sha256DigestV1;

export const meshGoldenParametersV1 = (mesher: BenchmarkMesherV1 = 'greedy') => [
  { key: 'seed' as const, value: 0x4845_5354 as UInt32V1 },
  { key: 'backend' as const, value: 'three-webgl2' as const },
  { key: 'mesher' as const, value: mesher },
  { key: 'chunk-edge' as const, value: 32 as const },
  { key: 'worker-count' as const, value: 0 },
];

export function runPlanInputV1(candidateIds = ['candidate-a', 'candidate-b']): RunPlanInputV1 {
  return {
    expectedSourceCommitSha: 'e88978cbcd5504789a804fb25e353e08aaec1bd6' as GitShaV1,
    expectedBuildSha256: digest('1'),
    fixtureContractId: id('wp04-golden-world-v1'),
    fixtureSemanticSha256: digest('2'),
    hardwareProfileId: id('ci-correctness-synthetic'),
    hardwareBindingSha256: digest('3'),
    syntheticHardwareProfile: true,
    browser: {
      requestedChannel: 'chrome',
      headless: true,
      requestedArgs: ['--disable-background-timer-throttling'],
    },
    orderSeed: 0x1020_3040,
    candidates: candidateIds.map((candidateId, index) => ({
      id: id(candidateId),
      sourceFileSetSha256: digest(String((index % 9) + 1)),
    })),
    scenarios: [{ id: 'mesh-golden-world-v1', parameters: meshGoldenParametersV1() }],
    phases: {
      cold: { enabled: true, minimumProcessesPerCandidate: 10 },
      warmMeasurement: {
        enabled: true,
        minimumProcessesPerCandidate: 6,
        measurementIterationsPerProcess: 5,
      },
      stress: { enabled: false, minimumProcessesPerCandidate: 1 },
      trace: { enabled: false, minimumProcessesPerCandidate: 1 },
      leak: { enabled: false, minimumProcessesPerCandidate: 1 },
    },
    retryPolicy: 'none',
  };
}

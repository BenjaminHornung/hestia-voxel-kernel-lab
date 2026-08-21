import type {
  BenchmarkScenarioIdV1,
  BenchmarkScenarioParameterV1,
  CanonicalIdV1,
} from '../../contracts';
import type { ScenarioDriverDefinitionV1 } from '../contractsV1';
import { validateScenarioParametersV1 } from '../plan/runPlanV1';

const id = (value: string) => value as CanonicalIdV1;

const unavailable = (
  scenarioId: BenchmarkScenarioIdV1,
  reasonCode: string,
): ScenarioDriverDefinitionV1 => ({
  scenarioId,
  status: 'unavailable',
  reasonCode: id(reasonCode),
  measurementEligible: false,
  route: (parameters) => {
    validateScenarioParametersV1({ id: scenarioId, parameters });
    return null;
  },
});

function meshGoldenRoute(parameters: readonly BenchmarkScenarioParameterV1[]): string {
  const canonical = validateScenarioParametersV1({ id: 'mesh-golden-world-v1', parameters });
  const values = new Map(canonical.map((parameter) => [parameter.key, parameter.value]));
  if (values.get('seed') !== 0x4845_5354
    || values.get('backend') !== 'three-webgl2'
    || values.get('chunk-edge') !== 32
    || values.get('worker-count') !== 0) {
    throw new RangeError('mesh-golden-world-v1 is limited to the fixed BR03 lifecycle-smoke parameters.');
  }
  const mesher = values.get('mesher');
  if (mesher === 'visible' || mesher === 'greedy') return `/?lab=wp03&mesher=${mesher}`;
  if (mesher === 'greedy-ao') return '/?lab=wp04&ao=on&debug=surface';
  throw new RangeError('Unsupported mesh-golden-world-v1 mesher.');
}

export const SCENARIO_DRIVER_REGISTRY_V1 = {
  'mesh-golden-world-v1': {
    scenarioId: 'mesh-golden-world-v1',
    status: 'lifecycle-smoke-only',
    reasonCode: id('required-metric-producers-unavailable'),
    measurementEligible: false,
    route: meshGoldenRoute,
  },
  'mesh-density-sweep-v1': unavailable('mesh-density-sweep-v1', 'density-route-unavailable'),
  'scheduler-steady-v1': unavailable('scheduler-steady-v1', 'wp05-scheduler-unavailable'),
  'scheduler-burst-v1': unavailable('scheduler-burst-v1', 'wp05-scheduler-unavailable'),
  'brush-stress-v1': unavailable('brush-stress-v1', 'edit-commandstream-unavailable'),
  'navigation-leak-v1': unavailable('navigation-leak-v1', 'navigation-memory-driver-unavailable'),
  'backend-fixture-v1': unavailable('backend-fixture-v1', 'backend-parity-producers-unavailable'),
} as const satisfies Record<BenchmarkScenarioIdV1, ScenarioDriverDefinitionV1>;

export function resolveScenarioRouteV1(
  scenarioId: BenchmarkScenarioIdV1,
  parameters: readonly BenchmarkScenarioParameterV1[],
): { readonly status: 'ready'; readonly route: string; readonly measurementEligible: false }
  | { readonly status: 'unavailable'; readonly reasonCode: CanonicalIdV1; readonly measurementEligible: false } {
  const driver = SCENARIO_DRIVER_REGISTRY_V1[scenarioId];
  const route = driver.route(parameters);
  return route === null
    ? { status: 'unavailable', reasonCode: driver.reasonCode, measurementEligible: false }
    : { status: 'ready', route, measurementEligible: false };
}

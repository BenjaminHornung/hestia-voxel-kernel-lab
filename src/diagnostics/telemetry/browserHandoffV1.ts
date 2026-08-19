import {
  BENCHMARK_SCENARIO_REGISTRY_V1,
  benchmarkScenarioDefinitionsV1,
  canonicalizeJsonV1,
  parseCanonicalJsonV1,
  type BenchmarkBackendCellV1,
  type BenchmarkSamplePhaseV1,
  type CanonicalIdV1,
} from '../../benchmark/contracts/browserV1';
import {
  BrowserTelemetryCollectorV1,
  type BrowserTelemetryCollectorEnvironmentV1,
  type BrowserTelemetryCollectorReasonV1,
  type BrowserTelemetryCollectorStateV1,
  type BrowserTelemetryDownloadEnvironmentV1,
  type RendererTelemetrySinkV1,
} from './collectorV1';
import {
  BR02_BROWSER_METADATA_LIMITS_V1,
  deriveTelemetryCapabilityIdsV1,
} from './contractV1';

export const BR02_BROWSER_HANDOFF_SCHEMA_VERSION = 1 as const;
export const BR02_BROWSER_HANDOFF_CONTRACT_ID = 'br-02-browser-telemetry-handoff-v1' as const;
export const BR02_BROWSER_RUNTIME_ACTIVATION = 'br02-browser-telemetry-enabled-v1' as const;
export const BR02_BROWSER_HANDOFF_QUERY_KEY = 'br02Telemetry' as const;

export const BR02_BROWSER_HANDOFF_LIMITS_V1 = Object.freeze({
  maxEncodedCodeUnits: 65_536,
  maxDecodedBytes: 49_152,
  ...BR02_BROWSER_METADATA_LIMITS_V1,
} as const);

type BrowserTelemetryModeV1 = 'telemetry-enabled-minimal' | 'telemetry-enabled-full';

export interface BrowserTelemetryHandoffIterationV1 {
  readonly iterationId: CanonicalIdV1;
  readonly iterationOrdinal: number;
}

export interface BrowserTelemetryHandoffEnvelopeV1 {
  readonly schemaVersion: typeof BR02_BROWSER_HANDOFF_SCHEMA_VERSION;
  readonly contractId: typeof BR02_BROWSER_HANDOFF_CONTRACT_ID;
  readonly runtimeActivation: typeof BR02_BROWSER_RUNTIME_ACTIVATION;
  readonly runId: CanonicalIdV1;
  readonly planId: CanonicalIdV1;
  readonly scenarioId: CanonicalIdV1;
  readonly phase: BenchmarkSamplePhaseV1;
  readonly backend: BenchmarkBackendCellV1;
  readonly telemetryMode: BrowserTelemetryModeV1;
  readonly iterations: readonly BrowserTelemetryHandoffIterationV1[];
}

export interface BrowserTelemetryHandoffValidationIssueV1 {
  readonly path: string;
  readonly code: string;
  readonly detail: string;
}

export type BrowserTelemetryHandoffValidationResultV1 =
  | { readonly valid: true; readonly value: BrowserTelemetryHandoffEnvelopeV1; readonly issues: readonly [] }
  | { readonly valid: false; readonly issues: readonly [BrowserTelemetryHandoffValidationIssueV1, ...BrowserTelemetryHandoffValidationIssueV1[]] };

export class BrowserTelemetryHandoffDecodeErrorV1 extends TypeError {
  public constructor(public readonly code: string) {
    super('BR02 browser telemetry handoff is invalid.');
    this.name = 'BrowserTelemetryHandoffDecodeErrorV1';
  }
}

export type BrowserTelemetryHandoffStateV1 = BrowserTelemetryCollectorStateV1 | 'disabled';
export type BrowserTelemetryHandoffReasonV1 = 'no-bootstrap' | 'bootstrap-invalid' | 'initialization-failed' | 'renderer-failure' | BrowserTelemetryCollectorReasonV1;

export interface BrowserTelemetryBootstrapReadResultV1 {
  readonly kind: 'disabled' | 'invalid' | 'enabled';
  readonly envelope?: BrowserTelemetryHandoffEnvelopeV1;
}

export interface BrowserTelemetryHandoffOptionsV1 {
  readonly document?: Document;
  readonly window?: Window;
  readonly location?: Pick<Location, 'search'>;
  readonly collectorEnvironment?: BrowserTelemetryCollectorEnvironmentV1;
}

const ENVELOPE_KEYS = [
  'schemaVersion',
  'contractId',
  'runtimeActivation',
  'runId',
  'planId',
  'scenarioId',
  'phase',
  'backend',
  'telemetryMode',
  'iterations',
] as const;
const ITERATION_KEYS = ['iterationId', 'iterationOrdinal'] as const;
const CANONICAL_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const PHASES = new Set<BenchmarkSamplePhaseV1>(benchmarkScenarioDefinitionsV1.flatMap((definition) => definition.allowedPhases));

type PlainObjectV1 = Record<string, unknown>;

class HandoffValidationErrorV1 extends TypeError {
  public constructor(public readonly path: string, public readonly code: string, message: string) {
    super(message);
    this.name = 'HandoffValidationErrorV1';
  }
}

function fail(path: string, code: string, detail: string): never {
  throw new HandoffValidationErrorV1(path, code, detail);
}

function plainObject(value: unknown, path: string): PlainObjectV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'object-invalid', 'Expected a plain object.');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(path, 'prototype-invalid', 'Foreign prototypes are not allowed.');
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') fail(path, 'symbol-key', 'Symbol keys are not allowed.');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined || !descriptor.enumerable) {
      fail(`${path}.${key}`, 'accessor-invalid', 'Accessor and non-enumerable properties are not allowed.');
    }
  }
  return value as PlainObjectV1;
}

function closed(value: unknown, keys: readonly string[], path: string): PlainObjectV1 {
  const object = plainObject(value, path);
  const expected = new Set(keys);
  for (const key of Reflect.ownKeys(object)) {
    if (typeof key !== 'string' || !expected.has(key)) fail(`${path}.${String(key)}`, 'unknown-key', 'Unknown property.');
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) fail(`${path}.${key}`, 'missing-key', 'Missing property.');
  }
  return object;
}

function plainArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail(path, 'array-invalid', 'Expected a plain array.');
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue;
    if (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length) {
      fail(`${path}.${String(key)}`, 'array-key-invalid', 'Array keys must be contiguous indices.');
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined || !descriptor.enumerable) {
      fail(`${path}[${key}]`, 'accessor-invalid', 'Accessor and non-enumerable properties are not allowed.');
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, String(index))) fail(`${path}[${index}]`, 'array-hole', 'Array holes are not allowed.');
  }
  return value;
}

function asciiString(value: unknown, path: string, maximum = 128): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum) fail(path, 'string-invalid', 'String length is outside the contract.');
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 0x7f) fail(path, 'string-invalid', 'Only ASCII technical strings are allowed.');
  }
  return value;
}

function canonicalId(value: unknown, path: string): CanonicalIdV1 {
  const id = asciiString(value, path);
  if (!CANONICAL_ID.test(id)) fail(path, 'id-invalid', 'Identifier is not canonical.');
  return id as CanonicalIdV1;
}

function safeOrdinal(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
    fail(path, 'ordinal-invalid', 'Iteration ordinal must be a non-negative safe integer.');
  }
  return value;
}

function scenarioDefinition(scenarioId: string) {
  return BENCHMARK_SCENARIO_REGISTRY_V1[scenarioId as keyof typeof BENCHMARK_SCENARIO_REGISTRY_V1]?.definition;
}

function assertEnvelope(value: unknown): BrowserTelemetryHandoffEnvelopeV1 {
  const envelope = closed(value, ENVELOPE_KEYS, '$');
  if (envelope.schemaVersion !== BR02_BROWSER_HANDOFF_SCHEMA_VERSION) fail('$.schemaVersion', 'version-invalid', 'Wrong handoff schema version.');
  if (envelope.contractId !== BR02_BROWSER_HANDOFF_CONTRACT_ID) fail('$.contractId', 'contract-invalid', 'Wrong handoff contract.');
  if (envelope.runtimeActivation !== BR02_BROWSER_RUNTIME_ACTIVATION) fail('$.runtimeActivation', 'activation-invalid', 'Wrong runtime activation literal.');
  const runId = canonicalId(envelope.runId, '$.runId');
  const planId = canonicalId(envelope.planId, '$.planId');
  const scenarioId = canonicalId(envelope.scenarioId, '$.scenarioId');
  const definition = scenarioDefinition(scenarioId);
  if (definition === undefined) fail('$.scenarioId', 'scenario-invalid', 'Scenario is not a BR01 scenario.');
  const phase = asciiString(envelope.phase, '$.phase') as BenchmarkSamplePhaseV1;
  if (!PHASES.has(phase)) fail('$.phase', 'phase-invalid', 'Phase is not a BR01 phase.');
  if (!definition.allowedPhases.includes(phase)) fail('$.phase', 'phase-not-allowed', 'Phase is not allowed for the scenario.');
  const backend = asciiString(envelope.backend, '$.backend') as BenchmarkBackendCellV1;
  if (backend !== 'three-webgl2' && backend !== 'raw-webgpu' && backend !== 'not-applicable') {
    fail('$.backend', 'backend-invalid', 'Backend is not a BR01 backend cell.');
  }
  const hasBackendParameter = definition.parameterContracts.some((contract) => contract.key === 'backend');
  if (hasBackendParameter && backend !== 'three-webgl2') fail('$.backend', 'backend-invalid', 'Only the current WebGL2 backend is valid for browser handoff.');
  if (!hasBackendParameter && backend !== 'not-applicable') fail('$.backend', 'backend-invalid', 'Scenario does not declare a backend parameter.');
  const telemetryMode = asciiString(envelope.telemetryMode, '$.telemetryMode') as BrowserTelemetryModeV1;
  if (telemetryMode !== 'telemetry-enabled-minimal' && telemetryMode !== 'telemetry-enabled-full') {
    fail('$.telemetryMode', 'telemetry-mode-invalid', 'Telemetry mode is outside the handoff contract.');
  }
  const entries = plainArray(envelope.iterations, '$.iterations');
  if (entries.length === 0) fail('$.iterations', 'iteration-empty', 'At least one iteration is required.');
  if (entries.length > BR02_BROWSER_METADATA_LIMITS_V1.maxIterations) fail('$.iterations', 'iteration-limit', 'Iteration count exceeds the handoff limit.');
  const iterationIds = new Set<string>();
  const iterations = entries.map((entry, index) => {
    const iteration = closed(entry, ITERATION_KEYS, `$.iterations[${index}]`);
    const iterationId = canonicalId(iteration.iterationId, `$.iterations[${index}].iterationId`);
    const iterationOrdinal = safeOrdinal(iteration.iterationOrdinal, `$.iterations[${index}].iterationOrdinal`);
    if (iterationOrdinal !== index || iterationIds.has(iterationId)) fail(`$.iterations[${index}]`, 'iteration-order-invalid', 'Iterations must be unique and contiguous.');
    iterationIds.add(iterationId);
    return { iterationId, iterationOrdinal };
  });
  const capabilities = deriveTelemetryCapabilityIdsV1({
    scenarioId,
    phase,
    backend,
  });
  if (capabilities.length > BR02_BROWSER_METADATA_LIMITS_V1.maxCapabilities) fail('$.capabilities', 'capability-limit', 'Capability metadata exceeds the handoff limit.');
  return {
    schemaVersion: BR02_BROWSER_HANDOFF_SCHEMA_VERSION,
    contractId: BR02_BROWSER_HANDOFF_CONTRACT_ID,
    runtimeActivation: BR02_BROWSER_RUNTIME_ACTIVATION,
    runId,
    planId,
    scenarioId,
    phase,
    backend,
    telemetryMode,
    iterations,
  };
}

export function validateBrowserTelemetryHandoffEnvelopeV1(value: unknown): BrowserTelemetryHandoffValidationResultV1 {
  try {
    return { valid: true, value: assertEnvelope(value), issues: [] };
  } catch (error) {
    if (error instanceof HandoffValidationErrorV1) {
      return { valid: false, issues: [{ path: error.path, code: error.code, detail: error.message }] };
    }
    return { valid: false, issues: [{ path: '$', code: 'validator-error', detail: 'Handoff validation failed closed.' }] };
  }
}

export function isBrowserTelemetryHandoffEnvelopeV1(value: unknown): value is BrowserTelemetryHandoffEnvelopeV1 {
  return validateBrowserTelemetryHandoffEnvelopeV1(value).valid;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function encodeBase64Url(bytes: Uint8Array): string {
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]!;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    result += BASE64URL_ALPHABET[first >> 2];
    result += BASE64URL_ALPHABET[((first & 3) << 4) | ((second ?? 0) >> 4)];
    if (second !== undefined) result += BASE64URL_ALPHABET[((second & 15) << 2) | ((third ?? 0) >> 6)];
    if (third !== undefined) result += BASE64URL_ALPHABET[third & 63];
  }
  return result;
}

function decodeBase64Url(value: string): Uint8Array {
  if (value.length === 0 || value.length > BR02_BROWSER_HANDOFF_LIMITS_V1.maxEncodedCodeUnits) {
    throw new BrowserTelemetryHandoffDecodeErrorV1('encoded-size');
  }
  if (value.length % 4 === 1) throw new BrowserTelemetryHandoffDecodeErrorV1('encoded-length');
  const output: number[] = [];
  let accumulator = 0;
  let bits = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    const sixBits = BASE64URL_ALPHABET.indexOf(character);
    if (sixBits < 0) throw new BrowserTelemetryHandoffDecodeErrorV1('encoded-alphabet');
    accumulator = accumulator * 64 + sixBits;
    bits += 6;
    while (bits >= 8) {
      bits -= 8;
      output.push(Math.floor(accumulator / 2 ** bits) & 0xff);
      accumulator %= 2 ** bits;
      if (output.length > BR02_BROWSER_HANDOFF_LIMITS_V1.maxDecodedBytes) throw new BrowserTelemetryHandoffDecodeErrorV1('decoded-size');
    }
  }
  if (accumulator !== 0) throw new BrowserTelemetryHandoffDecodeErrorV1('encoded-padding');
  return new Uint8Array(output);
}

export function encodeBrowserTelemetryHandoffV1(value: BrowserTelemetryHandoffEnvelopeV1): string {
  const validation = validateBrowserTelemetryHandoffEnvelopeV1(value);
  if (!validation.valid) throw new BrowserTelemetryHandoffDecodeErrorV1('envelope-invalid');
  const bytes = canonicalizeJsonV1(validation.value);
  if (bytes.byteLength > BR02_BROWSER_HANDOFF_LIMITS_V1.maxDecodedBytes) throw new BrowserTelemetryHandoffDecodeErrorV1('decoded-size');
  const encoded = encodeBase64Url(bytes);
  if (encoded.length > BR02_BROWSER_HANDOFF_LIMITS_V1.maxEncodedCodeUnits) throw new BrowserTelemetryHandoffDecodeErrorV1('encoded-size');
  return encoded;
}

export function decodeBrowserTelemetryHandoffV1(encoded: string): BrowserTelemetryHandoffEnvelopeV1 {
  const bytes = decodeBase64Url(encoded);
  let parsed: unknown;
  try {
    parsed = parseCanonicalJsonV1(bytes);
    const canonical = canonicalizeJsonV1(parsed);
    if (!sameBytes(bytes, canonical)) throw new BrowserTelemetryHandoffDecodeErrorV1('canonical-encoding');
  } catch (error) {
    if (error instanceof BrowserTelemetryHandoffDecodeErrorV1) throw error;
    throw new BrowserTelemetryHandoffDecodeErrorV1('canonical-json');
  }
  const validation = validateBrowserTelemetryHandoffEnvelopeV1(parsed);
  if (!validation.valid) throw new BrowserTelemetryHandoffDecodeErrorV1(validation.issues[0]!.code);
  return validation.value;
}

export function readBrowserTelemetryBootstrapV1(search: string): BrowserTelemetryBootstrapReadResultV1 {
  const values = new URLSearchParams(search).getAll(BR02_BROWSER_HANDOFF_QUERY_KEY);
  if (values.length === 0) return { kind: 'disabled' };
  if (values.length !== 1) return { kind: 'invalid' };
  try {
    return { kind: 'enabled', envelope: decodeBrowserTelemetryHandoffV1(values[0]!) };
  } catch {
    return { kind: 'invalid' };
  }
}

interface HandoffElementsV1 {
  readonly panel: HTMLElement;
  readonly current: HTMLOutputElement;
  readonly status: HTMLElement;
  readonly start: HTMLButtonElement;
  readonly complete: HTMLButtonElement;
  readonly advance: HTMLButtonElement;
  readonly seal: HTMLButtonElement;
  readonly exportButton: HTMLButtonElement;
}

export class BrowserTelemetryHandoffV1 {
  readonly #root: HTMLElement;
  readonly #document: Document;
  readonly #window: Window;
  readonly #elements: HandoffElementsV1;
  readonly #collectorEnvironment: BrowserTelemetryCollectorEnvironmentV1 | undefined;
  #collector: BrowserTelemetryCollectorV1 | null = null;
  #state: BrowserTelemetryHandoffStateV1 = 'disabled';
  #reason: BrowserTelemetryHandoffReasonV1 = 'no-bootstrap';
  #envelope: BrowserTelemetryHandoffEnvelopeV1 | null = null;

  public constructor(root: HTMLElement, options: BrowserTelemetryHandoffOptionsV1 = {}) {
    this.#root = root;
    this.#document = options.document ?? document;
    this.#window = options.window ?? window;
    this.#collectorEnvironment = options.collectorEnvironment;
    this.#elements = this.#createElements();
    const result = readBrowserTelemetryBootstrapV1((options.location ?? this.#window.location).search);
    if (result.kind === 'disabled') {
      this.#sync();
      return;
    }
    if (result.kind === 'invalid' || result.envelope === undefined) {
      this.#state = 'invalid';
      this.#reason = 'bootstrap-invalid';
      this.#sync();
      return;
    }
    this.#envelope = result.envelope;
    this.#state = 'initializing';
    this.#reason = 'none';
    this.#sync();
    try {
      this.#collector = new BrowserTelemetryCollectorV1({
        bootstrap: result.envelope,
        canvas: this.#root.querySelector<HTMLCanvasElement>('[data-testid="voxel-canvas"]')!,
        environment: this.#collectorEnvironment,
        onStateChange: (state, reason) => this.#collectorStateChanged(state, reason),
      });
      this.#sync();
    } catch {
      this.#state = 'invalid';
      this.#reason = 'initialization-failed';
      this.#sync();
    }
  }

  public get state(): BrowserTelemetryHandoffStateV1 {
    return this.#state;
  }

  public get reason(): BrowserTelemetryHandoffReasonV1 {
    return this.#reason;
  }

  public get envelope(): BrowserTelemetryHandoffEnvelopeV1 | null {
    return this.#envelope;
  }

  public get collector(): BrowserTelemetryCollectorV1 | null {
    return this.#collector;
  }

  public get shouldStartScene(): boolean {
    return this.#state !== 'invalid';
  }

  public get rendererSink(): RendererTelemetrySinkV1 | undefined {
    return this.#collector?.state === 'initializing' ? this.#collector.rendererSink : undefined;
  }

  public markRendererReady(): boolean {
    const marked = this.#collector?.markReady() ?? false;
    this.#sync();
    return marked;
  }

  public markRendererFailed(): void {
    if (this.#collector !== null) {
      this.#collector.markRendererFailed();
      this.#sync();
      return;
    }
    if (this.#state === 'sealed' || this.#state === 'invalid') return;
    this.#state = 'invalid';
    this.#reason = 'renderer-failure';
    this.#sync();
  }

  public dispose(): void {
    this.#collector?.dispose();
  }

  #createElements(): HandoffElementsV1 {
    const hud = this.#root.querySelector<HTMLElement>('[data-testid="voxel-hud"]');
    const list = hud?.querySelector('dl');
    if (!hud || !list) throw new Error('BR02 telemetry HUD insertion point is missing.');
    const panel = this.#document.createElement('section');
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'BR02 browser telemetry');
    panel.dataset.testid = 'telemetry-panel';
    const heading = this.#document.createElement('p');
    heading.textContent = 'BR02 browser telemetry v1';
    panel.append(heading);
    const currentLabel = this.#document.createElement('span');
    currentLabel.textContent = 'Current iteration';
    const current = this.#document.createElement('output');
    current.dataset.testid = 'telemetry-current-iteration';
    current.setAttribute('aria-label', 'Current telemetry iteration');
    current.textContent = '—';
    const currentRow = this.#document.createElement('p');
    currentRow.append(currentLabel, ': ', current);
    panel.append(currentRow);
    const status = this.#document.createElement('div');
    status.dataset.testid = 'telemetry-contract-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    panel.append(status);
    const controls = this.#document.createElement('div');
    controls.className = 'controls';
    controls.setAttribute('aria-label', 'BR02 telemetry lifecycle controls');
    const button = (testId: string, label: string): HTMLButtonElement => {
      const value = this.#document.createElement('button');
      value.type = 'button';
      value.dataset.testid = testId;
      value.setAttribute('aria-label', label);
      value.textContent = label;
      controls.append(value);
      return value;
    };
    const start = button('telemetry-start-current-iteration', 'Start current iteration');
    const complete = button('telemetry-complete-current-iteration', 'Complete current iteration');
    const advance = button('telemetry-advance-next-iteration', 'Advance to next iteration');
    const seal = button('telemetry-seal', 'Seal telemetry');
    const exportButton = button('telemetry-export', 'Export telemetry');
    panel.append(controls);
    list.parentElement?.insertBefore(panel, list);
    start.addEventListener('click', () => { this.#collector?.startCurrentIteration(); this.#sync(); });
    complete.addEventListener('click', () => {
      if (this.#collector?.canCompleteAndSealCurrentIteration) this.#collector.completeAndSealCurrentIteration();
      else this.#collector?.completeCurrentIteration();
      this.#sync();
    });
    advance.addEventListener('click', () => { this.#collector?.advanceToNextIteration(); this.#sync(); });
    seal.addEventListener('click', () => { this.#collector?.seal(); this.#sync(); });
    exportButton.addEventListener('click', () => {
      const url = globalThis.URL as unknown as BrowserTelemetryDownloadEnvironmentV1['url'];
      const environment: BrowserTelemetryDownloadEnvironmentV1 = {
        document: this.#document,
        url,
        setTimeout: (callback, delay) => this.#window.setTimeout(callback, delay),
      };
      this.#collector?.scheduleExportDownload(environment);
      this.#sync();
    });
    return { panel, current, status, start, complete, advance, seal, exportButton };
  }

  #collectorStateChanged(state: BrowserTelemetryCollectorStateV1, reason: BrowserTelemetryCollectorReasonV1): void {
    this.#state = state;
    this.#reason = reason;
    this.#sync();
  }

  #sync(): void {
    const collector = this.#collector;
    if (collector !== null) {
      this.#state = collector.state;
      this.#reason = collector.reason;
    }
    const current = collector?.currentIteration ?? this.#envelope?.iterations[0];
    this.#elements.current.textContent = current === undefined
      ? '—'
      : `id=${current.iterationId}; ordinal=${current.iterationOrdinal}`;
    this.#elements.status.textContent = `contract=${BR02_BROWSER_HANDOFF_CONTRACT_ID}; version=${BR02_BROWSER_HANDOFF_SCHEMA_VERSION}; state=${this.#state}; reason=${this.#reason}`;
    this.#elements.start.disabled = !collector?.canStartCurrentIteration;
    this.#elements.complete.disabled = !collector?.canCompleteCurrentIteration;
    this.#elements.advance.disabled = !collector?.canAdvanceToNextIteration;
    this.#elements.seal.disabled = !collector?.canSeal;
    this.#elements.exportButton.disabled = !collector?.canExport;
    this.#root.dataset.telemetryState = this.#state;
  }
}

export function createBrowserTelemetryHandoffV1(
  root: HTMLElement,
  options: BrowserTelemetryHandoffOptionsV1 = {},
): BrowserTelemetryHandoffV1 {
  return new BrowserTelemetryHandoffV1(root, options);
}

export const createBrowserHandoffV1 = createBrowserTelemetryHandoffV1;

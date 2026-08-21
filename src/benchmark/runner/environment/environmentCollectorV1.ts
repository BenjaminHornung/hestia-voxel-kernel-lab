import { arch, cpus, platform, release, totalmem } from 'node:os';
import { normalize } from 'node:path';
import type {
  AvailabilityDeclaredStabilityV1,
  AvailabilityObservedStabilityV1,
  AvailabilityStatusV1,
  AvailabilityV1,
  BenchmarkEnvironmentManifestV1,
  BenchmarkGateRoleV1,
  CanonicalIdV1,
  NonEmptyString,
  SafePositiveIntegerV1,
  Sha256DigestV1,
} from '../../contracts';
import { compareUtf16 } from '../../provenance';

export interface CdpSessionV1 {
  send(method: string): Promise<unknown>;
}

export interface HostObservationV1 {
  readonly osName: string;
  readonly osVersion: string;
  readonly architecture: string;
  readonly cpuModels: readonly string[];
  readonly logicalCores: number;
  readonly ramBytes: number;
}

export interface RuntimeEnvironmentObservationV1 {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly devicePixelRatio: number;
  readonly visibility: 'visible' | 'hidden';
  readonly focused: boolean;
  readonly backgroundTabs: number;
}

export interface EnvironmentCapabilityObservationV1 {
  readonly id: CanonicalIdV1;
  readonly supported: boolean;
  readonly sourceRef: CanonicalIdV1;
}

export interface EnvironmentCollectorOptionsV1 {
  readonly hardwareProfileId: CanonicalIdV1;
  readonly hardwareProfileTier?: 'H1' | 'H2' | 'H3';
  readonly gateRole: BenchmarkGateRoleV1;
  readonly syntheticHardwareProfile: boolean;
  readonly requestedChannel: string;
  readonly requestedHeadless: boolean;
  readonly requestedArgs: readonly string[];
  readonly profilePath: string;
  readonly outputRoot: string;
  readonly executableSha256?: Sha256DigestV1;
  readonly runtime: RuntimeEnvironmentObservationV1;
  readonly capabilities: readonly EnvironmentCapabilityObservationV1[];
  readonly cdp: CdpSessionV1;
  readonly host?: HostObservationV1;
}

export interface EnvironmentCaptureV1 {
  readonly manifest: BenchmarkEnvironmentManifestV1;
  readonly requestedArgs: AvailabilityV1<readonly NonEmptyString[]>;
  readonly effectiveArgs: AvailabilityV1<readonly NonEmptyString[]>;
  readonly measurementEligible: boolean;
  readonly ineligibilityReasons: readonly ('synthetic-hardware-profile' | 'headless-browser' | 'environment-incomplete' | 'runtime-state-invalid')[];
}

const source = (value: string): CanonicalIdV1 => value as CanonicalIdV1;
const text = (value: string): NonEmptyString => value as NonEmptyString;

function observed<T>(value: T, sourceRef: string, stability: AvailabilityObservedStabilityV1 = 'stable'): AvailabilityV1<T> {
  return { status: 'observed', value, sourceRef: source(sourceRef), stability };
}

function declared<T>(value: T, sourceRef: string, stability: AvailabilityDeclaredStabilityV1): AvailabilityV1<T> {
  return { status: 'declared', value, sourceRef: source(sourceRef), stability };
}

function unavailable<T>(
  sourceRef: string,
  reasonCode: string,
  status: Exclude<AvailabilityStatusV1, 'observed' | 'declared'> = 'unknown',
): AvailabilityV1<T> {
  return { status, value: null, sourceRef: source(sourceRef), reasonCode: source(reasonCode) };
}

function positiveInteger(value: number, sourceRef: string): AvailabilityV1<SafePositiveIntegerV1> {
  return Number.isSafeInteger(value) && value > 0
    ? observed(value as SafePositiveIntegerV1, sourceRef)
    : unavailable(sourceRef, 'invalid-host-value');
}

function nonEmpty(value: unknown, sourceRef: string, stability: AvailabilityObservedStabilityV1 = 'stable'): AvailabilityV1<NonEmptyString> {
  return typeof value === 'string' && value.length > 0
    ? observed(text(value), sourceRef, stability)
    : unavailable(sourceRef, 'value-not-observed');
}

async function safeSend(cdp: CdpSessionV1, method: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await cdp.send(method);
    return response !== null && typeof response === 'object' && !Array.isArray(response)
      ? response as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function defaultHost(): HostObservationV1 {
  const processors = cpus();
  return {
    osName: platform(),
    osVersion: release(),
    architecture: arch(),
    cpuModels: processors.map(({ model }) => model),
    logicalCores: processors.length,
    ramBytes: totalmem(),
  };
}

function comparablePath(value: string): string {
  const unquoted = value.replace(/^['"]|['"]$/g, '');
  const normalized = normalize(unquoted).replace(/[\\/]+/g, '/').replace(/\/$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function argumentValues(arguments_: readonly unknown[], name: string): readonly string[] {
  const values: string[] = [];
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (typeof argument !== 'string') continue;
    if (argument.startsWith(`${name}=`)) values.push(argument.slice(name.length + 1));
    else if (argument === name) values.push(typeof arguments_[index + 1] === 'string' ? arguments_[index + 1] as string : '');
  }
  return values;
}

function assertOwnedProfilePathV1(arguments_: readonly unknown[], profilePath: string): void {
  const effectiveProfiles = argumentValues(arguments_, '--user-data-dir');
  if (effectiveProfiles.length !== 1 || comparablePath(effectiveProfiles[0]!) !== comparablePath(profilePath)) {
    throw new TypeError('Effective browser profile path is not uniquely bound to the runner-owned profile.');
  }
}

function privateEffectiveArgs(arguments_: readonly unknown[], profilePath: string, outputRoot: string): readonly NonEmptyString[] {
  const credentialArgument = /^--[^=]*(?:password|passwd|token|secret|credential|api[-_]?key|access[-_]?key|auth(?:entication)?|username)(?:[-_](?:file|path))?(?==|$)/i;
  const urlUserInfo = /[a-z][a-z0-9+.-]*:\/\/[^\s/@]+(?::[^\s/@]*)?@/i;
  const profileRoot = comparablePath(profilePath);
  const resultsRoot = comparablePath(outputRoot);
  if (arguments_.some((value) => typeof value === 'string' && urlUserInfo.test(value))) {
    throw new TypeError('Credential-like browser argument is not allowed in runner artifacts.');
  }
  const redacted = arguments_
    .filter((value): value is string => typeof value === 'string' && value.startsWith('--') && value.length > 2)
    .map((argument) => {
      const separator = argument.indexOf('=');
      const name = separator < 0 ? argument : argument.slice(0, separator);
      if (credentialArgument.test(argument) || urlUserInfo.test(argument)) throw new TypeError('Credential-like browser argument is not allowed in runner artifacts.');
      const value = separator >= 0 ? argument.slice(separator + 1) : '';
      const comparableValue = comparablePath(value);
      const privateLabel = name === '--user-data-dir' || comparableValue === profileRoot || comparableValue.startsWith(`${profileRoot}/`)
        ? '<PROFILE>'
        : name === '--output' || comparableValue === resultsRoot || comparableValue.startsWith(`${resultsRoot}/`)
          ? '<RESULTS>'
          : undefined;
      return text(separator >= 0 && privateLabel !== undefined ? `${name}=${privateLabel}` : argument);
    });
  return [...new Set(redacted)].sort(compareUtf16);
}

function gpuDevice(systemInfo: Record<string, unknown> | null): Record<string, unknown> | null {
  const gpu = systemInfo?.gpu;
  if (gpu === null || typeof gpu !== 'object' || Array.isArray(gpu)) return null;
  const devices = (gpu as Record<string, unknown>).devices;
  const device = Array.isArray(devices) ? devices[0] : undefined;
  return device !== null && typeof device === 'object' && !Array.isArray(device) ? device as Record<string, unknown> : null;
}

function gpuAttributes(systemInfo: Record<string, unknown> | null): Record<string, unknown> | null {
  const gpu = systemInfo?.gpu;
  if (gpu === null || typeof gpu !== 'object' || Array.isArray(gpu)) return null;
  const attributes = (gpu as Record<string, unknown>).auxAttributes;
  return attributes !== null && typeof attributes === 'object' && !Array.isArray(attributes)
    ? attributes as Record<string, unknown>
    : null;
}

export async function collectEnvironmentV1(options: EnvironmentCollectorOptionsV1): Promise<EnvironmentCaptureV1> {
  if (options.requestedChannel.length === 0 || options.requestedArgs.some((argument) => argument.length === 0)) {
    throw new TypeError('Browser run configuration contains an empty value.');
  }
  if (new Set(options.capabilities.map(({ id }) => id)).size !== options.capabilities.length) {
    throw new TypeError('Environment capability IDs must be unique.');
  }
  const [browserVersion, systemInfo, commandLine] = await Promise.all([
    safeSend(options.cdp, 'Browser.getVersion'),
    safeSend(options.cdp, 'SystemInfo.getInfo'),
    safeSend(options.cdp, 'Browser.getBrowserCommandLine'),
  ]);
  const host = options.host ?? defaultHost();
  const productValue = typeof browserVersion?.product === 'string' ? browserVersion.product : '';
  const separator = productValue.indexOf('/');
  const product = separator > 0 ? productValue.slice(0, separator) : productValue;
  const version = separator > 0 ? productValue.slice(separator + 1) : '';
  const device = gpuDevice(systemInfo);
  const attributes = gpuAttributes(systemInfo);
  const driverParts = [device?.driverVendor, device?.driverVersion].filter((value): value is string => typeof value === 'string' && value.length > 0);
  const commandArguments = commandLine?.arguments;
  const systemInfoCommandLine = systemInfo?.commandLine;
  const rawEffectiveArgs = Array.isArray(commandArguments) ? commandArguments : Array.isArray(systemInfoCommandLine) ? systemInfoCommandLine : undefined;
  if (rawEffectiveArgs !== undefined) assertOwnedProfilePathV1(rawEffectiveArgs, options.profilePath);
  const effectiveArgs = rawEffectiveArgs === undefined
    ? unavailable<readonly NonEmptyString[]>('cdp-browser-command-line-v1', 'command-line-not-observed')
    : Array.isArray(commandArguments)
    ? observed(privateEffectiveArgs(commandArguments, options.profilePath, options.outputRoot), 'cdp-browser-command-line-v1', 'experimental')
    : observed(privateEffectiveArgs(systemInfoCommandLine as readonly unknown[], options.profilePath, options.outputRoot), 'cdp-system-info-command-line-v1', 'experimental');
  const requestedArgs = declared(options.requestedArgs.map(text), 'br03-run-config-v1', 'run-config');
  const runtimeSource = 'browser-runtime-state-v1';
  const model = host.cpuModels.find((value) => value.length > 0);
  const manifest: BenchmarkEnvironmentManifestV1 = {
    schemaVersion: 'benchmark-environment-manifest-v1',
    hardwareProfileId: declared(options.hardwareProfileId, 'hardware-profile-binding-v1', 'owner-binding'),
    hardwareProfileTier: options.hardwareProfileTier === undefined
      ? unavailable('hardware-profile-binding-v1', 'profile-tier-not-bound')
      : declared(options.hardwareProfileTier, 'hardware-profile-binding-v1', 'owner-binding'),
    gateRole: declared(options.gateRole, 'hardware-profile-binding-v1', 'owner-binding'),
    os: {
      name: nonEmpty(host.osName, 'node-os-v1'),
      version: nonEmpty(host.osVersion, 'node-os-v1'),
      architecture: nonEmpty(host.architecture, 'node-os-v1'),
    },
    cpu: {
      vendor: unavailable('node-os-v1', 'cpu-vendor-not-observed'),
      model: model === undefined ? unavailable('node-os-v1', 'cpu-model-not-observed') : observed(text(model), 'node-os-v1'),
      physicalCores: unavailable('node-os-v1', 'physical-cores-not-observed'),
      logicalCores: positiveInteger(host.logicalCores, 'node-os-v1'),
      ramBytes: positiveInteger(host.ramBytes, 'node-os-v1'),
    },
    gpu: {
      vendor: nonEmpty(device?.vendorString, 'cdp-system-info-v1', 'experimental'),
      device: nonEmpty(device?.deviceString, 'cdp-system-info-v1', 'experimental'),
      driver: driverParts.length === 0 ? unavailable('cdp-system-info-v1', 'gpu-driver-not-observed') : observed(text(driverParts.join(' ')), 'cdp-system-info-v1', 'experimental'),
      graphicsBackend: nonEmpty(attributes?.displayType, 'cdp-system-info-v1', 'experimental'),
    },
    browser: {
      product: nonEmpty(product, 'cdp-browser-version-v1', 'experimental'),
      version: nonEmpty(version, 'cdp-browser-version-v1', 'experimental'),
      channel: declared(text(options.requestedChannel), 'br03-run-config-v1', 'run-config'),
      userAgent: nonEmpty(browserVersion?.userAgent, 'cdp-browser-version-v1', 'experimental'),
      executableSha256: options.executableSha256 === undefined
        ? unavailable('br03-browser-executable-v1', 'executable-digest-not-observed')
        : observed(options.executableSha256, 'br03-browser-executable-v1'),
      headless: declared(options.requestedHeadless, 'br03-run-config-v1', 'run-config'),
      flags: effectiveArgs,
    },
    display: {
      cssWidth: positiveInteger(options.runtime.cssWidth, runtimeSource),
      cssHeight: positiveInteger(options.runtime.cssHeight, runtimeSource),
      devicePixelRatio: Number.isFinite(options.runtime.devicePixelRatio) && options.runtime.devicePixelRatio > 0
        ? observed(options.runtime.devicePixelRatio, runtimeSource)
        : unavailable(runtimeSource, 'device-pixel-ratio-not-observed'),
      refreshHz: unavailable(runtimeSource, 'refresh-rate-not-observed'),
      vsync: unavailable(runtimeSource, 'vsync-not-observed'),
    },
    power: {
      source: unavailable('br03-environment-v1', 'power-source-not-observed'),
      profile: unavailable('br03-environment-v1', 'power-profile-not-observed'),
      battery: unavailable('br03-environment-v1', 'battery-not-observed'),
    },
    runtimeState: {
      visibility: observed(options.runtime.visibility, runtimeSource),
      focus: observed(options.runtime.focused ? 'focused' : 'unfocused', runtimeSource),
      backgroundTabs: Number.isSafeInteger(options.runtime.backgroundTabs) && options.runtime.backgroundTabs >= 0
        ? observed(options.runtime.backgroundTabs, runtimeSource)
        : unavailable(runtimeSource, 'background-tabs-not-observed'),
      competingLoad: unavailable('br03-environment-v1', 'competing-load-not-observed'),
      thermalState: unavailable('br03-environment-v1', 'thermal-state-not-observed'),
    },
    capabilities: [...options.capabilities]
      .sort((left, right) => compareUtf16(left.id, right.id))
      .map(({ id, sourceRef, supported }) => ({
        id,
        value: supported ? observed(true as const, sourceRef, 'experimental') : unavailable(sourceRef, 'capability-unsupported', 'unsupported'),
      })),
  };
  const ineligibilityReasons: EnvironmentCaptureV1['ineligibilityReasons'][number][] = [];
  if (options.syntheticHardwareProfile) ineligibilityReasons.push('synthetic-hardware-profile');
  if (options.requestedHeadless) ineligibilityReasons.push('headless-browser');
  if (options.runtime.visibility !== 'visible' || !options.runtime.focused || options.runtime.backgroundTabs !== 0) ineligibilityReasons.push('runtime-state-invalid');
  const requiredEvidence = [
    manifest.hardwareProfileTier, manifest.cpu.vendor, manifest.cpu.physicalCores,
    manifest.browser.executableSha256, manifest.browser.flags, manifest.display.refreshHz, manifest.display.vsync,
    manifest.power.source, manifest.power.profile, manifest.runtimeState.competingLoad, manifest.runtimeState.thermalState,
  ];
  if (requiredEvidence.some(({ status }) => status !== 'observed')) ineligibilityReasons.push('environment-incomplete');
  return { manifest, requestedArgs, effectiveArgs, measurementEligible: ineligibilityReasons.length === 0, ineligibilityReasons };
}

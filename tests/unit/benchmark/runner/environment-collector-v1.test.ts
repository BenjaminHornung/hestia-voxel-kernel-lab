import { describe, expect, it } from 'vitest';
import type { CanonicalIdV1, Sha256DigestV1 } from '../../../../src/benchmark/contracts';
import { collectEnvironmentV1, type CdpSessionV1 } from '../../../../src/benchmark/runner/environment/environmentCollectorV1';

const id = (value: string) => value as CanonicalIdV1;

describe('BR03 environment collector v1', () => {
  const cdp: CdpSessionV1 = {
    send: async (method) => {
      if (method === 'Browser.getVersion') return { product: 'Chrome/140.0.1.2', userAgent: 'test-agent' };
      if (method === 'Browser.getBrowserCommandLine') return { arguments: [
        'C:/browser/chrome.exe',
        '--headless',
        '--user-data-dir=C:/private/profile',
        '--password-store=basic',
        '--output=C:/private/results',
      ] };
      return { gpu: {
        devices: [{ vendorString: 'GPU Vendor', deviceString: 'GPU Device', driverVendor: 'Driver Vendor', driverVersion: '1.2.3' }],
        auxAttributes: { displayType: 'ANGLE_VULKAN' },
      } };
    },
  };

  it('separates declared and effective args, removes private values, and preserves unknown evidence', async () => {
    const capture = await collectEnvironmentV1({
      hardwareProfileId: id('synthetic-ci'), gateRole: 'correctness-only', syntheticHardwareProfile: true,
      requestedChannel: 'chromium', requestedHeadless: true, requestedArgs: ['--headless'],
      profilePath: 'C:/private/profile', outputRoot: 'C:/private/results',
      runtime: { cssWidth: 1920, cssHeight: 1080, devicePixelRatio: 1, visibility: 'visible', focused: true, backgroundTabs: 0 },
      capabilities: [{ id: id('webgl2'), supported: true, sourceRef: id('browser-capability-probe-v1') }],
      cdp,
      host: { osName: 'win32', osVersion: '10.0', architecture: 'x64', cpuModels: ['Test CPU'], logicalCores: 8, ramBytes: 16_000_000_000 },
    });
    expect(capture.requestedArgs).toMatchObject({ status: 'declared', value: ['--headless'] });
    expect(capture.effectiveArgs.status).toBe('observed');
    expect(JSON.stringify(capture.effectiveArgs)).not.toContain('C:/private');
    expect(capture.effectiveArgs).toMatchObject({ value: expect.arrayContaining(['--user-data-dir=<PROFILE>', '--output=<RESULTS>']) });
    expect(capture.manifest.browser).toMatchObject({ product: { value: 'Chrome' }, version: { value: '140.0.1.2' } });
    expect(capture.manifest.gpu).toMatchObject({ vendor: { value: 'GPU Vendor' }, graphicsBackend: { value: 'ANGLE_VULKAN' } });
    expect(capture.manifest.cpu.physicalCores.status).toBe('unknown');
    expect(capture.manifest.power.source.status).toBe('unknown');
    expect(capture.measurementEligible).toBe(false);
    expect(capture.ineligibilityReasons).toContain('synthetic-hardware-profile');
    expect(capture.ineligibilityReasons).toContain('headless-browser');
  });

  it('fails closed to unknown when CDP evidence cannot be observed', async () => {
    const capture = await collectEnvironmentV1({
      hardwareProfileId: id('hardware-1'), hardwareProfileTier: 'H1', gateRole: 'performance-primary', syntheticHardwareProfile: false,
      requestedChannel: 'chrome', requestedHeadless: false, requestedArgs: [], profilePath: 'profile', outputRoot: 'results',
      executableSha256: `sha256:${'a'.repeat(64)}` as Sha256DigestV1,
      runtime: { cssWidth: 800, cssHeight: 600, devicePixelRatio: 1, visibility: 'hidden', focused: false, backgroundTabs: 1 },
      capabilities: [], cdp: { send: async () => { throw new Error('unavailable'); } },
      host: { osName: 'linux', osVersion: '1', architecture: 'x64', cpuModels: [], logicalCores: 4, ramBytes: 8_000_000_000 },
    });
    expect(capture.manifest.browser.product.status).toBe('unknown');
    expect(capture.manifest.gpu.vendor.status).toBe('unknown');
    expect(capture.effectiveArgs.status).toBe('unknown');
    expect(capture.ineligibilityReasons).toContain('runtime-state-invalid');
    expect(capture.measurementEligible).toBe(false);
  });

  it('rejects an effective browser profile outside the owned path', async () => {
    const mismatch: CdpSessionV1 = {
      send: async (method) => method === 'Browser.getBrowserCommandLine'
        ? { arguments: ['--user-data-dir=C:/other/profile'] }
        : method === 'Browser.getVersion' ? { product: 'Chrome/140', userAgent: 'test-agent' } : {},
    };
    await expect(collectEnvironmentV1({
      hardwareProfileId: id('synthetic-ci'), gateRole: 'correctness-only', syntheticHardwareProfile: true,
      requestedChannel: 'chromium', requestedHeadless: true, requestedArgs: [],
      profilePath: 'C:/private/profile', outputRoot: 'C:/private/results',
      runtime: { cssWidth: 1, cssHeight: 1, devicePixelRatio: 1, visibility: 'visible', focused: true, backgroundTabs: 0 },
      capabilities: [], cdp: mismatch,
    })).rejects.toThrow(/profile path/);
  });

  it('rejects ambiguous effective browser profile flags', async () => {
    const duplicate: CdpSessionV1 = {
      send: async (method) => method === 'Browser.getBrowserCommandLine'
        ? { arguments: ['--user-data-dir=C:/private/profile', '--user-data-dir=C:/other/profile'] }
        : method === 'Browser.getVersion' ? { product: 'Chrome/140', userAgent: 'test-agent' } : {},
    };
    await expect(collectEnvironmentV1({
      hardwareProfileId: id('synthetic-ci'), gateRole: 'correctness-only', syntheticHardwareProfile: true,
      requestedChannel: 'chromium', requestedHeadless: true, requestedArgs: [],
      profilePath: 'C:/private/profile', outputRoot: 'C:/private/results',
      runtime: { cssWidth: 1, cssHeight: 1, devicePixelRatio: 1, visibility: 'visible', focused: true, backgroundTabs: 0 },
      capabilities: [], cdp: duplicate,
    })).rejects.toThrow(/uniquely bound/);
  });

  it('rejects credential-like effective browser flag names with suffixes', async () => {
    const credentialFlag: CdpSessionV1 = {
      send: async (method) => method === 'Browser.getBrowserCommandLine'
        ? { arguments: ['--user-data-dir=C:/private/profile', '--password-file=C:/private/credentials.txt'] }
        : method === 'Browser.getVersion' ? { product: 'Chrome/140', userAgent: 'test-agent' } : {},
    };
    await expect(collectEnvironmentV1({
      hardwareProfileId: id('synthetic-ci'), gateRole: 'correctness-only', syntheticHardwareProfile: true,
      requestedChannel: 'chromium', requestedHeadless: true, requestedArgs: [],
      profilePath: 'C:/private/profile', outputRoot: 'C:/private/results',
      runtime: { cssWidth: 1, cssHeight: 1, devicePixelRatio: 1, visibility: 'visible', focused: true, backgroundTabs: 0 },
      capabilities: [], cdp: credentialFlag,
    })).rejects.toThrow(/Credential-like/);
  });
});

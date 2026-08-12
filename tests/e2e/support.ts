import type { BrowserContext, Page } from '@playwright/test';

export interface PageFailures {
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
  readonly requestFailures: string[];
  readonly httpErrors: string[];
}

export async function metricNumber(page: Page, testId: string): Promise<number> {
  return Number((await page.getByTestId(testId).innerText())
    .replaceAll(',', '').replace(' ms', '').replace(' B', '').replace(' estimate', '').trim());
}

export function trackPageFailures(page: Page): PageFailures {
  const failures = { consoleErrors: [] as string[], pageErrors: [] as string[], requestFailures: [] as string[], httpErrors: [] as string[] };
  page.on('console', (message) => {
    if (message.type() === 'error') failures.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => failures.pageErrors.push(error.message));
  page.on('requestfailed', (request) => failures.requestFailures.push(
    `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'unknown failure'}`,
  ));
  page.on('response', (response) => {
    if (response.status() >= 400) failures.httpErrors.push(`${response.status()} ${response.url()}`);
  });
  return failures;
}

export async function imageDifference(page: Page, left: Buffer, right: Buffer): Promise<number> {
  return page.evaluate(async ({ leftBase64, rightBase64 }) => {
    const decode = async (base64: string): Promise<ImageBitmap> => {
      const response = await fetch(`data:image/png;base64,${base64}`);
      return createImageBitmap(await response.blob());
    };
    const [leftImage, rightImage] = await Promise.all([decode(leftBase64), decode(rightBase64)]);
    const canvas = new OffscreenCanvas(leftImage.width, leftImage.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context || leftImage.width !== rightImage.width || leftImage.height !== rightImage.height) {
      throw new Error('Screenshot comparison requires equal decodable images.');
    }
    context.drawImage(leftImage, 0, 0);
    const leftPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    context.drawImage(rightImage, 0, 0);
    const rightPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let difference = 0;
    for (let index = 0; index < leftPixels.length; index += 4) {
      difference += Math.abs(leftPixels[index]! - rightPixels[index]!);
      difference += Math.abs(leftPixels[index + 1]! - rightPixels[index + 1]!);
      difference += Math.abs(leftPixels[index + 2]! - rightPixels[index + 2]!);
    }
    leftImage.close();
    rightImage.close();
    return difference / (canvas.width * canvas.height * 3 * 255);
  }, { leftBase64: left.toString('base64'), rightBase64: right.toString('base64') });
}

export async function pngDimensions(context: BrowserContext, png: Buffer): Promise<{ width: number; height: number }> {
  const page = await context.newPage();
  const dimensions = await page.evaluate(async (base64) => {
    const response = await fetch(`data:image/png;base64,${base64}`);
    const bitmap = await createImageBitmap(await response.blob());
    const result = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  }, png.toString('base64'));
  await page.close();
  return dimensions;
}

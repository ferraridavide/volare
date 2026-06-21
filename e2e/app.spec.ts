import { expect, test } from '@playwright/test';

const IGC = [
  'HFDTE170624',
  'HFPLTPILOTINCHARGE:Test Pilot',
  'B1000004500000N01100000EA0100001000',
  'B1000104501000N01100000EA0110001100',
  'B1000204502000N01100000EA0120001200',
].join('\n');

test('serves Cesium static assets at the configured base URL', async ({ request }) => {
  const terrainMetadata = await request.get('/cesiumStatic/Assets/approximateTerrainHeights.json');
  expect(terrainMetadata.ok()).toBe(true);
  expect(terrainMetadata.headers()['content-type']).toContain('application/json');

  const creditImage = await request.get('/cesiumStatic/Assets/Images/ion-credit.png');
  expect(creditImage.ok()).toBe(true);
  expect(creditImage.headers()['content-type']).toContain('image/png');
});

test('loads and scrubs a local flight', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Open IGC').setInputFiles({
    name: 'dolomites.igc',
    mimeType: 'text/plain',
    buffer: Buffer.from(IGC),
  });

  await expect(page.getByLabel('Flight timeline')).toBeVisible();
  const scrubber = page.getByLabel('Current flight time');
  await scrubber.evaluate((input: HTMLInputElement) => {
    input.value = '10';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(scrubber).toHaveValue('10');
  await expect(page.getByLabel('Flight statistics')).toContainText('Altitude');

  await page.getByLabel('Resolution').selectOption('4k');
  await page.getByLabel('Aspect ratio').selectOption('vertical');
  await expect(page.locator('.viewport-frame')).toHaveClass(/viewport-frame--vertical/);
  await expect(page.getByLabel('Resolution').locator('option:checked')).toContainText('2160×3840');

  await page.getByText('Track style', { exact: true }).click();
  const ghostRoute = page.getByLabel('Show ghost route');
  await expect(ghostRoute).not.toBeChecked();
  await page.getByText('Show ghost route', { exact: true }).click();
  await expect(ghostRoute).toBeChecked();
  await expect(page.getByLabel('Limit trail length')).toBeChecked();
  await page.getByLabel('Trail length value').fill('500');
  await expect(page.getByLabel('Trail length value')).toHaveValue('500');
  await page.getByLabel('Trail border value').fill('2');
  await expect(page.getByLabel('Trail border value')).toHaveValue('2');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test('encodes and inspects a short H.264 MP4 in Chromium', async ({ page }) => {
  await page.goto('/e2e/codec.html');
  await page.getByRole('button', { name: 'Encode test video' }).click();
  const result = page.locator('#result');
  await expect(result).toHaveAttribute('data-status', 'complete', { timeout: 45_000 });
  const metadata = JSON.parse((await result.textContent()) ?? '{}') as {
    width: number;
    height: number;
    duration: number;
    bytes: number;
  };
  expect(metadata.width).toBe(320);
  expect(metadata.height).toBe(180);
  expect(metadata.duration).toBeCloseTo(1, 1);
  expect(metadata.bytes).toBeGreaterThan(1000);
});

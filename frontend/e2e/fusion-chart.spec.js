import { test, expect } from '@playwright/test';
import { mockApp, visualFixture } from './fixtures.js';
for (const width of [390, 1440]) test(`Fusion TradingView switch keeps execution on the selected Fusion pair (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const state = await mockApp(page); Object.assign(state, visualFixture());
  let mutations = 0; page.on('request', r => { if (r.url().includes('/api/fusion/') && r.method() !== 'GET') mutations++; });
  if (!process.env.LIVE_TRADINGVIEW) await page.route('https://www.tradingview-widget.com/embed-widget/advanced-chart/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body>TradingView-Testchart</body></html>' }));
  await page.goto('/#fusion');
  await expect(page.getByRole('button', { name: 'TradingView', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'TradingView', exact: true }).click();
  const chart = page.locator('.fusion-tradingview iframe');
  await expect(chart).toHaveAttribute('title', 'TradingView-Chart KRAKEN:BTCEUR');
  expect(new URL(await chart.getAttribute('src')).origin).toBe('https://www.tradingview-widget.com');
  expect(new URL(await chart.getAttribute('src')).origin).not.toBe(new URL(page.url()).origin);
  await expect(page.locator('.fusion-tradingview')).toContainText('handeln weiterhin BTC-EUR');
  if (process.env.LIVE_TRADINGVIEW) {
    await expect(page.frameLocator('iframe[title^="TradingView-Chart"]').locator('body')).toContainText(/BTC|Bitcoin/, { timeout: 30000 });
    await expect(page.frameLocator('iframe[title^="TradingView-Chart"]').locator('canvas').first()).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(4000);
    await page.locator('.fusion-chart-card').screenshot({ path: `../artifacts/ui-review/fusion-tradingview-${width}.png` });
  }
  await page.getByLabel('TradingView-Symbol', { exact: true }).fill('COINBASE:BTCEUR');
  await page.getByRole('button', { name: 'Referenzmarkt anzeigen', exact: true }).click();
  await expect(chart).toHaveAttribute('title', 'TradingView-Chart COINBASE:BTCEUR');
  await expect(page.locator('.fusion-ticket')).toContainText('BTC');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Fusion-Kurs', exact: true }).click();
  await expect(chart).toHaveCount(0); await expect(page.locator('.fusion-chart')).toBeVisible();
  expect(mutations).toBe(0);
});

test('TradingView fullscreen fills the viewport and exits without changing the Fusion pair', async ({ page }) => {
  const state = await mockApp(page); Object.assign(state, visualFixture());
  await page.route('https://www.tradingview-widget.com/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body>TradingView</body></html>' }));
  await page.goto('/#fusion'); const stage = page.locator('.tradingview-stage');
  await stage.getByRole('button', { name: 'Vollbild', exact: true }).click();
  await expect(stage.getByRole('button', { name: 'Vollbild verlassen', exact: true })).toBeVisible();
  const box = await stage.boundingBox(); expect(box.x).toBeLessThanOrEqual(1); expect(box.y).toBeLessThanOrEqual(1);
  await stage.getByRole('button', { name: 'Vollbild verlassen', exact: true }).click();
  await expect(stage.getByRole('button', { name: 'Vollbild', exact: true })).toBeVisible();
  await expect(page.locator('.fusion-pair-search input')).toHaveValue('BTC-EUR');
});

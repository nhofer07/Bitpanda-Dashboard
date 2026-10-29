import { test, expect } from '@playwright/test';
import { mockApp, visualFixture } from './fixtures.js';
for (const width of [390, 1440]) test(`chart annotations survive reload and keep price/time anchors (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 }); const state = await mockApp(page); Object.assign(state, visualFixture());
  await page.route('https://www.tradingview-widget.com/**', r => r.fulfill({ contentType: 'text/html', body: '<html><body>TradingView</body></html>' }));
  let stored = { revision: 0, drawings: [] }, writes = 0;
  await page.route('**/api/chart-drawings/**', async route => {
    if (route.request().method() === 'PUT') { const next = route.request().postDataJSON(); expect(next.revision).toBe(stored.revision); stored = { revision: stored.revision + 1, drawings: next.drawings }; writes++; }
    await route.fulfill({ json: stored });
  });
  await page.goto('/#fusion'); await page.getByRole('button', { name: 'Zeichnungen · gespeichert', exact: true }).click();
  const chart = page.locator('.saved-drawing-chart'), overlay = chart.locator('.drawing-overlay');
  await expect(chart.getByRole('status')).toContainText('auf dem Server gespeichert');
  await expect(chart.locator('canvas').first()).toBeVisible();
  await chart.getByRole('button', { name: 'Kursmarke', exact: true }).click();
  await expect(overlay).toHaveAttribute('width', /[1-9]/);
  await overlay.click({ position: { x: 90, y: 150 } });
  await expect.poll(() => stored.drawings.length).toBe(1); await expect(chart.getByRole('status')).toContainText('auf dem Server gespeichert');
  const original = structuredClone(stored.drawings[0].points);
  await page.reload(); await page.getByRole('button', { name: 'Zeichnungen · gespeichert', exact: true }).click();
  await expect(chart.locator('[data-drawing-id]')).toHaveCount(1);
  expect(stored.drawings[0].points).toEqual(original); expect(writes).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await chart.screenshot({ path: `../artifacts/ui-review/saved-drawings-${width}.png` });
  await chart.locator('.drawing-list summary').click(); await chart.getByRole('button', { name: 'Entfernen', exact: true }).click();
  await expect.poll(() => stored.drawings.length).toBe(0);
});

test('a failed save retains a recoverable draft across closing and reopening the dashboard', async ({ page }) => {
  const state = await mockApp(page); Object.assign(state, visualFixture()); let offline = true, stored = { revision: 0, drawings: [] };
  await page.route('https://www.tradingview-widget.com/**', r => r.fulfill({ contentType: 'text/html', body: '<html><body>TradingView</body></html>' }));
  await page.route('**/api/chart-drawings/**', async route => {
    if (route.request().method() === 'PUT') {
      if (offline) return route.fulfill({ status: 503, json: { error: 'Speichern derzeit nicht möglich.' } });
      const next = route.request().postDataJSON(); stored = { revision: stored.revision + 1, drawings: next.drawings };
    }
    await route.fulfill({ json: stored });
  });
  await page.goto('/#fusion'); await page.getByRole('button', { name: 'Zeichnungen · gespeichert', exact: true }).click();
  const chart = page.locator('.saved-drawing-chart'); await expect(chart.getByRole('status')).toContainText('auf dem Server gespeichert');
  await chart.getByRole('button', { name: 'Kursmarke', exact: true }).click(); await chart.locator('.drawing-overlay').click({ position: { x: 90, y: 150 } });
  await expect(chart.getByRole('alert')).toContainText('Speichern derzeit nicht möglich'); expect(stored.drawings).toHaveLength(0);
  await page.reload(); await page.getByRole('button', { name: 'Zeichnungen · gespeichert', exact: true }).click();
  await expect(chart.getByRole('alert')).toContainText('Entwurf wurde wiederhergestellt'); await expect(chart.locator('[data-drawing-id]')).toHaveCount(1);
  offline = false; await chart.getByRole('button', { name: 'Erneut speichern', exact: true }).click();
  await expect(chart.getByRole('status')).toContainText('auf dem Server gespeichert'); expect(stored.drawings).toHaveLength(1);
});

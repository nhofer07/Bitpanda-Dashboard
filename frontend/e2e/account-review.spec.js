import { test, expect } from '@playwright/test';
import { mockApp, historyReviewFixture } from './fixtures.js';

for (const width of [390, 1440]) test(`64-asset history paginates without changing totals and search resets the page (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 950 });
  await mockApp(page, historyReviewFixture()); await page.goto('/#profits');
  const pagination = page.getByRole('navigation', { name: 'Asset-Seiten' });
  await expect(pagination).toContainText('1–20 von 64');
  const totals = await page.locator('#profit-summary').textContent();
  await pagination.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(pagination).toContainText('21–40 von 64');
  await expect(page.locator('#profit-summary')).toHaveText(totals);
  await pagination.getByRole('button', { name: 'Weiter', exact: true }).click();
  await pagination.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(pagination).toContainText('61–64 von 64');
  await expect(pagination.getByRole('button', { name: 'Weiter', exact: true })).toBeDisabled();
  await page.getByPlaceholder('Asset suchen...').fill('Historisches Asset 01');
  await expect(pagination).toHaveCount(0);
  const view = width < 760 ? page.locator('.mobile-profit-list') : page.locator('.profit-desktop-table');
  await expect(view).toContainText('Kostenbasis unvollständig');
  await expect(view).toContainText('Historisches Asset 01');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('held Caterpillar resolves the current asset ID and keeps available balances distinct', async ({ page }) => {
  const state = await mockApp(page, historyReviewFixture()); await page.goto('/#assets');
  const panel = page.locator('.asset-actions');
  await expect(panel.locator('.trade-balance')).toContainText('Gesamtbestand: 0,5 CAT');
  await expect(panel.locator('.trade-balance')).toContainText('Davon verfügbar: 0,5 CAT');
  await expect(panel.getByLabel('Aktion')).toHaveValue('BUY');
  await expect(panel.getByRole('button', { name: 'Bitpanda-Preis anfordern' })).toBeEnabled();
  expect(state.quotes).toBe(0); expect(state.accepted).toBe(0);
});

test('missing historical EUR values can be isolated while known costs remain in the total', async ({ page }) => {
  await mockApp(page, historyReviewFixture()); await page.goto('/#fees');
  const panel = page.locator('.account-costs-panel');
  await expect(panel).toContainText('0,0003 SOL');
  await panel.getByRole('button', { name: 'Fehlende EUR-Werte prüfen' }).click();
  await expect(panel.getByLabel('Nur fehlende EUR-Werte')).toBeChecked();
  await expect(panel.locator('details')).toHaveAttribute('open', '');
  await expect(panel.locator('details')).toContainText('Solana');
  await expect(panel.locator('details')).not.toContainText('Ethereum');
  await expect(panel.locator('tfoot:visible')).toContainText('Nicht verfügbar');
  await panel.getByLabel('Nur fehlende EUR-Werte').uncheck();
  await expect(panel.locator('details')).toContainText('Ethereum');
});

test('period list describes investment results rather than invested capital', async ({ page }) => {
  await mockApp(page, historyReviewFixture()); await page.goto('/#overview');
  await expect(page.locator('.period-result').first()).toContainText('Anlageergebnis');
  await expect(page.locator('.period-result').first()).not.toContainText('Investiert');
});

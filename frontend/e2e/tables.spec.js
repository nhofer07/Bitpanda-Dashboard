import { test, expect } from '@playwright/test';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { mockApp, visualFixture } from './fixtures.js';

const output = path.resolve('../artifacts/ui-review');
async function noSidewaysScrolling(page) {
  const overflowing = await page.evaluate(() => [...document.querySelectorAll('.adaptive-table, .table-card:has(.adaptive-table), .details-table-wrap, .tax-table-scroll, .trade-table-scroll, .assets-table-scroll, .fusion-table-wrap, .allocation-table-wrap, .calendar-trades-scroll')].filter(element => {
    const style = getComputedStyle(element);
    return element.getBoundingClientRect().width > 0 && style.visibility !== 'hidden' && element.scrollWidth > element.clientWidth + 1;
  }).map(element => ({ className: element.className, width: element.clientWidth, content: element.scrollWidth })));
  expect(overflowing).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
}
async function ready(page) { await expect(page.locator('.page-heading')).toBeVisible(); await expect.poll(() => page.locator('.app-content .loading-state').count()).toBe(0); }
async function openRecords(page) {
  await page.locator('.adaptive-record').evaluateAll(records => records.forEach(record => { record.open = true; }));
  await noSidewaysScrolling(page);
}
for (const width of [360, 390, 768, 1024, 1366, 1440]) test(`all table fields fit without horizontal scrolling at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const fixture = visualFixture();
  fixture.dashboard.accountInsights.costs = [{ id: 'cost', year: '2026', date: '2026-10-26T10:00:00Z', name: 'Sehr langer Assetname für einen Gebührenbeleg', symbol: 'BTC', label: 'Finanzierungsgebühr', category: 'leverage', amount: 3, eurAmount: 3, transactionId: 'sehr-lange-eindeutige-belegnummer-1234567890-abcdefghijklmnopqrstuvwxyz', eurSource: 'Historischer Eurobetrag aus Bitpanda-Buchungen' }];
  fixture.dashboard.accountInsights.additionalCostsEur = 3;
  await mockApp(page, fixture);
  for (const view of ['home', 'assets', 'fiat', 'profits', 'fees', 'tax', 'account', 'calendar', 'fusion']) {
    await page.goto(`/#${view}`); await ready(page); await openRecords(page);
    if (view === 'fees') {
      await page.getByText('Weitere Kostenbuchungen öffnen', { exact: false }).click();
      await page.getByText('Gebühren nach Asset · aktuelle Auswahl', { exact: true }).click();
      await openRecords(page);
      if (width === 390 || width === 1366) { await mkdir(output, { recursive: true }); await page.screenshot({ path: path.join(output, `tables-fees-${width}.png`), fullPage: true }); }
    }
    if (view === 'account') {
      for (const tab of ['Buchungsverlauf', 'Bitpanda-Abgleich']) {
        await page.getByRole('button', { name: tab, exact: true }).click(); await openRecords(page);
      }
      if (width === 390 || width === 1366) { await mkdir(output, { recursive: true }); await page.screenshot({ path: path.join(output, `tables-comparison-${width}.png`), fullPage: true }); }
    }
    if (view === 'fiat') { await page.getByRole('button', { name: 'Tabelle', exact: true }).click(); await openRecords(page); }
    if (view === 'calendar') { await page.getByRole('button', { name: 'Verkäufe · Netto' }).click(); await page.getByRole('button', { name: /^Montag, 26\. Oktober/ }).click(); await openRecords(page); }
  }
});

test('wide fee records retain every label, receipt and total behind the details control', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await mockApp(page, visualFixture()); await page.goto('/#fees'); await ready(page);
  const record = page.locator('.adaptive-record').filter({ hasText: 'sale-1' });
  await expect(record).toHaveCount(1);
  await record.locator('summary').click();
  for (const label of ['Datum', 'Asset', 'Handel', 'Handelsbetrag', 'Handelsgebühr', 'Hebel-Finanzierung', 'Gesamt', 'Anteil am Betrag', 'Quelle / Beleg']) await expect(record.getByText(label, { exact: true })).toBeVisible();
  await expect(record.getByText('Trade-ID: sale-1', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Tabellensummen').filter({ hasText: 'Summe der Auswahl' })).toContainText('6,20 €');
  await noSidewaysScrolling(page);
});

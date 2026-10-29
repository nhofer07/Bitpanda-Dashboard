import { test, expect } from '@playwright/test';

import { at, dashboard, mockApp } from './fixtures.js';

test('chart changes geometry and extrema together and remembers actual mode', async ({ page }) => {
  await mockApp(page); await page.goto('/');
  const chart = page.locator('.portfolio-value-card');
  await expect(chart.getByRole('button', { name: 'Tatsächliche Werte anzeigen' })).toHaveAttribute('aria-pressed', 'false');
  const line = await chart.locator('polyline').getAttribute('points');
  await chart.getByRole('button', { name: 'Tatsächliche Werte anzeigen' }).click();
  await expect(chart.locator('polyline')).not.toHaveAttribute('points', line);
  await expect(chart.locator('.portfolio-chart-y-labels')).toContainText('5.100,00');
  await page.reload();
  await expect(chart.getByRole('button', { name: 'Tatsächliche Werte anzeigen' })).toHaveAttribute('aria-pressed', 'true');
  await chart.getByText('Darstellung & Berechnung').click();
  await expect(chart).toContainText('Prozent-Rendite nicht verfügbar');
});

for (const width of [360, 390, 430]) test(`mobile shell and navigation fit ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await mockApp(page); await page.goto('/');
  const tabs = page.getByRole('navigation', { name: 'Mobile Navigation' });
  await expect(tabs).toBeVisible();
  await expect(page.locator('.portfolio-hero')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await tabs.getByRole('button', { name: 'Auswertungen' }).click();
  await expect(page.locator('#mobile-view')).toHaveValue('profits');
  await expect(page.locator('.mobile-page-title')).toHaveText('Gewinne & Verluste');
  await expect(page.locator('.mobile-profit-list')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await tabs.getByRole('button', { name: 'Portfolio', exact: true }).click();
  await page.locator('#mobile-view').selectOption('fiat');
  await page.getByRole('button', { name: 'Tabelle', exact: true }).click();
  await expect(page.locator('.mobile-transaction-list')).toBeVisible();
  await page.locator('.mobile-transaction-card').first().getByText('Details & Zuordnung').click();
  await page.locator('.mobile-transaction-card').first().getByLabel('Zuordnung').selectOption('refund');
  await expect(page.getByText('Cashflow-Zuordnung gespeichert.', { exact: true })).toBeVisible();
  await tabs.getByRole('button', { name: 'Portfolio', exact: true }).click();
  await expect(page.locator('.mobile-asset-table:visible')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const tabBox = await tabs.boundingBox();
  expect(Math.round(tabBox.y + tabBox.height)).toBe(844);
  if (width === 390) { await page.goto('/#home'); await expect(page.locator('.portfolio-hero')).toBeVisible(); await page.screenshot({ path: '/tmp/bitpanda-mobile.png', fullPage: true }); }
});

test('background refresh failure retains data and exposes a stale status', async ({ page }) => {
  const state = await mockApp(page); await page.goto('/');
  await expect(page.locator('.portfolio-balance h2')).toContainText('4.150,00');
  state.failDashboard = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.data-freshness')).toContainText('Aktualisierung fehlgeschlagen');
  await expect(page.locator('.portfolio-balance h2')).toContainText('4.150,00');
  state.failDashboard = false;
  await page.getByRole('button', { name: 'Erneut laden' }).click();
  await expect(page.locator('.data-freshness')).toContainText('Daten aktuell');
});

test('quote refreshes account, distinguishes reserved funds and disables execution after expiry', async ({ page }) => {
  const state = await mockApp(page); await page.goto('/#assets');
  const panel = page.locator('.asset-actions');
  await expect(panel.locator('.trade-balance')).toContainText('Gesamtbestand: 0,1');
  await expect(panel.locator('.trade-balance')).toContainText('Davon verfügbar: 0,05');
  await expect(panel.locator('.cash-availability-card > strong')).toHaveText('Nicht verfügbar');
  await expect(panel.locator('.cash-availability-card')).not.toContainText('Falls dein Geld');
  const reads = state.accountReads;
  await panel.getByLabel('Stückzahl', { exact: true }).fill('0.001');
  await panel.getByRole('button', { name: 'Bitpanda-Preis anfordern' }).click();
  await expect(panel.locator('.quote-countdown')).toContainText('Sekunden gültig');
  expect(state.accountReads).toBeGreaterThan(reads);
  await page.clock.fastForward(31_000);
  await expect(panel.getByRole('button', { name: 'Jetzt verbindlich kaufen' })).toBeDisabled();
  expect(state.accepted).toBe(0);
});

test('desktop grouping and browser back navigation work', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await mockApp(page); await page.goto('/');
  await page.getByRole('navigation', { name: 'Hauptbereiche' }).getByRole('button', { name: 'Auswertungen' }).click();
  await page.getByRole('navigation', { name: 'Unterseiten Auswertungen', exact: true }).getByRole('button', { name: 'Steuern' }).click();
  await expect(page.locator('.desktop-page-title h1')).toHaveText('Steuern');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Gewinne & Verluste', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});


test('an older response cannot undo a newer dashboard on screen', async ({ page }) => {
  await mockApp(page); await page.goto('/');
  await expect(page.locator('.portfolio-balance h2')).toContainText('4.150,00');
  const pending = [];
  await page.route('**/api/dashboard-data*', route => { pending.push(route); });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => pending.length).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => pending.length).toBe(2);
  await pending[1].fulfill({ json: { ...dashboard, loadedAt: '2026-10-26T12:01:00Z', portfolio: { ...dashboard.portfolio, totalValue: 5000 } } });
  await expect(page.locator('.portfolio-balance h2')).toContainText('5.000,00');
  await pending[0].fulfill({ json: dashboard });
  await expect(page.locator('.portfolio-balance h2')).toContainText('5.000,00');
});

for (const width of [390, 1440]) test(`Assets opens at the top and only explicit position links jump to the chart (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockApp(page); await page.goto('/');
  await page.getByRole('button', { name: 'Chart für Bitcoin öffnen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('asset-market-chart');
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(100);
  if (width < 760) {
    const tabs = page.getByRole('navigation', { name: 'Mobile Navigation' });
    await tabs.getByRole('button', { name: 'Portfolio', exact: true }).click();
    await tabs.getByRole('button', { name: 'Cockpit', exact: true }).click();
    await tabs.getByRole('button', { name: 'Portfolio', exact: true }).click();
  } else {
    await page.getByRole('navigation', { name: 'Hauptbereiche' }).getByRole('button', { name: 'Cockpit', exact: true }).click();
    await page.getByRole('navigation', { name: 'Hauptbereiche' }).getByRole('button', { name: 'Portfolio', exact: true }).click();
  }
  await expect(page.locator('.assets-view')).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.reload();
  await expect(page.locator('.assets-view')).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
});

test('cockpit positions stay compact and reveal details independently', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { visualFixture } = await import('./fixtures.js');
  await mockApp(page, visualFixture()); await page.goto('/#home');
  const section = page.locator('#open-positions');
  const cards = section.locator('.position-card');
  await expect(cards).toHaveCount(3);
  const before = await cards.evaluateAll(items => items.map(item => ({ x: item.getBoundingClientRect().x, height: item.getBoundingClientRect().height, width: item.getBoundingClientRect().width })));
  expect(new Set(before.map(item => item.x)).size).toBe(3);
  expect(before.every(item => item.height < 460 && item.width < 450)).toBe(true);
  await cards.first().locator('summary').click();
  await expect(cards.first().getByText('Positionsart', { exact: true })).toBeVisible();
  const otherHeight = await cards.nth(1).evaluate(item => item.getBoundingClientRect().height);
  expect(Math.abs(otherHeight - before[1].height)).toBeLessThan(1);
  await section.getByRole('button', { name: 'ETFs 1', exact: true }).click();
  await expect(cards).toHaveCount(1);
  expect((await cards.first().boundingBox()).width).toBeLessThan(450);
});

for (const width of [390, 1440]) test(`section shortcuts preserve route and move focus (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await mockApp(page); await page.goto('/#assets');
  const nav = page.getByRole('navigation', { name: 'Bereiche für Bitcoin' });
  await nav.getByRole('button', { name: 'Deine Position' }).click();
  await expect(page.locator('#asset-position')).toBeFocused();
  await expect(page).toHaveURL(/#assets$/);
  await nav.getByRole('button', { name: 'Kaufen & verkaufen' }).click();
  await expect(page.locator('#asset-trading')).toBeFocused();
  await expect(page).toHaveURL(/#assets$/);
  await page.goto('/#profits');
  await page.getByRole('navigation', { name: 'Bereiche der Gewinnauswertung' }).getByRole('button', { name: 'Alle Assets' }).click();
  await expect(page.locator('#profit-assets')).toBeFocused();
  await expect(page).toHaveURL(/#profits$/);
});

for(const width of [390,1440]) test(`cash stays last in every allocation view even when it dominates (${width}px)`,async ({page})=>{
  await page.setViewportSize({width,height:1000});
  const state=await mockApp(page);
  state.dashboard.portfolio.liquidBalance={totalValue:90000,fiatValue:90000,cashPlusValue:0};
  await page.goto('/');
  const allocation=page.locator('.allocation-card');
  await expect(allocation.locator('.allocation-table tbody tr').last()).toContainText('Cash');
  await expect(allocation.locator('.allocation-mobile-card').last()).toContainText('Cash');
  await expect(allocation.locator('.allocation-legend').locator('button, div').last()).toContainText('Cash');
});

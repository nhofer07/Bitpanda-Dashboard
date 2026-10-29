import { test, expect } from '@playwright/test'; import { mockApp, visualFixture } from './fixtures.js';
test('Fusion shows four decimals and estimated sale percentage without crypto withholding', async ({ page }) => {
  const state = await mockApp(page); Object.assign(state, visualFixture());
  state.dashboard.openPositions.find(p => p.assetKey === 'BTC').historicalAcquisitionCost = 2500;
  state.dashboard.openPositions.find(p => p.assetKey === 'BTC').remainingFeeCostBasis = 0;
  await page.route('https://www.tradingview-widget.com/**', r => r.fulfill({ contentType: 'text/html', body: '<html><body>TradingView</body></html>' }));
  await page.goto('/#fusion');
  await expect(page.getByRole('button', { name: 'TradingView', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.fusion-market-stats')).toContainText('30.450,0000');
  const ticket = page.locator('.fusion-ticket'); await ticket.getByLabel('Richtung').selectOption('sell'); await ticket.getByLabel('Angabe').selectOption('quantity'); await ticket.getByLabel('Wert', { exact: true }).fill('0.01');
  await expect(ticket.locator('.sale-profit-percent')).toContainText('+19,70 %');
  await expect(ticket.locator('.sale-profit-preview')).toContainText('KESt-Abzug in dieser Vorschau · deaktiviert');
  await ticket.screenshot({ path: '../artifacts/ui-review/fusion-sale-preview.png' });
});

test('asset sale shows percentage after acquisition fees, sale fees and estimated securities tax', async ({ page }) => {
  const state = await mockApp(page); const position = { assetKey: 'MSFT', name: 'Microsoft', displayName: 'Microsoft', category: 'stock', currentQuantity: 10, currentPrice: 120, currentValue: 1200, costBasis: 1000, remainingFeeCostBasis: 10, historicalAcquisitionCost: 1010 };
  state.dashboard.openPositions = [position]; state.dashboard.profitLoss.assets = [position];
  await page.route('**/api/public-account*', r => r.fulfill({ json: { resources: { assets: { ok: true, data: [{ id: 'msft', symbol: 'MSFT', buy_active: true, sell_active: true }] }, currencies: { ok: true, data: [{ id: 'eur', symbol: 'EUR' }] }, portfolio: { ok: true, data: [{ asset_id: 'msft', balance: '10', available_balance: '10' }] } } } }));
  await page.route('**/api/trading/quotes', r => r.fulfill({ json: { quote_id: 'stock-test', quote: { quantity: '5', price: '120', price_with_fee: '119', fee: '5', notional: '595', expires_at: '2026-10-26T12:00:30Z' } } }));
  await page.goto('/#assets'); const actions = page.locator('.asset-actions');
  await actions.getByLabel('Aktion', { exact: true }).selectOption('SELL'); await actions.getByLabel('Stückzahl', { exact: true }).fill('5');
  await actions.getByRole('button', { name: 'Bitpanda-Preis anfordern', exact: true }).click();
  await expect(actions.locator('.sale-profit-percent')).toHaveText('+12,38 %');
  await expect(actions.locator('.sale-profit-preview')).toContainText('62,50 €');
});

test('typing a hypothetical exit price never submits a Fusion order', async ({ page }) => {
  const state = await mockApp(page); Object.assign(state, visualFixture()); let orders = 0;
  page.on('request', r => { if (r.url().includes('/api/fusion/orders') && r.method() === 'POST') orders++; });
  await page.route('https://www.tradingview-widget.com/**', r => r.fulfill({ contentType: 'text/html', body: '<html><body>TradingView</body></html>' }));
  await page.goto('/#fusion'); const ticket = page.locator('.fusion-ticket');
  await ticket.getByLabel('Wert', { exact: true }).fill('300'); await ticket.getByLabel('Geplanter Verkaufskurs', { exact: true }).fill('35000');
  await ticket.getByLabel('Geplanter Verkaufskurs', { exact: true }).press('Enter');
  await expect(ticket.locator('.sale-profit-percent')).toBeVisible(); expect(orders).toBe(0);
});

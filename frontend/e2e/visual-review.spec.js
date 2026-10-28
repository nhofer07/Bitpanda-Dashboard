import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { mockApp, visualFixture, at } from './fixtures.js';
import { NAVIGATION_GROUPS, viewTitle, navigationGroup } from '../src/components/navigationItems.js';

const output = path.resolve('../artifacts/ui-review');
const views = NAVIGATION_GROUPS.flatMap(group => group.items.map(item => item.id)).concat('settings');
async function ready(page) {
  await expect(page.locator('.page-heading')).toBeVisible();
  await expect.poll(() => page.locator('.app-content .loading-state').count()).toBe(0);
  await page.evaluate(() => document.fonts.ready);
}
async function capture(page, name) { await mkdir(output, { recursive: true }); await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' }); }
async function noOverflow(page) {
  const width = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
  expect(width.page, JSON.stringify(width)).toBeLessThanOrEqual(width.viewport);
}
async function sectionSpacing(page, name) {
  const report = await page.locator('.app-content, .app-content > div').evaluateAll(containers => containers.flatMap(container => {
    if (container.matches('.view-panel, .toolbar, .page-heading')) return [];
    const style = getComputedStyle(container);
    if (!container.matches('.app-content') && !(style.display === 'flex' && style.flexDirection === 'column')) return [];
    const sections = [...container.children].filter(element => {
      const rect = element.getBoundingClientRect(), css = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && !['absolute', 'fixed'].includes(css.position);
    });
    const expected = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-gap'));
    return sections.slice(1).map((section, index) => ({
      container: container.className,
      before: sections[index].className,
      after: section.className,
      gap: section.getBoundingClientRect().top - sections[index].getBoundingClientRect().bottom,
      expected
    }));
  }));
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, `${name}-spacing.json`), JSON.stringify(report, null, 2));
  for (const entry of report) expect(Math.abs(entry.gap - entry.expected), JSON.stringify(entry)).toBeLessThanOrEqual(1);
}

for (const size of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
  for (const view of views) test(`visual ${size.name} ${view}`, async ({ page }) => {
    await page.setViewportSize(size); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const state = await mockApp(page, visualFixture());
    await page.goto(`/#${view}`); await ready(page);
    await expect(page.locator(size.name === 'mobile' ? '.mobile-page-title' : '.desktop-page-title h1')).toHaveText(viewTitle(view));
    const group = navigationGroup(view);
    if (group) {
      const nav = page.getByRole('navigation', { name: size.name === 'mobile' ? 'Mobile Navigation' : 'Hauptbereiche' });
      const active = nav.getByRole('button', { name: group.label, exact: true });
      await expect(active).toHaveAttribute('aria-current', 'true');
      const contrast = await active.evaluate(button => {
        const luminance = color => {
          const values = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => { const channel = value / 255; return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4; });
          return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
        };
        const foreground = luminance(getComputedStyle(button.querySelector('span')).color);
        const background = luminance(getComputedStyle(button).backgroundColor);
        return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
      });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
      if (size.name === 'mobile' && group.items.length > 1) await expect(page.locator('#mobile-view')).toHaveValue(view);
    }
    await noOverflow(page);
    await sectionSpacing(page, `${size.name}-${view}`);
    expect(errors).toEqual([]);
    expect(await page.locator('body').innerText()).not.toMatch(/NaN|undefined|Invalid Date/);
    await capture(page, `${size.name}-${view}`);
    if (view === 'fiat') {
      await page.getByRole('button', { name: 'Tabelle', exact: true }).click();
      await noOverflow(page);
      await capture(page, `${size.name}-fiat-table`);
    }
    if (view === 'home') await page.screenshot({ path: path.join(output, `${size.name}-cockpit-viewport.png`), animations: 'disabled' });
    expect(state.accepted).toBe(0);
  });
}

for (const size of [{ name: 'tablet', width: 768, height: 1024 }, { name: 'small', width: 360, height: 800 }, { name: 'large-phone', width: 430, height: 932 }]) {
  test(`layout boundary ${size.name}`, async ({ page }) => {
    await page.setViewportSize(size); await mockApp(page, visualFixture());
    for (const view of ['home', 'assets', 'profits', 'calendar', 'calculator', 'market', 'fusion', 'settings']) {
      await page.goto(`/#${view}`); await ready(page); await noOverflow(page); await sectionSpacing(page, `${size.name}-${view}`);
      if (view === 'home' || view === 'calendar') await capture(page, `${size.name}-${view}`);
    }
  });
}

test('all four mobile tabs open defaults and subpages remain reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await mockApp(page, visualFixture()); await page.goto('/');
  const tabs = page.getByRole('navigation', { name: 'Mobile Navigation' });
  for (const group of NAVIGATION_GROUPS) {
    await tabs.getByRole('button', { name: group.label, exact: true }).click();
    await expect(page.locator('.mobile-page-title')).toHaveText(group.items[0].label);
    for (const item of group.items) {
      if (group.items.length > 1) await page.locator('#mobile-view').selectOption(item.id);
      await expect(page.locator('.mobile-page-title')).toHaveText(item.label); await ready(page);
    }
    await tabs.getByRole('button', { name: group.label, exact: true }).click();
    await expect(page.locator('.mobile-page-title')).toHaveText(group.items[0].label);
  }
});

test('empty, missing, stale, failed and loading data have visible honest states', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = visualFixture();
  fixture.dashboard.openPositions = []; fixture.dashboard.profitLoss.assets = []; fixture.dashboard.transactions = []; fixture.dashboard.snapshots = [];
  fixture.dashboard.portfolio = { totalValue: 0, investedValue: 0, unrealizedProfit: null, dividends: null, openPositionCount: 0, liquidBalance: { totalValue: 0, fiatValue: 0, cashPlusValue: 0 } };
  const state = await mockApp(page, fixture); await page.goto('/#home'); await ready(page);
  await expect(page.locator('.portfolio-balance h2')).toHaveText('0,00 €');
  await expect(page.locator('.portfolio-stats').getByText('Nicht verfügbar', { exact: true })).toHaveCount(2);
  await capture(page, 'state-empty-missing');
  state.dashboard.loadedAt = '2026-10-26T11:00:00Z';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  // Reload starts a fresh request tracker so this intentionally old fixture is accepted.
  await page.reload(); await ready(page);
  await expect(page.locator('.data-freshness')).toContainText('Veralteter Datenstand');
  await capture(page, 'state-stale');
  state.failDashboard = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.data-freshness')).toContainText('Aktualisierung fehlgeschlagen');
  await expect(page.locator('.portfolio-balance h2')).toHaveText('0,00 €');
  await capture(page, 'state-refresh-error');
  await page.reload(); await expect(page.locator('.error-box')).toContainText('Verbindung unterbrochen');
  await capture(page, 'state-initial-error');
  state.failDashboard = false;
  let pending;
  await page.route('**/api/dashboard-data*', route => { pending = route; });
  await page.reload();
  await expect(page.locator('.app-content .loading-state')).toBeVisible();
  await capture(page, 'state-loading');
  await expect.poll(() => Boolean(pending)).toBe(true); await pending.fulfill({ json: state.dashboard });
});

test('large amounts and long asset names remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const fixture = visualFixture(); fixture.dashboard.portfolio.totalValue = 12345678.9;
  fixture.dashboard.openPositions[0].displayName = 'Sehr langer internationaler Unternehmensname mit mehreren Bestandteilen';
  fixture.dashboard.openPositions[0].currentValue = 1234567.89;
  await mockApp(page, fixture); await page.goto('/#home'); await ready(page); await noOverflow(page);
  await capture(page, 'state-large-amounts');
  await page.goto('/#assets'); await ready(page); await noOverflow(page);
  await capture(page, 'state-long-name');
});

test('help, keyboard focus and view selection are operable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await mockApp(page, visualFixture()); await page.goto('/#calendar'); await ready(page);
  await page.getByRole('button', { name: 'Erklärung zur aktuellen Seite öffnen' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Verstanden' })).toBeInViewport();
  await page.screenshot({ path: path.join(output, 'state-help.png'), animations: 'disabled' });
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Erklärung zur aktuellen Seite öffnen' })).toBeFocused();
  await page.getByRole('navigation', { name: 'Mobile Navigation' }).getByRole('button', { name: 'Auswertungen', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.mobile-page-title')).toHaveText('Gewinne & Verluste');
  await page.locator('#mobile-view').selectOption('fees');
  await expect(page.locator('.mobile-page-title')).toHaveText('Gebühren');
});

test('quote review and Earn remain accessible without executing a transaction', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = visualFixture();
  fixture.responses['/api/public-account'] = { resources: {
    assets: { ok: true, data: [{ id: 'btc', symbol: 'BTC', buy_active: true, sell_active: true }] },
    currencies: { ok: true, data: [{ id: 'eur', symbol: 'EUR' }] },
    portfolio: { ok: true, data: [{ asset_id: 'btc', balance: '.1', available_balance: '.05' }, { currency_id: 'eur', balance: '1540.78', available_balance: '1500' }] },
    earnConfigs: { ok: true, data: [{ id: 'earn-btc', asset_id: 'btc', enabled: true, soldout: false, annual_percentage_rate: 3.2, mode: 'staking' }] },
    operations: { ok: true, data: [{ transactions: [{ asset_id: 'btc', wallet_id: 'wallet-btc' }] }] }
  } };
  const state = await mockApp(page, fixture); await page.goto('/#assets'); await ready(page);
  const panel = page.locator('.asset-actions');
  await expect(panel.getByRole('heading', { name: 'BTC zu Earn hinzufügen' })).toBeVisible();
  await expect(panel.getByLabel('Wallet', { exact: true })).toHaveValue('');
  await panel.getByLabel('Stückzahl', { exact: true }).fill('0.001');
  await panel.getByRole('button', { name: 'Bitpanda-Preis anfordern' }).click();
  await expect(panel.getByRole('heading', { name: 'Kauf prüfen · BTC' })).toBeVisible();
  await panel.screenshot({ path: path.join(output, 'state-quote-earn.png'), animations: 'disabled' });
  await page.clock.fastForward(31_000);
  await expect(panel.getByRole('button', { name: 'Jetzt verbindlich kaufen' })).toBeDisabled();
  await panel.screenshot({ path: path.join(output, 'state-expired-quote.png'), animations: 'disabled' });
  expect(state.accepted).toBe(0);
});

test('calendar details, account tabs, calculator and market analysis expose their content', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); const state = await mockApp(page, visualFixture());
  await page.goto('/#calendar'); await ready(page);
  await page.getByRole('button', { name: /^Montag, 26\. Oktober/ }).click();
  await expect(page.locator('.calendar-details')).toBeVisible();
  await capture(page, 'state-calendar-detail');
  await page.goto('/#account'); await ready(page);
  for (const tab of ['Buchungsverlauf', 'Sonderereignisse', 'Bitpanda-Abgleich']) {
    await page.getByRole('button', { name: tab, exact: true }).click(); await noOverflow(page);
  }
  await expect(page.getByRole('heading', { name: 'Bitpanda-Werte und Dashboard im Vergleich' })).toBeVisible();
  await capture(page, 'state-account-comparison');
  await page.goto('/#calculator'); await ready(page);
  await page.locator('.asset-search-item').filter({ hasText: 'Bitcoin' }).click();
  await page.getByLabel('Investitionsbetrag (€)', { exact: true }).fill('100');
  await expect(page.getByLabel('Anteile', { exact: true })).not.toHaveValue('');
  await noOverflow(page); await capture(page, 'state-calculator-filled');
  await page.goto('/#market'); await ready(page);
  await page.locator('.watch-card-main').filter({ hasText: 'Bitcoin' }).click();
  await expect(page.getByRole('heading', { name: 'Regelbasierte Analyse' })).toBeVisible();
  await noOverflow(page); await capture(page, 'state-market-analysis');
  expect(state.accepted).toBe(0);
});

test('mobile control hit areas meet the design target', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 }); await mockApp(page, visualFixture());
  for (const view of ['home', 'assets', 'calendar', 'calculator', 'settings']) {
    await page.goto(`/#${view}`); await ready(page);
    const small = await page.locator('button').evaluateAll(buttons => buttons.filter(button => {
      const rect = button.getBoundingClientRect(); const style = getComputedStyle(button);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && (rect.width < 43.5 || rect.height < 43.5);
    }).map(button => ({ label: button.getAttribute('aria-label') || button.textContent.trim(), width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
    expect(small, view).toEqual([]);
  }
});


test('asset search and chart keyboard controls remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await mockApp(page, visualFixture());
  await page.goto('/#home'); await ready(page);
  const slider = page.getByRole('slider', { name: 'Datenpunkt im Portfolioverlauf ansehen' });
  const last = await slider.inputValue();
  await slider.focus(); await page.keyboard.press('ArrowLeft');
  await expect(slider).not.toHaveValue(last);
  await page.getByRole('navigation', { name: 'Mobile Navigation' }).getByRole('button', { name: 'Portfolio', exact: true }).click();
  await page.getByRole('textbox', { name: 'Alle Assets durchsuchen' }).fill('Bitcoin');
  await expect(page.locator('.asset-search-result')).toBeVisible();
  await page.locator('.asset-search-result').click();
  await expect(page.locator('#asset-market-chart')).toBeVisible();
});

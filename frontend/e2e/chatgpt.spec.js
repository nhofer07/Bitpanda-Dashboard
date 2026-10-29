import { test, expect } from '@playwright/test';
import { mockApp } from './fixtures.js';

test('Free mode offers copying but never starts direct inference', async ({ page }) => {
  await mockApp(page);
  let requests = 0;
  await page.route('**/api/chatgpt/**', async route => {
    if (route.request().url().endsWith('/analysis')) requests++;
    await route.fulfill({ json: { connected: false, eligible: false, accounts: [] } });
  });
  await page.goto('/#assets');
  const panel = page.locator('.ai-analysis');
  await expect(panel.getByRole('button', { name: 'Mit ChatGPT analysieren' })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Analyse für ChatGPT kopieren' })).toBeEnabled();
  expect(requests).toBe(0);
});
test('explicit analysis sends only identity and preferences; safely renders model text', async ({ page }) => {
  await mockApp(page); let received;
  await page.route('**/api/chatgpt/**', async route => {
    const url = route.request().url();
    let json = { eligible: true, connected: true, accounts: [] };
    if (url.endsWith('/models')) json = { models: [{ id: 'test-model', name: 'Testmodell' }] };
    if (url.endsWith('/analysis')) { received = route.request().postDataJSON(); json = { text: '## Einschätzung\nAbwarten. Daten fehlen.\n\n[Quelle](https://example.org)\n<script>alert(1)</script>', model: 'Testmodell', updatedAt: '2026-10-29T12:00:00Z' }; }
    await route.fulfill({ json });
  });
  await page.goto('/#assets'); const panel = page.locator('.ai-analysis');
  await expect(panel.getByRole('button', { name: 'Mit ChatGPT analysieren' })).toBeEnabled();
  expect(received).toBeUndefined();
  await expect(panel.getByLabel('Trade- / Anlagehorizont')).toHaveValue('2–4 Wochen');
  await panel.getByLabel('Trade- / Anlagehorizont').selectOption('1–2 Wochen');
  await panel.getByRole('button', { name: 'Mit ChatGPT analysieren' }).click();
  await expect(panel.getByRole('heading', { name: 'Einschätzung' })).toBeVisible();
  expect(received.horizon).toBe('1–2 Wochen');
  expect(Object.keys(received).sort()).toEqual(['category', 'horizon', 'model', 'name', 'question', 'risk', 'symbol'].sort());
  await expect(panel.locator('.ai-result script')).toHaveCount(0);
  await expect(panel.getByRole('link', { name: 'Quelle' })).toHaveAttribute('rel', 'noreferrer');
  await panel.screenshot({ path: '../artifacts/ui-review/chatgpt-analysis.png' });
});
test('settings require cost acknowledgement and display failed server revocation', async ({ page }) => {
  await mockApp(page); let disconnected = false;
  await page.route('**/api/chatgpt/**', async route => {
    if (route.request().url().endsWith('/disconnect')) { disconnected = true; return route.fulfill({ json: { revoked: false } }); }
    await route.fulfill({ json: { connected: !disconnected, eligible: !disconnected, email: 'user@example.test', accounts: [{ id: 'registered-client', email: 'user@example.test', active: true, connected: !disconnected }] } });
  });
  await page.goto('/#settings'); const card = page.locator('.chatgpt-card');
  await expect(card.getByRole('button', { name: 'Continue with ChatGPT' })).toBeDisabled();
  await card.getByRole('checkbox').check();
  await expect(card.getByRole('button', { name: 'Continue with ChatGPT' })).toBeEnabled();
  await card.screenshot({ path: '../artifacts/ui-review/chatgpt-settings.png' });
  await card.getByRole('button', { name: 'Verbindung trennen' }).click();
  await expect(card.getByRole('alert')).toContainText('nicht widerrufen');
});
test('mobile analysis has no horizontal overflow and quota does not show partial result', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 }); await mockApp(page);
  await page.route('**/api/chatgpt/**', async route => {
    const url = route.request().url();
    if (url.endsWith('/analysis')) return route.fulfill({ status: 400, json: { error: 'Kontingent ausgeschöpft. Es wird keine kostenpflichtige API verwendet.' } });
    await route.fulfill({ json: url.endsWith('/models') ? { models: [{ id: 'test', name: 'Test' }] } : { eligible: true } });
  });
  await page.goto('/#assets'); const panel = page.locator('.ai-analysis'); await panel.getByRole('button', { name: 'Mit ChatGPT analysieren' }).click();
  await expect(panel.getByRole('status')).toContainText('Kontingent ausgeschöpft');
  await expect(panel.locator('.ai-result')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel.screenshot({ path: '../artifacts/ui-review/chatgpt-mobile.png' });
});

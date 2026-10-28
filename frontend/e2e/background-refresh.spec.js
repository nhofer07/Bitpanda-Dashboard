import { test, expect } from '@playwright/test';
import { at, mockApp } from './fixtures.js';

test('hidden dashboard loads and refreshes balances, portfolio and market charts without focus', async ({page}) => {
  await page.addInitScript(() => {
    window.testVisibility='hidden';
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.testVisibility});
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.testVisibility==='hidden'});
  });
  const state=await mockApp(page);
  const requests={dashboard:[],portfolio:[],market:[]};
  page.on('request',request=>{
    const url=new URL(request.url());
    if(url.pathname==='/api/dashboard-data')requests.dashboard.push(url.href);
    if(url.pathname==='/api/portfolio-history')requests.portfolio.push(url.href);
    if(url.pathname==='/api/market/history')requests.market.push(url.href);
  });
  let chartValue=4150;
  await page.route('**/api/portfolio-history*',route=>route.fulfill({json:{available:true,timeframe:'DAY',currency:'EUR',snapshots:[{createdAt:at(10),totalValue:4000},{createdAt:at(11),totalValue:chartValue}],loadedAt:at(12),firstPointAt:at(10),lastPointAt:at(11)}}));
  await page.goto('/');
  await expect(page.locator('.portfolio-balance h2')).toContainText('4.150,00');
  await expect(page.locator('.portfolio-value-card .chart-context .data-quality')).toHaveText('Bitpanda');
  await expect.poll(()=>requests.market.length).toBeGreaterThan(0);
  const before={dashboard:requests.dashboard.length,portfolio:requests.portfolio.length,market:requests.market.length};
  chartValue=4250;
  state.dashboard={...state.dashboard,loadedAt:'2026-10-26T12:01:00Z',portfolio:{...state.dashboard.portfolio,totalValue:4250}};
  await page.clock.fastForward(61_000);
  await expect.poll(()=>requests.dashboard.length).toBeGreaterThan(before.dashboard);
  await expect.poll(()=>requests.portfolio.length).toBeGreaterThan(before.portfolio);
  await expect(page.locator('.portfolio-balance h2')).toContainText('4.250,00');
  await expect(page.locator('.portfolio-chart-selection strong')).toHaveText('4.250,00 €');
  expect(requests.dashboard.at(-1)).toContain('refresh=1');
  await page.clock.fastForward(121_000);
  await expect.poll(()=>requests.market.length).toBeGreaterThan(before.market);
  expect(await page.evaluate(()=>document.visibilityState)).toBe('hidden');

  // A failed background fetch retains the last good values.
  state.failDashboard=true;
  await page.clock.fastForward(61_000);
  await expect(page.locator('.data-freshness')).toContainText('Aktualisierung fehlgeschlagen');
  await expect(page.locator('.portfolio-balance h2')).toContainText('4.250,00');
  state.failDashboard=false;
  state.dashboard={...state.dashboard,loadedAt:'2026-10-26T12:04:00Z',portfolio:{...state.dashboard.portfolio,totalValue:4350}};
  const resume= requests.dashboard.length;
  await page.evaluate(()=>{window.testVisibility='visible';document.dispatchEvent(new Event('visibilitychange'));});
  await expect.poll(()=>requests.dashboard.length).toBeGreaterThan(resume);
  await expect(page.locator('.portfolio-balance h2')).toContainText('4.350,00');
  await expect(page.locator('.data-freshness')).toContainText('Daten aktuell');
  expect(requests.dashboard.at(-1)).toContain('refresh=1');
});

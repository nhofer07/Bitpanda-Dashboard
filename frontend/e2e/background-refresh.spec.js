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

test('server notifications update a hidden dashboard while page timers are paused', async ({page}) => {
  await page.addInitScript(()=>{
    window.testVisibility='hidden';
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.testVisibility});
    window.testStreams=[];
    window.EventSource=class extends EventTarget {
      constructor(url){super();this.url=url;window.testStreams.push(this);}
      close(){this.closed=true;}
    };
  });
  const state=await mockApp(page);
  await page.goto('/');
  await expect(page.locator('.portfolio-balance h2')).toContainText('4.150,00');
  await expect.poll(()=>page.evaluate(()=>window.testStreams.filter(s=>!s.closed).length)).toBe(1);
  await page.evaluate(()=>window.testStreams.filter(s=>!s.closed).forEach(s=>s.dispatchEvent(new MessageEvent('refreshing',{data:'{}'}))));
  await expect(page.locator('.data-freshness')).toContainText('Aktualisiere …');
  // No clock advancement and no focus/visibility event: only the stream wakes it.
  state.dashboard={...state.dashboard,portfolio:{...state.dashboard.portfolio,totalValue:5000}};
  await page.evaluate(()=>window.testStreams.filter(s=>!s.closed).forEach(s=>s.dispatchEvent(new MessageEvent('dashboard',{data:'{}'}))));
  await expect(page.locator('.portfolio-balance h2')).toContainText('5.000,00');
  expect(await page.evaluate(()=>document.visibilityState)).toBe('hidden');
  // Reopening a stream catches up even if an event was missed during suspension.
  state.dashboard={...state.dashboard,portfolio:{...state.dashboard.portfolio,totalValue:5100}};
  await page.evaluate(()=>window.testStreams.filter(s=>!s.closed).forEach(s=>s.dispatchEvent(new MessageEvent('ready',{data:'{}'}))));
  await expect(page.locator('.portfolio-balance h2')).toContainText('5.100,00');
});

test('the freshness indicator immediately marks a two-minute-old timestamp stale on return',async ({page})=>{
  const state=await mockApp(page);await page.goto('/');
  await expect(page.locator('.data-freshness')).toContainText('Daten aktuell');
  await page.route('**/api/dashboard-data*',route=>route.fulfill({json:state.dashboard}));
  await page.clock.fastForward(120_000);
  await page.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));});
  await expect(page.locator('.data-freshness')).toContainText('Veralteter Datenstand');
  await expect(page.locator('.data-freshness')).toHaveClass(/is-stale/);
});

test('automatic refresh starts at the next full minute and does not relabel old data while waiting',async ({page})=>{
  await mockApp(page);await page.goto('/');
  await expect(page.locator('.data-freshness')).toContainText('Daten aktuell');
  await page.clock.pauseAt(new Date('2026-10-26T12:00:10Z'));
  const pending=[];
  await page.route('**/api/dashboard-data*',route=>{pending.push(route);});
  await page.clock.runFor(49_999);
  expect(pending.length).toBe(0);
  await page.clock.runFor(1);
  await expect.poll(()=>pending.length).toBe(1);
  await expect(page.locator('.data-freshness')).toContainText('Aktualisiere …');
  await expect(page.locator('.data-freshness time')).toHaveAttribute('datetime',at(12));
  const {dashboard}=await import('./fixtures.js');
  await pending[0].fulfill({json:{...dashboard,loadedAt:'2026-10-26T12:01:00Z'}});
  await expect(page.locator('.data-freshness time')).toHaveAttribute('datetime','2026-10-26T12:01:00Z');
  await expect(page.locator('.data-freshness')).toContainText('Daten aktuell');
});

test('initial cached data is visible during rebuilding and transactions are not fetched twice',async({page})=>{
 await page.addInitScript(()=>{
  window.testStreams=[];
  window.EventSource=class extends EventTarget{constructor(){super();window.testStreams.push(this);}close(){this.closed=true;}};
 });
 const state=await mockApp(page);let transactions=0;
 page.on('request',request=>{if(new URL(request.url()).pathname==='/api/transactions')transactions++;});
 state.dashboard={...state.dashboard,loadedAt:'2026-10-26T11:58:00Z',cache:{status:'stale',updating:true}};
 await page.goto('/');
 await expect(page.locator('.portfolio-balance h2')).toContainText('4.150,00');
 await expect(page.locator('.data-freshness')).toContainText('Aktualisiere …');
 await expect(page.locator('.data-freshness time')).toHaveAttribute('datetime','2026-10-26T11:58:00Z');
 expect(transactions).toBe(0);
 state.dashboard={...state.dashboard,loadedAt:at(12),cache:{status:'refresh'},portfolio:{...state.dashboard.portfolio,totalValue:5000}};
 await page.evaluate(()=>window.testStreams.filter(s=>!s.closed).forEach(s=>s.dispatchEvent(new MessageEvent('dashboard',{data:'{}'}))));
 await expect(page.locator('.portfolio-balance h2')).toContainText('5.000,00');
 await expect(page.locator('.data-freshness')).toContainText('Daten aktuell');
});
